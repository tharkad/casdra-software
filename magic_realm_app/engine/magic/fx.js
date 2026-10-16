import { say } from '../core.js';
import { handlerOf } from './registry.js';

// The store of spell effects: st.fx, one list for everything cast (a character, a monster, a clearing, a tile or an item can each be the target).
// An effect is plain JSON. How it changes the game is the spell handler's business (tags consulted by the rules, or an overlay with apply/unapply);
// this file keeps the list, ends things at the right moment, and says when the list is inconsistent. See docs/design/magic/00-framework.md section 2.
//
//   { id: 'f3', spell, dur: 'instant'|'attack'|'combat'|'day'|'phase'|'fly'|'permanent', caster: ref, source: { kind:'chit'|'item', id, type },
//     targets: [ref], colour, castDay, castRound, expires: null | { day, at: 'sunset'|'midnight'|'round-end'|'phase-end' }, state: 'live'|'inert'|'nullified'|'held'|'done',
//     energized: null | { by, day }, strength, data }
//   a ref is { kind: 'char'|'mon'|'nat'|'clearing'|'tile'|'fx'|'chit'|'item', id }

export const ref = (kind, id) => ({ kind, id });
export const sameRef = (a, b) => !!a && !!b && a.kind === b.kind && String(a.id) === String(b.id);
export const HERO = ref('char', 'ch');

const ctxFor = (st, data, fx) => ({ st, data, fx, spell: data.spells?.[fx.spell] ?? null, caster: fx.caster, source: fx.source, targets: fx.targets, say: t => say(st, t, 'combat') });

export function addFx(st, data, spec) {
    st.fx ??= []; st.fxSeq = (st.fxSeq ?? 0) + 1;
    const fx = { id: 'f' + st.fxSeq, dur: 'instant', caster: HERO, source: null, targets: [], colour: null, castDay: st.day, castRound: st.combat?.round ?? null,
        expires: null, state: 'live', energized: null, strength: 0, data: {}, ...spec };
    if (fx.dur === 'permanent' && fx.state === 'live' && !fx.energized) fx.energized = { by: 'cast', day: st.day };     // cast while its colour was present
    st.fx.push(fx);
    handlerOf(fx.spell)?.apply?.(ctxFor(st, data, fx), fx);
    return fx;
}

// The effects that match all the given fields: target is a ref, tag a name a handler's `tags` returns. Only effects that are in force (live) unless `any`.
export function fxList(st, { target, spell, caster, tag, state, any = false, dur } = {}) {
    return (st.fx ?? []).filter(f => (any || f.state === 'live') && (!state || f.state === state) && (!spell || f.spell === spell) && (!dur || f.dur === dur)
        && (!target || f.targets.some(t => sameRef(t, target))) && (!caster || sameRef(f.caster, caster)) && (!tag || tagsOf(f)[tag] !== undefined));
}
const tagsOf = fx => handlerOf(fx.spell)?.tags?.(fx) ?? {};

// The one query the rules use: what do the live effects on this target say about `tag`? [{ fx, value }]
export function fxTags(st, target, tag) {
    return (st.fx ?? []).filter(f => f.state === 'live' && (!target || f.targets.some(t => sameRef(t, target)))).map(f => ({ fx: f, value: tagsOf(f)[tag] })).filter(x => x.value !== undefined);
}
// Is the target shielded from bewitching spells and curses (Pentangle, Protection from Magic, Melt into Mist)?
export const shielded = (st, target) => fxTags(st, target, 'shield').length > 0;

