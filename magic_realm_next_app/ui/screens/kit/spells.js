// screens/kit/spells.js (P2): the Spells room of the Kit sheet and the spell flows: a card per spell you know (a plain synopsis, a status line built from the state, the printed
// text one tap under it), the spells in force, the printed spell card, and the learn sheet (the runes show a spell: learn it, and forget one if the spellbook is full).
// The wording of "why not" comes from the engine (blockedSpells); nothing here decides a rule.
import { MAX_SPELLS } from '../../../engine/runes.js';
import { blockedSpells, castable, colorChits, colorsAt } from '../../../engine/spells.js';
import { act } from '../play/actions.js';
import { fxEnds } from '../play/sheet_char.js';
import { render } from '../play/shell.js';
import { cardEl } from '../../card.js';
import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { castLine, synopsis } from '../../spelltext.js';
import { ask } from '../../ds.js';
import { footRow } from './common.js';
import { heldLockOf } from '../../spellwhy.js';
import { voiced } from '../../commit.js';

const CHIT_ART = { White: 'whitechit', Black: 'blackchit', Grey: 'graychit', Purple: 'purplechit', Gold: 'goldchit' };
const printedOf = (G, id) => G.data.cardtext?.spells?.[id] ?? '';
export const spellCount = G => (G.st.ch.spells ?? []).length;

// The printed text without its heading ("Make Whole (I/White), one character, Instant: ..."): the heading is the card's tag already.
function printedBody(G, sp) {
    const full = printedOf(G, sp.id), m = /^[^(]+\([^)]*\),\s*(.*?),\s*(Instant|Day|Combat|Permanent|Attack|Fly|Phase)\s*:\s*(.*)$/s.exec(full);
    return { target: m?.[1] ?? sp.target ?? null, body: m?.[3] ?? full };
}

const colorArt = sp => (CHIT_ART[sp.color] ? h('img', { class: 'ds-px', width: 32, height: 32, src: `art/colormagic/${CHIT_ART[sp.color]}.gif`, alt: '', draggable: 'false' }) : icon('spark', 'lg'));
const typeTag = sp => `Type ${sp.type} · ${sp.color ?? 'any colour'}`;

// The status of a spell he knows tonight, in words: what the engine says blocks it, else where its magic comes from.
function status(G, sp, blocked) {
    if (!castable(sp)) return { ok: false, text: 'It cannot be cast yet.' };
    const b = blocked.find(x => x.spell === sp.id);
    if (b) return { ok: false, text: `Not tonight. ${b.why.split(/(?<=\.)\s/).slice(0, 2).join(' ')}` };
    try {
        const here = colorsAt(G.st, G.data, G.st.ch.at);
        if (sp.color) return { ok: true, text: here.has(sp.color) ? `Castable tonight: ${sp.color} magic is here.` : colorChits(G.st, sp.color).length ? `Castable tonight: your enchanted ${sp.color} chit gives the magic.` : 'Castable tonight.' };
        return { ok: true, text: here.size ? 'Castable tonight: magic is here.' : 'Castable tonight.' };
    } catch { return { ok: true, text: 'Cast in the evening.' }; }
}

// One spell as a card: art, name and tag, the synopsis, the status, and the printed text under a tap.
export function spellRow(G, id, blocked, { status: showStatus = true } = {}) {
    const sp = G.data.spells?.[id];
    if (!sp) return h('div', { class: 'ds-spell', 'data-spell': id }, h('span', { class: 'main' }, h('b', {}, id)));
    const st = showStatus ? status(G, sp, blocked) : null, { target, body } = printedBody(G, sp);
    return h('article', { class: 'ds-spell kit-spell', 'data-spell': id },
        h('span', { class: 'col' }, colorArt(sp)),
        h('span', { class: 'main' },
            h('b', {}, sp.name, h('span', { class: 'ds-tag kit-tag' }, typeTag(sp))),
            h('span', { class: 'l' }, synopsis(sp, printedOf(G, id))),
            st ? h('span', { class: `st ${st.ok ? 'ok' : 'no'}` }, st.text) : null,
            h('details', { class: 'kit-detail kit-printed' }, h('summary', {}, 'The card'),
                target ? h('p', { class: 'ds-meta' }, `Target: ${target}. ${sp.duration}.`) : null, h('p', {}, body))));
}

