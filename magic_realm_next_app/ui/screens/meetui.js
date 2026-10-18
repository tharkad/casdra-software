// The screens of CHARACTERS MEETING in a SHARED game (docs/design/multiplayer-meetui.md). Only for a shared table; solo and race never come through here.
//   meetSheet       give and trade: tick what you hand over and what you want back, an action bar at the bottom (Cancel / Offer), as in the Trade sheet
//   offerSheet      what a `meet-offer` question says: who, what is offered, what they would have, what happens if you accept (Decline / Accept)
//   blockCard       `meet-block`: "do you block him?" with what it costs both of you ("Let them pass" on the left, "Block" on the right)
//   followCard      `meet-follow`: keep following or stop, and what stopping does
//   windowCard      `meet-window`: the trade window after the fights, with a skip
//   waitingCard     my own offer is open: who has not answered, and Withdraw
//   resultCards     what the game wrote for me about a meeting, told first (a deal, a refusal, a block, a spy's notice)
//   policyBlock     the standing policies (block, follow, trade after the fights) in the character sheet, in plain words
//   followPicker    the plan screen's Follow: a picker of characters in the clearing and what following means
// Builders only: game.js owns the state and passes in what each needs (`c`: st, data, act, ui, render, modal, itemInfo, ico).
import { h } from '../dom.js';
import { ask } from '../ask.js';
import { isStory } from '../voice.js';
import { nameOfClearing } from '../../engine/world.js';
import { playerOf, joinList, sideParts, sideLine, sideEmpty, offerReading, madeReading, draftReading, BLOCK_WORDS, BLOCK_COST, FOLLOW_WORDS, DAYEND_SAYS, FOLLOW_EXPLAIN, meetLines } from '../meet.js';

const nb = s => String(s).replace(/ (?=\d)/g, ' ');
const placeOf = id => { try { return nb(nameOfClearing(id)); } catch { return id; } };
const act = (c, a) => c.act({ type: 'meet', ...a });

