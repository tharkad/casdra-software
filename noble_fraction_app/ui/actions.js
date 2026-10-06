import { canon } from '../engine/registry.js';
import { CARD_DEFS } from '../data/cards.js';
import { findCard } from './find.js';

// Turns the engine's legal actions into UI affordances: card actions (they name a card uid, shown
// in that card's zoom sheet) and bar actions (console buttons). The UI never decides legality.
const CARD_ACTION_UID = {
    play: a => a.uid, useInstalled: a => a.uid, install: a => a.uid, buy: a => a.uid,
    bid: a => a.uid, bidMove: a => a.to, placeFreeBid: a => a.uid, discard: a => a.uid,
};

export const cardUid = a => CARD_ACTION_UID[a.type]?.(a);

// Packed Tower's Use button is important enough to sit in the console, not only in the card's zoom sheet.
export const isTowerUse = (a, s) => (a.type === 'play' || a.type === 'useInstalled')
    && CARD_DEFS[findCard(s, cardUid(a))?.card.defId]?.ability === 'lessXe';

export function indexActions(legal, s = null) {
    const byUid = new Map();
    const bar = [];
    const ppe = [];
    for (const a of legal) {
        if (a.type === 'ppeChoose') ppe.push(a);
        else if (CARD_ACTION_UID[a.type]) {
            const uid = cardUid(a);
            byUid.set(uid, [...(byUid.get(uid) ?? []), a]);
            if (s && isTowerUse(a, s)) bar.push(a);
        } else bar.push(a);
    }
    return { byUid, bar, ppe };
}


export const actAttr = a => canon(a);

// Actions that only differ by WHICH identical card they act on (discarding one of two Krypton) are one
// choice to the player. Returns the group an action belongs to; every other action is its own group.
export function actionGroup(a, s) {
    if (a.discard === undefined) return actAttr(a);
    return `${a.type}:${a.uid}:discard:${findCard(s, a.discard).card.defId}`;
}
