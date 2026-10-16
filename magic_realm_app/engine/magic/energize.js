import { say } from '../core.js';
import { tileClearings } from '../world.js';
import { colorSources, colorChits, TYPE_COLOR } from './colour.js';
import { spellDef } from './registry.js';
import { idleFx, wakeFx } from './fx.js';

// Energizing Permanent spells (rules 4.6.7h; docs/design/magic/00-framework.md section 3.1). A Permanent spell lives forever but acts only while it is
// energized. fx.state is 'live' (energized) or 'inert'; fx.energized is null or { by: 'cast'|'auto'|'chit', day }.
//   - cast: the colour was present when it was cast, so it starts energized (fx.js addFx);
//   - at Midnight it goes inert unless an automatic source that is not the calendar (a Chapel, an enchanted tile) still supplies its colour;
//   - at day start, at the end of every phase and at the start of every combat round the colour is looked for again (calendar included);
//   - a colour chit of the right colour played by a character in the spell's place wakes it (a free action, energizeWith).
// The spell's place is where its first target is: a clearing, or the clearings of a tile. A target we cannot place (a character on a road) counts
// the calendar only. Generic: a transmorph spell (Transform, Melt into Mist) needs only to be dur 'permanent' and to implement apply/unapply.

// Where the spell is: the clearings whose colours count for it.
export function fxPlaces(st, data, fx) {
    const t = fx.targets?.[0];
    if (!t) return [st.ch.at ?? null];
    if (t.kind === 'char') return [st.ch.onRoad ? null : st.ch.at];
    if (t.kind === 'clearing') return [t.id];
    if (t.kind === 'tile') return tileClearings(st, data, t.id);
    if (t.kind === 'mon' || t.kind === 'nat') {
        const x = (t.kind === 'mon' ? st.mons : st.nats).find(m => m.id === t.id);
        return [x?.loc?.c ?? null];
    }
    return [st.ch.at ?? null];
}

// The colours that fill the spell's place. With { calendar: false } only the sources that stay at Midnight (Chapel, enchanted tile or card).
export function fxSupply(st, data, fx, { calendar = true } = {}) {
    const out = new Set();
    for (const place of fxPlaces(st, data, fx)) for (const s of colorSources(st, data, place)) if (calendar || !s.calendar) out.add(s.color);
    return out;
}
const fits = (def, supply) => (def?.color ? supply.has(def.color) : supply.size > 0);          // a spell of "any" colour wants some colour

// Wake every inert Permanent spell whose colour fills its place now. Returns how many woke.
export function energizePass(st, data, why = 'pass') {
    let n = 0;
    for (const fx of (st.fx ?? []).slice()) {
        if (fx.dur !== 'permanent' || fx.state !== 'inert') continue;
        if (fits(spellDef(data, fx.spell), fxSupply(st, data, fx))) { wakeFx(st, data, fx.id, 'auto'); n++; say(st, `${spellDef(data, fx.spell)?.name ?? fx.spell} is energized again.`, 'info'); }
    }
    return n;
}
// Midnight: every energized Permanent spell falls inert unless a source that stays after the calendar still fills its place.
export function deenergizePass(st, data) {
    let n = 0;
    for (const fx of (st.fx ?? []).slice()) {
        if (fx.dur !== 'permanent' || fx.state !== 'live') continue;
        if (!fits(spellDef(data, fx.spell), fxSupply(st, data, fx, { calendar: false }))) { idleFx(st, data, fx.id); n++; say(st, `${spellDef(data, fx.spell)?.name ?? fx.spell} falls inert at Midnight.`, 'info'); }
    }
    return n;
}

// What he could do now: [{ fx, spell, name, chits: [chit id] }] for each inert Permanent spell in his place that one of his colour chits would wake.
export function energizeOptions(st, data) {
    const out = [];
    for (const fx of st.fx ?? []) {
        if (fx.dur !== 'permanent' || fx.state !== 'inert' || !fxPlaces(st, data, fx).includes(st.ch.at ?? '-')) continue;
        const def = spellDef(data, fx.spell);
        const chits = colorChits(st, def?.color ?? null).map(c => c.id);
        if (chits.length) out.push({ fx: fx.id, spell: fx.spell, name: def?.name ?? fx.spell, chits });
    }
    return out;
}
// The free action: burn one enchanted chit of the right colour to wake one inert spell.
export function energizeWith(st, data, fxId, chitId) {
    const o = energizeOptions(st, data).find(x => x.fx === fxId);
    if (!o) throw new Error('that spell cannot be energized now');
    const chit = st.ch.chits.find(c => c.id === (chitId ?? o.chits[0]));
    if (!chit || !o.chits.includes(chit.id)) throw new Error('that chit does not hold the right colour');
    chit.state = 'fatigued';
    wakeFx(st, data, fxId, 'chit');
    say(st, `You use up an enchanted ${TYPE_COLOR[chit.numeral]} chit to energize ${o.name}.`, 'info');
}
