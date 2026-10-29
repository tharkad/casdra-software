// combat/deploy_ui.js: the Deployment sheet of the combat scene (pending `combat-deploy`: a round on Melee Sections, rules 8.3.4c, 8.3.5, 8.3.6a). One card per hireling: he lures a creature, or is sent at a
// target, or stays out; the ones he is sent can be turned over (and their horses); a hidden hero may lure the rest; with the hero hidden one hireling takes whatever nobody lured. A hireling a great monster holds is
// greyed out and says why, and so is a hidden one where it matters. Auto is the engine's own quick plan. The plan and the answer are built in deploy.js; the engine says whether it would take the answer (refusal()).
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { btn, primary, twoLine } from '../ds.js';
import { voiced } from '../commit.js';
import * as D from './deploy.js';
import { counterBox, counterEl, nameOfKey } from './counters.js';
import { cap, listOf, numWord, nbTag } from './model.js';

const vhint = (copy, cls = '', attrs = {}) => h('p', { class: `cb-hint${cls ? ` ${cls}` : ''}`, ...attrs }, voiced(copy));
const nm = s => nbTag(s);
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
export const ordWord = i => ORD[i] ?? `number ${i + 1}`;

// ---- the words, in both voices ----
export const DEPLOY_WORDS = {
    intro: {
        story: 'Who lures a creature, who goes in against one, and who stays out?',
        detail: 'Deployment: each hireling may lure one denizen onto a Melee Section of his own (8.3.4c.2). The attackers nobody lured are assigned at random (8.3.5), and each hireling who is not being attacked is deployed at a target of your choice, in the order you choose (8.3.6a). One who stays out cannot attack (8.3.6).',
    },
    heroHidden: {
        story: 'You are hidden, so nothing can be set on you. Lure the rest yourself and you are seen. If you do not, one of your hirelings takes them.',
        detail: 'A hidden hero may lure what the hirelings did not, and is unhidden (8.3.4b). Otherwise the attackers go to one of his unhidden hirelings (8.3.5a.3); if every hireling is hidden too they stay unassigned (8.3.5b).',
    },
    heroSeen: {
        story: 'You are in plain sight, so whatever nobody lures is set on you.',
        detail: 'An unhidden character must take the unlured attackers himself (8.3.5a.3).',
    },
    turn: {
        story: 'He is going in as an attacker, so you may turn him over before he goes: the side that shows is the side that fights. His horse turns too.',
        detail: 'A hireling placed as an attacker may be turned either side up, and so may his horse (8.3.6a.4). A hireling who defends is turned later, when you place him in the Melee step (8.4.5n.1).',
    },
    order: {
        story: 'They go in one after the other. If one is sent at a creature another is already facing, that creature turns to face the newcomer instead.',
        detail: 'Hirelings are deployed in the order you choose (8.3.6a). A target that was an attacker on another section leaves it and gets a section of its own (8.3.6a.5).',
    },
    taker: {
        story: 'Who takes the creatures nobody lured? He will be set upon, so he cannot be sent anywhere.',
        detail: 'With the hero hidden, an unlured attacker is assigned to one of his unhidden hirelings (8.3.5a.3). A hireling who is being attacked is not deployed (8.3.6a).',
    },
    nobody: {
        story: 'Every hireling is hidden too, so nothing can be set on anyone. The creatures stay where they are.',
        detail: 'With the hero and every hireling hidden, the unlured attackers stay unassigned (8.3.5b).',
    },
};
const bystanderWhy = { story: 'Luring or attacking a native brings its whole group in against you.', detail: 'A native that is lured (8.3.4e) or attacked (8.3.6a.9) begins to battle, and so does its group.' };
const calmWhy = { story: 'It is under a spell of peace. Drawing it or sending a hireling at it breaks the spell.', detail: 'A pacified creature that is lured (8.3.4g) or attacked by a hireling (8.4.2h.2) loses its spell.' };

// ---- the sheet ----
const sheetBox = (X, ...kids) => h('div', { class: 'cb-sheet', 'data-kind': 'deploy', 'data-ask-type': X.p.type }, ...kids);
const jobWords = { lure: 'Lure', send: 'Send at', out: 'Stay out' };

