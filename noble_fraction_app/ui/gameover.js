import { h } from './dom.js';
import { newGameButtons } from './menu.js';
import { achievementById } from '../profile/achievements.js';

const PARTS = [['contracts', 'Contracts'], ['upgrades', 'Upgrades'], ['pipelines', 'Mains'], ['money', 'Money'], ['bonuses', 'Bonuses'], ['privilege', 'Founder\'s Seal']];

export function gameOverSheet(ctx) {
    const w = ctx.controller.winner();
    // Level on points: the game was decided by the Xe still in each System (fewest wins), so say so and point at that row.
    const tiedOnPoints = w.scores[0].total === w.scores[1].total;
    const headline = w.tie ? 'A tie!' : tiedOnPoints ? (w.winnerId === 0 ? 'You win the tiebreak!' : 'The Rival wins the tiebreak')
        : w.winnerId === 0 ? 'You win!' : 'The Rival wins';
    const xe = w.scores.map(sc => sc.xeInSystem);
    const side = tiedOnPoints ? h('td', { class: 'tbcol' }) : null;                          // (a 4th column only on a tiebreak)
    const table = h('table', { class: tiedOnPoints ? 'tiebreak' : '' }, h('thead', {}, h('tr', {}, h('th'), h('th', {}, 'You'), h('th', {}, 'Rival'), tiedOnPoints ? h('th', { class: 'tbcol' }) : null)),
        h('tbody', {}, PARTS.map(([key, label]) => h('tr', {}, h('td', {}, label), h('td', {}, w.scores[0].parts[key]), h('td', {}, w.scores[1].parts[key]), side ? h('td', { class: 'tbcol' }) : null)),
            h('tr', { class: `total ${tiedOnPoints ? 'tied' : ''}` }, h('td', {}, 'Total'), h('td', {}, w.scores[0].total), h('td', {}, w.scores[1].total), side ? h('td', { class: 'tbcol' }) : null),
            h('tr', { class: tiedOnPoints ? 'xe-row' : '', 'data-xe-row': '' },
                h('td', {}, tiedOnPoints ? 'Xe left in your deck' : 'Xe left in deck'),
                h('td', { class: tiedOnPoints && xe[0] < xe[1] ? 'fewer' : '' }, xe[0]),
                h('td', { class: tiedOnPoints && xe[1] < xe[0] ? 'fewer' : '' }, xe[1]),
                tiedOnPoints ? h('td', { class: 'tbcol tb-label', 'data-tiebreaker': '' }, 'Tiebreaker') : null)));
    return h('div', { class: 'sheet gameover', 'data-sheet': 'gameover' },
        h('h2', {}, headline),
        tiedOnPoints ? h('p', { class: 'tie-sub', 'data-tie-sub': '' }, w.tie ? `Level on ${w.scores[0].total} points and on Xe` : `Tied at ${w.scores[0].total} points`) : null,
        table,
        ctx.ui.gameAch.length ? h('div', { class: 'new-ach', 'data-new-ach': '' }, h('h3', {}, `Achievements earned this game (${ctx.ui.gameAch.length})`),
            h('ul', {}, ctx.ui.gameAch.map(id => h('li', {}, `🏆 ${achievementById(id)?.name ?? id} — ${achievementById(id)?.text ?? ''}`)))) : null,
        newGameButtons(ctx),
        h('button', { class: 'btn', 'data-open': 'mainmenu', onclick: () => ctx.mainMenu() }, 'Main menu'));
}
