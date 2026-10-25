// Placing the names on the map so that no one covers another (or a clearing number, or a counter).
//
// Method: greedy placement with candidate positions, the same family of method used for point-feature label placement in cartography.
// Every label group (all the pills belonging to one clearing, or the name under one chit) is tried, in priority order, at a list of candidate
// positions around its anchor: its preferred sides first, then each side again at growing distance. The first candidate that overlaps nothing
// already placed (and no fixed obstacle) wins; if every candidate collides, the one with the least overlap and the shortest distance is used,
// so the result is always deterministic and the same state always lays out the same way. A group that ended up away from its anchor
// is flagged so the caller can draw a leader line to it.
//
// Pure functions of numbers: nothing here touches the DOM, so it is unit-tested in node (tests/labels.test.mjs).

const GAP = 2;          // between the pills of one group
const FAR = 60;         // a name stands far from its clearing when its centre is this many units away (it may then leave the tile for a nearer spot)
const MARGIN = 1.5;     // clear space kept around every placed box
const SIDES = ['center', 'right', 'below-right', 'above-right', 'left', 'below-left', 'above-left', 'below', 'above'];

const overlapArea = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
};
const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

// A uniform grid of rectangles: what a candidate box overlaps is found among the few rectangles in the cells it touches, not among every rectangle on the map.
const CELL = 40;
class Grid {
    constructor() { this.cells = new Map(); this.n = 0; }
    keys(r) { const out = [], x0 = Math.floor(r.x / CELL), x1 = Math.floor((r.x + r.w) / CELL), y0 = Math.floor(r.y / CELL), y1 = Math.floor((r.y + r.h) / CELL); for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) out.push(i * 100003 + j); return out; }
    add(r) { const item = { r, id: this.n++, keys: this.keys(r) }; for (const k of item.keys) { const c = this.cells.get(k); if (c) c.push(item); else this.cells.set(k, [item]); } return item; }
    remove(item) { for (const k of item.keys) { const c = this.cells.get(k); c.splice(c.indexOf(item), 1); } }
    /** total overlap of r with everything in the grid */
    area(r) { let a = 0, seen = null; for (const k of this.keys(r)) { const c = this.cells.get(k); if (!c) continue; for (const it of c) { if (it.stamp === r) continue; it.stamp = r; a += overlapArea(r, it.r); } } return a; }
}

// where the top-left corner of a column W x H goes for a side of an anchor with a clear radius r
function corner(side, ax, ay, r, W, H, h0) {
    const d = r * 0.72;
    switch (side) {
        case 'center': return [ax - W / 2, ay - H / 2];
        case 'right': return [ax + r, ay - h0 / 2];
        case 'left': return [ax - r - W, ay - h0 / 2];
        case 'below': return [ax - W / 2, ay + r];
        case 'above': return [ax - W / 2, ay - r - H];
        case 'below-right': return [ax + d, ay + d];
        case 'below-left': return [ax - d - W, ay + d];
        case 'above-right': return [ax + d, ay - d - H];
        default: return [ax - d - W, ay - d - H];
    }
}

/**
 * @param groups    [{ id, ax, ay, ar, prio, prefer?, boxes:[{w,h}] }]  anchor point, the radius around it that must stay clear, lower prio is placed first
 * @param obstacles [{ x, y, r }]                                         round things that never move (clearing numbers, counters)
 * @param anchors   [{ id, x, y }]  every clearing's centre; a group with `own` set to its clearing's id is kept nearer to that clearing than to any other
 * @returns Map id -> { boxes:[{x,y,w,h}], side, ring, leader:boolean, overlap:number }
 */
