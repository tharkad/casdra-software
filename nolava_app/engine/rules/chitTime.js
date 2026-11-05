// Kernel p03 chitTime: chitTime(printedTime, effort, draught, garb)
// Rule: Treasures: Draught of Speed, Garb of Speed; 8.4.5.
//
// Specification (the numbered steps the kernel was written from; the oracle is tools/kernels/specs/pilot.mjs, written from the rule text, not from this code):
// The time number of one of the owner's action chits (Move, Fight or Magic) as it is played. Inputs: printedTime, the number printed on the chit (an integer 1 to 6); effort, the number of asterisks on the chit (0, 1 or 2); draught, a boolean: the Draught of Speed is active; garb, a boolean: the Garb of Speed is active.
// Steps:
// 1. If draught is true: the time is 2 if effort is 2, 3 if effort is 1, 4 if effort is 0. Return it (the Draught wins when both are active, and ignores printedTime).
// 2. Otherwise, if garb is true: the time is 3 if effort is 2, 4 if effort is 1, 5 if effort is 0. Return it.
// 3. Otherwise return printedTime unchanged.
//
// Verified against the independent oracle on all 72 inputs of its domain (exhaustive), never throws, never mutates its arguments; tests/pilot_rules.test.mjs repeats that.
// Code: qwen2.5-coder:32b, attempt 1, 6 s, 93 generated tokens. Pure: no state, no dice. The engine's glue calls it; it does not read or write the game state.

export function chitTime(printedTime, effort, draught, garb) {
    if (draught) {
        return effort === 2 ? 2 : effort === 1 ? 3 : 4;
    } else if (garb) {
        return effort === 2 ? 3 : effort === 1 ? 4 : 5;
    } else {
        return printedTime;
    }
}
