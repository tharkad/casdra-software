// combat/sheets.js: the one-question sheets of the combat scene, one builder per thing the engine can be waiting for: the Meeting's questions, the Encounter's verbs and what each opens,
// the Melee stepper (Strike, Guard, Foes, Roll), the round's result, the wound and fatigue grids, the end of the fight and the Record. A sheet asks one question, has exactly one primary
// button (bottom right) and says why when something is dim. Nothing here decides a rule: legality comes from the engine's own options and reasons (model.js words them).
import { h } from '../dom.js';
import { icon, actIcon } from '../icons.js';
import { btn, primary, twoLine, voiceSwitch, delta, sheet as dsSheet } from '../ds.js';
import { encounterOptions, meleeOptions, shiftOptions, denSide, activeArmor, makeChangeOptions } from '../../engine/combat.js';
import { hasTreasure } from '../../engine/modifiers.js';
import { nameOfClearing, tileName } from '../../engine/world.js';
import { nameOf } from '../../engine/items.js';
import * as P from './payload.js';
import * as M from './model.js';
import { needsConfirm, needsWhom, whomBody } from './shared.js';          // (P6: the shared fight's extra step and its confirms)
import { targetName as pvpTargetName } from '../pvp.js';
import { DIRS, MNV, BOX, chitText, chitKindWord, chitName, nb, listOf, baseName } from './model.js';

const hint = (text, cls = '') => h('p', { class: `cb-hint${cls ? ` ${cls}` : ''}` }, text);
const qRow = (b, right = null) => h('div', { class: 'q' }, h('b', {}, b), right);
const foot = (lead, prim) => h('div', { class: 'ds-actions' }, lead ? h('div', { class: 'lead' }, lead) : null, prim);
const leadText = (...kids) => h('span', { class: 'ds-lead-text' }, ...kids);
const effortLead = eff => leadText(eff.over ? h('span', { style: 'color:var(--danger)' }, eff.text) : ['Effort ', h('b', {}, eff.lim >= 99 ? `${eff.ast}, no limit` : `${eff.ast} of ${eff.lim}`)]);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// the sheet itself (the body of the scene's lower third)
export const sheetEl = (X, kind, ...kids) => h('div', { class: 'cb-sheet', 'data-kind': kind, 'data-ask-type': X.p?.type ?? '' }, ...kids);

// a chit as a tile: its value and a kind word. `on`: chosen; `why`: when set it is dim and a tap says why.
export function chitTile(X, ch, { on = false, why = null, onclick, attrs = {} }) {
    return h('button', { type: 'button', class: `ds-chit ${ch.type}${on ? ' sel' : ''}${why ? ' dim' : ''}${ch.state === 'fatigued' ? ' tired' : ''}${ch.state === 'wounded' ? ' wounded' : ''}`, 'data-chit': ch.id, 'aria-pressed': on ? 'true' : 'false', 'aria-disabled': why ? 'true' : null,
        'aria-label': `${chitName(ch)}${why ? `: ${why}` : ''}`, ...attrs, onclick: () => (why ? X.say(why) : onclick()) }, h('span', {}, chitText(ch)), h('small', {}, chitKindWord(ch)));
}

// ================= the Meeting: pay, drinks, choice =================
export function meetingSheet(X) {
    const { st, p, send } = X;
    if (p.type === 'combat-drinks') {
        const can = st.ch.gold >= p.cost;
        return sheetEl(X, 'meeting', qRow('Meeting', h('span', {}, 'one question')),
            hint(can ? `Buy them drinks for ${p.cost} Gold: one step friendlier before the Meeting roll.` : `Drinks cost ${p.cost} Gold and you have ${st.ch.gold}.`),
            foot(btn('No thanks', '', { 'data-act': 'no-drinks', onclick: () => send(P.drinks(false)) }),
                primary(twoLine('Buy drinks', `${p.cost} Gold · you have ${st.ch.gold}`), { 'data-act': 'drinks', 'data-buy': '', disabled: !can, onclick: () => send(P.drinks(true)) })));
    }
    if (p.type === 'combat-pay') {
        const cost = p.cost === 'fame' ? 'Fame' : 'Notoriety', have = st.ch[p.cost === 'fame' ? 'fame' : 'notoriety'], can = have >= p.amount;
        const payBtn = isPrimary => (isPrimary ? primary : btn)(twoLine(`Pay ${p.amount} ${cost}`, can ? `you have ${have}` : `you have ${have} \u00B7 leaves ${String(have - p.amount).replace('-', '\u2212')}`), { 'data-act': 'pay', onclick: () => send(P.pay(true)) });
        const fight = isPrimary => (isPrimary ? primary : btn)('Fight', { 'data-act': 'pay-fight', onclick: () => send(P.pay(false)) });
        return sheetEl(X, 'meeting', qRow('Meeting', h('span', {}, 'one question')),
            hint(`Pay ${p.amount} ${cost} and they let you be, or stand and fight.`),
            can ? foot(fight(false), payBtn(true)) : foot(payBtn(false), fight(true)));
    }
    // combat-choice: they are not looking for a fight, so letting them be is the primary (right, gold) and picking the fight is the quiet one (QA-2: a stray tap must not turn on your own allies)
    const why = M.standingWhy(st, p.groups);
    return sheetEl(X, 'meeting', qRow('Meeting', h('span', {}, 'one question')),
        hint(`${why ? `${why} ` : ''}You may attack ${p.groups.length > 1 ? 'one of them, which brings its whole group in' : 'them'}, or let them be.`),
        foot(btn('Pick a fight', 'quiet', { 'data-act': 'attack-natives', onclick: () => send(P.choice(true)) }), primary('Let them be', { 'data-act': 'let-be', onclick: () => send(P.choice(false)) })));
}

