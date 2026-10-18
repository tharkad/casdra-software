// CHARACTER AGAINST CHARACTER, as a phone reads it (docs/design/multiplayer-pvpui.md). Behind the lobby switch `pvp` (R-17): with it off none of this is ever asked for, built or shown.
// Pure functions of a redacted view (server/redact.mjs) and the engine's own option functions; no DOM, so tests/pvp_ui.test.mjs runs them in node against the real engine.
// Only what the rules let a player know is read: another character's printed card and open gear (4.3.5: weapons, armor and horses are counters on the table), Fame, Notoriety, whether he is
// hidden (R-1), the table's record of charges and kills (`battle.charges`, `battle.kills`), the lines of the fight that the server sends its participants, and the viewer's own record.
// Never another character's gold, plan, cards face down, or the target of a play that has not been shown.
import { nameOf } from '../engine/items.js';
import { hireStats, encounterOptions } from '../engine/combat.js';
import { meetLines } from './meet.js';
import { chitText, joinList } from './fight.js';

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const WORD = { N: 'Negligible', L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };
export const harmWord = h => WORD[h] ?? h;

// ---- who is who ----
/** The player's name for a character id. */
export const pname = (view, id) => view?.players?.find(p => p.id === view.chars?.[id]?.owner)?.name ?? view?.chars?.[id]?.name ?? id;
/** "Ann’s Captain": the player and the character. */
export const both = (view, id) => (view?.chars?.[id] ? `${pname(view, id)}’s ${view.chars[id].name}` : id);
/** Whether the switch is on in the fight this view holds. */
export const pvpOn = view => !!view?.battle?.pvp;

// ---- what I may know of another character ----
/** The public facts of a character as the rules show them: Fame, Notoriety, hidden or in plain sight, the weapon he wields and whether it is alerted, the armor he wears, the horse he rides.
 * Gold, spells, cards face down and his plan are not on the table and are never read. */
export function foeFacts(view, data, id) {
    const c = view?.chars?.[id];
    if (!c) return null;
    const items = (c.items ?? []).filter(i => !i.hidden && !i.destroyed);
    const nm = it => { try { return nameOf(data, it); } catch { return it.id; } };
    const w = items.find(i => i.kind === 'weapon' && i.active), armor = items.filter(i => i.kind === 'armor' && i.active), horse = items.find(i => i.kind === 'horse' && i.active);
    return {
        id, player: pname(view, id), character: c.name, hidden: !!c.hidden, fame: c.fame ?? 0, notoriety: c.notoriety ?? 0,
        weapon: w ? { name: nm(w), alerted: !!w.alerted } : null,
        armor: armor.map(a => ({ name: nm(a), damaged: !!a.damaged })),
        horse: horse ? nm(horse) : null,
    };
}
/** The gear of a character in a few plain words: what he wields, wears and rides ("Short Sword (alerted) · Breastplate, Shield · rides a Pony"). Empty parts are left out; nothing at all reads "no weapon or armor in plain sight". */
export function gearWords(f) {
    const bits = [];
    bits.push(f.weapon ? `${f.weapon.name}${f.weapon.alerted ? ' (alerted)' : ''}` : 'bare hands');
    bits.push(f.armor.length ? f.armor.map(a => `${a.name}${a.damaged ? ' (damaged)' : ''}`).join(', ') : 'no armor');
    if (f.horse) bits.push(`rides a ${f.horse}`);
    return bits.join(' · ');
}

/** Whether I gave my word to this player today: a trade or a gift between us, or we travel together (one follows the other). Not a rule of the engine (there is no penalty); the screens
 * warn before a blow at someone I dealt with, because the table will remember. Returns a sentence about it, or null. */
export function dealWith(view, myId, otherId) {
    if (!view?.chars?.[otherId]) return null;
    const who = pname(view, otherId);
    if (view.follows?.[myId] === otherId || view.follows?.[otherId] === myId) return `You travel with ${who} today.`;
    try {
        const log = view.log ?? [];
        const done = meetLines(view, myId).find(e => e.kind === 'done' && e.other === who && log[e.pos]?.day === view.day);
        if (done) return `You made a deal with ${who} today.`;
    } catch { /* no lines: no deal */ }
    return null;
}

