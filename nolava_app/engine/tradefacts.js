// What the Trade and Hire sheets need to know besides the question itself (Phase 3 round 8): the merchant's stock, what he may sell, whether a Challenge can be paid, his standing with each group at the
// table and the price of a round of drinks. Facts for `legal(...).options` of the `trade`, `trade-offer`, `hire` and `hire-offer` questions; nothing here is a sentence.
import { canPayOffer, groupChoices, heldCards, isNamed, lineup, sellable, stockView } from './trade.js';
import { relFor } from './hire.js';
import { drinksCost } from './meeting.js';
import { noDrinks } from './missions.js';
import { hasCurse } from './effects.js';

export const TRADE_QUESTIONS = ['trade', 'trade-offer', 'hire', 'hire-offer'];

export function tradeFacts(st, data, p) {
    const groups = [...new Set([p.group, ...(p.groups ?? []), ...(p.options ?? []).map(o => o.group)].filter(Boolean))];
    const out = { ashes: hasCurse(st, 'Ashes'), groups: Object.fromEntries(groups.map(g => [g, { rel: relFor(st, g), drinks: drinksCost(st, data, g), noDrinks: noDrinks(st, g) }])) };
    Object.assign(out, { mine: sellable(st, data, p.group ?? null), canPay: canPayOffer(st, p) });          // (what he may pay with, and whether he may pay a Challenge: an offer to trade or to hire alike)
    // What the sheet is told of the goods depends on what he has done (stockView in trade.js): the counters are in plain view, a Treasure card is not until he looks (7.6.5).
    if (p.type === 'trade' || p.type === 'trade-offer') Object.assign(out, stockView(st, data, p), { choices: groupChoices(p), named: isNamed(p), looked: !!p.looked, held: isNamed(p) ? heldCards(st, p) : { cards: 0, spells: 0 }, ...(isNamed(p) ? {} : { lineup: lineup(st, data, p) }) });
    return out;
}
