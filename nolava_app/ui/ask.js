import { h } from './dom.js';

// Every place the game needs an answer from the player begins with one of these: what is happening, and why it has to be decided now.
export const ask = (situation, why = null, { compact = false } = {}) =>
    h('div', { class: `ask${compact ? ' compact' : ''}`, role: 'note', 'data-ask': '' }, h('b', {}, situation), why ? h('p', {}, why) : null);
