// voice/fight.js: the combat voice layer (docs/engine-api/CONTRACT.md sections 6 and 8): what the fight's lines SAY, read from the events the engine wrote for them where there is one, and from the sentence where there is not
// (an old save, an online table, a line no event covers yet). A line of the fight is { i, t, k, r, s?, ev? }; `ev` is the event written for the same fact (the engine joins them by the event's `legacy` index).
// The words a player reads are unchanged: this file decides FACTS (that a fight ended and how, how many chits were wounded or tired, what happened to the armor), never sentences. tests/voice_fight.test.mjs holds the two readings
// equal over simulated games: every fact read from an event is the fact the sentence would have given.

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
