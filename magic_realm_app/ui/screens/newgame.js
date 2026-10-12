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

export const defaultGame = () => ({ step: 0, length: 'month', weeks: 4, suddenVp: 5, depth: 'magic', dwelling: 'Inn', gearWeapon: false, gearArmor: true, vp: { great: 0, spells: 0, fame: 3, notoriety: 2, gold: 0 } });

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
    realm: ['The realm: the original game (others later)', 'Rules preset: Standard / Advanced / Custom', 'Optional rules sit behind a Rules list, not on this page'],
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

const DWELLINGS = [
    { id: 'Inn', rel: 'Rogues: neutral', line: 'The rules\' start. The Rogues sell workhorses and trinkets; no weapons.' },
    { id: 'House', rel: 'Soldiers: friendly', line: 'Soldiers sell helmets, shields, short swords, thrusting swords and staves.' },
    { id: 'Chapel', rel: 'Order: neutral', line: 'The Order sells suits of armor, warhorses, crossbows, great swords, great axes and morning stars.' },
    { id: 'Guard house', rel: 'Guard: enemy', line: 'The Guard keep the only Maces, broadswords and axes, and they are your enemies.' },
];
const toggle = (label, on, set) => h('button', { class: `choice${on ? ' on' : ''}`, role: 'switch', 'aria-checked': on, 'data-gear': label, onclick: () => set(!on) },
    h('span', { class: 'dot' }), h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, label, h('em', {}, on ? 'given' : 'trade for it'))));

function charsStep(g, redraw, ctx) {
    const total = vpTotal(g), used = Object.values(g.vp).reduce((a, b) => a + b, 0);
    return [
        h('h2', { class: 'q' }, 'Your character'),
        h('div', { class: 'choices' },
            h('div', { class: 'choice on' }, h('span', { class: 'dot' }), h('span', { class: 'choice-main' },
                h('span', { class: 'choice-title' }, 'Black Knight', h('em', {}, 'Medium weight')),
                h('span', { class: 'choice-line' }, 'Allied with the Company, friendly with Soldiers; the Guard are his enemies. Fear: one die on the Meeting Table.')))),
        h('p', { class: 'hint' }, 'More characters will come; this build plays the Black Knight.'),
        h('h2', { class: 'q' }, 'Where do you start?'),
        h('p', { class: 'hint' }, 'The rules give the Black Knight the Inn. Any other dwelling is a variant: you may start where the natives suit you.'),
        h('div', { class: 'choices', role: 'radiogroup' }, ...DWELLINGS.map(d => h('button', { class: `choice${g.dwelling === d.id ? ' on' : ''}`, role: 'radio', 'aria-checked': g.dwelling === d.id, 'data-dwelling': d.id,
            onclick: () => { g.dwelling = d.id; redraw(); } },
            h('span', { class: 'dot' }),
            h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, d.id, h('em', {}, d.rel)), h('span', { class: 'choice-line' }, d.line))))),
        h('h2', { class: 'q' }, 'Your gear'),
        h('p', { class: 'hint' }, 'The rules hand the Black Knight his Mace, Suit of Armor and Shield from the natives\' stock. Switch one off and you must trade for it (or win it).'),
        toggle('Mace', g.gearWeapon, v => { g.gearWeapon = v; redraw(); }),
        toggle('Suit of Armor and Shield', g.gearArmor, v => { g.gearArmor = v; redraw(); }),
        h('h2', { class: 'q' }, `Spend your ${total} victory points`),
        h('p', { class: 'hint' }, 'Each point sets a goal. Miss a goal and the shortfall counts triple; beat it and each point you put there pays a bonus.'),
        ...VP_ROWS.map(r => h('div', { class: 'vprow' },
            h('div', { class: 'vp-l' }, h('b', {}, r.label), h('small', {}, g.vp[r.k] ? `goal: ${g.vp[r.k] * r.unit} ${r.what}` : 'no goal')),
            stepper(g.vp[r.k], () => 'points', 0, Math.min(5, g.vp[r.k] + (total - used)), v => { g.vp[r.k] = v; redraw(); }))),
        h('p', { class: used === total ? 'hint' : 'hint bad' }, used === total ? 'All points spent.' : `${total - used} point${total - used === 1 ? '' : 's'} left to spend.`),
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
        ctx.go('game', { fresh: true, character: 'black-knight', vp: { ...g.vp }, startDwelling: g.dwelling, startGear: { weapon: g.gearWeapon, armor: g.gearArmor }, lastDay, mode: g.length === 'sudden' ? 'sudden' : g.length === 'endless' ? 'endless' : 'month' });
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
            h('div', { class: 'body', onscroll: e => { g._scroll = e.target.scrollTop; } }, g.step === 0 ? typeStep(g, redraw) : g.step === STEPS.length - 1 ? charsStep(g, redraw, ctx) : outline(g.step, ctx.go)),
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
