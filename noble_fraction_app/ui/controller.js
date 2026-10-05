import { createGame, legalActions, apply, score, winner } from '../engine/index.js';
import { policyFor, DEFAULT_LEVEL } from '../bot/levels.js';

export const HUMAN = 0;
export const RIVAL = 1;
const SAVE_KEY = 'noble-fraction.save.v1';

// Owns the one game state. The human acts through dispatch(); whenever the turn passes to the
// Rival the controller plays the Rival's whole turn with the bot and keeps what happened as a
// recap for the UI. No DOM in here, so it runs (and is tested) in Node.
export function createController({ storage = null, onChange = () => {} } = {}) {
    let state = null;
    let recap = null;
    let level = DEFAULT_LEVEL;

    function runRival() {
        const from = state.log.length;
        const choose = policyFor(level);
        while (state.turn.phase !== 'over' && state.turn.active === RIVAL) {
            const legal = legalActions(state);
            state = apply(state, choose(state, legal));
        }
        recap = { events: state.log.slice(from), turnNo: state.turn.number };
    }

    function persist() {
        if (!storage) return;
        try { storage.setItem(SAVE_KEY, JSON.stringify({ state, recap, level })); } catch { /* storage full or blocked */ }
    }

    function finishMove() {
        persist();
        onChange();
    }

    return {
        newGame({ seed, startingPlayer, difficulty = DEFAULT_LEVEL } = {}) {
            level = difficulty;
            state = createGame({ seed: seed ?? crypto.getRandomValues(new Uint32Array(1))[0], startingPlayer });
            recap = null;
            if (state.turn.active === RIVAL) runRival();
            finishMove();
        },
        load() {
            try {
                const saved = JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null');
                if (!saved?.state) return false;
                ({ state, recap } = saved);
                level = saved.level ?? DEFAULT_LEVEL;
                onChange();
                return true;
            } catch { return false; }
        },
        hasSave: () => { try { return Boolean(storage?.getItem(SAVE_KEY)); } catch { return false; } },
        clearSave: () => { try { storage?.removeItem(SAVE_KEY); } catch { /* ignore */ } },
        dispatch(action) {
            state = apply(state, action);
            if (state.turn.phase !== 'over' && state.turn.active === RIVAL) runRival();
            else recap = null;
            finishMove();
        },
        dismissRecap() { recap = null; onChange(); },
        level: () => level,
        state: () => state,
        legal: () => (state.turn.phase === 'over' ? [] : legalActions(state)),
        recap: () => recap,
        score: pid => score(state, pid),
        winner: () => winner(state),
    };
}
