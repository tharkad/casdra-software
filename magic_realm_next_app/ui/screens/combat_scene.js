// screens/combat_scene.js: the evening fight as one continuous scene, treatment A "The Clearing" with the result first (docs/design/redesign/mockups/03-combat.html, BUILD-SPEC section 5).
// The foes stand across the top as the real counters, you at the bottom with your weapon, armor and one pip per chit, a narrator line between, and one sheet that asks one question with one
// primary button. After a round the verdict comes first (what fell, what it cost); the blow by blow is the Record, one tap away. The engine decides everything and is asked exactly what the old
// fight sheet (screens/combatui.js) asked it: every answer is built by combat/payload.js. This screen is for the one-character fight (solo and race); the SHARED fight keeps the old screens until P6.
// combatScene({ st, data, act, ui, render, peek }) returns the scene element; `peek` = { gear, map } open the Belongings and the map and bring the fight back.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { voiceSwitch, toast, primary } from '../ds.js';
import { logText } from '../voice.js';
import { roundSynopsis, narrateRoll } from '../narrate.js';
import { nameOfClearing } from '../../engine/catalogue.js';
import { apiOf } from '../../engine/api.js';
import { denSide, optionsOf, viewOf, sheetOf, checkOf, own, fightModel } from '../combat/feed.js';
import * as M from '../combat/model.js';
import { foeEl, foeSize, lanesEl, armorPieces, playSays, heroEl, peekBtn, alliesEl, othersEl, fitStage, gearPopover, cursePopover, fitNames } from '../combat/stage.js';
import { sheetEl, meetingSheet, encounterSheet, meleeSheet, shiftSheet, resultSheet, gridSheet, recapSheet, beatSheet, recordSheet, pitSheet, stepsFor } from '../combat/sheets.js';
import * as P from '../combat/payload.js';
import * as SH from '../combat/shared.js';
import { guardIfChanged } from '../tapguard.js';
import { article, fixNames } from '../names.js';
import { deploySheet, deployNarration } from '../combat/deploy_ui.js';
import * as DP from '../combat/deploy.js';
import { meetingPaid, deathLineOf } from '../voice/fight.js';
import { reviewSheet } from '../combat/sections_review.js';
import { hireRound } from '../combat/sections_voice.js';
import { modeOfPending, SCENE_MODES } from '../combat/modes.js';
import { fightOf } from '../fight.js';
import * as LU from '../combat/lure.js';
import * as PT from '../combat/party.js';

const RESULT_TYPES = ['combat-fatigue', 'combat-wounds', 'combat-encounter', 'combat-deploy', 'combat-lure', 'combat-charge'];          // (combat-lure / combat-charge: a fight of several characters starts its next round there, so each one sees the last round first; combat-deploy: a round on Melee Sections starts with the Deployment, so the last round's result comes before it)
const hashOf = s => { let x = 0; for (let i = 0; i < s.length; i++) x = (Math.imul(31, x) + s.charCodeAt(i)) | 0; return x; };
const MEET = /^Evening meeting with the /;

// the fight this scene belongs to: a fresh fight starts a fresh scene state
const fightKey = (fm, c) => `${fm.day}:${c.at}:${c.rollFrom ?? 0}${fm.battle ? ':shared' : ''}`;

// What the evening's Meeting said, group by group, once the questions are answered: [story lines], [exact lines]
function meetLines(fm, data, c) {
    const by = new Map();
    for (const r of (fm.rolls ?? []).filter(x => x.n > (c.rollFrom ?? 0) && MEET.test(x.what))) by.set(r.what.replace(/^Evening meeting with the ([^:]+).*$/, '$1'), r);
    const lines = M.fightLines(fm);
    const story = [], detail = [];
    for (const [g, r] of by) {
        const t = narrateRoll(r)?.line ?? M.cap(r.result ?? '');
        const asked = /^They (?:insult|challenge) you/.test(r.result ?? '');
        const paid = meetingPaid(lines, g);          // (the voice layer: the event of the payment, else its words)
        const out = asked ? (c.battling?.[g] ? 'You stood your ground. Steel is drawn.' : paid ? `You paid ${paid[1]} ${M.cap(paid[2])}. The ${g} let it lie.` : t) : t;
        story.push(by.size > 1 ? `The ${g}: ${out}` : out);
        detail.push(`${g}: ${r.result ?? ''}${/[.!?]$/.test(r.result ?? '') ? '' : '.'}${asked && paid ? ` You paid ${paid[1]} ${paid[2]}.` : asked && c.battling?.[g] ? ' You chose to fight.' : ''}`);
    }
    return { story, detail };
}

// the question of the evening's Meeting, said as a story: the verdict of the group's roll
function meetNarr(fm, data, c, group) {
    const rolls = (fm.rolls ?? []).filter(r => r.n > (c.rollFrom ?? 0) && MEET.test(r.what) && r.what.replace(/^Evening meeting with the ([^:]+).*$/, '$1') === group);
    const last = rolls.at(-1);
    if (!last) return [`The ${group} are here.`, null];
    const tale = narrateRoll(last)?.line;
    return [tale ?? `${M.cap(last.result ?? '')}.`, last.result ? `${M.cap(last.result)}${/[.!?]$/.test(last.result) ? '' : '.'}` : null];
}

