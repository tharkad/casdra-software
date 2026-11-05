// kindart_sites.js: colour illustrations of the site cards (Hoard and Lair live in kindart.js). A site is a place: each is a small fantasy scene on a tile of its own mood.
// Original drawings; nothing is traced or taken from the game's art or any other game's.
import { n, ell, star, cap, INK, EDGE } from './kindart.js';
const P = fill => ({ fill, stroke: EDGE.site });

// ---- shrine: a little roadside shrine, a candle burning in its niche, offerings on the step, dusk behind ----
const roofLines = [];
for (let i = 1; i < 5; i++) roofLines.push(`M${n(24 - 2.8 * i - 2)} ${n(10 + 3.1 * i)}L${n(24 + 2.8 * i + 2)} ${n(10 + 3.1 * i)}`);
const shrine = {
    colour: true, vb: 48, bg: P('#3f5a78'),
    shapes: [
        { d: ell(36, 11, 4.2, 4.2), fill: '#f6efc8' }, { d: ell(37.6, 10, 3.6, 3.6), fill: '#3f5a78' },
        { d: 'M0 40C10 37 38 37 48 40V48H0Z', fill: '#3f7a4a' }, { d: 'M0 40C10 37 38 37 48 40', stroke: '#6fc06a', sw: 1.4 },
        { d: ell(24, 28, 18, 16), fill: '#ffd34f', op: 0.1 },
        { d: 'M12 41V22H36V41Z', fill: '#b9b3a3', stroke: INK, sw: 2 },
        { d: 'M14 23V40', stroke: '#e0dccd', sw: 1.4 },
        { d: 'M7.6 23.6L24 7.6L40.4 23.6Z', fill: '#a8442f', stroke: INK, sw: 2 },
        { d: roofLines.join(''), stroke: '#6e2a1c', sw: 1.2 },
        { d: 'M10 22.6L24 9', stroke: '#e0866a', sw: 1.4 },
        { d: ell(24, 6.2, 1.9, 1.9), fill: '#f0c23c', stroke: INK, sw: 1.2 },
        { d: 'M18.6 41V30C18.6 26 21 24.4 24 24.4S29.4 26 29.4 30V41Z', fill: '#1d1620', stroke: INK, sw: 1.6 },
        { d: ell(24, 35, 5, 5), fill: '#ffb03a', op: 0.3 },
        { d: 'M22.6 38.4H25.4V41H22.6Z', fill: '#f3ead0', stroke: INK, sw: 1 },
        { d: 'M24 32.6C25.4 34 25.8 35 25.8 36A1.8 1.8 0 0 1 22.2 36C22.2 35 23.4 34.4 24 32.6Z', fill: '#ff9a2a' }, { d: 'M24 34.6C24.6 35.4 24.8 35.8 24.8 36.2A0.8 0.8 0 0 1 23.2 36.2C23.2 35.8 23.8 35.4 24 34.6Z', fill: '#fff1a8' },
        { d: 'M8 41H40V44.4H8Z', fill: '#8c8678', stroke: INK, sw: 1.8 },
        { d: ell(12.4, 39.6, 1.6, 1.6), fill: '#d1303f', stroke: INK, sw: 0.9 }, { d: ell(15.4, 39.8, 1.4, 1.4), fill: '#ffffff', stroke: INK, sw: 0.9 }, { d: ell(33.6, 39.8, 1.4, 1.4), fill: '#f0c23c', stroke: INK, sw: 0.9 }, { d: ell(36.4, 39.6, 1.6, 1.6), fill: '#d1303f', stroke: INK, sw: 0.9 },
        { d: star(9, 12, 2.4, 0.2), fill: '#ffffff' }, { d: star(16, 5, 1.8, 0.2), fill: '#d6e0ff' },
    ],
};

