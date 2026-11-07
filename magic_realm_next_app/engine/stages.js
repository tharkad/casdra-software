// stages.js: the development stages of a character at the start of a game (rule 10.E.5.2 and 10.E.6 of the 3.1 book), pure and small.
// Each character card has four stages; he may BEGIN at an earlier stage than the fourth:
//   5.2    he gets the weapon, armor and spells of the stage he starts at, and the action chits of that stage and the ones below it (his other chits are removed from play).
//   5.2.1  Special Advantage 1 at the second (and third) stage, both at the fourth; none at the first.
//   5.2.2  his trading relationships at the third stage, and only if he starts there or higher; before that every native and visitor starts Neutral to him.
//   5.3    each stage below the fourth is one Victory Point fewer on his Victory Requirements, but never fewer than two (stageVp).
// Chits of a HIGHER stage that he earned one at a time (10.E.5.4 during a game, 10.E.6.3.1 between games) are `extraChits`: they are added to his three-a-stage, and 6.3.2 says that a first-stage
// hero with two extra chits is still a first-stage hero (no Advantage, no relationships, no gear of a higher stage come with a single chit).
// The option is OFF unless asked for (newGame's `startStage`): a game without it builds the hero exactly as before. Nothing in this file touches a state.
import { refuse } from './core.js';

export const MAX_STAGE = 4;

/** The id of a card's chit: the character and the chit's place (1-based) in his card's list (data/characters.json `chits`). It does not change with the stage he starts at. */
export const chitId = (character, n) => `${character}-${n}`;

/** The usual Victory Points of a game of `lastDay` days: a basic one plus one a week (3.3.6a, 10.E.2). */
export const normalVp = lastDay => Math.ceil(lastDay / 7) + 1;
/** Rule 5.3: the usual total, one fewer for each stage below the fourth, but at least two. */
export const stageVp = (lastDay, stage) => Math.max(2, normalVp(lastDay) - (MAX_STAGE - stage));

/** The chits of a card with their place on it: [{ n, id, chit }], in the card's order. */
export const cardChits = card => card.chits.map((chit, i) => ({ n: i + 1, id: chitId(card.id, i + 1), chit }));
/** The chits of one stage of a card (three of them): [{ n, id, chit }]. */
export const chitsOfStage = (card, stage) => cardChits(card).filter(x => x.chit.stage === stage);

/** Is this a start stage the engine accepts? 1 to 4, a whole number. */
export const stageOk = s => Number.isInteger(s) && s >= 1 && s <= MAX_STAGE;

/** Refuse a start stage or an extra chit that does not fit the card; returns the extra chit ids in the card's order. */
export function checkStage(card, startStage, extraChits = []) {
    if (!stageOk(startStage)) refuse('stage.start', `a character begins at stage 1 to ${MAX_STAGE}, not ${JSON.stringify(startStage)}`, { stage: startStage }, '10.E.5.2');
    if (!Array.isArray(extraChits)) refuse('stage.extra', 'extraChits is a list of chit ids', null, '10.E.5.4');
    const all = cardChits(card), seen = new Set();
    for (const id of extraChits) {
        const c = all.find(x => x.id === id);
        if (!c) refuse('stage.extra', `the ${card.name} has no chit "${id}"`, { chit: id }, '10.E.5.4');
        if (c.chit.stage <= startStage) refuse('stage.extra', `chit "${id}" is of stage ${c.chit.stage}: a hero who begins at stage ${startStage} has it already, so it is not an extra`, { chit: id, stage: startStage }, '10.E.6.3.1');
        if (seen.has(id)) refuse('stage.extra', `chit "${id}" is listed twice`, { chit: id }, '10.E.5.4');
        seen.add(id);
    }
    return all.filter(x => seen.has(x.id)).map(x => x.id);
}

/** The card of the hero who begins at `startStage` with `extraChits` (rule 5.2): the same card with only the chits, advantages, relationships and gear of that stage. Each chit carries its card place `n`
 * so that its id does not depend on the stage. Stage 4 without extras is the card itself. A function of the card alone. */
export function stageCard(card, startStage, extraChits = []) {
    const extra = checkStage(card, startStage, extraChits);
    if (startStage === MAX_STAGE) return card;
    const st = card.stages[startStage - 1], keep = new Set(extra);
    return {
        ...card,
        chits: cardChits(card).filter(x => x.chit.stage <= startStage || keep.has(x.id)).map(x => ({ ...x.chit, n: x.n })),
        advantages: startStage === 1 ? [] : startStage < MAX_STAGE ? card.advantages.filter(a => a.n === 1) : card.advantages,
        relationships: startStage >= 3 ? card.relationships : {},
        stage4: { weapons: st.weapons ?? [], armor: st.armor ?? [], spellsKnown: st.spellsKnown ?? 0, spellTypes: card.stage4.spellTypes ?? [] },
    };
}
