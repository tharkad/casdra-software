// spelltext.js: the plain one-line synopsis of each of the 47 spells, for the Spells room of the Kit sheet and the learn sheet (package P2).
// The synopsis is UI-side text written from the printed card (data/src/cardtext.json): it says what the spell does in the words a player would use at the table. The
// printed text stays underneath (G.data.cardtext.spells[id]) and decides the rules; nothing here is read by the engine. No rule numbers, no percentages.

export const SYNOPSIS = {
    'exorcise': 'Kills every Demon and Imp here and breaks every spell and curse in the clearing.',
    'make-whole': 'Mends your tired and wounded chits and repairs damaged armor.',
    'peace': 'Stops one character, native or monster from fighting for the rest of the fight.',
    'small-blessing': 'A roll on the Wishes table: one good turn for one character. Wish for Peace gives two more peaceful rounds.',
    'blend-into-background': 'Gives the target an extra Hide phase for the day.',
    'fog': 'Fog over your tile: nobody there can Peer when they Search.',
    'prophecy': 'The target picks each phase as it comes, instead of planning the day ahead.',
    'stones-fly': 'Hurls four stones, Light harm, at the targets you name.',
    'talk-to-wise-bird': 'A Wise Bird lets you Peer at any clearing on the map, at once.',
    'witch-s-brew': 'Turns your Type II Magic chits into Type IV, and Type VIII into Type III, for the day.',
    'elven-grace': 'Sets the Move times of a character, native or monster by their size.',
    'faerie-lights': 'Turns your Type III Magic chits into Type II, and Type VII into Type VI, for the day.',
    'illusion': 'Adds one to every Search roll of one character, or of everyone in your tile.',
    'lost': 'Each Move of the target goes where the Lost table says: two dice, the higher counts.',
    'persuade': 'Pacifies a native group, or the Giants or Ogres here: you may hire them, or buy from them, as Friendly.',
    'see-hidden-signs': 'Gives the target an extra Search phase for the day.',
    'blazing-light': 'In a cave, everyone there may record one extra phase of any normal kind.',
    'elemental-spirit': 'Turns your Type IV Magic chits into Type VIII, and Type VI into Type V, for the day.',
    'fiery-blast': 'A fiery missile at any targets: Light harm and three sharpness stars, reach 13.',
    'hurricane-winds': 'Blows a character, monster or native out of a mountain clearing to a tile you choose.',
    'lightning-bolt': 'From a mountain clearing: a Medium bolt with three sharpness stars, reach 18.',
    'roof-collapses': 'In a cave: a Heavy blow on everyone there, you included.',
    'violent-storm': 'A storm over your tile: whoever ends a phase in its woods or mountains loses phases.',
    'absorb-essence': 'You become the monster you name, and it leaves the map.',
    'ask-demon': 'Ask a Demon one yes-or-no (or number) question about another player.',
    'broomstick': 'Gives a Light character a Fly chit to ride.',
    'curse': 'Rolls on the Curses table and lays the result on one character.',
    'pentangle': 'Keeps Demons and Imps off the target and holds off every spell aimed at them.',
    'power-of-the-pit': 'Rolls on the Power of the Pit table and applies the result to the target.',
    'dissolve-spell': 'Breaks one spell already in force in your clearing (a curse is not a spell).',
    'enchant-artifact': 'Adds a spell and its Magic type to an artifact or book you hold.',
    'melt-into-mist': 'Turns the target into mist: it can only Move, Hide and Follow, and spells cannot touch it.',
    'phantasm': 'Raises a ghost of the target that can Move, Peer and Enchant on its own.',
    'transform': 'Turns the target into whatever creature the Transform table names.',
    'unleash-power': 'Turns your Magic chits into chits that Move or Fight (one at a time) for the day.',
    'world-fades': 'After a quiet round the target rolls to Hide again, and Searches with Magic Sight.',
    'control-bats': 'Brings every Bat in your clearing under your command.',
    'peace-with-nature': 'Warning and Sound chits stop calling monsters when the target ends a turn.',
    'premonition': 'The target chooses when in the day to take their turn.',
    'protection-from-magic': 'Shields one character from spells and curses for one round or one phase.',
    'sense-danger': 'Gives the target an extra Alert phase on their turn.',
    'bad-luck': 'Adds one to the target’s roll on every table.',
    'deal-with-goblins': 'Pacifies every Goblin here: you may hire them at the Neutral column.',
    'guide-spider-or-octopus': 'Puts one Spider or Octopus under your command.',
    'poison': 'Adds a sharpness star to what one weapon, native, Goblin or Ogre hits for, until sunset tomorrow.',
    'remedy': 'Breaks one spell or curse in your clearing.',
    'whistle-for-monsters': 'Calls a face-up Sound chit to your tile, or sends it to another.',
};

// The line for a spell card: the plain synopsis, else the first sentence of the printed text (a spell the table above does not know, e.g. a mod).
export function synopsis(sp, printed = '') {
    if (SYNOPSIS[sp?.id]) return SYNOPSIS[sp.id];
    const body = String(printed).replace(/^[^:]*:\s*/, '');
    return (body.split(/(?<=\.)\s/)[0] || sp?.name || '').trim();
}

// Where and how it is cast, in one line (the rule behind it, and the game stopping to ask, are in the card's Detail).
export function castLine(sp) {
    const c = sp?.color;
    return `Cast in the evening${c ? `, where ${c} magic is present` : ', where any magic is present'}.`;
}
