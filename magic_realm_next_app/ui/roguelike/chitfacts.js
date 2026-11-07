// chitfacts.js: a character card's action chit in plain words (the chit-choice cards of the campaign): its kind, strength, time, and the effort stars.
// A chit is { type: 'fight' | 'move' | 'magic', strength: 'L'|'M'|'H'|'T'|null, time, effort, magicNumeral } (data/characters.json). Pure.
import { WEIGHT_WORDS } from '../../engine/catalogue.js';

const KIND = { fight: 'Fight', move: 'Move', magic: 'Magic' };
export const starWord = n => (n ? `${n} effort star${n === 1 ? '' : 's'}` : 'no effort star');
export function chitFacts(chit) {
    const kind = KIND[chit.type] ?? 'Fight', label = chit.type === 'magic' ? `${chit.magicNumeral ?? ''}${chit.time}` : `${chit.strength ?? ''}${chit.time}`;
    const strength = chit.type === 'magic' ? `Magic type ${chit.magicNumeral ?? ''}`.trim() : `${WEIGHT_WORDS[chit.strength] ?? chit.strength} strength`;
    return { kind, label, stars: chit.effort ?? 0, line: `${kind}, ${strength}, time ${chit.time}, ${starWord(chit.effort ?? 0)}`, type: chit.type };
}
