import { h } from './dom.js';
import { cardEl } from './card.js';
import { HUMAN } from './controller.js';

export function handStrip(ctx) {
    const { s, idx } = ctx;
    const me = s.players[HUMAN];
    return h('footer', { id: 'hand' },
        h('div', { class: 'piles' },
            h('span', { 'data-count': 'draw' }, `Deck ${me.draw.length}`),
            h('span', { 'data-count': 'discard' }, `Discard ${me.discard.length}`),
            h('span', { class: 'tokcount' }, h('b', { class: 'tok tok-0' }, me.tokensLeft), 'tokens left')),
        h('div', { class: 'cards', 'data-hand': '' }, me.hand.map(c => cardEl(c, { act: idx.byUid.has(c.uid) }))));
}
