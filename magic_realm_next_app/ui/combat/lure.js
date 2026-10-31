// combat/lure.js: the Lure step of a fight with several characters in one clearing (rule 8.3.4, engine/battle.js `combat-lure`), for EVERY screen that can show it: the shared table
// (screens/sharedfight.js) and a hot-seat party on one phone (screens/combat_scene.js, mode 'lure'). Each character in turn may take creatures onto his own sheet; a hidden one who does is seen
// at once (8.3.4b). This file builds the creatures on the stage (they are DRAWN: the lurable ones and the ones already on his sheet), the choices, and the words in both voices.
// The engine decides everything; the answer is `{ type: 'combat', kind: 'lure', dens: [uid, ...] }` (nothing drawn is `dens: []`).
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { btn, primary } from '../ds.js';
import { askBox } from '../shared_ui.js';
import { fightOf, whyNotLurable, joinList } from '../fight.js';
import { denSide } from '../../engine/combat.js';
import { foesPhrase, cap } from './model.js';
import { fixNames } from '../names.js';

const WORD = { N: 'Negligible', L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };

/** The picture of a creature for a list row. */
export function denPicture(data, d) {
    const a = data.art;
    if (d.kind === 'mon') { const nm = data.monsters[d.id]?.name; return a?.monstersColor?.[nm] ?? a?.monsters?.[nm] ?? null; }
    return a?.natives?.[d.id] ?? null;
}
const sheetBox = (...kids) => h('div', { class: 'cb-sheet sf-sheet sf-pick', 'data-kind': 'lure', 'data-ask-type': 'combat-lure' }, ...kids);
const footRow = (lead, prim) => h('div', { class: 'ds-actions' }, lead ? h('div', { class: 'lead' }, lead) : null, prim);

/** The creatures that stand on the stage at the Lure step: the ones already on his sheet first, then the ones he may draw. (battle den objects: the same fields a counter needs) */
export function lureDens(st, p) {
    const dens = st.battle?.dens ?? st.combat?.dens ?? [], by = new Map(dens.map(d => [d.uid, d]));
    const mine = (p.mine ?? []).map(u => by.get(u)).filter(d => d && !d.dead && d.kind !== 'part' && d.kind !== 'horse');
    const may = (p.lurable ?? []).map(o => by.get(o.uid) ?? { uid: o.uid, kind: 'mon', id: '', side: 'light' });
    return { mine, may };
}

/** Whose answer is this, in this round: a fresh choice for every character and every round (a hot seat passes the phone round). */
function selection(st, p, ui) {
    const key = `${st.ch.id}|${p.round}|${(p.lurable ?? []).map(o => o.uid).join(',')}`;
    if (ui.lureFor !== key) { ui.lureFor = key; ui.lureSel = []; }
    const sel = ui.lureSel ??= [];
    for (let i = sel.length - 1; i >= 0; i--) if (!p.lurable.some(o => o.uid === sel[i])) sel.splice(i, 1);
    return sel;
}
export const lureChosen = (st, p, ui) => selection(st, p, ui).slice();
export function toggleLure(st, p, ui, uid) {
    const sel = selection(st, p, ui), i = sel.indexOf(uid);
    if (i >= 0) sel.splice(i, 1); else sel.push(uid);
}

/** The creatures that circle, in a sentence ("An Ogre and two Wolves circle the clearing."). */
export function lureNarr(st, data, f) {
    const all = [...f.sheets.flatMap(s => s.dens), ...f.loose, ...f.held, ...f.standingBy], seen = new Set(), names = [];
    for (const d of all) if (!seen.has(d.uid)) { seen.add(d.uid); names.push(d.name); }
    // (QA-125: "an Ogre", never "a Ogre": the article follows the first letter, whatever the phrase builder wrote)
    const phrase = fixNames(cap(foesPhrase(names))).replace(/\b([Aa]) (?=[AEIOUaeiou])/g, '$1n ');
    return names.length ? `${phrase} circle${names.length === 1 && !/s$/.test(names[0]) ? 's' : ''} the clearing.` : 'The clearing is quiet.';
}

/** The narrator's two lines for a hot seat or a table: [story, detail]. A hidden character is told what drawing a creature costs him, and what he may still do after. */
export const lureWords = (st, data, p, f) => { const [story, detail] = lureTexts(st, data, p, f); return [h('span', { 'data-v': 'story' }, story), h('span', { 'data-v': 'detail' }, detail)]; };
export function lureTexts(st, data, p, f) {
    const circle = lureNarr(st, data, f), hidden = !!st.ch.hidden, natives = lureDens(st, p).may.some(d => d.kind === 'nat');
    const story = hidden
        ? `${circle} You are hidden: draw one and you are seen.`
        : `${circle} Draw one to fight it yourself.`;
    const detail = `Round ${p.round}, Lure (8.3.4): take any unhired creature onto your own sheet; the dice deal out the rest.${hidden ? ' A hidden character who lures is unhidden at once (8.3.4b); one who draws none stays hidden.' : ''}${natives ? ' Natives you draw bring their whole group (8.2.3a).' : ''}`;
    return [story, detail];
}

