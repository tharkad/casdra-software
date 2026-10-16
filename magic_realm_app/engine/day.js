import { clone, die, roll2, int, say, lvl, shuffle, noteRoll, tally } from './core.js';
import { hides, PEER, LOCATE, meetingResult } from './tables.js';
import { roadsFrom, isCave, isMountain, tileOf, numOf, nameOfClearing, pathKey, tileClearings, graph, tileName } from './world.js';
import { endOfTurn, blockers, resetChitsAtMidnight } from './summon.js';
import * as combat from './combat.js';
import { makeItem, defOf, nameOf, priceOf, dropHeavy, abandon, weightOf, carriedLevel, toggleItem, noteGain, noteFind } from './items.js';
import { lootFrom, lootSiteCard, groundPileAt, sitesHere, effortOptions, payEffort, applySearchResult, peerBlocked } from './search.js';
import { hasCurse, liftCursesAtChapel } from './effects.js';
import { tell } from './story.js';
import { runesTargets, readRunes, learnSpell } from './runes.js';
import { restartAfterDeath } from './setup.js';
import { activeHorse } from './items.js';
import { extraActs, noSunlight, oneDie, locateMod, modRoll, modNote } from './modifiers.js';
import { beginTrade, tradeAction } from './trade.js';
import { scoreGame } from './score.js';
import { canCastQuietly, enchantableChits, TYPE_COLOR, dayColors } from './spells.js';
import { flipTile, tileEnchantOptions } from './magic/colour.js';
import { expireDue, breakAllFrom, fxTags, fxList, HERO } from './magic/fx.js';
import { energizePass, deenergizePass, energizeWith } from './magic/energize.js';
import { activatePhase } from './magic/phase.js';
import { spawnCompanion, companionsOf, companionInfo, planCompanions, runCompanionTurns } from './magic/companion.js';
import { prophecyOn, startPro, phaseOptions, consume, noteCave } from './magic/prophecy.js';
import { magicSightOn, SIGHT_REPLACES, doMagicSight, takeChosen, perceive } from './magic/sight.js';
import { MORPH_REFUSED } from './magic/morph.js';
import { beginHire, hireAction, followHero, expireHires } from './hire.js';
import { planFlyError, flySources, flyTiles, carries, startFlight, landHero } from './magic/fly.js';
import { ownedGold } from './magic/mist.js';

// The day loop (rules digest 01 section 4): Birdsong plan, Sunrise, Daylight phases, Sunset, Evening combat, Midnight.
// A game is a plain object; apply(state, data, action) returns the next state and never mutates its input.

export const LAST_DAY = 28;
export const PHASES = { basic: 2, sunlight: 2 };

// ---- starting a day ----
export function beginDay(st, data) {
    landDenizens(st, data);
    if (st.ch.flying) landHero(st, data, 'You come down');            // blown away by Hurricane Winds, or flown out of a fight: down before the plan is recorded (7.3.3b)
    st.period = 'birdsong';
    st.plan = null;
    st.turn = null;
    st.ch.hiddenEnemies = false;
    st.ch.findEnemies = {};                                           // Magic Sight's partial Find Enemies (counters, treasures, spells): for today only
    st.ch.killsToday = 0;
    energizePass(st, data, 'dawn');                                   // Permanent spells whose colour fills the land today wake (4.6.7h)
    // What the day just ended changed, for the morning review (the report reads st.report; nothing in the rules does).
    if (st.mark) st.report = { day: st.mark.day, fame: st.ch.fame - st.mark.fame, notoriety: st.ch.notoriety - st.mark.notoriety, gold: ownedGold(st) - st.mark.gold };
    st.mark = { day: st.day, fame: st.ch.fame, notoriety: st.ch.notoriety, gold: ownedGold(st) };
    say(st, `Day ${st.day} begins.`, 'day');
    // Phantasm (and any other companion): the piece appears beside him at Birdsong and gets a turn of its own to record
    st.companions = [];
    for (const f of fxList(st, { spell: 'phantasm', target: HERO })) spawnCompanion(st, data, { kind: 'phantasm', fx: f.id });
    st.pending = { type: 'plan' };
    if (st.companions.length) st.pending.companions = companionInfo(st, data);
    if (prophecyOn(st)) st.pending.prophecy = true;                  // Prophecy: no turn to record; he chooses each phase as it comes (action 'pick')
}

