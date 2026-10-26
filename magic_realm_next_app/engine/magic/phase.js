import { spellDef } from './registry.js';
import { activateFx, elsewhere } from './fx.js';

// Phase spells (rules 4.6.7, 8.3.9; docs/design/magic/00-framework.md section 2.1): cast in the Evening, they only prepare. The record is `held`, the
// Magic chit stays committed, and the target activates it like an item: at the start of a Daylight phase (it ends with that phase) or in the Encounter
// step of a combat round in place of a chit action (it ends with that round, see combat.js nextRound). A held spell is not cleared at Midnight.

// Why he cannot rearrange his belongings now, or null (4.6.7f.2, 7.2.3a.2: a character who cannot rearrange belongings cannot activate the Protection chit): out on a roadway
// (8.3.8d), in the air (7.2.2d: he may only abandon), or transmorphized (4.6.9b.2: his belongings are frozen; a creature has no use for them).
export const rearrangeLockWhy = st => (st.ch.onRoad ? 'you are out on the road between clearings' : st.ch.flying ? 'you are in the air' : st.ch.morph ? 'you are a creature, and your belongings are of no use to you' : null);

// The Phase spells he is holding, ready to use: [{ fx, spell, name }].
export const heldOptions = (st, data) => st.ch.mist || rearrangeLockWhy(st) ? [] : (st.fx ?? []).filter(f => f.dur === 'phase' && f.state === 'held' && !elsewhere(st, f))
    .map(f => ({ fx: f.id, spell: f.spell, name: spellDef(data, f.spell)?.name ?? f.spell }));

// Use one: `when` is 'phase' (a Daylight phase) or 'round' (a combat round). With no id given, the first held spell.
export function activatePhase(st, data, fxId, when) {
    const held = heldOptions(st, data);
    const lock = (st.fx ?? []).some(f => f.dur === 'phase' && f.state === 'held' && !elsewhere(st, f)) ? rearrangeLockWhy(st) : null;
    if (lock) throw new Error(`You cannot activate it: ${lock}, so you cannot rearrange your belongings (7.2.3a.2).`);
    const o = fxId ? held.find(h => h.fx === fxId) : held[0];
    if (!o) throw new Error('you are not holding a spell to use');
    activateFx(st, data, o.fx, { at: when === 'round' ? 'round-end' : 'phase-end' });
}
