// goalspread.js: how a game's victory points are spread over the five goals (the New Game screen's quick start, the roguelike's runs and the Campaign's goals control share it).
// Rules 3.3.6: the points are spread over Great Treasures, Spells, Fame, Notoriety and Gold, each a whole number from 0 to 5, adding up to the game's total. The factor of a goal (what one
// point of it asks for: Great Treasures 1, Spells 2, Fame 10, Notoriety 20, Gold 30) is the engine's own (FACTORS); nothing here repeats it.
import { FACTORS } from '../engine/catalogue.js';

/** The most victory points that may ride on one goal (rule 3.3.6a, and the engine's checkVp). */
export const GOAL_MAX = 5;
/** The goals in the order the goals step shows them: the three scores first. */
export const GOAL_ORDER = ['fame', 'notoriety', 'gold', 'spells', 'great'];
export const GOAL_NAME = { great: 'Great Treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };

// The default spread. Fame takes the larger part (about three in five, at most five), Notoriety the rest up to five, Gold what is left over; Great Treasures and Spells none. For the usual five points
// that is the engine's own default (Fame 3, Notoriety 2), for two it is Fame 2.
export const spreadVp = total => {
    const fame = Math.min(5, Math.ceil(total * 0.6)), notoriety = Math.min(5, total - fame);
    return { great: 0, spells: 0, fame, notoriety, gold: Math.max(0, total - fame - notoriety) };
};

const pts = (vp, k) => (Number.isInteger(vp?.[k]) ? vp[k] : 0);
/** The victory points a spread uses. */
export const spreadUsed = vp => GOAL_ORDER.reduce((a, k) => a + pts(vp, k), 0);
/** A whole spread: exactly the five goals, each a whole number from 0 to 5, adding up to `total`. */
export const validSpread = (vp, total) => !!vp && typeof vp === 'object' && Object.keys(vp).length === 5 && GOAL_ORDER.every(k => Number.isInteger(vp[k]) && vp[k] >= 0 && vp[k] <= GOAL_MAX) && spreadUsed(vp) === total;
export const sameSpread = (a, b) => GOAL_ORDER.every(k => pts(a, k) === pts(b, k));
/** The most points one goal may hold now: what it has plus what is left to spend, never above five. */
export const goalMax = (vp, k, total) => Math.min(GOAL_MAX, pts(vp, k) + Math.max(0, total - spreadUsed(vp)));
/** One goal set to `n` (clamped: never below 0, never above what is left to spend), the others as they were. The total is never exceeded. */
export const setGoal = (vp, k, n, total) => ({ ...cleanSpread(vp), [k]: Math.max(0, Math.min(Number.isInteger(n) ? n : 0, goalMax(vp, k, total))) });
const cleanSpread = vp => ({ great: pts(vp, 'great'), spells: pts(vp, 'spells'), fame: pts(vp, 'fame'), notoriety: pts(vp, 'notoriety'), gold: pts(vp, 'gold') });

/** An earlier spread made to fit `total` points: points are added to the goal that already holds the most (below five; ties in the goals step's order), or taken from the goal holding the most
 * (ties from the last goal), until it adds up. A spread that already fits is returned as it is. Anything that is not a spread gives null. */
export function fitSpread(vp, total) {
    if (!vp || typeof vp !== 'object' || GOAL_ORDER.some(k => vp[k] != null && (!Number.isInteger(vp[k]) || vp[k] < 0))) return null;
    const out = cleanSpread(vp);
    for (const k of GOAL_ORDER) out[k] = Math.min(GOAL_MAX, out[k]);
    for (let n = 0; spreadUsed(out) < total && n < 100; n++) {
        const k = GOAL_ORDER.filter(x => out[x] < GOAL_MAX).sort((a, b) => out[b] - out[a] || GOAL_ORDER.indexOf(a) - GOAL_ORDER.indexOf(b))[0];
        if (!k) break;
        out[k]++;
    }
    for (let n = 0; spreadUsed(out) > total && n < 100; n++) {
        const k = [...GOAL_ORDER].reverse().filter(x => out[x] > 0).sort((a, b) => out[b] - out[a])[0];
        out[k]--;
    }
    return validSpread(out, total) ? out : null;
}

// ---- what the points mean, in plain words (all from the engine's factors) ----
/** What `n` points on a goal ask for: the number to reach. */
export const goalNeed = (k, n) => n * FACTORS[k];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** The goal's number, in the words of the game: "earn 20 Fame", "hold 46 gold (30 above your starting worth of 16)". No points: "no goal". Gold counts from the starting worth (rule 9.3.2e: 10 gold and the
 * price of the gear the character begins with), which the game knows: pass it as `startValue` to name the figure. */
export function goalWords(k, n, { startValue = null } = {}) {
    if (!n) return 'no goal';
    const need = goalNeed(k, n);
    switch (k) {
        case 'great': return `own and carry ${plural(need, 'Great Treasure', 'Great Treasures')}`;
        case 'spells': return `learn ${plural(need, 'spell', 'spells')} during the game`;
        case 'fame': return `earn ${need} Fame`;
        case 'notoriety': return `earn ${need} Notoriety`;
        case 'gold': return startValue == null ? `${need} gold above your starting worth` : `hold ${startValue + need} gold (${need} above your starting worth of ${startValue})`;
        default: return '';
    }
}
/** "Fame 2: earn 20 Fame". */
export const goalLine = (k, n, o) => `${GOAL_NAME[k]} ${n}: ${goalWords(k, n, o)}`;
/** The goals that carry points, in the goals step's order: [{ k, name, n, need, words }]. */
export const goalList = (vp, o) => GOAL_ORDER.filter(k => pts(vp, k) > 0).map(k => ({ k, name: GOAL_NAME[k], n: pts(vp, k), need: goalNeed(k, pts(vp, k)), words: goalWords(k, pts(vp, k), o) }));
