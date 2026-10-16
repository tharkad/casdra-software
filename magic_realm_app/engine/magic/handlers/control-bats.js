import { controllable, takeControl, releaseControl } from '../followers.js';

// Control Bats (VII / any colour / Day): every Giant Bat in the caster's clearing is his until Sunset of the next day.
// Audit (docs/design/magic/03-control-spells.md section 2): the Bats now fight for him from the next round (B1: they are on c.hires and lure the
// attackers), the target is every monster of the Bat family and not only the Giant Bat (B6), a Bat his hirelings already fight is not taken (B6),
// and a Bat that dies costs him its Notoriety bounty while one that kills pays him the bounty (B7, the generalised hireling rules in combat.js).
const BAT = ['Bat'];
export default {
    id: 'control-bats', dur: 'day', benevolent: false,
    useful: (st, data) => controllable(st, data, BAT).length > 0,
    start(ctx) {
        const { st, data } = ctx;
        const fx = takeControl(ctx, controllable(st, data, BAT), { text: bats => `Control Bats: ${bats.length === 1 ? 'the Giant Bat is' : `all ${bats.length} Giant Bats are`} yours. They fight for you and follow you until Sunset tomorrow, when they are free again.` });
        if (!fx) ctx.log('Control Bats: there are no Bats here to take.');
    },
    // the Bats are free again when the spell ends (Sunset tomorrow, or when it is broken)
    unapply: (ctx, fx) => releaseControl(ctx, fx),
    ai: { role: 'control' },
};
