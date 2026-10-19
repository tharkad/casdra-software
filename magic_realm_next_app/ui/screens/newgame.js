import { h } from '../dom.js';
import { icon, art } from '../icons.js';
import { sheet, sect } from '../ds.js';
import { castable } from '../../engine/spells.js';
import { loadData } from '../../engine/data.js';
import { newGame as startState } from '../../engine/setup.js';
import { nameOfClearing } from '../../engine/world.js';
import { createRace, joinRace, peekRace, serverUrl } from '../online.js';
import { createShared, joinShared, chooseShared } from '../shared_online.js';
import { bar, cardSrc, foot, nb, openSheet, portraitSrc, sum, switchRow } from '../front.js';
import { spellLine, COLOR_ORDER, COLOR_FILE, COLOR_DOT } from '../start_spells.js';
import { realmThumb } from './realm.js';

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
export const defaultGame = () => ({ step: 0, length: 'month', weeks: 4, suddenVp: 5, character: 'white-knight', dwelling: 'Inn', seed: Math.floor(Math.random() * 9999) + 1, vp: { great: 0, spells: 0, fame: 3, notoriety: 2, gold: 0 }, options: { knightsAdjustment: false, watchfulNatives: false, quietMonsters: false } });

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

const DWELL_NAME = { Inn: 'The Inn', Chapel: 'The Chapel', House: 'The House', 'Guard house': 'The Guard house' };
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
function spellsBlock(g, who, redraw) {
    if (!who.spells) return [];
    if (!SPELLS) { getData().then(d => { SPELLS = Object.values(d.spells); CARDTEXT = d.cardtext?.spells ?? {}; redraw(); }).catch(() => { SPELLS = []; }); return [h('p', { class: 'ds-why' }, 'Loading the spell list…')]; }
    const pool = SPELLS.filter(sp => who.spells.types.includes(sp.type));
    if (!Array.isArray(g.spells) || g.spellsFor !== who.id) { g.spells = defaultSpells(pool, who.spells.n); g.spellsFor = who.id; }
    const chosen = g.spells, n = who.spells.n;
    const toggle = sp => { g.spells = chosen.includes(sp.id) ? chosen.filter(x => x !== sp.id) : [...chosen, sp.id].slice(-n); redraw(); };
    const groups = [...new Set(pool.map(sp => sp.color ?? 'Any'))].sort((a, b) => (COLOR_ORDER.indexOf(a) + 1 || 9) - (COLOR_ORDER.indexOf(b) + 1 || 9));
    const row = sp => {
        const on = chosen.includes(sp.id), file = COLOR_FILE[sp.color] ?? 'white';
        return h('div', { class: `ds-row ds-spellrow${on ? ' sel' : ''}`, role: 'checkbox', tabindex: 0, 'aria-checked': on ? 'true' : 'false', 'data-spell': sp.id, onclick: () => toggle(sp), onkeydown: e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(sp); } } },
            h('span', { class: 'art ds-spellart' }, art(`colormagic/${file}chit.gif`, 'ds-px')),
            h('span', { class: 'main' }, h('b', {}, sp.name, h('span', { class: 'ds-tag' }, h('i', { class: `ds-dot ${COLOR_DOT[sp.color] ?? 'white'}` }), `Type ${sp.type}`)), h('span', {}, nb(spellLine(sp.id) || sp.duration))),
            h('button', { type: 'button', class: 'ds-info ds-spellinfo', 'aria-label': `The printed card for ${sp.name}`, onclick: e => { e.stopPropagation(); spellCard(sp); } }, icon('info')),
            h('span', { class: 'ds-check' }, icon('check')));
    };
    return [h('p', { class: 'ds-voice ds-q ds-spellq' }, SPELL_NOTE[who.id] ?? `Choose ${n} spell${n === 1 ? '' : 's'}.`),
        ...groups.flatMap(c => [sect(c === 'Any' ? 'Any colour' : c), h('div', { class: 'ds-list' }, pool.filter(sp => (sp.color ?? 'Any') === c).map(row))])];
}
let SPELLS = null, CARDTEXT = {};
// The printed card of a spell, in a sheet (the picker row is the choice; this is the reading).
function spellCard(sp) {
    let close = () => {};
    const full = CARDTEXT[sp.id] ?? '';
    close = openSheet(sheet({ eyebrow: `Type ${sp.type} · ${sp.color ?? 'any colour'} · ${sp.duration}`, title: sp.name, detent: 'half', onClose: () => close(), attrs: { 'data-sheet': 'spell' },
        body: [spellLine(sp.id) ? h('p', { class: 'ds-voice lg' }, nb(spellLine(sp.id))) : null, full ? h('p', { class: 'ds-text ds-dim ds-printed' }, full) : null] }));
}

