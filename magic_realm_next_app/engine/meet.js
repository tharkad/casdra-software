import { say, lvl } from './core.js';
import { withActor, charsAt, isMulti, askOf, livingIds, playerNameOf } from './party.js';
import { nameOf, summaryOf, autoEquip, noteGain, weightOf, carryCapacity, onPackHorse, extraPhaseCommitment, transferLock } from './items.js';
import { pathKeyAt, pathEnds, pathSide, tileSide, nameOfClearing, roadsFrom, tileOf, numOf } from './world.js';
import { onArrive } from './missions.js';

// Characters meet (step 4 of the multi-character plan, docs/design/multiplayer-step4.md): everything two or more characters standing in one clearing can do to one another outside a fight.
//   give and trade   an OFFER from one character to another (belongings, gold, discoveries each way), accepted or declined by the other, atomic (7.2.1, 4.5.5, ruling R-5)
//   spying           what a character uses, others in his clearing learn (4.5.6, R-15)
//   blocking         other characters may block the one who just ended a phase, by each one's standing policy (7.12, R-4)
//   follow           a follower records Follow and goes with his guide for the whole turn (7.11, R-10)
//   day-end window   the trade window after the evening's fights (R-5, R-18)
// Everything is guarded by "more than one character": a one-character game never reaches this file.
// The engine pieces that need day.js (finishing a phase, a follower's end of turn, Midnight) are reached through `hooks`, which day.js fills in.

export const hooks = {};

// ---- standing policies (a character's own, private) ----
export const POLICY_DEFAULT = { block: 'never', follow: 'stay', dayEnd: false };
export const BLOCK_POLICIES = ['never', 'always', 'ask'];
export const FOLLOW_POLICIES = ['stay', 'ask'];
export const policyOf = c => ({ ...POLICY_DEFAULT, ...(c?.policy ?? {}) });

// ---- who is where in the day ----
const CARDS = new Set(['treasure', 'spell']);
const visibleTo = it => !CARDS.has(it.kind) || it.active;                       // what another may name: counters are open pieces, inactive cards lie face down (4.3.5)
export const isBlocked = c => !!(c.today?.noTurn || c.today?.turn?.blocked);       // blocked today (7.12.4b): before his turn, or in it
export const followersOf = (st, id) => Object.keys(st.follows ?? {}).filter(f => st.follows[f] === id);
export function turnHolder(st) {
    if (st.period !== 'daylight' || !st.dayRec) return null;
    const id = st.dayRec.order[st.dayRec.i], c = st.chars[id];
    return c && c.today.stage === 'turn' ? id : null;
}
const STARTS = new Set(['phase', 'phase-pick']);                                    // the questions that mean "the next phase has not begun"
const unwrapped = p => (p?.type === 'meet-offer' ? p.resume : p);
const phaseStart = (st, id) => { const p = unwrapped(askOf(st, id)?.pending); return !!p && STARTS.has(p.type); };
function phaseWindow(st) {
    const id = turnHolder(st);
    return id && phaseStart(st, id) && !st.blockCheck && !st.followCheck ? { actor: id, group: [id, ...followersOf(st, id)] } : null;
}
// Is a meeting possible now, and which kind? 'phase' (the start of a phase of the turn-holder's: he, his followers and whoever stands with him), 'dayend' (the trade window after the fights) or null.
// It is a fact of the table, not of any one character's secrets, so the server publishes it (`table.meetWindow`) and the screens of the seats who are not the turn-holder know when the Meet button is legal.
export function windowInfo(st) {
    if (!isMulti(st)) return { kind: null };
    if (st.tradeWindow) return { kind: 'dayend', groups: st.tradeWindow.groups.map(g => ({ at: g.at, ids: g.ids.slice(), done: g.done.slice() })) };
    const w = phaseWindow(st);
    return w ? { kind: 'phase', actor: w.actor, group: w.group } : { kind: null };
}
const nameOfChar = (st, id) => st.chars[id]?.name ?? id;
// A public line is told twice: in the characters' names (`t`, what the rules say) and in the players' names (`p`, what the table says: "Mike follows Ann"). Same words, other names.
const pn = (st, id) => playerNameOf(st, id);
const pnames = (st, ids) => ids.map(id => pn(st, id)).join(' and ');
const here = c => !!c.at && !c.onRoad && !c.flying;

// May a and b trade now? Returns why not, or null. At the start of a phase of the actor's turn he (and his followers) may trade with any character in his clearing, not the others with each
// other (7.2.1); hidden ones may (7.2.1b); not while flying, in the woods or on a road (7.2.1d); a character blocked today may not trade with those about to start phases (7.12.4b). After the
// day's fights, while the trade window is open, those who stand together may (R-5).
export function tradeError(st, a, b) {
    if (!isMulti(st)) return 'there is nobody to trade with';
    const x = st.chars[a], y = st.chars[b];
    if (!x || !y || x.dead || y.dead) return 'that character is not here';
    if (a === b) return 'you cannot trade with yourself';
    if (!here(x) || !here(y) || x.at !== y.at) return 'you can trade only with a character in your own clearing (7.2.1d)';
    if (x.mist || y.mist) return 'a character in mist cannot trade';
    const tw = st.tradeWindow;
    if (tw) return tw.groups.some(g => g.ids.includes(a) && g.ids.includes(b)) ? null : 'only those who stand together may trade in the day-end window';
    const w = phaseWindow(st);
    if (!w) return 'you can trade at the start of a phase of someone\'s turn, or in the window after the day\'s fights (7.2.1, R-5)';
    if (!w.group.includes(a) && !w.group.includes(b)) return `only ${nameOfChar(st, w.actor)} and those who follow him can trade now: the others can trade with him, not with each other (7.2.1)`;
    for (const id of [a, b]) if (isBlocked(st.chars[id])) return `${nameOfChar(st, id)} was blocked today and cannot trade with those who are about to start phases (7.12.4b)`;
    return null;
}

