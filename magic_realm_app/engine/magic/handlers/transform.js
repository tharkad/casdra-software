import { roll2, noteRoll, lvl } from '../../core.js';
import { denSide } from '../../combat.js';
import { HERO } from '../fx.js';
import { creatureOfRow, putOn, takeOff, holdUnderShield } from '../morph.js';

// Transform (VI / Purple / Permanent): the spellcaster rolls the Transform Table and the target becomes that creature (monster or beast).
// Monsters and natives (denizens in the fight and his hirelings), and the hero himself (a gamble): see "On the hero" below.
//
// The creature replaces the target's combat numbers (combat.js denSide / hireStats read the `morph` tag), its bounty, name and place stay the original's: a Dragon turned
// Frog and killed by a Light blow still pays the Dragon's bounty (RS TransmorphEffect:217-234). A transformed native fights without his horse (the card moves his gear with
// him; this is our reading, RS does not special-case it); a transformed monster has no head or club of its own. A Tremendous monster that had seized him lets go.
//
// Decision (00-framework.md question 10): the spell is Permanent on a hostile denizen, but he can seldom energize it again, so on a monster or native it lasts like a Combat
// spell: it falls inert at Midnight and the creature is its old self again. No energizing exists in this engine yet (M5); when it lands, drop `expires` here and let the
// energize pass keep the spell (the Transform is then meant to survive Midnight when its colour is supplied automatically).
// Strength (conflict rank) is 2, above Absorb Essence (1) and below Melt into Mist (3).
//
// On the hero (docs/design/magic/03-control-spells.md section 9 and the Implementation notes): he rolls once and becomes the creature (Tremendous Dragon, Lion, Eagle, Bird,
// Squirrel, Frog) for as long as the spell is energized. Unlike on a denizen it is truly Permanent here: inert at Midnight unless Purple is supplied automatically where he
// stands, and each energizing makes him the same creature with no new roll (fx.data.row). His gold and belongings, horses included, are put into the spell and come back,
// merged with what he gained meanwhile, when the form ends (morph.js putOn/takeOff). Decisions: he is a man again, with all his chits, while it is inert; he may name himself
// only in the Melee step like any target; the computer players never do (useful stays false for him); with nothing aimed he picks a creature, and himself only when no creature is there.
const present = (st) => (st.combat?.dens ?? []).filter(d => (d.kind === 'mon' || d.kind === 'nat') && !d.dead);

export default {
    id: 'transform', dur: 'combat', strength: 2, transmorph: true, benevolent: false,
    targets: { min: 1, max: 1 },
    aim: (st, data) => {
        const c = st.combat, out = [];
        for (const d of present(st)) {
            const o = d.kind === 'mon' ? data.monsters[d.id] : data.natives[d.id];
            out.push({ ref: { kind: d.kind, id: d.id }, label: `${o.name}${d.tag ? ` #${d.tag}` : ''}${d.bystander ? ' (standing by)' : ''}` });
        }
        for (const h of c?.hires ?? []) if (!h.dead) out.push({ ref: { kind: h.kind, id: h.id }, label: `${(h.kind === 'mon' ? data.monsters : data.natives)[h.id].name} (yours)` });
        if (!st.ch.morph) out.push({ ref: HERO, label: 'yourself (a gamble: you become whatever the dice say)' });
        return out.length ? out : null;
    },
    // nothing named: the first creature; himself only when there is no one else to name (a quiet evening: then casting it at all means he wants the gamble)
    autoAim: options => (options.find(o => o.ref.kind !== 'char') ?? options[0] ? [(options.find(o => o.ref.kind !== 'char') ?? options[0]).ref] : []),
    // a gamble (three rolls in four leave a creature harmless or weak): worth a prompt only against something Heavy or worse
    useful: (st, data) => present(st).some(d => !d.bystander && (lvl(denSide(st, data, d).harm ?? 'N') >= 3 || lvl(denSide(st, data, d).vuln ?? 'N') >= 3)),
    start(ctx) {
        const { st, data } = ctx, c = st.combat;
        const t = ctx.targets[0];
        if (t?.kind === 'char') return startOnHero(ctx);
        const den = t && c.dens.find(d => d.kind === t.kind && d.id === t.id && !d.dead);
        const hire = !den && t && (c.hires ?? []).find(h => h.kind === t.kind && h.id === t.id && !h.dead);
        if (!den && !hire) { ctx.log('Transform: the target is no longer there.'); return; }
        const r = roll2(st), row = data.tables.transform.rows.find(x => x.roll === r.value);
        noteRoll(st, 'Transform Table', r.dice, r.value, row.name);
        const orig = (t.kind === 'mon' ? data.monsters : data.natives)[t.id];
        ctx.fx({ dur: 'combat', targets: [{ kind: t.kind, id: t.id }], expires: { at: 'midnight' }, strength: 2, data: { row } });
        ctx.log(`Transform: the ${orig.name} becomes a ${row.name}.`);
    },
    // the creature is read through the tag; the pieces it does not have leave the sheet while the spell lives and come back after
    tags: fx => (fx.targets[0]?.kind === 'char' ? {} : { morph: fx.data?.row }),
    apply(ctx, fx) {
        if (fx.targets[0]?.kind !== 'char') return shape(ctx, fx, true);
        const { st, data } = ctx;
        if (st.ch.dead || holdUnderShield(st, fx)) return;
        fx.data.creature ??= creatureOfRow(fx.data.row);
        putOn(st, data, fx, fx.data.creature, { hold: true });
        ctx.say(`You become a ${fx.data.creature.name}: you fight with its numbers, and your gold and belongings are bound up in the spell until it ends.`);
    },
    unapply(ctx, fx, info) {
        if (fx.targets[0]?.kind !== 'char') return shape(ctx, fx, false);
        const { st } = ctx;
        if (st.ch.morph?.fx !== fx.id) return;
        takeOff(st, ctx.data, fx);
        if (!st.ch.dead) ctx.say(info.why === 'inert' ? 'The magic fades: you are yourself again, with your gold and belongings.' : 'You are yourself again, with your gold and belongings.');
    },
    ai: { role: 'control' },
};

// Transform aimed at himself: one roll on the Transform Table, and the spell is Permanent (inert at Midnight, the same creature each time it is energized).
function startOnHero(ctx) {
    const { st, data } = ctx;
    const r = roll2(st), row = data.tables.transform.rows.find(x => x.roll === r.value);
    noteRoll(st, 'Transform Table', r.dice, r.value, row.name);
    const fx = ctx.fx({ targets: [HERO], strength: 2, data: { row, creature: creatureOfRow(row) } });
    ctx.log(`Transform: you become a ${row.name}.${fx.state === 'live' ? '' : ' A stronger spell holds you down, so for now you are yourself.'}`);
    if (st.combat) st.combat.eventful = true;
}

function shape({ st }, fx, on) {
    const c = st.combat, t = fx.targets[0];
    if (!c || c.ended || !t) return;
    const den = c.dens.find(d => d.kind === t.kind && d.id === t.id);
    if (!den) return;
    if (on && den.pickedUp) { den.pickedUp = false; den.side = 'light'; }
    for (const p of c.dens.filter(d => d.partOf === den.uid && d.kind === 'part')) p.dead = on || den.dead;
    for (const h of c.dens.filter(d => d.partOf === den.uid && d.kind === 'horse')) h.dead = on || !!st.nats.find(n => n.id === h.owner)?.horseDead;
}
