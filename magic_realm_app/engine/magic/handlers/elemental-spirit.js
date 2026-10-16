import { alterChit, unalterChit } from '../chitalt.js';

// Elemental Spirit (IV / Purple / Day): any of the caster's Type IV and Type VI Magic chits that he names change Type until Sunset tomorrow:
// each IV becomes a VIII and each VI a V (rule 4.6.10c). Only the Type changes; time and asterisks stay (RS CharacterActionChitComponent:547-554).
//
// Decisions (03-control-spells.md section 3 and question 10): only chits that are ready (active, not enchanted, not committed, not tired or wounded) can be named,
// and the casting chit never can; a VI that became a V can be enchanted into a Black chit, and then tires, not returns, when the spell ends; a spell cast with an
// altered chit ends with the alteration (chitalt.js). With no choice given, every eligible chit is taken.
const CHANGE = { IV: 'VIII', VI: 'V' };
const eligible = (st, castChit) => st.ch.chits.filter(c => c.type === 'magic' && c.state === 'active' && CHANGE[c.numeral] && c.id !== castChit);

export default {
    id: 'elemental-spirit', dur: 'day', benevolent: false,
    targets: { min: 1, max: 99 },
    // castable when some ready Type IV chit can cast it and there is another ready IV or VI chit to change
    legal: st => (eligible(st, null).length > 1 && eligible(st, null).some(c => c.numeral === 'IV') ? true : 'Elemental Spirit needs a ready Type IV chit to cast it and another Type IV or VI chit to change.'),
    aim: (st, data, { cast }) => {
        const out = eligible(st, cast?.chit).map(c => ({ ref: { kind: 'chit', id: c.id }, label: `Magic ${c.numeral}${c.time}${'*'.repeat(c.effort ?? 0)} becomes ${CHANGE[c.numeral]}` }));
        return out.length ? out : null;
    },
    autoAim: options => options.map(o => o.ref),
    // worth a prompt only when a Type VI chit can become a V (and so be enchanted into a Black chit); the rest is a plain choice during a fight
    useful: (st, data, opt) => eligible(st, opt?.chit).some(c => c.numeral === 'VI'),
    start(ctx) {
        const { st } = ctx;
        const chits = ctx.targets.filter(t => t.kind === 'chit').map(t => st.ch.chits.find(c => c.id === t.id)).filter(c => c && c.state === 'active' && CHANGE[c.numeral]);
        if (!chits.length) { ctx.log('Elemental Spirit: there is no chit it can change.'); return; }
        const was = chits.map(c => `${c.numeral}${c.time} -> ${CHANGE[c.numeral]}`);
        ctx.fx({ targets: chits.map(c => ({ kind: 'chit', id: c.id })), expires: { day: st.day + 1, at: 'sunset' } });
        ctx.log(`Elemental Spirit: ${chits.length} Magic chit${chits.length === 1 ? '' : 's'} change Type until Sunset tomorrow (${was.join(', ')}).`);
    },
    apply(ctx, fx) {
        for (const t of fx.targets) {
            const c = ctx.st.ch.chits.find(x => x.id === t.id);
            if (c && CHANGE[c.numeral] && !c.alts?.some(a => a.fx === fx.id)) alterChit(c, fx.id, CHANGE[c.numeral]);
        }
    },
    unapply(ctx, fx) {
        for (const t of fx.targets) { const c = ctx.st.ch.chits.find(x => x.id === t.id); if (c) unalterChit(ctx.st, ctx.data, c, fx.id); }
    },
    ai: { role: 'buff' },
};
