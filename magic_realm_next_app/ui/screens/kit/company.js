// screens/kit/company.js (P2): the Company room of the Kit sheet: who is with you. One card per hired group (natives, hired monsters, creatures under your control), shown as the
// printed counters (tap one to turn it over), the days left as pips (14, amber at 3 or fewer), the Extend chip (lit only in a Hire phase, where the engine offers it), where you
// stand with each group, and what you owe. There is no dismiss action in the engine, so none is offered; hirelings fight beside you without orders (the engine deploys them).
import { hireStats, denSide } from '../../../engine/combat.js';
import { hirelingsOf } from '../../../engine/party.js';
import { policyBlock } from '../meetui.js';
import { mc } from '../play/kit.js';
import { render } from '../play/shell.js';
import { h } from '../../dom.js';
import { art } from '../../icons.js';
import { moodTag, nativeArt, say } from './common.js';

// Everyone who is with this character and alive: natives and monsters he hired, and creatures a spell put under his command.
export function hirelings(G) { return hirelingsOf(G.st, G.st.ch.id).filter(o => !o.dead); }
export const hireCount = G => hirelings(G).length;

const isNat = (G, o) => G.st.nats.includes(o);
const daysLeft = (G, o) => Math.max(0, (o.hiredUntil ?? G.st.day) - G.st.day + 1);          // hired on day D it runs to midnight of D+13: 14 days counting today

// The art of a hireling's counter: a native's counter, or a monster's colour counter.
function counterArt(G, o) {
    if (isNat(G, o)) return nativeArt(G, o.id);
    const name = G.data.monsters[o.id]?.name;
    return G.data.art?.monstersColor?.[name] ?? G.data.art?.monsters?.[name] ?? null;
}

// What shows on a counter turned over: the other side's blow and move, as the printed counter has them.
function otherSide(G, o) {
    try {
        const nat = isNat(G, o), now = hireStats(G.data, o.id, nat ? 'nat' : 'mon', G.st);
        const def = nat ? G.data.natives[o.id] : G.data.monsters[o.id];
        const sides = [['light', def.light], ['dark', def.dark]].filter(([, s]) => s);
        const pick = sides.find(([, s]) => s && !(s.harm === now.harm && s.attackTime === now.atk)) ?? sides[1];
        if (!pick) return null;
        const d = denSide(G.st, G.data, { kind: nat ? 'nat' : 'mon', id: o.id, side: pick[0] });
        return { name: pick[0] === 'dark' ? 'Dark side' : 'Light side', hit: d.attack === 'none' ? 'no blow' : `${d.harm}${d.atk}`, move: d.move != null ? `move ${d.move}` : '' };
    } catch { return null; }
}

