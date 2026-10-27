import { graphOf, reachableFromBorderland, tileById, edgeClearing } from './mapbuild.js';
import { neighbor, hexKey, opposite } from './hex.js';

// Map queries over a game state. The map never changes in the base game, so each realm's graph is built once.
const cache = new Map();
function graphFor(st, data) {
    // the map changes when a tile is enchanted (turned to its other side): the cache is keyed by which side of each tile is up
    const key = `${st.mapKey}:${st.placements.map(p => (p.side === 'enchanted' ? 'e' : 'n')).join('')}`;
    let g = cache.get(key);
    if (!g) {
        const { nodes, links } = graphOf(data.tiles, st.placements);
        const adj = new Map([...nodes].map(n => [n, []]));
        for (const l of links) { adj.get(l.a).push({ to: l.b, kind: l.kind, bridge: !!l.bridge }); adj.get(l.b).push({ to: l.a, kind: l.kind, bridge: !!l.bridge }); }
        const type = new Map();
        const magic = new Map();
        for (const p of st.placements) {
            const t = tileById(data.tiles, p.id), side = t.sides[p.side];
            for (const c of side.clearings) { type.set(p.id + c.n, c.type); magic.set(p.id + c.n, c.magic ?? []); }
        }
        g = { nodes, links, adj, type, magic, reach: reachableFromBorderland(data.tiles, st.placements) };
        if (cache.size >= 6) cache.delete(cache.keys().next().value);          // one realm per game: keep a few, not every one ever played
        cache.set(key, g);
    }
    return g;
}
export const graph = graphFor;

// The clearings with a roadway to the edge of the map (7.3.1a.4, 9.2.2b): a clearing that a tile's side runs a road from to an edge where no tile lies, or whose neighbour has no road
// at that edge. The set of clearing ids; it changes when a tile is turned over.
export function mapEdgeClearings(st, data) {
    const at = new Map(st.placements.map(p => [hexKey(p.q, p.r), p])), out = new Set();
    for (const p of st.placements) {
        const tile = tileById(data.tiles, p.id);
        for (let w = 0; w < 6; w++) {
            const mine = edgeClearing(tile, p, w);
            if (mine == null) continue;
            const [nq, nr] = neighbor(p.q, p.r, w), other = at.get(hexKey(nq, nr));
            if (!other || edgeClearing(tileById(data.tiles, other.id), other, opposite(w)) == null) out.add(p.id + mine);
        }
    }
    return out;
}

// A hidden path or secret passage he has found is kept by the SIDE of its tile it was found on (7.10.4d: the green and the enchanted side "are listed separately on the Discoveries list,
// and they must be discovered separately"). The key is the two clearings, sorted ("BL4~BL5") for the green side, and the same with ":enchanted" after it for the enchanted side.
// The green keys are exactly what they always were. `discovered.paths` of a game saved before this is migrated by party.js upgradeState (the side the tile shows when it is loaded).
export const pathKey = (a, b, side = 'normal') => `${a < b ? `${a}~${b}` : `${b}~${a}`}${side === 'enchanted' ? ':enchanted' : ''}`;
export const pathEnds = key => key.split(':')[0].split('~');                       // the two clearings
export const pathSide = key => (key.endsWith(':enchanted') ? 'enchanted' : 'normal');
export const tileSide = (st, tile) => st.placements.find(p => p.id === tile)?.side ?? 'normal';
// The key of the road between two clearings of one tile as that tile lies now: what he looks up, and writes down, when he uses or discovers it.
export const pathKeyAt = (st, a, b) => pathKey(a, b, tileSide(st, tileOf(a)));
// The roads he has discovered that exist on the side now up, as sorted pairs ("BL4~BL5"): what a map draws as found. A discovery of the side that is face down stays on his list but does not open the road.
export const knownPathPairs = (st, ch = st.ch) => new Set((ch.discovered?.paths ?? []).filter(k => pathSide(k) === tileSide(st, tileOf(pathEnds(k)[0]))).map(k => k.split(':')[0]));
export const tileOf = id => id.slice(0, 2);
export const numOf = id => Number(id.slice(2));

export function clearingType(st, data, id) { return graphFor(st, data).type.get(id); }
export function isCave(st, data, id) { return clearingType(st, data, id) === 'cave'; }
export function isMountain(st, data, id) { return clearingType(st, data, id) === 'mountain'; }

// Roads leaving a clearing, with whether this character may use them (hidden paths and secret passages need discovery).
export function roadsFrom(st, data, id) {
    const g = graphFor(st, data);
    return (g.adj.get(id) ?? []).map(r => ({
        to: r.to, kind: r.kind, bridge: r.bridge,
        // the Wizard's Experience: he uses hidden paths and secret passages without having discovered them
        usable: r.kind === 'open' || r.kind === 'tunnel' || st.ch.discovered.paths.includes(pathKeyAt(st, id, r.to)) || (st.ch.adv ?? []).includes('experience') || !!st.ch.mist,         // (mist, from Melt into Mist, goes by any path without having discovered it)
    }));
}

export function tileClearings(st, data, tile) {
    const p = st.placements.find(x => x.id === tile);
    return tileById(data.tiles, tile).sides[p.side].clearings.map(c => tile + c.n);
}
export const sameTile = (a, b) => tileOf(a) === tileOf(b);
// A clearing's name for people: "Awful Valley 4".
const TILE_NAMES = { BL: 'Borderland', AV: 'Awful Valley', BV: 'Bad Valley', CV: 'Curst Valley', DV: 'Dark Valley', EV: 'Evil Valley', LW: 'Linden Woods', MW: 'Maple Woods',
    NW: 'Nut Woods', OW: 'Oak Woods', PW: 'Pine Woods', CL: 'Cliff', CR: 'Crag', LE: 'Ledges', MT: 'Mountain', DW: 'Deep Woods', CN: 'Cavern', CA: 'Caves', HP: 'High Pass', RU: 'Ruins' };
export const tileName = id => TILE_NAMES[id] ?? id;
export const nameOfClearing = id => `${tileName(tileOf(id))} ${numOf(id)}`;
