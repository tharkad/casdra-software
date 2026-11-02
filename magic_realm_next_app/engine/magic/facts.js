// What the screens say about the spells of the hero on screen, as facts (Phase 3 round 7): the spells in force, what a held Phase spell can do now, what an energize can wake, what a Fly activity
// would use. A screen words them (app/ui/spellwhy.js); nothing here is a sentence. `mine`: the seats of the viewer's own player.
import { elsewhere } from './fx.js';
import { heldOptions, rearrangeLockWhy } from './phase.js';
import { energizeOptions } from './energize.js';
import { flySources } from './fly.js';

export function spellFacts(st, data, mine) {
    const live = (st.fx ?? []).filter(f => f.state !== 'done' && (!f.who || mine.has(f.who)));
    const held = (st.fx ?? []).filter(f => f.dur === 'phase' && f.state === 'held' && !elsewhere(st, f));
    const cause = st.ch.onRoad ? 'road' : st.ch.flying ? 'air' : st.ch.morph ? 'creature' : st.ch.mist ? 'mist' : 'other';
    return {
        fx: live,
        held: heldOptions(st, data),
        heldLock: held.length && !heldOptions(st, data).length ? { spells: [...new Set(held.map(f => f.spell))], cause, why: rearrangeLockWhy(st) } : null,
        energize: energizeOptions(st, data),
        fly: { sources: flySources(st, data), holdsBroomstick: (st.fx ?? []).some(f => f.spell === 'broomstick' && (f.state === 'held' || f.state === 'live') && !elsewhere(st, f)) },
    };
}
