import { lvl, letterOf, die, roll2, shuffle, say, int, noteRoll, tally, WEIGHT_WORDS } from './core.js';
import { REPOSITION, MISSILE, clamp6, meetingResult, DIRS, MANEUVERS } from './tables.js';
import { pit, rollPit, rollCurse, pitOnChar, hasCurse } from './effects.js';
import { hirelings, monsterHires } from './hire.js';
import { cardChits, effortLimit, oneDie, tableMod, hasTreasure, chitSpeed } from './modifiers.js';
import { expireDue, expireFx, breakFx, fxTags, fxList, shielded, HERO, targetGone, sameRef } from './magic/fx.js';
import { B } from './magic/bridge.js';
import { lostTarget } from './magic/util.js';
import { breakPacify } from './magic/followers.js';
import { energizePass } from './magic/energize.js';
import { worldFadesRoll } from './magic/combathide.js';
import { morphChits, morphParts, morphView } from './magic/morph.js';
import { activatePhase, heldOptions } from './magic/phase.js';
import { flySources, carries, flyAwayTiles, startFlight, blowAway } from './magic/fly.js';
import { releaseFoes } from './magic/mist.js';
import { blockedSpells, castOptions, castSpell, resolveSpells, canCastQuietly, previewAim, aimOptions, applyAim } from './spells.js';
import { tell } from './story.js';
import { meetingOutcome, hasAdv, drinksCost } from './meeting.js';
import { mayAttackHero } from './rules/mayAttackHero.js';
import { makeItem, autoEquip, toggleItem, activeHorse, onPackHorse } from './items.js';
import { isCave, roadsFrom, tileName } from './world.js';

// Evening combat for one character against the denizens in his clearing (rules digest 03).
// The combat is a small state machine stored in st.combat; the UI reads st.pending and answers with actions:
//   encounter  -> encounterAction(st, data, { act: 'pass'|'alert'|'run', chit?, to? })
//   melee      -> meleePlay(st, data, { target, fightChit, attackDir, moveChit, moveDir, shieldDir, boxes })
//   wounds     -> chooseWounds(st, data, [chitIds])
//   fatigue    -> chooseFatigue(st, data, [chitIds])
//   pay        -> payOrFight(st, data, true|false)

const DIR_OF_BOX = [0, 1, 2];

// A fight shared by several characters (app/engine/battle.js, docs/design/multiplayer-step3.md): the combat view of each character carries `shared: true`, and the clearing's truth (the
// denizens, who has which on his sheet, the round, the quiet counter) is `st.battle`. Everything below that says `sharedFight(st)` is the one place where such a fight differs from a
// one-character fight; with one character `st.combat.shared` does not exist and none of it runs.
const sharedFight = st => !!st.combat?.shared;
const mem = st => st.battle.members[st.ch.id];

// ---- character against character (docs/design/multiplayer-step5.md) ----
// Behind the lobby switch `pvp` (R-17, `st.battle.pvp`). Another character is a target like any creature: in the Melee step he is named `'char:<id>'` in `meleeOptions().targets` (kind
// 'character'), and a hireling of someone else is named `'hire:<uid>'` (kind 'hire'). Nothing here runs unless a shared fight has the switch on.
const pvpOn = st => sharedFight(st) && !!st.battle?.pvp;
export const charUid = id => 'char:' + id;
export const charOfUid = uid => (typeof uid === 'string' && uid.startsWith('char:') ? uid.slice(5) : null);
const hireOfUid = uid => (typeof uid === 'string' && uid.startsWith('hire:') ? uid.slice(5) : null);
// Who may `me` strike or charge (8.4.2, 8.3.6b): the others in the fight, never one of the same player's, and a hidden one only if he found hidden enemies today (8.4.2b.5).
// `playing`: only those who make a play this round (the Melee step); without it everyone still in the fight (the charge).
export function charFoes(st, me = st.ch.id, playing = false) {
    const b = st.battle;
    if (!b?.pvp) return [];
    const mine = st.chars[me];
    return b.order.filter(id => id !== me && b.members[id].state === 'in' && !st.chars[id].dead && st.chars[id].owner !== mine.owner && (!playing || b.members[id].melee) && (!st.chars[id].hidden || mine.hiddenEnemies));
}
// Do two or more different players' characters stand in this fight (is there anyone to fight but creatures)? Used to keep a creature-less fight going.
export const contested = st => { const b = st.battle; return !!b?.pvp && new Set(b.order.filter(id => b.members[id].state === 'in').map(id => st.chars[id].owner)).size > 1; };

// ---- who is what ----
export function weaponOf(st, data) {
    if (st.ch.morph) return null;                       // a creature wields nothing: its own counter does the fighting (magic/morph.js)
    const it = st.ch.items.find(i => i.kind === 'weapon' && i.active);
    return it ? { item: it, def: data.weapons[it.id] } : null;
}
export function weaponSide(w, extraStars = 0) {
    if (!w) return { harm: 'N', stars: 1 + extraStars, time: null, length: 0, missile: false, none: true };       // bare Fight chit: Negligible with one star
    const side = w.item.alerted ? w.def.alerted : w.def.unalerted;
    return { harm: side.harm ?? w.def.weight, stars: (side.stars ?? 0) + extraStars, time: side.attackTime ?? null, length: w.def.length ?? 0, missile: !!w.def.missile };
}
export function activeArmor(st, data) {
    return st.ch.items.filter(i => i.kind === 'armor' && i.active && !i.destroyed).map(i => ({ item: i, def: data.armor[i.id] }));
}
// Armor that can take a blow in tie group g: pieces in use, plus any destroyed by an equally fast blow of the same group.
function armorForBlow(st, data, g) {
    return st.ch.items.filter(i => i.kind === 'armor' && ((i.active && !i.destroyed) || i.destroyedGroup === g)).map(i => ({ item: i, def: data.armor[i.id] }));
}
export function carriedWeight(st, data) {
    let w = 0;
    for (const it of st.ch.items) {
        if (it.destroyed) continue;                      // destroyed armor is no longer carried
        if (onPackHorse(st, data, it)) continue;         // what a pack horse carries needs no Move chit (7.3.1i, 8.4.5f.3)
        const def = it.kind === 'weapon' ? data.weapons[it.id] : it.kind === 'armor' ? data.armor[it.id] : it.kind === 'horse' ? null : data.treasures[it.id];
        if (!def || def.weight == null) continue;
        w = Math.max(w, lvl(def.weight));
    }
    return w;
}
// Armor coverage by attack direction index (0 thrust, 1 swing, 2 smash).
function coversDir(def, dir) {
    return (def.protects ?? []).includes(['thrust', 'swing', 'smash'][dir]);       // a shield protects only its chosen direction (handled separately)
}
const isShield = def => (def.type ?? '').toLowerCase() === 'shield' || !!def.chooseOneDirection;

// ---- denizen sides ----
// What spells in force do to a denizen's counter: Elven Grace makes its size its move time on both sides; Poison adds sharpness stars to what it inflicts.
const SIZE_TIME = { L: 1, M: 2, H: 3, T: 4 };
export function denSide(st, data, den) {
    const s = denSideRaw(st, data, den);
    if ((den.kind === 'mon' || den.kind === 'nat') && st.fx?.length) {
        const ref = { kind: den.kind, id: den.id };
        if (fxTags(st, ref, 'moveBySize').length && s.move != null) s.move = SIZE_TIME[den.kind === 'nat' ? s.vuln : s.size] ?? s.move;       // a native's size is its vulnerability (RealmSpeak)
        for (const t of fxTags(st, ref, 'stars')) s.stars = (s.stars ?? 0) + t.value;
    }
    return s;
}
function denSideRaw(st, data, den) {
    if (den.kind === 'character') {          // another character named as a target (pvp): what is public about him, as a counter would show it
        const ch = st.chars[den.id];
        return { name: ch.name, size: ch.weight, vuln: ch.weight, armored: false, harm: null, stars: 0, atk: null, move: null, length: 0, attack: 'none', fame: 0, notor: ch.notoriety ?? 0, gold: 0, tremendous: false, character: true };
    }
    if (den.kind === 'hire') {               // someone else's hireling named as a target (pvp)
        const hs = hireStats(data, den.id, den.hireKind, st);
        return { name: hs.name, size: hs.vuln, vuln: hs.vuln, armored: hs.armored, harm: hs.harm, stars: hs.stars, atk: hs.atk, move: hs.move, length: hs.length, attack: hs.harm == null ? 'none' : hs.missile ? 'missile' : 'weapon', fame: hs.fame, notor: hs.notor, gold: hs.gold, hire: true };
    }
    const morph = (den.kind === 'mon' || den.kind === 'nat') ? morphOf(st, den) : null;
    if (morph) {
        // Transform: the creature's own combat numbers; the original keeps its name, bounty and place (the bounty is paid for the original)
        const o = den.kind === 'mon' ? data.monsters[den.id] : data.natives[den.id];
        const fame = den.kind === 'mon' ? o.fame ?? 0 : o.fameBounty ?? 0, notor = den.kind === 'mon' ? o.notoriety ?? 0 : o.notorietyBounty ?? 0;
        return { name: `${morph.name} (${o.name}, transformed)${den.tag ? ` #${den.tag}` : ''}`, size: morph.vulnerability, vuln: morph.vulnerability, armored: !!morph.armored, harm: morph.strength, stars: 0, atk: morph.attackTime, move: morph.moveTime,
            length: 0, attack: morph.strength ? 'weapon' : 'none', fame, notor, gold: den.kind === 'nat' ? o.goldBounty ?? 0 : 0, tremendous: false, transformed: true };
    }
    if (den.kind === 'mon') {
        const m = data.monsters[den.id];
        const s = den.side === 'red' && m.red ? { ...m.red, length: m.red.length ?? 0, attack: 'weapon' } : (den.side === 'dark' && m.dark ? m.dark : m.light);
        return { name: m.name + (den.tag ? ` #${den.tag}` : ''), size: m.size, vuln: m.vulnerability, armored: !!m.armored, harm: s.harm, stars: s.stars ?? 0, atk: s.attackTime, move: s.moveTime,
            length: s.length ?? m.light.length ?? 0, attack: s.attack ?? 'weapon', spell: s.spell, fame: m.fame ?? 0, notor: m.notoriety ?? 0, gold: 0, tremendous: !!m.red };
    }
    if (den.kind === 'part') {
        const owner = st.combat.dens.find(d => d.uid === den.partOf);
        const m = data.monsters[owner.id], p = m.parts.find(x => x.id === den.id);
        const s = p[den.side === 'dark' ? 'dark' : 'light'];
        const tag = owner.tag ? ` #${owner.tag}` : '';
        return { name: (p.name ? `${m.name}${tag} ${p.name}` : `${m.name}${tag}`), size: m.size, vuln: null, armored: false, harm: s.harm, stars: s.stars ?? 0, atk: s.attackTime,
            move: null, length: s.length ?? 0, attack: 'weapon', part: true };
    }
    if (den.kind === 'nat') {
        const n = data.natives[den.id];
        const s = den.side === 'dark' ? n.dark : n.light;
        const atk = s.attackTime, none = s.harm == null || s.attackTime == null;
        return { name: n.name, size: n.weight, vuln: n.vulnerability, armored: !!n.armored, harm: s.harm, stars: s.stars ?? 0, atk, move: s.moveTime,
            length: n.weapon?.length ?? 0, attack: none ? 'none' : (n.weapon?.missile ? 'missile' : 'weapon'), fame: n.fameBounty ?? 0, notor: n.notorietyBounty ?? 0, gold: n.goldBounty ?? 0, leader: !!n.leader, type: n.type, group: n.group };
    }
    if (den.kind === 'horse') {
        const n = data.natives[den.owner], h = n.horse;
        const s = h[st.combat.melee ? 'dark' : 'light'];
        return { name: h.name, size: s.vulnerability, vuln: s.vulnerability, armored: h.name === 'Warhorse', harm: null, atk: null, move: s.moveTime, length: 0, attack: 'none', horse: true };
    }
    throw new Error('unknown denizen kind ' + den.kind);
}

// What Transform has made of a monster or native (the Transform Table row), or null.
export const morphOf = (st, den) => fxTags(st, { kind: den.kind, id: den.id }, 'morph')[0]?.value ?? null;

// ---- starting a combat ----
const nextUid = st => { st.uidSeq = (st.uidSeq ?? 0) + 1; return 'd' + st.uidSeq; };

export function denizensIn(st, data, clearing) {
    const out = [];
    for (const m of st.mons) if (!m.dead && !m.hired && m.loc?.c === clearing) out.push({ kind: 'mon', id: m.id });
    return out;
}
export function nativesIn(st, data, clearing) {
    return st.nats.filter(n => !n.dead && !n.hired && n.loc?.c === clearing);
}

export function startCombat(st, data, clearing) {
    const c = st.combat = { at: clearing, round: 1, quiet: 0, step: 'start', dens: [], battling: {}, events: [], melee: false, ended: false, ran: false, pays: [], rollFrom: st.rollSeq ?? 0 };
    c.hires = [
        ...hirelings(st).filter(n => n.loc?.c === clearing).map(n => ({ uid: nextUid(st), kind: 'nat', id: n.id, dead: false })),
        ...monsterHires(st).filter(m => m.loc?.c === clearing).map(m => ({ uid: nextUid(st), kind: 'mon', id: m.id, dead: false })),       // controlled or hired monsters fight for him too
    ];
    for (const m of denizensIn(st, data, clearing)) {
        const den = addDen(st, data, { kind: 'mon', id: m.id }); tally(st, `faced.${data.monsters[m.id].name}`);
        if (m.pacify?.length) { den.pacified = true; den.bystander = true; }               // pacified (Deal with Goblins): it stands by and is not set on him
    }
    c.intro = introLines(st, data, c);
    // Natives roll the Meeting Table once per group present, to see whether the group battles him (he may buy drinks first).
    c.meetQueue = [...new Set(nativesIn(st, data, clearing).map(n => data.natives[n.id].group))];
    return nextMeeting(st, data);
}

// How this fight came about, in the order the player would want it explained: how each creature got here, and how he stood when evening fell.
function introLines(st, data, c) {
    const te = st.turnEnd && st.turnEnd.day === st.day ? st.turnEnd : null;
    const lines = [];
    // creatures that came the same way are told together: "The two Heavy Flying Dragons (#1 and #2) answered the call of the Smoke ..."
    const groups = new Map();
    for (const d of c.dens.filter(x => x.kind === 'mon')) {
        const a = te?.arrivals?.find(x => x.id === d.id);
        const cause = !a ? 'was already in this clearing'
            : a.why === 'prowls in your tile' ? 'was prowling elsewhere in this tile and came to your clearing when your turn ended'
                : `answered the call of ${a.why.replace(/^called by /, 'the ')}, which turned up when your turn ended`;
        (groups.get(cause) ?? groups.set(cause, []).get(cause)).push(d);
    }
    const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const plural = n => (/wolf$/i.test(n) ? n.replace(/wolf$/i, 'Wolves') : /s$/i.test(n) ? n : `${n}s`);
    for (const [cause, list] of groups) {
        const plain = list.map(d => denSide(st, data, d).name);
        const bases = [...new Set(list.map(d => data.monsters[d.id].name))];
        let subject;
        if (list.length === 1) subject = `The ${plain[0]}`;
        else if (bases.length === 1) subject = `The ${NUM[list.length] ?? list.length} ${plural(bases[0])} (${list.map(d => `#${d.tag}`).join(' and ').replace(/ and (?=#\d+ and )/g, ', ')})`;
        else subject = `The ${plain.join(', ').replace(/, ([^,]+)$/, ' and $1')}`;
        lines.push(`${subject} ${list.length > 1 ? cause.replace(/^was /, 'were ').replace(/^answered/, 'answered') : cause}.`);
    }
    if (te?.blocked) lines.push(te.blockers?.length ? `Your turn was cut short: ${[...new Set(te.blockers)].join(', ')} blocked you.` : 'Your turn was cut short.');
    else if (te?.closedIn?.length) lines.push('Your turn was already over when they arrived, so no phase was lost, but they found you.');
    lines.push(st.ch.hidden ? 'You are hidden, so creatures cannot be set on you unless you give yourself away.' : 'You are in plain sight, so the creatures here will come for you.');
    return lines;
}

function nextMeeting(st, data) {
    const c = st.combat;
    while (c.meetQueue.length) {
        const g = c.meetQueue[0], cost = drinksCost(st, data, g);
        if (relOf(st, g) < 1 && cost > 0 && st.ch.gold >= cost && !hasCurse(st, 'Ashes')) {
            c.step = 'drinks';
            st.pending = { type: 'combat-drinks', group: g, cost };
            return;
        }
        c.meetQueue.shift();
        rollBattle(st, data, g);
    }
    // natives who are not battling him stand by: he may still pick a fight with them
    for (const n of nativesIn(st, data, c.at)) if (!c.dens.some(d => d.kind === 'nat' && d.id === n.id)) addDen(st, data, { kind: 'nat', id: n.id }).bystander = true;
    if (!c.pays.length) return afterMeeting(st, data);
    c.step = 'pay';
    st.pending = { type: 'combat-pay', ...c.pays[0] };
}

// Rule 8.2.2a: before the evening Meeting roll he may pay one gold a head to make the group one level friendlier.
export function drinksAction(st, data, buy) {
    const c = st.combat;
    if (c.step !== 'drinks') throw new Error('nobody is offering drinks now');
    const g = c.meetQueue.shift(), cost = drinksCost(st, data, g);
    st.pending = null;
    if (buy) {
        if (st.ch.gold < cost) throw new Error('not enough gold');
        st.ch.gold -= cost;
        say(st, `You buy drinks for the ${g} (${cost} gold): they warm to you.`, 'combat');
    }
    rollBattle(st, data, g, buy);
    return nextMeeting(st, data);
}

// Evening with only peaceful natives about: he decides whether to attack them (any one of them, which brings its whole group in).
export function choiceAction(st, data, fight) {
    const c = st.combat;
    if (c.step !== 'choice') throw new Error('there is no choice to make');
    c.choiceMade = true;
    if (!fight) {
        say(st, 'You let the natives be.', 'combat');
        if (canCastQuietly(st, data)) return enterSpellOnly(st, data);
        c.ended = true; c.why = 'quiet'; c.step = 'done'; st.pending = null; return;
    }
    enterEncounter(st, data);
}

function addDen(st, data, d) {
    const den = { uid: nextUid(st), kind: d.kind, id: d.id, side: 'light', box: null, assigned: false, dead: false, pickedUp: false, partOf: d.partOf ?? null, owner: d.owner ?? null, tag: null };
    if (sharedFight(st)) { if (d.kind === 'mon' || d.kind === 'nat') den.sheet = null; if (d.kind === 'nat') den.battlers = []; }       // (whose sheet it is on; the characters a native group is fighting)
    st.combat.dens.push(den);
    if (d.kind === 'mon') {
        // several of the same creature: "Heavy Spider #1", "Heavy Spider #2", so they can be told apart everywhere they are named
        const same = st.combat.dens.filter(x => x.kind === 'mon' && data.monsters[x.id].name === data.monsters[d.id].name);
        if (same.length > 1) same.forEach((x, i) => { x.tag = i + 1; });
        const m = data.monsters[d.id];
        for (const p of m.parts ?? []) addDen(st, data, { kind: 'part', id: p.id, partOf: den.uid });
    }
    if (d.kind === 'nat') {
        const n = data.natives[d.id];
        const alive = st.nats.find(x => x.id === d.id);
        if (n.horse && !alive.horseDead && !isCave(st, data, st.combat.at)) addDen(st, data, { kind: 'horse', id: d.id + '-horse', owner: d.id, partOf: den.uid });
    }
    return den;
}

function relOf(st, group) { return st.ch.rel?.[group] ?? 0; }