// The spells in force now (what the old "Spells in effect" sheet said), as rows.
function inForce(G) {
    const fxOn = (G.st.fx ?? []).filter(f => f.state !== 'done');
    if (!fxOn.length) return null;
    const lock = heldLockOf(G.st, G.data);          // a held Phase spell he cannot use now says why (4.6.7f.2, 7.2.3a.2)
    return h('div', { class: 'cursesheet kit-fx' },
        h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'In force now'), h('small', {}, `${fxOn.length}`)),
        h('div', { class: 'ds-list' }, fxOn.map(f => {
            const sp = G.data.spells?.[f.spell], chit = f.source?.kind === 'chit' ? G.st.ch.chits.find(c => c.id === f.source.id) : null;
            return h('div', { class: 'ds-row kit-fxrow', 'data-fx': f.id },
                h('span', { class: 'art' }, sp ? colorArt(sp) : icon('spark')),
                h('span', { class: 'main' }, h('b', {}, sp?.name ?? f.spell),
                    h('span', {}, `${fxEnds(G, f)}.${chit ? ` Your Magic ${chit.numeral}${chit.time}${'*'.repeat(chit.effort)} is tied to it and tires when it ends.` : ''}`),
                    f.state === 'held' && lock ? voiced(lock, { class: 'st no', 'data-held-lock': f.id }) : null));
        })));
}

// spellsTab(G, { fxFirst }) -> the room's DOM
export function spellsTab(G, o = {}) {
    const ids = G.st.ch.spells ?? [], blocked = (() => { try { return blockedSpells(G.st, G.data); } catch { return []; } })();
    const fx = inForce(G), ch = G.st.ch, c4 = G.data.characters[ch.id]?.stage4;
    const list = ids.length ? h('div', { class: 'ds-list' }, ids.map(id => spellRow(G, id, blocked)))
        : h('p', { class: 'kit-none' }, (c4?.spellsKnown ?? 0) ? `You know no spell yet: one of type ${(c4.spellTypes ?? []).join(' or ')}, cast in the evening.` : 'You know no spells.');
    return h('div', { class: 'kit-room kit-spells' },
        o.fxFirst ? fx : null,
        h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'Your spells'), h('small', {}, `${ids.length} of ${MAX_SPELLS}`)),
        list,
        h('p', { class: 'ds-meta kit-more' }, `You may know up to ${MAX_SPELLS}. Read the runes at a site that holds a spell, or from an artifact or book you carry, to learn another.`),
        o.fxFirst ? null : fx);
}

// ---- the printed spell card (one spell, opened as its own sheet) ----
// spellCardEl(G, sp): the card as printed, with a one-line note on where it is cast; the rule behind it and the game stopping to ask are under Detail.
export function spellCardEl(G, sp) {
    const { target, body } = printedBody(G, sp), color = sp.color ?? 'any';
    return h('div', { class: 'kit-spellcard' },
        cardEl({ title: sp.name, kind: sp.color ?? 'any', tag: `Type ${sp.type} spell · ${color === 'any' ? 'any colour of magic' : `${color} magic`} · ${sp.duration}`,
            stats: [...(target ? [['Target', target]] : []), ['Cast with', `a Magic chit of type ${sp.type}`], ['Colour needed', color === 'any' ? 'any' : color]], text: body,
            notes: [castable(sp) ? castLine(sp) : 'This spell cannot be cast yet.'] }),
        castable(sp) ? h('details', { class: 'kit-detail' }, h('summary', {}, 'Detail'),
            h('p', {}, 'You cast this in the Encounter step of the evening, where its colour of magic is present. If nothing is fighting you the evening is still held (rule 8.1.3a) and the game stops to ask whether you want to cast it, when there is something for it to do.')) : null);
}

// spellContent(G, id, { back }) -> { title, body }
export function spellContent(G, id) {
    const sp = G.data.spells?.[id];
    if (!sp) return { title: 'Spell', body: h('p', { class: 'kit-none' }, 'Unknown spell.') };
    return { title: sp.name, body: h('div', { class: 'kit kit-spellsheet' }, h('p', { class: 'ds-voice kit-story' }, synopsis(sp, printedOf(G, id))), spellCardEl(G, sp)) };
}

// ---- the Spells sheet of the dock bar: your spells with the ones in force on top ----
export function spellsContent(G) {
    return { title: 'Spells', eyebrow: `Day ${G.st.day} · Spells`, body: h('div', { class: 'kit' }, spellsTab(G, { fxFirst: true })) };
}

