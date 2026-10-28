import { say, int, shuffle } from './core.js';
import { graph } from './world.js';

// Visitor, mission and campaign chits (rules 2.2.5, 3.4, 6.3.4b, 7.2.4, 7.13.5). A game option (`newGame(data, { missions: true })`, default off): without it none of this exists,
// there is no `st.missions` and nothing in the other modules reads it, so a game is exactly what it was.
//
// The six chits are two-sided (the data: `appearance.visitorChits` lists the twelve faces and their pairs, `natives.json` the visitors, missions and campaigns, `data.chitDefs`):
//   Scholar/Pillage, Shaman/Escort Party, Warlock/Food-Ale, Crone/Raid, Conquer/War, Revolt/Quest.
// State (present only when the option is on):
//   st.missions = { chits: [ { id: <pair>, face: <face id>, loc: { box } | { c } | { by } } ] }       six chits; `box` a small box of row 6 of the Appearance Chart, `c` lying in a
//                                                                                                     clearing, `by` a character's possession
//   st.options.missions = true
//   ch.missions = [ <a task he has taken> ]                                                          see `takeChit` for the shape; absent until he takes a chit
//
// The questions the text leaves open are in docs/rules-spec/rulings/ch-missions.md; each is answered by one named function here, so a different ruling is a small change.

const ROW = 6;
export const on = st => !!st.missions;

// ---- the components (all from the data files)
export const pairIds = data => [...new Set(data.appearance.visitorChits.map(c => c.pair))];
export const facesOf = (data, pair) => data.appearance.visitorChits.filter(c => c.pair === pair).map(c => c.id);
export const boxIds = data => data.appearance.rows.find(r => r.row === ROW).boxes.filter(b => b.kind === 'visitor').map(b => b.id);
export const boxDef = (data, id) => data.appearance.rows.find(r => r.row === ROW).boxes.find(b => b.id === id);
// 'visitor' (Crone, Scholar, Shaman, Warlock), 'mission' (Escort Party, Food/Ale) or 'campaign' (the other six); null for anything else (2.2.5)
export const kindOf = (data, face) => (data.chitDefs.visitor[face] ? 'visitor' : data.chitDefs.mission[face] ? 'mission' : data.chitDefs.campaign[face] ? 'campaign' : null);
export const defOf = (data, face) => data.chitDefs.visitor[face] ?? data.chitDefs.mission[face] ?? data.chitDefs.campaign[face] ?? null;
export const otherFace = (data, pair, face) => facesOf(data, pair).find(f => f !== face);
export const chitOf = (st, pair) => st.missions?.chits.find(c => c.id === pair) ?? null;

// ---- setting up (3.4): every player with a character puts one of the six chits in one of the seven small boxes of row 6, either side up, until all six are placed
// `spec` is `true` (everything left to chance) or `{ place: [{ chit, face?, box? }] }`: the players' choices, in the order they were made. A chit that was not placed by hand is put in an empty box
// at random, either side up. Any choice that breaks 3.4 is refused: a chit not among the six or already in a box (3.4.2), a side the chit has not (3.4.2), a box that is not one of the seven
// or already holds a chit (3.4.3).
export function setupVisitorChits(st, data, spec) {
    const pairs = pairIds(data), boxes = boxIds(data), place = Array.isArray(spec?.place) ? spec.place : [];
    const chits = [], used = new Set(), done = new Set();
    for (const p of place) {
        if (!pairs.includes(p.chit)) throw new Error(`there is no visitor/mission chit "${p.chit}": the six are ${pairs.join(', ')} (3.4.2)`);
        if (done.has(p.chit)) throw new Error(`the ${p.chit} chit is already in a box: only an available chit can be taken (3.4.2)`);
        const faces = facesOf(data, p.chit), face = p.face ?? faces[int(st, 2, 'setup.visitors.face')];
        if (!faces.includes(face)) throw new Error(`the ${p.chit} chit has no "${face}" side (3.4.2)`);
        if (!boxes.includes(p.box)) throw new Error(`"${p.box}" is not one of the seven small boxes (3.4.3)`);
        if (used.has(p.box)) throw new Error(`the box ${p.box} already holds a chit (3.4.3)`);
        used.add(p.box); done.add(p.chit);
        chits.push({ id: p.chit, face, loc: { box: p.box } });
    }
    const free = shuffle(st, boxes.filter(b => !used.has(b)), 'setup.visitors.box');
    for (const pair of pairs.filter(x => !done.has(x))) {
        const faces = facesOf(data, pair);
        chits.push({ id: pair, face: faces[int(st, 2, 'setup.visitors.face')], loc: { box: free.shift() } });
    }
    st.missions = { chits: pairs.map(p => chits.find(c => c.id === p)) };
    (st.options ??= {}).missions = true;
    return st;
}