export function deploySheet(X) {
    const { st, data, cb, p, c, render } = X;
    const plan = D.planFor(st, data, p, cb);
    const hires = D.hiresOf(p), taker = D.takerNow(st, p, plan);
    if (cb.depOpen == null || !hires.some(x => x.uid === cb.depOpen && !x.held)) cb.depOpen = hires.find(x => !x.held)?.uid ?? hires[0]?.uid ?? null;
    const answer = D.payload(st, p, plan), why = D.refusal(st, data, answer);
    const sends = plan.order.filter(u => plan.jobs[u]?.job === 'send' && plan.jobs[u].den && !D.hireOfUid(p, u)?.held);

    const open = uid => { cb.depOpen = cb.depOpen === uid ? null : uid; render(); };
    const cards = hires.map(hh => hireCard(X, plan, hh, { open, taker, sends }));
    const heroRow = p.heroHidden ? heroBlock(X, plan, taker) : null;
    const takerRow = taker || (p.heroHidden && !plan.heroLures && D.unluredOf(st, plan).length) ? takerBlock(X, plan, taker) : null;
    const note = !p.heroHidden ? vhint(DEPLOY_WORDS.heroSeen, 'dp-note', { 'data-hint': 'hero-seen' }) : null;
    const lured = Object.entries(plan.jobs).filter(([u, j]) => j.job === 'lure' && j.den).length;
    const foot = h('div', { class: 'ds-actions' }, h('div', { class: 'lead' }, btn('Auto', 'quiet', { 'data-act': 'deploy-auto', 'aria-label': 'Auto: the usual plan, no luring', onclick: () => X.send(D.autoPayload()) })),
        primary(twoLine('Deploy', `${sends.length ? `${numWord(sends.length)} sent` : 'none sent'}${lured ? ` · ${numWord(lured)} lured` : ''}`), { 'data-act': 'deploy-go', disabled: !!why, onclick: () => X.send(answer) }));
    return sheetBox(X,
        h('div', { class: 'q' }, h('b', {}, `Round ${c.round} · Deployment`), h('span', {}, hires.length === 1 ? 'your hireling' : 'your hirelings')),
        h('div', { class: 'dp-scroll', 'data-scope': '' }, heroRow, ...cards, takerRow, note),
        why ? h('p', { class: 'cb-hint bad dp-refuse', role: 'alert', 'data-refusal': '' }, `${cap(why)}${/[.!?]$/.test(why) ? '' : '.'}`) : null,
        foot);
}

// ---- the hireling's card ----
function hireCard(X, plan, hh, { open, taker, sends }) {
    const { st, data, p, cb, render } = X;
    const j = plan.jobs[hh.uid] ?? { job: 'out', den: null }, isOpen = cb.depOpen === hh.uid, held = !!hh.held;
    const isTaker = taker?.uid === hh.uid, hid = D.hiddenWhy(hh), grey = D.greyWhy(hh);
    const denName = uid => nm((p.targets ?? []).concat(p.lurable ?? []).find(d => d.uid === uid)?.name ?? '?');
    const pos = sends.indexOf(hh.uid);
    let sub;
    if (held) sub = 'Held by a great monster';
    else if (isTaker && j.job !== 'lure') sub = 'Takes what nobody lured';
    else if (j.job === 'lure' && j.den) sub = `Lures the ${denName(j.den)}`;
    else if (j.job === 'send' && j.den) sub = `Sent at the ${denName(j.den)}${sends.length > 1 ? ` · ${ORD[pos] ?? pos + 1}` : ''}`;
    else sub = 'Stays out';
    const dim = held;
    const head = h('button', { type: 'button', class: 'dp-head', 'aria-expanded': isOpen ? 'true' : 'false', 'aria-label': `${hh.name}: ${sub}${hid ? ', hidden' : ''}: tap to ${isOpen ? 'close' : 'open'}`, 'data-hire-head': hh.uid, onclick: () => (held ? X.say(grey.story) : open(hh.uid)) },
        counterBox(st, data, hh.uid, 48),
        h('span', { class: 'dp-name' }, h('b', {}, nm(hh.name)), h('small', {}, sub)),
        hh.hidden ? h('span', { class: `ds-tag${!held && j.job !== 'out' ? ' bad' : ''}`, 'data-tag-hidden': '' }, !held && j.job !== 'out' ? 'Will be seen' : 'Hidden') : null,
        held ? icon('lock') : icon(isOpen ? 'up' : 'down'));
    const body = isOpen && !held ? h('div', { class: 'dp-body' }, jobRow(X, plan, hh, isTaker), pickerFor(X, plan, hh, j), j.job === 'send' ? turnBlock(X, plan, hh, j, sends) : null,
        hid ? vhint(hid, 'dp-why', { 'data-hint': 'hidden-hire' }) : null) : null;
    return h('div', { class: `dp-card${isOpen && !held ? ' open' : ''}${dim ? ' grey' : ''}`, 'data-hire': hh.uid, 'data-job': held ? 'held' : j.job, 'data-held': held ? '1' : null, 'data-hidden': hh.hidden ? '1' : null },
        head, held ? vhint(grey, 'dp-why', { 'data-hint': 'held-hire' }) : null, body);
}

