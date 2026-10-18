import { h } from '../dom.js';
import { emblem } from '../emblem.js';
import { VERSION } from '../version.js';
import { serverAvailable } from '../online.js';

// Settings has no screen of its own yet: its title button is hidden (not removed), and the route stays so it returns with the screen.
const SETTINGS_READY = false;

// The title screen. The main choices sit in the lower half where a thumb rests; the upper half is the brand.
export function titleScreen(ctx) {
    const last = ctx.saved[0];
    // shown only where a game server answers (the public static copy has none yet)
    const onlineBtn = h('button', { class: 'btn big', 'data-act': 'online', hidden: true, onclick: () => ctx.go('online') }, 'Play online');
    serverAvailable().then(ok => { onlineBtn.hidden = !ok; });
    // starting a new game replaces the one in progress: ask first (the old one stays in the History as abandoned)
    const confirmNew = h('div', { class: 'confirmbox', hidden: true, 'data-confirm': 'new', role: 'alertdialog' },
        h('p', {}, last ? `You have a game in progress: ${last.character}, Day ${last.day}. A new game replaces it; the old one stays in your History as abandoned.` : ''),
        h('div', { class: 'row2' },
            h('button', { class: 'btn primary', 'data-act': 'keep', onclick: () => ctx.go('game', { id: last?.id }) }, 'Keep playing'),
            h('button', { class: 'btn danger', 'data-act': 'replace', onclick: () => ctx.go('newgame') }, 'Start a new game')));
    return h('main', { class: 'screen title', 'data-screen': 'title' },
        h('header', { class: 'title-top' },
            h('div', { class: 'edition' }, 'Third Edition'),
            emblem(),
            h('h1', { class: 'wordmark' }, h('span', { class: 'magic' }, 'Magic'), h('span', { class: 'realm' }, 'Realm')),
            h('p', { class: 'tagline' }, 'Clearings, chits and cunning')),
        h('div', { class: 'title-spacer' }),
        h('nav', { class: 'menu', 'aria-label': 'Main menu' },
            last ? h('button', { class: 'btn primary big', 'data-act': 'continue', onclick: () => ctx.go('game', { id: last.id }) },
                h('span', { class: 'col' }, 'Continue', h('small', {}, `${last.character} · Day ${last.day}`))) : null,
            h('button', { class: `btn ${last ? '' : 'primary'} big`, 'data-act': 'new', onclick: () => { if (last) confirmNew.hidden = false; else ctx.go('newgame'); } }, 'New game'),
            confirmNew,
            onlineBtn,
            h('div', { class: SETTINGS_READY ? 'row3' : 'row2' },
                h('button', { class: 'btn', 'data-act': 'rules', onclick: () => ctx.go('rules') }, 'Rules'),
                h('button', { class: 'btn', 'data-act': 'history', onclick: () => ctx.go('history') }, 'History'),
                SETTINGS_READY ? h('button', { class: 'btn', 'data-act': 'settings', onclick: () => ctx.go('settings') }, 'Settings') : null)),
        h('footer', { class: 'fine' }, 'An unofficial fan project. ', h('b', {}, 'Magic Realm'), ' belongs to its owners. ', h('span', { class: 'ver' }, `v${VERSION}`)));
}
