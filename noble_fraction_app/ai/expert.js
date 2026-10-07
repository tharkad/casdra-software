import { decide } from './mcts.js';

// The Expert Rival: the learned net + information-set search. The net weights are one JSON file (ai/expert-net.json, produced by
// sim/export_expert.mjs from a gated champion) that is fetched once, on demand. The search is seeded from the game's seed and the
// public log length, so a given game against Expert replays exactly. It only ever reads what the Rival could see (tested).
let net = null;
export const EXPERT_SIMS = 100;
export const expertReady = () => net !== null;
export const setExpertNet = n => { net = n; };
export async function loadExpert(url = new URL('./expert-net.json', import.meta.url)) {
    if (net) return;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`could not load the Expert Rival (${res.status})`);
    net = await res.json();
}
export function expertPolicy(fallback) {
    return (state, legal) => {
        if (legal.length === 1) return legal[0];
        if (!net) return fallback(state, legal);                // never stall a game: Hard plays until the net has loaded
        const seed = ((state.rules?.seed ?? 1) * 2654435761 + state.log.length * 40503 + state.turn.number) >>> 0;
        return decide(net, state, legal, { sims: EXPERT_SIMS, seed }).action;
    };
}
