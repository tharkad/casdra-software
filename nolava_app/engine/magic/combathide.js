import { die, roll2, say, noteRoll } from '../core.js';
import { hides } from '../tables.js';
import { oneDie, modRoll, modNote } from '../modifiers.js';
import { hasCurse } from '../effects.js';
import { fxTags, HERO } from './fx.js';

// World Fades, the round-end Hide roll (handlers/world-fades.js; RS BattleModel.java:1672-1696): at the end of a round of combat, an unhidden character under an energized
// World Fades with nobody on his Melee Section (no live denizen assigned to him or holding him) rolls on the Hide table. Called from combat.js nextRound.
// Returns true when he hid.
export function worldFadesRoll(st, data) {
    const c = st.combat;
    if (!c || st.ch.dead || st.ch.hidden || !fxTags(st, HERO, 'combatHide').length) return false;
    if (c.dens.some(d => !d.dead && (d.assigned || d.pickedUp) && d.kind !== 'part' && d.kind !== 'horse')) return false;       // someone is attacking him: no hiding
    if (hasCurse(st, 'Squeak')) { say(st, 'World Fades: the Squeak curse betrays you; you cannot hide.', 'combat'); return false; }
    const r = oneDie(st, 'hide', st.ch.at, data) ? (() => { const d1 = die(st); return { dice: [d1], value: d1 }; })() : roll2(st);
    const raw = [...r.dice];
    modRoll(st, data, 'hide', r);
    const ok = hides(r.value);
    noteRoll(st, 'World Fades: Hide', raw, r.value, (ok ? 'You fade from sight' : 'You are seen') + modNote(r));
    if (ok) { st.ch.hidden = true; say(st, 'World Fades: you slip out of sight.', 'combat'); }
    return ok;
}
