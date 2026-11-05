import { B } from './bridge.js';
import { neighbor } from '../hex.js';
import { expireFx, sameRef } from './fx.js';
import { handlerOf } from './registry.js';
const HANDLER_TAGS = f => handlerOf(f.spell)?.tags?.(f) ?? {};

// Small helpers the spell handlers share. This file imports only the bridge (a leaf), so handlers can use it without import cycles.

// The enchanted colour chits he used up for this round's casts: they are tired and stay tired (a repair spell mends only what was tired before the round).
export const spentThisRound = st => new Set((st.combat?.casts ?? []).map(x => x.colorChit).filter(Boolean));

// ---- the creatures of this combat, as spell targets ----
// A denizen on the combat sheet as a reference (what an effect stores) and back.
export const denRef = d => ({ kind: d.kind, id: d.id });
export const denOf = (st, ref) => (st.combat?.dens ?? []).find(d => d.kind === ref?.kind && d.id === ref.id && !d.dead) ?? null;
// Everything that can be named as a target: the live monsters and natives (not their parts or horses).
export const foes = st => (st.combat?.dens ?? []).filter(d => !d.dead && d.kind !== 'part' && d.kind !== 'horse');
export const foeName = (st, data, d) => B.denSide(st, data, d).name;
export const foeTargets = (st, data) => foes(st).map(d => ({ ref: denRef(d), label: foeName(st, data, d) }));
// Naming a target gives away a hidden caster (8.4.2).
export function reveal(ctx) {
    const { st } = ctx;
    if (st.ch.hidden) { st.ch.hidden = false; ctx.log('You give yourself away by naming a target.'); }
}
export const spellName = (data, id) => data.spells?.[id]?.name ?? id;

// ---- effects and curses in his clearing (Remedy, Exorcise) ----
// Is this target of an effect in his clearing? The hero, a creature on the combat sheet, his hirelings and controlled monsters (they follow him), the clearing
// itself, or the tile it lies in.
export function hereRef(st, ref) {
    const at = st.ch.at;
    if (!ref) return false;
    switch (ref.kind) {
        case 'char': return ref.id === 'ch' ? true : !!st.others?.[ref.id];
        case 'mon': case 'nat': {
            if ((st.combat?.dens ?? []).some(d => d.kind === ref.kind && d.id === ref.id && !d.dead)) return true;
            const o = (ref.kind === 'mon' ? st.mons : st.nats).find(x => x.id === ref.id);
            return !!o && !o.dead && (o.loc?.c === at || (o.hired && !!at));
        }
        case 'item': return st.ch.items.some(i => i.uid === ref.id && !i.destroyed);
        case 'chit': return st.ch.chits.some(c => c.id === ref.id);
        case 'clearing': return ref.id === at;
        case 'tile': return !!at && at.slice(0, 2) === ref.id;
        default: return false;
    }
}
export const fxHere = (st, f) => f.targets.some(t => hereRef(st, t));
// An effect cast this round (it is not yet "in effect": Remedy cannot name it).
export const castThisRound = (st, f) => f.castDay === st.day && f.castRound != null && f.castRound === st.combat?.round;
// What an effect is aimed at, in words.
export function targetWords(st, data, f) {
    const t = f.targets[0];
    if (!t) return 'nothing';
    if (t.kind === 'char') return t.id === 'ch' ? 'you' : (st.others?.[t.id]?.name ?? t.id);
    if (t.kind === 'mon') return data.monsters[t.id]?.name ?? t.id;
    if (t.kind === 'nat') return data.natives[t.id]?.name ?? t.id;
    return `the ${t.kind} ${t.id}`;
}
// Every character in the clearing who can bear a curse: the hero, and any other character the game holds.
export const characters = st => [{ ref: { kind: 'char', id: 'ch' }, who: st.ch, name: 'you' }, ...Object.entries(st.others ?? {}).map(([id, who]) => ({ ref: { kind: 'char', id }, who, name: who.name ?? id }))];

// A second casting of the same spell on the same target does nothing (4.6.10e): the later one is held nullified. Returns true when `fx` is that later one.
export function nullifyIfDuplicate(st, fx) {
    const same = (st.fx ?? []).some(f => f !== fx && f.state === 'live' && f.spell === fx.spell && f.targets.length === fx.targets.length && f.targets.every((t, i) => t.kind === fx.targets[i].kind && String(t.id) === String(fx.targets[i].id)));
    if (same) { fx.state = 'nullified'; fx.data = { ...fx.data, duplicate: true }; }
    return same;
}

// The spells still to be cast this round (other than `except`) come to nothing, whatever their time: their chits tire, an attack spell is lost.
// Returns the names of what was cancelled.
export function cancelCasts(st, data, except) {
    const c = st.combat, out = [];
    for (const x of (c?.casts ?? []).filter(y => y !== except && !y.done)) {
        x.done = true; x.cancelled = true;
        const chit = x.chit ? st.ch.chits.find(k => k.id === x.chit) : null;
        if (chit?.state === 'committed' && !chit.tie) chit.state = 'fatigued';
        if (c.attackSpell && c.attackSpell.spell === x.spell) c.attackSpell = null;
        out.push(spellName(data, x.spell));
    }
    return out;
}

// A creature or item a spell was aimed at is gone (killed, sent away, lost): the spell loses that target, and ends when none is left (4.6.10 via digest 04).
export function lostTarget(st, data, ref) {
    for (const f of (st.fx ?? []).slice()) {
        if (f.state === 'done' || !f.targets.some(t => sameRef(t, ref))) continue;
        f.targets = f.targets.filter(t => !sameRef(t, ref));
        if (!f.targets.length) expireFx(st, data, f.id, 'its target is gone');
    }
}

// A spell makes creatures peaceful (Peace, Persuade): they are not set on him, not boxed, and cannot lure. While it lives `pacified` is on their combat counters;
// when the last such spell on a creature ends it fights again from the next round. `fx` is the spell being applied or ended.
export function setPeaceful(st, refs, on, fx) {
    for (const d of st.combat?.dens ?? []) {
        if (!refs.some(r => r.kind === d.kind && r.id === d.id) || d.dead) continue;
        if (on) {
            d.assigned = false; d.pacified = true;
            if (d.pickedUp) { d.pickedUp = false; d.side = 'light'; }          // a Tremendous monster that held him lets go and turns its red side down
        } else if (!(st.fx ?? []).some(f => f !== fx && f.state === 'live' && f.targets.some(t => t.kind === d.kind && t.id === d.id) && tagsOfFx(f).unassigned)) d.pacified = false;
    }
}
const tagsOfFx = f => HANDLER_TAGS(f);

// The tiles that share an edge with a tile on the map (the six hex neighbours that hold a tile).
export function adjacentTiles(st, tile) {
    const p = st.placements.find(x => x.id === tile);
    if (!p) return [];
    return [0, 1, 2, 3, 4, 5].map(e => { const [q, r] = neighbor(p.q, p.r, e); return st.placements.find(x => x.q === q && x.r === r)?.id; }).filter(Boolean);
}
