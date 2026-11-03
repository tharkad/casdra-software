// stocknotes.js: why a piece is on a group's Buy list when it did not start in the box (note 105: "Should there still be a suit of armor here?"). Pure (no DOM, no engine). The journal says what happened, so
// nothing is added to the game: a piece he SOLD to the group (`You sell the Axe to the Guard for 4 gold.`), or one of his that was DESTROYED (`Your Suit of Armor is destroyed.`), which comes back as new armor to
// the box of its own group (rule 8.4.9k.3: suits of armor to the Order, breastplates to the Guard, helmets and shields to the Soldiers).
//   stockNote(journal, group, name, returnsTo) -> a short sentence, or null
//   journal   view.me.journal: [{ day, k, t }]
//   group     the group whose list it is        name  the piece as the list names it
//   returnsTo the group a destroyed piece of that name goes back to (null for a weapon card, a treasure, a horse or a piece that does not return)

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function stockNote(journal, group, name, returnsTo = null) {
    if (!name || !group) return null;
    const sold = new RegExp(`^You sell the ${escape(name)} to the ${escape(group)} for `), lost = `Your ${name} is destroyed.`;
    let soldDay = null, lostDay = null;
    for (const l of journal ?? []) {
        if (l.k === 'trade' && sold.test(l.t ?? '')) soldDay = l.day;
        else if (l.k === 'combat' && l.t === lost && returnsTo === group) lostDay = l.day;
    }
    const out = [];
    if (soldDay != null) out.push(`You sold one here on day ${soldDay}.`);
    if (lostDay != null) out.push(`Yours, destroyed on day ${lostDay}, came back here as new armor.`);
    return out.length ? out.join(' ') : null;
}
