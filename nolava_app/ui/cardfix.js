// The printed Book/Scroll cards end "It cannot cast the Type [numeral] spells." and the numeral was lost when the card text was read (data/src/cardtext.json is shared with
// the engine, so it is mended here, on the way to the screen): the missing numeral is the second "Type X Spell cards" the card says it contains.
export function mendCardText(text) {
    if (typeof text !== 'string') return text;
    const m = text.match(/two Type \w+ Spell cards and two Type (\w+) Spell cards/);
    return m ? text.replace('the Type spells', `the Type ${m[1]} spells`) : text;
}
