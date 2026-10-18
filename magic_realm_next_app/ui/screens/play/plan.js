// play/plan.js: the planning screen: the panel under the map where the day's phases are set (planPanel / planBar), and the draft logic behind it (pick, setMove, advance, pruneOver, startDay).
import { planKinds } from '../../../engine/day.js';
import { flySources, flyTiles } from '../../../engine/magic/fly.js';
import { isCave, isMountain, nameOfClearing, tileName } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { h } from '../../dom.js';
import { playerOf as playerNameOf } from '../../meet.js';
import { actRefusal, planState } from '../../planlogic.js';
import { followPicker } from '../meetui.js';
import { act } from './actions.js';
import { ACT_LABEL, CURSE_ACT, icon, mc, pullDown } from './kit.js';
import { describeSlot, searchWhere } from './phases.js';
import { render } from './shell.js';

// ---- planning ----
// ---- planning: a panel under the map, one phase at a time (or all of them), with the map still live above it ----
// where he will be at the start of each phase, as planned
// (the first half of a mountain climb does not bring him there: planlogic.js)
function planLocations(G) { return planState(G.st, G.data, G.ui.draft.slots).at; }

function planInfo(G) {
    const v = planKinds(G.st, G.data, G.ui.draft.slots);
    return { total: v.total, base: v.base, lantern: v.lantern, extras: v.extras, kinds: v.kinds, errors: v.errors };
}

// what kind of phase this recorded activity uses: an extra phase may be recorded anywhere, the rest fill the basic and then the sunlight phases
function slotKind(G, i, base, extras) {
    const k = planInfo(G).kinds[i];
    if (k === 'extra') return 'extra phase';
    if (k === 'lantern') return 'Shielded Lantern phase (caves only)';
    if (k === 'basic' || k === 'sunlight') return k;
    return extras.length ? `${base} ordinary + ${extras.length} extra (${[...new Set(extras)].join(', ')})` : 'unset';
}

