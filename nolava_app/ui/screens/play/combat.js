// play/combat.js: the combat host: puts the fight screens (the combat scene for a solo fight, sharedfight.js for a shared one, on the same chrome) on the sheet layer, with the map one tap away
// ("Back to the fight") and the belongings sheets that may cover the fight and be put away again.
import { h } from '../../dom.js';
import { combatScene, combatBeat } from '../combat_scene.js';
import { sharedFightSheet } from '../sharedfight.js';
import { act } from './actions.js';
import { render } from './shell.js';
import { openPiece } from './piece_card.js';
import { lookSheet } from './looks.js';
import { clearingSheet } from './sheet_clearing.js';
import { playersSheet } from './shared.js';
import { fightModel } from '../../combat/feed.js';
import { endOfFight } from '../../voice/fight.js';
import { partyRecapScreen } from '../../combat/partyrecap.js';

// A shared fight. Returns true when it filled `out` (the caller returns it as it is), false when there is no fight screen for this seat after all.
export function sharedFightHost(G, out) {
    if (G.ui.combatMap) {
        if (G.ui.sheet === 'clearing' && G.ui.sel) out.push(clearingSheet(G));
        out.push(h('div', { class: 'cb-back combat-back' }, h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'back-to-fight', onclick: () => { G.ui.combatMap = false; render(G); } }, 'Back to the fight')));
        return true;
    }
    const sheet = sharedFightSheet({ st: G.st, data: G.data, act: act.bind(null, G), ui: G.ui, render: () => render(G), crew: G.crew, answer: G.answer, peek: { gear: () => { G.ui.sheet = 'char'; render(G); }, map: () => { G.ui.combatMap = true; G.ui.sheet = null; render(G); } } });
    if (sheet) {
        out.push(sheet);
        if (G.ui.sheet === 'players') out.push(playersSheet(G));
        else { const look = lookSheet(G); if (look) out.push(look); }
        return true;
    }
    return false;
}

// The beat after the last blow of a solo fight that the engine does not stop on: a death (the scene stays up one moment, then the results take over) or a win or a stand-off with no result screen of its own.
// Called by sheets() before it decides there is no fight; sets G.ui.cbBeat.how when the beat is due. The scene remembers the round before the last blow (combat_scene.js, sendMelee).
export function fightBeat(G) {
    const b = G.ui.cbBeat;
    if (!b) return false;
    const fm = fightModel(G.st, G.data);
    if (G.shared || fm.combat || fm.day !== b.day) { if (!fm.combat) G.ui.cbBeat = null; return false; }
    if (fm.over?.reason === 'died' && fm.ch.dead !== false) { b.how = 'died'; return true; }
    const how = endOfFight(fm, b.logLen);          // (the voice layer: 'won', or 'quiet' when both sides drew back and the fight ended with no kill and no result screen: note 62)
    if (how) { b.how = how; return true; }
    G.ui.cbBeat = null;
    return false;
}

// A solo fight (the pending question is one of the combat steps, or the beat that follows the last of them).
export function combatHost(G, out) {
    // The fight can be set aside to look at the map, or covered by the belongings sheets, and then picked up again.
    if (G.ui.combatMap) {
        if (G.ui.sheet === 'clearing' && G.ui.sel) out.push(clearingSheet(G));
        const aim = G.ui.aimMap;
        if (aim) out.push(h('p', { class: 'cb-aimask', 'data-aim-ask': '' }, aim.max === 1 ? 'Tap any clearing on the map.' : `Tap up to ${aim.max} clearings on the map.`));
        out.push(h('div', { class: 'cb-back' },
            h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'back-to-fight', onclick: () => { G.ui.combatMap = false; G.ui.aimMap = null; render(G); } }, aim && aim.max !== 1 ? 'Done' : aim ? 'Keep my choice' : 'Back to the fight')));
        return out;
    }
    const fm = fightModel(G.st, G.data), inFight = fm.pending?.type?.startsWith('combat');
    const peek = { gear: () => { G.ui.sheet = 'char'; render(G); }, map: () => { G.ui.combatMap = true; G.ui.sheet = null; render(G); }, piece: d => openPiece(G, { kind: d.kind, id: d.id, side: d.side ?? 'light', tag: d.tag ?? null }) };
    if (inFight) { if (fm.pending.type === 'combat-over') G.ui.cbBeat = null; out.push(combatScene({ st: G.st, data: G.data, act: act.bind(null, G), ui: G.ui, render: () => render(G), peek })); }
    else out.push(combatBeat({ st: G.st, data: G.data, ui: G.ui, render: () => render(G) }));
    const look = lookSheet(G); if (look) out.push(look);          // (every look, the menu's own included, stands in front of the fight: notes 99 and 101)
    return out;
}

// The end of a fight of a party on one phone: the recap of every character (kills, gains, losses) stands until it is dismissed, before the day goes on (note 137).
export function partyBeatHost(G, out) {
    out.push(partyRecapScreen({ rec: G.ui.partyBeat, data: G.data, ui: G.ui, render: () => render(G), onDone: () => { G.ui.partyBeat = null; render(G); } }));
    const look = lookSheet(G); if (look) out.push(look);          // (the menu's own look stands in front of it, as in the fight)
    return out;
}
