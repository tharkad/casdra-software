// campaign.js: the roguelike campaign record (pure; the screens in screens/campaign.js and screens/play/endscreen.js use it).
// A CAMPAIGN keeps characters from run to run (Extended Development, rule 10.E.6 of the 3.1 book). Each character has a stage and the chits of a higher stage he has earned one at a time:
//   6.2    in each game he must acquire as many Victory Points as the NEXT stage (2 at the first stage ... 5 at the fourth)            -> targetVp
//   6.3.1  a character who survived gains one action chit of the next stage after his current one, and may use it in the next game; by 5.4 he CHOOSES which
//   6.3.2  a first-stage hero with two extra chits is still first stage
//   6.3.3  all three chits of a stage: the next game he starts at that stage
//   6.3.4  the winner jumps a full stage in the next game ("first stage with one extra chit: second stage with one extra chit")
//   6.3.5  a character who is killed drops a full stage (three chits);  6.5  never below the first stage, never fewer than three chits
//   6.6    at the fourth stage he keeps track of stages and chits even though he cannot gain chits (a "veteran": stage 5 and above, kept as a count)
//   9.2.2a suicide is a player killing his own character, so it is a death
// OURS, not the book's (docs/design/roguelike/ROGUELIKE-V0.md): the run length by stage (RUN_DAYS), the starter set (STARTERS), a run that is abandoned counts as a fall, the order in which a death takes
// the three chits away (the chits above his stage first, then the last of the card), a winner re-picks the chits he had earned (as a count) from the new next stage, a veteran plays the fourth-stage hero and
// the flat rewards above the fourth stage (6.7) and their higher targets (6.8) are NOT built.
// Nothing here touches the DOM or the engine's states; the engine's own part is `newGame(data, { startStage, extraChits })` (engine/stages.js).
import { chitId, MAX_STAGE, cardChits } from '../../engine/catalogue.js';
import { spreadVp, fitSpread, validSpread } from '../goalspread.js';

/** Days in a run, by the stage he plays at. Tunable: the bots (docs/design/roguelike/STAGE-SIM.md) found 28 days the band where survival is about 30 to 60 percent at stages 2 to 4, and stage 1 too deadly that long. */
export const RUN_DAYS = { 1: 14, 2: 21, 3: 28, 4: 28 };
/** The characters a new campaign offers (the six that survive well in the bots' measurements); the others wait for a later build, or the testing switch. */
export const STARTERS = ['woods-girl', 'amazon', 'witch', 'druid', 'magician', 'swordsman'];
export const KEEP_RUNS = 60;
const KEY = 'mr-roguelike-v1';

export const blankRecord = () => ({ v: 1, characters: {}, runs: [], unlockedAll: false, pending: null, last: null });
export const heroOf = (rec, id) => ({ stage: 1, extra: [], runs: 0, wins: 0, deaths: 0, best: 1, ...(rec.characters?.[id] ?? {}) });
export const playable = (rec, allIds) => (rec.unlockedAll ? [...allIds] : STARTERS.filter(id => allIds.includes(id)));
export const setUnlockedAll = (rec, on) => ({ ...rec, unlockedAll: !!on });
/** The character the campaign screen opens on (the last one played). */
export const setLast = (rec, id) => ({ ...rec, last: id });

/** The stage he is played at: the chits only go up to the fourth stage. */
export const playStage = stage => Math.min(stage, MAX_STAGE);
/** 6.2: the Victory Points of the next stage. (6.8's higher targets above the fourth stage are not built.) */
export const targetVp = stage => playStage(stage) + 1;
export const runDays = stage => RUN_DAYS[playStage(stage)];
export const stageLabel = stage => (stage > MAX_STAGE ? 'Veteran' : `Stage ${stage}`);
/** How a finished run counts: killed (or ended his own life) is a fall, alive with the goals met a win, otherwise he survived. */
export const resultOf = ({ dead, won }) => (dead ? 'fell' : won ? 'won' : 'survived');

// ---- the chits a record describes ----
const cardOf = (data, id) => data.characters[id];
const chitsOfStage = (data, id, s) => cardChits(cardOf(data, id)).filter(x => x.chit.stage === s);
/** The ids of the chits a hero has, in the card's order: those of his stage and below, and his extra chits. */
export const chitsOwned = (data, id, hero) => {
    const keep = new Set(hero.extra ?? []), s = playStage(hero.stage);
    return cardChits(cardOf(data, id)).filter(x => x.chit.stage <= s || keep.has(x.id)).map(x => x.id);
};
const inCardOrder = (data, id, ids) => { const all = cardChits(cardOf(data, id)).map(x => x.id); return [...new Set(ids)].sort((a, b) => all.indexOf(a) - all.indexOf(b)); };
/** From a set of chit ids: the stage it makes (every chit of the stages up to it) and the chits above that stage (never fewer than three chits: the first stage's own). */
function settle(data, id, ids) {
    const have = new Set(ids), all = cardChits(cardOf(data, id));
    let stage = 0;
    while (stage < MAX_STAGE && all.filter(x => x.chit.stage === stage + 1).every(x => have.has(x.id))) stage++;
    if (stage < 1) return { stage: 1, extra: [] };
    return { stage, extra: all.filter(x => x.chit.stage > stage && have.has(x.id)).map(x => x.id) };
}