// Creatures that Hurricane Winds carried off land at the start of the day, before the Monster Roll and the plan: a die picks a clearing of the tile, rolled again
// when the tile has no clearing of that number (7.3.3).
function landDenizens(st, data) {
    for (const o of [...st.mons, ...st.nats]) {
        if (!o.loc?.flying) continue;
        const tile = o.loc.tile, nums = tileClearings(st, data, tile).map(numOf);
        let n = null;
        for (let k = 0; k < 40 && !nums.includes(n); k++) n = die(st);
        if (!nums.includes(n)) n = nums[0];
        o.loc = { c: tile + n };
        say(st, `${o.id in data.monsters ? data.monsters[o.id].name : data.natives[o.id].name} comes down in clearing ${n} of the ${tileName(tile)}.`, 'monster');
    }
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
    return { total: base + extras.length, base, sunlight, extras, extra: extras.length, blazing, refused: st.ch.morph ? Object.keys(MORPH_REFUSED) : [] };       // (as a creature he cannot Rest, Trade, Hire or Enchant)
}

// Which kind of phase each recorded activity uses (rule 6.2.4 a): an extra phase takes only its own activity and may be recorded anywhere; every other
// activity uses the next ordinary phase, the first two being basic and the rest sunlight. Returns the kinds and any errors.
export function planKinds(st, data, slots) {
    const ph = phasesFor(st, data, slots.filter(Boolean));
    const left = [...ph.extras], kinds = [], errors = [];
    let regular = 0;
    slots.forEach((s, i) => {
        if (!s || s.act === 'nothing') { kinds.push(null); return; }
        if (i >= ph.total) { errors.push(`Phase ${i + 1} is not available today.`); kinds.push('over'); return; }
        const k = left.indexOf(s.act);
        if (k >= 0) { left.splice(k, 1); kinds.push('extra'); }
        else {
            regular++;
            if (regular <= PHASES.basic) kinds.push('basic');
            else if (ph.blazing && regular === ph.base) kinds.push('blazing');          // the extra phase of the Blazing Light: any activity, but only while he is still in that clearing
            else if (regular <= ph.base) kinds.push('sunlight');
            else {
                kinds.push('over');
                errors.push(ph.extras.length ? `Phase ${i + 1}: only ${ph.base} ordinary activities today; the extra phase can be used only for ${[...new Set(ph.extras)].join(' or ')}.` : `Phase ${i + 1} is not available today.`);
            }
        }
        if (s.act === 'move' && !s.to) errors.push(`Phase ${i + 1}: choose where to move.`);
        if (s.act === 'fly') { const e = planFlyError(st, data, slots, i); if (e) errors.push(`Phase ${i + 1}: ${e}`); }
        if (st.ch.mist && s.act !== 'move' && s.act !== 'hide') errors.push(`Phase ${i + 1}: as mist you can only move and hide.`);
    });
    return { kinds, errors, total: ph.total, base: ph.base, sunlight: ph.sunlight, extras: ph.extras };
}

export function validatePlan(st, data, slots) {
    const v = planKinds(st, data, slots);
    return { total: v.total, sunlight: v.sunlight, errors: v.errors, kinds: v.kinds };
}

