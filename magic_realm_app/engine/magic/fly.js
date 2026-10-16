import { die, lvl, say, noteRoll } from '../core.js';
import { tileClearings, numOf, tileOf, isCave, tileName, nameOfClearing } from '../world.js';
import { abandon, weightOf, nameOf } from '../items.js';
import { followHero } from '../hire.js';
import { fxList, expireFx, HERO } from './fx.js';
import { adjacentTiles } from './util.js';

// Flying (rules 7.3.3, 8.3.8e, 7.12.2d; docs/design/magic/02-day-spells.md section 8; RealmSpeak `CharacterWrapper.java` getFlyStrengthChits / land / mustFly and
// `ActionRow.java` doFlyAction, read as a behaviour oracle). Written for the hero; a second character will need `st.chars` first.
//
// The model. The hero is in the air when `st.ch.flying = { tile, by }` (`by`: 'fly' a Fly phase or a Fly chit played in the Encounter step, 'wind' Hurricane Winds). While
// he is up, `st.ch.at` is still the clearing he took off from (the map code and the invariants want a real clearing there); nothing reads it as his place, because the only
// moments he can be seen in the air are between two Fly phases of one turn and, after Hurricane Winds or a flight out of a fight, between the evening and the next Birdsong.
//   - a Fly phase (plan act `fly`, `to` a tile) takes him to the tile he is over or any tile next to it; he is unhidden at once; items heavier than the Fly chit and every
//     horse are left in the clearing he takes off from (a flight already under way drops nothing more); the Fly chit he used is spent (the spell ends);
//   - a Fly phase that follows another Fly phase needs no chit of its own: he is already in the air (RealmSpeak `canFly`);
//   - he lands before any other activity and at the end of his last phase (7.3.3b): one die, unmodified, picks the clearing of the tile he is over, rolled again for a number the
//     tile lacks (7.3.3b.1). If he lands in a cave in a Sunlight phase the sunlight phases still to come are lost (spec 8, test 4);
//   - in the air he cannot be blocked (7.12.2d), cannot cast or energize with the clearing's colours (only the tile's, energize.js fxPlaces), and cannot trade or rearrange gear.
// Fly sources: today only the Broomstick spell (a held record, Light, time 1). The Flying Carpet is a treasure with a Permanent Purple spell on it that is not built yet; when
// it is, it only has to appear in `flySources`.

export const isFlying = st => !!st.ch?.flying;

// What he can fly with now: [{ id, fx, spell, name, strength, time }]. Fly chits are records of spells (state 'held', waiting for use). A mist hero has nothing to fly with
// (a held record is not switched off by Melt into Mist like a live one, so it is refused here).
export function flySources(st, data) {
    if (st.ch.mist || st.ch.dead) return [];
    return fxList(st, { spell: 'broomstick', target: HERO, any: true }).filter(f => f.state === 'held' || f.state === 'live')
        .map(f => ({ id: `fly:${f.id}`, fx: f.id, spell: f.spell, name: 'Broomstick Fly chit', strength: f.data?.strength ?? 'L', time: f.data?.time ?? 1 }));
}
// Strong enough to carry him (7.3.3a.2): the Fly chit's strength must reach his own weight.
export const carries = (st, src) => lvl(src.strength) >= lvl(st.ch.weight);

// The tile he is over, or the tile of the clearing he stands in.
export const tileNow = st => (st.ch.flying ? st.ch.flying.tile : st.ch.at ? tileOf(st.ch.at) : null);
// Where a Fly phase may take him: the same tile or a tile next to the one he is over (7.3.3a.1).
export const flyTiles = (st, data) => { const t = tileNow(st); return t ? [t, ...adjacentTiles(st, t)] : []; };
// Where he may fly away to from a fight (8.3.8e): next to the tile of the clearing.
export const flyAwayTiles = st => (st.ch.at ? adjacentTiles(st, tileOf(st.ch.at)) : []);

