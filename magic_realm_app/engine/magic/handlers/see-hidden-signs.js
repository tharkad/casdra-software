import { HERO, fxList } from '../fx.js';
import { dayExpiry, dayUseful, startFx, targetsOr } from '../helpers.js';
// See Hidden Signs (III / Gold / Day, one character): the target can record and do one extra Search phase on his turn (6.2.2, 6.2.4a). It stacks with
// Magic Spectacles. Same clock as Blend Into Background. Spec: docs/design/magic/02-day-spells.md section 7.
export default {
    id: 'see-hidden-signs', dur: 'day', benevolent: true,
    useful: (st, data) => dayUseful(st) && !fxList(st, { spell: 'see-hidden-signs', target: HERO, any: true }).length,
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO), { expires: dayExpiry(ctx.st) })) ctx.log('See Hidden Signs: you may record and do one extra Search phase tomorrow. It ends at Sunset tomorrow.');
    },
    tags: () => ({ extraPhase: 'search' }),
    ai: { role: 'buff' },
};
