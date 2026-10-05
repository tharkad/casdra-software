import { CARD_DEFS } from '../data/cards.js';
import { score, winner } from '../engine/score.js';

// Pure game statistics. Nothing here reads a clock, a random source, the DOM or storage:
// callers pass timestamps in and persist the results themselves.

const SECTORS = ['health', 'showbiz', 'aerospace'];
const LEVELS = ['easy', 'normal', 'hard'];
const LEVEL_LABELS = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

// Who an event belongs to: events that name a player (`pid`) are cross-checked against `by`
// (the active player when the engine logged it); `pid` wins when both exist.
const actorOf = e => (e.pid ?? e.by);

const zeroSectors = () => Object.fromEntries(SECTORS.map(s => [s, 0]));
const zeroLevels = () => Object.fromEntries(LEVELS.map(l => [l, { played: 0, wins: 0 }]));

export function emptyLifetime() {
    return {
        gamesPlayed: 0, wins: 0, losses: 0, ties: 0,
        byLevel: zeroLevels(),
        streak: 0, bestStreak: 0,
        bestScore: 0, bestMargin: 0, worstMargin: 0,
        totalVp: 0, totalTurns: 0, fastestWinTurns: null, longestGameTurns: 0,
        contractsCompleted: 0, contractsBySector: zeroSectors(),
        xeIsolated: 0, xeDelivered: 0,
        upgradesInstalled: 0, installedByCard: {},
        bids: 0, buys: 0, intakes: 0, purges: 0, nightShifts: 0, distills: 0,
    };
}

const bump = (map, key, by = 1) => { map[key] = (map[key] ?? 0) + by; };

export function summarizeGame({ state, level, pid = 0, maxDeficit = 0, startedAt = null, endedAt = null }) {
    const log = state.log ?? [];
    const over = state.turn.phase === 'over';
    const foe = 1 - pid;

    const mine = score(state, pid);
    const theirs = score(state, foe);
    let result = null;
    if (over) {
        const w = winner(state);
        result = w.tie ? 'tie' : (w.winnerId === pid ? 'win' : 'loss');
    }

    const turnNos = new Set();
    const xePerTurn = new Map();
    const bidsPerTurn = new Map();
    const boughtContractsThisTurn = new Map();   // turnNo -> Set of contract def ids bought that turn
    const g = {
        nightShifts: 0, distills: 0, xeIsolated: 0, contractsCompleted: 0, completedVp: 0, biggestContractVp: 0,
        contractsBySector: zeroSectors(), xeDelivered: 0, upgradesInstalled: 0, installedByCard: {},
        bids: 0, buys: 0, intakes: 0, purges: 0, heatWaveMax: 0, boughtAndCompletedSameTurn: false,
    };

    for (const e of log) {
        if (e.by === pid) turnNos.add(e.turnNo);
        const mineEvent = actorOf(e) === pid;
        if (!mineEvent) continue;
        switch (e.type) {
        case 'turnStart': if (e.overtime) g.nightShifts += 1; break;
        case 'distill': g.distills += 1; break;
        case 'isolated':
            g.xeIsolated += e.xe;
            xePerTurn.set(e.turnNo, (xePerTurn.get(e.turnNo) ?? 0) + e.xe);
            break;
        case 'cashPerO': g.heatWaveMax = Math.max(g.heatWaveMax, e.money); break;
        case 'air': g.intakes += 1; break;
        case 'wipe': g.purges += 1; break;
        case 'install':
            g.upgradesInstalled += 1;
            bump(g.installedByCard, e.card);
            break;
        case 'buy': {
            g.buys += 1;
            if (e.install) { g.upgradesInstalled += 1; bump(g.installedByCard, e.card); }
            if (CARD_DEFS[e.card]?.kind === 'contract') {
                if (!boughtContractsThisTurn.has(e.turnNo)) boughtContractsThisTurn.set(e.turnNo, new Set());
                boughtContractsThisTurn.get(e.turnNo).add(e.card);
            }
            break;
        }
        case 'bid': case 'bidMove':
            g.bids += 1;
            bidsPerTurn.set(e.turnNo, (bidsPerTurn.get(e.turnNo) ?? 0) + 1);
            break;
        case 'contractCompleted': {
            const d = CARD_DEFS[e.contract];
            g.contractsCompleted += 1;
            g.completedVp += d?.vp ?? 0;
            g.xeDelivered += d?.xe ?? 0;
            g.biggestContractVp = Math.max(g.biggestContractVp, d?.vp ?? 0);
            if (d && d.sector in g.contractsBySector) g.contractsBySector[d.sector] += 1;
            // Only the very contract bought earlier this turn counts (finishing an older one does not).
            if (boughtContractsThisTurn.get(e.turnNo)?.has(e.contract)) g.boughtAndCompletedSameTurn = true;
            break;
        }
        default: break;
        }
    }

    const me = state.players[pid];
    return {
        level,
        startedAt,
        endedAt,
        over,
        result,
        myTotal: mine.total,
        rivalTotal: theirs.total,
        margin: mine.total - theirs.total,
        myParts: { ...mine.parts },
        money: me.money,
        turns: turnNos.size,
        nightShifts: g.nightShifts,
        distills: g.distills,
        xeIsolated: g.xeIsolated,
        maxXeIsolatedInOneTurn: Math.max(0, ...xePerTurn.values()),
        contractsCompleted: g.contractsCompleted,
        completedVp: g.completedVp,
        biggestContractVp: g.biggestContractVp,
        contractsBySector: g.contractsBySector,
        xeDelivered: g.xeDelivered,
        upgradesInstalled: g.upgradesInstalled,
        installedByCard: g.installedByCard,
        bids: g.bids,
        maxBidsInOneTurn: Math.max(0, ...bidsPerTurn.values()),
        buys: g.buys,
        intakes: g.intakes,
        purges: g.purges,
        mains: me.pipelines.length,
        maxDeficit,
        heatWaveMax: g.heatWaveMax,
        boughtAndCompletedSameTurn: g.boughtAndCompletedSameTurn,
        allTokensOut: me.tokensLeft === 0,
    };
}

