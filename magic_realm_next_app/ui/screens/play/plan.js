// play/plan.js: the plan tray (planTray: tabs, one line, the nine actions, Start the day; tray.js puts it in the tray) and the draft logic behind it (pick, setMove, advance, pruneOver, startDay).
import { planKinds } from '../../../engine/day.js';
import { flySources, flyTiles } from '../../../engine/magic/fly.js';
import { isCave, isMountain, nameOfClearing, tileName } from '../../../engine/world.js';
import { h } from '../../dom.js';
import { playerOf as playerNameOf } from '../../meet.js';
import { actRefusal, planState } from '../../planlogic.js';
import { followPicker } from '../meetui.js';
import { act } from './actions.js';
import { btn, primary } from '../../ds.js';
import { actIcon, icon } from '../../icons.js';
import { ACT_LABEL, CURSE_ACT, CURSE_PLAIN, actArt, mc, showToast } from './kit.js';
import { describeSlot, searchWhere } from './phases.js';
import { render } from './shell.js';

// ---- planning: the plan tray (mockup 01 a2 to a6) ----
// Five tabs, one line that says what to do, the nine actions as game art in a 3x3, and the action row: how many phases are left on the left, Start the day on the right (dim, with its
// reason, until the plan is whole). Choosing Move steps the chooser aside so the map has the screen: the clearings he can walk to are ringed on it, a tap sets the move.
// where he will be at the start of each phase, as planned (the first half of a mountain climb does not bring him there: planlogic.js)
function planLocations(G) { return planState(G.st, G.data, G.ui.draft.slots).at; }

function planInfo(G) {
    const v = planKinds(G.st, G.data, G.ui.draft.slots);
    return { total: v.total, base: v.base, lantern: v.lantern, extras: v.extras, kinds: v.kinds, errors: v.errors };
}

// the second Move of a climb (a mountain takes two Moves in a row): fixed, because the first one decided it
function climbLocked(G, i) {
    const s = G.ui.draft.slots[i], prev = G.ui.draft.slots[i - 1];
    return !!(s?.act === 'move' && s.to && prev?.act === 'move' && prev.to === s.to && isMountain(G.st, G.data, s.to));
}

// short word for a tab: "Move·BV2", "Hide", "Search"
const tabWord = s => (!s ? '–' : s.act === 'move' && s.to ? `Move·${s.to}` : (ACT_LABEL[s.act] ?? s.act));
const nb = s => String(s).replace(/ (\d+)$/, ' $1');

// The nine (or eight, ten, eleven) actions as chips. A dim chip stays tappable and says why.
function actChips(G, i, at, over, others, baseOver) {
    const d = G.ui.draft, s = d.slots[i];
    const acts = ['move', 'hide', 'search', 'trade', 'hire', 'rest', 'alert', ...(G.st.ch.chits.some(x => x.type === 'magic') ? ['enchant'] : []), ...(flySources(G.st, G.data).length || G.st.ch.flying ? ['fly'] : []), ...(G.shared && i === 0 && G.ms?.followable?.length ? ['follow'] : []), 'nothing'];
    const n = acts.length;
    return h('div', { class: `ds-acts n${n}` }, ...acts.map(a => {
        const curse = (G.st.ch.curses ?? []).find(c => CURSE_ACT[c] === a), refused = actRefusal(G.st, a);
        const spent = !curse && !refused && a !== 'nothing' && a !== 'follow' && over(others.map((x, j) => (j === i ? { act: a, to: s?.act === a ? s.to : undefined } : x))) > baseOver;
        const why = curse ? `${curse}: ${CURSE_PLAIN[curse] ?? 'it spoils this action.'}` : refused ?? (spent ? 'The other phases have used up what that needs: there is no phase left for it.' : null);
        const dim = !!why;
        return h('button', { type: 'button', class: `ds-act chip${s?.act === a ? ' on' : ''}${dim ? ' dim' : ''}${curse ? ' cursed' : ''}`, 'data-slot': i, 'data-pick': a, 'aria-disabled': dim ? 'true' : null, title: why ?? undefined,
            onclick: () => { if (dim) { showToast(G, why, true); return; } pick(G, i, a, at[i]); } }, actIcon(actArt(a), 28), ACT_LABEL[a]);
    }));
}

