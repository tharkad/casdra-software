// stocknotes.js: where a piece came from, read from the journal (notes 105 and 73). Pure (no DOM, no engine). The journal says what happened, so nothing is added to the game's state: the recorded games
// still replay the same.
//
// stockNote: why a piece is on a group's Buy list when it did not start in the box (note 105: "Should there still be a suit of armor here?"). A piece he SOLD to the group (`You sell the Axe to the
//   Guard for 4 gold.`), or one of his that was DESTROYED (`Your Suit of Armor is destroyed.`), which comes back as new armor to the box of its own group (rule 8.4.9k.3: suits of armor to the Order,
//   breastplates to the Guard, helmets and shields to the Soldiers).
//   stockNote(journal, group, name, returnsTo) -> a short sentence, or null
//   journal   view.me.journal: [{ day, k, t }]
//   group     the group whose list it is        name  the piece as the list names it
//   returnsTo the group a destroyed piece of that name goes back to (null for a weapon card, a treasure, a horse or a piece that does not return)
//
// itemOrigin: where he came by a belonging (note 73: "How did I get the living sword??": it came out of the Remains of Thief he drew at the Hoard, and nothing on the screen said so).
//   itemOrigin(journal, name) -> { text, what, via, card?, at?, group?, day } or null (the newest line of the journal that gave him a piece of that name)
//   via  'card' (a Treasure-within-Treasures card that was exchanged for it: the Remains of Thief), 'loot' (a Loot at a site or a pile), 'sight' (Magic Sight), 'ground' (off the ground),
//        'site' (a site card's own table: the Crypt of the Knight), 'buy' (from a group or a visitor), 'favour' (a favour a group did him)
//   text a sentence, e.g. "From the Remains of Thief, drawn at the Hoard on day 9."; what the same without the day (for the moment he gets it: "From the Remains of Thief, drawn at the Hoard.")

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

const the = n => (/^the /i.test(n) ? n : `the ${n}`);
const GROUND = 'the things on the ground';
const keepList = s => String(s ?? '').split(/,\s*|\s+and\s+/).map(x => x.trim().replace(/^the /i, '')).filter(Boolean);

// The line that gave him the piece named `name`, newest first. A card that was exchanged names every treasure it gave ("You keep: Living Sword, Eye of the Moon.").
export function itemOrigin(journal, name) {
    const o = originLine(journal, name);
    return o ? { ...o, text: `${o.what.replace(/\.$/, '')} on day ${o.day}.` } : null;
}
function originLine(journal, name) {
    if (!name) return null;
    const n = escape(name);
    const take = new RegExp(`you take the ${n}\\.?$`, 'i'), siteTake = new RegExp(`^(.+?) \\([\\d+]+\\): You take the ${n}\\.?$`), buy = new RegExp(`^You buy the ${n} from the (.+?) for `), favour = new RegExp(`^The (.+?) gives? you the ${n} as a favour`, 'i');
    const lines = journal ?? [];
    for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i], t = l.t ?? '';
        if (!t || /^Phase \d+:/.test(t)) continue;
        let m;
        if ((m = /^(Loot|Magic Sight) \([\d+]+\) at (.+?): (.+?)! Cursed with (\w[\w ]*?)\.(?: You find (\d+) gold\.)?(?: You keep: (.+?)\.?)?$/.exec(t)) && keepList(m[6]).some(x => x.toLowerCase() === name.toLowerCase()))
            return { via: 'card', card: m[3], at: m[2], curse: m[4], day: l.day, what: `From the ${m[3]}, drawn at ${the(m[2])}.` };
        if ((m = /^(Loot|Magic Sight) \([\d+]+\) at (.+?): (.+)$/.exec(t)) && take.test(t) && /^you take the /i.test(m[3])) {
            const sight = m[1] === 'Magic Sight', at = m[2];
            if (at === GROUND) return { via: 'ground', day: l.day, what: 'Picked up off the ground.' };
            return { via: sight ? 'sight' : 'loot', at, day: l.day, what: sight ? `Taken with Magic Sight from ${the(at)}.` : `Looted from ${the(at)}.` };
        }
        if ((m = siteTake.exec(t))) return { via: 'site', at: m[1], day: l.day, what: `Taken from ${the(m[1])}.` };
        if (l.k === 'trade' && (m = buy.exec(t))) return { via: 'buy', group: m[1], day: l.day, what: `Bought from ${the(m[1])}.` };
        if ((m = favour.exec(t))) return { via: 'favour', group: m[1], day: l.day, what: `A favour from ${the(m[1])}.` };
    }
    return null;
}
