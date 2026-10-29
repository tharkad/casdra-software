// artbook.js: the rulebook's own counter pictures as a safety net. The main art (app/art/manifest.json) is keyed by name; the `book` section of the same manifest holds the icons cut from the
// rules book's appendix lists (both sides of every monster and weapon, one face of each armor, horse and native). They are never used where the main art has a picture: fillArtGaps() adds
// one only for a name that has none, so no counter can come up blank, and bookSide() lets the counter ask for the side it is showing. Pure data: no DOM, no fetch.

export const isBookPic = p => typeof p === 'string' && p.includes('art/book/');

// the sides a book icon can show, in the order we fall back through them
const SIDES = { mon: ['light', 'dark', 'red'], weapon: ['unalerted', 'alerted'], armor: ['intact'], horse: ['walk', 'gallop'], nat: ['light', 'dark'] };

function pick(entry, side, kind) {
    if (!entry) return null;
    return (side && entry[side]) || entry[SIDES[kind][0]] || Object.values(entry)[0] || null;
}

/** The book's picture for a thing, on the side asked (or its first side). kind: 'mon' (key = monster or part name, id = the monster id), 'weapon', 'armor', 'horse' (key = Pony/Workhorse/Warhorse), 'nat' (key = native type). */
export function bookPic(art, kind, key, side = null, id = null) {
    const b = art?.book;
    if (!b) return null;
    if (kind === 'mon') return pick((id && b.byId?.[id]) || b.monsters?.[key] || b.parts?.[key], side, kind);
    const sec = { weapon: b.weapons, armor: b.armor, horse: b.horses, nat: b.natives }[kind];
    return pick(sec?.[key], side, kind);
}

/** Give every name the main art has no picture for the book's icon (its first side), in place; returns the list of what was filled ("monsters:Wolf", ...). The main art is never replaced. */
export function fillArtGaps(art, data) {
    const filled = [];
    if (!art?.book) return filled;
    art.monsters ??= {}; art.monstersColor ??= {}; art.weapons ??= {}; art.armor ??= {}; art.horses ??= {}; art.natives ??= {};
    const put = (section, key, path, label) => { if (path && !section[key]) { section[key] = path; filled.push(`${label}:${key}`); } };
    for (const m of Object.values(data.monsters ?? {})) {
        if (!art.monstersColor[m.name] && !art.monsters[m.name]) put(art.monsters, m.name, bookPic(art, 'mon', m.name, 'light', m.id), 'monsters');
        for (const p of m.parts ?? []) { const nm = `${m.name} ${p.name}`.trim(); if (!art.monstersColor[nm] && !art.monsters[nm]) put(art.monsters, nm, bookPic(art, 'mon', nm, 'light'), 'monsters'); }
    }
    for (const w of Object.values(data.weapons ?? {})) put(art.weapons, w.name, bookPic(art, 'weapon', w.name), 'weapons');
    for (const a of Object.values(data.armor ?? {})) put(art.armor, a.name, bookPic(art, 'armor', a.name), 'armor');
    for (const h of Object.values(data.horses ?? {})) put(art.horses, h.name, bookPic(art, 'horse', h.name), 'horses');
    for (const n of Object.values(data.natives ?? {})) put(art.natives, n.id, bookPic(art, 'nat', n.type), 'natives');
    art.gaps = filled;
    return filled;
}