// The one line under the tabs, and the Back / Clear button at its right
function askLine(G, i, step, total) {
    const d = G.ui.draft, s = d.slots[i], moving = G.ui.pickMove === i;
    if (moving) {
        return h('div', { class: 'ds-plan-ask' }, h('span', {}, 'Where to? ', h('span', { class: 'ds-dim' }, (planLocations(G)[i] || G.st.ch.onRoad) ? 'Tap a ringed clearing.' : 'You are on a road; move to one of its ends first.')),
            btn('Back', 'quiet sm', { 'data-act': 'plan-back', onclick: () => { G.ui.pickMove = null; render(G); } }));
    }
    const text = s ? h('span', {}, `Phase ${i + 1} of ${total}: `, h('span', { class: 'ds-dim' }, nb(describeSlot(G, s)), '.')) : h('span', {}, `Phase ${i + 1} of ${total}: pick one.`);
    const clearable = s && !roadLocked(G, i) && !climbLocked(G, i);
    return h('div', { class: 'ds-plan-ask' }, text,
        clearable ? btn(`Clear ${i + 1}`, 'quiet sm clearbtn', { onclick: () => { d.slots[i] = null; if (climbLocked(G, i + 1)) d.slots[i + 1] = null; G.ui.pickMove = null; G.ui.planNote = null; G.ui.planStep = i; render(G); } }) : null);
}

// what must be said besides the chips: where monsters wait, hidden paths, a curse, a mist (kept short, one line each, only when it matters)
function planHints(G, i, at) {
    const d = G.ui.draft, s = d.slots[i], out = [];
    const line = (txt, cls = '', attrs = {}) => h('p', { class: `ds-hint-line ${cls}`.trim(), ...attrs }, txt);
    if (G.ui.planNote) out.push(line(G.ui.planNote, 'bad'));
    if (s?.act === 'search' && at[i]) out.push(line(searchWhere(G, at[i]), '', { 'data-hint': 'search-where' }));
    if (G.ui.pickMove === i || s?.act === 'move') {
        // where monsters wait: they block you at the end of the phase unless you are hidden, so the ones you could walk into are named
        const monsBy = new Map(); for (const m of G.st.mons) if (!m.dead && !m.hired && m.loc?.c && (G.ui.moveTargets ?? []).includes(m.loc.c)) monsBy.set(m.loc.c, [...(monsBy.get(m.loc.c) ?? []), G.data.monsters[m.id].name]);
        if (G.ui.pickMove === i && monsBy.size) out.push(line(`Red rings have monsters (${[...monsBy].map(([c, n]) => `${nameOfClearing(c)}: ${[...new Set(n)].join(', ')}`).join('; ')}). In plain sight at the end of the phase they block you and your turn is lost. Hiding first keeps you safe.`, 'bad', { 'data-hint': 'monsters-ahead' }));
        if (G.ui.pickMove === i && G.ui.moveMaybe?.length) out.push(line(`Dotted: ${G.ui.moveMaybe.map(nameOfClearing).join(', ')} lie along a hidden path you have not found. Your earlier Search may find it; if it has not, this Move is lost.`));
    }
    if (G.st.ch.mist) out.push(line('As mist you can only move and hide.', 'bad'));
    else if (G.st.ch.morph) out.push(line(`In this shape you cannot ${['rest', 'trade', 'hire', 'enchant'].map(a => ACT_LABEL[a]?.toLowerCase() ?? a).join(', ')}.`, 'bad'));
    if (s?.act === 'move' && s.to && isMountain(G.st, G.data, s.to) && !climbLocked(G, i)) {
        const next = d.slots[i + 1];
        if (!(next?.act === 'move' && next.to === s.to)) out.push(line(`${nameOfClearing(s.to)} is a mountain: it takes two Move phases in a row, so the next phase must be this Move too.`, 'bad'));
    }
    if (planInfo(G).lantern) out.push(line('Your Shielded Lantern gives one more phase for any activity, but only if you start that phase in a cave clearing.', '', { 'data-hint': 'lantern' }));
    return out;
}

