import { sv } from './dom.js';
import { EDGES, hexCenter, edgeDir, corners, worldEdge } from '../engine/hex.js';
import { layoutSide, chitSlotsFor } from '../engine/layout.js';
import { tileName } from '../engine/world.js';

// The pannable, zoomable realm map. It draws whatever model it is given; it knows nothing about the rules.
// model = { tiles, placements, side, showHidden, discovered:Set(pathKeys), chitsByTile:{tile:[chit]}, dwellings:[{kind,at}], tokens:{clearing:[{k,label}]},
//           hero, selected, plan:[clearing...], onTap(clearingId), onBackground() }

const S = 100;
const GROUP = { valley: '#26382f', woods: '#1f3a2a', mountain: '#3a3530', cave: '#2c2a3a' };
const CLEARING = { woods: '#3f7a52', mountain: '#8d7a62', cave: '#5a4f7a' };
const MAGIC = { grey: '#aeb4bd', gold: '#e8c868', purple: '#b08cf0' };
const PATH = { open: { stroke: '#d8cba8', w: 2.4 }, tunnel: { stroke: '#9a8fb8', w: 2.4, dash: '6 4' }, hidden: { stroke: '#c58a4a', w: 2.2, dash: '1.5 4' }, secret: { stroke: '#8fd0c8', w: 2.2, dash: '1.5 4' } };
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const pk = (a, b) => (a < b ? `${a}~${b}` : `${b}~${a}`);