// Lure / Send at / Stay out
function jobRow(X, plan, hh, isTaker) {
    const { st, p, render } = X, j = plan.jobs[hh.uid];
    const noLure = !(p.lurable ?? []).some(d => !Object.entries(plan.jobs).some(([u, x]) => u !== hh.uid && x.job === 'lure' && x.den === d.uid));
    const noTarget = !(p.targets ?? []).length;
    const b = (job, off = null) => h('button', { type: 'button', class: `ds-btn${j.job === job ? ' on' : ''}${off ? ' is-dim' : ''}`, 'data-job-set': job, 'aria-pressed': j.job === job ? 'true' : 'false', 'aria-disabled': off ? 'true' : null,
        onclick: () => { if (off) { X.say(off); return; } D.setJob(st, p, plan, hh.uid, job); render(); } }, jobWords[job]);
    const takerCan = D.takerNow(st, p, plan);
    return h('div', { class: 'cb-aim dp-jobs', role: 'group', 'aria-label': `What ${hh.name} does` },
        b('lure', noLure ? 'There is nothing left for him to lure.' : null),
        b('send', noTarget ? 'There is nothing to send him at.' : takerCan?.uid === hh.uid && j.job !== 'send' ? 'He takes the creatures nobody lured, so he is being attacked and cannot be sent (8.3.6a).' : null),
        b('out'));
}

// the creatures to pick from (lure: those nobody has lured; send: any creature)
function pickerFor(X, plan, hh, j) {
    const { st, data, p, render } = X;
    if (j.job === 'out') return null;
    const lure = j.job === 'lure', list = lure ? (p.lurable ?? []) : (p.targets ?? []);
    const byOther = uid => Object.entries(plan.jobs).find(([u, x]) => u !== hh.uid && x.job === 'lure' && x.den === uid)?.[0] ?? null;
    const den = uid => st.combat.dens.find(d => d.uid === uid);
    const notes = [];
    const btns = list.map(d => {
        const taken = lure ? byOther(d.uid) : null, on = j.den === d.uid, rec = den(d.uid);
        const tag = rec?.bystander ? 'its group joins in' : rec?.pacified ? 'its spell breaks' : taken ? `${D.hireOfUid(p, taken)?.name?.split(' ')[0] ?? 'another'} lured it` : null;
        if (on && rec?.bystander) notes.push(bystanderWhy);
        if (on && rec?.pacified) notes.push(calmWhy);
        return h('button', { type: 'button', class: `ds-btn dp-den${on ? ' on' : ''}${taken ? ' is-dim' : ''}`, 'data-den': d.uid, 'aria-pressed': on ? 'true' : 'false', 'aria-disabled': taken ? 'true' : null,
            onclick: () => { if (taken) { X.say(`${D.hireOfUid(p, taken)?.name} has lured that creature already: each creature is lured once (8.3.4d).`); return; } D.setJob(st, p, plan, hh.uid, j.job, d.uid); render(); } },
            counterBox(st, data, d.uid, 32, 'dp-mini'), h('span', { class: 'dp-dname' }, nm(d.name), tag ? h('small', {}, tag) : null));
    });
    return h('div', { class: 'dp-pick', 'data-pick': j.job },
        h('p', { class: 'cb-hint' }, lure ? 'Which creature does he lure?' : 'Which creature is he sent at?'),
        h('div', { class: 'cb-aim' }, ...btns), ...notes.map(n => vhint(n, 'dp-why', { 'data-hint': 'warn' })));
}