function submitPlan(st, data, slots, companions = null, choose = false) {
    planCompanions(st, data, companions ?? {});                    // (throws before anything changes)
    st.planFree = prophecyOn(st) && (choose || !slots?.length);    // Prophecy: no recorded plan (an empty one, or `choose`) means he picks each phase as it comes; a recorded plan is simply played
    if (st.planFree) {
        // Prophecy: he ignores his recorded turn and chooses each phase as it comes. Slots sent with `choose` are a suggestion that autoplay follows.
        st.planBase = 4; st.planBlazing = null; st.planKinds = null;
        st.ch.arrivedFrom = null;
        st.plan = []; st.planFull = (slots ?? []).slice();
        return sunrise(st, data);
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
    sunrise(st, data);
}

// ---- sunrise: the Monster Roll ----
function sunrise(st, data) {
    st.period = 'sunrise';
    st.prowl = die(st);
    noteRoll(st, 'Monster roll', [st.prowl], st.prowl, `row ${st.prowl} prowls today`);
    st.rolls.at(-1).tale = tell.wilds(st, data);                       // the story voice says what prowls, not which row
    const magic = dayColors(st.day, st.lastDay ?? 28), week = st.day % 7 === 0 ? regenerate(st, data) : null;
    say(st, `Dawn of day ${st.day}: row ${st.prowl} prowls.${magic.length ? ` The land is filled with ${magic.join(' and ')} magic until midnight.` : ''}`, 'day', tell.dawn(st, data, { magic }));
    if (week) say(st, `Regeneration: row ${st.prowl} creatures return to their homes.`, 'day', tell.weekEnd(st, data, week));
    // He becomes unhidden when his own turn begins.
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
    const r = executeSlot(st, data, slot, i);
    if (r === 'wait') return;                     // a decision is pending
    finishPhase(st, data, r);
}

function finishPhase(st, data, text) {
    const t = st.turn;
    t.results[t.i] = text;
    say(st, `Phase ${t.i + 1}: ${text}`, 'phase', tell.phase(st, text));
    if (t.pro && !prophecyOn(st)) t.proBroken = true;              // broken, or suspended by Protection from Magic (spec question 9): blocked unless the turn is over
    expireDue(st, data, 'phase-end');
    energizePass(st, data, 'phase');
    if (st.ch.dead) return died(st, data);
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
    t.i++;
    if (t.pro) { st.pending = proPending(st, data); return st.pending ? undefined : endDaylight(st, data); }
    if (t.i >= st.plan.length) return endDaylight(st, data);
    st.pending = { type: 'phase', i: t.i };
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
    // A flier must land at the end of his last phase (7.3.3b.3); he can be blocked and summoned as soon as he is down.
    if (st.ch.flying) landHero(st, data);
    // His turn is over: the world reacts.
    const res = endOfTurn(st, data);
    st.turn.end = res;
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
    st.period = 'turn-end';
    // He always stops here: the end of the turn is where he sees whether he is hidden or seen going into the evening.
    st.pending = { type: 'turn-end' };
}

function afterTurnEnd(st, data) {
    st.period = 'sunset';
    sunset(st, data);
}

function sunset(st, data) {
    say(st, 'The sun sets.', 'day', tell.sunset(st, st.ch.onRoad ? 'the road' : nameOfClearing(st.ch.at)));
    evening(st, data);
}

function hostilesHere(st, data) {
    const here = st.ch.at;
    const mons = st.mons.some(m => !m.dead && !m.hired && m.loc?.c === here);
    const nats = st.nats.some(n => !n.dead && !n.hired && n.loc?.c === here);
    return mons || nats || canCastQuietly(st, data);
}

function evening(st, data) {
    if (st.ch.dead) return died(st, data);
    st.period = 'evening';
    // Day spells end at Sunset, just before combat begins (rule 8.1.1).
    expireDue(st, data, 'sunset');
    for (const m of st.mons) if (m.hired && m.controlledUntil && st.day >= m.controlledUntil) { m.hired = false; m.controlledUntil = null; say(st, `Your control of the ${data.monsters[m.id].name} ends with the Sunset.`, 'combat'); }
    if (st.ch.onRoad || st.ch.flying) { midnight(st, data); return; }          // (on a road, or still in the air: no clearing, no fight)
    if (st.ch.mist) { say(st, 'As mist you take no part in any fight: the evening passes.', 'day', tell.quiet(st)); return midnight(st, data); }
    if (!hostilesHere(st, data)) { say(st, 'A quiet evening.', 'day', tell.quiet(st)); return midnight(st, data); }
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
        return midnight(st, data);
    }
}

function runAway(st, data) {
    // He ends the day on the road between clearings and must walk back by a Move.
    const roads = roadsFrom(st, data, st.ch.at).filter(r => r.usable);
    const to = st.ch.runTo && roads.find(r => r.to === st.ch.runTo) ? st.ch.runTo : (roads[0]?.to ?? null);
    if (to) { st.ch.onRoad = { from: st.ch.at, to }; say(st, `You flee along the road toward ${nameOfClearing(to)}.`, 'combat'); }
    st.ch.hidden = false;
}

