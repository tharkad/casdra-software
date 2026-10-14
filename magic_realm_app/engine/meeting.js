import { die, noteRoll } from './core.js';
import { meetingResult } from './tables.js';
import { oneDie } from './modifiers.js';

// Rolls on the Meeting Table: normally two dice, higher counts. Special advantages change it: Fear rolls one die, Honor subtracts one
// from each die (never below 1). Used for trading, hiring and the battle roll at the start of an evening.
export const hasAdv = (st, key) => (st.ch.adv ?? []).includes(key);

export function meetingDice(st, data = null) {
    // Fear, Tracking in the Woods tiles, and a Lucky Charm each give one die (they do not stack)
    const n = hasAdv(st, 'fear') || (data && oneDie(st, 'meeting', st.ch.at, data)) ? 1 : 2;
    const raw = Array.from({ length: n }, () => die(st));
    const honor = hasAdv(st, 'honor') ? 1 : 0;
    const used = raw.map(d => Math.max(1, d - honor));
    return { dice: honor ? raw.map((d, i) => (used[i] === d ? `${d}` : `${d}-1`)) : raw, raw, used, value: Math.max(...used) };
}

// One whole Meeting Table roll in a column, following Trouble (roll again as Unfriendly) and Opportunity (roll again one level friendlier).
// Returns { res, r, note }: the final result, the last dice, and a note on what chained.
export function meetingOutcome(st, col, what = 'Meeting Table', data = null) {
    const seen = [];
    const rollOnce = (c, label) => {
        const r = meetingDice(st, data), res = meetingResult(c, r.value);
        seen.push(noteRoll(st, label, r.raw, r.value, res, r.used).n);
        return { r, res };
    };
    let { r, res } = rollOnce(col, what), note = '';
    for (let guard = 0; guard < 6; guard++) {
        if (res === 'Trouble') { note += 'Trouble; '; col = -1; ({ r, res } = rollOnce(col, `${what}: Trouble, roll again as Unfriendly`)); }
        else if (res === 'Opportunity') { note += 'Opportunity; '; col = Math.min(2, col + 1); ({ r, res } = rollOnce(col, `${what}: Opportunity, roll again one level friendlier`)); }
        else break;
    }
    if (res === 'Trouble' || res === 'Opportunity') res = 'No deal';
    return { res, r, note, rolls: seen };
}

// Buying drinks (7.6.5b): one gold for every member of the group in his clearing, hired or not; the group counts one level friendlier.
export function drinksCost(st, data, group) {
    return st.nats.filter(n => !n.dead && n.loc?.c === st.ch.at && data.natives[n.id].group === group).length;
}
