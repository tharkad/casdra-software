import { h, sv } from './dom.js';
import { EDGES, hexCenter, edgeDir, corners, worldEdge } from '../engine/hex.js';
import { layoutSide, chitSlotsFor } from '../engine/layout.js';
import { tileName } from '../engine/world.js';
import { layoutLabels, pillWidth, PILL_H } from './labels.js';
import { shapeEl, fan, tagText } from './party.js';

// The pannable, zoomable realm map. It draws whatever model it is given; it knows nothing about the rules.
// model = { tiles, placements, side, showHidden, discovered:Set(pathKeys), chitsByTile:{tile:[chit]}, dwellings:[{kind,at}], tokens:{clearing:[{k,label}]},
//           hero, selected, plan:[clearing...], targets:[clearing...], targetsMaybe:[clearing...], onTap(clearingId), onBackground(),
//           party?:[marker] (a SHARED game: one counter per character, see party.js markers()), tagged?:id, onMarker?(id) }
// The overlay vocabulary (rings, route, pin) and the camera (focus with an inset) are the interface to the play screens: docs/design/redesign/MAP-API.md.

// Calm (Settings) and the system's reduced motion both stop the camera gliding (DR-2).
const calmMotion = () => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || (typeof document !== 'undefined' && document.documentElement.dataset.calm === 'on');
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
// A site's chip carries what the pill of a site carries: the gold edge and a tick when it is discovered, and a count when there are several.
const ICON_KINDS = new Set(['mon', 'nat', 'ally']);
const segW = (sg, lod = false) => (ICON_KINDS.has(sg.k) ? (sg.n > 1 ? (lod ? 18 : 21) : lod ? 12 : 13) : sg.k === 'site' ? (lod ? 12 : 13) + (sg.disc ? 4 : 0) + (sg.n > 1 ? 5 : 0) : lod ? 12 : 13);
const segText = sg => (sg.glyph ? sg.glyph : sg.k === 'dwelling' ? '⌂' : sg.k === 'site' ? `◆${sg.disc ? '✓' : ''}${sg.n > 1 ? sg.n : ''}` : sg.k === 'sound' ? '♪' : String(sg.n));
/** Natural width of a badge (12 high): the clearing's number circle (unless `lod`), then a chip per kind. */
export const badgeWidth = (segs, lod = false, hasNum = true) => (hasNum && !lod ? 14 : 0) + segs.reduce((w, sg) => w + segW(sg, lod), 0) + 3;
function chipIcon(kind) {
    if (kind === 'mon') return sv('g', { class: 'bicon claw' }, ...[[3, 9.5, 5, 2.5], [5.6, 9.5, 7.6, 2.5], [8.2, 9.5, 10.2, 2.5]].map(([x1, y1, x2, y2]) => sv('line', { x1, y1, x2, y2 })));
    return sv('g', { class: 'bicon person' }, sv('circle', { cx: 6, cy: 3.9, r: 1.9 }), sv('path', { d: 'M2.4 10.2 Q2.4 6.3 6 6.3 Q9.6 6.3 9.6 10.2 Z' }));
}
/** The collapsed form of a clearing's things: one frame holding the number circle and a chip per kind. `w` is its natural width. */
export function badgeEl(bd, w, { lod = false, x = 0, y = 0, scale = 1 } = {}) {
    const hasNum = bd.num != null && !lod;
    let ox = hasNum ? 15 : 1.5;
    const tr = `translate(${x.toFixed(1)} ${y.toFixed(1)})${scale !== 1 ? ` scale(${scale.toFixed(3)})` : ''}`;
    return sv('g', { class: 'badge', transform: tr, ...(bd.id ? { 'data-clearing': bd.id, 'pointer-events': 'all' } : {}) },
        sv('rect', { class: 'bframe', x: -0.5, y: -0.5, width: w + 1, height: 13, rx: 4 }),
        hasNum ? sv('circle', { cx: 8, cy: 6, r: 5.5, class: 'pillnum' }) : null,
        hasNum ? sv('text', { x: 8, y: 6, dy: '.35em', 'text-anchor': 'middle', class: 'pillnumtxt' }, String(bd.num)) : null,
        ...bd.segs.map(sg => {
            const sw = segW(sg, lod), g = sv('g', { class: `bseg ${sg.k}${sg.disc ? ' disc' : ''}`, transform: `translate(${ox} 0)` },
                sv('rect', { x: 0, y: 0, width: sw - 1, height: 12, rx: 3 }),
                ICON_KINDS.has(sg.k) ? chipIcon(sg.k) : null,
                ICON_KINDS.has(sg.k) ? (sg.n > 1 ? sv('text', { x: lod ? 13.2 : 15.5, y: 6, dy: '.35em', 'text-anchor': 'middle' }, String(sg.n)) : null)
                    : sv('text', { x: (sw - 1) / 2, y: 6, dy: '.35em', 'text-anchor': 'middle' }, segText(sg)));
            ox += sw; return g;
        }));
}
/** A name: the pill of one thing standing in a clearing, led by a circle with the clearing's number. `box` = { x, y, w, h } in the world. */
export function pillEl(t, box, num, clearingId) {
    const th = t.img ? 15 : 0;
    return sv('g', { transform: `translate(${box.x.toFixed(1)} ${box.y.toFixed(1)})`, class: `pill ${t.k}${t.disc ? ' disc' : ''}`, ...(clearingId ? { 'data-clearing': clearingId } : {}) },
        sv('rect', { width: box.w, height: box.h, rx: 6 }),
        sv('circle', { cx: 8, cy: box.h / 2, r: 6, class: 'pillnum' }),
        sv('text', { x: 8, y: box.h / 2, dy: '.35em', 'text-anchor': 'middle', class: 'pillnumtxt' }, String(num)),
        t.img ? sv('rect', { x: NUM_W - 0.5, y: (box.h - 14) / 2, width: 14, height: 14, rx: 3, class: 'thumbbg' }) : null,
        t.img ? sv('image', { href: t.img, x: NUM_W - 0.5, y: (box.h - 14) / 2, width: 14, height: 14, preserveAspectRatio: 'xMidYMid meet' }) : null,
        sv('text', { x: NUM_W - 2 + th + 2, y: box.h / 2, dy: '.35em' }, t.label));
}
/** The mark of a hidden path or secret passage not yet found: a closed gate (a dashed diamond long in the path's direction, a bar across), never a '?' (that is a face-down chit). */
export function pathMarkEl(kind, x, y, deg) {
    const stroke = PATH[kind]?.stroke ?? '#c58a4a';
    return sv('g', { class: `undisc-mark ${kind}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(0)})` },
        sv('polygon', { class: 'pm', points: '-7.5,0 0,-5.5 7.5,0 0,5.5', stroke }),
        sv('line', { class: 'pmbar', x1: 0, y1: -3.4, x2: 0, y2: 3.4, stroke }));
}
/** A face-down chit: a small counter with a question mark. */
export const downChitEl = (x, y) => sv('g', { class: 'chit down', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
    sv('circle', { r: CHIT_R, class: 'chitdisc' }), sv('text', { 'text-anchor': 'middle', dy: '.36em', class: 'chitglyph' }, '?'));
/** A turned-up chit's name: one pill with its glyph (a sound, a site, a warning). */
export const chitPillEl = (kind, text, box) => sv('g', { class: `pill chitpill ${kind ?? 'star'}`, transform: `translate(${box.x.toFixed(1)} ${box.y.toFixed(1)})`, 'pointer-events': 'none' },
    sv('rect', { width: box.w, height: box.h, rx: 6 }), sv('text', { x: 4, y: box.h / 2, dy: '.35em' }, text));
const CHIT_GLYPH = { sound: '♪', site: '◆', warning: '!' };
export const chitGlyph = kind => CHIT_GLYPH[kind] ?? '★';

// ---- level of detail: names while the map is zoomed in, one small chip a clearing when it is zoomed out ----
// Below k = 1 a name's text would be under 9px, so the names give way to chips that stay about 14px high: they are laid out ONCE per level at the size they need at the level's
// smallest zoom, and shrink about their clearing's side as the player zooms in within the level (they only ever get smaller than what was laid out, so they never overlap).
// From k = 1 up the names are laid out at their own size and shrink the same way once their text would pass 13px.
const LOD_K = 1, LOD_LEVELS = [0.85, 0.7, 0.58, 0.48, 0.4, 0.33, 0.28, 0.23, 0.2], BADGE_PX = 14, BADGE_H = 12, TEXT_CAP = 13;
export function levelFor(k) {
    if (k >= LOD_K) return { id: 'names', lo: 1, scale: 1, lod: false };
    const lo = LOD_LEVELS.find(l => k >= l) ?? LOD_LEVELS.at(-1);
    return { id: `chips${lo}`, lo, scale: BADGE_PX / (BADGE_H * lo), lod: true };
}
export const shrinkFor = (lv, k) => (lv.lod ? Math.min(1, lv.lo / k) : Math.min(1, TEXT_CAP / (9 * k)));

// ---- the tile's printed name, turned upright (the picture is 497 x 431 and shows the name along its bottom edge, in the box NAME_BOX; the patch is that box without the letters) ----
const AU = 2 * S / 497, AV = 1.732051 * S / 431, NAME_BOX = [160, 399, 192, 29];
const BLUE_NAMES = new Set(['DW', 'LW', 'MW', 'NW', 'OW', 'PW']);                  // (the enchanted woods print their names in blue; every other name is yellow)
function upright(picture, deg, id, side) {
    const [bx, by, bw, bh] = NAME_BOX, cx = (254 - 248.5) * AU, cy = (414.5 - 215.5) * AV;
    return sv('g', { class: 'tname-up', transform: `rotate(${deg})`, 'pointer-events': 'none' },
        sv('image', { href: picture.replace(/\.gif$/, '-name.png'), x: -S + bx * AU, y: -S * 0.866025 + by * AV, width: bw * AU, height: bh * AV, 'pointer-events': 'none' }),
        sv('text', { x: cx.toFixed(1), y: cy.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: `rotate(180 ${cx.toFixed(1)} ${cy.toFixed(1)})`, fill: side === 'enchanted' && BLUE_NAMES.has(id) ? '#0032be' : '#fffc00' }, tileName(id).toUpperCase()));
}

export function mountMap(host) {
    const svg = sv('svg', { class: 'realm-svg', width: '100%', height: '100%' });
    host.append(svg);
    let model = null, view = null, size = [360, 520], bounds = null, moved = false;
    let inset = 0, restore = null;                 // the part of the map's bottom a sheet covers; the view to glide back to when it goes (see focus / release)
    let overlay = { rings: [], route: [], routeDone: 0, pin: null };
    const ov = h('div', { class: 'mv-ov' });
    host.append(ov);

    // the part of the box the player can see: a sheet may cover the bottom of the map, and the camera works in what is left
    const strip = () => [size[0], Math.max(60, size[1] - inset)];
    const measure = () => { size = [host.clientWidth || size[0], host.clientHeight || size[1]]; };

    const api = {
        el: svg,
        set(m, { refit = false } = {}) {
            model = m;
            const before = view && !refit ? worldCentre() : null;
            computeBounds(); measure();
            if (refit || !view) view = fit();
            draw();
            if (before) recentre(before);                           // the map may have grown or shrunk (the details drawer): keep what was in the middle there
            buildOverlay();
            apply();
        },
        fit(animate = true) { go(fit(), animate); },
        /** Zoom to k (0.2 to 6) about the middle of what the player sees. */
        zoom(k, animate = true) { if (!view) return; measure(); const [w, hh] = strip(), c = worldCentre(), kk = Math.min(6, Math.max(0.2, k)); go({ k: kk, x: w / 2 - c[0] * kk, y: hh / 2 - c[1] * kk }, animate); },
        relayout() { measure(); },
        // Show these clearings together: the camera fits their bounding box (with room around it) in whatever space the map has just now.
        frame(ids, { animate = true, pad = 90, minK = 0.5, maxK = 1.8 } = {}) {
            const pts = ids.map(id => posOf.get(id)).filter(Boolean); if (!pts.length) return;
            measure();
            const [w, hh] = strip();
            const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
            const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
            const k = Math.max(minK, Math.min(maxK, w / (maxX - minX), hh / (maxY - minY)));
            go({ k, x: w / 2 - (minX + maxX) / 2 * k, y: hh / 2 - (minY + maxY) / 2 * k }, animate);
        },
        /** Bring these clearings into the part of the map the player sees, `margin` px clear of every edge (a ring is 44px wide; the pills beside it need room): when they all are, nothing
         *  happens (returns false, the player's own view is respected); otherwise the camera glides to centre them, zooming OUT only as far as it takes (never in). */
        reveal(ids, { margin = 40, minK = 0.3, animate = true } = {}) {
            const pts = ids.map(id => posOf.get(id)).filter(Boolean); if (!pts.length || !view) return false;
            measure();
            const [w, hh] = strip(), at = q => [q[0] * view.k + view.x, q[1] * view.k + view.y];
            if (pts.every(q => { const [x, y] = at(q); return x >= margin && y >= margin && x <= w - margin && y <= hh - margin; })) return false;
            const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
            const fitK = Math.min((w - 2 * margin) / Math.max(1, maxX - minX), (hh - 2 * margin) / Math.max(1, maxY - minY)), k = Math.max(minK, Math.min(view.k, fitK));
            go({ k, x: w / 2 - (minX + maxX) / 2 * k, y: hh / 2 - (minY + maxY) / 2 * k }, animate);
            return true;
        },
        // follow someone else: glide to a clearing at the zoom the player already has (never zooms, never jumps)
        pan(clearingId, animate = true) {
            const p = posOf.get(clearingId); if (!p || !view) return;
            measure();
            const [w, hh] = strip();
            go({ k: view.k, x: w / 2 - p[0] * view.k, y: hh / 2 - p[1] * view.k }, animate);
        },
        /** Is this clearing inside the part of the map the player is looking at (the strip a sheet leaves)? */
        visible(clearingId, margin = 30) {
            const p = posOf.get(clearingId); if (!p || !view) return false;
            const [w, hh] = strip(), x = p[0] * view.k + view.x, y = p[1] * view.k + view.y;
            return x > margin && y > margin && x < w - margin && y < hh - margin;
        },
        /** Glide the camera to a clearing. Two forms:
         *   focus(id, k?, animate = true)                the old one: centre it in the whole box at zoom k (default: at least 1.5)
         *   focus(id, { insetBottom, k, animate = true }) a sheet covers the bottom `insetBottom` px: the clearing sits in the middle of the strip left above it, at the zoom the
         *                                                player has (or `k`); the view it came from is kept so that release() glides back
         *   focus(null, opts) is release(opts). */
        focus(clearingId, a, b) {
            const o = a != null && typeof a === 'object' ? a : { k: a, animate: b };
            if (clearingId == null) { api.release(o); return; }
            const p = posOf.get(clearingId) ?? tileC.get(clearingId); if (!p) return;                // (a tile id centres the camera on the tile: a hero in the air)
            measure();
            const sheet = o.insetBottom != null;
            const toInset = sheet ? Math.max(0, Math.min(size[1] - 60, o.insetBottom)) : 0;
            if (sheet && !restore) restore = { view: view ? { ...view } : null, inset };           // the first sheet remembers where the player was looking
            if (!sheet) restore = null;
            const kk = o.k ?? (sheet ? view?.k ?? 1 : Math.max(view?.k ?? 0, 1.5));
            go({ k: kk, x: size[0] / 2 - p[0] * kk, y: (size[1] - toInset) / 2 - p[1] * kk }, o.animate ?? true, toInset);
        },
        /** The sheet is gone: glide back to where the camera was before it (or, if the player has moved the map since, keep what they were looking at and just give the strip back). */
        release({ animate = true } = {}) {
            if (!view) return;
            const r = restore; restore = null;
            if (!r && !inset) return;
            if (r?.view) { go(r.view, animate, r.inset ?? 0); return; }
            const c = worldCentre(); measure();
            go({ k: view.k, x: size[0] / 2 - c[0] * view.k, y: size[1] / 2 - c[1] * view.k }, animate, 0);
        },
        /** The overlay vocabulary, drawn above the map: { rings:[{id, kind}], route:[ids], routeDone?:n, pin?:{id, html, tone} }; setOverlay(null) clears it. */
        setOverlay(o) {
            const n = o ?? {};
            overlay = { rings: (n.rings ?? []).filter(r => r?.id), route: (n.route ?? []).filter(Boolean), routeDone: n.routeDone ?? 0, pin: n.pin?.id ? { id: n.pin.id, html: n.pin.html ?? '', tone: n.pin.tone ?? '' } : null };
            buildOverlay(); placeOverlay();
        },
        getOverlay() { return overlay; },
        /** Where a clearing is on screen now (map-box pixels), whether it is in the visible strip, and which ring kinds it wears: for tests and for sheets that point at the map. */
        project(clearingId) { const p = posOf.get(clearingId); if (!p || !view) return null; return { x: p[0] * view.k + view.x, y: p[1] * view.k + view.y, visible: api.visible(clearingId, 0) }; },
        /** What the last draw cost: { drawMs, layoutMs, cached (the names' layout was remembered), level, draws }: for the tests. */
        stats() { return { ...stats }; },
        camera() { return { ...view, inset, flying: !!flight, restoring: !!restore }; },
        /** Which clearing does a tap at (x, y) in map-box pixels mean? the nearest one within 22px (or the clearing's own circle when the map is zoomed in), else null. */
        hit(x, y) { return nearest(x, y); },
    };
    const posOf = new Map(), tileC = new Map();          // clearing id -> world position; tile id -> the tile's centre

    // ---- the layout of the names is the costly part of a draw, and the same state always lays out the same way: remember it by its inputs ----
    const layoutCache = new Map();
    const layoutKey = (level, groups, obstacles, anchors, badgeOf) => JSON.stringify([level.id, groups.map(g0 => [g0.id, g0.ax, g0.ay, g0.ar, g0.prio, g0.prefer, g0.own, g0.kind, g0.boxes, badgeOf.get(g0.id)?.boxes]),
        obstacles.map(o => [Math.round(o.x * 10), Math.round(o.y * 10), o.r]), anchors.map(a => [a.id, Math.round(a.x * 10), Math.round(a.y * 10)])]);
    let level = levelFor(1), labelEls = [], lastShrink = 1, heroRing = null, stats = { draws: 0 };

    function draw() {
        const tDraw = performance.now(); let tLayout = 0;
        posOf.clear(); tileC.clear();
        const { tiles, placements } = model;
        level = levelFor(view?.k ?? fit().k);
        const g = sv('g', { class: 'world' });
        const top = sv('g', { class: 'top' });          // labels sit above every tile
        const og = sv('g', { class: 'labels' });         // in world coordinates: positions are decided across tiles
        const groups = [], obstacles = [], anchors = [], makeLabel = new Map(), badgeOf = new Map();
        heroRing = null;
        const tileDefs = Object.fromEntries(tiles.map(t => [t.id, t])), tileCentre = tileC;
        for (const p of placements) {
            const side = p.side ?? model.side ?? 'normal';          // each tile shows its own side: an enchanted tile is turned over
            const tile = tileDefs[p.id], def = tile.sides[side], lay = layoutSide(tile, side);
            const [cx, cy] = hexCenter(p.q, p.r, S), a = p.rot * Math.PI / 3;
            tileCentre.set(p.id, [cx, cy]);
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
            // The name printed on the picture reads upside down once the tile is turned 120 to 240 degrees: cover it with the same strip of the picture without the letters and set the name again, upright (QA-14; tools/build_tile_names.py)
            if (picture && p.rot % 6 >= 2 && p.rot % 6 <= 4) tg.append(upright(picture, p.rot * 60, p.id, side));
            const paths = sv('g', { class: 'paths' });
            // A hidden path or secret passage that bends in the picture: a curve through the measured middle of the printed passage (a quadratic bend), else the straight line.
            const bendOf = (path, A, B) => {
                const m = model.pathMarks?.[tile.id]?.[side]?.[`${path.a}-${path.b}`]?.mid; if (!m) return null;
                const M = rot([m[0], m[1]], a).map(v => v * S), C = [2 * M[0] - (A[0] + B[0]) / 2, 2 * M[1] - (A[1] + B[1]) / 2];
                return { mid: M, d: `M${A[0].toFixed(1)} ${A[1].toFixed(1)} Q${C[0].toFixed(1)} ${C[1].toFixed(1)} ${B[0].toFixed(1)} ${B[1].toFixed(1)}` };
            };
            // a path not found yet is marked in the middle of its road; the mark is a thing a name must never cover (a hidden path is a fact of the game)
            const mark = (path, A, B, M) => {
                const mx = M ? M[0] : (A[0] + B[0]) / 2, my = M ? M[1] : (A[1] + B[1]) / 2;
                paths.append(pathMarkEl(path.kind, mx, my, Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI));
                obstacles.push({ x: cx + mx, y: cy + my, r: 8 });
            };
            for (const path of def.paths) {
                // Hidden paths and secret passages are printed on the tile: they are always drawn, but faint and marked until discovered.
                const known = path.kind === 'open' || path.kind === 'tunnel' || model.showHidden || model.discovered?.has(pk(p.id + path.a, p.id + path.b));
                const A = pos[path.a], B = pos[path.b], s = PATH[path.kind];
                if (picture) {
                    // the picture already shows every road; mark the hidden ones we have not found, and trace the ones we have
                    if (path.kind === 'open' || path.kind === 'tunnel') continue;
                    const bend = bendOf(path, A, B);
                    if (known) paths.append(bend ? sv('path', { d: bend.d, fill: 'none', stroke: s.stroke, 'stroke-width': 2, 'stroke-dasharray': '1.5 4', 'stroke-linecap': 'round', opacity: 0.9, class: 'found-path' })
                        : sv('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: s.stroke, 'stroke-width': 2, 'stroke-dasharray': '1.5 4', 'stroke-linecap': 'round', opacity: 0.9, class: 'found-path' }));
                    else mark(path, A, B, bend?.mid);
                    continue;
                }
                paths.append(sv('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: s.stroke, 'stroke-width': known ? s.w : 2, 'stroke-dasharray': known ? (s.dash ?? null) : '2 5',
                    'stroke-linecap': 'round', opacity: known ? 1 : 0.55, class: known ? '' : 'undisc' }));
                if (!known) mark(path, A, B, null);
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
                    og.append(downChitEl(wx, wy));                  // not yet known: a small counter with a question mark
                    obstacles.push({ x: wx, y: wy, r: CHIT_R + 0.5 });
                    return;
                }
                // known: the glyph is part of the name, as for a sound in a clearing: one pill, on the chit's own clear spot
                const glyph = chitGlyph(c.kind);
                const text = `${glyph} ${label}`, id = `chit:${c.id ?? p.id + i}`;
                groups.push({ id, noLeader: true, ax: wx, ay: wy, ar: 3, prio: 3, prefer: ['center', 'below', 'above', 'right', 'left'], inside: insideTile, boxes: [{ w: pillWidth(text), h: PILL_H }] });
                badgeOf.set(id, { segs: [{ k: c.kind === 'sound' ? 'sound' : c.kind === 'site' ? 'site' : c.kind === 'warning' ? 'warn' : 'star', glyph }], id: null, boxes: [{ w: 16, h: 12 }] });
                makeLabel.set(id, box => chitPillEl(c.kind, text, box));
            });
            def.clearings.forEach(c => {
                const id = p.id + c.n, [x, y] = pos[c.n];
                const sel = model.selected === id, onPlan = model.plan?.includes(id) && id !== model.hero, isTarget = model.targets?.includes(id), isMaybe = model.targetsMaybe?.includes(id);
                const ring = c.magic?.length ? MAGIC[c.magic[0]] : null;
                const cg = sv('g', { class: `clr${sel ? ' sel' : ''}${onPlan ? ' plan' : ''}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, 'data-clearing': id });
                cg.append(sv('circle', { r: 19, fill: 'transparent' }));
                if (onPlan) cg.append(sv('circle', { r: 17, class: 'planring' }));
                const dangerHere = (isTarget || isMaybe) && (model.tokens?.[id] ?? []).some(t => t.k === 'mon');          // monsters there: they block you at the end of the phase unless you are hidden
                if (isTarget) cg.append(sv('circle', { r: 20, class: `targetring${dangerHere ? ' danger' : ''}` }));
                else if (isMaybe) cg.append(sv('circle', { r: 20, class: 'targetring maybe' }));
                if (dangerHere) cg.append(sv('g', { class: 'dangermark', transform: 'translate(13 -17)', 'pointer-events': 'none' }, sv('circle', { r: 6.5 }), ...[[-3, 3.5, -1.2, -3.5], [-0.2, 3.5, 1.8, -3.5], [2.6, 3.5, 4.6, -3.5]].map(([x1, y1, x2, y2]) => sv('line', { x1: x1 - 0.5, y1, x2: x2 - 0.5, y2 }))));
                if (model.goingTo === id) cg.append(sv('circle', { r: 22, class: 'goingring' }));
                // the bare-tiles view (the map's eye button) hides every name and number; a site that is found keeps this soft throbbing halo so it can still be told
                if ((model.tokens?.[id] ?? []).some(t => t.k === 'site' && t.disc)) cg.append(sv('circle', { r: 15, class: 'sitehalo', 'pointer-events': 'none' }));
                if (picture) {
                    // an upright number over the printed one, so it reads whichever way the tile is turned
                    cg.append(sv('circle', { r: 9, class: 'numbadge', fill: 'rgba(12,14,20,.82)', stroke: ring ?? 'rgba(255,255,255,.55)', 'stroke-width': ring ? 2.4 : 1 }));
                    cg.append(sv('text', { 'text-anchor': 'middle', dy: '.36em', class: 'num artnum' }, String(c.n)));
                } else {
                    cg.append(sv('circle', { r: 11.5, fill: CLEARING[c.type], stroke: ring ?? '#0c0e14', 'stroke-width': ring ? 3 : 1.5 }));
                    cg.append(sv('text', { 'text-anchor': 'middle', dy: '.35em', class: 'num' }, String(c.n)));
                }
                // where he stands: a dotted ring drawn just above the tile picture and under every number, label and chit; it keeps its size on screen (see apply)
                if (model.hero === id && !model.party?.length) { heroRing = sv('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 24, class: `youring${model.heroHidden ? ' hid' : ''}`, 'pointer-events': 'none' }); tg.append(heroRing); }
                tg.append(cg);
                // things standing in this clearing, each with its name; where they go is decided by layoutLabels once every tile is known
                // the clearing where he stands is wider: its dotted ring (24 units) is kept clear of every name, so no pill is laid over the dots
                const youHere = model.hero === id && !model.party?.length, clearR = youHere ? 27 : picture ? 10.5 : 13;
                obstacles.push({ x: cx + x, y: cy + y, r: clearR });
                anchors.push({ id, x: cx + x, y: cy + y });
                const toks = model.tokens?.[id] ?? [];
                if (toks.length) {
                    const shown = toks.length > 5 ? [...toks.slice(0, 4), { k: 'more', label: `+${toks.length - 4}` }] : toks;
                    const gid = `clr:${id}`;
                    const prio = Math.min(...shown.map(t => ({ mon: 1, nat: 1, ally: 2, dwelling: 2, site: 3, sound: 3, more: 4 }[t.k] ?? 3)));
                    // when the names will not fit around the clearing they give way to one small marker: a coloured chip for each kind of thing that is there,
                    // with its number, and a dotted end that says "tap the clearing to see everything"
                    const KS = ['mon', 'nat', 'ally', 'dwelling', 'site', 'sound'], count = t => Number(/x(\d+)$/.exec(t.label)?.[1] ?? 1);
                    const segs = KS.map(k => { const ts = toks.filter(t => t.k === k); return ts.length ? { k, n: ts.reduce((n, t) => n + count(t), 0), disc: ts.some(t => t.disc) } : null; }).filter(Boolean);
                    badgeOf.set(gid, { segs, id, num: c.n });
                    groups.push({ id: gid, own: id, kind: shown[0]?.k ?? 'site', ax: cx + x, ay: cy + y, ar: clearR, prio, prefer: ['right', 'left'], inside: insideTile,
                        boxes: shown.map(t => ({ w: pillWidth(t.label, { img: !!t.img }) + NUM_W, h: t.img ? 17 : PILL_H })) });
                    makeLabel.set(gid, (box, i) => pillEl(shown[i], box, c.n, id));
                }
            });
            g.append(tg);
        }
        for (const [id, bd] of badgeOf) bd.boxes = [{ w: badgeWidth(bd.segs, level.lod, bd.num != null) + 1, h: BADGE_H + 1 }];

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
        // Zoomed out (level.lod) every clearing is a marker from the start, at the size its level needs; zoomed in, start with all names at full size and, while some collide,
        // overflow their tile or have to be tethered, turn the worst crowds into markers.
        const key = layoutKey(level, groups, obstacles, anchors, badgeOf);
        let cached = layoutCache.get(key);
        const tL0 = performance.now(), cachedHit = !!cached;
        if (cached) { layoutCache.delete(key); layoutCache.set(key, cached); }                  // most recently used last
        else {
            const demoted = new Set();
            const sc = level.scale;
            const asBadge = g0 => ({ ...g0, boxes: badgeOf.get(g0.id).boxes.map(b => ({ w: b.w * sc, h: b.h * sc })), prefer: ['right', 'left', 'below', 'above'], prio: 1, ...(level.lod ? { inside: null } : {}) });          // (a chip that is 40px wide at the whole-realm zoom cannot stay inside a 70px tile: it may stand on the neighbours' ground)
            // only when the names truly cannot sit by their clearing: they collide, spill off their tile, or would have to stand well away from it. (A name that sits close
            // but nearer another clearing keeps its place and gets a thin line to its own.)
            const bad = r => r.overlap > 0 || (r.outside ?? 0) >= 3 || r.ring >= 18;       // (a ring is 5 units: eighteen is some ninety units from the clearing)
            let placed = null, first = null;
            if (level.lod) {
                for (const g0 of groups) if (badgeOf.has(g0.id)) demoted.add(g0.id);
                placed = layoutLabels(groups.map(g0 => (demoted.has(g0.id) ? asBadge(g0) : g0)), obstacles, { anchors, rings: 48 });          // chips are big in world units: look further for room
            } else for (let guard = 0; guard < 40; guard++) {
                placed = layoutLabels(groups.map(g0 => (demoted.has(g0.id) ? asBadge(g0) : g0)), obstacles, { anchors });
                if (guard === 0) first = Object.fromEntries(groups.filter(g0 => badgeOf.has(g0.id)).map(g0 => { const r = placed.get(g0.id); return [g0.id, { leader: r.leader, overlap: Math.round(r.overlap), outside: r.outside ?? 0, ring: r.ring, boxes: g0.boxes.length }]; }));
                const failing = groups.filter(g0 => badgeOf.has(g0.id) && !demoted.has(g0.id) && bad(placed.get(g0.id)));
                if (!failing.length) break;
                failing.sort((a0, b0) => b0.boxes.length - a0.boxes.length || placed.get(b0.id).overlap - placed.get(a0.id).overlap);
                demoted.add(failing[0].id);
                for (const f of failing.slice(1)) if (placed.get(f.id).overlap > 0) demoted.add(f.id);       // a true collision goes at once
            }
            cached = { placed, demoted, first };
            layoutCache.set(key, cached);
            while (layoutCache.size > 8) layoutCache.delete(layoutCache.keys().next().value);
        }
        tLayout = performance.now() - tL0;
        const { placed, demoted, first } = cached;
        window.__labelFirst = first ?? window.__labelFirst;
        labelEls = []; lastShrink = 1;
        const leaders = sv('g', { class: 'leaders', 'pointer-events': 'none' });
        const names = sv('g', { class: 'names', 'pointer-events': 'none' });
        // a name that stands away from its clearing is tied to it by a bold line and a ring drawn round the clearing itself
        const leaderMark = gr => sv('circle', { cx: gr.ax.toFixed(1), cy: gr.ay.toFixed(1), r: (gr.ar + 1).toFixed(1), class: `leader-mark ${gr.kind ?? 'site'}` });
        const sc = level.scale;
        // each name shrinks about the point of its own box nearest the clearing (see shrinkFor): it stays beside the clearing and inside the room it was laid out in
        const track = (el, gr, boxes) => {
            const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y)), x1 = Math.max(...boxes.map(b => b.x + b.w)), y1 = Math.max(...boxes.map(b => b.y + b.h));
            labelEls.push({ el, base: el.getAttribute('transform'), ox: Math.max(x0, Math.min(gr.ax, x1)), oy: Math.max(y0, Math.min(gr.ay, y1)) });
        };
        for (const gr of groups) {
            const r = placed.get(gr.id);
            if (demoted.has(gr.id)) {
                const bd = badgeOf.get(gr.id), bx = r.boxes[0], w0 = bd.boxes[0].w;
                const el = badgeEl(bd, w0 - 1, { lod: level.lod, x: bx.x + 0.5 * sc, y: bx.y + 0.5 * sc, scale: sc });          // the layout box is the frame: half a unit wider than the chips
                names.append(el); track(el, gr, r.boxes);
                if (r.leader && !gr.noLeader) { leaders.append(sv('line', { x1: gr.ax.toFixed(1), y1: gr.ay.toFixed(1), x2: (bx.x + bx.w / 2).toFixed(1), y2: (bx.y + bx.h / 2).toFixed(1), class: `leader ${gr.kind ?? 'site'}` })); leaders.append(leaderMark(gr)); }
                continue;
            }
            const make = makeLabel.get(gr.id);
            r.boxes.forEach((box, i) => { const el = make({ x: box.x, y: box.y, w: box.w, h: box.h }, i); names.append(el); track(el, gr, [box]); });
            if (r.leader && !gr.noLeader) {          // a chit lying in the forest is its own counter: no line to tie it to a clearing
                const b = r.boxes[0];
                const tx = Math.max(b.x, Math.min(gr.ax, b.x + b.w)), ty = Math.max(b.y, Math.min(gr.ay, b.y + b.h));
                // a thin connector from the edge of the clearing's circle to the nearest pill, in that pill's colour
                const kind = gr.kind ?? 'site';
                const dx = tx - gr.ax, dy = ty - gr.ay, len = Math.hypot(dx, dy) || 1, k = Math.min(1, (gr.ar + 1) / len);
                leaders.append(sv('line', { x1: (gr.ax + dx * k).toFixed(1), y1: (gr.ay + dy * k).toFixed(1), x2: tx.toFixed(1), y2: ty.toFixed(1), class: `leader ${kind}` }));
                leaders.append(leaderMark(gr));
            }
        }
        og.append(leaders, names);
        top.append(markerLayer, og, tagLayer);
        g.append(top);
        svg.replaceChildren(g);
        mountRoute();
        stats = { drawMs: performance.now() - tDraw, layoutMs: tLayout, cached: !!cachedHit, level: level.id, draws: stats.draws + 1 };
    }

    // the realm's box in the world, from the tiles alone (the camera needs it before anything is drawn)
    function computeBounds() {
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (const p of model.placements) { const [cx, cy] = hexCenter(p.q, p.r, S); minX = Math.min(minX, cx - S); maxX = Math.max(maxX, cx + S); minY = Math.min(minY, cy - S * .87); maxY = Math.max(maxY, cy + S * .87); }
        bounds = { minX, minY, maxX, maxY };
    }

    function fit() {
        measure();
        // the whole realm with 28px of room around it on screen: the chips of the far-out zoom stand a little beyond the tiles
        const [w, hh] = strip(), bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
        const k = Math.min((w - 56) / bw, (hh - 56) / bh);
        return { k, x: w / 2 - (bounds.minX + bounds.maxX) / 2 * k, y: hh / 2 - (bounds.minY + bounds.maxY) / 2 * k };
    }
    const worldCentre = () => { const [w, hh] = strip(); return [(w / 2 - view.x) / view.k, (hh / 2 - view.y) / view.k]; };
    const recentre = c => { const [w, hh] = strip(); view = { k: view.k, x: w / 2 - c[0] * view.k, y: hh / 2 - c[1] * view.k }; };
    // While the drawer slides, the map's box changes size every frame: keep the same point in the middle.
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
        if (!view || flight) { measure(); return; }
        const c = worldCentre(); measure(); recentre(c); apply();
    }).observe(host);
    // The camera glides to a new view: the centre of the strip travels in a straight line over the map while the zoom changes smoothly (geometrically,
    // so a zoom out and a zoom in feel alike). A touch, a drag or the wheel takes the camera back at once. With reduced motion it simply jumps.
    // `toInset` is the height of the bottom strip a sheet covers once the glide is done: the strip's middle moves with it, so nothing snaps when a sheet comes or goes.
    let flight = null;
    const stopFlight = () => { if (flight) { cancelAnimationFrame(flight); flight = null; } };
    function go(to, animate = true, toInset = inset) {
        stopFlight();
        const reduce = calmMotion();          // (reduced motion, or the Calm setting: the camera jumps, it does not glide)
        const fromInset = inset; inset = toInset;
        if (!animate || reduce || !view) { view = to; apply(); return; }
        const [w0, h0] = size, from = { ...view };
        const world = (v, w, hc) => [(w / 2 - v.x) / v.k, (hc - v.y) / v.k];
        const hf = (h0 - fromInset) / 2, ht = (h0 - toInset) / 2;
        const [fx, fy] = world(from, w0, hf), [tx, ty] = world(to, w0, ht);
        const dist = Math.hypot(tx - fx, ty - fy) * Math.max(from.k, to.k), zoom = Math.abs(Math.log(to.k / from.k));
        const ms = Math.min(650, 260 + dist * 0.35 + zoom * 180);
        const t0 = performance.now();
        const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        // the map's box may change size while the camera flies (the drawer opens or closes): the target is a point of the world, so it is kept in the middle of whatever size the map has now
        const step = now => {
            const [w, hh] = size, dh = hh - h0;
            const u = Math.min(1, (now - t0) / ms), e = ease(u);
            const k = from.k * Math.pow(to.k / from.k, e), cx = fx + (tx - fx) * e, cy = fy + (ty - fy) * e;
            const yc = hf + (ht - hf) * e + dh / 2;
            view = { k, x: w / 2 - cx * k, y: yc - cy * k }; apply();
            flight = u < 1 ? requestAnimationFrame(step) : null;
            if (u >= 1) { view = { k: to.k, x: w / 2 - tx * to.k, y: ht + dh / 2 - ty * to.k }; apply(); }
        };
        flight = requestAnimationFrame(step);
    }
    function apply() {
        // the level of detail follows the zoom: crossing a level lays the names out again (remembered per level, so crossing back is free)
        if (model && levelFor(view.k).id !== level.id) draw();
        const g = svg.querySelector('.world');
        if (g) g.setAttribute('transform', `translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(4)})`);
        svg.classList.toggle('zoomed', view.k >= 1.1);
        svg.classList.toggle('lod', level.lod);
        // names and chips never grow past their size on screen (about 13px text, 14px chips): they shrink about their clearing's side, inside the room they were given
        const f = shrinkFor(level, view.k);
        if (Math.abs(f - lastShrink) > 0.004) {
            lastShrink = f;
            for (const L of labelEls) L.el.setAttribute('transform', f > 0.996 ? L.base : `translate(${L.ox.toFixed(1)} ${L.oy.toFixed(1)}) scale(${f.toFixed(3)}) translate(${(-L.ox).toFixed(1)} ${(-L.oy).toFixed(1)}) ${L.base}`);
        }
        // the hero's dotted ring keeps its weight on screen: 2.4px of dots at every zoom, never under 14px of radius
        if (heroRing) {
            const k = view.k;
            heroRing.setAttribute('r', Math.max(24, 14 / k).toFixed(1));
            heroRing.style.strokeWidth = `${(2.4 / k).toFixed(2)}px`; heroRing.style.strokeDasharray = `${(1.2 / k).toFixed(2)} ${(4.8 / k).toFixed(2)}`;
        }
        placeOverlay();
    }
    function zoomAt(px, py, f, dx = 0, dy = 0) {
        const k = Math.min(6, Math.max(0.2, view.k * f)), real = k / view.k;
        view.x = px - (px - view.x) * real + dx; view.y = py - (py - view.y) * real + dy; view.k = k;
        if (restore) restore.view = null;
        apply();
    }

    // ---- the overlay: rings, the hero's marker, the planned road and the pin sit in screen pixels above the map (one div, pointer-events none), so they keep their size at every zoom ----
    const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
    let ovKey = '', routeSvg = null, routeG = null, routePath = null, routeDonePath = null, heroEl = null, pinEl = null, ringEls = [], stopEls = [], lastSized = null;
    function buildOverlay(force = false) {
        // the same overlay again (every render of the screen sets the map) keeps its elements, so a pulsing ring does not start over
        const key = JSON.stringify([overlay, model?.hero ?? null, model?.heroAir ?? null, !!model?.heroHidden, !!model?.party?.length]);
        if (!force && key === ovKey) return;
        ovKey = key;
        ov.replaceChildren();
        ringEls = []; stopEls = []; heroEl = null; pinEl = null; routeSvg = null; lastSized = null;
        routeG?.remove(); routeG = null; routePath = routeDonePath = null;
        if (!model) return;
        const { rings, route, pin } = overlay;
        if (route.length > 1) {
            // The planned road is drawn IN the map, between the tiles and the names (world coordinates, a stroke that keeps its screen width): a name is never crossed by it (QA-17). Its stops stay above, in the overlay.
            routePath = sv('path', { class: 'mv-route-todo', 'vector-effect': 'non-scaling-stroke' }); routeDonePath = sv('path', { class: 'mv-route-done', 'vector-effect': 'non-scaling-stroke' });
            routeG = sv('g', { class: 'ds-route mv-route', 'aria-hidden': 'true', 'pointer-events': 'none' }, routeDonePath, routePath);
            routeSvg = routeG;
            const pts = route.map(id => posOf.get(id) ?? null), done = [], todo = [], n = overlay.routeDone;
            const hop = (ia, ib) => { const ta = route[ia].slice(0, 2), tb = route[ib].slice(0, 2), ca = tileC.get(ta), cb = tileC.get(tb); return ta !== tb && ca && cb ? [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2] : null; };       // (a hop between two tiles bends through the middle of their shared edge, as the roads do)
            for (let i = 1; i < pts.length; i++) {
                if (!pts[i - 1] || !pts[i]) continue;
                const mid = hop(i - 1, i), seg = `M${pts[i - 1][0].toFixed(1)} ${pts[i - 1][1].toFixed(1)}${mid ? ` L${mid[0].toFixed(1)} ${mid[1].toFixed(1)}` : ''} L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
                (i <= n ? done : todo).push(seg);
            }
            routePath.setAttribute('d', todo.join(' ')); routeDonePath.setAttribute('d', done.join(' '));
            mountRoute();
            route.slice(1).forEach((id, i) => { const el = h('b', { class: `ds-stop${i < overlay.routeDone ? ' done' : ''}`, 'data-stop': i + 1, 'aria-hidden': 'true' }, String(i + 1)); stopEls.push({ id, el, i: i + 1 }); ov.append(el); });
        }
        for (const r of rings) { const el = h('i', { class: `ds-ring ${r.kind ?? 'legal'}`, 'data-ring': r.id, 'aria-hidden': 'true' }); ringEls.push({ id: r.id, el }); ov.append(el); }
        if (model.hero && !model.party?.length) { heroEl = h('i', { class: `ds-hero${model.heroHidden ? ' hidden' : ''}`, 'data-hero': model.hero, 'aria-hidden': 'true' }); ov.append(heroEl); }
        // in the air (a Fly phase has taken him up): the marker stands over the middle of the tile he is over, with wings; he is not at any clearing until he lands (QA-107)
        else if (model.heroAir && !model.party?.length) {
            heroEl = h('i', { class: 'ds-hero air', 'data-hero': model.heroAir, 'data-air': model.heroAir, 'aria-hidden': 'true' }, sv('svg', { viewBox: '0 0 24 24', class: 'wing' }, sv('path', { d: 'M12 13c-1.6-3.6-4.4-5.2-8.5-5 .6 3.6 3.4 5.4 8.5 5zM12 13c1.6-3.6 4.4-5.2 8.5-5-.6 3.6-3.4 5.4-8.5 5z' })));
            ov.append(heroEl);
        }
        if (pin) { pinEl = h('div', { class: `ds-pin${pin.tone === 'bad' ? ' bad' : ''}`, role: 'status', html: pin.html }); ov.append(pinEl); }
    }
    // the route stands in the world group under the names (`.top`); a redraw of the map (a new level of detail) makes a new world, so it is put back
    function mountRoute() { const w = svg.querySelector('.world'); if (routeG && w && routeG.parentNode !== w) w.insertBefore(routeG, w.querySelector('.top')); }
    // a thing of d px, centred on its point: a size change costs layout, so it is only written when it changes
    const sizeEl = (el, d) => { if (el._d === d) return; el._d = d; el.style.width = el.style.height = `${d}px`; el.style.margin = `${-d / 2}px 0 0 ${-d / 2}px`; };
    const at = (el, x, y) => { el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; };
    function placeOverlay() {
        if (!view || !model) return;
        const k = view.k, sx = p => p[0] * k + view.x, sy = p => p[1] * k + view.y;
        // a ring is 44px where the map is zoomed in and shrinks with the clearings when it is zoomed far out, never below 26
        const ringD = Math.round(clamp(26, 44, 38 * k)), heroD = Math.round(clamp(14, 22, 30 * k));
        for (const { id, el } of ringEls) { const p = posOf.get(id); el.hidden = !p; if (p) { sizeEl(el, ringD); at(el, sx(p), sy(p)); } }
        if (heroEl) { const p = posOf.get(model.hero) ?? tileC.get(model.heroAir); heroEl.hidden = !p; if (p) { sizeEl(heroEl, heroEl.classList.contains('air') ? heroD + 10 : heroD); at(heroEl, sx(p), sy(p)); } }
        if (routeSvg) {
            // stops on a clearing that already holds the hero or an earlier stop fan out to the lower right (the names stand above and beside a clearing): "you will be back here"
            const used = new Map(); if (overlay.route[0]) used.set(overlay.route[0], 1);
            const sd = Math.round(clamp(18, 22, 20 * k + 6));
            for (const s of stopEls) {
                const p = posOf.get(s.id); s.el.hidden = !p; if (!p) continue;
                const n0 = used.get(s.id) ?? 0; used.set(s.id, n0 + 1);
                sizeEl(s.el, sd); at(s.el, sx(p) + n0 * (sd * 0.62), sy(p) + n0 * (sd * 0.62));
            }
        }
        if (pinEl) {
            const p = posOf.get(overlay.pin.id); pinEl.hidden = !p;
            if (p) {
                if (pinEl._mw !== size[0]) { pinEl._w = pinEl.offsetWidth; pinEl._h = pinEl.offsetHeight; pinEl._mw = size[0]; }            // (measured once per map width: this runs every frame of a glide)
                const x = sx(p), y = sy(p), W = size[0], w = pinEl._w || 180, ph = pinEl._h || 40, off = ringD / 2 + 8;
                const left = clamp(w / 2 + 8, Math.max(w / 2 + 8, W - w / 2 - 8), x);
                const below = y - off - ph < 6;                  // no room above: the bubble hangs under the clearing, the tail pointing up
                pinEl.classList.toggle('below', below);
                pinEl.style.cssText = `left:${left.toFixed(1)}px;top:${y.toFixed(1)}px;--dx:${(left - x).toFixed(1)}px;--off:${off}px`;
            }
        }
    }
    // the nearest clearing within reach of a tap: 22px at least (a 44px target at every zoom), or the clearing's own circle once that is bigger
    function nearest(x, y) {
        if (!view) return null;
        const R = Math.max(22, 19 * view.k); let best = null, bd = R;
        for (const [id, p] of posOf) { const d = Math.hypot(p[0] * view.k + view.x - x, p[1] * view.k + view.y - y); if (d < bd) { bd = d; best = id; } }
        return best;
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
        if (pts.size === 1) { view.x += e.clientX - prev[0]; view.y += e.clientY - prev[1]; if (restore) restore.view = null; apply(); }
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
        // what the finger landed on says which clearing it means (a clearing's own circle, or a name or chip, which carry their clearing); a tap that landed on bare map goes to the
        // nearest clearing within reach, so a small target at the whole-realm zoom is still a 44px one
        const own = e.target.closest?.('[data-clearing]');
        const r = svg.getBoundingClientRect();
        const id = own ? own.getAttribute('data-clearing') : nearest(e.clientX - r.left, e.clientY - r.top);
        if (id) { e.stopPropagation(); model?.onTap?.(id); }
        else model?.onBackground?.();
    });
    if (typeof window !== 'undefined' && window.__mr) window.__mr.map = api;            // for the tests (tools/ui_overlay.py): the mounted map's interface
    return api;
}

