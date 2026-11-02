// play/partyplan.js: planning with a party on one phone (notes 86, Mike: "the character plans should be doable back and forth and only when all characters have legal turns logged should the start
// turn button appear"). Every character's plan is a DRAFT (G.ui.drafts holds the ones who are not on screen) until all of them are legal; then Start sends them to the engine in character
// order, all or nothing (actMany), which is exactly what planning one after another did: the engine is asked the same things in the same order. Nothing here knows a rule: a plan is "legal" when the
// plan tray says it is whole (plan.js planSnapshot) and the engine's dry run of the whole set is accepted.
import { h } from '../../dom.js';
import { btn } from '../../ds.js';
import { apiOf } from '../../../engine/api.js';
import { displayName } from '../../names.js';
import { leaderGame } from '../../leaders.js';
import { actMany } from './actions.js';
import { render } from './shell.js';
import { showToast } from './kit.js';
import { isHotSeat, switchTo } from './hotseat.js';
import { planSnapshot } from './plan.js';
import { charsOf, gameOf, questionOf, viewOf } from '../../combat/feed.js';

/** The seat on screen (the character the engine is speaking to). */
export const actorOf = G => viewOf(G.st, G.data).viewer.seat;

/** The party that is planning now, or null: one phone, no table, no hired leaders, and two or more of its characters are asked for a plan (or must first say who returns, a fallen seat's restart). */
export function partyPlan(G) {
    const st = G.st;
    if (!st || G.shared || G.race || leaderGame(st) || !isHotSeat(G)) return null;
    const kind = id => questionOf(st, G.data, id);          // (the question the engine is asking that seat: view.pending)
    const seats = gameOf(st, G.data).order.filter(id => ['plan', 'restart'].includes(kind(id)?.type));
    if (seats.length < 2 || !seats.some(id => kind(id).type === 'plan') || seats.some(id => kind(id).underlings?.length || kind(id).leader)) return null;          // (hired followers are given their guides with the plan: that stays one character at a time, plan.js startDay)
    return { seats, kind };
}

/** What the plan of one character is now: { whole, set, total, final, line, sentence, restart }. The one on screen is read live; the others as he left them (a draft cannot change while he is off screen). */
export function planOf(G, id, party = partyPlan(G)) {
    const q = party?.kind(id);
    if (q?.type === 'restart') return { whole: false, set: 0, total: null, final: null, line: null, sentence: null, restart: true };
    if (id === actorOf(G)) return q?.prophecy && !G.ui.draft ? { whole: true, set: 0, total: 0, final: [], line: null, sentence: 'He lives the day as it comes' } : planSnapshot(G);
    const kept = G.ui.drafts?.[id];
    return kept?.snap ?? (q?.prophecy ? { whole: true, set: 0, total: 0, final: [], line: null, sentence: 'He lives the day as it comes' } : { whole: false, set: 0, total: null, final: null, line: null, sentence: null });
}

const nameOf = (G, id) => displayName(charsOf(G.st, G.data)[id]?.name ?? id);

// The engine's own word on the whole set: the plans applied one after another to a copy of the game. Remembered while nothing it depends on has changed.
const dry = new WeakMap();          // (a game state is never changed in place by a screen: one answer per state and set of plans)
function dryRun(G, actions) {
    const key = JSON.stringify(actions);
    let m = dry.get(G.st); if (!m) dry.set(G.st, m = new Map());
    if (m.has(key)) return m.get(key);
    let next = G.st, error = null;
    for (const a of actions) { const r = apiOf(G.data).apply(next, a); if (!r.ok) { error = r.error.params?.text ?? 'The engine would not take these plans.'; break; } next = r.state; }
    m.set(key, error);
    return error;
}

const actionsOf = (G, party) => party.seats.map(id => ({ type: 'plan', slots: planOf(G, id, party).final ?? [], who: id }));

/** The ones whose plan is not legal yet, in character order. */
export const unfinished = (G, party = partyPlan(G)) => party.seats.filter(id => !planOf(G, id, party).whole);

/** Every character has a legal plan and the engine would take them all. */
export function allLegal(G, party = partyPlan(G)) {
    return !!party && !unfinished(G, party).length && !dryRun(G, actionsOf(G, party));
}

/** The place of the start button while somebody still has no plan: one quiet line that says who, and takes him to the next one. Null when everybody is ready (the caller keeps its Start button). */
export function stillToPlan(G, party) {
    const todo = unfinished(G, party);
    if (!todo.length) {
        const why = dryRun(G, actionsOf(G, party));
        if (!why) return null;
        return btn(`The plans cannot start yet: ${why}`, 'quiet', { 'data-act': 'party-wait', 'data-why': 'engine', onclick: () => showToast(G, why, true) });
    }
    const names = todo.map(id => nameOf(G, id)), list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    const other = todo.find(id => id !== actorOf(G));
    return btn(`Still to plan: ${list}`, 'quiet', { 'data-act': 'party-wait', 'data-todo': todo.join(','), 'aria-label': `Still to plan: ${list}.${other ? ` Go to ${nameOf(G, other)}.` : ''}`,
        onclick: () => { if (other) { switchTo(G, other); return; } showToast(G, 'Every phase of the plan needs an action.', true); } });
}

/** Start the day: all the plans, in character order, all or nothing. */
export function startParty(G) {
    const party = partyPlan(G);
    if (!party || !allLegal(G, party)) return;
    const actions = actionsOf(G, party), keep = { draft: G.ui.draft, drafts: G.ui.drafts, step: G.ui.planStep };
    G.ui.draft = null; G.ui.drafts = {}; G.ui.leaveMapAsk = null; G.ui.sheet = null; G.ui.planStep = 0; G.ui.peek = false; G.ui.sel = null; G.ui.pickMove = null; G.ui.pickFly = null; G.ui.planNote = null;
    if (!actMany(G, actions)) { G.ui.draft = keep.draft; G.ui.drafts = keep.drafts; G.ui.planStep = keep.step; G.ui.sheet = 'plan'; render(G); }
}

/** What a character's chip says under his name while the party plans: the phases he has locked in, or what is missing. Returns { line, whole, label }. */
export function chipPlan(G, id, party) {
    const p = planOf(G, id, party);
    if (p.restart) return { line: 'must choose who returns', whole: false, label: 'must choose who returns' };
    if (p.whole) return { line: p.line ?? 'lives the day as it comes', whole: true, label: p.sentence ? `plan: ${p.sentence}` : 'plan set' };
    if (!p.set) return { line: 'needs a plan', whole: false, label: 'needs a plan' };
    return { line: `${p.set} of ${p.total} phases set`, whole: false, label: `${p.set} of ${p.total} phases set` };
}

/** The chip's second line, as an element. */
export const chipLine = (G, id, party) => { const c = chipPlan(G, id, party); return h('small', { class: `pplan${c.whole ? ' set' : ''}`, 'data-plan': c.whole ? 'set' : 'todo', title: c.label }, c.line); };
