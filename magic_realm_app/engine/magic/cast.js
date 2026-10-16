import { say } from '../core.js';
import { nameOf } from '../items.js';
import { effortLimit } from '../modifiers.js';
import { COLORS, TYPE_COLOR, colorChits, colorsAt, nextDayWith } from './colour.js';
import { HANDLERS, handlerOf, spellDef } from './registry.js';
import { addFx, HERO, sameRef } from './fx.js';

// Casting (rules 4.6, 8.3.9, 8.4). A spell is cast in the Encounter step of an Evening combat round by playing a Magic chit of its numeral while its
// colour of magic is present; it comes to life in the Melee step. The chit is `committed` from the moment it is played; it tires when the spell ends
// (at once for an Instant or Attack spell, later for Combat, Day and Permanent spells).

// Attack spells (rule 8.4.4): they ride in the attack circle like a weapon, with the casting chit's time. Each handler carries its numbers.
// (built on first use: the modules import each other, so the registry may not be filled yet when this file loads)
let attackMap = null;
const attacks = () => (attackMap ??= Object.fromEntries(Object.values(HANDLERS).filter(h => h.attack).map(h => [h.id, h.attack])));
export const ATTACK_SPELLS = new Proxy({}, { get: (_, k) => attacks()[k], has: (_, k) => k in attacks(), ownKeys: () => Reflect.ownKeys(attacks()),
    getOwnPropertyDescriptor: (_, k) => (k in attacks() ? { enumerable: true, configurable: true, value: attacks()[k] } : undefined) });
// A spell this build can cast: the ones with a handler, or that the data marks as implemented.
export const castable = sp => !!(sp && (sp.implemented || handlerOf(sp.id)));
export const knownSpells = (st, data) => (st.ch.spells ?? []).map(id => spellDef(data, id)).filter(castable);

const timeOf = chit => (chit.alerted ? 0 : chit.time);

// Every way he could cast something now: [{ spell, name, chit, colorChit, effort, time, useful }]. `slowest` is the speed of the slowest creature facing him:
// a Magic chit may be no slower than it (8.3.7a; other chits must be strictly faster).
export function castOptions(st, data, { slowest = 99 } = {}) {
    if (st.ch.dead || st.ch.onRoad) return [];
    const c = st.combat;
    if (c?.casts?.length) return [];                                    // one spell per round
    const colors = colorsAt(st, data, st.ch.at);
    const spent = c ? (c.asterisks?.move ?? 0) + (c.asterisks?.fight ?? 0) + (c.asterisks?.magic ?? 0) : 0;
    const out = [];
    for (const spell of knownSpells(st, data)) {
        const h = handlerOf(spell.id);
        // a colour of magic that is not present may be supplied by one of his own enchanted chits, which is used up. A spell of "any" colour needs some colour.
        const need = spell.color ? !colors.has(spell.color) : colors.size === 0;
        const supply = need ? (spell.color ? colorChits(st, spell.color)[0] : colorChits(st)[0]) : null;
        if (need && !supply) continue;
        if (h?.legal && h.legal(st, data, { spell }) !== true) continue;
        for (const chit of st.ch.chits) {
            if (chit.type !== 'magic' || chit.state !== 'active' || chit.numeral !== spell.type) continue;
            if (c?.played?.[chit.id]) continue;
            if (spent + chit.effort > effortLimit(st)) continue;
            if (timeOf(chit) > slowest) continue;
            const opt = { spell: spell.id, name: spell.name, colorChit: supply?.id ?? null, chit: chit.id, effort: chit.effort, time: timeOf(chit) };
            opt.useful = h?.useful ? !!h.useful(st, data, opt) : true;
            out.push(opt);
        }
    }
    return [...out, ...itemCastOptions(st, data, colors)];
}

