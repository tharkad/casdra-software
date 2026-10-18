import { HERO } from '../fx.js';
import { tileOf } from '../../world.js';
import { hostileOnly, startFx, targetsOr, tileRef } from '../helpers.js';
// Illusion (III / Gold / Permanent, one character or the spellcaster's hex tile): while energized each affected individual adds one to his result on every
// Search table (4.1.2, 7.5): Peer, Locate, Loot, the ground, the site-card tables, Reading Runes and Magic Sight. High is worse on all of them, so it is a
// nuisance spell. Not Hide, not Meeting. A tile target affects whoever is in the tile at the roll. DECISION (spec question 5): the site-card tables count
// as Search tables (7.5.1), as RealmSpeak does not. modifiers.js tableMod/modRoll read the tag. Hostile: never useful alone.
// Spec: docs/design/magic/02-day-spells.md section 14.
export default {
    id: 'illusion', dur: 'permanent', benevolent: false,
    useful: hostileOnly,
    aim: st => [{ ref: HERO, label: 'Yourself (nobody else is here)' }, ...(st.ch.at ? [{ ref: tileRef(tileOf(st.ch.at)), label: 'Everyone on this tile' }] : [])],
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO))) ctx.log('Illusion: the target adds one to every Search table roll while this is energized.');
    },
    tags: () => ({ tableMod: { kinds: 'search', delta: +1 } }),
    ai: { role: 'control' },
};