function charsStep(g, redraw, joinNote = null) {
    const who = CHARACTERS.find(c => c.id === g.character) ?? CHARACTERS[0];
    const portrait = c => {
        const by = takenBy(g, c.id), on = g.character === c.id;
        return h('button', { type: 'button', class: `ds-portrait${on ? ' on' : ''}${by ? ' taken' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-char': c.id, disabled: by ? true : null,
            onclick: () => { g.character = c.id; g.flip = false; if (!c.starts.includes(g.dwelling)) g.dwelling = c.starts[0]; redraw(); } },
            h('i', {}, h('img', { src: portraitSrc(c.id), alt: '' })), c.name, by ? h('span', { class: 'ds-sr' }, `taken by ${by}`) : null);
    };
    const rel = h('dl', { class: 'ds-kv ds-rel' }, h('dt', {}, 'Allies'), h('dd', {}, chipsOf(who, [2, 1])), h('dt', {}, 'Foes'), h('dd', {}, chipsOf(who, [-1, -2])));
    const wide = Object.keys(who.rel).length > 5;                      // many friends and foes: they get the full width under the card, not a narrow column beside it
    const kv = [...who.perks.flatMap(([t, x]) => [h('dt', {}, t), h('dd', {}, x)]), h('dt', {}, 'Begins'), h('dd', {}, who.gear ? who.gear.replace(' and ', ', ') : 'With no weapon or armor')];
    return [joinNote ? h('p', { class: 'ds-meta ds-joinbar', 'data-join': '' }, joinNote) : null,
        h('div', { class: 'ds-portraits', role: 'radiogroup', 'aria-label': 'Character' }, CHARACTERS.map(portrait)),
        h('div', { class: `ds-who${wide ? ' wide' : ''}`, 'data-who': who.id },
            h('button', { type: 'button', class: `ds-card-art${g.flip ? ' back' : ''}`, style: `background-image:url(${cardSrc(who.id)})`, 'data-flip': '', 'aria-label': g.flip ? 'Turn the card back over' : 'Turn the card over to read its back', onclick: () => { g.flip = !g.flip; redraw(); } }),
            h('div', { class: 'ds-who-main' }, h('h2', { class: 'ds-h2 ds-who-name' }, who.name),
                h('div', { class: 'ds-who-tags' }, h('span', { class: 'ds-tag gold' }, who.weight), h('span', { class: 'ds-meta' }, `Strongest Move chit ${who.strongest}`)),
                wide ? null : rel)),
        wide ? rel : null,
        h('dl', { class: 'ds-kv ds-perks' }, kv),
        g._shared ? h('p', { class: 'ds-why', 'data-sealed': '' }, 'Your goals and starting spells are sealed: the others see them only when the game is over.') : null,
        ...spellsBlock(g, who, redraw)];
}

function goalsStep(g, redraw, online) {
    const who = CHARACTERS.find(c => c.id === g.character) ?? CHARACTERS[0];
    const total = vpTotal(g), used = Object.values(g.vp).reduce((a, b) => a + b, 0);
    // where each dwelling stands in THIS realm (solo games choose the seed; a race or a table lays its realm out on the server)
    const places = !online && g.seed != null ? PLACES.get(g.seed) : null;
    if (!online && g.seed != null && !places) placesFor(g.seed).then(() => redraw()).catch(() => {});
    const goal = r => {
        const v = g.vp[r.k], target = v * r.unit;
        const sub = !v ? 'No goal' : r.k === 'fame' || r.k === 'notoriety' ? `reach ${target} ${r.what}` : r.k === 'gold' ? `${target} gold above your starting worth` : `goal: ${target} ${r.what}`;
        return h('div', { class: 'ds-row ds-goalrow', 'data-goal': r.k }, h('span', { class: 'main' }, h('b', { class: r.cls ? `ds-c-${r.cls}` : '' }, r.label), h('span', {}, sub)),
            stepper(v, null, 0, Math.min(5, v + (total - used)), n => { g.vp[r.k] = n; redraw(); }, { big: true }));
    };
    return [q(who.starts.length > 1 ? 'Where do you begin?' : `Where ${who.her ? 'she' : 'he'} begins`),
        h('div', { class: 'ds-choices', role: 'radiogroup', 'aria-label': 'Starting place' }, who.starts.map(d => h('button', { type: 'button', class: `ds-choice${g.dwelling === d ? ' on' : ''}`, role: 'radio', 'aria-checked': g.dwelling === d ? 'true' : 'false', 'data-dwelling': d,
            onclick: () => { g.dwelling = d; redraw(); } },
            h('span', { class: 'dot' }), h('span', { class: 'main' }, h('b', {}, DWELL_NAME[d] ?? d, places?.[d] ? h('em', {}, places[d]) : null), h('span', { class: 'l' }, nb(dwellingBrief(d, who))))))),
        who.starts.length === 1 ? why(`The ${who.name} has only the ${who.starts[0]} on ${who.her ? 'her' : 'his'} character card.`) : null,
        sect('Your goals', `${total} points to spend`),
        g._shared ? h('p', { class: 'ds-why ds-qwhy', 'data-sealed': '' }, 'Your goals are sealed: the others see them only when the game is over.') : null,
        h('div', { class: 'ds-list' }, GOAL_ORDER.map(k => goal(VP_ROWS.find(r => r.k === k))))];
}

// Optional rules (3.1 section 10). Everything is off until switched on, as printed. A plain sentence on the row; the rule number and the full text sit behind the (i).
const OPTION_GROUPS = [
    { title: 'Denizens', items: [
        { k: 'quietMonsters', title: 'Quiet Monsters', rule: '10.B.1', line: 'A hidden character is left alone by wandering monsters.',
          text: 'A character who is hidden when his turn ends does not turn up the chits in his tile, and monsters from the Appearance Chart do not come.' },
        { k: 'watchfulNatives', title: 'Watchful Natives', rule: '10.B.4', line: 'Natives you strike hit back in the same round.',
          text: 'Natives you strike surprise you back: the whole group fights you in the same round, not the next.' },
    ] },
    { title: 'Characters', items: [
        { k: 'knightsAdjustment', title: "Knights’ Adjustment", rule: '10.A.6.8', line: 'Tames the Knights’ trading edge: their allies are only Friendly.',
          text: 'The White Knight is only Friendly with the Order, and the Black Knight Friendly with the Company, instead of Allies. It tames their trading advantage.' },
    ] },
];

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
        ...OPTION_GROUPS.flatMap(grp => [sect(grp.title),
            ...grp.items.map(o => switchRow({ title: o.title, line: o.line, on: !!g.options[o.k], attrs: { 'data-option': o.k }, info: `Rule ${o.rule}. ${o.text}`, onToggle: () => { g.options[o.k] = !g.options[o.k]; redraw(); } }))]),
        h('p', { class: 'ds-why ds-fixed' }, 'The printed rules are the default. These cannot be changed once the game has begun.')];
}

export function newGameScreen(ctx) {
    const g = ctx.newGame ?? (ctx.newGame = defaultGame());
    const root = h('main', { class: 'screen ds-screen ds-title flush newgame', 'data-screen': 'newgame' });
    // The portrait strip scrolls sideways (sixteen characters): keep the chosen one in view
    const centreChosen = r => { const strip = r.querySelector('.ds-portraits'), on = strip?.querySelector('.ds-portrait.on'); if (strip && on) strip.scrollLeft += on.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - on.offsetWidth) / 2; };
    const redraw = () => { if (!root.isConnected && root.dataset.mounted) return; root.replaceChildren(...build()); centreChosen(root); const body = root.querySelector('.ds-scroll'); if (body && g._scroll) body.scrollTop = g._scroll; };
    const online = ctx.onlineIntent ?? null;                     // set by the Play online screen: this wizard is choosing a seat in a race, or opening / joining a shared table
    const first = online && online.mode !== 'create' ? 2 : 0;    // someone joining takes the game's rules and only chooses a character and goals
    const kindOf = () => online?.kind === 'shared' ? 'shared' : 'race';
    if (online && !g._online) {
        g._online = true;
        g._shared = kindOf() === 'shared';
        if (g._shared) g.options = { ...g.options, pvp: false };
        if (online.mode === 'choose') {                               // changing my character in the lobby: the seats are known already
            g.step = first; g.race = { seats: online.seats ?? [], players: [] }; g.mySeat = online.mySeat;
            if (online.current) { g.character = online.current; const cc = CHARACTERS.find(c => c.id === g.character); if (cc && !cc.starts.includes(g.dwelling)) g.dwelling = cc.starts[0]; }
        }
        if (online.mode === 'join') {
            g.step = first; g.loading = true; g.note = 'Looking up the game…';
            peekRace(online.server, online.invite).then(r => {
                g.loading = false; g.note = null; g.race = r;
                online.kind = r.kind === 'shared' ? 'shared' : 'race'; g._shared = online.kind === 'shared';
                g.options = { ...g.options, ...r.options };
                if (r.mode === 'sudden') g.length = 'sudden'; else if (r.mode === 'endless') g.length = 'endless'; else if (r.lastDay === 28) g.length = 'month'; else { g.length = 'custom'; g.weeks = Math.round(r.lastDay / 7); }
                if (g._shared) {                                      // start from a character nobody holds
                    const free = CHARACTERS.find(c => !takenBy(g, c.id)); if (free) { g.character = free.id; g.dwelling = free.starts[0]; }
                    if (r.status && r.status !== 'lobby') g.note = 'That game has already started: nobody joins late.';
                }
                redraw();
            }).catch(e => { g.loading = false; g.note = e.message; redraw(); });
        }
    }
    if (online && g.step < first) g.step = first;
    const back = () => {
        if (g.step <= first) {
            if (online?.mode === 'choose') ctx.go('sharedlobby', { game: online.game });
            else ctx.go(online ? 'online' : 'title', online ? { message: '' } : {});
        } else { g.step -= 1; g._scroll = 0; redraw(); }
    };
    // the goals must add up to the length's budget (rule 3.3.6a): the quick start, which skips the goals page, spreads it for you
    const fitVp = () => {
        const total = vpTotal(g);
        if (Object.values(g.vp).reduce((a, b) => a + b, 0) === total) return;
        const fame = Math.min(5, Math.ceil(total * 0.6));
        g.vp = { great: 0, spells: 0, fame, notoriety: Math.min(5, total - fame), gold: Math.max(0, total - fame - Math.min(5, total - fame)) };
    };
    const spellsOf = () => (CHARACTERS.find(c => c.id === g.character)?.spells && Array.isArray(g.spells)) ? [...g.spells] : undefined;
    const start = () => {
        fitVp();
        const lastDay = g.length === 'custom' ? g.weeks * 7 : 28;
        if (online) { startOnline(lastDay); return; }
        const params = { fresh: true, character: g.character, vp: { ...g.vp }, options: { ...g.options }, startDwelling: g.dwelling, startSpells: spellsOf(), lastDay, mode: g.length === 'sudden' ? 'sudden' : g.length === 'endless' ? 'endless' : 'month', seed: g.seed };
        ctx.newGame = null;                                           // the next new game starts from the defaults, with a realm of its own
        ctx.go('game', params);
    };
    async function startOnline(lastDay) {
        const choices = { character: g.character, vp: { ...g.vp }, startDwelling: g.dwelling, startSpells: spellsOf() };
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
    const next = () => { if (g.step < STEPS.length - 1) { g.step += 1; g._scroll = 0; redraw(); } };

    const title = () => !online ? 'New game' : online.mode === 'choose' ? 'Your character' : kindOf() === 'shared' ? (online.mode === 'join' ? 'Join the shared game' : 'Start a shared game') : (online.mode === 'join' ? 'Join the race' : 'Start a race');
    const goLabel = () => !online ? 'Start the game' : online.mode === 'choose' ? 'Save my choice' : online.mode === 'join' ? 'Take my seat' : kindOf() === 'shared' ? 'Open the table' : 'Start the race';

    // what stops the primary, said in words next to it (a dim button with its reason on screen)
    function blocker() {
        const who = CHARACTERS.find(c => c.id === g.character);
        if (g.loading || g.busy) return null;
        if (g.step === 2 && who?.spells && (g.spells ?? []).length !== who.spells.n) return `Spells ${(g.spells ?? []).length} of ${who.spells.n}: choose ${who.spells.n - (g.spells ?? []).length === 1 ? 'one more' : `${who.spells.n - (g.spells ?? []).length} more`}.`;
        if (g.step === STEPS.length - 1) {
            const used = Object.values(g.vp).reduce((a, b) => a + b, 0), total = vpTotal(g);
            if (used !== total) return `${total - used > 0 ? `${total - used} point${total - used === 1 ? '' : 's'} left to spend` : `${used - total} point${used - total === 1 ? '' : 's'} too many`}.`;
            if (online?.mode === 'join' && g.race?.status && g.race.status !== 'lobby') return 'That game has already started.';
        }
        return null;
    }
    const goalsLine = () => GOAL_ORDER.filter(k => g.vp[k]).map(k => `${g.vp[k]}\u00A0${VP_ROWS.find(r => r.k === k).label.replace('Great treasures', 'Great treasure')}`).join(', ');

    function build() {
        const last = g.step === STEPS.length - 1, n = STEPS.length - first, at = g.step - first + 1;
        const who = CHARACTERS.find(c => c.id === g.character);
        const shared = kindOf() === 'shared';
        const bodyEls = g.step === 0 ? typeStep(g, redraw) : g.step === 1 ? realmStep(g, redraw, ctx.go, ctx, { shared: shared && online?.mode === 'create', online: !!online })
            : g.step === 2 ? charsStep(g, redraw, online?.mode === 'join' && g.race ? `${summary(g)} \u00b7 with ${g.race.players.join(', ')}${g.race.open ? ` \u00b7 ${g.race.open === 1 ? 'one seat' : `${g.race.open} seats`} open` : ''}` : null) : goalsStep(g, redraw, !!online);            // (first: the spell picker settles g.spells, which the primary's reason reads)
        const stop = blocker(), busy = g.loading || g.busy;
        // left slot: Quick start on step 1, a counter or summary where there is one, else Back
        let leftEl;
        if (g.note) leftEl = sum(g.note);
        else if (stop) leftEl = sum(h('b', { class: 'bad' }, stop));
        else if (g.step === 2 && who?.spells) leftEl = sum(h('b', { class: 'gold' }, `Spells ${(g.spells ?? []).length} of ${who.spells.n}`));
        else if (last) leftEl = sum('Goals:\u00A0', h('b', {}, goalsLine() || 'none'));
        else if (online?.mode === 'join' && g.race) leftEl = sum(`${summary(g)} · with ${g.race.players.join(', ')}${g.race.open ? ` · ${g.race.open === 1 ? 'one seat' : `${g.race.open} seats`} open` : ''}`);
        else if (g.step === 0 && !online) leftEl = h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'quick', onclick: start }, 'Quick start');
        else leftEl = h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'back', onclick: back }, 'Back');
        const primary = h('button', { type: 'button', class: 'ds-btn primary', 'data-act': last ? 'start' : 'next', disabled: busy || stop ? true : null, onclick: last ? start : next }, last ? goLabel() : 'Next');
        return [bar(title(), { onBack: back, step: at, of: n }),
            h('div', { class: 'ds-scroll ds-fade-b ds-pad ds-wizbody', 'data-step': STEPS[g.step].id, onscroll: e => { g._scroll = e.target.scrollTop; } }, ...bodyEls),
            foot(leftEl, primary)];
    }
    root.append(...build());
    root.dataset.mounted = '1';
    return root;
}
