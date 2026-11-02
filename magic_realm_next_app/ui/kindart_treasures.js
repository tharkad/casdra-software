// kindart_treasures.js: colour illustrations of the treasure kinds (format and rules: see kindart.js). Original drawings; nothing is traced or taken from the game's art or any other game's.
import { n, ell, star, cap, INK, EDGE } from './kindart.js';
const T = fill => ({ fill, stroke: EDGE.treasure });

// ---- garment: a crimson cloak with a gold clasp and hem ----
const garment = {
    colour: true, vb: 48, bg: T('#cfd8e3'),
    shapes: [
        { d: ell(24, 44, 17, 1.6), fill: '#8d9bb0', op: 0.5 },
        { d: 'M16 14C19 16.4 29 16.4 32 14C36.4 22 40.4 32 41.4 41.4C34 43.4 14 43.4 6.6 41.4C7.6 32 11.6 22 16 14Z', fill: '#b02a37', stroke: INK, sw: 2 },
        { d: 'M24 17.6V42.6', stroke: '#6e1520', sw: 1.8 },
        { d: 'M18 20L13.4 40.6M30 20L34.6 40.6', stroke: '#8f1f2c', sw: 1.6 },
        { d: 'M14.4 24L10.6 36', stroke: '#e0707a', sw: 1.8 },
        { d: 'M7 38.6C14 40.8 34 40.8 41 38.6', stroke: '#f0c23c', sw: 2.4 },
        { d: 'M17 14.4C15.6 8.4 19.6 4.6 24 4.6S32.4 8.4 31 14.4C29 16.4 19 16.4 17 14.4Z', fill: '#8f1f2c', stroke: INK, sw: 2 },
        { d: 'M20.4 11.6C20 8.8 22 7.4 24 7.4S28 8.8 27.6 11.6C26.4 13.6 21.6 13.6 20.4 11.6Z', fill: '#3a0f15' },
        { d: 'M17.6 13.4C20.6 15.6 27.4 15.6 30.4 13.4', stroke: '#f0c23c', sw: 1.6 },
        { d: 'M20.6 17.8L24 21.6L27.4 17.8', stroke: '#e5b032', sw: 1.4 },
        { d: ell(24, 17.2, 2.6, 2.6), fill: '#f6d35a', stroke: INK, sw: 1.5 },
        { d: star(29, 27, 3.4, 0.2), fill: '#ffe9ee' },
    ],
};

// ---- gloves: a leather gauntlet, steel plate and rivets on the back of the hand ----
const gloves = {
    colour: true, vb: 48, bg: T('#2f4650'),
    shapes: [
        { d: cap(15, 11, 4.8, 26), fill: '#c98b4c', stroke: INK, sw: 1.9 },
        { d: cap(20.4, 7, 4.8, 26), fill: '#c98b4c', stroke: INK, sw: 1.9 },
        { d: cap(25.8, 9, 4.8, 26), fill: '#c98b4c', stroke: INK, sw: 1.9 },
        { d: cap(31.2, 14, 4.2, 26), fill: '#c98b4c', stroke: INK, sw: 1.9 },
        { d: 'M14.6 33C11 31.6 8.4 28 7.4 23.6C7 21.2 9.8 20 11.2 21.8C12.8 23.8 14 25 15.4 25.6Z', fill: '#c98b4c', stroke: INK, sw: 1.9 },
        { d: 'M14.4 24.4H35.4V34H14.4Z', fill: '#c98b4c', stroke: INK, sw: 1.9 },
        { d: 'M17.4 13V22M22.8 9.4V22M28.2 11.4V22M33.2 16.2V22', stroke: '#f0c58a', sw: 1.4 },
        { d: 'M17.4 26.4H32.6V31.4H17.4Z', fill: '#aeb7c2', stroke: INK, sw: 1.6 },
        { d: 'M18.4 27.4H31.6', stroke: '#eef2f6', sw: 1.2 },
        { d: ell(19.4, 29.4, 0.9, 0.9), fill: INK }, { d: ell(25, 29.4, 0.9, 0.9), fill: INK }, { d: ell(30.6, 29.4, 0.9, 0.9), fill: INK },
        { d: 'M12.6 34H37.2L38.6 43H11.2Z', fill: '#7a4a22', stroke: INK, sw: 1.9 },
        { d: 'M13.4 37.4H36.4', stroke: '#d9b06a', sw: 1.4, dash: '2 2' },
        { d: ell(16, 40.6, 1.1, 1.1), fill: '#f0c64a' }, { d: ell(24.8, 40.8, 1.1, 1.1), fill: '#f0c64a' }, { d: ell(33.6, 40.6, 1.1, 1.1), fill: '#f0c64a' },
    ],
};

