import { h } from '../dom.js';
import { icon, art } from '../icons.js';
import { sheet, sect } from '../ds.js';
import { castable } from '../../engine/spells.js';
import { loadData } from '../../engine/data.js';
import { newGame as startState } from '../../engine/setup.js';
import { nameOfClearing } from '../../engine/world.js';
import { createRace, joinRace, peekRace, serverUrl } from '../online.js';
import { createShared, joinShared, chooseShared } from '../shared_online.js';
import { bar, cardSrc, foot, nb, openSheet, portraitSrc, seatBadge, sum, switchRow } from '../front.js';
import { spellLine, COLOR_ORDER, COLOR_FILE, COLOR_DOT } from '../start_spells.js';
import { realmThumb } from './realm.js';
import { SECTIONS_GROUP } from '../combat/sections_opts.js';
import { HIRELING_GROUP } from '../leaders.js';
import { openPlacement, placementStatus } from './placement.js';

// New game: a four-step wizard, one question each (mockup 05): how long, the realm and its rules, who, where and what for.
// Everything here is a *choice about the rules*, so the facts come from docs/rules/01 and 06 (see the notes beside each option). The engine inputs are unchanged.

export const STEPS = [
    { id: 'type', label: 'Length' },
    { id: 'realm', label: 'Realm and rules' },
    { id: 'chars', label: 'Who' },
    { id: 'goals', label: 'Where and goals' },
];

// How long / how it ends. A month is 4 weeks = 28 days; victory points to spend = weeks + 1 (3rd ed. 10.E.2).
export const LENGTHS = [
    { id: 'month', title: 'A month', line: 'The standard game: four weeks.', badge: () => '28 days · 5 VP' },
    { id: 'custom', title: 'Choose the length', line: 'Any whole number of weeks.', badge: (g, on) => (on ? `${g.weeks * 7} days · ${g.weeks + 1} VP` : 'any weeks') },
    { id: 'sudden', title: 'Sudden death', line: 'Ends at the first midnight someone has met every goal.', badge: g => `${g.suddenVp} VP` },
    { id: 'endless', title: 'Endless', line: 'No end and no scoring. Play until you stop.', badge: () => 'no limit' },
];

// (The old "How much of the game?" switch is gone: it reached neither the engine nor the saved game, so it changed nothing. Verified: no `depth` is read by start(), by the online
// choices, by game boot or by the engine.)
// The party: one member per character you play, each with his own start place, spells and goals (Mike, 2026-10-27: goals are per character, not shared).
// A member is { id, start, spells (null until the spell list has loaded and the default is chosen), vp }.
const charOf = id => CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
const zeroVp = () => ({ great: 0, spells: 0, fame: 0, notoriety: 0, gold: 0 });
export const newMember = id => ({ id, start: charOf(id).starts[0], together: false, spells: null, vp: zeroVp() });
// "Start together" (a member after the first): his start place is the first member's, kept in step while it is on, so they begin in one clearing and can follow each other (7.11.3). It cannot be on
// where the first member's place is not on his card; then it goes off by itself and he keeps the place he has.
export const canTogether = (g, m) => { const f = g.party[0]; return !!f && f !== m && charOf(m.id).starts.includes(f.start); };
export function syncTogether(g) {
    g.party.forEach((m, i) => { if (i === 0) m.together = false; else if (m.together) { if (canTogether(g, m)) m.start = g.party[0].start; else m.together = false; } });
}
// who starts where: [[names of those at the first place], [names at the next]...] (one dwelling is one clearing)
export const startGroups = g => { const by = new Map(); for (const m of g.party) by.set(m.start, [...(by.get(m.start) ?? []), charOf(m.id).name]); return [...by.entries()].map(([place, names]) => ({ place, names })); };
const nameList = l => (l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} and ${l.at(-1)}`);
// the hint on the roster when the party does not begin in one clearing
export function apartHint(g) {
    const grp = startGroups(g);
    if (g.party.length < 2 || grp.length < 2) return null;
    const names = grp.map(x => nameList(x.names));
    const story = grp.length === 2 ? `${names[0]} start${grp[0].names.length === 1 ? 's' : ''} apart from ${names[1]}: Follow needs the same clearing.` : `${nameList(g.party.map(m => charOf(m.id).name))} start in ${grp.length} different places: Follow needs the same clearing.`;
    const detail = `Start places differ (${grp.map(x => `${x.place}: ${nameList(x.names)}`).join('; ')}). Follow needs the guide in the follower\u2019s clearing at Birdsong (7.11.3).`;
    return { story, detail };
}
export const MAX_PARTY = 4;
export const defaultGame = () => ({ step: 0, length: 'month', weeks: 4, suddenVp: 5, party: [newMember('white-knight')], open: null, goalOpen: null, view: 'party', seed: Math.floor(Math.random() * 9999) + 1, missions: { on: false, place: [] }, options: { knightsAdjustment: false, watchfulNatives: false, quietMonsters: false, castAnytime: true } });


export const vpTotal = g => g.length === 'month' ? 5 : g.length === 'custom' ? g.weeks + 1 : g.length === 'sudden' ? g.suddenVp : 5;

export function summary(g) {
    const len = g.length === 'month' ? '28 days' : g.length === 'custom' ? `${g.weeks} week${g.weeks === 1 ? '' : 's'}` : g.length === 'sudden' ? 'Sudden death' : 'Endless';
    const vp = g.length === 'month' ? '5 VP' : g.length === 'custom' ? `${g.weeks + 1} VP` : g.length === 'sudden' ? `${g.suddenVp} VP` : 'no scoring';
    return `${len} · ${vp}`;
}

const q = text => h('p', { class: 'ds-voice lg ds-q' }, nb(text));
const why = text => h('p', { class: 'ds-why ds-qwhy' }, nb(text));

const stepper = (value, unit, min, max, set, { big = false } = {}) => h('div', { class: `ds-stepper${big ? ' ds-stepper-goal' : ''}` },
    h('button', { type: 'button', 'aria-label': 'Fewer', disabled: value <= min, onclick: e => { e.stopPropagation(); set(value - 1); } }, icon('minus')),
    h('span', { class: 'v' }, String(value), unit ? h('small', {}, unit(value)) : null),
    h('button', { type: 'button', 'aria-label': 'More', disabled: value >= max, onclick: e => { e.stopPropagation(); set(value + 1); } }, icon('plus')));

function lengthCard(g, opt, redraw) {
    const on = g.length === opt.id;
    return [h('button', { type: 'button', class: `ds-choice${on ? ' on' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-length': opt.id, onclick: () => { g.length = opt.id; redraw(); } },
        h('span', { class: 'dot' }),
        h('span', { class: 'main' }, h('b', {}, opt.title, h('em', {}, opt.badge(g, on))), h('span', { class: 'l' }, nb(opt.line)))),
    on && opt.id === 'custom' ? h('div', { class: 'ds-choice-extra' }, stepper(g.weeks, w => (w === 1 ? 'week' : 'weeks'), 1, 12, v => { g.weeks = v; redraw(); }), why(`${g.weeks + 1} victory points to spend: one for each week, plus one.`)) : null,
    on && opt.id === 'sudden' ? h('div', { class: 'ds-choice-extra' }, stepper(g.suddenVp, () => 'victory points', 1, 12, v => { g.suddenVp = v; redraw(); }), why('The points you spread over Great Treasures, Spells, Fame, Notoriety and Gold.')) : null];
}

function typeStep(g, redraw) {
    return [q('How long is the game?'), h('div', { class: 'ds-choices', role: 'radiogroup', 'aria-label': 'Game length' }, LENGTHS.flatMap(o => lengthCard(g, o, redraw)))];
}

