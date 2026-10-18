// play/state.js: the game screen's ONE shared mutable object (`G`, made by newPlayState), the save slot in localStorage, and the small views and "seen" markers that read it.
// G holds everything that used to be a local variable of gameScreen(): the engine state (G.st, a seat's view when online), the loaded data, the map, the UI state bag (G.ui),
// the online/shared connections and the game record. Every play module takes G as its first argument; nothing else in play/ keeps UI state of its own.
import { finalize } from '../../../engine/gamerecord.js';
import { upgradeState } from '../../../engine/party.js';
import { scoreGame } from '../../../engine/score.js';
import { h } from '../../dom.js';
import { putRecord } from '../../gamestore.js';
import { meetLines } from '../../meet.js';

const SAVE_KEY = 'mr-save-v1';

const WELCOME_KEY = 'mr-welcomed-v1';

export const welcomed = () => { try { return !!localStorage.getItem(WELCOME_KEY); } catch { return true; } };

export const setWelcomed = () => { try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ } };

export function saveGame(st) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch { /* storage may be unavailable */ } }

export function loadSaved() { try { const s = localStorage.getItem(SAVE_KEY); return s ? upgradeState(JSON.parse(s)) : null; } catch { return null; } }       // (a save is plain data; upgradeState reads any version and puts the st.ch / st.pending accessors back)

export function clearSaved() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

export function myId(G) { return G.answer?.you?.character ?? G.st?.actor ?? null; }

// the meeting lines I have already looked at: everything up to here is old news (a result card tells what came after)
export function meetEnd(G) { const l = G.st?.log ? meetLines(G.st, myId(G)) : []; return l.length ? l.at(-1).i + 1 : 0; }

export function logEnd(G) { return (G.st?.logSkipped ?? 0) + (G.st?.log?.length ?? 0); }          // (the first line ever is 0, whatever the server trimmed from this view)

export function newMeetLines(G) { if (!G.shared) return []; if (G.ui.meetSeen == null || G.ui.meetSeen > logEnd(G)) G.ui.meetSeen = meetEnd(G); return meetLines(G.st, myId(G)).filter(l => l.i >= G.ui.meetSeen); }

export function persist(G, now = false) {
    if (!G.rec || !G.st) return;
    clearTimeout(G.persistTimer);
    const write = () => { finalize(G.rec, G.st); putRecord(G.rec); };
    if (now) write(); else G.persistTimer = setTimeout(write, 700);
}

export function noteError(G, action, e, kind) {
    G.rec?.errors.push({ day: G.st?.day, period: G.st?.period, pending: G.st?.pending?.type ?? null, action: action ? JSON.parse(JSON.stringify(action)) : null, message: String(e?.message ?? e), kind,
        bug: /^(TypeError|ReferenceError|RangeError)$/.test(e?.name ?? '') });
    persist(G);
}

function backKey(G) { return `mr-back-${G.shared.game}`; }

export function backSeen(G, k) { try { return localStorage.getItem(backKey(G)) === k; } catch { return false; } }

export function markBackSeen(G, k) { try { localStorage.setItem(backKey(G), k); } catch { /* ignore */ } }

// The end of a fight I took part in is an event too: a card with what each character took away, shown once per fight on this device (the fight is read from the lines the server sends its participants).
function overKey(G) { return `mr-fight-${G.shared.game}`; }

export function overSeen(G, k) { try { return localStorage.getItem(overKey(G)) === k; } catch { return false; } }

export function markOverSeen(G, k) { try { localStorage.setItem(overKey(G), k); } catch { /* ignore */ } }

// The draw of the chits (7.1.1) is an event: it is shown once a day, the first time this device sees it.
function drawKey(G) { return `mr-draw-${G.shared.game}`; }

export function drawSeen(G, day) { try { return Number(localStorage.getItem(drawKey(G))) >= day; } catch { return false; } }

