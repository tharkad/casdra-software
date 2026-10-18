// play/tray.js: the tray, the decision layer under the map (mockup 01): the last action (one line, tap = the Journal), one situation line, and the action row (pips or a count on the left,
// ONE primary on the right). It replaces the dock, the dice bar and the drawer. While a plan is being made the plan tray stands in its body (plan.js). Shared table: the players strip and the
// waiting or decision cards of the table take the body (they scroll, the tray never grows past its budget).
import { energizeOptions } from '../../../engine/magic/energize.js';
import { heldOptions } from '../../../engine/magic/phase.js';
import { phasesFor } from '../../../engine/day.js';
import { isMountain, nameOfClearing } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { h } from '../../dom.js';
import { btn, last, pips, primary, situ, tray, twoLine } from '../../ds.js';
import { actIcon } from '../../icons.js';
import { isMeetLine, meetButton, playerOf as playerNameOf } from '../../meet.js';
import { turnOrderLine } from '../../party.js';
import { playersStrip } from '../../shared_ui.js';
import { storyRoll } from '../../storyvoice.js';
import { isStory, logText } from '../../voice.js';
import { blockCard, followCard, newDraft as newMeetDraft, resultCards, waitingCard, windowCard } from '../meetui.js';
import { autopilotRecord, awayCard, pendingVote, tableCards, welcomeCard } from '../tableui.js';
import { act } from './actions.js';
import { journalFresh, popJournal } from './journal.js';
import { ACT_LABEL, actArt, mc, showToast, tc } from './kit.js';
import { phaseResultLine, searchWhere, tableName } from './phases.js';
import { newDraft, planTray } from './plan.js';
import { deathBox } from './results.js';
import { sharedBanner, showPlayer } from './shared.js';
import { render } from './shell.js';
import { backSeen, logEnd, markBackSeen, myId, newMeetLines } from './state.js';

const nb = s => String(s).replace(/ (\d+)$/, ' $1');                      // "Curst Valley 4" never breaks before its number

// ---- the last action: one line, what happened most recently, in the voice the player chose ----
const LABEL = { combat: 'The fight', trade: 'Trade', loot: 'Loot', discover: 'Discovery', curse: 'A curse', monster: 'The wilds', native: 'The wilds', block: 'Blocked' };
function lastParts(G) {
    const st = G.st, p = st.pending, log = st.log ?? [];
    const skip = l => l.k === 'day' || l.k === 'info' || (G.shared && isMeetLine(l));
    let i = log.length - 1;
    while (i >= 0 && skip(log[i])) i--;
    // Birdsong: today's Monster roll is the newest line, but the morning asks about last night
    const birdsong = p?.type === 'plan' && st.day > 1;
    if (birdsong) {
        let j = i; while (j >= 0 && (skip(log[j]) || log[j].k === 'roll' || log[j].day === st.day)) j--;
        const l = j >= 0 && log[j].day === st.day - 1 ? log[j] : null;
        return { b: 'Last night', t: l ? logText(l) : 'A quiet evening. Nothing came for you.', dice: [] };
    }
    const l = log[i];
    if (!l) return { b: 'Your story', t: 'begins here.', dice: [] };
    const rollFor = line => { const m = (st.rolls ?? []).findLast(r => line.t.includes(`${r.what}: rolled ${r.dice.join('+')}`)); return m ?? null; };
    if (l.k === 'roll') {
        const r = rollFor(l), tale = r && isStory() ? storyRoll(r) : null;
        return { b: tale?.title ?? r?.what ?? 'The dice', t: tale?.line ?? logText(l), dice: r?.dice ?? [] };
    }
    if (l.k === 'phase') {
        const n = Number(/^Phase (\d+)/.exec(l.t)?.[1]), slot = st.plan?.[n - 1], rl = n ? phaseResultLine(G, n) : null;
        let j = i - 1; while (j >= 0 && (log[j].k === 'info' || (log[j].k === 'roll' && false))) j--;
        const r = j >= 0 && log[j].k === 'roll' ? rollFor(log[j]) : null;
        return { b: slot ? (slot.act === 'search' && slot.table ? tableName(G, slot.table).split(':')[0] : ACT_LABEL[slot.act] ?? 'Phase') : 'Phase', t: rl?.text ?? logText(l), dice: r?.dice ?? [], phase: n || null };
    }
    return { b: LABEL[l.k] ?? 'Lately', t: logText(l), dice: [] };
}

