// Kernel p04 runesDiceCount: runesDiceCount(advantage, cardOneDie)
// Rule: Characters: Lore (Wizard, Sorceror), Learning (Pilgrim); 7.5; Treasures: Lucky Charm.
//
// Specification (the numbered steps the kernel was written from; the oracle is tools/kernels/specs/pilot.mjs, written from the rule text, not from this code):
// How many dice a character rolls when Reading Runes. Inputs: advantage, a string: 'none', 'lore' (Wizard or Sorceror), 'learning' (Pilgrim) or 'knowledge' (Witch or Magician); cardOneDie, a boolean: true when a card (the Lucky Charm) already lets him roll one die.
// Steps:
// 1. If advantage is 'lore' or 'learning', the answer is 1.
// 2. If cardOneDie is true, the answer is 1.
// 3. Otherwise the answer is 2. ('knowledge' and 'none' do not change the number of dice.)
// Return 1 or 2.
//
// Verified against the independent oracle on all 8 inputs of its domain (exhaustive), never throws, never mutates its arguments; tests/pilot_rules.test.mjs repeats that.
// Code: qwen2.5-coder:32b, attempt 1, 4.3 s, 63 generated tokens. Pure: no state, no dice. The engine's glue calls it; it does not read or write the game state.

export function runesDiceCount(advantage, cardOneDie) {
    if (advantage === 'lore' || advantage === 'learning') {
        return 1;
    }
    if (cardOneDie) {
        return 1;
    }
    return 2;
}
