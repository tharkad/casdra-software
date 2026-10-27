// screens/kit/phasegear.js: New belongings (the engine's 'phase-gear' question, asked when the game sets pauseGear; ruling R1, docs/rules-spec/rulings/ch2469.md, rules 4.3.2 and 4.3.3b).
// "As soon as he obtains the item, before completing the phase": a Daylight phase in which he came by a belonging (Loot, Magic Sight, the Pool, a Treasure-within-Treasure, a purchase) ends
// here, before the storm and blocking checks and before the next phase. `pending.items` are the uids he came by. A belonging that fits is already on (items.js autoEquip), so the question
// is his chance to take it off, to switch it on over something else, or to leave it lying. The structure and the voice follow the evening sheet (evening.js): a bold ask, a Story line and a
// Detail line, one row per thing with its switch, and one primary at the foot. The engine is untouched: `tidy` (toggle, or `drop: true`) and `continue` are its own answers.
import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { ROAD_STORY, commitmentOf, roadLockOf, voiced } from '../../commit.js';
import { nameOf } from '../../../engine/items.js';
import { act } from '../play/actions.js';
import { render } from '../play/shell.js';
import { footRow, itemArt, oneLine, say, twoLine } from './common.js';
import { tidyAct, whyNot } from './kit.js';

const names = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? '');
const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// One new belonging: what it is, whether it is on, and what he may do about it.
function belongingRow(G, it) {
    const road = roadLockOf(G.st);          // 8.3.8d: out on a road between clearings he can neither switch nor leave anything
    const name = nameOf(G.data, it), why = road ? ROAD_STORY : whyNot(G, it), bound = commitmentOf(G.st, G.data, it), leaving = G.ui.leaveAsk === it.uid;
    const state = it.active ? ['gold', 'On'] : why ? ['bad', 'Cannot be on'] : ['', 'Off'];
    const sub = road ? voiced(road) : it.active ? 'It fits, so it is already on.' : why ?? 'Not in use. It stays in your pack.';
    const dimmed = (label, act) => h('button', { type: 'button', class: 'ds-btn sm is-dim', 'data-act': act, 'data-item': it.uid, 'aria-disabled': 'true', onclick: () => say(G, ROAD_STORY) }, label);
    const toggle = road ? dimmed(it.active ? 'Switch off' : 'Switch on', it.active ? 'gear-off' : 'gear-on') : it.active
        ? h('button', { type: 'button', class: 'ds-btn sm quiet', 'data-act': 'gear-off', 'data-item': it.uid, onclick: () => tidyAct(G, it) }, 'Switch off')
        : why ? h('button', { type: 'button', class: 'ds-btn sm is-dim', 'data-act': 'gear-on', 'data-item': it.uid, 'aria-disabled': 'true', onclick: () => say(G, why) }, 'Switch on')
            : h('button', { type: 'button', class: 'ds-btn sm primary', 'data-act': 'gear-on', 'data-item': it.uid, onclick: () => tidyAct(G, it) }, 'Switch on');
    const leave = bound ? null : road ? dimmed('Leave it here', 'gear-leave-ask') : h('button', { type: 'button', class: 'ds-btn sm quiet', 'data-act': 'gear-leave-ask', 'data-item': it.uid, onclick: () => { G.ui.leaveAsk = it.uid; render(G); } }, 'Leave it here');
    const actions = leaving && !bound && !road
        ? h('div', { class: 'kit-gearact confirm' }, h('span', { class: 'ds-meta' }, `Leave the ${name} lying here?`),
            h('button', { type: 'button', class: 'ds-btn sm danger', 'data-act': 'gear-leave', 'data-item': it.uid, onclick: () => { G.ui.leaveAsk = null; tidyAct(G, it, { drop: true }); } }, 'Leave it'),
            h('button', { type: 'button', class: 'ds-btn sm quiet', 'data-act': 'gear-keep', onclick: () => { G.ui.leaveAsk = null; render(G); } }, 'Keep it'))
        : h('div', { class: 'kit-gearact' }, toggle, leave);
    return h('div', { class: `kit-gear fresh${it.active ? ' on' : ''}${!it.active && why ? ' dim' : ''}`, 'data-gear': it.uid, 'data-state': it.active ? 'on' : why ? 'blocked' : 'off' },
        h('span', { class: 'ds-counter art' }, itemArt(G, it) ?? icon('plus', 'lg')),
        h('span', { class: 'main' },
            h('b', {}, name, h('span', { class: `ds-tag ${state[0]} kit-tag` }, state[1])),
            h('span', { class: 'gives' }, cap(oneLine(G, it))),
            h('span', { class: `sub${!it.active && why ? ' bad' : ''}` }, sub),
            bound ? h('span', { class: 'ds-why kit-lock kit-committed', 'data-committed': it.uid }, icon('lock', 'kit-lockico'), voiced(bound)) : null),
        actions);
}

// phaseGearContent(G, pending) -> { title, eyebrow, body, foot, detent } for mountSheet (a decision: the map can be looked at while it waits).
export function phaseGearContent(G, p) {
    const st = G.st, items = (p.items ?? []).map(uid => st.ch.items.find(i => i.uid === uid)).filter(Boolean);
    const body = items.length
        ? h('div', { class: 'kit kit-evening kit-phasegear', 'data-phasegear': 'items' },
            h('div', { class: 'kit-gearlist' }, items.map(it => belongingRow(G, it))))
        : h('div', { class: 'kit kit-evening quiet', 'data-phasegear': 'done' },
            h('div', { class: 'ds-ask' }, h('b', {}, 'Nothing left to decide.'), h('span', {}, 'What you came by is settled. The phase can end.')));
    const off = items.filter(i => !i.active && !whyNot(G, i));
    const note = items.length && off.length ? `Not in use: ${names(off.map(i => nameOf(G.data, i)))}.` : null;
    const belongings = h('button', { type: 'button', class: 'ds-btn sm quiet', 'data-act': 'gear-kit', onclick: () => { G.ui.sheet = 'char'; render(G); } }, 'Belongings');
    const go = h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'gear-go', onclick: () => { G.ui.leaveAsk = null; act(G, { type: 'continue' }); } }, twoLine('Continue', 'the phase ends'));
    return { title: 'New belongings', eyebrow: `Day ${st.day} · End of phase`, body, detent: items.length ? 'tall' : 'hug', foot: footRow({ note, bad: false, secondary: belongings, primary: go }) };
}
