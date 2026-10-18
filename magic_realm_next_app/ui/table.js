// The AGREEMENTS of a shared table, as a phone reads them (docs/design/multiplayer-harden.md sections 1, 2 and 10; docs/design/multiplayer-harden-ui.md): a seat marked away and the autopilot, the vote to end the game
// early, leaving the map, Sudden Death's question, and how a game ends (places, a shared victory, the realm laid bare with the seed's commitment checked).
// Pure functions of an answer (server/shared.mjs `respond`) and the redacted view inside it; no DOM, so tests/table_ui.test.mjs runs them in node.
// Nothing here reads a secret: a vote is public, absence is public, and the reveal exists only once the game is over (R-26).
import { joinList } from './meet.js';

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How long a seat has been gone, in plain words ("a few minutes", "12 minutes", "about an hour", "3 hours", "2 days"). */
export function gone(sec) {
    const s = Math.max(0, Math.round(sec ?? 0));
    if (s < 90) return 'a moment';
    if (s < 3600) { const m = Math.round(s / 60); return m < 3 ? 'a few minutes' : `${m} minutes`; }
    if (s < 5400) return 'about an hour';
    if (s < 86400) return `${Math.round(s / 3600)} hours`;
    return plural(Math.round(s / 86400), 'day');
}

/** My seat's standing in the answer (null before a game starts). */
export const standingOf = (answer, seat) => (answer?.standings ?? []).find(s => s.seat === seat) ?? null;
const nameOfSeat = (answer, seat) => standingOf(answer, seat)?.name ?? (answer?.votes?.away?.targetName && answer.votes.away.target === seat ? answer.votes.away.targetName : null) ?? `seat ${seat}`;

/** The two agreements the table is making, read for MY seat. Each is null or
 * { kind, target?: {seat,name,character}, by:{seat,name}, voters:[{seat,name,yes}], iVote (I am a voter), mine (my vote: true/false/null), iAmProposer, iAmTarget, waiting:[names], yes:[names], key }
 * `key` changes when a new proposal replaces the old, so the screen can open itself once for each. */
export function agreements(answer, mySeat) {
    const read = (v, kind) => {
        if (!v) return null;
        const voters = v.votes ?? [], me = voters.find(x => x.seat === mySeat) ?? null;
        const t = kind === 'away' ? { seat: v.target, name: v.targetName ?? nameOfSeat(answer, v.target), character: standingOf(answer, v.target)?.character ?? null } : null;
        return {
            kind, target: t, by: { seat: v.by, name: v.byName ?? nameOfSeat(answer, v.by) }, voters, iVote: !!me, mine: me ? me.yes : null, iAmProposer: v.by === mySeat, iAmTarget: kind === 'away' && v.target === mySeat,
            waiting: voters.filter(x => x.yes == null).map(x => x.name), yes: voters.filter(x => x.yes === true).map(x => x.name), at: v.at ?? null,
            key: `${kind}|${v.target ?? ''}|${v.by}|${v.at ?? ''}`,
        };
    };
    return { away: read(answer?.votes?.away, 'away'), quit: read(answer?.votes?.quit, 'quit') };
}

/** Whether I may take part in the table's agreements at all: not marked away myself, not gone from the map (R-27), and the game still on. */
export function mayVote(answer) {
    return !!answer && answer.phase === 'playing' && !answer.you?.away && !answer.you?.left && answer.view?.period !== 'over';
}

/** The seats I could propose to mark away: absent for the table's limit, not me, nobody else being voted on. [{ seat, name, character, absentFor, text }] */
export function markable(answer, mySeat) {
    if (!mayVote(answer) || answer.votes?.away) return [];
    return (answer.standings ?? []).filter(s => s.markable && s.seat !== mySeat).map(s => ({ seat: s.seat, name: s.name, character: s.character, absentFor: s.absentFor, text: gone(s.absentFor) }));
}

