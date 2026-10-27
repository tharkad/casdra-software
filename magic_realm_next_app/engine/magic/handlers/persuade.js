import { foes, denRef, setPeaceful } from '../util.js';
import { stoppedByHireling } from '../followers.js';

// Persuade (III / Gold / Day): one native group, or all the Giants, or all the Ogres in the caster's clearing. He pacifies them; to hire them he uses the Friendly
// column of the Meeting Table.
// Decisions (01-combat-spells.md section 11, Question 7). This is the simplest faithful version, built on this branch's own pacify flag (`pacified` on a combat counter,
// the tag `unassigned`, set by setPeaceful in util.js): the pacified are not set on him, not boxed, and are not reassigned while the spell lives; naming or attacking any
// one of them (the tag `nameBreaks`, combat.js namedTarget), by him or a spell of his, breaks the whole spell. To hire a pacified native group he uses at least the
// Friendly column (hire.js relFor: max(his standing, Friendly)). The engine cannot hire monsters, so pacified Giants and Ogres are only left in peace. The spell runs until
// Sunset of the next day, so it buys peace for the rest of tonight's rounds and a Friendly Hire in tomorrow's Daylight. Cast from an artifact or spell book, the holder is
// the one who pacifies (he is the only character, so nothing changes).
const kindsHere = (st, data) => {
    const out = [];
    for (const g of new Set(foes(st).filter(d => d.kind === 'nat' && !d.pacified).map(d => data.natives[d.id].group))) out.push({ ref: { kind: 'group', id: g }, label: `the ${g}` });
    for (const sp of ['Giant', 'Ogre']) if (foes(st).some(d => d.kind === 'mon' && !d.pacified && data.monsters[d.id].family === sp)) out.push({ ref: { kind: 'species', id: sp }, label: `all the ${sp}s here` });
    return out;
};
const membersOf = (st, data, ref) => foes(st).filter(d => !d.pacified && (ref.kind === 'group' ? d.kind === 'nat' && data.natives[d.id].group === ref.id : d.kind === 'mon' && data.monsters[d.id].family === ref.id));

export default {
    id: 'persuade', dur: 'day', benevolent: false,
    aim: (st, data) => { const o = kindsHere(st, data); return o.length ? o : null; },
    legal: (st, data) => (kindsHere(st, data).length ? true : 'There is no native group, Giant or Ogre here to persuade.'),
    useful: (st, data) => kindsHere(st, data).some(o => membersOf(st, data, o.ref).some(d => d.assigned)),
    start(ctx) {
        const { st, data } = ctx, ref = ctx.targets[0], members = ref ? membersOf(st, data, ref) : [];
        if (!members.length) { ctx.log('Persuade finds no one to pacify.'); return; }
        if (stoppedByHireling(ctx, members, 'Persuade')) return;          // 8.4.4b
        ctx.fx({ targets: members.map(denRef), expires: { day: st.day + 1, at: 'sunset' }, data: { group: ref.kind === 'group' ? ref.id : null, kind: ref.id } });
        ctx.log(`Persuade: the ${ref.kind === 'group' ? ref.id : `${ref.id}s`} are pacified until Sunset tomorrow; attack one and the peace is broken.`);
    },
    tags: () => ({ unassigned: true, nameBreaks: true }),
    apply(ctx, fx) { setPeaceful(ctx.st, fx.targets, true, fx); },
    unapply(ctx, fx) { setPeaceful(ctx.st, fx.targets, false, fx); },
    ai: { role: 'control' },
};