// ------------------------------------------------------------------------------------------------------------------------------- pieces
/** A row you can tick (the Trade sheet's own pattern): a box on the left, the name opens what the thing is. */
function tickRow(c, { key, name, sub, price = null, selected, onSelect, info, picture = null, note = null }) {
    const sel = c.ui.meet;
    return h('div', { class: `tradeitem${selected ? ' sel' : ''}`, 'data-item': key },
        h('div', { class: 'ti-row' },
            h('button', { class: 'ti-check', role: 'checkbox', 'aria-checked': selected ? 'true' : 'false', 'aria-label': `${selected ? 'Deselect' : 'Select'} ${name}`, onclick: onSelect }, selected ? '✓' : ''),
            h('button', { class: 'ti-body', 'aria-expanded': sel.info === key ? 'true' : 'false', onclick: () => { sel.info = sel.info === key ? null : key; c.render(); } },
                picture, h('span', { class: 'rl' }, h('b', {}, name), sub ? h('small', {}, sub) : null, note ? h('small', { class: 'mt-note' }, note) : null),
                price != null ? h('em', {}, price) : null, info ? h('span', { class: 'ti-i', 'aria-hidden': 'true' }, sel.info === key ? '▾' : '▸') : null)),
        sel.info === key && info ? info : null);
}
/** Gold: a stepper (−5 −1 n +1 +5) with the most you can name, or none. */
function goldRow(c, { label, sub, value, max = null, onChange, key }) {
    const set = n => { onChange(Math.max(0, max == null ? n : Math.min(max, n))); c.render(); };
    const btn = (d, txt) => h('button', { class: 'step-btn mt-step', 'aria-label': `${d > 0 ? 'More' : 'Less'} gold: ${d > 0 ? '+' : '−'}${Math.abs(d)}`, disabled: (d < 0 && value <= 0) || (d > 0 && max != null && value >= max) || null, onclick: () => set(value + d) }, txt);
    return h('div', { class: `mt-gold${value ? ' sel' : ''}`, 'data-gold': key },
        h('div', { class: 'mt-gl' }, h('b', {}, label), sub ? h('small', {}, sub) : null),
        h('div', { class: 'stepper' }, btn(-5, '−5'), btn(-1, '−'), h('div', { class: 'step-val' }, h('b', { 'data-gold-n': key }, String(value))), btn(1, '+'), btn(5, '+5')));
}
/** A read-only row of an offer: a thing, some gold, a discovery. Items open their card on a tap. */
function readRow(c, side, { key }) {
    const sel = c.ui.meet ??= { info: null };
    const rows = [];
    for (const it of side.items ?? []) {
        const k = `${key}:${it.uid}`;
        rows.push(h('div', { class: 'tradeitem ro', 'data-item': k },
            h('button', { class: 'ti-body full', 'aria-expanded': sel.info === k ? 'true' : 'false', onclick: () => { sel.info = sel.info === k ? null : k; c.render(); } },
                c.ico(it.name), h('span', { class: 'rl' }, h('b', {}, `${it.name}${it.damaged ? ' (damaged)' : ''}`), h('small', {}, it.sub ?? '')), h('span', { class: 'ti-i', 'aria-hidden': 'true' }, sel.info === k ? '▾' : '▸')),
            sel.info === k ? c.itemInfo({ kind: it.kind, id: it.id, active: false, damaged: !!it.damaged }) : null));
    }
    if (side.gold) rows.push(h('div', { class: 'tradeitem ro gold' }, h('div', { class: 'ti-body full' }, h('span', { class: 'rl' }, h('b', {}, `${side.gold} gold`)))));
    for (const d of side.discoveries ?? []) rows.push(h('div', { class: 'tradeitem ro disc' }, h('div', { class: 'ti-body full' }, h('span', { class: 'rl' }, h('b', {}, d.label), h('small', {}, 'Whoever learns this can use it from now on.')))));
    return rows;
}
const discKey = d => `${d.kind}:${d.key ?? d.id}`;
const discOut = d => (d.kind === 'path' ? { kind: 'path', key: d.key } : { kind: d.kind, id: d.id });
const bar = (summary, buttons, { cls = '' } = {}) => h('div', { class: `trade-bar mt-bar ${cls}`, 'data-meet-bar': '' },
    h('p', { class: 'tb-sum', 'data-meet-summary': '1' }, summary), h('div', { class: 'row-end tb-actions' }, ...buttons));

// ------------------------------------------------------------------------------------------------------------------------------- the Meet sheet: give and trade
export const newDraft = () => ({ to: null, gi: [], gg: 0, gd: [], wi: [], wg: 0, info: null });

