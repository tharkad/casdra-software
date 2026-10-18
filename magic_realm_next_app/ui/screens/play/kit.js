// play/kit.js: building blocks shared by every play module: the icon set, the sheet frame (modal), pull-down gesture, item pictures, magic-colour chips, the context objects
// (mc, tc) handed to meetui.js / tableui.js, and the constants (curse texts, action labels) the plan, dock and sheets all read.
import { h } from '../../dom.js';
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

// The header's icons: one family (24 grid, 1.8 round stroke, currentColor) so they read as a set.
const ICON = {
    menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
    coin: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z'],
    fame: ['M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.5l6.1-.7z'],
    notor: ['M12 3c.8 3.4 5 5.4 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2.2-4.2 0 2 .9 3 1.9 3 .2-3-1.1-5 .9-8.8z'],
    lock: ['M7.5 11V8a4.5 4.5 0 0 1 9 0v3', 'M6 11h12v9H6z', 'M12 14.5v2'],
    skull: ['M12 3.5a7 7 0 0 0-7 7c0 2.4 1.2 4.2 3 5.3v3.2h8v-3.2c1.8-1.1 3-2.9 3-5.3a7 7 0 0 0-7-7z', 'M9 11.2h.01', 'M15 11.2h.01', 'M10.5 19v-2.2', 'M13.5 19v-2.2'],
};

export function icon(name, size = 18) {
    const ns = 'http://www.w3.org/2000/svg', el = document.createElementNS(ns, 'svg');
    el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('width', size); el.setAttribute('height', size); el.setAttribute('class', `ico-${name}`);
    el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '1.8'); el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('aria-hidden', 'true');
    for (const d of ICON[name]) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); el.append(p); }
    return el;
}

export const COLOR_DOT = { White: '#f2eedc', Black: '#15151c', Grey: '#9aa0aa', Gold: '#e2c068', Purple: '#8f7cc0' };

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

export const ACT_LABEL = { move: 'Move', hide: 'Hide', search: 'Search', trade: 'Trade', hire: 'Hire', rest: 'Rest', alert: 'Alert', enchant: 'Enchant', fly: 'Fly', follow: 'Follow', nothing: 'Nothing' };

export const TABLE_LABEL = { peer: 'Peer', locate: 'Locate', loot: 'Loot', ground: 'Ground', sitecard: 'Site card', runes: 'Read runes', magicsight: 'Magic Sight', 'magicsight-take': 'Magic Sight: take' };

export function tc(G) { return { st: G.st, data: G.data, answer: G.answer, crew: G.crew, ui: G.ui, render: () => render(G), modal: modal.bind(null, G), act: act.bind(null, G), table: G.table, mySeat: G.mySeat }; }

// Sheets that are only for looking can be dismissed by tapping anywhere outside them; those that need an answer cannot.
// Every sheet is the same object: a scrim, a rounded sheet with a grabber and a title, and (when it is only for looking) a way out three ways:
// pull it down, tap outside it, or the cross. A sheet that needs an answer has none of them and no grabber.
export function modal(G, title, body, { close, footer } = {}) {
    // a sheet that needs an answer can be set aside to look at the map, and brought back (the decision may depend on what is on the map)
    if (!close && G.ui.mapPeek) return h('div', { class: 'combat-back' }, h('button', { class: 'btn primary big', 'data-act': 'back-to-choice', onclick: () => { G.ui.mapPeek = false; render(G); } }, `Back to: ${title}`));
    const sheet = h('div', { class: `sheet2${footer ? ' has-footer' : ''}` },
        h('div', { class: 'sheet-top' },
            close ? h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }, h('span', { class: 'grip' })) : null,
            h('div', { class: 'sheet2-head' }, h('b', {}, title), close ? h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '\u2715')
                : h('button', { class: 'peekmap', 'data-act': 'peek-sheet-map', onclick: () => { G.ui.mapPeek = true; render(G); } }, 'Map'))),
        footer ? h('div', { class: 'sheet-scroll' }, body) : body,
        footer ?? null);
    const bg = h('div', { class: 'sheet-bg', onclick: e => { if (close && e.target === e.currentTarget) close(); } }, sheet);
    if (close) pullDown(sheet.querySelector('.sheet-grab'), sheet, close);
    return bg;
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
