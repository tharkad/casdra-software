// The party: who is playing in a game, and the seam that lets the engine keep reading one hero.
// State version 2 (docs/design/multiplayer-step1.md): characters are keyed by id in `st.chars`, `st.order` is their seating, `st.players` says who owns which, `st.actor` is the
// character the engine is working for right now, and `st.asks` holds the questions waiting for an answer, each addressed to a character: { who, pending }.
// Everything a character has "today" (his recorded plan, the turn being played, the fight he is in, the end-of-turn report, ...) lives in `ch.today`.
// The engine itself still says `st.ch`, `st.pending`, `st.plan`, `st.turn`, `st.combat`: hydrate() puts non-enumerable accessors on the state that forward each of them to the actor's
// record. They are not data: clone, JSON and structuredClone do not carry them, so everything that clones or loads a state calls upgradeState() (core.js `clone` and `apply` do).
// This file imports nothing, so core.js can use it.

export const STATE_VERSION = 2;
// The fields of one character's day that used to be properties of the state itself. They live in `ch.today`, under the same names.
export const DAY_FIELDS = ['plan', 'planBase', 'planKinds', 'planFull', 'planFree', 'planBlazing', 'turn', 'turnEnd', 'combat', 'companions', 'mark', 'report', 'slain'];
// What a version 2 state has that version 1 did not (top level), and what a character record has beyond the character itself.
export const NEW_KEYS = ['v', 'players', 'chars', 'order', 'actor', 'asks'];
export const CHAR_EXTRAS = ['owner', 'life', 'today'];
export const DEFAULT_PLAYER = 'p1';

// More than one character is in the game: the shared day (docs/design/multiplayer-step2.md). With one the engine runs exactly the single-hero day it always did.
export const isMulti = st => st.order.length > 1;
export const livingIds = st => st.order.filter(id => !st.chars[id].dead);
// Where a character stands in the shared day (ch.today.stage, written only with several characters): 'plan' (Birdsong, a plan to record), 'planned' (recorded, waiting for the others),
// 'turn' (his chit is drawn, he is playing), 'following' (he recorded Follow: his turn is his guide's, docs/design/multiplayer-step4.md), 'done' (his turn is over), 'dead' (waiting for the
// next Birdsong to start again), 'gone' (he left the map: he plays no more and does not start again, docs/design/multiplayer-harden.md).
export const STAGES = ['plan', 'planned', 'turn', 'following', 'done', 'dead', 'gone'];

// The id of the character the engine is working for: the actor, else the first seat (a hand-built state may have neither set).
export const actorId = st => st.actor ?? st.order?.[0] ?? null;

// Puts the compatibility accessors on a version 2 state (idempotent). Returns the state.
export function hydrate(st) {
    // a plain data property of one of these names (written onto a raw copy that had no accessors) is the newer truth: it is read first and written through the setter below
    const stray = {};
    for (const k of ['ch', 'pending', ...DAY_FIELDS]) { const d = Object.getOwnPropertyDescriptor(st, k); if (d && 'value' in d) stray[k] = d.value; }
    const def = (name, get, set) => Object.defineProperty(st, name, { get, set, enumerable: false, configurable: true });
    if (!st.actor || !st.chars[st.actor]) st.actor = st.order[0] ?? null;
    def('ch', () => st.chars[actorId(st)] ?? null, v => {
        const id = actorId(st), old = st.chars[id];
        if (v && old && v !== old && !v.today && old.today) v.today = old.today;            // a new record for the same seat (a restart, a test's stand-in) keeps that seat's day
        if (id == null) throw new Error('no character is acting');
        st.chars[id] = v;
    });
    for (const f of DAY_FIELDS) def(f, () => st.chars[actorId(st)]?.today?.[f], v => { const c = st.chars[actorId(st)]; (c.today ??= {})[f] = v; });
    def('pending',
        () => { const id = actorId(st); for (const a of st.asks) if (a.who === id) return a.pending; return null; },
        v => {
            const id = actorId(st), i = st.asks.findIndex(a => a.who === id);
            if (v == null) { if (i >= 0) st.asks.splice(i, 1); }
            else if (i >= 0) st.asks[i].pending = v;
            else st.asks.push({ who: id, pending: v });
        });
    for (const k of Object.keys(stray)) st[k] = stray[k];
    return st;
}

