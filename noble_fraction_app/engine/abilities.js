import { handle, provide } from './registry.js';
import { activePlayer, def, logEvent, takeFrom } from './helpers.js';

// Upgrade abilities used as stand-alone actions. Each table entry:
//   params(s, p, card, fromHand) -> array of parameter objects (empty = not usable now)
//   run(s, p, params)            -> performs it
// Hand-played cards are discarded AFTER the effect runs, so a reshuffle it causes never shuffles
// the card that caused it back in (rulebook p.12).
export const ABILITIES = {};
export const defineAbility = (tag, entry) => { ABILITIES[tag] = entry; };

const PLAY_PHASES = {
    distill: ['distill', 'any'], airwipe: ['any'], buybid: ['any', 'bid', 'buy'], overtimeBid: ['any', 'bid'],
};

// An ability may list its own `phases`; otherwise the card's printed phase icon decides.
const inPhase = (s, d, ability) => (ability.phases
    ? ability.phases.includes(s.turn.phase)
    : (PLAY_PHASES[s.turn.phase] ?? []).includes(d.phase));

provide(s => {
    if (s.turn.phase === 'start' || s.turn.phase === 'over') return [];
    const p = activePlayer(s);
    const acts = [];
    for (const card of p.hand) {
        const d = def(card);
        const ability = ABILITIES[d.ability];
        if (!ability || ability.handUse === false || !inPhase(s, d, ability) || d.kind === 'element') continue;
        ability.params(s, p, card, true).forEach(params => acts.push({ type: 'play', uid: card.uid, ...params }));
    }
    for (const card of p.installed) {
        const d = def(card);
        const ability = ABILITIES[d.ability];
        if (!ability || !ability.installedUse || s.turn.f.usedInstalled[card.uid] || !inPhase(s, d, ability)) continue;
        ability.params(s, p, card, false).forEach(params => acts.push({ type: 'useInstalled', uid: card.uid, ...params }));
    }
    return acts;
});

handle('play', (s, a) => {
    const p = activePlayer(s);
    const card = takeFrom(p.hand, a.uid);
    const { type, uid, ...params } = a;
    const result = ABILITIES[def(card).ability].run(s, p, params, card);
    // "Remove from System" (Freelance Fitter) sends the card to the general Upgrade discard.
    if (result === 'upgradeDiscard') s.market.upgradeDiscard.push(card);
    else p.discard.push(card);
    logEvent(s, { type: 'played', card: card.defId, params });
});

handle('useInstalled', (s, a) => {
    const p = activePlayer(s);
    const card = p.installed.find(c => c.uid === a.uid);
    const { type, uid, ...params } = a;
    s.turn.f.usedInstalled[card.uid] = true;
    ABILITIES[def(card).ability].run(s, p, params, card);
    logEvent(s, { type: 'usedInstalled', card: card.defId, params });
});
