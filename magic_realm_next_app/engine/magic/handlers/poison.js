import { B } from '../bridge.js';
import { nameOf } from '../../items.js';
import { foes, denRef, foeName, nullifyIfDuplicate, reveal } from '../util.js';
import { dayExpiry } from '../helpers.js';

// Poison (VIII / Grey / Day, as the List of Spells in the 3.1 rules has it; ruling S3, Mike 2026-10-26: Day, not the card's Combat): one weapon counter, native counter, Goblin counter, Ogre counter or Giant's club: it adds one sharpness
// star to the harm the target counter inflicts when it hits. Not the Alchemist's Mixture or a dagger.
// Decisions (01-combat-spells.md section 7, Question 2; the duration was changed to Day by ruling S3, 2026-10-26): the duration is Day: the star stays through Midnight until Sunset of the next day
// and the Magic chit that cast it stays tied up till then (4.6.7); the targets are the weapon he has in use (not the Alchemist's Mixture; a bare Fight chit is the "dagger" and has no counter), any native
// on the sheet, and any Goblin, Ogre or Giant; casting it on a foe's counter is legal and hurts him. The star is read through the tag `stars` (combat.js denSide for
// creatures; meleePlay for his own weapon). It ends with the counter (killed or dropped), at Sunset of the next day, or when it is broken.
const FAMILIES = ['Goblin', 'Ogre', 'Giant'];
function options(st, data) {
    const out = [];
    const w = st.ch.items.find(i => i.kind === 'weapon' && i.active && !i.destroyed);
    if (w && !/alchemists-mixture/.test(w.id)) out.push({ ref: { kind: 'item', id: w.uid }, label: `your ${nameOf(data, w)}` });
    for (const d of foes(st)) {
        if (d.kind === 'nat' ? B.denSide(st, data, d).attack === 'none' : !FAMILIES.includes(data.monsters[d.id]?.family)) continue;
        out.push({ ref: denRef(d), label: `the ${foeName(st, data, d)}'s ${d.kind === 'nat' ? 'weapon' : 'attack'}` });
    }
    return out;
}
export default {
    id: 'poison', dur: 'day', benevolent: false,
    aim: (st, data) => { const o = options(st, data); return o.length ? o : null; },
    legal: (st, data) => (options(st, data).length ? true : 'There is no weapon or creature here that Poison can be put on (not the Alchemist\'s Mixture, not a bare Fight chit).'),
    // worth it when he has a weapon to poison that is not poisoned yet and something to use it on
    useful: (st, data) => { const o = options(st, data)[0]; return !!o && o.ref.kind === 'item' && foes(st).some(d => d.assigned) && !(st.fx ?? []).some(f => f.state === 'live' && f.spell === 'poison' && f.targets.some(t => t.kind === 'item' && t.id === o.ref.id)); },
    start(ctx) {
        const { st, data } = ctx, t = ctx.targets[0];
        if (t.kind !== 'item') reveal(ctx);
        ctx.fx({ targets: [t], expires: dayExpiry(st) });
        const label = options(st, data).find(o => o.ref.kind === t.kind && o.ref.id === t.id)?.label ?? 'the counter';
        ctx.log(`Poison: ${label} now inflicts one more sharpness star when it hits, until Sunset tomorrow.`);
    },
    tags: () => ({ stars: 1 }),
    apply(ctx, fx) { nullifyIfDuplicate(ctx.st, fx); },
    ai: { role: 'buff' },
};
