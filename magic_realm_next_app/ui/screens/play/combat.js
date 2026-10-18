// play/combat.js: the combat host: puts the fight screens (combatui.js for a solo fight, sharedfight.js for a shared one) on the sheet layer, with the map one tap away
// ("Back to the fight") and the belongings sheets that may cover the fight and be put away again.
import { h } from '../../dom.js';
import { combatSheet } from '../combatui.js';
import { sharedFightSheet } from '../sharedfight.js';
import { act } from './actions.js';
import { modal } from './kit.js';
import { render } from './shell.js';
import { cardInfoSheet, charSheet, itemSheet, spellSheet } from './sheet_char.js';
import { clearingSheet } from './sheet_clearing.js';
import { logSheet } from './results.js';
import { playersSheet } from './shared.js';
import { diceSheet } from './sheets.js';

// A shared fight. Returns true when it filled `out` (the caller returns it as it is), false when there is no fight screen for this seat after all.
export function sharedFightHost(G, out) {
    if (G.ui.combatMap) {
        if (G.ui.sheet === 'clearing' && G.ui.sel) out.push(clearingSheet(G));
        out.push(h('div', { class: 'combat-back' }, h('button', { class: 'btn primary big', 'data-act': 'back-to-fight', onclick: () => { G.ui.combatMap = false; render(G); } }, 'Back to the fight')));
        return true;
    }
    const sheet = sharedFightSheet({ st: G.st, data: G.data, act: act.bind(null, G), ui: G.ui, render: () => render(G), crew: G.crew, answer: G.answer, peek: { gear: () => { G.ui.sheet = 'char'; render(G); }, map: () => { G.ui.combatMap = true; G.ui.sheet = null; render(G); } } });
    if (sheet) {
        out.push(sheet);
        if (G.ui.sheet === 'char') out.push(charSheet(G));
        else if (G.ui.sheet === 'item') out.push(itemSheet(G));
        else if (G.ui.sheet === 'cardinfo') out.push(cardInfoSheet(G));
        else if (G.ui.sheet === 'spell') out.push(spellSheet(G));
        else if (G.ui.sheet === 'players') out.push(playersSheet(G));
        else if (G.ui.sheet === 'dice') out.push(diceSheet(G));
        else if (G.ui.sheet === 'log') out.push(logSheet(G));
        else if (G.ui.sheet === 'card') out.push(modal(G, G.st.ch.name, h('div', {}, G.data.art?.cards?.[G.st.ch.id] ? h('img', { class: 'cardpic', src: G.data.art.cards[G.st.ch.id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { G.ui.sheet = 'char'; render(G); } }));
        return true;
    }
    return false;
}

// A solo fight (the pending question is one of the combat steps).
export function combatHost(G, out) {
    // The fight can be set aside to look at the map, or covered by the belongings sheets, and then picked up again.
    if (G.ui.combatMap) {
        if (G.ui.sheet === 'clearing' && G.ui.sel) out.push(clearingSheet(G));
        out.push(h('div', { class: 'combat-back' }, h('button', { class: 'btn primary big', 'data-act': 'back-to-fight', onclick: () => { G.ui.combatMap = false; render(G); } }, 'Back to the fight')));
        return out;
    }
    out.push(combatSheet({ st: G.st, data: G.data, act: act.bind(null, G), ui: G.ui, render: () => render(G), peek: { gear: () => { G.ui.sheet = 'char'; render(G); }, map: () => { G.ui.combatMap = true; G.ui.sheet = null; render(G); } } }));
    if (G.ui.sheet === 'char') out.push(charSheet(G));
    else if (G.ui.sheet === 'item') out.push(itemSheet(G));
    else if (G.ui.sheet === 'cardinfo') out.push(cardInfoSheet(G));
    else if (G.ui.sheet === 'spell') out.push(spellSheet(G));
    else if (G.ui.sheet === 'card') out.push(modal(G, G.st.ch.name, h('div', {}, G.data.art?.cards?.[G.st.ch.id] ? h('img', { class: 'cardpic', src: G.data.art.cards[G.st.ch.id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { G.ui.sheet = 'char'; render(G); } }));
    return out;
}
