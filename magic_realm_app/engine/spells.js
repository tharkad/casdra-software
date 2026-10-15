import { say } from './core.js';
import { effortLimit } from './modifiers.js';

// Spells (rules 4.6, 8.3.9). Only the spells marked implemented in data/src/spells.json can be cast; today that is the White Knight's Make Whole.
// A spell is cast in the Encounter step of an Evening combat round by playing a Magic chit of its numeral while its colour of magic is present.

// Colours of magic (rules 4.6.2, 6.1.2). The seventh day of each week fills the whole land with one colour (White and Black together on day 7,
// then Grey on 14, Purple on 21 and Gold on 28), from the morning until midnight. A Chapel supplies White in its own clearing. Enchanted tiles and
// cards are not modelled yet (they need the Enchant action).
export const COLORS = ['White', 'Grey', 'Gold', 'Purple', 'Black'];
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

export const knownSpells = (st, data) => (st.ch.spells ?? []).map(id => data.spells?.[id]).filter(s => s?.implemented);

// What Make Whole would put right: tired or wounded chits other than the one casting it, and damaged armor.
function mends(st, exceptChit) {
    return st.ch.chits.some(c => c.id !== exceptChit && (c.state === 'fatigued' || c.state === 'wounded'))
        || st.ch.items.some(i => i.kind === 'armor' && i.damaged && !i.destroyed);
}

// Every way he could cast something now: [{ spell, chit, useful }]. `round` is the combat in progress (omit before it has begun).
export function castOptions(st, data) {
    if (st.ch.dead || st.ch.onRoad) return [];
    const c = st.combat;
    if (c?.casts?.length) return [];                                    // one spell per round
    const colors = colorsAt(st, data, st.ch.at);
    const spent = c ? (c.asterisks?.move ?? 0) + (c.asterisks?.fight ?? 0) + (c.asterisks?.magic ?? 0) : 0;
    const out = [];
    for (const spell of knownSpells(st, data)) {
        if (spell.color && !colors.has(spell.color)) continue;
        for (const chit of st.ch.chits) {
            if (chit.type !== 'magic' || chit.state !== 'active' || chit.numeral !== spell.type) continue;
            if (c?.played?.[chit.id]) continue;
            if (spent + chit.effort > effortLimit(st)) continue;
            out.push({ spell: spell.id, name: spell.name, chit: chit.id, effort: chit.effort, time: chit.time, useful: spell.id === 'make-whole' ? mends(st, chit.id) : true });
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
        if (!spell.color || here.has(spell.color)) continue;
        const next = nextDayWith(spell.color, st.day, st.lastDay ?? 28);
        const chapel = spell.color === 'White' ? ' It is also here in the clearing of a Chapel.' : '';
        out.push({ spell: spell.id, name: spell.name, color: spell.color,
            why: `Needs ${spell.color} magic.${next ? ` ${spell.color} fills the land on day ${next}.` : ''}${chapel}` });
    }
    return out;
}

export const canCastUsefully = (st, data) => castOptions(st, data).some(o => o.useful);

// Play the chit and put the spell on the round's list; the effect comes when the round is resolved (Melee, spell effects).
export function castSpell(st, data, spellId, chitId) {
    const c = st.combat;
    const opt = castOptions(st, data).find(o => o.spell === spellId && o.chit === chitId);
    if (!opt) throw new Error('you cannot cast that now');
    c.played[chitId] = true;
    c.asterisks.magic = (c.asterisks.magic ?? 0) + opt.effort;
    (c.casts ??= []).push({ spell: spellId, chit: chitId });
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
