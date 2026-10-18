// play/actions.js: how an action reaches the game. act() applies it locally, or sends it to the race (actRemote) or to the shared table (actShared); applyAnswer takes the server's
// answers back in; tableCall / tableNews are the shared table's agreements; refresh, abandon and copyInvite are the online helpers the menu uses.
import { apply } from '../../../engine/day.js';
import { daySnapshot, finalize } from '../../../engine/gamerecord.js';
import { upgradeState } from '../../../engine/party.js';
import { putRecord } from '../../gamestore.js';
import { inviteLink } from '../../online.js';
import { observe, party } from '../../party.js';
import { markPhase } from './result_card.js';
import { render } from './shell.js';
import { clearSaved, meetEnd, myId, noteError, persist, saveGame } from './state.js';

function commit(G, next) { G.st = next; G.ctx.state = G.st; if (!G.race && !G.shared) saveGame(G.st); render(G); }

export function act(G, action) {
    G.ui.combatMap = false; G.ui.mapPeek = false; if (action.type !== 'tidy') G.ui.tradePick = null;
    if (action.type !== 'tidy') markPhase(G, action);                                // (a phase begins: the result card measures what it brought)
    if (action.type !== 'tidy') { G.ui.gainSeen = G.st.gainSeq ?? 0; G.ui.findSeen = G.st.findSeq ?? 0; if (G.shared) G.ui.meetSeen = meetEnd(G); }          // what he found last time is old news once he does something else
    if (G.race) { actRemote(G, action); return; }
    if (G.shared) { actShared(G, action); return; }
    try {
        const next = apply(G.st, G.data, action);
        G.rec?.moves.push(JSON.parse(JSON.stringify(action)));
        const newDay = next.day !== G.st.day;
        commit(G, next);
        if (newDay) G.rec?.days.push(daySnapshot(next));
        persist(G, next.period === 'over');
    } catch (e) {
        noteError(G, action, e, 'rejected');
        G.ui.toast = e.message; render(G); setTimeout(() => { G.ui.toast = null; render(G); }, 2600);
    }
}

async function actRemote(G, action) {
    if (G.inflight) return;
    G.inflight = true; G.ui.busy = true; render(G);
    try { const r = await G.conn.act(action); G.st = r.view; commit(G, G.st); }
    catch (e) {
        if (e.status === 409 && e.body?.view) commit(G, e.body.view);
        G.ui.toast = e.message; render(G); setTimeout(() => { G.ui.toast = null; render(G); }, 2600);
    } finally { G.inflight = false; G.ui.busy = false; render(G); }
}

// ---- a shared table ----
// Every answer the server gives (the reply to my own action, a push, a poll) comes through here. An older one than I hold is ignored.
export function applyAnswer(G, a) {
    if (!a || a.view == null) return;
    if (G.answer && a.seq < G.answer.seq) return;
    const before = G.st;
    tableNews(G, G.answer, a);
    G.answer = a; G.standings = a.standings ?? [];
    G.st = upgradeState(a.view); G.ctx.state = G.st;
    G.crew = party(G.st, a, myId(G));
    if (G.st.pending?.type !== 'restart') { G.ui.sharedRestartVp = null; G.ui.sharedRestartChar = null; }
    // the game just ended: the result is told first (places, a shared victory, the realm laid bare), once
    if (G.st.period === 'over' && !G.ui.overAuto) { G.ui.overAuto = true; G.ui.sheet = 'over'; G.ui.mapPeek = false; }
    // what the others did in plain sight since I last looked (they moved, hid, fell): the table's own lines are in the log
    if (before?.chars && before.day === G.st.day) { const seen = observe(before, G.st, myId(G)); if (seen.length) G.feed = [...G.feed, ...seen].slice(-6); }
    else if (before && before.day !== G.st.day) G.feed = [];
    if (G.map) render(G);
}

async function actShared(G, action) {
    if (G.inflight) return;
    G.inflight = true; G.ui.busy = true; render(G);
    try { await G.sconn.act(action); }
    catch (e) {
        if (e.name && e.name !== 'Error') console.error('act failed:', e.stack ?? e);          // (a bug in the screen, not a refusal: keep the stack for the bug report)
        G.ui.meetSent = false;
        G.ui.toast = e.status === 409 ? 'The game had moved on; it has been brought up to date.' : e.message; render(G); setTimeout(() => { G.ui.toast = null; render(G); }, 2600);
    } finally { G.inflight = false; G.ui.busy = false; render(G); }
}

// The table's agreements (docs/design/multiplayer-harden-ui.md): a call that changes them takes the answer it gets back through applyAnswer, like any other; one at a time.
async function tableCall(G, fn) {
    if (G.ui.tableBusy) return;
    G.ui.tableBusy = true; render(G);
    try { await fn(); } catch (e) { G.ui.toast = e.message; setTimeout(() => { G.ui.toast = null; render(G); }, 3200); } finally { G.ui.tableBusy = false; render(G); }
}

// A vote that ended without the table agreeing is told once (the card that asked is gone; nobody should wonder what became of it): who it was about, and that the game goes on as before.
function tableNews(G, was, now) {
    if (!was?.votes || !now?.votes) return;
    const skip = G.ui.skipNote; G.ui.skipNote = false;
    const t = was.votes.away;
    if (t && !now.votes.away && !(now.away ?? []).includes(t.target) && !skip) {
        const back = (now.standings ?? []).find(x => x.seat === t.target)?.present;
        G.ui.tableNote = { text: back ? `${t.targetName} is back, so the vote to mark them away ended.` : `The vote to mark ${t.targetName} away did not pass: the game keeps waiting for them.` };
    }
    if (was.votes.quit && !now.votes.quit && now.view?.period !== 'over' && !skip) G.ui.tableNote = { text: 'The vote to end the game did not pass: play goes on.' };
    if (now.votes.away || now.votes.quit) G.ui.tableNote = null;
}

// Back from a lost connection (or another device): take the server's word for where the game is.
export async function refresh(G) { try { const v = await G.conn.view(); G.standings = v.standings; if (!G.inflight && JSON.stringify(v.view) !== JSON.stringify(G.st)) commit(G, v.view); else render(G); } catch { /* the next try will do */ } }

export function abandon(G) {
    if (G.shared) { G.sconn?.unwatch(); G.ctx.go('online'); return; }
    if (G.race) { G.conn?.stop(); G.ctx.go('online'); return; }
    if (G.rec && G.st) { finalize(G.rec, G.st); G.rec.meta.result = 'abandoned'; clearTimeout(G.persistTimer); putRecord(G.rec); }
    clearSaved(); G.ctx.go('title');
}

export function copyInvite(G) {
    const link = inviteLink(G.race);
    (navigator.clipboard?.writeText(link) ?? Promise.reject()).then(() => { G.ui.toast = 'Invite copied.'; render(G); setTimeout(() => { G.ui.toast = null; render(G); }, 2000); },
        () => { G.ui.invite = link; G.ui.sheet = 'race'; render(G); });
}

// The table's agreements as the tableui.js cards call them (`G.table`): ask the server, one call at a time.
export function tableAgreements(G) {
    return { away: body => { if (body.kind === 'withdraw') G.ui.skipNote = true; return tableCall(G, () => G.sconn.away(body)); }, quit: body => { if (body.kind === 'withdraw') G.ui.skipNote = true; return tableCall(G, () => G.sconn.quit(body)); } };
}
