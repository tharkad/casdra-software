import { mulberry } from './net.js';
import { cloneState } from '../engine/clone.js';

// Information-set sampling for the search: take the real position and re-deal everything the acting player CANNOT see, keeping
// everything they can. Hidden = the opponent's hand/draw split, the order of my own draw pile, the order of the two market decks.
// Known multisets (the opponent's cards not on the table are derivable from the public history) are kept; only their order changes.
// HARD RULE (tested by a scramble test): the result depends only on what `pid` can see, plus the sampling rng.
const byIdentity = (a, b) => (a.defId < b.defId ? -1 : a.defId > b.defId ? 1 : a.uid - b.uid);
function shuffled(cards, rnd) {
    const a = [...cards].sort(byIdentity);                 // canonical order first, so the input's (hidden) order cannot leak through
    for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

export function determinize(state, pid, rnd) {
    const s = cloneState(state);
    const me = s.players[pid]; const foe = s.players[1 - pid];
    me.draw = shuffled(me.draw, rnd);
    const pool = shuffled([...foe.hand, ...foe.draw], rnd); const h = foe.hand.length;
    foe.hand = pool.slice(0, h); foe.draw = pool.slice(h);
    s.market.contractDeck = shuffled(s.market.contractDeck, rnd);
    s.market.upgradeDeck = shuffled(s.market.upgradeDeck, rnd);
    s.rng = Math.floor(rnd() * 4294967296) >>> 0;          // the future shuffles differ too (never the real game's rng)
    return s;
}
export { mulberry };
