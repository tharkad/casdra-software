import { h } from '../dom.js';
import { ask } from '../ask.js';
import { dwellingLine } from '../dwelling_line.js';
import { ATTACK_SPELLS, castable } from '../../engine/spells.js';
import { createRace, joinRace, peekRace, serverUrl } from '../online.js';
import { createShared, joinShared, chooseShared } from '../shared_online.js';

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
// Each card file is named by its picture; the cards that do not follow the id are listed.
const CARD_FILE = { 'woods-girl': 'woodsgirl' };
// `rel`: how each native group takes to him (2 ally, 1 friendly, -1 wary, -2 enemy), as on the character card; `perks`: what sets him apart, in a few words.
export const CHARACTERS = [
    { id: 'black-knight', name: 'Black Knight', weight: 'Medium weight', starts: ['Inn'], gear: 'Mace, Suit of Armor and Shield',
      rel: { Company: 2, Soldiers: 1, Crone: 1, Lancers: -1, Guard: -2 },
      perks: [['Fear', 'One die instead of two on the Meeting Table'], ['Aim', 'Missiles roll one lower on the Missile Table']] },
    { id: 'white-knight', name: 'White Knight', weight: 'Heavy weight', starts: ['Inn', 'Chapel'], gear: 'Great Sword and Suit of Armor', spells: { n: 1, types: ['I'] },
      rel: { Order: 2, Lancers: 1, Bashkars: -1, Crone: -1, Company: -2 },
      perks: [['Health', 'An extra Rest phase every day'], ['Honor', 'One less on every Meeting die'], ['Spell', 'Make Whole: cast in an evening where White magic is (a Chapel, or day 7)']] },
    { id: 'wizard', name: 'Wizard', weight: 'Medium weight', starts: ['Inn', 'House', 'Guard house'], gear: 'Staff', spells: { n: 2, types: ['II', 'III', 'IV'] },
      rel: { Woodfolk: 1, Patrol: 1, Soldiers: 1, Guard: 1, Company: -1, Bashkars: -1, Warlock: -1, Lancers: -2 },
      perks: [['Lore', 'One die when Reading Runes'], ['Experience', 'Knows every hidden path and secret passage'], ['Spells', 'Starts with two, of Types II to IV']] },
    { id: 'sorceror', name: 'Sorcerer', weight: 'Medium weight', starts: ['Inn'], gear: null, spells: { n: 3, types: ['IV', 'VI'] },
      rel: { Lancers: 2, Company: 1, Bashkars: 1, Order: -1, Soldiers: -1, Warlock: -1, Guard: -2 },
      perks: [['Lore', 'One die when Reading Runes'], ['Aura of Power', 'An extra Enchant phase every day'], ['Spellcaster', 'Nine Magic chits and only three to move and fight with: he lives on his spells']] },
    { id: 'woods-girl', name: 'Woods Girl', weight: 'Light weight', starts: ['Inn', 'House'], gear: 'Light Bow', her: true, spells: { n: 1, types: ['VII'] },
      rel: { Woodfolk: 2, Lancers: 1, Soldiers: -1, Warlock: -1, Bashkars: -2 },
      perks: [['Tracking', 'One die on Hide, Search and Meeting in the six Woods tiles'], ['Archer', 'One die on the Missile Table with a bow'], ['Spell', 'Type VII: Control Bats makes every Giant Bat in a fight hers until Sunset tomorrow']] },
];
const REL_LEVELS = [[2, 'Ally', 'ally'], [1, 'Friendly', 'friendly'], [-1, 'Unfriendly', 'wary'], [-2, 'Enemy', 'enemy']];
// One character as a card you can read at a glance: who likes him, what he is good at.
function charBlurb(c) {
    const rows = REL_LEVELS.map(([lv, label, cls]) => ({ label, cls, names: Object.entries(c.rel).filter(([, v]) => v === lv).map(([k]) => k) })).filter(r => r.names.length);
    return [
        h('span', { class: 'relgrid' }, ...rows.map(r => h('span', { class: 'relrow' }, h('i', { class: `relbadge ${r.cls}` }, r.label), h('span', { class: 'relnames' }, r.names.join(', '))))),
        h('ul', { class: 'perks' }, ...c.perks.map(([t, x]) => h('li', {}, h('b', {}, t + ':'), ' ', x))),
    ];
}

