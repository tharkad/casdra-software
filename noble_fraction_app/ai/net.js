import { encodeState, encodeAction, STATE_SIZE, STATE_SIZE_V2, ACTION_SIZE } from './features.js';

// A small policy/value network in plain JS (no dependencies), so the same file runs in training self-play, the browser and the
// desktop app. state -> trunk (2 ReLU layers) -> value;  action -> embedding;  logit(action) = trunk . embedding / sqrt(d).
// Weights are a plain JSON object: { H, D, W1, b1, W2, b2, Wv, bv, Wa, ba }.

export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function randomNet({ H = 64, D = 32, seed = 1, stateVersion = 1 } = {}) {
    const inputs = stateVersion >= 2 ? STATE_SIZE_V2 : STATE_SIZE;
    const rnd = mulberry(seed);
    const mat = (rows, cols) => Array.from({ length: rows }, () => Float32Array.from({ length: cols }, () => (rnd() * 2 - 1) * Math.sqrt(2 / cols)));
    const zeros = n => new Float32Array(n);
    return { H, D, stateVersion, W1: mat(H, inputs), b1: zeros(H), W2: mat(H, H), b2: zeros(H), Wv: mat(1, H), bv: zeros(1), Wa: mat(D, ACTION_SIZE), ba: zeros(D), Wt: mat(D, H) };
}

const dense = (W, b, x, relu) => { const out = new Float32Array(W.length); for (let i = 0; i < W.length; i += 1) { let s = b[i]; const row = W[i]; for (let j = 0; j < x.length; j += 1) s += row[j] * x[j]; out[i] = relu && s < 0 ? 0 : s; } return out; };

export function evaluate(net, state, legal, pid) {
    const h1 = dense(net.W1, net.b1, encodeState(state, pid, net.stateVersion ?? 1), true);
    const h = dense(net.W2, net.b2, h1, true);
    const value = Math.tanh(dense(net.Wv, net.bv, h, false)[0]);
    const D = net.Wa.length;
    const t = dense(net.Wt, new Float32Array(D), h, false);                      // trunk projected into the action-embedding space
    const logits = legal.map(a => { const e = dense(net.Wa, net.ba, encodeAction(state, a, pid), true); let s = 0; for (let i = 0; i < D; i += 1) s += t[i] * e[i]; return s / Math.sqrt(D); });
    return { value, logits };
}

export const softmax = logits => { const m = Math.max(...logits); const e = logits.map(x => Math.exp(x - m)); const z = e.reduce((a, b) => a + b, 0); return e.map(x => x / z); };

// A policy in the shape the engine/controller expects: (state, legalActions) -> one of the legal actions.
export function netPolicy(net, { sample = false, rng = Math.random } = {}) {
    return (state, legal) => {
        if (legal.length === 1) return legal[0];
        const pid = state.turn.active;
        const { logits } = evaluate(net, state, legal, pid);
        if (!sample) return legal[logits.indexOf(Math.max(...logits))];
        let r = rng(); const p = softmax(logits);
        for (let i = 0; i < p.length; i += 1) { r -= p[i]; if (r <= 0) return legal[i]; }
        return legal.at(-1);
    };
}
