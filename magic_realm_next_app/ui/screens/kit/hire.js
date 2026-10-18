// screens/kit/hire.js (P2): the Hire sheet as a parley. First a card per group that will hire out (the printed counters, their mood, the wages, one chip that changes the dice: stand a
// round), then one button, "Ask the Lancers"; then the answer: the roll, the price as the headline, who you would get and for how long, and "Not at that price" as easy as the yes.
// Payloads are the old sheet's: { type: 'hire', act: 'pick', group, rehire, drinks } / 'accept' / 'decline' / 'pay' / 'fight' / 'back'.
import { drinksCost } from '../../../engine/meeting.js';
import { hasCurse } from '../../../engine/effects.js';
import { nameOfClearing } from '../../../engine/world.js';
import { act } from '../play/actions.js';
import { render } from '../play/shell.js';
import { h } from '../../dom.js';
import { art, icon } from '../../icons.js';
import { boonContent } from './boon.js';
import { ask, dimBtn, footRow, moodTag, nativeArt, say, skipBtn, twoLine } from './common.js';
import { insultContent, offerDice } from './trade.js';

// The counters of a group, as the printed art on the cream tile (monsters in colour, natives as their counters).
function counters(G, ids, monsters) {
    return h('div', { class: 'cs' }, ids.map(id => {
        const src = monsters ? (G.data.art?.monstersColor?.[G.data.monsters[id]?.name] ?? G.data.art?.monsters?.[G.data.monsters[id]?.name]) : nativeArt(G, id);
        return h('span', { class: 'ds-counter tall' }, src ? art(src.replace(/^art\//, ''), '', '') : null);
    }));
}

const titleOf = (G, o) => {
    const nat = !o.monsters, lead = nat ? o.members.filter(id => G.data.natives[id]?.leader).length : 0, rest = o.members.length - lead;
    if (o.monsters) return o.members.length > 1 ? `${o.group} ×${o.members.length}` : o.group;
    if (o.names.length === 1) return o.names[0];
    return h('span', {}, `${o.group} ×${rest || o.members.length}`, rest && lead ? h('span', { class: 'ds-dim kit-lead' }, ' and their leader') : null);
};

// ---- the answer: a price (the roll, the price as the headline, who you get, the gold left) ----
function offerContent(G, p) {
    const until = p.rehire ? (G.st.nats.find(n => n.id === p.members[0])?.hiredUntil ?? G.st.day) + 14 : G.st.day + 13;
    const left = G.st.ch.gold - p.price;
    const body = h('div', { class: 'kit kit-offer kit-hire-offer' },
        offerDice(G, p) ?? h('p', { class: 'ds-meta' }, p.why),
        h('div', { class: 'kit-pricebox' }, h('div', { class: 'ds-price', 'data-price': String(p.price) }, `${p.price} GOLD`, h('small', {}, `${p.wage} wages × ${p.mult}`))),
        ask(`${p.names.length === 1 ? p.names[0] : `The ${p.group}`} will join you.`, p.rehire ? 'It adds 14 days to the term they have. Or turn the price down and keep your gold.' : 'Hire them, or turn the price down and keep your gold.'),
        h('div', { class: 'ds-group' }, h('div', { class: 'hd' }, h('b', {}, titleOf(G, { ...p, members: p.members })), h('span', { class: 'ds-tag good' }, p.rehire ? '+14 days' : '14 days')), counters(G, p.members, p.monsters),
            h('p', { class: 'ds-meta' }, `They follow you and fight beside you until midnight of day ${until}.`)));
    const label = p.rehire ? `Extend them · ${p.price}g` : `Hire them · ${p.price}g`;
    // (the reason the primary is dim is the foot's line, in red, above the buttons: never below the fold of a scroll)
    const foot = footRow({ note: p.affordable ? `Gold ${G.st.ch.gold} to ${left}` : `You are ${-left} gold short.`, bad: !p.affordable,
        secondary: h('button', { type: 'button', class: 'ds-btn', 'data-act': 'hire-decline', onclick: () => act(G, { type: 'hire', act: 'decline' }) }, 'Not at that price'),
        primary: p.affordable ? h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'hire-ok', onclick: () => act(G, { type: 'hire', act: 'accept' }) }, label)
            : dimBtn(G, label, `You are ${-left} gold short.`, { 'data-act': 'hire-ok' }, 'primary') });
    return { title: 'A price', eyebrow: `The ${p.group} answer`, body, foot, decision: true, detent: 'tall' };
}

// ---- the parley: whom to ask ----
function chooser(G, p) {
    const keyOf = o => `${o.group}|${o.rehire ? 1 : 0}`;
    const sel = G.ui.hireSel && p.options.some(o => keyOf(o) === G.ui.hireSel) ? G.ui.hireSel : p.options.length === 1 ? keyOf(p.options[0]) : null;
    const pickedOpt = p.options.find(o => keyOf(o) === sel) ?? null;
    const rounds = G.ui.drinksFor && G.ui.drinksFor === sel ? G.ui.drinksFor : null;
    const ashes = hasCurse(G.st, 'Ashes');
    const cards = p.options.map(o => {
        const key = keyOf(o), on = key === sel, dc = drinksCost(G.st, G.data, o.group), rel = o.monsters ? 0 : G.st.ch.rel?.[o.group] ?? 0, round = rounds === key && !o.monsters;
        const days = o.rehire ? Math.max(0, Math.min(...o.members.map(id => (G.st.nats.find(n => n.id === id)?.hiredUntil ?? G.st.day) - G.st.day + 1))) : null;
        const why = G.st.ch.gold < dc ? `A round costs ${dc} gold and you have ${G.st.ch.gold}.` : null;
        return h('div', { class: `ds-group kit-hcard${on ? ' sel' : ''}`, 'data-hire-card': o.group },
            h('button', { type: 'button', class: 'kit-pick', 'data-hire-group': o.group, 'data-rehire': o.rehire ? '1' : '0', role: 'radio', 'aria-checked': on ? 'true' : 'false', onclick: () => { G.ui.hireSel = on && p.options.length > 1 ? null : key; render(G); } },
                h('div', { class: 'hd' }, h('b', {}, titleOf(G, o)), o.monsters ? h('span', { class: 'ds-tag' }, 'pacified') : moodTag(round ? Math.min(2, rel + 1) : rel)),
                counters(G, o.members, o.monsters),
                h('span', { class: 'ds-meta' }, `${o.rehire ? `Extend hire (${days} day${days === 1 ? '' : 's'} left). ` : ''}Wages: ${o.wage} Gold${o.members.length > 1 ? ` for all ${o.members.length}` : ''}.${G.data.groups[o.group]?.hireMode === 'individual' ? ' One at a time.' : ''}`),
                !o.monsters && rel < 0 ? h('span', { class: 'ds-why' }, 'They may turn you away.') : null),
            o.monsters ? null : h('div', { class: 'kit-chiprow' },
                ashes ? h('span', { class: 'ds-meta' }, 'Your gold is worthless under the Ashes curse.')
                    : h('button', { type: 'button', class: `ds-chip${round ? ' on' : ''}${why && !round ? ' is-dim' : ''}`, 'data-multi': '', 'data-act': 'drinks-toggle', 'aria-pressed': round ? 'true' : 'false', 'aria-disabled': why && !round ? 'true' : null,
                        onclick: () => { if (why && !round) { say(G, why); return; } G.ui.hireSel = key; G.ui.drinksFor = round ? null : key; render(G); } }, round ? icon('check') : null, `Stand a round · ${dc}g`)));
    });
    const body = h('div', { class: 'kit kit-hire' },
        ask('Natives here will hire out for 14 days.', 'Ask first: the roll sets the price, and you may refuse it.'),
        h('div', { class: 'kit-groups', role: 'radiogroup' }, cards));
    const go = () => { const o = pickedOpt, drinks = rounds === keyOf(o) && !o.monsters; G.ui.hireSel = null; G.ui.drinksFor = null; G.ui.drinks = false; act(G, { type: 'hire', act: 'pick', group: o.group, rehire: !!o.rehire, drinks }); };
    // a planned Hire can be passed: nobody worth hiring, or nothing to hire with. The engine's own answer is `cancel` ("You decide not to hire anyone").
    const skip = skipBtn(() => { G.ui.hireSel = null; G.ui.drinksFor = null; act(G, { type: 'hire', act: 'cancel' }); });
    const foot = footRow({ note: `You have ${G.st.ch.gold} Gold`, aside: skip, secondary: h('button', { type: 'button', class: 'ds-btn', 'data-act': 'hire-back', onclick: () => { G.ui.hireSel = null; G.ui.drinksFor = null; act(G, { type: 'hire', act: 'back' }); } }, 'Back'),
        primary: pickedOpt ? h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'hire-go', onclick: go }, twoLine(`Ask the ${pickedOpt.group}`, 'roll for the price'))
            : dimBtn(G, twoLine('Ask', 'choose who first'), 'Choose a group to ask first.', { 'data-act': 'hire-go' }, 'primary') });
    return { title: 'Hire', eyebrow: nameOfClearing(G.st.ch.at), body, foot, decision: true, detent: 'tall' };
}

// hireContent(G, p) -> { title, eyebrow, body, foot, decision }
export function hireContent(G, p) {
    if (p.type === 'hire-offer') {
        if (p.insult) return insultContent(G, p, 'hire');
        return p.boon ? boonContent(G, p, 'hire') : offerContent(G, p);
    }
    return chooser(G, p);
}

