// combat/sections.js: the Melee Sections of a round (engine: app/engine/hirefight.js, `meleeOptions().sections`, rules 8.4.2e, 8.4.2f, 8.4.5n, 8.4.6d, 8.4.8), with no DOM so that node tests can run it.
// A section is a defender (the owner, in a red box), its target (in a Maneuver square) and the other attackers (in Attack circles); box, circle and square of one direction are one line (8.4.8b).
// The hirer places what is his: whom an attacked hireling strikes (`hireTargets`), the side a defending hireling shows (`hireSides`), and the direction each counter stands in (`positions`). The engine
// says where everything would stand and whether the plan is allowed (hirefight.js preview, the same layout the Melee step uses); nothing here decides a rule.
//
//   plan = { key, targets: { [hireling]: attacker }, sides: { [hireling]: 'light' | 'dark' }, pos: { [counter]: 0 | 1 | 2 } }   what he chose (positions he named; the rest are where the rules put them)
import * as HF from '../../engine/hirefight.js';
import { counterInfo, nameOfKey } from './counters.js';
import { DIRS, MNV, BOX, listOf, nbTag } from './model.js';

export const inPlay = o => !!o?.sections?.length;
const sheetsOf = st => st.combat.sec?.sheets ?? [];
export { DIRS, MNV, BOX };

// ---- the plan ----
export function planFor(st, data, o, cb) {
    const c = st.combat, sheets = sheetsOf(st);
    const key = `${c.round}|${sheets.map(s => `${s.id}:${s.owner}:${s.attackers.join('+')}:${s.held ? 1 : 0}`).join(',')}`;
    if (cb.sec?.key !== key) {
        const old = cb.sec, plan = { key, round: c.round, targets: {}, sides: {}, pos: {}, open: null };
        if (old && old.round === c.round) {          // the spells of the round changed the sections: what he chose stays where it still makes sense
            for (const s of sheets) {
                if (old.targets[s.owner] && s.attackers.includes(old.targets[s.owner])) plan.targets[s.owner] = old.targets[s.owner];
                if (old.sides[s.owner]) plan.sides[s.owner] = old.sides[s.owner];
            }
            plan.open = old.open;
        }
        cb.sec = plan;
    }
    return cb.sec;
}

// ---- the sections as the screen draws them ----
const baseOwn = (info, key) => (info.role === 'horse' && key.endsWith(':horse') ? info.hire?.uid : info.role === 'horse' || info.role === 'part' ? info.ownerKey : key);

// -> [{ id, ownerKey, ownerName, ownerKind, held, noTarget, attackers: [{ key, name, hire }], target, chooses, sides, side, error, cells: { box|square|circle: [[chip], [chip], [chip]] } }]
// a chip: { key, name, role: 'hire' | 'den' | 'part' | 'horse', hire, side, dir, zone, editable, note }
export function cardsOf(st, data, plan) {
    const prev = HF.preview(st, data, { hireTargets: plan.targets, positions: plan.pos });
    const byId = new Map(prev.map(r => [r.id, r]));
    return sheetsOf(st).map(s => {
        const r = byId.get(s.id) ?? { pos: { ...s.pos }, target: s.target, error: null };
        const owner = counterInfo(st, data, s.owner), hireOwner = s.ownerKind === 'hire';
        const cells = { box: [[], [], []], square: [[], [], []], circle: [[], [], []] };
        for (const [key, dir] of Object.entries(r.pos)) {
            const info = counterInfo(st, data, key), unit = baseOwn(info, key);
            const zone = unit === s.owner ? 'box' : unit === r.target ? 'square' : 'circle';
            if (zone === 'box' && s.noTarget) continue;
            const note = info.role === 'hire' ? (info.side === 'dark' ? 'dark side' : 'light side') : info.role === 'horse' && info.hire ? (info.hire.horse?.side === 'dark' ? 'galloping' : 'walking') : '';
            cells[zone][dir]?.push({ key, name: nbTag(info.name), role: info.role, hire: !!info.hire, side: info.side, dir, zone, editable: zone !== 'box' || hireOwner, note });
        }
        const sides = hireOwner && owner.hire ? sidesOf(data, owner.hire) : [];
        return { id: s.id, ownerKey: s.owner, ownerName: nbTag(owner.name), ownerKind: s.ownerKind, held: !!s.held, noTarget: !!s.noTarget,
            attackers: s.attackers.map(u => ({ key: u, name: nbTag(nameOfKey(st, data, u)), hire: !!(st.combat.hires ?? []).find(h => h.uid === u) })), target: r.target, chooses: hireOwner && s.attackers.length > 1 && !s.held,
            sides, side: plan.sides[s.owner] ?? owner.hire?.side ?? 'light', error: r.error, cells };
    });
}
const sidesOf = (data, h) => { const o = h.kind === 'mon' ? data.monsters[h.id] : data.natives[h.id]; return ['light', 'dark'].filter(s => o[s]); };

