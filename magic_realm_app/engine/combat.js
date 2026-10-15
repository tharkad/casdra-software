import { lvl, letterOf, die, roll2, shuffle, say, int, noteRoll, tally, WEIGHT_WORDS } from './core.js';
import { REPOSITION, MISSILE, clamp6, meetingResult, DIRS, MANEUVERS } from './tables.js';
import { pit } from './effects.js';
import { hirelings } from './hire.js';
import { cardChits, effortLimit, oneDie } from './modifiers.js';
import { blockedSpells, castOptions, castSpell, resolveSpells, canCastUsefully } from './spells.js';
import { tell } from './story.js';
import { meetingOutcome, hasAdv, drinksCost } from './meeting.js';
import { makeItem, autoEquip, toggleItem, activeHorse } from './items.js';
import { isCave, roadsFrom } from './world.js';

// Evening combat for one character against the denizens in his clearing (rules digest 03).
// The combat is a small state machine stored in st.combat; the UI reads st.pending and answers with actions:
//   encounter  -> encounterAction(st, data, { act: 'pass'|'alert'|'run', chit?, to? })
//   melee      -> meleePlay(st, data, { target, fightChit, attackDir, moveChit, moveDir, shieldDir, boxes })
//   wounds     -> chooseWounds(st, data, [chitIds])
//   fatigue    -> chooseFatigue(st, data, [chitIds])
//   pay        -> payOrFight(st, data, true|false)

const DIR_OF_BOX = [0, 1, 2];

// ---- who is what ----
export function weaponOf(st, data) {
    const it = st.ch.items.find(i => i.kind === 'weapon' && i.active);
    return it ? { item: it, def: data.weapons[it.id] } : null;
}
export function weaponSide(w) {
    if (!w) return { harm: 'N', stars: 1, time: null, length: 0, missile: false, none: true };       // bare Fight chit: Negligible with one star
    const side = w.item.alerted ? w.def.alerted : w.def.unalerted;
    return { harm: side.harm ?? w.def.weight, stars: side.stars ?? 0, time: side.attackTime ?? null, length: w.def.length ?? 0, missile: !!w.def.missile };
}
export function activeArmor(st, data) {
    return st.ch.items.filter(i => i.kind === 'armor' && i.active && !i.destroyed).map(i => ({ item: i, def: data.armor[i.id] }));
}
// Armor that can take a blow in tie group g: pieces in use, plus any destroyed by an equally fast blow of the same group.
function armorForBlow(st, data, g) {
    return st.ch.items.filter(i => i.kind === 'armor' && ((i.active && !i.destroyed) || i.destroyedGroup === g)).map(i => ({ item: i, def: data.armor[i.id] }));
}
export function carriedWeight(st, data) {
    let w = 0;
    for (const it of st.ch.items) {
        if (it.destroyed) continue;                      // destroyed armor is no longer carried
        const def = it.kind === 'weapon' ? data.weapons[it.id] : it.kind === 'armor' ? data.armor[it.id] : it.kind === 'horse' ? null : data.treasures[it.id];
        if (!def || def.weight == null) continue;
        w = Math.max(w, lvl(def.weight));
    }
    return w;
}
// Armor coverage by attack direction index (0 thrust, 1 swing, 2 smash).
function coversDir(def, dir) {
    return (def.protects ?? []).includes(['thrust', 'swing', 'smash'][dir]);       // a shield protects only its chosen direction (handled separately)
}
const isShield = def => (def.type ?? '').toLowerCase() === 'shield' || !!def.chooseOneDirection;

// ---- denizen sides ----
export function denSide(st, data, den) {
    if (den.kind === 'mon') {
        const m = data.monsters[den.id];
        const s = den.side === 'red' && m.red ? { ...m.red, length: m.red.length ?? 0, attack: 'weapon' } : (den.side === 'dark' && m.dark ? m.dark : m.light);
        return { name: m.name + (den.tag ? ` #${den.tag}` : ''), size: m.size, vuln: m.vulnerability, armored: !!m.armored, harm: s.harm, stars: s.stars ?? 0, atk: s.attackTime, move: s.moveTime,
            length: s.length ?? m.light.length ?? 0, attack: s.attack ?? 'weapon', spell: s.spell, fame: m.fame ?? 0, notor: m.notoriety ?? 0, gold: 0, tremendous: !!m.red };
    }
    if (den.kind === 'part') {
        const owner = st.combat.dens.find(d => d.uid === den.partOf);
        const m = data.monsters[owner.id], p = m.parts.find(x => x.id === den.id);
        const s = p[den.side === 'dark' ? 'dark' : 'light'];
        const tag = owner.tag ? ` #${owner.tag}` : '';
        return { name: (p.name ? `${m.name}${tag} ${p.name}` : `${m.name}${tag}`), size: m.size, vuln: null, armored: false, harm: s.harm, stars: s.stars ?? 0, atk: s.attackTime,
            move: null, length: s.length ?? 0, attack: 'weapon', part: true };
    }
    if (den.kind === 'nat') {
        const n = data.natives[den.id];
        const s = den.side === 'dark' ? n.dark : n.light;
        const atk = s.attackTime, none = s.harm == null || s.attackTime == null;
        return { name: n.name, size: n.weight, vuln: n.vulnerability, armored: !!n.armored, harm: s.harm, stars: s.stars ?? 0, atk, move: s.moveTime,
            length: n.weapon?.length ?? 0, attack: none ? 'none' : (n.weapon?.missile ? 'missile' : 'weapon'), fame: n.fameBounty ?? 0, notor: n.notorietyBounty ?? 0, gold: n.goldBounty ?? 0, leader: !!n.leader, type: n.type, group: n.group };
    }
    if (den.kind === 'horse') {
        const n = data.natives[den.owner], h = n.horse;
        const s = h[st.combat.melee ? 'dark' : 'light'];
        return { name: h.name, size: s.vulnerability, vuln: s.vulnerability, armored: h.name === 'Warhorse', harm: null, atk: null, move: s.moveTime, length: 0, attack: 'none', horse: true };
    }
    throw new Error('unknown denizen kind ' + den.kind);
}

// ---- starting a combat ----
const nextUid = st => { st.uidSeq = (st.uidSeq ?? 0) + 1; return 'd' + st.uidSeq; };

export function denizensIn(st, data, clearing) {
    const out = [];
    for (const m of st.mons) if (!m.dead && !m.hired && m.loc?.c === clearing) out.push({ kind: 'mon', id: m.id });
    return out;
}
export function nativesIn(st, data, clearing) {
    return st.nats.filter(n => !n.dead && !n.hired && n.loc?.c === clearing);
}

export function startCombat(st, data, clearing) {
    const c = st.combat = { at: clearing, round: 1, quiet: 0, step: 'start', dens: [], battling: {}, events: [], melee: false, ended: false, ran: false, pays: [], rollFrom: st.rollSeq ?? 0 };
    c.hires = hirelings(st).filter(n => n.loc?.c === clearing).map(n => ({ uid: nextUid(st), id: n.id, dead: false }));
    for (const m of denizensIn(st, data, clearing)) { addDen(st, data, { kind: 'mon', id: m.id }); tally(st, `faced.${data.monsters[m.id].name}`); }
    c.intro = introLines(st, data, c);
    // Natives roll the Meeting Table once per group present, to see whether the group battles him (he may buy drinks first).
    c.meetQueue = [...new Set(nativesIn(st, data, clearing).map(n => data.natives[n.id].group))];
    return nextMeeting(st, data);
}

// How this fight came about, in the order the player would want it explained: how each creature got here, and how he stood when evening fell.
function introLines(st, data, c) {
    const te = st.turnEnd && st.turnEnd.day === st.day ? st.turnEnd : null;
    const lines = [];
    // creatures that came the same way are told together: "The two Heavy Flying Dragons (#1 and #2) answered the call of the Smoke ..."
    const groups = new Map();
    for (const d of c.dens.filter(x => x.kind === 'mon')) {
        const a = te?.arrivals?.find(x => x.id === d.id);
        const cause = !a ? 'was already in this clearing'
            : a.why === 'prowls in your tile' ? 'was prowling elsewhere in this tile and came to your clearing when your turn ended'
                : `answered the call of ${a.why.replace(/^called by /, 'the ')}, which turned up when your turn ended`;
        (groups.get(cause) ?? groups.set(cause, []).get(cause)).push(d);
    }
    const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const plural = n => (/wolf$/i.test(n) ? n.replace(/wolf$/i, 'Wolves') : /s$/i.test(n) ? n : `${n}s`);
    for (const [cause, list] of groups) {
        const plain = list.map(d => denSide(st, data, d).name);
        const bases = [...new Set(list.map(d => data.monsters[d.id].name))];
        let subject;
        if (list.length === 1) subject = `The ${plain[0]}`;
        else if (bases.length === 1) subject = `The ${NUM[list.length] ?? list.length} ${plural(bases[0])} (${list.map(d => `#${d.tag}`).join(' and ').replace(/ and (?=#\d+ and )/g, ', ')})`;
        else subject = `The ${plain.join(', ').replace(/, ([^,]+)$/, ' and $1')}`;
        lines.push(`${subject} ${list.length > 1 ? cause.replace(/^was /, 'were ').replace(/^answered/, 'answered') : cause}.`);
    }
    if (te?.blocked) lines.push(te.blockers?.length ? `Your turn was cut short: ${[...new Set(te.blockers)].join(', ')} blocked you.` : 'Your turn was cut short.');
    lines.push(st.ch.hidden ? 'You are hidden, so creatures cannot be set on you unless you give yourself away.' : 'You are in plain sight, so the creatures here will come for you.');
    return lines;
}

