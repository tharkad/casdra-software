import { h } from './dom.js';
import { glyphEl } from './cardface.js';
import { LEVELS } from '../bot/levels.js';

const BLURBS = { easy: 'A relaxed Rival. Good for learning the plant.', normal: 'A solid, steady Rival.', hard: 'Tuned by thousands of self-play games. Bring your best.' };

// The first screen: title, difficulty, Play / Continue, and the way into Stats and the rules.
export function startScreen(ctx) {
    const saved = ctx.controller.savedGame();
    const last = ctx.profile?.games?.at(-1);
    return h('div', { class: 'start', 'data-screen': 'start' },
        h('div', { class: 'start-art' }, glyphEl('element_ring', 'glyph ring-big')),
        h('div', { class: 'start-main' },
            h('h1', {}, 'Noble ', h('span', {}, 'Fraction')),
            h('p', { class: 'tag' }, 'Run a cryogenic gas plant. Isolate the xenon. Beat the Rival.'),
            h('div', { class: 'levels-pick', role: 'radiogroup' }, LEVELS.map(l => h('button', {
                class: `level ${ctx.ui.level === l.id ? 'on' : ''}`, 'data-level': l.id, role: 'radio', 'aria-checked': ctx.ui.level === l.id,
                onclick: () => ctx.setUi({ level: l.id }) }, h('b', {}, l.label), h('small', {}, BLURBS[l.id])))),
            h('div', { class: 'start-actions' },
                h('button', { class: 'btn primary big', 'data-start': 'play', onclick: () => (saved ? ctx.setUi({ confirmNew: true }) : ctx.newGame(ctx.ui.level)) }, 'New game'),
                saved ? h('button', { class: 'btn big', 'data-start': 'continue', onclick: () => ctx.continueGame() },
                    `Continue · Turn ${saved.turn} · ${LEVELS.find(l => l.id === saved.level)?.label ?? ''}`) : null),
            h('div', { class: 'start-links' },
                h('button', { class: 'btn', 'data-open': 'stats', onclick: () => ctx.setUi({ stats: true }) }, 'Stats & achievements'),
                h('button', { class: 'btn', 'data-open': 'help', onclick: () => ctx.setUi({ help: true }) }, 'How to play')),
            last ? h('p', { class: 'last' }, `Last game: ${last.result === 'win' ? 'Won' : last.result === 'loss' ? 'Lost' : 'Tied'} ${last.myTotal}–${last.rivalTotal}`) : null));
}
