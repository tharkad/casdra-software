// screens/kit/evening.js: the end of the day (the engine's 'evening-end' question, asked when the game sets pauseEvening; ruling R6, docs/rules-spec/rulings/ch7-day.md).
// After the Evening's fighting the player may rearrange his belongings for the last time before Midnight (4.3.3a); in Birdsong he cannot (7.2.2f), and a horse or a treasure that gives
// an extra phase must already be ACTIVE then (6.2.2c.1). So this sheet is the reminder: each thing that decides tomorrow's plan (`pending.gear`, items.js nextDayGear), whether it is
// on, what it gives, a switch (the same `tidy` action as the Kit), and why it cannot be switched on when it cannot. One primary: Continue to Midnight.
// The engine is untouched: `tidy` and `continue` are the engine's own answers.
import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { act } from '../play/actions.js';
import { render } from '../play/shell.js';
import { footRow, itemArt, say, twoLine } from './common.js';
import { ACT_LABEL } from '../play/kit.js';
import { tidyAct } from './kit.js';
import { ROAD_STORY, roadLockOf, voiced } from '../../commit.js';

const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const names = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? '');
const nb = t => String(t).replace(/ (\d+)/g, ' $1');

// One thing that decides tomorrow's plan. `g` is an entry of nextDayGear: { uid, name, active, act, gives, canActivate, why }.
function gearRow(G, g) {
    const it = G.st.ch.items.find(i => i.uid === g.uid);
    const state = g.active ? ['gold', 'On'] : g.canActivate ? ['', 'Off'] : ['bad', 'Cannot be on'];
    const sub = g.active ? 'Ready for tomorrow.' : g.canActivate ? 'No extra phase tomorrow.' : g.why;
    const pony = it?.kind === 'horse' && G.data.horses[it.id]?.kind === 'pony';
    const gives = pony ? 'A Move after each other Move, never the first of the day' : g.act && ACT_LABEL[g.act] ? (g.gives ?? '').replace(new RegExp(`\\b${g.act}\\b`), ACT_LABEL[g.act]) : (g.gives ?? '');
    const press = () => { if (it) tidyAct(G, it); };
    const road = roadLockOf(G.st);          // 8.3.8d: out on a road between clearings nothing can be switched, on or off
    const stuck = (label, act) => h('button', { type: 'button', class: 'ds-btn sm is-dim', 'data-act': act, 'data-item': g.uid, 'aria-disabled': 'true', onclick: () => say(G, ROAD_STORY) }, label);
    const button = road ? stuck(g.active ? 'Switch off' : 'Switch on', g.active ? 'gear-off' : 'gear-on') : g.active
        ? h('button', { type: 'button', class: 'ds-btn sm quiet', 'data-act': 'gear-off', 'data-item': g.uid, onclick: press }, 'Switch off')
        : g.canActivate
            ? h('button', { type: 'button', class: 'ds-btn sm primary', 'data-act': 'gear-on', 'data-item': g.uid, onclick: press }, 'Switch on')
            : h('button', { type: 'button', class: 'ds-btn sm is-dim', 'data-act': 'gear-on', 'data-item': g.uid, 'aria-disabled': 'true', onclick: () => say(G, g.why ?? 'It cannot be switched on now.') }, 'Switch on');
    return h('div', { class: `kit-gear${g.active ? ' on' : ''}${!g.active && !g.canActivate ? ' dim' : ''}`, 'data-gear': g.uid, 'data-state': g.active ? 'on' : g.canActivate ? 'off' : 'blocked' },
        h('span', { class: 'ds-counter art' }, it ? itemArt(G, it) : icon('plus', 'lg')),
        h('span', { class: 'main' },
            h('b', {}, g.name, h('span', { class: `ds-tag ${state[0]} kit-tag` }, state[1])),
            h('span', { class: 'gives' }, cap(gives)),
            h('span', { class: `sub${!g.active && !g.canActivate ? ' bad' : ''}` }, road && !g.active ? voiced(road) : nb(sub))),
        button);
}

// Out on a road between clearings (8.3.8d) nothing here can be changed: say so once, above the list, in both voices.
const roadNote = G => { const road = roadLockOf(G.st); return road ? h('div', { class: 'ds-why kit-lock', 'data-lock': 'road' }, icon('lock', 'kit-lockico'), voiced(road)) : null; };

// evening(G, pending) -> { title, eyebrow, body, foot, detent } for mountSheet (a decision: the map can be looked at while it waits).
export function eveningContent(G, p) {
    const gear = p.gear ?? [], st = G.st;
    const missed = gear.filter(g => !g.active && g.canActivate);
    const body = gear.length
        ? h('div', { class: 'kit kit-evening', 'data-evening': 'gear' },
            h('div', { class: 'ds-ask' }, h('b', {}, 'Switch on what you will need tomorrow.'),
                h('span', { 'data-v': 'story' }, 'An extra phase counts only if its horse or treasure is already on when you plan at dawn. Tonight is your last chance.'),
                h('span', { 'data-v': 'detail' }, 'Rule 6.2.2c.1: an extra phase from an item can be recorded only if the item is active in Birdsong. Belongings cannot be rearranged then (7.2.2f), so the evening is the last chance.')),
            roadNote(G),
            h('div', { class: 'kit-gearlist' }, gear.map(g => gearRow(G, g))))
        : h('div', { class: 'kit kit-evening quiet', 'data-evening': 'quiet' },
            h('div', { class: 'ds-ask' }, h('b', {}, 'Nothing you carry changes tomorrow.'),
                roadLockOf(G.st) ? null : h('span', {}, 'You may still rearrange your belongings before Midnight.')),
            roadNote(G));
    const note = missed.length ? `Still off: ${names(missed.map(g => g.name))}.` : null;
    const belongings = h('button', { type: 'button', class: 'ds-btn sm quiet', 'data-act': 'evening-kit', onclick: () => { G.ui.sheet = 'char'; render(G); } }, 'Belongings');
    const go = h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'evening-go', onclick: () => act(G, { type: 'continue' }) }, twoLine('Continue', 'to Midnight'));
    return { title: 'Before Midnight', eyebrow: `Day ${st.day} · Evening`, body, detent: gear.length ? 'tall' : 'hug', foot: footRow({ note, bad: false, secondary: belongings, primary: go }) };
}
