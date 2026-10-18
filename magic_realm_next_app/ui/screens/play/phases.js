// play/phases.js: the day's phase screens: how a planned phase is worded (describeSlot, searchWhere, phaseResultLine), the end-of-turn sheet, and the small decision sheets
// (Prophecy pick, effort cost, Rest, Reading Runes).
import { chitLabel } from '../../../engine/day.js';
import { nameOfClearing, numOf, tileOf } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { h } from '../../dom.js';
import { meetLines, playerOf as playerNameOf } from '../../meet.js';
import { logText, voice } from '../../voice.js';
import { act } from './actions.js';
import { ACT_LABEL, TABLE_LABEL, modal, mrChit } from './kit.js';
import { mountSheet } from '../kit/common.js';
import { learnContent } from '../kit/spells.js';
import { render } from './shell.js';

// Where a Search will be made, and what the map already shows of sites on this tile: a site in another clearing is not found from here.
export function searchWhere(G, at) {
    if (!at) return null;
    const tile = tileOf(at), n = numOf(at);
    const sites = G.st.chits.filter(c => c.kind === 'site' && c.tile === tile && !c.pile && c.up);
    const away = sites.filter(c => c.num !== n);
    const there = away.map(c => `the ${c.name} is in clearing ${c.num}`).join(', ');
    return `You will search in ${nameOfClearing(at)}.${sites.some(c => c.num === n) ? '' : ' No site is revealed here yet.'}${there ? ` ${there.charAt(0).toUpperCase()}${there.slice(1)}: a search only finds what is in the clearing you are in, so Move there first.` : ''}`;
}

// a table's name for the player: the site card he found is named (Loot the Crypt of the Knight)
export function tableName(G, t) {
    if (t !== 'sitecard') return TABLE_LABEL[t] ?? t;
    const id = G.st.ch.siteCards?.[G.st.ch.at]?.[0];
    return id ? `Loot the ${G.data.treasures?.[id]?.name ?? 'site card'}` : TABLE_LABEL[t];
}

// What a phase that has just been played came to, in the current voice: the story line, or the exact words (dice and all).
export function phaseResultLine(G, n, fallback = null) {
    const l = [...G.st.log].reverse().find(x => x.k === 'phase' && x.day === G.st.day && x.t.startsWith(`Phase ${n}:`));
    if (!l) return fallback ? { text: fallback.replace(/^Phase \d+:\s*/, ''), bad: false } : null;
    const detail = l.t.replace(/^Phase \d+:\s*/, '');
    const bad = /fail to hide|you are seen|nothing at that depth|cancelled|are lost|blocked|no one here|will not|cannot/i.test(detail);
    return { text: voice() === 'story' ? logText(l, G.st) : detail, bad };
}

export function describeSlot(G, s) {
    if (!s || s.act === 'nothing') return 'Do nothing';
    if (s.act === 'move') return `Move to ${nameOfClearing(s.to).replace(/ (\d+)$/, '\u00A0$1')}`;       // the number never wraps on its own line
    if (s.act === 'search') return s.table ? `Search: ${tableName(G, s.table)}` : 'Search';
    if (s.act === 'follow') return s.who ? `Follow ${playerNameOf(G.st, s.who)}` : 'Follow';
    return ACT_LABEL[s.act] ?? s.act;
}