// ---- discoveries (4.5.5): a hidden path or secret passage, a Site chit, a Site card ----
// { kind: 'path', key } | { kind: 'site', id } | { kind: 'sitecard', id }
function normDiscovery(d) {
    if (!d || typeof d !== 'object') throw new Error('that is not a discovery');
    if (d.kind === 'path' && typeof d.key === 'string') return { kind: 'path', key: d.key };
    if ((d.kind === 'site' || d.kind === 'sitecard') && typeof d.id === 'string') return { kind: d.kind, id: d.id };
    throw new Error('that is not a discovery');
}
const sameDisc = (a, b) => a.kind === b.kind && a.key === b.key && a.id === b.id;
function knows(st, c, d, at) {                                                       // does he hold the discovery, and does it belong to this clearing (4.5.5a)?
    if (d.kind === 'path') return c.discovered.paths.includes(d.key) && pathEnds(d.key).includes(at);
    if (d.kind === 'site') { const chit = st.chits.find(x => x.id === d.id); return !!chit && c.discovered.sites.includes(d.id) && chit.tile === tileOf(at) && chit.num === numOf(at); }
    return !!c.siteCards?.[at]?.includes(d.id);
}
function discLabel(st, data, d, at) {
    if (d.kind === 'path') {
        const ends = pathEnds(d.key), other = ends.find(x => x !== at) ?? ends[0];
        const road = data && at ? roadsFrom(st, data, at).find(r => r.to === other) : null;
        const down = pathSide(d.key) !== tileSide(st, tileOf(other));          // found on the side of the tile that is face down now
        return `the ${road?.kind === 'secret' ? 'secret passage' : 'hidden path'} to ${nameOfClearing(other)}${down ? ` (on the ${pathSide(d.key) === 'enchanted' ? 'enchanted' : 'green'} side)` : ''}`;
    }
    if (d.kind === 'site') return `the ${st.chits.find(x => x.id === d.id)?.name ?? 'site'} here`;
    return `the ${st.twt?.[d.id]?.name ?? 'site card'} here`;
}
// He now knows it. Returns true when it was news.
function grant(st, c, d, at, { turnUp = false } = {}) {
    if (d.kind === 'path') { if (c.discovered.paths.includes(d.key)) return false; c.discovered.paths.push(d.key); return true; }
    if (d.kind === 'site') {
        const chit = st.chits.find(x => x.id === d.id);
        if (turnUp && chit && !chit.up) { chit.up = true; if (chit.kind === 'site') chit.clearing = chit.num; say(st, `A site chit turns up: the ${chit.name} in clearing ${chit.num}.`, 'discover', null, { who: null }); }       // 4.5.5d: sold, it is turned up for all
        if (!(c.seen ??= []).includes(d.id)) c.seen.push(d.id);
        if (c.discovered.sites.includes(d.id)) return false;
        c.discovered.sites.push(d.id); return true;
    }
    c.siteCards ??= {};
    const list = (c.siteCards[at] ??= []);
    if (list.includes(d.id)) return false;
    list.push(d.id); return true;
}

// ---- spying (4.5.6, R-15) ----
// The characters who are spying on `userId` now: those in his clearing, if he is unhidden or they found hidden enemies today (4.5.6a). Not retroactive: it is worked out at the moment of use.
export function spiesOn(st, userId) {
    const u = st.chars[userId];
    if (!isMulti(st) || !u || u.dead || !here(u)) return [];
    return charsAt(st, u.at).filter(id => id !== userId && (!u.hidden || st.chars[id].hiddenEnemies));
}
// Each spy learns the discovery if it is news to him, and is told so in a line of his own ("you saw X use ..."); the secret data (what was taken, the dice) stays the user's.
function spyLearn(st, data, spies, userId, d, at, verb) {
    for (const s of spies) {
        if (!grant(st, st.chars[s], d, at)) continue;
        say(st, `You saw ${nameOfChar(st, userId)} ${verb} ${discLabel(st, data, d, at)}: you know of it now.`, 'discover', null, { who: s, vis: 'owner' });
    }
}
// A move along a hidden path or secret passage: the spy learns the road whether he stands at its start or at its end (RealmSpeak ActionRow 893-925).
export function spyOnPath(st, data, userId, from, to) {
    if (!isMulti(st)) return;
    const key = pathKeyAt(st, from, to), d = { kind: 'path', key }, u = st.chars[userId];
    const spies = new Set();
    for (const at of [from, to]) for (const id of charsAt(st, at)) if (id !== userId && (!u.hidden || st.chars[id].hiddenEnemies)) spies.add(id);
    for (const s of [...spies].sort((a, b) => st.order.indexOf(a) - st.order.indexOf(b))) {
        if (!grant(st, st.chars[s], d, from)) continue;
        say(st, `You saw ${u.name} use ${discLabel(st, data, d, from)}: you know of it now.`, 'discover', null, { who: s, vis: 'owner' });
    }
}
// Looting a site: the spies learn the site (and, for a Site card, the card and the chit it came from).
export function spyOnLoot(st, data, userId, { siteId = null, cardId = null } = {}) {
    if (!isMulti(st)) return;
    const u = st.chars[userId], at = u.at, spies = spiesOn(st, userId);
    if (!spies.length) return;
    if (siteId) spyLearn(st, data, spies, userId, { kind: 'site', id: siteId }, at, 'loot');
    if (cardId) {
        spyLearn(st, data, spies, userId, { kind: 'sitecard', id: cardId }, at, 'search');
        for (const id of u.discovered.sites) if (knows(st, u, { kind: 'site', id }, at)) spyLearn(st, data, spies, userId, { kind: 'site', id }, at, 'loot');
    }
}

