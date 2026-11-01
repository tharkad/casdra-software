// kindicons.js: ONE drawn symbol per KIND of treasure and per colour of magic, for every treasure and spell that has no picture of its own (Mike, 2026-11-01: blank is not acceptable).
// Same line style as icons.js `I` (24 x 24, stroke 1.75, round caps, currentColor), so a symbol follows the theme. The ids of the 74 treasures and 47 spells are mapped to a kind in
// app/art/kinds.json (data.kinds); tests/kinds.test.mjs checks that every id is mapped and every kind is drawn here. Real art (a weapon, an armor, a horse) always has priority:
// callers ask for a symbol only when they have no picture. All paths are original drawings; none is copied from the game's art.
import { sv } from './dom.js';
import { I } from './icons.js';

// A symbol is a list of path strings (strokes). Reused house icons (glove, crown, skull, book, scroll, eye, sun, spark, bolt, pin) come from icons.js.
export const SYMBOLS = {
    // ---- treasures ----
    garment: ['M9 4l3 2 3-2 4.5 4.5L17 11v9H7v-9L4.5 8.5z', 'M12 6v5'],
    boots: ['M8.5 3h5.5v9l5 2.6V19.5H5V15h3.5z', 'M8.5 8H14'],
    gloves: [I.glove],
    band: ['M3 8.5h18v7H3z', 'M10 6.5h4v11h-4z', 'M12 10.5v3'],
    potion: ['M10 3h4M11 3v5.5L6.2 17A2 2 0 008 20h8a2 2 0 001.8-3L13 8.5V3', 'M8.5 14h7'],
    salve: ['M6 5.5h12V9H6z', 'M7 9h10v10a1 1 0 01-1 1H8a1 1 0 01-1-1z', 'M10 14h4'],
    herb: ['M12 21v-9', 'M12 12c-4 0-6-3-6-6.5 4 0 6 2.5 6 6.5z', 'M12 15.5c4 0 6-3 6-6.5-4 0-6 2.5-6 6.5z'],
    map: ['M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z', 'M9 4v14M15 6v14'],
    sight: [I.eye],
    wand: ['M4.5 19.5L14.5 9.5', 'M17 3v4M15 5h4', 'M19.5 11v2.5M18.2 12.2h2.6', 'M10 4.5v2M9 5.5h2'],
    key: ['M8 4a4 4 0 100 8 4 4 0 000-8z', 'M10.8 10.8L20 20M16 16l2-2M18.5 18.5l2-2'],
    lantern: ['M12 2.5V5', 'M9 5h6l2 3v10l-2 3H9l-2-3V8z', 'M7 8h10', 'M12 11a2 2 0 100 4 2 2 0 000-4z'],
    pipes: ['M4 5h3v14H4z', 'M8 5h3v11H8z', 'M12 5h3v8h-3z', 'M16 5h3v5h-3z'],
    book: [I.book],
    scroll: [I.scroll],
    charm: ['M6.5 3L12 10.5 17.5 3', 'M12 10.5a4 4 0 100 8 4 4 0 000-8z', 'M12 13v3'],
    ring: ['M12 9.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z', 'M9.5 9.5L8.5 6 10.5 3.5h3l2 2.5-1 3.5'],
    jewel: ['M7 4h10l4 5-9 11L3 9z', 'M3 9h18', 'M9 4L7 9l5 11 5-11-2-5'],
    regalia: [I.crown],
    sacred: ['M6 4h12c0 5-2.5 8-6 8S6 9 6 4z', 'M12 12v6', 'M8 20h8', 'M6.5 7h11'],
    remains: [I.skull],
    chest: ['M4 10c0-3 3-5 8-5s8 2 8 5v10H4z', 'M4 11.5h16', 'M12 11.5v3.5M10.5 15h3'],
    carpet: ['M3 10c3-2.5 6 2.5 9 0s6 2.5 9 0v5.5c-3 2.5-6-2.5-9 0s-6 2.5-9 0z', 'M4 17v3M8 17.5v3M12 18v3M16 17.5v3M20 17v3'],
    place: [I.pin],
    // ---- the eight sites of the Setup Card (found by name) ----
    'site-hoard': ['M5 7.5a7 3 0 1014 0 7 3 0 10-14 0', 'M5 7.5v4.5a7 3 0 0014 0V7.5', 'M5 12v4.5a7 3 0 0014 0V12', 'M5 16.5V19a7 3 0 0014 0v-2.5'],
    'site-lair': ['M3 20h18', 'M5 20v-6.5a7 8.5 0 0114 0V20', 'M9 20v-4a3 3.2 0 016 0v4'],
    'site-altar': ['M4 11h16v3H4z', 'M6 14v6M18 14v6M7 20h10', 'M12 3v5M9.8 5h4.4'],
    'site-shrine': ['M12 3l8.5 5.5h-17z', 'M6 8.5V19M18 8.5V19M4 19.5h16', 'M10 19v-5h4v5'],
    'site-pool': ['M3 8c3-2.2 6 2.2 9 0s6 2.2 9 0', 'M3 13c3-2.2 6 2.2 9 0s6 2.2 9 0', 'M3 18c3-2.2 6 2.2 9 0s6 2.2 9 0'],
    'site-vault': ['M4 4h16v16H4z', 'M12 8a4 4 0 100 8 4 4 0 000-8z', 'M12 10v4M10 12h4'],
    'site-cairns': ['M4.5 20h15v-4.5h-15z', 'M7 15.5h10V11H7z', 'M9.5 11h5V7h-5z'],
    'site-statue': ['M12 3a2.5 2.5 0 100 5 2.5 2.5 0 000-5z', 'M8 20v-8l4-2.5 4 2.5v8', 'M6 20h12'],
    // ---- spells, by colour of magic ----
    white: [I.sun],
    grey: ['M7 15.5h10a3.7 3.7 0 00.4-7.4 5.4 5.4 0 00-10.4 1.5A3 3 0 007 15.5z', 'M6 19.5h7M10 19.5h8'],
    gold: [I.spark],
    purple: [I.bolt],
    black: ['M3 12a9 9 0 1018 0 9 9 0 10-18 0', 'M12 3l5.3 16.3L3.4 9.2h17.2L6.7 19.3z'],
    any: ['M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z', 'M12 7.5l1.3 3.2 3.2 1.3-3.2 1.3L12 16.5l-1.3-3.2L7.5 12l3.2-1.3z'],
};