// the choices for one phase: what to do, and where or how
function phaseChoices(G, i, at, base, extras, total) {
    const d = G.ui.draft, s = d.slots[i];
    // Extra phases (a Rest phase of the Health advantage, a Hide phase from a Cloak of Mist, a Move from boots...) are not tied to a place in the day:
    // any phase may be filled with anything, and an action is dimmed only when the other phases have already used up what it would need.
    const over = slots => planKinds(G.st, G.data, slots).kinds.filter(k => k === 'over').length;
    const others = d.slots.map((x, j) => (j === i ? null : x));
    const baseOver = over(others);
    const out = [];
    // the chips in rows by count: 8 in four columns, 9 in three (3x3), 10 in five: 'Nothing' is never alone on a row
    const followDay = d.slots[0]?.act === 'follow';
    // Follow (7.11): only in the first phase, only with another character in my clearing; it takes the whole day, so with it chosen the other phases have nothing to record
    if (followDay && i > 0) return [h('p', { class: 'hint', 'data-hint': 'follow-day' }, `You follow ${playerNameOf(G.st, d.slots[0].who)} today: there is nothing else to record. Pick another action in phase 1 to plan your own day.`)];
    const acts = ['move', 'hide', 'search', 'trade', 'hire', 'rest', 'alert', ...(G.st.ch.chits.some(x => x.type === 'magic') ? ['enchant'] : []), ...(flySources(G.st, G.data).length || G.st.ch.flying ? ['fly'] : []), ...(G.shared && i === 0 && G.ms?.followable?.length ? ['follow'] : []), 'nothing'];
    const cols = acts.length === 9 ? 3 : acts.length === 10 ? 5 : 4;
    out.push(h('div', { class: `chips2 six cols${cols}` },
        ...acts.map(a => {
            const cursed = (G.st.ch.curses ?? []).some(n => CURSE_ACT[n] === a), refused = actRefusal(G.st, a);
            const dim = cursed || !!refused || (a !== 'nothing' && a !== 'follow' && over(others.map((x, j) => (j === i ? { act: a, to: s?.act === a ? s.to : undefined } : x))) > baseOver);
            return h('button', { class: `chip${s?.act === a ? ' on' : ''}${dim ? ' dim' : ''}${cursed ? ' cursed' : ''}`, 'data-slot': i, 'data-pick': a, disabled: dim, title: refused ?? undefined, onclick: () => pick(G, i, a, at[i]) }, ACT_LABEL[a], cursed ? h('small', {}, ' \u2620') : null);
        })));
    if (s?.act === 'search' && at[i]) out.push(h('p', { class: 'hint', 'data-hint': 'search-where' }, searchWhere(G, at[i])));
    if (s?.act === 'follow' && i === 0) out.push(...followPicker(mc(G), s, who => { d.slots = Array(9).fill(null); d.slots[0] = { act: 'follow', who }; G.ui.planNote = null; render(G); }));
    // Alert: ready the weapon, or alert a Magic chit so that it can cast against fast creatures (it acts at time 0, and tires at Midnight if unused)
    const readyMagic = G.st.ch.chits.filter(x => x.type === 'magic' && x.state === 'active');
    if (s?.act === 'alert' && readyMagic.length) {
        const chip = (label, on, fn, key) => h('button', { class: `chip${on ? ' on' : ''}`, 'data-alert': key, onclick: fn }, label);
        out.push(h('p', { class: 'hint' }, 'Ready your weapon, or alert a Magic chit: an alerted chit acts at time 0, so it can cast even against the fastest creature. It tires at Midnight if it is not used.'));
        out.push(h('div', { class: 'chips2' }, chip('Weapon', !s.magic, () => { delete s.magic; render(G); }, 'weapon'),
            ...readyMagic.map(c => chip(`Magic ${c.numeral}${c.time}${'*'.repeat(c.effort)}`, s.magic === c.id, () => { s.magic = c.id; render(G); }, c.id))));
    }
    // Fly: a Fly chit (Broomstick, a Flying Carpet...) takes him over to this tile or a neighbouring one; he lands by a die roll (rule 4.3 flying)
    if (s?.act === 'fly' || G.ui.pickFly === i) {
        out.push(h('p', { class: 'hint' }, 'Fly over which tile? A flight needs a Fly chit; you land at a clearing on that tile by a die roll, and cannot be blocked in the air.'));
        out.push(h('div', { class: 'chips2' }, ...flyTiles(G.st, G.data).map(t => h('button', { class: `chip${s?.to === t ? ' on' : ''}`, 'data-fly-tile': t, onclick: () => { d.slots[i] = { act: 'fly', to: t }; G.ui.pickFly = null; G.ui.planNote = null; advance(G, i + 1); render(G); } }, tileName(t)))));
    }
    if (G.st.ch.mist) out.push(h('p', { class: 'hint bad' }, 'As mist you can only move and hide.'));
    else if (G.st.ch.morph) out.push(h('p', { class: 'hint bad' }, `In this shape you cannot ${['rest', 'trade', 'hire', 'enchant'].map(a => ACT_LABEL[a]?.toLowerCase() ?? a).join(', ')}.`));
    const blockedNow = (G.st.ch.curses ?? []).filter(n => CURSE_ACT[n]);
    if (blockedNow.length) out.push(h('p', { class: 'hint bad' }, `\u2620 ${blockedNow.map(n => `${n}: ${ACT_LABEL[CURSE_ACT[n]]} is not possible.`).join(' ')}`));
    // a climb needs its second Move straight after the first
    if (s?.act === 'move' && s.to && isMountain(G.st, G.data, s.to)) {
        const prev = d.slots[i - 1], next = d.slots[i + 1];
        const paired = (next?.act === 'move' && next.to === s.to) || (prev?.act === 'move' && prev.to === s.to);
        if (!paired) out.push(h('p', { class: 'hint bad' }, `${nameOfClearing(s.to)} is a mountain: it takes two Move phases in a row, so the next phase must be this Move too.`));
    }
    if (G.ui.pickMove === i || s?.act === 'move') {
        out.push(h('p', { class: 'hint' }, at[i] || G.st.ch.onRoad ? 'Tap a ringed clearing on the map to go there.' : 'You are on a road; move to one of its ends first.'));
        // where monsters wait: they block you at the end of the phase unless you are hidden, so the ones you could walk into are named
        const monsBy = new Map(); for (const m of G.st.mons) if (!m.dead && !m.hired && m.loc?.c && (G.ui.moveTargets ?? []).includes(m.loc.c)) monsBy.set(m.loc.c, [...(monsBy.get(m.loc.c) ?? []), G.data.monsters[m.id].name]);
        if (monsBy.size) out.unshift(h('p', { class: 'hint bad', 'data-hint': 'monsters-ahead' }, `Red rings have monsters (${[...monsBy].map(([c, n]) => `${nameOfClearing(c)}: ${[...new Set(n)].join(', ')}`).join('; ')}). If you are in plain sight when the phase ends there, they block you and your turn is lost. Hiding first keeps you safe.`));
        if (G.ui.moveMaybe?.length) out.push(h('p', { class: 'hint' }, `Dotted rings: ${G.ui.moveMaybe.map(nameOfClearing).join(', ')} lie along a hidden path or secret passage you have not found. Your earlier Search may find it; if it has not by then, this Move is lost.`));
    }
    if (planInfo(G).lantern) out.push(h('p', { class: 'hint', 'data-hint': 'lantern' }, 'Your Shielded Lantern gives one more phase for any activity, but only if you start that phase in a cave clearing: out in the open it is cancelled.'));
    if (extras.length) out.push(h('p', { class: 'hint' }, `${base} ordinary phases take any action; the extra phases (${[...new Set(extras)].map(x => ACT_LABEL[x]?.toLowerCase() ?? x).join(', ')}) can fall anywhere in the day, but only for their own action.`));
    return out;
}

