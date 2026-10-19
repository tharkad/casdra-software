// screens/combat_scene.js: the evening fight as one continuous scene, treatment A "The Clearing" with the result first (docs/design/redesign/mockups/03-combat.html, BUILD-SPEC section 5).
// The foes stand across the top as the real counters, you at the bottom with your weapon, armor and one pip per chit, a narrator line between, and one sheet that asks one question with one
// primary button. After a round the verdict comes first (what fell, what it cost); the blow by blow is the Record, one tap away. The engine decides everything and is asked exactly what the old
// fight sheet (screens/combatui.js) asked it: every answer is built by combat/payload.js. This screen is for the one-character fight (solo and race); the SHARED fight keeps the old screens until P6.
// combatScene({ st, data, act, ui, render, peek }) returns the scene element; `peek` = { gear, map } open the Belongings and the map and bring the fight back.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { voiceSwitch, toast, primary } from '../ds.js';
import { logText } from '../voice.js';
import { roundSynopsis, narrateRoll } from '../../engine/story.js';
import { earned } from '../../engine/score.js';
import { clone } from '../../engine/core.js';
import { denSide, meleeOptions, shiftOptions, encounterOptions } from '../../engine/combat.js';
import { nameOfClearing } from '../../engine/world.js';
import * as M from '../combat/model.js';
import { foeEl, foeSize, lanesEl, heroEl, alliesEl, gearPopover, fitNames } from '../combat/stage.js';
import { sheetEl, meetingSheet, encounterSheet, meleeSheet, shiftSheet, resultSheet, gridSheet, recapSheet, beatSheet, recordSheet, pitSheet, stepsFor } from '../combat/sheets.js';
import * as P from '../combat/payload.js';
import * as SH from '../combat/shared.js';
import { guardIfChanged } from '../tapguard.js';
import { article, fixNames } from '../names.js';

const RESULT_TYPES = ['combat-fatigue', 'combat-wounds', 'combat-encounter'];
const hashOf = s => { let x = 0; for (let i = 0; i < s.length; i++) x = (Math.imul(31, x) + s.charCodeAt(i)) | 0; return x; };
const MEET = /^Evening meeting with the /;

// the fight this scene belongs to: a fresh fight starts a fresh scene state
const fightKey = (st, c) => `${st.day}:${c.at}:${c.rollFrom ?? 0}${st.battle ? ':shared' : ''}`;

// What the evening's Meeting said, group by group, once the questions are answered: [story lines], [exact lines]
function meetLines(st, data, c) {
    const by = new Map();
    for (const r of (st.rolls ?? []).filter(x => x.n > (c.rollFrom ?? 0) && MEET.test(x.what))) by.set(r.what.replace(/^Evening meeting with the ([^:]+).*$/, '$1'), r);
    const lines = M.fightLines(st).map(l => l.t);
    const story = [], detail = [];
    for (const [g, r] of by) {
        const t = narrateRoll(r)?.line ?? M.cap(r.result ?? '');
        const asked = /^They (?:insult|challenge) you/.test(r.result ?? '');
        const paid = lines.map(x => new RegExp(`^You pay (\\d+) (\\w+) to avoid the (?:insult|challenge) from the ${g}\\.$`, 'i').exec(x)).find(Boolean);
        const out = asked ? (c.battling?.[g] ? 'You stood your ground. Steel is drawn.' : paid ? `You paid ${paid[1]} ${M.cap(paid[2])}. The ${g} let it lie.` : t) : t;
        story.push(by.size > 1 ? `The ${g}: ${out}` : out);
        detail.push(`${g}: ${r.result ?? ''}${/[.!?]$/.test(r.result ?? '') ? '' : '.'}${asked && paid ? ` You paid ${paid[1]} ${paid[2]}.` : asked && c.battling?.[g] ? ' You chose to fight.' : ''}`);
    }
    return { story, detail };
}

