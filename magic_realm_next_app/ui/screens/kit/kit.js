// screens/kit/kit.js (P2): the Kit sheet: one sheet with three rooms, Kit | Company | Spells (remembered), and the Kit room itself: the eight slots, the carry limit,
// the pack with worth in gold, the slot picker and the item card. It replaces the Active/Inactive switches of the old belongings list. The engine is untouched: choosing for a slot
// is the same `tidy` action the switches sent (toggleItem takes a rival out of the slot by itself), so every payload is byte-identical to the old one.
import { WEIGHT_WORDS, letterOf, lvl } from '../../../engine/core.js';
import { BOOTS } from '../../../engine/modifiers.js';
import { bootsStrongEnough, carriedLevel, carryCapacity, defOf, isOneUse, isWeaponCard, nameOf, onPackHorse, priceOf, slotsOf, weightOf } from '../../../engine/items.js';
import { isCave } from '../../../engine/world.js';
import { itemParts } from '../play/sheet_char.js';
import { act } from '../play/actions.js';
import { render } from '../play/shell.js';
import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { displayName } from '../../names.js';
import { ROAD_STORY, commitmentOf, roadLockOf, voiced } from '../../commit.js';
import { companyTab, hireCount } from './company.js';
import { carriedCount, chitsTab } from './chits.js';
import { dimBtn, footRow, goldEl, guards, itemArt, oneLine, plural, say, seg, signed, weightWord } from './common.js';
import { spellCount, spellsTab } from './spells.js';

// ---- the rooms ----
const TAB_KEY = 'mr-kit-tab';
const TABS = ['kit', 'co', 'sp', 'ch'];
export function kitTab(G) {
    if (!G.ui.kitTab) { let t = null; try { t = localStorage.getItem(TAB_KEY); } catch { /* ignore */ } G.ui.kitTab = TABS.includes(t) ? t : 'kit'; }
    if (G.ui.kitTab === 'ch' && !G.st.missions) G.ui.kitTab = 'kit';          // (the Chits room exists only in a game with mission, campaign and visitor chits)
    return G.ui.kitTab;
}
export function setKitTab(G, t) { G.ui.kitTab = t; G.ui.slotPick = null; try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ } render(G); }

// ---- the eight slots, as the printed sheet has them: one of each ----
export const SLOTS = [['weapon', 'Weapon', 'What will you wield?'], ['suit', 'Suit', 'What will you wear?'], ['helmet', 'Helmet', 'What goes on your head?'], ['shield', 'Shield', 'What will you hold?'],
    ['breastplate', 'Chest', 'What goes on your chest?'], ['mount', 'Mount', 'What will you ride?'], ['boots', 'Boots', 'What goes on your feet?'], ['gloves', 'Gloves', 'What goes on your hands?']];
const SLOT_KEYS = SLOTS.map(s => s[0]);

// The slot an item belongs in (the engine's slotsOf, plus the mount for a horse), or null for a treasure that has no slot and an armor card of its own.
export function slotKey(G, it) {
    if (it.kind === 'horse') return 'mount';
    if (it.id === 'golden-crown-1') return 'helmet';          // an armor card of its own in the rules, but worn on the head: it reads in the Helmet slot
    const s = slotsOf(G.data, it)[0];
    return SLOT_KEYS.includes(s) ? s : null;
}
// (a real helmet outranks the Crown, which may be worn with it and then stays listed in the pack)
const occupantOf = (G, key) => {
    const on = G.st.ch.items.filter(i => i.active && !i.destroyed && slotKey(G, i) === key);
    return on.find(i => i.id !== 'golden-crown-1') ?? on[0] ?? null;
};

// Rule 7.2.2f (ruling R6, ch7-day.md): belongings are rearranged at the start of each phase of the day's turn and in the evening after the fighting, never while the plan is recorded.
// An extra phase from a horse or a card must already be active in Birdsong (6.2.2c.1), so it is switched on the evening before (the Evening-end sheet, screens/kit/evening.js).
export const PLAN_LOCK = 'You can rearrange these at the start of each phase.';
export const PLAN_LOCK_DETAIL = 'Rule 7.2.2f: belongings are rearranged only at the start of a phase of your turn, or in the evening after the fighting (4.3.3a), never while you record the plan. A horse or card that gives an extra phase must be active already (6.2.2c.1).';

