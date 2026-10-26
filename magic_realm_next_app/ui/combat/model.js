// combat/model.js: what the combat scene needs to know, worked out from the engine's state and options, with no DOM (so node tests can run it). The engine decides everything;
// this file only chooses defaults for the player's plan, finds the words for what happened (from the lines the engine already wrote) and says why a control is dim.
import { lvl, WEIGHT_WORDS } from '../../engine/core.js';
import { denSide, weaponSide, hireStats } from '../../engine/combat.js';
import { NO_EFFORT_LIMIT } from '../../engine/modifiers.js';
import { nameOf } from '../../engine/items.js';
import { withArticle, displayName, fixNames } from '../names.js';

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

// ---- the creatures on the stage ----
// Everything that stands against him and is not dead (a horse is part of its rider; a head or a club is a counter of its own, as on the melee sheet).
// a shared fight (st.battle): only the creatures on MY sheet (and the parts of those) stand on my stage; the others' are named from the Strike step. Alone, every creature is mine.
export const onMine = (st, d) => !st.battle || !!(d.assigned || (d.partOf && st.combat.dens.find(o => o.uid === d.partOf)?.assigned));
export const foesOf = st => st.combat.dens.filter(d => !d.dead && d.kind !== 'horse' && onMine(st, d));
export const bodiesOf = st => foesOf(st).filter(d => d.kind !== 'part');
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
export const nameOfDen = (st, data, d) => denSide(st, data, d).name;
// the picture on the counter: the coloured monster art, else the plain one; natives have their own
export function picOf(st, data, d) {
    const c = st.combat;
    if (d.kind === 'nat') return data.art?.natives?.[d.id] ?? null;
    const owner = d.kind === 'part' ? c.dens.find(o => o.uid === d.partOf) : null;
    const name = d.kind === 'mon' ? data.monsters[d.id]?.name : owner ? `${data.monsters[owner.id]?.name} ${data.monsters[owner.id]?.parts?.find(x => x.id === d.id)?.name ?? ''}`.trim() : null;
    return name ? (data.art?.monstersColor?.[name] ?? data.art?.monsters?.[name] ?? null) : null;
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
export const asterisksOf = (st, ...ids) => ids.map(id => st.ch.chits.find(x => x.id === id)).reduce((s, ch) => s + (ch?.effort ?? 0), 0);
// an effort total for a plan, counting what he already played this round (a spell cast in the Encounter step)
export function effortOf(st, o, m) {
    const pick = id => (id ? [...o.fightChits, ...moveList(o)].find(x => x.id === id) ?? st.ch.chits.find(x => x.id === id) : null);
    return o.asterisksPlayed + (pick(m.fightChit)?.effort ?? 0) + (pick(m.moveChit)?.effort ?? 0);
}
// Why a Fight chit or a Move chit cannot be played: the engine's own checks (strength for the weapon or the load, the effort limit); null when it can.
export function chitWhy(st, data, o, m, ch, kind) {
    const w = o.weapon, lim = o.effortLimit ?? 2;
    if (kind === 'fight' ? !o.fightOk(ch) : !o.moveOk(ch)) return kind === 'fight' ? `Too light for ${w ? `the ${nameOf(data, w.item)}` : 'your weapon'}.` : 'Too light to carry everything you own.';
    const other = kind === 'fight' ? m.moveChit : m.fightChit, pick = id => (id ? [...o.fightChits, ...moveList(o)].find(x => x.id === id) : null);
    if (other && ch.id === other) return `That chit is already played as your ${kind === 'fight' ? 'Move' : 'Fight'} chit.`;
    const total = o.asterisksPlayed + (pick(other)?.effort ?? 0) + (ch.effort ?? 0);
    if (total > lim) return lim >= NO_EFFORT_LIMIT ? null : `That is more than ${limitWord(lim)} asterisks of effort: put the other chit back first.`;
    return null;
}
// the opening plan: the strongest Fight chit with the fewest asterisks that the weapon allows, a free maneuver, the creatures spread over the three boxes. Never illegal.
export function defaultPlan(st, data, o) {
    const c = st.combat, lim = o.effortLimit ?? 2;
    const live = o.targets.filter(d => d.assigned && d.kind !== 'part') ;
    const m = { target: (live[0] ?? o.targets.find(d => d.kind !== 'part'))?.uid ?? null, fightChit: null, attackDir: 0, moveChit: null, moveDir: 0, shieldDir: 0, boxes: {} };
    if (!o.attackSpell && m.target) {
        const legal = o.fightChits.filter(ch => o.fightOk(ch) && o.asterisksPlayed + (ch.effort ?? 0) <= lim);
        legal.sort((a, b) => lvl(b.strength) - lvl(a.strength) || (a.effort ?? 0) - (b.effort ?? 0) || (a.time ?? 0) - (b.time ?? 0));
        m.fightChit = legal[0]?.id ?? null;
    }
    const left = lim - (o.asterisksPlayed + (m.fightChit ? asterisksOf(st, m.fightChit) : 0));
    const moves = o.moveChits.filter(ch => o.moveOk(ch) && (ch.effort ?? 0) <= left && ch.id !== m.fightChit);
    moves.sort((a, b) => (a.effort ?? 0) - (b.effort ?? 0) || (a.time ?? 0) - (b.time ?? 0));
    m.moveChit = st.ch?.hidden ? null : moves[0]?.id ?? null;          // striking from hiding: the one he names cannot strike back this round, so there is nothing to maneuver against
    o.boxable.forEach((d, i) => { m.boxes[d.uid] = i % 3; });
    return m;
}
// last round's plan, where it still holds: every part that is no longer legal falls back to the opening plan's
export function repeatPlan(st, data, o, last) {
    const base = defaultPlan(st, data, o), m = { ...base, boxes: { ...base.boxes } };
    const lim = o.effortLimit ?? 2;
    if (last.target != null && o.targets.some(d => d.uid === last.target)) m.target = last.target;
    m.attackDir = last.attackDir ?? 0; m.moveDir = last.moveDir ?? 0; m.shieldDir = last.shieldDir ?? 0;
    m.fightChit = null; m.moveChit = null;
    const f = last.fightChit && !o.attackSpell && m.target ? o.fightChits.find(x => x.id === last.fightChit && o.fightOk(x)) : null;
    if (f && o.asterisksPlayed + (f.effort ?? 0) <= lim) m.fightChit = f.id;
    const mv = last.moveChit ? moveList(o).find(x => x.id === last.moveChit && (x.duck ? m.moveDir === DUCK_SQUARE : o.moveOk(x)) && x.id !== m.fightChit) : null;
    if (mv && o.asterisksPlayed + asterisksOf(st, m.fightChit) + (mv.effort ?? 0) <= lim) m.moveChit = mv.id;
    for (const [uid, b] of Object.entries(last.boxes ?? {})) if (o.boxable.some(d => d.uid === uid)) m.boxes[uid] = b;
    if (last.weaponSide) m.weaponSide = last.weaponSide;
    return m;
}
// does the repeat differ from nothing at all (is there anything to repeat)? true when last round he played at least a chit or named a target
// can last round's chits be played again? false when a chit he played is no longer ready (wounded, fatigued, or over the asterisk limit)
export const repeatHolds = (last, plan) => (last.fightChit == null || plan.fightChit === last.fightChit) && (last.moveChit == null || plan.moveChit === last.moveChit);
export const repeatable = last => !!last && (last.fightChit != null || last.moveChit != null || last.target != null);

// ---- the live hint under the Guard step: what gets under the maneuver by its time (the engine's own rule: an attack whose time is lower than the maneuver's gets under it) ----
export function guardHint(st, data, o, m) {
    const mv = m.moveChit ? moveList(o).find(x => x.id === m.moveChit) : null;
    const attackers = o.boxable.filter(d => { const s = denSide(st, data, d); return s.attack !== 'none' && s.atk != null && (d.assigned || d.partOf); });
    if (!attackers.length) return 'Nothing here strikes back.';
    if (!mv && st.ch?.hidden) return 'You strike from hiding: no blow comes back this round, so no maneuver is needed.';
    if (!mv) return 'With no maneuver every blow is aimed true.';
    const under = attackers.filter(d => denSide(st, data, d).atk < mv.time);
    if (under.length > 2) return `At ${mv.time}, ${under.length} of ${attackers.length} foes get under your guard.`;
    if (under.length) return nb(`At ${mv.time}, ${listOf(under.map(d => `${denSide(st, data, d).name} (${denSide(st, data, d).atk})`))} ${under.length > 1 ? 'get' : 'gets'} under your guard.`);
    return `At ${mv.time}, nothing gets under your guard: only a blow aimed at your ${MNV[m.moveDir]} finds you.`;
}
export const effortLine = (st, o, m) => {
    const lim = o.effortLimit ?? 2, ast = effortOf(st, o, m);
    return { ast, lim, over: ast > lim, text: lim >= NO_EFFORT_LIMIT ? `Effort ${ast}, no limit` : `Effort ${ast} of ${lim}`, words: ast <= 1 ? 'nothing tires' : ast > lim ? `put a chit back: ${limitWord(lim)} at most` : `${ast - 1} asterisk${ast - 1 === 1 ? '' : 's'} tire` };
};

// ---- the Encounter step: why a verb is dim, in the engine's words ----
// what holds a chit back: a creature ("the Wolf's 3") or, in a shared fight, another character's charge ("Ann's charge (3)")
export function gateWords(st, gate) {
    const by = /^(.+), charging you$/.exec(gate.name);
    if (!by) return `the ${baseName(gate.name)}'s ${gate.speed}`;
    const chg = Object.values(st.chars ?? {}).find(x => x.name === by[1]);
    return `${st.players?.find(p => p.id === chg?.owner)?.name ?? by[1]}\u2019s charge (${gate.speed})`;
}
// the player who charged me, when the thing holding my chits back is a charge (shared fight); else null
export function chargerOf(st, gate) {
    const by = /^(.+), charging you$/.exec(gate.name);
    if (!by) return null;
    const chg = Object.values(st.chars ?? {}).find(x => x.name === by[1]);
    return st.players?.find(p => p.id === chg?.owner)?.name ?? by[1];
}
export function encounterVerbs(st, data, o, c) {
    const slow = o.why?.gate ? `Nothing of yours is faster than ${gateWords(st, o.why.gate)}.` : null;
    const gated = t => !!t && /faster than/.test(t);
    const alert = o.canAlert && o.weapon ? { ok: true } : { ok: false, sub: !o.weapon ? 'no weapon' : /weapon card/.test(o.why?.alert ?? '') ? 'a card' : gated(o.why?.alert) ? 'too slow' : 'no chit', why: gated(o.why?.alert) ? slow : (o.why?.alert ?? 'You have nothing to ready.') };
    const run = o.canRun ? { ok: true } : { ok: false, sub: o.pickedUp ? 'held' : gated(o.why?.run) ? 'too slow' : !o.runTo.length ? 'no road' : 'no chit', why: o.pickedUp ? 'You are seized and cannot run.' : gated(o.why?.run) ? slow : (o.why?.run ?? 'You cannot run now.') };
    const cast = o.casts.length ? { ok: true } : { ok: false, sub: 'none ready', why: o.blocked?.length ? `${o.blocked[0].name}: ${o.blocked[0].why}` : 'No spell is ready tonight.' };
    return { alert, run, cast, fly: o.canFly ? { ok: true } : null };
}
// "Weapon ready" verbs read the weapon's state
export const weaponVerb = o => (o.weapon?.item.alerted ? 'Unalert weapon' : 'Alert weapon');

// ---- what a round did, read from the lines the engine wrote for it (c.events; the same words roundSynopsis reads) ----
const STRIKE_RE = /^(?:The |the )?(.+?)(?:'s) (?:thrust|swing|smash|bite|club|claw|blow|sting|attack|strike)s? (glances off|thuds against|bites into|hammers|crashes down on) /i;
export function roundFacts(events) {
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
export const hitters = events => (events ?? []).map(e => STRIKE_RE.exec(String(e).trim())).filter(Boolean).map(x => x[1].replace(/^the /i, ''));

// What each foe's blow did, by display name ("Axe Goblin #5"): 'wounded' (the blow got through), 'held' (no effect: your armor held), 'hit' (it landed and hurt your gear but wounded no one), 'missed' (it came at you and
// missed). Read from the story lines: a blow is the strike line, and the line that follows it says what it did (QA-13/14: every counter used to say HIT YOU).
const MISS_RE = /^(?:The |the )?(.+?)(?:'s) (?:thrust|swing|smash|bite|club|claw|blow|sting|attack|strike)s? misses: /i;
export function foeResults(events) {
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
export function turnedOver(events) {
    const out = new Set();
    for (const e of events ?? []) {
        const x = /^In the \w+ box the (.+?) shows? another side\./.exec(String(e).trim());
        if (x) x[1].split(/ and |, /).forEach(n => out.add(n.replace(/^the /i, '')));
    }
    return out;
}
// The one miss worth explaining: "the Axe Goblin #5 is in Dodge, too quick to catch (3 against your 3)" -> the number that beat you, said as what it is
export function missNote(events) {
    for (const e of events ?? []) {
        const x = /the (.+?) is in (\w+), too quick to catch \((\d+) against your (\d+)\)/.exec(String(e));
        if (x) return `The ${x[1]} was too quick: its move speed ${x[3]} (the circle on its counter) is not slower than your attack time ${x[4]}.`;
    }
    return '';
}

// ---- the fight so far, read from the log ----
// The lines of the fight in progress or just over: the trailing lines the engine tagged with a round (`r`), plus the Meeting rolls before them are on the same run.
export function fightLines(st) {
    const log = st.log ?? [], out = [];
    let i = log.length - 1;
    while (i >= 0 && log[i].r == null && log[i].k === 'combat') i--;                // (the closing line of a fight is written after the fight is marked ended: it carries no round)
    for (; i >= 0; i--) { if (log[i].r == null) break; out.push(log[i]); }
    return out.reverse();
}
export function recapOf(st, data) {
    const lines = fightLines(st);
    const gain = { fame: 0, notoriety: 0, gold: 0 }, kills = [];
    let wounded = 0, tired = 0, destroyed = 0, damaged = 0;
    for (const l of lines) {
        if (l.k !== 'combat') continue;
        const t = l.t;
        const g = /\(([^)]*kill \d+ today)\)/.exec(t);
        if (g) {
            for (const bit of g[1].split(/[,;] */)) { const x = /^\+(\d+) (Fame|Notoriety|gold)/.exec(bit); if (x) gain[x[2] === 'gold' ? 'gold' : x[2].toLowerCase()] += Number(x[1]); }
            const who = /^You kill (?:the )?(.+?)(?: with| \(|\.|$)/.exec(t) ?? /(?:^|: )([\w' #-]+?) dies/.exec(t);
            kills.push(who ? baseName(who[1]) : 'a foe');
        }
        let x;
        if ((x = /^You wound (\d+) action chit/.exec(t))) wounded += Number(x[1]);
        if ((x = /^You fatigue (\d+) chit/.exec(t))) tired += Number(x[1]);
        if (/Your .+ is destroyed/.test(t)) destroyed++;
        else if (/Your .+ is (?:dented and )?damaged|takes the blow and is damaged/.test(t)) damaged++;
    }
    const rounds = Math.max(1, ...lines.map(l => l.r ?? 1));
    return { rounds, gain, kills, wounded, tired, destroyed, damaged, lines };
}

// ---- the lines of the fight, round by round, in the story's words and in exact words (the Record) ----
export function recordRounds(st) {
    const by = new Map();
    for (const l of fightLines(st)) {
        if (l.k !== 'combat' && l.k !== 'roll') continue;
        if (!by.has(l.r)) by.set(l.r, []);
        by.get(l.r).push(l);
    }
    return [...by].map(([r, lines]) => ({ r, lines }));
}
// The stamps a line of the record carries (a kill, a wound, what the armor did, a miss), read from its plain and its story words.
export function stampsOf(l) {
    const t = l.t ?? '', s = l.s ?? t, out = [];
    if (/^You kill /.test(t) || /^Your .+? (?:cleaves|strikes down|cuts down|brings down|drops) the .+?, which /.test(s)) out.push(['kill', 'Slain']);
    if (/^You take a wound|^The blow gets through|^You are wounded/.test(t + ' ' + s)) out.push(['wound', 'Wound']);
    if (/^No effect/.test(t)) out.push(['armor', 'Armor holds']);
    else if (/ is destroyed/.test(t)) out.push(['armor', 'Armor destroyed']);
    else if (/ is (?:dented and )?damaged|takes the blow and is damaged/.test(t + ' ' + s) && /^Your /.test(t)) out.push(['armor', 'Armor damaged']);
    if (/: miss\b|empty air|misses you|carries you clear/.test(t + ' ' + s)) out.push(['miss', 'Miss']);
    return out;
}

// ---- the Meeting's "let them be": why they are not looking for a fight, from how the group stands with him (st.ch.rel, the engine's own -2 Enemy .. +2 Ally) ----
// Only a native group has a standing; a monster that stands by has none. Returns "The Order are your allies." / "The Order are friendly to you." or null.
const STANDING = { 2: 'are your allies', 1: 'are friendly to you' };
export function standingWhy(st, groups) {
    const by = new Map();
    for (const g of groups) { const r = st.ch.rel?.[g]; if (STANDING[r]) (by.get(r) ?? by.set(r, []).get(r)).push(g); }
    if (!by.size) return null;
    return [...by].sort((a, b) => b[0] - a[0]).map(([r, gs]) => `${cap(listOf(gs.map(g => `the ${g}`)))} ${STANDING[r]}.`).join(' ');
}

// ---- who is on his side (hirelings and monsters his spells have won over) ----
export function alliesOf(st, data) {
    return (st.combat.hires ?? []).filter(x => !x.dead).map(x => {
        const mon = x.kind === 'mon', def = mon ? data.monsters[x.id] : data.natives[x.id], held = (mon ? st.mons : st.nats).find(o => o.id === x.id);
        const until = held?.hiredUntil != null ? Math.max(0, held.hiredUntil - st.day + 1) : null;          // 14 on the day he was hired, then one fewer each day
        // the side the hirer deploys (hireStats: the one that can fight, the harder-hitting if both): the counter shows that one first
        let side = 'light';
        try {
            const hs = hireStats(data, x.id, x.kind, st);
            const pick = [['light', def.light], ['dark', def.dark]].find(([, sd]) => sd && sd.harm === hs.harm && sd.attackTime === hs.atk);
            if (pick) side = pick[0];
        } catch { /* the light side */ }
        return { uid: x.uid, kind: x.kind, id: x.id, name: def?.name ?? '?', controlled: mon, days: mon && held?.controlledUntil ? null : until, side };
    });
}

// ---- the chits for the wound and fatigue grids ----
export function fatigueDefault(st, p) {
    const cs = p.chits.map(id => st.ch.chits.find(x => x.id === id)).filter(Boolean).sort((a, b) => worth(a) - worth(b));
    for (const extra of [0, 1]) for (let size = 1; size <= cs.length; size++) {
        const rec = (i, left, pick) => { if (left === p.need + extra && pick.length === size) return pick; if (i >= cs.length || pick.length >= size) return null; return rec(i + 1, left + (cs[i].effort ?? 0), [...pick, cs[i].id]) ?? rec(i + 1, left, pick); };
        const r = rec(0, 0, []); if (r) return r;
    }
    return [];
}
export function woundDefault(st, p) {
    const cs = p.chits.map(id => st.ch.chits.find(x => x.id === id)).filter(Boolean);
    return [...cs].sort((a, b) => worth(a) - worth(b)).slice(0, p.count).map(x => x.id);
}

/** Whether the hero is hidden, in the combat header's words (a fight changes who can touch you, so it is always shown). */
export const sightOf = st => st.ch.hidden ? { hidden: true, text: 'Hidden' } : { hidden: false, text: 'In plain sight' };
