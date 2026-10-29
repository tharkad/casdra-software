import { say, noteRoll, roll2, tally, clone, lvl } from './core.js';
import { withActor } from './party.js';
import { hirelings, monsterHires } from './hire.js';
import { legalBoxPlan, nativesIn, denizensIn, hireStats, denSide, payOrFight, drinksAction, choiceAction, encounterAction, encounterOptions, chooseWounds, chooseFatigue, meleeSetup, meleeEngaged, meleeReposition, meleeCollect, deliverBlows, meleeAfter, parts, charFoes, contested, charUid } from './combat.js';
import { expireDue } from './magic/fx.js';
import { energizePass } from './magic/energize.js';
import { worldFadesRoll } from './magic/combathide.js';
import { mayAttackHero } from './rules/mayAttackHero.js';
import * as hs from './hirestate.js';

// One fight in one clearing with several characters (docs/design/multiplayer-step3.md).
//
// The clearing's truth is `st.battle` (public): the round, the quiet counter, every denizen and which character's sheet it is on (`den.sheet`), the natives' groups and whom they fight,
// the hirelings by owner, and for each character where he stands in the round (`members`). Each character also has his combat view in `ch.today.combat` with the same shape as the
// one-character combat (`dens` with `assigned` meaning "on MY sheet", `pending` asks, `played`, ...), plus `shared: true`; the secret play of the Melee step is `ch.today.combat.play`.
// The single-hero combat code (combat.js) runs unchanged for one character at a time through `inSheet`, which lays the clearing over his view, runs the code, and takes the changes back.
// All dice are drawn here, in the order of the day's draw, never at answer time: a fight's result does not depend on the order in which simultaneous answers arrive.

// day.js fills these in (it imports this file, so this file cannot import it).
export const hooks = { died: null, runAway: null };

export const inBattle = st => !!st.battle;
const live = b => b.order.filter(id => b.members[id].state === 'in');
const nameOf = (st, id) => st.chars[id].name;

// ---- the clearing laid over one character's view ----
let bound = null;
const isDen = d => d.kind === 'mon' || d.kind === 'nat';
// What a denizen looks like from the sheet of `id`: on it, on another's, a native group standing by.
function derive(d, id) {
    if (isDen(d)) { d.assigned = d.sheet === id; d.elsewhere = !!d.sheet && d.sheet !== id; if (d.kind === 'nat') d.bystander = !d.battlers.includes(id); }
}
function bind(st, id) {
    const b = st.battle, c = st.chars[id].today.combat;
    c.dens = b.dens; c.round = b.round; c.quiet = b.quiet; c.at = b.at;
    c.hires = b.hires.filter(h => h.owner === id);
    c.battling = Object.fromEntries(Object.keys(b.battling).map(g => [g, b.battling[g].includes(id)]));
    if (b.charges) c.incoming = incoming(st, id);
    for (const d of b.dens) derive(d, id);
    return c;
}
// The characters charging him this round (pvp): their Move chit's time counts like a creature's move time at his Encounter action (8.3.7a).
const incoming = (st, id) => st.battle.charges.filter(x => x.on === id).map(x => ({ by: x.by, name: nameOf(st, x.by), time: x.time }));
function unbind(st, id, c) {
    const b = st.battle;
    for (const d of b.dens) {
        if (!isDen(d)) continue;
        const was = d.sheet === id, now = !!d.assigned;
        if (was && !now) d.sheet = null;
        else if (!was && now && !d.sheet) d.sheet = id;
        d.assigned = false; delete d.elsewhere;
        if (d.kind === 'nat') { if (d.bystander && d.battlers.includes(id)) d.battlers = d.battlers.filter(x => x !== id); delete d.bystander; }
    }
    for (const g of Object.keys(b.battling)) if (!b.battling[g].length) delete b.battling[g];
    const mine = c.hires ?? [];
    for (const h of mine) h.owner ??= id;
    b.hires = [...b.order.flatMap(oid => (oid === id ? mine : b.hires.filter(h => h.owner === oid))), ...b.hires.filter(h => !b.order.includes(h.owner))];
}
// Runs fn(view) as character `id` with the clearing laid over his view.
export function inSheet(st, id, fn) {
    if (bound) { if (bound === id) return fn(st.chars[id].today.combat); throw new Error(`the sheet of ${bound} is open`); }
    const prev = st.actor;
    st.actor = id;
    bound = id;
    const c = bind(st, id);
    try { return fn(c); } finally { bound = null; unbind(st, id, c); st.actor = prev; }
}
// The stored views of everyone in the fight are read-only copies of the clearing as each of them sees it (what a screen, a bot or a spell's `useful` reads between answers).
export function refresh(st) {
    const b = st.battle;
    if (!b) return;
    for (const id of b.order) {
        const c = st.chars[id].today.combat;
        if (!c?.shared) continue;
        c.round = b.round; c.quiet = b.quiet; c.at = b.at;
        c.dens = b.dens.map(d => { const e = { ...d }; derive(e, id); return e; });
        c.hires = b.hires.filter(h => h.owner === id).map(h => ({ ...h }));
        c.battling = Object.fromEntries(Object.keys(b.battling).map(g => [g, b.battling[g].includes(id)]));
        if (b.charges) c.incoming = incoming(st, id);
    }
}