// Note 76: the game menu is on every screen, the fight included (the status strip is not on screen here).
const menuBtn = (ui, render) => h('button', { type: 'button', class: 'cb-menu', 'data-act': 'menu', 'aria-label': 'Menu', onclick: () => { ui.sheet = ui.sheet === 'menu' ? null : 'menu'; render(); } }, icon('menu', 'lg'));
export function combatScene({ st: engineState, data, act, ui, render, peek, shared = null }) {
    const fm = fightModel(engineState, data), p = fm.pending, c = fm.combat;          // (the scene reads the fight through one model made from the API's view, never the engine's state)
    const key = fightKey(fm, c);
    if (ui.cb?.fightKey !== key) ui.cb = { fightKey: key, seen: null, step: 'strike', plan: null, flipped: {}, pick: null, pipState: null, gearCard: false, flippedGear: {} };
    const cb = ui.cb;
    const party = shared ? null : PT.partyOf(fm, data);          // (a party on one phone: who is asked, said on the stage and over the sheet; combat/party.js)
    const X = { st: fm, data, ui, cb, render, p, c, root: null, shared, peek, fight: null, party };          // (`shared`: a fight of several characters, screens/sharedfight.js: the strip, no result screen of its own, the Whom step)
    X.say = text => { if (!X.root) return; const t = toast(text, { host: X.root }); const sh = X.root.querySelector('.cb-sheet'); t.style.bottom = `${(sh ? sh.offsetHeight : 160) + 10}px`; };
    // every answer to the engine goes through here: the scene's own state of the question is dropped, the engine moves on
    // (ui.trace, when a script sets it to an array, collects every answer the scene sends: tools/ui_cb_fuzz.py replays them on the bare engine)
    const emit = a => { ui.trace?.push(JSON.parse(JSON.stringify(a))); act(a); };
    // what a plan's lanes say of it (notes 102, 103): the chit used, the weapon used and the attack time; the Move chit and its maneuver time
    const chitOf = (id, o = null) => own(fm, data).chits.find(x => x.id === id) ?? o?.fightChits?.find(x => x.id === id) ?? null;
    const saysOf = (pl, spell, o = null) => ({ atk: spell ? playSays(fm, data, null, { spell: true }) : pl.fightChit ? playSays(fm, data, chitOf(pl.fightChit, o)) : null, grd: pl.moveChit ? playSays(fm, data, chitOf(pl.moveChit, o), { move: true }) : null });
    X.send = a => { cb.pick = null; cb.cast = null; cb.quiet = null; cb.leaveAsk = null; cb.shift = null; cb.gearSel = null; cb.gearPair = false; emit(a); };
    X.sendMelee = (o, m) => {
        ui.lastPlan = { round: c.round, fight: key, plan: JSON.parse(JSON.stringify(m)), says: saysOf(m, !!o.attackSpell, o) };          // (`says`: what the lanes said of it, as it stood when it was played: the weapon is alerted or not by the blow)
        cb.plan = null; cb.step = 'strike'; cb.pick = null;
        if (!shared) ui.cbBeat = { snap: fightModel(apiOf(data).restore(JSON.stringify(engineState.__st ?? engineState)), data), day: fm.day, logLen: fm.fightLog.n, round: c.round };
        // 8.4.5m: he may not leave a box empty while he doubles up another. The Foes step lets him cycle each creature through the boxes, so a plan may come out that way: the engine would refuse it,
        // so the nearest legal plan is sent and he is told.
        const play = P.melee(o, m), fixed = checkOf(fm, data, { ...play, probe: 'boxes' }).fixed;          // (the engine's own box plan, 8.4.5m)
        if (fixed) { play.boxes = fixed.boxes; X.say('A box was left empty while another held two creatures, so one moved over (every box needs a creature).'); }
        emit(play);
    };

    // ---- which screen this is ----
    const events = c.events ?? [];
    const resultKey = `${c.roundRollFrom ?? 0}|${hashOf(events.join('\n'))}`;
    X.resultKey = resultKey;
    const showResult = !shared && RESULT_TYPES.includes(p.type) && events.length > 0 && cb.seen !== resultKey && !((p.type === 'combat-encounter' || p.type === 'combat-deploy') && (c.round === 1 || p.spellOnly)) && !((p.type === 'combat-lure' || p.type === 'combat-charge') && (p.round ?? c.round) <= 1);
    const facts = M.roundFacts(events, fm, data);
    const aimedNow = p.type === 'combat-melee' && !!p.aimed;          // (the spells of this round have acted: ruling S8, the options are read again after them)
    if (p.type === 'combat-melee' && (!cb.plan || cb.planRound !== c.round || (aimedNow && cb.planAimed !== c.round))) {
        const o0 = optionsOf(fm, data), old = cb.plan && cb.planRound === c.round ? cb.plan : null;
        cb.plan = M.defaultPlan(fm, data, o0); cb.planRound = c.round; cb.planAimed = aimedNow ? c.round : null;
        if (shared) SH.sharedPlan(fm, o0, cb.plan);
        if (old) {          // what he had chosen before the spells acted stays, where it is still legal
            const np = cb.plan; cb.step = 'strike';
            if (old.target === null || o0.targets.some(d => d.uid === old.target) || o0.controlled.some(d => d.uid === old.target)) np.target = old.target;
            np.attackDir = old.attackDir; np.moveDir = old.moveDir; np.shieldDir = old.shieldDir;
            if (old.fightChit && o0.fightChits.some(x => x.id === old.fightChit)) np.fightChit = old.fightChit;
            if (old.moveChit && M.moveList(o0).some(x => x.id === old.moveChit)) np.moveChit = old.moveChit;
            for (const d of o0.boxable) if (old.boxes?.[d.uid] != null) np.boxes[d.uid] = old.boxes[d.uid];
            np.aim = old.aim; np.aimParams = old.aimParams;
        } else cb.step = SH.needsWhom(fm, o0) ? 'whom' : 'strike';
    }
    if (p.type !== 'combat-melee') { cb.plan = null; }
    const mode = p.type === 'combat-over' ? 'over' : showResult ? 'result' : p.type === 'combat-wounds' || p.type === 'combat-fatigue' ? 'grid' : ['combat-pay', 'combat-drinks', 'combat-choice'].includes(p.type) ? 'meet' : p.type === 'combat-melee' ? 'melee' : p.type === 'combat-shift' ? 'shift' : (m => (SCENE_MODES.has(m) ? m : 'unknown'))(modeOfPending(p.type));          // (a question the scene cannot draw is 'unknown': never the Encounter tiles, which the engine would refuse)
    if (mode === 'lure' || party) X.fight = fightOf(fm, [], data, own(fm, data).id);
    const recap = mode === 'over' && !shared ? M.recapOf(fm, data) : null;

    // ---- the stage ----
    const bodies = c.dens.filter(d => d.kind !== 'horse');          // (the whole clearing, whoever a creature is set on: F1 "The Clearing")
    const killedNow = new Set(c.killed ?? []);
    let foes;                                       // [{ d, dead, tag, turned }]
    const turned = mode === 'result' ? M.turnedOver(events, fm) : new Set();   // (a Tactics roll turned these counters over before the blows)
    if (mode === 'meet') {
        const grp = p.type === 'combat-choice' ? p.groups : [p.group];
        const have = new Set(c.dens.filter(d => d.kind === 'nat').map(d => d.id));
        const nats = fm.nats.filter(n => !n.dead && !n.hired && n.loc?.c === c.at && grp.includes(data.natives[n.id].group) && !have.has(n.id)).map(n => ({ uid: `nat:${n.id}`, kind: 'nat', id: n.id, side: 'light' }));
        foes = [...nats, ...M.clearingFoes(fm)].map(d => ({ d }));
    } else if (mode === 'result' || mode === 'grid') {
        // who hit you is said once, in the verdict (QA-8): the wound or fatigue grid that follows is the next question, so the counters stand bare there and every round starts bare
        const res = mode === 'result' ? M.foeResults(events, fm) : new Map();
        const WORDS = { wounded: { text: 'WOUNDED YOU', short: 'WOUNDED', kind: 'bad' }, hit: { text: 'HIT YOU', short: 'HIT', kind: 'bad' }, held: { text: 'NO EFFECT', short: 'NO EFFECT', kind: 'good' }, missed: { text: 'MISSED', short: 'MISSED', kind: 'good' } };
        foes = bodies.filter(d => (!d.dead || (d.kind !== 'part' && killedNow.has(denSide(fm, data, d).name))) && d.kind !== 'part' || (!d.dead && d.kind === 'part'))
            .map(d => { const nm = denSide(fm, data, d).name, dead = d.dead; return { d, dead, tag: !dead && WORDS[res.get(nm)] ? { ...WORDS[res.get(nm)] } : null, turned: mode === 'result' && !dead && turned.has(nm) }; });
    } else if (mode === 'over') {
        foes = bodies.filter(d => d.dead && d.kind !== 'part').map(d => ({ d, dead: true }));
    } else if (mode === 'lure') {
        // 8.3.4: the creatures he may lure stand on the stage (they are not on any sheet yet), with the ones already on his sheet
        const { mine, may } = LU.lureDens(fm, p);
        X.lure = { mine: new Set(mine.map(d => d.uid)), may: new Set(may.map(d => d.uid)), sel: new Set(LU.lureChosen(fm, p, ui)) };
        const shown = new Set([...mine, ...may].map(d => d.uid)), rest = M.clearingBodies(fm).filter(d => !shown.has(d.uid));          // (the others that are here too: on another's sheet, standing by, fighting a hireling)
        foes = [...mine, ...may, ...rest].map(d => ({ d }));
    } else {
        // (the ones who are at peace with him stand last: they are on the stage because he may name them, not because they fight him)
        foes = M.clearingFoes(fm).map(d => ({ d })).sort((a, b) => Number(M.peacefulFoe(a.d)) - Number(M.peacefulFoe(b.d)));
    }
    const o = mode === 'melee' ? optionsOf(fm, data) : null;
    const m = mode === 'melee' ? cb.plan : null, step = o && stepsFor(o, X).some(s => s.id === cb.step) ? cb.step : (o ? stepsFor(o, X)[0].id : 'strike');
    const depTags = mode === 'deploy' ? DP.tagsOf(fm, data, p, DP.planFor(fm, data, p, cb)) : null;          // (the Deployment: what each creature is going to face, said on its counter)
    const size = foeSize(foes.length, mode === 'meet' || mode === 'lure');
    const targetable = mode === 'melee' && (step === 'strike' || step === 'whom') ? new Set(o.targets.filter(d => d.kind !== 'part').map(d => d.uid)) : new Set();          // (every creature, character and hireling the engine lets him name, on the stage: the Whom step lists them too)
    const others = mode === 'over' ? [] : M.othersHere(fm, data);
    // A crowded stage cannot hold a word on every counter (QA-6): from four targets on, only the chosen foe wears TARGET and the others a ghost dot (still a 44px tap); where the counters are small, the other
    // tags are said in a short word (WOUNDED, HIT, HELD) or two letters (the box). Where the counters are big there is room for the whole word.
    const short = size < 76, crowd = targetable.size >= 4, tapNames = targetable.size >= 8;
    let anyTag = false;
    const foeEls = foes.map(({ d, dead, tag, turned: sideChanged }) => {
        let t = tag ?? null;
        if (!t && !dead && d.pickedUp && (mode === 'encounter' || mode === 'melee')) t = { text: d.engagedBy ? 'ON YOUR MAN' : 'HOLDS YOU', short: 'HELD', kind: 'bad' };
        else if (!t && !dead && d.pacified && (mode === 'encounter' || mode === 'melee')) t = { text: 'AT PEACE', short: 'PEACE', kind: 'ghost' };
        else if (!t && !dead && M.peacefulFoe(d) && (mode === 'encounter' || mode === 'melee')) t = { text: 'AT PEACE', short: 'PEACE', kind: 'ghost' };          // (a native group that is not fighting him: note 70)
        else if (!t && !dead && d.kind !== 'part' && (mode === 'encounter' || mode === 'melee') && sheetOf(fm, data)?.dens.find(x => x.uid === d.uid)?.onSheet) t = { text: 'FACING A HIRELING', short: 'HIRELING', kind: 'ghost' };          // (on a Melee Section: a hireling and it fight each other)
        if (!t && depTags?.[d.uid]) t = { text: depTags[d.uid].word, short: depTags[d.uid].short, kind: depTags[d.uid].word === 'ON YOU' ? 'bad' : 'ghost' };
        if (mode === 'lure' && X.lure.may.has(d.uid)) { const on = X.lure.sel.has(d.uid), crowdL = X.lure.may.size >= 4; t = { text: 'LURE', kind: on ? '' : 'ghost', dot: crowdL && !on, label: on ? `Luring the ${denSide(fm, data, d).name}: tap to leave it` : `Lure the ${denSide(fm, data, d).name}`, onclick: () => { LU.toggleLure(fm, p, ui, d.uid); render(); } }; }
        else if (mode === 'lure' && X.lure.mine.has(d.uid)) t = { text: 'SET ON YOU', short: 'ON YOU', kind: 'ghost' };
        else if (targetable.has(d.uid) && M.peacefulFoe(d)) { const sel = m.target === d.uid; t = { text: sel ? 'PROVOKE' : 'AT PEACE', kind: sel ? 'bad' : 'ghost', dot: crowd && !sel, label: sel ? 'Tap to strike no one' : 'Not fighting you. Tap to strike them anyway: the whole group will fight you', onclick: () => { m.target = sel ? null : d.uid; m.sure = null; render(); } }; }
        else if (targetable.has(d.uid) && tapNames) { t = m.target === d.uid ? { text: 'TARGET', kind: '', label: 'Target: tap to strike no one', onclick: () => { m.target = null; m.sure = null; render(); } } : null; }          // (Mike 2026-11-03: in a crowd a tap on the counter names it, no dot above it)
        else if (targetable.has(d.uid)) { const sel = m.target === d.uid; t = { text: 'TARGET', kind: sel ? '' : 'ghost', dot: crowd && !sel, label: sel ? 'Target: tap to strike no one' : 'Target this creature', onclick: () => { m.target = sel ? null : d.uid; m.sure = null; render(); } }; }
        else if (mode === 'melee' && step !== 'strike' && step !== 'foes' && m.target === d.uid && !o.attackSpell) t = { text: 'TARGET', kind: '' };          // (a chosen foe keeps its word through every later step; only the strike step lets him change it)
        else if (mode === 'melee' && step === 'foes' && o.boxable.some(x => x.uid === d.uid)) { const i = o.boxable.findIndex(x => x.uid === d.uid), b = m.boxes[d.uid] ?? (i % 3); t = { text: M.MNV[b].toUpperCase(), short: M.MNV[b].slice(0, 2).toUpperCase(), kind: '', label: `In the ${M.BOX[b]} box: tap to move`, onclick: () => { m.boxes[d.uid] = (b + 1) % 3; render(); } }; }
        if (t && short && !t.dot && t.short) t = { ...t, text: t.short };
        if (t) anyTag = true;
        const justFlipped = cb.flipNow === d.uid;
        return foeEl({ st: fm, data, d, flipped: !!cb.flipped[d.uid], tag: t, dead: !!dead, size, justFlipped, turnedOver: !!sideChanged, onHold: peek?.piece && (d.kind === 'mon' || d.kind === 'nat') ? den => peek.piece(den) : null, onPick: tapNames && targetable.has(d.uid) && !M.peacefulFoe(d) ? () => { m.target = d.uid; m.sure = null; render(); } : null, selected: mode === 'melee' && !o.attackSpell && m.target === d.uid, seton: !dead && ['encounter', 'melee', 'lure', 'shift', 'deploy', 'meet'].includes(mode) ? M.setOn(fm, d) : null,
            onFlip: (den, has) => { if (!has) { X.say('This counter has no other side.'); return; } cb.flipped[den.uid] = !cb.flipped[den.uid]; cb.flipNow = den.uid; render(); } });
    });
    cb.flipNow = null;
    // the ones who are not fighting him stand apart under their own word (note 70: "they will not fight you" and then all of them on the stage like targets)
    const firstPeace = foes.findIndex(f => !f.dead && M.peacefulFoe(f.d));
    if (firstPeace >= 0 && (mode === 'encounter' || mode === 'melee')) foeEls.splice(firstPeace, 0, h('p', { class: 'cb-peace-lbl', 'data-peace': '' }, 'Not fighting you'));
    // lanes: the plays he has chosen (this round's plan while he plans it, last round's after it), and where the creatures stand
    const chitHere = id => chitOf(id, o);
    let attack = null, guard = null, boxes = {};
    const planOf = mode === 'melee' ? m : ui.lastPlan?.fight === key ? ui.lastPlan.plan : null;
    if (planOf && mode !== 'meet' && mode !== 'over') {
        if (mode === 'melee' ? (planOf.target || o?.attackSpell) : planOf.target) attack = { dir: planOf.attackDir ?? 0, text: o?.attackSpell && mode === 'melee' ? 'Spell' : planOf.fightChit ? M.chitText(chitHere(planOf.fightChit) ?? { type: 'fight', strength: '', time: '' }) : null, glove: !!planOf.fightChit?.startsWith?.('card:') };
        guard = { dir: planOf.moveDir ?? 0, text: planOf.moveChit ? M.chitText(chitHere(planOf.moveChit) ?? { type: 'move', strength: '', time: '' }) : null };
    }
    if (mode === 'shift') { const so = optionsOf(fm, data); cb.shift ??= {}; cb.shift.attackDir ??= so.attackDir; cb.shift.moveDir ??= so.moveDir; attack = so.hasAttack ? { dir: cb.shift.attackDir, text: planOf?.fightChit ? M.chitText(chitHere(planOf.fightChit) ?? { type: 'fight', strength: '', time: '' }) : null } : null; guard = so.hasMove ? { dir: cb.shift.moveDir, text: planOf?.moveChit ? M.chitText(chitHere(planOf.moveChit) ?? { type: 'move', strength: '', time: '' }) : null } : null; }
    if (mode === 'melee' && (step === 'foes' || step === 'roll') && M.placementMatters(fm, o, m)) o.boxable.forEach((d, i) => { const b = m.boxes[d.uid] ?? (i % 3); (boxes[b] ??= []).push(M.picOf(fm, data, d)); });
    if (mode === 'shift') M.foesOf(fm).forEach(d => { if (d.box != null) (boxes[d.box] ??= []).push(M.picOf(fm, data, d)); });
    // notes 102 and 103: the lanes say what was played (the chit, the weapon, the attack time), and the armor stands beneath the defence row under the lanes each piece covers
    const says = mode === 'melee' ? saysOf(m, !!o.attackSpell, o) : ui.lastPlan?.fight === key ? ui.lastPlan.says : null;
    if (attack) attack.says = says?.atk ?? null;
    if (guard) guard.says = says?.grd ?? null;
    const heroMorphed = !!own(fm, data).morph;
    const armor = heroMorphed ? null : armorPieces(fm, data, planOf?.shieldDir ?? null);
    // 8.4.5m lets him place the creatures on his Melee Section and 8.4.6a then shuffles them with one die: with three or fewer the placing changes nothing (docs/design/combat-metaphor/06-PLACEMENT-PROOF.md), so the Foes step is
    // not asked, and the armor row says why a lone creature is not his to place (note 103: "that might be needed if I have smaller armor pieces": no, a piece is struck as often in any lane)
    const why = armor && mode === 'melee' && M.placementCounters(fm, o, m) >= 1 && !M.placementMatters(fm, o, m)
        ? { story: 'A die shuffles the creatures after your plays: no lane is safe.', detail: 'One die shuffles the creatures among the three boxes after your plays (8.4.6a), so placing three or fewer changes nothing; four or more, you place them.' } : null;
    const lanes = mode === 'meet' || mode === 'deploy' || mode === 'lure' || mode === 'unknown' ? null : lanesEl({ attack, guard, boxes, sec: mode === 'shift' ? 'shift-board' : null, armor, why });
    const allies = M.alliesOf(fm, data);
    const allyEl = allies.length && mode !== 'deploy' ? alliesEl({ st: fm, data, allies, flipped: cb.flipped, size: typeof matchMedia === 'function' && matchMedia('(max-height: 700px)').matches ? 48 : 56, onFlip: (a, has) => { if (!has) { X.say('This counter has no other side.'); return; } cb.flipped[a.uid] = !cb.flipped[a.uid]; render(); } }) : null;
    const prevChits = cb.pipState; cb.pipState = Object.fromEntries(own(fm, data).chits.map(x => [x.id, x.state]));
    const slim = !!party && party.members.length <= 2;          // (two on one phone: the Belongings and the map stand at the ends of their row)
    const hero = heroEl({ st: fm, data, bare: !!party, slim, prevChits, onPeekGear: () => peek?.gear(), onPeekMap: () => peek?.map(), onCurse: () => { cb.curseCard = !cb.curseCard; render(); }, ribbon: own(fm, data).morph ? `You are ${article(own(fm, data).morph.creature.name)} ${own(fm, data).morph.creature.name}` : own(fm, data).berserk ? 'Berserk until midnight' : null, onGear: () => { cb.gearCard = !cb.gearCard; render(); } });
    // (DR-20: the Meeting's steps have no lanes, so the stage had a void between the foes and you: the narrator stands in it, between the two, and not under you)
    const othersNode = (party ? others.filter(o => o.hires.length) : others).length ? othersEl({ others: party ? others.filter(o => o.hires.length) : others, hiresOnly: !!party, targetable, target: mode === 'melee' ? m.target : null, size: typeof matchMedia === 'function' && matchMedia('(max-height: 700px)').matches ? 44 : 52, onPick: uid => { m.target = uid; m.sure = null; render(); } }) : null;
    const partySize = typeof matchMedia === 'function' && matchMedia('(max-height: 700px)').matches ? 52 : 56;
    const makeStage = narrIn => h('div', { class: 'cb-stage' }, h('div', { class: 'cb-stagein' }, h('div', { class: `cb-foes${mode === 'melee' || mode === 'result' || mode === 'grid' || anyTag ? '' : ' noslot'}` }, ...foeEls), othersNode, lanes, allyEl, narrIn ? h('div', { class: 'cb-void' }, narrIn) : null, party ? PT.partyRowEl(party, { size: partySize, lead: slim ? peekBtn('peek-gear', 'Belongings', 'bag', () => peek?.gear()) : null, tail: slim ? peekBtn('peek-map', 'Map', 'pin', () => peek?.map()) : null }) : null, hero));

    // ---- the narrator ----
    const [story, detail, tone] = narration(X, { mode, o, step, foes, facts, recap, events });
    const narrKey = `${mode}|${resultKey}`;
    const stamped = cb.stamped === narrKey;
    if ((tone === 'verdict') && !stamped) cb.stamped = narrKey;
    const narr = h('p', { class: `cb-narr${tone === 'verdict' ? ` verdict${stamped ? '' : ' land'}` : ''}${tone === 'bad' ? ' bad' : ''}`, role: 'status', 'aria-live': 'polite' },
        ...(detail && detail !== story ? [h('span', { 'data-v': 'story' }, M.nbTag(fixNames(story))), h('span', { 'data-v': 'detail' }, M.nbTag(fixNames(detail)))] : [h('span', {}, M.nbTag(fixNames(story)))]));          // (one line for both voices when Detail has nothing more to say)

    // ---- the sheet ----
    let sheet;
    if (mode === 'over' && shared) sheet = sheetEl(X, 'recap', h('div', { class: 'ds-actions' }, primary('On through the night', { 'data-act': 'fight-over', onclick: () => X.send(P.over()) })));
    else if (mode === 'over') sheet = recapSheet(X, recap);
    else if (mode === 'result') sheet = resultSheet(X, facts);
    else if (mode === 'grid') sheet = gridSheet(X);
    else if (mode === 'meet') sheet = meetingSheet(X);
    else if (mode === 'melee') sheet = meleeSheet(X);
    else if (mode === 'deploy') sheet = deploySheet(X);
    else if (mode === 'shift') sheet = shiftSheet(X);
    else if (mode === 'lure') sheet = LU.lureSheet({ st: fm, data, p, ui, render, act: a => X.send(a), f: X.fight, party: !!party }).sheet;
    else if (mode === 'encounter') sheet = encounterSheet(X);
    else sheet = unknownSheet(X);

    if (party && sheet?.classList?.contains('cb-sheet') && mode !== 'over') sheet.prepend(mode === 'result' ? PT.actorBanner(party, { step: 'Result' }) : PT.actorBanner(party, { round: p.round ?? c.round, step: PT.STEP_NAME[p.type] ?? null }));          // (whose question this is, on top of every decision of a party)

    // The tap guard (QA-4): a result that follows a Roll, a wound that follows a result, the next Go on: each stands where the last primary stood, so for a moment after the question changes the primary ignores
    // a tap (the second half of a double tap must not skip what you should read). Not on "Next" (a step of the stepper), and a redraw of the same question does not start the window again.
    guardIfChanged(ui, 'cbGuard', `${key}|${mode}|${p.type}|${p.group ?? p.groups ?? ''}|${c.round}|${resultKey}|${step}|${cb.pick?.kind ?? ''}`, sheet, 350, '.ds-btn.primary:not([data-act=step-next])');

    // ---- the frame ----
    const place = nameOfClearing(c.at).replace(/ (\d+)$/, '\u00A0$1');
    const ern = viewOf(fm, data).me?.earned ?? null;
    const sight = M.sightOf(fm);
    const stat = (cls, ic, n, word) => h('span', { class: `ds-stat ${cls}` }, h('span', { class: 'v' }, icon(ic), String(n)), h('span', { class: 'w' }, word));          // (a word under each, as the strip has: note 102)
    const root = h('section', { class: `cb ds-screen${shared ? ' sf' : ''}`, 'data-mode': mode, 'data-ask-type': p.type, 'data-step': mode === 'melee' ? step : null, 'data-sf': shared ? 'step' : null, 'data-party': party ? '1' : null },
        h('div', { class: 'cb-top' }, shared ? null : menuBtn(ui, render),
            h('div', { class: 'where' }, h('b', { class: 'ds-nb' }, place), h('span', {}, p.spellOnly ? 'Evening · quiet' : `Evening · round ${c.round}`)),
            party ? null : h('span', { class: `cb-sight${sight.hidden ? ' hid' : ''}`, 'data-sight': sight.hidden ? 'hidden' : 'seen' }, sight.text)),          // (a party: the banner says it, with the name)
        shared ? shared.strip : null,
        shared ? null : h('div', { class: 'cb-bar' }, h('button', { type: 'button', class: 'ds-stats', 'aria-label': 'Fame, Notoriety, Gold: open your Belongings', onclick: () => peek?.gear() },
            stat('fame', 'star', ern?.fame ?? own(fm, data).fame, 'Fame'), stat('notor', 'flame', ern?.notoriety ?? own(fm, data).notoriety, 'Notoriety'), stat('gold', 'coin', own(fm, data).gold, 'Gold')), voiceSwitch()),
        makeStage(mode === 'meet' || mode === 'lure' || mode === 'unknown' ? narr : null), mode === 'meet' || mode === 'lure' || mode === 'unknown' ? null : narr, sheet);
    X.root = root;
    fitStage(root);
    if (cb.curseCard && (own(fm, data).curses ?? []).length) root.append(h('div', { class: 'cb-popbk', 'data-act': 'close-curse', 'aria-hidden': 'true', onclick: () => { cb.curseCard = false; render(); } }), cursePopover({ st: fm, data, onClose: () => { cb.curseCard = false; render(); } }));
    if (cb.gearCard) root.append(h('div', { class: 'cb-popbk', 'data-act': 'close-gear', 'aria-hidden': 'true', onclick: () => { cb.gearCard = false; render(); } }), gearPopover({ st: fm, data, flippedGear: cb.flippedGear, onFlip: uid => { cb.flippedGear[uid] = !cb.flippedGear[uid]; render(); }, onClose: () => { cb.gearCard = false; render(); } }));
    if (cb.record) root.append(recordSheet(X, M.recordRounds(fm)));
    if (cb.pit) root.append(pitSheet(X));
    if (cb.review) { const rs = reviewSheet(X); if (rs) root.append(rs); }
    return root;
}

