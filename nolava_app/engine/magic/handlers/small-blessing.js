import { B } from '../bridge.js';
import { shielded, expireFx } from '../fx.js';
import { roll2, noteRoll, lvl } from '../../core.js';
import { graph, roadsFrom, nameOfClearing } from '../../world.js';
import { nameOf } from '../../items.js';
import { releaseFoes } from '../mist.js';
import { characters, cancelCasts, foes, denRef, foeName, spentThisRound } from '../util.js';

// Small Blessing (I / White / Instant): one character rolls on the Wishes Table (two dice, higher counts) and the wish comes true.
// Decisions (01-combat-spells.md section 3; the spec's RealmSpeak readings for results 4 to 6, Questions 1, 10 and 13):
//  1 Elsewhere (self): he, his horses and his belongings go to a clearing of his choice; hirelings stay and rejoin at his next move; his evening ends.
//  2 Elsewhere (other): one other creature here (a hireling of his own too) is sent to its starting place: its spells end, a hireling is unhired, no bounty.
//  3 Vision: he looks at the contents of one native group's box on the Setup Card; the list goes into his notes.
//  4 Peace: for the round of the wish and two rounds more nobody may target or attack (S7, the table's note 4); every spell not yet in effect is cancelled (natives stay hostile tomorrow).
//  5 Health: all tired and wounded chits are restored like Make Whole (not the casting chit, nor a colour chit spent this round); no armor is repaired;
//    the Ill Health and Wither curses are lifted.
//  6 Strength: the next Fight chit or Gloves he plays strikes with a flat Tremendous harm, no stars, no roll (RealmSpeak); lost at Midnight if unused.
// The choices a result may ask for are named beforehand in the aim step (`params`: clearing, other, box); without them the first sensible one is taken
// (the neighbouring clearing, the most dangerous creature, the first box with goods). A target shielded from magic is unaffected and the spell is spent.
const stockBoxes = st => Object.entries(st.stock ?? {}).filter(([, list]) => list?.length).map(([g, list]) => ({ group: g, list }));
const danger = (st, data, d) => { const s = B.denSide(st, data, d); return (s.harm ? lvl(s.harm) : 4) * 2 + (s.stars ?? 0) + (s.attack === 'spell' ? 8 : 0); };

// Other creatures here that can be sent away: the foes on the sheet, and his own hirelings.
const others = (st, data) => [
    ...foes(st).map(d => ({ ref: denRef(d), label: foeName(st, data, d), den: d })),
    ...(st.combat?.hires ?? []).filter(h => !h.dead).map(h => ({ ref: { kind: 'nat', id: h.id }, label: `${data.natives[h.id].name} (your hireling)`, hire: h })),
];

function sendHome(ctx, o) {
    const { st, data } = ctx, c = st.combat;
    for (const f of (st.fx ?? []).slice()) {
        if (!f.targets.some(t => t.kind === o.ref.kind && t.id === o.ref.id)) continue;
        if (f.targets.length === 1) expireFx(st, data, f.id, 'sent away'); else f.targets = f.targets.filter(t => !(t.kind === o.ref.kind && t.id === o.ref.id));
    }
    if (o.den) {
        const d = o.den;
        d.dead = true;
        for (const p of c.dens.filter(x => x.partOf === d.uid)) p.dead = true;
        if (d.kind === 'mon') { const m = st.mons.find(x => x.id === d.id), def = data.monsters[d.id]; m.loc = { box: def.homeBox }; m.hired = false; delete m.hiredBy; m.controlledUntil = null; }
        else { const n = st.nats.find(x => x.id === d.id), g = data.groups[data.natives[d.id].group]; n.loc = g.garrison ? { c: st.garrisonAt[g.garrison] } : { box: g.id }; }
    } else {
        o.hire.dead = true;
        const n = st.nats.find(x => x.id === o.hire.id), g = data.groups[data.natives[n.id].group];
        n.hired = false; delete n.hiredBy; n.loc = g.garrison ? { c: st.garrisonAt[g.garrison] } : { box: g.id };
    }
}

