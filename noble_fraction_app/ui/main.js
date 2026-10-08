import { h, clear } from './dom.js';
import { createController, HUMAN, RIVAL } from './controller.js';
import { indexActions, cardUid, actAttr, actionGroup } from './actions.js';
import { chooseAction } from '../bot/policy.js';
import { hud } from './hud.js';
import { consoleBar } from './console.js';
import { marketPane } from './market.js';
import { facilityPane } from './facility.js';
import { handStrip } from './hand.js';
import { zoomSheet } from './zoom.js';
import { ppePicker } from './ppe.js';
import { gameOverSheet } from './gameover.js';
import { menuSheet } from './menu.js';
import { helpSheet } from './help.js';
import { logSheet } from './log.js';
import { startScreen } from './start.js';
import { statsSheet } from './stats.js';
import { confirmNewSheet } from './confirm.js';
import { createProfile } from './profile.js';
import { createGameStore, buildRecord } from './gamelogs.js';
import { ACHIEVEMENTS, achievementById } from '../profile/achievements.js';
import * as fx from './fx.js';
import { loadSettings, saveSettings, prefersReducedMotion } from './settings.js';
import { createInput } from './input/input.js';
import { createDrag } from './drag/drag.js';
import { loadExpert, expertReady } from '../ai/expert.js';

const params = new URLSearchParams(location.search);
const persistent = !params.has('seed');                      // ?seed=N is a throwaway test game
const store = (() => { try { return persistent ? localStorage : null; } catch { return null; } })();
const settings = persistent ? loadSettings() : {};

const ui = { screen: 'game', pane: 'market', zoom: null, ppeSel: [], menu: false, help: false, log: false, stats: false, statsTab: 'overview',
    drag: settings.drag !== false, level: params.get('level') ?? settings.level ?? 'normal', mode: params.get('mode') ?? settings.mode ?? 'normal', gameAch: [], skip: false };
let busy = false;
let fxMode = params.get('fx') ?? settings.fx ?? (prefersReducedMotion() ? 'off' : 'normal');
fx.setSpeed(fxMode);

const controller = createController({ storage: store, onChange: render, autoRival: false });
const profile = createProfile(store);
const games = createGameStore(store);                      // every finished game, replayable (see gamelogs.js)
const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const PANES = [['market', 'Market'], ['facility', 'My Tableau'], ['rival', "Rival's Tableau"]];
const wait = n => new Promise(resolve => setTimeout(resolve, n));
let input = null;                                     // created once ctx exists (below)

// ---- stats + achievements, updated after every state change ----
let earnedNow = [];
function award(ids) {
    ids.forEach(id => {
        ui.gameAch.push(id);
        earnedNow.push(id);
        const a = achievementById(id);
        if (a) fx.toast(`🏆 ${a.name} — ${a.text}`, 2);
    });
}
function track() {
    const s = controller.state();
    const now = Date.now();
    const base = { state: s, level: controller.level(), extra: controller.extra(), now };
    if (!base.extra.startedAt) base.extra = { ...base.extra, startedAt: now };
    const live = profile.live(base);
    let extra = live.extra;
    award(live.newly);
    if (s.turn.phase === 'over') {
        const done = profile.finish({ ...base, extra });
        if (done.summary) games.add(buildRecord({ record: controller.record(), summary: done.summary, now }));
        award(done.newly);
        extra = done.extra;
    }
    // Remember where in the game log each achievement was earned, so the turn log can show it.
    const last = s.log.at(-1);
    const ach = [...(extra.ach ?? []), ...earnedNow.map(id => ({ id, turnNo: last?.turnNo ?? s.turn.number, by: last?.by ?? 0, afterIndex: s.log.length }))];
    earnedNow = [];
    controller.setExtra({ ...extra, ach });
}

// ---- playing: the human acts, then the Rival's turn is watched step by step ----
async function runRival() {
    if (!controller.rivalToMove()) return;
    if (!fx.enabled()) { controller.playRivalToEnd(); track(); return; }
    busy = true; ui.skip = false; ui.pane = 'market'; document.body.dataset.busy = '1'; render();
    fx.clearToasts();
    fx.toast("Rival's turn", 1);
    while (controller.rivalToMove() && !ui.skip) {
        const before = fx.capture(controller.state());
        const step = controller.stepRival();
        fx.play({ before, next: controller.state(), events: step.events, actor: RIVAL });
        track();
        for (let waited = 0; waited < fx.ms(step.events.length ? 1000 : 160) && !ui.skip; waited += 40) await wait(40);
    }
    if (controller.rivalToMove()) { controller.playRivalToEnd(); track(); }
    busy = false; delete document.body.dataset.busy; render();
    if (controller.state().turn.phase !== 'over') fx.toast('Your turn', 0);
}

