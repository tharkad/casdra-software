// growth.js: development DURING a game, and open scoring (rules 10.E.5.4 and 10.E.6.10 of the 3.1 book). The engine option `openScoring: true` (newGame; stored in `st.options.openScoring` only when true).
//
// What the book says, in short:
//   5.4    each time a character gains a certain number of points toward his Victory Requirements, he gains one of the action chits of his NEXT level (he chooses which); three chits complete the level.
//   5.4.1  a chit costs as many points as his current level (one point at the first level, two at the second ...).
//   5.4.2  his Great Treasures and the Fame and Notoriety of his belongings count. He gains a point only when his point TOTAL increases: if he loses points he must regain them before he can progress.
//   5.4.3  a chit is kept and usable at once. Completing his second level gives him his first Special Advantage, the fourth the second. "Gaining levels does not change his weapons, armor, spells and
//          trading advantages; these change only as a result of the normal events of the game."
//   6.10   no Victory Requirements are chosen; points of ANY kind count (5.4's limit to the recorded requirements is lifted); negative Fame and Notoriety (divided by 10 and 20, rounded down, NO x3
//          penalty) must be made up by more positive points before a chit is earned.
//
// How it is kept (all of it on the character, `ch.growth`; nothing else of the state changes):
//   kinds   the whole points he holds now, by kind: Great Treasures 1, Spells 2, Fame 10, Notoriety 20, Gold 30 to the point (score.js FACTORS; the same arithmetic as 9.3.2, without its x3 for a
//           shortfall). Fame and Notoriety below zero are points AGAINST him (rounded toward zero: -15 Fame is -1 point). Gold counts from his starting worth, as the score does, and never goes below
//           zero (the book names only Fame and Notoriety as negative).
//   t       the sum of the kinds now.        base   the total when the game began.        hw   the highest total he has reached since.
//   spent   the points the chits he has taken have cost.
//   progress = hw - base - spent. A point lost lowers `t` but not `hw`, so nothing is gained until `t` is back above `hw` (5.4.2 and 6.10 in one rule). A treasure handed away and handed back gives
//   nothing the second time, because each loss must be regained first; one that goes to a second character raises HIS total (a gift moves the points with the item).
//   When progress reaches the cost of a chit (his level times CHIT_COST_PER_STAGE) he has a CHOICE: one of the three chits of the next level that he lacks.
//
// The choice is a standing one, not a `pending` question: it never blocks the day. It waits in `ch.growth` / the view (`me.growth.choice`) and the action `{ type: 'chit', chit: <id> }` answers it at any
// time, like `meet` and `hireling` (day.js `step`). Points are counted after every action (`tick`, called from day.js `apply`), so the ledger needs no hook at the places Fame, Gold and treasure change.
//
// OUR choices where the book is silent (docs/design/roguelike/OPEN-SCORING.md "Built"):
//   - the carrying limit of 9.3.1 (things too heavy for the strongest Move chit do not count) is an END-of-game rule and is not applied here: the Move chit that sets it tires and rests during play,
//     and the total would jump up and down. The curses Disgust and Ashes (Fame / Gold count as -1 at the end) are not applied either.
//   - a hero of the fourth level has no chit to earn (there are none above it); his points are still counted.
//   - relationships (5.2.2, 5.4.3) do not change mid-game: MIDRUN_RELATIONSHIPS below says so and can be switched on; Advantages do (5.4.3); gear and spells never do.
import { refuse, say } from './core.js';
import { defOf } from './items.js';
import { ownedItems, ownedGold } from './magic/mist.js';
import { withActor } from './party.js';
import { FACTORS, CATS } from './score.js';
import { MAX_STAGE, chitId } from './stages.js';

/** A chit costs this many points for each level the hero has (5.4.1: "as many points as his current level"). The tuning knob: 1 is the book; 0.5 would make growth twice as quick (costs are rounded up, never below 1). */
export const CHIT_COST_PER_STAGE = 1;
/** The points a chit costs a hero of this level (1 to 3: the fourth level has no chit to earn). */
export const chitCost = stage => Math.max(1, Math.ceil(stage * CHIT_COST_PER_STAGE));
/** Does completing the third level give the trading relationships of the card at once? The book says no (5.2.2: only if he STARTS there; 5.4.3: gaining levels does not change trading advantages). */
export const MIDRUN_RELATIONSHIPS = false;

const numOf = id => Number(id.slice(id.lastIndexOf('-') + 1));
const ZERO = () => ({ great: 0, spells: 0, fame: 0, notoriety: 0, gold: 0 });
const sum = k => CATS.reduce((a, c) => a + k[c], 0);

