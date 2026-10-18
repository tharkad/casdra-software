// Kernel p01 meetingDiceCount: meetingDiceCount(advantage, activity, otherOneDie)
// Rule: Characters: Barter (Swordsman), Fear (Black Knight); 4.1.2; 7.6; 7.7; 8.2.2.
//
// Specification (the numbered steps the kernel was written from; the oracle is tools/kernels/specs/pilot.mjs, written from the rule text, not from this code):
// How many dice a character rolls on the Meeting Table. Inputs: advantage, a string: 'none', 'fear' (Black Knight), 'barter' (Swordsman) or 'honor' (White Knight); activity, a string: 'trade' (buying or repaying in a Trade phase), 'hire' (a Hire phase) or 'battle' (the Meeting roll at the start of an Evening combat); otherOneDie, a boolean that is true when something else already lets him roll one die (a Lucky Charm, or his Woods or cave advantage).
// Steps:
// 1. If advantage is 'fear', the answer is 1.
// 2. If advantage is 'barter' and activity is 'trade', the answer is 1. (Barter works during Trade only: for 'hire' and 'battle' it does nothing.)
// 3. If otherOneDie is true, the answer is 1.
// 4. Otherwise the answer is 2.
// Return the number 1 or 2.
//
// Verified against the independent oracle on all 24 inputs of its domain (exhaustive), never throws, never mutates its arguments; tests/pilot_rules.test.mjs repeats that.
// Code: qwen2.5-coder:32b, attempt 1, 6.9 s, 72 generated tokens. Pure: no state, no dice. The engine's glue calls it; it does not read or write the game state.

export function meetingDiceCount(advantage, activity, otherOneDie) {
    if (advantage === 'fear') return 1;
    if (advantage === 'barter' && activity === 'trade') return 1;
    if (otherOneDie) return 1;
    return 2;
}
