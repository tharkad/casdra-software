import { def, logEvent } from './helpers.js';

// Cost in Xe to finish this player's contract right now. Packed Tower (installed)
// takes one off once per turn, never below 1 Xe (A4: applied automatically, always beneficial).
export function xeNeeded(s, p) {
    if (!p.contract) return null;
    const base = def(p.contract).xe;
    const canDiscount = s.turn.active === p.id && !s.turn.f.spcUsed && base > 1
        && p.installed.some(c => c.defId === 'packed_tower');
    return { cost: canDiscount ? base - 1 : base, discounted: canDiscount };
}

// Rulebook p.8: when enough Xe is stored the contract completes immediately -- the Xe goes back
// to the supply, the $ reward is paid and the card flips over (its VP scores at game end).
export function completeIfAble(s, p) {
    const need = xeNeeded(s, p);
    if (!need || p.storedXe < need.cost) return false;
    const card = p.contract;
    p.storedXe -= need.cost;
    if (need.discounted) s.turn.f.spcUsed = true;
    p.money += def(card).money;
    p.completed.push(card);
    p.contract = null;
    logEvent(s, { type: 'contractCompleted', pid: p.id, contract: card.defId, money: def(card).money });
    return true;
}