// ---- ending ----
function finish(st, data, fx, why, broken) {
    if (fx.state === 'done') return;
    const was = fx.state;
    fx.state = 'done';
    if (was === 'live' || was === 'held') handlerOf(fx.spell)?.unapply?.(ctxFor(st, data, fx), fx, { why, broken });
    // the chit that cast it is released: it tires now (a spell leaves its Magic chit fatigued once it ends)
    const chit = fx.source?.kind === 'chit' ? st.ch?.chits?.find(c => c.id === fx.source.id) : null;
    if (chit && chit.state === 'committed' && chit.tie === fx.id) { chit.state = 'fatigued'; chit.tie = null; }
    const item = fx.source?.kind === 'item' ? st.ch?.items?.find(i => i.uid === fx.source.id) : null;
    if (item?.tied) for (const k of Object.keys(item.tied)) if (item.tied[k] === fx.id) delete item.tied[k];
}
export function expireFx(st, data, id, why = 'expired') {
    const fx = (st.fx ?? []).find(f => f.id === id); if (!fx) return;
    finish(st, data, fx, why, false);
    sweep(st);
}
// Ended by another spell, a curse remover, or the caster's death: it counts as "broken" for the cards that talk about that.
export function breakFx(st, data, id, why = 'broken') {
    const fx = (st.fx ?? []).find(f => f.id === id); if (!fx) return;
    finish(st, data, fx, why, true);
    sweep(st);
}
export function nullifyFx(st, data, id) {
    const fx = (st.fx ?? []).find(f => f.id === id);
    if (!fx || fx.state !== 'live') return;
    handlerOf(fx.spell)?.unapply?.(ctxFor(st, data, fx), fx, { why: 'nullified', broken: false });
    fx.state = 'nullified';
}
export function restoreFx(st, data, id) {
    const fx = (st.fx ?? []).find(f => f.id === id);
    if (!fx || fx.state !== 'nullified') return;
    fx.state = 'live';
    handlerOf(fx.spell)?.apply?.(ctxFor(st, data, fx), fx);
}
// A Permanent spell that is not energized is alive but inert (4.6.7h): its effect is switched off and, unlike nullified, it wakes by itself (see energize.js).
export function idleFx(st, data, id) {
    const fx = (st.fx ?? []).find(f => f.id === id);
    if (!fx || fx.state !== 'live' || fx.dur !== 'permanent') return;
    handlerOf(fx.spell)?.unapply?.(ctxFor(st, data, fx), fx, { why: 'inert', broken: false });
    fx.state = 'inert'; fx.energized = null;
}
export function wakeFx(st, data, id, by) {
    const fx = (st.fx ?? []).find(f => f.id === id);
    if (!fx || fx.state !== 'inert') return;
    fx.state = 'live'; fx.energized = { by, day: st.day };
    handlerOf(fx.spell)?.apply?.(ctxFor(st, data, fx), fx);
}
// A Phase spell is held until the target activates it like an item (4.6.8, 8.3.9): it then lives until the end of that phase or combat round.
export function activateFx(st, data, id, expires) {
    const fx = (st.fx ?? []).find(f => f.id === id);
    if (!fx || fx.state !== 'held') throw new Error('that spell is not waiting to be used');
    fx.state = 'live'; fx.expires = expires;
    handlerOf(fx.spell)?.apply?.(ctxFor(st, data, fx), fx);
}
const sweep = st => { st.fx = (st.fx ?? []).filter(f => f.state !== 'done'); };

// Everything due at a moment: 'round-end' | 'phase-end' | 'sunset' | 'midnight' | 'death' | 'game-end'. Day spells end at Sunset of the day they expire on,
// Combat spells at Midnight, Phase spells at the end of the phase or round they were used in.
export function expireDue(st, data, when) {
    for (const fx of (st.fx ?? []).slice()) {
        if (fx.state === 'done') continue;
        const e = fx.expires;
        if (when === 'game-end') { finish(st, data, fx, 'the game ended', true); continue; }
        if (!e || e.at !== when) continue;
        if (e.day != null && st.day < e.day) continue;
        finish(st, data, fx, `ended at ${when}`, false);
    }
    sweep(st);
}
// A target that is gone (a controlled monster killed, a hired native whose term ended): it leaves every spell it was in; a spell with no target left ends.
export function targetGone(st, data, target) {
    for (const f of (st.fx ?? []).slice()) {
        if (f.state === 'done' || !f.targets.some(t => sameRef(t, target))) continue;
        f.targets = f.targets.filter(t => !sameRef(t, target));
        if (!f.targets.length) finish(st, data, f, 'its targets are gone', false);
    }
    sweep(st);
}
// Everything a character cast through a chit ends with him; what an item cast stays.
export function breakAllFrom(st, data, casterRef, { keepItemCast = true } = {}) {
    for (const fx of (st.fx ?? []).slice()) if (sameRef(fx.caster, casterRef) && !(keepItemCast && fx.source?.kind === 'item')) finish(st, data, fx, 'its caster is gone', true);
    sweep(st);
}

// The list must be consistent after every action: returns the problems (empty when well). Used by the tests and the grind.
export function checkFx(st) {
    const bad = [];
    const ids = new Set();
    for (const f of st.fx ?? []) {
        if (ids.has(f.id)) bad.push(`duplicate fx id ${f.id}`); ids.add(f.id);
        if (f.state === 'done') bad.push(`${f.id} is done but still listed`);
        if (!f.spell || !f.dur) bad.push(`${f.id} has no spell or duration`);
        if (f.dur !== 'permanent' && f.state === 'inert') bad.push(`${f.id} (${f.spell}) is inert but not permanent`);
        if (f.expires?.day != null && st.day > f.expires.day && f.expires.at === 'sunset' && f.state === 'live' && st.period !== 'sunset') bad.push(`${f.id} (${f.spell}) is live past its expiry`);
    }
    for (const c of st.ch?.chits ?? []) {
        // (a chit played in the Encounter step is committed before its spell comes to life in the Melee step: that spell is on the round's list, not yet in st.fx)
        if (c.state === 'committed') { const f = (st.fx ?? []).find(x => x.id === c.tie); if (!f && !st.combat?.casts?.some(x => x.chit === c.id && !x.done)) bad.push(`chit ${c.id} is committed with no spell`); }
    }
    for (const f of st.fx ?? []) if (f.source?.kind === 'chit' && f.dur !== 'instant' && f.dur !== 'attack') {
        const c = st.ch?.chits?.find(x => x.id === f.source.id);
        if (!c || c.state !== 'committed' || c.tie !== f.id) bad.push(`${f.id} (${f.spell}) lost the chit that holds it`);
    }
    return bad;
}
