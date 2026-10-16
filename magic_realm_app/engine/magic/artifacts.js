import { nameOf } from '../items.js';

// Artifacts and Spell Books that take part in the magic system (rule 4.6.6; docs/design/magic/00-framework.md section 4 and 03-control-spells.md section 7).
// An item is one of the thirteen with spell cards in its box (setupcard spellContainers: 8 Artifacts, 5 Books). Enchant Artifact adds Magic types and recorded spells:
//   item.extra = [{ fx, type, spell }]      present only while the Enchant Artifact that made it is in force (live, i.e. energized); see handlers/enchant-artifact.js

// Does the item hold spell cards (and so can be enchanted, read for runes, played as a caster)?
export const isSpellItem = (st, data, it) => it.kind === 'treasure' && !!st.spellBox?.items?.[nameOf(data, it)];
// An item he carries, has active and can enchant.
export const enchantableItems = (st, data) => st.ch.items.filter(it => !it.destroyed && it.active && isSpellItem(st, data, it));

// The Magic types printed on the item (its own cards), then the ones Enchant Artifact added: ['II', 'III', 'VI'].
export const numeralsOf = (data, it) => {
    const own = data.treasures?.[it.card ?? it.id]?.magic?.numerals ?? [];
    return [...new Set([...own, ...(it.extra ?? []).map(e => e.type)])];
};
export const extrasOf = it => it.extra ?? [];

// Where an item is: his belongings, or lying in a pile where it was abandoned.
export function findItem(st, uid) {
    const mine = st.ch.items.find(i => i.uid === uid);
    if (mine) return mine;
    for (const pile of Object.values(st.abandoned ?? {})) { const it = pile.find(i => i.uid === uid); if (it) return it; }
    return null;
}
