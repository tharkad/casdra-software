import { lvl } from './core.js';
import { say } from './core.js';
import { fxTags, fxList, expireFx } from './magic/fx.js';
import { rulesOn } from './hirestate.js';

// Flying steeds and flying denizens (rules 4.6.7e.2, 7.3.3c to 7.3.3g, 7.11.6a.7, 8.4.5q).
//
// A STEED is a controlled or hired Bat or Flying Dragon that follows a character: the character can ride it and fly in Daylight (7.3.3g), using the monster's flying values (its
// strength is its weight/vulnerability, its time the move time of the face up now, 7.3.3g.3) instead of a Fly chit. A hired or controlled denizen that is under a Transform and
// has become a flier (a Dragon, an Eagle, a Bird) can be ridden too ("a transmorphized character or denizen who is following him", if its flying strength can carry him).
// Only characters ride (g.1), only Bats and Flying Dragons are rideable (g.2: not the Winged Demon, not a Dragon without wings), a transmorphized character rides only as a
// Goblin, an Ogre, an Imp or a Heavy Troll (g.4), nobody rides in a fight (8.4.5q: the Encounter step offers only Fly chits, combat.js), and when the steed stops following him
// he and it come down together (g.5: `steedReleased`, called when a hireling is let go and when a controlling spell ends).
//
// A DENIZEN WITH A FLY CHIT (4.6.7e.2, 7.3.3d.2): a Broomstick can be cast on one of the caster's Light hirelings (a hired native, or a hired or controlled monster that is Light:
// a monster under a Transform into a Bird, Squirrel or Frog). The chit is a held effect on the denizen (as it is on the hero). A hireling with a Fly chit "can use it in place of
// his own move values": the one thing a hireling does with move values in the day is follow a guide, and a follower can follow a flier only if he can fly (7.3.3a.4), so when
// the hero takes off the chits of his followers are in use, and they expire the instant he lands (4.6.7e.1). `canFlyAlong` is the question "can this hireling fly with his
// guide?" for whoever leaves the others behind (hire.js, ruling H7).
//
// The state: the hero in the air on a steed is `st.ch.flying = { tile, by, steed: <monster id> }` (magic/fly.js). Nothing else is stored; a game that never meets a flying steed
// never has the key, and a denizen's Fly chit is an ordinary effect (`st.fx`) whose `data.flying` says its owner is in the air.

const RIDDEN_FAMILIES = ['Bat', 'Dragon'];                       // 7.3.3g.2
const MORPH_RIDERS = ['Goblin', 'Ogre', 'Imp'];                  // 7.3.3g.4 (and the Heavy Troll)

const mineOf = (st, o) => (o.hiredBy ?? st.ch.id) === st.ch.id;
// Under the hireling rules (hirestate.js, leaders.js) a controlled monster is a seat of the party that FOLLOWS a guide by recording Follow (`st.follows[seat] = guide`); without them a
// hireling always goes where his hirer goes. A monster with a seat is a steed only while it follows the hero ("When a controlled Bat or Flying Dragon follows a character", 7.3.3g).
const hasSeat = (st, id) => !!st.chars?.[id]?.leader;
const followsHero = (st, id) => st.follows?.[id] === st.ch.id;
// Does this hired counter follow the acting character today? Always, without the hireling rules; with them a seat by Follow (`st.follows`), an underling by his assigned guide (`guide`).
const follows = (st, o) => !rulesOn(st) || (hasSeat(st, o.id) ? followsHero(st, o.id) : o.guide === st.ch.id);
export const followersOf = (st, id) => Object.keys(st.follows ?? {}).filter(f => st.follows[f] === id);
const monRef = id => ({ kind: 'mon', id });
const natRef = id => ({ kind: 'nat', id });

// What a hired or controlled monster is NOW as far as flying goes: the creature a Transform made of it, else itself. { name, flies, strength, time, ridable } or null.
export function flierValues(st, data, m) {
    const def = data.monsters[m.id], morph = fxTags(st, monRef(m.id), 'morph')[0]?.value ?? null;
    if (morph) return { name: morph.name, flies: !!morph.flies, strength: morph.vulnerability, time: morph.moveTime ?? 1, ridable: !!morph.flies };
    const side = def.light ?? def.dark;
    return { name: def.name, flies: !!def.flies, strength: def.vulnerability, time: side?.moveTime ?? 1, ridable: !!def.flies && RIDDEN_FAMILIES.includes(def.family) };
}
// The same for a hired native under a Transform (he flies only if the spell made him a flier).
export function nativeFlier(st, data, n) {
    const morph = fxTags(st, natRef(n.id), 'morph')[0]?.value ?? null;
    return morph ? { name: morph.name, flies: !!morph.flies, strength: morph.vulnerability, time: morph.moveTime ?? 1, ridable: !!morph.flies } : null;
}