/** Whether I may leave the map now, and if not, why in a few words. The engine allows it from a clearing when I am asked to plan or at the start of one of my phases (R-21, R-28); the server refuses
 * at any other time, so the button is only lit when it can work. */
export function mayLeaveMap(answer, view) {
    if (!mayVote(answer)) return { ok: false, why: answer?.you?.left ? 'You have left the map already.' : 'Not now.' };
    const p = view?.pending ?? null, c = view?.ch ?? null;
    if (!p || !c || c.dead) return { ok: false, why: 'You can leave when you plan your day or at the start of one of your phases.' };
    if (c.onRoad || c.flying || c.mist || !c.at) return { ok: false, why: 'Only from a clearing, on the ground.' };
    if (p.type === 'plan' || p.type === 'phase' || p.type === 'phase-pick') return { ok: true, why: null };
    return { ok: false, why: 'You can leave when you plan your day or at the start of one of your phases.' };
}

/** The autopilot's answers for me, from the table's own lines: `Bob's autopilot answers: plan.` / `... combat melee.` Marking and return are lines too. Returns
 * { marked: index|-1, back: index|-1, answers: [kind], key } for the LAST time I was marked away, so "welcome back" can say what was done in my name. */
export function autopilotRecord(view, myName) {
    const log = view?.log ?? [], skipped = view?.logSkipped ?? 0;
    let marked = -1, back = -1;
    const mine = new RegExp(`^${myName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:'s autopilot answers: (.+)\\.| is marked away by the table| is back: )`);
    const answers = [];
    for (let i = 0; i < log.length; i++) {
        const t = log[i].t ?? '', m = mine.exec(t);
        if (!m) continue;
        if (/ is marked away by the table/.test(t)) { marked = skipped + i; back = -1; answers.length = 0; }
        else if (/ is back: /.test(t)) back = skipped + i;
        else if (m[1] && marked >= 0 && back < 0) answers.push(m[1]);
    }
    return { marked, back, answers, key: marked >= 0 ? `${marked}|${back}` : null };
}
const KIND_WORDS = { plan: 'planned the day', turn: 'played a turn', move: 'moved', combat: 'fought', restart: 'started again', rest: 'rested', phase: 'played a phase', continue: 'went on' };
/** "planned the day, fought 3 times and played a phase" from the kinds the autopilot answered. */
export function autopilotWords(answers) {
    if (!answers.length) return 'nothing needed an answer';
    const n = new Map();
    for (const a of answers) { const k = a.split(' ')[0]; n.set(k, (n.get(k) ?? 0) + 1); }
    return joinList([...n].map(([k, c]) => `${KIND_WORDS[k] ?? k}${c > 1 ? ` ${c} times` : ''}`));
}

// ------------------------------------------------------------------------------------------------------------------------------- Sudden Death (R-20)
/** The question `end-option`: who has met every goal (the public line and `view.sudden.ids`), what ending does, what playing on does. */
export function endOption(view, q, myId = view?.actor) {
    const ids = view?.sudden?.ids?.length ? view.sudden.ids : [myId];
    const pname = id => view.players?.find(p => p.id === view.chars?.[id]?.owner)?.name ?? view.chars?.[id]?.name ?? id;
    const who = ids.map(id => ({ id, player: pname(id), character: view.chars?.[id]?.name ?? id, mine: id === myId }));
    const others = who.filter(x => !x.mine);
    return {
        day: q?.day ?? view?.day, who, others,
        situation: others.length ? `You have met every goal, and so ${others.length === 1 ? 'has' : 'have'} ${joinList(others.map(x => x.player))}. End the game now?` : 'You have met every goal. End the game now?',
        why: `This is Sudden Death: it is Midnight of day ${q?.day ?? view?.day}. If anyone who qualified says end, the game stops here for everybody and each player is scored as they stand, with the goals and the realm's seed revealed. If you play on, the day goes on and you are asked again at the next Midnight.`,
        end: 'End the game', stay: 'Play on',
    };
}