// ---- offers between characters ----
const emptySide = () => ({ items: [], gold: 0, discoveries: [] });
function normSide(x) {
    const s = emptySide();
    if (x == null) return s;
    s.items = [...new Set((x.items ?? []).map(String))];
    s.gold = Math.floor(Number(x.gold ?? 0));
    if (!(s.gold >= 0)) throw new Error('gold must be a number of pieces');
    for (const d of x.discoveries ?? []) { const n = normDiscovery(d); if (!s.discoveries.some(o => sameDisc(o, n))) s.discoveries.push(n); }
    return s;
}
// Has character `id` recorded an extra phase that this belonging causes, and not yet finished it (6.2.4d)? The sentence that says so, else null. (His plan is secret: it is told only to him.)
const committed = (st, data, id, it) => withActor(st, id, () => extraPhaseCommitment(st, data, it)) ?? transferLock(data, it);
const sideEmpty = s => !s.items.length && !s.gold && !s.discoveries.length;
// What a side must satisfy. `strict`: he must really hold it (gold included). Otherwise (the other character's side, named by the one who offers) only what everyone may see can be named, and
// whether he can pay is nobody's business until he answers.
function checkSide(st, data, id, side, at, { strict, named = false }) {
    const c = st.chars[id], name = c.name;
    for (const u of side.items) {
        const it = c.items.find(i => i.uid === u && !i.destroyed);
        if (!it || (named && !visibleTo(it))) throw new Error(named ? `you cannot ask ${name} for that: it is not something you can see him hold` : 'you do not have that');
        if (!named) { const why = committed(st, data, id, it); if (why) throw new Error(why); }          // 6.2.4d: a belonging that gives a recorded extra phase is not his to hand over yet
    }
    if (strict && side.gold > c.gold) throw new Error(id === st.actor ? 'you do not have that much gold' : `${name} does not have that much gold`);
    if (strict) for (const d of side.discoveries) if (!knows(st, c, d, at)) throw new Error(id === st.actor ? 'you do not know that, or it is not in this clearing (4.5.5a)' : `${name} no longer knows that`);
}
function viewSide(st, data, id, side, at) {
    const c = st.chars[id];
    return {
        items: side.items.map(u => { const it = c.items.find(i => i.uid === u); return { uid: u, kind: it.kind, id: it.id, name: nameOf(data, it), sub: summaryOf(data, it), active: !!it.active, damaged: !!it.damaged }; }),
        gold: side.gold,
        discoveries: side.discoveries.map(d => ({ ...d, label: discLabel(st, data, d, at) })),
    };
}
const describe = (st, data, id, side, at) => {
    const c = st.chars[id], parts = [];
    for (const u of side.items) { const it = c.items.find(i => i.uid === u); parts.push(`the ${nameOf(data, it)}`); }
    if (side.gold) parts.push(`${side.gold} gold`);
    for (const d of side.discoveries) parts.push(discLabel(st, data, d, at));
    return parts.length ? parts.join(', ') : 'nothing';
};

function offerFrom(st, data, a) {
    const from = a.who, to = a.to;
    if (typeof to !== 'string' || !st.chars[to]) throw new Error('offer to whom?');
    const err = tradeError(st, from, to);
    if (err) throw new Error(err);
    if ((st.offers ?? []).some(o => o.from === from)) throw new Error('you already have an offer open: withdraw it or wait for the answer');
    if ((st.offers ?? []).some(o => o.to === from)) throw new Error('answer the offer made to you first');
    if ((st.offers ?? []).some(o => o.to === to)) throw new Error(`${nameOfChar(st, to)} is already considering an offer`);
    const give = normSide(a.give), want = normSide(a.want), at = st.chars[from].at;
    if (sideEmpty(give) && sideEmpty(want)) throw new Error('an offer must give something or ask for something');
    checkSide(st, data, from, give, at, { strict: true });
    checkSide(st, data, to, want, at, { strict: false, named: true });
    const ra = askOf(st, to);
    const rp = unwrapped(ra?.pending);
    if (ra && !(STARTS.has(rp?.type) || rp?.type === 'meet-window')) throw new Error(`${nameOfChar(st, to)} is busy answering something else`);
    if (ra && ra.pending.type === 'meet-offer') throw new Error(`${nameOfChar(st, to)} is already considering an offer`);
    const id = `o${st.offerSeq = (st.offerSeq ?? 0) + 1}`;
    const o = { id, from, to, at, day: st.day, window: st.tradeWindow ? 'dayend' : 'phase', give, want };
    (st.offers ??= []).push(o);
    const q = { type: 'meet-offer', id, from, fromName: nameOfChar(st, from), window: o.window, give: viewSide(st, data, from, give, at), want: viewSide(st, data, to, want, at) };
    if (ra) { q.resume = ra.pending; ra.pending = q; } else st.asks.push({ who: to, pending: q });
    return st;
}

