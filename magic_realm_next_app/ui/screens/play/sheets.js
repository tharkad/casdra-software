// play/sheets.js: which sheet or card is on screen: sheets() decides, from the pending question and G.ui.sheet, what the layer shows; the Journal is journal.js.
import { phasesFor } from '../../../engine/day.js';
import { nameOf } from '../../../engine/items.js';
import { nameOfClearing, tileName } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { h } from '../../dom.js';
import { lengthLine, timed } from '../../gametext.js';
import { HELP } from '../info.js';
import { meetSheet, offerSheet } from '../meetui.js';
import { endOptionSheet, leaveSheet, quitSheet } from '../tableui.js';
import { abandon, act, isForced } from './actions.js';
import { combatHost, fightBeat, sharedFightHost } from './combat.js';
import { mc, modal, tc } from './kit.js';
import { choiceSheet, effortSheet, enchantSheet, learnSheet, pickSheet, restSheet, runesSheet, searchSheet, tableName, turnEndSheet } from './phases.js';
import { overScreen, restartSheet } from './endscreen.js';
import { reportSheet } from './results.js';
import { journalSheet } from './journal.js';
import { drawSheet, fightOverSheet, playersSheet, sharedOverSheet, sharedRestartSheet, tableSheet } from './shared.js';
import { cardInfoSheet, charSheet, cursesSheet, itemSheet, slotSheet, spellSheet, spellsSheet } from './sheet_char.js';
import { pieceSheet } from './piece_card.js';
import { clearingSheet } from './sheet_clearing.js';
import { bugSheet, calendarSheet, menuSheet, raceSheet, scoreSheet, setupCardSheet } from './sheet_info.js';
import { hireSheet, tradeSheet } from './sheet_trade.js';
import { render } from './shell.js';
import { setWelcomed, vpNow, welcomed } from './state.js';

// ---- sheets ----
// A look at the belongings, the Journal, the menu, the calendar... while a question waits on a sheet: the question stays where it is (under the scrim) and the look opens over it;
// closing the look gives the question back. (A fight, the draw and the other full-screen things have their own hosts and are not covered.)
const LOOKS = new Set(['char', 'menu', 'calendar', 'score', 'journal', 'dice', 'log', 'curses', 'spells', 'spell', 'item', 'cardinfo', 'key', 'help', 'tables', 'setupcard', 'card', 'piece']);
const QUESTIONS = new Set(['turn-end', 'rest', 'search-table', 'search-choice', 'effort-cost', 'runes-target', 'learn-spell', 'enchant-choice', 'trade', 'trade-offer', 'hire', 'hire-offer']);

