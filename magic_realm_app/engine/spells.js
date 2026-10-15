import { say } from './core.js';
import { effortLimit } from './modifiers.js';
import { isMountain } from './world.js';

// Spells (rules 4.6, 8.3.9). Only the spells marked implemented in data/src/spells.json can be cast; today that is the White Knight's Make Whole.
// A spell is cast in the Encounter step of an Evening combat round by playing a Magic chit of its numeral while its colour of magic is present.

// Colours of magic (rules 4.6.2, 6.1.2). The seventh day of each week fills the whole land with one colour (White and Black together on day 7,
// then Grey on 14, Purple on 21 and Gold on 28), from the morning until midnight. A Chapel supplies White in its own clearing. Enchanted tiles and
// cards are not modelled yet (they need the Enchant action).
export const COLORS = ['White', 'Grey', 'Gold', 'Purple', 'Black'];
// Magic chits of Types I to V can be enchanted into a colour chit (4.6.4f); VI to VIII cannot.
export const TYPE_COLOR = { I: 'White', II: 'Grey', III: 'Gold', IV: 'Purple', V: 'Black' };
export const enchantableChits = st => st.ch.chits.filter(c => c.type === 'magic' && c.state === 'active' && TYPE_COLOR[c.numeral]);
export const colorChits = (st, color = null) => st.ch.chits.filter(c => c.type === 'magic' && c.state === 'enchanted' && (!color || TYPE_COLOR[c.numeral] === color));
export const COLOR_MEANING = {
    White: 'Power from on High', Grey: 'Natural laws', Gold: 'Woods sprites', Purple: 'Elemental energies', Black: 'Demonic',
};
const WEEK_COLORS = [['White', 'Black'], ['Grey'], ['Purple'], ['Gold']];            // day 7, 14, 21, 28 (and again for a longer game)
export const isMagicDay = day => day > 0 && day % 7 === 0;
export const dayColors = day => (isMagicDay(day) ? WEEK_COLORS[((day / 7) - 1) % 4] : []);
// The next day on or after `from` that fills the land with `color`, or null when it never will in a game of `lastDay` days.
export function nextDayWith(color, from, lastDay = 28) {
    for (let d = from; d <= lastDay; d++) if (dayColors(d).includes(color)) return d;
    return null;
}
// Every colour present in a clearing, with where it comes from: [{ color, why }].
export function colorSources(st, data, clearing) {
    const out = dayColors(st.day).map(color => ({ color, why: `day ${st.day} fills the land with magic` }));
    if (st.dwellings.some(d => d.kind === 'Chapel' && d.at === clearing)) out.push({ color: 'White', why: 'the Chapel in this clearing' });
    return out;
}
export function colorsAt(st, data, clearing) {
    return new Set(colorSources(st, data, clearing).map(x => x.color));
}

// Attack spells (rule 8.4.4): they ride in the attack circle like a weapon, with the casting chit's time. `only` restricts where they can be cast.
export const ATTACK_SPELLS = {
    'stones-fly':     { harm: 'L', stars: 1, length: 15, hits: 4, missile: true },                    // four L* attacks, split among the targets
    'fiery-blast':    { harm: 'L', stars: 3, length: 13, hits: 1, missile: true },
    'lightning-bolt': { harm: 'M', stars: 3, length: 18, hits: 1, missile: true, only: 'mountain' },
};
// A spell this build can cast: the ones whose effect is written (data marks the first; the table above adds the attack spells).
export const castable = sp => !!(sp && (sp.implemented || ATTACK_SPELLS[sp.id]));
export const knownSpells = (st, data) => (st.ch.spells ?? []).map(id => data.spells?.[id] ?? Object.values(data.spells ?? {}).find(x => x.id === id)).filter(castable);
// Is he where the spell may be cast? (Lightning Bolt needs a mountain clearing.)
function placeOk(st, data, spell) {
    const only = ATTACK_SPELLS[spell.id]?.only;
    if (!only) return true;
    return only === 'mountain' ? isMountain(st, data, st.ch.at) : true;
}

// What Make Whole would put right: tired or wounded chits other than the one casting it, and damaged armor.
function mends(st, exceptChit) {
    return st.ch.chits.some(c => c.id !== exceptChit && (c.state === 'fatigued' || c.state === 'wounded'))
        || st.ch.items.some(i => i.kind === 'armor' && i.damaged && !i.destroyed);
}

const foesHere = st => !!st.combat?.dens.some(d => !d.dead && d.kind !== 'horse' && d.kind !== 'part');