function closeOffer(st, o) {
    st.offers = st.offers.filter(x => x.id !== o.id);
    if (!st.offers.length) delete st.offers;
    const a = st.asks.find(x => x.who === o.to && x.pending.type === 'meet-offer' && x.pending.id === o.id);
    if (!a) return;
    if (a.pending.resume) a.pending = a.pending.resume; else st.asks.splice(st.asks.indexOf(a), 1);
}

// An offer made at the start of a phase is good until that phase begins (7.2.1: trading is at the start of a phase). When it begins, or the turn ends, an offer that was not answered lapses, whoever
// made it (a follower may offer to someone outside the turn-holder's group while the actor plays on).
export function lapsePhaseOffers(st, why) {
    for (const o of [...(st.offers ?? [])]) {
        if (o.window !== 'phase') continue;
        closeOffer(st, o);
        say(st, `Your offer to ${nameOfChar(st, o.to)} lapses: ${why}.`, 'trade', null, { who: o.from, vis: 'owner' });
        say(st, `${nameOfChar(st, o.from)}'s offer lapses: ${why}.`, 'trade', null, { who: o.to, vis: 'owner' });
    }
}

function cancelOffer(st, data, a) {
    const o = (st.offers ?? []).find(x => x.from === a.who && (a.id == null || a.id === x.id));
    if (!o) throw new Error('you have no offer open');
    closeOffer(st, o);
    say(st, `You withdraw your offer to ${nameOfChar(st, o.to)}.`, 'trade', null, { who: o.from, vis: 'owner' });
    say(st, `${nameOfChar(st, o.from)} withdraws the offer he made you.`, 'trade', null, { who: o.to, vis: 'owner' });
    return afterMeet(st, data);
}

function answerOffer(st, data, a) {
    const o = (st.offers ?? []).find(x => x.to === a.who && (a.id == null || a.id === x.id));
    if (!o) throw new Error('nobody has offered you anything');
    if (!a.accept) {
        closeOffer(st, o);
        say(st, `You turn down ${nameOfChar(st, o.from)}'s offer.`, 'trade', null, { who: o.to, vis: 'owner' });
        say(st, `${nameOfChar(st, o.to)} turns down your offer.`, 'trade', null, { who: o.from, vis: 'owner' });
        return afterMeet(st, data);
    }
    const A = st.chars[o.from], B = st.chars[o.to], at = o.at;
    // the one who offered must still have what he gave (nothing can have changed while the window was open, but an offer is only ever carried out whole)
    try { checkSide(st, data, o.from, o.give, at, { strict: true }); }
    catch (e) {
        closeOffer(st, o);
        say(st, `${A.name}'s offer lapses: ${e.message}.`, 'trade', null, { who: o.to, vis: 'owner' });
        say(st, `Your offer to ${B.name} lapses: ${e.message}.`, 'trade', null, { who: o.from, vis: 'owner' });
        return afterMeet(st, data);
    }
    checkSide(st, data, o.to, o.want, at, { strict: true });                         // (throws to the one answering, the offer stays open)
    const err = tradeError(st, o.from, o.to);
    if (err) throw new Error(err);
    const gave = describe(st, data, o.from, o.give, at), got = describe(st, data, o.to, o.want, at);
    // all at once: out of both hands first, then into the other's
    const take = (c, uids) => uids.map(u => c.items.splice(c.items.findIndex(i => i.uid === u), 1)[0]);
    const fromA = take(A, o.give.items), fromB = take(B, o.want.items);
    A.gold += o.want.gold - o.give.gold; B.gold += o.give.gold - o.want.gold;
    const receive = (id, list) => withActor(st, id, () => { for (const it of list) { it.active = false; it.alerted = false; st.chars[id].items.push(it); noteGain(st, it); autoEquip(st, data, it); } });
    receive(o.to, fromA); receive(o.from, fromB);
    // discoveries: each is copied to the other (the giver keeps it), and everyone spying on the giver learns it too (4.5.6b.3)
    for (const [giver, taker, side] of [[o.from, o.to, o.give], [o.to, o.from, o.want]]) {
        for (const d of side.discoveries) {
            grant(st, st.chars[taker], d, at, { turnUp: true });
            spyLearn(st, data, spiesOn(st, giver).filter(s => s !== taker), giver, d, at, 'sell');
        }
    }
    closeOffer(st, o);
    say(st, `You give ${B.name}: ${gave}; you receive: ${got}.`, 'trade', null, { who: o.from, vis: 'owner' });
    say(st, `${A.name} gives you: ${gave}; you give: ${got}.`, 'trade', null, { who: o.to, vis: 'owner' });
    say(st, `${A.name} and ${B.name} trade.`, 'trade', null, { who: null, p: `${pn(st, o.from)} and ${pn(st, o.to)} trade.` });
    return afterMeet(st, data);
}

// ---- policies ----
function setPolicy(st, a) {
    const c = st.chars[a.who], p = { ...policyOf(c) };
    if ('block' in a) { if (!BLOCK_POLICIES.includes(a.block)) throw new Error(`blocking is ${BLOCK_POLICIES.join(', ')}`); p.block = a.block; }
    if ('follow' in a) { if (!FOLLOW_POLICIES.includes(a.follow)) throw new Error(`following is ${FOLLOW_POLICIES.join(' or ')}`); p.follow = a.follow; }
    if ('dayEnd' in a) p.dayEnd = !!a.dayEnd;
    c.policy = p;
    return st;
}

