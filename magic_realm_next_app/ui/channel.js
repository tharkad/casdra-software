// Release channels. The same code is published twice on casdra.com: the stable game at /magic-realm/ and the redesign at /magic-realm-next/.
// Both are the same web origin, so they share localStorage and IndexedDB. The redesign keeps its own saved game, history and settings (a bug
// in it must never touch a stable save); online seats and the server address (keys 'mr-online*') are shared, so a shared realm can be opened from either.
export const CHANNEL = /(^|\/)magic-realm-next(\/|$)/.test(location.pathname) ? 'next' : 'stable';
export const SHARED_KEY = /^mr-online/;
export const BUG_URL = CHANNEL === 'next' ? '/magic-realm/bug-report' : 'bug-report';        // reports from either channel land in the one report box

if (CHANNEL === 'next') {
    const P = Storage.prototype, get = P.getItem, set = P.setItem, del = P.removeItem;
    const k = key => (SHARED_KEY.test(String(key)) ? String(key) : `next:${key}`);
    P.getItem = function (key) { return get.call(this, this === localStorage ? k(key) : key); };
    P.setItem = function (key, v) { return set.call(this, this === localStorage ? k(key) : key, v); };
    P.removeItem = function (key) { return del.call(this, this === localStorage ? k(key) : key); };
}
