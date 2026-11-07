// chitpick.js: the chit choice of the campaign (rule 10.E.5.4: "He can choose which chit to take"; 10.E.6.3.1): cards for the chits he may take, one tap each, then one button.
// The same block is on the end screen of a run and on the Campaign screen (a choice left waiting, e.g. after a reload). It reads and writes the campaign record only.
import { h } from '../dom.js';
import { chitFacts } from './chitfacts.js';
import { chooseChits, pendingPool, saveRecord } from './campaign.js';

const stars = n => (n ? '*'.repeat(n) : '');

/** One chit as a card: the chit itself (as in the Kit), the kind in words, strength, time and the effort stars. */
export function chitCard(chit, { id = null, on = false, onclick = null } = {}) {
    const f = chitFacts(chit);
    const face = h('span', { class: `ds-chit ${f.type}`, 'aria-hidden': 'true' }, h('span', {}, f.label, f.stars ? h('sup', {}, stars(f.stars)) : null), h('small', {}, f.kind.toUpperCase()));
    const body = h('span', { class: 'main' }, h('b', {}, `${f.kind} ${f.label}${f.stars ? ' ' + stars(f.stars) : ''}`), h('span', {}, f.line));
    return onclick ? h('button', { type: 'button', class: `rl-chit${on ? ' on' : ''}`, role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'data-chit': id, onclick }, face, body, h('span', { class: 'rl-tick', 'aria-hidden': 'true' }))
        : h('div', { class: 'rl-chit', 'data-chit': id }, face, body);
}

/** The block for the choice waiting in `rec.pending` (null when there is none). `onDone(rec)` is called with the new record once he has chosen and it is saved. */
export function chitPick({ data, rec, onDone }) {
    const p = rec.pending;
    if (!p) return null;
    const pool = pendingPool(rec, data), chosen = new Set();
    const wrap = h('div', { class: 'rl-pick', 'data-pick': p.character });
    const say = h('p', { class: 'ds-why rl-picknote', role: 'status' });
    const take = h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'chit-take', disabled: true }, p.k === 1 ? 'Take this chit' : `Take these ${p.k} chits`);
    const cards = pool.map(c => {
        const el = chitCard(c.chit, { id: c.id, on: false, onclick: () => {
            if (chosen.has(c.id)) chosen.delete(c.id); else { if (chosen.size >= p.k) { if (p.k === 1) chosen.clear(); else return; } chosen.add(c.id); }
            for (const [id, node] of nodes) { const on = chosen.has(id); node.classList.toggle('on', on); node.setAttribute('aria-checked', on ? 'true' : 'false'); }
            take.disabled = chosen.size !== p.k;
            say.textContent = chosen.size === p.k ? '' : p.k === 1 ? 'Tap the chit you want.' : `Tap ${p.k - chosen.size} more.`;
        } });
        return [c.id, el];
    });
    const nodes = new Map(cards);
    take.addEventListener('click', () => {
        const r = chooseChits(rec, data, [...chosen]);
        if (r.error) { say.textContent = r.error; return; }
        saveRecord(r.rec);
        onDone(r.rec);
    });
    wrap.append(h('p', { class: 'ds-voice' }, p.k === 1 ? `Choose one of the three chits of stage ${p.stage}.` : `Choose ${p.k} of the chits of stage ${p.stage}.`),
        h('div', { class: 'rl-chits-pick', role: 'group', 'aria-label': 'Chits to choose from' }, ...nodes.values()), say, h('div', { class: 'rl-take' }, take));
    say.textContent = p.k === 1 ? 'Tap the chit you want.' : `Tap ${p.k} chits.`;
    return wrap;
}
