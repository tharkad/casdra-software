// play/growth.js: growth during a run (open scoring, rules 10.E.5.4 and 10.E.6.10; the engine's side is app/engine/growth.js). Everything here reads `view.me.growth` and nothing else of the game:
//   growthLine(G)        the small Growth line on the Kit: "Points this run 2 · 1 more for a chit" (tap: the Growth sheet)
//   growthSheet(G, gr)   the sheet the strip's chip and the line open (it replaces the goals sheet in a game without goals): what counts, how far along, and the chit to choose when one is earned
//   growthCards(G, o)    the chit choice as a CARD in the tray (and on the end screen): three chits, one tap to pick, one button to take (its label names the chit). It is part of the tray, not a sheet and not a modal, and it
//                        never stops the map or the day: the engine does not ask a question, the choice just waits (growth.js: a standing choice).
//   growthWatch(G)       a quiet toast when points have been earned since the last drawing; the strip chip is set in shell.js from `chipOf`.
// Words are plain game words and speak to "you".
import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { ask } from '../../ask.js';
import { chitFace } from '../../roguelike/chitpick.js';
import { chitFacts } from '../../roguelike/chitfacts.js';
import { gameOf, growthOf } from '../../combat/feed.js';
import { act } from './actions.js';
import { modal, showToast } from './kit.js';
import { render } from './shell.js';