// ---- band: a stout leather belt with a big gold buckle ----
const band = {
    colour: true, vb: 48, bg: T('#2f3d33'),
    shapes: [
        { d: 'M0 16.6C13 14.6 35 14.6 48 16.6V31.4C35 29.4 13 29.4 0 31.4Z', fill: '#b9772f', stroke: INK, sw: 2 },
        { d: 'M0 18.6C13 16.8 35 16.8 48 18.6', stroke: '#e9b36a', sw: 1.4 },
        { d: 'M26 19.2C32 18.6 40 18.6 46 19.2M26 28.8C32 28.2 40 28.2 46 28.8', stroke: '#f2d9a4', sw: 1.2, dash: '2 2' },
        { d: ell(30, 24, 1.3, 1.3), fill: '#2e2012' }, { d: ell(35, 24, 1.3, 1.3), fill: '#2e2012' }, { d: ell(40, 24, 1.3, 1.3), fill: '#2e2012' }, { d: ell(45, 24, 1.3, 1.3), fill: '#2e2012' },
        { d: 'M24 16V32', stroke: '#7a4a1a', sw: 3.4 },
        { d: 'M9 14.4H21V33.6H9Z', stroke: INK, sw: 6 },
        { d: 'M9 14.4H21V33.6H9Z', stroke: '#f0c23c', sw: 3.8 },
        { d: 'M10.4 16H19.6', stroke: '#fff1a8', sw: 1.2 },
        { d: 'M11.6 24H23', stroke: INK, sw: 3.2 }, { d: 'M11.6 24H23', stroke: '#e5b032', sw: 1.6 },
        { d: star(36, 12, 3.2, 0.2), fill: '#fff6c8' },
    ],
};

// ---- potion: a round flask of glowing green draught, corked ----
const potion = {
    colour: true, vb: 48, bg: T('#17323a'),
    shapes: [
        { d: ell(24, 31, 19, 17), fill: '#5fe08a', op: 0.1 },
        { d: 'M21 12V19.8C15.6 21.8 12.6 26.2 12.6 31.8C12.6 38.4 17.6 42.8 24 42.8S35.4 38.4 35.4 31.8C35.4 26.2 32.4 21.8 27 19.8V12Z', fill: '#dff6f8', op: 0.2 },
        { d: 'M13.4 30.4C16 29 19 31.4 22 30.4S28 29.2 30.6 30.4S34 30.4 34.8 30.8C35.2 38 30.4 42.2 24 42.2S12.8 38 13.4 30.4Z', fill: '#47c776' },
        { d: 'M13.4 30.4C16 29 19 31.4 22 30.4S28 29.2 30.6 30.4S34 30.4 34.8 30.8', stroke: '#b8ffd0', sw: 1.4 },
        { d: 'M26 36C29 36 31.6 34 32.4 32', stroke: '#2a9a54', sw: 2.2 },
        { d: 'M21 12V19.8C15.6 21.8 12.6 26.2 12.6 31.8C12.6 38.4 17.6 42.8 24 42.8S35.4 38.4 35.4 31.8C35.4 26.2 32.4 21.8 27 19.8V12', stroke: '#e8fbff', sw: 2 },
        { d: ell(20.6, 35, 1.5, 1.5), fill: '#c9ffd9' }, { d: ell(26.4, 37, 1.1, 1.1), fill: '#c9ffd9' }, { d: ell(23.4, 25.6, 1.3, 1.3), fill: '#c9ffd9', op: 0.8 },
        { d: 'M16.4 27C17.4 24.8 19 23.2 20.8 22.4', stroke: '#ffffff', sw: 2 },
        { d: 'M19.6 6.8H28.4V12.4H19.6Z', fill: '#b0753a', stroke: INK, sw: 1.7 },
        { d: 'M21 8.4H27', stroke: '#dba66a', sw: 1.2 },
        { d: 'M20.4 13.2C22.4 14.6 25.6 14.6 27.6 13.2', stroke: '#f0c23c', sw: 1.8 },
        { d: star(36, 17, 3.4, 0.2), fill: '#ffffff' }, { d: star(11, 20, 2.2, 0.2), fill: '#cfffe0' },
    ],
};

// ---- herb: a tall foxglove-like plant, purple bells on a green stem ----
const bell = (x, y, r) => [
    { d: ell(x, y, 2.5, 3.5, r), fill: '#d88af0', stroke: '#5f2478', sw: 1.2 },
    { d: ell(x + (r > 0 ? 0.6 : -0.6), y + 2.6, 1.2, 0.8), fill: '#5f2478' }];