// Any state, in any version, to a hydrated version 2 state, in place. A version 1 state (one `ch`, one `pending`, the day fields on the state) is rebuilt as a party of one.
// Anything that is not a game state (no hero at all) is returned untouched.
export function upgradeState(st) {
    if (!st || typeof st !== 'object') return st;
    if (st.chars) return hydrate(st);
    if (!st.ch) return st;
    const ch = st.ch, id = ch.id ?? 'ch';
    const today = {};
    for (const f of DAY_FIELDS) if (f in st) { today[f] = st[f]; delete st[f]; }
    ch.owner = DEFAULT_PLAYER; ch.life = (st.deaths ?? 0) + 1; ch.today = today;
    const pending = st.pending;
    delete st.ch; delete st.pending;
    st.v = STATE_VERSION;
    st.players = [{ id: DEFAULT_PLAYER, name: 'You', seat: 0, chars: [id] }];
    st.chars = { [id]: ch };
    st.order = [id];
    st.actor = id;
    st.asks = pending ? [{ who: id, pending }] : [];
    for (const o of [...(st.mons ?? []), ...(st.nats ?? [])]) if (o.hired) o.hiredBy = id;
    return hydrate(st);
}

// The state is a game with a hero in it (so a clone of it must be hydrated again).
export const isGameState = o => !!o && typeof o === 'object' && 'day' in o && 'period' in o && (!!o.chars || !!o.ch);

// ---- addressing ----
export const charIds = st => st.order.slice();
export const askOf = (st, who) => st.asks.find(a => a.who === who) ?? null;
export const ownerOf = (st, who) => st.chars[who]?.owner ?? null;
// The player's name for a character (the table talks about players); the character's own name when the game has no players' names.
export const playerNameOf = (st, id) => st.players?.find(p => p.id === st.chars[id]?.owner)?.name ?? st.chars[id]?.name ?? id;
// The characters in the same clearing (not on a road, not in the air): the ones who can see, trade with and fight each other.
export const charsAt = (st, clearing) => st.order.filter(id => { const c = st.chars[id]; return c && !c.dead && c.at === clearing && !c.onRoad && !c.flying; });
// The natives and monsters a character has hired or controls.
export const hirelingsOf = (st, who) => [...st.nats, ...st.mons].filter(o => o.hired && o.hiredBy === who);

// Which character does an action address? `action.who` when given; else the only one with a question, else the current actor when he has one. Throws when it cannot tell.
export function resolveWho(st, action) {
    if (action?.who != null) {
        if (!st.chars[action.who]) throw new Error(`there is no character "${action.who}" in this game`);
        return action.who;
    }
    if (st.asks.length === 1) return st.asks[0].who;
    if (st.asks.some(a => a.who === st.actor)) return st.actor;
    if (st.asks.length) throw new Error('which character? several are waiting to answer');
    return actorId(st);
}

// Runs fn as another character. The day fields are stored in the character's own record, so there is nothing to store back; the previous actor is restored.
export function withActor(st, who, fn) {
    if (!st.chars[who]) throw new Error(`there is no character "${who}" in this game`);
    const prev = st.actor;
    st.actor = who;
    try { return fn(); } finally { st.actor = prev; }
}

// After an action: the engine is "in the context of" whoever has the next question, so that a caller reading st.pending sees it. The character who just acted stays the
// actor while he still has a question; otherwise it passes to the first one who has.
export function settleActor(st, who) {
    st.actor = who;
    if (!st.asks.some(a => a.who === who) && st.asks.length) st.actor = st.asks[0].who;
}

// A character record joins the party (setup.js builds the record; this seats him).
export function seat(st, ch, { owner = DEFAULT_PLAYER, name = 'You' } = {}) {
    if (st.chars[ch.id]) throw new Error(`${ch.name ?? ch.id} is already in this game`);
    ch.owner = owner; ch.life ??= 1; ch.today ??= { plan: null, turn: null, combat: null };
    st.chars[ch.id] = ch;
    st.order.push(ch.id);
    let p = st.players.find(x => x.id === owner);
    if (!p) { p = { id: owner, name, seat: st.players.length, chars: [] }; st.players.push(p); }
    p.chars.push(ch.id);
    if (!st.actor) st.actor = ch.id;
    return ch;
}

