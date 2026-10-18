// combat/shared.js (P6): what the combat scene needs when the fight is SHARED (several characters in one clearing, screens/sharedfight.js passes `shared` = { fight, ... } to combatScene).
// Only the creatures on MY sheet stand on my stage, so the Strike step cannot name the others' creatures, the characters or the other players' hirelings by tapping a foe: the extra step "Whom"
// lists every legal target (the engine's own `meleeOptions().targets`), with what the rules let me know of each, and a confirm before treachery or breaking my word. Nothing here decides a rule.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { pcEl } from '../shared_ui.js';
import { denSide } from '../../engine/combat.js';
import { foeFacts, gearWords, dealWith, treacheryCost, pname, targetName } from '../pvp.js';
import { onMine, picOf, nb } from './model.js';
import { displayName } from '../names.js';

export { onMine };
const personOf = (f, id) => f?.members.find(m => m.id === id)?.person ?? null;

// ---- a character as a row: the same row is a charge target and a melee target ----
/** One character, as the rules show him. `on`: chosen; `facts`: foeFacts(); a deal made (or `extra`) turns it into a warning. */
export function foeCard({ facts, person, on, role = 'radio', onclick, data = {}, extra = null }) {
    const state = facts.hidden ? 'hidden: you found them' : 'in plain sight';
    return h('button', { type: 'button', class: `ds-row pv-foe${on ? ' on sel' : ''}${facts.deal || extra ? ' warn' : ''}`, role, 'aria-checked': on ? 'true' : 'false', 'data-foe-char': facts.id, ...data, onclick },
        person ? pcEl({ ...person, dead: false }, { size: 38 }) : h('span', { class: 'ds-pc', style: 'width:38px;height:38px' }, '?'),
        h('span', { class: 'main pv-ftext' },
            h('b', {}, facts.player, h('i', {}, ` · ${displayName(facts.character)}`)),
            h('span', { class: 'pv-nums' }, nb(`Fame ${facts.fame} · Notoriety ${facts.notoriety} · ${state}`)),
            h('span', { class: 'pv-gear' }, gearWords(facts)),
            facts.deal ? h('span', { class: 'pv-deal' }, facts.deal) : null,
            extra),
        h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, on ? icon('check') : null));
}

/** A box that wants one tap of "yes, I mean it" before the primary button works. */
export function confirmBox({ title, text, label, on, ontoggle, key }) {
    return h('div', { class: `pv-confirm${on ? ' on' : ''}`, role: 'alert', 'data-confirm': key },
        h('b', {}, title), h('p', {}, text),
        h('button', { type: 'button', class: `pv-sure${on ? ' on' : ''}`, role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'data-act': 'pvp-confirm', onclick: ontoggle }, h('span', { class: 'pv-box', 'aria-hidden': 'true' }, on ? icon('check') : null), label));
}

/** What a play at this target needs the player to confirm first (or null): his own native hireling (treachery, 8.4.2g), a character he made a deal with today. */
export function needsConfirm(st, data, t) {
    if (!t) return null;
    if (t.kind === 'hire' && t.treachery) {
        const cost = treacheryCost(st, data, t.id, st.ch.id);
        return { key: 'treachery', title: 'This is treachery', text: `${t.name} is in your pay. Naming them as your target makes ${cost.count > 1 ? `the whole ${cost.group} under your hire` : 'them'} turn on you, wherever they are${cost.fame ? `, and you lose ${cost.fame} Fame` : ''}. They fight you from then on.`, label: `I mean it: strike my own ${t.name}` };
    }
    if (t.kind === 'character') {
        const deal = dealWith(st, st.ch.id, t.id);
        if (deal) return { key: 'deal', title: 'You gave your word', text: `${deal} Striking ${pname(st, t.id)} turns on someone you dealt with, and the whole table sees it.`, label: `I know. Strike ${pname(st, t.id)} anyway` };
    }
    return null;
}

// ---- the Whom step ----
/** Targets that are not on my stage: creatures of other sheets (or loose), characters, hirelings. */
export const elsewhere = (st, o) => o.targets.filter(t => t.kind === 'character' || t.kind === 'hire' || (t.kind !== 'part' && !onMine(st, t)));
/** Does the Melee need the Whom step? Only when someone besides my own creatures can be named. */
export const needsWhom = (st, o) => elsewhere(st, o).length > 0;

/** The opening plan of a shared Melee: a charge made this round binds the target to the one charged (the engine allows no one else). */
export function sharedPlan(st, o, m) {
    const on = st.combat?.charge?.on;
    if (on && o.targets.some(t => t.uid === `char:${on}`)) m.target = `char:${on}`;
    else if (m.target && !o.targets.some(t => t.uid === m.target)) m.target = o.targets.find(t => t.kind !== 'part')?.uid ?? null;
    return m;
}

