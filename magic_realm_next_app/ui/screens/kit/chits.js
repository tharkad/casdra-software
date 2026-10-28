// screens/kit/chits.js: the Chits room of the Kit sheet (only in a game with mission, campaign and visitor chits): "Chits I carry" (the destination or the foes, the days left, the reward, the foes still
// on the map and on the Setup Card, Abandon for a campaign), where the six chits are, and Row 6 of the Appearance Chart with the chit in each of its seven boxes.
// The engine's carriedTasks() says everything shown here; Abandon sends `abandon-chit` after a second tap.
import { carriedTasks, dwellingAt } from '../../../engine/missions.js';
import { nameOfClearing } from '../../../engine/world.js';
import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { chartEl, chitEl, costText, faceInfo, kindTag, whereWords, whyCopy } from '../../missions.js';
import { voicedWhy } from '../../spellwhy.js';
import { act } from '../play/actions.js';
import { render } from '../play/shell.js';
import { say } from './common.js';

const nb = s => String(s).replace(/ (\d+)$/, ' $1');
const list = a => (a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const ABANDON_OK = new Set(['phase', 'phase-pick', 'plan', 'turn-end', 'evening-end']);          // the engine's own list (day.js 'abandon-chit')

export const carriedCount = G => (G.st.missions ? (G.st.ch.missions ?? []).length : 0);
const foeWord = f => (/Dragon$/.test(f) ? `${f}s` : f);

function daysTag(t) {
    const n = t.daysLeft, low = n <= 3;
    return h('span', { class: `ds-tag ${low ? 'warn' : 'good'}`, 'data-days': String(n) }, n <= 1 ? 'Last day' : `${n} days left`);
}

// Give a campaign up: two taps, the first asks (nothing is refunded, and the cost is not paid again)
function abandonRow(G, t) {
    const key = `abandon:${t.chit}`, asking = G.ui.abandonAsk === key, between = ABANDON_OK.has(G.st.pending?.type);
    if (t.kind !== 'campaign') return h('p', { class: 'ds-meta ms-nogiveup' }, 'A mission cannot be given up. Keep it until it is delivered or the time runs out.');
    if (!t.mayAbandon || !between) {
        const why = !t.mayAbandon ? whyCopy('a foe of your campaign is still on the map: you cannot give it up (7.2.4j)') : { story: 'You can give a campaign up between phases, not in the middle of something.', detail: 'A campaign can be given up between phases, not in the middle of something (7.2.4j).' };
        return h('button', { type: 'button', class: 'ds-btn sm quiet is-dim ms-abandon', 'data-act': 'abandon-chit', 'aria-disabled': 'true', onclick: () => say(G, voicedWhy(why)) }, 'Give it up');
    }
    if (asking) return h('div', { class: 'ms-ask', 'data-abandon-ask': t.chit },
        h('span', { class: 'ds-why' }, `Give up the ${t.name} campaign? You get nothing back, and you do not pay again.`),
        h('div', { class: 'row2' },
            h('button', { type: 'button', class: 'ds-btn sm quiet', 'data-act': 'abandon-keep', onclick: () => { G.ui.abandonAsk = null; render(G); } }, 'Keep it'),
            h('button', { type: 'button', class: 'ds-btn sm danger', 'data-act': 'abandon-go', onclick: () => { G.ui.abandonAsk = null; act(G, { type: 'abandon-chit', chit: t.chit }); } }, 'Give it up')));
    return h('button', { type: 'button', class: 'ds-btn sm quiet ms-abandon', 'data-act': 'abandon-chit', 'data-chit': t.chit, onclick: () => { G.ui.abandonAsk = key; render(G); } }, 'Give it up');
}

// One chit he carries
function carriedCard(G, t) {
    const info = faceInfo(G.data, t.face), st = G.st;
    const lines = [];
    if (t.kind === 'mission') {
        const at = dwellingAt(st, t.dest);
        lines.push(h('p', { class: 'ds-voice ms-goal' }, at ? `Bring it to the ${t.dest}, ${nb(nameOfClearing(at))}.` : `Bring it to the ${t.dest}.`));
        lines.push(h('dl', { class: 'ds-kv ms-kv' },
            h('dt', {}, 'Reward'), h('dd', {}, `${t.reward} gold${t.clearings ? `, 2 for each of the ${t.clearings} clearings` : ', a flat 30'}`),
            h('dt', {}, 'You paid'), h('dd', {}, `${costText(t.cost)}: it comes back when you deliver it`)));
    } else {
        const f = t.foesLeft ?? { map: 0, card: 0, total: 0 };
        lines.push(h('p', { class: 'ds-voice ms-goal' }, `Kill every ${list(t.foes.map(foeWord))}.`));
        lines.push(h('dl', { class: 'ds-kv ms-kv' },
            h('dt', {}, 'Foes left'), h('dd', {}, `${f.map} on the map, ${f.card} on the card${f.total === 0 ? ': all dead' : ''}`),
            h('dt', {}, 'Friendlier'), h('dd', {}, t.partners.length ? list(t.partners) : 'nobody'),
            h('dt', {}, 'You paid'), h('dd', {}, `${costText(t.cost)}: it comes back when the last foe is dead`)));
        lines.push(h('p', { class: 'ds-meta' }, 'Your foes are Enemies while you carry it: you cannot buy them drinks.'));
    }
    return h('div', { class: `ds-group ms-card ${t.kind}`, 'data-carried': t.chit, 'data-kind': t.kind },
        h('div', { class: 'hd' }, chitEl(G.data, t.face), h('b', {}, t.name, kindTag(G.data, t.face)), daysTag(t)),
        ...lines,
        h('p', { class: 'ds-meta' }, `Taken on day ${t.day}. If the time runs out you pay ${costText(t.cost)} again.`),
        h('p', { class: 'ds-meta ms-rule', 'data-v': 'detail' }, t.kind === 'mission'
            ? `Rules 7.2.4e, 7.2.4d: deliver it to the ${t.dest} by Midnight of day ${t.due}, counting the day you took it as the first. The reward is 2 gold for each clearing along the shortest route when you took it (30 if there is none), and the task is done the moment you enter the Dwelling's clearing. A mission cannot be given up (7.2.4b).`
            : `Rules 7.2.4f to 7.2.4j: the time runs out at Midnight of day ${t.due}. Your partners stand two levels higher and your foes are Enemies while you carry it (7.2.4h). It is won when every foe is dead at the same time, killed by you or by others (7.2.4i), and may be given up only when none of its foes is on the map (7.2.4j).`),
        abandonRow(G, t));
}

// Where each of the six chits lies, and a way to the clearing
function whereRows(G) {
    return G.st.missions.chits.map(c => {
        const info = faceInfo(G.data, c.face), here = !!c.loc?.c;
        const open = () => { G.ui.sel = c.loc.c; G.ui.sheet = 'clearing'; G.ui.peek = false; render(G); };
        const kids = [h('span', { class: 'art2' }, chitEl(G.data, c.face)),
            h('span', { class: 'main' }, h('b', {}, info.name, kindTag(G.data, c.face)), h('span', {}, c.loc?.c ? `Lying in ${nb(nameOfClearing(c.loc.c))}.` : c.loc?.by ? (c.loc.by === G.st.ch.id ? 'You carry it.' : `${whereWords(G.st, G.data, c)[0].toUpperCase()}${whereWords(G.st, G.data, c).slice(1)}.`) : `Still in its box on the Appearance Chart.`)),
            here ? icon('right') : null];
        return here ? h('button', { type: 'button', class: 'ds-row ms-where', 'data-act': 'chit-where', 'data-chit': c.id, onclick: open }, ...kids) : h('div', { class: 'ds-row ms-where', 'data-chit': c.id }, ...kids);
    });
}

const sect2 = (t, r) => h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, t), r ? h('small', {}, r) : null);

export function chitsTab(G) {
    const st = G.st, carried = carriedTasks(st, G.data);
    return h('div', { class: 'kit-room kit-chits-room', 'data-room': 'chits' },
        sect2('Chits I carry', carried.length ? `${carried.length}` : ''),
        carried.length ? h('div', { class: 'kit-groups ms-cards' }, carried.map(t => carriedCard(G, t)))
            : h('p', { class: 'kit-none', 'data-none': 'carried' }, 'You carry no chits. A mission or campaign chit that lies in your clearing can be taken at the start of a phase.'),
        sect2('The six chits', 'where they lie'),
        h('div', { class: 'ds-list' }, whereRows(G)),
        sect2('Row 6 of the Appearance Chart', 'the seven small boxes'),
        chartEl(G.data, st.missions.chits),
        h('p', { class: 'ds-meta' }, 'When Row 6 prowls, a leader or site here calls the chit of its box out onto the map. At the end of a week in which Row 6 prowls, the chits nobody carries turn over to their other side.'));
}