// A plan's Fly phase `i`, checked as the plan is recorded: why it cannot be done, or null. `slots` is the plan so far; a flight is a run of Fly phases, and only its first
// phase needs a Fly chit (so many flights, so many chits).
export function planFlyError(st, data, slots, i) {
    const s = slots[i];
    if (!s?.to) return 'choose a tile to fly to.';
    if (st.ch.onRoad) return 'you cannot fly from a road.';
    const prior = slots.slice(0, i).filter(x => x && x.act !== 'nothing');
    const airborne = prior.at(-1)?.act === 'fly';
    if (!airborne) {
        const flights = prior.filter((x, k) => x.act === 'fly' && prior[k - 1]?.act !== 'fly').length + 1;
        const src = flySources(st, data);
        if (!src.length) return 'you have nothing to fly with.';
        if (!src.some(x => carries(st, x))) return 'you are too heavy to fly with that.';
        if (flights > src.length) return 'you have no Fly chit left for another flight.';
    }
    let cur = st.ch.at ? tileOf(st.ch.at) : null;
    for (const x of prior) { if (x.act === 'move' && x.to) cur = tileOf(x.to); else if (x.act === 'fly' && x.to) cur = x.to; }
    if (!cur || (s.to !== cur && !adjacentTiles(st, cur).includes(s.to))) return 'that tile is too far away to fly to.';
    return null;
}

// Take off from the clearing: horses and everything heavier than the Fly chit stay behind (7.3.3a.3; RealmSpeak dropNonFlyableStuff, which spares potions). Returns the items left.
export function leaveBehind(st, data, strength) {
    const left = [];
    st.ch.items = st.ch.items.filter(it => {
        if (it.destroyed) return true;
        const def = it.kind === 'treasure' ? data.treasures[it.id] : null;
        if (def?.discardTo) return true;                                                   // potions go along
        if (it.kind === 'horse' || lvl(weightOf(data, it)) > lvl(strength)) { left.push(it); return false; }
        return true;
    });
    if (left.length && st.ch.at) abandon(st, st.ch.at, left);
    return left;
}

// Into the air. `src` is the Fly chit he plays (null: he is already up and goes on flying). Returns the text.
export function startFlight(st, data, to, src, by = 'fly') {
    let text = '';
    if (src) {
        const left = leaveBehind(st, data, src.strength);
        if (left.length) text = ` You had to leave behind: ${left.map(i => nameOf(data, i)).join(', ')}.`;
        expireFx(st, data, src.fx, 'the Fly chit was used');                                // the spell ends; the Magic chit that cast it tires
    }
    st.ch.flying = { tile: to, by };
    st.ch.hidden = false;                                                                // he is unhidden the moment he flies
    return `You fly to the ${tileName(to)}.${text}`;
}

// Hurricane Winds takes the hero: his horses and belongings go with him (the card), he leaves the fight, and he lands when his next day begins.
export function blowAway(st, tile) {
    st.ch.flying = { tile, by: 'wind' };
    st.ch.hidden = false;
}

// Down (7.3.3b): one die, not modified, names the clearing of the tile he is over; a number the tile lacks is rolled again. Followers (hirelings) come down with him.
// Returns { to, cave }.
export function landHero(st, data, why = 'You land') {
    const f = st.ch.flying;
    if (!f) return null;
    const nums = tileClearings(st, data, f.tile).map(numOf);
    let n = null;
    for (let k = 0; k < 60 && !nums.includes(n); k++) {
        n = die(st);
        noteRoll(st, 'Landing', [n], n, nums.includes(n) ? `clearing ${n} of the ${tileName(f.tile)}` : `the ${tileName(f.tile)} has no clearing ${n}: roll again`);
    }
    if (!nums.includes(n)) n = Math.min(...nums);
    const to = f.tile + n;
    st.ch.flying = null; st.ch.at = to; st.ch.arrivedFrom = null;
    followHero(st);
    say(st, `${why} in ${nameOfClearing(to)}.`, 'phase');
    return { to, cave: isCave(st, data, to) };
}
