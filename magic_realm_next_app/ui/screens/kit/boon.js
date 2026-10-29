// screens/kit/boon.js (P2): a boon offer (a Meeting Table roll of Boon while trading or hiring): the favour is the hero. What you get leads, what it costs follows in one line, and
// taking it as a boon is the primary; paying for it instead is the quiet button beside it. Payloads are the old sheet's: { type: 'trade' | 'hire', act: 'accept', boon: true } /
// { act: 'accept', items } (trade) / { act: 'accept' } (hire) / { act: 'decline' }.
import { act } from '../play/actions.js';
import { h } from '../../dom.js';
import { art } from '../../icons.js';
import { nativeArt, ask, dimBtn, footRow, itemArt } from './common.js';
import { tieNumber } from '../../names.js';
import { offerDice, payBlock } from './trade.js';
import { isVisitorName, spellBoonBits } from './visitors.js';

// boonContent(G, p, kind) -> { title, eyebrow, body, foot, decision }
export function boonContent(G, p, kind) {
    const trade = kind === 'trade', raw = trade ? G.st.stock[p.group]?.[p.idx] : null, sb = trade && p.spell != null ? spellBoonBits(G, p) : null;          // (a visitor's Spell card: visitors.js)
    const hero = trade
        ? h('div', { class: 'kit-hero' }, raw ? h('span', { class: 'ds-counter lg' }, itemArt(G, raw)) : sb?.art ?? null, h('div', {}, h('div', { class: 'ds-h2 kit-heroname' }, p.name), h('span', { class: 'ds-meta' }, `Worth ${p.base} Gold.`)))
        : h('div', { class: 'kit-hero' }, h('div', { class: 'cs' }, (p.members ?? []).map(id => h('span', { class: 'ds-counter tall' }, nativeArt(G, id) ? art(nativeArt(G, id).replace(/^art\//, ''), '', '') : null))),
            h('div', {}, h('div', { class: 'ds-h2 kit-heroname' }, p.names.length === 1 ? tieNumber(p.names[0]) : `The ${p.group}`), h('span', { class: 'ds-meta' }, `Wages ${p.wage} Gold. Hired for 14 days.`)));
    const pay = trade ? payBlock(G, p) : null;
    const payOk = trade ? pay.ok && !sb?.block : p.affordable, short = trade ? pay.short : p.price - G.st.ch.gold;
    const body = h('div', { class: 'kit kit-boon' },
        offerDice(G, p) ?? (p.rollNote ?? p.why ? h('p', { class: 'ds-meta' }, p.rollNote ?? p.why) : null),
        hero,
        h('p', { class: 'ds-voice lg kit-fav' }, trade ? `The ${p.group} will let you have the ${p.name} as a favour.` : `${p.names.length === 1 ? tieNumber(p.names[0]) : `The ${p.group}`} will join you as a favour.`),
        ...(sb?.node ?? []),
        ask('You would owe them one.', `The ${p.group} ${isVisitorName(p.group) ? 'thinks' : 'think'} a little less of you until you win it back in a Trade phase.`),
        trade ? h('details', { class: 'kit-detail kit-orpay', open: G.ui.payWith?.length ? '' : null }, h('summary', {}, `Or pay for it: ${p.price} Gold`), pay.node) : null,
        h('button', { type: 'button', class: 'ds-btn sm quiet kit-turndown', 'data-act': 'boon-decline', onclick: () => { G.ui.payWith = null; act(G, { type: kind, act: 'decline' }); } }, 'Turn it down'));
    const price = trade ? pay.goldDue : p.price, label = `Pay ${price} Gold`;
    const payBtn = payOk ? h('button', { type: 'button', class: 'ds-btn', 'data-act': trade ? 'buy-ok' : 'hire-pay', onclick: () => { const items = trade ? pay.chosen : null, erase = sb?.erase; G.ui.payWith = null; G.ui.spellErase = null; act(G, trade ? { type: 'trade', act: 'accept', items, ...(erase ? { erase } : {}) } : { type: 'hire', act: 'accept' }); } }, label)
        : dimBtn(G, label, `Pay ${price} Gold instead? You have ${G.st.ch.gold}${trade && G.st.ch.items.length ? ': hand over things to cover the rest' : ''}.`, { 'data-act': trade ? 'buy-ok' : 'hire-pay' });
    // DR-7: a dim Pay says why in the foot, in red, the same line the Trade and Hire feet give
    const foot = footRow({ note: sb?.block ?? (payOk ? null : `You are ${short} Gold short of paying.`), bad: !payOk || !!sb?.block, secondary: payBtn,
        primary: sb?.block ? dimBtn(G, 'Take it as a boon', sb.block, { 'data-act': 'take-boon' }, 'primary')
            : h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'take-boon', onclick: () => { G.ui.payWith = null; const erase = sb?.erase; G.ui.spellErase = null; act(G, { type: kind, act: 'accept', boon: true, ...(erase ? { erase } : {}) }); } }, 'Take it as a boon') });
    return { title: 'A favour', eyebrow: `The ${p.group}`, body, foot, decision: true, detent: 'tall' };
}

