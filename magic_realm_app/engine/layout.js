import { EDGES, edgeDir } from './hex.js';
import { makeRng } from './rng.js';

// The source data has topology but no drawing positions, so clearings are placed by a small deterministic spring layout inside a unit hex
// (circumradius 1, flat top, centre at 0,0): a clearing with an edge road is pulled toward that edge, roads act as springs, and clearings push
// apart. The result is a schematic of our own, not a copy of anyone's artwork.
const cache = new Map();
export function layoutSide(tile, sideName) {
    const key = tile.id + ':' + sideName;
    if (cache.has(key)) return cache.get(key);
    const side = tile.sides[sideName], rng = makeRng([...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7));
    const anchor = new Map();                               // clearing -> target point near the edge(s) it reaches
    EDGES.forEach((name, e) => {
        const n = side.edges[name];
        if (n == null) return;
        const [dx, dy] = edgeDir(e), a = anchor.get(n) ?? [0, 0, 0];
        anchor.set(n, [a[0] + dx * 0.58, a[1] + dy * 0.58, a[2] + 1]);
    });
    const pts = side.clearings.map(c => {
        const a = anchor.get(c.n);
        return a ? { n: c.n, x: a[0] / a[2], y: a[1] / a[2], fixed: true } : { n: c.n, x: (rng.next() - .5) * .8, y: (rng.next() - .5) * .8 };
    });
    const by = new Map(pts.map(p => [p.n, p]));
    const R = 0.66;
    for (let it = 0; it < 400; it++) {
        const f = new Map(pts.map(p => [p.n, [0, 0]]));
        const push = (p, dx, dy) => { const v = f.get(p.n); v[0] += dx; v[1] += dy; };
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
            const a = pts[i], b = pts[j];
            let dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1e-3;
            if (d < 0.5) { const k = (0.5 - d) * 0.5; push(a, dx / d * k, dy / d * k); push(b, -dx / d * k, -dy / d * k); }
        }
        for (const path of side.paths) {
            const a = by.get(path.a), b = by.get(path.b);
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-3, k = (d - 0.5) * 0.12;
            push(a, dx / d * k, dy / d * k); push(b, -dx / d * k, -dy / d * k);
        }
        for (const p of pts) {
            const a = anchor.get(p.n), v = f.get(p.n);
            if (a) { v[0] += (a[0] / a[2] - p.x) * 0.35; v[1] += (a[1] / a[2] - p.y) * 0.35; }
            p.x += v[0] * 0.5; p.y += v[1] * 0.5;
            const r = Math.hypot(p.x, p.y);
            if (r > R) { p.x *= R / r; p.y *= R / r; }
        }
    }
    const out = { pos: Object.fromEntries(pts.map(p => [p.n, [p.x, p.y]])) };
    cache.set(key, out);
    return out;
}