// ---- the version 1 view ----
// What the engine's state looked like before characters were keyed by id: one `ch`, one `pending`, the day fields on the state, no `who` or `hiredBy`. A version 1 state is
// returned as it is. Used by the server's viewFor (the wire format of a one-character game is still version 1 until the screens learn about parties, so the app and every client
// keep working), and by tools/regress.mjs and the characterization fixtures, which compare engines through it. `like` is a state whose top-level key order to follow, so that
// JSON.stringify of two equal states gives equal text. It builds a new top-level object and shares everything below it with the state: copy before changing anything.
const without = (o, drop) => { const r = {}; for (const k of Object.keys(o)) if (!drop.includes(k)) r[k] = o[k]; return r; };
export function legacyView(st, like = null) {
    if (!st || !st.chars) return st;
    const id = actorId(st), c = st.chars[id], mine = {};
    for (const k of Object.keys(st)) if (!NEW_KEYS.includes(k)) mine[k] = st[k];
    mine.v = 1;
    mine.ch = without(c, CHAR_EXTRAS);
    const today = c.today ?? {};
    for (const f of DAY_FIELDS) if (f in today) mine[f] = today[f];
    mine.pending = st.asks.find(a => a.who === id)?.pending ?? null;
    if (st.order.length > 1) {                                  // (with one character `who` is never written)
        mine.log = st.log.map(e => ('who' in e ? without(e, ['who']) : e));
        if (st.rolls) mine.rolls = st.rolls.map(e => ('who' in e ? without(e, ['who']) : e));
    }
    for (const list of ['mons', 'nats']) if (mine[list]?.some(o => 'hiredBy' in o)) mine[list] = mine[list].map(o => ('hiredBy' in o ? without(o, ['hiredBy']) : o));
    if (!like) return mine;
    const out = {};
    for (const k of Object.keys(like)) if (k in mine) out[k] = mine[k];
    for (const k of Object.keys(mine)) if (!(k in out)) out[k] = mine[k];
    return out;
}

// The shape every version 2 state must have (used by tests/bot.mjs checkInvariants): throws a sentence naming the first thing wrong.
export function checkParty(st) {
    const bad = m => { throw new Error(`party invariant: ${m}`); };
    if (st.v !== STATE_VERSION) bad(`v is ${st.v}`);
    if (!st.order.length) bad('nobody is seated');
    if (new Set(st.order).size !== st.order.length) bad('a character is seated twice');
    for (const id of st.order) { const c = st.chars[id]; if (!c) bad(`${id} is seated but has no record`); if (c.id !== id) bad(`${id} holds the record of ${c.id}`); if (!c.owner) bad(`${id} has no owner`); if (!c.today) bad(`${id} has no day`); }
    if (Object.keys(st.chars).length !== st.order.length) bad('a record is not seated');
    if (!st.chars[st.actor]) bad(`the actor ${st.actor} is not a character`);
    const owned = st.players.flatMap(p => p.chars);
    if (owned.length !== st.order.length || st.order.some(id => !owned.includes(id))) bad('players and seats disagree');
    for (const p of st.players) for (const id of p.chars) if (st.chars[id]?.owner !== p.id) bad(`${id} is listed under ${p.id} but owned by ${st.chars[id]?.owner}`);
    const seen = new Set();
    for (const a of st.asks) { if (!st.chars[a.who]) bad(`a question for ${a.who}, who is not here`); if (seen.has(a.who)) bad(`two questions for ${a.who}`); seen.add(a.who); if (!a.pending?.type) bad(`a question for ${a.who} has no type`); }
    if (st.order.length > 1) {
        for (const id of st.order) { const c = st.chars[id]; if (!STAGES.includes(c.today.stage)) bad(`${id} is in stage ${c.today.stage}`); }
        const rec = st.dayRec;
        if (rec) {
            if (rec.order.some(id => !st.chars[id]) || new Set(rec.order).size !== rec.order.length) bad('the drawn order names a stranger or repeats one');
            if (!(rec.i >= 0 && rec.i <= rec.order.length)) bad(`the turn pointer is ${rec.i}`);
        }
        if (st.period === 'daylight' && rec) {
            const playing = st.order.filter(id => st.chars[id].today.stage === 'turn');
            if (playing.length > 1) bad(`${playing.join(' and ')} are both in the middle of a turn`);
        }
    }
    checkBattle(st, bad);
    checkMeet(st, bad);
    for (const o of [...st.nats, ...st.mons]) {
        if (!!o.hired !== !!o.hiredBy) bad(`${o.id} is ${o.hired ? 'hired by nobody' : 'not hired but hiredBy ' + o.hiredBy}`);
        if (o.hiredBy && !st.chars[o.hiredBy]) bad(`${o.id} is hired by ${o.hiredBy}, who is not here`);
    }
}

