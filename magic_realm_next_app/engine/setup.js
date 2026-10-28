import { makeRng } from './rng.js';
import { generateRealm, reachableFromBorderland } from './mapbuild.js';
import { shuffle, int, die, say } from './core.js';
import { makeItem, defOf, priceOf } from './items.js';
import { tileLetter } from './summon.js';
import { beginDay, beginChar } from './day.js';
import { dealSpells } from './runes.js';
import { castable, ATTACK_SPELLS } from './spells.js';
import { STATE_VERSION, hydrate, seat, withActor, DEFAULT_PLAYER } from './party.js';
import { setupVisitorChits } from './missions.js';

// Building a new game (rules digest 01 section 3): map, chits, dwellings, denizens, treasure, then the character.

const VALLEY_TO_DWELLING = { Stink: 'Inn', Smoke: 'House', Dank: 'Chapel', Ruins: 'Guard house', Bones: 'Ghosts' };
const GARRISON = { Inn: 'Rogues', House: 'Soldiers', Chapel: 'Order', 'Guard house': 'Guard' };
const WARNING_NAMES = ['Bones', 'Dank', 'Ruins', 'Smoke', 'Stink'];
export const MAX_CHARACTERS = 4;

export function newGame(data, opts = {}) {
    const seed = opts.seed ?? 1;
    const st = {
        v: STATE_VERSION, seed, rng: ((seed * 2654435761) ^ 0x9e3779b9) >>> 0, mapKey: 'm' + seed,
        day: 1, mode: opts.mode ?? 'month', lastDay: opts.lastDay ?? 28, period: 'setup', prowl: 0, log: [], uidSeq: 0, over: null, score: null,
        placements: [], chits: [], piles: { lostCity: [], lostCastle: [] }, dwellings: [], garrisonAt: {},
        mons: [], nats: [], sites: {}, abandoned: {}, stock: {}, sitesOpen: {},
        // the party (party.js): characters by id, their seating, who owns them, whose context the engine is in, the questions waiting
        players: [], chars: {}, order: [], actor: null, asks: [],
    };
    hydrate(st);                                      // from here on st.ch, st.pending, st.plan, st.turn and st.combat are the acting character's
    const rng = makeRng(seed);
    st.placements = generateRealm(data.tiles, rng).placements;
    placeChits(st, data, rng);
    revealValleys(st, data);
    placeDenizens(st, data);
    setupTreasure(st, data);
    if (opts.pauseEvening) st.pauseEvening = true;          // the game screen: a one-character evening ends on the question where he may rearrange his belongings (day.js eveningDone)
    if (opts.pauseGear) st.pauseGear = true;                // the game screen: a phase in which he came by a belonging ends on the question where he may activate, deactivate or abandon it (4.3.2, day.js gearPause)
    if (opts.pauseVictory) { st.pauseVictory = true; st.pauseShift = true; }          // the game screen: stop on a result screen and on the Bracelets / Cloak offer
    st.options = { knightsAdjustment: !!opts.options?.knightsAdjustment, watchfulNatives: !!opts.options?.watchfulNatives, quietMonsters: !!opts.options?.quietMonsters, ...(opts.options?.castAnytime ? { castAnytime: true } : {}) };       // (castAnytime is in the state only when on, so a game without it is exactly as it was)
    st.startGear = { weapon: opts.startGear?.weapon ?? true, armor: opts.startGear?.armor ?? true };
    if (opts.missions) setupVisitorChits(st, data, opts.missions);          // the visitor, mission and campaign chits (3.4, missions.js): only when asked for, so a game without them is as it was
    // One realm, one or several characters (2 to 4): each has his own gear, goals, start dwelling (a sealed choice from his card; the first listed by default) and spells.
    // `opts.characters` lists them; a game with `opts.character` is the one-character game it always was. A character's `owner` is the player who plays him (default: one
    // player, 'p1', plays them all: pass `owner` for several players).
    const roster = opts.characters?.length
        ? opts.characters.map(c => ({ ...c, id: c.id ?? c.character }))
        : [{ id: opts.character ?? 'black-knight', vp: opts.vp, startDwelling: opts.startDwelling, spells: opts.startSpells, owner: opts.owner, name: opts.playerName }];
    if (roster.length > MAX_CHARACTERS) throw new Error(`a game holds at most ${MAX_CHARACTERS} characters`);
    if (new Set(roster.map(c => c.id)).size !== roster.length) throw new Error('a character is in use by one player at a time');
    for (const c of roster) if (!data.characters[c.id]) throw new Error(`there is no character "${c.id}"`);
    const several = roster.length > 1;
    roster.forEach(r => {
        const ch = makeCharacter(st, data, r.id, r.vp, { gear: st.startGear, dwelling: r.startDwelling ?? r.dwelling, spells: r.spells ?? r.startSpells });
        seat(st, ch, { owner: r.owner ?? opts.owner ?? DEFAULT_PLAYER, name: r.playerName ?? r.name ?? opts.playerName ?? 'You' });
        ch.at = chooseStart(st, data, ch);
        ch.hidden = true;                                                   // every counter starts hidden at its dwelling (7.1.2, 3.6.4)
        if (several) st.gearSeen = true;                                    // a counter exists once: a later character whose starting gear is gone is given its price (makeCharacter)
        if (!several) say(st, `${ch.name} begins at the ${ch.startDwelling}.`, 'day');
    });
    if (several) for (const id of st.order) say(st, `${st.chars[id].name} begins at the ${st.chars[id].startDwelling}.`, 'day', null, { who: id });          // (once all are seated, so each line names its character)
    beginDay(st, data);
    return st;
}

