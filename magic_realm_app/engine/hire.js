import { die, roll2, say } from './core.js';
import { meetingResult } from './tables.js';
import { hasCurse } from './effects.js';

// The Hire activity (rules digest 05 section 4.5). He pays a native group to join him for 14 days.
// Simplification noted in docs: a hired leader follows like any other hireling instead of taking his own turn.

const individual = (data, g) => data.groups[g].hireMode === 'individual';

export function hireOptions(st, data) {
    const here = st.ch.at, out = [];
    // Natives already in his pay may be hired again: another 14 days.
    for (const g of Object.values(data.groups)) {
        const mine = st.nats.filter(n => !n.dead && n.hired && n.loc?.c === here && data.natives[n.id].group === g.id);
        if (mine.length) out.push({ group: g.id, rehire: true, members: mine.map(m => m.id), names: mine.map(m => data.natives[m.id].name), wage: mine.reduce((s, m) => s + data.natives[m.id].wage, 0) });
    }
    for (const g of Object.values(data.groups)) {
        let members = st.nats.filter(n => !n.dead && !n.hired && n.loc?.c === here && data.natives[n.id].group === g.id);
        if (!members.length) continue;
        if (individual(data, g.id)) {
            // one at a time, highest number first, the leader last
            const rank = n => { const r = data.natives[n.id].rank; return r === 'HQ' ? -1 : Number(r); };
            members = [members.sort((a, b) => rank(b) - rank(a))[0]];
        }
        out.push({ group: g.id, members: members.map(m => m.id), names: members.map(m => data.natives[m.id].name), wage: members.reduce((s, m) => s + data.natives[m.id].wage, 0) });
    }
    return out;
}

export function beginHire(st, data) {
    if ((st.ch.curses ?? []).includes('Ashes')) return false;
    const opts = hireOptions(st, data);
    if (!opts.length) return false;
    st.pending = { type: 'hire', options: opts };
    return true;
}

function roll(st) {
    if (st.ch.id === 'black-knight') { const d = die(st); return { dice: [d], value: d }; }
    return roll2(st);
}

// Returns a string when the Hire phase is over, or undefined when a decision is pending.
export function hireAction(st, data, p, a) {
    if (p.type === 'hire-offer') {
        if (p.insult) {
            if (a.act === 'pay' && !(p.insult === 'Challenge' && hasCurse(st, 'Disgust'))) { if (p.insult === 'Insult') st.ch.notoriety -= 5; else st.ch.fame -= 5; return `You pay to smooth things over; the ${p.group} will not deal.`; }
            st.turn.blocked = true; st.turn.forceBlock = true; st.ch.hidden = false;
            return `The ${p.group} block you.`;
        }
        if (a.act === 'accept') {
            if (st.ch.gold < p.price) throw new Error('not enough gold');
            st.ch.gold -= p.price;
            if (p.rehire) { for (const id of p.members) { const n = st.nats.find(x => x.id === id); n.hiredUntil += 14; } say(st, `You extend the hire of ${p.names.join(', ')} by 14 days.`, 'trade'); return `You extend the hire of ${p.names.join(', ')} for ${p.price} gold.`; }
            hire(st, data, p.members, p.group);
            return `You hire ${p.names.join(', ')} for ${p.price} gold.`;
        }
        return 'You decide not to hire anyone.';
    }
    if (a.act === 'cancel') return 'You decide not to hire anyone.';
    const opt = p.options.find(o => o.group === a.group && !!o.rehire === !!a.rehire);
    if (!opt) throw new Error('no such group here');
    const g = opt.group;
    let col = st.ch.rel?.[g] ?? 0, r = roll(st), res = meetingResult(col, r.value), note = '';
    for (let guard = 0; guard < 6; guard++) {
        if (res === 'Trouble') { r = roll(st); note += 'Trouble; '; col = -1; res = meetingResult(col, r.value); }
        else if (res === 'Opportunity') { r = roll(st); note += 'Opportunity; '; col = Math.min(2, col + 1); res = meetingResult(col, r.value); }
        else break;
    }
    if (res === 'Trouble' || res === 'Opportunity') res = 'No deal';
    const why = `${note}rolled ${r.dice.join('+')}: ${res}`;
    if (res.startsWith('Price')) {
        const mult = Number(res.split('x')[1]);
        st.pending = { type: 'hire-offer', group: g, members: opt.members, names: opt.names, wage: opt.wage, mult, price: opt.wage * mult, why, rehire: !!opt.rehire, affordable: st.ch.gold >= opt.wage * mult };
        return undefined;
    }
    if (res === 'Boon') {
        if (opt.rehire) { for (const id of opt.members) { const n = st.nats.find(x => x.id === id); n.hiredUntil += 14; } }
        else hire(st, data, opt.members, g);
        st.ch.rel[g] = Math.max(-2, (st.ch.rel[g] ?? 0) - 1);
        say(st, `The ${g} join you as a boon; they think a little less of you for it.`, 'trade');
        return `${opt.names.join(', ')} join you free.`;
    }
    if (res === 'No deal') { say(st, `No deal with the ${g} (${why}).`, 'trade'); return `The ${g} will not hire out.`; }
    if (res === 'Insult' || res === 'Challenge') { st.pending = { type: 'hire-offer', group: g, insult: res, why }; return undefined; }
    st.turn.blocked = true; st.turn.forceBlock = true; st.ch.hidden = false;
    say(st, `The ${g} block you (${why}).`, 'block');
    return `The ${g} block you.`;
}

function hire(st, data, ids, group) {
    for (const id of ids) {
        const n = st.nats.find(x => x.id === id);
        n.hired = true; n.hiredUntil = st.day + 13; n.loc = { c: st.ch.at };
    }
    say(st, `You hire ${ids.map(i => data.natives[i].name).join(', ')} of the ${group} for 14 days.`, 'trade');
}

// Hirelings follow him wherever he goes.
export function followHero(st) {
    for (const n of st.nats) if (n.hired && !n.dead) n.loc = { c: st.ch.at };
}

export function expireHires(st, data) {
    for (const n of st.nats) {
        if (n.hired && (st.day >= n.hiredUntil || st.ch.dead)) {
            n.hired = false;
            say(st, `${data.natives[n.id].name}'s term of hire ends.`, 'trade');
        }
    }
}
export function hirelings(st) { return st.nats.filter(n => n.hired && !n.dead); }
