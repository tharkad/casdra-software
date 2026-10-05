import { defineAbility } from './abilities.js';
import { drawCards, newCard, takeFrom } from './helpers.js';
import { canInstall, installCard } from './install.js';

// Upgrades usable at any time on your own turn (rulebook p.12). Cards added "to your System" go
// to the discard pile, like AIR does.
const addToSystem = (s, p, ids) => ids.forEach(id => p.discard.push(newCard(s, id)));

defineAbility('addXe', {
    params: () => [{}],
    run: (s, p) => addToSystem(s, p, ['Xe']),
});

// Installed only (its "ONCE PER TURN" icon): Expansion Turbine adds Kr + Xe every turn.
defineAbility('addKrXe', {
    handUse: false,
    installedUse: true,
    params: () => [{}],
    run: (s, p) => addToSystem(s, p, ['Kr', 'Xe']),
});

defineAbility('draw3', {
    params: (s, p) => (p.draw.length + p.discard.length > 0 ? [{}] : []),
    run: (s, p) => { drawCards(s, p, 3); },
});

// Freelance Fitter leaves the game to install a card from your hand at no cost.
defineAbility('freeInstall', {
    params: (s, p, card) => p.hand.filter(c => c.uid !== card.uid && canInstall(p, c)).map(c => ({ install: c.uid })),
    run: (s, p, { install }) => {
        installCard(s, p, takeFrom(p.hand, install), 0);
        return 'upgradeDiscard';
    },
});
