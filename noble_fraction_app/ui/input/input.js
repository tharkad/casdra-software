import * as focus from './focus.js';
import { cardLabel } from '../labels.js';

// Turns keyboard keys and Gamepad-API buttons into ONE set of abstract actions, and applies them to the UI.
// Actions: up down left right confirm back quick prevPane nextPane jumpHand jumpConsole menu log stats scrollUp scrollDown.
export const ACTIONS = ['up', 'down', 'left', 'right', 'confirm', 'back', 'quick', 'prevPane', 'nextPane', 'jumpHand', 'jumpConsole', 'menu', 'log', 'stats', 'scrollUp', 'scrollDown'];

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', ' ': 'confirm', Escape: 'back', Backspace: 'back',
    x: 'quick', '[': 'prevPane', ']': 'nextPane', h: 'jumpHand', c: 'jumpConsole', m: 'menu', l: 'log', s: 'stats', PageUp: 'scrollUp', PageDown: 'scrollDown' };
// Standard-mapping Gamepad buttons (Xbox / Steam Deck layout).
const BUTTONS = { 0: 'confirm', 1: 'back', 2: 'quick', 3: 'confirm', 4: 'prevPane', 5: 'nextPane', 6: 'jumpHand', 7: 'jumpConsole', 8: 'log', 9: 'menu', 10: 'stats',
    12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const REPEATING = new Set(['up', 'down', 'left', 'right']);
const FIRST_REPEAT_MS = 350; const REPEAT_MS = 90; const DEADZONE = 0.5;

// What each controller button is called on a keyboard (shown in the hint bar when the last thing used was the keyboard).
const KEY_GLYPH = { A: 'Enter', B: 'Esc', X: 'X', 'LB / RB': '[ ]', LT: 'H', RT: 'C', Start: 'M', Select: 'L', 'R-stick': 'PgUp/Dn' };

export function createInput({ ctx, onMode = () => {} }) {
    let mode = 'touch';
    let source = 'pad';                                       // what drove the last action: 'pad' or 'key'
    const held = new Map();                                   // control id -> { since, last }

    function setMode(next) { if (mode !== next) { mode = next; document.body.dataset.input = next; onMode(next); } }

    function scroller() { return [...document.querySelectorAll('.log-body, .help-body, .stats-body')].find(el => el.scrollHeight > el.clientHeight) ?? null; }
    // The right stick pans whatever can scroll: a sheet vertically, a tableau strip horizontally (speed follows how far it is tilted).
    function pan(rx, ry) {
        setMode('pad');
        if (focus.inSheet()) { scroller()?.scrollBy({ top: ry * 22 }); return; }
        const strip = document.querySelector('.pane');
        if (strip && strip.scrollWidth > strip.clientWidth + 1) strip.scrollBy({ left: rx * 26 });
    }

    // The button-hint bar: what each button does *right now*, from where the focus is.
    function hints() {
        const here = focus.current();
        const sheet = focus.inSheet();
        const list = [['a', 'A', here ? (here.dataset.uid ? 'Open' : 'Select') : 'Select']];
        if (sheet) {
            const needsAnswer = !!document.querySelector('#overlay [data-sheet=gameover], #overlay [data-sheet=ppe]');
            if (!needsAnswer) list.push(['b', 'B', 'Close']);
            if (scroller()) list.push(['sh', 'R-stick', 'Scroll']);
            return list;
        }
        const strip = document.querySelector('.pane');
        const scrolls = strip && strip.scrollWidth > strip.clientWidth + 1;
        const acts = here?.dataset.uid ? ctx.idx?.byUid.get(Number(here.dataset.uid)) ?? [] : [];
        if (acts.length === 1) list.push(['x', 'X', cardLabel(acts[0], ctx.s).replace(/ \(net .*\)$/, '')]);
        list.push(['sh', 'LB / RB', 'Tabs'], ['sh', 'LT', 'Hand'], ['sh', 'RT', 'Turn buttons'], ['sh', 'Start', 'Menu'], ['sh', 'Select', 'Log']);
        if (scrolls) list.splice(2, 0, ['sh', 'R-stick', 'Scroll']);
        return list;
    }
    function renderHints() {
        let bar = document.getElementById('hints');
        if (!bar) { bar = Object.assign(document.createElement('div'), { id: 'hints' }); document.body.append(bar); }
        bar.replaceChildren(...hints().map(([cls, glyph, label]) => {
            const span = Object.assign(document.createElement('span'), { className: 'hint-key' });
            span.innerHTML = `<i class="pad-btn ${cls}">${source === 'key' ? KEY_GLYPH[glyph] ?? glyph : glyph}</i>${label}`;
            return span;
        }));
    }

    function perform(action, from = 'pad') {
        source = from;
        setMode('pad');
        const here = focus.current();
        switch (action) {
        case 'up': case 'down': case 'left': case 'right': focus.move(action); break;
        case 'confirm': (here ?? focus.firstFocus())?.click(); if (!here) focus.setFocus(focus.firstFocus()); break;
        case 'back': {
            if (!focus.inSheet()) break;
            const sheet = document.querySelector('#overlay .sheet');
            sheet?.querySelector('[data-close], [data-keep]')?.click();             // game-over and the Shift Engineer picker need an answer: no back
            break;
        }
        case 'quick': {
            if (!here?.dataset.uid) break;
            const actions = ctx.idx?.byUid.get(Number(here.dataset.uid)) ?? [];
            if (actions.length === 1) ctx.act(actions[0]);
            break;
        }
        case 'prevPane': case 'nextPane': {
            if (focus.inSheet()) break;
            const tabs = [...document.querySelectorAll('#tabs [data-pane]')]; const on = tabs.findIndex(t => t.classList.contains('on'));
            tabs[(on + (action === 'nextPane' ? 1 : tabs.length - 1)) % tabs.length]?.click();
            break;
        }
        case 'jumpHand': if (!focus.inSheet()) focus.focusZone('hand'); break;
        case 'jumpConsole': if (!focus.inSheet()) focus.focusZone('console'); break;
        case 'menu': document.querySelector('[data-open=menu]')?.click(); break;
        case 'log': document.querySelector('[data-open=log]')?.click(); break;
        case 'stats': document.querySelector('[data-open=stats]')?.click(); break;
        case 'scrollUp': scroller()?.scrollBy({ top: -120 }); break;
        case 'scrollDown': scroller()?.scrollBy({ top: 120 }); break;
        default: break;
        }
        renderHints();
    }

    function pressed(id, action, now) {
        const h = held.get(id);
        if (!h) { held.set(id, { since: now, last: now }); perform(action); return; }
        if (REPEATING.has(action) && now - h.since > FIRST_REPEAT_MS && now - h.last > REPEAT_MS) { h.last = now; perform(action); }
    }

    function poll(now = performance.now()) {
        const active = new Set();
        for (const pad of navigator.getGamepads?.() ?? []) {
            if (!pad) continue;
            pad.buttons.forEach((b, i) => { if (b.pressed && BUTTONS[i]) { const id = `${pad.index}:b${i}`; active.add(id); pressed(id, BUTTONS[i], now); } });
            const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
            if (Math.max(Math.abs(lx), Math.abs(ly)) > DEADZONE) {                      // left stick: snap to the dominant of the four directions
                const action = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'right' : 'left') : (ly > 0 ? 'down' : 'up');
                const id = `${pad.index}:stick`; active.add(id); pressed(id, action, now);
            }
            if (Math.max(Math.abs(rx), Math.abs(ry)) > 0.2) { active.add(`${pad.index}:rstick`); pan(Math.abs(rx) > 0.2 ? rx : 0, Math.abs(ry) > 0.2 ? ry : 0); }
        }
        for (const id of [...held.keys()]) if (!active.has(id)) held.delete(id);
    }

    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const action = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
        if (!action) return;
        e.preventDefault();
        perform(action, 'key');
    });
    document.addEventListener('pointerdown', () => { setMode('touch'); focus.restore(false); });
    // Without a controller nothing here costs anything: until a pad shows up we only look for one twice a second, and the
    // per-frame loop runs only while a pad is attached (it stops again two seconds after the last one goes away).
    const padPresent = () => [...(navigator.getGamepads?.() ?? [])].some(Boolean);
    let frames = false; let lastSeen = 0;
    function loop(t) { poll(t); if (padPresent()) lastSeen = t; if (t - lastSeen > 2000) { frames = false; return; } requestAnimationFrame(loop); }
    function watch() { if (!frames && padPresent()) { frames = true; lastSeen = performance.now(); requestAnimationFrame(loop); } }
    setInterval(watch, 500); window.addEventListener('gamepadconnected', watch); watch();

    return {
        perform, poll, pan, mode: () => mode, polling: () => frames,
        afterRender: () => { focus.restore(mode === 'pad'); if (mode === 'pad') renderHints(); },
        hints,
        graph: focus.graph, focus,
    };
}
