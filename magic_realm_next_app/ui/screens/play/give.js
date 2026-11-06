// play/give.js: "Give to <Name>" (note 143, Mike 2026-11-06): a party on one phone hands a belonging from one of its characters to another who stands in the same clearing. The belonging's card (the Kit)
// carries one button; one tap sends the engine's offer and the other character's answer together (actMany, as "Share what you know" does: one person plays both, so nobody has to accept), and a line says it is done.
// WHEN is the engine's word (`view.me.meet.gifts[].now`: the start of a phase of the day, 7.2.1, or the trade window after the fights, 4.5.5h); WHICH belongings is the engine's too (`give.items`: not the one that
// causes a recorded extra phase, 6.2.4d, nor a used-up potion, 4.4.3c). When it cannot be done now a quiet line says when it can, so the player learns the time. Nothing here knows a rule.
import { nameOf } from '../../../engine/catalogue.js';
import { voiced } from '../../commit.js';
import { h } from '../../dom.js';
import { btn } from '../../ds.js';
import { icon } from '../../icons.js';
import { displayName } from '../../names.js';
import { seatOf, viewOf } from '../../combat/feed.js';
import { actMany } from './actions.js';
import { isHotSeat } from './hotseat.js';
import { showToast } from './kit.js';
import { render } from './shell.js';

/** What the character on screen may hand to the others of his player, from the engine: { gifts: [{ id, name, now, code, why, heavy: [uid], hidden }], held: { uid: sentence } }, or null when there is no one to give to
 * (a table with other people, a race, one character, or the others stand elsewhere or on a road). */
export function giveFacts(G) {
    if (G.shared || G.race || !G.st || !isHotSeat(G)) return null;
    const meet = viewOf(G.st, G.data).me?.meet;
    if (!meet?.gifts?.length) return null;
    return { gifts: meet.gifts.map(g => ({ ...g, name: displayName(g.name) })), held: Object.fromEntries((meet.give?.held ?? []).map(x => [x.uid, x.why])), from: seatOf(G.st, G.data) };
}

// When it can be done, said by the engine's code: the start of a phase of the day (a fight, the evening before the fights are done are not the time; with the house rule on, Birdsong and Midnight are too); the rest is the engine's own sentence.
const WHEN = {
    time: n => ({ story: `You can hand things to ${n} at the start of a phase of the day.`, detail: `Characters trade at the start of a phase of someone’s turn, or after the evening’s fights (7.2.1, 4.5.5h).` }),
    group: (n, g) => ({ story: 'Belongings change hands with the one whose turn it is, at the start of one of his phases.', detail: g.why }),
};
const whenText = (g) => voiced((WHEN[g.code] ?? ((n, x) => ({ story: `${n} cannot take it now.`, detail: x.why ?? '' })))(g.name, g));

/** Give `it` (a belonging of the character on screen) to `to`: the offer and the answer together; then a line says it is done (and, if the other could not carry it on a Move, that it will be put down). */
export function giveItem(G, it, to, { done } = {}) {
    const f = giveFacts(G), g = f?.gifts.find(x => x.id === to);
    if (!g) return false;
    const name = nameOf(G.data, it), heavy = g.heavy.includes(it.uid);
    const actions = [{ type: 'meet', kind: 'offer', who: f.from, to, give: { items: [it.uid], gold: 0, discoveries: [] }, want: { items: [], gold: 0 } }, { type: 'meet', kind: 'answer', who: to, accept: true }];
    return actMany(G, actions, { ok: () => {
        G.ui.giveAsk = null; done?.();
        showToast(G, `The ${name} is ${g.name}’s now.${heavy ? ` It is too heavy for ${g.name} to carry on a Move: unless a pack horse bears it, it will be put down when ${g.name} moves.` : ''}`);
    } });
}

/** The give block of a belonging's card, or null when there is nobody to give to: the button (or, with several to choose from, the short choice), and when it cannot be done now, one quiet line that says when it can.
 * `done` runs after the gift (the card closes: the belonging is no longer his). `compact` is the one line only (the list of new belongings). */
export function giveBlock(G, it, { done, compact = false, held = true } = {}) {
    const f = giveFacts(G);
    if (!f || it.destroyed) return null;
    const why = f.held[it.uid];
    if (why) return held ? h('p', { class: 'ds-meta give-line', 'data-give': 'held' }, icon('lock', 'kit-lockico'), why) : null;          // (the engine's own sentence: 4.4.3c; the card says 6.2.4d itself)
    const now = f.gifts.filter(g => g.now), later = f.gifts.filter(g => !g.now);
    const line = later.length ? h('p', { class: 'ds-meta give-line', 'data-give': 'later', 'data-give-code': later[0].code }, icon('people'), later.length > 1 && now.length ? `Not now, for ${later.map(g => g.name).join(' and ')}: ` : '', whenText(later[0])) : null;
    if (compact || !now.length) return line;
    const heavyNote = g => (g.heavy.includes(it.uid) ? h('p', { class: 'ds-meta give-heavy', 'data-give': 'heavy' }, `Too heavy for ${g.name} to carry on a Move.`) : null);
    if (now.length === 1) {
        const g = now[0];
        return h('div', { class: 'give-block', 'data-give': 'now' }, btn([icon('people'), `Give to ${g.name}`], 'sm give-btn', { 'data-act': 'item-give', 'data-give-to': g.id, onclick: () => giveItem(G, it, g.id, { done }) }), heavyNote(g), line);
    }
    if (G.ui.giveAsk !== it.uid) return h('div', { class: 'give-block', 'data-give': 'now' }, btn([icon('people'), 'Give to…'], 'sm give-btn', { 'data-act': 'item-give-ask', onclick: () => { G.ui.giveAsk = it.uid; render(G); } }), line);
    return h('div', { class: 'give-block ask', 'data-give': 'ask' }, h('span', { class: 'ds-meta' }, `Give the ${nameOf(G.data, it)} to:`),
        h('div', { class: 'give-choices' }, ...now.map(g => btn(g.name, 'sm give-btn', { 'data-act': 'item-give', 'data-give-to': g.id, onclick: () => giveItem(G, it, g.id, { done }) })), btn('Keep it', 'sm quiet', { 'data-act': 'item-give-no', onclick: () => { G.ui.giveAsk = null; render(G); } })),
        now.map(heavyNote), line);
}
