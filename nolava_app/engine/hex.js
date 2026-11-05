// Flat-topped hex geometry. Edges are indexed clockwise from north; a tile's rotation turns its local edges clockwise.
export const EDGES = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];
const DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];       // axial (q, r) neighbour offsets, same order as EDGES
export const opposite = e => (e + 3) % 6;
export const neighbor = (q, r, e) => [q + DIRS[e][0], r + DIRS[e][1]];
export const hexKey = (q, r) => `${q},${r}`;
export const worldEdge = (localEdge, rot) => (localEdge + rot) % 6;
export const localEdge = (world, rot) => (world - rot + 6) % 6;

// Centre of a hex of circumradius `size`, screen coordinates (y down).
export const hexCenter = (q, r, size = 1) => [size * 1.5 * q, size * Math.sqrt(3) * (r + q / 2)];
// Unit vector from a hex centre toward the middle of edge e (screen coordinates).
export const edgeDir = e => { const a = (-90 + 60 * e) * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; };
// The six corners of a unit hex, in order, starting at the right-hand corner and going clockwise on screen.
export const corners = (size = 1) => Array.from({ length: 6 }, (_, i) => [size * Math.cos(i * Math.PI / 3), size * Math.sin(i * Math.PI / 3)]);