const VP_ROWS = [
    { k: 'great', label: 'Great treasures', unit: 1, what: 'treasures', cls: '' },
    { k: 'spells', label: 'Spells', unit: 2, what: 'spells', cls: '' },
    { k: 'fame', label: 'Fame', unit: 10, what: 'Fame', cls: 'fame' },
    { k: 'notoriety', label: 'Notoriety', unit: 20, what: 'Notoriety', cls: 'notor' },
    { k: 'gold', label: 'Gold', unit: 30, what: 'gold above your starting worth', cls: 'gold' },
];
const GOAL_ORDER = ['fame', 'notoriety', 'gold', 'spells', 'great'];                 // the order of the mockup: the three scores first

// The characters this build can play. Where each may begin is on his card (rules 3.3.5): the Black Knight has the Inn only, the White Knight the Inn or the Chapel. Gear is always the
// stage-4 weapon and armor, taken from the natives' stock (3.3.2).
// `rel`: how each native group takes to him (2 ally, 1 friendly, -1 wary, -2 enemy), as on the character card; `perks`: what sets him apart, in a few words; `strongest`: his strongest Move chit.
export const CHARACTERS = [
    { id: 'black-knight', name: 'Black Knight', weight: 'Heavy', strongest: 'Heavy', starts: ['Inn'], gear: 'Mace, Suit of Armor and Shield',
      rel: { Company: 2, Soldiers: 1, Crone: 1, Lancers: -1, Guard: -2 },
      perks: [['Fear', 'One Meeting die, not two'], ['Aim', 'Missiles roll one lower']] },
    { id: 'white-knight', name: 'White Knight', weight: 'Heavy', strongest: 'Tremendous', starts: ['Inn', 'Chapel'], gear: 'Great Sword and Suit of Armor', spells: { n: 1, types: ['I'] },
      rel: { Order: 2, Lancers: 1, Bashkars: -1, Crone: -1, Company: -2 },
      perks: [['Health', 'A second Rest every day'], ['Honor', 'Meeting dice one lower']] },
    { id: 'wizard', name: 'Wizard', weight: 'Medium', strongest: 'Medium', starts: ['Inn', 'House', 'Guard house'], gear: 'Staff', spells: { n: 2, types: ['II', 'III', 'IV'] },
      rel: { Woodfolk: 1, Patrol: 1, Soldiers: 1, Guard: 1, Company: -1, Bashkars: -1, Warlock: -1, Lancers: -2 },
      perks: [['Lore', 'One die when Reading Runes'], ['Experience', 'Knows every hidden path and secret passage']] },
    { id: 'sorceror', name: 'Sorcerer', weight: 'Medium', strongest: 'Medium', starts: ['Inn'], gear: null, spells: { n: 3, types: ['IV', 'VI'] },
      rel: { Lancers: 2, Company: 1, Bashkars: 1, Order: -1, Soldiers: -1, Warlock: -1, Guard: -2 },
      perks: [['Lore', 'One die when Reading Runes'], ['Aura', 'An extra Enchant phase every day'], ['Chits', 'Nine Magic chits, three to move and fight']] },
    { id: 'woods-girl', name: 'Woods Girl', weight: 'Light', strongest: 'Light', starts: ['Inn', 'House'], gear: 'Light Bow', her: true, spells: { n: 1, types: ['VII'] },
      rel: { Woodfolk: 2, Lancers: 1, Soldiers: -1, Warlock: -1, Bashkars: -2 },
      perks: [['Tracking', 'One die on Hide, Search and Meeting in the Woods'], ['Archer', 'One die on the Missile Table with a bow']] },
    // The rest of the roster, drawn from data/characters.json (the printed cards): every character the engine plays is offered (the owner's call, 2026-10-18).
    { id: 'captain', name: 'Captain', weight: 'Medium', strongest: 'Medium', starts: ['Inn', 'House', 'Guard house'], gear: 'Short Sword, Helmet, Breastplate and Shield',
      rel: {Patrol: 1, Soldiers: 1, Guard: 1, Scholar: 1, Woodfolk: -1, Bashkars: -2},
      perks: [['Aim','Subtract one from every Missile Table roll.'], ['Reputation','One extra phase per day, only when starting it at a dwelling.']] },
    { id: 'amazon', name: 'Amazon', weight: 'Medium', strongest: 'Medium', starts: ['Inn'], gear: 'Short Sword, Helmet, Breastplate and Shield', her: true,
      rel: {Lancers: 1, Patrol: 1, Shaman: 1, Company: -1, Bashkars: -1},
      perks: [['Aim','Subtract one from every Missile Table roll.'], ['Stamina','One extra Move phase each day, even when riding.']] },
    { id: 'berserker', name: 'Berserker', weight: 'Heavy', strongest: 'Tremendous', starts: ['Inn'], gear: 'Great Axe and Helmet',
      rel: {Rogues: 1, Lancers: 1, Shaman: 1, Patrol: -1, Guard: -1},
      perks: [['Robust','One extra Rest phase each day.'], ['Berserk','Playing the Berserk chit raises vulnerability to Tremendous for the day.']] },
    { id: 'swordsman', name: 'Swordsman', weight: 'Light', strongest: 'Medium', starts: ['Inn'], gear: 'Thrusting Sword',
      rel: {Rogues: 1, Company: 1, Warlock: 1, Patrol: -2},
      perks: [['Barter','Roll one die on the Meeting Table, during Trade only.'], ['Clever','Chooses when to take his single Daylight turn.']] },
    { id: 'dwarf', name: 'Dwarf', weight: 'Heavy', strongest: 'Tremendous', starts: ['Inn', 'Guard house'], gear: 'Great Axe and Helmet',
      rel: {Company: 1, Guard: 1, Scholar: 1, Woodfolk: -1, Bashkars: -1},
      perks: [['Short-legs','Cannot use sunlight phases; Rest counts double; Duck chit serves as a Move chit only for ducking.'], ['Cave-knowledge','In cave clearings roll one die on Search, Hide and Meeting tables.']] },
    { id: 'elf', name: 'Elf', weight: 'Light', strongest: 'Medium', starts: ['Inn'], gear: 'Light Bow', spells: { n: 2, types: ['III', 'VII'] },
      rel: {Woodfolk: 2, Bashkars: 1, Order: -1, Scholar: -1, Lancers: -2},
      perks: [['Elusiveness','One extra Hide phase each day.'], ['Archer','Roll one die on the Missile Table.']] },
    { id: 'druid', name: 'Druid', weight: 'Light', strongest: 'Light', starts: ['Inn'], gear: null, spells: { n: 2, types: ['II', 'VIII'] },
      rel: {Bashkars: 2, Lancers: 1, Order: -1, Shaman: -1, Woodfolk: -2},
      perks: [['Concealment','Roll one die instead of two when hiding.'], ['Peace-with-nature','At the end of his own turn, warning and sound chits in his tile do not summon.']] },
    { id: 'magician', name: 'Magician', weight: 'Light', strongest: 'Medium', starts: ['Inn'], gear: null, spells: { n: 3, types: ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] },
      rel: {Company: 1, Rogues: 1, Patrol: -1, Soldiers: -1, Crone: -1},
      perks: [['Magical-paraphernalia','One extra Alert phase each day.'], ['Knowledge','Subtract one from Reading Runes rolls.']] },
    { id: 'witch', name: 'Witch', weight: 'Light', strongest: 'Medium', starts: ['Inn'], gear: null, spells: { n: 3, types: ['II', 'V', 'VIII'] }, her: true,
      rel: {Company: 2, Bashkars: 1, Order: -1, Lancers: -1, Soldiers: -1, Shaman: -1},
      perks: [['Knowledge','Subtract one from Reading Runes rolls.'], ['Familiar','Has an invisible companion that moves, follows and peers separately.']] },
    { id: 'witch-king', name: 'Witch King', weight: 'Light', strongest: 'Medium', starts: ['Inn', 'Ghosts'], gear: null, spells: { n: 4, types: ['IV', 'V', 'VI'] },
      rel: {Bashkars: 2, Company: 1, Lancers: -1, Scholar: -1, Order: -2},
      perks: [['Disembodied','Must search with Magic Sight; carries only Negligible weight until he owns magic items.'], ['Aura-of-power','One extra spell (Enchant) phase each day.']] },
    { id: 'pilgrim', name: 'Pilgrim', weight: 'Medium', strongest: 'Heavy', starts: ['Inn', 'Chapel'], gear: 'Staff', spells: { n: 1, types: ['I', 'VII'] },
      rel: {Order: 2, Bashkars: -1, Company: -1, Crone: -1},
      perks: [['Heavenly-protection','Demons and the Imp cannot attack him or be assigned to him; he can still attack them.'], ['Learning','Roll one die when Reading Runes.']] },
];
// The sentence in the spell row for a character whose spells are chosen for him (and the printed rule behind it stays on the card).
const SPELL_NOTE = { 'white-knight': 'The White Knight begins with one spell. Choose it.', wizard: 'The Wizard begins with two spells. Choose them.',
    sorceror: 'The Sorcerer begins with three spells, chosen for him. Change any.', 'woods-girl': 'The Woods Girl begins with one spell. Choose it.' };

