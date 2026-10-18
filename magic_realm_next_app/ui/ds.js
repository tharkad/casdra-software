// ds.js: builders for the design system's core components (docs/design/redesign/DESIGN-SYSTEM.md section 8). They return DOM through dom.js h() and mirror the
// string builders of mockups/ds.js (MR.strip, MR.tray, MR.sheet, ...) 1:1, so the mockup and the app share every class name and nesting. The css is css/core.css.
// A "content" argument (body, foot, lead, primary ...) can be a Node, a string (text), an array of those, or null.
// Extra options on every builder: `cls` (more classes on the root) and `attrs` (more attributes on the root, e.g. { 'data-act': 'menu' }).
// Nothing here owns state or calls the engine: handlers come in as arguments (onClose, onclick ...).
import { h } from './dom.js';
import { icon, art, actIcon, die } from './icons.js';
import { voice, setVoice, onVoice } from './voice.js';

const cx = (...a) => a.filter(Boolean).join(' ');
const arr = c => (c == null || c === false ? [] : Array.isArray(c) ? c : [c]);

// ---- buttons ----
// btn('Next', 'primary', { 'data-act': 'next' }); cls is the modifier list: primary, quiet, danger, sm, block, icon, is-dim. A disabled button is DIM (dashed), never hidden.
export const btn = (label, cls = '', attrs = {}) => h('button', { type: 'button', ...attrs, class: cx('ds-btn', cls) }, label);
export const primary = (label, attrs = {}, cls = '') => btn(label, cx('primary', cls), attrs);
// The two-line label of a primary: a verb plus a small detail line ("Move" / "to Bad Valley 2").
export const twoLine = (main, small) => h('span', { class: 'col' }, main, h('small', {}, small));

// ---- status strip ----
// strip({ day, total, phase, gold, fame, notor, vp, vpc: 'neg' | 'pos' | 'bad', attrs: { menu, day, stats, vp } })  (the nested attrs go on those four elements)
export function strip({ day = 3, total = 28, phase = 'Daylight', gold = 10, fame = 0, notor = 0, vp = '−57', vpc = 'neg', cls, attrs = {} } = {}) {
    const a = attrs;
    return h('header', { class: cx('ds-strip', cls), ...(a.root ?? {}) },
        h('button', { type: 'button', class: 'menu', 'aria-label': 'Menu', ...(a.menu ?? {}) }, icon('menu', 'lg')),
        h('div', { class: 'ds-day', ...(a.day ?? {}) }, h('b', {}, `DAY ${day} `, h('small', {}, `/${total}`)), h('span', {}, phase)),
        h('button', { type: 'button', class: 'ds-stats', 'aria-label': 'Fame, Notoriety, Gold: open the Kit', ...(a.stats ?? {}) },
            h('span', { class: 'ds-stat fame' }, icon('star'), String(fame)), h('span', { class: 'ds-stat notor' }, icon('flame'), String(notor)), h('span', { class: 'ds-stat gold' }, icon('coin'), String(gold))),
        h('div', { class: cx('ds-vp', vpc), ...(a.vp ?? {}) }, h('small', {}, 'VP'), h('b', {}, String(vp))));
}

// ---- the tray ----
// last({ dice: [3, 4], b: 'Search', t: 'Under the Inn floor ...', cls, attrs }): the last action, always one line; tap opens the Journal (the caller wires onclick).
export const last = ({ dice = [], b = 'Last', t = 'No rolls yet.', cls, attrs = {} } = {}) =>
    h('button', { type: 'button', ...attrs, class: cx('ds-last', cls) },
        dice.length ? h('span', { style: 'display:flex;gap:3px' }, dice.map(d => die(d))) : icon('dice'),
        h('span', { class: 'txt' }, h('b', {}, b), t), icon('up'));
// situ('Curst Valley 4', 'in plain sight'): the place (never broken across lines) and the hidden/visible state.
export const situ = (place, tag = '', extra = null) => h('div', { class: 'ds-situ' }, h('b', { class: 'ds-nb' }, place), extra, tag ? h('span', { class: 'tag' }, tag) : null);
// pips([['move', 'done'], ['hide', 'now'], ['search', ''], ['rest', 'locked'], [null, 'empty']]): the five phases of the day as the real action art; ONE control.
export const pips = (list, { attrs = {}, cls } = {}) =>
    h('button', { type: 'button', 'aria-label': 'Your day: tap for the plan', ...attrs, class: cx('lead-pips', 'ds-pips', cls) },
        list.map(([a, s]) => h('span', { class: cx('ds-pip', s) }, a ? actIcon(a, 20) : null)));
// tray({ last, situ, lead, primary, body }): the decision layer. The primary is always bottom-right; `lead` is pips, a count, or a secondary button.
export function tray({ last: l = null, situ: s = null, lead = null, primary: p = null, body = null, cls, attrs = {} } = {}) {
    const lead_ = arr(lead);
    const fit = lead_.some(n => n?.classList?.contains('lead-pips'));
    return h('footer', { ...attrs, class: cx('ds-tray', cls) }, h('div', { class: 'ds-grab' }), l, body, s,
        h('div', { class: 'ds-actions' }, lead_.length ? h('div', { class: cx('lead', fit && 'fit') }, lead_) : null, p));
}

