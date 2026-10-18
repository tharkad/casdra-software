// play/result_card.js: the result card (mockup 02 c1, c1b): what a phase that has just been played came to, told ONCE and first: the label, the Story headline (Detail: the exact words),
// the score that moved (Fame, Notoriety, Gold, only the non-zero ones), what was found (a gold box that opens the clearing, the item or the card), and in Detail the roll in a ledger.
// The log line of the same event is not shown again (the tray drops its last-action line while the card is up); one button goes on.
//
//   markPhase(G, action)   called by act() before an action goes out: when it starts a phase, remember where the score and the counters stood.
//   resultInfo(G)          the facts of the phase just played (or null): { n, slot, line, deltas, news, rolls } read from G.st and the mark.
//   resultCardFor(G)       the card as a DOM node (or null when no phase has just been played). The shared table (P6) calls this too: it only reads G.st, G.ui.pmark and the voice.
import { nameOfClearing } from '../../../engine/world.js';
import { h } from '../../dom.js';
import { resultCard } from '../../ds.js';
import { lineFor, rollDetail } from '../../storyvoice.js';
import { isStory } from '../../voice.js';
import { foundBoxes } from './journal.js';
import { ACT_LABEL } from './kit.js';
import { tableName } from './phases.js';

// ---- the mark: where things stood when the phase began ----
export function markPhase(G, action) {
    const p = G.st?.pending, c = G.st?.ch;
    if (!p || !c) return;
    const starts = (p.type === 'phase' && action.type === 'next') || (p.type === 'phase-pick' && (action.type === 'pick' || action.type === 'next'));
    if (!starts) return;
    G.ui.pmark = { day: G.st.day, i: p.i, fame: c.fame, notor: c.notoriety, gold: c.gold, gain: G.st.gainSeq ?? 0, find: G.st.findSeq ?? 0, roll: G.st.rollSeq ?? 0 };
}

const mine = (G, x) => !x.who || !G.shared || x.who === G.st.ch.id;

// What the phase just played came to. `n` is the phase number (1-based). null while no phase has been played (or the one on screen is not finished).
export function resultInfo(G) {
    const st = G.st, p = st.pending;
    if (!p || !(p.type === 'phase' || p.type === 'phase-pick') || !st.ch) return null;
    const n = p.i;                                                                 // the phase just played is the one before the pending one
    if (!(n >= 1)) return null;
    const log = st.log ?? [];
    const line = [...log].reverse().find(x => x.k === 'phase' && x.day === st.day && x.t.startsWith(`Phase ${n}:`));
    if (!line) return null;
    const m = G.ui.pmark && G.ui.pmark.day === st.day && G.ui.pmark.i === n - 1 ? G.ui.pmark : null;
    const c = st.ch, slot = st.plan?.[n - 1] ?? null;
    const deltas = m ? { fame: c.fame - m.fame, notor: c.notoriety - m.notor, gold: c.gold - m.gold } : {};
    const news = m ? [
        ...(st.gains ?? []).filter(x => x.n > m.gain && mine(G, x) && c.items.some(i => i.uid === x.uid)).map(x => ({ key: `g${x.uid}`, kind: 'item', item: c.items.find(i => i.uid === x.uid) })),
        ...(st.finds ?? []).filter(f => f.n > m.find && mine(G, f)).map(f => ({ key: `f${f.n}`, kind: f.kind === 'curse' ? 'curse' : f.kind === 'card' ? 'card' : 'site', f })),
    ] : [];
    const rolls = m ? (st.rolls ?? []).filter(r => r.n > m.roll && mine(G, r)) : [];
    return { n, slot, line, deltas, news, rolls, marked: !!m };
}

// "Phase 3 · Search" (a Search with a table says which one)
export function phaseLabel(G, info) {
    const s = info.slot, a = s?.act ?? 'nothing';
    const what = a === 'search' && s?.table ? tableName(G, s.table).split(':')[0] : ACT_LABEL[a] ?? a;
    return `Phase ${info.n} · ${what}`;
}

// A phase worth a card: something rolled, was found, or moved the score, or it is a phase that is only told in words (Hide, Rest, Trade ...). A plain Move is told in the last-action line.
export function worthACard(info) {
    const a = info.slot?.act;
    if (a === 'move' || a === 'nothing') return info.rolls.length > 0 || info.news.length > 0 || Object.values(info.deltas).some(v => v) || /blocked|cut short/i.test(info.line.t);
    return true;
}

const ledgerLine = r => `${r.what}: ${r.dice.join(' + ')}${r.dice.length > 1 ? ` (${r.value} counts)` : ''}${r.result ? `. ${r.result}` : rollDetail(r) ? `. ${rollDetail(r)}` : ''}`.replace(/\.?$/, '.');

export function resultCardFor(G) {
    const info = resultInfo(G);
    if (!info || !worthACard(info)) return null;
    const st = G.st, plain = info.line.t.replace(/^Phase \d+:\s*/, '').replace(/ \(rolled [^)]*\)/, '');
    const story = lineFor(info.line, 'story', st) || plain, detail = plain;
    const d = info.deltas;
    const ledger = [...info.rolls.map(r => h('div', {}, ledgerLine(r))),
        ...(['fame', 'notor', 'gold'].some(k => d[k]) ? [h('div', {}, ['fame', 'notor', 'gold'].filter(k => d[k]).map(k => `${{ fame: 'Fame', notor: 'Notoriety', gold: 'Gold' }[k]} ${d[k] > 0 ? '+' : '−'}${Math.abs(d[k])}`).join(', ') + '.')] : [])];
    const card = resultCard({ label: phaseLabel(G, info), story, detail, deltas: d, found: null, ledger: ledger.length ? ledger : null, attrs: { 'data-result': String(info.n), role: 'status' } });
    // one Found box (an item, a site or a card first; a curse only when nothing else came: the headline has already said it): the tray keeps its budget
    const boxes = foundBoxes(G, [...info.news].sort((a, b) => (a.kind === 'curse') - (b.kind === 'curse')).slice(0, 1), 'dock');
    if (boxes.length) { const at = card.querySelector('.ds-ledger'); at ? at.before(...boxes) : card.append(...boxes); }
    card.dataset.story = isStory() ? '1' : '0';
    return card;
}

// Where a site found at a clearing is told (for the Found box: "at Curst Valley 4")
export const siteWhere = f => (f?.clearing ? `at ${nameOfClearing(f.clearing)}` : '');