// What happened when his turn ended: chits turned up, creatures that came, natives that appeared, being blocked.
export function turnEndSheet(G) {
    const t = G.st.turnEnd;
    const lines = [];
    const KIND = { warning: 'warning chit', sound: 'sound chit', site: 'site chit', 'lost-city': 'the Lost City', 'lost-castle': 'the Lost Castle' };
    const monsterIcon = n => G.data.art?.monstersColor?.[n] ?? G.data.art?.monsters?.[n] ?? null;
    const quietChits = t.chits.filter(c => !(c.summons?.length));
    for (const c of t.chits.filter(c => c.summons?.length)) {
        const counts = new Map(); for (const n of c.summons) counts.set(n, (counts.get(n) ?? 0) + 1);
        const where = c.dest === t.at ? 'to your clearing' : c.dest ? `to clearing ${numOf(c.dest)}` : '';
        const out = counts.size
            ? h('span', { class: 'callout' }, h('small', {}, 'Calls out'), ...[...counts].map(([n, k]) => h('span', { class: 'who' }, monsterIcon(n) ? h('img', { class: 'ico', src: monsterIcon(n), alt: '' }) : null, h('b', {}, `${k > 1 ? k + ' ' : ''}${n}`))), h('small', {}, where))
            : h('span', { class: 'callout' }, h('small', {}, `Calls nothing out today${c.why ? `: ${c.why}` : ''}.`));
        lines.push(h('div', { class: 'crow chit' }, mrChit(c), out));
    }
    if (quietChits.length) lines.push(h('div', { class: 'crow chit quiet', 'data-quiet-chits': String(quietChits.length) }, h('small', {}, voice() === 'story' ? `The other chits stay quiet today: ${[...new Set(quietChits.map(c => c.name ?? c.kind))].join(', ')}.` : `Call nothing out today (row not prowling; Monster Roll ${G.st.prowl ?? '?'}): ${[...new Set(quietChits.map(c => c.name ?? c.kind))].join(', ')}.`)));
    for (const a of t.arrivals.filter(a => a.why === 'prowls in your tile')) lines.push(h('div', { class: 'crow mon' }, h('b', {}, `${a.name} arrives`), h('small', {}, `it was prowling in this tile and comes to your clearing`)));
    for (const nn of t.natives) lines.push(h('div', { class: 'crow nat' }, h('b', {}, `The ${nn.group} appear`), h('small', {}, `${nn.count} of them, at the ${nn.at}`)));
    if (t.blocked) lines.push(h('div', { class: 'crow mon' }, h('b', {}, t.blockers.length ? `Blocked by ${[...new Set(t.blockers)].join(', ')}` : 'Your turn was cut short'), h('small', {}, 'the rest of your turn was lost')));
    if (!t.blocked && t.closedIn?.length) lines.push(h('div', { class: 'crow mon' }, h('b', {}, `${[...new Set(t.closedIn)].join(', ')} ${new Set(t.closedIn).size === 1 && t.closedIn.length === 1 ? 'arrives' : 'arrive'} and ${t.closedIn.length === 1 ? 'finds' : 'find'} you`), h('small', {}, 'your turn was already over, so nothing was lost')));
    const hide = r => /hide|hidden|seen/i.test(r ?? '');
    // Blocked: the phases still to come, extra ones included, are lost with the rest of the turn.
    const lostPhases = (t.blocked ? (G.st.plan ?? []).map((s, i) => ({ i, s })).filter(x => x.i >= (t.plan?.length ?? 0) && x.s && x.s.act !== 'nothing').map(x => ({ i: x.i, what: describeSlot(G, x.s) })) : []);
    const summary = t.plan?.length ? h('details', { class: 'daydid', open: true }, h('summary', {}, 'What you did today'),
        ...t.plan.map((r, i) => h('p', { class: `daydid-row${hide(r) ? ' hide' : ''}${i === t.plan.length - 1 ? ' latest' : ''}` }, h('b', {}, `Phase ${i + 1}`), ` ${phaseResultLine(G, i + 1, r ?? 'nothing')?.text ?? (r ?? 'nothing').replace(/^Phase \d+:\s*/, '')}`)),
        ...lostPhases.map(l => h('p', { class: 'daydid-row lost' }, h('b', {}, `Phase ${l.i + 1}`), ` ${l.what}: lost, because you were blocked.`))) : null;
    // Shared Daylight (7.12.4): monsters that arrived at someone else's turn's end closed in on him before his own chit was drawn; he has no turn today.
    const noTurnLine = t.noTurn ? [...G.st.log].reverse().find(l => l.k === 'block' && l.day === G.st.day && l.who === G.st.ch.id) : null;
    const why = t.noTurn ? `Creatures closed in on you before your chit was drawn, so you are seen and have no turn today. Nothing was lost but the turn.`
        : t.blocked ? `${t.blockers.length ? [...new Set(t.blockers)].join(', ') + ' closed in' : 'Your turn was cut short'}, so you are seen${lostPhases.length ? ` and your remaining ${lostPhases.length === 1 ? 'phase is' : 'phases are'} lost` : ''}.`
        : t.closedIn?.length ? `${[...new Set(t.closedIn)].join(', ')} found you after your turn was over, so you are seen. No phase was lost.`
        : t.hidden ? 'Nothing here can be set on you this evening unless you strike first.' : 'Whatever shares your clearing will fight you this evening.';
    const status = h('div', { class: `endstatus ${t.hidden ? 'hidden' : 'seen'}`, 'data-no-turn': t.noTurn ? '1' : null }, h('b', {}, t.noTurn ? 'You have no turn today' : t.hidden ? 'You are hidden' : 'You are in plain sight'), h('small', {}, why),
        noTurnLine ? h('small', {}, logText(noTurnLine, G.st)) : null);
    const callouts = lines.length ? [h('h3', {}, 'At the end of your turn'), ...lines] : [];
    // Blocked by other characters (7.12): told first, in a card of its own, with who did it
    const bl = G.shared && !t.noTurn ? meetLines(G.st, G.st.ch.id).filter(l => l.kind === 'blocked').at(-1) : null;
    const blockCardEl = bl && t.blocked ? h('div', { class: 'phase-result bad meet-result', role: 'status', 'data-meet-result': 'blocked' }, h('div', { class: 'pr-head' }, h('small', {}, 'Blocked')), h('p', { class: 'pr-line' }, voice() === 'story' ? bl.story : bl.text)) : null;
    return modal(G, `End of your turn at ${nameOfClearing(t.at)}`, h('div', { class: 'clearing' },
        blockCardEl, status, summary, ...callouts,
        h('button', { class: 'btn primary', 'data-act': 'turn-ok', onclick: () => act(G, { type: 'continue' }) }, 'End turn')), { kind: 'result' });
}

