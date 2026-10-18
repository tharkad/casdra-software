// ds_gallery.js: the component gallery behind app/ds.html. A developer page: every core component and state of the design system (DESIGN-SYSTEM.md section 8), built
// with the app's own ui/ds.js builders and styled by the app's own css files, so it can be checked against the mockups (docs/design/redesign/mockups, shots/mockups).
//   ds.html            all stages, one after the other (a stage is one phone-sized frame, or one panel of components)
//   ds.html?only=a1    one stage, filling the viewport (what tools/ui_ds.py compares pixel by pixel with the same state of the mockup)
// The map is a stand-in (plain ground): the overlays are positioned in the mockup's map coordinates (520 x 793) so the rings, route, pins line up with the mockup.
// Stages a1..c1b, j3, j4 are the states of mockups 01, 02 and 08 with the same ids and the same words.
import { h, sv } from './ui/dom.js';
import * as ds from './ui/ds.js';
import { icon, actIcon, art, die } from './ui/icons.js';
const { btn, primary, twoLine, strip, last, situ, pips, tray, sheet, ask, sect, voiceSwitch, delta, resultCard, frames, tile, chit, miniChit, state, toast } = ds;

// ---- map stand-in and overlays (mapview.js draws the real ones; P5) ----
const C = { CV4: [260, 396], CV1: [259, 518], CV2: [327, 478], CV5: [190, 476], CR1: [171, 212], CL1: [412, 352], BV2: [101, 347] };
const at = id => `left:${C[id][0]}px;top:${C[id][1]}px`;
const ring = (id, kind = 'legal') => h('i', { class: `ds-ring ${kind}`, style: at(id) });
const hero = (id = 'CV4', hid = false) => h('i', { class: hid ? 'ds-hero hidden' : 'ds-hero', style: at(id) });
const stop = (id, n) => h('b', { class: 'ds-stop', style: at(id) }, String(n));
const pin = (id, html, bad = false, dx = 0) => h('div', { class: bad ? 'ds-pin bad' : 'ds-pin', style: `left:${C[id][0] + dx}px;top:${C[id][1]}px;--dx:${dx}px`, html });
const route = ids => sv('svg', { class: 'ds-route', viewBox: '0 0 520 793', width: 520, height: 793 }, sv('path', { d: `M${ids.map(i => C[i].join(' ')).join(' L')}` }));
const map = ({ focus = 'CV4', px = .5, py = .6, layer = [], button = true } = {}) =>
    h('section', { class: 'ds-map', 'data-focus': C[focus].join(','), 'data-px': px, 'data-py': py }, h('div', { class: 'ds-cam', style: 'width:520px;height:793px' }, layer),
        button ? h('button', { class: 'ds-map-btn', 'aria-label': 'Show the whole realm' }, icon('fit')) : null);
function cams(root) {                       // put the focus clearing at (px, py) of the part of the map a sheet leaves visible
    root.querySelectorAll('.ds-map').forEach(m => {
        const cam = m.querySelector('.ds-cam'); if (!cam) return;
        const [fx, fy] = m.dataset.focus.split(',').map(Number), W = m.clientWidth, H = m.clientHeight;
        const sh = root.querySelector('.ds-sheet'); let vis = H;
        if (sh) { const mr = m.getBoundingClientRect(), sr = sh.getBoundingClientRect(); vis = Math.max(120, Math.min(H, sr.top - mr.top)); }
        cam.style.transform = `translate(${Math.round(W * (+m.dataset.px || .5) - fx)}px,${Math.round(vis * (+m.dataset.py || .5) - fy)}px)`;
    });
}

const T = (cls, ...kids) => h('div', { class: cls }, ...kids);
const lead = (t, b) => h('span', { class: 'ds-lead-text' }, b ? h('b', {}, b) : null, t);
const sstrip = (o = {}) => strip({ day: 3, phase: 'Birdsong', gold: 10, fame: 0, notor: 0, vp: '−57', vpc: 'neg', ...o });

