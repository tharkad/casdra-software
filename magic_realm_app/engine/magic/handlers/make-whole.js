import { spentThisRound } from '../util.js';
// Make Whole (I / White / Instant): every tired or wounded chit of the target, and every damaged piece of armor, is put right.
// It does not mend the chit that cast it, nor harm done this round. It also breaks the Wither curse on the target.
export default {
    id: 'make-whole', dur: 'instant', benevolent: true, selfOnly: true,
    // worth a prompt when something is tired, wounded or damaged (the casting chit does not count: it tires after)
    useful: (st, data, opt) => st.ch.chits.some(c => c.id !== opt.chit && !spentThisRound(st).has(c.id) && (c.state === 'fatigued' || c.state === 'wounded'))
        || st.ch.items.some(i => i.kind === 'armor' && i.damaged && !i.destroyed) || (st.ch.curses ?? []).includes('Wither'),
    start(ctx) {
        const { st } = ctx, chit = ctx.source?.id, spent = spentThisRound(st);
        let chits = 0, armor = 0;
        for (const x of st.ch.chits) if (x.id !== chit && !spent.has(x.id) && (x.state === 'fatigued' || x.state === 'wounded')) { x.state = 'active'; chits++; }
        for (const it of st.ch.items) if (it.kind === 'armor' && it.damaged && !it.destroyed) { it.damaged = false; armor++; }
        const wither = (st.ch.curses ?? []).includes('Wither');
        if (wither) st.ch.curses = st.ch.curses.filter(n => n !== 'Wither');
        ctx.log(`Make Whole: ${chits} action chit${chits === 1 ? '' : 's'} restored${armor ? ` and ${armor} piece${armor === 1 ? '' : 's'} of armor repaired` : ''}${wither ? '; the Wither curse is broken' : ''}.`);
    },
    ai: { role: 'heal' },
};
