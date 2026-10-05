import { h, clear } from './dom.js';
import { createController, HUMAN, RIVAL } from './controller.js';
import { indexActions, cardUid, actAttr } from './actions.js';
import { chooseAction } from '../bot/policy.js';
import { hud } from './hud.js';
import { consoleBar } from './console.js';
import { marketPane } from './market.js';
import { facilityPane } from './facility.js';
import { handStrip } from './hand.js';
import { zoomSheet } from './zoom.js';
import { ppePicker } from './ppe.js';
import { recapSheet } from './recap.js';
import { gameOverSheet } from './gameover.js';
import { menuSheet } from './menu.js';
import { helpSheet } from './help.js';

const ui = { pane: 'market', zoom: null, ppeSel: [], menu: false, help: false, recapSeen: null };
const params = new URLSearchParams(location.search);
const storage = (() => { try { return params.has('seed') ? null : localStorage; } catch { return null; } })();
const controller = createController({ storage, onChange: render });
const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const PANES = [['market', 'Market'], ['facility', 'Mine'], ['rival', 'Rival']];

function newGame(level) {
    Object.assign(ui, { pane: 'market', zoom: null, ppeSel: [], menu: false, help: false, recapSeen: null });
    const seed = params.has('seed') ? Number(params.get('seed')) : undefined;
    controller.newGame({ seed, difficulty: level ?? params.get('level') ?? undefined, startingPlayer: params.get('start') === 'rival' ? RIVAL : params.has('seed') ? HUMAN : undefined });
}

const ctx = {
    controller, ui,
    setUi(patch) { Object.assign(ui, patch); render(); },
    act(action) { Object.assign(ui, { zoom: null, ppeSel: [] }); controller.dispatch(action); },
    newGame,
};

function paneBody() {
    if (ui.pane === 'facility') return facilityPane(ctx, HUMAN);
    if (ui.pane === 'rival') return facilityPane(ctx, RIVAL);
    return marketPane(ctx);
}

function render() {
    const s = controller.state();
    Object.assign(ctx, { s, legal: controller.legal() });
    ctx.idx = indexActions(ctx.legal);
    const tabs = h('nav', { id: 'tabs' }, PANES.map(([key, label]) => h('button', {
        class: `tab ${ui.pane === key ? 'on' : ''}`, 'data-pane': key, onclick: () => ctx.setUi({ pane: key }) }, label)));
    clear(app).append(hud(ctx), consoleBar(ctx), h('main', { id: 'main' }, tabs, paneBody()), handStrip(ctx));
    const recap = controller.recap();
    const sheet = s.turn.phase === 'over' ? gameOverSheet(ctx)
        : ui.help ? helpSheet(ctx)
            : ui.menu ? menuSheet(ctx)
            : ppePicker(ctx) ?? (ui.zoom ? zoomSheet(ctx) : null)
                ?? (recap && ui.recapSeen !== recap.turnNo ? recapSheet(ctx) : null);
    clear(overlay);
    if (sheet) overlay.append(h('div', { class: 'scrim' }, sheet));
}

document.addEventListener('click', e => {
    const open = e.target.closest('[data-open="recap"]');
    if (open) { ui.recapSeen = null; render(); return; }
    const zoom = e.target.closest('[data-zoom]');
    if (zoom && !zoom.classList.contains('nozoom') && !zoom.closest('.pick')) ctx.setUi({ zoom: Number(zoom.dataset.zoom) });
});

// Test hook: what the baseline bot would do for the human, described so a test can click the real control.
window.__xp = {
    controller, ui, ctx,
    botPlan() {
        const a = chooseAction(controller.state(), controller.legal());
        return { act: actAttr(a), uid: cardUid(a) ?? null, type: a.type, uids: a.uids ?? null };
    },
};
if (!controller.load()) newGame();
else render();
