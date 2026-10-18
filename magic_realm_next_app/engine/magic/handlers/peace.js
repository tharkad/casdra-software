import { B } from '../bridge.js';
import { foes, denRef, denOf, foeName, reveal, nullifyIfDuplicate, setPeaceful } from '../util.js';

// Peace (I / White / Combat): one native or monster. If its target is anyone else's target the spell is instantly broken; otherwise the creature is unassigned
// and cannot be assigned again while the spell lives, and it cannot lure. The spell is broken when the creature is named as the target of an attack or spell.
// Decisions (01-combat-spells.md section 2, Question 6): the target is a live creature that is not a bystander and not already peaceful (a native that stands by
// is refused; to name it is to start the fight); "someone else's target" today means a hireling of his set on it (`engagedBy`): then the spell is broken at once
// and its chit tires at once (the spec's test line says "still committed to Midnight", but a broken spell ends and releases its chit, framework 1.6); a
// Tremendous monster that holds him lets go and turns its red side down; Peace on a character waits for a second character; area spells do not break it;
// casting at a creature names it, so a hidden caster is revealed.
const options = (st, data) => foes(st).filter(d => !d.bystander && !d.pacified).map(d => ({ ref: denRef(d), label: foeName(st, data, d) }));

export default {
    id: 'peace', dur: 'combat', benevolent: false,
    aim: (st, data) => { const o = options(st, data); return o.length ? o : null; },
    legal: (st, data) => (options(st, data).length ? true : 'There is no creature here to make peaceful.'),
    useful: st => foes(st).some(d => d.assigned && !d.bystander && !d.engagedBy),
    start(ctx) {
        const { st, data } = ctx, den = denOf(st, ctx.targets[0]);
        if (!den) { ctx.log('Peace finds no target.'); return; }
        reveal(ctx);
        const name = B.denSide(st, data, den).name;
        if (den.engagedBy) { ctx.log(`Peace: the ${name} is already someone else's target, so the spell is broken at once.`); return; }
        ctx.fx({ targets: [denRef(den)], expires: { day: st.day, at: 'midnight' } });
        ctx.log(`Peace: the ${name} loses interest in the fight and will not be set on you while the spell lasts.`);
    },
    tags: () => ({ unassigned: true, nameBreaks: true }),
    apply(ctx, fx) { if (!nullifyIfDuplicate(ctx.st, fx)) setPeaceful(ctx.st, fx.targets, true, fx); },
    unapply(ctx, fx) { setPeaceful(ctx.st, fx.targets, false, fx); },
    ai: { role: 'control' },
};
