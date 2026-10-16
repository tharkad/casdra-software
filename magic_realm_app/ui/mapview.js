import { sv } from './dom.js';
import { EDGES, hexCenter, edgeDir, corners, worldEdge } from '../engine/hex.js';
import { layoutSide, chitSlotsFor } from '../engine/layout.js';
import { tileName } from '../engine/world.js';
import { layoutLabels, pillWidth, PILL_H } from './labels.js';

// The pannable, zoomable realm map. It draws whatever model it is given; it knows nothing about the rules.
// model = { tiles, placements, side, showHidden, discovered:Set(pathKeys), chitsByTile:{tile:[chit]}, dwellings:[{kind,at}], tokens:{clearing:[{k,label}]},
//           hero, selected, plan:[clearing...], targets:[clearing...], onTap(clearingId), onBackground() }

const S = 100;
const NUM_W = 17;            // room at the start of a clearing's pill for the circle with its number
const CHIT_R = 6.5;          // radius of a counter on the map; names sit beside it, never over it
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
            const before = view ? worldCentre() : null;
            size = [host.clientWidth || 360, host.clientHeight || 520];
            draw();
            if (refit || !view) { view = fit(); }
            else if (before) recentre(before);                      // the map may have grown or shrunk (the details drawer): keep what was in the middle there
            apply();
        },
        fit(animate = true) { go(fit(), animate); },
        relayout() { size = [host.clientWidth || size[0], host.clientHeight || size[1]]; },
        // Show these clearings together: the camera fits their bounding box (with room around it) in whatever space the map has just now.
        frame(ids, { animate = true, pad = 90, minK = 0.5, maxK = 1.8 } = {}) {
            const pts = ids.map(id => posOf.get(id)).filter(Boolean); if (!pts.length) return;
            size = [host.clientWidth || size[0], host.clientHeight || size[1]];
            const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
            const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
            const k = Math.max(minK, Math.min(maxK, size[0] / (maxX - minX), size[1] / (maxY - minY)));
            go({ k, x: size[0] / 2 - (minX + maxX) / 2 * k, y: size[1] / 2 - (minY + maxY) / 2 * k }, animate);
        },
        focus(clearingId, k, animate = true) {
            const p = posOf.get(clearingId); if (!p) return;
            size = [host.clientWidth || size[0], host.clientHeight || size[1]];
            const kk = k ?? Math.max(view?.k ?? 0, 1.5);
            go({ k: kk, x: size[0] / 2 - p[0] * kk, y: size[1] / 2 - p[1] * kk }, animate);
        },
    };
    const posOf = new Map();          // clearing id -> world position

    function draw() {
        posOf.clear();
        const { tiles, placements, side } = model;
        const g = sv('g', { class: 'world' });
        const top = sv('g', { class: 'top' });          // labels sit above every tile
        const og = sv('g', { class: 'labels' });         // in world coordinates: positions are decided across tiles
        const groups = [], obstacles = [], anchors = [], makeLabel = new Map();
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        const tileDefs = Object.fromEntries(tiles.map(t => [t.id, t]));
        for (const p of placements) {
            const side = p.side ?? model.side ?? 'normal';          // each tile shows its own side: an enchanted tile is turned over
            const tile = tileDefs[p.id], def = tile.sides[side], lay = layoutSide(tile, side);
            const [cx, cy] = hexCenter(p.q, p.r, S), a = p.rot * Math.PI / 3;
            minX = Math.min(minX, cx - S); maxX = Math.max(maxX, cx + S); minY = Math.min(minY, cy - S * .87); maxY = Math.max(maxY, cy + S * .87);
            const pos = Object.fromEntries(def.clearings.map(c => [c.n, rot(lay.pos[c.n], a).map(v => v * S)]));
            for (const c of def.clearings) posOf.set(p.id + c.n, [cx + pos[c.n][0], cy + pos[c.n][1]]);
            const tg = sv('g', { transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)})` });
            // a name belongs on its own tile: the hexagon, so a pill never reads as belonging to the clearing across the border
            const hexPoly = corners(S).map(([hx, hy]) => [cx + hx, cy + hy]);
            const insideTile = (px, py) => { let ins = false; for (let i = 0, j = hexPoly.length - 1; i < hexPoly.length; j = i++) { const [xi, yi] = hexPoly[i], [xj, yj] = hexPoly[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
            const picture = lay.art ? model.art?.tiles?.[tile.id]?.[side] : null;
            tg.append(sv('polygon', { class: 'hex', points: corners(S - (picture ? 0.5 : 1.5)).map(c => c.join(',')).join(' '), fill: GROUP[tile.group] }));
            // The original tile picture, turned with the tile. The roads, caves and numbers are all in it; we draw only what changes.
            if (picture) tg.append(sv('image', { href: picture, x: -S, y: -S * 0.866025, width: 2 * S, height: 1.732051 * S, transform: `rotate(${p.rot * 60})`, 'pointer-events': 'none' }));
            const paths = sv('g', { class: 'paths' });
            // A hidden path or secret passage that bends in the picture: a curve through the measured middle of the printed passage (a quadratic bend), else the straight line.
            const bendOf = (path, A, B) => {
                const m = model.pathMarks?.[tile.id]?.[side]?.[`${path.a}-${path.b}`]?.mid; if (!m) return null;
                const M = rot([m[0], m[1]], a).map(v => v * S), C = [2 * M[0] - (A[0] + B[0]) / 2, 2 * M[1] - (A[1] + B[1]) / 2];
                return { mid: M, d: `M${A[0].toFixed(1)} ${A[1].toFixed(1)} Q${C[0].toFixed(1)} ${C[1].toFixed(1)} ${B[0].toFixed(1)} ${B[1].toFixed(1)}` };
            };
            for (const path of def.paths) {
                // Hidden paths and secret passages are printed on the tile: they are always drawn, but faint and marked '?' until discovered.
                const known = path.kind === 'open' || path.kind === 'tunnel' || model.showHidden || model.discovered?.has(pk(p.id + path.a, p.id + path.b));
                const A = pos[path.a], B = pos[path.b], s = PATH[path.kind];
                if (picture) {
                    // the picture already shows every road; mark the hidden ones we have not found, and trace the ones we have
                    if (path.kind === 'open' || path.kind === 'tunnel') continue;
                    const bend = bendOf(path, A, B);
                    if (known) paths.append(bend ? sv('path', { d: bend.d, fill: 'none', stroke: s.stroke, 'stroke-width': 2, 'stroke-dasharray': '1.5 4', 'stroke-linecap': 'round', opacity: 0.9, class: 'found-path' })
                        : sv('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: s.stroke, 'stroke-width': 2, 'stroke-dasharray': '1.5 4', 'stroke-linecap': 'round', opacity: 0.9, class: 'found-path' }));
                    else {
                        const mx = bend ? bend.mid[0] : (A[0] + B[0]) / 2, my = bend ? bend.mid[1] : (A[1] + B[1]) / 2;
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
                const wx = cx + x, wy = cy + y;
                if (!c.up) {
                    // not yet known: a small counter with a question mark
                    og.append(sv('g', { class: 'chit down', transform: `translate(${wx.toFixed(1)} ${wy.toFixed(1)})` },
                        sv('circle', { r: CHIT_R, class: 'chitdisc' }), sv('text', { 'text-anchor': 'middle', dy: '.36em', class: 'chitglyph' }, '?')));
                    obstacles.push({ x: wx, y: wy, r: CHIT_R + 0.5 });
                    return;
                }
                // known: the glyph is part of the name, as for a sound in a clearing: one pill, on the chit's own clear spot
                const glyph = c.kind === 'sound' ? '\u266A' : c.kind === 'site' ? '\u25C6' : c.kind === 'warning' ? '!' : '\u2605';
                const text = `${glyph} ${label}`, id = `chit:${c.id ?? p.id + i}`;
                groups.push({ id, ax: wx, ay: wy, ar: 3, prio: 3, prefer: ['center', 'below', 'above', 'right', 'left'], inside: insideTile, boxes: [{ w: pillWidth(text), h: PILL_H }] });
                makeLabel.set(id, box => sv('g', { class: `pill chitpill ${c.kind ?? 'star'}`, transform: `translate(${box.x.toFixed(1)} ${box.y.toFixed(1)})`, 'pointer-events': 'none' },
                    sv('rect', { width: box.w, height: box.h, rx: 6 }), sv('text', { x: 4, y: box.h / 2, dy: '.35em' }, text)));
            });
            def.clearings.forEach(c => {
                const id = p.id + c.n, [x, y] = pos[c.n];
                const sel = model.selected === id, onPlan = model.plan?.includes(id), isTarget = model.targets?.includes(id);
                const ring = c.magic?.length ? MAGIC[c.magic[0]] : null;
                const cg = sv('g', { class: `clr${sel ? ' sel' : ''}${onPlan ? ' plan' : ''}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, 'data-clearing': id });
                cg.append(sv('circle', { r: 19, fill: 'transparent' }));
                if (onPlan) cg.append(sv('circle', { r: 17, class: 'planring' }));
                if (isTarget) cg.append(sv('circle', { r: 20, class: 'targetring' }));
                if (model.goingTo === id) cg.append(sv('circle', { r: 22, class: 'goingring' }));
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
                // things standing in this clearing, each with its name; where they go is decided by layoutLabels once every tile is known
                obstacles.push({ x: cx + x, y: cy + y, r: picture ? 10.5 : 13 });
                anchors.push({ id, x: cx + x, y: cy + y });
                const toks = model.tokens?.[id] ?? [];
                if (toks.length) {
                    const shown = toks.length > 5 ? [...toks.slice(0, 4), { k: 'more', label: `+${toks.length - 4}` }] : toks;
                    const gid = `clr:${id}`;
                    const prio = Math.min(...shown.map(t => ({ mon: 1, nat: 1, ally: 2, dwelling: 2, site: 3, sound: 3, more: 4 }[t.k] ?? 3)));
                    groups.push({ id: gid, own: id, kind: shown[0]?.k ?? 'site', ax: cx + x, ay: cy + y, ar: picture ? 10.5 : 13, prio, prefer: ['right', 'left'], inside: insideTile,
                        boxes: shown.map(t => ({ w: pillWidth(t.label, { img: !!t.img }) + NUM_W, h: t.img ? 17 : PILL_H })) });
                    makeLabel.set(gid, (box, i) => {
                        const t = shown[i], th = t.img ? 15 : 0;
                        // a circle with the clearing's number leads the pill, so a name that had to move still says where it belongs
                        return sv('g', { transform: `translate(${box.x.toFixed(1)} ${box.y.toFixed(1)})`, class: `pill ${t.k}${t.disc ? ' disc' : ''}`, 'data-clearing': id },
                            sv('rect', { width: box.w, height: box.h, rx: 6 }),
                            sv('circle', { cx: 8, cy: box.h / 2, r: 6, class: 'pillnum' }),
                            sv('text', { x: 8, y: box.h / 2, dy: '.35em', 'text-anchor': 'middle', class: 'pillnumtxt' }, String(c.n)),
                            t.img ? sv('rect', { x: NUM_W - 0.5, y: (box.h - 14) / 2, width: 14, height: 14, rx: 3, class: 'thumbbg' }) : null,
                            t.img ? sv('image', { href: t.img, x: NUM_W - 0.5, y: (box.h - 14) / 2, width: 14, height: 14, preserveAspectRatio: 'xMidYMid meet' }) : null,
                            sv('text', { x: NUM_W - 2 + th + 2, y: box.h / 2, dy: '.35em' }, t.label));
                    });
                }
            });
            g.append(tg);
        }
        // names last, once every counter and number is known: nothing may cover anything else
        const placed = layoutLabels(groups, obstacles, { anchors });
        const leaders = sv('g', { class: 'leaders', 'pointer-events': 'none' });
        const names = sv('g', { class: 'names', 'pointer-events': 'none' });
        for (const gr of groups) {
            const r = placed.get(gr.id), make = makeLabel.get(gr.id);
            r.boxes.forEach((box, i) => names.append(make(box, i)));
            if (r.leader) {
                const b = r.boxes[0];
                const tx = Math.max(b.x, Math.min(gr.ax, b.x + b.w)), ty = Math.max(b.y, Math.min(gr.ay, b.y + b.h));
                // a thin connector from the edge of the clearing's circle to the nearest pill, in that pill's colour
                const kind = gr.kind ?? 'site';
                const dx = tx - gr.ax, dy = ty - gr.ay, len = Math.hypot(dx, dy) || 1, k = Math.min(1, (gr.ar + 1) / len);
                leaders.append(sv('line', { x1: (gr.ax + dx * k).toFixed(1), y1: (gr.ay + dy * k).toFixed(1), x2: tx.toFixed(1), y2: ty.toFixed(1), class: `leader ${kind}` }));
            }
        }
        og.append(leaders, names);
        top.append(og);
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
    const worldCentre = () => [(size[0] / 2 - view.x) / view.k, (size[1] / 2 - view.y) / view.k];
    const recentre = c => { view = { k: view.k, x: size[0] / 2 - c[0] * view.k, y: size[1] / 2 - c[1] * view.k }; };
    // While the drawer slides, the map's box changes size every frame: keep the same point in the middle.
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
        if (!view || flight) { size = [host.clientWidth || size[0], host.clientHeight || size[1]]; return; }
        const c = worldCentre(); size = [host.clientWidth || size[0], host.clientHeight || size[1]]; recentre(c); apply();
    }).observe(host);
    // The camera glides to a new view: the centre of the screen travels in a straight line over the map while the zoom changes smoothly (geometrically,
    // so a zoom out and a zoom in feel alike). A touch, a drag or the wheel takes the camera back at once. With reduced motion it simply jumps.
    let flight = null;
    const stopFlight = () => { if (flight) { cancelAnimationFrame(flight); flight = null; } };
    function go(to, animate = true) {
        stopFlight();
        const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!animate || reduce || !view) { view = to; apply(); return; }
        const [w, h] = size, from = { ...view };
        const world = v => [(w / 2 - v.x) / v.k, (h / 2 - v.y) / v.k];
        const [fx, fy] = world(from), [tx, ty] = world(to);
        const dist = Math.hypot(tx - fx, ty - fy) * Math.max(from.k, to.k), zoom = Math.abs(Math.log(to.k / from.k));
        const ms = Math.min(650, 260 + dist * 0.35 + zoom * 180);
        const t0 = performance.now();
        const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const step = now => {
            const u = Math.min(1, (now - t0) / ms), e = ease(u);
            const k = from.k * Math.pow(to.k / from.k, e), cx = fx + (tx - fx) * e, cy = fy + (ty - fy) * e;
            view = { k, x: w / 2 - cx * k, y: h / 2 - cy * k }; apply();
            flight = u < 1 ? requestAnimationFrame(step) : null;
            if (u >= 1) { view = to; apply(); }
        };
        flight = requestAnimationFrame(step);
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
    svg.addEventListener('pointerdown', e => { stopFlight(); pts.set(e.pointerId, [e.clientX, e.clientY]); down.set(e.pointerId, [e.clientX, e.clientY]); last = null; moved = false; });
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
    svg.addEventListener('wheel', e => { stopFlight(); e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    svg.addEventListener('click', e => {
        if (moved) { moved = false; return; }
        const g = e.target.closest?.('[data-clearing]');
        if (g) { e.stopPropagation(); model?.onTap?.(g.getAttribute('data-clearing')); }
        else model?.onBackground?.();
    });
    return api;
}
