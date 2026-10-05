import { h } from './dom.js';
import { statTiles, levelRecords } from '../profile/stats.js';
import { ACHIEVEMENTS } from '../profile/achievements.js';
import { glyphEl } from './cardface.js';

const TABS = [['overview', 'Overview'], ['achievements', 'Achievements'], ['history', 'History']];

function overview(data) {
    const tiles = statTiles(data.lifetime);
    const levels = levelRecords(data.lifetime);
    return h('div', { class: 'stats-overview' },
        h('div', { class: 'tiles' }, tiles.map(t => h('div', { class: 'tile', 'data-stat': t.id }, h('b', {}, String(t.value)), h('span', {}, t.label)))),
        h('table', { class: 'level-table' }, h('thead', {}, h('tr', {}, ['Level', 'Played', 'Won', 'Win rate'].map(x => h('th', {}, x)))),
            h('tbody', {}, levels.map(l => h('tr', {}, h('td', {}, l.label), h('td', {}, l.played), h('td', {}, l.wins), h('td', {}, l.played ? `${Math.round(l.rate * 100)}%` : '—'))))));
}

function achievements(data) {
    const earned = ACHIEVEMENTS.filter(a => data.unlocked[a.id]).length;
    return h('div', { class: 'ach-wrap' }, h('p', { class: 'dim ach-count' }, `${earned} of ${ACHIEVEMENTS.length} earned`),
        h('div', { class: 'ach-grid' }, ACHIEVEMENTS.map(a => h('div', { class: `ach ${data.unlocked[a.id] ? 'got' : 'locked'}`, 'data-ach': a.id },
            glyphEl(a.glyph, 'glyph ach-icon'), h('div', {}, h('b', {}, a.name), h('small', {}, a.text))))));
}

function history(data) {
    if (!data.games.length) return h('p', { class: 'empty' }, 'No finished games yet.');
    return h('table', { class: 'level-table' }, h('thead', {}, h('tr', {}, ['Result', 'Score', 'Level', 'Turns'].map(x => h('th', {}, x)))),
        h('tbody', {}, [...data.games].reverse().map(g => h('tr', { class: `res-${g.result}` }, h('td', {}, g.result === 'win' ? 'Won' : g.result === 'loss' ? 'Lost' : 'Tied'),
            h('td', {}, `${g.myTotal}–${g.rivalTotal}`), h('td', {}, g.level), h('td', {}, g.turns)))));
}

export function statsSheet(ctx) {
    const data = ctx.profile.data();
    const body = { overview, achievements, history }[ctx.ui.statsTab ?? 'overview'](data);
    return h('div', { class: 'sheet stats', 'data-sheet': 'stats' },
        h('div', { class: 'help-head' }, h('h2', {}, 'Stats'), h('button', { class: 'btn primary', 'data-close': '', onclick: () => ctx.setUi({ stats: false }) }, 'Close')),
        h('div', { class: 'tabs-row' }, TABS.map(([k, label]) => h('button', { class: `btn ${(ctx.ui.statsTab ?? 'overview') === k ? 'current' : ''}`, 'data-stats-tab': k, onclick: () => ctx.setUi({ statsTab: k }) }, label))),
        h('div', { class: 'stats-body' }, body));
}
