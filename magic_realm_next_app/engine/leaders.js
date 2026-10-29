import { say } from './core.js';
import { makeItem, nextDayGear } from './items.js';
import { withActor } from './party.js';
import { rulesOn } from './hirestate.js';
import { isCave } from './world.js';

// HIRED LEADERS AND CONTROLLED MONSTERS AS SEATS (rules 6.2.5, 7.2.2b, 7.3.1g, 7.3.2e.1, 7.5.4h, 7.6.1c, 7.7.2, 7.7.5e, 8.1.2b; ruling H7, Mike 2026-10-26: build it).
//
// "When hired, he functions like a character: he gets an Attention chit and a Personal History sheet, records activities for his Daylight phases, can be followed like a character,
// and he can record discoveries and carry belongings and recorded gold for the hiring character" (7.7.2). A controlled monster "functions like a hired leader" (7.7.5e).
// So that is what the engine makes of him: a SEAT in the party (party.js), owned by the same player as the hiring character, with a character-shaped record in st.chars and st.order.
// All the machinery of several characters in one game then works for him as it does for a character: the plan he is asked for in Birdsong, the Attention chit drawn with the
// others at Sunrise, his turn of two Basic and two Sunlight phases, his own discoveries, belongings and gold, trading with the others in his clearing, being followed, being blocked,
// ending his turn so that monsters move and denizens appear. What differs is here and in a handful of one-line hooks (marked "hireling rules" or "leader" in day.js, items.js, hire.js, search.js).
// It runs only with the option `options.hirelingRules` (hirestate.js); without it a hired leader follows his hirer like any hireling, as the engine always had it.
//
// The record of a seat (st.chars[id]), id = the counter's id ('CHQ', 'giant-bat-2'):
//   leader: { kind: 'nat' | 'mon', id, hirer, moveStrength }   what he is and whose he is: the hiring (or controlling) character; the weight he can carry (7.3.1g, 7.7.5e): a native's move
//                                                              strength is his vulnerability letter (2.2.4: the Knights are Tremendous, Heavy weight), a monster's its vulnerability
//   attention: { kind: 'red', number } | { kind: 'character', character }    "the leader takes an unused character's chit or a red numbered chit" (7.7.2)
//   gold, items, discovered, seen, hiddenEnemies   his own sheet; they belong to the hirer but he cannot use them while they are with the leader (7.7.2a)
//   chits [], adv [], spells [], vp: none         he has no action chits, no advantages, no spells to record
// His counter in st.nats / st.mons keeps being hired; its `loc` and `hidden` follow the seat after every action.
// The seat is made at the Birdsong after the hire (a hireling does not begin to act at once: 7.11.3), unmade when he is no longer hired (a term that ended, a dismissal, a death,
// a spell that let go): his belongings go to his group's box (7.7.2a.4) or, for a monster, are abandoned where it stands (7.7.5e.2); his gold and discoveries vanish.

export const hooks = {};                                       // day.js fills in beginChar
export const isSeat = c => !!c?.leader;
export const seatIds = st => st.order.filter(id => st.chars[id]?.leader);
// the characters who are really playing (not seats of leaders): what scoring, death and the end of the game count
export const realIds = st => st.order.filter(id => !st.chars[id]?.leader);
export const partyMulti = st => realIds(st).length > 1;
const recOf = (st, c) => (c.leader.kind === 'nat' ? st.nats : st.mons).find(x => x.id === c.leader.id);

// What a leader may record (6.2.5): any activity a character can. Alert and Rest do nothing for himself, only for the characters who follow him; an Enchant phase is of use to nobody, and a
// controlled monster has no Trade or Hire phase: as with any activity that cannot be done (ruling S6, Mike 2026-10-26) it is RECORDED and lost when it comes (`refuse`).
export const MONSTER_NO = ['trade', 'hire'];
// Phases that are recorded but do nothing for him (Alert, Rest): they serve the characters who follow him (6.2.5).
export const recordOnly = new Set(['alert', 'rest']);

