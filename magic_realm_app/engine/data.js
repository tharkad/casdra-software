import { setArtPositions } from './layout.js';

// Turns the raw JSON files (data/src/*.json, copied to app/data) into the lookups the engine uses.
const byId = (list, key = 'id') => Object.fromEntries((list ?? []).map(x => [x[key], x]));

export function indexData(raw) {
    const d = {
        tiles: raw.tiles.tiles,
        monsters: byId(raw.monsters.monsters),
        natives: byId(raw.natives.natives),
        groups: byId(raw.natives.groups),
        appearance: raw.appearance,
        setupcard: raw.setupcard,
        tables: raw.tables,
        treasures: byId(raw.treasures.treasures),
        weapons: byId(raw.weapons.weapons),
        armor: byId(raw.armor.armor),
        horses: byId(raw.horses.horses),
        characters: byId(raw.characters.characters),
        spells: byId(raw.spells?.spells),
        cardtext: raw.cardtext ?? { treasures: {}, spells: {} },
    };
    for (const n of Object.values(d.natives)) n.name = n.name.replace(/^(\w+) \1\b/, '$1');      // "Lancer Lancer 1" reads better as "Lancer 1"
    d.tile = id => d.tiles.find(t => t.id === id);
    d.artpos = raw.artpos?.tiles ?? null;
    d.pathmarks = raw.pathmarks?.tiles ?? {};
    d.chitslots = raw.chitslots?.tiles ?? null;
    setArtPositions(d.artpos, d.chitslots);
    return d;
}

export const FILES = ['tiles', 'monsters', 'natives', 'appearance', 'setupcard', 'tables', 'treasures', 'weapons', 'armor', 'horses', 'characters', 'spells', 'cardtext', 'artpos', 'chitslots', 'pathmarks'];

// Browser loader (the engine itself never fetches).
export async function loadData(base = 'data/') {
    const raw = {};
    await Promise.all(FILES.map(async f => { raw[f] = await (await fetch(`${base}${f}.json`)).json(); }));
    const d = indexData(raw);
    try { d.art = await (await fetch(`${base}../art/manifest.json`)).json(); } catch { d.art = null; }      // the pictures are optional
    return d;
}