// ---- the game data (spells, printed text, where the dwellings are), fetched once ----
let DATA = null;
const getData = () => (DATA ??= loadData('data/').catch(e => { DATA = null; throw e; }));
const PLACES = new Map();
// Where each dwelling stands in the realm of this seed: the real setup, run once (a valley chit tells the Inn, the House, the Chapel and the Guard house where they are).
async function placesFor(seed) {
    if (PLACES.has(seed)) return PLACES.get(seed);
    const data = await getData(), st = startState(data, { seed, character: 'black-knight' });
    const out = Object.fromEntries(st.dwellings.map(d => [d.kind, nameOfClearing(d.at)]));
    PLACES.set(seed, out); return out;
}

const DWELL_NAME = { Inn: 'The Inn', Chapel: 'The Chapel', House: 'The House', 'Guard house': 'The Guard house', Ghosts: 'The Ghosts' };
const SELLS = { Inn: ['Rogues', 'Sells workhorses and trinkets.'], Chapel: ['Order', 'Sells armor, warhorses and great weapons.'], House: ['Soldiers', 'Sells helmets, shields, staffs and swords.'], 'Guard house': ['Guard', 'Sells a helmet, a breastplate, a broadsword, axes and maces.'] };
const FEEL = { 2: 'your allies', 1: 'friendly to you', '-1': 'wary of you', '-2': 'your enemies' };
export function dwellingBrief(dwelling, who = {}) {
    const e = SELLS[dwelling]; if (!e) return '';
    const feel = FEEL[String(who.rel?.[e[0]] ?? 0)];
    return feel ? `${e[1]} The ${e[0]}: ${feel}.` : e[1];
}

// One character, as a portrait strip plus one card: allies and foes as chips, the perks as short rows.
const MOODS = [[2, 'ally'], [1, 'friendly'], [-1, 'unfriendly'], [-2, 'enemy']];
const chipsOf = (c, levels) => MOODS.filter(([lv]) => levels.includes(lv)).flatMap(([lv, cls]) => Object.entries(c.rel).filter(([, v]) => v === lv).map(([name]) => h('span', { class: `ds-tag mood ${cls}` }, name)));

// who holds this character already at a shared table (the seat that is choosing now may keep its own)
const takenBy = (g, id) => (g.race?.seats ?? []).find(x => x.character === id && x.seat !== g.mySeat)?.name ?? null;


// ---- the starting spells ----
// What is chosen when nothing has been: the same order the engine uses when it is given no pick (engine/setup.js STARTER_SPELLS: Make Whole, Stones Fly, Fiery Blast, Lightning Bolt, Control Bats
// first, then the data order), so a player who clicks straight through gets what Quick start gets.
const STARTER = ['make-whole', 'stones-fly', 'fiery-blast', 'lightning-bolt', 'control-bats'];
const defaultSpells = (pool, n) => pool.filter(castable).map((sp, i) => ({ sp, i })).sort((a, b) => (STARTER.indexOf(a.sp.id) + 1 || 99) - (STARTER.indexOf(b.sp.id) + 1 || 99) || a.i - b.i).slice(0, n).map(x => x.sp.id);
// The printed card of a spell, in a sheet (the picker row is the choice; this is the reading).
function spellCard(sp) {
    let close = () => {};
    const full = CARDTEXT[sp.id] ?? '';
    close = openSheet(sheet({ eyebrow: `Type ${sp.type} · ${sp.color ?? 'any colour'} · ${sp.duration}`, title: sp.name, detent: 'half', onClose: () => close(), attrs: { 'data-sheet': 'spell' },
        body: [spellLine(sp.id) ? h('p', { class: 'ds-voice lg' }, nb(spellLine(sp.id))) : null, full ? h('p', { class: 'ds-text ds-dim ds-printed' }, full) : null] }));
}

// ---- the party step (option C of docs/design/redesign/party/: an accordion roster) ----
let SPELLS = null, CARDTEXT = {}, SPELLS_LOADING = false;
const loadSpells = redraw => {
    if (SPELLS || SPELLS_LOADING) return !!SPELLS;
    SPELLS_LOADING = true;
    getData().then(d => { SPELLS = Object.values(d.spells); CARDTEXT = d.cardtext?.spells ?? {}; SPELLS_LOADING = false; redraw(); }).catch(() => { SPELLS = []; SPELLS_LOADING = false; });
    return false;
};
// the spells a member begins with when nothing has been picked (the engine's own default); settled once the list has loaded
const ensureSpells = party => { if (!SPELLS) return; for (const m of party) { const c = charOf(m.id); if (c.spells && !Array.isArray(m.spells)) m.spells = defaultSpells(SPELLS.filter(sp => c.spells.types.includes(sp.type)), c.spells.n); } };
const spellOf = id => SPELLS?.find(s => s.id === id) ?? { id, name: id, type: '', color: null };
const needOf = m => { const n = charOf(m.id).spells?.n ?? 0; return Array.isArray(m.spells) ? Math.max(0, n - m.spells.length) : 0; };
const incomplete = g => g.party.filter(m => needOf(m) > 0);
export const spellsOf = m => (charOf(m.id).spells && Array.isArray(m.spells) ? [...m.spells] : undefined);
export const goalsUsed = m => Object.values(m.vp).reduce((a, b) => a + b, 0);

// Story and Detail are both in the page; core.css shows one
const v2 = (story, detail = story) => [h('span', { 'data-v': 'story' }, story), h('span', { 'data-v': 'detail' }, detail)];
const initialOf = id => (charOf(id).name[0] ?? '?').toUpperCase();
const ORDINAL = ['first', 'second', 'third', 'fourth'];
// a member's face with his pawn: the seat's colour AND shape AND his initial (party.js SEAT_STYLES), and a flag when something is left to do
const face = (id, i, { sm = false, flag = false } = {}) => h('span', { class: `pt-who${sm ? ' sm' : ''}` }, h('span', { class: 'pt-face' }, h('img', { src: portraitSrc(id), alt: '' })), seatBadge(i, initialOf(id)),
    flag ? h('span', { class: 'pt-flag', 'aria-hidden': 'true' }, icon('warn')) : null);
const the = d => (DWELL_NAME[d] ?? d).replace(/^The /, 'the ');
const placeOf = (g, d) => (!g._online && g.seed != null ? PLACES.get(g.seed)?.[d] : null) ?? null;
const startLine = (g, m) => h('span', { class: 'pt-line' }, icon('pin'), v2(`Begins at ${the(m.start)}.`, `Start: ${m.start}${placeOf(g, m.start) ? ` · ${placeOf(g, m.start)}` : ''}`));
const sumText = (g, m) => { const c = charOf(m.id), sp = (m.spells ?? []).map(id => spellOf(id).name).join(', ');
    return v2(`From ${the(m.start)}${sp ? `, with ${sp}.` : '.'}`, `${m.start}${sp ? ` · ${sp}` : c.spells ? '' : ' · no spells'}`); };
