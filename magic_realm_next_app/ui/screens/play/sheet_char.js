// play/sheet_char.js: the character's belongings and spells: the character sheet, item cards, spell cards, spells in force, curses, treasure cards.
import { WEIGHT_WORDS } from '../../../engine/core.js';
import { defOf, nameOf, priceOf } from '../../../engine/items.js';
import { cardEl } from '../../card.js';
import { itemFace } from '../../counter.js';
import { h } from '../../dom.js';
import { itemContent, kitContent, slotPickerContent } from '../kit/kit.js';
import { mountSheet } from '../kit/common.js';
import { spellCardEl, spellContent, spellsContent } from '../kit/spells.js';
import { CURSE_PLAIN, modal, picOf, voidBy } from './kit.js';
import { render } from './shell.js';

// The Kit sheet (P2): Kit | Company | Spells, built in screens/kit/*.js. The slot picker is a second small sheet over it.
export function charSheet(G) { return mountSheet(G, kitContent(G), { close: () => { G.ui.sheet = null; render(G); }, cls: 'kit-sheet' }); }

// A slot of the Kit was tapped (ui.sheet 'slot', ui.slotPick the slot): the small picker over the Kit. It lives in its own sheet kind so that closing the Kit closes it too.
export function slotSheet(G) {
    const both = document.createDocumentFragment();
    both.append(charSheet(G), mountSheet(G, slotPickerContent(G, G.ui.slotPick), { close: () => { G.ui.slotPick = null; G.ui.sheet = 'char'; render(G); } }));
    return both;
}

// A spell card as printed: the card art with its colour, type, duration, target and the rules' full description (built in screens/kit/spells.js).
export function spellCard(G, sp) { return spellCardEl(G, sp); }

export function spellSheet(G) {
    const back = { close: () => { G.ui.sheet = 'char'; render(G); } };
    return mountSheet(G, spellContent(G, G.ui.spellId), back);
}

// One belonging: both of its faces drawn as counters, the facts, and the switch.
// The curses on him, what each takes away and what lifts it.
// When a spell in force ends, in words.
export function fxEnds(G, f) {
    if (f.state === 'inert') return '(inert: needs its colour of magic to act)';
    if (f.state === 'nullified') return '(held off)';
    if (f.state === 'held') return '(held, not yet used)';
    const e = f.expires;
    if (!e) return f.dur === 'permanent' ? 'until it is broken' : '';
    return e.at === 'sunset' ? `until Sunset${e.day === G.st.day ? '' : e.day === G.st.day + 1 ? ' tomorrow' : ` of day ${e.day}`}` : e.at === 'midnight' ? 'until Midnight' : e.at === 'phase-end' ? 'this phase' : 'this round';
}

// The spells you know, with the ones in force on top: what the dock's spell bar opens (built in screens/kit/spells.js).
export function spellsSheet(G) {
    const back = { close: () => { G.ui.sheet = null; render(G); } };
    return mountSheet(G, spellsContent(G), back);
}

export function cursesSheet(G) {
    const back = { close: () => { G.ui.sheet = null; render(G); } };
    const mine = G.st.ch.curses ?? [];
    const rows = Object.values(G.data.tables.curses.rows);
    const atChapel = G.st.dwellings.some(d => d.kind === 'Chapel' && d.at === G.st.ch.at);
    return modal(G, mine.length ? 'You are cursed' : 'Curses', h('div', { class: 'cursesheet' },
        mine.length ? null : h('p', { class: 'hint' }, 'You carry no curse. A curse can fall on you from a Treasure Location card, a Reading Runes result or a Loot result.'),
        ...mine.map(n => h('div', { class: 'curserow' }, h('span', { class: 'skull', 'aria-hidden': 'true' }, '\u2620'), h('div', {}, h('b', {}, n), h('p', {}, CURSE_PLAIN[n] ?? rows.find(r => r.name === n)?.effect ?? '')))),
        mine.length ? h('p', { class: 'hint' }, atChapel ? 'You are in a Chapel\u2019s clearing: at Midnight it lifts every curse.' : 'A curse stays until Midnight finds you in the clearing of a Chapel, which lifts them all. Walk there before the day ends.') : null,
        h('h3', {}, 'All six curses'),
        ...rows.map(r => h('p', { class: `hint${mine.includes(r.name) ? ' bad' : ''}` }, h('b', {}, r.name + ': '), CURSE_PLAIN[r.name] ?? r.effect)),
        h('button', { type: 'button', class: 'ds-btn block', onclick: back.close }, 'Back')), back);
}

