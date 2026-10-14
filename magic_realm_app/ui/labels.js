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
 * @returns Map id -> { boxes:[{x,y,w,h}], side, ring, leader:boolean, overlap:number }
 */
export function layoutLabels(groups, obstacles = [], { rings = 12, step = 9 } = {}) {
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
                const score = area * 100 + dist;
                if (!best || score < best.score) best = { score, rects, side, ring, area, dist, W, H };
                if (area === 0) return best;              // candidates run from nearest to farthest
            }
        }
        return best;
    };
    const order = groups.slice().sort((a, b) => (a.prio ?? 5) - (b.prio ?? 5) || b.boxes.length - a.boxes.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const g of order) {
        let best = search(g, g.boxes);
        let boxes = best.rects, side = best.side, ring = best.ring, area = best.area, far = best.dist > g.ar + Math.max(best.W, best.H) + 4;
        if (best.area > 0 && g.boxes.length > 1) {
            // the stack does not fit anywhere: place its pills one by one, each wherever there is room
            const lone = []; let worst = 0, maxRing = 0;
            for (const b of g.boxes) {
                const r = search(g, [b]);
                for (const rc of r.rects) placed.push(grow(rc, MARGIN));
                lone.push(r.rects[0]); worst += r.area; maxRing = Math.max(maxRing, r.ring);
            }
            placed.length -= g.boxes.length;                       // they are re-added below with the rest of the bookkeeping
            if (worst < best.area) { boxes = lone; side = 'split'; ring = maxRing; area = worst; far = true; }
        }
        for (const r of boxes) placed.push(grow(r, MARGIN));
        out.set(g.id, { boxes, side, ring, overlap: area, leader: ring > 0 || far });
    }
    return out;
}

// text width estimate for the UI font at the pill size used on the map (kept here so the layout and the drawing agree)
export const pillWidth = (label, { img = false, size = 9 } = {}) => Math.ceil(label.length * size * 0.6 + 8 + (img ? 13 : 0));
export const PILL_H = 15;