// The fight shared by several characters (battle.js): what must hold whenever it is on the table.
const BATTLE_STEPS = ['meet', 'lure', 'assign', 'charge', 'encounter', 'melee', 'harm'];
function checkBattle(st, bad) {
    const b = st.battle;
    if (!b) {
        for (const id of st.order) if (st.chars[id].today?.combat?.shared) bad(`${id} has a shared fight view but there is no fight`);
        return;
    }
    if (!BATTLE_STEPS.includes(b.step)) bad(`the fight is in step ${b.step}`);
    if (!(b.round >= 1) || !(b.quiet >= 0)) bad(`round ${b.round}, quiet ${b.quiet}`);
    if (st.period !== 'evening') bad(`a fight in period ${st.period}`);
    if (b.order.length < 2 || new Set(b.order).size !== b.order.length || b.order.some(id => !st.chars[id])) bad('the fight\'s order names a stranger, repeats one or holds fewer than two');
    if (Object.keys(b.members).length !== b.order.length || b.order.some(id => !b.members[id])) bad('members and order disagree');
    const inIds = b.order.filter(id => b.members[id].state === 'in');
    if (!inIds.length) bad('a fight with nobody in it');
    const uids = new Set();
    for (const d of b.dens) {
        if (uids.has(d.uid)) bad(`creature ${d.uid} twice`);
        uids.add(d.uid);
        if (d.sheet) {
            if (!b.members[d.sheet]) bad(`${d.id} is on the sheet of ${d.sheet}, who is not in the fight`);
            if (b.members[d.sheet].state !== 'in' && !d.dead) bad(`${d.id} is on the sheet of ${d.sheet}, who has left`);
        }
        if (d.kind === 'nat') for (const id of d.battlers ?? []) if (!b.members[id]) bad(`${d.id} fights ${id}, who is not in the fight`);
        if (d.partOf && !b.dens.some(o => o.uid === d.partOf)) bad(`${d.id} is part of a creature that is not here`);
    }
    const hu = new Set();
    for (const h of b.hires) {
        if (hu.has(h.uid)) bad(`hireling ${h.uid} twice`);
        hu.add(h.uid);
        if (!b.members[h.owner] || b.members[h.owner].state !== 'in') bad(`hireling ${h.id} belongs to ${h.owner}, who is not in the fight`);
    }
    for (const d of b.dens) if (d.engagedBy && !hu.has(d.engagedBy)) bad(`${d.id} fights a hireling that is not here`);
    if (b.pvp) {                          // character against character: charges, hirelings sent at a character, the record of kills
        if (!Array.isArray(b.charges) || !Array.isArray(b.kills)) bad('a pvp fight keeps its charges and its kills');
        for (const x of b.charges) {
            if (!b.members[x.by] || !b.members[x.on]) bad(`a charge by ${x.by} on ${x.on}, who is not in the fight`);
            if (b.members[x.by].state !== 'in' || b.members[x.on].state !== 'in') bad(`a charge by ${x.by} on ${x.on} outlived one of them`);
            if (b.members[x.by].charged !== x.on) bad(`${x.by} is said to have charged ${b.members[x.by].charged}, the table says ${x.on}`);
            if (st.chars[x.by].owner === st.chars[x.on].owner) bad(`${x.by} charges ${x.on}, a character of the same player`);
        }
        for (const h of b.hires) if (h.targetChar && (!b.members[h.targetChar] || b.members[h.targetChar].state !== 'in')) bad(`hireling ${h.id} is sent at ${h.targetChar}, who is not in the fight`);
    } else if (b.charges || b.kills) bad('a fight without the pvp switch holds charges');
    for (const a of st.asks) {
        if (!/^combat-/.test(a.pending.type)) bad(`${a.who} is asked ${a.pending.type} in the middle of a fight`);
        if (b.members[a.who]?.state !== 'in') bad(`${a.who} is asked ${a.pending.type} but is not in the fight`);
    }
    for (const id of inIds) {
        const c = st.chars[id].today.combat;
        if (!c?.shared || c.ended) bad(`${id} is in the fight with no live view of it`);
        if (st.chars[id].dead) bad(`${id} is dead but still in the fight`);
    }
    // the sheets add up: nobody is asked for a play he has already made, and a ready member has no question
    for (const id of inIds) if (b.members[id].ready && b.members[id].melee && st.asks.some(a => a.who === id && a.pending.type === 'combat-melee')) bad(`${id} has played and is asked to play`);
}

