import { h } from './dom.js';
import { statTiles, levelRecords } from '../profile/stats.js';
import { ACHIEVEMENTS } from '../profile/achievements.js';
import { glyphEl } from './cardface.js';
import { LEVELS } from '../bot/levels.js';
import { recordText, bundle } from './gamelogs.js';
import { deliverExport, lastSaved } from './exportlog.js';
import * as fx from './fx.js';

const levelLabel = id => LEVELS.find(l => l.id === id)?.label ?? id;
const lengthLabel = mode => (mode === 'overtime' ? 'Overtime' : 'Normal');

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

const flash = (btn, text, back) => { btn.textContent = text; setTimeout(() => { btn.textContent = back; }, 2200); };
const HOW = { share: 'Shared ✓', copy: 'Copied ✓', download: 'Saved ✓', file: 'Saved ✓' };

function history(data, ctx) {
    const stored = ctx.games?.all() ?? [];
    if (!data.games.length && !stored.length) return h('p', { class: 'empty' }, 'No finished games yet.');
    const when = g => (g.endedAt ? new Date(g.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
    return h('div', { class: 'history-wrap' },
        h('div', { class: 'history-tools' },
            h('span', { class: 'dim', 'data-log-count': '' }, `${stored.length} game log${stored.length === 1 ? '' : 's'} saved on this device`),
            stored.length ? h('button', { class: 'btn', 'data-save-all-logs': '', onclick: async e => {
                const how = await deliverExport(bundle(stored), `noble-fraction-games-${new Date().toISOString().slice(0, 10)}.json`, { prefer: 'file' });
                if (how === 'file') fx.toast(`Saved to ${lastSaved.path}`, 2);
                flash(e.currentTarget, HOW[how] ?? 'Done ✓', 'Save all logs');
            } }, 'Save all logs') : null),
        h('table', { class: 'level-table' }, h('thead', {}, h('tr', {}, ['Date', 'Result', 'Score', 'Level', 'Length', 'Turns', 'Log'].map(x => h('th', {}, x)))),
            h('tbody', {}, [...data.games].reverse().map(g => {
                const rec = ctx.games?.get(String(g.endedAt));
                return h('tr', { class: `res-${g.result}` }, h('td', {}, when(g)), h('td', {}, g.result === 'win' ? 'Won' : g.result === 'loss' ? 'Lost' : 'Tied'),
                    h('td', {}, `${g.myTotal}–${g.rivalTotal}`), h('td', {}, levelLabel(g.level)), h('td', {}, lengthLabel(g.mode)), h('td', {}, g.turns),
                    h('td', {}, rec ? h('button', { class: 'btn small', 'data-game-log': rec.id, onclick: async e => {
                        const how = await deliverExport(recordText(rec), `noble-fraction-game-${rec.id}.txt`);
                        flash(e.currentTarget, HOW[how] ?? 'Done ✓', 'Log');
                    } }, 'Log') : '–'));
            }))));
}

export function statsSheet(ctx) {
    const data = ctx.profile.data();
    const body = { overview, achievements, history }[ctx.ui.statsTab ?? 'overview'](data, ctx);
    return h('div', { class: 'sheet stats', 'data-sheet': 'stats' },
        h('div', { class: 'help-head' }, h('h2', {}, 'Stats'), h('button', { class: 'btn primary', 'data-close': '', onclick: () => ctx.setUi({ stats: false }) }, 'Close')),
        h('div', { class: 'tabs-row' }, TABS.map(([k, label]) => h('button', { class: `btn ${(ctx.ui.statsTab ?? 'overview') === k ? 'current' : ''}`, 'data-stats-tab': k, onclick: () => ctx.setUi({ statsTab: k }) }, label))),
        h('div', { class: 'stats-body' }, body));
}