// ---- the run that comes ----
/** The goals the player chose last time for this character (the record keeps one spread per character), or null. */
export const lastGoals = (rec, id) => { const g = rec.characters?.[id]?.goals; return g && typeof g === 'object' ? g : null; };
/** The run the character will play: the stage and extra chits, the length, the Victory Points (6.2) and the goals they start on. `goals` is the spread the run begins with unless the player changes it: the
 * one chosen last time, fitted to this run's points (the total changes when the stage does), or the usual spread when nothing was chosen yet. `goalsFrom` says which: 'last' (the same as last time),
 * 'fitted' (last time's, with points added or taken away to fit) or 'usual'. `usual` is the usual spread, whichever is the start. */
export function runPlan(rec, id) {
    const h = heroOf(rec, id), vp = targetVp(h.stage), usual = spreadVp(vp), last = lastGoals(rec, id), fit = last ? fitSpread(last, vp) : null;
    const goalsFrom = !fit ? 'usual' : validSpread(last, vp) ? 'last' : 'fitted';
    return { character: id, runNo: h.runs + 1, stage: h.stage, playStage: playStage(h.stage), extra: [...h.extra], days: runDays(h.stage), vp, goals: fit ?? usual, goalsFrom, usual, last: fit ? last : null };
}
/** The goals the player chose, kept for the character's next run. A spread that is not a whole spread of this run's points is refused (the record is left alone). */
export function rememberGoals(rec, id, goals) {
    const p = runPlan(rec, id);
    if (!validSpread(goals, p.vp)) throw new Error(`goals must be a spread of exactly ${p.vp} victory points over the five goals, each 0 to 5`);
    return { ...rec, characters: { ...rec.characters, [id]: { ...heroOf(rec, id), goals: { great: goals.great, spells: goals.spells, fame: goals.fame, notoriety: goals.notoriety, gold: goals.gold } } } };
}
/** The parameters of the game screen for the next run (a normal single-character game, plus the stage option and a `roguelike` tag the end screen and the History read). `goals` is the spread the
 * player chose (it must be a whole spread of this run's points: anything else throws); without it the run begins on the plan's own goals. */
export function runParams(rec, id, { seed, options, goals } = {}) {
    const p = runPlan(rec, id);
    if (goals && !validSpread(goals, p.vp)) throw new Error(`goals must be a spread of exactly ${p.vp} victory points over the five goals, each 0 to 5`);
    const vp = goals ? { great: goals.great, spells: goals.spells, fame: goals.fame, notoriety: goals.notoriety, gold: goals.gold } : p.goals;
    return { fresh: true, character: id, vp, mode: 'month', lastDay: p.days, seed, options: options ? { ...options } : undefined, startStage: p.playStage, extraChits: p.extra,
        roguelike: { character: id, runNo: p.runNo, stage: p.stage, extra: p.extra, days: p.days, vp: p.vp } };
}

// ---- after a run ----
const word = n => (n === 1 ? 'a chit' : 'two chits');
function outcomeOf(kind, from, to, pick, data, id) {
    const label = s => (s > MAX_STAGE ? `stage ${s}, a veteran` : `stage ${s}`);
    let text;
    if (kind === 'fell') {
        text = from.stage === 1 && to.stage === 1 ? 'You fell: you stay at stage 1, the lowest stage.' : `You fell: back to ${label(to.stage)}.`;
    } else if (kind === 'won') {
        text = to.stage > MAX_STAGE ? `You won: you rise to ${label(to.stage)}. A veteran has every chit; what comes after is for a later build.` : `You won: you rise to stage ${to.stage}.`;
        if (pick) text += ` You also earn ${word(pick.k)}. Choose ${pick.k === 1 ? 'it' : 'them'}.`;
    } else if (pick) text = 'You survived: you earn a chit. Choose it.';
    else if (to.stage > from.stage) text = `You survived: the last chit of stage ${to.stage} is yours, and you rise to stage ${to.stage}.`;
    else text = 'You survived. A hero of the fourth stage has every chit.';
    return { kind, from: { stage: from.stage, extra: [...from.extra] }, to: { stage: to.stage, extra: [...to.extra] }, pick, text };
}

/** Apply a finished run to the record: `run` is { id, character, result ('survived' | 'won' | 'fell'), day }. Applied once per run id (a second call returns the first outcome and changes nothing).
 * A chit to choose waits in `rec.pending` until `chooseChits`. Returns { rec, outcome, again? }. */
