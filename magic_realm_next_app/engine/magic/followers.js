import { monsterJoins, monsterLeaves } from '../combat.js';
import { breakFx } from './fx.js';

// Creatures a spell puts under the caster's hand (docs/design/magic/03-control-spells.md section 1). Three relationships, all on the monster record:
//   controlled (Control Bats, Guide Spider or Octopus)  m.hired = true, m.controlledUntil = the day it is freed, m.tie = { kind: 'control', fx }
//                                                       it follows him, is on c.hires in a fight, and is an ordinary monster again when the spell ends
//   pacified   (Deal with Goblins)                      m.pacify = [{ fx, by: 'ch' }]: it blocks nothing, is set on nobody and can be hired (hire.js)
//   hired      (hire.js)                                m.hired = true, m.hiredUntil = day + 13, independent of any spell

export const monOf = (st, ref) => st.mons.find(m => m.id === ref.id);
export const monRef = m => ({ kind: 'mon', id: m.id });
export const familyOf = (data, den) => (den.kind === 'mon' ? data.monsters[den.id]?.family : null);

// The monsters of the given families in the fight that he could take in hand: alive, not already pacified, not already set on by his own hirelings (RS ControlEffect:21-45).
export function controllable(st, data, families, { engaged = false } = {}) {
    return (st.combat?.dens ?? []).filter(d => d.kind === 'mon' && !d.dead && (engaged || !d.engagedBy) && !d.pacified && families.includes(familyOf(data, d)));
}

// 8.4.2h.1 / 8.4.4b: if any of his hirelings is assigned to attack one of the spell's targets at the moment it would go into effect, the whole spell is cancelled.
// `dens` are all the spell's targets in the clearing (not only those it could still take). Logs and returns true when the spell is stopped.
export function stoppedByHireling(ctx, dens, name) {
    const { st } = ctx, hires = st.combat?.hires ?? [];
    if (!dens.some(d => d.engagedBy && hires.some(h => h.uid === d.engagedBy && !h.dead))) return false;
    ctx.log(`${name}: one of your hirelings is set on one of its targets, so the spell is cancelled.`);
    return true;
}

// Take these monsters in hand until Sunset tomorrow. Returns the spell effect (null when none could be taken).
export function takeControl(ctx, dens, { text }) {
    const { st, data } = ctx;
    const taken = [];
    for (const d of dens) {
        const m = st.mons.find(x => x.id === d.id && !x.dead && !x.hired);
        if (!m) continue;
        monsterJoins(st, data, d);
        m.hired = true; m.hiredBy = st.ch.id; m.controlledUntil = st.day + 1; m.hiredUntil = null; m.tie = { kind: 'control' };
        taken.push(m);
    }
    if (!taken.length) return null;
    const fx = ctx.fx({ targets: taken.map(monRef), expires: { day: st.day + 1, at: 'sunset' } });
    for (const m of taken) m.tie.fx = fx.id;
    ctx.log(text(taken));
    return fx;
}
// The spell ended or was broken: every monster it held is free again.
export function releaseControl(ctx, fx) {
    const { st, data } = ctx;
    for (const t of fx.targets) {
        const m = monOf(st, t);
        if (!m || !m.hired || m.tie?.kind !== 'control') continue;
        m.hired = false; delete m.hiredBy; m.controlledUntil = null; m.tie = null;
        ctx.say(`Your control of the ${data.monsters[m.id].name} ends.`);
        monsterLeaves(st, data, m);
    }
}

// Pacify these monsters in the fight (Deal with Goblins).
export function pacify(ctx, dens, { text }) {
    const { st } = ctx;
    const calm = [];
    for (const d of dens) {
        const m = st.mons.find(x => x.id === d.id && !x.dead && !x.hired);
        if (!m) continue;
        d.pacified = true; d.bystander = true; d.assigned = false; d.engagedBy = null;
        calm.push(m);
    }
    if (!calm.length) return null;
    const fx = ctx.fx({ targets: calm.map(monRef), expires: { day: st.day + 1, at: 'sunset' } });
    for (const m of calm) (m.pacify ??= []).push({ fx: fx.id, by: 'ch' });
    ctx.log(text(calm));
    return fx;
}
export function releasePacify(ctx, fx) {
    const { st, data } = ctx;
    for (const t of fx.targets) {
        const m = monOf(st, t);
        if (!m?.pacify) continue;
        m.pacify = m.pacify.filter(p => p.fx !== fx.id);
        if (!m.pacify.length) {
            m.pacify = null;
            const c = st.combat, den = c && !c.ended ? c.dens.find(d => d.kind === 'mon' && d.id === m.id && !d.dead) : null;
            if (den) { den.pacified = false; den.bystander = false; den.assigned = false; ctx.say(`The ${data.monsters[m.id].name} is no longer calm.`); }     // set on him again from the next round
        }
    }
}
// He named a pacified monster: the spell that calmed it (and so its whole kind here) is broken (RS SpellWrapper:421-425).
export function breakPacify(st, data, den, log) {
    const m = st.mons.find(x => x.id === den.id);
    for (const p of [...(m?.pacify ?? [])]) {
        const fx = st.fx?.find(f => f.id === p.fx);
        if (fx) { log?.('Your attack breaks the spell that kept the peace.'); breakFx(st, data, fx.id, 'he attacked what it pacified'); }
    }
}