// Runs fn as ANOTHER character from inside the sheet of the one that is open (a blow that falls on him): the clearing is put back from the open sheet, laid over his, and put back again.
export function asOther(st, id, fn) {
    if (!bound) return inSheet(st, id, fn);
    if (bound === id) return fn(st.chars[id].today.combat);
    const mine = bound;
    unbind(st, mine, st.chars[mine].today.combat);
    bound = null;
    try { return inSheet(st, id, fn); } finally { bound = mine; st.actor = mine; bind(st, mine); }
}
// Is there a fight to be had in a clearing with nothing else in it (pvp)? Two characters of different players stand there.
export const mayFight = (st, ids) => !!st.options?.pvp && new Set(ids.map(id => st.chars[id].owner)).size > 1;

// ---- starting ----
// `ids`: the characters standing in the clearing, in the order of the day's draw (ruling R-6; the first drawn leads, 8.3.2). Returns 'done' when the fight is already over.
export function startBattle(st, data, clearing, ids) {
    const b = st.battle = { at: clearing, round: 1, quiet: 0, step: 'meet', order: ids.slice(), members: {}, dens: [], hires: [], battling: {}, reveal: null, eventful: false, pvp: !!st.options?.pvp };
    if (b.pvp) { b.charges = []; b.kills = []; }                 // (character against character: the charges of this round, and who killed whom with what was taken; absent when the switch is off)
    for (const id of ids) {
        b.members[id] = { state: 'in', why: null, meet: 'todo', lure: 'todo', enc: 'todo', ready: false, done: false, melee: false };
        if (b.pvp) Object.assign(b.members[id], { charge: 'todo', charged: null, peace: null });
    }
    say(st, `${ids.map(id => nameOf(st, id)).join(' and ')} stand together at ${clearing} as the evening falls.`, 'combat', null, { who: null });
    for (const id of ids) {
        withActor(st, id, () => {
            const c = st.combat = { at: clearing, round: 1, quiet: 0, step: 'start', dens: [], battling: {}, events: [], melee: false, ended: false, ran: false, pays: [], rollFrom: st.rollSeq ?? 0, shared: true };
            c.hires = [
                ...hirelings(st).filter(n => n.loc?.c === clearing).map(n => ({ uid: parts.nextUid(st), kind: 'nat', id: n.id, dead: false, owner: id })),
                ...monsterHires(st).filter(m => m.loc?.c === clearing).map(m => ({ uid: parts.nextUid(st), kind: 'mon', id: m.id, dead: false, owner: id })),
            ];
            c.meetQueue = [...new Set(nativesIn(st, data, clearing).map(n => data.natives[n.id].group))];
        });
    }
    b.hires = ids.flatMap(id => st.chars[id].today.combat.hires);
    hs.combatStart(st, data, b);                                                             // (hireling rules: the hidden ones are noted, 8.1.4b)
    inSheet(st, ids[0], () => {
        for (const m of denizensIn(st, data, clearing)) {
            const den = parts.addDen(st, data, { kind: 'mon', id: m.id }); tally(st, `faced.${data.monsters[m.id].name}`);
            if (m.pacify?.length) { den.pacified = true; den.bystander = true; }               // (as startCombat: pacified, it stands by)
        }
    });
    for (const id of ids) inSheet(st, id, c => { c.intro = parts.introLines(st, data, c); });
    return advance(st, data);
}

// ---- the answers ----
// `a` is the action `{ type: 'combat', kind, ... }` of the character `st.actor`; his question has just been taken from the asks. Returns 'done' when the fight is over.
export function answer(st, data, a) {
    const id = st.ch.id, b = st.battle;
    if (!b.members[id] || b.members[id].state !== 'in') throw new Error(`${nameOf(st, id)} is not in this fight`);
    switch (a.kind) {
        case 'lure': lureAction(st, data, a); break;
        case 'melee': submitMelee(st, data, a); break;
        case 'pay': inSheet(st, id, () => payOrFight(st, data, a.pay)); break;
        case 'drinks': inSheet(st, id, () => drinksAction(st, data, a.buy)); break;
        case 'choice': inSheet(st, id, () => choiceAction(st, data, a.fight)); break;
        case 'encounter': inSheet(st, id, () => encounterAction(st, data, a)); break;
        case 'charge': chargeAction(st, data, a); break;
        case 'wounds': inSheet(st, id, () => chooseWounds(st, data, a.chits)); break;
        case 'fatigue': inSheet(st, id, () => chooseFatigue(st, data, a.chits, a.change ?? null)); break;
        case 'shift': throw new Error('Battle Bracelets and an Elusive Cloak shift when the plays are made (name it in the play); a shared fight does not stop to ask');
        case 'over': break;
        default: throw new Error('unknown combat action');
    }
    return advance(st, data);
}

