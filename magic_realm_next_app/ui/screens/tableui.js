// The screens of the TABLE'S AGREEMENTS in a SHARED game (docs/design/multiplayer-harden-ui.md; the server side is docs/design/multiplayer-harden.md). Only for a shared table.
//   voteCard         a proposal the table is voting on: mark a seat away (the autopilot plays for it) or end the game now. Decision first, "no" on the left, "yes" on the right, the tally under it
//   awayCards        for the seat that was marked away: "you are marked away" with I am back; and, after returning, "welcome back" with what the autopilot did in my name
//   markAwayRow      in the players sheet: a seat that has been gone long enough, and the button that asks the table to mark it away
//   endOptionSheet   Sudden Death's question: who qualified, End the game / Play on
//   quitSheet        ask the table to end the game; leaveSheet leave the map (scored at once, never starts again)
//   endSheet         the end of the game: places, a shared victory, the realm laid bare (seed, goals, spells, the commitment check)
// Builders only: game.js owns the state and passes in what each needs (`c`: st, data, answer, ui, render, modal, table: { away(body), quit(body) }, mySeat).
import { h } from '../dom.js';
import { askBox, pcEl } from '../shared_ui.js';
import { btn, primary, sect } from '../ds.js';
import { footRow } from './kit/common.js';
import { joinList } from '../meet.js';
import { agreements, markable, gone, endOption, endModel, mayLeaveMap, mayVote, autopilotRecord, autopilotWords, place, standingOf } from '../table.js';

const nb = s => String(s).replace(/ (?=\d)/g, ' ');
const ask = (a, b) => askBox(a, b);                                   // (the design system's ask, with the legacy `data-ask` hook)
const two = (...kids) => h('div', { class: 'tb-two sf-two' }, ...kids.filter(Boolean));

/** The tally of a vote: one chip for every seat that votes, with what it said. */
function tally(a) {
    return h('ul', { class: 'tb-tally', 'data-tally': a.kind, 'aria-label': 'Votes' }, ...a.voters.map(v =>
        h('li', { class: `ds-tag tb-vote ${v.yes === true ? 'good yes' : v.yes === false ? 'bad no' : 'wait'}`, 'data-voter': v.name, 'data-said': v.yes === true ? 'yes' : v.yes === false ? 'no' : 'wait' },
            h('b', {}, v.name), h('small', {}, v.yes === true ? 'yes' : v.yes === false ? 'no' : 'not yet'))));
}

// What a vote says, as { situation, why, yes, no, kind }: the words are the same on the sheet that asks me and on the card that only tells me how it stands.
function voteWords(c, a) {
    const st = standingOf(c.answer, a.target?.seat), isAway = a.kind === 'away';
    let situation, why, ask = null;
    if (a.iAmTarget) {
        situation = `${a.by.name} has asked the table to mark you away.`;
        why = 'You are here now, which is all it takes: opening the game brings you back, and the vote ends.';
    } else if (isAway) {
        const t = a.target.name;
        situation = a.iAmProposer ? `You asked the table to mark ${t} away.` : `${a.by.name} asks to mark ${t} away.`;
        why = `${t} has been gone ${st?.absentFor != null ? gone(st.absentFor) : 'a while'}. If everyone agrees, the autopilot plays ${a.target.character ?? 'their character'} until ${t} opens the game again; nothing is skipped. One no and the game keeps waiting.`;
        ask = { no: 'Keep waiting', yes: `Mark ${t} away` };
    } else {
        situation = a.iAmProposer ? 'You asked the table to end the game now.' : `${a.by.name} asks the table to end the game now.`;
        why = 'Every player still on the map has to agree: if you all say yes the game stops and each of you is scored as you stand today. One no and play goes on.';
        ask = { no: 'Play on', yes: 'End the game' };
    }
    if (!(a.iVote && a.mine == null) && a.iVote && a.mine === true) why = `${why} You said yes${a.waiting.length ? `; waiting for ${joinList(a.waiting)}` : ''}.`;
    return { situation, why, ask, isAway };
}
const mustVote = a => !!(a.iVote && a.mine == null);