// Refused at the moment of the phase (a plan from outside the engine, or a state that changed since): the sentence, or null.
export function refuse(st, slot) {
    const c = st.ch;
    if (!c.leader || !slot) return null;
    if (c.leader.kind === 'mon' && MONSTER_NO.includes(slot.act)) return 'A controlled monster cannot do Trade or Hire phases (7.7.5e.1).';
    if (slot.act === 'enchant') return 'A hired leader cannot use Enchant phases (6.2.5).';
    return null;
}

// 7.7.2c: a hired leader (or controlled monster) opens the Vault and the Crypt of the Knight if he has a Tremendous harm letter on either side of his counter, or he (or his horse) has
// Tremendous move strength.
export function opensVault(st, data) {
    const c = st.ch;
    if (!c.leader) return false;
    const def = c.leader.kind === 'nat' ? data.natives[c.leader.id] : data.monsters[c.leader.id];
    if (c.leader.moveStrength === 'T' || def?.light?.harm === 'T' || def?.dark?.harm === 'T') return true;
    const h = c.items.find(i => i.kind === 'horse' && i.active && !i.destroyed);
    return !!h && (data.horses[h.id]?.walk?.strength === 'T' || data.horses[h.id]?.gallop?.strength === 'T');
}
// The search tables a leader cannot use (7.5.2): Reading Runes and Magic Sight.
export const noTable = (st, table) => !!st.ch.leader && (table === 'runes' || table === 'magicsight');

// What the plan sheet shows for a seat's turn. (Birdsong: a leader stands on his native horse unless he is in a cave, where it cannot be ridden, 7.3.2e.2; the horse is what gives him his extra phases.)
export function planInfo(st, data) {
    const c = st.ch;
    if (!c.leader) return null;
    const mount = c.items.find(i => i.kind === 'horse' && !i.destroyed);
    if (mount && c.at && !c.onRoad) mount.active = !isCave(st, data, c.at);
    const h = st.chars[c.leader.hirer];
    return { kind: c.leader.kind, hirer: c.leader.hirer, hirerName: h?.name ?? null, attention: c.attention, acts: ['move', 'hide', 'search', ...(c.leader.kind === 'nat' ? ['trade', 'hire'] : []), 'follow', 'rest', 'alert'], recordOnly: [...recordOnly] };
}

// ---- making and unmaking seats ----
const nameOf = (data, kind, id) => (kind === 'nat' ? data.natives[id]?.name : data.monsters[id]?.name) ?? id;
const attentionFor = (st, data) => {
    const used = new Set(seatIds(st).map(id => st.chars[id].attention).filter(a => a?.kind === 'red').map(a => a.number));
    for (let n = 1; n <= 6; n++) if (!used.has(n)) return { kind: 'red', number: n };
    const free = Object.keys(data.characters ?? {}).find(id => !st.order.includes(id) && !seatIds(st).some(s => st.chars[s].attention?.character === id));
    return free ? { kind: 'character', character: free } : { kind: 'red', number: 7 };
};

// The record of a seat for this counter.
function seatRecord(st, data, kind, rec, hirer) {
    const def = kind === 'nat' ? data.natives[rec.id] : data.monsters[rec.id];
    const owner = st.chars[hirer].owner;
    const ch = {
        id: rec.id, name: nameOf(data, kind, rec.id), weight: def.weight ?? def.vulnerability, at: rec.loc.c, hidden: false, dead: false, gold: 0, fame: 0, notoriety: 0,
        chits: [], items: [], discovered: { paths: [], sites: [] }, seen: [], hiddenEnemies: false, killsToday: 0,
        vp: { great: 0, spells: 0, fame: 0, notoriety: 0, gold: 0 }, onRoad: null, startDwelling: null, startValue: 0,
        adv: [], spells: [], learned: [], owner, life: 1, today: { plan: null, turn: null, combat: null },
        leader: { kind, id: rec.id, hirer, moveStrength: def.vulnerability },
        attention: attentionFor(st, data),
        policy: { block: 'never', follow: 'stay', dayEnd: false },
    };
    // a native on his own horse (the square counter, 7.3.2e): the horse is his, ridden, and gives the extra Move phases a character's would (7.3.2e.1)
    const horse = kind === 'nat' && def.horse && !rec.horseDead ? Object.values(data.horses).find(h => h.mountOf === rec.id) : null;
    if (horse) ch.items.push(makeItem(st, 'horse', horse.id, { active: !isCave(st, data, rec.loc.c) }));          // (not in a cave: 7.3.2e.2)
    return ch;
}