// A missile roll (one die for archers, otherwise two): returns the change to harm level and notes the roll for the dice tray.
function missileRoll(st, what, archer) {
    const r = archer ? (() => { const d = die(st); return { dice: [d], value: d }; })() : roll2(st);
    const m = MISSILE[r.value - 1];
    noteRoll(st, what, r.dice, r.value, `${m >= 0 ? '+' : ''}${m} harm level${Math.abs(m) === 1 ? '' : 's'}`);
    return m;
}

function rollBattle(st, data, group, drinks = false) {
    const c = st.combat;
    // Each Meeting roll (and any Trouble or Opportunity re-roll) is noted in the dice tray and the log by meetingOutcome.
    const { res } = meetingOutcome(st, relOf(st, group) + (drinks ? 1 : 0), `Evening meeting with the ${group}`, data, true);
    (c.intro ??= []).push(res === 'Block/Battle' ? `The ${group} met you with hostility and will fight.` : res === 'Insult' || res === 'Challenge' ? `The ${group} ${res === 'Insult' ? 'insulted' : 'challenged'} you: pay or fight.` : `The ${group} are here, and let you be.`);
    if (res === 'Block/Battle') return startBattling(st, data, group);
    if (res === 'Insult') c.pays.push({ group, cost: 'notoriety', amount: 5, why: 'Insult' });
    else if (res === 'Challenge') { if (hasCurse(st, 'Disgust')) startBattling(st, data, group); else c.pays.push({ group, cost: 'fame', amount: 5, why: 'Challenge' }); }
}

function startBattling(st, data, group) {
    const c = st.combat;
    if (sharedFight(st)) return startBattlingShared(st, data, group);
    if (c.battling[group]) return;
    c.battling[group] = true;
    for (const n of nativesIn(st, data, c.at)) {
        if (data.natives[n.id].group !== group) continue;
        const den = c.dens.find(d => d.kind === 'nat' && d.id === n.id);
        if (den) den.bystander = false; else addDen(st, data, { kind: 'nat', id: n.id });
    }
    say(st, `The ${group} will fight you.`, 'combat');
}

// A group fights specific characters (8.2.1d): this one joins them, and the group's natives come into the fight (or stop standing by) as far as he is concerned.
function startBattlingShared(st, data, group) {
    const c = st.combat, id = st.ch.id, list = (st.battle.battling[group] ??= []);
    if (list.includes(id)) return;
    list.push(id);
    for (const n of nativesIn(st, data, c.at)) {
        if (data.natives[n.id].group !== group) continue;
        const den = c.dens.find(d => d.kind === 'nat' && d.id === n.id) ?? addDen(st, data, { kind: 'nat', id: n.id });
        if (!den.battlers.includes(id)) den.battlers.push(id);
        den.bystander = false;
    }
    say(st, `The ${group} will fight ${st.ch.name}.`, 'combat');
}

export function payOrFight(st, data, pay) {
    const c = st.combat, p = c.pays.shift();
    if (pay) {
        if (p.cost === 'notoriety') st.ch.notoriety -= p.amount; else st.ch.fame -= p.amount;
        say(st, `You pay ${p.amount} ${p.cost} to avoid the ${p.why.toLowerCase()} from the ${p.group}.`, 'combat');
    } else startBattling(st, data, p.group);
    if (c.pays.length) { st.pending = { type: 'combat-pay', ...c.pays[0] }; return; }
    afterMeeting(st, data);
}
// His Meeting rolls are done. Alone he goes on to the Encounter step; in a shared fight the next character rolls first (battle.js asks for the Encounter steps in turn).
function afterMeeting(st, data) {
    if (sharedFight(st)) { mem(st).meet = 'done'; return; }
    return enterEncounter(st, data);
}

// ---- encounter step ----
// Heavenly Protection (Pilgrim): Demons and the Imp cannot attack him or be assigned to him; he can still attack them (kernel rules/mayAttackHero.js).
const barredFromHero = (st, data, d) => d.kind === 'mon' && !mayAttackHero(data.monsters[d.id].family, st.ch.adv ?? []);

function assignAll(st, data) {
    const c = st.combat;
    if (st.ch.hidden) return;
    for (const d of c.dens) if (!d.dead && !d.assigned && !d.bystander && !d.pacified && !barredFromHero(st, data, d) && d.kind !== 'part' && d.kind !== 'horse') d.assigned = true;      // a creature a spell has made peaceful is not set on him
}

// His own horse is played like a Move chit, either side up (walking or galloping), whichever he can use; it is played once a round.
function horseChits(st, data) {
    const h = activeHorse(st);
    if (!h || isCave(st, data, st.ch.at)) return [];
    if (st.combat?.dens?.some(d => d.pickedUp && !d.dead)) return [];       // a red-side Tremendous monster holds him: no horse play (8.4.7 d.2)
    const d = data.horses[h.id];
    if (!d) return [];
    return [['walk', d.walk], ['gallop', d.gallop]].map(([side, x]) => ({ id: `horse:${h.uid}:${side}`, horseUid: h.uid, side, type: 'move', strength: x.strength, time: x.moves, effort: 0, state: 'active', card: true, isHorse: true, name: `${d.name} (${side === 'walk' ? 'walking' : 'galloping'})` }));
}

function activeChits(st, type, data) {
    // A hero who is a creature (Absorb Essence, Transform) plays dummy chits made from its counter and nothing of his own (RS CharacterWrapper:4950: only colour chits remain)
    if (st.ch.morph) return morphChits(st, type).filter(x => !st.combat.played?.['morph:' + x.type]);
    let real = st.ch.chits.filter(x => x.state === 'active' && (!type || x.type === type));
    // Elven Grace: each Move chit's strength is its time number (the chits themselves are unchanged)
    if (st.fx?.length && fxTags(st, HERO, 'moveBySize').length) real = real.map(x => (x.type === 'move' ? { ...x, time: SIZE_TIME[x.strength] ?? x.time } : x));
    // Unleash Power: a transformed Magic chit is both a Move chit and a Fight chit (one play a round: both share the chit's id)
    if (st.fx?.length && type) real = [...real, ...st.ch.chits.filter(x => x.state === 'active' && x.type === 'magic' && x.alt?.mf).map(x => ({ ...x, type, strength: x.alt.strength, mf: true }))];
    // Draught of Speed / Garb of Speed: the asterisks of each chit fix its time (Treasures 6); Boots, Gloves and horses keep their own
    if (hasTreasure(st, 'draught-of-speed') || hasTreasure(st, 'garb-of-speed')) real = real.map(x => (x.type === 'move' || x.type === 'fight' ? { ...x, time: chitSpeed(st, x) } : x));
    const cards = type ? cardChits(st, type) : [...cardChits(st, 'move'), ...cardChits(st, 'fight')];
    const horse = (!type || type === 'move') && data ? horseChits(st, data) : [];
    return [...real, ...cards, ...horse].filter(x => !st.combat.played?.[x.id] && !(x.isHorse && st.combat.played?.['horse:' + x.horseUid]));
}

// Hurricane Winds: the creature it was cast at flies off just before the next Encounter Step, with its parts and its horse, and lands in the tile named at Birdsong
// (day.js landDenizens). Nobody is paid for it.
function flyAway(st, data) {
    const c = st.combat;
    for (const f of fxList(st, { spell: 'hurricane-winds' })) {
        const t = f.targets[0];
        if (sameRef(t, HERO)) {
            // the hero himself: his horses and belongings go with him, his evening is over, and he comes down by a die when his next day begins (landHero in day.js beginDay)
            blowAway(st, f.data.tile);
            say(st, `Hurricane Winds lifts you into the air and carries you off toward the ${tileName(f.data.tile)}.`, 'combat');
            expireFx(st, data, f.id, 'it flew away');
            endCombat(st, data, 'flew');
            return true;
        }
        const den = c.dens.find(d => d.kind === t.kind && d.id === t.id && !d.dead);
        if (!den) continue;
        den.dead = true;
        for (const p of c.dens.filter(d => d.partOf === den.uid)) p.dead = true;
        const o = (den.kind === 'mon' ? st.mons : st.nats).find(x => x.id === den.id);
        if (o) o.loc = { tile: f.data.tile, flying: true };
        say(st, `Hurricane Winds lifts the ${denSide(st, data, den).name} into the air and carries it off toward the ${tileName(f.data.tile)}.`, 'combat');
        c.eventful = true;
        expireFx(st, data, f.id, 'it flew away');
    }
    return false;
}

function enterEncounter(st, data) {
    const c = st.combat;
    if (flyAway(st, data)) return;                       // Hurricane Winds took him: the fight is over for him
    if (st.ch.mist) { releaseFoes(c); return endCombat(st, data, 'mist'); }       // mist takes no part in combat: a Melt into Mist that woke between rounds ends it here
    const live = c.dens.filter(d => !d.dead && !d.pacified && d.kind !== 'part' && d.kind !== 'horse');          // a creature made peaceful by a spell is not a foe
    if (!live.length && !(pvpOn(st) && contested(st))) {          // (pvp: another player's character is someone to fight, so the round is held)
        if (canCastQuietly(st, data)) return enterSpellOnly(st, data);
        c.ended = true; c.why = 'quiet'; c.step = 'done'; st.pending = null;
        say(st, 'Nothing here wants a fight.', 'combat');
        return;
    }
    if (!c.choiceMade && live.length && !(pvpOn(st) && contested(st)) && live.every(d => d.bystander || barredFromHero(st, data, d))) {          // (pvp: with another player's character there he is in the fight whatever the natives do)          // (a Demon or Imp against a Pilgrim stands by, like a peaceful native)
        c.step = 'choice';
        st.pending = { type: 'combat-choice', groups: [...new Set(live.map(d => (d.kind === 'nat' ? data.natives[d.id].group : data.monsters[d.id].name)))] };
        return;
    }
    c.melee = false;
    c.played = {};
    c.asterisks = { move: 0, fight: 0, magic: 0 };
    c.casts = [];
    c.step = 'encounter';
    if (!sharedFight(st)) { assignAll(st, data); deployHires(st, data); }          // (a shared fight lures, assigns and deploys for everybody before the first Encounter step: battle.js)
    st.pending = { type: 'combat-encounter', round: c.round };
}

// A character who charged another (8.3.6b) spends his Encounter action on it: the Move chit is played now and he goes straight on to the Melee step (battle.js).
export function chargeEncounter(st, data) {
    enterEncounter(st, data);
    const c = st.combat;
    if (c.ended || c.step !== 'encounter' || !c.charge) return;
    const chit = activeChits(st, 'move', data).find(x => x.id === c.charge.chit);
    if (!chit) {                                                    // (cannot happen unless a spell took the chit between the charge and now)
        say(st, 'Your charge comes to nothing: the chit is no longer ready.', 'combat');
        st.battle.charges = st.battle.charges.filter(x => x.by !== st.ch.id); c.charge = null; mem(st).charge = null;
        return;
    }
    playChit(st, chit);
    st.pending = null;
    enterMelee(st, data);
}

// What a quiet evening may still offer: the casts that have a use tonight (or all castable ones, `all`), minus the spells already cast in an earlier quiet round.
function quietCasts(st, data, all = false) {
    const done = st.combat?.quietDone ?? [];
    return castOptions(st, data).filter(o => !done.includes(o.spell) && (all || st.options?.castAnytime || o.useful || o.quiet));
}

// Nothing is fighting him, but there is a spell worth casting: the Encounter step is held so that he may cast it (rule 8.8.3: combat is held
// every evening a spell could be cast). Casting, or passing, ends it.
function enterSpellOnly(st, data) {
    const c = st.combat;
    c.melee = false; c.played = {}; c.asterisks = { move: 0, fight: 0, magic: 0 }; c.casts = [];
    c.spellOnly = true;
    c.step = 'encounter';
    st.pending = { type: 'combat-encounter', round: c.round, spellOnly: true };
}

// Hirelings go for the most dangerous creature; a creature set on by a hireling fights it instead of the character.
function deployHires(st, data) {
    const c = st.combat;
    // A red-side-up monster holding a hireling stays on it (8.6.2); once that hireling is dead it lets go and is a foe like any other again
    const held = new Map();
    for (const d of c.dens) {
        if (d.pickedUp && d.engagedBy && !d.dead) {
            if ((c.hires ?? []).some(h => h.uid === d.engagedBy && !h.dead)) held.set(d.uid, d.engagedBy);
            else { d.pickedUp = false; d.side = 'light'; }
        }
    }
    for (const d of c.dens) d.engagedBy = held.get(d.uid) ?? null;
    const crew = (c.hires ?? []).filter(x => !x.dead && ![...held.values()].includes(x.uid));          // a hireling in a monster's grip is not sent at another
    for (const [dUid, hUid] of held) { const hire = c.hires.find(h => h.uid === hUid); hire.target = dUid; c.dens.find(d => d.uid === dUid).assigned = false; }
    for (const hire of crew) {
        const cand = c.dens.filter(d => !d.dead && !d.bystander && !d.pacified && d.kind !== 'part' && d.kind !== 'horse' && !d.pickedUp);
        if (!cand.length) break;
        const free = cand.filter(d => !d.engagedBy);
        const pool = free.length ? free : cand;
        pool.sort((a, b) => lvl(denSide(st, data, b).harm ?? 'N') - lvl(denSide(st, data, a).harm ?? 'N'));
        const t = pool[0];
        t.engagedBy ??= hire.uid;
        t.assigned = false;
        hire.target = t.uid;
    }
}

// What the UI may offer in the encounter step.
// Where he may run to: any road he knows, but back along the road he came by if he moved into this clearing today (rule 8.3.8).
export function runDestinations(st, data) {
    const roads = roadsFrom(st, data, st.ch.at).filter(r => r.usable).map(r => r.to);
    const from = st.ch.arrivedFrom;
    return from ? roads.filter(to => to === from) : roads;
}

export function encounterOptions(st, data) {
    const c = st.combat, w = weaponOf(st, data);
    const dens = c.dens.filter(d => d.assigned && !d.dead && d.kind !== 'part' && d.kind !== 'horse');
    const speedOf = d => {
        const horse = c.dens.find(h => h.kind === 'horse' && h.partOf === d.uid && !h.dead);
        return horse ? (denSide(st, data, horse).move ?? 99) : (denSide(st, data, d).move ?? 99);
    };
    const charged = sharedFight(st) ? (c.incoming ?? []) : [];             // characters charging him: their Move chit counts like a creature's move time (8.3.7a)
    const slowest = Math.min(dens.length ? Math.min(...dens.map(speedOf)) : 99, ...charged.map(x => x.time));     // chits must be strictly faster than every denizen
    const pickedUp = dens.some(d => d.pickedUp);
    const wlvl = w ? lvl(data.weapons[w.item.id].weight) : 0;
    const fight = activeChits(st, 'fight', data).filter(x => x.time < slowest && lvl(x.strength) >= wlvl);
    const load = st.ch.morph ? 0 : carriedWeight(st, data);       // (a creature's gear is switched off or bound up in the spell: nothing to carry)
    const move = activeChits(st, 'move', data).filter(x => x.time < slowest && lvl(x.strength) >= (x.isHorse ? Math.max(load, lvl(st.ch.weight)) : load));
    // hidden, and nothing is on his sheet (denizens cannot be assigned to a hidden character): nothing can attack him, so he may simply let the evening pass
    const canStay = !!st.ch.hidden && !c.dens.some(d => !d.dead && (d.assigned || d.engagedBy || d.pickedUp)) && !(c.hires ?? []).some(x => !x.dead);
    // A Fly chit is played like a Move chit (spell durations, Fly): strictly faster than every creature on his sheet, strong enough to carry him (what is heavier is left behind).
    // It takes him out of the fight to a neighbouring tile (8.3.8e) and is spent. A Tremendous monster that holds him still holds him (8.4.7 d.2).
    const flyChits = pickedUp || st.ch.mist ? [] : flySources(st, data).filter(x => x.time < slowest && carries(st, x) && !c.played?.[x.id]);
    // Why a section is missing (8.3.7a, 8.3.8): the gate is the slowest creature ON HIS SHEET; a hidden hero with nothing assigned has none. The screen says it in words.
    const denGate = dens.length ? dens.reduce((a, d) => (speedOf(d) < speedOf(a) ? d : a)) : null;
    const chargeGate = charged.length ? charged.reduce((a, x) => (x.time < a.time ? x : a)) : null;
    const byCharge = !!chargeGate && (!denGate || chargeGate.time < speedOf(denGate));
    const gate = byCharge ? chargeGate : denGate;
    const gateName = byCharge ? `${chargeGate.name}, charging you` : denGate ? denSide(st, data, denGate).name : null;
    const gateText = byCharge ? `${chargeGate.name}'s charge (it moves ${slowest})` : denGate ? `the ${gateName} (it moves ${slowest})` : null;
    const wname = w ? nameOfItem(st, data, w.item) : null;
    const gripped = !!w && hasTreasure(st, 'gripping-dust');         // the Dust keeps the weapon alerted: there is nothing to turn
    const chitsFor = kind => activeChits(st, kind, data);
    const fastEnough = x => x.time < slowest;
    const why = {
        gate: gate ? { name: gateName, speed: slowest } : null,
        alert: !w || (fight.length && !gripped) ? null
            : gripped ? 'Your Gripping Dust keeps the weapon alerted: it cannot be turned over.'
            : st.ch.morph ? null
                : !chitsFor('fight').length ? 'You have no ready Fight chit to ready your weapon with.'
                    : !chitsFor('fight').some(x => lvl(x.strength) >= wlvl) ? `No ready Fight chit is strong enough for your ${wname} (it needs ${WEIGHT_WORDS[data.weapons[w.item.id].weight] ?? "a stronger"} chit or better).`
                        : `No ready Fight chit that is strong enough is faster than ${gateText}: a chit played here must be strictly faster, so time ${slowest - 1} or lower.`,
        run: pickedUp || canRunNow(move, st, data) ? null
            : !runDestinations(st, data).length ? (st.ch.arrivedFrom ? 'You came into this clearing today, so you may only run back the way you came, and that road is closed to you.' : 'There is no road you know that you could run along.')
                : !chitsFor('move').length ? 'You have no ready Move chit to run with.'
                    : chitsFor('move').every(x => !fastEnough(x)) ? `No ready Move chit is faster than ${gateText}: a chit played here must be strictly faster, so time ${slowest - 1} or lower.`
                        : 'No ready Move chit that is fast enough is also strong enough to carry everything you own.',
    };
    const casts = (c.spellOnly ? quietCasts(st, data, true) : castOptions(st, data, { slowest })).map(o => (c.spellOnly ? { ...o, aim: previewAim(st, data, o) } : o));       // (a quiet-evening cast has no Melee step: it is aimed on the cast screen)
    return { canStay, flyChits, canFly: flyChits.length > 0 && flyAwayTiles(st).length > 0, flyTiles: flyAwayTiles(st), held: heldOptions(st, data), casts, blocked: blockedSpells(st, data, { slowest }), canAlert: !!w && fight.length > 0 && !gripped, alertChits: fight, canRun: !pickedUp && move.length > 0 && runDestinations(st, data).length > 0, runChits: move, pickedUp, weapon: w, runTo: runDestinations(st, data), morph: morphView(st), slowest, why };
}
const canRunNow = (move, st, data) => move.length > 0 && runDestinations(st, data).length > 0;

// Is the cast the player named one of the options the screen lists? (a Magic chit cast, or an item's spell card)
const isOffered = (casts, a) => casts.some(o => o.spell === a.spell && (a.item ? o.item === a.item : o.chit === a.chit && !o.item));

