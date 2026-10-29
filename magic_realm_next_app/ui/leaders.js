// HIRED LEADERS AND HIRELINGS, as a phone reads them (docs/rules-spec/hire-leaders-notes.md; rules 6.2.5, 6.3.1, 7.7.2, 7.7.3, 7.7.5e, 7.11.5, 8.1.2b). The game option `options.hirelingRules`
// gives every hired leader and every monster taken in hand a SEAT of his own in the party (engine/leaders.js): a sheet, an Attention chit, a plan the hirer records, a turn in the drawn
// order. The hirer's other hirelings (the UNDERLINGS) are put with a guide each morning and may be left behind (engine/hirestate.js).
// Pure functions of a game state (or a seat's redacted view of it) and the game data: no DOM, no state, so tests/leaders_ui.test.mjs runs them in node against the real engine. The words are
// in both voices ({ story, detail }): Story is plain and short, Detail names the rule. Nothing here decides a rule: the engine says whether, these functions only read and word it.
//
//   rulesOn(st)                    the game has the option
//   isSeat(ch) / seatIds(st)       a record that is a leader's (or a controlled monster's) seat, and the ones in the party
//   leaderGame(st)                 the option is on AND there is at least one seat now (what turns the leader screens on)
//   hirerOf(st, id)                the real character a seat acts for (or the character himself)
//   attentionOf(st, data, id)      { kind, no, label, short }: the Attention chit (a red numbered chit, or an unused character's chit)
//   seatName(st, id) / roleOf(st, id) / introOf(st, data, id)    the name, "Hired leader" / "Controlled monster" / "You", and the one-line words
//   planActs(pending)              the activities a leader's plan sheet offers (from `pending.leader.acts`), with the ones that only serve his followers marked
//   underlingRows(st, data, rows, memory)   the "who goes with whom" sheet's rows; defaultAssign / assignMap turn the choices into the plan's `assign`
//   followersOf(st, data, guideId) / stayHirer(st, guideId)    the underlings walking with a guide now, and whose action `stay` is
//   counterLook(o)                 how a hired counter's `side` and `hidden` look: { side, hidden, dark, red, word }
//   unattendedLines(st, day)       the log of fights a leader had where no character stood (8.1.2b)
//   seatMarkers(st, data, actor)   the map's counters for the seats of one player's party
import { WEIGHT_WORDS } from '../engine/core.js';
import { defOf, nameOf, summaryOf } from '../engine/items.js';
import { nameOfClearing } from '../engine/world.js';
import { displayName } from './names.js';

export const rulesOn = st => !!st?.options?.hirelingRules;
export const isSeat = ch => !!ch?.leader;
export const seatIds = st => (st?.order ?? []).filter(id => st.chars?.[id]?.leader);
export const realIds = st => (st?.order ?? []).filter(id => !st.chars?.[id]?.leader);
export const leaderGame = st => rulesOn(st) && seatIds(st).length > 0;
export const hirerOf = (st, id) => st.chars?.[id]?.leader?.hirer ?? id;
export const seatName = (st, id) => displayName(st.chars?.[id]?.name ?? id);

const join = list => (list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);

// ---------------------------------------------------------------------------------------------------------------------------------- the seat
export function attentionOf(st, data, id) {
    const a = st.chars?.[id]?.attention;
    if (!a) return null;
    if (a.kind === 'red') return { kind: 'red', no: a.number, label: `Red chit ${a.number}`, short: String(a.number) };
    const who = displayName(data?.characters?.[a.character]?.name ?? a.character);
    return { kind: 'character', no: null, label: `${who}’s unused chit`, short: String(who ?? '?').trim()[0]?.toUpperCase() ?? '?' };
}

/** "Hired leader" / "Controlled monster" / "You" (for a real character). */
export function roleOf(st, id) {
    const c = st.chars?.[id];
    if (!c?.leader) return 'You';
    return c.leader.kind === 'mon' ? 'Controlled monster' : 'Hired leader';
}

/** What a seat is, in one line, in both voices. */
export function introOf(st, data, id) {
    const c = st.chars?.[id];
    if (!c?.leader) return null;
    const hirer = seatName(st, c.leader.hirer), mon = c.leader.kind === 'mon', att = attentionOf(st, data, id);
    return {
        story: mon ? `${seatName(st, id)} is under your spell: you plan its day, and it acts when its chit is drawn.` : `${seatName(st, id)} works for ${hirer}: you plan his day, and he acts when his chit is drawn.`,
        detail: `${seatName(st, id)} ${mon ? 'is a controlled monster' : 'is a hired leader'} and a seat of ${hirer}’s party (6.2.5, 7.7.${mon ? '5e' : '2'}). ${att ? `${att.label}. ` : ''}${hirer} records his activities in Birdsong.`,
    };
}

