// play/results.js: the Day Result (the morning report and its overview). The result card of a phase is result_card.js, the end of the game (death, victory) endscreen.js.
import { h } from '../../dom.js';
import { frames, voiceSwitch } from '../../ds.js';
import { actIcon, icon } from '../../icons.js';
import { logText } from '../../voice.js';
import { daySummary } from './dayresult.js';
import { modal, picOf, voidBy } from './kit.js';
import { render } from './shell.js';
import { vpNow } from './state.js';

// The lines of a group, with each combat round in a box of its own under a "Round N" marker (a round is always labelled: the marker and its lines are one box).
function roundBoxes(G, lines) {
    const out = [];
    let cur = null;
    for (const l of lines) {
        const line = h('p', { class: `j-${l.k}` }, logText(l, G.st));
        if (l.r == null) { cur = null; out.push(line); continue; }
        if (!cur || cur.r !== l.r) {
            cur = { r: l.r, box: h('div', { class: 'roundbox' }, h('div', { class: 'roundmark' }, `Round ${l.r}`)) };
            out.push(cur.box);
        }
        cur.box.append(line);
    }
    return out;
}

// A small counter picture for a thing in the day's rows: a monster or native counter, a weapon / armour / horse, else the treasure chest.
function pic(G, name, kind, group = null) {
    const a = G.data.art ?? {};
    // a native is named in the log with its number ("Rogue Swordsman 7"), the data has "Rogue Swordsman 7" or a rank name: match the name without the number, then the group's leader (QA-114)
    const bare = n => String(n).replace(/ #?\d+$/, '').trim(), nats = Object.values(G.data.natives ?? {});
    const nat = nats.find(n => n.name === name) ?? nats.find(n => bare(n.name) === bare(name)) ?? (group ? nats.find(n => n.group === group && n.leader) ?? nats.find(n => n.group === group) : null);
    const src = kind === 'mon' ? (a.monstersColor?.[name] ?? a.monsters?.[name] ?? (nat && a.natives?.[nat.id])) : (picOf(G, name) ?? null);
    return h('span', { class: 'ds-counter sm' }, src ? h('img', { src, alt: '' }) : actIcon('cache', 32));
}
const sgn = n => (n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : '0');

// Where the score stands, and why a quiet day can leave it far below zero: the game counts every goal not yet reached against you (three times its shortfall). The real number, said plainly (QA-114).
function scoreNote(G) {
    const vp = vpNow(G), goalVp = Object.values(G.st.ch.vp ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
    if (!goalVp && vp >= 0) return null;
    return h('p', { class: 'ds-meta dayres-score' },
        h('span', { 'data-v': 'story' }, vp < 0 ? `Your score stands at ${sgn(vp)}. A goal not yet reached counts against you until you earn it.` : `Your score stands at ${sgn(vp)}.`),
        h('span', { 'data-v': 'detail' }, `Score ${sgn(vp)} VP: the shortfall of every goal counts three times, until it is met.`));
}

// The morning review, as mockup 02 c3: first the day told in one sentence with its rows and its score (Story or Detail), then (Overview) the day step by step.
export function reportSheet(G) {
    const day = G.st.day - 1, sum = daySummary(G, day);
    const goOn = h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'report-ok', onclick: () => { G.ui.reportedDay = G.st.day; render(G); } }, `On to day\u00A0${G.st.day}`);
    if (G.ui.reportPage !== day + ':overview') {
        const group = list => { const c = new Map(); for (const n of list) c.set(n, (c.get(n) ?? 0) + 1); return [...c].map(([n, k]) => (k > 1 ? `${n} \u00D7${k}` : n)); };
        const row = (k, names, imgs) => h('div', { class: 'line', 'data-row': k.toLowerCase() }, h('span', { class: 'k' }, k), ...imgs, h('span', { class: 'what' }, names.join(' \u00B7 ')));
        const rows = [];
        if (sum.kills.length) { const n = group(sum.kills.map(k => k.name)); rows.push(row('Slain', n, [pic(G, sum.kills[0].name, 'mon')])); }
        if (sum.found.length) rows.push(row('Found', sum.found.map(f => f.name), [pic(G, sum.found[0].name, 'item')]));
        if (sum.bought.length) rows.push(row('Bought', sum.bought.map(b => `${b.name}, for ${b.cost} Gold`), [pic(G, sum.bought[0].name, 'item')]));
        if (sum.sold.length) rows.push(row('Sold', sum.sold.map(b => `${b.name}, for ${b.gold} Gold`), [pic(G, sum.sold[0].name, 'item')]));
        if (sum.hired.length) rows.push(row('Hired', sum.hired.map(x => x.name), [pic(G, sum.hired[0].name, 'mon', sum.hired[0].group)]));
        if (sum.curses.length) rows.push(row('Cursed', sum.curses, [h('span', { class: 'ds-counter sm' }, icon('skull'))]));
        const d = sum.deltas, v = k => voidBy(G.st, k === 'notor' ? 'notoriety' : k);
        const frame = sum.moved ? frames({ fame: sgn(d.fame), notor: sgn(d.notor), gold: sgn(d.gold) }) : null;
        if (frame) for (const [k, fs] of [['fame', frame.querySelector('.fame')], ['gold', frame.querySelector('.gold')]]) if (v(k)) { fs.classList.add('void'); fs.title = `Worthless: the ${v(k)} curse`; }
        const body = h('div', { class: 'reportsheet ds-dayres', 'data-quiet': sum.empty ? '1' : null },
            h('p', { class: 'ds-voice lg headline', 'data-v': 'story' }, sum.story), h('p', { class: 'ds-voice lg headline', 'data-v': 'detail' }, sum.detail),
            ...rows, frame, scoreNote(G));
        return modal(G, 'The day', body, { kind: 'result', detent: sum.empty ? 'hug' : 'tall', eyebrow: `Day ${day} \u00B7 midnight`, head: voiceSwitch(), bare: true, cls: 'dayres-sheet',
            footer: h('div', { class: 'dayres-foot' }, h('button', { type: 'button', class: 'ds-btn', 'data-act': 'report-next', onclick: () => { G.ui.reportPage = `${day}:overview`; render(G); } }, 'Overview'), goOn) });
    }
    // the overview: the day's lines under the phase or the evening they belong to
    const prev = G.st.log.filter(l => l.day === day && l.k !== 'day' || (l.day === day && /sun sets/.test(l.t)));
    const groups = [];
    for (const l of prev) {
        if (l.k === 'phase') groups.push({ head: logText(l, G.st), phase: true, n: /^Phase (\d+)/.exec(l.t)?.[1] ?? '', kids: [] });
        else if (/sun sets/.test(l.t) || !groups.length) groups.push({ head: /sun sets/.test(l.t) ? 'The evening' : 'Morning', n: /sun sets/.test(l.t) ? 'E' : '\u2014', kids: [] });
        else groups.at(-1).kids.push(l);
    }
    const show = groups.filter(g => g.kids.length || g.phase);
    const step = g => (g.kids.length
        ? h('details', { class: 'repstep' }, h('summary', {}, h('span', { class: 'ph' }, g.n), h('span', {}, g.head)), ...roundBoxes(G, g.kids))
        : h('p', { class: 'repstep plain' }, h('span', { class: 'ph' }, g.n), h('span', {}, g.head)));
    return modal(G, 'The day, step by step', h('div', { class: 'reportsheet ds-dayres overview' }, ...(show.length ? show.map(step) : [h('p', { class: 'ds-meta' }, 'Nothing happened.')])),
        { kind: 'result', detent: 'tall', eyebrow: `Day ${day} \u00B7 overview`, head: voiceSwitch(), bare: true, cls: 'dayres-sheet',
            footer: h('div', { class: 'dayres-foot' }, h('button', { type: 'button', class: 'ds-btn', 'data-act': 'report-back', onclick: () => { G.ui.reportPage = null; render(G); } }, 'Result'), goOn) });
}
