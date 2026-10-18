// play/shared.js: the shared-realm host: the things a seat at a shared table sees that a solo game does not: the draw of the chits, the end of a fight I was in, the banner that stands
// in for the phase buttons when it is not my move, the players sheet, the soft camera, the restart question after a death, and the end of the game.
import { nameOfClearing } from '../../../engine/world.js';
import { h } from '../../dom.js';
import { fightSummary } from '../../fight.js';
import { overTitle } from '../../gametext.js';
import { drawInfo, joinNames, publicLines, situation, turnOrderLine } from '../../party.js';
import { myFall } from '../../pvp.js';
import { askBox, drawCard, playersBody, waitBanner } from '../../shared_ui.js';
import { primary, sect as dsSect } from '../../ds.js';
import { footRow } from '../kit/common.js';
import { logText, voice } from '../../voice.js';
import { deathCallout } from '../pvpui.js';
import { overCard } from '../sharedfight.js';
import { autopilotRecord, awaySheet, endSheet, pendingVote, seatNote, tableActions, voteSheet, welcomeSheet } from '../tableui.js';
import { act, copyInvite } from './actions.js';
import { modal, showToast, tc } from './kit.js';
import { prowlers, render } from './shell.js';
import { backSeen, drawSeen, markBackSeen, markDrawSeen, markOverSeen, myId, overSeen } from './state.js';
import { playerOf } from '../../meet.js';

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

// The end of a fight I was in: what each character took away, result first (a result sheet: its one way out is the button).
export function fightOverSheet(G) {
    if (!fightSummary(G.st, myId(G)).lines.length) { G.ui.sheet = null; return h('div'); }          // (a seat that started again as another character has no fight behind him)
    const body = overCard({ st: G.st, data: G.data, people: G.crew, myId: myId(G) });
    return modal(G, 'The fight is over', body, { kind: 'result', detent: 'tall', eyebrow: (at => (at ? `Evening · ${nameOfClearing(at)}` : 'Evening'))(fightSummary(G.st, myId(G)).at), bare: true, footer: footRow({ primary: primary('On through the night', { 'data-act': 'fight-over-ok', onclick: () => closeFightOver(G) }) }) });
}

