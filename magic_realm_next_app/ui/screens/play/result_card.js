// play/result_card.js: the result card (mockup 02 c1, c1b): what a phase that has just been played came to, told ONCE and first: the label, the Story headline (Detail: the exact words),
// the score that moved (Fame, Notoriety, Gold, only the non-zero ones), what was found (a gold box that opens the clearing, the item or the card), and in Detail the roll in a ledger.
// The log line of the same event is not shown again (the tray drops its last-action line while the card is up); one button goes on.
//
//   markPhase(G, action)   called by act() before an action goes out: when it starts a phase, remember where the score and the counters stood.
//   resultInfo(G)          the facts of the phase just played (or null): { n, slot, line, deltas, news, rolls } read from G.st and the mark.
//   resultCardFor(G)       the card as a DOM node (or null when no phase has just been played). The shared table (P6) calls this too: it only reads G.st, G.ui.pmark and the voice.
import { earned } from '../../../engine/score.js';
import { nameOfClearing } from '../../../engine/world.js';
import { h } from '../../dom.js';
import { resultCard } from '../../ds.js';
import { lineFor, lootActLine } from '../../storyvoice.js';
import { isStory } from '../../voice.js';
import { foundBoxes } from './journal.js';
import { ACT_LABEL } from './kit.js';
import { tableName } from './phases.js';

