// combat/deploy.js: the Deployment step of a round on Melee Sections (engine: app/engine/hirefight.js, pending `combat-deploy`; rules 8.3.4c, 8.3.5, 8.3.6a), with no DOM so that node tests can run it.
// The engine decides everything. This file keeps the player's plan (what each hireling does), turns it into the answer the engine takes, asks the engine (on a copy of the game) whether it would accept it,
// and finds the words for why something is greyed out. The answer is { type: 'combat', kind: 'deploy', lures, heroLures, assigns, deploys, flips, auto }.
//
//   plan = { jobs: { [hireUid]: { job: 'send' | 'lure' | 'out', den, side, horse } }, order: [hireUid], heroLures: bool, taker: hireUid | null }
//     job 'send': the hirer sends the hireling at `den` (8.3.6a); the hireling is an attacker now and may be turned over (`side`) and so may his horse (`horse`, 8.3.6a.4)
//     job 'lure': he lures `den` onto a section of his own (8.3.4c.2), and defends it
//     job 'out':  he stays out of the fight this round and cannot attack (8.3.6)
//   order: the order in which the hirelings that are sent are deployed (8.3.6a: it matters when one is sent at a creature that another hireling lured)
//   heroLures: a hidden hero lures everything the hirelings did not, and is no longer hidden (8.3.4b)
//   taker: with the hero hidden, the unhidden hireling who takes the creatures nobody lured (8.3.5a.3)
import { apply } from '../../engine/day.js';
import { hireStats, denSide } from '../../engine/combat.js';

const isUnit = d => d.kind === 'mon' || d.kind === 'nat';
export const DEPLOY = { type: 'combat', kind: 'deploy' };

// ---- what the question holds ----
export const hiresOf = p => p.hires ?? [];
export const hireOfUid = (p, uid) => hiresOf(p).find(h => h.uid === uid) ?? null;
// a creature the random assignment (8.3.5) would deal out once the hirelings have lured: the same test the engine makes
export function unluredOf(st, plan) {
    const c = st.combat, lured = new Set(Object.values(plan.jobs).filter(j => j.job === 'lure' && j.den).map(j => j.den));
    const onSheet = new Set((c.sec?.sheets ?? []).flatMap(s => [s.owner, ...s.attackers]));
    return c.dens.filter(d => isUnit(d) && !d.dead && !d.assigned && !d.bystander && !d.pacified && !d.pickedUp && !d.elsewhere && !onSheet.has(d.uid) && !lured.has(d.uid));
}
// the hirelings who may take the creatures nobody lured (8.3.5a.3: unhidden; a hidden hireling who lures is seen by it, 8.3.4c.3)
export const takersOf = (p, plan) => hiresOf(p).filter(h => !h.held && (!h.hidden || plan.jobs[h.uid]?.job === 'lure'));
// the taker in force now: the one named, else the first (the engine's own default), and only when it matters (the hero hidden and some creature to deal)
export function takerNow(st, p, plan) {
    if (!p.heroHidden || plan.heroLures || !unluredOf(st, plan).length) return null;
    const pool = takersOf(p, plan);
    return pool.find(h => h.uid === plan.taker) ?? pool[0] ?? null;
}
// can the hero lure now (8.3.4b): hidden, and something is left that no hireling lured
export const heroCanLure = (st, p, plan) => !!p.heroHidden && (p.lurable ?? []).some(d => !d.assigned && !Object.values(plan.jobs).some(j => j.job === 'lure' && j.den === d.uid));

