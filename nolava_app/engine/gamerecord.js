// A played game as a record: the parameters it began with, every action taken (the engine is deterministic, so that replays it exactly), what the
// game said as it went, and a summary. Nothing here touches the browser: the app stores these (ui/gamestore.js) and node tools read them.
//
// Format v1
//   { v, id, version, startedAt, params, replayable, moves:[action...], errors:[{...}], days:[{day,...}], meta:{...}, log:[{day,k,t}] }
// `params` is exactly what newGame(data, params) was given. `replayable` is false for a game that was started before records existed
// (its early moves are unknown): its log and summary are still kept.

export const RECORD_V = 1;

export function newRecord({ id, version, params, startedAt = null, replayable = true }) {
    return { v: RECORD_V, id, version, startedAt, params, replayable, moves: [], errors: [], days: [], meta: null, log: [] };
}

// The numbers that describe where a game stands (or how it ended).
export function summarize(st) {
    const s = st.stats ?? {};
    const over = st.period === 'over';
    const result = !over ? 'playing' : st.over?.reason === 'died' ? 'died' : 'finished';
    return {
        character: st.ch?.id ?? null, name: st.ch?.name ?? null, day: st.day, lastDay: st.lastDay ?? 28, mode: st.mode ?? 'month', period: st.period,
        result, score: st.score?.total ?? null, won: st.score?.won ?? null, rows: st.score?.rows ?? null, deaths: st.deaths ?? 0,
        fame: st.ch?.fame ?? 0, notoriety: st.ch?.notoriety ?? 0, gold: st.ch?.gold ?? 0, items: (st.ch?.items ?? []).filter(i => !i.destroyed).length,
        vp: st.ch?.vp ?? null, options: st.options ?? null,
        kills: s.kills ?? 0, combats: s.combats ?? 0, rounds: s.rounds ?? 0, woundsTaken: s.woundsTaken ?? 0, looted: s.looted ?? 0, sitesDiscovered: s.sitesDiscovered ?? 0,
        armorDamaged: s.armorDamaged ?? 0, armorDestroyed: s.armorDestroyed ?? 0, ran: s['combat.ran'] ?? 0, logLines: st.log?.length ?? 0, stats: s,
    };
}

// One line of the day-by-day table, taken when a new day begins.
export const daySnapshot = st => ({ day: st.day, at: st.ch?.at ?? null, gold: st.ch?.gold ?? 0, fame: st.ch?.fame ?? 0, notoriety: st.ch?.notoriety ?? 0,
    wounded: (st.ch?.chits ?? []).filter(c => c.state === 'wounded').length, tired: (st.ch?.chits ?? []).filter(c => c.state === 'fatigued').length, hidden: !!st.ch?.hidden });

export function finalize(rec, st) {
    rec.meta = summarize(st);
    rec.log = st.log ?? [];
    return rec;
}

export const resultLabel = m => (!m ? '' : m.result === 'died' ? `Died on day ${m.day}` : m.result === 'abandoned' ? `Abandoned on day ${m.day}` : m.result === 'finished' ? `Finished (${m.score >= 0 ? '+' : ''}${m.score})` : `In progress, day ${m.day}`);

const KIND_LABEL = { roll: 'Roll', combat: 'Combat', loot: 'Loot', trade: 'Trade', phase: 'Phase', monster: 'Monsters', native: 'Natives', discover: 'Discovery', block: 'Block', curse: 'Curse', day: 'Day', hire: 'Hire' };
export const kindLabel = k => KIND_LABEL[k] ?? k;

// The log grouped by day, in order: [{ day, lines:[{k,t}] }].
export function groupByDay(log) {
    const out = [];
    for (const l of log ?? []) {
        let d = out[out.length - 1];
        if (!d || d.day !== l.day) { d = { day: l.day, lines: [] }; out.push(d); }
        d.lines.push({ k: l.k, t: l.t });
    }
    return out;
}

