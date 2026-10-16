import { nullifyIfDuplicate } from '../util.js';
import { dayUseful } from '../helpers.js';
import { fxList } from '../fx.js';

// Unleash Power (VI / Purple / Day): any number of the caster's Magic chits. Each chit named becomes a "Move/Fight" chit: it can be played as a Move chit or as a Fight
// chit (once a round, not both), carries items like a Move chit, keeps its time number and effort asterisks, and its time number defines its strength (time 2 or 3
// Light, 4 Medium, 5 Heavy, 6 or more Tremendous). While it is transformed it cannot be used as a Magic chit.
// Decisions (01-combat-spells.md section 10): the overlay is `chit.alt = { mf: true, strength }` (the chit's own `type` stays 'magic', so the readers of st.ch.chits
// that do not care are untouched); combat.js activeChits offers it as a Move chit and as a Fight chit (one play a round, since both share the chit's id), items.js
// carryCapacity counts it as a Move chit, and the casting list, the enchant list and the effort payment of a spell skip or accept it as the card says; a time of 1
// counts as Light (the card does not say); Elven Grace leaves it alone; the Belt of Strength and the speed cards are not in the game yet. Which chits may be named: the
// other Magic chits that are ready (not the casting chit, nor one that is tired, wounded, enchanted, committed or already transformed). The spell lasts until Sunset of
// the next day, when the overlay comes off and the chits are Magic chits again, in whatever state they are in; the casting chit then tires. The computer players never
// cast it (they do not know how to use the chits).
export const strengthOfTime = t => (t >= 6 ? 'T' : t === 5 ? 'H' : t === 4 ? 'M' : 'L');
const ready = (st, c) => c.type === 'magic' && c.state === 'active' && !c.alt && !st.combat?.played?.[c.id];

export default {
    id: 'unleash-power', dur: 'day', benevolent: true, targets: { min: 1, max: 12 },
    aim: st => {
        const o = st.ch.chits.filter(c => ready(st, c)).map(c => ({ ref: { kind: 'chit', id: c.id }, label: `Magic ${c.numeral}${c.time}${'*'.repeat(c.effort)}: Move/Fight ${strengthOfTime(c.time)}${c.time}` }));
        return o.length ? o : null;
    },
    legal: st => (st.ch.chits.some(c => ready(st, c)) ? true : 'You have no other ready Magic chit to transform.'),
    useful: () => false,
    quiet: st => dayUseful(st) && !fxList(st, { spell: 'unleash-power', any: true }).length,       // Move/Fight chits for tomorrow; asked only while none is on
    start(ctx) {
        const { st } = ctx;
        const refs = ctx.targets.filter(t => st.ch.chits.some(c => c.id === t.id && ready(st, c)));
        if (!refs.length) { ctx.log('Unleash Power: there is no Magic chit to transform.'); return; }
        ctx.fx({ targets: refs, expires: { day: st.day + 1, at: 'sunset' } });
        ctx.log(`Unleash Power: ${refs.map(r => { const c = st.ch.chits.find(x => x.id === r.id); return `Magic ${c.numeral}${c.time}${'*'.repeat(c.effort)} (${strengthOfTime(c.time)})`; }).join(', ')} can be played as Move or Fight chits until Sunset tomorrow.`);
    },
    apply(ctx, fx) {
        if (nullifyIfDuplicate(ctx.st, fx)) return;
        for (const t of fx.targets) { const c = ctx.st.ch.chits.find(x => x.id === t.id); if (c) { c.alt = { mf: true, strength: strengthOfTime(c.time), fx: fx.id }; c.alerted = false; } }
    },
    unapply(ctx, fx) {
        for (const t of fx.targets) { const c = ctx.st.ch.chits.find(x => x.id === t.id); if (c?.alt?.fx === fx.id) delete c.alt; }
    },
    ai: { role: 'buff' },
};
