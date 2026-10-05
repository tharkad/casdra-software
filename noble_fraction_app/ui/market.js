import { h } from './dom.js';
import { cardEl } from './card.js';

// Both lines side by side: three Contracts (pipelines sit among them) and three Upgrades.
export function marketPane(ctx) {
    const { s, idx } = ctx;
    const line = (title, cards, key) => h('section', { class: 'line', 'data-line': key },
        h('h3', {}, `${title} · deck ${s.market[`${key}Deck`].length}`),
        h('div', { class: 'row' }, cards.map(c => cardEl(c, { act: idx.byUid.has(c.uid) }))));
    return h('div', { class: 'pane market' },
        line('Contracts', s.market.contractLine, 'contract'), line('Upgrades', s.market.upgradeLine, 'upgrade'));
}
