// screens/kit/visitors.js: the VISITOR parts of the Trade sheet (rules 7.6.1 to 7.6.5, 7.6.7, 7.12.6; engine: app/engine/visitors.js, trade.js; rulings V1 to V6 in docs/rules-spec/rulings/steeds-visitors.md).
// A visitor (the Scholar, Shaman, Warlock or Crone) is not in `data.groups`: the chooser draws his chit, never a native's counter; drinks are for natives only (7.6.5b), so the sheet has no drinks
// button and says why; his goods are priced from the Visitor Prices list (the engine's `sellable(st, data, group)` and `stockOf` already carry that price, here a row says it is his);
// his Spell cards are a room of the sheet (Spells), a spell offer is a card he looks at, names, rolls for and pays 10 Gold for (basic), with a spell erased first when he knows fourteen (7.5.6g).
// Payloads are the engine's: { type: 'trade', act: 'buy', spell } then { type: 'trade', act: 'accept', items, erase? } (or { act: 'accept', boon: true, erase? } / { act: 'decline' }).
import { priceOf } from '../../../engine/items.js';
import { MAX_SPELLS } from '../../../engine/runes.js';
import { SPELL_PRICE } from '../../../engine/visitors.js';
import { voiced } from '../../commit.js';
import { h } from '../../dom.js';
import { ask } from '../../ds.js';
import { icon } from '../../icons.js';
import { synopsis } from '../../spelltext.js';
import { voicedWhy } from '../../spellwhy.js';
import { isVisitorName, learnWhy, visitorChit } from '../../steeds.js';
import { act } from '../play/actions.js';
import { render } from '../play/shell.js';
import { dimBtn, footRow, goldEl, say, tick, twoLine } from './common.js';
import { colorArt, printedOf, spellCardEl, typeTag } from './spells.js';
import { offerDice, payBlock } from './trade.js';

export { isVisitorName };

// ---- the chooser, drinks, prices ----
// The picture on a leader's card: a native leader's counter, or (a visitor, who is no native) his chit.
export const leaderArt = (G, group, nativeImg) => (isVisitorName(group) ? visitorChit(G.data, group, 'sm') : nativeImg ? h('img', { src: nativeImg, alt: '' }) : null);

// A visitor drinks with nobody (7.6.5b): the row that would offer a round is a quiet line that says so, in both voices.
export const noDrinksRow = group => voiced({
    story: `The ${group} does not drink with travellers, so there is no round to stand.`,
    detail: `Drinks can be bought only for natives, not for a visitor (7.6.5b).` }, { class: 'ds-why kit-nodrinks', 'data-nodrinks': group });

// A belonging that the visitor prices from his own list says so: "Visitor price" beside the name (the engine's price is already his).
export function visitorPriceTag(G, group, it, price) {
    if (!isVisitorName(group)) return '';
    return price !== priceOf(G.data, it) ? 'visitor price' : '';
}

