import { say } from './core.js';
import { REL_NAMES } from './tables.js';
import { defOf, nameOf, priceOf, makeItem, summaryOf, autoEquip, noteGain, extraPhaseCommitment, transferLock } from './items.js';
import { hasCurse } from './effects.js';
import { meetingOutcome, drinksCost } from './meeting.js';
import { relFor } from './hire.js';
import * as missions from './missions.js';

// The Trade activity (rules digest 05 section 4.4). He deals with one native leader in his clearing: sell as much as he likes,
// or buy a single item (the price depends on a roll on the Meeting Table).

function leadersHere(st, data) {
    const here = st.ch.at, out = [];
    for (const g of Object.values(data.groups)) {
        const leader = st.nats.find(n => !n.dead && !n.hired && n.loc?.c === here && data.natives[n.id].group === g.id && data.natives[n.id].leader);
        if (leader) out.push(g.id);
    }
    return out;
}

// What he may sell or pay with: not a horse or card that gives him an extra phase he has recorded and not yet finished (6.2.4d: he cannot abandon or transfer it before then).
export function sellable(st, data) {
    return st.ch.items.filter(i => !i.destroyed && !extraPhaseCommitment(st, data, i) && !transferLock(data, i)).map(i => ({ uid: i.uid, name: nameOf(data, i), sub: summaryOf(data, i), price: priceOf(data, i), kind: i.kind, active: i.active }));
}

export function stockOf(st, data, group) {
    return (st.stock[group] ?? []).map((it, idx) => ({ idx, kind: it.kind, id: it.id, name: nameOf(data, it), sub: summaryOf(data, it), base: priceOf(data, it) }));
}

export function beginTrade(st, data) {
    const groups = leadersHere(st, data);
    if (!groups.length) return false;
    const group = groups[0];
    st.pending = { type: 'trade', group, groups, mode: null, sold: [] };
    return true;
}

// The "Trade with" chooser for the sheet: one entry per leader in the clearing. He may switch while nothing has been dealt (7.6.1: he picks the leader).
export function groupChoices(p) {
    const open = !p.mode && !(p.sold?.length) && !p.drinks;
    return (p.groups ?? []).map(group => ({ group, selected: group === p.group, canSwitch: open && (p.groups.length > 1) }));
}

// Under Disgust a Challenge cannot be paid (it costs Fame): the sheet must offer only the fight (7.6.5d).
export function canPayOffer(st, p) {
    return !(p.insult === 'Challenge' && hasCurse(st, 'Disgust'));
}

// the relationship he trades by: a group his Persuade spell pacified is Friendly at least, for buying as for hiring (7.6.5a; ruling H3, Mike 2026-10-26: both)
const relOf = (st, g) => relFor(st, g);
const itemsWorthOf = (st, data) => st.ch.items.filter(i => !i.destroyed && !extraPhaseCommitment(st, data, i) && !transferLock(data, i)).reduce((n, i) => n + priceOf(data, i), 0);