function joinParty(st, ch) {
    st.chars[ch.id] = ch;
    st.order.push(ch.id);
    const p = st.players.find(x => x.id === ch.owner);
    if (p) p.chars.push(ch.id);
}

// Which hired leaders and controlled monsters should have a seat now: hired earlier than today (a hireling begins to act at the Birdsong after his hire: 7.11.3), alive, standing on the map.
function wanted(st, data) {
    const out = [];
    for (const n of st.nats) if (n.hired && !n.dead && data.natives[n.id]?.leader && (n.hiredDay == null || n.hiredDay < st.day) && n.loc?.c && st.chars[n.hiredBy] && !st.chars[n.hiredBy].leader) out.push({ kind: 'nat', rec: n, hirer: n.hiredBy });
    for (const m of st.mons) if (m.hired && !m.dead && m.tie?.kind === 'control' && m.loc?.c && st.chars[m.hiredBy] && !st.chars[m.hiredBy].leader) out.push({ kind: 'mon', rec: m, hirer: m.hiredBy });
    return out;
}

// Seats for the leaders that have none, and no seat for those who are not hired any more. At Midnight, just before the new day begins (day.js), and when a world is loaded (tools/scenario).
export function syncSeats(st, data, { quiet = false } = {}) {
    if (!rulesOn(st)) return;
    prune(st, data);
    const want = wanted(st, data);
    for (const w of want) {
        if (st.chars[w.rec.id]) continue;
        const was = st.order.length;
        const ch = seatRecord(st, data, w.kind, w.rec, w.hirer);
        if (was === 1 && st.period === 'birdsong') for (const id of st.order) st.chars[id].today.stage ??= st.chars[id].today.plan ? 'planned' : 'plan';          // (the first seat after the hirer makes it a shared day)
        joinParty(st, ch);
        if (!quiet) say(st, `${ch.name} gets an Attention chit and a sheet of his own: ${w.kind === 'nat' ? 'he acts for' : 'it acts for'} ${st.chars[w.hirer].name} from now on.`, 'day', null, { who: null });
        if (st.period === 'birdsong' && hooks.beginChar) withActor(st, ch.id, () => hooks.beginChar(st, data));
    }
}

// A seat whose counter is no longer a hired leader (or controlled monster) is closed: his belongings go to his group's box on the Setup Card (a native, 7.7.2a.4) or are abandoned where
// he stands (a monster, 7.7.5e.2 / a leader who was killed); his recorded gold and discoveries are cancelled. Returns the ids closed.
export function prune(st, data) {
    const gone = [];
    for (const id of seatIds(st)) {
        const c = st.chars[id], rec = recOf(st, c);
        const ok = rec && rec.hired && !rec.dead && (c.leader.kind === 'nat' || rec.tie?.kind === 'control') && rec.hiredBy === c.leader.hirer && st.chars[c.leader.hirer] && !st.chars[c.leader.hirer].dead;
        if (!ok) gone.push(id);
    }
    for (const id of gone) unseat(st, data, id);
    return gone;
}

