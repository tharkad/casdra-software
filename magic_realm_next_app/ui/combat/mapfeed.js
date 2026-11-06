// combat/mapfeed.js: the map and magic facts the play screens read, found in what the API returned (docs/engine-api/CONTRACT.md section 9; Phase 3 round 13). Same door as feed.js: `view` for what lies on
// the table and on the hero's own sheet. Nothing here knows a rule: each function only finds, in the view, the answer a screen used to get by calling the engine's map functions (world.js, spells.js,
// magic/fly.js, steeds.js) with the state. The names and the shape of the answers are those functions', so a screen changes its import and nothing else.
import { viewOf, magicOf } from './feed.js';

const table = (st, data, who) => viewOf(st, data, who).table.map;
const roads = (st, data, who) => viewOf(st, data, who).me?.roads ?? { out: {}, found: [], foundTurned: [] };

/** The kind of a clearing on the side of its tile that is up: 'woods', 'cave' or 'mountain' (view.table.map.clearings). */
export const clearingKind = (st, data, id) => table(st, data).clearings[id];
export const isCave = (st, data, id) => clearingKind(st, data, id) === 'cave';
export const isMountain = (st, data, id) => clearingKind(st, data, id) === 'mountain';
/** The clearings of a tile, in their order (view.table.map.clearings). */
export const tileClearings = (st, data, tile) => Object.keys(table(st, data).clearings).filter(id => id.slice(0, 2) === tile);
/** The roads leaving a clearing and whether he may walk each: [{ to, kind, bridge, usable }] (view.me.roads.out). */
export const roadsFrom = (st, data, id) => roads(st, data).out[id] ?? [];
/** The hidden paths and secret passages he has discovered on the side of each tile that is up, as sorted pairs ("BL4~BL5"); `flip`: as the map shows with every tile turned over (view.me.roads). */
export const foundPaths = (st, data, flip = false) => new Set(flip ? roads(st, data).foundTurned : roads(st, data).found);
/** The colours of magic in a clearing, with where each comes from: [{ color, why, calendar? }]. `road`: on a roadway running into it (4.6.2e.2). From view.me.magic.colors. */
export function colorSources(st, data, id, { road = false } = {}) {
    const c = magicOf(st, data).colors ?? { day: [], at: {} };
    return [...c.day, ...(c.at[id]?.[road ? 'road' : 'here'] ?? [])];
}
/** What he could cast right now (view.me.magic.casts): [{ spell, name, chit, effort, time, useful, quiet ... }]. */
export const castsNow = (st, data) => magicOf(st, data).casts ?? [];
/** What a Fly phase could use and where it could go (view.me.magic.fly): `sources` (each with whether it `carries` him), `canRecord`, `carpet`, `tiles`, `rides`, `chits`. */
export const flyFacts = (st, data) => ({ sources: [], holdsBroomstick: false, canRecord: false, carpet: false, tiles: [], rides: [], chits: {}, ...magicOf(st, data).fly });
