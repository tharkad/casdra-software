// kindart.js: the COLOUR ILLUSTRATIONS (Mike, 2026-11-02: the unique item pictures are small colour illustrations, not one-colour line icons).
// Eight kinds are drawn here: boots, lantern, ring, salve, scroll, the white spell, the Hoard and the Lair. Every one is an ORIGINAL drawing authored as SVG paths;
// nothing is traced or taken from the game's art or from any other game.
//
// Format (read by kindicons.js): { colour: true, vb: 48, bg: { fill, stroke }, shapes: [{ d, fill, stroke, sw, op, dash }] }
//   vb      the side of the square box (48 here); bg  the rounded backing tile every illustration carries, so it reads on the dark UI and on the light card alike;
//   shapes  painted in order; fill / stroke are always explicit colours (never currentColor), so the theme never recolours a drawing.
const n = v => +v.toFixed(2);
/** An ellipse as a path (optionally turned by `rot` degrees). */
const ell = (cx, cy, rx, ry, rot = 0) => {
    const t = rot * Math.PI / 180, dx = rx * Math.cos(t), dy = rx * Math.sin(t);
    return `M${n(cx - dx)} ${n(cy - dy)}A${rx} ${ry} ${rot} 1 0 ${n(cx + dx)} ${n(cy + dy)}A${rx} ${ry} ${rot} 1 0 ${n(cx - dx)} ${n(cy - dy)}Z`;
};
/** A four-pointed glint. */
const star = (x, y, r, w = 0.18) => `M${x} ${n(y - r)}Q${n(x + r * w)} ${n(y - r * w)} ${n(x + r)} ${y}Q${n(x + r * w)} ${n(y + r * w)} ${x} ${n(y + r)}Q${n(x - r * w)} ${n(y + r * w)} ${n(x - r)} ${y}Q${n(x - r * w)} ${n(y - r * w)} ${x} ${n(y - r)}Z`;
const INK = '#2e2012';
// the edge of the backing tile tells the category at a glance: treasures bronze, spells silver-violet, sites verdigris; the tile fill is chosen for the subject
const EDGE = { treasure: '#b4903f', spell: '#b9b2d9', site: '#7e9484' };
/** A capsule (a finger, a stick with a round end) as a path: left edge x, round top y0, width w, flat bottom y1. */
const cap = (x, y0, w, y1) => `M${x} ${y1}V${n(y0 + w / 2)}A${w / 2} ${w / 2} 0 0 1 ${n(x + w)} ${n(y0 + w / 2)}V${y1}Z`;
export { n, ell, star, cap, INK, EDGE };

