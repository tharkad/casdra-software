import { roll2, say, noteRoll } from './core.js';
import { modRoll } from './modifiers.js';
import { shielded, HERO } from './magic/fx.js';

// Curses and the Power of the Pit (tables in data/src/tables.json; effects as RealmSpeak and digest 04 describe them).

// The character a reference names. There is one hero today; `st.others` (id -> a character-shaped object) is where a second character, or a test's stand-in
// for one, lives until the game has real multi-character state (docs/design/multi-character-and-multiplayer.md).
export const charOf = (st, ref = HERO) => (!ref || ref.id === 'ch' ? st.ch : st.others?.[ref.id] ?? null);
export const charName = (st, ref) => (!ref || ref.id === 'ch' ? 'you' : st.others?.[ref.id]?.name ?? ref.id);

// A curse that a Pentangle, Protection from Magic or Melt into Mist is holding off is not in force (but comes back when the shield ends).
export function hasCurse(st, name, ref = HERO) {
    if (shielded(st, ref)) return false;
    return (charOf(st, ref)?.curses ?? []).includes(name);
}

// Rolls on the Curses Table (two dice, higher counts) and lays the result on the target. `target` and `roller` are references; the caster rolls.
// Returns the name of the curse that came up. A character who already bears that curse is not cursed twice, and a shielded one is not cursed at all.
export function rollCurse(st, data, target = HERO, roller = HERO) {
    void roller;
    const who = charOf(st, target), mine = !target || target.id === 'ch';
    if (shielded(st, target)) { say(st, `${mine ? 'You are' : `${charName(st, target)} is`} shielded from magic: the curse finds nothing to hold on to.`, 'curse'); return 'nothing (Protection from Magic)'; }
    const r = modRoll(st, data, 'curse', roll2(st));       // (Bad Luck adds one, Illusion does not apply here)
    const row = data.tables.curses.rows[String(r.value)];
    noteRoll(st, 'Curse', r.dice, r.value, row.name);
    if (shielded(st, target)) { say(st, `${mine ? 'You are' : `${charName(st, target)} is`} shielded from magic: the ${row.name} curse has no hold.`, 'curse'); return row.name; }
    who.curses ??= [];
    if (who.curses.includes(row.name)) { say(st, `${mine ? 'You already bear' : `${charName(st, target)} already bears`} the ${row.name} curse: it has no further effect.`, 'curse'); return row.name; }
    who.curses.push(row.name);
    if (row.name === 'Squeak') who.hidden = false;
    // Wither: every active chit with effort asterisks, every alerted Magic chit and every enchanted colour chit is fatigued
    if (row.name === 'Wither') for (const c of who.chits) {
        if (c.state === 'active' && (c.effort > 0 || (c.type === 'magic' && c.alerted))) { c.state = 'fatigued'; c.alerted = false; }
        else if (c.state === 'enchanted') c.state = 'fatigued';
    }
    if (mine) {
        st.findSeq = (st.findSeq ?? 0) + 1;
        (st.finds ??= []).push({ n: st.findSeq, day: st.day, kind: 'curse', name: row.name, effect: row.effect });
        if (st.finds.length > 40) st.finds.shift();
    }
    say(st, `A curse falls on ${mine ? 'you' : charName(st, target)}: ${row.name}. ${row.effect}`, 'curse');
    return row.name;
}

// Called at Midnight: a Chapel's clearing lifts curses.
export function liftCursesAtChapel(st) {
    if (!st.ch.curses?.length) return;
    if (st.dwellings.some(d => d.kind === 'Chapel' && d.at === st.ch.at)) { say(st, 'The Chapel lifts your curses.', 'curse'); st.ch.curses = []; }
}

// ---- the Power of the Pit ----
// The row that comes up (two dice, higher counts).
export function rollPit(st, data, what = 'Power of the Pit') {
    const r = modRoll(st, data, 'pit', roll2(st));
    const row = data.tables.powerOfThePit.rows[String(r.value)];
    noteRoll(st, what, r.dice, r.value, row.name);
    return { row, dice: r.dice };
}

// What a row does to a character (the hero, or a stand-in): Fiery Chasm and Carried Away kill (Chasm spares a hidden one), Terror wounds the Light and Medium
// Move and Fight chits, Blight wounds every active chit with effort, Forget tires the Magic chits that are ready, Rust damages the armor counters in use.
export function pitOnChar(st, row, ch = st.ch) {
    switch (row.name) {
        case 'Fiery Chasm': if (!ch.hidden) ch.dead = true; break;
        case 'Carried Away': ch.dead = true; break;
        case 'Terror':
            for (const c of ch.chits) if (c.state !== 'wounded' && (c.strength === 'L' || c.strength === 'M') && c.type !== 'magic') c.state = 'wounded';
            break;
        case 'Blight': for (const c of ch.chits) if (c.state === 'active' && c.effort > 0) c.state = 'wounded'; break;
        case 'Forget': for (const c of ch.chits) if (c.state === 'active' && c.type === 'magic') { c.state = 'fatigued'; c.alerted = false; } break;
        case 'Rust':
            for (const it of ch.items) if (it.kind === 'armor' && it.active && !it.destroyed) { if (it.damaged) { it.destroyed = true; it.active = false; } else it.damaged = true; }
            break;
        default: break;
    }
    if (!ch.dead && ch.chits.every(c => c.state === 'wounded')) ch.dead = true;
}

// The Pit rolled on the hero (a Demon's blow, a Pit site).
export function pit(st, data, why = 'The Pit') {
    if (shielded(st, HERO)) { say(st, `${why}: Protection from Magic turns it aside.`, 'combat'); return 'protected'; }
    const { row, dice } = rollPit(st, data, 'Power of the Pit');
    say(st, `${why}: ${row.name} (rolled ${dice.join('+')}). ${row.effect}`, 'combat');
    pitOnChar(st, row);
    return row.name;
}
