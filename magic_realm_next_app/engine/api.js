// api.js: THE door of the rules engine (docs/engine-api/CONTRACT.md section 2). The UI and the server import this module and catalogue.js and nothing else of app/engine (tests/api_boundary_imports.test.mjs
// counts what still does). It is a thin facade over today's modules (setup.js, day.js, party.js, combat.js ...): no rule is written here. What goes in and out is plain JSON.
//   const api = createApi(rawData);              rawData: the 16 JSON tables of app/data (FILES); the engine never reads files (CONTRACT D12). Hosts: app/ui/dataload.js, server/engine.mjs
//   api.newGame(options)  api.addCharacter(state, options)       -> { state, events }
//   api.apply(state, action)                     -> { ok: true, state, events } | { ok: false, state (unchanged), events: [], error: { code, rule?, params? } }
//   api.check(state, viewer, action)             -> { ok, errors: [Reason], warnings: [Reason] }   a dry run: nothing changes
//   api.view(state, viewer)  api.legal(state, viewer)  api.history(state, viewer, since)
//   api.seat(state, id)                          -> state       the same game with `actor` (the seat the engine works for) moved to a seat of the same player; a value, nothing is written
//   api.restore(text)  api.hash(state)  api.data  api.version
// `viewer` is a character id (a seat) or null (a spectator). Nothing here mutates its arguments; the same state and action always give the same result (determinism, tests/api_boundary_determinism.test.mjs).
import { indexData, FILES } from './data.js';
import { newGame as engineNewGame, addCharacter as engineAddCharacter, checkVp } from './setup.js';
import { apply as engineApply, validatePlan, phasesFor, planKinds } from './day.js';
import { upgradeState, ownerOf, withActor } from './party.js';
import { clone, collect } from './core.js';
import { makeView } from './view.js';
import { legalFor } from './legal.js';
import { legalBoxPlan } from './combat.js';
import { whereOf } from './planning.js';
import * as HF from './hirefight.js';
import { sha256hex } from './sha256.js';

export { FILES, checkVp };          // (checkVp: a victory point spread is a legal one; a function of the spread alone)
/** The API's own version. `schema` is the version of docs/engine-api/schema/*.json; `state` the saved-state format (party.js STATE_VERSION). */
export const API_VERSION = { api: '0.1.0', schema: 1 };

const byApi = new WeakMap();          // an indexed `data` -> the api made over it

/** What a refused play looks like: { code, rule?, params }. An engine refusal is a thrown Error: one raised with `refuse(code, text, params, rule)` (core.js) has its code; any other is code 'refused'.
 * Until the voice layer writes the words, `params.text` carries the engine's sentence for both (CONTRACT section 7: the generic ones are counted and fall as sites get codes). */
const reasonOf = e => ({ code: e.code ?? 'refused', ...(e.rule ? { rule: e.rule } : {}), params: { ...(e.params ?? {}), text: String(e.message ?? e) } });
// A programming error is not a refusal: a refusal is a sentence thrown on purpose; these come from a bug (or an action that is not even an object).
const isBug = e => e instanceof TypeError || e instanceof RangeError || e instanceof ReferenceError || e instanceof SyntaxError;

const plain = o => JSON.parse(JSON.stringify(o));
/** A game made through the API records its events in the state (core.js `emit`): `events` starts as the list of the first call. */
const recording = (st, events, n) => { st.events = events.map(plain); st.eventSeq = n; return st; };

/** @param {Record<string, any>} raw the rules tables @param {{ art?: any, kinds?: any, engine?: string }} [extra] the optional art manifests, and the host's version string */
export function createApi(raw, extra = null) {
    return build(indexData(raw, extra), extra?.engine ?? null);
}
/** The api made over an already indexed `data` (a host that built it with `createApi(...).data`, or a test's `loadDataSync()`): the same object every time for the same data. */
export function apiOf(data, engine = null) {
    return byApi.get(data) ?? build(data, engine);
}

