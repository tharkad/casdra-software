// play/journal.js: the Journal (mockup 02-c2): one sheet for what the drawer, the dice sheet and the log used to be. A row of standing states (curse, the day's magic, spells in force,
// the wilds), what is new (an item, a find, a curse: tap to read it), the last roll with its dice, then the story so far, newest first, grouped by day, in the voice the player chose.
// Story | Detail sits in the head (one stored preference). It opens at half with the map above and remembers its detent (mr-journal-detent: half or tall).
import { WEIGHT_WORDS } from '../../../engine/core.js';
import { nameOf, summaryOf, weightOf } from '../../../engine/items.js';
import { ATTACK_SPELLS, castOptions, dayColors } from '../../../engine/spells.js';
import { nameOfClearing, tileName } from '../../../engine/world.js';
import { latestRoll } from '../../dice.js';
import { h } from '../../dom.js';
import { found, sect, voiceSwitch } from '../../ds.js';
import { die, icon } from '../../icons.js';
import { isMeetLine } from '../../meet.js';
import { rollDetail, storyRoll } from '../../storyvoice.js';
import { isStory, logText } from '../../voice.js';
import { CURSE_PLAIN, ico, modal, moveDetent } from './kit.js';
import { prowlers, render } from './shell.js';

const CURSE_SHORT = { Eyemist: 'you cannot Search', Squeak: 'you cannot Hide', Wither: 'asterisk chits cannot be played', 'Ill Health': 'you cannot Rest', Ashes: 'your gold is worthless', Disgust: 'your Fame is worthless' };

// What he found or took since he last acted: an item, a card, a place discovered, a curse that fell on him.
export function journalNew(G) {
    const st = G.st;
    G.ui.gainSeen ??= st.gainSeq ?? 0; G.ui.findSeen ??= st.findSeq ?? 0;
    const gains = (st.gains ?? []).filter(x => x.n > G.ui.gainSeen && st.ch.items.some(i => i.uid === x.uid)).map(x => ({ key: `g${x.uid}`, kind: 'item', item: st.ch.items.find(i => i.uid === x.uid) }));
    const finds = (st.finds ?? []).filter(f => f.n > G.ui.findSeen).map(f => ({ key: `f${f.n}`, kind: f.kind === 'curse' ? 'curse' : f.kind === 'card' ? 'card' : 'site', f }));
    return [...gains, ...finds];
}
// The same, minus what the Journal has already shown him (the dot on the last-action line goes out once it was open).
export const journalFresh = G => { const n = journalNew(G); return n.length && G.ui.jSeen !== n.map(x => x.key).join() ? n : []; };

// (New things no longer pop the Journal up: the result card, result_card.js, tells what a phase brought; what is new waits here and shows as a dot on the last-action line.)

const KEY = 'mr-journal-detent';
const savedDetent = () => { try { return localStorage.getItem(KEY) === 'tall' ? 'tall' : 'half'; } catch { return 'half'; } };
const saveDetent = d => { try { localStorage.setItem(KEY, d); } catch { /* ignore */ } };

