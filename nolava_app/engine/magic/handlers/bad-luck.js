import { HERO } from '../fx.js';
import { hostileOnly, startFx, targetsOr } from '../helpers.js';
// Bad Luck (VIII / any colour / Permanent, one character): while energized the target adds one to every table roll he makes (4.1.1 to 4.1.4). On the
// tables the hero uses, high is bad: Hide (6 fails), Peer and Locate (6 Nothing), Loot (deeper), Reading Runes (5 Curse, 6 Nothing), Missile, Meeting.
// Not the Monster Roll (4.1.3), not a hireling's rolls (4.1.4). modifiers.js tableMod/modRoll read the tag at each dice site. Suspended (nullified) by
// Protection from Magic. Hostile: with one hero nobody else can be its target, so it is never useful alone (castable through the API for tests).
// Spec: docs/design/magic/02-day-spells.md section 12.
export default {
    id: 'bad-luck', dur: 'permanent', benevolent: false,
    useful: hostileOnly,
    aim: () => [{ ref: HERO, label: 'Yourself (nobody else is here)' }],
    start(ctx) {
        if (startFx(ctx, targetsOr(ctx, HERO))) ctx.log('Bad Luck: the target adds one to every table roll while this is energized.');
    },
    tags: () => ({ tableMod: { kinds: 'all', delta: +1 } }),
    ai: { role: 'control' },
};
