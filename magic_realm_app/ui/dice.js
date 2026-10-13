import { h } from './dom.js';

// Dice for the tray, the history sheet and the offer sheets. A roll is { n, day, what, dice, used?, value, result }.
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function dieFace(n, { counts = false, mod = 0 } = {}) {
    return h('span', { class: `die${counts ? ' counts' : ''}`, 'aria-label': `die showing ${n}` },
        ...Array.from({ length: 9 }, (_, i) => h('i', { class: PIPS[n]?.includes(i) ? 'on' : '' })),
        mod ? h('b', { class: 'dmod' }, `-${mod}`) : null);
}

// The faces of one roll. With two dice the one that counts is ringed; Honor shows as a small -1 under the die.
export function diceOf(r) {
    const shown = r.used ?? r.dice;
    const best = r.dice.length > 1 ? shown.indexOf(Math.max(...shown)) : -1;
    return h('span', { class: 'dice' }, ...r.dice.map((d, i) => dieFace(d, { counts: i === best, mod: r.used ? d - r.used[i] : 0 })));
}

export function rollRow(r, { compact = false } = {}) {
    return h('div', { class: `rollrow${compact ? ' compact' : ''}${r.what === 'Monster roll' ? ' monster' : ''}` },
        h('div', { class: 'rr-what' }, r.what),
        h('div', { class: 'rr-body' }, diceOf(r), r.result ? h('span', { class: 'rr-res' }, r.result) : h('span', { class: 'rr-res dim' }, `counts ${r.value}`)));
}

export const rollsByIds = (st, ids) => (ids ?? []).map(n => (st.rolls ?? []).find(r => r.n === n)).filter(Boolean);
export const latestRoll = st => (st.rolls ?? []).at(-1) ?? null;
