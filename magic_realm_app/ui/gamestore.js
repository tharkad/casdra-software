// Where finished and running games are kept on the device: IndexedDB (a record with its whole log is far bigger than localStorage allows).
// If IndexedDB is not available (a private window, say) records are held in memory for the session and nothing breaks.
const DB = 'magic-realm-games', STORE = 'games';
const memory = new Map();
let dbp = null;

function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
        try {
            const r = indexedDB.open(DB, 1);
            r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.onblocked = () => reject(new Error('blocked'));
        } catch (e) { reject(e); }
    });
    return dbp;
}
const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function putRecord(rec) {
    memory.set(rec.id, rec);
    try { const db = await open(); await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec)); return true; } catch { return false; }
}
export async function getRecord(id) {
    try { const db = await open(); const r = await wrap(db.transaction(STORE).objectStore(STORE).get(id)); if (r) return r; } catch { /* use memory */ }
    return memory.get(id) ?? null;
}
// Every stored record (newest first). The logs are in them, so callers that only list should not hold on to the result.
export async function allRecords() {
    let list = [];
    try { const db = await open(); list = await wrap(db.transaction(STORE).objectStore(STORE).getAll()); } catch { /* use memory */ }
    const seen = new Set(list.map(r => r.id));
    for (const r of memory.values()) if (!seen.has(r.id)) list.push(r);
    return list.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}
export async function deleteRecord(id) {
    memory.delete(id);
    try { const db = await open(); await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)); } catch { /* ignore */ }
}
export async function clearRecords() {
    memory.clear();
    try { const db = await open(); await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).clear()); } catch { /* ignore */ }
}
