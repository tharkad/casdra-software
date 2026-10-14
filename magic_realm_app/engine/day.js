import { clone, die, roll2, int, say, lvl, shuffle, noteRoll, tally } from './core.js';
import { hides, PEER, LOCATE, meetingResult } from './tables.js';
import { roadsFrom, isCave, isMountain, tileOf, numOf, nameOfClearing, pathKey, tileClearings, graph } from './world.js';
import { endOfTurn, blockers, resetChitsAtMidnight } from './summon.js';
import * as combat from './combat.js';
import { makeItem, defOf, nameOf, priceOf, dropHeavy, abandon, weightOf, carriedLevel, toggleItem } from './items.js';
import { lootFrom, lootSiteCard, groundPileAt, sitesHere, effortOptions, payEffort } from './search.js';
import { hasCurse, liftCursesAtChapel } from './effects.js';
import { restartAfterDeath } from './setup.js';
import { activeHorse } from './items.js';
import { extraActs, oneDie, locateMod } from './modifiers.js';
import { beginTrade, tradeAction } from './trade.js';
import { scoreGame } from './score.js';
import { canCastUsefully } from './spells.js';
import { beginHire, hireAction, followHero, expireHires } from './hire.js';

// The day loop (rules digest 01 section 4): Birdsong plan, Sunrise, Daylight phases, Sunset, Evening combat, Midnight.
// A game is a plain object; apply(state, data, action) returns the next state and never mutates its input.

export const LAST_DAY = 28;
export const PHASES = { basic: 2, sunlight: 2 };

// ---- starting a day ----
export function beginDay(st, data) {
    st.period = 'birdsong';
    st.plan = null;
    st.turn = null;
    st.ch.hiddenEnemies = false;
    st.ch.killsToday = 0;
    say(st, `Day ${st.day} begins.`, 'day');
    st.pending = { type: 'plan' };
}

// How many phases the day will give him, given what he plans.
export function phasesFor(st, data, slots) {
    const startsInCave = !st.ch.onRoad && isCave(st, data, st.ch.at);        // fleeing out of a cave leaves him on the road: a full day (8.3.8 d.2)
    const intoCave = slots.some(s => s?.act === 'move' && isCave(st, data, s.to));
    const sunlight = !startsInCave && !intoCave;
    // A working horse in use, and some treasure cards, give one more phase each, restricted to one activity.
    const extras = extraActs(st, data, { startsInCave, intoCave });
    const base = PHASES.basic + (sunlight ? PHASES.sunlight : 0);
    return { total: base + extras.length, base, sunlight, extras, extra: extras.length };
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
            else if (regular <= ph.base) kinds.push('sunlight');
            else {
                kinds.push('over');
                errors.push(ph.extras.length ? `Phase ${i + 1}: only ${ph.base} ordinary activities today; the extra phase can be used only for ${[...new Set(ph.extras)].join(' or ')}.` : `Phase ${i + 1} is not available today.`);
            }
        }
        if (s.act === 'move' && !s.to) errors.push(`Phase ${i + 1}: choose where to move.`);
    });
    return { kinds, errors, total: ph.total, base: ph.base, sunlight: ph.sunlight, extras: ph.extras };
}

export function validatePlan(st, data, slots) {
    const v = planKinds(st, data, slots);
    return { total: v.total, sunlight: v.sunlight, errors: v.errors, kinds: v.kinds };
}

function submitPlan(st, data, slots) {
    const v = validatePlan(st, data, slots);
    if (v.errors.length) throw new Error(v.errors[0]);
    st.planBase = phasesFor(st, data, slots.filter(Boolean)).base;
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
    if (st.day % 7 === 0) regenerate(st, data);
    // He becomes unhidden when his own turn begins.
    st.ch.hidden = false;
    st.period = 'daylight';
    st.turn = { i: 0, climb: null, blocked: false, results: [], movedHere: null, auto: false, base: st.planBase ?? 4, kinds: st.planKinds ?? null };
    st.pending = { type: 'phase', i: 0 };
}

