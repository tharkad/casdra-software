// combat/sections_review.js: the round's review of the Melee Sections (opened from the round's result): for each section, where every counter stood once the sections' dice had been rolled (`combat.sec.last`,
// the final places and sides, rules 8.4.6d, 8.4.8), what moved and what turned over, the dice that did it and the blows that were struck. Story is plain; Detail has the lines as the engine wrote them.
// Pure builders of DOM; nothing here decides a rule.
import { h } from '../dom.js';
import { die } from '../icons.js';
import { voiceSwitch, sheet as dsSheet, btn } from '../ds.js';
import { voiced } from '../commit.js';
import { storyRoll } from '../storyvoice.js';
import { counterBox, counterInfo } from './counters.js';
import { DIRS, MNV, BOX, listOf, nbTag } from './model.js';
import { sectionStory } from './sections_voice.js';

// the last round's sections, when the result on screen is about them (the fight has gone on to another round, or this round's blows have just been struck)
export function lastOf(st, resultType = null) {
    const c = st.combat, L = c?.sec?.last;
    if (!L?.sheets?.length) return null;
    const now = resultType === 'combat-wounds' || resultType === 'combat-fatigue' ? c.round : c.round - 1;
    return L.round === now ? L : null;
}
export const reviewAvailable = (st, resultType) => !!lastOf(st, resultType);

const unitOf = (info, key) => (info.role === 'horse' && info.hire ? info.hire.uid : info.role === 'horse' || info.role === 'part' ? info.ownerKey : key);
const LANE = { box: MNV, square: MNV, circle: DIRS };          // (a lane is named by its square or circle: the box is the same line as its Maneuver square, 8.4.8b)

// -> [{ id, owner, ownerName, held, cells: { circle|box|square: [[chip],[chip],[chip]] }, rolls: [roll], blows: [line] }]
export function reviewOf(st, data, last, events = []) {
    const c = st.combat;
    const turned = new Set(), blowRe = /^(.+?): (?:Thrust|Swing|Smash) at (.+?) \((?:Charge|Dodge|Duck)(?:, on the horse)?\): (?:hit by undercutting|hit|miss)\.$/;
    for (const e of events) { const m = /^Tactics change .*?: (.+?) switch(?:es)? sides\.$/.exec(String(e).trim()); if (m) m[1].split(/,\s*/).forEach(n => turned.add(n.trim())); }
    return last.sheets.map(s => {
        const raw = key => counterInfo(st, data, key).name, ownerName = raw(s.owner), cells = { box: [[], [], []], square: [[], [], []], circle: [[], [], []] };
        const names = new Set(Object.keys(s.pos).map(raw));
        for (const [key, dir] of Object.entries(s.pos)) {
            const info = counterInfo(st, data, key), unit = unitOf(info, key);
            const zone = unit === s.owner ? 'box' : unit === s.target ? 'square' : 'circle';
            const side = s.sides?.[key], was = s.start?.[key];
            cells[zone][dir]?.push({ key, name: nbTag(info.name), role: info.role, side, moved: was != null && was !== dir ? was : null, turned: turned.has(info.name), zone, dir });
        }
        const rolls = (st.rolls ?? []).filter(r => r.n > (c.roundRollFrom ?? 0) && (r.what ?? '').includes(`${ownerName}'s section`));
        const blows = events.map(e => String(e).trim()).filter(l => { const m = blowRe.exec(l); return m && names.has(m[1]) && [...names].some(n => m[2].includes(n)); });
        return { id: s.id, owner: s.owner, ownerName: nbTag(ownerName), ownerKind: s.ownerKind, held: !!s.held, target: s.target, attackers: s.attackers, cells, rolls, blows };
    });
}

