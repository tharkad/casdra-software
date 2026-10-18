import { say } from './core.js';
import { hasCurse } from './effects.js';
import { meetingOutcome, drinksCost } from './meeting.js';
import { targetGone } from './magic/fx.js';
import { isCave } from './world.js';

// The Hire activity (rules digest 05 section 4.5). He pays a native group to join him for 14 days.
// Simplification noted in docs: a hired leader follows like any other hireling instead of taking his own turn.

// How a native group stands with him for hiring: a group pacified by his Persuade spell is Friendly at least (the card: "to hire them, he uses the Friendly column").
export function relFor(st, g) {
    const rel = st.ch.rel?.[g] ?? 0;
    return (st.fx ?? []).some(f => f.state === 'live' && f.spell === 'persuade' && f.data?.group === g) ? Math.max(rel, 1) : rel;
}

// A hireling is the acting character's own (hiredBy says whose; a state that predates it, or a test that set `hired` by hand, has only one hirer).
const mineOf = (st, o) => (o.hiredBy ?? st.ch.id) === st.ch.id;
const individual = (data, g) => data.groups[g].hireMode === 'individual';
// Hiring order inside Order and Rogues: highest number first, the leader last.
const hireRank = (data, n) => { const r = data.natives[n.id].rank; return r === 'HQ' ? -1 : Number(r); };

export function hireOptions(st, data) {
    const here = st.ch.at, out = [];
    // Natives already in his pay may be hired again: another 14 days.
    for (const g of Object.values(data.groups)) {
        let mine = st.nats.filter(n => !n.dead && n.hired && mineOf(st, n) && n.loc?.c === here && data.natives[n.id].group === g.id);
        // Order and Rogues are hired, and so extended, one native per Hire phase (7.7.1a.1, 7.7.1d): the one whose term ends soonest, in hiring order.
        if (individual(data, g.id) && mine.length > 1) mine = [mine.sort((a, b) => a.hiredUntil - b.hiredUntil || hireRank(data, b) - hireRank(data, a))[0]];
        if (mine.length) out.push({ group: g.id, rehire: true, members: mine.map(m => m.id), names: mine.map(m => data.natives[m.id].name), wage: mine.reduce((s, m) => s + data.natives[m.id].wage, 0) });
    }
    // Monsters a spell has pacified (Deal with Goblins) may be hired too, a kind at a time, at the Neutral column: the wage is their Notoriety bounty (7.7.2, per card).
    const calm = st.mons.filter(m => !m.dead && !m.hired && m.pacify?.length && m.loc?.c === here), kinds = [...new Set(calm.map(m => data.monsters[m.id].name))];
    for (const name of kinds) {
        const members = calm.filter(m => data.monsters[m.id].name === name);
        out.push({ group: name, monsters: true, members: members.map(m => m.id), names: members.map(() => name), wage: members.reduce((s, m) => s + (data.monsters[m.id].notoriety || 1), 0) });
    }
    for (const g of Object.values(data.groups)) {
        let members = st.nats.filter(n => !n.dead && !n.hired && n.loc?.c === here && data.natives[n.id].group === g.id);
        if (!members.length) continue;
        if (individual(data, g.id)) {
            // one at a time, highest number first, the leader last
            members = [members.sort((a, b) => hireRank(data, b) - hireRank(data, a))[0]];
        }
        out.push({ group: g.id, members: members.map(m => m.id), names: members.map(m => data.natives[m.id].name), wage: members.reduce((s, m) => s + data.natives[m.id].wage, 0) });
    }
    return out;
}

export function beginHire(st, data) {
    if (hasCurse(st, 'Ashes')) return false;
    const opts = hireOptions(st, data);
    if (!opts.length) return false;
    st.pending = { type: 'hire', options: opts };
    return true;
}

