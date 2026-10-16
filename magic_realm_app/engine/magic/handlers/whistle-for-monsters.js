import { tileClearings, tileOf, tileName } from '../../world.js';

// Whistle for Monsters (VIII / Purple / Instant): one face-up Sound chit anywhere on the map; it cannot be cast in a tile with fewer than six clearings or on a face-down
// chit. A chit that is not in the caster's tile is moved to it; one that is already there he may move to any other tile that has six clearings. Afterwards the Sound chit
// summons monsters to its new tile.
// Decisions (01-combat-spells.md section 13): the chit keeps its clearing number and its `summoned` flag (one that has called today stays spent); it is moved by changing
// chit.tile, so summon.js endOfTurn then matches it against the boxes by the new tile's letter; a chit in a Lost City or Lost Castle pile is not on the map and cannot be
// named; the second pick (which tile a chit that is already here goes to) is the aim parameter `tile`, and without one the first other six-clearing tile is taken; the
// computer players never cast it.
const sixTiles = (st, data) => st.placements.map(p => p.id).filter(t => tileClearings(st, data, t).length === 6);
const isSix = (st, data, at) => !!at && tileClearings(st, data, tileOf(at)).length === 6;
const sounds = st => st.chits.filter(c => c.kind === 'sound' && c.up && !c.pile);

export default {
    id: 'whistle-for-monsters', dur: 'instant', benevolent: false,
    legal: (st, data) => (!isSix(st, data, st.ch.at) ? 'Whistle for Monsters cannot be cast in a tile with fewer than six clearings.' : sounds(st).length ? true : 'No Sound chit is face up on the map.'),
    aim: st => { const o = sounds(st).map(c => ({ ref: { kind: 'chit', id: c.id }, label: `${c.name} (clearing ${c.num} of ${tileName(c.tile)})` })); return o.length ? o : null; },
    params: (st, data) => [{ key: 'tile', kind: 'choice', label: 'If the chit is in your tile already, move it to', options: sixTiles(st, data).filter(t => t !== tileOf(st.ch.at)).map(t => ({ value: t, label: tileName(t) })) }],
    useful: () => false,
    quiet: () => true,                                                // calling monsters to this tile is a deliberate choice (a hunt for Fame), whether or not anything is here yet
    start(ctx) {
        const { st, data } = ctx, here = tileOf(st.ch.at), c = st.chits.find(x => x.id === ctx.targets[0]?.id);
        if (!c) { ctx.log('Whistle for Monsters: there is no Sound chit face up to call.'); return; }
        let to = here;
        if (c.tile === here) {
            const others = sixTiles(st, data).filter(t => t !== here);
            to = others.includes(ctx.params.tile) ? ctx.params.tile : others[0];
            if (!to) { ctx.log('Whistle for Monsters: there is no other tile with six clearings to send it to.'); return; }
        }
        const from = c.tile;
        c.tile = to;
        ctx.log(`Whistle for Monsters: the ${c.name} from clearing ${c.num} is moved from the ${tileName(from)} to the ${tileName(to)}; it will call the monsters there${c.summoned ? ' (it has already called today, so not until tomorrow)' : ''}.`);
    },
    ai: { role: 'utility' },
};
