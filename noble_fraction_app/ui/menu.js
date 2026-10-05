import { h } from './dom.js';
import { LEVELS } from '../bot/levels.js';

// "New game" in three strengths of Rival; the current one is marked.
export function newGameButtons(ctx) {
    const current = ctx.controller.level();
    return h('div', { class: 'levels' }, h('span', { class: 'dim' }, 'New game vs the Rival:'),
        LEVELS.map(l => h('button', { class: `btn ${l.id === current ? 'current' : ''}`, 'data-new': l.id, onclick: () => ctx.newGame(l.id) }, l.label)));
}

export function menuSheet(ctx) {
    return h('div', { class: 'sheet menu', 'data-sheet': 'menu' },
        h('h2', {}, 'Noble Fraction'),
        h('button', { class: 'btn primary', 'data-close': '', onclick: () => ctx.setUi({ menu: false }) }, 'Resume'),
        newGameButtons(ctx));
}
