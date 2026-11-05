import { HERO } from '../fx.js';
import { tileOf } from '../../world.js';
import { hostileOnly, startFx, targetsOr, tileRef } from '../helpers.js';
// Lost (III / Gold / Permanent, one character or the spellcaster's hex tile): while energized an affected individual who uses the Move activity to leave a
// clearing does not go where he recorded: the Lost Table decides which adjacent clearing he reaches (7.3.1). It does not apply when he runs, when he
// starts a move from a road, or when he flies. A tile target affects every individual who starts a Move in a clearing of that tile.
// DECISIONS (the Lost Table is not in our data; spec question 3 recommends the RealmSpeak reading): one die is a clearing number; he goes to the adjacent
// clearing with that number by any road, including hidden paths and secret passages he has not discovered; none: the Move is lost; several: he goes to
// the one he recorded if it is among them, else the first (the spec has him pick; a pending question is left for the UI). A mountain result still takes
// its two Move phases and the die is rolled again on the second (question 15). day.js doMove consults lostActive() and lostMove().
// Hostile: never useful alone. Spec: docs/design/magic/02-day-spells.md section 13.
export default {
    id: 'lost', dur: 'permanent', benevolent: false,
    useful: hostileOnly,
    aim: st => [{ ref: HERO, label: 'Yourself (nobody else is here)' }, ...(st.ch.at ? [{ ref: tileRef(tileOf(st.ch.at)), label: 'Everyone on this tile' }] : [])],
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO))) ctx.log('Lost: the target will wander randomly whenever he leaves a clearing while this is energized.');
    },
    tags: () => ({ randomMove: true }),
    ai: { role: 'control' },
};
