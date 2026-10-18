import { say } from '../core.js';
import { withActor } from '../party.js';
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
// With several characters in a game every effect remembers who cast it (`who`, a character id), because HERO means "the acting character": an effect on HERO, or cast by him, is
// his and nobody else's. `elsewhere` is true for such an effect when somebody else is acting. (With one character `who` is never written and nothing is ever elsewhere.)
export const elsewhere = (st, f) => !!f.who && f.who !== st.actor && (f.targets.some(t => sameRef(t, HERO)) || sameRef(f.caster, HERO));

const ctxFor = (st, data, fx) => ({ st, data, fx, spell: data.spells?.[fx.spell] ?? null, caster: fx.caster, source: fx.source, targets: fx.targets, say: t => say(st, t, 'combat') });

export function addFx(st, data, spec) {
    st.fx ??= []; st.fxSeq = (st.fxSeq ?? 0) + 1;
    const fx = { id: 'f' + st.fxSeq, dur: 'instant', caster: HERO, source: null, targets: [], colour: null, castDay: st.day, castRound: st.combat?.round ?? null,
        expires: null, state: 'live', energized: null, strength: handlerOf(spec.spell)?.strength ?? 0, data: {}, ...spec };
    if (fx.dur === 'permanent' && fx.state === 'live' && !fx.energized) fx.energized = { by: 'cast', day: st.day };     // cast while its colour was present
    if (st.order?.length > 1 && fx.who === undefined) fx.who = st.actor;
    st.fx.push(fx);
    if (fx.state === 'live' && !claim(st, data, fx)) { fx.state = 'inert'; fx.energized = null; say(st, `${data.spells?.[fx.spell]?.name ?? fx.spell} is overridden by a stronger spell on the same target and lies dormant.`, 'combat'); return fx; }
    handlerOf(fx.spell)?.apply?.(ctxFor(st, data, fx), fx);
    return fx;
}

// ---- Permanent transmorph spells on one target (Absorb Essence 1, Transform 2, Melt into Mist 3) ----
// Only one of them can shape a target at a time (rules 4.6.10e-f; RealmSpeak SpellMasterWrapper.energizePermanentSpells, spell_strength). The stronger takes the target
// and the weaker lies dormant (inert, to wake when the stronger is gone). Equal strength: a spell cast or energized on purpose (a chit played) takes the target from
// the other (Absorb Essence card, clause 3: the most recently energized spell transmorphizes him), but one that wakes by itself (the colour of the day, an enchanted
// place) does not push out a live one, or two would swap places at every phase. A handler opts in with `transmorph: true` and a `strength`; every way a spell comes
// alive (cast, woken, restored) asks `claim` first. The spells put in the dormant state have had `unapply` called on them, so the handler needs no extra code for it.
// (two characters are each "HERO" in their own effects: a spell on one does not compete with a spell on the other)
const sameWho = (f, g) => (f.who ?? null) === (g.who ?? null);
const isTransmorph = f => f.dur === 'permanent' && !!handlerOf(f.spell)?.transmorph;
// Is this spell held down by a stronger one on its target (so that energizing it would do nothing)?
export const heldDown = (st, fx) => isTransmorph(fx) && (st.fx ?? []).some(f => f !== fx && f.state === 'live' && isTransmorph(f) && sameWho(f, fx) && f.strength > fx.strength && f.targets.some(t => fx.targets.some(u => sameRef(t, u))));
export function claim(st, data, fx, { onPurpose = true } = {}) {
    if (!isTransmorph(fx)) return true;
    const rivals = (st.fx ?? []).filter(f => f !== fx && f.state === 'live' && isTransmorph(f) && sameWho(f, fx) && f.targets.some(t => fx.targets.some(u => sameRef(t, u))));
    if (rivals.some(f => f.strength > fx.strength || (!onPurpose && f.strength === fx.strength))) return false;
    for (const f of rivals) {
        handlerOf(f.spell)?.unapply?.(ctxFor(st, data, f), f, { why: 'displaced', broken: false });
        f.state = 'inert'; f.energized = null;
        say(st, `${data.spells?.[f.spell]?.name ?? f.spell} is overridden by ${data.spells?.[fx.spell]?.name ?? fx.spell}.`, 'combat');
    }
    return true;
}