export function meetSheet(c) {
    const { st, ms, ui } = c, d = (ui.meet ??= newDraft());
    const close = () => { ui.sheet = null; ui.meet = null; ui.meetSent = false; c.render(); };
    // the offer was sent and the game has it: the sheet has done its work (the dock says who is being waited for). Until then it stays, so a refusal does not lose what was ticked.
    if (ms.made && ui.meetSent) { ui.sheet = null; ui.meet = null; ui.meetSent = false; return h('div'); }
    // my own offer is open: nothing else to do but wait or take it back
    if (ms.made) return c.modal('Your offer', h('div', { class: 'mt-wait' }, waitingBody(c)), { close, footer: bar(`Waiting for ${madeReading(st, c.data, ms.made).player} to answer.`, [h('button', { class: 'btn', 'data-act': 'meet-withdraw', onclick: () => { close(); act(c, { kind: 'cancel' }); } }, 'Withdraw the offer')]) });
    if (!ms.partners.length) {
        return c.modal('Meet', h('div', { class: 'mt-none' }, ask('Nobody can trade with you right now.', ms.reason ?? 'Nobody else is in your clearing.', { compact: true })), { close });
    }
    if (!d.to || !ms.partners.some(p => p.id === d.to)) d.to = ms.partners[0].id;
    const p = ms.partners.find(x => x.id === d.to);
    const mine = ms.give;
    d.gi = d.gi.filter(u => mine.items.some(i => i.uid === u));
    d.gg = Math.min(d.gg, mine.gold);
    d.gd = d.gd.filter(k => mine.discoveries.some(x => discKey(x) === k));
    d.wi = d.wi.filter(u => p.askable.some(i => i.uid === u));
    const tog = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); c.render(); };
    const give = { items: mine.items.filter(i => d.gi.includes(i.uid)), gold: d.gg, discoveries: mine.discoveries.filter(x => d.gd.includes(discKey(x))) };
    const want = { items: p.askable.filter(i => d.wi.includes(i.uid)), gold: d.wg, discoveries: [] };
    const rd = draftReading(p.player, give, want);
    const send = () => {
        const a = { kind: 'offer', to: p.id, give: { items: d.gi.slice(), gold: d.gg, discoveries: give.discoveries.map(discOut) }, want: { items: d.wi.slice(), gold: d.wg } };
        ui.meetSent = true; act(c, a);
    };
    const when = ms.window === 'dayend' ? 'The fighting is over. You may trade before Midnight.'
        : ms.certain && (!ms.holder || ms.holder === st.ch.id) ? 'You may trade at the start of a phase.'
            : ms.certain ? `${playerOf(st, ms.holder)} is at the start of a phase: this is the moment to make an offer.`          // (the server says so: table.meetWindow)
                : `${playerOf(st, ms.holder ?? p.id)} is playing: an offer is made at the start of one of their phases.`;
    const body = h('div', { class: 'trade mt', 'data-meet': '' },
        ask(`${p.player} (${p.character}) is here with you at ${placeOf(st.ch.at)}.`, `${when} Nothing changes hands until ${p.player} accepts, and then everything does at once.`, { compact: true }),
        ms.partners.length > 1 ? h('div', { class: 'row2 grouppick mt-pick', role: 'radiogroup', 'aria-label': 'Whom to meet' }, ...ms.partners.map(x => h('button', { class: `btn${x.id === d.to ? ' on' : ''}`, role: 'radio', 'aria-checked': x.id === d.to ? 'true' : 'false', 'data-meet-with': x.id,
            onclick: () => { d.to = x.id; d.wi = []; d.wg = 0; c.render(); } }, `${x.id === d.to ? '✓ ' : ''}${x.player}`))) : null,
        h('h3', {}, 'You give'),
        ...(mine.items.length ? mine.items.map(it => tickRow(c, { key: `give:${it.uid}`, name: `${it.name}${it.damaged ? ' (damaged)' : ''}`, sub: it.sub, selected: d.gi.includes(it.uid), onSelect: () => tog(d.gi, it.uid), picture: c.ico(it.name), info: c.itemInfo({ kind: it.kind, id: it.id, active: it.active, damaged: it.damaged }) })) : [h('p', { class: 'hint' }, 'You carry nothing.')]),
        goldRow(c, { key: 'give', label: 'Gold', sub: `You have ${mine.gold}`, value: d.gg, max: mine.gold, onChange: n => { d.gg = n; } }),
        ...(mine.discoveries.length ? [h('h3', {}, 'What you know here'), ...mine.discoveries.map(x => tickRow(c, { key: `disc:${discKey(x)}`, name: x.label.replace(/^the /, 'The '), sub: 'Whoever learns it can use it from now on.', selected: d.gd.includes(discKey(x)), onSelect: () => tog(d.gd, discKey(x)) }))] : []),
        h('h3', {}, `You ask ${p.player} for`),
        h('p', { class: 'hint' }, `Optional. You can name what ${p.player} carries in plain sight; a card turned face down cannot be named.`),
        ...(p.askable.length ? p.askable.map(it => tickRow(c, { key: `want:${it.uid}`, name: `${it.name}${it.damaged ? ' (damaged)' : ''}`, sub: it.sub, selected: d.wi.includes(it.uid), onSelect: () => tog(d.wi, it.uid), picture: c.ico(it.name), info: c.itemInfo({ kind: it.kind, id: it.id, active: it.active, damaged: it.damaged }) })) : [h('p', { class: 'hint' }, `${p.player} carries nothing you can see.`)]),
        goldRow(c, { key: 'want', label: 'Gold', sub: `from ${p.player}; they must have it`, value: d.wg, onChange: n => { d.wg = n; } }));
    const footer = bar(rd.text, [
        h('button', { class: 'btn', 'data-act': 'meet-cancel', onclick: close }, 'Cancel'),
        h('button', { class: 'btn primary', 'data-act': 'meet-offer', disabled: !rd.ok || null, onclick: send }, rd.ok ? `Offer to ${p.player}` : 'Choose first')]);
    return c.modal(`Meet ${p.player}`, body, { close, footer });
}