// ---- pool: a still forest pool under a night moon, lily pads, reeds and rocks ----
const pool = {
    colour: true, vb: 48, bg: P('#1f3a4a'),
    shapes: [
        { d: ell(35, 10, 4.6, 4.6), fill: '#f6efc8' }, { d: ell(36.8, 9, 4, 4), fill: '#1f3a4a' },
        { d: star(14, 9, 2.4, 0.2), fill: '#d6e0ff' }, { d: star(24, 6, 1.8, 0.2), fill: '#fff0a0' },
        { d: 'M6 30C6 23 14 20 24 20S42 23 42 30C42 38 34 42 24 42S6 38 6 30Z', fill: '#2c86b0', stroke: INK, sw: 2 },
        { d: 'M9 29C9 24 15 22.4 24 22.4S39 24 39 29', stroke: '#6fc4e6', sw: 1.4, op: 0.8 },
        { d: 'M34 25C35.4 28 35.4 32 34 35', stroke: '#fff3b0', sw: 1.4, op: 0.8, dash: '2 2' },
        { d: ell(24, 31, 5.4, 2, 0), stroke: '#a9e4f6', sw: 1.2, op: 0.9 }, { d: ell(24, 31, 9, 3.4, 0), stroke: '#a9e4f6', sw: 1, op: 0.6 },
        { d: 'M7 35C4 35 3 38 5 40C8 42 12 41 13 38Z', fill: '#8e8c88', stroke: INK, sw: 1.6 },
        { d: 'M41 35C44 35 45.4 38 43 40.4C40 42 36 41 35 38Z', fill: '#8e8c88', stroke: INK, sw: 1.6 },
        { d: 'M15 40C13 44 21 44.6 24 42.4C27 44.6 36 44 33 40Z', fill: '#76746f', stroke: INK, sw: 1.5 },
        { d: ell(16, 33, 4, 2.2), fill: '#4fae42', stroke: '#14301b', sw: 1.2 }, { d: ell(30, 36, 3.6, 2, 8), fill: '#4fae42', stroke: '#14301b', sw: 1.2 },
        { d: ell(16.4, 32.4, 1.6, 1.1), fill: '#ff9ac0' }, { d: ell(16.4, 31.6, 0.9, 0.9), fill: '#ffe27a' },
        { d: 'M6 31C5 24 6.6 17 5.4 11M10 33C10.4 25 9 18 10.6 13', stroke: '#2f6a2a', sw: 1.6 },
        { d: ell(5.4, 10.4, 1.4, 3.2), fill: '#6a4a2a', stroke: INK, sw: 1 }, { d: ell(10.6, 12.4, 1.4, 3.2), fill: '#6a4a2a', stroke: INK, sw: 1 },
        { d: 'M41 32C42 26 40.6 20 42 15', stroke: '#2f6a2a', sw: 1.6 }, { d: ell(42, 14.4, 1.4, 3.2), fill: '#6a4a2a', stroke: INK, sw: 1 },
        { d: ell(20, 15, 1, 1), fill: '#e8ff7a' }, { d: ell(30, 17, 0.9, 0.9), fill: '#e8ff7a' }, { d: ell(14, 20, 0.9, 0.9), fill: '#e8ff7a' },
    ],
};

