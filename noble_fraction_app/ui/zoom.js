import { h } from './dom.js';
import { CARD_DEFS, SECTORS } from '../data/cards.js';
import { cardFace } from './cardface.js';
import { findCard } from './find.js';
import { cardLabel } from './labels.js';
import { actAttr, actionGroup } from './actions.js';


function facts(d) {
    if (d.kind === 'contract') return `${SECTORS[d.sector].name} · needs Xe×${d.xe} · pays $${d.money} · ${d.vp} VP`;
    if (d.kind === 'pipeline') return `Main · costs $${d.buy} · hand size +1`;
    if (d.kind === 'element') return 'Element';
    const install = d.pink ? 'cannot be installed' : `install $${d.installDiff} later, $${d.installTotal} straight from the line`;
    return `${d.kind === 'starter' ? 'Starter' : `Upgrade · costs $${d.buy}`} · ${install}`;
}

// The zoom sheet: the card at full height on the left, what it does and the legal actions on the right.
export function zoomSheet(ctx) {
    const found = findCard(ctx.s, ctx.ui.zoom);
    if (!found) return null;
    const d = CARD_DEFS[found.card.defId];
    const actions = ctx.idx.byUid.get(found.card.uid) ?? [];
    // One button per distinct choice, counting the interchangeable cards behind it.
    const groups = new Map();
    actions.forEach(a => { const k = actionGroup(a, ctx.s); groups.set(k, [...(groups.get(k) ?? []), a]); });
    return h('div', { class: 'sheet zoom', 'data-sheet': 'zoom' },
        h('div', { class: 'card big' }, cardFace(d.id)),
        h('div', { class: 'info' },
            h('h2', {}, d.name), h('p', { class: 'facts' }, facts(d)),
            h('div', { class: 'acts' }, groups.size ? [...groups.entries()].map(([key, list]) => h('button', { class: 'btn primary', 'data-act': actAttr(list[0]), 'data-group': key,
                onclick: () => ctx.act(list[0]) }, cardLabel(list[0], ctx.s, list.length))) : h('p', { class: 'empty' }, 'Nothing you can do with this right now.')),
            h('button', { class: 'btn', 'data-close': '', onclick: () => ctx.setUi({ zoom: null }) }, 'Close')));
}