function chipEl(st, data, chip) {
    const lane = LANE[chip.zone][chip.dir];
    const tags = [chip.moved != null ? h('small', { class: 'sx-moved', 'data-moved': '' }, `from ${LANE[chip.zone][chip.moved]}`) : null, chip.turned ? h('small', { class: 'sx-turned', 'data-turned-over': '' }, 'turned over') : null,
        !chip.turned && chip.side && chip.role !== 'horse' ? h('small', {}, `${chip.side} side`) : null];
    return h('div', { class: 'sx-chip fixed', 'data-counter': chip.key, 'aria-label': `${chip.name}: ended in the ${lane}${chip.moved != null ? `, moved from the ${LANE[chip.zone][chip.moved]}` : ''}${chip.turned ? ', turned over' : ''}` },
        chip.role === 'horse' ? null : counterBox(st, data, chip.key, 30, 'sx-mini'), h('span', { class: 'sx-name' }, chip.name, ...tags));
}

function sectionEl(st, data, rv) {
    const hireOwner = rv.ownerKind === 'hire';
    const rows = [['circle', `Strike ${hireOwner ? 'him' : 'it'}`], ['box', hireOwner ? 'His box' : 'Its box'], ['square', `${hireOwner ? 'He' : 'It'} strikes`]];
    const parts = [h('div', { class: 'sx-cols', 'aria-hidden': 'true' }, ...[0, 1, 2].map(i => h('span', {}, DIRS[i], h('small', {}, MNV[i]))))];
    for (const [zone, label] of rows) {
        if (!rv.cells[zone].some(col => col.length)) continue;
        parts.push(h('div', { class: 'sx-row', 'data-zone': zone }, h('p', { class: 'sx-lbl' }, label), h('div', { class: 'sx-cells' }, ...[0, 1, 2].map(i => h('div', { class: `sx-cell${rv.cells[zone][i].length ? '' : ' empty'}`, 'data-dir': i }, ...rv.cells[zone][i].map(ch => chipEl(st, data, ch)))))));
    }
    const dice = rv.rolls.map(r => h('div', { class: 'rv-roll', 'data-roll': r.n }, h('span', { class: 'rv-dice' }, ...(r.dice ?? []).map(d => die(d))),
        voiced({ story: storyRoll(r, st).line, detail: `${r.what}: ${(r.dice ?? []).join('+')}${r.result ? `, ${r.result}` : ''}.` }, { class: 'rv-t' })));
    const blows = rv.blows.map(l => h('p', { class: 'rv-blow', 'data-blow': '' }, voiced({ story: sectionStory(l) ?? l, detail: l })));
    return h('div', { class: 'rv-sec', 'data-sec': rv.id }, h('div', { class: 'rv-head' }, counterBox(st, data, rv.owner, 36), h('b', {}, `${rv.ownerName}'s section`)), ...parts, dice.length ? h('div', { class: 'rv-dice-list' }, ...dice) : null, blows.length ? h('div', { class: 'rv-blows' }, ...blows) : null);
}

// the sheet: opened by `cb.review`, closed by its x
export function reviewSheet(X) {
    const { st, data, cb, render, c } = X, last = lastOf(st, X.p.type) ?? c.sec?.last;
    if (!last) { cb.review = false; return null; }
    const secs = reviewOf(st, data, last, c.events ?? []);
    const body = [h('div', { style: 'display:flex;justify-content:flex-end;margin:0 0 8px' }, voiceSwitch()),
        h('p', { class: 'cb-hint' }, voiced({ story: 'Where everything stood when the blows fell, after the dice had moved the counters.', detail: `Round ${last.round}: the final places and sides after the sections' dice (8.4.6d). The blows fell where each counter stood (8.4.8).` })),
        h('div', { class: 'rv-list' }, ...secs.map(rv => sectionEl(st, data, rv)))];
    const frag = dsSheet({ eyebrow: 'Melee Sections', title: `Round ${last.round}`, detent: 'tall', onClose: () => { cb.review = false; render(); }, body });
    frag.sheet.classList.add('cb-record', 'rv-sheet');
    return frag;
}

// the quiet button on the result sheet
export function reviewButton(X) {
    const { st, cb, render, p } = X;
    if (!reviewAvailable(st, p.type)) return null;
    return btn('How the sections ended', 'quiet sm', { 'data-act': 'sections-review', onclick: () => { cb.review = true; render(); } });
}

