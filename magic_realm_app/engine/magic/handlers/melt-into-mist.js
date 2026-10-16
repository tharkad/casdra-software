import { B } from '../bridge.js';
import { HERO, nullifyFx, restoreFx, sameRef } from '../fx.js';
import { nullifyIfDuplicate, spellName } from '../util.js';
import { releaseFoes } from '../mist.js';

// Melt into Mist (VI / Purple / Permanent, strength 3, "one character, native or monster"): the target is transmorphized into mist. While the spell is energized
// (energize.js; it starts energized when cast, falls inert at Midnight unless a source other than the calendar still fills its place, wakes with its colour):
//   1. ACTIVITIES: he can do only Move, Hide and Follow (day.js executeSlot / planKinds; there is no Follow activity yet). The hidden paths and secret passages of the map are open to him
//      without being discovered, and he does not discover them (world.js roadsFrom). There is no Search, Trade, Hire, Rest, Alert or Enchant, so a wound never heals as mist.
//   2. BELONGINGS: his items, horses and recorded gold move into the spell (`st.ch.mist`), so nothing can be carried, spent, looted or stolen; they come back the moment the
//      spell goes inert, is broken or the game ends (a held-back pocket is also counted by score.js and the sudden-death check). New things cannot be picked up as mist for he
//      has no activity that gives any, so "cannot carry untransmorphized items" costs nothing more.
//   3. NO BLOCKING either way (summon.js blockers): no monster stops him at the end of a phase. Chits in his tile still turn and summon (only blocking is forbidden). Hirelings
//      keep following him. Blocking OTHERS is moot with one hero.
//   4. NO COMBAT: he is neither charged nor attacked and takes no part. Cast in a fight, every creature on his sheet is let go (a Tremendous monster's pick-up too, red side
//      down) and the fight ends for him at once ('mist'); each later Evening is skipped (day.js evening). The T4 Move chit "to run away" is never needed, so it is not modelled.
//   5. SPELLS: every other spell on him is nullified (the Pentangle and Protection from Magic machinery: `nullifyFx`, restored by `restoreFx` when mist ends; this includes his
//      own Day buffs, as the card says "not affected by spells"), curses and the Pit are shielded (tag `shield`, effects.js), and no new spell can be aimed at him (tag
//      `noNewSpells`). "Not affected by spells aimed at other targets": the area effects that reach him through his tile or clearing are switched off for mist at their readers
//      (modifiers.js tableMod for Bad Luck and Illusion, day.js lostActive for Lost and stormCheck for Violent Storm; Fog only closes the Peer table, which mist cannot search anyway;
//      Roof Collapses can be cast only by him, and mist casts nothing). The spell itself is NOT immune: Exorcise, Dissolve Spell and Remedy break it.
//   6. CONFLICT RANK 3 beats Transform (2) and Absorb Essence (1) (4.6.10f): energize.js refuses to wake a weaker Permanent spell on the target while a stronger one is energized.
// Decisions (spec 02 section 19, question 11 and section 15): he cannot cast as mist (cast.js); a second Melt on him is nullified (4.6.10e); the target is the hero (self) in v1,
// natives and monsters belong to the later "spells at others" step. The spell never prompts a quiet evening (`useful` false) and the computer players never cast it.
export default {
    id: 'melt-into-mist', dur: 'permanent', strength: 3, benevolent: true, selfOnly: true,
    legal: st => (st.ch.mist ? 'You are already mist.' : true),
    useful: () => false,
    start(ctx) {
        const { st, data } = ctx, c = st.combat;
        const fx = ctx.fx({ targets: [HERO], strength: 3 });                // the record is energized as it is cast (fx.js addFx), which stashes his belongings (apply)
        if (fx.state !== 'live') { ctx.log('Melt into Mist: you are already mist; the second spell does nothing.'); return; }
        ctx.log('Melt into Mist: you turn to mist. You can only move and hide, nothing can block or harm you, and your belongings and gold ride in the spell until you are yourself again.');
        if (c && !c.ended) {
            releaseFoes(c);
            // a quiet-evening cast has no melee step: encounterAction ends that combat itself
            if (!c.spellOnly) B.endCombat(st, data, 'mist');
        }
    },
    tags: () => ({ shield: 'spells', noNewSpells: true, mist: true }),
    apply(ctx, fx) {
        const { st, data } = ctx;
        if (nullifyIfDuplicate(st, fx)) return;
        if (st.ch.mist) return;                                              // already in mist (a restore that did not need to undo anything)
        st.ch.mist = { items: st.ch.items, gold: st.ch.gold, day: st.day };
        st.ch.items = []; st.ch.gold = 0;
        fx.data.held = [];
        for (const f of st.fx ?? []) {
            if (f === fx || f.state !== 'live' || !f.targets.some(t => sameRef(t, HERO))) continue;
            nullifyFx(st, data, f.id); fx.data.held.push(f.id);
            ctx.say(`${spellName(data, f.spell)} is held off by the mist.`);
        }
    },
    unapply(ctx, fx) {
        const { st, data } = ctx;
        const m = st.ch.mist;
        if (m && !fx.data.duplicate) {
            st.ch.items = [...m.items, ...st.ch.items];                     // what came with him, then anything picked up since
            st.ch.gold += m.gold;
            st.ch.mist = null;
            ctx.say('You are yourself again; your belongings and gold return to you.');
        }
        for (const id of fx.data.held ?? []) restoreFx(st, data, id);
        fx.data.held = [];
    },
    ai: { role: 'utility' },
};