export function layoutLabels(groups, obstacles = [], { rings = 24, step = 5, anchors = [] } = {}) {
    const grid = new Grid(), held = [];                       // the round things that never move, then the names placed so far (all grown by MARGIN where they are placed)
    for (const o of obstacles) grid.add({ x: o.x - o.r, y: o.y - o.r, w: 2 * o.r, h: 2 * o.r });
    const out = new Map();
    const areaOf = rects => { let area = 0; for (const r of rects) area += grid.area(grow(r, MARGIN)); return area; };
    // the other clearings, nearest first, for a group that must stay nearer to its own clearing than to any other (built once per group)
    const others = new Map();
    const othersOf = g => {
        let l = others.get(g);
        if (!l) { l = anchors.filter(a => a.id !== g.own).map(a => ({ x: a.x, y: a.y, dd: Math.hypot(a.x - (g.ox ?? g.ax), a.y - (g.oy ?? g.ay)) })).sort((p, q) => p.dd - q.dd); others.set(g, l); }
        return l;
    };
    const near = (rc, px, py) => { const cx = Math.max(rc.x, Math.min(px, rc.x + rc.w)), cy = Math.max(rc.y, Math.min(py, rc.y + rc.h)); return Math.hypot(cx - px, cy - py); };
    // best column position for a list of boxes around an anchor (first fully clear candidate, else the least bad)
    // a name that cannot stand on its tile without covering something may hang over the tile's edge instead, if that leaves it clear: seen beats tidy
    const search = (g, boxes) => {
        const best = searchIn(g, boxes);
        if (!g.inside || (best.area === 0 && best.dist < FAR)) return best;
        const off = searchIn({ ...g, inside: null }, boxes);
        // (a name that only fits well away from its clearing, because the tile's own ground is crowded, may hang over the edge when that brings it much nearer)
        return off.area === 0 && (best.area > 0 || off.dist + FAR / 3 < best.dist) ? { ...off, outside: 1 } : best;
    };
    const searchIn = (g, boxes) => {
        const W = Math.max(...boxes.map(b => b.w)), H = boxes.reduce((s, b) => s + b.h, 0) + GAP * (boxes.length - 1);
        const sides = [...(g.prefer ?? []), ...SIDES.filter(s => !(g.prefer ?? []).includes(s))];
        let best = null;
        for (let ring = 0; ring < rings; ring++) {
            for (const side of sides) {
                const [x, y] = corner(side, g.ax, g.ay, g.ar + 2 + ring * step, W, H, boxes[0].h);
                const rects = []; let yy = y;
                for (const b of boxes) { rects.push({ x, y: yy, w: b.w, h: b.h }); yy += b.h + GAP; }
                const area = areaOf(rects), dist = Math.hypot(x + W / 2 - g.ax, y + H / 2 - g.ay);
                // a candidate that collides cannot win once its overlap and distance alone cost more than the best so far: the rest of its score only adds
                if (best && area > 0 && area * 100 + dist >= best.score) continue;
                // A name must read as belonging to its own clearing: measured from the nearest edge of the stack, it may not be closer to
                // another clearing's centre than to its own.
                let owned = true, excess = 0;
                if (g.own != null && anchors.length) {
                    const list = othersOf(g);
                    for (const rc of rects) {                     // every pill of the stack, not just the stack's nearest edge
                        const mine = near(rc, g.ox ?? g.ax, g.oy ?? g.ay), reach = 2 * mine + Math.hypot(rc.w, rc.h);       // a clearing farther from this one than that cannot be nearer to the pill
                        for (const a of list) { if (a.dd >= reach) break; const d = near(rc, a.x, a.y); if (d + 1 < mine) { owned = false; excess = Math.max(excess, mine - d); } }
                    }
                }
                if (best && area > 0 && area * 100 + dist + (owned ? 0 : 60 + excess * 2) >= best.score) continue;
                // a counter's name belongs on its own tile: a group may carry `inside(x, y)`, and every corner of a pill that falls outside it costs
                let outside = 0;
                if (g.inside) for (const r of rects) { if (!g.inside(r.x, r.y)) outside++; if (!g.inside(r.x + r.w, r.y)) outside++; if (!g.inside(r.x, r.y + r.h)) outside++; if (!g.inside(r.x + r.w, r.y + r.h)) outside++; }
                // a name that sits close but nearer another clearing is only mildly disliked (it carries its clearing's number, and gets a thin line); it must not be pushed far away for it
                const score = area * 100 + dist + (owned ? 0 : 60 + excess * 2) + outside * 700;
                if (!best || score < best.score) best = { score, rects, side, ring, area, dist, W, H, owned, outside };
                if (area === 0 && owned && outside === 0) return best;     // candidates run from nearest to farthest
            }
        }
        return best;
    };
    const order = groups.slice().sort((a, b) => (a.prio ?? 5) - (b.prio ?? 5) || b.boxes.length - a.boxes.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const g of order) {
        let best = search(g, g.boxes);
        let boxes = best.rects, side = best.side, ring = best.ring, area = best.area, far = best.dist > g.ar + Math.max(best.W, best.H) + 4;
        // the stack does not fit as one column: it collides, hangs over its tile's edge, stands on a neighbour's side, or only fits far off. Try its pills one by one,
        // each wherever there is room nearest, BEFORE the caller gives up and turns the clearing into a marker (a tall column of four does not fit a hexagon that has plenty of room)
        if (g.boxes.length > 1 && (best.area > 0 || best.owned === false || (best.outside ?? 0) > 0 || best.dist > g.ar + 40)) {
            const lone = []; let worst = 0, maxRing = 0, allOwned = true, far2 = 0, loneOut = 0;
            let prev = null;
            for (const b of g.boxes) {
                // the first pill goes nearest the clearing; each next one is sought beside the one before, so the pieces of one clearing stay together
                const gp = prev ? { ...g, ox: g.ax, oy: g.ay, ax: prev.x + prev.w / 2, ay: prev.y + prev.h / 2, ar: prev.h / 2, prefer: ['below', 'above', 'right', 'left'] } : g;
                const r = search(gp, [b]);
                prev = r.rects[0];
                for (const rc of r.rects) held.push(grid.add(grow(rc, MARGIN)));
                lone.push(r.rects[0]); worst += r.area; maxRing = Math.max(maxRing, r.ring); loneOut += r.outside ?? 0;
                allOwned = allOwned && r.owned !== false; far2 = Math.max(far2, r.dist);
            }
            for (const it of held.splice(0)) grid.remove(it);       // they are re-added below with the rest of the bookkeeping
            const better = worst < best.area || (worst === best.area && ((best.owned === false && allOwned) || far2 + 8 < best.dist || (loneOut < (best.outside ?? 0) && allOwned)));
            if (better) { boxes = lone; side = 'split'; ring = maxRing; area = worst; far = true; best = { ...best, owned: allOwned, outside: loneOut }; }
        }
        for (const r of boxes) grid.add(grow(r, MARGIN));
        out.set(g.id, { boxes, side, ring, overlap: area, outside: best.outside ?? 0, leader: ring > 0 || far || best.owned === false || (best.outside ?? 0) > 0 });      // a name that could not stay on its tile is tied to its clearing
    }
    return out;
}

// text width estimate for the UI font at the pill size used on the map (kept here so the layout and the drawing agree)
export const pillWidth = (label, { img = false, size = 9 } = {}) => Math.ceil(label.length * size * 0.6 + 8 + (img ? 13 : 0));
export const PILL_H = 15;
