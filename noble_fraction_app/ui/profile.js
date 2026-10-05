import { emptyLifetime, summarizeGame, mergeGame, recordHistoryEntry } from '../profile/stats.js';
import { evaluate } from '../profile/achievements.js';

// Glue between the game and the pure stats / achievements logic: persistence (localStorage, or
// memory when storage is null) and the "what changed after this move?" hooks.
const KEY = 'noble-fraction.profile.v1';
const HUMAN = 0;

export function createProfile(storage = null) {
    let data = { lifetime: emptyLifetime(), games: [], unlocked: {} };
    try { const raw = JSON.parse(storage?.getItem(KEY) ?? 'null'); if (raw?.lifetime) data = { ...data, ...raw }; } catch { /* start fresh */ }

    const save = () => { try { storage?.setItem(KEY, JSON.stringify(data)); } catch { /* blocked */ } };
    const unlock = (ids, at) => { ids.forEach(id => { data.unlocked[id] = { at }; }); if (ids.length) save(); return ids; };

    return {
        data: () => data,
        // After any state change in a game in progress: remember how far behind the player has been and
        // award the achievements that can be earned mid-game. Returns the new ones plus the updated scratch.
        live({ state, level, extra, now }) {
            const mine = state.players[HUMAN]; const rival = state.players[1 - HUMAN];
            void mine; void rival;
            const game = summarizeGame({ state, level, pid: HUMAN, maxDeficit: extra.maxDeficit ?? 0, startedAt: extra.startedAt ?? null });
            const deficit = Math.max(extra.maxDeficit ?? 0, game.rivalTotal - game.myTotal);
            const newly = unlock(evaluate({ unlocked: data.unlocked, game: { ...game, maxDeficit: deficit }, lifetime: data.lifetime, final: false }), now);
            return { newly, extra: { ...extra, maxDeficit: deficit } };
        },
        // Once, when a game ends: merge it into the lifetime stats, record it in the history, award the rest.
        finish({ state, level, extra, now }) {
            if (extra.recorded) return { newly: [], summary: null, extra };
            const game = summarizeGame({ state, level, pid: HUMAN, maxDeficit: extra.maxDeficit ?? 0, startedAt: extra.startedAt ?? null, endedAt: now });
            data.lifetime = mergeGame(data.lifetime, game);
            data.games = recordHistoryEntry(data.games, game);
            const newly = unlock(evaluate({ unlocked: data.unlocked, game, lifetime: data.lifetime, final: true }), now);
            save();
            return { newly, summary: game, extra: { ...extra, recorded: true } };
        },
        reset() { data = { lifetime: emptyLifetime(), games: [], unlocked: {} }; save(); },
    };
}