const spellChip = id => { const s = spellOf(id);
    return h('span', { class: 'pt-chip big', 'data-spell-chip': id }, art(`colormagic/${COLOR_FILE[s.color] ?? 'white'}chit.gif`, 'ds-px'), s.name, s.type ? h('i', { 'data-v': 'detail' }, ` ${s.type}`) : null); };
const goalsText = m => GOAL_ORDER.filter(k => m.vp[k]).map(k => `${m.vp[k]} ${VP_ROWS.find(r => r.k === k).label.replace('Great treasures', 'Great treasure')}`).join(', ');

// the prompt line of the step
const partyPrompt = (g, online) => online ? q('Your character.') : g.party.length === 0 ? h('p', { class: 'ds-voice lg ds-q' }, v2('Who rides into the realm?', `Your party: 1 to ${MAX_PARTY} characters, all played by you.`))
    : h('p', { class: 'ds-voice lg ds-q' }, v2(g.party.length === 1 ? 'Ride alone, or take company?' : 'Your company, in the order they act.', `Your party: ${g.party.length} of ${MAX_PARTY}. You play every one of them.`));

// The spell picker, in a sheet. Rows toggle in place (the sheet is not rebuilt), and the roster behind it follows.
function spellsSheet(g, i, redraw) {
    const m = g.party[i], c = charOf(m.id), n = c.spells.n;
    const pool = SPELLS.filter(sp => c.spells.types.includes(sp.type));
    const groups = [...new Set(pool.map(sp => sp.color ?? 'Any'))].sort((a, b) => (COLOR_ORDER.indexOf(a) + 1 || 9) - (COLOR_ORDER.indexOf(b) + 1 || 9));
    const body = h('div', { class: 'pt-spellbody' }), sumEl = h('span', { class: 'sum', style: 'flex:1;font:600 calc(14px * var(--ts, 1)) var(--font-ui)' });
    let close = () => {};
    const toggle = sp => { const chosen = m.spells ?? []; m.spells = chosen.includes(sp.id) ? chosen.filter(x => x !== sp.id) : [...chosen, sp.id].slice(-n); fill(); redraw(); };
    const row = sp => {
        const on = (m.spells ?? []).includes(sp.id), file = COLOR_FILE[sp.color] ?? 'white';
        return h('div', { class: `ds-row ds-spellrow${on ? ' sel' : ''}`, role: 'checkbox', tabindex: 0, 'aria-checked': on ? 'true' : 'false', 'data-spell': sp.id, onclick: () => toggle(sp), onkeydown: e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(sp); } } },
            h('span', { class: 'art ds-spellart' }, art(`colormagic/${file}chit.gif`, 'ds-px')),
            h('span', { class: 'main' }, h('b', {}, sp.name, h('span', { class: 'ds-tag' }, h('i', { class: `ds-dot ${COLOR_DOT[sp.color] ?? 'white'}` }), `Type ${sp.type}`)), h('span', {}, nb(spellLine(sp.id) || sp.duration))),
            h('button', { type: 'button', class: 'ds-info ds-spellinfo', 'aria-label': `The printed card for ${sp.name}`, onclick: e => { e.stopPropagation(); spellCard(sp); } }, icon('info')),
            h('span', { class: 'ds-check' }, icon('check')));
    };
    const frag = sheet({ eyebrow: 'Spells', title: c.name, detent: 'tall', onClose: () => close(), attrs: { 'data-sheet': 'spells' }, body,
        foot: [sumEl, h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'spells-done', onclick: () => close() }, 'Done')] });
    const eyebrow = frag.sheet.querySelector('h2 small');
    function fill() {
        const nd = needOf(m);
        eyebrow.textContent = `Spells · ${(m.spells ?? []).length} of ${n}`;
        sumEl.replaceChildren(nd ? h('b', { class: 'pt-need' }, `${nd} more to choose`) : h('b', { class: 'pt-ok' }, 'All chosen'));
        body.replaceChildren(h('p', { class: 'ds-voice ds-q ds-spellq' }, SPELL_NOTE[m.id] ?? `Choose ${n} spell${n === 1 ? '' : 's'}.`),
            ...groups.flatMap(col => [sect(col === 'Any' ? 'Any colour' : col), h('div', { class: 'ds-list' }, pool.filter(sp => (sp.color ?? 'Any') === col).map(row))]));
    }
    fill();
    close = openSheet(frag);
}

// "Start together": the row of a member after the first (default off); it says where he begins and whether he and the first member can follow each other
function togetherRow(g, m, i, redraw) {
    const f = g.party[0], c = charOf(m.id), fc = charOf(f.id), can = canTogether(g, m), same = m.start === f.start;
    const line = m.together ? v2(`Begins with the ${fc.name}, at ${the(f.start)}. If the ${fc.name} moves, so does ${c.her ? 'she' : 'he'}.`, `Start: ${f.start}, as the ${fc.name} (kept in step).`)
        : !can ? v2(`The ${c.name} cannot begin at ${the(f.start)}, so ${c.her ? 'she' : 'he'} begins at ${the(m.start)}, apart from the ${fc.name}.`, `${f.start} is not on the ${c.name}\u2019s card (${c.starts.join(', ')}): he starts apart.`)
        : same ? v2(`Already begins at ${the(m.start)}, where the ${fc.name} does: they can follow each other.`, `Start: ${m.start}, the same as the ${fc.name}: they can follow each other (7.11.3).`)
        : v2(`Begins at ${the(m.start)}, apart from the ${fc.name}: Follow needs the same clearing.`, `Start: ${m.start}; the ${fc.name}: ${f.start}. Follow needs one clearing (7.11.3).`);
    return h('div', { class: 'pt-together' }, switchRow({ title: 'Start together', line, on: !!m.together, label: ['Off', 'On'], attrs: { 'data-together': m.id, class: `ds-switch-row${can ? '' : ' dim'}`, 'aria-disabled': can ? null : 'true' },
        onToggle: () => { if (!can) return; m.together = !m.together; if (m.together) m.start = f.start; redraw(); } }));
}