// Why the acting character cannot ride at all just now, or null (7.3.3g.1: only characters ride; g.4: a transmorphized one only as one of four creatures).
export function ridingError(st, rider = st.ch?.leader ? { kind: st.ch.leader.kind } : { kind: 'char' }) {          // (the acting seat: a hired leader is a native, a controlled monster a monster)
    if (rider.kind !== 'char') return 'Hired and controlled denizens cannot ride monsters (7.3.3g.1).';
    if (st.ch.dead || st.ch.mist) return 'He cannot ride in this shape.';
    const cr = st.ch.morph?.creature;
    if (cr && !(MORPH_RIDERS.includes(cr.family) || (cr.family === 'Troll' && cr.size === 'H'))) return `A transmorphized character can ride flying monsters only as a Goblin, an Ogre, an Imp or a Heavy Troll, not as a ${cr.name} (7.3.3g.4).`;
    return null;
}

// The steeds he could ride now: [{ id: 'steed:<monster id>', steed: <monster id>, name, strength, time }]. A hired or controlled monster of his, alive, following him (in his clearing),
// that can fly and is a Bat or Flying Dragon (or has been transformed into any flier), and whose strength carries him.
export function steedSources(st, data, rider) {
    return ridingError(st, rider) ? [] : steedCandidates(st, data).sort((a, b) => lvl(b.strength) - lvl(a.strength));          // (the strongest first, as RealmSpeak lists them)
}
// ...whoever is in the saddle: the monsters and hirelings that could be ridden by a character who may ride.
function steedCandidates(st, data) {
    const here = st.ch.at, out = [];
    for (const m of st.mons) {
        if (!m.hired || m.dead || m.absorbed || !mineOf(st, m) || !here || m.loc?.c !== here) continue;
        if (!follows(st, m)) continue;                                                              // (under the hireling rules one that is not following him today is not his steed)
        const v = flierValues(st, data, m);
        if (!v.ridable || lvl(v.strength) < lvl(st.ch.weight)) continue;          // (the flying strength must carry him: 7.3.3g)
        out.push({ id: `steed:${m.id}`, steed: m.id, name: `${v.name}`, strength: v.strength, time: v.time });
    }
    for (const n of st.nats) {
        if (!n.hired || n.dead || !mineOf(st, n) || !here || n.loc?.c !== here || n.hiredDay === st.day || !follows(st, n)) continue;
        const v = nativeFlier(st, data, n);
        if (!v?.ridable || lvl(v.strength) < lvl(st.ch.weight)) continue;
        out.push({ id: `steed:${n.id}`, steed: n.id, name: data.natives[n.id].name, strength: v.strength, time: v.time });
    }
    return out;
}

// The Fly activity's source for this slot (day.js doFly): `slot.with` may name a Fly chit ('chit') or a steed ('steed:<id>'); otherwise a steed first (it is not used up), then a
// Fly chit. `chits` are fly.js flySources; `carries` its test. Returns { src } or { error } in the words the phase is lost with.
export function chooseSource(st, data, slot, chits, carries) {
    const rides = steedSources(st, data), rideErr = ridingError(st);
    const want = slot?.with;
    if (want && want !== 'chit') {
        const s = rides.find(r => r.id === want);
        if (!s) return { error: `You cannot ride that: it is not a flying steed that follows you and can carry you${rideErr ? ` (${rideErr})` : ''}: the phase is lost.` };
        return { src: s };
    }
    const pool = want === 'chit' ? chits : [...rides, ...chits];
    if (!pool.length) return { error: `You have nothing to fly with: the phase is lost.${rideErr && steedCandidates(st, data).length ? ` ${rideErr}` : ''}` };
    const src = pool.find(x => carries(st, x));
    if (!src) return { error: 'You are too heavy to fly with that: the phase is lost.' };
    return { src };
}

// 6.2.1a / 7.3.3a.1: does he have a steed that lets him record Fly? (Same as steedSources: the flier must be able to carry him.)
export const hasSteed = (st, data) => steedSources(st, data).length > 0;

// 7.3.3g.5: a hireling or controlled monster stops following him (let go, or the spell that held it has ended). If he is in the air on it, he and it come down together, in
// the clearing a die names (7.3.3b.1); the monster, no longer his, lands there too. `land` is fly.js landHero.
export function steedReleased(st, data, m, land) {
    const fl = st.ch.flying;
    if (!fl || fl.steed !== m.id) return null;
    const down = land(st, data, `Your steed is no longer yours: you and the ${data.monsters[m.id]?.name ?? 'steed'} come down`);
    if (down) m.loc = { c: down.to };
    return down;
}

