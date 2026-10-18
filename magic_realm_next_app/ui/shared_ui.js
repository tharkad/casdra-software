// The pieces of the game screen that exist only at a SHARED table: the players strip, the "who are we waiting for" card, the draw of the chits, the roster of a clearing.
// Builders only: game.js owns the state and passes in what each needs (people from party.js, the view, callbacks). Markup is the design system's (css/ds-shared.css, mockup 07):
// `.ds-pchip` chips, `.ds-wait` card, `.ds-draw` tiles. The legacy class names (`pchip`, `waitcard`, `chit`, ...) stay on the new elements as test hooks.
import { h, sv } from './dom.js';
import { ask, btn, primary } from './ds.js';
import { icon } from './icons.js';
import { shapeEl, statusLine, tagText, waitingText, joinNames } from './party.js';
import { nameOfClearing } from '../engine/world.js';
import { isStory, logText } from './voice.js';

/** What a character gained, as a tag in the score's colour: icon, number and the word ("+7 Notoriety", "+12 gold"): never colour alone. */
const GAIN_WORD = { fame: 'Fame', notor: 'Notoriety', gold: 'gold' }, GAIN_ICON = { fame: 'star', notor: 'flame', gold: 'coin' };
export const gainChip = (kind, n, plus = true) => h('span', { class: `ds-tag sf-chip gain-chip ${kind} ${kind === 'notor' ? 'notoriety' : kind}` }, icon(GAIN_ICON[kind]), `${plus ? '+' : ''}${n} ${GAIN_WORD[kind]}`);

/** The design system's ask (one situation line, one why), with the legacy `data-ask` hook the phone tests read. */
export function askBox(situation, why = '') { const e = ask(situation, why); e.dataset.ask = ''; return e; }

const SHAPE_CLS = { square: 'sq', diamond: 'di', triangle: 'tri' };

/** A player's counter as a small HTML badge: the same colour, shape and letter as on the map (`--pc` is the seat colour). A fallen character is a cross. */
export function pcEl(p, { size = 26, cls = '' } = {}) {
    const shape = SHAPE_CLS[p?.shape] ?? '';
    return h('span', { class: `ds-pc${shape ? ` ${shape}` : ''}${p?.dead ? ' dead' : ''}${cls ? ` ${cls}` : ''}`, 'aria-hidden': 'true',
        style: `--pc:${p?.color ?? '#8f8872'};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.54)}px${shape === 'tri' ? `;padding-top:${Math.round(size * 0.22)}px` : ''}` }, p?.dead ? '×' : (p?.letter ?? '?'));
}

