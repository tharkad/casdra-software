import { h } from './dom.js';

// A treasure or spell card, drawn as a card: a coloured title band, the numbers printed on it, and the full description from the rules.
const BAND = { White: '#e9e6d2', Grey: '#aeb4bd', Gold: '#e8c868', Purple: '#9d7fe0', Black: '#3d3a46', any: '#c9b98a', treasure: '#c4a45a', great: '#d9b34a', spell: '#8fa9d6' };

export function cardEl({ title, kind = 'treasure', tag = '', stats = [], text = '', notes = [], picture = null }) {
    const light = ['White', 'Gold', 'any', 'treasure', 'great', 'Grey'].includes(kind);
    return h('article', { class: `card card-${String(kind).toLowerCase()}`, 'data-card': kind },
        h('header', { class: 'card-band', style: `background:${BAND[kind] ?? BAND.treasure};color:${light ? '#1d1a12' : '#f4ecd6'}` },
            picture ? h('img', { class: 'card-pic', src: picture, alt: '' }) : null,
            h('div', {}, h('b', {}, title), tag ? h('small', {}, tag) : null)),
        stats.length ? h('div', { class: 'card-stats' }, ...stats.map(([k, v]) => h('span', {}, h('em', {}, k), ' ', v))) : null,
        text ? h('p', { class: 'card-text' }, text) : null,
        ...notes.map(n => h('p', { class: 'card-note' }, n)));
}