export function encounterAction(st, data, a) {
    const c = st.combat;
    if (c.step !== 'encounter') throw new Error('not in the encounter step');
    if (c.spellOnly) {
        // only a spell can be cast; anything else is a pass
        if (a.act === 'gear') { gearAction(st, data, a); st.pending = { type: 'combat-encounter', round: c.round, spellOnly: true }; return; }       // (the evening is still held for his spell)
        if (a.act !== 'cast' && a.act !== 'pass') throw new Error('nothing is fighting you: you may cast a spell, switch a belonging or do nothing');       // (a stray Run or Fly is not a way to end the evening)
        if (a.act === 'cast') {
            if (!isOffered(quietCasts(st, data, true), a)) throw new Error('you cannot cast that spell now');       // (only what the cast screen lists: not one already cast tonight)
            castSpell(st, data, a.spell, a.chit, a.item); applyAim(st, data, a.spellAim); resolveSpells(st, data);
            // Rule 8.1.3a: a quiet clearing still gets its rounds, one spell to a round. When another spell is worth casting, the next round is held for it
            // (not the same spell again: a second one on the same target would only be nullified).
            (c.quietDone ??= []).push(a.spell);
            expireDue(st, data, 'round-end');
            c.casts = []; c.played = {};                        // (this round's spells are done: the next round starts clean)
            if (!c.ended && !st.ch.dead && !st.ch.mist && !st.ch.flying && quietCasts(st, data).length) {
                if (sharedFight(st)) { c.spellOnly = false; c.again = true; c.casts = []; c.played = {}; mem(st).enc = 'done'; mem(st).done = true; return; }          // (the next round is the table's: battle.js)
                c.round += 1;
                energizePass(st, data, 'round');
                return enterSpellOnly(st, data);
            }
        }
        c.spellOnly = false;
        return endCombat(st, data, 'quiet');
    }
    const opt = encounterOptions(st, data);
    if (a.act === 'cast') {
        if (!isOffered(opt.casts, a)) throw new Error('you cannot cast that now: a Magic chit must be no slower than the fastest creature facing you');       // (8.3.7a.2: the same list the screen shows)
        castSpell(st, data, a.spell, a.chit, a.item);
        return enterMelee(st, data);
    }
    if (a.act === 'stay') {
        if (!opt.canStay) throw new Error('you are not hidden from everything here');
        say(st, 'You stay hidden. Nothing here can find you, and the evening passes without a blow.', 'combat');
        return endCombat(st, data, 'quiet');
    }
    if (a.act === 'gear') {
        gearAction(st, data, a);             // without playing a chit he may switch one item on or off, or abandon one (8.3.7d); the Melee step follows
    } else if (a.act === 'protect') {
        // a held Phase spell is activated like an item, in place of a chit action (so he cannot also cast this round)
        activatePhase(st, data, a.fx, 'round');
    } else if (a.act === 'alert') {
        if (st.ch.morph) throw new Error('a creature has no weapon to ready');
        if (!opt.canAlert) throw new Error(hasTreasure(st, 'gripping-dust') ? 'your Gripping Dust keeps the weapon alerted' : 'cannot flip the weapon with that chit');
        const chit = opt.alertChits.find(x => x.id === a.chit);
        if (!opt.weapon || !chit) throw new Error('cannot flip the weapon with that chit');
        playChit(st, chit);
        opt.weapon.item.alerted = !opt.weapon.item.alerted;
        say(st, `You turn your ${data.weapons[opt.weapon.item.id].name} ${opt.weapon.item.alerted ? 'alerted' : 'unalerted'}.`, 'combat');
    } else if (a.act === 'fly') {
        const chit = opt.flyChits.find(x => x.id === a.chit) ?? (a.chit == null ? opt.flyChits[0] : null);
        if (!chit || !opt.canFly) throw new Error('you have no Fly chit you can play now');
        if (a.to != null && !opt.flyTiles.includes(a.to)) throw new Error('you can fly only to a tile next to this one');
        c.played[chit.id] = true;
        c.ran = true; c.flew = true;
        say(st, startFlight(st, data, a.to ?? opt.flyTiles[0], chit), 'combat');
        if (sharedFight(st)) { releaseSheet(st); mem(st).enc = 'done'; }
        return toFatigue(st, data);
    } else if (a.act === 'run') {
        const chit = opt.runChits.find(x => x.id === a.chit);
        if (!chit) throw new Error('cannot run with that chit');
        const dests = runDestinations(st, data);
        if (!dests.length) throw new Error('there is nowhere to run');
        if (a.to != null && !dests.includes(a.to)) throw new Error(st.ch.arrivedFrom ? 'you can only run back along the road you came by' : 'you can only run along a road you know');
        playChit(st, chit);
        c.ran = true;
        st.ch.runTo = a.to ?? dests[0];
        say(st, 'You break away from the fight.', 'combat');
        if (sharedFight(st)) { releaseSheet(st); mem(st).enc = 'done'; }
        return toFatigue(st, data);
    } else if (a.act !== 'pass') throw new Error('unknown encounter action');
    enterMelee(st, data);
}

// The Encounter-step belongings action (8.3.7d, 4.3.2): switch one item on or off, or abandon one where he stands (`a.drop`). The same horse and boots checks as between
// phases (items.js toggleItem).
function gearAction(st, data, a) {
    const c = st.combat;
    if (st.ch.morph && !a.drop) throw new Error('your gear is of no use to a creature');
    const it = st.ch.items.find(i => i.uid === a.item);
    if (!it) throw new Error('no such item');
    if (it.destroyed && !a.drop) throw new Error('that item is destroyed');
    if (a.drop) {
        st.ch.items = st.ch.items.filter(i => i.uid !== it.uid);
        st.abandoned[c.at] = [...(st.abandoned[c.at] ?? []), { ...it, active: false, alerted: false }];
        say(st, `You leave the ${nameOfItem(st, data, it)} behind.`, 'combat');
        return;
    }
    toggleItem(st, data, it);
    say(st, `You ${it.active ? 'activate' : 'deactivate'} the ${nameOfItem(st, data, it)}.`, 'combat');
}

function playChit(st, chit) {
    const c = st.combat;
    c.played[chit.id] = true;
    if (chit.morph) c.played['morph:' + chit.type] = true;       // one counter: one play of each kind a round, whichever side is up
    if (chit.isHorse) c.played['horse:' + chit.horseUid] = true;       // one side of the horse a round
    if (chit.effort) c.asterisks[chit.type === 'move' ? 'move' : 'fight'] += chit.effort;
}

const chitName = ch => `${ch.type === 'move' ? 'Move' : ch.type === 'magic' ? 'Magic' : 'Fight'} ${ch.type === 'magic' ? (ch.numeral ?? '') : (ch.strength ?? '')}${ch.time}${'*'.repeat(ch.effort ?? 0)}`;

function nameOfItem(st, data, it) {
    return (it.kind === 'weapon' ? data.weapons[it.id] : it.kind === 'armor' ? data.armor[it.id] : it.kind === 'horse' ? data.horses[it.id] : data.treasures[it.id])?.name ?? it.id;
}

// ---- melee step: collect his secret plays ----
function enterMelee(st, data) {
    const c = st.combat;
    c.melee = true;
    if (sharedFight(st)) { c.step = 'melee-wait'; mem(st).enc = 'done'; return; }          // everybody's secret plays are asked for together, once the last Encounter action is in
    c.step = 'melee';
    st.pending = { type: 'combat-melee', round: c.round };
}

export function meleeOptions(st, data) {
    const c = st.combat, w = weaponOf(st, data), load = st.ch.morph ? 0 : carriedWeight(st, data);
    let targets = c.dens.filter(d => !d.dead && d.kind !== 'part' && d.kind !== 'horse');
    if (pvpOn(st) && contested(st)) targets = pvpTargets(st, data, targets);          // (only while another player's character is in the fight: otherwise it is the step-3 fight, whatever the switch)
    const wlvl = w ? lvl(data.weapons[w.item.id].weight) : 0;
    const assigned = targets.filter(d => d.assigned);
    const attackers = c.dens.filter(d => !d.dead && (d.assigned || d.partOf && c.dens.find(o => o.uid === d.partOf)?.assigned) && denSide(st, data, d).attack !== 'none' || false);
    return {
        targets,
        assigned,
        attackSpell: c.attackSpell ?? null,
        aims: aimOptions(st, data),                                                 // what each spell cast this round may be aimed at
        fightChits: c.casts?.length ? [] : activeChits(st, 'fight', data),         // a character who cast a spell cannot also swing a weapon or play a Fight chit that round (8.4.5a)
        moveChits: activeChits(st, 'move', data),
        fightOk: ch => lvl(ch.strength) >= wlvl,
        moveOk: ch => lvl(ch.strength) >= (ch.isHorse ? Math.max(load, lvl(st.ch.weight)) : load),
        shield: st.ch.morph ? null : activeArmor(st, data).find(a => isShield(a.def)) ?? null,
        weapon: w,
        morph: morphView(st),                                                       // he is a creature: the chits above are its counter's sides; see also `morphParts`
        morphParts: morphParts(st),                                                 // its head or club: a second attack at his target, either side up (p.parts = { [id]: 'light'|'dark' })
        asterisksPlayed: c.asterisks.move + c.asterisks.fight + (c.asterisks.magic ?? 0),
        effortLimit: effortLimit(st),                                               // 2 asterisks a round, 3 with the Girtle of Energy (8.4.5f.2, 8.5.1c)
        // everything that will sit in the red boxes: assigned denizens and their parts
        boxable: c.dens.filter(d => !d.dead && d.kind !== 'horse' && (d.assigned || (d.partOf && c.dens.find(o => o.uid === d.partOf)?.assigned))),
    };
}

// The Melee step's targets when character against character is on: the creatures, the other players' characters in plain sight (or found), and the hirelings of the other players, and
// his own native hirelings (naming one is treachery, 8.4.2g). A character who charged may name only the one he charged (8.4.2b.4).
function pvpTargets(st, data, creatures) {
    const c = st.combat, b = st.battle, me = st.ch.id;
    const chars = charFoes(st, me, true).map(id => {
        const o = st.chars[id], w = o.items.find(i => i.kind === 'weapon' && i.active);
        return { uid: charUid(id), kind: 'character', id, name: o.name, hidden: !!o.hidden, fame: o.fame, notoriety: o.notoriety, weapon: w?.id ?? null, alerted: !!w?.alerted, armor: o.items.filter(i => i.kind === 'armor' && i.active && !i.destroyed).map(i => i.id), horse: o.items.find(i => i.kind === 'horse' && i.active)?.id ?? null, dead: false };
    });
    if (c.charge) return chars.filter(t => t.id === c.charge.on);
    const hires = b.hires.filter(h => !h.dead && b.members[h.owner]?.state === 'in' && (h.owner !== me ? st.chars[h.owner].owner !== st.ch.owner : h.kind === 'nat')).map(h => {
        const hs = hireStats(data, h.id, h.kind, st);
        return { uid: 'hire:' + h.uid, kind: 'hire', id: h.id, hireKind: h.kind, hire: h.uid, owner: h.owner, own: h.owner === me, treachery: h.owner === me, name: hs.name, dead: false };
    });
    return [...creatures, ...chars, ...hires];
}

export function meleePlay(st, data, p) {
    const c = st.combat;
    if (c.step !== 'melee') throw new Error('not in the melee step');
    const S = meleeSetup(st, data, p);
    if (S.stop === 'dead') { c.attackSpell = null; c.step = 'resolve'; return afterMelee(st, data); }
    if (S.stop === 'ended') { c.attackSpell = null; return; }
    const { X, log } = S;
    meleeEngaged(st);
    meleeReposition(st, data, log, null);

    // --- Battle Bracelets and Elusive Cloak (Treasures 12): after the dice, before the blows ---
    const sh = shiftChances(st, data, X);
    if (p.shift) return meleeResolve(st, data, { ...X, p: applyShift(st, data, X, sh, p.shift) });           // named in advance (computer players, tests); refused if the cards do not allow it
    if ((sh.attack || sh.move) && st.pauseShift) {                                                            // the game screen stops and asks
        c.shiftCtx = X; c.step = 'shift';
        st.pending = { type: 'combat-shift', round: c.round };
        return;
    }
    return meleeResolve(st, data, X);
}

// The first half of the Melee step for one character: his chits are played, his spells aimed and resolved, the target he names is set on him or struck from hiding, and the creatures on
// his sheet are placed in the red boxes. Returns { X, log } to go on (X: what the plays came to), or { stop: 'dead' | 'ended' } when a spell already ended his part of the round.
// A shared fight (battle.js) calls it once for each character, in the order of the draw, after all the plays are in.
export function meleeSetup(st, data, p) {
    const c = st.combat;
    const o = meleeOptions(st, data);
    for (const k of ['attackDir', 'moveDir', 'shieldDir']) if (p[k] != null && !(Number.isInteger(p[k]) && p[k] >= 0 && p[k] <= 2)) throw new Error(`${k} must be a direction from 0 to 2`);
    if (p.target != null && !o.targets.some(d => d.uid === p.target)) throw new Error('that creature is not one you can strike');
    const w = o.weapon;
    c.roundRollFrom = st.rollSeq ?? 0;            // the dice tray in the fight shows this round's rolls only
    c.killed = [];                                  // what he killed this round, for the screen to lead with
    c.roundGain = { fame: 0, notoriety: 0, gold: 0 };   // and what the kills paid
    const ev = c.events = [];
    const log = (t, story) => { ev.push(story ?? t); say(st, t, 'combat', story ?? null); };
    const hm = st.ch.morph ?? null;                        // he is a creature (Absorb Essence, Transform): the counter fights, not his chits and gear
    // --- validate and apply chit plays ---
    let fight = null, move = null;
    if (p.fightChit) {
        fight = o.fightChits.find(x => x.id === p.fightChit);
        if (!fight) throw new Error('that Fight chit is not available');
        if (!o.fightOk(fight)) throw new Error('that Fight chit is too weak for your weapon');
    }
    if (p.moveChit) {
        move = o.moveChits.find(x => x.id === p.moveChit);
        if (!move) throw new Error('that Move chit is not available');
        if (!o.moveOk(move)) throw new Error('that Move chit is too weak to carry your gear');
    }
    if (fight && move && fight.id === move.id) throw new Error('a Move/Fight chit is played as one or the other, not both');
    if (hm) {
        // the red side of a Tremendous counter is up only against the creature it holds (Absorb Essence 2); a head or club is a second attack at his target
        if ((fight?.side === 'red' || move?.side === 'red') && p.target !== o.morph?.pin) throw new Error('your red side is turned up only against the creature you are holding');
        for (const [pid, sd] of Object.entries(p.parts ?? {})) {
            if (!o.morphParts.find(x => x.id === pid)?.sides.some(x => x.side === sd)) throw new Error('that part cannot attack');
            if (!p.target) throw new Error('name the creature the part attacks');
        }
    }
    const ast = o.asterisksPlayed + (fight?.effort ?? 0) + (move?.effort ?? 0);
    if (ast > effortLimit(st)) throw new Error(`at most ${effortLimit(st)} effort asterisks may be played in a round`);
    if (fight) playChit(st, fight);
    if (move) playChit(st, move);
    // Wish 6 (Strength): the next Fight chit or Gloves he plays strikes with a flat Tremendous harm, whatever he swings, and the wish is used up
    const wish = fight && !fight.morph && st.ch.wishStrength ? st.ch.wishStrength : null;
    if (wish) st.ch.wishStrength = null;
    applyAim(st, data, p.spellAim);
    resolveSpells(st, data, log);
    // a spell may end the round at once: it killed him, or it ended the combat (Small Blessing's Peace and Elsewhere)
    if (st.ch.dead) return { stop: 'dead' };
    if (c.ended) return { stop: 'ended' };
    // --- target and unhide ---
    const victim = charOfUid(p.target), hireId = hireOfUid(p.target);          // (pvp: another character, or a hireling, named as the target; validated by meleeOptions above)
    let target = p.target && !victim && !hireId ? c.dens.find(d => d.uid === p.target && !d.dead) : null;
    let hireTarget = null;
    if (hireId) {
        const hire = st.battle.hires.find(h => h.uid === hireId), hs = hireStats(data, hire.id, hire.kind, st);
        if (hire.owner === st.ch.id) {
            // 8.4.2g Treachery: he names his own hired native, and its whole group under his hire rebels, wherever it is; he loses Fame equal to their Notoriety bounties. The rebel is then
            // a native like any other that is fighting him, and it is the one he strikes.
            say(st, `${st.ch.name} names his own ${hs.name} as his target: that is treachery.`, 'combat');
            rebelGroup(st, data, data.natives[hire.id].group, [], 'you did');
            target = c.dens.find(d => d.kind === 'nat' && d.id === hire.id && !d.dead) ?? null;
        } else hireTarget = hire.uid;
    }
    // An attack spell may be aimed at several creatures (Stones Fly, Fiery Blast); the one under his Attention chit is p.target. Roof Collapses names no one.
    const sp0 = c.attackSpell && !c.attackSpell.auto ? c.attackSpell : null;
    let spTargets = [], spChars = [];
    if (sp0) {
        const ids = p.targets?.length ? p.targets : p.target ? [p.target] : [];
        spTargets = [...new Set(ids)].map(uid => c.dens.find(d => d.uid === uid && !d.dead && d.kind !== 'part' && d.kind !== 'horse')).filter(Boolean);
        if (!sp0.many) spTargets = spTargets.slice(0, 1);
        if (!target && spTargets.length) target = spTargets[0];
        if (target && !spTargets.includes(target)) spTargets.unshift(target);
        if (!sp0.many) spTargets = spTargets.slice(0, 1);
        if (pvpOn(st)) {          // pvp: the characters it is aimed at (one only for a spell that has one target, and then not if a creature is named too)
            const named = [...new Set(ids)].filter(u => charOfUid(u) && o.targets.some(d => d.uid === u)).map(charOfUid);
            spChars = sp0.many ? named : (spTargets.length ? [] : named.slice(0, 1));
        }
    }
    if (hm?.pin && target?.uid !== hm.pin) hm.pin = null;           // a Tremendous counter turns its red side down when he changes targets
    for (const t of new Set([target, ...spTargets].filter(Boolean))) namedTarget(st, data, t, log);           // naming a creature a spell made peaceful breaks that spell
    const wasHidden = st.ch.hidden;
    c.toRed = []; c.toRedHire = [];
    if (st.ch.hidden && (target || victim || hireTarget || spChars.length)) { st.ch.hidden = false; log('You strike from hiding and are revealed.', tell.ambush(st)); }
    for (const v of new Set([victim, ...spChars].filter(Boolean))) if (st.chars[v].hidden) { st.chars[v].hidden = false; log(`You find ${st.chars[v].name}, who was hidden: he is revealed (8.4.2b).`); }          // naming a hidden character unhides them both
    for (const t of new Set([target, ...spTargets].filter(Boolean))) if (t.pacified) breakPacify(st, data, t, log);          // he named a pacified monster: the pacifying spell is broken
    for (const t of new Set([target, ...spTargets].filter(Boolean))) {
        if (t.assigned || t.elsewhere || barredFromHero(st, data, t)) continue;          // (attacking a Demon or Imp does not set it on a Pilgrim; a creature on another character's sheet stays there)
        // attacking an unassigned denizen makes it fight back; attacking a native brings its whole group in
        if (t.kind === 'nat') {
            // the group begins to battle him at once, but nobody was assigned to answer this round: no blow comes back until the next
            startBattling(st, data, data.natives[t.id].group);
            // (with the optional Watchful Natives rule, 10.B.4, the group answers in the same round)
            if (!st.options?.watchfulNatives) for (const d of c.dens) if (d.kind === 'nat' && data.natives[d.id].group === data.natives[t.id].group || d.partOf === t.uid) { d.noRetaliation = true; d.noWhy = 'joins'; }
        }
        t.assigned = true;
        if (wasHidden) { t.noRetaliation = true; t.noWhy = 'hidden'; }          // a hidden character gets a free first blow
    }
    // A character who was hidden strikes first; only the one he struck is on his sheet this round.
    const boxableNow = c.dens.filter(d => !d.dead && d.kind !== 'horse' && (d.assigned || (d.partOf && c.dens.find(x => x.uid === d.partOf)?.assigned)));

    // --- place denizens in the three red boxes (he chooses, then the dice move them) ---
    const boxable = boxableNow;
    placeInBoxes(st, data, boxable, p.boxes ?? {});
    // native horses sit in a box other than their rider's
    for (const h of c.dens.filter(d => d.kind === 'horse' && !d.dead)) {
        const owner = c.dens.find(d => d.uid === h.partOf);
        if (!owner || owner.dead || !owner.assigned) { h.box = null; continue; }
        h.box = (owner.box + 1 + int(st, 2)) % 3;
    }
    const X = { p, fight, move, wish, target: target?.uid ?? null, spTargets: spTargets.map(d => d.uid) };
    if (victim) X.charTarget = victim;
    if (hireTarget) X.hireTarget = hireTarget;
    if (spChars.length) X.spChars = spChars;
    return { X, log };
}

