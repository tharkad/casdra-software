import { clone, die, roll2, int, say, lvl, shuffle, noteRoll, tally, chitWord } from './core.js';
import { hides, PEER, LOCATE, meetingResult } from './tables.js';
import { roadsFrom, isCave, isMountain, tileOf, numOf, nameOfClearing, pathKey, tileClearings, graph, tileName, mapEdgeClearings } from './world.js';
import { endOfTurn, blockers, resetChitsAtMidnight } from './summon.js';
import * as combat from './combat.js';
import * as battle from './battle.js';
import { makeItem, defOf, isWeaponCard, extraPhaseCommitment, nameOf, priceOf, dropHeavy, abandon, weightOf, carriedLevel, toggleItem, noteGain, noteFind, nextDayGear, gearLockedWhy } from './items.js';
import { lootFrom, lootSiteCard, groundPileAt, sitesHere, effortOptions, payEffort, applySearchResult, peerBlocked } from './search.js';
import { hasCurse, liftCursesAtChapel } from './effects.js';
import { tell } from './story.js';
import { runesTargets, readRunes, learnSpell } from './runes.js';
import { restartAfterDeath, restartChar } from './setup.js';
import { activeHorse } from './items.js';
import { extraActs, hasTreasure, noSunlight, oneDie, locateMod, modRoll, modNote } from './modifiers.js';
import { beginTrade, tradeAction } from './trade.js';
import { scoreGame, scoreParty } from './score.js';
import { canCastQuietly, enchantableChits, TYPE_COLOR, dayColors } from './spells.js';
import { flipTile, tileEnchantOptions } from './magic/colour.js';
import { expireDue, breakAllFrom, fxTags, fxList, HERO } from './magic/fx.js';
import { energizePass, deenergizePass, energizeWith } from './magic/energize.js';
import { activatePhase } from './magic/phase.js';
import { spawnCompanion, companionsOf, companionInfo, planCompanions, runCompanionTurns } from './magic/companion.js';
import { prophecyOn, startPro, phaseOptions, consume, noteCave } from './magic/prophecy.js';
import { magicSightOn, SIGHT_REPLACES, doMagicSight, takeChosen, perceive } from './magic/sight.js';
import { MORPH_REFUSED } from './magic/morph.js';
import { beginHire, hireAction, followHero, expireHires, dismissHire } from './hire.js';
import { planFlyError, canRecordFly, flySources, flyTiles, carries, startFlight, landHero, landingClearing } from './magic/fly.js';
import { ownedGold } from './magic/mist.js';
import { resolveWho, settleActor, ownerOf, withActor, isMulti as multi, livingIds, playerNameOf } from './party.js';
import * as meet from './meet.js';

// The day loop (rules digest 01 section 4): Birdsong plan, Sunrise, Daylight phases, Sunset, Evening combat, Midnight.
// A game is a plain object; apply(state, data, action) returns the next state and never mutates its input.

export const LAST_DAY = 28;
export const PHASES = { basic: 2, sunlight: 2 };

// ---- starting a day ----
// Birdsong. With one character this is the day it always was. With several, the realm's own chores happen once (the Hurricane Winds' creatures come down, the day is named) and each
// seat then begins its own day: a living character gets a plan to record, a dead one is asked about starting again (9.1.2). Nobody's day moves on until all of them have answered
// (the Birdsong barrier, see `planned`).
export function beginDay(st, data) {
    landDenizens(st, data);
    if (!multi(st)) return beginChar(st, data);
    st.period = 'birdsong';
    st.dayRec = null;
    delete st.follows;                                                 // (a day's Follow is over: docs/design/multiplayer-step4.md)
    say(st, `Day ${st.day} begins.`, 'day', null, { who: null });
    for (const id of st.order) withActor(st, id, () => beginChar(st, data));
    // Several seats starting again on the same morning (9.1.2b): the die decides who picks first. A seat may start again as the same character at once; one who wants ANOTHER character waits
    // for those ahead of him to answer (restartChar), so that two cannot grab the same one by being quick. The order is on the table.
    const dead = st.asks.filter(a => a.pending.type === 'restart');
    if (dead.length > 1) { const order = shuffle(st, dead.map(a => a.who), 'order.dead'); for (const a of dead) a.pending.pickOrder = order.slice(); say(st, `${order.map(id => playerNameOf(st, id)).join(', then ')} start again, in that order of choosing a character.`, 'day', null, { who: null }); }
}

// One character's Birdsong chores: he is the actor.
export function beginChar(st, data) {
    const several = multi(st);
    if (several && st.ch.gone) {                                       // he left the map (R-21): no plan, no restart; his score was fixed the moment he went
        st.plan = null; st.turn = null; st.combat = null; st.pending = null;
        st.ch.today.stage = 'gone';
        return;
    }
    if (several && st.ch.dead) {                                       // the seat's character died yesterday or earlier: it must say who starts now
        st.plan = null; st.turn = null; st.combat = null;
        st.ch.today.stage = 'dead';
        st.pending = restartAsk(st, data);
        return;
    }
    if (several) { const t = st.ch.today; t.stage = 'plan'; delete t.noTurn; delete t.blockSaid; delete t.blockVote; delete t.followVote; delete t.voidFollow; }
    if (st.ch.flying) landHero(st, data, 'You come down');            // blown away by Hurricane Winds, or flown out of a fight: down before the plan is recorded (7.3.3b)
    st.period = 'birdsong';
    st.plan = null;
    st.turn = null;
    st.ch.hiddenEnemies = false;
    st.ch.findEnemies = {};                                           // Magic Sight's partial Find Enemies (counters, treasures, spells): for today only
    st.ch.killsToday = 0;
    if (st.ch.berserk) delete st.ch.berserk;      // the Berserk chit's rage ends at midnight (RealmSpeak removes the enhanced vulnerability then); the key exists only while it is on
    energizePass(st, data, 'dawn');                                   // Permanent spells whose colour fills the land today wake (4.6.7h)
    // What the day just ended changed, for the morning review (the report reads st.report; nothing in the rules does).
    if (st.mark) st.report = { day: st.mark.day, fame: st.ch.fame - st.mark.fame, notoriety: st.ch.notoriety - st.mark.notoriety, gold: ownedGold(st) - st.mark.gold };
    st.mark = { day: st.day, fame: st.ch.fame, notoriety: st.ch.notoriety, gold: ownedGold(st) };
    if (!several) say(st, `Day ${st.day} begins.`, 'day');
    // Phantasm (and any other companion): the piece appears beside him at Birdsong and gets a turn of its own to record
    st.companions = [];
    for (const f of fxList(st, { spell: 'phantasm', target: HERO })) spawnCompanion(st, data, { kind: 'phantasm', fx: f.id });
    st.pending = { type: 'plan' };
    if (st.companions.length) st.pending.companions = companionInfo(st, data);
    if (prophecyOn(st)) st.pending.prophecy = true;                  // Prophecy: no turn to record; he chooses each phase as it comes (action 'pick')
}

// The question a dead character's seat is asked at the next Birdsong: new goals for the weeks left (9.1.2, 10.E.2.5) and, if the seat likes, a different character that nobody else
// is using. The calendar does not move; the barrier waits for the answer and then for his new plan.
function restartAsk(st, data) {
    const d = st.ch.death ?? {};
    const taken = new Set(st.order.filter(id => id !== st.ch.id));
    return { type: 'restart', death: d, budget: Math.max(2, Math.ceil(((st.lastDay ?? LAST_DAY) - (st.day - 1)) / 7) + 1), characters: Object.keys(data.characters).filter(id => !taken.has(id)) };
}

// Creatures that Hurricane Winds carried off land at the start of the day, before the Monster Roll and the plan: a die picks a clearing of the tile, rolled again
// when the tile has no clearing of that number (7.3.3).
function landDenizens(st, data) {
    for (const o of [...st.mons, ...st.nats]) {
        if (!o.loc?.flying) continue;
        const tile = o.loc.tile, nums = tileClearings(st, data, tile).map(numOf);
        let n = null;
        for (let k = 0; k < 40 && !nums.includes(n); k++) n = die(st, 'setup.start.clearing');
        if (!nums.includes(n)) n = nums[0];
        o.loc = { c: tile + n };
        say(st, `${o.id in data.monsters ? data.monsters[o.id].name : data.natives[o.id].name} comes down in clearing ${n} of the ${tileName(tile)}.`, 'monster');
    }
}

// The pony (7.3.2b.3, 6.2.4c; ruling R1 in docs/rules-spec/rulings/ch7-day.md): for each Move phase he gets from other sources he may record a second Move phase caused by the
// pony, and the pony Moves must STRICTLY alternate with the other Moves in the order they are recorded: a pony Move needs the Move recorded just before it (other phases may
// come between) to be one that the pony did not cause, and the pony cannot cause the first Move of the turn. So ordinary, pony, ordinary, pony is fine; ordinary, ordinary, pony,
// pony is not.
// A slot may say which Moves are the pony's: `{ act: 'move', to, via: 'pony' }` (6.2.4d: he notes what caused each extra phase). Those are taken as written and checked. Without
// a note the engine picks the pony Moves itself, only as many as the plan needs (the Moves beyond his ordinary phases) and always the second, fourth ... Move of the turn
// that is not already an extra phase of another source, which is the one way the alternation can hold.
// `slots` may hold blanks. Returns { on, at: [slot indexes of the pony's Moves], errors: [{ i, text }] }.
function ponyPlan(st, data, slots, ph0) {
    const h = activeHorse(st), on = !!h && data.horses[h.id]?.kind === 'pony' && !ph0.startsInCave;          // (a horse cannot be active in a cave: 6.2.2c.1)
    const live = s => s && s.act !== 'nothing';
    const noted = slots.map((s, i) => (live(s) && s.act === 'move' && s.via === 'pony' ? i : -1)).filter(i => i >= 0);
    const errors = [];
    if (!on) {
        for (const i of noted) errors.push({ i, text: 'you have no pony active to cause that Move.' });
        return { on, at: [], errors };
    }
    const moves = slots.map((s, i) => (live(s) && s.act === 'move' ? i : -1)).filter(i => i >= 0), tagged = new Set(noted);
    // how many ordinary phases are taken without the pony's Moves: whatever is neither a noted pony Move nor swallowed by another source's extra phase
    const left = [...ph0.extras], plain = new Set();
    slots.forEach((s, i) => {
        if (!live(s) || tagged.has(i)) return;
        const k = left.indexOf(s.act);
        if (k >= 0) left.splice(k, 1); else plain.add(i);
    });
    let need = Math.max(0, plain.size - (ph0.base + (ph0.lantern ? 1 : 0)));
    let prev = false;
    moves.forEach((i, j) => {
        if (!tagged.has(i) && need > 0 && j > 0 && !prev && plain.has(i)) { tagged.add(i); need--; }
        prev = tagged.has(i);
    });
    // the alternation, for the notes the player wrote (the ones the engine added cannot break it)
    prev = false;
    moves.forEach((i, j) => {
        if (tagged.has(i)) {
            if (j === 0) errors.push({ i, text: 'the pony cannot cause the first Move in the turn.' });
            else if (prev) errors.push({ i, text: 'Move phases caused by the pony must alternate with other Move phases.' });
        }
        prev = tagged.has(i);
    });
    return { on, at: [...tagged].sort((a, b) => a - b), errors };
}

// How many phases the day will give him, given what he plans.
export function phasesFor(st, data, slots) {
    const startsInCave = !st.ch.onRoad && isCave(st, data, st.ch.at);        // fleeing out of a cave leaves him on the road: a full day (8.3.8 d.2)
    const intoCave = slots.some(s => s?.act === 'move' && isCave(st, data, s.to));
    const sunlight = !startsInCave && !intoCave && !noSunlight(st);          // the Dwarf's Short Legs: no sunlight phases ever
    // A working horse in use, and some treasure cards, give one more phase each, restricted to one activity.
    const extras = extraActs(st, data, { startsInCave, intoCave });
    // Blazing Light (Day, cast in a cave): in the Birdsong after it was cast, a character who starts the day in that cave clearing may record one more phase, for any activity
    const blazing = startsInCave && !!st.ch.at && fxTags(st, { kind: 'clearing', id: st.ch.at }, 'extraPhase').length > 0;
    const base = PHASES.basic + (sunlight ? PHASES.sunlight : 0) + (blazing ? 1 : 0);
    // The Shielded Lantern: one more phase for any normal activity; he must be in a cave clearing when it starts or the activity is cancelled (the card's own text)
    const lantern = hasTreasure(st, 'shielded-lantern');
    const pony = ponyPlan(st, data, slots, { base, lantern, extras, startsInCave });          // the pony's Move phases depend on the Moves he records (an empty plan: none)
    return { total: base + (lantern ? 1 : 0) + extras.length + pony.at.length, base, lantern, sunlight, extras, extra: extras.length, blazing, pony: pony.at.length, ponyOn: pony.on, ponyAt: pony.at, ponyErrors: pony.errors, refused: st.ch.morph ? Object.keys(MORPH_REFUSED) : [] };       // (as a creature he cannot Rest, Trade, Hire or Enchant)
}

