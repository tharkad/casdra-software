// The screens of the TABLE'S AGREEMENTS in a SHARED game (docs/design/multiplayer-harden-ui.md; the server side is docs/design/multiplayer-harden.md). Only for a shared table.
//   voteCard         a proposal the table is voting on: mark a seat away (the autopilot plays for it) or end the game now. Decision first, "no" on the left, "yes" on the right, the tally under it
//   awayCards        for the seat that was marked away: "you are marked away" with I am back; and, after returning, "welcome back" with what the autopilot did in my name
//   markAwayRow      in the players sheet: a seat that has been gone long enough, and the button that asks the table to mark it away
//   endOptionSheet   Sudden Death's question: who qualified, End the game / Play on
//   quitSheet        ask the table to end the game; leaveSheet leave the map (scored at once, never starts again)
//   endSheet         the end of the game: places, a shared victory, the realm laid bare (seed, goals, spells, the commitment check)
// Builders only: game.js owns the state and passes in what each needs (`c`: st, data, answer, ui, render, modal, table: { away(body), quit(body) }, mySeat).
import { h } from '../dom.js';
import { ask } from '../ask.js';
import { counterIcon } from '../shared_ui.js';
import { joinList } from '../meet.js';
import { agreements, markable, gone, endOption, endModel, mayLeaveMap, mayVote, autopilotRecord, autopilotWords, place, plural, standingOf } from '../table.js';

const nb = s => String(s).replace(/ (?=\d)/g, ' ');
const bar = (summary, buttons, cls = '') => h('div', { class: `trade-bar tb-bar ${cls}` }, summary ? h('p', { class: 'tb-sum' }, summary) : null, h('div', { class: 'row-end tb-actions' }, ...buttons));

/** The tally of a vote: one chip for every seat that votes, with what it said. */
function tally(a) {
    return h('ul', { class: 'tb-tally', 'data-tally': a.kind, 'aria-label': 'Votes' }, ...a.voters.map(v =>
        h('li', { class: `tb-vote ${v.yes === true ? 'yes' : v.yes === false ? 'no' : 'wait'}`, 'data-voter': v.name, 'data-said': v.yes === true ? 'yes' : v.yes === false ? 'no' : 'wait' },
            h('b', {}, v.name), h('small', {}, v.yes === true ? 'yes' : v.yes === false ? 'no' : 'not yet'))));
}

/** The card for a proposal the table is voting on. `a` is one of agreements(answer, mySeat). Its buttons are inside it: it sits above the seat's own question and never replaces it. */
export function voteCard(c, a) {
    const { answer } = c, st = standingOf(answer, a.target?.seat);
    const call = body => c.table[a.kind](body);
    const isAway = a.kind === 'away';
    let situation, why, buttons = [];
    if (a.iAmTarget) {
        situation = `${a.by.name} has asked the table to mark you away.`;
        why = 'You are here now, which is all it takes: opening the game brings you back, and the vote ends.';
    } else if (isAway) {
        const t = a.target.name;
        situation = a.iAmProposer ? `You asked the table to mark ${t} away.` : `${a.by.name} asks to mark ${t} away.`;
        why = `${t} has been gone ${st?.absentFor != null ? gone(st.absentFor) : 'a while'}. If everyone agrees, the autopilot plays ${a.target.character ?? 'their character'} until ${t} opens the game again; nothing is skipped. One no and the game keeps waiting.`;
        if (a.iVote && a.mine == null) buttons = [h('button', { class: 'btn', 'data-act': 'vote-no', onclick: () => call({ kind: 'vote', yes: false }) }, 'Keep waiting'), h('button', { class: 'btn primary', 'data-act': 'vote-yes', onclick: () => call({ kind: 'vote', yes: true }) }, `Mark ${t} away`)];
    } else {
        situation = a.iAmProposer ? 'You asked the table to end the game now.' : `${a.by.name} asks the table to end the game now.`;
        why = 'Every player still on the map has to agree: if you all say yes the game stops and each of you is scored as you stand today. One no and play goes on.';
        if (a.iVote && a.mine == null) buttons = [h('button', { class: 'btn', 'data-act': 'vote-no', onclick: () => call({ kind: 'vote', yes: false }) }, 'Play on'), h('button', { class: 'btn primary', 'data-act': 'vote-yes', onclick: () => call({ kind: 'vote', yes: true }) }, 'End the game')];
    }
    if (!buttons.length && a.iVote && a.mine === true) why = `${why} You said yes${a.waiting.length ? `; waiting for ${joinList(a.waiting)}` : ''}.`;
    if (a.iAmProposer) buttons = [...buttons, h('button', { class: 'btn quiet', 'data-act': 'vote-withdraw', onclick: () => call({ kind: 'withdraw' }) }, 'Take it back')];
    return h('div', { class: `tb-card ${a.kind}`, 'data-table-card': a.kind, 'data-key': a.key, role: 'group', 'aria-label': isAway ? 'A vote to mark a seat away' : 'A vote to end the game' },
        ask(situation, why, { compact: true }), tally(a),
        buttons.length ? h('div', { class: `row2 tb-two${buttons.length > 2 ? ' three' : ''}` }, ...buttons) : null);
}

