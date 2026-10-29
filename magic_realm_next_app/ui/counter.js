import { sv } from './dom.js';
import { isBookPic } from '../engine/artbook.js';

// A monster counter drawn the way the game's own counters read: the picture, its name, the vulnerability in a circle (grey when armored), Fame
// and Notoriety, the attack (harm letter, attack time, stars, and the weapon length in brackets) at the bottom left, and the move time in a blue
// circle at the bottom right. Light side on a pale face, dark side on a dark one, red side (Tremendous monsters) on red.
// `s` is what combat.denSide() returns for the side being shown, so the counter and the rules cannot disagree.

const FACE = {
    light: { fill: '#f1e9d0', edge: '#6b5d3a', text: '#1d1a12', stat: '#b8560f' },
    dark: { fill: '#9c9276', edge: '#3a3322', text: '#14120c', stat: '#ff7a00' },
    red: { fill: '#c9533f', edge: '#4b1a12', text: '#fff6ec', stat: '#ffe08a' },
};
// the dark side's orange stats sit on a mid-grey face and wash out: a dark border round the glyphs (painted under the fill) makes them read
const edged = (side, f) => side === 'dark' ? { stroke: f.edge, 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round' } : {};
const star = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); }
    return pts.join(' ');
};

export function monsterCounter({ s, side = 'light', picture = null, flies = false, size = 92, label = null }) {
    s = s ?? { name: label ?? 'Unknown' };                 // a counter is never blank: with nothing to say it still shows its frame and a name
    const f = FACE[side] ?? FACE.light;
    const svg = sv('svg', { viewBox: '0 0 100 100', width: size, height: size, class: `counter ${side}`, role: 'img', 'aria-label': label ?? `${s.name ?? 'Unknown'}, ${side} side` });
    svg.append(sv('rect', { x: 1.5, y: 1.5, width: 97, height: 97, rx: 9, fill: f.fill, stroke: f.edge, 'stroke-width': 3 }));
    // The rulebook's own printed counter (used only where the main art has no picture) already carries the face colour and the figures: it fills the frame, under a name strip.
    if (picture && isBookPic(picture)) {
        svg.append(sv('image', { href: picture, x: 4, y: 4, width: 92, height: 92, preserveAspectRatio: 'xMidYMid meet', class: 'bookface' }));
        svg.append(sv('rect', { x: 3, y: 3, width: 94, height: 17, rx: 6, fill: '#000', 'fill-opacity': 0.62 }));
        const nm = String(s.name ?? '');
        svg.append(sv('text', { x: 7, y: 15, 'font-size': nm.length > 16 ? 8 : nm.length > 11 ? 9 : 10, 'font-style': 'italic', 'font-weight': 600, fill: '#fff6ec' }, nm));
        return svg;
    }
    if (picture) svg.append(sv('image', { href: picture, x: 15, y: 16, width: 70, height: 66, preserveAspectRatio: 'xMidYMid meet' }));
    // name, small italic, top left
    const name = String(s.name ?? '');
    svg.append(sv('text', { x: 6, y: 13, 'font-size': name.length > 16 ? 8 : name.length > 11 ? 9 : 10, 'font-style': 'italic', 'font-weight': 600, fill: f.text }, name));
    // vulnerability, top right
    if (s.vuln) {
        svg.append(sv('circle', { cx: 86, cy: 28, r: 9.5, fill: s.armored ? '#cfcfcf' : '#f2d94e', stroke: '#2a2a2a', 'stroke-width': 1 }));
        svg.append(sv('text', { x: 86, y: 28, 'text-anchor': 'middle', dy: '.36em', 'font-size': 13, 'font-weight': 800, fill: '#111' }, String(s.vuln)));
    }
    // Fame and Notoriety, right side
    let ty = 50;
    if (s.notor) { svg.append(sv('text', { x: 95, y: ty, 'text-anchor': 'end', 'font-size': 9, 'font-weight': 700, fill: f.text }, `N:${s.notor}`)); ty += 10; }
    if (s.fame) svg.append(sv('text', { x: 95, y: ty, 'text-anchor': 'end', 'font-size': 9, 'font-weight': 700, fill: f.text }, `F:${s.fame}`));
    if (flies) svg.append(sv('text', { x: 95, y: 72, 'text-anchor': 'end', 'font-size': 9, 'font-style': 'italic', fill: f.text }, 'flies'));
    // the attack, bottom left: harm letter and time (stars after), weapon length above in brackets
    if (s.attack === 'spell') {
        // a Demon or an Imp does not strike: it casts the Power of the Pit, at its attack time
        svg.append(sv('text', { x: 6, y: 93, 'font-size': 17, 'font-weight': 800, fill: f.stat }, `Pit${s.atk ?? ''}`));
        if (s.length) svg.append(sv('text', { x: 6, y: 77, 'font-size': 9.5, 'font-weight': 700, fill: f.stat }, `(${s.length})`));
        svg.append(sv('text', { x: 6, y: 66, 'font-size': 8, 'font-style': 'italic', fill: f.text }, 'casts'));
    } else if (s.attack !== 'none' && s.harm) {
        const red = side === 'red';
        const txt = red ? s.harm : `${s.harm}${s.atk ?? ''}`;
        svg.append(sv('text', { x: 6, y: 93, 'font-size': 19, 'font-weight': 800, fill: f.stat, ...(side === 'dark' ? edged(side, f) : { stroke: red ? 'none' : '#00000022', 'stroke-width': 0.4 }) }, txt));
        let x = 8 + txt.length * 11.5;
        if (red && s.atk != null) {
            svg.append(sv('circle', { cx: x + 6, cy: 87, r: 9, fill: 'none', stroke: f.stat, 'stroke-width': 2 }));
            svg.append(sv('text', { x: x + 6, y: 87, 'text-anchor': 'middle', dy: '.36em', 'font-size': 12, 'font-weight': 800, fill: f.stat }, String(s.atk)));
            x += 22;
        }
        for (let i = 0; i < (s.stars || 0); i++) { svg.append(sv('polygon', { points: star(x + 5 + i * 11, 86, 5.5), fill: f.stat, ...edged(side, f) })); }
        if (s.length) svg.append(sv('text', { x: 6, y: 77, 'font-size': 9.5, 'font-weight': 700, fill: f.stat, ...edged(side, f) }, `(${s.length})`));
    } else {
        svg.append(sv('text', { x: 6, y: 92, 'font-size': 10, 'font-style': 'italic', fill: f.text }, 'no attack'));
    }
    // the move time, bottom right, white on blue
    if (s.move != null) {
        svg.append(sv('circle', { cx: 85, cy: 85, r: 11.5, fill: '#1f4fb4', stroke: '#0c2a6b', 'stroke-width': 1.2 }));
        svg.append(sv('text', { x: 85, y: 85, 'text-anchor': 'middle', dy: '.36em', 'font-size': 14, 'font-weight': 800, fill: '#fff' }, String(s.move)));
    }
    return svg;
}

