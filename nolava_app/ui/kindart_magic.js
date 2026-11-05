// kindart_magic.js: colour illustrations of the six colours of magic (white lives in kindart.js). Each keeps its colour identity (the tile is the colour of the magic) and reads as a kind of magic,
// not an item. The bottom-right corner of every tile is left clear: kindIcon draws the spell's Type numeral (I to VIII) there. Original drawings; nothing is taken from the game's art or any other game's.
import { n, ell, star, INK, EDGE } from './kindart.js';
const S = fill => ({ fill, stroke: EDGE.spell });
const CX = 22.6, CY = 22;      // the centre of the picture, a little up and left of the tile's centre to leave the numeral's corner free

// ---- grey magic: a drifting cloud and wisps of mist on a slate tile ----
const grey = {
    colour: true, vb: 48, bg: S('#566071'),
    shapes: [
        { d: ell(22, 22, 19, 16), fill: '#c4ccd8', op: 0.12 },
        { d: 'M5 20C8 20.4 12 21.4 14 20M30 14C34 13.4 38 14.6 40 13', stroke: '#c4ccd8', sw: 1.8, op: 0.75 },
        { d: 'M11 30C9 30 7 28 7 25.4C7 22.4 9.6 20.4 12.4 20.8C13 16.4 16.6 13 21.4 13C26 13 29.6 16 30.4 20C34 19.6 37.6 22.2 37.6 25.6C37.6 28.4 35.4 30.4 32.6 30.4Z', fill: '#e6ebf2', stroke: INK, sw: 2 },
        { d: 'M10 28C9 26 10.2 23.6 12.6 23', stroke: '#ffffff', sw: 1.8 },
        { d: 'M24 29.8C31 29.6 37.6 28 38 25.6C34 28 29 29 24 29.8Z', fill: '#aeb8c8', op: 0.8 },
        { d: 'M8 35C12 33.4 16 36.4 20 34.8C24 33.2 26 35.6 30 34.8', stroke: '#e6ebf2', sw: 2.2 },
        { d: 'M13 39.4C17 38 20 40.6 24 39.2', stroke: '#c4ccd8', sw: 2, op: 0.8 },
        { d: 'M18 8C20 6 22.6 6 24 7.4', stroke: '#e6ebf2', sw: 1.6, op: 0.7 },
    ],
};

// ---- gold magic: a radiant four-point star burst on deep amber ----
const goldRays = [];
for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 + Math.PI / 16; goldRays.push(`M${n(CX + 13 * Math.cos(a))} ${n(CY + 13 * Math.sin(a))}L${n(CX + (i % 2 ? 15 : 17.2) * Math.cos(a))} ${n(CY + (i % 2 ? 15 : 17.2) * Math.sin(a))}`); }
const gold = {
    colour: true, vb: 48, bg: S('#5a3d0c'),
    shapes: [
        { d: ell(CX, CY, 19, 19), fill: '#ffd84a', op: 0.12 },
        { d: ell(CX, CY, 13.4, 13.4), fill: '#ffd84a', op: 0.14 },
        { d: goldRays.join(''), stroke: '#ffd84a', sw: 1.4, op: 0.9 },
        { d: star(CX, CY, 15, 0.2), fill: '#f6c21c', stroke: '#a8700a', sw: 1.6 },
        { d: star(CX, CY, 9.4, 0.3), fill: '#ffe27a' },
        { d: star(CX, CY, 4.6, 0.4), fill: '#ffffff' },
        { d: star(36, 9, 4, 0.2), fill: '#ffe9a0' }, { d: star(7.6, 35, 3, 0.2), fill: '#ffe9a0' },
    ],
};

// ---- purple magic: a crackling bolt of violet lightning ----
const purple = {
    colour: true, vb: 48, bg: S('#2f1a5a'),
    shapes: [
        { d: ell(CX, CY, 19, 19), fill: '#b48cff', op: 0.16 },
        { d: ell(CX, CY, 12, 12), fill: '#b48cff', op: 0.16 },
        { d: 'M27.6 4L11.4 25H21L16.6 41L35 17.8H25Z', fill: '#c9a7ff', stroke: '#6a3fd0', sw: 2 },
        { d: 'M26.2 9.6L15.6 24H23.4L20.2 34.6L30.6 20.4H23Z', fill: '#ede0ff' },
        { d: 'M26.4 13L20.2 22H26', stroke: '#ffffff', sw: 1.4, op: 0.9 },
        { d: 'M5 18L11 20L8 24M39 12L34 14.6L37 18', stroke: '#c9a7ff', sw: 1.6 },
        { d: star(8, 8, 3, 0.2), fill: '#e9d9ff' }, { d: star(39, 24, 2.4, 0.2), fill: '#e9d9ff' },
    ],
};

// ---- black magic: a silver pentagram in a black disc, a red ember at its heart ----
const pent = []; for (let k = 0; k < 5; k++) { const a = (-90 + 72 * ((k * 2) % 5)) * Math.PI / 180; pent.push(`${k ? 'L' : 'M'}${n(CX + 13.4 * Math.cos(a))} ${n(CY + 13.4 * Math.sin(a))}`); }
const black = {
    colour: true, vb: 48, bg: S('#3a3347'),
    shapes: [
        { d: ell(CX, CY, 19.6, 19.6), fill: '#0f0d14', stroke: '#8a809e', sw: 1.6 },
        { d: ell(CX, CY, 17, 17), stroke: '#5a5070', sw: 1 },
        { d: ell(CX, CY + 1, 7, 7), fill: '#c4243a', op: 0.4 },
        { d: pent.join('') + 'Z', stroke: '#e0d8f0', sw: 2, fill: 'none' },
        { d: ell(CX, CY + 1, 1.8, 1.8), fill: '#ff5a6e' },
        { d: ell(CX, CY - 13.4, 1.3, 1.3), fill: '#ff5a6e' },
        { d: star(35, 9, 2.6, 0.2), fill: '#cfc4e6' },
    ],
};

// ---- any colour: an eight-point star of every colour of magic ----
const SPECTRUM = ['#e5484d', '#f28c28', '#f6c21c', '#4fb04f', '#2fc0c0', '#3d7fe0', '#7b5cd6', '#d65cc0'];
const anyShapes = SPECTRUM.map((c, i) => {
    const a0 = (i * 45 - 90 - 22.5) * Math.PI / 180, a1 = (i * 45 - 90 + 22.5) * Math.PI / 180, am = (i * 45 - 90) * Math.PI / 180, R = i % 2 ? 11.6 : 16.4;
    return { d: `M${CX} ${CY}L${n(CX + 6.2 * Math.cos(a0))} ${n(CY + 6.2 * Math.sin(a0))}L${n(CX + R * Math.cos(am))} ${n(CY + R * Math.sin(am))}L${n(CX + 6.2 * Math.cos(a1))} ${n(CY + 6.2 * Math.sin(a1))}Z`, fill: c, stroke: INK, sw: 1.2 };
});
const any = {
    colour: true, vb: 48, bg: S('#20243d'),
    shapes: [
        { d: ell(CX, CY, 19, 19), fill: '#ffffff', op: 0.08 },
        ...anyShapes,
        { d: ell(CX, CY, 4.6, 4.6), fill: '#ffffff', stroke: INK, sw: 1.2 },
        { d: star(36, 8, 3.2, 0.2), fill: '#ffffff' }, { d: star(8, 36, 2.4, 0.2), fill: '#ffffff' },
    ],
};

export const ART_MAGIC = { grey, gold, purple, black, any };