// A second (or third) character joins a game whose first Birdsong is still open (nobody has recorded a plan): the same as listing him in `newGame`'s `characters`, for a caller
// that builds the party one seat at a time. He starts at his card's dwelling (or `opts.dwelling`), hidden, with a plan to record; the day waits for all of them (day.js, the barrier).
// Gear counters exist once in the world, so a later character whose starting weapon or armor is gone is given its price in gold instead (makeCharacter, `gearSeen`).
export function addCharacter(st, data, opts = {}) {
    const id = opts.character;
    if (!data.characters[id]) throw new Error(`there is no character "${id}"`);
    if (st.order.length >= MAX_CHARACTERS) throw new Error(`a game holds at most ${MAX_CHARACTERS} characters`);
    if (st.day !== 1 || st.period !== 'birdsong' || st.order.some(c => st.chars[c].today.plan)) throw new Error('a character can join only before anyone has recorded a plan on day 1');
    st.gearSeen = true;
    const ch = makeCharacter(st, data, id, opts.vp, { gear: st.startGear, dwelling: opts.dwelling, spells: opts.spells });
    seat(st, ch, { owner: opts.owner ?? DEFAULT_PLAYER, name: opts.playerName ?? 'You' });
    ch.at = chooseStart(st, data, ch);
    ch.hidden = true;
    for (const c of st.order) st.chars[c].today.stage ??= 'plan';           // (the first character joins the shared day too)
    say(st, `${ch.name} begins at the ${ch.startDwelling}.`, 'day', null, { who: id });
    withActor(st, id, () => beginChar(st, data));
    return ch;
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
    let large = shuffle(st, all.filter(t => t.kind === 'large'), 'setup.treasure.large');
    const small = shuffle(st, all.filter(t => t.kind === 'small'), 'setup.treasure.small');
    // Treasure-within-Treasure boxes take their named large treasures first (digest 01 step 1).
    st.twt = {};
    for (const box of S.twt) {
        const card = twt.find(t => t.name === box.name);
        const got = large.splice(0, box.largeTreasures ?? 0);
        st.twt[card.id] = { name: box.name, large: got.map(treasure), contents: [...(box.contents ?? [])].sort((a, b) => (a.pilePosition ?? 99) - (b.pilePosition ?? 99)).map(c => ({ name: c.name, kind: c.kind })), gold: box.goldReward ?? 0, siteCard: !!box.siteCard, box: box.name };
    }
    const largePool = shuffle(st, [...large, ...twt], 'setup.treasure.pool');
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
    // Rule 3.3.5: a hero starts at a dwelling his card lists (the first one by default). Anything else is refused, never sent to the Inn.
    const dwelling = opt.dwelling ?? c.startDwellings[0];
    if (!c.startDwellings.includes(dwelling)) throw new Error(`the ${c.name} may start only at ${c.startDwellings.join(' or ')}, not at "${dwelling}"`);
    const ch = {
        id, name: c.name, weight: c.weight, at: null, hidden: true, dead: false, gold: c.startGold ?? 10, fame: 0, notoriety: 0,
        chits: c.chits.map((x, i) => ({ id: `${id}-${i + 1}`, type: x.type, strength: x.strength, time: x.time, effort: x.effort ?? 0, state: 'active', stage: x.stage, numeral: x.magicNumeral ?? null })),
        items: [], rel: { ...c.relationships, ...knightsRel(st, id, c.relationships) }, discovered: { paths: [], sites: [] }, seen: [], hiddenEnemies: false, killsToday: 0,
        vp: vp ?? { great: 0, spells: 0, fame: 3, notoriety: 2, gold: 0 }, onRoad: null, startDwelling: dwelling, startValue: 10,
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
            if (def) { const price = (kind === 'armor' ? def.priceIntact : def.price) ?? 0; ch.gold += price; ch.startValue += price; }       // (the gold stands in for the gear: it is part of his starting value, not Gold earned)
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
// The goals a character is given: the five categories, each a whole number from 0 to 5, adding up to the budget (rule 3.3.6a: one point per week left, plus one).
export const VP_CATS = ['great', 'spells', 'fame', 'notoriety', 'gold'];
export function checkVp(vp, total) {
    const bad = VP_CATS.some(k => !Number.isInteger(vp?.[k] ?? 0) || (vp?.[k] ?? 0) < 0 || (vp?.[k] ?? 0) > 5) || Object.keys(vp ?? {}).some(k => !VP_CATS.includes(k));
    if (bad) throw new Error('each goal takes from 0 to 5 victory points');
    const sum = VP_CATS.reduce((a, k) => a + (vp?.[k] ?? 0), 0);
    if (total != null && sum !== total) throw new Error(`the goals must add up to exactly ${total} victory points (not ${sum})`);
}

export function restartAfterDeath(st, data, vp) {
    const old = st.ch;
    if (!old.dead) throw new Error('your character is alive');
    if (st.day >= (st.lastDay ?? 28) && st.mode !== 'endless') throw new Error('the game is over');
    if (vp) checkVp(vp, Math.max(2, Math.ceil(((st.lastDay ?? 28) - st.day) / 7) + 1));
    st.deaths = (st.deaths ?? 0) + 1;                      // from now on gear counters are never conjured from nothing
    const ch = makeCharacter(st, data, old.id, vp, { gear: st.startGear, dwelling: data.characters[old.id].startDwellings[0] });   // a new hero starts at the Inn
    ch.at = chooseStart(st, data, ch);
    ch.hidden = true;
    ch.owner = old.owner; ch.life = (old.life ?? 1) + 1;           // the same seat, the next life; his day carries over (assigning st.ch keeps `today`)
    st.ch = ch;
    st.over = null; st.score = null; st.combat = null; st.plan = null; st.turn = null;
    st.day += 1;
    say(st, `A new ${ch.name} arrives at the ${ch.startDwelling}.`, 'day');
    beginDay(st, data);
    return st;
}

// A character of a shared game who died begins again at the next Birdsong, without touching the calendar (rule 9.1.2, ruling R-9): any character not in use by another seat
// (the same one too), new goals for the weeks that are left, the dwelling his card lists first. The seat, the owner and the day record stay; the life count goes up.
// `character` names a different one; the seat then holds that character's id from here on.
export function restartChar(st, data, vp = null, character = null) {
    const old = st.ch, ask = st.pending;
    if (!old.dead) throw new Error('your character is alive');
    const id = character ?? old.id;
    if (!data.characters[id]) throw new Error(`there is no character "${id}"`);
    if (id !== old.id && st.order.includes(id)) throw new Error(`the ${data.characters[id].name} is in use by another player`);
    if (id !== old.id && ask?.pickOrder) {                 // several start again today: the die decided who chooses first (9.1.2b)
        const ahead = ask.pickOrder.slice(0, ask.pickOrder.indexOf(old.id)).filter(x => st.asks.some(a => a.who === x && a.pending.type === 'restart'));
        if (ahead.length) throw new Error(`wait: ${ahead.map(x => st.players?.find(p => p.id === st.chars[x]?.owner)?.name ?? x).join(' and ')} choose${ahead.length === 1 ? 's' : ''} first (the die decided); you may start again as the same character now`);
    }
    if (vp) checkVp(vp, ask?.budget ?? null);
    st.deaths = (st.deaths ?? 0) + 1;                      // from now on gear counters are never conjured from nothing
    const ch = makeCharacter(st, data, id, vp, { gear: st.startGear, dwelling: data.characters[id].startDwellings[0] });
    ch.at = chooseStart(st, data, ch);
    ch.hidden = true;
    ch.owner = old.owner; ch.life = (old.life ?? 1) + 1;
    if (old.policy) ch.policy = old.policy;                 // his standing choices about meetings are the player's (meet.js)
    if (id === old.id) st.ch = ch;                         // (assigning keeps the seat's day)
    else {
        const today = old.today, i = st.order.indexOf(old.id), p = st.players.find(x => x.id === old.owner);
        delete st.chars[old.id]; st.chars[id] = ch; ch.today = today; st.order[i] = id;
        if (p) p.chars[p.chars.indexOf(old.id)] = id;
        for (const a of st.asks) if (a.who === old.id) a.who = id;
        st.actor = id;
    }
    st.pending = null; st.combat = null; st.plan = null; st.turn = null;
    say(st, `A new ${ch.name} arrives at the ${ch.startDwelling}.`, 'day');
    beginChar(st, data);
    return st;
}

function chooseStart(st, data, ch) {
    // ruling S9 (Mike, 2026-10-26): a character whose card lists the Ghosts (the Witch King) may start in the clearing where the two Ghosts stand, with the Bones valley piece (3.3.5, 3.6.2a)
    if (ch.startDwelling === 'Ghosts' && st.ghostsAt) return st.ghostsAt;
    const d = st.dwellings.find(x => x.kind === ch.startDwelling) ?? st.dwellings.find(x => x.kind === 'Inn');
    return d.at;
}
