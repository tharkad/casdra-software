// fit.js: the size class of the window, set on <html> as data-fit, and the zoom the interface is drawn at (--z).
// The game was a phone column. It is now three layouts, chosen by the window's shape and not by the device (an iPad in Stage Manager, a laptop window and a
// phone are all just windows):
//   phone  under 700 wide (or a short landscape phone): the column, as ever.
//   tall   a window taller than it is wide, 700 and up (an iPad held upright): the same column, filling the width, drawn larger.
//   wide   a window wider than it is tall, 900 and up (an iPad on its side, a laptop, a big monitor): the map takes the whole left; the right-hand RAIL holds the
//          story so far (the Journal, always open), the tray under it, and every sheet. The map is never covered by a sheet again.
// (the zoom grows with the window's height, a little slower than the height itself: a 1440p monitor is not drawn twice as large as a phone's chrome)
// --z is how much bigger the interface chrome (strip, rail, tray, sheets) is drawn than on a phone: CSS zoom, so type, rows and buttons grow together and stay sharp.
// It is capped (a rail wider than 40% of the window, or type bigger than 2.25x a phone's, only costs the map), and the map itself is never zoomed: it is a camera.
// Written to be read by css/ds-fit.css and by the few places that measure (shell.js syncCamera).
const root = document.documentElement;
const RAIL = 420;                                              // the rail's width in the interface's own pixels (a phone's width, near enough: every tray row was built for it)
const COLUMN = 500;                                            // the column of a tall window, in the same pixels

export function fitOf(w, h, coarse = false) {
    if (Math.min(w, h) < 600 || (coarse && h < 520)) return { fit: 'phone', z: 1 };           // (a phone, upright or on its side: the #turnup cover still asks for upright)
    if (w >= 900 && w / h >= 1.15) {
        const byHeight = near(Math.min(2.25, (h / 760) ** 0.85)), byRail = down(0.4 * w / RAIL);
        return { fit: 'wide', z: Math.max(1, Math.min(byHeight, byRail)) };
    }
    return { fit: 'tall', z: Math.min(1.75, Math.max(1, up(w / COLUMN))) };
}
// (quarter steps only: no odd zoom like 1.05, where text and hairlines blur)
const near = z => Math.round(z * 4) / 4, down = z => Math.floor(z * 4) / 4, up = z => Math.ceil(z * 4) / 4;

export function applyFit() {
    const { fit, z } = fitOf(innerWidth, innerHeight, matchMedia?.('(pointer: coarse)').matches);
    if (root.dataset.fit !== fit) root.dataset.fit = fit;
    if (root.style.getPropertyValue('--z') !== String(z)) root.style.setProperty('--z', String(z));
    // the zoom of a screen that is a single column (the front door, new game, history ...): the column leaves 48px a side for the corner buttons that stand outside it (the note microphone)
    const zc = fit === 'phone' ? 1 : fit === 'wide' ? z : Math.max(1, Math.min(z, down((innerWidth - 96) / 520)));
    if (root.style.getPropertyValue('--zc') !== String(zc)) root.style.setProperty('--zc', String(zc));
    root.style.setProperty('--rail-w', `${RAIL}px`);
    return fit;
}

export const isWide = () => root.dataset.fit === 'wide';

export function initFit(onChange) {
    let last = applyFit();
    const again = () => { const f = applyFit(); if (f !== last) { last = f; onChange?.(f); } };
    addEventListener('resize', again); addEventListener('orientationchange', () => setTimeout(again, 120));
}
