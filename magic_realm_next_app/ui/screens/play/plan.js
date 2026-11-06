// play/plan.js: the plan tray (planTray: tabs, one line, the nine actions, Start the day; tray.js puts it in the tray) and the draft logic behind it (pick, setMove, advance, pruneOver, startDay).
import { planKinds, phasesFor, validatePlan, tableModel } from '../../combat/feed.js';
import { nameOfClearing, numOf, tileName } from '../../../engine/catalogue.js';
import { flyFacts, isCave, isMountain } from '../../combat/mapfeed.js';
import { h } from '../../dom.js';
import { FOLLOW_FIRST, followReason, playerOf as playerNameOf } from '../../meet.js';
import { EDGE, actRefusal, canLeaveAt, destName, edgeIndex, planState } from '../../planlogic.js';
import { followPicker } from '../meetui.js';
import { nameOf } from '../../../engine/catalogue.js';
import { alertCardWhy, voiced, weaponCardOf } from '../../commit.js';
import { wouldDrop } from '../kit/kit.js';
import { flyRefusal, flyWords, voicedWhy } from '../../spellwhy.js';
import { MONSTER_PLAN_NOTE, PLAN_ONLY_NOTE, leaderGame, planActs, seatName } from '../../leaders.js';
import { flyWarning } from '../../steeds.js';
import { flyChoice, flySlot } from './steedplan.js';
import { act } from './actions.js';
import { followersLine, needsAssign, takeAssign } from './leaders.js';
import { partyPlan, startParty, stillToPlan } from './partyplan.js';
import { btn, primary } from '../../ds.js';
import { isStory as isStoryVoice } from '../../voice.js';
import { actIcon, icon } from '../../icons.js';
import { ACT_LABEL, CURSE_ACT, CURSE_PLAIN, actArt, mc, showToast } from './kit.js';
import { describeSlot, searchWhere } from './phases.js';
import { render } from './shell.js';
import { shareCards, shareHints } from './share.js';
import { ownSheet, questionOf, lullOf } from '../../combat/feed.js';

// ---- planning: the plan tray (mockup 01 a2 to a6) ----
// Five tabs, one line that says what to do, the nine actions as game art in a 3x3, and the action row: how many phases are left on the left, Start the day on the right (dim, with its
// reason, until the plan is whole). Choosing Move steps the chooser aside so the map has the screen: the clearings he can walk to are ringed on it, a tap sets the move.
// where he will be at the start of each phase, as planned (the first half of a mountain climb does not bring him there: planlogic.js)
function planLocations(G) { return planState(G.st, G.data, G.ui.draft.slots).at; }

// A weapon card has no alerted side (2.3.4d): while the weapon in hand is one, the Alert phase can only wake a Magic chit. `cardWhy` is the plain sentence, or null when the weapon can be readied.
const readyMagicOf = G => ownSheet(G.st, G.data).chits.filter(x => x.type === 'magic' && x.state === 'active');
function cardWhy(G) { const w = weaponCardOf(G.st, G.data); return w ? alertCardWhy(nameOf(G.data, w)) : null; }
function cardAlertErrors(G, slots, kinds) {
    const why = cardWhy(G);
    if (!why) return [];
    const bad = slots.findIndex((s, i) => s?.act === 'alert' && !s.magic && kinds[i] !== 'over');
    return bad < 0 ? [] : [`Phase ${bad + 1}: ${why.story} Wake a Magic chit, or pick something else.`];
}

export function planInfo(G) {
    const slots = G.ui.draft.slots, v = planKinds(G.st, G.data, slots), ponyOn = phasesFor(G.st, G.data, slots).ponyOn;
    // The pony (ruling R1, ch7-day.md): each Move he gets from other sources may be followed by one more Move, the pony's, and the two kinds strictly alternate. How many there are depends on the
    // Moves he records (the engine picks which ones are the pony's: the second, fourth ... Move of the day), so the phases cannot be counted ahead. Once every phase has an action, one SPARE tab
    // is offered for one more Move; it counts as a phase only if the engine can make it the pony's.
    const full = Array.from({ length: v.total }, (_, i) => slots[i]).every(Boolean);
    const spare = ponyOn && full && v.total < 9 ? v.total : null;
    return { total: v.total, base: v.base, lantern: v.lantern, extras: v.extras, kinds: v.kinds, errors: [...v.errors, ...cardAlertErrors(G, slots, v.kinds)], ponyOn, ponyAt: v.ponyAt ?? [], spare, shown: v.total + (spare != null ? 1 : 0) };
}

// the second Move of a climb (a mountain takes two Moves in a row): fixed, because the first one decided it
function climbLocked(G, i) {
    const s = G.ui.draft.slots[i], prev = G.ui.draft.slots[i - 1];
    return !!(s?.act === 'move' && s.to && prev?.act === 'move' && prev.to === s.to && isMountain(G.st, G.data, s.to));
}

// short word for a tab: "Move · 2" (the number the player reads on the map, never the engine's code: DR-11), "Hide", "Search"
const tabWord = s => (!s ? '\u2013' : s.act === 'move' && s.to === EDGE ? 'Leave' : s.act === 'move' && s.to ? `Move\u00A0\u00B7\u00A0${numOf(s.to)}` : (ACT_LABEL[s.act] ?? s.act));
const nb = s => String(s).replace(/ (\d+)$/, ' $1');