// ---- 1. boots: a leather boot in side profile, toe to the right ----
const boots = {
    colour: true, vb: 48, bg: { fill: '#efe2bf', stroke: EDGE.treasure },
    shapes: [
        { d: ell(25, 45, 17, 1.6), fill: '#b8a370', op: 0.55 },
        // the upper: shaft, ankle, foot
        { d: 'M14.5 13L14 28C13.4 30.5 12.4 32.5 12.4 35.5V37H43C44.6 37 44.8 34 42.2 32.6C37.6 30.2 33.2 29.6 30.6 25.6L29 13Z', fill: '#9a6431', stroke: INK, sw: 2 },
        { d: 'M14.5 13L14 28C13.4 30.5 12.4 32.5 12.4 35.5V37H18C17.6 32 17.8 22 19 13Z', fill: '#7d4a20', op: 0.55 },     // the shaded back
        { d: 'M33 30.4C37 31 40 32 42 33.2', stroke: '#d9a063', sw: 1.8 },
        // the toe cap
        { d: 'M32.5 29.8C36.6 30.6 40.4 31.8 42.6 33.4C44 34.8 43.6 36.2 43 37H35.4C36 34.5 35 32 32.5 29.8Z', fill: '#b57a40', stroke: INK, sw: 1.6 },
        // the turned cuff
        { d: 'M12 7H31.4L30.8 14.4H12.6Z', fill: '#c18a4c', stroke: INK, sw: 2 },
        { d: 'M13.5 9.2H30.2', stroke: '#e3b878', sw: 1.6 },
        { d: 'M12.6 14.4L14 17.4L17 14.8L20 17.6L23 14.8L26 17.6L28.6 14.8L30.8 14.4', fill: '#8d5a2a', stroke: INK, sw: 1.4 },
        // the strap and buckle
        { d: 'M14.1 21.4L29.7 20.6L30.1 24.6L14 25.6Z', fill: '#4e2f14', stroke: INK, sw: 1.6 },
        { d: 'M24.6 19.2H30.4V26H24.6Z', fill: '#f0c64a', stroke: INK, sw: 1.7 },
        { d: 'M26.6 21.4H28.4V24H26.6Z', fill: '#4e2f14' },
        { d: 'M22 22.6H27.6', stroke: '#e9d6a6', sw: 1.4 },
        // the stitched seam and the welt
        { d: 'M17.6 16.4V19.6M17.6 27V31', stroke: '#f1dba8', sw: 1.4, dash: '1.6 2.4' },
        { d: 'M15 34.6H42', stroke: '#f1dba8', sw: 1.3, dash: '2 2.2' },
        // the thick sole and the heel block
        { d: 'M11.2 37H44.2C44.8 38.8 44 41.4 41.4 41.4H22.2V44.2H12.4C11.2 44.2 10.6 43.4 10.6 42.4Z', fill: '#3f2410', stroke: INK, sw: 1.8 },
        { d: 'M12.5 41.2H21', stroke: '#7a5430', sw: 1.2 },
    ],
};

// ---- 2. lantern: an old hooded iron lantern, a flame inside, its light spilling out ----
const lantern = {
    colour: true, vb: 48, bg: { fill: '#241a2a', stroke: EDGE.treasure },
    shapes: [
        { d: ell(24, 28, 22, 22), fill: '#ffcf4a', op: 0.1 },
        { d: ell(24, 28, 17, 17), fill: '#ffcf4a', op: 0.14 },
        { d: 'M4 38L9 36.5M5 27H9.5M6.4 17L10.6 19.6M44 38L39 36.5M43.5 27H39M41.6 17L37.4 19.6', stroke: '#ffd96a', sw: 1.8, op: 0.8 },
        // ring handle
        { d: ell(24, 6.2, 3.3, 3.1), stroke: '#a3a7b3', sw: 2 },
        { d: 'M21.4 10.4H26.6V13.8H21.4Z', fill: '#4d515b', stroke: INK, sw: 1.6 },
        // the hood
        { d: 'M12.2 20.4C12.8 15.4 17.6 13 24 13S35.2 15.4 35.8 20.4Z', fill: '#656a76', stroke: INK, sw: 2 },
        { d: 'M15.4 18.4C17 16 20 15 22.6 15', stroke: '#a3a9b6', sw: 1.6 },
        { d: 'M11 20.4H37V23H11Z', fill: '#4d515b', stroke: INK, sw: 1.8 },
        // the glass, lit
        { d: 'M13.8 23H34.2L35.4 35H12.6Z', fill: '#ffd34f', stroke: INK, sw: 1.6 },
        { d: 'M16 23H32L33 35H15Z', fill: '#fff0a0', op: 0.55 },
        { d: 'M19.2 23L18.6 35M28.8 23L29.4 35', stroke: '#4d515b', sw: 1.6 },
        // the flame
        { d: 'M24 22.6C27 26.4 28.8 28.2 28.8 31.2A4.8 4.8 0 0 1 19.2 31.2C19.2 28.4 22.4 27 22.8 24.2C23.2 25.2 23.6 25 24 22.6Z', fill: '#ff8a1f', stroke: '#d1560a', sw: 1 },
        { d: 'M24 27C25.6 29 26.2 30 26.2 31.4A2.2 2.2 0 0 1 21.8 31.4C21.8 30 23.2 29 24 27Z', fill: '#fff4b0' },
        // the posts and the base
        { d: 'M13.8 23L12.6 35M34.2 23L35.4 35', stroke: INK, sw: 2.6 },
        { d: 'M13.8 23L12.6 35M34.2 23L35.4 35', stroke: '#7f8491', sw: 1 },
        { d: 'M11.2 35H36.8L35.4 40H12.6Z', fill: '#565b67', stroke: INK, sw: 1.8 },
        { d: 'M13.6 37.2H34.4', stroke: '#8d92a0', sw: 1.2 },
        { d: star(33, 17.4, 3, 0.2), fill: '#fff6c8' },
    ],
};