const KIND = { great: 'Great Treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
const HOW = {
    great: 'Each Great Treasure you carry is a point.',
    spells: 'Every 2 spells you have learned is a point.',
    fame: 'Every 10 Fame is a point: yours and what the things you carry add. Below zero it counts against you.',
    notoriety: 'Every 20 Notoriety is a point: yours and what the things you carry add. Below zero it counts against you.',
    gold: 'Every 30 Gold above your starting worth is a point.',
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const stageWord = s => `stage ${s}`;

/** The growth of the hero on screen, or null (a game with goals, a race, a table). */
export const growthNow = G => (G.st && !G.race && !G.shared ? growthOf(G.st, G.data) : null);

/** The state of growth in plain words: "Points this run 2 · 1 more for a chit". */
export function growthWords(gr) {
    if (gr.choice) return 'You earned a chit: choose it';
    const run = `Points this run ${gr.run}`;
    if (gr.top) return `${run} · you have every chit`;
    if (gr.owed > 0) return `${run} · win back ${plural(gr.owed, 'lost point')} first`;
    return `${run} · ${gr.togo} more for a chit`;
}

/** What the strip's chip says: the points toward the next chit ("1/3"), or "Chit" when one is waiting. */
export const chipOf = gr => (gr.choice ? { label: 'GROWTH', value: 'Chit!', ready: true } : { label: 'GROWTH', value: gr.top ? String(gr.run) : `${gr.credit}/${gr.cost}`, ready: false });

/** The small line on the Kit: one tap to see what counts. */
export function growthLine(G) {
    const gr = growthNow(G);
    if (!gr) return null;
    return h('button', { type: 'button', class: `gr-line${gr.choice ? ' ready' : ''}`, 'data-growth-line': gr.choice ? 'ready' : '', 'aria-label': `Growth. ${growthWords(gr)}. Tap to see what counts`, onclick: () => { G.ui.sheet = 'score'; render(G); } },
        h('span', { class: 'gr-ico', 'aria-hidden': 'true' }, icon('spark')), h('span', { class: 'main' }, h('b', {}, 'Growth'), h('span', {}, growthWords(gr))), h('span', { class: 'gr-more', 'aria-hidden': 'true' }, icon('right')));
}

// ---- the chit choice ----
const pickOf = (G, gr) => (gr.choice.options.some(o => o.id === G.ui.growthPick) ? G.ui.growthPick : null);
function take(G, id, after = null) {
    G.ui.growthPick = null;
    act(G, { type: 'chit', chit: id });
    after?.();
}

/** The card: [] with no chit to choose. `o.end` is the end screen (a chit earned by the last move of the run; the words say so). */
export function growthCards(G, o = {}) {
    const gr = growthNow(G);
    if (!gr?.choice) return [];
    if (!o.end && !o.sheet && gameOf(G.st, G.data).period === 'over') return [];          // (the game is over: the end screen offers the chit, not the tray under it)
    const c = gr.choice, sel = pickOf(G, gr), chosen = c.options.find(x => x.id === sel);
    const opts = c.options.map(x => {
        const f = chitFacts(x.chit), on = x.id === sel;
        return h('button', { type: 'button', class: `gr-opt${on ? ' on' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', 'aria-label': f.line, 'data-chit': x.id,
            onclick: () => { G.ui.growthPick = on ? null : x.id; render(G); } }, chitFace(x.chit, f));
    });
    const f = chosen ? chitFacts(chosen.chit) : null;
    return [h('section', { class: 'gr-card', 'data-growth-card': String(c.options.length), 'aria-label': 'You earned a chit' },
        h('div', { class: 'gr-head' }, h('b', {}, 'You earned a chit'),
            h('span', { class: 'gr-say', role: 'status' }, f ? f.line : o.end ? `The last moments of the run earned it. Pick one of ${stageWord(c.stage)}.` : `Pick one of ${stageWord(c.stage)}. You can use it at once.`)),
        h('div', { class: 'gr-opts', role: 'radiogroup', 'aria-label': 'Chits to choose from' }, ...opts),
        h('button', { type: 'button', class: 'ds-btn gr-take', 'data-act': 'growth-take', disabled: chosen ? null : true, onclick: () => take(G, sel) }, f ? `Take the ${f.kind} ${f.label}` : 'Pick a chit'))];
}

// ---- the sheet ----
export function growthSheet(G, gr) {
    const close = () => { G.ui.sheet = null; render(G); };
    const pct = gr.top ? 100 : Math.round(100 * Math.min(1, gr.credit / gr.cost));
    const head = gr.choice ? ask('You earned a chit.', `Choose one of the chits of ${stageWord(gr.choice.stage)} below. You can use it at once.`)
        : gr.top ? ask(`Points this run: ${gr.run}.`, `A hero of stage 4 has every chit. The points still count in your History.`)
            : ask(`Points this run: ${gr.run}.`, `${plural(gr.togo, 'more point')} for a chit. A chit costs ${plural(gr.cost, 'point')}: as many as your stage (${gr.stage}).`);
    const rows = gr.kinds.map(k => h('div', { class: 'sr-part gr-kind', 'data-kind': k.cat }, h('span', {}, h('b', {}, KIND[k.cat]), h('small', {}, `${HOW[k.cat]} You have ${k.have}.`)), h('b', { class: k.points < 0 ? 'neg' : k.points > 0 ? 'pos' : '' }, k.points > 0 ? `+${k.points}` : String(k.points).replace('-', '−'))));
    return modal(G, 'Growth', h('div', { class: 'scoresheet growthsheet', 'data-growth-sheet': '' },
        head,
        gr.top ? null : h('div', { class: 'goalbar gr-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': gr.cost, 'aria-valuenow': gr.credit, 'aria-label': 'Points toward the next chit' }, h('i', { style: `width:${pct}%` })),
        gr.owed > 0 ? h('p', { class: 'hint bad', 'data-owed': String(gr.owed) }, `You lost ${plural(gr.owed, 'point')}. Win ${gr.owed === 1 ? 'it' : 'them'} back before you gain more toward a chit.`) : null,
        ...growthCards(G, { sheet: true }),
        h('div', { class: 'scorerow2' }, h('div', { class: 'sr-head' }, h('b', {}, 'What counts'), h('span', {}, `${gr.net >= 0 ? '+' : '−'}${Math.abs(gr.net)} now`)), ...rows),
        h('div', { class: 'scorerow2' }, h('div', { class: 'sr-head' }, h('b', {}, 'How it works')),
            h('p', { class: 'hint' }, `Points of every kind count. Each time you gain ${plural(gr.cost ?? gr.stage, 'point')} you take a chit of the next stage, your pick, and you can use it at once. Three chits complete a stage.`),
            h('p', { class: 'hint' }, 'If you lose points (you spend gold, give a treasure away, or your Fame falls) you must win them back before you gain more. A treasure handed away and handed back counts once.'),
            h('p', { class: 'hint' }, 'The run ends on its last day. If you survive having earned a chit, you rise a stage. If you fall, you lose three chits.'))),
        { close });
}

// ---- the quiet toast ----
/** Called when the strip is drawn: points earned since the last drawing are told once, quietly. The first drawing only notes where things stand. */
export function growthWatch(G) {
    const gr = growthNow(G);
    if (!gr) return;
    const seen = G.ui.growthSeen;
    G.ui.growthSeen = { run: gr.run, chits: gr.chits.length };
    if (!seen || gr.run <= seen.run) return;
    if (gr.choice) return;          // (a chit is waiting: the card and the chip say so)
    const d = gr.run - seen.run, text = `+${plural(d, 'point')}${gr.top ? '' : ` · ${gr.togo} more for a chit`}`;
    setTimeout(() => { if (G.root.isConnected && !G.ui.toast) showToast(G, text, false, 2600); }, 0);
}
