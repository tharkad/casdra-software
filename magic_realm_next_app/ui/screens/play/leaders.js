// play/leaders.js: the screens of HIRED LEADERS and HIRELINGS (option `hirelingRules`; app/ui/leaders.js has the pure words and lists, docs/rules-spec/hire-leaders-notes.md the engine side).
// A hired leader or a monster taken in hand is a SEAT of the player's party: the party bar (hotseat.js) names each seat with its Attention chit, the plan tray (plan.js) records a plan for each,
// and this file builds what is new on the screen:
//   seatBits(G, id)          the Attention chit that stands in a seat's chip in the party bar
//   seatLine(G)              the small "Company leader · hired by Amazon" line the tray puts under the place
//   assignSheet(G)           the daily "Who goes with whom" sheet: every underling with one guide (or "stays here"), sent as the plan's `assign`
//   followerChips(G)         "Leave Rogues behind" at the start of a guide's phase (`{ type: 'hireling', kind: 'stay' }`)
//   leaderSheet(G)           the sheet of the seat now acting: his belongings (abandon only), gold, discoveries, his followers
//   handoverSheet(G)         the hirer gives to his leader or takes from him, offer and answer in one step (the engine does not accept for the other)
//   sunriseSheet(G)          the draw of the Attention chits: who is up first, once a day
//   unattendedBlock(G, day)  the morning report's account of fights a leader had where no character stood (8.1.2b)
//   counterEl(G, o)          a hired counter as a picture with its `side` and `hidden`
//   showSeat(G, id)          a tap on a seat's counter on the map
// Story words are plain and short; Detail names the rule. Nothing here decides a rule: the engine refuses, the sheet says why.
import { meetOptions } from '../../../engine/meet.js';
import { nameOfClearing } from '../../../engine/world.js';
import { voiced } from '../../commit.js';
import { h } from '../../dom.js';
import { btn, primary, sect, voiceSwitch } from '../../ds.js';
import { icon } from '../../icons.js';
import { assignMap, assignSummary, attentionOf, beltOf, carryWord, counterLook, discoveriesOf, followersOf, hirerOf, introOf, leaderGame, nameOfCounter, realIds, roleOf, seatIds, seatName, stayHirer,
    underlingRows, unattendedFights } from '../../leaders.js';
import { isStory, logText } from '../../voice.js';
import { footRow } from '../kit/common.js';
import { act, actMany } from './actions.js';
import { modal, picOf, showToast } from './kit.js';
import { planWhole, startDay } from './plan.js';
import { render } from './shell.js';
import { switchTo } from './hotseat.js';
import { myId } from './state.js';
import { playerOf } from '../../meet.js';

const nb = s => String(s).replace(/ (\d+)$/, ' $1');

// ---------------------------------------------------------------------------------------------------------------------------------- pieces
/** The Attention chit: a red numbered chit (a leader takes the first free one), or the initial of the unused character's chit he took. */
export const attnChit = (att, cls = '') => (att ? h('i', { class: `attn ${att.kind}${cls ? ' ' + cls : ''}`, 'aria-hidden': 'true' }, att.short) : null);

export const seatBits = (G, id) => (G.st.chars[id]?.leader ? [attnChit(attentionOf(G.st, G.data, id))] : []);

/** The art of a hired counter, from the printed counters. */
function counterArt(G, o) {
    if (G.data.natives?.[o.id]) return G.data.art?.natives?.[o.id] ?? null;
    const name = G.data.monsters?.[o.id]?.name;
    return G.data.art?.monstersColor?.[name] ?? G.data.art?.monsters?.[name] ?? null;
}

/** A hired counter drawn as a counter: dark when hidden (the dark side is up), red for a hidden Tremendous monster (7.7.1g, 7.7.5d, 8.8.6); `data-side` and `data-hidden` carry it for the styles and the tests. */
export function counterEl(G, o, cls = 'sm') {
    const look = counterLook(o), src = counterArt(G, o), name = nameOfCounter(G.data, o);
    const el = h('span', { class: `ds-counter ${cls} hc`, 'data-side': look.side, 'data-hidden': look.hidden ? '1' : '0', title: `${name}: ${look.word}`, 'aria-label': `${name}, ${look.word}` },
        src ? h('img', { src, alt: '', draggable: 'false' }) : h('span', { class: 'kit-noart' }, name));
    if (look.hidden) el.append(h('i', { class: 'hc-eye', 'aria-hidden': 'true' }, icon('eyeoff')));
    return el;
}