// ------------------------------------------------------------------------------------------------------------------------------- my offer is open
function waitingBody(c) {
    const { st, ms } = c, o = ms.made, r = madeReading(st, c.data, o);
    return [ask(`Waiting for ${r.player} to answer.`, `You put ${r.line} on the table. Nothing moves until ${r.player} accepts. You cannot do anything else until then, but you can take the offer back.`, { compact: true })];
}
/** The card in the dock while my offer is open: it replaces the phase button, so it is plain that the game waits. */
export function waitingCard(c) {
    const { st, ms } = c, o = ms.made, r = madeReading(st, c.data, o);
    return {
        body: h('div', { class: 'waitcard meet-wait', role: 'status', 'data-meet-waiting': r.player },
            h('div', { class: 'wc-head' }, h('div', { class: 'wc-main' }, h('b', { class: 'wc-title' }, `Waiting for ${r.player}.`), h('p', { class: 'wc-text' }, `Your offer: ${r.line}.`))),
            h('p', { class: 'wc-why' }, `Nothing moves until ${r.player} accepts. You cannot go on until then; you can take the offer back.`)),
        actions: h('button', { class: 'btn', 'data-act': 'meet-withdraw', onclick: () => act(c, { kind: 'cancel' }) }, 'Withdraw the offer'),
    };
}

// ------------------------------------------------------------------------------------------------------------------------------- the offer made to me
export function offerSheet(c, q) {
    const { st, ui } = c, rd = offerReading(st, q), me = st.ch;
    ui.meet ??= newDraft();
    const decide = accept => act(c, { kind: 'answer', id: q.id, accept });
    const youGet = q.give, youGive = q.want;
    const body = h('div', { class: 'trade mt-offer', 'data-meet-offer': q.id, 'data-offer-from': q.from },
        ask(rd.title, `${rd.why}${q.resume && /^phase/.test(q.resume.type) ? ' Your phase waits until you answer.' : ''}`, { compact: true }),
        h('h3', {}, 'You would receive'),
        ...(sideEmpty(youGet) ? [h('p', { class: 'hint' }, 'Nothing.')] : readRow(c, youGet, { key: 'get' })),
        h('h3', {}, 'You would hand over'),
        ...(sideEmpty(youGive) ? [h('p', { class: 'hint' }, 'Nothing: it is a gift.')] : readRow(c, youGive, { key: 'give' })),
        h('p', { class: 'mt-outcome', 'data-meet-outcome': '' }, rd.outcome),
        rd.lacks ? h('p', { class: 'hint bad', 'data-meet-lacks': '' }, `${rd.lacks} You can only decline.`) : null);
    const footer = bar(rd.bar, [
        h('button', { class: 'btn', 'data-act': 'offer-decline', onclick: () => decide(false) }, 'Decline'),
        h('button', { class: 'btn primary', 'data-act': 'offer-accept', disabled: !!rd.lacks || null, onclick: () => decide(true) }, 'Accept')]);
    return c.modal(`${rd.player}: ${rd.gift ? 'a gift' : rd.ask ? 'a request' : 'a trade'}`, body, { footer });
}

// ------------------------------------------------------------------------------------------------------------------------------- decisions in the dock (the map stays in view)
const twoButtons = (left, right) => h('div', { class: 'row2 mt-two' }, left, right);