// ================= the Encounter: three verbs and Go on =================
export function encounterSheet(X) {
    const { st, data, cb, send, render, p, c } = X;
    const o = encounterOptions(st, data);
    const round = p.spellOnly ? 'Quiet evening' : `Round ${c.round} · Encounter`;
    const items = st.ch.items.filter(i => !i.destroyed);
    const itemsBtn = items.length ? h('button', { type: 'button', class: 'ds-btn quiet sm', 'data-act': 'gear-open', onclick: () => { cb.pick = { kind: 'gear' }; render(); } }, p.spellOnly ? 'Items' : 'Switch an item') : null;
    const back = btn('Back', 'quiet', { 'data-act': 'pick-back', onclick: () => { cb.pick = null; cb.quiet = null; render(); } });
    const pick = cb.pick;
    if (pick?.kind === 'alert' && o.canAlert) return alertPick(X, o, round, back);
    if (pick?.kind === 'run' && o.canRun) return runPick(X, o, round, back);
    if (pick?.kind === 'fly' && o.canFly) return flyPick(X, o, round, back);
    if (pick?.kind === 'gear' && items.length) return gearPick(X, o, round, back);
    if (pick?.kind === 'cast' || p.spellOnly) return castPick(X, o, round, back, itemsBtn);
    cb.pick = null;
    const v = M.encounterVerbs(st, data, o, c);
    const tile = (icoName, label, state, on, attrs = {}) => h('button', { type: 'button', class: `cb-verb${state.ok ? '' : ' dim'}`, 'aria-disabled': state.ok ? null : 'true', ...(state.ok ? {} : { 'data-why': attrs['data-verb'], 'data-reason': state.why }), ...attrs,
        onclick: () => (state.ok ? on() : X.say(state.why)) }, actIcon(icoName, 32), label, state.ok ? null : h('small', {}, state.sub));
    const tiles = [
        tile('alert', M.weaponVerb(o), v.alert, () => { cb.pick = { kind: 'alert', chit: null }; render(); }, { 'data-verb': 'alert' }),
        tile('move', 'Run for it', v.run, () => { cb.pick = { kind: 'run', chit: null, to: null }; render(); }, { 'data-verb': 'run' }),
        tile('spell', 'Cast a spell', v.cast, () => { cb.pick = { kind: 'cast' }; render(); }, { 'data-verb': 'cast' }),
        ...(v.fly ? [tile('fly', 'Fly away', v.fly, () => { cb.pick = { kind: 'fly', chit: null, to: null }; render(); }, { 'data-verb': 'fly' })] : []),
        ...(o.held ?? []).map(hd => tile('spell', `Use ${hd.name}`, { ok: true }, () => send(P.protect(hd.fx)), { 'data-act': 'protect', 'data-fx': hd.fx })),
    ];
    const hidden = o.canStay;
    // creatures that cast rather than strike (a Demon: the Power of the Pit; an Imp: a Curse): said once, in a line, with the table one tap away
    const casters = M.bodiesOf(st).filter(d => denSide(st, data, d).attack === 'spell');
    const pitNote = casters.length ? hint(`${M.cap(M.foesPhrase(casters.map(d => denSide(st, data, d).name)))} ${casters.length > 1 ? 'cast' : 'casts'} rather than ${casters.length > 1 ? 'strike' : 'strikes'}: your maneuver can turn it aside, armor will not.`) : null;
    const lead = hidden ? btn('Strike from hiding', '', { 'data-act': 'pass', onclick: () => send(P.pass()) }) : casters.length ? btn(casters.every(d => M.isImp(data, d)) ? 'The curses' : 'What the Pit can do', 'quiet', { 'data-act': 'pit-note', onclick: () => { cb.pit = true; render(); } }) : null;
    const prim = hidden ? primary('Stay hidden', { 'data-act': 'stay-hidden', onclick: () => send(P.stay()) }) : primary('Go on to the fight', { 'data-act': 'pass', onclick: () => send(P.pass()) });
    return sheetEl(X, 'encounter', qRow(round, itemsBtn ?? h('span', {}, 'Before the melee?')), h('div', { class: 'cb-verbs' }, ...tiles), pitNote, foot(lead, prim));
}

function chitPickRow(X, chits, selId, onPick) {
    return h('div', { class: 'cb-chits', 'data-scope': '' }, ...chits.map(ch => chitTile(X, ch, { on: selId === ch.id, onclick: () => onPick(ch.id) })));
}
const cheapest = chits => [...chits].sort((a, b) => (a.effort ?? 0) - (b.effort ?? 0) || (a.time ?? 0) - (b.time ?? 0))[0];

function alertPick(X, o, round, back) {
    const { cb, send, render } = X, chits = o.alertChits;
    const sel = cb.pick.chit && chits.some(x => x.id === cb.pick.chit) ? cb.pick.chit : cheapest(chits).id;
    const verb = o.weapon.item.alerted ? 'Put your weapon away' : 'Ready your weapon';
    return sheetEl(X, 'encounter-pick', qRow(round, h('span', {}, verb)), chitPickRow(X, chits, sel, id => { cb.pick.chit = id; render(); }),
        hint('Pick the Fight chit that does it. It is your action; the melee follows.'),
        foot(back, primary(o.weapon.item.alerted ? 'Put it away' : 'Ready it', { 'data-act': 'alert-go', onclick: () => send(P.alert(sel)) })));
}
function runPick(X, o, round, back) {
    const { cb, send, render } = X, chits = o.runChits, roads = o.runTo;
    const sel = cb.pick.chit && chits.some(x => x.id === cb.pick.chit) ? cb.pick.chit : cheapest(chits).id;
    const to = cb.pick.to && roads.includes(cb.pick.to) ? cb.pick.to : roads[0];
    return sheetEl(X, 'encounter-pick', qRow(round, h('span', {}, 'Run for it')),
        roads.length > 1 ? h('div', { class: 'cb-aim', role: 'radiogroup', 'aria-label': 'Which road' }, ...roads.map(r => h('button', { type: 'button', class: `ds-btn${to === r ? ' on' : ''}`, 'data-road': r, 'aria-pressed': to === r ? 'true' : 'false', onclick: () => { cb.pick.to = r; render(); } }, nb(nameOfClearing(r))))) : null,
        chitPickRow(X, chits, sel, id => { cb.pick.chit = id; render(); }),
        hint(`You leave the fight and end the day on the road toward ${nb(nameOfClearing(to))}.`),
        foot(back, primary('Run', { 'data-act': 'run-go', onclick: () => send(P.run(sel, to)) })));
}
function flyPick(X, o, round, back) {
    const { cb, send, render } = X, chits = o.flyChits, tiles = o.flyTiles;
    const sel = cb.pick.chit && chits.some(x => x.id === cb.pick.chit) ? cb.pick.chit : cheapest(chits).id;
    const to = cb.pick.to && tiles.includes(cb.pick.to) ? cb.pick.to : tiles[0];
    return sheetEl(X, 'encounter-pick', qRow(round, h('span', {}, 'Fly away')),
        tiles.length > 1 ? h('div', { class: 'cb-aim', role: 'radiogroup', 'aria-label': 'Which way' }, ...tiles.map(r => h('button', { type: 'button', class: `ds-btn${to === r ? ' on' : ''}`, 'data-fly': r, 'aria-pressed': to === r ? 'true' : 'false', onclick: () => { cb.pick.to = r; render(); } }, nb(tileName(r))))) : null,
        chitPickRow(X, chits, sel, id => { cb.pick.chit = id; render(); }),
        hint(`You are carried to ${tileName(to)} and land at the next Birdsong.`),
        foot(back, primary('Fly', { 'data-act': 'fly-go', onclick: () => send(P.fly(sel, to)) })));
}