// ---- sheets ----
// sheet({ title, eyebrow, detent: 'peek' | 'half' | 'tall' | 'full' | 'hug', decision, body, foot, head, x, scrim, onClose }) -> DocumentFragment [scrim?, section.ds-sheet].
// An information sheet has a scrim and a way out; a `decision` sheet has no scrim (the map stays live above it). frag.sheet / frag.scrim are the two elements.
// The title sits inside a <b> in the head (the old tools read `.sheet2-head b`).
export function sheet({ title = '', eyebrow = '', detent = 'half', decision = false, body = null, foot = null, head = null, x = true, scrim = true, onClose = null, cls, attrs = {} } = {}) {
    const close = onClose ? { onclick: onClose } : {};
    const sc = scrim && !decision ? h('div', { class: 'ds-scrim', 'data-close': '', ...close }) : null;
    const sh = h('section', { role: 'dialog', 'aria-label': title, ...attrs, class: cx('ds-sheet', decision && 'decision', cls), 'data-detent': detent, 'data-full': detent },
        h('div', { class: 'ds-grab' }),
        h('div', { class: 'ds-sheet-head', 'data-peekhead': '' }, h('h2', {}, eyebrow ? h('small', {}, eyebrow) : null, h('b', {}, title)), head,
            x ? h('button', { type: 'button', class: 'x', 'data-close': '', 'aria-label': 'Close', ...close }, icon('close')) : null),
        h('div', { class: 'ds-sheet-body' }, body),
        arr(foot).length ? h('div', { class: 'ds-sheet-foot' }, foot) : null);
    const frag = document.createDocumentFragment();
    if (sc) frag.append(sc);
    frag.append(sh);
    frag.sheet = sh; frag.scrim = sc;
    return frag;
}
// Move a sheet to another detent (animated by the css height transition). `data-full` remembers the height a decision sheet returns to after a peek.
export function setDetent(sheetEl, detent, { remember = true } = {}) { sheetEl.dataset.detent = detent; if (remember && detent !== 'peek') sheetEl.dataset.full = detent; return sheetEl; }

// ---- the ask: one situation line and one why, at the top of every decision sheet ----
export const ask = (situation, why = '') => h('div', { class: 'ds-ask' }, h('b', {}, situation), why ? h('span', {}, why) : null);
// A section label inside a sheet, with an optional note on the right.
export const sect = (title, right = '') => h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, title), right ? h('small', {}, right) : null);

// ---- Story | Detail ----
// The switch every place that tells a story carries. It shows and sets the ONE stored preference (voice.js, key mr-voice) and keeps every [data-v] element in step
// through html[data-voice-mode] (core.css hides the other voice's elements). Mark story-only content data-v="story" and detail-only content data-v="detail".
export function voiceSwitch({ cls, attrs = {} } = {}) {
    const b = (m, label) => h('button', { type: 'button', 'data-voice': m, class: voice() === m ? 'on' : null, onclick: e => { e.stopPropagation(); setVoice(m); } }, label);
    return h('span', { role: 'group', 'aria-label': 'Story or Detail', ...attrs, class: cx('ds-voice-sw', cls) }, b('story', 'Story'), b('detail', 'Detail'));
}
function syncVoice() {
    document.documentElement.dataset.voiceMode = voice();
    document.querySelectorAll('.ds-voice-sw [data-voice]').forEach(b => b.classList.toggle('on', b.dataset.voice === voice()));
}

// ---- results: the verdict first, once ----
const SCORE_ICON = { gold: 'coin', fame: 'star', notor: 'flame' };
// delta('fame', '+2'): an outlined chip in the score's colour; a negative one is dashed.
export const delta = (kind, value, neg = false) => h('span', { class: cx('ds-delta', kind, neg && 'neg') }, icon(SCORE_ICON[kind]), String(value));
// found({ art: 'cache', eyebrow: 'You found', title: 'A Cache', line: 'Six treasures, hidden. Tap to look.', onclick }): the gold-bordered box that opens the clearing sheet at that site.
export const found = ({ art: a = 'cache', eyebrow = 'You found', title = '', line = '', onclick, cls, attrs = {} } = {}) =>
    h('button', { type: 'button', onclick, ...attrs, class: cx('ds-found', cls) }, a ? actIcon(a, 32) : null,
        h('span', { class: 'main' }, h('span', { class: 'eyebrow' }, eyebrow), h('b', {}, title), line ? h('span', { class: 'l' }, line) : null), icon('right'));
