import { HERO } from '../fx.js';
import { alreadyOn, dayExpiry, dayUseful, startFx, targetsOr } from '../helpers.js';
// Prophecy (II / Purple / Day, one character): the target ignores his recorded turn and chooses what to do at each phase of his turn as he does it. He gets the same number
// of phases and the same kinds of activity as a recorded turn gives, except that an extra or enhanced activity from a belonging can be used as soon as he activates the
// belonging. If the spell is broken before he finishes his turn he is instantly blocked. His hired leaders, controlled monsters, familiars and phantasms still do the turns
// recorded for them (see companion.js: the plan action still carries those). Cast in the Evening of day D it serves Birdsong and Daylight of D+1 and ends at Sunset of D+1.
// Spec: docs/design/magic/02-day-spells.md section 3. The engine side is magic/prophecy.js and day.js (pending 'phase-pick', action 'pick').
// DECISIONS: (1) the Sunlight/cave rule is applied lazily: the two Sunlight phases are lost as soon as he is in a cave or has been in one today (and a Move into a cave in a
// Sunlight phase is refused, as for a recorded turn). (2) A suspension (Protection from Magic active) counts as a break (spec question 9): he is blocked at the end of that
// phase, or at once if he tries to pick. (3) Only one horse a day gives extra phases (the engine has one active horse already). (4) A plan sent with the Birdsong action under
// Prophecy is taken as a SUGGESTION: the autoplay and the computer players follow it phase by phase instead of asking; a person simply sends `slots: []` and picks as he goes.
// (5) Not "useful" (a quiet evening never asks for it, and the computer players, who cannot choose phase by phase, never cast it).
export default {
    id: 'prophecy', dur: 'day', benevolent: true,
    useful: () => false,
    quiet: st => dayUseful(st) && !alreadyOn(st, 'prophecy', HERO),            // cast tonight it serves tomorrow: worth a quiet-evening prompt unless it is already on
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO), { expires: dayExpiry(ctx.st) })) ctx.log('Prophecy: tomorrow you need not record a turn; you choose each phase as it comes. It ends at Sunset tomorrow.');
    },
    tags: () => ({ prophecy: true }),
    ai: { role: 'utility' },
};
