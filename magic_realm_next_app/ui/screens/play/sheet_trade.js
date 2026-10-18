// play/sheet_trade.js: the trade and hire sheets (buying, selling, paying with goods, drinks, boons, hiring natives).
import { drinksCost } from '../../../engine/meeting.js';
import { REL_NAMES } from '../../../engine/tables.js';
import { canPayOffer, groupChoices, sellable, stockOf } from '../../../engine/trade.js';
import { nameOfClearing } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { rollRow, rollsByIds } from '../../dice.js';
import { h } from '../../dom.js';
import { act } from './actions.js';
import { ico, modal, nativePic } from './kit.js';
import { itemParts } from './sheet_char.js';
import { render } from './shell.js';

function offerDice(G, p) { const rs = rollsByIds(G.st, p.rollIds); return rs.length ? h('div', { class: 'offerdice' }, ...rs.map(r => rollRow(r))) : null; }

const c0Hint = choices => choices.some(c => c.canSwitch) ? 'More than one leader is here. Pick whose goods you deal with before you sell, buy or buy drinks.' : 'You have started dealing with this leader, so the choice is made for this phase.';

export function tradeSheet(G, p) {
    if (p.type === 'trade-offer') {
        if (p.insult) {
            return modal(G, `${p.group}: ${p.insult}!`, h('div', {},
                offerDice(G, p),
                canPayOffer(G.st, p)
                    ? h('p', {}, `The ${p.group} are offended. You may pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'} to calm things, or they will block you.`)
                    : h('p', {}, `The ${p.group} challenge you. Under the Disgust curse you cannot pay Fame, so they will block you and fight.`),
                canPayOffer(G.st, p) ? h('button', { class: 'btn', onclick: () => act(G, { type: 'trade', act: 'pay' }) }, `Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'}`) : null,
                h('button', { class: 'btn', onclick: () => act(G, { type: 'trade', act: 'fight' }) }, canPayOffer(G.st, p) ? 'Refuse' : 'Fight')));
        }
        // Rule 7.6.5c: belongings may make up part or all of the price at their basic Gold price; no change is given.
        const mine = sellable(G.st, G.data), chosen = new Set((G.ui.payWith ?? []).filter(u => mine.some(m => m.uid === u)));
        const worth = mine.filter(m => chosen.has(m.uid)).reduce((n, m) => n + m.price, 0);
        const goldDue = Math.max(0, p.price - worth), ok = G.st.ch.gold >= goldDue;
        const short = goldDue - G.st.ch.gold;
        return modal(G, p.repay != null ? `Win back ${p.name}` : `Buy ${p.name}`, h('div', { class: 'trade' },
            ask(p.repay != null ? `The ${p.group} will sell back their goodwill for ${p.price} gold.` : `The ${p.group} will sell you ${p.name} for ${p.price} gold.`,
                'That price came from your roll on the Meeting Table. Accept to pay it (in gold, or with things you hand over), or say no thanks and keep what you have.'),
            offerDice(G, p) ?? h('p', {}, p.rollNote),
            h('p', { class: 'bigline' }, `${p.price} gold`, h('small', {}, ` (${p.base} x ${p.mult})`)),
            p.repay != null ? h('p', { class: 'hint' }, `This is your one chance to buy back the level the boon cost you: pay now, or it is lost for good.`) : null,
            p.boon ? h('div', {},
                h('p', { class: 'hint' }, `It is a boon: you may take it free. The ${p.group} will think one level less of you until you buy that level back from them in a Trade phase.`),
                h('button', { class: 'btn', 'data-act': 'take-boon', onclick: () => { G.ui.payWith = null; act(G, { type: 'trade', act: 'accept', boon: true }); } }, 'Take it as a boon (free)')) : null,
            mine.length ? h('div', {},
                h('h3', {}, 'Pay with your things?'),
                h('p', { class: 'hint' }, `You have ${G.st.ch.gold} gold. Anything you hand over counts at its basic price, and they give no change.`),
                ...mine.map(m => h('button', { class: `btn row${chosen.has(m.uid) ? ' on' : ''}`, 'data-pay': m.uid, onclick: () => {
                    const set = new Set(G.ui.payWith ?? []); set.has(m.uid) ? set.delete(m.uid) : set.add(m.uid); G.ui.payWith = [...set]; render(G);
                } }, ico(G, m.name), h('span', { class: 'rl' }, h('b', {}, `${chosen.has(m.uid) ? '\u2713 ' : ''}${m.name}`), h('small', {}, m.sub)), h('em', {}, `${m.price}g`)))) : null,
            h('p', { class: 'bigline' }, chosen.size ? `You pay ${goldDue} gold plus ${chosen.size} thing${chosen.size === 1 ? '' : 's'}` : `You pay ${p.price} gold`,
                worth > p.price ? h('small', {}, ` (${worth - p.price} gold over: no change)`) : null),
            !ok ? h('p', { class: 'hint' }, `You are ${short} gold short: hand over more.`) : null,
            h('div', { class: 'row2' },
                h('button', { class: 'btn primary', 'data-act': 'buy-ok', disabled: !ok, onclick: () => { const items = [...chosen]; G.ui.payWith = null; act(G, { type: 'trade', act: 'accept', items }); } }, p.repay != null ? 'Pay' : p.boon ? `Pay ${p.price} gold` : 'Buy'),
                h('button', { class: 'btn', onclick: () => { G.ui.payWith = null; act(G, { type: 'trade', act: 'decline' }); } }, 'No thanks'))));
    }
    const goods = stockOf(G.st, G.data, p.group), mine = sellable(G.st, G.data);
    const sel = (G.ui.tradePick ??= { buy: null, sell: [], info: null });
    sel.sell = sel.sell.filter(u => mine.some(m => m.uid === u));
    if (sel.buy != null && !goods.some(g => g.idx === sel.buy)) sel.buy = null;
    const fresh = !p.mode && !(p.sold?.length) && !p.drinks;
    const chosenSell = mine.filter(m => sel.sell.includes(m.uid)), sellSum = chosenSell.reduce((n, m) => n + m.price, 0);
    const chosenBuy = sel.buy != null ? goods.find(g => g.idx === sel.buy) : null;
    const pickBuy = idx => { sel.buy = sel.buy === idx ? null : idx; if (sel.buy != null) sel.sell = []; render(G); };
    const pickSell = uid => { const k = sel.sell.indexOf(uid); if (k >= 0) sel.sell.splice(k, 1); else { sel.sell.push(uid); sel.buy = null; } render(G); };
    const infoOf = it => { const { card, faces, facts } = itemParts(G, it); return h('div', { class: 'ti-info itemsheet' }, card ?? h('div', { class: 'faces' }, ...faces), ...facts.map(t => h('p', {}, t))); };
    // one row: a box to select it, and the rest of the row opens what it is
    const item = ({ key, name, sub, price, selected, disabled, onSelect, info }) => h('div', { class: `tradeitem${selected ? ' sel' : ''}${disabled ? ' off' : ''}`, 'data-item': key },
        h('div', { class: 'ti-row' },
            h('button', { class: 'ti-check', role: 'checkbox', 'aria-checked': selected ? 'true' : 'false', 'aria-label': `${selected ? 'Deselect' : 'Select'} ${name}`, disabled: disabled || null, onclick: onSelect }, selected ? '\u2713' : ''),
            h('button', { class: 'ti-body', 'aria-expanded': sel.info === key ? 'true' : 'false', onclick: () => { sel.info = sel.info === key ? null : key; render(G); } },
                ico(G, name), h('span', { class: 'rl' }, h('b', {}, name), h('small', {}, sub)), h('em', {}, `${price}g`), h('span', { class: 'ti-i', 'aria-hidden': 'true' }, sel.info === key ? '\u25BE' : '\u25B8'))),
        sel.info === key ? info : null);
    const summary = chosenBuy ? `Buy the ${chosenBuy.name}. Its price comes from a roll on the Meeting Table (basic ${chosenBuy.base} gold).`
        : chosenSell.length ? `Sell ${chosenSell.length} thing${chosenSell.length === 1 ? '' : 's'} for ${sellSum} gold.`
            : p.mode === 'sell' ? `You have sold ${p.sold.length} thing${p.sold.length === 1 ? '' : 's'} so far. Sell more, or press Done.`
                : 'Tick the things you want to sell, or one thing to buy. Tap a name to see what it is.';
    const go = () => {
        if (chosenBuy) { const idx = sel.buy; G.ui.tradePick = null; act(G, { type: 'trade', act: 'buy', idx }); }
        else if (chosenSell.length) { const items = chosenSell.map(m => m.uid); G.ui.tradePick = null; act(G, { type: 'trade', act: 'sell', items }); }
    };
    const tradeBar = h('div', { class: 'trade-bar' },
            h('p', { class: 'tb-sum', 'data-trade-summary': '1' }, summary),
            h('div', { class: 'row-end tb-actions' },
                fresh ? h('button', { class: 'btn', 'data-act': 'trade-cancel', onclick: () => { G.ui.tradePick = null; act(G, { type: 'trade', act: 'back' }); } }, 'Cancel')
                    : h('button', { class: 'btn', 'data-act': 'trade-done', onclick: () => { G.ui.tradePick = null; act(G, { type: 'trade', act: 'done' }); } }, 'Done'),
                h('button', { class: 'btn primary', 'data-act': 'trade-go', disabled: !(chosenBuy || chosenSell.length) || null, onclick: go },
                    chosenBuy ? `Buy ${chosenBuy.name}` : chosenSell.length ? `Sell ${chosenSell.length} for ${sellSum}g` : 'Choose first')),
            fresh ? null : h('p', { class: 'hint' }, 'You have begun dealing, so this phase can only be finished.'));
    return modal(G, `Trade with the ${p.group}`, h('div', { class: 'trade' },
        ask(`Trade phase with the ${p.group} at ${nameOfClearing(G.st.ch.at)}.`, 'Sell any number of things at their basic price, or buy one thing: a purchase is priced by a roll on the Meeting Table, so how they feel about you matters.', { compact: true }),
        ...(() => {
            const choices = groupChoices(p);
            return choices.length > 1 ? [h('h3', {}, 'Trade with'),
                h('div', { class: 'row2 grouppick' }, ...choices.map(c => h('button', { class: `btn${c.selected ? ' on' : ''}`, 'data-trade-group': c.group, 'aria-pressed': c.selected, disabled: !c.canSwitch && !c.selected,
                    onclick: () => { if (!c.selected) act(G, { type: 'trade', act: 'group', group: c.group }); } }, `${c.selected ? '\u2713 ' : ''}${c.group}`))),
                h('p', { class: 'hint' }, c0Hint(choices))] : [];
        })(),
        h('p', { class: 'hint' }, `Relationship: ${REL_NAMES[String(G.st.ch.rel?.[p.group] ?? 0)]}. You have ${G.st.ch.gold} gold.${(G.st.ch.rel?.[p.group] ?? 0) <= -2 ? ' They are your enemies: expect an insult or a fight, not a price.' : ''}`),
        ...(() => {
            const cost = drinksCost(G.st, G.data, p.group), owed = (G.st.ch.boons ?? []).map((b, n) => ({ ...b, n })).filter(b => b.group === p.group);
            return [
                p.drinks ? h('p', { class: 'hint' }, `You have bought drinks for the ${p.group} (${p.drinksCost} gold): they count one level friendlier this phase.`)
                    : h('button', { class: 'btn row', 'data-act': 'drinks', disabled: p.mode === 'sell' || G.st.ch.gold < cost, onclick: () => act(G, { type: 'trade', act: 'drinks' }) },
                        h('span', { class: 'rl' }, h('b', {}, 'Buy drinks'), h('small', {}, `one gold for each of them here; one level friendlier for this phase's deal`)), h('em', {}, `${cost}g`)),
                ...(owed.length ? [h('h3', {}, 'Boons you owe'),
                    ...owed.map(b => h('button', { class: 'btn row', 'data-act': 'repay', disabled: p.mode === 'sell', onclick: () => act(G, { type: 'trade', act: 'repay', n: b.n }) },
                        h('span', { class: 'rl' }, h('b', {}, `Win back goodwill: ${b.what}`), h('small', {}, `one roll only; if you do not buy the level back now, it is lost for good`)), h('em', {}, `${b.price}g`)))] : []),
            ];
        })(),
        h('h3', {}, 'For sale'),
        ...(goods.length ? goods.map(g => item({ key: `buy:${g.idx}`, name: g.name, sub: g.sub, price: g.base, selected: sel.buy === g.idx, disabled: p.mode === 'sell', onSelect: () => pickBuy(g.idx), info: infoOf({ kind: g.kind, id: g.id }) })) : [h('p', { class: 'hint' }, 'Nothing for sale.')]),
        h('h3', {}, 'Yours'),
        ...(mine.length ? mine.map(m => item({ key: `sell:${m.uid}`, name: m.name, sub: m.sub, price: m.price, selected: sel.sell.includes(m.uid), disabled: p.mode === 'buy', onSelect: () => pickSell(m.uid), info: infoOf(G.st.ch.items.find(i => i.uid === m.uid)) })) : [h('p', { class: 'hint' }, 'You have nothing to sell.')])
        ), { footer: tradeBar });
}