// Plain text for reading or sending: a header that says what game it was, then the days.
export function readableLog(rec, { kinds = null } = {}) {
    const m = rec.meta ?? {};
    const o = m.options ? Object.entries(m.options).filter(([, v]) => v).map(([k]) => k) : [];
    const head = [
        'MAGIC REALM — game log',
        `Game ${rec.id} · version ${rec.version} · seed ${rec.params?.seed ?? '?'} · ${m.name ?? rec.params?.character ?? '?'} · ${m.mode ?? 'month'}${o.length ? ` · options: ${o.join(', ')}` : ''}`,
        `Started ${rec.startedAt} · ${resultLabel(m)}${rec.replayable ? '' : ' · not replayable (started before moves were recorded)'}`,
    ];
    if (m.rows) head.push('Score: ' + m.rows.map(r => `${r.cat} ${r.earned}/${r.need}`).join(', ') + ` = ${m.score}`);
    if (rec.errors?.length) head.push(`${rec.errors.length} rejected or failed action${rec.errors.length === 1 ? '' : 's'} (listed at the end)`);
    head.push('');
    const body = [];
    for (const d of groupByDay(rec.log)) {
        const lines = kinds ? d.lines.filter(l => kinds.includes(l.k)) : d.lines;
        if (!lines.length) continue;
        body.push(`Day ${d.day}`);
        for (const l of lines) body.push(`  ${l.t}`);
    }
    const tail = rec.errors?.length ? ['', 'Rejected or failed actions', ...rec.errors.map(e => `  day ${e.day} ${e.period ?? ''} ${e.pending ?? ''}: ${e.message} (${JSON.stringify(e.action)})`)] : [];
    return [...head, ...body, ...tail, ''].join('\n');
}

export function bundle(records, exportedAt = null) {
    return JSON.stringify({ app: 'magic-realm', format: RECORD_V, exported: exportedAt, games: records }, null, 1);
}

const LATER = new Set(['plan', 'next', 'pick', 'continue', 'restart', 'end-option', 'rest', 'search-table', 'search-choice', 'effort-cost', 'enchant-choice', 'runes-target', 'learn-spell', 'hire', 'trade', 'tidy', 'suicide']);
const quietAsks = st => (st.asks ?? []).filter(k => k.pending?.type === 'combat-encounter' && k.pending.spellOnly === true);
function passQuiet(st, env, move) {
    for (let guard = 0; guard < 40 && LATER.has(move.type) && quietAsks(st).length; guard++) {
        for (const k of quietAsks(st)) st = env.apply(st, env.data, { type: 'combat', kind: 'encounter', act: 'pass', who: k.who });
    }
    // Likewise a game recorded before 7.3.2a / 7.3.1f.1 were kept: its `continue` at the 'phase-gear' question left a horse or Boots in use beside an item too heavy for it; now the mount comes off first.
    if (move.type === 'continue') for (const k of st.asks ?? []) for (const uid of k.pending?.type === 'phase-gear' ? k.pending.mounts ?? [] : []) st = env.apply(st, env.data, { type: 'tidy', item: uid, who: k.who });
    return st;
}

// Plays a record's moves again from its parameters and checks the result against what was recorded.
//   env = { newGame, apply, data, check?(st, step) }.  Returns { ok, steps, problems:[], state }.
export function replay(rec, env) {
    const out = { ok: true, steps: 0, problems: [], state: null };
    if (!rec.replayable || !rec.params) { out.ok = false; out.problems.push('not replayable: the game was started before moves were recorded'); return out; }
    let st;
    try { st = env.newGame(env.data, rec.params); } catch (e) { out.ok = false; out.problems.push(`could not start: ${e.message}`); return out; }
    for (const a of rec.moves) {
        // A game recorded before 2026-11-05 has no answer to the quiet rounds of an evening with nobody to fight (8.1.3a: held in a game at a screen, `pauseEvening`): when the next move is for a later
        // question, the quiet round it never saw is passed, which is what the player did then (the engine skipped it).
        try { st = passQuiet(st, env, a); }
        catch (e) { out.ok = false; out.problems.push(`move ${out.steps + 1} (${a.type}): the quiet evening could not be passed: ${e.message}`); return Object.assign(out, { state: st }); }
        try { st = env.apply(st, env.data, a); } catch (e) { out.ok = false; out.problems.push(`move ${out.steps + 1} (${a.type}) was refused: ${e.message}`); return Object.assign(out, { state: st }); }
        out.steps++;
        if (env.check) { try { env.check(st, out.steps); } catch (e) { out.ok = false; out.problems.push(`invariant after move ${out.steps}: ${e.message}`); } }
    }
    out.state = st;
    const m = rec.meta;
    if (m) {
        if (st.day !== m.day) out.problems.push(`day ${st.day} on replay, ${m.day} recorded`);
        if ((st.score?.total ?? null) !== (m.score ?? null)) out.problems.push(`score ${st.score?.total ?? '-'} on replay, ${m.score ?? '-'} recorded`);
        if ((st.log?.length ?? 0) !== (m.logLines ?? st.log?.length)) out.problems.push(`${st.log?.length} log lines on replay, ${m.logLines} recorded`);
        if (st.ch?.gold !== m.gold || st.ch?.fame !== m.fame || st.ch?.notoriety !== m.notoriety) out.problems.push('gold, fame or notoriety differ on replay');
        if (out.problems.length) out.ok = false;
    }
    return out;
}
