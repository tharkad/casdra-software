// play/kit.js: building blocks shared by every play module: the sheet frame (modal, over ds.js sheet()), pull-down gesture, item pictures, magic-colour chips, the context objects
// (mc, tc) handed to meetui.js / tableui.js, and the constants (curse texts, action labels) the plan, dock and sheets all read.
import { h } from '../../dom.js';
import { btn, setDetent, sheet } from '../../ds.js';
import { icon as dsIcon } from '../../icons.js';
import { guardIfChanged } from '../../tapguard.js';
import { act } from './actions.js';
import { itemParts } from './sheet_char.js';
import { render } from './shell.js';

// What each curse takes away, in plain words, the action it spoils (so the plan can say so before the phase is wasted) and how it ends.
export const CURSE_ACT = { Eyemist: 'search', Squeak: 'hide', 'Ill Health': 'rest' };

export const CURSE_PLAIN = {
    Eyemist: 'You cannot Search at all (Locate, Loot, Peer, Reading Runes).',
    Squeak: 'You cannot Hide, and you were unhidden the moment it struck: monsters will see you.',
    Wither: 'Chits with an asterisk cannot be played: they were all tired when it struck.',
    'Ill Health': 'You cannot Rest, so tired and wounded chits stay that way.',
    Ashes: 'Your gold is worthless: you cannot spend it, so you cannot buy, hire or pay.',
    Disgust: 'Your Fame is worthless: you cannot lose it, so paying an insult in Fame is not possible and Challenges mean a fight.',
};

// Pull a sheet down to put it away: the handle follows the finger, and the sheet goes if it was dragged far enough or flicked; otherwise it springs back.
export function pullDown(handle, target, done) {
    let y0 = null, dy = 0, t0 = 0;
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', e => { if (e.button) return; y0 = e.clientY; dy = 0; t0 = e.timeStamp; target.style.transition = 'none'; try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
    handle.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); target.style.transform = `translateY(${dy}px)`; });
    const end = e => {
        if (y0 == null) return;
        const v = dy / Math.max(1, e.timeStamp - t0);
        y0 = null; target.style.transition = 'transform .18s ease-out';
        if (dy > 90 || (v > 0.8 && dy > 50)) { target.style.transform = 'translateY(100%)'; setTimeout(done, 170); } else target.style.transform = '';
    };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    // a swipe down on the content itself, when it is already at its top
    let ty = null, tx = 0;
    target.addEventListener('touchstart', e => { ty = target.scrollTop <= 0 ? e.touches[0].clientY : null; tx = e.touches[0].clientX; }, { passive: true });
    target.addEventListener('touchmove', e => {
        if (ty == null) return;
        const d = e.touches[0].clientY - ty, dx = Math.abs(e.touches[0].clientX - tx);
        if (d > 70 && d > dx * 1.6) { ty = null; target.style.transition = 'transform .18s ease-out'; target.style.transform = 'translateY(100%)'; setTimeout(done, 170); }
    }, { passive: true });
}

// A curse makes a number worthless (Ashes: gold, Disgust: Fame): it is still shown, struck through, so it is plain it cannot be used.
export const voidBy = (st, stat) => (stat === 'gold' && (st.ch.curses ?? []).includes('Ashes') ? 'Ashes' : stat === 'fame' && (st.ch.curses ?? []).includes('Disgust') ? 'Disgust' : null);

// The picture of an action: the 32px pixel art in art/actions (Enchant is the spell hand, Nothing the barred circle).
const ACT_ART = { move: 'move', hide: 'hide', search: 'search', trade: 'trade', hire: 'hire', rest: 'rest', alert: 'alert', enchant: 'spell', nothing: 'ban', fly: 'fly', follow: 'follow' };
export const actArt = a => ACT_ART[a] ?? 'ban';

// One line over the tray, 3.2 seconds, gold rule (red when it is a refusal). Never raw engine text.
export function showToast(G, text, bad = false, ms = 3200) {
    clearTimeout(G.ui.toastTimer);
    G.ui.toast = text; G.ui.toastWhy = !bad; render(G);
    G.ui.toastTimer = setTimeout(() => { G.ui.toast = null; G.ui.toastWhy = false; if (G.root.isConnected) render(G); }, ms);
}

