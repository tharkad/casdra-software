import { h } from '../dom.js';
import { ask } from '../ask.js';
import { ATTACK_SPELLS } from '../../engine/spells.js';

// New game: a three-step wizard (game type, optional rules, character and goals).
// Everything here is a *choice about the rules*, so the facts come from docs/rules/01 and 06 (see the notes beside each option).

export const STEPS = [
    { id: 'type', label: 'Game type' },
    { id: 'realm', label: 'Realm and rules' },
    { id: 'chars', label: 'Characters' },
];

// How long / how it ends. A month is 4 weeks = 28 days; victory points to spend = weeks + 1 (3rd ed. 10.E.2).
export const LENGTHS = [
    { id: 'month', title: 'A month', line: 'The standard game: four weeks, 28 days.', badge: () => '28 days · 5 VP' },
    { id: 'custom', title: 'Choose the length', line: 'Any whole number of weeks.', badge: g => `${g.weeks * 7} days · ${g.weeks + 1} VP` },
    { id: 'sudden', title: 'Sudden death', line: 'Ends at the first midnight when someone has met every one of their goals.', badge: g => `${g.suddenVp} VP` },
    { id: 'endless', title: 'Endless', line: 'No end and no scoring. Play until you stop.', badge: () => 'no limit' },
];

// How much of the game is switched on. The second edition taught the game in four steps; the third edition suggests the same ramp.
export const DEPTHS = [
    { id: 'explore', label: 'Explore', text: 'Move, hide, search, trade and rest. Monsters and natives appear, but nobody fights, and there are no spells.' },
    { id: 'fight', label: 'Fight', text: 'Adds the Alert action, evening combat, weapons and armour.' },
    { id: 'war', label: 'War', text: 'Adds hired natives, following, and fights between characters and with natives.' },
    { id: 'magic', label: 'Magic', text: 'The whole game: magic chits, spells, enchanting and the colours of magic.' },
];

export const defaultGame = () => ({ step: 0, length: 'month', weeks: 4, suddenVp: 5, depth: 'magic', character: 'white-knight', dwelling: 'Inn', vp: { great: 0, spells: 0, fame: 3, notoriety: 2, gold: 0 }, options: { knightsAdjustment: false, watchfulNatives: false, quietMonsters: false } });

export const vpTotal = g => g.length === 'month' ? 5 : g.length === 'custom' ? g.weeks + 1 : g.length === 'sudden' ? g.suddenVp : 5;

export function summary(g) {
    const len = g.length === 'month' ? '28 days' : g.length === 'custom' ? `${g.weeks} week${g.weeks === 1 ? '' : 's'}`
        : g.length === 'sudden' ? 'Sudden death' : 'Endless';
    const vp = g.length === 'month' ? '5 VP' : g.length === 'custom' ? `${g.weeks + 1} VP` : g.length === 'sudden' ? `${g.suddenVp} VP` : 'no scoring';
    return `${len} · ${vp} · ${DEPTHS.find(d => d.id === g.depth).label}`;
}

const stepper = (value, unit, min, max, set) => h('div', { class: 'stepper' },
    h('button', { class: 'step-btn', 'aria-label': 'Fewer', disabled: value <= min, onclick: e => { e.stopPropagation(); set(value - 1); } }, '−'),
    h('div', { class: 'step-val' }, h('b', {}, String(value)), h('span', {}, unit(value))),
    h('button', { class: 'step-btn', 'aria-label': 'More', disabled: value >= max, onclick: e => { e.stopPropagation(); set(value + 1); } }, '+'));

