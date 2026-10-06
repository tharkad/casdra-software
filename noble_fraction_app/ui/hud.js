import { h } from './dom.js';
import { HUMAN, RIVAL } from './controller.js';
import { LEVELS } from '../bot/levels.js';

// Two tiny icons for the score boxes: a signed contract (clipboard with a tick) and an industrial machine (gear).
const ICONS = {
    contract: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4h6v3H9z" class="f"/><path d="M8.5 13.5l2.5 2.5 4.5-5"/>',
    machine: '<circle cx="12" cy="12" r="3.3"/><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2M5.3 5.3l2.3 2.3M16.4 16.4l2.3 2.3M18.7 5.3l-2.3 2.3M7.6 16.4l-2.3 2.3"/><circle cx="12" cy="12" r="6.6"/>',
};
const stat = (kind, n, title) => {
    const el = h('span', { class: `stat stat-${kind}`, title, 'data-stat-kind': kind, 'aria-label': `${n} ${title}` });
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind]}</svg><b>${n}</b>`;
    return el;
};

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
            h('b', {}, label), h('span', { class: 'vp' }, `${controller.score(pid).total} VP`), h('span', { class: 'cash' }, `$${p.money}`),
            stat('contract', p.completed.length, 'completed contracts'), stat('machine', p.installed.length, 'installed upgrades'));
    };
    const free = s.turn.f.freeBids > 0 && s.turn.phase === 'distill';
    return h('header', { id: 'hud' },
        side(HUMAN, 'You'), side(RIVAL, 'Rival'),
        h('div', { class: 'hint', 'data-hint': '' }, over ? 'Game over' : free ? 'Place a free Bid Token on a card'
            : s.turn.phase === 'overtimeBid' ? `Night Shift — BID ${3 - s.turn.f.stepsLeft} of 2` : HINTS[s.turn.phase]),
        h('span', { class: 'turnno', 'data-turn': '' }, `Turn ${s.turn.number} · ${LEVELS.find(l => l.id === controller.level())?.label ?? ''}`),
        h('button', { class: 'btn small', 'data-open': 'log', onclick: () => ctx.setUi({ log: true }) }, 'Log'),
        h('button', { class: 'btn small', 'data-open': 'stats', onclick: () => ctx.setUi({ stats: true }) }, 'Stats'),
        h('button', { class: 'btn small', 'data-open': 'help', 'aria-label': 'Rules', onclick: () => ctx.setUi({ help: true }) }, '?'),
        h('button', { class: 'btn small', 'data-open': 'menu', 'aria-label': 'Menu', onclick: () => ctx.setUi({ menu: !ui.menu }) }, '☰'));
}