/** The card for a proposal the table is voting on, in the tray: how it stands (the situation, who said what) and, for the one who proposed it, "Take it back". A vote I must answer is a sheet (voteSheet). */
export function voteCard(c, a) {
    const w = voteWords(c, a), call = body => c.table[a.kind](body);
    return h('div', { class: `tb-card ${a.kind}`, 'data-table-card': a.kind, 'data-key': a.key, role: 'group', 'aria-label': w.isAway ? 'A vote to mark a seat away' : 'A vote to end the game' },
        ask(w.situation, a.iAmTarget || a.iAmProposer ? null : w.why), tally(a),
        a.iAmProposer ? two(btn('Take it back', 'quiet', { 'data-act': 'vote-withdraw', onclick: () => call({ kind: 'withdraw' }) })) : null);
}
/** A vote I must answer: a decision sheet (the map is live above it): the situation, why, the tally, "no" on the left and "yes" on the right. */
export function voteSheet(c, a) {
    const w = voteWords(c, a), call = body => c.table[a.kind](body);
    const body = h('div', { class: `tb-card ${a.kind}`, 'data-table-card': a.kind, 'data-key': a.key, role: 'group' }, ask(w.situation, w.why), tally(a));
    const footer = footRow({ secondary: btn(w.ask.no, '', { 'data-act': 'vote-no', onclick: () => call({ kind: 'vote', yes: false }) }), primary: primary(w.ask.yes, { 'data-act': 'vote-yes', onclick: () => call({ kind: 'vote', yes: true }) }) });
    return c.modal(w.isAway ? 'A vote to mark a seat away' : 'A vote to end the game', body, { footer, bare: true, eyebrow: 'The table asks' });
}

/** What the tray shows about the table's agreements: the votes that only need telling. A vote I must cast is voteSheet's. Returns [nodes]. */
export function tableCards(c) {
    const ag = agreements(c.answer, c.mySeat), out = [];
    for (const a of [ag.away, ag.quit]) if (a && !(c.sheetDue && mustVote(a))) out.push(voteCard(c, a));
    return out;
}
/** Whether there is a vote I have not answered. */
export const pendingVote = (answer, mySeat) => { const ag = agreements(answer, mySeat); return [ag.away, ag.quit].find(a => a && mustVote(a)) ?? null; };

// ------------------------------------------------------------------------------------------------------------------------------- marked away, and back
/** I am marked away: the autopilot is playing for me. Opening the game brings me back; this is for a phone that has the page but no live stream. A decision sheet: "I am back". */
export function awaySheet(c) {
    const me = c.crew.find(p => p.mine);
    const body = h('div', { class: 'tb-card you-away', 'data-table-card': 'you-away', role: 'status' },
        ask('You are marked away.', `The table asked for the autopilot to play ${me?.character ?? 'your character'} while you were gone. Press the button and you play again from your next question.`));
    return c.modal('Marked away', body, { footer: footRow({ primary: primary('I am back', { 'data-act': 'away-back', onclick: () => c.table.away({ kind: 'back' }) }) }), bare: true, eyebrow: 'The table' });
}
/** "Welcome back": what the autopilot did in my name while I was marked away. Shown once for each time. */
export function welcomeSheet(c, rec, onOk) {
    const me = c.crew.find(p => p.mine);
    const body = h('div', { class: 'tb-card welcome', 'data-table-card': 'welcome', role: 'status' },
        ask('Welcome back.', `While you were away the autopilot ${autopilotWords(rec.answers)} for ${me?.character ?? 'your character'}. What it did stands, and it is in the journal. You play from your next question.`));
    return c.modal('Welcome back', body, { footer: footRow({ primary: primary('Carry on', { 'data-act': 'welcome-back-ok', onclick: onOk }) }), bare: true, eyebrow: 'The table' });
}
/** A vote that ended without the table agreeing: one line and one button, in the tray. */
export function noteCard(text, onOk) {
    return h('div', { class: 'tb-card note tb-noterow', 'data-table-card': 'note', role: 'status' }, h('span', { class: 'ds-text tb-notetext' }, text), btn('Got it', 'sm', { 'data-act': 'note-ok', onclick: onOk }));
}
export { autopilotRecord };

