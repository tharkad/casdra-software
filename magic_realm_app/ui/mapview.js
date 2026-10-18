import { sv } from './dom.js';
import { EDGES, hexCenter, edgeDir, corners, worldEdge } from '../engine/hex.js';
import { layoutSide, chitSlotsFor } from '../engine/layout.js';
import { tileName } from '../engine/world.js';
import { layoutLabels, pillWidth, PILL_H } from './labels.js';
import { shapeEl, fan, tagText } from './party.js';

// The pannable, zoomable realm map. It draws whatever model it is given; it knows nothing about the rules.
// model = { tiles, placements, side, showHidden, discovered:Set(pathKeys), chitsByTile:{tile:[chit]}, dwellings:[{kind,at}], tokens:{clearing:[{k,label}]},
//           hero, selected, plan:[clearing...], targets:[clearing...], targetsMaybe:[clearing...], onTap(clearingId), onBackground(),
//           party?:[marker] (a SHARED game: one counter per character, see party.js markers()), tagged?:id, onMarker?(id) }

const S = 100;
const NUM_W = 17;            // room at the start of a clearing's pill for the circle with its number
const CHIT_R = 6.5;          // radius of a counter on the map; names sit beside it, never over it
const GROUP = { valley: '#26382f', woods: '#1f3a2a', mountain: '#3a3530', cave: '#2c2a3a' };
const CLEARING = { woods: '#3f7a52', mountain: '#8d7a62', cave: '#5a4f7a' };
const MAGIC = { grey: '#aeb4bd', gold: '#e8c868', purple: '#b08cf0' };
const PATH = { open: { stroke: '#d8cba8', w: 2.4 }, tunnel: { stroke: '#9a8fb8', w: 2.4, dash: '6 4' }, hidden: { stroke: '#c58a4a', w: 2.2, dash: '1.5 4' }, secret: { stroke: '#8fd0c8', w: 2.2, dash: '1.5 4' } };
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const pk = (a, b) => (a < b ? `${a}~${b}` : `${b}~${a}`);

