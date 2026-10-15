import { lvl } from './core.js';
import { activeHorse } from './items.js';

// What the treasure cards he is using do for him (digest 04 section 3.1 and the effect sections of the Treasures list).
// Only items with active === true count, and treasures are active as soon as he owns them.

const treasureIds = st => st.ch.items.filter(i => i.kind === 'treasure' && i.active && !i.destroyed).map(i => i.id);

// Cards that give one more phase restricted to one activity.
const EXTRA = { 'magic-spectacles': 'search', 'cloak-of-mist': 'hide', 'regent-of-jewels': 'trade', 'royal-sceptre': 'hire', 'seven-league-boots': 'move' };

export function extraActs(st, data, { startsInCave = false, intoCave = false } = {}) {
    const out = [];
    const h = activeHorse(st), hd = h ? data.horses[h.id] : null;
    if (hd?.kind === 'workhorse' && !startsInCave && !intoCave) out.push('move');
    for (const id of treasureIds(st)) if (EXTRA[id]) out.push(EXTRA[id]);
    if ((st.ch.adv ?? []).includes('health')) out.push('rest');             // the White Knight's extra Rest phase
    return out;
}

// Boots and gloves stand in for Move and Fight chits. They are never fatigued by being played.
export const BOOTS = { 'elven-slippers': ['L', 2], 'power-boots': ['H', 4], 'quick-boots': ['M', 3], 'seven-league-boots': ['T', 5], 'shoes-of-stealth': ['L', 3] };
export const GLOVES = { 'deft-gloves': ['L', 2], 'handy-gloves': ['M', 3], 'power-gauntlets': ['H', 4], 'gloves-of-strength': ['T', 5] };

export function cardChits(st, type) {
    const table = type === 'move' ? BOOTS : GLOVES;
    return st.ch.items.filter(i => i.kind === 'treasure' && i.active && !i.destroyed && table[i.id]).map(i => ({
        id: `card:${i.uid}`, type, strength: table[i.id][0], time: table[i.id][1], effort: 0, state: 'active', card: true, name: i.id,
    }));
}

export const effortLimit = st => (treasureIds(st).includes('girtle-of-energy') ? 3 : 2);

// The six tiles whose names end in "Woods" (Deep, Linden, Maple, Nut, Oak, Pine). The Deep Woods is a mountain tile for chits and climbing,
// so this goes by name, not by the tile's group.
export const isTrackingTile = (data, where) => /Woods$/.test(data.tile(where.slice(0, 2))?.name ?? '');

// Tables are normally rolled with two dice, taking the higher. Some cards let him roll one.
import { clearingType as clearingKind } from './world.js';
export function oneDie(st, kind, where = null, data = null) {
    const ids = treasureIds(st);
    if (ids.includes('lucky-charm')) return true;
    if (kind === 'loot' && ids.includes('deft-gloves')) return true;
    if (kind === 'hide' && ids.includes('shoes-of-stealth')) return true;
    // character advantages: one die on Search, Hide and Meeting tables in the Woods tiles (Woods Girl's Tracking) or in cave clearings (the Dwarf's
    // Cave Knowledge), and the Druid's Concealment on the Hide table
    const adv = st.ch.adv ?? [];
    if (where && data && (kind === 'search' || kind === 'hide' || kind === 'meeting' || kind === 'loot')) {
        if (adv.includes('tracking') && isTrackingTile(data, where)) return true;
        if (adv.includes('cave-knowledge') && clearingKind(st, data, where) === 'cave') return true;
    }
    if (kind === 'hide' && adv.includes('concealment')) return true;
    if (kind === 'runes' && adv.includes('lore')) return true;                   // the Wizard rolls one die when Reading Runes
    return false;
}

// Locate rolls are lowered by a map of the tile you are in (1 is the best roll).
export function locateMod(st, tile, data) {
    const ids = treasureIds(st);
    let m = 0;
    const group = data.tile(tile)?.id;
    if (ids.includes('map-of-ruins') && tile === 'RU') m -= 1;
    if (ids.includes('map-of-lost-city') && st.chits.some(c => c.kind === 'lost-city' && c.tile === tile)) m -= 1;
    if (ids.includes('map-of-lost-castle') && st.chits.some(c => c.kind === 'lost-castle' && c.tile === tile)) m -= 1;
    return m;
}

// A card that is really an armor or weapon counter on the Treasures list becomes that counter when picked up.
export function convertCard(data, it) {
    if (it.kind !== 'treasure') return it;
    const arm = data.armor[it.id + '-1'], wep = data.weapons[it.id + '-1'];
    if (arm?.card) { it.card = it.id; it.kind = 'armor'; it.id = it.id + '-1'; }          // remember the card it came from (Great flag, Fame reward)
    else if (wep?.card) { it.card = it.id; it.kind = 'weapon'; it.id = it.id + '-1'; }
    return it;
}
