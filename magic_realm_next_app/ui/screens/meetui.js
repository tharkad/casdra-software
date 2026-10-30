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
import { askBox } from '../shared_ui.js';
import { btn, primary, sect } from '../ds.js';
import { icon, actIcon } from '../icons.js';
import { footRow } from './kit/common.js';
import { committedNote, voiced } from '../commit.js';
import { isStory } from '../voice.js';
import { nameOfClearing } from '../../engine/world.js';
import { followReason, playerOf, joinList, offerReading, madeReading, draftReading, BLOCK_WORDS, BLOCK_COST, FOLLOW_WORDS, DAYEND_SAYS, FOLLOW_EXPLAIN, meetLines } from '../meet.js';

const nb = s => String(s).replace(/ (?=\d)/g, ' ');
const placeOf = id => { try { return nb(nameOfClearing(id)); } catch { return id; } };
const act = (c, a) => c.act({ type: 'meet', ...a });
const ask = (a, b) => askBox(a, b);
const hint = (t, cls = '') => h('p', { class: `ds-hint-line${cls ? ` ${cls}` : ''}` }, t);

// ------------------------------------------------------------------------------------------------------------------------------- pieces
/** A row you can tick: a box on the left, the name opens what the thing is (a card under it). Keeps the Trade sheet's own hooks (`.ti-check`, `.ti-body`). */
function tickRow(c, { key, name, sub, price = null, selected, onSelect, info, picture = null, note = null }) {
    const sel = c.ui.meet;
    return h('div', { class: `ds-row tradeitem mt-row${selected ? ' sel' : ''}`, 'data-item': key },
        h('div', { class: 'ti-row' },
            h('button', { type: 'button', class: 'ti-check', role: 'checkbox', 'aria-checked': selected ? 'true' : 'false', 'aria-label': `${selected ? 'Deselect' : 'Select'} ${name}`, onclick: onSelect }, selected ? icon('check') : null),
            h('button', { type: 'button', class: 'ti-body', 'aria-expanded': sel.info === key ? 'true' : 'false', onclick: () => { sel.info = sel.info === key ? null : key; c.render(); } },
                h('span', { class: 'art' }, picture ?? actIcon('cache', 28)), h('span', { class: 'main rl' }, h('b', {}, name), sub ? h('span', {}, sub) : null, note ? h('span', { class: 'mt-note' }, note) : null),
                price != null ? h('em', { class: 'end' }, price) : null, info ? h('span', { class: 'ti-i', 'aria-hidden': 'true' }, icon(sel.info === key ? 'up' : 'down')) : null)),
        sel.info === key && info ? info : null);
}
/** Gold: a stepper (-5 -1 n +1 +5) with the most you can name, or none. */
function goldRow(c, { label, sub, value, max = null, onChange, key }) {
    const set = n => { onChange(Math.max(0, max == null ? n : Math.min(max, n))); c.render(); };
    const b = (d, txt) => h('button', { type: 'button', class: 'step-btn mt-step', 'aria-label': `${d > 0 ? 'More' : 'Less'} gold: ${d > 0 ? '+' : '−'}${Math.abs(d)}`, disabled: (d < 0 && value <= 0) || (d > 0 && max != null && value >= max) || null, onclick: () => set(value + d) }, txt);
    return h('div', { class: `ds-row mt-gold${value ? ' sel' : ''}`, 'data-gold': key },
        h('div', { class: 'main mt-gl' }, h('b', {}, label), sub ? h('span', {}, sub) : null),
        h('div', { class: 'ds-stepper mt-stepper' }, b(-5, '−5'), b(-1, '−'), h('div', { class: 'v' }, h('span', { 'data-gold-n': key }, String(value))), b(1, '+'), b(5, '+5')));
}
const discKey = d => `${d.kind}:${d.key ?? d.id}`;
const discOut = d => (d.kind === 'path' ? { kind: 'path', key: d.key } : { kind: d.kind, id: d.id });
/** The foot of a meeting sheet: one line of what will be offered, then the secondary on the left and the ONE primary on the right. */
function bar(summary, secondary, prim) { const f = footRow({ secondary, primary: prim }); const n = h('div', { class: 'ds-lead-text kit-note', 'data-note': '', 'data-meet-summary': '1', 'data-meet-bar': '' }, summary); f.prepend(n); return f; }