/** A counter as a small inline SVG: the same shape, colour and letter as on the map. `hollow` for a hidden character (R-1), a cross for a fallen one. */
export function counterIcon(p, size = 22) {
    const r = size * 0.36, sh = shapeEl(p.shape, r), hid = p.hidden || p.dead;
    const body = sv(sh.tag, { ...sh.attrs, fill: hid ? 'rgba(12,14,20,.55)' : p.color, stroke: p.dead ? '#8b8f9a' : p.color, 'stroke-width': p.hidden ? 1.6 : 1.1, 'stroke-dasharray': p.hidden ? '2.2 2' : null });
    return sv('svg', { class: `counter${p.mine ? ' me' : ''}${p.hidden ? ' hid' : ''}`, viewBox: `${-size / 2} ${-size / 2} ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true' },
        p.mine ? sv('circle', { r: r + 2.4, fill: 'none', stroke: '#fff', 'stroke-width': 1.4, opacity: .9 }) : null,
        body, sv('text', { 'text-anchor': 'middle', dy: '.36em', 'font-size': r * 1.3, 'font-weight': 800, 'font-family': 'var(--font-display)', fill: hid ? p.color : '#14161e' }, p.dead ? '×' : p.letter));
}

/** The players strip: one chip per player (44+ tall; 3 or 4 fit at 360): colour, shape and letter, what he is doing in words, a presence dot, the turn number once the chits are drawn.
 * The one the game is waiting on is lit; a player who is away shows a grey dot and the word "away". Tap a chip to see that player on the map (or, if he can be met, to meet him). */
export function playersStrip(people, { onTap, waitingIds = new Set(), meetIds = new Set(), fight = false } = {}) {
    return h('div', { class: `ds-players pstrip n${people.length}`, role: 'list', 'aria-label': fight ? 'In the fight' : 'Players', 'data-strip': '' },
        ...people.map(p => {
            const word = p.mine && p.status === 'playing' && !p.fight ? 'your turn' : statusLine(p), lit = waitingIds.has(p.id) || p.status === 'playing';
            return h('button', { type: 'button', class: `ds-pchip pchip ${p.status}${p.mine ? ' me' : ''}${lit ? ' now lit' : ''}${p.away ? ' away' : ''}${p.autopilot ? ' autopilot' : ''}${p.left ? ' left' : ''}${p.dead ? ' dead' : ''}${meetIds.has(p.id) ? ' meet' : ''}`,
                role: 'listitem', 'data-player': p.player, 'data-status': p.left ? 'left' : p.autopilot ? 'autopilot' : p.away ? 'away' : p.status, 'data-char': p.id, 'data-meetable': meetIds.has(p.id) ? '1' : null,
                'aria-label': `${p.player}${p.mine ? ' (you)' : ''}, ${p.character}: ${statusLine(p)}${p.turnNo ? `, turn ${p.turnNo}` : ''}${meetIds.has(p.id) ? '. Tap to meet' : ''}`, onclick: () => onTap?.(p) },
                pcEl(p),
                h('span', { class: 't' }, h('span', { class: 'nm' }, h('b', {}, p.player), p.turnNo ? h('em', { class: 'turn', 'aria-hidden': 'true' }, String(p.turnNo)) : null), h('span', { class: 'st' }, word)),
                h('i', { class: `on pdot${p.present ? '' : ' away'}`, 'aria-label': p.present ? 'here now' : 'away' }));
        }));
}

/** What someone did in plain sight, one line, in the voice the player chose. `l` is { s?, t, id? }; `people` maps a character to the badge. */
const feedText = l => (isStory() ? (l.s ?? l.t) : l.t);
export function feedList(feed, people = []) {
    const byId = new Map(people.map(p => [p.id, p]));
    return h('ul', { class: 'ds-feed wc-feed', 'aria-live': 'polite', 'data-feed': '' }, ...feed.map((l, i) => {
        const p = l.id ? byId.get(l.id) : null;
        return h('li', { class: i === feed.length - 1 ? 'new' : '' }, p ? pcEl(p, { size: 22 }) : h('span', { class: 'ds-pc wild', 'aria-hidden': 'true' }, '·'), h('span', {}, feedText(l)));
    }));
}

/** The card a player sees instead of the phase buttons when it is not his move: what is going on and why he cannot act (one line each), then, for a turn in progress, the public lines streaming in.
 * No button: he cannot proceed, and the card says so. */
export function waitBanner(sit, { feed = [], orderLine = null } = {}) {
    const lines = feed.slice(-3);
    // "Planned." + "Waiting for Ann and Tom." read as one sentence; a longer title stands alone and the text goes under it
    const merge = sit.text && /^(Planned|Waiting|Watching)\.$/.test(sit.title);
    const title = merge ? `${sit.title} ${sit.text}` : sit.title, sub = [merge ? '' : sit.text, sit.why].filter(Boolean).join(' ');
    return h('div', { class: `waitcard ${sit.kind}`, role: 'status', 'data-wait': sit.kind },
        h('div', { class: 'ds-wait' }, h('span', { class: 'pulse', 'aria-hidden': 'true' }),
            h('div', { class: 'wc-main' }, h('b', { class: 'wc-title' }, title), sub ? h('div', { class: 'ds-meta wc-sub' }, sub) : null)),
        lines.length ? feedList(lines, sit.people) : null);
}

/** The draw of the chits (7.1.1): one tile per player turning over, one after the other (`step` are face up); each shows its number. Result first: the dawn in the story voice, then the order.
 * Returns { eyebrow, title, body, foot } for a result sheet; `onSkip` turns every tile at once, `onDone` closes the sheet. */
export function drawCard({ view, draw, people, step, finished, fresh, dawn, prowling, onSkip, onDone }) {
    const byId = new Map(people.map(p => [p.id, p]));
    const tiles = draw.order.map((id, k) => {
        const p = byId.get(id), up = k < step, flipping = fresh && k === step - 1;
        if (!up) return h('li', { class: 'tile chit back', 'data-turn': k + 1, 'data-up': '0' }, icon('hourglass', 'lg'), h('span', { class: 'chit-who' }, h('b', { class: 'dim' }, 'turning…'), h('small', {}, ' ')));
        return h('li', { class: `tile chit up${flipping ? ' flip' : ''}${p?.mine ? ' me' : ''}`, 'data-turn': k + 1, 'data-up': '1' },
            h('span', { class: 'no chit-no' }, String(k + 1)), p ? pcEl(p, { size: 34 }) : null,
            h('span', { class: 'chit-who' }, h('b', {}, p?.player ?? '?'), h('small', { class: 'ds-meta' }, p ? p.character + (p.mine ? ' · you' : '') : '')));
    });
    const mine = people.find(p => p.mine), mineNo = mine ? draw.order.indexOf(mine.id) + 1 : 0;
    const story = isStory();
    const lead = story ? [dawn ?? `Day ${view.day} dawns.`, prowling, 'Then the chits turn.'].filter(Boolean).join(' ') : [dawn ?? `Day ${view.day} dawns.`, prowling].filter(Boolean).join(' ');
    const body = h('div', { class: 'drawcard', 'data-draw': String(view.day) },
        h('p', { class: 'ds-voice lg draw-lead' }, lead),
        h('ol', { class: 'ds-draw chits' }, ...tiles),
        finished ? h('div', { class: 'draw-done', 'data-draw-done': '' },
            h('p', { class: 'ds-text draw-order' }, `Turn order today: ${draw.order.map((id, k) => `${k + 1} ${byId.get(id)?.player ?? '?'}`).join(', ')}.`),
            mineNo ? h('p', { class: 'ds-meta hint' }, mineNo === 1 ? 'Your chit came first: you play now.' : `You play ${['', '', 'second', 'third', 'fourth'][mineNo]}. Everyone plays a whole turn in this order, and the evenings follow it too.`) : null) : null);
    const foot = [finished ? null : btn('Skip', 'quiet', { 'data-act': 'draw-skip', onclick: onSkip }), primary('On to the day', { 'data-act': 'draw-ok', onclick: onDone })].filter(Boolean);
    return { eyebrow: `Day ${view.day} · dawn`, title: 'The chits are drawn', body, foot };
}

/** The "who is here" section of a clearing sheet: every character standing there, public by R-1 (hidden ones are shown as such). */
export function rosterRows(people, clearing, row) {
    const here = people.filter(p => p.at === clearing && !p.onRoad && !p.flying);
    return here.map(p => row('pc', `${p.player}${p.mine ? ' (you)' : ''}`, `${p.character} · ${p.dead ? 'fallen' : p.hidden ? 'hidden: cannot be blocked' : 'in plain sight'}${p.status === 'playing' ? ' · taking their turn' : ''}${p.followsPlayer ? ` · following ${p.followsPlayer}` : ''}${p.hires ? ` · ${p.hires} hireling${p.hires === 1 ? '' : 's'}` : ''}`, counterIcon(p, 28)));
}

/** The players sheet: everyone, where, how they stand, who the game waits for. */
export function playersBody(people, { view, answer, orderLine, copyInvite, rowExtra = null, foot = null }) {
    return h('div', { class: 'racelist playerslist ds-list' },
        orderLine ? h('p', { class: 'ds-meta draw-order' }, orderLine + '.') : null,
        answer?.paused ? h('p', { class: 'ds-hint-line bad', role: 'status' }, 'The game is paused: the player it is waiting for is not here. Nothing is skipped; it goes on where it was when they come back.') : null,
        ...people.map(p => h('div', { class: `ds-row raceplayer${p.mine ? ' me sel' : ''}`, 'data-char': p.id },
            pcEl(p, { size: 34 }),
            h('span', { class: 'main rp-main' }, h('b', {}, `${p.player}${p.mine ? ' (you)' : ''}`),
                h('span', {}, `${p.character} · ${p.dead ? 'fallen' : statusLine(p)}${p.turnNo ? ` · turn ${p.turnNo}` : ''}`),
                h('span', {}, p.onRoad ? 'on the road' : p.flying ? 'in the air' : p.at ? `at ${nameOfClearing(p.at)}${p.hidden ? ' · hidden' : ''}` : ''),
                p.hires ? h('span', { 'data-hires': String(p.hires) }, `${p.hires} hireling${p.hires === 1 ? '' : 's'}, theirs alone`) : null,
                rowExtra?.(p) ?? null),
            h('span', { class: 'end rp-nums' }, h('span', { class: 'ds-c-fame' }, `Fame ${p.fame}`), h('span', { class: 'ds-c-notor' }, `Notoriety ${p.notoriety}`)),
            h('i', { class: `on pdot${p.present ? '' : ' away'}`, 'aria-label': p.present ? 'here now' : 'away' }))),
        copyInvite ? h('div', {}, h('button', { type: 'button', class: 'ds-btn sm', 'data-act': 'copy-invite', onclick: copyInvite }, 'Copy invite link')) : null,
        foot);
}

export { waitingText, joinNames, tagText, logText };
