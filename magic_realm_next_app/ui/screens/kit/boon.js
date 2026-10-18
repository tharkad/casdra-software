// screens/kit/boon.js (P2): a boon offer (a Meeting Table roll of Boon while trading or hiring): the favour is the hero. What you get leads, what it costs follows in one line, and
// taking it as a boon is the primary; paying for it instead is the quiet button beside it. Payloads are the old sheet's: { type: 'trade' | 'hire', act: 'accept', boon: true } /
// { act: 'accept', items } (trade) / { act: 'accept' } (hire) / { act: 'decline' }.
import { act } from '../play/actions.js';
import { h } from '../../dom.js';
import { art } from '../../icons.js';
import { nativeArt, ask, dimBtn, footRow, itemArt } from './common.js';
import { offerDice, payBlock } from './trade.js';

// boonContent(G, p, kind) -> { title, eyebrow, body, foot, decision }
export function boonContent(G, p, kind) {
    const trade = kind === 'trade', raw = trade ? G.st.stock[p.group]?.[p.idx] : null;
    const hero = trade
        ? h('div', { class: 'kit-hero' }, raw ? h('span', { class: 'ds-counter lg' }, itemArt(G, raw)) : null, h('div', {}, h('div', { class: 'ds-h2 kit-heroname' }, p.name), h('span', { class: 'ds-meta' }, `Worth ${p.base} Gold.`)))
        : h('div', { class: 'kit-hero' }, h('div', { class: 'cs' }, (p.members ?? []).map(id => h('span', { class: 'ds-counter tall' }, nativeArt(G, id) ? art(nativeArt(G, id).replace(/^art\//, ''), '', '') : null))),
            h('div', {}, h('div', { class: 'ds-h2 kit-heroname' }, p.names.length === 1 ? p.names[0] : `The ${p.group}`), h('span', { class: 'ds-meta' }, `Wages ${p.wage} Gold. Hired for 14 days.`)));
    const pay = trade ? payBlock(G, p) : null;
    const payOk = trade ? pay.ok : p.affordable, short = trade ? pay.short : p.price - G.st.ch.gold;
    const body = h('div', { class: 'kit kit-boon' },
        offerDice(G, p) ?? (p.rollNote ?? p.why ? h('p', { class: 'ds-meta' }, p.rollNote ?? p.why) : null),
        hero,
        h('p', { class: 'ds-voice lg kit-fav' }, trade ? `The ${p.group} will let you have the ${p.name} as a favour.` : `${p.names.length === 1 ? p.names[0] : `The ${p.group}`} will join you as a favour.`),
        ask('You would owe them one.', `The ${p.group} think a little less of you until you win it back in a Trade phase.`),
        trade ? h('details', { class: 'kit-detail kit-orpay', open: G.ui.payWith?.length ? '' : null }, h('summary', {}, `Or pay for it: ${p.price} gold`), pay.node) : null,
        h('button', { type: 'button', class: 'ds-btn sm quiet kit-turndown', 'data-act': 'boon-decline', onclick: () => { G.ui.payWith = null; act(G, { type: kind, act: 'decline' }); } }, 'Turn it down'));
    const price = trade ? pay.goldDue : p.price, label = `Pay ${price}g`;
    const payBtn = payOk ? h('button', { type: 'button', class: 'ds-btn', 'data-act': trade ? 'buy-ok' : 'hire-pay', onclick: () => { const items = trade ? pay.chosen : null; G.ui.payWith = null; act(G, trade ? { type: 'trade', act: 'accept', items } : { type: 'hire', act: 'accept' }); } }, label)
        : dimBtn(G, label, `Pay ${price} Gold instead? You have ${G.st.ch.gold}${trade && G.st.ch.items.length ? ': hand over things to cover the rest' : ''}.`, { 'data-act': trade ? 'buy-ok' : 'hire-pay' });
    const foot = footRow({ note: null, secondary: payBtn,
        primary: h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'take-boon', onclick: () => { G.ui.payWith = null; act(G, { type: kind, act: 'accept', boon: true }); } }, 'Take it as a boon') });
    return { title: 'A favour', eyebrow: `The ${p.group}`, body, foot, decision: true, detent: 'tall' };
}

