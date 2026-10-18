// play/sheet_char.js: the character's belongings and spells: the character sheet, item cards, spell cards, spells in force, curses, treasure cards.
import { WEIGHT_WORDS } from '../../../engine/core.js';
import { defOf, nameOf, priceOf, summaryOf, weightOf } from '../../../engine/items.js';
import { hirelingsOf } from '../../../engine/party.js';
import { castable } from '../../../engine/spells.js';
import { REL_NAMES } from '../../../engine/tables.js';
import { cardEl } from '../../card.js';
import { itemFace } from '../../counter.js';
import { h } from '../../dom.js';
import { policyBlock } from '../meetui.js';
import { act } from './actions.js';
import { CURSE_PLAIN, ico, mc, modal, picOf, voidBy } from './kit.js';
import { render } from './shell.js';

export function charSheet(G) {
    const ch = G.st.ch;
    const chitEl = c => h('div', { class: `chit2 ${c.type} ${c.state}` }, h('b', {}, c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`), h('span', {}, '*'.repeat(c.effort) || '\u00A0'), h('small', {}, c.type === 'move' ? 'Move' : c.type === 'fight' ? 'Fight' : 'Magic'));
    const portrait = G.data.art?.characters?.[ch.id];
    return modal(G, ch.name, h('div', {},
        portrait ? h('button', { class: 'portrait', 'aria-label': 'Show the character card', onclick: () => { G.ui.sheet = 'card'; render(G); } }, h('img', { src: portrait, alt: ch.name }), G.data.art?.cards?.[ch.id] ? h('small', {}, 'Tap for the character card') : null) : null,
        h('div', { class: 'chits' }, ch.chits.map(chitEl)),
        h('p', { class: 'hint' }, 'Gold, Fame and Notoriety are shown on the top bar. Fatigued chits are dim; wounded chits are crossed out.'),
        ...(ch.spells?.length ? [h('h3', {}, 'Spells'), ...ch.spells.map(id => h('div', { class: 'itemrow spellrow' }, h('button', { class: 'btn row', 'data-spell': id, onclick: () => { G.ui.spellId = id; G.ui.sheet = 'spell'; render(G); } },
            h('span', { class: 'rl' }, h('b', {}, G.data.spells?.[id]?.name ?? id), h('small', {}, `Type ${G.data.spells?.[id]?.type ?? '?'} \u00B7 ${G.data.spells?.[id]?.color ?? 'any colour'} \u00B7 ${G.data.spells?.[id]?.duration ?? ''}`)),
            h('em', {}, castable(G.data.spells?.[id]) ? 'cast in the evening' : 'not yet'))))]
            : (G.data.characters[ch.id].stage4.spellsKnown ?? 0) ? [h('p', { class: 'hint' }, `Spells: one of type ${(G.data.characters[ch.id].stage4.spellTypes ?? []).join('/')} (cast in the evening, in the Encounter step).`)] : []),
        h('h3', {}, 'Carrying'),
        ...ch.items.map(it => {
            const canSwitch = G.st.pending?.type === 'phase' || G.st.pending?.type === 'plan';
            return h('div', { class: 'itemrow' },
                h('button', { class: `btn row${it.active ? ' on' : ''}`, 'data-item': it.uid, 'aria-label': `About the ${nameOf(G.data, it)}`, onclick: () => { G.ui.itemUid = it.uid; G.ui.sheet = 'item'; render(G); } },
                    ico(G, nameOf(G.data, it)), h('span', { class: 'rl' }, h('b', {}, nameOf(G.data, it) + (it.damaged ? ' (damaged)' : '') + (it.destroyed ? ' (destroyed)' : '')), h('small', {}, summaryOf(G.data, it))),
                    h('em', {}, `${WEIGHT_WORDS[weightOf(G.data, it)] ?? ''}`)),
                h('button', { class: `switch${it.active ? ' on' : ''}`, role: 'switch', 'aria-checked': it.active ? 'true' : 'false', 'data-switch': it.uid, disabled: !canSwitch || it.destroyed || null,
                    'aria-label': `${nameOf(G.data, it)}: ${it.active ? 'active' : 'inactive'}`, onclick: () => { G.ui.keep = true; act(G, { type: 'tidy', item: it.uid }); } }, it.active ? 'Active' : 'Inactive'),
            );
        }),
        ch.items.length ? null : h('p', { class: 'hint' }, 'Nothing.'),
        ...(() => {
            if (G.shared) {                            // a hireling is its hirer's alone (7.7): list only mine, with the creatures I control
                const hs = hirelingsOf(G.st, ch.id).filter(o => !o.dead);
                return hs.length ? [h('h3', {}, 'Hirelings'), ...hs.map(o => h('p', { 'data-hireling': o.id }, `${G.data.natives[o.id]?.name ?? G.data.monsters[o.id]?.name ?? o.id} \u2014 yours alone; term ends at midnight of day ${o.hiredUntil ?? o.controlledUntil}`))] : [];
            }
            const hs = G.st.nats.filter(n => n.hired && !n.dead); return hs.length ? [h('h3', {}, 'Hirelings'),
            ...hs.map(n => h('p', {}, `${G.data.natives[n.id].name} \u2014 term ends at midnight of day ${n.hiredUntil}`))] : []; })(),
        ...(G.shared && G.ms ? policyBlock(mc(G)) : []),
        h('h3', {}, 'Standing'),
        h('p', {}, Object.entries(ch.rel).map(([g, r]) => `${g}: ${REL_NAMES[String(r)]}`).join(' · '))),
        { close: () => { G.ui.sheet = null; render(G); } });
}

// A spell: its card, with the rules' full description.
// A spell card as printed: the card art with its colour, type, duration, target and the rules' full description.
export function spellCard(G, sp) {
    const full = G.data.cardtext?.spells?.[sp.id] ?? '';
    const m = /^[^(]+\([^)]*\),\s*(.*?),\s*(Instant|Day|Combat|Permanent|Attack|Fly|Phase)\s*:\s*(.*)$/s.exec(full);
    const target = m?.[1], body = m?.[3] ?? full;
    const color = sp.color ?? 'any';
    return cardEl({ title: sp.name, kind: sp.color ?? 'any', tag: `Type ${sp.type} spell \u00B7 ${color === 'any' ? 'any colour of magic' : `${color} magic`} \u00B7 ${sp.duration}`,
        stats: [...(target ? [['Target', target]] : []), ['Cast with', `a Magic chit of type ${sp.type}`], ['Colour needed', color === 'any' ? 'any' : color]], text: body,
        notes: [castable(sp) ? 'You cast this in the Encounter step of the evening, where its colour of magic is present. If nothing is fighting you the evening is still held (rule 8.1.3a) and the game stops to ask whether you want to cast it, when there is something for it to do.' : 'This spell cannot be cast yet.'] });
}

export function spellSheet(G) {
    const sp = G.data.spells?.[G.ui.spellId];
    const back = { close: () => { G.ui.sheet = 'char'; render(G); } };
    if (!sp) return modal(G, 'Spell', h('p', { class: 'hint' }, 'Unknown spell.'), back);
    return modal(G, sp.name, h('div', { class: 'itemsheet' }, spellCard(G, sp),
        h('button', { class: 'btn', onclick: back.close }, 'Back')), back);
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

export function spellsSheet(G) {
    const back = { close: () => { G.ui.sheet = null; render(G); } };
    const fxOn = (G.st.fx ?? []).filter(f => f.state !== 'done');
    return modal(G, 'Spells in effect', h('div', { class: 'cursesheet' },
        fxOn.length ? null : h('p', { class: 'hint' }, 'No spell of yours is in effect.'),
        ...fxOn.map(f => { const sp = G.data.spells?.[f.spell], chit = f.source?.kind === 'chit' ? G.st.ch.chits.find(c => c.id === f.source.id) : null;
            return h('div', { class: 'curserow fxrow' }, h('span', { class: 'skull', 'aria-hidden': 'true' }, '\u2728'), h('div', {}, h('b', {}, sp?.name ?? f.spell), h('p', {}, `${fxEnds(G, f)}.${chit ? ` Your Magic ${chit.numeral}${chit.time}${'*'.repeat(chit.effort)} is tied to it and tires when it ends.` : ''}`), (sp?.text ?? G.data.cardtext?.spells?.[f.spell]) ? h('p', { class: 'hint' }, sp?.text ?? G.data.cardtext.spells[f.spell]) : null)); }),
        h('button', { class: 'btn', onclick: back.close }, 'Back')), back);
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
        h('button', { class: 'btn', onclick: back.close }, 'Back')), back);
}

// A treasure card he found but does not carry (a Mouldy Skeleton, a Toadstool Circle): what it says.
export function cardInfoSheet(G) {
    const td = G.data.treasures[G.ui.cardId];
    const back = { close: () => { G.ui.sheet = null; render(G); } };
    if (!td) return modal(G, 'Card', h('p', { class: 'hint' }, 'Unknown card.'), back);
    const text = G.data.cardtext?.treasures?.[G.ui.cardId] ?? td.effectText ?? '';
    return modal(G, td.name, h('div', { class: 'itemsheet' },
        cardEl({ title: td.name, kind: 'treasure', tag: td.kind === 'twt' ? 'Treasure within Treasure' : 'Treasure', stats: [], text, notes: G.ui.cardId === 'chest' ? [] : ['A treasure within a treasure: it is not carried off; what it holds is described on the card.'] }),
        h('button', { class: 'btn', onclick: back.close }, 'Back')), back);
}

// The card or faces, and the plain facts, of an item: a belonging of his (it.uid) or a thing on someone's shelf ({ kind, id }).
export function itemParts(G, it) {
    const d = defOf(G.data, it), name = nameOf(G.data, it), pic = picOf(G, name) ?? (d?.name ? picOf(G, d.name) : null);
    const faces = [], facts = [];
    let card = null;
    const fmtT = t => (t == null ? '\u2013' : t);
    if (it.kind === 'weapon') {
        const u = d.unalerted, a = d.alerted;
        faces.push(itemFace({ name, picture: pic, face: 'Not alerted', big: `${u.harm}${fmtT(u.attackTime)}`, stars: u.stars ?? 0, corner: `(${d.length})`, current: !it.alerted && !it.destroyed }));
        faces.push(itemFace({ name, picture: pic, face: 'Alerted', big: `${a.harm}${a.attackTime == null ? '' : a.attackTime}`, stars: a.stars ?? 0, corner: `(${d.length})${a.attackTime == null ? ' time: your chit' : ''}`, current: it.alerted && !it.destroyed }));
        facts.push(`${d.missile ? 'A missile weapon' : 'A striking weapon'}, length ${d.length}, weight ${WEIGHT_WORDS[d.weight]}.`);
        facts.push(`Not alerted: harm\u00A0${u.harm}${'*'.repeat(u.stars ?? 0)}, attack time\u00A0${fmtT(u.attackTime)}.`);
        facts.push(`Alerted: harm ${a.harm}${'*'.repeat(a.stars ?? 0)}, ${a.attackTime == null ? 'no printed attack time: the Fight chit you play gives the time' : `attack time\u00A0${a.attackTime}`}.`);
        facts.push('Alert it in an Alert phase, or as your Encounter action in a fight; it goes back to not alerted at Midnight and after a blow that lands.');
    } else if (it.kind === 'armor') {
        const dir = (d.protects ?? []).join(', ');
        faces.push(itemFace({ name, picture: pic, face: 'Whole', big: d.toughness ?? '', corner: dir ? '' : null, circle: d.priceIntact ?? null, current: !it.damaged && !it.destroyed }));
        faces.push(itemFace({ name, picture: pic, face: 'Damaged', big: d.toughness ?? '', circle: d.priceDamaged ?? null, circleTone: 'red', current: it.damaged && !it.destroyed }));
        facts.push(`${((d.type ?? 'armor')[0]).toUpperCase()}${(d.type ?? 'armor').slice(1)}, weight ${WEIGHT_WORDS[d.weight]}, toughness ${d.toughness}.`);
        facts.push(`Guards against: ${dir || 'nothing listed'}${d.chooseOneDirection ? ' (you choose one direction each round)' : ''}.`);
        facts.push(`A blow as strong as its toughness damages it; the next such blow destroys it. Worth ${d.priceIntact ?? '?'} gold whole, ${d.priceDamaged ?? '?'} damaged.`);
    } else if (it.kind === 'horse') {
        faces.push(itemFace({ name, picture: pic, face: 'Walking', big: `${d.walk.strength}${d.walk.moves}`, corner: `vuln ${d.vulnerability}`, circle: d.walk.moves, current: true }));
        faces.push(itemFace({ name, picture: pic, face: 'Galloping', big: `${d.gallop.strength}${d.gallop.moves}`, corner: `vuln ${d.vulnerability}`, circle: d.gallop.moves }));
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
    const back = { close: () => { G.ui.sheet = G.ui.itemFrom === 'dock' ? null : 'char'; G.ui.itemFrom = null; render(G); } };
    if (!it) return modal(G, 'Belonging', h('p', { class: 'hint' }, 'You no longer have it.'), back);
    const { name, card, faces, facts } = itemParts(G, it);
    const canSwitch = (G.st.pending?.type === 'phase' || G.st.pending?.type === 'plan') && !it.destroyed;
    return modal(G, name, h('div', { class: 'itemsheet' },
        card ?? h('div', { class: 'faces' }, ...faces),
        h('p', { class: 'hint' }, `${it.destroyed ? 'Destroyed. ' : ''}${it.active ? 'Active' : 'Inactive'}${it.kind === 'weapon' ? (it.alerted ? ', alerted' : ', not alerted') : ''}${it.kind === 'armor' ? (it.damaged ? ', damaged' : ', whole') : ''}.`),
        ...facts.map(t => h('p', {}, t)),
        h('div', { class: 'row2' },
            h('button', { class: `switch big${it.active ? ' on' : ''}`, role: 'switch', 'aria-checked': it.active ? 'true' : 'false', 'data-act': 'item-switch', disabled: !canSwitch || null, onclick: () => { G.ui.keep = true; act(G, { type: 'tidy', item: it.uid }); } }, it.active ? 'Active: deactivate it' : 'Inactive: activate it'),
            h('button', { class: 'btn', onclick: back.close }, 'Back')),
        canSwitch && !it.destroyed ? h('button', { class: 'btn quiet-no leave', 'data-act': 'item-leave', onclick: () => { G.ui.keep = true; G.ui.sheet = G.ui.itemFrom === 'dock' ? null : 'char'; G.ui.itemFrom = null; act(G, { type: 'tidy', item: it.uid, drop: true }); } }, `Leave the ${name} here`) : null,
        canSwitch ? null : h('p', { class: 'hint' }, 'Gear can be changed between phases. In a fight, switching one item or leaving one behind is your Encounter action (open the Encounter step and use "Belongings" there).')), back);
}
