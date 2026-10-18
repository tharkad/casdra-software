// Playing a race over the internet: the server (server/server.mjs) holds each player's game and applies their actions; this file is the phone's side of that.
// The races this device is in live in localStorage with their seat tokens (a seat belongs to whoever holds its token).
const LIST_KEY = 'mr-online-v1', NAME_KEY = 'mr-online-name', SERVER_KEY = 'mr-online-server';

const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be unavailable */ } };

export const myName = () => read(NAME_KEY, '');
export const setMyName = n => write(NAME_KEY, n);
// Where the server is. Served by the game server itself (or a proxy that forwards /api/) it is simply this origin.
export const serverUrl = () => (read(SERVER_KEY, '') || location.origin).replace(/\/+$/, '');
export const setServerUrl = u => write(SERVER_KEY, String(u || '').trim());

export const myRaces = () => read(LIST_KEY, []);
export function rememberRace(r) {
    const list = myRaces().filter(x => !(x.game === r.game && x.server === r.server));
    list.unshift({ ...r, at: new Date().toISOString() });
    write(LIST_KEY, list.slice(0, 30));
}
export const forgetRace = (game, server) => write(LIST_KEY, myRaces().filter(x => !(x.game === game && x.server === server)));

// "https://host/path#race=GAME.INVITE" or just "GAME.INVITE" -> { game, invite, server? }
export function parseInvite(text) {
    const s = String(text ?? '').trim();
    const m = /race=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)(?:&s=([^&\s]+))?/.exec(s) ?? /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(s);
    if (!m) return null;
    return { game: m[1], invite: m[2], server: m[3] ? decodeURIComponent(m[3]) : null };
}
// The link a creator shares. When the server was started with MR_PUBLIC_URL and serves the app itself (health says so), that address is used: the host may be
// reached by the creator as http://100.x.y.z:8010 or localhost while friends must open https://name.tailnet.ts.net. Otherwise it is the page the creator is on.
export function inviteLink(race, here = { href: location.href, origin: location.origin }, health = lastHealth) {
    const tail = `#race=${race.game}.${race.invite}`;
    if (health?.publicUrl && health.static && String(race.server).replace(/\/+$/, '') === health.server) return `${health.publicUrl.replace(/\/+$/, '')}/${tail}`;
    const base = here.href.split('#')[0], same = race.server === here.origin;
    return `${base}${tail}${same ? '' : '&s=' + encodeURIComponent(race.server)}`;
}

export class ApiError extends Error { constructor(status, message, body) { super(message); this.status = status; this.body = body; } }

async function call(server, path, { method = 'GET', token, body, signal } = {}) {
    let r;
    try {
        r = await fetch(`${server}/api/games${path}`, { method, signal, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw new ApiError(0, 'Could not reach the game server.', null); }
    let j = null; try { j = await r.json(); } catch { /* not json */ }
    if (!r.ok) throw new ApiError(r.status, j?.error ?? `Server said ${r.status}.`, j);
    return j;
}

export const peekRace = (server, { game, invite }) => call(server, `/${game}/peek`, { method: 'POST', body: { invite } });

export async function createRace(server, name, choices) {
    const r = await call(server, '', { method: 'POST', body: { name, ...choices } });
    const race = { server, game: r.game, token: r.token, seat: r.seat, name, invite: r.invite };
    rememberRace(race); return race;
}
export async function joinRace(server, { game, invite }, name, choices) {
    const r = await call(server, `/${game}/join`, { method: 'POST', body: { invite, name, ...choices } });
    const race = { server, game, token: r.token, seat: r.seat, name };
    rememberRace(race); return race;
}

// One connection to one race as one seat.
export function connect(race, { onStandings, onStatus } = {}) {
    let stopped = false, ctl = null, retry = 0, seq = 0, nextId = 0;
    const id = () => `${Date.now().toString(36)}-${(++nextId).toString(36)}`;
    const api = {
        async view() { const v = await call(race.server, `/${race.game}/view`, { token: race.token }); seq = v.seq; return v; },
        // One action. A lost reply is retried with the same id, so it is never applied twice.
        async act(action) {
            const aid = id();
            for (let tries = 0; ; tries++) {
                try { const r = await call(race.server, `/${race.game}/act`, { method: 'POST', token: race.token, body: { action, seq, id: aid } }); seq = r.seq; return r; }
                catch (e) {
                    if (e.status === 409 && e.body?.view) { seq = e.body.seq; throw new ApiError(409, 'The game had moved on; it has been brought up to date.', e.body); }
                    if (e.status === 0 && tries < 3) { await new Promise(r => setTimeout(r, 600 * (tries + 1))); continue; }
                    throw e;
                }
            }
        },
        // The stream is "I am here": it carries everyone's standings and who else is present. It is dropped when the page is hidden and reopened when it comes back.
        start() {
            stopped = false;
            const open = async () => {
                if (stopped) return;
                ctl = new AbortController();
                try {
                    const r = await fetch(`${race.server}/api/games/${race.game}/stream`, { headers: { authorization: 'Bearer ' + race.token }, signal: ctl.signal });
                    if (!r.ok) throw new Error(String(r.status));
                    onStatus?.('here'); retry = 0;
                    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
                    for (;;) {
                        const { value, done } = await reader.read(); if (done) break;
                        buf += dec.decode(value, { stream: true });
                        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
                            const block = buf.slice(0, i); buf = buf.slice(i + 2);
                            const ev = /^event: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1];
                            if (ev === 'standings' && data) onStandings?.(JSON.parse(data));
                        }
                    }
                } catch { /* fall through to reconnect */ }
                if (stopped) return;
                onStatus?.('away');
                setTimeout(open, Math.min(15000, 800 * 2 ** retry++));
            };
            open();
        },
        stop() { stopped = true; ctl?.abort(); },
    };
    const vis = () => { if (document.hidden) { stopped = true; ctl?.abort(); } else if (stopped && api.running) { api.start(); } };
    api.running = false;
    const startAll = api.start; api.start = () => { api.running = true; startAll(); document.addEventListener('visibilitychange', vis); };
    const stopAll = api.stop; api.stop = () => { api.running = false; stopAll(); document.removeEventListener('visibilitychange', vis); };
    return api;
}

// Is there a game server to talk to? The title screen shows "Play online" only when there is (a static copy of the app has none).
export async function serverAvailable() {
    try {
        const server = serverUrl(), r = await fetch(`${server}/api/health`, { cache: 'no-store' }), j = await r.json();
        if (r.ok && j.ok === true) { lastHealth = { server, publicUrl: typeof j.publicUrl === 'string' ? j.publicUrl : null, static: j.static === true }; return true; }
        return false;
    } catch { return false; }
}
/** What the server last said about itself (set by serverAvailable): where friends should be sent, and whether it serves the app. */
let lastHealth = null;
