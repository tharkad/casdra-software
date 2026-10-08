import { h } from './dom.js';
import { glyphEl } from './cardface.js';
import { LEVELS } from '../bot/levels.js';
import { CREDIT_SHORT } from './credits.js';

const MODES = [['normal', 'Normal', 'The game ends at 5 contracts or 5 upgrades.'], ['overtime', 'Overtime', 'A long game: it takes 10 contracts or 10 upgrades.']];
const BLURBS = { easy: 'A relaxed Rival. Good for learning the plant.', normal: 'A solid, steady Rival.', hard: 'Tuned by thousands of self-play games. Bring your best.', expert: 'A neural network that plans ahead. Takes a moment to think.' };

// The first screen: title, difficulty, Play / Continue, and the way into Stats and the rules.
export function startScreen(ctx) {
    const saved = ctx.controller.savedGame();
    const last = ctx.profile?.games?.at(-1);
    return h('div', { class: 'start', 'data-screen': 'start' },
        h('div', { class: 'start-art' }, glyphEl('element_ring', 'glyph ring-big')),
        h('div', { class: 'start-main' },
            h('h1', {}, 'Noble ', h('span', {}, 'Fraction')),
            h('p', { class: 'tag' }, 'Run a cryogenic gas plant. Isolate the xenon. Beat the Rival.'),
            h('div', { class: 'levels-pick mode-pick', role: 'radiogroup', 'aria-label': 'Game length' }, MODES.map(([id, label, blurb]) => h('button', {
                class: `level ${ctx.ui.mode === id ? 'on' : ''}`, 'data-mode': id, role: 'radio', 'aria-checked': ctx.ui.mode === id,
                onclick: () => ctx.setUi({ mode: id }) }, h('b', {}, `Game length: ${label}`), h('small', {}, blurb)))),
            h('div', { class: 'levels-pick', role: 'radiogroup' }, LEVELS.map(l => h('button', {
                class: `level ${ctx.ui.level === l.id ? 'on' : ''}`, 'data-level': l.id, role: 'radio', 'aria-checked': ctx.ui.level === l.id,
                onclick: () => ctx.setUi({ level: l.id }) }, h('b', {}, l.label), h('small', {}, BLURBS[l.id])))),
            h('div', { class: 'start-actions' },
                h('button', { class: 'btn primary big', 'data-start': 'play', onclick: () => (saved ? ctx.setUi({ confirmNew: true }) : ctx.newGame(ctx.ui.level, ctx.ui.mode)) }, 'New game'),
                saved ? h('button', { class: 'btn big', 'data-start': 'continue', onclick: () => ctx.continueGame() },
                    `Continue · Turn ${saved.turn} · ${LEVELS.find(l => l.id === saved.level)?.label ?? ''}${saved.mode === 'overtime' ? ' · Overtime' : ''}`) : null),
            h('div', { class: 'start-links' },
                h('button', { class: 'btn', 'data-open': 'stats', onclick: () => ctx.setUi({ stats: true }) }, 'Stats & achievements'),
                h('button', { class: 'btn', 'data-open': 'help', onclick: () => ctx.setUi({ help: true }) }, 'How to play'),
                window.nobleFractionShell?.quit ? h('button', { class: 'btn', 'data-open': 'quit', onclick: () => window.nobleFractionShell.quit() }, 'Quit') : null),     // only inside the desktop shell
            last ? h('p', { class: 'last' }, `Last game: ${last.result === 'win' ? 'Won' : last.result === 'loss' ? 'Lost' : 'Tied'} ${last.myTotal}–${last.rivalTotal}`) : null,
            h('p', { class: 'credit', 'data-credit': '' }, CREDIT_SHORT)));
}
