// play/tray.js: the tray, the decision layer under the map (mockup 01): the last action (one line, tap = the Journal), one situation line, and the action row (pips or a count on the left,
// ONE primary on the right). It replaces the dock, the dice bar and the drawer. While a plan is being made the plan tray stands in its body (plan.js). Shared table: the players strip and the
// waiting or decision cards of the table take the body (they scroll, the tray never grows past its budget).
import { nameOf } from '../../../engine/items.js';
import { energizeOptions } from '../../../engine/magic/energize.js';
import { heldOptions } from '../../../engine/magic/phase.js';
import { phasesFor } from '../../../engine/day.js';
import { isMountain, nameOfClearing, tileName } from '../../../engine/world.js';
import { h } from '../../dom.js';
import { btn, last, pips, primary, situ, tray, twoLine } from '../../ds.js';
import { actIcon } from '../../icons.js';
import { isMeetLine, meetButton, playerOf as playerNameOf } from '../../meet.js';
import { turnOrderLine } from '../../party.js';
import { askBox as ask, playersStrip } from '../../shared_ui.js';
import { phasePrompt, storyRoll } from '../../storyvoice.js';
import { guardIfChanged } from '../../tapguard.js';
import { isStory, logText } from '../../voice.js';
import { blockCard, followCard, newDraft as newMeetDraft, resultCards, waitingCard, windowCard } from '../meetui.js';
import { noteCard, tableCards } from '../tableui.js';
import { act } from './actions.js';
import { journalFresh } from './journal.js';
import { ACT_LABEL, actArt, mc, showToast, tc } from './kit.js';
import { phaseResultLine, searchWhere, tableName } from './phases.js';
import { newDraft, planTray } from './plan.js';
import { resultCardFor } from './result_card.js';
import { seatText, sharedBanner, showPlayer, tableSheetDue } from './shared.js';
import { render } from './shell.js';
import { logEnd, myId, newMeetLines } from './state.js';

// A line of the log in the current voice; at a table another seat's 'You' lines are told by name (QA-103).
const lt = (G, l) => (G.shared ? seatText(G, l) : logText(l));

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
        return { b: 'Last night', t: l ? lt(G, l) : 'A quiet evening. Nothing came for you.', dice: [] };
    }
    const l = log[i];
    if (!l) return { b: 'Your story', t: 'begins here.', dice: [] };
    // (the log prints a modified roll as "rolled 5-1+1": the dice are [5, 1], so a roll is also found by its name and first die: QA-10, the dice of a refusal)
    const rollFor = line => (st.rolls ?? []).findLast(r => line.t.includes(`${r.what}: rolled ${r.dice.join('+')}`)) ?? (st.rolls ?? []).findLast(r => line.t.includes(`${r.what}: rolled ${r.dice[0]}`)) ?? null;
    if (l.k === 'roll') {
        const r = rollFor(l), tale = r && isStory() ? storyRoll(r) : null;
        return { b: tale?.title ?? r?.what ?? 'The dice', t: tale?.line ?? lt(G, l), dice: r?.dice ?? [], wilds: r?.what === 'Monster roll' };
    }
    if (l.k === 'phase') {
        const n = Number(/^Phase (\d+)/.exec(l.t)?.[1]), slot = st.plan?.[n - 1], rl = n ? phaseResultLine(G, n) : null;
        let j = i - 1; while (j >= 0 && (log[j].k === 'info' || log[j].k === 'trade')) j--;          // (a refusal's own line sits between the phase and its dice: QA-10)
        const r = j >= 0 && log[j].k === 'roll' ? rollFor(log[j]) : null;
        return { b: slot ? (slot.act === 'search' && slot.table ? tableName(G, slot.table).split(':')[0] : ACT_LABEL[slot.act] ?? 'Phase') : 'Phase', t: rl?.text ?? lt(G, l), dice: r?.dice ?? [], phase: n || null };
    }
    return { b: LABEL[l.k] ?? 'Lately', t: lt(G, l), dice: [] };
}

