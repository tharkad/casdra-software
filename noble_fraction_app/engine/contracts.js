import { def, logEvent, activePlayer } from './helpers.js';
import { settle, handle, provide } from './registry.js';
import { defineAbility } from './abilities.js';

const TOWER = 'packed_tower';
const OWN_TURN = ['distill', 'airwipe', 'buybid', 'overtimeBid', 'cleanup'];

// What finishing this player's open Contract costs, with no help.
export function xeNeeded(s, p) {
    return p.contract ? { cost: def(p.contract).xe } : null;
}

// Packed Tower is an ability the player USES (installed once per turn, or played from hand), like every
// other card: finish the open Contract with one fewer Xe (never below 1). This says whether that is on
// offer right now -- there must be a Contract, enough Xe for the discounted cost, and a Packed Tower ready.
// Returns the discounted cost, or null.
export function towerOffer(s, p) {
    if (!p.contract || s.turn.active !== p.id || !OWN_TURN.includes(s.turn.phase)) return null;
    const base = def(p.contract).xe;
    if (base <= 1 || p.storedXe < base - 1) return null;
    const ready = p.installed.some(c => c.defId === TOWER && !s.turn.f.usedInstalled?.[c.uid]) || p.hand.some(c => c.defId === TOWER);
    return ready ? { cost: base - 1 } : null;
}

function finish(s, p, cost, discounted) {
    const card = p.contract;
    p.storedXe -= cost;
    p.money += def(card).money;
    p.completed.push(card);
    p.contract = null;
    logEvent(s, { type: 'contractCompleted', pid: p.id, contract: card.defId, money: def(card).money, xe: cost, discounted, xeLeft: p.storedXe });
}

// Rulebook p.8: when enough Xe is stored the contract completes immediately -- the Xe goes back to the
// supply, the $ reward is paid and the card flips over (its VP scores at game end). The one exception is
// when the player could save an Xe with a ready Packed Tower: then they are asked (Use / Complete) instead
// of the game choosing for them. `force` skips that wait (the end of the game).
export function completeIfAble(s, p, { force = false } = {}) {
    if (!p.contract || p.storedXe < def(p.contract).xe) return false;
    if (!force && towerOffer(s, p)) return false;
    finish(s, p, def(p.contract).xe, false);
    return true;
}

// Rather than remember to check at every place that can make a Contract finishable (isolating Xe, buying
// a Contract, a new turn...), the engine checks after every action.
settle(s => {
    if (!OWN_TURN.includes(s.turn.phase)) return;
    completeIfAble(s, activePlayer(s));
});

defineAbility('lessXe', {
    installedUse: true,
    phases: OWN_TURN,                                      // also while a finishable Contract is waiting in cleanup
    params: (s, p) => (towerOffer(s, p) ? [{}] : []),
    run: (s, p) => finish(s, p, def(p.contract).xe - 1, true),
});

// Declining the discount: finish at full price (only offered while Packed Tower could have been used).
provide(s => {
    if (!OWN_TURN.includes(s.turn.phase)) return [];
    const p = activePlayer(s);
    return p.contract && towerOffer(s, p) && p.storedXe >= def(p.contract).xe ? [{ type: 'completeContract' }] : [];
});
handle('completeContract', s => {
    const p = activePlayer(s);
    finish(s, p, def(p.contract).xe, false);
});