// the plan chooser (mockup 01 a2..a6)
const ACTS = [['move', 'Move'], ['hide', 'Hide'], ['search', 'Search'], ['trade', 'Trade'], ['hire', 'Hire'], ['rest', 'Rest'], ['alert', 'Alert'], ['spell', 'Enchant'], ['ban', 'Nothing']];
const grid = (on, dim = [], note) => T('ds-acts', ACTS.map(([a, l]) => h('button', { class: ['ds-act', on === a ? 'on' : '', dim.includes(a) ? 'dim' : ''].join(' ').replace(/\s+/g, ' ').trim(), 'data-sel': 'act', 'data-toast': dim.includes(a) ? note : null }, actIcon(a, 28), l)));
const tabs = (cur, set = {}, locked = []) => T('ds-tabs', [1, 2, 3, 4, 5].map(n => h('button', { class: ['ds-tab', cur === n ? 'on' : '', set[n] ? 'set' : '', locked.includes(n) ? 'locked' : ''].filter(Boolean).join(' ') }, h('span', {}, locked.includes(n) ? icon('lock') : String(n)), h('small', {}, set[n] || '–'))));
const planTray = (inner, leadEl, prim) => tray({ body: T('ds-plan', inner), lead: leadEl, primary: prim });
const day = now => pips([['move', 'done'], ['hide', 'done'], ['search', now === 3 ? 'now' : 'done'], ['trade', now === 4 ? 'now' : ''], ['rest', 'locked']]);
const shell = (inner, pipsRow, primaryEl) => [sstrip({ phase: 'Daylight' }), map({ layer: [hero('CV4')] }), tray({ body: inner, lead: pipsRow, primary: primaryEl })];

const STAGES = [];
const stage = (id, label, cap, build, o = {}) => STAGES.push({ id, label, cap, build, ...o });

// ---------------------------------------------------------------- mockup 01: the play shell
stage('a1', 'a1 Birdsong: before the plan', 'Strip 48, tray 140, one situation line and one primary, bottom-right.', () => [sstrip(), map({ layer: [hero('CV4')] }),
    tray({ last: last({ b: 'Last night', t: 'A quiet evening. Nothing came for you.' }), situ: situ('Curst Valley 4', 'in plain sight'), lead: lead(', planned in secret', '5 phases'), primary: primary('Plan your day') })]);
stage('a2', 'a2 Plan: pick the action', 'Five tabs, one line, nine chips as game art. Start the day is dim with its reason.', () => [sstrip(), map({ layer: [hero('CV4')] }),
    planTray([tabs(1), T('ds-plan-ask', h('span', {}, 'Phase 1 of 5: pick one.')), grid(null, ['hide'], 'Hide: you were seen when you arrived. Hide again after a Move.')], lead(' to plan', '5 phases'), btn('Start the day', 'primary', { disabled: true }))]);
stage('a3', 'a3 Plan: Move, tap the map', 'Legal rings gold, a hidden path dotted, not open dashed; a pin says why.', () => [sstrip(),
    map({ layer: [hero('CV4'), ring('BV2', 'legal'), ring('CL1', 'legal'), ring('CV1', 'legal'), ring('CV5', 'maybe'), ring('CR1', 'illegal'), pin('CR1', '<b>Crag 1</b> is up the mountain: two Moves, and you have one phase left.', true)] }),
    planTray([tabs(1), T('ds-plan-ask', h('span', {}, 'Where to? ', h('span', { class: 'ds-dim' }, 'Tap a ringed clearing.')), btn('Back', 'quiet sm'))], lead(' · 1 of 5', 'Move'), btn('Start the day', 'primary', { disabled: true }))]);
stage('a4', 'a4 Plan: set, on to phase 2', 'Route with a numbered stop; the tab reads Move·BV2.', () => [sstrip(), map({ layer: [hero('CV4'), route(['CV4', 'BV2']), stop('BV2', 1)] }),
    planTray([tabs(2, { 1: 'Move·BV2' }), T('ds-plan-ask', h('span', {}, 'Phase 2 of 5: pick one.'), btn('Clear 1', 'quiet sm')), grid(null)], lead(' to plan', '4 phases'), btn('Start the day', 'primary', { disabled: true }))]);
stage('a5', 'a5 Plan: whole, ready', 'Tabs, one summary line and the lit primary.', () => [sstrip(), map({ layer: [hero('CV4'), route(['CV4', 'BV2']), stop('BV2', 1)] }),
    planTray([tabs(0, { 1: 'Move·BV2', 2: 'Hide', 3: 'Search', 4: 'Rest', 5: 'Rest' }), T('ds-plan-ask', h('span', { class: 'ds-dim' }, 'Move, Hide, Search, Rest, and your extra Rest. Ready when you are.'))], lead(' set', '5 of 5'), primary('Start the day'))]);
stage('a6', 'a6 Plan: a fixed step (the climb)', 'A forced step: steel-blue lock box, no Clear, no chips.', () => [sstrip(), map({ layer: [hero('CV4'), route(['CV4', 'CL1']), stop('CL1', 1)] }),
    planTray([tabs(2, { 1: 'Move·CL1', 2: 'Move·CL1' }, [2]), T('ds-lockbox', icon('lock'), h('span', {}, 'Fixed: the climb to Cliff 1 takes two Moves.'))], lead(' to plan', '3 phases'), btn('Next phase', 'primary'))]);