function lengthCard(g, opt, redraw) {
    const on = g.length === opt.id;
    return h('button', { class: `choice${on ? ' on' : ''}`, role: 'radio', 'aria-checked': on, 'data-length': opt.id, onclick: () => { g.length = opt.id; redraw(); } },
        h('span', { class: 'dot' }),
        h('span', { class: 'choice-main' },
            h('span', { class: 'choice-title' }, opt.title, h('em', {}, opt.badge(g))),
            h('span', { class: 'choice-line' }, opt.line),
            on && opt.id === 'custom' ? h('span', { class: 'choice-extra' },
                stepper(g.weeks, w => (w === 1 ? 'week' : 'weeks'), 1, 12, v => { g.weeks = v; redraw(); }),
                h('span', { class: 'hint' }, `${g.weeks + 1} victory points to spend: one for each week, plus one.`)) : null,
            on && opt.id === 'sudden' ? h('span', { class: 'choice-extra' },
                stepper(g.suddenVp, () => 'victory points', 1, 12, v => { g.suddenVp = v; redraw(); }),
                h('span', { class: 'hint' }, 'The points you spread over Great Treasures, Spells, Fame, Notoriety and Gold.')) : null));
}

function typeStep(g, redraw) {
    const depth = DEPTHS.find(d => d.id === g.depth);
    return [
        h('h2', { class: 'q' }, 'How long is the game?'),
        ask('Choose how long you will play.', 'The length decides when the game ends and how many victory points you get to spend on goals in the last step: one for each week, plus one.', { compact: true }),
        h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Game length' }, LENGTHS.map(o => lengthCard(g, o, redraw))),
        h('h2', { class: 'q' }, 'How much of the game?'),
        h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Rules depth' },
            DEPTHS.map(d => h('button', { class: `seg-btn${d.id === g.depth ? ' on' : ''}`, role: 'radio', 'aria-checked': d.id === g.depth, 'data-depth': d.id,
                onclick: () => { g.depth = d.id; redraw(); } }, d.label))),
        h('p', { class: 'depth-text' }, depth.text),
        ask('Every game uses all the rules for now.', 'This switch is kept for a later version that will teach the game in steps; changing it does not change how this game plays.', { compact: true }),
    ];
}

const VP_ROWS = [
    { k: 'great', label: 'Great treasures', unit: 1, what: 'treasures' },
    { k: 'spells', label: 'Spells', unit: 2, what: 'spells' },
    { k: 'fame', label: 'Fame', unit: 10, what: 'Fame' },
    { k: 'notoriety', label: 'Notoriety', unit: 20, what: 'Notoriety' },
    { k: 'gold', label: 'Gold', unit: 30, what: 'gold above your starting worth' },
];

// The characters this build can play. Where each may begin is on his card (rules 3.3.5): the Black Knight has the Inn only, the White Knight
// the Inn or the Chapel. Gear is always the stage-4 weapon and armor, taken from the natives' stock (3.3.2).
const DWELLING_LINE = {
    Inn: 'The Rogues live here: they sell workhorses and trinkets.',
    Chapel: 'The Order live here: they sell suits of armor, warhorses, crossbows, great swords, great axes and morning stars.',
    House: 'The Soldiers live here, and they dislike her. The Woodfolk may turn up on a day their row prowls.',
};
// Each card file is named by its picture; the cards that do not follow the id are listed.
const CARD_FILE = { 'woods-girl': 'woodsgirl' };
export const CHARACTERS = [
    { id: 'black-knight', name: 'Black Knight', weight: 'Medium weight', starts: ['Inn'], gear: 'Mace, Suit of Armor and Shield',
      line: 'Allied with the Company, friendly with Soldiers; the Guard are his enemies. Fear: one die on the Meeting Table. Aim with missiles.' },
    { id: 'white-knight', name: 'White Knight', weight: 'Heavy weight', starts: ['Inn', 'Chapel'], gear: 'Great Sword and Suit of Armor', spells: { n: 1, types: ['I'] },
      line: 'Allied with the Order, friendly with Lancers; the Company are his enemies. Health: an extra Rest phase a day. Honor: one less on every Meeting die. His Type I spell is Make Whole: cast in the evening where there is White magic (a Chapel, or day 7).' },
    { id: 'wizard', name: 'Wizard', weight: 'Medium weight', starts: ['Inn', 'House', 'Guard house'], gear: 'Staff', spells: { n: 2, types: ['II', 'III', 'IV'] },
      line: 'Friendly with the Woodfolk, Patrol, Soldiers and Guard; the Company, Bashkars and Warlock are against him, the Lancers his enemies. Lore: one die when Reading Runes. Experience: knows every hidden path and secret passage. Starts with two spells of Types II to IV.' },
    { id: 'woods-girl', name: 'Woods Girl', weight: 'Light weight', starts: ['Inn', 'House'], gear: 'Light Bow', her: true, spells: { n: 1, types: ['VII'] },
      line: 'Allied with the Woodfolk, friendly with Lancers; the Bashkars are her enemies. Tracking: one die on Hide, Search and Meeting in the six Woods tiles. Archer: one die on the Missile Table with a bow. Her Type VII spell cannot be cast in this build yet.' },
];