// Characters meeting (meet.js, docs/design/multiplayer-step4.md): offers between two characters, followers, the end-of-day trade window and the block / follow-drop questions.
function checkMeet(st, bad) {
    const ask = (who, type) => st.asks.find(a => a.who === who && (a.pending.type === type || (a.pending.type === 'meet-offer' && a.pending.resume?.type === type)))?.pending;
    const seenOut = new Set(), seenIn = new Set(), ids = new Set();
    for (const o of st.offers ?? []) {
        if (ids.has(o.id)) bad(`offer ${o.id} twice`);
        ids.add(o.id);
        if (!st.chars[o.from] || !st.chars[o.to] || o.from === o.to) bad(`offer ${o.id} is between ${o.from} and ${o.to}`);
        if (seenOut.has(o.from)) bad(`${o.from} has two offers open`);
        if (seenIn.has(o.to)) bad(`${o.to} is offered two things at once`);
        seenOut.add(o.from); seenIn.add(o.to);
        const q = st.asks.find(a => a.who === o.to && a.pending.type === 'meet-offer' && a.pending.id === o.id);
        if (!q) bad(`${o.to} is not asked about offer ${o.id}`);
    }
    for (const a of st.asks) if (a.pending.type === 'meet-offer' && !(st.offers ?? []).some(o => o.id === a.pending.id && o.to === a.who)) bad(`${a.who} is asked about an offer that is not open`);
    for (const [f, g] of Object.entries(st.follows ?? {})) {
        if (!st.chars[f] || !st.chars[g]) bad(`${f} follows ${g}, who is not here`);
        if (st.chars[f].today.stage !== 'following') bad(`${f} follows ${g} but is in stage ${st.chars[f].today.stage}`);
        if (st.follows[g]) bad(`${f} follows ${g}, who follows ${st.follows[g]}`);
        if (st.chars[f].at !== st.chars[g].at) bad(`${f} follows ${g} from another clearing`);
    }
    for (const id of st.order) if (st.chars[id].today.stage === 'following' && !st.follows?.[id]) bad(`${id} is following nobody`);
    const bc = st.blockCheck;
    if (bc) for (const id of bc.asked) if (!ask(id, 'meet-block') && !['yes', 'no'].includes(st.chars[id].today.blockVote)) bad(`${id} is asked to block but has no question and has not answered`);
    const fc = st.followCheck;
    if (fc) for (const id of fc.asked) if (!ask(id, 'meet-follow') && !['drop', 'stay'].includes(st.chars[id].today.followVote)) bad(`${id} is asked to stop following but has no question and has not answered`);
    const tw = st.tradeWindow;
    if (tw) for (const g of tw.groups) for (const id of g.ids) {
        if (!g.done.includes(id) && !ask(id, 'meet-window')) bad(`${id} has not left the trade window and has no question`);
        if (st.chars[id].dead) bad(`${id} is dead in the trade window`);
    }
    for (const a of st.asks) if (a.pending.type === 'meet-window' && !tw) bad(`${a.who} is asked about a trade window that is not open`);
}