function died(st, data) {
    st.companions = [];
    expireHires(st, data);
    breakAllFrom(st, data, HERO);                          // what he cast through his chits ends with him
    // what he carried lies where he fell, and the day's chits go back face down as at Midnight
    const items = st.ch.items.filter(i => !i.destroyed).map(i => ({ ...i, active: false, alerted: false }));
    if (items.length && st.ch.at) st.abandoned[st.ch.at] = [...(st.abandoned[st.ch.at] ?? []), ...items];
    st.ch.items = [];
    resetChitsAtMidnight(st);
    st.combat = null;
    st.period = 'over';
    st.over = { reason: 'died', day: st.day, by: st.slain?.by ?? null, text: st.slain?.text ?? null, at: st.slain?.at ?? st.ch.at };
    st.score = scoreGame(st, data);
    say(st, 'Your adventure ends here.', 'day');
    st.pending = { type: 'over' };
}

// A timed game ends at the last midnight; sudden death ends when every goal is met; an endless game never ends.
function gameEnds(st, data) {
    if (st.mode === 'endless') return false;
    if (st.mode === 'sudden') {
        const s = scoreGame(st, data);
        return s.rows.length > 0 && s.rows.every(r => r.diff >= 0);
    }
    return st.day >= (st.lastDay ?? LAST_DAY);
}

function midnight(st, data) {
    st.period = 'midnight';
    expireDue(st, data, 'midnight');                       // Combat spells end at Midnight (8.9.2)
    deenergizePass(st, data);                              // Permanent spells fall inert unless a source that stays still fills their place
    st.ch.wishStrength = null;                              // a Wish of Strength not used today is lost
    st.companions = [];
    for (const it of st.ch.items) if (it.kind === 'weapon') it.alerted = false;
    for (const c of st.ch.chits) if (c.alerted) { c.alerted = false; if (c.state === 'active') c.state = 'fatigued'; }          // an alerted Magic chit that was not used tires at Midnight
    // The Midnight housekeeping is for a game that goes on (rule 8.9.2): at the last Midnight nothing is returned and no curse is lifted before the score is worked out.
    const ending = gameEnds(st, data);
    // a potion that was activated today is good until Midnight, then it goes back to the box it came from (8.9.2a; one not used is kept)
    const cardOf = it => data.treasures[it.card ?? (it.kind === 'treasure' ? it.id : '')];      // a card that became a counter keeps its card
    const spent = ending ? [] : st.ch.items.filter(it => it.active && cardOf(it)?.discardTo);
    for (const it of spent) {
        const card = cardOf(it);
        (st.stock[card.discardTo] ??= []).push({ kind: 'treasure', id: card.id });
        say(st, `The ${card.name} is used up and returns to the ${card.discardTo}.`, 'info');
    }
    if (spent.length) st.ch.items = st.ch.items.filter(it => !spent.includes(it));
    resetChitsAtMidnight(st);
    if (!st.ch.flying && !ending) liftCursesAtChapel(st);                     // (not while he is blown across the land)
    expireHires(st, data);
    st.combat = null;
    if (st.ch.onRoad) {
        // still out on the road overnight: the next day's plan must begin with a Move to either end
    }
    if (ending) {
        expireDue(st, data, 'game-end');                  // all spells are broken when the game ends (9.3.1)
        st.period = 'over';
        st.over = { reason: 'finished', day: st.day };
        st.score = scoreGame(st, data);
        say(st, 'The month ends.', 'day');
        st.pending = { type: 'over' };
        return;
    }
    st.day += 1;
    if (!st.ch.onRoad) followHero(st);                 // natives hired yesterday (who could not follow him on that day's Move) are with him again by Birdsong (7.11.3)
    beginDay(st, data);
}

