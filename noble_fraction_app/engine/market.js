import { shuffle } from './helpers.js';

// Cards in each line. The designer's rule: 3 in a 2-player game (the printed rulebook says 4 in one place and 3 in another; the
// designer's instructional video settles it). Games started before the fix carry no `rules.lineSize` and stay at 4, so a saved
// game, a stored log or a human game in the training set still plays and replays exactly as it was played.
export const DEFAULT_LINE_SIZE = 3;
export const LEGACY_LINE_SIZE = 4;
export const lineSize = s => s.rules?.lineSize ?? LEGACY_LINE_SIZE;

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
    while (line.length < lineSize(s)) {
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
