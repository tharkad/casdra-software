import { say } from '../core.js';
import { nameOf } from '../items.js';
import { effortLimit, chitSpeed } from '../modifiers.js';
import { COLORS, TYPE_COLOR, colorChits, colorsAt, nextDayWith } from './colour.js';
import { HANDLERS, handlerOf, spellDef } from './registry.js';
import { addFx, breakFx, fxTags, HERO, sameRef } from './fx.js';
import { cancelCasts } from './util.js';

// Casting (rules 4.6, 8.3.9, 8.4). A spell is cast in the Encounter step of an Evening combat round by playing a Magic chit of its numeral while its
// colour of magic is present; it comes to life in the Melee step. The chit is `committed` from the moment it is played; it tires when the spell ends
// (at once for an Instant or Attack spell, later for Combat, Day and Permanent spells).

// Attack spells (rule 8.4.4): they ride in the attack circle like a weapon, with the casting chit's time. Each handler carries its numbers.
// (built on first use: the modules import each other, so the registry may not be filled yet when this file loads)
let attackMap = null;
const attacks = () => (attackMap ??= Object.fromEntries(Object.values(HANDLERS).filter(h => h.attack && !h.attack.auto).map(h => [h.id, h.attack])));
export const ATTACK_SPELLS = new Proxy({}, { get: (_, k) => attacks()[k], has: (_, k) => k in attacks(), ownKeys: () => Reflect.ownKeys(attacks()),
    getOwnPropertyDescriptor: (_, k) => (k in attacks() ? { enumerable: true, configurable: true, value: attacks()[k] } : undefined) });
// A spell this build can cast: the ones with a handler, or that the data marks as implemented.
export const castable = sp => !!(sp && (sp.implemented || handlerOf(sp.id)));
export const knownSpells = (st, data) => (st.ch.spells ?? []).map(id => spellDef(data, id)).filter(castable);

// The time a Magic chit acts at: 0 when alerted, else its printed time, or the number its asterisks fix under a Draught or Garb of Speed (kernel rules/chitTime.js via chitSpeed).
const timeOf = (st, chit) => (chit.alerted ? 0 : chitSpeed(st, chit));

// A Pentangle keeps every new spell off its target (it stops only spells aimed at him). A spell with no aim list whose only target is the caster (`selfOnly`)
// is barred while he stands in one.
const barred = (st, ref) => !!ref && (fxTags(st, ref, 'noNewSpells').length > 0 || (!!st.combat?.peaceNow && (ref.kind === 'mon' || ref.kind === 'nat')));          // (a Pentangle; or a Wish for Peace in force: no spell may name a denizen)
// true, or why the spell cannot be cast now: the handler's own conditions, then whether any legal target is left.
function legalOf(st, data, h, spell) {
    if (!h) return true;
    if (h.legal) { const r = h.legal(st, data, { spell }); if (r !== true) return r; }
    if (h.selfOnly && barred(st, HERO)) return 'A Pentangle holds off every new spell aimed at you, your own included.';
    if (h.aim) { const o = h.aim(st, data, { cast: null }); if (o && o.filter(x => !barred(st, x.ref)).length < (h.targets?.min ?? 1)) return 'Every legal target is shielded (a Pentangle, or the Wish for Peace).'; }
    return true;
}

// Every way he could cast something now: [{ spell, name, chit, colorChit, effort, time, useful }]. `slowest` is the speed of the slowest creature facing him:
// a Magic chit may be no slower than it (8.3.7a; other chits must be strictly faster).
// 8.4.3c (ruling R8, Mike 2026-10-26: the recommendation, a base rule): while a spell he cast with a Magic chit remains in effect, its spell box is tied up and he cannot use it. A spell he
// knows is out of reach when every box that holds it is tied: the boxes are the times it stands in his book, and a box is tied by one live, inert, nullified or held effect of it whose
// source Magic chit is still committed to it. (A second box holding the same spell can still cast it; startFx releases the duplicate, 4.6.10e.)
export function boxesTied(st, id) {
    const boxes = (st.ch.spells ?? []).filter(x => x === id).length;
    if (!boxes) return false;
    const tied = (st.fx ?? []).filter(f => f.spell === id && f.state !== 'done' && f.source?.kind === 'chit' && (!f.who || f.who === st.ch.id)
        && st.ch.chits.some(c => c.id === f.source.id && c.state === 'committed' && c.tie === f.id)).length;
    return tied >= boxes;
}