function nextMeeting(st, data) {
    const c = st.combat;
    while (c.meetQueue.length) {
        const g = c.meetQueue[0], cost = drinksCost(st, data, g);
        if (relOf(st, g) < 1 && cost > 0 && st.ch.gold >= cost && !(st.ch.curses ?? []).includes('Ashes')) {
            c.step = 'drinks';
            st.pending = { type: 'combat-drinks', group: g, cost };
            return;
        }
        c.meetQueue.shift();
        rollBattle(st, data, g);
    }
    // natives who are not battling him stand by: he may still pick a fight with them
    for (const n of nativesIn(st, data, c.at)) if (!c.dens.some(d => d.kind === 'nat' && d.id === n.id)) addDen(st, data, { kind: 'nat', id: n.id }).bystander = true;
    if (!c.pays.length) return enterEncounter(st, data);
    c.step = 'pay';
    st.pending = { type: 'combat-pay', ...c.pays[0] };
}

// Rule 8.2.2a: before the evening Meeting roll he may pay one gold a head to make the group one level friendlier.
export function drinksAction(st, data, buy) {
    const c = st.combat;
    if (c.step !== 'drinks') throw new Error('nobody is offering drinks now');
    const g = c.meetQueue.shift(), cost = drinksCost(st, data, g);
    st.pending = null;
    if (buy) {
        if (st.ch.gold < cost) throw new Error('not enough gold');
        st.ch.gold -= cost;
        say(st, `You buy drinks for the ${g} (${cost} gold): they warm to you.`, 'combat');
    }
    rollBattle(st, data, g, buy);
    return nextMeeting(st, data);
}

// Evening with only peaceful natives about: he decides whether to attack them (any one of them, which brings its whole group in).
export function choiceAction(st, data, fight) {
    const c = st.combat;
    if (c.step !== 'choice') throw new Error('there is no choice to make');
    c.choiceMade = true;
    if (!fight) {
        say(st, 'You let the natives be.', 'combat');
        if (canCastUsefully(st, data)) return enterSpellOnly(st, data);
        c.ended = true; c.why = 'quiet'; c.step = 'done'; st.pending = null; return;
    }
    enterEncounter(st, data);
}

function addDen(st, data, d) {
    const den = { uid: nextUid(st), kind: d.kind, id: d.id, side: 'light', box: null, assigned: false, dead: false, pickedUp: false, partOf: d.partOf ?? null, owner: d.owner ?? null, tag: null };
    st.combat.dens.push(den);
    if (d.kind === 'mon') {
        // several of the same creature: "Heavy Spider #1", "Heavy Spider #2", so they can be told apart everywhere they are named
        const same = st.combat.dens.filter(x => x.kind === 'mon' && data.monsters[x.id].name === data.monsters[d.id].name);
        if (same.length > 1) same.forEach((x, i) => { x.tag = i + 1; });
        const m = data.monsters[d.id];
        for (const p of m.parts ?? []) addDen(st, data, { kind: 'part', id: p.id, partOf: den.uid });
    }
    if (d.kind === 'nat') {
        const n = data.natives[d.id];
        const alive = st.nats.find(x => x.id === d.id);
        if (n.horse && !alive.horseDead) addDen(st, data, { kind: 'horse', id: d.id + '-horse', owner: d.id, partOf: den.uid });
    }
    return den;
}

function relOf(st, group) { return st.ch.rel?.[group] ?? 0; }

// A missile roll (one die for archers, otherwise two): returns the change to harm level and notes the roll for the dice tray.
function missileRoll(st, what, archer) {
    const r = archer ? (() => { const d = die(st); return { dice: [d], value: d }; })() : roll2(st);
    const m = MISSILE[r.value - 1];
    noteRoll(st, what, r.dice, r.value, `${m >= 0 ? '+' : ''}${m} harm level${Math.abs(m) === 1 ? '' : 's'}`);
    return m;
}

function rollBattle(st, data, group, drinks = false) {
    const c = st.combat;
    // Each Meeting roll (and any Trouble or Opportunity re-roll) is noted in the dice tray and the log by meetingOutcome.
    const { res } = meetingOutcome(st, relOf(st, group) + (drinks ? 1 : 0), `Evening meeting with the ${group}`, data);
    (c.intro ??= []).push(res === 'Block/Battle' ? `The ${group} met you with hostility and will fight.` : res === 'Insult' || res === 'Challenge' ? `The ${group} ${res === 'Insult' ? 'insulted' : 'challenged'} you: pay or fight.` : `The ${group} are here, and let you be.`);
    if (res === 'Block/Battle') return startBattling(st, data, group);
    if (res === 'Insult') c.pays.push({ group, cost: 'notoriety', amount: 5, why: 'Insult' });
    else if (res === 'Challenge') { if ((st.ch.curses ?? []).includes('Disgust')) startBattling(st, data, group); else c.pays.push({ group, cost: 'fame', amount: 5, why: 'Challenge' }); }
}

function startBattling(st, data, group) {
    const c = st.combat;
    if (c.battling[group]) return;
    c.battling[group] = true;
    for (const n of nativesIn(st, data, c.at)) {
        if (data.natives[n.id].group !== group) continue;
        const den = c.dens.find(d => d.kind === 'nat' && d.id === n.id);
        if (den) den.bystander = false; else addDen(st, data, { kind: 'nat', id: n.id });
    }
    say(st, `The ${group} will fight you.`, 'combat');
}

export function payOrFight(st, data, pay) {
    const c = st.combat, p = c.pays.shift();
    if (pay) {
        if (p.cost === 'notoriety') st.ch.notoriety -= p.amount; else st.ch.fame -= p.amount;
        say(st, `You pay ${p.amount} ${p.cost} to avoid the ${p.why.toLowerCase()} from the ${p.group}.`, 'combat');
    } else startBattling(st, data, p.group);
    if (c.pays.length) { st.pending = { type: 'combat-pay', ...c.pays[0] }; return; }
    enterEncounter(st, data);
}

// ---- encounter step ----
function assignAll(st, data) {
    const c = st.combat;
    if (st.ch.hidden) return;
    for (const d of c.dens) if (!d.dead && !d.assigned && !d.bystander && d.kind !== 'part' && d.kind !== 'horse') d.assigned = true;
}

// His own horse is played like a Move chit, either side up (walking or galloping), whichever he can use; it is played once a round.
function horseChits(st, data) {
    const h = activeHorse(st);
    if (!h || isCave(st, data, st.ch.at)) return [];
    if (st.combat?.dens?.some(d => d.pickedUp && !d.dead)) return [];       // a red-side Tremendous monster holds him: no horse play (8.4.7 d.2)
    const d = data.horses[h.id];
    if (!d) return [];
    return [['walk', d.walk], ['gallop', d.gallop]].map(([side, x]) => ({ id: `horse:${h.uid}:${side}`, horseUid: h.uid, side, type: 'move', strength: x.strength, time: x.moves, effort: 0, state: 'active', card: true, isHorse: true, name: `${d.name} (${side === 'walk' ? 'walking' : 'galloping'})` }));
}

function activeChits(st, type, data) {
    const real = st.ch.chits.filter(x => x.state === 'active' && (!type || x.type === type));
    const cards = type ? cardChits(st, type) : [...cardChits(st, 'move'), ...cardChits(st, 'fight')];
    const horse = (!type || type === 'move') && data ? horseChits(st, data) : [];
    return [...real, ...cards, ...horse].filter(x => !st.combat.played?.[x.id] && !(x.isHorse && st.combat.played?.['horse:' + x.horseUid]));
}

function enterEncounter(st, data) {
    const c = st.combat;
    const live = c.dens.filter(d => !d.dead && d.kind !== 'part' && d.kind !== 'horse');
    if (!live.length) {
        if (canCastUsefully(st, data)) return enterSpellOnly(st, data);
        c.ended = true; c.why = 'quiet'; c.step = 'done'; st.pending = null;
        say(st, 'Nothing here wants a fight.', 'combat');
        return;
    }
    if (!c.choiceMade && live.every(d => d.bystander)) {
        c.step = 'choice';
        st.pending = { type: 'combat-choice', groups: [...new Set(live.map(d => data.natives[d.id].group))] };
        return;
    }
    c.melee = false;
    c.played = {};
    c.asterisks = { move: 0, fight: 0, magic: 0 };
    c.casts = [];
    c.step = 'encounter';
    assignAll(st, data);
    deployHires(st, data);
    st.pending = { type: 'combat-encounter', round: c.round };
}