function lastLine(G) {
    const x = lastParts(G), news = journalFresh(G).length;
    const el = last({ dice: x.dice.slice(0, 3), b: x.b, t: x.t, attrs: { 'data-act': 'dice', 'aria-label': `The last action: ${x.b}. ${x.t} Open the Journal`, onclick: () => { G.ui.sheet = 'journal'; render(G); } } });
    // DR-22: the day's one narrative beat, what is prowling, is read in full (two lines) while no phase has been played yet; every later phase has the one-line rule
    if (x.wilds && G.st.pending?.type === 'phase' && G.st.pending.i === 0) {
        el.classList.add('two');
    }
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
        return [s ? actArt(s.act) : 'dash', locked && i >= cur ? `${state} locked`.trim() : state];
    });
    return pips(list, { cls: list.length > 5 ? 'many' : '', attrs: { 'aria-label': `Your day: phase ${Math.min(cur + 1, plan.length)} of ${plan.length}`, 'data-act': 'plan-view', onclick: () => { G.ui.sheet = 'journal'; render(G); } } });
}

// ---- what the primary says: a verb and, under it, the situation in a few words ("Move" / "to Bad Valley 2", "Hide" / "slip out of sight"). The why of each (phasePrompt) is in the
// primary's tooltip and in the decision sheets' ask lines; the tray keeps its budget. ----
const lowerFirst = t => t.charAt(0).toLowerCase() + t.slice(1);
export function shortPrompt(G, slot) {
    const st = G.st, a = slot?.act ?? 'nothing';
    const weapon = st.ch.items.find(i => i.kind === 'weapon' && i.active && !i.destroyed);
    const pr = phasePrompt(a, { at: nb(nameOfClearing(st.ch.at ?? '')), weapon: weapon ? nameOf(G.data, weapon) : null, magic: !!slot?.magic, enchants: st.turn?.enchants ?? 0, tile: slot?.to ? tileName(slot.to) : null, to: slot?.to ? nb(nameOfClearing(slot.to)) : null });
    let small;
    if (a === 'search') small = slot.table ? tableName(G, slot.table) : 'choose what to look for';
    else if (a === 'move') small = slot.to ? `to ${nb(nameOfClearing(slot.to))}` : null;
    else if (a === 'fly') small = slot?.to ? `over the ${tileName(slot.to)}` : 'take to the air';
    else if (a === 'enchant') small = st.turn?.enchants ? 'shape your power' : 'gather your power';
    else if (a === 'follow') small = slot.who ? playerNameOf(G.st, slot.who) : null;
    else small = lowerFirst(pr.line).replace(/\.$/, '');
    return { small, why: [pr.line, pr.why].filter(Boolean).join(' ') };
}
function phasePrimary(G, slot) {
    const a = slot?.act ?? 'nothing';
    const main = a === 'nothing' ? 'Do nothing' : ACT_LABEL[a] ?? a, { small, why } = shortPrompt(G, slot);
    return btn(small ? twoLine(main, small) : main, 'primary', { 'data-act': 'next', title: why, 'aria-description': why, onclick: () => act(G, { type: 'next' }) });
}

// a question that is on a sheet: the tray stands dim under it and says what it is waiting for
const WAITING = { 'turn-end': ['End of turn', ''], rest: ['Rest', 'choose a chit'], 'search-table': ['Search', 'choose a table'], 'search-choice': ['Search', 'your choice'], 'effort-cost': ['Pay', 'with effort'], 'runes-target': ['Read runes', 'choose which'],
    'learn-spell': ['Learn', 'a spell'], 'enchant-choice': ['Enchant', 'choose'], trade: ['Trade', 'choose'], 'trade-offer': ['Trade', 'the price'], hire: ['Hire', 'choose'], 'hire-offer': ['Hire', 'the price'] };