// the pickers that stand in for the chips: weapon or Magic chit (Alert), the tile to fly over (Fly), the guide to follow (Follow)
function subPicker(G, i, at) {
    const d = G.ui.draft, s = d.slots[i];
    const readyMagic = G.st.ch.chits.filter(x => x.type === 'magic' && x.state === 'active');
    if (s?.act === 'alert' && readyMagic.length) {
        const chip = (label, on, fn, key) => h('button', { type: 'button', class: `ds-chip${on ? ' on' : ''}`, 'data-alert': key, onclick: fn }, label);
        return [h('p', { class: 'ds-hint-line' }, 'Ready your weapon, or wake a Magic chit. An alerted chit acts first, and tires at Midnight if unused.'),
            h('div', { class: 'ds-chips' }, chip('Weapon', !s.magic, () => { delete s.magic; advance(G, i + 1); render(G); }, 'weapon'),
                ...readyMagic.map(c => chip(`Magic ${c.numeral}${c.time}${'*'.repeat(c.effort)}`, s.magic === c.id, () => { s.magic = c.id; advance(G, i + 1); render(G); }, c.id)))];
    }
    if (s?.act === 'fly' || G.ui.pickFly === i) {
        return [h('p', { class: 'ds-hint-line' }, 'Take to the air: tap a ringed tile on the map. You come down in one of its clearings, and nothing can block you aloft.'),
            h('div', { class: 'ds-chips' }, ...flyTiles(G.st, G.data).map(t => h('button', { type: 'button', class: `ds-chip${s?.to === t ? ' on' : ''}`, 'data-fly-tile': t, onclick: () => setFly(G, i, t) }, tileName(t))))];
    }
    if (s?.act === 'follow' && i === 0) return [h('div', { class: 'ds-sub-scroll' }, ...followPicker(mc(G), s, who => { d.slots = Array(9).fill(null); d.slots[0] = { act: 'follow', who }; G.ui.planNote = null; render(G); }))];
    return null;
}