// ---- the pieces ----
function notices(G) {
    const st = G.st, out = [];
    for (const c of st.ch.curses ?? []) out.push(h('button', { class: 'ds-note curse', 'data-act': 'curses', onclick: () => { G.ui.sheet = 'curses'; render(G); } }, icon('skull'), `${c}: ${CURSE_SHORT[c] ?? CURSE_PLAIN[c] ?? 'a curse'}`));
    const magic = dayColors(st.day, st.lastDay ?? 28);
    if (magic.length) out.push(h('button', { class: 'ds-note', 'data-act': 'magic-day', onclick: () => { G.ui.sheet = 'calendar'; render(G); } }, ...magic.map(c => h('i', { class: `ds-dot ${c.toLowerCase()}` })), `${magic.join(' and ')} magic`));
    const fx = (st.fx ?? []).filter(f => f.state !== 'done');
    if (fx.length) out.push(h('button', { class: 'ds-note', 'data-act': 'spells', 'aria-label': `Spells in effect: ${fx.map(f => G.data.spells?.[f.spell]?.name ?? f.spell).join(', ')}`, onclick: () => { G.ui.sheet = 'spells'; render(G); } }, icon('spark'), `Spells (${fx.length})`));
    const form = st.ch.morph ? `You are ${st.ch.morph.creature?.name ?? 'a creature'}` : st.ch.mist ? 'You are mist' : st.ch.flying ? `You are flying over ${tileName(st.ch.flying.tile)}` : null;
    if (form) out.push(h('span', { class: 'ds-note', 'data-act': 'form' }, icon('eye'), form));
    const tonight = (st.period === 'daylight' || st.period === 'birdsong') && !st.combat && !st.ch.onRoad ? castOptions(st, G.data).filter(o => (o.useful || o.quiet) && !ATTACK_SPELLS[o.spell]) : [];
    if (tonight.length) out.push(h('button', { class: 'ds-note', 'data-act': 'cast-tonight', title: 'The game will stop and ask you this evening, even if nothing attacks', onclick: () => { G.ui.sheet = 'spells'; render(G); } }, icon('spark'), `Cast tonight: ${[...new Set(tonight.map(o => o.name))].join(', ')}`));
    if (st.period === 'daylight' && st.prowl) out.push(h('button', { class: `ds-note${G.ui.jWilds ? ' on' : ''}`, 'data-act': 'prowl', 'aria-expanded': G.ui.jWilds ? 'true' : 'false', onclick: () => { G.ui.jWilds = !G.ui.jWilds; render(G); } }, icon('eye'), 'The wilds'));
    return out;
}

function wildsLine(G) {
    const st = G.st, list = prowlers(G).join(', ') || 'no one stirs';
    return h('div', { class: 'ds-ask' }, h('b', {}, isStory() ? 'The wilds stir' : `Monster roll ${st.prowl}`), h('span', {}, list),
        st.day % 7 === 0 ? h('span', {}, isStory() ? 'The week turns: the creatures of the wilds are called home to where they began, the slain among them.' : `Week’s end: row ${st.prowl} was called back to where it began, the slain among them.`) : null);
}

// The found boxes (an item got, a curse, a site or a card found): the Journal lists what is new; the result card (result_card.js) shows what the phase just played brought.
export function foundBoxes(G, news, from = 'journal') {
    return news.map(n => {
        const go = (fn) => () => { fn(); render(G); };
        if (n.kind === 'item') {
            const nm = nameOf(G.data, n.item), el = found({ art: 'cache', eyebrow: 'You got', title: nm, line: `${summaryOf(G.data, n.item)} · ${WEIGHT_WORDS[weightOf(G.data, n.item)] ?? ''}`.replace(/ · $/, ''), attrs: { 'data-act': 'gain', 'data-item': n.item.uid }, onclick: go(() => { G.ui.itemUid = n.item.uid; G.ui.itemFrom = from; G.ui.sheet = 'item'; }) });
            const pic = ico(G, nm, 'ico'); if (pic) el.firstChild.replaceWith(pic);
            return el;
        }
        if (n.kind === 'curse') return found({ art: null, eyebrow: 'A curse has fallen on you', title: n.f.name, line: CURSE_PLAIN[n.f.name] ?? n.f.effect, attrs: { 'data-act': 'curse-new' }, onclick: go(() => { G.ui.sheet = 'curses'; }), cls: 'curse' });
        const card = n.kind === 'card';
        return found({ art: card ? 'cache' : 'peer', eyebrow: card ? 'You found' : 'You discovered', title: n.f.name ?? 'a site', line: card ? 'Tap to read the card.' : `at ${nameOfClearing(n.f.clearing)}: tap for what is there`, attrs: { 'data-act': 'find' },
            onclick: go(() => { if (card) { G.ui.cardId = n.f.id; G.ui.sheet = 'cardinfo'; } else { G.ui.sel = n.f.clearing; G.ui.foundSite = n.f.id; G.ui.sheet = 'clearing'; } }) });
    });
}

