import { def, logEvent } from './helpers.js';
import { allLineCards, tokensOn, returnTokens } from './bid.js';
import { completeIfAble } from './contracts.js';
import { findInLines, lineOf } from './market.js';

// What buying `card` would cost this player, or null when it is not allowed (rulebook p.7-9).
// delta is the player's net change in $: the Bid-Token discount (or surplus) against the supply,
// minus $1 to each other player for every token of theirs on the card.
export function quote(s, p, card, install) {
    const d = def(card);
    let price;
    if (d.kind === 'contract') {
        if (p.contract || install) return null;
        price = 0;
    } else if (d.kind === 'pipeline') {
        if (install || p.pipelines.some(c => def(c).color === d.color)) return null;
        price = d.buy;
    } else if (install) {
        if (d.pink || p.installed.some(c => c.defId === card.defId)) return null;
        price = d.installTotal;
    } else {
        price = d.buy;
    }
    const own = tokensOn(card, p.id);
    const others = Object.entries(card.bids ?? {}).filter(([pid]) => Number(pid) !== p.id)
        .reduce((sum, [, n]) => sum + n, 0);
    const delta = own - price - others;
    return p.money + (own - price) >= others ? { price, own, others, delta } : null;
}

export function buyOptions(s, p) {
    const acts = [];
    for (const card of allLineCards(s)) {
        const kind = findInLines(s, card.uid).kind;
        const d = def(card);
        const modes = d.kind === 'upgrade' ? [false, true] : [false];
        for (const install of modes) {
            if (quote(s, p, card, install)) acts.push({ type: 'buy', line: kind, uid: card.uid, install });
        }
    }
    return acts;
}

export function performBuy(s, p, a) {
    const line = lineOf(s, a.line);
    const card = line.splice(line.findIndex(c => c.uid === a.uid), 1)[0];
    const q = quote(s, p, card, a.install);
    const d = def(card);
    Object.entries(card.bids ?? {}).forEach(([pid, n]) => {
        if (Number(pid) !== p.id) s.players[pid].money += n;
    });
    p.money += q.delta;
    returnTokens(s, card);
    if (d.kind === 'contract') p.contract = card;
    else if (d.kind === 'pipeline') p.pipelines.push(card);
    else if (a.install) p.installed.push(card);
    else p.discard.push(card);
    logEvent(s, { type: 'buy', pid: p.id, card: card.defId, install: a.install, paid: q.price, delta: q.delta });
    completeIfAble(s, p);                  // buying a Contract, or installing a helper straight from the line, can finish it
}