/** In the players sheet, under a seat's row: how long it has been gone, "Away (autopilot)", "left the map", and (when it has been gone long enough) the button that asks the table to mark it away. */
export function seatNote(c, p) {
    const s = standingOf(c.answer, p.seat);
    if (!s) return null;
    const mk = markable(c.answer, c.mySeat).find(x => x.seat === p.seat);
    const bits = [];
    if (p.left) bits.push(h('span', { class: 'ds-tag tb-badge left', 'data-badge': 'left' }, `Left the map on day ${p.left.day}`));
    else if (p.autopilot) bits.push(h('span', { class: 'ds-tag bad tb-badge away', 'data-badge': 'away' }, 'Away: the autopilot plays'));
    else if (!s.present && s.absentFor >= 60 && !s.waiting && !mk) bits.push(h('span', { class: 'ds-tag tb-badge', 'data-badge': 'gone' }, `Gone ${gone(s.absentFor)}`));
    if (mk) bits.push(h('span', { class: 'ds-tag bad tb-gone', 'data-badge': 'gone' }, `Gone ${mk.text}.`), h('span', { class: 'ds-meta tb-why' }, 'If the table agrees, the autopilot plays for them: it stays hidden, rests when tired, turns every offer down and never ends a Sudden Death. Nothing is skipped, and they take over the moment they open the game.'), btn(`Ask to mark ${p.player} away`, 'sm tb-mark', { 'data-act': 'mark-away', 'data-seat': p.seat, disabled: c.ui.tableBusy || null, onclick: () => c.table.away({ kind: 'propose', seat: p.seat }) }));
    return bits.length ? h('div', { class: 'tb-note' }, ...bits) : null;
}
/** The foot of the players sheet: ending the game early and leaving the map. */
export function tableActions(c, { onQuit, onLeave }) {
    if (!mayVote(c.answer)) return null;
    const lm = mayLeaveMap(c.answer, c.st), ag = agreements(c.answer, c.mySeat);
    return h('div', { class: 'tb-actions-foot', 'data-table-actions': '' },
        sect('Stop early'),
        h('div', { class: 'tb-actions-row' },
            btn(ag.quit ? 'The table is voting on it' : 'Ask the table to end the game', ag.quit ? 'is-dim' : '', { 'data-act': 'quit-ask', 'aria-disabled': ag.quit ? 'true' : null, disabled: !!ag.quit || null, onclick: onQuit }),
            btn('Leave the map', lm.ok ? '' : 'is-dim', { 'data-act': 'leave-map', 'aria-disabled': lm.ok ? null : 'true', disabled: !lm.ok || null, onclick: onLeave })),
        h('p', { class: 'ds-meta' }, lm.ok ? 'Ending the game needs every player to agree. Leaving the map is yours alone: your score is fixed at once and the others play on.' : lm.why));
}

// ------------------------------------------------------------------------------------------------------------------------------- the questions
/** Sudden Death (R-20). The question is asked of every player who has met every goal; the first to say end ends it. Decision first: the situation, why, then the choices, "End" on the right. */
export function endOptionSheet(c, q) {
    const m = endOption(c.st, q, c.st.ch.id), busy = !!c.ui.busy;
    const body = h('div', { class: 'tb-end', 'data-end-option': String(q.day ?? '') },
        ask(m.situation, m.why),
        sect('Who qualified'),
        h('ul', { class: 'tb-qual ds-list' }, ...m.who.map(x => h('li', { class: `ds-row${x.mine ? ' sel' : ''}`, 'data-qual': x.id }, h('span', { class: 'main' }, h('b', {}, `${x.player}${x.mine ? ' (you)' : ''}`), h('span', {}, x.character, ' has met every goal'))))),
        h('p', { class: 'ds-meta' }, 'Nobody who has not met every goal is asked. Whoever ends it ends it for everybody, at this Midnight.'));
    const footer = footRow({ note: 'Midnight, day ' + (q.day ?? c.st.day) + '. The game waits for you.',
        secondary: btn(m.stay, '', { 'data-act': 'end-stay', disabled: busy || null, onclick: () => c.act({ type: 'end-option', end: false }) }),
        primary: primary(m.end, { 'data-act': 'end-go', disabled: busy || null, onclick: () => c.act({ type: 'end-option', end: true }) }) });
    return c.modal('Sudden Death', body, { footer, bare: true });
}