/** What he holds toward each kind, as the score reads it (score.js `earned`) but without the end-of-game limits: { great, spells, fame, notoriety, gold }. Reads the acting character. */
export function holdings(st, data) {
    const ch = st.ch;
    let great = 0, fame = ch.fame, notor = ch.notoriety;
    for (const it of ownedItems(st)) {
        const d = defOf(data, it);
        if (!d || it.destroyed) continue;
        const card = it.card ? data.treasures[it.card] : d;          // a card that became a counter keeps its Great flag
        if ((it.kind === 'treasure' || it.card) && card?.great) great++;
        fame += d.fame ?? 0;
        notor += d.notoriety ?? 0;
    }
    return { great, spells: (ch.learned ?? []).length, fame, notoriety: notor, gold: ownedGold(st) - (ch.startValue ?? 10) };
}

/** The whole points of each kind that `held` comes to: positive ones round down; Fame and Notoriety below zero are points against him (toward zero); nothing else goes below zero. */
export function pointsOf(held) {
    const k = ZERO();
    for (const c of CATS) {
        const v = held[c], f = FACTORS[c];
        k[c] = v >= 0 ? Math.floor(v / f) : c === 'fame' || c === 'notoriety' ? -Math.floor(-v / f) : 0;
    }
    return k;
}

/** The level he has now: the highest whose chits, and those of all below, he holds (1 to 4). */
export function stageNow(ch, data) {
    const card = data.characters[ch.id], have = new Set(ch.chits.map(c => c.id));
    let s = 0;
    while (s < MAX_STAGE && card.chits.every((c, i) => c.stage !== s + 1 || have.has(chitId(ch.id, c.n ?? i + 1)))) s++;
    return Math.max(1, s);
}

/** The chits of `stage` of his card that he does not hold: [{ n, id, chit }] in the card's order. */
export function missingOf(ch, data, stage) {
    const card = data.characters[ch.id], have = new Set(ch.chits.map(c => c.id));
    return card.chits.map((chit, i) => ({ n: chit.n ?? i + 1, id: chitId(ch.id, chit.n ?? i + 1), chit })).filter(x => x.chit.stage === stage && !have.has(x.id));
}

const blank = (st, data) => {
    const k = pointsOf(holdings(st, data)), t = sum(k);
    return { kinds: k, t, base: t, hw: t, spent: 0, chits: [] };
};

/** The ledger of the acting character, made when it is first needed (a character who joined or restarted after the game began starts counting from what he has then). */
function ledger(st, data) {
    return (st.ch.growth ??= blank(st, data));
}

/** Count what the acting character holds now: the kinds, the total, the high-water mark. Says so in the log the first time a chit is within reach. Returns the ledger. */
export function update(st, data) {
    const g = ledger(st, data);
    g.kinds = pointsOf(holdings(st, data));
    g.t = sum(g.kinds);
    if (g.t > g.hw) g.hw = g.t;
    if (!g.offered && choiceOf(st, data)) { g.offered = true; say(st, 'You have earned a chit! Choose it from the growth card.', 'day', null, { ev: { code: 'growth.earned', who: st.ch.id, stage: stageNow(st.ch, data) + 1, cost: chitCost(stageNow(st.ch, data)) } }); }
    return g;
}

/** Count every living character (called after each action from day.js `apply`); a game without the option does nothing. */
export function tick(st, data) {
    if (!st.options?.openScoring) return;
    for (const id of st.order) {
        const c = st.chars[id];
        if (!c || c.dead || c.gone || c.leader) continue;
        withActor(st, id, () => update(st, data));
    }
}

/** Give every character the ledger (a new game: the baseline is what he begins with). */
export function start(st, data) {
    if (!st.options?.openScoring) return;
    for (const id of st.order) { const c = st.chars[id]; if (c && !c.leader) withActor(st, id, () => ledger(st, data)); }
}

/** Points toward the next chit: what he has gained beyond his last high-water mark and not yet spent on a chit. */
export const progressOf = g => g.hw - g.base - g.spent;

/** The chit he has earned and not yet taken: { stage (the stage of the chits on offer), cost, options: [{ n, id, chit }] }, or null (nothing earned, or the fourth level has nothing above it). */
export function choiceOf(st, data) {
    const ch = st.ch, g = ch.growth;
    if (!g || ch.dead) return null;
    const stage = stageNow(ch, data);
    if (stage >= MAX_STAGE) return null;
    const cost = chitCost(stage);
    if (progressOf(g) < cost) return null;
    const options = missingOf(ch, data, stage + 1);
    return options.length ? { stage: stage + 1, cost, options } : null;
}

// The Special Advantages of a level (5.2.1): none at the first, number 1 at the second and third, both at the fourth.
const advantagesOf = (card, stage) => (stage === 1 ? [] : stage < MAX_STAGE ? (card.advantages ?? []).filter(a => a.n === 1) : (card.advantages ?? [])).map(a => a.key);