// Which kind of phase each recorded activity uses (rule 6.2.4 a): an extra phase takes only its own activity and may be recorded anywhere; every other
// activity uses the next ordinary phase, the first two being basic and the rest sunlight. Returns the kinds and any errors.
export function planKinds(st, data, slots) {
    const ph = phasesFor(st, data, slots);
    const left = [...ph.extras], kinds = [], errors = [];
    let regular = 0;
    for (const e of ph.ponyErrors) errors.push(`Phase ${e.i + 1}: ${e.text}`);
    slots.forEach((s, i) => {
        if (!s || s.act === 'nothing') { kinds.push(null); return; }
        if (i >= ph.total) { errors.push(`Phase ${i + 1} is not available today.`); kinds.push('over'); return; }
        if (ph.ponyAt.includes(i)) { kinds.push('extra'); return; }               // a Move the pony causes: an extra phase, for a Move only
        const k = left.indexOf(s.act);
        if (k >= 0) { left.splice(k, 1); kinds.push('extra'); }
        else {
            regular++;
            if (regular <= PHASES.basic) kinds.push('basic');
            else if (ph.blazing && regular === ph.base) kinds.push('blazing');          // the extra phase of the Blazing Light: any activity, but only while he is still in that clearing
            else if (regular <= ph.base) kinds.push('sunlight');
            else if (ph.lantern && regular === ph.base + 1) kinds.push('lantern');          // the Shielded Lantern's phase: any activity, only worth recording if he will be in a cave then
            else {
                kinds.push('over');
                const only = [...new Set([...ph.extras, ...(ph.ponyOn ? ['move'] : [])])];
                errors.push(only.length ? `Phase ${i + 1}: only ${ph.base} ordinary activities today; the extra phase can be used only for ${only.join(' or ')}.` : `Phase ${i + 1} is not available today.`);
            }
        }
        if (s.act === 'move' && !s.to) errors.push(`Phase ${i + 1}: choose where to move.`);
        // (ruling S6, Mike 2026-10-26, 4.6.9c and 7.3.3a.1: an activity he cannot do is RECORDED anyway and cancelled when he tries it; only the form of the record is checked here.
        //  The screen can still warn: `validatePlan(...).warnings`)
        if (s.act === 'fly' && !s.to) errors.push(`Phase ${i + 1}: choose a tile to fly to.`);
        else if (s.act === 'fly' && !canRecordFly(st, data)) errors.push(`Phase ${i + 1}: Fly is an enhanced activity: you need a spell or a card that lets you fly to record it (6.2.1a).`);
        if (s.act === 'follow') { const e = meet.followPlanError(st, slots, i, st.ch); if (e) errors.push(`Phase ${i + 1}: ${e}`); }
    });
    return { kinds, errors, total: ph.total, base: ph.base, lantern: ph.lantern, sunlight: ph.sunlight, extras: ph.extras, pony: ph.pony, ponyAt: ph.ponyAt };
}

// `warnings`: phases that are recorded but will be cancelled when he tries them (as mist anything but a Move or Hide; a Fly phase with nothing to fly with or too far away, 4.6.9c, 7.3.3a.1):
// the plan is accepted (ruling S6), a screen may tell him.
export function validatePlan(st, data, slots, strict = false) {          // strict: the warnings count as errors (the computer players never record a phase they know will be lost)
    const v = planKinds(st, data, slots);
    const warnings = [];
    slots.forEach((s, i) => {
        if (!s) return;
        if (s.act === 'fly' && s.to) { const e = planFlyError(st, data, slots, i); if (e) warnings.push({ i, text: `Phase ${i + 1}: ${e}` }); }
        if (st.ch.mist && s.act !== 'move' && s.act !== 'hide' && s.act !== 'nothing') warnings.push({ i, text: `Phase ${i + 1}: as mist you can only move and hide.` });
    });
    return { total: v.total, sunlight: v.sunlight, errors: strict ? [...v.errors, ...warnings.map(w => w.text)] : v.errors, kinds: v.kinds, warnings };
}

// A plan comes from outside the engine (a phone, a server): before it is recorded every slot must be nothing or a { act } whose names are text. One that is not (a move "to" nothing a clearing could be
// called) used to be recorded and then threw every time its phase was played, so that the seat could do nothing again, and in a shared game the table waits for every seat (SOAK-3).
const SLOT_TEXT = ['act', 'to', 'table', 'who'];
function slotShapeError(slots) {
    if (!Array.isArray(slots)) return 'A plan is a list of phases.';
    if (slots.length > 16) return 'A plan has at most sixteen phases.';
    for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s == null) continue;
        if (typeof s !== 'object' || Array.isArray(s)) return `Phase ${i + 1}: choose an activity.`;          // ({} is an empty phase, as the games on record have it)
        for (const k of SLOT_TEXT) if (s[k] != null && (typeof s[k] !== 'string' || s[k].length > 40)) return `Phase ${i + 1}: the ${k === 'to' ? 'place to move to' : k === 'who' ? 'character to follow' : k} must be a name.`;
    }
    return null;
}

function submitPlan(st, data, slots, companions = null, choose = false) {
    { const bad = slotShapeError(slots); if (bad) throw new Error(bad); }
    planCompanions(st, data, companions ?? {});                    // (throws before anything changes)
    st.planFree = prophecyOn(st) && (choose || !slots?.length);    // Prophecy: no recorded plan (an empty one, or `choose`) means he picks each phase as it comes; a recorded plan is simply played
    if (st.planFree) {
        // Prophecy: he ignores his recorded turn and chooses each phase as it comes. Slots sent with `choose` are a suggestion that autoplay follows.
        st.planBase = 4; st.planBlazing = null; st.planKinds = null;
        st.ch.arrivedFrom = null;
        st.plan = []; st.planFull = (slots ?? []).slice();
        return planned(st, data);
    }
    const v = validatePlan(st, data, slots);
    if (v.errors.length) throw new Error(v.errors[0]);
    const ph = phasesFor(st, data, slots.filter(Boolean));
    st.planBase = ph.base;
    st.planBlazing = ph.blazing ? st.ch.at : null;
    st.planKinds = v.kinds;
    st.ch.arrivedFrom = null;                      // a new day: he has not moved into any clearing yet
    st.plan = slots.slice(0, v.total).map(s => s ? { ...s } : null);
    while (st.plan.length < v.total) st.plan.push(null);
    st.planFull = slots;
    planned(st, data);
}

// His plan is recorded. With one character the sun rises at once. With several, plans are secret and simultaneous (6.2.3): a recorded plan waits until every living character has
// recorded one and every dead one has started again; the last to answer lets the day go on.
function planned(st, data) {
    if (!multi(st)) return sunrise(st, data);
    st.ch.today.stage = 'planned';
    if (st.order.every(id => ['planned', 'gone'].includes(st.chars[id].today.stage))) sunrise(st, data);
}

// ---- sunrise: the Monster Roll ----
// Once a day, for everybody: the Monster Roll, the week's regeneration and the day's colour (6.3). With several characters the Attention chits are then drawn at random one by one (7.1.1)
// and that order is the order of the whole day's turns.
function sunrise(st, data) {
    const table = multi(st) ? { who: null } : null;              // (a line or a roll of the whole table belongs to no one character)
    st.period = 'sunrise';
    st.prowl = die(st, 'day.prowl');
    noteRoll(st, 'Monster roll', [st.prowl], st.prowl, `row ${st.prowl} prowls today`, null, table);
    st.rolls.at(-1).tale = tell.wilds(st, data);                       // the story voice says what prowls, not which row
    const magic = dayColors(st.day, st.lastDay ?? 28), week = st.day % 7 === 0 ? regenerate(st, data) : null;
    say(st, `Dawn of day ${st.day}: row ${st.prowl} prowls.${magic.length ? ` The land is filled with ${magic.join(' and ')} magic until midnight.` : ''}`, 'day', tell.dawn(st, data, { magic }), table);
    if (week) say(st, `Regeneration: row ${st.prowl} creatures return to their homes.`, 'day', tell.weekEnd(st, data, week), table);
    if (multi(st)) { const { gone } = meet.declareFollows(st); drawChits(st, gone); return nextTurn(st, data); }
    beginTurn(st, data);
}

// His chit is drawn and his turn begins: he is no longer hidden (7.1.2: a character becomes unhidden when his own chit is drawn; so on day 1 everyone is, in turn).
function beginTurn(st, data) {
    st.ch.hidden = false;
    st.period = 'daylight';
    st.turn = { i: 0, climb: null, blocked: false, results: [], movedHere: null, auto: false, base: st.planBase ?? 4, kinds: st.planKinds ?? null };
    if (companionsOf(st).length) runCompanionTurns(st, data);          // a Phantasm takes its turn just before the hero
    if (st.planFree) {
        st.turn.pro = startPro(st, data); st.turn.kinds = [];
        if (st.turn.pro.blazing) st.planBlazing = st.ch.at;
        st.pending = proPending(st, data);
    } else st.pending = { type: 'phase', i: 0 };
}

// ---- the shared Daylight (several characters) ----
// 7.1.1: the Attention chits of the characters are mixed and drawn at random one at a time; that is the order of the Daylight turns (and, ruling R-6, of the evening). The draw is an
// event the table can see: `st.dayRec = { day, order, i, first }` for today and `st.draws` for every day so far (`i` points at the turn being played). The first character drawn
// "leads" the day (8.3.2). It uses the game's own generator, after the Monster Roll, so the same seed and the same plans give the same draw.
function drawChits(st, gone = []) {
    const ids = livingIds(st).filter(id => !st.follows?.[id] && !gone.includes(id)), order = ids.length > 1 ? shuffle(st, ids, 'order.turn') : ids.slice();       // (a follower has no chit: his turn is his guide's; a cancelled follow has no turn)
    st.dayRec = { day: st.day, order, i: 0, first: order[0] ?? null };
    if (st.follows) st.dayRec.follow = Object.entries(st.follows).reduce((m, [f, g]) => { (m[g] ??= []).push(f); return m; }, {});
    (st.draws ??= []).push({ day: st.day, order: order.slice() });
    if (st.draws.length > 60) st.draws.shift();
    const names = order.map(id => st.chars[id].name);
    say(st, names.length ? `The chits are drawn: ${names.map((n, k) => (k === 0 ? `${n} first` : n)).join(', then ')}.` : 'Nobody has a chit to draw today.', 'day', null, { who: null });
}

// The next character in the drawn order takes his whole turn; when nobody is left the sun sets.
function nextTurn(st, data) {
    const rec = st.dayRec;
    while (rec.i < rec.order.length && st.chars[rec.order[rec.i]].dead) rec.i++;
    if (rec.i >= rec.order.length) return sunsetAll(st, data);
    return withActor(st, rec.order[rec.i], () => {
        st.ch.today.stage = 'turn';
        say(st, `${st.ch.name}'s chit is drawn.`, 'day');
        meet.guideStarts(st, st.actor);                                 // his followers are unhidden with him (7.11.4)
        if (st.ch.today.noTurn) return noTurn(st, data);
        beginTurn(st, data);
    });
}

// Blocked before his chit was drawn (7.12.4): he has no turn today, takes nothing from it and calls nothing to him. He is told at the end of the turn he did not have.
function noTurn(st, data) {
    st.ch.hidden = false;
    st.period = 'daylight';
    say(st, `${st.ch.name} was caught before his turn began: he has no turn today.`, 'block');
    const here = st.ch.at;
    st.turn = { i: 0, climb: null, blocked: true, results: [], movedHere: null, auto: false, base: st.planBase ?? 4, kinds: st.planKinds ?? null, noTurn: true };
    st.turn.end = { at: here, tile: here ? tileOf(here) : null, prowl: st.prowl, arrivals: [], flipped: [], chits: [], natives: [] };
    st.turnEnd = { ...st.turn.end, day: st.day, blocked: true, blockers: [], closedIn: [], plan: [], hidden: false, companions: [], noTurn: true };
    meet.releaseFollowers(st, data);                                   // (his followers had nothing to follow)
    st.pending = { type: 'turn-end' };
}

