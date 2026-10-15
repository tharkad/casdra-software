import { roll2, say, noteRoll } from './core.js';

// Curses and the Power of the Pit (tables in data/src/tables.json; effects as RealmSpeak and digest 04 describe them).
export function hasCurse(st, name) { return (st.ch.curses ?? []).includes(name); }

export function rollCurse(st, data) {
    const r = roll2(st);
    const row = data.tables.curses.rows[String(r.value)];
    noteRoll(st, 'Curse', r.dice, r.value, row.name);
    const ch = st.ch;
    ch.curses ??= [];
    if (!ch.curses.includes(row.name)) ch.curses.push(row.name);
    if (row.name === 'Squeak') ch.hidden = false;
    if (row.name === 'Wither') for (const c of ch.chits) if (c.state === 'active' && c.effort > 0) c.state = 'fatigued';
    st.findSeq = (st.findSeq ?? 0) + 1;
    (st.finds ??= []).push({ n: st.findSeq, day: st.day, kind: 'curse', name: row.name, effect: row.effect });
    if (st.finds.length > 40) st.finds.shift();
    say(st, `A curse falls on you: ${row.name}. ${row.effect}`, 'curse');
    return row.name;
}

// Called at Midnight: a Chapel's clearing lifts curses.
export function liftCursesAtChapel(st) {
    if (!st.ch.curses?.length) return;
    if (st.dwellings.some(d => d.kind === 'Chapel' && d.at === st.ch.at)) { say(st, 'The Chapel lifts your curses.', 'curse'); st.ch.curses = []; }
}

export function pit(st, data, why = 'The Pit') {
    const r = roll2(st);
    const row = data.tables.powerOfThePit.rows[String(r.value)];
    noteRoll(st, 'Power of the Pit', r.dice, r.value, row.name);
    say(st, `${why}: ${row.name} (rolled ${r.dice.join('+')}). ${row.effect}`, 'combat');
    const ch = st.ch;
    switch (row.name) {
        case 'Fiery Chasm': if (!ch.hidden) ch.dead = true; break;
        case 'Carried Away': ch.dead = true; break;
        case 'Terror':
            for (const c of ch.chits) if (c.state !== 'wounded' && (c.strength === 'L' || c.strength === 'M') && c.type !== 'magic') c.state = 'wounded';
            break;
        case 'Blight': for (const c of ch.chits) if (c.state === 'active' && c.effort > 0) c.state = 'wounded'; break;
        case 'Rust':
            for (const it of ch.items) if (it.kind === 'armor' && it.active && !it.destroyed) { if (it.damaged) { it.destroyed = true; it.active = false; } else it.damaged = true; }
            break;
        default: break;
    }
    if (!ch.dead && ch.chits.every(c => c.state === 'wounded')) ch.dead = true;
    return row.name;
}