// Returns a string when the Trade phase is over, or undefined when more input is wanted (st.pending is set).
export function tradeAction(st, data, p, a) {
    if (p.type === 'trade-offer') return offerAction(st, data, p, a);
    const g = p.group;
    if (a.act === 'sell') {
        if (p.mode === 'buy') throw new Error('you cannot both buy and sell in one phase');
        const uids = [...new Set(a.items ?? [a.item])];                      // one thing, or several chosen together
        for (const u of uids) if (!st.ch.items.some(i => i.uid === u && !i.destroyed)) throw new Error('no such item');
        for (const u of uids) { const it0 = st.ch.items.find(i => i.uid === u), bound = extraPhaseCommitment(st, data, it0) ?? transferLock(data, it0); if (bound) throw new Error(bound); }
        for (const u of uids) {
            const it = st.ch.items.find(i => i.uid === u && !i.destroyed);
            const price = priceOf(data, it);
            st.ch.gold += price;
            st.ch.items = st.ch.items.filter(i => i.uid !== it.uid);
            (st.stock[g] ??= []).push({ kind: it.kind, id: it.id, damaged: false, ...(it.card ? { card: it.card } : {}) });     // a card that became a counter stays linked to its card
            // A treasure with a Fame reward pays it when sold to the right group.
            const d = it.card ? data.treasures[it.card] : defOf(data, it);
            let bonus = '';
            if (d?.fameReward && d.fameReward.group === g) { st.ch.fame += d.fameReward.points; bonus = ` and the ${g} reward you ${d.fameReward.points} Fame`; }
            say(st, `You sell the ${nameOf(data, it)} to the ${g} for ${price} gold${bonus}.`, 'trade');
            p.mode = 'sell'; p.sold.push(it.uid);
        }
        st.pending = p;
        return undefined;
    }
    if (a.act === 'drinks' && st.missions && missions.noDrinks(st, g)) throw new Error('They are foes of your campaign: you cannot buy them drinks (7.2.4h)');
    if (a.act === 'drinks') {
        // 7.6.5b: natives only, once per phase, just before the roll; one gold per member of the group present.
        if (p.drinks) throw new Error('you have already bought drinks this phase');
        if (p.mode === 'sell' || p.sold.length) throw new Error('drinks come before the deal, and you have already sold');
        if (hasCurse(st, 'Ashes')) throw new Error('Your gold is worthless under the Ashes curse.');
        const cost = drinksCost(st, data, g);
        if (st.ch.gold < cost) throw new Error('not enough gold');
        st.ch.gold -= cost; p.drinks = true; p.drinksCost = cost;
        say(st, `You buy drinks for the ${g} (${cost} gold): they warm to you.`, 'trade');
        st.pending = p;
        return undefined;
    }
    if (a.act === 'done') return p.sold.length ? `You finish trading with the ${g}.` : `You decide not to trade with the ${g}.`;
    if (a.act === 'group') {
        if (p.mode || p.sold.length || p.drinks) throw new Error('you have already started dealing with one leader');
        if (!p.groups.includes(a.group)) throw new Error('no such leader here');
        p.group = a.group; st.pending = p; return undefined;
    }
    if (a.act === 'repay') {
        // 7.6.5e.1: win back the level a boon cost him by buying it as if it were an item at the boon's price. One chance only.
        if (p.mode === 'sell') throw new Error('you cannot both buy and sell in one phase');
        const debts = (st.ch.boons ??= []);
        const k = debts.findIndex((b, i) => b.group === g && (a.n == null || i === a.n));
        if (k < 0) throw new Error(`you owe the ${g} no boon`);
        if (hasCurse(st, 'Ashes')) throw new Error('Your gold is worthless under the Ashes curse: nobody will deal.');
        const b = debts[k];
        const { res, r, note, rolls } = meetingOutcome(st, relOf(st, g) + (p.drinks ? 1 : 0), `Meeting roll: repaying the ${g}`, data, false, 'trade');
        const why = `${note}rolled ${r.dice.join('+')}: ${res}`;
        st.ch.hiddenAfterBlock = false;
        if (res.startsWith('Price') || res === 'Boon') {
            const mult = res === 'Boon' ? 1 : Number(res.split('x')[1]);       // a boon cannot be paid for with a boon: it is the base price
            const price = b.price * mult, worth = itemsWorthOf(st, data);
            st.pending = { type: 'trade-offer', group: g, repay: k, name: `the ${g}'s goodwill`, base: b.price, mult, price, rollNote: why, rollIds: rolls, affordable: st.ch.gold >= price, affordableWithItems: st.ch.gold + worth >= price };
            return undefined;
        }
        debts.splice(k, 1);                                                  // not bought on the first roll: lost for good
        say(st, `The ${g} will not hear of it (${why}): the lost level is gone for good.`, 'trade');
        if (res === 'Insult' || res === 'Challenge') { st.pending = { type: 'trade-offer', group: g, insult: res, rollIds: rolls, rollNote: why }; return undefined; }
        if (res === 'No deal') return `The ${g} will not deal; you lose your chance to win back their goodwill.`;
        st.turn.blocked = true; st.ch.hidden = false; st.turn.forceBlock = true;
        return `The ${g} block you.`;
    }
    if (a.act === 'buy') {
        if (p.mode === 'sell') throw new Error('you cannot both buy and sell in one phase');
        const stock = st.stock[g] ?? [];
        const it = stock[a.idx];
        if (!it) throw new Error('that is not for sale');
        if (hasCurse(st, 'Ashes')) throw new Error('Your gold is worthless under the Ashes curse: nobody will sell to you.');
        const base = priceOf(data, it);
        // Resolve the meeting roll (with the friendly/trouble re-rolls); drinks make the group one level friendlier.
        const { res, r, note, rolls } = meetingOutcome(st, relOf(st, g) + (p.drinks ? 1 : 0), `Meeting roll: buying from the ${g}`, data, false, 'trade');
        st.ch.hiddenAfterBlock = false;
        if (res.startsWith('Price')) {
            const mult = Number(res.split('x')[1]);
            const price = base * mult;
            const itemsWorth = itemsWorthOf(st, data);
            st.pending = { type: 'trade-offer', group: g, idx: a.idx, name: nameOf(data, it), base, mult, price, rollNote: `${note}rolled ${r.dice.join('+')}: ${res}`, rollIds: rolls,
                affordable: st.ch.gold >= price, affordableWithItems: st.ch.gold + itemsWorth >= price };
            return undefined;
        }
        if (res === 'Boon') {
            // Price x1, or take it free as a boon (7.6.5e): the group drops a level until he buys it back.
            const itemsWorth = itemsWorthOf(st, data);
            st.pending = { type: 'trade-offer', group: g, idx: a.idx, name: nameOf(data, it), base, mult: 1, price: base, boon: true, rollNote: `${note}rolled ${r.dice.join('+')}: Boon`, rollIds: rolls,
                affordable: st.ch.gold >= base, affordableWithItems: st.ch.gold + itemsWorth >= base };
            return undefined;
        }
        if (res === 'No deal') { say(st, `No deal: the ${g} will not sell (${note}rolled ${r.dice.join('+')}).`, 'trade'); return `The ${g} refuse to sell.`; }
        if (res === 'Insult' || res === 'Challenge') {
            st.pending = { type: 'trade-offer', group: g, idx: a.idx, name: nameOf(data, it), base, insult: res, rollIds: rolls, rollNote: `${note}rolled ${r.dice.join('+')}: ${res}` };
            return undefined;
        }
        // Block/Battle: the group blocks him
        st.turn.blocked = true; st.ch.hidden = false;
        say(st, `The ${g} take offence and block you (${note}rolled ${r.dice.join('+')}).`, 'block');
        st.turn.forceBlock = true;
        return `The ${g} block you (${note}rolled ${r.dice.join('+')}: Block/Battle).`;
    }
    throw new Error('unknown trade action');
}

