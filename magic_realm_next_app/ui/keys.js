// keys.js: the keyboard, for a window that has one (a laptop, a monitor, an iPad with a keyboard). The game is played with a finger or a mouse and none of this is needed;
// it only saves a reach. Nothing here does what a tap could not: Enter presses the one green button that is on screen (the same button, with the same refusals), Escape puts a
// sheet away, F shows the whole realm, + and - zoom the map. A key typed into a field, or with Ctrl or Cmd held, is never taken.
import { fitOf } from './fit.js';

const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const live = sel => [...document.querySelectorAll(sel)].filter(el => visible(el) && el.getAttribute('aria-disabled') !== 'true' && !el.disabled);

export function initKeys() {
    addEventListener('keydown', e => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        if (fitOf(innerWidth, innerHeight).fit === 'phone') return;
        const t = e.target; if (t?.closest?.('input, textarea, select, [contenteditable], [data-note-sheet]')) return;
        const game = document.querySelector('.game'); if (!game) return;
        const map = window.__mr?.game?.map;
        if (e.key === 'Escape') {
            const x = live('.layer .ds-sheet .ds-sheet-head .x, .layer .ds-sheet [data-act="close"]').at(-1);
            if (x) { x.click(); e.preventDefault(); }
        } else if (e.key === 'Enter' && !(t instanceof HTMLButtonElement)) {
            const b = live('.layer .ds-sheet .ds-btn.primary, .layer .ds-sheet .ds-sheet-foot .ds-btn:last-child').at(-1) ?? (document.querySelector('.layer .ds-sheet') ? null : live('.ds-tray .ds-btn.primary').at(-1));
            if (b) { b.click(); e.preventDefault(); }
        } else if ((e.key === 'f' || e.key === 'F') && map) {
            document.querySelector('.game [data-act="fit"]')?.click(); e.preventDefault();
        } else if ((e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') && map?.camera && map.zoom) {
            map.zoom(map.camera().k * (e.key === '-' || e.key === '_' ? 0.8 : 1.25)); e.preventDefault();
        }
    });
}