// Awakened spell cards of the artifacts and spell books he carries and has active (4.6.6): cast at time 0, no Magic chit, no effort, once per Evening for each
// numeral, and the item stays tied to the spell for as long as it lives. He need not know the spell. [{ spell, name, item, chit: null, ... }]
export function itemCastOptions(st, data, colors = colorsAt(st, data, st.ch.at)) {
    const out = [], c = st.combat;
    for (const it of st.ch.items) {
        if (it.destroyed || !it.active || it.kind !== 'treasure') continue;
        const box = st.spellBox?.items?.[nameOf(data, it)];
        if (!box?.length) continue;
        for (const card of box) {
            if (!card.awake) continue;
            const spell = spellDef(data, card.id), h = spell && handlerOf(spell.id);
            if (!spell || !castable(spell)) continue;
            if (it.usedEvening?.[spell.type] === st.day || it.tied?.[spell.type]) continue;
            if (c?.casts?.length) continue;
            const need = spell.color ? !colors.has(spell.color) : colors.size === 0;
            const supply = need ? (spell.color ? colorChits(st, spell.color)[0] : colorChits(st)[0]) : null;
            if (need && !supply) continue;
            if (h?.legal && h.legal(st, data, { spell }) !== true) continue;
            const opt = { spell: spell.id, name: spell.name, colorChit: supply?.id ?? null, chit: null, item: it.uid, effort: 0, time: 0, from: nameOf(data, it) };
            opt.useful = h?.useful ? !!h.useful(st, data, opt) : true;
            out.push(opt);
        }
    }
    return out;
}

// Why a spell he knows cannot be cast now: its colour is missing (and when it will come), or every ready chit of its numeral is too slow, or none is ready.
// [{ spell, name, color, why }]
export function blockedSpells(st, data, { slowest = 99 } = {}) {
    if (st.ch.dead || st.ch.onRoad) return [];
    const here = colorsAt(st, data, st.ch.at);
    const out = [];
    for (const spell of knownSpells(st, data)) {
        const h = handlerOf(spell.id);
        const base = { spell: spell.id, name: spell.name, color: spell.color };
        const missing = spell.color ? !here.has(spell.color) && !colorChits(st, spell.color).length : here.size === 0 && !colorChits(st).length;
        if (missing) {
            const next = spell.color ? nextDayWith(spell.color, st.day, st.lastDay ?? 28) : null;
            const chapel = spell.color === 'White' ? ' It is also here in the clearing of a Chapel.' : '';
            const chit = spell.color ? ` Or enchant a Type ${Object.entries(TYPE_COLOR).find(([, col]) => col === spell.color)?.[0] ?? '?'} Magic chit in an Enchant phase to hold ${spell.color} magic yourself.` : ' Or enchant a Magic chit in an Enchant phase to hold a colour yourself.';
            out.push({ ...base, why: `Needs ${spell.color ?? 'some'} magic.${next ? ` ${spell.color} fills the land on day ${next}.` : ''}${chapel}${chit}` });
            continue;
        }
        if (h?.legal) { const why = h.legal(st, data, { spell }); if (why !== true) { out.push({ ...base, why }); continue; } }
        const ready = st.ch.chits.filter(c => c.type === 'magic' && c.state === 'active' && c.numeral === spell.type);
        if (!ready.length) { out.push({ ...base, why: `You have no ready Magic ${spell.type} chit.` }); continue; }
        if (st.combat && ready.every(c => timeOf(c) > slowest)) out.push({ ...base, why: `Your Magic ${spell.type} chit is too slow: a Magic chit must be no slower than the fastest creature facing you (time ${slowest}). Alert it in an Alert phase and it acts at time 0.` });
    }
    return out;
}

export const canCastUsefully = (st, data) => castOptions(st, data).some(o => o.useful);

// Play the chit and put the spell on the round's list; the effect comes when the round is resolved (Melee, spell effects).
export function castSpell(st, data, spellId, chitId, itemUid = null) {
    const c = st.combat;
    const opt = castOptions(st, data).find(o => o.spell === spellId && (itemUid ? o.item === itemUid : o.chit === chitId && !o.item));
    if (!opt) throw new Error('you cannot cast that now');
    if (opt.colorChit) { st.ch.chits.find(x => x.id === opt.colorChit).state = 'fatigued'; say(st, `You use up an enchanted chit for its ${data.spells[spellId]?.color || 'magic'} magic.`, 'combat'); }
    const def = data.spells[spellId] ?? spellDef(data, spellId), colour = opt.colorChit ? def?.color ?? null : null;
    if (itemUid) {
        const it = st.ch.items.find(i => i.uid === itemUid);
        (it.usedEvening ??= {})[def.type] = st.day;                       // once per Evening for each numeral
        (c.casts ??= []).push({ spell: spellId, item: itemUid, time: 0, colour });
        say(st, `You cast ${opt.name} from your ${opt.from}.`, 'combat');
    } else {
        const chit = st.ch.chits.find(x => x.id === chitId);
        chit.state = 'committed'; chit.tie = null; chit.alerted = false;
        c.played[chitId] = true;
        c.asterisks.magic = (c.asterisks.magic ?? 0) + opt.effort;
        (c.casts ??= []).push({ spell: spellId, chit: chitId, time: opt.time, colour });
        say(st, `You cast ${opt.name}, playing Magic ${chit.numeral}${opt.time}${'*'.repeat(opt.effort)}.`, 'combat');
    }
    const atk = handlerOf(spellId)?.attack;
    if (atk) c.attackSpell = { spell: spellId, chit: chitId, item: itemUid, ...atk };      // used in this round's melee, or lost
    c.eventful = true;                                                     // a spell cast is an event: the quiet rounds do not count
}

