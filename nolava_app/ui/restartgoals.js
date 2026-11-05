// The goals a returning character starts from: the ones the fallen one had (Mike: "the same VIP settings as the previous game"), trimmed so they fit the points left to spend.
export function carriedGoals(vp, total) {
    const out = { great: 0, spells: 0, fame: 0, notoriety: 0, gold: 0 };
    let left = total;
    for (const k of ['fame', 'notoriety', 'gold', 'great', 'spells']) { const n = Math.min(Math.max(0, vp?.[k] | 0), 5, left); out[k] = n; left -= n; }
    return out;
}
