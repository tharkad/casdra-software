import { setArtPositions } from './layout.js';
import { fillArtGaps } from './artbook.js';

// Turns the raw JSON files (data/src/*.json, copied to app/data) into the lookups the engine uses. The engine never reads files or fetches (CONTRACT D12): the host hands the 16 tables in
// (`createApi(raw)` in api.js; the browser's loader is app/ui/dataload.js, the server's is server/engine.mjs). `extra.art` / `extra.kinds` are the optional art manifests (app/art/*.json).
const byId = (list, key = 'id') => Object.fromEntries((list ?? []).map(x => [x[key], x]));

export function indexData(raw, extra = null) {
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
        // the visitor/mission/campaign chit faces (missions.js): the four visitors, the two missions and the six campaigns, by id
        chitDefs: { visitor: byId(raw.natives.visitors), mission: byId(raw.natives.missions), campaign: byId(raw.natives.campaigns) },
    };
    for (const n of Object.values(d.natives)) n.name = n.name.replace(/^(\w+) \1\b/, '$1');      // "Lancer Lancer 1" reads better as "Lancer 1"
    d.tile = id => d.tiles.find(t => t.id === id);
    d.artpos = raw.artpos?.tiles ?? null;
    d.pathmarks = raw.pathmarks?.tiles ?? {};
    d.chitslots = raw.chitslots?.tiles ?? null;
    setArtPositions(d.artpos, d.chitslots);
    d.art = extra?.art ?? null;
    d.kinds = extra?.kinds ?? null;      // which drawn symbol a treasure or spell without a picture gets (ui/kindicons.js)
    if (d.art) fillArtGaps(d.art, d);      // a name the main art has no picture for gets the rulebook's icon (never replaces a picture we have)
    return d;
}

export const FILES = ['tiles', 'monsters', 'natives', 'appearance', 'setupcard', 'tables', 'treasures', 'weapons', 'armor', 'horses', 'characters', 'spells', 'cardtext', 'artpos', 'chitslots', 'pathmarks'];
