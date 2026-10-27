import { say, roll2, die, noteRoll } from './core.js';
import { nameOf } from './items.js';
import { oneDie, spellMod, hoofHere, runesAdvantage, modNote } from './modifiers.js';
import { runesRollResult } from './rules/runesRollResult.js';
import { rollCurse } from './effects.js';
import { sitesHere } from './search.js';

// Spell cards and Reading Runes (rules 3.1.3, 4.6.7, 7.5.6; digest 04 sections 2.3 and 4.2).
// The 47 spell cards are dealt at setup into boxes: the treasure sites (Altar, Shrine, Statue), the visitors, and the artifacts and books. A card is
// never taken from its box: reading its runes lets a character with a Magic chit of the same numeral *learn* it (and, for an artifact or book, awakens it).
// st.spellBox = { sites: {name: [{id, awake}]}, visitors: {...}, items: {...} } (items are keyed by the treasure's name).

// He may record at most 14 spells (digest 04 section 2.3; RealmSpeak's own limit): learning a 15th means erasing one.
export const MAX_SPELLS = 14;

export const spellOf = (data, id) => data.spells?.[id] ?? Object.values(data.spells ?? {}).find(s => s.id === id) ?? null;

// Which spell sits in each box is hidden until read. Cards of a type are shuffled and dealt where that type is printed; six are set aside.
export function dealSpells(st, data, shuffle) {
    const S = data.setupcard ?? {};
    const byType = {};
    for (const sp of Object.values(data.spells ?? {})) (byType[sp.type] ??= []).push(sp.id);
    for (const t of Object.keys(byType)) byType[t] = shuffle(st, byType[t], `setup.runes.${t}`);
    st.spellsAside = (S.spellsOutOfPlay ?? []).map(t => byType[t]?.pop()).filter(Boolean);
    // Ruling S5 (Mike, 2026-10-26, the recommendation): "Spell cards go into the boxes in order of Magic type; lower numbers spells are below the higher number spells and are harder to learn"
    // (3.1.3g.4). A box is stored BOTTOM FIRST, as the Set Up Card lists it (lowest type first); its TOP card, the one Reading Runes tries first (7.5.6b), is the LAST one: `topCard`.
    const box = types => types.map(t => ({ id: byType[t]?.pop() ?? null, awake: false })).filter(c => c.id);
    st.spellBox = { sites: {}, visitors: {}, items: {} };
    for (const s of S.sites ?? []) if (s.spells?.length) st.spellBox.sites[s.name] = box(s.spells);
    for (const v of S.visitors ?? []) if (v.spells?.length) st.spellBox.visitors[v.name] = box(v.spells);
    for (const c of S.spellContainers ?? []) if (c.spells?.length) st.spellBox.items[c.name] = box(c.spells);
}

// The card he would read: the topmost not yet awakened, or the top one when all are.
export const topCard = box => box.findLast(c => !c.awake) ?? box.at(-1);          // (boxes are stored bottom first: the top card is the last, S5)

// What he can read runes on right here: a discovered site chit in his clearing that holds spell cards, or an artifact or book he carries and
// has active. Returns [{ key, label, kind, box, item? }].
export function runesTargets(st, data) {
    const out = [];
    for (const site of sitesHere(st)) {
        const box = st.spellBox?.sites?.[site.name];
        if (box?.length) out.push({ key: `site:${site.name}`, label: `The ${site.name}`, kind: 'site', box });
    }
    for (const it of st.ch.items) {
        if (it.destroyed || !it.active) continue;
        const name = nameOf(data, it);
        const box = st.spellBox?.items?.[name];
        if (box?.length) out.push({ key: `item:${it.uid}`, label: `Your ${name}`, kind: 'item', box, item: it });
        // Enchant Artifact (4.6.7 via digest 04 section 7.3): while that spell is energized the holder can read the runes of each spell it recorded on the item. The added card
        // is awake from the start (7.5.6b lets him target any awakened card), so each is its own target; they exist only while the spell is live.
        for (const e of it.extra ?? []) out.push({ key: `extra:${it.uid}:${e.spell}`, label: `Your ${name} (the ${spellOf(data, e.spell)?.name ?? e.spell} added to it)`, kind: 'item', extra: true, box: [{ id: e.spell, awake: true, extra: true }], item: it });
    }
    return out;
}