// Returns a string when the Hire phase is over, or undefined when a decision is pending.
export function hireAction(st, data, p, a) {
    if (p.type === 'hire-offer') {
        if (p.insult) {
            if (a.act === 'pay' && !(p.insult === 'Challenge' && hasCurse(st, 'Disgust'))) { if (p.insult === 'Insult') st.ch.notoriety -= 5; else st.ch.fame -= 5; return `You pay to smooth things over; the ${p.group} will not deal.`; }
            st.turn.blocked = true; st.turn.forceBlock = true; st.ch.hidden = false;
            return `The ${p.group} block you.`;
        }
        if (a.act === 'accept' && a.boon) {
            // Free, as a boon (7.6.5e): the group drops a level until he buys it back from their leader.
            if (!p.boon) throw new Error('that is not a boon');
            if (p.rehire) { for (const id of p.members) { const n = st.nats.find(x => x.id === id); n.hiredUntil += 14; } }
            else hire(st, data, p.members, p.group);
            st.ch.rel[p.group] = Math.max(-2, (st.ch.rel[p.group] ?? 0) - 1);
            (st.ch.boons ??= []).push({ group: p.group, price: p.wage, what: p.names.join(', '), day: st.day });
            say(st, `${p.names.join(', ')} join you as a favour. They think a little less of you until you win it back.`, 'trade');
            return `${p.names.join(', ')} join you free.`;
        }
        if (a.act === 'accept') {
            if (st.ch.gold < p.price) throw new Error('not enough gold');
            st.ch.gold -= p.price;
            if (p.rehire) { for (const id of p.members) { const n = st.nats.find(x => x.id === id); n.hiredUntil += 14; } say(st, `You extend the hire of ${p.names.join(', ')} by 14 days, paying ${p.price} gold.`, 'trade'); return `You extend the hire of ${p.names.join(', ')} for ${p.price} gold.`; }
            if (p.monsters) hireMonsters(st, data, p.members, p.price); else hire(st, data, p.members, p.group, p.price);
            return `You hire ${p.names.join(', ')} for ${p.price} gold.`;
        }
        return 'You decide not to hire anyone.';
    }
    if (a.act === 'cancel') return 'You decide not to hire anyone.';
    const opt = p.options.find(o => o.group === a.group && !!o.rehire === !!a.rehire);
    if (!opt) throw new Error('no such group here');
    const g = opt.group;
    // Drinks (7.6.5b / 7.7.1b): paid for everyone of the group in his clearing, hired or not, even if he hires only one.
    let drinks = false;
    if (a.drinks && !opt.monsters) {
        if (hasCurse(st, 'Ashes')) throw new Error('Your gold is worthless under the Ashes curse.');
        const cost = drinksCost(st, data, g);
        if (st.ch.gold < cost) throw new Error('not enough gold');
        st.ch.gold -= cost; drinks = true;
        say(st, `You buy drinks for the ${g} (${cost} gold): they warm to you.`, 'trade');
    }
    const { res, r, note, rolls } = meetingOutcome(st, opt.monsters ? 0 : relFor(st, g) + (drinks ? 1 : 0), `Meeting roll: hiring ${opt.monsters ? `the ${g} (the Neutral column)` : `from the ${g}`}`, data, false, 'hire');
    const why = `${drinks ? 'Drinks; ' : ''}${note}rolled ${r.dice.join('+')}: ${res}`;
    if (res.startsWith('Price')) {
        const mult = Number(res.split('x')[1]);
        st.pending = { type: 'hire-offer', group: g, members: opt.members, names: opt.names, wage: opt.wage, mult, price: opt.wage * mult, why, rehire: !!opt.rehire, monsters: !!opt.monsters, rollIds: rolls, affordable: st.ch.gold >= opt.wage * mult };
        return undefined;
    }
    if (res === 'Boon') {
        st.pending = { type: 'hire-offer', group: g, members: opt.members, names: opt.names, wage: opt.wage, mult: 1, price: opt.wage, boon: true, why, rehire: !!opt.rehire, rollIds: rolls, affordable: st.ch.gold >= opt.wage };
        return undefined;
    }
    if (res === 'No deal') { say(st, `No deal with the ${g} (${why}).`, 'trade'); return `The ${g} will not hire out.`; }
    if (res === 'Insult' || res === 'Challenge') { st.pending = { type: 'hire-offer', group: g, insult: res, why, rollIds: rolls }; return undefined; }
    st.turn.blocked = true; st.turn.forceBlock = true; st.ch.hidden = false;
    say(st, `The ${g} block you (${why}).`, 'block');
    return `The ${g} block you (${why}).`;
}

// Monsters hired from a pacifying spell (Deal with Goblins): underlings for 14 days that follow him and fight for him (7.7.2). Hired, they no longer depend on the spell.
function hireMonsters(st, data, ids, paid) {
    for (const id of ids) {
        const m = st.mons.find(x => x.id === id);
        m.hired = true; m.hiredBy = st.ch.id; m.hiredUntil = st.day + 13; m.loc = { c: st.ch.at }; m.pacify = null; m.tie = { kind: 'hire' };
        targetGone(st, data, { kind: 'mon', id });
    }
    say(st, `You hire ${ids.map(i => data.monsters[i].name).join(', ')} for 14 days, paying ${paid} gold.`, 'trade');
}

function hire(st, data, ids, group, paid) {
    for (const id of ids) {
        const n = st.nats.find(x => x.id === id);
        n.hired = true; n.hiredBy = st.ch.id; n.hiredUntil = st.day + 13; n.hiredDay = st.day; n.loc = { c: st.ch.at };
    }
    say(st, `You hire ${ids.map(i => data.natives[i].name).join(', ')} of the ${group} for 14 days, paying ${paid} gold.`, 'trade');
}

// Hirelings follow him wherever he goes, except natives hired today: they cannot follow until the next Birdsong (7.11.3), so a Move later in
// the day leaves them where he hired them. On a later day they are with him again (they catch up; a hireling is never lost by being left behind).
// Rule 2.3.3b: a native horse is removed from the map while its rider is in a cave, and hired natives follow the same rule. So a hireling
// is off the map (no clearing) while he is in a cave, and is with him again on the first clearing outside.
export function followHero(st, data) {
    const inCave = !!st.ch.at && isCave(st, data, st.ch.at);
    for (const n of st.nats) if (n.hired && mineOf(st, n) && !n.dead && n.hiredDay !== st.day) n.loc = inCave ? null : { c: st.ch.at };
    for (const m of st.mons) if (m.hired && mineOf(st, m) && !m.dead) m.loc = { c: st.ch.at };       // monsters under a Control spell, or hired
}

export function expireHires(st, data) {
    for (const n of st.nats) {
        if (n.hired && (st.day >= n.hiredUntil || (st.ch.dead && mineOf(st, n)))) {
            n.hired = false; delete n.hiredBy;
            say(st, `${data.natives[n.id].name}'s term of hire ends.`, 'trade');
        }
    }
    for (const m of st.mons) {
        if (m.hired && m.hiredUntil != null && (st.day >= m.hiredUntil || (st.ch.dead && mineOf(st, m)))) {
            m.hired = false; delete m.hiredBy; m.hiredUntil = null; m.tie = null;
            say(st, `The ${data.monsters[m.id].name}'s term of hire ends.`, 'trade');
        }
    }
}
export function hirelings(st) { return st.nats.filter(n => n.hired && !n.dead && mineOf(st, n)); }
// Monsters that fight for him: controlled by a spell, or hired from a pacified kind.
export function monsterHires(st) { return st.mons.filter(m => m.hired && !m.dead && mineOf(st, m)); }
