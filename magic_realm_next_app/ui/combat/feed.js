// combat/feed.js: the combat screens' one door to the engine (docs/engine-api/CONTRACT.md section 9). The screens hold the game state as an opaque value and ask the API about it: `view` for what is on
// the table and on the hero's own sheet, `legal` for what he may do, `check` for what-if questions, `apply` for the answer. Nothing here knows a rule; each function below only finds, in what the API
// returned, the thing the screen asked for (the stats of a creature on the sheet, the hero's weapon, the options of the question).
// The API is read once per state and seat and remembered while that state is the one on screen: a screen draws many times from one state. (A state is never changed in place by the screens; a new one replaces it.)
import { apiOf } from '../../engine/api.js';
import { denStats, hireFacts, defOf } from '../../engine/catalogue.js';

const raw = st => st?.__st ?? st;          // (a fight model carries the state it was made from; the API is asked about that)
const cache = new WeakMap();
const keyOf = st => `${st.rng}|${st.log?.length}|${st.actor}`;          // (every engine step draws a die or writes a line; a screen that swaps seats changes the actor)
function memo(st, who, kind, make) {
    let e = cache.get(st);
    const key = keyOf(st);
    if (!e || e.key !== key) cache.set(st, e = { key, byKey: new Map() });
    const k = `${kind}|${who}`;
    if (!e.byKey.has(k)) e.byKey.set(k, make());
    return e.byKey.get(k);
}
const whoOf = (st, who) => who ?? st.actor ?? st.order?.[0] ?? null;

const dataFor = new WeakMap();          // (the rules data a state was last asked about: a helper that is handed only a state - `roadLockOf(st)`, `standing(st, group)` - finds the API through it)
let lastData = null;
/** The rules data this state has been viewed through (or the last one used): for the helpers that take a state alone. */
export const dataOf = st => dataFor.get(raw(st)) ?? lastData;
/** What `who` (default: the character on screen) may know: view.schema.json. */
export const viewOf = (st, data, who) => { dataFor.set(raw(st), data); lastData = data; return memo(raw(st), whoOf(raw(st), who), 'view', () => apiOf(data).view(raw(st), whoOf(raw(st), who))); };
/** The question he is asked and every way to answer it: legal.schema.json. */
export const legalOf = (st, data, who) => memo(raw(st), whoOf(raw(st), who), 'legal', () => apiOf(data).legal(raw(st), whoOf(raw(st), who)));
/** The engine's own option record for his fight question (what the Encounter, Melee and Shift screens draw): legal(...).options. */
export function optionsOf(st, data, who) {
    const o = legalOf(st, data, who).options;
    // the Melee record lists the chits strong enough for the weapon and the load (`fightOkIds`, `moveOkIds`); the screens ask "is this chit strong enough?" of each chit, so the question is rebuilt from the lists
    if (o?.fightOkIds && !o.fightOk) Object.defineProperties(o, { fightOk: { value: ch => o.fightOkIds.includes(ch.id) }, moveOk: { value: ch => o.moveOkIds.includes(ch.id) } });
    return o;
}
/** Making change (4.2.4a, 8.5.1a): the tired one-asterisk chits that may come back for the chits `ids` he tires now ([] when he has no choice to make). From the options of the Fatigue question. */
export function makeChange(st, data, ids) {
    const chits = heroOf(st, data)?.chits ?? [];
    return (optionsOf(st, data)?.makeChange?.[[...new Set(ids)].sort().join('+')] ?? []).map(id => chits.find(x => x.id === id)).filter(Boolean);
}
/** A render starts from a fresh view of the state on screen (a state changed in place since the last render - a script, a test - is read as it is now). */
export const fresh = st => { if (st) { cache.delete(raw(st)); planMemo.delete(raw(st)); } };
/** The table's game as everyone sees it (view.table.game): day, period, mode, length, options, who is to play. */
export const gameOf = (st, data, who) => viewOf(st, data, who).table.game;
/** The fight of the clearing as the table sees it (view.table.fight), or null. */
export const tableFight = (st, data, who) => viewOf(st, data, who).table.fight;
/** The question the engine is asking him, as the API shows it (view.pending): the screens that draw a question read it here, not from the state. */
export const questionOf = (st, data, who) => viewOf(st, data, who).pending;
/** His own sheet of the fight (view.me.fight): the creatures on it with their stats, his hirelings, the round's tallies. Null outside a fight. */
export const sheetOf = (st, data, who) => viewOf(st, data, who).me?.fight ?? null;
/** The facts the Trade and Hire sheets need (legal.options of trade, trade-offer, hire, hire-offer): `stock`, `goods`, `mine`, `canPay`, `choices`, `ashes`, `groups[g] = { rel, drinks, noDrinks }`. */
export const tradeOf = (st, data, who) => legalOf(st, data, who).options ?? { ashes: false, groups: {}, stock: [], goods: [], mine: [], canPay: true, choices: [] };
/** His own day (view.me.today): the plan as drawn up (`planFull`, `planBase`), how far the turn has come (`turn`: `i`, `results`, `enchants` ...), how it ended (`turnEnd`), who is with him. {} for a spectator. */
export const todayOf = (st, data, who) => viewOf(st, data, who).me?.today ?? {};
/** The chits of the map as the map draws them, as the raw chit records read (`id, tile, pile, up, clearing` (the clearing's NUMBER, once it is face up), `kind, name, num` for a chit he can name), plus `seen`
 * (he looked at it: Magic Sight, a Locate) and `exchanged` (a valley warning, swapped for a dwelling). A face-down chit he knows nothing of carries no kind: it is a '?' on the map. From view.table.chits and view.me.knows. */
