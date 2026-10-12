import { die } from './core.js';

// Rolls on the Meeting Table: normally two dice, higher counts. Special advantages change it: Fear rolls one die, Honor subtracts one
// from each die (never below 1). Used for trading, hiring and the battle roll at the start of an evening.
export const hasAdv = (st, key) => (st.ch.adv ?? []).includes(key);

export function meetingDice(st) {
    const n = hasAdv(st, 'fear') ? 1 : 2;
    const raw = Array.from({ length: n }, () => die(st));
    const honor = hasAdv(st, 'honor') ? 1 : 0;
    const used = raw.map(d => Math.max(1, d - honor));
    return { dice: honor ? raw.map((d, i) => (used[i] === d ? `${d}` : `${d}-1`)) : raw, value: Math.max(...used) };
}
