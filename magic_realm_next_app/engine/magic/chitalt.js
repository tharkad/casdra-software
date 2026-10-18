import { breakFx } from './fx.js';

// Spells that change a Magic chit's Type (rule 4.6.10c: Elemental Spirit; later Witch's Brew, Faerie Lights, Unleash Power). The chit's own `numeral` is rewritten, so
// every rule that reads it (casting, enchanting, Reading Runes) sees the new Type without change; the spells that changed it are kept on the chit:
//   chit.baseNumeral   the printed Type          chit.alts   [{ fx, numeral }] oldest first
// The Type in force is the newest alteration still alive; when one ends the chit shows the one before it (or the printed Type).
export function alterChit(chit, fxId, numeral) {
    chit.baseNumeral ??= chit.numeral;
    (chit.alts ??= []).push({ fx: fxId, numeral });
    chit.numeral = numeral;
}

// The alteration made by `fxId` ends. A chit that was enchanted into a colour chit meanwhile tires instead of coming back (RS ChitChangeEffect:21-26), and a spell
// that was cast with the altered chit ends with it (RS :27-29).
export function unalterChit(st, data, chit, fxId) {
    if (!chit.alts?.some(a => a.fx === fxId)) return;
    const was = chit.numeral;
    chit.alts = chit.alts.filter(a => a.fx !== fxId);
    chit.numeral = chit.alts.at(-1)?.numeral ?? chit.baseNumeral ?? chit.numeral;
    if (!chit.alts.length) { delete chit.alts; delete chit.baseNumeral; }
    if (chit.numeral === was) return;
    if (chit.state === 'enchanted') chit.state = 'fatigued';
    if (chit.state === 'committed' && chit.tie) breakFx(st, data, chit.tie, 'the chit that cast it changed back');
}
