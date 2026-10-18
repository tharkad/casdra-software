import { B } from '../bridge.js';
import { fxTags, HERO, targetGone } from '../fx.js';
import { creatureOfMonster, putOn, takeOff, holdUnderShield } from '../morph.js';
import { reveal } from '../util.js';

// Absorb Essence (V / Black / Permanent): one monster, even a hired or controlled one. The caster is transmorphized into it: the monster leaves play into the spell for as
// long as the spell lives (it is not killed and does not regenerate), and the caster plays its counter instead of his own chits whenever the spell is energized.
// docs/design/magic/03-control-spells.md section 4 and the "Implementation notes" at its end; the mode itself is in magic/morph.js.
//
// Decisions (the spec's recommended answers; the first three are rules, the rest are ours):
//  1. The caster and the monster are one entity even while the spell is inert: the monster stays out of play (m.absorbed = the spell, loc in the box 'absorbed') and
//     dies with him; he is a man again, with his own chits, while the spell is inert, and the next energizing makes him the same monster (no choice to make).
//  2. Broken (Dissolve, Exorcise): the monster appears at once in his clearing (card 1.2) and is an ordinary foe again from the next round. The Exorcise that breaks it
//     does not kill an absorbed Demon: the Demon is out of play when Exorcise kills the Demons in the clearing (spec question 8).
//  3. He dies: the monster dies with him (card 1.1). With one hero there is no killer to score the bounty.
//  4. Everything bewitching the monster is let go (card 1): its other spells end (fx.targetGone), a hired or controlled monster is no longer anyone's.
//  5. A monster that is itself under a Transform is not offered (we would have to absorb the shape and not the counter).
//  6. Belongings are not transmorphized, but they are switched off while he is the monster and switched on again afterwards (RS TransmorphEffect:291-296); he can drop them.
//  7. "Special: when energized he can use the monster's Magic type to record spells" is not built (the spec defers it); two Absorb Essence spells: the one energized last
//     shapes him (card 3), fx.js claim; a Transform (2) beats Absorb Essence (1) and Melt into Mist (3) beats both.
//  8. The computer players never cast it (useful is false): it is a strategic gamble.
const present = (st, data) => {
    const c = st.combat, out = [];
    const ok = id => !fxTags(st, { kind: 'mon', id }, 'morph').length;
    for (const d of c?.dens ?? []) if (d.kind === 'mon' && !d.dead && ok(d.id)) out.push({ ref: { kind: 'mon', id: d.id }, label: `${B.denSide(st, data, d).name}${d.bystander ? ' (standing by)' : ''}` });
    for (const h of c?.hires ?? []) if (h.kind === 'mon' && !h.dead && ok(h.id)) out.push({ ref: { kind: 'mon', id: h.id }, label: `${data.monsters[h.id].name} (yours)` });
    return out;
};

export default {
    id: 'absorb-essence', dur: 'permanent', strength: 1, transmorph: true, benevolent: false,
    targets: { min: 1, max: 1 },
    aim: (st, data) => { const o = present(st, data); return o.length ? o : null; },
    legal: (st, data) => (present(st, data).length ? true : 'There is no monster here to absorb.'),
    useful: () => false,
    start(ctx) {
        const { st, data } = ctx, c = st.combat, t = ctx.targets[0];
        const m = t && st.mons.find(x => x.id === t.id && !x.dead && !x.absorbed);
        if (!m) { ctx.log('Absorb Essence: the monster is no longer there; the spell fizzles.'); return; }
        reveal(ctx);
        const name = data.monsters[m.id].name;
        // let go of everything bewitching it: its spells end, a controlled or hired monster is nobody's
        targetGone(st, data, { kind: 'mon', id: m.id });
        m.hired = false; delete m.hiredBy; m.controlledUntil = null; m.hiredUntil = null; m.tie = null; m.pacify = null;
        // out of the fight: no blow of its lands, nothing is assigned to it, it pays nobody
        for (const h of c.hires ?? []) if (h.kind === 'mon' && h.id === m.id) h.dead = true;
        const den = c.dens.find(d => d.kind === 'mon' && d.id === m.id);
        if (den) {
            den.dead = true; den.absorbed = true; den.assigned = false; den.engagedBy = null; den.pickedUp = false; den.side = 'light'; den.pacified = false;
            for (const p of c.dens.filter(d => d.partOf === den.uid)) p.dead = true;
            for (const h of c.hires ?? []) if (h.target === den.uid) h.target = null;
        }
        m.loc = { box: 'absorbed' }; m.absorbed = 'pending';
        const fx = ctx.fx({ targets: [HERO], strength: 1, data: { mon: m.id } });
        m.absorbed = fx.id;
        ctx.log(`Absorb Essence: the ${name} is drawn into you and is gone from the world. ${fx.state === 'live' ? `You are the ${name} until Midnight (and whenever the spell is energized again).` : 'A stronger spell holds you down, so for now you are yourself.'}`);
        c.eventful = true;
    },
    apply(ctx, fx) {
        const { st, data } = ctx;
        if (st.ch.dead) return;
        if (holdUnderShield(st, fx)) return;
        fx.data.creature ??= creatureOfMonster(data, fx.data.mon);
        putOn(st, data, fx, fx.data.creature, { hold: false });
        ctx.say(`You become the ${fx.data.creature.name}: you fight with its counter, and your gear is of no use to you.`);
    },
    // the form ends for a while (inert at Midnight, held off by a Pentangle, beaten by a stronger spell) or for good
    unapply(ctx, fx, info) {
        const { st } = ctx;
        if (st.ch.morph?.fx !== fx.id) return;
        takeOff(st, ctx.data, fx);
        if (!st.ch.dead) ctx.say(info.why === 'inert' ? 'The magic fades: you are yourself again.' : 'You are yourself again.');
    },
    // the spell is over (broken, or he died): the monster comes back to his clearing, or dies with him
    release(ctx, fx) {
        const { st, data } = ctx, m = st.mons.find(x => x.id === fx.data.mon);
        if (!m || m.absorbed !== fx.id) return;
        m.absorbed = null;
        const name = data.monsters[m.id].name;
        if (st.ch.dead) { m.dead = true; m.loc = null; ctx.say(`The ${name} dies with you.`); return; }
        const at = st.ch.onRoad ? st.ch.onRoad.from : st.ch.at;
        m.loc = { c: at };
        ctx.say(`The ${name} appears in your clearing.`);
        if (st.combat && !st.combat.ended && st.combat.at === at) B.monsterLeaves(st, data, m);
    },
    ai: { role: 'utility' },
};