function partyStep(g, redraw, o) {
    const online = !!o.online, full = g.party.length >= MAX_PARTY;
    syncTogether(g);
    if (!online && g.seed != null && !PLACES.has(g.seed) && g._placing !== g.seed) { g._placing = g.seed; placesFor(g.seed).then(() => redraw()).catch(() => {}); }
    const bad = incomplete(g);
    const auto = bad.length ? g.party.indexOf(bad[0]) : g.party.length === 1 ? 0 : -1;          // the row that needs attention opens itself
    const openAt = g.open == null ? auto : g.open;
    const row = (m, i) => {
        const c = charOf(m.id), nd = needOf(m), open = openAt === i, armed = g.removeArm === m.id;
        const head = h('button', { type: 'button', class: 'pt-rhead', 'aria-expanded': open ? 'true' : 'false', 'data-member': m.id, 'data-act': 'toggle', onclick: () => { g.open = open ? -1 : i; g.removeArm = null; g.reveal = true; redraw(); } },
            face(m.id, i, { sm: true, flag: nd > 0 }),
            h('span', { class: 'main' }, h('span', { class: 'pt-name' }, h('span', { class: 'nm' }, c.name), open ? null : h('span', { class: 'ds-tag gold' }, c.weight)), h('span', { class: 'sumline' }, open ? 'Tap to close' : sumText(g, m))),
            nd ? h('span', { class: 'st pt-need', 'aria-label': `Needs ${nd} more spell${nd === 1 ? '' : 's'}` }, icon('warn'), `${nd} spell${nd === 1 ? '' : 's'}`) : h('span', { class: 'st pt-ok', 'aria-label': 'Ready' }, icon('check')),
            h('span', { class: 'pt-go' }, icon(open ? 'up' : 'down')));
        if (!open) return h('div', { class: `pt-row${nd ? ' need' : ''}`, 'data-row': m.id }, head);
        const dw = c.starts.length > 1;
        const body = h('div', { class: 'pt-rbody' },
            h('div', { class: 'pt-tags' }, h('span', { class: 'ds-tag gold' }, c.weight), h('span', { class: 'ds-meta' }, online ? v2('Played by you', 'Player: you') : v2(`Played by you, ${ORDINAL[i]}`, `Player: you · Order: ${i + 1}`))),
            dw ? h('div', {}, h('div', { class: 'lbl' }, c.her ? 'Where she begins' : 'Where he begins'),
                h('div', { class: 'ds-seg', role: 'radiogroup', 'aria-label': 'Starting place' }, c.starts.map(d => h('button', { type: 'button', class: m.start === d ? 'on' : null, role: 'radio', 'aria-checked': m.start === d ? 'true' : 'false', 'data-dwelling': d,
                    onclick: () => { m.start = d; redraw(); } }, d))),
                h('p', { class: 'ds-why', style: 'margin:6px 0 0' }, nb(`${DWELL_NAME[m.start] ?? m.start}${placeOf(g, m.start) ? `, ${placeOf(g, m.start)}` : ''}. ${dwellingBrief(m.start, c) || (m.start === 'Ghosts' ? 'Where the dead gather: a Witch King’s own.' : '')}`)))
                : h('div', {}, h('div', { class: 'lbl' }, 'Begins'), startLine(g, m), h('p', { class: 'ds-why', style: 'margin:6px 0 0' }, nb(`The ${c.name} has only the ${c.starts[0]} on ${c.her ? 'her' : 'his'} character card.`))),
            i > 0 && !online ? togetherRow(g, m, i, redraw) : null,
            c.spells ? h('div', {}, h('div', { class: 'lbl' }, 'Spells', h('em', { class: nd ? 'pt-need' : 'pt-ok' }, `${(m.spells ?? []).length} of ${c.spells.n}`)),
                !Array.isArray(m.spells) ? h('p', { class: 'ds-why' }, 'Loading the spell list…')
                    : h('span', { class: 'pt-chips' }, m.spells.map(spellChip), nd ? h('button', { type: 'button', class: 'pt-chip need big', 'data-act': 'spells', onclick: () => spellsSheet(g, i, redraw) }, icon('plus'), nd === 1 ? 'Choose 1 more' : `Choose ${nd} more`) : null))
                : null,
            h('div', { class: 'acts' },
                c.spells ? h('button', { type: 'button', class: 'ds-btn sm', 'data-act': 'spells', disabled: Array.isArray(m.spells) ? null : true, onclick: () => spellsSheet(g, i, redraw) }, icon('book'), nd ? 'Choose spells' : 'Change spells') : h('span'),
                online ? null : h('button', { type: 'button', class: `ds-btn sm${armed ? ' danger' : ' quiet'}`, 'data-act': 'remove', 'aria-label': armed ? `Really remove the ${c.name}?` : `Remove the ${c.name}`, style: armed ? null : 'color:var(--danger)',
                    onclick: () => {
                        if (!armed) { g.removeArm = m.id; setTimeout(() => { if (g.removeArm === m.id) { g.removeArm = null; redraw(); } }, 5000); redraw(); return; }
                        g.party.splice(i, 1); g.removeArm = null; g.open = null; redraw();
                    } }, icon('trash'), armed ? 'Really remove?' : 'Remove')));
        return h('div', { class: `pt-row open${nd ? ' need' : ''}`, 'data-row': m.id }, head, body);
    };
    const right = !g.party.length ? 'none yet' : bad.length ? h('b', { class: 'pt-need' }, `${charOf(bad[0].id).name} needs ${needOf(bad[0])} more spell${needOf(bad[0]) === 1 ? '' : 's'}`) : online ? '' : full ? `${g.party.length} of ${MAX_PARTY}, full` : `${g.party.length} of ${MAX_PARTY}`;
    return [o.joinNote ? h('p', { class: 'ds-meta ds-joinbar', 'data-join': '' }, o.joinNote) : null, g.note && !g.busy ? h('p', { class: 'ds-why ds-qwhy', 'data-note': '' }, g.note) : null,
        partyPrompt(g, online),
        g.party.length ? [sect(online ? 'Your character' : 'Your party', right), !online && apartHint(g) ? h('p', { class: 'ds-why pt-apart', 'data-apart': '' }, v2(apartHint(g).story, apartHint(g).detail)) : null, h('div', { class: 'pt-acc' }, g.party.map(row))]
            : h('div', { class: 'pt-empty' }, h('div', { class: 'pt-seats' }, [0, 1, 2, 3].map(i => h('span', { class: 'pt-seat' }, String(i + 1)))), h('p', { class: 'ds-voice' }, v2('No one yet. Add a character to begin. You can bring up to four.', `Choose at least one character. Up to ${MAX_PARTY}, all yours.`)), h('p', { class: 'ds-why' }, 'Add character is below.')),
        g._shared ? h('p', { class: 'ds-why', 'data-sealed': '' }, 'Your goals and starting spells are sealed: the others see them only when the game is over.') : null,
        !online && g.party.length && !full ? h('p', { class: 'ds-why', style: 'margin-top:10px' }, 'Each character keeps his own spells, starting place and goals. Goals are chosen next.') : null];
}

// ---- the picker: every character on one screen. It adds a member (solo) or changes the one character of a seat (a race or a shared table) ----
function pickerStep(g, redraw, replace) {
    const pick = CHARACTERS.find(c => c.id === g.pick) ?? CHARACTERS[0];
    const cell = k => {
        const inP = g.party.findIndex((m, idx) => m.id === k.id && !(replace && idx === 0)), by = takenBy(g, k.id), on = g.pick === k.id;
        return h('button', { type: 'button', class: `pt-pick${on ? ' on' : ''}${inP >= 0 || by ? ' in' : ''}`, 'data-char': k.id, 'aria-pressed': on ? 'true' : 'false', disabled: inP >= 0 || by ? true : null,
            onclick: () => { g.pick = k.id; g.flip = false; redraw(); } },
            h('span', { class: 'pt-who' }, h('span', { class: 'pt-face' }, h('img', { src: portraitSrc(k.id), alt: '' })), inP >= 0 ? seatBadge(inP, initialOf(k.id)) : null),
            h('span', { class: 'nm' }, k.name), inP >= 0 ? h('small', {}, 'In party') : by ? h('small', {}, `Taken by ${by}`) : null);
    };
    const rel = h('dl', { class: 'ds-kv ds-rel' }, h('dt', {}, 'Allies'), h('dd', {}, chipsOf(pick, [2, 1])), h('dt', {}, 'Foes'), h('dd', {}, chipsOf(pick, [-1, -2])));
    const wide = Object.keys(pick.rel).length > 5;
    const kv = [...pick.perks.flatMap(([t, x]) => [h('dt', {}, t), h('dd', {}, x)]), h('dt', {}, 'Begins'), h('dd', {}, pick.gear ? pick.gear.replace(' and ', ', ') : 'With no weapon or armor'),
        ...(pick.spells ? [h('dt', {}, 'Spells'), h('dd', {}, `${pick.spells.n} to choose next`)] : [])];
    return [h('p', { class: 'ds-voice lg ds-q' }, v2(replace ? 'Who will you be?' : 'Who joins you?', replace ? 'Choose your character.' : `Add a character: ${g.party.length} of ${MAX_PARTY} so far.`)),
        h('div', { class: 'pt-grid', role: 'group', 'aria-label': 'Characters' }, CHARACTERS.map(cell)),
        h('div', { class: 'pt-prev', 'data-who': pick.id },
            h('div', { class: `ds-who${wide ? ' wide' : ''}` },
                h('button', { type: 'button', class: `ds-card-art${g.flip ? ' back' : ''}`, style: `background-image:url(${cardSrc(pick.id)})`, 'data-flip': '', 'aria-label': g.flip ? 'Turn the card back over' : 'Turn the card over to read its back', onclick: () => { g.flip = !g.flip; redraw(); } }),
                h('div', { class: 'ds-who-main' }, h('h2', { class: 'ds-h2 ds-who-name' }, pick.name),
                    h('div', { class: 'ds-who-tags' }, h('span', { class: 'ds-tag gold' }, pick.weight), h('span', { class: 'ds-meta' }, `Strongest Move chit ${pick.strongest}`)), wide ? null : rel)),
            wide ? rel : null, h('dl', { class: 'ds-kv ds-perks', style: 'margin-top:10px' }, kv))];
}