function lastLine(G) {
    const x = lastParts(G), news = journalFresh(G).length;
    const el = last({ dice: x.dice.slice(0, 3), b: x.b, t: x.t, attrs: { 'data-act': 'dice', 'aria-label': `The last action: ${x.b}. ${x.t} Open the Journal`, onclick: () => { G.ui.sheet = 'journal'; render(G); } } });
    if (x.phase) el.dataset.phaseResult = String(x.phase);                  // (the phase that was just played, told in the line)
    if (news) el.append(h('i', { class: 'ds-newdot', 'aria-label': `${news} new` }));
    return el;
}

// ---- the day's phases as pips (the real action art): done, now, to come, empty, locked (the second half of a climb) ----
function dayPips(G, cur) {
    const plan = G.st.plan ?? [];
    const list = plan.map((s, i) => {
        const prev = plan[i - 1], locked = s?.act === 'move' && prev?.act === 'move' && prev.to === s.to && isMountain(G.st, G.data, s.to);
        const state = i < cur ? 'done' : i === cur ? 'now' : !s ? 'empty' : '';
        return [s ? actArt(s.act) : 'ban', locked && i >= cur ? `${state} locked`.trim() : state];
    });
    return pips(list, { cls: list.length > 5 ? 'many' : '', attrs: { 'aria-label': `Your day: phase ${Math.min(cur + 1, plan.length)} of ${plan.length}`, 'data-act': 'plan-view', onclick: () => { G.ui.sheet = 'journal'; render(G); } } });
}

// ---- what the primary says: a verb and, under it, the detail ("Move" / "to Bad Valley 2") ----
function phasePrimary(G, slot) {
    const a = slot?.act ?? 'nothing';
    let main = a === 'nothing' ? 'Do nothing' : ACT_LABEL[a] ?? a, small = null;
    if (a === 'move' && slot.to) small = `to ${nb(nameOfClearing(slot.to))}`;
    else if (a === 'search' && slot.table) small = tableName(G, slot.table);
    else if (a === 'follow' && slot.who) small = playerNameOf(G.st, slot.who);
    return btn(small ? twoLine(main, small) : main, 'primary', { 'data-act': 'next', onclick: () => act(G, { type: 'next' }) });
}

// a question that is on a sheet: the tray stands dim under it and says what it is waiting for
const WAITING = { 'turn-end': ['End of turn', ''], rest: ['Rest', 'choose a chit'], 'search-table': ['Search', 'choose a table'], 'search-choice': ['Search', 'your choice'], 'effort-cost': ['Pay', 'with effort'], 'runes-target': ['Read runes', 'choose which'],
    'learn-spell': ['Learn', 'a spell'], 'enchant-choice': ['Enchant', 'choose'], trade: ['Trade', 'choose'], 'trade-offer': ['Trade', 'the price'], hire: ['Hire', 'choose'], 'hire-offer': ['Hire', 'the price'] };