// Why gear cannot be changed now (null when it can): the engine allows `tidy` only between phases, and in the evening after the fighting. On the 'phase-gear' question (4.3.3b) he may
// change only what he has just come by (`pending.items`): pass the item to ask about it; without one the answer is for the Kit as a whole (open while something new waits).
export const FRESH_LOCK = 'Only what you have just come by can be changed now. The rest waits for the start of your next phase.';
export function gearLock(G, it = null) {
    const p = G.st.pending?.type;
    if (G.st.combat || p?.startsWith('combat') || (G.shared && G.st.battle?.members?.[G.st.ch.id])) return 'In a fight, changing your gear is your Encounter action, once.';
    if (G.st.ch.morph) return 'Your gear is of no use to a creature.';
    if (G.st.ch.flying) return 'You cannot rearrange your gear in the air.';
    if (roadLockOf(G.st)) return ROAD_STORY;          // 8.3.8d: out on a road between clearings (the engine's gearLockedWhy); ROAD_STORY is the Story words, lockText gives the Detail
    if (p === 'plan') return PLAN_LOCK;
    if (p === 'phase-gear') return it && !(G.st.pending.items ?? []).includes(it.uid) ? FRESH_LOCK : null;
    if (!['phase', 'phase-pick', 'evening-end'].includes(p)) return 'Gear can be changed between phases.';
    return null;
}
// Is `uid` one of the things he may change right now on the 'phase-gear' question? (true when that question is not asked)
const freshOk = (G, uid) => G.st.pending?.type !== 'phase-gear' || (G.st.pending.items ?? []).includes(uid);
// The lock of one slot: its occupant's, or for an empty slot (on 'phase-gear') whether something he has just come by could go there.
function slotLock(G, key, occupant) {
    if (occupant) return gearLock(G, occupant);
    const base = gearLock(G);
    if (base || G.st.pending?.type !== 'phase-gear') return base;
    return G.st.ch.items.some(i => !i.destroyed && slotKey(G, i) === key && freshOk(G, i.uid)) ? null : FRESH_LOCK;
}

// The words of a lock line: the plan's one has a Story and a Detail voice; the others are plain.
export const lockText = (lock, G = null) => (lock === PLAN_LOCK ? h('span', {}, h('span', { 'data-v': 'story' }, PLAN_LOCK), h('span', { 'data-v': 'detail' }, PLAN_LOCK_DETAIL))
    : lock === ROAD_STORY && G && roadLockOf(G.st) ? voiced(roadLockOf(G.st)) : lock);

// Why an item cannot be put to use now (the engine's own refusals from toggleItem, said before the press), or null.
export function whyNot(G, it) {
    const { st, data } = G;
    if (it.destroyed) return 'It is destroyed.';
    if (it.active) return null;
    if (it.kind === 'horse') {
        const at = st.combat?.at ?? st.ch.at;
        if (at && isCave(st, data, at)) return 'A horse cannot be ridden in a cave.';
        if (lvl(data.horses[it.id].walk.strength) < Math.max(lvl(st.ch.weight), carriedLevel(st, data, it.uid))) return 'The horse is not strong enough to carry you and your gear.';
    }
    if (BOOTS[it.id] && !bootsStrongEnough(st, data, it)) return 'Those boots are not strong enough to carry you and your gear.';
    return null;
}

// Put an item to use, or put it away: the one action the old switch sent.
export function tidyAct(G, it, extra = {}) { G.ui.keep = true; act(G, { type: 'tidy', item: it.uid, ...extra }); }

