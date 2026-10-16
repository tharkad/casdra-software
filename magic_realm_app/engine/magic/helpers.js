import { ref, fxList, breakFx } from './fx.js';
import { spellDef } from './registry.js';

// Small pieces the Day and Permanent spell handlers share.
export const tileRef = id => ref('tile', id);
export const chitRef = id => ref('chit', id);

// A Day spell cast in the Evening of day D lives until Sunset of D+1 (4.6.7, 8.1.1).
export const dayExpiry = st => ({ day: st.day + 1, at: 'sunset' });
// ...so one cast on the last day of the game is wasted. (An endless game has no last day.)
export const dayUseful = st => st.mode === 'endless' || st.day < (st.lastDay ?? 28);

// Is the same spell already on this target? A second one of the same spell on the same target is nullified (4.6.10e): the later cast does nothing and
// its chit tires at once.
export const alreadyOn = (st, spell, target) => fxList(st, { spell, target, any: true }).length > 0;

// The targets a handler was aimed at, or the caster himself when nothing was named (a lone choice, spell-only evenings, computer players).
export const targetsOr = (ctx, fallback) => (ctx.targets?.length ? ctx.targets : [fallback]);

// A spell that only does harm to others (Fog, Illusion, Lost, Bad Luck): with one hero in the game nobody else can be its target, so it is never
// worth a prompt. It stays castable through the API for tests and for the multi-character game to come.
export const hostileOnly = () => false;

// Put the effect on its targets unless the same spell is already on all of them. Returns the record, or null when the casting did nothing.
export function startFx(ctx, targets, spec = {}) {
    const name = ctx.spell?.name ?? 'The spell';
    if (targets.length && targets.every(t => alreadyOn(ctx.st, ctx.spell.id, t))) { ctx.log(`${name} is already in force there: casting it again does nothing.`); return null; }
    return ctx.fx({ targets, ...spec });
}

// ---- spells that change the numeral of the caster's own Magic chits (Witch's Brew, Faerie Lights; rule 4.6.10c) ----
// `map` is { fromNumeral: toNumeral }. The change is an overlay on the chit (chit.numeral, with chit.baseNumeral remembering the printed one), so every
// reader of a chit's numeral (casting, enchanting, Reading Runes) sees the new Type. Time and effort do not change. The casting chit is never a target.
// When the spell ends the chits go back. A chit that was enchanted while altered is fatigued (its colour was the altered Type's), and a spell still tied
// to an altered chit is broken (RealmSpeak; decision 10 of the spec).
export function chitAlterSpell({ id, map, name, flavour }) {
    const eligible = (st, castChit) => st.ch.chits.filter(c => c.type === 'magic' && c.state === 'active' && map[c.numeral] && !c.baseNumeral && c.id !== castChit);
    return {
        id, dur: 'day', benevolent: true,
        // any of his chits that he chooses: naming none takes all that qualify
        targets: { min: 0, max: 12 },
        aim: (st, data, { cast }) => eligible(st, cast?.chit).map(c => ({ ref: chitRef(c.id), label: `Magic ${c.numeral}${c.time}${'*'.repeat(c.effort)} becomes Type ${map[c.numeral]}` })),
        useful: (st, data, opt) => dayUseful(st) && eligible(st, opt?.chit).length > 0,
        start(ctx) {
            const { st } = ctx;
            const all = eligible(st, ctx.source?.id);
            const named = ctx.targets.filter(t => t.kind === 'chit').map(t => t.id);
            const mine = named.length ? all.filter(c => named.includes(c.id)) : all;
            if (!mine.length) { ctx.log(`${name}: there is no Magic chit to change.`); return; }
            const changes = mine.map(c => ({ id: c.id, from: c.numeral, to: map[c.numeral] }));
            ctx.fx({ targets: mine.map(c => chitRef(c.id)), expires: dayExpiry(st), data: { changes } });
            ctx.log(`${name}: ${changes.map(c => `Type ${c.from} becomes Type ${c.to}`).join(', ')} until Sunset tomorrow. ${flavour}`);
        },
        apply(ctx, fx) {
            for (const ch of fx.data.changes ?? []) {
                const chit = ctx.st.ch.chits.find(c => c.id === ch.id);
                if (chit && chit.numeral === ch.from) { chit.baseNumeral ??= ch.from; chit.numeral = ch.to; }
            }
        },
        unapply(ctx, fx, info = {}) {
            const { st } = ctx, ending = info.why !== 'nullified' && info.why !== 'inert';
            for (const ch of fx.data.changes ?? []) {
                const chit = st.ch.chits.find(c => c.id === ch.id);
                if (!chit || chit.numeral !== ch.to) continue;
                if (ending) {
                    if (chit.state === 'enchanted') { chit.state = 'fatigued'; ctx.say(`Your altered Magic chit loses its colour as ${name} ends.`); }
                    if (chit.state === 'committed' && chit.tie && chit.tie !== fx.id) breakFx(st, ctx.data, chit.tie, `${name} ended`);
                }
                chit.numeral = ch.from;
                if (chit.baseNumeral === ch.from) delete chit.baseNumeral;
            }
        },
        ai: { role: 'buff' },
    };
}