function startDay(G) {
    const d = G.ui.draft, { total, kinds } = planInfo(G);
    // A phase that no longer exists (a move into a cave takes the sunlight phases away) is dropped, not refused.
    const slots = d.slots.map((s, i) => (!s || s.act === 'nothing' || i >= total || kinds[i] === 'over' ? null : s));
    if (slots[0]?.act === 'follow') for (let k = 1; k < slots.length; k++) slots[k] = null;
    G.ui.draft = null; G.ui.sheet = null; G.ui.planStep = 0; G.ui.planCollapsed = false; G.ui.peek = false; G.ui.sel = null;
    act(G, { type: 'plan', slots });
}

// The first phase that has nothing attached yet (null when every phase has an action, or 'Nothing' chosen on purpose).
function firstUnset(G) {
    const d = G.ui.draft, { total } = planInfo(G);
    if (d.slots[0]?.act === 'follow') return d.slots[0].who ? null : 0;              // (Follow is the whole day: nothing else to fill, once it names a guide)
    for (let i = 0; i < total; i++) if (!d.slots[i]) return i;
    return null;
}

function startButton(G) {
    const open = firstUnset(G);
    const bad = open == null ? planInfo(G).errors[0] : null;
    if (bad) return h('button', { class: 'btn', 'data-act': 'start-day', 'aria-disabled': 'true', onclick: () => { G.ui.toast = bad; render(G); setTimeout(() => { G.ui.toast = null; render(G); }, 2600); } }, 'Fix the plan');
    return open == null
        ? h('button', { class: 'btn primary', 'data-act': 'start-day', onclick: () => startDay(G) }, 'Start the day')
        : null;                                  // nothing to press until every phase has an action
}

// Out on the road after running away, the first phase is not a choice: it is a Move to one of the road's two ends (rule 8.3.8). The plan starts with it filled in
// and it cannot be cleared or turned into anything else; only which end can be changed.
function roadLocked(G, i) { return !!G.st.ch.onRoad && i === 0; }

export function newDraft(G) { const slots = Array(9).fill(null); if (G.st.ch.onRoad) slots[0] = { act: 'move', to: G.st.ch.onRoad.to }; return { slots }; }