// ---- the carry limit ----
// the names of what he would put down if he moved now (the engine's dropHeavy, said before the move): too heavy for what he can carry and no pack horse bears it
export function wouldDrop(G) {
    const { st, data } = G, top = Math.max(carryCapacity(st, data), 0);
    return st.ch.items.filter(it => !it.destroyed && it.kind !== 'horse' && !onPackHorse(st, data, it) && lvl(weightOf(data, it)) > top && lvl(weightOf(data, it)) > 0).map(it => nameOf(data, it));
}
function carryLimit(G) {
    const { st, data } = G, cap = carryCapacity(st, data), carried = carriedLevel(st, data), top = Math.max(cap, 0);
    const word = cap <= 0 ? 'almost nothing' : WEIGHT_WORDS[letterOf(cap)];
    let src = '';
    if (st.ch.morph) src = `as the ${st.ch.morph.creature?.name ?? 'creature'}`;
    else {
        const horse = st.ch.items.find(i => i.kind === 'horse' && i.active && !i.destroyed);
        const move = st.ch.chits.filter(c => c.state === 'active' && c.type === 'move').sort((a, b) => lvl(b.strength) - lvl(a.strength))[0];
        if (horse && data.horses[horse.id] && lvl(data.horses[horse.id].walk.strength) >= (move ? lvl(move.strength) : -1)) src = `your ${nameOf(data, horse)}, ${WEIGHT_WORDS[data.horses[horse.id].walk.strength].toLowerCase()} strength`;
        else if (move) src = `strongest Move chit ${move.strength}${move.time}`;
        else src = 'no Move chit is ready';
    }
    // what he would put down if he moved now (dropHeavy): too heavy for what he can carry and no pack horse bears it
    const drop = wouldDrop(G);
    const labels = ['None', 'Light', 'Med', 'Heavy', 'Tremend.'];
    return h('div', { class: 'ds-load', 'data-carry': String(cap) },
        h('div', { class: 'top' }, h('b', {}, `You can carry ${word}`), h('span', { class: 'ds-meta' }, src)),
        h('div', { class: 'ds-meter', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4].map(i => h('i', { class: i <= cap ? 'on' : i <= carried ? 'over' : null }))),
        h('div', { class: 'ds-meter-l', 'aria-hidden': 'true' }, labels.map(l => h('span', {}, l))),
        drop.length ? h('div', { class: 'ds-why bad kit-warn' }, `Too heavy for you now: ${drop.join(', ')} would be put down when you next move.`) : null);
}

// ---- one slot ----
function slotEl(G, [key, label], lock, o) {
    const it = occupantOf(G, key), name = it ? nameOf(G.data, it) : 'None';
    const open = () => {
        if (it && lock) { o.openItem(it); return; }
        if (lock) { say(G, lock); return; }
        G.ui.slotPick = key; G.ui.sheet = 'slot'; render(G);
    };
    return h('button', { type: 'button', class: `ds-slot${it ? '' : ' empty'}${lock ? ' dim' : ''}`, 'data-slot': key, 'aria-label': `${label}: ${it ? name : 'nothing'}${lock ? ' (locked)' : ''}`, onclick: open },
        h('span', { class: 'k' }, label), lock ? icon('lock', 'lock') : null,
        h('span', { class: 'ds-counter' }, it ? itemArt(G, it) : icon('plus', 'lg')), h('span', { class: 'n' }, name));
}

// ---- a pack row ----
function packRow(G, it, o) {
    const name = nameOf(G.data, it), worth = priceOf(G.data, it);
    const key = slotKey(G, it), packHorse = it.kind === 'horse' && !it.active && !it.destroyed;
    const tags = [it.destroyed ? ['bad', 'destroyed'] : it.damaged ? ['bad', 'damaged'] : null, packHorse ? [null, 'pack horse'] : null, it.active && !key && it.kind !== 'horse' ? ['gold', 'in use'] : null].filter(Boolean);
    return h('button', { type: 'button', class: `ds-row kit-prow${it.destroyed ? ' dim' : ''}`, 'data-item': it.uid, 'aria-label': `About the ${name}`, onclick: () => o.openItem(it) },
        h('span', { class: 'art' }, itemArt(G, it)),
        h('span', { class: 'main' }, h('b', {}, name, ...tags.map(([c, t]) => h('span', { class: `ds-tag ${c ?? ''} kit-tag` }, t))), h('span', {}, oneLine(G, it, { packHorse }))),
        h('span', { class: 'end' }, worth ? goldEl(G, worth) : null, h('small', {}, weightWord(G, it))));
}

const KIND_ORDER = { weapon: 0, armor: 1, horse: 2, treasure: 3 };

// Everything he carries is worth this much (information only: it never changes the score), and what owning it adds to Fame and Notoriety.
function worthLine(G) {
    const items = G.st.ch.items.filter(i => !i.destroyed);
    const worth = items.reduce((n, i) => n + priceOf(G.data, i), 0);
    const fm = items.reduce((n, i) => n + (defOf(G.data, i)?.fame ?? 0), 0), nt = items.reduce((n, i) => n + (defOf(G.data, i)?.notoriety ?? 0), 0);
    const adds = [fm ? `Fame ${signed(fm)}` : '', nt ? `Notoriety ${signed(nt)}` : ''].filter(Boolean);
    return h('p', { class: 'ds-meta kit-worth', 'data-worth': String(worth) }, 'Everything you carry is worth ', h('b', { class: 'ds-c-gold' }, goldEl(G, worth, { unit: ' Gold' })), '. Information only.',
        adds.length ? ` Owning it adds ${adds.join(' and ')} to your totals.` : '');
}

