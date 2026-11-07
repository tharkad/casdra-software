// catalogue.js: the second module the UI and the server may import besides api.js (docs/engine-api/CONTRACT.md section 9, choice D5).
// Everything here is a pure lookup of DATA or a CONSTANT, never a function of a game state: the names of clearings and tiles, item names, prices, weights, hex geometry, art ids, the goal factors,
// the colours of magic. A name for an id is not a rule; putting one for every id in `view` would make the view huge, so the screens ask the catalogue. Nothing here reads st.ch, st.pending or
// any other part of a state, and nothing here changes. The functions are the engine's own (re-exported, not copied), so a screen and a rule can never disagree about a name.
// A function that needs a state (denSide, hireStats, the option functions ...) is NOT here: its answer is in `view` or `legal`.
export { tileName, nameOfClearing, tileOf, numOf, sameTile, pathEnds, pathSide } from './world.js';
export { defOf, nameOf, isWeaponCard, weightOf, priceOf, slotsOf, summaryOf, isOneUse, horseLevel } from './items.js';
export { LEVELS, WEIGHT_WORDS, lvl, letterOf, chitWord } from './core.js';
export { FACTORS, CATS, scoreFrom } from './score.js';
export { EDGES, opposite, neighbor, hexKey, worldEdge, localEdge, hexCenter, edgeDir, corners } from './hex.js';
export { layoutSide, chitSlotsFor } from './layout.js';
export { bookPic, isBookPic } from './artbook.js';
export { COLORS, TYPE_COLOR, COLOR_MEANING, dayColors, nextDayWith, isMagicDay } from './spells.js';
export { NO_EFFORT_LIMIT, BOOTS, GLOVES } from './modifiers.js';
export { chitLabel } from './day.js';
export { MAX_CHARACTERS, VP_CATS } from './setup.js';
export { MAX_STAGE, chitId, normalVp, stageVp, chitsOfStage, cardChits } from './stages.js';          // (the development stages of a character card, 10.E.5 / 10.E.6: functions of the card and the number of days alone)
export { chitCost, CHIT_COST_PER_STAGE } from './growth.js';          // (open scoring: what a chit costs a hero of a stage; a function of the stage alone)
export { MAX_SPELLS } from './runes.js';
export { whySentence } from './magic/why.js';
export { pairIds, facesOf, boxIds, boxDef, kindOf, otherFace, defOf as missionDefOf } from './missions.js';          // (the visitor, mission and campaign chits of the data: which pairs, faces and boxes there are, and what a face is)
export { isVisitorName, SPELL_PRICE } from './visitors.js';
export { ATTACK_SPELLS, castable } from './spells.js';          // (castable: a spell's data says whether the engine has it; a function of the spell definition alone)
export { generateRealm, tileById } from './mapbuild.js';          // (the realm a seed makes: a function of the seed alone)
export { EDGE } from './planning.js';          // the destination of a Move that leaves the map          // the words for a blocked spell's `whyCode` ({ code, params }): the one place they are built

import { denSide as engineDenSide, hireStats as engineHireStats, weaponSide } from './combat.js';

/** A weapon's side as the rules read it: `{ harm, stars, time, length, missile }` of `{ item, def }` (a weapon item and its data), alerted or not; `extraStars` adds sharpness. A function of the item and the data only. */
export { weaponSide };

/** The stats of a creature or hireling counter from the DATA alone: name, size, vulnerability, harm, attack and move times ... of `{ kind: 'mon'|'nat'|'hire', id, side?, tag? }`.
 * It knows nothing of spells in force or a transformed counter (those are in `view`: `den.stat` of a creature on a character's sheet); it is what a counter lying on the map shows.
 * @param {any} data @param {{ kind: string, id: string, side?: string, tag?: string|number, hireKind?: string }} den */
export function denStats(data, den, extra = {}) {          // (`extra.combat`: the fight a part belongs to, so a part's own side can be read)
    return engineDenSide({ chars: {}, fx: [], ...extra }, data, den);
}
/** What a hired native or monster fights with (the hire price list and the Melee Sections use it): see combat.js `hireStats`. */
export const hireFacts = (data, id, kind = 'nat', side = null) => engineHireStats(data, id, kind, null, side);
