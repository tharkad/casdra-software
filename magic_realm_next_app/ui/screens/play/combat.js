// play/combat.js: the combat host: puts the fight screens (the combat scene for a solo fight, sharedfight.js for a shared one, on the same chrome) on the sheet layer, with the map one tap away
// ("Back to the fight") and the belongings sheets that may cover the fight and be put away again.
import { h } from '../../dom.js';
import { combatScene, combatBeat } from '../combat_scene.js';
import { sharedFightSheet } from '../sharedfight.js';
import { act } from './actions.js';
import { modal } from './kit.js';
import { render } from './shell.js';
import { cardInfoSheet, charSheet, itemSheet, spellSheet } from './sheet_char.js';
import { clearingSheet } from './sheet_clearing.js';
import { journalSheet } from './journal.js';
import { playersSheet } from './shared.js';

// A shared fight. Returns true when it filled `out` (the caller returns it as it is), false when there is no fight screen for this seat after all.
export function sharedFightHost(G, out) {
    if (G.ui.combatMap) {
        if (G.ui.sheet === 'clearing' && G.ui.sel) out.push(clearingSheet(G));
        out.push(h('div', { class: 'cb-back combat-back' }, h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'back-to-fight', onclick: () => { G.ui.combatMap = false; render(G); } }, 'Back to the fight')));
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
        else if (G.ui.sheet === 'dice' || G.ui.sheet === 'journal') out.push(journalSheet(G));
        else if (G.ui.sheet === 'log') out.push(journalSheet(G));
        else if (G.ui.sheet === 'card') out.push(modal(G, G.st.ch.name, h('div', {}, G.data.art?.cards?.[G.st.ch.id] ? h('img', { class: 'cardpic', src: G.data.art.cards[G.st.ch.id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { G.ui.sheet = 'char'; render(G); } }));
        return true;
    }
    return false;
}

// The beat after the last blow of a solo fight that the engine does not stop on: a death (the scene stays up one moment, then the results take over) or a win with no result screen of its own.
// Called by sheets() before it decides there is no fight; sets G.ui.cbBeat.how when the beat is due. The scene remembers the round before the last blow (combat_scene.js, sendMelee).
export function fightBeat(G) {
    const b = G.ui.cbBeat;
    if (!b) return false;
    const st = G.st;
    if (G.shared || st.combat || st.day !== b.day) { if (!st.combat) G.ui.cbBeat = null; return false; }
    if (st.over?.reason === 'died' && st.ch.dead !== false) { b.how = 'died'; return true; }
    if (st.log.slice(b.logLen).some(l => l.t === 'Combat is over: nothing hostile is left.')) { b.how = 'won'; return true; }
    G.ui.cbBeat = null;
    return false;
}

// A solo fight (the pending question is one of the combat steps, or the beat that follows the last of them).
export function combatHost(G, out) {
    // The fight can be set aside to look at the map, or covered by the belongings sheets, and then picked up again.
    if (G.ui.combatMap) {
        if (G.ui.sheet === 'clearing' && G.ui.sel) out.push(clearingSheet(G));
        out.push(h('div', { class: 'cb-back' }, h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'back-to-fight', onclick: () => { G.ui.combatMap = false; render(G); } }, 'Back to the fight')));
        return out;
    }
    const inFight = G.st.pending?.type?.startsWith('combat');
    const peek = { gear: () => { G.ui.sheet = 'char'; render(G); }, map: () => { G.ui.combatMap = true; G.ui.sheet = null; render(G); } };
    if (inFight) { if (G.st.pending.type === 'combat-over') G.ui.cbBeat = null; out.push(combatScene({ st: G.st, data: G.data, act: act.bind(null, G), ui: G.ui, render: () => render(G), peek })); }
    else out.push(combatBeat({ st: G.st, data: G.data, ui: G.ui, render: () => render(G) }));
    if (G.ui.sheet === 'char') out.push(charSheet(G));
    else if (G.ui.sheet === 'item') out.push(itemSheet(G));
    else if (G.ui.sheet === 'cardinfo') out.push(cardInfoSheet(G));
    else if (G.ui.sheet === 'spell') out.push(spellSheet(G));
    else if (G.ui.sheet === 'card') out.push(modal(G, G.st.ch.name, h('div', {}, G.data.art?.cards?.[G.st.ch.id] ? h('img', { class: 'cardpic', src: G.data.art.cards[G.st.ch.id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { G.ui.sheet = 'char'; render(G); } }));
    return out;
}
