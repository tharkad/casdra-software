import { h, sv } from '../dom.js';
import { bar, foot, sum } from '../front.js';
import { EDGES, hexCenter, edgeDir, corners, worldEdge } from '../../engine/hex.js';
import { makeRng } from '../../engine/rng.js';
import { generateRealm, tileById } from '../../engine/mapbuild.js';
import { layoutSide } from '../../engine/layout.js';

// Realm viewer: a generated 20-tile realm you can pan and zoom, with a sheet for the tapped clearing.
// This is a development view (every path is shown on request); the real game shows each character only what they have discovered.
const S = 100;                                               // hex circumradius in map units; a clearing is 23 units across
const KIND = { open: 'Road', tunnel: 'Tunnel', hidden: 'Hidden path', secret: 'Secret passage' };
const GROUP = { valley: '#26382f', woods: '#1f3a2a', mountain: '#3a3530', cave: '#2c2a3a' };
const CLEARING = { woods: '#3f7a52', mountain: '#8d7a62', cave: '#5a4f7a' };
const MAGIC = { grey: '#aeb4bd', gold: '#e8c868', purple: '#b08cf0' };
const NAMES = { BL: 'Borderland', AV: 'Awful Valley', BV: 'Bad Valley', CV: 'Curst Valley', DV: 'Dark Valley', EV: 'Evil Valley', LW: 'Linden Woods', MW: 'Maple Woods',
    NW: 'Nut Woods', OW: 'Oak Woods', PW: 'Pine Woods', CL: 'Cliff', CR: 'Crag', LE: 'Ledges', MT: 'Mountain', DW: 'Deep Woods', CN: 'Cavern', CA: 'Caves', HP: 'High Pass', RU: 'Ruins' };

const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

let tilesCache;
async function loadTiles() {
    if (!tilesCache) tilesCache = (await (await fetch('data/tiles.json')).json()).tiles;
    return tilesCache;
}