export function renderTray(G) {
    const p = G.st.pending, st = G.st;
    const where = st.ch.onRoad ? 'On the road' : st.ch.flying ? `Over the ${tileName(st.ch.flying.tile)}` : nameOfClearing(st.ch.at);
    const planning = p?.type === 'plan' && G.ui.sheet === 'plan' && G.ui.draft;
    const banner = G.shared && !p ? sharedBanner(G) : null;
    const m = { last: null, body: [], situ: null, lead: null, primary: null, cls: [] };
    const fallen = !!st.ch.dead;                                           // (a fallen hero is not "in plain sight": QA-18)
    const hid = fallen ? 'fallen' : st.ch.hidden ? 'hidden' : 'in plain sight';
    m.situ = situ(nb(where), hid);
    // what he has become (a creature, mist, a flier) is part of where he is
    const form = st.ch.morph ? `a ${st.ch.morph.creature?.name ?? 'creature'}` : st.ch.mist ? 'mist' : st.ch.flying ? 'flying' : null;
    if (form && !fallen) m.situ.querySelector('.tag').textContent = st.ch.flying ? 'in the air' : `${form} · ${hid}`;
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
        const openPlan = () => { G.ui.draft ??= newDraft(G); G.ui.sheet = 'plan'; render(G); };
        if (p.prophecy) {
            // Prophecy is with him: no plan need be recorded; each phase is chosen as it comes (the printed rule). Recording a day as usual is still allowed.
            m.body.push(ask('Prophecy is with you.', 'You need not plan: choose each phase as it comes, or record a day as usual.', { compact: true }));
            m.situ = null;
            m.lead = btn('Plan it anyway', 'sm', { 'data-act': 'plan', onclick: openPlan });
            m.primary = primary('Live the day as it comes', { 'data-act': 'plan-free', onclick: () => act(G, { type: 'plan', slots: [] }) });
        } else {
            m.lead = h('span', { class: 'ds-lead-text' }, h('b', {}, `${phasesFor(st, G.data, []).total}\u00A0phases`), ', planned\u00A0in\u00A0secret');
            m.primary = primary('Plan your day', { 'data-act': 'plan', onclick: openPlan });
        }
    } else if (p.type === 'phase') {
        const slot = st.plan[p.i];
        m.lead = dayPips(G, p.i);
        const card = resultCardFor(G);
        if (card) {
            // the phase just played: its result stands where the last-action line and the situation were, and the button goes on ("Next / phase 4 · Trade")
            m.body.push(card); m.last = null; m.situ = null; m.cls.push('with-result');
            const next = ACT_LABEL[slot?.act] ?? slot?.act ?? 'nothing';
            m.primary = btn(twoLine('Next', `phase ${p.i + 1} \u00B7 ${next}`), 'primary', { 'data-act': 'next', onclick: () => act(G, { type: 'next' }) });
        } else m.primary = phasePrimary(G, slot);
        if (!card && slot?.act === 'search' && !st.ch.onRoad) m.body.push(h('p', { class: 'ds-hint-line', 'data-hint': 'search-where' }, searchWhere(G, st.ch.at)));
    } else if (p.type === 'phase-pick') {
        // Prophecy: no plan was recorded; each phase is chosen as it comes (the printed rule: he learns his day as he lives it). The chips are the plan's own (ordinary weight, one is chosen);
        // an action with no further question is done at once, Move is chosen on the map (the roads are ringed), a Search asks its table, an Alert its weapon or chit.
        const ASKS = new Set(['move', 'search', 'alert']);
        const tap = a => { if (!ASKS.has(a)) { G.ui.pickAct = null; act(G, { type: 'pick', slot: { act: a } }); return; } G.ui.pickAct = G.ui.pickAct === a ? null : a; render(G); };
        m.body.push(h('div', { class: 'ds-acts pickacts' }, ...p.acts.map(a => h('button', { class: `ds-act${G.ui.pickAct === a.act ? ' on' : ''}`, 'data-pick-act': a.act, onclick: () => tap(a.act) }, actIcon(actArt(a.act), 28), ACT_LABEL[a.act] ?? a.act))));
        if (G.ui.pickAct === 'move') m.body.push(h('p', { class: 'ds-hint-line', 'data-hint': 'pick-move' }, 'Where to? Tap a ringed clearing on the map.'));
        const extra = (p.extrasLeft ?? []).map(x => ACT_LABEL[x] ?? x);
        m.lead = h('span', { class: 'ds-lead-text' }, h('b', {}, `Phase ${p.i + 1}`), `: ${p.regularLeft ?? 0} left${extra.length ? `, and an extra ${extra.join(', ')}` : ''}`);
        // the suggestion is the plan he would have made (st.planFull): the button names it ("Move / to Bad Valley 2 · suggested"), and the same clearing is ringed differently on the map (QA-119)
        const sug = st.planFull?.[st.turn?.i] ?? null;
        if (sug && sug.act !== 'nothing') { const { small } = shortPrompt(G, sug); m.primary = primary(twoLine(ACT_LABEL[sug.act] ?? sug.act, small ? `${small} \u00B7 suggested` : 'suggested'), { 'data-act': 'next', onclick: () => act(G, { type: 'next' }) }); }
        else m.primary = primary(twoLine('Do nothing', 'let the phase pass'), { 'data-act': 'next', onclick: () => act(G, { type: 'next' }) });
    } else if (p.type === 'over') {
        m.body.push(h('p', { class: 'ds-hint-line' }, 'The game is over.'));          // (a solo game or a race shows the end screen over all of this: endscreen.js)
        m.situ = null; m.last = null;
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
        m.body.push(k.body); [m.lead, m.primary] = k.actions;
    } else {
        // a question that waits on a sheet (a table, a trade, a hire, a rest ...): the tray stands dim under it
        const [main, small] = WAITING[p.type] ?? ['Your answer', 'is waiting'];
        m.primary = btn(small ? twoLine(main, small) : main, 'primary is-dim', { 'aria-disabled': 'true', onclick: () => showToast(G, 'The question above is waiting for you.') });
    }

    // Meeting other characters: my own offer is open (the game waits and says so), or I may meet someone now
    if (G.shared && G.ms && !planning) {
        if (G.ms.made && (!p || p.type === 'phase' || p.type === 'phase-pick' || p.type === 'meet-window')) { const w = waitingCard(mc(G)); m.body = [w.body]; m.lead = w.actions; m.primary = null; }
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
        // what asks me something (a vote, "you are marked away", "welcome back") is a decision sheet (tableSheet); the tray carries how a vote stands and the one-line note of a vote that failed
        const note = G.ui.tableNote ? noteCard(G.ui.tableNote.text, () => { G.ui.tableNote = null; render(G); }) : null;
        tableEls = [...(note ? [note] : []), ...tableCards({ ...tc(G), sheetDue: !!tableSheetDue(G) })];
    }
    const decisionFirst = !!(G.shared && ((p && /^meet-(block|follow|window)$/.test(p.type)) || G.ms?.made));
    const orderLine = G.shared && !banner && !decisionFirst ? turnOrderLine(st) : null;
    if (G.shared) {
        const waitingIds = new Set((G.answer?.waitingFor ?? []).map(w => w.character)), meetIds = new Set(G.ms ? G.ms.partners.map(x => x.id) : []);
        const tapChip = x => { if (meetIds.has(x.id) && !G.ms.made) { G.ui.meet = newMeetDraft(); G.ui.meet.to = x.id; G.ui.sheet = 'meet'; render(G); } else showPlayer(G, x); };
        const own = m.body;
        m.strip = playersStrip(G.crew, { onTap: tapChip, waitingIds, meetIds });
        m.body = [...tableEls, ...meetCards, ...(decisionFirst ? own : []), banner, ...(decisionFirst ? [] : own),
            orderLine ? h('p', { class: 'wc-order', 'data-order': '' }, orderLine) : null].filter(Boolean);
        m.shared = true;
        if (banner || decisionFirst || tableEls.some(e => e.dataset?.tableCard !== 'note')) { m.last = null; m.situ = null; }
    }
    m.body = m.body.filter(Boolean);

    // build with the design system's tray, then move it into the persistent element
    const body = [m.strip ?? null, m.body.length ? h('div', { class: 'tray-body' }, ...m.body) : null];
    const lead = m.lead, pr = m.primary;
    const t = tray({ last: m.last, situ: m.situ, body, lead, primary: pr });
    const actions = t.querySelector('.ds-actions');
    if (!lead && !pr) actions.remove();
    else if (pr && lead?.classList?.contains('ds-btn')) actions.querySelector('.lead')?.classList.add('fit');          // (a secondary on the left takes what its words need; the primary the rest, bottom right)
    // one primary per layer: when the tray has its own, a card's "yes" (a vote, a welcome) is a plain button
    if (pr) t.querySelectorAll('.tray-body .ds-btn.primary').forEach(b => b.classList.remove('primary'));
    const from = G.tray.offsetHeight;
    G.tray.className = `ds-tray gdock${m.cls.length ? ' ' + m.cls.join(' ') : ''}${m.shared ? ' shared' : ''}${p ? '' : ' idle'}`;
    G.tray.dataset.state = planning ? 'plan' : p?.type ?? 'idle';
    G.tray.replaceChildren(...t.childNodes);
    glideHeight(G, from);
    // the primary of a tray that has just changed (a phase played, a result shown, a question answered) ignores a tap for ~350 ms: the second half of a double tap must not skip what there is to read (QA-4)
    guardIfChanged(G.ui.guards ??= {}, 'tray', planning ? `plan|${st.day}` : `${p?.type ?? ''}|${p?.i ?? ''}|${st.day}|${G.shared || G.race ? '' : st.log?.length ?? 0}|${m.cls.join(' ')}`, G.tray);
    wireGrab(G, G.tray.querySelector('.ds-grab'));
}