// ---- the mark: where things stood when the phase began ----
// Fame and Notoriety as the strip shows them: what was recorded plus what the things he owns add (a Blasted Jewel is Fame and Notoriety the moment he holds it: QA-108).
const earnedNow = G => { try { return earned(G.st, G.data); } catch { return null; } };
export function markPhase(G, action) {
    const p = G.st?.pending, c = G.st?.ch;
    if (!p || !c) return;
    const starts = (p.type === 'phase' && action.type === 'next') || (p.type === 'phase-pick' && (action.type === 'pick' || action.type === 'next'));
    if (!starts) return;
    const e = earnedNow(G);
    G.ui.pmark = { day: G.st.day, i: p.i, fame: c.fame, notor: c.notoriety, gold: c.gold, efame: e?.fame ?? c.fame, enotor: e?.notoriety ?? c.notoriety, gain: G.st.gainSeq ?? 0, find: G.st.findSeq ?? 0, roll: G.st.rollSeq ?? 0 };
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
    // a flight that ends as this phase begins: he came down first (the engine logs "You land in X." just before the phase's own line): the card leads with where (QA-107)
    let landing = null;
    { let j = log.lastIndexOf(line) - 1; while (j >= 0 && log[j].k === 'roll') j--; if (j >= 0 && log[j].k === 'phase' && /^(?:You land|Landing) in /.test(log[j].t)) landing = log[j]; }
    // the trade lines of this phase (what was sold, bought, refused) come before its own line, after the one of the phase before
    const trades = []; { const at = log.lastIndexOf(line); for (let j = at - 1; j >= 0 && log[j].k !== 'day' && !(log[j].k === 'phase' && /^Phase \d+:/.test(log[j].t)); j--) if (log[j].k === 'trade') trades.unshift(log[j]); }
    const m = G.ui.pmark && G.ui.pmark.day === st.day && G.ui.pmark.i === n - 1 ? G.ui.pmark : null;
    const c = st.ch, slot = st.plan?.[n - 1] ?? null;
    const e = m ? earnedNow(G) : null;
    const deltas = m ? { fame: (e?.fame ?? c.fame) - (m.efame ?? m.fame), notor: (e?.notoriety ?? c.notoriety) - (m.enotor ?? m.notor), gold: c.gold - m.gold } : {};
    const news = m ? [
        ...(st.gains ?? []).filter(x => x.n > m.gain && mine(G, x) && c.items.some(i => i.uid === x.uid)).map(x => ({ key: `g${x.uid}`, kind: 'item', item: c.items.find(i => i.uid === x.uid) })),
        ...(st.finds ?? []).filter(f => f.n > m.find && mine(G, f)).map(f => ({ key: `f${f.n}`, kind: f.kind === 'curse' ? 'curse' : f.kind === 'card' ? 'card' : 'site', f })),
    ] : [];
    const rolls = m ? (st.rolls ?? []).filter(r => r.n > m.roll && mine(G, r)) : [];
    return { n, slot, line, landing, trades, deltas, news, rolls, marked: !!m };
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

// The roll, once: what was rolled and which die counts. What it came to is the headline's job (and a chip's), so the ledger never repeats it (QA-111).
const ledgerLine = r => `${r.what}: ${r.dice.join(' + ')}${r.dice.length > 1 ? `, the ${r.value} counts` : ''}.`;

const listOf = x => (x.length <= 1 ? (x[0] ?? '') : `${x.slice(0, -1).join(', ')} and ${x[x.length - 1]}`);

// What changed hands in a Trade, as sentences (QA-113): "You sell the Suit of Armor for 17 gold." One sentence for the sales, one for the purchases; a refusal names what was asked for.
function tradeStory(G, info) {
    if (!/^(?:trade|hire)$/.test(info.slot?.act ?? '') || !info.trades.length) return null;
    const sold = [], bought = [], no = [];
    let gold = 0;
    for (const l of info.trades) {
        let m;
        if ((m = /^You sell the (.+?) to the .+? for (\d+) gold/.exec(l.t))) { sold.push(`the ${m[1]}`); gold += Number(m[2]); }
        else if ((m = /^You buy the (.+?) from the .+? for (.+?)\.?$/.exec(l.t))) bought.push({ name: `the ${m[1]}`, cost: m[2].replace(/\.$/, '') });
        else if ((m = /^No deal: the (.+?) will not sell/.exec(l.t))) no.push(m[1]);
    }
    const out = [];
    if (sold.length) out.push(`You sell ${listOf(sold)} for ${gold} gold.`);
    for (const b of bought) out.push(`You buy ${b.name} for ${b.cost}.`);
    if (no.length) { const w = G.ui.lastBuy && G.ui.lastBuy.day === G.st.day ? G.ui.lastBuy.name : null; out.push(`The ${no[0]} will not sell you ${w ? `the ${w}` : 'it'}.`); }
    return out.length ? { story: out.join(' '), detail: `${info.trades.map(l => l.t).filter(t => /^You (?:sell|buy) /.test(t) || /^No deal/.test(t)).join(' ').replace(/ \([^()]*rolled [^()]*\)/g, '')} ${info.line.t.replace(/^Phase \d+:\s*/, '')}`.trim() } : null;
}

export function resultCardFor(G) {
    const info = resultInfo(G);
    if (!info || !worthACard(info)) return null;
    const st = G.st, plain = info.line.t.replace(/^Phase \d+:\s*/, '').replace(/ \(rolled [^)]*\)/, '');
    let story = lineFor(info.line, 'story', st) || plain, detail = plain.replace(/ \((?:rolled )?\d[\d+]*\)/g, '');
    const d = info.deltas;
    // a Found box follows: the headline is the act, the box names the thing (QA-112)
    const box = [...info.news].sort((a, b) => (a.kind === 'curse') - (b.kind === 'curse')).slice(0, 1);
    if (box.length && box[0].kind === 'item') { const act = lootActLine(info.line); if (act) story = act; }
    // a site the map already shows is not "found" again (QA-121)
    const dm = /You discover a site here: ([^.]+)\./.exec(plain);
    if (dm && info.marked && !info.news.some(n => n.kind === 'site')) { const names = dm[1].split(/,\s*/).map(x => `the ${x}`); story = `${cap(listOf(names))} ${names.length === 1 ? 'is' : 'are'} still here.`; detail = detail.replace(dm[0], `${dm[1]}: already discovered.`); }
    const tr = tradeStory(G, info);
    if (tr) { story = tr.story; detail = tr.detail; }
    if (info.landing) { const down = lineFor(info.landing, 'story', st) || info.landing.t; story = `${down} ${story}`; detail = `${info.landing.t} ${detail}`; }
    const ledger = info.rolls.map(r => h('div', {}, ledgerLine(r)));
    const card = resultCard({ label: phaseLabel(G, info), story, detail, deltas: d, found: null, ledger: ledger.length ? ledger : null, attrs: { 'data-result': String(info.n), role: 'status' } });
    // one Found box (an item, a site or a card first; a curse only when nothing else came: the headline has already said it): the tray keeps its budget
    const boxes = foundBoxes(G, box, 'dock');
    if (boxes.length) { const at = card.querySelector('.ds-ledger'); at ? at.before(...boxes) : card.append(...boxes); }
    card.dataset.story = isStory() ? '1' : '0';
    return card;
}
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Where a site found at a clearing is told (for the Found box: "at Curst Valley 4")
export const siteWhere = f => (f?.clearing ? `at ${nameOfClearing(f.clearing)}` : '');