stage('b1', 'b1 Daylight: a phase ready', 'Pips are the day; the primary names what happens. The last action is one line.', () => [sstrip({ phase: 'Daylight' }), map({ layer: [hero('CV4'), route(['CV4', 'BV2']), stop('BV2', 1), ring('BV2', 'legal')] }),
    tray({ last: last({ dice: [3], b: 'The wilds', t: 'Two ogres lumber out of their holes. Wolves hunt in packs.' }), situ: situ('Curst Valley 4', 'in plain sight'),
        lead: pips([['move', 'now'], ['hide', ''], ['search', ''], ['rest', ''], ['rest', 'locked']]), primary: btn(twoLine('Move', 'to Bad Valley 2'), 'primary') })]);
const b2Sheet = (detent) => sheet({ eyebrow: 'Phase 3 · Search', title: 'Which table?', detent, decision: true, x: false,
    body: [ask('Search here: one roll on one table.', 'Peer finds hidden foes and paths; Locate finds hidden things.'),
        T('ds-list', [['Peer', 'Hidden enemies and secret paths.', 'peer'], ['Locate', 'Treasure and sites hidden here.', 'search']].map(([n, l, a]) =>
            h('button', { class: 'ds-row', 'data-sel': 'tbl' }, h('span', { class: 'art' }, actIcon(a, 28)), h('span', { class: 'main' }, h('b', {}, n), h('span', {}, l)), h('span', { class: 'ds-check' }, icon('check')))),
            h('button', { class: 'ds-row dim', 'data-toast': 'Nothing here to loot.' }, h('span', { class: 'art' }, actIcon('cache', 28)), h('span', { class: 'main' }, h('b', {}, 'Loot'), h('span', {}, 'Nothing here to loot.'))))],
    foot: [h('span', { class: 'lead ds-lead-text' }, 'Pick one table.'), btn('Choose a table', 'primary is-dim', { disabled: true })] });
const b2Base = () => [sstrip({ phase: 'Daylight' }), map({ layer: [hero('CV4')] }), tray({ last: last({ dice: [2, 3], b: 'Hide', t: 'You melt out of sight.' }), situ: situ('Curst Valley 4', 'hidden'),
    lead: pips([['move', 'done'], ['hide', 'done'], ['search', 'now'], ['rest', ''], ['rest', 'locked']]), primary: btn(twoLine('Search', 'choose a table'), 'primary', { disabled: true }) })];
stage('b2', 'b2 Daylight: a decision sheet (half)', 'One question; select-then-commit; the primary says what it will do.', () => [...b2Base(), b2Sheet('half')]);
stage('b2-peek', 'b2 peek (map tapped)', 'The decision sheet dropped to a peek: title and primary only, the map almost whole.', () => [...b2Base(), b2Sheet('peek')]);
stage('b3', 'b3 Daylight: a move, legal and not', 'Gold rings are open, the red ring is danger, the dashed one is closed; a pin says why.', () => [sstrip({ phase: 'Daylight' }),
    map({ layer: [hero('CV4'), ring('BV2', 'legal'), ring('CV1', 'legal'), ring('CL1', 'danger'), ring('CR1', 'illegal'), pin('CL1', '<b>Cliff 1</b>: an Ogre is there. It will see you.', true, -70)] }),
    tray({ last: last({ b: 'Search', t: 'You watch the clearing. Nothing stirs.' }), situ: situ('Curst Valley 4', 'in plain sight'), lead: pips([['move', 'done'], ['hide', 'done'], ['search', 'done'], ['move', 'now'], ['rest', 'locked']]), primary: btn('Choose where', 'primary', { disabled: true }) })]);

// ---------------------------------------------------------------- mockup 02: results
stage('c1', 'c1 Result: a find', 'Result first, once: one Story sentence; the find is a gold-bordered box; one button. Flip to Detail for the exact roll.', () => shell(
    resultCard({ label: 'Phase 3 · Search', story: 'Under the Inn floor, something was waiting for you.', detail: 'Locate: you discover the Cache at Curst Valley 4.',
        found: { art: 'cache', eyebrow: 'You found', title: 'A Cache', line: 'Six treasures, hidden. Tap to look.' }, ledger: 'Locate (3 + 4 = 7). Table: Locate, result 7: Cache. Fame +0, Notoriety +0.' }),
    day(4), btn(twoLine('Next', 'phase 4 · Trade'), 'primary')));
