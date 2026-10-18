import { die, roll2, say, noteRoll } from '../core.js';
import { PEER, LOCATE } from '../tables.js';
import { oneDie, modRoll, modNote } from '../modifiers.js';
import { lootFrom, sitesHere, applySearchResult } from '../search.js';
import { runesTargets, spellOf, MAX_SPELLS } from '../runes.js';
import { fxTags, HERO } from './fx.js';

// Magic Sight (rule 7.5.7, tables.json `magicSight`; docs/design/magic/00-framework.md section 4 item 6, 02-day-spells.md section 16).
// It replaces the Search tables Peer, Locate, Loot (site and ground) and Reading Runes with one table. It does not replace the Peer *activity* of a companion or a
// spell, nor the Treasure-within-Treasure site-card tables. It is forced on a character by the Witch King's Disembodied advantage, by the Phantom Glass and by the
// World Fades spell; two sources cancel and three bring it back, so what counts is the parity of the sources (RealmSpeak CharacterWrapper 2720-2748 toggles it).

// The things that put him under Magic Sight now: ['the Disembodied advantage', 'the Phantom Glass', 'World Fades'].
export function sightSources(st, data) {
    const out = [];
    if ((st.ch.adv ?? []).includes('disembodied')) out.push('the Disembodied advantage');
    if (st.ch.items.some(i => i.kind === 'treasure' && i.id === 'phantom-glass' && i.active && !i.destroyed)) out.push('the Phantom Glass');
    for (const t of fxTags(st, HERO, 'magicSight')) out.push(data?.spells?.[t.fx.spell]?.name ?? t.fx.spell);
    return out;
}
export const magicSightOn = (st, data = null) => sightSources(st, data).length % 2 === 1;

// The tables Magic Sight takes the place of.
export const SIGHT_REPLACES = new Set(['peer', 'locate', 'loot', 'ground', 'runes']);

const LABEL = { choice: 'Choice', counters: 'Counters', 'treasure-cards': 'Treasure cards', 'perceive-spell': 'Perceive spell', 'discover-chits': 'Discover chits', nothing: 'Nothing' };
// 7.5.7f (decision of the evidence pass, Q&A "RESOLVED"): a Choice is any result of the Peer or Locate table, nothing from the Magic Sight table.
export const sightChoices = () => [...new Set([...PEER, ...LOCATE].filter(x => x !== 'Choice' && x !== 'Nothing'))];

// What a result tells him about creatures hidden here: he may find only hidden enemies of that kind today (7.5.7c-e). Nothing in the engine hides denizens from
// him yet, so this is a record for the day (cleared at Birdsong), like the Peer table's "hidden enemies".
const noteEnemies = (st, kind) => { (st.ch.findEnemies ??= {})[kind] = true; };

// One Search phase on the Magic Sight table. Returns the text for the log, or 'wait' when the player must answer (st.pending is set).
export function doMagicSight(st, data) {
    let r;
    if (oneDie(st, 'search', st.ch.at, data)) { const d1 = die(st); r = { dice: [d1], value: d1 }; } else r = roll2(st);
    const raw = [...r.dice];
    modRoll(st, data, 'magicsight', r);                                  // Illusion and Bad Luck add one (4.1.2)
    const res = data.tables.magicSight[String(r.value)];
    noteRoll(st, 'Search: Magic Sight', raw, r.value, (LABEL[res] ?? res) + modNote(r));
    switch (res) {
        case 'choice':
            st.pending = { type: 'search-choice', table: 'magicsight', options: sightChoices(), roll: raw };
            return 'wait';
        case 'counters': noteEnemies(st, 'counters'); return take(st, data, raw, ['weapon', 'armor', 'horse'], 'counter');
        case 'treasure-cards': noteEnemies(st, 'treasures'); return take(st, data, raw, ['treasure'], 'treasure card');
        case 'perceive-spell': noteEnemies(st, 'spells'); return perceive(st, data, raw, null);
        case 'discover-chits': return applySearchResult(st, data, 'magicsight', 'Discover chits', raw);
        default: return `Magic Sight (${raw.join('+')}): nothing.`;
    }
}