// ---- the day-end trade window (R-5, R-18) ----
// After the evening's fights and before Midnight, those who stand together may trade. It opens for a group when any of them asked for it (the policy `dayEnd`, RealmSpeak's "Day End Trades");
// each member is asked once and says `done`; it closes when all have and no offer is open.
export function openWindow(st) {
    if (!isMulti(st)) return false;
    const by = new Map();
    for (const id of livingIds(st)) { const c = st.chars[id]; if (!here(c) || c.mist) continue; if (!by.has(c.at)) by.set(c.at, []); by.get(c.at).push(id); }
    const groups = [];
    for (const [at, ids] of by) if (ids.length > 1 && ids.some(id => policyOf(st.chars[id]).dayEnd)) groups.push({ at, ids, done: [] });
    if (!groups.length) return false;
    st.tradeWindow = { groups };
    for (const g of groups) for (const id of g.ids) st.asks.push({ who: id, pending: { type: 'meet-window', at: g.at, with: g.ids.filter(x => x !== id) } });
    say(st, 'The fighting is over: those who stand together may trade before Midnight.', 'day', null, { who: null });
    return true;
}
function windowDone(st, data, a) {
    const tw = st.tradeWindow, ask = askOf(st, a.who);
    if (!tw || ask?.pending.type !== 'meet-window') throw new Error('there is no trade window for you to leave');
    if ((st.offers ?? []).some(o => o.from === a.who)) throw new Error('you have an offer open: withdraw it or wait for the answer');
    st.asks.splice(st.asks.indexOf(ask), 1);
    tw.groups.find(g => g.ids.includes(a.who)).done.push(a.who);
    return afterMeet(st, data);
}
// After anything is answered: the window may close, and Midnight comes.
function afterMeet(st, data) {
    const tw = st.tradeWindow;
    if (!tw || (st.offers ?? []).length) return st;
    if (!tw.groups.every(g => g.ids.every(id => g.done.includes(id)))) return st;
    delete st.tradeWindow;
    hooks.toMidnight(st, data);
    return st;
}

// ---- blocking by other characters (7.12.2, 7.12.4, R-4) ----
// At the end of a phase of the actor's turn, a character in his clearing may block him (a hidden actor only by one who found hidden enemies today, 7.12.2b). A character's standing policy says
// whether he does: never (the default), always, or ask. A decision about one target holds for the day: asked once, not again (RealmSpeak). Blocker and blocked both lose the rest of the turn and
// are instantly unhidden (7.12.4, 7.12.4a). Returns null when nobody blocks, 'wait' when somebody is asked, or true when the actor was blocked.
export function blockCheck(st, data) {
    const x = st.actor, X = st.chars[x], asked = [];
    if (!here(X)) return null;
    for (const id of st.order) {
        const c = st.chars[id];
        if (id === x || c.dead || c.today.stage === 'following' || !here(c) || c.mist || c.at !== X.at || st.follows?.[id] === x) continue;
        if (X.hidden && !c.hiddenEnemies) continue;
        const pol = policyOf(c).block;
        if (pol === 'never' || (c.today.blockSaid ?? []).includes(x)) continue;
        if (pol === 'always') { c.today.blockVote = 'yes'; continue; }
        c.today.blockVote = 'pending';
        asked.push(id);
    }
    if (asked.length) {
        st.blockCheck = { actor: x, asked: asked.slice() };
        for (const id of asked) st.asks.push({ who: id, pending: { type: 'meet-block', target: x, targetName: X.name, at: X.at } });
        return 'wait';
    }
    return resolveBlock(st, data, x) ? true : null;
}
function answerBlock(st, data, a) {
    const bc = st.blockCheck, c = st.chars[a.who], ask = askOf(st, a.who);
    if (!bc || ask?.pending.type !== 'meet-block') throw new Error('nobody is asking you to block');
    c.today.blockVote = a.yes ? 'yes' : 'no';
    st.asks.splice(st.asks.indexOf(ask), 1);
    if (!bc.asked.every(id => st.chars[id].today.blockVote !== 'pending')) return st;
    delete st.blockCheck;
    const blocked = resolveBlock(st, data, bc.actor);
    withActor(st, bc.actor, () => hooks.afterBlock(st, data, blocked));
    return st;
}
function resolveBlock(st, data, x) {
    const X = st.chars[x], yes = [];
    for (const id of st.order) {
        const c = st.chars[id], v = c.today.blockVote;
        if (v == null) continue;
        delete c.today.blockVote;
        (c.today.blockSaid ??= []).push(x);                       // asked once about him today, whatever the answer
        if (v === 'yes') yes.push(id);
    }
    if (!yes.length) return false;
    for (const id of yes) {
        const b = st.chars[id];
        b.hidden = false;
        if (b.today.stage === 'planned') b.today.noTurn = true;          // he has yet to act: he loses his turn (7.12.4); one who has played loses only his hiding
        say(st, `${b.name} blocks ${X.name}.`, 'block', null, { who: id });
    }
    X.hidden = false;
    X.today.turn.blocked = true;
    for (const f of followersOf(st, x)) st.chars[f].hidden = false;
    say(st, `${yes.map(id => nameOfChar(st, id)).join(' and ')} block${yes.length === 1 ? 's' : ''} you! The rest of your turn is lost.`, 'block', null, { who: x, p: `${pnames(st, yes)} block${yes.length === 1 ? 's' : ''} ${pn(st, x)}! The rest of the turn is lost.` });
    return true;
}