// ---- altar: a carved stone altar, two candles and a bowl of fire, runes glowing, in a violet dark ----
const flame = (x, y, s = 1) => [
    { d: `M${x} ${n(y - 6 * s)}C${n(x + 2.6 * s)} ${n(y - 2.8 * s)} ${n(x + 3.6 * s)} ${n(y - 1.4 * s)} ${n(x + 3.6 * s)} ${n(y + 0.6 * s)}A${n(3.6 * s)} ${n(3.6 * s)} 0 0 1 ${n(x - 3.6 * s)} ${n(y + 0.6 * s)}C${n(x - 3.6 * s)} ${n(y - 1.6 * s)} ${n(x - 1.4 * s)} ${n(y - 3 * s)} ${n(x - 1 * s)} ${n(y - 4.4 * s)}C${n(x - 0.2 * s)} ${n(y - 4 * s)} ${x} ${n(y - 5 * s)} ${x} ${n(y - 6 * s)}Z`, fill: '#ff8a1f', stroke: '#d1560a', sw: 0.9 },
    { d: `M${x} ${n(y - 2.8 * s)}C${n(x + 1.4 * s)} ${n(y - 1 * s)} ${n(x + 1.8 * s)} ${n(y - 0.2 * s)} ${n(x + 1.8 * s)} ${n(y + 0.6 * s)}A${n(1.8 * s)} ${n(1.8 * s)} 0 0 1 ${n(x - 1.8 * s)} ${n(y + 0.6 * s)}C${n(x - 1.8 * s)} ${n(y - 0.4 * s)} ${n(x - 0.4 * s)} ${n(y - 1 * s)} ${x} ${n(y - 2.8 * s)}Z`, fill: '#fff1a8' }];
const altar = {
    colour: true, vb: 48, bg: P('#40304a'),
    shapes: [
        { d: ell(24, 22, 20, 18), fill: '#ff9a2a', op: 0.1 },
        { d: 'M5 39H43V44H5Z', fill: '#6d6678', stroke: INK, sw: 1.8 },
        { d: 'M9 24H39V39H9Z', fill: '#9a94a6', stroke: INK, sw: 2 },
        { d: 'M5.6 24H42.4V29.4H5.6Z', fill: '#b6b0c2', stroke: INK, sw: 2 },
        { d: 'M7 26H24', stroke: '#e6e2ee', sw: 1.3 },
        { d: 'M24 29V38', stroke: '#7b7588', sw: 1.2 },
        { d: 'M16.6 31.6V36.4M16.6 34L19.6 31.6M16.6 35.4L19.6 33M29.6 31.6L32.4 36.4L29.6 36.4M32.4 31.6L29.6 36.4', stroke: '#7ef0ff', sw: 1.6 },
        { d: 'M19.4 24C19.4 20.4 21.4 19 24 19S28.6 20.4 28.6 24Z', fill: '#3a3446', stroke: INK, sw: 1.7 },
        ...flame(24, 17, 1.1),
        { d: 'M9 14H13.4V24H9Z', fill: '#f3ead0', stroke: INK, sw: 1.5 }, ...flame(11.2, 12.6, 0.62),
        { d: 'M34.6 14H39V24H34.6Z', fill: '#f3ead0', stroke: INK, sw: 1.5 }, ...flame(36.8, 12.6, 0.62),
        { d: 'M24 9C22 7 25.6 5 23.6 3', stroke: '#c9c2d8', sw: 1.4, op: 0.7 },
        { d: star(42, 12, 2.6, 0.2), fill: '#d9ccff' }, { d: star(6, 8, 2.2, 0.2), fill: '#d9ccff' },
    ],
};

