// endblock.js: what the end screen of a roguelike run adds (screens/play/endscreen.js): the campaign outcome in plain words, the chit to choose, and the way back to the campaign.
// The rule of 10.E.6 is applied to the campaign record ONCE per run (campaign.js applyRun is keyed by the game's session id), the moment the end screen is first drawn, so a reload or a second drawing
// cannot count a run twice; a chit still to choose waits in the record and is offered here and on the Campaign screen.
import { h } from '../dom.js';
import { sect } from '../ds.js';
import { apiOf } from '../../engine/api.js';
import { applyRun, chitsOwned, heroOf, loadRecord, resultOf, saveRecord, stageLabel } from './campaign.js';
import { chitPick } from './chitpick.js';

/** The roguelike tag of the game on this screen ({ character, runNo, stage, extra, days, vp }) or null. */
export const rlOf = G => G.rec?.params?.roguelike ?? null;          // (the game record keeps the parameters the game began with: the tag is in them)

/** Apply the finished run to the record (once) and return { id, outcome }. `again` is true when it had been applied before (a reload). `growth` is the hero's growth (view.me.growth) in a run of open
 * scoring: the chits taken during the run and the points gained decide the result (flourished / survived / fell) and go into the record and the History. */
export function settleRun(G, { dead, won, day, growth = null }) {
    const id = G.rec.id, rl = rlOf(G);
    if (G.ui.rlEnd?.id === id) return G.ui.rlEnd;
    const open = !!rl.open, earned = open ? [...(growth?.chits ?? [])] : [];
    const r = applyRun(loadRecord(), G.data, { id, character: rl.character, result: resultOf({ dead, won, open, earned: earned.length }), day, at: new Date().toISOString(), ...(open ? { earned, points: growth?.run ?? 0 } : {}) });
    if (!r.again) saveRecord(r.rec);
    return (G.ui.rlEnd = { id, outcome: r.outcome, again: !!r.again });
}

/** Is a chit of this run still to be chosen? */
export const waitingFor = (G, settled) => { const p = loadRecord().pending; return !!p && p.runId === settled.id; };

/** The campaign block: the outcome, the stage before and after, and the chit choice if he has one to make. `redraw()` draws the end screen again. */
export function campaignBlock(G, settled, redraw, growth = null) {
    const rl = rlOf(G), rec = loadRecord(), o = settled.outcome, hero = heroOf(rec, rl.character);
    const mine = o.to.stage === hero.stage ? chitsOwned(G.data, rl.character, hero).length : null;
    const pick = waitingFor(G, settled) ? chitPick({ data: G.data, rec, onDone: () => redraw() }) : null;
    return h('section', { class: 'rl-end', 'data-rl-end': o.kind, 'aria-label': 'The campaign' },
        sect(`Roguelike run ${rl.runNo}`, 'the campaign'),
        h('p', { class: 'ds-voice lg', 'data-outcome': o.kind }, o.text),
        growth ? h('p', { class: 'rl-line ds-meta', 'data-run-points': String(growth.run) }, `Points this run: ${growth.run}. Chits you earned during the run: ${growth.chits.length}.`) : null,
        h('p', { class: 'rl-stages', 'data-stages': '' }, ...(o.from.stage === o.to.stage ? [h('b', { class: 'ds-c-gold' }, stageLabel(o.to.stage))] : [h('span', {}, stageLabel(o.from.stage)), h('span', { 'aria-hidden': 'true' }, '→'), h('b', { class: 'ds-c-gold' }, stageLabel(o.to.stage))]),
            mine != null ? h('span', { class: 'ds-meta', 'data-chit-count': String(mine) }, `${mine} chits${pick ? ' so far' : ''}`) : null),
        pick);
}

/** A run that is left before it ends (a new game over it, the title's "Start a new game") counts as a fall: ending his own adventure is a death by 9.2.2a. `prev` is the saved state of that game. Once per run. */
export function settleAbandonedRun(prev, data) {
    try {
        const rl = prev.session?.params?.roguelike;
        if (!rl) return null;
        let earned = [], points = null;
        if (rl.open) { try { const g = apiOf(data).view(prev, prev.order?.[0] ?? null).me?.growth; earned = g?.chits ?? []; points = g?.run ?? null; } catch { /* a state the view cannot read: no chits are counted */ } }          // (the chits taken so far were taken: a fall loses them with the rest)
        const r = applyRun(loadRecord(), data, { id: prev.session.id, character: rl.character, result: 'fell', day: prev.day, at: new Date().toISOString(), ...(rl.open ? { earned, points } : {}) });
        if (!r.again) saveRecord(r.rec);
        return r.outcome;
    } catch { return null; }
}
