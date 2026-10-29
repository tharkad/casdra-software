import { say } from './core.js';
import { hasCurse } from './effects.js';
import { spellOf, MAX_SPELLS } from './runes.js';

// Trading with visitors (rules 2.4.3, 7.6.1 to 7.6.5, 7.6.7, 7.12.6, 8.4.2, 8.7.6): the Scholar, the Shaman, the Warlock and the Crone.
//
// Where a visitor IS is missions.js's business: a visitor is one face of a visitor/mission chit (`st.missions.chits[i].face` is 'scholar', 'shaman', 'warlock' or 'crone'), the chit
// is set up in a box of Row 6 (3.4), comes to a clearing when Row 6 prowls (7.13.5) and stays there for good; `missions.visitorsAt(st, data, clearing)` lists the visitors in a clearing.
// This module is what a visitor does once he is there:
//   - the trade.js chooser offers him like a native leader (7.6.3a) and a sale or a purchase goes through the same code, with the prices of the Visitor Prices list (7.6.2a);
//   - a visitor's goods are `st.stock.<Name>` (the Scholar's three Small Treasures: scholarStock moves them there when he is first met; a potion that returns to its box at Midnight
//     is put in `st.stock.Shaman`, `.Warlock` or `.Crone` by day.js), his Spell cards `st.spellBox.visitors.<Name>` (runes.js);
//   - he sells his Spell cards for 10 gold (7.6.7): the buyer looks at them, names one and rolls on the Meeting Table; if he buys it he records the spell and the card stays with the
//     visitor; a visitor never buys a spell (7.6.7e) and drinks are for natives only (7.6.5b);
//   - he blocks only a trader who rolls Block/Battle (7.12.6), cannot attack or be attacked (8.4.2), and is not a piece of any fight, so he cannot be killed (8.7.6).
// Nothing here runs unless a visitor stands in a clearing, which needs a game with the visitor/mission chits (the game option `missions`, default off).

export const VISITOR_NAMES = ['Scholar', 'Shaman', 'Warlock', 'Crone'];
export const isVisitorName = g => VISITOR_NAMES.includes(g);

// The Scholar holds the three Small Treasures left over at the setup (3.1.3f); like every seller's goods they are his stock once he is met. Idempotent.
export function scholarStock(st) {
    if (st.stock.Scholar === undefined) st.stock.Scholar = (st.scholarGoods ?? []).splice(0);
    return st.stock.Scholar;
}

// ---- 7.6.7: buying spells ----
// The basic price of a spell (7.6.7, and the "one spell" line of the Visitor Prices list: the Scholar sells none).
export const SPELL_PRICE = 10;

// The Spell cards a visitor holds, for the screen (he looks at them when he trades, 7.6.7a): [{ id, name, type, color, learnable, why? }].
export function spellCards(st, data, visitor) {
    return (st.spellBox?.visitors?.[visitor] ?? []).map(c => {
        const sp = spellOf(data, c.id);
        return sp ? { id: sp.id, name: sp.name, type: sp.type, color: sp.color ?? null, ...learnState(st, sp) } : null;
    }).filter(Boolean);
}
// Could he record this spell if he bought it? He needs a Magic chit of its type, active, inactive or enchanted, as long as it has the proper numeral (7.5.6c.2), and may not duplicate a
// spell he has recorded from a Spell card (7.5.6f). Room on his sheet is a different matter: he may erase a spell to make room (7.5.6g; the buy says which).
function learnState(st, sp) {
    if (!st.ch.chits.some(c => c.type === 'magic' && c.numeral === sp.type)) return { learnable: false, why: `you have no Type ${sp.type} Magic chit to learn it with (7.5.6c.2)` };
    if ((st.ch.learned ?? []).includes(sp.id)) return { learnable: false, why: 'you have already learned that spell from a Spell card (7.5.6f)' };
    return { learnable: true };
}
// Trade action `buy` with `spell`: the card he names, checked before the Meeting Table is rolled (7.6.7a). Returns { name, base, learnable, why } or throws.
export function spellWanted(st, data, p, a) {
    const g = p.group;
    if (p.by || st.ch.leader) throw new Error('A hired leader cannot buy and learn spells on behalf of the character who hired him (7.6.7d).');          // (`st.ch.leader`: the acting seat is a hired leader, leaders.js; `p.by` for a caller that names him)
    if (!isVisitorName(g)) throw new Error(`Only a visitor sells spells: the ${g} have no Spell cards (7.6.7).`);
    const card = (st.spellBox?.visitors?.[g] ?? []).find(c => c.id === a.spell);
    if (!card) throw new Error(`The ${g} has no such Spell card.`);
    if (hasCurse(st, 'Ashes')) throw new Error('Your gold is worthless under the Ashes curse: nobody will sell to you.');
    const sp = spellOf(data, card.id);
    return { name: sp.name, base: SPELL_PRICE, ...learnState(st, sp) };
}
// He bought (or was given) the spell: he records it. The card stays with the visitor for others to learn (7.6.7c), and the line is for him alone (7.6.7: he does not reveal what he learns).
export function learnFromVisitor(st, data, visitor, id, erase = null, paid = null) {
    const sp = spellOf(data, id);
    if ((st.ch.spells ?? []).length >= MAX_SPELLS) {
        if (!erase || !st.ch.spells.includes(erase)) throw new Error(`You may know at most ${MAX_SPELLS} spells: say which one to erase.`);
        st.ch.spells = st.ch.spells.filter(x => x !== erase); st.ch.learned = (st.ch.learned ?? []).filter(x => x !== erase);
    }
    (st.ch.spells ??= []).push(sp.id);
    (st.ch.learned ??= []).push(sp.id);
    say(st, `You ${paid ? `pay ${paid} to the ${visitor} and ` : ''}learn ${sp.name} (Type ${sp.type}, ${sp.color ?? 'any colour'}), and leave the card with the ${visitor}.`, 'loot', null, { vis: 'owner' });
    return `You learn a spell from the ${visitor}.`;
}