// ---- the round, step by step ----
export function advance(st, data) {
    const b = st.battle;
    for (let guard = 0; guard < 400; guard++) {
        sweep(st, data);
        if (!live(b).length) return finish(st, data);
        switch (b.step) {
            case 'meet': {
                const id = live(b).find(i => b.members[i].meet !== 'done');
                if (!id) { b.step = 'lure'; newRound(st); break; }
                const m = b.members[id];
                if (m.meet === 'asked') return refresh(st);                              // waiting for his drinks or his pay
                m.meet = 'asked';
                inSheet(st, id, () => parts.nextMeeting(st, data));
                if (m.meet !== 'done') return refresh(st);
                break;
            }
            case 'lure': {
                if (live(b).some(id => b.members[id].lure === 'asked')) return refresh(st);
                const id = live(b).find(i => b.members[i].lure === 'todo');
                if (!id) { b.step = 'assign'; break; }
                const options = lurables(st, data, id), m = b.members[id];
                // alone and in plain sight everything comes to him anyway; there is nothing to choose
                if (!options.length || (live(b).length === 1 && !st.chars[id].hidden)) { m.lure = 'done'; break; }
                m.lure = 'asked';
                withActor(st, id, () => { st.pending = { type: 'combat-lure', round: b.round, lurable: options, mine: b.dens.filter(d => d.sheet === id && !d.dead).map(d => d.uid) }; });
                return refresh(st);
            }
            case 'assign': {
                randomAssign(st, data);
                if (b.pvp) { b.step = 'charge'; break; }                  // (the hirelings are sent after the characters have had their say about them)
                deployAll(st, data);
                b.step = 'encounter';
                break;
            }
            case 'charge': {
                // pvp (8.3.6): in turn, each may send his hirelings at a character and charge one himself; the rest of the hirelings go for creatures. Asked only when there is someone to charge.
                if (live(b).some(id => b.members[id].charge === 'asked')) return refresh(st);
                const id = live(b).find(i => b.members[i].charge === 'todo');
                if (!id) {
                    // everyone who was asked said he means no harm, and there is nothing else to fight: the evening is friendly and is over (R-18)
                    const said = live(b).filter(i => b.members[i].peace !== null);
                    if (said.length && said.every(i => b.members[i].peace === true)) { friendly(st, data); break; }
                    deployAll(st, data); b.step = 'encounter'; break;
                }
                const ask = chargeOptions(st, data, id);
                if (!ask) { b.members[id].charge = 'done'; break; }
                b.members[id].charge = 'asked';
                withActor(st, id, () => { st.pending = { type: 'combat-charge', round: b.round, ...ask }; });
                return refresh(st);
            }
            case 'encounter': {
                if (live(b).some(id => b.members[id].enc === 'asked')) return refresh(st);
                const id = live(b).find(i => b.members[i].enc === 'todo');
                if (!id) { startMelee(st, data); break; }
                b.members[id].enc = 'asked';
                inSheet(st, id, () => (b.members[id].charged ? parts.chargeEncounter(st, data) : parts.enterEncounter(st, data)));          // (a charger's Encounter action is the charge)
                if (!st.asks.some(x => x.who === id) && st.chars[id].today.combat?.ended !== true && b.members[id].enc === 'asked') b.members[id].enc = 'done';          // (nothing to ask him)
                break;
            }
            case 'melee': {
                if (live(b).some(id => b.members[id].melee && !b.members[id].ready)) return refresh(st);
                resolveMelee(st, data);
                b.step = 'harm';
                break;
            }
            case 'harm': {
                for (const id of live(b)) {
                    const m = b.members[id];
                    if (!m.done && !st.asks.some(x => x.who === id)) { const c = st.chars[id].today.combat; if (!c || c.step === 'resolve' || c.step === 'melee-wait') m.done = true; }       // (nothing left to ask him)
                }
                if (live(b).some(id => !b.members[id].done)) return refresh(st);
                endRound(st, data);
                break;
            }
            default: throw new Error('bad fight step ' + b.step);
        }
    }
    throw new Error('the fight did not settle');
}

// Everybody starts the round without a lure, an action or a play.
function newRound(st) {
    const b = st.battle;
    if (b.pvp) { b.charges = []; for (const h of b.hires) delete h.targetChar; }
    for (const id of b.order) {
        const m = b.members[id];
        if (m.state !== 'in') continue;
        m.lure = 'todo'; m.enc = 'todo'; m.ready = false; m.done = false; m.melee = false;
        if (b.pvp) { m.charge = 'todo'; m.charged = null; m.peace = null; }
        const c = st.chars[id].today.combat;
        if (c) { delete c.play; delete c.again; delete c.roundDone; delete c.charge; }
    }
}

