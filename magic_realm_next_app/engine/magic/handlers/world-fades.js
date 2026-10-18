import { HERO } from '../fx.js';
import { alreadyOn, startFx, targetsOr } from '../helpers.js';
// World Fades (VI / Black / Permanent, one character): while energized, if the target is unhidden and has no denizen on his Melee Section at the end of a round of
// combat he rolls on the Hide table; on a 1 to 5 he hides and stays hidden until he is revealed normally (he can hide and be discovered over and over). He must also
// start (or stop) using Magic Sight when he does the Search activity (7.5.7): see magic/sight.js, where the sources of Magic Sight are counted by parity, so with the
// Witch King's Disembodied or the Phantom Glass it switches Magic Sight OFF. Spec: docs/design/magic/02-day-spells.md section 16.
// DECISIONS: (1) "no denizens on his Melee Section" is read as RealmSpeak reads it (BattleModel.java:1672-1696, attacker count of zero): no live denizen is assigned to
// him or holding him at the end of the round; a creature a hireling has engaged, a pacified or controlled one, and a bystander are not on his sheet. His hirelings do
// not matter. (2) The roll is the Hide table with his usual Hide modifiers (one die for the Druid and the like, Bad Luck's +1); the Squeak curse forbids it (RS prints
// "cannot hide due to Squeak"). (3) The roll is made at the end of the round even when that round ends the fight (nothing else would be left to do, but he walks out of
// the evening hidden). (4) The AI treats it as a buff: it is cast once and kept. The roll itself is combat.js worldFadesRoll.
export default {
    id: 'world-fades', dur: 'permanent', benevolent: true,
    useful: () => false,                              // a one-off, long-lived spell: never worth a quiet-evening prompt (it is on the list in every fight)
    quiet: st => !alreadyOn(st, 'world-fades', HERO),                 // a long-lived Permanent spell is cast in an evening, quiet or not; asked only until it is on
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO))) ctx.log('World Fades: while it is energized (Black magic) you may slip from sight at the end of a combat round, and you search with Magic Sight (or stop doing so).');
    },
    tags: () => ({ combatHide: true, magicSight: true }),
    ai: { role: 'buff' },
};
