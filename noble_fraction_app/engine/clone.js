// A deep copy for game states. States are plain data (objects, arrays, numbers, strings, booleans, null), so a hand-written walk is
// several times faster than structuredClone -- and apply() clones on every action, which dominates the cost of tree search.
export function cloneState(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
        const n = v.length; const out = new Array(n);
        for (let i = 0; i < n; i += 1) { const x = v[i]; out[i] = x === null || typeof x !== 'object' ? x : cloneState(x); }
        return out;
    }
    const out = {};
    for (const k in v) { const x = v[k]; out[k] = x === null || typeof x !== 'object' ? x : cloneState(x); }
    return out;
}
