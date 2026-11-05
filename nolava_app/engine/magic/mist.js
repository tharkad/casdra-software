// Melt into Mist (docs/design/magic/02-day-spells.md section 15). A leaf module: the map, summoning and day code ask whether the hero is mist without importing the spell.
// While the spell is energized `st.ch.mist = { items, gold, day }` holds everything he carried (the belongings are "transmorphized with him", RealmSpeak
// TransmorphEffect.java:236-250: they move into the spell) and `st.ch.items` / `st.ch.gold` are empty. It is plain JSON, so a saved game carries it.
export const isMist = st => !!st.ch?.mist;
// What the hero owns, mist or not (for the sudden-death check, which must not see a pocket emptied by the spell).
export const ownedItems = st => [...(st.ch.items ?? []), ...(st.ch.mist?.items ?? [])];
// The fight lets go of him (cast in a fight, or a sleeping Melt into Mist wakes at the start of a round): every creature on the combat sheet is unassigned, and a Tremendous monster
// that held him lets go and turns its red side down.
export function releaseFoes(c) {
    for (const d of c?.dens ?? []) { d.assigned = false; d.engagedBy = null; if (d.pickedUp) { d.pickedUp = false; d.side = 'light'; } }
}
export const ownedGold = st => (st.ch.gold ?? 0) + (st.ch.mist?.gold ?? 0);