// Nothing is fighting him, but there is a spell worth casting: the Encounter step is held so that he may cast it (rule 8.8.3: combat is held
// every evening a spell could be cast). Casting, or passing, ends it.
function enterSpellOnly(st, data) {
    const c = st.combat;
    c.melee = false; c.played = {}; c.asterisks = { move: 0, fight: 0, magic: 0 }; c.casts = [];
    c.spellOnly = true;
    c.step = 'encounter';
    st.pending = { type: 'combat-encounter', round: c.round, spellOnly: true };
}

// Hirelings go for the most dangerous creature; a creature set on by a hireling fights it instead of the character.
function deployHires(st, data) {
    const c = st.combat;
    for (const d of c.dens) d.engagedBy = null;
    const crew = (c.hires ?? []).filter(x => !x.dead);
    for (const hire of crew) {
        const cand = c.dens.filter(d => !d.dead && !d.bystander && d.kind !== 'part' && d.kind !== 'horse' && !d.pickedUp);
        if (!cand.length) break;
        const free = cand.filter(d => !d.engagedBy);
        const pool = free.length ? free : cand;
        pool.sort((a, b) => lvl(denSide(st, data, b).harm ?? 'N') - lvl(denSide(st, data, a).harm ?? 'N'));
        const t = pool[0];
        t.engagedBy ??= hire.uid;
        t.assigned = false;
        hire.target = t.uid;
    }
}

// What the UI may offer in the encounter step.
// Where he may run to: any road he knows, but back along the road he came by if he moved into this clearing today (rule 8.3.8).
export function runDestinations(st, data) {
    const roads = roadsFrom(st, data, st.ch.at).filter(r => r.usable).map(r => r.to);
    const from = st.ch.arrivedFrom;
    return from ? roads.filter(to => to === from) : roads;
}

export function encounterOptions(st, data) {
    const c = st.combat, w = weaponOf(st, data);
    const dens = c.dens.filter(d => d.assigned && !d.dead && d.kind !== 'part' && d.kind !== 'horse');
    const speedOf = d => {
        const horse = c.dens.find(h => h.kind === 'horse' && h.partOf === d.uid && !h.dead);
        return horse ? (denSide(st, data, horse).move ?? 99) : (denSide(st, data, d).move ?? 99);
    };
    const slowest = dens.length ? Math.min(...dens.map(speedOf)) : 99;     // chits must be strictly faster than every denizen
    const pickedUp = dens.some(d => d.pickedUp);
    const wlvl = w ? lvl(data.weapons[w.item.id].weight) : 0;
    const fight = activeChits(st, 'fight', data).filter(x => x.time < slowest && lvl(x.strength) >= wlvl);
    const load = carriedWeight(st, data);
    const move = activeChits(st, 'move', data).filter(x => x.time < slowest && lvl(x.strength) >= (x.isHorse ? Math.max(load, lvl(st.ch.weight)) : load));
    // hidden, and nothing is on his sheet (denizens cannot be assigned to a hidden character): nothing can attack him, so he may simply let the evening pass
    const canStay = !!st.ch.hidden && !c.dens.some(d => !d.dead && (d.assigned || d.engagedBy || d.pickedUp)) && !(c.hires ?? []).some(x => !x.dead);
    return { canStay, casts: castOptions(st, data), blocked: blockedSpells(st, data), canAlert: !!w && fight.length > 0, alertChits: fight, canRun: !pickedUp && move.length > 0 && runDestinations(st, data).length > 0, runChits: move, pickedUp, weapon: w, runTo: runDestinations(st, data) };
}

export function encounterAction(st, data, a) {
    const c = st.combat;
    if (c.step !== 'encounter') throw new Error('not in the encounter step');
    if (c.spellOnly) {
        // only a spell can be cast; anything else is a pass
        if (a.act === 'gear') {
            const it = st.ch.items.find(i => i.uid === a.item);
            if (!it) throw new Error('no such item');
            toggleItem(st, data, it);
            say(st, `You ${it.active ? 'activate' : 'deactivate'} the ${nameOfItem(st, data, it)}.`, 'combat');
            return;
        }
        if (a.act === 'cast') { castSpell(st, data, a.spell, a.chit); resolveSpells(st, data); }
        c.spellOnly = false;
        return endCombat(st, data, 'quiet');
    }
    const opt = encounterOptions(st, data);
    if (a.act === 'cast') {
        castSpell(st, data, a.spell, a.chit);
        return enterMelee(st, data);
    }
    if (a.act === 'stay') {
        if (!opt.canStay) throw new Error('you are not hidden from everything here');
        say(st, 'You stay hidden. Nothing here can find you, and the evening passes without a blow.', 'combat');
        return endCombat(st, data, 'quiet');
    }
    if (a.act === 'gear') {
        // Without playing a chit he may switch one item on or off.
        const it = st.ch.items.find(i => i.uid === a.item);
        if (!it) throw new Error('no such item');
        toggleItem(st, data, it);
        say(st, `You ${it.active ? 'activate' : 'deactivate'} the ${nameOfItem(st, data, it)}.`, 'combat');
    } else if (a.act === 'alert') {
        const chit = opt.alertChits.find(x => x.id === a.chit);
        if (!opt.weapon || !chit) throw new Error('cannot flip the weapon with that chit');
        playChit(st, chit);
        opt.weapon.item.alerted = !opt.weapon.item.alerted;
        say(st, `You turn your ${data.weapons[opt.weapon.item.id].name} ${opt.weapon.item.alerted ? 'alerted' : 'unalerted'}.`, 'combat');
    } else if (a.act === 'run') {
        const chit = opt.runChits.find(x => x.id === a.chit);
        if (!chit) throw new Error('cannot run with that chit');
        const dests = runDestinations(st, data);
        if (!dests.length) throw new Error('there is nowhere to run');
        if (a.to != null && !dests.includes(a.to)) throw new Error(st.ch.arrivedFrom ? 'you can only run back along the road you came by' : 'you can only run along a road you know');
        playChit(st, chit);
        c.ran = true;
        st.ch.runTo = a.to ?? dests[0];
        say(st, 'You break away from the fight.', 'combat');
        return toFatigue(st, data);
    } else if (a.act !== 'pass') throw new Error('unknown encounter action');
    enterMelee(st, data);
}

function playChit(st, chit) {
    const c = st.combat;
    c.played[chit.id] = true;
    if (chit.isHorse) c.played['horse:' + chit.horseUid] = true;       // one side of the horse a round
    if (chit.effort) c.asterisks[chit.type === 'move' ? 'move' : 'fight'] += chit.effort;
}

function nameOfItem(st, data, it) {
    return (it.kind === 'weapon' ? data.weapons[it.id] : it.kind === 'armor' ? data.armor[it.id] : it.kind === 'horse' ? data.horses[it.id] : data.treasures[it.id])?.name ?? it.id;
}

// ---- melee step: collect his secret plays ----
function enterMelee(st, data) {
    const c = st.combat;
    c.melee = true;
    c.step = 'melee';
    st.pending = { type: 'combat-melee', round: c.round };
}

export function meleeOptions(st, data) {
    const c = st.combat, w = weaponOf(st, data), load = carriedWeight(st, data);
    const targets = c.dens.filter(d => !d.dead && d.kind !== 'part' && d.kind !== 'horse');
    const wlvl = w ? lvl(data.weapons[w.item.id].weight) : 0;
    const assigned = targets.filter(d => d.assigned);
    const attackers = c.dens.filter(d => !d.dead && (d.assigned || d.partOf && c.dens.find(o => o.uid === d.partOf)?.assigned) && denSide(st, data, d).attack !== 'none' || false);
    return {
        targets,
        assigned,
        attackSpell: c.attackSpell ?? null,
        fightChits: c.attackSpell ? [] : activeChits(st, 'fight', data),           // a character who cast an attack spell cannot also swing a weapon (8.4.5a)
        moveChits: activeChits(st, 'move', data),
        fightOk: ch => lvl(ch.strength) >= wlvl,
        moveOk: ch => lvl(ch.strength) >= (ch.isHorse ? Math.max(load, lvl(st.ch.weight)) : load),
        shield: activeArmor(st, data).find(a => isShield(a.def)) ?? null,
        weapon: w,
        asterisksPlayed: c.asterisks.move + c.asterisks.fight + (c.asterisks.magic ?? 0),
        // everything that will sit in the red boxes: assigned denizens and their parts
        boxable: c.dens.filter(d => !d.dead && d.kind !== 'horse' && (d.assigned || (d.partOf && c.dens.find(o => o.uid === d.partOf)?.assigned))),
    };
}

