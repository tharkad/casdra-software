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

// (a party of one player; and at a shared table, a player with hired leaders: his own seats)
export const isHotSeat = G => !G.race && (G.shared ? leaderGame(G.st) && ownSeats(G).length > 1 : (G.st?.order?.length ?? 0) > 1);

// A plan half made for one character waits for him: each keeps his own draft.
export function switchTo(G, id) {
    const st = G.st, drafts = (G.ui.drafts ??= {});
    drafts[st.actor] = { draft: G.ui.draft, step: G.ui.planStep };
    st.actor = id;
    const mine = drafts[id];
    G.ui.draft = mine?.draft ?? null; G.ui.planStep = mine?.step ?? 0;
    G.ui.sheet = null; G.ui.sel = null; G.ui.pickMove = null; G.ui.pickFly = null; G.ui.planNote = null; G.ui.peek = false;
    G.ui.seat = id; if (!G.shared) saveGame(st);
    render(G);
}

export function renderParty(G) {
    const st = G.st;
    if (!G.partyBar) { if (!isHotSeat(G)) return; G.partyBar = h('nav', { class: 'ds-party', 'aria-label': 'Your characters' }); G.strip.after(G.partyBar); }
    const bar = G.partyBar;
    bar.hidden = !isHotSeat(G);
    if (bar.hidden) { bar.replaceChildren(); return; }
    const waiting = new Set(st.asks.map(a => a.who));
    bar.replaceChildren(...ownSeats(G).map(id => {
        const c = st.chars[id], on = id === st.actor, guide = st.follows?.[id];          // (he follows a guide today: his turn is the guide's)
        return h('button', { type: 'button', class: `pchip${on ? ' on' : ''}${waiting.has(id) ? ' ask' : ''}${c.dead ? ' dead' : ''}${guide ? ' fol' : ''}`, 'data-act': 'switch-char', 'data-char': id, 'aria-pressed': on ? 'true' : 'false',
            'aria-label': `${c.name}${c.leader ? `, ${roleOf(st, id).toLowerCase()}, ${attentionOf(st, G.data, id)?.label.toLowerCase() ?? ''}` : ''}${guide ? `, follows ${playerOf(st, guide)}` : ''}${waiting.has(id) ? ', waiting for you' : ''}`,
            onclick: () => { if (id === st.actor) return; switchTo(G, id); } },
            ...seatBits(G, id), c.name, guide ? h('i', { class: 'pfol', 'aria-hidden': 'true', title: `follows ${playerOf(st, guide)}` }, icon('right')) : null, waiting.has(id) ? h('i', { class: 'pwait', 'aria-hidden': 'true' }) : null);
    }));
    bar.classList.toggle('seats', leaderGame(st));
    announceTurn(G);
}

// A hired leader plays whole turns of his own, one after another with the hirer's: when the turn passes to another seat in Daylight, say whose it is (the bar shows it too, quietly).
function announceTurn(G) {
    const st = G.st, now = st.actor, was = G.ui.lastSeat;
    G.ui.lastSeat = now;
    if (!leaderGame(st) || was == null || was === now || st.period !== 'daylight' || st.pending?.type !== 'phase' || st.pending.i !== 0 || G.ui.sheet) return;
    const c = st.chars[now];
    if (c) setTimeout(() => { if (G.root.isConnected && G.st.actor === now && !G.ui.sheet) showToast(G, `${c.name}\u2019s turn.`); }, 0);          // (not inside the render that found it)
}
