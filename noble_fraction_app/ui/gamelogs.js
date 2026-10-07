import { createGame, apply } from '../engine/index.js';
import { buildLogExport } from './exportlog.js';

// Saved game logs. A finished game is stored as the seed + who started + the length + every action taken (the engine is deterministic),
// so the exact game can be replayed later, turned into the readable turn log, or fed to the learning tools. 
const KEY = 'noble-fraction.games.v1';
const CAP = 100;                                               // ~10 KB each: about 1 MB of the browser's 5 MB per site (casdra.com's other apps share it)

export function buildRecord({ record, summary, now }) {
    return {
        v: 1, id: String(summary.endedAt ?? now), when: new Date(summary.endedAt ?? now).toISOString(),
        seed: record.seed, mode: record.mode, level: record.level, start: record.start, startArg: record.startArg ?? null, replayable: record.replayable,
        result: summary.result, myTotal: summary.myTotal, rivalTotal: summary.rivalTotal, turns: summary.turns, moves: record.moves,
    };
}

// The final state of a stored game, by replaying its moves. Throws if the engine no longer accepts one of them (an older version's game).
export function replay(record) {
    let s = createGame({ seed: record.seed, startingPlayer: record.startArg ?? undefined, mode: record.mode });
    for (const [, action] of record.moves) s = apply(s, action);
    return s;
}

export function recordText(record) {
    if (!record.replayable) return 'This game was started before logs were saved, so its moves are not available.\n';
    try { return buildLogExport({ state: replay(record), level: record.level, when: record.when }); } catch { return 'This game was played with an older version of the rules and can no longer be replayed.\n'; }
}

// One file holding every stored game, replayable and machine-readable.
export function bundle(records, when = new Date().toISOString()) {
    return JSON.stringify({ app: 'noble-fraction', format: 1, exported: when, games: records }, null, 1);
}

export function createGameStore(storage = null) {
    let games = [];
    try { const raw = JSON.parse(storage?.getItem(KEY) ?? 'null'); if (Array.isArray(raw)) games = raw; } catch { /* start empty */ }
    const save = () => {
        for (let drop = 0; drop <= games.length; drop += 1) {                                // out of room: forget the oldest games until it fits
            try { storage?.setItem(KEY, JSON.stringify(games.slice(drop))); if (drop) games = games.slice(drop); return; } catch { /* retry smaller */ }
        }
    };
    return {
        all: () => games,
        get: id => games.find(g => g.id === id) ?? null,
        add(record) { games = [...games.filter(g => g.id !== record.id), record].slice(-CAP); save(); },
        clear() { games = []; save(); },
    };
}
