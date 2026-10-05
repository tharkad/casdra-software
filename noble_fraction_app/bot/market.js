import { CARD_DEFS } from '../data/cards.js';
import { me, foe, cardValue } from './eval.js';

const cardByUid = (s, uid) => [...s.market.contractLine, ...s.market.upgradeLine, ...me(s).hand, ...me(s).installed].find(c => c.uid === uid);

// Net worth of a purchase: what the card is worth to me minus what it costs (after bids).
export function buyScore(s, a, w) {
    const p = me(s);
    const card = cardByUid(s, a.uid);
    const d = CARD_DEFS[card.defId];
    const own = card.bids?.[p.id] ?? 0;
    const others = Object.entries(card.bids ?? {}).filter(([pid]) => Number(pid) !== p.id).reduce((n, [, c]) => n + c, 0);
    const price = (d.kind === 'upgrade' && a.install ? d.installTotal : d.buy) - own + others;
    let value = cardValue(card, p, w);
    if (d.kind === 'upgrade' && a.install) value += w.installVp + (d.phase === 'passive' || d.ability ? 0.8 : 0);
    if (d.kind === 'upgrade' && !a.install && d.pink) value *= 0.7;
    return value - w.costWeight * Math.max(0, price);
}

export function installScore(s, a, w) {
    const p = me(s);
    const card = p.hand.find(c => c.uid === a.uid);
    const d = CARD_DEFS[card.defId];
    return cardValue(card, p, w) + w.installVp - w.costWeight * d.installDiff;
}

// Where a Bid Token is most useful: cards I want that I cannot buy yet, or that I want to protect
// from the next WIPE. Cards the Rival has already bid on are less attractive (shared cost).
export function bidScore(s, a, w) {
    const p = me(s);
    const target = cardByUid(s, a.type === 'bidMove' ? a.to : a.uid);
    const d = CARD_DEFS[target.defId];
    let v = cardValue(target, p, w) - 0.4 * d.buy;
    v -= 0.8 * (target.bids?.[p.id] ?? 0);
    v -= 0.5 * Object.entries(target.bids ?? {}).filter(([pid]) => Number(pid) !== p.id).reduce((n, [, c]) => n + c, 0);
    if (a.type === 'bidMove') {
        const from = cardByUid(s, a.from);
        v -= cardValue(from, p, w) - 0.4 * CARD_DEFS[from.defId].buy;
    }
    return v;
}

export function chooseBuyBid(s, actions, w) {
    const buys = actions.filter(a => a.type === 'buy').map(a => ({ a, v: buyScore(s, a, w) }));
    const bestBuy = buys.sort((x, y) => y.v - x.v)[0];
    if (bestBuy && bestBuy.v > w.buyThreshold) return bestBuy.a;
    const installs = actions.filter(a => a.type === 'install').map(a => ({ a, v: installScore(s, a, w) })).sort((x, y) => y.v - x.v);
    if (installs[0] && installs[0].v > w.buyThreshold) return installs[0].a;
    const plays = actions.filter(a => a.type === 'play' && ['floor_broker', 'multiBid', 'procurement_agent'].includes(CARD_DEFS[me(s).hand.find(c => c.uid === a.uid)?.defId]?.ability));
    if (plays.length && (bestBuy?.v ?? -9) > -1) return plays[0];
    const bids = actions.filter(a => a.type === 'bid' || a.type === 'bidMove').map(a => ({ a, v: bidScore(s, a, w) })).sort((x, y) => y.v - x.v);
    const end = actions.find(a => a.type === 'endStep');
    if (bids[0] && (bids[0].v > 0.5 || !end)) return bids[0].a;
    return end ?? bids[0]?.a ?? actions[0];
}

export function bestTarget(s, w) {
    const p = me(s);
    const cards = [...s.market.contractLine, ...s.market.upgradeLine];
    return cards.map(c => ({ c, v: cardValue(c, p, w), cost: CARD_DEFS[c.defId].buy })).sort((x, y) => y.v - x.v)[0];
}
export const rivalScoreGap = s => foe(s).completed.length - me(s).completed.length;
