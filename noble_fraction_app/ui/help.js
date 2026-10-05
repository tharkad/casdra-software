import { h } from './dom.js';

// A rules summary for the "?" button. Short on purpose: the rulebook is the authority.
const SECTIONS = [
    ['The goal', 'You run a cryogenic air-separation plant. Pull rare xenon (Xe) out of the air, deliver it to Contracts, and finish with the most VP. The game ends when someone has 5 installed Upgrades or 5 completed Contracts; the other player then gets one last turn.'],
    ['A turn, in order', 'DISTILL → INTAKE or PURGE → BUY or BID → end of turn. A Night Shift turn changes this (see below).'],
    ['DISTILL', 'Distill removes ALL cards of one element from your hand and returns them to the supply, in priority N, then O, then Kr. Xe is never removed. Play Upgrades marked DISTILL in any order. Press "End distill" to finish: if your hand then holds nothing but Xe, all of it moves to cold storage, where it pays for your Contract. Heat Exchanger and Cryo Chiller pay out when you end DISTILL.'],
    ['INTAKE or PURGE', 'INTAKE: add one air packet (one each of N, O, Kr, Xe) to your discard pile and gain $2 (the Intake Fan brings two packets and $4). PURGE: choose the Contract line or the Upgrade line and replace every card that has no Bid Token on it.'],
    ['BUY or BID', 'Do one of the two (a Floor Broker lets you do both). BUY one card from either line at its cost. Upgrades go to your discard pile, or install at once for the larger price. A Main adds +1 hand size for $5, one per gas. A Contract is free, but you may hold only one unfinished Contract. BID: put one of your 5 Bid Tokens on any card, or move a token you have already placed.'],
    ['Bid Tokens', 'A token shields a card from PURGE. If someone buys a card carrying your tokens they pay you $1 per token. If you buy a card carrying your own tokens, you pay $1 less per token. Tokens go back to their owners once the card is bought.'],
    ['Upgrades', 'The round number top-left is the buy cost; the ringed number bottom-right is the total to install straight from the line. Installing from your hand later costs the difference. Installed Upgrades are worth 1 VP each and work every turn. You can install each design once. Cards marked with the crossed-out wrench can never be installed.'],
    ['Contracts', 'When your stored Xe reaches the Contract\'s Xe cost it completes instantly: the Xe returns to the supply, you collect the $ reward, and the card scores its VP at game end.'],
    ['Night Shift', 'Choose it at the start of a turn (never two turns in a row): Distill twice, then take two BID steps. No INTAKE, PURGE or BUY. Your discard pile is shuffled back into your deck.'],
    ['End of turn', 'Both lines are refilled to 4 cards. Discard any hand cards you like, then draw back up to your hand size (5 plus your Mains).'],
    ['Scoring', 'Completed Contracts, 1 VP per installed Upgrade, Mains (1 / 4 / 9 VP for one / two / three), 1 VP per $5, Upgrade bonuses, and +3 VP if the player who ended the game took the +3 side of the Founder\'s Seal. A tie goes to the player with less Xe left in their deck.'],
    ['Using the app', 'Tap any card to zoom it and see what you can do with it. Teal is you, orange is the Rival. The Rival plays its whole turn at once, then shows a recap; "Rival turn" reopens it. Glowing cards have an action available.'],
];

export function helpSheet(ctx) {
    return h('div', { class: 'sheet help', 'data-sheet': 'help' },
        h('div', { class: 'help-head' }, h('h2', {}, 'How to play'),
            h('button', { class: 'btn primary', 'data-close': '', onclick: () => ctx.setUi({ help: false }) }, 'Close')),
        h('div', { class: 'help-body' }, SECTIONS.map(([title, text]) => h('section', {}, h('h3', {}, title), h('p', {}, text)))));
}