// ---- someone has left: he ran, flew, fell, was carried away or has nothing more to do ----
function sweep(st, data) {
    const b = st.battle;
    for (const id of b.order) {
        const m = b.members[id];
        if (m.state !== 'in') continue;
        const c = st.chars[id].today.combat;
        if (c && !c.ended && !st.chars[id].dead) continue;
        const why = c?.why ?? (st.chars[id].dead ? 'died' : 'quiet');
        m.state = 'out'; m.why = why; m.enc = 'done'; m.done = true; m.ready = true; m.lure = 'done'; m.meet = 'done';
        if (c?.eventful) b.eventful = true;
        // what was on his sheet is nobody's again, and his hirelings are out of the fight (a hireling never fights on without its hirer here)
        for (const d of b.dens) {
            if (d.sheet === id) d.sheet = null;
            if (d.engagedBy && b.hires.some(h => h.uid === d.engagedBy && h.owner === id)) { d.engagedBy = null; if (d.pickedUp) { d.pickedUp = false; d.side = 'light'; } }
        }
        // pvp: what was aimed at him is no more; his hirelings that were sent at a character remember it if he falls (8.4.9p): unhired, they battle that character
        const avengers = b.pvp && why === 'died' ? b.hires.filter(h => h.owner === id && !h.dead && h.kind === 'nat' && h.targetChar && b.members[h.targetChar]?.state === 'in') : [];
        if (b.pvp) { b.charges = b.charges.filter(x => x.by !== id && x.on !== id); for (const h of b.hires) if (h.targetChar === id) delete h.targetChar; }
        b.hires = b.hires.filter(h => h.owner !== id);
        if (why === 'died') withActor(st, id, () => hooks.died(st, data));
        else if (why === 'ran') withActor(st, id, () => hooks.runAway(st, data));
        const text = { won: 'is out of the fight: nothing hostile is left', quiet: 'takes no further part', ran: 'breaks away from the fight', died: 'has fallen', flew: 'rises out of the fight', mist: 'melts away as mist', teleported: 'is carried away', peace: 'finds the fight ended by a hush' }[why] ?? 'leaves the fight';
        if (why !== 'won') say(st, `${nameOf(st, id)} ${text}.`, 'combat', null, { who: null });
        for (const a of st.asks.filter(x => x.who === id)) st.asks.splice(st.asks.indexOf(a), 1);
        for (const h of avengers) {
            const group = data.natives[h.id].group, foe = h.targetChar;
            if (b.battling[group]?.includes(foe) || b.members[foe]?.state !== 'in' || st.chars[foe].dead || st.chars[foe].today.combat?.ended) continue;          // (not on one who has fallen or left in the same round)
            inSheet(st, foe, () => parts.startBattling(st, data, group));
            say(st, `${nameOf(st, id)}'s ${group}, set free by his death, turn on ${nameOf(st, foe)}.`, 'combat', null, { who: null });
        }
    }
}

// ---- luring (8.3.4) ----
// What a character may draw onto his own sheet: any hostile creature that is not already there, even one on another character's sheet; not one that is held by a Tremendous monster's
// grip or by a hireling, calm, or a native group that fights nobody (that is attacked in the Melee step instead).
function lurables(st, data, id) {
    const b = st.battle;
    return inSheet(st, id, () => b.dens.filter(d => isDen(d) && !d.dead && d.sheet !== id && !d.pickedUp && !d.engagedBy && !d.pacified && !(d.kind === 'mon' && d.bystander) && !(d.kind === 'nat' && !d.battlers.length) && !parts.barredFromHero(st, data, d))
        .map(d => ({ uid: d.uid, name: denSide(st, data, d).name, from: d.sheet ?? null })));
}
function lureAction(st, data, a) {
    const id = st.ch.id, b = st.battle, m = b.members[id];
    if (b.step !== 'lure' || m.lure !== 'asked') throw new Error('nobody is asking you to lure now');
    const options = lurables(st, data, id), uids = [...new Set(a.dens ?? [])];
    for (const u of uids) if (!options.some(o => o.uid === u)) throw new Error('you cannot lure that creature onto your sheet');
    inSheet(st, id, c => {
        if (uids.length && st.ch.hidden) { st.ch.hidden = false; say(st, `${st.ch.name} gives himself away by luring.`, 'combat'); }
        for (const u of uids) {
            const d = c.dens.find(x => x.uid === u), from = d.sheet;
            d.assigned = true; d.elsewhere = false; d.sheet = id;                                   // (from the pool or from another sheet)
            if (d.kind === 'nat') parts.startBattling(st, data, data.natives[d.id].group);
            say(st, `${st.ch.name} lures the ${denSide(st, data, d).name} ${from ? `away from ${nameOf(st, from)}` : 'onto his sheet'}.`, 'combat');
        }
        if (!uids.length) say(st, `${st.ch.name} lures nothing.`, 'combat');
    });
    m.lure = 'done';
}

