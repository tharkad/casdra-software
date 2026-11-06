// legal.js: `legal(state, viewer)` for the questions of a fight (CONTRACT section 5, Phase 3 slice 1). It WRAPS the option functions the screens called themselves until now (encounterOptions, meleeOptions,
// shiftOptions, legalBoxPlan, makeChangeOptions, hirefight.askOptions): the same functions, called here once, so that a screen renders what this returns and works nothing out (bug notes 76 to 79).
// It returns two views of one answer, made from the same call, so they cannot disagree:
//   answers  the contract's list (legal.schema.json): each way to answer, as an action template (every field present is fixed) and `pick` (what the viewer still chooses), with `disabled` (a reason code
//            and numbers, never a sentence) for a way that is shown but not allowed now;
//   options  the engine's own option record for the question, as JSON, for the screens that draw it as it is today (the functions in it become lists: `fightOk`, `moveOk` -> `fightOkIds`, `moveOkIds`).
//            It still holds the sentences of the old `why` fields until the voice layer exists (PHASE3.md "Contract questions").
// Everything is computed on a COPY of the state, as the viewer: nothing here changes the caller's state.
import { clone } from './core.js';
import { withActor } from './party.js';
import { encounterOptions, meleeOptions, shiftOptions, makeChangeOptions } from './combat.js';
import { askOptions } from './hirefight.js';
import { denSide } from './combat.js';
import { siteLeft, sitesHere } from './search.js';
import { tradeFacts, TRADE_QUESTIONS } from './tradefacts.js';
import { takeable } from './missions.js';

export const COMBAT_QUESTIONS = ['combat-pay', 'combat-drinks', 'combat-choice', 'combat-encounter', 'combat-melee', 'combat-shift', 'combat-wounds', 'combat-fatigue', 'combat-over', 'combat-lure', 'combat-charge', 'combat-deploy'];

const plain = o => JSON.parse(JSON.stringify(o ?? null));
// A list of creatures of an option record, each with its stats as the rules read them now (`stat`, as in view.me.fight.dens), so a screen never asks for "the side of a denizen"
const withStats = (st, data, list) => (list ?? []).map(d => { let stat = null; try { stat = plain(denSide(st, data, d)); } catch { /* a counter the rules have no sides for */ } return { ...d, stat }; });
const ids = (of, list) => ({ ids: of, of: list });
const DIRS3 = { enum: [0, 1, 2] };
const entry = (action, extra = {}) => ({ action: { type: 'combat', ...action }, ...extra });
const off = (e, reason) => (reason ? { ...e, disabled: reason } : e);
const uids = l => (l ?? []).map(x => x.uid);
const chitIds = l => (l ?? []).map(x => x.id);

