import { isCave } from '../../world.js';
import { nullifyIfDuplicate } from '../util.js';

// Blazing Light (IV / Purple / Day): cast in a cave clearing, which is its target. Each character in that clearing during Birdsong may record one extra phase, for any
// normal activity; he must still be in the clearing when that phase starts or the activity is cancelled.
// Decisions (01-combat-spells.md section 9; RealmSpeak gives the phase to anyone whose plan merely visits the clearing, the card does not): the fx is a tag
// `extraPhase` on the clearing; day.js phasesFor counts it as one more ordinary phase for a character who starts the day in that cave (a cave day has two phases, so
// he plans three), planKinds marks the third activity as the 'blazing' phase, and executeSlot loses it with a message if he is not in the clearing when it starts
// (st.planBlazing is the clearing he planned from). The spell lasts until Sunset of the next day, so only the Birdsong of the next day benefits.
export default {
    id: 'blazing-light', dur: 'day', benevolent: true,
    legal: (st, data) => (isCave(st, data, st.ch.at) ? true : 'Blazing Light can be cast only in a cave clearing.'),
    useful: () => true,                                     // a free phase tomorrow
    start(ctx) {
        const { st } = ctx;
        ctx.fx({ targets: [{ kind: 'clearing', id: st.ch.at }], expires: { day: st.day + 1, at: 'sunset' } });
        ctx.log('Blazing Light fills the cave: if you start tomorrow here, you may record one extra phase for any activity, so long as you are still here when it starts.');
    },
    tags: () => ({ extraPhase: 'any' }),
    apply(ctx, fx) { nullifyIfDuplicate(ctx.st, fx); },
    ai: { role: 'buff' },
};