export function meleePlay(st, data, p) {
    const c = st.combat;
    if (c.step !== 'melee') throw new Error('not in the melee step');
    const o = meleeOptions(st, data);
    const w = o.weapon, notes = [];
    c.roundRollFrom = st.rollSeq ?? 0;            // the dice tray in the fight shows this round's rolls only
    c.killed = [];                                  // what he killed this round, for the screen to lead with
    const ev = c.events = [];
    const log = (t, story) => { ev.push(story ?? t); say(st, t, 'combat', story ?? null); };
    const weaponName = w ? nameOfItem(st, data, w.item) : 'bare hands';
    // --- validate and apply chit plays ---
    let fight = null, move = null;
    if (p.fightChit) {
        fight = o.fightChits.find(x => x.id === p.fightChit);
        if (!fight) throw new Error('that Fight chit is not available');
        if (!o.fightOk(fight)) throw new Error('that Fight chit is too weak for your weapon');
    }
    if (p.moveChit) {
        move = o.moveChits.find(x => x.id === p.moveChit);
        if (!move) throw new Error('that Move chit is not available');
        if (!o.moveOk(move)) throw new Error('that Move chit is too weak to carry your gear');
    }
    const ast = o.asterisksPlayed + (fight?.effort ?? 0) + (move?.effort ?? 0);
    if (ast > effortLimit(st)) throw new Error(`at most ${effortLimit(st)} effort asterisks may be played in a round`);
    if (fight) playChit(st, fight);
    if (move) playChit(st, move);
    resolveSpells(st, data, log);
    // --- target and unhide ---
    let target = p.target ? c.dens.find(d => d.uid === p.target && !d.dead) : null;
    const wasHidden = st.ch.hidden;
    c.toRed = [];
    if (st.ch.hidden && target) { st.ch.hidden = false; log('You strike from hiding and are revealed.', tell.ambush(st)); }
    if (target && !target.assigned) {
        // attacking an unassigned denizen makes it fight back; attacking a native brings its whole group in
        if (target.kind === 'nat') {
            // the group begins to battle him at once, but nobody was assigned to answer this round: no blow comes back until the next
            startBattling(st, data, data.natives[target.id].group);
            // (with the optional Watchful Natives rule, 10.B.4, the group answers in the same round)
            if (!st.options?.watchfulNatives) for (const d of c.dens) if (d.kind === 'nat' && data.natives[d.id].group === data.natives[target.id].group || d.partOf === target.uid) { d.noRetaliation = true; d.noWhy = 'joins'; }
        }
        target.assigned = true;
        if (wasHidden) { target.noRetaliation = true; target.noWhy = 'hidden'; }          // a hidden character gets a free first blow
    }
    // A character who was hidden strikes first; only the one he struck is on his sheet this round.
    const boxableNow = c.dens.filter(d => !d.dead && d.kind !== 'horse' && (d.assigned || (d.partOf && c.dens.find(x => x.uid === d.partOf)?.assigned)));

    // --- place denizens in the three red boxes (he chooses, then the dice move them) ---
    const boxable = boxableNow;
    placeInBoxes(st, data, boxable, p.boxes ?? {});
    // native horses sit in a box other than their rider's
    for (const h of c.dens.filter(d => d.kind === 'horse' && !d.dead)) {
        const owner = c.dens.find(d => d.uid === h.partOf);
        if (!owner || owner.dead || !owner.assigned) { h.box = null; continue; }
        h.box = (owner.box + 1 + int(st, 2)) % 3;
    }

    for (const d of c.dens) if (d.engagedBy && !d.dead) d.box = (die(st) - 1) % 3;   // creatures fighting hirelings sit in a random box
    const boxBefore = new Map(c.dens.map(d => [d.uid, d.box]));
    // --- reposition and change tactics ---
    const rr = die(st), perm = REPOSITION[rr];
    noteRoll(st, 'Repositioning roll', [rr], rr, rr === 4 ? 'no change' : 'the creatures shuffle between boxes');
    const inBox = b => c.dens.filter(d => !d.dead && d.box === b);
    const old = [inBox(0), inBox(1), inBox(2)];
    for (let nb = 0; nb < 3; nb++) for (const d of old[perm[nb]]) d.box = nb;
    // A shuffle is told creature by creature just below, so only the journal gets the roll itself; "nothing shifts" is worth saying.
    if (rr === 4) log(`Repositioning roll: ${rr} (no change).`, tell.hold(st));
    else say(st, `Repositioning roll: ${rr}.`, 'combat');
    {
        const moved = c.dens.filter(d => !d.dead && d.box != null && boxBefore.get(d.uid) != null && boxBefore.get(d.uid) !== d.box && d.kind !== 'horse');
        moved.forEach((d, i) => log(`  ${denSide(st, data, d).name} ${MANEUVERS[boxBefore.get(d.uid)]} \u2192 ${MANEUVERS[d.box]}.`, tell.moved(st, denSide(st, data, d).name, MANEUVERS[boxBefore.get(d.uid)], MANEUVERS[d.box], i)));
    }
    for (let b = 0; b < 3; b++) {
        const here = c.dens.filter(d => !d.dead && d.box === b && canFlip(st, data, d));
        if (!here.length) continue;
        const t = roll2(st);
        noteRoll(st, `Tactics roll (${MANEUVERS[b]} box)`, t.dice, t.value, t.dice.includes(6) ? 'a 6: they switch sides' : 'no change');
        if (t.dice.includes(6)) {
            for (const d of here) d.side = d.side === 'light' ? 'dark' : 'light';
            log(`Tactics change in the ${MANEUVERS[b]} box (rolled ${t.dice.join('+')}): ${here.map(d => denSide(st, data, d).name).join(', ')} switch sides.`, tell.flipped(st, MANEUVERS[b], here.map(d => denSide(st, data, d).name).join(' and ')));
        }
    }

    // --- hit determination ---
    const myDir = p.attackDir, mnvDir = p.moveDir;
    const mySide = weaponSide(w);
    const attackTime = fight ? (mySide.time ?? fight.time) : null;
    const hits = [];            // { who:'me'|denUid, order keys }
    // An attack spell attacks from the attack circle like a weapon, once per hit it makes, each with its own Missile Table roll.
    if (c.attackSpell && target && myDir != null) {
        const sp = c.attackSpell, chit = st.ch.chits.find(x => x.id === sp.chit);
        const side = { harm: sp.harm, stars: sp.stars, time: chit?.time ?? 0, length: sp.length, missile: true };
        const horse = c.dens.find(d => d.kind === 'horse' && d.partOf === target.uid && !d.dead);
        const def = horse ?? target, defSide = denSide(st, data, def);
        const inBox = def.box != null && def.box === myDir, fast = side.time != null && defSide.move != null && side.time < defSide.move;
        const nm = defSide.name, spName = data.spells[sp.spell]?.name ?? sp.spell;
        if (inBox || fast) {
            for (let k = 0; k < (sp.hits ?? 1); k++) hits.push({ who: 'me', time: side.time, length: side.length, on: def.uid, owner: target.uid, side, spell: spName });
            log(`${spName}: ${DIRS[myDir]} at ${nm} (${MANEUVERS[def.box] ?? '?'} box): ${sp.hits > 1 ? `${sp.hits} hits` : 'hit'}${inBox ? '' : ' by undercutting'}.`);
        } else log(`${spName}: ${DIRS[myDir]} at ${nm} (${MANEUVERS[def.box] ?? '?'} box): miss.`);
    } else if (c.attackSpell && !target) {
        log(`${data.spells[c.attackSpell.spell]?.name ?? 'Your spell'} is cast at no one and fizzles.`);
    }
    if (fight && target && myDir != null) {
        // the defender is its horse while the horse lives
        const horse = c.dens.find(d => d.kind === 'horse' && d.partOf === target.uid && !d.dead);
        const def = horse ?? target, defSide = denSide(st, data, def);
        const inBox = def.box != null && def.box === myDir;
        const fast = attackTime != null && defSide.move != null && attackTime < defSide.move;
        const hitsIt = inBox || fast;
        const nm = defSide.name, where = def.box != null ? MANEUVERS[def.box] : '?';
        if (hitsIt) {
            hits.push({ who: 'me', time: attackTime, length: mySide.length, on: def.uid, owner: target.uid });
            log(inBox ? `You: ${DIRS[myDir]} at ${nm} (${where} box): hit.` : `You: ${DIRS[myDir]} at ${nm} (${where} box): hit by undercutting (your time ${attackTime} beats its ${defSide.move}).`,
                inBox ? tell.myHitBox(st, weaponName, DIRS[myDir].toLowerCase(), nm) : tell.myHitFast(st, weaponName, DIRS[myDir].toLowerCase(), nm, where, attackTime, defSide.move));
        } else log(`You: ${DIRS[myDir]} at ${nm} (${where} box): miss (${DIRS[myDir]} hits ${MANEUVERS[myDir]}${defSide.move != null ? `; its time ${defSide.move} is not slower than your ${attackTime}` : ''}).`,
            tell.myMiss(st, weaponName, DIRS[myDir].toLowerCase(), nm, where, attackTime, defSide.move));
    }
    const mnvTime = move ? move.time : null;
    for (const d of c.dens.filter(x => !x.dead && x.kind !== 'horse' && x.box != null)) {
        const s = denSide(st, data, d);
        if (s.attack === 'none' || s.atk == null) continue;
        const owner = d.partOf ? c.dens.find(x => x.uid === d.partOf) : d;
        if (!owner.assigned) continue;
        if (owner.noRetaliation) { log(`${s.name} cannot strike back this round (${owner.noWhy === 'hidden' ? 'you struck from hiding' : 'its group joins next round'}).`, tell.notBack(st, s.name, owner.noWhy === 'hidden')); continue; }
        const dir = d.box;
        const meets = mnvDir != null && mnvDir === dir && move;
        const under = mnvTime != null ? s.atk < mnvTime : false;
        const noMove = !move;
        const at = `${s.name}'s ${DIRS[dir].toLowerCase()}`;
        if (noMove) { hits.push({ who: d.uid, time: s.atk, length: s.length }); log(`${at} is aimed true (you played no maneuver).`, tell.connectNoMove(st, s.name, DIRS[dir].toLowerCase())); }
        else if (meets) { hits.push({ who: d.uid, time: s.atk, length: s.length }); log(`${at} is aimed at your ${MANEUVERS[mnvDir]}: it connects.`, tell.connectMeets(st, s.name, DIRS[dir].toLowerCase(), MANEUVERS[mnvDir])); }
        else if (under) { hits.push({ who: d.uid, time: s.atk, length: s.length }); log(`${at} gets under your maneuver (its time ${s.atk} beats your ${mnvTime}).`, tell.connectUnder(st, s.name, DIRS[dir].toLowerCase(), s.atk, mnvTime)); }
        else log(`${at} misses you (your ${MANEUVERS[mnvDir]} avoids it).`, tell.avoid(st, s.name, DIRS[dir].toLowerCase(), MANEUVERS[dir], MANEUVERS[mnvDir]));
    }
    // hirelings against the creatures they were sent at
    for (const hire of (c.hires ?? []).filter(x => !x.dead)) {
        const d = c.dens.find(x => x.uid === hire.target && !x.dead && x.engagedBy === hire.uid);
        if (!d) continue;
        const hs = hireStats(data, hire.id), ds = denSide(st, data, d), a = (die(st) - 1) % 3;
        if (hs.atk != null && hs.harm != null && (a === d.box || (ds.move != null && hs.atk < ds.move))) hits.push({ who: 'hire', hire: hire.uid, den: d.uid, time: hs.atk, length: hs.length });
        if (ds.attack !== 'none' && ds.atk != null && (a === d.box || (hs.move != null && ds.atk < hs.move))) hits.push({ who: d.uid, onHire: hire.uid, time: ds.atk, length: ds.length });
    }
    // --- order of harm: first round by length, later rounds by speed ---
    const key = h => c.round === 1 ? [-h.length, h.time ?? 99] : [h.time ?? 99, -h.length];
    hits.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1]; });
    const sameKey = (a, b) => { const ka = key(a), kb = key(b); return ka[0] === kb[0] && ka[1] === kb[1]; };
    // When nothing happens, say why: a Fight chit with no one named, a hidden hero nobody can reach, a round with no blows at all.
    if (!hits.length) {
        const chit = c => `${c.type === 'move' ? 'Move' : 'Fight'} ${c.strength}${c.time}${'*'.repeat(c.effort ?? 0)}`;
        const bits = [];
        if (fight && !target) bits.push(`You played ${chit(fight)} but named no one to strike, so the effort bought nothing.`);
        else if (!fight && target) bits.push('You named a target but played no Fight chit, so there was no attack.');
        else if (!target) bits.push('You attacked no one.');
        if (st.ch.hidden) bits.push('You are still hidden, so no creature can be set on you: nothing happens this round.');
        else bits.push('No creature could strike you either, so no blow lands this round.');
        const text = bits.join(' ');
        log(text, text);
    }
    // The order the blows will fall in, and why: it is the thing a player most wants explained.
    const blowName = h => (h.who === 'me' ? `your ${weaponName}` : h.who === 'hire' ? `your hireling's blow` : `the ${denSide(st, data, c.dens.find(d => d.uid === h.who)).name}'s ${DIRS[c.dens.find(d => d.uid === h.who).box ?? 0].toLowerCase()}`);
    const blowText = h => `${blowName(h)} (time ${h.time ?? '?'}${h.length ? `, length ${h.length}` : ''})`;
    if (hits.length > 1) {
        const why = c.round === 1 ? 'in the first round the longest weapon strikes first, then the fastest' : 'after the first round the fastest strikes first, then the longest weapon';
        const whyShort = c.round === 1 ? 'longest weapon first, then fastest' : 'fastest first, then longest weapon';
        log(`Order of blows (${why}): ${hits.map((h, k) => `${k + 1}. ${blowText(h)}`).join('; ')}.`,
            `Blows in order (${whyShort}): ${hits.map(blowText).join(', then ')}.`);
    } else if (hits.length === 1) {
        log(`Only one blow can land this round: ${blowText(hits[0])}.`, `Only one blow lands: ${blowText(hits[0])}.`);
    }
    c.newWounds = 0;
    let i = 0, dead = false, delivered = false;
    while (i < hits.length && !st.ch.dead) {
        let j = i; while (j + 1 < hits.length && sameKey(hits[i], hits[j + 1])) j++;
        const group = hits.slice(i, j + 1);
        c.groupNo = (c.groupNo ?? 0) + 1;
        // all hits in a tie are decided against the situation at the start of the tie
        const alive = new Set(c.dens.filter(d => !d.dead).map(d => d.uid));
        const dmg = [];
        if (group.length > 1) log(`These blows land at the same instant: ${group.map(blowName).join(' and ')}.`, `${group.map(blowName).join(' and ')} land at the same instant: neither can prevent the other.`.replace(/^./, ch => ch.toUpperCase()));
        for (const h of group) {
            if (h.who === 'me') {
                if (alive.has(h.on)) dmg.push(() => { delivered = true; myHit(st, data, h, h.side ? { w: null, mySide: h.side, fight: null, myDir, notes, log, spell: h.spell } : { w, mySide, fight, myDir, notes, log }); });
                else log('Your blow finds its target already dead.', `Your ${weaponName} finds its target already dead: the blow is wasted.`);
            }
            else if (h.who === 'hire') { if (alive.has(h.den) && !c.hires.find(x => x.uid === h.hire).dead) dmg.push(() => hireStrikes(st, data, h, log)); }
            else if (h.onHire) {
                const den = c.dens.find(d => d.uid === h.who);
                if (alive.has(den.uid) && !c.hires.find(x => x.uid === h.onHire).dead) dmg.push(() => denStrikesHire(st, data, den, h.onHire, log));
            }
            else {
                const den = c.dens.find(d => d.uid === h.who);
                const ownerAlive = !den.partOf || alive.has(den.partOf);
                if (alive.has(den.uid) && ownerAlive) dmg.push(() => denHit(st, data, den, { mnvDir, move, shieldDir: p.shieldDir, log, g: c.groupNo, horse: move?.isHorse ? st.ch.items.find(i => i.uid === move.horseUid) : null }));
                else log(`${denSide(st, data, den).name} is dead before its blow can land.`, `The ${denSide(st, data, den).name} was struck down before its ${DIRS[den.box ?? 0].toLowerCase()} could land: it never gets to strike.`);
            }
        }
        dmg.forEach(f => f());
        i = j + 1;
    }
    // Tremendous monsters that hurt him turn red only now, after everything this round has landed.
    if (!st.ch.dead) for (const uid of c.toRed) {
        const d = c.dens.find(x => x.uid === uid);
        if (d && !d.dead && !d.pickedUp) { d.side = 'red'; d.pickedUp = true; log(`${denSide(st, data, d).name} seizes you!`); c.eventful = true; }
    }
    // weapon state: a weapon that hit goes unalerted; one that struck and missed turns alerted
    if (w && fight && !target && (p.weaponSide === 'alerted' || p.weaponSide === 'unalerted')) w.item.alerted = p.weaponSide === 'alerted';      // 8.4.5 h.2
    if (w && fight && target && myDir != null) {
        const wasAlerted = !!w.item.alerted;
        w.item.alerted = !delivered;      // only a blow that was delivered unalerts the weapon; a miss or a cancelled blow leaves it alerted
        // say so: it changes what the weapon does next round (an alerted weapon takes its attack time from the Fight chit)
        if (!delivered) log(wasAlerted ? `Your ${weaponName} found no mark, so it stays alerted.` : `Your ${weaponName} found no mark, so it is now alerted: its next blow takes its attack time from the Fight chit you play.`,
            wasAlerted ? `Your ${weaponName} found no mark and stays alerted.` : `Your ${weaponName} found no mark, and the missed swing leaves it alerted: next round its time comes from the Fight chit you play.`);
        else if (wasAlerted) log(`Your ${weaponName} struck home, so it goes back to unalerted.`, `Your ${weaponName} struck home and goes back to unalerted.`);
    }
    c.attackSpell = null;                                 // an attack spell not used this round is lost
    c.step = 'resolve';
    return afterMelee(st, data);
}