/** What the dock shows about the table's agreements, in order: a vote I must cast first, then the others. Returns [nodes]. */
export function tableCards(c) {
    const ag = agreements(c.answer, c.mySeat), out = [];
    for (const a of [ag.away, ag.quit]) if (a) out.push(voteCard(c, a));
    return out;
}
/** Whether there is a vote I have not answered (it earns the drawer's opening once). */
export const pendingVote = (answer, mySeat) => { const ag = agreements(answer, mySeat); return [ag.away, ag.quit].find(a => a && a.iVote && a.mine == null) ?? null; };

// ------------------------------------------------------------------------------------------------------------------------------- marked away, and back
/** I am marked away: the autopilot is playing for me. Opening the game brings me back; this is for a phone that has the page but no live stream. */
export function awayCard(c) {
    const me = c.crew.find(p => p.mine);
    return h('div', { class: 'tb-card you-away', 'data-table-card': 'you-away', role: 'status' },
        ask('You are marked away.', `The table asked for the autopilot to play ${me?.character ?? 'your character'} while you were gone. Press the button and you play again from your next question.`, { compact: true }),
        h('div', { class: 'row-end' }, h('button', { class: 'btn primary', 'data-act': 'away-back', onclick: () => c.table.away({ kind: 'back' }) }, 'I am back')));
}
/** "Welcome back": what the autopilot did in my name while I was marked away. Shown once for each time. */
export function welcomeCard(c, rec, onOk) {
    const me = c.crew.find(p => p.mine);
    return h('div', { class: 'tb-card welcome', 'data-table-card': 'welcome', role: 'status' },
        ask('Welcome back.', `While you were away the autopilot ${autopilotWords(rec.answers)} for ${me?.character ?? 'your character'}. What it did stands, and it is in the journal. You play from your next question.`, { compact: true }),
        h('div', { class: 'row-end' }, h('button', { class: 'btn primary', 'data-act': 'welcome-back-ok', onclick: onOk }, 'Carry on')));
}
export { autopilotRecord };

/** In the players sheet, under a seat's row: how long it has been gone, "Away (autopilot)", "left the map", and (when it has been gone long enough) the button that asks the table to mark it away. */
export function seatNote(c, p) {
    const s = standingOf(c.answer, p.seat);
    if (!s) return null;
    const mk = markable(c.answer, c.mySeat).find(x => x.seat === p.seat);
    const bits = [];
    if (p.left) bits.push(h('span', { class: 'tb-badge left', 'data-badge': 'left' }, `Left the map on day ${p.left.day}`));
    else if (p.autopilot) bits.push(h('span', { class: 'tb-badge away', 'data-badge': 'away' }, 'Away: the autopilot plays'));
    else if (!s.present && s.absentFor >= 60 && !s.waiting && !mk) bits.push(h('span', { class: 'tb-badge', 'data-badge': 'gone' }, `Gone ${gone(s.absentFor)}`));
    if (mk) bits.push(h('span', { class: 'tb-gone', 'data-badge': 'gone' }, `Gone ${mk.text}.`), h('p', { class: 'hint tb-why' }, 'If the table agrees, the autopilot plays for them: it stays hidden, rests when tired, turns every offer down and never ends a Sudden Death. Nothing is skipped, and they take over the moment they open the game.'), h('button', { class: 'btn tb-mark', 'data-act': 'mark-away', 'data-seat': p.seat, disabled: c.ui.tableBusy || null, onclick: () => c.table.away({ kind: 'propose', seat: p.seat }) }, `Ask to mark ${p.player} away`));
    return bits.length ? h('div', { class: 'tb-note' }, ...bits) : null;
}
/** The foot of the players sheet: ending the game early and leaving the map. */
export function tableActions(c, { onQuit, onLeave }) {
    if (!mayVote(c.answer)) return null;
    const lm = mayLeaveMap(c.answer, c.st), ag = agreements(c.answer, c.mySeat);
    return h('div', { class: 'tb-actions-foot', 'data-table-actions': '' },
        h('h4', {}, 'Stop early'),
        h('button', { class: 'btn', 'data-act': 'quit-ask', disabled: !!ag.quit || null, onclick: onQuit }, ag.quit ? 'The table is voting on it' : 'Ask the table to end the game'),
        h('button', { class: 'btn', 'data-act': 'leave-map', disabled: !lm.ok || null, onclick: onLeave }, 'Leave the map'),
        h('p', { class: 'hint' }, lm.ok ? 'Ending the game needs every player to agree. Leaving the map is yours alone: your score is fixed at once and the others play on.' : lm.why));
}