// What a deal cost in Fame, said in its journal line (a sale that wins Fame is said elsewhere, by the result).
const feeNote = fame => (fame > 0 ? ` It cost you ${fame} Fame.` : '');

function takeBought(st, data, g, idx) {
    const raw = st.stock[g].splice(idx, 1)[0];
    const it = makeItem(st, raw.kind, raw.id, { damaged: !!raw.damaged, ...(raw.card ? { card: raw.card } : {}) });
    const card = data.treasures[raw.card ?? raw.id];
    if (card?.fameReward && card.fameReward.group === g) st.ch.fame -= card.fameReward.points;     // buying it back from its group costs the Fame it paid
    st.ch.items.push(it);
    noteGain(st, it);
    autoEquip(st, data, it);
    return it;
}

function offerAction(st, data, p, a) {
    const g = p.group;
    if (p.insult) {
        if (a.act === 'pay' && p.insult === 'Challenge' && hasCurse(st, 'Disgust')) { st.turn.blocked = true; st.ch.hidden = false; st.turn.forceBlock = true; return `Under Disgust you cannot pay a Challenge: the ${g} block you.`; }
        if (a.act === 'pay') {
            if (p.insult === 'Insult') st.ch.notoriety -= 5; else st.ch.fame -= 5;
            return `You pay to smooth things over; the ${g} will not deal.`;
        }
        st.turn.blocked = true; st.ch.hidden = false; st.turn.forceBlock = true;
        say(st, `You refuse the ${(p.insult ?? 'offer').toLowerCase()}: the ${g} block you.`, 'block');
        return `You refuse the ${(p.insult ?? 'offer').toLowerCase()}, so the ${g} block you.`;
    }
    if (a.act === 'accept') {
        // A boon taken free: the group drops one level and he owes it until he buys the level back (7.6.5e).
        if (a.boon) {
            if (!p.boon) throw new Error('that is not a boon');
            const fameBefore = st.ch.fame, it = takeBought(st, data, g, p.idx);
            st.ch.rel[g] = Math.max(-2, (st.ch.rel[g] ?? 0) - 1);
            (st.ch.boons ??= []).push({ group: g, price: p.base, what: nameOf(data, it), day: st.day });
            say(st, `The ${g} give you the ${nameOf(data, it)} as a favour. They think a little less of you until you win it back.${feeNote(fameBefore - st.ch.fame)}`, 'trade');
            return `The ${g} give you the ${nameOf(data, it)} free.`;
        }
        // Rule 7.6.5c: part or all of the price may be paid in belongings at their basic Gold price. The seller keeps any overpayment
        // (no change), and recorded gold may not drop below zero.
        const uids = [...new Set(a.items ?? [])];
        const paying = uids.map(uid => st.ch.items.find(i => i.uid === uid && !i.destroyed));
        if (paying.some(i => !i)) throw new Error('no such item');
        for (const i of paying) { const bound = extraPhaseCommitment(st, data, i) ?? transferLock(data, i); if (bound) throw new Error(bound); }
        const worth = paying.reduce((n, i) => n + priceOf(data, i), 0);
        const gold = Math.max(0, p.price - worth);
        if (st.ch.gold < gold) throw new Error('not enough gold');
        st.ch.gold -= gold;
        const given = [];
        for (const it of paying) {
            st.ch.items = st.ch.items.filter(i => i.uid !== it.uid);
            (st.stock[g] ??= []).push({ kind: it.kind, id: it.id, damaged: false, ...(it.card ? { card: it.card } : {}) });     // the buyer's box, like any sale
            const d = it.card ? data.treasures[it.card] : defOf(data, it);
            if (d?.fameReward && d.fameReward.group === g) st.ch.fame += d.fameReward.points;
            given.push(nameOf(data, it));
        }
        const cost = given.length ? `${given.join(' and ')}${gold ? ` and ${gold} gold` : ''}` : `${gold} gold`;
        const over = worth > p.price ? ` (they keep the ${worth - p.price} gold of overpayment)` : '';
        if (p.repay != null) {
            const debts = st.ch.boons ?? [];
            debts.splice(p.repay, 1);
            st.ch.rel[g] = (st.ch.rel[g] ?? 0) + 1;
            say(st, `You win back the ${g}'s goodwill for ${cost}${over}.`, 'trade');
            return `You win back the ${g}'s goodwill for ${cost}.`;
        }
        const fameBefore = st.ch.fame, got = takeBought(st, data, g, p.idx);
        say(st, `You buy the ${nameOf(data, got)} from the ${g} for ${cost}${over}.${feeNote(fameBefore - st.ch.fame)}`, 'trade');
        return `You buy the ${nameOf(data, got)} for ${cost}.`;
    }
    if (p.repay != null) {                                   // he turned down his one chance to win back the level
        (st.ch.boons ?? []).splice(p.repay, 1);
        say(st, `You turn down the ${g}'s price: the lost level is gone for good.`, 'trade');
        return `You let the chance to win back the ${g} slip.`;
    }
    return 'You turn the offer down.';
}