function canFlip(st, data, d) {
    if (d.kind === 'horse') return false;
    if (d.kind === 'mon') { const m = data.monsters[d.id]; return d.side !== 'red' && !(m.red) ; }
    if (d.kind === 'part') return true;
    return true;
}

// He decides how the denizens go into the three boxes. Rule: fill as many boxes as possible; a part may not share a box with its owner.
function placeInBoxes(st, data, list, wanted) {
    const c = st.combat;
    const used = [0, 0, 0];
    const place = (d, b) => { d.box = b; used[b]++; };
    // honour requested boxes where they respect the part rule
    const order = [...list];
    for (const d of order) d.box = null;
    for (const d of order.filter(d => d.kind !== 'part')) {
        const b = wanted[d.uid];
        if (b === 0 || b === 1 || b === 2) place(d, b);
    }
    for (const d of order.filter(d => d.kind !== 'part' && d.box == null)) {
        const lowest = used.indexOf(Math.min(...used));
        place(d, lowest);
    }
    for (const d of order.filter(d => d.kind === 'part')) {
        const owner = c.dens.find(o => o.uid === d.partOf);
        const choices = [0, 1, 2].filter(b => b !== owner.box).sort((a, b) => used[a] - used[b]);
        let b = wanted[d.uid];
        if (!(b === 0 || b === 1 || b === 2) || b === owner.box) b = choices[0];
        place(d, b);
    }
    // fill as many boxes as possible: with n things, min(n, 3) boxes must be in use
    const need = Math.min(order.length, 3);
    for (let guard = 0; guard < 8 && used.filter(u => u > 0).length < need; guard++) {
        const from = used.indexOf(Math.max(...used)), to = used.indexOf(0);
        const mover = order.find(d => d.box === from && d.kind !== 'part') ?? order.find(d => d.box === from && d.kind === 'part' && c.dens.find(o => o.uid === d.partOf).box !== to);
        if (!mover || used[from] < 2) break;
        used[from]--; mover.box = to; used[to]++;
    }
}

