// screens/kit/trade.js (P2): the Trade sheet, select-then-commit. Rows tick (a single tap can never sell or spend); the foot says exactly what will happen, with the gold after,
// and its button is dim until something is ticked. Sell | Buy | Boons are rooms of one sheet. The price offer (after the Meeting Table roll) leads with the price; an insult is a
// plain question. Every engine action is the one the old sheet sent: { type: 'trade', act: 'sell' | 'buy' | 'accept' | 'decline' | 'pay' | 'fight' | 'drinks' | 'repay' | 'group' | 'back' | 'done' }.
import { hasCurse } from '../../../engine/effects.js';
import { drinksCost } from '../../../engine/meeting.js';
import { relFor } from '../../../engine/hire.js';
import { noDrinks } from '../../../engine/missions.js';
import { canPayOffer, groupChoices, sellable, stockOf } from '../../../engine/trade.js';
import { nameOfClearing } from '../../../engine/world.js';
import { rollRow, rollsByIds } from '../../dice.js';
import { h } from '../../dom.js';
import { committedNote } from '../../commit.js';
import { icon } from '../../icons.js';
import { act } from '../play/actions.js';
import { itemParts } from '../play/sheet_char.js';
import { render } from '../play/shell.js';
import { boonContent } from './boon.js';
import { MOOD_WORD, actIcon, ask, dimBtn, footRow, goldEl, itemArt, moodOf, moodTag, nativeArt, plural, say, seg, skipBtn, tick, twoLine } from './common.js';

// (a Trouble or an Opportunity throws again: in Story both rolls carry the group's name, so the later one is labelled "Thrown again" rather than repeating it)
export const offerDice = (G, p) => {
    const rs = rollsByIds(G.st, p.rollIds); if (!rs.length) return null;
    const rows = rs.map(r => rollRow(r)), seen = new Set();
    rows.forEach(row => { const w = row.querySelector('.rr-what'), t = w?.firstChild; if (!t) return; if (seen.has(t.nodeValue)) t.nodeValue = 'Thrown again'; else seen.add(t.nodeValue); });
    return h('div', { class: 'offerdice kit-dice' }, ...rows);
};

// ---- an insult or a challenge (trade and hire alike): pay to smooth it over, or they bar your way ----
export function insultContent(G, p, kind) {
    const can = canPayOffer(G.st, p), noun = p.insult === 'Insult' ? 'Notoriety' : 'Fame';
    // (the choice and what each side costs are one line in the foot, above the buttons: it is never below the fold)
    const note = can ? `Pay 5 ${noun} to calm things. Refusing means they bar your way, and you fight.` : 'Under the Disgust curse you cannot pay Fame, so they bar your way and you fight.';
    const body = h('div', { class: 'kit kit-insult' }, offerDice(G, p) ?? (p.rollNote ?? p.why ? h('p', { class: 'ds-meta' }, p.rollNote ?? p.why) : null),
        ask(can ? `The ${p.group} are offended.` : `The ${p.group} challenge you.`));
    const fight = h('button', { type: 'button', class: can ? 'ds-btn' : 'ds-btn primary', onclick: () => act(G, { type: kind, act: 'fight' }) }, can ? 'Refuse' : 'Fight');
    const foot = footRow({ note, secondary: can ? fight : null,
        primary: can ? h('button', { type: 'button', class: 'ds-btn primary', onclick: () => act(G, { type: kind, act: 'pay' }) }, `Pay 5 ${noun}`) : fight });
    return { title: `${p.group}: ${p.insult}!`, body, foot, decision: true };
}

