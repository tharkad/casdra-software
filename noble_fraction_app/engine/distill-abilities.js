import { handle, provide } from './registry.js';
import { activePlayer, drawCards, logEvent, shuffle, takeFrom } from './helpers.js';
import { defineAbility } from './abilities.js';
import { removeAllOf, settleHooks, finishDistillPhase } from './distill.js';
import { placeToken, allLineCards } from './bid.js';

const has = (p, el) => p.hand.some(c => c.defId === el);
const installedCount = (p, defId) => p.installed.filter(c => c.defId === defId).length;

// Return Loop: discard a card from hand. When hand-played the Return Loop card has already left the hand
// (it is only put in the discard afterwards), so "the other cards" is exactly p.hand minus it.
defineAbility('return_loop', {
    installedUse: true,
    params: (s, p, card, fromHand) => p.hand.filter(c => !fromHand || c.uid !== card.uid).map(c => ({ discard: c.uid })),
    run: (s, p, { discard }) => { const c = takeFrom(p.hand, discard); p.discard.push(c); },
});

for (const [tag, el] of [['distillAll:N', 'N'], ['distillAll:O', 'O']]) {
    defineAbility(tag, {
        installedUse: true,
        params: (s, p) => (has(p, el) ? [{}] : []),
        run: (s, p) => { logEvent(s, { type: 'distillAll', element: el, count: removeAllOf(s, p, el) }); },
    });
}

// Sampling Port: look at the top card of the System, then draw it or discard it.
// An empty draw pile reshuffles the discard pile first (the played card is not in it yet).
function topCard(s, p) {
    if (p.draw.length === 0 && p.discard.length > 0) p.draw = shuffle(s, p.discard.splice(0));
    return p.draw[p.draw.length - 1] ?? null;
}
defineAbility('peekDeck', {
    installedUse: true,
    params: (s, p) => (p.draw.length + p.discard.length > 0 ? [{ choice: 'draw' }, { choice: 'discard' }] : []),
    run: (s, p, { choice }) => {
        const card = topCard(s, p);
        if (choice === 'draw') drawCards(s, p, 1);
        else p.discard.push(p.draw.pop());
        logEvent(s, { type: 'peekDeck', choice, card: card.defId });
    },
});

// Heat Exchanger / Cryo Chiller: armed by playing the card (or always, if
// installed); they pay out at the end of the DISTILL phase for everything removed during it.
const arm = key => ({ installedUse: false, params: () => [{}], run: s => { s.turn.f[key] += 1; } });
defineAbility('cashPerO', arm('armedCash'));
defineAbility('bidPerN', arm('armedBidTokens'));

settleHooks.push((s, p) => {
    const f = s.turn.f;
    const boilers = f.armedCash + installedCount(p, 'heat_exchanger');
    if (boilers > 0 && f.removed.O > 0) {
        p.money += boilers * f.removed.O;
        logEvent(s, { type: 'cashPerO', money: boilers * f.removed.O });
    }
    const vcrs = f.armedBidTokens + installedCount(p, 'cryo_chiller');
    // With both lines empty (every card bought, only reachable in a long game) there is nothing to put a token on: forfeit them,
    // or the phase would wait for a placement no action can make.
    f.freeBids = allLineCards(s).length === 0 ? 0 : Math.min(p.tokensLeft, vcrs * f.removed.N);
});

// Tokens earned this way are placed one at a time before the phase can finish.
provide(s => {
    const f = s.turn.f;
    if (s.turn.phase !== 'distill' || !f.settled || f.freeBids === 0) return [];
    return allLineCards(s).map(c => ({ type: 'placeFreeBid', uid: c.uid }));
});

handle('placeFreeBid', (s, a) => {
    placeToken(s, activePlayer(s), a.uid);
    s.turn.f.freeBids -= 1;
    if (s.turn.f.freeBids === 0 || activePlayer(s).tokensLeft === 0) {
        s.turn.f.freeBids = 0;
        finishDistillPhase(s);
    }
});
