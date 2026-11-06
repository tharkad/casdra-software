// What the Kit sheet and the screens that guard a belonging say about the hero on screen, as facts (Phase 3 round 13): what he can carry and what a pack horse bears, which belongings cannot be put to use
// now and why, which are bound to an extra phase he has recorded, whether the road locks his gear; the colours of magic at his clearing; the mission and campaign chits he carries and how every native group stands
// with him. A screen words them; nothing here decides anything the engine did not already decide with the same functions (items.js, missions.js, magic/colour.js): this file only asks them once, for the viewer,
// where the screens used to call them with a state. Sentences: `committed` and `roadLock` carry the engine's own sentence (the Detail words) until the voice layer writes them, as the `why` fields of `legal` do.
import { lvl } from './core.js';
import { weightOf, carriedLevel, carryCapacity, onPackHorse, activationBlockCode, extraPhaseCommitment, gearLockedWhy } from './items.js';
import { carriedTasks, standingWith } from './missions.js';
import { colorsAt, colorChits, COLORS } from './magic/colour.js';

/** view.me.gear: { capacity, level, packed[uid], drops[uid], blocked{uid: 'cave'|'weak'|'boots'}, committed{uid: sentence}, roadLock: sentence|null }.
 * capacity (carryCapacity) is the strongest weight he can carry on a Move; level (carriedLevel) the heaviest thing he carries that no pack horse bears; packed the belongings a pack horse bears; drops what he would put down
 * if he moved now (dropHeavy); blocked the inactive belongings that cannot be switched on and why (activationBlock); committed the belongings that cause an extra phase he has recorded (6.2.4d); roadLock the 8.3.8d lock. */
export function gearFacts(st, data) {
    const items = st.ch.items, cap = carryCapacity(st, data), top = Math.max(cap, 0);
    const out = { capacity: cap, level: carriedLevel(st, data), packed: [], drops: [], blocked: {}, committed: {}, roadLock: gearLockedWhy(st) };
    for (const it of items) {
        const packed = onPackHorse(st, data, it);
        if (packed) out.packed.push(it.uid);
        if (!it.destroyed && it.kind !== 'horse' && !packed && lvl(weightOf(data, it)) > top && lvl(weightOf(data, it)) > 0) out.drops.push(it.uid);
        if (!it.destroyed && !it.active) { const code = activationBlockCode(st, data, it); if (code) out.blocked[it.uid] = code; }
        let why = null; try { why = extraPhaseCommitment(st, data, it); } catch { why = null; }
        if (why) out.committed[it.uid] = why;
    }
    return out;
}

/** view.me.colors: { here: [colour of magic present in his clearing], chits: [colours of his enchanted Magic chits] } (colorsAt, colorChits): where the magic of a spell can come from. */
export function colorFacts(st, data) {
    return { here: [...colorsAt(st, data, st.ch.at)], chits: COLORS.filter(c => colorChits(st, c).length) };
}

/** view.me.tasks: { carried: [the mission and campaign chits he carries, with days left and the foes left (carriedTasks)], rel: { group: how the group stands with him (standingWith) } }. */
export function taskFacts(st, data) {
    const groups = new Set([...Object.keys(data.groups ?? {}), ...Object.keys(st.ch.rel ?? {})]);
    return { carried: carriedTasks(st, data), rel: Object.fromEntries([...groups].map(g => [g, standingWith(st, g)])) };
}