export const ACT_LABEL = { move: 'Move', hide: 'Hide', search: 'Search', trade: 'Trade', hire: 'Hire', rest: 'Rest', alert: 'Alert', enchant: 'Enchant', fly: 'Fly', follow: 'Follow', nothing: 'Nothing' };

export const TABLE_LABEL = { peer: 'Peer', locate: 'Locate', loot: 'Loot', ground: 'Ground', sitecard: 'Site card', runes: 'Read runes', magicsight: 'Magic Sight', 'magicsight-take': 'Magic Sight: take' };

export function tc(G) { return { st: G.st, data: G.data, answer: G.answer, crew: G.crew, ui: G.ui, render: () => render(G), modal: modal.bind(null, G), act: act.bind(null, G), table: G.table, mySeat: G.mySeat }; }

// ---- the sheet system (P0b) ----
// Every sheet of the play screen is the design system's one component (ds.js sheet(): `.ds-sheet`), in one of three kinds:
//   information  (a close handler is given): a scrim, tap outside or the cross or a pull down puts it away; opens `hug` (content height, 78% at most) unless a detent is named
//   decision     (no close handler): no scrim, the map is live above it; the first touch on the map drops it to `peek` (title bar + one button: a question is waiting, it is never dismissed),
//                a tap on its head or handle brings it back; the Map button in the head does the same drop
//   result       (kind: 'result'): a scrim, no way out but its own button
// The legacy class names stay on the new elements as test hooks (`sheet2`, `sheet2-head`, `sheet-bg`, `sheet-scroll`, `sheet-grab`); their old rules are gone.

// Move a mounted sheet to another detent with the height animating (a `hug` sheet has no height to animate from, so it is measured first).
export function moveDetent(el, detent, { remember = true } = {}) {
    if (!el || el.dataset.detent === detent) return;
    const from = el.getBoundingClientRect().height;
    el.style.transition = 'none'; el.style.height = `${from}px`; void el.offsetHeight;
    setDetent(el, detent, { remember });
    el.style.height = ''; const to = el.getBoundingClientRect().height;   // what the new detent asks for
    el.style.height = `${from}px`; void el.offsetHeight;
    el.style.transition = ''; el.style.height = `${to}px`;
    const done = () => { el.removeEventListener('transitionend', done); el.style.height = ''; };
    el.addEventListener('transitionend', done); setTimeout(done, 420);
}