// ---- 3. ring: a gold band seen at a slight angle, a ruby set on top ----
const ring = {
    colour: true, vb: 48, bg: { fill: '#2b2347', stroke: EDGE.treasure },
    shapes: [
        { d: ell(24, 31.6, 14.8, 11.2), fill: '#9c6d12', stroke: INK, sw: 1.8 },                      // the thickness of the band
        { d: ell(24, 29, 14.8, 11.2), fill: '#f0b92c', stroke: INK, sw: 1.8 },                         // the top face of the band
        { d: ell(24, 28.4, 8.6, 6.1), fill: '#2b2347', stroke: INK, sw: 1.6 },                          // the hole
        { d: 'M15.6 28.4A8.6 6.1 0 0 1 32.4 28.4A8.6 3.6 0 0 0 15.6 28.4Z', fill: '#a8780f' },       // the inside wall
        { d: 'M11.6 31C12.8 36.4 17.4 39.4 24 39.6', stroke: '#fff0a6', sw: 1.8, op: 0.75 },
        { d: 'M10.4 26C11.4 22 15 19.4 19 18.6', stroke: '#fff0a6', sw: 1.8, op: 0.7 },
        // the setting and the stone
        { d: 'M18.2 20.6L20.4 16.4H27.6L29.8 20.6Z', fill: '#f0b92c', stroke: INK, sw: 1.7 },
        { d: 'M24 5.4L30.8 9.6L28 17.4H20L17.2 9.6Z', fill: '#d1303f', stroke: INK, sw: 1.8 },
        { d: 'M24 5.4L30.8 9.6H17.2Z', fill: '#ff7a86' },
        { d: 'M17.2 9.6L20 17.4L24 9.6L28 17.4L30.8 9.6', stroke: '#8f1626', sw: 1.2 },
        { d: 'M20.6 8.6L24 6.8', stroke: '#ffe0e2', sw: 1.2 },
        { d: star(33.5, 6.4, 4.2, 0.16), fill: '#ffffff' },
        { d: star(12.5, 14, 2.4, 0.2), fill: '#ffffff' },
    ],
};