// A badge's chips: monsters, natives and companions carry a small picture (claw marks, a figure) so that what is in the clearing reads at a glance; a count follows when there is more than one.
const ICON_KINDS = new Set(['mon', 'nat', 'ally']);
const segW = sg => (ICON_KINDS.has(sg.k) && sg.n > 1 ? 21 : 13);
function chipIcon(kind) {
    if (kind === 'mon') return sv('g', { class: 'bicon claw' }, ...[[3, 9.5, 5, 2.5], [5.6, 9.5, 7.6, 2.5], [8.2, 9.5, 10.2, 2.5]].map(([x1, y1, x2, y2]) => sv('line', { x1, y1, x2, y2 })));
    return sv('g', { class: 'bicon person' }, sv('circle', { cx: 6, cy: 3.9, r: 1.9 }), sv('path', { d: 'M2.4 10.2 Q2.4 6.3 6 6.3 Q9.6 6.3 9.6 10.2 Z' }));
}
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
        // follow someone else: glide to a clearing at the zoom the player already has (never zooms, never jumps)
        pan(clearingId, animate = true) {
            const p = posOf.get(clearingId); if (!p || !view) return;
            size = [host.clientWidth || size[0], host.clientHeight || size[1]];
            go({ k: view.k, x: size[0] / 2 - p[0] * view.k, y: size[1] / 2 - p[1] * view.k }, animate);
        },
        /** Is this clearing inside the part of the map the player is looking at? */
        visible(clearingId, margin = 30) {
            const p = posOf.get(clearingId); if (!p || !view) return false;
            const x = p[0] * view.k + view.x, y = p[1] * view.k + view.y;
            return x > margin && y > margin && x < size[0] - margin && y < size[1] - margin;
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
        const groups = [], obstacles = [], anchors = [], makeLabel = new Map(), badgeOf = new Map();
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        const tileDefs = Object.fromEntries(tiles.map(t => [t.id, t])), tileCentre = new Map();
        for (const p of placements) {
            const side = p.side ?? model.side ?? 'normal';          // each tile shows its own side: an enchanted tile is turned over
            const tile = tileDefs[p.id], def = tile.sides[side], lay = layoutSide(tile, side);
            const [cx, cy] = hexCenter(p.q, p.r, S), a = p.rot * Math.PI / 3;
            tileCentre.set(p.id, [cx, cy]);
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
                badgeOf.set(id, { segs: [{ k: c.kind === 'sound' ? 'sound' : c.kind === 'site' ? 'site' : c.kind === 'warning' ? 'warn' : 'star', glyph: glyph }], id: null, boxes: [{ w: 16, h: 12 }] });
                makeLabel.set(id, box => sv('g', { class: `pill chitpill ${c.kind ?? 'star'}`, transform: `translate(${box.x.toFixed(1)} ${box.y.toFixed(1)})`, 'pointer-events': 'none' },
                    sv('rect', { width: box.w, height: box.h, rx: 6 }), sv('text', { x: 4, y: box.h / 2, dy: '.35em' }, text)));
            });
            def.clearings.forEach(c => {
                const id = p.id + c.n, [x, y] = pos[c.n];
                const sel = model.selected === id, onPlan = model.plan?.includes(id), isTarget = model.targets?.includes(id), isMaybe = model.targetsMaybe?.includes(id);
                const ring = c.magic?.length ? MAGIC[c.magic[0]] : null;
                const cg = sv('g', { class: `clr${sel ? ' sel' : ''}${onPlan ? ' plan' : ''}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, 'data-clearing': id });
                cg.append(sv('circle', { r: 19, fill: 'transparent' }));
                if (onPlan) cg.append(sv('circle', { r: 17, class: 'planring' }));
                const dangerHere = (isTarget || isMaybe) && (model.tokens?.[id] ?? []).some(t => t.k === 'mon');          // monsters there: they block you at the end of the phase unless you are hidden
                if (isTarget) cg.append(sv('circle', { r: 20, class: `targetring${dangerHere ? ' danger' : ''}` }));
                else if (isMaybe) cg.append(sv('circle', { r: 20, class: 'targetring maybe' }));
                if (dangerHere) cg.append(sv('g', { class: 'dangermark', transform: 'translate(13 -17)', 'pointer-events': 'none' }, sv('circle', { r: 6.5 }), ...[[-3, 3.5, -1.2, -3.5], [-0.2, 3.5, 1.8, -3.5], [2.6, 3.5, 4.6, -3.5]].map(([x1, y1, x2, y2]) => sv('line', { x1: x1 - 0.5, y1, x2: x2 - 0.5, y2 }))));          // a hidden path a Search earlier in the plan may find
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
                if (model.hero === id && !model.party?.length) tg.append(sv('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 24, class: `youring${model.heroHidden ? ' hid' : ''}`, 'pointer-events': 'none' }));
                tg.append(cg);
                // things standing in this clearing, each with its name; where they go is decided by layoutLabels once every tile is known
                obstacles.push({ x: cx + x, y: cy + y, r: picture ? 10.5 : 13 });
                anchors.push({ id, x: cx + x, y: cy + y });
                const toks = model.tokens?.[id] ?? [];
                if (toks.length) {
                    const shown = toks.length > 5 ? [...toks.slice(0, 4), { k: 'more', label: `+${toks.length - 4}` }] : toks;
                    const gid = `clr:${id}`;
                    const prio = Math.min(...shown.map(t => ({ mon: 1, nat: 1, ally: 2, dwelling: 2, site: 3, sound: 3, more: 4 }[t.k] ?? 3)));
                    // when the names will not fit around the clearing they give way to one small marker: a coloured chip for each kind of thing that is there,
                    // with its number, and a dotted end that says "tap the clearing to see everything"
                    const KS = ['mon', 'nat', 'ally', 'dwelling', 'site', 'sound'], count = t => Number(/x(\d+)$/.exec(t.label)?.[1] ?? 1);
                    const segs = KS.map(k => { const ts = toks.filter(t => t.k === k); return ts.length ? { k, n: ts.reduce((n, t) => n + count(t), 0) } : null; }).filter(Boolean);
                                    badgeOf.set(gid, { segs, id, num: c.n, boxes: [{ w: 14 + segs.reduce((w, sg) => w + segW(sg), 0) + 3, h: 12 }] });
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

        // ---- the players of a shared game: one counter each, standing on their clearing (fanned out when several share it), on the road's middle, or over their tile ----
        // They are drawn above the tiles and under the names, and they are obstacles for the names: no pill is ever laid over a counter.
        const markerLayer = sv('g', { class: 'party' }), tagLayer = sv('g', { class: 'ptag', 'pointer-events': 'none' });
        {
            const at = new Map(), place = new Map();
            const posFor = m => {
                if (m.at && posOf.has(m.at)) return { key: m.at, p: posOf.get(m.at), anchored: true };
                if (m.road && posOf.has(m.road.from) && posOf.has(m.road.to)) { const a = posOf.get(m.road.from), b = posOf.get(m.road.to); return { key: `road:${m.road.from}~${m.road.to}`, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], anchored: false }; }
                if (m.air && tileCentre.has(m.air)) return { key: `air:${m.air}`, p: tileCentre.get(m.air), anchored: false };
                return null;
            };
            for (const m of model.party ?? []) { const q = posFor(m); if (!q) continue; (at.get(q.key) ?? at.set(q.key, { q, list: [] }).get(q.key)).list.push(m); }
            for (const { q, list } of at.values()) {
                // the viewer's own counter first, so it takes the middle of the fan when there is a choice
                list.sort((x, y) => (y.mine ? 1 : 0) - (x.mine ? 1 : 0) || (x.letter < y.letter ? -1 : 1));
                const R = list.some(m => m.mine) ? 8.5 : 7;
                const spots = q.anchored ? fan(list.length, R, model.art?.tiles ? 24 : 25) : list.map((_, i) => ({ dx: (i - (list.length - 1) / 2) * (R * 2 + 3), dy: 0 }));
                // the viewer's counter at the centre-bottom of an odd fan, the others around it
                const order = list.length === 3 ? [1, 0, 2] : list.length === 2 ? [0, 1] : list.map((_, i) => i);
                list.forEach((m, i) => place.set(m.id, { x: q.p[0] + spots[order[i]].dx, y: q.p[1] + spots[order[i]].dy, r: m.mine ? 8.5 : 7 }));
            }
            for (const m of model.party ?? []) {
                const pl = place.get(m.id); if (!pl) continue;
                const sh = shapeEl(m.shape, pl.r);
                const body = sv(sh.tag, { ...Object.fromEntries(Object.entries(sh.attrs).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])), class: 'pc-shape', fill: m.hidden || m.dead ? 'rgba(12,14,20,.55)' : m.color, stroke: m.dead ? '#8b8f9a' : m.color,
                    'stroke-width': m.hidden ? 1.8 : 1.2, 'stroke-dasharray': m.hidden ? '2.2 2' : null });
                const g = sv('g', { class: `pc${m.mine ? ' me' : ''}${m.hidden ? ' hid' : ''}${m.dead ? ' dead' : ''}${m.active ? ' active' : ''}${m.away ? ' away' : ''}`, transform: `translate(${pl.x.toFixed(1)} ${pl.y.toFixed(1)})`, 'data-marker': m.id, 'data-player': m.name, 'aria-label': tagText(m), 'pointer-events': 'all' },
                    sv('circle', { r: pl.r + 6, fill: 'transparent', class: 'pc-hit' }),
                    m.active ? sv('circle', { r: pl.r + 4, class: 'pc-pulse' }) : null,
                    m.mine ? sv('circle', { r: pl.r + 2.6, class: 'pc-me' }) : null,
                    body,
                    sv('text', { class: 'pc-letter', 'text-anchor': 'middle', dy: '.36em', 'font-size': pl.r * 1.25, fill: m.hidden || m.dead ? m.color : '#14161e' }, m.dead ? '×' : m.letter));
                markerLayer.append(g);
                obstacles.push({ x: pl.x, y: pl.y, r: pl.r + 2.5 });
                if (model.tagged === m.id) {
                    const text = tagText(m), w = pillWidth(text) + 6, hgt = PILL_H + 3;
                    tagLayer.append(sv('g', { class: 'tag', transform: `translate(${(pl.x - w / 2).toFixed(1)} ${(pl.y - pl.r - hgt - 5).toFixed(1)})` },
                        sv('rect', { width: w, height: hgt, rx: 6 }), sv('text', { x: w / 2, y: hgt / 2, dy: '.35em', 'text-anchor': 'middle' }, text),
                        sv('path', { d: `M${w / 2 - 4} ${hgt} L${w / 2} ${hgt + 4} L${w / 2 + 4} ${hgt}`, class: 'tagtip' })));
                }
            }
        }
        // names last, once every counter and number is known: nothing may cover anything else
        // Every clearing's things are named beside it; where they do not fit close by, that clearing gives way to a small marker (chips by kind, tap to open).
        // Start with all names at full size, and while some collide, overflow their tile or have to be tethered, turn the worst crowds into markers.
        const demoted = new Set();
        const asBadge = g0 => ({ ...g0, boxes: badgeOf.get(g0.id).boxes, prefer: ['right', 'left', 'below', 'above'], prio: 1 });
        // only when the names truly cannot sit by their clearing: they collide, spill off their tile, or would have to stand well away from it. (A name that sits close
        // but nearer another clearing keeps its place and gets a thin line to its own.)
        const bad = r => r.overlap > 0 || (r.outside ?? 0) >= 3 || r.ring >= 18;       // (a ring is 5 units: eighteen is some ninety units from the clearing)
        let placed = null;
        for (let guard = 0; guard < 40; guard++) {
            placed = layoutLabels(groups.map(g0 => (demoted.has(g0.id) ? asBadge(g0) : g0)), obstacles, { anchors });
            if (guard === 0) window.__labelFirst = Object.fromEntries(groups.filter(g0 => badgeOf.has(g0.id)).map(g0 => { const r = placed.get(g0.id); return [g0.id, { leader: r.leader, overlap: Math.round(r.overlap), outside: r.outside ?? 0, ring: r.ring, boxes: g0.boxes.length }]; }));
            const failing = groups.filter(g0 => badgeOf.has(g0.id) && !demoted.has(g0.id) && bad(placed.get(g0.id)));
            if (!failing.length) break;
            failing.sort((a0, b0) => b0.boxes.length - a0.boxes.length || placed.get(b0.id).overlap - placed.get(a0.id).overlap);
            demoted.add(failing[0].id);
            for (const f of failing.slice(1)) if (placed.get(f.id).overlap > 0) demoted.add(f.id);       // a true collision goes at once
        }
        const labelScale = 1;
        const leaders = sv('g', { class: 'leaders', 'pointer-events': 'none' });
        const names = sv('g', { class: 'names', 'pointer-events': 'none' });
        for (const gr of groups) {
            const r = placed.get(gr.id);
            if (demoted.has(gr.id)) {
                const bd = badgeOf.get(gr.id), bx = r.boxes[0];
                const el = sv('g', { class: 'badge', transform: `translate(${bx.x.toFixed(1)} ${bx.y.toFixed(1)})`, ...(bd.id ? { 'data-clearing': bd.id, 'pointer-events': 'all' } : {}) },
                    sv('rect', { class: 'bframe', x: -0.5, y: -0.5, width: bx.w + 1, height: bx.h + 1, rx: 4 }),
                    bd.num != null ? sv('circle', { cx: 8, cy: 6, r: 5.5, class: 'pillnum' }) : null,
                    bd.num != null ? sv('text', { x: 8, y: 6, dy: '.35em', 'text-anchor': 'middle', class: 'pillnumtxt' }, String(bd.num)) : null,
                    ...(() => { let ox = bd.num != null ? 15 : 1.5; return bd.segs.map(sg => { const w = segW(sg), g = sv('g', { class: `bseg ${sg.k}`, transform: `translate(${ox} 0)` },
                        sv('rect', { x: 0, y: 0, width: w - 1, height: 12, rx: 3 }),
                        ICON_KINDS.has(sg.k) ? chipIcon(sg.k) : null,
                        ICON_KINDS.has(sg.k) ? (sg.n > 1 ? sv('text', { x: 15.5, y: 6, dy: '.35em', 'text-anchor': 'middle' }, String(sg.n)) : null)
                            : sv('text', { x: 6, y: 6, dy: '.35em', 'text-anchor': 'middle' }, sg.glyph ? sg.glyph : sg.k === 'dwelling' ? '\u2302' : sg.k === 'site' ? '\u25C6' : sg.k === 'sound' ? '\u266A' : String(sg.n))); ox += w; return g; }); })());
                names.append(el);
                if (r.leader) leaders.append(sv('line', { x1: gr.ax.toFixed(1), y1: gr.ay.toFixed(1), x2: (bx.x + bx.w / 2).toFixed(1), y2: (bx.y + bx.h / 2).toFixed(1), class: `leader ${gr.kind ?? 'site'}` }));
                continue;
            }
            const make = makeLabel.get(gr.id);
            r.boxes.forEach((box, i) => {
                // drawn at its own size and scaled down as a whole, so the text and the number circle shrink with the pill
                const el = make({ x: box.x, y: box.y, w: box.w / labelScale, h: box.h / labelScale }, i);
                if (labelScale !== 1) el.setAttribute('transform', `${el.getAttribute('transform')} scale(${labelScale})`);
                names.append(el);
            });
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
        top.append(markerLayer, og, tagLayer);
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
        const [w0, h0] = size, from = { ...view };
        const world = (v, w, h) => [(w / 2 - v.x) / v.k, (h / 2 - v.y) / v.k];
        const [fx, fy] = world(from, w0, h0), [tx, ty] = world(to, w0, h0);
        const dist = Math.hypot(tx - fx, ty - fy) * Math.max(from.k, to.k), zoom = Math.abs(Math.log(to.k / from.k));
        const ms = Math.min(650, 260 + dist * 0.35 + zoom * 180);
        const t0 = performance.now();
        const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        // the map's box may change size while the camera flies (the drawer opens or closes): the target is a point of the world, so it is kept in the middle of whatever size the map has now
        const step = now => {
            const [w, h] = size;
            const u = Math.min(1, (now - t0) / ms), e = ease(u);
            const k = from.k * Math.pow(to.k / from.k, e), cx = fx + (tx - fx) * e, cy = fy + (ty - fy) * e;
            view = { k, x: w / 2 - cx * k, y: h / 2 - cy * k }; apply();
            flight = u < 1 ? requestAnimationFrame(step) : null;
            if (u >= 1) { view = { k: to.k, x: w / 2 - tx * to.k, y: h / 2 - ty * to.k }; apply(); }
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
        const mk = e.target.closest?.('[data-marker]');
        if (mk && model?.onMarker) { e.stopPropagation(); model.onMarker(mk.getAttribute('data-marker')); return; }
        const g = e.target.closest?.('[data-clearing]');
        if (g) { e.stopPropagation(); model?.onTap?.(g.getAttribute('data-clearing')); }
        else model?.onBackground?.();
    });
    return api;
}
