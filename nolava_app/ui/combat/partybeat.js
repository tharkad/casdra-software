// combat/partybeat.js: the end of a fight of a party on one phone (note 137: "I had slain the spider but got no indication ... never got a resolution screen with fame/notoriety gain ... show all characters, their
// kills, and their gains"). The one-character fight stops on a 'combat-over' question (day.js) and its screen reads the fight's lines; the party's fight has no such question (battle.js ends it and the day
// goes on), so the screen watches for the moment the fight ends: `watch` is taken before an answer, `ended` after it. If the fight is gone, the lines of the whole fight (those the screen already held, and
// those the last answer wrote) are read, character by character, by partyfacts.js. Everything comes from the API's view; nothing here asks the engine anything the view does not say.
import { fightModel, tableFight } from './feed.js';
import { partyFacts } from './partyfacts.js';
import { displayName } from '../names.js';

/** Before an answer: a snapshot of the party's fight, or null when there is none (alone, a table, or character against character). */
export function watch(st, data) {
    let t = null; try { t = tableFight(st, data); } catch { return null; }          // (the memoized view: an answer outside a fight costs nothing here)
    if (!t || t.pvp || (t.order ?? []).length < 2) return null;
    let fm; try { fm = fightModel(st, data); } catch { return null; }
    const b = fm.battle;
    if (!b) return null;
    return { fm, day: fm.day, at: b.at, order: b.order.slice(), dens: b.dens.map(d => ({ uid: d.uid, kind: d.kind, id: d.id, side: d.side ?? 'light', partOf: d.partOf ?? null, dead: !!d.dead, stat: d.stat ?? null })), lines: [...(fm.fightLog?.lines ?? [])] };
}

/** After an answer: the recap of the fight if it has just ended, else null. */
export function ended(before, st, data) {
    if (!before) return null;
    let fm; try { fm = fightModel(st, data); } catch { return null; }
    if (fm.battle) return null;
    const by = new Map(before.lines.map(l => [l.i, l])), last = Math.max(-1, ...before.lines.map(l => l.i));
    for (const l of fm.log) if (l.r != null && l.day === before.day && l.i > last) by.set(l.i, l);          // (the lines the last answer wrote: the fight's closing words carry a round too)
    const lines = [...by.values()].sort((a, b) => a.i - b.i);
    const denName = uid => before.dens.find(d => d.uid === uid)?.stat?.name ?? null;
    const members = before.order.map(id => ({ id, name: displayName(before.fm.chars?.[id]?.name ?? id) }));
    const facts = partyFacts(lines, members, denName);
    // the creatures that fell: each by its counter (a kill the line named only by words is found by its name)
    const slain = [], seen = new Set();
    for (const m of facts.members) for (const k of m.kills) {
        const den = before.dens.find(d => d.uid === k.uid) ?? before.dens.find(d => !seen.has(d.uid) && d.kind !== 'part' && d.stat?.name && k.name && d.stat.name.replace(/[  ]#\d+$/, '') === k.name);
        const key = den?.uid ?? `${m.id}:${k.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        slain.push({ uid: den?.uid ?? null, name: k.name, den: den ?? null, by: facts.members.filter(x => x.kills.some(y => (y.uid && y.uid === den?.uid) || (!y.uid && y.name === k.name))).map(x => x.id) });
    }
    for (const d of before.dens) if (d.dead && d.kind !== 'part' && d.kind !== 'horse' && !seen.has(d.uid)) { seen.add(d.uid); slain.push({ uid: d.uid, name: (d.stat?.name ?? 'a foe').replace(/[  ]#\d+$/, ''), den: d, by: [] }); }
    return { day: before.day, at: before.at, rounds: facts.rounds, members: facts.members, slain, fm: before.fm, lines };
}