// ---- the goals step: each character has his own goals, with the same points to spend ----
function goalsStep(g, redraw, online) {
    const total = vpTotal(g), many = g.party.length > 1;
    const goal = (m, r) => {
        const v = m.vp[r.k], target = v * r.unit, used = goalsUsed(m);
        const sub = !v ? 'No goal' : r.k === 'fame' || r.k === 'notoriety' ? `reach ${target} ${r.what}` : r.k === 'gold' ? `${target} gold above your starting worth` : `goal: ${target} ${r.what}`;
        return h('div', { class: 'ds-row ds-goalrow', 'data-goal': r.k }, h('span', { class: 'main' }, h('b', { class: r.cls ? `ds-c-${r.cls}` : '' }, r.label), h('span', {}, sub)),
            stepper(v, null, 0, Math.min(5, v + (total - used)), n => { m.vp[r.k] = n; redraw(); }, { big: true }));
    };
    const list = m => h('div', { class: 'ds-list' }, GOAL_ORDER.map(k => goal(m, VP_ROWS.find(r => r.k === k))));
    const sealed = g._shared ? h('p', { class: 'ds-why ds-qwhy', 'data-sealed': '' }, 'Your goals are sealed: the others see them only when the game is over.') : null;
    if (!many) return [q('What are you playing for?'), sect('Your goals', `${total} points to spend`), sealed, list(g.party[0])];
    const unbalanced = g.party.findIndex(m => goalsUsed(m) !== total);
    const openAt = g.goalOpen == null ? unbalanced : g.goalOpen;
    const row = (m, i) => {
        const c = charOf(m.id), used = goalsUsed(m), open = openAt === i, left = total - used;
        const twin = g.party.find((o, j) => j !== i && goalsUsed(o) === total && GOAL_ORDER.some(k => o.vp[k] !== m.vp[k]));
        const head = h('button', { type: 'button', class: 'pt-rhead', 'aria-expanded': open ? 'true' : 'false', 'data-member': m.id, 'data-act': 'toggle-goals', onclick: () => { g.goalOpen = open ? -1 : i; g.reveal = true; redraw(); } },
            face(m.id, i, { sm: true, flag: left !== 0 }),
            h('span', { class: 'main' }, h('span', { class: 'pt-name' }, h('span', { class: 'nm' }, c.name)), h('span', { class: 'sumline' }, open ? 'Tap to close' : goalsText(m) || 'No goals yet')),
            left ? h('span', { class: 'st pt-need' }, icon('warn'), left > 0 ? `${left} left` : `${-left} over`) : h('span', { class: 'st pt-ok', 'aria-label': 'Ready' }, icon('check')),
            h('span', { class: 'pt-go' }, icon(open ? 'up' : 'down')));
        return h('div', { class: `pt-row${open ? ' open' : ''}${left ? ' need' : ''}`, 'data-row': m.id }, head,
            open ? h('div', { class: 'pt-rbody' }, list(m), twin ? h('button', { type: 'button', class: 'ds-btn sm', 'data-act': 'copy-goals', onclick: () => { m.vp = { ...twin.vp }; redraw(); } }, icon('plus'), `Same goals as the ${charOf(twin.id).name}`) : null) : null);
    };
    return [q('What does each of them play for?'), sect('Goals, one set for each', `${total} points each`), sealed, h('div', { class: 'pt-acc' }, g.party.map(row))];
}

// Optional rules (3.1 section 10). Everything is off until switched on, as printed. A plain sentence on the row; the rule number and the full text sit behind the (i).
const OPTION_GROUPS = [
    // (the one switch that starts ON: it is rule 8.8.3 as printed, "combat is held every evening a spell could be cast", not an optional rule)
    { title: 'Magic', items: [
        { k: 'castAnytime', title: 'Cast whenever you can', rule: '8.8.3', line: 'Each evening stops for any spell you could cast.',
          text: 'Combat is held every evening a spell could be cast. On: you are asked each evening you could cast anything, even a spell with nothing to do tonight (you can say Not tonight). Off: the evening stops only when a spell would do something.' },
    ] },
    { title: 'Denizens', items: [
        { k: 'quietMonsters', title: 'Quiet Monsters', rule: '10.B.1', line: 'A hidden character is left alone by wandering monsters.',
          text: 'A character who is hidden when his turn ends does not turn up the chits in his tile, and monsters from the Appearance Chart do not come.' },
        { k: 'watchfulNatives', title: 'Watchful Natives', rule: '10.B.4', line: 'Natives you strike hit back in the same round.',
          text: 'Natives you strike surprise you back: the whole group fights you in the same round, not the next.' },
    ] },
    SECTIONS_GROUP,
    { title: 'Characters', items: [
        { k: 'knightsAdjustment', title: "Knights’ Adjustment", rule: '10.A.6.8', line: 'Tames the Knights’ trading edge: their allies are only Friendly.',
          text: 'The White Knight is only Friendly with the Order, and the Black Knight Friendly with the Company, instead of Allies. It tames their trading advantage.' },
    ] },
];

// (the optional rule for hirelings and hired leaders is one more entry, built in leaders.js; a race leaves it out)
const optionGroups = (shared, online) => (shared || !online ? [...OPTION_GROUPS, HIRELING_GROUP] : OPTION_GROUPS);

// A SHARED game: how many sit at the table, and whether characters may fight each other. Plain words first; the rule numbers are for those who look.
function tableStep(g, redraw) {
    g.seats ??= 2;
    const pvp = !!g.options.pvp, dayEnd = g.options.dayEnd !== false;
    return [sect('The table'),
        h('div', { class: 'ds-seatseg' }, h('div', { class: 'ds-seg', role: 'radiogroup', 'aria-label': 'Players' }, [2, 3, 4].map(n => h('button', { type: 'button', class: g.seats === n ? 'on' : null, role: 'radio', 'aria-checked': g.seats === n ? 'true' : 'false', 'data-seats': n, onclick: () => { g.seats = n; redraw(); } }, `${n} players`))),
            why('Everyone plays one character on one map, in turn. The game starts when every seat is taken and everyone has picked a character; nobody can join late.')),
        switchRow({ title: 'Players may fight each other', on: pvp, attrs: { 'data-option': 'pvp' }, onToggle: () => { g.options.pvp = !pvp; redraw(); },
            line: pvp
                ? 'On: in the evening a character can charge another player’s character, or name them in the secret plays, and send hirelings against them. Whoever is struck down loses everything to the one who did it: their Notoriety, their gold and all their belongings. They return at the next Birdsong with a new character. Turn it on only if everyone at the table has agreed: a death is real, and there is no taking it back once the game has begun.'
                : 'Off: you share the map and the monsters, you race on points, but nobody can attack another player’s character. It cannot be changed once the game has begun.' }),
        // after the evening's fights, characters standing together may trade before Midnight (a lobby option, on unless the host turns it off: it is kept with the game)
        switchRow({ title: 'Trade at the end of the day', on: dayEnd, attrs: { 'data-option': 'dayEnd' }, onToggle: () => { g.options.dayEnd = !dayEnd; redraw(); },
            line: dayEnd ? 'On: after the evening’s fights, characters who stand together may trade before Midnight. Each player can still turn it off for their own character.'
                : 'Off: characters trade only at the start of a phase of someone’s turn, not after the fights.' })];
}