// ---- hits ----
function killReward(st, data, den, s) {
    st.ch.killsToday = (st.ch.killsToday ?? 0) + 1;
    const k = st.ch.killsToday;
    const fame = (s.fame ?? 0) * k, notor = (s.notor ?? 0) * k;
    st.ch.fame += fame; st.ch.notoriety += notor; st.ch.gold += s.gold ?? 0;
    const bits = [];
    if (fame) bits.push(`+${fame} Fame`);
    if (notor) bits.push(`+${notor} Notoriety`);
    if (s.gold) bits.push(`+${s.gold} gold`);
    return bits.length ? ` (${bits.join(', ')}; kill ${k} today)` : '';
}

function myHit(st, data, h, ctx) {
    const c = st.combat;
    const den = c.dens.find(d => d.uid === h.on), owner = c.dens.find(d => d.uid === h.owner);
    const s = denSide(st, data, den);
    const side = ctx.mySide;
    let level = lvl(side.harm), stars = side.stars;
    if (s.armored) stars = Math.max(0, stars - 1);
    level += stars;
    let note = '';
    if (side.missile) {
        const bow = /bow$/i.test(ctx.w ? data.weapons[ctx.w.item.id]?.name ?? '' : '');
        const r = (hasAdv(st, 'archer') && bow) || oneDie(st, 'missile') ? (() => { const d1 = die(st); return { dice: [d1], value: d1 }; })() : roll2(st);
        const aim = hasAdv(st, 'aim') ? 1 : 0;
        const v = clamp6(r.value - aim);
        level += MISSILE[v - 1];
        noteRoll(st, 'Your missile roll', r.dice, v, `${MISSILE[v - 1] >= 0 ? '+' : ''}${MISSILE[v - 1]} harm level${Math.abs(MISSILE[v - 1]) === 1 ? '' : 's'}${aim ? ' (Aim -1)' : ''}`);
        note = ` (missile roll ${r.dice.join('+')}${aim ? ' -1 for Aim' : ''} -> ${MISSILE[v - 1] >= 0 ? '+' : ''}${MISSILE[v - 1]})`;
    } else if (ctx.fight && ctx.w && lvl(ctx.fight.strength) > lvl(side.harm)) { level += 1; note = ' (strong Fight chit +1)'; }
    else if (ctx.fight && !ctx.w) level += 1;
    const finalL = letterOf(level);
    const vuln = lvl(s.vuln);
    if (den.kind === 'horse') {
        if (level >= vuln) {
            den.dead = true;
            const nat = st.nats.find(n => n.id === den.owner); if (nat) nat.horseDead = true;
            ctx.log(`You strike down the ${s.name}${note}.`);
            c.eventful = true;
        } else ctx.log(`You hit the ${s.name} but harm ${finalL} is not enough${note}.`);
        return;
    }
    if (level >= vuln) {
        const shared = den.dead;           // a hireling's blow killed it in the same instant: the bounty is paid once, and this still counts as a kill
        den.dead = true;
        // parts die with their owner
        for (const p of c.dens.filter(d => d.partOf === den.uid)) p.dead = true;
        let reward;
        if (shared) { st.ch.killsToday = (st.ch.killsToday ?? 0) + 1; reward = ' (a shared kill: the bounty was already paid)'; }
        else reward = killReward(st, data, den, s);
        if (den.kind === 'mon') { const m = st.mons.find(x => x.id === den.id); m.dead = true; m.loc = null; }
        else if (den.kind === 'nat') { const n = st.nats.find(x => x.id === den.id); n.dead = true; n.loc = null; dropNativeGoods(st, data, n); }
        tally(st, 'kills'); tally(st, `kill.${s.name}`);
        (c.killed ??= []).push(s.name);
        ctx.log(`You kill the ${s.name} with ${finalL} harm${note}${reward}.`, tell.kill(st, ctx.spell ?? (ctx.w ? nameOfItem(st, data, ctx.w.item) : 'bare hands'), s.name, reward));
        c.eventful = true;
    } else {
        tally(st, 'hitsNotKilling');
        ctx.log(`You hit the ${s.name} for ${finalL} harm${note}; it has vulnerability ${s.vuln} and survives.`, tell.tough(st, ctx.spell ?? (ctx.w ? nameOfItem(st, data, ctx.w.item) : 'bare hands'), s.name, finalL, s.vuln));
        // a harmless hit still turns the weapon unalerted (handled by caller)
    }
}

// A slain leader's group drops its goods where he fell.
function dropNativeGoods(st, data, n) {
    const def = data.natives[n.id];
    if (!def.leader) return;
    const stock = st.stock[def.group] ?? [];
    if (!stock.length) return;
    const at = st.combat.at;
    const items = stock.splice(0).map(g => makeItem(st, g.kind, g.id));
    st.abandoned[at] = [...(st.abandoned[at] ?? []), ...items];
    say(st, `The ${def.group}'s goods are left lying where their leader fell.`, 'loot');
}