// ---- vault: a round iron vault door with a gold lock wheel and rivets, set in a stone wall, a torch beside it ----
const bricks = [];
for (let r = 0; r < 6; r++) { const y = 5 + r * 7.2; bricks.push(`M0 ${n(y)}H48`); for (let c = 0; c < 6; c++) { const x = (r % 2 ? 4 : 0) + c * 8 + 6; if (x < 48) bricks.push(`M${x} ${n(y)}V${n(y + 7.2)}`); } }
const rivets = [];
for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; rivets.push({ d: ell(24 + 15.2 * Math.cos(a), 25 + 15.2 * Math.sin(a), 1.2, 1.2), fill: '#c9cfdc', stroke: INK, sw: 0.8 }); }
const spokes = [];
for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; spokes.push(`M${n(24 + 3 * Math.cos(a))} ${n(25 + 3 * Math.sin(a))}L${n(24 + 8.4 * Math.cos(a))} ${n(25 + 8.4 * Math.sin(a))}`); }
const knobs = [];
for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; knobs.push({ d: ell(24 + 9 * Math.cos(a), 25 + 9 * Math.sin(a), 2, 2), fill: '#f0c23c', stroke: INK, sw: 1.3 }); }
const vault = {
    colour: true, vb: 48, bg: P('#4f4b58'),
    shapes: [
        { d: bricks.join(''), stroke: '#2e2b36', sw: 1.1, op: 0.8 },
        { d: ell(24, 25, 20.4, 20.4), fill: '#2e2b36' },
        { d: ell(24, 25, 18, 18), fill: '#6a6f7c', stroke: INK, sw: 2 },
        { d: ell(24, 25, 13.4, 13.4), fill: '#4d515b', stroke: INK, sw: 1.6 },
        { d: 'M9 19C10.4 14.4 14.4 10.8 19.4 9.6', stroke: '#c9cfdc', sw: 1.8, op: 0.9 },
        ...rivets,
        { d: 'M24 11.6V15M24 35V38.4M10.6 25H14M34 25H37.4', stroke: INK, sw: 4.4 }, { d: 'M24 11.6V15M24 35V38.4M10.6 25H14M34 25H37.4', stroke: '#9aa0ae', sw: 2.4 },
        { d: spokes.join(''), stroke: INK, sw: 4.6 }, { d: spokes.join(''), stroke: '#e5b032', sw: 2.6 },
        ...knobs,
        { d: ell(24, 25, 4.8, 4.8), fill: '#f0c23c', stroke: INK, sw: 1.8 },
        { d: ell(24, 24.4, 1.4, 1.4), fill: INK }, { d: 'M24 25V28', stroke: INK, sw: 1.6 },
        { d: 'M2 28H6V42H2Z', fill: '#5a3414', stroke: INK, sw: 1.3 }, ...flame(4, 27, 0.9),
        { d: ell(4, 23, 6, 6), fill: '#ffb03a', op: 0.2 },
        { d: star(41, 8, 2.6, 0.2), fill: '#e6e2ee' },
    ],
};

// ---- cairns: stacked stones on a hill at sunset, a rune faintly lit on the top stone ----
const stone = (cx, cy, rx, ry, fill = '#9a9488') => [{ d: ell(cx, cy, rx, ry), fill, stroke: INK, sw: 1.6 }, { d: `M${n(cx - rx * 0.6)} ${n(cy - ry * 0.3)}C${n(cx - rx * 0.4)} ${n(cy - ry * 0.7)} ${n(cx)} ${n(cy - ry * 0.8)} ${n(cx + rx * 0.2)} ${n(cy - ry * 0.7)}`, stroke: '#cdc7ba', sw: 1.1 }];
const cairns = {
    colour: true, vb: 48, bg: P('#6b4a7a'),
    shapes: [
        { d: ell(10, 33, 11, 11), fill: '#ffb36a', op: 0.45 }, { d: ell(10, 33, 6, 6), fill: '#ffd28a' },
        { d: 'M0 30C8 26 14 34 22 31C30 28 38 33 48 29V48H0Z', fill: '#4a6a4a' }, { d: 'M0 30C8 26 14 34 22 31C30 28 38 33 48 29', stroke: '#7fbf6f', sw: 1.5 },
        { d: 'M0 40C14 36 34 40 48 37V48H0Z', fill: '#3a5a3c' },
        ...stone(26, 40.4, 10, 3.8, '#8a8478'), ...stone(26, 34.2, 8, 3.4), ...stone(26.6, 28.4, 6, 3), ...stone(26, 23.2, 4.4, 2.6, '#a9a396'), ...stone(26.4, 19, 3, 2, '#b8b2a4'),
        { d: 'M25.4 18L26.4 20.4L27.6 18', stroke: '#7ef0ff', sw: 1.2 },
        ...stone(40, 41.6, 5.4, 2.6, '#8a8478'), ...stone(40.4, 37.8, 4, 2.2), ...stone(40, 34.6, 2.8, 1.8, '#a9a396'),
        { d: 'M27 8C26 6 28 5 27.4 3', stroke: '#e6d8f0', sw: 1.2, op: 0.7 },
        { d: star(40, 10, 2.6, 0.2), fill: '#fff0d0' }, { d: star(18, 7, 2, 0.2), fill: '#ffe9c8' },
        { d: 'M31 38.4C32 37 34 37.2 34.6 38.6', stroke: '#4fae42', sw: 1.6 }, { d: 'M14 41C15.4 39.6 17 40 17.6 41.4', stroke: '#4fae42', sw: 1.6 },
    ],
};

