// The table in a SHARED game, as the phone reads it: who is where, who is doing what, in what order the day is played, and what to say while it is not your move.
// Pure functions of a redacted view (server/redact.mjs) and the answer around it (docs/design/online-shared.md); no DOM, so tests/shared_ui.test.mjs runs them in node.
// Nothing here reads a secret: it uses only what the policy makes public (position, hidden flag, Fame, Notoriety, "has planned", who is asked) and the viewer's own record.
import { nameOfClearing, tileName } from '../engine/world.js';
import { fightOf, nowLine } from './fight.js';

/** One look per seat, in join order: a colour AND a shape AND a letter, so colour is never the only cue. The palette is the colour-blind-safe one (Okabe-Ito) minus the blues and reds
 * the map already uses for natives and monsters. */
export const SEAT_STYLES = [
    { shape: 'circle', color: '#e69f00', name: 'amber' },
    { shape: 'square', color: '#2fd1b3', name: 'teal' },
    { shape: 'diamond', color: '#cc79a7', name: 'rose' },
    { shape: 'triangle', color: '#f2eedc', name: 'ivory' },
];
export const styleOf = index => SEAT_STYLES[((index % SEAT_STYLES.length) + SEAT_STYLES.length) % SEAT_STYLES.length];

/** The outline of a counter of this shape and radius, as an SVG element description (the map and the players strip both draw it). */
export function shapeEl(shape, r) {
    switch (shape) {
        case 'square': return { tag: 'rect', attrs: { x: -r * 0.9, y: -r * 0.9, width: r * 1.8, height: r * 1.8, rx: r * 0.28 } };
        case 'diamond': return { tag: 'polygon', attrs: { points: `0,${-r * 1.18} ${r * 1.18},0 0,${r * 1.18} ${-r * 1.18},0` } };
        case 'triangle': return { tag: 'polygon', attrs: { points: `0,${-r * 1.15} ${r * 1.1},${r * 0.85} ${-r * 1.1},${r * 0.85}` } };
        default: return { tag: 'circle', attrs: { r } };
    }
}

/** Where `n` counters standing in one clearing go, as offsets from its centre: a fan along the lower side of the clearing, so they never sit where the names go (right and left)
 * and never on top of each other. `r` is a counter's radius, `ring` the distance of the fan from the clearing's centre. */
export function fan(n, r = 7, ring = 24) {
    const spread = { 1: [90], 2: [66, 114], 3: [46, 90, 134], 4: [32, 66, 114, 148] }[Math.min(4, Math.max(1, n))];
    if (n === 4) ring += 5;                                       // four need a wider arc to keep a counter's width between them
    const out = spread.map(a => ({ dx: ring * Math.cos(a * Math.PI / 180), dy: ring * Math.sin(a * Math.PI / 180) }));
    // more than four (never in v1: 2 to 4 seats): a second ring
    for (let i = 4; i < n; i++) { const a = (20 + (i - 4) * 35) * Math.PI / 180; out.push({ dx: (ring + 2 * r + 2) * Math.cos(a), dy: (ring + 2 * r + 2) * Math.sin(a) }); }
    return out;
}