/** The action `{ type: 'chit', chit }`: take one of the chits on offer. It is usable at once (5.4.3). It may be taken after the last day too: a chit earned by the last move of a game is still the player's to choose (the end screen offers it). Completing a level gives that level's Special Advantage at that moment. */
export function act(st, data, action) {
    if (!st.options?.openScoring) refuse('growth.off', 'This game does not give chits for points.', null, '10.E.6.10');
    const ch = st.ch;
    if (ch.dead || ch.gone) refuse('growth.dead', `${ch.name} can earn no more chits.`, null, '10.E.5.4');
    const g = update(st, data), c = choiceOf(st, data);
    if (!c) refuse('growth.none', stageNow(ch, data) >= MAX_STAGE ? 'A hero of the fourth stage has every chit to earn.' : 'You have not earned a chit yet.', { progress: progressOf(g), cost: chitCost(stageNow(ch, data)) }, '10.E.5.4.1');
    const pick = c.options.find(x => x.id === action.chit);
    if (!pick) refuse('growth.not-offered', `Choose one of the chits of stage ${c.stage} that you do not have.`, { chit: action.chit ?? null, options: c.options.map(x => x.id) }, '10.E.5.4');
    const before = stageNow(ch, data), card = data.characters[ch.id];
    const x = pick.chit;
    ch.chits.push({ id: pick.id, type: x.type, strength: x.strength, time: x.time, effort: x.effort ?? 0, state: 'active', stage: x.stage, numeral: x.magicNumeral ?? null });
    ch.chits.sort((a, b) => numOf(a.id) - numOf(b.id));          // (the card's order)
    g.spent += c.cost; g.chits.push(pick.id); g.offered = false;
    if (ch.stage) ch.stage = { start: ch.stage.start, extra: [...ch.stage.extra, pick.id] };          // (a fresh start after a death, if the game ever gives one, begins at the stage he began at with these chits)
    const after = stageNow(ch, data);
    if (after > before) {
        for (const key of advantagesOf(card, after)) if (!(ch.adv ??= []).includes(key)) ch.adv.push(key);
        if (MIDRUN_RELATIONSHIPS && after >= 3) for (const [grp, v] of Object.entries(card.relationships ?? {})) if (ch.rel[grp] === undefined) ch.rel[grp] = v;
        g.rose = (g.rose ?? 0) + 1;
        say(st, `You complete stage ${after}!${advantagesOf(card, after).length ? ' You gain your Special Advantage.' : ''}`, 'day', null, { ev: { code: 'growth.stage', who: ch.id, stage: after, chit: pick.id } });
    } else say(st, `You take a chit of stage ${x.stage}.`, 'day', null, { ev: { code: 'growth.chit', who: ch.id, chit: pick.id, stage: x.stage } });
    update(st, data);          // (the points that were more than one chit's worth may already be the next one)
    return st;
}

/** How many chits his points have bought that he has not taken: the one on offer and those behind it (costs rise as a stage is completed). 0 when dead. */
export function dueCount(st, data) {
    const ch = st.ch, g = ch.growth;
    if (!g || ch.dead) return 0;
    let stage = stageNow(ch, data), credit = progressOf(g), left = stage >= MAX_STAGE ? 0 : missingOf(ch, data, stage + 1).length, n = 0;
    while (stage < MAX_STAGE && left > 0 && credit >= chitCost(stage)) {
        credit -= chitCost(stage); n++; left--;
        if (left === 0) { stage++; left = stage >= MAX_STAGE ? 0 : 3; }
    }
    return n;
}

/** The ledger of the acting character in the shape the view carries (`me.growth`); null when the game does not use open scoring. All of it numbers and ids: no sentences. */
export function facts(st, data) {
    if (!st.options?.openScoring) return null;
    const ch = st.ch, g = ledger(st, data), held = holdings(st, data), k = pointsOf(held), t = sum(k);
    const stage = stageNow(ch, data), top = stage >= MAX_STAGE, cost = top ? null : chitCost(stage), credit = progressOf(g);
    const ch_ = choiceOf(st, data);
    const kinds = CATS.map(c => ({ cat: c, points: k[c], per: FACTORS[c], have: held[c] }));
    return {
        stage, top, cost, run: g.hw - g.base, net: t - g.base, credit: top ? 0 : Math.min(credit, cost), togo: top ? null : Math.max(0, cost - credit), owed: Math.max(0, g.hw - t), kinds,
        chits: [...g.chits], rose: g.rose ?? 0, due: dueCount(st, data),
        choice: ch_ ? { stage: ch_.stage, cost: ch_.cost, options: ch_.options.map(o => ({ id: o.id, n: o.n, chit: { type: o.chit.type, strength: o.chit.strength ?? null, time: o.chit.time, effort: o.chit.effort ?? 0, magicNumeral: o.chit.magicNumeral ?? null, stage: o.chit.stage } })) } : null,
    };
}

/** For the bots and the grind: the action that answers a chit choice waiting for the acting character (the first chit on offer), or null. */
export function answer(st, data) {
    if (!st.options?.openScoring || !st.ch) return null;
    const c = choiceOf(st, data);
    return c ? { type: 'chit', chit: c.options[0].id } : null;
}
