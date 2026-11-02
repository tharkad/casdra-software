// kindicons.js: ONE drawn symbol per KIND of treasure and per colour of magic, for every treasure and spell that has no picture of its own (Mike, 2026-11-01: blank is not acceptable).
// Same line style as icons.js `I` (24 x 24, stroke 1.75, round caps, currentColor), so a symbol follows the theme. The ids of the 74 treasures and 47 spells are mapped to a kind in
// app/art/kinds.json (data.kinds); tests/kinds.test.mjs checks that every id is mapped and every kind is drawn here. Real art (a weapon, an armor, a horse) always has priority:
// callers ask for a symbol only when they have no picture. All paths are original drawings; none is copied from the game's art.
import { sv } from './dom.js';
import { ART } from './kindart.js';
import { ART_TREASURES } from './kindart_treasures.js';
import { ART_MAGIC } from './kindart_magic.js';
import { ART_SITES } from './kindart_sites.js';

// A symbol is a colour illustration, an object { colour: true, vb, bg, shapes } (see kindart.js): it carries its own colours and backing tile and is never recoloured by the theme.
// Mike, 2026-11-02: the whole set is one style, so ALL 38 kinds are colour illustrations (kindart.js: the first eight and white and the two sites; kindart_treasures.js, kindart_magic.js, kindart_sites.js).
// The one-colour line format (a list of path strings, following the theme via currentColor) is still understood by kindIcon / kindIconHtml, but no kind uses it any more: no exception is left.
export const SYMBOLS = {
    ...ART,
    ...ART_TREASURES,
    ...ART_MAGIC,
    ...ART_SITES,
    // ---- treasures ----
    // ---- the eight sites of the Setup Card (found by name) ----
    // ---- spells, by colour of magic ----
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

/** Is this symbol a colour illustration (not a one-colour line symbol)? */
export const isColour = sym => !!sym && !Array.isArray(sym) && sym.colour === true;

// The attributes of one painted shape of a colour illustration: explicit colours always, never currentColor.
function shapeAttrs(s) {
    return { d: s.d, fill: s.fill ?? 'none', stroke: s.stroke ?? 'none', 'stroke-width': s.stroke ? (s.sw ?? 2) : null, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        opacity: s.op ?? null, 'stroke-dasharray': s.dash ?? null };
}
const R = 0.19;     // the corner of the backing tile, as a share of the box; the svg itself is rounded to the same corner, so no drawing can poke out of its tile
const bgAttrs = (vb, bg) => ({ x: 0, y: 0, width: vb, height: vb, rx: vb * R, fill: bg.fill, stroke: 'none' });
const edgeAttrs = (vb, bg) => ({ x: 0.75, y: 0.75, width: vb - 1.5, height: vb - 1.5, rx: vb * R - 0.75, fill: 'none', stroke: bg.stroke ?? 'none', 'stroke-width': 1.5 });
// the type numeral of a spell in the corner of a colour illustration: dark ink with a light halo, so it reads on any tile
const numeralAttrs = (vb, numeral) => ({ x: vb - 3.2, y: vb - 3.4, 'text-anchor': 'end', class: 'ki-num', 'font-size': 7.4 * vb / 24, 'font-weight': 800, fill: '#2b2418', stroke: '#ffffff', 'stroke-width': 0.35 * vb / 8 * 2, 'paint-order': 'stroke', 'stroke-linejoin': 'round' });

/** The symbol of a kind as an <svg> element (24 box for a line symbol, the symbol's own square box for a colour illustration; `cls` is added to `ds-i ki`, `numeral` puts the spell's type I to VIII in the corner). */
export function kindIcon(kind, { cls = '', numeral = null, title = null } = {}) {
    const sym = SYMBOLS[kind];
    if (!sym) return null;
    const col = isColour(sym), vb = col ? sym.vb ?? 48 : 24;
    const svg = sv('svg', { class: `ds-i ki ki-${kind}${col ? ' ki-colour' : ''}${cls ? ` ${cls}` : ''}`, viewBox: `0 0 ${vb} ${vb}`, role: title ? 'img' : null, 'aria-label': title, 'aria-hidden': title ? null : 'true', 'data-kind': kind, style: col ? `border-radius:${R * 100}%` : TINT[kind] ? `color:${TINT[kind]}` : null },
        ...(col ? [sv('rect', bgAttrs(vb, sym.bg)), ...sym.shapes.map(s => sv('path', shapeAttrs(s))), sv('rect', edgeAttrs(vb, sym.bg))] : sym.map(d => sv('path', { d }))));
    if (numeral) svg.append(sv('text', col ? numeralAttrs(vb) : { x: 23, y: 23.4, 'text-anchor': 'end', class: 'ki-num', 'font-size': 8.5, 'font-weight': 800, fill: 'currentColor', stroke: 'none' }, String(numeral)));
    return svg;
}

const attrText = o => Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => ` ${k}="${v}"`).join('');
/** The same as markup text, for the places that build with innerHTML. */
export function kindIconHtml(kind, cls = '') {
    const sym = SYMBOLS[kind];
    if (!sym) return '';
    const col = isColour(sym), vb = col ? sym.vb ?? 48 : 24;
    const body = col ? `<rect${attrText(bgAttrs(vb, sym.bg))}/>${sym.shapes.map(s => `<path${attrText(shapeAttrs(s))}/>`).join('')}<rect${attrText(edgeAttrs(vb, sym.bg))}/>` : sym.map(d => `<path d="${d}"/>`).join('');
    return `<svg class="ds-i ki ki-${kind}${col ? ' ki-colour' : ''}${cls ? ` ${cls}` : ''}" viewBox="0 0 ${vb} ${vb}" aria-hidden="true" data-kind="${kind}"${col ? ` style="border-radius:${R * 100}%"` : TINT[kind] ? ` style="color:${TINT[kind]}"` : ''}>${body}</svg>`;
}

/** The symbol for a belonging, or null. */
export const itemKindIcon = (data, it, o) => { const k = kindOfItem(data, it); return k ? kindIcon(k, o) : null; };
/** The symbol for a spell (by its colour of magic; the type goes in the corner when `withType`). */
export const spellKindIcon = (data, sp, { withType = false, ...o } = {}) => {
    if (!sp) return null;
    const k = kindOfId(data, 'spells', sp.id) ?? (sp.color ? String(sp.color).toLowerCase() : 'any');
    return kindIcon(SYMBOLS[k] ? k : 'any', { ...o, numeral: withType ? sp.type : null });
};
