import { onMountain } from '../colour.js';
// Lightning Bolt (IV / Purple / Attack): one attack of harm M***, length 18; cast only in a mountain clearing.
// The attack rides in the attack circle (see combat.js meleePlay); an attack spell not used in its round is lost.
export default {
    id: 'lightning-bolt', dur: 'attack', benevolent: false,
    attack: { harm: 'M', stars: 3, length: 18, hits: 1, missile: true, only: 'mountain' },
    legal: (st, data) => (onMountain(st, data, st.ch.at) ? true : 'Lightning Bolt can be cast only in a mountain clearing.'),
    useful: st => !!st.combat?.dens.some(d => !d.dead && d.kind !== 'horse' && d.kind !== 'part'),
    start() { /* the blow itself is resolved in the melee */ },
    ai: { role: 'attack' },
};