// ---- activities ----
function executeSlot(st, data, slot, i) {
    const t = st.turn;
    if (!slot) { t.climb = null; return 'You do nothing.'; }
    // In the air, every activity but Fly lands him first (7.3.3b): a die picks the clearing; a cave has no sunlight, and a monster there stops him as he lands.
    if (st.ch.flying && slot.act !== 'fly' && slot.act !== 'nothing') { const lost = landForPhase(st, data, i); if (lost) { t.climb = null; return lost; } }
    // Mist (Melt into Mist) can do only Move, Hide and Follow (there is no Follow activity yet).
    if (st.ch.mist && slot.act !== 'move' && slot.act !== 'hide' && slot.act !== 'nothing') { t.climb = null; return 'As mist you can only move and hide: the phase is lost.'; }
    const here = st.ch.at;
    if (t.kinds?.[i] === 'blazing' && here !== st.planBlazing) { t.climb = null; return 'You have left the Blazing Light behind: the extra phase is lost.'; }
    if (st.ch.onRoad && !(slot.act === 'move' && (slot.to === st.ch.onRoad.from || slot.to === st.ch.onRoad.to))) {
        // He is still out on a road; only a Move to one of its ends gets him anywhere.
        t.climb = null;
        return 'You are still on the road and cannot do that.';
    }
    if (st.ch.morph && MORPH_REFUSED[slot.act]) { t.climb = null; return MORPH_REFUSED[slot.act]; }          // as a creature he can only move, hide, search and alert
    switch (slot.act) {
        case 'move': return doMove(st, data, slot);
        case 'fly': return doFly(st, data, slot);
        case 'hide': { t.climb = null; return doHide(st, data); }
        case 'rest': { t.climb = null; return doRest(st, data); }
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
        followHero(st);
        return arrive(st, data, to);
    }
    // Lost: the Lost Table picks the clearing he reaches, by any road (7.3.1)
    let lost = false;
    if (lostActive(st)) { const m = lostMove(st, data, from, to); if (m.text) { t.climb = null; return m.text; } to = m.to; lost = true; }
    const road = roadsFrom(st, data, from).find(r => r.to === to);
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
    followHero(st);
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
// One die is a clearing number among the clearings joined to this one (undiscovered paths too). None: the phase is lost; several: his recorded one, else the first.
function lostMove(st, data, from, wanted) {
    const d = die(st), cands = roadsFrom(st, data, from).filter(r => numOf(r.to) === d);
    noteRoll(st, 'Lost', [d], d, cands.length ? `you wander toward ${nameOfClearing(cands[0].to)}` : 'no clearing with that number');
    if (!cands.length) return { text: `Lost: you wander in circles (rolled ${d}) and the move is lost.` };
    return { to: (cands.find(r => r.to === wanted) ?? cands[0]).to };
}

function arrive(st, data, to) {
    return `You move to ${nameOfClearing(to)}.`;
}

function doHide(st, data) {
    if (hasCurse(st, 'Squeak')) return 'The Squeak curse betrays you: you cannot hide.';
    if (st.ch.hidden) return 'You are already hidden.';
    const r = oneDie(st, 'hide', st.ch.at, data) ? { dice: [die(st)], value: 0 } : roll2(st);
    if (r.value === 0) r.value = r.dice[0];
    modRoll(st, data, 'hide', r);
    noteRoll(st, 'Hide', r.dice, r.value, (hides(r.value) ? 'You hide' : 'You are seen') + modNote(r));
    if (hides(r.value)) { st.ch.hidden = true; return `You hide (rolled ${r.dice.join('+')}).`; }
    return `You fail to hide (rolled ${r.dice.join('+')}).`;
}

// The Alert activity readies the active weapon, or alerts one Magic chit (4.6.3c, 7.9.3): an alerted Magic chit has time 0, so it can be played
// in the Encounter step against the fastest creature; if it is not used it tires at Midnight.
function doAlert(st, data, slot = {}) {
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
    if (w.alerted) return `Your ${nameOf(data, w)} is already alerted.`;
    w.alerted = true;
    return `You ready your ${nameOf(data, w)}.`;
}

// Resting: each Rest phase returns one asterisk of effort (a wounded chit takes two rests per asterisk).
function doRest(st, data) {
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
export const chitLabel = c => c.type === 'magic' ? `Magic ${c.numeral ?? ''}${c.time}${'*'.repeat(c.effort)}` : `${c.type === 'move' ? 'Move' : 'Fight'} ${c.strength}${c.time}${'*'.repeat(c.effort)}`;

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
    if (oneDie(st, table === 'loot' || table === 'ground' || table === 'sitecard' ? 'loot' : 'search', st.ch.at, data)) { const d1 = die(st); r = { dice: [d1], value: d1 }; } else r = roll2(st);
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
export function apply(st0, data, action) {
    const st = clone(st0);
    const p = st.pending;
    if (!p) throw new Error('nothing to do');
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
            st.pending = null;
            const done = hireAction(st, data, p, action);
            if (done) finishPhase(st, data, done);
            return settle(st, data, st.turn?.auto);
        }
        case 'trade': {
            if (p.type !== 'trade' && p.type !== 'trade-offer') throw new Error('not trading');
            st.pending = null;
            const done = tradeAction(st, data, p, action);
            if (done) finishPhase(st, data, done);
            return settle(st, data, st.turn?.auto);
        }
        case 'combat': {
            if (!st.combat) throw new Error('no combat');
            const kindFor = { 'combat-pay': 'pay', 'combat-drinks': 'drinks', 'combat-choice': 'choice', 'combat-encounter': 'encounter', 'combat-melee': 'melee', 'combat-wounds': 'wounds', 'combat-fatigue': 'fatigue', 'combat-over': 'over' };
            if (kindFor[p.type] !== action.kind) throw new Error(`that is not what the fight is waiting for (${kindFor[p.type] ?? p.type})`);
            st.pending = null;
            combatAction(st, data, action);
            afterCombatStep(st, data);
            return st;
        }
        case 'continue': {
            if (p.type !== 'turn-end') throw new Error('nothing to continue');
            st.pending = null;
            afterTurnEnd(st, data);
            return st;
        }
        case 'restart': {
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
            if (p.type !== 'phase' && p.type !== 'phase-pick' && p.type !== 'plan') throw new Error('you can only energize a spell at the start of a phase or while planning');
            energizeWith(st, data, action.fx, action.colorChit);
            st.pending = keep(st, data, p);
            return st;
        }
        case 'tidy': {
            if (p.type !== 'phase' && p.type !== 'phase-pick' && p.type !== 'plan') throw new Error('you can only rearrange your gear between phases (in a fight, use your Encounter action)');
            if (st.ch.flying) throw new Error('you cannot rearrange your gear in the air');
            // free item management outside combat: switch items on and off
            const it = st.ch.items.find(i => i.uid === action.item);
            if (!it) throw new Error('no such item');
            if (st.ch.morph && !action.drop) throw new Error('your gear is of no use to a creature');
            if (it.destroyed && !action.drop) throw new Error('that item is destroyed');
            if (action.drop) {
                // 4.3.2: he may abandon a belonging at the start of any phase; it lies where he stands
                const where = st.ch.at ?? st.ch.onRoad?.from;
                st.ch.items = st.ch.items.filter(i => i.uid !== it.uid);
                st.abandoned[where] = [...(st.abandoned[where] ?? []), { ...it, active: false, alerted: false }];
                say(st, `You leave the ${nameOf(data, it)} behind.`, 'info');
                st.pending = keep(st, data, p);
                return st;
            }
            toggleItem(st, data, it);
            say(st, `You ${it.active ? 'activate' : 'deactivate'} the ${nameOf(data, it)}.`, 'info');
            st.pending = keep(st, data, p);                    // (under Prophecy an item can give an extra phase the moment he activates it)
            return st;
        }
        case 'open': {
            if (p.type !== 'phase' && p.type !== 'phase-pick' && p.type !== 'plan') throw new Error('you can only open it between phases');
            // The Chest opens with the Lost Keys: its two large treasures and fifty gold replace it.
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
const keep = (st, data, p) => (p.type === 'phase-pick' ? (proPending(st, data) ?? p) : p);

function combatAction(st, data, a) {
    switch (a.kind) {
        case 'pay': return combat.payOrFight(st, data, a.pay);
        case 'drinks': return combat.drinksAction(st, data, a.buy);
        case 'choice': return combat.choiceAction(st, data, a.fight);
        case 'encounter': return combat.encounterAction(st, data, a);
        case 'melee': return combat.meleePlay(st, data, a);
        case 'wounds': return combat.chooseWounds(st, data, a.chits);
        case 'fatigue': return combat.chooseFatigue(st, data, a.chits);
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
