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

// The unfinished plan of the morning (QA-20): the draft survives a reload, with which phase was open and whether the plan was on screen. One small record next to the save, for THIS game and THIS day only
// (localStorage is channel-prefixed by channel.js, so the redesign keeps its own). It is gone the moment the day is started.
const UI_KEY = 'mr-ui-v1';
export function saveUi(G) {
    try {
        const st = G.st, d = G.ui.draft;
        if (G.shared || G.race || !st?.session?.id || st.pending?.type !== 'plan' || !d) { localStorage.removeItem(UI_KEY); return; }
        localStorage.setItem(UI_KEY, JSON.stringify({ session: st.session.id, day: st.day, draft: d, planStep: G.ui.planStep ?? 0, open: G.ui.sheet === 'plan' }));
    } catch { /* storage may be unavailable */ }
}
export function restoreUi(G) {
    try {
        const raw = localStorage.getItem(UI_KEY), u = raw ? JSON.parse(raw) : null, st = G.st;
        if (!u || G.shared || G.race || u.session !== st?.session?.id || u.day !== st.day || st.pending?.type !== 'plan' || !Array.isArray(u.draft?.slots)) return false;
        G.ui.draft = u.draft; G.ui.planStep = u.planStep ?? 0; if (u.open) G.ui.sheet = 'plan';
        return true;
    } catch { return false; }
}

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
//   root, mapBox, strip, tray (also `dock`), layer, mapTools     the screen's DOM: status strip, map, the tray (the decision layer), sheet layer; mapTools is the one map button
//   st, data, map  the engine state (a seat's view when online), the loaded game data, the mounted map (see mapview.js)
//   ui             the UI state bag: sheet, sel, draft, toast, dockOpen... (all plain data; sheets() reads G.ui.sheet to decide what is on screen)
//   race, conn, standings, inflight, here          online race: the seat, the connection, the standings, a request in flight, presence
//   shared, sconn, answer, crew, feed, hadAsk, ms   shared table: the seat, the connection, the last server answer, the table read from it (party.js),
//                                                   what the others did in plain sight, whether I had a decision last render, my meetings (meet.js)
//   rec, persistTimer, mySeat, lastHero, table      the game record (engine/gamerecord.js) and its write timer, my seat number, the last tile the map centred on, the table's agreements
export function newPlayState(ctx) {
    const mapBox = h('div', { class: 'ds-map mapbox gamemap' });
    const tray = h('footer', { class: 'ds-tray gdock' });
    const G = {
        ctx,
        root: h('main', { class: 'screen game ds-screen', 'data-screen': 'game' }),
        mapBox,
        strip: h('header', { class: 'ds-strip status' }),
        dock: tray, tray,                                  // (the tray replaced the dock, the dice bar and the drawer: `dock` stays as another name for it)
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
    // The one map button (bottom right of the map; wireShell puts it on the map once there is a map): the whole realm when the map is zoomed in, the crosshair (back to me) when it is zoomed out; a long press does the other. render() sets its icon.
    G.mapTools = h('button', { type: 'button', class: 'ds-map-btn', 'data-act': 'fit', 'aria-label': 'Show the whole realm' });
    G.root.append(G.strip, mapBox, tray, G.layer);
    G.mySeat = (G.race ?? G.shared)?.seat;
    if (G.race) G.ui.sheet = ctx.params?.invited ? 'race' : null;
    return G;
}
