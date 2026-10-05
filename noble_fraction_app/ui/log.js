import { h } from './dom.js';
import { groupLog } from './labels.js';

// The turn log: every move of every turn, newest at the top. Teal is you, orange is the Rival.
export function logSheet(ctx) {
    const turns = groupLog(ctx.s.log);
    return h('div', { class: 'sheet log', 'data-sheet': 'log' },
        h('div', { class: 'help-head' }, h('h2', {}, 'Turn log'),
            h('button', { class: 'btn primary', 'data-close': '', onclick: () => ctx.setUi({ log: false }) }, 'Close')),
        h('div', { class: 'log-body' }, turns.length ? turns.map(t => h('section', { class: `log-turn by-${t.by}`, 'data-turn-no': t.turnNo },
            h('h3', {}, `Turn ${t.turnNo} · ${t.by === 0 ? 'You' : 'Rival'}`),
            h('ul', {}, t.lines.map(l => h('li', {}, l))))) : h('p', { class: 'empty' }, 'Nothing has happened yet.')));
}
