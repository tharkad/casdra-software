// combat/counters.js: how a counter on a Melee Section (or a hireling on the Deployment card) is named and drawn: a hireling (his side as he shows it now), a creature, its head or club, a horse.
// A counter is named by its key (the engine's own: a unit's uid, a head or club's uid, a creature's horse's uid, or `<hireling uid>:horse`). No rules in here: only what to show.
import { h } from '../dom.js';
import { monsterCounter } from '../counter.js';
import { denSide } from '../../engine/combat.js';
import { picOf, nbTag } from './model.js';

const hireOf = (c, key) => (c.hires ?? []).find(x => x.uid === key) ?? null;
const denOf = (c, key) => c.dens.find(x => x.uid === key) ?? null;

// -> { key, name, role: 'hire' | 'den' | 'part' | 'horse', hire (the hireling record, for him and his horse), den, side }
export function counterInfo(st, data, key) {
    const c = st.combat;
    if (key.endsWith(':horse')) {
        const hire = hireOf(c, key.slice(0, -6)), hd = hire && hire.kind === 'nat' ? data.natives[hire.id]?.horse : null;
        return { key, role: 'horse', hire, name: hd ? `${hd.name}` : 'Horse', side: hire?.horse?.side ?? 'light', ownerKey: hire?.uid };
    }
    const hire = hireOf(c, key);
    if (hire) {
        const s = denSide(st, data, { kind: hire.kind, id: hire.id, side: hire.side ?? 'light' });
        return { key, role: 'hire', hire, name: s.name, side: hire.side ?? 'light' };
    }
    const d = denOf(c, key);
    if (!d) return { key, role: 'den', name: '?', side: 'light' };
    const s = denSide(st, data, d);
    return { key, role: d.kind === 'horse' ? 'horse' : d.kind === 'part' ? 'part' : 'den', den: d, name: s.name, side: d.side ?? 'light', ownerKey: d.partOf ?? null };
}

// The name as the counter prints it ("Wolf #2"), with the no-break space before the tag
export const nameOfKey = (st, data, key) => nbTag(counterInfo(st, data, key).name);

// The counter's picture as an SVG (size in px), or null for a horse (it has no counter art: the screens write its name).
export function counterEl(st, data, key, size = 44, sideOverride = null) {
    const info = counterInfo(st, data, key);
    if (info.role === 'horse') return null;
    const side = sideOverride ?? info.side;
    if (info.hire) {
        const hh = info.hire, def = { kind: hh.kind, id: hh.id, side };
        return monsterCounter({ s: denSide(st, data, def), side, picture: picOf(st, data, def), flies: hh.kind === 'mon' && !!data.monsters[hh.id]?.flies, size });
    }
    const d = info.den;
    if (!d) return null;
    const view = { ...d, side };
    return monsterCounter({ s: denSide(st, data, view), side, picture: picOf(st, data, d), flies: d.kind === 'mon' && !!data.monsters[d.id]?.flies, size });
}

// A small framed counter for a card or a cell: the picture (or, for a horse, its name on a plain tile)
export function counterBox(st, data, key, size = 44, cls = '') {
    const el = counterEl(st, data, key, size);
    if (el) return h('span', { class: `ds-cs-wrap cs-box ${cls}`, style: `width:${size}px;height:${size}px`, 'aria-hidden': 'true' }, el);
    return h('span', { class: `cs-box cs-horse ${cls}`, style: `width:${size}px;height:${size}px`, 'aria-hidden': 'true' }, 'Horse');
}