// ---- 7.13.5: when Row 6 prowls the chits in the small boxes are summoned by the leaders and sites listed above their boxes
// The individual who ends his turn in a clearing with an unhired native leader of a listed group, or with a listed Site chit or Site card, calls the chit of that box to his clearing, hidden or not.
// A Site chit "is" in a clearing once it has been put there (turned up, 7.13.2b); a Site card is assumed to be in the clearing of the chit whose box it lies in (7.5.5 g.2, the List of Treasures).
// Called by summon.js at the end of a turn, after the map chits of the tile have turned up. Returns the ids of the chits that appeared.
export function summonVisitors(st, data, here) {
    if (!st.missions || st.prowl !== ROW) return [];
    const out = [];
    for (const c of st.missions.chits) {
        const box = c.loc?.box;
        if (!box || !(boxDef(data, box)?.summonedBy ?? []).some(s => summonedHere(st, data, s, here))) continue;
        c.loc = { c: here };
        out.push(c.id);
        say(st, `A ${defOf(data, c.face)?.name ?? c.face} chit appears in clearing ${here.slice(2)}.`, 'discover');
    }
    return out;
}
const leaderOf = (data, group) => `${data.groups[group].letter}HQ`;
const siteClearing = c => (c.kind === 'site' && c.tile && c.clearing != null ? c.tile + c.clearing : null);
function summonedHere(st, data, s, here) {
    if (s.leaderOf) { const n = st.nats.find(x => x.id === leaderOf(data, s.leaderOf)); return !!n && !n.dead && !n.hired && n.loc?.c === here; }
    if (!s.site) return false;
    const card = Object.values(data.treasures).find(t => t.name === s.site && t.kind === 'twt');          // a Site card (Enchanted Meadow, Toadstool Circle): in the box of a chit lying here
    if (card) return st.chits.some(c => siteClearing(c) === here && (st.sites[c.name] ?? []).some(x => x.id === card.id));
    return st.chits.some(c => c.name === s.site && siteClearing(c) === here);                    // a Site chit (Altar, Shrine) lying here
}

// ---- 6.3.4b: at the end of a week in which Row 6 prowls, every visitor, mission and campaign chit turns over where it lies (a box, a clearing); one a character holds does not
export function flipChits(st, data) {
    if (!st.missions || st.prowl !== ROW) return [];
    const out = [];
    for (const c of st.missions.chits) {
        if (c.loc?.by) continue;
        c.face = otherFace(data, c.id, c.face);
        out.push(c.id);
    }
    if (out.length) say(st, 'The visitor, mission and campaign chits that nobody carries turn over.', 'day');
    return out;
}

// ============================================================================================================================================================================
// Taking the chits and carrying out the tasks (7.2.4)
// ch.missions: one record for each chit a character carries (at most one campaign, any of the two missions):
//   mission:  { chit, face, kind: 'mission',  day, due, cost: { fame, notoriety }, dest: 'Inn'|'House'|'Chapel'|'Guard house', clearings: <count>|null, reward: <gold> }
//   campaign: { chit, face, kind: 'campaign', day, due, cost: { fame, notoriety }, partners: [group], foes: [group or monster family] }
// `day` is the day he took it and `due` the day at whose Midnight the time limit runs out (rulings M1 and M2 in rulings/ch-missions.md).

const GROUP_LEVELS = 2;                            // 7.2.4h: the chit adds two levels of friendliness with each group of partners
export const WHO_CAN_TAKE = ['character'];         // 7.2.4: "Hired leaders and controlled monsters cannot take these chits"
const carried = ch => ch.missions ?? [];
const placeOf = ch => ch.at ?? ch.onRoad?.from ?? null;
const lastingGame = st => st.mode !== 'month' || (st.lastDay ?? 28) > 28;
const livingChars = st => (st.order ?? []).map(id => st.chars[id]).filter(c => c && !c.dead);
const nameOf = (data, face) => defOf(data, face)?.name ?? face;