const herb = {
    colour: true, vb: 48, bg: T('#1f3524'),
    shapes: [
        { d: 'M24 43C24 34 23 24 25.4 9.6', stroke: '#14301b', sw: 4.2 },
        { d: 'M24 43C24 34 23 24 25.4 9.6', stroke: '#6ccb52', sw: 2.2 },
        { d: 'M24 41C16 41 8.6 37 6.6 29.4C14 29.6 21 33 24 39Z', fill: '#5cbf4a', stroke: '#14301b', sw: 1.6 },
        { d: 'M24 41C32 41 39.4 37 41.4 29.4C34 29.6 27 33 24 39Z', fill: '#4fae42', stroke: '#14301b', sw: 1.6 },
        { d: 'M24 32C18 32 13 29 11.6 23.4C17 23.6 22 26 24 30Z', fill: '#6ccb52', stroke: '#14301b', sw: 1.5 },
        { d: 'M24 29C29.6 29 34 26.4 35.4 21.4C30.4 21.6 26 23.6 24 27Z', fill: '#5cbf4a', stroke: '#14301b', sw: 1.5 },
        { d: 'M9 31.6C14 33 19 35.6 22.6 39.4M39 31.6C34 33 29 35.6 25.4 39.4', stroke: '#b8f0a0', sw: 1, op: 0.8 },
        ...bell(20.8, 25, 20), ...bell(28.4, 21.4, -20), ...bell(21, 18.4, 20), ...bell(28.6, 14.6, -20),
        { d: ell(25.2, 9, 2.4, 2.8), fill: '#e7a8f8', stroke: '#5f2478', sw: 1.2 },
        { d: star(36, 10, 3, 0.2), fill: '#f4ffe0' }, { d: star(11, 14, 2.2, 0.2), fill: '#f4ffe0' },
    ],
};

// ---- map: a folded map with mountains, a river, a dotted trail ending in a red X ----
const map = {
    colour: true, vb: 48, bg: T('#3a5a66'),
    shapes: [
        { d: 'M5 12L17 8V37L5 41Z', fill: '#f0dcaa', stroke: INK, sw: 1.9 },
        { d: 'M17 8L31 12V41L17 37Z', fill: '#dcc07c', stroke: INK, sw: 1.9 },
        { d: 'M31 12L43 8V37L31 41Z', fill: '#f0dcaa', stroke: INK, sw: 1.9 },
        { d: 'M7.4 24L10.6 18.6L13.8 24ZM11.4 24L14 20.4L16.4 24Z', fill: '#9c8a6a', stroke: '#5d4a2c', sw: 1.1 },
        { d: 'M9.6 18.6L10.6 17.2L11.6 18.6Z', fill: '#ffffff' },
        { d: 'M19 14C21 18 20.4 21 22.6 25C24.6 28.6 24 32 27 35C28 36 29 37 29.6 38', stroke: '#3f8bd0', sw: 2.4 },
        { d: ell(24.4, 17.4, 2.8, 2.8), fill: '#4f9a3a', stroke: '#2f6a2a', sw: 1 }, { d: ell(21.6, 31, 2.6, 2.6), fill: '#4f9a3a', stroke: '#2f6a2a', sw: 1 }, { d: ell(28, 28.4, 2.4, 2.4), fill: '#4f9a3a', stroke: '#2f6a2a', sw: 1 },
        { d: 'M8 35C12 31 16 34 20 30C24 27 27 31 31 26C34 23 38 25 39.6 19.6', stroke: '#b3202a', sw: 1.9, dash: '1.8 2.8' },
        { d: 'M37.4 14.6L42.2 19.6M42.2 14.6L37.4 19.6', stroke: '#b3202a', sw: 2.6 },
        { d: 'M5.6 13L16.6 9.4', stroke: '#fff8dc', sw: 1.2, op: 0.9 },
    ],
};

// ---- sight: a crystal ball with an eye in it, on a gold stand ----
const sight = {
    colour: true, vb: 48, bg: T('#1d1630'),
    shapes: [
        { d: ell(24, 22, 21, 20), fill: '#7a63d8', op: 0.14 },
        { d: ell(24, 22, 13.4, 13.4), fill: '#5a47c4', stroke: '#2a1f5e', sw: 1.8 },
        { d: ell(22, 20, 10.6, 10.6), fill: '#7d68e0', op: 0.7 },
        { d: ell(20, 17.8, 6, 6), fill: '#a995f5', op: 0.55 },
        { d: 'M10.8 26C14 23 17 28 21 25.6', stroke: '#cfc4ff', sw: 1.4, op: 0.7 },
        { d: 'M16.6 22.6C20 18.6 28 18.6 31.4 22.6C28 26.6 20 26.6 16.6 22.6Z', fill: '#f3efff', stroke: '#2a1f5e', sw: 1.4 },
        { d: ell(24, 22.6, 3.6, 3.6), fill: '#2fd0c0', stroke: '#14705f', sw: 0.9 },
        { d: ell(24, 22.6, 1.5, 1.5), fill: '#0f0a22' },
        { d: ell(22.8, 21.4, 0.8, 0.8), fill: '#ffffff' },
        { d: 'M14 14.4C15.4 12.4 17.4 11 19.6 10.4', stroke: '#ffffff', sw: 2, op: 0.9 },
        { d: 'M12.6 34C14.8 32.4 18.8 31.6 24 31.6S33.2 32.4 35.4 34L37.4 41.4H10.6Z', fill: '#d9a21f', stroke: INK, sw: 1.8 },
        { d: 'M13 35.4C17 37.2 31 37.2 35 35.4', stroke: '#fff0a0', sw: 1.4 },
        { d: 'M10.6 41.4H37.4', stroke: INK, sw: 2.4 },
        { d: star(37, 9, 3.4, 0.2), fill: '#ffffff' }, { d: star(9, 12, 2.2, 0.2), fill: '#d9d0ff' },
    ],
};

