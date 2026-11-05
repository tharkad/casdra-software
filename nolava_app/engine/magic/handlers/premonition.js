import { HERO } from '../fx.js';
import { dayExpiry, startFx, targetsOr } from '../helpers.js';
// Premonition (VII / Grey / Day, one character): the target chooses when he takes his turn in Daylight (7.1). The game has one hero and no
// Attention-chit draw (the Monster Roll is made before any turn), so with one character it does nothing. RECORD ONLY: the spell can be learned and
// cast and ends at Sunset tomorrow; the tag `preempt` is what a multi-character turn order will read (docs/design/multi-character-and-multiplayer.md).
// Never useful alone (decision 2 of the spec). Spec: docs/design/magic/02-day-spells.md section 9.
export default {
    id: 'premonition', dur: 'day', benevolent: true,
    useful: () => false,
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO), { expires: dayExpiry(ctx.st) })) ctx.log('Premonition: you may choose when to take your turn tomorrow (nothing changes while you are alone).');
    },
    tags: () => ({ preempt: true }),
    ai: { role: 'utility' },
};