export function castOptions(st, data, { slowest = 99 } = {}) {
    if (st.ch.dead || st.ch.onRoad || st.ch.flying || st.ch.mist || st.ch.morph) return [];        // (mist can do only Move and Hide, nothing is cast in the air, and a creature casts nothing: his Magic chits are not in play)
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
        if (legalOf(st, data, h, spell) !== true) continue;
        if (boxesTied(st, spell.id)) continue;
        if (h?.aim && fxTags(st, HERO, 'noSpecify').length) continue;          // Peace on him: he cannot specify a target for a spell (LS Peace 2)
        for (const chit of st.ch.chits) {
            if (chit.type !== 'magic' || chit.state !== 'active' || chit.numeral !== spell.type || chit.alt?.mf) continue;          // a chit changed by Unleash Power is no Magic chit
            if (c?.played?.[chit.id]) continue;
            if (spent + chit.effort > effortLimit(st)) continue;
            if (timeOf(st, chit) > slowest) continue;
            const opt = { spell: spell.id, name: spell.name, colorChit: supply?.id ?? null, chit: chit.id, effort: chit.effort, time: timeOf(st, chit) };
            opt.useful = h?.useful ? !!h.useful(st, data, opt) : true;
            opt.quiet = !opt.useful && !!h?.quiet?.(st, data, opt);
            out.push(opt);
        }
    }
    return [...out, ...itemCastOptions(st, data, colors)];
}

// Awakened spell cards of the artifacts and spell books he carries and has active (4.6.6): cast at time 0, no Magic chit, no effort, once per Evening for each
// numeral, and the item stays tied to the spell for as long as it lives. He need not know the spell. [{ spell, name, item, chit: null, ... }]
export function itemCastOptions(st, data, colors = colorsAt(st, data, st.ch.at)) {
    const out = [], c = st.combat;
    if (st.ch.morph) return out;
    for (const it of st.ch.items) {
        if (it.destroyed || !it.active || it.kind !== 'treasure') continue;
        const box = st.spellBox?.items?.[nameOf(data, it)];
        if (!box?.length) continue;
        // the spells Enchant Artifact added to it count as awakened cards of their own Magic type (artifacts.js; item.extra exists only while that spell is energized)
        const seen = new Set(), ownNumerals = new Set([data.treasures?.[it.card ?? it.id]?.magic?.numeral, ...(it.extra ?? []).map(e => e.type)]);
        for (const card of [...box, ...(it.extra ?? []).map(e => ({ id: e.spell, awake: true }))]) {
            if (!card.awake || seen.has(card.id)) continue;
            seen.add(card.id);
            const spell = spellDef(data, card.id), h = spell && handlerOf(spell.id);
            if (!spell || !castable(spell)) continue;
            if (!ownNumerals.has(spell.type)) continue;          // 4.6.6b: the item acts as a Magic chit of ITS printed numeral only (the Good Book is Magic I and 'cannot cast the Type VII spells'), plus what Enchant Artifact added
            if (it.usedEvening?.[spell.type] === st.day || it.tied?.[spell.type]) continue;
            if (c?.casts?.length) continue;
            const need = spell.color ? !colors.has(spell.color) : colors.size === 0;
            const supply = need ? (spell.color ? colorChits(st, spell.color)[0] : colorChits(st)[0]) : null;
            if (need && !supply) continue;
            if (legalOf(st, data, h, spell) !== true) continue;
            const opt = { spell: spell.id, name: spell.name, colorChit: supply?.id ?? null, chit: null, item: it.uid, effort: 0, time: 0, from: nameOf(data, it) };
            opt.useful = h?.useful ? !!h.useful(st, data, opt) : true;
            opt.quiet = !opt.useful && !!h?.quiet?.(st, data, opt);
            out.push(opt);
        }
    }
    return out;
}