// ---- paying with your things (rule 7.6.5c: belongings count at their basic Gold price, no change is given) ----
// payBlock(G, p) -> { node, chosen: [uid], goldDue, ok, short, over, things }
export function payBlock(G, p, { why = true } = {}) {
    const mine = sellable(G.st, G.data), chosen = new Set((G.ui.payWith ?? []).filter(u => mine.some(m => m.uid === u)));
    const worth = mine.filter(m => chosen.has(m.uid)).reduce((n, m) => n + m.price, 0);
    const goldDue = Math.max(0, p.price - worth), ok = G.st.ch.gold >= goldDue, short = goldDue - G.st.ch.gold, over = Math.max(0, worth - p.price);
    const toggle = uid => { const set = new Set(G.ui.payWith ?? []); set.has(uid) ? set.delete(uid) : set.add(uid); G.ui.payWith = [...set]; render(G); };
    const open = chosen.size > 0 || !ok;          // folded away while gold alone pays: a press of the summary opens the things
    const node = h('div', { class: 'kit-pay' },
        mine.length ? h('details', { class: 'kit-detail kit-things', open: open ? '' : null }, h('summary', {}, `Pay with your things? (you have ${G.st.ch.gold} Gold)`),
            h('div', { class: 'ds-list' }, mine.map(m => {
                const it = G.st.ch.items.find(i => i.uid === m.uid), on = chosen.has(m.uid);
                return h('button', { type: 'button', class: `ds-row kit-multi${on ? ' sel' : ''}`, 'data-multi': '', 'data-pay': m.uid, role: 'checkbox', 'aria-checked': on ? 'true' : 'false', onclick: () => toggle(m.uid) },
                    h('span', { class: 'art' }, it ? itemArt(G, it) : null, on ? tick() : null),
                    h('span', { class: 'main' }, h('b', {}, m.name), h('span', {}, m.active ? 'In use. It counts at its basic price.' : 'Counts at its basic price.')), h('span', { class: 'end' }, goldEl(G, m.price)));
            }), committedNote(G.st, G.data))) : null,
        h('p', { class: 'kit-sum', 'data-sum': '' }, chosen.size ? `You pay ${goldDue} Gold and ${plural(chosen.size, 'thing')}.` : `You pay ${p.price} Gold.`, over ? ` They give no change (${over} over).` : ''),
        !ok && why ? h('div', { class: 'ds-why bad' }, `You are ${short} Gold short: hand over more.`) : null);
    return { node, chosen: [...chosen], goldDue, ok, short, over, things: chosen.size };
}

// ---- the price offer: the roll, the price as the headline, what it buys, and how you pay ----
function offerContent(G, p) {
    const repay = p.repay != null, raw = !repay ? G.st.stock[p.group]?.[p.idx] : null;
    const pay = payBlock(G, p, { why: false });
    const body = h('div', { class: 'kit kit-offer' },
        offerDice(G, p) ?? h('p', { class: 'ds-meta' }, p.rollNote),
        h('div', { class: 'kit-pricebox' }, h('div', { class: 'ds-price', 'data-price': String(p.price) }, `${p.price} GOLD`, h('small', {}, `${p.base} × ${p.mult}`)),
            h(raw ? 'button' : 'div', { class: 'kit-what', ...(raw ? { type: 'button', 'data-act': 'offer-card', 'aria-expanded': G.ui.offerCard ? 'true' : 'false', 'aria-label': `About the ${p.name}`, onclick: () => { G.ui.offerCard = !G.ui.offerCard; render(G); } } : {}) },
                raw ? h('span', { class: 'ds-counter' }, itemArt(G, raw)) : null, h('div', {}, h('b', {}, repay ? `The ${p.group}’s goodwill` : p.name), h('span', { class: 'ds-meta' }, repay ? 'One roll: pay now, or it is lost for good.' : `List price ${p.base} Gold, times the roll.`)), raw ? icon(G.ui.offerCard ? 'up' : 'down') : null)),
        raw && G.ui.offerCard ? infoOf(G, raw)() : null,
        ask(repay ? `The ${p.group} will sell back their goodwill.` : `The ${p.group} name a price for the ${p.name}.`, 'Pay it in gold or with things you hand over, or turn it down.'),
        pay.node);
    const label = repay ? 'Win it back' : 'Buy it';
    const small = pay.things ? `${pay.goldDue} Gold and ${plural(pay.things, 'thing')}` : `${p.price} Gold`;
    // (why the primary is dim is in the foot, above the buttons, in red: the sheet's body is a scroll and the answer must never be below it)
    const foot = footRow({ note: pay.ok ? `Gold ${G.st.ch.gold} to ${G.st.ch.gold - pay.goldDue}` : `You are ${pay.short} Gold short: hand over more.`, bad: !pay.ok,
        secondary: h('button', { type: 'button', class: 'ds-btn', 'data-act': 'trade-decline', onclick: () => { G.ui.payWith = null; G.ui.tradeTab = null; G.ui.offerCard = false; act(G, { type: 'trade', act: 'decline' }); } }, 'Not at that price'),
        primary: pay.ok ? h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'buy-ok', onclick: () => { const items = pay.chosen; G.ui.payWith = null; G.ui.tradeTab = null; G.ui.offerCard = false; act(G, { type: 'trade', act: 'accept', items }); } }, twoLine(label, small))
            : dimBtn(G, twoLine(label, small), `You are ${pay.short} Gold short: hand over more.`, { 'data-act': 'buy-ok' }, 'primary') });
    return { title: repay ? `Win back ${p.name}` : `Buy ${p.name}`, body, foot, decision: true, detent: 'tall' };
}

