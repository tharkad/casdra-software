// What the screens say about the spell rules the engine settled from the text (2026-10-25), in both voices (Story: plain and short; Detail: the rule). Nothing here decides a rule:
// the engine's own options (encounterOptions, heldOptions, flySources) say what is possible, and these functions only word it.
//
//   heldLockOf(st, data)         { names, sub, story, detail } when he holds a Phase spell (Protection from Magic) he cannot use now (on a road, in the air, a creature, mist), else null
//   mistWords(st)                { story, detail } for a mist hero's Encounter step: he runs with a Move chit or lets the round pass
//   energizeWords(st, data, o)   { color, story, detail, tile } for one `encounterOptions().energize` entry
//   gearPairWhy(kind)            { story, detail } for a second activation (kind 'on') or a second deactivation (kind 'off') in one Encounter action (8.3.7d)
//   flyWords(st, data)           { story, detail, own } for the Fly pick: the Fly chit he plays, or a flying creature's own wings (7.3.3e)
//   flyRefusal(st, data)         { story, detail } when a transformed hero who is not a flier holds a Fly chit he cannot play (4.6.7e.3, 7.3.3d.3), else null
//   voicedWhy(copy)              the copy as one string in the voice that is on now (for a toast)
import { rearrangeLockWhy, heldOptions } from '../engine/magic/phase.js';
import { elsewhere } from '../engine/magic/fx.js';
import { TYPE_COLOR } from '../engine/magic/colour.js';
import { flySources } from '../engine/magic/fly.js';
import { isStory } from './voice.js';

export const voicedWhy = copy => (isStory() ? copy.story : copy.detail);

const nameOfSpell = (data, id) => data.spells?.[id]?.name ?? id;
const join = names => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);

// ---- 4.6.7f.2, 7.2.3a.2: a held Phase spell is "activated like an item", which is rearranging belongings ----
export function heldLockOf(st, data) {
    const held = (st.fx ?? []).filter(f => f.dur === 'phase' && f.state === 'held' && !elsewhere(st, f));
    if (!held.length || heldOptions(st, data).length) return null;
    const names = [...new Set(held.map(f => nameOfSpell(data, f.spell)))], nm = join(names);
    const lock = rearrangeLockWhy(st);
    const cause = st.ch.onRoad ? { sub: 'on the road', story: 'you are out on the road', detail: 'you are out on the road between clearings (8.3.8d)' }
        : st.ch.flying ? { sub: 'in the air', story: 'you are in the air', detail: 'you are in the air (7.2.2d)' }
        : st.ch.morph ? { sub: 'a creature', story: 'you are a creature', detail: 'you are a creature, and your belongings are frozen (4.6.9b.2)' }
        : st.ch.mist ? { sub: 'as mist', story: 'you are mist', detail: 'you are mist, and take no part (8.4.5p.1)' } : { sub: 'cannot now', story: lock ?? 'you cannot use it', detail: lock ?? 'you cannot use it' };
    return {
        names, sub: cause.sub,
        story: `You hold ${nm}, but ${cause.story}: you cannot use it now.`,
        detail: `You hold ${nm}, but ${cause.detail}. Using it counts as rearranging your belongings, which you cannot do now (4.6.7f.2, 7.2.3a.2).`,
    };
}

// ---- 8.4.5p.1: a mist hero stays in the fight but takes no part ----
export const mistWords = () => ({
    story: 'You are mist. You take no part in the fight: all you can do is run with a Move chit, or let the round pass.',
    detail: 'As mist you take no attack or maneuver, and you stay in the combat round after round. In each Encounter step you may only run away with a Move chit (no time or weight limit) or pass (8.4.5p.1).',
});

// ---- 8.3.9, 8.3.9a, 8.3.9a.2: color chits wake Permanent spells in the Encounter step, and it is not his action ----
export function energizeWords(st, data, o) {
    const chits = o.chits.map(id => st.ch.chits.find(c => c.id === id)).filter(Boolean);
    const colors = [...new Set(chits.map(c => TYPE_COLOR[c.numeral]).filter(Boolean))], color = colors.length === 1 ? colors[0] : null;
    const chit = color ? `${color} chit` : 'colour chit';
    return {
        color, tile: chits.length > 1 ? `${chits.length} chits` : color ? `${color} chit` : 'a chit',
        story: `Burn a ${chit} to wake ${o.name}. It does not use your action.`,
        detail: `Burn a ${chit} to energize ${o.name} (8.3.9a). It is not an action, so you may still act this Encounter step (8.3.9a.2).`,
    };
}

// ---- 8.3.7d: in one action he may activate one belonging and deactivate one belonging ----
export const gearPairWhy = kind => (kind === 'on'
    ? { story: 'One action switches on one thing. Switch another off, or do the first and then the second next round.', detail: 'In one action he may activate one belonging and deactivate another, but not activate two (8.3.7d).' }
    : { story: 'One action switches off one thing. Switch another on, or do the first and then the second next round.', detail: 'In one action he may deactivate one belonging and activate another, but not deactivate two (8.3.7d).' });

// ---- 7.3.3e, 4.6.7e.3, 7.3.3d.3: what a Fly activity uses ----
export function flyWords(st, data) {
    const own = flySources(st, data).find(x => x.morph);
    if (own) {
        const name = st.ch.morph?.creature?.name ?? 'creature';
        return { own: true, name,
            story: `You fly on your own wings as the ${name}: no Fly chit is used, and you carry yourself. Tap a ringed tile on the map. You come down in one of its clearings, and nothing can block you aloft.`,
            detail: `Transformed into a flying ${name}, you fly with its own flying values: a Fly activity needs no Fly chit and no weight check, it carries itself (7.3.3e). Tap a ringed tile on the map: you land in a clearing of it (7.3.3b), and nothing can block you aloft.` };
    }
    return { own: false,
        story: 'Take to the air: tap a ringed tile on the map. You come down in one of its clearings, and nothing can block you aloft.',
        detail: 'Take to the air on a Fly chit: tap a ringed tile on the map. You land in one of its clearings (7.3.3b), and nothing can block you aloft.' };
}

// a Fly chit (the Broomstick) held by a hero who has been transformed into something that cannot fly: it cannot be played (4.6.7e.3: his action chits are frozen)
export function flyRefusal(st, data) {
    if (!st.ch.morph || st.ch.mist || flySources(st, data).length) return null;
    const holds = (st.fx ?? []).some(f => f.spell === 'broomstick' && (f.state === 'held' || f.state === 'live') && !elsewhere(st, f));
    if (!holds) return null;
    const name = st.ch.morph.creature?.name ?? 'creature';
    return {
        story: `You are a ${name}, and it has no wings: you cannot play your Fly chit.`,
        detail: `Transformed into a ${name}, which does not fly, you cannot play a Fly chit: your action chits are frozen (4.6.7e.3, 7.3.3d.3).`,
    };
}
