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
const MARGIN = 1.5;     // clear space kept around every placed box
const SIDES = ['center', 'right', 'below-right', 'above-right', 'left', 'below-left', 'above-left', 'below', 'above'];

const overlapArea = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
};
const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

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
export function layoutLabels(groups, obstacles = [], { rings = 12, step = 9, anchors = [] } = {}) {
    const fixed = obstacles.map(o => ({ x: o.x - o.r, y: o.y - o.r, w: 2 * o.r, h: 2 * o.r }));
    const placed = [];
    const out = new Map();
    const areaOf = rects => {
        let area = 0;
        for (const r of rects) { const rr = grow(r, MARGIN); for (const o of fixed) area += overlapArea(rr, o); for (const o of placed) area += overlapArea(rr, o); }
        return area;
    };
    // best column position for a list of boxes around an anchor (first fully clear candidate, else the least bad)
    const search = (g, boxes) => {
        const W = Math.max(...boxes.map(b => b.w)), H = boxes.reduce((s, b) => s + b.h, 0) + GAP * (boxes.length - 1);
        const sides = [...(g.prefer ?? []), ...SIDES.filter(s => !(g.prefer ?? []).includes(s))];
        let best = null;
        for (let ring = 0; ring < rings; ring++) {
            for (const side of sides) {
                const [x, y] = corner(side, g.ax, g.ay, g.ar + 2 + ring * step, W, H, boxes[0].h);
                const rects = []; let yy = y;
                for (const b of boxes) { rects.push({ x, y: yy, w: b.w, h: b.h }); yy += b.h + GAP; }
                const area = areaOf(rects), dist = Math.hypot(x + W / 2 - g.ax, y + H / 2 - g.ay);
                // A name must read as belonging to its own clearing: measured from the nearest edge of the stack, it may not be closer to
                // another clearing's centre than to its own.
                let owned = true, excess = 0;
                if (g.own != null && anchors.length) {
                    const near = (rc, px, py) => { const cx = Math.max(rc.x, Math.min(px, rc.x + rc.w)), cy = Math.max(rc.y, Math.min(py, rc.y + rc.h)); return Math.hypot(cx - px, cy - py); };
                    for (const rc of rects) {                     // every pill of the stack, not just the stack's nearest edge
                        const mine = near(rc, g.ax, g.ay);
                        for (const a of anchors) if (a.id !== g.own) { const d = near(rc, a.x, a.y); if (d + 1 < mine) { owned = false; excess = Math.max(excess, mine - d); } }
                    }
                }
                // a counter's name belongs on its own tile: a group may carry `inside(x, y)`, and every corner of a pill that falls outside it costs
                const outside = g.inside ? rects.reduce((n, r) => n + [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].filter(([px, py]) => !g.inside(px, py)).length, 0) : 0;
                const score = area * 100 + dist + (owned ? 0 : 3000 + excess * 5) + outside * 4000;
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
        if (g.boxes.length > 1 && (best.area > 0 || best.owned === false || best.dist > g.ar + 40)) {
            // the stack does not fit, or only fits far off or on a neighbour's side: try its pills one by one, each wherever there is room nearest
            const lone = []; let worst = 0, maxRing = 0, allOwned = true, far2 = 0;
            for (const b of g.boxes) {
                const r = search(g, [b]);
                for (const rc of r.rects) placed.push(grow(rc, MARGIN));
                lone.push(r.rects[0]); worst += r.area; maxRing = Math.max(maxRing, r.ring);
                allOwned = allOwned && r.owned !== false; far2 = Math.max(far2, r.dist);
            }
            placed.length -= g.boxes.length;                       // they are re-added below with the rest of the bookkeeping
            const better = worst < best.area || (worst === best.area && ((best.owned === false && allOwned) || far2 + 8 < best.dist));
            if (better) { boxes = lone; side = 'split'; ring = maxRing; area = worst; far = true; best = { ...best, owned: allOwned }; }
        }
        for (const r of boxes) placed.push(grow(r, MARGIN));
        out.set(g.id, { boxes, side, ring, overlap: area, leader: ring > 0 || far || best.owned === false });
    }
    return out;
}

// text width estimate for the UI font at the pill size used on the map (kept here so the layout and the drawing agree)
export const pillWidth = (label, { img = false, size = 9 } = {}) => Math.ceil(label.length * size * 0.6 + 8 + (img ? 13 : 0));
export const PILL_H = 15;