// Why a spell he knows cannot be cast now: its colour is missing (and when it will come), or every ready chit of its numeral is too slow, or none is ready.
// [{ spell, name, color, why }]
export function blockedSpells(st, data, { slowest = 99 } = {}) {
    if (st.ch.dead || st.ch.onRoad || st.ch.flying || st.ch.mist || st.ch.morph) return [];        // (mist can do only Move and Hide, nothing is cast in the air, and a creature casts nothing: his Magic chits are not in play)
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
        { const why = legalOf(st, data, h, spell); if (why !== true) { out.push({ ...base, why }); continue; } }
        if (boxesTied(st, spell.id)) { out.push({ ...base, why: 'Its spell box is tied up by the spell you cast with it, which is still in effect (8.4.3c).' }); continue; }
        const ready = st.ch.chits.filter(c => c.type === 'magic' && c.state === 'active' && c.numeral === spell.type && !c.alt?.mf);
        if (!ready.length) { out.push({ ...base, why: `You have no ready Magic ${spell.type} chit.` }); continue; }
        if (st.combat && ready.every(c => timeOf(st, c) > slowest)) out.push({ ...base, why: `Your Magic ${spell.type} chit is too slow: a Magic chit must be no slower than the fastest creature facing you (time ${slowest}). Alert it in an Alert phase and it acts at time 0.` });
    }
    return out;
}

// A spell's `useful` says it is worth casting against what is here now (a fight). `quiet` says it has a legitimate use in an evening with nothing hostile about (a buff for
// tomorrow, a long-lived Permanent spell, a call that brings monsters): handler.quiet(st, data, opt). A quiet evening is held open for the player whenever either holds
// (rules 8.1.3a, 8.3.9b.1, 8.8.3); spells with neither (Curse, Pentangle, Premonition, Violent Storm, Fog...) are still castable but never worth stopping the evening for.
export const canCastUsefully = (st, data) => castOptions(st, data).some(o => o.useful);
// Rule 8.8.3: combat is held every evening a spell could be cast. By default the engine holds a quiet evening only for a spell that would do something (`useful` or `quiet`);
// with the game option `castAnytime` (the owner's choice, 2026-10-20: a player who can cast wants to be asked) any castable spell holds it.
export const canCastQuietly = (st, data) => castOptions(st, data).some(o => st.options?.castAnytime || o.useful || o.quiet);

// What a cast of `opt` (one of castOptions) would ask to be aimed at, before it is played: the same aim entry the Melee step shows ({ spell, name, options, min, max, params }),
// or null when the spell needs no target. Used by the quiet-evening cast, which has no Melee step in between.
export function previewAim(st, data, opt) {
    const c = st.combat;
    if (!c) return null;
    const cast = { spell: opt.spell, chit: opt.chit ?? null, item: opt.item ?? null, time: opt.time ?? 0 };
    (c.casts ??= []).push(cast);
    try { return aimOptions(st, data).find(a => a.spell === opt.spell) ?? null; }
    finally { c.casts.splice(c.casts.indexOf(cast), 1); }
}

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
        (c.casts ??= []).push({ spell: spellId, item: itemUid, time: 0, colour, colorChit: opt.colorChit });
        say(st, `You cast ${opt.name} from your ${opt.from}.`, 'combat');
    } else {
        const chit = st.ch.chits.find(x => x.id === chitId);
        chit.state = 'committed'; chit.tie = null; chit.alerted = false;
        c.played[chitId] = true;
        c.asterisks.magic = (c.asterisks.magic ?? 0) + opt.effort;
        (c.casts ??= []).push({ spell: spellId, chit: chitId, time: opt.time, colour, colorChit: opt.colorChit });
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
        const h = handlerOf(cast.spell), all = h?.aim?.(st, data, { cast }), options = all?.filter(o => !barred(st, o.ref));
        if (!options) continue;
        out.push({ spell: cast.spell, name: spellDef(data, cast.spell)?.name ?? cast.spell, options, min: h.targets?.min ?? 1, max: h.targets?.max ?? 1, params: typeof h.params === 'function' ? h.params(st, data, { cast }) : (h.params ?? null) });
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
        cast.targets = refs.map(r => a.options.find(o => sameRef(o.ref, r)).ref);          // the full reference of the option, not what the caller sent
        cast.params = given.params ?? {};
    }
}