function denHit(st, data, den, ctx) {
    const c = st.combat, s = denSide(st, data, den);
    const dir = den.box;
    // red side up from an earlier round: kills outright
    if (den.pickedUp) return killMe(st, `${s.name} crushes you.`, s.name);
    let level = lvl(s.harm), stars = s.stars ?? 0;
    // a Demon's Power of the Pit and an Imp's curse go to the rider; a horse played as the maneuver does not take them
    if (s.attack === 'spell') {
        const row = pit(st, data, `${s.name}'s magic`);
        pitAftermath(st, data, row, den, ctx);
        c.eventful = true;
        if (st.ch.dead) { ctx.log(`${s.name}'s magic kills you.`); c.events.push('You are dead.'); }
        else if (s.tremendous && den.kind !== 'part') c.toRed.push(den.uid);
        return;
    }
    // if his horse was played as the maneuver the blow lands on the horse, not on him
    if (ctx.horse && (!ctx.horse.destroyed || ctx.horse.destroyedGroup === ctx.g)) {
        const hd = data.horses[ctx.horse.id];
        let hl = lvl(s.harm) + (hd.armored ? Math.max(0, stars - 1) : stars);
        if (s.attack === 'missile') hl += missileRoll(st, `${s.name}'s missile roll (at your horse)`, s.type === 'Archer');
        if (hl >= lvl(hd.vulnerability)) {
            ctx.horse.destroyed = true; ctx.horse.active = false; ctx.horse.destroyedGroup = ctx.g;
            ctx.log(`${s.name} strikes your ${hd.name} dead.`);
            c.eventful = true;
        } else ctx.log(`${s.name} hits your ${hd.name} but it stands.`);
        const owner = den.kind === 'part' ? c.dens.find(d => d.uid === den.partOf) : den;
        if (owner && data.monsters[owner.id]?.red && !c.toRed.includes(owner.uid)) c.toRed.push(owner.uid);      // it has hit something of his: it turns red
        return;
    }
    // armor in that direction: a shield guarding that way first, then body armor
    const all = armorForBlow(st, data, ctx.g);
    const pieces = [];
    const sh = all.find(a => isShield(a.def) && ctx.shieldDir === dir);
    if (sh) pieces.push(sh);
    for (const a of all) if (!isShield(a.def) && coversDir(a.def, dir)) pieces.push(a);
    // the first piece in the way takes the blow: shields and armor cards are the outer row, then helmets and breastplates, then suits
    // (Ointment of Steel before the Suit); a counter before a card of the same row
    const row = a => (isShield(a.def) || (a.def.card && a.def.id !== 'ointment-of-steel-1') ? 1 : /helmet|breastplate/.test(a.def.type ?? '') ? 2 : 3);
    pieces.sort((x, y) => row(x) - row(y) || (x.def.id === 'ointment-of-steel-1' ? -1 : y.def.id === 'ointment-of-steel-1' ? 1 : 0) || (!!x.def.card - !!y.def.card));
    const armor = pieces[0] ?? null;
    let note = '', missile = 0;
    if (s.attack === 'missile') {
        // the Missile Table shifts the harm; if the result is above Tremendous it ignores armor, judged before armor takes any star off
        missile = missileRoll(st, `${s.name}'s missile roll`, s.type === 'Archer');
        if (lvl(s.harm) + stars + missile > 4) return killMe(st, `${s.name}'s shot finds a vital spot; you are slain.`, s.name);
    }
    if (armor) stars = Math.max(0, stars - 1);
    level += stars + missile;
    const L = letterOf(level);
    ctx.log(`${s.name} strikes ${DIRS[dir].toLowerCase()} for ${L} harm${armor ? ` against your ${armor.def.name}` : ''}.`, tell.strike(st, s.name, DIRS[dir].toLowerCase(), L, armor?.def.name));
    let wounded = false, changed = false;
    if (armor) {
        const tough = lvl(armor.def.toughness ?? armor.def.weight);
        if (level >= tough) {
            const card = !!armor.def.card;
            if (!card && level === tough && !armor.item.damaged && !armor.item.destroyed) { armor.item.damaged = true; changed = true; tally(st, 'armorDamaged'); ctx.log(`Your ${armor.def.name} is damaged.`, tell.damaged(st, armor.def.name)); c.eventful = true; }
            else if (!armor.item.destroyed) {
                armor.item.destroyed = true; armor.item.active = false; armor.item.destroyedGroup = ctx.g; changed = true; tally(st, 'armorDestroyed');
                const gold = !armor.def.native ? (armor.def.priceDestroyed ?? 0) : 0;
                if (gold) st.ch.gold += gold;
                ctx.log(`Your ${armor.def.name} is destroyed${gold ? ` (worth ${gold} gold to you)` : ''}.`, tell.destroyed(st, armor.def.name, gold));
                c.eventful = true;
            }
        }
        if (level >= lvl('M')) wounded = true;
    } else if (level >= lvl(st.ch.weight)) {
        return killMe(st, `${s.name} deals ${L} harm; you are slain.`, s.name);
    } else if (level >= lvl('L')) wounded = true;
    if (wounded) {
        c.newWounds = (c.newWounds ?? 0) + 1; tally(st, 'woundsTaken'); tally(st, `wounds.${s.name}`);
        c.eventful = true;
        ctx.log('You take a wound.', tell.wound(st));
    } else if (!changed && !st.ch.dead) {
        // nothing came of it, and the player should be told why
        const why = armor
            ? `${WEIGHT_WORDS[L] ?? L} harm is not enough to hurt your ${armor.def.name} (toughness ${WEIGHT_WORDS[armor.def.toughness ?? armor.def.weight] ?? armor.def.toughness}), and it is too light to hurt you through it.`
            : `${WEIGHT_WORDS[L] ?? L} harm is too light to wound you.`;
        ctx.log(`No effect: ${why}`, tell.noEffect(st, WEIGHT_WORDS[L] ?? L, armor?.def.name, armor ? (WEIGHT_WORDS[armor.def.toughness ?? armor.def.weight] ?? armor.def.toughness) : null));
    }
    // a tremendous monster that hurts him and leaves him alive will pick him up when the round ends
    if (!st.ch.dead) {
        const owner = den.kind === 'part' ? c.dens.find(d => d.uid === den.partOf) : den;
        if (owner && data.monsters[owner.id]?.red && !c.toRed.includes(owner.uid)) c.toRed.push(owner.uid);
    }
}

// The Power of the Pit also hits the creatures in the clearing: a Fiery Chasm kills every unhidden individual (not the demon that cast it),
// Terror kills the Light and Medium monsters, natives and horses. Nobody is paid a bounty for these deaths.
function pitAftermath(st, data, rowName, caster, ctx) {
    if (rowName !== 'Fiery Chasm' && rowName !== 'Terror') return;
    const c = st.combat, small = x => lvl(x ?? 'T') <= lvl('M');
    const dead = [];
    for (const d of c.dens) {
        if (d.dead || d.uid === caster.uid || (caster.partOf && d.uid === caster.partOf) || d.partOf === caster.uid || d.kind === 'part') continue;
        const s = denSide(st, data, d);
        const dies = rowName === 'Fiery Chasm' ? d.kind !== 'horse' : (d.kind === 'horse' ? small(s.vuln) : small(s.size));
        if (!dies) continue;
        d.dead = true;
        for (const p of c.dens.filter(x => x.partOf === d.uid)) p.dead = true;
        if (d.kind === 'mon') { const m = st.mons.find(x => x.id === d.id); if (m) { m.dead = true; m.loc = null; } }
        else if (d.kind === 'nat') { const n = st.nats.find(x => x.id === d.id); if (n) { n.dead = true; n.loc = null; dropNativeGoods(st, data, n); } }
        dead.push(s.name);
    }
    for (const h of c.hires ?? []) {
        if (h.dead) continue;
        const n = st.nats.find(x => x.id === h.id);
        if (rowName === 'Fiery Chasm' || small(data.natives[h.id].weight)) { h.dead = true; if (n) { n.dead = true; n.hired = false; n.loc = null; } dead.push(data.natives[h.id].name); }
    }
    if (dead.length) ctx.log(`${rowName} kills: ${dead.join(', ')}.`);
}

function killMe(st, text, by = null) {
    st.ch.dead = true; tally(st, 'deathsInCombat'); if (by) tally(st, `slain.${by}`);
    say(st, text, 'combat');
    st.combat.events.push(text);
    st.combat.eventful = true;
}

// ---- after the dice: fatigue first, then wounds, then the next round ----
function afterMelee(st, data) {
    if (st.ch.dead) return endCombat(st, data, 'died');
    return toFatigue(st, data);
}

const nonWounded = st => st.ch.chits.filter(x => x.state !== 'wounded');
const dieOfWounds = (st, data) => { st.ch.dead = true; say(st, 'Every action chit is wounded; you die.', 'combat'); return endCombat(st, data, 'died'); };

// Wounds fall on active chits first, then on fatigued ones; with no chit left to wound he dies.
function resolveWounds(st, data) {
    const c = st.combat;
    while ((c.newWounds ?? 0) > 0) {
        // wounds fall on ready chits, then enchanted ones, and only then on tired ones (rule 4.2.5)
        const active = st.ch.chits.filter(x => x.state === 'active');
        const enchanted = st.ch.chits.filter(x => x.state === 'enchanted');
        const pool = active.length ? active : enchanted.length ? enchanted : st.ch.chits.filter(x => x.state === 'fatigued');
        if (!pool.length) return dieOfWounds(st, data);
        if (pool.length <= c.newWounds) {
            pool.forEach(x => { x.state = 'wounded'; });
            c.newWounds -= pool.length;
            say(st, `You wound ${pool.length} action chit${pool.length === 1 ? '' : 's'}.`, 'combat', tell.wounded(st, pool.length));
            continue;
        }
        c.step = 'wounds';
        st.pending = { type: 'combat-wounds', count: c.newWounds, chits: pool.map(x => x.id) };
        return;
    }
    if (nonWounded(st).length === 0) return dieOfWounds(st, data);
    return finishRound(st, data);
}

export function chooseWounds(st, data, ids) {
    const c = st.combat, need = c.newWounds;
    const active = st.ch.chits.filter(x => x.state === 'active');
    const enchanted = st.ch.chits.filter(x => x.state === 'enchanted');
    const eligible = (active.length ? active : enchanted.length ? enchanted : st.ch.chits.filter(x => x.state === 'fatigued')).map(x => x.id);
    const uniq = [...new Set(ids)];
    if (uniq.length !== need || uniq.some(id => !eligible.includes(id))) throw new Error(`choose ${need} chit${need === 1 ? '' : 's'} to wound`);
    for (const id of uniq) st.ch.chits.find(x => x.id === id).state = 'wounded';
    c.newWounds = 0;
    say(st, `You wound ${uniq.length} action chit${uniq.length === 1 ? '' : 's'}.`, 'combat', tell.wounded(st, uniq.length));
    return resolveWounds(st, data);
}

