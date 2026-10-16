import { lvl } from './core.js';
import { cardChits, BOOTS, GLOVES } from './modifiers.js';

// Everything a character can own is an item: { uid, kind: 'weapon'|'armor'|'horse'|'treasure', id, active, alerted, damaged, destroyed }.
export function makeItem(st, kind, id, extra = {}) {
    st.uidSeq = (st.uidSeq ?? 0) + 1;
    return { uid: 'i' + st.uidSeq, kind, id, active: false, alerted: false, damaged: false, destroyed: false, ...extra };
}

// What he has just come by, for the screen to make a fuss of (display only; the rules never read it).
export function noteGain(st, it) {
    st.gainSeq = (st.gainSeq ?? 0) + 1;
    (st.gains ??= []).push({ n: st.gainSeq, uid: it.uid, day: st.day });
    if (st.gains.length > 40) st.gains.shift();
}

// Something he has just found that is not an item he carries: a treasure card that turns out to be a Mouldy Skeleton, a site discovered.
// { kind: 'card', id } opens the card; { kind: 'site', clearing } opens the clearing.
export function noteFind(st, f) {
    st.findSeq = (st.findSeq ?? 0) + 1;
    (st.finds ??= []).push({ n: st.findSeq, day: st.day, ...f });
    if (st.finds.length > 40) st.finds.shift();
}

export function defOf(data, it) {
    if (it.kind === 'spell') return { name: `Spell card (type ${it.id.replace('spell-', '')})`, weight: 'N', gold: 0 };
    return it.kind === 'weapon' ? data.weapons[it.id] : it.kind === 'armor' ? data.armor[it.id] : it.kind === 'horse' ? data.horses[it.id] : data.treasures[it.id];
}
export const nameOf = (data, it) => defOf(data, it)?.name ?? it.id;
export const weightOf = (data, it) => defOf(data, it)?.weight ?? 'N';

// Gold a native pays for an item (damaged armor is worth less).
export function priceOf(data, it) {
    const d = defOf(data, it);
    if (!d) return 0;
    if (it.kind === 'armor') return it.damaged ? (d.priceDamaged ?? Math.floor((d.priceIntact ?? 0) * 0.7)) : (d.priceIntact ?? 0);
    return d.gold ?? d.price ?? 0;
}

// The heaviest thing he owns bounds what he can carry when he walks.
export function carriedLevel(st, data) {
    let w = 0;
    for (const it of st.ch.items) if (!it.destroyed && it.kind !== 'horse') w = Math.max(w, lvl(weightOf(data, it)));
    return w;
}

// Strongest active Move chit's strength (or a horse's): what he can carry on a Move.
export function activeHorse(st) { return st.ch.items.find(i => i.kind === 'horse' && i.active && !i.destroyed) ?? null; }

export function carryCapacity(st, data) {
    let c = -1;
    for (const x of st.ch.chits) if (x.state === 'active' && x.type === 'move') c = Math.max(c, lvl(x.strength));
    for (const x of st.ch.chits) if (x.state === 'active' && x.alt?.mf) c = Math.max(c, lvl(x.alt.strength));          // a Magic chit changed by Unleash Power carries like a Move chit
    const h = activeHorse(st);
    if (h && data.horses[h.id]) c = Math.max(c, lvl(data.horses[h.id].walk.strength));
    for (const b of cardChits(st, 'move')) c = Math.max(c, lvl(b.strength));
    return c;
}

// Items beyond what he can carry are dropped where he stands when he moves.
export function dropHeavy(st, data) {
    const cap = carryCapacity(st, data);
    const dropped = [];
    st.ch.items = st.ch.items.filter(it => {
        if (it.destroyed || it.kind === 'horse') return true;
        if (lvl(weightOf(data, it)) > Math.max(cap, 0) && lvl(weightOf(data, it)) > 0) { dropped.push(it); return false; }
        return true;
    });
    return dropped;
}

export function abandon(st, clearing, items) {
    // new things go underneath what is already lying there
    st.abandoned[clearing] = [...(st.abandoned[clearing] ?? []), ...items.map(i => ({ ...i, active: false, alerted: false }))];
}

// One weapon at a time, and of armor one of each type: a helmet, a breastplate, a shield and a suit of armor may all be active together (rule 4.3.7: a
// breastplate is fitted over a suit, a helmet worn over its basinet); two of the same type may not. Armor cards each have a place of their own.
export function slotsOf(data, it) {
    const d = defOf(data, it);
    if (it.kind === 'weapon') return ['weapon'];
    if (it.kind === 'treasure') return BOOTS[it.id] ? ['boots'] : GLOVES[it.id] ? ['gloves'] : [];
    if (it.kind === 'armor') {
        if (d?.card) return ['card:' + it.id];
        const t = (d?.type ?? '').toLowerCase();
        if (['suit', 'helmet', 'breastplate', 'shield'].includes(t)) return [t];
    }
    return [];
}

// A potion or ointment that is used up: it is never put to use for him (using it spends it, so it is his choice and his moment).
const ONE_USE = new Set(['flowers-of-rest']);
export function isOneUse(data, it) {
    if (it.kind !== 'treasure') return false;
    const d = defOf(data, it);
    return ONE_USE.has(it.id) || /one-use|\bpotion\b/i.test(d?.effectText ?? '');
}

// Puts a newly acquired item into use if the slots it needs are free.
export function autoEquip(st, data, it) {
    const slots = slotsOf(data, it);
    if (it.kind === 'treasure' && !slots.length) { if (!isOneUse(data, it)) it.active = true; return; }
    if (!slots.length) return;
    if (BOOTS[it.id] && !bootsStrongEnough(st, data, it)) return;
    const taken = st.ch.items.filter(o => o.uid !== it.uid && o.active && !o.destroyed && slotsOf(data, o).some(s => slots.includes(s)));
    if (!taken.length) it.active = true;
}

// Switching one item on switches off anything that needs the same slot.
// Boots (like a horse) must be able to carry him and everything he owns.
export function bootsStrongEnough(st, data, it) {
    const need = Math.max(lvl(st.ch.weight), carriedLevel(st, data));
    return lvl(BOOTS[it.id][0]) >= need;
}

export function toggleItem(st, data, it) {
    if (it.active) { it.active = false; if (it.kind === 'weapon') it.alerted = false; return; }
    if (BOOTS[it.id] && !bootsStrongEnough(st, data, it)) throw new Error('Those boots are not strong enough to carry you and your gear.');
    const slots = slotsOf(data, it);
    for (const o of st.ch.items) if (o.uid !== it.uid && o.active && slotsOf(data, o).some(s => slots.includes(s))) { o.active = false; if (o.kind === 'weapon') o.alerted = false; }
    it.active = true;
}

// One short line describing an item for a person (stats, not rules text).
export function summaryOf(data, it) {
    const d = defOf(data, it);
    if (!d) return '';
    if (it.kind === 'weapon') {
        const u = d.unalerted, a = d.alerted;
        const fmt = x => `${x.harm}${'*'.repeat(x.stars ?? 0)}${x.attackTime != null ? ' speed ' + x.attackTime : ''}`;
        return `${d.missile ? 'missile' : 'striking'}, length ${d.length}; ready ${fmt(a)}`;
    }
    if (it.kind === 'armor') return `${d.type}, toughness ${d.toughness}${it.damaged ? ', damaged' : ''}`;
    if (it.kind === 'horse') return `walks ${d.walk.strength}${d.walk.moves}, gallops ${d.gallop.strength}${d.gallop.moves}`;
    if (it.kind === 'treasure') return d.effectText ? d.effectText.slice(0, 80) : '';
    return '';
}