// ---------------------------------------------------------------------------------------------------------------------------------- a shared table: the seats of MY party
/** The seats this screen's player plays: all of a solo party; at a shared table my character and the hired leaders and controlled monsters that belong to me (the same owner). */
export function ownSeats(G) {
    const st = G.st;
    if (!G.shared) return st.order.slice();
    const me = myId(G), owner = st.chars[me]?.owner;
    return st.order.filter(id => id === me || (!!owner && st.chars[id]?.leader && st.chars[id].owner === owner));
}
/** The players of a table are people: a hired leader of somebody's is not one more player in the strip (his counter is on the map and his chip in his hirer's seat bar). */
export const tableCrew = (G, crew) => (G.shared && leaderGame(G.st) ? crew.filter(x => !G.st.chars[x.id]?.leader) : crew);
/** At a table the server's view is the viewer's own character's; the seat on screen is a choice of this phone. After every answer: stay on the seat the player chose while it still has a question,
 *  else go to the first of his seats that is asked something (a seat of his is asked at Birdsong, at his turn), else keep the choice, else his own character. */
export function settleSeat(G) {
    const st = G.st;
    if (!G.shared || !leaderGame(st)) return;
    const own = ownSeats(G), asked = id => st.asks.some(a => a.who === id && a.pending), chosen = G.ui.seat && own.includes(G.ui.seat) ? G.ui.seat : null;
    const pick = (chosen && asked(chosen) ? chosen : null) ?? own.find(asked) ?? chosen ?? own[0];
    G.ui.seat = pick;
    if (pick && st.chars[pick]) st.actor = pick;
}

// ---------------------------------------------------------------------------------------------------------------------------------- the line under the place
/** Who is acting, when it is a seat: "Company leader · hired by Amazon", with his chit. Null for the player's own character. */
export function seatLine(G) {
    const st = G.st, id = st.actor, c = st.chars[id];
    if (!c?.leader) return null;
    const att = attentionOf(st, G.data, id);
    return h('span', { class: 'seat-line', 'data-seat-line': id }, attnChit(att), h('span', {}, `${roleOf(st, id) === 'Hired leader' ? 'hired by' : 'in the power of'} ${seatName(st, c.leader.hirer)}`));
}

// ---------------------------------------------------------------------------------------------------------------------------------- who goes with whom
function assignState(G) {
    const a = G.ui.assign;
    if (!a || a.day !== G.st.day || a.who !== G.st.actor) G.ui.assign = { day: G.st.day, who: G.st.actor, picked: {}, confirmed: false };
    return G.ui.assign;
}
/** Does the plan still need the assignment sheet? Underlings that can be assigned today and no confirmation yet. */
export function needsAssign(G) {
    const p = G.st.pending, a = G.ui.assign;
    if (p?.type !== 'plan' || !p.underlings?.some(u => !u.today)) return false;
    return !(a && a.day === G.st.day && a.who === G.st.actor && a.confirmed);
}
export const assignRows = G => { const a = assignState(G); return underlingRows(G.st, G.data, G.st.pending?.underlings, G.ui.assignMemory, a.picked); };
/** The `assign` map the plan carries, and what was chosen is remembered for tomorrow's default. */
export function takeAssign(G) {
    const rows = assignRows(G);
    if (!rows.some(r => !r.today)) return null;
    const map = assignMap(rows);
    G.ui.assignMemory = { ...(G.ui.assignMemory ?? {}), ...map };
    return map;
}

function guideChips(G, r) {
    const a = assignState(G), pick = id => { a.picked[r.id] = id; render(G); };
    return h('div', { class: 'as-opts', role: 'radiogroup', 'aria-label': `Who ${r.name} goes with` },
        ...r.guides.map(g => h('button', { type: 'button', class: `ds-chip as-opt${r.choice === g.id ? ' on' : ''}`, role: 'radio', 'aria-checked': r.choice === g.id ? 'true' : 'false', 'data-underling': r.id, 'data-guide': g.id, onclick: () => pick(g.id) },
            g.seat ? attnChit(attentionOf(G.st, G.data, g.id), 'sm') : null, g.name)),
        h('button', { type: 'button', class: `ds-chip as-opt${r.choice == null ? ' on' : ''}`, role: 'radio', 'aria-checked': r.choice == null ? 'true' : 'false', 'data-underling': r.id, 'data-guide': '', onclick: () => pick(null) }, 'Stays here'));
}