// Every way he could cast something now: [{ spell, chit, useful }]. `round` is the combat in progress (omit before it has begun).
export function castOptions(st, data) {
    if (st.ch.dead || st.ch.onRoad) return [];
    const c = st.combat;
    if (c?.casts?.length) return [];                                    // one spell per round
    const colors = colorsAt(st, data, st.ch.at);
    const spent = c ? (c.asterisks?.move ?? 0) + (c.asterisks?.fight ?? 0) + (c.asterisks?.magic ?? 0) : 0;
    const out = [];
    for (const spell of knownSpells(st, data)) {
        // a colour of magic that is not present may be supplied by one of his own enchanted chits, which is used up
        const need = spell.color && !colors.has(spell.color);
        const supply = need ? colorChits(st, spell.color)[0] : null;
        if (need && !supply) continue;
        if (!placeOk(st, data, spell)) continue;
        for (const chit of st.ch.chits) {
            if (chit.type !== 'magic' || chit.state !== 'active' || chit.numeral !== spell.type) continue;
            if (c?.played?.[chit.id]) continue;
            if (spent + chit.effort > effortLimit(st)) continue;
            out.push({ spell: spell.id, name: spell.name, colorChit: supply?.id ?? null, chit: chit.id, effort: chit.effort, time: chit.time, useful: spell.id === 'make-whole' ? mends(st, chit.id) : ATTACK_SPELLS[spell.id] ? foesHere(st) : true });
        }
    }
    return out;
}

// Spells he knows that cannot be cast right now because their colour is missing, with the reason and when it will next be there.
export function blockedSpells(st, data) {
    if (st.ch.dead || st.ch.onRoad) return [];
    const here = colorsAt(st, data, st.ch.at);
    const out = [];
    for (const spell of knownSpells(st, data)) {
        if (!spell.color || here.has(spell.color) || colorChits(st, spell.color).length) continue;
        const next = nextDayWith(spell.color, st.day, st.lastDay ?? 28);
        const chapel = spell.color === 'White' ? ' It is also here in the clearing of a Chapel.' : '';
        const chit = ` Or enchant a Type ${Object.entries(TYPE_COLOR).find(([, col]) => col === spell.color)?.[0] ?? '?'} Magic chit in an Enchant phase to hold ${spell.color} magic yourself.`;
        out.push({ spell: spell.id, name: spell.name, color: spell.color,
            why: `Needs ${spell.color} magic.${next ? ` ${spell.color} fills the land on day ${next}.` : ''}${chapel}${chit}` });
    }
    return out;
}

export const canCastUsefully = (st, data) => castOptions(st, data).some(o => o.useful);

// Play the chit and put the spell on the round's list; the effect comes when the round is resolved (Melee, spell effects).
export function castSpell(st, data, spellId, chitId) {
    const c = st.combat;
    const opt = castOptions(st, data).find(o => o.spell === spellId && o.chit === chitId);
    if (!opt) throw new Error('you cannot cast that now');
    if (opt.colorChit) { st.ch.chits.find(x => x.id === opt.colorChit).state = 'fatigued'; say(st, `You use up an enchanted chit for its ${data.spells[spellId]?.color ?? ''} magic.`, 'combat'); }
    c.played[chitId] = true;
    c.asterisks.magic = (c.asterisks.magic ?? 0) + opt.effort;
    (c.casts ??= []).push({ spell: spellId, chit: chitId });
    if (ATTACK_SPELLS[spellId]) c.attackSpell = { spell: spellId, chit: chitId, ...ATTACK_SPELLS[spellId] };      // used in this round's melee, or lost
    say(st, `You cast ${opt.name}, playing Magic ${st.ch.chits.find(x => x.id === chitId).numeral}${opt.time}${'*'.repeat(opt.effort)}.`, 'combat');
}

// Bring the round's spells to life. Called once, at the start of resolution, so only what was damaged in earlier rounds is mended.
export function resolveSpells(st, data, log = t => say(st, t, 'combat')) {
    const c = st.combat;
    for (const cast of c.casts ?? []) {
        if (cast.done) continue;
        cast.done = true;
        const chit = st.ch.chits.find(x => x.id === cast.chit);
        if (cast.spell === 'make-whole') {
            let chits = 0, armor = 0;
            for (const x of st.ch.chits) if (x !== chit && (x.state === 'fatigued' || x.state === 'wounded')) { x.state = 'active'; chits++; }
            for (const it of st.ch.items) if (it.kind === 'armor' && it.damaged && !it.destroyed) { it.damaged = false; armor++; }
            log(`Make Whole: ${chits} action chit${chits === 1 ? '' : 's'} restored${armor ? ` and ${armor} piece${armor === 1 ? '' : 's'} of armor repaired` : ''}.`);
            c.eventful = true;
        }
        if (chit) chit.state = 'fatigued';                       // an Instant spell leaves the chit that cast it fatigued
    }
}