const seatNo = owner => Number(String(owner ?? '').replace(/^p/, '')) || null;
export const joinNames = list => (list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
const initialOf = name => (String(name ?? '?').trim()[0] ?? '?').toUpperCase();

/** Today's draw of the chits (7.1.1): { day, order: [character ids], i, first, source } or null when the chits have not been drawn yet today. The engine's `dayRec` when the server sends it,
 * else the table's own log line "The chits are drawn: Captain first, then Black Knight." (a public line of kind `day`), which carries the same order. */
export function drawInfo(view) {
    if (!view?.chars) return null;
    let order = null, source = null, i = null;
    const rec = view.dayRec;
    if (rec && rec.day === view.day && Array.isArray(rec.order)) { order = rec.order.slice(); source = 'dayRec'; i = rec.i ?? null; }
    if (!order) {
        const line = [...(view.log ?? [])].reverse().find(l => l.day === view.day && l.k === 'day' && !l.who && /^The chits are drawn:/.test(l.t));
        if (line) {
            const names = line.t.replace(/^The chits are drawn:\s*/, '').replace(/\.$/, '').split(/,\s*then\s*|,\s*/).map(s => s.replace(/\s+first$/, '').trim());
            const byName = new Map(Object.values(view.chars).map(c => [c.name, c.id]));
            order = names.map(n => byName.get(n)).filter(Boolean); source = 'log';
        }
    }
    if (!order?.length) return null;
    if (i == null) {
        // which turn is being played: the first drawn who is asked now; once nobody is (evening, over) every turn is done
        const asked = (view.asks ?? []).map(a => a.who);
        const k = order.findIndex(id => asked.includes(id));
        i = view.period === 'daylight' ? (k >= 0 ? k : 0) : view.period === 'birdsong' ? 0 : order.length;
    }
    return { day: view.day, order, i, first: order[0], source };
}

/** Everybody at the table, in seating order, with where he is and what he is doing. `answer` is the whole reply (waitingFor, standings); `myId` the viewer's character. */
export function party(view, answer = {}, myId = view?.actor) {
    if (!view?.chars) return [];
    const draw = drawInfo(view), players = view.players ?? [], standings = answer.standings ?? [], waiting = answer.waitingFor ?? [];
    const asked = new Map((view.asks ?? []).map(a => [a.who, a]));
    return view.order.map((id, k) => {
        const c = view.chars[id], pi = Math.max(0, players.findIndex(p => p.id === c.owner)), pl = players[pi] ?? null, seat = seatNo(c.owner);
        const stand = standings.find(s => s.seat === seat), wf = waiting.find(w => w.character === id);
        const present = c.id === myId ? true : (stand ? stand.present !== false : wf ? wf.present !== false : true);
        // marked away by the table (docs/design/multiplayer-harden.md section 1): the autopilot plays for him until he opens the game; a seat that left the map (R-21) plays no more at all
        const autopilot = !!(wf?.away || stand?.away || (answer.away ?? []).includes(seat)) && !c.gone;
        const left = c.gone ? { day: c.gone.day } : null;
        const turnNo = draw ? draw.order.indexOf(id) + 1 || null : null;
        const isAsked = asked.has(id), over = view.period === 'over';
        // a meeting between characters (docs/design/multiplayer-meetui.md): asked whether to block, to stop following, to answer an offer, or to leave the trade window
        const meeting = isAsked && (wf?.doing === 'meet' || !!view.blockCheck?.asked?.includes(id) || !!view.followCheck?.asked?.includes(id)
            || !!view.tradeWindow?.groups?.some(g => g.ids.includes(id) && !g.done.includes(id)) || (view.offers ?? []).some(o => o.to === id));
        const guide = view.follows?.[id] ?? null;
        let status;
        if (over) status = 'finished';
        else if (c.gone) status = 'left';
        else if (c.dead) status = isAsked && view.period === 'birdsong' ? 'returning' : 'dead';
        else if (meeting) status = 'meeting';
        else if (isAsked) status = view.period === 'birdsong' ? 'planning' : view.period === 'daylight' ? 'playing' : 'fighting';
        else if (view.period === 'daylight' && (view.blockCheck?.actor === id || view.followCheck?.guide === id)) status = 'playing';       // (his turn goes on once the others have answered)
        else if (view.period === 'daylight' && (guide || c.today?.stage === 'following')) status = 'following';
        else if (view.period === 'birdsong') status = (c.today?.planned || c.today?.stage === 'planned') ? 'planned' : 'waiting';
        else if (view.period === 'daylight' && draw && turnNo) status = turnNo - 1 < draw.i ? 'done' : 'waiting';
        else status = 'waiting';
        // in a shared fight (view.battle): deciding / played (sealed) / waiting / fled / fallen, from the public structure of the fight
        let fight = null;
        const bm = view.battle?.members?.[id];
        if (bm && !over) {
            fight = bm.state === 'out' ? (bm.why === 'died' || c.dead ? 'fallen' : ['ran', 'flew', 'mist', 'teleported'].includes(bm.why) ? 'fled' : 'out')
                : isAsked ? 'deciding' : view.battle.step === 'melee' && bm.ready ? 'sealed' : 'waiting';
            if (!c.dead) status = fight === 'deciding' ? 'fighting' : fight === 'sealed' ? 'sealed' : fight === 'fled' ? 'fled' : 'waiting';
        }
        const st = styleOf(pi);
        return {
            id, owner: c.owner, player: pl?.name ?? stand?.name ?? c.name, character: c.name, index: pi, seat, shape: st.shape, color: st.color, letter: initialOf(pl?.name ?? stand?.name ?? c.name),
            mine: id === myId, at: c.at ?? null, onRoad: c.onRoad ?? null, flying: c.flying ?? null, hidden: !!c.hidden, dead: !!c.dead, fame: c.fame ?? 0, notoriety: c.notoriety ?? 0,
            asked: isAsked, status, fight, present, away: !autopilot && !present && (isAsked || status === 'playing'), autopilot, left, turnNo, active: status === 'playing',
            seq: k, guide, followsName: guide ? (view.chars[guide]?.name ?? guide) : null, followsPlayer: guide ? (view.players?.find(q => q.id === view.chars[guide]?.owner)?.name ?? view.chars[guide]?.name) : null,
            meeting, holder: view.period === 'daylight' && c.today?.stage === 'turn' && !c.dead, hires: [...(view.nats ?? []), ...(view.mons ?? [])].filter(o => o.hired && o.hiredBy === id && !o.dead).length,
        };
    });
}

export const STATUS_WORDS = { returning: 'returning', planning: 'planning', planned: 'planned', playing: 'playing now', fighting: 'in the evening', waiting: 'waiting', done: 'turn done', dead: 'fallen', left: 'left the map', finished: 'finished', sealed: 'played', fled: 'fled', meeting: 'deciding', following: 'following' };
// In a shared fight the chip says what he is doing in it (deciding, played, waiting, fled, fallen).
const FIGHT_WORDS = { deciding: 'deciding', sealed: 'played', waiting: 'waiting', fled: 'fled', fallen: 'fallen', out: 'stayed out' };
/** The chip's second line: what he is doing, or "away" when the game is waiting for him and he is not here. */
export const statusLine = p => (p.autopilot ? 'autopilot' : p.away ? 'away' : p.fight ? FIGHT_WORDS[p.fight] : p.status === 'following' && p.followsPlayer ? `follows ${p.followsPlayer}` : STATUS_WORDS[p.status] ?? p.status);

/** The one who has the turn in Daylight (or null), whoever he is. */
export const activeChar = (people, view) => (view?.period === 'daylight' ? people.find(p => p.status === 'playing') ?? people.find(p => p.holder && p.status === 'meeting') ?? null : null);

/** Who the game is waiting for, by player name, with the ones who are not here marked. `answer.waitingFor` is the server's word for it. */
export function waitingNames(answer = {}, { exceptSeat = null } = {}) {
    return (answer.waitingFor ?? []).filter(w => w.seat !== exceptSeat).map(w => ({ name: w.name, character: w.character, autopilot: !!w.away && !w.stuck, away: w.present === false && !(w.away && !w.stuck) }));
}
export const waitingText = list => joinNames(list.map(w => (w.autopilot ? `${w.name} (autopilot)` : w.away ? `${w.name} (away)` : w.name)));

/** What to tell the player while he has no question of his own. Always says the situation and why he cannot act. */
export function situation(view, answer = {}, myId = view?.actor) {
    const people = party(view, answer, myId), me = people.find(p => p.mine), mineAsk = (view.asks ?? []).find(a => a.who === myId && !a.waiting);
    const wait = waitingNames(answer, { exceptSeat: me?.seat }), draw = drawInfo(view);
    const base = { people, me, draw, wait };
    if (view.period === 'over' && !mineAsk) return { ...base, kind: 'over', title: 'The game is over.', text: 'The realm is quiet again.' };
    if (mineAsk) return { ...base, kind: 'mine' };
    if (!me) return { ...base, kind: 'idle', title: 'Watching.', text: '' };
    const act = activeChar(people, view);
    if (me.left) return { ...base, kind: 'left', title: 'You have left the map.', text: 'You keep watching the others play.', why: `Your score was fixed on day ${me.left.day}, and the game goes on without you.` };
    if (me.autopilot) return { ...base, kind: 'you-away', title: 'You are marked away.', text: `The autopilot is playing ${me.character} for you.`, why: 'The table asked for it while you were gone. Open the game on this device and you play again from your next question.' };
    // Sudden Death (R-20): a player who has met every goal is asked whether the game ends at this Midnight
    const sudden = (answer.waitingFor ?? []).filter(w => w.doing === 'sudden');
    if (sudden.length) {
        const names = joinNames(sudden.map(w => w.name));
        return { ...base, kind: 'sudden-wait', title: `${names} ${sudden.length === 1 ? 'is' : 'are'} deciding whether to end the game.`, text: `Sudden Death: ${names} ${sudden.length === 1 ? 'has' : 'have'} met every goal.`, why: 'The first to say end ends it for everybody at this Midnight. If all play on, the day goes on and they are asked again at the next Midnight.' };
    }
    if (me.dead) return { ...base, kind: 'dead', title: 'You have fallen.', text: view.period === 'birdsong' ? 'Choose who returns, below.' : 'You return at the next Birdsong, with a new character and new goals. Until then you watch.' };
    // characters meeting: a block or a follow is being decided by others, or I have left the trade window and the rest have not
    const pname = id => view.players?.find(q => q.id === view.chars[id]?.owner)?.name ?? view.chars[id]?.name ?? id, is = n => (n === 1 ? 'is' : 'are');
    const stillAsked = list => list.filter(id => (view.asks ?? []).some(a => a.who === id));          // (the list says whom the game asked; whoever has answered no longer has a question)
    if (view.blockCheck) {
        const bc = view.blockCheck, left = stillAsked(bc.asked), names = joinNames((left.length ? left : bc.asked).map(pname)), me2 = bc.actor === myId;
        return { ...base, kind: 'block-wait', title: `${names} ${is(left.length || bc.asked.length)} deciding whether to block ${me2 ? 'you' : pname(bc.actor)}.`, text: '', why: me2 ? 'A block ends your turn: the phases you have left are lost and you are seen.' : 'A block ends a turn. The game goes on when everyone asked has answered.' };
    }
    if (view.followCheck) {
        const fc = view.followCheck, left = stillAsked(fc.asked), names = joinNames((left.length ? left : fc.asked).map(pname)), me2 = fc.guide === myId;
        return { ...base, kind: 'follow-wait', title: `${names} ${is(left.length || fc.asked.length)} deciding whether to keep following ${me2 ? 'you' : pname(fc.guide)}.`, text: '', why: 'The phase begins when they have answered.' };
    }
    const grp = view.tradeWindow?.groups?.find(g => g.ids.includes(myId));
    if (grp && !mineAsk) {
        const rest = grp.ids.filter(id => id !== myId && !grp.done.includes(id)).map(pname);
        return { ...base, kind: 'window-wait', title: 'You are done trading.', text: rest.length ? `Waiting for ${joinNames(rest)}.` : '', why: 'Midnight follows when everyone who stands together has finished.' };
    }
    if (me.status === 'following') {
        const g = pname(me.guide);
        return { ...base, kind: 'following', title: `You are following ${g}.`, text: '', why: `Your turn is ${g}\u2019s: you do what they do. At the start of each of ${g}\u2019s activities you may stop; then your turn ends where you stand.` };
    }
    if (view.period === 'birdsong') {
        const names = waitingText(wait);
        if (answer.paused && wait.length) return { ...base, kind: 'planned', title: 'Planned.', text: `Waiting for ${names}.`, why: `The game is paused: nothing is skipped or played for ${joinNames(wait.map(w => w.name))}. It goes on where it stopped when they come back.` };
        return { ...base, kind: 'planned', title: 'Planned.', text: names ? `Waiting for ${names}.` : 'Everyone is in.', why: 'Plans are secret. When the last one is in, the Monster Roll is made and the chits are drawn.' };
    }
    if (view.period === 'daylight') {
        if (act) {
            const k = draw ? draw.order.indexOf(act.id) + 1 : null, n = draw?.order.length ?? null;
            const mine = draw ? draw.order.indexOf(myId) + 1 : null, until = mine && k && mine > k ? mine - k : null;
            if (act.autopilot) return { ...base, kind: 'spectate', active: act, title: `${act.player} is away: the autopilot plays for them.`, text: `${act.character}${act.at ? ` at ${nameOfClearing(act.at)}` : act.onRoad ? ' on the road' : ''}${k ? ` · turn ${k} of ${n}` : ''}`,
                why: `The table marked ${act.player} away. The autopilot plays cautiously and ${act.player} takes over the moment they open the game.` };
            return { ...base, kind: 'spectate', active: act, title: `${act.player} is taking their turn.`, text: act.away ? `The game is waiting for ${act.player}, who is away.` : `${act.character}${act.at ? ` at ${nameOfClearing(act.at)}` : act.onRoad ? ' on the road' : ''}${k ? ` · turn ${k} of ${n}` : ''}`,
                why: act.away ? `The game is paused until ${act.player} comes back; nothing is skipped or played for them.` : until ? `Your chit comes ${until === 1 ? 'next' : `${until} turns later`}. Until then the map follows ${act.player}.` : me.status === 'done' ? 'Your turn is over; the evening comes after the last turn.' : '' };
        }
        return { ...base, kind: 'turn-over', title: 'Waiting.', text: waitingText(wait) ? `Waiting for ${waitingText(wait)}.` : 'The day goes on.', why: answer.paused ? 'The game is paused until they come back; nothing is skipped.' : '' };
    }
    if ((view.period === 'sunset' || view.period === 'evening') && view.battle) {
        // a shared fight: who fights where and what it is waiting for. A seat in another clearing sees these public facts and nothing of the plays.
        const f = fightOf(view, people, null, myId), now = nowLine(f), inIt = f.members.some(m => m.mine && m.state === 'in'), live = f.members.filter(m => m.state === 'in'), names = (live.length ? live : f.members).map(m => m.player);
        // character against character: the table's record of who has fallen is public (what was taken is not)
        const fell = (f.kills ?? []).map(k => f.members.find(m => m.id === k.victim)).filter(Boolean).map(m => `${m.player}\u2019s ${m.character}`);
        return { ...base, kind: 'fight', fight: f, title: `${joinNames(names)} ${names.length === 1 ? 'fights' : 'fight'} at ${nameOfClearing(f.at)}.`, text: `${now.title} ${now.text}${fell.length ? ` ${joinNames(fell)} ${fell.length === 1 ? 'has' : 'have'} fallen.` : ''}`.trim(),
            why: inIt ? 'Your fight is on screen; open it with the button below.' : f.members.some(m => m.mine) ? 'You are out of this fight and watch the rest.'
                : 'This is another clearing\u2019s fight: you see who is in it and what it waits for, not what anyone plays. Your own evening is played in the drawn order.' };
    }
    if (view.period === 'sunset' || view.period === 'evening') {
        const fighter = people.find(p => p.status === 'fighting');
        const here = fighter && me.at && fighter.at === me.at && fighter.id !== myId;
        return { ...base, kind: 'evening', fighter, title: fighter ? `${fighter.player}'s evening.` : 'The sun sets.', text: fighter ? `${fighter.character} meets what the night brings at ${fighter.at ? nameOfClearing(fighter.at) : 'the road'}.` : 'The evening is being played.',
            why: here ? 'You share that clearing: your own evening is played in the drawn order, one after the other.' : 'Evenings are played one character at a time, in the order of today’s draw.' };
    }
    return { ...base, kind: 'idle', title: 'Waiting.', text: waitingText(wait) ? `Waiting for ${waitingText(wait)}.` : '' };
}

/** What other players did that everyone can see, from two looks at the table: they moved, hid, stepped into view, gained Fame or fell. Only public fields are compared (R-1). */
export function observe(prev, next, myId) {
    if (!prev?.chars || !next?.chars) return [];
    const out = [], pl = id => next.players?.find(p => p.id === next.chars[id]?.owner)?.name ?? next.chars[id].name;
    for (const id of next.order) {
        if (id === myId) continue;
        const a = prev.chars[id], b = next.chars[id];
        if (!a || !b) continue;
        const who = `${pl(id)}’s ${b.name}`, nm = pl(id);          // (`t` names the character for the Detail voice; `s` is the Story voice: the player, in the world's words)
        if (!a.dead && b.dead) { out.push({ id, kind: 'death', t: `${who} has fallen.`, s: `${nm} has fallen.` }); continue; }
        if (b.dead) continue;
        if (b.at && a.at !== b.at && !b.onRoad) out.push({ id, kind: 'move', t: `${who} comes to ${nameOfClearing(b.at)}.`, s: `${nm} comes into ${nameOfClearing(b.at)}.` });
        else if (b.onRoad && !a.onRoad) out.push({ id, kind: 'move', t: `${who} is out on the road.`, s: `${nm} is out on the road.` });
        if (a.hidden === false && b.hidden === true) out.push({ id, kind: 'hide', t: `${who} slips out of sight.`, s: `${nm} slips out of sight and goes still.` });
        if (a.hidden === true && b.hidden === false && a.at === b.at && next.period === 'daylight') out.push({ id, kind: 'hide', t: `${who} steps into the open.`, s: `${nm} steps into the open.` });
        if (b.flying && !a.flying) out.push({ id, kind: 'fly', t: `${who} takes to the air over the ${tileName(b.flying.tile)}.`, s: `${nm} takes to the air over the ${tileName(b.flying.tile)}.` });
        const df = (b.fame ?? 0) - (a.fame ?? 0), dn = (b.notoriety ?? 0) - (a.notoriety ?? 0);
        if (df > 0) out.push({ id, kind: 'fame', t: `${who} gains ${df} Fame.`, s: `${nm}’s name is spoken with more respect.` });
        if (dn > 0) out.push({ id, kind: 'fame', t: `${who} gains ${dn} Notoriety.`, s: `${nm}’s deeds are talked of, and not kindly.` });
    }
    return out;
}

/** The table's own lines to show a spectator: public lines of today that are not the viewer's (the monsters that stir, the natives, a block, a chit turning up), newest last. */
export function publicLines(view, myId, limit = 4) {
    const skip = /^Day \d+ begins|^The chits are drawn|^Dawn of day|chit is drawn\.$|begins at the/;
    return (view.log ?? []).filter(l => l.day === view.day && l.who !== myId && l.k !== 'roll' && l.k !== 'phase' && !skip.test(l.t)).slice(-limit);
}

/** "Turn order today: 1 Mike, 2 Ann" from the draw, using player names. */
export function turnOrderLine(view) {
    const d = drawInfo(view); if (!d) return null;
    const name = id => view.players?.find(p => p.id === view.chars[id]?.owner)?.name ?? view.chars[id]?.name;
    return `Turn order today: ${d.order.map((id, k) => `${k + 1} ${name(id)}`).join(', ')}`;
}

/** The characters standing in one clearing (not on a road, not in the air), in table order. */
export const standingAt = (people, clearing) => people.filter(p => !p.dead && p.at === clearing && !p.onRoad && !p.flying);

/** The map's counters: one per living or fallen character that has a place. `at` is a clearing id, or `road: {from,to}`, or `air: tile`. */
export function markers(people) {
    return people.filter(p => p.at || p.onRoad || p.flying).map(p => ({
        id: p.id, name: p.player, character: p.character, letter: p.letter, shape: p.shape, color: p.color, mine: p.mine, hidden: p.hidden, dead: p.dead, active: p.active, away: p.away,
        at: p.onRoad || p.flying ? null : p.at, road: p.onRoad ? { from: p.onRoad.from, to: p.onRoad.to } : null, air: p.flying ? p.flying.tile : null,
    }));
}

/** A line saying how a counter stands, for the tag that opens when it is tapped. */
export function tagText(m) {
    return `${m.name} · ${m.character}${m.dead ? ' · fallen' : m.hidden ? ' · hidden' : ''}${m.mine ? ' · you' : ''}`;
}
