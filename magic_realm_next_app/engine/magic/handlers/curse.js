import { rollCurse, charName } from '../../effects.js';
import { HERO } from '../fx.js';
import { characters } from '../util.js';

// Curse (V / Grey / Instant): one character. The caster rolls on the Curses Table and the result falls on the target.
// Decisions (docs/design/magic/01-combat-spells.md section 12): the caster's roll, two dice with the higher counting; a target that already bears the
// curse, or that a Pentangle or Protection from Magic shields, is unaffected (the spell is still spent); in a one-character game the only target is
// the hero himself, so it can be cast on self but is never suggested (useful is false) and the computer players never choose it.
export default {
    id: 'curse', dur: 'instant', benevolent: false,
    aim: st => characters(st).map(c => ({ ref: c.ref, label: c.ref.id === 'ch' ? 'yourself' : c.name })),
    legal: () => true,
    useful: () => false,
    start(ctx) {
        const { st, data } = ctx, t = ctx.targets[0] ?? HERO;
        const name = rollCurse(st, data, t, HERO);
        ctx.log(`Curse: ${name} on ${t.id === 'ch' ? 'you' : charName(st, t)}.`);
    },
    ai: { role: 'utility' },
};