// ---- charging (8.3.6b) and sending hirelings at characters (8.3.6a): character against character only ----
// What he may do now: the characters he may go for, the Move chits he could charge with (strictly faster than every creature on his sheet and every charge already aimed at him, strong
// enough to carry him: the same chits that could run), and his hirelings. null when there is nobody to charge and nothing to send.
function chargeOptions(st, data, id) {
    const foes = charFoes(st, id), b = st.battle;
    if (!foes.length) return null;
    // with no creature left in the fight, a character may simply say he means no harm: if everyone who is asked says so, the evening is friendly and is over
    const peace = !b.dens.some(d => !d.dead && !d.pacified && d.kind !== 'part' && d.kind !== 'horse');
    return inSheet(st, id, c => {
        c.played = {}; c.asterisks = { move: 0, fight: 0, magic: 0 }; c.casts = [];            // (nothing has been played this round yet; the Encounter step starts the same way)
        const opt = encounterOptions(st, data);
        const chits = opt.pickedUp || st.ch.mist ? [] : opt.runChits.map(x => ({ id: x.id, type: x.type, strength: x.strength, time: x.time, effort: x.effort ?? 0, name: x.name ?? parts.chitName(x) }));
        const hires = c.hires.filter(h => !h.dead).map(h => ({ uid: h.uid, id: h.id, kind: h.kind, name: hireStats(data, h.id, h.kind, st).name }));
        if (!chits.length && !hires.length && !peace) return null;
        return { targets: foes.map(f => ({ id: f, name: nameOf(st, f), hidden: !!st.chars[f].hidden })), chits, hires, peace };
    });
}
// Nobody who was asked means harm and no creature is there: the characters part in peace (R-18: an evening of friends is skipped by agreement). The trade window of the day's end is step 4's.
function friendly(st, data) {
    const b = st.battle;
    say(st, 'Nobody here means harm: the evening passes in peace.', 'combat', null, { who: null });
    for (const id of live(b)) inSheet(st, id, () => parts.endCombat(st, data, 'peace'));
}
// Answer `{ kind: 'charge', act: 'charge' | 'pass', target?: id, chit?: id, deploy?: { [hireUid]: characterId } }`. A charge is his Encounter action: his Move chit is played in the Encounter step
// and his target for the Melee step is fixed (he may name only the one he charged); the charged character's Encounter chits must be faster than the chit (8.3.7a). Charging, or being named,
// reveals a hidden character (8.4.2b.5). Hirelings not sent at a character go for creatures as usual.
function chargeAction(st, data, a) {
    const id = st.ch.id, b = st.battle, m = b.members[id];
    if (b.step !== 'charge' || m.charge !== 'asked') throw new Error('nobody is asking you to charge now');
    const ask = chargeOptions(st, data, id) ?? { targets: [], chits: [], hires: [] }, deploy = a.deploy ?? {};
    for (const [uid, t] of Object.entries(deploy)) {
        if (!ask.hires.some(h => h.uid === uid)) throw new Error('you have no such hireling to send');
        if (!ask.targets.some(x => x.id === t)) throw new Error('you cannot send a hireling at that character');
    }
    let chit = null;
    if (a.act === 'peace') {
        if (!ask.peace) throw new Error('there are creatures here: you cannot say that nobody means harm');
        if (Object.keys(deploy).length) throw new Error('saying that you mean no harm and sending a hireling at someone do not go together');
        m.peace = true;
        say(st, `${st.ch.name} means no harm.`, 'combat');
        m.charge = 'done';
        return;
    }
    if (b.pvp) m.peace = false;
    if (a.act === 'charge') {
        if (!ask.targets.some(x => x.id === a.target)) throw new Error('you cannot charge that character');
        chit = ask.chits.find(x => x.id === (a.chit ?? ask.chits[0]?.id));
        if (!chit) throw new Error('you have no Move chit you can charge with: it must be faster than every creature on your sheet and every charge aimed at you');
    }
    inSheet(st, id, c => {
        for (const [uid, t] of Object.entries(deploy)) {
            const h = c.hires.find(x => x.uid === uid);
            h.targetChar = t;
            say(st, `${st.ch.name} sends his ${hireStats(data, h.id, h.kind, st).name} at ${nameOf(st, t)}.`, 'combat');
        }
        if (chit) {
            c.charge = { on: a.target, chit: chit.id };
            b.charges.push({ by: id, on: a.target, time: chit.time });
            m.charged = a.target;
            say(st, `${st.ch.name} charges ${nameOf(st, a.target)}.`, 'combat');
            if (st.ch.hidden) { st.ch.hidden = false; say(st, `${st.ch.name} gives himself away by charging.`, 'combat'); }
            if (st.chars[a.target].hidden) { st.chars[a.target].hidden = false; say(st, `${nameOf(st, a.target)}, who was hidden, is found and revealed.`, 'combat'); }
        }
    });
    m.charge = 'done';
}

