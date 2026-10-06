import { handle, provide } from './registry.js';
import { activePlayer, logEvent } from './helpers.js';
import { completeIfAble } from './contracts.js';

export function freshTurnFlags(overtime) {
    return {
        distillsLeft: overtime ? 2 : 1,
        removed: { N: 0, O: 0, Kr: 0 },     // elements removed during this DISTILL phase (A5)
        armedCash: 0, armedBidTokens: 0,      // hand-played copies armed for this phase
        usedInstalled: {},                  // uid -> true once an installed once-per-turn ability fired
        freeBids: 0,                        // Cryo Chiller tokens still to place
        wipedOrAired: false,
        buys: 0, maxBuys: 1, bidActions: 0, bidSteps: 0, tokensLeft: 0, agent: false,
    };
}

provide(s => {
    if (s.turn.phase !== 'start') return [];
    const acts = [{ type: 'beginTurn', overtime: false }];
    if (!activePlayer(s).lastTurnOvertime) acts.push({ type: 'beginTurn', overtime: true });
    return acts;
});

handle('beginTurn', (s, a) => {
    const p = activePlayer(s);
    s.turn.overtime = a.overtime;
    s.turn.phase = 'distill';
    s.turn.f = freshTurnFlags(a.overtime);
    p.lastTurnOvertime = a.overtime;
    logEvent(s, { type: 'turnStart', overtime: a.overtime });
});

// Hands the turn on. Once the game end is triggered, only the queued final turns are played.
export function advanceTurn(s) {
    s.turn.number += 1;
    s.turn.overtime = false;
    s.turn.f = {};
    if (s.endgame.triggeredBy === null) {
        s.turn.active = 1 - s.turn.active;
        s.turn.phase = 'start';
    } else if (s.endgame.turnsLeft.length === 0) {
        s.turn.phase = 'over';
        // A Contract still waiting for its Packed Tower decision is finished at full price: nothing is left to decide.
        s.players.forEach(p => completeIfAble(s, p, { force: true }));
    } else {
        s.turn.active = s.endgame.turnsLeft.shift();
        s.turn.phase = 'start';
    }
}