// The spell list for the starting-spell picker, fetched once.
let SPELLS = null;
function spellChooser(g, who, redraw) {
    if (!who.spells) return [];
    if (!SPELLS) {
        fetch('data/spells.json').then(r => r.json()).then(j => { SPELLS = j.spells; redraw(); }).catch(() => { SPELLS = []; });
        return [h('p', { class: 'hint' }, 'Loading the spell list...')];
    }
    const pool = SPELLS.filter(sp => who.spells.types.includes(sp.type));
    const castNow = castable;
    if (!Array.isArray(g.spells) || g.spellsFor !== who.id) { g.spells = pool.filter(castNow).slice(0, who.spells.n).map(sp => sp.id); g.spellsFor = who.id; }
    const chosen = g.spells;
    return [
        h('h2', { class: 'q' }, `Your starting spell${who.spells.n === 1 ? '' : 's'}`),
        ask(`Choose ${who.spells.n} spell${who.spells.n === 1 ? '' : 's'} of Type ${who.spells.types.join(', ')}.`, 'These are written on your sheet from the start. Spells are cast in the evening, in the Encounter step of a fight, while the spell\'s colour of magic is present.', { compact: true }),
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

// who holds this character already at a shared table (the seat that is choosing now may keep its own)
const takenBy = (g, id) => (g.race?.seats ?? []).find(x => x.character === id && x.seat !== g.mySeat)?.name ?? null;

function charsStep(g, redraw, ctx) {
    const total = vpTotal(g), used = Object.values(g.vp).reduce((a, b) => a + b, 0);
    const who = CHARACTERS.find(c => c.id === g.character) ?? CHARACTERS[0];
    return [
        h('h2', { class: 'q' }, 'Your character'),
        ask('Choose who you will play and where the first day begins.', 'Each character has different chits, gear and friends among the natives. The starting place decides who is near you on day 1.', { compact: true }),
        h('div', { class: 'choices', role: 'radiogroup' }, ...CHARACTERS.map(c => {
            const by = takenBy(g, c.id);                               // a shared table: no two seats may play the same character
            return h('button', { class: `choice${g.character === c.id ? ' on' : ''}${by ? ' taken' : ''}`, role: 'radio', 'aria-checked': g.character === c.id, 'data-char': c.id, disabled: by ? true : null,
                onclick: () => { g.character = c.id; if (!c.starts.includes(g.dwelling)) g.dwelling = c.starts[0]; redraw(); } },
                h('span', { class: 'dot' }),
                h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, c.name, h('em', {}, by ? `taken by ${by}` : c.weight)), ...(by ? [] : charBlurb(c))));
        })),
        g._shared ? h('p', { class: 'hint', 'data-sealed': '' }, 'Your goals and starting spells are sealed: the others see them only when the game is over.') : null,
        h('p', { class: 'hint' }, who.gear ? `${who.her ? 'She begins with her' : 'He begins with his'} ${who.gear}, taken from the natives' stock as the rules say.` : `${who.her ? 'She' : 'He'} begins with no weapon or armor: buy or find them, or fight with the Fight chit.`),
        h('img', { class: 'cardpic', src: `art/characterdetail/${CARD_FILE[who.id] ?? who.id.replace('-', '_')}.jpg`, alt: `${who.name} character card`, onerror: e => e.target.remove() }),
        h('h2', { class: 'q' }, who.starts.length > 1 ? 'Where do you start?' : `Where ${who.her ? 'she' : 'he'} starts`),
        h('div', { class: 'choices', role: 'radiogroup' }, ...who.starts.map(d => h('button', { class: `choice${g.dwelling === d ? ' on' : ''}`, role: 'radio', 'aria-checked': g.dwelling === d, 'data-dwelling': d,
            onclick: () => { g.dwelling = d; redraw(); } },
            h('span', { class: 'dot' }),
            h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, d), h('span', { class: 'choice-line' }, dwellingLine(d, who)))))),
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

