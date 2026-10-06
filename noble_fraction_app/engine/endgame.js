import { handle } from './registry.js';
import { activePlayer, logEvent, other } from './helpers.js';

// Game end (rulebook p.10-11): 5 installed Upgrades or 5 completed Contracts (10 in the long 'overtime' mode, s.rules.endCount), checked when the
// player is ready to finish the turn. The trigger player takes the Xenon Privilege Token and
// picks a side before End of Turn; every other player then gets exactly one final turn.
export const endCount = s => s.rules?.endCount ?? 5;
export const needsPrivilege = (s, p) =>
    s.endgame.triggeredBy === null && (p.installed.length >= endCount(s) || p.completed.length >= endCount(s));

export const privilegeActions = () => [
    { type: 'choosePrivilege', side: 'plus3' },
    { type: 'choosePrivilege', side: 'finalTurn' },
];

handle('choosePrivilege', (s, a) => {
    const p = activePlayer(s);
    s.endgame.triggeredBy = p.id;
    s.endgame.privilege = a.side;
    // +3 side: this is the trigger player's last turn. Final Turn side: one more after the others.
    s.endgame.turnsLeft = [other(p.id), ...(a.side === 'finalTurn' ? [p.id] : [])];
    logEvent(s, { type: 'gameEndTriggered', pid: p.id, side: a.side });
});
