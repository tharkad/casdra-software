import { canon } from '../engine/registry.js';

// Turns the engine's legal actions into UI affordances: card actions (they name a card uid, shown
// in that card's zoom sheet) and bar actions (console buttons). The UI never decides legality.
const CARD_ACTION_UID = {
    play: a => a.uid, useInstalled: a => a.uid, install: a => a.uid, buy: a => a.uid,
    bid: a => a.uid, bidMove: a => a.to, placeFreeBid: a => a.uid, discard: a => a.uid,
};

export const cardUid = a => CARD_ACTION_UID[a.type]?.(a);

export function indexActions(legal) {
    const byUid = new Map();
    const bar = [];
    const ppe = [];
    for (const a of legal) {
        if (a.type === 'ppeChoose') ppe.push(a);
        else if (CARD_ACTION_UID[a.type]) {
            const uid = cardUid(a);
            byUid.set(uid, [...(byUid.get(uid) ?? []), a]);
        } else bar.push(a);
    }
    return { byUid, bar, ppe };
}


export const actAttr = a => canon(a);
