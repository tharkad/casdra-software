// One plain line for each spell a new character may begin with (the starting-spell picker of the wizard, mockup 05 g3b). Pure text: no DOM.
// Each line says what the printed card does, in a few words (data/cardtext.json is the printed text; the full card is one tap away in the picker).
// Covers Types I, II, III, IV, VI and VII, which is every pool the wizard offers (White Knight I, Wizard II to IV, Sorcerer IV and VI, Woods Girl VII).
export const SPELL_LINE = {
    // Type I (White)
    'exorcise': 'Slays Demons and Imps and breaks every spell and curse in your clearing.',
    'make-whole': 'Mends your wounded and fatigued chits and damaged armor.',
    'peace': 'Calms one target, if nobody else has chosen it.',
    'small-blessing': 'Its target rolls on the Wishes table.',
    // Type II
    'blend-into-background': 'Gives its target an extra Hide phase.',
    'fog': 'Nobody in the tile can use Peer to search it.',
    'prophecy': 'Its target chooses each phase as the day unfolds.',
    'stones-fly': 'Four stone hits, on any targets you name.',
    'talk-to-wise-bird': 'Peer into any clearing on the map, from afar.',
    'witch-s-brew': 'Reshapes your Magic chits: II becomes IV, VIII becomes III.',
    // Type III
    'elven-grace': 'Quickens its target’s Move chits: the lighter, the quicker.',
    'faerie-lights': 'Reshapes your Magic chits: III becomes II, VII becomes VI.',
    'illusion': 'Adds one to every Search roll of its target.',
    'lost': 'Its target stumbles to a random clearing whenever he moves.',
    'persuade': 'Pacifies a native group (or Giants, Ogres): hire them on Friendly terms.',
    'see-hidden-signs': 'Gives its target an extra Search phase.',
    // Type IV
    'blazing-light': 'Lights a cave: everyone there may take an extra phase in it.',
    'elemental-spirit': 'Reshapes your Magic chits: IV becomes VIII, VI becomes V.',
    'fiery-blast': 'Hurls fire at any targets you name.',
    'hurricane-winds': 'In the mountains, blows its target away on a great wind.',
    'lightning-bolt': 'In the mountains, strikes one target with a bolt of lightning.',
    'roof-collapses': 'In a cave, brings the ceiling down on everyone there, you too.',
    'violent-storm': 'A storm that costs cave-only travellers phases in the woods and mountains.',
    // Type VI
    'dissolve-spell': 'Breaks one spell already in force in your clearing.',
    'enchant-artifact': 'Adds one of your spells to an Artifact or Spell Book.',
    'melt-into-mist': 'Turns its target into drifting mist.',
    'phantasm': 'Conjures a phantasm that takes a turn of its own.',
    'transform': 'Turns its target into a creature the dice choose.',
    'unleash-power': 'Turns your Magic chits into chits that can move or fight.',
    'world-fades': 'Fades its target from sight between rounds, when no foe is near.',
    // Type VII
    'control-bats': 'Takes control of every Bat in your clearing.',
    'peace-with-nature': 'Warning and Sound chits no longer call monsters on you.',
    'premonition': 'Lets its target choose when to take his turn in Daylight.',
    'protection-from-magic': 'Shields its target from spells and curses for a round.',
    'sense-danger': 'Gives its target an extra Alert phase.',
};
export const spellLine = id => SPELL_LINE[id] ?? '';
// The colour of magic as a group heading, and the chit picture for it (art/colormagic/<name>chit.gif).
export const COLOR_ORDER = ['White', 'Grey', 'Gold', 'Purple', 'Black'];
export const COLOR_FILE = { White: 'white', Grey: 'gray', Gold: 'gold', Purple: 'purple', Black: 'black' };
export const COLOR_DOT = { White: 'white', Grey: 'grey', Gold: 'gold', Purple: 'purple', Black: 'black' };
