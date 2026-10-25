import { lvl } from './core.js';
import { activeHorse } from './items.js';
import { fxTags, HERO } from './magic/fx.js';
import { chitTime } from './rules/chitTime.js';
import { tableResult } from './rules/tableResult.js';
import { runesDiceCount } from './rules/runesDiceCount.js';

// What the treasure cards he is using do for him (digest 04 section 3.1 and the effect sections of the Treasures list).
// Only items with active === true count, and treasures are active as soon as he owns them.

const treasureIds = st => st.ch.items.filter(i => i.kind === 'treasure' && i.active && !i.destroyed).map(i => i.id);

// Cards that give one more phase restricted to one activity.
export const EXTRA = { 'magic-spectacles': 'search', 'cloak-of-mist': 'hide', 'regent-of-jewels': 'trade', 'royal-sceptre': 'hire', 'seven-league-boots': 'move' };

// The Dwarf's Short Legs: no sunlight phases at all (6.2.2b).
export const noSunlight = st => (st.ch.adv ?? []).includes('short-legs');

// `intoCave` is accepted for callers that know it, but nothing is dropped by it: the workhorse's extra Move may itself be the Move into a cave (7.3.2a.2: the horse
// is inactivated on arrival); only a day that STARTS in a cave bars the horse's extra phase (6.2.2c.1). The sunlight phases are what a cave takes away, not the extras.
export function extraActs(st, data, { startsInCave = false } = {}) {
    const out = [];
    const h = activeHorse(st), hd = h ? data.horses[h.id] : null;
    if (hd?.kind === 'workhorse' && !startsInCave) out.push('move');
    for (const id of treasureIds(st)) if (EXTRA[id]) out.push(EXTRA[id]);
    if ((st.ch.adv ?? []).includes('health')) out.push('rest');             // the White Knight's extra Rest phase
    if ((st.ch.adv ?? []).includes('robust')) out.push('rest');             // the Berserker's Robust: the same extra Rest phase
    if ((st.ch.adv ?? []).includes('elusiveness')) out.push('hide');        // the Elf's extra Hide phase
    if ((st.ch.adv ?? []).includes('stamina')) out.push('move');            // the Amazon's extra Move phase, even when riding
    if ((st.ch.adv ?? []).includes('aura-of-power')) out.push('enchant');   // the Sorcerer's extra spell (Enchant) phase
    if ((st.ch.adv ?? []).includes('magical-paraphernalia')) out.push('alert');   // the Magician's extra Alert phase (6.2.2, 7.9.3: weapon or one Magic chit)
    for (const t of fxTags(st, HERO, 'extraPhase')) out.push(t.value);       // Day and energized Permanent spells: Blend Into Background (hide), See Hidden Signs (search), Sense Danger (alert)
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

// Is this treasure card in force for him (owned and active)? Potions count only once they have been activated (8.9.2a: they are used up at Midnight).
export const hasTreasure = (st, id) => treasureIds(st).includes(id);

// 8.4.5f.2: two effort asterisks a round; the Girtle of Energy makes it three; a Potion of Energy lifts the limit altogether and takes precedence over the Girtle.
// (A large finite number, so that it survives the JSON round trip of a saved game and of the screen's options.)
export const NO_EFFORT_LIMIT = 99;
export const effortLimit = st => (hasTreasure(st, 'potion-of-energy') ? NO_EFFORT_LIMIT : hasTreasure(st, 'girtle-of-energy') ? 3 : 2);

// Treasures 6: the Draught of Speed (2 asterisks time 2, 1 asterisk 3, none 4) and the Garb of Speed (3, 4, 5) fix the time number of every action chit by its
// asterisks, the Magic chits included. A character with both takes the Draught's numbers. Returns the chit's time as it is played (the printed time when neither is
// in force). The numbers are the kernel rules/chitTime.js; this is only the glue that reads the two cards.
export function chitSpeed(st, chit) {
    return chitTime(chit.time, chit.effort ?? 0, hasTreasure(st, 'draught-of-speed'), hasTreasure(st, 'garb-of-speed'));
}

// The six tiles whose names end in "Woods" (Deep, Linden, Maple, Nut, Oak, Pine). The Deep Woods is a mountain tile for chits and climbing,
// so this goes by name, not by the tile's group.
export const isTrackingTile = (data, where) => /Woods$/.test(data.tile(where.slice(0, 2))?.name ?? '');

// The advantage that changes a Reading Runes roll: 'lore' (Wizard, Sorceror) and 'learning' (Pilgrim) roll one die, 'knowledge' (Witch, Magician) subtracts one; else 'none'.
export const runesAdvantage = st => { const adv = st.ch.adv ?? []; return ['lore', 'learning', 'knowledge'].find(k => adv.includes(k)) ?? 'none'; };

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
    if (kind === 'runes' && runesDiceCount(runesAdvantage(st), false) === 1) return true;          // Lore (Wizard, Sorceror) and Learning (Pilgrim): one die when Reading Runes (kernel rules/runesDiceCount.js)
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

// ---- modifiers to table rolls from spells (4.1.2): Illusion adds one on every Search table, Bad Luck on every table. The result stays within 1-6.
// Never the Monster Roll (4.1.3). A spell on the hero or on the tile he stands in counts while it is in force.
const SEARCH_TABLES = new Set(['peer', 'locate', 'loot', 'ground', 'sitecard', 'runes', 'magicsight']);
// The modifiers a spell puts on a table roll (Bad Luck, Illusion), without the Cloven Hoof.
export function spellMod(st, data, kind) {
    if (st.ch.dead || st.ch.mist) return 0;                      // mist is not affected by spells aimed at others (Melt into Mist)
    const who = [HERO]; if (st.ch.at) who.push({ kind: 'tile', id: st.ch.at.slice(0, 2) });
    let m = 0;
    for (const r of who) for (const { value } of fxTags(st, r, 'tableMod')) if (value.kinds === 'all' || (value.kinds === 'search' && SEARCH_TABLES.has(kind))) m += value.delta;
    return m;
}
// Cloven Hoof (Treasures 5): "Whenever a character rolls on a table while he is in the same clearing with the Cloven Hoof, he adds one to his result." The card is in his
// clearing when he carries it (it is active as soon as he owns it), when it lies on the ground there, or when another character carries it there (the roll of whoever is acting).
export function hoofHere(st) {
    const at = st.ch.at;
    if (!at || st.ch.dead) return false;
    if (hasTreasure(st, 'cloven-hoof')) return true;
    if ((st.abandoned?.[at] ?? []).some(i => i.kind === 'treasure' && i.id === 'cloven-hoof' && !i.destroyed)) return true;
    return hoofCarriedNear(st, at);
}
// Several characters: the Hoof works for everyone in its clearing, whoever carries it (4.4.2b: "whenever a character rolls on a table while he is in the same clearing with the Cloven Hoof").
// Another character's card counts while it is active in his hands and he stands in that clearing (not on a road, not in the air).
export const hoofCarriedNear = (st, at) => !!at && (st.order?.length ?? 0) > 1 && st.order.some(id => {
    const c = st.chars[id];
    return id !== st.actor && c.at === at && !c.dead && !c.onRoad && !c.flying && c.items.some(i => i.kind === 'treasure' && i.id === 'cloven-hoof' && i.active && !i.destroyed);
});
// Everything that is added to a table roll: the spells' modifiers and the Cloven Hoof's one.
export const tableMod = (st, data, kind) => spellMod(st, data, kind) + (hoofHere(st) ? 1 : 0);
// Apply it to a roll { dice, value }: the roll gets .mod (spells) and .hoof when something changed it. The sum and the 1 to 6 limit are the kernel rules/tableResult.js.
export function modRoll(st, data, kind, r) {
    const m = spellMod(st, data, kind), hoof = hoofHere(st);
    if (m || hoof) { r.value = tableResult(r.value, m, hoof); if (m) r.mod = m; if (hoof) r.hoof = true; }
    return r;
}
export const modNote = r => {
    const parts = [];
    if (r.mod) parts.push(`spell ${r.mod > 0 ? '+' : ''}${r.mod}`);
    if (r.hoof) parts.push('Cloven Hoof +1');
    if (r.know) parts.push('Knowledge -1');
    return parts.length ? ` (${parts.join(', ')})` : '';
};