// The spell list for the starting-spell picker, fetched once.
let SPELLS = null;
function spellChooser(g, who, redraw) {
    if (!who.spells) return [];
    if (!SPELLS) {
        fetch('data/spells.json').then(r => r.json()).then(j => { SPELLS = j.spells; redraw(); }).catch(() => { SPELLS = []; });
        return [h('p', { class: 'hint' }, 'Loading the spell list...')];
    }
    const pool = SPELLS.filter(sp => who.spells.types.includes(sp.type));
    const castNow = sp => !!(sp.implemented || ATTACK_SPELLS[sp.id]);
    if (!Array.isArray(g.spells) || g.spellsFor !== who.id) { g.spells = pool.filter(castNow).slice(0, who.spells.n).map(sp => sp.id); g.spellsFor = who.id; }
    const chosen = g.spells;
    return [
        h('h2', { class: 'q' }, `Your starting spell${who.spells.n === 1 ? '' : 's'}`),
        ask(`Choose ${who.spells.n} spell${who.spells.n === 1 ? '' : 's'} of Type ${who.spells.types.join(', ')}.`, 'These are written on your sheet from the start. Spells are cast in the evening, in the Encounter step of a fight, while the spell\'s colour of magic is present. Ones marked "not castable yet" can be chosen but have no effect in this build.', { compact: true }),
        h('div', { class: 'choices' }, ...pool.map(sp => {
            const on = chosen.includes(sp.id);
            return h('button', { class: `choice${on ? ' on' : ''}`, role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'data-spell': sp.id,
                onclick: () => {
                    if (on) g.spells = chosen.filter(x => x !== sp.id);
                    else g.spells = [...chosen, sp.id].slice(-who.spells.n);
                    redraw();
                } },
                h('span', { class: 'dot' }),
                h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, sp.name, h('em', {}, `Type ${sp.type} \u00B7 ${sp.color ?? 'any'}`)),
                    h('span', { class: 'choice-line' }, `${sp.duration}${castNow(sp) ? ' \u00B7 castable' : ' \u00B7 not castable yet'}`)));
        })),
        chosen.length === who.spells.n ? null : h('p', { class: 'hint bad' }, `Choose ${who.spells.n - chosen.length} more.`),
    ].filter(Boolean);
}