export function mountMap(host) {
    const svg = sv('svg', { class: 'realm-svg', width: '100%', height: '100%' });
    host.append(svg);
    let model = null, view = null, size = [360, 520], bounds = null, moved = false;

    const api = {
        el: svg,
        set(m, { refit = false } = {}) {
            model = m;
            size = [host.clientWidth || 360, host.clientHeight || 520];
            draw();
            if (refit || !view) { view = fit(); }
            apply();
        },
        fit() { view = fit(); apply(); },
        relayout() { size = [host.clientWidth || size[0], host.clientHeight || size[1]]; },
        focus(clearingId, k) {
            const p = posOf.get(clearingId); if (!p) return;
            size = [host.clientWidth || size[0], host.clientHeight || size[1]];
            const kk = k ?? Math.max(view?.k ?? 0, 1.5);
            view = { k: kk, x: size[0] / 2 - p[0] * kk, y: size[1] / 2 - p[1] * kk }; apply();
        },
    };
    const posOf = new Map();          // clearing id -> world position

    function draw() {
        posOf.clear();
        const { tiles, placements, side } = model;
        const g = sv('g', { class: 'world' });
        const top = sv('g', { class: 'top' });          // labels sit above every tile
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        const tileDefs = Object.fromEntries(tiles.map(t => [t.id, t]));
        for (const p of placements) {
            const tile = tileDefs[p.id], def = tile.sides[side], lay = layoutSide(tile, side);
            const [cx, cy] = hexCenter(p.q, p.r, S), a = p.rot * Math.PI / 3;
            minX = Math.min(minX, cx - S); maxX = Math.max(maxX, cx + S); minY = Math.min(minY, cy - S * .87); maxY = Math.max(maxY, cy + S * .87);
            const pos = Object.fromEntries(def.clearings.map(c => [c.n, rot(lay.pos[c.n], a).map(v => v * S)]));
            for (const c of def.clearings) posOf.set(p.id + c.n, [cx + pos[c.n][0], cy + pos[c.n][1]]);
            const tg = sv('g', { transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)})` });
            const og = sv('g', { transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)})` });
            const picture = lay.art ? model.art?.tiles?.[tile.id]?.[side] : null;
            tg.append(sv('polygon', { class: 'hex', points: corners(S - (picture ? 0.5 : 1.5)).map(c => c.join(',')).join(' '), fill: GROUP[tile.group] }));
            // The original tile picture, turned with the tile. The roads, caves and numbers are all in it; we draw only what changes.
            if (picture) tg.append(sv('image', { href: picture, x: -S, y: -S * 0.866025, width: 2 * S, height: 1.732051 * S, transform: `rotate(${p.rot * 60})`, 'pointer-events': 'none' }));
            const paths = sv('g', { class: 'paths' });
            for (const path of def.paths) {
                // Hidden paths and secret passages are printed on the tile: they are always drawn, but faint and marked '?' until discovered.
                const known = path.kind === 'open' || path.kind === 'tunnel' || model.showHidden || model.discovered?.has(pk(p.id + path.a, p.id + path.b));
                const A = pos[path.a], B = pos[path.b], s = PATH[path.kind];
                if (picture) {
                    // the picture already shows every road; mark the hidden ones we have not found, and trace the ones we have
                    if (path.kind === 'open' || path.kind === 'tunnel') continue;
                    if (known) paths.append(sv('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: s.stroke, 'stroke-width': 2, 'stroke-dasharray': '1.5 4', 'stroke-linecap': 'round', opacity: 0.9, class: 'found-path' }));
                    else {
                        const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
                        paths.append(sv('g', { class: 'undisc-mark', transform: `translate(${mx.toFixed(1)} ${my.toFixed(1)})` },
                            sv('circle', { r: 6.5, stroke: s.stroke }), sv('text', { 'text-anchor': 'middle', dy: '.35em' }, '?')));
                    }
                    continue;
                }
                paths.append(sv('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: s.stroke, 'stroke-width': known ? s.w : 2, 'stroke-dasharray': known ? (s.dash ?? null) : '2 5',
                    'stroke-linecap': 'round', opacity: known ? 1 : 0.55, class: known ? '' : 'undisc' }));
                if (!known) {
                    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
                    paths.append(sv('g', { class: 'undisc-mark', transform: `translate(${mx.toFixed(1)} ${my.toFixed(1)})` },
                        sv('circle', { r: 6.5, stroke: s.stroke }), sv('text', { 'text-anchor': 'middle', dy: '.35em' }, '?')));
                }
            }
            if (!picture) EDGES.forEach((name, le) => {
                const n = def.edges[name];
                if (n == null) return;
                const [dx, dy] = edgeDir(worldEdge(le, p.rot)), A = pos[n];
                paths.append(sv('line', { x1: A[0], y1: A[1], x2: dx * S * .866, y2: dy * S * .866, stroke: '#d8cba8', 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
            });
            tg.append(paths);
            if (!picture) tg.append(sv('text', { class: 'tname', y: S * .8, 'text-anchor': 'middle' }, tileName(p.id).toUpperCase()));
            // chits lying in the forest: a counter on a clear spot of the picture, with its name once it is known and '?' while it is not
            const slots = picture ? chitSlotsFor(p.id, side) : null;
            (model.chitsByTile?.[p.id] ?? []).forEach((c, i) => {
                const label = c.up ? c.name : '?';
                let x, y;
                if (slots?.length) { const s0 = slots[(c.slot ?? i) % slots.length]; [x, y] = rot(s0, a).map(v => v * S); }
                else { x = 0; y = (-0.74 + i * 0.13) * S; }
                const w = Math.max(18, label.length * 6.2 + 10);
                const glyph = c.up ? (c.kind === 'sound' ? '\u266A' : c.kind === 'site' ? '\u25C6' : c.kind === 'warning' ? '!' : '\u2605') : '?';
                const g2 = sv('g', { class: `chit ${c.up ? 'up' : 'down'} ${c.kind ?? ''}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
                    sv('circle', { r: 8.5, class: 'chitdisc' }), sv('text', { 'text-anchor': 'middle', dy: '.36em', class: 'chitglyph' }, glyph));
                if (c.up) g2.append(sv('g', { class: 'nm', transform: 'translate(0 17)' }, sv('rect', { x: -w / 2, y: -7.5, width: w, height: 15, rx: 5, class: 'chitbox' }), sv('text', { 'text-anchor': 'middle', dy: '.35em' }, label)));
                og.append(g2);
            });
            def.clearings.forEach(c => {
                const id = p.id + c.n, [x, y] = pos[c.n];
                const sel = model.selected === id, onPlan = model.plan?.includes(id);
                const ring = c.magic?.length ? MAGIC[c.magic[0]] : null;
                const cg = sv('g', { class: `clr${sel ? ' sel' : ''}${onPlan ? ' plan' : ''}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, 'data-clearing': id });
                cg.append(sv('circle', { r: 19, fill: 'transparent' }));
                if (onPlan) cg.append(sv('circle', { r: 17, class: 'planring' }));
                if (picture) {
                    // an upright number over the printed one, so it reads whichever way the tile is turned
                    cg.append(sv('circle', { r: 9, class: 'numbadge', fill: 'rgba(12,14,20,.82)', stroke: ring ?? 'rgba(255,255,255,.55)', 'stroke-width': ring ? 2.4 : 1 }));
                    cg.append(sv('text', { 'text-anchor': 'middle', dy: '.36em', class: 'num artnum' }, String(c.n)));
                } else {
                    cg.append(sv('circle', { r: 11.5, fill: CLEARING[c.type], stroke: ring ?? '#0c0e14', 'stroke-width': ring ? 3 : 1.5 }));
                    cg.append(sv('text', { 'text-anchor': 'middle', dy: '.35em', class: 'num' }, String(c.n)));
                }
                // where he stands: a dotted ring drawn just above the tile picture and under every number, label and chit
                if (model.hero === id) tg.append(sv('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 24, class: `youring${model.heroHidden ? ' hid' : ''}`, 'pointer-events': 'none' }));
                tg.append(cg);
                // things standing in this clearing, each with its name
                const toks = model.tokens?.[id] ?? [];
                toks.slice(0, 5).forEach((t, i) => {
                    const th = t.img ? 15 : 0, w = t.label.length * 6.1 + 10 + th, tx = x + 16, ty = y - 9 + i * (t.img ? 18 : 15);
                    og.append(sv('g', { transform: `translate(${tx.toFixed(1)} ${ty.toFixed(1)})`, class: `pill ${t.k}`, 'pointer-events': 'none' },
                        sv('rect', { x: 0, y: -8.5, width: w, height: 17, rx: 6 }),
                        t.img ? sv('rect', { x: 1.5, y: -7, width: 14, height: 14, rx: 3, class: 'thumbbg' }) : null,
                        t.img ? sv('image', { href: t.img, x: 1.5, y: -7, width: 14, height: 14, preserveAspectRatio: 'xMidYMid meet' }) : null,
                        sv('text', { x: 5 + th, dy: '.35em' }, t.label)));
                });
            });
            g.append(tg);
            top.append(og);
        }
        g.append(top);
        bounds = { minX, minY, maxX, maxY };
        svg.replaceChildren(g);
    }

    function fit() {
        size = [host.clientWidth || size[0], host.clientHeight || size[1]];
        const [w, h] = size, bw = bounds.maxX - bounds.minX + 40, bh = bounds.maxY - bounds.minY + 40;
        const k = Math.min(w / bw, h / bh);
        return { k, x: w / 2 - (bounds.minX + bounds.maxX) / 2 * k, y: h / 2 - (bounds.minY + bounds.maxY) / 2 * k };
    }
    function apply() {
        const g = svg.querySelector('.world');
        if (g) g.setAttribute('transform', `translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(4)})`);
        svg.classList.toggle('zoomed', view.k >= 1.1);
    }
    function zoomAt(px, py, f, dx = 0, dy = 0) {
        const k = Math.min(6, Math.max(0.2, view.k * f)), real = k / view.k;
        view.x = px - (px - view.x) * real + dx; view.y = py - (py - view.y) * real + dy; view.k = k;
        apply();
    }

    // taps and drags
    const pts = new Map(), down = new Map(); let last = null;
    svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); down.set(e.pointerId, [e.clientX, e.clientY]); last = null; moved = false; });
    svg.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
        const d0 = down.get(e.pointerId);
        if (d0 && Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 6) { svg.setPointerCapture(e.pointerId); down.delete(e.pointerId); moved = true; }
        if (down.has(e.pointerId)) return;
        if (pts.size === 1) { view.x += e.clientX - prev[0]; view.y += e.clientY - prev[1]; apply(); }
        else if (pts.size === 2) {
            const r = svg.getBoundingClientRect(), [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top];
            if (last) zoomAt(mid[0], mid[1], d / last.d, mid[0] - last.mid[0], mid[1] - last.mid[1]);
            last = { d, mid };
        }
    });
    const up = e => { pts.delete(e.pointerId); down.delete(e.pointerId); last = null; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    svg.addEventListener('click', e => {
        if (moved) { moved = false; return; }
        const g = e.target.closest?.('[data-clearing]');
        if (g) { e.stopPropagation(); model?.onTap?.(g.getAttribute('data-clearing')); }
        else model?.onBackground?.();
    });
    return api;
}