// ---- wand: a dark wooden wand with gold bands and a bursting star at its tip ----
const wand = {
    colour: true, vb: 48, bg: T('#d8d4ea'),
    shapes: [
        { d: ell(33, 15, 13, 13), fill: '#7b5cd6', op: 0.22 },
        { d: 'M7.6 41.4L30.4 18.6', stroke: INK, sw: 4.6 },
        { d: 'M7.6 41.4L30.4 18.6', stroke: '#4a2c1a', sw: 2.6 },
        { d: 'M9.4 39.6L29 20', stroke: '#8a5a34', sw: 0.9, op: 0.8 },
        { d: 'M6.4 42.6L10.4 38.6', stroke: INK, sw: 4.8 }, { d: 'M6.4 42.6L10.4 38.6', stroke: '#f3ead0', sw: 2.8 },
        { d: 'M26.4 22.6L30 19', stroke: INK, sw: 4.8 }, { d: 'M26.4 22.6L30 19', stroke: '#f3ead0', sw: 2.8 },
        { d: star(34.4, 14.4, 9, 0.16), fill: '#ffffff', stroke: '#7b5cd6', sw: 1.8 },
        { d: star(34.4, 14.4, 4.2, 0.3), fill: '#e0d4ff' },
        { d: 'M20 30C16 29 14 32 16 34C18 36 21 34 20 32', stroke: '#7b5cd6', sw: 1.3 },
        { d: ell(28, 6.6, 1.5, 1.5), fill: '#7b5cd6' }, { d: ell(43.6, 22, 1.4, 1.4), fill: '#7b5cd6' }, { d: ell(10, 24, 1.2, 1.2), fill: '#7b5cd6' },
        { d: star(22, 9, 2.6, 0.2), fill: '#7b5cd6' }, { d: star(41, 36, 2.8, 0.2), fill: '#7b5cd6' },
    ],
};

// ---- key: an old gold key, a four-lobed bow, collars and a toothed bit ----
const key = {
    colour: true, vb: 48, bg: T('#3b3f4a'),
    shapes: [
        { d: ell(24, 22, 20, 20), fill: '#f0c23c', op: 0.07 },
        { d: 'M24 18V41', stroke: INK, sw: 7 }, { d: 'M24 18V41', stroke: '#f0c23c', sw: 4.6 }, { d: 'M22.4 20V40', stroke: '#fff1a8', sw: 1, op: 0.9 },
        { d: 'M27 33H36.4V36.6H32.4V39.6H36.4V43H27Z', fill: '#f0c23c', stroke: INK, sw: 1.8 },
        { d: ell(24, 7, 4.4, 4.4), fill: '#f0c23c', stroke: INK, sw: 1.8 }, { d: ell(24, 18.6, 4.4, 4.4), fill: '#f0c23c', stroke: INK, sw: 1.8 },
        { d: ell(18.4, 12.8, 4.4, 4.4), fill: '#f0c23c', stroke: INK, sw: 1.8 }, { d: ell(29.6, 12.8, 4.4, 4.4), fill: '#f0c23c', stroke: INK, sw: 1.8 },
        { d: ell(24, 12.8, 6.2, 6.2), fill: '#f0c23c' },
        { d: ell(24, 12.8, 3.4, 3.4), fill: '#3b3f4a', stroke: INK, sw: 1.6 },
        { d: 'M19.4 8.6C20.6 7.2 22 6.4 23.4 6.2', stroke: '#fff6c8', sw: 1.4 },
        { d: 'M19.8 24.4H28.2M19.8 28.4H28.2', stroke: INK, sw: 4.6 }, { d: 'M19.8 24.4H28.2M19.8 28.4H28.2', stroke: '#e5b032', sw: 2.6 },
        { d: star(37, 20, 3.4, 0.2), fill: '#ffffff' }, { d: star(11, 32, 2.4, 0.2), fill: '#fff0a0' },
    ],
};

// ---- pipes: pan pipes of reed, bound with red cord ----
const reeds = [], tops = [];
for (let i = 0; i < 5; i++) {
    const x = n(5 + i * 7.6), y0 = 8 + i * 4.4;
    reeds.push({ d: `M${x} 41V${y0}H${n(x + 7)}V41Z`, fill: i % 2 ? '#c99a44' : '#dcb45e', stroke: INK, sw: 1.8 },
        { d: `M${n(x + 1.8)} ${y0 + 2.4}V38`, stroke: '#f2dc9a', sw: 1.2, op: 0.9 });
    tops.push({ d: ell(x + 3.5, y0, 3.5, 1.5), fill: '#3a2412', stroke: INK, sw: 1.2 });
}
const pipes = {
    colour: true, vb: 48, bg: T('#d5e2d2'),
    shapes: [
        ...reeds, ...tops,
        { d: 'M4.4 24H43.6V28.4H4.4Z', fill: '#b3202a', stroke: INK, sw: 1.6 }, { d: 'M4.4 34H43.6V37.6H4.4Z', fill: '#b3202a', stroke: INK, sw: 1.6 },
        { d: 'M6 25.6H42', stroke: '#e86a6e', sw: 1, op: 0.9 },
        { d: star(40, 7, 3, 0.2), fill: '#ffffff' },
        { d: ell(36.6, 15.6, 1.5, 1.2, -20), fill: INK }, { d: 'M37.8 15.2V10.6L41 11.6', stroke: INK, sw: 1.3 },
    ],
};

