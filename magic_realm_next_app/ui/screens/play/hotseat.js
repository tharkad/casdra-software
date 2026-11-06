// play/hotseat.js: one player running several characters of their own in one game (hot seat, no server). A bar under the status strip names each one; tapping a name makes him the actor,
// so the strip, the tray, the plan and the sheets all speak for him. The engine's own turn order does the rest: after an answer the actor passes to whoever has a question next.
import { h } from '../../dom.js';
import { saveGame } from './state.js';
import { render } from './shell.js';
import { attentionOf, leaderGame, roleOf } from '../../leaders.js';
import { ownSeats, seatBits } from './leaders.js';
import { showToast } from './kit.js';
import { icon } from '../../icons.js';
import { playerOf } from '../../meet.js';
import { newDraft, planSnapshot } from './plan.js';
import { chipLine, partyPlan } from './partyplan.js';
import { questionOf, tableModel, seatOf, gameOf } from '../../combat/feed.js';
import { apiOf } from '../../../engine/api.js';

// (a party of one player; and at a shared table, a player with hired leaders: his own seats)
export const isHotSeat = G => !G.race && (G.shared ? leaderGame(tableModel(G.st, G.data)) && ownSeats(G).length > 1 : (G.st?.order?.length ?? 0) > 1);

// A plan half made for one character waits for him: each keeps his own draft.
const LOOKS = new Set(['char', 'score', 'spells', 'curses', 'journal', 'dice', 'log']);
export function switchTo(G, id) {
    const st = G.st, drafts = (G.ui.drafts ??= {});
    const keepClearing = G.ui.sheet === 'clearing' && !!G.ui.sel && !G.ui.peek;
    // notes 145, 146: a look at a character (his belongings and tabs, his goals and score, his spells, his curses, his story) stays open when another character is tapped, and shows HIM; an item's own card, which belongs to the one who held it, gives way to his Kit
    const keepSheet = !(!!partyPlan(G) && G.ui.sheet === 'plan') ? (LOOKS.has(G.ui.sheet) ? G.ui.sheet : G.ui.sheet === 'item' ? 'char' : null) : null;
    const party = partyPlan(G), wasPlan = !!party && G.ui.sheet === 'plan';          // (a party that plans keeps its plan tray up and every plan as it stands: partyplan.js)
    drafts[seatOf(st, G.data)] = { draft: G.ui.draft, step: G.ui.planStep, snap: party ? planSnapshot(G) : null };
    G.st = apiOf(G.data).seat(st, id); G.ctx.state = G.st;          // (the game seen from his seat: a new value, the one held is not written)
    const mine = drafts[id];
    G.ui.draft = mine?.draft ?? null; G.ui.planStep = mine ? mine.step : 0;          // (a plan that is whole has no open tab: null)
    if (wasPlan && questionOf(G.st, G.data, id)?.type === 'plan') { G.ui.draft ??= newDraft(G); G.ui.sheet = 'plan'; if (!mine?.draft) G.ui.planStep = 0; }
    else G.ui.sheet = keepSheet;
    // note 139: the box of a clearing stays open when another character is tapped, and shows the clearing HE stands in
    const keepAt = !wasPlan && G.ui.sheet === null && keepClearing ? tableModel(G.st, G.data).chars[id]?.at ?? null : null;
    G.ui.sel = null; G.ui.pickMove = null; G.ui.pickFly = null; G.ui.planNote = null; G.ui.peek = false;
    if (keepAt) { G.ui.sel = keepAt; G.ui.sheet = 'clearing'; G.ui.foundSite = null; }
    G.ui.seat = id; if (!G.shared) saveGame(G.st);
    render(G);
}

export function renderParty(G) {
    const st = G.st;
    if (!G.partyBar) { if (!isHotSeat(G)) return; G.partyBar = h('nav', { class: 'ds-party', 'aria-label': 'Your characters' }); G.strip.after(G.partyBar); }
    const bar = G.partyBar;
    bar.hidden = !isHotSeat(G);
    if (bar.hidden) { bar.replaceChildren(); return; }
    const waiting = new Set(st.asks.map(a => a.who)), party = partyPlan(G);          // (a party that plans: each chip says what its character has locked in; the engine's asks are not a signal then, every one is asked until Start)
    bar.classList.toggle('planning', !!party);
    bar.replaceChildren(...ownSeats(G).map(id => {
        const c = tableModel(st, G.data).chars[id], on = id === seatOf(st, G.data), guide = tableModel(st, G.data).follows?.[id];          // (he follows a guide today: his turn is the guide's)
        if (party?.seats.includes(id)) {
            const cp = chipLine(G, id, party);
            return h('button', { type: 'button', class: `pchip plan${on ? ' on' : ''}${cp.dataset.plan === 'set' ? ' done' : ''}`, 'data-act': 'switch-char', 'data-char': id, 'data-plan': cp.dataset.plan, 'aria-pressed': on ? 'true' : 'false',
                'aria-label': `${c.name}: ${cp.title}${on ? '' : '. Tap to see and change it'}`, onclick: () => { if (!on) switchTo(G, id); } },
                h('b', {}, c.name, h('i', { class: `pmark${cp.dataset.plan === 'set' ? ' ok' : ''}`, 'aria-hidden': 'true' }, cp.dataset.plan === 'set' ? icon('check') : null)), cp);
        }
        return h('button', { type: 'button', class: `pchip${on ? ' on' : ''}${waiting.has(id) ? ' ask' : ''}${c.dead ? ' dead' : ''}${guide ? ' fol' : ''}`, 'data-act': 'switch-char', 'data-char': id, 'aria-pressed': on ? 'true' : 'false',
            'aria-label': `${c.name}${c.leader ? `, ${roleOf(tableModel(G.st, G.data), id).toLowerCase()}, ${attentionOf(tableModel(G.st, G.data), G.data, id)?.label.toLowerCase() ?? ''}` : ''}${guide ? `, follows ${playerOf(tableModel(G.st, G.data), guide)}` : ''}${waiting.has(id) ? ', waiting for you' : ''}`,
            onclick: () => { if (id === seatOf(st, G.data)) return; switchTo(G, id); } },
            ...seatBits(G, id), c.name, guide ? h('i', { class: 'pfol', 'aria-hidden': 'true', title: `follows ${playerOf(tableModel(G.st, G.data), guide)}` }, icon('right')) : null, waiting.has(id) ? h('i', { class: 'pwait', 'aria-hidden': 'true' }) : null);
    }));
    bar.classList.toggle('seats', leaderGame(tableModel(G.st, G.data)));
    announceTurn(G);
}

// A hired leader plays whole turns of his own, one after another with the hirer's: when the turn passes to another seat in Daylight, say whose it is (the bar shows it too, quietly).
function announceTurn(G) {
    const st = G.st, now = seatOf(st, G.data), was = G.ui.lastSeat;
    G.ui.lastSeat = now;
    if (!leaderGame(tableModel(G.st, G.data)) || was == null || was === now || gameOf(st, G.data).period !== 'daylight' || questionOf(st, G.data)?.type !== 'phase' || questionOf(st, G.data).i !== 0 || G.ui.sheet) return;
    const c = tableModel(st, G.data).chars[now];
    if (c) setTimeout(() => { if (G.root.isConnected && seatOf(G.st, G.data) === now && !G.ui.sheet) showToast(G, `${c.name}\u2019s turn.`); }, 0);          // (not inside the render that found it)
}