// Creatures fighting hirelings sit in a random box.
export function meleeEngaged(st) {
    for (const d of st.combat.dens) if (d.engagedBy && !d.dead) d.box = (die(st) - 1) % 3;
}

// Reposition and change tactics (8.4.6): one die moves the creatures between the boxes, two dice per box may turn them over. `inGroup` (a shared fight: the creatures of one sheet) limits
// it to part of the clearing; with none it is the whole clearing, as it is for one character.
export function meleeReposition(st, data, log, inGroup = null) {
    const c = st.combat, mine = d => !inGroup || inGroup(d);
    const boxBefore = new Map(c.dens.map(d => [d.uid, d.box]));
    const rr = die(st), perm = REPOSITION[rr];
    noteRoll(st, 'Repositioning roll', [rr], rr, rr === 4 ? 'no change' : 'the creatures shuffle between boxes');
    const inBox = b => c.dens.filter(d => !d.dead && d.box === b && mine(d));
    const old = [inBox(0), inBox(1), inBox(2)];
    for (let nb = 0; nb < 3; nb++) for (const d of old[perm[nb]]) d.box = nb;
    // A shuffle is told creature by creature just below, so only the journal gets the roll itself; "nothing shifts" is worth saying.
    if (rr === 4) log(`Repositioning roll: ${rr} (no change).`, tell.hold(st));
    else say(st, `Repositioning roll: ${rr}.`, 'combat');
    {
        const moved = c.dens.filter(d => mine(d) && !d.dead && d.box != null && boxBefore.get(d.uid) != null && boxBefore.get(d.uid) !== d.box && d.kind !== 'horse');
        moved.forEach((d, i) => log(`  ${denSide(st, data, d).name} ${MANEUVERS[boxBefore.get(d.uid)]} → ${MANEUVERS[d.box]}.`, tell.moved(st, denSide(st, data, d).name, MANEUVERS[boxBefore.get(d.uid)], MANEUVERS[d.box], i)));
    }
    for (let b = 0; b < 3; b++) {
        const here = c.dens.filter(d => !d.dead && d.box === b && mine(d) && canFlip(st, data, d));
        if (!here.length) continue;
        const t = roll2(st);
        noteRoll(st, `Tactics roll (${MANEUVERS[b]} box)`, t.dice, t.value, t.dice.includes(6) ? 'a 6: they switch sides' : 'no change');
        if (t.dice.includes(6)) {
            for (const d of here) d.side = d.side === 'light' ? 'dark' : 'light';
            log(`Tactics change in the ${MANEUVERS[b]} box (rolled ${t.dice.join('+')}): ${here.map(d => denSide(st, data, d).name).join(', ')} switch sides.`, tell.flipped(st, MANEUVERS[b], here.map(d => denSide(st, data, d).name).join(' and ')));
        }
    }
}

// The second half of the Melee step: hit determination and the blows (8.4.8, 8.4.9), from the plans in `X` (the plays, after any shift).
function meleeResolve(st, data, X) {
    const part = meleeCollect(st, data, X);
    deliverBlows(st, data, [part]);
    meleeAfter(st, data, part);
    return afterMelee(st, data);
}

// Hit determination for one character: who strikes whom, from his plays and the creatures on his sheet. Returns a "part" of the round: the blows (`hits`, each with its time and length) and
// what is needed to carry each one out later (`thunk`). The blows of every character in the fight are put in one order (deliverBlows).
export function meleeCollect(st, data, X, peers = null) {
    const c = st.combat, p = X.p, fight = X.fight, move = X.move, wish = X.wish;
    const w = weaponOf(st, data), notes = [];
    const hm = st.ch.morph ?? null;
    const weaponName = hm ? hm.creature.name : w ? nameOfItem(st, data, w.item) : 'bare hands';
    const ev = c.events;
    const log = (t, story) => { ev.push(story ?? t); say(st, t, 'combat', story ?? null); };
    const sp0 = c.attackSpell && !c.attackSpell.auto ? c.attackSpell : null;
    const target = X.target ? c.dens.find(d => d.uid === X.target) : null;
    const spTargets = (X.spTargets ?? []).map(u => c.dens.find(d => d.uid === u)).filter(Boolean), spChars = X.spChars ?? [];
    c.shiftCtx = null;
    // --- hit determination ---
    const myDir = p.attackDir, mnvDir = p.moveDir;
    // Poison on the weapon he swings adds sharpness stars to every blow of it
    const poison = w && st.fx?.length ? fxTags(st, { kind: 'item', id: w.item.uid }, 'stars').reduce((n, t) => n + t.value, 0) : 0;
    // Oil of Poison (Treasures 11): one more sharpness star on every blow of the weapon he has in use (it stacks with the Poison spell, RealmSpeak BUG 548); a bare Fight chit is the dagger and takes it too
    const oil = !hm && hasTreasure(st, 'oil-of-poison') ? 1 : 0;
    const morphSide = fight?.morph ? hm.creature[fight.side] : null;
    const mySide = wish ? { ...weaponSide(w), harm: wish, stars: 0, missile: false } : morphSide ? { harm: morphSide.harm ?? 'N', stars: morphSide.stars, time: morphSide.atk, length: morphSide.length, missile: false } : weaponSide(w, poison + oil);
    if (wish) log(`Your Wish of Strength strikes with ${WEIGHT_WORDS[wish]} harm.`);
    const attackTime = fight ? (mySide.time ?? fight.time) : null;
    const hits = [];            // { who:'me'|denUid, order keys }
    // An attack spell attacks from the attack circle like a weapon, once per hit it makes, each with its own Missile Table roll.
    if (c.attackSpell?.auto === 'all') roofHits(st, data, { hits, log, move, mnvDir });
    else if (sp0 && (spTargets.length || spChars.length) && myDir != null) {
        const side = { harm: sp0.harm, stars: sp0.stars, time: (c.casts ?? []).find(x => x.spell === sp0.spell)?.time ?? 0, length: sp0.length, missile: true };
        const spName = data.spells[sp0.spell]?.name ?? sp0.spell;
        const spAll = spChars.length ? [...spTargets, ...spChars.map(id => ({ uid: charUid(id), char: id }))] : spTargets;
        for (const { den: t, n } of spellHitPlan(sp0, spAll, p.target ? spAll.find(d => d.uid === p.target) ?? spAll[0] : spAll[0])) {
            if (t.char) {          // pvp: the spell falls on a character as a weapon would: it hits if it goes the way his maneuver faces, undercuts it, or he played none
                const rival = peers?.[t.char], vname = st.chars[t.char].name;
                if (!rival || rival.stop) { log(`${spName}: ${vname} is no longer there to be struck.`); continue; }
                const vm = rival.X.move, vdir = rival.X.p.moveDir, noMnv = !vm || vdir == null, inLane = !noMnv && vdir === myDir, fast = !noMnv && side.time != null && vm.time != null && side.time < vm.time;
                const where = noMnv ? 'no maneuver' : `${MANEUVERS[vdir]}${vm.isHorse ? ' (his horse)' : ''}`;
                if (noMnv || inLane || fast) {
                    for (let k = 0; k < n; k++) hits.push({ who: 'me', char: t.char, time: side.time, length: side.length, side, spell: spName });
                    log(`${spName}: ${DIRS[myDir]} at ${vname} (${where}): ${n > 1 ? `${n} hits` : 'hit'}${noMnv || inLane ? '' : ' by undercutting'}.`);
                } else log(`${spName}: ${DIRS[myDir]} at ${vname} (${where}): miss.`);
                continue;
            }
            const horse = c.dens.find(d => d.kind === 'horse' && d.partOf === t.uid && !d.dead);
            const def = horse ?? t, defSide = denSide(st, data, def);
            const inBox = def.box != null && def.box === myDir, fast = side.time != null && defSide.move != null && side.time < defSide.move;
            const nm = defSide.name;
            if (inBox || fast) {
                for (let k = 0; k < n; k++) hits.push({ who: 'me', time: side.time, length: side.length, on: def.uid, owner: t.uid, side, spell: spName });
                log(`${spName}: ${DIRS[myDir]} at ${nm} (${MANEUVERS[def.box] ?? '?'} box): ${n > 1 ? `${n} hits` : 'hit'}${inBox ? '' : ' by undercutting'}.`);
            } else log(`${spName}: ${DIRS[myDir]} at ${nm} (${MANEUVERS[def.box] ?? '?'} box): miss.`);
        }
    } else if (c.attackSpell) {
        log(`${data.spells[c.attackSpell.spell]?.name ?? 'Your spell'} is cast at no one and fizzles.`);
    }
    if (fight && target && myDir != null) {
        // the defender is its horse while the horse lives
        const horse = c.dens.find(d => d.kind === 'horse' && d.partOf === target.uid && !d.dead);
        const def = horse ?? target, defSide = denSide(st, data, def);
        const inBox = def.box != null && def.box === myDir;
        // Ointment of Bite (Treasures 11): the weapon hits whenever its attack time undercuts OR ties the target's maneuver time
        const bite = !hm && hasTreasure(st, 'ointment-of-bite');
        const fast = attackTime != null && defSide.move != null && (bite ? attackTime <= defSide.move : attackTime < defSide.move);
        const hitsIt = inBox || fast;
        const nm = defSide.name, where = def.box != null ? MANEUVERS[def.box] : '?';
        if (hitsIt) {
            hits.push({ who: 'me', time: attackTime, length: mySide.length, on: def.uid, owner: target.uid, pit: morphSide?.attack === 'spell' });
            const tie = !inBox && attackTime === defSide.move;
            log(inBox ? `You: ${DIRS[myDir]} at ${nm} (${where} box): hit.` : tie ? `You: ${DIRS[myDir]} at ${nm} (${where} box): hit by your Ointment of Bite (your time ${attackTime} ties its ${defSide.move}).` : `You: ${DIRS[myDir]} at ${nm} (${where} box): hit by undercutting (your time ${attackTime} beats its ${defSide.move}).`,
                inBox ? tell.myHitBox(st, weaponName, DIRS[myDir].toLowerCase(), nm) : tie ? `The Ointment of Bite makes your ${weaponName} bite: your time ${attackTime} ties the ${nm}'s ${defSide.move}, and the blow lands.` : tell.myHitFast(st, weaponName, DIRS[myDir].toLowerCase(), nm, where, attackTime, defSide.move));
        } else log(`You: ${DIRS[myDir]} at ${nm} (${where} box): miss (${DIRS[myDir]} hits ${MANEUVERS[myDir]}${defSide.move != null ? `; its time ${defSide.move} is not slower than your ${attackTime}` : ''}).`,
            tell.myMiss(st, weaponName, DIRS[myDir].toLowerCase(), nm, where, attackTime, defSide.move));
    }
    // pvp: a blow at another character is judged against what HE played (docs/design/multiplayer-step5.md): it hits if it undercuts his maneuver (8.4.8a), goes the way his maneuver
    // faces (the same lane), or he played no maneuver at all (8.4.8b.2, everything on his sheet hits him)
    if (X.charTarget) {
        const vid = X.charTarget, rival = peers?.[vid], vname = st.chars[vid].name;
        if (!fight || myDir == null) { /* (no attack: deliverBlows says so) */ }
        else if (!rival || rival.stop) log(`${vname} is no longer there to be struck.`);
        else if (hm && morphSide?.attack === 'spell') log(`Your spell cannot be aimed at ${vname} yet: it fizzles.`);
        else {
            const vm = rival.X.move, vdir = rival.X.p.moveDir, vtime = vm ? vm.time : null, bite = !hm && hasTreasure(st, 'ointment-of-bite');
            const noMnv = !vm || vdir == null, inLane = !noMnv && vdir === myDir;
            const fast = !noMnv && attackTime != null && vtime != null && (bite ? attackTime <= vtime : attackTime < vtime);
            const where = noMnv ? 'no maneuver' : `${MANEUVERS[vdir]}${vm.isHorse ? ' (his horse)' : ''}`;
            if (noMnv || inLane || fast) {
                hits.push({ who: 'me', char: vid, time: attackTime, length: mySide.length });
                log(noMnv ? `You: ${DIRS[myDir]} at ${vname} (${where}): hit; everything on a sheet with no maneuver is hit.` : inLane ? `You: ${DIRS[myDir]} at ${vname} (${where}): hit.` : `You: ${DIRS[myDir]} at ${vname} (${where}): hit by undercutting (your time ${attackTime} beats his ${vtime}).`);
            } else log(`You: ${DIRS[myDir]} at ${vname} (${where}): miss (${DIRS[myDir]} hits ${MANEUVERS[myDir]}${vtime != null ? `; his time ${vtime} is not slower than your ${attackTime}` : ''}).`);
        }
    }
    // pvp: a blow at someone else's hireling: it has no maneuver of its own, so a die gives the lane it stands in; it also hits if it undercuts the hireling's move time
    if (X.hireTarget) {
        const hire = st.battle.hires.find(x => x.uid === X.hireTarget);
        if (hire && !hire.dead && fight && myDir != null) {
            const hs = hireStats(data, hire.id, hire.kind, st), a = (die(st) - 1) % 3;
            const inLane = a === myDir, fast = attackTime != null && hs.move != null && attackTime < hs.move;
            if (inLane || fast) { hits.push({ who: 'me', hireOn: hire.uid, time: attackTime, length: mySide.length }); log(`You: ${DIRS[myDir]} at ${hs.name} (${MANEUVERS[a]}): hit${inLane ? '' : ' by undercutting'}.`); }
            else log(`You: ${DIRS[myDir]} at ${hs.name} (${MANEUVERS[a]}): miss.`);
        }
    }
    // an absorbed monster's head or club: a second attack at the same target, either side up
    if (hm && target && myDir != null) for (const [pid, sd] of Object.entries(p.parts ?? {})) {
        const part = hm.creature.parts.find(x => x.id === pid), ps = part[sd];
        const horse = c.dens.find(d => d.kind === 'horse' && d.partOf === target.uid && !d.dead);
        const def = horse ?? target, defSide = denSide(st, data, def), inBox = def.box != null && def.box === myDir, fast = ps.atk != null && defSide.move != null && ps.atk < defSide.move;
        const nm = defSide.name, what = `${hm.creature.name}'s ${part.name}`;
        if (inBox || fast) {
            hits.push({ who: 'me', time: ps.atk, length: ps.length, on: def.uid, owner: target.uid, side: { harm: ps.harm, stars: ps.stars, time: ps.atk, length: ps.length, missile: false }, morphName: what });
            log(`Your ${what}: ${DIRS[myDir]} at ${nm} (${MANEUVERS[def.box] ?? '?'} box): hit${inBox ? '' : ' by undercutting'}.`);
        } else log(`Your ${what}: ${DIRS[myDir]} at ${nm} (${MANEUVERS[def.box] ?? '?'} box): miss.`);
    }
    const mnvTime = move ? move.time : null;
    for (const d of c.dens.filter(x => !x.dead && x.kind !== 'horse' && x.box != null)) {
        const s = denSide(st, data, d);
        if (s.attack === 'none' || s.atk == null) continue;
        const owner = d.partOf ? c.dens.find(x => x.uid === d.partOf) : d;
        if (!owner.assigned) continue;
        if (owner.noRetaliation) { log(`${s.name} cannot strike back this round (${owner.noWhy === 'hidden' ? 'you struck from hiding' : 'its group joins next round'}).`, tell.notBack(st, s.name, owner.noWhy === 'hidden')); continue; }
        const dir = d.box;
        const meets = mnvDir != null && mnvDir === dir && move;
        const under = mnvTime != null ? s.atk < mnvTime : false;
        const noMove = !move;
        const at = `${s.name}'s ${DIRS[dir].toLowerCase()}`;
        if (noMove) { hits.push({ who: d.uid, time: s.atk, length: s.length }); log(`${at} is aimed true (you played no maneuver).`, tell.connectNoMove(st, s.name, DIRS[dir].toLowerCase())); }
        else if (meets) { hits.push({ who: d.uid, time: s.atk, length: s.length }); log(`${at} is aimed at your ${MANEUVERS[mnvDir]}: it connects.`, tell.connectMeets(st, s.name, DIRS[dir].toLowerCase(), MANEUVERS[mnvDir])); }
        else if (under) { hits.push({ who: d.uid, time: s.atk, length: s.length }); log(`${at} gets under your maneuver (its time ${s.atk} beats your ${mnvTime}).`, tell.connectUnder(st, s.name, DIRS[dir].toLowerCase(), s.atk, mnvTime)); }
        else log(`${at} misses you (your ${MANEUVERS[mnvDir]} avoids it).`, tell.avoid(st, s.name, DIRS[dir].toLowerCase(), MANEUVERS[dir], MANEUVERS[mnvDir]));
    }
    // hirelings against the creatures they were sent at
    for (const hire of (c.hires ?? []).filter(x => !x.dead)) {
        if (hire.targetChar) {          // pvp: sent at a character (8.3.6a); it strikes in a lane a die gives it, and hits if that is his maneuver's lane, or undercuts it, or he played none
            const rival = peers?.[hire.targetChar], hs = hireStats(data, hire.id, hire.kind, st);
            if (!rival || rival.stop || st.chars[hire.targetChar].dead) { log(`${hs.name} has no one to strike: ${st.chars[hire.targetChar]?.name ?? 'its target'} is gone.`); continue; }
            const a = (die(st) - 1) % 3, vm = rival.X.move, vname = st.chars[hire.targetChar].name;
            const hit = hs.atk != null && hs.harm != null && (!vm || rival.X.p.moveDir == null || a === rival.X.p.moveDir || (vm.time != null && hs.atk < vm.time));
            if (hit) { hits.push({ who: 'hire', hire: hire.uid, char: hire.targetChar, dir: a, time: hs.atk, length: hs.length }); log(`${hs.name} strikes ${DIRS[a].toLowerCase()} at ${vname}: hit.`); }
            else log(`${hs.name} strikes ${DIRS[a].toLowerCase()} at ${vname}: miss.`);
            continue;
        }
        const d = c.dens.find(x => x.uid === hire.target && !x.dead && x.engagedBy === hire.uid);
        if (!d) continue;
        const hs = hireStats(data, hire.id, hire.kind, st), ds = denSide(st, data, d), a = (die(st) - 1) % 3;
        if (hs.atk != null && hs.harm != null && (a === d.box || (ds.move != null && hs.atk < ds.move))) hits.push({ who: 'hire', hire: hire.uid, den: d.uid, time: hs.atk, length: hs.length });
        if (ds.attack !== 'none' && ds.atk != null && (a === d.box || (hs.move != null && ds.atk < hs.move))) hits.push({ who: d.uid, onHire: hire.uid, time: ds.atk, length: ds.length });
    }
    const part = { by: st.ch.id, c, p, hits, log, delivered: false, target, spTargets, fight, move, w, hm, weaponName, mySide, myDir, mnvDir, notes, charVictim: X.charTarget ?? null, hireVictim: X.hireTarget ?? null, peers,
        dead: () => !!st.chars[part.by].dead };
    // How each kind of blow is carried out once its turn comes: the creatures alive when its tie group began are `alive`, `g` is the group's number. Returns the function that does
    // the harm (a tie group is decided first and done afterwards, so that blows at the same instant do not cancel each other), or null when the blow cannot land.
    part.thunk = (h, alive, g) => {
        if (h.char) {                                   // pvp: a blow at (or a hireling's blow at) another character
            const key = charUid(h.char), vname = st.chars[h.char].name;
            if (h.who === 'me') {
                if (alive.has(key)) return () => { part.delivered = true; charBlow(st, data, h, part, g, log); };
                log(`Your blow finds ${vname} already dead.`, `Your ${weaponName} finds ${vname} already dead: the blow is wasted.`);
                return null;
            }
            const hire = c.hires.find(x => x.uid === h.hire);
            return alive.has(key) && hire && !hire.dead ? () => hireStrikesChar(st, data, h, part, g, log) : null;
        }
        if (h.hireOn) {                                 // pvp: a blow at someone else's hireling
            const hire = st.battle.hires.find(x => x.uid === h.hireOn);
            if (hire && !hire.dead) return () => { part.delivered = true; myHitHire(st, data, h, hire, { w, mySide, fight: hm ? null : fight, myDir, log, morphName: hm?.creature.name, potions: !hm }); };
            log('Your blow finds its target already dead.', `Your ${weaponName} finds its target already dead: the blow is wasted.`);
            return null;
        }
        if (h.who === 'me') {
            if (alive.has(h.on) || (c.dens.find(d => d.uid === h.on)?.kind === 'horse' && alive.has(h.owner))) return () => {
                part.delivered = true;
                if (h.pit) morphPit(st, data, h, log);                                                  // a Demon or Imp counter casts its spell at its target
                else myHit(st, data, h, h.side ? { w: null, mySide: h.side, fight: null, myDir, notes, log, spell: h.spell, morphName: h.morphName } : { w, mySide, fight: hm ? null : fight, myDir, notes, log, morphName: hm?.creature.name, potions: !hm });
            };
            log('Your blow finds its target already dead.', `Your ${weaponName} finds its target already dead: the blow is wasted.`);
            return null;
        }
        if (h.who === 'hire') return alive.has(h.den) && !c.hires.find(x => x.uid === h.hire).dead ? () => hireStrikes(st, data, h, log) : null;
        if (h.who === 'roofhire') return () => roofStrikesHire(st, data, h, log);
        if (h.who === 'roofhero') return () => strikeHero(st, data, { name: 'Roof Collapses', harm: h.side.harm, stars: h.side.stars, dir: h.side.dir, missile: false, archer: false, den: null }, { mnvDir, move, shieldDir: p.shieldDir, log, g, horse: move?.isHorse ? st.ch.items.find(i => i.uid === move.horseUid) : null });
        if (h.onHire) {
            const den = c.dens.find(d => d.uid === h.who);
            return alive.has(den.uid) && !c.hires.find(x => x.uid === h.onHire).dead ? () => denStrikesHire(st, data, den, h.onHire, log) : null;
        }
        const den = c.dens.find(d => d.uid === h.who);
        const ownerAlive = !den.partOf || alive.has(den.partOf);
        if (alive.has(den.uid) && ownerAlive) return () => denHit(st, data, den, { mnvDir, move, shieldDir: p.shieldDir, log, g, horse: move?.isHorse ? st.ch.items.find(i => i.uid === move.horseUid) : null });
        log(`${denSide(st, data, den).name} is dead before its blow can land.`, `The ${denSide(st, data, den).name} was struck down before its ${DIRS[den.box ?? 0].toLowerCase()} could land: it never gets to strike.`);
        return null;
    };
    // The blow in words: whose it is and when it falls (`you`: "your", or "Black Knight's" when other characters share the fight).
    part.blowName = (h, you = 'your') => (h.who === 'roofhero' ? `the falling roof (on ${you === 'your' ? 'you' : you.replace(/'s$/, '')})` : h.who === 'roofhire' ? `the falling roof (on ${you} hireling)` : h.who === 'me' ? (h.spell ? `${you} ${h.spell}` : `${you} ${weaponName}`) : h.who === 'hire' ? `${you} hireling's blow` : `the ${denSide(st, data, c.dens.find(d => d.uid === h.who)).name}'s ${DIRS[c.dens.find(d => d.uid === h.who).box ?? 0].toLowerCase()}`);
    return part;
}