// ---- one tickable row, and the little "about it" that opens what it is below the row ----
function tradeRow(G, sel, { key, it, name, line, price, unit = '', tag = '', count = 0, selected, dim = null, onSelect, info }) {
    const open = sel.info === key;
    return h('div', { class: 'kit-trow', 'data-row': key },
        h('div', { class: 'kit-trow-main' },
            h('button', { type: 'button', class: `ds-row kit-multi${selected ? ' sel' : ''}${dim ? ' dim' : ''}`, 'data-multi': '', 'data-item': key, role: 'checkbox', 'aria-checked': selected ? 'true' : 'false', onclick: () => (dim ? say(G, dim) : onSelect()) },
                h('span', { class: 'art' }, itemArt(G, it), selected ? tick() : null),
                h('span', { class: 'main' }, h('b', {}, name, count > 1 ? h('span', { class: 'ds-tag kit-tag' }, `×${count}`) : null, tag ? h('span', { class: 'ds-tag kit-tag' }, tag) : null), h('span', {}, dim ?? line)),
                h('span', { class: 'end' }, goldEl(G, price), unit ? h('small', {}, unit) : null)),
            h('button', { type: 'button', class: 'kit-info', 'aria-label': `About the ${name}`, 'aria-expanded': open ? 'true' : 'false', onclick: () => { sel.info = open ? null : key; render(G); if (!open) requestAnimationFrame(() => G.root.querySelector('.kit-infobody')?.scrollIntoView({ block: 'nearest', behavior: 'auto' })); } }, icon(open ? 'up' : 'down'))),
        open ? info() : null);
}

const infoOf = (G, it) => () => { const { card, faces, facts } = itemParts(G, it, { size: 128 }); return h('div', { class: 'kit-infobody itemsheet' }, card ?? h('div', { class: 'kit-faces' }, ...faces), ...facts.map(t => h('p', { class: 'ds-meta' }, t))); };

