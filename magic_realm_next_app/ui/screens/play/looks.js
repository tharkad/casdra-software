// play/looks.js: the sheets a player may open to LOOK at something at any moment (the menu and what it opens, the Belongings, the Journal, the calendar, the score, the map key ...), built in one place so every
// host (the map's sheet layer, the fight's host, the shared fight's host) shows the same one the same way. A look is not a question: it never blocks the game, it has no scrim, and putting it away gives the screen back as it was.
// (Notes 99 and 101: during a fight the menu opened but its Journal, Calendar, Score ... were built nowhere on the fight's host, so the tap seemed dead and the sheet turned up behind the fight when it was over.)
import { h } from '../../dom.js';
import { ownSheet, gameOf, questionOf } from '../../combat/feed.js';
import { timed } from '../../gametext.js';
import { thisGame } from '../../modes.js';
import { HELP } from '../info.js';
import { abandon, act } from './actions.js';
import { suicideOk } from './suicide.js';
import { nameOfClearing } from '../../../engine/catalogue.js';
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

// The four tables, drawn from the game's own data (tables.json) as part of the interface: no pictures of rule pages (note: Mike, 2026-11-06).
const wrapT = (cls, ...kids) => h('div', { class: 'rtable-wrap' }, h('table', { class: `rtable ${cls}` }, ...kids));
const th = t => h('th', { scope: 'col' }, t), td = (t, cls) => h('td', { class: cls ?? null }, t);
const SEARCH_WORD = { choice: 'Your choice of any result', clues: 'Clues', paths: 'Hidden paths', 'hidden-enemies': 'Hidden enemies', passages: 'Secret passages', 'discover-chits': 'Discover chits', nothing: 'Nothing' };
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const LEVEL = { 2: 'Two levels up', 1: 'One level up', 0: 'No change', '-1': 'One level down', '-2': 'Two levels down', '-3': 'Three levels down' };
export const tablesSheet = G => {
    const T = G.data.tables ?? {}, six = [1, 2, 3, 4, 5, 6], words = codes => [].concat(codes).map(c => SEARCH_WORD[c] ?? c).join(' and ');
    const part = (title, note, el) => [h('h3', {}, title), note ? h('p', { class: 'hint' }, note) : null, el];
    const meet = T.meeting ? part('Meeting Table', `Roll: ${T.meeting.dice}. The columns are how the people there feel about you.`,
        wrapT('nowrap', h('thead', {}, h('tr', {}, th('Roll'), ...T.meeting.columns.map(th))), h('tbody', {}, ...six.map(n => h('tr', {}, td(String(n), 'roll'), ...(T.meeting.rows[n] ?? []).map(c => td(c.label))))))) : [];
    const meetRules = T.meeting?.rules ? [h('div', { class: 'rtable-key' }, ...Object.entries(T.meeting.rules).map(([k, v]) => h('p', {}, h('b', {}, k + ': '), v)))] : [];
    const search = T.peer && T.locate && T.loot ? part('Search table', 'Peer shows hidden paths and enemies, Locate finds secret passages and sites, Loot takes a treasure.',
        wrapT('', h('thead', {}, h('tr', {}, th('Roll'), th('Peer'), th('Locate'), th('Loot'))), h('tbody', {}, ...six.map(n => h('tr', {}, td(String(n), 'roll'), td(words(T.peer[n])), td(words(T.locate[n])), td(`Take the ${ORD[T.loot[n]?.takeNth ?? n]} treasure`)))))) : [];
    const missile = T.missile ? part('Missile table', `Roll: ${T.missile.dice}. ${T.missile.note}`,
        wrapT('', h('thead', {}, h('tr', {}, th('Roll'), th('Harm of the hit'))), h('tbody', {}, ...six.map(n => h('tr', {}, td(String(n), 'roll'), td(LEVEL[T.missile.rows[n]?.levelShift] ?? String(T.missile.rows[n]?.levelShift))))))) : [];
    const pit = T.powerOfThePit ? part('Power of the Pit', null,
        wrapT('', h('thead', {}, h('tr', {}, th('Roll'), th('Result'), th('What happens'))), h('tbody', {}, ...six.map(n => h('tr', {}, td(String(n), 'roll'), td(T.powerOfThePit.rows[n]?.name ?? '', 'rname'), td(T.powerOfThePit.rows[n]?.effect ?? '')))))) : [];
    return modal(G, 'Tables', h('div', { class: 'tables', 'data-native-tables': '' }, ...meet, ...meetRules, ...search, ...missile, ...pit), { close: () => { G.ui.sheet = null; render(G); } });
};

