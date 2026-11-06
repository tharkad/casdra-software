// What the screens say about the spells of the hero on screen, as facts (Phase 3 round 7): the spells in force, what a held Phase spell can do now, what an energize can wake, what a Fly activity
// would use. A screen words them (app/ui/spellwhy.js); nothing here is a sentence. `mine`: the seats of the viewer's own player.
import { elsewhere } from './fx.js';
import { heldOptions, rearrangeLockWhy } from './phase.js';
import { energizeOptions } from './energize.js';
import { flySources, carries, canRecordFly, hasCarpet, flyTiles } from './fly.js';
import { steedSources } from '../steeds.js';
import { blockedSpells, castOptions } from './cast.js';
import { colorSources } from './colour.js';
import { tileClearings } from '../world.js';

// The spells he knows that cannot be cast now, each with the reason as a code and as a sentence (`spell`, `name`, `color`, `why`, `whyCode`): what a screen shows where he looks for the cast (notes 104, 106).
const blockedNow = (st, data) => { try { return blockedSpells(st, data).map(b => ({ spell: b.spell, name: b.name, color: b.color ?? null, why: b.why, whyCode: b.whyCode })); } catch { return []; } };

// What he could cast right now, as `castOptions` lists it (the Magic chit, the spell, its time and effort, whether it would do something useful or be quiet): the Journal's "Cast tonight" note reads it.
const castsNow = (st, data) => { try { return castOptions(st, data); } catch { return []; } };

// The Fly chits a hired native or monster holds (a held Broomstick on it, 4.6.7e.2), keyed `nat:<id>` / `mon:<id>`: `{ inUse }` while its guide is in the air. The first held one of a counter counts.
function flyChitsOf(st) {
    const out = {};
    for (const f of st.fx ?? []) {
        if (f.spell !== 'broomstick' || f.state !== 'held' || elsewhere(st, f)) continue;
        for (const t of f.targets) if (t.kind === 'nat' || t.kind === 'mon') out[`${t.kind}:${t.id}`] ??= { inUse: !!f.data?.flying };
    }
    return out;
}

// The colours of magic each clearing carries for him (colour.js `colorSources`): `day` is what the calendar gives every clearing, `at[id]` what the place itself adds ({ here } in the clearing, { road } on a roadway
// running into it, 4.6.2e.2); a clearing that adds nothing is not listed. The sources of a clearing are `[...day, ...at[id].here]`.
function colorsFact(st, data) {
    const day = colorSources(st, data, null).filter(x => x.calendar), at = {};
    for (const p of st.placements) for (const id of tileClearings(st, data, p.id)) {
        const here = colorSources(st, data, id).filter(x => !x.calendar), road = colorSources(st, data, id, { road: true }).filter(x => !x.calendar);
        if (here.length || road.length) at[id] = { here, road };
    }
    return { day, at };
}

export function spellFacts(st, data, mine) {
    const live = (st.fx ?? []).filter(f => f.state !== 'done' && (!f.who || mine.has(f.who)));
    const held = (st.fx ?? []).filter(f => f.dur === 'phase' && f.state === 'held' && !elsewhere(st, f));
    const cause = st.ch.onRoad ? 'road' : st.ch.flying ? 'air' : st.ch.morph ? 'creature' : st.ch.mist ? 'mist' : 'other';
    return {
        fx: live,
        held: heldOptions(st, data),
        heldLock: held.length && !heldOptions(st, data).length ? { spells: [...new Set(held.map(f => f.spell))], cause, why: rearrangeLockWhy(st) } : null,
        energize: energizeOptions(st, data),
        blocked: blockedNow(st, data),
        // `sources` each say whether they `carry` him (7.3.3a.2); `canRecord` is whether he may record a Fly phase (6.2.1a); `carpet` that he owns a Flying Carpet; `tiles` where a Fly phase may take him (7.3.3a.1);
        // `rides` the steeds he could ride now (7.3.3g); `chits` the Fly chits his hirelings hold.
        fly: { sources: flySources(st, data).map(s => ({ ...s, carries: carries(st, s) })), holdsBroomstick: (st.fx ?? []).some(f => f.spell === 'broomstick' && (f.state === 'held' || f.state === 'live') && !elsewhere(st, f)),
            canRecord: canRecordFly(st, data), carpet: hasCarpet(st), tiles: flyTiles(st, data), rides: steedSources(st, data), chits: flyChitsOf(st) },
        casts: castsNow(st, data),
        colors: colorsFact(st, data),
    };
}