export function assignSheet(G) {
    const st = G.st, rows = assignRows(G), a = assignState(G), live = rows.filter(r => !r.today), whole = planWhole(G);
    const back = () => { G.ui.sheet = 'plan'; render(G); };
    const go = () => { a.confirmed = true; if (whole && G.ui.draft) startDay(G); else { G.ui.sheet = 'plan'; render(G); } };
    const everyone = live.length > 1 ? realIds(st).find(id => live.every(r => r.guides.some(g => g.id === id))) : null;
    const cards = rows.map(r => h('div', { class: `as-card${r.today ? ' dim' : ''}`, 'data-underling-row': r.id },
        h('div', { class: 'as-head' }, counterEl(G, { id: r.id, side: r.side, hidden: r.hidden }, 'sm'),
            h('span', { class: 'main' }, h('b', {}, r.name), h('span', {}, r.atName ? `in ${nb(r.atName)}` : 'not on the map'))),
        r.today ? h('p', { class: 'ds-hint-line' }, voiced({ story: 'Hired today: he waits until tomorrow.', detail: 'A hireling does not begin following until the Birdsong after he is hired (7.11.3).' }))
            : !r.guides.length ? h('p', { class: 'ds-hint-line' }, voiced({ story: 'None of your people stand with him, so he stays here.', detail: 'An underling can follow only a character or hired leader in his own clearing (6.3.1).' }))
                : guideChips(G, r),
        !r.today && r.remembered && r.choice === r.remembered && !(r.id in a.picked) ? h('p', { class: 'ds-hint-line as-same' }, voiced({ story: 'The same as yesterday.', detail: 'The guide he had yesterday (6.3.1: the choice is made again every Birdsong).' })) : null));
    const body = h('div', { class: 'as', 'data-assign': '' },
        h('p', { class: 'ds-voice as-intro' }, voiced({
            story: 'Each follower goes with one of your people all day, or stays here.',
            detail: 'Underlings are assigned to a guide in Birdsong (6.3.1). They go where the guide goes, hide only when he hides (6.3.1b, 7.4.5), and are put back on the map where he ends his turn (7.7.3b). Not assigned: they spend the day where they are.' })),
        everyone ? h('button', { type: 'button', class: 'ds-btn sm as-all', 'data-act': 'assign-all', onclick: () => { for (const r of live) a.picked[r.id] = everyone; render(G); } }, `Everyone with ${seatName(st, everyone)}`) : null,
        ...cards);
    const sum = assignSummary(rows);
    return modal(G, 'Who goes with whom', body, { eyebrow: `Day ${st.day} · followers`, detent: 'tall', bare: true,
        footer: footRow({ note: sum ? nb(sum) : 'No one follows today.', secondary: btn('Back', 'quiet', { 'data-act': 'assign-back', onclick: back }), primary: primary(whole ? 'Start the day' : 'Done', { 'data-act': 'assign-ok', onclick: go }) }) });
}

/** The one line the plan tray shows once the plan is whole: who follows whom, and the button to change it. */
export function followersLine(G) {
    const p = G.st.pending;
    if (p?.type !== 'plan' || !p.underlings?.length) return null;
    const rows = assignRows(G), sum = assignSummary(rows), a = assignState(G);
    return h('div', { class: 'as-line', 'data-as-line': '' }, h('span', { class: 'ds-dim' }, sum ? `Followers: ${nb(sum)}.` : 'Your followers wait until tomorrow.'),
        sum ? btn(a.confirmed ? 'Change' : 'Set', 'quiet sm', { 'data-act': 'assign-open', onclick: () => { G.ui.sheet = 'assign'; render(G); } }) : null);
}

