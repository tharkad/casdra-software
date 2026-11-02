// planning.js: what a Birdsong plan may hold, as pure functions of the game and the draft slots (moved here from app/ui/planlogic.js, Phase 3 round 6: they are rules, and the screens ask them
// through `check(..., { probe: 'plan' })`; planlogic.js still re-exports them for the tests and tools that import them from there).
import { roadsFrom, isMountain, isCave, mapEdgeClearings } from './world.js';
import { planKinds } from './day.js';
import { MORPH_REFUSED } from './magic/morph.js';

export const EDGE = 'Edge';

// Where he starts each phase, as planned, and the mountain he is half way up at that moment (null when none). A Move to a mountain clearing takes two Move phases in a row
// (7.3.1c.1): after the first he is still where he was, and only the second brings him there. Any other activity breaks a climb off (day.js `t.climb`).
export function planState(st, data, slots) {
    const at = [], climbing = []; let loc = st.ch.onRoad ? null : st.ch.at, climb = null;
    for (let i = 0; i < 9; i++) {
        at.push(loc); climbing.push(climb);
        const s = slots[i];
        if (s?.act === 'move' && s.to === EDGE) { loc = null; climb = null; }          // he has left the map: nothing is planned from there (M4)
        else if (s?.act === 'move' && s.to) {
            if (isMountain(st, data, s.to) && s.to !== loc) {
                if (climb === s.to) { loc = s.to; climb = null; } else climb = s.to;
            } else { loc = s.to; climb = null; }
        } else climb = null;
    }
    return { at, climbing };
}

// Leaving the map (ruling M4, 7.3.1a.4, 9.2.2b): the plan may hold `{ act: 'move', to: 'Edge' }`. It is done only from a clearing with a roadway to the edge of the map (the phase is lost otherwise).
export function canLeaveAt(st, data, slots, i) {
    if (st.ch.onRoad || st.ch.flying) return false;
    const at = planState(st, data, slots).at[i];
    return !!at && mapEdgeClearings(st, data).has(at);
}

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

const ACTS = ['move', 'hide', 'search', 'trade', 'hire', 'rest', 'alert', 'enchant', 'fly', 'peer', 'follow', 'nothing'];
/** Everything the plan builder asks about a draft in one answer (check, probe 'plan'): `at` / `climbing` (where he starts each phase and the mountain he is half way up), `moves[i]` (`sure`, `maybe`), `leave[i]`
 * (may he leave the map from there) and `refusals` (act -> why it cannot be recorded now). */
export function whereOf(st, data, slots) {
    const { at, climbing } = planState(st, data, slots);
    const moves = [], leave = [];
    for (let i = 0; i < 9; i++) { moves.push(moveOptions(st, data, slots, i)); leave.push(canLeaveAt(st, data, slots, i)); }
    const refusals = {};
    for (const a of ACTS) { const why = actRefusal(st, a); if (why) refusals[a] = why; }
    return { at, climbing, moves, leave, refusals };
}