function realmStep(g, redraw, go, ctx, { shared, online }) {
    g.options ??= {};
    const realmCard = !online ? [h('button', { type: 'button', class: 'ds-row ds-realmrow', 'data-act': 'preview', onclick: () => { ctx.realm = { seed: g.seed, showHidden: false, enchanted: false, sel: null, view: null }; go('realm'); } },
        realmThumb(g.seed), h('span', { class: 'main' }, h('b', {}, 'A realm of twenty tiles'), h('span', {}, `Seed ${g.seed}. Tap to see another.`)), icon('right'))] : [];
    return [q('Your realm.'), ...realmCard, ...(shared ? tableStep(g, redraw) : []),
        ...optionGroups(shared, online).flatMap(grp => [sect(grp.title),
            ...grp.items.map(o => switchRow({ title: o.title, line: o.line, on: !!g.options[o.k], attrs: { 'data-option': o.k }, info: `Rule ${o.rule}. ${o.text}`, onToggle: () => { g.options[o.k] = !g.options[o.k]; redraw(); } }))]),
        ...(online ? [] : missionsBlock(g, redraw)),
        h('p', { class: 'ds-why ds-fixed' }, 'The printed rules are the default. These cannot be changed once the game has begun.')];
}

// Visitor, mission and campaign chits (rules 3.4, 7.2.4; a game option, off unless switched on, solo games only). On: six two-sided chits lie in the seven small boxes of Row 6 of the Appearance Chart and
// come out onto the map when their leader or site is met. The placement (3.4) is the player's, a chit at a time, or left to chance (screens/placement.js).
function missionsBlock(g, redraw) {
    g.missions ??= { on: false, place: [] };
    const m = g.missions;
    return [sect('Visitors'),
        switchRow({ title: 'Missions and campaigns', on: m.on, attrs: { 'data-option': 'missions' }, onToggle: () => { m.on = !m.on; redraw(); },
            line: 'Visitors, missions and campaigns lie in the realm. A mission is a delivery, a campaign a war on a native group.',
            info: 'Rules 2.2.5, 3.4, 7.2.4. Six two-sided chits (Scholar or Pillage, Shaman or Escort Party, Warlock or Food/Ale, Crone or Raid, Conquer or War, Revolt or Quest) start in the seven small boxes of Row 6 of the Appearance Chart. A chit comes out into a clearing when its leader or site is met. A mission or campaign costs Fame or Notoriety to take and is paid back when it is done; it is lost, and the cost paid again, if time runs out.' }),
        m.on ? h('button', { type: 'button', class: 'ds-row ms-placerow', 'data-act': 'missions-place', onclick: () => getData().then(d => openPlacement(g, d, { onChange: () => {}, onClose: redraw })).catch(() => {}) },
            h('span', { class: 'main' }, h('b', {}, 'Place the six chits'), h('span', {}, placementStatus(g))), icon('right')) : null];
}