// ---------------------------------------------------------------------------------------------------------------------------------- leave behind
/** At the start of a guide's phase his hirer may let a follower stay where he stands (7.7.3a, 7.11.5): a chip for each. */
export function followerChips(G) {
    const st = G.st, p = st.pending, id = st.actor;
    if (!G.st.options?.hirelingRules || p?.type !== 'phase') return [];
    const hirer = stayHirer(st, id);
    return followersOf(st, G.data, id).map(o => {
        const name = nameOfCounter(G.data, o);
        return h('button', { type: 'button', class: 'ds-chip spellact leavechip', 'data-act': 'leave-behind', 'data-id': o.id, title: `${name} stays where ${seatName(st, id)} stands now, and goes no further with him today (7.7.3a)`,
            onclick: () => act(G, { type: 'hireling', kind: 'stay', ids: [o.id], who: hirer }) }, counterEl(G, o, 'xs'), `Leave ${name} behind`);
    });
}

// ---------------------------------------------------------------------------------------------------------------------------------- his sheet
const lockWhy = {
    story: 'He can leave a thing at the start of one of his phases.',
    detail: 'A hired leader can abandon belongings at the start of a phase of his own turn but cannot activate or deactivate them (4.3.2, 7.2.2b).',
};

export function leaderSheet(G) {
    const st = G.st, id = st.actor, c = st.chars[id], hirer = hirerOf(st, id), hn = seatName(st, hirer), att = attentionOf(st, G.data, id), gear = beltOf(st, G.data, id), disc = discoveriesOf(st, id);
    const close = () => { G.ui.sheet = null; render(G); };
    const can = st.pending?.type === 'phase' || st.pending?.type === 'phase-pick';
    const intro = introOf(st, G.data, id);
    const rowsGear = gear.map(({ it, name, sub }) => h('div', { class: 'ds-row ls-item', 'data-item': it.uid },
        h('span', { class: 'art' }, picOf(G, name) ? h('img', { src: picOf(G, name), alt: '' }) : icon('cache')),
        h('span', { class: 'main' }, h('b', {}, name), sub ? h('span', {}, sub) : null),
        h('button', { type: 'button', class: `ds-btn sm quiet${can ? '' : ' is-dim'}`, 'data-act': 'leader-leave', 'aria-disabled': can ? null : 'true',
            onclick: () => { if (!can) { showToast(G, isStory() ? lockWhy.story : lockWhy.detail, true); return; } act(G, { type: 'tidy', item: it.uid, drop: true, who: id }); } }, 'Leave it')));
    const followers = followersOf(st, G.data, id);
    const body = h('div', { class: 'ls', 'data-leader-sheet': id },
        intro ? h('p', { class: 'ds-voice ls-intro' }, voiced(intro)) : null,
        h('div', { class: 'ls-facts' },
            h('div', { class: 'ls-fact' }, attnChit(att, 'lg'), h('span', {}, h('b', {}, att?.label ?? 'No chit'), h('small', {}, 'his Attention chit'))),
            carryWord(st, id) ? h('div', { class: 'ls-fact' }, icon('bag'), h('span', {}, h('b', {}, carryWord(st, id)), h('small', {}, 'the most he can carry'))) : null),
        sect('He carries', gear.length ? `${gear.length}` : ''),
        gear.length ? h('div', { class: 'ds-list' }, ...rowsGear) : h('p', { class: 'ds-meta' }, 'Nothing.'),
        gear.length ? h('p', { class: 'ds-hint-line' }, voiced(lockWhy)) : null,
        sect('Gold'),
        h('p', { class: 'ls-gold' }, h('b', { 'data-ls-gold': '' }, `${c.gold ?? 0} gold`), ' ', h('span', { class: 'ds-meta' }, voiced({ story: `It is ${hn}’s, but ${hn} cannot spend it while it is with him.`, detail: `Gold, belongings and discoveries on a leader’s sheet belong to ${hn} but are out of his reach, and do not count toward his goals (7.7.2a).` }))),
        sect('What he has found'),
        h('p', { class: 'ls-disc' }, disc.paths || disc.sites ? `${disc.paths} hidden path${disc.paths === 1 ? '' : 's'} and ${disc.sites} site${disc.sites === 1 ? '' : 's'}. ${hn} can learn them when he hands them over.` : 'Nothing yet.'),
        followers.length ? sect('Walking with him') : null,
        followers.length ? h('div', { class: 'ls-follow' }, ...followers.map(o => h('span', { class: 'ls-fl' }, counterEl(G, o, 'sm'), nameOfCounter(G.data, o)))) : null);
    const meet = meetWith(G, id);
    const foot = footRow({ note: meet.why, secondary: btn(`To ${hn}`, 'quiet', { 'data-act': 'to-hirer', onclick: () => { G.ui.sheet = null; switchTo(G, hirer); } }),
        primary: meet.ok ? primary(`Give or take`, { 'data-act': 'handover-open', onclick: () => { G.ui.hand = null; G.ui.sheet = 'handover'; render(G); } }) : btn('Give or take', 'primary is-dim', { 'data-act': 'handover-open', 'aria-disabled': 'true', onclick: () => showToast(G, meet.why, true) }) });
    return modal(G, seatName(st, id), body, { close, eyebrow: roleOf(st, id) === 'Hired leader' ? `Hired by ${hn}` : `In the power of ${hn}`, detent: 'tall', bare: true, footer: foot });
}