export function applyRun(rec, data, run) {
    const seen = rec.runs.find(r => r.id === run.id);
    if (seen) return { rec, outcome: seen.outcome, again: true };
    const id = run.character, h = heroOf(rec, id), from = { stage: h.stage, extra: [...h.extra] };
    let to = { stage: h.stage, extra: [...h.extra] }, pick = null;
    if (run.result === 'fell') {
        if (h.stage > MAX_STAGE) to = { stage: h.stage - 1, extra: [] };              // (above the fourth stage a stage is only a count: all twelve chits stay)
        else {
            const own = chitsOwned(data, id, h), all = cardChits(cardOf(data, id)).map(x => x.id);
            // three chits go: the ones above his stage first, then the last of the card, the highest stage first (OUR order: the book only says three chits)
            const order = [...own].sort((a, b) => cardOf(data, id).chits[all.indexOf(b)].stage - cardOf(data, id).chits[all.indexOf(a)].stage || all.indexOf(b) - all.indexOf(a));
            const left = own.filter(x => !order.slice(0, 3).includes(x));
            to = left.length < 3 ? { stage: 1, extra: [] } : settle(data, id, left);
        }
    } else if (h.stage > MAX_STAGE || (h.stage === MAX_STAGE && run.result === 'survived')) {
        to = { stage: run.result === 'won' ? h.stage + 1 : h.stage, extra: [] };            // (no chit above the fourth stage: 6.6)
    } else {
        const count = h.extra.length + 1;                                               // the chit for surviving (6.3.1) joins the extras
        const rise = (count === 3 ? 1 : 0) + (run.result === 'won' ? 1 : 0);
        if (!rise) pick = { k: 1, stage: h.stage + 1 };
        else {
            const stage = h.stage + rise, keep = count === 3 ? 0 : count;              // three chits complete a stage (6.3.3); the winner jumps (6.3.4) and re-picks the ones he had
            to = { stage, extra: [] };
            if (keep && stage < MAX_STAGE) pick = { k: keep, stage: stage + 1 };
        }
    }
    const outcome = outcomeOf(run.result, from, to, pick, data, id);
    const hero = { ...h, stage: to.stage, extra: to.extra, runs: h.runs + 1, wins: h.wins + (run.result === 'won' ? 1 : 0), deaths: h.deaths + (run.result === 'fell' ? 1 : 0), best: Math.max(h.best ?? 1, to.stage) };
    const entry = { id: run.id, character: id, runNo: h.runs + 1, stage: h.stage, result: run.result, day: run.day ?? null, outcome, at: run.at ?? null };
    const runs = [...rec.runs, entry].slice(-KEEP_RUNS);
    return { rec: { ...rec, characters: { ...rec.characters, [id]: hero }, runs, pending: pick ? { character: id, runId: run.id, k: pick.k, stage: pick.stage } : rec.pending }, outcome };
}

/** The chits he may choose from now: those of the stage in `rec.pending` that he does not have. [{ id, chit }] in the card's order; empty with nothing pending. */
export function pendingPool(rec, data) {
    const p = rec.pending;
    if (!p) return [];
    const have = new Set(heroOf(rec, p.character).extra);
    return chitsOfStage(data, p.character, p.stage).filter(x => !have.has(x.id)).map(x => ({ id: x.id, chit: x.chit, n: x.n }));
}

/** His choice of chit(s): exactly `pending.k` different chits of the pool. Returns { rec } or { rec (unchanged), error }. */
export function chooseChits(rec, data, ids) {
    const p = rec.pending;
    if (!p) return { rec, error: 'There is no chit to choose.' };
    const pool = new Set(pendingPool(rec, data).map(x => x.id));
    if (!Array.isArray(ids) || ids.length !== p.k || new Set(ids).size !== p.k || !ids.every(x => pool.has(x))) return { rec, error: `Choose ${p.k === 1 ? 'one chit' : `${p.k} different chits`} of stage ${p.stage}.` };
    const h = heroOf(rec, p.character);
    return { rec: { ...rec, characters: { ...rec.characters, [p.character]: { ...h, extra: inCardOrder(data, p.character, [...h.extra, ...ids]) } }, pending: null } };
}

// ---- the store ----
const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
/** The record kept on this device (localStorage is per release channel: channel.js). Anything missing or broken is a blank record. */
export function loadRecord(s = store()) {
    try {
        const t = s?.getItem(KEY);
        if (!t) return blankRecord();
        const r = JSON.parse(t);
        return r && r.v === 1 && r.characters && Array.isArray(r.runs) ? { ...blankRecord(), ...r } : blankRecord();
    } catch { return blankRecord(); }
}
export function saveRecord(rec, s = store()) {
    try { s.setItem(KEY, JSON.stringify(rec)); return true; } catch { return false; }
}