// The plan in one sentence (DR-13): capitalised, an extra phase named as one, and a run of Nothing said once ("Move, Hide, Search and two phases of Nothing"). Pure: tools/ui_planlogic.py reads it.
export function planSentence(items) {
    const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
    const bits = [];
    let nothing = 0;
    for (const it of items) { if (it.what === 'Nothing' && !it.extra) { nothing++; continue; } bits.push(it.extra ? `an extra ${it.what}` : it.what); }
    const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    if (nothing) bits.push(nothing === 1 ? 'Nothing' : `${words[nothing] ?? nothing} phases of Nothing`);
    return cap(bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}` : bits[0] ?? 'Nothing');
}

// Follow in the plan: one row per other character from the engine (`meetOptions(...).followWhy`, via meetState), or none in a game of one.
const followRows = G => (G.fw?.followWhy ?? []);
// Why the Follow chip is dim at phase `i`, in the voice he reads; null when it can be used
function followDim(G, i, rows) {
    if (i !== 0) return voicedWhy(FOLLOW_FIRST);
    if (rows.some(r => r.ok)) return null;
    return rows.length === 1 ? voicedWhy(followReason(rows[0])) : voicedWhy({ story: 'Nobody can be followed now.', detail: 'Nobody can be followed now.' });
}
// the note under the chips once a dim Follow was tapped: a line for each character, with what it would take
function followNote(G, i) {
    const rows = followRows(G);
    if (G.ui.followNote !== i || i !== 0 || !rows.length || rows.some(r => r.ok)) return [];
    return rows.map(r => h('p', { class: 'ds-hint-line', 'data-hint': 'follow-why', 'data-who': r.id }, voiced(followReason(r))));
}

// The nine (or eight, ten, eleven) actions as chips. A dim chip stays tappable and says why.
const PONY_WHY = 'The pony adds a Move only after a Move of your own: they take turns, and the first Move of the day is never the pony\u2019s.';
// A Flying Carpet he owns that sleeps today and nothing else to fly with: the Fly chip stays on (7.3.3a.1) and says why it will fail
const carpetAsleep = G => flyFacts(G.st, G.data).carpet && !flyFacts(G.st, G.data).sources.length && !ownSheet(G.st, G.data).flying && !ownSheet(G.st, G.data).morph && !flyFacts(G.st, G.data).rides.length;
function actChips(G, i, at, over, others, baseOver) {
    const d = G.ui.draft, s = d.slots[i], isSpare = planInfo(G).spare === i;
    // a hired leader's plan (6.2.5): the engine names what he may record (`pending.leader.acts`); no Enchant, no Fly of his own, and a controlled monster no Trade or Hire
    // Follow (7.11) is always on the sheet when there is anyone to follow in the game (several characters); it is dim, with the reason, when it cannot be used
    const L = planActs(questionOf(G.st, G.data)), fRows = followRows(G), showFollow = fRows.length > 0;
    const acts = L ? [...L.acts.filter(a => a !== 'follow'), ...(showFollow ? ['follow'] : []), 'nothing']
        : ['move', 'hide', 'search', 'trade', 'hire', 'rest', 'alert', ...(ownSheet(G.st, G.data).chits.some(x => x.type === 'magic') ? ['enchant'] : []), ...(flyFacts(G.st, G.data).canRecord || flyRefusal(G.st, G.data) ? ['fly'] : []), ...(showFollow ? ['follow'] : []), 'nothing'];
    const n = acts.length;
    return h('div', { class: `ds-acts n${n}` }, ...acts.map(a => {
        const curse = (ownSheet(G.st, G.data).curses ?? []).find(c => CURSE_ACT[c] === a), refused = actRefusal(G.st, G.data, a) ?? (a === 'fly' && flyRefusal(G.st, G.data) ? voicedWhy(flyRefusal(G.st, G.data)) : null);          // (a transformed hero cannot play a Fly chit: the chip stays, dim, and says so)
        const spent = !curse && !refused && a !== 'nothing' && a !== 'follow' && over(others.map((x, j) => (j === i ? { act: a, to: s?.act === a ? s.to : undefined } : x))) > baseOver;
        const cardOnly = a === 'alert' && !readyMagicOf(G).length ? cardWhy(G) : null;          // (no Magic chit to wake either: the Alert would do nothing)
        const why = curse ? `${curse}: ${CURSE_PLAIN[curse] ?? 'it spoils this action.'}` : refused ?? (a === 'follow' ? followDim(G, i, fRows) : null) ?? (cardOnly ? `${cardOnly.story} There is nothing to ready.` : null) ?? (isSpare && a !== 'move' ? 'This phase is the pony\u2019s: it is for a Move only.' : spent ? (isSpare ? PONY_WHY : 'All your phases are taken.') : null);
        const dim = !!why;
        const serves = L?.recordOnly.has(a) ? (isStoryVoice() ? PLAN_ONLY_NOTE.story : PLAN_ONLY_NOTE.detail) : null;          // (a leader's Alert and Rest are for those who follow him)
        return h('button', { type: 'button', class: `ds-act chip${s?.act === a ? ' on' : ''}${dim ? ' dim' : ''}${curse ? ' cursed' : ''}${serves ? ' for-followers' : ''}`, 'data-slot': i, 'data-pick': a, 'data-for-followers': serves ? '1' : null, 'aria-disabled': dim ? 'true' : null, title: why ?? serves ?? undefined,
            onclick: () => { if (dim) { if (a === 'follow' && i === 0 && !fRows.some(r => r.ok)) { G.ui.followNote = i; render(G); return; } showToast(G, why, true); return; } pick(G, i, a, at[i]); } }, actIcon(actArt(a), 28), a === 'fly' && carpetAsleep(G) ? h('span', { class: 'ds-act-lbl' }, ACT_LABEL[a], h('small', { 'data-hint': 'carpet-asleep' }, 'Carpet, asleep')) : curse ? h('span', { class: 'ds-act-lbl' }, h('span', { class: 'nm' }, ACT_LABEL[a]), h('small', { 'data-hint': 'curse-dim', 'data-curse': curse }, curse)) : ACT_LABEL[a]);          // (a dim chip wears the name of the curse that spoils it: note 110)
    }));
}

// The one line under the tabs, and the Back / Clear button at its right
function askLine(G, i, step, total) {
    const d = G.ui.draft, s = d.slots[i], moving = G.ui.pickMove === i;
    if (moving) {
        return h('div', { class: 'ds-plan-ask' }, h('span', {}, 'Where to? ', h('span', { class: 'ds-dim' }, (planLocations(G)[i] || ownSheet(G.st, G.data).onRoad) ? 'Tap a ringed clearing.' : 'You are on a road; move to one of its ends first.')),
            btn('Back', 'quiet sm', { 'data-act': 'plan-back', onclick: () => { G.ui.pickMove = null; render(G); } }));
    }
    const info = planInfo(G), pony = info.ponyAt.includes(i), who = ownSheet(G.st, G.data).leader ? `${seatName(tableModel(G.st, G.data), ownSheet(G.st, G.data).id)}, ` : '';          // (a seat's plan says whose it is)
    const text = info.spare === i ? h('span', { 'data-hint': 'pony-spare' }, h('span', { 'data-v': 'story' }, `Phase ${i + 1}: one more Move, the pony\u2019s.`), h('span', { 'data-v': 'detail' }, `Phase ${i + 1}: the pony\u2019s Move (7.3.2b.3: it alternates with yours).`))
        : s && pony ? h('span', {}, `Phase ${i + 1}: `, h('span', { class: 'ds-dim' }, `pony ${nb(describeSlot(G, s))}.`))
        : s ? h('span', {}, `${who}phase ${i + 1} of ${total}: `.replace(/^(\w)/, c => c.toUpperCase()), h('span', { class: 'ds-dim' }, nb(describeSlot(G, s)), '.')) : h('span', {}, `${who}phase ${i + 1} of ${total}: pick one.`.replace(/^(\w)/, c => c.toUpperCase()));
    const clearable = s && !roadLocked(G, i) && !climbLocked(G, i);
    return h('div', { class: 'ds-plan-ask' }, text,
        clearable ? btn(`Clear ${i + 1}`, 'quiet sm clearbtn', { onclick: () => { d.slots[i] = null; if (climbLocked(G, i + 1)) d.slots[i + 1] = null; G.ui.pickMove = null; G.ui.planNote = null; G.ui.planStep = i; if (info.ponyOn) pruneOver(G, 'the pony\u2019s Move needs a Move of your own before it'); render(G); } }) : null);
}

// A phase the plan records but the day will cancel when it is tried (ruling S6, 4.6.9c, 7.3.3a.1): a Fly with nothing to fly with, too heavy, too far, or none left; a mist hero's activity. The engine accepts the
// plan and says so in `validatePlan().warnings`; the tray tells him in the voice he reads, and blocks nothing. A phase after he leaves the map is dropped, so it is not warned about.
const WARN_RULE = { fly: '4.6.9c, 7.3.3a.1', mist: '8.4.5p.1' };
function planWarnings(G) {
    const slots = G.ui.draft.slots, edge = edgeIndex(slots);
    // note 147: a Move to a mountain clearing needs two Move phases in a row (7.3.1c.1); when the plan ends the day after the first of them, he has not moved at all and the climb is lost (it must be done again from the start)
    const st0 = planState(G.st, G.data, slots), half = [];
    slots.forEach((sl, i) => { if (sl?.act === 'move' && sl.to && sl.to !== 'Edge' && st0.climbing[i + 1] === sl.to && st0.climbing[i] !== sl.to && !(slots[i + 1]?.act === 'move' && slots[i + 1].to === sl.to) && (edge < 0 || i <= edge)) half.push(i); });
    const climbs = half.map(i => { const place = nameOfClearing(slots[i].to).replace(/ (\d+)$/, '\u00A0$1'); return { i, copy: {
        story: `Phase ${i + 1}: ${place} is a mountain, and it takes two Move phases in a row. This Move only starts the climb, and no Move follows it, so you stay where you are and the climb is lost. You can still change it.`,
        detail: `Phase ${i + 1}: entering a mountain clearing takes two Move activities on consecutive phases of the same day, and he does not move at all until the second (7.3.1c.1). Nothing follows this Move, so it is recorded and wasted; nothing here is refused.` } }; });
    return [...climbs, ...validatePlan(G.st, G.data, slots).warnings.filter(w => edge < 0 || w.i <= edge).map(w => {
        const text = w.text.replace(/^Phase \d+: /, ''), rule = slots[w.i]?.act === 'fly' ? WARN_RULE.fly : WARN_RULE.mist, fw = slots[w.i]?.act === 'fly' ? flyWarning(text, slots[w.i], G.data, G.st) : null;          // (a steed or a Fly chit that is not there: steeds.js)
        if (fw) return { ...w, copy: { story: `Phase ${w.i + 1}: ${fw.story}`, detail: `Phase ${w.i + 1}: ${fw.detail}` } };
        return { ...w, copy: { story: `Phase ${w.i + 1}: ${text} The phase will be lost when it comes. You can still change it.`, detail: `Phase ${w.i + 1}: ${text} It is recorded, then cancelled when tried (${rule}); nothing here is refused.` } };
    })];
}

const warningLines = G => planWarnings(G).map(w => h('p', { class: 'ds-hint-line warn', 'data-hint': 'plan-warning', 'data-phase': w.i + 1 }, voiced(w.copy)));

// Leave the map (M4): in the Move picker, when the clearing this phase starts in has a roadway to the edge of the map. Two taps: the button asks, the primary of the question does it.
function leaveBox(G, i) {
    const d = G.ui.draft;
    if (!canLeaveAt(G.st, G.data, d.slots, i)) return null;
    if (G.ui.leaveMapAsk !== i) return h('div', { class: 'ds-leave' }, btn('Leave the map', 'sm', { 'data-act': 'leave-map', onclick: () => { G.ui.leaveMapAsk = i; render(G); } }));
    return h('div', { class: 'ds-leave', 'data-leave-confirm': '' },
        h('p', { class: 'ds-hint-line bad' }, voiced({
            story: 'Leave the map? You walk off along the road at the edge, and your game ends there with the score you hold. You cannot come back.',
            detail: 'Leaving the map along a roadway to its edge ends the game for you with your score as it stands (7.3.1a.4, 9.2.2b). Anything planned after this phase is dropped.' })),
        h('div', { class: 'row2' },
            btn('Stay', 'quiet', { 'data-act': 'leave-stay', onclick: () => { G.ui.leaveMapAsk = null; render(G); } }),
            btn('Leave the map', 'danger', { 'data-act': 'leave-confirm', onclick: () => setMove(G, i, EDGE) })));
}

// what must be said besides the chips: where monsters wait, hidden paths, a curse, a mist (kept short, one line each, only when it matters)
function planHints(G, i, at) {
    const d = G.ui.draft, s = d.slots[i], out = [];
    const line = (txt, cls = '', attrs = {}) => h('p', { class: `ds-hint-line ${cls}`.trim(), ...attrs }, txt);
    if (G.ui.planNote) out.push(line(G.ui.planNote, 'bad'));
    out.push(...followNote(G, i));
    out.push(...shareCards(G), ...shareHints(G));          // (note 142: the finds one of the party may tell another now, with the button that tells them, and the ones that must wait)
    out.push(...warningLines(G));
    // Why a chip is dim, said where he looks, not only when he taps it (note 110): the curses that forbid an action, one line
    { const dimmed = (ownSheet(G.st, G.data).curses ?? []).filter(c => CURSE_ACT[c]);
      if (dimmed.length && !G.ui.pickMove) out.push(line(`Dim because of your curses: ${dimmed.map(c => `${ACT_LABEL[CURSE_ACT[c]]} (${c})`).join(', ')}. Tap one to read what it does.`, '', { 'data-hint': 'curse-dim-line' })); }
    // The Flowers of Rest (note 110): what the card will do to him when Daylight begins, said at Birdsong where he plans
    { const lull = lullOf(G.st, G.data);
      if (lull?.will) out.push(line(voiced({ story: `The ${lull.name} will put you to sleep when the day begins: your ${lull.tired} tired chit${lull.tired === 1 ? '' : 's'} wake and you sleep until Sunset. Whatever you plan today is not played.`,
          detail: `${lull.name} (a Daylight card, active): at the start of Daylight it activates your ${lull.tired} fatigued chit${lull.tired === 1 ? '' : 's'} and you fall asleep until Sunset. You skip your turn, and nothing can block you or be called by you. The plan below will not be played.` }), 'warn', { 'data-hint': 'flowers-will' })); }
    if ((ownSheet(G.st, G.data).curses ?? []).includes('Wither')) out.push(line('Wither: chits with an asterisk stay tired. Resting will not bring them back.', '', { 'data-hint': 'wither' }));
    if (s?.act === 'search' && at[i]) out.push(line(searchWhere(G, at[i]), '', { 'data-hint': 'search-where' }));
    if (G.ui.pickMove === i || s?.act === 'move') {
        // where monsters wait: they block you at the end of the phase unless you are hidden, so the ones you could walk into are named
        const monsBy = new Map(); for (const m of tableModel(G.st, G.data).mons) if (!m.dead && !m.hired && m.loc?.c && (G.ui.moveTargets ?? []).includes(m.loc.c)) monsBy.set(m.loc.c, [...(monsBy.get(m.loc.c) ?? []), G.data.monsters[m.id].name]);
        if (G.ui.pickMove === i && monsBy.size) out.push(line(`Red rings have monsters (${[...monsBy].map(([c, n]) => `${nameOfClearing(c)}: ${[...new Set(n)].join(', ')}`).join('; ')}). In plain sight at the end of the phase they block you and your turn is lost. Hiding first keeps you safe.`, 'bad', { 'data-hint': 'monsters-ahead' }));
        const heavy = s?.act === 'move' && s.to && s.to !== EDGE ? wouldDrop(G) : [];
        if (heavy.length) out.push(line(`Too heavy for you now: this Move would leave ${heavy.join(', ')} behind. Put something down or use a stronger Move chit first.`, 'bad', { 'data-hint': 'leave-behind' }));
        if (G.ui.pickMove === i && G.ui.flip) out.push(line(G.ui.moveMaybe?.length ? `Turned over: dotted rings are the clearings you could walk to once the tiles are turned over (an Enchant). Record one only if an earlier phase will enchant this tile: if the roads are not there at its turn, this Move is lost.` : 'Turned over, no road leaves here. Turn the tiles back to see the roads as they are.', '', { 'data-hint': 'flip-moves' }));
        else if (G.ui.pickMove === i && G.ui.moveMaybe?.length) out.push(line(`Dotted: ${G.ui.moveMaybe.map(nameOfClearing).join(', ')} lie along a hidden path you have not found. Your earlier Search may find it; if it has not, this Move is lost.`));
    }
    if (ownSheet(G.st, G.data).leader && G.ui.pickMove !== i) {          // (a seat: what Alert and Rest are for, and what a creature cannot do)
        const L = planActs(questionOf(G.st, G.data)), only = L && [...L.recordOnly].some(a => s?.act === a || !s);
        if (only) out.push(h('p', { class: 'ds-hint-line', 'data-hint': 'leader-plan' }, voiced(PLAN_ONLY_NOTE)));
        if (L?.kind === 'mon' && !s) out.push(h('p', { class: 'ds-hint-line', 'data-hint': 'monster-plan' }, voiced(MONSTER_PLAN_NOTE)));
    }
    if (ownSheet(G.st, G.data).mist) out.push(line('As mist you can only move and hide.', 'bad'));
    else if (ownSheet(G.st, G.data).morph) out.push(line(`In this shape you cannot ${['rest', 'trade', 'hire', 'enchant'].map(a => ACT_LABEL[a]?.toLowerCase() ?? a).join(', ')}.`, 'bad'));
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
    const readyMagic = ownSheet(G.st, G.data).chits.filter(x => x.type === 'magic' && x.state === 'active');
    if (s?.act === 'alert' && readyMagic.length) {
        const chip = (label, on, fn, key) => h('button', { type: 'button', class: `ds-chip${on ? ' on' : ''}`, 'data-alert': key, onclick: fn }, label);
        const card = cardWhy(G);
        const weaponChip = card ? h('button', { type: 'button', class: 'ds-chip is-dim', 'data-alert': 'weapon', 'aria-disabled': 'true', title: card.story, onclick: () => showToast(G, card.story, true) }, 'Weapon')
            : chip('Weapon', !s.magic, () => { delete s.magic; advance(G, i + 1); render(G); }, 'weapon');
        return [card ? h('p', { class: 'ds-hint-line', 'data-hint': 'weapon-card' }, voiced({ story: `${card.story} Wake a Magic chit instead.`, detail: card.detail })) : h('p', { class: 'ds-hint-line' }, 'Ready your weapon (the default), or wake a Magic chit. An alerted chit acts first, and tires at Midnight if unused.'),
            h('div', { class: 'ds-chips' }, weaponChip,
                ...readyMagic.map(c => chip(`Magic ${c.numeral}${c.time}${'*'.repeat(c.effort)}`, s.magic === c.id, () => { s.magic = c.id; advance(G, i + 1); render(G); }, c.id)))];
    }
    if (s?.act === 'fly' || G.ui.pickFly === i) {
        return [h('p', { class: 'ds-hint-line', 'data-hint': 'fly' }, voiced(flyWords(G.st, G.data), { 'data-own-wings': flyFacts(G.st, G.data).sources.some(x => x.morph) ? '1' : null })),
            ...flyChoice(G, i),
            h('div', { class: 'ds-chips' }, ...flyFacts(G.st, G.data).tiles.map(t => h('button', { type: 'button', class: `ds-chip${s?.to === t ? ' on' : ''}`, 'data-fly-tile': t, onclick: () => setFly(G, i, t) }, tileName(t))))];
    }
    if (s?.act === 'follow' && i === 0) return [h('div', { class: 'ds-sub-scroll' }, ...followPicker(mc(G), s, who => { d.slots = Array(9).fill(null); d.slots[0] = { act: 'follow', who }; G.ui.planNote = null; render(G); }, followRows(G)))];
    return null;
}

// The whole plan tray: { body, lead, primary } for tray.js
export function planTray(G) {
    const d = G.ui.draft, info = planInfo(G), { total, kinds, shown } = info, at = planLocations(G);
    if (G.ui.planStep === undefined) G.ui.planStep = 0;
    const step = G.ui.planStep == null ? null : (G.ui.planStep = Math.max(0, Math.min(shown - 1, G.ui.planStep)));
    const open = firstUnset(G), whole = open == null && !info.errors.length;
    const many = shown > 5;
    const tabs = h('div', { class: `ds-tabs${many ? ' many' : ''}`, role: 'tablist' }, ...Array.from({ length: shown }, (_, i) => {
        const s = d.slots[i], locked = roadLocked(G, i) || climbLocked(G, i), spare = info.spare === i, pony = info.ponyAt.includes(i);
        return h('button', { type: 'button', class: `ds-tab ptab${i === step ? ' on' : ''}${s ? ' set' : ''}${locked ? ' locked' : ''}${spare ? ' spare' : ''}${pony ? ' pony' : ''}`, 'data-tab': i, role: 'tab', 'aria-selected': i === step ? 'true' : 'false',
            'aria-label': spare && !s ? `Phase ${i + 1}: an extra Move from your pony, not set` : `Phase ${i + 1}${pony ? ' (the pony\u2019s Move)' : ''}: ${s ? describeSlot(G, s) : 'not set'}`,
            onclick: () => { G.ui.planStep = i; G.ui.pickMove = null; G.ui.pickSearch = null; G.ui.pickFly = null; render(G); } },
            h('span', {}, locked ? icon('lock') : String(i + 1)), h('small', {}, many ? (s ? actIcon(actArt(s.act), 20) : spare ? '+' : '–') : s ? tabWord(s) : spare ? 'Pony' : tabWord(s)));
    }));
    const kids = [tabs];
    let lead, prim;
    const planEnd = edgeIndex(d.slots) >= 0 ? edgeIndex(d.slots) + 1 : total;          // (leaving the map ends the plan: the phases after it are not planned)
    const unsetN = Array.from({ length: Math.min(total, planEnd) }, (_, i) => d.slots[i]).filter(s => !s).length;
    if (step == null) {
        // the plan is whole: one summary line, nothing else to do but start
        const edge = edgeIndex(d.slots), upTo = edge >= 0 ? edge + 1 : total;          // (a plan that leaves the map ends there)
        const names = d.slots.slice(0, Math.min(total, upTo)).map((s, i) => ({ extra: kinds[i] === 'extra', what: s ? (s.to === EDGE ? 'Leave the map' : ACT_LABEL[s.act] ?? s.act) : 'Nothing' }));
        const sum = d.slots[0]?.act === 'follow' ? describeSlot(G, d.slots[0]) : planSentence(names);
        kids.push(h('div', { class: 'ds-plan-ask' }, h('span', { class: 'ds-dim' }, partyPlan(G) ? `${sum}. Tap a phase to change it.` : `${sum}. Ready when you are.`)), ...warningLines(G), followersLine(G));
        lead = h('span', { class: 'ds-lead-text' }, h('b', {}, `${Math.min(total, upTo)} of ${Math.min(total, upTo)}`), ' set');
    } else {
        kids.push(askLine(G, step, step, total));
        const sub = !roadLocked(G, step) && !climbLocked(G, step) && G.ui.pickMove !== step ? subPicker(G, step, at) : null;
        if (roadLocked(G, step)) kids.push(roadLockBox(G, d));
        else if (climbLocked(G, step)) kids.push(h('div', { class: 'ds-lockbox' }, icon('lock'), h('span', {}, `Fixed: the climb to ${nameOfClearing(d.slots[step].to)} takes two Moves.`)));
        else if (G.ui.pickMove === step) { const lb = leaveBox(G, step); if (lb) kids.push(lb); }          // (the map is the chooser; the edge of the map is a choice of its own)
        else if (sub) kids.push(...sub);
        else {
            const over = slots => planKinds(G.st, G.data, slots).kinds.filter(k => k === 'over').length;
            const others = d.slots.map((x, j) => (j === step ? null : x));
            const followDay = d.slots[0]?.act === 'follow';
            if (followDay && step > 0) kids.push(h('p', { class: 'ds-hint-line', 'data-hint': 'follow-day' }, `You follow ${playerNameOf(tableModel(G.st, G.data), d.slots[0].who)} today: there is nothing else to record. Pick another action in phase 1 to plan your own day.`));
            else kids.push(actChips(G, step, at, over, others, over(others)));
        }
        kids.push(...planHints(G, step, at));
        lead = G.ui.pickMove === step ? h('span', { class: 'ds-lead-text' }, h('b', {}, 'Move'), info.spare === step ? ` · ${step + 1}` : ` · ${step + 1} of ${total}`) : h('span', { class: 'ds-lead-text' }, h('b', {}, `${unsetN} phase${unsetN === 1 ? '' : 's'}`), ' to plan');
    }
    // a step that is waiting on nothing but "Next" (a fixed road, a climb's second half) or on the Alert's weapon-or-chit question (Weapon is the default: the question is a choice, not a gate)
    // offers "Next phase" too, so choosing Alert never leaves the player at a dim Start with no way on (QA-7)
    const alertAsk = step != null && d.slots[step]?.act === 'alert' && !cardWhy(G) && G.ui.pickMove !== step && ownSheet(G.st, G.data).chits.some(x => x.type === 'magic' && x.state === 'active');
    prim = startButton(G, step != null && (roadLocked(G, step) || climbLocked(G, step) || alertAsk) && !whole ? open ?? null : false);
    const party = partyPlan(G);
    if (party && !prim.matches('[data-act=plan-next]')) { const wait = stillToPlan(G, party); if (wait) { prim = wait; lead = null; } }          // (the start button is lit only when everybody's plan is legal; until then one quiet line says who is still to plan)
    return { body: h('div', { class: 'ds-plan' }, ...kids), lead, primary: prim };
}

// Is every phase of the plan set (the primary is lit)?
export function planWhole(G) { return !!G.ui.draft && firstUnset(G) == null && !planInfo(G).errors.length; }

// The plan as the engine is to be given it: a phase that no longer exists (a move into a cave takes the sunlight phases away) is dropped, not refused; leaving the map ends the plan; Follow is the whole day.
function finalSlots(slots, total, kinds) {
    const out = slots.map((s, i) => (!s || s.act === 'nothing' || i >= total || kinds[i] === 'over' ? null : s));
    const edge = out.findIndex(s => s?.to === EDGE); if (edge >= 0) for (let k = edge + 1; k < out.length; k++) out[k] = null;
    if (out[0]?.act === 'follow') for (let k = 1; k < out.length; k++) out[k] = null;
    return out;
}

// What a party's chip says of the character on screen right now (partyplan.js keeps it for the ones who are not): is his plan legal, the slots to send, and the phases he has locked in as a short line.
export function planSnapshot(G) {
    const d = G.ui.draft;
    if (!d) return { whole: false, set: 0, total: null, final: null, line: null, sentence: null };
    const info = planInfo(G), { total, kinds } = info, whole = firstUnset(G) == null && !info.errors.length;
    const edge = edgeIndex(d.slots), upTo = Math.min(total, edge >= 0 ? edge + 1 : total);
    const set = d.slots.slice(0, upTo).filter(Boolean).length;
    const names = d.slots.slice(0, upTo).map((s, i) => ({ extra: kinds[i] === 'extra', what: s ? (s.to === EDGE ? 'Leave the map' : ACT_LABEL[s.act] ?? s.act) : 'Nothing' }));
    const line = d.slots[0]?.act === 'follow' && d.slots[0].who ? describeSlot(G, d.slots[0]) : d.slots.slice(0, upTo).map(s => (s ? tabWord(s).replace(/ · /, ' ') : '–')).join(' · ');
    return { whole, set, total: upTo, final: whole ? finalSlots(d.slots, total, kinds) : null, line, sentence: d.slots[0]?.act === 'follow' ? describeSlot(G, d.slots[0]) : planSentence(names) };
}

export function startDay(G) {
    // several characters on one phone: every plan is a draft until all are legal, then they go to the engine together (partyplan.js)
    if (partyPlan(G)) { startParty(G); return; }
    // hired followers: the day does not start before they are given a guide (or told to stay): the sheet of who goes with whom (leaders.js), which comes back here with its answer
    if (needsAssign(G)) { G.ui.sheet = 'assign'; render(G); return; }
    const d = G.ui.draft, { total, kinds } = planInfo(G);
    const slots = finalSlots(d.slots, total, kinds);
    G.ui.draft = null; G.ui.leaveMapAsk = null; G.ui.sheet = null; G.ui.planStep = 0; G.ui.peek = false; G.ui.sel = null; G.ui.pickMove = null; G.ui.pickFly = null; G.ui.planNote = null;
    const assign = takeAssign(G);
    act(G, { type: 'plan', slots, ...(assign ? { assign } : {}) });
}

// The first phase that has nothing attached yet (null when every phase has an action, or 'Nothing' chosen on purpose).
function firstUnset(G) {
    const d = G.ui.draft, { total } = planInfo(G);
    if (d.slots[0]?.act === 'follow') return d.slots[0].who ? null : 0;              // (Follow is the whole day: nothing else to fill, once it names a guide)
    const end = edgeIndex(d.slots);
    for (let i = 0; i < total && (end < 0 || i < end); i++) if (!d.slots[i]) return i;
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
function roadLocked(G, i) { return !!ownSheet(G.st, G.data).onRoad && i === 0; }

// Fly: the tile is chosen on the map (a ring on each tile he may fly over) or by the chip fallback; the day goes on to the next phase.
export function setFly(G, i, t) { G.ui.draft.slots[i] = flySlot(G, i, t); G.ui.pickFly = null; G.ui.planNote = null; advance(G, i + 1); render(G); }

export function newDraft(G) {
    const slots = Array(9).fill(null), to = ownSheet(G.st, G.data).onRoad?.to;
    if (to) {
        slots[0] = { act: 'move', to };
        // a road that ends in a mountain is a climb: the second Move goes in with the first (as setMove does)
        if (isMountain(G.st, G.data, to)) {
            const trial = slots.map((x, j) => (j === 1 ? { act: 'move', to } : x)), k = planKinds(G.st, G.data, trial);
            if (k.total > 1 && ['basic', 'sunlight', 'extra'].includes(k.kinds[1])) slots[1] = { act: 'move', to };
        }
    }
    return { slots };
}

// Choosing which end of the road to go to (8.3.8d.1: "if he moves to a mountain clearing he must use two Move phases to move"). The Move to it is phase 1; a mountain end is a climb of two Moves in a row,
// so phase 2 is the same Move, fixed. The other end's second Move is let go (it used to stay behind as a Move to the end he was no longer going to: note 67, a plan that lost its day).
export function setRoadEnd(G, d, id) {
    const r = ownSheet(G.st, G.data).onRoad, ends = [r?.from, r?.to];
    if (climbLocked(G, 1) || (d.slots[1]?.act === 'move' && ends.includes(d.slots[1].to))) d.slots[1] = null;          // the second half of the climb chosen before
    d.slots[0] = { act: 'move', to: id };
    G.ui.planNote = null; G.ui.pickMove = null;
    if (isMountain(G.st, G.data, id)) {
        const trial = d.slots.map((x, j) => (j === 1 ? { act: 'move', to: id } : x)), k = planKinds(G.st, G.data, trial);
        if (k.total > 1 && ['basic', 'sunlight', 'extra'].includes(k.kinds[1])) {
            if (d.slots[1]) G.ui.planNote = `Phase 2 is now the second Move of the climb to ${nameOfClearing(id)}: what you had there was dropped.`;
            d.slots[1] = { act: 'move', to: id };
        }
    }
    advance(G, 1);
}

// The lock box says what the Move costs before he commits to it: a mountain end takes two Move phases (both fixed), any other end one.
function roadLockBox(G, d) {
    const r = ownSheet(G.st, G.data).onRoad, cur = d.slots[0]?.to, mt = id => isMountain(G.st, G.data, id), climb = !!cur && mt(cur);
    if (r.forest || r.from === r.to) {          // 7.10.4d.2: his road vanished as the tile turned over: he stands in the forest and the only way out is back to the clearing he ran from (one end, not two)
        const id = r.from, hill = mt(id);
        return h('div', { class: 'roadlock', 'data-forest': id },
            h('div', { class: 'ds-lockbox', role: 'note', 'data-roadlock': 'forest' }, icon('lock'), h('span', {}, `Fixed: the road you fled along has vanished and you are in the forest. You must Move back to ${nb(nameOfClearing(id))} first.${hill ? ` ${nb(nameOfClearing(id))} is a mountain: climbing it takes two Move phases in a row, so phases 1 and 2 are both fixed.` : ''}`)),
            h('div', { class: 'row2' }, h('button', { type: 'button', class: 'ds-btn primary', 'data-road-end': id, 'data-phases': hill ? '2' : '1', 'aria-pressed': 'true', onclick: () => { setRoadEnd(G, d, id); render(G); } },
                `Back to ${nb(nameOfClearing(id))} \u00B7 ${hill ? 'mountain, 2 phases' : '1 phase'}`)));
    }
    const first = `Fixed: you fled along the road between ${nb(nameOfClearing(r.from))} and ${nb(nameOfClearing(r.to))}. You must Move to one end of it first.`;
    const second = !cur ? '' : climb ? ` ${nb(nameOfClearing(cur))} is a mountain: climbing it takes two Move phases in a row, so phases 1 and 2 are both fixed.` : ` ${nb(nameOfClearing(cur))} takes one phase.`;
    return h('div', { class: 'roadlock' },
        h('div', { class: 'ds-lockbox', role: 'note', 'data-roadlock': climb ? 'climb' : 'step' }, icon('lock'), h('span', {}, first, second)),
        h('div', { class: 'row2' }, ...[r.from, r.to].map(id => h('button', { type: 'button', class: `ds-btn${cur === id ? ' primary' : ''}`, 'data-road-end': id, 'data-phases': mt(id) ? '2' : '1', 'aria-pressed': cur === id ? 'true' : 'false', onclick: () => { setRoadEnd(G, d, id); render(G); } },
            `${id === r.from ? 'Back to' : 'On to'} ${nb(nameOfClearing(id))} · ${mt(id) ? 'mountain, 2 phases' : '1 phase'}`))));
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
    if (actRefusal(G.st, G.data, a) || (a === 'fly' && flyRefusal(G.st, G.data))) return;
    if (a === 'alert' && !readyMagicOf(G).length && cardWhy(G)) return;
    G.ui.pickMove = null; G.ui.pickSearch = null; G.ui.followNote = null;
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
    if (a === 'alert' && ownSheet(G.st, G.data).chits.some(x => x.type === 'magic' && x.state === 'active')) { G.ui.planStep = i; render(G); return; }      // stay: weapon or Magic chit is asked next
    advance(G, i + 1);
    render(G);
}

// after a phase is set, go on to the next one that still has nothing attached
function advance(G, from) {
    const end = edgeIndex(G.ui.draft.slots), total = end >= 0 ? Math.min(planInfo(G).total, end) : planInfo(G).total;          // (leaving the map ends the plan)
    let n = from;
    while (n < total && G.ui.draft.slots[n]) n++;
    if (n < total) G.ui.planStep = n;
    else { const open = firstUnset(G); G.ui.planStep = open != null ? open : null; }          // the plan is whole: no tab is open, the tray says so
}

export function setMove(G, i, to) {
    const d = G.ui.draft;
    if (to === EDGE) {          // leaving the map: the phases after it are dropped
        for (let k = i + 1; k < d.slots.length; k++) d.slots[k] = null;
        d.slots[i] = { act: 'move', to: EDGE }; G.ui.leaveMapAsk = null; G.ui.pickMove = null; G.ui.planNote = null;
        advance(G, i + 1); render(G); return;
    }
    G.ui.leaveMapAsk = null;
    if (roadLocked(G, i) && to !== ownSheet(G.st, G.data).onRoad.from && to !== ownSheet(G.st, G.data).onRoad.to) return;
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
    G.ui.keepCamUntil = Date.now() + 1000;          // (locking a Move changes the tray's height; the map stays where he looked, it is not pulled back to the hero)
    pruneOver(G, isCave(G.st, G.data, to) ? 'a move into a cave takes away the sunlight phases, so the day is shorter' : null);
    advance(G, i + 1);
    render(G);
}