// ---- follow (7.11, R-10) ----
// The plan: Follow is the only activity of the day, recorded in the first phase, and its guide stands in the follower's clearing at Birdsong.
export function followPlanError(st, slots, i, me) {
    const s = slots[i];
    if (!isMulti(st)) return 'there is nobody to follow';
    if (i !== 0 || slots.some((x, k) => k !== 0 && x && x.act !== 'nothing')) return 'Follow takes the whole turn: record nothing else (7.11.2)';
    const g = st.chars[s.who];
    if (!g || s.who === me.id) return 'follow whom? name a character in your clearing';
    if (g.dead) return `${g.name} is dead`;
    if (!me.at || me.onRoad || me.flying || g.at !== me.at || g.onRoad || g.flying) return `${g.name} is not in your clearing (7.11.3)`;
    return null;
}
// Sunrise: who follows whom. A chain goes to its end (A follows B who follows C: both go with C); a cycle cancels, and its members have no turn (RealmSpeak). A follower whose guide is gone has
// none either. `st.follows` = { follower: guide } is public from this moment (the counters leave the map); `dayRec.follow` remembers the day's pairs for the evening's order.
export function declareFollows(st) {
    const want = {};
    for (const id of livingIds(st)) { const s = st.chars[id].today.plan?.[0]; if (s?.act === 'follow') want[id] = s.who; }
    const ids = Object.keys(want);
    if (!ids.length) return { gone: [] };
    const follows = {}, circle = [], lost = [], names = l => l.map(id => nameOfChar(st, id)).join(' and ');
    for (const id of ids) {
        const seen = new Set([id]);
        let cur = id, root = null;
        for (;;) {
            const g = want[cur] ?? null;
            if (g == null) { root = cur; break; }
            if (seen.has(g)) break;
            seen.add(g); cur = g;
        }
        if (root == null) circle.push(id);
        else if (st.chars[root].dead || st.chars[root].at !== st.chars[id].at) lost.push(id);
        else follows[id] = root;
    }
    if (circle.length) say(st, `${names(circle)} follow${circle.length === 1 ? 's' : ''} in a circle: nobody follows anybody, and they have no turn today.`, 'day', null, { who: null, p: `${pnames(st, circle)} follow${circle.length === 1 ? 's' : ''} in a circle: nobody follows anybody, and they have no turn today.` });
    if (lost.length) say(st, `${names(lost)} ${lost.length === 1 ? 'has' : 'have'} nobody to follow: no turn today.`, 'day', null, { who: null, p: `${pnames(st, lost)} ${lost.length === 1 ? 'has' : 'have'} nobody to follow: no turn today.` });
    const gone = [...circle, ...lost];
    for (const id of gone) { const c = st.chars[id]; c.today.stage = 'done'; c.today.voidFollow = true; }
    for (const [f, g] of Object.entries(follows)) { st.chars[f].today.stage = 'following'; say(st, `${nameOfChar(st, f)} follows ${nameOfChar(st, g)}.`, 'day', null, { who: null, p: `${pn(st, f)} follows ${pn(st, g)}.` }); }
    if (Object.keys(follows).length) st.follows = follows;
    return { gone };
}
// The guide's chit is drawn: he and all his followers are unhidden (7.11.4).
export function guideStarts(st, g) {
    for (const f of followersOf(st, g)) st.chars[f].hidden = false;
}
// The guide's Hide result applies to all his followers (7.11.6b); a block unhides them too: they are the guide's hidden status, whatever he does.
export function syncHidden(st) {
    const g = st.actor;
    for (const f of followersOf(st, g)) st.chars[f].hidden = !!st.chars[g].hidden;
}
// At the start of each of the guide's activities each follower may stop following (7.11.5). A follower whose policy is `ask` is asked (the guide waits); the others stay unless they say so
// at once (`stop-follow`). Returns 'wait' when somebody is asked.
export function beforeActivity(st, data) {
    const g = st.actor, t = st.turn, fs = followersOf(st, g);
    if (!fs.length || !t || t.dropChecked === t.i) return null;
    t.dropChecked = t.i;
    const asked = fs.filter(f => policyOf(st.chars[f]).follow === 'ask');
    if (!asked.length) return null;
    st.followCheck = { guide: g, asked: asked.slice() };
    for (const f of asked) { st.chars[f].today.followVote = 'pending'; st.asks.push({ who: f, pending: { type: 'meet-follow', guide: g, guideName: nameOfChar(st, g), i: t.i } }); }
    return 'wait';
}
function answerFollow(st, data, a) {
    const fc = st.followCheck, c = st.chars[a.who], ask = askOf(st, a.who);
    if (!fc || ask?.pending.type !== 'meet-follow') throw new Error('nobody is asking you whether to stop following');
    c.today.followVote = a.drop ? 'drop' : 'stay';
    st.asks.splice(st.asks.indexOf(ask), 1);
    if (!fc.asked.every(id => st.chars[id].today.followVote !== 'pending')) return st;
    delete st.followCheck;
    for (const id of st.order.filter(x => fc.asked.includes(x))) {
        const v = st.chars[id].today.followVote;
        delete st.chars[id].today.followVote;
        if (v === 'drop') dropFollower(st, data, id, 'by choice');
    }
    withActor(st, fc.guide, () => hooks.resumePhase(st, data));
    return st;
}
// A follower stops following and his turn ends where he stands: he is on the map again and the end of his turn happens now (chits flip, prowlers come, monsters are called) (7.11.5, 7.11.8).
export function dropFollower(st, data, f, why = '') {
    const g = st.follows?.[f];
    if (!g) return;
    delete st.follows[f];
    if (!Object.keys(st.follows).length) delete st.follows;
    withActor(st, f, () => {
        st.ch.today.stage = 'done';
        say(st, `${st.ch.name} stops following ${nameOfChar(st, g)}${why ? ` (${why})` : ''}: his turn ends here.`, 'day', null, { who: f, p: `${pn(st, f)} stops following ${pn(st, g)}${why ? ` (${why})` : ''}: the turn ends here.` });
        hooks.followerEnds(st, data);
    });
}
function stopFollow(st, data, a) {
    const g = st.follows?.[a.who];
    if (!g) throw new Error('you are following nobody');
    if (!phaseStart(st, g) || st.followCheck) throw new Error('you can stop following only when your guide is about to start an activity (7.11.5)');
    dropFollower(st, data, a.who, 'by choice');
    return st;
}
// A hidden guide may leave behind followers who have not found hidden enemies (7.11.6a.1).
function ditch(st, data, a) {
    const g = a.who, G = st.chars[g];
    if (!G.hidden) throw new Error('only a hidden guide can leave followers behind');
    if (!phaseStart(st, g) || st.followCheck) throw new Error('you can leave followers behind only at the start of an activity');
    const named = a.followers ? new Set(a.followers) : null;
    const left = followersOf(st, g).filter(f => !st.chars[f].hiddenEnemies && (!named || named.has(f)));
    if (!left.length) throw new Error('there is nobody to leave behind: every follower has found hidden enemies today');
    for (const f of left) dropFollower(st, data, f, 'left behind');
    return st;
}
// The guide has moved: each follower goes along if he can do it (7.11.6a): not if his load is too heavy for him (RealmSpeak: he drops out), and he learns a hidden path or secret passage the guide
// used (7.11.6a.3). A follower who cannot is dropped where the guide left him. A horse cannot enter a cave.
export function carry(st, data, from, to, road, caveTo) {
    const g = st.actor;
    for (const f of followersOf(st, g)) {
        const ok = withActor(st, f, () => {
            const cap = Math.max(carryCapacity(st, data), 0);
            const heavy = st.ch.items.some(it => !it.destroyed && it.kind !== 'horse' && !onPackHorse(st, data, it) && lvl(weightOf(data, it)) > cap && lvl(weightOf(data, it)) > 0);
            if (heavy) return false;
            st.ch.at = to; st.ch.arrivedFrom = from;
            hooks.followHero(st, data);
            if (st.missions) onArrive(st, data, to);                 // 7.2.4e.4: a follower who carries a mission chit into its Dwelling's clearing delivers it too
            if (caveTo) { const h = st.ch.items.find(i => i.kind === 'horse' && i.active && !i.destroyed); if (h) { h.active = false; say(st, 'Your horse cannot go into the caves and stays outside, unridden.', 'info'); } }
            if (road && (road.kind === 'hidden' || road.kind === 'secret')) grant(st, st.ch, { kind: 'path', key: pathKeyAt(st, from, to) }, from);
            return true;
        });
        if (!ok) dropFollower(st, data, f, 'too heavily laden to go on');
    }
}
// The guide's turn is over: following stops (7.11.8). The followers were carried to the end of it; the chits flipped once, for all of them, in the guide's own end of turn (a group, R-10).
export function releaseFollowers(st, data) {
    const g = st.actor, fs = followersOf(st, g);
    for (const f of fs) {
        const c = st.chars[f];
        delete st.follows[f];
        c.today.stage = 'done';
        c.today.turnEnd = { ...(st.chars[g].today.turnEnd ?? {}), follower: true };
        say(st, `${c.name}'s turn ends with ${nameOfChar(st, g)}'s.`, 'day', null, { who: f, p: `${pn(st, f)}'s turn ends with ${pn(st, g)}'s.` });
    }
    if (st.follows && !Object.keys(st.follows).length) delete st.follows;
}
// What the guide found by Peer or Locate the followers share (7.11.6c, 4.5.5e): chits seen, sites, paths, and the hidden-enemies result.
export const snap = c => ({ paths: c.discovered.paths.slice(), sites: c.discovered.sites.slice(), seen: (c.seen ?? []).slice(), hidden: !!c.hiddenEnemies, cards: JSON.stringify(c.siteCards ?? {}) });
export function shareFind(st, before) {
    const g = st.actor, G = st.chars[g];
    for (const f of followersOf(st, g)) {
        const c = st.chars[f];
        for (const k of G.discovered.paths) if (!before.paths.includes(k) && !c.discovered.paths.includes(k)) c.discovered.paths.push(k);
        for (const k of G.discovered.sites) if (!before.sites.includes(k) && !c.discovered.sites.includes(k)) c.discovered.sites.push(k);
        for (const k of G.seen ?? []) if (!before.seen.includes(k) && !(c.seen ??= []).includes(k)) c.seen.push(k);
        if (G.hiddenEnemies && !before.hidden) c.hiddenEnemies = true;
    }
}

