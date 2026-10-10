import { CONTRACT_DECK, UPGRADE_DECK } from '../data/cards.js';
import { newCard, shuffle, drawCards, rnd } from './helpers.js';
import { refillLines, DEFAULT_LINE_SIZE } from './market.js';

export const STARTING_MONEY = 3;
export const BID_TOKENS = 5;

function startingSystem(s) {
    const packet = () => ['N', 'O', 'Kr', 'Xe'];
    const ids = ['intake_fan', 'return_loop', ...packet(), ...packet()];
    return shuffle(s, ids.map(id => newCard(s, id)));
}

function newPlayer(s, id) {
    const p = {
        id, draw: startingSystem(s), discard: [], hand: [], installed: [], pipelines: [],
        contract: null, storedXe: 0, completed: [], money: STARTING_MONEY,
        tokensLeft: BID_TOKENS, lastTurnOvertime: false,
    };
    drawCards(s, p, 5);
    return p;
}

// `mode`: 'normal' ends at 5 installed Upgrades or 5 completed Contracts, 'overtime' (the long game) at 10.
export const END_COUNTS = { normal: 5, overtime: 10 };

export function createGame({ seed = 1, startingPlayer, mode = 'normal', lineSize = DEFAULT_LINE_SIZE } = {}) {
    const s = {
        rng: seed >>> 0, uidCounter: 0, log: [], players: [], rules: { mode, endCount: END_COUNTS[mode] ?? 5, seed: seed >>> 0, lineSize },
        market: {
            contractDeck: [], contractDiscard: [], contractLine: [],
            upgradeDeck: [], upgradeDiscard: [], upgradeLine: [],
        },
        turn: { number: 1, active: 0, phase: 'start', overtime: false, f: {} },
        endgame: { triggeredBy: null, privilege: null, turnsLeft: [] },
    };
    s.market.contractDeck = shuffle(s, CONTRACT_DECK.map(id => newCard(s, id)));
    s.market.upgradeDeck = shuffle(s, UPGRADE_DECK.map(id => newCard(s, id)));
    refillLines(s);
    s.players = [newPlayer(s, 0), newPlayer(s, 1)];
    s.turn.active = startingPlayer ?? rnd(s, 2);
    return s;
}