// ---- learning: the runes show a spell ----
// learnContent(G, p) -> { title, body, foot }. Payloads are the engine's own: { type: 'learn-spell', learn: true, erase } / { learn: false } / (Magic Sight) { learn: true, spell }.
export function learnContent(G, p) {
    // Magic Sight (Perceive a spell): all the cards are shown and one may be learned (it is not awakened)
    if (p.sight && p.choices?.length) {
        const pick = G.ui.sightPick && p.choices.some(c => c.spell === G.ui.sightPick && c.learnable) ? G.ui.sightPick : null;
        const body = h('div', { class: 'kit kit-learn' },
            ask('You see these spell cards.', `${p.from ?? 'Magic Sight'}: you may learn one of them if you hold a Magic chit of its type. The card stays where it is.`),
            h('div', { class: 'ds-list' }, p.choices.map(c => {
                const sp = G.data.spells?.[c.spell];
                return h('button', { type: 'button', class: `ds-row${pick === c.spell ? ' sel' : ''}${c.learnable ? '' : ' dim'}`, 'data-learn': c.spell, 'aria-pressed': pick === c.spell ? 'true' : 'false',
                    onclick: () => { G.ui.sightPick = c.learnable ? (pick === c.spell ? null : c.spell) : null; render(G); } },
                    h('span', { class: 'art' }, sp ? colorArt(sp) : icon('spark')),
                    h('span', { class: 'main' }, h('b', {}, c.name), h('span', {}, c.learnable ? synopsis(sp, printedOf(G, c.spell)) : 'You hold no Magic chit of this type, so you cannot learn it.')),
                    h('span', { class: 'end' }, `Type ${c.type}`, h('small', {}, c.color ?? 'any')));
            })));
        const foot = footRow({ note: pick ? `Learn ${G.data.spells?.[pick]?.name ?? pick}.` : 'Choose one to learn, or leave them.',
            secondary: h('button', { type: 'button', class: 'ds-btn', 'data-act': 'leave', onclick: () => { G.ui.sightPick = null; act(G, { type: 'learn-spell', learn: false }); } }, 'Leave them'),
            primary: pick ? h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'learn', onclick: () => { G.ui.sightPick = null; act(G, { type: 'learn-spell', learn: true, spell: pick }); } }, 'Learn it')
                : h('button', { type: 'button', class: 'ds-btn primary is-dim', 'data-act': 'learn', 'aria-disabled': 'true', onclick: () => { G.ui.toast = 'Choose a spell to learn first.'; render(G); setTimeout(() => { G.ui.toast = null; render(G); }, 2400); } }, 'Choose one') });
        return { title: 'Magic Sight', body, foot, decision: true };
    }
    const sp = G.data.spells?.[p.spell], erase = G.ui.erase ?? null;
    const body = h('div', { class: 'kit kit-learn' },
        ask(`The runes show ${sp?.name ?? 'a spell'}.`, `You hold a Type ${sp?.type} Magic chit, so you can learn it. The card stays where it is.`),
        sp ? h('div', { class: 'ds-list' }, spellRow(G, p.spell, [], { status: false })) : null,
        p.full ? h('div', { class: 'kit-forget' },
            h('div', { class: 'ds-ask warn' }, h('b', {}, `Your spellbook is full (${MAX_SPELLS}).`), h('span', {}, 'Forget one to make room:')),
            h('div', { class: 'ds-list' }, (G.st.ch.spells ?? []).map(id => { const s2 = G.data.spells?.[id]; return h('button', { type: 'button', class: `ds-row${erase === id ? ' sel' : ''}`, 'data-erase': id, 'aria-pressed': erase === id ? 'true' : 'false', onclick: () => { G.ui.erase = erase === id ? null : id; render(G); } },
                h('span', { class: 'art' }, s2 ? colorArt(s2) : icon('spark')), h('span', { class: 'main' }, h('b', {}, s2?.name ?? id), h('span', {}, s2 ? typeTag(s2) : '')), erase === id ? h('span', { class: 'end' }, 'forget') : null); }))) : null);
    const need = p.full && !erase;
    const foot = footRow({ note: need ? 'Choose which spell to forget.' : '',
        secondary: h('button', { type: 'button', class: 'ds-btn', 'data-act': 'leave', onclick: () => { G.ui.erase = null; act(G, { type: 'learn-spell', learn: false }); } }, 'Leave it'),
        primary: need ? h('button', { type: 'button', class: 'ds-btn primary is-dim', 'data-act': 'learn', 'aria-disabled': 'true', onclick: () => { G.ui.toast = 'Forget one spell first: your spellbook is full.'; render(G); setTimeout(() => { G.ui.toast = null; render(G); }, 2400); } }, 'Learn it')
            : h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'learn', onclick: () => { const e = G.ui.erase; G.ui.erase = null; act(G, { type: 'learn-spell', learn: true, erase: e }); } }, 'Learn it') });
    return { title: 'Read the runes', body, foot, decision: true };
}