// ---- what a screen needs (docs/design/multiplayer-step4.md) ----
// For character `who`, only what he may know: with whom he may trade right now and what of theirs he can see to ask for, what he has to give (belongings, gold, the discoveries that belong to
// this clearing), whom he could follow at Birdsong, his standing policy, and which window (if any) is open. Nothing in it is another character's secret.
export function meetOptions(st, data, who) {
    const me = st.chars[who], out = { window: null, partners: [], give: { items: [], gold: 0, discoveries: [] }, followable: [], followWhy: [], policy: policyOf(me), offers: { made: null, received: null } };
    if (!isMulti(st) || !me || me.dead) return out;
    const itemView = it => ({ uid: it.uid, kind: it.kind, id: it.id, name: nameOf(data, it), sub: summaryOf(data, it), active: !!it.active, damaged: !!it.damaged });
    out.window = st.tradeWindow ? 'dayend' : phaseWindow(st) ? 'phase' : null;
    for (const id of st.order) {
        if (id === who || tradeError(st, who, id)) continue;
        const c = st.chars[id];
        out.partners.push({ id, name: c.name, hidden: !!c.hidden, askable: c.items.filter(i => !i.destroyed && visibleTo(i)).map(itemView) });
    }
    const at = me.at;
    out.give.items = me.items.filter(i => !i.destroyed && !committed(st, data, who, i)).map(itemView);          // (a belonging that causes a recorded extra phase cannot be handed over: 6.2.4d)
    out.give.gold = me.gold;
    if (here(me)) {
        for (const key of me.discovered.paths) { const d = { kind: 'path', key }; if (knows(st, me, d, at)) out.give.discoveries.push({ ...d, label: discLabel(st, data, d, at) }); }
        for (const id of me.discovered.sites) { const d = { kind: 'site', id }; if (knows(st, me, d, at)) out.give.discoveries.push({ ...d, label: discLabel(st, data, d, at) }); }
        for (const id of me.siteCards?.[at] ?? []) { const d = { kind: 'sitecard', id }; out.give.discoveries.push({ ...d, label: discLabel(st, data, d, at) }); }
    }
    if (st.period === 'birdsong' && me.today.stage === 'plan' && here(me)) out.followable = st.order.filter(id => id !== who && !st.chars[id].dead && here(st.chars[id]) && st.chars[id].at === at).map(id => ({ id, name: st.chars[id].name }));
    out.followWhy = followWhy(st, who);
    const made = (st.offers ?? []).find(o => o.from === who), received = (st.offers ?? []).find(o => o.to === who);
    out.offers = { made: made ? made.id : null, received: received ? received.id : null };
    return out;
}

