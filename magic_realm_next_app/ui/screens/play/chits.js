// play/chits.js: the mission, campaign and visitor chits on the play screen: the Take buttons of the phase tray, the chits listed in a clearing's sheet, the notices (the week's flip, a delivery, a win,
// a failure). The engine decides (missions.js takeable, whyNot, visitorsAt); these functions word it and send `take-chit`.
import { takeable, visitorsAt } from '../../../engine/missions.js';
import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { chitEl, costText, faceInfo, kindTag, noticesFrom, whyCopy } from '../../missions.js';
import { voicedWhy } from '../../spellwhy.js';
import { logText } from '../../voice.js';
import { act } from './actions.js';
import { showToast } from './kit.js';
import { render } from './shell.js';

const OPEN = new Set(['phase', 'phase-pick']);            // 7.2.4: "each time a character starts a phase of his turn" (the engine takes the action at these questions only)

// ---- taking a chit ----
export function takeNow(G) { return !!G.st.missions && !G.shared && !G.race && OPEN.has(G.st.pending?.type) && !G.st.ch.dead; }
export function takeList(G) { return takeNow(G) ? takeable(G.st, G.data) : []; }

// Take it (the engine pays the cost at once); the line it logs is told in a toast, in the voice that is on
export function doTake(G, t) {
    const before = G.st.log?.length ?? 0;
    act(G, { type: 'take-chit', chit: t.chit });
    const l = (G.st.log ?? []).slice(before).find(x => x.k === 'info');
    if (l) showToast(G, logText(l, G.st));
}
const refuse = (G, t) => showToast(G, voicedWhy(whyCopy(t.why)), true);

// The Take buttons of the phase tray: one chip for each mission or campaign chit in his clearing, dim with its reason when he may not take it.
export function takeChips(G) {
    return takeList(G).map(t => h('button', { type: 'button', class: `ds-chip spellact ms-take${t.ok ? '' : ' is-dim'}`, 'data-act': 'take-chit', 'data-chit': t.chit, 'data-kind': t.kind, 'aria-disabled': t.ok ? null : 'true',
        title: t.ok ? `Take the ${t.name} chit: it costs ${costText(t.cost)}` : whyCopy(t.why).detail,
        'aria-label': `Take the ${t.name} ${t.kind} chit, ${costText(t.cost).replace(/ /g, ' ')}${t.ok ? '' : `. Not now: ${whyCopy(t.why).story}`}`,
        onclick: () => (t.ok ? doTake(G, t) : refuse(G, t)) },
        chitEl(G.data, t.face, { cls: 'sm', dim: !t.ok }), h('span', { class: 'ms-take-t' }, `Take ${t.name}`), h('small', { class: 'ms-cost' }, costText(t.cost))));
}

// ---- a clearing's sheet: the chits that lie there (they lie face up, so everyone sees them) ----
export function chitRows(G, id) {
    const st = G.st, data = G.data;
    if (!st.missions) return [];
    const here = st.ch.at === id && !st.ch.onRoad, mine = new Map(takeList(G).map(t => [t.chit, t]));
    const rows = [];
    for (const c of st.missions.chits.filter(x => x.loc?.c === id)) {
        const info = faceInfo(data, c.face), t = mine.get(c.id);
        let action = null, tail = null;
        if (t) action = h('button', { type: 'button', class: `ds-btn sm${t.ok ? '' : ' is-dim'}`, 'data-act': 'take-chit', 'data-chit': t.chit, 'aria-disabled': t.ok ? null : 'true', onclick: () => (t.ok ? doTake(G, t) : refuse(G, t)) }, 'Take');
        else if (here && info.kind !== 'visitor') tail = 'You can take it at the start of a phase of your turn.';
        rows.push(h('div', { class: 'ds-row ms-row', 'data-chit-here': c.id, 'data-kind': info.kind },
            h('span', { class: 'art2' }, chitEl(data, c.face)),
            h('span', { class: 'main' }, h('b', {}, info.name, kindTag(data, c.face)), h('span', {}, info.line), tail ? h('span', { class: 'ds-meta' }, tail) : (t && !t.ok ? h('span', { class: 'ds-why' }, voicedWhy(whyCopy(t.why))) : null)),
            action));
    }
    return rows;
}

// ---- the notices: the engine's own lines about the chits, shown as a card in the tray until they are read ----
export function noticeCards(G) {
    const st = G.st;
    if (!st.missions || G.shared || G.race) return [];
    G.ui.msFrom ??= st.log?.length ?? 0;
    if (G.ui.msFrom > (st.log?.length ?? 0)) G.ui.msFrom = st.log.length;
    const list = noticesFrom(st, G.ui.msFrom);
    if (!list.length) return [];
    const shown = list.slice(-2);
    return [h('div', { class: `ms-notice ${shown.at(-1).kind}`, role: 'status', 'data-notice': shown.at(-1).kind },
        h('span', { class: 'ms-ico' }, icon(shown.at(-1).kind === 'failed' || shown.at(-1).kind === 'putdown' ? 'warn' : shown.at(-1).kind === 'flip' ? 'swap' : shown.at(-1).kind === 'appear' ? 'spark' : 'flag')),
        h('span', { class: 'main' }, ...shown.flatMap(n => [h('b', {}, n.title), h('span', {}, n.text)])),
        h('button', { type: 'button', class: 'ds-btn sm', 'data-act': 'notice-ok', onclick: () => { G.ui.msFrom = st.log.length; render(G); } }, 'OK'))];
}