// ---- 8.4.2g treachery: striking my own hired native ----
/** The Fame it would cost to turn on this hireling: its whole group under my hire rebels and I lose each one's Notoriety bounty. */
export function treacheryCost(view, data, hireNativeId, myId = view?.actor) {
    const group = data?.natives?.[hireNativeId]?.group;
    if (!group) return { fame: 0, group: null, count: 0 };
    const rebels = (view?.nats ?? []).filter(n => n.hired && (n.hiredBy ?? myId) === myId && !n.dead && data.natives[n.id]?.group === group);
    return { fame: rebels.reduce((s, n) => s + (data.natives[n.id]?.notorietyBounty ?? 0), 0), group, count: rebels.length };
}

// ---- naming a target: a creature, a character, a hireling ----
export const isCharUid = u => typeof u === 'string' && u.startsWith('char:');
export const isHireUid = u => typeof u === 'string' && u.startsWith('hire:');
/** The name a play's target is told by: "Ann’s Captain", "Ann’s Rogue (hired)", or null for a creature (the caller names those from the den). */
export function targetName(view, data, uid) {
    if (isCharUid(uid)) return both(view, uid.slice(5));
    if (isHireUid(uid)) {
        const h = (view?.battle?.hires ?? []).find(x => x.uid === uid.slice(5));
        if (!h) return 'a hireling';
        let nm = h.id; try { nm = hireStats(data, h.id, h.kind, view).name; } catch { /* the id */ }
        return `${pname(view, h.owner)}’s ${nm}`;
    }
    return null;
}

// ---- the CHARGE step (8.3.6) ----
/** The Move chits I have, and for each whether it can make the charge and, if not, why in plain words. `p` is the `combat-charge` question. */
export function chargeChits(view, data, p) {
    const me = view?.ch ?? view?.chars?.[view.actor];
    let slowest = 99, gate = null, pickedUp = false;
    try { const o = encounterOptions(view, data); slowest = o.slowest ?? 99; gate = o.why?.gate ?? null; pickedUp = !!o.pickedUp; } catch { /* the engine will say if it must */ }
    // what holds a chit back, in words: a creature on my sheet ("the Ogre, which moves at 4") or another character's charge ("Ann\u2019s charge, which moves at 3")
    let gateText = null;
    if (gate) {
        const by = /^(.+), charging you$/.exec(gate.name), who = by ? Object.values(view.chars ?? {}).find(c => c.name === by[1]) : null;
        gateText = by ? `${who ? pname(view, who.id) : by[1]}\u2019s charge, which moves at ${gate.speed}` : `the ${gate.name}, which moves at ${gate.speed}`;
    }
    const ok = new Set((p.chits ?? []).map(c => c.id));
    const mine = (me?.chits ?? []).filter(c => c.type === 'move');
    const rows = mine.map(c => {
        const text = chitText(view, me.id, c.id);
        if (ok.has(c.id)) return { id: c.id, chit: c, text, ok: true, why: null };
        let why;
        if (pickedUp) why = 'something holds you fast';
        else if (c.state === 'fatigued') why = 'tired';
        else if (c.state === 'wounded') why = 'wounded';
        else if (c.state && c.state !== 'active') why = 'tied up in a spell';
        else if (c.time >= slowest) why = gateText ? `not faster than ${gateText}` : 'too slow';
        else why = 'too weak to carry everything you own';
        return { id: c.id, chit: c, text, ok: false, why };
    });
    // the fastest first, then the cheapest: a quicker charge leaves the one charged fewer chits to answer with
    rows.sort((a, b) => b.ok - a.ok || a.chit.time - b.chit.time || (a.chit.effort ?? 0) - (b.chit.effort ?? 0));
    return { rows, gate, gateText, slowest, usable: rows.filter(r => r.ok) };
}
/** Everything the charge screen shows, from the question `p`:
 * { targets:[{ ...foeFacts, deal, found }], chits, hires:[{ uid, name }], peace, hidden (I am), gate } */