// Folds one FINISHED game into the lifetime record. Returns a new object; the input is untouched.
// An unfinished summary (over === false) leaves the lifetime unchanged (a copy).
export function mergeGame(lifetime, summary) {
    const base = emptyLifetime();
    const prev = lifetime ?? {};
    const L = {
        ...base, ...prev,
        byLevel: Object.fromEntries(Object.entries({ ...base.byLevel, ...(prev.byLevel ?? {}) })
            .map(([k, v]) => [k, { ...v }])),
        contractsBySector: { ...base.contractsBySector, ...(prev.contractsBySector ?? {}) },
        installedByCard: { ...(prev.installedByCard ?? {}) },
    };
    if (summary.over === false) return L;

    const first = L.gamesPlayed === 0;
    L.gamesPlayed += 1;
    if (summary.result === 'win') L.wins += 1;
    else if (summary.result === 'loss') L.losses += 1;
    else if (summary.result === 'tie') L.ties += 1;

    if (summary.level) {
        const row = L.byLevel[summary.level] ?? (L.byLevel[summary.level] = { played: 0, wins: 0 });
        row.played += 1;
        if (summary.result === 'win') row.wins += 1;
    }

    if (summary.result === 'win') {
        L.streak += 1;
        L.bestStreak = Math.max(L.bestStreak, L.streak);
        L.fastestWinTurns = L.fastestWinTurns === null || L.fastestWinTurns === undefined
            ? summary.turns : Math.min(L.fastestWinTurns, summary.turns);
    } else {
        L.streak = 0;
    }

    // First-game rule: the zero in an empty lifetime must not win a max()/min() against real data.
    L.bestScore = first ? summary.myTotal : Math.max(L.bestScore, summary.myTotal);
    L.bestMargin = first ? summary.margin : Math.max(L.bestMargin, summary.margin);
    L.worstMargin = first ? summary.margin : Math.min(L.worstMargin, summary.margin);
    L.totalVp += summary.myTotal;
    L.totalTurns += summary.turns;
    L.longestGameTurns = Math.max(L.longestGameTurns, summary.turns);

    for (const k of ['contractsCompleted', 'xeIsolated', 'xeDelivered', 'upgradesInstalled', 'bids', 'buys',
        'intakes', 'purges', 'nightShifts', 'distills']) {
        L[k] += summary[k] ?? 0;
    }
    for (const [sector, n] of Object.entries(summary.contractsBySector ?? {})) bump(L.contractsBySector, sector, n);
    for (const [id, n] of Object.entries(summary.installedByCard ?? {})) bump(L.installedByCard, id, n);
    return L;
}