// ---------------------------------------------------------------------------------------------------------------------------------- hirer and leader: give or take, in one step
const WINDOW = { story: 'You can give and take at the start of a phase, when you stand together.', detail: 'Characters trade at the start of a phase of someone’s turn, or after the evening’s fights (7.2.1, 4.5.5).' };
/** May the actor give to or take from his own leader (or hirer) now? `{ ok, other, why }`: the engine's own meetOptions says. */
export function meetWith(G, id = G.st.actor) {
    const st = G.st, c = st.chars[id], out = { ok: false, other: null, why: '' };
    if (!c) return out;
    const others = c.leader ? [c.leader.hirer] : seatIds(st).filter(s => st.chars[s].leader.hirer === id);
    let o = null; try { o = meetOptions(st, G.data, id); } catch { o = null; }
    const p = o?.partners?.find(x => others.includes(x.id));
    if (p) return { ok: true, other: p.id, why: '' };
    const near = others.find(x => st.chars[x] && !st.chars[x].dead && st.chars[x].at && st.chars[x].at === c.at && !c.onRoad);
    return { ok: false, other: near ?? others[0] ?? null, why: near ? (isStory() ? WINDOW.story : WINDOW.detail) : `${seatName(st, others[0] ?? id)} is not in his clearing.` };
}