// ---- the Trade sheet ----
function tradeMain(G, p) {
    const goods = stockOf(G.st, G.data, p.group), mine = sellable(G.st, G.data), raws = G.st.stock[p.group] ?? [];
    const sel = (G.ui.tradePick ??= { buy: null, sell: [], info: null });
    sel.sell = sel.sell.filter(u => mine.some(m => m.uid === u));
    if (sel.buy != null && !goods.some(g => g.idx === sel.buy)) sel.buy = null;
    const fresh = !p.mode && !(p.sold?.length) && !p.drinks;
    const rel = relFor(G.st, p.group), dealt = !!p.mode || !!p.sold?.length;
    const ashes = hasCurse(G.st, 'Ashes');
    const owed = (G.st.ch.boons ?? []).map((b, n) => ({ ...b, n })).filter(b => b.group === p.group);
    const tabs = [{ key: 'buy', label: 'Buy' }, { key: 'sell', label: 'Sell' }, ...(owed.length ? [{ key: 'owed', label: 'Boons', n: owed.length }] : [])];
    let tab = G.ui.tradeTab;
    if (!tabs.some(t => t.key === tab)) tab = p.mode === 'sell' ? 'sell' : 'buy';

    const chosenSell = mine.filter(m => sel.sell.includes(m.uid)), sellSum = chosenSell.reduce((n, m) => n + m.price, 0);
    const chosenBuy = sel.buy != null ? goods.find(g => g.idx === sel.buy) : null;
    const oneOwed = G.ui.owedPick != null && owed.some(b => b.n === G.ui.owedPick) ? G.ui.owedPick : owed.length === 1 ? owed[0].n : null;
    const pickBuy = idx => { sel.buy = sel.buy === idx ? null : idx; if (sel.buy != null) sel.sell = []; render(G); };
    const pickSell = uid => { const k = sel.sell.indexOf(uid); if (k >= 0) sel.sell.splice(k, 1); else { sel.sell.push(uid); sel.buy = null; } render(G); };

    // the leader chooser: one card per leader here (the mood is on the card)
    const choices = groupChoices(p);
    const leaders = choices.length > 1 ? h('div', { class: 'kit-leaders', role: 'radiogroup' }, choices.map(c => {
        const lead = G.st.nats.find(n => !n.dead && !n.hired && n.loc?.c === G.st.ch.at && G.data.natives[n.id].group === c.group && G.data.natives[n.id].leader);
        const off = !c.canSwitch && !c.selected;
        return h('button', { type: 'button', class: `ds-group kit-leader${c.selected ? ' sel' : ''}${off ? ' dim' : ''}`, 'data-trade-group': c.group, role: 'radio', 'aria-checked': c.selected ? 'true' : 'false', 'aria-pressed': c.selected ? 'true' : 'false',
            onclick: () => { if (c.selected) return; if (off) say(G, 'You have started dealing with this leader, so the choice is made for this phase.'); else act(G, { type: 'trade', act: 'group', group: c.group }); } },
            h('span', { class: 'ds-counter sm' }, lead && nativeArt(G, lead.id) ? h('img', { src: nativeArt(G, lead.id), alt: '' }) : null), h('span', { class: 'kit-leadtxt' }, h('b', {}, c.group), moodTag(relFor(G.st, c.group))));
    })) : null;

    // drinks: they warm to you a step for this deal (only a deal that rolls: buying, or buying back a favour)
    const cost = drinksCost(G.st, G.data, p.group);
    const drinksWhy = ashes ? 'Your gold is worthless under the Ashes curse.' : dealt && p.mode === 'sell' ? 'Drinks come before the deal, and you have already sold.' : G.st.ch.gold < cost ? `A round costs ${cost} Gold and you have ${G.st.ch.gold}.` : null;
    const moodNow = moodOf(p.drinks ? Math.min(2, rel + 1) : rel), moodWord = MOOD_WORD[moodNow];
    const drinksRow = p.drinks
        ? h('div', { class: 'ds-row sel kit-round', 'data-drinks-bought': '' }, h('span', { class: 'art' }, actIcon('trade', 28), tick()), h('span', { class: 'main' }, h('b', {}, 'Round bought'), h('span', {}, `The ${p.group} are ${moodWord} for this deal.`)), h('span', { class: 'end' }, goldEl(G, p.drinksCost ?? cost)))
        : h('button', { type: 'button', class: `ds-row kit-round${drinksWhy ? ' dim' : ''}`, 'data-act': 'drinks', 'aria-disabled': drinksWhy ? 'true' : null, onclick: () => (drinksWhy ? say(G, drinksWhy) : act(G, { type: 'trade', act: 'drinks' })) },
            h('span', { class: 'art' }, actIcon('trade', 28)), h('span', { class: 'main' }, h('b', {}, `Stand the ${p.group} a round`), h('span', {}, `${moodWord} now. A round warms them a step for this deal.`)), h('span', { class: 'end' }, goldEl(G, cost)));

    // the rows of the room
    let rows;
    if (tab === 'buy') {
        const seen = new Map();
        goods.forEach(g => { const raw = raws[g.idx] ?? {}, k = `${g.kind}:${g.id}:${raw.damaged ? 1 : 0}:${raw.card ?? ''}`; (seen.get(k) ?? seen.set(k, { ...g, raw, idxs: [] }).get(k)).idxs.push(g.idx); });
        const list = [...seen.values()];
        rows = list.length ? list.map(g => tradeRow(G, sel, { key: `buy:${g.idxs[0]}`, it: { ...g.raw, kind: g.kind, id: g.id }, name: g.name, line: 'The roll sets the price.', price: g.base, unit: 'list', tag: g.raw.damaged ? 'damaged' : '', count: g.idxs.length, selected: g.idxs.includes(sel.buy),
            dim: p.mode === 'sell' ? 'A phase is selling or buying, not both.' : null, onSelect: () => pickBuy(g.idxs.includes(sel.buy) ? sel.buy : g.idxs[0]), info: infoOf(G, { ...g.raw, kind: g.kind, id: g.id }) }))
            : [h('p', { class: 'kit-none' }, 'Nothing for sale.')];
        // 7.2.4h: a foe of the campaign he carries is an Enemy, and he cannot buy it drinks: the button is not offered, and the sheet says why
        const foe = !!G.st.missions && noDrinks(G.st, p.group);
        rows = [foe ? h('p', { class: 'ds-why ms-foe', 'data-foe': p.group }, `The ${p.group} are foes of your campaign: they stand as Enemies, and you cannot buy them drinks.`) : drinksRow, ...rows];
    } else if (tab === 'owed') {
        rows = owed.map(b => h('button', { type: 'button', class: `ds-row kit-multi${oneOwed === b.n ? ' sel' : ''}${p.mode === 'sell' ? ' dim' : ''}`, 'data-multi': '', 'data-owed': String(b.n), role: 'radio', 'aria-checked': oneOwed === b.n ? 'true' : 'false',
            onclick: () => { if (p.mode === 'sell') say(G, 'A phase is selling or buying, not both.'); else { G.ui.owedPick = b.n; render(G); } } },
            h('span', { class: 'art' }, itemArt(G, { kind: 'treasure', id: '' }), oneOwed === b.n ? tick() : null),
            h('span', { class: 'main' }, h('b', {}, `The ${b.group}’s ${b.what}`), h('span', {}, 'One roll to buy their goodwill back; if you do not, it is lost for good.')), h('span', { class: 'end' }, goldEl(G, b.price))));
    } else {
        rows = mine.length ? mine.map(m => { const it = G.st.ch.items.find(i => i.uid === m.uid); return tradeRow(G, sel, { key: `sell:${m.uid}`, it, name: m.name, line: m.active ? `In use: selling it leaves ${it.kind === 'weapon' ? 'you unarmed' : 'the slot empty'}.` : 'Sells at its basic price.', price: m.price, unit: 'sells', tag: it.damaged ? 'damaged' : '',
            selected: sel.sell.includes(m.uid), dim: p.mode === 'buy' ? 'A phase is selling or buying, not both.' : null, onSelect: () => pickSell(m.uid), info: infoOf(G, it) }); }) : [h('p', { class: 'kit-none' }, 'You have nothing to sell.')];
        const held = committedNote(G.st, G.data);          // 6.2.4d: what a recorded extra phase needs is not on the list, and the list says so
        if (held) rows.push(held);
    }

    // the foot: what will happen, and the one button
    const go = () => {
        if (chosenBuy) { const idx = sel.buy; G.ui.tradePick = null; act(G, { type: 'trade', act: 'buy', idx }); }
        else if (chosenSell.length) { const items = chosenSell.map(m => m.uid); G.ui.tradePick = null; act(G, { type: 'trade', act: 'sell', items }); }
    };
    const done = cls => h('button', { type: 'button', class: `ds-btn ${cls}`, 'data-act': 'trade-done', onclick: () => { G.ui.tradePick = null; G.ui.tradeTab = null; G.ui.owedPick = null; act(G, { type: 'trade', act: 'done' }); } }, 'Done');
    const cancel = fresh ? h('button', { type: 'button', class: 'ds-btn', 'data-act': 'trade-cancel', onclick: () => { G.ui.tradePick = null; G.ui.tradeTab = null; G.ui.owedPick = null; act(G, { type: 'trade', act: 'back' }); } }, 'Cancel') : done('');
    // a planned Trade can be passed: nothing to trade, or nothing worth it. The engine's own answer for "no deal" is `done` ("You decide not to trade with the Order").
    const skip = fresh ? skipBtn(() => { G.ui.tradePick = null; G.ui.tradeTab = null; G.ui.owedPick = null; act(G, { type: 'trade', act: 'done' }); }) : null;
    let note = null, primary = null, secondary = cancel;
    if (tab === 'owed') {
        const b = owed.find(x => x.n === oneOwed);
        note = b ? h('span', {}, h('b', {}, `Win back the ${b.group}’s goodwill`), h('br'), 'One roll: it comes as a price, or it is lost.') : 'Tick the favour you want to win back.';
        primary = b && p.mode !== 'sell' ? h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'repay', onclick: () => act(G, { type: 'trade', act: 'repay', n: b.n }) }, twoLine('Win it back', 'roll for the price'))
            : dimBtn(G, 'Choose a favour', p.mode === 'sell' ? 'A phase is selling or buying, not both.' : 'Tick the favour you want to win back.', { 'data-act': 'repay' }, 'primary');
    } else if (chosenBuy) {
        note = ashes ? 'Your gold is worthless under the Ashes curse: nobody will sell to you.' : h('span', {}, h('b', {}, `Ask for the ${chosenBuy.name}`), h('br'), 'They name the price when you ask.');
        primary = ashes ? dimBtn(G, twoLine('Ask for it', 'roll for the price'), 'Your gold is worthless under the Ashes curse: nobody will sell to you.', { 'data-act': 'trade-go' }, 'primary')
            : h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'trade-go', onclick: go }, twoLine('Ask for it', 'roll for the price'));
    } else if (chosenSell.length) {
        const weaponOut = chosenSell.some(m => G.st.ch.items.find(i => i.uid === m.uid)?.active);
        note = h('span', {}, h('b', {}, `Selling ${chosenSell.length === 1 ? chosenSell[0].name : plural(chosenSell.length, 'thing')}`), h('br'), `Gold ${G.st.ch.gold} to ${G.st.ch.gold + sellSum}`, weaponOut ? ' · it is in use' : '');
        primary = h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'trade-go', onclick: go }, `Sell ${plural(chosenSell.length, 'thing')} \u00B7 ${sellSum} Gold`);
    } else if (dealt) {
        note = p.mode === 'sell' ? `You have sold ${plural(p.sold.length, 'thing')} so far. Sell more, or press Done.` : 'You have begun dealing, so this phase can only be finished.';
        primary = done('primary'); secondary = null;
    } else {
        note = 'Tick what to sell, or one thing to buy.';
        primary = dimBtn(G, 'Choose something', 'Tick something first: nothing is sold or bought until you press the button.', { 'data-act': 'trade-go' }, 'primary');
    }
    const body = h('div', { class: 'kit trade' },
        ask(`Trade with the ${p.group}.`, 'Sell as much as you like, or buy one thing: the roll sets the price.'),
        leaders, rel <= -2 ? h('div', { class: 'ds-why bad' }, 'They are your enemies: expect an insult or a fight, not a price.') : null,
        seg(tabs, tab, k => { G.ui.tradeTab = k; sel.info = null; sel.sell = []; sel.buy = null; render(G); }, 'data-trade-tab'),          // (what was ticked in one room is not carried into the next)
        h('div', { class: 'ds-list kit-rows', 'data-tab': tab }, rows));
    return { title: 'Trade', eyebrow: nameOfClearing(G.st.ch.at), body, foot: footRow({ note, aside: skip, secondary, primary }), decision: true, detent: 'tall' };
}

// tradeContent(G, p) -> { title, eyebrow, body, foot, decision }
export function tradeContent(G, p) {
    if (p.type === 'trade-offer') {
        if (p.insult) return insultContent(G, p, 'trade');
        return p.boon ? boonContent(G, p, 'trade') : offerContent(G, p);
    }
    return tradeMain(G, p);
}
