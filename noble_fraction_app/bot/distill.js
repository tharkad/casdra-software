import { legalActions, apply } from '../engine/index.js';
import { CARD_DEFS } from '../data/cards.js';
import { me, distillValue, xeIn } from './eval.js';
import { installScore } from './market.js';

const cardDef = (s, uid) => {
    const p = me(s);
    return CARD_DEFS[(p.hand.find(c => c.uid === uid) ?? p.installed.find(c => c.uid === uid)).defId];
};
const count = (cards, id) => cards.filter(c => c.defId === id).length;

// How much do I want to take this action during DISTILL? (> 0 = do it, otherwise end the phase)
function gainOf(s, a, w, base) {
    const p = me(s);
    if (a.type === 'distill') return distillValue(apply(s, a), w) - base + 0.01;     // mandatory
    if (a.type === 'placeFreeBid') return 1;
    if (a.type === 'install') return installScore(s, a, w) - 1.2;                    // only the clearly good ones
    if (a.type !== 'play' && a.type !== 'useInstalled') return 0;
    const d = cardDef(s, a.uid);
    const topXe = p.draw.at(-1)?.defId === 'Xe';
    if (d.ability === 'peekDeck') return a.choice === 'draw' ? (topXe ? 1 : -1) : (topXe ? -2 : 1);
    if (d.ability === 'cashPerO') return 0.9 * count(p.hand, 'O');
    if (d.ability === 'bidPerN') return 0.7 * count(p.hand, 'N');
    if (d.ability === 'addXe') return 1;
    return distillValue(apply(s, a), w) - base;                                      // Return Loop, Molecular Sieve, Desiccant Bed, ...
}

// Greedy 1-ply over the DISTILL phase. The phase has no randomness, so the same routine can be
// run on a clone to forecast what a turn would isolate.
export function chooseDistill(s, actions, w) {
    const base = distillValue(s, w);
    let best = null;
    for (const a of actions) {
        if (a.type === 'endDistill') continue;
        const gain = gainOf(s, a, w, base);
        if (gain > 0.001 && (!best || gain > best.gain)) best = { a, gain };
    }
    if (best) return best.a;
    return actions.find(a => a.type === 'endDistill') ?? actions.find(a => a.type === 'distill') ?? actions[0];
}

export function forecastDistill(s, w) {
    const before = me(s);
    let t = s;
    for (let i = 0; i < 40 && t.turn.phase === 'distill'; i += 1) {
        t = apply(t, chooseDistill(t, legalActions(t), w));
    }
    return me(t).storedXe - before.storedXe + 4 * (me(t).completed.length - before.completed.length);
}

export function chooseStart(s, actions, w) {
    const normal = actions.find(a => !a.overtime);
    const overtime = actions.find(a => a.overtime);
    if (!overtime || xeIn(me(s).hand) === 0) return normal;
    const gainNormal = forecastDistill(apply(s, normal), w);
    const gainOvertime = forecastDistill(apply(s, overtime), w);
    return gainOvertime >= gainNormal + 1 ? overtime : normal;
}