// ---- his Spell cards: a room of the Trade sheet ----
export function spellsIntro(G, p) {
    return voiced({ story: `Pick one of the ${p.group}’s Spell cards and ask: you roll for the price, 10 Gold to start. The card stays with him.`,
        detail: 'He looks at the visitor\u2019s Spell cards, names one and rolls on the Meeting Table (7.6.7a); one spell a phase (7.6.7b); the card stays with the visitor (7.6.7c).' }, { class: 'ds-meta kit-spellsintro', 'data-spells-intro': '' });
}
export function spellsRoom(G, p, sel, onPick) {
    const cards = p.spells ?? [];
    return [spellsIntro(G, p), ...cards.map(c => {
        const sp = G.data.spells?.[c.id], on = sel.spell === c.id, sold = p.mode === 'sell', why = sold ? { story: 'A phase is selling or buying, not both.', detail: 'A Trade phase is selling or buying, not both (7.6.3b).' } : c.learnable ? null : learnWhy(c.why), key = `spell:${c.id}`, open = sel.info === key;
        return h('div', { class: 'kit-trow', 'data-row': key },
            h('div', { class: 'kit-trow-main' },
                h('button', { type: 'button', class: `ds-row kit-multi${on ? ' sel' : ''}${why ? ' dim' : ''}`, 'data-multi': '', 'data-spell-card': c.id, role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'aria-disabled': why ? 'true' : null,
                    onclick: () => (why ? say(G, voicedWhy(why)) : onPick(c.id)) },
                    h('span', { class: 'art' }, sp ? colorArt(sp) : icon('spark'), on ? tick() : null),
                    h('span', { class: 'main' }, h('b', {}, c.name, h('span', { class: 'ds-tag kit-tag' }, `Type ${c.type}`)), h('span', {}, sp ? synopsis(sp, printedOf(G, c.id)) : ''),
                        why ? voiced(why, { class: 'ds-why', 'data-spell-why': c.id }) : null),
                    h('span', { class: 'end' }, goldEl(G, SPELL_PRICE), h('small', {}, 'list'))),
                h('button', { type: 'button', class: 'kit-info', 'aria-label': `About the ${c.name} spell`, 'aria-expanded': open ? 'true' : 'false',
                    onclick: () => { sel.info = open ? null : key; render(G); } }, icon(open ? 'up' : 'down'))),
            open && sp ? h('div', { class: 'kit-infobody' }, spellCardEl(G, sp)) : null);
    })];
}

// The foot's note and primary for the spell ticked in the Spells room (the caller adds the Cancel / Done beside them).
export function spellFoot(G, p, card, ashes) {
    const note = ashes ? 'Your gold is worthless under the Ashes curse: nobody will sell to you.'
        : h('span', {}, h('b', {}, `Ask for ${card.name}`), h('br'), 'They name the price when you ask.');
    const label = twoLine('Buy this spell', 'roll for the price');
    const primary = ashes ? dimBtn(G, label, 'Your gold is worthless under the Ashes curse: nobody will sell to you.', { 'data-act': 'trade-go' }, 'primary')
        : h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'trade-go', 'data-spell': card.id, onclick: () => { G.ui.tradePick = null; G.ui.spellErase = null; act(G, { type: 'trade', act: 'buy', spell: card.id }); } }, label);
    return { note, primary };
}