// ---- changing the plan ----
export function setTarget(plan, card, attackerKey) { plan.targets[card.ownerKey] = attackerKey; for (const k of Object.keys(plan.pos)) delete plan.pos[k]; }          // (a new target brings new squares: what he placed before is forgotten)
export function setSide(plan, card, side) { plan.sides[card.ownerKey] = side; }
export function moveCounter(plan, chip) { plan.pos[chip.key] = (chip.dir + 1) % 3; }
export function resetPlan(plan) { plan.pos = {}; }

// ---- the answer ----
// { hireTargets?, hireSides?, positions? } to add to the Melee answer, and the reason the plan is not allowed (null when it is). Only what is still true of today's sections is sent.
export function extras(st, data, o, cb) {
    if (!inPlay(o)) return { extras: {}, error: null };
    const plan = planFor(st, data, o, cb), cards = cardsOf(st, data, plan), out = {};
    const targets = {}, sides = {}, positions = {};
    for (const card of cards) {
        if (card.chooses && plan.targets[card.ownerKey] && card.attackers.some(a => a.key === plan.targets[card.ownerKey])) targets[card.ownerKey] = plan.targets[card.ownerKey];
        const h = (st.combat.hires ?? []).find(x => x.uid === card.ownerKey);
        if (card.ownerKind === 'hire' && h && plan.sides[card.ownerKey] && plan.sides[card.ownerKey] !== h.side && card.sides.includes(plan.sides[card.ownerKey])) sides[card.ownerKey] = plan.sides[card.ownerKey];
        for (const zone of ['box', 'square', 'circle']) for (const col of card.cells[zone]) for (const chip of col) if (chip.editable && chip.key in plan.pos) positions[chip.key] = plan.pos[chip.key];
    }
    if (Object.keys(targets).length) out.hireTargets = targets;
    if (Object.keys(sides).length) out.hireSides = sides;
    if (Object.keys(positions).length) out.positions = positions;
    const bad = cards.find(c => c.error);
    return { extras: out, error: bad ? bad.error : null };
}

// ---- the Melee answer's check, the engine's own (so the screen and the rules cannot disagree) ----
export function engineCheck(st, data, ex) {
    if (!ex || !Object.keys(ex).length) return null;
    try { HF.checkPlay(st, data, ex); return null; } catch (e) { return e.message ?? String(e); }
}

// ---- words ----
export function titleOf(card) { return card.ownerKind === 'hire' ? `${card.ownerName} defends` : card.held ? `${card.ownerName} holds him` : `${card.ownerName} defends`; }
export function subOf(card) {
    const who = listOf(card.attackers.map(a => a.name));
    if (card.held) return `It has hold of ${who}: they fight alone`;
    if (card.ownerKind === 'hire') return `${who} ${card.attackers.length > 1 ? 'come' : 'comes'} at him`;
    return `${who} ${card.attackers.length > 1 ? 'go' : 'goes'} at it`;
}
export const laneName = (zone, dir) => (zone === 'box' ? BOX[dir] : zone === 'square' ? MNV[dir] : DIRS[dir]);
