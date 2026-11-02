// view.js: `view(state, viewer)` (CONTRACT section 8; docs/engine-api/VISIBILITY.md). What one viewer may know: the PUBLIC table (everything lying on it), HIS OWN sheet and what he has learned, his question and
// his options, and nothing else. The shape is docs/engine-api/schema/view.schema.json; a field nobody classified is not here (fail closed: the leakage test, tests/api_boundary_leakage.test.mjs, checks every
// field against tools/api/visibility-table.mjs). It is a projection: it copies, never returns a reference into the state, and never reads the generator (`rng`), the seed or the dice queue.
// Made from tools/api/view-prototype.mjs (the throw-away that tested the schemas) with the Phase 3 additions: curses are public once laid (V10), `knows.cards` is the cards shown to him (V2), the fight.
import { clone } from './core.js';
import { withActor } from './party.js';
import { spellFacts } from './magic/facts.js';
import { denSide, hireStats } from './combat.js';
import { fxTags, HERO } from './magic/fx.js';
import { denOnSheet } from './hirefight.js';
import { earned } from './score.js';
import { legalFor } from './legal.js';

const CARD = new Set(['treasure', 'spell']);
const json = o => JSON.parse(JSON.stringify(o));

// The fight of a clearing is table talk, key by key (server/redact.mjs PUBLIC_BATTLE says the same, for the wire): a key the engine adds to `battle` is not shown until it is listed here. Plays not yet revealed are not in it.
const PUBLIC_BATTLE = {
    battle: ['at', 'round', 'quiet', 'step', 'order', 'members', 'dens', 'hires', 'battling', 'reveal', 'eventful', 'pvp', 'charges', 'kills'],
    members: ['state', 'why', 'meet', 'lure', 'enc', 'ready', 'done', 'melee', 'charge', 'charged', 'peace'],
    dens: ['uid', 'kind', 'id', 'side', 'box', 'assigned', 'dead', 'pickedUp', 'partOf', 'owner', 'tag', 'sheet', 'battlers', 'engagedBy', 'noRetaliation', 'noWhy', 'slain', 'slainBy', 'pacified', 'bystander', 'controlled', 'absorbed'],
    hires: ['uid', 'kind', 'id', 'owner', 'dead', 'target', 'targetChar'],
    reveal: ['round', 'plays'],
    plays: ['target', 'fightChit', 'attackDir', 'moveChit', 'moveDir', 'shieldDir', 'spell'],
    charges: ['by', 'on', 'time'],
    kills: ['round', 'victim', 'killers', 'hired', 'notoriety', 'fame', 'items'],
};
const only = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)));
function publicFight(b, st, data) {
    if (!b) return null;
    const P = PUBLIC_BATTLE, out = only(b, P.battle);
    if (b.members) out.members = Object.fromEntries(Object.entries(b.members).map(([id, m]) => [id, only(m, P.members)]));
    // (the name and sides of every creature in the fight are table talk too: `stat`, as the rules read them now)
    const statOf = (f, ...a) => { try { return json(f(...a)); } catch { return null; } };
    out.dens = b.dens.map(d => ({ ...only(d, P.dens), stat: statOf(denSide, st, data, d) }));
    out.hires = b.hires.map(h => ({ ...only(h, P.hires), stat: statOf(hireStats, data, h.id, h.kind, st) }));
    if (b.reveal) out.reveal = { ...only(b.reveal, P.reveal), plays: Object.fromEntries(Object.entries(b.reveal.plays).map(([id, p]) => [id, only(p, P.plays)])) };
    if (b.charges) out.charges = b.charges.map(c => only(c, P.charges));
    if (b.kills) out.kills = b.kills.map(k => only(k, P.kills));
    return json(out);
}

