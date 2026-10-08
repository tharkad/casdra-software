import { h } from './dom.js';
import { LEVELS } from '../bot/levels.js';
import { SPEEDS } from './fx.js';

// "New game" in three strengths of Rival; the current one is marked.
export function newGameButtons(ctx) {
    const current = ctx.controller.level();
    return h('div', { class: 'levels' }, h('span', { class: 'dim' }, 'New game vs the Rival:'),
        LEVELS.map(l => h('button', { class: `btn ${l.id === current ? 'current' : ''}`, 'data-new': l.id, onclick: () => ctx.newGame(l.id) }, l.label)));
}

const SPEED_LABELS = { normal: 'Normal', fast: 'Fast', off: 'Off' };

export function menuSheet(ctx) {
    return h('div', { class: 'sheet menu', 'data-sheet': 'menu' },
        h('h2', {}, 'Noble Fraction'),
        h('button', { class: 'btn primary', 'data-close': '', onclick: () => ctx.setUi({ menu: false }) }, 'Resume'),
        h('div', { class: 'levels' }, h('span', { class: 'dim' }, 'Animations:'),
            Object.keys(SPEEDS).reverse().map(k => h('button', { class: `btn ${ctx.fxMode === k ? 'current' : ''}`, 'data-fx': k, onclick: () => ctx.setFx(k) }, SPEED_LABELS[k]))),
        h('div', { class: 'levels' }, h('span', { class: 'dim' }, 'Card dragging:'),
            [['on', true], ['off', false]].map(([k, v]) => h('button', { class: `btn ${(ctx.ui.drag !== false) === v ? 'current' : ''}`, 'data-drag': k, onclick: () => ctx.setDrag(v) }, k === 'on' ? 'On' : 'Off'))),
        // One deliberate step away from the game: the start screen, where Continue is waiting.
        h('button', { class: 'btn', 'data-menu-new': '', onclick: () => ctx.mainMenu() }, 'New game'));
}
