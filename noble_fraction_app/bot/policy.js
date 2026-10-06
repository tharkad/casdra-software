import { DISTILL_PRIORITY, CARD_DEFS } from '../data/cards.js';
import { score } from '../engine/index.js';
import { DEFAULT_WEIGHTS } from './weights.js';
import { me, foe } from './eval.js';
import { chooseStart, chooseDistill } from './distill.js';
import { chooseBuyBid, bestTarget, installScore } from './market.js';

// AIR gives money and Xe but adds N/O/Kr junk to the System; WIPE finds better cards. Take AIR
// while poor; WIPE a line when it is flush and the market has nothing worth buying.
function chooseAirWipe(s, actions, w) {
    const p = me(s);
    const target = bestTarget(s, w);
    const air = actions.filter(a => a.type === 'air');
    const plainAir = air.find(a => !a.feed);
    const feedAir = air.find(a => a.feed);
    const need = target ? Math.max(0, target.cost - p.money) : 0;
    if (feedAir && need > 2 && need <= 4) return feedAir;
    if (p.money >= w.wipeMinMoney && (!target || target.v < w.wipeBelowValue)) {
        const wipe = actions.filter(a => a.type === 'wipe' && !a.ppe);
        if (wipe.length) return wipe[0];
    }
    return plainAir ?? air[0] ?? actions[0];
}

// Keep Xe and Upgrades worth playing; throw junk elements back so the next draw is fresh.
function chooseCleanup(s, actions, w) {
    const p = me(s);
    const privilege = actions.filter(a => a.type === 'choosePrivilege');
    if (privilege.length) {
        const mine = score(s, p.id).total;
        const theirs = score(s, foe(s).id).total;
        return privilege.find(a => a.side === (mine + 3 > theirs ? 'plus3' : 'finalTurn'));
    }
    const installs = actions.filter(a => a.type === 'install').map(a => ({ a, v: installScore(s, a, w) })).sort((x, y) => y.v - x.v);
    if (installs[0] && installs[0].v > w.buyThreshold) return installs[0].a;
    const junkCard = p.hand.find(c => DISTILL_PRIORITY.includes(c.defId));
    if (junkCard) return actions.find(a => a.type === 'discard' && a.uid === junkCard.uid);
    return actions.find(a => a.type === 'finishTurn');
}

// Packed Tower is a button here, like every other card: whenever it can finish the Contract it saves an Xe,
// so the bot always presses it. (Finishing at full price, `completeContract`, is never better.)
function towerUse(state, actions) {
    const p = me(state);
    return actions.find(a => (a.type === 'play' || a.type === 'useInstalled')
        && CARD_DEFS[[...p.hand, ...p.installed].find(c => c.uid === a.uid)?.defId]?.ability === 'lessXe');
}

export function chooseAction(state, actions, w = DEFAULT_WEIGHTS) {
    if (actions.length === 1) return actions[0];
    const tower = towerUse(state, actions);
    if (tower) return tower;
    switch (state.turn.phase) {
        case 'start': return chooseStart(state, actions, w);
        case 'distill': return chooseDistill(state, actions, w);
        case 'airwipe': return actions[0].type === 'ppeChoose' ? actions[0] : chooseAirWipe(state, actions, w);
        case 'buybid':
        case 'overtimeBid': return chooseBuyBid(state, actions, w);
        case 'cleanup': return chooseCleanup(state, actions, w);
        default: return actions[0];
    }
}