// ------------------------------------------------------------------------------------------------------------------------------- the Meet sheet: give and trade
export const newDraft = () => ({ to: null, gi: [], gg: 0, gd: [], wi: [], wg: 0, info: null });

export function meetSheet(c) {
    const { st, ms, ui } = c, d = (ui.meet ??= newDraft());
    const close = () => { ui.sheet = null; ui.meet = null; ui.meetSent = false; c.render(); };
    // the offer was sent and the game has it: the sheet has done its work (the tray says who is being waited for). Until then it stays, so a refusal does not lose what was ticked.
    if (ms.made && ui.meetSent) { ui.sheet = null; ui.meet = null; ui.meetSent = false; return h('div'); }
    // my own offer is open: nothing else to do but wait or take it back
    if (ms.made) return c.modal('Your offer', h('div', { class: 'mt-wait' }, waitingBody(c)), { close, bare: true, footer: bar(`Waiting for ${madeReading(st, c.data, ms.made).player} to answer.`, null, btn('Withdraw the offer', '', { 'data-act': 'meet-withdraw', onclick: () => { close(); act(c, { kind: 'cancel' }); } })) });
    if (!ms.partners.length) {
        return c.modal('Meet', h('div', { class: 'mt-none' }, ask('Nobody can trade with you right now.', ms.reason ?? 'Nobody else is in your clearing.')), { close, bare: true });
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
        ask(`${p.player} (${p.character}) is here with you at ${placeOf(st.ch.at)}.`, `${when} Nothing changes hands until ${p.player} accepts, and then everything does at once.`),
        ms.partners.length > 1 ? h('div', { class: 'ds-seg mt-pick', role: 'radiogroup', 'aria-label': 'Whom to meet' }, ...ms.partners.map(x => h('button', { type: 'button', class: x.id === d.to ? 'on' : null, role: 'radio', 'aria-checked': x.id === d.to ? 'true' : 'false', 'data-meet-with': x.id,
            onclick: () => { d.to = x.id; d.wi = []; d.wg = 0; c.render(); } }, `${x.id === d.to ? '✓ ' : ''}${x.player}`))) : null,
        sect('You give'),
        h('div', { class: 'ds-list' }, ...(mine.items.length ? mine.items.map(it => tickRow(c, { key: `give:${it.uid}`, name: `${it.name}${it.damaged ? ' (damaged)' : ''}`, sub: it.sub, selected: d.gi.includes(it.uid), onSelect: () => tog(d.gi, it.uid), picture: c.ico(it.name), info: c.itemInfo({ kind: it.kind, id: it.id, active: it.active, damaged: it.damaged }) })) : [hint('You carry nothing.')]),
            goldRow(c, { key: 'give', label: 'Gold', sub: `You have ${mine.gold}`, value: d.gg, max: mine.gold, onChange: n => { d.gg = n; } })),
        committedNote(st, c.data),          // 6.2.4d: what a recorded extra phase needs is not on the list, and the list says so
        ...(mine.discoveries.length ? [sect('What you know here'), h('div', { class: 'ds-list' }, ...mine.discoveries.map(x => tickRow(c, { key: `disc:${discKey(x)}`, name: x.label.replace(/^the /, 'The '), sub: 'Whoever learns it can use it from now on.', selected: d.gd.includes(discKey(x)), onSelect: () => tog(d.gd, discKey(x)) })))] : []),
        sect(`You ask ${p.player} for`, 'optional'),
        hint(`You can name what ${p.player} carries in plain sight; a card turned face down cannot be named.`),
        h('div', { class: 'ds-list' }, ...(p.askable.length ? p.askable.map(it => tickRow(c, { key: `want:${it.uid}`, name: `${it.name}${it.damaged ? ' (damaged)' : ''}`, sub: it.sub, selected: d.wi.includes(it.uid), onSelect: () => tog(d.wi, it.uid), picture: c.ico(it.name), info: c.itemInfo({ kind: it.kind, id: it.id, active: it.active, damaged: it.damaged }) })) : [hint(`${p.player} carries nothing you can see.`)]),
            goldRow(c, { key: 'want', label: 'Gold', sub: `from ${p.player}; they must have it`, value: d.wg, onChange: n => { d.wg = n; } })));
    const footer = bar(rd.text, btn('Cancel', '', { 'data-act': 'meet-cancel', onclick: close }), primary(rd.ok ? `Offer to ${p.player}` : 'Choose first', { 'data-act': 'meet-offer', disabled: !rd.ok || null, onclick: send }));
    return c.modal(`Meet ${p.player}`, body, { close, footer, detent: 'tall', bare: true });
}