/** Ask the table to end the game: what it means before it is asked. */
export function quitSheet(c) {
    const mine = c.st.ch, close = () => { c.ui.sheet = null; c.render(); };
    const body = h('div', { class: 'tb-confirm', 'data-confirm': 'quit' },
        ask('Ask the table to end the game now?', 'Every player still on the map is asked. If all say yes, the game stops at once and each of you is scored as you stand today; one no and it goes on as before.'),
        h('p', { class: 'ds-text' }, `You would stand at Fame ${mine.fame}, Notoriety ${mine.notoriety}, ${mine.gold} gold. Goals count as they are now: what you have not earned yet counts against you.`));
    const footer = footRow({ secondary: btn('Play on', '', { 'data-act': 'quit-stay', onclick: close }),
        primary: primary('Ask the table', { 'data-act': 'quit-go', disabled: c.ui.tableBusy || null, onclick: () => { close(); c.table.quit({ kind: 'propose' }); } }) });
    return c.modal('End the game', body, { close, footer, bare: true });
}
/** Leave the map (R-21, R-28): scored at once, never starts again, the others play on. */
export function leaveSheet(c, vpNow) {
    const mine = c.st.ch, close = () => { c.ui.sheet = null; c.render(); }, lm = mayLeaveMap(c.answer, c.st);
    const body = h('div', { class: 'tb-confirm', 'data-confirm': 'leave' },
        ask('Leave the map for good?', 'Your character walks off the map. Your score is fixed at what you have this moment, your hirelings are let go and what you carry leaves play with you. You do not start again, and you keep watching.'),
        h('p', { class: 'ds-text' }, `${mine.name}: Fame ${mine.fame}, Notoriety ${mine.notoriety}, ${mine.gold} gold, ${vpNow > 0 ? `+${vpNow}` : vpNow} victory points as you stand. The others play on, and see your score at the end.`),
        lm.ok ? null : h('p', { class: 'ds-hint-line bad' }, lm.why));
    const footer = footRow({ secondary: btn('Stay', '', { 'data-act': 'leave-stay', onclick: close }),
        primary: primary('Leave the map', { 'data-act': 'leave-go', disabled: !lm.ok || c.ui.tableBusy || null, onclick: () => { close(); c.table.quit({ kind: 'leave' }); } }, 'danger') });
    return c.modal('Leave the map', body, { close, footer, bare: true });
}