// Most-installed card id; ties go to the alphabetically first id. null when nothing was installed.
export function favoriteUpgrade(lifetime) {
    let best = null;
    let bestN = 0;
    for (const id of Object.keys(lifetime?.installedByCard ?? {}).sort()) {
        const n = lifetime.installedByCard[id];
        if (n > bestN) { best = id; bestN = n; }
    }
    return best;
}

const DASH = '—';

export function statTiles(lifetime) {
    const L = { ...emptyLifetime(), ...(lifetime ?? {}) };
    const played = L.gamesPlayed;
    const fav = favoriteUpgrade(L);
    return [
        { id: 'games', label: 'Games played', value: played },
        { id: 'winRate', label: 'Win rate', value: played ? `${Math.round((L.wins / played) * 100)}%` : DASH, hint: played ? `${L.wins} of ${played}` : undefined },
        { id: 'wins', label: 'Wins', value: L.wins },
        { id: 'streak', label: 'Current streak', value: L.streak },
        { id: 'bestStreak', label: 'Best streak', value: L.bestStreak },
        { id: 'bestScore', label: 'Best score', value: played ? L.bestScore : DASH, hint: played ? 'VP' : undefined },
        { id: 'bestMargin', label: 'Biggest win margin', value: L.wins > 0 ? L.bestMargin : DASH, hint: L.wins > 0 ? 'VP' : undefined },
        { id: 'contracts', label: 'Contracts completed', value: L.contractsCompleted },
        { id: 'xeIsolated', label: 'Xe isolated', value: L.xeIsolated },
        { id: 'upgrades', label: 'Upgrades installed', value: L.upgradesInstalled },
        { id: 'favorite', label: 'Favorite upgrade', value: fav ? (CARD_DEFS[fav]?.name ?? fav) : DASH },
        { id: 'nightShifts', label: 'Night Shifts taken', value: L.nightShifts },
        { id: 'fastestWin', label: 'Fastest win (turns)', value: L.fastestWinTurns ?? DASH },
        { id: 'longestGame', label: 'Longest game (turns)', value: played ? L.longestGameTurns : DASH },
    ];
}

export function levelRecords(lifetime) {
    const by = lifetime?.byLevel ?? {};
    return LEVELS.map(level => {
        const played = by[level]?.played ?? 0;
        const wins = by[level]?.wins ?? 0;
        return { level, label: LEVEL_LABELS[level], played, wins, rate: played ? wins / played : 0 };
    });
}

// Appends a compact entry and keeps only the newest `cap`. Returns a new array.
export function recordHistoryEntry(games, summary, cap = 30) {
    const entry = {
        endedAt: summary.endedAt ?? null,
        level: summary.level,
        result: summary.result,
        myTotal: summary.myTotal,
        rivalTotal: summary.rivalTotal,
        turns: summary.turns,
    };
    return cap > 0 ? [...(games ?? []), entry].slice(-cap) : [];
}
