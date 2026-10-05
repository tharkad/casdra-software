import { CARD_DEFS } from '../data/cards.js';

// Helpers shared by every engine module. They mutate a DRAFT state (the clone apply() makes).

export const def = card => CARD_DEFS[card.defId];
export const other = id => 1 - id;
export const handSize = p => 5 + p.pipelines.length;
export const activePlayer = s => s.players[s.turn.active];

export function newCard(s, defId) {
    s.uidCounter += 1;
    return { uid: s.uidCounter, defId };
}

// mulberry32; the whole generator state is one uint32 inside the game state.
export function rnd(s, n) {
    s.rng = (s.rng + 0x6D2B79F5) >>> 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
}

export function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = rnd(s, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function logEvent(s, event) {
    s.log.push({ turnNo: s.turn.number, by: s.turn.active, ...event });
}

// Draws up to n cards into hand. When the draw pile runs out mid-draw the discard pile is
// shuffled into a new System (rulebook p.10). Returns how many were drawn.
export function drawCards(s, p, n) {
    for (let i = 0; i < n; i += 1) {
        if (p.draw.length === 0) {
            if (p.discard.length === 0) return i;
            p.draw = shuffle(s, p.discard.splice(0));
        }
        p.hand.push(p.draw.pop());
    }
    return n;
}

export function takeFrom(list, uid) {
    const i = list.findIndex(c => c.uid === uid);
    if (i === -1) return null;
    return list.splice(i, 1)[0];
}

export const countOf = (cards, defId) => cards.filter(c => c.defId === defId).length;
