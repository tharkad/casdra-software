import { h } from './dom.js';
import { CARD_DEFS, SECTORS, PHASES } from '../data/cards.js';
import { GLYPHS } from './art/glyphs.js';

// Every card is drawn from data: a frame coloured by kind/sector/element, an original SVG glyph,
// the cost and VP badges, and (only at zoom size, via CSS) the rules text. Nothing is an image file.
const SVG_OPEN = '<svg viewBox="0 0 100 100" aria-hidden="true">';
const PLACEHOLDER = '<g fill="none" stroke="currentColor" stroke-width="4"><circle cx="50" cy="50" r="30"/></g>';

export function glyphEl(id, cls = 'glyph') {
    const box = h('span', { class: cls });
    box.innerHTML = `${SVG_OPEN}${GLYPHS[id] ?? PLACEHOLDER}</svg>`;
    return box;
}

const ELEMENT_INFO = { N: { z: 7, hue: 228 }, O: { z: 8, hue: 350 }, Kr: { z: 36, hue: 138 }, Xe: { z: 54, hue: 186 } };
const KIND_HUE = { upgrade: 262, starter: 172, pipeline: 212 };

const circle = (cls, text) => h('span', { class: `badge ${cls}` }, text);

function elementFace(d) {
    const info = ELEMENT_INFO[d.id];
    return h('div', { class: `face kind-element el-${d.id}`, style: `--h:${info.hue}` },
        h('span', { class: 'atomic' }, info.z),
        glyphEl('element_ring', 'glyph ring'),
        h('span', { class: 'symbol' }, d.id),
        h('span', { class: 'ename' }, d.name));
}

function foot(d) {
    if (d.kind === 'contract') {
        return h('div', { class: 'foot' },
            h('span', { class: 'xe-need', title: 'Xe needed' }, Array.from({ length: d.xe }, () => h('i', { class: 'xe-dot' }))),
            h('span', { class: 'pay' }, `$${d.money}`),
            h('span', { class: 'vp-star' }, d.vp));
    }
    if (d.kind === 'pipeline') return h('div', { class: 'foot' }, h('span', { class: 'plus' }, '+1 hand'));
    const install = d.pink ? glyphEl('ph_noinstall', 'glyph tiny') : circle('install', d.installTotal);
    return h('div', { class: 'foot' }, d.phase ? h('span', { class: 'phase' }, glyphEl(`ph_${d.phase === 'wipe' ? 'purge' : d.phase === 'air' ? 'intake' : d.phase}`, 'glyph tiny'), h('em', {}, PHASES[d.phase])) : h('span'), install);
}

export function cardFace(defId) {
    const d = CARD_DEFS[defId];
    if (d.kind === 'element') return elementFace(d);
    const hue = d.kind === 'contract' ? SECTORS[d.sector].hue : KIND_HUE[d.kind];
    const corner = d.kind === 'contract' ? glyphEl(SECTORS[d.sector].glyph, 'glyph corner')
        : circle('cost', d.kind === 'starter' ? d.installCost ?? d.installDiff : d.buy);
    const tint = d.kind === 'pipeline' ? ` el-${d.color}` : '';
    return h('div', { class: `face kind-${d.kind}${tint}`, style: `--h:${d.kind === 'pipeline' ? ELEMENT_INFO[d.color].hue : hue}` },
        h('div', { class: 'top' }, corner, h('span', { class: 'name' }, d.name)),
        h('div', { class: 'art' }, glyphEl(d.glyph)),
        d.text ? h('p', { class: 'rules' }, d.text) : null,
        foot(d));
}