function charsStep(g, redraw, ctx) {
    const total = vpTotal(g), used = Object.values(g.vp).reduce((a, b) => a + b, 0);
    const who = CHARACTERS.find(c => c.id === g.character) ?? CHARACTERS[0];
    return [
        h('h2', { class: 'q' }, 'Your character'),
        ask('Choose who you will play and where the first day begins.', 'Each character has different chits, gear and friends among the natives. The starting place decides who is near you on day 1.', { compact: true }),
        h('div', { class: 'choices', role: 'radiogroup' }, ...CHARACTERS.map(c => h('button', { class: `choice${g.character === c.id ? ' on' : ''}`, role: 'radio', 'aria-checked': g.character === c.id, 'data-char': c.id,
            onclick: () => { g.character = c.id; if (!c.starts.includes(g.dwelling)) g.dwelling = c.starts[0]; redraw(); } },
            h('span', { class: 'dot' }),
            h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, c.name, h('em', {}, c.weight)), h('span', { class: 'choice-line' }, c.line))))),
        h('p', { class: 'hint' }, `${who.her ? 'She begins with her' : 'He begins with his'} ${who.gear}, taken from the natives' stock as the rules say. More characters will come.`),
        h('img', { class: 'cardpic', src: `art/characterdetail/${CARD_FILE[who.id] ?? who.id.replace('-', '_')}.jpg`, alt: `${who.name} character card`, onerror: e => e.target.remove() }),
        h('h2', { class: 'q' }, who.starts.length > 1 ? 'Where do you start?' : `Where ${who.her ? 'she' : 'he'} starts`),
        h('div', { class: 'choices', role: 'radiogroup' }, ...who.starts.map(d => h('button', { class: `choice${g.dwelling === d ? ' on' : ''}`, role: 'radio', 'aria-checked': g.dwelling === d, 'data-dwelling': d,
            onclick: () => { g.dwelling = d; redraw(); } },
            h('span', { class: 'dot' }),
            h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, d), h('span', { class: 'choice-line' }, DWELLING_LINE[d]))))),
        who.starts.length === 1 ? h('p', { class: 'hint' }, `The ${who.name} has only the ${who.starts[0]} on ${who.her ? 'her' : 'his'} character card.`) : null,
        ...spellChooser(g, who, redraw),
        h('h2', { class: 'q' }, `Spend your ${total} victory points`),
        ask('Set the goals you will be scored against.', 'You must spend every point. Points on a goal raise what you need to reach; the bigger the goal you meet, the bigger the bonus.', { compact: true }),
        h('p', { class: 'hint' }, 'Each point sets a goal. Miss a goal and the shortfall counts triple; beat it and each point you put there pays a bonus.'),
        ...VP_ROWS.map(r => h('div', { class: 'vprow' },
            h('div', { class: 'vp-l' }, h('b', {}, r.label), h('small', {}, g.vp[r.k] ? `goal: ${g.vp[r.k] * r.unit} ${r.what}` : 'no goal')),
            stepper(g.vp[r.k], () => 'points', 0, Math.min(5, g.vp[r.k] + (total - used)), v => { g.vp[r.k] = v; redraw(); }))),
        h('p', { class: used === total ? 'hint' : 'hint bad' }, used === total ? 'All points spent.' : `${total - used} point${total - used === 1 ? '' : 's'} left to spend.`),
    ].filter(Boolean);
}

// Optional rules (3.1 section 10). Everything is off until switched on, as printed; each rule names its section.
const OPTION_GROUPS = [
    { title: 'Characters (rule 10.A.6)', items: [
        { k: 'knightsAdjustment', title: "Knights' Adjustment", rule: '10.A.6.8',
          text: 'The White Knight is only Friendly with the Order, and the Black Knight Friendly with the Company, instead of Allies. It tames their trading advantage.',
          relevant: g => g.character === 'white-knight' || g.character === 'black-knight' },
    ] },
    { title: 'Denizens (rule 10.B)', items: [
        { k: 'quietMonsters', title: 'Quiet Monsters', rule: '10.B.1', text: 'A character who is hidden when his turn ends does not turn up the chits in his tile, and monsters from the Appearance Chart do not come.' },
        { k: 'watchfulNatives', title: 'Watchful Natives', rule: '10.B.4', text: 'Natives you strike surprise you back: the whole group fights you in the same round, not the next.' },
    ] },
];

