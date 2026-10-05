import { handle, provide } from './registry.js';
import { activePlayer, drawCards, handSize, shuffle, takeFrom } from './helpers.js';
import { refillLines } from './market.js';
import { advanceTurn } from './turn.js';
import { needsPrivilege, privilegeActions } from './endgame.js';
import { completeIfAble } from './contracts.js';

// End of turn (rulebook p.10): restock both lines, discard whatever hand cards you choose (you may
// keep the rest), then draw back up to hand size. Overtime reshuffles System + discard first.
export function enterCleanup(s) {
    completeIfAble(s, activePlayer(s));    // before the game-end check below can run
    refillLines(s);
    s.turn.phase = 'cleanup';
}

provide(s => {
    if (s.turn.phase !== 'cleanup') return [];
    const p = activePlayer(s);
    const discards = p.hand.map(c => ({ type: 'discard', uid: c.uid }));
    return [...discards, ...(needsPrivilege(s, p) ? privilegeActions() : [{ type: 'finishTurn' }])];
});

handle('discard', (s, a) => {
    const p = activePlayer(s);
    p.discard.push(takeFrom(p.hand, a.uid));
});

handle('finishTurn', s => {
    const p = activePlayer(s);
    completeIfAble(s, p);                  // never leave a finishable Contract sitting at the end of the turn
    if (s.turn.overtime) {
        p.draw = shuffle(s, [...p.draw, ...p.discard.splice(0)]);
    }
    drawCards(s, p, Math.max(0, handSize(p) - p.hand.length));
    advanceTurn(s);
});
