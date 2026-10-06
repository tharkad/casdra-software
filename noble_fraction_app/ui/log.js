import { h } from './dom.js';
import { groupLog } from './labels.js';
import { buildLogExport, deliverExport } from './exportlog.js';

// The turn log: every move of every turn; the newest turn is at the top, each turn reads in play order. Teal is you, orange is the Rival.
export function logSheet(ctx) {
    const turns = groupLog(ctx.s.log, ctx.controller.extra().ach ?? []);
    return h('div', { class: 'sheet log', 'data-sheet': 'log' },
        h('div', { class: 'help-head' }, h('h2', {}, 'Turn log'),
            h('span', { class: 'head-btns' },
                h('button', { class: 'btn', 'data-export-log': '', onclick: async e => {
                    const how = await deliverExport(buildLogExport({ state: ctx.s, level: ctx.controller.level(), achievements: ctx.controller.extra().ach ?? [], when: new Date().toISOString() }));
                    const btn = e.target; btn.textContent = how === 'download' ? 'Saved ✓' : how === 'copy' ? 'Copied ✓' : 'Shared ✓';
                    setTimeout(() => { btn.textContent = 'Export'; }, 1800);
                } }, 'Export'),
                h('button', { class: 'btn primary', 'data-close': '', onclick: () => ctx.setUi({ log: false }) }, 'Close'))),
        h('div', { class: 'log-body' }, turns.length ? turns.map(t => h('section', { class: `log-turn by-${t.by}`, 'data-turn-no': t.turnNo },
            h('h3', {}, `Turn ${t.turnNo} · ${t.by === 0 ? 'You' : 'Rival'}`),
            h('ul', {}, t.lines.map(l => h('li', { class: l.startsWith('🏆') ? 'ach-line' : '' }, l))))) : h('p', { class: 'empty' }, 'Nothing has happened yet.')));
}
