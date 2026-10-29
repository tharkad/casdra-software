// combat/sections_ui.js: the "Hires" step of the Melee stepper: one card per Melee Section (an owner in its red box, its target in a Maneuver square, the other attackers in Attack circles), drawn as three lanes
// (Thrust or Charge, Swing or Dodge, Smash or Duck: one lane is one line of fire, 8.4.8b). The hirer taps a counter to move it to the next lane, picks whom an attacked hireling strikes (8.4.2e) and the side a
// defending hireling shows (8.4.5n.1). The engine places everything else and says whether the plan is allowed (sections.js asks hirefight.js); its words come up under the card.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { btn } from '../ds.js';
import { voiced } from '../commit.js';
import * as S from './sections.js';
import { sideFacts } from './deploy.js';
import { counterBox, counterEl } from './counters.js';
import { cap } from './model.js';

const vhint = (copy, cls = '', attrs = {}) => h('p', { class: `cb-hint${cls ? ` ${cls}` : ''}`, ...attrs }, voiced(copy));

export const SECTION_WORDS = {
    intro: {
        story: 'These are the fights your hirelings are in. A counter stands in one of three lanes: tap it to move it to the next. A blow lands on whatever stands in the same lane across from it.',
        detail: 'Melee Sections: the box, circle and square of one direction are one line (8.4.8b). An attack hits the counter in the same direction on the other side, or gets under its maneuver time (8.4.8a, d, e).',
    },
    place: {
        story: 'Fill as many circles as you can before you stack two in one. A head, a club or a horse never stands with its owner.',
        detail: 'As many Attack circles as possible must hold a counter before any holds two; a head, club or horse of an unhired denizen cannot stand in the same circle or square as its owner (8.4.5n.2). A hireling and his own horse may share a lane (8.4.2f).',
    },
    chooses: {
        story: 'Several are at him. He strikes back at one of them, and you pick which.',
        detail: 'A hireling who is attacked by several denizens chooses his target among them, and cannot choose not to attack (8.4.2e).',
    },
    side: {
        story: 'Pick the side he shows. Once the round begins he cannot be turned over.',
        detail: 'A defending hireling is placed either side up now (8.4.5n.1). An attacker was turned at Deployment (8.3.6a.4) and stays as he is; a defender’s horse is never turned.',
    },
    den: {
        story: 'It is placed by the rules. You place only what comes at it.',
        detail: 'An uncontrolled defender is placed by the rules: its body in the Charge and Thrust box, its head, club and horse in the Dodge and Swing box (8.4.2a). The target and the other attackers are placed by the hirer (8.4.2f).',
    },
    held: {
        story: 'A great monster has hold of him and fights him alone.',
        detail: 'A red-side-up Tremendous monster that holds a hireling stays on him: he is its target (8.6.2).',
    },
};

// the Hires step: { body: [elements], lead: element | null }
export function sectionsStep(X, o, m) {
    const { st, data, cb, render } = X;
    const plan = S.planFor(st, data, o, cb), cards = S.cardsOf(st, data, plan);
    if (plan.open == null || !cards.some(c => c.id === plan.open)) plan.open = (cards.find(c => c.error) ?? cards.find(c => c.chooses) ?? cards[0])?.id ?? null;
    const body = h('div', { class: 'dp-scroll sx-scroll', 'data-scope': '' }, ...cards.map(card => cardEl(X, plan, card)), vhint(SECTION_WORDS.place, 'dp-note', { 'data-hint': 'sections-place' }));
    return { body: [body], lead: null };
}

