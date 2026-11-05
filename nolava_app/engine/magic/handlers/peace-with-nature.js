import { HERO, fxList } from '../fx.js';
import { startFx, targetsOr } from '../helpers.js';
// Peace with Nature (VII / Gold / Permanent, one character): when the target ends his turn, the Warning and Sound chits of his tile do not summon
// (7.13.2, 7.13.5b). While energized only; it falls inert at Midnight unless Gold is supplied by something that stays. summon.js endOfTurn consults the tag
// through peaceWithNature(st), the same helper that serves the Druid's advantage of the same name. Spec: docs/design/magic/02-day-spells.md section 11.
export default {
    id: 'peace-with-nature', dur: 'permanent', benevolent: true,
    // worth a prompt only when he does not already have it (the Druid has it for free) and has not cast it
    useful: (st) => !(st.ch.adv ?? []).includes('peace-with-nature') && !fxList(st, { spell: 'peace-with-nature', target: HERO, any: true }).length,
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO))) ctx.log('Peace with Nature: the Warning and Sound chits of the tile where your turn ends will keep quiet while this spell is energized.');
    },
    tags: () => ({ noSummon: true }),
    ai: { role: 'utility' },
};
