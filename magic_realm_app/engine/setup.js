import { makeRng } from './rng.js';
import { generateRealm, reachableFromBorderland } from './mapbuild.js';
import { shuffle, int, die, say } from './core.js';
import { makeItem, defOf, priceOf } from './items.js';
import { tileLetter } from './summon.js';
import { beginDay } from './day.js';
import { dealSpells } from './runes.js';
import { castable, ATTACK_SPELLS } from './spells.js';

// Building a new game (rules digest 01 section 3): map, chits, dwellings, denizens, treasure, then the character.

const VALLEY_TO_DWELLING = { Stink: 'Inn', Smoke: 'House', Dank: 'Chapel', Ruins: 'Guard house', Bones: 'Ghosts' };
const GARRISON = { Inn: 'Rogues', House: 'Soldiers', Chapel: 'Order', 'Guard house': 'Guard' };
const WARNING_NAMES = ['Bones', 'Dank', 'Ruins', 'Smoke', 'Stink'];

export function newGame(data, opts = {}) {
    const seed = opts.seed ?? 1;
    const st = {
        v: 1, seed, rng: ((seed * 2654435761) ^ 0x9e3779b9) >>> 0, mapKey: 'm' + seed,
        day: 1, mode: opts.mode ?? 'month', lastDay: opts.lastDay ?? 28, period: 'setup', prowl: 0, log: [], uidSeq: 0, over: null, score: null,
        placements: [], chits: [], piles: { lostCity: [], lostCastle: [] }, dwellings: [], garrisonAt: {},
        mons: [], nats: [], sites: {}, abandoned: {}, stock: {}, sitesOpen: {},
        ch: null, plan: null, turn: null, combat: null, pending: null,
    };
    const rng = makeRng(seed);
    st.placements = generateRealm(data.tiles, rng).placements;
    placeChits(st, data, rng);
    revealValleys(st, data);
    placeDenizens(st, data);
    setupTreasure(st, data);
    st.options = { knightsAdjustment: !!opts.options?.knightsAdjustment, watchfulNatives: !!opts.options?.watchfulNatives, quietMonsters: !!opts.options?.quietMonsters };
    st.startGear = { weapon: opts.startGear?.weapon ?? true, armor: opts.startGear?.armor ?? true };
    st.ch = makeCharacter(st, data, opts.character ?? 'black-knight', opts.vp, { gear: st.startGear, dwelling: opts.startDwelling, spells: opts.startSpells });
    st.ch.at = chooseStart(st, data, st.ch);
    st.ch.hidden = true;
    say(st, `${st.ch.name} begins at the ${st.ch.startDwelling}.`, 'day');
    beginDay(st, data);
    return st;
}

// ---- map chits ----
function placeChits(st, data, rng) {
    const A = data.appearance;
    let n = 0;
    const mk = c => ({ id: 'c' + (++n), up: false, clearing: null, summoned: false, pile: false, ...c });
    const warnings = [];
    for (const letter of ['V', 'W', 'C', 'M']) for (const name of WARNING_NAMES) warnings.push({ kind: 'warning', name, letter });
    const loose = [];
    for (const c of A.mapChits) {
        if (c.kind === 'sound') for (const num of c.numbers) loose.push({ kind: 'sound', name: c.name, num });
        else if (c.kind === 'site') loose.push({ kind: 'site', name: c.name, num: c.number });
    }
    const shuffled = rng.shuffle(loose);
    const lostCity = shuffled.slice(0, 5), lostCastle = shuffled.slice(5, 10), rest = shuffled.slice(10);
    const caveTiles = data.tiles.filter(t => t.group === 'cave').map(t => t.id);
    const mountTiles = data.tiles.filter(t => t.group === 'mountain').map(t => t.id);
    const caveChits = rng.shuffle([...rest.slice(0, 4).map(c => mk(c)), mk({ kind: 'lost-city', name: 'Lost City', num: 0 })]);
    const mountChits = rng.shuffle([...rest.slice(4, 8).map(c => mk(c)), mk({ kind: 'lost-castle', name: 'Lost Castle', num: 0 })]);
    caveTiles.forEach((t, i) => st.chits.push({ ...caveChits[i], tile: t }));
    mountTiles.forEach((t, i) => st.chits.push({ ...mountChits[i], tile: t }));
    for (const c of lostCity) { const x = mk(c); x.pile = true; x.tile = null; st.chits.push(x); st.piles.lostCity.push(x.id); }
    for (const c of lostCastle) { const x = mk(c); x.pile = true; x.tile = null; st.chits.push(x); st.piles.lostCastle.push(x.id); }
    const letterOf = g => ({ valley: 'V', woods: 'W', cave: 'C', mountain: 'M' }[g]);
    for (const letter of ['V', 'W', 'C', 'M']) {
        const tiles = data.tiles.filter(t => letterOf(t.group) === letter).map(t => t.id);
        const names = rng.shuffle(WARNING_NAMES);
        tiles.forEach((t, i) => st.chits.push(mk({ kind: 'warning', name: names[i], letter, tile: t })));
    }
}

