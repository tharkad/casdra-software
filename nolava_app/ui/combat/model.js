// combat/model.js: what the combat scene needs to know, worked out from the engine's state and options, with no DOM (so node tests can run it). The engine decides everything;
// this file only chooses defaults for the player's plan, finds the words for what happened (from the lines the engine already wrote) and says why a control is dim.
import { lvl, WEIGHT_WORDS, NO_EFFORT_LIMIT, nameOf, bookPic, isBookPic, whySentence } from '../../engine/catalogue.js';
import { denSide, hireStats, sheetOf } from './feed.js';
import { fightLinesOf, harmOf, stampsOf as stampsOfLine, paidOf, whyWords, roundLinesOf, roundFactsOf, hittersOf, foeResultsOf, turnedOverOf, missNoteOf } from '../voice/fight.js';
import { withArticle, displayName, fixNames } from '../names.js';
import { isSectionLine, sectionStory } from './sections_voice.js';          // (hirelings on Melee Sections: the Record tells their lines in Story too)
import { standing } from '../missions.js';

export const DIRS = ['Thrust', 'Swing', 'Smash'], MNV = ['Charge', 'Dodge', 'Duck'];
export const BOX = ['Charge/Thrust', 'Dodge/Swing', 'Duck/Smash'];          // the red boxes of the melee sheet name both (rules 4.1, 8.4.6b)
export const WORD = WEIGHT_WORDS;
// a number stays with the word before it: "attack time 6", "Round 1", "Heavy Troll #1" (QA-21: the "#1" never stands alone on a line)
export const nb = s => String(s).replace(/ (?=#?\d)/g, '\u00A0');
export const baseName = s => String(s).replace(/[ \u00A0]#\d+$/, '');
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export const numWord = n => NUM[n] ?? String(n);
export { displayName, fixNames };
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const plural = n => (/wolf$/i.test(n) ? n.replace(/wolf$/i, 'Wolves') : /s$/i.test(n) ? n : /(?:ch|sh|x)$/i.test(n) ? `${n}es` : `${n}s`);
export const listOf = a => (a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

// ---- Peace holds (rulings S2 and S7 of 2026-10-26) ----
// Nobody may name a target or attack: a Wish for Peace (Small Blessing; `combat.peaceNow`, `peaceRounds` more rounds after this one, all of them normal Encounter and Melee steps with nobody on the sheet) or
// a Peace spell on him (`noSpecify`). The engine's own `meleeOptions().targets` is empty then; this only words it. Null when nothing holds.
export function peaceOf(fm, data) {
    const c = fm.combat;
    if (c?.peaceNow) {
        const more = c.peaceRounds ?? 0;
        return { kind: 'wish', more,
            story: more > 0 ? `For this round and ${numWord(more)} more nobody may name a target or strike. You may still act: cast, mend your gear, or move. When the last one ends, so does the fight.` : 'This is the last peaceful round. Nobody may name a target or strike, and the fight ends with it.',
            detail: more > 0 ? `A Wish for Peace is in force: for this round and ${numWord(more)} more nobody may target or attack anyone, and everybody may still act. Then the combat ends.` : 'The last round of the Wish for Peace: nobody may target or attack anyone. The combat ends after it.' };
    }
    if (sheetOf(fm, data)?.noSpecify) return { kind: 'peace', more: 0,
        story: 'Peace is on you: you may not name a target for an attack or a spell until Midnight. You may still guard.',
        detail: 'A Peace spell is on you: you may not charge or specify a target for an attack or spell until Midnight (8.4.2b.7).' };
    return null;
}

// ---- the creatures on the stage ----
// Everything that stands against him and is not dead (a horse is part of its rider; a head or a club is a counter of its own, as on the melee sheet).
// a shared fight (st.battle): the creatures on MY sheet (and the parts of those). The stage no longer stops there (it draws clearingFoes); this is what the rules ask of my own sheet. Alone, every creature is mine.
export const onMine = (fm, d) => !fm.battle || !!(d.assigned || (d.partOf && fm.combat.dens.find(o => o.uid === d.partOf)?.assigned));
export const foesOf = fm => fm.combat.dens.filter(d => !d.dead && d.kind !== 'horse' && onMine(fm, d));
// a creature that stands in the clearing but is not fighting him (a native group that rolled peace at the Meeting, a monster that stands by): it may still be NAMED as a target, which starts the fight
// (8.2.1a, 8.2.3a); a spell's peace (`pacified`) has its own word
export const peacefulFoe = d => !!d && !!d.bystander && !d.pacified && !d.assigned && !d.dead && d.kind !== 'part' && d.kind !== 'horse';
export const bodiesOf = fm => foesOf(fm).filter(d => d.kind !== 'part');
// ---- the whole clearing (F1 "The Clearing", docs/design/combat-metaphor): the stage draws everything that is here, whoever it is set on ----
// Every living creature in the clearing (a head or a club is a counter of its own, a horse is part of its rider), on my sheet or on another's or on no one's. The stage draws these; `foesOf` (mine) is
// only for what the rules ask of MY sheet.
export const clearingFoes = fm => (fm.combat?.dens ?? []).filter(d => !d.dead && d.kind !== 'horse');
export const clearingBodies = fm => clearingFoes(fm).filter(d => d.kind !== 'part');
// Is the fight shared with other characters (a hot-seat party on one phone, or a table)? Then every creature says whom it is set on.
export const crowdedFight = fm => !!fm.battle && (fm.battle.order ?? []).filter(id => fm.battle.members?.[id]?.state === 'in').length > 1;
const charName = (fm, id) => displayName(fm.chars?.[id]?.name ?? id);
// The other characters standing in the clearing, in the fight (not me), each with the hirelings that are theirs: { uid, id, name, hidden, pic, hires: [{ uid, id, kind, name, pic }] }.
// A character who has fled or fallen is no longer here. The uid is the one the engine names a character by when he may be struck (`char:<id>`).
export function othersHere(fm, data) {
    const b = fm.battle;
    if (!b?.order) return [];
    const art = data.art ?? {};
    return b.order.filter(id => id !== fm.ch.id && b.members?.[id]?.state === 'in' && !fm.chars?.[id]?.dead).map(id => {
        const hires = (b.hires ?? []).filter(x => x.owner === id && !x.dead).map(x => {
            let name = x.id, pic = null;
            try { const hs = hireStats(fm, data, x.id, x.kind); name = hs.name ?? name; } catch { /* the id */ }
            try { pic = picOf(fm, data, { kind: 'hire', hireKind: x.kind, id: x.id, side: 'light' }); } catch { pic = null; }
            return { uid: `hire:${x.uid}`, id: x.id, kind: x.kind, name, pic };
        });
        return { uid: `char:${id}`, id, name: charName(fm, id), hidden: !!fm.chars?.[id]?.hidden, pic: art.characters?.[id] ? art.characters[id].replace(/\.gif$/, '.png') : null, hires };
    });
}
// Whom a creature is set on, in a word a player says ("on you", "on the White Knight", "on no one"). Alone, nothing needs saying (every creature that fights is on you), so this is null.
// Returns { text, kind: 'you' | 'other' | 'none' | 'peace' | 'hire', on: 'you' | <character id> | null }.
export function setOn(fm, d) {
    if (!crowdedFight(fm) || !d || d.kind === 'part' || d.kind === 'horse') return null;
    if (d.pacified || (d.bystander && !d.assigned)) return { text: 'at peace', kind: 'peace', on: null };
    if (d.engagedBy) return { text: 'on a hireling', kind: 'hire', on: null };
    if (d.assigned) return { text: 'on you', kind: 'you', on: 'you' };
    if (d.sheet && d.sheet !== fm.ch.id) return { text: `on ${charName(fm, d.sheet)}`, kind: 'other', on: d.sheet };
    return { text: 'on no one', kind: 'none', on: null };
}
export const isImp = (data, d) => d.kind === 'mon' && data.monsters[d.id]?.family === 'Imp';
// "two Wolves", "a Troll and two Goblins": how a group of foes is named in a sentence
export function foesPhrase(names) {
    const by = new Map();
    for (const n of names.map(baseName)) by.set(n, (by.get(n) ?? 0) + 1);
    const bits = [...by].map(([n, k]) => (k === 1 ? withArticle(n) : `${numWord(k)} ${plural(n)}`));
    return listOf(bits);
}
// "Heavy Troll #1" with a no-break space before the tag, for any sentence or label that may wrap
export const nbTag = s => String(s).replace(/ (?=#\d)/g, '\u00A0');
export const nameOfDen = (fm, data, d) => denSide(fm, data, d).name;
// The picture on the counter, for the side it shows: the coloured monster art, else the plain one, else the rulebook's own counter for that side (never null for a creature of the game while the
// manifest has a picture of it; a counter with none still draws its frame and its name). Natives have their own; a hireling or a horse is looked up by what it is.
export function picOf(fm, data, d, side = d?.side) {
    const art = data.art; if (!art || !d) return null;
    const upgrade = (p, kind, key, id) => (isBookPic(p) ? (bookPic(art, kind, key, side, id) ?? p) : p);        // a gap-filled picture is the book's first side: show the side asked for
    const natPic = id => { const n = data.natives?.[id]; return n ? upgrade(art.natives?.[id] ?? null, 'nat', n.type, id) : null; };
    const monPic = id => { const m = data.monsters?.[id]; return m ? upgrade(art.monsters?.[m.name] ?? bookPic(art, 'mon', m.name, side, id), 'mon', m.name, id) : null; };
    if (d.kind === 'nat') return natPic(d.id);
    if (d.kind === 'mon') return monPic(d.id);
    if (d.kind === 'hire') return d.hireKind === 'nat' || d.hireKind === 'native' ? natPic(d.id) : monPic(d.id);
    if (d.kind === 'horse') { const nm = data.natives?.[d.owner]?.horse?.name; return nm ? (art.horses?.[nm] ?? null) : null; }
    if (d.kind === 'character') return art.characters?.[d.id] ?? null;
    if (d.kind === 'part') {
        const owner = fm.combat?.dens?.find(o => o.uid === d.partOf), m = owner ? data.monsters?.[owner.id] : null, nm = m ? `${m.name} ${m.parts?.find(x => x.id === d.id)?.name ?? ''}`.trim() : null;
        return nm ? upgrade(art.monsters?.[nm] ?? bookPic(art, 'mon', nm, side), 'mon', nm) : null;
    }
    return null;
}
// the side a tap turns it to (a monster with a dark and a red side goes light, dark, red, light)
export function otherSide(data, d) {
    if (d.kind === 'mon') { const m = data.monsters[d.id]; const order = ['light', ...(m.dark ? ['dark'] : []), ...(m.red ? ['red'] : [])]; return order.length < 2 ? null : order[(order.indexOf(d.side ?? 'light') + 1) % order.length]; }
    if (d.kind === 'nat' || d.kind === 'part') return d.side === 'dark' ? 'light' : 'dark';
    return null;
}

// ---- chits ----
export const chitText = ch => (ch.type === 'magic' ? `${ch.numeral ?? ''}${ch.time}` : `${ch.strength}${ch.time}`) + '*'.repeat(ch.effort || 0);
export const chitKindWord = ch => (ch.duck ? 'DUCK' : ch.berserk ? 'BERSERK' : ch.isHorse ? String(ch.side ?? 'steed').toUpperCase() : ch.card && ch.type === 'fight' ? 'GLOVES' : ch.card && ch.type === 'move' ? 'BOOTS' : ch.type === 'magic' ? 'MAGIC' : ch.type === 'move' ? 'MOVE' : 'FIGHT');
export const chitName = ch => `${ch.duck ? 'Duck' : ch.berserk ? 'Berserk' : ch.type === 'magic' ? 'Magic' : ch.type === 'move' ? 'Move' : 'Fight'} ${chitText(ch)}`;
// The Move chits of the Guard step: the ordinary ones and the Dwarf's Duck chit (a Move chit for the Duck square only: the engine lists it apart)
export const moveList = o => [...o.moveChits, ...(o.duckChits ?? [])];
export const DUCK_SQUARE = 2;
export const limitWord = lim => (lim >= NO_EFFORT_LIMIT ? 'no limit' : lim === 3 ? 'three' : 'two');
// how much value a chit has to him, to pick the one he will miss least (a default only: he can tap another)
const worth = ch => (ch.type === 'magic' ? 40 : lvl(ch.strength) * 6 + (6 - (ch.time ?? 3)) - (ch.effort ?? 0));
export const missLeast = list => [...list].sort((a, b) => worth(a) - worth(b))[0];

// ---- the plan for the melee (the same shape the old sheet kept in ui.melee: the payload is built from it, see payload.js) ----
export const asterisksOf = (fm, ...ids) => ids.map(id => fm.ch.chits.find(x => x.id === id)).reduce((s, ch) => s + (ch?.effort ?? 0), 0);
// an effort total for a plan, counting what he already played this round (a spell cast in the Encounter step)
export function effortOf(fm, o, m) {
    const pick = id => (id ? [...o.fightChits, ...moveList(o)].find(x => x.id === id) ?? fm.ch.chits.find(x => x.id === id) : null);
    return o.asterisksPlayed + (pick(m.fightChit)?.effort ?? 0) + (pick(m.moveChit)?.effort ?? 0);
}
// Why a Fight chit or a Move chit cannot be played: the engine's own checks (strength for the weapon or the load, the effort limit); null when it can.
export function chitWhy(fm, data, o, m, ch, kind) {
    const w = o.weapon, lim = o.effortLimit ?? 2;
    if (kind === 'fight' ? !o.fightOk(ch) : !o.moveOk(ch)) return kind === 'fight' ? `Too light for ${w ? `the ${nameOf(data, w.item)}` : 'your weapon'}.` : 'Too light to carry everything you own.';
    const other = kind === 'fight' ? m.moveChit : m.fightChit, pick = id => (id ? [...o.fightChits, ...moveList(o)].find(x => x.id === id) : null);
    if (other && ch.id === other) return `That chit is already played as your ${kind === 'fight' ? 'Move' : 'Fight'} chit.`;
    const total = o.asterisksPlayed + (pick(other)?.effort ?? 0) + (ch.effort ?? 0);
    if (total > lim) return lim >= NO_EFFORT_LIMIT ? null : `That is more than ${limitWord(lim)} asterisks of effort: put the other chit back first.`;
    return null;
}
// the opening plan: the strongest Fight chit with the fewest asterisks that the weapon allows, a free maneuver, the creatures spread over the three boxes. Never illegal.
export function defaultPlan(fm, data, o) {
    const c = fm.combat, lim = o.effortLimit ?? 2;
    const live = o.targets.filter(d => d.assigned && d.kind !== 'part') ;
    const m = { target: (live[0] ?? o.targets.find(d => d.kind !== 'part'))?.uid ?? null, fightChit: null, attackDir: 0, moveChit: null, moveDir: 0, shieldDir: 0, boxes: {} };
    if (!o.attackSpell && m.target) {
        const legal = o.fightChits.filter(ch => o.fightOk(ch) && o.asterisksPlayed + (ch.effort ?? 0) <= lim);
        legal.sort((a, b) => lvl(b.strength) - lvl(a.strength) || (a.effort ?? 0) - (b.effort ?? 0) || (a.time ?? 0) - (b.time ?? 0));
        m.fightChit = legal[0]?.id ?? null;
    }
    const left = lim - (o.asterisksPlayed + (m.fightChit ? asterisksOf(fm, m.fightChit) : 0));
    const moves = o.moveChits.filter(ch => o.moveOk(ch) && (ch.effort ?? 0) <= left && ch.id !== m.fightChit);
    moves.sort((a, b) => (a.effort ?? 0) - (b.effort ?? 0) || (a.time ?? 0) - (b.time ?? 0));
    m.moveChit = fm.ch?.hidden ? null : moves[0]?.id ?? null;          // striking from hiding: the one he names cannot strike back this round, so there is nothing to maneuver against
    o.boxable.forEach((d, i) => { m.boxes[d.uid] = i % 3; });
    return m;
}
// last round's plan, where it still holds: every part that is no longer legal falls back to the opening plan's
export function repeatPlan(fm, data, o, last) {
    const base = defaultPlan(fm, data, o), m = { ...base, boxes: { ...base.boxes } };
    const lim = o.effortLimit ?? 2;
    if (last.target != null && o.targets.some(d => d.uid === last.target)) m.target = last.target;
    m.attackDir = last.attackDir ?? 0; m.moveDir = last.moveDir ?? 0; m.shieldDir = last.shieldDir ?? 0;
    m.fightChit = null; m.moveChit = null;
    const f = last.fightChit && !o.attackSpell && m.target ? o.fightChits.find(x => x.id === last.fightChit && o.fightOk(x)) : null;
    if (f && o.asterisksPlayed + (f.effort ?? 0) <= lim) m.fightChit = f.id;
    const mv = last.moveChit ? moveList(o).find(x => x.id === last.moveChit && (x.duck ? m.moveDir === DUCK_SQUARE : o.moveOk(x)) && x.id !== m.fightChit) : null;
    if (mv && o.asterisksPlayed + asterisksOf(fm, m.fightChit) + (mv.effort ?? 0) <= lim) m.moveChit = mv.id;
    for (const [uid, b] of Object.entries(last.boxes ?? {})) if (o.boxable.some(d => d.uid === uid)) m.boxes[uid] = b;
    if (last.weaponSide) m.weaponSide = last.weaponSide;
    return m;
}
// does the repeat differ from nothing at all (is there anything to repeat)? true when last round he played at least a chit or named a target
// can last round's chits be played again? false when a chit he played is no longer ready (wounded, fatigued, or over the asterisk limit)
export const repeatHolds = (last, plan) => (last.fightChit == null || plan.fightChit === last.fightChit) && (last.moveChit == null || plan.moveChit === last.moveChit);
export const repeatable = last => !!last && (last.fightChit != null || last.moveChit != null || last.target != null);

// ---- the live hint under the Guard step: what gets under the maneuver by its time (the engine's own rule: an attack whose time is lower than the maneuver's gets under it) ----
export function guardHint(fm, data, o, m) {
    const mv = m.moveChit ? moveList(o).find(x => x.id === m.moveChit) : null;
    const attackers = o.boxable.filter(d => { const s = denSide(fm, data, d); return s.attack !== 'none' && s.atk != null && (d.assigned || d.partOf); });
    if (!attackers.length) return 'Nothing here strikes back.';
    if (!mv && fm.ch?.hidden) return 'You strike from hiding: no blow comes back this round, so no maneuver is needed.';
    if (!mv) return 'With no maneuver every blow is aimed true.';
    const under = attackers.filter(d => denSide(fm, data, d).atk < mv.time);
    if (under.length > 2) return `At ${mv.time}, ${under.length} of ${attackers.length} foes get under your guard.`;
    if (under.length) return nb(`At ${mv.time}, ${listOf(under.map(d => `${denSide(fm, data, d).name} (${denSide(fm, data, d).atk})`))} ${under.length > 1 ? 'get' : 'gets'} under your guard.`);
    return `At ${mv.time}, nothing gets under your guard: only a blow aimed at your ${MNV[m.moveDir]} finds you.`;
}
// ---- the Foes step: does where the creatures stand in the three boxes matter? ----
// docs/design/combat-metaphor/06-PLACEMENT-PROOF.md, held by tests/combat_placement_proof.test.mjs: with three or fewer attacking counters on his sheet (a head or a club is a counter, a horse is not) every
// plan the rules accept gives the same odds, because each counter must take its own box (8.4.5m) and the repositioning die is a fair shuffle of the boxes (8.4.6a). So the screen does not ask:
// it sends the default placement. Four or more counters, or a round on Melee Sections (hirelings place their own, 8.4.6d), keep the step. `m` is the plan in progress (the creature he names joins the
// counters he already has on his sheet; a spell that may name many counts everything that is here).
export function placementCounters(fm, o, m) {
    const dens = fm.combat?.dens ?? [], live = dens.filter(d => !d.dead && d.kind !== 'horse'), set = new Set(o.boxable.map(d => d.uid));
    if (o.attackSpell?.many) return live.length;
    const t = m?.target ? dens.find(d => d.uid === m.target && !d.dead) : null;
    if (t && t.kind !== 'part') { set.add(t.uid); for (const p of live) if (p.partOf === t.uid) set.add(p.uid); }
    return set.size;
}
// A native's horse is not an attacking counter, but 8.4.5m lets him place it (any box but its rider's), and the shuffle does not undo WHICH counters share a box: beside a second creature the horse
// either stands with it or alone, and then the horse's box (the native's maneuver, 8.4.6b) and that creature's box (its blow) are the same line or two, which changes how the round's
// hits go together. So a horse on his sheet with two or more attacking counters keeps the step; a rider and his horse alone do not (every placement of the pair is as likely after the die).
export const placementMatters = (fm, o, m) => !!o.sections || placementCounters(fm, o, m) > 3 || ((o.horses ?? []).length > 0 && placementCounters(fm, o, m) >= 2);
// where a native's horse stands in the plan: the box he chose, else the box after its rider's; never its rider's own
export const riderBoxOf = (o, m, uid) => m.boxes[uid] ?? Math.max(0, o.boxable.findIndex(d => d.uid === uid)) % 3;
export function horseBoxOf(o, m, h) { const rb = riderBoxOf(o, m, h.partOf), hb = m.boxes[h.uid] ?? (rb + 1) % 3; return hb === rb ? (rb + 1) % 3 : hb; }
export const nextHorseBox = (o, m, h) => { const rb = riderBoxOf(o, m, h.partOf); let b = (horseBoxOf(o, m, h) + 1) % 3; if (b === rb) b = (b + 1) % 3; return b; };
export const effortLine = (fm, o, m) => {
    const lim = o.effortLimit ?? 2, ast = effortOf(fm, o, m);
    return { ast, lim, over: ast > lim, text: lim >= NO_EFFORT_LIMIT ? `Effort ${ast}, no limit` : `Effort ${ast} of ${lim}`, words: ast <= 1 ? 'nothing tires' : ast > lim ? `put a chit back: ${limitWord(lim)} at most` : `${ast - 1} asterisk${ast - 1 === 1 ? '' : 's'} tire` };
};

// ---- the Encounter step: why a verb is dim, in the engine's words ----
// what holds a chit back: a creature ("the Wolf's 3") or, in a shared fight, another character's charge ("Ann's charge (3)")
export function gateWords(fm, gate) {
    const by = /^(.+), charging you$/.exec(gate.name);
    if (!by) return `the ${baseName(gate.name)}'s ${gate.speed}`;
    const chg = Object.values(fm.chars ?? {}).find(x => x.name === by[1]);
    return `${fm.players?.find(p => p.id === chg?.owner)?.name ?? by[1]}\u2019s charge (${gate.speed})`;
}
// the player who charged me, when the thing holding my chits back is a charge (shared fight); else null
export function chargerOf(fm, gate) {
    const by = /^(.+), charging you$/.exec(gate.name);
    if (!by) return null;
    const chg = Object.values(fm.chars ?? {}).find(x => x.name === by[1]);
    return fm.players?.find(p => p.id === chg?.owner)?.name ?? by[1];
}
// Note 75: the Wither curse (4.6.8a.3) keeps every asterisk chit tired; those chits show a withered pip, not the plain tired look
export const isWithered = (fm, c) => c.state === 'fatigued' && (fm.ch.curses ?? []).includes('Wither') && (c.effort > 0 || c.type === 'magic');
export const WITHER_STORY = 'Withered. A curse drains your strongest efforts: every chit with an asterisk is spent and cannot be restored until the curse is lifted. A Chapel lifts it at Midnight (Awful Valley 5), or the spell Make Whole.';
export const WITHER_DETAIL = 'Curse: Wither (4.6.8a.3). All asterisk chits are fatigued and cannot be activated, even by Rest. Lifted by: a Chapel in your clearing at Midnight (4.6.8a.5), Make Whole, Small Blessing, Health Wish.';
export function encounterVerbs(fm, data, o, c) {
    const slow = o.why?.gate ? `Nothing of yours is faster than ${gateWords(fm, o.why.gate)}.` : null;
    const wither = (fm.ch.curses ?? []).includes('Wither'), tooSlow = wither && fm.ch.chits.some(x => isWithered(fm, x) && x.type !== 'magic') ? 'too slow: Wither tired your fast chits' : 'too slow';
    const gated = k => o.whyCode?.[k]?.code === 'chit.too-slow';          // (the reason's code, not its sentence)
    const alert = o.canAlert && o.weapon ? { ok: true } : { ok: false, sub: !o.weapon ? 'no weapon' : o.whyCode?.alert?.code === 'weapon.card' ? 'a card' : gated('alert') ? tooSlow : 'no chit', why: gated('alert') ? slow : (whyWords(o, 'alert', data) ?? 'You have nothing to ready.') };
    const run = o.canRun ? { ok: true } : { ok: false, sub: o.pickedUp ? 'held' : gated('run') ? tooSlow : !o.runTo.length ? 'no road' : 'no chit', why: o.pickedUp ? 'You are seized and cannot run.' : gated('run') ? slow : (whyWords(o, 'run', data) ?? 'You cannot run now.') };
    const cast = o.casts.length ? { ok: true } : { ok: false, sub: wither && fm.ch.chits.some(x => x.type === 'magic' && isWithered(fm, x)) ? 'Your Magic chit is withered' : 'none ready', why: o.blocked?.length ? `${o.blocked[0].name}: ${whySentence(o.blocked[0].whyCode)}` : 'No spell is ready tonight.' };
    return { alert, run, cast, fly: o.canFly ? { ok: true } : null };
}
// "Weapon ready" verbs read the weapon's state
export const weaponVerb = o => (o.weapon?.item.alerted ? 'Unalert weapon' : 'Alert weapon');

// ---- what a round did, read from the lines the engine wrote for it (c.events; the same words roundSynopsis reads) ----
const STRIKE_RE = /^(?:The |the )?(.+?)(?:'s) (?:thrust|swing|smash|bite|club|claw|blow|sting|attack|strike)s? (glances off|thuds against|bites into|hammers|crashes down on) /i;
export function roundFacts(events, fm = null, data = null) {
    const rl = fm && roundLinesOf(fm);          // (the voice layer: the round's events where the game records them, else its strings)
    if (rl) return roundFactsOf(fm, data, rl);
    const L = (events ?? []).map(e => String(e).trim()).filter(Boolean);
    const m = re => L.map(l => re.exec(l)).filter(Boolean);
    const landed = m(STRIKE_RE).map(x => baseName(x[1]));
    return {
        landed,
        wounds: L.filter(l => /^(?:The blow gets through: a wound|You are wounded)\b/.test(l)).length,
        destroyed: m(/^Your (.+?) is destroyed/).map(x => x[1]),
        damaged: m(/^Your (.+?) (?:is dented and damaged|takes the blow and is damaged)/).map(x => x[1]),
        noEffect: L.some(l => /^No effect/.test(l)),
        avoided: L.some(l => / misses: your .+? carries you clear/.test(l)),
        ran: L.some(l => /You break away and flee/.test(l)),
    };
}
// The foes that hit him this round, by display name ("Wolf #2"), read from the story lines (a name with a tag keeps it)
export const hitters = (events, fm = null) => (fm && roundLinesOf(fm) ? hittersOf(fm, roundLinesOf(fm)).map(n => n.replace(/^the /i, '')) : (events ?? []).map(e => STRIKE_RE.exec(String(e).trim())).filter(Boolean).map(x => x[1].replace(/^the /i, '')));

// What each foe's blow did, by display name ("Axe Goblin #5"): 'wounded' (the blow got through), 'held' (no effect: your armor held), 'hit' (it landed and hurt your gear but wounded no one), 'missed' (it came at you and
// missed). Read from the story lines: a blow is the strike line, and the line that follows it says what it did (QA-13/14: every counter used to say HIT YOU).
const MISS_RE = /^(?:The |the )?(.+?)(?:'s) (?:thrust|swing|smash|bite|club|claw|blow|sting|attack|strike)s? misses: /i;
export function foeResults(events, fm = null) {
    const rl = fm && roundLinesOf(fm);
    if (rl) return foeResultsOf(fm, rl);
    const L = (events ?? []).map(e => String(e).trim()).filter(Boolean), out = new Map();
    let cur = null;
    for (const l of L) {
        let x;
        if ((x = STRIKE_RE.exec(l))) { cur = x[1].replace(/^the /i, ''); out.set(cur, 'hit'); continue; }
        if ((x = MISS_RE.exec(l))) { out.set(x[1].replace(/^the /i, ''), 'missed'); cur = null; continue; }
        if (!cur) continue;
        if (/^No effect/.test(l)) out.set(cur, 'held');
        else if (/^(?:The blow gets through: a wound|You are wounded)\b/.test(l)) out.set(cur, 'wounded');
    }
    return out;
}
// The foes whose counters were turned over by a Tactics roll this round (a 6: they switch sides), by display name. The engine says it as "In the Dodge box the Axe Goblin #5 shows another side."
export function turnedOver(events, fm = null) {
    const rl = fm && roundLinesOf(fm);
    if (rl) return turnedOverOf(fm, rl);
    const out = new Set();
    for (const e of events ?? []) {
        const x = /^In the \w+ box the (.+?) shows? another side\./.exec(String(e).trim());
        if (x) x[1].split(/ and |, /).forEach(n => out.add(n.replace(/^the /i, '')));
    }
    return out;
}
// The one miss worth explaining: "the Axe Goblin #5 is in Dodge, too quick to catch (3 against your 3)" -> the number that beat you, said as what it is
export function missNote(events, fm = null) {
    const rl = fm && roundLinesOf(fm);
    if (rl) return missNoteOf(fm, rl);
    for (const e of events ?? []) {
        const x = /the (.+?) is in (\w+), too quick to catch \((\d+) against your (\d+)\)/.exec(String(e));
        if (x) return `The ${x[1]} was too quick: its move speed ${x[3]} (the circle on its counter) is not slower than your attack time ${x[4]}.`;
    }
    return '';
}

// ---- the fight so far, read from the log ----
// The lines of the fight in progress or just over: the trailing lines the engine tagged with a round (`r`), plus the Meeting rolls before them are on the same run.
export const fightLines = fightLinesOf;          // (the voice layer cuts the fight's run of lines: voice/fight.js)
export function recapOf(fm, data) {
    const lines = fightLines(fm);
    const { gain, kills } = paidOf(lines, uid => fm.combat?.dens.find(d => d.uid === uid)?.stat?.name ?? null, baseName);          // (the voice layer: the events of the lines, else their words)
    const { wounded, tired, destroyed, damaged } = harmOf(lines);          // (read from the events of the lines where the game records them, else from their words)
    const rounds = Math.max(1, ...lines.map(l => l.r ?? 1));
    return { rounds, gain, kills, wounded, tired, destroyed, damaged, lines };
}

// ---- the lines of the fight, round by round, in the story's words and in exact words (the Record) ----
export function recordRounds(fm) {
    const by = new Map();
    for (const l of fightLines(fm)) {
        if (l.k !== 'combat' && l.k !== 'roll') continue;
        if (!by.has(l.r)) by.set(l.r, []);
        by.get(l.r).push(l);
    }
    return [...by].map(([r, lines]) => ({ r, lines: lines.map(l => (l.s == null && l.k === 'combat' && isSectionLine(l.t) ? { ...l, s: sectionStory(l.t) } : l)) }));          // (a line of a Melee Section has no story of the engine's own)
}
// The stamps a line of the record carries (a kill, a wound, what the armor did, a miss): the voice layer reads the line's event, else its words.
export const stampsOf = stampsOfLine;

// ---- the Meeting's "let them be": why they are not looking for a fight, from how the group stands with him (st.ch.rel, the engine's own -2 Enemy .. +2 Ally) ----
// Only a native group has a standing; a monster that stands by has none. Returns "The Order are your allies." / "The Order are friendly to you." or null.
const STANDING = { 2: 'are your allies', 1: 'are friendly to you' };
export function standingWhy(fm, groups) {
    const by = new Map();
    for (const g of groups) { const r = standing(fm, g); if (STANDING[r]) (by.get(r) ?? by.set(r, []).get(r)).push(g); }
    if (!by.size) return null;
    return [...by].sort((a, b) => b[0] - a[0]).map(([r, gs]) => `${cap(listOf(gs.map(g => `the ${g}`)))} ${STANDING[r]}.`).join(' ');
}

// ---- who is on his side (hirelings and monsters his spells have won over) ----
export function alliesOf(fm, data) {
    return (fm.combat.hires ?? []).filter(x => !x.dead).map(x => {
        const mon = x.kind === 'mon', def = mon ? data.monsters[x.id] : data.natives[x.id], held = (mon ? fm.mons : fm.nats).find(o => o.id === x.id);
        const until = held?.hiredUntil != null ? Math.max(0, held.hiredUntil - fm.day + 1) : null;          // 14 on the day he was hired, then one fewer each day
        // the side the hirer deploys (hireStats: the one that can fight, the harder-hitting if both): the counter shows that one first
        let side = 'light';
        try {
            const hs = hireStats(fm, data, x.id, x.kind);
            const pick = [['light', def.light], ['dark', def.dark]].find(([, sd]) => sd && sd.harm === hs.harm && sd.attackTime === hs.atk);
            if (pick) side = pick[0];
        } catch { /* the light side */ }
        return { uid: x.uid, kind: x.kind, id: x.id, name: def?.name ?? '?', controlled: mon, days: mon && held?.controlledUntil ? null : until, side, hidden: !!x.hidden };          // (hidden: the hireling rules, 8.1.4b: he is in the fight but not yet seen)
    });
}

// ---- the chits for the wound and fatigue grids ----
export function fatigueDefault(fm, p) {
    const cs = p.chits.map(id => fm.ch.chits.find(x => x.id === id)).filter(Boolean).sort((a, b) => worth(a) - worth(b));
    for (const extra of [0, 1]) for (let size = 1; size <= cs.length; size++) {
        const rec = (i, left, pick) => { if (left === p.need + extra && pick.length === size) return pick; if (i >= cs.length || pick.length >= size) return null; return rec(i + 1, left + (cs[i].effort ?? 0), [...pick, cs[i].id]) ?? rec(i + 1, left, pick); };
        const r = rec(0, 0, []); if (r) return r;
    }
    return [];
}
export function woundDefault(fm, p) {
    const cs = p.chits.map(id => fm.ch.chits.find(x => x.id === id)).filter(Boolean);
    return [...cs].sort((a, b) => worth(a) - worth(b)).slice(0, p.count).map(x => x.id);
}

/** Whether the hero is hidden, in the combat header's words (a fight changes who can touch you, so it is always shown). */
export const sightOf = fm => fm.ch.hidden ? { hidden: true, text: 'Hidden' } : { hidden: false, text: 'In plain sight' };