function lastRoll(G) {
    const r = latestRoll(G.st);
    if (!r) return null;
    const tale = storyRoll(r), best = r.dice.length > 1 ? Math.max(...(r.used ?? r.dice)) : null;
    const story = tale?.line ?? r.result ?? '', detail = `${r.dice.join(' + ')}${r.dice.length > 1 ? ` (${r.value} counts)` : ''}${r.result ? `: ${r.result}` : rollDetail(r) ? `: ${rollDetail(r)}` : ''}.`;
    return [sect('The last roll'),
        h('div', { class: 'ds-row', style: 'min-height:64px' },
            h('span', { style: 'display:flex;gap:4px' }, ...r.dice.map((d, i) => die(d, best != null && (r.used ?? r.dice)[i] === best ? 'gold' : ''))),
            h('span', { class: 'main' }, h('b', {}, tale?.title ?? r.what), h('span', {}, isStory() ? story : detail)))];
}

// a number (a clearing, a #n) is never left alone at the start of a line: "in clearing 4." keeps its word with it (QA-21)
const glueNumbers = t => String(t).replace(/(\S) (#?\d+)(?=[\s.,;:!?)]|$)/g, '$1\u00A0$2');

// the story so far: newest first, a section per day, the phase number at the left (R and a number for a round of a fight)
function logSections(G) {
    const st = G.st, out = [], lines = (st.log ?? []).filter(l => !(l.k === 'roll' || l.k === 'info' || (l.k === 'day' && !l.s) || (G.shared && isMeetLine(l))));
    let day = null, ul = null, lastText = null;
    for (const l of [...lines].reverse().slice(0, 150)) {
        if (l.day !== day) {
            day = l.day; out.push(sect(l.day === st.day ? 'Today' : l.day === st.day - 1 ? 'Yesterday' : `Day ${l.day}`, l.day === st.day ? 'newest first' : '')); ul = h('ul', { class: 'ds-log' }); out.push(ul);
        }
        const ph = /^Phase (\d+)/.exec(l.t)?.[1] ?? (l.r != null ? `R${l.r}` : l.k === 'day' ? '—' : '·');
        const text = l.k === 'phase' && !isStory() ? l.t.replace(/^Phase \d+:\s*/, '') : logText(l);
        if (isStory() && text === lastText && l.day === day) continue;                  // (a loot line and its phase line are told with the same words: once)
        lastText = text;
        ul.append(h('li', { class: `j-${l.k}` }, h('span', { class: 'ph' }, ph), h('span', {}, glueNumbers(text))));
    }
    return out;
}

export function journalSheet(G) {
    const close = () => { G.ui.sheet = null; G.ui.jSeen = journalNew(G).map(x => x.key).join(); render(G); };
    G.ui.jSeen = journalNew(G).map(x => x.key).join();                                   // he has seen what is new now
    const detent = G.ui.journalDetent ?? savedDetent();
    const nt = notices(G), news = foundBoxes(G, journalNew(G)), roll = lastRoll(G), log = logSections(G);
    const body = h('div', { class: 'journal' },
        nt.length ? h('div', { class: 'ds-notes' }, ...nt) : null,
        G.ui.jWilds && G.st.prowl ? wildsLine(G) : null,
        news.length ? [sect('New'), ...news] : null,
        roll, ...(log.length ? log : [h('p', { class: 'ds-meta' }, 'Nothing has happened yet. Your story begins here.')]));
    const frag = modal(G, 'The story so far', body, { close, detent, eyebrow: `Day ${G.st.day}`, head: voiceSwitch(), cls: 'journal-sheet', noPull: true });
    const el = frag.sheet;
    // the handle: pull up for tall, down for half, down again to put it away
    const grab = el.querySelector('.ds-grab'); let y0 = null;
    grab.style.touchAction = 'none';
    grab.addEventListener('pointerdown', e => { if (e.button) return; y0 = e.clientY; try { grab.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
    grab.addEventListener('pointerup', e => {
        if (y0 == null) return; const dy = e.clientY - y0; y0 = null;
        const cur = el.dataset.detent, set = d => { G.ui.journalDetent = d; saveDetent(d); moveDetent(el, d); };
        if (dy < -30 && cur === 'half') set('tall'); else if (dy > 30) { if (cur === 'tall') set('half'); else close(); } else if (Math.abs(dy) < 8) set(cur === 'half' ? 'tall' : 'half');
    });
    return frag;
}