function revealValleys(st, data) {
    const reach = reachableFromBorderland(data.tiles, st.placements);
    const gdata = data.tile;
    const valleys = st.chits.filter(c => c.kind === 'warning' && c.letter === 'V');
    for (const c of valleys) {
        c.up = true;
        const spot = reach.has(c.tile + 5) ? 5 : 4;
        const at = c.tile + spot;
        const what = VALLEY_TO_DWELLING[c.name];
        c.clearing = null;
        if (what === 'Ghosts') st.ghostsAt = at;
        else { st.dwellings.push({ kind: what, at, tile: c.tile }); st.garrisonAt[what] = at; }
    }
}

// ---- monsters and natives ----
function placeDenizens(st, data) {
    // Everything starts in its chart box. Garrison natives start at their dwelling. Ghosts start at the Bones valley.
    for (const m of Object.values(data.monsters)) {
        if (m.family === 'Ghost' || m.homeRow === 0) st.mons.push({ id: m.id, loc: { c: st.ghostsAt }, dead: false, hired: false });
        else st.mons.push({ id: m.id, loc: { box: m.homeBox }, dead: false, hired: false });
    }
    for (const n of Object.values(data.natives)) {
        const g = data.groups[n.group];
        const garrison = g.garrison;
        st.nats.push({ id: n.id, loc: garrison ? { c: st.garrisonAt[garrison] } : { box: g.id }, dead: false, hired: false, horseDead: false });
    }
}

// ---- treasure ----
function setupTreasure(st, data) {
    const S = data.setupcard, all = Object.values(data.treasures);
    const treasure = c => ({ kind: 'treasure', id: c.id });
    const twt = all.filter(t => t.kind === 'twt');
    let large = shuffle(st, all.filter(t => t.kind === 'large'));
    const small = shuffle(st, all.filter(t => t.kind === 'small'));
    // Treasure-within-Treasure boxes take their named large treasures first (digest 01 step 1).
    st.twt = {};
    for (const box of S.twt) {
        const card = twt.find(t => t.name === box.name);
        const got = large.splice(0, box.largeTreasures ?? 0);
        st.twt[card.id] = { name: box.name, large: got.map(treasure), contents: [...(box.contents ?? [])].sort((a, b) => (a.pilePosition ?? 99) - (b.pilePosition ?? 99)).map(c => ({ name: c.name, kind: c.kind })), gold: box.goldReward ?? 0, siteCard: !!box.siteCard, box: box.name };
    }
    const largePool = shuffle(st, [...large, ...twt]);
    for (const site of S.sites) {
        const smalls = small.splice(0, site.small ?? 0).map(treasure);
        const larges = largePool.splice(0, site.large ?? 0).map(treasure);
        // The card pile is listed top first: large treasures lie above small ones.
        st.sites[site.name] = [...larges, ...smalls];
    }
    // Each dwelling holds counters and two small treasures, and its natives sell them.
    for (const g of Object.values(data.groups)) st.stock[g.id] = [];
    const counters = [...Object.values(data.weapons), ...Object.values(data.armor), ...Object.values(data.horses)];
    const kindOf = d => (d.walk ? 'horse' : d.protects ? 'armor' : 'weapon');
    for (const dw of S.dwellings) {
        const list = st.stock[dw.group];
        for (const [name, count] of Object.entries(dw.treasures?.counters ?? {})) {
            const defs = counters.filter(c => c.name === name && (c.startBox === dw.rsName || c.startBox === dw.name) && !c.card);
            for (const d of defs.slice(0, count)) list.push({ kind: kindOf(d), id: d.id });
        }
        for (let i = 0; i < (dw.treasures?.small ?? 0); i++) list.push(treasure(small.shift()));
    }
    st.scholarGoods = small.splice(0, 3).map(treasure);
    dealSpells(st, data, shuffle);
}

// ---- character ----
// Optional rule 10.A.6.8 (Knights' Adjustment): the White Knight is only Friendly with the Order, the Black Knight with the Company.
function knightsRel(st, id, rel) {
    if (!st.options?.knightsAdjustment) return {};
    if (id === 'white-knight' && (rel.Order ?? 0) > 1) return { Order: 1 };
    if (id === 'black-knight' && (rel.Company ?? 0) > 1) return { Company: 1 };
    return {};
}

