import { say } from './core.js';
import { isMulti } from './party.js';

// THE STATE OF A HIRELING: who he follows, whether he is hidden, which side of his counter is up (rules 6.3.1, 6.3.1b, 7.4.5, 7.7.1g, 7.7.3, 7.7.5d, 7.7.5f, 8.1.4b, 8.8.6, 8.3.4c.3).
// Hired leaders and controlled monsters have a seat of their own (leaders.js); this file is about the rest, the UNDERLINGS (hired natives who are not leaders, and hired monsters), and
// about the counters of all hirelings. It is the rules of ruling H7 (Mike, 2026-10-26: "build with the hired-leaders work"). Everything here runs only when the game has the option
// `options.hirelingRules` (newGame `options: { hirelingRules: true }`); without it a hireling follows his hirer everywhere, as the engine always had it (hire.js followHero).
//
// On a hired counter (a record of st.nats or st.mons) the option adds:
//   guide   the id of the character or hired leader he follows today, or null: "Underlings that are not assigned will spend the day where they are" (6.3.1)
//   hidden  true while he is hidden; he is unhidden at the start of every day and can hide only by following a guide who hides (6.3.1b, 7.4.5)
//   side    'light' | 'dark' | 'red': light side up unhidden, dark side up hidden, and a hidden Tremendous monster red side up (7.7.1g, 7.7.5d)
// Assignment is made in Birdsong, with the plan (the `assign` map of the plan action) or before it with the action { type: 'hireling', kind: 'assign', assign: { L1: 'amazon', L2: null } };
// a guide's underlings go where he goes (hire.js followHero), and the hirer may let them stay behind when the guide starts an activity: { type: 'hireling', kind: 'stay', ids: [..] } (7.7.3a, 7.11.5).

export const rulesOn = st => !!st?.options?.hirelingRules;
const counters = st => [...st.nats, ...st.mons];
const alive = o => o.hired && !o.dead;
const isLeaderNat = (data, o) => !!data.natives[o.id]?.leader;
const isControlled = o => o.tie?.kind === 'control';
// An underling: a hired native who is not a leader, or a monster hired for gold (a controlled monster, like a hired leader, has a seat: leaders.js).
export const isUnderling = (data, o) => (data.natives[o.id] ? !isLeaderNat(data, o) : !isControlled(o));
const nameOf = (data, o) => data.natives[o.id]?.name ?? data.monsters[o.id]?.name ?? o.id;
const kindOf = (data, o) => (data.natives[o.id] ? 'nat' : 'mon');

export const underlingsOf = (st, data, hirer) => counters(st).filter(o => alive(o) && isUnderling(data, o) && (o.hiredBy ?? hirer) === hirer);

// The characters and hired leaders an underling standing in `at` may follow (6.3.1): anyone alive and standing in his clearing (not on a road, not in the air).
function guidesAt(st, at) {
    return st.order.filter(id => { const c = st.chars[id]; return c && !c.dead && c.at === at && !c.onRoad && !c.flying; });
}

// What the plan screen needs: the hirer's underlings, where each stands, whom he could follow, whom he follows now.
export function planInfo(st, data, hirer) {
    if (!rulesOn(st)) return null;
    const list = underlingsOf(st, data, hirer).map(o => ({ id: o.id, kind: kindOf(data, o), name: nameOf(data, o), at: o.loc?.c ?? null, guide: o.guide ?? null, hidden: !!o.hidden, side: o.side ?? 'light', guides: o.loc?.c ? guidesAt(st, o.loc.c) : [], today: o.hiredDay === st.day }));
    return list.length ? list : null;
}