stage('c1b', 'c1b Result: Gold', 'The scores move under the headline: only the non-zero ones, outlined in the three score colours.', () => shell(
    resultCard({ label: 'Phase 4 · Trade', story: 'The Innkeeper weighs the Ruby, nods, and counts out the coins.', detail: 'You sell the Ruby for 30 Gold.', deltas: { gold: 30, fame: 0, notor: 0 },
        ledger: 'Ruby: worth 30 Gold at the Inn. Gold 10 to 40. (Amounts are examples.)', stamp: false }), day(4), btn(twoLine('Next', 'phase 5 · Rest'), 'primary')));
stage('c2', 'c2 Journal head (notes + last roll)', 'The drawer, kept: standing states as one row of chips, then the last roll with its dice. (The grouped log list is P4 css.)', () => [sstrip({ phase: 'Daylight' }), map({ layer: [hero('CV4')] }),
    tray({ last: last({ dice: [3, 4], b: 'Search', t: 'Under the Inn floor, something was waiting.' }), situ: situ('Curst Valley 4', 'in plain sight'), primary: primary('Next') }),
    sheet({ eyebrow: 'Day 3', title: 'The story so far', detent: 'half', head: voiceSwitch(), body: [
        T('ds-notes', h('span', { class: 'ds-note curse' }, icon('skull'), 'Squeak: you cannot Hide'), h('span', { class: 'ds-note' }, h('i', { class: 'ds-dot white' }), h('i', { class: 'ds-dot black' }), 'White and Black magic'), h('span', { class: 'ds-note' }, icon('spark'), 'Spells (2)'), h('span', { class: 'ds-note' }, icon('eye'), 'The wilds')),
        sect('The last roll'),
        h('div', { class: 'ds-row', style: 'min-height:64px' }, h('span', { style: 'display:flex;gap:4px' }, die(3, 'gold'), die(4, 'gold')), h('span', { class: 'main' }, h('b', {}, 'Search: Locate'),
            h('span', { 'data-v': 'story' }, 'Under the Inn floor, something was waiting for you.'), h('span', { 'data-v': 'detail' }, '3 + 4 = 7: the Cache, Locate table.')))] })]);

// ---------------------------------------------------------------- mockup 08: loading and error
stage('j3', 'j3 Loading', 'Never a blank frame: skeleton strip, a card with a gold progress line, skeleton rows.', () => [
    h('header', { class: 'ds-strip' }, h('span', { class: 'menu' }), T('ds-day', T('ds-skel', '')), h('span'), h('span')),
    h('section', { class: 'ds-map', style: 'display:grid;place-items:center' }, state({ glyph: 'flag', title: 'Opening the realm', text: 'Twenty tiles are finding their places.', body: T('ds-progress') })),
    h('footer', { class: 'ds-tray' }, T('ds-grab'), h('div', { style: 'padding:6px var(--gutter) calc(18px + var(--safe-b));display:flex;flex-direction:column;gap:12px' }, h('div', { class: 'ds-skel', style: 'height:22px;width:70%' }), h('div', { class: 'ds-skel', style: 'height:52px' })))],
    { fix: el => { el.querySelector('.ds-day .ds-skel').style.cssText = 'width:90px;height:16px'; } });
stage('j4', 'j4 Error', 'An error you can leave: Try again (primary, right), Back to the title (quiet, left).', () => [
    h('header', { class: 'ds-strip' }, h('span', { class: 'menu' }), T('ds-day', h('b', {}, 'Magic Realm')), h('span'), h('span')),
    h('section', { class: 'ds-map', style: 'display:grid;place-items:center' }, state({ glyph: 'warn', color: 'var(--danger)', title: 'The realm would not open', text: 'We could not reach the game. Check your connection and try again.', body: btn('Details', 'quiet sm') })),
    tray({ lead: btn('Back to the title', 'quiet'), primary: btn([icon('retry'), ' Try again'], 'primary') })]);

// ---------------------------------------------------------------- component panels (no mockup twin: every component and state of DESIGN-SYSTEM.md section 8)
const panel = (id, label, cap, ...kids) => stage(id, label, cap, () => [h('div', { class: 'gal-panel' }, ...kids)], { panel: true });
const row = (cls, title, line, artEl, end) => h('button', { class: cx(['ds-row', cls]) }, artEl ? h('span', { class: 'art' }, artEl) : null, h('span', { class: 'main' }, h('b', {}, title), line ? h('span', {}, line) : null), end ? h('span', { class: 'end' }, end) : null, cls.includes('sel') ? h('span', { class: 'ds-check' }, icon('check')) : null);
const cx = a => a.filter(Boolean).join(' ');
const lbl = t => h('div', { class: 'gal-lbl ds-eyebrow' }, t);