// ------------------------------------------------------------------------------------------------------------------------------- my offer is open
function waitingBody(c) {
    const { st, ms } = c, o = ms.made, r = madeReading(st, c.data, o);
    return [ask(`Waiting for ${r.player} to answer.`, `You put ${r.line} on the table. Nothing moves until ${r.player} accepts. You cannot do anything else until then, but you can take the offer back.`)];
}
/** The card in the tray while my offer is open: it replaces the phase button, so it is plain that the game waits. `actions` is the Withdraw button (the tray puts it in the lead slot). */
export function waitingCard(c) {
    const { st, ms } = c, o = ms.made, r = madeReading(st, c.data, o);
    return {
        body: h('div', { class: 'waitcard meet-wait', role: 'status', 'data-meet-waiting': r.player },
            h('div', { class: 'ds-wait' }, h('span', { class: 'pulse', 'aria-hidden': 'true' }, ''), h('div', { class: 'wc-main' }, h('b', { class: 'wc-title' }, `Waiting for ${r.player}.`), h('div', { class: 'ds-meta wc-sub' }, `Your offer: ${r.line}. Nothing moves until ${r.player} accepts; you can take it back.`)))),
        actions: btn('Withdraw the offer', '', { 'data-act': 'meet-withdraw', onclick: () => act(c, { kind: 'cancel' }) }),
    };
}

