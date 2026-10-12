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

// ---- clearings are addressed as "BL4" (tile id + number) ----
export const clearingId = (tile, n) => tile + n;
export const parseClearing = id => ({ tile: id.slice(0, 2), n: Number(id.slice(2)) });