panel('p-type', 'Type roles, colours', 'Display, voice, UI; the three scores; meaning colours.',
    lbl('type roles'), h('div', { class: 'ds-eyebrow' }, 'eyebrow · Cinzel caps'), h('h1', { class: 'ds-h1' }, 'Heading one'), h('h2', { class: 'ds-h2' }, 'Heading two'),
    h('p', { class: 'ds-voice' }, 'Voice: an italic Story sentence in Alegreya.'), h('p', { class: 'ds-voice lg' }, 'Voice, large: the narrator and the result headline.'), h('p', { class: 'ds-text' }, 'Text: body copy in the Story typeface, read at 17px.'),
    h('p', { class: 'ds-meta' }, 'Meta: tertiary, for labels and notes.'), h('p', {}, h('span', { class: 'ds-num ds-c-gold' }, '1,250'), ' ', h('span', { class: 'ds-num ds-c-fame' }, '32'), ' ', h('span', { class: 'ds-num ds-c-notor' }, '40')),
    lbl('surfaces'), h('div', { class: 'gal-swatches' }, ['0', '1', '2', '3', '4'].map(n => h('i', { style: `background:var(--surface-${n})` }, n))),
    lbl('meaning'), h('div', { class: 'gal-swatches' }, ['danger', 'success', 'warn', 'info', 'gold', 'st-locked'].map(n => h('i', { style: `background:var(--${n});color:#10131b` }, n.replace('st-', '')))));

panel('p-buttons', 'Buttons', 'Primary (gold, one per layer), secondary, quiet, danger, small, icon; dim is dashed; a two-line primary.',
    lbl('default'), T('gal-row', primary('Primary'), btn('Secondary'), btn('Quiet', 'quiet'), btn('Danger', 'danger')),
    lbl('small and icon'), T('gal-row', btn('Small', 'sm'), btn('Small primary', 'primary sm'), btn(icon('close'), 'icon', { 'aria-label': 'Close' }), btn(icon('plus'), 'icon', { 'aria-label': 'More' })),
    lbl('dim (still tappable, always with a reason)'), T('gal-row', btn('Start the day', 'primary', { disabled: true }), btn('Dim', 'is-dim'), btn('Disabled', '', { disabled: true })), h('p', { class: 'ds-why' }, 'Plan all five phases first.'), h('p', { class: 'ds-why bad' }, 'Your Squeak curse forbids it.'),
    lbl('two lines, block'), btn(twoLine('Move', 'to Bad Valley 2'), 'primary block'), h('div', { style: 'height:8px' }), btn('Block secondary', 'block'));

panel('p-chips', 'Chips, tags, notes', 'Chip 44 (selectable), tag 24 (read-only), notes 36, magic dots, mood tags.',
    lbl('chips'), T('gal-row', h('button', { class: 'ds-chip' }, 'Plain'), h('button', { class: 'ds-chip on' }, icon('check'), 'Selected'), h('button', { class: 'ds-chip' }, icon('spark'), 'Spells')),
    lbl('tags'), T('gal-row', h('span', { class: 'ds-tag' }, 'Plain'), h('span', { class: 'ds-tag gold' }, 'Gold'), h('span', { class: 'ds-tag good' }, 'Good'), h('span', { class: 'ds-tag bad' }, 'Bad')),
    lbl('mood tags (a dot plus the word)'), T('gal-row', ['ally', 'friendly', 'neutral', 'unfriendly', 'enemy'].map(m => h('span', { class: `ds-tag mood ${m}` }, m[0].toUpperCase() + m.slice(1)))),
    lbl('notices row'), T('ds-notes', h('span', { class: 'ds-note curse' }, icon('skull'), 'Squeak'), h('span', { class: 'ds-note' }, h('i', { class: 'ds-dot white' }), h('i', { class: 'ds-dot grey' }), h('i', { class: 'ds-dot gold' }), h('i', { class: 'ds-dot purple' }), h('i', { class: 'ds-dot black' }), 'Magic day'), h('span', { class: 'ds-note' }, icon('eye'), 'The wilds')));