const hiddenCard = it => ({ hidden: true, kind: it.kind });
const gearOf = c => c.items.map(it => (CARD.has(it.kind) && !it.active ? hiddenCard(it) : it));
function publicChar(st, c) {
    const t = c.today ?? {};
    return {
        id: c.id, name: c.name, weight: c.weight, at: c.at ?? null, onRoad: c.onRoad ?? null, hidden: !!c.hidden, dead: !!c.dead, gone: c.gone ?? null, fame: c.fame, notoriety: c.notoriety,
        rel: c.rel ?? {}, foundHiddenEnemies: !!c.hiddenEnemies, chits: c.chits, gear: gearOf(c),
        hirelings: [...st.nats, ...st.mons].filter(o => o.hired && o.hiredBy === c.id && !o.dead).map(o => o.id),
        adv: c.adv ?? [], owner: c.owner, leader: c.leader ?? null, flying: c.flying ?? null, morph: c.morph ?? null, mist: c.mist ?? null, death: c.death ?? null, berserk: !!c.berserk,
        curses: c.curses ?? [],          // (V10: a curse is laid in the open)
        today: { planned: t.plan != null, phases: Array.isArray(t.plan) ? t.plan.length : null, ...(t.stage ? { stage: t.stage } : {}) },
    };
}
const faceOf = ch => ({ kind: ch.kind, name: ch.name, num: ch.num ?? null, id: ch.id });
const counterOf = o => ({ id: o.id, loc: o.loc ?? { box: 'unknown' }, dead: !!o.dead, hired: !!o.hired, ...(o.hiredBy ? { hiredBy: o.hiredBy } : {}), ...(o.hired && o.hiredUntil != null ? { hiredUntil: o.hiredUntil } : {}), ...(o.side ? { side: o.side } : {}) });

// The viewer's own sheet of the fight (`combat`): every creature on it with its stats as the rules read them now (`stat`: name, size, vulnerability, harm, times ... with the spells in force and a
// transformed counter taken into account), and his hirelings with theirs, so a screen never asks the engine for "the side of a denizen" itself.
function fightOf(st, data, who) {
    return withActor(st, who, () => {
        const c = st.combat;
        if (!c) return null;
        const statOf = d => { try { return json(denSide(st, data, d)); } catch { return null; } };
        const out = json(c);
        out.dens = c.dens.map((d, i) => ({ ...out.dens[i], stat: statOf(d), onSheet: denOnSheet(st, d) }));          // (`onSheet`: on a Melee Section of his hirelings, hirefight.js)
        out.noSpecify = fxTags(st, HERO, 'noSpecify').length > 0;          // (a Peace spell on him: he may name no target)
        out.hires = (c.hires ?? []).map((h, i) => { let stat = null; try { stat = json(hireStats(data, h.id, h.kind, st, h.side ?? null)); } catch { /* a hireling the data does not know */ } return { ...out.hires[i], stat }; });
        return out;
    });
}

// The lines of the fight in progress or just over, as the viewer may read them, each with the event written for the same fact (`ev`, joined by the event's `legacy` = the line's index) when the game
// records its events: the voice layer (app/ui/voice/fight.js) reads the event where there is one and the sentence where there is not. `lines`: the run of lines tagged with a round (the Record);
// `tail`: the last lines of the log whatever they are (the closing line of a fight carries no round); `rolls`: the dice tray.
const mayRead = (e, viewer, mine) => !e.who || mine.has(e.who) || e.vis === 'public' || ((e.vis === 'clearing' || e.vis === 'battle' || e.r != null) && !!viewer && (e.with ?? []).includes(viewer));
function fightLogOf(st, viewer, mine) {
    const log = st.log ?? [], byN = new Map((st.events ?? []).map(e => [e.n, e]));          // (a line is joined to its event by `evn`, which survives a log cut for a seat; a position would not. A line without `evn` has no event: the screens read its words)
    const row = i => { const l = log[i], ev = l.evn != null ? byN.get(l.evn) : undefined; return { i, day: l.day, t: l.t, k: l.k, ...(l.s != null ? { s: l.s } : {}), ...(l.r != null ? { r: l.r } : {}), ...(l.who ? { who: l.who } : {}), ...(l.p ? { p: l.p } : {}), ...(l.vis ? { vis: l.vis } : {}), ...(l.with ? { with: l.with } : {}), ...(ev ? { ev } : {}) }; };
    let i = log.length - 1;
    while (i >= 0 && log[i].r == null && log[i].k === 'combat') i--;
    const run = [];
    for (; i >= 0; i--) { if (log[i].r == null) break; run.push(i); }
    const lines = run.reverse().filter(j => mayRead(log[j], viewer, mine)).map(row);
    const tail = []; for (let j = Math.max(0, log.length - 40); j < log.length; j++) if (mayRead(log[j], viewer, mine)) tail.push(row(j));
    const rolls = (st.rolls ?? []).filter(r => mayRead(r, viewer, mine));
    const today = []; for (let j = log.length - 1; j >= 0 && log[j].day === st.day; j--) if (mayRead(log[j], viewer, mine)) today.unshift(row(j));          // (the day's lines: what was dealt, said and fought today)
    return json({ lines, tail, today, rolls, n: log.length });
}

