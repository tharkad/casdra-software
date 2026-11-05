// play/looks.js: the sheets a player may open to LOOK at something at any moment (the menu and what it opens, the Belongings, the Journal, the calendar, the score, the map key ...), built in one place so every
// host (the map's sheet layer, the fight's host, the shared fight's host) shows the same one the same way. A look is not a question: it never blocks the game, it has no scrim, and putting it away gives the screen back as it was.
// (Notes 99 and 101: during a fight the menu opened but its Journal, Calendar, Score ... were built nowhere on the fight's host, so the tap seemed dead and the sheet turned up behind the fight when it was over.)
import { h } from '../../dom.js';
import { ownSheet, gameOf } from '../../combat/feed.js';
import { timed } from '../../gametext.js';
import { HELP } from '../info.js';
import { abandon } from './actions.js';
import { modal } from './kit.js';
import { cardInfoSheet, charSheet, cursesSheet, itemSheet, slotSheet, spellSheet, spellsSheet } from './sheet_char.js';
import { journalSheet } from './journal.js';
import { bugSheet, calendarSheet, menuSheet, scoreSheet, setupCardSheet } from './sheet_info.js';
import { leaderSheet } from './leaders.js';
import { settingsSheet } from './sheet_settings.js';
import { pieceSheet } from './piece_card.js';
import { render } from './shell.js';

export const keySheet = G => modal(G, 'Map key', h('div', { class: 'key' },
    ...[['I H C G', 'Dwellings: Inn, House, Chapel, Guard house; the number beside it is the natives there'],
        ['◆ ✓', 'A site you have discovered (gold edge): you may loot it or read its runes'], ['◆', 'A site chit that has turned up but is not yet discovered: Locate it first'], ['♪', 'A sound chit that has turned up: monsters stir in that clearing'],
        ['?', 'A face-down chit in that tile; a letter means you have peeked at it'], ['red', 'Monsters (the number is how many)'], ['blue', 'Natives'],
        ['5 ■ ■ ◆ ♪', 'A busy clearing: when its names will not fit beside it they become one marker. The number is the clearing; each chip is a kind of thing there (red monsters, blue people, ⌂ dwellings, ◆ sites, ♪ sounds, with how many). Tap it to see everything in the clearing'],
        ['? on a dotted line', 'A hidden path or secret passage printed on the tile that you have not discovered yet: you cannot use it until you do'],
        ['◇', 'You: solid when you are seen, hollow when you are hidden']].map(([k, t]) => h('p', {}, h('b', {}, k), ' ', t))), { close: () => { G.ui.sheet = null; render(G); } });

export const helpSheet = G => modal(G, 'How to play', h('div', {}, ...HELP.flatMap(([t, x]) => [h('h3', {}, t), h('p', {}, x)])), { close: () => { G.ui.sheet = null; render(G); } });

export const tablesSheet = G => modal(G, 'Tables', h('div', { class: 'tables' },
    ...[['Meeting Table', 'meetingTable'], ['Search table', 'searchTable'], ['Missile table', 'missileTable'], ['Power of the Pit', 'pitTable']].filter(([, k]) => G.data.art?.misc?.[k])
        .flatMap(([t, k]) => [h('h3', {}, t), h('img', { class: 'tablepic', src: G.data.art.misc[k], alt: t })])), { close: () => { G.ui.sheet = null; render(G); } });

export const cardSheet = G => modal(G, ownSheet(G.st, G.data).name, h('div', {}, G.data.art?.cards?.[ownSheet(G.st, G.data).id] ? h('img', { class: 'cardpic', src: G.data.art.cards[ownSheet(G.st, G.data).id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { G.ui.sheet = 'char'; render(G); } });

export const abandonSheet = G => modal(G, 'Abandon this game?', h('div', { class: 'confirmbox' },
    h('p', {}, `${G.st.ch?.name ?? 'Your hero'} is on day ${gameOf(G.st, G.data).day}${timed(gameOf(G.st, G.data)) ? ` of ${gameOf(G.st, G.data).lastDay ?? 28}` : ''}, with ${G.st.ch?.gold ?? 0} gold, ${G.st.ch?.fame ?? 0} Fame and ${G.st.ch?.notoriety ?? 0} Notoriety.`),
    h('p', { class: 'hint bad' }, 'Abandoning ends this adventure for good. It stays in History as abandoned, but it cannot be picked up again.')),
    { close: () => { G.ui.sheet = null; render(G); }, bare: true, footer: h('div', { class: 'ds-opt-foot' },
        h('button', { type: 'button', class: 'ds-btn danger', 'data-act': 'confirm-abandon', onclick: () => abandon(G) }, 'Abandon this game'),
        h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'keep-playing', onclick: () => { G.ui.sheet = null; render(G); } }, 'Keep playing')) });

/** The sheet for `G.ui.sheet` when it is one of the looks, or null (a name that is not a look: a question's own sheet, the plan ...). */
export function lookSheet(G) {
    switch (G.ui.sheet) {
        case 'menu': return menuSheet(G);
        case 'char': return G.st.ch?.leader ? leaderSheet(G) : charSheet(G);          // (a hired leader's sheet is his own: leaders.js)
        case 'slot': return slotSheet(G);
        case 'item': return itemSheet(G);
        case 'cardinfo': return cardInfoSheet(G);
        case 'curses': return cursesSheet(G);
        case 'spells': return spellsSheet(G);
        case 'spell': return spellSheet(G);
        case 'piece': return G.ui.piece ? pieceSheet(G) : null;
        case 'card': return cardSheet(G);
        case 'calendar': return calendarSheet(G);
        case 'score': return scoreSheet(G);
        case 'journal': case 'dice': case 'log': return journalSheet(G);
        case 'key': return keySheet(G);
        case 'help': return helpSheet(G);
        case 'tables': return tablesSheet(G);
        case 'setupcard': return setupCardSheet(G);
        case 'settings': return settingsSheet(G);
        case 'bug': return bugSheet(G);
        case 'confirm-abandon': return G.race ? null : abandonSheet(G);
        default: return null;
    }
}
