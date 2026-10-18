// The pieces of the game screen that exist only at a SHARED table: the players strip, the "who are we waiting for" banner, the draw of the chits, the roster of a clearing.
// Builders only: game.js owns the state and passes in what each needs (people from party.js, the view, callbacks).
import { h, sv } from './dom.js';
import { shapeEl, statusLine, tagText, waitingText, joinNames } from './party.js';
import { nameOfClearing } from '../engine/world.js';
import { logText } from './voice.js';

/** A counter as a small inline SVG: the same shape, colour and letter as on the map. `hollow` for a hidden character (R-1), a cross for a fallen one. */
export function counterIcon(p, size = 22) {
    const r = size * 0.36, sh = shapeEl(p.shape, r), hid = p.hidden || p.dead;
    const body = sv(sh.tag, { ...sh.attrs, fill: hid ? 'rgba(12,14,20,.55)' : p.color, stroke: p.dead ? '#8b8f9a' : p.color, 'stroke-width': p.hidden ? 1.6 : 1.1, 'stroke-dasharray': p.hidden ? '2.2 2' : null });
    return sv('svg', { class: `counter${p.mine ? ' me' : ''}${p.hidden ? ' hid' : ''}`, viewBox: `${-size / 2} ${-size / 2} ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true' },
        p.mine ? sv('circle', { r: r + 2.4, fill: 'none', stroke: '#fff', 'stroke-width': 1.4, opacity: .9 }) : null,
        body, sv('text', { 'text-anchor': 'middle', dy: '.36em', 'font-size': r * 1.3, 'font-weight': 800, 'font-family': 'var(--font-display)', fill: hid ? p.color : '#14161e' }, p.dead ? '×' : p.letter));
}

/** The players strip: one chip per player, the thumb-zone answer to "who is doing what". Each chip: counter, name, status, and the turn number once the chits are drawn.
 * The one the game is waiting on is lit; a player who is away shows a dim dot and the word "away". Tap a chip to see that player on the map. */
export function playersStrip(people, { onTap, waitingIds = new Set(), meetIds = new Set() } = {}) {
    return h('div', { class: `pstrip n${people.length}`, role: 'list', 'aria-label': 'Players', 'data-strip': '' },
        ...people.map(p => h('button', { class: `pchip ${p.status}${p.mine ? ' me' : ''}${waitingIds.has(p.id) ? ' lit' : ''}${p.away ? ' away' : ''}${p.autopilot ? ' autopilot' : ''}${p.left ? ' left' : ''}${meetIds.has(p.id) ? ' meet' : ''}`, role: 'listitem', 'data-player': p.player, 'data-status': p.left ? 'left' : p.autopilot ? 'autopilot' : p.away ? 'away' : p.status, 'data-char': p.id, 'data-meetable': meetIds.has(p.id) ? '1' : null,
            'aria-label': `${p.player}${p.mine ? ' (you)' : ''}, ${p.character}: ${statusLine(p)}${p.turnNo ? `, turn ${p.turnNo}` : ''}${meetIds.has(p.id) ? '. Tap to meet' : ''}`, onclick: () => onTap?.(p) },
            h('span', { class: 'pc-ico' }, counterIcon(p, 26), p.turnNo ? h('i', { class: 'pc-no', 'aria-hidden': 'true' }, String(p.turnNo)) : null),
            h('span', { class: 'pc-txt' }, h('b', {}, p.mine ? `${p.player}` : p.player), h('small', {}, p.mine && p.status === 'playing' ? 'your turn' : statusLine(p))),
            meetIds.has(p.id) ? h('i', { class: 'pc-meet', 'aria-hidden': 'true' }, '\u21C4') : null,
            h('i', { class: `pdot${p.present ? ' on' : ''}`, 'aria-label': p.present ? 'here now' : 'away' }))));
}

/** The banner a player sees instead of the phase buttons when it is not his move. Situation first, then why, then (for a turn in progress) the public lines streaming in. */
export function waitBanner(sit, { feed = [], orderLine = null, onSeeMap = null } = {}) {
    const lines = feed.slice(-4);
    return h('div', { class: `waitcard ${sit.kind}`, role: 'status', 'data-wait': sit.kind },
        h('div', { class: 'wc-head' },
            sit.active ? counterIcon(sit.active, 30) : sit.me ? counterIcon(sit.me, 30) : null,
            h('div', { class: 'wc-main' }, h('b', { class: 'wc-title' }, sit.title), sit.text ? h('p', { class: 'wc-text' }, sit.text) : null)),
        sit.why ? h('p', { class: 'wc-why' }, sit.why) : null,
        lines.length ? h('div', { class: 'wc-feed', 'aria-live': 'polite' }, ...lines.map((l, i) => h('p', { class: i === lines.length - 1 ? 'new' : '' }, l.s ?? l.t))) : null,
        orderLine ? h('p', { class: 'wc-order', 'data-order': '' }, orderLine) : null);
}

/** The card for the draw of the chits (7.1.1). `step` chits are face up; each flips in turn. Result first: the dawn and the Monster Roll, then the order. */
export function drawCard({ view, draw, people, step, finished, fresh, dawn, prowling, onSkip, onDone }) {
    const byId = new Map(people.map(p => [p.id, p]));
    const rows = draw.order.map((id, k) => {
        const p = byId.get(id), up = k < step, flipping = fresh && k === step - 1;
        return h('li', { class: `chit${up ? ' up' : ''}${flipping ? ' flip' : ''}${p?.mine ? ' me' : ''}`, 'data-turn': k + 1, 'data-up': up ? '1' : '0' },
            h('span', { class: 'chit-card' },
                h('span', { class: 'chit-back', 'aria-hidden': 'true' }, h('b', {}, '✦')),
                h('span', { class: 'chit-face' }, p ? counterIcon(p, 30) : null)),
            h('span', { class: 'chit-who' }, up ? h('b', {}, p?.player ?? '?') : h('b', { class: 'dim' }, 'drawing…'), up ? h('small', {}, p ? p.character + (p.mine ? ' · you' : '') : '') : h('small', {}, ' ')),
            h('span', { class: 'chit-no' }, up ? String(k + 1) : ''));
    });
    const mine = people.find(p => p.mine), mineNo = mine ? draw.order.indexOf(mine.id) + 1 : 0;
    return h('div', { class: 'drawcard', 'data-draw': String(view.day) },
        h('div', { class: 'phase-result good', role: 'status' },
            h('div', { class: 'pr-head' }, h('small', {}, `Dawn of day ${view.day}`)),
            h('p', { class: 'pr-line' }, dawn ?? `Day ${view.day} dawns.`),
            prowling ? h('p', { class: 'pr-sub' }, prowling) : null),
        h('h3', { class: 'draw-h' }, 'The chits are drawn'),
        h('ol', { class: 'chits' }, ...rows),
        finished ? h('div', { class: 'draw-done', 'data-draw-done': '' },
            h('p', { class: 'draw-order' }, `Turn order today: ${draw.order.map((id, k) => `${k + 1} ${byId.get(id)?.player ?? '?'}`).join(', ')}.`),
            h('p', { class: 'hint' }, mineNo === 1 ? 'Your chit came first: you play now.' : mineNo ? `You play ${['', '', 'second', 'third', 'fourth'][mineNo]}. Everyone plays a whole turn in this order, and the evenings follow it too.` : '')) : null,
        h('div', { class: 'row-end' }, h('button', { class: 'btn primary', 'data-act': finished ? 'draw-ok' : 'draw-skip', onclick: finished ? onDone : onSkip }, finished ? 'To the day' : 'Skip')));
}

/** The "who is here" section of a clearing sheet: every character standing there, public by R-1 (hidden ones are shown as such). */
export function rosterRows(people, clearing, row) {
    const here = people.filter(p => p.at === clearing && !p.onRoad && !p.flying);
    return here.map(p => row('pc', `${p.player}${p.mine ? ' (you)' : ''}`, `${p.character} · ${p.dead ? 'fallen' : p.hidden ? 'hidden: cannot be blocked' : 'in plain sight'}${p.status === 'playing' ? ' · taking their turn' : ''}${p.followsPlayer ? ` · following ${p.followsPlayer}` : ''}${p.hires ? ` · ${p.hires} hireling${p.hires === 1 ? '' : 's'}` : ''}`, counterIcon(p, 28)));
}

/** The players sheet: everyone, where, how they stand, who the game waits for. */
export function playersBody(people, { view, answer, orderLine, copyInvite, rowExtra = null, foot = null }) {
    return h('div', { class: 'racelist playerslist' },
        orderLine ? h('p', { class: 'draw-order' }, orderLine + '.') : null,
        answer?.paused ? h('p', { class: 'hint bad', role: 'status' }, 'The game is paused: the player it is waiting for is not here. Nothing is skipped; it goes on where it was when they come back.') : null,
        ...people.map(p => h('div', { class: `raceplayer${p.mine ? ' me' : ''}`, 'data-char': p.id },
            counterIcon(p, 30),
            h('span', { class: 'rp-main' }, h('b', {}, `${p.player}${p.mine ? ' (you)' : ''}`),
                h('small', {}, `${p.character} · ${p.dead ? 'fallen' : statusLine(p)}${p.turnNo ? ` · turn ${p.turnNo}` : ''}`),
                h('small', {}, p.onRoad ? 'on the road' : p.flying ? 'in the air' : p.at ? `at ${nameOfClearing(p.at)}${p.hidden ? ' · hidden' : ''}` : ''),
                p.hires ? h('small', { 'data-hires': String(p.hires) }, `${p.hires} hireling${p.hires === 1 ? '' : 's'}, theirs alone`) : null,
                rowExtra?.(p) ?? null),
            h('span', { class: 'rp-nums' }, `Fame ${p.fame}`, h('br'), `Notoriety ${p.notoriety}`),
            h('i', { class: `pdot${p.present ? ' on' : ''}`, 'aria-label': p.present ? 'here now' : 'away' }))),
        copyInvite ? h('div', {}, h('button', { class: 'btn', 'data-act': 'copy-invite', onclick: copyInvite }, 'Copy invite link')) : null,
        foot);
}

export { waitingText, joinNames, tagText, logText };
