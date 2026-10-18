import { HERO, fxList } from '../fx.js';
import { startFx, targetsOr } from '../helpers.js';
// Sense Danger (VII / Purple / Permanent, one character): while energized the target can record and do one extra Alert phase on his turn (6.2.2, 7.9.3).
// To be recorded at Birdsong it must already be energized then (an item must be active at Birdsong, 6.2.2), so a plan screen can offer the free energize
// action (energizeWith) and burn a Purple chit (decision 8 of the spec: yes; it lasts to Midnight). The Alert phase may alert a weapon or one ready Magic
// chit (doAlert in day.js; an alerted Magic chit has time 0 and tires at Midnight). Spec: docs/design/magic/02-day-spells.md section 10.
export default {
    id: 'sense-danger', dur: 'permanent', benevolent: true,
    // a Permanent spell is cast once and kept (its chit stays tied to it): worth a prompt only when he has not got it yet
    useful: (st) => !fxList(st, { spell: 'sense-danger', target: HERO, any: true }).length,
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO))) ctx.log('Sense Danger: while it is energized (Purple magic) you may record and do one extra Alert phase.');
    },
    tags: () => ({ extraPhase: 'alert' }),
    ai: { role: 'buff' },
};
