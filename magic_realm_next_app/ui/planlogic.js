import { roadsFrom, isMountain, isCave } from '../engine/world.js';
import { planKinds } from '../engine/day.js';
import { MORPH_REFUSED } from '../engine/magic/morph.js';

// What the plan builder may offer, as pure functions of the game and the draft slots (no DOM), so tests can hold them to the rules (docs/audit/rules-eval/02).

// Where he starts each phase, as planned, and the mountain he is half way up at that moment (null when none). A Move to a mountain clearing takes two Move phases in a row
// (7.3.1c.1): after the first he is still where he was, and only the second brings him there. Any other activity breaks a climb off (day.js `t.climb`).
export function planState(st, data, slots) {
    const at = [], climbing = []; let loc = st.ch.onRoad ? null : st.ch.at, climb = null;
    for (let i = 0; i < 9; i++) {
        at.push(loc); climbing.push(climb);
        const s = slots[i];
        if (s?.act === 'move' && s.to) {
            if (isMountain(st, data, s.to) && s.to !== loc) {
                if (climb === s.to) { loc = s.to; climb = null; } else climb = s.to;
            } else { loc = s.to; climb = null; }
        } else climb = null;
    }
    return { at, climbing };
}
export const planLocations = (st, data, slots) => planState(st, data, slots).at;

// The clearings phase `i` may be given as a Move destination. `sure`: roads he can walk now. `maybe`: hidden paths and secret passages he has not discovered but an earlier phase of the
// plan Searches at one of their ends, so they may be found by then (6.2.4e: an activity that may be impossible can be recorded in hope; it is cancelled if it still is when its turn comes).
// Caves are left out of a sunlight phase (6.2.2b, 7.3.1c.2); a climb already begun offers only its mountain.
export function moveOptions(st, data, slots, i) {
    if (st.ch.onRoad && i === 0) return { sure: [st.ch.onRoad.from, st.ch.onRoad.to], maybe: [] };
    const { at, climbing } = planState(st, data, slots), from = at[i];
    if (!from) return { sure: [], maybe: [] };
    const roads = roadsFrom(st, data, from);
    if (climbing[i]) return { sure: roads.filter(r => r.usable && r.to === climbing[i]).map(r => r.to), maybe: [] };
    const searched = slots.slice(0, i).some((s, j) => s?.act === 'search' && (at[j] === from || roads.some(r => r.to === at[j])));
    let sure = roads.filter(r => r.usable).map(r => r.to);
    let maybe = searched ? roads.filter(r => !r.usable && (r.kind === 'hidden' || r.kind === 'secret')).map(r => r.to) : [];
    const trial = slots.slice(); trial[i] = { act: 'move', to: from };
    if (planKinds(st, data, trial).kinds[i] === 'sunlight') { sure = sure.filter(to => !isCave(st, data, to)); maybe = maybe.filter(to => !isCave(st, data, to)); }
    return { sure, maybe };
}

// Why this activity cannot be recorded now (null when it can): as mist he can only move and hide; as a creature he cannot rest, trade, hire or enchant.
export function actRefusal(st, act) {
    if (act === 'nothing') return null;
    if (st.ch.mist && act !== 'move' && act !== 'hide') return 'As mist you can only move and hide.';
    if (st.ch.morph && MORPH_REFUSED[act]) return MORPH_REFUSED[act];
    return null;
}