// Prophecy: the details of the phase being chosen (where to, which table, which chit), then it is sent.
export function pickSheet(G, p) {
    const act2 = G.ui.pickAct, send = slot => { G.ui.pickAct = null; act(G, { type: 'pick', slot }); };
    const rows = [];
    if (act2 === 'move') rows.push(h('p', { class: 'hint' }, 'Where to?'), ...(p.moves ?? []).map(id => h('button', { class: 'btn', 'data-pick-to': id, onclick: () => send({ act: 'move', to: id }) }, nameOfClearing(id))));
    else if (act2 === 'search') rows.push(h('p', { class: 'hint' }, 'Which Search?'), ...(p.tables ?? []).map(t => h('button', { class: 'btn', 'data-pick-table': t, onclick: () => send({ act: 'search', table: t }) }, tableName(G, t))));
    else if (act2 === 'alert') {
        rows.push(h('p', { class: 'hint' }, 'Ready your weapon, or alert a Magic chit (time 0, tires at Midnight if unused).'), h('button', { class: 'btn', onclick: () => send({ act: 'alert' }) }, 'Weapon'),
            ...G.st.ch.chits.filter(c => c.type === 'magic' && c.state === 'active').map(c => h('button', { class: 'btn', 'data-pick-magic': c.id, onclick: () => send({ act: 'alert', magic: c.id }) }, `Magic ${c.numeral}${c.time}${'*'.repeat(c.effort)}`)));
    } else rows.push(h('button', { class: 'btn primary', onclick: () => send({ act: act2 }) }, `Do it: ${ACT_LABEL[act2] ?? act2}`));
    return modal(G, `Phase ${p.i + 1}: ${ACT_LABEL[act2] ?? act2}`, h('div', { class: 'restsheet' }, ...rows), { close: () => { G.ui.pickAct = null; render(G); }, kind: 'decision' });
}

