// combat/model.js: what the combat scene needs to know, worked out from the engine's state and options, with no DOM (so node tests can run it). The engine decides everything;
// this file only chooses defaults for the player's plan, finds the words for what happened (from the lines the engine already wrote) and says why a control is dim.
import { lvl, WEIGHT_WORDS } from '../../engine/core.js';
import { denSide, weaponSide } from '../../engine/combat.js';
import { NO_EFFORT_LIMIT } from '../../engine/modifiers.js';
import { nameOf } from '../../engine/items.js';

export const DIRS = ['Thrust', 'Swing', 'Smash'], MNV = ['Charge', 'Dodge', 'Duck'];
export const BOX = ['Charge/Thrust', 'Dodge/Swing', 'Duck/Smash'];          // the red boxes of the melee sheet name both (rules 4.1, 8.4.6b)
export const WORD = WEIGHT_WORDS;
// a number stays with the word before it: "attack time 6", "Round 1"
export const nb = s => String(s).replace(/ (?=\d)/g, '\u00A0');
export const baseName = s => String(s).replace(/ #\d+$/, '');
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export const numWord = n => NUM[n] ?? String(n);
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
    const bits = [...by].map(([n, k]) => (k === 1 ? `a ${n}` : `${numWord(k)} ${plural(n)}`));
    return listOf(bits);
}
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
export const chitKindWord = ch => (ch.isHorse ? String(ch.side ?? 'steed').toUpperCase() : ch.type === 'magic' ? 'MAGIC' : ch.type === 'move' ? 'MOVE' : 'FIGHT');
export const chitName = ch => `${ch.type === 'magic' ? 'Magic' : ch.type === 'move' ? 'Move' : 'Fight'} ${chitText(ch)}`;
export const limitWord = lim => (lim >= NO_EFFORT_LIMIT ? 'no limit' : lim === 3 ? 'three' : 'two');
// how much value a chit has to him, to pick the one he will miss least (a default only: he can tap another)
const worth = ch => (ch.type === 'magic' ? 40 : lvl(ch.strength) * 6 + (6 - (ch.time ?? 3)) - (ch.effort ?? 0));
export const missLeast = list => [...list].sort((a, b) => worth(a) - worth(b))[0];

// ---- the plan for the melee (the same shape the old sheet kept in ui.melee: the payload is built from it, see payload.js) ----
export const asterisksOf = (st, ...ids) => ids.map(id => st.ch.chits.find(x => x.id === id)).reduce((s, ch) => s + (ch?.effort ?? 0), 0);
// an effort total for a plan, counting what he already played this round (a spell cast in the Encounter step)
export function effortOf(st, o, m) {
    const pick = id => (id ? [...o.fightChits, ...o.moveChits].find(x => x.id === id) ?? st.ch.chits.find(x => x.id === id) : null);
    return o.asterisksPlayed + (pick(m.fightChit)?.effort ?? 0) + (pick(m.moveChit)?.effort ?? 0);
}
// Why a Fight chit or a Move chit cannot be played: the engine's own checks (strength for the weapon or the load, the effort limit); null when it can.
export function chitWhy(st, data, o, m, ch, kind) {
    const w = o.weapon, lim = o.effortLimit ?? 2;
    if (kind === 'fight' ? !o.fightOk(ch) : !o.moveOk(ch)) return kind === 'fight' ? `Too light for ${w ? `the ${nameOf(data, w.item)}` : 'your weapon'}.` : 'Too light to carry everything you own.';
    const other = kind === 'fight' ? m.moveChit : m.fightChit, pick = id => (id ? [...o.fightChits, ...o.moveChits].find(x => x.id === id) : null);
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
    m.moveChit = moves[0]?.id ?? null;
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
    const mv = last.moveChit ? o.moveChits.find(x => x.id === last.moveChit && o.moveOk(x) && x.id !== m.fightChit) : null;
    if (mv && o.asterisksPlayed + asterisksOf(st, m.fightChit) + (mv.effort ?? 0) <= lim) m.moveChit = mv.id;
    for (const [uid, b] of Object.entries(last.boxes ?? {})) if (o.boxable.some(d => d.uid === uid)) m.boxes[uid] = b;
    if (last.weaponSide) m.weaponSide = last.weaponSide;
    return m;
}
// does the repeat differ from nothing at all (is there anything to repeat)? true when last round he played at least a chit or named a target
export const repeatable = last => !!last && (last.fightChit != null || last.moveChit != null || last.target != null);

// ---- the live hint under the Guard step: what gets under the maneuver by its time (the engine's own rule: an attack whose time is lower than the maneuver's gets under it) ----
export function guardHint(st, data, o, m) {
    const mv = m.moveChit ? o.moveChits.find(x => x.id === m.moveChit) : null;
    const attackers = o.boxable.filter(d => { const s = denSide(st, data, d); return s.attack !== 'none' && s.atk != null && (d.assigned || d.partOf); });
    if (!attackers.length) return 'Nothing here strikes back.';
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
    const alert = o.canAlert && o.weapon ? { ok: true } : { ok: false, sub: !o.weapon ? 'no weapon' : gated(o.why?.alert) ? 'too slow' : 'no chit', why: gated(o.why?.alert) ? slow : (o.why?.alert ?? 'You have nothing to ready.') };
    const run = o.canRun ? { ok: true } : { ok: false, sub: o.pickedUp ? 'held' : gated(o.why?.run) ? 'too slow' : !o.runTo.length ? 'no road' : 'no chit', why: o.pickedUp ? 'You are seized and cannot run.' : gated(o.why?.run) ? slow : (o.why?.run ?? 'You cannot run now.') };
    const cast = o.casts.length ? { ok: true } : { ok: false, sub: 'none ready', why: o.blocked?.length ? `${o.blocked[0].name}: ${o.blocked[0].why}` : 'No spell is ready tonight.' };
    return { alert, run, cast, fly: o.canFly ? { ok: true } : null };
}
// "Weapon ready" verbs read the weapon's state
export const weaponVerb = o => (o.weapon?.item.alerted ? 'Put weapon away' : 'Ready weapon');

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

// ---- who is on his side (hirelings and monsters his spells have won over) ----
export const alliesOf = (st, data) => (st.combat.hires ?? []).filter(x => !x.dead).map(x => ({ uid: x.uid, kind: x.kind, id: x.id, name: x.kind === 'mon' ? data.monsters[x.id]?.name : data.natives[x.id]?.name, controlled: x.kind === 'mon' }));

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
