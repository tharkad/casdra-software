// Wording that depends on how the game ends, kept out of the screen so tests can hold it to the rules (docs/audit/rules-eval/01, S-05 and S-18).

// (`game` is the game's own record, `gameOf(st, data)` of the views: `mode` and `lastDay`)
// Only a game of a set length has a last day: sudden death ends when the goals are met, an endless game does not end (the engine keeps `lastDay` at 28 for those, unread).
export const timed = game => (game.mode ?? 'month') === 'month';
export const lastDayOf = game => game.lastDay ?? 28;

// "/28" after the day number, or nothing.
export const dayCap = game => (timed(game) ? `/${lastDayOf(game)}` : '');

// The welcome sentence about how long the game is.
export function lengthLine(game) {
    if (game.mode === 'sudden') return 'The game ends at the first midnight when you have met every one of your goals.';
    if (game.mode === 'endless') return 'There is no last day: play until you stop.';
    return `You have ${lastDayOf(game)} days.`;
}

// The title of the end-of-game sheet.
export function overTitle(game, dead) {
    if (dead) return 'You have died';
    if (game.mode === 'sudden') return 'Every goal is met';
    return lastDayOf(game) === 28 ? 'The month is over' : 'The game is over';
}

export const SPELLS_HOW = 'Spells you learn during the game count (starting spells do not). Reading the runes of a spell card with a Magic chit of its type can teach it to you.';

// The Story voice for every log line and roll (storyvoice.js): `storyLine(entry)` is the sentence for a line without a real story, `lineFor(entry, voice)` the line to show.
export { storyLine, lineFor, storyRoll, rollDetail, hasRealStory, crowd, setStoryState, phasePrompt, calloutLine, quietChitsLine, nativesLine, arrivalLine, blockedLine, closedInLine, turnEndStory } from './storyvoice.js';
