// Wording that depends on how the game ends, kept out of the screen so tests can hold it to the rules (docs/audit/rules-eval/01, S-05 and S-18).

// Only a game of a set length has a last day: sudden death ends when the goals are met, an endless game does not end (the engine keeps `lastDay` at 28 for those, unread).
export const timed = st => (st.mode ?? 'month') === 'month';
export const lastDayOf = st => st.lastDay ?? 28;

// "/28" after the day number, or nothing.
export const dayCap = st => (timed(st) ? `/${lastDayOf(st)}` : '');

// The welcome sentence about how long the game is.
export function lengthLine(st) {
    if (st.mode === 'sudden') return 'The game ends at the first midnight when you have met every one of your goals.';
    if (st.mode === 'endless') return 'There is no last day: play until you stop.';
    return `You have ${lastDayOf(st)} days.`;
}

// The title of the end-of-game sheet.
export function overTitle(st, dead) {
    if (dead) return 'You have died';
    if (st.mode === 'sudden') return 'Every goal is met';
    return lastDayOf(st) === 28 ? 'The month is over' : 'The game is over';
}

export const SPELLS_HOW = 'Spells you learn during the game count (starting spells do not). Reading the runes of a spell card with a Magic chit of its type can teach it to you.';
