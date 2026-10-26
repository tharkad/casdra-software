// screens/kit/common.js (P2): small helpers the Kit, Company, Spells, Trade, Hire and Boon screens share. No state of its own: everything comes in through G.
// The screens in this folder return sheet CONTENT: { title, eyebrow, body, foot, decision, detent } built with ds.js / dom.js h(), taking G and a small options object.
// They do not depend on the frame they are shown in. mountSheet() (below) puts the content into the shell's frame, modal() (P0b: a wrapper over ds.js sheet()); `bare` keeps the sheet-body shim for old contents off.
import { WEIGHT_WORDS } from '../../../engine/core.js';
import { defOf, nameOf, priceOf, weightOf } from '../../../engine/items.js';
import { h } from '../../dom.js';
import { actIcon, art, icon } from '../../icons.js';
import { modal, nativePic, picOf, voidBy } from '../play/kit.js';
import { render } from '../play/shell.js';
import { ROAD_STORY, roadLockOf } from '../../commit.js';
import { voice } from '../../voice.js';

// ---- mounting ----
// content -> the sheet element(s) the layer shows. `close` makes it an information sheet (scrim, pull down, tap outside); without it the sheet is a decision (it has the Map peek).
export const mountSheet = (G, c, { close, cls } = {}) => modal(G, c.title, c.body, { close, cls, footer: c.foot ? h('div', { class: 'kit-footwrap' }, c.foot) : null, eyebrow: c.eyebrow, detent: c.detent, bare: true });

// ---- words ----
export const minus = n => String(n).replace('-', '−');
export const signed = n => (n > 0 ? `+${n}` : minus(n));
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// "the Order" -> true gold: group names read better with their article
export const the = g => `the ${g}`;

// One line the player reads, shown for a moment above the sheet (the same toast the engine's refusals use). Never raw engine text.
export function say(G, text) {
    if (text === ROAD_STORY && voice() === 'detail') text = roadLockOf(G.st)?.detail ?? text;          // the road's lock (8.3.8d) is told in the voice he has chosen
    G.ui.toast = text; G.ui.toastWhy = true; render(G);          // (toastWhy: this is a dim control answering, not the engine refusing something; the fuzz tool tells them apart)
    clearTimeout(G.ui.toastTimer);
    G.ui.toastTimer = setTimeout(() => { G.ui.toast = null; G.ui.toastWhy = false; render(G); }, 2600);
}

// ---- moods ----
export const MOOD = { '-2': 'enemy', '-1': 'unfriendly', '0': 'neutral', '1': 'friendly', '2': 'ally' };
export const MOOD_WORD = { enemy: 'Enemy', unfriendly: 'Unfriendly', neutral: 'Neutral', friendly: 'Friendly', ally: 'Ally' };
export const moodOf = rel => MOOD[String(Math.max(-2, Math.min(2, rel ?? 0)))];
// A dot plus the word, never colour alone. `name` ahead of the word makes the "Order · Ally" form.
export const moodTag = (rel, name = '') => { const m = moodOf(rel); return h('span', { class: `ds-tag mood ${m}` }, name ? `${name} · ${MOOD_WORD[m]}` : MOOD_WORD[m]); };

// ---- items ----
// The picture of an item on the cream tile: the game's own art when it has one (weapons, armor, steeds), else a neutral glyph from the 32px action art.
const GLYPH = { boots: 'move', gloves: 'glove', treasure: 'cache', spell: 'spell' };
export function itemArt(G, it) {
    const name = nameOf(G.data, it), pic = picOf(G, name) ?? (defOf(G.data, it)?.name ? picOf(G, defOf(G.data, it).name) : null);
    const glyph = /boots|slippers/i.test(name) ? GLYPH.boots : /gloves|gauntlets/i.test(name) ? GLYPH.gloves : GLYPH.treasure;
    return pic ? h('img', { src: pic, alt: '', draggable: 'false' }) : glyph === 'glove' ? icon('glove', 'lg') : actIcon(glyph, 28);
}
export const itemTile = (G, it, cls = '') => h('span', { class: `ds-counter ${cls}` }, itemArt(G, it));

// The first clause of a treasure's printed effect: it already reads as a plain line ("Gives an extra Hide phase."), cut where the card first says "; ".
export function gist(G, it) {
    const d = defOf(G.data, it), text = (d?.effectText ?? '').trim();
    if (!text) return '';
    const first = text.split(/;\s/)[0].replace(/\.$/, '');
    return `${first}.`;
}

