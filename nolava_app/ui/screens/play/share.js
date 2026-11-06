// play/share.js: "Share what you know" (note 142, rule 4.5.5): a character who holds a discovery (a hidden path, a secret passage, a found Site chit or Site card) that another character of the
// SAME player, standing in the same clearing, does not know, is told so, and is offered the one button that tells it. A party on one phone has one person at the table: nobody has to accept, so the
// gift goes through the engine's ordinary offer and its answer, sent together (actMany, as a hirer's gift to his own leader is). At a table with other people the Meet button and its offers stay as they are.
// WHEN is the engine's word (view.me.meet.news[].now): the start of a phase of the day's turn-holder, or the trade window after the evening's fights (4.5.5h, 7.2.1). Nothing here knows a rule.
import { h } from '../../dom.js';
import { btn } from '../../ds.js';
import { icon } from '../../icons.js';
import { shareReading } from '../../meet.js';
import { displayName } from '../../names.js';
import { actMany } from './actions.js';
import { isHotSeat } from './hotseat.js';
import { showToast } from './kit.js';
import { render } from './shell.js';
import { gameOf, tableModel, viewOf } from '../../combat/feed.js';

const discOut = d => (d.kind === 'path' ? { kind: 'path', key: d.key } : { kind: d.kind, id: d.id });

/** What is worth telling now or later, for a party on one phone: [{ from, to, fromName, toName, at, items, now }]. Empty at a table with other people, in a race, or with nothing to tell. */
export function sharesOf(G) {
    if (G.shared || G.race || !G.st || !isHotSeat(G)) return [];
    const tm = tableModel(G.st, G.data), out = [];
    for (const from of tm.order) {
        const meet = viewOf(G.st, G.data, from).me?.meet;
        for (const n of meet?.news ?? []) out.push({ from, to: n.id, fromName: displayName(tm.chars[from].name), toName: displayName(tm.chars[n.id].name), at: tm.chars[from].at, items: n.items, now: !!n.now });
    }
    return out;
}
const hushed = G => G.ui.shareHush === gameOf(G.st, G.data).day;

/** The ones I may tell right now. */
export const shareNow = G => sharesOf(G).filter(s => s.now);

/** Tell it: the offer from the one who knows and the answer of the one who is told, together, all or nothing. In the trade window after the fights, when this leaves nothing more to tell, the window is closed for everyone too. */
export function tell(G, s) {
    const rd = shareReading(s);
    const actions = [{ type: 'meet', kind: 'offer', who: s.from, to: s.to, give: { items: [], gold: 0, discoveries: s.items.map(discOut) }, want: { items: [], gold: 0 } }, { type: 'meet', kind: 'answer', who: s.to, accept: true }];
    const win = tableModel(G.st, G.data).tradeWindow?.groups?.find(g => g.ids.includes(s.from));
    if (win && !sharesOf(G).filter(x => x.now && !(x.from === s.from && x.to === s.to)).length) for (const id of win.ids) if (!win.done.includes(id)) actions.push({ type: 'meet', kind: 'done', who: id });
    actMany(G, actions, { ok: () => { G.ui.sheet = G.ui.sheet === 'clearing' || G.ui.sheet === 'plan' ? G.ui.sheet : null; showToast(G, rd.confirm); } });
}

/** "Not now": the card is put away for the rest of the day. The clearing box still has the button, and the evening window comes before Midnight. */
export const notNow = G => { G.ui.shareHush = gameOf(G.st, G.data).day; render(G); };

/** One card: who knows what, the question, and the one button (and a quiet "Not now" in the tray, where the player is in the middle of a phase). */
function cardEl(G, s, { notNow: quiet = false, cls = '', attrs = {} } = {}) {
    const rd = shareReading(s);
    return h('div', { class: `share-card${cls ? ` ${cls}` : ''}`, role: 'group', 'aria-label': 'Share what you know', 'data-share': `${s.from}>${s.to}`, ...attrs },
        h('div', { class: 'sc-top' }, h('span', { class: 'sc-ico' }, icon('people')),
            h('div', { class: 'sc-text' }, h('b', {}, rd.title, ' ', h('em', {}, rd.ask)), rd.faceUp ? h('small', { class: 'ds-meta' }, rd.faceUp) : null)),
        h('div', { class: 'sc-btns' },
            quiet ? btn('Not now', 'quiet sm', { 'data-act': 'share-notnow', onclick: () => notNow(G) }) : null,
            btn(rd.button, 'tell', { 'data-act': 'share-tell', 'data-share-to': s.to, onclick: () => tell(G, s) })));
}

/** The cards for the tray, at the start of a phase or in the trade window (where "On to Midnight" is the way not to): one for each telling that may be done now. */
export function shareCards(G, { evening = false } = {}) {
    if (hushed(G) && !evening) return [];
    return shareNow(G).map(s => cardEl(G, s, { notNow: !evening }));
}

/** What the clearing box says about it: the card when it may be done now, and when it may not, a row that says when it can. */
export function shareRows(G, clearing) {
    const out = [];
    for (const s of sharesOf(G)) {
        if (s.at !== clearing) continue;
        if (s.now) { out.push(cardEl(G, s, { cls: 'share-row', attrs: { 'data-share-row': `${s.from}>${s.to}`, 'data-share-now': '1' } })); continue; }
        out.push(h('div', { class: 'ds-row share-row off', 'data-share-row': `${s.from}>${s.to}`, 'data-share-now': '0' },
            h('span', { class: 'art' }, icon('people')), h('span', { class: 'main' }, h('b', {}, shareReading(s).title), h('span', {}, shareReading(s).later))));
    }
    return out;
}

/** In Birdsong, where the plan is made, a line that says why a character cannot plan with what another knows, and when it can be told. */
export function shareHints(G) {
    const me = tableModel(G.st, G.data).actor;
    return sharesOf(G).filter(s => !s.now && (s.from === me || s.to === me)).map(s => h('p', { class: 'ds-hint-line', 'data-hint': 'share-later', 'data-share-row': `${s.from}>${s.to}` }, shareReading(s).planLine));
}