/** How much he can carry: the weight of his move strength (a native's vulnerability letter, 7.3.1g). */
export const carryWord = (st, id) => WEIGHT_WORDS[st.chars?.[id]?.leader?.moveStrength] ?? null;

// ---------------------------------------------------------------------------------------------------------------------------------- the plan sheet
// The engine's `pending.leader.acts` (move hide search trade hire follow rest alert; a monster has no trade or hire) and which of them only serve his followers.
export function planActs(pending) {
    const l = pending?.leader;
    if (!l) return null;
    const only = new Set(l.recordOnly ?? []);
    return { acts: (l.acts ?? []).slice(), recordOnly: only, kind: l.kind, hirerName: l.hirerName ?? null };
}

export const PLAN_ONLY_NOTE = {
    story: 'Alert and Rest do nothing for him. They are for the ones who follow him.',
    detail: 'A leader records Alert and Rest only for the characters who follow him (6.2.5); he gets nothing from them himself. He cannot use Enchant phases.',
};
export const MONSTER_PLAN_NOTE = {
    story: 'A creature in your power cannot trade or hire.',
    detail: 'Controlled monsters cannot do Trade or Hire phases (6.2.5, 7.7.5e.1).',
};

// ---------------------------------------------------------------------------------------------------------------------------------- the underlings
/** The rows of the "who goes with whom" sheet. `rows` is `pending.underlings`; `memory` is yesterday's choice { underling id: guide id | null }. `choice` is what is picked now ('' = stays). */
export function underlingRows(st, data, rows, memory = {}, picked = {}) {
    return (rows ?? []).map(u => {
        const guides = (u.guides ?? []).map(id => ({ id, name: seatName(st, id), seat: !!st.chars?.[id]?.leader }));
        const ids = new Set(guides.map(g => g.id));
        const remembered = memory?.[u.id] && ids.has(memory[u.id]) ? memory[u.id] : null;
        const choice = u.today ? null : (u.id in picked ? picked[u.id] : remembered);
        return { ...u, guides, choice: choice ?? null, remembered, atName: u.at ? nameOfClearing(u.at) : null, locked: !!u.today || !guides.length };
    });
}
/** The plan's `assign` map: every underling that can be assigned, with his guide or null (stays where he is). The ones hired today cannot be (7.11.3) and are left out. */
export function assignMap(rows) {
    const out = {};
    for (const r of rows) if (!r.today) out[r.id] = r.choice ?? null;
    return out;
}
/** The plain summary of an assignment: "Rogues go with Company leader; Goblin stays here". */
export function assignSummary(rows) {
    const live = rows.filter(r => !r.today);
    if (!live.length) return null;
    const by = new Map();
    for (const r of live) { const k = r.choice ? r.guides.find(g => g.id === r.choice)?.name ?? '?' : null; (by.get(k) ?? by.set(k, []).get(k)).push(r.name); }
    const parts = [];
    for (const [k, names] of by) if (k) parts.push(`${join(names)} with ${k}`);
    if (by.has(null)) parts.push(`${join(by.get(null))} stay${by.get(null).length === 1 ? 's' : ''} here`);
    return parts.join('; ');
}

const countersOf = st => [...(st.nats ?? []), ...(st.mons ?? [])];
/** The underlings walking with this guide today. */
export const followersOf = (st, data, guideId) => countersOf(st).filter(o => o.hired && !o.dead && o.guide === guideId && !(data?.natives?.[o.id]?.leader) && o.tie?.kind !== 'control');
/** The action `{ type: 'hireling', kind: 'stay' }` is the hirer's: a leader's followers are his hirer's. */
export const stayHirer = (st, guideId) => hirerOf(st, guideId);
export const nameOfCounter = (data, o) => displayName(data.natives?.[o.id]?.name ?? data.monsters?.[o.id]?.name ?? o.id);

// ---------------------------------------------------------------------------------------------------------------------------------- the counters
/** `side` (light, dark, red) and `hidden` of a hired counter (7.7.1g, 7.7.5d, 8.8.6): dark when hidden, red for a hidden Tremendous monster. A counter of a game without the option has neither. */
export function counterLook(o) {
    const side = o?.side ?? 'light', hidden = !!o?.hidden;
    return { side, hidden, dark: side === 'dark', red: side === 'red', word: side === 'red' ? 'hidden, red side up' : hidden || side === 'dark' ? 'hidden, dark side up' : 'light side up' };
}

