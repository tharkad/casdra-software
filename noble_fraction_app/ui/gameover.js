import { h } from './dom.js';
import { newGameButtons } from './menu.js';

const PARTS = [['contracts', 'Contracts'], ['upgrades', 'Upgrades'], ['pipelines', 'Mains'], ['money', 'Money'], ['bonuses', 'Bonuses'], ['privilege', 'Founder\'s Seal']];

export function gameOverSheet(ctx) {
    const w = ctx.controller.winner();
    const headline = w.tie ? 'A tie!' : w.winnerId === 0 ? 'You win!' : 'The Rival wins';
    const table = h('table', {}, h('thead', {}, h('tr', {}, h('th'), h('th', {}, 'You'), h('th', {}, 'Rival'))),
        h('tbody', {}, PARTS.map(([key, label]) => h('tr', {}, h('td', {}, label), h('td', {}, w.scores[0].parts[key]), h('td', {}, w.scores[1].parts[key]))),
            h('tr', { class: 'total' }, h('td', {}, 'Total'), h('td', {}, w.scores[0].total), h('td', {}, w.scores[1].total)),
            h('tr', {}, h('td', {}, 'Xe left in deck'), h('td', {}, w.scores[0].xeInSystem), h('td', {}, w.scores[1].xeInSystem))));
    return h('div', { class: 'sheet gameover', 'data-sheet': 'gameover' },
        h('h2', {}, headline), table,
        newGameButtons(ctx));
}
