import { h } from './dom.js';
import { summarizeEvents } from './labels.js';

export function recapSheet(ctx) {
    const lines = summarizeEvents(ctx.controller.recap().events);
    return h('div', { class: 'sheet recap', 'data-sheet': 'recap' },
        h('h2', {}, "Rival's turn"),
        h('ol', {}, lines.length ? lines.map(l => h('li', {}, l)) : h('li', {}, 'The Rival passed.')),
        h('button', { class: 'btn primary', 'data-close': '', onclick: () => ctx.setUi({ recapSeen: ctx.controller.recap().turnNo }) }, 'Your turn'));
}
