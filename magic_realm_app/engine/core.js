// Small shared helpers for the rules engine. Everything here is pure; randomness always goes through the state's own generator.

export const LEVELS = ['N', 'L', 'M', 'H', 'T'];                 // negligible, light, medium, heavy, tremendous
export const lvl = letter => Math.max(0, LEVELS.indexOf(letter));
export const letterOf = level => LEVELS[Math.min(4, Math.max(0, level))];
export const WEIGHT_WORDS = { N: 'Negligible', L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };

export const clone = o => structuredClone(o);

// ---- randomness inside the game state: st.rng is the generator's single 32-bit word ----
function nextFloat(st) {
    st.rng = (st.rng + 0x6D2B79F5) >>> 0;
    let t = st.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// st.dieQueue lets tests script the next dice exactly; it is empty in real games.
export const die = st => (st.dieQueue?.length ? st.dieQueue.shift() : 1 + Math.floor(nextFloat(st) * 6));
export const int = (st, n) => Math.floor(nextFloat(st) * n);
export const pick = (st, arr) => arr[int(st, arr.length)];
export function shuffle(st, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = int(st, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
// Two dice, higher one counts (the rules' usual roll). Returns { dice: [a, b], value }.
export function roll2(st) { const a = die(st), b = die(st); return { dice: [a, b], value: Math.max(a, b) }; }

// ---- log ----
export function say(st, text, kind = 'info') { st.log.push({ day: st.day, t: text, k: kind }); }

// Counters for the grind statistics: st.stats[key] += n. Never read by the rules.
export function tally(st, key, n = 1) { const t = (st.stats ??= {}); t[key] = (t[key] ?? 0) + n; }

// ---- the dice tray: every roll the player should see is noted with what it was for, the faces, and the outcome ----
// dice: the faces as rolled; used: the same dice after modifiers (Honor), when they differ; value: the number that counted.
export function noteRoll(st, what, dice, value, result = '', used = null) {
    st.rolls ??= []; st.rollSeq = (st.rollSeq ?? 0) + 1;
    const entry = { n: st.rollSeq, day: st.day, what, dice: dice.map(Number), value, result };
    if (used && used.some((u, i) => u !== entry.dice[i])) entry.used = used;
    st.rolls.push(entry);
    if (st.rolls.length > 60) st.rolls.shift();
    // Every roll is also a line in the log: "Hide: rolled 4+2, 4 counts: You hide".
    const faces = entry.used ? entry.dice.map((d, i) => (entry.used[i] === d ? `${d}` : `${d}-${d - entry.used[i]}`)).join('+') : entry.dice.join('+');
    const counts = entry.dice.length > 1 || entry.used ? `, ${value} counts` : '';
    say(st, `\u{1F3B2} ${what}: rolled ${faces}${counts}${result ? `: ${result}` : ''}`, 'roll');
    return entry;
}

// ---- clearings are addressed as "BL4" (tile id + number) ----
export const clearingId = (tile, n) => tile + n;
export const parseClearing = id => ({ tile: id.slice(0, 2), n: Number(id.slice(2)) });