// The spells he starts with: the card says how many and of which types; of those, the ones this build can cast (data/src/spells.json).
// The player picks them (any spell of the allowed types: the card stays in the deck, so two characters may start with the same one); a pick that does
// not fit the card is ignored. With no pick, the first spells of those types that this build can cast.
const STARTER_SPELLS = ['make-whole', 'stones-fly', 'fiery-blast', 'lightning-bolt', 'control-bats'];
function startingSpells(data, c, chosen = null) {
    const want = c.stage4?.spellsKnown ?? 0, types = c.stage4?.spellTypes ?? [];
    const all = Object.values(data.spells ?? {});
    const okId = id => all.some(s => s.id === id && types.includes(s.type));
    if (Array.isArray(chosen) && chosen.length === want && chosen.every(okId) && new Set(chosen).size === chosen.length) return [...chosen];
    // the five spells the game started with come first, so that new handlers do not change what a character gets by default
    const first = id => { const k = STARTER_SPELLS.indexOf(id); return k < 0 ? STARTER_SPELLS.length : k; };
    return all.filter(s => castable(s) && types.includes(s.type)).map((s, i) => ({ s, i })).sort((a, b) => first(a.s.id) - first(b.s.id) || a.i - b.i).slice(0, want).map(x => x.s.id);
}

export function makeCharacter(st, data, id, vp, opt = {}) {
    const c = data.characters[id];
    const ch = {
        id, name: c.name, weight: c.weight, at: null, hidden: true, dead: false, gold: c.startGold ?? 10, fame: 0, notoriety: 0,
        chits: c.chits.map((x, i) => ({ id: `${id}-${i + 1}`, type: x.type, strength: x.strength, time: x.time, effort: x.effort ?? 0, state: 'active', stage: x.stage, numeral: x.magicNumeral ?? null })),
        items: [], rel: { ...c.relationships, ...knightsRel(st, id, c.relationships) }, discovered: { paths: [], sites: [] }, seen: [], hiddenEnemies: false, killsToday: 0,
        vp: vp ?? { great: 0, spells: 0, fame: 3, notoriety: 2, gold: 0 }, onRoad: null, startDwelling: opt.dwelling ?? c.startDwellings[0], startValue: 10,
        adv: (c.advantages ?? []).map(a => a.key), spells: startingSpells(data, c, opt.spells), learned: [],
    };
    // The starting weapon and armor are taken from the native group that owns them (never bought). A counter exists once: look in the
    // natives' stock, then lying on the ground; failing both he gets its price in gold instead.
    const take = (name, pool, kind) => {
        for (const list of Object.values(st.stock)) {
            const i = list.findIndex(x => x.kind === kind && pool[x.id]?.name === name);
            if (i >= 0) return list.splice(i, 1)[0];
        }
        for (const list of Object.values(st.abandoned)) {
            const i = list.findIndex(x => x.kind === kind && pool[x.id]?.name === name && !x.destroyed);
            if (i >= 0) { const g = list.splice(i, 1)[0]; return { kind, id: g.id }; }
        }
        if (st.deaths || st.gearSeen) {
            const def = Object.values(pool).find(d => d.name === name);
            if (def) ch.gold += (kind === 'armor' ? def.priceIntact : def.price) ?? 0;
            return null;
        }
        const def = Object.values(pool).find(d => d.name === name);       // the very first character: the Setup Card always has it
        return def ? { kind, id: def.id } : null;
    };
    // Which starting gear he is given is an option: the rules give his stage-4 weapon and armor; he may instead have to trade for them.
    const want = opt.gear ?? { weapon: true, armor: true };
    const gear = [];
    if (want.weapon) for (const w of c.stage4.weapons ?? []) gear.push(take(w, data.weapons, 'weapon'));
    if (want.armor) for (const a of c.stage4.armor ?? []) gear.push(take(a, data.armor, 'armor'));
    for (const g of gear.filter(Boolean)) { const it = makeItem(st, g.kind, g.id); it.active = true; ch.items.push(it); ch.startValue += priceOf(data, it); }
    return ch;
}

// A character who died may come back the next day as a fresh one at the Inn, with new goals (rules digest 01 section 7).
export function restartAfterDeath(st, data, vp) {
    const old = st.ch;
    if (!old.dead) throw new Error('your character is alive');
    if (st.day >= (st.lastDay ?? 28) && st.mode !== 'endless') throw new Error('the game is over');
    st.deaths = (st.deaths ?? 0) + 1;                      // from now on gear counters are never conjured from nothing
    const ch = makeCharacter(st, data, old.id, vp, { gear: st.startGear, dwelling: data.characters[old.id].startDwellings[0] });   // a new hero starts at the Inn
    ch.at = chooseStart(st, data, ch);
    ch.hidden = true;
    st.ch = ch;
    st.over = null; st.score = null; st.combat = null; st.plan = null; st.turn = null;
    st.day += 1;
    say(st, `A new ${ch.name} arrives at the ${ch.startDwelling}.`, 'day');
    beginDay(st, data);
    return st;
}

function chooseStart(st, data, ch) {
    const d = st.dwellings.find(x => x.kind === ch.startDwelling) ?? st.dwellings.find(x => x.kind === 'Inn');
    return d.at;
}