// ---- 4. salve: a small clay pot, a cloth cover tied down with cord, herbs beside it ----
const salve = {
    colour: true, vb: 48, bg: { fill: '#e6e2c3', stroke: EDGE.treasure },
    shapes: [
        { d: ell(23, 42.4, 15, 2), fill: '#8d8a5c', op: 0.5 },
        // herbs, left and right
        { d: 'M7.6 41C6.8 34 6.8 27 8.4 19', stroke: '#2f6a2a', sw: 1.6 },
        { d: 'M7.2 33C3.6 32.6 2.2 30.2 2.2 27.2C5.8 27.4 7.2 29.8 7.2 33ZM7.8 38.4C11.2 37.8 12.8 35.6 12.8 32.6C9.4 33.2 7.8 35.4 7.8 38.4ZM7.4 26C4.4 24.8 3.4 22.4 3.8 20C6.6 21 7.8 23.4 7.4 26ZM8.6 20.4C11 19 11.4 16.6 10.6 14.4C8.4 15.6 8 18 8.6 20.4Z', fill: '#4f9a3a', stroke: '#2f6a2a', sw: 1.2 },
        { d: 'M40.6 41C41.4 35 41.2 28 39.6 21', stroke: '#2f6a2a', sw: 1.6 },
        { d: 'M41 35C44.4 34.4 45.8 32 45.8 29C42.4 29.4 41 31.8 41 35ZM40.6 39.6C37.6 39.4 36 37.2 36 34.4C39.2 34.8 40.6 37 40.6 39.6ZM40.4 28.4C43.4 27 44.4 24.4 43.8 22C41.2 23.2 40.2 25.8 40.4 28.4ZM39.6 22.4C37.2 21.4 36.4 19 37 16.6C39.4 17.6 40.2 20 39.6 22.4Z', fill: '#4f9a3a', stroke: '#2f6a2a', sw: 1.2 },
        // the pot: a wide clay belly on a small foot
        { d: 'M11.4 29C11.4 22 16.6 18.8 24 18.8S36.6 22 36.6 29C36.6 36.4 31 41 24 41S11.4 36.4 11.4 29Z', fill: '#c0683a', stroke: INK, sw: 2 },
        { d: 'M28.8 19.6C33.6 21.2 36.6 24.6 36.6 29C36.6 36.4 31 41 24 41C28 37.4 30.6 32 30.4 27C30.2 23.4 29.8 21 28.8 19.6Z', fill: '#8f4526', op: 0.65 },
        { d: 'M14.2 25C15 22.8 16.6 21.6 18.4 20.8', stroke: '#e8996a', sw: 1.8 },
        { d: 'M12.4 29.6C19 32.6 29 32.6 35.6 29.6M13.6 34C19.4 36.6 28.6 36.6 34.4 34', stroke: '#6e3319', sw: 1.4 },
        { d: 'M18.6 40.6H29.4', stroke: INK, sw: 2.4 },
        // the cloth cover, puffed over the mouth and tied down with cord, its frill falling round the neck
        { d: 'M16.4 19.8C14.6 14.6 18 10.4 24 10.4S33.4 14.6 31.6 19.8Z', fill: '#f4ead0', stroke: INK, sw: 1.8 },
        { d: 'M15.4 19.4C13.2 20.2 12 22 12.6 24C14 25 15.4 24.4 16.4 23.4C17.4 25 19 25 20 23.8C21.2 25.4 23 25.4 24 24C25.2 25.4 27 25.4 28 23.8C29 25 30.6 25 31.6 23.4C32.6 24.4 34 25 35.4 24C36 22 34.8 20.2 32.6 19.4Z', fill: '#efe2bd', stroke: INK, sw: 1.7 },
        { d: 'M19.4 12.4C20.8 11.4 22.4 11 24 11', stroke: '#ffffff', sw: 1.6 },
        { d: 'M20.8 14C20.4 15.8 20.6 17.6 21.2 19M27.4 13.6C28 15.6 27.8 17.6 27.2 19', stroke: '#c9b88a', sw: 1.2 },
        // the cord and its knot, tails hanging
        { d: 'M15.6 19.8C20 21.6 28 21.6 32.4 19.8', stroke: '#6a3f1b', sw: 2.4 },
        { d: ell(28.4, 21.2, 2, 1.7), fill: '#6a3f1b', stroke: INK, sw: 1 },
        { d: 'M27.6 22.6C27 25 26 26.4 24.6 27.2M29.2 22.6C30.4 24.6 31.6 25.6 33 26', stroke: '#6a3f1b', sw: 1.8 },
    ],
};