// ---- "Erase which spell?" (7.5.6g): at fourteen spells one must go to make room ----
export const spellbookFull = G => (G.st.ch.spells ?? []).length >= MAX_SPELLS;
export function eraseBlock(G) {
    if (!spellbookFull(G)) return null;
    const ids = G.st.ch.spells ?? [], chosen = ids.includes(G.ui.spellErase) ? G.ui.spellErase : null, nameOf = id => G.data.spells?.[id]?.name ?? id;
    const node = h('div', { class: 'kit-erase', 'data-erase-block': chosen ?? '' },
        h('div', { class: 'ds-ask warn' }, h('b', {}, `You know ${MAX_SPELLS} spells: erase which one?`),
            voiced({ story: 'Your spellbook is full. One spell is wiped to make room for the new one.', detail: 'A character knows at most fourteen spells; to learn another he erases one (7.5.6g).' })),
        h('details', { class: 'kit-detail kit-erase-list', open: chosen ? null : '' }, h('summary', {}, chosen ? `Erase ${nameOf(chosen)} (tap to change)` : 'Choose the spell to erase'),
            h('div', { class: 'ds-list', role: 'radiogroup', 'aria-label': 'Erase which spell' }, ids.map(id => {
                const s2 = G.data.spells?.[id], on = chosen === id;
                return h('button', { type: 'button', class: `ds-row${on ? ' sel' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-erase': id,
                    onclick: () => { G.ui.spellErase = on ? null : id; render(G); } },
                    h('span', { class: 'art' }, s2 ? colorArt(s2) : icon('spark')), h('span', { class: 'main' }, h('b', {}, s2?.name ?? id), h('span', {}, s2 ? typeTag(s2) : '')),
                    on ? h('span', { class: 'end' }, 'erase') : null);
            }))));
    return { node, chosen, need: !chosen };
}

// ---- the offer after the roll ----
// Why the Buy button is dim, or null: a card he cannot learn, a spell still to erase, gold short.
function blocker(G, p, er, pay) {
    if (!p.learnable) return voicedWhy(learnWhy(p.why));
    if (er?.need) return 'Choose which spell to erase first: your spellbook is full.';
    if (pay && !pay.ok) return `You are ${pay.short} Gold short: hand over more.`;
    return null;
}
const hero = (G, p, sp) => h('div', { class: 'kit-what', 'data-spell-offer': p.spell },
    h('span', { class: 'ds-counter' }, sp ? colorArt(sp) : icon('spark', 'lg')),
    h('div', {}, h('b', {}, p.name), h('span', { class: 'ds-meta' }, sp ? typeTag(sp) : '')));

// spellOfferContent(G, p) -> { title, body, foot, decision, detent } for a trade-offer that is a Spell card (p.spell)
export function spellOfferContent(G, p) {
    const sp = G.data.spells?.[p.spell], pay = payBlock(G, p, { why: false }), er = eraseBlock(G);
    const why = !p.learnable ? learnWhy(p.why) : null;
    const body = h('div', { class: 'kit kit-offer kit-spelloffer' },
        offerDice(G, p) ?? h('p', { class: 'ds-meta' }, p.rollNote),
        h('div', { class: 'kit-pricebox' }, h('div', { class: 'ds-price', 'data-price': String(p.price) }, `${p.price} GOLD`, h('small', {}, `${p.base} × ${p.mult}`)), hero(G, p, sp)),
        sp ? h('p', { class: 'ds-meta' }, synopsis(sp, printedOf(G, p.spell))) : null,
        why ? voiced(why, { class: 'ds-why bad', 'data-spell-why': p.spell }) : null,
        ask(`The ${p.group} ${isVisitorName(p.group) ? 'names' : 'name'} a price for the ${p.name} spell.`, why ? 'You could not learn it, so there is nothing to buy.' : 'Pay it in gold or with things you hand over, or turn it down. The card stays with the visitor.'),
        er?.node, pay.node);
    const block = blocker(G, p, er, pay), small = pay.things ? `${pay.goldDue} Gold and ${pay.things === 1 ? '1 thing' : `${pay.things} things`}` : `${p.price} Gold`;
    const label = twoLine('Buy it', small);
    const clear = () => { G.ui.payWith = null; G.ui.tradeTab = null; G.ui.spellErase = null; G.ui.tradePick = null; };
    const foot = footRow({ note: block ?? `Gold ${G.st.ch.gold} to ${G.st.ch.gold - pay.goldDue}`, bad: !!block,
        secondary: h('button', { type: 'button', class: 'ds-btn', 'data-act': 'trade-decline', onclick: () => { clear(); act(G, { type: 'trade', act: 'decline' }); } }, 'Not at that price'),
        primary: block ? dimBtn(G, label, block, { 'data-act': 'buy-ok' }, 'primary')
            : h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'buy-ok', onclick: () => { const items = pay.chosen, erase = er?.chosen ?? undefined; clear(); act(G, { type: 'trade', act: 'accept', items, ...(erase ? { erase } : {}) }); } }, label) });
    return { title: `Buy ${p.name}`, body, foot, decision: true, detent: 'tall' };
}

// What boon.js needs for a Spell card offered as a favour: { art, node, block, erase }.
export function spellBoonBits(G, p) {
    const sp = G.data.spells?.[p.spell], er = eraseBlock(G), why = !p.learnable ? learnWhy(p.why) : null;
    return { art: h('span', { class: 'ds-counter lg' }, sp ? colorArt(sp) : icon('spark', 'lg')), node: [why ? voiced(why, { class: 'ds-why bad', 'data-spell-why': p.spell }) : null, er?.node],
        block: !p.learnable ? voicedWhy(learnWhy(p.why)) : er?.need ? 'Choose which spell to erase first: your spellbook is full.' : null, erase: er?.chosen ?? null };
}

