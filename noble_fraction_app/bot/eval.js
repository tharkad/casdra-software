import { CARD_DEFS, DISTILL_PRIORITY } from '../data/cards.js';

// Everything here reads only what a player at the table can see: their own hand/System counts and
// the public tableau. Draw-pile ORDER is never read (except via Sampling Port's own peek).
export const me = s => s.players[s.turn.active];
export const foe = s => s.players[1 - s.turn.active];
export const junk = hand => hand.filter(c => DISTILL_PRIORITY.includes(c.defId)).length;
export const xeIn = cards => cards.filter(c => c.defId === 'Xe').length;

// Value of the player's position during the DISTILL phase (higher is better).
export function distillValue(s, w) {
    const p = me(s);
    return w.xeStored * p.storedXe + w.contractDone * p.completed.length + w.xeInHand * xeIn(p.hand)
        - w.junkInHand * junk(p.hand) + w.money * p.money;
}

export function cardValue(card, p, w) {
    const d = CARD_DEFS[card.defId];
    if (d.kind === 'upgrade') return w.upgrade[d.id] ?? 2;
    if (d.kind === 'pipeline') return w.pipeline[p.pipelines.length] ?? 0;
    if (d.kind === 'contract') {
        const instant = p.storedXe >= d.xe ? w.instantContract : 0;
        return w.contractVp * d.vp + w.contractMoney * d.money - w.contractXe * d.xe + instant;
    }
    return 0;
}
