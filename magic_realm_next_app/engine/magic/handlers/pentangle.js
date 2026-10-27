import { nullifyFx, restoreFx, sameRef, elsewhere } from '../fx.js';
import { characters, foeTargets, nullifyIfDuplicate, spellName } from '../util.js';

// Pentangle (V / Black / Combat): one character, native or monster. The Demon, Winged Demon and Imp cannot attack the target; all spells and curses that bewitch him
// are nullified (they come back when the Pentangle ends); and no new spell can go into effect against him. It stops only spells aimed at the target himself.
// Decisions (01-combat-spells.md section 6): only the Pentangle gives Demon immunity (the Protection from Magic card does not, unlike RealmSpeak); the target is
// a character (today the hero; the aim list also holds any other character the game has); every spell that names the target, beneficial ones too, is removed
// from the aim lists (cast.js), and one already chosen fizzles if the Pentangle came to life first. It ends at Midnight or when it is broken.
export default {
    id: 'pentangle', dur: 'combat', benevolent: true,
    // ruling S2 (Mike, 2026-10-26): follow the card, "one character, native or monster": any character, the caster included, or a denizen
    aim: (st, data) => [...characters(st).map(c => ({ ref: c.ref, label: c.ref.id === 'ch' ? 'yourself' : c.name })), ...foeTargets(st, data)],
    legal: () => true,
    useful: () => false,                       // never a prompt: the computer players do not cast it
    start(ctx) {
        const t = ctx.targets[0] ?? { kind: 'char', id: 'ch' };
        ctx.fx({ targets: [t], expires: { day: ctx.st.day, at: 'midnight' } });
        ctx.log(`Pentangle: ${t.id === 'ch' ? 'you are' : 'the target is'} shielded: Demons and Imps cannot strike, and spells and curses that bewitch ${t.id === 'ch' ? 'you' : 'it'} are held off until Midnight.`);
    },
    tags: () => ({ demonProof: true, shield: 'spells', noNewSpells: true }),
    apply(ctx, fx) {
        const { st, data } = ctx;
        if (nullifyIfDuplicate(st, fx)) return;
        fx.data.held = [];
        for (const f of st.fx ?? []) {
            if (f === fx || f.state !== 'live' || elsewhere(st, f) || !f.targets.some(t => sameRef(t, fx.targets[0]))) continue;
            nullifyFx(st, data, f.id); fx.data.held.push(f.id);
            ctx.say(`${spellName(data, f.spell)} is held off by the Pentangle.`);
        }
    },
    unapply(ctx, fx) {
        for (const id of fx.data.held ?? []) restoreFx(ctx.st, ctx.data, id);
        fx.data.held = [];
    },
    ai: { role: 'buff' },
};