// ---- random assignment (8.3.5) ----
// Each creature nobody has is dealt to one unhidden character in the clearing: each rolls two dice (the higher counts), the highest takes it, a tie rolls again among the tied. A creature
// no one can be given to (every character hidden, a Demon against a Pilgrim, natives that fight nobody) stays where it is.
function randomAssign(st, data) {
    const b = st.battle, cand = live(b).filter(id => !st.chars[id].hidden && !st.chars[id].mist);
    for (const d of b.dens) {
        if (!isDen(d) || d.dead || d.sheet || d.engagedBy || d.pickedUp || d.pacified || (d.kind === 'mon' && d.bystander)) continue;
        let pool = cand.filter(id => (d.kind === 'mon' ? mayAttackHero(data.monsters[d.id].family, st.chars[id].adv ?? []) : d.battlers.includes(id)));
        if (!pool.length) continue;
        const name = denSide(st, data, d).name;
        while (pool.length > 1) {
            const rolled = pool.map(id => { const r = roll2(st, 'combat.assign'); noteRoll(st, `Assignment roll for the ${name}`, r.dice, r.value, '', null, { who: id }); return { id, v: r.value }; });
            const best = Math.max(...rolled.map(r => r.v));
            pool = rolled.filter(r => r.v === best).map(r => r.id);
        }
        d.sheet = pool[0];
        say(st, `The ${name} is set on ${nameOf(st, pool[0])}.`, 'combat', null, { who: null });
    }
}

// ---- hirelings (8.3.6) ----
// Each hireling goes for the most dangerous creature (the hirer's own sheet or an unassigned one first); a creature set on by a hireling fights it instead of the character.
// A red-side-up monster holding a hireling stays on it (8.6.2); once that hireling is dead it lets go.
function deployAll(st, data) {
    const b = st.battle, c = { dens: b.dens };
    const hires = b.order.flatMap(id => b.hires.filter(h => h.owner === id));
    const held = new Map();
    for (const d of c.dens) {
        if (d.pickedUp && d.engagedBy && !d.dead) {
            if (hires.some(h => h.uid === d.engagedBy && !h.dead)) held.set(d.uid, d.engagedBy);
            else { d.pickedUp = false; d.side = 'light'; }
        }
    }
    for (const d of c.dens) d.engagedBy = held.get(d.uid) ?? null;
    const crew = hires.filter(x => !x.dead && !x.targetChar && ![...held.values()].includes(x.uid));
    for (const [dUid, hUid] of held) { const hire = hires.find(h => h.uid === hUid); hire.target = dUid; c.dens.find(d => d.uid === dUid).sheet = null; }
    const standingBy = d => (d.kind === 'nat' ? !d.battlers.length : !!d.bystander);
    for (const hire of crew) {
        const cand = c.dens.filter(d => isDen(d) && !d.dead && !standingBy(d) && !d.pacified && !d.pickedUp);
        if (!cand.length) break;
        const free = cand.filter(d => !d.engagedBy);
        const mine = free.filter(d => !d.sheet || d.sheet === hire.owner);
        const pool = mine.length ? mine : free.length ? free : cand;
        pool.sort((x, y) => lvl(denSide(st, data, y).harm ?? 'N') - lvl(denSide(st, data, x).harm ?? 'N'));
        const t = pool[0];
        t.engagedBy ??= hire.uid;
        t.sheet = null;
        hire.target = t.uid;
        hs.entered(st, data, hire);                                                         // (hireling rules: a hidden hireling sent at a creature is no longer hidden)
    }
}

// ---- the Melee step: everybody's secret plays (8.4.5), together ----
function startMelee(st, data) {
    const b = st.battle;
    b.step = 'melee'; b.reveal = null;                 // (what was shown last round stays on the table until the next plays are asked for)
    for (const id of live(b)) {
        const c = st.chars[id].today.combat;
        if (c.step !== 'melee-wait') continue;
        b.members[id].melee = true; b.members[id].ready = false;
        c.step = 'melee';
        withActor(st, id, () => { st.pending = { type: 'combat-melee', round: b.round }; });
    }
}

// The play is checked now, exactly as the one-character fight checks it, by trying it out on a copy of the game; nothing of it happens until everyone's is in.
function submitMelee(st, data, a) {
    const id = st.ch.id, b = st.battle, m = b.members[id], c = st.combat;
    if (b.step !== 'melee' || c.step !== 'melee' || !m.melee || m.ready) throw new Error('your plays are not being asked for now');
    if (a.charge != null) throw new Error('a charge is its own question (combat-charge), asked before the Encounter step');
    const p = {};
    for (const k of Object.keys(a)) if (!['type', 'kind', 'who', 'by', 'targetChar'].includes(k)) p[k] = a[k];
    if (a.targetChar != null) p.target = charUid(a.targetChar);                                 // (an id, as an alias of target: 'char:<id>')
    if (!b.pvp && typeof p.target === 'string' && /^(char|hire):/.test(p.target)) throw new Error('character against character is switched off in this game');
    const probe = clone(st);
    probe.actor = id;
    inSheet(probe, id, () => meleeSetup(probe, data, p));                                           // (throws the reason a play is illegal)
    c.play = p;
    m.ready = true;
}

