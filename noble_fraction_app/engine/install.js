import { handle, provide } from './registry.js';
import { activePlayer, def, logEvent, takeFrom } from './helpers.js';
import { completeIfAble } from './contracts.js';

const INSTALL_PHASES = ['distill', 'airwipe', 'buybid', 'overtimeBid', 'cleanup'];

// Installing from hand is a free action on your own turn, costs the printed difference, and is
// not a BUY (rulebook p.8, p.12). Pink cards never install; a design can be installed only once.
export function canInstall(p, card) {
    const d = def(card);
    if (d.kind !== 'upgrade' && d.kind !== 'starter') return false;
    return !d.pink && !p.installed.some(c => c.defId === card.defId);
}

export function installCard(s, p, card, cost) {
    p.money -= cost;
    p.installed.push(card);
    logEvent(s, { type: 'install', pid: p.id, card: card.defId, cost });
    completeIfAble(s, p);                  // an installed helper (Packed Tower) may make the open Contract finishable right now
}

provide(s => {
    if (!INSTALL_PHASES.includes(s.turn.phase)) return [];
    const p = activePlayer(s);
    return p.hand.filter(c => canInstall(p, c) && p.money >= def(c).installDiff)
        .map(c => ({ type: 'install', uid: c.uid }));
});

handle('install', (s, a) => {
    const p = activePlayer(s);
    const card = takeFrom(p.hand, a.uid);
    installCard(s, p, card, def(card).installDiff);
});
