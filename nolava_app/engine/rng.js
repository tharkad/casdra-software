// Seeded, replayable random numbers (mulberry32). Every random choice in a game goes through one of these so a game can be replayed.
export function makeRng(seed) {
    let s = seed >>> 0;
    const next = () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        int: n => Math.floor(next() * n),
        die: () => 1 + Math.floor(next() * 6),
        pick(arr) { return arr[Math.floor(next() * arr.length)]; },
        shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    };
}