/** Gold stepper and ticked lists for one direction of a gift. State in `G.ui.hand`: { dir: 'give' | 'take', items: [uid], gold, disc: [key] }. */
export function handoverSheet(G) {
    const st = G.st, actor = st.actor, m = meetWith(G, actor);
    const close = () => { G.ui.sheet = null; G.ui.hand = null; render(G); };
    if (!m.ok) { G.ui.sheet = null; return h('div'); }
    const hirer = st.chars[actor].leader ? st.chars[actor].leader.hirer : actor, leader = st.chars[actor].leader ? actor : m.other, other = actor === hirer ? leader : hirer;
    const d = (G.ui.hand ??= { dir: 'give', items: [], gold: 0, disc: [] });
    const from = d.dir === 'give' ? hirer : leader, to = d.dir === 'give' ? leader : hirer;
    const fromC = st.chars[from];
    let o = null; try { o = meetOptions(st, G.data, from); } catch { o = null; }
    const mine = o?.give ?? { items: [], gold: 0, discoveries: [] };
    d.items = d.items.filter(u => mine.items.some(i => i.uid === u)); d.gold = Math.min(d.gold, mine.gold);
    const tog = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); render(G); };
    const nameFrom = seatName(st, from), nameTo = seatName(st, to);
    const itemRows = mine.items.map(it => h('button', { type: 'button', class: `ds-row ho-row${d.items.includes(it.uid) ? ' sel' : ''}`, role: 'checkbox', 'aria-checked': d.items.includes(it.uid) ? 'true' : 'false', 'data-item': it.uid, onclick: () => tog(d.items, it.uid) },
        h('span', { class: 'ho-check', 'aria-hidden': 'true' }, d.items.includes(it.uid) ? icon('check') : null), h('span', { class: 'main' }, h('b', {}, it.name), it.sub ? h('span', {}, it.sub) : null)));
    const discRows = d.dir === 'take' ? mine.discoveries.map(x => { const k = `${x.kind}:${x.key ?? x.id}`; return h('button', { type: 'button', class: `ds-row ho-row${d.disc.includes(k) ? ' sel' : ''}`, role: 'checkbox', 'aria-checked': d.disc.includes(k) ? 'true' : 'false', 'data-disc': k, onclick: () => tog(d.disc, k) },
        h('span', { class: 'ho-check', 'aria-hidden': 'true' }, d.disc.includes(k) ? icon('check') : null), h('span', { class: 'main' }, h('b', {}, String(x.label).replace(/^the /, 'The ')), h('span', {}, 'Whoever learns it can use it from now on.'))); }) : [];
    const setGold = n => { d.gold = Math.max(0, Math.min(mine.gold, n)); render(G); };
    const step = (dn, t) => h('button', { type: 'button', class: 'step-btn mt-step', 'aria-label': `${dn > 0 ? 'More' : 'Less'} gold: ${dn > 0 ? '+' : '−'}${Math.abs(dn)}`, disabled: (dn < 0 && d.gold <= 0) || (dn > 0 && d.gold >= mine.gold) || null, onclick: () => setGold(d.gold + dn) }, t);
    const parts = [...d.items.map(u => mine.items.find(i => i.uid === u)?.name).filter(Boolean).map(n => `the ${n}`), ...(d.gold ? [`${d.gold} gold`] : []), ...mine.discoveries.filter(x => d.disc.includes(`${x.kind}:${x.key ?? x.id}`)).map(x => x.label)];
    const ok = parts.length > 0;
    const say = parts.length ? `${nameFrom} gives ${nameTo} ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}.` : 'Choose what changes hands.';
    const send = () => {
        const give = { items: d.items.slice(), gold: d.gold, discoveries: mine.discoveries.filter(x => d.disc.includes(`${x.kind}:${x.key ?? x.id}`)).map(x => (x.kind === 'path' ? { kind: 'path', key: x.key } : { kind: x.kind, id: x.id })) };
        actMany(G, [{ type: 'meet', kind: 'offer', who: from, to, give, want: { items: [], gold: 0 } }, { type: 'meet', kind: 'answer', who: to, accept: true }], { ok: () => { G.ui.sheet = null; G.ui.hand = null; showToast(G, `${nameFrom} gave ${nameTo} ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}.`); } });
    };
    const body = h('div', { class: 'ho', 'data-handover': '' },
        h('p', { class: 'ds-voice ho-intro' }, voiced({ story: `${seatName(st, hirer)} and ${seatName(st, leader)} stand together. A gift goes across at once, whole.`, detail: `An offer and its answer, sent together: a character trades with his own leader as with any character (7.2.1). The engine never answers an offer for the other (rulings L10).` })),
        h('div', { class: 'ds-seg ho-dir', role: 'radiogroup', 'aria-label': 'Which way' },
            h('button', { type: 'button', class: d.dir === 'give' ? 'on' : null, role: 'radio', 'aria-checked': d.dir === 'give' ? 'true' : 'false', 'data-dir': 'give', onclick: () => { d.dir = 'give'; d.items = []; d.gold = 0; d.disc = []; render(G); } }, `${seatName(st, hirer)} gives`),
            h('button', { type: 'button', class: d.dir === 'take' ? 'on' : null, role: 'radio', 'aria-checked': d.dir === 'take' ? 'true' : 'false', 'data-dir': 'take', onclick: () => { d.dir = 'take'; d.items = []; d.gold = 0; d.disc = []; render(G); } }, `${seatName(st, leader)} gives`)),
        sect(`${nameFrom} gives ${nameTo}`),
        h('div', { class: 'ds-list' }, ...(itemRows.length ? itemRows : [h('p', { class: 'ds-meta' }, `${nameFrom} has nothing to give.`)]),
            h('div', { class: `ds-row mt-gold${d.gold ? ' sel' : ''}`, 'data-gold': 'give' }, h('div', { class: 'main mt-gl' }, h('b', {}, 'Gold'), h('span', {}, `${nameFrom} has ${mine.gold}`)),
                h('div', { class: 'ds-stepper mt-stepper' }, step(-5, '−5'), step(-1, '−'), h('div', { class: 'v' }, h('span', { 'data-gold-n': 'give' }, String(d.gold))), step(1, '+'), step(5, '+5')))),
        ...(discRows.length ? [sect('What he has found'), h('div', { class: 'ds-list' }, ...discRows)] : []));
    return modal(G, 'Give or take', body, { close, eyebrow: `${nameFrom} → ${nameTo}`, detent: 'tall', bare: true,
        footer: footRow({ note: say, secondary: btn('Cancel', 'quiet', { 'data-act': 'handover-cancel', onclick: close }), primary: primary(ok ? `Give to ${nameTo}` : 'Choose first', { 'data-act': 'handover-go', disabled: !ok || null, onclick: send }) }) });
}

