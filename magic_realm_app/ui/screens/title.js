import { h } from '../dom.js';
import { emblem } from '../emblem.js';
import { VERSION } from '../version.js';

// The title screen. The main choices sit in the lower half where a thumb rests; the upper half is the brand.
export function titleScreen(ctx) {
    const last = ctx.saved[0];
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
            h('button', { class: `btn ${last ? '' : 'primary'} big`, 'data-act': 'new', onclick: () => ctx.go('newgame') }, 'New game'),
            h('button', { class: 'btn big', 'data-act': 'join', onclick: () => ctx.go('join') }, 'Join a game'),
            h('div', { class: 'row3' },
                h('button', { class: 'btn', 'data-act': 'rules', onclick: () => ctx.go('rules') }, 'Rules'),
                h('button', { class: 'btn', 'data-act': 'history', onclick: () => ctx.go('history') }, 'History'),
                h('button', { class: 'btn', 'data-act': 'settings', onclick: () => ctx.go('settings') }, 'Settings'))),
        h('footer', { class: 'fine' }, 'An unofficial fan project. ', h('b', {}, 'Magic Realm'), ' belongs to its owners. ', h('span', { class: 'ver' }, `v${VERSION}`)));
}
