import { HERO, fxList } from '../fx.js';
import { dayExpiry, dayUseful, startFx, targetsOr } from '../helpers.js';
// Blend Into Background (II / Grey / Day, one character): the target can record and do one extra Hide phase on his turn (6.2.2, 6.2.4a).
// Cast in the Evening of day D, it serves Birdsong and Daylight of day D+1 and ends at Sunset of D+1. The phase may be used for Hide only, needs no
// Sunlight and may be taken in a cave. Spec: docs/design/magic/02-day-spells.md section 1.
export default {
    id: 'blend-into-background', dur: 'day', benevolent: true,
    useful: (st, data) => dayUseful(st) && !fxList(st, { spell: 'blend-into-background', target: HERO, any: true }).length,
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO), { expires: dayExpiry(ctx.st) })) ctx.log('Blend Into Background: you may record and do one extra Hide phase tomorrow. It ends at Sunset tomorrow.');
    },
    tags: () => ({ extraPhase: 'hide' }),
    ai: { role: 'buff' },
};
