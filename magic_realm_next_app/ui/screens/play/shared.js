// play/shared.js: the shared-realm host: the things a seat at a shared table sees that a solo game does not: the draw of the chits, the end of a fight I was in, the banner that stands
// in for the phase buttons when it is not my move, the players sheet, the soft camera, the restart question after a death, and the end of the game.
import { nameOfClearing } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { h } from '../../dom.js';
import { fightSummary } from '../../fight.js';
import { overTitle } from '../../gametext.js';
import { drawInfo, publicLines, situation, turnOrderLine } from '../../party.js';
import { myFall } from '../../pvp.js';
import { drawCard, playersBody, waitBanner } from '../../shared_ui.js';
import { logText, voice } from '../../voice.js';
import { deathCallout } from '../pvpui.js';
import { overCard } from '../sharedfight.js';
import { endSheet, seatNote, tableActions } from '../tableui.js';
import { act, copyInvite } from './actions.js';
import { modal, tc } from './kit.js';
import { prowlers, render } from './shell.js';
import { drawSeen, markDrawSeen, markOverSeen, myId, overSeen } from './state.js';

function clearTag(G) { clearTimeout(G.ui.tagTimer); G.ui.tagTimer = setTimeout(() => { if (G.ui.tag) { G.ui.tag = null; if (G.root.isConnected) render(G); } }, 6000); }

export function showPlayer(G, p) {
    G.ui.tag = G.ui.tag === p.id ? null : p.id; clearTag(G);
    const at = p.at ?? p.onRoad?.from;
    if (at && G.ui.tag) (p.mine ? G.map.focus(at) : G.map.pan(at));
    render(G);
}

export function maybeShowFightOver(G) {
    if (G.st.battle || G.ui.sheet || G.st.pending?.type === 'restart') return;
    const me = myId(G), sum = fightSummary(G.st, me);
    if (!sum.over || !sum.lines.length || sum.day < G.st.day - 1 || overSeen(G, sum.key) || G.ui.fightOverKey === sum.key) return;
    G.ui.fightOverKey = sum.key; G.ui.sheet = 'fightover';
}

function closeFightOver(G) { markOverSeen(G, G.ui.fightOverKey ?? fightSummary(G.st, myId(G)).key); G.ui.sheet = G.ui.sheet === 'fightover' ? null : G.ui.sheet; render(G); }

export function fightOverSheet(G) {
    const done = h('div', { class: 'trade-bar sf-bar' }, h('button', { class: 'btn primary big', 'data-act': 'fight-over-ok', onclick: () => closeFightOver(G) }, 'On through the night'));
    return modal(G, 'The fight is over', overCard({ st: G.st, data: G.data, people: G.crew, myId: myId(G) }), { close: () => closeFightOver(G), footer: done });
}

export function maybeShowDraw(G) {
    if (G.ui.sheet && G.ui.sheet !== 'draw') return;
    if (G.st.battle || G.st.period === 'evening' || G.st.period === 'sunset') return;                 // (the chits were drawn at dawn: not now, in the middle of a fight)
    const d = drawInfo(G.st);
    if (!d || d.day !== G.st.day || drawSeen(G, d.day) || G.ui.draw?.day === d.day && G.ui.sheet !== 'draw') return;
    const p = G.st.pending;
    if (p && !['phase', 'phase-pick', 'turn-end', 'plan'].includes(p.type)) return;
    if (G.ui.sheet === 'draw') return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    G.ui.sheet = 'draw'; G.ui.draw = { day: d.day, step: reduce ? d.order.length : 0, fresh: !reduce };
    if (!reduce) {
        clearInterval(G.ui.drawTimer);
        G.ui.drawTimer = setInterval(() => {
            if (!G.root.isConnected || !G.ui.draw) { clearInterval(G.ui.drawTimer); return; }
            G.ui.draw.step++; if (G.ui.draw.step >= d.order.length) clearInterval(G.ui.drawTimer);
            render(G);
        }, 850);
    }
}

function endDraw(G) { clearInterval(G.ui.drawTimer); if (G.ui.draw) markDrawSeen(G, G.ui.draw.day); G.ui.sheet = G.ui.sheet === 'draw' ? null : G.ui.sheet; G.ui.draw = G.ui.draw ? { ...G.ui.draw, closed: true } : null; render(G); }