// The blows of every part of the round, in the order they fall, and carried out. Round one: the longest weapon first, then the fastest; later rounds: the fastest, then the longest. Blows of
// the same instant are decided against the situation when the instant began and then all land (8.4.9). `run(part, fn)` runs fn as the character the part belongs to (a shared fight: battle.js).
export function deliverBlows(st, data, parts, run = (pt, f) => f(), shared = false) {
    const solo = parts.length === 1 && !shared, round = parts[0].c.round;
    const key = h => round === 1 ? [-h.length, h.time ?? 99] : [h.time ?? 99, -h.length];
    const sameKey = (a, b) => { const ka = key(a), kb = key(b); return ka[0] === kb[0] && ka[1] === kb[1]; };
    const hits = [];
    for (const pt of parts) for (const h of pt.hits) { h.pt = pt; hits.push(h); }
    hits.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1]; });
    // When nothing happens, say why: a Fight chit with no one named, a hidden hero nobody can reach, a round with no blows at all.
    for (const pt of parts) {
        if (pt.hits.length) continue;
        const { c, fight } = pt, target = pt.target ?? pt.charVictim ?? pt.hireVictim;
        const chit = c => `${c.type === 'move' ? 'Move' : 'Fight'} ${c.strength}${c.time}${'*'.repeat(c.effort ?? 0)}`;
        const bits = [];
        run(pt, () => {
            if (fight && !target) bits.push(`You played ${chit(fight)} but named no one to strike, so the effort bought nothing.`);
            else if (!fight && target) bits.push('You named a target but played no Fight chit, so there was no attack.');
            else if (!target) bits.push('You attacked no one.');
            if (st.ch.hidden) bits.push('You are still hidden, so no creature can be set on you: nothing happens this round.');
            else if (c.dens.some(d => !d.dead && d.kind !== 'horse' && d.box != null && denSide(st, data, d).attack !== 'none' && (d.partOf ? c.dens.find(x => x.uid === d.partOf)?.assigned : d.assigned))) bits.push('Every blow, theirs and yours, missed: nothing lands this round.');
            else bits.push('No creature could strike you either, so no blow lands this round.');
            const text = bits.join(' ');
            pt.log(text, text);
        });
    }
    // The order the blows will fall in, and why: it is the thing a player most wants explained.
    const you = pt => (solo ? 'your' : `${st.chars[pt.by].name}'s`);
    const blowText = h => `${h.pt.blowName(h, you(h.pt))} (time ${h.time ?? '?'}${h.length ? `, length ${h.length}` : ''})`;
    const narrate = (text, story) => { if (solo) parts[0].log(text, story); else { say(st, text, 'combat', story ?? null, { who: null }); for (const pt of parts) pt.c.events.push(story ?? text); } };
    if (hits.length > 1) {
        const why = round === 1 ? 'in the first round the longest weapon strikes first, then the fastest' : 'after the first round the fastest strikes first, then the longest weapon';
        const whyShort = round === 1 ? 'longest weapon first, then fastest' : 'fastest first, then longest weapon';
        narrate(`Order of blows (${why}): ${hits.map((h, k) => `${k + 1}. ${blowText(h)}`).join('; ')}.`,
            `Blows in order (${whyShort}): ${hits.map(blowText).join(', then ')}.`);
    } else if (hits.length === 1) {
        narrate(`Only one blow can land this round: ${blowText(hits[0])}.`, `Only one blow lands: ${blowText(hits[0])}.`);
    }
    for (const pt of parts) pt.c.newWounds = 0;
    const c0 = parts[0].c;
    let i = 0;
    while (i < hits.length) {
        let j = i; while (j + 1 < hits.length && sameKey(hits[i], hits[j + 1])) j++;
        const group = hits.slice(i, j + 1).filter(h => !h.pt.dead());          // (whoever has fallen strikes no more)
        i = j + 1;
        if (!group.length) continue;
        for (const pt of parts) pt.c.groupNo = (pt.c.groupNo ?? 0) + 1;
        // all hits in a tie are decided against the situation at the start of the tie
        const alive = new Set(c0.dens.filter(d => !d.dead).map(d => d.uid));
        for (const pt of parts) if (!pt.dead()) alive.add(charUid(pt.by));          // (pvp: the characters who still stand)
        const dmg = [];
        const names = group.map(h => h.pt.blowName(h, you(h.pt)));
        if (group.length > 1) narrate(`These blows land at the same instant: ${names.join(' and ')}.`, `${names.join(' and ')} land at the same instant: neither can prevent the other.`.replace(/^./, ch => ch.toUpperCase()));
        for (const h of group) run(h.pt, () => { const f = h.pt.thunk(h, alive, h.pt.c.groupNo); if (f) dmg.push(() => run(h.pt, f)); });
        killQ.length = 0;
        dmg.forEach(f => f());
        if (killQ.length) settleKills(st, data, killQ.splice(0), parts, run);          // (pvp: who killed a character gets his belongings, gold and Notoriety, once the instant is over)
    }
}

// What is left to do for one character once every blow has fallen: Tremendous monsters that hurt him turn red, his weapon is alerted or not, the spell not used is lost.
export function meleeAfter(st, data, part) {
    const { c, p, fight, w, hm, target, spTargets, weaponName, myDir } = part;
    const aimed = target ?? part.charVictim ?? part.hireVictim;          // (what he aimed at: a creature, or in a pvp fight another character or a hireling)
    const log = part.log;
    // Tremendous monsters that hurt him turn red only now, after everything this round has landed.
    if (!st.ch.dead) for (const uid of c.toRed) {
        const d = c.dens.find(x => x.uid === uid);
        if (d && !d.dead && !d.pickedUp) { d.side = 'red'; d.pickedUp = true; log(`${denSide(st, data, d).name} seizes you!`); c.eventful = true; }
    }
    // ... and so do those that hurt a hireling without killing it: red side up, and they stay on that hireling (8.4.7d.3, 8.6.2)
    for (const r of c.toRedHire ?? []) {
        const d = c.dens.find(x => x.uid === r.den), hire = c.hires?.find(x => x.uid === r.hire);
        if (d && !d.dead && !d.pickedUp && hire && !hire.dead) {
            d.side = 'red'; d.pickedUp = true; d.engagedBy = hire.uid;
            log(`${denSide(st, data, d).name} seizes ${hireStats(data, hire.id, hire.kind, st).name}!`);
            c.eventful = true;
        }
    }
    c.toRedHire = [];
    const delivered = part.delivered;
    // a Tremendous counter turns red side up when it has hit the creature it is fighting, and red side down again when that creature is dead
    if (hm && hm.creature.red && !st.ch.dead) {
        if (target?.dead) hm.pin = null;
        else if (delivered && target && (fight || Object.keys(p.parts ?? {}).length)) hm.pin = target.uid;
    }
    // weapon state: a weapon that hit goes unalerted; one that struck and missed turns alerted
    const dust = !!w && hasTreasure(st, 'gripping-dust');          // Gripping Dust keeps the weapon alerted even when it hits (Treasures 11)
    if (w && fight && !aimed && !spTargets.length) w.item.alerted = p.weaponSide === 'unalerted' && !dust ? false : true;      // 8.4.5 h.2: a Fight chit played at no one sets the weapon either side up (alerted unless he asks for the other)
    if (w && fight && aimed && myDir != null) {
        const wasAlerted = !!w.item.alerted;
        w.item.alerted = !delivered || dust;      // only a blow that was delivered unalerts the weapon; a miss or a cancelled blow leaves it alerted
        // say so: it changes what the weapon does next round (an alerted weapon takes its attack time from the Fight chit)
        const aTime = w.def.alerted?.attackTime;                       // some weapons print a time on the alerted side (the Morning Star's 3); others use the Fight chit's
        const timeWhat = aTime != null ? `its attack time is ${aTime}, as printed on its alerted side` : 'its attack time comes from the Fight chit you play';
        if (!delivered) log(wasAlerted ? `Your ${weaponName} found no mark, so it stays alerted.` : `Your ${weaponName} found no mark, so it is now alerted: next round ${timeWhat}.`,
            wasAlerted ? `Your ${weaponName} found no mark and stays alerted.` : `Your ${weaponName} found no mark, and the missed swing leaves it alerted: next round ${timeWhat}.`);
        else if (wasAlerted && !dust) log(`Your ${weaponName} struck home, so it goes back to unalerted.`, `Your ${weaponName} struck home and goes back to unalerted.`);
    }
    c.attackSpell = null;                                 // an attack spell not used this round is lost
    c.step = 'resolve';
}

// The attack time of the blow his plays come to (a Fight chit with a weapon: the weapon's printed time, else the chit's). pvp needs it before the blows are worked out, for the
// Elusive Cloak of the character he strikes.
export function attackTimeOf(st, data, X) {
    if (!X.fight) return null;
    const hm = st.ch.morph ?? null, w = weaponOf(st, data);
    return (X.fight.morph ? hm.creature[X.fight.side].atk : weaponSide(w).time) ?? X.fight.time;
}

// ---- Battle Bracelets and Elusive Cloak (Treasures 12) ----
// After the plays are revealed and the dice have moved the denizens, and before the blows are resolved (the digest's step 7, evidence A7):
//  Battle Bracelets: if he is attacking and EVERY target's maneuver time is 5 or more he may move his attack to any attack circle; against a target of 4 or less he cannot.
//  Elusive Cloak: if EVERY attack aimed at him has an attack time of 5 or more he may move his maneuver to any maneuver square; one of 4 or less forbids it.
// Only the circle or square changes; the chits stay as played. (RealmSpeak: REPLACE_FIGHT / REPLACE_MOVE with the speed to beat 4, "fasterThanOrEqual".)
function attackersOnHim(st, data, extra = null) {
    const c = st.combat, out = [...(extra ?? [])];          // (pvp: `extra` are the characters' and hirelings' blows aimed at him)
    for (const d of c.dens.filter(x => !x.dead && x.kind !== 'horse' && x.box != null)) {
        const s = denSide(st, data, d);
        if (s.attack === 'none' || s.atk == null) continue;
        const owner = d.partOf ? c.dens.find(x => x.uid === d.partOf) : d;
        if (!owner?.assigned || owner.noRetaliation) continue;
        out.push({ uid: d.uid, name: s.name, atk: s.atk, box: d.box });
    }
    return out;
}
function shiftChances(st, data, X, ext = null) {
    const c = st.combat, p = X.p, out = { attack: false, move: false, foes: [], attackers: [] };
    if (st.ch.morph) return out;
    if (hasTreasure(st, 'battle-bracelets') && p.attackDir != null) {
        const sp0 = c.attackSpell && !c.attackSpell.auto ? c.attackSpell : null;
        const targets = [];
        if (X.fight && X.target) targets.push(X.target);
        if (sp0) targets.push(...(X.spTargets ?? []));
        const defs = [...new Set(targets)].map(u => c.dens.find(d => d.uid === u)).filter(Boolean).map(t => c.dens.find(h => h.kind === 'horse' && h.partOf === t.uid && !h.dead) ?? t);
        out.foes = defs.map(d => ({ uid: d.uid, name: denSide(st, data, d).name, move: denSide(st, data, d).move, box: d.box }));
        if (X.charTarget && X.fight && ext?.charFoe) out.foes.push({ uid: charUid(X.charTarget), name: ext.charFoe.name, move: ext.charFoe.move, box: null });          // (pvp: the maneuver time of the character he strikes; none played = cannot shift)
        out.attack = out.foes.length > 0 && out.foes.every(f => f.move != null && f.move >= 5);
    }
    if (hasTreasure(st, 'elusive-cloak') && X.move && p.moveDir != null) {
        out.attackers = attackersOnHim(st, data, ext?.attackers);
        out.move = out.attackers.length > 0 && out.attackers.every(a => a.atk >= 5);
    }
    return out;
}
// The plays with the shift applied (`want` = { attackDir?, moveDir? }); a shift the card does not allow is refused.
function applyShift(st, data, X, sh, want) {
    const p = { ...X.p }, c = st.combat;
    const ok = d => d === 0 || d === 1 || d === 2;
    if (want.attackDir != null && want.attackDir !== p.attackDir) {
        if (!sh.attack) throw new Error('your Battle Bracelets cannot move your attack now');
        if (!ok(want.attackDir)) throw new Error('that is not an attack circle');
        say(st, `Your Battle Bracelets move your attack from ${DIRS[p.attackDir]} to ${DIRS[want.attackDir]}.`, 'combat');
        c.events.push(`Your Battle Bracelets move your attack to the ${DIRS[want.attackDir]} circle.`);
        p.attackDir = want.attackDir;
    }
    if (want.moveDir != null && want.moveDir !== p.moveDir) {
        if (!sh.move) throw new Error('your Elusive Cloak cannot move your maneuver now');
        if (!ok(want.moveDir)) throw new Error('that is not a maneuver square');
        say(st, `Your Elusive Cloak moves your maneuver from ${MANEUVERS[p.moveDir]} to ${MANEUVERS[want.moveDir]}.`, 'combat');
        c.events.push(`Your Elusive Cloak moves your maneuver to ${MANEUVERS[want.moveDir]}.`);
        p.moveDir = want.moveDir;
    }
    return p;
}
// What the shift screen shows: the plays, who stands where after the dice, and what each card allows.
export function shiftOptions(st, data) {
    const c = st.combat, X = c?.shiftCtx;
    if (!X) return null;
    const sh = shiftChances(st, data, X);
    return { ...sh, attackDir: X.p.attackDir, moveDir: X.p.moveDir, hasAttack: X.p.attackDir != null && !!(X.fight || (c.attackSpell && !c.attackSpell.auto)), hasMove: !!X.move,
        placed: c.dens.filter(d => !d.dead && d.kind !== 'horse' && d.box != null).map(d => ({ uid: d.uid, name: denSide(st, data, d).name, box: d.box, atk: denSide(st, data, d).atk, move: denSide(st, data, d).move, aimedAtHim: attackersOnHim(st, data).some(a => a.uid === d.uid) })) };
}
// His answer to the offer: `a.attackDir` / `a.moveDir` name the new circle / square; nothing named keeps his plays.
export function shiftAction(st, data, a) {
    const c = st.combat;
    if (c.step !== 'shift' || !c.shiftCtx) throw new Error('there is no shift to make');
    const X = c.shiftCtx, sh = shiftChances(st, data, X);
    const p = applyShift(st, data, X, sh, a);
    c.step = 'melee';
    return meleeResolve(st, data, { ...X, p });
}

// A Demon or Imp counter worn by the hero attacks with its spell, like a monster and not like a character (Absorb Essence 2.2): where its blow connects, the Power of the Pit
// Table is rolled at the creature it was aimed at. A Fiery Chasm and a Terror sweep the clearing as they do for a Demon (the caster is not a denizen, so he is spared), Carried
// Away kills the target, the other rows touch only characters. It pays him as his kills do. A target shielded from magic is unaffected.
function morphPit(st, data, h, log) {
    const c = st.combat, den = c.dens.find(d => d.uid === h.on && !d.dead);
    if (!den) return;
    const name = denSide(st, data, den).name;
    if (shielded(st, { kind: den.kind, id: den.id })) { log(`Your spell cannot touch the ${name}: it is shielded.`); return; }
    const { row, dice } = rollPit(st, data, 'Your spell (Power of the Pit)');
    log(`Your spell at the ${name}: ${row.name} (rolled ${dice.join('+')}). ${row.effect}`);
    if (row.name === 'Fiery Chasm' || row.name === 'Terror') pitSweep(st, data, row.name, { pay: true, log });
    else if (row.name === 'Carried Away') log(`The ${name} is carried away${slayDenizen(st, data, den, { spell: 'Power of the Pit' })}.`);
    else log(`${row.name} works only on a character: the ${name} is untouched.`);
    c.eventful = true;
}

// How many hits a spell makes on each creature it is aimed at. Stones Fly "always makes at least four attacks": one target takes all four, two take two each, with three
// the one under his Attention chit takes two and the others one, four or more take one each. Fiery Blast makes one attack on each. A one-target spell takes all its hits.
function spellHitPlan(sp, targets, attention) {
    if (!sp.many || targets.length <= 1) return targets.map(t => ({ den: t, n: sp.hits ?? 1 }));
    if (sp.split === 'four') {
        if (targets.length === 2) return targets.map(t => ({ den: t, n: 2 }));
        if (targets.length === 3) return targets.map(t => ({ den: t, n: t === attention ? 2 : 1 }));
    }
    return targets.map(t => ({ den: t, n: 1 }));
}

