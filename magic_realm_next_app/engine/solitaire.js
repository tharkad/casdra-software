import { neighbor, hexKey } from './hex.js';
import { legalSpots, tileById } from './mapbuild.js';
import { graph, mapEdgeClearings, numOf } from './world.js';
import { say, refuse } from './core.js';

// Solitaire play (optional rules 10.E.1, `options.solitaire`). Everything here is OFF unless the game was made with the option, and a game without it is exactly what it was.
// What each rule does and where: docs/design/SOLITAIRE.md.
//   1.3  the map is built from a pile of tiles (generateSolitaireRealm)
//   1.5  the Valley chits stay face down (revealValley)
//   1.6  the first activity is a Move onto the map along a road from the edge (startOnEdge, entryClearings)
//   1.7  two rows of denizens prowl each day (prowlRows)
//   1.4.2 all characters must win (score.js scoreParty)

export const isSolitaire = st => !!st.options?.solitaire;

// ---- 1.3: the map ----
const SOFT = new Set(['woods', 'valley']);

// 10.E.1.3: the Borderland first; the other nineteen tiles are shuffled into a pile. The top tile must be placed if it can be placed within the usual rules (3.2.3b). A Woods or Valley
// tile is not put next to another Woods or Valley tile if any other place is possible (1.3.1). A tile that cannot be placed goes to the bottom of the pile and the next one is taken
// (1.3.2). When every tile left has been tried since the last one went down and none can be placed (the last tile cannot be placed), the map is picked up and begun again (1.3.3).
// Where the tile goes, among the places the rules allow, is the player's choice: it is drawn at random.
export function generateSolitaireRealm(tiles, rng, maxTries = 200) {
    const group = id => tileById(tiles, id).group;
    const nextToSoft = (placements, spot) => {
        const at = new Map(placements.map(p => [hexKey(p.q, p.r), p]));
        for (let w = 0; w < 6; w++) { const [q, r] = neighbor(spot.q, spot.r, w), other = at.get(hexKey(q, r)); if (other && SOFT.has(group(other.id))) return true; }
        return false;
    };
    for (let attempt = 1; attempt <= maxTries; attempt++) {
        const placements = [{ id: 'BL', q: 0, r: 0, rot: rng.int(6), side: 'normal' }];
        const pile = rng.shuffle(tiles.map(t => t.id).filter(id => id !== 'BL'));
        let tried = 0;
        while (pile.length) {
            const id = pile.shift();
            let spots = legalSpots(tiles, placements, id);
            if (spots.length && SOFT.has(group(id))) { const apart = spots.filter(s => !nextToSoft(placements, s)); if (apart.length) spots = apart; }
            if (!spots.length) { pile.push(id); tried++; if (tried >= pile.length) break; continue; }
            placements.push(rng.pick(spots));
            tried = 0;
        }
        if (!pile.length) return { placements, attempts: attempt };
    }
    refuse('map.none', 'could not build a legal solitaire realm', null, '10.E.1.3');
}

// ---- 1.5: the Valley chits stay face down ----
// At setup the Valley chits are not turned up. Each one remembers what it will show (`dwell`: the Dwelling or the Ghosts and the clearing) and the natives of that Dwelling and the Ghosts wait
// off the map in their chart boxes. When the chit is turned up during the game (summon.js, the end of a turn in its tile) the piece appears in its clearing like a campfire.
export function revealValley(st, data, c) {
    const d = c.dwell;
    if (!d) return;
    delete c.dwell;
    const n = numOf(d.at);
    if (d.kind === 'Ghosts') {
        st.ghostsAt = d.at;
        for (const m of st.mons) if (data.monsters[m.id].family === 'Ghost' && m.loc?.box) m.loc = { c: d.at };
        say(st, `The Ghosts appear in clearing ${n}.`, 'discover', null, { ev: { code: 'dwelling.appeared', kind: 'ghosts', at: d.at } });
        return;
    }
    st.dwellings.push({ kind: d.kind, at: d.at, tile: c.tile });
    st.garrisonAt[d.kind] = d.at;
    for (const nat of st.nats) if (data.groups[data.natives[nat.id].group].garrison === d.kind && nat.loc?.box) nat.loc = { c: d.at };
    say(st, `The ${d.kind} appears in clearing ${n}.`, 'discover', null, { ev: { code: 'dwelling.appeared', kind: d.kind.toLowerCase().replace(/ /g, '-'), at: d.at } });
}

// ---- 1.6: entering the map ----
// The clearings a character may enter at: a clearing with a roadway to the edge of the map (the same ones he may leave by, 7.3.1a.4) that has a route to the Borderland along the roads.
export function entryClearings(st, data) {
    const reach = graph(st, data).reach;
    return [...mapEdgeClearings(st, data)].filter(id => reach.has(id)).sort();
}
// The clearings a character who stands on the road at the edge of the map may Move to. His first Move enters the map at one of them; once a character has entered, a new one (after a death)
// enters along the same roadway (`st.entryRoad`, and `only` on the road he starts on).
export function entryMoves(st, data, road) {
    if (road.only) return [road.only];
    return entryClearings(st, data);
}
// Where a character who is on a road may go: the two ends of a road between clearings, or the clearings of the edge when he has not entered the map yet.
export function roadEnds(st, data, road) { return road.entry ? entryMoves(st, data, road) : [road.from, road.to]; }

// The new character stands on the road at the edge of the map (`onRoad.entry`): no clearing, no fight, nothing to rearrange (the road rules of 8.3.8 d), and his first Move enters the map.
// `at` is a place holder (the clearing he entered by before, or the first of the clearings he may enter at); `from` and `to` are it too.
export function startOnEdge(st, data, ch) {
    const at = st.entryRoad ?? entryClearings(st, data)[0];
    if (!at) refuse('map.noentry', 'No road runs from the edge of the map to the Borderland.', null, '10.E.1.6');          // (never seen: every realm of 600 seeds has at least 8)
    ch.onRoad = { from: at, to: at, entry: true, ...(st.entryRoad ? { only: st.entryRoad } : {}) };
    return at;
}
// Once a character is on the map, the road he came by is the one a new character enters by after a death (10.E.1.6).
export function enteredAt(st, to) { st.entryRoad ??= to; }

// ---- 1.7: two rows prowl ----
// The Monster Roll rows of the day: the first roll, and the second when it was not the same (a double puts both chits in the same row, the only row that prowls).
export const prowlRows = st => (st.prowl2 ? [st.prowl, st.prowl2] : [st.prowl]);
export const rowProwls = (st, row) => row === st.prowl || (st.prowl2 != null && row === st.prowl2);
// "row 3" / "rows 3 and 5": the rows of the day in words.
export const rowsWords = st => (st.prowl2 ? `rows ${st.prowl} and ${st.prowl2}` : `row ${st.prowl}`);