function roadLockBox(G, d) {
    const r = G.st.ch.onRoad, cur = d.slots[0]?.to;
    return h('div', { class: 'roadlock', role: 'note' },
        h('div', { class: 'rl-head' }, icon('lock', 18), h('b', {}, 'This phase is fixed')),
        h('p', {}, `You fled along the road between ${nameOfClearing(r.from)} and ${nameOfClearing(r.to)}. You must Move to one end of it first.`),
        h('div', { class: 'row2' }, ...[r.from, r.to].map(id => h('button', { class: `btn${cur === id ? ' primary' : ''}`, 'data-road-end': id, 'aria-pressed': cur === id ? 'true' : 'false', onclick: () => { d.slots[0] = { act: 'move', to: id }; G.ui.planNote = null; G.ui.pickMove = null; advance(G, 1); render(G); } }, `${id === r.from ? 'Back to' : 'On to'} ${nameOfClearing(id)}`))));
}

export function planPanel(G) {
    const d = G.ui.draft, { total, base, extras } = planInfo(G), at = planLocations(G);
    G.ui.planStep = Math.max(0, Math.min(total - 1, G.ui.planStep ?? 0));
    const step = G.ui.planStep;
    const tabs = h('div', { class: 'plan-tabs', role: 'tablist' }, ...Array.from({ length: total }, (_, i) => h('button', { class: `ptab${i === step ? ' on' : ''}${d.slots[i] ? ' set' : ''}`, 'data-tab': i, role: 'tab',
        onclick: () => { G.ui.planStep = i; G.ui.pickMove = null; G.ui.pickSearch = null; render(G); } },
        h('b', {}, i + 1), h('small', {}, roadLocked(G, i) ? icon('lock', 11) : null, d.slots[i] ? (ACT_LABEL[d.slots[i].act] ?? d.slots[i].act) : '\u2013'))));
    const grab = h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }, h('span', { class: 'grip' }));
    const head = h('div', { class: 'plan-head' }, h('b', {}, 'Plan your day'), h('button', { class: 'x', 'aria-label': 'Put the plan away', onclick: () => { G.ui.planCollapsed = true; render(G); } }, '\u25BE'));
    const s = d.slots[step];
    const body = h('div', { class: 'plan-step' },
        h('div', { class: 'slot-head' }, h('b', {}, `Phase ${step + 1} of ${total}`), h('span', {}, slotKind(G, step, base, extras)), h('em', {}, s ? describeSlot(G, s) : 'not set'),
            s && !roadLocked(G, step) ? h('button', { class: 'clearbtn', onclick: () => { d.slots[step] = null; render(G); } }, 'Clear') : null),
        G.ui.planNote ? h('p', { class: 'hint bad' }, G.ui.planNote) : null,
        ...(roadLocked(G, step) ? [roadLockBox(G, d)] : phaseChoices(G, step, at, base, extras, total)),
        at[step] ? h('p', { class: 'hint' }, `You will be at ${nameOfClearing(at[step])}.`) : null,
        step === 0 ? ask(`Day ${G.st.day}: choose what you will do in each phase.`, 'Your plan is secret and fixed once you start the day. Fill the phases in any order: extra phases may fall anywhere, and an action is greyed out only when the others have used up what it needs.', { compact: true }) : null);
    // No Back or Next: the numbered tabs jump to any phase and choosing an action moves on to the next empty one. Only the start button is left,
    // and only once the plan can be played.
    const go = startButton(G);
    const nav = go ? h('div', { class: 'plan-nav' }, go) : null;
    const panel = h('div', { class: 'planpanel' }, grab, head, tabs, h('div', { class: 'plan-body' }, body), ...(nav ? [nav] : []));
    pullDown(grab, panel, () => { G.ui.planCollapsed = true; render(G); });
    return panel;
}

