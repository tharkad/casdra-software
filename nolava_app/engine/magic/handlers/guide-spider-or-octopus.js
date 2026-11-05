import { controllable, takeControl, releaseControl } from '../followers.js';

// Guide Spider or Octopus (VIII / Grey / Day): one Spider or the Octopus in the caster's clearing is his until Sunset tomorrow, like Control Bats for a single monster.
// A Tremendous one that had seized him lets go (question 11). The filter is the monster's family, not its name; a monster his hirelings already fight is not offered.
const KINDS = ['Spider', 'Octopus'];
const one = (st, data) => controllable(st, data, KINDS);

export default {
    id: 'guide-spider-or-octopus', dur: 'day', benevolent: false,
    targets: { min: 1, max: 1 },
    aim: (st, data) => {
        const out = one(st, data).map(d => ({ ref: { kind: 'mon', id: d.id }, label: `${data.monsters[d.id].name}${d.tag ? ` #${d.tag}` : ''}` }));
        return out.length ? out : null;
    },
    useful: (st, data) => one(st, data).length > 0,
    start(ctx) {
        const { st, data } = ctx;
        const den = one(st, data).find(d => ctx.targets.some(t => t.kind === 'mon' && t.id === d.id));
        const fx = den && takeControl(ctx, [den], { text: ([m]) => `Guide Spider or Octopus: the ${data.monsters[m.id].name} is yours. It fights for you and follows you until Sunset tomorrow, when it is free again.` });
        if (!fx) ctx.log('Guide Spider or Octopus: the creature is no longer there to take.');
    },
    unapply: (ctx, fx) => releaseControl(ctx, fx),
    ai: { role: 'control' },
};
