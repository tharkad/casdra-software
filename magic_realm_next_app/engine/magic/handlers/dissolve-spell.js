import { tileOf } from '../../world.js';
import { breakFx, HERO, sameRef } from '../fx.js';
import { handlerOf } from '../registry.js';

// Dissolve Spell (VI / Purple / Instant): one spell in force in the caster's clearing that already existed when it was named is broken; its duplicates are not.
// It cannot break a curse (curses are not spells in effect in this engine) and not a spell cast this round. The chit that cast the broken spell tires (fx.js finish).
// Decisions: a spell counts as "in the clearing" when one of its targets is a piece, chit or item of his (he is there), a denizen standing here, the clearing, or its tile;
// Instant and Attack spells never persist so they never qualify; a handler may mark its spell `noCancel` (Flying Carpet). He may dissolve his own spell (an exit from
// a Transform he regrets). The Dissolve is useful (worth a prompt on a quiet evening) only when someone else's spell is there; named with nothing chosen, the
// computer's choice is the first spell that is not his own, else his first.
const PERSISTS = f => f.dur !== 'instant' && f.dur !== 'attack';
const hereRef = (st, data, t) => {
    const at = st.combat?.at ?? st.ch.at;
    if (t.kind === 'mon') return st.mons.find(m => m.id === t.id)?.loc?.c === at;
    if (t.kind === 'nat') return st.nats.find(n => n.id === t.id)?.loc?.c === at;
    if (t.kind === 'clearing') return t.id === at;
    if (t.kind === 'tile') return t.id === tileOf(at);
    return t.kind === 'char' || t.kind === 'chit' || t.kind === 'item';
};
export const dissolvable = (st, data) => (st.fx ?? []).filter(f => f.state !== 'done' && PERSISTS(f) && !handlerOf(f.spell)?.noCancel
    && !(f.castDay === st.day && f.castRound != null && f.castRound === st.combat?.round)                      // not one cast during this round
    && (!f.targets.length || f.targets.some(t => hereRef(st, data, t))));

const describe = (st, data, f) => {
    const name = data.spells[f.spell]?.name ?? f.spell, own = sameRef(f.caster, HERO);
    const on = f.targets.length === 1 && f.targets[0].kind === 'char' ? 'you' : f.targets.length > 1 ? `${f.targets.length} targets` : f.targets[0] ? (f.targets[0].kind === 'mon' ? data.monsters[f.targets[0].id]?.name : f.targets[0].kind === 'nat' ? data.natives[f.targets[0].id]?.name : f.targets[0].kind) : 'nothing';
    return `${name}${own ? ' (yours' : ' (another’s'}, on ${on})`;
};

export default {
    id: 'dissolve-spell', dur: 'instant', benevolent: false,
    targets: { min: 1, max: 1 },
    legal: (st, data) => (dissolvable(st, data).length ? true : 'There is no spell in effect here to dissolve.'),
    aim: (st, data) => {
        const out = dissolvable(st, data).map(f => ({ ref: { kind: 'fx', id: f.id }, label: describe(st, data, f) }));
        return out.length ? out : null;
    },
    autoAim: (options, st) => { const f = options.find(o => !sameRef(st.fx.find(x => x.id === o.ref.id)?.caster, HERO)) ?? options[0]; return [f.ref]; },
    useful: (st, data) => dissolvable(st, data).some(f => !sameRef(f.caster, HERO)),
    start(ctx) {
        const { st, data } = ctx;
        const t = ctx.targets.find(x => x.kind === 'fx'), fx = t && st.fx?.find(f => f.id === t.id && f.state !== 'done');
        if (!fx) { ctx.log('Dissolve Spell: the spell it was aimed at is already gone.'); return; }
        const name = data.spells[fx.spell]?.name ?? fx.spell;
        breakFx(st, data, fx.id, 'dissolved');
        ctx.log(`Dissolve Spell: ${name} is broken.`);
    },
    ai: { role: 'utility' },
};