// ---- a denizen with a Fly chit ----
// The Fly chit (a held Broomstick) a hireling holds, or null.
export const flyChitOf = (st, ref) => fxList(st, { spell: 'broomstick', target: ref, any: true }).find(f => f.state === 'held') ?? null;
// May this hireling fly with his guide? A flying monster, a hireling transformed into a flier, or a hireling with a Fly chit (7.3.3a.4, 4.6.7e.2).
export function canFlyAlong(st, data, ref) {
    if (flyChitOf(st, ref)) return true;
    if (ref.kind === 'mon') { const m = st.mons.find(x => x.id === ref.id); return !!m && flierValues(st, data, m).flies; }
    const n = st.nats.find(x => x.id === ref.id);
    return !!n && !!nativeFlier(st, data, n)?.flies;
}
// Light hirelings the hero could put a Broomstick on, for the spell's list of targets: [{ ref, label }].
export function broomstickHirelings(st, data) {
    const out = [];
    for (const n of st.nats) if (n.hired && !n.dead && mineOf(st, n) && n.loc?.c === st.ch.at && (nativeFlier(st, data, n)?.strength ?? data.natives[n.id].weight) === 'L') out.push({ ref: natRef(n.id), label: `${data.natives[n.id].name} (yours)` });
    for (const m of st.mons) if (m.hired && !m.dead && !m.absorbed && mineOf(st, m) && m.loc?.c === st.ch.at && flierValues(st, data, m).strength === 'L') out.push({ ref: monRef(m.id), label: `${data.monsters[m.id].name} (yours)` });
    return out;
}
// He takes off: the Fly chits of the followers who go up with him are in use (they expire when he lands).
export function followersTakeOff(st, data) {
    for (const f of (st.fx ?? []).filter(x => x.spell === 'broomstick' && x.state === 'held')) {
        const t = f.targets[0];
        if (!t || t.kind === 'char') continue;
        const o = (t.kind === 'mon' ? st.mons : st.nats).find(x => x.id === t.id);
        if (o?.hired && !o.dead && mineOf(st, o) && o.hiredDay !== st.day) f.data = { ...f.data, flying: true };
    }
}
// He is down: every follower's Fly chit that was in use is gone.
export function followersLand(st, data) {
    for (const f of (st.fx ?? []).filter(x => x.spell === 'broomstick' && x.data?.flying)) expireFx(st, data, f.id, 'its owner landed');
}

// ---- followers who fly along (hireling rules: a controlled monster with a seat follows its guide by Follow, 7.11.6a.5) ----
// May the follower `id` (a seat) follow a guide who flies? Only if he can fly himself (7.3.3a.4): a flying monster, a hireling transformed into a flier, a hireling with a Fly chit.
// A character who follows is not asked here (several characters in the air: not modelled; meet.js drops him).
export function canFollowFlier(st, data, id) {
    const leader = st.chars?.[id]?.leader;
    return !!leader && canFlyAlong(st, data, { kind: leader.kind, id: leader.id });
}
// The guide has landed in `to`: the followers who flew with him are there too (their seats and their counters).
export function followersLandWith(st, data, to) {
    for (const f of followersOf(st, st.ch.id)) {
        if (!canFollowFlier(st, data, f)) continue;
        const c = st.chars[f];
        c.at = to; c.arrivedFrom = null;
        const o = (c.leader.kind === 'nat' ? st.nats : st.mons).find(x => x.id === c.leader.id);
        if (o) o.loc = { c: to };
    }
}

// Hireling rules, 7.3.3a.4: the guide has landed; the underlings assigned to him who cannot fly were left behind in the clearing he took off from (`from`). (hirestate.js's follow
// has already put them with him, as it does when he walks.) They follow him no more today, as when the hirer lets them stay behind (7.7.3a).
export function leftBehindOnFlight(st, data, from) {
    if (!rulesOn(st) || !from) return;
    for (const o of [...st.nats, ...st.mons]) {
        if (!o.hired || o.dead || o.guide !== st.ch.id || !o.loc || hasSeat(st, o.id)) continue;
        if (canFlyAlong(st, data, { kind: data.natives[o.id] ? 'nat' : 'mon', id: o.id })) continue;
        o.loc = { c: from }; o.guide = null;
        say(st, `${data.natives[o.id]?.name ?? data.monsters[o.id]?.name} cannot fly: he is left behind in clearing ${from.slice(2)}.`, 'info');
    }
}