export function chargeModel(view, data, p, myId = view?.actor) {
    const targets = (p.targets ?? []).map(t => ({ ...foeFacts(view, data, t.id), hidden: !!t.hidden, deal: dealWith(view, myId, t.id) }));
    const me = view.chars[myId];
    return { targets, chits: chargeChits(view, data, p), hires: (p.hires ?? []).map(x => ({ uid: x.uid, name: x.name })), peace: !!p.peace, hidden: !!me?.hidden };
}

// ---- reading the lines of a round with characters in it ----
// R-23 (docs/design/multiplayer-harden.md section 3): the gold of a victim is NOT in the table's kill line any more ("White Knight killed Captain and takes 7 Notoriety, his belongings (Short Sword)."). The killer, and
// only he, is told once, in a line of his own (`vis: 'owner'`): "You read Captain's record: 12 gold and 7 Notoriety." Everyone else, the fight included, never learns the figure, so `gold` is null for them.
const RECORD = /^You read (.+?)'s record: (\d+) gold and (\d+) Notoriety\.$/;
/** The victims' records the server told THIS viewer (killer only): Map of "day|victim name" to { gold, notoriety }. Empty for everyone else, by design. */
export function recordsFor(view, myId = view?.actor) {
    const out = new Map();
    for (const l of view?.log ?? []) {
        if (l.vis !== 'owner' || (l.who && l.who !== myId)) continue;
        const x = RECORD.exec(l.t ?? '');
        if (x) out.set(`${l.day}|${x[1]}`, { gold: Number(x[2]), notoriety: Number(x[3]) });
    }
    return out;
}
/** The spoils lines in a set of lines: [{ victim, killer, killerName, hired, shared, notoriety, fame, gold, goldRecord, items, belongings, r }] (members come from `byName`: character name to member).
 * `gold` is what the viewer is allowed to know: the figure from his own record line when HE is the killer (`records`, recordsFor), a gold figure still printed in the line (a game made before R-23), else null.
 * In a shared kill the record is the victim's whole purse, each killer's share is not told: `gold` stays null and `goldRecord` carries the purse. */
