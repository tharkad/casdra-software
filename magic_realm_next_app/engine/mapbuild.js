import { EDGES, neighbor, hexKey, opposite, worldEdge, localEdge } from './hex.js';

// A placement is { id, q, r, rot (0-5 clockwise steps), side ('normal' | 'enchanted') }.
// The map is built from the normal side (rulebook 3.2: tiles go down green side up); flipping is a later action.

export const tileById = (tiles, id) => tiles.find(t => t.id === id);

// The clearing number a road reaches at a given world edge of a placed tile, or null.
export function edgeClearing(tile, p, world) {
    return tile.sides[p.side].edges[EDGES[localEdge(world, p.rot)]] ?? null;
}

// Every clearing-to-clearing link on the map: inside tiles (all kinds) and across tile edges (open).
// Returns { nodes: Set('BL1'...), links: [{a, b, kind, tile?}] }.
export function graphOf(tiles, placements) {
    const at = new Map(placements.map(p => [hexKey(p.q, p.r), p]));
    const nodes = new Set(), links = [];
    for (const p of placements) {
        const tile = tileById(tiles, p.id), side = tile.sides[p.side];
        side.clearings.forEach(c => nodes.add(p.id + c.n));
        side.paths.forEach(path => links.push({ a: p.id + path.a, b: p.id + path.b, kind: path.kind, tile: p.id }));
        for (let w = 0; w < 6; w++) {
            const mine = edgeClearing(tile, p, w);
            if (mine == null) continue;
            const [nq, nr] = neighbor(p.q, p.r, w);
            const other = at.get(hexKey(nq, nr));
            if (!other) continue;
            const theirs = edgeClearing(tileById(tiles, other.id), other, opposite(w));
            if (theirs != null && p.id < other.id) links.push({ a: p.id + mine, b: other.id + theirs, kind: 'open' });
        }
    }
    return { nodes, links };
}

// Clearings reachable from the Borderland by any road (open, tunnel, hidden or secret).
export function reachableFromBorderland(tiles, placements) {
    const { nodes, links } = graphOf(tiles, placements);
    const adj = new Map([...nodes].map(n => [n, []]));
    links.forEach(l => { adj.get(l.a).push(l.b); adj.get(l.b).push(l.a); });
    const seen = new Set(), stack = [...nodes].filter(n => n.startsWith('BL'));
    stack.forEach(n => seen.add(n));
    while (stack.length) for (const m of adj.get(stack.pop())) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    return seen;
}

// Whole-map legality of one more tile (rulebook 3.2.1). Returns null when legal, otherwise a short reason.
const MUST_CONNECT_ALL = new Set(['HP', 'LE']);       // the two tiles whose six clearings must all be linked to the Borderland
export function whyIllegal(tiles, placements, cand) {
    const occupied = new Set(placements.map(p => hexKey(p.q, p.r)));
    if (occupied.has(hexKey(cand.q, cand.r))) return 'occupied';
    const at = new Map(placements.map(p => [hexKey(p.q, p.r), p]));
    const tile = tileById(tiles, cand.id);
    let touching = 0;
    for (let w = 0; w < 6; w++) {
        const [nq, nr] = neighbor(cand.q, cand.r, w);
        const other = at.get(hexKey(nq, nr));
        if (!other) continue;
        touching++;
        const mine = edgeClearing(tile, cand, w) != null;
        const theirs = edgeClearing(tileById(tiles, other.id), other, opposite(w)) != null;
        if (mine !== theirs) return 'road edge meets roadless edge';
    }
    if (touching < Math.min(2, placements.length)) return 'must touch two tiles';
    const all = [...placements, cand];
    const seen = reachableFromBorderland(tiles, all);
    const side = tile.sides[cand.side];
    const linked = side.clearings.filter(c => seen.has(cand.id + c.n)).length;
    if (linked === 0) return 'not connected to the Borderland';
    if (MUST_CONNECT_ALL.has(cand.id) && linked < side.clearings.length) return 'not every clearing connected';
    return null;
}

// All legal (hex, rotation) spots for a tile given the current map.
export function legalSpots(tiles, placements, id) {
    const seenHex = new Set(), out = [];
    for (const p of placements) for (let w = 0; w < 6; w++) {
        const [q, r] = neighbor(p.q, p.r, w), k = hexKey(q, r);
        if (seenHex.has(k)) continue;
        seenHex.add(k);
        for (let rot = 0; rot < 6; rot++) if (!whyIllegal(tiles, placements, { id, q, r, rot, side: 'normal' })) out.push({ id, q, r, rot, side: 'normal' });
    }
    return out;
}

// Build a legal 20-tile realm at random. Retries from scratch on a dead end (the prototype gave up silently).
export function generateRealm(tiles, rng, maxTries = 200) {
    for (let attempt = 1; attempt <= maxTries; attempt++) {
        const placements = [{ id: 'BL', q: 0, r: 0, rot: rng.int(6), side: 'normal' }];
        let remaining = tiles.map(t => t.id).filter(id => id !== 'BL');
        let stuck = false;
        while (remaining.length && !stuck) {
            let placed = false;
            for (const id of rng.shuffle(remaining)) {
                const spots = legalSpots(tiles, placements, id);
                if (!spots.length) continue;
                placements.push(rng.pick(spots));
                remaining = remaining.filter(x => x !== id);
                placed = true;
                break;
            }
            stuck = !placed;
        }
        if (!stuck) return { placements, attempts: attempt };
    }
    throw new Error('could not build a legal realm');
}
