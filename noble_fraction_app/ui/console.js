import { h } from './dom.js';
import { barLabel } from './labels.js';
import { actAttr } from './actions.js';

const STEPS = [['distill', 'DISTILL'], ['airwipe', 'INTAKE / PURGE'], ['buybid', 'BUY / BID'], ['cleanup', 'END']];
const STEP_OF = { overtimeBid: 'buybid' };

export function consoleBar(ctx) {
    const { s, idx } = ctx;
    const current = STEP_OF[s.turn.phase] ?? s.turn.phase;
    const overtime = s.turn.overtime;
    const steps = STEPS.filter(([key]) => !(overtime && key === 'airwipe'))
        .map(([key, label]) => h('span', { class: `step ${key === current ? 'on' : ''}` }, label));
    const buttons = idx.bar.map(a => h('button', { class: `btn ${a.type === 'finishTurn' ? 'primary' : ''}`,
        'data-act': actAttr(a), onclick: () => ctx.act(a) }, barLabel(a, s)));
    return h('nav', { id: 'console' }, h('div', { class: 'track' }, steps), h('div', { class: 'bar' }, buttons));
}