// His own day, as the screens that walk it read it: the plan as he drew it up (`planFull`, `planBase`, `planFree`, `planBlazing`), how far the turn has come (`turn`: the phase `i`, `results`, `climb`,
// `enchants` ...), how it ended (`turnEnd`: `blocked`, `blockers`, `closedIn`, `hidden`, `arrivals`, `natives`, `chits` ...), who is with him, and what the day cost him. Only his own.
function todayOf(st, viewer) {
    return withActor(st, viewer, () => {
        const out = {};
        for (const k of ['planBase', 'planKinds', 'planFull', 'planFree', 'planBlazing', 'turn', 'companions', 'mark', 'report', 'slain']) if (st[k] !== undefined) out[k] = json(st[k]);
        if (st.turnEnd) out.turnEnd = json(st.turnEnd);
        const own = x => !x.who || x.who === viewer;          // (several characters: a find carries the seat it was his)
        out.gains = json((st.gains ?? []).filter(own)); out.finds = json((st.finds ?? []).filter(own));          // (what he came by, newest last: items by `uid`, sites, cards and curses found)
        out.gainSeq = st.gainSeq ?? 0; out.findSeq = st.findSeq ?? 0; out.rollSeq = st.rollSeq ?? 0;
        return out;
    });
}

// The story so far, as the Journal reads it: the last lines of the log (not the dice, not the notes) that he may read, with every seat of his own player counted as his own (a hot seat reads
// the lines of all its characters). `rolls`: the dice of the game so far, newest last, each with its `n`.
function journalOf(st, viewer, owner) {
    const log = st.log ?? [], mine = new Set(st.order.filter(id => st.chars[id].owner === owner)), out = [];
    for (let j = log.length - 1; j >= 0 && out.length < JOURNAL_LINES; j--) {
        const l = log[j];
        if (l.k === 'roll' || l.k === 'info' || !mayRead(l, viewer, mine)) continue;
        out.push({ i: j, day: l.day, t: l.t, k: l.k, ...(l.s != null ? { s: l.s } : {}), ...(l.r != null ? { r: l.r } : {}), ...(l.who ? { who: l.who } : {}), ...(l.p ? { p: l.p } : {}), ...(l.vis ? { vis: l.vis } : {}), ...(l.with ? { with: l.with } : {}) });
    }
    return json(out.reverse());
}
const JOURNAL_LINES = 240;