// Counters / Treasure cards: take the top item of that kind from ONE discovered site or abandoned pile in his clearing (a site must be discovered, i.e. crossed off,
// before anything is taken from it; Q&A). With two such piles he chooses. The usual conditions of the pile apply (Vault, Pool, Cairns, a card that is a site).
function candidates(st, kinds) {
    const here = st.ch.at, out = [];
    const site = sitesHere(st)[0], sitePile = site && st.sites?.[site.name];
    if (Array.isArray(sitePile)) { const k = sitePile.findIndex(x => kinds.includes(x.kind)); if (k >= 0) out.push({ label: `the ${site.name}`, ground: false, idx: k }); }
    const ground = st.abandoned?.[here];
    if (ground?.length) { const k = ground.findIndex(x => kinds.includes(x.kind)); if (k >= 0) out.push({ label: 'the things on the ground', ground: true, idx: k }); }
    return out;
}
function take(st, data, dice, kinds, noun, pick = null) {
    const cands = candidates(st, kinds), lead = `Magic Sight (${dice.join('+')})`;
    if (!cands.length) return `${lead}: no ${noun} lies in a discovered site or on the ground here.`;
    let c = cands[0];
    if (cands.length > 1) {
        c = cands.find(x => x.label === pick);
        if (!c) { st.pending = { type: 'search-choice', table: 'magicsight-take', options: cands.map(x => x.label), roll: dice, kinds, noun }; return 'wait'; }
    }
    return lootFrom(st, data, { dice, value: c.idx + 1 }, c.ground, { sight: true });
}
// The answer to the pile question (day.js 'search-choice').
export const takeChosen = (st, data, p, label) => take(st, data, p.roll, p.kinds, p.noun, label);

// Perceive spell: he sees every spell card of one active Artifact or Spell Book, or of one discovered Site, and may learn the one he wants WITHOUT awakening it
// (a Reading Runes "learn and awaken" would awaken it; this does not, and cannot bring a curse). An Artifact's added (Enchant Artifact) spells are among those he sees.
// Returns the log text or 'wait' (a 'runes-target' question with sight:true, or a 'learn-spell' question with the cards to choose from).
export function perceive(st, data, dice, targetKey) {
    const targets = runesTargets(st, data).filter(t => !t.extra);
    const lead0 = `Magic Sight (${dice?.join('+') ?? ''})`;
    if (!targets.length) return `${lead0}: you perceive no spell cards: there is no discovered site and no active Artifact or Book here.`;
    if (!targetKey && targets.length > 1) { st.pending = { type: 'runes-target', sight: true, roll: dice, options: targets.map(t => ({ key: t.key, label: t.label })) }; return 'wait'; }
    const t = targets.find(x => x.key === targetKey) ?? targets[0];
    const cards = [...t.box.map(c => spellOf(data, c.id)), ...(t.item?.extra ?? []).map(e => spellOf(data, e.spell))].filter(Boolean);
    const owns = type => st.ch.chits.some(c => c.type === 'magic' && c.numeral === type);
    const choices = cards.map(sp => ({ spell: sp.id, name: sp.name, type: sp.type, color: sp.color ?? null, learnable: owns(sp.type) && !(st.ch.learned ?? []).includes(sp.id) }));
    const list = choices.map(c => `${c.name} (Type ${c.type}${c.learnable ? '' : ', cannot learn'})`).join(', ');
    const lead = `${lead0} you perceive the spells of ${t.label.toLowerCase()}: ${list || 'none'}.`;
    const first = choices.find(c => c.learnable);
    if (!first) return `${lead} You cannot learn any of them.`;
    st.pending = { type: 'learn-spell', spell: first.spell, from: t.label, lead, full: (st.ch.spells ?? []).length >= MAX_SPELLS, choices, sight: true };
    return 'wait';
}
