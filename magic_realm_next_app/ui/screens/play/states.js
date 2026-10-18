// play/states.js: the game screen before it has anything to show (mockup 08 j3, j4): loading is a skeleton, never a blank frame; an error is a centred card with a way out (Try again, Back).
// The map buttons exist only once a map does (wireShell adds the map button after the map is mounted).
import { h } from '../../dom.js';
import { btn, state } from '../../ds.js';
import { icon } from '../../icons.js';

// "The realm is opening": the strip is a skeleton, the map area a card with a gold progress line, the tray two skeleton rows.
export function showLoading(G, text = 'The tiles are finding their places.') {
    G.strip.replaceChildren(h('span', { class: 'menu' }), h('div', { class: 'ds-day' }, h('div', { class: 'ds-skel', style: 'width:90px;height:16px' })), h('span'), h('span'));
    G.mapBox.querySelector('.ds-state')?.remove();
    G.mapBox.append(h('div', { class: 'ds-state-host', 'data-state': 'loading' }, state({ glyph: 'flag', title: 'Opening the realm', text, body: h('div', { class: 'ds-progress' }) })));
    G.tray.className = 'ds-tray gdock loading';
    G.tray.replaceChildren(h('div', { class: 'ds-grab' }), h('div', { class: 'tray-skel' }, h('div', { class: 'ds-skel', style: 'height:22px;width:70%' }), h('div', { class: 'ds-skel', style: 'height:52px' })));
}

// An error you can leave. `text` is what happened in the game's own words; `details` (the technical message) is one tap away for the bug report.
// back: { label, act, go } the quiet button on the left; retry: fn or null (the primary on the right).
export function showError(G, { title = 'The realm would not open', text = 'Something went wrong while opening the game.', details = '', glyph = 'warn', back = null, retry = null } = {}) {
    G.strip.replaceChildren(h('span', { class: 'menu' }), h('div', { class: 'ds-day' }, h('b', {}, 'Magic Realm')), h('span'), h('span'));
    G.mapBox.querySelector('.ds-state-host')?.remove();
    let shown = false; const more = details ? btn('Details', 'quiet sm', { 'data-act': 'error-details', onclick: e => { shown = !shown; e.currentTarget.nextSibling?.remove(); if (shown) e.currentTarget.after(h('p', { class: 'ds-meta ds-error-details' }, details)); } }) : null;
    const card = state({ glyph, color: 'var(--danger)', title, text, body: more });
    card.dataset.state = 'error';
    G.mapBox.append(h('div', { class: 'ds-state-host', 'data-state': 'error' }, card));
    G.tray.className = 'ds-tray gdock error';
    G.tray.replaceChildren(h('div', { class: 'ds-grab' }), h('div', { class: 'ds-actions' },
        h('div', { class: 'lead' }, back ? btn(back.label, 'quiet', { 'data-act': back.act ?? 'back-title', onclick: back.go }) : null),
        retry ? btn([icon('retry'), ' Try again'], 'primary', { 'data-act': 'retry', onclick: retry }) : null));
}

// The map is there: the loading card goes.
export function doneLoading(G) { G.mapBox.querySelector('.ds-state-host')?.remove(); }

// What a player is told when the game cannot be opened: connection trouble in one sentence, anything else in another.
export const plainReason = e => (/fetch|network|load failed|connection|timed? ?out|offline|failed to/i.test(String(e?.message ?? e))
    ? 'We could not reach the game. Check your connection and try again.' : 'Something went wrong while opening the game. Try again, or go back to the title.');