// ---- rulings M1 and M2: the day at whose Midnight the time limit runs out
// 14 days "counting the day that the character takes the chit as the first day" (7.2.4f.2; the missions of 7.2.4e.1 say only "within 14 days": ruling M1, the same count). The long campaigns last to the end of
// the game, or 28 days (counting the same way) "in a game lasting more than one month" (7.2.4f.1; ruling M2: any game that is not a one-month game).
export function dueDay(st, def) {
    if (def.timeLimit === 14) return st.day + 13;
    return lastingGame(st) ? st.day + 27 : (st.lastDay ?? 28);
}

// ---- the Dwellings and the route (7.2.4e)
export const dwellingAt = (st, kind) => st.dwellings.find(d => d.kind === kind)?.at ?? null;
// 7.2.4e.2 and e.3: where the chit must be taken. Food/Ale: the Inn, but picked up at the Inn: the House. Escort Party: the Chapel, but picked up at the Chapel: the Guard house.
export function destinationFor(st, face, at) {
    const [first, second] = face === 'food_ale' ? ['Inn', 'House'] : ['Chapel', 'Guard house'];
    return dwellingAt(st, first) === at ? second : first;
}
// 7.2.4e.1: the number of clearings along the shortest route, by any roadway whether he knows it or not (ruling M3): the clearings he enters, the one he stands in not counted. null: no route.
export function routeLength(st, data, from, to) {
    const adj = graph(st, data).adj, dist = new Map([[from, 0]]), q = [from];
    while (q.length) {
        const x = q.shift();
        if (x === to) return dist.get(x);
        for (const r of adj.get(x) ?? []) if (!dist.has(r.to)) { dist.set(r.to, dist.get(x) + 1); q.push(r.to); }
    }
    return null;
}
// the reward: 2 gold for each clearing counted; 30 when there is no route or the Dwelling is not on the board (7.2.4e.1)
export function missionTerms(st, data, face, at) {
    const dest = destinationFor(st, face, at), there = dwellingAt(st, dest), n = there ? routeLength(st, data, at, there) : null;
    return n == null || n === 0 ? { dest, clearings: null, reward: 30 } : { dest, clearings: n, reward: 2 * n };
}

// ---- the foes of a campaign (7.2.4g, 7.2.4i, 7.2.4j)
// A foe is a native group, or a family of monsters (Quest: the Dragons and Flying Dragons of every size). "On the map" is a place in a clearing; garrison natives always count as on the map
// (7.2.4g). One killed is out of play (and comes back only by regeneration, 6.3.4a). Everything else alive is "on the Setup Card" (a box of the Appearance Chart or of the Set Up Card).
const FAMILY = { Dragon: 'Dragon', 'Flying Dragon': 'Dragon' };
export function foeCount(st, data, foes) {
    let map = 0, card = 0;
    const families = [...new Set(foes.filter(f => !data.groups[f]).map(f => FAMILY[f] ?? f))];
    for (const f of foes.filter(g => data.groups[g])) {
        for (const n of st.nats) {
            if (n.dead || data.natives[n.id].group !== f) continue;
            if (n.loc?.c || n.loc?.flying || data.groups[f].garrison) map++; else card++;
        }
    }
    for (const fam of families) {
        for (const m of st.mons) {
            if (m.dead || data.monsters[m.id].family !== fam) continue;
            if ((m.loc?.c || m.loc?.flying) && !m.absorbed) map++; else card++;
        }
    }
    return { map, card, total: map + card };
}

// ---- 7.2.4h: the relationships a carried campaign chit changes
export const isFoe = (st, group, ch = st.ch) => carried(ch).some(e => e.kind === 'campaign' && e.foes.includes(group));
// the level he trades at: always Enemy for a foe, else his own (partners already stand two levels higher in ch.rel, kept above Ally; the Meeting Table clamps the column, 7.2.4h.1)
export const relation = (st, group, rel, ch = st.ch) => (isFoe(st, group, ch) ? -2 : rel);
export const noDrinks = (st, group, ch = st.ch) => isFoe(st, group, ch);                 // "he cannot buy drinks for foes"
const shift = (ch, e, d) => { for (const g of e.partners ?? []) ch.rel[g] = (ch.rel[g] ?? 0) + d; };