// ------------------------------------------------------------------------------------------------------------------------------- the questions
/** Sudden Death (R-20). The question is asked of every player who has met every goal; the first to say end ends it. Decision first: the situation, why, then the choices, "End" on the right. */
export function endOptionSheet(c, q) {
    const m = endOption(c.st, q, c.st.ch.id), busy = !!c.ui.busy;
    const body = h('div', { class: 'tb-end', 'data-end-option': String(q.day ?? '') },
        ask(m.situation, m.why, { compact: true }),
        h('h3', {}, 'Who qualified'),
        h('ul', { class: 'tb-qual' }, ...m.who.map(x => h('li', { class: x.mine ? 'me' : '', 'data-qual': x.id }, h('b', {}, `${x.player}${x.mine ? ' (you)' : ''}`), h('small', {}, x.character, ' has met every goal')))),
        h('p', { class: 'hint' }, 'Nobody who has not met every goal is asked. Whoever ends it ends it for everybody, at this Midnight.'));
    const footer = bar('Midnight, day ' + (q.day ?? c.st.day) + '. The game waits for you.', [
        h('button', { class: 'btn', 'data-act': 'end-stay', disabled: busy || null, onclick: () => c.act({ type: 'end-option', end: false }) }, m.stay),
        h('button', { class: 'btn primary', 'data-act': 'end-go', disabled: busy || null, onclick: () => c.act({ type: 'end-option', end: true }) }, m.end)]);
    return c.modal('Sudden Death', body, { footer });
}

/** Ask the table to end the game: what it means before it is asked. */
export function quitSheet(c) {
    const mine = c.st.ch, close = () => { c.ui.sheet = null; c.render(); };
    const body = h('div', { class: 'confirmbox tb-confirm', 'data-confirm': 'quit' },
        ask('Ask the table to end the game now?', 'Every player still on the map is asked. If all say yes, the game stops at once and each of you is scored as you stand today; one no and it goes on as before.', { compact: true }),
        h('p', { class: 'hint' }, `You would stand at Fame ${mine.fame}, Notoriety ${mine.notoriety}, ${mine.gold} gold. Goals count as they are now: what you have not earned yet counts against you.`));
    const footer = bar(null, [h('button', { class: 'btn', 'data-act': 'quit-stay', onclick: close }, 'Play on'),
        h('button', { class: 'btn primary', 'data-act': 'quit-go', disabled: c.ui.tableBusy || null, onclick: () => { close(); c.table.quit({ kind: 'propose' }); } }, 'Ask the table')]);
    return c.modal('End the game', body, { close, footer });
}
/** Leave the map (R-21, R-28): scored at once, never starts again, the others play on. */
export function leaveSheet(c, vpNow) {
    const mine = c.st.ch, close = () => { c.ui.sheet = null; c.render(); }, lm = mayLeaveMap(c.answer, c.st);
    const body = h('div', { class: 'confirmbox tb-confirm', 'data-confirm': 'leave' },
        ask('Leave the map for good?', 'Your character walks off the map. Your score is fixed at what you have this moment, your hirelings are let go and what you carry leaves play with you. You do not start again, and you keep watching.', { compact: true }),
        h('p', { class: 'hint' }, `${mine.name}: Fame ${mine.fame}, Notoriety ${mine.notoriety}, ${mine.gold} gold, ${vpNow > 0 ? `+${vpNow}` : vpNow} victory points as you stand. The others play on, and see your score at the end.`),
        lm.ok ? null : h('p', { class: 'hint bad' }, lm.why));
    const footer = bar(null, [h('button', { class: 'btn', 'data-act': 'leave-stay', onclick: close }, 'Stay'),
        h('button', { class: 'btn primary danger', 'data-act': 'leave-go', disabled: !lm.ok || c.ui.tableBusy || null, onclick: () => { close(); c.table.quit({ kind: 'leave' }); } }, 'Leave the map')]);
    return c.modal('Leave the map', body, { close, footer });
}

