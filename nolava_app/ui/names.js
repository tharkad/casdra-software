// names.js: how a thing is NAMED IN THE UI (QA-125). The engine and data keep their names ("Sorceror" is the printed spelling in data/src); every string the player
// reads goes through here so one spelling shows ("Sorcerer") and "a"/"an" follows the first letter. Pure: no DOM, no state, safe in node tests.
//   displayName('sorceror') / displayName('Sorceror') -> 'Sorcerer'      (a character id, a character name, or any name: unknown names come back unchanged)
//   fixNames('The Sorceror falls.')                   -> 'The Sorcerer falls.'   (a whole sentence from the engine log: swaps every known name in it)
//   article('Ogre') -> 'an'      article('Wolf') -> 'a'
//   tieNumber('Rogue Swordsman 7') -> 'Rogue Swordsman\u00A07'
//   withArticle('Ogre') -> 'an Ogre'      withArticle('the Ogre') -> 'the Ogre' (a name that already has one is left alone)
// character id -> shown name (the ids are the engine's: 'sorceror')
const BY_ID = { sorceror: 'Sorcerer' };

export function displayName(x) {
    if (x == null) return x;
    const s = String(x);
    if (BY_ID[s]) return BY_ID[s];
    return fixNames(s);
}
export function fixNames(text) {
    if (text == null) return text;
    return String(text).replace(/\b([Ss])orceror(s?)\b/g, '$1orcerer$2');
}
// a name that begins with a vowel sound takes "an"; the few words whose first letters mislead are listed
const AN_EXCEPT = /^(uni[^n]|use|usu|eu|one\b|once\b)/i, A_EXCEPT = /^(hour|honest|heir)/i;
export function article(word) {
    const w = String(word ?? '').trim();
    if (A_EXCEPT.test(w)) return 'an';
    return /^[aeiou]/i.test(w) && !AN_EXCEPT.test(w) ? 'an' : 'a';
}
export const withArticle = word => (/^(the|a|an|some|two|three|four|five|six)\b/i.test(String(word).trim()) ? String(word) : `${article(word)} ${word}`);
// a number that ends a name stays with the word before it, so "Rogue Swordsman 7" never breaks with the 7 alone on the next line (QA-115); "#2" tags too
export const tieNumber = name => String(name ?? '').replace(/ (?=#?\d+$)/, '\u00A0');