// Monsters that came into a clearing when someone's turn ended block every unhidden character standing there (7.12.3, 7.12.3a): a character whose chit is not yet drawn loses his
// whole turn; one who has played already was seen and nothing more. Monsters that were in a clearing already block only the one whose phase just ended (7.12.3b), and a hidden
// character is not blocked (7.12.2b, 7.13.5).
function blockOthers(st, data, res) {
    const rec = st.dayRec;
    for (const id of rec.order.slice(rec.i + 1)) {
        const c = st.chars[id];
        if (c.dead || c.hidden || c.onRoad || c.flying || c.mist || !c.at) continue;
        const here = res.arrivals.filter(a => a.to === c.at);
        if (!here.length) continue;
        c.today.noTurn = true;
        say(st, `${here.map(a => a.name).join(', ')} close in on ${c.name} before his chit is drawn: he is blocked and will have no turn today.`, 'block', null, { who: id });
    }
}

// His turn is over and acknowledged (or he fell): the next chit is drawn.
function turnDone(st, data) {
    meet.lapsePhaseOffers(st, 'the turn is over');
    meet.releaseFollowers(st, data);                                   // following stops when the guide's turn is over (7.11.8)
    st.ch.today.stage = 'done';
    st.dayRec.i++;
    return nextTurn(st, data);
}

// Prophecy: the question for the phase to come, or null when no phase is left.
function proPending(st, data) {
    const o = phaseOptions(st, data);
    return o.acts.length ? { type: 'phase-pick', ...o, tables: searchTables(st, data) } : null;
}
// He picks (or the autoplay picks for him from the suggested plan): use up the phase it takes and run it. `soft`: a suggestion that does not fit does nothing instead of failing.
function pickPhase(st, data, slot, { soft = false } = {}) {
    const t = st.turn, o = phaseOptions(st, data);
    if (!prophecyOn(st)) {                                         // broken before he finished his turn: instantly blocked
        t.blocked = true; st.ch.hidden = false;
        say(st, 'Your Prophecy is broken: you are stopped and the rest of your turn is lost.', 'block');
        return endDaylight(st, data);
    }
    let choice = slot && slot.act !== 'nothing' ? o.acts.find(a => a.act === slot.act) : null;
    if (slot && slot.act !== 'nothing' && !choice) { if (!soft) throw new Error(`${slot.act} is not an activity you can do in this phase`); slot = null; }
    if (choice && slot.act === 'move' && !slot.to) { if (!soft) throw new Error('choose where to move'); choice = null; slot = null; }
    if (choice && slot.act === 'move' && !soft && !o.moves.includes(slot.to)) throw new Error('there is no road from here to that clearing');       // (the picker lists the roads he may take)
    if (!choice) { choice = o.acts.find(a => a.kind !== 'extra') ?? o.acts[0]; slot = null; }   // nothing chosen: the phase is spent doing nothing
    consume(t.pro, choice);
    t.kinds[t.i] = choice.kind;
    st.plan[t.i] = slot ? { ...slot } : null;
    runPhase(st, data);
}

function regenerate(st, data) {
    // The prowling row goes back to its starting boxes, even the slain (digest 05 section 5.3).
    let back = 0, ghosts = false;
    const revived = [];                       // the slain who come back, for the telling
    for (const m of st.mons) {
        const def = data.monsters[m.id];
        if (m.hired || m.absorbed) continue;                // (an absorbed monster is out of play inside a spell)
        if (def.family === 'Ghost') { if (m.loc?.c !== st.ghostsAt || m.dead) { m.loc = { c: st.ghostsAt }; if (m.dead) revived.push(def.name); m.dead = false; back++; ghosts = true; } continue; }
        if (def.homeRow !== st.prowl) continue;
        if (m.loc?.c || m.dead) { m.loc = { box: def.homeBox }; if (m.dead) revived.push(def.name); m.dead = false; back++; }
    }
    for (const n of st.nats) {
        const def = data.natives[n.id], g = data.groups[def.group];
        if (n.hired || g.homeRow !== st.prowl) continue;
        if (n.dead || n.loc?.c) {
            if (n.dead) revived.push(def.name ?? n.id);
            n.dead = false; n.horseDead = false;
            n.loc = g.garrison ? { c: st.garrisonAt[g.garrison] } : { box: g.id };
            back++;
        }
    }
    return { revived, ghosts };                  // the caller tells it, after the dawn
}

// ---- daylight: one phase at a time ----
function runPhase(st, data) {
    const t = st.turn, i = t.i, slot = st.plan[i];
    if (t.fresh) delete t.fresh;                  // (what he came by before this phase began was his to arrange at its start: see gearPause)
    if (multi(st)) meet.lapsePhaseOffers(st, 'the phase has begun');
    if (multi(st) && meet.beforeActivity(st, data) === 'wait') return;      // the followers may stop now (7.11.5); the phase goes on when they have answered
    const r = executeSlot(st, data, slot, i);
    if (r === 'wait') return;                     // a decision is pending
    finishPhase(st, data, r);
}

// Backing out of a Trade or Hire before anything was dealt: the phase has not been spent, and he is back at the prompt where he pressed the button.
// Once he has sold, bought drinks or rolled for a deal, the phase is committed and has to be finished.
function cancelDealing(st, data, p) {
    const fresh = (p.type === 'trade' && !p.mode && !(p.sold?.length) && !p.drinks) || p.type === 'hire';
    if (!fresh) throw new Error('you have already begun dealing: finish this phase');
    const t = st.turn; t.auto = false;
    st.pending = t.pro ? proPending(st, data) : { type: 'phase', i: t.i };
    return st;
}

function finishPhase(st, data, text) {
    const r = finishPhase0(st, data, text);
    if (multi(st) && st.turn) meet.syncHidden(st);                     // a Hide result, a block: the guide's followers share his hidden status (7.11.6b)
    return r;
}
function finishPhase0(st, data, text) {
    const t = st.turn;
    t.results[t.i] = text;
    say(st, `Phase ${t.i + 1}: ${text}`, 'phase', tell.phase(st, text));
    if (t.pro && !prophecyOn(st)) t.proBroken = true;              // broken, or suspended by Protection from Magic (spec question 9): blocked unless the turn is over
    expireDue(st, data, 'phase-end');
    energizePass(st, data, 'phase');
    if (st.ch.dead) return died(st, data);
    if (gearPause(st)) return;                     // the phase is not complete until he has said what to do with what he came by (4.3.2); `continue` goes on at finishPhaseEnd
    return finishPhaseEnd(st, data);
}
// 4.3.2 and 4.3.3b: "as soon as he obtains the item, before completing the phase": with `st.pauseGear` (the game screens set it; the computer players and the tests do not) a phase in
// which he came by a belonging (a Loot or Magic Sight find, a purchase, a Treasure-within-Treasure) ends on the question 'phase-gear', before the blocking check and the next phase.
// It carries the new belongings (`items`, their uids); 'tidy' works on those and only those, 'continue' ends the phase. What he came by is already on if its slots were free (items.js
// autoEquip), so the question is his chance to take it off, switch it on over something else, or leave it behind.
function gearPause(st) {
    const t = st.turn;
    if (!st.pauseGear || !t?.fresh?.length || st.ch.flying || st.ch.morph) return false;
    const items = t.fresh.filter(uid => st.ch.items.some(i => i.uid === uid && !i.destroyed));
    delete t.fresh;
    if (!items.length) return false;
    st.pending = { type: 'phase-gear', items, i: t.i };
    return true;
}
function finishPhaseEnd(st, data) {
    const t = st.turn;
    stormCheck(st, data);
    // End-of-phase blocking by monsters in his clearing.
    if (t.pro) { noteCave(st, data); if (t.proBroken && phaseOptions(st, data).acts.length) t.forceBlock = true; }
    const bl = blockers(st);
    if (bl.length || t.forceBlock) {
        t.blocked = true;
        st.ch.hidden = false;
        say(st, bl.length ? `Blocked by ${bl.map(m => data.monsters[m.id].name).join(', ')}! The rest of your turn is lost.` : 'You are stopped: the rest of your turn is lost.', 'block');
        t.results[t.i] += ' (blocked)';
        return endDaylight(st, data);
    }
    // ...and by the other characters in his clearing, by each one's standing policy (7.12.2, R-4)
    if (multi(st)) {
        const b = meet.blockCheck(st, data);
        if (b === 'wait') return;
        if (b === true) return afterBlock(st, data, true);
    }
    nextPhase(st, data);
}
// 'phase-gear' is answered: the rest of the phase (storm, blocking, the next phase) goes on.
function resumePhase(st, data) {
    finishPhaseEnd(st, data);
    if (multi(st) && st.turn) meet.syncHidden(st);
}
function nextPhase(st, data) {
    const t = st.turn;
    t.i++;
    if (t.pro) { st.pending = proPending(st, data); return st.pending ? undefined : endDaylight(st, data); }
    if (t.i >= st.plan.length) return endDaylight(st, data);
    st.pending = { type: 'phase', i: t.i };
}
// The block check is settled (the last blocker has answered, or nobody had to be asked): a blocked actor's turn is over, otherwise it goes on.
function afterBlock(st, data, blocked) {
    const t = st.turn;
    if (blocked) { t.results[t.i] += ' (blocked)'; return endDaylight(st, data); }
    nextPhase(st, data);
    meet.syncHidden(st);
}

// Violent Storm (Day): a character who ends a phase in a woods or mountain clearing of the stormed tile that has no Inn, House, Chapel or Guardhouse (a campfire does not
// help) loses as many of his remaining activities as the storm rolled, once a turn. Not between clearings, not in a cave. He may choose what to lose on the card; here
// the last activities still to come go (the lead can add a choice, the engine only needs st.plan changed).
function stormCheck(st, data) {
    const t = st.turn, here = st.ch.at;
    if (!st.fx?.length || t.stormed || st.ch.onRoad || st.ch.flying || st.ch.mist || !here || isCave(st, data, here)) return;
    const storms = fxTags(st, { kind: 'tile', id: tileOf(here) }, 'storm');
    if (!storms.length || st.dwellings.some(d => d.at === here && ['Inn', 'House', 'Chapel', 'Guard house'].includes(d.kind))) return;
    t.stormed = true;
    const lose = Math.max(...storms.map(x => x.value)), later = [];
    if (t.pro) {                                              // Prophecy: the phases still to come are not recorded, so the storm simply takes ordinary ones away
        const left = phaseOptions(st, data).regularLeft, gone = Math.min(lose, left);
        t.pro.regular += gone;
        say(st, `The Violent Storm batters you: ${gone ? `you lose ${gone} of the ${left} ordinary phase${left === 1 ? '' : 's'} still to come` : 'it costs you nothing, for no phase is left'} (the storm rolled ${lose}).`, 'phase');
        return;
    }
    for (let j = t.i + 1; j < st.plan.length; j++) if (st.plan[j] && st.plan[j].act !== 'nothing') later.push(j);
    const drop = later.slice(Math.max(0, later.length - lose));
    for (const j of drop) st.plan[j] = null;
    say(st, `The Violent Storm batters you: ${drop.length ? `you lose ${drop.length} of the ${later.length} activit${later.length === 1 ? 'y' : 'ies'} still to come` : 'it costs you nothing, for no activity is left'} (the storm rolled ${lose}).`, 'phase');
}

