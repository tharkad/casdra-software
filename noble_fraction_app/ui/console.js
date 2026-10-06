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

// A Purge that is not possible is still shown, dimmed, with the reason, so a missing choice is never a mystery.
function unavailablePurges({ s, idx }) {
    if (s.turn.phase !== 'airwipe' || idx.ppe.length) return [];
    return ['contract', 'upgrade'].filter(line => !idx.bar.some(a => a.type === 'wipe' && a.line === line && !a.ppe)).map((line, i) => {
        const cards = s.market[`${line}Line`];
        const why = cards.length === 0 ? 'none left' : 'every card has a Bid Token';
        return { rank: line === 'contract' ? 1 : 2, el: h('button', { class: 'btn', disabled: true, 'data-purge-unavailable': line, 'aria-disabled': 'true' },
            `PURGE ${line === 'contract' ? 'contracts' : 'upgrades'} — ${why}`) };
    });
}

export function consoleBar(ctx) {
    const { s, idx } = ctx;
    if (ctx.rivalTurn) {
        return h('nav', { id: 'console' }, h('div', { class: 'rival-banner', 'data-rival-banner': '' }, 'Rival is playing', h('span', { class: 'dots' })),
            ctx.busy ? h('button', { class: 'btn', 'data-skip': '', onclick: () => ctx.skip() }, 'Skip ▸▸') : null);
    }
    const steps = stepTrack(s).map(t => h('span', { class: `step ${t.on ? 'on' : ''}`, 'data-step': t.key }, t.label));
    const live = idx.bar.map(a => ({ rank: a.type === 'air' ? 0 : a.type === 'wipe' && !a.ppe ? (a.line === 'contract' ? 1 : 2) : a.type === 'wipe' ? 3 : 0,
        el: h('button', { class: `btn ${a.type === 'finishTurn' || a.type === 'play' || a.type === 'useInstalled' ? 'primary' : ''}`,
            'data-act': actAttr(a), onclick: () => ctx.act(a) }, barLabel(a, s)) }));
    return h('nav', { id: 'console' }, h('div', { class: 'track' }, steps), h('div', { class: 'bar' }, [...live, ...unavailablePurges(ctx)]
        .sort((x, y) => x.rank - y.rank).map(x => x.el)));
}