// Bring the round's spells to life, lowest time first (equal times are simultaneous). Called once, at the start of resolution, so only what was damaged
// in earlier rounds is mended.
export function resolveCasts(st, data, log = t => say(st, t, 'combat')) {
    const c = st.combat;
    const todo = (c.casts ?? []).filter(x => !x.done).sort((a, b) => (handlerOf(a.spell)?.first ? -1 : 0) - (handlerOf(b.spell)?.first ? -1 : 0) || (a.time ?? 99) - (b.time ?? 99));   // Exorcise acts before all others
    for (const cast of todo) {
        if (cast.done) continue;                                          // an earlier spell (Exorcise) cancelled it
        if (c.ended || st.ch.dead) { cancelCasts(st, data, null); break; }       // the combat is over (a Wish) or he is dead: nothing more comes to life
        cast.done = true;
        const chit = cast.chit ? st.ch.chits.find(x => x.id === cast.chit) : null;
        const item = cast.item ? st.ch.items.find(i => i.uid === cast.item) : null;
        const h = handlerOf(cast.spell), def = spellDef(data, cast.spell);
        // a spell cast with no melee step in between (the quiet-evening cast) takes the handler's own choice of target
        if (!cast.targets && h?.aim) { const options = h.aim(st, data, { cast }); if (options?.length) cast.targets = autoTargets(st, data, cast.spell, options); }
        const dur = (def?.duration ?? h?.dur ?? 'Instant').toLowerCase();
        const ctx = {
            st, data, spell: def, cast, caster: HERO, source: item ? { kind: 'item', id: item.uid, type: def?.type } : { kind: 'chit', id: cast.chit, type: chit?.numeral }, targets: cast.targets ?? [], params: cast.params ?? {}, log, say: log,
            fx: spec => {
                const fx = addFx(st, data, { spell: cast.spell, dur, source: ctx.source, colour: cast.colour, targets: ctx.targets, ...spec });
                if (chit && chit.state === 'committed') chit.tie = fx.id;
                if (item) (item.tied ??= {})[def.type] = fx.id;                 // the item stays tied to its spell while it lives
                return fx;
            },
        };
        // a Pentangle that came to life earlier this round keeps a spell aimed at its target out; the spell is spent
        if ((h?.selfOnly && barred(st, HERO)) || (cast.targets ?? []).some(t => barred(st, t))) log(`${def?.name ?? cast.spell} is held off by a Pentangle and fizzles.`);
        else {
            // naming a creature that a spell made peaceful (Peace, Persuade) breaks that spell
            for (const t of cast.targets ?? []) for (const { fx } of fxTags(st, t, 'nameBreaks')) { log(`${spellDef(data, fx.spell)?.name ?? fx.spell} is broken: its target was named.`); breakFx(st, data, fx.id, 'its target was named'); }
            h?.start?.(ctx);
        }
        // an Instant or Attack spell leaves its chit fatigued at once; any other keeps it committed for as long as its effect lives (tie set by ctx.fx)
        if (chit && chit.state === 'committed' && !chit.tie) chit.state = 'fatigued';
        c.eventful = true;
    }
}

export { COLORS };