// ---------------------------------------------------------------------------------------------------------------------------------- the fights nobody played
/** The lines of fights a hired leader had in a clearing where no character stood (the engine's `leaderOnlyFight`, 8.1.2b): a seat's `combat` lines of that day, from the line that opens such a fight
 *  ("The evening falls on ..., where X stands without Y") to the next one that is not his. */
export function unattendedLines(st, day) {
    const seats = new Set(seatIds(st)), out = [];
    if (!seats.size) return out;
    let on = null;
    for (const l of st.log ?? []) {
        if (l.day !== day) continue;
        if (l.who && seats.has(l.who) && l.k === 'combat' && /stands without/.test(l.t)) { on = l.who; }
        else if (on && l.who !== on) on = null;
        if (on && l.who === on) out.push(l);
    }
    return out;
}

/** The same lines, grouped by the seat that spoke, with the clearing the fight was in. */
export function unattendedFights(st, day) {
    const out = new Map();
    for (const l of unattendedLines(st, day)) (out.get(l.who) ?? out.set(l.who, []).get(l.who)).push(l);
    return [...out].map(([id, lines]) => ({ id, name: seatName(st, id), lines, place: /evening falls on (.+?), where/.exec(lines[0]?.t ?? '')?.[1] ?? null,
        kills: lines.map(l => /^.+? kills the (.+?)(?: for you|\.)/.exec(l.t)?.[1]).filter(Boolean).map(n => displayName(n.replace(/ #?\d+$/, ''))) }));
}

// ---------------------------------------------------------------------------------------------------------------------------------- the map
const SHAPE = { char: 'circle', nat: 'square', mon: 'diamond' }, COLOR = { char: '#d9b45a', nat: '#5fb8a5', mon: '#d9715f' };
/** One counter for each living seat of the party that stands somewhere (the engine's `at`, `onRoad`, `flying`): the hirer round and gold, a leader square and teal, a creature a red diamond. */
export function seatMarkers(st, data, actor) {
    return (st.order ?? []).filter(id => { const c = st.chars[id]; return c && (c.at || c.onRoad || c.flying); }).map(id => {
        const c = st.chars[id], kind = c.leader ? c.leader.kind : 'char', name = seatName(st, id);
        return { id, name, character: c.leader ? `hired by ${seatName(st, c.leader.hirer)}` : 'you', letter: (name.trim()[0] ?? '?').toUpperCase(), shape: SHAPE[kind], color: COLOR[kind], mine: id === actor, active: id === actor,
            hidden: !!c.hidden, dead: !!c.dead, away: false, at: c.onRoad || c.flying ? null : c.at, onRoad: c.onRoad ?? null, flying: c.flying ?? null };
    });
}

// ---------------------------------------------------------------------------------------------------------------------------------- his things
export const beltOf = (st, data, id) => (st.chars?.[id]?.items ?? []).filter(i => !i.destroyed).map(it => ({ it, name: displayName(nameOf(data, it)), sub: summaryOf(data, it), def: defOf(data, it) }));
export const discoveriesOf = (st, id) => { const d = st.chars?.[id]?.discovered ?? { paths: [], sites: [] }; return { paths: d.paths?.length ?? 0, sites: d.sites?.length ?? 0 }; };

// ---------------------------------------------------------------------------------------------------------------------------------- the new-game option
// One entry for the wizard's list of optional rules (screens/newgame.js adds it to the end of OPTION_GROUPS, and leaves it out of a race: a race seat has no table for the leaders' turns).
// Off until switched on. The engine's own name for it is `hirelingRules`.
export const HIRELING_GROUP = { title: 'Hirelings', items: [
    { k: 'hirelingRules', title: 'Hirelings and hired leaders', rule: '6.2.5, 6.3.1, 7.7, 7.11', line: 'Hired leaders take their own turns, and each follower goes with a guide you name.',
      text: 'A hired leader, or a monster you take in hand, is a seat of your party: he has an Attention chit and a sheet of his own, you record his plan in Birdsong, and he acts when his chit is drawn. Every other hireling is put with a guide each morning and goes only where that guide goes; you may leave him behind at the start of a phase. Hirelings hide only with their guide. Off: every hireling follows you everywhere, as in the printed game without these rules.' },
] };
