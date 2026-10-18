// tapguard.js: the tap guard (QA-1 finding QA-4). A result you should READ must not be skipped by the second half of a double tap: for ~350 ms after a layer (a tray, a sheet,
// a card) appeared or changed, a tap on its primary is ignored. Pure DOM, no state of its own beyond the timestamps it puts on elements.
//
//   guard(el, ms = 350)          the element ignores clicks for ms from now.
//   guardTree(root, ms, sel)     guard every primary (`.ds-btn.primary`, `[data-guard]`) inside root (and root itself when it matches).
//   guardIfChanged(store, key, sig, root, ms)
//                                 for a layer that is redrawn on every render: starts a new window only when `sig` (a string that says WHAT the layer is: pending type,
//                                 phase, day, log length ...) differs from the last one stored in store[key]; a redraw of the same layer inside an open window re-guards
//                                 the fresh buttons for the time that is left. Returns true while the window is open.
//
// Automated browsers (navigator.webdriver, i.e. every tools/ui_*.py script) tap the moment a button exists, so the guard is OFF for them unless a test turns it on with
// `window.__mrGuard = true` (tools/ui_tapguard.py does). A real hand is always guarded.
export const GUARD_MS = 350;
const PRIMARY = '.ds-btn.primary, [data-guard]';
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const off = () => typeof navigator !== 'undefined' && navigator.webdriver && !(typeof window !== 'undefined' && window.__mrGuard);

export function guard(el, ms = GUARD_MS, from = now()) {
    if (!el || off()) return el;
    const until = from + ms;
    if (el.__guardUntil == null) {
        // capture phase on the element itself runs before its own onclick / click listeners
        el.addEventListener('click', e => {
            if (now() < el.__guardUntil) { e.stopImmediatePropagation(); e.preventDefault(); el.dataset.guarded = '1'; setTimeout(() => { delete el.dataset.guarded; }, 120); }
        }, true);
    }
    el.__guardUntil = Math.max(el.__guardUntil ?? 0, until);
    return el;
}

export function guardTree(root, ms = GUARD_MS, sel = PRIMARY, from = now()) {
    if (!root || off()) return root;
    if (root.matches?.(sel)) guard(root, ms, from);
    root.querySelectorAll?.(sel).forEach(el => guard(el, ms, from));
    return root;
}

export function guardIfChanged(store, key, sig, root, ms = GUARD_MS, sel = PRIMARY) {
    const rec = store[key] ??= { sig: null, at: 0 };
    if (rec.sig !== sig) { rec.sig = sig; rec.at = now(); }
    const left = rec.at + ms - now();
    if (left <= 0) return false;
    guardTree(root, left, sel);
    return true;
}