function gearPick(X, o, round, back) {
    const { st, data, cb, send, render, p } = X, quiet = !!p.spellOnly;
    const rows = st.ch.items.filter(i => !i.destroyed).map(it => {
        const nm = nameOf(data, it), state = `${it.active ? 'in use' : 'not in use'}${it.kind === 'weapon' && it.active ? (it.alerted ? ', alerted' : ', not alerted') : ''}`;
        const confirm = cb.leaveAsk === it.uid;
        return h('div', { class: 'cb-gearrow', 'data-gear-row': it.uid },
            h('span', { class: 'nm' }, h('b', {}, nm), h('small', {}, state)),
            st.ch.morph ? null : h('button', { type: 'button', class: 'ds-btn', 'data-act': 'gear-switch', 'data-item': it.uid, 'aria-label': `${nm}: ${it.active ? 'switch off' : 'switch on'}`, onclick: () => { cb.leaveAsk = null; send(P.gear(it.uid)); } }, it.active ? 'Switch off' : 'Switch on'),
            h('button', { type: 'button', class: `ds-btn${confirm ? ' danger' : ' quiet'}`, 'data-act': 'gear-leave', 'data-item': it.uid, 'aria-label': `Leave the ${nm} behind`,
                onclick: () => { if (confirm) { cb.leaveAsk = null; send(P.gear(it.uid, true)); } else { cb.leaveAsk = it.uid; render(); } } }, confirm ? 'Really leave it?' : 'Leave behind'));
    });
    return sheetEl(X, 'encounter-pick', qRow(quiet ? 'Quiet evening' : round, h('span', {}, 'Belongings')), h('div', { class: 'cb-gear' }, ...rows),
        hint(quiet ? 'Nothing is fighting you, so this costs nothing and you may do it as often as you like.' : 'This is your Encounter action: you may switch one item on or off, or leave one behind. The melee follows.'),
        foot(null, primary('Done', { 'data-act': 'pick-back', onclick: () => { cb.pick = null; cb.leaveAsk = null; render(); } })));
}

// ---- what a spell is aimed at (8.4.2): its legal targets and the questions it asks; `store` keeps the choices ----
const sameRef = (x, y) => x.kind === y.kind && String(x.id) === String(y.id);
export function aimEl(X, a, store) {
    const { render } = X;
    store.aim ??= {}; store.aimParams ??= {};
    const sel = store.aim[a.spell] ??= a.options.slice(0, a.min).map(x => x.ref);
    const pars = Array.isArray(a.params) ? a.params : [];
    return h('div', { class: 'cb-aimwrap', 'data-aim': a.spell },
        a.options.length ? hint(a.max === 1 ? `Whom does ${a.name} take?` : a.max === 0 ? '' : `Choose ${a.min === a.max ? a.min : `${a.min} to ${a.max}`}${a.min === 0 ? ' (none picked takes every one that qualifies)' : ''}.`) : null,
        a.options.length ? h('div', { class: 'cb-aim' }, ...a.options.map(opt => {
            const on = sel.some(r => sameRef(r, opt.ref));
            return h('button', { type: 'button', class: `ds-btn${on ? ' on' : ''}`, 'data-aim-opt': `${opt.ref.kind}:${opt.ref.id}`, 'aria-pressed': on ? 'true' : 'false', onclick: () => {
                if (a.max === 1) store.aim[a.spell] = [opt.ref]; else if (on) store.aim[a.spell] = sel.filter(r => !sameRef(r, opt.ref)); else if (sel.length < a.max) store.aim[a.spell] = [...sel, opt.ref];
                render(); } }, opt.label); })) : null,
        ...pars.map(q => { const cur = (store.aimParams[a.spell] ??= {})[q.key];
            return h('div', { class: 'aimq' }, hint(q.label), h('div', { class: 'cb-aim' }, ...(q.options ?? []).map(op => h('button', { type: 'button', class: `ds-btn${JSON.stringify(cur) === JSON.stringify(op.value) ? ' on' : ''}`, 'data-param': `${q.key}:${typeof op.value === 'object' ? JSON.stringify(op.value) : op.value}`,
                onclick: () => { store.aimParams[a.spell][q.key] = op.value; render(); } }, op.label)))); }));
}
const needsAim = x => !!x.aim && (x.aim.options.length > x.aim.min || (Array.isArray(x.aim.params) && x.aim.params.length));