// Assign (or release) underlings. `map` is { underling id: guide id | null }. Throws, changing nothing, on the first thing that cannot be (all or nothing).
export function assign(st, data, hirer, map) {
    if (!map || !Object.keys(map).length) return;
    if (!rulesOn(st)) throw new Error('underlings are assigned to guides under the hireling rules (newGame option hirelingRules)');
    const plan = [];
    for (const [id, gid] of Object.entries(map)) {
        const o = underlingsOf(st, data, hirer).find(x => x.id === id);
        if (!o) throw new Error(`${id} is not one of your hired underlings`);
        if (gid == null) { plan.push([o, null]); continue; }
        if (st.period !== 'birdsong') throw new Error('underlings are assigned to their guides in Birdsong (6.3.1)');
        if (o.hiredDay === st.day) throw new Error(`${nameOf(data, o)} was hired today: he cannot follow anyone until the next Birdsong (7.11.3)`);
        const g = st.chars[gid];
        if (!g || g.dead) throw new Error(`there is no ${gid} to follow`);
        if (!o.loc?.c || !guidesAt(st, o.loc.c).includes(gid)) throw new Error(`${g.name} is not in the clearing of ${nameOf(data, o)}: an underling can follow only a character or hired leader in his own clearing (6.3.1)`);
        plan.push([o, gid]);
    }
    for (const [o, gid] of plan) {
        if ((o.guide ?? null) === gid) continue;
        o.guide = gid;
        say(st, gid ? `${nameOf(data, o)} will follow ${st.chars[gid].name} today.` : `${nameOf(data, o)} will spend the day where he is.`, 'info');
    }
}

// The hirer lets underlings stay behind when their guide starts an activity (7.7.3a, 7.11.5): they are put on the map where the guide was when the phase began.
export function stay(st, data, hirer, ids) {
    const mine = underlingsOf(st, data, hirer).filter(o => o.guide && (!ids || ids.includes(o.id)));
    if (!mine.length) throw new Error('none of your underlings is following anyone');
    if (st.period !== 'daylight') throw new Error('underlings can stay behind only when their guide starts an activity (7.11.5)');
    for (const o of mine) {
        const g = st.chars[o.guide];
        if (!g || !turnOn(st, o.guide) || !atPhaseStart(st, o.guide)) throw new Error(`${nameOf(data, o)} can stay behind only when ${g?.name ?? 'his guide'} is about to start an activity (7.11.5)`);
    }
    for (const o of mine) {
        say(st, `${nameOf(data, o)} stays behind in clearing ${o.loc?.c ?? '?'}.`, 'info');
        o.guide = null;
    }
}

export function act(st, data, a) {
    if (!rulesOn(st)) throw new Error('this is part of the hireling rules (newGame option hirelingRules)');
    const hirer = a.who ?? st.actor;
    if (!st.chars[hirer]) throw new Error(`there is no character "${hirer}"`);
    if (a.kind === 'assign') {
        if (st.period !== 'birdsong') throw new Error('underlings are assigned to their guides in Birdsong (6.3.1)');
        assign(st, data, hirer, a.assign);
        return st;
    }
    if (a.kind === 'stay') { stay(st, data, hirer, a.ids ?? null); return st; }
    throw new Error(`unknown hireling action ${a.kind}`);
}

// Is this guide in the middle of his turn (his chit has been drawn, he has not finished)?
function turnOn(st, id) {
    const c = st.chars[id];
    if (!c || c.dead) return false;
    if (isMulti(st)) return c.today?.stage === 'turn';
    return st.period === 'daylight' && !!c.today?.turn && !c.today.turn.end;
}
// Is it the start of one of his phases (the question that means the phase has not begun)?
function atPhaseStart(st, id) {
    const ask = st.asks.find(a => a.who === id)?.pending;
    const p = ask?.type === 'meet-offer' ? ask.resume : ask;
    return !!p && (p.type === 'phase' || p.type === 'phase-pick');
}

// Hired counters follow their guide (hire.js followHero, called wherever a guide moves): only those assigned to him go with him.
export function follow(st, data) {
    const me = st.ch.id;
    for (const o of counters(st)) if (alive(o) && o.guide === me && o.loc) o.loc = { c: st.ch.at };
}

// A new hire: unhidden, light side up, following nobody (7.11.3).
export function hired(st, o) {
    if (!rulesOn(st)) return;
    o.guide = null; o.hidden = false; o.side = 'light'; o.hiredDay = st.day;
}