// ------------------------------------------------------------------------------------------------------------------------------- the end of the game
const sign = n => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const NAME = { great: 'Great Treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
/** The shared end sheet: the verdict first (who won, or that the win is shared), then every place, then each character's goals, then the realm laid bare. */
export function endSheet(c, { title, onBack, close }) {
    const { st, ui, data } = c, s = st.score, m = endModel(st, c.answer, st.ch.owner);
    if (!m) return c.modal(title, h('div', { class: 'oversheet' }, ask('The game is over.', 'The score is being worked out.')), { close });
    const open = (k, dflt = false) => (ui.ovOpen?.[k] ?? dflt);
    const keep = k => ev => { (ui.ovOpen ??= {})[k] = ev.target.open; };
    const nameOfChar = id => st.chars?.[id]?.name ?? id;
    const hero = h('div', { class: `ov-hero ${m.mineWon ? 'win' : 'lose'}${m.tie ? ' tie' : ''}`, role: 'status', 'data-hero': m.tie ? 'tie' : 'win' },
        h('small', {}, m.tie ? 'Shared victory' : 'Victory'),
        h('div', { class: 'ov-total' }, joinList(m.victors.map(v => v.name))),
        h('p', {}, m.sub),
        h('p', { class: 'ov-why', 'data-why': m.reason }, m.why));
    const places = h('ol', { class: 'tb-places', 'data-places': '' }, ...m.players.map(p => h('li', { class: `tb-place${p.victor ? ' victor' : ''}${p.mine ? ' me' : ''}`, 'data-player': p.name, 'data-rank': p.rank },
        h('span', { class: 'tb-rank' }, place(p.rank)),
        h('span', { class: 'tb-pname' }, h('b', {}, `${p.name}${p.mine ? ' (you)' : ''}`), h('small', {}, p.chars.map(x => `${x.name}${x.dead ? ' (fallen)' : ''}${x.gone ? `, left the map on day ${x.gone}` : ''}`).join(' · '))),
        h('span', { class: `ov-pts ${p.total >= 0 ? 'up' : 'down'}` }, sign(p.total)),
        p.victor ? h('span', { class: 'tb-win', 'aria-label': m.tie ? 'shares the victory' : 'victor' }, '✓') : null)));
    const details = m.players.map(pl => h('details', { class: 'ov-details player', open: open(`p:${pl.id}`, pl.mine) || null, ontoggle: keep(`p:${pl.id}`) },
        h('summary', {}, h('b', {}, pl.name), ' ', h('span', { class: `ov-pts ${pl.total >= 0 ? 'up' : 'down'}` }, sign(pl.total))),
        ...pl.chars.map(ch => { const cc = s.chars[ch.id]; return h('div', { class: 'ov-char' }, h('b', {}, cc.name + (cc.dead ? ' (fallen)' : '')),
            ...(cc.rows ?? []).filter(r => r.need > 0).map(r => h('p', { class: 'hint' }, `${NAME[r.cat] ?? r.cat}: ${r.earned} of ${r.need} · ${sign(r.basic + r.bonus)}${r.diff < 0 ? ' (short: counted three times)' : ''}`))); })));
    const r = m.reveal;
    const lines = (list, id) => list.map(x => data.spells?.[x]?.name ?? x).join(', ') || 'none';
    const revealBox = r ? h('details', { class: 'ov-details tb-reveal', 'data-reveal': r.verified ? 'verified' : 'mismatch', open: open('reveal') || null, ontoggle: keep('reveal') },
        h('summary', {}, h('b', {}, 'The realm laid bare'), ' ', h('span', { class: `tb-check ${r.verified ? 'ok' : 'bad'}`, 'data-check': r.verified ? 'verified' : 'mismatch' }, r.verified ? 'verified' : 'does not match')),
        r.verified
            ? h('p', { class: 'hint' }, 'The seed below is the one the realm was made from, and it matches the commitment published when the game began: nobody could have changed the map or the dice after seeing how it went.')
            : h('p', { class: 'hint bad', role: 'alert' }, 'The seed does NOT match the commitment published when the game began. Tell the host: this game should not be trusted.'),
        h('p', { class: 'tb-seed', 'data-seed': '' }, h('b', {}, 'Seed '), String(r.seed), h('br'), h('b', {}, 'Salt '), String(r.salt).slice(0, 24), String(r.salt).length > 24 ? '…' : '', h('br'), h('b', {}, 'Commitment '), String(r.commit).slice(0, 24), '…'),
        ...r.chars.map(x => h('div', { class: 'tb-rchar', 'data-rchar': x.id }, h('b', {}, `${x.player ? `${x.player}’s ` : ''}${x.name}`),
            h('p', { class: 'hint' }, `Chose: ${x.goals}${x.start ? ` · began at the ${x.start}` : ''}`),
            h('p', { class: 'hint' }, `Spells: ${lines(x.spells.recorded ?? [])}${(x.spells.learned ?? []).length ? ` (learned in play: ${lines(x.spells.learned)})` : ''}`)))) : null;
    return c.modal(title, h('div', { class: 'oversheet', 'data-shared-over': '' }, hero, places, ...details, revealBox,
        h('div', { class: 'row-end ov-actions' }, h('button', { class: 'btn primary', 'data-act': 'over-title', onclick: onBack }, 'Back to the table'))), { close });
}
