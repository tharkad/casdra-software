// play/steedplan.js: what a Fly phase of the plan flies ON. With a Fly chit (the Broomstick) AND a flying steed that follows him (a hired or controlled Bat or Flying Dragon: 7.3.3g) he may
// choose which one carries him in this flight (7.3.3a.2); the engine's default is the steed, which is not used up (4.6.7e.1). The choice is recorded in the phase as `with`: 'chit' or 'steed:<monster id>'
// (app/engine/steeds.js chooseSource). With only one of them there is nothing to choose and no `with` is written; a Fly phase that goes straight on from another needs neither.
// The tile is still chosen on the map (plan.js subPicker); the plan's warnings (validatePlan) are worded in plan.js with steeds.js flyWarning.
import { voiced } from '../../commit.js';
import { h } from '../../dom.js';
import { actIcon } from '../../icons.js';
import { airborneAt, flightSources } from '../../steeds.js';
import { render } from './shell.js';

// The options now: [{ key, title, line }], or [] when there is no choice to make.
export function flyOptions(G) {
    const { rides, chits } = flightSources(G.st, G.data);
    const out = [...rides.map(r => ({ key: r.id, title: `Ride the ${r.name}`, line: 'A steed is not used up: you may fly again and again.', ride: true })),
        ...(chits.length ? [{ key: 'chit', title: 'Use a Fly chit', line: `Spends your Broomstick chit${chits.length > 1 ? 's' : ''}: it is used up.`, ride: false }] : [])];
    return out.length > 1 ? out : [];
}

// What this phase uses: the draft's choice when it is still on offer, else the engine's own default (the steed first).
export function flyWithNow(G, i) {
    const opts = flyOptions(G), want = G.ui.flyWith?.[i] ?? G.ui.draft.slots[i]?.with ?? null;
    return opts.find(o => o.key === want)?.key ?? opts[0]?.key ?? null;
}

// The chooser for phase `i`: one tappable card per way to fly, the one in use lit. Returns the nodes to show (empty when nothing is asked).
export function flyChoice(G, i) {
    const slots = G.ui.draft.slots;
    if (G.st.ch.flying || airborneAt(slots, i)) {
        return airborneAt(slots, i) ? [h('p', { class: 'ds-hint-line', 'data-hint': 'fly-airborne' }, voiced({ story: 'You are already in the air from the phase before: this flight needs no chit and no steed.', detail: 'A Fly phase that follows another needs no Fly chit of its own: he is already in the air (7.3.3a).' }))] : [];
    }
    const opts = flyOptions(G);
    if (!opts.length) return [];
    const on = flyWithNow(G, i);
    return [h('div', { class: 'st-with', 'data-fly-with': on, role: 'radiogroup', 'aria-label': 'What carries you' },
        h('p', { class: 'ds-hint-line' }, voiced({ story: 'You have a steed and a Fly chit. Which carries you?', detail: 'With a Fly chit and a flying steed you choose what carries you (7.3.3a.2); the steed is not used up, the chit is (4.6.7e.1).' })),
        h('div', { class: 'st-opts' }, opts.map(o => h('button', { type: 'button', class: `ds-btn st-opt${o.key === on ? ' on' : ''}`, role: 'radio', 'aria-checked': o.key === on ? 'true' : 'false', 'data-fly-with-opt': o.key,
            onclick: () => { (G.ui.flyWith ??= {})[i] = o.key; const s = slots[i]; if (s?.act === 'fly') { s.with = o.key; } render(G); } },
            actIcon('fly', 24), h('span', { class: 'st-opt-t' }, h('b', {}, o.title), h('small', {}, o.line))))))];
}

// The phase as the plan records it: `with` only when there was a choice (so a plan without one is exactly what it always was).
export const flySlot = (G, i, to) => { const w = flyOptions(G).length && !airborneAt(G.ui.draft.slots, i) ? flyWithNow(G, i) : null; return { act: 'fly', to, ...(w ? { with: w } : {}) }; };