function toFatigue(st, data) {
    const c = st.combat;
    const need = Math.max(0, c.asterisks.move + c.asterisks.fight - 1);
    c.fatigueNeed = need;
    if (need === 0) return resolveWounds(st, data);
    // He must fatigue that many asterisks, using chits of the kind he played. Offer only if there is a real choice.
    const kinds = [];
    if (c.asterisks.move) kinds.push('move');
    if (c.asterisks.fight) kinds.push('fight');
    c.fatigueKinds = kinds;
    const pool = st.ch.chits.filter(x => x.state === 'active' && x.effort > 0 && (kinds.includes(x.type)));
    const total = pool.reduce((s, x) => s + x.effort, 0);
    if (total <= need) {
        pool.forEach(x => { x.state = 'fatigued'; });
        if (pool.length) { say(st, `You fatigue ${pool.length} chit${pool.length === 1 ? '' : 's'}.`, 'combat', tell.spent(st, pool.length)); c.eventful = true; }
        return resolveWounds(st, data);
    }
    c.step = 'fatigue';
    // say which of his plays cost the effort, so the question is not a mystery
    const lab = ch => `${ch.type === 'move' ? 'Move' : ch.type === 'magic' ? 'Magic' : 'Fight'} ${ch.type === 'magic' ? (ch.numeral ?? '') : (ch.strength ?? '')}${ch.time}${'*'.repeat(ch.effort ?? 0)}`;
    const playedCosting = st.ch.chits.filter(x => c.played?.[x.id] && x.effort > 0);
    const why = `You played ${playedCosting.map(lab).join(' and ') || 'chits with asterisks'}: ${c.asterisks.move + c.asterisks.fight} asterisk${c.asterisks.move + c.asterisks.fight === 1 ? '' : 's'} of effort. The first is free; each one after it is paid by tiring a ${kinds.join(' or ')} chit that has asterisks (any such chit, not only the one you played).`;
    st.pending = { type: 'combat-fatigue', need, chits: pool.map(x => x.id), kinds, why };
}

export function chooseFatigue(st, data, ids) {
    const c = st.combat, need = c.fatigueNeed;
    const pool = st.ch.chits.filter(x => x.state === 'active' && x.effort > 0 && c.fatigueKinds.includes(x.type));
    const chosen = [...new Set(ids)].map(id => pool.find(x => x.id === id));
    if (chosen.some(x => !x)) throw new Error('that chit cannot be fatigued');
    const sum = chosen.reduce((s, x) => s + x.effort, 0);
    if (sum < need) throw new Error(`fatigue at least ${need} asterisk${need === 1 ? '' : 's'}`);
    if (sum - need > 1) throw new Error('that is more than needed');
    chosen.forEach(x => { x.state = 'fatigued'; });
    // Overshoot by one: make change by returning a fatigued single-asterisk chit of the same kind, if there is one.
    if (sum - need === 1) {
        const back = st.ch.chits.find(x => x.state === 'fatigued' && x.effort === 1 && !chosen.includes(x) && c.fatigueKinds.includes(x.type));
        if (back) { back.state = 'active'; say(st, 'You make change for the extra asterisk.', 'combat'); }
    }
    say(st, `You fatigue ${chosen.length} chit${chosen.length === 1 ? '' : 's'}.`, 'combat', tell.spent(st, chosen.length));
    c.eventful = true;
    return resolveWounds(st, data);
}

function finishRound(st, data) {
    const c = st.combat;
    if (c.ran) return endCombat(st, data, 'ran');
    return nextRound(st, data);
}

function nextRound(st, data) {
    const c = st.combat;
    const quietRound = !c.eventful && !c.dens.some(d => d.pickedUp && !d.dead);
    c.quiet = quietRound ? c.quiet + 1 : 0;
    c.eventful = false;
    const foes = c.dens.filter(d => !d.dead && d.assigned && d.kind !== 'part' && d.kind !== 'horse');
    const anyFoe = c.dens.some(d => !d.dead && d.kind !== 'part' && d.kind !== 'horse');
    if (!anyFoe) return endCombat(st, data, 'won');
    if (c.quiet >= 2) return endCombat(st, data, 'quiet');
    // Disengagement: everything that is not assigned or picked up resets; his hit weapon stays as it is.
    for (const d of c.dens) { d.box = null; d.noRetaliation = false; }
    c.round += 1;
    enterEncounter(st, data);
}

function endCombat(st, data, why) {
    const c = st.combat;
    c.ended = true; c.why = why; c.step = 'done';
    tally(st, 'combats'); tally(st, 'rounds', c.round); tally(st, `combat.${why}`);
    for (const d of c.dens) { if (d.kind === 'mon' && d.side === 'red') d.side = 'light'; }
    // Destroyed things leave his belongings; counters that came from the natives go back to their stock.
    const owners = Object.fromEntries((data.setupcard?.dwellings ?? []).flatMap(dw => [[dw.name, dw.group], [dw.rsName, dw.group]]));
    for (const it of st.ch.items.filter(i => i.destroyed)) {
        const d = it.kind === 'armor' ? data.armor[it.id] : it.kind === 'weapon' ? data.weapons[it.id] : null;
        const group = d?.native && !d.card ? (owners[d.returnsTo] ?? owners[d.startBox]) : null;      // armor goes back to the dwelling it came from (8.4.9 k.3)
        if (group && st.stock[group]) st.stock[group].push({ kind: it.kind, id: it.id });
    }
    st.ch.items = st.ch.items.filter(i => !i.destroyed);
    st.pending = null;
    const text = { won: 'Combat is over: nothing hostile is left.', quiet: 'The fighting dies down.', ran: 'You are out of the fight.', died: 'You have died.' }[why];
    say(st, text, 'combat', why === 'quiet' ? tell.dieDown(st) : why === 'won' ? tell.won(st) : why === 'ran' ? tell.ran(st) : null);
}

// ---- hirelings ----
function hireStats(data, id) {
    // the hirer deploys a hireling on the side that can fight: the one with an attack, the harder-hitting one if both have
    const n = data.natives[id], sides = [n.light, n.dark].filter(x => x && x.harm != null && x.attackTime != null);
    const s = sides.sort((a, b) => lvl(b.harm) - lvl(a.harm) || (b.stars ?? 0) - (a.stars ?? 0) || a.attackTime - b.attackTime)[0] ?? n.light;
    return { name: n.name, vuln: n.vulnerability, armored: !!n.armored, harm: s.harm, stars: s.stars ?? 0, atk: s.attackTime, move: s.moveTime, length: n.weapon?.length ?? 0,
        missile: !!n.weapon?.missile, archer: n.type === 'Archer', fame: n.fameBounty ?? 0, notor: n.notorietyBounty ?? 0, gold: n.goldBounty ?? 0 };
}

function hireStrikes(st, data, h, log) {
    const c = st.combat, den = c.dens.find(d => d.uid === h.den), hs = hireStats(data, c.hires.find(x => x.uid === h.hire).id), ds = denSide(st, data, den);
    let level = lvl(hs.harm) + (ds.armored ? Math.max(0, hs.stars - 1) : hs.stars);
    if (hs.missile) level += missileRoll(st, `${hs.name}'s missile roll`, hs.archer);
    if (level >= lvl(ds.vuln)) {
        if (den.dead) { log(`${hs.name} strikes the ${ds.name} in the same instant; the bounty was already paid.`); return; }
        den.dead = true;
        for (const p of c.dens.filter(d => d.partOf === den.uid)) p.dead = true;
        if (den.kind === 'mon') { const m = st.mons.find(x => x.id === den.id); m.dead = true; m.loc = null; }
        else if (den.kind === 'nat') { const n = st.nats.find(x => x.id === den.id); n.dead = true; n.loc = null; dropNativeGoods(st, data, n); }
        // the hirer collects the bounty, unmultiplied, and the kill does not count toward his daily total
        st.ch.fame += ds.fame ?? 0; st.ch.notoriety += ds.notor ?? 0;
        if (data.natives[c.hires.find(x => x.uid === h.hire).id]?.leader) st.ch.gold += ds.gold ?? 0;         // the gold bounty goes only to a hired leader's kill (8.7.3 b)
        log(`${hs.name} kills the ${ds.name} for you.`);
        c.eventful = true;
    } else log(`${hs.name} hits the ${ds.name} but does not kill it.`);
}

function denStrikesHire(st, data, den, hireUid, log) {
    const c = st.combat, hire = c.hires.find(x => x.uid === hireUid), hs = hireStats(data, hire.id), ds = denSide(st, data, den);
    let level = lvl(ds.harm) + (hs.armored ? Math.max(0, ds.stars - 1) : ds.stars);
    if (ds.attack === 'missile') level += missileRoll(st, `${ds.name}'s missile roll (at ${hs.name})`, ds.type === 'Archer');
    if (ds.attack === 'spell') level = 4;
    if (level >= lvl(hs.vuln)) {
        hire.dead = true;
        const n = st.nats.find(x => x.id === hire.id); n.dead = true; n.hired = false; n.loc = null;
        st.ch.notoriety -= hs.notor;
        log(`The ${ds.name} kills ${hs.name}; you lose ${hs.notor} Notoriety.`);
        c.eventful = true;
    } else log(`The ${ds.name} hits ${hs.name} but fails to kill.`);
}
