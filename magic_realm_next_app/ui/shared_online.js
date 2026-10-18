// The phone's (and any client's) side of a SHARED game: one realm for 2 to 4 players (server/shared.mjs, docs/design/online-shared.md).
// online.js is the client of the race (every player has a private copy); this module is the client of the shared realm and does not change that one. It has no screens: it is the
// transport a lobby screen and the game screen will use, and tests/shared_server.test.mjs plays whole games through it.
//   create / join / peek     start or enter a game by invite
//   connect(...).view()      GET the answer for this seat (lobby, or the redacted state)
//   .choose() .start() .leave()   the lobby
//   .act(action)             answer the engine's question for MY character; a lost reply is retried with the same id, so an action is never applied twice
//   .watch() / .unwatch()    the push channel (SSE `update` carries this seat's whole answer); if it falls silent for 20 s, or cannot connect, the client polls instead
// Every answer has the same shape (SharedResponse in server/types.js): { phase, seq, you, view, waitingFor, yourTurn, paused, lobby?, standings, game }.
import { ApiError, rememberRace, parseInvite, peekRace } from './online.js';

export { ApiError, parseInvite };
/** Ask the server about a game by invite before taking a seat: { kind, status, maxSeats, seats:[{seat,name,character,ready}], taken:[character ids], seedCommit, ... }. */
export const peekShared = peekRace;

