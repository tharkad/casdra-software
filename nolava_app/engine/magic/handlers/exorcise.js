import { B } from '../bridge.js';
import { breakFx, HERO } from '../fx.js';
import { characters, fxHere, spellName, cancelCasts } from '../util.js';

// Exorcise (I / White / Instant): the caster's clearing. Every Demon and Imp there is killed; every spell and curse in effect there, or being cast there
// this round, is broken; every colour chit there fatigues. "The strongest of all spells."
// Decisions (01-combat-spells.md section 1): it acts before every other spell of the round whatever its time (`first`), so it cancels spells still to be
// cast this round, Attack spells included; it breaks the caster's own Day buffs and Combat spells too (the cast sheet names what he will lose); colour
// chits of every character in the clearing fatigue (the card, not RealmSpeak, which tires only the cursed); the Demons and Imps it kills pay him as kills,
// and their blows never land (they are dead before the blows are worked out); it ignores Pentangle and Protection from Magic (clearing-aimed).
const isDemon = (data, d) => d.kind === 'mon' && ['Demon', 'Imp'].includes(data.monsters[d.id]?.family);
const demonsHere = (st, data) => (st.combat?.dens ?? []).filter(d => !d.dead && isDemon(data, d));
const fxToBreak = st => (st.fx ?? []).filter(f => f.state !== 'done' && fxHere(st, f));
const cursed = st => characters(st).filter(c => (c.who.curses ?? []).length);

export default {
    id: 'exorcise', dur: 'instant', benevolent: false, first: true,
    legal: () => true,
    // worth a prompt when there is a Demon or Imp to kill, a curse to lift, or a spell that someone else put on him
    useful: (st, data) => demonsHere(st, data).length > 0 || cursed(st).length > 0 || fxToBreak(st).some(f => f.caster.id !== HERO.id),
    // what casting it will cost him, for the cast sheet
    losses: (st, data) => [...fxToBreak(st).filter(f => f.caster.id === HERO.id).map(f => spellName(data, f.spell)), ...cursed(st).flatMap(c => c.who.curses)],
    start(ctx) {
        const { st, data } = ctx, said = [];
        // 1. the Demons and Imps
        for (const d of demonsHere(st, data)) {
            const name = B.denSide(st, data, d).name, reward = B.slayDenizen(st, data, d, { spell: 'Exorcise' });
            said.push(`the ${name} is destroyed${reward}`);
        }
        // 2. the curses on everyone here
        for (const ch of cursed(st)) { said.push(`the ${ch.who.curses.join(' and ')} curse${ch.who.curses.length > 1 ? 's' : ''} on ${ch.name} ${ch.who.curses.length > 1 ? 'are' : 'is'} broken`); ch.who.curses = []; }
        // 3. the spells in effect here (live, inert and nullified ones alike)
        for (const f of fxToBreak(st)) { said.push(`${spellName(data, f.spell)} is broken`); breakFx(st, data, f.id, 'Exorcise'); }
        // 4. the spells still to be cast this round come to nothing, whatever their time; their chits tire
        for (const name of cancelCasts(st, data, ctx.cast)) said.push(`${name}, still to be cast, is broken`);
        // 5. every colour chit here fatigues
        let tired = 0;
        for (const ch of characters(st)) for (const k of ch.who.chits) if (k.state === 'enchanted') { k.state = 'fatigued'; tired++; }
        if (tired) said.push(`${tired} colour chit${tired > 1 ? 's' : ''} fatigue${tired > 1 ? '' : 's'}`);
        ctx.log(said.length ? `Exorcise: ${said.join('; ')}.` : 'Exorcise: nothing here needed driving out.');
    },
    ai: { role: 'utility' },
};