/**
 * The swatch legend for the key sheet (docs/design/redesign/MAP-API.md section 4): the real pieces of the map, drawn by the map's own builders, with five words each.
 * `art` is the game's art table (G.data.art) for the monster, native and dwelling pictures; without it the names show without pictures. Returns a DOM element for a sheet body;
 * it is static and needs no mounted map.
 */
export function mapLegend({ art } = {}) {
    const swatch = (inner, w, hh, k = 1.4) => sv('svg', { class: 'realm-svg mv-swatch', width: Math.ceil(w * k), height: Math.ceil(hh * k), viewBox: `0 0 ${w} ${hh}`, 'aria-hidden': 'true' }, inner);
    const pillSw = (t, num) => { const w = pillWidth(t.label, { img: !!t.img }) + NUM_W, hh = t.img ? 17 : PILL_H; return swatch(pillEl(t, { x: 0, y: 0, w, h: hh }, num, null), w, hh); };
    const box = (...kids) => h('span', { class: 'mv-key-box' }, ...kids);
    const row = (sw, text) => h('div', { class: 'mv-key-row' }, h('span', { class: 'mv-key-sw' }, sw), h('span', { class: 'mv-key-tx' }, text));
    const section = text => h('div', { class: 'mv-key-h' }, text);
    const mons = art?.monsters ?? {}, nats = art?.natives ?? {}, dw = art?.dwellings ?? {};
    const badgeSegs = [{ k: 'mon', n: 3 }, { k: 'nat', n: 1 }, { k: 'dwelling', n: 1 }, { k: 'site', n: 2, disc: true }];
    const bw = badgeWidth(badgeSegs, false, true);
    const ringBox = kind => box(h('i', { class: `ds-ring ${kind}`, style: 'left:22px;top:22px' }));
    const stopBox = n => box(h('b', { class: 'ds-stop', style: 'left:22px;top:22px' }, String(n)));
    return h('div', { class: 'mv-key' },
        section('Here on the map'),
        row(pillSw({ k: 'mon', label: 'Wolf x2', img: mons.Wolf ?? null }, 4), 'Monsters here'),
        row(pillSw({ k: 'nat', label: 'Rogues x8', img: nats.R1 ?? null }, 4), 'Natives here'),
        row(pillSw({ k: 'dwelling', label: 'Inn', img: dw.Inn ?? null }, 4), 'A dwelling'),
        row(pillSw({ k: 'site', label: '\u25C6 Cairns \u2713', disc: true }, 5), 'A discovered site'),
        row(pillSw({ k: 'site', label: '\u25C6 Altar' }, 5), 'A site, not found yet'),
        row(pillSw({ k: 'sound', label: '\u266A Roar' }, 5), 'A sound nearby'),
        row(swatch(chitPillEl('warning', '! Stink', { x: 0, y: 0, w: pillWidth('! Stink'), h: PILL_H }), pillWidth('! Stink'), PILL_H), 'A warning'),
        row(swatch(downChitEl(8, 8), 16, 16, 1.6), 'A face-down chit'),
        row(swatch(badgeEl({ segs: badgeSegs, num: 4 }, bw, {}), bw + 1, 13, 1.6), 'Several things: tap it'),
        section('Roads and you'),
        row(swatch(pathMarkEl('hidden', 12, 10, 20), 24, 20, 1.6), 'A hidden path, not found'),
        row(swatch(pathMarkEl('secret', 12, 10, 20), 24, 20, 1.6), 'A secret passage, not found'),
        row(box(h('i', { class: 'ds-hero', style: 'left:22px;top:22px' })), 'You, in plain sight'),
        row(box(h('i', { class: 'ds-hero hidden', style: 'left:22px;top:22px' })), 'You, hidden'),
        row(ringBox('legal'), 'You may go there'),
        row(ringBox('maybe'), 'Maybe: a path to find'),
        row(ringBox('illegal'), 'Not now'),
        row(ringBox('danger'), 'Danger there'),
        row(stopBox(1), 'Your planned road'));
}