// His play was legal when he made it. Plays are made together, and the plays of the characters before him in the draw (their spells, above all) have happened since: the creature he
// named may be dead or changed, a chit of his may have been wounded or turned. What can no longer be done is left out of his play, and he is told.
function setupPlay(st, data, c) {
    let p = { ...c.play };
    for (let guard = 0; guard < 8; guard++) {
        try { return meleeSetup(st, data, p); } catch (e) {
            const m = e.message, was = { ...p };
            if (/strike/.test(m)) { p.target = null; delete p.targets; }
            else if (/Fight chit|both/.test(m)) p.fightChit = null;
            else if (/Move chit|carry|asterisks|red side/.test(m)) { p.moveChit = null; if (/asterisks|red side/.test(m)) p.fightChit = null; }
            else if (/part|name the creature/.test(m)) delete p.parts;
            else if (/as many of the three boxes/.test(m)) p.boxes = legalBoxPlan(st, data, p);          // (8.4.5m: his plan was legal when he made it; a counter killed since can leave a box empty)
            else throw e;
            say(st, `${st.ch.name}'s play had to change (${m}).`, 'combat', null, { who: null });
            if (JSON.stringify(was) === JSON.stringify(p)) throw e;
        }
    }
    throw new Error('a play could not be settled');
}

const groupOwner = (b, d) => {
    const base = d.partOf ? b.dens.find(o => o.uid === d.partOf) : d;
    if (!base) return null;
    if (base.sheet) return base.sheet;
    if (base.engagedBy) return b.hires.find(h => h.uid === base.engagedBy)?.owner ?? null;
    return null;
};

function resolveMelee(st, data) {
    const b = st.battle, roster = live(b).filter(id => b.members[id].melee);
    if (!roster.length) return;
    const S = {}, cn = {};
    // what each has played is laid on the table together
    b.reveal = { round: b.round, plays: {} };
    for (const id of roster) {
        const p = st.chars[id].today.combat.play;
        b.reveal.plays[id] = { target: p.target ?? null, fightChit: p.fightChit ?? null, attackDir: p.attackDir ?? null, moveChit: p.moveChit ?? null, moveDir: p.moveDir ?? null, shieldDir: p.shieldDir ?? null, spell: p.spellAim ? true : false };
    }
    say(st, `The plays are shown: ${roster.map(id => nameOf(st, id)).join(', ')}.`, 'combat', null, { who: null });
    // 1. in the order of the draw: chits played, spells aimed and resolved, the target named, the creatures on his sheet placed
    for (const id of roster) {
        if (st.chars[id].dead || st.chars[id].today.combat?.ended) { S[id] = { stop: 'ended' }; continue; }
        S[id] = inSheet(st, id, c => { const r = setupPlay(st, data, c); if (b.pvp && !r.stop) r.atk = parts.attackTimeOf(st, data, r.X); return r; });
    }
    // 2. creatures fighting hirelings sit in a random box
    const first = roster.find(id => !S[id].stop);
    if (first) inSheet(st, first, () => meleeEngaged(st));
    // 3. one die and the tactics rolls for each sheet
    for (const id of roster) {
        if (S[id].stop) continue;
        const grp = d => groupOwner(b, d) === id;
        if (!b.dens.some(d => !d.dead && d.box != null && grp(d))) continue;
        inSheet(st, id, () => meleeReposition(st, data, S[id].log, grp));
    }
    // 4. hit determination for each, then every blow in one order
    const partsList = [];
    // (pvp: what a character strikes depends on what his target played, so every character's plays are final, shifts included, before any blow is worked out)
    const ext = id => {
        const attackers = roster.filter(o => o !== id && !S[o].stop && S[o].X.charTarget === id && S[o].X.fight).map(o => ({ uid: charUid(o), name: nameOf(st, o), atk: S[o].atk, box: null }));
        for (const h of b.hires) if (h.targetChar === id && !h.dead) attackers.push({ uid: h.uid, name: hireStats(data, h.id, h.kind, st).name, atk: hireStats(data, h.id, h.kind, st).atk ?? 9, box: null });
        const v = S[id].X.charTarget, cf = v && S[v] && !S[v].stop ? { name: nameOf(st, v), move: S[v].X.move?.time ?? null } : null;
        return { attackers, charFoe: cf };
    };
    const finalPlay = id => {                                     // (runs in his open sheet)
        let X = S[id].X;
        // (another character's spell may have undone his form since his own spells were resolved: a creature's blow is not struck when it is a creature no more)
        if ((X.fight?.morph || X.move?.morph) && !st.ch.morph) X = { ...X, fight: X.fight?.morph ? null : X.fight, move: X.move?.morph ? null : X.move };
        if (X.p.shift) { try { X = { ...X, p: parts.applyShift(st, data, X, parts.shiftChances(st, data, X, b.pvp ? ext(id) : null), X.p.shift) }; } catch (e) { S[id].log(`Your shift is refused: ${e.message}`); } }
        return X;
    };
    const duel = b.pvp && (roster.some(id => !S[id].stop && (S[id].X.charTarget || S[id].X.hireTarget)) || b.hires.some(h => h.targetChar && !h.dead));
    if (duel) for (const id of roster) if (!S[id].stop) inSheet(st, id, () => { S[id].X = finalPlay(id); });
    for (const id of roster) {
        if (S[id].stop) continue;
        inSheet(st, id, () => {
            const pt = meleeCollect(st, data, duel ? S[id].X : finalPlay(id), b.pvp ? S : null);
            pt.as = (vid, f) => asOther(st, vid, f);               // (a blow that falls on another character is carried out with his sheet open)
            partsList.push(pt);
        });
    }
    if (partsList.length) deliverBlows(st, data, partsList, (pt, f) => inSheet(st, pt.by, f), true);
    for (const pt of partsList) inSheet(st, pt.by, () => meleeAfter(st, data, pt));
    // 5. the harm: each one's fatigue and wounds are his own questions
    for (const id of roster) {
        if (st.chars[id].today.combat?.ended && !st.chars[id].dead) continue;
        inSheet(st, id, c => {
            if (S[id].stop === 'dead') { c.attackSpell = null; c.step = 'resolve'; return parts.afterMelee(st, data); }
            if (S[id].stop === 'ended') { c.attackSpell = null; return; }
            return parts.afterMelee(st, data);
        });
    }
}

