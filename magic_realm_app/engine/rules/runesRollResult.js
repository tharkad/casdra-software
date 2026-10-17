// Kernel p05 runesRollResult: runesRollResult(best, advantage, mod)
// Rule: Characters: Knowledge (Witch, Magician); 7.5; Illusion (III); Bad Luck (VIII).
//
// Specification (the numbered steps the kernel was written from; the oracle is tools/kernels/specs/pilot.mjs, written from the rule text, not from this code):
// The result of a Reading Runes roll. Inputs: best, the die that counts (an integer 1 to 6, already chosen); advantage, a string: 'none', 'lore', 'learning' or 'knowledge'; mod, the sum of the spell and card modifiers that RAISE the roll (Illusion, Bad Luck, Cloven Hoof: an integer 0 to 3).
// Steps:
// 1. result = best.
// 2. If advantage is 'knowledge', subtract one from result, but never below 1 (the Knowledge advantage lowers the die, and a die cannot go below 1).
// 3. Add mod to result.
// 4. If result is above 6 it becomes 6.
// Return result. (Only 'knowledge' changes the die; 'lore', 'learning' and 'none' change nothing here.)
//
// Verified against the independent oracle on all 96 inputs of its domain (exhaustive), never throws, never mutates its arguments; tests/pilot_rules.test.mjs repeats that.
// Code: qwen2.5-coder:32b, attempt 1, 4.6 s, 63 generated tokens. Pure: no state, no dice. The engine's glue calls it; it does not read or write the game state.

export function runesRollResult(best, advantage, mod) {
    let result = best;
    if (advantage === 'knowledge') {
        result = Math.max(1, result - 1);
    }
    result += mod;
    return Math.min(result, 6);
}
