// voice/fight.js: the combat voice layer (docs/engine-api/CONTRACT.md sections 6 and 8): what the fight's lines SAY, read from the events the engine wrote for them where there is one, and from the sentence where there is not
// (an old save, an online table, a line no event covers yet). A line of the fight is { i, t, k, r, s?, ev? }; `ev` is the event written for the same fact (the engine joins them by the event's `legacy` index).
// The words a player reads are unchanged: this file decides FACTS (that a fight ended and how, how many chits were wounded or tired, what happened to the armor), never sentences. tests/voice_fight.test.mjs holds the two readings
// equal over simulated games: every fact read from an event is the fact the sentence would have given.

import { nameOf, WEIGHT_WORDS } from '../../engine/catalogue.js';

/** The run of lines of the fight in progress or just over (those tagged with a round), oldest first. A fight model carries it ready made; a raw state's log is cut the way the engine tags it. */
export function fightLinesOf(fm) {
    if (fm.fightLog) return fm.fightLog.lines;
    const log = fm.log ?? [], out = [];
    let i = log.length - 1;
    while (i >= 0 && log[i].r == null && log[i].k === 'combat') i--;                // (the closing line of a fight is written after the fight is marked ended: it carries no round)
    for (; i >= 0; i--) { if (log[i].r == null) break; out.push(log[i]); }
    return out.reverse();
}

/** How a fight just ended, from the lines written since the log was `since` long: 'won' (nothing hostile is left), 'quiet' (both sides drew back), or null. `combat.over` carries the way (`how`); an older line is read by its words. */
export function endOfFight(fm, since) {
    const lines = fm.fightLog ? fm.fightLog.tail.filter(l => l.i >= since) : (fm.log ?? []).slice(since);
    for (const l of lines) {
        if (l.ev?.code === 'combat.over' && (l.ev.how === 'won' || l.ev.how === 'quiet')) return l.ev.how;
        if (!l.ev && l.t === 'Combat is over: nothing hostile is left.') return 'won';
        if (!l.ev && l.t === 'The fighting dies down.') return 'quiet';
    }
    return null;
}

/** What a round's lines did to the hero: chits wounded and tired, pieces of armor damaged and destroyed. */
export function harmOf(lines) {
    let wounded = 0, tired = 0, destroyed = 0, damaged = 0;
    for (const l of lines) {
        if (l.k !== 'combat') continue;
        const e = l.ev, t = l.t;
        let x;
        if (e?.code === 'hero.wounded') wounded += e.chits.length;
        else if ((x = /^You wound (\d+) action chit/.exec(t))) wounded += Number(x[1]);
        if (e?.code === 'hero.fatigued') tired += e.chits.length;
        else if ((x = /^You fatigue (\d+) chit/.exec(t))) tired += Number(x[1]);
        if (e?.code === 'hero.armor.hit') { if (e.result === 'destroyed') destroyed++; else if (e.result === 'damaged') damaged++; }
        else if (/Your .+ is destroyed/.test(t)) destroyed++;
        else if (/Your .+ is (?:dented and )?damaged|takes the blow and is damaged/.test(t)) damaged++;
    }
    return { wounded, tired, destroyed, damaged };
}

/** The stamps a line of the Record carries (a kill, a wound, what the armor did, a miss): [[kind, word]]. For each stamp the line's event is read when it is the event of that stamp, else the words. */
export function stampsOf(l) {
    const t = l.t ?? '', s = l.s ?? t, e = l.ev, out = [];
    const killWords = /^Your .+? (?:cleaves|strikes down|cuts down|brings down|drops) the .+?, which /;
    if (e?.code === 'den.killed' ? e.by !== 'power-of-the-pit' : /^You kill /.test(t) || killWords.test(s)) out.push(['kill', 'Slain']);
    if (e?.code === 'hero.hurt' || (e?.code !== 'hero.hurt' && /^You take a wound|^The blow gets through|^You are wounded/.test(t + ' ' + s))) out.push(['wound', 'Wound']);
    if (e?.code === 'hero.armor.hit') out.push(['armor', e.result === 'held' ? 'Armor holds' : e.result === 'destroyed' ? 'Armor destroyed' : 'Armor damaged']);
    else if (/^No effect/.test(t)) out.push(['armor', 'Armor holds']);
    else if (/ is destroyed/.test(t)) out.push(['armor', 'Armor destroyed']);
    else if (/ is (?:dented and )?damaged|takes the blow and is damaged/.test(t + ' ' + s) && /^Your /.test(t)) out.push(['armor', 'Armor damaged']);
    if (e?.code === 'blow.missed' ? e.why !== 'gone' : /: miss\b|empty air|misses you|carries you clear/.test(t + ' ' + s)) out.push(['miss', 'Miss']);
    return out;
}