// ------------------------------------------------------------------------------------------------------------------------------- the end of the game
const sign = n => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const NAME = { great: 'Great Treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
/** The shared end sheet: the verdict first (who won, or that the win is shared), then every place, then each character's goals, then the realm laid bare. */
export function endSheet(c, { title, onBack, close }) {
    const { st, ui, data } = c, s = st.score, m = endModel(st, c.answer, st.ch.owner);
    if (!m) return c.modal(title, h('div', { class: 'oversheet' }, ask('The game is over.', 'The score is being worked out.')), { close, bare: true });
    const open = (k, dflt = false) => (ui.ovOpen?.[k] ?? dflt);
    const keep = k => ev => { (ui.ovOpen ??= {})[k] = ev.target.open; };
    const crewOf = name => c.crew?.find(p => p.player === name) ?? null;
    const hero = h('div', { class: `sf-hero ${m.mineWon ? 'win' : 'lose'}${m.tie ? ' tie' : ''}`, role: 'status', 'data-hero': m.tie ? 'tie' : 'win' },
        h('span', { class: 'ds-eyebrow' }, m.tie ? 'Shared victory' : 'Victory'),
        h('h1', {}, joinList(m.victors.map(v => v.name))),
        h('p', { class: 'ds-voice lg' }, m.sub),
        h('p', { class: 'ds-meta ov-why', 'data-why': m.reason }, m.why));
    const places = h('ol', { class: 'tb-places ds-list', 'data-places': '' }, ...m.players.map(p => h('li', { class: `ds-row tb-place${p.victor ? ' victor' : ''}${p.mine ? ' me sel' : ''}`, 'data-player': p.name, 'data-rank': p.rank },
        h('span', { class: 'tb-rank' }, String(p.rank), h('small', {}, place(p.rank).replace(/^\d+/, ''))),
        crewOf(p.name) ? pcEl(crewOf(p.name), { size: 30 }) : null,
        h('span', { class: 'main tb-pname' }, h('b', {}, `${p.name}${p.mine ? ' (you)' : ''}`), h('span', {}, p.chars.map(x => `${x.name}${x.dead ? ' (fallen)' : ''}${x.gone ? `, left the map on day ${x.gone}` : ''}`).join(' · '))),
        h('span', { class: `end ov-pts ${p.total >= 0 ? 'up' : 'down'}` }, sign(p.total), p.victor ? h('small', { class: 'tb-win', 'aria-label': m.tie ? 'shares the victory' : 'victor' }, m.tie ? 'shares it' : 'victor') : null))));
    const details = m.players.map(pl => h('details', { class: 'ov-details ds-group player', open: open(`p:${pl.id}`, pl.mine) || null, ontoggle: keep(`p:${pl.id}`) },
        h('summary', {}, h('b', {}, pl.name), ' ', h('span', { class: `ov-pts ${pl.total >= 0 ? 'up' : 'down'}` }, sign(pl.total))),
        ...pl.chars.map(ch => { const cc = s.chars[ch.id]; return h('div', { class: 'ov-char' }, h('b', {}, cc.name + (cc.dead ? ' (fallen)' : '')),
            ...(cc.rows ?? []).filter(r => r.need > 0).map(r => h('p', { class: 'ds-meta' }, `${NAME[r.cat] ?? r.cat}: ${r.earned} of ${r.need} · ${sign(r.basic + r.bonus)}${r.diff < 0 ? ' (short: counted three times)' : ''}`))); })));
    const r = m.reveal;
    const lines = list => list.map(x => data.spells?.[x]?.name ?? x).join(', ') || 'none';
    const revealBox = r ? h('details', { class: 'ov-details ds-group tb-reveal', 'data-reveal': r.verified ? 'verified' : 'mismatch', open: open('reveal') || null, ontoggle: keep('reveal') },
        h('summary', {}, h('b', {}, 'The realm laid bare'), ' ', h('span', { class: `ds-tag ${r.verified ? 'good' : 'bad'} tb-check`, 'data-check': r.verified ? 'verified' : 'mismatch' }, r.verified ? 'verified' : 'does not match')),
        r.verified
            ? h('p', { class: 'ds-meta' }, 'The seed below is the one the realm was made from, and it matches the commitment published when the game began: nobody could have changed the map or the dice after seeing how it went.')
            : h('p', { class: 'ds-hint-line bad', role: 'alert' }, 'The seed does NOT match the commitment published when the game began. Tell the host: this game should not be trusted.'),
        h('p', { class: 'tb-seed ds-meta', 'data-seed': '' }, h('b', {}, 'Seed '), String(r.seed), h('br'), h('b', {}, 'Salt '), String(r.salt).slice(0, 24), String(r.salt).length > 24 ? '…' : '', h('br'), h('b', {}, 'Commitment '), String(r.commit).slice(0, 24), '…'),
        ...r.chars.map(x => h('div', { class: 'tb-rchar', 'data-rchar': x.id }, h('b', {}, `${x.player ? `${x.player}’s ` : ''}${x.name}`),
            h('p', { class: 'ds-meta' }, `Chose: ${x.goals}${x.start ? ` · began at the ${x.start}` : ''}`),
            h('p', { class: 'ds-meta' }, `Spells: ${lines(x.spells.recorded ?? [])}${(x.spells.learned ?? []).length ? ` (learned in play: ${lines(x.spells.learned)})` : ''}`)))) : null;
    const body = h('div', { class: 'oversheet sf-end', 'data-shared-over': '' }, hero, sect('The places'), places, ...details, revealBox);
    return c.modal(title, body, { close, detent: 'tall', bare: true, footer: footRow({ primary: primary('Back to the table', { 'data-act': 'over-title', onclick: onBack }) }) });
}
