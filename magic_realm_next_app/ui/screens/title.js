import { h } from '../dom.js';
import { emblem } from '../emblem.js';
import { icon } from '../icons.js';
import { serverAvailable } from '../online.js';
import { confirmSheet, say } from '../front.js';

// The title screen (mockup 06 h1, h1b). One list that never moves: Continue (when a game is on this device, with where you are), New game, then a row of three.
// Play online is dim while the server answers and then live, so nothing jumps under the thumb. The gear (top right) opens Settings.
export const PERIOD_LABEL = { setup: 'Birdsong', birdsong: 'Birdsong', sunrise: 'Sunrise', daylight: 'Daylight', 'turn-end': 'Day’s end', sunset: 'Sunset', evening: 'Evening' };
export const periodLabel = p => PERIOD_LABEL[p] ?? '';

// "Your White Knight is on day 6 of 28, with 112 Gold."
const where = s => `Your ${s.character} is on day ${s.day}${s.mode === 'month' && s.lastDay ? ` of ${s.lastDay}` : ''}, with ${s.gold ?? 0} Gold.`;

export function titleScreen(ctx) {
    const last = ctx.saved[0];
    // Is there a game server? (The public static copy has none.) Until it answers the button is dim; a tap meanwhile waits for the answer, and a "no" is said in words.
    let checking = true, up = false;
    const answer = serverAvailable().then(ok => { checking = false; up = ok; online.classList.toggle('is-dim', !ok); online.setAttribute('aria-disabled', ok ? 'false' : 'true'); return ok; });
    const online = h('button', { type: 'button', class: 'ds-btn sm ds-trio is-dim', 'aria-disabled': 'true', 'data-act': 'online', onclick: async () => {
        const ok = checking ? await answer : up;
        if (ok) ctx.go('online'); else say('There is no game server on this page, so there is nobody to play online with.', { bad: true, lift: 80 });
    } }, 'Play online');
    // New game over a game in progress asks first: who, which day, what it costs, what survives (review FD-01). Keep playing is the safe, gold choice.
    const askNew = () => confirmSheet({ eyebrow: 'New game', title: 'Start a new game?', lines: [where(last), 'A new game ends that adventure. It stays in History as abandoned.'],
        attrs: { 'data-confirm': 'new', role: 'alertdialog' },
        safe: { label: 'Keep playing', attrs: { 'data-act': 'keep-playing' }, onclick: () => ctx.go('game', { id: last?.id }) },
        risky: { label: 'Start a new game', attrs: { 'data-act': 'replace' }, onclick: () => ctx.go('newgame') } });
    return h('main', { class: 'screen ds-screen ds-title', 'data-screen': 'title' },
        h('button', { type: 'button', class: 'ds-btn icon quiet ds-gear', 'data-act': 'settings', 'aria-label': 'Settings', onclick: () => ctx.go('settings') }, icon('gear', 'lg')),
        h('header', { class: 'ds-title-head' },
            h('div', { class: 'ds-eyebrow ds-edition' }, 'Third Edition'),
            emblem(),
            h('h1', { class: 'ds-wordmark' }, h('span', { class: 'a' }, 'Magic'), h('span', { class: 'b' }, 'Realm')),
            h('p', { class: 'ds-voice ds-tagline' }, 'Clearings, chits and cunning')),
        h('div', { class: 'ds-grow' }),
        h('nav', { class: 'ds-title-nav', 'aria-label': 'Main menu' },
            last ? h('button', { type: 'button', class: 'ds-btn primary block ds-continue', 'data-act': 'continue', onclick: () => ctx.go('game', { id: last.id }) },
                h('span', { class: 'col' }, 'Continue', h('small', {}, [last.character, `Day ${last.day}`, periodLabel(last.period)].filter(Boolean).join(' · ')))) : null,
            h('button', { type: 'button', class: `ds-btn block${last ? '' : ' primary'}`, 'data-act': 'new', onclick: () => (last ? askNew() : ctx.go('newgame')) }, 'New game'),
            h('div', { class: 'ds-trio-row' }, online,
                h('button', { type: 'button', class: 'ds-btn sm ds-trio', 'data-act': 'history', onclick: () => ctx.go('history') }, 'History'),
                h('button', { type: 'button', class: 'ds-btn sm ds-trio', 'data-act': 'rules', onclick: () => ctx.go('rules') }, 'How to play'))),
        h('footer', { class: 'ds-meta ds-fine' }, 'An unofficial fan project. ', h('b', {}, 'Magic Realm'), ' belongs to its owners.'));
}
