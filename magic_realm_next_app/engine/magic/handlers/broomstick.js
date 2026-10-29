import { HERO, fxList } from '../fx.js';
import { dayUseful, startFx } from '../helpers.js';
import { broomstickHirelings } from '../../steeds.js';

// Broomstick (V / Black / Fly): "one Light character". It creates a Fly chit of Light strength and time 1 that the target can use to fly (card, repaired from RealmSpeak's
// text in tools/cardtext_fixes.json). Casting it has no immediate effect; the record is `held`, the V Magic chit stays committed, and using the Fly chit spends it and ends the spell
// (the chit then tires): in a Fly phase of the Daylight plan (day.js doFly), or in the Encounter step as a Move chit to fly away (combat.js encounterAction 'fly'). Unused it stays,
// as RealmSpeak keeps it (the chit is not a clock); an Exorcise, Remedy or Dissolve Spell breaks it, and it ends with its caster.
// Decisions (spec 02 section 8, RealmSpeak FlyChitEffect.java:10-38, Fly.java:85-96):
//   - SELF ONLY. The card lets the caster hold another Light character's chit and force it to fly (clauses 1 to 4: interrupt a Light Move chit in the Encounter step, invoke it at the
//     start of a Fly phase, force a Move that carries items to fly, and break the spell when the target plays a Move chit stronger than Light). With one hero those powers have no
//     one to act on; when the hero casts it on himself he "plays the Fly chit directly, without a Move chit" (the card's exception), which is what this does. The target must be
//     Light (his weight), the hero's `ch.weight`.
//   - A DENIZEN WITH A FLY CHIT (4.6.7e.2, 7.3.3d.2; steeds.js): when he has a Light hireling (a native in his pay, or a monster that is Light only because a Transform made it
//     one) in his clearing, the spell may be aimed at the hireling instead of himself. The chit is a held effect on the hireling; he "can use the Fly chit in place of his own move
//     values", which for a follower means he can follow a flying guide (7.3.3a.4), and the chit expires when the guide lands. With no such hireling the spell has no aim (as it
//     always had) and is cast on himself.
//   - Clause 4 therefore never fires; a hero who plays a stronger Move chit just keeps the spell. If a second character is ever the target, clause 4's text is in cardtext.
//   - A held Fly chit is not a spell "in force" for Melt into Mist's switch-off: a mist hero is simply refused it (fly.js flySources).
//   - Quiet evenings prompt for it (`useful`) only while he holds none, so the prompt is not nightly. The computer players have no Fly plan: one that learned Broomstick would
//     cast it once and never fly, tying up a Type V chit (none of the starting hands the grind uses holds a Type V spell).
export default {
    id: 'broomstick', dur: 'fly', benevolent: true, selfOnly: true,
    legal: (st, data) => (st.ch.weight === 'L' || broomstickHirelings(st, data).length ? true : 'Broomstick can be cast only on a character of Light weight.'),
    // the targets, when he has a Light hireling to put the chit on: himself (if he is Light) or the hireling. With none, no target is asked for.
    aim: (st, data) => { const h = broomstickHirelings(st, data); return h.length ? [...(st.ch.weight === 'L' ? [{ ref: HERO, label: 'yourself' }] : []), ...h] : null; },
    useful: st => dayUseful(st) && st.ch.weight === 'L' && !fxList(st, { spell: 'broomstick', target: HERO, any: true }).length,
    start(ctx) {
        const t = ctx.targets?.[0];
        if (t && t.kind !== 'char') {
            const fx = startFx(ctx, [t], { state: 'held', expires: null, data: { strength: 'L', time: 1 } });
            if (fx) ctx.log('Broomstick: your hireling now holds a Fly chit (Light, time 1). He uses it in place of his own move values, to follow you when you fly. It is spent when you land.');
            return;
        }
        const fx = startFx(ctx, [HERO], { state: 'held', expires: null, data: { strength: 'L', time: 1 } });
        if (fx) ctx.log('Broomstick: you now hold a Fly chit (Light, time 1). Use it in a Fly phase, or in a fight to fly away. It is spent when used.');
    },
    ai: { role: 'utility' },
};