async function call(server, path, { method = 'GET', token, body, signal } = {}) {
    let r;
    try {
        r = await fetch(`${server}/api/games${path}`, { method, signal, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch { throw new ApiError(0, 'Could not reach the game server.', null); }
    let j = null; try { j = await r.json(); } catch { /* not json */ }
    if (!r.ok) throw new ApiError(r.status, j?.error ?? `Server said ${r.status}.`, j);
    return j;
}

/** Start a shared game as its host. `choices`: { maxSeats (2-4), mode, lastDay, options: { pvp, knightsAdjustment, watchfulNatives, quietMonsters }, character, vp, startDwelling, startSpells }.
 * Returns the game as this device keeps it: { kind:'shared', server, game, token, seat, name, invite, seedCommit }. */
export async function createShared(server, name, choices = {}) {
    const r = await call(server, '', { method: 'POST', body: { ...choices, name, kind: 'shared' } });
    const game = { kind: 'shared', server, game: r.game, token: r.token, seat: r.seat, name, invite: r.invite, seedCommit: r.seedCommit };
    rememberRace(game); return game;
}
/** Take a seat by invite ({ game, invite } from parseInvite). `choices` may already name a character and the sealed start. */
export async function joinShared(server, { game, invite }, name, choices = {}) {
    const r = await call(server, `/${game}/join`, { method: 'POST', body: { ...choices, invite, name } });
    const g = { kind: 'shared', server, game, token: r.token, seat: r.seat, name };
    rememberRace(g); return g;
}

/** Change my character or my sealed start in the lobby without holding a connection open (the wizard uses this). Resolves with the lobby answer. */
export const chooseShared = (game, choice) => call(game.server, `/${game.game}/choose`, { method: 'POST', token: game.token, body: choice });
/** One look at a game I am in (the lobby, or the table) without a connection. */
export const viewShared = game => call(game.server, `/${game.game}/view`, { token: game.token });

/** One connection to one shared game as one seat. `onUpdate(answer)` is called with every answer the client learns of (a push, a poll, or the reply to its own call);
 * `onStatus('here' | 'away' | 'polling')` says how the push channel is doing. */
export function connectShared(game, { onUpdate, onStatus, onResume, pollMs = 5000, silentMs = 20000 } = {}) {
    let seq = 0, nextId = 0, latest = null, ctl = null, stopped = true, wanted = false, retry = 0, lastChunk = 0, timer = null, poller = null;
    const id = () => `${Date.now().toString(36)}-${(++nextId).toString(36)}`;
    const take = r => { if (r && typeof r.seq === 'number') seq = r.seq; latest = r; onUpdate?.(r); return r; };
    const path = verb => `/${game.game}/${verb}`;
    const api = {
        get latest() { return latest; },
        get seq() { return seq; },
        async view() { return take(await call(game.server, path('view'), { token: game.token })); },
        async choose(choice) { return take(await call(game.server, path('choose'), { method: 'POST', token: game.token, body: choice })); },
        async start() { return take(await call(game.server, path('start'), { method: 'POST', token: game.token, body: {} })); },
        async leave(body = {}) { const r = await call(game.server, path('leave'), { method: 'POST', token: game.token, body }); api.unwatch(); return r; },          // (the host: { close: true } cancels the game; else it passes to the next player)
        /** The table's agreements (docs/design/multiplayer-harden.md): `away` { kind: 'propose' | 'vote' | 'withdraw' | 'back', seat?, yes? } marks a long-absent seat away (the autopilot plays it); `quit` { kind: 'propose' | 'vote' | 'withdraw' | 'leave', yes? } ends the game by vote, or leaves the map; `invite` renews the lobby's link (host). */
        async away(body) { return take(await call(game.server, path('away'), { method: 'POST', token: game.token, body })); },
        async quit(body) { return take(await call(game.server, path('quit'), { method: 'POST', token: game.token, body })); },
        async invite() { return call(game.server, path('invite'), { method: 'POST', token: game.token, body: {} }); },
        /** One action for my character. A 409 means the question I answered is not the game's any more: the fresh answer is taken (and passed to onUpdate) and an ApiError(409) thrown. */
        async act(action) {
            const aid = id();
            for (let tries = 0; ; tries++) {
                try { return take(await call(game.server, path('act'), { method: 'POST', token: game.token, body: { action, seq, id: aid } })); }
                catch (e) {
                    if (e.status === 409 && e.body?.view !== undefined) { take(e.body); throw e; }
                    if (e.status === 0 && tries < 3) { await new Promise(r => setTimeout(r, 600 * (tries + 1))); continue; }
                    throw e;
                }
            }
        },
        /** Open the push channel (the stream is also "I am here" for the others) and keep a poll as a fallback. */
        watch() {
            wanted = true;
            if (!stopped) return;
            stopped = false;
            const open = async () => {
                if (stopped) return;
                ctl = new AbortController();
                try {
                    const r = await fetch(`${game.server}/api/games/${game.game}/stream${seq ? `?since=${seq}` : ''}`, { headers: { authorization: 'Bearer ' + game.token }, signal: ctl.signal });
                    if (!r.ok) throw new Error(String(r.status));
                    onStatus?.('here'); retry = 0; lastChunk = Date.now();
                    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
                    for (;;) {
                        const { value, done } = await reader.read(); if (done) break;
                        lastChunk = Date.now();
                        buf += dec.decode(value, { stream: true });
                        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
                            const block = buf.slice(0, i); buf = buf.slice(i + 2);
                            const ev = /^event: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1];
                            if (ev === 'update' && data) take(JSON.parse(data));
                            if (ev === 'resume' && data) onResume?.(JSON.parse(data));          // what happened while this seat was away: { since, seq, missed, events: [{ seq, seat, name, type, kind?, auto? }] }
                            if (ev === 'bye') break;
                        }
                    }
                } catch { /* fall through to reconnect */ }
                lastChunk = 0;
                if (stopped) return;
                onStatus?.('away');
                timer = setTimeout(open, Math.min(15000, 800 * 2 ** retry++));
            };
            open();
            // the fallback: a silent channel (a phone that slept, a proxy that swallowed the stream) is polled
            poller = setInterval(async () => {
                if (stopped || Date.now() - lastChunk < silentMs) return;
                try { await api.view(); onStatus?.('polling'); } catch { /* the next tick tries again */ }
            }, pollMs);
            poller.unref?.();
            if (typeof document !== 'undefined') document.addEventListener('visibilitychange', vis);
        },
        unwatch() {
            wanted = false; stopped = true; ctl?.abort(); clearTimeout(timer); clearInterval(poller);
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', vis);
        },
    };
    const vis = () => { if (typeof document === 'undefined') return; if (document.hidden) { stopped = true; ctl?.abort(); clearTimeout(timer); clearInterval(poller); } else if (stopped && wanted) { api.watch(); } };
    return api;
}
