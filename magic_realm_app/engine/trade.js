import { lvl, die, roll2, say } from './core.js';
import { meetingResult, REL_NAMES } from './tables.js';
import { defOf, nameOf, priceOf, makeItem, summaryOf, autoEquip } from './items.js';
import { hasCurse } from './effects.js';
import { meetingDice } from './meeting.js';

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

export function sellable(st, data) {
    return st.ch.items.filter(i => !i.destroyed).map(i => ({ uid: i.uid, name: nameOf(data, i), sub: summaryOf(data, i), price: priceOf(data, i), kind: i.kind, active: i.active }));
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

const relOf = (st, g) => st.ch.rel?.[g] ?? 0;
function meetingRoll(st) { return meetingDice(st); }

// Returns a string when the Trade phase is over, or undefined when more input is wanted (st.pending is set).
export function tradeAction(st, data, p, a) {
    if (p.type === 'trade-offer') return offerAction(st, data, p, a);
    const g = p.group;
    if (a.act === 'sell') {
        if (p.mode === 'buy') throw new Error('you cannot both buy and sell in one phase');
        const it = st.ch.items.find(i => i.uid === a.item && !i.destroyed);
        if (!it) throw new Error('no such item');
        const price = priceOf(data, it);
        st.ch.gold += price;
        st.ch.items = st.ch.items.filter(i => i.uid !== it.uid);
        (st.stock[g] ??= []).push({ kind: it.kind, id: it.id, damaged: false });
        // A treasure with a Fame reward pays it when sold to the right group.
        const d = it.card ? data.treasures[it.card] : defOf(data, it);
        let bonus = '';
        if (d?.fameReward && d.fameReward.group === g) { st.ch.fame += d.fameReward.points; bonus = ` and the ${g} reward you ${d.fameReward.points} Fame`; }
        say(st, `You sell the ${nameOf(data, it)} to the ${g} for ${price} gold${bonus}.`, 'trade');
        p.mode = 'sell'; p.sold.push(it.uid);
        st.pending = p;
        return undefined;
    }
    if (a.act === 'done') return p.sold.length ? `You finish trading with the ${g}.` : `You decide not to trade with the ${g}.`;
    if (a.act === 'group') {
        if (p.mode || p.sold.length) throw new Error('you have already started dealing with one leader');
        if (!p.groups.includes(a.group)) throw new Error('no such leader here');
        p.group = a.group; st.pending = p; return undefined;
    }
    if (a.act === 'buy') {
        if (p.mode === 'sell') throw new Error('you cannot both buy and sell in one phase');
        const stock = st.stock[g] ?? [];
        const it = stock[a.idx];
        if (!it) throw new Error('that is not for sale');
        if (hasCurse(st, 'Ashes')) throw new Error('Your gold is worthless under the Ashes curse: nobody will sell to you.');
        const base = priceOf(data, it);
        // Resolve the meeting roll (with the friendly/trouble re-rolls).
        let col = relOf(st, g), r = meetingRoll(st), res = meetingResult(col, r.value), note = '';
        for (let guard = 0; guard < 6; guard++) {
            if (res === 'Trouble') { r = meetingRoll(st); note += `Trouble; `; col = -1; res = meetingResult(col, r.value); }
            else if (res === 'Opportunity') { r = meetingRoll(st); note += `Opportunity; `; col = Math.min(2, col + 1); res = meetingResult(col, r.value); }
            else break;
        }
        if (res === 'Trouble' || res === 'Opportunity') res = 'No deal';
        st.ch.hiddenAfterBlock = false;
        if (res.startsWith('Price')) {
            const mult = Number(res.split('x')[1]);
            const price = base * mult;
            const itemsWorth = st.ch.items.filter(i => !i.destroyed).reduce((n, i) => n + priceOf(data, i), 0);
            st.pending = { type: 'trade-offer', group: g, idx: a.idx, name: nameOf(data, it), base, mult, price, rollNote: `${note}rolled ${r.dice.join('+')}: ${res}`,
                affordable: st.ch.gold >= price, affordableWithItems: st.ch.gold + itemsWorth >= price };
            return undefined;
        }
        if (res === 'Boon') {
            takeBought(st, data, g, a.idx);
            st.ch.rel[g] = Math.max(-2, (st.ch.rel[g] ?? 0) - 1);
            say(st, `The ${g} give you the ${nameOf(data, it)} as a boon, and think a little less of you for it.`, 'trade');
            return `The ${g} give you the ${nameOf(data, it)} free.`;
        }
        if (res === 'No deal') { say(st, `No deal: the ${g} will not sell (${note}rolled ${r.dice.join('+')}).`, 'trade'); return `The ${g} refuse to sell.`; }
        if (res === 'Insult' || res === 'Challenge') {
            st.pending = { type: 'trade-offer', group: g, idx: a.idx, name: nameOf(data, it), base, insult: res, rollNote: `${note}rolled ${r.dice.join('+')}: ${res}` };
            return undefined;
        }
        // Block/Battle: the group blocks him
        st.turn.blocked = true; st.ch.hidden = false;
        say(st, `The ${g} take offence and block you (${note}rolled ${r.dice.join('+')}).`, 'block');
        st.turn.forceBlock = true;
        return `The ${g} block you.`;
    }
    throw new Error('unknown trade action');
}

function takeBought(st, data, g, idx) {
    const raw = st.stock[g].splice(idx, 1)[0];
    const it = makeItem(st, raw.kind, raw.id, { damaged: !!raw.damaged });
    const card = data.treasures[raw.id];
    if (card?.fameReward && card.fameReward.group === g) st.ch.fame -= card.fameReward.points;     // buying it back from its group costs the Fame it paid
    st.ch.items.push(it);
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
        say(st, `The ${g} block you.`, 'block');
        return `The ${g} block you.`;
    }
    if (a.act === 'accept') {
        // Rule 7.6.5c: part or all of the price may be paid in belongings at their basic Gold price. The seller keeps any overpayment
        // (no change), and recorded gold may not drop below zero.
        const uids = [...new Set(a.items ?? [])];
        const paying = uids.map(uid => st.ch.items.find(i => i.uid === uid && !i.destroyed));
        if (paying.some(i => !i)) throw new Error('no such item');
        const worth = paying.reduce((n, i) => n + priceOf(data, i), 0);
        const gold = Math.max(0, p.price - worth);
        if (st.ch.gold < gold) throw new Error('not enough gold');
        st.ch.gold -= gold;
        const given = [];
        for (const it of paying) {
            st.ch.items = st.ch.items.filter(i => i.uid !== it.uid);
            (st.stock[g] ??= []).push({ kind: it.kind, id: it.id, damaged: false });     // the buyer's box, like any sale
            const d = it.card ? data.treasures[it.card] : defOf(data, it);
            if (d?.fameReward && d.fameReward.group === g) st.ch.fame += d.fameReward.points;
            given.push(nameOf(data, it));
        }
        const got = takeBought(st, data, g, p.idx);
        const cost = given.length ? `${given.join(' and ')}${gold ? ` and ${gold} gold` : ''}` : `${gold} gold`;
        say(st, `You buy the ${nameOf(data, got)} from the ${g} for ${cost}${worth > p.price ? ` (they keep the ${worth - p.price} gold of overpayment)` : ''}.`, 'trade');
        return `You buy the ${nameOf(data, got)} for ${cost}.`;
    }
    return 'You turn the offer down.';
}