// DR-1: when the tray changes height (the plan opens, a result card comes, a sub-picker appears) the height glides over the sheet duration instead of snapping, and the map, which fills what the
// tray leaves, glides with it (mapview.js keeps the middle of the strip where it was while its box changes size, so nothing jumps); once it has settled the hero is brought into view if the
// taller tray covers him. Calm and reduced motion: the duration token is 1ms, so it is as good as instant.
function glideHeight(G, from) {
    const el = G.tray;
    clearTimeout(G.ui.glideTimer);
    el.style.transition = 'none'; el.style.height = '';
    const to = el.offsetHeight;
    if (!G.ui.trayReady || !from || !to || Math.abs(to - from) < 8 || !el.isConnected) { G.ui.trayReady = true; el.style.transition = ''; return; }
    el.style.height = `${from}px`; void el.offsetHeight;          // (no clipping: the new content is `to` tall, so it never overflows a box that is taller; a box that is shorter lets it run off the bottom of the screen)
    el.style.transition = 'height var(--d-sheet) var(--ease-io)'; el.style.height = `${to}px`;
    const done = () => {
        el.removeEventListener('transitionend', onEnd); clearTimeout(G.ui.glideTimer);
        el.style.transition = ''; el.style.height = '';
        const hero = G.st?.ch?.flying ? G.st.ch.flying.tile : G.st?.ch?.onRoad ? G.st.ch.onRoad.from : G.st?.ch?.at;
        if (to > from && hero && !(G.ui.keepCamUntil > Date.now()) && G.map && G.root.isConnected) G.map.reveal?.([hero], { margin: 56 });
    };
    const onEnd = e => { if (e.target === el && e.propertyName === 'height') done(); };
    el.addEventListener('transitionend', onEnd); G.ui.glideTimer = setTimeout(done, 420);
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