// The whole plan tray: { body, lead, primary } for tray.js
export function planTray(G) {
    const d = G.ui.draft, { total, kinds } = planInfo(G), at = planLocations(G);
    if (G.ui.planStep === undefined) G.ui.planStep = 0;
    const step = G.ui.planStep == null ? null : (G.ui.planStep = Math.max(0, Math.min(total - 1, G.ui.planStep)));
    const open = firstUnset(G), whole = open == null && !planInfo(G).errors.length;
    const many = total > 5;
    const tabs = h('div', { class: `ds-tabs${many ? ' many' : ''}`, role: 'tablist' }, ...Array.from({ length: total }, (_, i) => {
        const s = d.slots[i], locked = roadLocked(G, i) || climbLocked(G, i);
        return h('button', { type: 'button', class: `ds-tab ptab${i === step ? ' on' : ''}${s ? ' set' : ''}${locked ? ' locked' : ''}`, 'data-tab': i, role: 'tab', 'aria-selected': i === step ? 'true' : 'false', 'aria-label': `Phase ${i + 1}: ${s ? describeSlot(G, s) : 'not set'}`,
            onclick: () => { G.ui.planStep = i; G.ui.pickMove = null; G.ui.pickSearch = null; G.ui.pickFly = null; render(G); } },
            h('span', {}, locked ? icon('lock') : String(i + 1)), h('small', {}, many ? (s ? actIcon(actArt(s.act), 20) : '–') : tabWord(s)));
    }));
    const kids = [tabs];
    let lead, prim;
    const unsetN = Array.from({ length: total }, (_, i) => d.slots[i]).filter(s => !s).length;
    if (step == null) {
        // the plan is whole: one summary line, nothing else to do but start
        const names = d.slots.slice(0, total).map((s, i) => `${kinds[i] === 'extra' ? 'your extra ' : ''}${s ? (ACT_LABEL[s.act] ?? s.act) : 'Nothing'}`);
        const sum = d.slots[0]?.act === 'follow' ? describeSlot(G, d.slots[0]) : names.length > 1 ? `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}` : names[0];
        kids.push(h('div', { class: 'ds-plan-ask' }, h('span', { class: 'ds-dim' }, `${sum}. Ready when you are.`)));
        lead = h('span', { class: 'ds-lead-text' }, h('b', {}, `${total} of ${total}`), ' set');
    } else {
        kids.push(askLine(G, step, step, total));
        const sub = !roadLocked(G, step) && !climbLocked(G, step) && G.ui.pickMove !== step ? subPicker(G, step, at) : null;
        if (roadLocked(G, step)) kids.push(roadLockBox(G, d));
        else if (climbLocked(G, step)) kids.push(h('div', { class: 'ds-lockbox' }, icon('lock'), h('span', {}, `Fixed: the climb to ${nameOfClearing(d.slots[step].to)} takes two Moves.`)));
        else if (G.ui.pickMove === step) { /* the map is the chooser */ }
        else if (sub) kids.push(...sub);
        else {
            const over = slots => planKinds(G.st, G.data, slots).kinds.filter(k => k === 'over').length;
            const others = d.slots.map((x, j) => (j === step ? null : x));
            const followDay = d.slots[0]?.act === 'follow';
            if (followDay && step > 0) kids.push(h('p', { class: 'ds-hint-line', 'data-hint': 'follow-day' }, `You follow ${playerNameOf(G.st, d.slots[0].who)} today: there is nothing else to record. Pick another action in phase 1 to plan your own day.`));
            else kids.push(actChips(G, step, at, over, others, over(others)));
        }
        kids.push(...planHints(G, step, at));
        lead = G.ui.pickMove === step ? h('span', { class: 'ds-lead-text' }, h('b', {}, 'Move'), ` · ${step + 1} of ${total}`) : h('span', { class: 'ds-lead-text' }, h('b', {}, `${unsetN} phase${unsetN === 1 ? '' : 's'}`), ' to plan');
    }
    prim = startButton(G, step != null && (roadLocked(G, step) || climbLocked(G, step)) && !whole ? open ?? null : false);
    return { body: h('div', { class: 'ds-plan' }, ...kids), lead, primary: prim };
}

function startDay(G) {
    const d = G.ui.draft, { total, kinds } = planInfo(G);
    // A phase that no longer exists (a move into a cave takes the sunlight phases away) is dropped, not refused.
    const slots = d.slots.map((s, i) => (!s || s.act === 'nothing' || i >= total || kinds[i] === 'over' ? null : s));
    if (slots[0]?.act === 'follow') for (let k = 1; k < slots.length; k++) slots[k] = null;
    G.ui.draft = null; G.ui.sheet = null; G.ui.planStep = 0; G.ui.peek = false; G.ui.sel = null; G.ui.pickMove = null; G.ui.pickFly = null; G.ui.planNote = null;
    act(G, { type: 'plan', slots });
}

// The first phase that has nothing attached yet (null when every phase has an action, or 'Nothing' chosen on purpose).
function firstUnset(G) {
    const d = G.ui.draft, { total } = planInfo(G);
    if (d.slots[0]?.act === 'follow') return d.slots[0].who ? null : 0;              // (Follow is the whole day: nothing else to fill, once it names a guide)
    for (let i = 0; i < total; i++) if (!d.slots[i]) return i;
    return null;
}

