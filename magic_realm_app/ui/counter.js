import { sv } from './dom.js';

// A monster counter drawn the way the game's own counters read: the picture, its name, the vulnerability in a circle (grey when armored), Fame
// and Notoriety, the attack (harm letter, attack time, stars, and the weapon length in brackets) at the bottom left, and the move time in a blue
// circle at the bottom right. Light side on a pale face, dark side on a dark one, red side (Tremendous monsters) on red.
// `s` is what combat.denSide() returns for the side being shown, so the counter and the rules cannot disagree.

const FACE = {
    light: { fill: '#f1e9d0', edge: '#6b5d3a', text: '#1d1a12', stat: '#b8560f' },
    dark: { fill: '#9c9276', edge: '#3a3322', text: '#14120c', stat: '#ff7a00' },
    red: { fill: '#c9533f', edge: '#4b1a12', text: '#fff6ec', stat: '#ffe08a' },
};
const star = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); }
    return pts.join(' ');
};

export function monsterCounter({ s, side = 'light', picture = null, flies = false, size = 92, label = null }) {
    const f = FACE[side] ?? FACE.light;
    const svg = sv('svg', { viewBox: '0 0 100 100', width: size, height: size, class: `counter ${side}`, role: 'img', 'aria-label': label ?? `${s.name}, ${side} side` });
    svg.append(sv('rect', { x: 1.5, y: 1.5, width: 97, height: 97, rx: 9, fill: f.fill, stroke: f.edge, 'stroke-width': 3 }));
    if (picture) svg.append(sv('image', { href: picture, x: 15, y: 16, width: 70, height: 66, preserveAspectRatio: 'xMidYMid meet' }));
    // name, small italic, top left
    const name = s.name;
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
    if (s.attack !== 'none' && s.harm) {
        const red = side === 'red';
        const txt = red ? s.harm : `${s.harm}${s.atk ?? ''}`;
        svg.append(sv('text', { x: 6, y: 93, 'font-size': 19, 'font-weight': 800, fill: f.stat, stroke: red ? 'none' : '#00000022', 'stroke-width': 0.4 }, txt));
        let x = 8 + txt.length * 11.5;
        if (red && s.atk != null) {
            svg.append(sv('circle', { cx: x + 6, cy: 87, r: 9, fill: 'none', stroke: f.stat, 'stroke-width': 2 }));
            svg.append(sv('text', { x: x + 6, y: 87, 'text-anchor': 'middle', dy: '.36em', 'font-size': 12, 'font-weight': 800, fill: f.stat }, String(s.atk)));
            x += 22;
        }
        for (let i = 0; i < (s.stars || 0); i++) { svg.append(sv('polygon', { points: star(x + 5 + i * 11, 86, 5.5), fill: f.stat })); }
        if (s.length) svg.append(sv('text', { x: 6, y: 77, 'font-size': 9.5, 'font-weight': 700, fill: f.stat }, `(${s.length})`));
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