export function mapChits(st, data, who) {
    const v = viewOf(st, data, who), known = v.me?.knows.chits ?? {};
    return v.table.chits.map(c => {
        const f = c.up ? c.face : known[c.id];
        return { id: c.id, tile: c.tile, pile: c.pile, up: c.up, clearing: c.clearing != null ? Number(c.clearing.slice(c.tile.length)) : null, ...(f ? { kind: f.kind, name: f.name, num: f.num, ...(f.letter != null ? { letter: f.letter } : {}) } : {}), seen: !!known[c.id], ...(c.exchanged ? { exchanged: true, kind: 'warning', letter: 'V' } : {}) };
    });
}
/** The site chits he can name: the ones face up, and the face-down ones he has discovered or seen. [{ id, kind: 'site', name, num, tile, up, pile, discovered }] (a face-down chit he knows nothing of is not here). */
export function siteChits(st, data, who) {
    const v = viewOf(st, data, who), known = v.me?.knows.chits ?? {}, found = new Set(v.me?.discoveries.sites ?? []);
    return v.table.chits.map(c => ({ c, f: c.up ? c.face : known[c.id] })).filter(x => x.f?.kind === 'site').map(({ c, f }) => ({ id: c.id, kind: 'site', name: f.name, num: f.num, tile: c.tile, up: c.up, pile: c.pile, discovered: found.has(c.id) }));
}
/** Facts about his spells now (view.me.magic): `fx` (in force), `held`, `energize`, `heldLock`, `fly`, `blocked` (the spells he knows that cannot be cast now, with why). An empty record for a spectator. */
/** An active Flowers of Rest in his clearing: { name, tired, will, why, asleep } (what it will do to him today, or why it will not); null without one (view.me.lull). */
export const lullOf = (st, data, who) => viewOf(st, data, who).me?.lull ?? null;
export const magicOf = (st, data, who) => viewOf(st, data, who).me?.magic ?? { fx: [], held: [], heldLock: null, energize: [], blocked: [], fly: { sources: [], holdsBroomstick: false } };
/** His goals and standing (view.me.standing): `score`, `targets`, `progress`, and `earned` (view.me.earned: what he holds toward each goal now). */
export function standingOf(st, data, who) {
    const v = viewOf(st, data, who);
    return { earned: v.me?.earned ?? null, ...(v.me?.standing ?? { score: null, targets: null, progress: null }) };
}
/** The story so far (view.me.journal): the log lines he may read, no dice, no notes, oldest first. [] for a spectator. */
export const journalLines = (st, data, who) => viewOf(st, data, who).me?.journal ?? [];
/** The dice of the game so far, newest last (view.me.fightLog.rolls). */
export const rollsOf = (st, data, who) => viewOf(st, data, who).me?.fightLog?.rolls ?? [];
/** The slots of the plan he drew up for today (view.me.plan.slots), or []. */
export const planSlots = (st, data, who) => viewOf(st, data, who).me?.plan?.slots ?? [];
/** His own sheet in one record: his public sheet (chits, position, Fame, Notoriety, morph, mist, hidden ...) with what only he knows added (gold, every belonging in full, curses). A spectator, or a state with no such seat, gets an empty sheet. */
export function own(st, data, who) {
    const v = viewOf(st, data, who), c = v.table.characters[v.viewer.seat];
    return c && v.me ? { ...c, gold: v.me.gold, vp: v.me.vp, startValue: v.me.startValue, items: v.me.items, curses: v.me.curses, discovered: { paths: v.me.discoveries.paths, sites: v.me.discoveries.sites }, siteCards: v.me.discoveries.siteCards, spells: v.me.spells.recorded } : { chits: [], items: [], curses: [], gold: 0 };
}
/** The fight as the combat screens read it: ONE object made from what the API returned (`view`), shaped as the screens have always read it (`combat`, `battle`, `ch`, `chars`, `nats`, `mons`, `pending`, `log`, `rolls`, `over`, `day` ...), so that
 * no screen reaches into the engine's state. `fightLog` is the voice layer's input (lines with their events). A raw engine state is still accepted by every helper (the tests pass one); the entry points of the screens make this model once per render. */