// ---- the plan ----
// The opening plan is the engine's own quick plan (`auto`): read from the sections it would make, on a copy of the game. Whoever it left without a job stays out.
export function autoPlan(st, data, p) {
    const plan = { jobs: {}, order: [], heroLures: false, taker: null };
    for (const h of hiresOf(p)) plan.jobs[h.uid] = { job: 'out', den: null, side: h.side, horse: h.horse?.side ?? null };
    let nx = null;
    try { nx = apply(st, data, { ...DEPLOY, auto: true }); } catch { nx = null; }
    const sec = nx?.combat?.sec;
    if (sec) {
        for (const s of sec.sheets) for (const u of s.attackers) if (plan.jobs[u] && !s.held) { plan.jobs[u].job = 'send'; plan.jobs[u].den = s.owner; }
        plan.order = (sec.deployed ?? []).filter(u => plan.jobs[u]?.job === 'send');
        for (const h of hiresOf(p)) if (plan.jobs[h.uid].job === 'send' && !plan.order.includes(h.uid)) plan.order.push(h.uid);
    }
    return plan;
}
// the plan the player is making: kept in `cb.dep`, made afresh for each round's question
export function planFor(st, data, p, cb) {
    const key = `${st.combat.round}|${hiresOf(p).map(h => h.uid).join(',')}|${(p.lurable ?? []).map(d => d.uid).join(',')}`;
    if (cb.depKey !== key || !cb.dep) { cb.dep = autoPlan(st, data, p); cb.depKey = key; cb.depOpen = null; }
    return cb.dep;
}
// the hirelings who may do something now: not held by a Tremendous monster (8.6.2)
export const acts = h => !h.held;

// Change one hireling's job, keeping the plan whole: the order of those sent, each creature lured only once, a taker is not sent.
export function setJob(st, p, plan, uid, job, den = undefined) {
    const j = plan.jobs[uid], h = hireOfUid(p, uid);
    if (!j || !h || h.held) return;
    if (job === 'lure') {
        const free = (p.lurable ?? []).filter(d => !Object.entries(plan.jobs).some(([u, x]) => u !== uid && x.job === 'lure' && x.den === d.uid));
        j.den = den !== undefined ? den : (free.find(d => d.uid === j.den) ?? free[0])?.uid ?? null;
    }
    if (job === 'send') j.den = den !== undefined ? den : ((p.targets ?? []).find(d => d.uid === j.den) ?? (p.targets ?? [])[0])?.uid ?? null;
    if (job === 'out') j.den = null;
    j.job = job;
    plan.order = plan.order.filter(u => u !== uid);
    if (job === 'send') plan.order.push(uid);
    if (job !== 'send') { j.side = h.side; j.horse = h.horse?.side ?? null; }          // (only an attacker is turned over: 8.3.6a.4)
    // somebody lured that creature already: the other lure is taken back
    if (job === 'lure' && j.den) for (const [u, x] of Object.entries(plan.jobs)) if (u !== uid && x.job === 'lure' && x.den === j.den) { x.job = 'out'; x.den = null; }
    if (job === 'send' && takerNow(st, p, plan)?.uid === uid) plan.jobs[uid].job = 'out';
}
// Tap on the number of a hireling that is sent: he goes one place earlier (the first goes to the end)
export function moveEarlier(plan, uid) {
    const i = plan.order.indexOf(uid);
    if (i < 0 || plan.order.length < 2) return;
    plan.order.splice(i, 1);
    plan.order.splice(i === 0 ? plan.order.length : i - 1, 0, uid);
}
export function setTaker(st, p, plan, uid) {
    plan.taker = uid;
    const t = takerNow(st, p, plan);
    if (t && plan.jobs[t.uid]?.job === 'send') { plan.jobs[t.uid].job = 'out'; plan.jobs[t.uid].den = null; plan.order = plan.order.filter(u => u !== t.uid); }
}
export function setHeroLures(st, p, plan, on) {
    plan.heroLures = !!on;
}

