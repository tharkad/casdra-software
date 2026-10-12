import { lvl } from './core.js';
import { defOf, weightOf } from './items.js';
import { BOOTS } from './modifiers.js';

// End-of-game scoring (rules digest 05 section 6).
export const FACTORS = { great: 1, spells: 2, fame: 10, notoriety: 20, gold: 30 };
export const CATS = ['great', 'spells', 'fame', 'notoriety', 'gold'];

export function earned(st, data) {
    const ch = st.ch;
    const cursed = n => (ch.curses ?? []).includes(n);
    // Things beyond what his strongest Move chit (or horse or boots) could carry do not count.
    let cap = 0;
    for (const x of ch.chits) if (x.state !== 'wounded' && x.type === 'move') cap = Math.max(cap, lvl(x.strength));
    for (const it of ch.items) {
        if (it.destroyed) continue;
        if (it.kind === 'horse' && data.horses[it.id]) cap = Math.max(cap, lvl(data.horses[it.id].walk.strength));
        if (BOOTS[it.id] && it.active) cap = Math.max(cap, lvl(BOOTS[it.id][0]));
    }
    let great = 0, fame = cursed('Disgust') ? -1 : ch.fame, notor = ch.notoriety;
    for (const it of ch.items) {
        const d = defOf(data, it);
        if (!d || it.destroyed) continue;
        if (it.kind !== 'horse' && lvl(weightOf(data, it)) > cap) continue;
        const card = it.card ? data.treasures[it.card] : d;          // a card that became a counter keeps its Great flag
        if ((it.kind === 'treasure' || it.card) && card?.great) great++;
        fame += d.fame ?? 0;
        notor += d.notoriety ?? 0;
    }
    return { great, spells: 0, fame, notoriety: notor, gold: (cursed('Ashes') ? -1 : ch.gold) - (ch.startValue ?? 10) };
}

export function targets(st) {
    const v = st.ch.vp, t = {};
    for (const c of CATS) t[c] = (v[c] ?? 0) * FACTORS[c];
    return t;
}

export function scoreGame(st, data) {
    if (st.ch.dead) return { total: -100, dead: true, rows: [], won: false };
    const e = earned(st, data), need = targets(st);
    let total = 0;
    const rows = CATS.map(c => {
        let diff = e[c] - need[c];
        if (diff < 0) diff *= 3;
        const basic = Math.floor(diff / FACTORS[c]);
        const bonus = basic * (st.ch.vp[c] ?? 0);
        total += basic + bonus;
        return { cat: c, earned: e[c], need: need[c], diff, basic, bonus };
    });
    return { total, rows, won: total >= 0, dead: false };
}
