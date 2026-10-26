import { isMountain, tileName, tileOf } from '../world.js';
import { hoofCarriedNear } from '../modifiers.js';

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
// The Enchanted cards other than the Cloven Hoof (which has its own code in modifiers.js: it also adds one to table rolls) and the colour each supplies.
const CARD_COLOR = { 'sacred-grail': 'White', 'golden-icon': 'Grey', 'flowers-of-rest': 'Gold', 'dragon-essence': 'Purple' };
const cardCarriedNear = (st, at, id) => (st.order?.length ?? 0) > 1 && st.order.some(who => {
    const c = st.chars[who];
    return who !== st.actor && c.at === at && !c.dead && !c.onRoad && !c.flying && c.items.some(i => i.kind === 'treasure' && i.id === id && i.active && !i.destroyed);
});
const WEEK_COLORS = [['White', 'Black'], ['Grey'], ['Purple'], ['Gold']];            // day 7, 14, 21, 28 (and again for a longer game)
export const isMagicDay = day => day > 0 && day % 7 === 0;
// Day 7 gives White and Black in a one-month game; in a game of several months it alternates, White in the first month, Black in the second, and so on (6.1.2, 10.E.2.3).
// `lastDay` is the length of the timed game; sudden death and endless games (28 here) keep the month's colours.
export const dayColors = (day, lastDay = 28) => {
    if (!isMagicDay(day)) return [];
    if (lastDay > 28 && day % 28 === 7) return [Math.floor((day - 1) / 28) % 2 === 0 ? 'White' : 'Black'];
    return WEEK_COLORS[((day / 7) - 1) % 4];
};
// The next day on or after `from` that fills the land with `color`, or null when it never will in a game of `lastDay` days.
export function nextDayWith(color, from, lastDay = 28) {
    for (let d = from; d <= lastDay; d++) if (dayColors(d, lastDay).includes(color)) return d;
    return null;
}
// Every colour present in a clearing, with where it comes from: [{ color, why }].
// `road`: the colours that reach a roadway running into that clearing (4.6.2e.2): the day's colour and an enchanted tile's, but not the Chapel's, the Toadstool Circle's
// or an Enchanted card's ("color magic from these sources does not extend into the surrounding roadways").
export function colorSources(st, data, clearing, { road = false } = {}) {
    const out = dayColors(st.day, st.lastDay ?? 28).map(color => ({ color, why: `day ${st.day} fills the land with magic`, calendar: true }));
    if (road) return out.concat(tileSources(st, data, clearing));
    if (st.dwellings.some(d => d.kind === 'Chapel' && d.at === clearing)) out.push({ color: 'White', why: 'the Chapel in this clearing' });
    // the Cloven Hoof (Treasures 5): once face up it is a source of Black magic for everyone in its clearing (the hero's clearing when he carries it, active)
    if (clearing && ((clearing === st.ch.at && st.ch.items.some(i => i.kind === 'treasure' && i.id === 'cloven-hoof' && i.active && !i.destroyed))
        || hoofCarriedNear(st, clearing) || (st.order?.length > 1 && (st.abandoned?.[clearing] ?? []).some(i => i.kind === 'treasure' && i.id === 'cloven-hoof' && !i.destroyed)))) out.push({ color: 'Black', why: 'the Cloven Hoof in this clearing' });
    // the other four Enchanted cards (4.6.2b: one card for each colour; "always supplies an unlimited supply of this color to everyone in its clearing, even when it is being
    // carried by someone else"): a card that is switched on in a hand in the clearing is face up under every reading of 4.6.2b.1 (ruling S1), so it supplies its colour. The same
    // reach as the Hoof's: the hero's own card, or another character's active card in the same clearing (not on a road, not in the air).
    for (const [id, color] of Object.entries(CARD_COLOR)) if (clearing && (clearing === st.ch.at && st.ch.items.some(i => i.kind === 'treasure' && i.id === id && i.active && !i.destroyed) || cardCarriedNear(st, clearing, id)))
        out.push({ color, why: `the ${data.treasures?.[id]?.name ?? id} in this clearing` });
    return out.concat(tileSources(st, data, clearing));
}
// an enchanted tile: each of its clearings carries the colours printed on that side (4.6.2)
function tileSources(st, data, clearing) {
    const out = [], p = clearing ? st.placements.find(x => x.id === tileOf(clearing)) : null;
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
    st.discSides = 1;          // from the first flip on, discovered paths are kept by side (party.js keepDiscoveriesBySide)
    p.side = p.side === 'enchanted' ? 'normal' : 'enchanted';
    (st.tileFlips ??= []).push({ tile, day: st.day, to: p.side });
    return p.side;
}
// The ways he can enchant the tile he stands on with a ready Magic chit of Type I to V whose colour of magic is present in his clearing
// (from the land, a Chapel, the tile itself, or one of his own enchanted chits of that colour, which is then used up). [{ chit, tile, supply }]
export function tileEnchantOptions(st, data, at = st.ch.at) {              // `at`: a companion (Phantasm) enchants where it stands
    if ((at === st.ch.at && st.ch.onRoad) || !at) return [];
    const here = colorsAt(st, data, at), tile = tileOf(at), out = [];
    for (const chit of enchantableChits(st)) {
        const color = TYPE_COLOR[chit.numeral];
        if (here.has(color)) out.push({ kind: 'tile', chit: chit.id, tile, supply: null, numeral: chit.numeral, time: chit.time, effort: chit.effort, color });
        else { const own = colorChits(st, color)[0]; if (own) out.push({ kind: 'tile', chit: chit.id, tile, supply: own.id, numeral: chit.numeral, time: chit.time, effort: chit.effort, color }); }
    }
    return out;
}