// ---- book: a spell book, purple leather, gold corners and clasp, a glowing star sigil ----
const book = {
    colour: true, vb: 48, bg: T('#c9e0e6'),
    shapes: [
        { d: ell(25, 44.4, 17, 1.5), fill: '#7fa1ab', op: 0.5 },
        { d: 'M14 10H40V43H14Z', fill: '#f3ead0', stroke: INK, sw: 1.8 },
        { d: 'M16 41.4H40M16 38.8H40', stroke: '#cdbf98', sw: 1, op: 0.9 },
        { d: 'M9 6H35.6C37.2 6 38.2 7 38.2 8.6V38.2C38.2 39.8 37.2 40.8 35.6 40.8H9Z', fill: '#6b2a7a', stroke: INK, sw: 2 },
        { d: 'M9 6H16V40.8H9Z', fill: '#4a1a58', stroke: INK, sw: 1.8 },
        { d: 'M9 12H16M9 20H16M9 28H16M9 35H16', stroke: '#f0c23c', sw: 1.6 },
        { d: 'M16 6V40.8', stroke: '#9a58ad', sw: 1.2, op: 0.9 },
        { d: 'M31.6 6H38.2V12.6M31.6 40.8H38.2V34.2', stroke: '#f0c23c', sw: 2.4 },
        { d: ell(27.4, 23.4, 6.8, 6.8), fill: '#4a1a58', stroke: '#f0c23c', sw: 1.8 },
        { d: 'M27.4 17.6L29 21.8L33.4 23.4L29 25L27.4 29.2L25.8 25L21.4 23.4L25.8 21.8Z', fill: '#ffe27a', stroke: '#b97a0a', sw: 0.9 },
        { d: 'M37.6 19.6H42.6V27.2H37.6Z', fill: '#f0c23c', stroke: INK, sw: 1.6 }, { d: ell(40.2, 23.4, 0.9, 0.9), fill: INK },
        { d: 'M11 8.4H14.6', stroke: '#b97ac8', sw: 1.4 },
        { d: star(43, 8, 3, 0.2), fill: '#ffffff' },
    ],
};

// ---- charm: a gold medallion on a chain, an emerald at its heart ----
const dots = [];
for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; dots.push({ d: ell(24 + 10.6 * Math.cos(a), 31 + 10.6 * Math.sin(a), 1, 1), fill: '#7a5208' }); }
const charm = {
    colour: true, vb: 48, bg: T('#e9d2d6'),
    shapes: [
        { d: 'M8 3C8 18 15 22 24 22.4C33 22 40 18 40 3', stroke: INK, sw: 4.4 },
        { d: 'M8 3C8 18 15 22 24 22.4C33 22 40 18 40 3', stroke: '#e5b032', sw: 2.4, dash: '2.6 1.2' },
        { d: ell(24, 22, 2.8, 2.4), fill: '#f0c23c', stroke: INK, sw: 1.5 },
        { d: ell(24, 32, 13, 13), fill: '#f0c23c', stroke: INK, sw: 2 },
        { d: ell(24, 32, 10, 10), fill: '#e0a824', stroke: '#9a6a08', sw: 1.2 },
        ...dots,
        { d: 'M24 25.4L30 32L24 38.6L18 32Z', fill: '#2fc080', stroke: '#0f6a47', sw: 1.4 },
        { d: 'M24 25.4L30 32H24ZM24 25.4L18 32H24Z', fill: '#7dffc0', op: 0.8 },
        { d: 'M17 26C18 24.6 19.4 23.6 21 23.2', stroke: '#fff6c8', sw: 1.6 },
        { d: star(38, 40, 3, 0.2), fill: '#ffffff' },
    ],
};

