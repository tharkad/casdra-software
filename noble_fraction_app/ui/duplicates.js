import { CARD_DEFS } from '../data/cards.js';

// Why a market card can't be taken because the player already has one of that design (engine/buy.js `quote` is the authority; a test pins this to it):
//   'main'      -- a Main of this gas is already owned (one per gas): the card can't be bought at all.
//   'installed' -- this Upgrade design is already installed: it can still be bought for the deck, but a second copy can't be installed.
export function duplicateReason(s, pid, card) {
    const d = CARD_DEFS[card.defId]; const p = s.players[pid];
    if (!d || !p) return null;
    if (d.kind === 'pipeline') return p.pipelines.some(c => CARD_DEFS[c.defId].color === d.color) ? 'main' : null;
    if (d.kind === 'upgrade' && !d.pink) return p.installed.some(c => c.defId === card.defId) ? 'installed' : null;
    return null;
}

export const DUPLICATE_TAG = { main: 'Owned', installed: 'Installed' };
export const DUPLICATE_NOTE = {
    main: 'You already own this Main — you can have only one per gas, so it can\'t be bought.',
    installed: 'You already have this installed. You can still buy a copy for your deck, but a second one can\'t be installed.',
};