// ---- the answer ----
export function payload(st, p, plan) {
    const a = { ...DEPLOY };
    const lures = hiresOf(p).filter(h => !h.held && plan.jobs[h.uid]?.job === 'lure' && plan.jobs[h.uid].den).map(h => ({ hire: h.uid, den: plan.jobs[h.uid].den }));
    if (lures.length) a.lures = lures;
    if (plan.heroLures && p.heroHidden) a.heroLures = true;
    const t = takerNow(st, p, plan);
    if (t) a.assigns = Object.fromEntries(unluredOf(st, plan).map(d => [d.uid, t.uid]));
    const deploys = [];
    for (const uid of plan.order) {
        const j = plan.jobs[uid], h = hireOfUid(p, uid);
        if (!j || j.job !== 'send' || !j.den || !h || h.held) continue;
        const d = { hire: uid, target: j.den };
        if (j.side && j.side !== h.side) d.side = j.side;
        if (j.horse && h.horse && j.horse !== h.horse.side) d.horse = j.horse;
        deploys.push(d);
    }
    for (const h of hiresOf(p)) { const j = plan.jobs[h.uid]; if (!h.held && j?.job === 'out' && h.uid !== t?.uid) deploys.push({ hire: h.uid, target: null }); }          // (the one who takes the unlured creatures is being attacked: he cannot be deployed at all, 8.3.6a)
    if (deploys.length) a.deploys = deploys;
    return a;
}
export const autoPayload = () => ({ ...DEPLOY, auto: true });

// Would the engine take this answer? Asked of a copy of the game; null when it would, else the engine's own sentence.
export function refusal(st, data, a) {
    try { apply(st, data, a); return null; } catch (e) { return e.message ?? String(e); }
}

// ---- how the stage reads the plan: a short word on each creature ----
// { [denUid]: { word, short } }: LURED (a hireling drew it), FACED (a hireling is sent at it), ON YOU (the hero gets it), ON <hireling> (the taker gets it)
export function tagsOf(st, data, p, plan) {
    const out = {}, name = u => hireOfUid(p, u)?.name ?? '';
    const t = takerNow(st, p, plan), un = new Set(unluredOf(st, plan).map(d => d.uid));
    for (const [u, j] of Object.entries(plan.jobs)) {
        if (!j.den || hireOfUid(p, u)?.held) continue;
        if (j.job === 'lure') out[j.den] = { word: 'LURED', short: 'LURED', by: name(u) };
        else if (j.job === 'send') out[j.den] = { word: 'FACED', short: 'FACED', by: name(u) };
    }
    for (const d of st.combat.dens) {
        if (out[d.uid] || !un.has(d.uid)) continue;
        if (!p.heroHidden || plan.heroLures) out[d.uid] = { word: 'ON YOU', short: 'ON YOU' };
        else if (t) out[d.uid] = { word: `ON ${name(t.uid).split(' ')[0].toUpperCase()}`, short: 'ON HIRE' };
    }
    return out;
}

// ---- words for what a hireling looks like on the deployment card ----
export const SIDE_WORD = { light: 'Light side', dark: 'Dark side' };
export const HORSE_WORD = { light: 'walking', dark: 'galloping' };
export function sideFacts(st, data, h, side) {
    const s = hireStats(data, h.id, h.kind, st, side);
    return { harm: s.harm, atk: s.atk, stars: s.stars ?? 0, move: s.move, can: s.harm != null && s.atk != null, text: s.harm != null && s.atk != null ? `${s.harm}${s.atk}${'*'.repeat(s.stars ?? 0)}` : 'no attack' };
}
export function horseFacts(data, h, side) {
    const hd = data.natives?.[h.id]?.horse, v = hd?.[side];
    return hd && v ? { name: hd.name, move: v.moveTime, vuln: v.vulnerability, armored: !!hd.armored } : null;
}
// why a hireling is greyed out, in both voices (null when he can act)
export function greyWhy(h) {
    if (h.held) return { story: 'A great monster has hold of him. He cannot be sent or lure anything.', detail: 'A red-side-up Tremendous monster holds him: it stays on him, and he can neither lure nor be deployed (8.6.2).' };
    return null;
}
export function hiddenWhy(h) {
    if (!h.hidden) return null;
    return { story: 'He is hidden. Nothing can be set on him, and if he lures or attacks he is seen.', detail: 'A hidden hireling cannot be assigned an attacker (8.3.5a.3); if he lures (8.3.4c.3) or is sent at a target (8.4.2b.2) he is no longer hidden.' };
}
export const nameOfDen = (st, data, d) => denSide(st, data, d).name;