/** The combat questions' options for one character: { question, answers, free, options } (all JSON). `st` is a private copy hydrated for `who`. */
function combatOf(st, data, who, p) {
    const out = { answers: [], free: [], options: null };
    const q = p.type;
    switch (q) {
        case 'combat-pay': {
            const cost = { [p.cost]: p.amount };
            out.answers.push(entry({ kind: 'pay', pay: true }, { cost, preview: { group: p.group, why: p.why } }), entry({ kind: 'pay', pay: false }, { preview: { group: p.group, why: p.why } }));
            break;
        }
        case 'combat-drinks':
            out.answers.push(entry({ kind: 'drinks', buy: true }, { cost: { gold: p.cost }, preview: { group: p.group } }), entry({ kind: 'drinks', buy: false }, { preview: { group: p.group } }));
            break;
        case 'combat-choice':
            out.answers.push(entry({ kind: 'choice', fight: true }, { preview: { groups: p.groups } }), entry({ kind: 'choice', fight: false }, { preview: { groups: p.groups } }));
            break;
        case 'combat-encounter': {
            const o = encounterOptions(st, data), wc = o.whyCode ?? {};
            if (o.canStay) out.answers.push(entry({ kind: 'encounter', act: 'stay' }));
            if (o.canLure) out.answers.push(entry({ kind: 'encounter', act: 'lure' }));
            for (const c of o.casts) out.answers.push(entry({ kind: 'encounter', act: 'cast', spell: c.spell, ...(c.item ? { item: c.item } : { chit: c.chit }) }, { pick: { spellAim: { free: true } }, preview: { spell: c.spell } }));
            for (const b of o.blocked ?? []) out.answers.push(entry({ kind: 'encounter', act: 'cast', spell: b.spell }, { disabled: { code: 'cast.not-offered', params: { spell: b.spell, reason: b.whyCode } } }));
            for (const h of o.held ?? []) out.answers.push(entry({ kind: 'encounter', act: 'protect', fx: h.fx ?? h.id }, { preview: { spell: h.spell } }));
            out.answers.push(entry({ kind: 'encounter', act: 'gear' }, { pick: { item: ids('items', uids(st.ch.items.filter(i => !i.destroyed))), items: { list: ids('items', uids(st.ch.items)) }, drop: { bool: true } } }));
            out.answers.push(off(entry({ kind: 'encounter', act: 'alert' }, { pick: { chit: ids('chits', chitIds(o.alertChits)) } }), o.canAlert ? null : wc.alert ?? { code: 'alert.not-offered' }));
            if (o.berserkChits?.length) out.answers.push(entry({ kind: 'encounter', act: 'berserk' }, { pick: { chit: ids('chits', chitIds(o.berserkChits)) } }));
            out.answers.push(off(entry({ kind: 'encounter', act: 'run' }, { pick: { chit: ids('chits', chitIds(o.runChits)), to: ids('clearings', o.runTo) } }), o.canRun ? null : o.pickedUp ? { code: 'run.held' } : wc.run ?? { code: 'run.not-offered' }));
            if (o.canFly) out.answers.push(entry({ kind: 'encounter', act: 'fly' }, { pick: { chit: ids('chits', chitIds(o.flyChits)), to: ids('tiles', o.flyTiles) } }));
            out.answers.push(entry({ kind: 'encounter', act: 'pass' }));
            for (const e of o.energize ?? []) out.free.push({ action: { type: 'energize', fx: e.fx ?? e.id }, pick: { colorChit: ids('chits', chitIds(e.chits ?? [])) } });
            const { why, ...optRest } = o;          // (the sentences of `why.alert` / `why.run` stay in the engine; the options carry their codes, `whyCode`, and the numbers of the gate)
            out.options = plain({ ...optRest, why: { gate: why.gate, chargeGate: why.chargeGate } });
            break;
        }
        case 'combat-melee': {
            const o = meleeOptions(st, data);
            const fightOkIds = o.fightChits.filter(x => o.fightOk(x)).map(x => x.id), moveOkIds = o.moveChits.filter(x => o.moveOk(x)).map(x => x.id);
            const { fightOk, moveOk, ...rest } = o;
            const targets = [...o.targets, ...o.controlled];
            out.answers.push(entry({ kind: 'melee' }, {
                pick: { target: { enum: [null, ...uids(targets)] }, fightChit: { enum: [null, ...fightOkIds] }, attackDir: DIRS3, moveChit: { enum: [null, ...moveOkIds, ...chitIds(o.duckChits)] }, moveDir: DIRS3, ...(o.shield ? { shieldDir: DIRS3 } : {}),
                    boxes: { record: Object.fromEntries(uids([...o.boxable, ...o.horses]).map(u => [u, { int: { min: 0, max: 2 } }])) }, spellAim: { free: true } },
                preview: { effortLimit: o.effortLimit, asterisksPlayed: o.asterisksPlayed },
            }));
            if (st.combat.casts?.length && !p.aimed && !st.combat.shared) out.answers.push(entry({ kind: 'aim' }, { pick: { spellAim: { free: true } } }));
            out.options = plain({ ...rest, targets: withStats(st, data, o.targets), assigned: withStats(st, data, o.assigned), controlled: withStats(st, data, o.controlled), boxable: withStats(st, data, o.boxable), fightOkIds, moveOkIds });
            break;
        }
        case 'combat-shift': {
            const o = shiftOptions(st, data);
            out.answers.push(entry({ kind: 'shift' }, { pick: { attackDir: DIRS3, moveDir: DIRS3 } }), entry({ kind: 'shift' }));
            out.options = plain(o);
            break;
        }
        case 'combat-wounds':
            out.answers.push(entry({ kind: 'wounds' }, { pick: { chits: { list: ids('chits', p.chits), min: p.count, max: p.count } } }));
            break;
        case 'combat-fatigue': {
            // making change (4.2.4a, 8.5.1a): which chit may come back depends on WHICH chits are tired, so every selection that pays more than it owes is answered here, by the chits chosen (sorted, joined by "+")
            const change = {}, pool = p.chits;
            for (let m = 1; m < 1 << Math.min(pool.length, 10); m++) {
                const sel = pool.slice(0, 10).filter((_, i) => m >> i & 1);
                let opts = [];
                try { opts = makeChangeOptions(st, data, sel); } catch { opts = []; }
                if (opts.length) change[[...sel].sort().join('+')] = chitIds(opts);
            }
            out.answers.push(entry({ kind: 'fatigue' }, { pick: { chits: { list: ids('chits', p.chits), min: 0, max: p.chits.length }, change: ids('chits', [...new Set(Object.values(change).flat())]) }, preview: { need: p.need } }));
            out.options = { makeChange: change };
            break;
        }
        case 'combat-over':
            out.answers.push(entry({ kind: 'over' }));
            break;
        case 'combat-lure':
            out.answers.push(entry({ kind: 'lure' }, { pick: { dens: { list: ids('dens', (p.lurable ?? []).map(d => d.uid ?? d)) } } }));
            break;
        case 'combat-charge':
            try { out.options = plain(encounterOptions(st, data)); } catch { out.options = null; }          // (what holds his chits back: why.chargeGate, pickedUp)
            out.answers.push(entry({ kind: 'charge', act: 'charge' }, { pick: { chit: ids('chits', chitIds(p.chits ?? p.chargeChits ?? [])), target: ids('chars', (p.targets ?? []).map(t => t.id ?? t)) } }), entry({ kind: 'charge', act: 'pass' }), ...(p.peace ? [entry({ kind: 'charge', act: 'peace' })] : []));
            break;
        case 'combat-deploy': {
            const a = askOptions(st, data);
            out.answers.push(entry({ kind: 'deploy' }, { pick: { deploy: { free: true } } }), entry({ kind: 'deploy', auto: true }));
            out.options = plain(a);
            break;
        }
        default: break;
    }
    return out;
}