// ---- jewel: a cut diamond with a ruby and an emerald, glinting ----
const jewel = {
    colour: true, vb: 48, bg: T('#2a2036'),
    shapes: [
        { d: ell(24, 22, 20, 18), fill: '#6fd2f5', op: 0.1 },
        { d: 'M16 8H32L39 16.4L24 34L9 16.4Z', fill: '#5fc8f0', stroke: INK, sw: 2 },
        { d: 'M16 8L19.6 16.4L24 8L28.4 16.4L32 8L39 16.4H9Z', fill: '#bdf0ff' },
        { d: 'M9 16.4H39L24 34Z', fill: '#3aa6d8' },
        { d: 'M19.6 16.4L24 34L28.4 16.4', fill: '#8ee0fa' },
        { d: 'M16 8L9 16.4L24 34L39 16.4L32 8Z', stroke: INK, sw: 2 },
        { d: 'M9 16.4H39M16 8L19.6 16.4L24 8L28.4 16.4L32 8M19.6 16.4L24 34L28.4 16.4', stroke: '#1b6f9a', sw: 1.2 },
        { d: 'M5.4 38.4L8.8 34.6H14.2L17.6 38.4L14.2 42.2H8.8Z', fill: '#d1303f', stroke: INK, sw: 1.6 },
        { d: 'M8.8 34.6L11.5 38.4L14.2 34.6M11.5 38.4V42.2', stroke: '#ff8a96', sw: 1 },
        { d: 'M30.4 38.4L33.8 34.6H39.2L42.6 38.4L39.2 42.2H33.8Z', fill: '#2fc080', stroke: INK, sw: 1.6 },
        { d: 'M33.8 34.6L36.5 38.4L39.2 34.6M36.5 38.4V42.2', stroke: '#9dffcf', sw: 1 },
        { d: star(40, 6, 4, 0.18), fill: '#ffffff' }, { d: star(8, 8, 2.6, 0.2), fill: '#d6f4ff' }, { d: star(24, 41, 2.4, 0.2), fill: '#fff0a0' },
    ],
};

// ---- regalia: a gold crown, set with jewels and pearls, on burgundy ----
const regalia = {
    colour: true, vb: 48, bg: T('#5b1f2b'),
    shapes: [
        { d: ell(24, 26, 21, 19), fill: '#f0c23c', op: 0.1 },
        { d: 'M9.6 34L7 15L16.4 24L24 10.6L31.6 24L41 15L38.4 34Z', fill: '#f0c23c', stroke: INK, sw: 2 },
        { d: 'M12 32.4L9.6 19.6L17 26.4L24 14.6L31 26.4L38.4 19.6L36 32.4Z', fill: '#d89c16', op: 0.5 },
        { d: 'M8.4 33H39.6V40H8.4Z', fill: '#f0c23c', stroke: INK, sw: 2 },
        { d: 'M10 34.6H38', stroke: '#fff1a8', sw: 1.2 },
        { d: ell(24, 36.6, 2.6, 2.4), fill: '#d1303f', stroke: INK, sw: 1.2 }, { d: ell(14.4, 36.6, 2, 2), fill: '#4a8ff0', stroke: INK, sw: 1.1 }, { d: ell(33.6, 36.6, 2, 2), fill: '#4a8ff0', stroke: INK, sw: 1.1 },
        { d: ell(7, 13.4, 2.8, 2.8), fill: '#fffaf0', stroke: INK, sw: 1.3 }, { d: ell(24, 9, 2.8, 2.8), fill: '#fffaf0', stroke: INK, sw: 1.3 }, { d: ell(41, 13.4, 2.8, 2.8), fill: '#fffaf0', stroke: INK, sw: 1.3 },
        { d: ell(24, 25, 2.4, 3), fill: '#2fc080', stroke: INK, sw: 1.2 },
        { d: star(40, 28, 3.2, 0.2), fill: '#ffffff' },
    ],
};

// ---- sacred: a holy grail, radiant, on a night-blue tile ----
const rays = [];
for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12; rays.push(`M${n(24 + 15 * Math.cos(a))} ${n(20 + 15 * Math.sin(a))}L${n(24 + 20.5 * Math.cos(a))} ${n(20 + 20.5 * Math.sin(a))}`); }
const sacred = {
    colour: true, vb: 48, bg: T('#1a2b50'),
    shapes: [
        { d: ell(24, 20, 17, 17), fill: '#ffe27a', op: 0.18 },
        { d: rays.join(''), stroke: '#ffe27a', sw: 2, op: 0.9 },
        { d: 'M14 11H34C34 21.4 30 27.6 24 27.6S14 21.4 14 11Z', fill: '#f3c332', stroke: INK, sw: 2 },
        { d: 'M24 11V27.6', stroke: '#c78f12', sw: 0, op: 0 },
        { d: ell(24, 11, 10, 2.4), fill: '#d89c16', stroke: INK, sw: 1.6 },
        { d: 'M16.6 14C16.8 18 18 21 20 23', stroke: '#fff0a0', sw: 1.6 },
        { d: ell(24, 18.6, 2.4, 3), fill: '#d1303f', stroke: INK, sw: 1.2 },
        { d: 'M22 27V35M26 27V35', stroke: INK, sw: 5.6 }, { d: 'M22 27V35M26 27V35', stroke: '#f3c332', sw: 3.2 },
        { d: ell(24, 31, 4.6, 2.4), fill: '#f3c332', stroke: INK, sw: 1.6 },
        { d: 'M14.6 42C14.6 37.4 18.8 35.4 24 35.4S33.4 37.4 33.4 42Z', fill: '#f3c332', stroke: INK, sw: 2 },
        { d: 'M18 39.4C20 38 22 37.6 24 37.6', stroke: '#fff0a0', sw: 1.4 },
        { d: star(40, 40, 3, 0.2), fill: '#ffffff' }, { d: star(8, 36, 2.4, 0.2), fill: '#fff0a0' },
    ],
};

