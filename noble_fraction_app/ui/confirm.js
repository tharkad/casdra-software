import { h } from './dom.js';
import { LEVELS } from '../bot/levels.js';
import { CARD_DEFS } from '../data/cards.js';
import { apply } from '../engine/index.js';
import { findCard } from './find.js';

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

// Ending the BUY/BID step is the last moment an Upgrade can be used this turn. Two kinds are worth a warning because forgetting them loses
// something real: Cold Turbine (it adds a Kr and an Xe to your discard pile, once a turn, for free) and Packed Tower when it can finish your
// Contract with one less Xe right now. (Return Loop, Sampling Port and the like are optional touches and would nag every turn.)
export const WORTH_A_WARNING = new Set(['addKrXe', 'lessXe']);

// The names of the cards that could still be used if this action (an endStep) were not taken, or [] when it does not end the turn's plays.
export function unusedUses(s, legal, action) {
    if (action.type !== 'endStep') return [];
    let next;
    try { next = apply(s, action); } catch { return []; }
    if (next.turn.phase !== 'cleanup') return [];                         // only the step that moves on to END is the last chance
    const names = new Map();
    legal.forEach(a => {
        if (a.type !== 'useInstalled' && a.type !== 'play') return;
        const def = CARD_DEFS[findCard(s, a.uid)?.card.defId];
        if (def && WORTH_A_WARNING.has(def.ability)) names.set(a.uid, def.name);
    });
    return [...new Set(names.values())];
}

export function confirmUnusedSheet(ctx) {
    const { action, names } = ctx.ui.confirmUnused;
    const off = ctx.ui.dontWarnAgain === true;
    const close = () => { ctx.ui.confirmUnused = null; if (ctx.ui.dontWarnAgain) ctx.setWarnUnused(false); ctx.ui.dontWarnAgain = false; };
    return h('div', { class: 'sheet confirm', 'data-sheet': 'confirm-unused' },
        h('h2', {}, 'You can still use a card'),
        h('p', {}, `${names.join(' and ')} can still be used this turn. Ending the turn now skips it.`),
        h('button', { class: 'btn', role: 'checkbox', 'aria-checked': String(off), 'data-dont-warn': '', onclick: () => ctx.setUi({ dontWarnAgain: !off }) },
            h('span', { class: 'check' }, off ? '☑' : '☐'), " Don't warn me again"),
        h('div', { class: 'confirm-actions' },
            h('button', { class: 'btn primary', 'data-close': '', 'data-keep': '', 'data-go-back': '', onclick: () => { close(); ctx.setUi({}); } }, 'Go back'),
            h('button', { class: 'btn danger', 'data-end-anyway': '', onclick: () => { close(); ctx.act(action); } }, 'End turn anyway')));
}
