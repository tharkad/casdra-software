import { die, roll2, say, noteRoll } from '../core.js';
import { PEER } from '../tables.js';
import { roadsFrom, isCave, isMountain, nameOfClearing, tileName } from '../world.js';
import { oneDie, modRoll, modNote } from '../modifiers.js';
import { peerBlocked, applySearchResult, bestChoice } from '../search.js';
import { enchantableChits, tileEnchantOptions, flipTile, TYPE_COLOR } from './colour.js';

// A COMPANION TURN: a second recorded turn in a day, done by a piece that is not the hero. Phantasm (rule 4.6.7 card text, digest 04) is the first; a Witch's familiar
// ("P" phases, 7.5.1) or a hired leader's own turn would be the same machinery with another `KINDS` entry. docs/design/magic/03-control-spells.md section 8.
//
//   st.companions = [{ id, kind, fx, name, at, climb, plan: [slot|null], results: [text] }]
//   KINDS[kind] = { name, acts }          what it may do; the same Basic and Sunlight phases as everyone (6.2.2)
//
// How it runs (day.js): at Birdsong (beginDay) a companion is put beside the hero; the plan action carries `companions: { [id]: [slot, ...] }` beside the hero's `slots`
// (a Prophecy hero sends `slots: []` and still sends these); at Sunrise, before the hero's first phase, each companion does all its phases in one go and the log and
// st.turn.companions tell what happened. Its choices that would be a question for the player (which chit to enchant, a Peer "Choice") are in the slot (`{act:'enchant', chit}`)
// or taken for him (the Peer result that shows the most he does not know). It shares the hero's discoveries, chits, hiding and Fog; it never carries, follows, blocks,
// is blocked, summons (no end-of-turn, no chits turn up for it) or is seen. It is not an item or a monster: nothing but spells can touch it.
export const KINDS = {
    phantasm: { name: 'Phantasm', acts: ['move', 'peer', 'enchant'] },
};

export const companionsOf = st => st.companions ?? [];
export const kindOf = c => KINDS[c.kind];

// Put a companion beside the hero (Birdsong). Returns it.
export function spawnCompanion(st, data, { kind, fx }) {
    const k = KINDS[kind];
    const c = { id: `${kind}:${fx}`, kind, fx, name: k.name, at: st.ch.at, climb: null, plan: null, results: [] };
    (st.companions ??= []).push(c);
    return c;
}
export function dropCompanions(st, fxId) {
    st.companions = (st.companions ?? []).filter(c => c.fx !== fxId);
}

// How many phases it gets for these recorded slots: 2 basic, +2 Sunlight unless it starts in a cave or records a Move into one (6.2.2).
export function companionPhases(st, data, comp, slots = []) {
    const startsInCave = !!comp.at && isCave(st, data, comp.at);
    const intoCave = slots.some(s => s?.act === 'move' && s.to && isCave(st, data, s.to));
    const sunlight = !startsInCave && !intoCave;
    return { total: 2 + (sunlight ? 2 : 0), base: 2 + (sunlight ? 2 : 0), sunlight };
}

// What the plan sheet needs: [{ id, kind, name, at, acts, phases, sunlight }]
export function companionInfo(st, data) {
    return companionsOf(st).map(c => { const p = companionPhases(st, data, c, []); return { id: c.id, kind: c.kind, name: c.name, at: c.at, acts: KINDS[c.kind].acts.slice(), phases: p.total, sunlight: p.sunlight }; });
}

// Check and store the recorded turns: `plans` is { [companion id]: [slot|null, ...] }. Throws with the first error.
export function planCompanions(st, data, plans = {}) {
    for (const id of Object.keys(plans ?? {})) if (!companionsOf(st).some(c => c.id === id)) throw new Error(`there is no ${id} to give a turn to`);
    for (const c of companionsOf(st)) {
        const slots = (plans?.[c.id] ?? []).map(s => (s && s.act !== 'nothing' ? s : null));
        const ph = companionPhases(st, data, c, slots);
        slots.forEach((s, i) => {
            if (!s) return;
            if (i >= ph.total) throw new Error(`${c.name}: phase ${i + 1} is not available today.`);
            if (!KINDS[c.kind].acts.includes(s.act)) throw new Error(`${c.name} can only ${KINDS[c.kind].acts.join(', ')} (not ${s.act}).`);
            if (s.act === 'move' && !s.to) throw new Error(`${c.name}, phase ${i + 1}: choose where to move.`);
        });
        c.plan = slots.slice(0, ph.total);
        while (c.plan.length < ph.total) c.plan.push(null);
    }
}

