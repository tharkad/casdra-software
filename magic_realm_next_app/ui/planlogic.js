import { nameOfClearing, EDGE } from '../engine/catalogue.js';
import { planInfo } from './combat/feed.js';

// What the plan builder may offer, as pure functions of the game and the draft slots (no DOM), so tests can hold them to the rules (docs/audit/rules-eval/02).
// The rules themselves are the engine's (app/engine/planning.js); a screen asks them through the API (`check`, probe 'plan': feed.js planInfo) and this file only finds the answer.
export { EDGE };
const whereOf = (st, data, slots) => planInfo(st, data, slots).where;

// Where he starts each phase, as planned, and the mountain he is half way up at that moment (null when none) ({ at, climbing }).
export const planState = (st, data, slots) => { const { at, climbing } = whereOf(st, data, slots); return { at, climbing }; };
// Leaving the map (ruling M4, 7.3.1a.4, 9.2.2b): the plan may hold `{ act: 'move', to: 'Edge' }`.
export const isEdgeMove = s => s?.act === 'move' && s.to === EDGE;
export const edgeIndex = slots => slots.findIndex(isEdgeMove);
export const destName = id => (id === EDGE ? 'the edge of the map' : nameOfClearing(id));
export const canLeaveAt = (st, data, slots, i) => whereOf(st, data, slots).leave[i];
export const planLocations = (st, data, slots) => whereOf(st, data, slots).at;
// The clearings phase `i` may be given as a Move destination: { sure, maybe } (see planning.js).
export const moveOptions = (st, data, slots, i) => whereOf(st, data, slots).moves[i];
// Why this activity cannot be recorded now (null when it can).
export const actRefusal = (st, data, act) => (act === 'nothing' ? null : whereOf(st, data, []).refusals[act] ?? null);