// A decision sheet that was put aside to look at the map: the head or the handle brings it back.
function peekWire(G, el, scrim) {
    const back = () => { if (!G.ui.mapPeek) return; G.ui.mapPeek = false; moveDetent(el, el.dataset.full || 'hug'); el.classList.remove('peeked'); scrim?.classList.remove('none'); G.ui.onSheetMove?.(); };
    const go = () => { if (G.ui.mapPeek) return; G.ui.mapPeek = true; moveDetent(el, 'peek', { remember: false }); el.classList.add('peeked'); scrim?.classList.add('none'); G.ui.onSheetMove?.(); };
    for (const part of el.querySelectorAll('.ds-grab, .ds-sheet-head h2')) part.addEventListener('click', () => { if (G.ui.mapPeek) back(); });
    el.querySelectorAll('[data-act=back-to-choice]').forEach(b => b.addEventListener('click', back));
    el.querySelectorAll('[data-act=peek-sheet-map]').forEach(b => b.addEventListener('click', go));
    // dragging the handle down drops to peek, dragging a peeked one up brings it back
    const grab = el.querySelector('.ds-grab'); let y0 = null;
    grab.style.touchAction = 'none';
    grab.addEventListener('pointerdown', e => { if (e.button) return; y0 = e.clientY; try { grab.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
    grab.addEventListener('pointerup', e => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (dy > 40) go(); else if (dy < -40) back(); });
    G.ui.peekGo = go;
}

export function modal(G, title, body, { close, footer, kind, detent, eyebrow, head, cls, attrs, noPull, bare } = {}) {
    const k = kind ?? (close ? 'info' : 'decision'), decision = k === 'decision';
    const peeked = (decision || k === 'result') && !!G.ui.mapPeek;
    const full = detent ?? 'hug';
    // what the peek bar offers when the sheet has no foot of its own: the one way back
    const peekFoot = decision || k === 'result' ? h('div', { class: 'ds-sheet-foot peek-foot' }, h('span', { class: 'lead ds-lead-text' }, 'The map is yours.'), btn('Back to the question', 'primary', { 'data-act': 'back-to-choice' })) : null;
    const foot = [footer ?? null, footer ? null : peekFoot].filter(Boolean);
    const mapBtn = decision || k === 'result' ? h('button', { type: 'button', class: 'ds-btn quiet sm peekmap', 'data-act': 'peek-sheet-map', 'aria-label': 'Look at the map' }, dsIcon('eye'), 'Map') : null;
    const frag = sheet({ title, eyebrow, detent: peeked ? 'peek' : full, decision, x: !!close, scrim: k !== 'decision', onClose: close, head: head ?? mapBtn, body: bare ? body : h('div', { class: 'legacy' }, body), foot,
        cls: `sheet2 ${k}${cls ? ' ' + cls : ''}${footer ? ' has-footer' : ''}${peeked ? ' peeked' : ''}`, attrs });
    if (peeked) frag.scrim?.classList.add('none');
    const el = frag.sheet; el.dataset.full = full; el.dataset.kind = k;
    // a sheet that has just come up (or changed to another question) ignores taps on its primary for a moment: the second half of a double tap on the button that opened it must not answer it (QA-4)
    guardIfChanged(G.ui.guards ??= {}, `sheet:${title}`, `${k}|${title}`, el);
    el.querySelector('.ds-sheet-body').classList.add('sheet-scroll');
    el.querySelector('.ds-sheet-head').classList.add('sheet2-head');
    el.querySelector('.ds-grab').classList.add('sheet-grab');
    if (frag.scrim) frag.scrim.classList.add('sheet-bg');
    if (k === 'result') frag.scrim?.removeAttribute('data-close');
    if (decision || k === 'result') peekWire(G, el, frag.scrim);
    else if (close && !noPull) pullDown(el.querySelector('.ds-grab'), el, close);
    return frag;
}

// Pictures from the original game, when we have them.
export function picOf(G, name) { const a = G.data.art; return a ? (a.weapons?.[name] ?? a.armor?.[name] ?? a.horses?.[name] ?? null) : null; }

export function ico(G, name, cls = 'ico') { const s = picOf(G, name); return s ? h('img', { class: cls, src: s, alt: '', decoding: 'sync' }) : null; }

export function nativePic(G, id) { return G.data.art?.natives?.[id] ?? null; }

// the meeting screens (meetui.js) are given what they need and own no state: `ui.meet` is the draft of an offer, `ms` what I may do now
function itemInfoOf(G, it) { const { card, faces, facts } = itemParts(G, it); return h('div', { class: 'ti-info itemsheet' }, card ?? h('div', { class: 'faces' }, ...faces), ...facts.map(t => h('p', {}, t))); }

export function mc(G) { return { st: G.st, data: G.data, act: act.bind(null, G), ui: G.ui, render: () => render(G), modal: modal.bind(null, G), itemInfo: itemInfoOf.bind(null, G), ico: ico.bind(null, G), ms: G.ms }; }

// A map chit as the game prints it: a square counter (sound red, warning yellow, treasure site gold), the name above and the clearing number
// or tile letter below. RealmSpeak draws them the same way.
export const mrChit = c => {
    const kind = c.kind === 'sound' ? 'sound' : c.kind === 'warning' ? 'warning' : c.kind === 'site' ? 'site' : 'special';
    const second = c.kind === 'warning' ? (c.letter ?? '') : (c.num ?? '');
    return h('span', { class: `mrchit ${kind}`, role: 'img', 'aria-label': `${c.name}${second !== '' ? ` ${second}` : ''} ${c.kind === 'sound' ? 'sound' : c.kind === 'warning' ? 'warning' : 'site'} chit` },
        h('b', {}, c.name), second !== '' ? h('i', {}, String(second)) : null);
};

// ---- the colours of magic ----
const COLOR_ART = { White: 'white', Black: 'black', Grey: 'gray', Purple: 'purple', Gold: 'gold' };

export const colorChip = (name, { big = false } = {}) => h('span', { class: `mcolor ${name.toLowerCase()}${big ? ' big' : ''}` },
    h('img', { src: `art/colormagic/${COLOR_ART[name]}.gif`, alt: '', onerror: e => e.target.remove() }), h('b', {}, name));
