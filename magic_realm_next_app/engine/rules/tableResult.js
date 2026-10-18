// Kernel p02 tableResult: tableResult(best, otherMod, hoofHere)
// Rule: Treasures: Cloven Hoof; 4.1.2; Illusion (III); Bad Luck (VIII).
//
// Specification (the numbered steps the kernel was written from; the oracle is tools/kernels/specs/pilot.mjs, written from the rule text, not from this code):
// The result of a roll on any table once its modifiers are added. Inputs: best, the die that counts (an integer 1 to 6, already chosen from the dice rolled); otherMod, the sum of the other modifiers in force (an integer from -2 to 3: positive for Bad Luck or Illusion, negative for Maps); hoofHere, a boolean: true when the Cloven Hoof is in the same clearing as the roller.
// Steps:
// 1. total = best + otherMod.
// 2. If hoofHere is true, add 1 to total (the Cloven Hoof adds one to his result, once, however many other modifiers there are).
// 3. A table result stays within 1 to 6: if total is below 1 it becomes 1; if total is above 6 it becomes 6.
// Return total.
//
// Verified against the independent oracle on all 72 inputs of its domain (exhaustive), never throws, never mutates its arguments; tests/pilot_rules.test.mjs repeats that.
// Code: qwen2.5-coder:32b, attempt 1, 4.5 s, 58 generated tokens. Pure: no state, no dice. The engine's glue calls it; it does not read or write the game state.

export function tableResult(best, otherMod, hoofHere) {
    let total = best + otherMod;
    if (hoofHere) {
        total += 1;
    }
    return Math.max(1, Math.min(total, 6));
}