// A small picture of the realm of one seed: the twenty tiles as coloured hexes (valley, woods, mountain, cave), for the New game wizard's realm card. Filled in once the tile list has loaded.
export function realmThumb(seed) {
    const el = h('span', { class: 'art ds-realmthumb', 'aria-hidden': 'true' });
    loadTiles().then(tiles => {
        const placements = generateRealm(tiles, makeRng(seed)).placements, R = 100;
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        const polys = placements.map(p => {
            const [cx, cy] = hexCenter(p.q, p.r, R);
            minX = Math.min(minX, cx - R); maxX = Math.max(maxX, cx + R); minY = Math.min(minY, cy - R * .87); maxY = Math.max(maxY, cy + R * .87);
            return sv('polygon', { points: corners(R - 4).map(([x, y]) => `${(x + cx).toFixed(1)},${(y + cy).toFixed(1)}`).join(' '), fill: GROUP[tileById(tiles, p.id).group] ?? '#26382f' });
        });
        el.append(sv('svg', { viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`, preserveAspectRatio: 'xMidYMid meet', width: '100%', height: '100%' }, ...polys));
    }).catch(() => {});
    return el;
}

export function realmScreen(ctx) {
    const st = ctx.realm ?? (ctx.realm = { seed: 1, showHidden: false, enchanted: false, sel: null, view: null });
    // This is the realm the game will be played in (the wizard's seed): the tile layout is public, so it is shown; hidden paths, secret passages and the enchanted side are not.
    const root = h('main', { class: 'screen ds-screen ds-title flush realm', 'data-screen': 'realm' });
    const mapBox = h('div', { class: 'mapbox' });
    const sheet = h('div', { class: 'sheet', hidden: true });
    const seedLabel = h('span', { class: 'ds-meta seedlbl' });
    let tiles, placements, svg, world, size = [1, 1];

    const leave = () => { if (ctx.newGame) ctx.newGame.seed = st.seed; ctx.go('newgame'); };
    const dock = foot();

    function drawDock() {
        dock.replaceChildren(
            h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'another', onclick: () => { st.seed = (st.seed % 9999) + 1; st.sel = null; st.view = null; rebuild(); } }, 'Another realm'),
            h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'use-realm', onclick: leave }, 'Use this realm'));
        seedLabel.textContent = `Seed ${st.seed}`;
    }

    function pathStyle(kind) {
        return { open: { stroke: '#d8cba8', w: 2.4 }, tunnel: { stroke: '#9a8fb8', w: 2.4, dash: '6 4' },
            hidden: { stroke: '#c58a4a', w: 2.2, dash: '1.5 4' }, secret: { stroke: '#8fd0c8', w: 2.2, dash: '1.5 4' } }[kind];
    }

    function drawMap() {
        const side = st.enchanted ? 'enchanted' : 'normal';
        const g = sv('g', { class: 'world' });
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (const p of placements) {
            const tile = tileById(tiles, p.id), def = tile.sides[side], lay = layoutSide(tile, side);
            const [cx, cy] = hexCenter(p.q, p.r, S), a = p.rot * Math.PI / 3;
            minX = Math.min(minX, cx - S); maxX = Math.max(maxX, cx + S); minY = Math.min(minY, cy - S * .87); maxY = Math.max(maxY, cy + S * .87);
            const pos = Object.fromEntries(def.clearings.map(c => [c.n, rot(lay.pos[c.n], a).map(v => v * S)]));
            const tg = sv('g', { transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`, 'data-tile': p.id });
            tg.append(sv('polygon', { class: 'hex', points: corners(S - 1.5).map(c => c.join(',')).join(' '), fill: GROUP[tile.group] }));
            const paths = sv('g', { class: 'paths' });
            def.paths.forEach(path => {
                if (!st.showHidden && (path.kind === 'hidden' || path.kind === 'secret')) return;
                const A = pos[path.a], B = pos[path.b], s = pathStyle(path.kind);
                paths.append(sv('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: s.stroke, 'stroke-width': s.w, 'stroke-dasharray': s.dash ?? null, 'stroke-linecap': 'round' }));
            });
            EDGES.forEach((name, le) => {
                const n = def.edges[name];
                if (n == null) return;
                const [dx, dy] = edgeDir(worldEdge(le, p.rot)), A = pos[n];
                paths.append(sv('line', { x1: A[0], y1: A[1], x2: dx * S * .866, y2: dy * S * .866, stroke: '#d8cba8', 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
            });
            tg.append(paths);
            tg.append(sv('text', { class: 'tname', y: S * .8, 'text-anchor': 'middle' }, NAMES[p.id].toUpperCase()));
            def.clearings.forEach(c => {
                const [x, y] = pos[c.n], sel = st.sel && st.sel.id === p.id && st.sel.n === c.n;
                const ring = c.magic?.length ? MAGIC[c.magic[0]] : null;
                tg.append(sv('g', { class: `clr${sel ? ' sel' : ''}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, 'data-clearing': p.id + c.n, onclick: e => { e.stopPropagation(); st.sel = { id: p.id, n: c.n }; drawMap(); drawSheet(); } },
                    sv('circle', { r: 17, fill: 'transparent' }),
                    sv('circle', { r: 11.5, fill: CLEARING[c.type], stroke: ring ?? '#0c0e14', 'stroke-width': ring ? 3 : 1.5 }),
                    sv('text', { 'text-anchor': 'middle', dy: '.35em' }, String(c.n))));
            });
            g.append(tg);
        }
        world = { minX, minY, maxX, maxY };
        if (!st.view) st.view = fit();
        svg.replaceChildren(g);
        applyView();
    }

    function fit() {
        const [w, hh] = size, bw = world.maxX - world.minX + 40, bh = world.maxY - world.minY + 40;
        const k = Math.min(w / bw, hh / bh);
        return { k, x: w / 2 - (world.minX + world.maxX) / 2 * k, y: hh / 2 - (world.minY + world.maxY) / 2 * k };
    }
    function applyView() {
        const g = svg.querySelector('.world');
        if (g) g.setAttribute('transform', `translate(${st.view.x.toFixed(1)} ${st.view.y.toFixed(1)}) scale(${st.view.k.toFixed(4)})`);
    }

    function drawSheet() {
        if (!st.sel) { sheet.hidden = true; return; }
        const side = st.enchanted ? 'enchanted' : 'normal', tile = tileById(tiles, st.sel.id), def = tile.sides[side];
        const c = def.clearings.find(x => x.n === st.sel.n);
        const roads = [];
        def.paths.filter(p => (p.a === c.n || p.b === c.n) && (st.showHidden || (p.kind !== 'hidden' && p.kind !== 'secret'))).forEach(p => roads.push(`${KIND[p.kind]} to ${p.a === c.n ? p.b : p.a}${p.bridge ? ' (bridge)' : ''}`));
        EDGES.forEach(name => { if (def.edges[name] === c.n) roads.push(`Road off the tile, ${name} edge`); });
        sheet.hidden = false;
        sheet.replaceChildren(
            h('div', { class: 'grab' }),
            h('div', { class: 'sheet-head' }, h('b', {}, `${NAMES[tile.id]} ${c.n}`), h('span', {}, `${c.type} clearing`)),
            ...(c.magic?.length ? [h('div', { class: 'hint' }, `Enchanted: ${c.magic.join(', ')} magic here`)] : []),
            h('ul', { class: 'roads' }, roads.map(r => h('li', {}, r))),
            h('button', { type: 'button', class: 'ds-btn sm', onclick: () => { st.sel = null; drawMap(); drawSheet(); } }, 'Close'));
    }

    // Pan with one finger, pinch with two, zoom with the wheel.
    function wire() {
        const pts = new Map(); let last = null, moved = 0;
        const down = new Map();   // capture the pointer only once it has really moved, so a plain tap still reaches the clearing under it
        svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); down.set(e.pointerId, [e.clientX, e.clientY]); last = null; moved = 0; });
        svg.addEventListener('pointermove', e => {
            if (!pts.has(e.pointerId)) return;
            const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
            const d0 = down.get(e.pointerId);
            if (d0 && Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 6) { svg.setPointerCapture(e.pointerId); down.delete(e.pointerId); moved = 1; }
            if (down.has(e.pointerId)) return;                 // not yet a drag
            if (pts.size === 1) { st.view.x += e.clientX - prev[0]; st.view.y += e.clientY - prev[1]; applyView(); }
            else if (pts.size === 2) {
                const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                if (last) zoomAt(mid[0], mid[1], d / last.d, mid[0] - last.mid[0], mid[1] - last.mid[1]);
                last = { d, mid };
            }
        });
        const up = e => { pts.delete(e.pointerId); down.delete(e.pointerId); last = null; };
        svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
        svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015), 0, 0); }, { passive: false });
        svg.addEventListener('click', () => { if (moved) { moved = 0; return; } if (st.sel) { st.sel = null; drawMap(); drawSheet(); } });
    }
    function zoomAt(px, py, f, dx, dy) {
        const r = svg.getBoundingClientRect(), x = px - (px > r.width ? r.left : 0);
        const k = Math.min(6, Math.max(0.2, st.view.k * f)), real = k / st.view.k;
        st.view.x = x - (x - st.view.x) * real + dx; st.view.y = py - (py - st.view.y) * real + dy; st.view.k = k;
        applyView();
    }

    function rebuild() {
        placements = generateRealm(tiles, makeRng(st.seed)).placements;
        st.view = null;
        size = [mapBox.clientWidth || 360, mapBox.clientHeight || 520];
        drawMap(); drawSheet(); drawDock();
    }

    root.append(
        bar('Your realm', { onBack: leave }),
        h('div', { class: 'ds-pad ds-realmcap' }, seedLabel, h('span', { class: 'ds-meta' }, 'Pinch to look closer. Tap a clearing to see its roads.')),
        mapBox, sheet, dock);
    svg = sv('svg', { class: 'realm-svg', width: '100%', height: '100%' });
    mapBox.append(svg);
    drawDock();
    loadTiles().then(t => { tiles = t; wire(); requestAnimationFrame(rebuild); });
    return root;
}