export function parseSpoils(lines, byName, records = null) {
    const out = [];
    for (const l of lines) {
        const x = /^(.+?) killed (.+?)( \(shared\))?(?: and takes (.+))?\.$/.exec(l.t ?? '');
        if (!x) continue;
        const hired = /'s hireling$/.test(x[1]), killerName = x[1].replace(/'s hireling$/, '');
        const victim = byName.get(x[2]), killer = byName.get(killerName);
        if (!victim || out.some(s => s.victim === victim && s.killer === killer)) continue;
        const bits = x[4] ?? '', num = re => Number(re.exec(bits)?.[1] ?? 0);
        const items = /belongings \((.+?)\)/.exec(bits)?.[1]?.split(/, (?=[A-Z0-9])/) ?? [];
        const rec = records?.get(`${l.day}|${x[2]}`) ?? null, printed = /(\d+) gold/.exec(bits);
        const shared = !!x[3];
        out.push({ victim, killer: killer ?? null, killerName, hired, shared, notoriety: num(/(\d+) Notoriety/), fame: num(/(\d+) Fame/), gold: printed ? Number(printed[1]) : rec && !shared ? rec.gold : null, goldRecord: rec ? rec.gold : null, items, belongings: /belongings/.test(bits), r: l.r ?? null });
    }
    return out;
}
const SWING = /^You: (Thrust|Swing|Smash) at (.+?) \((no maneuver|[^)]*?)\): (hit|miss)(?:[;(:] ?(.*))?\.?$/;
/** The facts of a round that involve characters, from the lines the server sent the viewer (each in the voice of the one it happened to) and the table's record:
 *  swings  every attack named at someone: { by, dir, at, atMember, result, maneuver, note }
 *  blows   every blow that landed on a character: { from:{ member|name }, label, dir, harm, to, gear:{name,fate}|null, wound, slain, noEffect, horse }
 *  kills   who struck whom down: { victim, killers:[member], killerNames, notoriety, fame, gold, items:[names], shared, hired, mine }
 *  pvp     whether any of it was between characters (a charge, a blow at a character, a kill) */
export function pvpRound(view, f, report, round = report?.round) {
    const byName = new Map(f.members.map(m => [m.character, m]));
    const swings = [], blows = [], spoils = [];
    for (const m of f.members) {
        const per = report?.per?.[m.id];
        if (!per) continue;
        let cur = null;
        for (const l of per.lines) {
            const t = l.t ?? '';
            let x;
            if ((x = SWING.exec(t))) {
                const at = x[2], atMember = byName.get(at) ?? null;
                swings.push({ by: m, dir: x[1], at, atMember, result: x[4], maneuver: x[3] === 'no maneuver' ? null : x[3], note: x[5] ?? '', story: l.s ?? null, line: l });
                cur = null; continue;
            }
            // a blow that falls on this character (told in his voice)
            if ((x = /^(.+?) strikes (thrust|swing|smash) for (\w) harm(?: against your (.+?))?\.$/.exec(t))) {
                const attacker = x[1], mem = [...byName.keys()].find(n => attacker.startsWith(`${n}'s `));
                cur = { from: mem ? { member: byName.get(mem), weapon: attacker.slice(mem.length + 3) } : { name: attacker.replace(/ #\d+$/, ''), weapon: null }, label: attacker, dir: x[2], harm: x[3], to: m, gear: x[4] ? { name: x[4], fate: null } : null, wound: false, slain: false, noEffect: false, horse: null, story: l.s ?? null, round: l.r, lines: [l] };
                blows.push(cur); continue;
            }
            if (!cur) continue;
            if (/^Your (.+?) is (destroyed|damaged)\.$|^You take a wound\.$|you are slain\.$|^No effect:|dead\.$|but it stands\.$/.test(t)) cur.lines.push(l);
            if ((x = /^Your (.+?) is (destroyed|damaged)\.$/.exec(t))) { if (cur.gear?.name === x[1]) cur.gear.fate = x[2]; else cur.gear = { name: x[1], fate: x[2] }; }
            else if (/^You take a wound\.$/.test(t)) cur.wound = true;
            else if (/deals \w harm; you are slain\.$/.test(t)) cur.slain = true;
            else if (/^No effect:/.test(t)) cur.noEffect = true;
            else if ((x = /strikes your (.+?) dead\.$/.exec(t))) cur.horse = { name: x[1], fate: 'dead' };
            else if ((x = /hits your (.+?) but it stands\.$/.exec(t))) cur.horse = { name: x[1], fate: 'stands' };
        }
    }
    // the spoils: "Black Knight killed Captain and takes 7 Notoriety, 10 gold, his belongings (Short Sword, Helmet)." (the killer's line, told to everyone in the fight)
    const all = [...(report?.table ?? []), ...f.members.flatMap(m => report?.per?.[m.id]?.lines ?? [])];
    spoils.push(...parseSpoils(all, byName, recordsFor(view, view?.actor)));
    // the table's record is authoritative for who and what; the lines add the gold and the order
    const rec = (view?.battle?.kills ?? []).filter(k => k.round === round);
    const kills = [];
    for (const s of spoils) {
        const r = rec.find(k => k.victim === s.victim.id);
        kills.push({ ...s, killers: r ? r.killers.map(id => f.members.find(m => m.id === id)).filter(Boolean) : (s.killer ? [s.killer] : []), recordedNotoriety: r?.notoriety ?? null });
    }
    for (const r of rec) if (!kills.some(k => k.victim.id === r.victim)) {
        const victim = f.members.find(m => m.id === r.victim);
        if (victim) kills.push({ victim, killer: null, killerName: null, hired: !!r.hired, shared: r.killers.length > 1, notoriety: 0, fame: 0, gold: null, goldRecord: null, items: [], belongings: !!r.items?.length, killers: r.killers.map(id => f.members.find(m => m.id === id)).filter(Boolean), recordedNotoriety: r.notoriety });
    }
    for (const k of kills) k.killerNames = k.killers.length ? k.killers.map(m => m.character) : [k.killerName].filter(Boolean);
    const charBlows = blows.filter(b => b.from.member), charSwings = swings.filter(s => s.atMember);
    const consumed = new Set([...blows.flatMap(b => b.lines), ...charSwings.map(x => x.line)]);
    return { swings, blows, kills, charBlows, charSwings, consumed, pvp: !!(charBlows.length || charSwings.length || kills.length || (f.charges ?? []).length) };
}

/** The same blows in the order the table gave them ("Order of blows ... 1. White Knight's Great Sword (time 6, length 8); 2. ..."): the blows are matched to the list by their attacker. */
export function inOrder(blows, orderLine) {
    const t = orderLine?.t ?? '';
    const items = [...t.matchAll(/(?:^|[:;] )\d+\. (.+?) \(time/g)].map(m => m[1].replace(/^the /, '').replace(/ #\d+/, ''));
    if (!items.length) return blows;
    const used = new Set();
    const rank = b => {
        const key = b.from.member ? b.label : b.from.name;
        const i = items.findIndex((x, j) => !used.has(j) && (x === key || x.startsWith(`${key}'s `) || key.startsWith(x)));
        if (i >= 0) used.add(i);
        return i < 0 ? 99 : i;
    };
    return blows.map((b, k) => ({ b, r: rank(b), k })).sort((a, b) => a.r - b.r || a.k - b.k).map(x => x.b);
}

// ---- words for the reveal ----
/** The one-sentence result of a round that had characters in it, in the table's voice, naming players. Death first, then the wounded, then who broke away. */
export function pvpHeadline(view, f, report, rd, { omitFalls = false } = {}) {
    const bits = [];
    const P = m => m.player;
    for (const k of omitFalls ? [] : rd.kills) {
        const by = k.hired ? `${joinList(k.killers.map(P))}’s hireling` : joinList(k.killers.map(P)) || (k.killerNames[0] ? `${k.killerNames[0]}` : 'a blow');
        bits.push(`${P(k.victim)}’s ${k.victim.character} falls to ${by}.`);
    }
    // creatures that fell, and characters killed by a creature
    const dead = Object.values(report.per).filter(({ member, facts }) => facts.died && !rd.kills.some(k => k.victim === member));
    if (dead.length && !omitFalls) bits.push(`${joinList(dead.map(({ member, facts }) => `${P(member)} falls${facts.died.by ? ` to the ${facts.died.by}` : ''}`))}.`);
    const creatures = [...new Map(Object.values(report.per).flatMap(({ member, facts }) => facts.kills.map(k => [k.name, member.player]))).entries()];
    if (creatures.length) bits.push(`${cap(joinList(creatures.map(([n, who]) => `the ${n} falls to ${who}`)))}.`);
    const num = n => ['no', 'one', 'two', 'three', 'four', 'five'][n] ?? String(n);
    const hurt = Object.values(report.per).filter(({ member, facts }) => !facts.died && !rd.kills.some(k => k.victim === member) && (facts.wounds || facts.gear.length));
    if (hurt.length) bits.push(`${joinList(hurt.map(({ member, facts }) => `${P(member)}${facts.wounds ? ` takes ${num(facts.wounds)} wound${facts.wounds === 1 ? '' : 's'}` : ` loses ${facts.gear.map(g => g.name).join(' and ')}`}`))}.`);
    const fled = Object.values(report.per).filter(({ facts }) => facts.fled);
    if (fled.length) bits.push(`${joinList(fled.map(x => x.member.player))} breaks away.`);
    if (!bits.length && !omitFalls) bits.push(rd.charSwings.length || rd.charBlows.length ? 'Blows are traded, and nobody is hurt.' : 'Nobody is hurt.');
    return bits.join(' ');
}

/** What a kill took, in words: "7 Notoriety, 10 gold and their belongings (Short Sword, Helmet)". The gold is told only where the viewer may know it (the killer's own record line); a bystander reads
 * the public part alone. `victim: true` is the fallen player reading his own fall: he knows he carried gold and that the rules (8.7.2d) hand all of it over, so "all your gold" is his to read. */
export function spoilsText(k, { victim = false } = {}) {
    const bits = [];
    if (k.notoriety) bits.push(`${k.notoriety} Notoriety`);
    if (k.fame) bits.push(`${k.fame} Fame`);
    if (k.gold) bits.push(`${k.gold} gold`);
    else if (k.gold == null && k.shared && k.goldRecord) bits.push(`a share of their ${k.goldRecord} gold`);
    else if (k.gold == null && victim && !k.hired && k.killers?.length) bits.push('all your gold');
    if (k.belongings) bits.push(k.items.length ? `their belongings (${k.items.join(', ')})` : 'their belongings');
    return bits.length ? joinList(bits) : 'nothing';
}

/** One blow in the table's voice: "Ann’s Short Sword swings at Mike’s Suit of Armor: the armor is damaged, and he takes a wound." */
export function blowStory(view, b) {
    const to = b.to, vic = `${to.player}`;
    const who = b.from.member ? `${b.from.member.player}’s ${b.from.weapon}` : `the ${b.from.name}`;
    const dir = { thrust: 'thrusts', swing: 'swings', smash: 'smashes' }[b.dir];
    const gear = b.gear ? `${vic}’s ${b.gear.name}` : null;
    const end = [];
    if (b.horse) end.push(b.horse.fate === 'dead' ? `${vic}’s ${b.horse.name} is struck dead` : `${vic}’s ${b.horse.name} takes the blow and stands`);
    else if (b.noEffect) end.push('it does nothing');
    else {
        if (b.gear?.fate) end.push(`the ${b.gear.name} is ${b.gear.fate}`);
        if (b.slain) end.push(`${vic} falls`);
        else if (b.wound) end.push(`${vic} takes a wound`);
        else if (!b.gear?.fate) end.push(`${vic} is unhurt`);
    }
    return `${who} ${dir} at ${gear ?? vic}: ${joinList(end)}.`;
}
/** A swing that did not land, in the table's voice. */
export function missStory(s) {
    const man = s.maneuver ? `, who plays ${s.maneuver}` : '';
    return `${s.by.player}’s ${s.dir.toLowerCase()} at ${s.at}${man} finds nothing.`;
}

/** Every kill of the fight so far (all rounds), from the lines the viewer was sent and the table's record: for the end card and for a character who has fallen and watches. */
export function allKills(view, f, myId) {
    const byName = new Map(f.members.map(m => [m.character, m]));
    const lines = (view?.log ?? []).filter(l => l.vis === 'battle' && Array.isArray(l.with) && l.with.includes(myId));
    const kills = parseSpoils(lines, byName, recordsFor(view, myId));
    for (const k of kills) {
        const r = (view?.battle?.kills ?? []).find(x => x.victim === k.victim.id);
        k.killers = r ? r.killers.map(id => f.members.find(m => m.id === id)).filter(Boolean) : (k.killer ? [k.killer] : []);
        k.killerNames = k.killers.length ? k.killers.map(m => m.character) : [k.killerName].filter(Boolean);
    }
    return kills;
}

/** The kill that ended MY character, when another character did it: read from the lines of the fight that the server sent me (they outlive the fight) and the table's people. For the sheet that
 * asks a fallen player who returns. `people` is party(); null when I was not killed by a character. */
export function myFall(view, people, myId = view?.actor) {
    const members = (people ?? []).map(p => ({ id: p.id, player: p.player, character: p.character, mine: p.id === myId, person: p }));
    const byName = new Map(members.map(m => [m.character, m]));
    const lines = (view?.log ?? []).filter(l => l.vis === 'battle' && Array.isArray(l.with) && l.with.includes(myId));
    const k = parseSpoils(lines, byName, recordsFor(view, myId)).filter(x => x.victim.id === myId).at(-1);
    if (!k) return null;
    k.killers = k.killer ? [k.killer] : [];
    k.killerNames = k.killers.length ? k.killers.map(m => m.character) : [k.killerName].filter(Boolean);
    return k;
}