// Roof Collapses (cave): one attack on every creature in the clearing, his hirelings and himself, in the Smash direction at time 4 whatever chit cast it. A creature that
// has taken a box avoids it only by sitting outside the Smash (Duck) box and not being slower than the 4; one that is not on his sheet has no maneuver and is caught.
// The hero is hit unless he plays a Move chit in another direction whose time is 4 or less (equal does not undercut).
function roofHits(st, data, { hits, log, move, mnvDir }) {
    const c = st.combat, sp = c.attackSpell, spName = data.spells[sp.spell]?.name ?? sp.spell;
    const side = { harm: sp.harm, stars: sp.stars ?? 0, time: sp.time, length: sp.length, missile: false, dir: sp.dir };
    for (const d of c.dens.filter(x => !x.dead && x.kind !== 'part' && x.kind !== 'horse')) {
        // the roof falls on a native and on its horse alike: the horse does not shield its rider from a spell that attacks them both
        const horse = c.dens.find(h => h.kind === 'horse' && h.partOf === d.uid && !h.dead);
        for (const def of horse ? [d, horse] : [d]) {
            const ds = denSide(st, data, def), boxed = def.box != null;
            const caught = !boxed || def.box === sp.dir || (ds.move != null && side.time < ds.move);
            if (caught) hits.push({ who: 'me', time: side.time, length: side.length, on: def.uid, owner: d.uid, side, spell: spName });
            log(`${spName}: the roof falls on the ${ds.name}${caught ? '' : ' and misses'}.`);
        }
    }
    for (const h of (c.hires ?? []).filter(x => !x.dead)) {
        hits.push({ who: 'roofhire', hire: h.uid, time: side.time, length: side.length });
        log(`${spName}: the roof falls on your hireling ${data.natives[h.id].name}.`);
    }
    const hitsHero = !move || mnvDir === sp.dir || side.time < move.time;
    if (hitsHero) { hits.push({ who: 'roofhero', time: side.time, length: side.length, side }); log(`${spName}: the roof falls on you.`); }
    else log(`${spName}: you get out of the way.`);
}

// A hireling under the falling roof: a native of vulnerability up to Heavy dies, and either way his group rebels (8.4.2g).
function roofStrikesHire(st, data, h, log) {
    const c = st.combat, hire = c.hires.find(x => x.uid === h.hire);
    if (!hire || hire.dead) return;
    const hs = hireStats(data, hire.id), n = st.nats.find(x => x.id === hire.id), group = data.natives[hire.id].group;
    if (lvl('H') >= lvl(hs.vuln)) {
        hire.dead = true; n.dead = true; n.hired = false; delete n.hiredBy; n.loc = null;
        st.ch.notoriety -= hs.notor;
        log(`The roof kills ${hs.name}; you lose ${hs.notor} Notoriety.`);
    } else log(`The roof hits ${hs.name} but does not kill.`);
    c.eventful = true;
    rebelGroup(st, data, group, hire.dead ? [hire.id] : []);
}
// Treachery: when his spell strikes a native he hired, that group's hirelings turn on him and the group battles.
// 8.4.2g: every member of the group under his hire rebels, wherever it is on the map, and he loses Fame equal to each rebel's Notoriety bounty.
// `also` names a hireling already struck down by the very effect that caused the treachery: it counts as a rebel too.
export function rebelGroup(st, data, group, also = [], what = 'your spell did') {
    const c = st.combat;
    let any = false, lost = 0;
    for (const h of (c.hires ?? []).filter(x => !x.dead && data.natives[x.id].group === group)) { h.dead = true; any = true; }
    const rebels = new Set([...also, ...st.nats.filter(n => n.hired && (n.hiredBy ?? st.ch.id) === st.ch.id && !n.dead && data.natives[n.id].group === group).map(n => n.id)]);
    for (const id of rebels) {
        const n = st.nats.find(x => x.id === id);
        n.hired = false; delete n.hiredBy; if (!also.includes(id)) any = true;
        lost += data.natives[id].notorietyBounty ?? 0;
    }
    if (lost) { st.ch.fame -= lost; say(st, `Treachery: you lose ${lost} Fame.`, 'combat'); }
    if (any || nativesIn(st, data, c.at).some(n => data.natives[n.id].group === group)) {
        say(st, `The ${group} turn on you for what ${what} to one of their own.`, 'combat');
        startBattling(st, data, group);
    }
}

// Peace and Persuade end when the creature they protect is named as the target of an attack or spell (he or his hirelings; area spells do not name it).
function namedTarget(st, data, den, log) {
    if (!st.fx?.length) return;
    for (const { fx } of fxTags(st, { kind: den.kind, id: den.id }, 'nameBreaks')) {
        log(`You name the ${denSide(st, data, den).name}: ${data.spells[fx.spell]?.name ?? fx.spell} is broken, and it fights back.`);
        breakFx(st, data, fx.id, 'its target was named');
    }
}

function canFlip(st, data, d) {
    if (d.kind === 'horse') return false;
    if (morphOf(st, d)) return false;
    if (d.kind === 'mon') { const m = data.monsters[d.id]; return d.side !== 'red' && !(m.red) ; }
    if (d.kind === 'part') return true;
    return true;
}

// He decides how the denizens go into the three boxes. Rule: fill as many boxes as possible; a part may not share a box with its owner.
function placeInBoxes(st, data, list, wanted) {
    const c = st.combat;
    const used = [0, 0, 0];
    const place = (d, b) => { d.box = b; used[b]++; };
    // honour requested boxes where they respect the part rule
    const order = [...list];
    for (const d of order) d.box = null;
    for (const d of order.filter(d => d.kind !== 'part')) {
        const b = wanted[d.uid];
        if (b === 0 || b === 1 || b === 2) place(d, b);
    }
    for (const d of order.filter(d => d.kind !== 'part' && d.box == null)) {
        const lowest = used.indexOf(Math.min(...used));
        place(d, lowest);
    }
    for (const d of order.filter(d => d.kind === 'part')) {
        const owner = c.dens.find(o => o.uid === d.partOf);
        const choices = [0, 1, 2].filter(b => b !== owner.box).sort((a, b) => used[a] - used[b]);
        let b = wanted[d.uid];
        if (!(b === 0 || b === 1 || b === 2) || b === owner.box) b = choices[0];
        place(d, b);
    }
    // fill as many boxes as possible: with n things, min(n, 3) boxes must be in use
    const need = Math.min(order.length, 3);
    for (let guard = 0; guard < 8 && used.filter(u => u > 0).length < need; guard++) {
        const from = used.indexOf(Math.max(...used)), to = used.indexOf(0);
        const mover = order.find(d => d.box === from && d.kind !== 'part') ?? order.find(d => d.box === from && d.kind === 'part' && c.dens.find(o => o.uid === d.partOf).box !== to);
        if (!mover || used[from] < 2) break;
        used[from]--; mover.box = to; used[to]++;
    }
}

// ---- hits ----
function killReward(st, data, den, s) {
    st.ch.killsToday = (st.ch.killsToday ?? 0) + 1;
    const k = st.ch.killsToday;
    const fame = (s.fame ?? 0) * k, notor = (s.notor ?? 0) * k;
    st.ch.fame += fame; st.ch.notoriety += notor; st.ch.gold += s.gold ?? 0;
    if (st.combat) { const g = (st.combat.roundGain ??= { fame: 0, notoriety: 0, gold: 0 }); g.fame += fame; g.notoriety += notor; g.gold += s.gold ?? 0; }
    // a shared fight: what was paid is remembered for the instant, in case another character's blow killed it at the same moment (8.7.1: the points are then split)
    if (sharedFight(st) && den) den.slain = { by: st.ch.id, g: st.combat.groupNo ?? 0, total: { fame, notoriety: notor, gold: s.gold ?? 0 }, paid: { [st.ch.id]: { fame, notoriety: notor, gold: s.gold ?? 0 } } };
    const bits = [];
    if (fame) bits.push(`+${fame} Fame`);
    if (notor) bits.push(`+${notor} Notoriety`);
    if (s.gold) bits.push(`+${s.gold} gold`);
    return bits.length ? ` (${bits.join(', ')}; kill ${k} today)` : '';
}

// A denizen dies, by his hand or his spell: its parts go with it, a native's horse is lost with the rider (or alone), the bounty is paid unless `pay` is false
// (a "shared" kill still counts toward the day's total), and the monster or native leaves the map. Returns the bounty text for the log.
export function slayDenizen(st, data, den, { pay = true, shared = false, spell = null } = {}) {
    const c = st.combat, s = denSide(st, data, den);
    den.dead = true; den.slainBy = spell;
    if (den.kind === 'mon' || den.kind === 'nat') lostTarget(st, data, { kind: den.kind, id: den.id });          // spells aimed at it end with it
    if (den.kind === 'horse') { const nat = st.nats.find(n => n.id === den.owner); if (nat) nat.horseDead = true; c.eventful = true; return ''; }
    for (const p of c.dens.filter(d => d.partOf === den.uid)) p.dead = true;
    let reward = '';
    if (shared) { st.ch.killsToday = (st.ch.killsToday ?? 0) + 1; reward = ' (a shared kill: the bounty was already paid)'; }
    else if (pay) reward = killReward(st, data, den, s);
    if (den.kind === 'mon') { const m = st.mons.find(x => x.id === den.id); m.dead = true; m.loc = null; }
    else if (den.kind === 'nat') { const n = st.nats.find(x => x.id === den.id); n.dead = true; n.loc = null; dropNativeGoods(st, data, n); }
    tally(st, 'kills'); tally(st, `kill.${s.name}`);
    (c.killed ??= []).push(s.name);
    c.eventful = true;
    return reward;
}

// A second (third ...) character kills a creature in the very instant another did: everyone who killed it gets an equal share of what the first was paid, the odd points going to the first;
// each counts it as a kill today. Returns the words for the log.
function splitKill(st, data, den) {
    const sl = den.slain, me = st.ch.id, ids = [...Object.keys(sl.paid), me], n = ids.length;
    st.ch.killsToday = (st.ch.killsToday ?? 0) + 1;
    (st.combat.killed ??= []).push(denSide(st, data, den).name);
    tally(st, 'kills');
    const share = k => Math.floor(sl.total[k] / n);
    for (const [i, id] of ids.entries()) {
        const ch = st.chars[id], want = {}, had = sl.paid[id] ?? { fame: 0, notoriety: 0, gold: 0 };
        for (const k of ['fame', 'notoriety', 'gold']) want[k] = i === 0 ? sl.total[k] - (n - 1) * share(k) : share(k);
        ch.fame += want.fame - had.fame; ch.notoriety += want.notoriety - had.notoriety; ch.gold += want.gold - had.gold;
        const g = ch.today.combat && (ch.today.combat.roundGain ??= { fame: 0, notoriety: 0, gold: 0 });
        if (g) { g.fame += want.fame - had.fame; g.notoriety += want.notoriety - had.notoriety; g.gold += want.gold - had.gold; }
        sl.paid[id] = want;
    }
    const mine = sl.paid[me], bits = [];
    if (mine.fame) bits.push(`+${mine.fame} Fame`);
    if (mine.notoriety) bits.push(`+${mine.notoriety} Notoriety`);
    if (mine.gold) bits.push(`+${mine.gold} gold`);
    return ` (shared kill, your share${bits.length ? `: ${bits.join(', ')}` : ' is nothing'}; kill ${st.ch.killsToday} today)`;
}

// Naming a creature that was not set on him makes it fight (a native brings its whole group in, with no blow back this round, as in meleePlay).
function provoke(st, data, target) {
    const c = st.combat;
    if (!target || target.dead || target.assigned || target.elsewhere) return;
    if (target.kind === 'nat') {
        startBattling(st, data, data.natives[target.id].group);
        if (!st.options?.watchfulNatives) for (const d of c.dens) if (d.kind === 'nat' && data.natives[d.id].group === data.natives[target.id].group || d.partOf === target.uid) { d.noRetaliation = true; d.noWhy = 'joins'; }
    }
    target.assigned = true;
}

function myHit(st, data, h, ctx) {
    const c = st.combat;
    let den = c.dens.find(d => d.uid === h.on);
    const owner = c.dens.find(d => d.uid === h.owner);
    if (den.kind === 'horse' && den.dead && owner && !owner.dead) den = owner;          // the horse an earlier blow of the same instant killed: the rest fall on the rider (8.4.9)
    const s = denSide(st, data, den);
    const side = ctx.mySide;
    let level = lvl(side.harm), stars = side.stars;
    // Penetrating Grease (Treasures 11): his weapon ignores all armor, so an armored denizen takes the full sharpness
    if (s.armored && !(ctx.potions && hasTreasure(st, 'penetrating-grease'))) stars = Math.max(0, stars - 1);
    level += stars;
    let note = '', shotDelta = null;
    if (side.missile) {
        const bow = /bow$/i.test(ctx.w ? data.weapons[ctx.w.item.id]?.name ?? '' : '');
        // a spell's Missile roll is a plain roll: the Archer's single die and the Aim advantage belong to weapons (RealmSpeak; 01-combat-spells.md Question 3)
        const r = !ctx.spell && ((hasAdv(st, 'archer') && bow) || oneDie(st, 'missile')) ? (() => { const d1 = die(st); return { dice: [d1], value: d1 }; })() : roll2(st);
        const aim = !ctx.spell && hasAdv(st, 'aim') ? 1 : 0;
        const v = clamp6(r.value - aim + tableMod(st, data, 'missile'));
        level += MISSILE[v - 1]; shotDelta = MISSILE[v - 1];
        noteRoll(st, 'Your missile roll', r.dice, v, `${MISSILE[v - 1] >= 0 ? '+' : ''}${MISSILE[v - 1]} harm level${Math.abs(MISSILE[v - 1]) === 1 ? '' : 's'}${aim ? ' (Aim -1)' : ''}`);
        note = ` (missile roll ${r.dice.join('+')}${aim ? ' -1 for Aim' : ''} -> ${MISSILE[v - 1] >= 0 ? '+' : ''}${MISSILE[v - 1]})`;
    } else if (ctx.fight && ctx.w && lvl(ctx.fight.strength) > lvl(side.harm)) { level += 1; note = ' (strong Fight chit +1)'; }
    else if (ctx.fight && !ctx.w) level += 1;
    const finalL = letterOf(level);
    const vuln = lvl(s.vuln);
    if (den.kind === 'horse') {
        if (level >= vuln) {
            den.dead = true;
            const nat = st.nats.find(n => n.id === den.owner); if (nat) nat.horseDead = true;
            ctx.log(`You strike down the ${s.name}${note}.`);
            c.eventful = true;
        } else ctx.log(`You hit the ${s.name} but harm ${finalL} is not enough${note}.`);
        return;
    }
    if (level >= vuln) {
        const shared = den.dead;           // a hireling's blow killed it in the same instant: the bounty is paid once, and this still counts as a kill
        // a further hit of the same spell on a target it has already killed scores nothing (one death, one kill)
        if (shared && ctx.spell && den.slainBy === ctx.spell) { ctx.log(`Another ${ctx.spell} hit finds the ${s.name} already dead.`); return; }
        // another character's blow killed it in the very same instant: the points are split equally and each of them counts it as a kill (8.7.1)
        if (shared && sharedFight(st) && den.slain && den.slain.g === c.groupNo && den.slain.by !== st.ch.id) {
            const text = splitKill(st, data, den);
            ctx.log(`You kill the ${s.name} with ${finalL} harm${note}, in the same instant as ${st.chars[den.slain.by].name}${text}.`);
            c.eventful = true;
            return;
        }
        const reward = slayDenizen(st, data, den, { shared, spell: ctx.spell ?? null });
        ctx.log(`You kill the ${s.name} with ${finalL} harm${note}${reward}.`, tell.kill(st, ctx.spell ?? (ctx.w ? nameOfItem(st, data, ctx.w.item) : ctx.morphName ?? 'bare hands'), s.name, reward));
        c.eventful = true;
    } else {
        tally(st, 'hitsNotKilling');
        ctx.log(`You hit the ${s.name} for ${finalL} harm${note}; it has vulnerability ${s.vuln} and survives.`, tell.tough(st, ctx.spell ?? (ctx.w ? nameOfItem(st, data, ctx.w.item) : ctx.morphName ?? 'bare hands'), s.name, finalL, s.vuln, shotDelta));
        // a harmless hit still turns the weapon unalerted (handled by caller)
    }
}

// ---- pvp: blows between characters (docs/design/multiplayer-step5.md; rules 8.4.8, 8.4.9 j-n, 8.7.2) ----
// The Missile Table roll of his own blow (his Archer and Aim advantages, potions): the change in harm level, with the roll noted and told.
function ownMissile(st, data, w, spell = false) {
    const bow = /bow$/i.test(w ? data.weapons[w.item.id]?.name ?? '' : '');
    // (a spell's Missile roll is a plain roll: the Archer's single die and the Aim advantage belong to weapons, as for a creature)
    const r = !spell && ((hasAdv(st, 'archer') && bow) || oneDie(st, 'missile')) ? (() => { const d1 = die(st); return { dice: [d1], value: d1 }; })() : roll2(st);
    const aim = !spell && hasAdv(st, 'aim') ? 1 : 0;
    const v = clamp6(r.value - aim + tableMod(st, data, 'missile')), m = MISSILE[v - 1];
    noteRoll(st, 'Your missile roll', r.dice, v, `${m >= 0 ? '+' : ''}${m} harm level${Math.abs(m) === 1 ? '' : 's'}${aim ? ' (Aim -1)' : ''}`);
    return { delta: m, note: ` (missile roll ${r.dice.join('+')}${aim ? ' -1 for Aim' : ''} -> ${m >= 0 ? '+' : ''}${m})` };
}

// The kills of one tie group (characters who fell to a character or to a hireling of one), settled when the group is over: killQ = [{ killer, victim, hire?: 'leader' | 'underling' }].
let killQ = [];

// His blow falls on another character. Runs as the attacker; the harm is worked out with HIS Fight chit, weapon, advantages and potions, and the victim takes it exactly as he takes a
// creature's blow: on the horse he played as his maneuver, else on the armor in its way (a shield only in the lane he guards), else on him (strikeHero, run with HIS sheet open).
function charBlow(st, data, h, part, g, log) {
    const att = st.ch, vid = h.char, victim = st.chars[vid], rival = part.peers?.[vid], { w, fight, hm } = part, spell = h.spell ?? null, side = h.side ?? part.mySide;          // (h.side: an attack spell's own numbers)
    const pierce = !spell && !hm && hasTreasure(st, 'penetrating-grease');
    let bonus = 0, note = '', delta = null;
    if (side.missile) ({ delta, note } = ownMissile(st, data, spell ? null : w, !!spell));
    else if (!hm && fight && w && lvl(fight.strength) > lvl(side.harm)) { bonus = 1; note = ' (strong Fight chit +1)'; }
    else if (!hm && fight && !w) bonus = 1;
    const was = victim.today.slain;
    const blow = { name: `${att.name}'s ${spell ?? part.weaponName}`, harm: side.harm, stars: side.stars ?? 0, bonus, pierce, delta, dir: part.myDir, missile: !!side.missile, archer: false, den: null };
    part.as(vid, () => {
        const vx = rival?.X, horse = vx?.move?.isHorse ? st.ch.items.find(i => i.uid === vx.move.horseUid) : null;
        strikeHero(st, data, blow, { mnvDir: vx?.p.moveDir ?? null, move: vx?.move ?? null, shieldDir: vx?.p.shieldDir ?? null, log: rival?.log ?? ((t, story) => say(st, t, 'combat', story ?? null)), g, horse });
    });
    if (victim.today.slain !== was) {
        killQ.push({ killer: att.id, victim: vid });
        log(`You strike ${victim.name} down${note}.`);
    } else if (note) log(`Your blow at ${victim.name} is struck${note}.`);
}