// ---- the questions that finish a phase: Rest, the Search tables and their results, the price of a site, Enchant, Reading Runes, a spell offered (Phase 3 slice 2, first step) ----
// Each is a plain list of options in the question already (a Rest option is a chit, a table is a name ...): `legal` turns every option into an action template. `options` is the question's own record.
export const PHASE_QUESTIONS = ['rest', 'search-table', 'search-choice', 'effort-cost', 'enchant-choice', 'runes-target', 'learn-spell', 'phase', 'phase-pick', 'turn-end', 'evening-end', 'phase-gear'];
function choicePreview(state, data, who, result) {
    const st = clone(state);
    return withActor(st, who, () => ({ sites: /Discover chits/.test(result) ? siteLeft(st, st.ch.at) : 0 }));
}
function lootSitesOf(state, who) {
    const st = clone(state);
    return withActor(st, who, () => sitesHere(st)).map(c => ({ id: c.id, name: c.name }));
}
// The mission and campaign chits lying in his clearing that he may take at the start of a phase (7.2.4), each a free `take-chit`: its cost, what it is (`preview`), and, when he may not take it now, why (`disabled`:
// the engine's sentence rides in `params.text` until the voice layer writes the words).
function takeChits(state, data, who) {
    const st = clone(state);
    return withActor(st, who, () => takeable(st, data)).map(t => ({
        action: { type: 'take-chit', chit: t.chit }, cost: { fame: t.cost.fame, notoriety: t.cost.notoriety }, preview: { face: t.face, name: t.name, kind: t.kind },
        ...(t.ok ? {} : { disabled: { code: 'take.refused', params: { text: t.why } } }),
    }));
}
const turn = (type, fields = {}, extra = {}) => ({ action: { type, ...fields }, ...extra });
function phaseOf(p, state, data, who) {
    const out = { answers: [], free: [], options: plain(p) }, os = p.options ?? [];
    switch (p.type) {
        case 'rest': out.answers = os.map(o => turn('rest', { chit: o.chit, ...(o.change != null ? { change: o.change } : {}) }, { preview: { chit: o.chit, from: o.from, to: o.to, cost: o.cost } })); break;
        case 'search-table': {          // 7.5.5b: with two or more discovered sites in the clearing the Loot table is one answer per site (he names the site before the roll); with one it needs no name
            const sites = os.includes('loot') ? lootSitesOf(state, who) : [];
            out.answers = os.flatMap(t => t === 'loot' && sites.length > 1 ? sites.map(c => turn('search-table', { table: 'loot', site: c.id }, { preview: { site: c.id, name: c.name } })) : [turn('search-table', { table: t })]);
            break;
        }
        case 'search-choice': out.answers = os.map(r => turn('search-choice', { result: r }, { preview: choicePreview(state, data, who, r) })); break;          // (what a reading would show him that he does not know yet: a reading that shows nothing is greyed)
        case 'effort-cost': out.answers = os.map((o, n) => turn('effort-cost', { n }, { preview: { chits: o.chits, cost: o.cost } })); break;
        case 'enchant-choice': out.answers = os.map(o => turn('enchant-choice', { chit: o.chit, kind: o.kind ?? 'chit' }, { preview: { tile: o.tile, color: o.color } })); break;
        case 'runes-target': out.answers = os.map(o => turn('runes-target', { target: o.key })); break;
        case 'phase': out.answers = [turn('next', {}, { pick: { all: { bool: true } } })]; break;          // run the phase that is next in the plan; `all` goes on through the rest of the day's plan
        case 'phase-pick': out.answers = [turn('next', {}, { pick: { all: { bool: true } } }), turn('pick', {}, { pick: { slot: { record: { act: { enum: p.acts ?? [] }, to: { free: true }, table: { enum: p.tables ?? [] } } }, all: { bool: true } } })]; break;          // Prophecy: follow the suggestion, or pick the phase
        case 'turn-end': case 'evening-end': case 'phase-gear': out.answers = [turn('continue')]; break;
        case 'learn-spell': out.answers = [turn('learn-spell', { learn: true }, { pick: p.full ? { erase: { free: true } } : {} }), turn('learn-spell', { learn: false })]; break;
        default: break;
    }
    if (p.type === 'evening-end') out.free.push({ action: { type: 'suicide' } });          // (8.9.4: a character may suicide at Midnight; the end of his evening is where the day ends for him)
    if (p.type === 'phase-gear' && p.mounts?.length) out.answers = [turn('continue', {}, { disabled: { code: 'gear.too-heavy', rule: '7.3.2a' } })];          // (7.3.2a, 7.3.1f.1: the horse or Boots that cannot bear what he came by must come off, or the new belonging be left, first)
    if (state.missions && (p.type === 'phase' || p.type === 'phase-pick')) out.free.push(...takeChits(state, data, who));          // (7.2.4: "each time a character starts a phase of his turn"; the engine takes `take-chit` at these two questions only)
    return out;
}