export function sheets(G, lookOnly = false) {
    if (!lookOnly && LOOKS.has(G.ui.sheet) && QUESTIONS.has(G.st.pending?.type)) {
        const look = G.ui.sheet; G.ui.sheet = null;
        let under; try { under = sheets(G); } finally { G.ui.sheet = look; }
        return [...under, ...sheets(G, true)];
    }
    const out = [];
    const p = lookOnly ? null : G.st.pending;
    if (G.ui.sheet === 'bug') { out.push(bugSheet(G)); return out; }
    if (G.shared && G.ui.sheet === 'draw') { out.push(drawSheet(G)); return out; }
    if (G.shared && p?.type === 'restart') { out.push(sharedRestartSheet(G, p)); if (G.ui.sheet === 'menu') out.push(menuSheet(G)); return out; }
    if (G.shared && p?.type === 'end-option') { out.push(endOptionSheet(tc(G), p)); return out; }
    if (G.shared && G.ui.sheet === 'fightover') { out.push(fightOverSheet(G)); return out; }
    { const ts = G.shared && !lookOnly ? tableSheet(G) : null; if (ts) { out.push(ts); return out; } }          // (what the table asks me: a vote, marked away, welcome back)
    // A shared fight: a seat that is in it (or was, and watches) gets the shared frame; the map is one tap away at every step. Anyone else only sees the banner in the dock.
    if (G.shared && G.st.battle?.members?.[G.st.ch.id] && sharedFightHost(G, out)) return out;
    if (p?.type?.startsWith('combat') || fightBeat(G)) { combatHost(G, out); return out; }
    // The game is over (solo or a race): the death callout or the verdict, full screen, once the fight has had its one beat. A dead character may return tomorrow (a sheet over it).
    if (!G.shared && p?.type === 'over') { out.push(overScreen(G)); if (G.ui.restartVp) out.push(restartSheet(G)); return out; }
    if (G.ui.sheet === 'piece' && G.ui.piece) { out.push(pieceSheet(G)); return out; }
    if (G.ui.peek && G.ui.sel && p?.type === 'plan') { out.push(clearingSheet(G)); return out; }
    const lookAt = G.ui.mapPeek && G.ui.sheet === 'clearing' && G.ui.sel;       // a clearing looked at while a decision waits (the decision sheet is peeked): it opens over the bar
    if (p?.type === 'turn-end') out.push(turnEndSheet(G));
    else if (p?.type === 'turn-end') out.push(turnEndSheet(G));
    else if (p?.type === 'rest') out.push(restSheet(G, p));
    else if (p?.type === 'search-table') { if (!isForced(p)) out.push(searchSheet(G, p)); }
    else if (p?.type === 'effort-cost') out.push(effortSheet(G, p));
    else if (p?.type === 'runes-target') out.push(runesSheet(G, p));
    else if (p?.type === 'learn-spell') out.push(learnSheet(G, p));
    else if (p?.type === 'phase-pick' && G.ui.pickAct && G.ui.pickAct !== 'move') out.push(pickSheet(G, p));
    else if (p?.type === 'enchant-choice') out.push(enchantSheet(G, p));
    else if (p?.type === 'search-choice') out.push(choiceSheet(G, p));
    else if (p?.type === 'trade' || p?.type === 'trade-offer') out.push(tradeSheet(G, p));
    else if (p?.type === 'hire' || p?.type === 'hire-offer') out.push(hireSheet(G, p));
    else if (G.shared && p?.type === 'meet-offer') { out.push(offerSheet(mc(G), p)); if (G.ui.sheet === 'players') out.push(playersSheet(G)); }
    else if (G.shared && G.ui.sheet === 'meet') out.push(meetSheet(mc(G)));
    else if (!G.ui.welcomeDone && !welcomed() && G.st.day === 1 && p?.type === 'plan') {
        // two lines, in the voice of the rest of the game (QA-9): where you stand, then the shape of a day. The phase count is the one the tray shows (phasesFor); no number, place or item name breaks across a line (DR-18).
        const things = G.st.ch.items.map(i => nameOf(G.data, i).replace(/ /g, '\u00A0'));
        const gear = things.length ? ` with ${things.length > 1 ? `${things.slice(0, -1).join(', ')} and ${things.at(-1)}` : things[0]}` : ', with no weapon or armor yet';
        const n = phasesFor(G.st, G.data, []).total;
        out.push(modal(G, 'Welcome', h('div', { class: 'welcome' },
            h('p', { class: 'ds-voice' }, `You wake at the ${G.st.ch.startDwelling}${gear}. ${lengthLine(G.st)}`.replace(/ (\d+)/g, '\u00A0$1')),
            h('p', { class: 'ds-voice' }, `Each morning you plan ${n}\u00A0phases in secret. Then the day plays out, and at night you fight whoever shares your clearing.`)),
        { kind: 'result', bare: true, eyebrow: G.st.ch.name, footer: h('div', { class: 'dayres-foot' }, h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'welcome-ok', onclick: () => { setWelcomed(); G.ui.welcomeDone = true; render(G); } }, 'Begin')) }));
    }
    else if (p?.type === 'plan' && G.st.day > 1 && G.ui.reportedDay !== G.st.day && G.ui.sheet !== 'plan') out.push(reportSheet(G));
    else if (G.ui.sheet === 'char') out.push(charSheet(G));
    else if (G.ui.sheet === 'slot') out.push(slotSheet(G));
    else if (G.ui.sheet === 'clearing' && G.ui.sel) out.push(clearingSheet(G));
    else if (G.ui.sheet === 'menu') out.push(menuSheet(G));
    else if (G.ui.sheet === 'confirm-abandon' && !G.race) out.push(modal(G, 'Abandon this game?', h('div', { class: 'confirmbox' },
        h('p', {}, `${G.st.ch?.name ?? 'Your hero'} is on day ${G.st.day}${timed(G.st) ? ` of ${G.st.lastDay ?? 28}` : ''}, with ${G.st.ch?.gold ?? 0} gold, ${G.st.ch?.fame ?? 0} Fame and ${G.st.ch?.notoriety ?? 0} Notoriety.`),
        h('p', { class: 'hint bad' }, 'Abandoning ends this adventure for good. It stays in History as abandoned, but it cannot be picked up again.')),
        { close: () => { G.ui.sheet = null; render(G); }, bare: true, footer: h('div', { class: 'ds-opt-foot' },
            h('button', { type: 'button', class: 'ds-btn danger', 'data-act': 'confirm-abandon', onclick: () => abandon(G) }, 'Abandon this game'),
            h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'keep-playing', onclick: () => { G.ui.sheet = null; render(G); } }, 'Keep playing')) }));
    else if (G.ui.sheet === 'race' && G.race) out.push(raceSheet(G));
    else if (G.ui.sheet === 'players' && G.shared) out.push(playersSheet(G));
    else if (G.ui.sheet === 'quit-confirm' && G.shared) out.push(quitSheet(tc(G)));
    else if (G.ui.sheet === 'leave-confirm' && G.shared) out.push(leaveSheet(tc(G), vpNow(G)));
    else if (G.ui.sheet === 'calendar') out.push(calendarSheet(G));
    else if (G.ui.sheet === 'over' && G.shared) out.push(sharedOverSheet(G));
    else if (G.ui.sheet === 'card') out.push(modal(G, G.st.ch.name, h('div', {}, G.data.art?.cards?.[G.st.ch.id] ? h('img', { class: 'cardpic', src: G.data.art.cards[G.st.ch.id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { G.ui.sheet = 'char'; render(G); } }));
    else if (G.ui.sheet === 'journal' || G.ui.sheet === 'dice' || G.ui.sheet === 'log') out.push(journalSheet(G));
    else if (G.ui.sheet === 'tables') out.push(modal(G, 'Tables', h('div', { class: 'tables' },
        ...[['Meeting Table', 'meetingTable'], ['Search table', 'searchTable'], ['Missile table', 'missileTable'], ['Power of the Pit', 'pitTable']].filter(([, k]) => G.data.art?.misc?.[k])
            .flatMap(([t, k]) => [h('h3', {}, t), h('img', { class: 'tablepic', src: G.data.art.misc[k], alt: t })])), { close: () => { G.ui.sheet = null; render(G); } }));
    else if (G.ui.sheet === 'setupcard') out.push(setupCardSheet(G));
    else if (G.ui.sheet === 'item') out.push(itemSheet(G));
    else if (G.ui.sheet === 'cardinfo') out.push(cardInfoSheet(G));
    else if (G.ui.sheet === 'curses') out.push(cursesSheet(G));
    else if (G.ui.sheet === 'spells') out.push(spellsSheet(G));
    else if (G.ui.sheet === 'spell') out.push(spellSheet(G));
    else if (G.ui.sheet === 'score') out.push(scoreSheet(G));
    else if (G.ui.sheet === 'key') out.push(modal(G, 'Map key', h('div', { class: 'key' },
        ...[['I H C G', 'Dwellings: Inn, House, Chapel, Guard house; the number beside it is the natives there'],
            ['\u25C6 \u2713', 'A site you have discovered (gold edge): you may loot it or read its runes'], ['\u25C6', 'A site chit that has turned up but is not yet discovered: Locate it first'], ['\u266A', 'A sound chit that has turned up: monsters stir in that clearing'],
            ['?', 'A face-down chit in that tile; a letter means you have peeked at it'], ['red', 'Monsters (the number is how many)'], ['blue', 'Natives'],
            ['5 \u25A0 \u25A0 \u25C6 \u266A', 'A busy clearing: when its names will not fit beside it they become one marker. The number is the clearing; each chip is a kind of thing there (red monsters, blue people, \u2302 dwellings, \u25C6 sites, \u266A sounds, with how many). Tap it to see everything in the clearing'],
            ['? on a dotted line', 'A hidden path or secret passage printed on the tile that you have not discovered yet: you cannot use it until you do'],
            ['\u25C7', 'You: solid when you are seen, hollow when you are hidden']].map(([k, t]) => h('p', {}, h('b', {}, k), ' ', t))), { close: () => { G.ui.sheet = null; render(G); } }));
    else if (G.ui.sheet === 'help') out.push(modal(G, 'How to play', h('div', {}, ...HELP.flatMap(([t, x]) => [h('h3', {}, t), h('p', {}, x)])), { close: () => { G.ui.sheet = null; render(G); } }));
    if (lookAt && out.length) out.push(clearingSheet(G));
    return out;
}