// ---- cast a spell: the spells ready tonight as cards (one per spell; a spell that can be cast on several chits asks which) ----
function castPick(X, o, round, back, itemsBtn) {
    const { st, data, cb, send, render, p, c } = X, quiet = !!p.spellOnly;
    const groups = new Map();
    for (const x of o.casts) (groups.get(x.spell) ?? groups.set(x.spell, []).get(x.spell)).push(x);
    const mend = id => st.ch.chits.filter(x => x.id !== id && (x.state === 'fatigued' || x.state === 'wounded')).length;
    const armorN = st.ch.items.filter(i => i.kind === 'armor' && i.damaged && !i.destroyed).length;
    const what = x => {
        if (x.spell === 'make-whole') { const bits = [mend(x.chit) ? plural(mend(x.chit), 'tired or wounded chit') : '', armorN ? `${plural(armorN, 'damaged piece')} of armor` : ''].filter(Boolean); return bits.length ? `Puts right ${bits.join(' and ')}.` : 'There is nothing of yours to mend.'; }
        return data.spells?.[x.spell]?.text ?? '';
    };
    const key = x => `${x.spell}|${x.chit ?? ''}|${x.item ?? ''}`;
    // the choice: kept as a key; the first useful card in a quiet evening, none otherwise until tapped
    let sel = cb.cast && o.casts.find(x => key(x) === cb.cast) ? cb.cast : null;
    if (!sel && quiet) { const first = o.casts.find(x => x.useful || x.quiet); if (first) sel = key(first); }
    if (!sel && !quiet && o.casts.length === 1) sel = key(o.casts[0]);
    const chosen = sel ? o.casts.find(x => key(x) === sel) : null;
    const cards = [...groups].map(([spell, opts]) => {
        const x0 = chosen && chosen.spell === spell ? chosen : opts[0], on = !!chosen && chosen.spell === spell, sp = data.spells?.[spell];
        const cost = x0.item ? `From your ${x0.from}, at time 0: no Magic chit is used` : `Uses Magic ${st.ch.chits.find(ch => ch.id === x0.chit)?.numeral ?? ''}${x0.time}${'*'.repeat(x0.effort)}: that chit will be tired${sp?.color ? ` · ${sp.color} magic` : ''}`;
        return [h('button', { type: 'button', class: `cb-spell${on ? ' on' : ''}`, 'data-act': 'cast', 'data-spell': spell, 'aria-pressed': on ? 'true' : 'false', onclick: () => { cb.cast = key(on ? chosen : x0); cb.quiet = null; render(); } },
            h('span', { class: `dot ${(sp?.color ?? '').toLowerCase()}`, 'aria-hidden': 'true' }), h('span', { class: 'main' }, h('b', {}, x0.name), h('span', { class: 'what' }, what(x0)), h('small', {}, cost))),
        on && opts.length > 1 ? h('div', { class: 'cb-chits' }, ...opts.map(x => { const ch = st.ch.chits.find(q => q.id === x.chit); return ch ? chitTile(X, ch, { on: key(x) === sel, onclick: () => { cb.cast = key(x); render(); } }) : null; })) : null];
    }).flat().filter(Boolean);
    const aimStore = (cb.quiet ??= {});
    const aimNow = chosen && quiet && needsAim(chosen) ? aimEl(X, chosen.aim, aimStore) : null;
    const blocked = o.blocked?.length && !o.casts.length ? hint(`${o.blocked[0].name}: ${o.blocked[0].why}`) : null;
    const cant = !chosen;
    const castGo = chosen ? primary(`Cast ${chosen.name}`, { 'data-act': 'cast-go', 'data-spell': chosen.spell, onclick: () => {
        if (quiet && needsAim(chosen)) send(P.castAimed(chosen, P.aimOf(chosen.aim, aimStore)));
        else send(P.cast(chosen)); } }) : null;
    if (quiet) {
        const lead = chosen ? btn(c.quietDone?.length ? 'That is enough' : 'Not tonight', '', { 'data-act': 'pass', onclick: () => send(P.pass()) }) : null;
        const prim = castGo ?? primary(c.quietDone?.length ? 'That is enough' : 'Not tonight', { 'data-act': 'pass', onclick: () => send(P.pass()) });
        return sheetEl(X, 'quiet', qRow('Quiet evening', itemsBtn ?? h('span', {}, 'cast a spell?')), h('div', { class: 'cb-spells' }, ...cards), aimNow, blocked, foot(lead, prim));
    }
    return sheetEl(X, 'encounter-pick', qRow(round, h('span', {}, 'Cast a spell')), h('div', { class: 'cb-spells' }, ...cards), blocked,
        hint('The Magic chit is the cost: it counts toward the asterisks of the round and is tired afterwards.'),
        foot(back, castGo ?? primary('Cast', { disabled: true, 'data-act': 'cast-go', onclick: () => X.say('Choose a spell first.') })));
}

// ================= the Melee stepper =================
export function stepsFor(o, X = null) {
    const s = X?.shared && needsWhom(X.st, o) ? [{ id: 'whom', l: 'Whom' }] : [];          // (a shared fight: others' creatures, characters and hirelings can be named too)
    s.push({ id: 'strike', l: 'Strike' });
    if ((o.aims ?? []).length) s.push({ id: 'aim', l: 'Aim' });
    s.push({ id: 'guard', l: 'Guard' });
    if (o.shield) s.push({ id: 'shield', l: 'Shield' });
    if ((o.morphParts ?? []).length) s.push({ id: 'parts', l: 'Parts' });
    if (o.boxable.length >= 2) s.push({ id: 'foes', l: 'Foes' });
    s.push({ id: 'roll', l: 'Roll' });
    return s;
}
const dirButtons = (names, sub, cur, onPick, attr = null, dim = false) => h('div', { class: 'cb-dirs', 'data-scope': '' }, ...names.map((n, i) => h('button', { type: 'button', class: `cb-dir${cur === i ? ' on' : ''}${dim ? ' dim' : ''}`, 'data-dir': i, ...(attr ? { [attr]: i } : {}), 'aria-pressed': cur === i ? 'true' : 'false', 'aria-disabled': dim ? 'true' : null, onclick: () => onPick(i) }, n, h('small', {}, sub(i)))));

