// Stones Fly (II / Grey / Attack): four attacks of harm L*, length 15, split among the targets; each hit has its own Missile Table roll.
// The attack rides in the attack circle (see combat.js meleePlay); an attack spell not used in its round is lost.
export default {
    id: 'stones-fly', dur: 'attack', benevolent: false,
    attack: { harm: 'L', stars: 1, length: 15, hits: 4, missile: true },
    useful: st => !!st.combat?.dens.some(d => !d.dead && d.kind !== 'horse' && d.kind !== 'part'),
    start() { /* the blow itself is resolved in the melee */ },
    ai: { role: 'attack' },
};
