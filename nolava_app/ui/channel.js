// Release channels. The same code is published three times on casdra.com: the stable game at /magic-realm/, the redesign being worked on at
// /magic-realm-next/, and the playtest build at /nolava/ (a snapshot of the redesign that is pushed by hand, for outside testers).
// All are the same web origin, so they share localStorage and IndexedDB. Each non-stable channel keeps its own saved game, history and settings (a bug
// in it must never touch another channel's save); online seats and the server address (keys 'mr-online*') are shared, so a shared realm can be opened from any.
// Notes and "Report a problem" from /nolava/ go to their OWN report box (nolava_reports.db, never read by the automatic note pipeline); the other channels use the old one.
export const CHANNEL = /(^|\/)nolava(\/|$)/.test(location.pathname) ? 'nolava' : /(^|\/)magic-realm-next(\/|$)/.test(location.pathname) ? 'next' : 'stable';
export const dbName = base => (CHANNEL === 'stable' ? base : `${base}-${CHANNEL}`);
export const SHARED_KEY = /^mr-online/;
export const BUG_URL = CHANNEL === 'nolava' ? '/nolava/bug-report' : CHANNEL === 'next' ? '/magic-realm/bug-report' : 'bug-report';        // stable and next share one report box; the playtest build has its own

if (CHANNEL !== 'stable') {
    const P = Storage.prototype, get = P.getItem, set = P.setItem, del = P.removeItem;
    const k = key => (SHARED_KEY.test(String(key)) ? String(key) : `${CHANNEL}:${key}`);
    P.getItem = function (key) { return get.call(this, this === localStorage ? k(key) : key); };
    P.setItem = function (key, v) { return set.call(this, this === localStorage ? k(key) : key, v); };
    P.removeItem = function (key) { return del.call(this, this === localStorage ? k(key) : key); };
}