function optionsStep(g, redraw, go) {
    g.options ??= {};
    return [
        h('h2', { class: 'q' }, 'Optional rules'),
        h('p', { class: 'hint' }, 'The printed rules are the default. Switch on only what you want; you cannot change these once the game has begun.'),
        ...OPTION_GROUPS.flatMap(grp => [
            h('h3', { class: 'optgroup' }, grp.title),
            ...grp.items.map(o => h('button', { class: `choice${g.options[o.k] ? ' on' : ''}`, role: 'switch', 'aria-checked': g.options[o.k] ? 'true' : 'false', 'data-option': o.k,
                onclick: () => { g.options[o.k] = !g.options[o.k]; redraw(); } },
                h('span', { class: 'dot' }),
                h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, o.title, h('em', {}, `rule ${o.rule}`)),
                    h('span', { class: 'choice-line' }, o.text),
                    o.relevant && !o.relevant(g) ? h('span', { class: 'choice-line' }, 'No effect for the character you have chosen.') : null))),
        ]),
        h('h3', { class: 'optgroup' }, 'The realm'),
        h('p', { class: 'hint' }, 'The map is laid out for you from a random seed when the game begins.'),
        h('button', { class: 'btn', 'data-act': 'preview', onclick: () => go('realm') }, 'Preview a generated realm'),
    ];
}

export function newGameScreen(ctx) {
    const g = ctx.newGame ?? (ctx.newGame = defaultGame());
    const root = h('main', { class: 'screen newgame', 'data-screen': 'newgame' });
    const redraw = () => { root.replaceChildren(...build()); const body = root.querySelector('.body'); if (body && g._scroll) body.scrollTop = g._scroll; };
    const back = () => { if (g.step === 0) { ctx.go('title'); } else { g.step -= 1; redraw(); } };
    const start = () => {
        const lastDay = g.length === 'custom' ? g.weeks * 7 : 28;
        ctx.go('game', { fresh: true, character: g.character, vp: { ...g.vp }, options: { ...g.options }, startDwelling: g.dwelling, startSpells: (CHARACTERS.find(c => c.id === g.character)?.spells && Array.isArray(g.spells)) ? [...g.spells] : undefined, lastDay, mode: g.length === 'sudden' ? 'sudden' : g.length === 'endless' ? 'endless' : 'month' });
    };
    const next = () => { if (g.step < STEPS.length - 1) { g.step += 1; g._scroll = 0; redraw(); } };

    function build() {
        const last = g.step === STEPS.length - 1;
        return [
            h('header', { class: 'bar' },
                h('button', { class: 'back', 'aria-label': 'Back', onclick: back }, '‹'),
                h('h1', {}, 'New game')),
            h('div', { class: 'progress', 'aria-label': `Step ${g.step + 1} of ${STEPS.length}: ${STEPS[g.step].label}` },
                h('div', { class: 'ticks' }, STEPS.map((s, i) => h('span', { class: `tick${i < g.step ? ' done' : ''}${i === g.step ? ' now' : ''}` }))),
                h('div', { class: 'where' }, h('b', {}, STEPS[g.step].label), h('span', {}, `Step ${g.step + 1} of ${STEPS.length}`))),
            h('div', { class: 'body', onscroll: e => { g._scroll = e.target.scrollTop; } }, g.step === 0 ? typeStep(g, redraw) : g.step === STEPS.length - 1 ? charsStep(g, redraw, ctx) : optionsStep(g, redraw, ctx.go)),
            h('footer', { class: 'dock' },
                h('div', { class: 'sum' }, summary(g)),
                h('button', { class: 'btn primary big', 'data-act': last ? 'start' : 'next', disabled: last && (Object.values(g.vp).reduce((a, b) => a + b, 0) !== vpTotal(g) || (CHARACTERS.find(c => c.id === g.character)?.spells && (g.spells ?? []).length !== CHARACTERS.find(c => c.id === g.character).spells.n)), onclick: last ? start : next },
                    last ? 'Start the game' : `Next: ${STEPS[g.step + 1].label}`),
                g.step === 0 ? h('button', { class: 'btn', 'data-act': 'quick', onclick: start }, 'Start now with the defaults') : null),
        ];
    }
    root.append(...build());
    return root;
}