function build(data, engine) {
    const version = { ...API_VERSION, engine: engine ?? undefined };
    const api = {
        version: { ...API_VERSION, engine: engine ?? 'unknown', state: 2 },
        data,

        /** @returns {{ state: any, events: any[] }} */
        newGame(options = {}, { record = true } = {}) {
            const { out: state, events, n } = collect(() => engineNewGame(data, options));
            return { state: record ? recording(state, events, n) : state, events: events.map(plain) };          // (`record: false`: a game that does not keep its events, as a table's server still plays them)
        },
        /** Seat another character in a game whose first Birdsong is still open. */
        addCharacter(state, options = {}) {
            const st = clone(state);
            const { events } = collect(() => engineAddCharacter(st, data, options));
            return { state: st, events: events.map(plain) };
        },
        checkVp,

        apply(state, action) {
            if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new TypeError('an action is an object with a type');
            try {
                const { out: next, events } = collect(() => engineApply(state, data, action));
                return { ok: true, state: next, events: events.map(plain) };
            } catch (e) {
                if (isBug(e)) throw e;
                return { ok: false, state, events: [], error: reasonOf(e) };
            }
        },

        /** A dry run: would this action be accepted? (the screens' plan check; for a plan the engine's own warnings too). Never changes anything. */
        check(state, viewer, action) {
            const out = { ok: true, errors: [], warnings: [] };
            // What-if questions of the Melee step that are not "may I do this" (a screen asks them while the player is still building his play): `action.probe` names one and the answer is in the result.
            //   probe 'boxes'     the box plan of `action.boxes` made legal (8.4.5m: no box empty while another holds two): result.fixed = { boxes } when it had to change
            //   probe 'plan'      the Birdsong plan for `action.slots`: result.plan = { phases (how many phases and of what kind), kinds (the kind of each recorded phase and the errors), valid (validatePlan: the errors and the warnings), where (planning.js: `at`, `climbing`, `moves[i]` = { sure, maybe }, `leave[i]`, `refusals`) }
            //   probe 'sections'  the Melee Sections of hirelings (8.4.2e, 8.4.6d) for `action.hireTargets / hireSides / positions`: result.sections = { preview, error }
            if (action?.probe && viewer && state.chars?.[viewer]) {
                const st = clone(state);
                return withActor(st, viewer, () => {
                    if (action.probe === 'plan') { const slots = action.slots ?? []; out.plan = plain({ phases: phasesFor(st, data, slots), kinds: planKinds(st, data, slots), valid: validatePlan(st, data, slots), where: whereOf(st, data, slots) }); return out; }
                    if (!st.combat) return out;
                    if (action.probe === 'boxes') { const fixed = legalBoxPlan(st, data, action); if (JSON.stringify(fixed) !== JSON.stringify(action.boxes)) out.fixed = { boxes: plain(fixed) }; }
                    if (action.probe === 'sections') {
                        out.sections = { preview: HF.inRound(st) ? plain(HF.preview(st, data, { hireTargets: action.hireTargets, positions: action.positions })) : [], error: null };
                        try { HF.checkPlay(st, data, { hireTargets: action.hireTargets, hireSides: action.hireSides, positions: action.positions }); } catch (e) { out.sections.error = String(e.message ?? e); }
                    }
                    return out;
                });
            }
            if (action?.type === 'plan' && viewer && state.chars?.[viewer]) {
                const st = clone(state);
                try {
                    const r = withActor(st, viewer, () => validatePlan(st, data, action.slots ?? []));
                    out.warnings.push(...(r.warnings ?? []).map(w => ({ code: 'plan.warning', params: { i: w.i, text: w.text } })));
                } catch { /* the apply below says why */ }
            }
            const r = api.apply(state, viewer && action.who == null ? { ...action, who: viewer } : action);
            if (!r.ok) out.errors.push(r.error);
            out.ok = out.errors.length === 0;
            return out;
        },

        /** What `viewer` may know: the public table, his own sheet and knowledge, his question and his options (view.schema.json). */
        view(state, viewer = null) {
            return makeView(state, viewer, data, version);
        },
        /** The question the engine is asking `viewer` and every way to answer it (legal.schema.json). Built so far for the twelve combat questions (`covered: true`). */
        legal(state, viewer = null) {
            return JSON.parse(JSON.stringify(legalFor(state, viewer, data, pendingOf(state, viewer))));
        },

        /** The events `viewer` may read with `n` > `since` (EVENT-CODES.md "Who may read an event"); once the game is over every seat reads every event (VISIBILITY-RULINGS V11). */
        history(state, viewer = null, since = 0) {
            return historyOf(state, viewer, since);
        },

        /** The same game seen from another seat of the same player (a hot seat, a party with hired leaders): the engine's pointer at the character it is working for (`actor`) is moved to `id`.
         * A VALUE: the state given is not changed (it is returned as it is when `id` is already the actor, or no seat of the game). A screen asks this instead of writing `state.actor`; the game itself is the same one. */
        seat(state, id) {
            if (!id || !state?.chars?.[id] || state.actor === id) return state;
            const next = clone(state);
            next.actor = id;
            return next;
        },

        /** A saved state of ANY earlier version (JSON text) as a state of the current one. */
        restore(text, opts) {
            return restoreOf(text, opts);
        },
        /** The fingerprint of a state: any difference between two runs of the engine shows up as a different value. */
        hash(state) {
            return hashOf(state);
        },
    };
    byApi.set(data, api);
    return api;
}

/** A saved state of ANY earlier version (JSON text) as a state of the current one; needs no rules data. `record: false` leaves a game that keeps no events as it is (a table's server). */
export function restoreOf(text, { record = true } = {}) {
    const st = upgradeState(JSON.parse(text));
    if (record && !st.events && st.chars) { st.events = []; st.eventSeq = 0; }          // (a saved game from before the events records them from here on)
    return st;
}
/** The fingerprint of a state (what `api.hash` returns), for a host that has no api at hand. */
export const hashOf = state => sha256hex(JSON.stringify(state)).slice(0, 16);

/** A viewer's own question, as `view` shows it. */
const pendingOf = (state, viewer) => {
    const q = viewer && state.chars?.[viewer] ? state.asks.find(a => a.who === viewer)?.pending ?? null : null;
    return q ? { ...JSON.parse(JSON.stringify(q)), who: viewer } : null;
};

/** The events `viewer` may read with `n` > `since`, from a state alone (no rules data is needed): what `api.history` returns, and what the server sends a seat. */
export function historyOf(state, viewer = null, since = 0) {
    const mine = viewer && state.chars[viewer] ? new Set([viewer, ...state.order.filter(id => id !== viewer && state.chars[id].leader && ownerOf(state, id) === ownerOf(state, viewer))]) : new Set();
    const over = state.period === 'over';
    return (state.events ?? []).filter(e => e.n > since && (over || readable(e, mine, viewer !== null))).map(e => JSON.parse(JSON.stringify(e)));
}

// The characters an event names (its `vis: parties` readers).
const NAMES = ['who', 'to', 'from', 'a', 'b', 'of', 'hirer', 'guide', 'blocker', 'blocked'];
function readable(e, mine, seated) {
    if (e.vis === 'table') return true;
    if (!seated) return false;
    const named = NAMES.flatMap(k => [].concat(e[k] ?? [])), reader = id => mine.has(id);
    if (e.vis === 'seat') return reader(e.who);
    if (e.vis === 'parties') return named.some(reader);
    return named.some(reader) || (e.with ?? []).some(reader);          // clearing, fight: the one it is about, and who stood by when it was written
}