// What armor guards against, in words: the directions it covers, or the one direction chosen each round (a shield); an armor card says its toughness too.
export function guards(d) {
    const dir = (d.protects ?? []).length ? d.protects.join(', ') : null;
    const where = dir ? `against ${dir}` : d.chooseOneDirection ? 'against the one direction you choose each round' : '';
    return d.card ? `${WEIGHT_WORDS[d.toughness] ?? ''} toughness${where ? ` ${where}` : ''}.`.replace(/^ /, '') : where ? `Guards ${where}.` : 'Armor.';
}

// What an item is, in a few plain words (the rules text stays in its card). Weapons and armor read from their own data; a treasure from its printed effect.
export function oneLine(G, it, { packHorse = false } = {}) {
    const d = defOf(G.data, it);
    if (!d) return '';
    if (it.kind === 'weapon') return `${d.missile ? 'A missile weapon' : 'A striking weapon'}, length ${d.length}.`;
    if (it.kind === 'armor') return guards(d);
    if (it.kind === 'horse') return `${packHorse ? 'Carries your pack. ' : ''}Walks ${d.walk.strength}${d.walk.moves}, gallops ${d.gallop.strength}${d.gallop.moves}.`;
    return gist(G, it);
}

export const weightWord = (G, it) => WEIGHT_WORDS[weightOf(G.data, it)] ?? '';

// The gold an item fetches, or that number struck through while the Ashes curse makes gold worthless (the number is still information).
// DR-6: never "12g". In running text pass `unit: ' Gold'` ("12 Gold"); in a row's price slot (no unit) it is the coin glyph and the number, which reads as Gold and fits.
export function goldEl(G, n, { unit = null } = {}) {
    const body = unit ? `${n}${unit}` : h('span', { class: 'kit-gold', 'aria-label': `${n} Gold` }, icon('coin'), String(n));
    return voidBy(G.st, 'gold') ? h('s', { class: 'void', title: 'Worthless: the Ashes curse' }, body) : body;
}
export const worthOf = (G, it) => priceOf(G.data, it);

// ---- natives ----
export const nativeArt = (G, id) => nativePic(G, id);

// ---- pieces ----
// A dim button that says why when pressed (never `disabled`, never silent): a ds-btn with .is-dim and aria-disabled, whose press shows the reason.
export const dimBtn = (G, label, why, attrs = {}, cls = '') => h('button', { type: 'button', ...attrs, class: `ds-btn ${cls} is-dim`, 'aria-disabled': 'true', onclick: () => say(G, why) }, label);

// The segmented control of a sheet: [{ key, label, n }] with the current key lit. `attr` is the data attribute the tabs carry (tests click them).
export function seg(list, on, pick, attr = 'data-tab') {
    return h('div', { class: 'ds-seg kit-seg', role: 'tablist' }, list.map(t => h('button', { type: 'button', role: 'tab', 'aria-selected': on === t.key ? 'true' : 'false', [attr]: t.key, class: on === t.key ? 'on' : null, onclick: () => pick(t.key) }, t.label, t.n ? h('sup', {}, String(t.n)) : null)));
}

// The foot of a decision sheet: one line of what will happen (with the balance after), then the secondary on the left and the ONE primary on the right.
// `bad` makes the line the sheet's reason in red (why the primary is dim: "You are 12 gold short"); `aside` is a quiet button on the right of the line ("Skip this phase").
export function footRow({ note = null, bad = false, aside = null, secondary = null, primary = null } = {}) {
    const line = note ? h('div', { class: `ds-lead-text kit-note${bad ? ' bad' : ''}`, 'data-note': '' }, note) : null;
    return h('div', { class: 'kit-foot' }, aside ? h('div', { class: 'kit-noterow' }, line, aside) : line, h('div', { class: 'kit-foot-row' }, secondary, primary));
}

// The quiet "pass this phase" button of a Trade or Hire sheet (the engine's own answer for it is sent: trade `done`, hire `cancel`).
export const skipBtn = onclick => h('button', { type: 'button', class: 'ds-btn sm quiet kit-skip', 'data-act': 'skip-phase', onclick }, 'Skip this phase');

// The check badge on the corner of a ticked row's picture.
export const tick = () => h('i', { class: 'kit-tick', 'aria-hidden': 'true' }, icon('check'));

export { art, icon, actIcon };
export { ask, twoLine } from '../../ds.js';