// ------------------------------------------------------------------------------------------------------------------------------- the offer made to me
/** One side of an offer, read-only: counters of the things (tap one to read its card), the gold, what is passed on to learn. */
function offerSide(c, side, { key, title, who }) {
    const sel = c.ui.meet ??= { info: null };
    const things = [];
    for (const it of side.items ?? []) {
        const k = `${key}:${it.uid}`;
        things.push(h('div', { class: 'ds-row tradeitem ro', 'data-item': k },
            h('button', { type: 'button', class: 'ti-body full', 'aria-expanded': sel.info === k ? 'true' : 'false', onclick: () => { sel.info = sel.info === k ? null : k; c.render(); } },
                h('span', { class: 'ds-counter sm' }, c.ico(it.name) ?? actIcon('cache', 28)), h('b', {}, `${it.name}${it.damaged ? ' (damaged)' : ''}`))));
    }
    if (side.gold) things.push(h('div', { class: 'ds-row tradeitem ro gold' }, h('div', { class: 'ti-body full' }, h('span', { class: 'ds-counter sm' }, actIcon('trade', 28)), h('b', { class: 'ds-c-gold' }, `${side.gold} Gold`))));
    for (const d of side.discoveries ?? []) things.push(h('div', { class: 'ds-row tradeitem ro disc' }, h('div', { class: 'ti-body full' }, h('span', { class: 'ds-counter sm' }, actIcon('peer', 28)), h('b', {}, d.label), h('small', {}, 'Whoever learns this can use it from now on.'))));
    return h('div', { class: 'ds-group mt-side', 'data-side': key }, h('span', { class: 'ds-eyebrow' }, title), h('div', { class: 'cs' }, ...(things.length ? things : [h('span', { class: 'ds-meta mt-nothing' }, who)])));
}
export function offerSheet(c, q) {
    const { st, ui } = c, rd = offerReading(st, q), me = st.ch;
    ui.meet ??= newDraft();
    const decide = accept => act(c, { kind: 'answer', id: q.id, accept });
    const youGet = q.give, youGive = q.want;
    // the item card a tap opened, under both sides
    const open = ui.meet.info, all = [...(youGet.items ?? []).map(i => [`get:${i.uid}`, i]), ...(youGive.items ?? []).map(i => [`give:${i.uid}`, i])];
    const info = open ? all.find(([k]) => k === open)?.[1] : null;
    // the sentence comes first: what accepting does is never the part the sheet's height cuts off (QA-129)
    const body = h('div', { class: 'trade mt-offer', 'data-meet-offer': q.id, 'data-offer-from': q.from },
        h('p', { class: 'ds-meta mt-outcome', 'data-meet-outcome': '' }, h('b', {}, rd.title), ` ${rd.outcome}${q.window === 'dayend' ? ' The fighting is over, and you may trade before Midnight.' : ''}${q.resume && /^phase/.test(q.resume.type) ? ' Your phase waits until you answer.' : ''}`),
        h('div', { class: 'mt-swap' }, offerSide(c, youGet, { key: 'get', title: `${rd.player} gives`, who: 'Nothing.' }), icon('swap', 'lg'), offerSide(c, youGive, { key: 'give', title: 'You give', who: 'Nothing: it is a gift.' })),
        info ? c.itemInfo({ kind: info.kind, id: info.id, active: false, damaged: !!info.damaged }) : null,
        rd.lacks ? (() => { const e = hint(`${rd.lacks} You can only decline.`, 'bad'); e.setAttribute('data-meet-lacks', ''); return e; })() : null);
    // The foot says the one thing the two counters above do not: it is final (QA-129). The eyebrow is the name alone; the title says what is offered.
    const footer = bar('Done at once, whole or not at all. It cannot be taken back.', btn('Decline', '', { 'data-act': 'offer-decline', onclick: () => decide(false) }), primary(rd.gift ? 'Accept the gift' : 'Accept the trade', { 'data-act': 'offer-accept', disabled: !!rd.lacks || null, onclick: () => decide(true) }));
    return c.modal(rd.gift ? 'A gift' : rd.ask ? 'A request' : 'A trade', body, { footer, bare: true, eyebrow: rd.player, detent: 'hug' });          // (hug: the sentence that says what accepting does is never cut by the foot, QA-129)
}

// ------------------------------------------------------------------------------------------------------------------------------- decisions in the tray (the map stays in view)
// Each returns { body, actions }: the tray puts `actions` in its action row (the left button in the lead slot, the primary on the right), so the primary is bottom-right as everywhere.
const pair = (left, right) => [left, right];

/** `meet-block`: another character has just finished a phase in my clearing. Do I block him? */
export function blockCard(c, q) {
    const { st } = c, who = playerOf(st, q.target), me = st.ch, stage = me.today?.stage;
    const mineLost = stage === 'planned' ? 'Your own turn has not come yet, so you lose it too.' : 'Your turn is already played, so you lose only your hiding.';
    const body = h('div', { class: 'mt-card block', 'data-meet-card': 'block', 'data-target': q.target },
        ask(`${who} (${q.targetName}) has finished a phase here, at ${placeOf(q.at)}. Do you block ${who}?`,
            `A block ends their turn: they lose the phases they have left, and both of you are seen. ${mineLost} If you let them pass you are not asked about ${who} again today.`));
    return { body, actions: pair(btn('Let them pass', '', { 'data-act': 'block-pass', onclick: () => act(c, { kind: 'block', yes: false }) }), primary(`Block ${who}`, { 'data-act': 'block-yes', onclick: () => act(c, { kind: 'block', yes: true }) })) };
}

