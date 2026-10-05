import { shuffle } from './helpers.js';

export const LINE_SIZE = 4;

const LINES = {
    contract: { line: 'contractLine', deck: 'contractDeck', discard: 'contractDiscard' },
    upgrade: { line: 'upgradeLine', deck: 'upgradeDeck', discard: 'upgradeDiscard' },
};
export const lineNames = Object.keys(LINES);

// Draws one card for a line, reshuffling that deck's own discard pile when it runs dry (A2).
export function drawForLine(s, kind) {
    const { deck, discard } = LINES[kind];
    const m = s.market;
    if (m[deck].length === 0) {
        if (m[discard].length === 0) return null;
        m[deck] = shuffle(s, m[discard].splice(0));
    }
    const card = m[deck].pop();
    card.bids = {};
    return card;
}

export function refillLine(s, kind) {
    const line = s.market[LINES[kind].line];
    while (line.length < LINE_SIZE) {
        const card = drawForLine(s, kind);
        if (card === null) break;
        line.push(card);
    }
}

export function refillLines(s) {
    lineNames.forEach(kind => refillLine(s, kind));
}

export const lineOf = (s, kind) => s.market[LINES[kind].line];
export const discardOf = (s, kind) => s.market[LINES[kind].discard];

// Finds a card by uid in either line: { kind, card, index } or null.
export function findInLines(s, uid) {
    for (const kind of lineNames) {
        const index = lineOf(s, kind).findIndex(c => c.uid === uid);
        if (index !== -1) return { kind, index, card: lineOf(s, kind)[index] };
    }
    return null;
}