export function meleeSheet(X) {
    const { st, data, cb, send, render, c } = X;
    const o = meleeOptions(st, data), m = cb.plan, steps = stepsFor(o, X), sh = !!X.shared;
    const cur = steps.some(s => s.id === cb.step) ? cb.step : steps[0].id, idx = steps.findIndex(s => s.id === cur);
    const confirmPending = sh && !!needsConfirm(st, data, o.targets.find(t => t.uid === m.target)) && m.sure !== m.target;
    const go = id => { cb.step = id; render(); };
    const stepper = h('div', { class: 'cb-steps', role: 'tablist' }, ...steps.map((s, i) => h('button', { type: 'button', role: 'tab', 'aria-selected': i === idx ? 'true' : 'false', 'data-step': s.id, class: `cb-step${i < idx ? ' done' : ''}${i === idx ? ' on' : ''}`, onclick: () => go(s.id) }, `${i + 1} ${s.l}`)));
    const next = steps[idx + 1], prev = steps[idx - 1];
    const nextBtn = next ? primary(`Next: ${next.l}`, { 'data-act': 'step-next', onclick: () => go(next.id) }) : null;
    const backBtn = prev ? btn('Back', 'quiet', { 'data-act': 'step-back', onclick: () => go(prev.id) }) : null;
    const eff = M.effortLine(st, o, m);
    const w = o.weapon, wname = w ? nameOf(data, w.item) : 'bare hands';
    const tgtName = m.target ? (pvpTargetName(st, data, m.target) ?? baseNameOf(st, data, o, m.target)) : null;
    let body, lead = backBtn, prim = nextBtn;

    if (cur === 'whom') {
        const w = whomBody(X, o, m);
        body = [h('div', { class: 'cb-fields sf-whom', role: 'radiogroup', 'aria-label': 'Whom you strike' }, ...w.els)];
        lead = leadText(tgtName ? `You strike ${tgtName}.` : 'You strike no one.');
        prim = primary(`Next: ${next.l}`, { 'data-act': 'step-next', disabled: w.blocked, onclick: () => go(next.id) });
    } else if (cur === 'strike') {
        const spl = o.attackSpell ? data.spells?.[o.attackSpell.spell] : null;
        const chits = spl ? h('p', { class: 'cb-hint' }, `${spl.name}: ${o.attackSpell.hits > 1 ? `${M.numWord(o.attackSpell.hits)} hits` : 'one hit'}, harm ${o.attackSpell.harm}${'*'.repeat(o.attackSpell.stars)}, length ${o.attackSpell.length}. It takes the place of your weapon.`)
            : o.fightChits.length ? h('div', { class: 'cb-chits', 'data-scope': '' }, ...o.fightChits.map(ch => chitTile(X, ch, { on: m.fightChit === ch.id, why: M.chitWhy(st, data, o, m, ch, 'fight') && m.fightChit !== ch.id ? M.chitWhy(st, data, o, m, ch, 'fight') : null,
                onclick: () => { m.fightChit = m.fightChit === ch.id ? null : ch.id; render(); }, attrs: { 'data-sel': 'fc' } })))
                : h('p', { class: 'cb-hint' }, c.casts?.length ? 'You cast a spell this round, so you cannot also swing a weapon.' : 'You have no Fight chit ready.');
        body = [dirButtons(DIRS, i => `hits ${MNV[i]}`, m.attackDir, i => { m.attackDir = i; render(); }), chits];
        const repeat = c.round > 1 && X.ui.lastPlan?.fight === cb.fightKey && M.repeatable(X.ui.lastPlan.plan) ? btn('Same as last round', 'quiet', { 'data-act': 'same-plan', onclick: () => { cb.plan = M.repeatPlan(st, data, o, X.ui.lastPlan.plan); go('roll'); } }) : null;
        const hintLine = eff.over ? `${eff.text}: put a chit back.` : !m.target && m.fightChit ? 'You strike at no one: the chit only sets your weapon.'
            : repeat ? eff.text : m.fightChit ? 'Tap the chosen chit again to play none.' : o.fightChits.length && !o.attackSpell ? 'Pick a Fight chit to strike, or go on without one.' : eff.text;
        if (!spl && o.fightChits.length) body.push(hint(hintLine, eff.over ? 'bad' : ''));
        lead = repeat ?? effortLead(eff);
    } else if (cur === 'guard') {
        body = [dirButtons(MNV, i => `meets ${DIRS[i]}`, m.moveDir, i => { m.moveDir = i; render(); }),
            o.moveChits.length ? h('div', { class: 'cb-chits', 'data-scope': '' }, ...o.moveChits.map(ch => chitTile(X, ch, { on: m.moveChit === ch.id, why: M.chitWhy(st, data, o, m, ch, 'move') && m.moveChit !== ch.id ? M.chitWhy(st, data, o, m, ch, 'move') : null,
                onclick: () => { m.moveChit = m.moveChit === ch.id ? null : ch.id; render(); }, attrs: { 'data-sel': 'mc' } }))) : h('p', { class: 'cb-hint' }, 'You have no Move chit ready.'),
            hint(M.guardHint(st, data, o, m))];
    } else if (cur === 'shield') {
        body = [dirButtons(DIRS, () => 'shield here', m.shieldDir, i => { m.shieldDir = i; render(); }), hint(`Your ${nameOf(data, o.shield.item ?? o.shield)} guards one direction each round.`)];
    } else if (cur === 'aim') {
        body = [h('div', { class: 'cb-aimscroll' }, ...o.aims.map(a => aimEl(X, a, m)))];
    } else if (cur === 'parts') {
        m.parts ??= {};
        body = [h('div', { class: 'cb-fields' }, ...o.morphParts.map(pt => h('div', { class: 'cb-sum' }, h('span', { class: 'v' }, pt.name), h('span', { class: 'cb-aim' },
            h('button', { type: 'button', class: `ds-btn${!m.parts[pt.id] ? ' on' : ''}`, onclick: () => { delete m.parts[pt.id]; render(); } }, 'not now'),
            ...pt.sides.map(sd => h('button', { type: 'button', class: `ds-btn${m.parts[pt.id] === sd.side ? ' on' : ''}`, onclick: () => { m.parts[pt.id] = sd.side; render(); } }, sd.side))))))];
    } else if (cur === 'foes') {
        const rows = o.boxable.map((d, i) => { const b = m.boxes[d.uid] ?? (i % 3);
            return h('button', { type: 'button', class: 'cb-sum', 'data-place': d.uid, onclick: () => { m.boxes[d.uid] = (b + 1) % 3; render(); } }, h('span', { class: 'k' }, baseNameOf(st, data, o, d.uid)), h('span', { class: 'v' }, o.boxable.length > 3 ? MNV[b] : `${BOX[b]} box`), o.boxable.length > 3 ? null : h('span', { class: 'ds-tag gold' }, 'tap to move')); });
        body = [h('div', { class: `cb-fields${rows.length > 3 ? ' two' : ''}${rows.length > 6 ? ' scroll' : ''}` }, ...rows), hint('The dice may still shuffle them.')];
        lead = btn('Auto-place', 'quiet', { 'data-act': 'auto-place', onclick: () => { o.boxable.forEach((d, i) => { m.boxes[d.uid] = i % 3; }); render(); } });
    } else {
        // roll: a review
        const rows = [];
        const strikeText = o.attackSpell ? `${data.spells?.[o.attackSpell.spell]?.name ?? 'Spell'}, ${DIRS[m.attackDir]}` : `${m.target ? `${DIRS[m.attackDir]} at ${tgtName}` : 'No one'}${m.fightChit ? `, ${chitText(st.ch.chits.find(x => x.id === m.fightChit) ?? o.fightChits.find(x => x.id === m.fightChit))}` : m.target ? ', no chit' : ''}`;
        rows.push(sumRow('Strike', strikeText, () => go('strike')));
        if ((o.aims ?? []).length) rows.push(sumRow('Aim', o.aims.map(a => `${a.name}: ${(m.aim?.[a.spell] ?? a.options.slice(0, a.min).map(x => x.ref)).map(r => a.options.find(q => sameRef(q.ref, r))?.label ?? '').filter(Boolean).join(', ') || 'as it falls'}`).join(' · '), () => go('aim')));
        rows.push(sumRow('Guard', m.moveChit ? `${MNV[m.moveDir]}, with ${chitText(o.moveChits.find(x => x.id === m.moveChit) ?? st.ch.chits.find(x => x.id === m.moveChit))}` : `${MNV[m.moveDir]}, no chit`, () => go('guard')));
        if (o.shield) rows.push(sumRow('Shield', `guards ${DIRS[m.shieldDir]}`, () => go('shield')));
        if (o.boxable.length >= 2) rows.push(sumRow('Foes', o.boxable.length > 3 ? `${o.boxable.length} creatures placed` : o.boxable.map((d, i) => `${baseNameOf(st, data, o, d.uid)} ${MNV[m.boxes[d.uid] ?? (i % 3)]}`).join(' \u00B7 '), () => go('foes')));
        if (m.fightChit && !m.target && w && !o.attackSpell) { m.weaponSide ??= w.item.alerted ? 'alerted' : 'unalerted'; rows.push(sumRow('Weapon', `ends ${m.weaponSide === 'alerted' ? 'alerted' : 'not alerted'}`, () => { m.weaponSide = m.weaponSide === 'alerted' ? 'unalerted' : 'alerted'; render(); }, 'data-weapon-side')); }
        body = [h('div', { class: `cb-fields${rows.length >= 4 ? ' two' : ''}` }, ...rows)];
        lead = leadText(eff.over ? h('span', { class: 'bad', style: 'color:var(--danger)' }, `${eff.text}: ${eff.words}.`) : [`${eff.text}: `, eff.words, '.']);
        prim = primary(sh ? 'Seal your play' : 'Roll the dice', { 'data-act': 'commit', disabled: eff.over || confirmPending, onclick: () => X.sendMelee(o, m) });
        if (eff.over) lead = leadText(h('span', { style: 'color:var(--danger)' }, `Put a chit back: ${M.limitWord(o.effortLimit ?? 2)} asterisks at most.`));
    }
    return sheetEl(X, 'melee', stepper, ...body, foot(lead, prim));
}
const sumRow = (k, v, onclick, attr = null) => h('button', { type: 'button', class: 'cb-sum', ...(attr ? { [attr]: '' } : { 'data-sum': k.toLowerCase() }), onclick }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v), icon('right'));
// the creature's name as the counter prints it ("Wolf #2")
function baseNameOf(st, data, o, uid) { const d = st.combat.dens.find(x => x.uid === uid); return d ? M.nbTag(denSide(st, data, d).name) : '?'; }