export function drawSheet(G) {
    const d = drawInfo(G.st), dd = G.ui.draw;
    if (!d) { G.ui.sheet = null; return h('div'); }
    const dawn = G.st.log.find(l => l.day === G.st.day && /^Dawn of day/.test(l.t));
    const dawnText = dawn ? (voice() === 'story' ? (dawn.s ?? dawn.t) : dawn.t) : null;
    const prowling = G.st.prowl ? (voice() === 'story' ? `The wilds stir: ${prowlers(G).join(', ') || 'no one'}.` : `Monster Roll ${G.st.prowl}: ${prowlers(G).join(', ') || 'none left'}.`) : null;
    const finished = dd.step >= d.order.length;
    return modal(G, `Day ${G.st.day}: the chits`, drawCard({ view: G.st, draw: d, people: G.crew, step: dd.step, finished, fresh: dd.fresh, dawn: dawnText, prowling,
        onSkip: () => { clearInterval(G.ui.drawTimer); G.ui.draw.step = d.order.length; G.ui.draw.fresh = false; render(G); }, onDone: () => endDraw(G) }), { close: () => endDraw(G) });
}

// The banner that stands in for the phase buttons when it is not my move: what is going on, why I cannot act, and what is happening in plain sight.
export function sharedBanner(G) {
    const sit = situation(G.st, G.answer, myId(G));
    if (sit.kind === 'mine' || sit.kind === 'you-away') return null;          // (marked away: the card in the dock says it, with the button)
    const pretty = t => String(t).replace(/\b([A-Z]{2,3}\d)\b/g, m => { try { return nameOfClearing(m); } catch { return m; } });          // (a clearing's code, in the words of the map)
    const lines = [...publicLines(G.st, myId(G), 4).filter(l => sit.kind !== 'following' || !/ follows /.test(l.t)).map(l => ({ t: pretty(logText(l)) })), ...G.feed.slice(-3)].filter((l, i, a) => !i || (l.s ?? l.t) !== (a[i - 1].s ?? a[i - 1].t)).slice(-4);
    return waitBanner(sit, { feed: lines, orderLine: turnOrderLine(G.st) });
}

export function playersSheet(G) {
    const c = tc(G);
    return modal(G, 'The table', playersBody(G.crew, { view: G.st, answer: G.answer, orderLine: turnOrderLine(G.st), copyInvite: G.shared.invite ? () => copyInvite(G) : null, rowExtra: p => seatNote(c, p),
        foot: tableActions(c, { onQuit: () => { G.ui.sheet = 'quit-confirm'; render(G); }, onLeave: () => { G.ui.sheet = 'leave-confirm'; render(G); } }) }), { close: () => { G.ui.sheet = null; render(G); } });
}

// The camera: it follows the player whose turn it is, softly, but never while I have a decision to make, a sheet open or my finger on the map; and it comes back to me when my turn begins.
export function sharedCamera(G) {
    if (!G.shared || !G.map) return;
    const mine = !!G.st.pending && G.st.pending.type !== 'over';
    if (mine) {
        if (!G.hadAsk && G.st.period === 'daylight') { const at = G.st.ch.onRoad ? G.st.ch.onRoad.from : G.st.ch.at; if (at && !G.map.visible(at)) G.map.pan(at); }
        G.hadAsk = true; return;
    }
    G.hadAsk = false;
    if (G.ui.sheet || G.ui.sel || Date.now() - (G.ui.touched ?? 0) < 6000) return;
    // a fight is on: the map shows where (once per fight)
    if (G.st.battle?.at) { const key = `fight|${G.st.day}|${G.st.battle.at}`; if (G.ui.followKey !== key) { G.ui.followKey = key; G.map.pan(G.st.battle.at); } return; }
    const who = G.crew.find(p => p.status === 'playing' && !p.mine);
    const at = who?.at ?? who?.onRoad?.from;
    if (!at) return;
    const key = `${G.st.day}|${who.id}|${at}`;
    if (G.ui.followKey === key) return;
    G.ui.followKey = key; G.map.pan(at);
}

