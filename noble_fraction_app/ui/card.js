import { h } from './dom.js';
import { CARD_DEFS } from '../data/cards.js';
import { cardFace } from './cardface.js';
import { DUPLICATE_TAG } from './duplicates.js';

// One card face: the publisher's art plus Bid Token pips. Tapping any card (data-zoom) opens its
// zoom sheet; `act` marks a card the legal actions can do something with right now.
export function cardEl(card, { classes = '', act = false, dup = null } = {}) {
    const d = CARD_DEFS[card.defId];
    // One badge per side that has Bid Tokens here, the count inside it: you teal, the Rival orange.
    const pips = Object.entries(card.bids ?? {}).filter(([, n]) => n > 0).map(([pid, n]) =>
        h('b', { class: `tok tok-${pid}`, 'data-bid': pid, title: `${pid === '0' ? 'Your' : "Rival's"} Bid Tokens` }, n));
    return h('button', { class: `card ${act ? 'act' : ''} ${dup ? `dup dup-${dup}` : ''} ${classes}`, 'data-uid': card.uid, 'data-def': card.defId,
        'data-zoom': card.uid, 'aria-label': dup ? `${d.name} (${DUPLICATE_TAG[dup].toLowerCase()})` : d.name },
    cardFace(card.defId),
    pips.length ? h('span', { class: 'tokens' }, pips) : null,
    dup ? h('span', { class: 'dup-tag', 'data-dup': dup }, `✓ ${DUPLICATE_TAG[dup]}`) : null);       // you already have one of these (see duplicates.js)
}

export const cardName = defId => CARD_DEFS[defId].name;

export function xePips(have, need) {
    return h('span', { class: 'pips' }, Array.from({ length: Math.max(have, need) }, (_, i) =>
        h('i', { class: `pip ${i < have ? 'on' : ''}` })));
}