export function markDrawSeen(G, day) { try { localStorage.setItem(drawKey(G), String(day)); } catch { /* ignore */ } }

// The score as it stands today, worked the way the game works it out at the end.
export function vpNow(G) { try { return G.st.period === 'over' && G.st.ch.dead ? -100 : scoreGame(G.st, G.data).total; } catch { return 0; } }

// The one mutable object of the game screen. Fields:
//   ctx            the router context (go(), params, saved, state, data)
//   root, mapBox, strip, dock, tray, layer, mapTools     the screen's DOM: status strip, map, dice tray, dock, sheet layer
//   st, data, map  the engine state (a seat's view when online), the loaded game data, the mounted map (see mapview.js)
//   ui             the UI state bag: sheet, sel, draft, toast, dockOpen... (all plain data; sheets() reads G.ui.sheet to decide what is on screen)
//   race, conn, standings, inflight, here          online race: the seat, the connection, the standings, a request in flight, presence
//   shared, sconn, answer, crew, feed, hadAsk, ms   shared table: the seat, the connection, the last server answer, the table read from it (party.js),
//                                                   what the others did in plain sight, whether I had a decision last render, my meetings (meet.js)
//   rec, persistTimer, mySeat, lastHero, table      the game record (engine/gamerecord.js) and its write timer, my seat number, the last tile the map centred on, the table's agreements
export function newPlayState(ctx) {
    const mapBox = h('div', { class: 'mapbox gamemap' });
    const G = {
        ctx,
        root: h('main', { class: 'screen game', 'data-screen': 'game' }),
        mapBox,
        strip: h('header', { class: 'status' }),
        dock: h('footer', { class: 'gdock' }),
        tray: h('div', { class: 'tray' }),
        layer: h('div', { class: 'layer' }),
        mapTools: null,
        lastHero: null, st: null, data: null, map: null, ui: { sheet: null, sel: null, draft: null, toast: null },
        // Online: this screen is one seat in a race. The server holds the game; `st` is the view it sent, and every action goes to it.
        race: ctx.params?.online ?? null,
        conn: null, standings: [], inflight: false, here: false,
        // Shared: this screen is one seat at a shared table. One engine state for everybody lives on the server; `st` is this seat's redacted view of it (upgradeState puts st.ch and st.pending on
        // it for MY character), and every answer goes to the server. `answer` is the whole reply (who the game waits for, the standings, presence); `crew` is the table read from it (party.js).
        shared: ctx.params?.shared ?? null,
        sconn: null, answer: null, crew: [], feed: [], hadAsk: false, ms: null,          // ms: my meetings (meet.js): with whom I may give or trade now, my policies, my open offer
        // The game record (engine/gamerecord.js): every action taken and what the game said, kept on the device so a game can be listed, read and replayed.
        rec: null, persistTimer: null,
        table: null,
    };
    G.mapTools = h('div', { class: 'maptools' },
        h('button', { 'aria-label': 'Centre on me', onclick: () => G.map?.focus(G.st.ch.onRoad ? G.st.ch.onRoad.from : G.st.ch.at) }, '\u25CE'),
        h('button', { 'aria-label': 'Show the whole realm', onclick: () => G.map?.fit() }, '\u2922'));
    mapBox.append(G.mapTools);
    // a tall dock (a result card, a decision) can leave the map too short for two buttons one above the other: then they sit side by side
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => G.mapTools.classList.toggle('row', mapBox.clientHeight > 0 && mapBox.clientHeight < 112)).observe(mapBox);
    G.root.append(G.strip, mapBox, G.tray, G.dock, G.layer);
    G.mySeat = (G.race ?? G.shared)?.seat;
    if (G.race) G.ui.sheet = ctx.params?.invited ? 'race' : null;
    try { if (localStorage.getItem('mr-dock-open') === '0') G.ui.dockOpen = false; } catch { /* ignore */ }
    return G;
}
