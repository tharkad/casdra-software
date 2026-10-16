import { graphOf, reachableFromBorderland, tileById } from './mapbuild.js';

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

export const pathKey = (a, b) => (a < b ? `${a}~${b}` : `${b}~${a}`);
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
        usable: r.kind === 'open' || r.kind === 'tunnel' || st.ch.discovered.paths.includes(pathKey(id, r.to)) || (st.ch.adv ?? []).includes('experience'),
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
