// play/results.js: the result cards: the morning report, the journal, the death box, the end-of-game sheet, and the restart (new goals) sheet.
import { nameOfClearing } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { h } from '../../dom.js';
import { lastDayOf, overTitle } from '../../gametext.js';
import { logText, voice, voiceChip } from '../../voice.js';
import { act } from './actions.js';
import { modal, voidBy } from './kit.js';
import { render } from './shell.js';
import { clearSaved } from './state.js';

// The lines of a group, with each combat round in a box of its own under a "Round N" marker.
function roundBoxes(lines) {
    const out = [];
    let cur = null;
    for (const l of lines) {
        const line = h('p', { class: `j-${l.k}` }, logText(l));
        if (l.r == null) { cur = null; out.push(line); continue; }
        if (!cur || cur.r !== l.r) {
            cur = { r: l.r, box: h('div', { class: 'roundbox' }, h('div', { class: 'roundmark' }, `Round ${l.r}`)) };
            out.push(cur.box);
        }
        cur.box.append(line);
    }
    return out;
}

// The morning review: first the result alone, then (after Next) the day step by step, each step a triangle holding its explanation.
export function reportSheet(G) {
    const day = G.st.day - 1;
    const prev = G.st.log.filter(l => l.day === day && l.k !== 'day' || (l.day === day && /sun sets/.test(l.t)));
    const rep = G.st.report?.day === day ? G.st.report : null;
    const sign = n => (n > 0 ? `+${n}` : String(n));
    const chips = rep ? [['Fame', rep.fame], ['Notoriety', rep.notoriety], ['Gold', rep.gold]].filter(x => x[1]) : [];
    const heads = prev.filter(l => !(voice() === 'story' && l.k === 'roll') && (/^You kill |^You die|^Every action chit|^You wound |dies\b|^Loot \(|^You take|^You buy|^You pay|curse/i.test(l.t) || ['loot', 'curse', 'discover'].includes(l.k)));
    const seen = new Set(), result = [];
    for (const l of heads) { const t = logText(l).trim(); if (!seen.has(t)) { seen.add(t); result.push(l); } }
    if (G.ui.reportPage !== day + ':overview') {
        return modal(G, `Day ${day}: the result`, h('div', { class: 'reportsheet' },
            h('div', { class: 'res-head' }, h('span', {}), voiceChip()),
            h('div', { class: 'repchips' }, ...(chips.length ? chips.map(([n, v]) => h('span', { class: `repchip ${v > 0 ? 'up' : 'down'}${voidBy(G.st, n.toLowerCase()) ? ' void' : ''}`, title: voidBy(G.st, n.toLowerCase()) ? `Worthless: the ${voidBy(G.st, n.toLowerCase())} curse` : null }, `${n} ${sign(v)}`)) : [h('span', { class: 'repchip' }, 'No change in Fame, Notoriety or gold')])),
            ...(result.length ? result.slice(0, 5).map(l => h('p', { class: `j-${l.k}` }, voice() === 'story' ? logText(l) : l.t.replace(/ \(rolled [^)]*\)/, ''))) : [h('p', { class: 'hint' }, 'A quiet day: nothing was won or lost.')]),
            result.length > 5 ? h('p', { class: 'hint' }, `and ${result.length - 5} more: see the overview.`) : null,
            h('div', { class: 'row2' },
                h('button', { class: 'btn', 'data-act': 'report-next', onclick: () => { G.ui.reportPage = `${day}:overview`; render(G); } }, 'Day Overview'),
                h('button', { class: 'btn primary', 'data-act': 'report-ok', onclick: () => { G.ui.reportedDay = G.st.day; render(G); } }, `On to day ${G.st.day}`))));
    }
    // group the day's lines under the phase or the evening they belong to
    const groups = [];
    for (const l of prev) {
        if (l.k === 'phase') groups.push({ head: logText(l), kids: [] });
        else if (/sun sets/.test(l.t) || !groups.length) groups.push({ head: /sun sets/.test(l.t) ? 'The evening' : 'Morning', kids: [] });
        else groups.at(-1).kids.push(l);
    }
    const show = groups.filter(g => g.kids.length || /^Phase/.test(g.head));
    return modal(G, `Day ${day}: overview`, h('div', { class: 'reportsheet' },
        ...show.map(g => g.kids.length
            ? h('details', { class: 'repstep' }, h('summary', {}, g.head), ...roundBoxes(g.kids))
            : h('p', { class: 'repstep plain' }, g.head)),
        h('div', { class: 'row2' },
            h('button', { class: 'btn', onclick: () => { G.ui.reportPage = null; render(G); } }, 'Result'),
            h('button', { class: 'btn primary', 'data-act': 'report-ok', onclick: () => { G.ui.reportedDay = G.st.day; render(G); } }, `On to day ${G.st.day}`))));
}

