// Focus model for keyboard / controller play. Every interactive thing in the UI is a <button> (or marked
// [data-focusable]); this module keeps ONE focused element, moves it spatially (up/down/left/right to the nearest
// control in that direction), traps focus inside open sheets, and re-finds the focused control after every
// re-render by identity (card uid / action / control id), since the whole UI is rebuilt on each move.

export const FOCUSABLE = 'button:not(:disabled):not(.scroll-arrow), [data-focusable]';        // the scroll chevrons are for touch/mouse; the D-pad scrolls by moving focus
export const ZONES = [['hud', '#hud'], ['console', '#console'], ['tabs', '#tabs'], ['hand', '#hand'], ['pane', '.pane'], ['sheet', '.sheet']];

const state = { key: null, rect: null, returnKey: null, layerWasSheet: false };

export const layerRoot = () => {
    const overlay = document.getElementById('overlay');
    return overlay && overlay.children.length ? overlay : document.getElementById('app');
};
export const inSheet = () => layerRoot().id === 'overlay';

export function keyOf(el) {
    const d = el.dataset;
    if (d.uid) return `uid:${d.uid}`;
    for (const k of ['act', 'pane', 'open', 'start', 'level', 'mode', 'new', 'close', 'menuNew', 'confirmNew', 'keep', 'statsTab', 'fx', 'exportLog', 'pick', 'skip', 'purgeUnavailable']) {
        if (d[k] !== undefined) return `${k}:${d[k]}`;
    }
    return `txt:${(el.textContent || '').trim().slice(0, 40)}`;
}

export function focusables(root = layerRoot()) {
    return [...root.querySelectorAll(FOCUSABLE)].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
}

export const zoneOf = el => ZONES.find(([, sel]) => el.closest(sel))?.[0] ?? 'other';

const centre = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// The nearest focusable in a direction. Cost = distance along the direction + a penalty for drifting sideways;
// controls whose rows/columns overlap the current one are strongly preferred (so Right stays on a row).
export function neighbour(from, dir, list = focusables()) {
    const f = from.getBoundingClientRect(); const fc = centre(f);
    let best = null; let sameRow = null;
    for (const el of list) {
        if (el === from) continue;
        const r = el.getBoundingClientRect(); const c = centre(r);
        const dx = c.x - fc.x; const dy = c.y - fc.y;
        const along = { right: dx, left: -dx, down: dy, up: -dy }[dir];
        if (along <= 1) continue;
        const horizontal = dir === 'left' || dir === 'right';
        const perp = Math.abs(horizontal ? dy : dx);
        const overlap = horizontal ? Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top) : Math.min(f.right, r.right) - Math.max(f.left, r.left);
        const cost = along + perp * (overlap > 0 ? 0.6 : 3);
        if (!best || cost < best.cost) best = { el, cost };
        if (horizontal && overlap > 0 && (!sameRow || cost < sameRow.cost)) sameRow = { el, cost };
    }
    return (sameRow ?? best)?.el ?? null;           // Left/Right never leave the row while there is something left or right in it
}

export const current = () => (state.key ? focusables().find(el => keyOf(el) === state.key) ?? null : null);

export function setFocus(el) {
    document.querySelectorAll('.nf-focus').forEach(n => n.classList.remove('nf-focus'));
    if (!el) { state.key = null; return; }
    el.classList.add('nf-focus');
    state.key = keyOf(el); state.rect = el.getBoundingClientRect();
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

// The sensible first control for the current screen.
export function firstFocus() {
    const list = focusables();
    return list.find(el => el.matches('[data-start=continue]')) ?? list.find(el => el.matches('[data-start=play]'))
        ?? (inSheet() ? list.find(el => el.matches('.acts button, [data-keep], [data-pick]')) ?? list[0]
            : list.find(el => el.closest('#console') && !el.disabled) ?? list.find(el => el.closest('#hand')) ?? list[0]);
}

export function move(dir) {
    const here = current();
    if (!here) { setFocus(firstFocus()); return; }
    const next = neighbour(here, dir);
    if (next) setFocus(next);
}

// Called after every render: keep the same control focused if it still exists, otherwise the nearest one to where it was.
export function restore(active) {
    if (!active) { document.querySelectorAll('.nf-focus').forEach(n => n.classList.remove('nf-focus')); return; }
    const sheetNow = inSheet();
    if (sheetNow && !state.layerWasSheet) state.returnKey = state.key;           // a sheet just opened: remember where to come back to
    const list = focusables();
    let target = list.find(el => keyOf(el) === state.key);
    if (!target && !sheetNow && state.layerWasSheet && state.returnKey) target = list.find(el => keyOf(el) === state.returnKey);
    if (!target && sheetNow && !state.layerWasSheet) target = firstFocus();
    if (!target && state.rect) {
        const c = centre(state.rect);
        target = list.map(el => ({ el, d: Math.hypot(centre(el.getBoundingClientRect()).x - c.x, centre(el.getBoundingClientRect()).y - c.y) })).sort((a, b) => a.d - b.d)[0]?.el;
    }
    state.layerWasSheet = sheetNow;
    setFocus(target ?? firstFocus());
}

export const focusZone = zone => {
    const list = focusables().filter(el => zoneOf(el) === zone);
    const here = current();
    setFocus(list.find(el => here && zoneOf(here) === zone && el === here) ?? list[0] ?? here);
};

// The whole navigation graph of the current screen, for tests: key -> { up, down, left, right } (keys or null).
export function graph() {
    const list = focusables(); const out = {};
    for (const el of list) {
        out[keyOf(el)] = Object.fromEntries(['up', 'down', 'left', 'right'].map(d => { const n = neighbour(el, d, list); return [d, n ? keyOf(n) : null]; }));
    }
    return out;
}
