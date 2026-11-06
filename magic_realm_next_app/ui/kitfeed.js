// kitfeed.js: the Kit sheet's door to the facts of the view (docs/engine-api/CONTRACT.md section 9), next to combat/feed.js (which it uses). Each function finds, in the view the API returned for the hero on
// screen, the fact a Kit screen asked for; none knows a rule. `st` may be the state, a fight model or a table model, as in feed.js. (Phase 3 round 13: kitfacts.js in the engine makes these facts.)
import { viewOf, dataOf } from './combat/feed.js';

const NONE = { capacity: 0, level: 0, packed: [], drops: [], blocked: {}, committed: {}, roadLock: null };
/** His belongings now (view.me.gear): `capacity`, `level`, `packed`, `drops`, `blocked`, `committed`, `roadLock`. */
export const gearOf = (st, data, who) => viewOf(st, data, who).me?.gear ?? NONE;
/** Where a spell's magic can come from (view.me.colors): `here` (colours present in his clearing), `chits` (colours of his enchanted Magic chits); null when the engine could not tell. */
export const colorsOf = (st, data, who) => viewOf(st, data, who).me?.colors ?? null;
/** The mission and campaign chits he carries (view.me.tasks.carried), with days left and, for a campaign, the foes left. [] for a game without them. */
export const carriedOf = (st, data, who) => viewOf(st, data, who).me?.tasks?.carried ?? [];
/** How a native group stands with the hero on screen (view.me.tasks.rel): his own level, a foe of the campaign he carries always an Enemy. `data` may be left out for a state already viewed. */
export function relationOf(st, group, data = dataOf(st), who) {
    const v = data ? viewOf(st, data, who).me : null;
    return v?.tasks?.rel?.[group] ?? 0;
}
/** Where the dwelling of this kind stands (the Inn, the House, the Chapel, the Guard house): its clearing id, or null. From the public table (view.table.map.dwellings). */
export const dwellingAt = (st, data, kind) => viewOf(st, data).table.map.dwellings.find(d => d.kind === kind)?.at ?? null;