/** The legal record of `who` for a fight question; null when his question is not one of the twelve. @returns {{ answers: object[], free: object[], options: object|null }|null} */
export function legalCombat(state, data, who) {
    const st = clone(state);
    if (!st.chars?.[who]) return null;
    return withActor(st, who, () => {
        const p = st.pending;
        if (!p || !COMBAT_QUESTIONS.includes(p.type)) return null;
        return combatOf(st, data, who, p);
    });
}

/** `legal(state, viewer)` (legal.schema.json): the viewer's question and every way to answer it. `pending` is his question as `view` has it (null when he has none or is a spectator).
 * Built so far for the twelve combat questions (`covered: true`); another question comes back with `covered: false` and no answers until its slice lands (CONTRACT section 11). */
export function legalFor(state, viewer, data, pending) {
    const waiting = state.asks.filter(a => a.who !== viewer).map(a => ({ who: a.who }));
    const base = { for: viewer ?? '', question: pending, answers: [], free: [], waiting };
    if (!viewer || !pending) return { ...base, covered: true };
    if (TRADE_QUESTIONS.includes(pending.type)) {          // (the answers of a meeting are not listed yet: the facts the sheet needs are; `covered` stays false)
        const st = clone(state);
        const options = withActor(st, viewer, () => plain(tradeFacts(st, data, st.pending)));
        return { ...base, options, covered: false };
    }
    const c = COMBAT_QUESTIONS.includes(pending.type) ? legalCombat(state, data, viewer) : PHASE_QUESTIONS.includes(pending.type) ? phaseOf(pending, state, data, viewer) : null;
    return c ? { ...base, answers: c.answers, free: c.free, options: c.options, covered: true } : { ...base, covered: false };
}