function counter(G, o, ctl) {
    const nat = isNat(G, o), def = nat ? G.data.natives[o.id] : G.data.monsters[o.id], flipped = !!G.ui.coFlip?.[o.id];
    let s = null; try { s = hireStats(G.data, o.id, nat ? 'nat' : 'mon', G.st); } catch { /* a name only */ }
    const lbl = nat && def.leader ? 'Lead' : s?.harm ? `${s.harm}${s.atk ?? ''}` : '';
    const back = flipped ? otherSide(G, o) : null;
    const img = counterArt(G, o);
    return h('button', { type: 'button', class: `ds-counter tall kit-counter${flipped ? ' flipped' : ''}`, 'data-hireling': o.id, 'data-flip': '', 'aria-label': `${def.name}: tap to turn the counter over`, 'aria-pressed': flipped ? 'true' : 'false',
        onclick: () => { (G.ui.coFlip ??= {})[o.id] = !flipped; render(G); } },
        flipped ? h('span', { class: 'kit-back' }, back ? [h('small', {}, back.name), h('b', {}, back.hit), h('small', {}, back.move)] : [h('small', {}, 'No other side')]) : (img ? art(img.replace(/^art\//, ''), '', def.name) : h('span', { class: 'kit-noart' }, def.name)),
        flipped ? null : h('span', { class: 'lbl' }, lbl));
}

// "Spear, on ponies": what the group carries and rides, from its printed counters (omitted when the data has none).
function flavor(G, members) {
    const nats = members.filter(o => isNat(G, o)).map(o => G.data.natives[o.id]);
    if (!nats.length) return '';
    const pl = w => (/y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
    const weapons = [...new Set(nats.map(n => n.weapon?.name).filter(Boolean))], horses = [...new Set(nats.map(n => n.horse?.kind ?? n.horse?.name?.toLowerCase()).filter(Boolean))];
    const one = nats.length === 1, w = weapons.length === 1 ? (one ? weapons[0] : pl(weapons[0])) : '', hz = horses.length === 1 ? (one ? `on a ${horses[0]}` : `on ${pl(horses[0])}`) : '';
    return [w, hz].filter(Boolean).join(', ');
}

// The cards, in the order they are shown: each native group (Order and Rogues are hired one at a time, so one card each), hired monsters by kind, then creatures under control.
function groups(G) {
    const out = [], list = hirelings(G);
    const nats = list.filter(o => isNat(G, o)), mons = list.filter(o => !isNat(G, o));
    const byGroup = new Map();
    for (const o of nats) { const d = G.data.natives[o.id], solo = G.data.groups[d.group]?.hireMode === 'individual', k = solo ? o.id : d.group; (byGroup.get(k) ?? byGroup.set(k, { key: k, kind: 'nat', group: d.group, solo, members: [] }).get(k)).members.push(o); }
    out.push(...byGroup.values());
    const byKind = new Map();
    for (const o of mons) { const d = G.data.monsters[o.id], k = `${d.name}:${o.controlledUntil ? 'c' : 'h'}`; (byKind.get(k) ?? byKind.set(k, { key: k, kind: 'mon', group: d.name, controlled: !!o.controlledUntil && o.hiredUntil == null, members: [] }).get(k)).members.push(o); }
    out.push(...byKind.values());
    return out;
}

function titleOf(G, g) {
    const n = g.members.length;
    if (g.kind === 'mon') return n > 1 ? `${g.group} ×${n}` : g.group;
    if (g.solo) return G.data.natives[g.members[0].id].name;
    const lead = g.members.filter(o => G.data.natives[o.id].leader).length, rest = n - lead;
    if (!rest) return `${g.group} leader`;
    return h('span', {}, `${g.group} ×${rest}`, lead ? h('span', { class: 'ds-dim kit-lead' }, ' and their leader') : null);
}

function groupCard(G, g, ctl) {
    const days = g.controlled ? null : Math.min(...g.members.map(o => daysLeft(G, o))), low = days != null && days <= 3;
    const wages = g.members.reduce((n, o) => n + (isNat(G, o) ? G.data.natives[o.id].wage : (G.data.monsters[o.id].notoriety || 1)), 0);
    const fl = flavor(G, g.members);
    return h('div', { class: 'ds-group kit-group', 'data-group': g.group },
        h('div', { class: 'hd' }, h('b', {}, titleOf(G, g)),
            g.controlled ? h('span', { class: 'ds-tag' }, 'until Sunset') : h('span', { class: `ds-tag ${low ? 'warn' : 'good'}`, 'data-days': String(days) }, `${days} day${days === 1 ? '' : 's'} left`)),
        g.controlled ? null : h('div', { class: `ds-daypips${low ? ' low' : ''}`, 'aria-hidden': 'true' }, Array.from({ length: 14 }, (_, i) => h('i', { class: i < days ? null : 'off' }))),
        h('div', { class: 'cs' }, g.members.map(o => counter(G, o))),
        h('p', { class: 'ds-meta kit-orders' }, `${g.controlled ? 'Under your spell. ' : ''}${g.kind === 'mon' && g.members.length === 1 ? 'It fights' : 'They fight'} beside you without orders.${fl ? ` ${fl[0].toUpperCase()}${fl.slice(1)}.` : ''}${G.shared ? ` ${g.members.length === 1 && g.kind === 'mon' ? 'It is' : 'They are'} yours alone.` : ''}`),
        g.controlled ? null : [h('button', { type: 'button', class: 'ds-btn sm is-dim', 'data-act': 'extend', 'aria-disabled': 'true', onclick: () => ctl.say('Extending is done in a Hire phase, beside them.') }, `Extend 14 days · wages ${wages}g`),
            h('div', { class: 'ds-why kit-extwhy' }, 'Extending is done in a Hire phase, beside them.')]);
}

// companyTab(G) -> the room's DOM
export function companyTab(G) {
    const { ch } = G.st, cards = groups(G), owed = ch.boons ?? [];
    const ctl = { say: t => say(G, t) };
    return h('div', { class: 'kit-room kit-company' },
        h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'In your pay'), cards.length ? h('small', {}, 'tap a counter to turn it') : null),
        cards.length ? h('div', { class: 'kit-groups' }, cards.map(g => groupCard(G, g, ctl))) : h('p', { class: 'kit-none' }, 'Nobody is in your pay. Natives here will hire out in a Hire phase.'),
        h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'Where you stand')),
        h('div', { class: 'kit-moods' }, Object.entries(ch.rel ?? {}).map(([g, r]) => moodTag(r, g))),
        h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'You owe')),
        owed.length ? h('div', { class: 'ds-list' }, owed.map(b => h('div', { class: 'ds-row kit-owe', 'data-owe': b.group }, h('span', { class: 'main' }, h('b', {}, `The ${b.group}’s ${b.what}`), h('span', {}, 'Buy their goodwill back in a Trade phase beside them: one roll, then it is lost for good.')), h('span', { class: 'end' }, `${b.price}g`))))
            : h('p', { class: 'ds-text kit-none' }, 'Nothing. No favours to repay.'),
        ...(G.shared && G.ms ? policyBlock(mc(G)) : []));
}

