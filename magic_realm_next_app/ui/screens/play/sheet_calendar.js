// play/sheet_calendar.js: the Calendar sheet (tap the Day box in the top bar). Two tabs: "Days" (the month, with the colours of magic drawn with the colour-magic art) and
// "Turn order" (the seven stages of a game day, the one you are in lit, and how a party takes turns). The words of the second tab are in ui/calendar_turns.js.
import { COLORS, COLOR_MEANING, dayColors, isMagicDay, nameOfClearing } from '../../../engine/catalogue.js';
import { ask } from '../../ask.js';
import { gameOf, ownSheet, viewOf } from '../../combat/feed.js';
import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { timed } from '../../gametext.js';
import { drawInfo, joinNames } from '../../party.js';
import { PARTY_LINES, STAGES, nowLine, stageKey } from '../../calendar_turns.js';
import { seg } from '../kit/common.js';
import { COLOR_ART, modal } from './kit.js';
import { render } from './shell.js';

const TABS = [{ key: 'days', label: 'Days' }, { key: 'order', label: 'Turn order' }];

// One colour of magic, drawn with its own art (art/colormagic/<colour>.gif: the burst of colour, not the chit).
const blast = (name, cls = '') => h('img', { class: `blast ds-px ${cls}`.trim(), src: `art/colormagic/${COLOR_ART[name]}.gif`, alt: '', 'data-blast': name, draggable: 'false', onerror: e => e.target.remove() });
// The colour with its art and name: the chip every list of colours uses on this sheet.
const colour = name => h('span', { class: `mcolor big ${name.toLowerCase()}` }, blast(name), h('b', {}, name));

// `here`: the colours of magic in the viewer's clearing, [{ color, why }] (sheet_info.js reads them from the engine).
export function calendarSheet(G, here = []) {
    G.ui.calTab = G.ui.calTab === 'order' ? 'order' : 'days';
    const tabs = seg(TABS, G.ui.calTab, k => { G.ui.calTab = k; render(G); }, 'data-cal-tab');
    return modal(G, 'Calendar and magic', h('div', { class: 'calendar' }, tabs, G.ui.calTab === 'order' ? turnOrder(G) : days(G, here)),
        { close: () => { G.ui.sheet = null; G.ui.calStage = undefined; render(G); } });
}

// ---- Days ----
function days(G, here) {
    const game = gameOf(G.st, G.data), last = game.lastDay ?? 28, weeks = Math.ceil(last / 7);
    const cell = d => {
        const cols = dayColors(d, last);
        return h('div', { class: `calday${d === game.day ? ' today' : ''}${d < game.day ? ' past' : ''}${cols.length ? ' magic' : ''}${cols.length > 1 ? ' two' : ''}`, 'data-day': d,
            'aria-label': `Day ${d}${cols.length ? `: ${joinNames(cols)} magic` : ''}` },
            h('b', {}, String(d)), cols.length ? h('span', { class: 'blasts' }, ...cols.map(blast)) : null);
    };
    return h('div', { class: 'calpane', 'data-pane': 'days' },
        ask(isMagicDay(game.day) ? `Today the land is filled with ${joinNames(dayColors(game.day, last))} magic.` : `Day ${game.day}${timed(G.st) ? ` of ${last}` : ''}: an ordinary day for magic.`,
            'On the seventh day of each week one colour of magic fills the whole realm, from sunrise to midnight, in every clearing. Spells of that colour can be cast anywhere that evening.'),
        h('div', { class: 'calgrid' }, ...Array.from({ length: weeks }, (_, w) => h('div', { class: 'calweek' }, h('small', {}, `Week ${w + 1}`), ...Array.from({ length: 7 }, (_, k) => cell(w * 7 + k + 1))))),
        h('h3', {}, 'The week’s colours'),
        ...Array.from({ length: weeks }, (_, w) => h('p', { class: 'calrow', 'data-week-colours': (w + 1) * 7 }, h('b', {}, `Day ${(w + 1) * 7}`), ...dayColors((w + 1) * 7, last).map(colour))),
        h('h3', {}, 'What each colour is'),
        ...COLORS.map(c => h('p', { class: 'calrow' }, colour(c), h('span', {}, COLOR_MEANING[c]))),
        h('h3', {}, `In your clearing (${nameOfClearing(ownSheet(G.st, G.data).at).replace(/ (\d+)$/, ' $1')})`),
        here.length ? h('div', {}, ...here.map(x => h('p', { class: 'calrow' }, colour(x.color), h('span', {}, x.why)))) : h('p', { class: 'hint' }, 'No colour of magic is present here today.'),
        h('p', { class: 'hint' }, 'Colours of magic come from the seventh day and from a Chapel (White).'));
}