// ================= Battle Bracelets / Elusive Cloak: the plays are shown, the dice have moved the creatures =================
export function shiftSheet(X) {
    const { st, data, cb, send, render, c } = X;
    const o = shiftOptions(st, data);
    cb.shift ??= {}; const sh = cb.shift; sh.attackDir ??= o.attackDir; sh.moveDir ??= o.moveDir;
    const parts = [];
    if (hasTreasure(st, 'battle-bracelets') && o.hasAttack) parts.push(h('div', { 'data-sec': 'shift-attack' }, dirButtons(DIRS, () => (o.attack ? 'move it here' : 'stays'), sh.attackDir, i => { if (o.attack) { sh.attackDir = i; render(); } else X.say(`${o.foes.map(f => `${f.name} moves at ${f.move ?? '?'}`).join(', ')}: a target that moves at 4 or less keeps your attack where it is.`); }, 'data-shift-attack', !o.attack),
        hint(o.attack ? `${o.foes.map(f => `${f.name} moves at ${f.move}`).join(', ')}: your Bracelets move your attack to any circle.` : 'Your Bracelets cannot move your attack this round.')));
    if (hasTreasure(st, 'elusive-cloak') && o.hasMove) parts.push(h('div', { 'data-sec': 'shift-move' }, dirButtons(MNV, () => (o.move ? 'move it here' : 'stays'), sh.moveDir, i => { if (o.move) { sh.moveDir = i; render(); } else X.say(o.attackers.length ? 'An attack aimed at you comes at time 4 or less: the Cloak cannot move your maneuver.' : 'Nothing is aimed at you.'); }, 'data-shift-move', !o.move),
        hint(o.move ? 'Every attack aimed at you comes at 5 or more: your Cloak moves your maneuver to any square.' : 'Your Cloak cannot move your maneuver this round.')));
    return sheetEl(X, 'shift', qRow(`Round ${c.round} · Plays shown`, h('span', {}, 'Before the blows')), ...parts, foot(null, primary('Resolve the blows', { 'data-act': 'shift-go', onclick: () => { cb.shift = null; send(P.shift(o, sh)); } })));
}