export function renderTray(G) {
    const p = G.st.pending, st = G.st;
    const where = st.ch.onRoad ? 'On the road' : nameOfClearing(st.ch.at);
    const planning = p?.type === 'plan' && G.ui.sheet === 'plan' && G.ui.draft;
    const banner = G.shared && !p ? sharedBanner(G) : null;
    const m = { last: null, body: [], situ: null, lead: null, primary: null, cls: [] };
    const hid = st.ch.hidden ? 'hidden' : 'in plain sight';
    m.situ = situ(nb(where), hid);
    // what he has become (a creature, mist, a flier) is part of where he is
    const form = st.ch.morph ? `a ${st.ch.morph.creature?.name ?? 'creature'}` : st.ch.mist ? 'mist' : st.ch.flying ? 'flying' : null;
    if (form) m.situ.querySelector('.tag').textContent = `${form} · ${hid}`;
    popJournal(G);
    m.last = lastLine(G);

    // free spell actions at the start of a phase: wake a permanent spell with a colour chit, or use a Phase spell he is holding
    const freeActs = p && (p.type === 'phase' || p.type === 'plan') ? [
        ...energizeOptions(st, G.data).map(o => h('button', { class: 'ds-chip spellact', 'data-act': 'energize', 'data-fx': o.fx, title: `Burn an enchanted chit (${o.chits.length} held) to wake it: it works until Midnight`, onclick: () => act(G, { type: 'energize', fx: o.fx, colorChit: o.chits[0] }) }, `Energize ${o.name}`)),
        ...(p.type === 'phase' ? heldOptions(st, G.data).map(o => h('button', { class: 'ds-chip spellact', 'data-act': 'protect', 'data-fx': o.fx, title: 'It lasts through this phase (it also holds off your own helpful spells)', onclick: () => act(G, { type: 'protect', fx: o.fx }) }, `Use ${o.name}`)) : []),
    ] : [];

    if (planning) {
        // the plan tray (plan.js): tabs, one line, the nine actions, and Start the day
        const pl = planTray(G);
        m.last = null; m.situ = null; m.body = [pl.body]; m.lead = pl.lead; m.primary = pl.primary; m.cls.push('planning');
    } else if (!p) {
        if (!G.shared) { m.body = [h('p', { class: 'ds-lead-text' }, 'Working...')]; }
    } else if (p.type === 'plan') {
        m.lead = h('span', { class: 'ds-lead-text' }, h('b', {}, `${phasesFor(st, G.data, []).total} phases`), ', planned in secret');
        m.primary = primary('Plan your day', { 'data-act': 'plan', onclick: () => { G.ui.draft ??= newDraft(G); G.ui.sheet = 'plan'; render(G); } });
    } else if (p.type === 'phase') {
        const slot = st.plan[p.i];
        m.lead = dayPips(G, p.i);
        m.primary = phasePrimary(G, slot);
        if (slot?.act === 'search' && !st.ch.onRoad) m.body.push(h('p', { class: 'ds-hint-line', 'data-hint': 'search-where' }, searchWhere(G, st.ch.at)));
    } else if (p.type === 'phase-pick') {
        // Prophecy: no plan was recorded; each phase is chosen as it comes (the printed rule: he learns his day as he lives it)
        m.body.push(h('div', { class: 'ds-acts pickacts' }, ...p.acts.map(a => h('button', { class: `ds-act${G.ui.pickAct === a.act ? ' on' : ''}`, 'data-pick-act': a.act, onclick: () => { G.ui.pickAct = G.ui.pickAct === a.act ? null : a.act; render(G); } }, actIcon(actArt(a.act), 28), ACT_LABEL[a.act] ?? a.act))));
        m.lead = h('span', { class: 'ds-lead-text' }, h('b', {}, `Phase ${p.i + 1}`), `, ${p.regularLeft ?? '?'} left${p.extrasLeft ? ` + ${p.extrasLeft} extra` : ''}`);
        m.primary = primary(twoLine('Follow the suggestion', 'or choose above'), { 'data-act': 'next', onclick: () => act(G, { type: 'next' }) });
    } else if (p.type === 'over') {
        m.body.push(G.shared ? h('div', { class: 'note' }, 'The game is over.') : st.ch.dead || st.over?.reason === 'died' ? deathBox(G) : null);
        m.primary = primary('See your result', { 'data-act': 'see-result', onclick: () => { G.ui.sheet = 'over'; render(G); } });
    } else if (p.type === 'restart') {
        m.body.push(ask('You have fallen.', 'Choose who returns and set new goals; then the day goes on.', { compact: true }));
        m.situ = null;
    } else if (G.shared && p.type === 'end-option') {
        m.body.push(ask('Sudden Death: you have met every goal.', 'The game waits for you to say whether it ends at this Midnight. The question is on screen; the map is one tap away.', { compact: true }));
    } else if (G.shared && p.type === 'meet-offer') {
        m.body.push(ask(`${playerNameOf(st, p.from)} has made you an offer.`, 'The offer is on screen. Look at it, then accept or decline; the map is one tap away.', { compact: true }));
    } else if (G.shared && (p.type === 'meet-block' || p.type === 'meet-follow' || p.type === 'meet-window')) {
        if (p.type === 'meet-window' && G.ui.windowDay !== st.day) { G.ui.windowDay = st.day; G.ui.windowLog = logEnd(G); }          // (what counts as "traded" starts when the window opens)
        const k = (p.type === 'meet-block' ? blockCard : p.type === 'meet-follow' ? followCard : windowCard)(mc(G), p);
        m.body.push(k.body); m.primary = k.actions; m.rawActions = true;
    } else {
        // a question that waits on a sheet (a table, a trade, a hire, a rest ...): the tray stands dim under it
        const [main, small] = WAITING[p.type] ?? ['Your answer', 'is waiting'];
        m.primary = btn(small ? twoLine(main, small) : main, 'primary is-dim', { 'aria-disabled': 'true', onclick: () => showToast(G, 'The question above is waiting for you.') });
    }

    // Meeting other characters: my own offer is open (the game waits and says so), or I may meet someone now
    if (G.shared && G.ms && !planning) {
        if (G.ms.made && (!p || p.type === 'phase' || p.type === 'phase-pick' || p.type === 'meet-window')) { const w = waitingCard(mc(G)); m.body = [w.body]; m.primary = w.actions; m.rawActions = true; }
        else if (!p && G.crew.find(x => x.mine)?.status === 'following') {
            // I follow someone: his turn is mine. I may stop at the start of any of his activities (the game says so if it is not the moment)
            m.primary = btn(`Stop following ${playerNameOf(st, st.follows?.[st.ch.id] ?? '')}`.trim(), '', { 'data-act': 'stop-follow', onclick: () => act(G, { type: 'meet', kind: 'stop-follow' }) });
        } else if (p?.type === 'phase' && st.ch.hidden && Object.values(st.follows ?? {}).includes(st.ch.id) && !G.ms.made) {
            // a hidden guide may leave behind followers who have not found hidden enemies (7.11.6a.1); the game says if every one has
            const g = playerNameOf(st, Object.keys(st.follows).find(f => st.follows[f] === st.ch.id));
            m.body.push(h('p', { class: 'ds-hint-line', 'data-hint': 'ditch' }, `You are hidden and ${g} follows you. You may slip away and leave ${g} behind, unless they have found hidden enemies today.`));
            m.lead = btn('Leave them behind', 'sm', { 'data-act': 'ditch', onclick: () => act(G, { type: 'meet', kind: 'ditch' }) });
        } else if (G.ms.partners.length && (!p || p.type === 'phase' || p.type === 'phase-pick')) {
            const mb = meetButton(G.ms, st, myId(G));
            m.lead = btn(mb.label, 'sm meetbtn', { 'data-act': 'meet', 'data-meet-certain': mb.certain ? '1' : '0', 'aria-label': `Meet ${mb.names}: give or trade`, onclick: () => { G.ui.meet = null; G.ui.sheet = 'meet'; render(G); } });
        }
    }
    if (freeActs.length) m.body.push(h('div', { class: 'spellacts' }, ...freeActs));

    // shared table: the players strip, the table's agreements, what others did in plain sight, the waiting card
    const mlines = newMeetLines(G);
    const meetCards = G.shared ? resultCards(mc(G), mlines) : [];
    let tableEls = [];
    if (G.shared && G.answer) {
        const tcx = tc(G), pv = pendingVote(G.answer, G.mySeat), rec = autopilotRecord(st, playerNameOf(st, st.ch.id)), back = !G.answer.you?.away && rec.back >= 0 && rec.key && !backSeen(G, rec.key) ? rec : null;
        const note = G.ui.tableNote ? h('div', { class: 'tb-card note', 'data-table-card': 'note', role: 'status' }, ask(G.ui.tableNote.text, null, { compact: true }),
            h('div', { class: 'row-end' }, h('button', { class: 'btn', 'data-act': 'note-ok', onclick: () => { G.ui.tableNote = null; render(G); } }, 'Got it'))) : null;
        tableEls = [...(note ? [note] : []), ...(G.answer.you?.away ? [awayCard(tcx)] : []), ...(back ? [welcomeCard(tcx, back, () => { markBackSeen(G, back.key); render(G); })] : []), ...tableCards(tcx)];
    }
    const decisionFirst = !!(G.shared && ((p && /^meet-(block|follow|window)$/.test(p.type)) || G.ms?.made));
    const orderLine = G.shared && !banner ? turnOrderLine(st) : null;
    if (G.shared) {
        const waitingIds = new Set((G.answer?.waitingFor ?? []).map(w => w.character)), meetIds = new Set(G.ms ? G.ms.partners.map(x => x.id) : []);
        const tapChip = x => { if (meetIds.has(x.id) && !G.ms.made) { G.ui.meet = newMeetDraft(); G.ui.meet.to = x.id; G.ui.sheet = 'meet'; render(G); } else showPlayer(G, x); };
        const own = m.body;
        m.strip = playersStrip(G.crew, { onTap: tapChip, waitingIds, meetIds });
        m.body = [...tableEls, ...meetCards, ...(decisionFirst ? own : []), banner, ...(decisionFirst ? [] : own),
            orderLine ? h('p', { class: 'wc-order', 'data-order': '' }, orderLine) : null].filter(Boolean);
        m.shared = true;
        if (banner || decisionFirst) { m.last = null; m.situ = null; }
    }
    m.body = m.body.filter(Boolean);

    // build with the design system's tray, then move it into the persistent element
    const body = [m.strip ?? null, m.body.length ? h('div', { class: 'tray-body' }, ...m.body) : null];
    const lead = m.lead, pr = m.primary;
    const t = tray({ last: m.last, situ: m.situ, body, lead, primary: m.rawActions ? null : pr });
    if (m.rawActions && pr) t.querySelector('.ds-actions').append(pr);
    const actions = t.querySelector('.ds-actions');
    if (!lead && !pr) actions.remove();
    G.tray.className = `ds-tray gdock${m.cls.length ? ' ' + m.cls.join(' ') : ''}${m.shared ? ' shared' : ''}${p ? '' : ' idle'}`;
    G.tray.dataset.state = planning ? 'plan' : p?.type ?? 'idle';
    G.tray.replaceChildren(...t.childNodes);
    wireGrab(G, G.tray.querySelector('.ds-grab'));
}

// The handle on the tray: a tap or a pull up opens the Journal (the tray itself never opens or closes).
function wireGrab(G, grab) {
    if (!grab) return;
    let y0 = null;
    grab.style.touchAction = 'none';
    grab.setAttribute('role', 'button'); grab.setAttribute('aria-label', 'Open the Journal'); grab.dataset.act = 'dock-toggle';
    grab.addEventListener('pointerdown', e => { if (!e.button) y0 = e.clientY; });
    grab.addEventListener('pointerup', e => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (dy < -24 || Math.abs(dy) < 8) { G.ui.sheet = 'journal'; render(G); } });
    grab.addEventListener('pointercancel', () => { y0 = null; });
}
