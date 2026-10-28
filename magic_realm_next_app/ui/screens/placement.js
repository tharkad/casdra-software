// screens/placement.js: the six-step placement of the visitor, mission and campaign chits at setup (rules 3.4.1 to 3.4.4): choose a chit, choose which side is up, choose an empty box of Row 6 of the
// Appearance Chart; six times. A solo player places all six; "Place the rest at random" leaves what is not placed to chance (the engine does exactly that: newGame's missions.place).
// The sheet keeps its choices in g.missions = { on, place: [{ chit, face, box }] } and hands them to the game as `missions: { place }` (newgame.js start()).
import { h } from '../dom.js';
import { sheet } from '../ds.js';
import { nb, openSheet, sum } from '../front.js';
import { boxTitle, chartEl, chitEl, faceInfo, kindTag, nameOfFace, pairName } from '../missions.js';
import { facesOf, pairIds } from '../../engine/missions.js';

export const SIX = 6;
export const placedCount = g => g.missions?.place?.length ?? 0;
// the line on the new-game row that opens the placement
export function placementStatus(g) {
    const n = placedCount(g);
    return n === 0 ? 'Left to chance: the six chits go in the boxes at random.' : n >= SIX ? 'All six placed by you.' : `${n} of six placed by you; the rest go in at random.`;
}

// The chits as the engine will lay them down: { chit, face, box } -> the Row 6 view (loc.box) the chart draws
const asChits = place => place.map(p => ({ id: p.chit, face: p.face, loc: { box: p.box } }));

export function openPlacement(g, data, { onChange = () => {}, onClose = () => {} } = {}) {
    g.missions ??= { on: true, place: [] };
    const m = g.missions;
    let pick = { chit: null, face: null, box: null };
    let closeSheet = () => {};
    const frag = sheet({ eyebrow: 'Setting up', title: 'Place the six chits', detent: 'tall', onClose: () => { closeSheet(); onClose(); }, attrs: { 'data-sheet': 'placement' }, body: [], foot: [h('span')] });
    const bodyEl = frag.sheet.querySelector('.ds-sheet-body'), footEl = frag.sheet.querySelector('.ds-sheet-foot');
    const left = () => pairIds(data).filter(p => !m.place.some(x => x.chit === p));

    function fill() {
        const n = m.place.length, done = n >= SIX, scrollTop = bodyEl.scrollTop;
        const avail = left();
        if (pick.chit && !avail.includes(pick.chit)) pick = { chit: null, face: null, box: null };
        const usedBoxes = new Set(m.place.map(p => p.box));
        if (pick.box && usedBoxes.has(pick.box)) pick.box = null;
        const redraw = () => { fill(); };

        const dots = h('div', { class: 'ms-dots', role: 'img', 'aria-label': `${n} of ${SIX} chits placed` }, Array.from({ length: SIX }, (_, i) => h('i', { class: i < n ? 'done' : i === n ? 'now' : '' })));
        const ask = h('div', { class: 'ds-ask', 'data-step': String(Math.min(n + 1, SIX)) },
            h('b', {}, done ? 'All six are down.' : `Chit ${n + 1} of ${SIX}`),
            h('span', {}, done ? 'Here is Row 6 as you have set it. Take the last one back if you want to change it.'
                : 'Each chit has two sides, and either may be up. Choose the chit, the side that shows, and an empty box. The leader or site written beside a box is what calls its chit out.'),
            done ? null : h('span', { class: 'ms-rule', 'data-v': 'detail' }, 'Rules 3.4.1 to 3.4.4: the six chits go one at a time into the seven small boxes of Row 6, either side up, each into an empty box, until all six are placed.'));

        const parts = [dots, ask];
        if (!done) {
            // 1. which chit
            parts.push(h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, '1 · Which chit'), h('small', {}, `${avail.length} left`)));
            parts.push(h('div', { class: 'ds-list ms-chits', role: 'radiogroup', 'aria-label': 'Which chit' }, avail.map(pair => {
                const on = pick.chit === pair, faces = facesOf(data, pair);
                return h('button', { type: 'button', class: `ds-row ms-pick${on ? ' sel' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-chit': pair,
                    onclick: () => { pick = on ? { chit: null, face: null, box: null } : { chit: pair, face: null, box: pick.box }; redraw(); } },
                    h('span', { class: 'art2' }, chitEl(data, faces[0]), chitEl(data, faces[1], { cls: 'back' })),
                    h('span', { class: 'main' }, h('b', {}, nb(pairName(data, pair))), h('span', {}, 'One side up, the other underneath.')));
            })));
            // 2. which side
            parts.push(h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, '2 · Which side is up')));
            if (!pick.chit) parts.push(h('p', { class: 'ds-meta ms-hint' }, 'Choose a chit first.'));
            else {
                parts.push(h('div', { class: 'ds-list ms-sides', role: 'radiogroup', 'aria-label': 'Which side is up' }, facesOf(data, pick.chit).map(face => {
                    const on = pick.face === face, info = faceInfo(data, face);
                    return h('button', { type: 'button', class: `ds-row ms-pick${on ? ' sel' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-face': face, onclick: () => { pick.face = on ? null : face; redraw(); } },
                        h('span', { class: 'art2' }, chitEl(data, face)),
                        h('span', { class: 'main' }, h('b', {}, info.name, kindTag(data, face)), h('span', {}, info.line)));
                })));
            }
            // 3. which box
            parts.push(h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, '3 · Which box'), h('small', {}, `${SIX + 1 - n} empty`)));
        }
        parts.push(chartEl(data, asChits(m.place),
            done ? {} : { pick: { chosen: pick.box, onPick: id => { pick.box = pick.box === id ? null : id; redraw(); } } }));
        parts.push(h('div', { class: 'ms-extra' },
            n ? h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'place-undo', onclick: () => { const last = m.place.pop(); pick = { chit: last.chit, face: last.face, box: last.box }; onChange(); redraw(); } }, 'Take the last one back') : null,
            done ? null : h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'place-random', onclick: () => { closeSheet(); onClose(); } }, n ? 'Leave the rest to chance' : 'Leave it all to chance')));
        bodyEl.replaceChildren(...parts);
        bodyEl.scrollTop = scrollTop;

        // the foot: what stops the primary (a reason on screen), the rest-at-random way out, and the primary
        const need = !pick.chit ? 'Choose a chit.' : !pick.face ? 'Choose a side.' : !pick.box ? 'Choose a box.' : null;
        const put = () => { m.place.push({ chit: pick.chit, face: pick.face, box: pick.box }); pick = { chit: null, face: null, box: null }; onChange(); fill(); };
        if (done) {
            footEl.replaceChildren(sum('Placed by you.'), h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'place-done', onclick: () => { closeSheet(); onClose(); } }, 'Done'));
        } else {
            footEl.replaceChildren(
                need ? sum(h('b', { class: 'bad' }, need)) : sum(`${nameOfFace(data, pick.face)} up, in the ${boxName(data, pick.box)} box.`),
                h('button', { type: 'button', class: `ds-btn primary${need ? ' is-dim' : ''}`, 'data-act': 'place-it', 'aria-disabled': need ? 'true' : null, onclick: () => { if (!need) put(); } }, 'Place it'));
        }
    }
    fill();
    closeSheet = openSheet(frag);
    return () => closeSheet();
}
const boxName = (data, id) => boxTitle(data, id);