// A treasure card he found but does not carry (a Mouldy Skeleton, a Toadstool Circle): what it says.
export function cardInfoSheet(G) {
    const td = G.data.treasures[G.ui.cardId];
    const back = { close: () => { G.ui.sheet = null; render(G); } };
    if (!td) return modal(G, 'Card', h('p', { class: 'hint' }, 'Unknown card.'), back);
    const text = G.data.cardtext?.treasures?.[G.ui.cardId] ?? td.effectText ?? '';
    return modal(G, td.name, h('div', { class: 'itemsheet' },
        cardEl({ title: td.name, kind: 'treasure', tag: td.kind === 'twt' ? 'Treasure within Treasure' : 'Treasure', stats: [], text, notes: G.ui.cardId === 'chest' ? [] : ['A treasure within a treasure: it is not carried off; what it holds is described on the card.'] }),
        h('button', { type: 'button', class: 'ds-btn block', onclick: back.close }, 'Back')), back);
}

// The card or faces, and the plain facts, of an item: a belonging of his (it.uid) or a thing on someone's shelf ({ kind, id }).
export function itemParts(G, it, { size } = {}) {
    const d = defOf(G.data, it), name = nameOf(G.data, it), pic = picOf(G, name) ?? (d?.name ? picOf(G, d.name) : null);
    const faces = [], facts = [];
    let card = null;
    const fmtT = t => (t == null ? '\u2013' : t);
    if (it.kind === 'weapon') {
        const u = d.unalerted, a = d.alerted;
        faces.push(itemFace({ name, picture: pic, face: 'Not alerted', big: `${u.harm}${fmtT(u.attackTime)}`, stars: u.stars ?? 0, corner: `(${d.length})`, current: !it.alerted && !it.destroyed, ...(size ? { size } : {}) }));
        faces.push(itemFace({ name, picture: pic, face: 'Alerted', big: `${a.harm}${a.attackTime == null ? '' : a.attackTime}`, stars: a.stars ?? 0, corner: `(${d.length})`, current: it.alerted && !it.destroyed, ...(size ? { size } : {}) }));
        facts.push(`${d.missile ? 'A missile weapon' : 'A striking weapon'}, length ${d.length}, weight ${WEIGHT_WORDS[d.weight]}.`);
        facts.push(`Not alerted: harm\u00A0${u.harm}${'*'.repeat(u.stars ?? 0)}, attack time\u00A0${fmtT(u.attackTime)}.`);
        facts.push(`Alerted: harm ${a.harm}${'*'.repeat(a.stars ?? 0)}, ${a.attackTime == null ? 'no printed attack time: the Fight chit you play gives the time' : `attack time\u00A0${a.attackTime}`}.`);
        facts.push('Alert it in an Alert phase, or as your Encounter action in a fight; it goes back to not alerted at Midnight and after a blow that lands.');
    } else if (it.kind === 'armor') {
        const dir = (d.protects ?? []).join(', ');
        faces.push(itemFace({ name, picture: pic, face: 'Whole', big: d.toughness ?? '', corner: dir ? '' : null, circle: d.priceIntact ?? null, current: !it.damaged && !it.destroyed, ...(size ? { size } : {}) }));
        faces.push(itemFace({ name, picture: pic, face: 'Damaged', big: d.toughness ?? '', circle: d.priceDamaged ?? null, circleTone: 'red', current: it.damaged && !it.destroyed, ...(size ? { size } : {}) }));
        facts.push(`${((d.type ?? 'armor')[0]).toUpperCase()}${(d.type ?? 'armor').slice(1)}, weight ${WEIGHT_WORDS[d.weight]}, toughness ${d.toughness}.`);
        facts.push(`Guards against: ${dir || 'nothing listed'}${d.chooseOneDirection ? ' (you choose one direction each round)' : ''}.`);
        facts.push(`A blow as strong as its toughness damages it; the next such blow destroys it. Worth ${d.priceIntact ?? '?'} gold whole, ${d.priceDamaged ?? '?'} damaged.`);
    } else if (it.kind === 'horse') {
        faces.push(itemFace({ name, picture: pic, face: 'Walking', big: `${d.walk.strength}${d.walk.moves}`, corner: `vuln ${d.vulnerability}`, circle: d.walk.moves, current: true, ...(size ? { size } : {}) }));
        faces.push(itemFace({ name, picture: pic, face: 'Galloping', big: `${d.gallop.strength}${d.gallop.moves}`, corner: `vuln ${d.vulnerability}`, circle: d.gallop.moves, ...(size ? { size } : {}) }));
        facts.push(`${d.kind ?? 'Horse'}${d.armored ? ', armored' : ''}, vulnerability ${d.vulnerability}.`);
        facts.push(`Walking: strength ${d.walk.strength}, moves ${d.walk.moves}. Galloping: strength ${d.gallop.strength}, moves ${d.gallop.moves}. In a fight it is played like a Move chit, either side, once a round.`);
        facts.push('It cannot be ridden in a cave.');
    } else {
        const key = it.card ?? it.id;
        const text = G.data.cardtext?.treasures?.[key] ?? G.data.cardtext?.treasures?.[it.id] ?? d?.effectText ?? '';
        const td = G.data.treasures[key] ?? d;
        const stats = [['Weight', WEIGHT_WORDS[td?.weight] ?? '?'], ['Price', `${td?.gold ?? '?'} gold`]];
        if (td?.fame) stats.push(['Fame', `${td.fame > 0 ? '+' : ''}${td.fame}`]);
        if (td?.notoriety) stats.push(['Notoriety', `${td.notoriety > 0 ? '+' : ''}${td.notoriety}`]);
        const notes = [];
        if (td?.great) notes.push('A Great Treasure: it counts toward the Great Treasures goal while you keep it.');
        if (td?.fameReward) notes.push(`Sold to the ${td.fameReward.group} it earns ${td.fameReward.points} Fame.`);
        card = cardEl({ title: td?.name ?? name, kind: td?.great ? 'great' : 'treasure', tag: `${td?.great ? 'Great treasure' : td?.kind === 'large' ? 'Large treasure' : td?.kind === 'small' ? 'Small treasure' : 'Treasure'}${td?.magic ? ` \u00B7 ${typeof td.magic === 'object' ? `Magic ${(td.magic.numerals ?? [td.magic.numeral]).filter(Boolean).join('/')}${td.magic.colour ? ` ${td.magic.colour}` : ''}` : `magic ${td.magic}`}` : ''}`, stats, text, notes, picture: pic });
    }
    if (card == null) {
        // what it is worth: gold when sold (armor already says whole and damaged above), and the Fame and Notoriety it adds while he owns it
        if (it.kind !== 'armor') { const g = priceOf(G.data, it); if (g) facts.push(voidBy(G.st, 'gold') ? h('span', {}, 'Worth ', h('s', { class: 'void' }, `${g} gold`), ' when sold: your gold is worthless while the Ashes curse lasts.') : `Worth ${g} gold when sold.`); }
        const fm = d?.fame ?? 0, nt = d?.notoriety ?? 0;
        if (fm || nt) facts.push(`Owning it adds ${[fm ? `Fame ${fm > 0 ? '+' : ''}${fm}` : '', nt ? `Notoriety ${nt > 0 ? '+' : ''}${nt}` : ''].filter(Boolean).join(' and ')} to your totals.`);
    }
    return { name, card, faces, facts };
}

export function itemSheet(G) {
    const it = G.st.ch.items.find(i => i.uid === G.ui.itemUid);
    const back = { close: () => { G.ui.sheet = G.ui.itemFrom === 'dock' ? null : G.ui.itemFrom === 'journal' ? 'journal' : 'char'; G.ui.itemFrom = null; G.ui.leaveAsk = null; render(G); } };
    if (!it) return modal(G, 'Belonging', h('p', { class: 'hint' }, 'You no longer have it.'), back);
    return mountSheet(G, itemContent(G, it), back);
}