function act(action) {
    if (busy) return;
    Object.assign(ui, { zoom: null, ppeSel: [] });
    const before = fx.capture(controller.state());
    const from = controller.state().log.length;
    controller.dispatch(action);
    fx.play({ before, next: controller.state(), events: controller.state().log.slice(from), actor: HUMAN });
    track();
    runRival();
}

// The Expert Rival's net is fetched the first time it is needed; the game waits for it so Expert never silently plays as Hard.
async function ensureExpert(level) {
    if (level !== 'expert' || expertReady()) return;
    try { await loadExpert(); } catch { /* offline or missing: the policy falls back to Hard rather than stalling */ }
}

async function newGame(level, mode) {
    await ensureExpert(level ?? ui.level);
    Object.assign(ui, { screen: 'game', pane: 'market', zoom: null, ppeSel: [], menu: false, help: false, log: false, stats: false, confirmNew: false, gameAch: [], level: level ?? ui.level, mode: mode ?? ui.mode });
    if (persistent) saveSettings({ level: ui.level, mode: ui.mode });
    const seed = params.has('seed') ? Number(params.get('seed')) : undefined;
    controller.newGame({ seed, mode: ui.mode, difficulty: level ?? params.get('level') ?? ui.level, startingPlayer: params.get('start') === 'rival' ? RIVAL : params.has('seed') ? HUMAN : undefined });
    track();
    if (fx.enabled()) {                                   // the table is dealt in rather than cutting to it (a tap skips); nothing can be played meanwhile
        busy = true; document.body.dataset.busy = '1';
        await fx.intro();
        busy = false; delete document.body.dataset.busy;
    }
    runRival();
}

async function continueGame() {
    if (!controller.load()) return newGame();
    await ensureExpert(controller.level());
    Object.assign(ui, { screen: 'game', pane: 'market', gameAch: [], mode: controller.mode(), level: controller.level() });
    render();
    runRival();
}

const ctx = {
    controller, ui, profile, games, fxMode,
    setUi(patch) { Object.assign(ui, patch); render(); },
    act, newGame, continueGame,
    skip() { ui.skip = true; },
    mainMenu() { Object.assign(ui, { screen: 'start', menu: false }); render(); },
    setDrag(on) { ui.drag = on; if (persistent) saveSettings({ drag: on }); drag.cancel('toggle', true); render(); },
    setFx(mode) { fxMode = mode; fx.setSpeed(mode); if (persistent) saveSettings({ fx: mode }); render(); },
};

input = createInput({ ctx });
const drag = createDrag({ ctx, fx, enabled: () => ui.drag !== false,
    tip: { should: () => persistent && !loadSettings().dragTip, mark: () => saveSettings({ dragTip: true }) } });

function paneBody() {
    if (ui.pane === 'facility') return facilityPane(ctx, HUMAN);
    if (ui.pane === 'rival') return facilityPane(ctx, RIVAL);
    return marketPane(ctx);
}

function pickSheet(s) {
    if (ui.screen === 'start') return ui.confirmNew ? confirmNewSheet(ctx) : ui.stats ? statsSheet(ctx) : ui.help ? helpSheet(ctx) : null;
    return s.turn.phase === 'over' ? gameOverSheet(ctx)
        : ui.stats ? statsSheet(ctx)
            : ui.log ? logSheet(ctx)
                : ui.help ? helpSheet(ctx)
                    : ui.menu ? menuSheet(ctx)
                        : ppePicker(ctx) ?? (ui.zoom ? zoomSheet(ctx) : null);
}

// Tapping the dim area around a sheet closes it like its Close button. Sheets that need an answer
// (the Shift Engineer picker, the game-over summary, the abandon-game question) are not dismissible this way.
function dismissTop() {
    if (ui.confirmNew) return ctx.setUi({ confirmNew: false });
    if (ui.stats) return ctx.setUi({ stats: false });
    if (ui.log) return ctx.setUi({ log: false });
    if (ui.help) return ctx.setUi({ help: false });
    if (ui.menu) return ctx.setUi({ menu: false });
    if (ui.zoom) return ctx.setUi({ zoom: null });
    return null;
}
const scrim = sheet => h('div', { class: 'scrim', onclick: e => { if (e.target === e.currentTarget && !(sheet.dataset.sheet === 'gameover' || sheet.dataset.sheet === 'ppe')) dismissTop(); } }, sheet);

