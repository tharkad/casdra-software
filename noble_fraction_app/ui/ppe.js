import { h } from './dom.js';
import { cardEl } from './card.js';
import { actAttr } from './actions.js';

// Shift Engineer: six cards were drawn for the purged line; pick which ones to keep.
export function ppePicker(ctx) {
    const { s, idx, ui } = ctx;
    if (!idx.ppe.length) return null;
    const { drawn, slots, line } = s.turn.f.ppe;
    const need = Math.min(slots, drawn.length);
    const chosen = ui.ppeSel.filter(uid => drawn.some(c => c.uid === uid));
    const match = idx.ppe.find(a => a.uids.length === chosen.length && a.uids.every(u => chosen.includes(u)));
    const toggle = uid => ctx.setUi({ ppeSel: chosen.includes(uid) ? chosen.filter(u => u !== uid) : [...chosen, uid].slice(-need) });
    return h('div', { class: 'sheet ppe', 'data-sheet': 'purgeDraw' },
        h('h2', {}, `Keep ${need} for the ${line} line (${chosen.length}/${need})`),
        h('div', { class: 'row' }, drawn.map(c => h('div', { class: `pick ${chosen.includes(c.uid) ? 'on' : ''}`, 'data-pick': c.uid, 'data-focusable': '', role: 'button', onclick: () => toggle(c.uid) },
            cardEl(c, { classes: 'nozoom' })))),
        h('button', { class: 'btn primary', disabled: match ? false : true, 'data-act': match ? actAttr(match) : null,
            onclick: () => match && ctx.act(match) }, 'Confirm'));
}
