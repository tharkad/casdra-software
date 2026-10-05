// Small per-device preferences (animation speed, last chosen difficulty), kept in localStorage.
const KEY = 'noble-fraction.settings.v1';

export function loadSettings() {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}

export function saveSettings(patch) {
    const next = { ...loadSettings(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* blocked */ }
    return next;
}

export function prefersReducedMotion() {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
