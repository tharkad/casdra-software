import { h } from './dom.js';
import { barLabel } from './labels.js';
import { actAttr } from './actions.js';

const NORMAL = [['distill', 'DISTILL'], ['airwipe', 'INTAKE / PURGE'], ['buybid', 'BUY / BID'], ['cleanup', 'END']];
// A Night Shift turn is DISTILL, two BID steps (no BUY), END.
const NIGHT = [['distill', 'DISTILL'], ['bid1', 'BID'], ['bid2', 'BID'], ['cleanup', 'END']];

// The turn's step track with the current step marked. `s` is the game state.
export function stepTrack(s) {
    const { phase, overtime, f } = s.turn;
    if (!overtime) return NORMAL.map(([key, label]) => ({ key, label, on: key === (phase === 'overtimeBid' ? 'buybid' : phase) }));
    const current = phase === 'overtimeBid' ? (f.stepsLeft === 2 ? 'bid1' : 'bid2') : phase;
    return NIGHT.map(([key, label]) => ({ key, label, on: key === current }));
}

export function consoleBar(ctx) {
    const { s, idx } = ctx;
    if (ctx.rivalTurn) {
        return h('nav', { id: 'console' }, h('div', { class: 'rival-banner', 'data-rival-banner': '' }, 'Rival is playing', h('span', { class: 'dots' })),
            ctx.busy ? h('button', { class: 'btn', 'data-skip': '', onclick: () => ctx.skip() }, 'Skip ▸▸') : null);
    }
    const steps = stepTrack(s).map(t => h('span', { class: `step ${t.on ? 'on' : ''}`, 'data-step': t.key }, t.label));
    const buttons = idx.bar.map(a => h('button', { class: `btn ${a.type === 'finishTurn' || a.type === 'play' || a.type === 'useInstalled' ? 'primary' : ''}`,
        'data-act': actAttr(a), onclick: () => ctx.act(a) }, barLabel(a, s)));
    return h('nav', { id: 'console' }, h('div', { class: 'track' }, steps), h('div', { class: 'bar' }, buttons));
}
