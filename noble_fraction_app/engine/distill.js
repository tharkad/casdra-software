import { handle, provide } from './registry.js';
import { DISTILL_PRIORITY } from '../data/cards.js';
import { activePlayer, logEvent } from './helpers.js';
import { completeIfAble } from './contracts.js';
import { enterOvertimeBid } from './buybid.js';

const isElement = (c, el) => c.defId === el;

// Removes every card of the highest-priority element in hand (N, then O, then Kr). Xe is never
// removed, upgrades are not elements (rulebook p.5).
export function removeTopElement(s, p) {
    const el = DISTILL_PRIORITY.find(e => p.hand.some(c => isElement(c, e)));
    if (!el) return { element: null, count: 0 };
    return { element: el, count: removeAllOf(s, p, el) };
}

export function removeAllOf(s, p, el) {
    const before = p.hand.length;
    p.hand = p.hand.filter(c => !isElement(c, el));
    const count = before - p.hand.length;
    s.turn.f.removed[el] += count;
    return count;
}

// If nothing but Xe is left in hand, all of it goes to cold storage (A6).
function isolateXenon(s, p) {
    const hasOther = p.hand.some(c => DISTILL_PRIORITY.includes(c.defId));
    const xe = p.hand.filter(c => c.defId === 'Xe');
    if (hasOther || xe.length === 0) return 0;
    p.hand = p.hand.filter(c => c.defId !== 'Xe');
    p.storedXe += xe.length;
    logEvent(s, { type: 'isolated', pid: p.id, xe: xe.length });
    return xe.length;
}

provide(s => {
    if (s.turn.phase !== 'distill') return [];
    const f = s.turn.f;
    const acts = [];
    if (f.distillsLeft > 0) acts.push({ type: 'distill' });
    if (f.distillsLeft === 0 && !f.settled) acts.push({ type: 'endDistill' });
    return acts;
});

handle('distill', s => {
    const p = activePlayer(s);
    const { element, count } = removeTopElement(s, p);
    s.turn.f.distillsLeft -= 1;
    logEvent(s, { type: 'distill', element, count });
});

// DISTILL-phase abilities that pay out per element removed (Heat Exchanger, Cryo Chiller
// Refrigeration) register a settle hook; it runs once, when the player ends the phase (A5).
export const settleHooks = [];

export function finishDistillPhase(s) {
    const p = activePlayer(s);
    isolateXenon(s, p);
    completeIfAble(s, p);
    if (s.turn.overtime) enterOvertimeBid(s);
    else s.turn.phase = 'airwipe';
}

handle('endDistill', s => {
    const p = activePlayer(s);
    settleHooks.forEach(hook => hook(s, p));
    s.turn.f.settled = true;
    if (s.turn.f.freeBids === 0) finishDistillPhase(s);
});
