import { isCave, roadsFrom } from '../world.js';
import { extraActs } from '../modifiers.js';
import { fxTags, HERO } from './fx.js';

// Prophecy's choose-as-you-go turn (handlers/prophecy.js; docs/design/magic/02-day-spells.md section 3). Under a live Prophecy the hero does not record a plan
// at Birdsong; each phase he chooses what to do as it comes. He gets the same number of phases and kinds of activity as a recorded turn would give. The engine state is
// st.turn.pro = { regular, extras, startedInCave, cave, blazing }: how many ordinary phases he has used, which restricted extra phases, whether he started the day in a cave, and
// whether he has been in a cave today (which is when the Sunlight phases are lost: the rule is applied lazily, as he goes).
const BASIC = 2, SUNLIGHT = 2;                                  // PHASES in day.js (the numbers are the rules'; kept here so this file need not import day.js)
export const prophecyOn = st => fxTags(st, HERO, 'prophecy').length > 0;
// the activities of the plan sheet, in the order the UI shows them
export const PRO_ACTS = ['move', 'hide', 'search', 'trade', 'hire', 'rest', 'alert', 'enchant'];

// At Sunrise (day.js): the turn's choose-as-you-go state.
export function startPro(st, data) {
    const startedInCave = !st.ch.onRoad && !!st.ch.at && isCave(st, data, st.ch.at);
    const blazing = startedInCave && !!st.ch.at && fxTags(st, { kind: 'clearing', id: st.ch.at }, 'extraPhase').length > 0;
    return { regular: 0, extras: [], startedInCave, cave: startedInCave, blazing };
}

// What the next phase may be: { i, acts: [{ act, kind }], moves, tables, regularLeft, extrasLeft }. `kind` says which phase the choice would use: 'basic', 'sunlight',
// 'blazing' (Blazing Light's extra phase, only while he is still in that clearing) or 'extra' (a belonging's restricted phase, used first when the activity matches).
export function phaseOptions(st, data) {
    const t = st.turn, pro = t?.pro;
    if (!pro) return null;
    const sunlight = !pro.startedInCave && !pro.cave;
    const base = BASIC + (sunlight ? SUNLIGHT : 0) + (pro.blazing ? 1 : 0);
    const left = [...extraActs(st, data, { startsInCave: pro.startedInCave, intoCave: pro.cave })];
    for (const a of pro.extras) { const k = left.indexOf(a); if (k >= 0) left.splice(k, 1); }
    const regularLeft = Math.max(0, base - pro.regular), r1 = pro.regular + 1;
    const regularKind = r1 <= BASIC ? 'basic' : pro.blazing && r1 === base ? 'blazing' : 'sunlight';
    const acts = [];
    for (const act of [...PRO_ACTS, ...left.filter(a => !PRO_ACTS.includes(a))]) {
        if (left.includes(act)) acts.push({ act, kind: 'extra' });
        else if (regularLeft > 0 && PRO_ACTS.includes(act)) acts.push({ act, kind: regularKind });
    }
    const roads = st.ch.onRoad ? [st.ch.onRoad.from, st.ch.onRoad.to] : roadsFrom(st, data, st.ch.at).filter(r => r.usable).map(r => r.to);
    return { i: t.i, acts, moves: roads, regularLeft, extrasLeft: left };
}

// He has chosen: use up the phase it takes.
export function consume(pro, choice) {
    if (choice.kind === 'extra') pro.extras.push(choice.act); else pro.regular++;
}
// After every phase: has he been in a cave today?
export function noteCave(st, data) {
    const pro = st.turn?.pro;
    if (pro && !st.ch.onRoad && st.ch.at && isCave(st, data, st.ch.at)) pro.cave = true;
}