function regenerate(st, data) {
    // The prowling row goes back to its starting boxes, even the slain (digest 05 section 5.3).
    let back = 0;
    for (const m of st.mons) {
        const def = data.monsters[m.id];
        if (m.hired) continue;
        if (def.family === 'Ghost') { if (m.loc?.c !== st.ghostsAt || m.dead) { m.loc = { c: st.ghostsAt }; m.dead = false; back++; } continue; }
        if (def.homeRow !== st.prowl) continue;
        if (m.loc?.c || m.dead) { m.loc = { box: def.homeBox }; m.dead = false; back++; }
    }
    for (const n of st.nats) {
        const def = data.natives[n.id], g = data.groups[def.group];
        if (n.hired || g.homeRow !== st.prowl) continue;
        if (n.dead || n.loc?.c) {
            n.dead = false; n.horseDead = false;
            n.loc = g.garrison ? { c: st.garrisonAt[g.garrison] } : { box: g.id };
            back++;
        }
    }
    say(st, `Regeneration: row ${st.prowl} creatures return to their homes.`, 'day');
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
    say(st, `Phase ${t.i + 1}: ${text}`, 'phase');
    if (st.ch.dead) return died(st, data);
    // End-of-phase blocking by monsters in his clearing.
    const bl = blockers(st);
    if (bl.length || t.forceBlock) {
        t.blocked = true;
        st.ch.hidden = false;
        say(st, bl.length ? `Blocked by ${bl.map(m => data.monsters[m.id].name).join(', ')}! The rest of your turn is lost.` : 'You are stopped: the rest of your turn is lost.', 'block');
        t.results[t.i] += ' (blocked)';
        return endDaylight(st, data);
    }
    t.i++;
    if (t.i >= st.plan.length) return endDaylight(st, data);
    st.pending = { type: 'phase', i: t.i };
}

function endDaylight(st, data) {
    // His turn is over: the world reacts.
    const res = endOfTurn(st, data);
    st.turn.end = res;
    const bl = blockers(st);
    if (bl.length && !st.turn.blocked) {
        st.turn.blocked = true; st.ch.hidden = false;
        say(st, `${bl.map(m => data.monsters[m.id].name).join(', ')} close in on you.`, 'block');
    }
    // Show him what the end of his turn did, before the evening begins.
    st.turnEnd = { ...res, day: st.day, blocked: !!st.turn.blocked, blockers: bl.map(m => data.monsters[m.id].name), plan: st.turn.results.slice() };
    st.period = 'turn-end';
    if (res.chits.length || res.arrivals.length || res.natives.length || st.turn.blocked) { st.pending = { type: 'turn-end' }; return; }
    afterTurnEnd(st, data);
}

function afterTurnEnd(st, data) {
    st.period = 'sunset';
    sunset(st, data);
}

function sunset(st, data) {
    say(st, 'The sun sets.', 'day');
    evening(st, data);
}

function hostilesHere(st, data) {
    const here = st.ch.at;
    const mons = st.mons.some(m => !m.dead && !m.hired && m.loc?.c === here);
    const nats = st.nats.some(n => !n.dead && !n.hired && n.loc?.c === here);
    return mons || nats || canCastUsefully(st, data);
}

function evening(st, data) {
    if (st.ch.dead) return died(st, data);
    st.period = 'evening';
    if (st.ch.onRoad) { midnight(st, data); return; }
    if (!hostilesHere(st, data)) { say(st, 'A quiet evening.', 'day'); return midnight(st, data); }
    combat.startCombat(st, data, st.ch.at);
    afterCombatStep(st, data);
}