export function fightModel(st, data, who) {
    const s = raw(st);
    cache.delete(s);          // (a render starts from a fresh view: a state changed in place since the last one - a script, a test - is read as it is now)
    const v = viewOf(s, data, who), me = v.me, lg = me?.fightLog ?? { lines: [], tail: [], rolls: [], n: 0 };
    const seen = new Set(), log = [...(lg.today ?? []), ...lg.lines, ...lg.tail].filter(l => !seen.has(l.i) && seen.add(l.i)).sort((a, b) => a.i - b.i);
    const fm = {
        day: v.table.game.day, period: v.table.game.period, over: v.table.game.over, actor: v.viewer.seat, order: v.table.game.order, players: v.table.game.players ?? [],
        ch: own(s, data, who), chars: Object.fromEntries(Object.entries(v.table.characters).map(([id, c]) => [id, { ...c, items: c.gear }])),          // (what lies in view of another character: his `gear`)
        nats: v.table.natives, mons: v.table.monsters, combat: me?.fight ?? null, battle: v.table.fight, pending: v.pending,
        asks: v.table.game.waitingFor.map(w => ({ who: w })), fightLog: lg, log, rolls: lg.rolls,
    };
    Object.defineProperty(fm, '__st', { value: s });
    return fm;
}
/** The seat on screen (view.viewer.seat): the character the engine is working for, or the one the screen moved to with `api.seat`. */
export const seatOf = (st, data) => viewOf(st, data).viewer.seat;
/** The table as the meeting, hireling and leader screens read it: ONE object made from the view, shaped as those screens have always read the state (`chars`, `order`, `players`, `follows`, `nats`, `mons`, `log`,
 * `tradeWindow`, `offers`, `blockCheck`, `followCheck`, `missions`, `options`, `period`, `day` ...), so no screen reaches into the engine's state (CONTRACT section 9). A seat of his own player (a hot-seat
 * character, a hired leader) is shown in full (`items`, `discovered`, `today.plan`); another player's character as the table sees him (`items` are the gear in view). A model passed in is returned as it is. */
export function tableModel(st, data, who) {
    if (st?.__tm) return st;
    const s = raw(st);
    return memo(s, whoOf(s, who), 'table', () => {
        const v = viewOf(s, data, who), g = v.table.game;
        const owner = id => v.table.characters[id]?.owner, mine = new Set(Object.keys(v.table.characters).filter(id => owner(id) === v.viewer.player));
        const chars = Object.fromEntries(Object.entries(v.table.characters).map(([id, c]) => {
            const full = mine.has(id) ? viewOf(s, data, id).me : null;
            return [id, { ...c, items: full ? full.items : c.gear, ...(full ? { gold: full.gold, vp: full.vp, policy: full.policy, spells: full.spells.recorded, discovered: { paths: full.discoveries.paths, sites: full.discoveries.sites } } : {}), today: { ...c.today, ...(full ? { plan: full.plan?.slots ?? null } : {}) } }];
        }));
        const tm = {
            day: g.day, period: g.period, over: g.over, mode: g.mode, lastDay: g.lastDay, prowl: g.prowl, options: g.options, actor: v.viewer.seat, order: Object.keys(v.table.characters), players: g.players ?? [], dayRec: g.dayRec,
            chars, nats: v.table.natives, mons: v.table.monsters, follows: v.table.meetings.follows, followCheck: v.table.meetings.followCheck ?? null, tradeWindow: v.table.meetings.tradeWindow,
            offers: v.table.meetings.offers, blockCheck: v.table.meetings.blockCheck, missions: v.table.missions, asks: g.waitingFor.map(w => ({ who: w })), pending: v.pending,
            ch: own(s, data, who), log: v.me?.journal ?? [], logSkipped: 0, logEnd: v.me?.logEnd ?? 0,
        };
        Object.defineProperties(tm, { __tm: { value: true }, __st: { value: s } });
        return tm;
    });
}
/** `own` under a name that no local variable in the play screens uses. */
export const ownSheet = own;
/** His public sheet (table.characters[id]): chits, gear in view, position, Fame, Notoriety ... */
export const heroOf = (st, data, who) => { const v = viewOf(st, data, who); return v.table.characters[v.viewer.seat] ?? null; };
/** The API's answer to "would this be accepted?" and the what-if probes of the Melee step (api.check). */
export const checkOf = (st, data, action, who) => apiOf(data).check(raw(st), whoOf(raw(st), who), action);
/** The state after an action, without playing it (a screen that wants to know what an automatic answer would do). */
export const tryApply = (st, data, action, who) => apiOf(data).apply(raw(st), { who: whoOf(raw(st), who), ...action });

