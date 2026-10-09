import { h } from './dom.js';
import { LEVELS } from '../bot/levels.js';

// Starting over while a game is in progress needs a second, deliberate tap.
export function confirmNewSheet(ctx) {
    const saved = ctx.controller.savedGame();
    const label = LEVELS.find(l => l.id === saved?.level)?.label ?? '';
    return h('div', { class: 'sheet confirm', 'data-sheet': 'confirm' },
        h('h2', {}, 'Abandon this game?'),
        h('p', {}, `Your game in progress (Turn ${saved?.turn ?? '?'} · ${label}${saved?.mode === 'overtime' ? ' · Overtime' : ''}) will be lost if you start a new one.`),
        h('div', { class: 'confirm-actions' },
            h('button', { class: 'btn primary', 'data-close': '', 'data-keep': '', onclick: () => ctx.setUi({ confirmNew: false }) }, 'Keep my game'),
            h('button', { class: 'btn danger', 'data-confirm-new': '', onclick: () => { ctx.ui.confirmNew = false; ctx.newGame(ctx.ui.level, ctx.ui.mode); } }, 'Start a new game')));
}

// On a player's LAST turn (the other side already ended the game) a Night Shift cannot BUY, so it is almost never what they meant: ask first.
export const isFinalTurn = s => s.turn.phase !== 'over' && s.endgame?.triggeredBy != null && s.endgame.triggeredBy !== s.turn.active;

export function confirmNightSheet(ctx) {
    const normal = ctx.legal.find(a => a.type === 'beginTurn' && !a.overtime);
    const night = ctx.ui.confirmNight;
    return h('div', { class: 'sheet confirm', 'data-sheet': 'confirm-night' },
        h('h2', {}, 'This is your final turn'),
        h('p', {}, 'A Night Shift has no BUY (and no INTAKE or PURGE), so you could not take or finish a Contract by buying. You can still install cards from your hand. Start the Night Shift anyway?'),
        h('div', { class: 'confirm-actions' },
            h('button', { class: 'btn primary', 'data-close': '', 'data-keep': '', 'data-normal-instead': '', onclick: () => { ctx.ui.confirmNight = null; if (normal) ctx.act(normal); else ctx.setUi({ confirmNight: null }); } }, 'Play a normal turn'),
            h('button', { class: 'btn danger', 'data-night-anyway': '', onclick: () => { ctx.ui.confirmNight = null; ctx.act(night); } }, 'Night Shift anyway')));
}