// The effects that match all the given fields: target is a ref, tag a name a handler's `tags` returns. Only effects that are in force (live) unless `any`.
export function fxList(st, { target, spell, caster, tag, state, any = false, dur } = {}) {
    return (st.fx ?? []).filter(f => !elsewhere(st, f) && (any || f.state === 'live') && (!state || f.state === state) && (!spell || f.spell === spell) && (!dur || f.dur === dur)
        && (!target || f.targets.some(t => sameRef(t, target))) && (!caster || sameRef(f.caster, caster)) && (!tag || tagsOf(f)[tag] !== undefined));
}
const tagsOf = fx => handlerOf(fx.spell)?.tags?.(fx) ?? {};

// The one query the rules use: what do the live effects on this target say about `tag`? [{ fx, value }]
export function fxTags(st, target, tag) {
    // (what a spell does to a creature, an item or a place is true for everybody in the fight, whoever cast it; what is done to a character's person is his alone)
    const aboutMe = !target || sameRef(target, HERO);
    return (st.fx ?? []).filter(f => f.state === 'live' && (!aboutMe || !elsewhere(st, f)) && (!target || f.targets.some(t => sameRef(t, target)))).map(f => ({ fx: f, value: tagsOf(f)[tag] })).filter(x => x.value !== undefined);
}
// Is the target shielded from bewitching spells and curses (Pentangle, Protection from Magic, Melt into Mist)?
export const shielded = (st, target) => fxTags(st, target, 'shield').length > 0;