// the question of the evening's Meeting, said as a story: the verdict of the group's roll
function meetNarr(st, data, c, group) {
    const rolls = (st.rolls ?? []).filter(r => r.n > (c.rollFrom ?? 0) && MEET.test(r.what) && r.what.replace(/^Evening meeting with the ([^:]+).*$/, '$1') === group);
    const last = rolls.at(-1);
    if (!last) return [`The ${group} are here.`, null];
    const tale = narrateRoll(last)?.line;
    return [tale ?? `${M.cap(last.result ?? '')}.`, last.result ? `${M.cap(last.result)}${/[.!?]$/.test(last.result) ? '' : '.'}` : null];
}

export function combatScene({ st, data, act, ui, render, peek, shared = null }) {
    const p = st.pending, c = st.combat;
    const key = fightKey(st, c);
    if (ui.cb?.fightKey !== key) ui.cb = { fightKey: key, seen: null, step: 'strike', plan: null, flipped: {}, pick: null, pipState: null, gearCard: false, flippedGear: {} };
    const cb = ui.cb;
    const X = { st, data, ui, cb, render, p, c, root: null, shared, peek };          // (`shared`: a fight of several characters, screens/sharedfight.js: the strip, no result screen of its own, the Whom step)
    X.say = text => { if (!X.root) return; const t = toast(text, { host: X.root }); const sh = X.root.querySelector('.cb-sheet'); t.style.bottom = `${(sh ? sh.offsetHeight : 160) + 10}px`; };
    // every answer to the engine goes through here: the scene's own state of the question is dropped, the engine moves on
    // (ui.trace, when a script sets it to an array, collects every answer the scene sends: tools/ui_cb_fuzz.py replays them on the bare engine)
    const emit = a => { ui.trace?.push(JSON.parse(JSON.stringify(a))); act(a); };
    X.send = a => { cb.pick = null; cb.cast = null; cb.quiet = null; cb.leaveAsk = null; cb.shift = null; emit(a); };
    X.sendMelee = (o, m) => {
        ui.lastPlan = { round: c.round, fight: key, plan: JSON.parse(JSON.stringify(m)) };
        cb.plan = null; cb.step = 'strike'; cb.pick = null;
        if (!shared) ui.cbBeat = { snap: clone(st), day: st.day, logLen: st.log.length, round: c.round };
        emit(P.melee(o, m));
    };

    // ---- which screen this is ----
    const events = c.events ?? [];
    const resultKey = `${c.roundRollFrom ?? 0}|${hashOf(events.join('\n'))}`;
    X.resultKey = resultKey;
    const showResult = !shared && RESULT_TYPES.includes(p.type) && events.length > 0 && cb.seen !== resultKey && !(p.type === 'combat-encounter' && (c.round === 1 || p.spellOnly));
    const facts = M.roundFacts(events);
    if (p.type === 'combat-melee' && (!cb.plan || cb.planRound !== c.round)) {
        const o0 = meleeOptions(st, data);
        cb.plan = M.defaultPlan(st, data, o0); cb.planRound = c.round;
        if (shared) SH.sharedPlan(st, o0, cb.plan);
        cb.step = shared && SH.needsWhom(st, o0) ? 'whom' : 'strike';
    }
    if (p.type !== 'combat-melee') { cb.plan = null; }
    const mode = p.type === 'combat-over' ? 'over' : showResult ? 'result' : p.type === 'combat-wounds' || p.type === 'combat-fatigue' ? 'grid' : ['combat-pay', 'combat-drinks', 'combat-choice'].includes(p.type) ? 'meet' : p.type === 'combat-melee' ? 'melee' : p.type === 'combat-shift' ? 'shift' : 'encounter';
    const recap = mode === 'over' && !shared ? M.recapOf(st, data) : null;

    // ---- the stage ----
    const bodies = c.dens.filter(d => d.kind !== 'horse' && M.onMine(st, d));
    const killedNow = new Set(c.killed ?? []);
    let foes;                                       // [{ d, dead, tag, flipKey }]
    if (mode === 'meet') {
        const grp = p.type === 'combat-choice' ? p.groups : [p.group];
        const have = new Set(c.dens.filter(d => d.kind === 'nat').map(d => d.id));
        const nats = st.nats.filter(n => !n.dead && !n.hired && n.loc?.c === c.at && grp.includes(data.natives[n.id].group) && !have.has(n.id)).map(n => ({ uid: `nat:${n.id}`, kind: 'nat', id: n.id, side: 'light' }));
        foes = [...nats, ...M.foesOf(st)].map(d => ({ d }));
    } else if (mode === 'result' || mode === 'grid') {
        // who hit you is said once, in the verdict (QA-8): the wound or fatigue grid that follows is the next question, so the counters stand bare there and every round starts bare
        const hit = new Set(mode === 'result' ? M.hitters(events) : []);
        const wounded = facts.landed.length === 1 && facts.wounds > 0;
        foes = bodies.filter(d => (!d.dead || (d.kind !== 'part' && killedNow.has(denSide(st, data, d).name))) && d.kind !== 'part' || (!d.dead && d.kind === 'part'))
            .map(d => { const nm = denSide(st, data, d).name, dead = d.dead; return { d, dead, tag: !dead && hit.has(nm) ? { text: wounded ? 'WOUNDED YOU' : 'HIT YOU', short: wounded ? 'WOUNDED' : 'HIT', kind: 'bad' } : null }; });
    } else if (mode === 'over') {
        foes = bodies.filter(d => d.dead && d.kind !== 'part').map(d => ({ d, dead: true }));
    } else {
        foes = M.foesOf(st).map(d => ({ d }));
    }
    const o = mode === 'melee' ? meleeOptions(st, data) : null;
    const m = mode === 'melee' ? cb.plan : null, step = o && stepsFor(o, X).some(s => s.id === cb.step) ? cb.step : (o ? stepsFor(o, X)[0].id : 'strike');
    const size = foeSize(foes.length, mode === 'meet');
    const targetable = mode === 'melee' && step === 'strike' ? new Set(o.targets.filter(d => d.kind !== 'part').map(d => d.uid)) : new Set();
    // A crowded stage cannot hold a word on every counter (QA-6): from four targets on, only the chosen foe wears TARGET and the others a ghost dot (still a 44px tap); where the counters are small, the other
    // tags are said in a short word (WOUNDED, HIT, HELD) or two letters (the box). Where the counters are big there is room for the whole word.
    const short = size < 76, crowd = targetable.size >= 4;
    let anyTag = false;
    const foeEls = foes.map(({ d, dead, tag }) => {
        let t = tag ?? null;
        if (!t && !dead && d.pickedUp && (mode === 'encounter' || mode === 'melee')) t = { text: d.engagedBy ? 'ON YOUR MAN' : 'HOLDS YOU', short: 'HELD', kind: 'bad' };
        else if (!t && !dead && d.pacified && (mode === 'encounter' || mode === 'melee')) t = { text: 'AT PEACE', short: 'PEACE', kind: 'ghost' };
        if (targetable.has(d.uid)) { const sel = m.target === d.uid; t = { text: 'TARGET', kind: sel ? '' : 'ghost', dot: crowd && !sel, label: sel ? 'Target: tap to strike no one' : 'Target this creature', onclick: () => { m.target = sel ? null : d.uid; render(); } }; }
        else if (mode === 'melee' && step === 'foes' && o.boxable.some(x => x.uid === d.uid)) { const i = o.boxable.findIndex(x => x.uid === d.uid), b = m.boxes[d.uid] ?? (i % 3); t = { text: M.MNV[b].toUpperCase(), short: M.MNV[b].slice(0, 2).toUpperCase(), kind: '', label: `In the ${M.BOX[b]} box: tap to move`, onclick: () => { m.boxes[d.uid] = (b + 1) % 3; render(); } }; }
        if (t && short && !t.dot && t.short) t = { ...t, text: t.short };
        if (t) anyTag = true;
        const justFlipped = cb.flipNow === d.uid;
        return foeEl({ st, data, d, flipped: !!cb.flipped[d.uid], tag: t, dead: !!dead, size, justFlipped, selected: targetable.has(d.uid) && m.target === d.uid,
            onFlip: (den, has) => { if (!has) { X.say('This counter has no other side.'); return; } cb.flipped[den.uid] = !cb.flipped[den.uid]; cb.flipNow = den.uid; render(); } });
    });
    cb.flipNow = null;
    // lanes: the plays he has chosen (this round's plan while he plans it, last round's after it), and where the creatures stand
    const chitOf = id => st.ch.chits.find(x => x.id === id) ?? null;
    let attack = null, guard = null, boxes = {};
    const planOf = mode === 'melee' ? m : ui.lastPlan?.fight === key ? ui.lastPlan.plan : null;
    if (planOf && mode !== 'meet' && mode !== 'over') {
        if (mode === 'melee' ? (planOf.target || o?.attackSpell) : planOf.target) attack = { dir: planOf.attackDir ?? 0, text: o?.attackSpell && mode === 'melee' ? 'Spell' : planOf.fightChit ? M.chitText(chitOf(planOf.fightChit) ?? { type: 'fight', strength: '', time: '' }) : null };
        guard = { dir: planOf.moveDir ?? 0, text: planOf.moveChit ? M.chitText(chitOf(planOf.moveChit) ?? { type: 'move', strength: '', time: '' }) : null };
    }
    if (mode === 'shift') { const so = shiftOptions(st, data); cb.shift ??= {}; cb.shift.attackDir ??= so.attackDir; cb.shift.moveDir ??= so.moveDir; attack = so.hasAttack ? { dir: cb.shift.attackDir, text: planOf?.fightChit ? M.chitText(chitOf(planOf.fightChit) ?? { type: 'fight', strength: '', time: '' }) : null } : null; guard = so.hasMove ? { dir: cb.shift.moveDir, text: planOf?.moveChit ? M.chitText(chitOf(planOf.moveChit) ?? { type: 'move', strength: '', time: '' }) : null } : null; }
    if (mode === 'melee' && (step === 'foes' || step === 'roll')) o.boxable.forEach((d, i) => { const b = m.boxes[d.uid] ?? (i % 3); (boxes[b] ??= []).push(M.picOf(st, data, d)); });
    if (mode === 'shift') M.foesOf(st).forEach(d => { if (d.box != null) (boxes[d.box] ??= []).push(M.picOf(st, data, d)); });
    const lanes = mode === 'meet' ? null : lanesEl({ attack, guard, boxes, sec: mode === 'shift' ? 'shift-board' : null });
    const allies = M.alliesOf(st, data);
    const allyEl = allies.length ? alliesEl({ st, data, allies, flipped: cb.flipped, size: typeof matchMedia === 'function' && matchMedia('(max-height: 700px)').matches ? 48 : 56, onFlip: (a, has) => { if (!has) { X.say('This counter has no other side.'); return; } cb.flipped[a.uid] = !cb.flipped[a.uid]; render(); } }) : null;
    const prevChits = cb.pipState; cb.pipState = Object.fromEntries(st.ch.chits.map(x => [x.id, x.state]));
    const hero = heroEl({ st, data, prevChits, onPeekGear: () => peek?.gear(), onPeekMap: () => peek?.map(), ribbon: st.ch.morph ? `You are ${article(st.ch.morph.creature.name)} ${st.ch.morph.creature.name}` : null, onGear: () => { cb.gearCard = !cb.gearCard; render(); } });
    // (DR-20: the Meeting's steps have no lanes, so the stage had a void between the foes and you: the narrator stands in it, between the two, and not under you)
    const makeStage = narrIn => h('div', { class: 'cb-stage' }, h('div', { class: 'cb-stagein' }, h('div', { class: `cb-foes${mode === 'melee' || mode === 'result' || mode === 'grid' || anyTag ? '' : ' noslot'}` }, ...foeEls), lanes, allyEl, narrIn ? h('div', { class: 'cb-void' }, narrIn) : null, hero));

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
    else if (mode === 'shift') sheet = shiftSheet(X);
    else sheet = encounterSheet(X);

    // The tap guard (QA-4): a result that follows a Roll, a wound that follows a result, the next Go on: each stands where the last primary stood, so for a moment after the question changes the primary ignores
    // a tap (the second half of a double tap must not skip what you should read). Not on "Next" (a step of the stepper), and a redraw of the same question does not start the window again.
    guardIfChanged(ui, 'cbGuard', `${key}|${mode}|${p.type}|${p.group ?? p.groups ?? ''}|${c.round}|${resultKey}|${step}|${cb.pick?.kind ?? ''}`, sheet, 350, '.ds-btn.primary:not([data-act=step-next])');

    // ---- the frame ----
    const place = nameOfClearing(c.at).replace(/ (\d+)$/, '\u00A0$1');
    let ern = null; try { ern = earned(st, data); } catch { /* scoring not available */ }
    const stat = (cls, ic, n) => h('span', { class: `ds-stat ${cls}` }, icon(ic), String(n));
    const root = h('section', { class: `cb ds-screen${shared ? ' sf' : ''}`, 'data-mode': mode, 'data-ask-type': p.type, 'data-step': mode === 'melee' ? step : null, 'data-sf': shared ? 'step' : null },
        h('div', { class: 'cb-top' },
            h('div', { class: 'where' }, h('b', { class: 'ds-nb' }, place), h('span', {}, p.spellOnly ? 'Evening · quiet' : `Evening · round ${c.round}`))),
        shared ? shared.strip : null,
        shared ? null : h('div', { class: 'cb-bar' }, h('button', { type: 'button', class: 'ds-stats', 'aria-label': 'Fame, Notoriety, Gold: open your Belongings', onclick: () => peek?.gear() },
            stat('fame', 'star', ern?.fame ?? st.ch.fame), stat('notor', 'flame', ern?.notoriety ?? st.ch.notoriety), stat('gold', 'coin', st.ch.gold)), voiceSwitch()),
        makeStage(mode === 'meet' ? narr : null), mode === 'meet' ? null : narr, sheet);
    X.root = root;
    fitStage(root);
    if (cb.gearCard) root.append(gearPopover({ st, data, flippedGear: cb.flippedGear, onFlip: uid => { cb.flippedGear[uid] = !cb.flippedGear[uid]; render(); }, onClose: () => { cb.gearCard = false; render(); } }));
    if (cb.record) root.append(recordSheet(X, M.recordRounds(st)));
    if (cb.pit) root.append(pitSheet(X));
    return root;
}