// resultCard({ label: 'Phase 3 · Search', story, detail, deltas: { fame: 2, notor: 0, gold: -5 }, found: {...}, ledger, stamp }). Only non-zero deltas are drawn, in the
// order Fame, Notoriety, Gold. `story` is the headline in the Story voice, `detail` the one in Detail (omit to use the Story line in both); `ledger` (Detail only) is
// the exact roll in a bordered box. The caller puts the voice switch's setVoice effects in play through voiceSwitch().
export function resultCard({ label = '', story = '', detail = null, deltas = {}, found: f = null, ledger = null, stamp = true, cls, attrs = {} } = {}) {
    const ds = ['fame', 'notor', 'gold'].filter(k => Number(deltas[k]) !== 0 && deltas[k] != null).map(k => { const v = Number(deltas[k]); return delta(k, v > 0 ? `+${v}` : String(v).replace('-', '−'), v < 0); });
    const headline = (m, text) => h('p', { class: cx('headline', stamp && 'ds-stamp'), 'data-v': m, 'aria-live': 'polite' }, text);
    return h('div', { ...attrs, class: cx('ds-result', cls) },
        h('div', { class: 'top' }, h('span', { class: 'ds-eyebrow' }, label), voiceSwitch()),
        headline('story', story), detail != null && detail !== story ? headline('detail', detail) : null,
        ds.length ? h('div', { class: 'ds-deltas' }, ds) : null,
        f ? found(f) : null,
        ledger ? h('div', { class: 'ds-ledger', 'data-v': 'detail' }, ledger) : null);
}
// The three legend frames, the name set into the border: frames({ fame: 32, notor: 40, gold: 210 }).
export const frames = (v, { cls } = {}) => h('div', { class: cx('ds-frames', cls) }, [['fame', 'Fame'], ['notor', 'Notoriety'], ['gold', 'Gold']].filter(([k]) => v[k] != null)
    .map(([k, name]) => h('fieldset', { class: `ds-frame ${k}` }, h('legend', {}, name), h('div', { class: 'v' }, String(v[k])))));

// ---- counters and chits ----
// tile('monsters_c/wolf.gif', 'sm', 'label'): a picture on the cream counter tile (sm 44, default 64, lg 92). Never recolour or crop the art.
export const tile = (img, cls = '', lbl = '') => h('span', { class: cx('ds-counter', cls) }, img ? art(img) : null, lbl ? h('span', { class: 'lbl' }, lbl) : null);
// chit('fight', 'F4', 'FIGHT'): the chit tile (colour bar for fight / move / magic, value, a word). miniChit is the 14x20 one for pip rows.
export const chit = (kind, v, label, cls = '') => h('button', { type: 'button', class: cx('ds-chit', kind, cls) }, h('span', {}, String(v)), h('small', {}, label || kind.toUpperCase()));
export const miniChit = (kind, cls = '') => h('i', { class: cx('ds-chit', 'mini', kind, cls) });

// ---- states, toast ----
// state({ glyph: 'warn', title, text, color, body }): the centred card of an empty / loading / error screen (loading adds .ds-progress in `body`).
export const state = ({ glyph = 'flag', title = '', text = '', color = null, body = null } = {}) =>
    h('div', { class: 'ds-state' }, h('div', { class: 'glyph', style: color ? `color:${color}` : null }, icon(glyph)), h('h2', {}, title), text ? h('p', {}, text) : null, body);
// toast(text, { bad, host, ms }): one line with a gold rule (red when it is a refusal), above the tray. Never raw engine text. Goes away after ms (3.2 s).
export function toast(text, { bad = false, host = null, ms = 3200 } = {}) {
    const el = h('div', { class: cx('ds-toast', bad && 'bad'), role: 'status', 'aria-live': 'polite' }, text);
    const parent = host ?? document.querySelector('.ds-app') ?? document.body;
    const tr = parent.querySelector('.ds-tray');
    el.style.bottom = `${(tr ? tr.offsetHeight : 120) + 12}px`;
    parent.querySelector(':scope > .ds-toast')?.remove();
    parent.append(el);
    if (ms) setTimeout(() => el.remove(), ms);
    return el;
}

// ---- Calm motion ----
// The in-app Calm setting (localStorage 'mr-calm', channel-prefixed by channel.js) sets <html data-calm="on">; tokens.css then makes every duration 1ms. The
// phone's own reduced-motion setting does the same through a media query, so Calm only ever adds.
const CALM_KEY = 'mr-calm';
export const calm = () => { try { return ['1', 'on', 'true'].includes(localStorage.getItem(CALM_KEY)); } catch { return false; } };
export function applyCalm() { const on = calm(); if (on) document.documentElement.dataset.calm = 'on'; else delete document.documentElement.dataset.calm; return on; }
export function setCalm(on) { try { if (on) localStorage.setItem(CALM_KEY, '1'); else localStorage.removeItem(CALM_KEY); } catch { /* ignore */ } return applyCalm(); }

// Boot: called once by main.js before the first render.
export function initDs() { applyCalm(); syncVoice(); onVoice(syncVoice); }
