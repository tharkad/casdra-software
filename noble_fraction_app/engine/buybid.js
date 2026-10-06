import { handle, provide } from './registry.js';
import { activePlayer } from './helpers.js';
import { defineAbility } from './abilities.js';
import { bidOptions, placeToken, moveToken } from './bid.js';
import { buyOptions, performBuy } from './buy.js';
import { enterCleanup } from './cleanup.js';

const BID_PHASES = ['buybid', 'overtimeBid'];

export function enterBuyBid(s) {
    s.turn.phase = 'buybid';
    s.turn.f.step = { bids: 0, buys: 0 };
}

export function enterOvertimeBid(s) {
    s.turn.phase = 'overtimeBid';
    s.turn.f.stepsLeft = 2;
    s.turn.f.step = { bids: 0, buys: 0 };
}

const installedHas = (p, defId) => p.installed.some(c => c.defId === defId);
export const hasAgent = (s, p) => s.turn.f.agent || installedHas(p, 'floor_broker');
export const hasSalesExec = (s, p) => s.turn.f.multiBid || installedHas(p, 'account_manager');
export const hasBuyer = s => Boolean(s.turn.f.buyer);

// What one BUY-or-BID step still allows. Normally it is BUY *or* BID; Agent permits both.
// Overtime steps are BID only, unless Floor Broker adds the BUY. Account Manager lets one BID place/move
// three tokens; Buyer lets one BUY purchase three cards (rulebook p.7, p.13).
function allowance(s, p) {
    const { step } = s.turn.f;
    const agent = hasAgent(s, p);
    const overtime = s.turn.phase === 'overtimeBid';
    return {
        bidOk: step.bids < (hasSalesExec(s, p) ? 3 : 1) && (agent || step.buys === 0),
        buyOk: step.buys < (hasBuyer(s) ? 3 : 1) && (agent || (!overtime && step.bids === 0)),
    };
}

provide(s => {
    if (!BID_PHASES.includes(s.turn.phase)) return [];
    const p = activePlayer(s);
    const { step } = s.turn.f;
    const { bidOk, buyOk } = allowance(s, p);
    const acts = [...(bidOk ? bidOptions(s, p) : []), ...(buyOk ? buyOptions(s, p) : [])];
    // A step can always be ended: with nothing worth doing (all five Bid Tokens out, nothing affordable) the player
    // must be able to pass rather than be forced to move a token or buy something they do not want.
    acts.push({ type: 'endStep' });
    return acts;
});

handle('bid', (s, a) => {
    placeToken(s, activePlayer(s), a.uid);
    s.turn.f.step.bids += 1;
});
handle('bidMove', (s, a) => {
    moveToken(s, activePlayer(s), a.from, a.to);
    s.turn.f.step.bids += 1;
});
handle('buy', (s, a) => {
    performBuy(s, activePlayer(s), a);
    s.turn.f.step.buys += 1;
});

handle('endStep', s => {
    if (s.turn.phase === 'overtimeBid' && s.turn.f.stepsLeft > 1) {
        s.turn.f.stepsLeft -= 1;
        s.turn.f.step = { bids: 0, buys: 0 };
        return;
    }
    enterCleanup(s);
});

// Hand-played Floor Broker / Account Manager / Procurement Agent switch the matching allowance on for this turn.
const flag = (key, active) => ({
    installedUse: false,
    params: (s, p) => (active(s, p) ? [] : [{}]),
    run: s => { s.turn.f[key] = true; },
});
defineAbility('floor_broker', flag('agent', hasAgent));
defineAbility('multiBid', flag('multiBid', hasSalesExec));
defineAbility('procurement_agent', flag('buyer', hasBuyer));
