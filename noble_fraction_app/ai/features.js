import { CARD_DEFS } from '../data/cards.js';
import { score } from '../engine/index.js';
import { quote } from '../engine/buy.js';
import { findCard } from '../ui/find.js';

// Turns a game position into numbers for the learned Rival. HARD RULE (tested): only what the acting player could see at the
// table goes in -- never the opponent's hand contents or any draw-pile ORDER. Own deck+discard are known as a *multiset* (the player
// knows which cards they own); the opponent contributes only their public tableau, face-up discard and card counts.

export const DEF_IDS = Object.keys(CARD_DEFS);                      // stable order = stable feature layout
const DEF_INDEX = Object.fromEntries(DEF_IDS.map((id, i) => [id, i]));
const N = DEF_IDS.length;
export const PHASES = ['start', 'distill', 'airwipe', 'buybid', 'overtimeBid', 'cleanup'];
export const ACTION_TYPES = ['beginTurn', 'distill', 'endDistill', 'air', 'wipe', 'ppeChoose', 'buy', 'install', 'bid', 'bidMove', 'placeFreeBid',
    'endStep', 'discard', 'finishTurn', 'choosePrivilege', 'play', 'useInstalled', 'completeContract', 'goOvertime'];

const bag = cards => { const v = new Array(N).fill(0); for (const c of cards) v[DEF_INDEX[c.defId]] += 1; return v; };
const scale = (v, k) => v.map(x => x / k);
const oneHot = (i, n) => Array.from({ length: n }, (_, k) => (k === i ? 1 : 0));

function playerBlock(s, p, mine) {
    const sc = score(s, p.id);
    const contract = p.contract ? CARD_DEFS[p.contract.defId] : null;
    const end = s.rules?.endCount ?? 5;
    return [
        p.money / 20, p.storedXe / 6, p.tokensLeft / 5, sc.total / 40, p.completed.length / 10, p.installed.length / 10, p.pipelines.length / 3,
        p.hand.length / 10, p.draw.length / 40, p.discard.length / 40,
        contract ? contract.xe / 5 : 0, contract ? contract.vp / 11 : 0, contract ? 1 : 0, contract && p.storedXe >= contract.xe ? 1 : 0,
        Math.max(p.completed.length, p.installed.length) / end,
        ...bag(p.installed), ...bag(p.pipelines), ...scale(bag(p.completed), 3),
    ];
}

// state features from the point of view of player `pid`. Version 2 = version 1 + the cards I know are in my discard pile and the full multiset the
// opponent owns beyond their table (hand + draw + discard -- a tracker at the table can always work this out from the public buys/purges, and
// the order/hand split stays hidden). Because v2 only APPENDS, a v1 net's weights embed exactly into a v2 net.
export function encodeState(s, pid, version = 1) {
    const base = encodeStateV1(s, pid);
    if (version < 2) return base;
    const q = s.players[1 - pid]; const p = s.players[pid];
    return Float32Array.from([...base, ...scale(bag(p.discard), 8), ...scale(bag([...q.hand, ...q.draw, ...q.discard]), 8)]);
}
function encodeStateV1(s, pid) {
    const p = s.players[pid]; const q = s.players[1 - pid];
    const f = s.turn.f ?? {};
    const myOwn = scale(bag([...p.draw, ...p.discard, ...p.hand]), 8);                  // every card I own (multiset), not its order
    const myHand = scale(bag(p.hand), 8);
    const oppSeen = scale(bag(q.discard), 8);                                          // the opponent's face-up discard pile
    const mkt = [...s.market.contractLine, ...s.market.upgradeLine];
    const bids = who => { const v = new Array(N).fill(0); for (const c of mkt) v[DEF_INDEX[c.defId]] += (c.bids?.[who] ?? 0); return scale(v, 3); };
    const sc = [score(s, pid).total, score(s, 1 - pid).total];
    return Float32Array.from([
        ...playerBlock(s, p, true), ...playerBlock(s, q, false), ...myOwn, ...myHand, ...oppSeen,
        ...scale(bag(mkt), 1), ...bids(pid), ...bids(1 - pid),
        s.market.contractDeck.length / 25, s.market.upgradeDeck.length / 25,
        s.turn.number / 60, (sc[0] - sc[1]) / 20, ...oneHot(PHASES.indexOf(s.turn.phase), PHASES.length), s.turn.overtime ? 1 : 0,
        (s.rules?.endCount ?? 5) / 10, s.turn.active === pid ? 1 : 0, s.endgame.triggeredBy === null ? 0 : 1,
        (f.distillsLeft ?? 0) / 2, (f.step?.bids ?? 0) / 3, (f.step?.buys ?? 0) / 3, (f.stepsLeft ?? 0) / 2, p.lastTurnOvertime ? 1 : 0,
    ]);
}
export const STATE_SIZE = encodeStateV1(({ players: [0, 1].map(id => ({ id, money: 0, storedXe: 0, tokensLeft: 5, completed: [], installed: [], pipelines: [], hand: [], draw: [], discard: [], contract: null })),
    market: { contractLine: [], upgradeLine: [], contractDeck: [], upgradeDeck: [] }, turn: { number: 1, phase: 'start', overtime: false, f: {}, active: 0 }, endgame: { triggeredBy: null }, rules: { endCount: 5 }, log: [] }), 0).length;
export const STATE_SIZE_V2 = STATE_SIZE + 2 * N;

// features of one legal action (what it is, which card it touches, what it costs)
export function encodeAction(s, a, pid) {
    const p = s.players[pid];
    const target = a.uid !== undefined ? findCard(s, a.uid)?.card : a.to !== undefined ? findCard(s, a.to)?.card : null;
    const second = a.discard !== undefined ? findCard(s, a.discard)?.card : a.install !== undefined && typeof a.install === 'number' ? findCard(s, a.install)?.card : a.from !== undefined ? findCard(s, a.from)?.card : null;
    let net = 0; let price = 0;
    if (a.type === 'buy' && target) { const q = quote(s, p, target, a.install); if (q) { net = q.delta / 10; price = q.price / 10; } }
    return Float32Array.from([
        ...oneHot(ACTION_TYPES.indexOf(a.type), ACTION_TYPES.length),
        ...(target ? oneHot(DEF_INDEX[target.defId], N) : new Array(N).fill(0)),
        ...(second ? oneHot(DEF_INDEX[second.defId], N) : new Array(N).fill(0)),
        a.install === true ? 1 : 0, a.overtime ? 1 : 0, a.feed ? 1 : 0, a.ppe ? 1 : 0, a.line === 'contract' ? 1 : 0, a.line === 'upgrade' ? 1 : 0,
        a.choice === 'draw' ? 1 : 0, a.side === 'plus3' ? 1 : 0, (a.uids?.length ?? 0) / 4, net, price,
        target ? (target.bids?.[pid] ?? 0) / 3 : 0, target ? Object.entries(target.bids ?? {}).filter(([k]) => Number(k) !== pid).reduce((x, [, n]) => x + n, 0) / 3 : 0,
    ]);
}
export const ACTION_SIZE = ACTION_TYPES.length + 2 * N + 13;