/** `meet-follow`: I follow a guide; he is about to start an activity. */
export function followCard(c, q) {
    const { st } = c, g = playerOf(st, q.guide);
    const body = h('div', { class: 'mt-card follow', 'data-meet-card': 'follow', 'data-guide': q.guide },
        ask(`You are following ${g}, who is about to start phase ${(q.i ?? 0) + 1}.`, `Keep following and you do what ${g} does in this phase. Stop and your turn ends where you stand: the chits of your place are turned and creatures that prowl here may come to you.`));
    return { body, actions: pair(btn('Keep following', '', { 'data-act': 'follow-stay', onclick: () => act(c, { kind: 'follow-drop', drop: false }) }), primary('Stop following', { 'data-act': 'follow-stop', onclick: () => act(c, { kind: 'follow-drop', drop: true }) })) };
}

/** `meet-window`: after the fights, before Midnight, those who stand together may trade. */
export function windowCard(c, q) {
    const { st, ms, ui } = c;
    const group = st.tradeWindow?.groups?.find(g => g.ids.includes(st.ch.id)), left = group ? group.ids.filter(id => id !== st.ch.id && !group.done.includes(id)).map(id => playerOf(st, id)) : [];
    const traded = meetLines(st, st.ch.id).some(l => l.kind === 'done' && l.i >= (ui.windowLog ?? 0));
    const body = h('div', { class: 'mt-card window', 'data-meet-card': 'window' },
        ask(`The fighting is over. ${joinList(['You', ...(q.with ?? []).map(id => playerOf(st, id))])} stand at ${placeOf(q.at)}.`, `You may trade before Midnight. ${left.length ? `Still deciding: ${joinList(left)}.` : ''}`.trim()));
    const can = ms.partners.length > 0;
    return { body, actions: pair(btn(traded ? 'Done trading' : 'Skip trading', '', { 'data-act': 'window-done', onclick: () => act(c, { kind: 'done' }) }),
        can ? primary(ms.partners.length === 1 ? `Trade with ${ms.partners[0].player}` : 'Trade', { 'data-act': 'window-trade', onclick: () => { c.ui.sheet = 'meet'; c.ui.meet = null; c.render(); } }) : primary('No one to trade with', { 'data-act': 'window-trade', disabled: true }, 'is-dim')) };
}

// ------------------------------------------------------------------------------------------------------------------------------- results, told first
const KIND_LABEL = { done: 'The deal is done', declined: 'Declined', refused: 'Turned down', withdrawn: 'Offer withdrawn', lapsed: 'No deal', spied: 'You saw', blocked: 'Blocked', blocks: 'You block', stops: 'You stop following', 'ends-with': 'Following ends' };
const BAD = new Set(['refused', 'blocked', 'lapsed']);

/** The cards for the meeting lines I have not yet looked at, newest last. Story voice by default, the engine's own words in Detail. (A result card: label, the sentence, a dismiss.) */
export function resultCards(c, lines) {
    return lines.map(l => h('div', { class: `ds-result meet-result phase-result ${BAD.has(l.kind) ? 'bad' : 'good'}`, role: 'status', 'data-meet-result': l.kind, 'data-meet-i': String(l.i) },
        h('div', { class: 'top pr-head' }, h('span', { class: 'ds-eyebrow' }, KIND_LABEL[l.kind] ?? 'A meeting'),
            h('button', { type: 'button', class: 'x mr-x', 'aria-label': 'Dismiss', 'data-act': 'meet-result-ok', onclick: () => { c.ui.meetSeen = Math.max(c.ui.meetSeen ?? 0, l.i + 1); c.render(); } }, icon('close'))),
        h('p', { class: 'headline pr-line' }, isStory() ? l.story : l.text)));
}

