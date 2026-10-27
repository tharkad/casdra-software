import { pacify, releasePacify, familyOf, stoppedByHireling } from '../followers.js';

// Deal with Goblins (VIII / Black / Day): every Goblin in the caster's clearing is pacified until Sunset tomorrow; to hire them he uses the Neutral column.
// A pacified monster is not set on him, blocks nothing and is not a foe (combat.js `pacified` dens; summon.js `blockers`). Spear, Sword and Axe Goblins all count.
// The spell breaks if he names a pacified Goblin (combat.js meleePlay), or when it is dissolved. Decisions: pacified monsters are hired a kind at a time by name
// (RS ClearingUtility:514, question 3); hired, a Goblin no longer depends on the spell (hire.js hireMonsters); his hirelings never go for a pacified Goblin.
const here = (st, data) => (st.combat?.dens ?? []).filter(d => d.kind === 'mon' && !d.dead && !d.controlled && !d.pacified && familyOf(data, d) === 'Goblin');

export default {
    id: 'deal-with-goblins', dur: 'day', benevolent: false,
    useful: (st, data) => here(st, data).length > 0,
    start(ctx) {
        const { st, data } = ctx;
        if (stoppedByHireling(ctx, here(st, data), 'Deal with Goblins')) return;          // 8.4.4b
        const fx = pacify(ctx, here(st, data), { text: calm => `Deal with Goblins: ${calm.length === 1 ? 'the Goblin is' : `all ${calm.length} Goblins are`} calmed. They will not fight or block you until Sunset tomorrow, and you may hire them at the Neutral column.` });
        if (!fx) ctx.log('Deal with Goblins: there are no Goblins here.');
    },
    unapply: (ctx, fx) => releasePacify(ctx, fx),
    ai: { role: 'control' },
};
