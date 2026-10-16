import { HERO, fxList, nullifyFx, restoreFx, sameRef } from '../fx.js';
import { startFx, targetsOr } from '../helpers.js';
import { handlerOf } from '../registry.js';
// Protection from Magic (VII / Gold / Phase, one character): casting only PREPARES it. The record is `held` and the Magic chit stays committed; the target
// activates it like an item, either at the start of a Daylight phase (action {type:'protect'}) or in the Encounter step of a combat round
// ({act:'protect'}, in place of a chit action, so he cannot also cast that round). While it is active it nullifies every spell and curse bewitching him
// (suspended, not broken: they come back afterwards) and refuses new ones; spells aimed at other targets still work (4.6.8, 8.3.9). It ends with the phase or
// round (fx.js expireDue 'phase-end' / 'round-end') and its chit is then fatigued. A held spell is not cleared at Midnight (RealmSpeak; decision 9 of the spec).
// How it suspends: the live effects that name him are nullified (fx.js nullifyFx, restored by restoreFx), his curses are set aside in fx.data.curses, and
// the tag `shield` makes effects.js rollCurse and pit report "protected" without rolling. His own helpful Day effects are suspended too (the button should
// warn); a Blend Into Background phase already on the plan still happens. DECISION (spec question 12): unlike RealmSpeak he is NOT made immune to a Demon
// or Imp's attack itself, only to their Power of the Pit and curse. Spec: docs/design/magic/02-day-spells.md section 17.
const onHim = (st, o) => o.state === 'live' && o.targets.some(t => sameRef(t, HERO));
export default {
    id: 'protection-from-magic', dur: 'phase', benevolent: true,
    // worth preparing when something bewitches him, or a Demon or Imp is in the fight; one held at a time is plenty
    useful: (st, data) => {
        if (fxList(st, { spell: 'protection-from-magic', state: 'held', any: true }).length) return false;
        const hex = (st.ch.curses ?? []).length > 0 || st.fx?.some(f => onHim(st, f) && f.spell !== 'protection-from-magic' && handlerOf(f.spell)?.benevolent === false);
        const fiend = (st.combat?.dens ?? []).some(d => !d.dead && d.kind === 'mon' && /Demon|Imp/.test(data.monsters[d.id]?.name ?? ''));
        return !!(hex || fiend);
    },
    start(ctx) {
        const fx = startFx(ctx, targetsOr(ctx, HERO), { state: 'held', expires: null });
        if (fx) ctx.log('Protection from Magic is prepared. Use it at the start of a phase or in the Encounter step, instead of a chit action.');
    },
    apply(ctx, fx) {
        if (fx.state !== 'live') return;                                 // a held spell does nothing yet
        const { st, data } = ctx;
        fx.data.suspended = (st.fx ?? []).filter(o => o !== fx && onHim(st, o)).map(o => { nullifyFx(st, data, o.id); return o.id; });
        fx.data.curses = st.ch.curses ?? []; st.ch.curses = [];
        ctx.say(`Protection from Magic is active: ${fx.data.suspended.length + fx.data.curses.length ? 'the spells and curses on you are set aside' : 'new spells and curses cannot touch you'}.`);
    },
    unapply(ctx, fx) {
        if (!fx.data.suspended) return;                                  // it was never used
        const { st, data } = ctx;
        for (const id of fx.data.suspended) restoreFx(st, data, id);
        st.ch.curses = [...new Set([...(fx.data.curses ?? []), ...(st.ch.curses ?? [])])];
        fx.data.suspended = null;
    },
    tags: () => ({ shield: 'spells' }),
    ai: { role: 'heal' },
};