// ------------------------------------------------------------------------------------------------------------------------------- policies (the Company sheet)
function seg(items, value, key, onPick) {
    return h('div', { class: 'ds-seg mt-seg', role: 'radiogroup', 'data-policy': key }, ...items.map(([v, label]) => h('button', { type: 'button', class: value === v ? 'on' : null, role: 'radio', 'aria-checked': value === v ? 'true' : 'false', 'data-policy-value': v, onclick: () => onPick(v) }, label)));
}
export function policyBlock(c) {
    const pol = c.ms.policy;
    const set = a => act(c, { kind: 'policy', ...a });
    return [
        sect('When characters meet'),
        h('div', { class: 'mt-policy', 'data-policies': '' },
            h('b', { class: 'mt-ph' }, 'Block those who stop in your clearing'),
            seg(Object.entries(BLOCK_WORDS).map(([v, w]) => [v, w.label]), pol.block, 'block', v => set({ block: v })),
            h('p', { class: 'ds-meta', 'data-policy-says': 'block' }, BLOCK_WORDS[pol.block].says),
            pol.block !== 'never' ? h('p', { class: 'ds-meta' }, BLOCK_COST) : null,
            h('b', { class: 'mt-ph' }, 'When you follow someone'),
            seg(Object.entries(FOLLOW_WORDS).map(([v, w]) => [v, w.label]), pol.follow, 'follow', v => set({ follow: v })),
            h('p', { class: 'ds-meta', 'data-policy-says': 'follow' }, FOLLOW_WORDS[pol.follow].says),
            h('div', { class: 'ds-row mt-dayend' },
                h('span', { class: 'main rl' }, h('b', {}, 'Trade after the fights'), h('span', {}, DAYEND_SAYS)),
                h('button', { type: 'button', class: `ds-toggle switch${pol.dayEnd ? ' on' : ''}`, role: 'switch', 'aria-label': 'Trade after the fights', 'aria-checked': pol.dayEnd ? 'true' : 'false', 'data-policy-dayend': '', onclick: () => set({ dayEnd: !pol.dayEnd }) }))),
    ];
}

// ------------------------------------------------------------------------------------------------------------------------------- Follow, in the plan
/** The plan's Follow: whom (a character in my clearing), and what it means. `slot` is the draft's first slot. */
export function followPicker(c, slot, choose, rows = null) {
    const { st, ms } = c;
    // every other character, from the engine's `followWhy` (the ones who cannot be followed now are dim and say why); without it, the ones in `followable`
    const all = (rows ?? ms.followWhy ?? []).length ? (rows ?? ms.followWhy) : ms.followable.map(f => ({ ...f, ok: true }));
    const names = all.map(f => ({ ...f, player: playerOf(st, f.id) }));
    const goesLine = f => (f.goes && st.chars?.[f.goes] ? voiced({ story: `${st.chars[f.goes].name} is following ${playerOf(st, f.goes)} today: you would go with them.`, detail: `Already recorded to follow ${st.chars[f.goes].name}: a chain goes to its end, so you would go with ${st.chars[f.goes].name} too (7.11).` }) : null);
    return [
        h('p', { class: 'ds-hint-line', 'data-hint': 'follow' }, 'Follow takes your whole day: you record nothing else.'),
        h('div', { class: 'ds-choices mt-followpick', role: 'radiogroup', 'aria-label': 'Whom to follow' }, ...names.map(f => h('button', { type: 'button', class: `ds-choice${slot?.who === f.id ? ' on' : ''}${f.ok ? '' : ' dim'}`, role: 'radio', 'aria-checked': slot?.who === f.id ? 'true' : 'false', 'aria-disabled': f.ok ? null : 'true', 'data-follow': f.id,
            onclick: () => { if (f.ok) choose(f.id); },
            },
            h('span', { class: 'main' }, h('b', {}, `${f.player}`, h('em', {}, slot?.who === f.id ? 'following' : '')), f.name !== f.player ? h('span', { class: 'l' }, f.name) : null, f.ok ? goesLine(f) : h('span', { class: 'mt-why', 'data-follow-why': '' }, voiced(followReason(f)))), h('span', { class: 'dot' })))),
        h('ul', { class: 'mt-explain ds-meta', 'data-follow-explain': '' }, ...FOLLOW_EXPLAIN.map(t => h('li', {}, t))),
        h('p', { class: 'ds-meta' }, 'Your plan is secret until Sunrise. If your guide is gone by then, or you both follow each other, you have no turn today.'),
    ];
}