// One face of a belonging, drawn like a counter: the picture, a ribbon naming the face, the main figure (harm and time, toughness, strength and moves)
// at the bottom left, and a second figure in a circle at the bottom right. `dim` marks a face that is not the one showing now.
export function itemFace({ name, picture = null, face, big = '', stars = 0, circle = null, circleTone = 'blue', corner = null, current = false, size = 108 }) {
    const f = current ? FACE.light : { fill: '#d8cfb4', edge: '#6b5d3a', text: '#1d1a12', stat: '#8a4a12' };
    const svg = sv('svg', { viewBox: '0 0 100 100', width: size, height: size, class: `counter item${current ? ' now' : ''}`, role: 'img', 'aria-label': `${name}, ${face} side` });
    svg.append(sv('rect', { x: 1.5, y: 1.5, width: 97, height: 97, rx: 9, fill: f.fill, stroke: current ? '#c9a24a' : f.edge, 'stroke-width': current ? 4 : 3 }));
    if (picture) svg.append(sv('image', { href: picture, x: 17, y: 20, width: 66, height: 56, preserveAspectRatio: 'xMidYMid meet' }));
    svg.append(sv('rect', { x: 6, y: 6, width: 88, height: 15, rx: 5, fill: current ? '#2a2438' : '#4a4438' }));
    svg.append(sv('text', { x: 50, y: 13.5, 'text-anchor': 'middle', dy: '.36em', 'font-size': 9.5, 'font-weight': 700, fill: '#f4ecd6', 'letter-spacing': '.06em' }, face.toUpperCase()));
    if (big) {
        svg.append(sv('text', { x: 7, y: 93, 'font-size': 19, 'font-weight': 800, fill: f.stat }, big));
        const x0 = 9 + String(big).length * 11.5;
        for (let i = 0; i < stars; i++) svg.append(sv('polygon', { points: star(x0 + 5 + i * 11, 86, 5.5), fill: f.stat }));
    }
    if (corner) svg.append(sv('text', { x: 7, y: 76, 'font-size': 9.5, 'font-weight': 700, fill: f.text }, corner));
    if (circle != null) {
        svg.append(sv('circle', { cx: 85, cy: 85, r: 11.5, fill: circleTone === 'blue' ? '#1f4fb4' : '#8a2d2d', stroke: '#0c2a6b', 'stroke-width': 1.2 }));
        svg.append(sv('text', { x: 85, y: 85, 'text-anchor': 'middle', dy: '.36em', 'font-size': 13, 'font-weight': 800, fill: '#fff' }, String(circle)));
    }
    return svg;
}
