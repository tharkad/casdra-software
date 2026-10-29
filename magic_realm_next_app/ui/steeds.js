// steeds.js: the words and small pure helpers the screens share for VISITORS (Trade with the Scholar, Shaman, Warlock or Crone, buying a Spell card) and for STEEDS and denizens that fly
// (riding a Bat or Flying Dragon in a Fly phase, a Fly chit on a hireling). Rules: 7.6.x, 7.12.6 (visitors), 7.3.3g, 4.6.7e.2, 7.3.3d.2, 7.3.3a.4 (flight); engine: app/engine/visitors.js, steeds.js;
// the rulings are in docs/rules-spec/rulings/steeds-visitors.md. Nothing here decides a rule: the engine says what is possible (steedSources, flyChitOf, a spell offer's `learnable` and `why`) and these
// functions only word it, in both voices (Story: plain and short; Detail: the rule). The screens: screens/kit/visitors.js (Trade), screens/play/steedplan.js (the Fly plan),
// screens/play/steeds.js (the tray in the air), the Broomstick's target chooser (broomstickAim, called from combat/sheets.js aimEl).
import { isVisitorName } from '../engine/visitors.js';
import { flyChitOf, steedSources } from '../engine/steeds.js';
import { flySources, carries } from '../engine/magic/fly.js';
import { h } from './dom.js';
import { actIcon } from './icons.js';
import { chitEl } from './missions.js';

export { isVisitorName };
export const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
export const nameOfDenizen = (data, id) => data.monsters?.[id]?.name ?? data.natives?.[id]?.name ?? String(id);
export const steedName = (data, withKey) => (String(withKey).startsWith('steed:') ? nameOfDenizen(data, String(withKey).slice(6)) : null);

// ---- visitors ----
// A visitor's chit as a small counter (the faces are scholar, shaman, warlock and crone: missions.js chitEl).
export const visitorChit = (data, name, cls = 'sm') => chitEl(data, name.toLowerCase(), { cls });

// Why a Spell card cannot be learned, in both voices (the engine's `why` is the Detail words with the rule).
export function learnWhy(why) {
    const detail = `${cap(String(why ?? '').trim()).replace(/\.$/, '')}.`;
    let m;
    if ((m = /Type (\w+) Magic chit/.exec(why ?? ''))) return { story: `You hold no Type ${m[1]} Magic chit, so you could not learn it.`, detail };
    if (/already learned that spell/.test(why ?? '')) return { story: 'You have learned that one from a card already.', detail };
    return { story: detail.replace(/\s*\(\d[\d.a-z]*\)\.?$/, '.'), detail };
}

// ---- steeds, in the air ----
// The steed he is riding now: { id, name, monster } or null.
export function steedAloft(st, data) {
    const id = st.ch?.flying?.steed;
    return id ? { id, name: nameOfDenizen(data, id), monster: !!data.monsters?.[id] } : null;
}

// What a Fly phase could fly on at the start of the plan: { rides: [{ id, name, strength }], chits: [source], own } (the engine's own lists).
export function flightSources(st, data) {
    const rides = steedSources(st, data).map(r => ({ id: r.id, name: r.name, strength: r.strength }));
    const all = flySources(st, data), own = all.some(x => x.morph);
    return { rides, chits: all.filter(x => !x.morph && carries(st, x)), own };
}

// The Fly phase `i` of a draft follows another Fly phase straight away: he is already in the air, so nothing new is needed to fly.
export function airborneAt(slots, i) {
    const prior = slots.slice(0, i).filter(x => x && x.act !== 'nothing');
    return prior.at(-1)?.act === 'fly';
}

