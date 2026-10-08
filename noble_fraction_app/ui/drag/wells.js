import { actionGroup } from '../actions.js';
import { cardLabel } from '../labels.js';

// The drop wells for a lifted card: the same distinct choices, in the same words, as the zoom sheet's buttons.
export const MAX_WELLS = 3;
const RANK = { buy: 0, install: 1, play: 2, useInstalled: 2, bid: 3, placeFreeBid: 3, bidMove: 3, discard: 4 };

export function wellsFor(ctx, uid) {
    const groups = new Map();
    for (const a of ctx.idx.byUid.get(uid) ?? []) { const k = actionGroup(a, ctx.s); groups.set(k, [...(groups.get(k) ?? []), a]); }
    const all = [...groups.entries()].map(([key, list]) => ({ key, action: list[0], count: list.length, label: cardLabel(list[0], ctx.s, list.length) }))
        .sort((x, y) => (RANK[x.action.type] ?? 9) - (RANK[y.action.type] ?? 9));
    return all.length > MAX_WELLS ? [...all.slice(0, MAX_WELLS), { key: 'more', more: true, label: 'More…' }] : all;
}

// The well a dragged card is "over": the nearest rectangle to the point within `radius` px (0 distance inside), or null.
export function nearestWell(rects, x, y, radius = 80) {
    let best = null; let bestD = Infinity;
    for (const r of rects) {
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        const d = Math.hypot(dx, dy);
        if (d <= radius && d < bestD) { bestD = d; best = r.key; }                // a tie goes to the first (leftmost) well
    }
    return best;
}