export function maybeShowDraw(G) {
    if (G.ui.sheet && G.ui.sheet !== 'draw') return;
    if (G.st.battle || G.st.period === 'evening' || G.st.period === 'sunset') return;                 // (the chits were drawn at dawn: not now, in the middle of a fight)
    const d = drawInfo(G.st);
    if (!d || d.day !== G.st.day || drawSeen(G, d.day) || G.ui.draw?.day === d.day && G.ui.sheet !== 'draw') return;
    const p = G.st.pending;
    if (p && !['phase', 'phase-pick', 'turn-end', 'plan'].includes(p.type)) return;
    if (G.ui.sheet === 'draw') return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.calm === 'on';
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

// The draw of the chits: an event shown once a day. Result first (the dawn, in the story voice), then one tile for each player, turning over one by one; Skip turns them all.
export function drawSheet(G) {
    const d = drawInfo(G.st), dd = G.ui.draw;
    if (!d) { G.ui.sheet = null; return h('div'); }
    const dawn = G.st.log.find(l => l.day === G.st.day && /^Dawn of day/.test(l.t));
    const dawnText = dawn ? (voice() === 'story' ? (dawn.s ?? null) : dawn.t) : null;
    const prowling = G.st.prowl && !(voice() === 'story' && dawnText) ? (voice() === 'story' ? `The wilds stir: ${prowlers(G).join(', ') || 'no one'}.` : `Monster Roll ${G.st.prowl}: ${prowlers(G).join(', ') || 'none left'}.`) : null;
    const finished = dd.step >= d.order.length;
    const c = drawCard({ view: G.st, draw: d, people: G.crew, step: dd.step, finished, fresh: dd.fresh, dawn: dawnText, prowling,
        onSkip: () => { clearInterval(G.ui.drawTimer); G.ui.draw.step = d.order.length; G.ui.draw.fresh = false; render(G); }, onDone: () => endDraw(G) });
    const [skip, go] = c.foot.length > 1 ? c.foot : [null, c.foot[0]];
    return modal(G, c.title, c.body, { kind: 'result', detent: 'tall', eyebrow: c.eyebrow, bare: true, footer: footRow({ secondary: skip, primary: go }) });
}

// The card that stands in for the phase buttons when it is not my move: what is going on, why I cannot act, and what is happening in plain sight (the lines in the voice the player chose).
export function sharedBanner(G) {
    const sit = situation(G.st, G.answer, myId(G));
    if (sit.kind === 'mine' || sit.kind === 'you-away') return null;          // (marked away: the card in the tray says it, with the button)
    const pretty = t => String(t).replace(/\b([A-Z]{2,3}\d)\b/g, m => { try { return nameOfClearing(m); } catch { return m; } });          // (a clearing's code, in the words of the map)
    const lines = [...publicLines(G.st, myId(G), 4).filter(l => sit.kind !== 'following' || !/ follows /.test(l.t)).map(l => ({ t: pretty(logText(l)), id: l.who ?? null })), ...G.feed.slice(-3)].filter((l, i, a) => !i || (l.s ?? l.t) !== (a[i - 1].s ?? a[i - 1].t)).slice(-3);
    return waitBanner(sit, { feed: lines, orderLine: turnOrderLine(G.st) });
}

export function playersSheet(G) {
    const c = tc(G);
    return modal(G, 'The table', playersBody(G.crew, { view: G.st, answer: G.answer, orderLine: turnOrderLine(G.st), copyInvite: G.shared.invite ? () => copyInvite(G) : null, rowExtra: p => seatNote(c, p),
        foot: tableActions(c, { onQuit: () => { G.ui.sheet = 'quit-confirm'; render(G); }, onLeave: () => { G.ui.sheet = 'leave-confirm'; render(G); } }) }), { close: () => { G.ui.sheet = null; render(G); }, detent: 'half', bare: true });
}

// What the table asks of me, as a sheet: marked away ("I am back"), welcome back (what the autopilot did), a vote I have not answered. Only when nothing else is open and I am not in a fight or
// in the middle of a question that has a sheet of its own (that question comes first); otherwise it waits, and the tray says only how a vote stands.
export function tableSheetDue(G) {
    if (!G.shared || !G.answer || G.ui.sheet) return null;
    const st = G.st, p = st.pending;
    if (st.battle?.members?.[st.ch.id] || st.period === 'over') return null;
    if (p && !['plan', 'phase', 'phase-pick'].includes(p.type)) return null;
    if (G.answer.you?.away) return { kind: 'away' };
    const rec = autopilotRecord(st, playerOf(st, st.ch.id)), back = rec.back >= 0 && rec.key && !backSeen(G, rec.key) ? rec : null;
    if (back) return { kind: 'welcome', rec: back };
    const a = pendingVote(G.answer, G.mySeat);
    return a ? { kind: 'vote', a } : null;
}
export function tableSheet(G) {
    const due = tableSheetDue(G);
    if (!due) return null;
    const c = tc(G);
    return due.kind === 'away' ? awaySheet(c) : due.kind === 'welcome' ? welcomeSheet(c, due.rec, () => { markBackSeen(G, due.rec.key); render(G); }) : voteSheet(c, due.a);
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
// When several seats start again the same morning the die decides who may choose a DIFFERENT character first (9.1.2b): a seat behind someone still choosing may only start again as the same
// character for now (the others are dim and say why), until the ones ahead have answered. (Found by P3: with three fallen, a later seat picked another character and the engine refused.)
export function sharedRestartSheet(G, p0) {
    // a seat that restarted a moment ago may have taken one of the characters the question listed: only the ones nobody holds now (my own fallen one is mine to take again)
    const p = { ...p0, characters: p0.characters.filter(id => id === G.st.ch.id || !G.st.order.includes(id)) };
    const total = p.budget, v = (G.ui.sharedRestartVp ??= (() => { const fame = Math.min(5, Math.ceil(total * 0.6)); return { great: 0, spells: 0, fame, notoriety: Math.min(5, total - fame), gold: 0 }; })());
    const order = p0.pickOrder ?? [], at = order.indexOf(G.st.ch.id), waiting = G.answer?.waitingFor ?? [];
    const ahead = at > 0 ? order.slice(0, at).filter(x => waiting.some(w => w.character === x && w.doing === 'restart')) : [];
    const nameOf = id => G.crew.find(c => c.id === id)?.player ?? G.st.chars?.[id]?.name ?? id;
    const own = G.st.ch.id;
    if (ahead.length && G.ui.sharedRestartChar && G.ui.sharedRestartChar !== own) G.ui.sharedRestartChar = own;
    G.ui.sharedRestartChar ??= p.characters.includes(own) ? own : p.characters[0];
    const used = Object.values(v).reduce((a, b) => a + b, 0), d = p.death ?? {};
    const rows = [['fame', 'Fame', 10], ['notoriety', 'Notoriety', 20], ['gold', 'Gold', 30], ['great', 'Great treasures', 1], ['spells', 'Spells', 2]];
    const by = d.by ? String(d.by).replace(/ #\d+$/, '') : null, fall = G.st.battle?.pvp || G.st.options?.pvp ? myFall(G.st, G.crew, G.st.ch.id) : null;
    const aheadWhy = ahead.length ? `${joinNames(ahead.map(nameOf))} choose${ahead.length === 1 ? 's' : ''} first (the die decided). You may start again as ${G.st.ch.name} now.` : null;
    const dead = fall ? deathCallout({ st: G.st, f: null, k: fall, viewerId: G.st.ch.id, next: 'Choose who returns, below.' })
        : h('div', { class: 'sf-death deathbox me', role: 'alert' }, h('small', {}, `Day ${d.day ?? G.st.day - 1}${d.at ? ` · ${nameOfClearing(d.at)}` : ''}`), h('b', {}, 'You have fallen'), h('span', { class: 'dwho' }, by ? `Slain by the ${by}.` : 'Your character has died.'));
    const body = h('div', { class: 'restsheet sf-restart', 'data-restart': '' }, dead,
        askBox('Choose who comes back, and set new goals.', `The others are waiting to begin day ${G.st.day}. Your new character arrives at the Inn today with fresh chits and gear, and ${total} victory points to spend on the weeks that are left.`),
        order.length > 1 ? h('p', { class: 'ds-meta', 'data-pick-order': '' }, `The die decided who chooses first: ${joinNames(order.map(x => (x === own ? 'you' : nameOf(x))))}.`) : null,
        dsSect('Who returns'),
        h('div', { class: 'ds-choices', role: 'radiogroup' }, ...p.characters.map(id => {
            const dim = !!aheadWhy && id !== own, on = G.ui.sharedRestartChar === id;
            return h('button', { type: 'button', class: `ds-choice${on ? ' on' : ''}${dim ? ' dim' : ''}`, role: 'radio', 'aria-checked': on, 'aria-disabled': dim ? 'true' : null, 'data-restart-char': id,
                onclick: () => { if (dim) { showToast(G, aheadWhy); return; } G.ui.sharedRestartChar = id; render(G); } },
                h('span', { class: 'main' }, h('b', {}, G.data.characters[id]?.name ?? id, id === own ? h('em', {}, 'the same again') : null), dim ? h('span', { class: 'l' }, 'Not yet: someone chooses first.') : null), h('span', { class: 'dot' }));
        })),
        aheadWhy ? h('p', { class: 'ds-hint-line', 'data-hint': 'restart-order' }, aheadWhy) : null,
        dsSect('New goals', `${used} of ${total} points`),
        h('div', { class: 'ds-list' }, ...rows.map(([k, label, f]) => h('div', { class: 'ds-row sf-goal' },
            h('span', { class: 'main' }, h('b', {}, label), h('span', {}, v[k] ? `goal: ${v[k] * f}` : 'no goal')),
            h('div', { class: 'ds-stepper' },
                h('button', { type: 'button', 'aria-label': `Less ${label}`, disabled: v[k] <= 0, onclick: () => { v[k]--; render(G); } }, '−'),
                h('div', { class: 'v' }, String(v[k])),
                h('button', { type: 'button', 'aria-label': `More ${label}`, disabled: used >= total || v[k] >= 5, onclick: () => { v[k]++; render(G); } }, '+'))))));
    const foot = footRow({ note: used === total ? 'All points spent.' : `${total - used} left to spend.`,
        primary: primary('Return', { 'data-act': 'restart-go', disabled: used !== total, onclick: () => { const vp = { ...v }, character = G.ui.sharedRestartChar; G.ui.sharedRestartVp = null; G.ui.sharedRestartChar = null; act(G, { type: 'restart', vp, character }); } }) });
    return modal(G, `${G.st.ch.name} has fallen`, body, { kind: 'result', detent: 'tall', bare: true, footer: foot });
}

// The end of a shared game: the verdict, every place (a tie is a shared victory), each character's goals, and the realm laid bare (R-19, R-26): app/ui/screens/tableui.js.
export function sharedOverSheet(G) {
    return endSheet(tc(G), { title: overTitle(G.st, false), onBack: () => { G.sconn?.unwatch(); G.ctx.go('online'); }, close: () => { G.ui.sheet = null; render(G); } });
}