/** The body of the Whom step: { els, blocked } (`blocked`: a confirm is pending, so Roll stays off). `m` is the plan in progress. */
export function whomBody(X, o, m) {
    const { st, data, render } = X, f = X.shared.fight;
    const charged = st.combat?.charge?.on ? f.members.find(x => x.id === st.combat.charge.on) : null;
    const pick = uid => { if (m.target !== uid) { m.target = uid; m.sure = null; } render(); };
    const chars = o.targets.filter(t => t.kind === 'character'), hires = o.targets.filter(t => t.kind === 'hire'), others = hires.filter(t => !t.own), own = hires.filter(t => t.own);
    const creatures = o.targets.filter(t => t.kind !== 'character' && t.kind !== 'hire' && t.kind !== 'part');
    const out = [];
    if (charged) out.push(h('p', { class: 'cb-hint', 'data-pv-charged': '' }, `You charged ${charged.player}: no one else may be your target this round.`));
    const none = () => h('button', { type: 'button', class: `ds-row pv-none${m.target == null ? ' sel' : ''}`, role: 'radio', 'aria-checked': m.target == null ? 'true' : 'false', 'data-target': '', onclick: () => { m.target = null; m.sure = null; render(); } },
        h('span', { class: 'main' }, h('b', {}, 'No one'), h('span', {}, 'Strike no one this round.')), h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, m.target == null ? icon('check') : null));
    const creatureRow = d => {
        const owner = !onMine(st, d) ? (d.sheet ? f.members.find(x => x.id === d.sheet) : null) : null, name = denSide(st, data, d).name, pic = picOf(st, data, d), on = m.target === d.uid;
        return h('button', { type: 'button', class: `ds-row pv-creature${on ? ' sel' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-target': d.uid, onclick: () => pick(d.uid) },
            h('span', { class: 'art' }, pic ? h('img', { src: pic, alt: '' }) : null),
            h('span', { class: 'main' }, h('b', {}, name), h('span', {}, onMine(st, d) ? 'On your sheet.' : owner ? `On ${owner.player}’s sheet: a blow that kills it is yours.` : 'Loose: on no one’s sheet.')),
            h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, on ? icon('check') : null));
    };
    out.push(none());
    out.push(...creatures.map(creatureRow));
    if (chars.length) {
        out.push(h('span', { class: 'ds-eyebrow pv-sub' }, chars.length === 1 ? 'Character' : 'Characters'),
            h('div', { class: 'ds-list pv-foes', role: 'radiogroup', 'aria-label': 'Characters you may strike', 'data-pv-targets': '' },
                ...chars.map(t => foeCard({ facts: { ...foeFacts(st, data, t.id), hidden: t.hidden, deal: dealWith(st, st.ch.id, t.id) }, person: personOf(f, t.id), on: m.target === t.uid, data: { 'data-target': t.uid }, onclick: () => pick(t.uid) }))));
    }
    if (others.length) {
        out.push(h('span', { class: 'ds-eyebrow pv-sub' }, 'Hirelings of other players'),
            h('div', { class: 'ds-list pv-foes', 'data-pv-hires': '' }, ...others.map(t => h('button', { type: 'button', class: `ds-row pv-foe hire${m.target === t.uid ? ' sel' : ''}`, role: 'radio', 'aria-checked': m.target === t.uid ? 'true' : 'false', 'data-target': t.uid, onclick: () => pick(t.uid) },
                pcEl({ ...(personOf(f, t.owner) ?? { shape: 'circle', color: '#6fae8a', letter: '?' }), dead: false }, { size: 32 }),
                h('span', { class: 'main pv-ftext' }, h('b', {}, targetName(st, data, t.uid) ?? t.name), h('span', { class: 'pv-nums' }, 'A hireling: no maneuver; a die gives the lane it strikes in')),
                h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, m.target === t.uid ? icon('check') : null)))));
    }
    if (own.length) {
        out.push(h('details', { class: 'pv-own', 'data-pv-own': '', open: own.some(t => t.uid === m.target) || null }, h('summary', {}, 'Your own hirelings: treachery'),
            h('div', { class: 'ds-list pv-foes' }, ...own.map(t => h('button', { type: 'button', class: `ds-row pv-foe hire warn${m.target === t.uid ? ' sel' : ''}`, role: 'radio', 'aria-checked': m.target === t.uid ? 'true' : 'false', 'data-target': t.uid, onclick: () => pick(t.uid) },
                h('span', { class: 'main pv-ftext' }, h('b', {}, `Your ${t.name}`), h('span', { class: 'pv-deal' }, 'Striking your own hireling is treachery.')),
                h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, m.target === t.uid ? icon('check') : null))))));
    }
    const sel = o.targets.find(t => t.uid === m.target), need = needsConfirm(st, data, sel);
    if (need) out.push(confirmBox({ ...need, on: m.sure === m.target, ontoggle: () => { m.sure = m.sure === m.target ? null : m.target; render(); } }));
    if (sel?.kind === 'character' || sel?.kind === 'hire') {
        out.push(h('p', { class: 'cb-hint pv-judge', 'data-pv-judge': '' }, sel.kind === 'hire'
            ? 'A hireling has no maneuver, so your blow lands if it reaches the lane a die gives it (the dice are rolled when the plays are shown).'
            : `Your blow is judged against the maneuver ${pname(st, sel.id)} plays: it lands if it is faster than that maneuver, or goes the way it faces (Thrust meets Charge, Swing meets Dodge, Smash meets Duck), or ${pname(st, sel.id)} plays none. Their play is sealed too.`));
        if (st.ch.hidden) out.push(h('p', { class: 'cb-hint' }, 'You are hidden: striking gives you away.'));
        if (sel.hidden) out.push(h('p', { class: 'cb-hint' }, `${pname(st, sel.id)} is hidden and you found them: naming them reveals them.`));
    }
    return { els: out, blocked: !!need && m.sure !== m.target };
}