// ---- what a creature, a hireling and the hero's gear are, found in what the API returned ----
/** The stats of a creature or counter as the rules read them now (name, size, vulnerability, harm, attack and move times ...). A creature of the hero's sheet carries them (`stat`); one lying on the map is read from the data. */
export function denSide(st, data, d) {
    const want = d.side ?? 'light';
    const f = sheetOf(st, data);
    const on = f?.dens.find(x => x.uid === d.uid) ?? f?.hires.find(x => x.uid === d.uid);
    // A counter turned over to look at its other side (a peek, note 97) is asked for with the other `side`: the stat the sheet carries is the side in play, so it must not answer for the printed other side.
    // A record that says nothing of its side is trusted as before.
    const sameSide = x => !x || x.side == null || (x.side ?? 'light') === want;
    const turned = !!on && !sameSide(on);
    if (turned) return denStats(data, { ...d, stat: undefined }, { combat: { dens: f?.dens ?? [] } });
    if (d.stat) return d.stat;
    if (on?.stat) return on.stat;
    const o = optionsOf(st, data)?.targets?.find(x => x.uid === d.uid);
    if (o?.stat && sameSide(o)) return o.stat;
    const t = viewOf(st, data).table.fight;          // (a creature of a fight of several: table talk)
    const pub = t?.dens.find(x => x.uid === d.uid) ?? t?.hires.find(x => x.uid === d.uid);
    if (pub?.stat && sameSide(pub)) return pub.stat;
    return denStats(data, d, { combat: { dens: f?.dens ?? [] } });
}
/** What a hired native or monster fights with. One on the hero's sheet carries it (`stat`); otherwise it is read from the data. */
export function hireStats(st, data, id, kind = 'nat', side = null) {
    const h = !side && (sheetOf(st, data)?.hires.find(x => x.id === id && x.kind === kind) ?? viewOf(st, data).table.fight?.hires.find(x => x.id === id && x.kind === kind));
    return h?.stat ?? hireFacts(data, id, kind, side);
}
/** The weapon he wields, { item, def }, or null (a creature wields none). */
export function weaponOf(st, data) {
    if (heroOf(st, data)?.morph) return null;
    const it = viewOf(st, data).me.items.find(i => i.kind === 'weapon' && i.active);
    return it ? { item: it, def: defOf(data, it) } : null;
}
/** The armor in use: [{ item, def }]. */
export const activeArmor = (st, data) => viewOf(st, data).me.items.filter(i => i.kind === 'armor' && i.active && !i.destroyed).map(item => ({ item, def: defOf(data, item) }));
/** Is this treasure card in force for him (owned, active)? */
export const hasTreasure = (st, data, id) => viewOf(st, data).me.items.some(i => i.kind === 'treasure' && i.active && !i.destroyed && i.id === id);

// ---- the Birdsong plan: what-if questions about a draft (api.check, probe 'plan') ----
const planMemo = new WeakMap();
/** What the engine says of a draft plan: { phases, kinds, valid } as phasesFor, planKinds and validatePlan answer. Remembered per state and draft. */
export function planInfo(st, data, slots, who) {
    const s = raw(st);
    let m = planMemo.get(s);
    if (!m || m.key !== keyOf(s)) planMemo.set(s, m = { key: keyOf(s), by: new Map() });
    const k = `${whoOf(s, who)}|${JSON.stringify(slots)}`;
    if (!m.by.has(k)) m.by.set(k, apiOf(data).check(s, whoOf(s, who), { type: 'plan', slots, probe: 'plan' }).plan);
    return m.by.get(k);
}
export const phasesFor = (st, data, slots, who) => planInfo(st, data, slots, who).phases;
export const planKinds = (st, data, slots, who) => planInfo(st, data, slots, who).kinds;
export const validatePlan = (st, data, slots, who) => planInfo(st, data, slots, who).valid;

/** The public sheet of every character on the table (view.table.characters): name, position, chits, gear in view, Fame, Notoriety, whether he is a hired leader ... */
export const charsOf = (st, data, who) => viewOf(st, data, who).table.characters;
/** The mission, campaign and visitor chits of a game that has them (view.table.missions), else null. */
export const missionsOf = (st, data, who) => viewOf(st, data, who).table.missions ?? null;