// The wording of a Fly phase's warning (validatePlan: the phase is recorded and cancelled when it comes), or null when the general wording will do.
// `text` is the engine's sentence without its "Phase N: ", `slot` the phase.
export function flyWarning(text, slot, data) {
    const ride = steedName(data, slot?.with), t = String(text ?? '');
    const lost = ' The phase will be lost when it comes. You can still change it.';
    if (/not a flying steed that follows you/.test(t)) return { story: `${ride ? `The ${ride} is` : 'That steed is'} not a flier who follows you and can carry you.${lost}`, detail: `${cap(t)} It is recorded, then cancelled when tried (7.3.3a.1, 7.3.3g, 4.6.9c); nothing here is refused.` };
    if (/nothing to fly with/.test(t)) return { story: `You have nothing to fly with: no Fly chit and no steed that follows you.${lost}`, detail: `${cap(t)} It is recorded, then cancelled when tried (7.3.3a.1, 7.3.3a.2, 4.6.9c); nothing here is refused.` };
    if (/too heavy to fly with/.test(t)) return { story: `Your Fly chit is too light to carry you, and no steed follows you.${lost}`, detail: `${cap(t)} It is recorded, then cancelled when tried (7.3.3a.1, 7.3.3a.2, 4.6.9c); nothing here is refused.` };
    if (/no Fly chit left/.test(t)) return { story: `You have no Fly chit left for another flight. A steed would not run out.${lost}`, detail: `${cap(t)} Each flight on a Fly chit spends one; a steed is not used up (4.6.7e.1, 7.3.3g). It is recorded, then cancelled when tried (7.3.3a.1, 4.6.9c); nothing here is refused.` };
    return null;
}

// ---- a Fly chit on a hireling ----
// Does this hired counter hold a Fly chit (a held Broomstick on a hireling), and is it in use (its guide is in the air)? -> { inUse } or null
export function flyChitState(st, kind, id) {
    const fx = flyChitOf(st, { kind: kind === 'nat' ? 'nat' : 'mon', id });
    return fx ? { inUse: !!fx.data?.flying } : null;
}
// The small round badge on a counter: the Fly art, a word for the screen readers. (Never the only sign: the card says it in words too.)
export function flyBadge(st, kind, id, name) {
    const s = flyChitState(st, kind, id);
    if (!s) return null;
    const word = s.inUse ? `${name} is flying with you on its Fly chit` : `${name} holds a Fly chit`;
    return h('span', { class: `st-badge${s.inUse ? ' use' : ''}`, 'data-fly-badge': String(id), 'data-fly-state': s.inUse ? 'use' : 'held', role: 'img', 'aria-label': word, title: word }, actIcon('fly', 24));
}
// The words under a group of hirelings that hold a Fly chit: { story, detail } or null.
export function flyChitWords(st, data, members, kind) {
    const held = members.map(o => ({ o, s: flyChitState(st, kind, o.id) })).filter(x => x.s);
    if (!held.length) return null;
    const names = held.map(x => nameOfDenizen(data, x.o.id)), many = held.length > 1, who = many ? 'They hold' : `${names[0]} holds`;
    const use = held.some(x => x.s.inUse);
    return {
        story: use ? `${many ? 'They are' : `${names[0]} is`} in the air with you on a Fly chit. ${many ? 'It is' : 'It is'} spent when you land.` : `${who} a Fly chit. ${many ? 'They' : 'He'} can follow you in flight. It is spent when you land.`,
        detail: use ? `Broomstick: the Fly chit is in use while its guide is in the air; it expires the instant the guide lands (4.6.7e.1, 7.3.3d.2).` : `Broomstick on a denizen (4.6.7e.2, 7.3.3d.2): it uses the Fly chit in place of its own move values, so it can follow a flying guide (7.3.3a.4). Unused, the chit stays; it expires when the guide lands.`,
    };
}

// ---- the Broomstick's target (a spell the caster may put on himself or on a Light hireling) ----
// "Bashkar Raider 1" -> "Raider 1": three words or more lose the group's name, so three chips fit on a row of a phone.
const shortName = n => { const w = String(n).split(' '); return w.length >= 3 ? w.slice(1).join('\u00A0') : String(n); };
// The words for each option of the chooser: who, and what he does with the chit. `o` is an engine aim option { ref, label }.
export function broomstickOption(o, data) {
    if (o.ref.kind === 'char') return { title: 'Yourself', short: 'Yourself', story: 'The Fly chit is yours: use it in a Fly phase, or in a fight to fly away.', detail: 'He plays the Fly chit directly, without a Move chit, in a Fly phase or in the Encounter step to fly away (Broomstick, 8.3.8e). It is spent when used.' };
    const name = nameOfDenizen(data, o.ref.id);
    return { title: `${name} (yours)`, short: shortName(String(o.label ?? name).replace(/ \(yours\)$/, '')), story: `${name} holds the chit and uses it in place of his own moves, to follow you when you fly. It is spent when you land.`,
        detail: `A denizen can use the Fly chit in place of his own move values (4.6.7e.2, 7.3.3d.2), so he can follow a flying guide (7.3.3a.4); the chit expires when the guide lands (4.6.7e.1). The spellcaster controls when it is used.` };
}

export { steedSources };
