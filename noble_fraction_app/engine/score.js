import { def } from './helpers.js';
import { tokensOn } from './bid.js';

const count = (p, defId) => p.installed.filter(c => c.defId === defId).length;
const PIPELINE_VP = [0, 1, 4, 9];          // 1 / 2 / 3 Pipelines owned -> 1 / 4 / 9 VP in total

// Rulebook p.11 scoring. Unfinished Contracts score nothing. Stored Xe is not "in the System" for
// the tiebreak (A3).
export function score(s, pid) {
    const p = s.players[pid];
    const contractsOnLine = s.market.contractLine.filter(c => def(c).kind === 'contract');
    const parts = {
        contracts: p.completed.reduce((sum, c) => sum + def(c).vp, 0),
        upgrades: p.installed.length,
        pipelines: PIPELINE_VP[p.pipelines.length] ?? 0,
        money: Math.floor(p.money / (count(p, 'reserve_fund') > 0 ? 2 : 5)),
        bonuses: 3 * count(p, 'spotless_audit')
            + p.completed.length * count(p, 'sales_director')
            + contractsOnLine.reduce((sum, c) => sum + tokensOn(c, pid), 0) * count(p, 'deal_maker'),
        privilege: s.endgame.privilege === 'plus3' && s.endgame.triggeredBy === pid ? 3 : 0,
    };
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    const xeInSystem = [...p.draw, ...p.discard, ...p.hand].filter(c => c.defId === 'Xe').length;
    return { total, parts, xeInSystem };
}

// Highest total wins; a tie goes to the player with the least Xe left in their System; otherwise shared.
export function winner(s) {
    if (s.turn.phase !== 'over') return null;
    const scores = s.players.map(p => score(s, p.id));
    const [a, b] = scores;
    let winnerId = null;
    if (a.total !== b.total) winnerId = a.total > b.total ? 0 : 1;
    else if (a.xeInSystem !== b.xeInSystem) winnerId = a.xeInSystem < b.xeInSystem ? 0 : 1;
    return { winnerId, tie: winnerId === null, scores };
}