export const cardSheet = G => modal(G, ownSheet(G.st, G.data).name, h('div', {}, G.data.art?.cards?.[ownSheet(G.st, G.data).id] ? h('img', { class: 'cardpic', src: G.data.art.cards[ownSheet(G.st, G.data).id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { G.ui.sheet = 'char'; render(G); } });

export const abandonSheet = G => modal(G, `Abandon ${thisGame(G.rec?.params)}?`, h('div', { class: 'confirmbox' },
    h('p', {}, `${G.st.ch?.name ?? 'Your hero'} is on day ${gameOf(G.st, G.data).day}${timed(gameOf(G.st, G.data)) ? ` of ${gameOf(G.st, G.data).lastDay ?? 28}` : ''}, with ${G.st.ch?.gold ?? 0} gold, ${G.st.ch?.fame ?? 0} Fame and ${G.st.ch?.notoriety ?? 0} Notoriety.`),
    h('p', { class: 'hint bad' }, `Abandoning ends ${thisGame(G.rec?.params)} for good. It stays in History as abandoned, but it cannot be picked up again.`)),
    { close: () => { G.ui.sheet = null; render(G); }, bare: true, footer: h('div', { class: 'ds-opt-foot' },
        h('button', { type: 'button', class: 'ds-btn danger', 'data-act': 'confirm-abandon', onclick: () => abandon(G) }, `Abandon ${thisGame(G.rec?.params)}`),
        h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'keep-playing', onclick: () => { G.ui.sheet = null; render(G); } }, 'Keep playing')) });

// Ending his own adventure (rules 8.9.4, 9.2.2a): the engine's `suicide` action, offered where the day ends for him (the evening-end question) and at the Birdsong plan. It is NOT Abandon: the game
// goes on and a new character arrives after a day sat out. Two taps: the menu row (or the evening sheet's quiet link) opens this sheet, and only its red button sends the action. The safe choice is
// the primary on the right, the red one is quiet on the left. Local solo games only: the shared and race tables have their own ways to leave.
export const suicideSheet = G => {
    const me = ownSheet(G.st, G.data), at = me.at ?? me.onRoad?.from, evening = questionOf(G.st, G.data)?.type === 'evening-end', where = at ? nameOfClearing(at).replace(/ (\d+)$/, '\u00A0$1') : 'where you stand';
    const sit = evening ? 'Tomorrow is sat out. A new character arrives the day after.' : 'Today is sat out. A new character arrives tomorrow.';
    return modal(G, 'End your adventure?', h('div', { class: 'confirmbox', 'data-suicide': '' },
        h('p', {}, `${me.name ?? 'Your hero'} leaves the Realm for good. The game goes on for a new character.`),
        h('ul', { class: 'confirm-lost' },
            h('li', {}, `Your belongings are left behind in ${where}.`),
            h('li', {}, 'Your Fame, Notoriety and Gold are lost: this adventure scores \u2212100.'),
            h('li', {}, sit)),
        h('p', { class: 'hint bad' }, 'This cannot be undone.')),
        { close: () => { G.ui.sheet = null; render(G); }, bare: true, footer: h('div', { class: 'ds-opt-foot' },
            h('button', { type: 'button', class: 'ds-btn danger', 'data-act': 'confirm-suicide', onclick: () => { G.ui.sheet = null; G.ui.leaveAsk = null; act(G, { type: 'suicide' }); } }, 'End my adventure'),
            h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'keep-playing', onclick: () => { G.ui.sheet = null; render(G); } }, 'Keep playing')) });
};

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
        case 'confirm-suicide': return suicideOk(G) ? suicideSheet(G) : null;
        default: return null;
    }
}
