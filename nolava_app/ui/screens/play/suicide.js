// play/suicide.js: when a character may end his own adventure (rules 8.9.4, 9.2.2a: the engine's `suicide` action, accepted at the evening-end question and at the Birdsong plan), and the words of the dim answer.
// The confirm sheet is looks.js suicideSheet; the menu row is sheet_info.js; the quiet link on the evening sheet is kit/evening.js. Local solo games only.
import { ownSheet, questionOf } from '../../combat/feed.js';

export const SUICIDE_WHEN = ['evening-end', 'plan'];
export const suicideOk = G => !G.race && !G.shared && SUICIDE_WHEN.includes(questionOf(G.st, G.data)?.type) && (me => !me.leader && !me.dead && !me.flying)(ownSheet(G.st, G.data));
export const SUICIDE_NOT_NOW = 'You can end your adventure only in the evening, before Midnight, or in the morning while you plan.';
