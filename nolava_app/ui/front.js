// front.js: the small builders every front-door screen shares (title, wizard, history, settings, online, lobby; docs/design/redesign/BUILD-SPEC.md section 7).
// They return DOM through dom.js h() and use the design system's classes (css/core.css, css/ds-front.css). No screen state lives here.
import { h } from './dom.js';
import { icon, art } from './icons.js';
import { sheet, toast } from './ds.js';
import { styleOf } from './party.js';
import { displayName } from './names.js';

const cx = (...a) => a.filter(Boolean).join(' ');

// ---- the app root: sheets and toasts of a front-door screen live here (position: fixed, so absolute children reach the real screen edges) ----
export const appEl = () => document.getElementById('app') ?? document.body;

// Which picture belongs to a character id ('woods-girl' -> woodsgirl, 'black-knight' -> black_knight).
export const charFile = id => (id === 'woods-girl' ? 'woodsgirl' : String(id ?? '').replace(/-/g, '_'));
export const portraitSrc = id => `art/characters/${charFile(id)}.png`;
export const cardSrc = id => `art/characterdetail/${charFile(id)}.jpg`;
// A character id as the player reads it: 'black-knight' -> 'Black Knight', 'captain' -> 'Captain', 'sorceror' -> 'Sorcerer' (QA-125).
export const charLabel = id => displayName(String(id ?? '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
// The round face of a character (history rows, online rows, lobby).
export const face = id => h('span', { class: 'face' }, id ? art(`characters/${charFile(id)}.png`) : null);

// One colour AND one shape AND one letter per seat (the same look as on the map, party.js SEAT_STYLES).
const SHAPE = { circle: '', square: 'sq', diamond: 'di', triangle: 'tri' };
export function seatBadge(i, letter, extra = '') { const st = styleOf(i); return h('span', { class: `ds-pc ${SHAPE[st.shape] ?? ''} ${extra}`.trim(), style: `--pc:${st.color}`, 'aria-hidden': 'true' }, letter); }

// ---- header: back, title, optional "Step n of m" and ticks ----
export function bar(title, { onBack, step = null, of = null, hook = {} } = {}) {
    const top = h('div', { class: 'ds-bar' },
        h('button', { type: 'button', class: 'back', 'aria-label': 'Back', ...hook, onclick: onBack }, icon('left', 'lg')),
        h('h1', {}, title),
        step ? h('span', { class: 'step' }, `Step ${step} of ${of}`) : null);
    return h('div', { class: 'ds-barwrap' }, top,
        step ? h('div', { class: 'ds-ticks', 'aria-hidden': 'true' }, Array.from({ length: of }, (_, i) => h('i', { class: i + 1 < step ? 'done' : i + 1 === step ? 'now' : '' }))) : null);
}

// ---- sheets and the toast ----
// Put a sheet (from ds.js sheet()) on the app root and return a function that takes it away again.
export function openSheet(frag) {
    const host = appEl(), nodes = [frag.scrim, frag.sheet].filter(Boolean);
    host.append(...nodes);
    const close = () => nodes.forEach(n => n.remove());
    return close;
}
// The house confirm (the Abandon sheet's pattern): who and what, what it costs, what survives. The SAFE choice is the gold primary at the right; the destructive one is the red button.
//   confirmSheet({ eyebrow, title, lines: [voice sentence, plain sentence], safe: { label, attrs, onclick }, risky: { label, attrs, onclick }, attrs })
export function confirmSheet({ eyebrow = '', title, lines = [], safe, risky, attrs = {} }) {
    let close = () => {};
    const done = fn => e => { close(); fn?.(e); };
    const frag = sheet({ eyebrow, title, detent: 'hug', x: false, attrs: { 'data-confirm': '', ...attrs }, onClose: () => close(),
        body: [h('p', { class: 'ds-voice lg ds-sheet-lede' }, lines[0] ?? ''), ...lines.slice(1).map(t => h('p', { class: 'ds-text ds-dim ds-sheet-line' }, t))],
        foot: [h('button', { type: 'button', class: 'ds-btn danger', ...(risky.attrs ?? {}), onclick: done(risky.onclick) }, risky.label),
            h('button', { type: 'button', class: 'ds-btn primary', ...(safe.attrs ?? {}), onclick: done(safe.onclick) }, safe.label)] });
    close = openSheet(frag);
    return close;
}
// A message that answers a dim control or a refusal: one line above the footer.
export function say(text, opts = {}) {
    const host = appEl(), el = toast(text, { ...opts, host });
    const foot = host.querySelector('.ds-foot');
    el.style.bottom = `${(foot ? foot.offsetHeight : 96) + 12 + (opts.lift ?? 0)}px`;
    return el;
}

// ---- forms ----
// field('Your name', input) -> label + input in the design system's field
export const field = (label, input, { why = null, cls } = {}) => h('div', { class: cx('ds-field', cls) }, h('label', {}, label), input, why);
export const input = (attrs = {}) => h('input', { type: 'text', autocomplete: 'off', ...attrs, class: cx('ds-input', attrs.class) });
// A switch row: title, one plain sentence, the word Active/Inactive, a real toggle at the right. The whole row is the control (role=switch, aria-checked); an optional (i) opens the full rule text.
//   switchRow({ title, line, on, onToggle, attrs, info: 'full text' })
export function switchRow({ title, line, on, onToggle, attrs = {}, info = null, note = null, label = ['Inactive', 'Active'] }) {
    let open = false;
    const rule = info ? h('p', { class: 'ds-rule', hidden: true }, info) : null;
    const i = info ? h('button', { type: 'button', class: 'ds-info', 'aria-label': `About ${title}`, onclick: e => { e.stopPropagation(); open = !open; rule.hidden = !open; i.classList.toggle('on', open); } }, icon('info')) : null;
    const row = h('div', { class: 'ds-switch-row', role: 'switch', tabindex: 0, 'aria-checked': on ? 'true' : 'false', ...attrs, onclick: onToggle, onkeydown: e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(); } } },
        h('span', { class: 'main' }, h('b', {}, title, i), h('span', { class: 'ds-sw-line' }, typeof line === 'string' ? nb(line) : line), rule, note ? h('span', { class: 'ds-sw-note' }, note) : null, label ? h('i', { class: 'st' }, on ? label[1] : label[0]) : null),
        h('span', { class: cx('ds-toggle', on && 'on'), 'aria-hidden': 'true' }));
    return row;
}
// A segmented control. seg([['story','Story'], ...], value, onPick, { attrs: (id) => ({}) })
export const seg = (options, value, onPick, { label = '', attrOf = () => ({}) } = {}) =>
    h('div', { class: 'ds-seg', role: 'radiogroup', 'aria-label': label }, options.map(([id, text]) =>
        h('button', { type: 'button', class: id === value ? 'on' : null, role: 'radio', 'aria-checked': id === value ? 'true' : 'false', ...attrOf(id), onclick: () => onPick(id) }, text)));

// ---- the foot of a wizard / lobby screen: summary or reason on the left, the primary at the right (62%) ----
export const foot = (...kids) => h('div', { class: 'ds-foot' }, ...kids);
export const sum = (...kids) => h('span', { class: 'sum', role: 'status' }, ...kids);

// ---- text ----
export const sign = n => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
export const dateLabel = iso => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const nb = s => String(s).replace(/ (?=\S+$)/, ' ');          // no orphaned last word or number