export default {
    id: 'small-blessing', dur: 'instant', benevolent: true,
    aim: st => characters(st).map(c => ({ ref: c.ref, label: c.ref.id === 'ch' ? 'yourself' : c.name })),
    legal: () => true,
    // the questions the wishes may ask, for the aim sheet: { key, label, kind, options }
    params: (st, data) => [
        { key: 'clearing', kind: 'clearing', label: 'Wish 1, Elsewhere: go to' },
        { key: 'other', kind: 'choice', label: 'Wish 2, Elsewhere: send away', options: others(st, data).map(o => ({ value: o.ref, label: o.label })) },
        { key: 'box', kind: 'choice', label: 'Wish 3, Vision: look at', options: stockBoxes(st).map(b => ({ value: b.group, label: `the ${b.group} box` })) },
    ],
    useful(st, data, opt) {
        const spent = spentThisRound(st);
        return foes(st).some(d => !d.bystander) || st.ch.chits.some(c => c.id !== opt.chit && !spent.has(c.id) && (c.state === 'fatigued' || c.state === 'wounded')) || (st.ch.curses ?? []).length > 0;
    },
    start(ctx) {
        const { st, data } = ctx, t = ctx.targets[0] ?? { kind: 'char', id: 'ch' };
        const who = characters(st).find(c => c.ref.id === t.id);
        if (!who) { ctx.log('Small Blessing finds no one to bless.'); return; }
        if (shielded(st, t)) { ctx.log(`Small Blessing: ${who.name === 'you' ? 'you are' : `${who.name} is`} shielded from magic and unaffected.`); return; }
        const r = roll2(st), row = data.tables.wish.rows[String(r.value)];
        noteRoll(st, 'Wish', r.dice, r.value, row.name);
        ctx.log(`Small Blessing: ${who.name === 'you' ? 'you wish' : `${who.name} wishes`} and the Wishes Table gives ${row.name} (rolled ${r.dice.join('+')}).`);
        const hero = t.id === 'ch';
        switch (r.value) {
            case 1: {
                if (!hero) { ctx.log('There is no place yet to send another character.'); break; }
                const nodes = graph(st, data).type;
                let to = ctx.params.clearing;
                if (to != null && !nodes.has(to)) { ctx.log(`${to} is not a clearing: the wish takes you nowhere.`); to = null; }
                if (to == null) to = roadsFrom(st, data, st.ch.at).find(x => x.usable)?.to ?? null;
                if (to == null || to === st.ch.at) { ctx.log('You wish yourself elsewhere, but there is nowhere to go.'); break; }
                st.ch.at = to; st.ch.onRoad = null; st.ch.arrivedFrom = null;
                ctx.log(`You are carried to ${nameOfClearing(to)} with your horses and belongings. Your hirelings must catch up.`);
                B.endCombat(st, data, 'teleported');
                break;
            }
            case 2: {
                const list = others(st, data), want = ctx.params.other;
                const o = (want && list.find(x => x.ref.kind === want.kind && x.ref.id === want.id)) ?? [...list].sort((a, b) => (b.den ? danger(st, data, b.den) : -1) - (a.den ? danger(st, data, a.den) : -1))[0];
                if (!o) { ctx.log('There is no one here to send away.'); break; }
                sendHome(ctx, o);
                ctx.log(`${o.label} is carried off to its starting place. No bounty is paid.`);
                st.combat.eventful = true;
                break;
            }
            case 3: {
                const boxes = stockBoxes(st), box = boxes.find(b => b.group === ctx.params.box) ?? boxes[0];
                if (!box) { ctx.log('The Setup Card has nothing in its boxes to see.'); break; }
                const names = box.list.map(g => nameOf(data, g));
                const text = `Vision: the ${box.group} box holds ${names.join(', ')}.`;
                (st.ch.notes ??= []).push({ day: st.day, text });
                ctx.log(text);
                break;
            }
            case 4: {
                const gone = cancelCasts(st, data, ctx.cast);
                // Ruling S7 (Mike, 2026-10-26): as the table's note 4 prints it, "Rounds of combat continue for two rounds to allow characters to do actions. This 'peace' cannot be broken before
                // it expires": the round of the wish and the two after it are rounds in which nobody may target or attack and everybody may act (cast, switch belongings, run away).
                // In a fight shared with other characters (battle.js) the wish still ends the fight at once.
                if (st.combat.shared) {
                    ctx.log(`Peace: no one in this clearing will fight any more today${gone.length ? `; ${gone.join(' and ')}, not yet in effect, ${gone.length > 1 ? 'are' : 'is'} cancelled` : ''}.`);
                    B.endCombat(st, data, 'peace');
                    break;
                }
                const c = st.combat;
                c.peaceRounds = 2; c.peaceNow = true;
                releaseFoes(c);
                ctx.log(`Peace: no one in this clearing may target or attack anyone for two more rounds; everyone may act${gone.length ? `; ${gone.join(' and ')}, not yet in effect, ${gone.length > 1 ? 'are' : 'is'} cancelled` : ''}.`);
                break;
            }
            case 5: {
                const spent = spentThisRound(st), chit = ctx.source?.kind === 'chit' ? ctx.source.id : null, ch = who.who;
                let n = 0;
                for (const x of ch.chits) if (x.id !== chit && !spent.has(x.id) && (x.state === 'fatigued' || x.state === 'wounded')) { x.state = 'active'; n++; }
                const lifted = (ch.curses ?? []).filter(k => k === 'Ill Health' || k === 'Wither');
                ch.curses = (ch.curses ?? []).filter(k => !lifted.includes(k));
                ctx.log(`Health: ${n} action chit${n === 1 ? '' : 's'} restored${lifted.length ? `; the ${lifted.join(' and ')} curse${lifted.length > 1 ? 's are' : ' is'} lifted` : ''}.`);
                break;
            }
            case 6:
                who.who.wishStrength = 'T';
                ctx.log('Strength: your next Fight chit or Gloves strikes with Tremendous harm.');
                break;
            default: break;
        }
    },
    ai: { role: 'heal' },
};