// All the companions' turns, before the hero's first phase. Returns [{ id, name, results }] (also st.turn.companions).
export function runCompanionTurns(st, data) {
    const out = [];
    for (const c of companionsOf(st)) {
        c.results = [];
        c.plan ??= Array.from({ length: companionPhases(st, data, c).total }, () => null);
        c.plan.forEach((slot, i) => {
            const kind = i < 2 ? 'basic' : 'sunlight';
            const text = slot ? doSlot(st, data, c, slot, kind) : `${c.name} does nothing.`;
            c.results.push(text);
            say(st, `${c.name}, phase ${i + 1}: ${text}`, 'phase');
        });
        out.push({ id: c.id, name: c.name, at: c.at, results: c.results.slice() });
    }
    if (st.turn) st.turn.companions = out;
    return out;
}

function doSlot(st, data, c, slot, kind) {
    switch (slot.act) {
        case 'move': return move(st, data, c, slot, kind);
        case 'peer': c.climb = null; return peer(st, data, c);
        case 'enchant': c.climb = null; return enchant(st, data, c, slot);
        default: c.climb = null; return `${c.name} does nothing.`;
    }
}

// Move: along the roads the hero knows (shared discoveries), obeying the cave and mountain rules. It has no weight, no horse and no followers.
function move(st, data, c, slot, kind) {
    const to = slot.to;
    const road = roadsFrom(st, data, c.at).find(r => r.to === to);
    if (!road) { c.climb = null; return `There is no road from here to ${nameOfClearing(to)}: the move is lost.`; }
    if (!road.usable) { c.climb = null; return `${c.name} does not know the way to ${nameOfClearing(to)}: the move is lost.`; }
    if (isCave(st, data, to) && kind === 'sunlight') { c.climb = null; return `${c.name} cannot enter a cave in a sunlight phase.`; }
    if (isMountain(st, data, to) && c.climb !== to) { c.climb = to; return `${c.name} starts the climb toward ${nameOfClearing(to)} (mountains take two Move phases).`; }
    c.climb = null; c.at = to;
    return `${c.name} moves to ${nameOfClearing(to)}.`;
}

// Peer: the Peer table for its own clearing (RS CharacterActionControlManager 604-614), with the hero's dice and modifiers. What it finds is the hero's, except that he
// knows about hidden enemies only if he stands in its clearing at that moment.
function peer(st, data, c) {
    if (peerBlocked(st, data, c.at)) return 'Fog hangs over this tile: nobody can use the Peer table here.';
    const r = oneDie(st, 'search', c.at, data) ? (() => { const d1 = die(st); return { dice: [d1], value: d1 }; })() : roll2(st);
    const raw = [...r.dice];
    modRoll(st, data, 'peer', r);
    let res = PEER[r.value - 1];
    noteRoll(st, `${c.name}: Peer`, raw, r.value, res + modNote(r));
    if (res === 'Choice') res = bestChoice(st, data, c.at);
    const had = st.ch.hiddenEnemies;
    const text = applySearchResult(st, data, 'peer', res, raw, c.at);
    if (c.at !== st.ch.at) st.ch.hiddenEnemies = had;
    return `${c.name} peers: ${text}`;
}

// Enchant: with the hero's own Magic chits. The first Enchant phase of the hero's day (whoever does it) is only meditation, so there is ONE meditation a day, shared (spec
// question 7). Then it turns a ready Magic chit of Type I to V into a colour chit, or (`slot.tile`) enchants the tile it stands on where that colour is present there.
function enchant(st, data, c, slot) {
    const t = st.turn;
    t.enchants = (t.enchants ?? 0) + 1;
    if (t.enchants === 1) return `${c.name} meditates and gathers power: the first Enchant phase of a day only prepares.`;
    if (slot.tile) {
        const o = tileEnchantOptions(st, data, c.at).find(x => !slot.chit || x.chit === slot.chit);
        if (!o) return `${c.name} cannot enchant this tile: no ready Magic chit of Type I to V whose colour is here.`;
        if (o.supply) st.ch.chits.find(x => x.id === o.supply).state = 'fatigued';
        const to = flipTile(st, data, o.tile);
        return `${c.name} enchants the tile with ${o.color} magic: ${tileName(o.tile)} is turned to its ${to} side.`;
    }
    const opts = enchantableChits(st);
    const chit = opts.find(x => x.id === slot.chit) ?? opts[0];
    if (!chit) return 'You have no ready Magic chit of Type I to V to enchant.';
    chit.state = 'enchanted';
    return `${c.name} enchants your Magic ${chit.numeral}${chit.time}${'*'.repeat(chit.effort)}: it now holds ${TYPE_COLOR[chit.numeral]} magic until you play it.`;
}
