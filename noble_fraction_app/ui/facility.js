import { h } from './dom.js';
import { cardEl, xePips } from './card.js';
import { CARD_DEFS } from '../data/cards.js';
import { xeNeeded, towerOffer } from '../engine/contracts.js';
import { endCount } from '../engine/endgame.js';

// Says why the Xe needed is what it is when a Packed Tower is involved (its discount is once per turn).
function towerNote(s, p) {
    if (!p.contract || !p.installed.some(c => c.defId === 'packed_tower') || s.turn.phase === 'over') return null;
    const offer = towerOffer(s, p);
    if (offer) return h('small', { class: 'xe-note', 'data-tower-note': '' }, `Packed Tower can finish this with ${offer.cost} Xe`);
    const spent = s.turn.active === p.id && p.installed.some(c => c.defId === 'packed_tower' && s.turn.f.usedInstalled?.[c.uid]);
    return spent ? h('small', { class: 'xe-note' }, 'Packed Tower already used this turn') : null;
}

// A player's board: installed Upgrades, the open Contract and its stored Xe, Mains, completed
// Contracts. Used for both sides (only public information is shown for the Rival).
export function facilityPane(ctx, pid) {
    const { s, idx } = ctx;
    const p = s.players[pid];
    const need = p.contract ? (xeNeeded(s, p)?.cost ?? CARD_DEFS[p.contract.defId].xe) : 0;
    const group = (title, content, extra = '') => h('section', { class: `group ${extra}` }, h('h3', {}, title), content);
    const row = cards => h('div', { class: 'row' }, cards.map(c => cardEl(c, { act: idx.byUid.has(c.uid) })));
    return h('div', { class: `pane facility facility-${pid}`, 'data-facility': pid },
        group(`Installed (${p.installed.length}/${endCount(s)})`, p.installed.length ? row(p.installed) : h('p', { class: 'empty' }, 'none yet')),
        group('Contract', h('div', { class: 'contract' },
            p.contract ? row([p.contract]) : h('p', { class: 'empty' }, 'no open contract'),
            h('div', { class: 'xe', 'data-xe': pid }, `Xe stored ${p.storedXe}${p.contract ? ` / ${need}` : ''}`, xePips(p.storedXe, need), towerNote(s, p)))),
        group(`Done (${p.completed.length}/${endCount(s)})`, p.completed.length ? row(p.completed) : h('p', { class: 'empty' }, 'none')),
        p.pipelines.length ? group('Mains', row(p.pipelines)) : null,
        pid === 1 ? group('Rival', h('div', { class: 'stats' },
            h('span', {}, `Hand ${p.hand.length}`), h('span', {}, `Deck ${p.draw.length}`),
            h('span', {}, `Discard ${p.discard.length}`), h('span', {}, `Tokens ${p.tokensLeft}`))) : null);
}