// ------------------------------------------------------------------------------------------------------------------------------- the end of the game (R-19, R-26)
export const REASONS = { finished: 'The last Midnight has passed.', agreed: 'The table agreed to end the game here.', left: 'Nobody is left on the map.', limit: 'The game reached its length limit and ends as it stands.', died: 'The adventure ended.' };
export const place = n => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;

/** The goals a character chose, in words, from the revealed spread: "Fame 3, Notoriety 2 and Gold 1". */
export const spreadWords = vp => {
    const NAME = { great: 'Great treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
    const bits = Object.entries(NAME).filter(([k]) => vp?.[k] > 0).map(([k, n]) => `${n} ${vp[k]}`);
    return bits.length ? joinList(bits) : 'no goals';
};

/** Everything the end sheet shows. `view.score` (scoreParty), `answer.standings` (rank, victor, leftDay) and `answer.reveal` (seed, goals, spells, the commitment check).
 * { ended, tie, victors:[{ id, name, mine }], players:[{ id, name, total, rank, victor, mine, chars:[{id,name,dead,gone}], leftDay }], reveal|null, mineWon, headline, sub } */
export function endModel(view, answer, myOwner) {
    const s = view?.score;
    if (!s?.players) return null;
    const nameOf = id => view.players?.find(p => p.id === id)?.name ?? id;
    const stand = answer?.standings ?? [];
    const players = s.players.map(p => {
        const row = stand.find(x => `p${x.seat}` === p.id) ?? stand.find(x => x.name === nameOf(p.id));
        const chars = p.chars.map(id => ({ id, name: s.chars?.[id]?.name ?? id, dead: !!s.chars?.[id]?.dead, gone: s.chars?.[id]?.gone ?? null }));
        return { id: p.id, name: nameOf(p.id), total: Math.round(p.total * 10) / 10, rank: p.rank ?? row?.rank ?? 1, victor: p.victor ?? s.victors?.includes(p.id), mine: p.id === myOwner, chars, leftDay: row?.leftDay ?? chars.find(c => c.gone)?.gone ?? null };
    }).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    const victors = players.filter(p => p.victor);
    const tie = victors.length > 1, mineWon = victors.some(v => v.mine);
    const r = answer?.reveal ?? view?.reveal ?? null;
    const reason = s.reason ?? view?.over?.reason ?? 'finished';
    // Sudden Death names the player who ended it ("Ann ends the game."), a public line
    const ender = reason === 'finished' && view?.mode === 'sudden' ? (view.log ?? []).filter(l => /^.+ ends the game\.$/.test(l.t ?? '') && !l.who).at(-1)?.t?.replace(/ ends the game\.$/, '') ?? null : null;
    const why = ender ? `Sudden Death: ${ender} ended the game.` : REASONS[reason] ?? REASONS.finished;
    const headline = tie ? `Shared victory: ${joinList(victors.map(v => v.name))}` : `${victors[0]?.name ?? 'Nobody'} wins`;
    const sub = tie ? `They finish level on ${victors[0].total >= 0 ? '+' : '−'}${Math.abs(victors[0].total)} and share the place: there is no tie-break.` : mineWon ? 'The Realm is kept, and you kept it.' : 'The Realm is kept, but not by you.';
    return { reason, why, tie, victors, players, mineWon, headline, sub, reveal: r && r.seed != null ? reveal(view, r) : null, multi: players.length > 1 };
}

/** The reveal of R-26 read for the screen: the seed and salt, the commitment check (`verified`), each character's goals and spells, where each began. */
export function reveal(view, r) {
    const chars = Object.keys(r.vp ?? {}).map(id => ({ id, name: view.chars?.[id]?.name ?? id, player: view.players?.find(p => p.id === view.chars?.[id]?.owner)?.name ?? null,
        goals: spreadWords(r.vp[id]), spells: r.spells?.[id] ?? { recorded: [], learned: [] }, start: r.startDwelling?.[id] ?? null }));
    return { seed: r.seed, salt: r.salt, commit: r.commit, verified: r.verified === true, day: r.day, reason: r.reason, chars };
}