const ownsChitOf = (st, type) => st.ch.chits.some(c => c.type === 'magic' && c.numeral === type);

// One Reading Runes search (the dice are rolled here). Returns the text for the log, or 'wait' when the player must answer a question.
export function readRunes(st, data, targetKey) {
    const targets = runesTargets(st, data);
    if (!targets.length) return 'There is nothing here whose runes you can read.';
    if (!targetKey && targets.length > 1) { st.pending = { type: 'runes-target', options: targets.map(t => ({ key: t.key, label: t.label })) }; return 'wait'; }
    const t = targets.find(x => x.key === targetKey) ?? targets[0];
    let r;
    if (oneDie(st, 'runes', st.ch.at, data)) { const d1 = die(st, 'runes'); r = { dice: [d1], value: d1 }; } else r = roll2(st, 'runes');
    // Knowledge (Witch, Magician) lowers the die by one (never below 1); then the spells' and the Cloven Hoof's additions; at most 6. Kernel rules/runesRollResult.js.
    // (Open ruling: the order of the floor and the additions only matters for a die of 1 with an addition in force, docs/process/RULINGS-NEEDED.md.)
    { const adv = runesAdvantage(st), m = spellMod(st, data, 'runes'), hoof = hoofHere(st), before = r.value;
      r.value = runesRollResult(r.value, adv, m + (hoof ? 1 : 0)); if (m) r.mod = m; if (hoof) r.hoof = true; if (adv === 'knowledge' && before > 1) r.know = true; }
    const res = data.tables.readRunes[String(r.value)];
    const LABEL = { 'learn-and-awaken': 'Learn and awaken', awaken: 'Awaken', curse: 'Curse!', nothing: 'Nothing' };
    noteRoll(st, 'Search: Read runes', r.dice, r.value, (LABEL[res] ?? res) + modNote(r));
    const lead = `You read the runes of ${t.label.toLowerCase()} (${r.dice.join('+')}):`;
    if (res === 'nothing') return `${lead} nothing.`;
    if (res === 'curse') return `${lead} a curse! ${rollCurse(st, data)}.`;
    const card = topCard(t.box), sp = spellOf(data, card.id);
    card.awake = true;
    if (!sp) return `${lead} the writing is smudged.`;
    const learnable = res === 'learn-and-awaken' && ownsChitOf(st, sp.type) && !(st.ch.learned ?? []).includes(sp.id);
    if (learnable) {
        st.pending = { type: 'learn-spell', spell: sp.id, from: t.label, lead, full: (st.ch.spells ?? []).length >= MAX_SPELLS };
        return 'wait';
    }
    const why = res === 'awaken' ? 'you may only look at it' : !ownsChitOf(st, sp.type) ? `you have no Type ${sp.type} Magic chit to learn it with` : 'you have already learned it';
    return `${lead} ${sp.name} (Type ${sp.type}, ${sp.color ?? 'any colour'}): ${why}.`;
}

// He decides whether to write the spell down.
// `pick` is the card chosen among p.choices (Magic Sight's Perceive spell shows several); the default is p.spell.
export function learnSpell(st, data, learn, p, erase = null, pick = null) {
    if (pick && !p.choices?.some(c => c.spell === pick && c.learnable)) throw new Error('you cannot learn that spell');
    const sp = spellOf(data, pick ?? p.spell);
    if (learn) {
        if ((st.ch.spells ?? []).length >= MAX_SPELLS) {
            if (!erase || !st.ch.spells.includes(erase)) throw new Error(`you may know at most ${MAX_SPELLS} spells: say which one to erase`);
            st.ch.spells = st.ch.spells.filter(x => x !== erase); st.ch.learned = (st.ch.learned ?? []).filter(x => x !== erase);
            say(st, `You erase ${spellOf(data, erase)?.name ?? erase} from your sheet to make room.`, 'info');
        }
        (st.ch.spells ??= []).push(sp.id);
        (st.ch.learned ??= []).push(sp.id);
        const text = `${p.lead} you learn ${sp.name} (Type ${sp.type}, ${sp.color ?? 'any colour'}).`;
        say(st, text, 'loot');
        return text;
    }
    const text = `${p.lead} you look at ${sp.name} (Type ${sp.type}) and leave it.`;
    say(st, text, 'info');
    return text;
}