// A hint too long for its slot slowly pans back and forth so the whole line can be read (instead of "…").
function fitHint() {
    const box = document.querySelector('#hud .hint');
    const text = box?.querySelector('.hint-text');
    if (!text) return;
    const hidden = Math.ceil(text.scrollWidth - box.clientWidth);
    box.classList.toggle('scrolls', hidden > 1);
    if (hidden > 1) {
        box.style.setProperty('--shift', `${-hidden - 2}px`);
        box.style.setProperty('--dur', `${Math.max(4, hidden / 26 + 2.4).toFixed(1)}s`);        // ~26px a second plus a pause at each end
    }
}
window.addEventListener('resize', fitHint);

// A hand that fits is laid out normally; one that is too wide for its strip overlaps by exactly the amount needed.
function fitHand() {
    const box = document.querySelector('#hand .cards');
    if (!box) return;
    box.style.removeProperty('--hand-overlap');
    const cards = [...box.querySelectorAll('.card')];
    if (cards.length < 2) return;
    const natural = cards.at(-1).getBoundingClientRect().right - cards[0].getBoundingClientRect().left;
    const room = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight);
    if (natural > room) box.style.setProperty('--hand-overlap', `${((natural - room) / (cards.length - 1)).toFixed(2)}px`);
}
window.addEventListener('resize', fitHand);

// Scroll indicators for the tableau strips: chevrons at the ends appear only when there is more to see that way
// (the native scrollbar is hidden). They are also tappable.
function fitArrows() {
    const strip = document.querySelector('#main .pane');
    const main = document.getElementById('main');
    main?.querySelectorAll('.scroll-arrow').forEach(a => a.remove());
    if (!strip || strip.classList.contains('market')) return;
    const make = dir => {
        const a = Object.assign(document.createElement('button'), { className: `scroll-arrow ${dir}`, textContent: dir === 'left' ? '‹' : '›', ariaLabel: `Scroll ${dir}`, tabIndex: -1 });
        a.addEventListener('click', e => { e.stopPropagation(); strip.scrollBy({ left: (dir === 'left' ? -1 : 1) * strip.clientWidth * 0.7, behavior: 'smooth' }); });
        main.append(a); return a;
    };
    const left = make('left'); const right = make('right');
    const update = () => {
        left.hidden = strip.scrollLeft < 2;
        right.hidden = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
    };
    strip.addEventListener('scroll', update, { passive: true });
    update();
}
window.addEventListener('resize', fitArrows);

function render() {
    const s = controller.state();
    clear(overlay);
    if (ui.screen === 'start' || !s) {
        clear(app).append(startScreen(ctx));
        const sheet = pickSheet(s);
        if (sheet) overlay.append(scrim(sheet));
        return;
    }
    const rivalTurn = s.turn.phase !== 'over' && s.turn.active === RIVAL;
    Object.assign(ctx, { s, fxMode, busy, rivalTurn, legal: rivalTurn ? [] : controller.legal() });
    ctx.idx = indexActions(ctx.legal, s);
    const tabs = h('nav', { id: 'tabs' }, PANES.map(([key, label]) => h('button', {
        class: `tab ${ui.pane === key ? 'on' : ''}`, 'data-pane': key, onclick: () => ctx.setUi({ pane: key }) }, label)));
    clear(app).append(hud(ctx), consoleBar(ctx), h('main', { id: 'main' }, tabs, paneBody()), handStrip(ctx));
    const sheet = pickSheet(s);
    if (sheet) overlay.append(scrim(sheet));
    fitHint();
    fitHand();
    fitArrows();
    input?.afterRender();
    drag.afterRender();
}

// belt and braces for browsers that ignore user-select (and the iOS magnifier / context menu)
document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('dragstart', e => e.preventDefault());

document.addEventListener('click', e => {
    const zoom = e.target.closest('[data-zoom]');
    if (zoom && !zoom.classList.contains('nozoom') && !zoom.closest('.pick')) ctx.setUi({ zoom: Number(zoom.dataset.zoom) });
});

// Test hook: what the baseline bot would do for the human, described so a test can click the real control.
window.__xp = {
    controller, ui, ctx, profile, games, fx, input, drag,
    isBusy: () => busy,
    botPlan() {
        const a = chooseAction(controller.state(), controller.legal());
        return { act: actAttr(a), uid: cardUid(a) ?? null, type: a.type, uids: a.uids ?? null, group: actionGroup(a, controller.state()) };
    },
};

if (params.has('seed')) newGame();
else { ui.screen = 'start'; render(); }
void ACHIEVEMENTS;