// ---- taking a chit
// Why a character cannot take the chit now, or null (the screens use this to show the chit as greyed out).
export function whyNot(st, data, pair, ch = st.ch, { as = 'character' } = {}) {
    const c = chitOf(st, pair);
    if (!c) return `there is no chit "${pair}"`;
    if (!WHO_CAN_TAKE.includes(as)) return 'hired leaders and controlled monsters cannot take these chits (7.2.4)';
    if (ch.dead) return 'a dead character takes nothing';
    const here = ch.onRoad || ch.flying || ch.mist ? null : ch.at;
    if (!here || c.loc?.c !== here) return `the ${nameOf(data, c.face)} chit is not in your clearing (7.2.4)`;
    const kind = kindOf(data, c.face), def = defOf(data, c.face);
    if (kind !== 'mission' && kind !== 'campaign') return `the ${def?.name ?? c.face} chit shows a visitor: only mission and campaign chits can be taken (7.2.4)`;
    if (kind === 'campaign' && carried(ch).some(e => e.kind === 'campaign')) return 'you can carry only one campaign chit at a time (7.2.4a)';
    if (ch.fame < 0 || ch.notoriety < 0) return 'you cannot take a chit while your Fame or Notoriety is negative (7.2.4c)';
    if (ch.fame - def.fameCost < 0 || ch.notoriety - def.notorietyCost < 0) return `you cannot pay the ${def.name} chit's cost of ${points({ fame: def.fameCost, notoriety: def.notorietyCost })} (7.2.4c)`;
    if (kind === 'campaign' && !foeCount(st, data, def.foes).map) return `none of the ${def.name} chit's foes is on the map (7.2.4g)`;
    return null;
}
export function takeChit(st, data, pair, ch = st.ch, opt = {}) {
    const bad = whyNot(st, data, pair, ch, opt);
    if (bad) throw new Error(bad.charAt(0).toUpperCase() + bad.slice(1));
    const c = chitOf(st, pair), def = defOf(data, c.face), kind = kindOf(data, c.face);
    ch.fame -= def.fameCost; ch.notoriety -= def.notorietyCost;                         // 7.2.4c: the cost is paid at once
    const e = { chit: pair, face: c.face, kind, day: st.day, due: dueDay(st, def), cost: { fame: def.fameCost, notoriety: def.notorietyCost } };
    if (kind === 'mission') Object.assign(e, missionTerms(st, data, c.face, placeOf(ch)));
    else { e.partners = def.partners.slice(); e.foes = def.foes.slice(); shift(ch, e, GROUP_LEVELS); }
    (ch.missions ??= []).push(e);
    c.loc = { by: ch.id };
    const cost = [def.fameCost && `${def.fameCost} Fame`, def.notorietyCost && `${def.notorietyCost} Notoriety`].filter(Boolean).join(' and ');
    say(st, kind === 'mission'
        ? `You take the ${def.name} chit (${cost}): deliver it to the ${e.dest} by Midnight of day ${e.due} for ${e.reward} gold.`
        : `You take the ${def.name} chit (${cost}): kill every ${e.foes.join(' and ')} by Midnight of day ${e.due}.`, 'info');
    return e;
}

// ---- ending a task: the chit goes back to the map
function release(st, data, ch, e, where) {
    ch.missions = carried(ch).filter(x => x !== e);
    if (e.kind === 'campaign') shift(ch, e, -GROUP_LEVELS);                                // 7.2.4h.2: the partners drop two levels again, the foes are as they were
    const c = chitOf(st, e.chit);
    if (c) c.loc = { c: where };
}
const points = c => [c.fame && `${c.fame} Fame`, c.notoriety && `${c.notoriety} Notoriety`].filter(Boolean).join(' and ');
// delivered (7.2.4e.4), campaign won (7.2.4i): the cost comes back
function complete(st, data, ch, e, where, why) {
    ch.fame += e.cost.fame; ch.notoriety += e.cost.notoriety;
    if (e.reward) ch.gold += e.reward;
    release(st, data, ch, e, where);
    say(st, `${why} You regain ${points(e.cost)}${e.reward ? ` and collect ${e.reward} gold` : ''}.`, 'info');
}
// the time limit ran out, or the game ended with the task undone (7.2.4d): nothing back, the cost paid again; this may take the value below zero (Mike, 2026-10-24)
function fail(st, data, ch, e, why) {
    ch.fame -= e.cost.fame; ch.notoriety -= e.cost.notoriety;
    release(st, data, ch, e, placeOf(ch));
    say(st, `${why} The ${nameOf(data, e.face)} chit is put down in your clearing and you pay its cost again (${points(e.cost)}).`, 'info');
}

