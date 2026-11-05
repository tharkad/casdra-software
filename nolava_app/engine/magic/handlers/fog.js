import { tileOf } from '../../world.js';
import { dayExpiry, hostileOnly, startFx, tileRef } from '../helpers.js';
// Fog (II / Grey / Day, the spellcaster's hex tile): nobody who does the Search activity in that tile, or into it from a mountain next door, may use
// the Peer table (7.5.4b). Spells and Treasure cards that Peer are not stopped (the card; RealmSpeak also stops card-based Peer, a divergence we do not
// follow), and Locate, Loot and Reading Runes are untouched. A Locate or Peer "Choice" may still take a Peer result: Fog stops using the table.
// Hostile, so with one hero nobody is hurt but himself: never useful. It ends at Sunset of the next day.
// search.js peerBlocked() reads the tag. Spec: docs/design/magic/02-day-spells.md section 2.
export default {
    id: 'fog', dur: 'day', benevolent: false,
    useful: hostileOnly,
    start(ctx) {
        const tile = ctx.targets[0]?.kind === 'tile' ? ctx.targets[0] : tileRef(tileOf(ctx.st.ch.at));
        if (startFx(ctx, [tile], { expires: dayExpiry(ctx.st) })) ctx.log('Fog: a thick fog settles over the whole tile. Nobody can use the Peer table there until Sunset tomorrow.');
    },
    tags: () => ({ noPeer: true }),
    ai: { role: 'control' },
};