// ---- Turn order ----
// Where the viewer is in the day, from the live game: the period, the question he is asked, the phase he is in, and (with a party) today's draw of the chits.
function whereNow(G) {
    const v = viewOf(G.st, G.data), game = v.table.game, pending = v.pending?.type ?? null, key = stageKey(game.period, pending);
    const several = (game.order?.length ?? 0) > 1, draw = several ? drawInfo(G.st) : null, names = id => v.table.characters[id]?.name ?? id;
    const turnId = draw && game.period === 'daylight' ? draw.order[draw.i] : null;
    const d = { pending, several, phase: pending === 'phase' ? v.pending.i : null, phases: v.me?.plan?.slots?.length ?? 0, turnName: turnId ? names(turnId) : null };
    return { key, period: game.period, day: game.day, several, draw, names, now: nowLine(key, d) };
}

function turnOrder(G) {
    const w = whereNow(G), stage = STAGES.find(s => s.key === w.key);
    // every row starts folded (the lit one carries its own tag and line); one row is open at a time, the one the player last tapped
    const open = () => G.ui.calStage ?? null;
    const rows = STAGES.map((s, i) => {
        const lit = s.key === w.key, on = open() === s.key;
        return h('li', { class: `calstage${lit ? ' now' : ''}${on ? ' open' : ''}`, 'data-stage': s.key, ...(lit ? { 'aria-current': 'step' } : {}) },
            h('button', { type: 'button', class: 'calstage-head', 'aria-expanded': on ? 'true' : 'false', onclick: e => toggle(G, e.currentTarget.parentElement, s.key) },
                h('span', { class: 'n', 'aria-hidden': 'true' }, String(i + 1)),
                h('span', { class: 'main' }, h('b', {}, s.name, lit ? h('em', { class: 'here' }, 'You are here') : null), h('span', { class: 'l' }, s.line),
                    lit && w.now ? h('span', { class: 'now-line' }, w.now) : null),
                icon('down', 'chev')),
            h('div', { class: 'calstage-more' }, ...s.more.map(t => h('p', {}, t))));
    });
    const you = stage ? `${w.day ? `Day ${w.day}: ` : ''}you are in ${stage.name}.` : 'The game is over.';
    const drawn = w.several && w.draw && w.period !== 'birdsong' ? `Today\u2019s order: ${w.draw.order.map(w.names).join(', then ')}.` : null;
    return h('div', { class: 'calpane', 'data-pane': 'order' },
        ask(you, drawn ?? 'Every day runs the same seven stages, in this order. Tap one to read more.'),
        h('ol', { class: 'calstages' }, ...rows),
        h('h3', {}, 'Who goes first'),
        w.several && w.draw && w.period !== 'birdsong' ? h('p', { class: 'caldraw', 'data-draw': '' }, h('b', {}, 'Today’s order: '), w.draw.order.map(w.names).join(', then '), '.') : null,
        w.several && !w.draw ? h('p', { class: 'caldraw', 'data-draw': '' }, 'The chits are drawn at Sunrise, once every plan is in.') : null,
        !w.several ? h('p', { class: 'caldraw', 'data-draw': '' }, 'You play alone, so no chits are drawn.') : null,
        h('ul', { class: 'calparty' }, ...PARTY_LINES.map(t => h('li', {}, t))));
}

// Open or fold one stage without redrawing the sheet (so the scroll stays where it is): one row is open at a time.
function toggle(G, li, key) {
    const was = li.classList.contains('open');
    G.ui.calStage = was ? null : key;
    for (const r of li.parentElement.children) { const on = !was && r === li; r.classList.toggle('open', on); r.querySelector('.calstage-head').setAttribute('aria-expanded', on ? 'true' : 'false'); }
    if (!was) li.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}