// ================= the round's result (result first) =================
export function resultSheet(X, facts) {
    const { st, cb, render, p, c } = X;
    const g = c.roundGain ?? { fame: 0, notoriety: 0, gold: 0 };
    const chips = [];
    for (const [k, name] of [['fame', 'fame'], ['notoriety', 'notor'], ['gold', 'gold']]) if (g[k]) chips.push(delta(name, g[k] > 0 ? `+${g[k]}` : String(g[k]).replace('-', '−'), g[k] < 0));
    const tags = [];
    const wounds = p.type === 'combat-wounds' ? p.count : 0;
    if (wounds) tags.push(h('span', { class: 'ds-tag bad' }, `${plural(wounds, 'wound')} to take`));
    if (p.type === 'combat-fatigue') tags.push(h('span', { class: 'ds-tag' }, `${plural(p.need, 'asterisk')} to tire`));
    if (facts.destroyed.length) tags.push(h('span', { class: 'ds-tag bad' }, `${facts.destroyed.map(M.cap).join(', ')} destroyed`));
    else if (facts.damaged.length) tags.push(h('span', { class: 'ds-tag bad' }, `${facts.damaged.map(M.cap).join(', ')} damaged`));
    else if (facts.noEffect) tags.push(h('span', { class: 'ds-tag' }, 'Armor holds'));
    if (!facts.landed.length && !facts.ran && (c.killed?.length || facts.avoided)) tags.push(h('span', { class: 'ds-tag good' }, 'Unhurt'));
    const routes = { 'combat-wounds': ['Choose the wound' + (p.count > 1 ? 's' : ''), p.count === 1 ? '1 chit gives way' : `${p.count} chits give way`], 'combat-fatigue': ['Choose what tires', `${plural(p.need, 'asterisk')} to pay`] };
    const route = routes[p.type];
    const prim = route ? primary(twoLine(route[0], route[1]), { 'data-act': 'round-ok', onclick: () => { cb.seen = X.resultKey; render(); } }) : primary(twoLine('Go on', `Round ${c.round}`), { 'data-act': 'round-ok', onclick: () => { cb.seen = X.resultKey; render(); } });
    return sheetEl(X, 'result', h('div', { class: 'cb-verdict' }, ...chips, ...tags),
        foot(btn('Record', 'quiet', { 'data-act': 'record', onclick: () => { cb.record = true; render(); } }), prim));
}

// ================= wounds and fatigue: the twelve chits, one grid =================
export function gridSheet(X) {
    const { st, data, cb, send, render, p } = X;
    const wounds = p.type === 'combat-wounds', need = wounds ? p.count : p.need;
    const key = `${p.type}|${p.chits.join(',')}|${need}`;
    if (cb.selKey !== key) { cb.selKey = key; cb.sel = wounds ? M.woundDefault(st, p) : M.fatigueDefault(st, p); cb.changeChit = null; }
    const sel = cb.sel;
    const order = { fight: 0, move: 1, magic: 2 };
    const chits = [...st.ch.chits].sort((a, b) => (order[a.type] ?? 3) - (order[b.type] ?? 3));
    const eligible = new Set(p.chits);
    const grid = h('div', { class: 'cb-chitgrid', 'data-scope': '' }, ...chits.map(ch => {
        const ok = eligible.has(ch.id), on = sel.includes(ch.id);
        return chitTile(X, ch, { on, why: ok ? null : (ch.state === 'wounded' ? 'That chit is already wounded.' : ch.state === 'fatigued' ? 'That chit is already tired.' : wounds ? 'That chit cannot be wounded now.' : 'That chit has no asterisk to tire.'),
            onclick: () => {
                const i = sel.indexOf(ch.id);
                if (i >= 0) sel.splice(i, 1);
                else {
                    sel.push(ch.id);
                    // a new tap pushes the oldest one out: never more chits than are owed (wounds), never more asterisks than owed and one over (fatigue)
                    const total = () => sel.reduce((n, id) => n + (st.ch.chits.find(x => x.id === id)?.effort ?? 0), 0);
                    while (wounds ? sel.length > need : (sel.length > 1 && total() - need > 1)) sel.shift();
                }
                render();
            }, attrs: { 'data-sel': 'w' } });
    }));
    let lead, prim, extra = null;
    if (wounds) {
        const ok = sel.length === need, one = sel.length === 1 ? st.ch.chits.find(x => x.id === sel[0]) : null;
        lead = leadText(`${sel.length} of ${need} chosen`);
        prim = primary(ok ? (need === 1 && one ? `Wound the ${chitText(one)} ${chitKindWord(one).charAt(0)}${chitKindWord(one).slice(1).toLowerCase()}` : `Wound ${need} chits`) : `Choose ${need}`, { 'data-act': 'wound-go', disabled: !ok, onclick: () => { const ids = [...sel]; cb.sel = null; cb.selKey = null; send(P.wounds(ids)); } });
    } else {
        const sum = sel.reduce((s, id) => s + (st.ch.chits.find(x => x.id === id)?.effort ?? 0), 0);
        const changers = sum - need === 1 ? makeChangeOptions(st, data, sel) : [];
        if (cb.changeChit && !changers.some(x => x.id === cb.changeChit)) cb.changeChit = null;
        if (changers.length > 1) extra = h('div', { 'data-sec': 'make-change' }, hint('You tire one asterisk too many, so a tired one-asterisk chit comes back. Which?'),
            h('div', { class: 'cb-chits' }, ...changers.map(ch => chitTile(X, ch, { on: (cb.changeChit ?? changers[0].id) === ch.id, onclick: () => { cb.changeChit = ch.id; render(); } }))));
        const ok = sum >= need && sum - need <= 1, one = sel.length === 1 ? st.ch.chits.find(x => x.id === sel[0]) : null;
        lead = leadText(`${sum} of ${need} asterisk${need === 1 ? '' : 's'}${sum - need === 1 ? ' · you get one back' : ''}`);
        prim = primary(ok ? (one ? `Tire the ${chitText(one)} ${chitKindWord(one).charAt(0)}${chitKindWord(one).slice(1).toLowerCase()}` : 'Tire these') : `Choose ${need === 1 ? 'a chit' : 'chits'}`, { 'data-act': 'fatigue-go', disabled: !ok, onclick: () => {
            const ids = [...sel], change = changers.length > 1 ? (cb.changeChit ?? changers[0].id) : null; cb.sel = null; cb.selKey = null; cb.changeChit = null; send(P.fatigue(ids, change)); } });
    }
    return sheetEl(X, wounds ? 'wounds' : 'fatigue', grid, extra, foot(lead, prim));
}