function endDaylight(st, data) {
    const r = endDaylight0(st, data);
    if (multi(st) && st.turn) meet.syncHidden(st);
    return r;
}
function endDaylight0(st, data) {
    // A flier must land at the end of his last phase (7.3.3b.3); he can be blocked and summoned as soon as he is down.
    if (st.ch.flying) landHero(st, data);
    // His turn is over: the world reacts.
    const res = endOfTurn(st, data);
    st.turn.end = res;
    if (multi(st)) blockOthers(st, data, res);                       // what arrived finds the others standing in its clearing too
    const bl = blockers(st);
    // Blocked in the middle of the turn costs him the rest of it; creatures that only arrive now (a chit calling them, prowlers in the tile) find
    // him after the turn is over: nothing is lost, but he is seen.
    const blockedMid = !!st.turn.blocked;
    if (bl.length && !blockedMid) {
        st.turn.blocked = true; st.ch.hidden = false;
        say(st, `${bl.map(m => data.monsters[m.id].name).join(', ')} close in on you.`, 'block');
    }
    // Show him what the end of his turn did, before the evening begins.
    const names = bl.map(m => data.monsters[m.id].name);
    st.turnEnd = { ...res, day: st.day, blocked: blockedMid, blockers: blockedMid ? names : [], closedIn: blockedMid ? [] : names, plan: st.turn.results.slice(), hidden: !!st.ch.hidden, companions: st.turn.companions ?? [] };
    if (!multi(st)) st.period = 'turn-end';                           // (with several the day stays in Daylight until the last chit has been played)
    // He always stops here: the end of the turn is where he sees whether he is hidden or seen going into the evening.
    st.pending = { type: 'turn-end' };
}

function afterTurnEnd(st, data) {
    if (multi(st)) return turnDone(st, data);
    st.period = 'sunset';
    sunset(st, data);
}

function sunset(st, data) {
    say(st, 'The sun sets.', 'day', tell.sunset(st, st.ch.onRoad ? 'the road' : nameOfClearing(st.ch.at)));
    evening(st, data);
}

// Day spells end at Sunset, just before combat begins (rule 8.1.1), and a control that has run its course lets go.
function sunsetChores(st, data) {
    expireDue(st, data, 'sunset');
    for (const m of st.mons) if (m.hired && m.controlledUntil && st.day >= m.controlledUntil) { m.hired = false; delete m.hiredBy; m.controlledUntil = null; say(st, `Your control of the ${data.monsters[m.id].name} ends with the Sunset.`, 'combat'); }
}

// Every character has played his turn: Sunset. The evening is fought one clearing at a time (ruling R-11), in the order of today's turns (R-6): the clearing of the character drawn first,
// then the clearing of the first drawn among those not yet fought. A clearing with several characters is ONE fight (battle.js); a character alone in his is the one-character evening.
function sunsetAll(st, data) {
    st.period = 'sunset';
    // the order of the day's turns, each guide's followers just after him, then whoever had no turn at all (a cancelled follow)
    const turns = st.dayRec.order.flatMap(id => [id, ...(st.dayRec.follow?.[id] ?? [])]);
    const order = [...turns, ...st.order.filter(id => !turns.includes(id))].filter(id => !st.chars[id].dead), units = [], at = new Map();
    for (const id of order) {
        const c = st.chars[id];
        if (c.onRoad || c.flying || c.mist || !c.at) { units.push({ at: null, ids: [id] }); continue; }             // (on a road, in the air or as mist: no clearing, no fight)
        let u = at.get(c.at);
        if (!u) { u = { at: c.at, ids: [] }; at.set(c.at, u); units.push(u); }
        u.ids.push(id);
    }
    st.evening = { order, units, i: -1 };
    sunsetChores(st, data);
    return nextEvening(st, data);
}

function nextEvening(st, data) {
    const ev = st.evening;
    ev.i++;
    while (ev.i < ev.units.length && ev.units[ev.i].ids.every(id => st.chars[id].dead)) ev.i++;
    if (ev.i >= ev.units.length) return meet.openWindow(st) ? undefined : midnight(st, data);          // (those who stand together may trade first, when one asked for it: R-5)
    const u = ev.units[ev.i], ids = u.ids.filter(id => !st.chars[id].dead);
    if (ids.length === 1) return withActor(st, ids[0], () => sunset(st, data));
    return sharedEvening(st, data, u.at, ids);
}

// Several characters stand in one clearing. With nothing hostile there and no spell worth casting the evening is quiet (R-18); otherwise they fight together.
function sharedEvening(st, data, at, ids) {
    st.period = 'evening';
    for (const id of ids) withActor(st, id, () => say(st, 'The sun sets.', 'day', tell.sunset(st, nameOfClearing(at))));
    const hostile = st.mons.some(m => !m.dead && !m.hired && m.loc?.c === at) || st.nats.some(n => !n.dead && !n.hired && n.loc?.c === at) || ids.some(id => withActor(st, id, () => canCastQuietly(st, data))) || battle.mayFight(st, ids);          // (the last: with the pvp switch on, two players' characters in one clearing hold their evening)
    if (!hostile) {
        for (const id of ids) withActor(st, id, () => say(st, 'A quiet evening.', 'day', tell.quiet(st)));
        return nextEvening(st, data);
    }
    if (battle.startBattle(st, data, at, ids) === 'done') return nextEvening(st, data);
}

// His evening is over: the next character's, or Midnight.
// With `st.pauseEvening` (the game screens set it; the computer players and the tests do not) a single character's evening ends on a question of its own, 'evening-end': the one
// time the rules let him rearrange his belongings after the fighting (4.3.3a), and so the last chance to switch on what will give him an extra phase tomorrow, which has to be
// active in Birdsong (6.2.2c.1, ruling R6 in ch7-day.md). The question carries `gear`, the reminder list (items.js nextDayGear); 'tidy' works on it and 'continue' goes on to Midnight.
const eveningDone = (st, data) => {
    if (multi(st)) return nextEvening(st, data);
    if (st.pauseEvening && !st.ch.dead && !st.ch.flying && !st.ch.mist && !st.ch.morph) { st.pending = { type: 'evening-end', gear: nextDayGear(st, data) }; return st; }
    return midnight(st, data);
};

function hostilesHere(st, data) {
    const here = st.ch.at;
    const mons = st.mons.some(m => !m.dead && !m.hired && m.loc?.c === here);
    const nats = st.nats.some(n => !n.dead && !n.hired && n.loc?.c === here);
    return mons || nats || canCastQuietly(st, data);
}

function evening(st, data) {
    if (st.ch.dead) return died(st, data);
    st.period = 'evening';
    if (!multi(st)) sunsetChores(st, data);
    if (st.ch.onRoad || st.ch.flying) return eveningDone(st, data);          // (on a road, or still in the air: no clearing, no fight)
    if (st.ch.mist) { say(st, 'As mist you take no part in any fight: the evening passes.', 'day', tell.quiet(st)); return eveningDone(st, data); }
    if (!hostilesHere(st, data)) { say(st, 'A quiet evening.', 'day', tell.quiet(st)); return eveningDone(st, data); }
    combat.startCombat(st, data, st.ch.at);
    afterCombatStep(st, data);
}

function afterCombatStep(st, data) {
    const c = st.combat;
    if (c && c.ended) {
        // a fight he won stops on a result screen of its own (the screens set st.pauseVictory; the computer players and the tests do not)
        if (c.why === 'won' && st.pauseVictory && !c.ack && !st.ch.dead) { st.pending = { type: 'combat-over', why: 'won', killed: c.killed ?? [], gain: c.roundGain ?? null }; return; }
        if (c.why === 'ran') runAway(st, data);
        st.combat = null;
        if (st.ch.dead) return died(st, data);
        return eveningDone(st, data);
    }
}

function runAway(st, data) {
    // He ends the day on the road between clearings and must walk back by a Move.
    const roads = roadsFrom(st, data, st.ch.at).filter(r => r.usable);
    const to = st.ch.runTo && roads.find(r => r.to === st.ch.runTo) ? st.ch.runTo : (roads[0]?.to ?? null);
    if (to) { st.ch.onRoad = { from: st.ch.at, to }; say(st, `You flee along the road toward ${nameOfClearing(to)}.`, 'combat'); }
    st.ch.hidden = false;
}

// A character fell. With one character that is the end of the game. With several it is his own end (rule 9.1.1): his belongings lie where he fell, what he cast ends, his hirelings are
// let go, and the day goes on without him; at the next Birdsong his seat is asked who starts now (rule 9.1.2).
function died(st, data, carryOn = true) {
    st.companions = [];
    expireHires(st, data);
    breakAllFrom(st, data, HERO);                          // what he cast through his chits ends with him
    // what he carried lies where he fell, and the day's chits go back face down as at Midnight
    const items = st.ch.items.filter(i => !i.destroyed).map(i => ({ ...i, active: false, alerted: false }));
    if (items.length && st.ch.at) st.abandoned[st.ch.at] = [...(st.abandoned[st.ch.at] ?? []), ...items];
    st.ch.items = [];
    if (multi(st)) {
        st.combat = null; st.turn = null; st.pending = null;
        st.ch.death = { day: st.day, by: st.slain?.by ?? null, text: st.slain?.text ?? null, at: st.slain?.at ?? st.ch.at };
        st.ch.today.stage = 'dead';
        say(st, `${st.ch.name}'s adventure ends here.`, 'day');
        if (!carryOn) return;                                                              // (he fell in a fight shared with others: the fight goes on without him, battle.js)
        return st.period === 'daylight' ? turnDone(st, data) : eveningDone(st, data);       // (from the middle of his own turn, or from his evening)
    }
    resetChitsAtMidnight(st);
    st.combat = null;
    st.period = 'over';
    st.over = { reason: 'died', day: st.day, by: st.slain?.by ?? null, text: st.slain?.text ?? null, at: st.slain?.at ?? st.ch.at };
    st.score = scoreGame(st, data);
    say(st, 'Your adventure ends here.', 'day');
    st.pending = { type: 'over' };
}

// A timed game ends at the last midnight; sudden death ends when every goal is met; an endless game never ends.
// (Several characters: sudden death ends the game at the first midnight when any living character meets every goal. Ruling R-20 would ask him; that is step 6.)
function gameEnds(st, data) {
    if (st.mode === 'endless') return false;
    if (st.mode === 'sudden') {
        if (multi(st)) return !!(st.sudden && st.sudden.day === st.day && st.sudden.ended);            // (R-20: each qualifying player was asked, and one of them said end)
        return goalsMet(st, data);
    }
    return st.day >= (st.lastDay ?? LAST_DAY);
}

const goalsMet = (st, data) => { const s = scoreGame(st, data); return s.rows.length > 0 && s.rows.every(r => r.diff >= 0); };

// Sudden Death with several characters (10.E.3, ruling R-20): at a Midnight when a living character has met every goal, HE is asked whether the game ends; he need not end it. Each qualifying
// player is asked once; the first to say end ends the game for everybody at this Midnight, and when all have declined it goes on. Returns true when Midnight may go on (nobody qualifies, or all
// have answered), false when it waits for the answers.
function suddenAsk(st, data) {
    if (st.sudden?.day === st.day) return !!st.sudden.done;
    const ids = livingIds(st).filter(id => withActor(st, id, () => goalsMet(st, data)));
    if (!ids.length) return true;
    st.sudden = { day: st.day, ids, ended: false, done: false };
    say(st, `Sudden Death: ${ids.map(id => playerNameOf(st, id)).join(' and ')} ${ids.length === 1 ? 'has' : 'have'} met every goal and may end the game now.`, 'day', null, { who: null });
    for (const id of ids) st.asks.push({ who: id, pending: { type: 'end-option', day: st.day } });
    return false;
}
function endOption(st, data, a) {
    const s = st.sudden, who = st.actor;
    st.pending = null;
    if (a.end) {
        s.ended = true;
        for (const k of [...st.asks]) if (k.pending.type === 'end-option') st.asks.splice(st.asks.indexOf(k), 1);          // (the game ends: the others need not answer)
        say(st, `${playerNameOf(st, who)} ends the game.`, 'day', null, { who: null });
    } else say(st, `${playerNameOf(st, who)} plays on.`, 'day', null, { who: null });
    if (st.asks.some(k => k.pending.type === 'end-option')) return st;
    s.done = true;
    return midnight(st, data);
}

