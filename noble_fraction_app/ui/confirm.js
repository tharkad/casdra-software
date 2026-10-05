import { h } from './dom.js';
import { LEVELS } from '../bot/levels.js';

// Starting over while a game is in progress needs a second, deliberate tap.
export function confirmNewSheet(ctx) {
    const saved = ctx.controller.savedGame();
    const label = LEVELS.find(l => l.id === saved?.level)?.label ?? '';
    return h('div', { class: 'sheet confirm', 'data-sheet': 'confirm' },
        h('h2', {}, 'Abandon this game?'),
        h('p', {}, `Your game in progress (Turn ${saved?.turn ?? '?'} · ${label}) will be lost if you start a new one.`),
        h('div', { class: 'confirm-actions' },
            h('button', { class: 'btn primary', 'data-close': '', 'data-keep': '', onclick: () => ctx.setUi({ confirmNew: false }) }, 'Keep my game'),
            h('button', { class: 'btn danger', 'data-confirm-new': '', onclick: () => { ctx.ui.confirmNew = false; ctx.newGame(ctx.ui.level); } }, 'Start a new game')));
}
