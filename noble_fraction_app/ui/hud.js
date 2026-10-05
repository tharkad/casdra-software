import { h } from './dom.js';
import { HUMAN, RIVAL } from './controller.js';
import { LEVELS } from '../bot/levels.js';

const HINTS = {
    start: 'Normal turn or Night Shift?', distill: 'DISTILL — remove an element, play upgrades', airwipe: 'INTAKE or PURGE a line',
    buybid: 'BUY or BID — tap a card', overtimeBid: 'Night Shift — BID', cleanup: 'Discard what you like, then finish',
};

export function hud(ctx) {
    const { s, controller, ui } = ctx;
    const over = s.turn.phase === 'over';
    const side = (pid, label) => {
        const p = s.players[pid];
        return h('div', { class: `side side-${pid}`, 'data-side': pid },
            h('b', {}, label), h('span', { class: 'vp' }, `${controller.score(pid).total} VP`), h('span', { class: 'cash' }, `$${p.money}`));
    };
    const free = s.turn.f.freeBids > 0 && s.turn.phase === 'distill';
    return h('header', { id: 'hud' },
        side(HUMAN, 'You'), side(RIVAL, 'Rival'),
        h('div', { class: 'hint', 'data-hint': '' }, over ? 'Game over' : free ? 'Place a free Bid Token on a card' : HINTS[s.turn.phase]),
        h('span', { class: 'turnno', 'data-turn': '' }, `Turn ${s.turn.number} · ${LEVELS.find(l => l.id === controller.level())?.label ?? ''}`),
        controller.recap() ? h('button', { class: 'btn small', 'data-open': 'recap' }, 'Rival turn') : null,
        h('button', { class: 'btn small', 'data-open': 'help', 'aria-label': 'Rules', onclick: () => ctx.setUi({ help: true }) }, '?'),
        h('button', { class: 'btn small', 'data-open': 'menu', 'aria-label': 'Menu', onclick: () => ctx.setUi({ menu: !ui.menu }) }, '☰'));
}
