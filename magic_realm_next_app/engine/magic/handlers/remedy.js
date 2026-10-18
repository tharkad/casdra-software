import { breakFx, HERO } from '../fx.js';
import { characters, fxHere, castThisRound, targetWords, spellName } from '../util.js';

// Remedy (VIII / Grey / Instant): one spell or one curse in the caster's clearing. The target must already exist (not a spell cast this round) and is
// broken; duplicates of the spell are not affected. Unlike Dissolve Spell it also cures curses.
// Decisions (01-combat-spells.md section 14): a curse is named as { kind: 'curse', id: '<char>:<Name>' }, an effect by its fx id; an effect marked
// `data.uncancellable` (the Flying Carpet) cannot be named; the chit that was tied to a broken spell is fatigued by the break.

// Everything it may be aimed at right now: [{ ref, label, curse?, fx? }]
function targets(st, data) {
    const out = [];
    for (const c of characters(st)) for (const name of c.who.curses ?? []) out.push({ ref: { kind: 'curse', id: `${c.ref.id}:${name}`, on: c.ref, name }, label: `the ${name} curse on ${c.name}` });
    for (const f of st.fx ?? []) {
        if (f.state === 'done' || f.dur === 'instant' || castThisRound(st, f) || f.data?.uncancellable || !fxHere(st, f)) continue;
        out.push({ ref: { kind: 'fx', id: f.id }, label: `${spellName(data, f.spell)} on ${targetWords(st, data, f)}` });
    }
    return out;
}
export default {
    id: 'remedy', dur: 'instant', benevolent: true,
    aim: (st, data) => { const o = targets(st, data); return o.length ? o : null; },
    legal: (st, data) => (targets(st, data).length ? true : 'There is no spell or curse here to break.'),
    // worth a prompt when a curse lies on him or a spell that someone else cast bewitches him
    useful: (st, data) => targets(st, data).some(t => (t.ref.kind === 'curse' && t.ref.on.id === 'ch') || (t.ref.kind === 'fx' && (st.fx ?? []).some(f => f.id === t.ref.id && f.caster.id !== HERO.id && f.targets.some(x => x.kind === 'char' && x.id === 'ch')))),
    start(ctx) {
        const { st, data } = ctx, t = ctx.targets[0];
        if (t?.kind === 'curse') {
            const who = t.on.id === 'ch' ? st.ch : st.others?.[t.on.id], i = who?.curses?.indexOf(t.name) ?? -1;
            if (i < 0) { ctx.log('Remedy: that curse is already gone.'); return; }
            who.curses.splice(i, 1);
            ctx.log(`Remedy breaks the ${t.name} curse.`);
            return;
        }
        const f = (st.fx ?? []).find(x => x.id === t?.id);
        if (!f || f.state === 'done') { ctx.log('Remedy: that spell has already ended.'); return; }
        const name = spellName(data, f.spell);
        breakFx(st, data, f.id, 'Remedy');
        ctx.log(`Remedy breaks ${name}.`);
    },
    ai: { role: 'utility' },
};