function cardEl(X, plan, card) {
    const { st, data, render } = X, open = plan.open === card.id;
    const head = h('button', { type: 'button', class: 'dp-head sx-head', 'aria-expanded': open ? 'true' : 'false', 'data-sec-head': card.id, 'aria-label': `${card.ownerName}: ${S.subOf(card)}${card.error ? ', not allowed yet' : ''}: tap to ${open ? 'close' : 'open'}`,
        onclick: () => { plan.open = open ? null : card.id; render(); } },
        counterBox(st, data, card.ownerKey, 44), h('span', { class: 'dp-name' }, h('b', {}, S.titleOf(card)), h('small', {}, S.subOf(card))),
        card.error ? h('span', { class: 'ds-tag bad', 'data-sec-bad': '' }, 'Check') : null, icon(open ? 'up' : 'down'));
    const kids = [];
    if (open) {
        if (card.error) kids.push(h('p', { class: 'cb-hint bad sx-err', role: 'alert', 'data-sec-error': card.id }, `${cap(card.error)}${/[.!?]$/.test(card.error) ? '' : '.'}`));
        kids.push(h('div', { class: 'sx-cols', 'aria-hidden': 'true' }, ...[0, 1, 2].map(i => h('span', {}, S.DIRS[i], h('small', {}, S.MNV[i])))));
        const hireOwner = card.ownerKind === 'hire';
        const rows = [['circle', `Strike ${hireOwner ? 'him' : 'it'} (circles)`], ['box', `${hireOwner ? 'His' : 'Its'} box`], ['square', `${hireOwner ? 'He' : 'It'} strikes (square)`]];
        for (const [zone, label] of rows) {
            if (!card.cells[zone].some(col => col.length)) continue;
            kids.push(h('div', { class: 'sx-row', 'data-zone': zone }, h('p', { class: 'sx-lbl' }, label),
                h('div', { class: 'sx-cells' }, ...[0, 1, 2].map(i => h('div', { class: `sx-cell${card.cells[zone][i].length ? '' : ' empty'}`, 'data-dir': i, 'data-lane': `${zone}${i}` }, ...card.cells[zone][i].map(chip => chipEl(X, plan, card, chip)))))));
        }
        if (card.chooses) kids.push(targetPick(X, plan, card));
        if (hireOwner && card.sides.length > 1) kids.push(sidePick(X, plan, card));
        if (!hireOwner) kids.push(vhint(card.held ? SECTION_WORDS.held : SECTION_WORDS.den, '', { 'data-hint': card.held ? 'held' : 'den' }));
        if (Object.keys(plan.pos).some(k => card.cells.box.concat(card.cells.square, card.cells.circle).some(col => col.some(c => c.key === k)))) kids.push(btn('Put them where the rules would', 'quiet sm', { 'data-act': 'sections-reset', onclick: () => { S.resetPlan(plan); render(); } }));
    }
    return h('div', { class: `dp-card sx-card${open ? ' open' : ''}${card.error ? ' bad' : ''}`, 'data-sec': card.id, 'data-owner': card.ownerKey, 'data-kind': card.ownerKind }, head, open ? h('div', { class: 'dp-body sx-body' }, ...kids) : null);
}

// one counter in a lane: a tap moves it to the next lane (when the hirer places it)
function chipEl(X, plan, card, chip) {
    const { st, data, render } = X;
    const inner = [chip.role === 'horse' ? null : counterBox(st, data, chip.key, 30, 'sx-mini'), h('span', { class: 'sx-name' }, chip.name, chip.note ? h('small', {}, chip.note) : null)];
    const lane = S.laneName(chip.zone, chip.dir), next = S.laneName(chip.zone, (chip.dir + 1) % 3);
    if (!chip.editable) return h('div', { class: 'sx-chip fixed', 'data-counter': chip.key, 'data-fixed': '', role: 'img', 'aria-label': `${chip.name}: in the ${lane}, placed by the rules` }, ...inner);
    return h('button', { type: 'button', class: 'sx-chip', 'data-counter': chip.key, 'data-zone': chip.zone, 'data-dir': chip.dir, 'aria-label': `${chip.name}: in the ${lane}; tap to move it to the ${next}`,
        onclick: () => { S.moveCounter(plan, chip); render(); } }, ...inner);
}

// a hireling who is attacked by several: whom does he strike (8.4.2e)
function targetPick(X, plan, card) {
    const { st, data, render } = X;
    return h('div', { class: 'sx-pick', 'data-pick': 'target' }, vhint(SECTION_WORDS.chooses, '', { 'data-hint': 'chooses' }),
        h('div', { class: 'cb-aim' }, ...card.attackers.map(a => h('button', { type: 'button', class: `ds-btn dp-den${card.target === a.key ? ' on' : ''}`, 'data-target': a.key, 'aria-pressed': card.target === a.key ? 'true' : 'false',
            onclick: () => { S.setTarget(plan, card, a.key); render(); } }, counterBox(st, data, a.key, 32, 'dp-mini'), h('span', { class: 'dp-dname' }, a.name)))));
}

// the side a defending hireling shows (8.4.5n.1): both sides drawn
function sidePick(X, plan, card) {
    const { st, data, render } = X, hire = (st.combat.hires ?? []).find(x => x.uid === card.ownerKey);
    return h('div', { class: 'sx-pick', 'data-pick': 'side' }, vhint(SECTION_WORDS.side, '', { 'data-hint': 'side' }),
        h('div', { class: 'dp-turn' }, ...card.sides.map(side => h('button', { type: 'button', class: `dp-side${card.side === side ? ' on' : ''}`, 'data-side': side, 'aria-pressed': card.side === side ? 'true' : 'false',
            'aria-label': `${side === 'light' ? 'Light' : 'Dark'} side${card.side === side ? ', showing' : ''}`, onclick: () => { S.setSide(plan, card, side); render(); } },
            h('span', { class: 'ds-cs-wrap', 'aria-hidden': 'true' }, counterEl(st, data, card.ownerKey, 52, side)), h('small', {}, `${side === 'light' ? 'Light' : 'Dark'} \u00B7 ${hire ? sideFacts(st, data, hire, side).text : ''}`)))));
}
