// sides.js: the two (or three) faces of a monster's or a native's counter, in one place: which sides a piece has, which one a tap turns to, and the figures printed on a side, read from the data for THAT side
// (never the figures of the side up now). The piece card (play/piece_card.js), the company's hireling counters (kit/company.js) and the fight screen's foes all turn counters over through these.
// Pure: data in, words out (no DOM), so tests/monster_sides.test.mjs can walk every monster and native.
import { denStats } from '../engine/catalogue.js';

export const SIDE_WORD = { light: 'Light side', dark: 'Dark side', red: 'Red side' };

/** The sides a counter has, in the order a tap turns them: light, dark and (a Tremendous monster) red. A native has light and dark. */
export function sidesOf(def, kind) {
    if (!def) return ['light'];
    return ['light', def.dark ? 'dark' : null, kind === 'mon' && def.red ? 'red' : null].filter(Boolean);
}
/** The side a tap turns `now` to (the same side when there is only one). */
export function nextSide(def, kind, now) {
    const order = sidesOf(def, kind), i = order.indexOf(now);
    return order[(i < 0 ? 0 : i + 1) % order.length];
}
/** The figures printed on one side of a counter: { side, word, harm, atk, move, stars, length, attack, name } read from the data for that side. */
export function sideFigures(data, kind, id, side) {
    const s = denStats(data, { kind, id, side });
    return { side, word: SIDE_WORD[side], harm: s.harm, atk: s.atk, move: s.move, stars: s.stars ?? 0, length: s.length ?? 0, attack: s.attack, name: s.name };
}
/** What a counter turned over to `side` says of itself next to the side that is up now: { side, word, now, nowWord, figures } for the card's label and a screen reader. */
export function sideLabel(data, kind, id, side, now) {
    return { side, word: SIDE_WORD[side], now, nowWord: SIDE_WORD[now], current: side === now,
        say: side === now ? `${SIDE_WORD[side]}: the side up now.` : `${SIDE_WORD[side]}: the other side. The ${SIDE_WORD[now].toLowerCase()} is up now.`, figures: sideFigures(data, kind, id, side) };
}