// 7.2.4e.4: he moves (or lands) in the clearing of the Dwelling while carrying the chit: the task is complete at once and the chit is put at the Dwelling. Returns the words for the phase.
export function onArrive(st, data, to, ch = st.ch) {
    let text = '';
    for (const e of carried(ch).filter(x => x.kind === 'mission')) {
        if (dwellingAt(st, e.dest) !== to) continue;
        complete(st, data, ch, e, to, `You bring the ${nameOf(data, e.face)} chit to the ${e.dest}.`);
        text += ` You deliver the ${nameOf(data, e.face)} chit to the ${e.dest} and collect ${e.reward} gold.`;
    }
    return text;
}

// 7.2.4i: a campaign is complete when all of its foes are dead together, killed by himself or by others; looked at whenever something could have changed it
export function tick(st, data) {
    for (const ch of livingChars(st)) for (const e of carried(ch).filter(x => x.kind === 'campaign')) {
        if (foeCount(st, data, e.foes).total === 0) complete(st, data, ch, e, placeOf(ch), 'Your campaign is won: every foe is dead.');
    }
}
// 7.2.4j: he may give a campaign up when none of its foes is on the map (some may be on the Setup Card): no refund, and the cost is not paid again
export function abandonChit(st, data, pair, ch = st.ch) {
    const e = carried(ch).find(x => x.chit === pair);
    if (!e) throw new Error('you do not carry that chit');
    if (e.kind !== 'campaign') throw new Error('a mission chit cannot be given up: keep it until the task is done or the time runs out (7.2.4b)');
    if (foeCount(st, data, e.foes).map) throw new Error('a foe of your campaign is still on the map: you cannot give it up (7.2.4j)');
    release(st, data, ch, e, placeOf(ch));
    say(st, `You give up the ${nameOf(data, e.face)} campaign: the chit is put down in your clearing and you get nothing back.`, 'info');
}

// Midnight: first any campaign that was won today, then every task whose limit is today (or all of them if the game ends now) has failed
export function atMidnight(st, data, ending) {
    tick(st, data);
    for (const ch of livingChars(st)) for (const e of carried(ch).filter(x => ending || x.due <= st.day)) {
        fail(st, data, ch, e, ending ? 'The game ends with the task undone.' : `The time limit of the ${nameOf(data, e.face)} chit runs out.`);
    }
}
// the game ends now (an agreed end), or a character leaves the map: what is undone fails
export function failAll(st, data, ch) {
    for (const e of [...carried(ch)]) fail(st, data, ch, e, 'The game ends for you with the task undone.');
}
export function failEveryone(st, data) { for (const ch of livingChars(st)) failAll(st, data, ch); }
// he is killed (7.2.4b): the chits are put down where he fell, nothing is charged (Mike, 2026-10-24)
export function dropAll(st, data, ch) {
    for (const e of [...carried(ch)]) { release(st, data, ch, e, placeOf(ch)); say(st, `The ${nameOf(data, e.face)} chit is put down where you fell.`, 'info'); }
}

// ---- for the screens and for the other modules
// The visitors (Crone, Scholar, Shaman, Warlock side up) lying in a clearing, for trading with them (7.6, 7.13.5): [{ chit, face, name }]. A visitor never moves and stays for the rest of the game
// (7.13.5); the visitors cannot attack nor be attacked (8.4.2) and can never be killed (8.7.6).
export function visitorsAt(st, data, clearing) {
    return (st.missions?.chits ?? []).filter(c => c.loc?.c === clearing && kindOf(data, c.face) === 'visitor').map(c => ({ chit: c.id, face: c.face, name: nameOf(data, c.face) }));
}
// The mission and campaign chits in his clearing and whether he may take each now: [{ chit, face, name, kind, cost, ok, why }]
export function takeable(st, data, ch = st.ch) {
    const here = ch.onRoad || ch.flying || ch.mist ? null : ch.at;
    return (st.missions?.chits ?? []).filter(c => here && c.loc?.c === here && ['mission', 'campaign'].includes(kindOf(data, c.face))).map(c => {
        const def = defOf(data, c.face), why = whyNot(st, data, c.id, ch);
        return { chit: c.id, face: c.face, name: def.name, kind: kindOf(data, c.face), cost: { fame: def.fameCost, notoriety: def.notorietyCost }, ok: !why, why };
    });
}
// What he carries, for the character sheet: the record plus the days left (counting today) and, for a campaign, the foes still to kill.
export function carriedTasks(st, data, ch = st.ch) {
    return carried(ch).map(e => ({ ...e, name: nameOf(data, e.face), daysLeft: e.due - st.day + 1, ...(e.kind === 'campaign' ? { foesLeft: foeCount(st, data, e.foes), mayAbandon: foeCount(st, data, e.foes).map === 0 } : {}) }));
}