export function newGameScreen(ctx) {
    const g = ctx.newGame ?? (ctx.newGame = defaultGame());
    const root = h('main', { class: 'screen ds-screen ds-title flush newgame', 'data-screen': 'newgame' });
    const redraw = () => {
        if (!root.isConnected && root.dataset.mounted) return;
        root.replaceChildren(...build());
        const body = root.querySelector('.ds-scroll'); if (body && g._scroll) body.scrollTop = g._scroll;
        if (g.reveal) { g.reveal = false; root.querySelector('.pt-row.open')?.scrollIntoView({ block: 'nearest' }); }
    };
    // a Remove that has been tapped once waits for the second tap; tapping anything else (or waiting) lets it go
    root.addEventListener('click', e => { if (g.removeArm && !e.target.closest('[data-act=remove]')) { g.removeArm = null; setTimeout(redraw, 0); } }, true);
    const online = ctx.onlineIntent ?? null;                     // set by the Play online screen: this wizard is choosing a seat in a race, or opening / joining a shared table
    const first = online && online.mode !== 'create' ? 2 : 0;    // someone joining takes the game's rules and only chooses a character and goals
    const kindOf = () => online?.kind === 'shared' ? 'shared' : 'race';
    const lead = () => g.party[0];
    if (online && !g._online) {
        g._online = true;
        g._shared = kindOf() === 'shared';
        if (g._shared) g.options = { ...g.options, pvp: false };
        if (online.mode === 'choose') {                               // changing my character in the lobby: the seats are known already
            g.step = first; g.race = { seats: online.seats ?? [], players: [] }; g.mySeat = online.mySeat;
            if (online.current && CHARACTERS.some(c => c.id === online.current)) g.party = [newMember(online.current)];
        }
        if (online.mode === 'join') {
            g.step = first; g.loading = true; g.note = 'Looking up the game…';
            peekRace(online.server, online.invite).then(r => {
                g.loading = false; g.note = null; g.race = r;
                online.kind = r.kind === 'shared' ? 'shared' : 'race'; g._shared = online.kind === 'shared';
                g.options = { ...g.options, ...r.options };
                if (r.mode === 'sudden') g.length = 'sudden'; else if (r.mode === 'endless') g.length = 'endless'; else if (r.lastDay === 28) g.length = 'month'; else { g.length = 'custom'; g.weeks = Math.round(r.lastDay / 7); }
                if (g._shared) {                                      // start from a character nobody holds
                    const free = CHARACTERS.find(c => !takenBy(g, c.id)); if (free) g.party = [newMember(free.id)];
                    if (r.status && r.status !== 'lobby') g.note = 'That game has already started: nobody joins late.';
                }
                redraw();
            }).catch(e => { g.loading = false; g.note = e.message; redraw(); });
        }
    }
    if (online && g.step < first) g.step = first;
    if (online) g.party = g.party.slice(0, 1);                       // each seat of a race or a shared table runs one character
    const closePicker = () => { g.view = 'party'; g._scroll = 0; g.flip = false; g.reveal = true; redraw(); };
    const back = () => {
        if (g.view === 'pick') { closePicker(); return; }
        if (g.step <= first) {
            if (online?.mode === 'choose') ctx.go('sharedlobby', { game: online.game });
            else ctx.go(online ? 'online' : 'title', online ? { message: '' } : {});
        } else { g.step -= 1; g._scroll = 0; g.removeArm = null; redraw(); }
    };
    // each character's goals must add up to the length's budget (rule 3.3.6a): the quick start, which skips the goals page, spreads it for you
    const fitVp = () => {
        const total = vpTotal(g);
        for (const m of g.party) {
            if (goalsUsed(m) === total) continue;
            const fame = Math.min(5, Math.ceil(total * 0.6)), notoriety = Math.min(5, total - fame);
            m.vp = { great: 0, spells: 0, fame, notoriety, gold: Math.max(0, total - fame - notoriety) };
        }
    };
    const start = () => {
        syncTogether(g); fitVp(); ensureSpells(g.party);
        const lastDay = g.length === 'custom' ? g.weeks * 7 : 28;
        if (online) { startOnline(lastDay); return; }
        const members = g.party.map(m => ({ id: m.id, vp: { ...m.vp }, startDwelling: m.start, spells: spellsOf(m) }));
        const l = members[0];
        const missions = g.missions?.on ? (g.missions.place.length ? { place: g.missions.place.map(p => ({ ...p })) } : true) : undefined;
        const params = { fresh: true, missions, characters: members.length > 1 ? members : undefined, character: l.id, vp: l.vp, options: { ...g.options }, startDwelling: l.startDwelling, startSpells: l.spells, lastDay, mode: g.length === 'sudden' ? 'sudden' : g.length === 'endless' ? 'endless' : 'month', seed: g.seed };
        ctx.newGame = null;                                           // the next new game starts from the defaults, with a realm of its own
        ctx.go('game', params);
    };
    async function startOnline(lastDay) {
        const m = lead();
        const choices = { character: m.id, vp: { ...m.vp }, startDwelling: m.start, startSpells: spellsOf(m) };
        const mode = g.length === 'sudden' ? 'sudden' : g.length === 'endless' ? 'endless' : 'month';
        const shared = kindOf() === 'shared';
        g.note = online.mode === 'join' ? 'Taking your seat…' : online.mode === 'choose' ? 'Saving…' : shared ? 'Setting up the table…' : 'Setting up the race…'; g.busy = true; redraw();
        try {
            if (online.mode === 'choose') {
                const game = online.game; await chooseShared(game, choices);
                ctx.onlineIntent = null; ctx.newGame = null; ctx.go('sharedlobby', { game }); return;
            }
            if (shared) {
                const game = online.mode === 'join' ? await joinShared(online.server, online.invite, online.name, choices)
                    : await createShared(serverUrl(), online.name, { ...choices, maxSeats: g.seats ?? 2, lastDay, options: { ...g.options }, mode });
                ctx.onlineIntent = null; ctx.newGame = null; ctx.go('sharedlobby', { game, invited: online.mode === 'create' }); return;
            }
            const race = online.mode === 'join' ? await joinRace(online.server, online.invite, online.name, choices)
                : await createRace(serverUrl(), online.name, { ...choices, lastDay, options: { ...g.options }, mode });
            ctx.onlineIntent = null; ctx.newGame = null;
            ctx.go('game', { online: race, invited: online.mode === 'create' });
        } catch (e) { g.busy = false; g.note = e.message; redraw(); }
    }
    const next = () => { if (g.step < STEPS.length - 1) { g.step += 1; g._scroll = 0; g.goalOpen = null; g.removeArm = null; redraw(); } };
    const openPicker = () => {
        g.view = 'pick'; g.flip = false; g._scroll = 0; g.removeArm = null;
        g.pick = online ? lead().id : (CHARACTERS.find(c => !g.party.some(m => m.id === c.id) && !takenBy(g, c.id)) ?? CHARACTERS[0]).id;
        redraw();
    };
    const pickOk = () => {
        const id = g.pick;
        if (online) { const old = lead(); if (old.id !== id) g.party = [{ ...newMember(id), vp: old.vp }]; g.open = null; }
        else if (!g.party.some(m => m.id === id) && g.party.length < MAX_PARTY) { g.party.push(newMember(id)); g.open = g.party.length - 1; }
        closePicker();
    };

    const title = () => !online ? 'New game' : online.mode === 'choose' ? 'Your character' : kindOf() === 'shared' ? (online.mode === 'join' ? 'Join the shared game' : 'Start a shared game') : (online.mode === 'join' ? 'Join the race' : 'Start a race');
    const goLabel = () => !online ? 'Start the game' : online.mode === 'choose' ? 'Save my choice' : online.mode === 'join' ? 'Take my seat' : kindOf() === 'shared' ? 'Open the table' : 'Start the race';

    // what stops the primary, said in words next to it (a dim button with its reason on screen)
    function blocker() {
        if (g.loading || g.busy) return null;
        const many = g.party.length > 1, name = m => charOf(m.id).name;
        if (g.step === 2) {
            if (!g.party.length) return 'Choose at least one character.';
            const m = incomplete(g)[0];
            if (m) { const k = needOf(m); return `${many ? `The ${name(m)}: choose` : 'Choose'} ${k === 1 ? 'one more' : `${k} more`} spell${k === 1 ? '' : 's'}.`; }
        }
        if (g.step === STEPS.length - 1) {
            const total = vpTotal(g), m = g.party.find(x => goalsUsed(x) !== total);
            if (m) { const d = total - goalsUsed(m); return `${many ? `${name(m)}: ` : ''}${d > 0 ? `${d} point${d === 1 ? '' : 's'} left to spend` : `${-d} point${d === -1 ? '' : 's'} too many`}.`; }
            if (online?.mode === 'join' && g.race?.status && g.race.status !== 'lobby') return 'That game has already started.';
        }
        return null;
    }

    function build() {
        const last = g.step === STEPS.length - 1, n = STEPS.length - first, at = g.step - first + 1;
        const shared = kindOf() === 'shared';
        if (g.step === 2 || g.view === 'pick') loadSpells(redraw);
        ensureSpells(g.party);
        const joinNote = online?.mode === 'join' && g.race ? `${summary(g)} · with ${g.race.players.join(', ')}${g.race.open ? ` · ${g.race.open === 1 ? 'one seat' : `${g.race.open} seats`} open` : ''}` : null;
        if (g.step === 2 && g.view === 'pick') {
            const free = !g.party.some((m, idx) => m.id === g.pick && !(online && idx === 0)) && !takenBy(g, g.pick);
            return [bar(online ? 'Change character' : 'Add a character', { onBack: back }),
                h('div', { class: 'ds-scroll ds-pad ds-wizbody', 'data-step': 'pick', onscroll: e => { g._scroll = e.target.scrollTop; } }, ...pickerStep(g, redraw, !!online)),
                foot(h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'pick-back', onclick: closePicker }, 'Back'),
                    h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'pick-ok', disabled: free ? null : true, onclick: pickOk }, online ? `Use the ${charOf(g.pick).name}` : `Add ${charOf(g.pick).name}`))];
        }
        const bodyEls = g.step === 0 ? typeStep(g, redraw) : g.step === 1 ? realmStep(g, redraw, ctx.go, ctx, { shared: shared && online?.mode === 'create', online: !!online })
            : g.step === 2 ? partyStep(g, redraw, { online: !!online, joinNote }) : goalsStep(g, redraw, !!online);
        const stop = blocker(), busy = g.loading || g.busy;
        // left slot: Quick start on step 1, Add character on the party step, a counter or summary where there is one, else Back
        let leftEl;
        if (g.step === 2) leftEl = h('button', { type: 'button', class: 'ds-btn', 'data-act': 'add', disabled: busy || (!online && g.party.length >= MAX_PARTY) ? true : null, onclick: openPicker }, icon('plus'), online ? 'Change character' : 'Add character');
        else if (g.note) leftEl = sum(g.note);
        else if (stop) leftEl = sum(h('b', { class: 'bad' }, stop));
        else if (last) leftEl = g.party.length > 1 ? sum(h('b', { class: 'gold' }, `${g.party.length} characters`), ' · all goals set') : sum('Goals: ', h('b', {}, goalsText(g.party[0]) || 'none'));
        else if (online?.mode === 'join' && g.race) leftEl = sum(joinNote);
        else if (g.step === 0 && !online) leftEl = h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'quick', onclick: start }, 'Quick start');
        else leftEl = h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'back', onclick: back }, 'Back');
        const primary = h('button', { type: 'button', class: 'ds-btn primary', 'data-act': last ? 'start' : 'next', disabled: busy || stop ? true : null, onclick: last ? start : next }, last ? goLabel() : g.step === 2 ? 'Continue' : 'Next');
        return [bar(title(), { onBack: back, step: at, of: n }),
            h('div', { class: 'ds-scroll ds-pad ds-wizbody', 'data-step': STEPS[g.step].id, onscroll: e => { g._scroll = e.target.scrollTop; } }, ...bodyEls),
            foot(leftEl, primary)];
    }
    root.append(...build());
    root.dataset.mounted = '1';
    return root;
}
