import { lvl } from './core.js';
import { defOf, weightOf } from './items.js';
import { BOOTS } from './modifiers.js';
import { ownedItems, ownedGold } from './magic/mist.js';
import { withActor } from './party.js';

// End-of-game scoring (rules digest 05 section 6).
export const FACTORS = { great: 1, spells: 2, fame: 10, notoriety: 20, gold: 30 };
export const CATS = ['great', 'spells', 'fame', 'notoriety', 'gold'];

export function earned(st, data) {
    const ch = st.ch;
    const cursed = n => (ch.curses ?? []).includes(n);
    // Things beyond what his strongest Move chit (or horse or boots) could carry do not count.
    let cap = 0;
    for (const x of ch.chits) if (x.state !== 'wounded' && x.type === 'move') cap = Math.max(cap, lvl(x.strength));
    const items = ownedItems(st);              // (what a Melt into Mist holds for him counts too)
    for (const it of items) {
        if (it.destroyed) continue;
        if (it.kind === 'horse' && data.horses[it.id]) cap = Math.max(cap, lvl(data.horses[it.id].walk.strength));
        if (BOOTS[it.id] && it.active) cap = Math.max(cap, lvl(BOOTS[it.id][0]));
    }
    let great = 0, fame = cursed('Disgust') ? -1 : ch.fame, notor = ch.notoriety;
    for (const it of items) {
        const d = defOf(data, it);
        if (!d || it.destroyed) continue;
        if (it.kind !== 'horse' && lvl(weightOf(data, it)) > cap) continue;
        const card = it.card ? data.treasures[it.card] : d;          // a card that became a counter keeps its Great flag
        if ((it.kind === 'treasure' || it.card) && card?.great) great++;
        fame += d.fame ?? 0;
        notor += d.notoriety ?? 0;
    }
    return { great, spells: (ch.learned ?? []).length, fame, notoriety: notor, gold: (cursed('Ashes') ? -1 : ownedGold(st)) - (ch.startValue ?? 10) };
}

export function targets(st) {
    const v = st.ch.vp, t = {};
    for (const c of CATS) t[c] = (v[c] ?? 0) * FACTORS[c];
    return t;
}

export function scoreGame(st, data) {
    if (st.ch.gone && st.ch.goneScore) return { ...st.ch.goneScore };            // he left the map: his score was fixed that moment (R-21, 9.3.1a)
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

// The end of a game with several characters: every character is scored once, on his own targets (9.3.2), and each player's score is the average over his characters (10.E.4.6;
// with one character per player it is simply his). The highest score wins; there is no rule for a tie (ruling R-19), so equals share the victory.
// `st.score.total` and `.won` are the winner's, so that a reader that only knows the one-character shape still gets finite numbers; `rows` is empty (see `chars[id].rows`).
export function scoreParty(st, data) {
    const chars = {};
    for (const id of st.order) {
        const c = st.chars[id];
        chars[id] = { ...withActor(st, id, () => scoreGame(st, data)), id, name: c.name, owner: c.owner, life: c.life ?? 1 };
        if (c.gone) chars[id].gone = c.gone.day;                    // (left the map on this day: his score is the one he had then)
    }
    const players = st.players.map(p => {
        const total = p.chars.reduce((a, id) => a + chars[id].total, 0) / p.chars.length;
        return { id: p.id, name: p.name, chars: p.chars.slice(), total, won: total >= 0 };
    });
    const best = Math.max(...players.map(p => p.total)), bestChar = Math.max(...st.order.map(id => chars[id].total));
    // places: the best score is first and equals share a place (R-19: a tie is a shared victory, no tiebreak); the next place is the number of players ahead plus one
    for (const p of players) { p.rank = 1 + players.filter(o => o.total > p.total).length; p.victor = p.total === best; }
    const victors = players.filter(p => p.victor).map(p => p.id);
    return { multi: true, total: best, won: best >= 0, rows: [], dead: false, chars, players, victors, tie: victors.length > 1, reason: st.over?.reason ?? 'finished', leaders: st.order.filter(id => chars[id].total === bestChar) };
}

// How far along he is toward the goals he chose, weighted by the victory points he put on each (0..100). Only for display.
export function progress(st, data) {
    const e = earned(st, data), need = targets(st), vp = st.ch.vp ?? {};
    const goals = CATS.filter(c => need[c] > 0).map(c => ({ cat: c, earned: e[c], need: need[c], vp: vp[c] ?? 0, frac: Math.max(0, Math.min(1, e[c] / need[c])) }));
    const w = goals.reduce((a, g) => a + g.vp, 0);
    const pct = w ? Math.round(100 * goals.reduce((a, g) => a + g.vp * g.frac, 0) / w) : 100;
    const met = goals.filter(g => g.earned >= g.need).length;
    return { pct, goals, met, count: goals.length };
}