// A hireling sent at a character strikes him; a kill pays its hirer (8.7.3), who does not count it as his own.
function hireStrikesChar(st, data, h, part, g, log) {
    const hire = st.combat.hires.find(x => x.uid === h.hire), hs = hireStats(data, hire.id, hire.kind, st), vid = h.char, victim = st.chars[vid], rival = part.peers?.[vid];
    const was = victim.today.slain;
    part.as(vid, () => {
        const vx = rival?.X, horse = vx?.move?.isHorse ? st.ch.items.find(i => i.uid === vx.move.horseUid) : null;
        strikeHero(st, data, { name: hs.name, harm: hs.harm, stars: hs.stars ?? 0, dir: h.dir, missile: !!hs.missile, archer: !!hs.archer, den: null }, { mnvDir: vx?.p.moveDir ?? null, move: vx?.move ?? null, shieldDir: vx?.p.shieldDir ?? null, log: rival?.log ?? ((t, story) => say(st, t, 'combat', story ?? null)), g, horse });
    });
    if (victim.today.slain !== was) {
        killQ.push({ killer: st.ch.id, victim: vid, hire: hire.kind === 'mon' || data.natives[hire.id]?.leader ? 'leader' : 'underling' });
        log(`${hs.name} strikes ${victim.name} down for you.`);
    }
}

// His blow falls on a hireling of another character: it is killed if the harm reaches its vulnerability. The killer is paid as for any native or monster (and counts the kill); the hireling's
// owner loses its Notoriety bounty (8.7.7).
function myHitHire(st, data, h, hire, ctx) {
    const hs = hireStats(data, hire.id, hire.kind, st), side = ctx.mySide;
    let level = lvl(side.harm), stars = side.stars;
    if (hs.armored && !(ctx.potions && hasTreasure(st, 'penetrating-grease'))) stars = Math.max(0, stars - 1);
    level += stars;
    let note = '';
    if (side.missile) { const m = ownMissile(st, data, ctx.w); level += m.delta; note = m.note; }
    else if (ctx.fight && ctx.w && lvl(ctx.fight.strength) > lvl(side.harm)) { level += 1; note = ' (strong Fight chit +1)'; }
    else if (ctx.fight && !ctx.w) level += 1;
    const L = letterOf(level);
    if (level < lvl(hs.vuln)) { ctx.log(`You hit ${hs.name} for ${L} harm${note}; it has vulnerability ${hs.vuln} and survives.`); return; }
    hire.dead = true; hireDies(st, data, hire);
    const owner = st.chars[hire.owner];
    owner.notoriety -= hs.notor;
    const reward = killReward(st, data, null, { fame: hs.fame, notor: hs.notor, gold: hs.gold });
    tally(st, 'kills'); tally(st, `kill.${hs.name}`);
    ctx.log(`You kill ${owner.name}'s ${hs.name} with ${L} harm${note}${reward}; ${owner.name} loses ${hs.notor} Notoriety.`);
    st.combat.eventful = true;
    if (st.battle.members[hire.owner]?.state === 'in') st.chars[hire.owner].today.combat.eventful = true;
}

// Killing a character (8.7.2): the killer takes his recorded Notoriety (not multiplied), the gold he carried, and his belongings (8.7.2d); his Fame is lost with him; it counts as a kill for the
// daily multiplier. A hireling's kill pays its hirer the Notoriety, unmultiplied, and not as his kill (8.7.3); an underling takes neither gold nor goods (8.7.3b), a hired leader or controlled
// monster does. Several who killed him in the same instant share the points equally, the odd ones to the first; the goods go to the first who may take them. Two who kill each other in one
// instant swap (what each had when the instant began is what is taken). A victim of an underling or of nobody who may take his things leaves them where he fell (day.js died).
function settleKills(st, data, kills, parts, run) {
    const b = st.battle, by = new Map();
    for (const k of kills) {
        const list = by.get(k.victim) ?? by.set(k.victim, []).get(k.victim);
        if (!list.some(x => x.killer === k.killer && x.hire === k.hire)) list.push(k);
    }
    const snap = new Map();
    for (const v of by.keys()) {
        const ch = st.chars[v], form = ch.morph?.creature;
        snap.set(v, { notoriety: (ch.notoriety ?? 0) + (form?.notor ?? 0), fame: form?.fame ?? 0, gold: ch.gold ?? 0, items: ch.items.filter(i => !i.destroyed) });
    }
    const share = (total, n, i) => (i === 0 ? total - (n - 1) * Math.floor(total / n) : Math.floor(total / n));
    const said = [];
    for (const [v, list] of by) {
        const s = snap.get(v), ch = st.chars[v], eligible = list.filter(k => !k.hire || k.hire === 'leader');
        const taker = eligible[0] ?? null;
        const taken = taker ? s.items.map(it => ({ ...it, active: false, alerted: false })) : [];
        if (taker) { ch.gold -= s.gold; ch.items = ch.items.filter(i => !s.items.includes(i)); }
        list.forEach((k, i) => {
            const killer = st.chars[k.killer], n = share(s.notoriety, list.length, i), f = share(s.fame, list.length, i), ei = eligible.indexOf(k);
            const gold = ei >= 0 ? share(s.gold, eligible.length, ei) : 0;
            killer.notoriety += n; killer.fame += f; killer.gold += gold;
            if (!k.hire) killer.killsToday = (killer.killsToday ?? 0) + 1;
            if (k === taker) killer.items.push(...taken);
            const g = killer.today.combat && (killer.today.combat.roundGain ??= { fame: 0, notoriety: 0, gold: 0 });
            if (g) { g.fame += f; g.notoriety += n; g.gold += gold; }
            const bits = [], own = [];
            if (n) { bits.push(`${n} Notoriety`); own.push(`${n} Notoriety`); }
            if (f) { bits.push(`${f} Fame`); own.push(`${f} Fame`); }
            if (gold) own.push(`${gold} gold`);
            if (k === taker && taken.length) { const goods = `his belongings (${taken.map(it => nameOfItem(st, data, it)).join(', ')})`; bits.push(goods); own.push(goods); }
            // R-23: the gold a victim carried is recorded and secret; the killer reads it off him (a line of his own, below), the others in the fight see what is public (Notoriety, belongings)
            const head = `${st.chars[k.killer].name}${k.hire ? "'s hireling" : ''} killed ${ch.name}${list.length > 1 ? ' (shared)' : ''}`;
            said.push({ k, v, text: `${head}${bits.length ? ` and takes ${bits.join(', ')}` : ''}.`, own: gold ? `${head} and takes ${own.join(', ')}.` : null, reveal: { victim: ch.name, gold: s.gold, notoriety: s.notoriety } });
        });
        ch.today.slain = { ...(ch.today.slain ?? {}), by: st.chars[list[0].killer].name, killer: list[0].killer };
        if (b.kills) {
            const rec = { round: b.round, victim: v, killers: list.map(k => k.killer), notoriety: s.notoriety, items: taken.map(it => ({ kind: it.kind, id: it.id })) };
            if (list.some(k => k.hire)) rec.hired = true;          // (struck down by a hireling: the hirer is the killer named)
            if (s.fame) rec.fame = s.fame;                         // (a transformed victim's creature paid its Fame as well)
            b.kills.push(rec);
        }
        tally(st, 'kills'); tally(st, 'kill.character');
    }
    for (const x of said) {
        const pt = parts.find(p => p.by === x.k.killer);
        if (pt) run(pt, () => {
            say(st, x.text, 'combat'); pt.c.events.push(x.own ?? x.text); pt.c.eventful = true;
            say(st, `You read ${x.reveal.victim}'s record: ${x.reveal.gold} gold and ${x.reveal.notoriety} Notoriety.`, 'info', null, { who: x.k.killer, vis: 'owner' });          // (R-23: a one-time reveal, for the killer alone)
            delete st.log.at(-1).with;                                                                       // (his alone: who stood by is no business of the line, and would depend on the order the answers came in)
        });
    }
}

// A slain leader's group drops its goods where he fell.
function dropNativeGoods(st, data, n) {
    const def = data.natives[n.id];
    if (!def.leader) return;
    const stock = st.stock[def.group] ?? [];
    if (!stock.length) return;
    const at = st.combat.at;
    const items = stock.splice(0).map(g => makeItem(st, g.kind, g.id, g.card ? { card: g.card } : {}));
    st.abandoned[at] = [...(st.abandoned[at] ?? []), ...items];
    say(st, `The ${def.group}'s goods are left lying where their leader fell.`, 'loot');
}

function denHit(st, data, den, ctx) {
    const c = st.combat, s = denSide(st, data, den);
    const dir = den.box;
    // red side up from an earlier round: kills outright
    if (den.pickedUp) return killMe(st, `${s.name} crushes you.`, s.name);
    // a Demon's Power of the Pit and an Imp's curse go to the rider; a horse played as the maneuver does not take them
    if (s.attack === 'spell') {
        // a Pentangle (or any shield against bewitching magic) keeps the Demon, Winged Demon and Imp from harming him
        if (fxTags(st, HERO, 'demonProof').length || shielded(st, HERO)) { ctx.log(`${s.name}'s magic cannot touch you: you are shielded.`); return; }
        // an Imp's spell is a curse (8.4.7b, the Curses Table); a Demon's is the Power of the Pit
        if (den.kind === 'mon' && data.monsters[den.id]?.family === 'Imp') {
            ctx.log(`${s.name}'s magic is aimed at you.`);
            rollCurse(st, data);
            c.eventful = true;
            return;
        }
        const row = pit(st, data, `${s.name}'s magic`);
        pitSweep(st, data, row, { caster: den, log: ctx.log });
        c.eventful = true;
        if (st.ch.dead) { ctx.log(`${s.name}'s magic kills you.`); c.events.push('You are dead.'); }
        else if (s.tremendous && den.kind !== 'part') c.toRed.push(den.uid);
        return;
    }
    return strikeHero(st, data, { name: s.name, harm: s.harm, stars: s.stars ?? 0, dir, missile: s.attack === 'missile', archer: s.type === 'Archer', den }, ctx);
}

// A blow lands on the hero: first on the horse he played as his maneuver, else on the armor in its way (a shield guarding that direction, then body armor),
// else on him. `b` = { name, harm, stars, dir, missile, archer, den } (den: the creature that struck, or null for a spell).
function strikeHero(st, data, b, ctx) {
    const c = st.combat, den = b.den;
    let level = lvl(b.harm), stars = b.stars ?? 0;
    // if his horse was played as the maneuver the blow lands on the horse, not on him
    if (ctx.horse && (!ctx.horse.destroyed || ctx.horse.destroyedGroup === ctx.g)) {
        const hd = data.horses[ctx.horse.id];
        let hl = lvl(b.harm) + (b.bonus ?? 0) + (hd.armored && !b.pierce ? Math.max(0, stars - 1) : stars);
        if (b.missile) hl += b.delta ?? missileRoll(st, `${b.name}'s missile roll (at your horse)`, b.archer);          // (b.delta: a character's own roll, with his Aim and Archer advantages, already made)
        if (hl >= lvl(hd.vulnerability)) {
            ctx.horse.destroyed = true; ctx.horse.active = false; ctx.horse.destroyedGroup = ctx.g;
            ctx.log(`${b.name} strikes your ${hd.name} dead.`);
            c.eventful = true;
        } else ctx.log(`${b.name} hits your ${hd.name} but it stands.`);
        const owner = !den ? null : den.kind === 'part' ? c.dens.find(d => d.uid === den.partOf) : den;
        if (owner && redCapable(st, data, owner) && !c.toRed.includes(owner.uid)) c.toRed.push(owner.uid);      // it has hit something of his: it turns red
        return;
    }
    // he is a creature: the blow is judged against its vulnerability (armored counters turn a star), never a wound; harm that reaches the vulnerability kills it, and him with it
    if (st.ch.morph) return strikeForm(st, data, b, ctx);
    // armor in that direction: a shield guarding that way first, then body armor
    const all = armorForBlow(st, data, ctx.g);
    const pieces = [];
    const sh = all.find(a => isShield(a.def) && ctx.shieldDir === b.dir);
    if (sh) pieces.push(sh);
    for (const a of all) if (!isShield(a.def) && coversDir(a.def, b.dir)) pieces.push(a);
    // the first piece in the way takes the blow: shields and armor cards are the outer row, then helmets and breastplates, then suits
    // (Ointment of Steel before the Suit); a counter before a card of the same row
    const row = a => (isShield(a.def) || (a.def.card && a.def.id !== 'ointment-of-steel-1') ? 1 : /helmet|breastplate/.test(a.def.type ?? '') ? 2 : 3);
    pieces.sort((x, y) => row(x) - row(y) || (x.def.id === 'ointment-of-steel-1' ? -1 : y.def.id === 'ointment-of-steel-1' ? 1 : 0) || (!!x.def.card - !!y.def.card));
    const armor = pieces[0] ?? null;
    let note = '', missile = 0;
    if (b.missile) {
        // the Missile Table shifts the harm; if the result is above Tremendous it ignores armor, judged before armor takes any star off
        missile = b.delta ?? missileRoll(st, `${b.name}'s missile roll`, b.archer);
        if (lvl(b.harm) + stars + missile > 4) return killMe(st, `${b.name}'s shot finds a vital spot; you are slain.`, b.name);
    }
    if (armor && !b.pierce) stars = Math.max(0, stars - 1);          // (a Penetrating Grease on the weapon ignores all armor)
    level += stars + missile + (b.bonus ?? 0);
    const L = letterOf(level);
    ctx.log(`${b.name} strikes ${DIRS[b.dir].toLowerCase()} for ${L} harm${armor ? ` against your ${armor.def.name}` : ''}.`, tell.strike(st, b.name, DIRS[b.dir].toLowerCase(), L, armor?.def.name));
    let wounded = false, changed = false, greased = false;
    if (armor) {
        const tough = lvl(armor.def.toughness ?? armor.def.weight);
        if (level >= tough) {
            const card = !!armor.def.card;
            if (!card && level === tough && !armor.item.damaged && !armor.item.destroyed) { armor.item.damaged = true; changed = true; tally(st, 'armorDamaged'); ctx.log(`Your ${armor.def.name} is damaged.`, tell.damaged(st, armor.def.name)); c.eventful = true; }
            else if (!armor.item.destroyed) {
                armor.item.destroyed = true; armor.item.active = false; armor.item.destroyedGroup = ctx.g; changed = true; tally(st, 'armorDestroyed');
                const gold = !armor.def.native ? (armor.def.priceDestroyed ?? 0) : 0;
                if (gold) st.ch.gold += gold;
                ctx.log(`Your ${armor.def.name} is destroyed${gold ? ` (worth ${gold} gold to you)` : ''}.`, tell.destroyed(st, armor.def.name, gold));
                c.eventful = true;
            }
        }
        if (level >= lvl('M')) {
            // Reflecting Grease (Treasures 12): an attack that strikes armor wounds no action chit (the armor is still damaged or destroyed as above)
            if (hasTreasure(st, 'reflecting-grease')) { greased = true; ctx.log('Your Reflecting Grease turns the blow aside: no chit is wounded.'); }
            else wounded = true;
        }
    } else if (level >= lvl(st.ch.weight)) {
        return killMe(st, `${b.name} deals ${L} harm; you are slain.`, b.name);
    } else if (level >= lvl('L')) wounded = true;
    if (wounded) {
        c.newWounds = (c.newWounds ?? 0) + 1; tally(st, 'woundsTaken'); tally(st, `wounds.${b.name}`);
        c.eventful = true;
        ctx.log('You take a wound.', tell.wound(st));
    } else if (!changed && !greased && !st.ch.dead) {
        // nothing came of it, and the player should be told why
        const why = armor
            ? `${WEIGHT_WORDS[L] ?? L} harm is not enough to hurt your ${armor.def.name} (toughness ${WEIGHT_WORDS[armor.def.toughness ?? armor.def.weight] ?? armor.def.toughness}), and it is too light to hurt you through it.`
            : `${WEIGHT_WORDS[L] ?? L} harm is too light to wound you.`;
        ctx.log(`No effect: ${why}`, tell.noEffect(st, WEIGHT_WORDS[L] ?? L, armor?.def.name, armor ? (WEIGHT_WORDS[armor.def.toughness ?? armor.def.weight] ?? armor.def.toughness) : null));
    }
    // a tremendous monster that hurts him and leaves him alive will pick him up when the round ends
    if (!st.ch.dead) {
        const owner = !den ? null : den.kind === 'part' ? c.dens.find(d => d.uid === den.partOf) : den;
        if (owner && redCapable(st, data, owner) && !c.toRed.includes(owner.uid)) c.toRed.push(owner.uid);
    }
}
function strikeForm(st, data, b, ctx) {
    const c = st.combat, den = b.den, cr = st.ch.morph.creature, stars = b.stars ?? 0;
    let level = lvl(b.harm) + (b.bonus ?? 0) + (cr.armored && !b.pierce ? Math.max(0, stars - 1) : stars), missile = 0;
    if (b.missile) {
        missile = b.delta ?? missileRoll(st, `${b.name}'s missile roll`, b.archer);
        if (lvl(b.harm) + stars + missile > 4) return killMe(st, `${b.name}'s shot finds a vital spot; the ${cr.name} you are is slain.`, b.name);
    }
    level += missile;
    const L = letterOf(level), dir = DIRS[b.dir]?.toLowerCase() ?? 'blow';
    ctx.log(`${b.name} strikes ${dir} for ${L} harm against your ${cr.name} form.`, tell.strike(st, b.name, dir, L, null));
    if (level >= lvl(cr.vuln)) return killMe(st, `${b.name} deals ${L} harm; the ${cr.name} you are is slain.`, b.name);
    tally(st, 'formHitsSurvived');
    ctx.log(`No effect: ${WEIGHT_WORDS[L] ?? L} harm cannot fell a ${cr.name} (vulnerability ${WEIGHT_WORDS[cr.vuln] ?? cr.vuln}).`);
    const owner = !den ? null : den.kind === 'part' ? c.dens.find(d => d.uid === den.partOf) : den;
    if (owner && redCapable(st, data, owner) && !c.toRed.includes(owner.uid)) c.toRed.push(owner.uid);
}
const redCapable = (st, data, owner) => owner.kind === 'mon' && !!data.monsters[owner.id]?.red && !morphOf(st, owner);

// The Power of the Pit also hits the creatures in the clearing: a Fiery Chasm kills every individual (not the one that cast it), Terror kills the Light and
// Medium monsters, natives and horses. A demon's Pit pays nobody; a spell cast by the hero pays him as for any kill (`pay`). Returns the names of the dead.
function pitSweep(st, data, rowName, { caster = null, pay = false, log = null } = {}) {
    if (rowName !== 'Fiery Chasm' && rowName !== 'Terror') return [];
    const c = st.combat, small = x => lvl(x ?? 'T') <= lvl('M');
    const dead = [];
    for (const d of c.dens) {
        if (d.dead || (caster && (d.uid === caster.uid || (caster.partOf && d.uid === caster.partOf) || d.partOf === caster.uid)) || d.kind === 'part') continue;
        const s = denSide(st, data, d);
        const dies = rowName === 'Fiery Chasm' ? d.kind !== 'horse' : (d.kind === 'horse' ? small(s.vuln) : small(s.size));
        if (!dies) continue;
        slayDenizen(st, data, d, { pay, spell: 'Power of the Pit' });
        dead.push(s.name);
    }
    for (const h of c.hires ?? []) {
        if (h.dead) continue;
        const hs = hireStats(data, h.id, h.kind, st), size = h.kind === 'mon' ? data.monsters[h.id].size : data.natives[h.id].weight;
        if (rowName === 'Fiery Chasm' || small(size)) { h.dead = true; hireDies(st, data, h); dead.push(hs.name); }
    }
    if (dead.length && log) log(`${rowName} kills: ${dead.join(', ')}.`);
    return dead;
}