// Your twelve chits as they stand today (tired ones are dim, wounded ones dashed): the one place the day shows them.
function chitsEl(G) {
    const label = c => (c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`), word = c => (c.type === 'move' ? 'MOVE' : c.type === 'fight' ? 'FIGHT' : c.type === 'duck' ? 'DUCK' : c.type === 'berserk' ? 'BERSERK' : 'MAGIC');
    const state = c => (c.state === 'fatigued' ? 'tired' : c.state === 'wounded' ? 'wounded' : '');
    return h('div', { class: 'kit-chits', 'data-chits': '' }, G.st.ch.chits.map(c => h('span', { class: `ds-chit ${c.type} ${state(c)}`, 'data-chit': c.id, 'aria-label': `${word(c).toLowerCase()} chit ${label(c)}${c.effort ? `, effort ${c.effort}` : ''}${state(c) ? `, ${state(c)}` : ''}` },
        h('span', {}, label(c), c.effort ? h('sup', {}, '*'.repeat(c.effort)) : null), h('small', {}, word(c)))));
}

function kitRoom(G, o) {
    const lock = gearLock(G), items = G.st.ch.items;
    const inSlot = new Set(SLOTS.map(([k]) => occupantOf(G, k)).filter(Boolean));
    const pack = items.filter(i => !inSlot.has(i)).sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || priceOf(G.data, b) - priceOf(G.data, a));
    return h('div', { class: 'kit-room' },
        carryLimit(G),
        sect2('In use', 'one of each'),
        h('div', { class: 'ds-slots' }, SLOTS.map(s => slotEl(G, s, slotLock(G, s[0], occupantOf(G, s[0])), o))),
        lock || G.st.pending?.type === 'phase-gear' ? h('div', { class: 'ds-why kit-lock', 'data-lock': '' }, icon('lock', 'kit-lockico'), lockText(lock ?? FRESH_LOCK, G)) : null,
        sect2('In your pack', pack.length ? plural(pack.length, 'thing') : ''),
        pack.length ? h('div', { class: 'ds-list' }, pack.map(i => packRow(G, i, o))) : h('p', { class: 'kit-none' }, 'Nothing else. Your pack is empty.'),
        items.length ? worthLine(G) : null,
        sect2('Your chits', 'tired ones are dim'),
        chitsEl(G),
        cardRow(G));
}

// The printed character card, one tap away (the sheet no longer opens with a portrait).
function cardRow(G) {
    const ch = G.st.ch, pic = G.data.art?.characters?.[ch.id];
    if (!G.data.art?.cards?.[ch.id]) return null;
    return h('div', { class: 'ds-list kit-card' }, h('button', { type: 'button', class: 'ds-row', 'data-act': 'card', onclick: () => { G.ui.sheet = 'card'; render(G); } },
        h('span', { class: 'art' }, pic ? h('img', { src: pic, alt: '' }) : null), h('span', { class: 'main' }, h('b', {}, 'Your character card'), h('span', {}, `${displayName(ch.name)}, as printed.`)), h('span', { class: 'end' }, icon('right'))));
}
const sect2 = (t, r) => h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, t), r ? h('small', {}, r) : null);

// ---- the sheet ----
// kitContent(G, { openItem(it), onTab(key), tab }) -> { title, eyebrow, body, detent }
export function kitContent(G, o = {}) {
    const tab = o.tab ?? kitTab(G), pick = o.onTab ?? (t => setKitTab(G, t)), ch = G.st.ch;
    const ctl = { openItem: o.openItem ?? (it => { G.ui.itemUid = it.uid; G.ui.itemFrom = null; G.ui.sheet = 'item'; render(G); }) };
    const room = tab === 'co' ? companyTab(G) : tab === 'sp' ? spellsTab(G, o) : tab === 'ch' && G.st.missions ? chitsTab(G) : kitRoom(G, ctl);
    return { title: displayName(ch.name), eyebrow: `Day ${G.st.day} · ${tab === 'co' ? 'Company' : tab === 'sp' ? 'Spells' : tab === 'ch' ? 'Chits' : 'Kit'}`, detent: 'tall',
        body: h('div', { class: 'kit' },
            seg([{ key: 'kit', label: 'Kit' }, { key: 'co', label: 'Company', n: hireCount(G) }, { key: 'sp', label: 'Spells', n: spellCount(G) }, ...(G.st.missions ? [{ key: 'ch', label: 'Chits', n: carriedCount(G) }] : [])], tab, pick, 'data-kit-tab'),
            room) };
}

// ---- the slot picker: a small decision sheet listing only what fits ----
export function slotPickerContent(G, key) {
    const def = SLOTS.find(s => s[0] === key), here = occupantOf(G, key);
    const cands = G.st.ch.items.filter(i => slotKey(G, i) === key && i !== here && !i.destroyed && freshOk(G, i.uid));
    const choose = it => { G.ui.slotPick = null; G.ui.sheet = 'char'; tidyAct(G, it); };
    const rowFor = it => {
        const why = whyNot(G, it), worth = priceOf(G.data, it);
        return h('button', { type: 'button', class: `ds-row${why ? ' dim' : ''}`, 'data-pick': it.uid, onclick: () => (why ? say(G, why) : choose(it)) },
            h('span', { class: 'art' }, itemArt(G, it)),
            h('span', { class: 'main' }, h('b', {}, nameOf(G.data, it), it.damaged ? h('span', { class: 'ds-tag bad kit-tag' }, 'damaged') : null), h('span', {}, why ?? oneLine(G, it))),
            h('span', { class: 'end' }, worth ? goldEl(G, worth) : null, h('small', {}, weightWord(G, it))));
    };
    const body = h('div', { class: 'kit' },
        here ? h('div', { class: 'ds-list kit-now' }, h('button', { type: 'button', class: 'ds-row sel', 'data-now': here.uid, onclick: () => { G.ui.slotPick = null; G.ui.itemUid = here.uid; G.ui.itemFrom = null; G.ui.sheet = 'item'; render(G); } },
            h('span', { class: 'art' }, itemArt(G, here)), h('span', { class: 'main' }, h('b', {}, nameOf(G.data, here)), h('span', {}, 'In this slot now. Tap to look closer.')), h('span', { class: 'end' }, icon('check')))) : null,
        cands.length ? h('div', { class: 'ds-list' }, cands.map(rowFor)) : h('p', { class: 'kit-none' }, here ? 'Nothing else you carry goes here.' : `Nothing you carry goes in the ${def[1].toLowerCase()} slot yet.`),
        here && !gearLock(G, here) ? h('div', { class: 'ds-list kit-off' }, h('button', { type: 'button', class: 'ds-row', 'data-empty': 'empty', onclick: () => { G.ui.slotPick = null; G.ui.sheet = 'char'; tidyAct(G, here); } },
            h('span', { class: 'art' }, icon('minus', 'lg')), h('span', { class: 'main' }, h('b', {}, 'Leave it empty'), h('span', {}, 'Carry less.')))) : null);
    return { title: def[2], eyebrow: `${def[1]} slot`, body, decision: true, detent: 'hug' };
}

// ---- the item card ----
const VERB = { weapon: ['Wield it', 'Put it away'], horse: ['Ride it', 'Dismount'], boots: ['Put them on', 'Take them off'], gloves: ['Put them on', 'Take them off'], shield: ['Hold it', 'Put it away'], armor: ['Wear it', 'Take it off'], oneuse: ['Use it', 'Put it away'], treasure: ['Bring it out', 'Put it away'] };
function verbOf(G, it) {
    const key = slotKey(G, it);
    const k = it.kind === 'weapon' ? 'weapon' : it.kind === 'horse' ? 'horse' : key === 'boots' ? 'boots' : key === 'gloves' ? 'gloves' : key === 'shield' ? 'shield' : it.kind === 'armor' ? 'armor' : isOneUse(G.data, it) ? 'oneuse' : 'treasure';
    return VERB[k][it.active ? 1 : 0];
}

// One story line: what it is, in the words the card uses; the rules stay under Detail.
function storyLine(G, it) {
    const d = defOf(G.data, it);
    if (!d) return '';
    if (it.kind === 'weapon') {
        const u = d.unalerted, a = d.alerted, t = x => (x.attackTime == null ? 'the speed of your Fight chit' : `attack time ${x.attackTime}`);
        return `Not alerted: harm ${u.harm}${'*'.repeat(u.stars ?? 0)}, ${t(u)}. Alerted: harm ${a.harm}${'*'.repeat(a.stars ?? 0)}, ${t(a)}.`;
    }
    if (it.kind === 'armor') return d.card ? oneLine(G, it) : `${guards(d)} Whole it is worth ${d.priceIntact ?? '?'} gold, damaged ${d.priceDamaged ?? '?'}.`;
    if (it.kind === 'horse') return `Walks ${d.walk.strength}${d.walk.moves}, gallops ${d.gallop.strength}${d.gallop.moves}. In a fight it is played like a Move chit.`;
    return oneLine(G, it);
}

function factsOf(G, it) {
    const d = defOf(G.data, it), worth = priceOf(G.data, it), out = [['Weight', weightWord(G, it) || '–']];
    out.push(['Worth', worth ? goldEl(G, worth, { unit: ' Gold' }) : '–']);
    if (it.kind === 'weapon') out.push(['Length', String(d.length)]);
    else if (it.kind === 'armor' && d.toughness) out.push(['Toughness', String(d.toughness)]);
    else if (it.kind === 'horse') out.push(['Vulnerability', String(d.vulnerability)]);
    const td = it.kind === 'treasure' ? (G.data.treasures[it.card ?? it.id] ?? d) : d;
    if (td?.fame) out.push(['Fame', signed(td.fame)]);
    if (td?.notoriety) out.push(['Notoriety', signed(td.notoriety)]);
    return h('dl', { class: 'kit-facts' }, out.slice(0, 4).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))));
}

// itemContent(G, it, { back }) -> { title, body, foot }
export function itemContent(G, it, o = {}) {
    const { name, card, faces, facts } = itemParts(G, it, { size: 128 }), lock = gearLock(G, it), key = slotKey(G, it);
    const stateTag = it.destroyed ? ['bad', 'Destroyed'] : [it.active ? 'gold' : '', it.active ? 'Active' : 'Inactive'];
    const sub = [it.kind === 'weapon' ? (isWeaponCard(G.data, it) ? 'weapon card' : it.alerted ? 'alerted' : 'not alerted') : null, it.kind === 'armor' ? (it.damaged ? 'damaged' : 'whole') : null].filter(Boolean).join(', ');
    const why = lock ?? whyNot(G, it);
    const leaving = G.ui.leaveAsk === it.uid;
    const can = !lock && !it.destroyed, bound = can ? commitmentOf(G.st, G.data, it) : null;          // 6.2.4d: the horse or card of a recorded extra phase is not his to leave behind yet
    const body = h('div', { class: 'kit kit-item itemsheet' },
        card ?? h('div', { class: 'kit-faces' }, ...faces),
        h('div', { class: 'kit-state' }, h('span', { class: `ds-tag ${stateTag[0]}`, 'data-state': it.active ? 'active' : 'inactive' }, stateTag[1]), sub ? h('span', { class: 'ds-meta' }, sub) : null, key ? h('span', { class: 'ds-meta' }, `${SLOTS.find(s => s[0] === key)[1]} slot`) : null),
        bound ? h('div', { class: 'ds-why kit-lock kit-committed', 'data-committed': it.uid }, icon('lock', 'kit-lockico'), voiced(bound)) : null,
        card ? null : factsOf(G, it),                  // the cream card already says weight, price and Notoriety
        h('p', { class: 'ds-voice kit-story' }, storyLine(G, it)),
        h('details', { class: 'kit-detail' }, h('summary', {}, 'Detail'), ...facts.map(t => h('p', {}, t))),
        lock && !it.destroyed ? h('div', { class: 'ds-why kit-lock' }, icon('lock', 'kit-lockico'), lockText(lock, G)) : null,
        can && !bound ? (leaving ? h('div', { class: 'kit-leave' }, h('span', { class: 'ds-meta' }, `Leave the ${name} lying here?`),
            h('button', { type: 'button', class: 'ds-btn sm danger', 'data-act': 'item-leave', onclick: () => { G.ui.leaveAsk = null; G.ui.sheet = G.ui.itemFrom === 'dock' ? null : 'char'; G.ui.itemFrom = null; tidyAct(G, it, { drop: true }); } }, `Leave the ${name} here`),
            h('button', { type: 'button', class: 'ds-btn sm quiet', onclick: () => { G.ui.leaveAsk = null; render(G); } }, 'Keep it'))
            : h('button', { type: 'button', class: 'ds-btn sm quiet kit-leavebtn', 'data-act': 'item-leave-ask', onclick: () => { G.ui.leaveAsk = it.uid; render(G); } }, 'Leave it here')) : null);
    let foot = null;
    if (can) {
        const verb = verbOf(G, it);
        foot = footRow({ primary: why ? dimBtn(G, verb, why, { 'data-act': 'item-use' }, 'primary') : h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'item-use', onclick: () => tidyAct(G, it) }, verb) });
    }
    return { title: name, body, foot };
}