// The primary of the plan tray: Start the day, lit when the plan is whole, otherwise dim and (when tapped) saying why. On a fixed step it is "Next phase".
function startButton(G, nextTo) {
    const open = firstUnset(G);
    const bad = open == null ? planInfo(G).errors[0] : null;
    if (nextTo !== false && nextTo != null) return primary('Next phase', { 'data-act': 'plan-next', onclick: () => { G.ui.planStep = nextTo; G.ui.pickMove = null; render(G); } });
    if (bad) return btn('Start the day', 'primary is-dim', { 'data-act': 'start-day', 'aria-disabled': 'true', onclick: () => showToast(G, bad, true) });
    if (open == null) return primary('Start the day', { 'data-act': 'start-day', onclick: () => startDay(G) });
    return btn('Start the day', 'primary is-dim', { 'data-act': 'start-day', 'aria-disabled': 'true', onclick: () => showToast(G, `Phase ${open + 1} still needs an action.`, true) });
}

// Out on the road after running away, the first phase is not a choice: it is a Move to one of the road's two ends (rule 8.3.8). The plan starts with it filled in
// and it cannot be cleared or turned into anything else; only which end can be changed.
function roadLocked(G, i) { return !!G.st.ch.onRoad && i === 0; }

// Fly: the tile is chosen on the map (a ring on each tile he may fly over) or by the chip fallback; the day goes on to the next phase.
export function setFly(G, i, t) { G.ui.draft.slots[i] = { act: 'fly', to: t }; G.ui.pickFly = null; G.ui.planNote = null; advance(G, i + 1); render(G); }

export function newDraft(G) { const slots = Array(9).fill(null); if (G.st.ch.onRoad) slots[0] = { act: 'move', to: G.st.ch.onRoad.to }; return { slots }; }

function roadLockBox(G, d) {
    const r = G.st.ch.onRoad, cur = d.slots[0]?.to;
    return h('div', { class: 'roadlock' },
        h('div', { class: 'ds-lockbox', role: 'note' }, icon('lock'), h('span', {}, `Fixed: you fled along the road between ${nb(nameOfClearing(r.from))} and ${nb(nameOfClearing(r.to))}. You must Move to one end of it first.`)),
        h('div', { class: 'row2' }, ...[r.from, r.to].map(id => h('button', { type: 'button', class: `ds-btn${cur === id ? ' primary' : ''}`, 'data-road-end': id, 'aria-pressed': cur === id ? 'true' : 'false', onclick: () => { d.slots[0] = { act: 'move', to: id }; G.ui.planNote = null; G.ui.pickMove = null; advance(G, 1); render(G); } }, `${id === r.from ? 'Back to' : 'On to'} ${nb(nameOfClearing(id))}`))));
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
    if (roadLocked(G, i) || climbLocked(G, i)) return;
    if (actRefusal(G.st, a)) return;
    G.ui.pickMove = null; G.ui.pickSearch = null;
    if (a === 'move') { G.ui.pickMove = i; G.ui.pickFly = null; render(G); return; }
    if (a === 'fly') { G.ui.pickFly = i; G.ui.pickMove = null; d.slots[i] = { act: 'fly' }; render(G); return; }
    if (a === 'follow') {
        if (d.slots.some((x, k) => k > 0 && x)) G.ui.planNote = 'Follow takes the whole day, so the other phases were cleared.';
        d.slots = Array(9).fill(null); d.slots[0] = { act: 'follow' }; G.ui.planStep = 0; render(G); return;
    }
    if (climbLocked(G, i + 1)) d.slots[i + 1] = null;                      // the second half of a climb goes with the first
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
    else { const open = firstUnset(G); G.ui.planStep = open != null ? open : null; }          // the plan is whole: no tab is open, the tray says so
}

export function setMove(G, i, to) {
    const d = G.ui.draft;
    if (roadLocked(G, i) && to !== G.st.ch.onRoad.from && to !== G.st.ch.onRoad.to) return;
    if (climbLocked(G, i + 1)) d.slots[i + 1] = null;                      // a changed Move takes the second half of its old climb with it
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
