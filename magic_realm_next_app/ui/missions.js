// missions.js: the shared pieces of the mission, campaign and visitor chit screens (the new-game placement, Row 6 of the Appearance Chart, the map markers, the Take buttons, the Chits tab of the Kit,
// the notices). Rules: 2.2.5, 3.4, 6.3.4b, 7.2.4, 7.13.5; the engine is app/engine/missions.js (docs/rules-spec/missions-notes.md). Nothing here changes the game: it reads `st.missions`, `ch.missions` and the
// engine's helpers (takeable, carriedTasks, whyNot, visitorsAt) and builds DOM.
import { boxDef, boxIds, defOf, facesOf, kindOf, otherFace, pairIds, relation } from '../engine/missions.js';
import { h } from './dom.js';
import { logText } from './voice.js';

export const KIND_WORD = { visitor: 'Visitor', mission: 'Mission', campaign: 'Campaign' };
export const nameOfFace = (data, face) => defOf(data, face)?.name ?? face;
export const kindOfFace = (data, face) => kindOf(data, face);
export const pairName = (data, pair) => facesOf(data, pair).map(f => nameOfFace(data, f)).join(' / ');
const dot = t => String(t).replace(/ (?=\S+$)/, ' ');

// "8 Fame", "10 Notoriety", "10 Fame and 15 Notoriety" (the engine's own order); "free" when the chit costs nothing
export function costText(c) {
    const parts = [c?.fame && `${c.fame} Fame`, c?.notoriety && `${c.notoriety} Notoriety`].filter(Boolean);
    return parts.length ? parts.join(' and ') : 'nothing';
}
const defCost = def => ({ fame: def?.fameCost ?? 0, notoriety: def?.notorietyCost ?? 0 });
const list = a => (a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
// "Dragon" and "Flying Dragon" read as "the Dragons"
const foeWords = foes => list(foes.map(f => (/Dragon$/.test(f) ? `${f}s` : f)));

// What one face of a chit is, in plain words: { name, kind, kindWord, cost, line }
export function faceInfo(data, face) {
    const def = defOf(data, face), kind = kindOf(data, face);
    if (!def) return { name: face, kind: null, kindWord: '', cost: null, line: '' };
    const cost = defCost(def);
    let line = '';
    if (kind === 'visitor') line = 'A visitor. It stays where it appears and never moves.';
    else if (kind === 'mission') { const [a, b] = face === 'food_ale' ? ['Inn', 'House'] : ['Chapel', 'Guard house']; line = `Costs ${costText(cost)}. Carry it to the ${a} (or the ${b}, if you took it at the ${a}) within ${def.timeLimit} days.`; }
    else line = `Costs ${costText(cost)}. Kill every ${foeWords(def.foes)} within ${def.timeLimit} days.${def.partners.length ? ` ${foeWords(def.partners)} grow friendlier while you carry it.` : ''}`;
    return { name: def.name, kind, kindWord: KIND_WORD[kind], cost, line };
}

// How a native group stands with him for the screens that show a mood: his own level, except that a foe of the campaign he carries is always an Enemy (7.2.4h), and partners (who stand two
// levels higher in ch.rel, past Ally) read as Ally. Without the option this is exactly ch.rel.
export function standing(st, group) {
    const r = st.ch.rel?.[group] ?? 0;
    return st.missions ? Math.max(-2, Math.min(2, relation(st, group, r))) : r;
}

// ---- the chit as a counter: a round token whose edge says the kind (and a word always beside it, never colour alone) ----
const GLYPH = { scholar: 'Sc', shaman: 'Sh', warlock: 'Wa', crone: 'Cr', escort_party: 'Es', food_ale: 'Fo', pillage: 'Pi', raid: 'Ra', conquer: 'Cn', war: 'Wr', revolt: 'Re', quest: 'Qu' };
export function chitEl(data, face, { dim = false, cls = '' } = {}) {
    const kind = kindOf(data, face) ?? 'visitor';
    return h('span', { class: `ms-chit ${kind}${dim ? ' dim' : ''}${cls ? ` ${cls}` : ''}`, 'data-chit-face': face, 'aria-hidden': 'true' }, GLYPH[face] ?? face.slice(0, 2));
}
export const emptyChitEl = () => h('span', { class: 'ms-chit empty', 'aria-hidden': 'true' });
export const kindTag = (data, face) => { const k = kindOf(data, face); return h('span', { class: `ds-tag ms-kind ${k}` }, KIND_WORD[k] ?? ''); };

// ---- the seven small boxes of Row 6 (3.4.3, 7.13.5): who calls the chit of each ----
export function boxTitle(data, id) {
    const b = boxDef(data, id), s = b?.summonedBy ?? [];
    if (s.some(x => x.leaderOf)) return `${s[0].leaderOf} leader`;
    return list(s.map(x => x.site).filter(Boolean)).replace(' and ', ' or ');
}
export function boxCalls(data, id) {
    const s = boxDef(data, id)?.summonedBy ?? [];
    if (s.some(x => x.leaderOf)) return `Comes out when someone ends a turn with the ${s[0].leaderOf} leader.`;
    return `Comes out when someone ends a turn at ${list(s.map(x => x.site).filter(Boolean)).replace(' and ', ' or ')}.`;
}
// Row 6 as the engine has it: [{ id, title, calls, chit: { id, face } | null }] in the chart's order
export function row6(data, chits) {
    return boxIds(data).map(id => ({ id, title: boxTitle(data, id), calls: boxCalls(data, id), chit: (chits ?? []).find(c => c.loc?.box === id) ?? null }));
}

// A drawing of Row 6: the seven boxes, each with its chit face up (or empty). `pick`: { chosen, onPick(id), taken: Set } makes the empty boxes choosable (the placement screen).
export function chartEl(data, chits, { pick = null, cls = '' } = {}) {
    const rows = row6(data, chits);
    return h('div', { class: `ms-chart${cls ? ` ${cls}` : ''}`, 'data-chart': 'row6', role: pick ? 'radiogroup' : 'list', 'aria-label': 'Row 6 of the Appearance Chart: the seven small boxes' },
        rows.map(r => {
            const full = !!r.chit, face = r.chit?.face, info = full ? faceInfo(data, face) : null, on = pick?.chosen === r.id;
            const body = [full ? chitEl(data, face) : emptyChitEl(),
                h('span', { class: 'main' }, h('b', {}, r.title), h('span', {}, r.calls)),
                h('span', { class: 'end' }, full ? [h('b', {}, info.name), h('small', {}, info.kindWord)] : h('small', {}, pick ? (on ? 'chosen' : 'empty') : 'empty'))];
            if (pick && !full) return h('button', { type: 'button', class: `ds-row ms-box${on ? ' sel' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-box': r.id, onclick: () => pick.onPick(r.id) }, ...body);
            return h('div', { class: `ds-row ms-box${full ? ' full' : ''}${pick && full ? ' dim' : ''}`, role: 'listitem', 'data-box': r.id, 'data-full': full ? face : null }, ...body);
        }));
}

// ---- why a chit cannot be taken (or given up) now, in both voices: Detail is the engine's own words with the rule number, Story the same fact said plainly ----
const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
export function whyCopy(why) {
    const detail = `${cap(String(why ?? '').trim()).replace(/\.$/, '')}.`;
    let m, story = null;
    if ((m = /^you cannot pay the (.+?) chit's cost of (.+?) \(/.exec(why))) story = `You do not have the ${m[2]} the ${m[1]} chit costs.`;
    else if ((m = /^none of the (.+?) chit's foes is on the map/.exec(why))) story = `None of the ${m[1]} chit's foes is on the map, so there is nothing to fight.`;
    else if (/Fame or Notoriety is negative/.test(why)) story = 'Your Fame or Notoriety is below zero: you cannot take a chit.';
    else if (/only one campaign chit/.test(why)) story = 'You carry a campaign already: only one at a time.';
    else if (/not in your clearing/.test(why)) story = `${cap(String(why).replace(/\s*\(\d[\d.a-z]*\)\.?$/, ''))}.`;
    else if (/still on the map/.test(why)) story = 'A foe of this campaign is still on the map: you cannot give it up yet.';
    else if (/mission chit cannot be given up/.test(why)) story = 'A mission cannot be given up: keep it until it is done or the time runs out.';
    return { story: story ?? `${cap(String(why ?? '').replace(/\s*\(\d[\d.a-z]*\)\.?$/, '').trim())}.`, detail };
}

// ---- where a chit lies, in words ----
export function whereWords(st, data, c) {
    if (c.loc?.box) return `in the box of the ${boxTitle(data, c.loc.box)}`;
    if (c.loc?.by) return `carried by ${st.chars?.[c.loc.by]?.name ?? 'a character'}`;
    if (c.loc?.c) return `in clearing ${c.loc.c.slice(2)}`;
    return '';
}

// ---- the map's markers: one token for each chit lying in a clearing (public: it lies face up) ----
// a visitor shows its name, a mission or campaign its name and cost (the engine's helpers say which)
export function mapTokens(st, data) {
    const out = [];
    for (const c of st.missions?.chits ?? []) {
        if (!c.loc?.c) continue;
        const kind = kindOf(data, c.face), def = defOf(data, c.face);
        if (kind === 'visitor') out.push({ at: c.loc.c, k: 'visit', label: def.name });
        else out.push({ at: c.loc.c, k: 'task', label: `${def.name} \u00B7 ${[def.fameCost && `${def.fameCost} Fame`, def.notorietyCost && `${def.notorietyCost} Notor.`].filter(Boolean).join(', ')}` });
    }
    return out;
}

// ---- the notices: lines the engine logs that deserve a card of their own ----
// -> { kind: 'flip'|'appear'|'delivered'|'won'|'failed'|'putdown', title, text } or null; the text is the log line in the voice the player chose
const NOTICES = [
    [/^The visitor, mission and campaign chits that nobody carries turn over\.?$/, 'flip', 'The chits turn over'],
    [/^A .+ chit appears in clearing \d+\.?$/, 'appear', 'A chit appears'],
    [/^You bring the .+ chit to the .+?\. /, 'delivered', 'Delivered'],
    [/^Your campaign is won: /, 'won', 'Campaign won'],
    [/^(?:The time limit of the .+ chit runs out|The game ends (?:for you )?with the task undone)\. /, 'failed', 'Task failed'],
    [/^The .+ chit is put down where you fell\.?$/, 'putdown', 'A chit put down'],
];
export function noticeOf(entry, st = null) {
    const t = String(entry?.t ?? '');
    for (const [re, kind, title] of NOTICES) if (re.test(t)) return { kind, title, text: logText(entry, st), day: entry.day };
    return null;
}
// the notices in the log from index `from` on (the caller keeps where it has read to)
export function noticesFrom(st, from) {
    const log = st.log ?? [], out = [];
    for (let i = Math.max(0, from); i < log.length; i++) { const n = noticeOf(log[i], st); if (n) out.push(n); }
    return out;
}

export { boxIds, facesOf, kindOf, otherFace, pairIds, defOf, dot };
