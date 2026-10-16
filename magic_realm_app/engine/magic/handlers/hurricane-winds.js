import { B } from '../bridge.js';
import { isMountain, tileOf, tileName } from '../../world.js';
import { adjacentTiles, denRef, denOf, foes, foeName, reveal } from '../util.js';

// Hurricane Winds (IV / Purple / Fly): one character, monster or native; cast only in a mountain clearing. It creates a Fly chit (Tremendous, time 1) that the target
// must use to fly away just before the next Encounter Step; the caster chooses which adjacent tile it lands in. A red-side-up Tremendous monster, or the target of one,
// is dropped at once and the monster turns red-side-down. A denizen that does not record turns lands at the beginning of the next day.
// Decisions (01-combat-spells.md section 16, Question 9): the target is a denizen on the combat sheet (the hero as a target needs a flying location the engine does not
// have yet, so he cannot be named); the spell is the tag-less fx `fly` holding the target and the destination tile (data.tile); combat.js flyAway takes the creature, its
// parts and its horse out of the fight just before the next Encounter Step (no bounty, and with no foe left the fight ends) and puts it in the air (loc = { tile, flying });
// day.js landDenizens lands it at the start of the next day in a clearing a die picks, rolled again for a number the tile lacks. The Magic chit stays committed until the
// flight, then tires; if the target dies first, or the day ends with no flight, the spell ends. The destination is named in the aim step (`params.tile`; otherwise the first
// adjacent tile). The computer players never cast it.
export default {
    id: 'hurricane-winds', dur: 'fly', benevolent: false,
    legal: (st, data) => {
        if (!isMountain(st, data, st.ch.at)) return 'Hurricane Winds can be cast only in a mountain clearing.';
        if (!adjacentTiles(st, tileOf(st.ch.at)).length) return 'There is no adjacent tile to blow the target to.';
        return foes(st).length ? true : 'There is no creature here to blow away.';
    },
    aim: (st, data) => { const o = foes(st).map(d => ({ ref: denRef(d), label: foeName(st, data, d) })); return o.length ? o : null; },
    params: (st, data) => [{ key: 'tile', kind: 'choice', label: 'Blow it to', options: adjacentTiles(st, tileOf(st.ch.at)).map(t => ({ value: t, label: `the ${tileName(t)}` })) }],
    useful: () => false,
    start(ctx) {
        const { st, data } = ctx, den = denOf(st, ctx.targets[0]);
        if (!den) { ctx.log('Hurricane Winds finds no target.'); return; }
        reveal(ctx);
        const adj = adjacentTiles(st, tileOf(st.ch.at)), tile = adj.includes(ctx.params.tile) ? ctx.params.tile : adj[0];
        const name = B.denSide(st, data, den).name;
        if (den.pickedUp) { den.pickedUp = false; den.side = 'light'; ctx.log(`The ${name} lets go of you and turns its red side down.`); }
        ctx.fx({ targets: [denRef(den)], expires: { day: st.day, at: 'midnight' }, data: { tile } });
        ctx.log(`Hurricane Winds takes hold of the ${name}: it will be blown to the ${tileName(tile)} just before the next Encounter Step.`);
    },
    ai: { role: 'control' },
};
