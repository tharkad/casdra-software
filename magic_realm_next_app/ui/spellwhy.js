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
import { TYPE_COLOR } from '../engine/catalogue.js';
import { magicOf, ownSheet } from './combat/feed.js';
import { isStory } from './voice.js';

export const voicedWhy = copy => (isStory() ? copy.story : copy.detail);

const nameOfSpell = (data, id) => data.spells?.[id]?.name ?? id;
const join = names => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);

// ---- 4.6.7f.2, 7.2.3a.2: a held Phase spell is "activated like an item", which is rearranging belongings ----
export function heldLockOf(st, data) {
    const k = magicOf(st, data).heldLock;
    if (!k) return null;
    const names = k.spells.map(id => nameOfSpell(data, id)), nm = join(names), lock = k.why;
    const cause = k.cause === 'road' ? { sub: 'on the road', story: 'you are out on the road', detail: 'you are out on the road between clearings (8.3.8d)' }
        : k.cause === 'air' ? { sub: 'in the air', story: 'you are in the air', detail: 'you are in the air (7.2.2d)' }
        : k.cause === 'creature' ? { sub: 'a creature', story: 'you are a creature', detail: 'you are a creature, and your belongings are frozen (4.6.9b.2)' }
        : k.cause === 'mist' ? { sub: 'as mist', story: 'you are mist', detail: 'you are mist, and take no part (8.4.5p.1)' } : { sub: 'cannot now', story: lock ?? 'you cannot use it', detail: lock ?? 'you cannot use it' };
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
    const mine = ownSheet(st, data).chits, chits = o.chits.map(id => mine.find(c => c.id === id)).filter(Boolean);
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
    ? { story: 'One action switches on one thing. Switch another off, or do the first and then the second next round.', detail: 'In one action a character may activate one belonging and deactivate another, but not activate two (8.3.7d).' }
    : { story: 'One action switches off one thing. Switch another on, or do the first and then the second next round.', detail: 'In one action a character may deactivate one belonging and activate another, but not deactivate two (8.3.7d).' });

// ---- 7.3.3e, 4.6.7e.3, 7.3.3d.3: what a Fly activity uses ----
export function flyWords(st, data) {
    const sources = magicOf(st, data).fly.sources, own = sources.find(x => x.morph);
    if (own) {
        const name = ownSheet(st, data).morph?.creature?.name ?? 'creature';
        return { own: true, name,
            story: `You fly on your own wings as the ${name}: no Fly chit is used, and you carry yourself. Tap a ringed tile on the map. You come down in one of its clearings, and nothing can block you aloft.`,
            detail: `Transformed into a flying ${name}, you fly with its own flying values: a Fly activity needs no Fly chit and no weight check, it carries itself (7.3.3e). Tap a ringed tile on the map: you land in a clearing of it (7.3.3b), and nothing can block you aloft.` };
    }
    if (sources.some(x => x.carpet)) return { own: false, carpet: true,
        story: 'The Flying Carpet is awake: Purple magic fills the clearing. It carries you and anything up to Medium weight, and stays awake until Midnight. Tap a ringed tile on the map.',
        detail: 'Flying Carpet (Fly M2) is energized by Purple magic (7.3.3h): it carries you and belongings up to Medium weight, is not used up, and stays energized until Midnight (7.3.3a.2). Tap a ringed tile on the map: you land in one of its clearings (7.3.3b).' };
    return { own: false,
        story: 'Take to the air: tap a ringed tile on the map. You come down in one of its clearings, and nothing can block you aloft.',
        detail: 'Take to the air on a Fly chit: tap a ringed tile on the map. You land in one of its clearings (7.3.3b), and nothing can block you aloft.' };
}

// a Fly chit (the Broomstick) held by a hero who has been transformed into something that cannot fly: it cannot be played (4.6.7e.3: his action chits are frozen)
export function flyRefusal(st, data) {
    const me = ownSheet(st, data), fly = magicOf(st, data).fly;
    if (!me.morph || me.mist || fly.sources.length) return null;
    if (!fly.holdsBroomstick) return null;
    const name = me.morph.creature?.name ?? 'creature';
    return {
        story: `You are a ${name}, and it has no wings: you cannot play your Fly chit.`,
        detail: `Transformed into a ${name}, which does not fly, you cannot play a Fly chit: your action chits are frozen (4.6.7e.3, 7.3.3d.3).`,
    };
}