export function hireSheet(G, p) {
    if (p.type === 'hire-offer') {
        if (p.insult) return modal(G, `${p.group}: ${p.insult}!`, h('div', {},
            offerDice(G, p),
            canPayOffer(G.st, p)
                ? h('p', {}, `The ${p.group} are offended. Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'} to calm things, or they block you.`)
                : h('p', {}, `The ${p.group} challenge you. Under the Disgust curse you cannot pay Fame, so they will block you and fight.`),
            canPayOffer(G.st, p) ? h('button', { class: 'btn', onclick: () => act(G, { type: 'hire', act: 'pay' }) }, `Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'}`) : null,
            h('button', { class: 'btn', onclick: () => act(G, { type: 'hire', act: 'fight' }) }, canPayOffer(G.st, p) ? 'Refuse' : 'Fight')));
        return modal(G, `Hire ${p.names.length === 1 ? p.names[0] : 'the ' + p.group}`, h('div', {},
            ask(`${p.names.length === 1 ? p.names[0] : 'The ' + p.group} will join you for ${p.price} gold.`, 'That is their wages times your Meeting Table roll. Hire them to pay it now, or say no thanks and keep your gold.'),
            offerDice(G, p) ?? h('p', {}, p.why),
            h('p', { class: 'bigline' }, `${p.price} gold`, h('small', {}, ` (wages ${p.wage} x ${p.mult})`)),
            p.boon ? h('div', {},
                h('p', { class: 'hint' }, `It is a boon: they will join you free, but the ${p.group} will think one level less of you until you buy that level back from their leader in a Trade phase.`),
                h('button', { class: 'btn', 'data-act': 'take-boon', onclick: () => act(G, { type: 'hire', act: 'accept', boon: true }) }, 'Take it as a boon (free)')) : null,
            h('p', { class: 'hint' }, 'Hired for 14 days. They follow you and fight beside you.'),
            h('div', { class: 'row2' },
                h('button', { class: 'btn primary', disabled: !p.affordable, onclick: () => act(G, { type: 'hire', act: 'accept' }) }, p.boon ? `Pay ${p.price} gold` : 'Hire'),
                h('button', { class: 'btn', onclick: () => act(G, { type: 'hire', act: 'decline' }) }, 'No thanks'))));
    }
    return modal(G, 'Hire', h('div', {},
        ask(`Hire phase at ${nameOfClearing(G.st.ch.at)}: choose whom to ask.`, 'Hired natives follow you and fight beside you for 14 days. You pay their wages multiplied by a roll on the Meeting Table, so you see the price only after you choose a group.'),
        h('p', { class: 'hint' }, `You have ${G.st.ch.gold} gold. The price is the wages times a roll on the Meeting Table. Relationships: ${p.options.map(o => `${o.group} ${REL_NAMES[String(G.st.ch.rel?.[o.group] ?? 0)]}`).join(', ')}.`),
        h('button', { class: 'btn row' + (G.ui.drinks ? ' on' : ''), 'data-act': 'drinks-toggle', onclick: () => { G.ui.drinks = !G.ui.drinks; render(G); } },
            h('span', { class: 'rl' }, h('b', {}, `${G.ui.drinks ? '\u2713 ' : ''}Buy drinks first`), h('small', {}, 'one gold for each of them here, hired or not; one level friendlier for the roll')), h('em', {}, G.ui.drinks ? 'on' : 'off')),
        ...p.options.map(o => { const dc = drinksCost(G.st, G.data, o.group); return h('button', { class: 'btn row', disabled: G.ui.drinks && G.st.ch.gold < dc, onclick: () => { const drinks = !!G.ui.drinks; G.ui.drinks = false; act(G, { type: 'hire', act: 'pick', group: o.group, rehire: !!o.rehire, drinks }); } },
            nativePic(G, o.members?.[0]) ? h('img', { class: 'ico', src: nativePic(G, o.members[0]), alt: '' }) : null, h('span', { class: 'rl' }, h('b', {}, `${o.group}${o.rehire ? ' (extend hire)' : ''}`), h('small', {}, o.names.join(', ') + (G.ui.drinks ? ` (drinks ${dc}g)` : ''))), h('em', {}, `wages ${o.wage}g`)); }),
        h('button', { class: 'btn', 'data-act': 'hire-back', onclick: () => act(G, { type: 'hire', act: 'back' }) }, 'Back')));
}
