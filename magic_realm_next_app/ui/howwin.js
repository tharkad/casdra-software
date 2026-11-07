// howwin.js: "How you win", in plain words (Story) and with the rule numbers (Detail). The Campaign's run panel and the in-game Goals sheet say the same thing from here, so the WHEN
// (nothing is judged before the last day) and the WHAT (a total of zero or more) are written once. No numbers of its own: the day and the starting score come from the game / the engine.
// Rules: 9.3.2 (what each goal scores), 9.3.2f (divide by the factor, round down), 9.3.2g (the bonus), 9.3.2h (the total), 9.3.2i (zero or more has met the requirements; a shortfall in one goal can
// be made up in another), 3.3.6 (the requirements are the points times the factor).
import { h } from './dom.js';

/** When the game is judged: { when (Story), rule (Detail) }. `mode` is the game's mode ('month', 'custom', 'sudden', 'endless'), `lastDay` its last day. */
export function whenWords(mode, lastDay) {
    if (mode === 'sudden') return { when: 'Nothing is judged until the game ends, at the first midnight when every goal is met', rule: 'the first midnight at which every goal is met (10.E.3)' };
    if (mode === 'endless') return { when: 'This game has no end, so nothing is judged', rule: 'an endless game is never scored' };
    return { when: `Nothing is judged until the end of day ${lastDay}`, rule: `the end of day ${lastDay}` };
}

/** The two voices of the line. `start`: the score the game begins with, from the engine (a number); without it the line says only that the total starts below zero. */
export function howWin({ mode = 'month', lastDay = 28, start = null } = {}) {
    const w = whenWords(mode, lastDay);
    if (mode === 'endless') return { story: `${w.when}.`, detail: `${w.when} (${w.rule}).` };
    const begin = start == null ? 'It starts below zero because you have earned nothing yet.' : start < 0 ? `It starts at ${start} because you have earned nothing yet.` : 'It starts at zero.';
    const story = `${w.when}. Then your total must be zero or more. ${begin} Each goal you reach pulls it up; falling short costs three times as much. Meet each goal's number, or make up a shortfall with extra somewhere else.`;
    const detail = `Scored at ${w.rule} (9.3.2). Each goal: earned minus needed, a shortfall counted three times, divided by the goal's factor and rounded down (9.3.2f), plus a bonus of that result times the victory points on the goal (9.3.2g). The total of all goals (9.3.2h) must be zero or more to win (9.3.2i); extra in one goal can make up a shortfall in another. ${start != null && start >= 0 ? 'The total starts at zero.' : `With nothing earned every goal is short, so the total begins ${start == null ? 'below zero' : `at ${start}`}.`}`;
    return { story, detail };
}

/** The line as page nodes: both voices in the page, core.css shows the one the player has chosen (html[data-voice-mode]). */
export const howWinEl = (opts, attrs = {}) => { const t = howWin(opts); return h('p', { class: 'ds-why rl-how', 'data-how-win': '', ...attrs }, h('b', {}, 'How you win. '), h('span', { 'data-v': 'story' }, t.story), h('span', { 'data-v': 'detail' }, t.detail)); };