/** `meet-block`: another character has just finished a phase in my clearing. Do I block him? */
export function blockCard(c, q) {
    const { st } = c, who = playerOf(st, q.target), me = st.ch, stage = me.today?.stage;
    const mineLost = stage === 'planned' ? 'Your own turn has not come yet, so you lose it too.' : 'Your turn is already played, so you lose only your hiding.';
    const body = h('div', { class: 'mt-card block', 'data-meet-card': 'block', 'data-target': q.target },
        ask(`${who} (${q.targetName}) has finished a phase here, at ${placeOf(q.at)}. Do you block ${who}?`,
            `A block ends their turn: they lose the phases they have left, and both of you are seen. ${mineLost}`, { compact: true }),
        h('p', { class: 'hint' }, `If you let them pass you are not asked about ${who} again today.`));
    const actions = twoButtons(
        h('button', { class: 'btn', 'data-act': 'block-pass', onclick: () => act(c, { kind: 'block', yes: false }) }, 'Let them pass'),
        h('button', { class: 'btn primary', 'data-act': 'block-yes', onclick: () => act(c, { kind: 'block', yes: true }) }, `Block ${who}`));
    return { body, actions };
}

/** `meet-follow`: I follow a guide; he is about to start an activity. */
export function followCard(c, q) {
    const { st } = c, g = playerOf(st, q.guide);
    const body = h('div', { class: 'mt-card follow', 'data-meet-card': 'follow', 'data-guide': q.guide },
        ask(`You are following ${g}, who is about to start phase ${(q.i ?? 0) + 1}.`, `Keep following and you do what ${g} does in this phase. Stop and your turn ends where you stand: the chits of your place are turned and creatures that prowl here may come to you.`, { compact: true }));
    const actions = twoButtons(
        h('button', { class: 'btn', 'data-act': 'follow-stay', onclick: () => act(c, { kind: 'follow-drop', drop: false }) }, 'Keep following'),
        h('button', { class: 'btn primary', 'data-act': 'follow-stop', onclick: () => act(c, { kind: 'follow-drop', drop: true }) }, 'Stop following'));
    return { body, actions };
}

/** `meet-window`: after the fights, before Midnight, those who stand together may trade. */
export function windowCard(c, q) {
    const { st, ms, ui } = c;
    const group = st.tradeWindow?.groups?.find(g => g.ids.includes(st.ch.id)), left = group ? group.ids.filter(id => id !== st.ch.id && !group.done.includes(id)).map(id => playerOf(st, id)) : [];
    const traded = meetLines(st, st.ch.id).some(l => l.kind === 'done' && l.i >= (ui.windowLog ?? 0));
    const body = h('div', { class: 'mt-card window', 'data-meet-card': 'window' },
        ask(`The fighting is over. ${joinList(['You', ...(q.with ?? []).map(id => playerOf(st, id))])} stand at ${placeOf(q.at)}.`, `You may trade before Midnight. ${left.length ? `Still deciding: ${joinList(left)}.` : ''}`.trim(), { compact: true }));
    const can = ms.partners.length > 0;
    const actions = twoButtons(
        h('button', { class: 'btn', 'data-act': 'window-done', onclick: () => act(c, { kind: 'done' }) }, traded ? 'Done trading' : 'Skip trading'),
        h('button', { class: 'btn primary', 'data-act': 'window-trade', disabled: !can || null, onclick: () => { c.ui.sheet = 'meet'; c.ui.meet = null; c.render(); } }, can ? (ms.partners.length === 1 ? `Trade with ${ms.partners[0].player}` : 'Trade') : 'No one to trade with'));
    return { body, actions };
}

// ------------------------------------------------------------------------------------------------------------------------------- results, told first
const KIND_LABEL = { done: 'The deal is done', declined: 'Declined', refused: 'Turned down', withdrawn: 'Offer withdrawn', lapsed: 'No deal', spied: 'You saw', blocked: 'Blocked', blocks: 'You block', stops: 'You stop following', 'ends-with': 'Following ends' };
const BAD = new Set(['refused', 'blocked', 'lapsed']);