// A fallen character comes back at the next Birdsong: new goals for the weeks left, and (if he likes) another character that nobody at the table is using.
export function sharedRestartSheet(G, p0) {
    // a seat that restarted a moment ago may have taken one of the characters the question listed: only the ones nobody holds now (my own fallen one is mine to take again)
    const p = { ...p0, characters: p0.characters.filter(id => id === G.st.ch.id || !G.st.order.includes(id)) };
    const total = p.budget, v = (G.ui.sharedRestartVp ??= (() => { const fame = Math.min(5, Math.ceil(total * 0.6)); return { great: 0, spells: 0, fame, notoriety: Math.min(5, total - fame), gold: 0 }; })());
    G.ui.sharedRestartChar ??= p.characters.includes(G.st.ch.id) ? G.st.ch.id : p.characters[0];
    const used = Object.values(v).reduce((a, b) => a + b, 0), d = p.death ?? {};
    const rows = [['fame', 'Fame', 10], ['notoriety', 'Notoriety', 20], ['gold', 'Gold', 30], ['great', 'Great treasures', 1], ['spells', 'Spells', 2]];
    const by = d.by ? String(d.by).replace(/ #\d+$/, '') : null, fall = G.st.battle?.pvp || G.st.options?.pvp ? myFall(G.st, G.crew, G.st.ch.id) : null;
    return modal(G, `${G.st.ch.name} has fallen`, h('div', { class: 'restsheet', 'data-restart': '' },
        // struck down by another player's character (the switch `pvp`): the same callout as on the reveal, with what was taken
        fall ? deathCallout({ st: G.st, f: null, k: fall, viewerId: G.st.ch.id, next: 'Choose who returns, below.' })
        : h('div', { class: 'deathbox', role: 'alert' }, h('b', {}, 'You have died'), h('span', { class: 'dwho' }, by ? `Slain by the ${by}${d.at ? ` at ${nameOfClearing(d.at)}` : ''}, on day ${d.day ?? G.st.day - 1}.` : `Fallen${d.at ? ` at ${nameOfClearing(d.at)}` : ''}, on day ${d.day ?? G.st.day - 1}.`)),
        ask('Choose who comes back, and set new goals.', `The others are waiting to begin day ${G.st.day}. Your new character arrives at the Inn today with fresh chits and gear; with ${total} victory points to spend on the weeks that are left.`, { compact: true }),
        h('h3', {}, 'Who returns'),
        h('div', { class: 'choices', role: 'radiogroup' }, ...p.characters.map(id => h('button', { class: `choice${G.ui.sharedRestartChar === id ? ' on' : ''}`, role: 'radio', 'aria-checked': G.ui.sharedRestartChar === id, 'data-restart-char': id, onclick: () => { G.ui.sharedRestartChar = id; render(G); } },
            h('span', { class: 'dot' }), h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, G.data.characters[id]?.name ?? id, h('em', {}, id === G.st.ch.id ? 'the same again' : ''))))) ),
        h('h3', {}, 'New goals'),
        ...rows.map(([k, label, f]) => h('div', { class: 'vprow' },
            h('div', { class: 'vp-l' }, h('b', {}, label), h('small', {}, v[k] ? `goal: ${v[k] * f}` : 'no goal')),
            h('div', { class: 'stepper' },
                h('button', { class: 'step-btn', disabled: v[k] <= 0, onclick: () => { v[k]--; render(G); } }, '\u2212'),
                h('div', { class: 'step-val' }, h('b', {}, String(v[k]))),
                h('button', { class: 'step-btn', disabled: used >= total || v[k] >= 5, onclick: () => { v[k]++; render(G); } }, '+')))),
        h('p', { class: used === total ? 'hint' : 'hint bad' }, used === total ? 'All points spent.' : `${total - used} left to spend.`),
        h('div', { class: 'row-end' }, h('button', { class: 'btn primary', disabled: used !== total, 'data-act': 'restart-go', onclick: () => { const vp = { ...v }, character = G.ui.sharedRestartChar; G.ui.sharedRestartVp = null; G.ui.sharedRestartChar = null; act(G, { type: 'restart', vp, character }); } }, 'Return'))));
}

// The end of a shared game: the verdict, every place (a tie is a shared victory), each character's goals, and the realm laid bare (R-19, R-26): app/ui/screens/tableui.js.
export function sharedOverSheet(G) {
    return endSheet(tc(G), { title: overTitle(G.st, false), onBack: () => { G.sconn?.unwatch(); G.ctx.go('online'); }, close: () => { G.ui.sheet = null; render(G); } });
}