export function logSheet(G) {
    return modal(G, 'Journal', h('div', { class: 'journal' }, h('div', { class: 'res-head' }, h('span', { class: 'hint' }, voice() === 'story' ? 'Told as a story' : 'In exact words'), voiceChip()), ...[...G.st.log].reverse().slice(0, 80).map(l => h('p', { class: `j-${l.k}` }, h('small', {}, `Day ${l.day}`), ' ', logText(l)))),
        { close: () => { G.ui.sheet = null; render(G); } });
}

// How it ended, said loudly: who or what did it, where, which day, and what he had earned.
export function deathBox(G) {
    const o = G.st.over ?? {};
    const by = o.by ? o.by.replace(/ #\d+$/, '') : null;
    const where = nameOfClearing(o.at ?? G.st.ch.at).replace(/ (\d+)$/, '\u00A0$1');       // the place's number stays with its name
    return h('div', { class: 'deathbox', role: 'alert' },
        h('b', {}, 'You have died'),
        h('span', { class: 'dwho' }, by ? `Slain by the ${by} at ${where}, on day ${o.day ?? G.st.day}.` : `Fallen at ${where}, on day ${o.day ?? G.st.day}.`),
        o.text && !by ? h('small', {}, o.text) : null,
        h('span', { class: 'dstats' }, `Fame ${G.st.ch.fame} \u00B7 Notoriety ${G.st.ch.notoriety} \u00B7 ${G.st.ch.gold} gold`));
}

export function overSheet(G) {
    const s = G.st.score;
    const dead = G.st.over?.reason === 'died';
    const canRestart = dead && G.st.mode !== 'endless' && G.st.day < (G.st.lastDay ?? 28);
    if (canRestart && G.ui.restartVp) return restartSheet(G);
    const sign = n => (n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : '0');
    const NAME = { great: 'Great Treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
    const rows = s.rows ?? [], active = rows.filter(r => r.need > 0), idle = rows.filter(r => !(r.need > 0));
    const goalCard = r => {
        const pts = r.basic + r.bonus, met = r.diff >= 0, frac = Math.max(0, Math.min(1, r.need ? r.earned / r.need : 0));
        return h('section', { class: `ovgoal ${r.cat} ${met ? 'met' : 'short'}` },
            h('span', { class: 'ov-name' }, NAME[r.cat] ?? r.cat),
            h('div', { class: 'ov-top' },
                h('div', { class: 'ov-fig' }, h('b', {}, String(r.earned)), h('small', {}, ` of ${r.need}`)),
                h('div', { class: `ov-pts ${pts >= 0 ? 'up' : 'down'}` }, sign(pts))),
            h('div', { class: 'goalbar', role: 'img', 'aria-label': `${r.earned} of ${r.need}` }, h('i', { style: `width:${Math.round(frac * 100)}%` })),
            h('p', { class: 'ov-line' }, met ? (r.diff > 0 ? `Past the goal by ${r.diff}.` : 'Exactly on the goal.') : `Short by ${-r.diff}: counted three times.`));
    };
    const hero = G.st.ch?.name ?? 'Your hero', days = G.st.day;
    const verdict = dead ? null : s.won
        ? h('div', { class: 'ov-hero win', role: 'status' },
            h('small', {}, 'Victory'),
            h('div', { class: 'ov-total' }, sign(s.total)),
            h('p', {}, `${hero} ends the ${lastDayOf(G.st) === 28 ? 'month' : 'game'} on day ${days}, and the Realm is kept.`))
        : h('div', { class: 'ov-hero lose', role: 'status' },
            h('small', {}, 'Not enough'),
            h('div', { class: 'ov-total' }, sign(s.total)),
            h('p', {}, `${hero} ends the ${lastDayOf(G.st) === 28 ? 'month' : 'game'} on day ${days} short of what was set out to do.`));
    return modal(G, overTitle(G.st, dead), h('div', { class: 'oversheet' },
        dead ? deathBox(G) : verdict,
        dead ? h('p', { class: 'hint' }, 'A dead character scores \u2212100.') : null,
        dead
            ? h('details', { class: 'ov-details' }, h('summary', {}, 'What you had earned'), ...active.map(goalCard))
            : h('div', { class: 'ov-goals' }, ...active.map(goalCard)),
        !dead && idle.length ? h('details', { class: 'ov-details' }, h('summary', {}, 'Goals you put no points on'), ...idle.map(r => h('p', { class: 'hint' }, `${NAME[r.cat] ?? r.cat}: ${r.earned} earned.`))) : null,
        G.st.deaths ? h('p', { class: 'hint' }, `You died ${G.st.deaths} time${G.st.deaths === 1 ? '' : 's'} on the way.`) : null,
        h('div', { class: 'row-end ov-actions' },
            canRestart ? h('button', { class: 'btn primary', 'data-act': 'restart', onclick: () => { const total = Math.max(2, Math.ceil(((G.st.lastDay ?? 28) - G.st.day) / 7) + 1), fame = Math.min(5, Math.ceil(total * 0.6)); G.ui.restartVp = { great: 0, spells: 0, fame, notoriety: Math.min(5, total - fame), gold: 0 }; render(G); } }, `Return tomorrow as a new ${G.st.ch.name}`) : null,
            h('button', { class: `btn${canRestart ? '' : ' primary'}`, 'data-act': 'over-title', onclick: () => { clearSaved(); G.ctx.go('title'); } }, 'Back to the title'))));
}

function restartSheet(G) {
    const weeks = Math.ceil(((G.st.lastDay ?? 28) - G.st.day) / 7), total = Math.max(2, weeks + 1), v = G.ui.restartVp;
    const used = Object.values(v).reduce((a, b) => a + b, 0);
    const rows = [['fame', 'Fame', 10], ['notoriety', 'Notoriety', 20], ['gold', 'Gold', 30], ['great', 'Great treasures', 1], ['spells', 'Spells', 2]];
    return modal(G, `A new ${G.st.ch.name}`, h('div', {},
        ask('Your character is dead: set the goals for the next one.', 'A new character arrives at the Inn tomorrow with fresh chits and gear. The goals you set now are what he will be scored against at the end of the game.'),
        h('p', {}, `He arrives at the Inn tomorrow. With ${weeks} week${weeks === 1 ? '' : 's'} left he has ${total} victory points to spend.`),
        ...rows.map(([k, label, f]) => h('div', { class: 'vprow' },
            h('div', { class: 'vp-l' }, h('b', {}, label), h('small', {}, v[k] ? `goal: ${v[k] * f}` : 'no goal')),
            h('div', { class: 'stepper' },
                h('button', { class: 'step-btn', disabled: v[k] <= 0, onclick: () => { v[k]--; render(G); } }, '\u2212'),
                h('div', { class: 'step-val' }, h('b', {}, String(v[k]))),
                h('button', { class: 'step-btn', disabled: used >= total || v[k] >= 5, onclick: () => { v[k]++; render(G); } }, '+')))),
        h('p', { class: used === total ? 'hint' : 'hint bad' }, used === total ? 'All points spent.' : `${total - used} left to spend.`),
        h('button', { class: 'btn primary', disabled: used !== total, 'data-act': 'restart-go', onclick: () => { const vp = { ...v }; G.ui.restartVp = null; G.ui.sheet = null; act(G, { type: 'restart', vp }); } }, 'Begin')),
        { close: () => { G.ui.restartVp = null; render(G); } });
}