export function unseat(st, data, id) {
    const c = st.chars[id];
    if (!c?.leader) return;
    const rec = recOf(st, c);
    const dead = !!rec?.dead || !rec;
    const items = c.items.filter(i => !i.destroyed && i.kind !== 'horse').map(i => ({ ...i, active: false, alerted: false }));
    const group = c.leader.kind === 'nat' ? data.natives[c.leader.id]?.group : null;
    let where = null;
    if (items.length) {
        if (group && !dead) {
            for (const it of items) (st.stock[group] ??= []).push({ kind: it.kind, id: it.id, damaged: !!it.damaged, ...(it.card ? { card: it.card } : {}) });
            where = `${group} box`;
        } else if (c.at) {
            st.abandoned[c.at] = [...(st.abandoned[c.at] ?? []), ...items];
            where = `clearing ${c.at}`;
        }
    }
    if (rec && c.at && rec.loc?.c !== c.at && !dead) rec.loc = { c: c.at };
    if (rec) { delete rec.guide; }
    // out of the party
    delete st.chars[id];
    st.order = st.order.filter(x => x !== id);
    if (st.actor === id) st.actor = st.order[0] ?? null;
    for (const p of st.players) p.chars = p.chars.filter(x => x !== id);
    st.asks = st.asks.filter(a => a.who !== id);
    if (st.dayRec) { const k = st.dayRec.order.indexOf(id); if (k >= 0) { st.dayRec.order.splice(k, 1); if (k < st.dayRec.i) st.dayRec.i--; } if (st.dayRec.follow) { delete st.dayRec.follow[id]; for (const g of Object.keys(st.dayRec.follow)) st.dayRec.follow[g] = st.dayRec.follow[g].filter(x => x !== id); } }
    if (st.follows) { for (const [f, g] of Object.entries(st.follows)) if (f === id || g === id) delete st.follows[f]; if (!Object.keys(st.follows).length) delete st.follows; }
    if (st.offers) { st.offers = st.offers.filter(o => o.from !== id && o.to !== id); if (!st.offers.length) delete st.offers; }
    if (st.evening) { for (const u of st.evening.units) u.ids = u.ids.filter(x => x !== id); }
    for (const a of st.asks) if (a.pending?.type === 'meet-offer' && (a.pending.from === id)) a.pending = a.pending.resume ?? a.pending;
    if (st.order.length === 1) { const last = st.chars[st.order[0]]; if (last?.today) delete last.today.stage; }          // (back to a day of one character)
    say(st, `${c.name} is no longer ${c.leader.kind === 'nat' ? 'in your pay' : 'in your hand'}${where ? `: what he carried goes to the ${where}` : ''}.`, 'trade', null, st.order.length > 1 ? { who: c.leader.hirer } : null);
}

// The game is over for a single player with leaders: the seats take no further part, and the final question is the player's (day.js, died / midnight / endGame).
export function closeTable(st) {
    st.asks = st.asks.filter(a => !isSeat(st.chars[a.who]));
    const r = realIds(st);
    if (r.length && !r.includes(st.actor)) st.actor = r[0];
}

// ---- the Evening ----
// A single player's evening ends on the question where he may rearrange his belongings (day.js eveningDone, 4.3.3a); with leaders in the party the evenings are taken one clearing at a time,
// so that question comes once, when every clearing has had its fight.
export function eveningEnds(st, data) {
    if (partyMulti(st) || !st.pauseEvening) return false;
    const id = realIds(st)[0], c = st.chars[id];
    if (!c || c.dead || c.flying || c.mist || c.morph) return false;
    withActor(st, id, () => { st.pending = { type: 'evening-end', gear: nextDayGear(st, data) }; });
    return true;
}
// ---- after every action ----
// The counter of a seat follows him; the Fame and Notoriety he gains or loses are the hirer's at once (7.7.2b); the map chits he looked at, the hirer looks at too (7.5.4h.1).
export function afterStep(st, data) {
    if (!rulesOn(st)) return;
    prune(st, data);
    for (const id of seatIds(st)) {
        const c = st.chars[id], h = st.chars[c.leader.hirer], rec = recOf(st, c);
        if (rec && c.at && !c.onRoad) rec.loc = { c: c.at };
        if (rec) rec.hidden = !!c.hidden;
        if (c.fame || c.notoriety) { h.fame += c.fame; h.notoriety += c.notoriety; c.fame = 0; c.notoriety = 0; }
        for (const s of c.seen ?? []) if (!(h.seen ??= []).includes(s)) h.seen.push(s);
    }
}

// A leader trades, hires and is hired for by the hirer's relationships: his `rel` and `boons` ARE the hirer's for as long as an action runs (7.6.1c, 7.7.2b).
export function alias(st) {
    for (const id of seatIds(st)) { const c = st.chars[id], h = st.chars[c.leader.hirer]; if (!h) continue; h.boons ??= []; c.rel = h.rel; c.boons = h.boons; }
}
export function unalias(st) {
    for (const id of seatIds(st)) { const c = st.chars[id]; delete c.rel; delete c.boons; }
}
