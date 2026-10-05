// Modules register what they handle here; apply.js and legal.js stay generic.
export const handlers = {};      // action type -> (draft, action) => void
export const providers = [];     // (state) => action[]   (each returns only its own phase's actions)

export const handle = (type, fn) => { handlers[type] = fn; };
export const provide = fn => { providers.push(fn); };

// Order-insensitive identity for an action, so callers need not match key order.
export function canon(value) {
    if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