// Midnight, once for the whole table: the realm's chores happen once, each living character's own housekeeping in turn (rule 8.9.2). With one character the order of the chores is
// the order they always had.
function midnight(st, data) {
    st.period = 'midnight';
    if (multi(st) && st.mode === 'sudden' && !suddenAsk(st, data)) return;
    const each = fn => { if (multi(st)) { for (const id of livingIds(st)) withActor(st, id, fn); } else fn(); };
    expireDue(st, data, 'midnight');                       // Combat spells end at Midnight (8.9.2)
    each(() => {
        deenergizePass(st, data);                          // Permanent spells fall inert unless a source that stays still fills their place
        st.ch.wishStrength = null;                          // a Wish of Strength not used today is lost
        st.companions = [];
        for (const it of st.ch.items) if (it.kind === 'weapon') it.alerted = false;
        for (const c of st.ch.chits) if (c.alerted) { c.alerted = false; if (c.state === 'active') c.state = 'fatigued'; }          // an alerted Magic chit that was not used tires at Midnight
    });
    // The Midnight housekeeping is for a game that goes on (rule 8.9.2): at the last Midnight nothing is returned and no curse is lifted before the score is worked out.
    const ending = gameEnds(st, data);
    // a potion that was activated today is good until Midnight, then it goes back to the box it came from (8.9.2a; one not used is kept)
    const cardOf = it => data.treasures[it.card ?? (it.kind === 'treasure' ? it.id : '')];      // a card that became a counter keeps its card
    each(() => {
        const spent = ending ? [] : st.ch.items.filter(it => it.active && cardOf(it)?.discardTo);
        for (const it of spent) {
            const card = cardOf(it);
            (st.stock[card.discardTo] ??= []).push({ kind: 'treasure', id: card.id });
            say(st, `The ${card.name} is used up and returns to the ${card.discardTo}.`, 'info');
        }
        if (spent.length) st.ch.items = st.ch.items.filter(it => !spent.includes(it));
    });
    resetChitsAtMidnight(st);
    each(() => {
        if (!st.ch.flying && !ending) liftCursesAtChapel(st);                     // (not while he is blown across the land)
        expireHires(st, data);
        st.combat = null;
    });
    if (multi(st)) { for (const id of st.order) if (st.chars[id].dead) withActor(st, id, () => { st.combat = null; }); st.evening = null; }
    if (ending) {
        expireDue(st, data, 'game-end');                  // all spells are broken when the game ends (9.3.1)
        st.period = 'over';
        st.over = { reason: 'finished', day: st.day };
        say(st, 'The month ends.', 'day', null, multi(st) ? { who: null } : null);
        if (multi(st)) {
            st.score = scoreParty(st, data);
            for (const id of st.order) withActor(st, id, () => { st.pending = { type: 'over' }; });
            return;
        }
        st.score = scoreGame(st, data);
        st.pending = { type: 'over' };
        return;
    }
    st.day += 1;
    each(() => { if (!st.ch.onRoad) followHero(st, data); });                 // natives hired yesterday (who could not follow him on that day's Move) are with him again by Birdsong (7.11.3)
    beginDay(st, data);
}

// ---- activities ----
// 7.3.2b, 6.2.4d: an extra phase caused by a horse or a treasure card is lost unless that belonging was ACTIVE when the phase began (before he rearranged at its start). The
// count works without remembering which phase was caused by what: the extra phases for this activity from this one on (this one included) must not outnumber the sources of
// that activity he still has active. A source that went out before the phase therefore costs him the earliest of the phases it could have caused, and one that went out
// after the last of them costs nothing. (The pony: while it is active its Moves are not counted, plan validation has seen to the alternation.)
function extraLost(st, data, slot, i) {
    const t = st.turn;
    if (t.pro || t.kinds?.[i] !== 'extra' || slot.act === 'nothing') return null;
    const act = slot.act, was = t.gear?.i === i ? t.gear.active : null;           // the belongings he had on when this phase began, if he has rearranged since
    const saved = st.ch.items.map(it => it.active);
    if (was) st.ch.items.forEach(it => { it.active = was.includes(it.uid) && !it.destroyed; });
    const have = extraActs(st, data).filter(a => a === act).length, h = activeHorse(st), pony = h && data.horses[h.id]?.kind === 'pony';
    st.ch.items.forEach((it, k) => { it.active = saved[k]; });
    const due = t.kinds.reduce((n, k, j) => n + (j >= i && k === 'extra' && st.plan[j]?.act === act ? 1 : 0), 0);
    if (act === 'move' && pony) return null;
    if (due <= have) return null;
    return `What gives you this extra ${act} phase (a horse or a treasure) was not active when the phase began: the phase is lost.`;
}

// 7.8.4: with every chit fatigued, wounded or committed to a spell he can only Rest, and a recorded activity is cancelled and he rests at the next opportunity. Ruling R2
// (ch7-day.md): the Rest takes the very phase that cannot be done. A phase that may be used for one activity only (a horse's or a card's extra Move ...) cannot hold a Rest: it is
// simply lost, and the Rest comes at the next phase he could rest in.
function spentChits(st) {
    return !st.ch.morph && !st.ch.mist && st.ch.chits.length > 0 && st.ch.chits.every(c => c.state === 'fatigued' || c.state === 'wounded' || c.state === 'committed');
}
// He cannot rest at all (Ill Health, or every chit still committed to a spell): he is killed (7.8.4).
function forcedRest(st, data) {
    const ill = hasCurse(st, 'Ill Health');
    if ((ill || !restOptions(st).length) && (ill || st.ch.chits.every(c => c.state === 'committed'))) {
        st.ch.dead = true;
        st.slain = { by: null, text: ill ? 'Ill Health: every chit was spent and he could not rest.' : 'Every chit was committed to a spell: there was nothing to rest.', at: st.ch.at, day: st.day };
        say(st, 'Every chit is spent and you cannot rest: you die.', 'info');
        return 'You can only rest, and you cannot: you die.';
    }
    return doRest(st, data);
}

function executeSlot(st, data, slot, i) {
    const t = st.turn;
    if (!slot) { t.climb = null; return 'You do nothing.'; }
    { const lost = extraLost(st, data, slot, i); if (lost) { t.climb = null; return lost; } }
    const spent = slot.act !== 'nothing' && spentChits(st);
    if (spent && slot.act !== 'rest') {
        if (t.kinds?.[i] === 'extra') { t.climb = null; return 'Every chit of yours is fatigued, wounded or committed to a spell: you can only rest, and this phase is for one activity only, so it is lost.'; }
        say(st, 'Every chit of yours is fatigued, wounded or committed to a spell: you can only rest, and your recorded activity is cancelled.', 'info');
        slot = { act: 'rest', forced: true }; st.plan[i] = { ...slot };
    }
    // In the air, every activity but Fly lands him first (7.3.3b): a die picks the clearing; a cave has no sunlight, and a monster there stops him as he lands.
    if (st.ch.flying && slot.act !== 'fly' && slot.act !== 'nothing') { const lost = landForPhase(st, data, i); if (lost) { t.climb = null; return lost; } }
    // Mist (Melt into Mist) can do only Move, Hide and Follow (there is no Follow activity yet).
    if (st.ch.mist && slot.act !== 'move' && slot.act !== 'hide' && slot.act !== 'nothing') { t.climb = null; return 'As mist you can only move and hide: the phase is lost.'; }
    const here = st.ch.at;
    if (t.kinds?.[i] === 'lantern' && !(here && !st.ch.onRoad && isCave(st, data, here))) { t.climb = null; return 'The Shielded Lantern\'s phase needs a cave clearing and you are not in one: the activity is cancelled.'; }
    if (t.kinds?.[i] === 'blazing' && here !== st.planBlazing) { t.climb = null; return 'You have left the Blazing Light behind: the extra phase is lost.'; }
    if (st.ch.onRoad && !(slot.act === 'move' && (slot.to === st.ch.onRoad.from || slot.to === st.ch.onRoad.to))) {
        // He is still out on a road; only a Move to one of its ends gets him anywhere.
        t.climb = null;
        return 'You are still on the road and cannot do that.';
    }
    if (st.ch.morph && MORPH_REFUSED[slot.act]) { t.climb = null; return MORPH_REFUSED[slot.act]; }          // as a creature he can only move, hide, search and alert
    // 7.3.3e (with ruling S6, record and cancel): "If a character is transmorphized into a flying monster or creature, he must use the Fly activity instead of the Move activity."
    if (st.ch.morph?.creature?.flies && slot.act === 'move') { t.climb = null; return 'As a flying creature you must use the Fly activity, not the Move activity: the phase is lost (7.3.3e).'; }
    switch (slot.act) {
        case 'move': return doMove(st, data, slot);
        case 'fly': return doFly(st, data, slot);
        case 'hide': { t.climb = null; return doHide(st, data); }
        case 'rest': { t.climb = null; return spent ? forcedRest(st, data) : doRest(st, data); }
        case 'alert': { t.climb = null; return doAlert(st, data, slot); }
        case 'search': { t.climb = null; return doSearch(st, data, slot); }
        case 'enchant': { t.climb = null; return doEnchant(st, data); }
        case 'trade': { t.climb = null; return beginTrade(st, data) ? 'wait' : 'No one here will trade with you.'; }
        case 'hire': {
            t.climb = null;
            if (hasCurse(st, 'Ashes')) return 'Your gold is worthless under the Ashes curse: nobody will take it.';
            return beginHire(st, data) ? 'wait' : 'There is no one here to hire.';
        }
        default: t.climb = null; return 'Nothing happens.';
    }
}

// A Fly phase (7.3.3a): to the tile he is over or one next to it. The first phase of a flight plays a Fly chit (the Broomstick's); a phase that goes on flying needs none.
function doFly(st, data, slot) {
    const t = st.turn;
    t.climb = null;
    if (multi(st)) for (const f of meet.followersOf(st, st.actor)) meet.dropFollower(st, data, f, 'cannot follow a flier');          // (7.11.6a.5: only a follower who can fly follows a flier; none is modelled)
    if (!flyTiles(st, data).includes(slot.to)) return 'That tile is too far away to fly to: the phase is lost.';
    let src = null;
    if (!st.ch.flying) {
        const all = flySources(st, data);
        if (!all.length) return 'You have nothing to fly with: the phase is lost.';
        src = all.find(x => carries(st, x));
        if (!src) return 'You are too heavy to fly with that: the phase is lost.';
    }
    return startFlight(st, data, slot.to, src);
}

// He comes down before a phase that is not a Fly phase. Returns why the phase is lost, or null when he may go on. Down in a cave, the sunlight phases still to come are lost
// (spec 02 section 8, test 4); down among monsters, the activity is lost and the end-of-phase blocking takes the rest.
function landForPhase(st, data, i) {
    const t = st.turn, down = landHero(st, data);
    const sunlight = k => (t.kinds ? t.kinds[k] === 'sunlight' : (k >= 2 && k < (t.base ?? 4)));
    let lostHere = false;
    if (down.cave) for (let k = i; k < st.plan.length; k++) if (sunlight(k)) { st.plan[k] = null; if (k === i) lostHere = true; }
    if (lostHere) return 'You land in a cave, where there is no sunlight: the rest of your turn is lost.';
    const bl = blockers(st);
    if (bl.length) return `You land among the ${bl.map(m => data.monsters[m.id].name).join(', ')} and are blocked before you can act.`;
    return null;
}

// Enchant (rule 7.10): the first Enchant phase of a day is only meditation; each later one enchants a Magic chit of Type I to V into a colour chit
// (it then supplies its colour to its owner's own spells, and is used up when played).
function doEnchant(st, data) {
    const t = st.turn;
    t.enchants = (t.enchants ?? 0) + 1;
    if (t.enchants === 1) return 'You meditate and gather your power: the first Enchant phase of a day only prepares you, so a second Enchant phase is needed to enchant.';
    const opts = enchantableChits(st);
    if (!opts.length) return 'You have no ready Magic chit of Type I to V to enchant.';
    // a chit may be turned into a colour chit, or (where its colour of magic is present) held back and used to enchant the tile he stands on
    st.pending = { type: 'enchant-choice', options: [...opts.map(c => ({ kind: 'chit', chit: c.id, numeral: c.numeral, time: c.time, effort: c.effort, color: TYPE_COLOR[c.numeral] })), ...tileEnchantOptions(st, data)] };
    return 'wait';
}

