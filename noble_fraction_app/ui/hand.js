import { h } from './dom.js';
import { cardEl } from './card.js';
import { HUMAN } from './controller.js';
import { CARD_DEFS } from '../data/cards.js';

// The hand is laid out for reading: elements first, worst to best (N, O, Kr, then Xe, the one you want), then every other card by the
// cost on its badge, cheapest first (ties by name). It is only how the hand is SHOWN: the game's own order is untouched.
const ELEMENT_ORDER = ['N', 'O', 'Kr', 'Xe'];
const badgeCost = d => (d.kind === 'starter' ? d.installCost ?? d.installDiff : d.buy) ?? 0;
export function sortHand(cards) {
    const key = c => {
        const d = CARD_DEFS[c.defId];
        return d.kind === 'element' ? [0, ELEMENT_ORDER.indexOf(c.defId), '', c.uid] : [1, badgeCost(d), d.name, c.uid];
    };
    return [...cards].sort((a, b) => {
        const [ka, kb] = [key(a), key(b)];
        return ka[0] - kb[0] || ka[1] - kb[1] || (ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0) || ka[3] - kb[3];
    });
}

export function handStrip(ctx) {
    const { s, idx } = ctx;
    const me = s.players[HUMAN];
    return h('footer', { id: 'hand' },
        h('div', { class: 'piles' },
            h('span', { 'data-count': 'draw' }, `Deck ${me.draw.length}`),
            h('span', { 'data-count': 'discard' }, `Discard ${me.discard.length}`),
            h('span', { class: 'tokcount' }, h('b', { class: 'tok tok-0' }, me.tokensLeft), 'tokens left')),
        h('div', { class: 'cards', 'data-hand': '' }, sortHand(me.hand).map(c => cardEl(c, { act: idx.byUid.has(c.uid) }))));
}