// Follow, for a screen that always shows it: for each OTHER character, may `who` follow him now (`ok`: the ones in `followable`, but for a guide who follows `who`), and if not, `code` and a plain `why` (the Detail voice adds
// 7.11.3). `at` / `from` name the clearings of the guide and of the follower when they are apart. `goes` is whom the guide has recorded to follow, only where the plan is visible (a seat is never sent
// another's plan): A who follows B who follows C goes with C, so it is no reason to refuse; a guide who follows `who` is: they would both stay home (a circle cancels, RealmSpeak).
export function followWhy(st, who) {
    const me = st.chars[who];
    if (!isMulti(st) || !me) return [];
    return st.order.filter(id => id !== who).map(id => {
        const g = st.chars[id], row = { id, name: g.name, ok: false, code: null, why: null };
        const plan = Array.isArray(g.today?.plan) ? g.today.plan[0] : null;
        if (plan?.act === 'follow') row.goes = plan.who ?? null;
        if (me.dead) { row.code = 'dead'; row.why = 'you are dead'; }
        else if (g.dead) { row.code = 'dead'; row.why = `${g.name} is dead`; }
        else if (st.period !== 'birdsong' || me.today.stage !== 'plan') { row.code = 'time'; row.why = 'Follow is chosen at Birdsong, while you plan'; }
        else if (!here(me)) { row.code = 'you-away'; row.why = me.flying ? 'you are in the air, not in a clearing' : 'you are on a road, not in a clearing'; }
        else if (!here(g)) { row.code = 'him-away'; row.why = g.flying ? `${g.name} is in the air, not in a clearing` : `${g.name} is on a road, not in a clearing`; }
        else if (g.at !== me.at) { row.code = 'apart'; row.why = `${g.name} is not in your clearing`; row.at = nameOfClearing(g.at); row.from = nameOfClearing(me.at); }
        else if (row.goes === who) { row.code = 'circle'; row.why = `${g.name} has already recorded to follow you`; }
        else row.ok = true;
        return row;
    });
}

// ---- the action: { type: 'meet', kind, ... } ----
// Anyone may take part in a meeting whether or not he has a question: an offer from a character who is only watching, a policy, stopping to follow. The answers are to the questions
// meet-offer, meet-block, meet-follow and meet-window.
export function act(st, data, a) {
    if (!isMulti(st)) throw new Error('there is nobody here to meet');
    switch (a.kind) {
        case 'offer': return offerFrom(st, data, a);
        case 'answer': return answerOffer(st, data, a);
        case 'cancel': return cancelOffer(st, data, a);
        case 'policy': return setPolicy(st, a);
        case 'block': return answerBlock(st, data, a);
        case 'follow-drop': return answerFollow(st, data, a);
        case 'stop-follow': return stopFollow(st, data, a);
        case 'ditch': return ditch(st, data, a);
        case 'done': return windowDone(st, data, a);
        default: throw new Error(`unknown meeting action ${a.kind}`);
    }
}
// Does the actor have to wait for somebody else? (an offer of his is open, or he has been asked to answer one)
export const openOffer = (st, id) => (st.offers ?? []).find(o => o.from === id) ?? null;