// The spell colours get a quiet tint of their own on the cream counter (the hex is only the drawn colour of the stroke; the symbol still works in one ink).
export const TINT = { white: '#8a8470', grey: '#6d7681', gold: '#a8800f', purple: '#6b4bb8', black: '#2b2733', any: '#6a6252' };

/** The kinds of the data (data.kinds, from art/kinds.json), or null when the file did not load. */
export const kindsOf = data => data?.kinds ?? null;

/** The kind of a treasure or spell id: 'boots', 'purple', ... or null (a weapon, an armor, a horse, a thing that is not in the table). */
export function kindOfId(data, group, id) {
    const k = kindsOf(data);
    return (k && id != null ? k[group]?.[id] : null) ?? null;
}

/** The kind of a thing named by its name: a treasure card's name or a spell's name (null for anything else). */
export function kindOfName(data, name) {
    const t = Object.values(data?.treasures ?? {}).find(x => x.name === name);
    if (t) return kindOfId(data, 'treasures', t.id);
    const s = Object.values(data?.spells ?? {}).find(x => x.name === name);
    return s ? kindOfId(data, 'spells', s.id) : null;
}

/** The kind of a belonging ({ kind: 'treasure', id, ...}), else by its name when it has no id of its own. */
export function kindOfItem(data, it) {
    if (!it) return null;
    if (it.kind === 'treasure' && it.id) { const k = kindOfId(data, 'treasures', it.id); if (k) return k; }
    return it.name ? kindOfName(data, it.name) : null;
}

/** The symbol of a kind as an <svg> element (24 box; `cls` is added to `ds-i ki`, `numeral` puts the spell's type I to VIII in the corner). */
export function kindIcon(kind, { cls = '', numeral = null, title = null } = {}) {
    const paths = SYMBOLS[kind];
    if (!paths) return null;
    const svg = sv('svg', { class: `ds-i ki ki-${kind}${cls ? ` ${cls}` : ''}`, viewBox: '0 0 24 24', role: title ? 'img' : null, 'aria-label': title, 'aria-hidden': title ? null : 'true', 'data-kind': kind, style: TINT[kind] ? `color:${TINT[kind]}` : null },
        ...paths.map(d => sv('path', { d })));
    if (numeral) svg.append(sv('text', { x: 23, y: 23.4, 'text-anchor': 'end', class: 'ki-num', 'font-size': 8.5, 'font-weight': 800, fill: 'currentColor', stroke: 'none' }, String(numeral)));
    return svg;
}

/** The same as markup text, for the places that build with innerHTML. */
export function kindIconHtml(kind, cls = '') {
    const paths = SYMBOLS[kind];
    return paths ? `<svg class="ds-i ki ki-${kind}${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" data-kind="${kind}"${TINT[kind] ? ` style="color:${TINT[kind]}"` : ''}>${paths.map(d => `<path d="${d}"/>`).join('')}</svg>` : '';
}

/** The symbol for a belonging, or null. */
export const itemKindIcon = (data, it, o) => { const k = kindOfItem(data, it); return k ? kindIcon(k, o) : null; };
/** The symbol for a spell (by its colour of magic; the type goes in the corner when `withType`). */
export const spellKindIcon = (data, sp, { withType = false, ...o } = {}) => {
    if (!sp) return null;
    const k = kindOfId(data, 'spells', sp.id) ?? (sp.color ? String(sp.color).toLowerCase() : 'any');
    return kindIcon(SYMBOLS[k] ? k : 'any', { ...o, numeral: withType ? sp.type : null });
};
