import { upgradeState, isGameState, charsAt } from './party.js';

// Small shared helpers for the rules engine. Everything here is pure; randomness always goes through the state's own generator.

export const LEVELS = ['N', 'L', 'M', 'H', 'T'];                 // negligible, light, medium, heavy, tremendous
// What a chit is called on the screen: the Dwarf's Duck chit and the Berserker's Berserk chit are neither Move nor Fight by name
export const chitWord = c => (c.type === 'move' ? (c.duck ? 'Duck' : 'Move') : c.type === 'duck' ? 'Duck' : c.type === 'berserk' ? 'Berserk' : c.type === 'magic' ? 'Magic' : 'Fight');
export const lvl = letter => Math.max(0, LEVELS.indexOf(letter));
export const letterOf = level => LEVELS[Math.min(4, Math.max(0, level))];
export const WEIGHT_WORDS = { N: 'Negligible', L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };

// A copy of a game state keeps working like the original: structuredClone drops the accessors that forward st.ch, st.pending, st.plan, ... to the acting character
// (party.js), so a state is hydrated again. Anything else is simply cloned.
export const clone = o => { const c = structuredClone(o); return isGameState(c) ? upgradeState(c) : c; };

// ---- randomness inside the game state: st.rng is the generator's single 32-bit word ----
function nextFloat(st) {
    st.rng = (st.rng + 0x6D2B79F5) >>> 0;
    let t = st.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// Every draw says what it is for (`why`: 'hide', 'combat.tactics', 'search.locate' ...). Three ways the next value is found:
//   st.script   { why: [values] } (arrays of pairs are flattened): STRICT, a draw with no value left stops with its purpose (scenario runs, docs/design/scenario-harness)
//   st.dieQueue an array, or an object with shift(why): the older way tests script the next dice exactly (the oracle uses the object form)
//   neither     the generator, as in a real game
// st.drawLog, when it is an array, collects [why, value] for every draw (record and replay between engines).
function draw(st, why, real, queued = true) {
    let v;
    if (st.script) {
        const q = st.script[why ?? ''];
        if (!q?.length) throw new Error(`strict dice: no scripted draw left for '${why ?? 'untagged'}'`);
        v = q.shift();
    } else if (queued && st.dieQueue?.length) v = st.dieQueue.shift(why);          // (the queue holds dice, not indices: int() does not take from it)
    else v = real();
    st.drawLog?.push([why ?? null, v]);
    return v;
}
export const die = (st, why) => draw(st, why, () => 1 + Math.floor(nextFloat(st) * 6));
// 0..n-1 (scripted as the value drawn, 0-based)
export const int = (st, n, why) => draw(st, why, () => Math.floor(nextFloat(st) * n), false);
export const pick = (st, arr, why) => arr[int(st, arr.length, why)];
// A shuffle: strict scripts give the order as a permutation of indices under `order:<why>`; lists of 0 or 1 need no draw
export function shuffle(st, arr, why) {
    if (st.script && arr.length > 1) {
        const q = st.script[`order:${why ?? ''}`];
        if (!q?.length) throw new Error(`strict dice: no scripted order for '${why ?? 'untagged'}'`);
        st.drawLog?.push([`order:${why}`, q.slice()]);
        return q.map(k => arr[k]);
    }
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = int(st, i + 1, why); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
// Two dice, higher one counts (the rules' usual roll). Returns { dice: [a, b], value }.
export function roll2(st, why) { const a = die(st, why), b = die(st, why); return { dice: [a, b], value: Math.max(a, b) }; }

// ---- log ----
// `story` is the same event in prose (engine/story.js); the plain text `t` stays exact for tools and tests.
// `r` is the combat round the line belongs to (the review draws a box round each round).
// `who` names the character the line is about (the one acting) when more than one is in the game; opt.who overrides it (null: the line belongs to the whole table).
// With one character nothing is added: a line without `who` belongs to the only one.
// Several characters, for the server's per-seat views (server/redact.mjs, docs/design/online-shared.md): `with` names the OTHER characters standing in the same clearing when the line
// is written (who could see it happen, R-22; they are not looked up later, because they move) and `vis` ('public' | 'clearing' | 'owner') is what the caller says about the line
// (opt.vis); without it the server judges by the kind of line. A one-character game gets neither.
export function say(st, text, kind = 'info', story = null, opt = null) {
    const e = { day: st.day, t: text, k: kind };
    if (story) e.s = story;
    if (opt?.p) e.p = opt.p;                                                           // the same line told with the players' names (several characters, a line of the whole table)
    if (st.battle) e.r = st.battle.round;                                              // (a fight shared by several: the clearing's round, whoever is acting)
    else if (st.combat && !st.combat.ended && st.combat.round) e.r = st.combat.round;
    if (st.order?.length > 1) {
        const w = opt && 'who' in opt ? opt.who : st.actor;
        if (w) { e.who = w; Object.assign(e, witnesses(st, w, opt)); }
    }
    if (st.battle && (kind === 'combat' || kind === 'roll')) battleTag(st, e);          // a fight shared by several characters: only those in it are meant to read it
    st.log.push(e);
}
// A line or die of a shared fight: `vis` and `with` (everyone in the fight) replace whatever witnesses() wrote. They are deleted first so that the keys always come in the same order:
// witnesses() finds peers only for some speakers, and a state must not depend on which of several simultaneous answers was written first (the key order shows in the saved log).
function battleTag(st, e) {
    delete e.vis; delete e.with;
    e.vis = 'battle'; e.with = st.battle.order.slice();
}
// Who saw it (several characters): the others in the speaker's clearing, and the caller's `vis` when it gave one.
function witnesses(st, who, opt) {
    const c = st.chars?.[who], out = {};
    const peers = c && c.at && !c.dead && !c.onRoad && !c.flying ? charsAt(st, c.at).filter(id => id !== who) : [];
    if (peers.length) out.with = peers;
    if (opt?.vis) out.vis = opt.vis;
    return out;
}

// Counters for the grind statistics: st.stats[key] += n. Never read by the rules.
export function tally(st, key, n = 1) { const t = (st.stats ??= {}); t[key] = (t[key] ?? 0) + n; }

// ---- the dice tray: every roll the player should see is noted with what it was for, the faces, and the outcome ----
// dice: the faces as rolled; used: the same dice after modifiers (Honor), when they differ; value: the number that counted.
// `opt.who` overrides whose roll it was when several characters are in the game (null: a roll of the whole table, the Monster Roll).
export function noteRoll(st, what, dice, value, result = '', used = null, opt = null) {
    st.rolls ??= []; st.rollSeq = (st.rollSeq ?? 0) + 1;
    const entry = { n: st.rollSeq, day: st.day, what, dice: dice.map(Number), value, result };
    if (used && used.some((u, i) => u !== entry.dice[i])) entry.used = used;
    const w = opt && 'who' in opt ? opt.who : (st.order?.length > 1 ? st.actor : null);
    if (w) {
        entry.who = w;                                                                 // (several characters: whose roll it was, who stood by, and in which combat round)
        if (st.order?.length > 1) Object.assign(entry, witnesses(st, w, opt));
        if (st.order?.length > 1 && st.combat && !st.combat.ended && st.combat.round) entry.r = st.combat.round;
    }
    if (st.battle) battleTag(st, entry);
    st.rolls.push(entry);
    if (st.rolls.length > 60) st.rolls.shift();
    // Every roll is also a line in the log: "Hide: rolled 4+2, 4 counts: You hide".
    const faces = entry.used ? entry.dice.map((d, i) => (entry.used[i] === d ? `${d}` : `${d}-${d - entry.used[i]}`)).join('+') : entry.dice.join('+');
    const counts = entry.dice.length > 1 || entry.used ? `, ${value} counts` : '';
    say(st, `\u{1F3B2} ${what}: rolled ${faces}${counts}${result ? `: ${result}` : ''}`, 'roll', null, opt && 'who' in opt ? { who: opt.who } : entry.who ? { who: entry.who, vis: opt?.vis } : null);
    return entry;
}

// ---- clearings are addressed as "BL4" (tile id + number) ----
export const clearingId = (tile, n) => tile + n;
export const parseClearing = id => ({ tile: id.slice(0, 2), n: Number(id.slice(2)) });