// The Melee step names what each spell is aimed at (8.4.2): for every spell cast this round whose handler has an `aim`, the legal targets and how many may be named.
//   handler.aim(st, data, { cast }) -> [{ ref, label }] | null      (null: it needs no target)
//   handler.targets = { min, max }                                   (default exactly one)
export function aimOptions(st, data) {
    const out = [];
    for (const cast of st.combat?.casts ?? []) {
        if (cast.done) continue;
        const h = handlerOf(cast.spell), options = h?.aim?.(st, data, { cast });
        if (!options) continue;
        out.push({ spell: cast.spell, name: spellDef(data, cast.spell)?.name ?? cast.spell, options, min: h.targets?.min ?? 1, max: h.targets?.max ?? 1, params: h.params ?? null });
    }
    return out;
}
// With nothing named: the handler's own choice (`autoAim(options, st, data) -> [ref]`, e.g. every eligible chit), else the first legal targets.
function autoTargets(st, data, spell, options) {
    const h = handlerOf(spell);
    return h?.autoAim?.(options, st, data) ?? options.slice(0, h?.targets?.min ?? 1).map(o => o.ref);
}
// Check what the player named against what is legal and store it on the casts. With nothing named, the first legal targets are taken (computer players, and a lone choice).
export function applyAim(st, data, spellAim = {}) {
    for (const a of aimOptions(st, data)) {
        const given = spellAim?.[a.spell] ?? {};
        let refs = given.targets;
        if (!refs) refs = autoTargets(st, data, a.spell, a.options);
        for (const r of refs) if (!a.options.some(o => sameRef(o.ref, r))) throw new Error(`${a.name} cannot be aimed at that`);
        if (refs.length < a.min || refs.length > a.max) throw new Error(`${a.name}: choose ${a.min === a.max ? a.min : `${a.min} to ${a.max}`} target${a.max === 1 ? '' : 's'}`);
        const cast = st.combat.casts.find(x => x.spell === a.spell && !x.done);
        cast.targets = refs; cast.params = given.params ?? {};
    }
}

// Bring the round's spells to life, lowest time first (equal times are simultaneous). Called once, at the start of resolution, so only what was damaged
// in earlier rounds is mended.
export function resolveCasts(st, data, log = t => say(st, t, 'combat')) {
    const c = st.combat;
    const todo = (c.casts ?? []).filter(x => !x.done).sort((a, b) => (a.time ?? 99) - (b.time ?? 99));
    for (const cast of todo) {
        cast.done = true;
        const chit = cast.chit ? st.ch.chits.find(x => x.id === cast.chit) : null;
        const item = cast.item ? st.ch.items.find(i => i.uid === cast.item) : null;
        const h = handlerOf(cast.spell), def = spellDef(data, cast.spell);
        // a spell cast with no melee step in between (the quiet-evening cast) takes the handler's own choice of target
        if (!cast.targets && h?.aim) { const options = h.aim(st, data, { cast }); if (options?.length) cast.targets = autoTargets(st, data, cast.spell, options); }
        const dur = (def?.duration ?? h?.dur ?? 'Instant').toLowerCase();
        const ctx = {
            st, data, spell: def, caster: HERO, source: item ? { kind: 'item', id: item.uid, type: def?.type } : { kind: 'chit', id: cast.chit, type: chit?.numeral }, targets: cast.targets ?? [], params: cast.params ?? {}, log, say: log,
            fx: spec => {
                const fx = addFx(st, data, { spell: cast.spell, dur, source: ctx.source, colour: cast.colour, targets: ctx.targets, ...spec });
                if (chit && chit.state === 'committed') chit.tie = fx.id;
                if (item) (item.tied ??= {})[def.type] = fx.id;                 // the item stays tied to its spell while it lives
                return fx;
            },
        };
        h?.start?.(ctx);
        // an Instant or Attack spell leaves its chit fatigued at once; any other keeps it committed for as long as its effect lives (tie set by ctx.fx)
        if (chit && chit.state === 'committed' && !chit.tie) chit.state = 'fatigued';
        c.eventful = true;
    }
}

export { COLORS };