function killMe(st, text, by = null) {
    st.ch.dead = true; tally(st, 'deathsInCombat'); if (by) tally(st, `slain.${by}`);
    st.slain = { by, text, at: st.ch.at, day: st.day, form: st.ch.morph?.creature.name ?? null, formBounty: st.ch.morph ? { fame: st.ch.morph.creature.fame, notoriety: st.ch.morph.creature.notor } : null };            // for the screen that tells him how it ended
    say(st, text, 'combat');
    st.combat.events.push(text);
    st.combat.eventful = true;
}

// ---- after the dice: fatigue first, then wounds, then the next round ----
function afterMelee(st, data) {
    if (st.ch.dead) return endCombat(st, data, 'died');
    return toFatigue(st, data);
}

// a chit that is wounded, or committed to a spell, is out of play: when every chit is, he is dead (4.2.5b)
const nonWounded = st => st.ch.chits.filter(x => x.state !== 'wounded' && x.state !== 'committed');
const dieOfWounds = (st, data) => { st.ch.dead = true; st.slain = { by: null, text: 'Every action chit was wounded: there was nothing left to fight with.', at: st.ch.at, day: st.day }; say(st, 'Every action chit is wounded; you die.', 'combat'); return endCombat(st, data, 'died'); };

// Wounds fall on active chits first, then on fatigued ones; with no chit left to wound he dies.
function resolveWounds(st, data) {
    const c = st.combat;
    while ((c.newWounds ?? 0) > 0) {
        // wounds fall on ready chits, then enchanted ones, and only then on tired ones (rule 4.2.5)
        const active = st.ch.chits.filter(x => x.state === 'active');
        const enchanted = st.ch.chits.filter(x => x.state === 'enchanted');
        const pool = active.length ? active : enchanted.length ? enchanted : st.ch.chits.filter(x => x.state === 'fatigued');
        if (!pool.length) return dieOfWounds(st, data);
        if (pool.length <= c.newWounds) {
            pool.forEach(x => { x.state = 'wounded'; });
            c.newWounds -= pool.length;
            say(st, `You wound ${pool.length} action chit${pool.length === 1 ? '' : 's'}.`, 'combat', tell.wounded(st, pool.length));
            continue;
        }
        c.step = 'wounds';
        st.pending = { type: 'combat-wounds', count: c.newWounds, chits: pool.map(x => x.id) };
        return;
    }
    if (!st.ch.morph && nonWounded(st).length === 0) return dieOfWounds(st, data);             // (a creature is not wounded, and his own chits are not in play)
    return finishRound(st, data);
}

export function chooseWounds(st, data, ids) {
    const c = st.combat, need = c.newWounds;
    const active = st.ch.chits.filter(x => x.state === 'active');
    const enchanted = st.ch.chits.filter(x => x.state === 'enchanted');
    const eligible = (active.length ? active : enchanted.length ? enchanted : st.ch.chits.filter(x => x.state === 'fatigued')).map(x => x.id);
    const uniq = [...new Set(ids)];
    if (uniq.length !== need || uniq.some(id => !eligible.includes(id))) throw new Error(`choose ${need} chit${need === 1 ? '' : 's'} to wound`);
    for (const id of uniq) st.ch.chits.find(x => x.id === id).state = 'wounded';
    c.newWounds = 0;
    say(st, `You wound ${uniq.length} action chit${uniq.length === 1 ? '' : 's'}.`, 'combat', tell.wounded(st, uniq.length));
    return resolveWounds(st, data);
}

function toFatigue(st, data) {
    const c = st.combat;
    const need = Math.max(0, c.asterisks.move + c.asterisks.fight - 1);
    c.fatigueNeed = need;
    if (need === 0) return resolveWounds(st, data);
    // He must fatigue that many asterisks, using chits of the kind he played. Offer only if there is a real choice.
    const kinds = [];
    if (c.asterisks.move) kinds.push('move');
    if (c.asterisks.fight) kinds.push('fight');
    c.fatigueKinds = kinds;
    const pool = st.ch.chits.filter(x => x.state === 'active' && x.effort > 0 && (kinds.includes(x.type) || x.alt?.mf));        // a Move/Fight chit can pay either kind
    const total = pool.reduce((s, x) => s + x.effort, 0);
    if (total <= need) {
        pool.forEach(x => { x.state = 'fatigued'; });
        if (pool.length) { say(st, `You fatigue ${pool.length} chit${pool.length === 1 ? '' : 's'}.`, 'combat', tell.spent(st, pool.length)); c.eventful = true; }
        return resolveWounds(st, data);
    }
    c.step = 'fatigue';
    // say which of his plays cost the effort, so the question is not a mystery
    const lab = ch => `${ch.type === 'move' ? 'Move' : ch.type === 'magic' ? 'Magic' : 'Fight'} ${ch.type === 'magic' ? (ch.numeral ?? '') : (ch.strength ?? '')}${ch.time}${'*'.repeat(ch.effort ?? 0)}`;
    const playedCosting = st.ch.chits.filter(x => c.played?.[x.id] && x.effort > 0);
    const why = `You played ${playedCosting.map(lab).join(' and ') || 'chits with asterisks'}: ${c.asterisks.move + c.asterisks.fight} asterisk${c.asterisks.move + c.asterisks.fight === 1 ? '' : 's'} of effort. The first is free; each one after it is paid by tiring a ${kinds.join(' or ')} chit that has asterisks (any such chit, not only the one you played).`;
    st.pending = { type: 'combat-fatigue', need, chits: pool.map(x => x.id), kinds, why };
}

// Making change (4.2.4a, 8.5.1a): when he tires more asterisks than he owes (a two-asterisk chit for one), a fatigued ONE-asterisk chit of the same type as the one
// he tired comes back into play, and he chooses which. Returns the chits he may name for the fatigue just chosen (empty when he has no choice to make).
export function makeChangeOptions(st, data, ids) {
    const c = st.combat, need = c.fatigueNeed;
    const chosen = [...new Set(ids)].map(id => st.ch.chits.find(x => x.id === id)).filter(Boolean);
    const sum = chosen.reduce((n, x) => n + (x.effort ?? 0), 0);
    if (sum - need !== 1) return [];
    const types = new Set((chosen.some(x => x.effort >= 2) ? chosen.filter(x => x.effort >= 2) : chosen).map(x => x.type));
    return st.ch.chits.filter(x => x.state === 'fatigued' && x.effort === 1 && !chosen.includes(x) && (types.has(x.type) || (x.alt?.mf && [...types].some(t => t === 'move' || t === 'fight'))));
}

export function chooseFatigue(st, data, ids, change = null) {
    const c = st.combat, need = c.fatigueNeed;
    const pool = st.ch.chits.filter(x => x.state === 'active' && x.effort > 0 && (c.fatigueKinds.includes(x.type) || x.alt?.mf));
    const chosen = [...new Set(ids)].map(id => pool.find(x => x.id === id));
    if (chosen.some(x => !x)) throw new Error('that chit cannot be fatigued');
    const sum = chosen.reduce((s, x) => s + x.effort, 0);
    if (sum < need) throw new Error(`fatigue at least ${need} asterisk${need === 1 ? '' : 's'}`);
    if (sum - need > 1) throw new Error('that is more than needed');
    // Overshoot by one: make change by returning a fatigued single-asterisk chit of the same type, his choice (the first of them when he names none).
    const options = makeChangeOptions(st, data, ids);
    if (change != null && !options.some(x => x.id === change)) throw new Error('the chit you make change with must be a tired one-asterisk chit of the same type as the one you tire');
    chosen.forEach(x => { x.state = 'fatigued'; });
    if (sum - need === 1) {
        const back = options.find(x => x.id === change) ?? options[0];
        if (back) { back.state = 'active'; say(st, `You make change for the extra asterisk: ${chitName(back)} is ready again.`, 'combat'); }
    }
    say(st, `You fatigue ${chosen.length} chit${chosen.length === 1 ? '' : 's'}.`, 'combat', tell.spent(st, chosen.length));
    c.eventful = true;
    return resolveWounds(st, data);
}

function finishRound(st, data) {
    const c = st.combat;
    if (c.ran) return endCombat(st, data, c.flew ? 'flew' : 'ran');
    if (sharedFight(st)) { mem(st).done = true; return; }          // his part of the round is over; the round ends when everybody's is (battle.js)
    return nextRound(st, data);
}

// A character who runs (or flies) leaves what was set on him behind (8.3.8): the creatures go back to the unassigned, free to be lured or assigned in the next round.
function releaseSheet(st) {
    for (const d of st.combat.dens) if (d.assigned || d.engagedBy) { d.assigned = false; d.engagedBy = null; }
}

function nextRound(st, data) {
    const c = st.combat;
    expireDue(st, data, 'round-end');
    if (st.fx?.length) worldFadesRoll(st, data);                                  // World Fades: an unhidden hero nobody is attacking tries to slip from sight
    const quietRound = !c.eventful && !c.dens.some(d => d.pickedUp && !d.dead);
    c.quiet = quietRound ? c.quiet + 1 : 0;
    c.eventful = false;
    const foes = c.dens.filter(d => !d.dead && d.assigned && d.kind !== 'part' && d.kind !== 'horse');
    const anyFoe = c.dens.some(d => !d.dead && !d.pacified && d.kind !== 'part' && d.kind !== 'horse');
    if (!anyFoe) return endCombat(st, data, 'won');
    if (c.quiet >= 2) return endCombat(st, data, 'quiet');
    // Disengagement: everything that is not assigned or picked up resets; his hit weapon stays as it is.
    for (const d of c.dens) { d.box = null; d.noRetaliation = false; }
    c.round += 1;
    energizePass(st, data, 'round');
    enterEncounter(st, data);
}

function endCombat(st, data, why) {
    const c = st.combat;
    expireDue(st, data, 'round-end');                 // a Phase spell used this round ends with it
    c.ended = true; c.why = why; c.step = 'done';
    tally(st, 'combats'); tally(st, 'rounds', c.round); tally(st, `combat.${why}`);
    for (const d of c.dens) { if (d.kind === 'mon' && d.side === 'red' && (!sharedFight(st) || d.assigned)) d.side = 'light'; }       // (in a shared fight only what was on his sheet lets go)
    if (sharedFight(st)) { const m = mem(st); m.enc = 'done'; m.done = true; }
    // Destroyed things leave his belongings; counters that came from the natives go back to their stock.
    const owners = Object.fromEntries((data.setupcard?.dwellings ?? []).flatMap(dw => [[dw.name, dw.group], [dw.rsName, dw.group]]));
    for (const it of st.ch.items.filter(i => i.destroyed)) {
        const d = it.kind === 'armor' ? data.armor[it.id] : it.kind === 'weapon' ? data.weapons[it.id] : null;
        const group = d?.native && !d.card ? (owners[d.returnsTo] ?? owners[d.startBox]) : null;      // armor goes back to the dwelling it came from (8.4.9 k.3)
        if (group && st.stock[group]) st.stock[group].push({ kind: it.kind, id: it.id });
    }
    st.ch.items = st.ch.items.filter(i => !i.destroyed);
    st.pending = null;
    const text = { won: 'Combat is over: nothing hostile is left.', quiet: 'The fighting dies down.', ran: 'You are out of the fight.', died: 'You have died.', peace: 'A hush falls: there will be no more fighting here today.', teleported: 'You are carried away from the fight.', flew: 'You are out of the fight, in the air.', mist: 'You melt away as mist: the fight is over for you.' }[why];
    say(st, text, 'combat', why === 'quiet' ? tell.dieDown(st) : why === 'won' ? tell.won(st) : why === 'ran' ? tell.ran(st) : null);
}

// ---- hirelings ----
// A hireling is a native (kind 'nat') or a monster that fights for him (kind 'mon': one a spell controls, or Goblins he has hired).
export function hireStats(data, id, kind = 'nat', st = null) {
    // the hirer deploys a hireling on the side that can fight: the one with an attack, the harder-hitting one if both have
    const best = (sides, fallback) => sides.filter(x => x && x.harm != null && x.attackTime != null).sort((a, b) => lvl(b.harm) - lvl(a.harm) || (b.stars ?? 0) - (a.stars ?? 0) || a.attackTime - b.attackTime)[0] ?? fallback;
    if (kind === 'mon') {
        const m = data.monsters[id], s = best([m.light, m.dark], m.light);
        const morph = st ? morphOf(st, { kind: 'mon', id }) : null;
        if (morph) return { name: `${morph.name} (${m.name}, transformed)`, vuln: morph.vulnerability, armored: !!morph.armored, harm: morph.strength, stars: 0, atk: morph.attackTime, move: morph.moveTime, length: 0, missile: false, archer: false, fame: m.fame ?? 0, notor: m.notoriety ?? 0, gold: 0, mon: true };
        return { name: m.name, vuln: m.vulnerability, armored: !!m.armored, harm: s.harm, stars: s.stars ?? 0, atk: s.attackTime, move: s.moveTime, length: s.length ?? 0, missile: false, archer: false,
            fame: m.fame ?? 0, notor: m.notoriety ?? 0, gold: 0, mon: true };
    }
    const n = data.natives[id], s = best([n.light, n.dark], n.light);
    const morph = st ? morphOf(st, { kind: 'nat', id }) : null;
    if (morph) return { name: `${morph.name} (${n.name}, transformed)`, vuln: morph.vulnerability, armored: !!morph.armored, harm: morph.strength, stars: 0, atk: morph.attackTime, move: morph.moveTime, length: 0, missile: false, archer: false, fame: n.fameBounty ?? 0, notor: n.notorietyBounty ?? 0, gold: n.goldBounty ?? 0 };
    return { name: n.name, vuln: n.vulnerability, armored: !!n.armored, harm: s.harm, stars: s.stars ?? 0, atk: s.attackTime, move: s.moveTime, length: n.weapon?.length ?? 0,
        missile: !!n.weapon?.missile, archer: n.type === 'Archer', fame: n.fameBounty ?? 0, notor: n.notorietyBounty ?? 0, gold: n.goldBounty ?? 0 };
}

// A monster in the fight goes over to him (Control Bats, Guide Spider or Octopus): it leaves the sheet and is sent at his foes from the next round on.
// A Tremendous monster that had seized him lets go.
export function monsterJoins(st, data, den) {
    const c = st.combat;
    den.dead = true; den.controlled = true; den.assigned = false; den.engagedBy = null;
    for (const p of c.dens.filter(d => d.partOf === den.uid)) p.dead = true;
    if (den.pickedUp) { den.pickedUp = false; den.side = 'light'; }
    const hire = { uid: nextUid(st), kind: 'mon', id: den.id, dead: false };
    (c.hires ??= []).push(hire);
    return hire;
}
// It is free of him again (the spell ended or was broken): an ordinary monster where it stands, and, in a fight, a foe again from the next round.
export function monsterLeaves(st, data, m) {
    const c = st.combat;
    if (!c || c.ended || m.loc?.c !== c.at) return;
    for (const h of c.hires ?? []) if (h.kind === 'mon' && h.id === m.id) h.dead = true;
    let den = c.dens.find(d => d.kind === 'mon' && d.id === m.id);
    if (!den) den = addDen(st, data, { kind: 'mon', id: m.id });
    den.dead = false; den.controlled = false; den.assigned = false; den.engagedBy = null; den.pacified = false; den.bystander = false;
    for (const p of c.dens.filter(d => d.partOf === den.uid)) p.dead = false;
}
// A hireling or controlled monster is dead: out of the fight, out of the world, out of every spell it was in.
function hireDies(st, data, hire) {
    if (hire.kind === 'mon') {
        const m = st.mons.find(x => x.id === hire.id);
        if (m) { m.dead = true; m.hired = false; delete m.hiredBy; m.controlledUntil = null; m.hiredUntil = null; m.tie = null; m.loc = null; }
        targetGone(st, data, { kind: 'mon', id: hire.id });
    } else {
        const n = st.nats.find(x => x.id === hire.id);
        if (n) { n.dead = true; n.hired = false; delete n.hiredBy; n.loc = null; }
        targetGone(st, data, { kind: 'nat', id: hire.id });
    }
}

function hireStrikes(st, data, h, log) {
    const c = st.combat, hire = c.hires.find(x => x.uid === h.hire), den = c.dens.find(d => d.uid === h.den), hs = hireStats(data, hire.id, hire.kind, st), ds = denSide(st, data, den);
    let level = lvl(hs.harm) + (ds.armored ? Math.max(0, hs.stars - 1) : hs.stars);
    if (hs.missile) level += missileRoll(st, `${hs.name}'s missile roll`, hs.archer);
    if (level >= lvl(ds.vuln)) {
        if (den.dead) { log(`${hs.name} strikes the ${ds.name} in the same instant; the bounty was already paid.`); return; }
        den.dead = true; if (den.kind === 'mon' || den.kind === 'nat') lostTarget(st, data, { kind: den.kind, id: den.id });
        for (const p of c.dens.filter(d => d.partOf === den.uid)) p.dead = true;
        if (den.kind === 'mon') { const m = st.mons.find(x => x.id === den.id); m.dead = true; m.loc = null; }
        else if (den.kind === 'nat') { const n = st.nats.find(x => x.id === den.id); n.dead = true; n.loc = null; dropNativeGoods(st, data, n); }
        targetGone(st, data, { kind: den.kind, id: den.id });
        // the hirer collects the bounty, unmultiplied, and the kill does not count toward his daily total
        st.ch.fame += ds.fame ?? 0; st.ch.notoriety += ds.notor ?? 0;
        if (hire.kind === 'mon' || data.natives[hire.id]?.leader) st.ch.gold += ds.gold ?? 0;         // the gold bounty goes only to a hired leader's or a controlled monster's kill (8.7.3 b)
        log(`${hs.name} kills the ${ds.name} for you.`);
        c.eventful = true;
    } else log(`${hs.name} hits the ${ds.name} but does not kill it.`);
}

function denStrikesHire(st, data, den, hireUid, log) {
    const c = st.combat, hire = c.hires.find(x => x.uid === hireUid), hs = hireStats(data, hire.id, hire.kind, st), ds = denSide(st, data, den);
    let level = lvl(ds.harm) + (hs.armored ? Math.max(0, ds.stars - 1) : ds.stars);
    if (ds.attack === 'missile') level += missileRoll(st, `${ds.name}'s missile roll (at ${hs.name})`, ds.type === 'Archer');
    if (ds.attack === 'spell') level = 4;
    if (den.pickedUp) level = 99;                        // a red-side-up monster holds this native: its hit kills outright (8.4.7d.2, as against the hero)
    if (level >= lvl(hs.vuln)) {
        hire.dead = true;
        hireDies(st, data, hire);
        st.ch.notoriety -= hs.notor;
        log(`The ${ds.name} kills ${hs.name}; you lose ${hs.notor} Notoriety.`);
        c.eventful = true;
    } else {
        log(`The ${ds.name} hits ${hs.name} but fails to kill.`);
        // 8.4.7d.3: a Tremendous monster (or its head or club) that hits a native and does not kill it turns red side up, and (8.6.2) stays assigned to it
        const owner = den.kind === 'part' ? c.dens.find(d => d.uid === den.partOf) : den;
        if (hire.kind === 'nat' && owner && !owner.dead && redCapable(st, data, owner) && !owner.pickedUp) (c.toRedHire ??= []).push({ den: owner.uid, hire: hireUid });
    }
}

// What the spell handlers may ask of the combat (magic/bridge.js is a leaf module so that handlers do not import this file).
Object.assign(B, { namedTarget, denSide, slayDenizen, provoke, pitSweep, killMe, endCombat, missileRoll, dropNativeGoods, activeArmor, killReward, monsterLeaves });

// What a shared fight (battle.js) needs from this file: the pieces of one character's combat that it runs for each of them in turn.
export const parts = { introLines, addDen, nextMeeting, enterEncounter, chargeEncounter, afterMelee, endCombat, barredFromHero, nextUid, chitName, nameOfItem, startBattling, quietCasts, shiftChances, applyShift, encounterAction, attackTimeOf };
