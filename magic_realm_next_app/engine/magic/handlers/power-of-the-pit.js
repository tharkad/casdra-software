import { B } from '../bridge.js';
import { shielded } from '../fx.js';
import { rollPit, pitOnChar, charOf } from '../../effects.js';
import { foeTargets, denOf, reveal, characters } from '../util.js';

// Power of the Pit (V / Black / Instant): one character, native or monster. The caster rolls on the Power of the Pit Table and the result is applied to the target.
// Ruling S2 (Mike, 2026-10-26): follow the card: any character (the caster himself included, 8.4.2d.1), native or monster. A character target takes the row like a creature: Carried Away
// kills him, Blight / Forget / Rust act on his chits and armor, Fiery Chasm and Terror sweep the clearing.
// Decisions (01-combat-spells.md section 15): the caster rolls two dice, higher counts; the target is a creature on the combat sheet or a character;
// naming it gives away a hidden caster, so a Fiery Chasm kills him too; Blight, Forget and Rust act only on a character, so against a denizen those rows do
// nothing; the kills pay the caster as ordinary kills; a target shielded from magic (Pentangle, Protection from Magic) is unaffected and no dice are rolled.
// The target is a character (the caster or, with several characters, another one).
function onCharacter(ctx) {
    const { st, data } = ctx, t = ctx.targets[0], who = charOf(st, t), mine = t.id === 'ch';
    if (!who) { ctx.log('The Power of the Pit finds no target.'); return; }
    reveal(ctx);
    const name = mine ? 'yourself' : who.name ?? t.id;
    if (shielded(st, t)) { ctx.log(`Power of the Pit: ${mine ? 'you are' : `${name} is`} shielded from magic and ${mine ? 'are' : 'is'} unaffected.`); return; }
    const { row, dice } = rollPit(st, data);
    ctx.log(`Power of the Pit at ${name}: ${row.name} (rolled ${dice.join('+')}). ${row.effect}`);
    if (row.name === 'Fiery Chasm' || row.name === 'Terror') {
        B.pitSweep(st, data, row.name, { pay: true, log: ctx.log });
        pitOnChar(st, row);                                    // the caster is in the clearing too
        if (!mine) pitOnChar(st, row, who);
    } else pitOnChar(st, row, who);
    if (st.ch.dead) B.killMe(st, `Your own Power of the Pit (${row.name}) kills you.`, 'Power of the Pit');
}

export default {
    id: 'power-of-the-pit', dur: 'instant', benevolent: false,
    aim: (st, data) => { const o = [...foeTargets(st, data), ...characters(st).map(c => ({ ref: c.ref, label: c.ref.id === 'ch' ? 'yourself' : c.name }))]; return o.length ? o : null; },
    legal: () => true,                                     // a character is always there to name: himself
    useful: () => false,                                   // a gamble that can kill its caster: the computer players do not take it
    start(ctx) {
        const { st, data } = ctx;
        if (ctx.targets[0]?.kind === 'char') return onCharacter(ctx);
        const den = denOf(st, ctx.targets[0]);
        if (!den) { ctx.log('The Power of the Pit finds no target.'); return; }
        reveal(ctx);
        const name = B.denSide(st, data, den).name;
        B.provoke(st, data, den);
        if (shielded(st, ctx.targets[0])) { ctx.log(`Power of the Pit: the ${name} is shielded from magic and is unaffected.`); return; }
        const { row, dice } = rollPit(st, data);
        ctx.log(`Power of the Pit at the ${name}: ${row.name} (rolled ${dice.join('+')}). ${row.effect}`);
        switch (row.name) {
            case 'Fiery Chasm':
                B.pitSweep(st, data, row.name, { pay: true, log: ctx.log });
                pitOnChar(st, row);                        // the caster dies too unless he is hidden (he is not: he named a target)
                break;
            case 'Carried Away': {
                const reward = B.slayDenizen(st, data, den, { spell: 'Power of the Pit' });
                ctx.log(`The ${name} is carried away${reward}.`);
                break;
            }
            case 'Terror':
                B.pitSweep(st, data, row.name, { pay: true, log: ctx.log });
                pitOnChar(st, row);                        // every character here, the caster included, is wounded in his Light and Medium chits
                break;
            default: ctx.log(`${row.name} works only on a character: the ${name} is untouched.`);
        }
        if (st.ch.dead) B.killMe(st, `Your own Power of the Pit (${row.name}) kills you.`, 'Power of the Pit');
    },
    ai: { role: 'attack' },
};
