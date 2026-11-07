// The sentence under a starting dwelling on the New Game screen. Pure text (no DOM) so it can be tested.
// `who` is a CHARACTERS entry: { rel: { Group: level } }. What the garrison thinks of the character comes from the character's own relationship table.
const LIVES = {
    Inn: ['Rogues', 'The Rogues live here: they sell workhorses and trinkets.'],
    Chapel: ['Order', 'The Order live here: they sell suits of armor, warhorses, crossbows, great swords, great axes and morning stars.'],
    House: ['Soldiers', 'The Soldiers live here: they sell helmets, shields, staffs and swords. The Woodfolk may turn up on a day their row prowls.'],
    'Guard house': ['Guard', 'The Guard live here: they sell a helmet, a breastplate, a broadsword, axes and maces.'],
};
const FEELING = { 2: 'are your allies', 1: 'like you', '-1': 'dislike you', '-2': 'are your enemies' };

export function dwellingLine(dwelling, who = {}) {
    const entry = LIVES[dwelling];
    if (!entry) return '';
    const [group, text] = entry, lv = who.rel?.[group] ?? 0;
    const feel = FEELING[String(lv)];
    return feel ? `${text} They ${feel}.` : text;
}