/** @param {any} state a game state @param {string|null} viewer a character id (a seat), or null for a spectator @param {any} data the indexed rules data @param {{ engine?: string, api: string }} version */
export function makeView(state, viewer, data, version) {
    const st = clone(state);
    const me = viewer && st.chars[viewer] ? st.chars[viewer] : null;
    const over = st.period === 'over';
    const known = new Set([...(me?.seen ?? []), ...(me?.discovered?.sites ?? [])]);
    const chits = st.chits.map(ch => {
        const base = { id: ch.id, tile: ch.tile, clearing: ch.clearing != null ? ch.tile + ch.clearing : null };
        return ch.up || over ? { ...base, up: true, pile: !!ch.pile, face: faceOf(ch) } : { ...base, up: false, pile: !!ch.pile };
    });
    const ask = me ? st.asks.find(a => a.who === viewer)?.pending ?? null : null;
    const pending = ask ? { ...json(ask), who: viewer } : null;
    const table = {
        game: { players: st.players ?? [], day: st.day, period: st.period ?? 'birdsong', mode: st.mode ?? 'month', lastDay: st.lastDay ?? 28, options: json(st.options ?? {}), prowl: st.prowl, over: st.over ?? null,
            turn: st.dayRec?.order && st.actor ? st.actor : null, order: st.dayRec?.order ?? st.order, waitingFor: st.asks.map(a => a.who),
            dayRec: st.dayRec ? json(st.dayRec) : null },          // (the day's draw is public: who plays when, and who follows whom)
        map: { placements: st.placements, dwellings: st.dwellings ?? [], garrisonAt: st.garrisonAt ?? {}, ghostsAt: st.ghostsAt ?? null, sitesOpen: st.sitesOpen ?? {}, discSides: st.discSides ?? null },
        chits, piles: { lostCity: (st.piles?.lostCity ?? []).length, lostCastle: (st.piles?.lostCastle ?? []).length },
        monsters: st.mons.map(counterOf), natives: st.nats.map(counterOf),
        abandoned: Object.fromEntries(Object.entries(st.abandoned ?? {}).map(([at, l]) => [at, l.map(it => (CARD.has(it.kind) ? hiddenCard(it) : it))])),
        boxes: { sites: Object.fromEntries(Object.entries(st.sites ?? {}).map(([k, a]) => [k, a.length])), stock: Object.fromEntries(Object.entries(st.stock ?? {}).map(([k, a]) => [k, a.length])),
            twt: Object.keys(st.twt ?? {}).length, spellBox: Object.values(st.spellBox?.sites ?? {}).reduce((n, a) => n + a.length, 0), spellsAside: (st.spellsAside ?? []).length, scholarGoods: (st.scholarGoods ?? []).length },
        characters: Object.fromEntries(st.order.map(id => [id, publicChar(st, st.chars[id])])),
        fight: publicFight(st.battle, st, data),
        meetings: { follows: st.follows ?? {}, tradeWindow: st.tradeWindow ?? null, offers: (st.offers ?? []).map(o => ({ id: o.id, from: o.from, to: o.to })), blockCheck: st.blockCheck ?? null },
        missions: st.missions ?? null, score: over ? st.score ?? null : null,
    };
    const mine = me && {
        id: me.id, gold: me.gold, vp: me.vp, startValue: me.startValue, spells: { recorded: me.spells ?? [], learned: me.learned ?? [] }, items: me.items,
        discoveries: { paths: me.discovered?.paths ?? [], sites: me.discovered?.sites ?? [], siteCards: me.siteCards ?? {} },
        knows: { chits: Object.fromEntries(st.chits.filter(ch => known.has(ch.id) && !ch.up).map(ch => [ch.id, faceOf(ch)])), cards: me.shown ?? {}, enemies: me.findEnemies ?? {}, spied: [] },          // (V2: `shown` is the cards shown to him, kept for the game)
        plan: me.today?.plan ? { slots: me.today.plan, kinds: me.today.planKinds ?? [] } : null, policy: me.policy ?? null, curses: me.curses ?? [], boons: me.boons ?? [], killsToday: me.killsToday ?? 0, hiddenEnemies: !!me.hiddenEnemies,
        seats: st.order.filter(id => id !== viewer && st.chars[id].leader && st.chars[id].owner === me.owner),
        fight: fightOf(st, data, viewer),
        today: todayOf(st, viewer),
        journal: journalOf(st, viewer, me.owner),
        magic: withActor(st, viewer, () => { try { return json(spellFacts(st, data, new Set(st.order.filter(id => st.chars[id].owner === me.owner)))); } catch { return null; } }),          // (the spells in force, what a held or energized spell can do now, what a Fly would use)
        fightLog: fightLogOf(st, viewer, new Set([viewer, ...st.order.filter(id => id !== viewer && st.chars[id].leader && st.chars[id].owner === me.owner)])),
        earned: withActor(st, viewer, () => { try { return json(earned(st, data)); } catch { return null; } }),          // what he holds now toward each goal (score.js), for the fight's closing sheet
    };
    return json({
        api: { version: version.api, ...(version.engine ? { engine: version.engine } : {}), schema: version.schema },
        viewer: { seat: me ? viewer : null, player: me?.owner ?? null, owns: me ? [viewer, ...mine.seats] : [] },
        table, me: mine, pending, legal: legalFor(state, viewer, data, pending),
    });
}