function doMove(st, data, slot) {
    const t = st.turn, from = st.ch.onRoad ? null : st.ch.at;
    let to = slot.to;
    if (st.ch.onRoad) {
        const r = st.ch.onRoad;
        if (to !== r.from && to !== r.to) return 'You cannot reach that from the road.';
        if (isMountain(st, data, to) && t.climb !== to) { t.climb = to; return `You begin the climb toward ${nameOfClearing(to)}.`; }
        st.ch.arrivedFrom = to === r.to ? r.from : r.to; st.ch.at = to; st.ch.onRoad = null; t.climb = null;
        followHero(st, data);
        return arrive(st, data, to);
    }
    // Lost: the Lost Table picks the clearing he reaches, by any road (7.3.1)
    let lost = false;
    if (lostActive(st)) { const m = lostMove(st, data, from, to); if (m.text) { t.climb = null; return m.text; } to = m.to; lost = true; }
    // 7.3.1a.4, 9.2.2b (ruling M4, Mike 2026-10-26): "Edge" as the place to move to: along a roadway to the edge of the map, leaving the game. Recorded from anywhere; done only from a clearing
    // that has such a road. (The `leave` action stays the way the server lets a seat go.)
    if (to === 'Edge') {
        t.climb = null;
        if (!from || st.ch.flying || !mapEdgeClearings(st, data).has(from)) return 'There is no roadway to the edge of the map from here: the move is lost.';
        leaveMap(st, data, { viaMove: true });
        return 'wait';
    }
    // 7.3.4: a hero transformed into a beast that walks the woods (Lion, Squirrel, Frog) moves to any clearing of his tile, road or no road. Ruling R1 (Mike, 2026-10-26: option b): a mountain
    // clearing still takes the two Move phases of 7.3.1c (the climb below), and a cave clearing of the tile is allowed like any other (the cave rules below still apply to it).
    const cr = st.ch.morph?.creature, walks = cr && (cr.walksWoods ?? (cr.row != null && data.tables.transform.rows.find(r => r.roll === cr.row)?.walksWoods));          // (a saved creature may predate the flag)
    const woods = !!walks && !!from && to !== from && tileOf(to) === tileOf(from);
    const road = woods ? { to, usable: true, kind: 'woods' } : roadsFrom(st, data, from).find(r => r.to === to);
    if (!road) { t.climb = null; return `There is no road from here to ${nameOfClearing(to)}: the move is lost.`; }
    if (!road.usable && !lost) { t.climb = null; return `You do not know the way to ${nameOfClearing(to)}: the move is lost.`; }
    if (isCave(st, data, to) && (t.kinds ? t.kinds[st.turn.i] === 'sunlight' : (st.turn.i >= 2 && st.turn.i < (t.base ?? 4)))) { t.climb = null; return 'You cannot enter a cave in a sunlight phase.'; }
    if (isMountain(st, data, to) && t.climb !== to) {
        t.climb = to;
        return `You start the climb toward ${nameOfClearing(to)} (mountains take two Move phases).`;
    }
    t.climb = null;
    const dropped = dropHeavy(st, data);
    st.ch.arrivedFrom = from;
    st.ch.at = to;
    followHero(st, data);
    if (multi(st)) {
        if (!lost && (road.kind === 'hidden' || road.kind === 'secret')) meet.spyOnPath(st, data, st.ch.id, from, to);      // those who see him use it learn it (4.5.6b.1)
        meet.carry(st, data, from, to, road, isCave(st, data, to));                                                   // and his followers go with him (7.11.6a)
    }
    if (isCave(st, data, to)) {
        const h = activeHorse(st);
        if (h) { h.active = false; say(st, 'Your horse cannot go into the caves and stays outside, unridden.', 'info'); }
    }
    if (dropped.length) abandon(st, from, dropped);
    let text = arrive(st, data, to);
    if (dropped.length) text += ` You had to leave behind: ${dropped.map(d => nameOf(data, d)).join(', ')}.`;
    return text;
}

const lostActive = st => !st.ch.onRoad && !st.ch.mist && !!st.ch.at && (fxTags(st, HERO, 'randomMove').length > 0 || fxTags(st, { kind: 'tile', id: tileOf(st.ch.at) }, 'randomMove').length > 0);
// The Lost table is a table: two dice, the high roll counts (4.1.1; ruling S4, Mike 2026-10-26). It is a clearing number among the clearings joined to this one (undiscovered paths too).
// None: the phase is lost; several: his recorded one, else the first.
function lostMove(st, data, from, wanted) {
    const r = roll2(st, 'move.lost'), d = r.value, cands = roadsFrom(st, data, from).filter(x => numOf(x.to) === d);
    noteRoll(st, 'Lost', r.dice, d, cands.length ? `you wander toward ${nameOfClearing(cands[0].to)}` : 'no clearing with that number');
    if (!cands.length) return { text: `Lost: you wander in circles (rolled ${r.dice.join('+')}, the high ${d}) and the move is lost.` };
    return { to: (cands.find(r => r.to === wanted) ?? cands[0]).to };
}

function arrive(st, data, to) {
    return `You move to ${nameOfClearing(to)}.`;
}

function doHide(st, data) {
    if (hasCurse(st, 'Squeak')) return 'The Squeak curse betrays you: you cannot hide.';
    if (st.ch.hidden) return 'You are already hidden.';
    const r = oneDie(st, 'hide', st.ch.at, data) ? { dice: [die(st, 'hide')], value: 0 } : roll2(st, 'hide');
    if (r.value === 0) r.value = r.dice[0];
    modRoll(st, data, 'hide', r);
    noteRoll(st, 'Hide', r.dice, r.value, (hides(r.value) ? 'You hide' : 'You are seen') + modNote(r));
    if (hides(r.value)) { st.ch.hidden = true; return `You hide (rolled ${r.dice.join('+')}).`; }
    return `You fail to hide (rolled ${r.dice.join('+')}).`;
}

// The Alert activity readies the active weapon, or alerts one Magic chit (4.6.3c, 7.9.3): an alerted Magic chit has time 0, so it can be played
// in the Encounter step against the fastest creature; if it is not used it tires at Midnight.
function doAlert(st, data, slot = {}) {
    if (multi(st)) for (const f of meet.followersOf(st, st.actor)) withActor(st, f, () => {            // each follower who is a character does the same (7.11.6f): he readies his weapon
        const w = st.ch.items.find(i => i.kind === 'weapon' && i.active);
        if (w && !w.alerted && !isWeaponCard(data, w)) { w.alerted = true; say(st, `You ready your ${nameOf(data, w)}.`, 'info'); }
    });
    if (slot?.magic) {
        if (st.ch.morph) return 'A creature has no Magic chit to alert.';
        const chit = st.ch.chits.find(c => c.id === slot.magic);
        if (!chit || chit.type !== 'magic') return 'There is no such Magic chit to alert.';
        if (chit.state !== 'active') return `That Magic chit is not ready (${chit.state === 'fatigued' ? 'tired' : chit.state}).`;
        if (chit.alerted) return `Magic ${chit.numeral} is already alerted.`;
        chit.alerted = true;
        return `You alert Magic ${chit.numeral}${chit.time}${'*'.repeat(chit.effort)}: it will act at time 0 until Midnight.`;
    }
    const w = st.ch.items.find(i => i.kind === 'weapon' && i.active);
    if (!w) return 'You have no weapon to ready.';
    if (isWeaponCard(data, w)) return `Your ${nameOf(data, w)} is a weapon card: it cannot be alerted.`;       // 2.3.4d: a weapon card stays face up whenever it is active
    if (w.alerted) return `Your ${nameOf(data, w)} is already alerted.`;
    w.alerted = true;
    return `You ready your ${nameOf(data, w)}.`;
}

// Resting: each Rest phase returns one asterisk of effort (a wounded chit takes two rests per asterisk).
function doRest(st, data) {
    if (multi(st)) for (const f of meet.followersOf(st, st.actor)) withActor(st, f, () => {            // each follower who is a character rests too (7.11.6f); he cannot choose now, so the first way offered
        const o = hasCurse(st, 'Ill Health') ? [] : restOptions(st);
        if (o.length) { applyRest(st, o[0]); say(st, `You rest (${o[0].text}).`, 'info'); }
    });
    if (hasCurse(st, 'Ill Health')) return 'Ill Health: you cannot rest.';
    const opts = restOptions(st);
    if (!opts.length) return 'You have nothing to rest.';
    if (opts.length === 1) { applyRest(st, opts[0]); return `You rest (${opts[0].text}).`; }
    st.pending = { type: 'rest', options: opts };
    return 'wait';
}

export function restOptions(st) {
    const out = [];
    const wither = hasCurse(st, 'Wither');
    for (const c of st.ch.chits) {
        if (c.state === 'fatigued' && c.effort > 0 && !wither) {
            out.push({ chit: c.id, to: 'active', text: `rest ${chitLabel(c)}`, cost: c.effort });
        } else if (c.state === 'wounded') {
            if (c.effort === 0) out.push({ chit: c.id, to: 'active', text: `heal ${chitLabel(c)}`, cost: 1 });
            else out.push({ chit: c.id, to: 'fatigued', text: `heal ${chitLabel(c)} to fatigued`, cost: c.effort });
        }
    }
    // One Rest returns one asterisk. A chit worth two needs change: fatigue an active one-asterisk chit of ANY type, his choice (7.8.2 b).
    const changers = st.ch.chits.filter(c => c.state === 'active' && c.effort === 1);
    const res = [];
    for (const o of out) {
        if (o.cost === 1) res.push(o);
        else for (const g of changers) res.push({ ...o, change: g.id, text: `${o.text}, fatiguing ${chitLabel(g)} for change` });
    }
    return res;
}
export const chitLabel = c => c.type === 'magic' ? `Magic ${c.numeral ?? ''}${c.time}${'*'.repeat(c.effort)}` : `${chitWord(c)} ${c.strength}${c.time}${'*'.repeat(c.effort)}`;

function applyRest(st, o) {
    const c = st.ch.chits.find(x => x.id === o.chit);
    c.state = o.to;
    if (o.cost === 2) {
        const give = st.ch.chits.find(x => x.id === o.change && x.state === 'active') ?? st.ch.chits.find(x => x.state === 'active' && x.effort === 1);
        if (give) give.state = 'fatigued';
    }
}

// Which tables he may search on where he stands (rule 7.5: he records only "S" at Birdsong and names the table when he does it).
export function searchTables(st, data = null) {
    const here = st.ch.at;
    // Magic Sight (7.5.7) replaces Peer, Locate, Loot (site and ground) and Reading Runes; the site-card tables stay
    if (data && magicSightOn(st, data)) return ['magicsight', ...(st.ch.siteCards?.[here]?.length ? ['sitecard'] : [])];
    return [...(peerBlocked(st, data, here) ? [] : ['peer']), 'locate', 'loot', ...((st.abandoned[here] ?? []).length ? ['ground'] : []), ...(st.ch.siteCards?.[here]?.length ? ['sitecard'] : []), ...(data && runesTargets(st, data).length ? ['runes'] : [])];
}

function doSearch(st, data, slot) {
    if (hasCurse(st, 'Eyemist')) return 'The Eyemist curse blinds you: you cannot search.';
    if (!slot.table) {
        // no table was named in the plan: ask when the phase comes
        st.pending = { type: 'search-table', options: searchTables(st, data) };
        return 'wait';
    }
    let table = slot.table;
    if (SIGHT_REPLACES.has(table) && magicSightOn(st, data)) table = 'magicsight';           // a plan that names an old table searches with Magic Sight instead
    if (table === 'magicsight') return magicSightOn(st, data) ? doMagicSight(st, data) : 'You are not using Magic Sight.';
    // Searching the Cairns costs an asterisk of effort for every Loot roll, found or not, paid before the roll; the player picks the chit.
    if (table === 'loot' && !slot.paid && sitesHere(st)[0]?.name === 'Cairns') {
        const opts = effortOptions(st);
        if (!opts.length) return 'The Cairns demand an asterisk of effort for every roll, and you have none to give: you cannot search them.';
        if (opts.length === 1) say(st, payEffort(st, opts[0]), 'info');
        else { st.pending = { type: 'effort-cost', site: 'Cairns', options: opts, resume: 'search', slot: { act: 'search', table: 'loot' } }; return 'wait'; }
    }
    if (table === 'runes') return readRunes(st, data, slot.target ?? null);
    if (table === 'peer' && peerBlocked(st, data, st.ch.at)) return 'Fog hangs over this tile: nobody can use the Peer table here.';
    let r;
    if (oneDie(st, table === 'loot' || table === 'ground' || table === 'sitecard' ? 'loot' : 'search', st.ch.at, data)) { const d1 = die(st, `search.${table}`); r = { dice: [d1], value: d1 }; } else r = roll2(st, `search.${table}`);
    const rawDice = [...r.dice];
    if (table === 'locate') { const m = locateMod(st, tileOf(st.ch.at), data); if (m) { r.value = Math.max(1, r.value + m); r.dice = [...r.dice, `${m}`]; } }
    modRoll(st, data, table, r);                                       // Illusion and Bad Luck add one (4.1.2)
    const SEARCH_WHAT = { peer: 'Search: Peer', locate: 'Search: Locate', loot: 'Search: Loot', ground: 'Search: Loot the ground', sitecard: 'Search: Site card' };
    const tableList = table === 'peer' ? PEER : table === 'locate' ? LOCATE : null;
    noteRoll(st, SEARCH_WHAT[table] ?? 'Search', rawDice, r.value, (tableList ? tableList[Math.min(5, r.value - 1)] ?? '' : '') + modNote(r));
    if (table === 'sitecard') return lootSiteCard(st, data, r) ?? 'There is no such place here.';
    const here = st.ch.at;
    if (table === 'peer' || table === 'locate') {
        const list = table === 'peer' ? PEER : LOCATE;
        let res = list[r.value - 1];
        if (res === 'Choice') {
            // 7.5: he may take any result of the Peer or Locate table, whichever table he rolled on (not Choice, and not Nothing)
            const options = [...new Set([...PEER, ...LOCATE].filter(x => x !== 'Choice' && x !== 'Nothing'))];
            st.pending = { type: 'search-choice', table, options, roll: r.dice };
            return 'wait';
        }
        return applySearchResult(st, data, table, res, r.dice);
    }
    if (table === 'loot' || table === 'ground') return lootFrom(st, data, r, table === 'ground');
    return 'Nothing happens.';
}

