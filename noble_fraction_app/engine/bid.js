import { findInLines } from './market.js';
import { logEvent } from './helpers.js';

export const allLineCards = s => [...s.market.contractLine, ...s.market.upgradeLine];
export const tokensOn = (card, pid) => card.bids?.[pid] ?? 0;

// Puts one of the player's Bid Tokens on a card in either line (rulebook p.9).
export function placeToken(s, p, uid) {
    const found = findInLines(s, uid);
    if (!found || p.tokensLeft <= 0) throw new Error('placeToken: nothing to place on / no tokens left');
    found.card.bids[p.id] = tokensOn(found.card, p.id) + 1;
    p.tokensLeft -= 1;
    logEvent(s, { type: 'bid', pid: p.id, card: found.card.defId });
}

// A BID action may instead move one of the player's placed tokens to another card.
export function moveToken(s, p, fromUid, toUid) {
    const from = findInLines(s, fromUid).card;
    const to = findInLines(s, toUid).card;
    from.bids[p.id] -= 1;
    if (from.bids[p.id] === 0) delete from.bids[p.id];
    to.bids[p.id] = tokensOn(to, p.id) + 1;
    logEvent(s, { type: 'bidMove', pid: p.id, from: from.defId, card: to.defId });
}

// Every token on a bought card goes back to its owner's supply.
export function returnTokens(s, card) {
    Object.entries(card.bids ?? {}).forEach(([pid, n]) => { s.players[pid].tokensLeft += n; });
    delete card.bids;
}

export function bidOptions(s, p) {
    const cards = allLineCards(s);
    const acts = [];
    if (p.tokensLeft > 0) cards.forEach(c => acts.push({ type: 'bid', uid: c.uid }));
    for (const from of cards.filter(c => tokensOn(c, p.id) > 0)) {
        cards.filter(c => c.uid !== from.uid).forEach(to => acts.push({ type: 'bidMove', from: from.uid, to: to.uid }));
    }
    return acts;
}
