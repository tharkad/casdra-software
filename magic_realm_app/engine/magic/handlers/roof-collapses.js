import { isCave } from '../../world.js';

// Roof Collapses (IV / Purple / Attack): cast only in a cave clearing. It attacks every character, monster and native in the clearing, including the caster, like a
// striking weapon of length 18 and Heavy harm with no stars, always in the Smash direction at time 4, whatever chit cast it.
// Decisions (01-combat-spells.md section 5, Question 4): the attack is worked out in combat.js (`roofHits`): one hit for each creature (a native's horse defends its
// rider), his hirelings and himself, all one simultaneous group; a creature on his sheet avoids it only from outside the Smash box and not slower than 4, one that is
// not on the sheet is caught; he is hit unless he plays a Move chit in another direction with a time of 4 or less (a horse played as the maneuver absorbs it). Natives
// that are hit do not turn hostile and are not named, so a hidden hero stays hidden; kills pay him as kills; a hireling it strikes costs him the Notoriety of its
// bounty if it dies, and its whole group rebels and battles him (treachery, 8.4.2g, as in RealmSpeak). Pentangle and Protection from Magic do not stop it (it is
// aimed at the clearing); armor and horses count; Exorcise cancels it. Controlled monsters are not on the combat sheet and are not struck. The computer players never
// cast it (it kills its own caster), and it is not in ATTACK_SPELLS.
export default {
    id: 'roof-collapses', dur: 'attack', benevolent: false,
    attack: { harm: 'H', stars: 0, length: 18, hits: 1, missile: false, auto: 'all', dir: 2, time: 4 },
    legal: (st, data) => (isCave(st, data, st.ch.at) ? true : 'Roof Collapses can be cast only in a cave clearing.'),
    useful: () => false,
    start() { /* the blows themselves are worked out in the melee */ },
    ai: { role: 'attack' },
};