// ---- ending ----
// (A spell another character broke, dissolved or dispelled ends AS ITS CASTER: its handler undoes the caster's form, mist or flight on the caster. With one character, or his own spell, nothing changes.)
const asCaster = (st, fx, f) => (fx.who && fx.who !== st.actor && st.chars?.[fx.who] ? withActor(st, fx.who, f) : f());
function finish(st, data, fx, why, broken) {
    if (fx.state === 'done') return;
    const was = fx.state;
    fx.state = 'done';
    if (was === 'live' || was === 'held') asCaster(st, fx, () => handlerOf(fx.spell)?.unapply?.(ctxFor(st, data, fx), fx, { why, broken }));
    asCaster(st, fx, () => handlerOf(fx.spell)?.release?.(ctxFor(st, data, fx), fx, { why, broken, was }));          // (a handler holding something for the whole life of the spell, live or not, lets it go: Absorb Essence)
    // the chit that cast it is released: it tires now (a spell leaves its Magic chit fatigued once it ends)
    // (it is the CASTER's chit or item that is let go, whoever is acting now: another character's blow may be what breaks a spell)
    const owner = fx.who && st.chars?.[fx.who] ? st.chars[fx.who] : st.ch;
    const chit = fx.source?.kind === 'chit' ? owner?.chits?.find(c => c.id === fx.source.id) : null;
    if (chit && chit.state === 'committed' && chit.tie === fx.id) { chit.state = 'fatigued'; chit.tie = null; }
    const item = fx.source?.kind === 'item' ? owner?.items?.find(i => i.uid === fx.source.id) : null;
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
    if (!claim(st, data, fx, { onPurpose: false })) { fx.state = 'inert'; fx.energized = null; return; }          // beaten by a stronger spell meanwhile: dormant until that one is gone
    handlerOf(fx.spell)?.apply?.(ctxFor(st, data, fx), fx);
}
// A Permanent spell that is not energized is alive but inert (4.6.7h): its effect is switched off and, unlike nullified, it wakes by itself (see energize.js).
export function idleFx(st, data, id) {
    const fx = (st.fx ?? []).find(f => f.id === id);
    if (!fx || fx.state !== 'live' || fx.dur !== 'permanent') return;
    handlerOf(fx.spell)?.unapply?.(ctxFor(st, data, fx), fx, { why: 'inert', broken: false });
    fx.state = 'inert'; fx.energized = null;
}
// Returns whether it woke (a transmorph spell beaten by a stronger one on its target stays inert).
export function wakeFx(st, data, id, by) {
    const fx = (st.fx ?? []).find(f => f.id === id);
    if (!fx || fx.state !== 'inert') return false;
    fx.state = 'live'; fx.energized = { by, day: st.day };
    if (!claim(st, data, fx, { onPurpose: by !== 'auto' })) { fx.state = 'inert'; fx.energized = null; return false; }
    handlerOf(fx.spell)?.apply?.(ctxFor(st, data, fx), fx);
    return true;
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
    for (const fx of (st.fx ?? []).slice()) if (sameRef(fx.caster, casterRef) && !elsewhere(st, fx) && !(keepItemCast && fx.source?.kind === 'item')) finish(st, data, fx, 'its caster is gone', true);
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
    // the hero's forms and locations the spells set must agree with the records that set them (Melt into Mist: st.ch.mist; Broomstick, Hurricane Winds: st.ch.flying)
    const mine = (st.fx ?? []).filter(f => !elsewhere(st, f));          // (several characters: the effects of the one acting)
    if (st.ch?.mist && !mine.some(f => f.spell === 'melt-into-mist' && f.state === 'live')) bad.push('he is mist with no live Melt into Mist');
    if (!st.ch?.mist && mine.some(f => f.spell === 'melt-into-mist' && f.state === 'live' && !f.data?.duplicate)) bad.push('Melt into Mist is live but he is not mist');
    if (st.ch?.flying && (!st.ch.flying.tile || !st.placements?.some(p => p.id === st.ch.flying.tile))) bad.push('he is in the air over a tile that is not on the map');
    for (const c of st.ch?.chits ?? []) {
        // (a chit played in the Encounter step is committed before its spell comes to life in the Melee step: that spell is on the round's list, not yet in st.fx)
        if (c.state === 'committed') { const f = (st.fx ?? []).find(x => x.id === c.tie); if (!f && !st.combat?.casts?.some(x => x.chit === c.id && !x.done)) bad.push(`chit ${c.id} is committed with no spell`); }
    }
    // transmorph spells: at most one is shaping a target; the hero's form belongs to a live spell; what Absorb Essence holds is out of play
    const shaping = mine.filter(f => f.state === 'live' && isTransmorph(f));
    for (const f of shaping) if (shaping.some(g => g !== f && g.targets.some(t => f.targets.some(u => sameRef(t, u))))) bad.push(`${f.id} (${f.spell}) shares its target with another live transmorph`);
    if (st.ch?.morph) {
        const f = (st.fx ?? []).find(x => x.id === st.ch.morph.fx);
        if (!f || f.state !== 'live') bad.push('the hero has a form but no live spell gives it');
    }
    for (const f of st.fx ?? []) if (f.spell === 'absorb-essence' && f.state !== 'done') {
        const m = st.mons?.find(x => x.id === f.data?.mon);
        if (!m || m.absorbed !== f.id || m.dead || m.loc?.c) bad.push(`${f.id}: the absorbed monster ${f.data?.mon} is not held`);
    }
    for (const m of st.mons ?? []) if (m.absorbed && !(st.fx ?? []).some(f => f.id === m.absorbed && f.state !== 'done')) bad.push(`monster ${m.id} is absorbed by a spell that is gone`);
    for (const f of mine) if (f.source?.kind === 'chit' && f.dur !== 'instant' && f.dur !== 'attack') {
        const c = st.ch?.chits?.find(x => x.id === f.source.id);
        if (!c || c.state !== 'committed' || c.tie !== f.id) bad.push(`${f.id} (${f.spell}) lost the chit that holds it`);
    }
    return bad;
}