// Resting: the twelve chits are on the table; tap the one you want back. A chit worth two asterisks needs "change": then tap the ready
// one-asterisk chit you give up for it.
// Cairns / Pool: tap the chit that pays an asterisk of effort (a two-asterisk chit may make change for a tired one-asterisk chit).
export function effortSheet(G, p) {
    const sameKind = (a, b) => a.type === b.type && (a.strength ?? a.numeral) === (b.strength ?? b.numeral) && a.time === b.time && a.effort === b.effort;
    const chits = G.st.ch.chits;
    const optIdx = p.options.map((o, n) => ({ o, n }));
    const payer = id => { const c = chits.find(x => x.id === id); return optIdx.filter(({ o }) => sameKind(chits.find(x => x.id === o.chit), c)); };
    const waiting = G.ui.effortChit && payer(G.ui.effortChit).length ? chits.find(c => c.id === G.ui.effortChit) : null;
    const backs = waiting ? payer(waiting.id).filter(({ o }) => o.back) : [];
    const tile = c => {
        const label = c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`;
        const opts = payer(c.id);
        const canPay = !waiting && opts.length > 0;
        const canBack = !!waiting && backs.some(({ o }) => sameKind(chits.find(x => x.id === o.back), c));
        const isWaiting = waiting?.id === c.id;
        return h('button', { class: `chit2 ${c.type} ${c.state}${canPay || canBack ? ' pick' : ''}${isWaiting ? ' sel' : ''}${canPay || canBack || isWaiting ? '' : ' off'}`, 'data-effort-chit': c.id, disabled: !(canPay || canBack) || null,
            onclick: () => {
                if (canBack) { const hit = backs.find(({ o }) => sameKind(chits.find(x => x.id === o.back), c)); G.ui.effortChit = null; act(G, { type: 'effort-cost', n: hit.n }); return; }
                const plain = opts.find(({ o }) => !o.back);
                if (plain && !opts.some(({ o }) => o.back)) { G.ui.effortChit = null; act(G, { type: 'effort-cost', n: plain.n }); return; }
                G.ui.effortChit = c.id; render(G);
            } },
            h('b', {}, label), h('span', {}, '*'.repeat(c.effort) || ' '), h('small', {}, `${c.type === 'move' ? 'Move' : c.type === 'fight' ? 'Fight' : 'Magic'}${c.state !== 'active' ? ` \u00B7 ${c.state === 'fatigued' ? 'tired' : 'wounded'}` : ''}`));
    };
    const plainOpt = waiting ? payer(waiting.id).find(({ o }) => !o.back) : null;
    return modal(G, `${p.site}: pay with effort`, h('div', { class: 'restsheet' },
        waiting
            ? ask(`Paying with ${chitLabel(waiting)}.`, 'It has two asterisks. Tap a tired one-asterisk chit to bring it back ready (making change), or pay with it outright.')
            : ask(p.site === 'Cairns' ? 'The Cairns take an asterisk of effort for every Loot roll, found or not: tap the chit that pays.' : 'The Pool takes an asterisk of effort each time something is taken from it: tap the chit that pays.',
                'The chit you tap is tired until you rest it. Only the chits glowing gold can pay now.'),
        h('div', { class: 'chitgrid' }, ...chits.map(tile)),
        waiting ? h('div', { class: 'row2' },
            plainOpt ? h('button', { class: 'btn primary', 'data-act': 'effort-plain', onclick: () => { G.ui.effortChit = null; act(G, { type: 'effort-cost', n: plainOpt.n }); } }, 'Just tire it') : null,
            h('button', { class: 'btn', onclick: () => { G.ui.effortChit = null; render(G); } }, 'Choose a different chit')) : null));
}

export function restSheet(G, p) {
    const mine = new Map();
    for (const o of p.options) (mine.get(o.chit) ?? mine.set(o.chit, []).get(o.chit)).push(o);
    const waiting = G.ui.restChit && mine.has(G.ui.restChit) ? G.ui.restChit : null;
    const changers = new Set(waiting ? mine.get(waiting).map(o => o.change).filter(Boolean) : []);
    const tile = c => {
        const label = c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`;
        const canRest = !waiting && mine.has(c.id), canChange = waiting && changers.has(c.id);
        const isWaiting = waiting === c.id;
        const on = canRest || canChange || isWaiting;
        return h('button', { class: `chit2 ${c.type} ${c.state}${canRest || canChange ? ' pick' : ''}${isWaiting ? ' sel' : ''}${on ? '' : ' off'}`, 'data-rest-chit': c.id, disabled: !(canRest || canChange) || null,
            onclick: () => {
                if (canChange) { const o = mine.get(waiting).find(x => x.change === c.id); G.ui.restChit = null; act(G, { type: 'rest', chit: o.chit, change: o.change }); return; }
                const opts = mine.get(c.id);
                const direct = opts.find(x => x.change == null);
                if (direct) { G.ui.restChit = null; act(G, { type: 'rest', chit: c.id }); } else { G.ui.restChit = c.id; render(G); }
            } },
            h('b', {}, label), h('span', {}, '*'.repeat(c.effort) || ' '), h('small', {}, `${c.type === 'move' ? 'Move' : c.type === 'fight' ? 'Fight' : 'Magic'}${c.state !== 'active' ? ` \u00B7 ${c.state === 'fatigued' ? 'tired' : 'wounded'}` : ''}`));
    };
    const target = waiting ? G.st.ch.chits.find(c => c.id === waiting) : null;
    return modal(G, 'Rest', h('div', { class: 'restsheet' },
        waiting
            ? ask(`Making change for ${chitLabel(target)}.`, 'A chit worth two asterisks costs two asterisks of rest. Tap the ready one-asterisk chit you will tire in exchange.')
            : ask('Your Rest phase: tap the chit you want back.', 'One Rest returns one asterisk of effort: a tired chit becomes ready again, or a wounded chit is healed (one with asterisks comes back tired). Only the chits glowing gold can be rested now.'),
        h('div', { class: 'chitgrid' }, ...G.st.ch.chits.map(tile)),
        waiting ? h('button', { class: 'btn', onclick: () => { G.ui.restChit = null; render(G); } }, 'Choose a different chit') : null));
}

// Reading Runes found a card he can learn.
// Reading Runes: the runes show a spell (P2: built in screens/kit/spells.js).
export function learnSheet(G, p) { return mountSheet(G, learnContent(G, p)); }
