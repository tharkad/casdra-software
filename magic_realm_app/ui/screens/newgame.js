import { h } from '../dom.js';

// New game: a five-step wizard. Step 1 (game type) is real; later steps are outlined until their rules are digitised.
// Everything here is a *choice about the rules*, so the facts come from docs/rules/01 and 06 (see the notes beside each option).

export const STEPS = [
    { id: 'type', label: 'Game type' },
    { id: 'table', label: 'Table' },
    { id: 'realm', label: 'Realm and rules' },
    { id: 'map', label: 'Map' },
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
        h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Game length' }, LENGTHS.map(o => lengthCard(g, o, redraw))),
        h('h2', { class: 'q' }, 'How much of the game?'),
        h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Rules depth' },
            DEPTHS.map(d => h('button', { class: `seg-btn${d.id === g.depth ? ' on' : ''}`, role: 'radio', 'aria-checked': d.id === g.depth, 'data-depth': d.id,
                onclick: () => { g.depth = d.id; redraw(); } }, d.label))),
        h('p', { class: 'depth-text' }, depth.text),
    ];
}

// What each later step will decide, from docs/rules/06 section 9.1. Shown as an outline until built.
const OUTLINES = {
    table: ['Solo: one phone, you play every character', 'Pass and play: several players share a phone, hidden choices stay hidden',
        'Host online: a game server keeps secrets safe', 'Play by mail: take your turn when you can'],
    realm: [],
    map: ['Build the map for me, or build it together', 'Seasons and weather as one switch', 'Several boards for a bigger realm (later)'],
    // `preview` below adds a button for this step
    chars: ['Pick a character and level', 'Pick a starting dwelling', 'Spread the victory points across the five goals'],
};

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
};
export const CHARACTERS = [
    { id: 'black-knight', name: 'Black Knight', weight: 'Medium weight', starts: ['Inn'], gear: 'Mace, Suit of Armor and Shield',
      line: 'Allied with the Company, friendly with Soldiers; the Guard are his enemies. Fear: one die on the Meeting Table. Aim with missiles.' },
    { id: 'white-knight', name: 'White Knight', weight: 'Heavy weight', starts: ['Inn', 'Chapel'], gear: 'Great Sword and Suit of Armor',
      line: 'Allied with the Order, friendly with Lancers; the Company are his enemies. Health: an extra Rest phase a day. Honor: one less on every Meeting die. His Type I spell cannot be cast in this build yet.' },
];

function charsStep(g, redraw, ctx) {
    const total = vpTotal(g), used = Object.values(g.vp).reduce((a, b) => a + b, 0);
    const who = CHARACTERS.find(c => c.id === g.character) ?? CHARACTERS[0];
    return [
        h('h2', { class: 'q' }, 'Your character'),
        h('div', { class: 'choices', role: 'radiogroup' }, ...CHARACTERS.map(c => h('button', { class: `choice${g.character === c.id ? ' on' : ''}`, role: 'radio', 'aria-checked': g.character === c.id, 'data-char': c.id,
            onclick: () => { g.character = c.id; if (!c.starts.includes(g.dwelling)) g.dwelling = c.starts[0]; redraw(); } },
            h('span', { class: 'dot' }),
            h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, c.name, h('em', {}, c.weight)), h('span', { class: 'choice-line' }, c.line))))),
        h('p', { class: 'hint' }, `He begins with his ${who.gear}, taken from the natives' stock as the rules say. More characters will come.`),
        h('img', { class: 'cardpic', src: `art/characterdetail/${who.id.replace('-', '_')}.jpg`, alt: `${who.name} character card`, onerror: e => e.target.remove() }),
        h('h2', { class: 'q' }, who.starts.length > 1 ? 'Where do you start?' : 'Where he starts'),
        h('div', { class: 'choices', role: 'radiogroup' }, ...who.starts.map(d => h('button', { class: `choice${g.dwelling === d ? ' on' : ''}`, role: 'radio', 'aria-checked': g.dwelling === d, 'data-dwelling': d,
            onclick: () => { g.dwelling = d; redraw(); } },
            h('span', { class: 'dot' }),
            h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, d), h('span', { class: 'choice-line' }, DWELLING_LINE[d]))))),
        who.starts.length === 1 ? h('p', { class: 'hint' }, `The ${who.name} has only the ${who.starts[0]} on his character card.`) : null,
        h('h2', { class: 'q' }, `Spend your ${total} victory points`),
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

function optionsStep(g, redraw) {
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
    ];
}

function outline(step, go) {
    return [
        h('h2', { class: 'q' }, STEPS[step].label),
        h('div', { class: 'note' }, 'Not built yet. This step will cover:'),
        h('ul', { class: 'outline' }, OUTLINES[STEPS[step].id].map(t => h('li', {}, t))),
        STEPS[step].id === 'map' ? h('button', { class: 'btn', 'data-act': 'preview', onclick: () => go('realm') }, 'Preview a generated realm') : null,
    ];
}

export function newGameScreen(ctx) {
    const g = ctx.newGame ?? (ctx.newGame = defaultGame());
    const root = h('main', { class: 'screen newgame', 'data-screen': 'newgame' });
    const redraw = () => { root.replaceChildren(...build()); const body = root.querySelector('.body'); if (body && g._scroll) body.scrollTop = g._scroll; };
    const back = () => { if (g.step === 0) { ctx.go('title'); } else { g.step -= 1; redraw(); } };
    const start = () => {
        const lastDay = g.length === 'custom' ? g.weeks * 7 : 28;
        ctx.go('game', { fresh: true, character: g.character, vp: { ...g.vp }, options: { ...g.options }, startDwelling: g.dwelling, lastDay, mode: g.length === 'sudden' ? 'sudden' : g.length === 'endless' ? 'endless' : 'month' });
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
            h('div', { class: 'body', onscroll: e => { g._scroll = e.target.scrollTop; } }, g.step === 0 ? typeStep(g, redraw) : g.step === STEPS.length - 1 ? charsStep(g, redraw, ctx) : STEPS[g.step].id === 'realm' ? optionsStep(g, redraw) : outline(g.step, ctx.go)),
            h('footer', { class: 'dock' },
                h('div', { class: 'sum' }, summary(g)),
                h('button', { class: 'btn primary big', 'data-act': last ? 'start' : 'next', disabled: last && Object.values(g.vp).reduce((a, b) => a + b, 0) !== vpTotal(g), onclick: last ? start : next },
                    last ? 'Start the game' : `Next: ${STEPS[g.step + 1].label}`),
                g.step === 0 ? h('button', { class: 'btn', 'data-act': 'quick', onclick: start }, 'Start now with the defaults') : null),
        ];
    }
    root.append(...build());
    return root;
}