// ---- remains: a grinning skull over crossed bones ----
const bone = (x1, y1, x2, y2) => [
    { d: `M${x1} ${y1}L${x2} ${y2}`, stroke: INK, sw: 5.6 }, { d: `M${x1} ${y1}L${x2} ${y2}`, stroke: '#efe6cf', sw: 3.4 },
    { d: ell(x1 - 0.8, y1 - 1.8, 2.2, 2.2), fill: '#efe6cf', stroke: INK, sw: 1.3 }, { d: ell(x1 + 1.6, y1 + 1, 2.2, 2.2), fill: '#efe6cf', stroke: INK, sw: 1.3 },
    { d: ell(x2 + 0.8, y2 - 1.8, 2.2, 2.2), fill: '#efe6cf', stroke: INK, sw: 1.3 }, { d: ell(x2 - 1.6, y2 + 1, 2.2, 2.2), fill: '#efe6cf', stroke: INK, sw: 1.3 }];
const remains = {
    colour: true, vb: 48, bg: T('#36303f'),
    shapes: [
        ...bone(7, 32, 41, 43), ...bone(41, 32, 7, 43),
        { d: 'M11.6 20C11.6 11 17 6 24 6S36.4 11 36.4 20C36.4 24 34.4 26.4 32.4 27.6V33H15.6V27.6C13.6 26.4 11.6 24 11.6 20Z', fill: '#efe6cf', stroke: INK, sw: 2 },
        { d: 'M14 14C15.4 10.6 18.6 8.6 22 8.2', stroke: '#ffffff', sw: 1.8 },
        { d: 'M32.4 22C34.2 20 35 17 34.6 14', stroke: '#cdbf98', sw: 1.6 },
        { d: ell(18.6, 20.4, 3.8, 4.4, -10), fill: '#1b1620', stroke: INK, sw: 1 }, { d: ell(29.4, 20.4, 3.8, 4.4, 10), fill: '#1b1620', stroke: INK, sw: 1 },
        { d: 'M24 24.6L21.8 28.6H26.2Z', fill: '#1b1620' },
        { d: 'M15.6 33V29M20.4 33V29.6M24 33V29.6M27.6 33V29.6M32.4 33V29', stroke: INK, sw: 1.5 },
        { d: 'M15.6 29.2H32.4', stroke: INK, sw: 1.3 },
        { d: star(41, 9, 3.2, 0.2), fill: '#e9e0ff' },
    ],
};


// ---- chest: an iron-bound wooden chest, its lid just open on a line of gold light, a lock plate ----
const chest = {
    colour: true, vb: 48, bg: T('#cdd9a8'),
    shapes: [
        { d: ell(24, 43.6, 19, 1.8), fill: '#8a9a5e', op: 0.55 },
        { d: 'M7 22H41V41.6H7Z', fill: '#8a5426', stroke: INK, sw: 2 },
        { d: 'M8 30H40M8 36H40', stroke: '#5d3414', sw: 1.1 },
        { d: 'M7 22V18C7 11 14 8 24 8S41 11 41 18V22Z', fill: '#a8672e', stroke: INK, sw: 2 },
        { d: 'M12 15C15 11.6 20 10.4 25 10.4', stroke: '#dba066', sw: 1.8 },
        { d: 'M8.4 23.2H39.6', stroke: '#ffd34f', sw: 2.4 },
        { d: 'M13 9.6V41M35 9.6V41', stroke: INK, sw: 5.2 }, { d: 'M13 9.6V41M35 9.6V41', stroke: '#575b66', sw: 3 },
        { d: 'M7 22H41', stroke: INK, sw: 5 }, { d: 'M7 22H41', stroke: '#575b66', sw: 2.8 },
        { d: 'M9 40.6L12 37.6M39 40.6L36 37.6', stroke: '#9aa0ae', sw: 1.2 },
        { d: 'M19.6 18.6H28.4V29.4H19.6Z', fill: '#f0c23c', stroke: INK, sw: 1.8 },
        { d: ell(24, 22.6, 1.8, 1.8), fill: INK }, { d: 'M24 23.4V26.4', stroke: INK, sw: 1.8 },
        { d: 'M20.8 20H27', stroke: '#fff1a8', sw: 1.1 },
        { d: star(40, 9, 3.4, 0.2), fill: '#ffffff' },
    ],
};