/** The cards for the meeting lines I have not yet looked at, newest last. Story voice by default, the engine's own words in Detail. */
export function resultCards(c, lines) {
    return lines.map(l => h('div', { class: `phase-result meet-result ${BAD.has(l.kind) ? 'bad' : 'good'}`, role: 'status', 'data-meet-result': l.kind, 'data-meet-i': String(l.i) },
        h('div', { class: 'pr-head' }, h('small', {}, KIND_LABEL[l.kind] ?? 'A meeting'), h('button', { class: 'x mr-x', 'aria-label': 'Dismiss', 'data-act': 'meet-result-ok', onclick: () => { c.ui.meetSeen = Math.max(c.ui.meetSeen ?? 0, l.i + 1); c.render(); } }, '✕')),
        h('p', { class: 'pr-line' }, isStory() ? l.story : l.text)));
}

// ------------------------------------------------------------------------------------------------------------------------------- policies (the character sheet)
function seg(items, value, key, onPick) {
    return h('div', { class: 'seg3 mt-seg', role: 'radiogroup', 'data-policy': key, style: `grid-template-columns: repeat(${items.length}, 1fr)` }, ...items.map(([v, label]) => h('button', { class: `segb${value === v ? ' on' : ''}`, role: 'radio', 'aria-checked': value === v ? 'true' : 'false', 'data-policy-value': v, onclick: () => onPick(v) }, label)));
}
export function policyBlock(c) {
    const pol = c.ms.policy;
    const set = a => act(c, { kind: 'policy', ...a });
    return [
        h('h3', {}, 'When characters meet'),
        h('div', { class: 'mt-policy', 'data-policies': '' },
            h('b', {}, 'Block those who stop in your clearing'),
            seg(Object.entries(BLOCK_WORDS).map(([v, w]) => [v, w.label]), pol.block, 'block', v => set({ block: v })),
            h('p', { class: 'hint', 'data-policy-says': 'block' }, BLOCK_WORDS[pol.block].says),
            pol.block !== 'never' ? h('p', { class: 'hint' }, BLOCK_COST) : null,
            h('b', {}, 'When you follow someone'),
            seg(Object.entries(FOLLOW_WORDS).map(([v, w]) => [v, w.label]), pol.follow, 'follow', v => set({ follow: v })),
            h('p', { class: 'hint', 'data-policy-says': 'follow' }, FOLLOW_WORDS[pol.follow].says),
            h('div', { class: 'itemrow mt-dayend' },
                h('span', { class: 'rl' }, h('b', {}, 'Trade after the fights'), h('small', {}, DAYEND_SAYS)),
                h('button', { class: `switch${pol.dayEnd ? ' on' : ''}`, role: 'switch', 'aria-checked': pol.dayEnd ? 'true' : 'false', 'data-policy-dayend': '', onclick: () => set({ dayEnd: !pol.dayEnd }) }, pol.dayEnd ? 'On' : 'Off'))),
    ];
}

// ------------------------------------------------------------------------------------------------------------------------------- Follow, in the plan
/** The plan's Follow: whom (a character in my clearing), and what it means. `slot` is the draft's first slot. */
export function followPicker(c, slot, choose) {
    const { st, ms } = c;
    const names = ms.followable.map(f => ({ ...f, player: playerOf(st, f.id) }));
    return [
        h('p', { class: 'hint', 'data-hint': 'follow' }, 'Follow takes your whole day: you record nothing else.'),
        h('div', { class: 'mt-followpick', role: 'radiogroup', 'aria-label': 'Whom to follow' }, ...names.map(f => h('button', { class: `btn row${slot?.who === f.id ? ' on' : ''}`, role: 'radio', 'aria-checked': slot?.who === f.id ? 'true' : 'false', 'data-follow': f.id, onclick: () => choose(f.id) },
            h('span', { class: 'rl' }, h('b', {}, `${slot?.who === f.id ? '✓ ' : ''}${f.player}`), h('small', {}, f.name)), h('em', {}, slot?.who === f.id ? 'following' : '')))),
        h('ul', { class: 'mt-explain', 'data-follow-explain': '' }, ...FOLLOW_EXPLAIN.map(t => h('li', {}, t))),
        h('p', { class: 'hint' }, 'Your plan is secret until Sunrise. If your guide is gone by then, or you both follow each other, you have no turn today.'),
    ];
}
