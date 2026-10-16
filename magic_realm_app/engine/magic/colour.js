import { isMountain, tileName, tileOf } from '../world.js';

// Colours of magic (rules 4.6.2, 6.1.2). The seventh day of each week fills the whole land with one colour (White and Black together on day 7,
// then Grey on 14, Purple on 21 and Gold on 28), from the morning until midnight. A Chapel supplies White in its own clearing. Enchanted tiles and
// cards are not modelled yet (they need the Enchant action).
export const COLORS = ['White', 'Grey', 'Gold', 'Purple', 'Black'];
// Magic chits of Types I to V can be enchanted into a colour chit (4.6.4f); VI to VIII cannot.
export const TYPE_COLOR = { I: 'White', II: 'Grey', III: 'Gold', IV: 'Purple', V: 'Black' };
export const enchantableChits = st => st.ch.chits.filter(c => c.type === 'magic' && c.state === 'active' && TYPE_COLOR[c.numeral] && !c.alt?.mf);
export const colorChits = (st, color = null) => st.ch.chits.filter(c => c.type === 'magic' && c.state === 'enchanted' && (!color || TYPE_COLOR[c.numeral] === color));
export const COLOR_MEANING = {
    White: 'Power from on High', Grey: 'Natural laws', Gold: 'Woods sprites', Purple: 'Elemental energies', Black: 'Demonic',
};
const WEEK_COLORS = [['White', 'Black'], ['Grey'], ['Purple'], ['Gold']];            // day 7, 14, 21, 28 (and again for a longer game)
export const isMagicDay = day => day > 0 && day % 7 === 0;
export const dayColors = day => (isMagicDay(day) ? WEEK_COLORS[((day / 7) - 1) % 4] : []);
// The next day on or after `from` that fills the land with `color`, or null when it never will in a game of `lastDay` days.
export function nextDayWith(color, from, lastDay = 28) {
    for (let d = from; d <= lastDay; d++) if (dayColors(d).includes(color)) return d;
    return null;
}
// Every colour present in a clearing, with where it comes from: [{ color, why }].
export function colorSources(st, data, clearing) {
    const out = dayColors(st.day).map(color => ({ color, why: `day ${st.day} fills the land with magic`, calendar: true }));
    if (st.dwellings.some(d => d.kind === 'Chapel' && d.at === clearing)) out.push({ color: 'White', why: 'the Chapel in this clearing' });
    // an enchanted tile: each of its clearings carries the colours printed on that side (4.6.2)
    const p = clearing ? st.placements.find(x => x.id === tileOf(clearing)) : null;
    if (p?.side === 'enchanted') {
        const c = data.tile(p.id)?.sides.enchanted.clearings.find(x => p.id + x.n === clearing);
        for (const m of c?.magic ?? []) out.push({ color: m[0].toUpperCase() + m.slice(1), why: `${tileName(p.id)} is enchanted` });
    }
    return out;
}
export function colorsAt(st, data, clearing) {
    return new Set(colorSources(st, data, clearing).map(x => x.color));
}
export const onMountain = (st, data, at) => isMountain(st, data, at);

// ---- enchanting a tile (7.10.4): the tile is turned to its other side; its roads and the colours of its clearings change ----
export const sideOf = (st, tile) => st.placements.find(p => p.id === tile)?.side ?? 'normal';
export function flipTile(st, data, tile) {
    const p = st.placements.find(x => x.id === tile);
    if (!p) throw new Error('no such tile');
    p.side = p.side === 'enchanted' ? 'normal' : 'enchanted';
    (st.tileFlips ??= []).push({ tile, day: st.day, to: p.side });
    return p.side;
}
// The ways he can enchant the tile he stands on with a ready Magic chit of Type I to V whose colour of magic is present in his clearing
// (from the land, a Chapel, the tile itself, or one of his own enchanted chits of that colour, which is then used up). [{ chit, tile, supply }]
export function tileEnchantOptions(st, data) {
    if (st.ch.onRoad || !st.ch.at) return [];
    const here = colorsAt(st, data, st.ch.at), tile = tileOf(st.ch.at), out = [];
    for (const chit of enchantableChits(st)) {
        const color = TYPE_COLOR[chit.numeral];
        if (here.has(color)) out.push({ kind: 'tile', chit: chit.id, tile, supply: null, numeral: chit.numeral, time: chit.time, effort: chit.effort, color });
        else { const own = colorChits(st, color)[0]; if (own) out.push({ kind: 'tile', chit: chit.id, tile, supply: own.id, numeral: chit.numeral, time: chit.time, effort: chit.effort, color }); }
    }
    return out;
}
