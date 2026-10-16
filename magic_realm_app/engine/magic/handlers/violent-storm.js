import { roll2, noteRoll } from '../../core.js';
import { tileOf } from '../../world.js';
import { nullifyIfDuplicate } from '../util.js';

// Violent Storm (IV / Purple / Day): the caster's hex tile. He rolls on the Violent Storm Table (two dice, higher counts) once, when he casts it; the result is the
// number of phases that a character must cancel when he ends a phase in a woods or mountain clearing of the tile that has no Inn, House, Chapel or Guardhouse
// (campfires are affected), once a turn.
// Decisions (01-combat-spells.md section 8, Question 11): the table is RealmSpeak's (1: 4, 2-3: 3, 4-5: 2, 6: 1; tables.json violentStorm, to be checked against the printed
// table); the storm is a tag `storm` (the number of phases) on the tile, read by day.js stormCheck at the end of each phase; the character loses the last activities
// still to come (the card lets him choose; there is no question for it in the interface yet); it lasts until Sunset of the next day, so it costs the next day's turn;
// Pentangle and Protection from Magic do not stop it (it is aimed at the tile); the computer players never cast it.
export default {
    id: 'violent-storm', dur: 'day', benevolent: false,
    legal: st => (st.ch.at ? true : 'There is no clearing to storm.'),
    useful: () => false,
    start(ctx) {
        const { st, data } = ctx, tile = tileOf(st.ch.at);
        const r = roll2(st), phases = data.tables.violentStorm.rows[String(r.value)];
        noteRoll(st, 'Violent Storm', r.dice, r.value, `${phases} phase${phases === 1 ? '' : 's'} lost`);
        ctx.fx({ targets: [{ kind: 'tile', id: tile }], expires: { day: st.day + 1, at: 'sunset' }, data: { phases } });
        ctx.log(`Violent Storm: a tempest breaks over the ${tile} tile until Sunset tomorrow. Whoever ends a phase in an exposed woods or mountain clearing there loses ${phases} phase${phases === 1 ? '' : 's'}, once a day.`);
    },
    tags: fx => ({ storm: fx.data.phases }),
    apply(ctx, fx) { nullifyIfDuplicate(ctx.st, fx); },
    ai: { role: 'utility' },
};
