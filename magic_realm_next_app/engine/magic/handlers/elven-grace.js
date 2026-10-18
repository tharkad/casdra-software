import { B } from '../bridge.js';
import { HERO } from '../fx.js';
import { foes, denRef, foeName, nullifyIfDuplicate } from '../util.js';

// Elven Grace (III / Gold / Combat): one character, monster or native. The strength of each of a character's Move chits (L 1, M 2, H 3, T 4) becomes its time
// number; a monster or native's size becomes its move time on both sides of the counter. Move times only: not attack times, Duck, horses or Boots cards.
// Decisions (01-combat-spells.md section 4, Question 8): the hero or any live creature may be named; the picker shows what the creature's move becomes and lists the
// ones it slows first (so the computer players take the best); a native's size is its vulnerability, as RealmSpeak reads it; a second casting on the same target is
// held nullified; the Draught/Garb of Speed exceptions are not modelled (those cards are not in the game yet). The effect is read through the tag `moveBySize`
// (combat.js denSide for creatures, activeChits for the hero's Move chits; the chits themselves are unchanged).
const SIZE = { L: 1, M: 2, H: 3, T: 4 };
const sizeOf = (data, d) => (d.kind === 'nat' ? data.natives[d.id].vulnerability : data.monsters[d.id].size);
function options(st, data) {
    const out = foes(st).filter(d => d.kind === 'mon' || d.kind === 'nat').map(d => {
        const now = B.denSide(st, data, d).move, to = SIZE[sizeOf(data, d)];
        return { ref: denRef(d), label: `${foeName(st, data, d)}: move ${now} becomes ${to}${to > now ? ', slower' : to < now ? ', faster' : ''}`, gain: to - now, den: d };
    }).sort((a, b) => b.gain - a.gain);
    const slowed = out.filter(o => o.gain > 0), rest = out.filter(o => o.gain <= 0);
    const hero = { ref: HERO, label: 'yourself: each Move chit takes its strength as its time', gain: 0 };
    return [...slowed, hero, ...rest];
}
export default {
    id: 'elven-grace', dur: 'combat', benevolent: false,
    aim: (st, data) => options(st, data),
    legal: () => true,
    useful: (st, data) => options(st, data).some(o => o.gain > 0 && o.den?.assigned),
    start(ctx) {
        const { st } = ctx, t = ctx.targets[0] ?? HERO;
        ctx.fx({ targets: [t], expires: { day: st.day, at: 'midnight' } });
        ctx.log(t.id === 'ch' ? 'Elven Grace: each of your Move chits now takes its strength as its time number.' : `Elven Grace: the ${t.kind === 'mon' ? ctx.data.monsters[t.id].name : ctx.data.natives[t.id].name} moves at the speed of its size until Midnight.`);
    },
    tags: () => ({ moveBySize: true }),
    apply(ctx, fx) { nullifyIfDuplicate(ctx.st, fx); },
    ai: { role: 'control' },
};