// ---- the end of a round (8.8) ----
// Returns true when another round begins.
function endRound(st, data) {
    const b = st.battle, ids = live(b);
    inSheet(st, ids[0], () => expireDue(st, data, 'round-end'));
    if (st.fx?.length) for (const id of ids) inSheet(st, id, () => worldFadesRoll(st, data));            // World Fades: an unhidden character nobody is attacking tries to slip from sight
    const eventful = b.eventful || ids.some(id => st.chars[id].today.combat.eventful);
    const pinning = b.dens.some(d => d.pickedUp && !d.dead && d.sheet && b.members[d.sheet]?.state === 'in');   // a creature whose victim has left the fight pins nobody (B-2)
    b.quiet = !eventful && !pinning ? b.quiet + 1 : 0;
    b.eventful = false;
    for (const id of ids) st.chars[id].today.combat.eventful = false;
    const anyFoe = b.dens.some(d => !d.dead && !d.pacified && d.kind !== 'part' && d.kind !== 'horse') || contested(st);          // (pvp: two players' characters in one fight are foes to each other until two quiet rounds)
    const casters = ids.filter(id => st.chars[id].today.combat.again);
    const over = (!anyFoe && !casters.length) ? 'won' : b.quiet >= 2 && !casters.length ? 'quiet' : null;
    if (over) {
        for (const id of ids) inSheet(st, id, () => parts.endCombat(st, data, over));
        return false;
    }
    if (!anyFoe) for (const id of ids) if (!casters.includes(id)) inSheet(st, id, () => parts.endCombat(st, data, 'won'));
    // Disengagement: everything that is not assigned or picked up resets
    for (const d of b.dens) { d.box = null; d.noRetaliation = false; delete d.slain; }
    b.round += 1; b.step = 'lure';
    newRound(st);
    for (const id of live(b)) inSheet(st, id, () => energizePass(st, data, 'round'));
    return true;
}

// ---- the end ----
function finish(st, data) {
    const b = st.battle;
    say(st, `The fighting at ${b.at} is over.`, 'combat', null, { who: null });
    for (const id of b.order) st.chars[id].today.combat = null;
    st.asks = st.asks.filter(a => !b.order.includes(a.who) || !/^combat-/.test(a.pending.type));
    hs.combatEnd(st, data, b);                                                              // (hireling rules: the counters are turned to the side their status calls for, 8.8.6)
    st.battle = null;
    return 'done';
}

// ---- what a screen or a server needs to show the clearing ----
// The sheets of the fight as everybody may see them (public): who is in, what each has on his sheet, whether his play is in. Works on the state a seat is sent.
export function sheets(st, data = null) {
    const b = st.battle;
    if (!b) return [];
    return b.order.map(id => ({
        who: id, name: st.chars[id]?.name ?? id, state: b.members[id].state, why: b.members[id].why, ready: !!b.members[id].ready,
        ...(b.pvp ? { charging: b.members[id].charged ?? null, chargedBy: b.charges.filter(x => x.on === id).map(x => x.by) } : null),
        dens: b.dens.filter(d => d.sheet === id && !d.dead && isDen(d)).map(d => ({ uid: d.uid, kind: d.kind, id: d.id, tag: d.tag, name: data ? denSide(st, data, { ...d, id: d.id }).name : d.id, box: d.box })),
        hires: b.hires.filter(h => h.owner === id && !h.dead).map(h => ({ uid: h.uid, id: h.id, kind: h.kind, name: data ? hireStats(data, h.id, h.kind, st).name : h.id })),
    }));
}