function afterCombatStep(st, data) {
    const c = st.combat;
    if (c && c.ended) {
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
    expireHires(st, data);
    // what he carried lies where he fell, and the day's chits go back face down as at Midnight
    const items = st.ch.items.filter(i => !i.destroyed).map(i => ({ ...i, active: false, alerted: false }));
    if (items.length && st.ch.at) st.abandoned[st.ch.at] = [...(st.abandoned[st.ch.at] ?? []), ...items];
    st.ch.items = [];
    resetChitsAtMidnight(st);
    st.combat = null;
    st.period = 'over';
    st.over = { reason: 'died', day: st.day };
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
    for (const it of st.ch.items) if (it.kind === 'weapon') it.alerted = false;
    // potions are good until Midnight, then they go back to the box they came from
    const cardOf = it => data.treasures[it.card ?? (it.kind === 'treasure' ? it.id : '')];      // a card that became a counter keeps its card
    const spent = st.ch.items.filter(it => cardOf(it)?.discardTo);
    for (const it of spent) {
        const card = cardOf(it);
        (st.stock[card.discardTo] ??= []).push({ kind: 'treasure', id: card.id });
        say(st, `The ${card.name} is used up and returns to the ${card.discardTo}.`, 'info');
    }
    if (spent.length) st.ch.items = st.ch.items.filter(it => !spent.includes(it));
    resetChitsAtMidnight(st);
    liftCursesAtChapel(st);
    expireHires(st, data);
    st.combat = null;
    if (st.ch.onRoad) {
        // still out on the road overnight: the next day's plan must begin with a Move to either end
    }
    if (gameEnds(st, data)) {
        st.period = 'over';
        st.over = { reason: 'finished', day: st.day };
        st.score = scoreGame(st, data);
        say(st, 'The month ends.', 'day');
        st.pending = { type: 'over' };
        return;
    }
    st.day += 1;
    beginDay(st, data);
}

// ---- activities ----
function executeSlot(st, data, slot, i) {
    const t = st.turn;
    if (!slot) { t.climb = null; return 'You do nothing.'; }
    const here = st.ch.at;
    if (st.ch.onRoad && !(slot.act === 'move' && (slot.to === st.ch.onRoad.from || slot.to === st.ch.onRoad.to))) {
        // He is still out on a road; only a Move to one of its ends gets him anywhere.
        t.climb = null;
        return 'You are still on the road and cannot do that.';
    }
    switch (slot.act) {
        case 'move': return doMove(st, data, slot);
        case 'hide': { t.climb = null; return doHide(st, data); }
        case 'rest': { t.climb = null; return doRest(st, data); }
        case 'alert': { t.climb = null; return doAlert(st, data); }
        case 'search': { t.climb = null; return doSearch(st, data, slot); }
        case 'trade': { t.climb = null; return beginTrade(st, data) ? 'wait' : 'No one here will trade with you.'; }
        case 'hire': {
            t.climb = null;
            if (hasCurse(st, 'Ashes')) return 'Your gold is worthless under the Ashes curse: nobody will take it.';
            return beginHire(st, data) ? 'wait' : 'There is no one here to hire.';
        }
        default: t.climb = null; return 'Nothing happens.';
    }
}

function doMove(st, data, slot) {
    const t = st.turn, from = st.ch.onRoad ? null : st.ch.at;
    const to = slot.to;
    if (st.ch.onRoad) {
        const r = st.ch.onRoad;
        if (to !== r.from && to !== r.to) return 'You cannot reach that from the road.';
        if (isMountain(st, data, to) && t.climb !== to) { t.climb = to; return `You begin the climb toward ${nameOfClearing(to)}.`; }
        st.ch.arrivedFrom = to === r.to ? r.from : r.to; st.ch.at = to; st.ch.onRoad = null; t.climb = null;
        followHero(st);
        return arrive(st, data, to);
    }
    const road = roadsFrom(st, data, from).find(r => r.to === to);
    if (!road) { t.climb = null; return `There is no road from here to ${nameOfClearing(to)}: the move is lost.`; }
    if (!road.usable) { t.climb = null; return `You do not know the way to ${nameOfClearing(to)}: the move is lost.`; }
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

function arrive(st, data, to) {
    return `You move to ${nameOfClearing(to)}.`;
}

function doHide(st, data) {
    if (hasCurse(st, 'Squeak')) return 'The Squeak curse betrays you: you cannot hide.';
    if (st.ch.hidden) return 'You are already hidden.';
    const r = oneDie(st, 'hide', st.ch.at, data) ? { dice: [die(st)], value: 0 } : roll2(st);
    if (r.value === 0) r.value = r.dice[0];
    noteRoll(st, 'Hide', r.dice, r.value, hides(r.value) ? 'You hide' : 'You are seen');
    if (hides(r.value)) { st.ch.hidden = true; return `You hide (rolled ${r.dice.join('+')}).`; }
    return `You fail to hide (rolled ${r.dice.join('+')}).`;
}

function doAlert(st, data) {
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
    const wither = (st.ch.curses ?? []).includes('Wither');
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
export function searchTables(st) {
    const here = st.ch.at;
    return ['peer', 'locate', 'loot', ...((st.abandoned[here] ?? []).length ? ['ground'] : []), ...(st.ch.siteCards?.[here]?.length ? ['sitecard'] : [])];
}

function doSearch(st, data, slot) {
    if (hasCurse(st, 'Eyemist')) return 'The Eyemist curse blinds you: you cannot search.';
    if (!slot.table) {
        // no table was named in the plan: ask when the phase comes
        st.pending = { type: 'search-table', options: searchTables(st) };
        return 'wait';
    }
    const table = slot.table;
    // Searching the Cairns costs an asterisk of effort for every Loot roll, found or not, paid before the roll; the player picks the chit.
    if (table === 'loot' && !slot.paid && sitesHere(st)[0]?.name === 'Cairns') {
        const opts = effortOptions(st);
        if (!opts.length) return 'The Cairns demand an asterisk of effort for every roll, and you have none to give: you cannot search them.';
        if (opts.length === 1) say(st, payEffort(st, opts[0]), 'info');
        else { st.pending = { type: 'effort-cost', site: 'Cairns', options: opts, resume: 'search', slot: { act: 'search', table: 'loot' } }; return 'wait'; }
    }
    let r;
    if (oneDie(st, table === 'loot' || table === 'ground' || table === 'sitecard' ? 'loot' : 'search', st.ch.at, data)) { const d1 = die(st); r = { dice: [d1], value: d1 }; } else r = roll2(st);
    const rawDice = [...r.dice];
    if (table === 'locate') { const m = locateMod(st, tileOf(st.ch.at), data); if (m) { r.value = Math.max(1, r.value + m); r.dice = [...r.dice, `${m}`]; } }
    const SEARCH_WHAT = { peer: 'Search: Peer', locate: 'Search: Locate', loot: 'Search: Loot', ground: 'Search: Loot the ground', sitecard: 'Search: Site card' };
    const tableList = table === 'peer' ? PEER : table === 'locate' ? LOCATE : null;
    noteRoll(st, SEARCH_WHAT[table] ?? 'Search', rawDice, r.value, tableList ? tableList[Math.min(5, r.value - 1)] ?? '' : '');
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

function applySearchResult(st, data, table, res, dice) {
    const here = st.ch.at, tile = tileOf(here);
    const bits = [];
    const lead = `${table === 'peer' ? 'Peer' : 'Locate'} (${dice.join('+')}): ${res}.`;
    if (/Clues/.test(res)) {
        const ids = st.chits.filter(c => c.tile === tile && !c.up && !c.pile).map(c => c.id);
        for (const id of ids) if (!st.ch.seen.includes(id)) st.ch.seen.push(id);
        bits.push(`You learn what the ${ids.length} unrevealed chit${ids.length === 1 ? '' : 's'} here are.`);
    }
    if (/Hidden enemies/.test(res)) { st.ch.hiddenEnemies = true; bits.push('You can now find hidden foes today.'); }
    if (/Paths/.test(res)) bits.push(discoverPaths(st, data, here, 'hidden'));
    if (/Passages/.test(res)) bits.push(discoverPaths(st, data, here, 'secret'));
    if (/Discover chits/.test(res)) {
        const ids = st.chits.filter(c => c.kind === 'site' && c.tile === tile && c.num === numOf(here) && !c.pile).map(c => c.id);
        for (const id of ids) { if (!st.ch.discovered.sites.includes(id)) { st.ch.discovered.sites.push(id); tally(st, 'sitesDiscovered'); } if (!st.ch.seen.includes(id)) st.ch.seen.push(id); }
        bits.push(ids.length ? `You discover a site here: ${ids.map(id => st.chits.find(c => c.id === id).name).join(', ')}.` : 'There is no site in this clearing.');
    }
    if (res === 'Nothing') bits.push('You find nothing.');
    return [lead, ...bits.filter(Boolean)].join(' ');
}

function discoverPaths(st, data, clearing, kind) {
    const found = [];
    for (const r of roadsFrom(st, data, clearing)) {
        if (r.kind !== kind) continue;
        const key = pathKey(clearing, r.to);
        if (!st.ch.discovered.paths.includes(key)) { st.ch.discovered.paths.push(key); found.push(nameOfClearing(r.to)); }
    }
    return found.length ? `You discover the ${kind === 'hidden' ? 'hidden path' : 'secret passage'} to ${found.join(', ')}.` : '';
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
            submitPlan(st, data, action.slots);
            if (st.pending?.type === 'phase' && action.autoplay) autoplay(st, data);
            return st;
        }
        case 'next': {
            if (p.type !== 'phase') throw new Error('not in a phase');
            st.pending = null;
            runPhase(st, data);
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
            if (!p.options.includes(action.table)) throw new Error('you cannot search that table here');
            st.pending = null;
            const text = doSearch(st, data, { act: 'search', table: action.table });
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
            const text = p.resume === 'search' ? doSearch(st, data, { ...p.slot, paid: true }) : lootFrom(st, data, p.r, p.ground, { paid: true });
            if (text === 'wait') return st;
            finishPhase(st, data, text);
            return settle(st, data, st.turn?.auto);
        }
        case 'search-choice': {
            if (p.type !== 'search-choice') throw new Error('not choosing');
            if (!p.options.includes(action.result)) throw new Error('not a result on that table');
            st.pending = null;
            const text = applySearchResult(st, data, p.table, action.result, p.roll);
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
            const kindFor = { 'combat-pay': 'pay', 'combat-drinks': 'drinks', 'combat-choice': 'choice', 'combat-encounter': 'encounter', 'combat-melee': 'melee', 'combat-wounds': 'wounds', 'combat-fatigue': 'fatigue' };
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
        case 'tidy': {
            if (p.type !== 'phase' && p.type !== 'plan') throw new Error('you can only rearrange your gear between phases (in a fight, use your Encounter action)');
            // free item management outside combat: switch items on and off
            const it = st.ch.items.find(i => i.uid === action.item);
            if (!it) throw new Error('no such item');
            if (action.drop) {
                // 4.3.2: he may abandon a belonging at the start of any phase; it lies where he stands
                const where = st.ch.at ?? st.ch.onRoad?.from;
                st.ch.items = st.ch.items.filter(i => i.uid !== it.uid);
                st.abandoned[where] = [...(st.abandoned[where] ?? []), { ...it, active: false, alerted: false }];
                say(st, `You leave the ${nameOf(data, it)} behind.`, 'info');
                st.pending = p;
                return st;
            }
            if (it.kind === 'horse' && !it.active) {
                const hd = data.horses[it.id];
                if (isCave(st, data, st.ch.at)) throw new Error('A horse cannot be ridden in a cave.');
                if (lvl(hd.walk.strength) < Math.max(lvl(st.ch.weight), carriedLevel(st, data))) throw new Error('The horse is not strong enough to carry you and your gear.');
                st.ch.items.filter(o => o.kind === 'horse').forEach(o => { o.active = false; });
            }
            toggleItem(st, data, it);
            say(st, `You ${it.active ? 'activate' : 'deactivate'} the ${nameOf(data, it)}.`, 'info');
            st.pending = p;
            return st;
        }
        case 'open': {
            if (p.type !== 'phase' && p.type !== 'plan') throw new Error('you can only open it between phases');
            // The Chest opens with the Lost Keys: its two large treasures and fifty gold replace it.
            const chest = st.ch.items.find(i => i.uid === action.item && i.id === 'chest');
            if (!chest) throw new Error('no chest to open');
            if (!st.ch.items.some(i => i.id === 'lost-keys' && i.active)) throw new Error('The Chest needs the Lost Keys.');
            st.ch.items = st.ch.items.filter(i => i.uid !== chest.uid);
            for (const l of st.twt.chest.large) st.ch.items.push(makeItem(st, l.kind, l.id));
            st.ch.gold += st.twt.chest.gold || 50;
            say(st, 'You open the Chest: two fine treasures and fifty gold.', 'loot');
            st.pending = p;
            return st;
        }
        default: throw new Error('unknown action ' + action.type);
    }
}

function combatAction(st, data, a) {
    switch (a.kind) {
        case 'pay': return combat.payOrFight(st, data, a.pay);
        case 'drinks': return combat.drinksAction(st, data, a.buy);
        case 'choice': return combat.choiceAction(st, data, a.fight);
        case 'encounter': return combat.encounterAction(st, data, a);
        case 'melee': return combat.meleePlay(st, data, a);
        case 'wounds': return combat.chooseWounds(st, data, a.chits);
        case 'fatigue': return combat.chooseFatigue(st, data, a.chits);
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
    while (st.pending?.type === 'phase' && guard++ < 20) { st.pending = null; runPhase(st, data); }
    if (st.turn && st.pending?.type !== 'phase') st.turn.auto = false;
}