/** What a fight paid and whom it killed, from its lines: the gain in Fame, Notoriety and gold, and the names of the kills that paid (a kill the hero made himself is named, any other is "a foe"). `nameOf(uid)`
 * gives a creature's name from the sheet. A line with a paying `den.killed` event is read from the event; any other from its words ("(+5 Fame, +1 gold; kill 2 today)"). */
export function paidOf(lines, nameOf, baseName) {
    const gain = { fame: 0, notoriety: 0, gold: 0 }, kills = [];
    for (const l of lines) {
        if (l.k !== 'combat') continue;
        const e = l.ev, t = l.t;
        if (e?.code === 'den.killed') {
            if (!(e.fame || e.notoriety || e.gold)) continue;
            gain.fame += e.fame ?? 0; gain.notoriety += e.notoriety ?? 0; gain.gold += e.gold ?? 0;
            const nm = e.by === 'power-of-the-pit' ? null : nameOf(e.den) ?? (/^You kill (?:the )?(.+?)(?: with| \(|\.|$)/.exec(t)?.[1] ?? null);          // (the sheet names it; once the fight is over, the line does)
            kills.push(nm ? baseName(nm) : 'a foe');
            continue;
        }
        const g = /\(([^)]*kill \d+ today)\)/.exec(t);
        if (!g) continue;
        for (const bit of g[1].split(/[,;] */)) { const x = /^\+(\d+) (Fame|Notoriety|gold)/.exec(bit); if (x) gain[x[2] === 'gold' ? 'gold' : x[2].toLowerCase()] += Number(x[1]); }
        const who = /^You kill (?:the )?(.+?)(?: with| \(|\.|$)/.exec(t) ?? /(?:^|: )([\w' #-]+?) dies/.exec(t);
        kills.push(who ? baseName(who[1]) : 'a foe');
    }
    return { gain, kills };
}

/** The sentence for a reason the Encounter step gives for a dim verb ('alert' or 'run'), written from the reason's CODE (`o.whyCode`) and the numbers in the options record. Null when the verb is not dim.
 * tests/voice_fight.test.mjs holds it equal to the sentence the engine still writes (`o.why`) over many Encounter steps; when the engine drops its sentence this is the only one. */
export function whyWords(o, kind, data) {
    const c = o.whyCode?.[kind];
    if (!c) return null;
    const w = o.weapon?.item ? nameOf(data, o.weapon.item) : null, slowest = o.slowest;
    const gate = o.why?.chargeGate && (!o.why.gate || o.why.chargeGate.speed < o.why.gate.speed) ? o.why.chargeGate : o.why?.gate;
    const gateText = !gate ? null : /, charging you$/.test(gate.name) ? `${gate.name.replace(/, charging you$/, '')}'s charge (it moves ${slowest})` : `the ${gate.name} (it moves ${slowest})`;
    switch (c.code) {
        case 'weapon.card': return `Your ${w} is a weapon card: it cannot be alerted, it stays face up while it is active.`;
        case 'weapon.gripped': return 'Your Gripping Dust keeps the weapon alerted: it cannot be turned over.';
        case 'chit.none': return c.params.kind === 'fight' ? 'You have no ready Fight chit to ready your weapon with.' : 'You have no ready Move chit to run with.';
        case 'chit.too-weak': return `No ready Fight chit is strong enough for your ${w} (it needs ${WEIGHT_WORDS[c.params.needs] ?? 'a stronger'} chit or better).`;
        case 'chit.too-slow': return kind === 'alert' ? `No ready Fight chit that is strong enough is faster than ${gateText}: a chit played here must be strictly faster, so time ${slowest - 1} or lower.`
            : `No ready Move chit is faster than ${gateText}: a chit played here must be strictly faster, so time ${slowest - 1} or lower.`;
        case 'chit.too-heavy': return 'No ready Move chit that is fast enough is also strong enough to carry everything you own.';
        case 'run.came-by': return 'You came into this clearing today, so you may only run back the way you came, and that road is closed to you.';
        case 'run.no-road': return 'There is no road you know that you could run along.';
        default: return null;
    }
}

/** What a Meeting cost him: [_, amount, cost] when he paid to avoid the insult or challenge of `group` (the `combat.natives.paid` event of the line, else "You pay 5 notoriety to avoid the insult from the Patrol."), else null. */
export function meetingPaid(lines, group) {
    const re = new RegExp(`^You pay (\\d+) (\\w+) to avoid the (?:insult|challenge) from the ${group}\\.$`, 'i');
    for (const l of lines) {
        if (l.ev?.code === 'combat.natives.paid') { if (String(l.ev.group).toLowerCase() === String(group).toLowerCase()) return [null, String(l.ev.amount), l.ev.cost]; continue; }
        const x = re.exec(l.t);
        if (x) return x;
    }
    return null;
}
