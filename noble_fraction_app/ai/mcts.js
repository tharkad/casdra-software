import { legalActions, apply, winner } from '../engine/index.js';
import { evaluate, softmax, mulberry } from './net.js';
import { determinize } from './determinize.js';
import { findCard } from '../ui/find.js';

// Information-set MCTS (open-loop PUCT) guided by the policy/value net. Every simulation plays out on a freshly sampled
// determinization of the acting player's information set, so the tree only ever branches on action *keys* (what the move is, not
// which uid it touches) -- the same key means the same move in every sampled world.
//   - both players' decisions are in the tree (the opponent is modelled by the same net),
//   - a leaf is evaluated by the net's value head (no random playouts),
//   - forced moves (one legal action) are applied without branching.

const uidFields = ['uid', 'to', 'from', 'discard'];
export function actionKey(s, a) {
    const o = { ...a };
    for (const f of uidFields) if (typeof o[f] === 'number') o[f] = findCard(s, o[f])?.card.defId ?? '?';
    if (typeof o.install === 'number') o.install = findCard(s, o.install)?.card.defId ?? '?';
    if (Array.isArray(o.uids)) o.uids = o.uids.map(u => findCard(s, u)?.card.defId ?? '?').sort();
    return JSON.stringify(o);
}
// legal actions with equivalent duplicates (same key) collapsed to the first
function keyed(s, legal) {
    const seen = new Map();
    legal.forEach((a, i) => { const k = actionKey(s, a); if (!seen.has(k)) seen.set(k, i); });
    return [...seen.entries()].map(([key, i]) => ({ key, action: legal[i], index: i }));
}

class Node { constructor() { this.n = 0; this.kids = new Map(); this.expanded = false; this.prior = null; this.actor = -1; } }
class Edge { constructor(prior) { this.prior = prior; this.n = 0; this.w = 0; this.node = new Node(); this.avail = 0; } }

export function search(net, root, { sims = 200, cpuct = 1.5, seed = 1, noise = 0, maxDepth = 60 } = {}) {
    const rnd = mulberry(seed);
    const rootPid = root.turn.active;
    const top = new Node();
    for (let it = 0; it < sims; it += 1) {
        let s = determinize(root, rootPid, rnd);
        let node = top; const path = []; let value = null;
        for (let depth = 0; ; depth += 1) {
            if (s.turn.phase === 'over') { value = outcome(s, rootPid); break; }
            const legal = legalActions(s);
            if (legal.length === 1) { s = apply(s, legal[0]); continue; }
            const actor = s.turn.active; const opts = keyed(s, legal);
            if (!node.expanded) {
                const { value: v, logits } = evaluate(net, s, opts.map(o => o.action), actor);
                const p = softmax(logits);
                node.actor = actor; node.expanded = true;
                opts.forEach((o, i) => { if (!node.kids.has(o.key)) node.kids.set(o.key, new Edge(p[i])); });
                if (node === top && noise > 0) addNoise(node, rnd, noise);
                value = actor === rootPid ? v : -v; break;
            }
            if (depth >= maxDepth) { value = evaluate(net, s, opts.map(o => o.action), actor).value * (actor === rootPid ? 1 : -1); break; }
            let total = 0;
            for (const o of opts) { if (!node.kids.has(o.key)) node.kids.set(o.key, new Edge(1 / opts.length)); total += node.kids.get(o.key).n; }
            let best = null; let bestScore = -Infinity;
            for (const o of opts) {
                const e = node.kids.get(o.key);
                const q = e.n ? e.w / e.n : 0;                                   // w is stored from the ACTOR's point of view
                const sc = q + cpuct * e.prior * Math.sqrt(total + 1) / (1 + e.n);
                if (sc > bestScore) { bestScore = sc; best = o; }
            }
            const edge = node.kids.get(best.key);
            path.push({ edge, actor });
            s = apply(s, best.action); node = edge.node;
        }
        for (const { edge, actor } of path) { edge.n += 1; edge.w += actor === rootPid ? value : -value; }
        top.n += 1;
    }
    return { top, rootPid };
}

function addNoise(node, rnd, eps) {
    const g = [...node.kids.values()].map(() => -Math.log(1 - rnd()));           // Dirichlet(1) via normalised exponentials
    const z = g.reduce((a, b) => a + b, 0); let i = 0;
    for (const e of node.kids.values()) { e.prior = (1 - eps) * e.prior + eps * g[i] / z; i += 1; }
}
// +1 / -1 / 0 for `pid` from the finished game
const outcome = (s, pid) => { const w = winner(s); return w.tie ? 0 : w.winnerId === pid ? 1 : -1; };

// The decision: the most-visited root action (ties by prior); also the visit distribution for training targets.
export function decide(net, state, legal, opts = {}) {
    const { top } = search(net, state, opts);
    const opts2 = keyed(state, legal);
    let best = null; let bestN = -1;
    for (const o of opts2) { const e = top.kids.get(o.key); const n = e?.n ?? 0; if (n > bestN || (n === bestN && (e?.prior ?? 0) > (top.kids.get(best?.key)?.prior ?? 0))) { best = o; bestN = n; } }
    const visits = opts2.map(o => ({ index: o.index, n: top.kids.get(o.key)?.n ?? 0, q: (() => { const e = top.kids.get(o.key); return e?.n ? e.w / e.n : 0; })() }));
    return { action: best.action, visits };
}

export function mctsPolicy(net, { sims = 200, seed = 1, cpuct = 1.5 } = {}) {
    let counter = 0;
    return (state, legal) => {
        if (legal.length === 1) return legal[0];
        counter += 1;
        return decide(net, state, legal, { sims, cpuct, seed: (seed * 1000003 + counter) >>> 0 }).action;
    };
}