// ---- statue: an old stone knight on a plinth, sword planted before him, moss and ivy, eyes faintly lit ----
const statue = {
    colour: true, vb: 48, bg: P('#4a5a4a'),
    shapes: [
        { d: ell(24, 24, 18, 20), fill: '#bff0c8', op: 0.1 },
        { d: 'M6 41H42V44.6H6Z', fill: '#76746f', stroke: INK, sw: 1.8 },
        { d: 'M10 34H38V41H10Z', fill: '#9a9892', stroke: INK, sw: 2 },
        { d: 'M12 35.4H26', stroke: '#d6d4ce', sw: 1.2 },
        { d: 'M16.4 19C18.6 16.6 29.4 16.6 31.6 19L35 33.6H13Z', fill: '#aeaca6', stroke: INK, sw: 2 },
        { d: 'M24 19V33.6', stroke: '#76746f', sw: 1.4 },
        { d: 'M19.6 11.6C19.6 7.6 21.6 5.4 24 5.4S28.4 7.6 28.4 11.6V15C28.4 17 26.6 18.4 24 18.4S19.6 17 19.6 15Z', fill: '#b9b7b0', stroke: INK, sw: 2 },
        { d: 'M20.4 11H27.6', stroke: INK, sw: 2.2 }, { d: 'M21.8 11H26.2', stroke: '#7ef0ff', sw: 1.1 },
        { d: 'M24 5.4C25.4 3.6 27 3.6 28 4.6', stroke: INK, sw: 1.6 },
        { d: 'M24 21V40', stroke: INK, sw: 6 }, { d: 'M24 21V40', stroke: '#dfe3ea', sw: 3.4 }, { d: 'M23 22V38', stroke: '#ffffff', sw: 1, op: 0.9 },
        { d: 'M19 25H29', stroke: INK, sw: 4.6 }, { d: 'M19 25H29', stroke: '#9aa0ae', sw: 2.6 },
        { d: ell(24, 20.4, 2, 2), fill: '#9aa0ae', stroke: INK, sw: 1.2 },
        { d: 'M14 34C14 31 17 30 18 33C19 36 15 36.4 14 34ZM30 34C30.4 31.4 33.6 31 34.2 33.8C34.6 36 31 36.4 30 34Z', fill: '#4f9a3a' },
        { d: 'M11 41C11 38 14 37.6 14.6 40M33 41C33.4 38 36.4 37.6 37 40', stroke: '#4f9a3a', sw: 1.6 },
        { d: 'M36.4 34C37 30 36 26 37.4 22', stroke: '#2f6a2a', sw: 1.4 }, { d: 'M37.6 26C40 25.6 41 24 41 22C38.6 22.4 37.6 24 37.6 26Z', fill: '#4f9a3a' },
        { d: star(9, 12, 2.4, 0.2), fill: '#e8fff0' }, { d: star(40, 10, 2.8, 0.2), fill: '#e8fff0' },
    ],
};

export const ART_SITES = { 'site-shrine': shrine, 'site-pool': pool, 'site-altar': altar, 'site-vault': vault, 'site-cairns': cairns, 'site-statue': statue };