// A SHARED game: how many sit at the table, and whether characters may fight each other. Plain words first; the rule numbers are for those who look.
function tableStep(g, redraw) {
    g.seats ??= 2;
    const pvp = !!g.options.pvp, dayEnd = g.options.dayEnd !== false;
    return [
        h('h2', { class: 'q' }, 'Who is at the table?'),
        ask('Choose how many players will share this realm.', 'Everyone plays one character on one map, in turn. The game starts when every seat is taken and everyone has picked a character; nobody can join late.', { compact: true }),
        h('div', { class: 'seg seats', role: 'radiogroup', 'aria-label': 'Players' }, [2, 3, 4].map(n => h('button', { class: `seg-btn${g.seats === n ? ' on' : ''}`, role: 'radio', 'aria-checked': g.seats === n, 'data-seats': n, onclick: () => { g.seats = n; redraw(); } }, `${n} players`))),
        h('button', { class: `choice${pvp ? ' on' : ''}`, role: 'switch', 'aria-checked': pvp ? 'true' : 'false', 'data-option': 'pvp', onclick: () => { g.options.pvp = !pvp; redraw(); } },
            h('span', { class: 'dot' }),
            h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, 'Players may fight each other', h('em', {}, pvp ? 'on' : 'off')),
                h('span', { class: 'choice-line' }, pvp
                    ? 'On: in the evening a character can charge another player\u2019s character, or name them in the secret plays, and send hirelings against them. Whoever is struck down loses everything to the one who did it: their Notoriety, their gold and all their belongings. They return at the next Birdsong with a new character.'
                    : 'Off: you share the map and the monsters, you race on points, but nobody can attack another player\u2019s character.'),
                h('span', { class: 'choice-line' }, pvp ? 'Turn it on only if everyone at the table has agreed: a death is real, and there is no taking it back once the game has begun.'
                    : 'Turn it on if you want a table where characters can fight, rob and kill each other. It cannot be changed once the game has begun.'))),
        // after the evening's fights, characters standing together may trade before Midnight (a lobby option, on unless the host turns it off: it is kept with the game)
        h('button', { class: `choice${dayEnd ? ' on' : ''}`, role: 'switch', 'aria-checked': dayEnd ? 'true' : 'false', 'data-option': 'dayEnd', onclick: () => { g.options.dayEnd = !dayEnd; redraw(); } },
            h('span', { class: 'dot' }),
            h('span', { class: 'choice-main' }, h('span', { class: 'choice-title' }, 'Trade at the end of the day', h('em', {}, dayEnd ? 'on' : 'off')),
                h('span', { class: 'choice-line' }, dayEnd
                    ? 'On: after the evening\u2019s fights, characters who stand together may trade before Midnight. Each player can still turn it off for their own character.'
                    : 'Off: characters trade only at the start of a phase of someone\u2019s turn, not after the fights.'))),
    ];
}