// his two sides, his horse, and where he stands in the order (only for a hireling who is sent: 8.3.6a.4)
function turnBlock(X, plan, hh, j, sends) {
    const { st, data, render } = X;
    const rows = [];
    // the counter, both sides shown: the one that fights is ringed
    const sideBtn = side => {
        const f = D.sideFacts(st, data, hh, side), on = (j.side ?? hh.side) === side;
        return h('button', { type: 'button', class: `dp-side${on ? ' on' : ''}`, 'data-side': side, 'aria-pressed': on ? 'true' : 'false', 'aria-label': `${D.SIDE_WORD[side]}, ${f.text}${on ? ', fighting' : ''}`, onclick: () => { j.side = side; render(); } },
            h('span', { class: 'ds-cs-wrap', 'aria-hidden': 'true' }, counterEl(st, data, hh.uid, 56, side)), h('small', {}, `${side === 'light' ? 'Light' : 'Dark'} · ${f.text}`));
    };
    const sides = (hh.sides ?? ['light', 'dark']);
    rows.push(h('div', { class: 'dp-turn', 'data-turn': 'side' }, ...(sides.length > 1 ? sides.map(sideBtn) : [h('p', { class: 'cb-hint' }, 'He has one side only.')])));
    if (hh.horse) {
        const horseBtn = side => {
            const f = D.horseFacts(data, hh, side), on = (j.horse ?? hh.horse.side) === side;
            return h('button', { type: 'button', class: `ds-btn${on ? ' on' : ''}`, 'data-horse': side, 'aria-pressed': on ? 'true' : 'false', onclick: () => { j.horse = side; render(); } },
                h('span', { class: 'dp-hname' }, cap(D.HORSE_WORD[side]), f ? h('small', {}, `${f.name} · moves ${f.move}`) : null));
        };
        rows.push(h('div', { class: 'dp-horse', 'data-turn': 'horse' }, h('p', { class: 'cb-hint' }, `His ${D.horseFacts(data, hh, hh.horse.side)?.name?.toLowerCase() ?? 'horse'} is alive and comes with him.`), h('div', { class: 'cb-aim' }, horseBtn('light'), horseBtn('dark'))));
    } else if (data.natives?.[hh.id]?.horse) {
        rows.push(h('p', { class: 'cb-hint', 'data-turn': 'nohorse' }, 'He has no horse in this fight: it is dead, or this is a cave.'));
    }
    if (sends.length > 1) {
        const i = sends.indexOf(hh.uid);
        rows.push(h('div', { class: 'dp-order', 'data-order': String(i + 1) }, h('span', {}, `Goes in ${ORD[i] ?? i + 1} of ${numWord(sends.length)}`),
            h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'order-earlier', onclick: () => { D.moveEarlier(plan, hh.uid); render(); } }, i === 0 ? 'Move to last' : 'Move earlier')));
        rows.push(vhint(DEPLOY_WORDS.order, '', { 'data-hint': 'order' }));
    }
    rows.push(vhint(DEPLOY_WORDS.turn, '', { 'data-hint': 'turn' }));
    return h('div', { class: 'dp-turnblock' }, ...rows);
}

// the hidden hero: lure the rest himself (and be seen)
function heroBlock(X, plan, taker) {
    const { st, p, render } = X;
    const can = D.heroCanLure(st, p, plan), on = !!plan.heroLures && can;
    return h('div', { class: `dp-hero${on ? ' on' : ''}`, 'data-hero-lure': on ? 'on' : 'off' },
        h('button', { type: 'button', class: `ds-btn${on ? ' on' : ''}${can ? '' : ' is-dim'}`, 'data-act': 'hero-lure', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-disabled': can ? null : 'true',
            onclick: () => { if (!can) { X.say('There is nothing left for you to lure: your hirelings have drawn every creature.'); return; } D.setHeroLures(st, p, plan, !plan.heroLures); render(); } }, on ? 'You lure the rest: you are seen' : 'Stay hidden: you lure nothing'),
        vhint(DEPLOY_WORDS.heroHidden, '', { 'data-hint': 'hero-hidden' }));
}

// with the hero hidden: which hireling takes whatever nobody lured
function takerBlock(X, plan, taker) {
    const { st, p, render } = X;
    const pool = D.takersOf(p, plan);
    if (!pool.length) return vhint(DEPLOY_WORDS.nobody, 'dp-note', { 'data-hint': 'nobody' });
    const rows = D.hiresOf(p).map(hh => {
        const ok = pool.some(x => x.uid === hh.uid), on = taker?.uid === hh.uid;
        const why = hh.held ? D.greyWhy(hh).story : hh.hidden ? 'He is hidden: nothing can be set on him.' : null;
        return h('button', { type: 'button', class: `ds-btn${on ? ' on' : ''}${ok ? '' : ' is-dim'}`, 'data-taker': hh.uid, 'aria-pressed': on ? 'true' : 'false', 'aria-disabled': ok ? null : 'true', 'aria-label': `${hh.name}${why ? `: ${why}` : ''}`,
            onclick: () => { if (!ok) { X.say(why ?? 'He cannot take them.'); return; } D.setTaker(st, p, plan, hh.uid); render(); } }, h('span', { class: 'dp-dname' }, nm(hh.name), why ? h('small', {}, hh.held ? 'held' : 'hidden') : null));
    });
    return h('div', { class: 'dp-taker', 'data-taker-block': '' }, h('p', { class: 'cb-hint' }, 'Who takes the creatures nobody lured?'), h('div', { class: 'cb-aim' }, ...rows), vhint(DEPLOY_WORDS.taker, '', { 'data-hint': 'taker' }));
}

// the narrator's line over the Deployment (Story and Detail): the rule of the step in one breath, the cards below have the choices
export function deployNarration(X) {
    const { p, c } = X;
    const hires = D.hiresOf(p).filter(x => !x.held);
    if (!hires.length) return ['Your hirelings are held fast. Nothing can be done for them now.', `Round ${c.round}, Deployment: a Tremendous monster holds every hireling (8.6.2).`];
    return [DEPLOY_WORDS.intro.story, `Round ${c.round}, ${DEPLOY_WORDS.intro.detail}`];
}