// ---------------------------------------------------------------------------------------------------------------------------------- sunrise: the Attention chits are drawn
/** Once a day, when the chits have been drawn and no turn has begun: the order the Attention chits came out in (7.1.1), with each seat's chit. A table shows it in place of the draw of the players' chits. */
export function maybeShowSunrise(G) {
    const st = G.st, p = st.pending, rec = st.dayRec;
    if (!leaderGame(st) || G.race || !rec || rec.day !== st.day || (rec.i ?? 0) !== 0 || st.period !== 'daylight' || (p && p.type !== 'phase')) return;
    if (G.ui.sunriseDay === st.day || (G.ui.sheet && G.ui.sheet !== 'sunrise')) return;
    G.ui.sunriseDay = st.day; G.ui.sheet = 'sunrise';
}
export function sunriseSheet(G) {
    const st = G.st, rec = st.dayRec, order = (rec?.order ?? []).filter(id => st.chars[id]), mine = id => st.chars[id]?.owner === st.chars[st.actor]?.owner;
    const close = () => { G.ui.sheet = null; render(G); };
    const label = id => (st.chars[id]?.leader || mine(id) ? seatName(st, id) : playerOf(st, id));
    const first = order[0], fn = first ? label(first) : null;
    const rows = order.map((id, i) => {
        const c = st.chars[id], att = attentionOf(st, G.data, id), who = c.leader ? `${roleOf(st, id)} \u00B7 ${att?.label ?? ''}` : mine(id) ? 'You' : `${playerOf(st, id)}\u2019s character`;
        return h('div', { class: `ds-row sr-row${i === 0 ? ' first' : ''}`, 'data-sunrise': id },
            h('span', { class: 'sr-n', 'aria-hidden': 'true' }, String(i + 1)), c.leader ? attnChit(att, 'lg') : h('i', { class: 'attn char lg', 'aria-hidden': 'true' }, (seatName(st, id)[0] ?? '?').toUpperCase()),
            h('span', { class: 'main' }, h('b', {}, seatName(st, id)), h('span', {}, who)));
    });
    const body = h('div', { class: 'sr' },
        h('p', { class: 'ds-voice sr-line' }, voiced({ story: fn ? `The chits are drawn. ${fn} is first.` : 'The chits are drawn.', detail: `The Attention chits are mixed and drawn (7.1.1). ${fn ? `${fn} plays first; ` : ''}each seat plays his whole turn when his chit comes up.` })),
        h('div', { class: 'ds-list' }, ...rows));
    return modal(G, 'Sunrise', body, { close, eyebrow: `Day ${st.day} \u00B7 the order of the day`, bare: true, footer: footRow({ primary: primary('Begin the day', { 'data-act': 'sunrise-ok', onclick: close }) }) });
}

// ---------------------------------------------------------------------------------------------------------------------------------- the fight nobody played
/** The morning report's account of fights a leader had where no character stood: who, where, and the lines the game wrote (the hirelings fought as the engine sent them). */
export function unattendedBlock(G, day) {
    const fights = unattendedFights(G.st, day);
    if (!fights.length) return [];
    return fights.map(f => {
        const place = f.place ? nb(f.place) : 'a clearing', fell = f.kills.length ? ` ${f.kills.length === 1 ? `The ${f.kills[0]} fell` : `${f.kills.length} fell: ${f.kills.join(', ')}`}.` : '';
        const rest = f.lines.slice(1).filter(l => l.k === 'combat').map(l => logText(l, G.st));          // (the dice of an unattended fight are noise: the lines say what came of them)
        return h('div', { class: 'ds-ask un-fight', 'data-unattended': f.id },
            h('b', {}, voiced({ story: `${f.name} fought at ${place}, and nobody was there to play it.${fell}`, detail: `Fight at ${place}: ${f.name} stood there without ${seatName(G.st, hirerOf(G.st, f.id))} (8.1.2b). His hirelings fought; nothing was bought, paid or played.${fell}` })),
            h('details', { class: 'un-lines' }, h('summary', {}, 'What happened'), ...(rest.length ? rest : ['Nothing was said.']).map(t => h('p', { class: 'j-combat' }, t))));
    });
}