// what the narrator says: [story, detail, tone]. Story is one short sentence in the world's voice; Detail adds the rule behind it. tone: 'verdict' (gold, big) or 'bad'.
function narration(X, { mode, o, step, foes, facts, recap, events }) {
    const { st, data, c, p } = X;
    const place = nameOfClearing(c.at).replace(/ (\d+)$/, '\u00A0$1');
    const live = M.bodiesOf(st).filter(d => !d.pacified);
    // creatures by their names, natives by their people ("two Wolves and the Bashkars")
    const monNames = live.filter(d => d.kind !== 'nat').map(d => denSide(st, data, d).name), groups = [...new Set(live.filter(d => d.kind === 'nat').map(d => data.natives[d.id].group))];
    const names = [...monNames, ...groups];
    const nWord = monNames.length + groups.length > 1 || monNames.length > 1;
    const phraseOf = () => M.listOf([monNames.length ? M.foesPhrase(monNames) : null, groups.length ? `the ${M.listOf(groups)}` : null].filter(Boolean));
    if (mode === 'meet') {
        if (p.type === 'combat-drinks') { const [s, d] = meetNarr(st, data, c, p.group); return [`The ${p.group} are in your clearing, and they are not friendly.`, null]; }
        if (p.type === 'combat-pay') { const [s, d] = meetNarr(st, data, c, p.group); return [s, d]; }
        return [`${M.cap(`the ${M.listOf(p.groups)}`)} are here, not looking for a fight.`, null];
    }
    if (mode === 'result') {
        const syn = roundSynopsis(events) || 'The round passed.';
        return [syn, syn, 'verdict'];
    }
    if (mode === 'over' && X.shared) return ['The fighting is over.', 'Combat is over: nothing hostile is left.', 'verdict'];
    if (mode === 'over') {
        const k = recap.kills, first = (roundSynopsis(events).match(/^[^.]*\./) ?? [''])[0];
        const lie = cb_unseen(X) && /^You cut down|brought down/.test(first) ? first : k.length === 1 ? `The ${k[0]} lies still.` : k.length > 1 ? `${M.cap(M.foesPhrase(k))} lie still.` : 'The fighting is over.';
        return [`${lie} The clearing is yours.`, 'Combat is over: nothing hostile is left.', 'verdict'];
    }
    if (mode === 'grid') {
        if (p.type === 'combat-wounds') {
            const by = M.hitters(events)[0];
            return [`${by ? `The ${by}'s blow got through. ` : ''}Which chit gives way? It stays out of play until you rest.`, `${plural(p.count, 'wound')}: each puts one of your action chits out of play until you rest it back.`];
        }
        return [`You spent ${p.need + 1} asterisks: the first is free. Which chit do you tire?`, p.why ?? null];
    }
    if (mode === 'shift') return ['The plays are shown, and the dice have moved the creatures. Your cards allow a change.', `Round ${c.round}: before the blows land.`];
    if (mode === 'melee') {
        const one = o.boxable.filter(d => d.kind !== 'part').length < 2;
        const lim = o.effortLimit ?? 2, limText = `You may play at most ${M.limitWord(lim)} asterisks of effort.`;
        const line = {
            whom: ['Whom do you strike?', 'Your play is sealed until everyone has chosen. Name a creature on your sheet or on another\u2019s, a character, or a hireling: or no one.'],
            strike: [one ? 'How do you strike?' : 'Whom do you strike, and how?', 'Pick whom you strike, in which direction and with which Fight chit.'],
            aim: [`Whom does ${o.aims?.[0]?.name ?? 'the spell'} take?`, null],
            guard: ['How do you guard yourself?', 'The maneuver defends you; a blow aimed at your direction connects, one that comes sooner than your chit gets under it.'],
            shield: ['Which way does your shield guard?', null],
            parts: ['What do its other attacks do?', null],
            foes: [`Where will ${one ? 'it' : 'they'} come at you?`, 'Place the creatures in the three red boxes; the dice shuffle them afterwards.'],
            roll: X.shared ? ['Your play is set. Nobody sees it until everyone has played.', 'Plays are sealed; once everyone has chosen, every play is shown at once and the dice decide the rest.'] : ['Your plays are set. The dice decide the rest.', 'Plays are chosen together; then the dice shuffle the creatures and the blows land.'],
        }[step];
        return [line[0], `Round ${c.round}, Melee: ${line[1] ?? line[0]} ${limText}`];
    }
    // the Encounter
    if (p.spellOnly) return ['A quiet evening. Nothing here is looking for a fight.', 'Spells are cast in the evening (rule 8.1.3a): a quiet clearing still gets its rounds, so the game stops here to let you cast one.'];
    const o2 = encounterOptions(st, data);
    const phrase = names.length ? phraseOf() : '';
    const gate = o2.why?.gate ? `A chit played here has to be faster than ${M.gateWords(st, o2.why.gate)}.` : 'Nothing is set on you, so no creature holds your chits back.';
    if (o2.canStay) return [`You are hidden. ${phrase ? `${M.cap(phrase)} ${nWord ? 'are' : 'is'} here, and cannot touch you.` : 'Nothing can touch you.'}`, `Creatures cannot be set on a hidden character. You may stay hidden and let the evening pass, or strike from hiding: you strike first, but you are revealed.`];
    if (X.shared && o2.why?.gate && M.chargerOf(st, o2.why.gate)) return [`${M.chargerOf(st, o2.why.gate)} has charged you. Only a chit faster than ${o2.why.gate.speed} can answer.`, `Round ${c.round}, Encounter: ${gate}`];
    const meets = meetLines(st, data, c);
    if (c.round === 1 && meets.story.length) return [meets.story.join(' '), `${meets.detail.join(' ')} Round 1, Encounter: ${gate}`];
    if (c.round === 1) return [`Dusk gathers over ${place}. ${phrase ? `${M.cap(phrase)} ${nWord ? 'have' : 'has'} found you.` : ''}`.trim(), `Round 1, Encounter: before the melee you may ready your weapon, run, cast a spell, switch a belonging, or go on. ${gate}`];
    return [`Round ${c.round}. ${phrase ? `${M.cap(phrase)} still ${nWord ? 'stand' : 'stands'}.` : ''}`.trim(), `Round ${c.round}, Encounter: ${gate}`];
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cb_unseen = X => X.cb.seen !== X.resultKey;

// ---- the beat after the last blow: the scene stays up one moment for a death (or a win the engine does not stop on), then the P4 results take over ----
export function combatBeat({ st, data, ui, render }) {
    const beat = ui.cbBeat, snap = beat.snap;
    const how = beat.how;
    const c = snap.combat;
    const X = { st: snap, data, ui, cb: { fightKey: 'beat', flipped: {}, pipState: null }, render, p: { type: 'beat' }, c, root: null };
    X.say = () => {};
    X.beatOk = () => { ui.cbBeat = null; render(); };
    X.slain = st.over?.by ? String(st.over.by).replace(/ #\d+$/, '') : null;
    const recap = M.recapOf(st, data);
    const dead = c.dens.filter(d => d.kind !== 'horse' && d.kind !== 'part');
    const size = foeSize(dead.length);
    const foeEls = dead.map(d => foeEl({ st: snap, data, d, size, dead: !!st.combat === false && how === 'won' }));
    const hero = heroEl({ st: snap, data, ribbon: null });
    if (how === 'died') hero.querySelector('.face')?.setAttribute('style', 'filter:grayscale(1) brightness(.6)');
    const stage = h('div', { class: 'cb-stage' }, h('div', { class: 'cb-foes noslot' }, ...foeEls), lanesEl({}), hero);
    const deathLine = [...st.log].reverse().find(l => l.k === 'combat' && /you are slain|vital spot|Every action chit is wounded/i.test(l.t)) ?? [...st.log].reverse().find(l => l.k === 'combat' && /You have died/i.test(l.t));
    const story = how === 'died' ? M.nbTag(deathLine ? logText({ ...deathLine, s: deathLine.s ?? null }) : 'You have fallen.') : `${recap.kills.length ? `${M.cap(M.foesPhrase(recap.kills))} fell.` : ''} The clearing is yours.`;
    const detail = how === 'died' ? (deathLine?.t ?? 'You have died.') : 'Combat is over: nothing hostile is left.';
    const place = nameOfClearing(c.at).replace(/ (\d+)$/, '\u00A0$1');
    const root = h('section', { class: 'cb ds-screen', 'data-mode': 'beat', 'data-beat': how },
        h('div', { class: 'cb-top' }, h('div', { class: 'where' }, h('b', { class: 'ds-nb' }, place), h('span', {}, `Evening · round ${recap.rounds}`))),
        h('div', { class: 'cb-bar' }, h('span'), voiceSwitch()), stage,
        h('p', { class: `cb-narr verdict${how === 'died' ? ' bad' : ''}`, role: 'status', 'aria-live': 'polite' }, h('span', { 'data-v': 'story' }, story), h('span', { 'data-v': 'detail' }, detail)),
        beatSheet(X, recap, how));
    // the beat is where a death is read: its "Go on" waits twice as long as an ordinary result, and whatever follows the beat starts its own window (the shell guards its primaries); QA-4
    guardIfChanged(ui, 'cbGuard', `beat|${how}`, root.querySelector('.cb-sheet'), how === 'died' ? 700 : 350);
    requestAnimationFrame(() => fitNames(root));
    return root;
}

// When the stage holds more than it has room for (six creatures, a tall sheet), the whole stage is scaled to fit rather than letting anything overlap. One look after the scene is in the page, and again
// when the phone turns or the keyboard comes and goes.
function fitStage(root) {
    const fit = () => {
        const stage = root.querySelector('.cb-stage'), inner = stage?.querySelector('.cb-stagein');
        if (!stage || !inner || !root.isConnected) return;
        fitNames(root);
        inner.style.zoom = ''; inner.style.removeProperty('--z');
        const cs = getComputedStyle(stage), room = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), need = inner.scrollHeight;
        if (need > room + 1 && room > 80) { const z = Math.max(0.55, room / need); inner.style.zoom = String(z); inner.style.setProperty('--z', String(z)); }
    };
    requestAnimationFrame(fit);
    if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => fit()); ro.observe(root); const gone = new MutationObserver(() => { if (!root.isConnected) { ro.disconnect(); gone.disconnect(); } }); gone.observe(document.body, { childList: true, subtree: true }); }
}