// ---- 5. scroll: rolled parchment with curled ends, runes, a red wax seal on a ribbon ----
const scroll = {
    colour: true, vb: 48, bg: { fill: '#34405d', stroke: EDGE.treasure },
    shapes: [
        // the sheet
        { d: 'M10.4 12.6C11.6 14 11.4 15.4 10.6 16.8C9.8 20 11.6 23.4 10.8 27C10.4 29.4 11.2 31.4 10.4 34L37.6 34C36.8 31.6 37.8 29.2 37.2 26.6C36.4 23 38 20 37.2 16.6C36.6 15 36.6 13.8 37.6 12.6Z', fill: '#f2e2b0', stroke: INK, sw: 1.8 },
        { d: 'M12.4 20C14 22 12.6 26 13.4 30L16 31C15 27 16.2 22 14.4 19Z', fill: '#d9c07a', op: 0.5 },
        // the runes: angular staves with branches, two lines of them
        { d: 'M14.6 16.4V21.6M14.6 18L17.8 16M14.6 20L17.8 18M21.4 16.4V21.6M21.4 17L24.4 19L21.4 21M28 16.4V21.6M28 19.4L31 16.6M28 19.4L25.4 16.8M33.4 16.4V21.6M33.4 21.6L36 18.8', stroke: '#6b2a1c', sw: 1.6 },
        { d: 'M14.6 24.4V29.4M14.6 24.4L17.6 26.4L14.6 28.4M21.4 24.4V29.4M21.4 24.4L24.4 27M24.4 27L21.4 29.4M27.6 24.4L30.4 26.9L27.6 29.4M30.4 24.4V29.4M33.8 24.4V29.4M33.8 27H36.4', stroke: '#6b2a1c', sw: 1.6 },
        // the top roll with its curled end
        { d: 'M8 8.6H40C41 8.6 41.2 12.6 40 12.6H8C6.8 12.6 7 8.6 8 8.6Z', fill: '#e6cd8a', stroke: INK, sw: 1.8 },
        { d: ell(8.4, 10.6, 2.9, 3.6), fill: '#f6e9bd', stroke: INK, sw: 1.6 },
        { d: 'M8.4 8.8C9.8 9.2 10 11.6 8.6 12M8.2 10.6H8.8', stroke: INK, sw: 1.1 },
        { d: 'M12 10H38', stroke: '#fbf2d2', sw: 1.2 },
        // the bottom roll
        { d: 'M8 33.6H40C41 33.6 41.2 38 40 38H8C6.8 38 7 33.6 8 33.6Z', fill: '#e6cd8a', stroke: INK, sw: 1.8 },
        { d: ell(39.6, 35.8, 2.9, 3.8), fill: '#f6e9bd', stroke: INK, sw: 1.6 },
        { d: 'M39.6 33.8C38.2 34.2 38 36.8 39.4 37.4M39.8 35.8H39.2', stroke: INK, sw: 1.1 },
        { d: 'M10 35.4H34', stroke: '#fbf2d2', sw: 1.2 },
        // the ribbon, tied around the bottom roll, and the seal
        { d: 'M25.6 33.4H29.4V38.2H25.6Z', fill: '#b3202a', stroke: INK, sw: 1.4 },
        { d: 'M24.8 38L22.6 45L25.8 43.2L27.2 46L28.2 38.4ZM29.2 38.4L31.6 45.4L33.4 42.4', fill: '#b3202a', stroke: INK, sw: 1.4 },
        { d: 'M27.5 29.4L29.2 30.4L31.2 30L31.6 32L33.2 33.2L32.2 34.8L32.6 36.8L30.6 37L29.2 38.4L27.5 37.4L25.7 38.4L24.4 37L22.4 36.8L22.8 34.8L21.8 33.2L23.4 32L23.8 30L25.8 30.4Z', fill: '#c42b34', stroke: INK, sw: 1.5 },
        { d: ell(27.5, 33.8, 3.3, 3.3), fill: '#9b1620', stroke: '#6f0f17', sw: 1 },
        { d: 'M25.8 33.8L27.5 31.6L29.2 33.8L27.5 36Z', stroke: '#e86a6e', sw: 1.1 },
    ],
};