// ---------------------------------------------------------------------------------------------------------------------------------- a seat on the map
export function showSeat(G, id) {
    if (G.ui.tag === id && id !== G.st.actor) { G.ui.tag = null; switchTo(G, id); return; }          // (a second tap on the named counter goes to that seat)
    G.ui.tag = G.ui.tag === id ? null : id;
    clearTimeout(G.ui.tagTimer); G.ui.tagTimer = setTimeout(() => { if (G.ui.tag) { G.ui.tag = null; if (G.root.isConnected) render(G); } }, 6000);
    const c = G.st.chars[id], at = c?.at ?? c?.onRoad?.from;
    if (at && G.ui.tag) G.map.focus(at);
    render(G);
}

// ---------------------------------------------------------------------------------------------------------------------------------- his turn's end
// The end-of-turn sheet of a seat, told of him and not of "you": hidden or in plain sight, what blocked him, what arrived. (The player's own character has the longer sheet in phases.js.)
export function seatTurnEndSheet(G) {
    const st = G.st, t = st.turnEnd, id = st.actor, name = seatName(st, id), mon = st.chars[id]?.leader?.kind === 'mon';
    const he = mon ? 'it' : 'he', him = mon ? 'it' : 'him', his = mon ? 'its' : 'his', place = nb(nameOfClearing(t.at));
    const uniq = list => [...new Set(list)], many = list => (list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
    const called = uniq(t.chits.flatMap(c => c.summons ?? [])), arrived = uniq([...(t.arrivals ?? []).map(a => a.name), ...called]), natives = (t.natives ?? []).map(n => `the ${n.group}`);
    const lost = t.blocked ? (st.plan ?? []).filter((s, i) => i >= (t.plan?.length ?? 0) && s && s.act !== 'nothing').length : 0;
    const title = t.noTurn ? `${name} has no turn today.` : t.hidden ? `${name} is hidden.` : `${name} is in plain sight.`;
    const why = {
        story: t.blocked ? `${t.blockers?.length ? `${many(uniq(t.blockers))} stops ${him}` : `${name}’s turn was cut short`}. The rest of ${his} day is lost.` : t.hidden ? `Nothing here can come for ${him} tonight unless ${he} strikes first.` : `Whatever shares ${his} clearing may come for ${him} tonight.`,
        detail: t.blocked ? `${t.blockers?.length ? `${many(uniq(t.blockers))} closed in` : `${name}’s turn was cut short`}, so ${he} is seen${lost ? ` and ${his} remaining ${lost === 1 ? 'phase is' : 'phases are'} lost` : ''}.` : t.hidden ? `Nothing can be set on ${him} this evening unless ${he} strikes first.` : `Whatever shares ${his} clearing fights ${his} hirelings this evening.`,
    };
    const lines = [];
    if (arrived.length) lines.push({ story: `${many(arrived)} ${arrived.length === 1 ? 'comes' : 'come'} to ${place}.`, detail: `${many(arrived)} ${arrived.length === 1 ? 'arrives' : 'arrive'} at the end of the turn.` });
    if (natives.length) lines.push({ story: `${many(natives)} appear.`, detail: `${many(natives)} appear at the dwelling.` });
    return modal(G, 'Turn’s end', h('div', { class: 'turnend clearing', 'data-seat-turn-end': id },
        h('div', { class: `te-status ds-ask ${t.hidden ? 'hidden' : 'seen'}` }, h('b', {}, title), h('span', {}, voiced(why))),
        ...lines.map(l => h('p', { class: 'ds-meta' }, voiced(l)))),
    { kind: 'result', bare: true, eyebrow: `Day ${st.day} · ${place}`, cls: 'turnend-sheet', footer: h('div', { class: 'dayres-foot' }, h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'turn-ok', onclick: () => act(G, { type: 'continue' }) }, 'End turn')) });
}