panel('p-acts', 'Action chooser, tabs, pips', 'Nine chips (on, dim, locked), phase tabs (on, set, locked), phase pips (done, now, locked, empty).',
    lbl('chips'), h('div', { class: 'ds-acts' }, ACTS.slice(0, 6).map(([a, l], i) => h('button', { class: ['ds-act', i === 0 ? 'on' : '', i === 1 ? 'dim' : '', i === 2 ? 'locked' : ''].join(' ').trim() }, actIcon(a, 28), l))),
    lbl('tabs'), tabs(2, { 1: 'Move·BV2', 3: 'Hide' }, [4]),
    lbl('pips'), T('gal-row', pips([['move', 'done'], ['hide', 'done'], ['search', 'now'], ['rest', ''], ['rest', 'locked']]), pips([['move', 'done'], [null, 'empty'], [null, 'empty'], ['rest', 'locked'], [null, 'empty']])),
    lbl('lock box, lead text'), T('ds-lockbox', icon('lock'), h('span', {}, 'Fixed: the climb to Cliff 1 takes two Moves.')), h('p', { class: 'ds-lead-text' }, lead(' set', '5 of 5')));

panel('p-tokens', 'Counters, chits, dice, tokens', 'Cream counter tile (sm 44, 64, lg 92, tall, selected, dead), chit tiles, day pips, dice, map tokens.',
    lbl('counters'), T('gal-row', tile('monsters_c/wolf.gif', 'sm'), tile('monsters_c/wolf.gif'), tile('monsters_c/wolf.gif', 'lg'), tile('monsters_c/wolf.gif', 'tall'), tile('monsters_c/wolf.gif', 'sel'), tile('monsters_c/wolf.gif', 'dead'), tile('actions/cache.gif', '', 'Small')),
    lbl('chits'), T('gal-row', chit('fight', 'F4'), chit('move', 'M3'), chit('magic', 'V2'), chit('fight', 'F5', 'FIGHT', 'on'), chit('move', 'M2', 'MOVE', 'tired'), chit('fight', 'F6', 'FIGHT', 'wounded'), chit('magic', 'V1', 'MAGIC', 'dim')),
    lbl('mini chits'), T('gal-row', miniChit('fight'), miniChit('fight', 'tired'), miniChit('move'), miniChit('magic'), miniChit('fight', 'on')),
    lbl('dice'), T('gal-row', die(3), die(6, 'gold'), die(1)),
    lbl('days left'), h('div', { class: 'ds-daypips' }, [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0].map(o => h('i', { class: o ? '' : 'off' }))), h('div', { style: 'height:8px' }), h('div', { class: 'ds-daypips low' }, [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map(o => h('i', { class: o ? '' : 'off' }))));

panel('p-rows', 'List rows, frames', 'Row (default, selected with check, dim with reason, art + worth), legend frames.',
    T('ds-list', row('', 'Great Sword', 'Heavy; needs a strong arm.', actIcon('search', 28), [h('span', {}, '16'), h('small', {}, 'GOLD')]), row('sel', 'Wolf Pelt', 'Selected: gold border and a tick.', actIcon('cache', 28), [h('span', {}, '4'), h('small', {}, 'GOLD')]), row('dim', 'Loot', 'Nothing here to loot.', actIcon('cache', 28))),
    sect('Frames', 'Fame, Notoriety, Gold'), frames({ fame: 32, notor: 40, gold: 210 }),
    h('div', { style: 'height:12px' }), h('fieldset', { class: 'ds-frame card gold' }, h('div', { class: 'lg' }, 'Card variant'), h('div', { class: 'v' }, '210', h('small', {}, 'Gold in hand'))));

panel('p-choices', 'Choice cards, segmented, toggles, stepper, inputs', 'One question per screen: radio cards (on, dim); the segmented control; Active/Inactive toggles; stepper; text input.',
    T('ds-choices', h('button', { class: 'ds-choice on', 'data-sel': 'len' }, h('span', { class: 'dot' }), h('span', { class: 'main' }, h('b', {}, 'A month', h('em', {}, '28 days · 5 VP')), h('span', { class: 'l' }, 'The standard game: four weeks.'))),
        h('button', { class: 'ds-choice', 'data-sel': 'len' }, h('span', { class: 'dot' }), h('span', { class: 'main' }, h('b', {}, 'Sudden death', h('em', {}, '5 VP')), h('span', { class: 'l' }, 'Ends at the first midnight someone has met every goal.'))),
        h('button', { class: 'ds-choice dim' }, h('span', { class: 'dot' }), h('span', { class: 'main' }, h('b', {}, 'Endless'), h('span', { class: 'l' }, 'Not in this realm.')))),
    h('div', { style: 'height:12px' }), T('ds-seg', h('button', { class: 'on' }, 'Kit'), h('button', {}, 'Company', h('sup', {}, '4')), h('button', {}, 'Spells')),
    h('div', { style: 'height:12px' }), T('ds-switch-row', h('span', { class: 'main' }, h('b', {}, 'Quiet Monsters'), h('span', {}, 'A hidden character is left alone by wandering monsters.'), h('i', { class: 'st' }, 'Inactive')), h('button', { class: 'ds-toggle', 'aria-label': 'Quiet Monsters', 'data-toggle': '' })),
    T('ds-switch-row', h('span', { class: 'main' }, h('b', {}, 'Knights\' Adjustment'), h('span', {}, 'Eases the Knights\' heavy gear a little.'), h('i', { class: 'st' }, 'Active')), h('button', { class: 'ds-toggle on', 'aria-label': 'Knights Adjustment', 'data-toggle': '' })),
    h('div', { style: 'height:12px' }), T('ds-stepper', btn(icon('minus'), '', { 'aria-label': 'Less' }), T('v', '3', h('small', {}, 'reach 30 Fame')), btn(icon('plus'), '', { 'aria-label': 'More' })),
    h('div', { style: 'height:12px' }), T('ds-field', h('label', {}, 'Your name'), h('input', { class: 'ds-input', placeholder: 'Shown to the others', value: 'Mike' })));

panel('p-voice', 'Story | Detail, result card, toast', 'The voice switch (one stored preference); the result card with deltas, a Found box and a ledger; toasts (normal, refusal).',
    voiceSwitch(), h('div', { style: 'height:12px' }),
    resultCard({ label: 'Phase 5 · Rest', story: 'You wound up bloodied but alive; the Wolf did not.', detail: 'Wolf slain. Notoriety +2, Gold −5 for the healer.', deltas: { fame: 0, notor: 2, gold: -5 }, found: { art: 'cache', title: 'A Cache', line: 'Six treasures, hidden. Tap to look.' }, ledger: 'Rest: 2 wounds healed. Notoriety 3 to 5.' }),
    h('div', { class: 'gal-toasts' }, h('div', { class: 'ds-toast', style: 'position:static' }, 'Chosen. The route is on the map.'), h('div', { class: 'ds-toast bad', style: 'position:static' }, 'Nothing here to loot.')));

panel('p-states', 'Empty, loading, error', 'The centred card (glyph, title, one voice line, buttons); progress line; skeletons.',
    state({ glyph: 'scroll', title: 'No adventures yet', text: 'Every game you play from now on is kept here, with its story.', body: primary('New game') }),
    state({ glyph: 'flag', title: 'Opening the realm', text: 'Twenty tiles are finding their places.', body: T('ds-progress') }),
    h('div', { class: 'ds-skel', style: 'height:22px;width:70%;margin:8px 0' }), h('div', { class: 'ds-skel', style: 'height:52px' }));

const sheetDemo = (id, label, cap, opts, h_ = 560) => stage(id, label, cap, () => [sstrip({ phase: 'Daylight' }), map({ layer: [hero('CV4')] }), tray({ last: last({}), situ: situ('Curst Valley 4', 'in plain sight'), primary: primary('Plan your day') }), sheet({
    body: [ask('The Innkeeper will buy what you carry.', 'Tick what to sell. Nothing changes until you press the button.'), T('ds-list', row('sel', 'Ruby', 'A deep red stone.', actIcon('cache', 28), [h('span', {}, '30'), h('small', {}, 'GOLD')]), row('', 'Gold Bracelet', 'Worth more to a collector.', actIcon('cache', 28), [h('span', {}, '12'), h('small', {}, 'GOLD')]), row('', 'Mace', 'Not for sale: you are wielding it.', actIcon('hire', 28)))],
    foot: [h('span', { class: 'lead ds-lead-text' }, 'Gold after: 40'), btn('Cancel', 'quiet'), primary('Sell the Ruby')], ...opts })], { h: h_ });
sheetDemo('s-half', 'Sheet: information, half', 'Scrim, grab, head (eyebrow + title + close 44), scrolling body, sticky foot.', { eyebrow: 'Curst Valley 4', title: 'Trade', detent: 'half', onClose: () => {} });
sheetDemo('s-tall', 'Sheet: tall', 'The tall detent (78%).', { eyebrow: 'Curst Valley 4', title: 'Trade', detent: 'tall' });
sheetDemo('s-hug', 'Sheet: hug', 'Height follows the content (max 78%).', { eyebrow: 'Day 3', title: 'The day', detent: 'hug', foot: null }, 640);
sheetDemo('s-decision', 'Sheet: decision, half (no scrim)', 'A decision sheet has no scrim: the map stays live above it.', { eyebrow: 'Phase 3 · Search', title: 'Which table?', detent: 'half', decision: true, x: false });

stage('strips', 'Strip variants', 'VP neutral while negative, green when positive, red only on the death screen; big numbers; short phones.', () => [sstrip({ phase: 'Midnight', gold: 1250, fame: 32, notor: 40, vp: '+21', vpc: 'pos' }), sstrip({ phase: 'Evening', gold: 0, fame: 0, notor: 0, vp: '−57', vpc: 'neg' }), sstrip({ phase: 'Dead', gold: 9, fame: 1, notor: 2, vp: '−103', vpc: 'bad' })], { panel: true });

// ---------------------------------------------------------------- page
const q = new URLSearchParams(location.search);
const ONLY = q.get('only');
const root = document.getElementById('gallery');
const css = `
html, body { height: auto; min-height: 100%; background: var(--surface-0); overflow: auto; }
.gal-top { padding: 14px var(--gutter) 6px; font: 500 15px/1.35 var(--font-ui); color: var(--ink-2); }
.gal-top h1 { margin: 0 0 4px; font: 600 17px/1.2 var(--font-display); letter-spacing: .12em; text-transform: uppercase; color: var(--gold); }
.gal-top a { color: var(--ink-3); } .gal-top nav { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 6px; font-size: 13px; }
.gal { margin: 0 0 22px; } .gal > h3 { margin: 0; padding: 10px var(--gutter) 2px; font: 600 12px/1.2 var(--font-display); letter-spacing: .12em; text-transform: uppercase; color: var(--gold); }
.gal > p { margin: 0; padding: 0 var(--gutter) 6px; font: 400 13px/1.3 var(--font-ui); color: var(--ink-3); }
.gal .ds-app { height: var(--stage-h, 760px); box-shadow: 0 0 0 1px #000; }
.gal-panel { padding: 8px var(--gutter) 16px; background: var(--surface-2); }
.gal-panel > * + .gal-lbl { margin-top: 14px; } .gal-lbl { margin: 14px 0 6px; }
.gal-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.gal-swatches { display: flex; gap: 6px; flex-wrap: wrap; } .gal-swatches i { display: grid; place-items: center; min-width: 44px; height: 44px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--line-2); font: 600 12px/1 var(--font-ui); font-style: normal; color: var(--ink-3); }
.gal-toasts { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.gal-panel .ds-state { margin: 12px auto; }
.ds-cam { position: absolute; left: 0; top: 0; transition: transform var(--d-sheet) var(--ease-io); } .ds-cam > * { position: absolute; }
body.only .ds-app { height: 100vh; height: 100dvh; } body.only .gal { margin: 0; }
`;
document.head.append(h('style', {}, css));
document.body.classList.toggle('only', !!ONLY);
const list = ONLY ? STAGES.filter(s => s.id === ONLY) : STAGES;
if (!ONLY) root.append(h('div', { class: 'gal-top' }, h('h1', {}, 'Design system gallery'), 'Core components of the redesign, built by ui/ds.js with the app\'s own css. Compare with docs/design/redesign/mockups. ',
    h('a', { href: 'index.html' }, 'back to the game'), h('nav', {}, STAGES.map(s => h('a', { href: `#st-${s.id}` }, s.id)))));
const built = [];
for (const s of list) {
    const app = h('div', { class: 'ds-app' }, s.build());
    if (s.panel) { app.style.height = 'auto'; app.style.overflow = 'visible'; app.style.minHeight = '0'; app.style.paddingTop = '0'; }
    if (s.h) app.style.setProperty('--stage-h', `${s.h}px`);
    s.fix?.(app);
    root.append(h('section', { class: 'gal', id: `st-${s.id}`, 'data-stage': s.id }, ONLY ? null : h('h3', {}, s.label), ONLY ? null : h('p', {}, s.cap), app));
    built.push(app);
}
const place = () => built.forEach(cams);
place(); document.fonts?.ready.then(place); addEventListener('resize', place);
// a little life, so the states can be tried by hand
root.addEventListener('click', e => {
    const t = e.target;
    const sel = t.closest('[data-sel]'); if (sel) { const g = sel.dataset.sel, scope = sel.parentElement; scope.querySelectorAll(`[data-sel="${g}"]`).forEach(x => x.classList.remove('on', 'sel')); sel.classList.add(sel.classList.contains('ds-row') ? 'sel' : 'on'); }
    const tg = t.closest('[data-toggle]'); if (tg) { tg.classList.toggle('on'); const st = tg.closest('.ds-switch-row')?.querySelector('.st'); if (st) st.textContent = tg.classList.contains('on') ? 'Active' : 'Inactive'; }
    const ts = t.closest('[data-toast]'); if (ts) toast(ts.dataset.toast, { bad: true, host: ts.closest('.ds-app') });
});
window.__ds = { STAGES, ds, ids: STAGES.map(s => s.id), cams: place };