// ---- carpet: a flying carpet, red and gold, riding the wind with a night sky behind ----
const fringeL = [], fringeR = [];
for (let i = 0; i < 7; i++) { const y = 18.6 + i * 2.8; fringeL.push(`M4.8 ${n(y)}L2 ${n(y + (i - 3) * 0.5)}`); fringeR.push(`M43.2 ${n(y - 6.6)}L46 ${n(y - 6.6 + (i - 3) * 0.5)}`); }
const carpet = {
    colour: true, vb: 48, bg: T('#243a6a'),
    shapes: [
        { d: ell(12, 43, 7, 1.8), fill: '#ffffff', op: 0.3 }, { d: ell(36, 45, 8, 1.6), fill: '#ffffff', op: 0.25 },
        { d: 'M5 41C10 37 15 44 20 41', stroke: '#9ab4ec', sw: 1.6, op: 0.7 },
        { d: fringeL.join('') + fringeR.join(''), stroke: '#f0c23c', sw: 1.4 },
        { d: 'M5 17C12 10 18 21 24 14C30 8 38 18 43 11V30C38 38 30 28 24 35C18 42 12 31 5 38Z', fill: '#c2312f', stroke: INK, sw: 2 },
        { d: 'M6.6 20.6C12.6 14.6 18 24.6 24 17.6C30 11.6 37 21 41.4 14.6', stroke: '#f0c23c', sw: 1.5 },
        { d: 'M6.6 34.4C12.6 28.6 18 38.6 24 32C30 27 37 34 41.4 28', stroke: '#f0c23c', sw: 1.5 },
        { d: 'M24 19.6L28.6 24.6L24 29.6L19.4 24.6Z', fill: '#f0c23c', stroke: INK, sw: 1.3 },
        { d: 'M24 22.2L26 24.6L24 27L22 24.6Z', fill: '#c2312f' },
        { d: 'M11 26L13.6 23.2L16.2 26L13.6 28.8ZM32 21.4L34.6 18.6L37.2 21.4L34.6 24.2Z', fill: '#f0c23c' },
        { d: 'M5 17C12 10 18 21 24 14', stroke: '#ff8a7a', sw: 1, op: 0.8 },
        { d: star(37, 6, 3.4, 0.2), fill: '#ffffff' }, { d: star(9, 8, 2.4, 0.2), fill: '#d6e0ff' }, { d: star(22, 4.6, 1.8, 0.2), fill: '#fff0a0' }, { d: star(42, 41, 2.4, 0.2), fill: '#d6e0ff' },
    ],
};

// ---- place: two standing stones and a lintel in a misty meadow, a rune glowing, toadstools at the foot ----
const place = {
    colour: true, vb: 48, bg: T('#2f5a46'),
    shapes: [
        { d: ell(24, 26, 15, 17), fill: '#9fe6c0', op: 0.35 },
        { d: 'M2 40C12 37 36 37 46 40V48H2Z', fill: '#3f7a4a' },
        { d: 'M2 40C12 37 36 37 46 40', stroke: '#6fc06a', sw: 1.6 },
        { d: 'M10.6 41L11.6 18.4H20.4L21.4 41Z', fill: '#9a9a96', stroke: INK, sw: 2 },
        { d: 'M26.6 41L27.6 18.4H36.4L37.4 41Z', fill: '#8a8a88', stroke: INK, sw: 2 },
        { d: 'M7.4 11.4C7.4 10 8.6 9.4 10 9.4H38C39.4 9.4 40.6 10 40.6 11.4V17.8C40.6 18.4 40 18.8 39.4 18.8H8.6C8 18.8 7.4 18.4 7.4 17.8Z', fill: '#a8a8a4', stroke: INK, sw: 2 },
        { d: 'M9 11.4H22', stroke: '#d6d6d0', sw: 1.4 },
        { d: 'M11.4 20.4C13 24 12.6 28 12.8 32', stroke: '#bcbcb6', sw: 1.2 },
        { d: 'M12 18.6C15 21 18 19.6 20 18.6V21C17 22.4 14 22.6 12 20.6Z', fill: '#4f9a3a' },
        { d: 'M28 18.6C31 21 34 19.6 36 18.6V21C33 22.4 30 22.6 28 20.6Z', fill: '#4f9a3a' },
        { d: 'M15.6 25L15.6 30M13.4 27.6H17.8M14 25.6L17.2 29.6M17.2 25.6L14 29.6', stroke: '#6ff0ff', sw: 1.4 },
        { d: 'M31.6 24.6V31', stroke: '#6ff0ff', sw: 1.4, op: 0.8 },
        { d: 'M3.4 41C3.4 36.6 7 35 9.4 35S15.4 36.6 15.4 41Z', fill: '#d1303f', stroke: INK, sw: 1.5 }, { d: 'M8.4 41V43.4M10.4 41V43.4', stroke: '#f3ead0', sw: 2.2 },
        { d: ell(7, 38.2, 1, 1), fill: '#ffffff' }, { d: ell(11.4, 37.8, 0.9, 0.9), fill: '#ffffff' },
        { d: 'M35.6 42C35.6 38.4 38.4 37 40.6 37S45.6 38.4 45.6 42Z', fill: '#d1303f', stroke: INK, sw: 1.4 }, { d: 'M40 42V44.2M41.4 42V44.2', stroke: '#f3ead0', sw: 2 },
        { d: ell(38.6, 39.6, 0.8, 0.8), fill: '#ffffff' }, { d: ell(42.6, 39.4, 0.8, 0.8), fill: '#ffffff' },
        { d: star(24, 30, 3.4, 0.2), fill: '#ffffff' }, { d: star(41, 8, 2.6, 0.2), fill: '#d9ffe8' },
    ],
};

export const ART_TREASURES = { garment, gloves, band, potion, herb, map, sight, wand, key, pipes, book, charm, jewel, regalia, sacred, remains, chest, carpet, place };
