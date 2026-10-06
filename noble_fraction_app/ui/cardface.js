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

const ELEMENT_INFO = {
    N: { hue: 228, at: [2, 15] }, O: { hue: 350, at: [2, 16] },
    Kr: { hue: 138, at: [4, 18] }, Xe: { hue: 186, at: [5, 18] },     // [period, group]
};

// A miniature periodic table with this card's element lit; it says which element the card is.
const PERIODS = [[1, 18], [1, 2, 13, 14, 15, 16, 17, 18], [1, 2, 13, 14, 15, 16, 17, 18],
    Array.from({ length: 18 }, (_, i) => i + 1), Array.from({ length: 18 }, (_, i) => i + 1),
    [1, 2, ...Array.from({ length: 16 }, (_, i) => i + 3)], [1, 2, ...Array.from({ length: 16 }, (_, i) => i + 3)]];
function periodicTable(symbol, [period, group]) {
    // Row 1 is a taller band, so hydrogen and helium sit at its ends like the real table.
    const rowY = row => (row === 1 ? 4.5 : 14 + (row - 2) * 6 + (row > 7 ? 3 : 0));
    const cell = (row, col, lit) => `<rect x="${(col - 1) * 6}" y="${rowY(row)}" width="5" height="5" rx="1" class="${lit ? 'lit' : 'cell'}"/>`;
    let svg = '';
    PERIODS.forEach((cols, r) => cols.forEach(c => { svg += cell(r + 1, c, r + 1 === period && c === group); }));
    for (const row of [8, 9]) for (let c = 3; c <= 16; c += 1) svg += cell(row, c, false);
    // the element's abbreviation fills the empty notch above the transition metals
    svg += `<text x="41.5" y="21" text-anchor="middle" class="zsym">${symbol}</text>`;
    const box = h('span', { class: 'ptable' });
    box.innerHTML = `<svg viewBox="0 0 108 66" aria-hidden="true">${svg}</svg>`;
    return box;
}
const KIND_HUE = { upgrade: 262, starter: 172, pipeline: 212 };

const circle = (cls, text) => h('span', { class: `badge ${cls}` }, text);

// The two numbers in an Upgrade's top-left corner: what it costs to buy, and (ringed) what it costs
// to install later from your hand. A card that can never be installed shows only the first.
const upgradeCosts = d => h('span', { class: 'costs', title: d.pink ? `Buy $${d.buy}` : `Buy $${d.buy} · install later +$${d.installDiff}` },
    circle('cost', d.buy), d.pink ? null : h('b', { class: 'later' }, d.installDiff));

function elementFace(d) {
    const info = ELEMENT_INFO[d.id];
    return h('div', { class: `face kind-element el-${d.id}`, style: `--h:${info.hue}` },
        periodicTable(d.id, info.at),
        glyphEl('element_ring', 'glyph ring'),
        h('span', { class: 'ename' }, d.name));
}

function foot(d) {
    if (d.kind === 'contract') {
        return h('div', { class: 'foot' },
            h('span', { class: 'xe-need', title: `${d.xe} Xe needed` }, `Xe ×${d.xe}`),
            h('span', { class: 'pay' }, `$${d.money}`),
            h('span', { class: 'vp-star' }, d.vp));
    }
    if (d.kind === 'pipeline') return h('div', { class: 'foot' }, h('span', { class: 'plus' }, '+1 hand'));
    const install = d.pink ? glyphEl('ph_noinstall', 'glyph tiny') : circle('install', d.installTotal);
    return h('div', { class: 'foot' }, d.phase ? h('span', { class: 'phase' }, glyphEl(`ph_${d.phase === 'wipe' ? 'purge' : d.phase === 'air' ? 'intake' : d.phase}`, 'glyph tiny'), h('em', {}, PHASES[d.phase])) : h('span'), install);
}

// The colour a card is drawn in (also the colour of its playable ring).
export function cardHue(defId) {
    const d = CARD_DEFS[defId];
    if (d.kind === 'element') return ELEMENT_INFO[d.id].hue;
    if (d.kind === 'pipeline') return ELEMENT_INFO[d.color].hue;
    return d.kind === 'contract' ? SECTORS[d.sector].hue : KIND_HUE[d.kind];
}

// The largest name size (in card-width units) at which the name wraps into at most two lines inside the room
// the corner badge leaves it. Measured with a deliberately wide average letter so no name can be clipped.
const NAME_ROOM = { contract: 68, upgrade: 52, starter: 64, pipeline: 64 };
const CHAR_EM = 0.56;
export function nameSize(name, kind) {
    const room = NAME_ROOM[kind] ?? 64;
    for (let fs = 10; fs >= 5.5; fs -= 0.25) {
        const perLine = Math.floor(room / (fs * CHAR_EM));
        let lines = 1; let used = 0;
        for (const word of name.split(' ')) {
            if (word.length > perLine) { lines = 99; break; }
            if (used === 0) used = word.length;
            else if (used + 1 + word.length <= perLine) used += 1 + word.length;
            else { lines += 1; used = word.length; }
        }
        if (lines <= 2) return fs;
    }
    return 5.5;
}

export function cardFace(defId) {
    const d = CARD_DEFS[defId];
    if (d.kind === 'element') return elementFace(d);
    const hue = d.kind === 'contract' ? SECTORS[d.sector].hue : KIND_HUE[d.kind];
    const corner = d.kind === 'contract' ? glyphEl(SECTORS[d.sector].glyph, 'glyph corner')
        : d.kind === 'upgrade' ? upgradeCosts(d)
            : circle('cost', d.kind === 'starter' ? d.installCost ?? d.installDiff : d.buy);
    const tint = d.kind === 'pipeline' ? ` el-${d.color}` : '';
    return h('div', { class: `face kind-${d.kind}${tint}`, style: `--h:${d.kind === 'pipeline' ? ELEMENT_INFO[d.color].hue : hue}` },
        h('div', { class: 'top' }, corner, h('span', { class: 'name', style: `--name-fs:${nameSize(d.name, d.kind)}cqw` }, d.name)),
        h('div', { class: 'art' }, glyphEl(d.glyph)),
        d.text ? h('p', { class: 'rules' }, d.text) : null,
        foot(d));
}
