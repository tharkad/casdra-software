import { h } from './dom.js';
import { cardEl } from './card.js';
import { duplicateReason } from './duplicates.js';
import { HUMAN } from './controller.js';
import { lineSize } from '../engine/market.js';

// Both lines side by side, each in its own tinted section: Contracts (Mains sit among them) and Upgrades. A section always holds room for a
// full line (3 cards in a 2-player game): a card you take leaves an empty slot instead of the section shrinking, so nothing else in the
// market moves until the line is restocked at the end of the turn. A line longer than that (a game saved under the old 4-card rule) grows.
export function marketPane(ctx) {
    const { s, idx } = ctx;
    const line = (title, cards, key) => {
        const room = Math.max(lineSize(s), cards.length);
        const gaps = Array.from({ length: room - cards.length }, () => h('div', { class: 'slot', 'data-slot': '', 'aria-hidden': 'true' }));
        return h('section', { class: `line line-${key}`, 'data-line': key },
            h('h3', {}, title, h('span', { class: 'deck' }, `deck ${s.market[`${key}Deck`].length}`)),
            h('div', { class: 'row' }, cards.map(c => cardEl(c, { act: idx.byUid.has(c.uid), dup: duplicateReason(s, HUMAN, c) })), gaps));
    };
    return h('div', { class: 'pane market' },
        line('Contracts', s.market.contractLine, 'contract'), line('Upgrades', s.market.upgradeLine, 'upgrade'));
}
