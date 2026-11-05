import { HERO } from '../fx.js';
import { alreadyOn, dayExpiry, dayUseful, startFx, targetsOr } from '../helpers.js';
import { dropCompanions } from '../companion.js';
// Phantasm (VI / Purple / Day, one character): at Birdsong of the next day the target puts a piece beside himself and records a separate turn for it: the same Basic and
// Sunlight phases as everyone, but only Move, Peer and Enchant. It takes its turn just before the target, enchants with the target's Magic chits, and shares his
// discoveries. It cannot carry anything, follow or be followed, spy or be spied on, block or be blocked, and it summons nothing. The spell (and the piece) ends at Sunset of
// that day and the casting chit then tires. Spec: docs/design/magic/03-control-spells.md section 8; the card text was repaired from RealmSpeak's rtf.
// The piece is a COMPANION (magic/companion.js): beginDay puts it beside the hero while this spell is live, `plan` carries its recorded turn (`companions: { id: slots }`),
// sunrise runs it before his first phase. DECISIONS: (1) follow the card, not RealmSpeak: it appears at Birdsong, not at the cast (so nothing exists during the evening it is
// cast, and it never meets a combat). (2) One meditation per character per day, shared with the hero (spec question 7). (3) A Peer "Choice" takes the result that shows
// the hero the most that he does not know, as Talk to Wise Bird does. (4) The hero learns of Hidden Enemies it finds only if he is in its clearing then. (5) If the hero starts
// the day on a road (he fled), the piece stands at the clearing he fled from. (6) An unwanted piece vanishes when the spell ends for any reason (broken, nullified); a
// Pentangle or Protection from Magic that restores it does not bring it back the same day. (7) Not "useful": the computer players cannot plan a second turn.
export default {
    id: 'phantasm', dur: 'day', benevolent: true,
    useful: () => false,
    quiet: st => dayUseful(st) && !alreadyOn(st, 'phantasm', HERO),            // a second turn tomorrow: a legitimate quiet-evening cast
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO), { expires: dayExpiry(ctx.st) })) ctx.log('Phantasm: tomorrow at Birdsong a piece appears beside you and you record a second turn for it (Move, Peer and Enchant). It ends at Sunset tomorrow.');
    },
    unapply(ctx, fx) { dropCompanions(ctx.st, fx.id); },
    tags: () => ({ companion: 'phantasm' }),
    ai: { role: 'utility' },
};