// The guide's turn is over: his followers are put back on the map where he stands, in the status he leaves them (hidden if he is, 7.11.4, 7.11.8), and follow him no more (7.7.3b).
export function finish(st, data) {
    if (!rulesOn(st)) return;
    const me = st.ch.id;
    for (const o of counters(st)) {
        if (!alive(o) || o.guide !== me) continue;
        if (isUnderling(data, o)) { o.hidden = !!st.ch.hidden; o.side = sideOf(data, o); }
        o.guide = null;
    }
}

// He is no longer hired (a term that ended, a dismissal, a death): the hireling's own state goes with it.
export function released(o) { delete o.guide; delete o.hidden; delete o.side; }

// The first thing every day: "Hired underlings are automatically unhidden at the beginning of each day" (6.3.1b, 7.4.5); yesterday's guides are forgotten (6.3.1).
export function dawn(st, data) {
    if (!rulesOn(st)) return;
    for (const o of counters(st)) if (alive(o)) { o.guide = null; if (isUnderling(data, o)) { o.hidden = false; o.side = 'light'; } }
}

// The side of a hired counter: light side up when unhidden, dark side up when hidden, and a hidden Tremendous monster red side up (7.7.1g, 7.7.5d).
export function sideOf(data, o) {
    if (!o.hidden) return 'light';
    return data.monsters[o.id]?.red ? 'red' : 'dark';
}

// After every action: the underlings of a guide who is taking his turn share his hidden status (7.11.4, 7.11.6b: "if he hides they hide, if he fails they fail"), and every hired
// counter shows the side its status calls for. The seat of a leader mirrors onto his counter in leaders.js before this runs.
export function sync(st, data) {
    if (!rulesOn(st)) return;
    for (const o of counters(st)) {
        if (!o.hired) { if ('guide' in o || 'hidden' in o) { delete o.guide; delete o.hidden; } continue; }          // (killed or let go in a fight: nobody's hireling any more)
        if (o.dead) continue;
        if (o.guide && (!st.chars[o.guide] || st.chars[o.guide].dead)) o.guide = null;          // his guide fell, or was let go: he spends the rest of the day where he stands
        if (o.guide && isUnderling(data, o) && turnOn(st, o.guide)) o.hidden = !!st.chars[o.guide].hidden;
        const side = sideOf(data, o);
        if (o.side !== side) o.side = side;
        if (o.hidden === undefined) o.hidden = false;
    }
}

// ---- combat (8.1.4b, 8.8.6, 8.3.4c.3) ----
// At the start of a fight the hirelings that are hidden are noted on their entry in `c.hires` (`hidden: true`): they are put to one side to identify them and take no part until they enter
// the battle (8.1.4b); a hidden hireling who goes out to fight, or lures a denizen, is unhidden at that moment (8.3.4c.3).
export function combatStart(st, data, c) {
    if (!rulesOn(st)) return;
    for (const h of c.hires ?? []) {
        const o = counterOf(st, h);
        if (o?.hidden) h.hidden = true;
    }
}
const counterOf = (st, h) => (h.kind === 'mon' ? st.mons : st.nats).find(x => x.id === h.id && x.hired);
// A hireling sent at a creature enters the battle: he is no longer hidden (8.1.4b, 8.3.4c.3).
export function entered(st, data, h) {
    if (!rulesOn(st)) return;
    const o = counterOf(st, h);
    if (!o?.hidden) return;
    o.hidden = false; o.side = 'light'; delete h.hidden;
    say(st, `${nameOf(data, o)} gives away his hiding place: he is no longer hidden.`, 'combat');
}
// The fight is over: hired counters are turned dark side up if they are still hidden and light side up if unhidden; unhired denizens are all light side up (8.8.6).
export function combatEnd(st, data, c) {
    if (!rulesOn(st)) return;
    for (const o of counters(st)) {
        if (o.dead) continue;
        if (alive(o)) o.side = sideOf(data, o);
        else if (o.loc?.c && o.loc.c === c.at) o.side = 'light';
    }
}