// The safety net: a question the scene has no page for. It says so plainly and offers the one thing that always works, the map (and the Belongings in the top bar), never tiles the engine would refuse.
function unknownSheet(X) {
    const { p, peek, render } = X;
    return sheetEl(X, 'unknown', h('div', { class: 'ds-ask', 'data-ask': '' }, h('b', {}, 'The fight is waiting, and this screen does not know for what.'),
        h('span', {}, p.type === 'combat-charge' ? 'This is a table question (a character against a character) and there is no table here.' : `The game asked "${p.type}". Send a voice note from the menu and say what you were doing.`)),
        h('div', { class: 'ds-actions' }, primary('Look at the map', { 'data-act': 'unknown-map', onclick: () => (peek?.map ? peek.map() : render()) })));
}

// what the narrator says: [story, detail, tone]. Story is one short sentence in the world's voice; Detail adds the rule behind it. tone: 'verdict' (gold, big) or 'bad'.
function narration(X, { mode, o, step, foes, facts, recap, events }) {
    const { st: fm, data, c, p } = X;
    const place = nameOfClearing(c.at).replace(/ (\d+)$/, '\u00A0$1');
    const live = M.clearingBodies(fm).filter(d => !d.pacified), allMine = live.every(d => M.onMine(fm, d));          // (everything that is here, whoever it is set on)
    // creatures by their names, natives by their people ("two Wolves and the Bashkars")
    const monNames = live.filter(d => d.kind !== 'nat').map(d => denSide(fm, data, d).name), groups = [...new Set(live.filter(d => d.kind === 'nat').map(d => data.natives[d.id].group))];
    const names = [...monNames, ...groups];
    const nWord = monNames.length + groups.length > 1 || monNames.length > 1;
    const phraseOf = () => M.listOf([monNames.length ? M.foesPhrase(monNames) : null, groups.length ? `the ${M.listOf(groups)}` : null].filter(Boolean));
    if (mode === 'meet') {
        if (p.type === 'combat-drinks') { const [s, d] = meetNarr(fm, data, c, p.group); return [`The ${p.group} are in your clearing, and they are not friendly.`, null]; }
        if (p.type === 'combat-pay') { const [s, d] = meetNarr(fm, data, c, p.group); return [s, d]; }
        return [`${M.cap(`the ${M.listOf(p.groups)}`)} are here, not looking for a fight.`, null];
    }
    if (mode === 'result') {
        // two things the plain synopsis does not say (QA-13/14): which foes turned over to their other side before the blows, and which number beat a miss
        const turnedNames = [...M.turnedOver(events, fm)], miss = M.missNote(events, fm);
        const turnedLine = turnedNames.length ? `${M.cap(turnedNames.length === 1 ? turnedNames[0] : M.foesPhrase(turnedNames))} turned to ${turnedNames.length === 1 ? 'its' : 'their'} other side before the blows.` : '';
        const hr = hireRound(events);          // (a round on Melee Sections: what the hirelings did, in a breath)
        let said = roundSynopsis(events) || (hr ? '' : 'The round passed.');
        if (miss) said = said.replace(/You struck at empty air: the .+? was too quick to catch\.\s*/, '');          // (the miss note below says the same, with the numbers)
        // Story voice carries no numbers (tools/ui_round.py): the miss, with the number that beat it, is for the Detail voice only
        const story = [turnedLine, said, hr?.story].filter(Boolean).join(' '), detail = [turnedLine, miss ? `${miss} ${said}`.trim() : said, hr?.detail].filter(Boolean).join(' ');
        return [story, detail, 'verdict'];
    }
    if (mode === 'over' && X.shared) return ['The fighting is over.', 'Combat is over: nothing hostile is left.', 'verdict'];
    if (mode === 'over') {
        const k = recap.kills, first = (roundSynopsis(events).match(/^[^.]*\./) ?? [''])[0];
        const lie = cb_unseen(X) && /^You cut down|brought down/.test(first) ? first : k.length === 1 ? `The ${k[0]} lies still.` : k.length > 1 ? `${M.cap(M.foesPhrase(k))} lie still.` : 'The fighting is over.';
        return [`${lie} The clearing is yours.`, 'Combat is over: nothing hostile is left.', 'verdict'];
    }
    if (mode === 'grid') {
        if (p.type === 'combat-wounds') {
            const by = M.hitters(events, fm)[0];
            return [`${by ? `The ${by}'s blow got through. ` : ''}Which chit gives way? It stays out of play until you rest.`, `${plural(p.count, 'wound')}: each puts one of your action chits out of play until you rest it back.`];
        }
        return [`You spent ${p.need + 1} asterisks: the first is free. Which chit do you tire?`, p.why ?? null];
    }
    if (mode === 'shift') return ['The plays are shown, and the dice have moved the creatures. Your cards allow a change.', `Round ${c.round}: before the blows land.`];
    if (mode === 'deploy') return deployNarration(X);
    if (mode === 'lure') return LU.lureTexts(fm, data, p, X.fight);
    if (mode === 'unknown') return [`The fight is waiting for something this screen cannot show yet. Nothing is lost: your game is safe.`, `The engine is waiting for a "${p.type}" answer and the combat screen has no page for it.`];
    if (mode === 'melee') {
        const one = o.boxable.filter(d => d.kind !== 'part').length < 2;
        const lim = o.effortLimit ?? 2, limText = `You may play at most ${M.limitWord(lim)} asterisks of effort.`;
        const tgt = step === 'strike' && X.cb.plan?.target ? c.dens.find(d => d.uid === X.cb.plan.target) : null;
        if (tgt && M.peacefulFoe(tgt)) {
            const nm = tgt.kind === 'nat' ? `the ${data.natives[tgt.id].group}` : `the ${denSide(fm, data, tgt).name}`;
            return [`${M.cap(nm)} ${tgt.kind === 'nat' ? 'are' : 'is'} not fighting you. Strike ${tgt.kind === 'nat' ? 'one and the whole group will' : 'it and it will fight you'}.`,
                `Round ${c.round}, Melee: ${M.cap(nm)} ${tgt.kind === 'nat' ? 'are' : 'is'} at peace with you. Naming ${tgt.kind === 'nat' ? 'a native' : 'it'} as your target starts the fight: ${tgt.kind === 'nat' ? 'its whole group battles you from the next round' : 'it fights you from the next round'} (8.2.1a, 8.2.3a). ${limText}`];
        }
        const line = {
            whom: ['Whom do you strike?', 'Your play is sealed until everyone has chosen. Name any creature in the clearing, another character, or a hireling: or no one (8.4.2c).'],
            strike: [one ? 'How do you strike?' : 'Whom do you strike, and how?', 'Pick whom you strike, in which direction and with which Fight chit.'],
            aim: [`Whom does ${o.aims?.[0]?.name ?? 'the spell'} take?`, null],
            guard: ['How do you guard yourself?', 'The maneuver defends you; a blow aimed at your direction connects, one that comes sooner than your chit gets under it.'],
            shield: ['Which way does your shield guard?', null],
            parts: ['What do its other attacks do?', null],
            sections: ['Tap a counter to move it to the next lane.', 'Melee Sections: box, circle and square of one direction are one line (8.4.8b). You choose whom an attacked hireling strikes, where each counter stands and the side a defender shows (8.4.2e, 8.4.2f, 8.4.5n); then the dice move the attackers (8.4.6d).'],
            foes: [`Where will ${one ? 'it' : 'they'} come at you?`, 'Place the creatures in the three red boxes; the dice shuffle them afterwards.'],
            roll: X.shared ? ['Your play is set. Nobody sees it until everyone has played.', 'Plays are sealed; once everyone has chosen, every play is shown at once and the dice decide the rest.'] : ['Your plays are set. The dice decide the rest.', 'Plays are chosen together; then the dice shuffle the creatures and the blows land.'],
        }[step];
        return [line[0], `Round ${c.round}, Melee: ${line[1] ?? line[0]} ${limText}`];
    }
    // the Encounter
    if (own(fm, data).mist && !p.spellOnly) return [`You hang as mist over ${place} and take no part in the fight. You may slip away, or let the round pass.`, `Round ${c.round}, Encounter: as mist you take no part; you may only run away with a Move chit, or pass (8.4.5p.1).`];
    if (p.spellOnly) return ['A quiet evening. Nothing here is looking for a fight, but you have a spell you could cast tonight, so the game stops here to ask.', 'Spells are cast in the evening (rule 8.1.3a): a quiet clearing still gets its rounds, so the game stops here to let you cast one.'];
    const o2 = optionsOf(fm, data);
    const phrase = names.length ? phraseOf() : '';
    const gate = o2.why?.gate ? `A chit played here has to be faster than ${M.gateWords(fm, o2.why.gate)}.` : 'Nothing is set on you, so no creature holds your chits back.';
    if (o2.canStay) return [`You are hidden. ${phrase ? `${M.cap(phrase)} ${nWord ? 'are' : 'is'} here, and cannot touch you.` : 'Nothing can touch you.'}`, `Creatures cannot be set on a hidden character. You may stay hidden and let the evening pass, or strike from hiding: you strike first, but you are revealed.`];
    if (X.shared && o2.why?.gate && M.chargerOf(fm, o2.why.gate)) return [`${M.chargerOf(fm, o2.why.gate)} has charged you. Only a chit faster than ${o2.why.gate.speed} can answer.`, `Round ${c.round}, Encounter: ${gate}`];
    const meets = meetLines(fm, data, c);
    if (c.round === 1 && meets.story.length) return [meets.story.join(' '), `${meets.detail.join(' ')} Round 1, Encounter: ${gate}`];
    if (c.round === 1) return [`Dusk gathers over ${place}. ${phrase ? (allMine ? `${M.cap(phrase)} ${nWord ? 'have' : 'has'} found you.` : `${M.cap(phrase)} ${nWord ? 'are' : 'is'} here.`) : ''}`.trim(), `Round 1, Encounter: before the melee you may ready your weapon, run, cast a spell, switch a belonging, or go on. ${gate}`];
    return [`Round ${c.round}. ${phrase ? `${M.cap(phrase)} still ${nWord ? 'stand' : 'stands'}.` : ''}`.trim(), `Round ${c.round}, Encounter: ${gate}`];
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cb_unseen = X => X.cb.seen !== X.resultKey;

// ---- the beat after the last blow: the scene stays up one moment for a death (or a win the engine does not stop on), then the P4 results take over ----
export function combatBeat({ st: engineState, data, ui, render }) {
    const fm = fightModel(engineState, data), beat = ui.cbBeat, snap = beat.snap;
    const how = beat.how;
    const c = snap.combat;
    const X = { st: snap, data, ui, cb: { fightKey: 'beat', flipped: {}, pipState: null }, render, p: { type: 'beat' }, c, root: null };
    X.say = () => {};
    X.beatOk = () => { ui.cbBeat = null; render(); };
    X.slain = fm.over?.by ? String(fm.over.by).replace(/ #\d+$/, '') : null;
    const recap = M.recapOf(fm, data);
    const dead = c.dens.filter(d => d.kind !== 'horse' && d.kind !== 'part');
    const size = foeSize(dead.length);
    const foeEls = dead.map(d => foeEl({ st: snap, data, d, size, dead: !!fm.combat === false && how === 'won' }));
    const hero = heroEl({ st: snap, data, ribbon: null });
    if (how === 'died') hero.querySelector('.face')?.setAttribute('style', 'filter:grayscale(1) brightness(.6)');
    const stage = h('div', { class: 'cb-stage' }, h('div', { class: 'cb-foes noslot' }, ...foeEls), lanesEl({}), hero);
    const deathLine = deathLineOf(fm.log);          // (the voice layer: the engine marks the line that tells the fall)
    const story = how === 'quiet' ? 'The blows stop. Neither side presses on.' : how === 'died' ? M.nbTag(deathLine ? logText({ ...deathLine, s: deathLine.s ?? null }) : 'You have fallen.') : `${recap.kills.length ? `${M.cap(M.foesPhrase(recap.kills))} fell.` : ''} The clearing is yours.`;
    const detail = how === 'died' ? (deathLine?.t ?? 'You have died.') : how === 'quiet' ? 'The fighting dies down.' : 'Combat is over: nothing hostile is left.';
    const place = nameOfClearing(c.at).replace(/ (\d+)$/, '\u00A0$1');
    const root = h('section', { class: 'cb ds-screen', 'data-mode': 'beat', 'data-beat': how },
        h('div', { class: 'cb-top' }, menuBtn(ui, render), h('div', { class: 'where' }, h('b', { class: 'ds-nb' }, place), h('span', {}, `Evening · round ${recap.rounds}`))),
        h('div', { class: 'cb-bar' }, h('span'), voiceSwitch()), stage,
        h('p', { class: `cb-narr verdict${how === 'died' ? ' bad' : ''}`, role: 'status', 'aria-live': 'polite' }, h('span', { 'data-v': 'story' }, story), h('span', { 'data-v': 'detail' }, detail)),
        beatSheet(X, recap, how));
    // the beat is where a death is read: its "Go on" waits twice as long as an ordinary result, and whatever follows the beat starts its own window (the shell guards its primaries); QA-4
    guardIfChanged(ui, 'cbGuard', `beat|${how}`, root.querySelector('.cb-sheet'), how === 'died' ? 700 : 350);
    requestAnimationFrame(() => fitNames(root));
    return root;
}
