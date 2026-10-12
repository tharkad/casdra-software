// The game's lookup tables, from the 3.1 rules (see docs/rules). Dice are applied by the caller.

// Meeting table: columns by relationship (-2 Enemy .. +2 Ally), rows by roll 1-6.
export const MEETING = {
    '-2': ['Insult', 'Challenge', 'Block/Battle', 'Block/Battle', 'Block/Battle', 'Block/Battle'],
    '-1': ['Price x4', 'No deal', 'No deal', 'Insult', 'Challenge', 'Block/Battle'],
    '0': ['Opportunity', 'Price x3', 'Price x4', 'No deal', 'No deal', 'Trouble'],
    '1': ['Opportunity', 'Price x2', 'Price x2', 'Price x3', 'Price x4', 'No deal'],
    '2': ['Boon', 'Price x1', 'Price x2', 'Price x3', 'Price x4', 'Price x4'],
};
export const REL_NAMES = { '-2': 'Enemy', '-1': 'Unfriendly', '0': 'Neutral', '1': 'Friendly', '2': 'Ally' };
export const clampRel = r => Math.max(-2, Math.min(2, r));

// Rolls are clamped to 1-6 after modifiers.
export const clamp6 = n => Math.max(1, Math.min(6, n));
export const meetingResult = (rel, roll) => MEETING[String(clampRel(rel))][clamp6(roll) - 1];

// Missile table: change to harm level for a roll of 1-6.
export const MISSILE = [+2, +1, 0, -1, -2, -3];

// Hide: a roll of 1-5 hides.
export const hides = roll => roll <= 5;

// Search tables (3rd edition p.222). 'Choice' lets the player pick any other result on the same table.
export const PEER = ['Choice', 'Clues and Paths', 'Hidden enemies and Paths', 'Hidden enemies', 'Clues', 'Nothing'];
export const LOCATE = ['Choice', 'Passages and Clues', 'Passages', 'Discover chits', 'Nothing', 'Nothing'];
export const LOOT_TAKE = [1, 2, 3, 4, 5, 6];       // roll n takes the n-th item from the top of the pile

// Position in the three red boxes / circles / squares after the repositioning roll: result[newBox] = oldBox (0-based).
export const REPOSITION = [
    null,
    [0, 2, 1],      // 1: first stays, the other two swap
    [2, 1, 0],      // 2: first and third swap
    [1, 0, 2],      // 3: first and second swap
    [0, 1, 2],      // 4: no change
    [2, 0, 1],      // 5: everything shifts one place, third wraps to first
    [1, 2, 0],      // 6: shifts the other way
];
export const DIRS = ['Thrust', 'Swing', 'Smash'];          // attack directions, in box order
export const MANEUVERS = ['Charge', 'Dodge', 'Duck'];      // the maneuver each attack direction meets