function optionsStep(g, redraw, go, shared = false) {
    g.options ??= {};
    return [
        ...(shared ? tableStep(g, redraw) : []),
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
    const online = ctx.onlineIntent ?? null;                     // set by the Play online screen: this wizard is choosing a seat in a race, or opening / joining a shared table
    const first = online && online.mode !== 'create' ? STEPS.length - 1 : 0;       // someone joining takes the game's rules and only chooses a character
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
            g.step = first; g.loading = true; g.note = 'Looking up the game\u2026';
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
    const back = () => {
        if (g.step <= first) {
            if (online?.mode === 'choose') ctx.go('sharedlobby', { game: online.game });
            else ctx.go(online ? 'online' : 'title', online ? { message: '' } : {});
        } else { g.step -= 1; redraw(); }
    };
    // the goals must add up to the length's budget (rule 3.3.6a): the quick start, which skips the goals page, spreads it for you
    const fitVp = () => {
        const total = vpTotal(g);
        if (Object.values(g.vp).reduce((a, b) => a + b, 0) === total) return;
        const fame = Math.min(5, Math.ceil(total * 0.6));
        g.vp = { great: 0, spells: 0, fame, notoriety: Math.min(5, total - fame), gold: Math.max(0, total - fame - Math.min(5, total - fame)) };
    };
    const start = () => {
        fitVp();
        const lastDay = g.length === 'custom' ? g.weeks * 7 : 28;
        if (online) { startOnline(lastDay); return; }
        ctx.go('game', { fresh: true, character: g.character, vp: { ...g.vp }, options: { ...g.options }, startDwelling: g.dwelling, startSpells: (CHARACTERS.find(c => c.id === g.character)?.spells && Array.isArray(g.spells)) ? [...g.spells] : undefined, lastDay, mode: g.length === 'sudden' ? 'sudden' : g.length === 'endless' ? 'endless' : 'month' });
    };
    async function startOnline(lastDay) {
        const choices = { character: g.character, vp: { ...g.vp }, startDwelling: g.dwelling, startSpells: (CHARACTERS.find(c => c.id === g.character)?.spells && Array.isArray(g.spells)) ? [...g.spells] : undefined };
        const mode = g.length === 'sudden' ? 'sudden' : g.length === 'endless' ? 'endless' : 'month';
        const shared = kindOf() === 'shared';
        g.note = online.mode === 'join' ? 'Taking your seat\u2026' : online.mode === 'choose' ? 'Saving\u2026' : shared ? 'Setting up the table\u2026' : 'Setting up the race\u2026'; g.busy = true; redraw();
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

    function build() {
        const last = g.step === STEPS.length - 1;
        const shared = kindOf() === 'shared';
        return [
            h('header', { class: 'bar' },
                h('button', { class: 'back', 'aria-label': 'Back', onclick: back }, '\u2039'),
                h('h1', {}, title())),
            online && online.mode !== 'create' ? null : h('div', { class: 'progress', 'aria-label': `Step ${g.step + 1} of ${STEPS.length}: ${STEPS[g.step].label}` },
                h('div', { class: 'ticks' }, STEPS.map((s, i) => h('span', { class: `tick${i < g.step ? ' done' : ''}${i === g.step ? ' now' : ''}` }))),
                h('div', { class: 'where' }, h('b', {}, STEPS[g.step].label), h('span', {}, `Step ${g.step + 1} of ${STEPS.length}`))),
            h('div', { class: 'body', onscroll: e => { g._scroll = e.target.scrollTop; } }, g.step === 0 ? typeStep(g, redraw) : g.step === STEPS.length - 1 ? charsStep(g, redraw, ctx) : optionsStep(g, redraw, ctx.go, shared && online?.mode === 'create')),
            h('footer', { class: 'dock' },
                g.note ? h('div', { class: 'sum', role: 'status' }, g.note) : online?.mode === 'join' && g.race ? h('div', { class: 'sum' }, `${summary(g)} \u00b7 with ${g.race.players.join(', ')}${g.race.open ? ` \u00b7 ${g.race.open === 1 ? 'one seat' : `${g.race.open} seats`} open` : ''}`) : h('div', { class: 'sum' }, summary(g)),
                h('button', { class: 'btn primary big', 'data-act': last ? 'start' : 'next', disabled: g.loading || g.busy || (last && online?.mode === 'join' && g.race?.status && g.race.status !== 'lobby') || last && (Object.values(g.vp).reduce((a, b) => a + b, 0) !== vpTotal(g) || (CHARACTERS.find(c => c.id === g.character)?.spells && (g.spells ?? []).length !== CHARACTERS.find(c => c.id === g.character).spells.n)), onclick: last ? start : next },
                    last ? goLabel() : `Next: ${STEPS[g.step + 1].label}`),
                g.step === 0 && !online ? h('button', { class: 'btn', 'data-act': 'quick', onclick: start }, 'Start now with the defaults') : null),
        ].filter(Boolean);
    }
    root.append(...build());
    return root;
}