// ---- 6. the white spell: a yellow sun on a white, lightly outlined background ----
const sunRays = [];
for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, long = i % 2 === 0, r0 = 12.6, r1 = long ? 19 : 14.6;
    sunRays.push(`M${n(24 + r0 * Math.cos(a))} ${n(24 + r0 * Math.sin(a))}L${n(24 + r1 * Math.cos(a))} ${n(24 + r1 * Math.sin(a))}`);
}
const white = {
    colour: true, vb: 48, bg: { fill: '#ffffff', stroke: EDGE.spell },
    shapes: [
        { d: sunRays.join(''), stroke: '#f6bd0e', sw: 3.6 },
        { d: ell(24, 24, 9.2, 9.2), fill: '#fbd22b', stroke: '#e6a50a', sw: 1.8 },
        { d: 'M18.4 20.6C19.4 18.4 21.4 17.2 23.4 17', stroke: '#fff3a8', sw: 1.8 },
    ],
};

// ---- 7. the Hoard: a heap of gold coins spilling over, a goblet and gems on top, glinting ----
const coins = [];
const coin = (x, y, rot = 0, light = false) => coins.push(
    { d: ell(x, y + 1.1, 4.7, 2.5, rot), fill: '#946310', stroke: '#5c3d06', sw: 1.1 },
    { d: ell(x, y, 4.7, 2.5, rot), fill: light ? '#ffe27a' : '#f3c332', stroke: '#6e4a08', sw: 1.2 },
    { d: ell(x, y, 2.5, 1.2, rot), stroke: light ? '#d9a21a' : '#c78f12', sw: 0.8 });
[[11, 40], [18, 41], [26, 41.4], [34, 41], [39.6, 39.6], [13.8, 36.4], [22, 37.4], [30, 37.2], [38, 35.8], [9, 36.2], [17.6, 33.2], [26, 33.4], [34.4, 32.6], [21.6, 29.6], [29.4, 29.4], [13.4, 32], [39.6, 32]].forEach(([x, y], i) => coin(x, y, (i * 17) % 40 - 20, i % 3 === 0));
const hoard = {
    colour: true, vb: 48, bg: { fill: '#2a1d16', stroke: EDGE.site },
    shapes: [
        { d: ell(24, 26, 22, 20), fill: '#ffcf4a', op: 0.07 },
        { d: 'M5 42C6 35 12 30 17 28C19 23 29 23 31 28C36 30 42 35 43 42Z', fill: '#b57d12', stroke: '#5c3d06', sw: 1.4 },
        ...coins,
        // the goblet
        { d: 'M19.4 11.4H28.6C28.6 17 26.8 20.4 24 20.4S19.4 17 19.4 11.4Z', fill: '#f3c332', stroke: '#6e4a08', sw: 1.7 },
        { d: 'M22.4 20.2V25M25.6 20.2V25M20 26H28', stroke: '#6e4a08', sw: 2.2 },
        { d: 'M22.4 20.2V25M25.6 20.2V25M20 26H28', stroke: '#f3c332', sw: 1 },
        { d: 'M21 12.6C21.2 15 21.8 16.6 22.8 17.8', stroke: '#fff0a0', sw: 1.4 },
        { d: ell(24, 11.4, 4.6, 1.2), fill: '#d89c16', stroke: '#6e4a08', sw: 1.2 },
        { d: 'M22 10.2L24 5.8L26 10.2L24 12.4Z', fill: '#4cc9a0', stroke: '#14604a', sw: 1.2 },      // a gem in the cup
        // gems among the coins
        { d: 'M10 28.4L13 25.8L16 28.4L13 32Z', fill: '#d1303f', stroke: '#6b1220', sw: 1.2 },
        { d: 'M32 30.4L35 27.6L38 30.4L35 34Z', fill: '#4a8ff0', stroke: '#173f86', sw: 1.2 },
        { d: star(35, 22, 4.2, 0.16), fill: '#ffffff' },
        { d: star(12.4, 21, 3, 0.18), fill: '#fff6c8' },
        { d: star(26, 6, 2.2, 0.2), fill: '#ffffff' },
    ],
};