// ================= the end of the fight =================
export function recapSheet(X, recap) {
    const { st, data, send, p } = X;
    const chips = [];
    for (const [k, name] of [['fame', 'fame'], ['notoriety', 'notor'], ['gold', 'gold']]) if (recap.gain[k]) chips.push(delta(name, recap.gain[k] > 0 ? `+${recap.gain[k]}` : String(recap.gain[k]).replace('-', '−'), recap.gain[k] < 0));
    chips.push(h('span', { class: 'ds-tag' }, plural(recap.rounds, 'round')));
    if (recap.wounded) chips.push(h('span', { class: 'ds-tag bad' }, `${plural(recap.wounded, 'chit')} wounded`));
    if (recap.tired) chips.push(h('span', { class: 'ds-tag' }, `${plural(recap.tired, 'chit')} tired`));
    if (activeArmor(st, data).length || recap.damaged || recap.destroyed) chips.push(h('span', { class: `ds-tag${recap.destroyed || recap.damaged ? ' bad' : ''}` }, recap.destroyed ? `${plural(recap.destroyed, 'piece')} of armor destroyed` : recap.damaged ? 'Armor damaged' : 'Armor whole'));
    return sheetEl(X, 'recap', h('div', { class: 'cb-recap' }, h('div', { class: 'big' }, 'Victory'),
        h('div', { class: 'cb-verdict', style: 'margin-top:8px' }, ...chips),
        h('p', { class: 'cb-hint', style: 'text-align:center;margin:8px 0 0', 'data-totals': '' }, `You now have ${st.ch.fame} Fame, ${st.ch.notoriety} Notoriety and ${st.ch.gold} Gold.`)),
        foot(btn('Record', 'quiet', { 'data-act': 'record', onclick: () => { X.cb.record = true; X.render(); } }), primary('On to the night', { 'data-act': 'fight-over', onclick: () => send(P.over()) })));
}
export function beatSheet(X, recap, how) {
    const by = how === 'died' && X.slain ? X.slain : null;
    const chips = [...(by ? [h('span', { class: 'ds-tag bad' }, `Slain by the ${by}`)] : []), h('span', { class: 'ds-tag' }, plural(recap.rounds, 'round')), ...(recap.kills.length ? [h('span', { class: 'ds-tag good' }, `${plural(recap.kills.length, 'foe')} slain`)] : [])];
    return sheetEl(X, 'beat', h('div', { class: 'cb-recap' }, h('div', { class: 'big fallen' }, how === 'died' ? 'You have fallen' : 'Victory'), h('div', { class: 'cb-verdict', style: 'margin-top:8px' }, ...chips)),
        foot(null, primary(how === 'died' ? 'Go on' : 'On to the night', { 'data-act': 'beat-ok', onclick: () => X.beatOk() })));
}

// ================= the Record: the fight blow by blow, round by round =================
export function recordSheet(X, rounds) {
    const { cb, render } = X;
    // Story: the engine's story line, with the numbers in brackets left out ("(4 against your 6)"); Detail: the exact line. A line the engine told no story for (a roll, a position) is Detail only.
    const clean = t => nb(t.replace(/ \((?:[^()]*\d[^()]*)\)/g, '').replace(/\s+([.,;])/g, '$1'));
    const boxes = [...rounds].reverse().map(({ r, lines }) => {
        let ns = 0, nd = 0;
        return h('div', { class: 'cb-rbox' }, h('span', { class: 'lg' }, `Round ${r}`), ...lines.map(l => {
            const isRoll = l.k === 'roll', both = !!l.s && !isRoll;
            if (!isRoll) nd++; if (both) ns++;
            const stamps = M.stampsOf(l), plain = l.t.replace(/^\u{1F3B2}\s*/u, '');
            return h('div', { class: `cb-blow${isRoll ? ' roll' : ''}`, ...(both ? {} : { 'data-v': 'detail' }) },
                both ? h('span', { class: 'n', 'data-v': 'story' }, String(ns)) : null, h('span', { class: 'n', 'data-v': 'detail' }, isRoll ? '\u2022' : String(nd)),
                h('span', { class: 't' },
                    both ? h('span', { 'data-v': 'story' }, clean(l.s), ...stamps.map(([k, t]) => [' ', h('span', { class: `cb-stamp ${k}` }, t)])) : null,
                    h('span', { 'data-v': 'detail' }, nb(plain), ...(both ? [] : []))));
        }));
    });
    const last = rounds.at(-1)?.r ?? 1, first = rounds[0]?.r ?? 1;
    const frag = dsSheet({ eyebrow: 'Fight record', title: first === last ? `Round ${last}` : `Rounds ${first} to ${last}`, detent: 'tall', onClose: () => { cb.record = false; render(); },
        body: [h('div', { style: 'display:flex;justify-content:flex-end;margin:0 0 8px' }, voiceSwitch()), h('div', { class: 'cb-rounds' }, ...boxes)] });
    frag.sheet.classList.add('cb-record');
    return frag;
}

// ================= what the creatures that cast can do (the Power of the Pit, the Imp's curses): the table in words, no odds =================
export function pitSheet(X) {
    const { st, data, cb, render } = X;
    const bodies = M.bodiesOf(st).filter(d => denSide(st, data, d).attack === 'spell');
    const imps = bodies.some(d => M.isImp(data, d)), pit = bodies.some(d => !M.isImp(data, d));
    const rows = t => Object.entries(data.tables?.[t]?.rows ?? {}).map(([k, r]) => h('p', { class: 'pitrow' }, h('b', {}, `${r.name}. `), r.effect));
    const body = [
        pit ? h('div', {}, h('p', {}, 'A Demon does not strike a blow. At its attack time it casts the Power of the Pit, and the dice decide what falls on whoever it is aimed at. It is aimed like any attack: your maneuver can turn it aside, but armor does not help against it. Roll two dice and the higher one counts: a low number is rare, a high one comes up often.'), ...rows('powerOfThePit'), h('p', {}, 'A hidden character is not touched by the Fiery Chasm. Staying hidden keeps a Demon from being set on you at all.')) : null,
        imps ? h('div', {}, h('p', {}, 'An Imp does not strike a blow. At its attack time it casts a curse on whoever it is aimed at. Your maneuver can turn it aside, but armor does not help. A Pentangle or Protection from Magic keeps it off you, and a Chapel clearing lifts curses at Midnight.'), ...rows('curses')) : null,
    ];
    return dsSheet({ eyebrow: 'Creatures that cast', title: pit ? 'The Power of the Pit' : 'The Imp\u2019s curses', detent: 'tall', onClose: () => { cb.pit = false; render(); }, body });
}
