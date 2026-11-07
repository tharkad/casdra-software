// play/sheet_settings.js: the Menu's Settings look (note 108): what this game was begun with (its length, goals, optional rules, missions, realm), readable at any time, in a fight too, each row marked FIXED because the
// engine cannot change them once the game has begun; and, below, the controls that can change at any time (how the game reads: Story or Detail, text size, top margin, calm motion, the note button), working as on the
// title screen's Settings. The values come from the view (gamesettings.js); nothing here reads the game or decides a rule. It is a look: no scrim, putting it away gives the screen back as it was (looks.js).
import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { ask, sect } from '../../ds.js';
import { gameSettingRows } from '../../gamesettings.js';
import { OPTION_GROUPS } from '../../options_list.js';
import { HIRELING_GROUP } from '../../leaders.js';
import { viewOf } from '../../combat/feed.js';
import { readingFields } from '../info.js';
import { modal, showToast } from './kit.js';
import { render } from './shell.js';
import { thisGame } from '../../modes.js';

const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const FIXED = 'This was chosen when the game began. It stays as it is until the game is over.';
const GROUPS = [...OPTION_GROUPS, HIRELING_GROUP];

export function settingsSheet(G) {
    const rows = gameSettingRows(viewOf(G.st, G.data), { groups: GROUPS, params: G.rec?.params ?? null });
    const row = r => h('button', { type: 'button', class: 'ds-row set-fixed', 'data-locked': r.id, 'data-value': r.value, 'aria-label': `${r.title}: ${r.value}. Fixed for this game.`, onclick: () => showToast(G, FIXED) },
        h('span', { class: 'main' }, h('b', {}, r.title), h('span', {}, r.line)),
        h('span', { class: 'end set-val' }, h('i', { class: `ds-tag${r.value === 'On' ? ' gold' : ''}` }, r.value), icon('lock', 'set-lock')));
    // the rows come in the order of the New Game screen: how long and what for, then the optional rules by their groups, missions, the table, the realm
    const sections = [];
    for (const r of rows) {
        const title = r.group ?? 'This game';
        const last = sections.at(-1);
        if (last && last.title === title) last.rows.push(r); else sections.push({ title, rows: [r] });
    }
    const body = h('div', { class: 'kit set-sheet' },
        ask(`${cap(thisGame(G.rec?.params))}’s settings.`, 'What you chose when it began is fixed now. How the game reads on your phone can change at any time.'),
        h('div', { class: 'set-block', 'data-settings': 'game' },
            h('div', { class: 'ds-sect set-head' }, h('span', { class: 'ds-eyebrow' }, 'Fixed for this game'), h('small', {}, icon('lock', 'set-lock'), 'cannot change now')),
            ...sections.flatMap(s => [s.title === 'This game' ? null : h('p', { class: 'ds-meta set-group' }, s.title), h('div', { class: 'ds-list' }, s.rows.map(row))])),
        h('div', { class: 'set-block', 'data-settings': 'device' },
            sect('You can change these now'),
            ...readingFields(() => render(G))));
    return modal(G, 'Settings', body, { close: () => { G.ui.sheet = 'menu'; render(G); } });
}
