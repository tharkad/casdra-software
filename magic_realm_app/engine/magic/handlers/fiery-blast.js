// Fiery Blast (IV / Purple / Attack): one attack of harm L***, length 13.
// The attack rides in the attack circle (see combat.js meleePlay); an attack spell not used in its round is lost.
export default {
    id: 'fiery-blast', dur: 'attack', benevolent: false,
    attack: { harm: 'L', stars: 3, length: 13, hits: 1, missile: true, many: true },
    useful: st => !!st.combat?.dens.some(d => !d.dead && d.kind !== 'horse' && d.kind !== 'part'),
    start() { /* the blow itself is resolved in the melee */ },
    ai: { role: 'attack' },
};
