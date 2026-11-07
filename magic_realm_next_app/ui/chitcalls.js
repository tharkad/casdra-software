// What a chit lying on a tile can call: the rows of the Appearance chart whose boxes answer to it (rule 5.2: sound and warning chits summon the monsters of the boxes that name them,
// in the row the Monster Roll picked for the day). A pure function of the printed chart, so it tells nothing the players do not know; which creatures are actually waiting is not said.
// (The same reading of the chart as the engine's summon.js: a warning chit answers to its own letter, a sound chit with a letter only on a tile of that letter. The screens read the
// chart through the data and do not import the engine, so the few lines are here too; tests/chit_calls.test.mjs holds the two to the same answers.)

const TILE_LETTER = { valley: 'V', woods: 'W', cave: 'C', mountain: 'M' };
const answers = (box, chit, letter) => (box.summonedBy ?? []).some(s => s.chit === chit.name && (chit.kind === 'warning' ? !s.letter || s.letter === chit.letter : !s.letter || s.letter === letter));

/**
 * @param data  the game data (appearance chart, monsters, tile)
 * @param chit  a map chit { kind: 'sound' | 'warning', name, letter? }
 * @param tile  the tile the chit lies on (a sound chit with a letter answers only on a tile of that letter: M mountains, C caves)
 * @param prowl today's Monster Roll (marks the row of today), or null; a list of rows when two prowl (solitaire)
 * @returns [{ row, today, names: [{ name, n }] }] one entry per row of the chart that holds a box for it, in row order; `n` is how many one call brings
 */
export function callsOf(data, chit, tile, prowl = null) {
    const letter = TILE_LETTER[data.tile(tile).group], out = [];
    for (const r of data.appearance?.rows ?? []) {
        const names = new Map();
        for (const b of r.boxes) {
            if (!(b.monsters?.length) || !answers(b, chit, letter)) continue;
            const here = new Map();
            for (const id of b.monsters) { const nm = data.monsters?.[id]?.name; if (nm) here.set(nm, (here.get(nm) ?? 0) + 1); }
            for (const [nm, n] of here) names.set(nm, Math.max(names.get(nm) ?? 0, n));
        }
        if (names.size) out.push({ row: r.row, today: prowl != null && [].concat(prowl).includes(r.row), names: [...names].map(([name, n]) => ({ name, n })) });
    }
    return out;
}