// ---- the action entry point ----
// `action.who` names the character who is answering (default: the only one with a question waiting, else the current actor). While the action runs the engine works
// for that character: st.ch, st.pending, st.plan, st.turn and st.combat are his. `action.by` (a player id, supplied by a server) must own him. With one character none of this shows.
export function apply(st0, data, action) {
    const st = clone(st0);
    if (action?.type === 'table') { tableAct(st, data, action); return st; }       // the table's own decisions (an agreed end, leaving the map): see below
    const who = resolveWho(st, action);
    if (action?.by != null && ownerOf(st, who) !== action.by) throw new Error('that is not your character');
    st.actor = who;
    // a seat marked away is played by the autopilot (server/autopilot.mjs): every answer it gives is labelled in the log, in public words (a plan or a play is not told)
    if (action.auto && multi(st)) say(st, `${playerNameOf(st, who)}'s autopilot answers: ${action.type}${action.kind ? ' ' + action.kind : ''}.`, 'day', null, { who: null });
    step(st, data, action);
    settleActor(st, who);
    return st;
}

function step(st, data, action) {
    if (action.type === 'meet') return meet.act(st, data, action);          // characters meeting: an offer, an answer, a policy (meet.js); anyone may, with or without a question
    const p = st.pending;
    if (multi(st) && st.offers && meet.openOffer(st, st.actor) && p) throw new Error(`wait: ${st.chars[meet.openOffer(st, st.actor).to].name} has not answered your offer yet (withdraw it to go on)`);
    if (!p) throw new Error(multi(st) ? `${st.ch.name} has nothing to answer now (it is not his turn, or the others are still to answer)` : 'nothing to do');
    switch (action.type) {
        case 'plan': {
            if (p.type !== 'plan') throw new Error('not planning');
            st.pending = null;
            submitPlan(st, data, action.slots ?? [], action.companions ?? null, !!action.choose);
            if ((st.pending?.type === 'phase' || st.pending?.type === 'phase-pick') && action.autoplay) autoplay(st, data);
            return st;
        }
        case 'next': {
            if (p.type === 'phase-pick') {                          // Prophecy: "next" follows the suggested plan (or does nothing)
                st.pending = null;
                pickPhase(st, data, st.planFull?.[st.turn.i] ?? null, { soft: true });
                return settle(st, data, !!action.all);
            }
            if (p.type !== 'phase') throw new Error('not in a phase');
            st.pending = null;
            runPhase(st, data);
            return settle(st, data, !!action.all);
        }
        case 'pick': {
            if (p.type !== 'phase-pick') throw new Error('you are not choosing a phase');
            st.pending = null;
            pickPhase(st, data, action.slot ?? null);
            return settle(st, data, !!action.all);
        }
        case 'rest': {
            if (p.type !== 'rest') throw new Error('not resting');
            const o = p.options.find(x => x.chit === action.chit && (action.change == null || x.change === action.change));
            if (!o) throw new Error('cannot rest that chit');
            st.pending = null;
            applyRest(st, o);
            say(st, `You rest (${o.text}).`, 'info');
            finishPhase(st, data, `You rest (${o.text}).`);
            return settle(st, data, st.turn?.auto);
        }
        case 'search-table': {
            if (p.type !== 'search-table') throw new Error('no search table is being chosen');
            const named = SIGHT_REPLACES.has(action.table) && magicSightOn(st, data) ? 'magicsight' : action.table;       // under Magic Sight a named old table is the Magic Sight table
            if (!p.options.includes(named)) throw new Error('you cannot search that table here');
            st.pending = null;
            const text = doSearch(st, data, { act: 'search', table: named });
            if (text === 'wait') return st;                          // a Choice result is waiting for its own answer
            say(st, text, 'info');
            finishPhase(st, data, text);
            return settle(st, data, st.turn?.auto);
        }
        case 'effort-cost': {
            if (p.type !== 'effort-cost') throw new Error('nothing is asking for effort');
            const o = p.options[action.n ?? 0];
            if (!o) throw new Error('choose one of the ways to pay');
            st.pending = null;
            say(st, payEffort(st, o), 'info');
            if (p.opens) (st.sitesOpen ??= {})[p.opens] = true;          // the piece that broke the Vault's door (search.js vaultPieces)
            const text = p.resume === 'search' ? doSearch(st, data, { ...p.slot, paid: true }) : lootFrom(st, data, p.r, p.ground, { paid: true, sight: !!p.sight });
            if (text === 'wait') return st;
            finishPhase(st, data, text);
            return settle(st, data, st.turn?.auto);
        }
        case 'enchant-choice': {
            if (p.type !== 'enchant-choice') throw new Error('nothing to enchant');
            const kind = action.kind ?? 'chit';
            const o = p.options.find(x => x.chit === action.chit && (x.kind ?? 'chit') === kind);
            if (!o) throw new Error('choose one of the chits offered');
            st.pending = null;
            const ch = st.ch.chits.find(x => x.id === o.chit);
            let text;
            if (kind === 'tile') {
                // the Magic chit is not played (it stays ready); a colour chit that supplied the colour is used up
                if (o.supply) { st.ch.chits.find(x => x.id === o.supply).state = 'fatigued'; }
                const to = flipTile(st, data, o.tile);
                text = `You enchant the tile with ${o.color} magic: ${tileName(o.tile)} is turned to its ${to} side.`;
            } else {
                ch.state = 'enchanted';
                text = `You enchant your Magic ${o.numeral}${o.time}${'*'.repeat(o.effort)}: it now holds ${o.color} magic until you play it.`;
            }
            say(st, text, 'info');
            finishPhase(st, data, text);
            return settle(st, data, st.turn?.auto);
        }
        case 'runes-target': {
            if (p.type !== 'runes-target') throw new Error('nothing to read');
            if (!p.options.some(o => o.key === action.target)) throw new Error('read the runes of one of the things offered');
            st.pending = null;
            const text = p.sight ? perceive(st, data, p.roll, action.target) : readRunes(st, data, action.target);
            if (text === 'wait') return st;
            say(st, text, 'info');
            finishPhase(st, data, text);
            return settle(st, data, st.turn?.auto);
        }
        case 'learn-spell': {
            if (p.type !== 'learn-spell') throw new Error('no spell is being offered');
            const text = learnSpell(st, data, !!action.learn, p, action.erase, action.spell ?? null);          // (throws, leaving the question open, when he must erase one and has not said which)
            st.pending = null;
            finishPhase(st, data, text);
            return settle(st, data, st.turn?.auto);
        }
        case 'search-choice': {
            if (p.type !== 'search-choice') throw new Error('not choosing');
            if (!p.options.includes(action.result)) throw new Error('not a result on that table');
            st.pending = null;
            const text = p.table === 'magicsight-take' ? takeChosen(st, data, p, action.result) : applySearchResult(st, data, p.table, action.result, p.roll);
            if (text === 'wait') return st;                          // the Pool or the Cairns ask which chit to tire
            say(st, text, 'info');
            finishPhase(st, data, text);
            return settle(st, data, st.turn?.auto);
        }
        case 'hire': {
            if (p.type !== 'hire' && p.type !== 'hire-offer') throw new Error('not hiring');
            if (action.act === 'back') return cancelDealing(st, data, p);
            st.pending = null;
            const done = hireAction(st, data, p, action);
            if (done) finishPhase(st, data, done);
            return settle(st, data, st.turn?.auto);
        }
        case 'trade': {
            if (p.type !== 'trade' && p.type !== 'trade-offer') throw new Error('not trading');
            if (action.act === 'back') return cancelDealing(st, data, p);
            st.pending = null;
            const done = tradeAction(st, data, p, action);
            if (done) finishPhase(st, data, done);
            return settle(st, data, st.turn?.auto);
        }
        case 'combat': {
            if (!st.combat) throw new Error('no combat');
            const kindFor = { 'combat-pay': 'pay', 'combat-drinks': 'drinks', 'combat-choice': 'choice', 'combat-encounter': 'encounter', 'combat-melee': 'melee', 'combat-shift': 'shift', 'combat-wounds': 'wounds', 'combat-fatigue': 'fatigue', 'combat-over': 'over', 'combat-lure': 'lure', 'combat-charge': 'charge' };
            if (kindFor[p.type] !== action.kind && !(p.type === 'combat-melee' && action.kind === 'aim')) throw new Error(`that is not what the fight is waiting for (${kindFor[p.type] ?? p.type})`);
            st.pending = null;
            if (st.combat.shared) {                                // a fight with other characters in it (battle.js): the fight takes the answer and goes on as far as it can
                if (battle.answer(st, data, action) === 'done') nextEvening(st, data);
                return st;
            }
            combatAction(st, data, action);
            afterCombatStep(st, data);
            return st;
        }
        case 'continue': {
            if (p.type === 'evening-end') { st.pending = null; return midnight(st, data); }          // the evening is over: Midnight
            if (p.type === 'phase-gear') { st.pending = null; resumePhase(st, data); return st; }          // he has settled what to do with what he came by: the phase is complete (4.3.2)
            if (p.type !== 'turn-end') throw new Error('nothing to continue');
            st.pending = null;
            afterTurnEnd(st, data);
            return st;
        }
        case 'end-option': {
            if (p.type !== 'end-option') throw new Error('nobody is asking whether the game ends');
            return endOption(st, data, action);
        }
        case 'restart': {
            if (p.type === 'restart') return restartChar(st, data, action.vp, action.character ?? null);        // (several characters: the seat starts again at this Birdsong)
            if (p.type !== 'over') throw new Error('not at the end of a game');
            return restartAfterDeath(st, data, action.vp);
        }
        case 'protect': {
            // a held Phase spell (Protection from Magic) is activated like an item before the phase runs; it ends with the phase
            if (p.type !== 'phase' && p.type !== 'phase-pick') throw new Error('you can only use it at the start of a phase');
            activatePhase(st, data, action.fx, 'phase');
            st.pending = keep(st, data, p);
            return st;
        }
        case 'energize': {
            // 8.3.9a: "When it is his turn to do an action in the Encounter Step, each character can use his color chits to energize Permanent spells"; it is not his action
            // (8.3.9a.2), so the Encounter step goes on as it was (any number of chits, one after the other; no time limit from the creatures on his sheet).
            const inEncounter = p.type === 'combat-encounter' && st.combat?.step === 'encounter' && !st.combat.shared;
            if (p.type !== 'phase' && p.type !== 'phase-pick' && p.type !== 'plan' && !inEncounter) throw new Error('you can only energize a spell at the start of a phase, while planning, or when it is your turn to act in the Encounter step');
            energizeWith(st, data, action.fx, action.colorChit);
            st.pending = keep(st, data, p);
            return st;
        }
        case 'dismiss': {
            // The owner's rule of play (not printed): a hired native or monster may be let go at the start of any phase; he stays where he is and is no longer yours.
            if (p.type !== 'phase' && p.type !== 'phase-pick' && p.type !== 'plan') throw new Error('you can only dismiss a hireling between phases');
            dismissHire(st, data, action);
            st.pending = keep(st, data, p);
            return st;
        }
        case 'tidy': {
            // 4.3.3a, 7.2.2f (ruling R6, ch7-day.md): at the start of each phase of his Daylight turn and after all the Evening's combat; never in Birdsong while he records his plan
            // (an extra phase from a horse or a card must be active at Birdsong, 6.2.2c.1, so it has to be switched on the evening before: see nextDayGear and the 'evening-end' question).
            if (p.type === 'plan') throw new Error('you cannot rearrange your belongings while you record your plan: only at the start of a phase of your turn, or in the evening after the fighting (4.3.3a)');
            if (p.type !== 'phase' && p.type !== 'phase-pick' && p.type !== 'evening-end' && p.type !== 'phase-gear') throw new Error('you can only rearrange your gear between phases (in a fight, use your Encounter action)');
            if (p.type === 'phase-gear' && !p.items.includes(action.item)) throw new Error('only what you have just come by can be changed now (4.3.3b); the rest at the start of your next phase');
            if (st.ch.flying && !action.drop) throw new Error('you cannot rearrange your gear in the air: you can only abandon (7.2.2d)');
            const locked = gearLockedWhy(st); if (locked) throw new Error(locked);          // 8.3.8d: not on a roadway between clearings
            if (p.type === 'phase' && st.turn && st.turn.gear?.i !== st.turn.i) st.turn.gear = { i: st.turn.i, active: st.ch.items.filter(x => x.active && !x.destroyed).map(x => x.uid) };          // what was on when this phase began (7.3.2b: an extra phase needs its horse already active then)
            // free item management outside combat: switch items on and off
            const it = st.ch.items.find(i => i.uid === action.item);
            if (!it) throw new Error('no such item');
            if (st.ch.morph && !action.drop) throw new Error('your gear is of no use to a creature');
            if (it.destroyed && !action.drop) throw new Error('that item is destroyed');
            if (action.drop) {
                // 4.3.2: he may abandon a belonging at the start of any phase; it lies where he stands
                const bound = extraPhaseCommitment(st, data, it);          // 6.2.4d: not the horse or card that gives him an extra phase he has recorded, until that phase is finished
                if (bound) throw new Error(bound);
                // 7.2.2d: in the air an item may be abandoned, and one die (not modified) for the tile he is over at the start of his phase says which clearing of it the item lands in
                const where = st.ch.flying ? landingClearing(st, data, st.ch.flying.tile, 'Where the item lands') : st.ch.at ?? st.ch.onRoad?.from;
                st.ch.items = st.ch.items.filter(i => i.uid !== it.uid);
                st.abandoned[where] = [...(st.abandoned[where] ?? []), { ...it, active: false, alerted: false }];
                say(st, st.ch.flying ? `You let the ${nameOf(data, it)} fall: it lands in ${nameOfClearing(where)}.` : `You leave the ${nameOf(data, it)} behind.`, 'info');
                st.pending = afterTidy(st, data, p);
                return st;
            }
            toggleItem(st, data, it);
            say(st, `You ${it.active ? 'activate' : 'deactivate'} the ${nameOf(data, it)}.`, 'info');
            st.pending = afterTidy(st, data, p);                    // (under Prophecy an item can give an extra phase the moment he activates it)
            return st;
        }
        case 'open': {
            if (p.type !== 'phase' && p.type !== 'phase-pick' && p.type !== 'plan') throw new Error('you can only open it between phases');
            // The Chest opens with the Lost Keys: its two large treasures and fifty gold replace it.
            const locked = gearLockedWhy(st); if (locked) throw new Error(locked);          // 8.3.8d
            const chest = st.ch.items.find(i => i.uid === action.item && i.id === 'chest');
            if (!chest) throw new Error('no chest to open');
            if (!st.ch.items.some(i => i.id === 'lost-keys' && i.active)) throw new Error('The Chest needs the Lost Keys.');
            st.ch.items = st.ch.items.filter(i => i.uid !== chest.uid);
            for (const l of st.twt.chest.large) { const got = makeItem(st, l.kind, l.id); st.ch.items.push(got); noteGain(st, got); }
            st.ch.gold += st.twt.chest.gold || 50;
            say(st, 'You open the Chest: two fine treasures and fifty gold.', 'loot');
            st.pending = p;
            return st;
        }
        default: throw new Error('unknown action ' + action.type);
    }
}

