// Kernel p06 mayAttackHero: mayAttackHero(family, heroAdvantages)
// Rule: Characters: Heavenly Protection (Pilgrim); 8.3.
//
// Specification (the numbered steps the kernel was written from; the oracle is tools/kernels/specs/pilot.mjs, written from the rule text, not from this code):
// Whether a monster of a given family can attack the hero or be assigned to him in combat. Inputs: family, a string (the monster's family: 'Goblin', 'Dragon', 'Bat', 'Wolf', 'Serpent', 'Troll', 'Giant', 'Demon', 'Ghost', 'Ogre', 'Octopus' or 'Imp'); heroAdvantages, an array of strings: the keys of the hero's advantages (for example ['heavenly-protection', 'learning'], or []).
// Steps:
// 1. If heroAdvantages does not contain 'heavenly-protection', return true.
// 2. If it does, and family is 'Demon' or 'Imp', return false. (The Winged Demon and the Demon are both of family 'Demon'.)
// 3. Otherwise return true.
// Return a boolean. (This says nothing about the hero attacking them: he can always attack them.)
//
// Verified against the independent oracle on all 72 inputs of its domain (exhaustive), never throws, never mutates its arguments; tests/pilot_rules.test.mjs repeats that.
// Code: qwen2.5-coder:32b, attempt 1, 4.9 s, 65 generated tokens. Pure: no state, no dice. The engine's glue calls it; it does not read or write the game state.

export function mayAttackHero(family, heroAdvantages) {
    if (!heroAdvantages.includes('heavenly-protection')) {
        return true;
    }
    if (family === 'Demon' || family === 'Imp') {
        return false;
    }
    return true;
}
