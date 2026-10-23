// play/hotseat.js: one player running several characters of their own in one game (hot seat, no server). A bar under the status strip names each one; tapping a name makes him the actor,
// so the strip, the tray, the plan and the sheets all speak for him. The engine's own turn order does the rest: after an answer the actor passes to whoever has a question next.
import { h } from '../../dom.js';
import { saveGame } from './state.js';
import { render } from './shell.js';

export const isHotSeat = G => !G.race && !G.shared && (G.st?.order?.length ?? 0) > 1;

// A plan half made for one character waits for him: each keeps his own draft.
function switchTo(G, id) {
    const st = G.st, drafts = (G.ui.drafts ??= {});
    drafts[st.actor] = { draft: G.ui.draft, step: G.ui.planStep };
    st.actor = id;
    const mine = drafts[id];
    G.ui.draft = mine?.draft ?? null; G.ui.planStep = mine?.step ?? 0;
    G.ui.sheet = null; G.ui.sel = null; G.ui.pickMove = null; G.ui.pickFly = null; G.ui.planNote = null; G.ui.peek = false;
    saveGame(st); render(G);
}

export function renderParty(G) {
    const st = G.st;
    if (!G.partyBar) { if (!isHotSeat(G)) return; G.partyBar = h('nav', { class: 'ds-party', 'aria-label': 'Your characters' }); G.strip.after(G.partyBar); }
    const bar = G.partyBar;
    bar.hidden = !isHotSeat(G);
    if (bar.hidden) { bar.replaceChildren(); return; }
    const waiting = new Set(st.asks.map(a => a.who));
    bar.replaceChildren(...st.order.map(id => {
        const c = st.chars[id], on = id === st.actor;
        return h('button', { type: 'button', class: `pchip${on ? ' on' : ''}${waiting.has(id) ? ' ask' : ''}${c.dead ? ' dead' : ''}`, 'data-act': 'switch-char', 'data-char': id, 'aria-pressed': on ? 'true' : 'false',
            'aria-label': `${c.name}${waiting.has(id) ? ', waiting for you' : ''}`,
            onclick: () => { if (id === st.actor) return; switchTo(G, id); } },
            c.name, waiting.has(id) ? h('i', { class: 'pwait', 'aria-hidden': 'true' }) : null);
    }));
}