// A free action leaves the question open; under Prophecy it is asked again, for the choices may have changed (a belonging he just activated).
const afterTidy = (st, data, p) => (p.type === 'evening-end' ? { ...p, gear: nextDayGear(st, data) }
    : p.type === 'phase-gear' ? { ...p, items: p.items.filter(uid => st.ch.items.some(i => i.uid === uid)) }          // (what he left behind is no longer his to arrange)
        : keep(st, data, p));
const keep = (st, data, p) => (p.type === 'phase-pick' ? (proPending(st, data) ?? p) : p);

function combatAction(st, data, a) {
    switch (a.kind) {
        case 'pay': return combat.payOrFight(st, data, a.pay);
        case 'drinks': return combat.drinksAction(st, data, a.buy);
        case 'choice': return combat.choiceAction(st, data, a.fight);
        case 'encounter': return combat.encounterAction(st, data, a);
        case 'melee': return combat.meleePlay(st, data, a);
        case 'aim': return combat.meleeAim(st, data, a);          // the Melee step in two answers: the spells first (ruling S8 / R3), then the plays
        case 'shift': return combat.shiftAction(st, data, a);
        case 'wounds': return combat.chooseWounds(st, data, a.chits);
        case 'fatigue': return combat.chooseFatigue(st, data, a.chits, a.change ?? null);
        case 'over': st.combat.ack = true; return;
        default: throw new Error('unknown combat action');
    }
}

// After a phase: keep going if autoplay is on and no decision is waiting.
function settle(st, data, all) {
    if (all) autoplay(st, data);
    return st;
}
function autoplay(st, data) {
    if (st.turn) st.turn.auto = true;
    let guard = 0;
    while ((st.pending?.type === 'phase' || st.pending?.type === 'phase-pick') && guard++ < 20) {
        const p = st.pending; st.pending = null;
        if (p.type === 'phase-pick') pickPhase(st, data, st.planFull?.[st.turn.i] ?? null, { soft: true }); else runPhase(st, data);
    }
    if (st.turn && st.pending?.type !== 'phase' && st.pending?.type !== 'phase-pick') st.turn.auto = false;
}

// ---- the table's own decisions (action { type: 'table', kind, ... }, the server's: they are events of the log like any other) ----
//   end    the players agreed to stop (9.2.1): the game is scored as if the month had ended now, whatever is going on
//   leave  a character leaves the map (R-21, 9.2.2b): his score is fixed at once, his hirelings are let go, his things leave play, his seat does not start again (no new character)
// The server checks the vote that lets `end` be sent; the engine only does it. `leave` is a character's: it needs `who`, and `by` must own him.
function tableAct(st, data, a) {
    if (st.period === 'over') throw new Error('the game is over');
    if (a.kind === 'end') return endGame(st, data, a.reason ?? 'agreed');
    if (a.kind === 'note') { say(st, String(a.text ?? '').slice(0, 240), 'day', null, { who: null }); return st; }          // the table's own line (a seat marked away, a seat back): written by the server
    if (a.kind === 'leave') {
        const who = resolveWho(st, a);
        if (a.by != null && ownerOf(st, who) !== a.by) throw new Error('that is not your character');
        st.actor = who;
        leaveMap(st, data);
        settleActor(st, who);
        return st;
    }
    throw new Error(`unknown table action ${a.kind}`);
}

// The game ends now, scored as at the end of the month. Everything in flight (a fight, an offer, a trade window, a question) is dropped: nothing can be answered after the end.
function endGame(st, data, reason) {
    expireDue(st, data, 'game-end');                                     // all spells are broken when the game ends (9.3.1)
    st.battle = null; st.offers = []; st.evening = null;
    for (const k of ['tradeWindow', 'blockCheck', 'followCheck']) delete st[k];
    if (st.sudden && !st.sudden.done) st.sudden.done = true;
    st.asks = [];
    for (const id of st.order) { const t = st.chars[id].today; if (t) { t.combat = null; t.turn = null; } }
    st.period = 'over';
    st.over = { reason, day: st.day };
    const why = { agreed: 'The players agree to end the game here.', limit: 'The game has reached its length limit and ends here.', left: 'Nobody is left on the map: the game ends.' }[reason] ?? 'The game ends here.';
    say(st, why, 'day', null, multi(st) ? { who: null } : null);
    if (multi(st)) {
        st.score = scoreParty(st, data);
        for (const id of st.order) withActor(st, id, () => { st.pending = { type: 'over' }; });
        settleActor(st, st.order.includes(st.actor) ? st.actor : st.order[0]);
        return st;
    }
    st.score = scoreGame(st, data);
    st.pending = { type: 'over' };
    return st;
}

// The actor leaves the map. Allowed from a clearing, at the start of his own phase or while he plans (the printed edge-of-the-map road is not modelled; ruling R-21).
function leaveMap(st, data, { viaMove = false } = {}) {
    const c = st.ch, p = st.pending;
    if (!viaMove) {
        if (!multi(st)) throw new Error('you cannot leave the map: end the game instead');
        if (c.dead) throw new Error('your character is dead');
        if (!p || !['plan', 'phase', 'phase-pick'].includes(p.type)) throw new Error('you can leave the map when you plan, or at the start of one of your phases');
        if (!c.at || c.onRoad || c.flying || c.mist) throw new Error('you can leave the map only from a clearing');
        if (meet.openOffer(st, st.actor)) throw new Error('you have an offer open: withdraw it first');
    }
    c.goneScore = scoreGame(st, data);                                  // fixed now (9.3.1a): what he holds this moment is what counts
    c.gone = { day: st.day };
    st.companions = [];
    expireHires(st, data);
    breakAllFrom(st, data, HERO);
    c.items = [];                                                       // (they leave play with him)
    c.dead = true; c.hidden = false;
    c.death = { day: st.day, by: null, text: null, at: c.at, left: true };
    say(st, `${c.name} leaves the map.`, 'day', null, { who: null });
    const midTurn = viaMove || p.type !== 'plan';
    st.pending = null;
    st.combat = null; st.plan = null;
    if (st.order.every(id => st.chars[id].gone)) return endGame(st, data, 'left');
    if (!midTurn) {                                                     // at the Birdsong barrier: perhaps his plan was the one the day was waiting for
        c.today.stage = 'gone';
        if (st.order.every(id => ['planned', 'gone'].includes(st.chars[id].today.stage))) sunrise(st, data);
        return st;
    }
    st.turn = null;
    const id = st.actor;
    turnDone(st, data);
    st.chars[id].today.stage = 'gone';                                   // (turnDone marks a turn as played; he has left, which is not the same)
    return st;
}

// The fight shared by several characters needs two things this file does: a character who falls and one who runs.
battle.hooks.died = (st, data) => died(st, data, false);
battle.hooks.runAway = (st, data) => runAway(st, data);

// What the meetings between characters (meet.js) need of this file.
meet.hooks.afterBlock = (st, data, blocked) => afterBlock(st, data, blocked);
meet.hooks.resumePhase = (st, data) => runPhase(st, data);
meet.hooks.toMidnight = (st, data) => midnight(st, data);
meet.hooks.followHero = (st, data) => followHero(st, data);
// A follower's turn ends in the middle of his guide's (he stopped following, or could not go on): the end of a turn as endDaylight does it, without the question that stops a turn that is his own.
meet.hooks.followerEnds = (st, data) => {
    const res = endOfTurn(st, data);
    blockOthers(st, data, res);
    const bl = blockers(st), names = bl.map(m => data.monsters[m.id].name);
    if (bl.length) { st.ch.hidden = false; say(st, `${names.join(', ')} close in on you.`, 'block'); }
    st.turnEnd = { ...res, day: st.day, blocked: false, blockers: [], closedIn: names, plan: [], hidden: !!st.ch.hidden, companions: [], follower: true };
};

// For tests and tools that set a clearing up by hand: open the evening of a state whose `dayRec` names the order of the day's turns (every character's turn played).
export { sunsetAll as beginEvening };

// The end-of-day reminder for the screens (items.js): the belongings that decide tomorrow's plan, also on the `evening-end` question as `gear`.
export { nextDayGear, gearLockedWhy };
