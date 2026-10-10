import { createGame, legalActions, apply, score, winner } from '../engine/index.js';
import { policyFor, DEFAULT_LEVEL } from '../bot/levels.js';

export const HUMAN = 0;
export const RIVAL = 1;
const SAVE_KEY = 'noble-fraction.save.v1';

// Owns the one game state. The human acts through dispatch(). The Rival's turn can be played two
// ways: all at once (autoRival, used by tests and by "animations off") or one bot action at a time
// with stepRival(), which the UI uses to let the player watch it happen. No DOM in here, so it runs
// (and is tested) in Node.
export function createController({ storage = null, onChange = () => {}, autoRival = true } = {}) {
    let state = null;
    let recap = null;
    let level = DEFAULT_LEVEL;
    let auto = autoRival;
    let rivalFrom = null;                  // log index where the Rival's current turn started
    let extra = {};                        // small per-game scratch the UI keeps with the save (e.g. stats tracking)
    let moves = [];                        // every action applied this game, [seat, action], so the whole game can be replayed from its seed
    let start = null;                      // who moved first
    let startArg = null;                   // the startingPlayer newGame was ASKED for (null = drawn from the seed); replay must ask the same way, because drawing consumes rng
    let replayable = true;                 // false for a game resumed from a save made before moves were recorded

    const rivalToMove = () => state.turn.phase !== 'over' && state.turn.active === RIVAL;

    // One bot action. Returns the events it produced and whether the Rival's turn is now over.
    function stepRival() {
        if (!rivalToMove()) return { action: null, events: [], done: true };
        if (rivalFrom === null) rivalFrom = state.log.length;
        const before = state.log.length;
        const action = policyFor(level)(state, legalActions(state));
        moves.push([state.turn.active, action]);
        state = apply(state, action);
        const done = !rivalToMove();
        if (done) {
            recap = { events: state.log.slice(rivalFrom), turnNo: state.turn.number };
            rivalFrom = null;
        }
        persist();
        onChange();
        return { action, events: state.log.slice(before), done };
    }

    function playRivalToEnd() {
        const from = state.log.length;
        let step;
        do { step = stepRival(); } while (!step.done);
        return state.log.slice(from);
    }

    function persist() {
        if (!storage) return;
        try { storage.setItem(SAVE_KEY, JSON.stringify({ state, recap, level, extra, moves, start, startArg, replayable })); } catch { /* storage full or blocked */ }
    }

    function finishMove() {
        persist();
        onChange();
    }

    return {
        newGame({ seed, startingPlayer, difficulty = DEFAULT_LEVEL, mode = 'normal' } = {}) {
            level = difficulty;
            state = createGame({ seed: seed ?? crypto.getRandomValues(new Uint32Array(1))[0], startingPlayer, mode });
            recap = null;
            rivalFrom = null;
            extra = {};
            moves = []; replayable = true; start = state.turn.active; startArg = startingPlayer ?? null;
            if (auto && rivalToMove()) playRivalToEnd();
            else finishMove();
        },
        load() {
            try {
                const saved = JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null');
                if (!saved?.state) return false;
                ({ state, recap } = saved);
                level = saved.level ?? DEFAULT_LEVEL;
                extra = saved.extra ?? {};
                moves = saved.moves ?? []; start = saved.start ?? null; startArg = saved.startArg ?? null; replayable = Boolean(saved.moves) && saved.replayable !== false;
                rivalFrom = null;
                onChange();
                return true;
            } catch { return false; }
        },
        hasSave: () => { try { return Boolean(storage?.getItem(SAVE_KEY)); } catch { return false; } },
        // A saved game that is still in progress (a finished one is not worth continuing).
        savedGame() {
            try {
                const saved = JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null');
                return saved?.state && saved.state.turn.phase !== 'over'
                    ? { turn: saved.state.turn.number, level: saved.level ?? DEFAULT_LEVEL, mode: saved.state.rules?.mode ?? 'normal' } : null;
            } catch { return null; }
        },
        clearSave: () => { try { storage?.removeItem(SAVE_KEY); } catch { /* ignore */ } },
        dispatch(action) {
            moves.push([state.turn.active, action]);
            state = apply(state, action);
            if (auto && rivalToMove()) playRivalToEnd();
            else { if (!rivalToMove()) recap = null; finishMove(); }
        },
        stepRival, playRivalToEnd, rivalToMove: () => (state ? rivalToMove() : false),
        setAutoRival(on) { auto = on; },
        dismissRecap() { recap = null; onChange(); },
        extra: () => extra,
        setExtra(patch) { extra = { ...extra, ...patch }; persist(); },
        level: () => level,
        // Everything needed to replay this game exactly: the engine is deterministic given the seed, who started, the length and the actions.
        record: () => ({ seed: state.rules.seed, mode: state.rules.mode, lineSize: state.rules.lineSize ?? 4, level, start, startArg, replayable, moves }),
        mode: () => state?.rules?.mode ?? 'normal',
        state: () => state,
        legal: () => (state.turn.phase === 'over' ? [] : legalActions(state)),
        recap: () => recap,
        score: pid => score(state, pid),
        winner: () => winner(state),
    };
}