// ---- 8. the Lair: a dark cave mouth in a rock face, bones and claw marks, glowing eyes ----
const lair = {
    colour: true, vb: 48, bg: { fill: '#6c655d', stroke: EDGE.site },
    shapes: [
        { d: 'M0 14L9 6L18 9L30 4L40 9L48 6V0H0Z', fill: '#857d72' },
        { d: 'M0 26L7 22L13 28L8 36L0 38Z', fill: '#5b544d' },
        { d: 'M48 22L41 20L36 30L40 40L48 42Z', fill: '#5b544d' },
        { d: 'M2 17L6 24L4 31M44 10L38 17L42 24M20 5L24 9', stroke: '#4a443e', sw: 1.2 },
        { d: 'M7 41V29C7 19 14 12 24 12S41 19 41 29V41Z', fill: '#4e4741', stroke: '#1d1916', sw: 2 },
        { d: 'M10.4 41V29.4C10.4 21.6 16 16 24 16S37.6 21.6 37.6 29.4V41Z', fill: '#120d10' },
        { d: 'M10.4 41V29.4C10.4 21.6 16 16 24 16S37.6 21.6 37.6 29.4', stroke: '#9b9387', sw: 1.4, op: 0.55 },
        // the glowing eyes
        { d: ell(19.2, 28, 5, 4.2), fill: '#c8ff3a', op: 0.2 },
        { d: ell(28.8, 28, 5, 4.2), fill: '#c8ff3a', op: 0.2 },
        { d: 'M16.4 28.4C17.8 26.2 20.6 26.2 22.2 28C20.8 29.8 18 30 16.4 28.4Z', fill: '#d9ff4a', stroke: '#8fd10a', sw: 0.8 },
        { d: 'M25.8 28C27.4 26.2 30.2 26.2 31.6 28.4C30 30 27.2 29.8 25.8 28Z', fill: '#d9ff4a', stroke: '#8fd10a', sw: 0.8 },
        { d: 'M19.2 26.6V29.6M28.8 26.6V29.6', stroke: '#120d10', sw: 1.4 },
        // claw scratches on the rock
        { d: 'M3 7C5 11 6 15 6 19M7.4 6C9.4 10 10.4 14 10.4 18M11.8 7.4C13.6 11 14.6 14 14.6 17', stroke: '#d6cdbd', sw: 1.5 },
        { d: 'M38 22C40 26 41 30 41 33M42 21C44 25 45 28 45 31', stroke: '#c9c0b0', sw: 1.3, op: 0.85 },
        // the ground, bones and a skull
        { d: 'M0 41C10 39 38 39 48 41V48H0Z', fill: '#3f362e', stroke: '#1d1916', sw: 1.4 },
        { d: 'M7 44.6L21 41.8', stroke: INK, sw: 4.2 },
        { d: 'M7 44.6L21 41.8', stroke: '#efe6cf', sw: 2.4 },
        { d: ell(6.2, 43.8, 1.9, 1.7), fill: '#efe6cf', stroke: INK, sw: 1.1 },
        { d: ell(6.6, 46.2, 1.8, 1.6), fill: '#efe6cf', stroke: INK, sw: 1.1 },
        { d: ell(21.4, 40.6, 1.9, 1.7), fill: '#efe6cf', stroke: INK, sw: 1.1 },
        { d: ell(21.8, 43, 1.8, 1.6), fill: '#efe6cf', stroke: INK, sw: 1.1 },
        { d: 'M32 45C31 41.4 33.4 39 37 39S43 41.4 42 45H40V46.6H34V45Z', fill: '#efe6cf', stroke: INK, sw: 1.5 },
        { d: ell(35.2, 42.4, 1.5, 1.8), fill: INK }, { d: ell(39, 42.4, 1.5, 1.8), fill: INK },
        { d: 'M37.1 44.2V45.4', stroke: INK, sw: 1.2 },
        { d: 'M26 46.4L33 44.4', stroke: INK, sw: 3.6 }, { d: 'M26 46.4L33 44.4', stroke: '#efe6cf', sw: 2 },
    ],
};

export const ART = { boots, lantern, ring, salve, scroll, white, 'site-hoard': hoard, 'site-lair': lair };