// the plan tucked away so the whole map shows; tap it to bring the plan back
export function planBar(G) {
    const d = G.ui.draft, { total } = planInfo(G);
    const parts = d.slots[0]?.act === 'follow' ? [describeSlot(G, d.slots[0])] : d.slots.slice(0, total).map((s, i) => `${i + 1} ${s ? describeSlot(G, s) : '–'}`);
    return h('div', { class: 'planbar' },
        h('button', { class: 'planbar-main', 'data-act': 'plan-open', onclick: () => { G.ui.planCollapsed = false; render(G); } }, h('b', {}, 'Your plan'), h('small', {}, parts.join(' · '))),
        startButton(G));
}

// A move into a cave takes the sunlight phases away, and an action chosen earlier can be left with no phase to stand in: such a slot is cleared
// (and the plan says so) instead of being left to make the whole plan invalid.
function pruneOver(G, why) {
    const d = G.ui.draft, k = planKinds(G.st, G.data, d.slots).kinds, lost = [];
    k.forEach((kind, i) => { if (kind === 'over' && d.slots[i]) { lost.push(i + 1); d.slots[i] = null; } });
    if (lost.length) G.ui.planNote = `Phase${lost.length > 1 ? 's' : ''} ${lost.join(', ')} cleared: ${why ?? 'there is no ordinary phase left for it'}.`;
    return lost.length > 0;
}

function pick(G, i, a, at) {
    const d = G.ui.draft;
    if (roadLocked(G, i)) return;
    if (actRefusal(G.st, a)) return;
    G.ui.pickMove = null; G.ui.pickSearch = null;
    if (a === 'move') { G.ui.pickMove = i; G.ui.pickFly = null; render(G); return; }
    if (a === 'fly') { G.ui.pickFly = i; G.ui.pickMove = null; d.slots[i] = { act: 'fly' }; render(G); return; }
    if (a === 'follow') {
        if (d.slots.some((x, k) => k > 0 && x)) G.ui.planNote = 'Follow takes the whole day, so the other phases were cleared.';
        d.slots = Array(9).fill(null); d.slots[0] = { act: 'follow' }; G.ui.planStep = 0; render(G); return;
    }
    d.slots[i] = { act: a };
    G.ui.planNote = null;
    pruneOver(G);
    if (a === 'alert' && G.st.ch.chits.some(x => x.type === 'magic' && x.state === 'active')) { G.ui.planStep = i; render(G); return; }      // stay: weapon or Magic chit is asked next
    advance(G, i + 1);
    render(G);
}

// after a phase is set, go on to the next one that still has nothing attached
function advance(G, from) {
    const { total } = planInfo(G);
    let n = from;
    while (n < total && G.ui.draft.slots[n]) n++;
    if (n < total) G.ui.planStep = n;
    else if (from < total) G.ui.planStep = Math.min(from, total - 1);
}

export function setMove(G, i, to) {
    const d = G.ui.draft;
    if (roadLocked(G, i) && to !== G.st.ch.onRoad.from && to !== G.st.ch.onRoad.to) return;
    d.slots[i] = { act: 'move', to };
    // a mountain takes two moves in a row: fill the next phase with the same move
    // (only if the next phase can really be a Move: an extra phase that is for Rest alone, or a day with no phase left, is not filled)
    const secondHalf = !!planState(G.st, G.data, d.slots).climbing[i];          // (this Move finishes a climb already begun: nothing more to fill in)
    if (isMountain(G.st, G.data, to) && !secondHalf && i + 1 < planInfo(G).total && !d.slots[i + 1]) {
        const trial = d.slots.map((x, j) => (j === i + 1 ? { act: 'move', to } : x));
        const k = planKinds(G.st, G.data, trial);
        if (k.kinds[i + 1] === 'basic' || k.kinds[i + 1] === 'sunlight' || k.kinds[i + 1] === 'extra') d.slots[i + 1] = { act: 'move', to };
    }
    G.ui.pickMove = null;
    G.ui.planNote = null;
    pruneOver(G, isCave(G.st, G.data, to) ? 'a move into a cave takes away the sunlight phases, so the day is shorter' : null);
    advance(G, i + 1);
    render(G);
}