/** The sheet of the Lure question: one row for each creature he may draw (tap to choose), what cannot be drawn and why, and one primary button that says what happens. Returns { sheet, f }. */
export function lureSheet({ st, data, p, ui, render, act, f = null }) {
    f ??= fightOf(st, [], data, st.ch.id);
    const sel = selection(st, p, ui);
    const dens = st.battle?.dens ?? st.combat?.dens ?? [];
    const hidden = !!st.ch.hidden, byId = Object.fromEntries(f.members.map(m => [m.id, m]));
    const rows = p.lurable.map(o => {
        const d = dens.find(x => x.uid === o.uid) ?? { uid: o.uid, kind: 'mon', id: '', side: 'light' };
        let s = null; try { s = denSide(st, data, d); } catch { /* a name only */ }
        const on = sel.includes(o.uid), from = o.from ? byId[o.from] : null, pic = denPicture(data, d);
        const meaning = [from ? `On ${from.player}’s sheet: draw it away and it comes for you, not ${from.player}.` : null, d.kind === 'nat' ? 'A native: its whole group will fight you.' : null].filter(Boolean).join(' ') || null;
        const stat = s ? [s.attack === 'none' ? 'no attack' : s.attack === 'spell' ? 'casts' : `hits ${WORD[String(s.harm)[0]] ?? s.harm}${'*'.repeat(s.stars || 0)}`, s.atk != null && s.attack !== 'none' ? `speed ${s.atk}` : null, s.vuln ? `falls to ${WORD[s.vuln] ?? s.vuln}` : null].filter(Boolean).join(' · ') : '';
        return h('button', { type: 'button', class: `ds-row sf-lure${on ? ' on sel' : ''}`, role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'data-lure': o.uid, 'data-from': o.from ?? '',
            onclick: () => { toggleLure(st, p, ui, o.uid); render(); } },
            h('span', { class: 'art' }, pic ? h('img', { src: pic, alt: '' }) : null),
            h('span', { class: 'main sf-ltext' }, h('b', {}, o.name), stat ? h('span', {}, stat) : null, meaning ? h('span', { class: 'mean' }, meaning) : null),
            h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, on ? icon('check') : icon('plus')));
    });
    // what cannot be drawn, and the plain reason (shown muted, so nothing is offered that the rules forbid)
    const lurableIds = new Set(p.lurable.map(o => o.uid)), mineIds = new Set(p.mine ?? []);
    const cannot = [...f.held, ...f.standingBy, ...f.sheets.filter(s => !s.owner.mine).flatMap(s => s.dens).filter(d => !lurableIds.has(d.uid) && !mineIds.has(d.uid))].filter(d => !lurableIds.has(d.uid) && !mineIds.has(d.uid));
    const names = sel.map(u => p.lurable.find(o => o.uid === u)?.name).filter(Boolean), none = !sel.length;
    const scroll = h('div', { class: 'sf-scroll' },
        hidden ? h('p', { class: 'ds-hint-line bad', 'data-sf-hidden-lure': '' }, 'Drawing a creature gives you away. Draw none and you stay hidden; next you may strike from hiding or stay hidden.') : null,
        h('div', { class: 'ds-list sf-lures', role: 'group', 'aria-label': 'Creatures you may draw', 'data-sf-lures': '' }, ...rows),
        cannot.length ? h('p', { class: 'cb-hint sf-cannot', 'data-sf-cannot': '' }, `Not available: ${joinList([...new Set(cannot.map(d => `the ${d.name} (${whyNotLurable(d)})`))])}.`) : null);
    const lead = none ? null : btn(hidden ? 'Stay hidden' : 'Lure none', 'quiet', { 'data-act': 'lure-none', onclick: () => { ui.lureSel = []; render(); } });
    const go = primary(none ? (hidden ? 'Stay hidden' : 'Lure none') : `Draw ${names.length === 1 ? `the ${names[0]}` : `${names.length} creatures`}${hidden ? ' and be seen' : ''}`,
        { 'data-act': 'lure-go', 'data-count': String(sel.length), onclick: () => { const dens = sel.slice(); ui.lureSel = null; ui.lureFor = null; ui.melee = null; act({ type: 'combat', kind: 'lure', dens }); } });
    return { sheet: sheetBox(h('div', { class: 'sf-ask' }, askBox(`Round ${p.round}: draw any creature onto your sheet?`, 'One on your sheet attacks you alone, and what it pays is yours. The dice deal out whatever nobody draws.')), scroll, footRow(lead, go)), f };
}
