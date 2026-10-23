// icons.js: the design system's icons and art helpers (docs/design/redesign/DESIGN-SYSTEM.md section 5).
// `I` holds the 24px line-icon path data copied VERBATIM from mockups/ds.js (MR.I): stroke 1.75, round caps, currentColor (the .ds-i rule in css/core.css draws them).
// Game art comes first: art(path) is any picture under app/art, actIcon(name, size) the 32px pixel action art (art/actions/*.gif) drawn pixelated at 20/24/28/32/48/64.
import { h, sv } from './dom.js';

export const ART = 'art/';
export const I = {
    menu: 'M4 7h16M4 12h16M4 17h16', close: 'M6 6l12 12M18 6L6 18', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', right: 'M9 6l6 6-6 6', left: 'M15 6l-6 6 6 6',
    check: 'M5 12.5l4.5 4.5L19 7.5', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
    lock: 'M7 11h10a1 1 0 011 1v7a1 1 0 01-1 1H7a1 1 0 01-1-1v-7a1 1 0 011-1zM8.5 11V8a3.5 3.5 0 017 0v3',
    coin: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 8a4 4 0 100 8 4 4 0 000-8z',
    star: 'M12 3.5l2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 17.1l-5.5 3.1 1.3-6.1-4.6-4.2 6.2-.7z',
    flame: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3.2 2-4.2.3 1.2 1 2 2 2.2C11 8 11 5.5 12 3z',
    cross: 'M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M12 6a6 6 0 100 12 6 6 0 000-12z', fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    dice: 'M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2zM9 9h.01M15 15h.01M12 12h.01M9 15h.01M15 9h.01',
    book: 'M5 4.5h10a3 3 0 013 3V20H8a3 3 0 01-3-3V4.5zM5 16.5a3 3 0 013-3h10',
    bag: 'M6.5 9h11l1 11h-13l1-11zM9 9a3 3 0 016 0',
    people: 'M9 6a3 3 0 100 6 3 3 0 000-6zM3.5 19c0-3.2 2.4-5 5.5-5s5.5 1.8 5.5 5M17 8a2.4 2.4 0 110 4.8M16 14.3c2.9-.2 4.9 1.5 4.9 4.2',
    spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
    eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 9.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6z',
    eyeoff: 'M3 3l18 18M9.9 5.7A9.6 9.6 0 0112 5.5c6.4 0 10 6.5 10 6.5a16 16 0 01-3.2 3.9M6.2 7.4A16 16 0 002 12s3.6 6.5 10 6.5c1.6 0 3-.4 4.2-1',
    skull: 'M12 3a8 8 0 00-8 8c0 2.5 1.2 4 3 5v3.5h3V17h4v2.5h3V16c1.8-1 3-2.5 3-5a8 8 0 00-8-8zM9 10.5h.01M15 10.5h.01',
    flag: 'M6 21V4M6 5h11l-2 4 2 4H6', warn: 'M12 4l9.5 16.5h-19zM12 10v4.5M12 17.2v.3', info: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 11v5.2M12 7.8v.4',
    pin: 'M12 21s6.5-5.8 6.5-10.8a6.5 6.5 0 10-13 0C5.5 15.2 12 21 12 21zM12 8.3a2.3 2.3 0 100 4.6 2.3 2.3 0 000-4.6z',
    sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6',
    moon: 'M20 14.6A8.2 8.2 0 019.4 4 8.2 8.2 0 1020 14.6z', shield: 'M12 3l7 3v5.2c0 4.4-3 7.9-7 9.8-4-1.9-7-5.4-7-9.8V6z',
    gear: 'M4 7h9M19 7h1M4 17h1M11 17h9M13 5v4M17 5v4M5 15v4M9 15v4M13 7h4M5 17h4',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1', retry: 'M20 12a8 8 0 11-2.5-5.8M20 4v5h-5',
    hourglass: 'M7 3h10M7 21h10M8 3v4l4 5-4 5v4M16 3v4l-4 5 4 5v4', scroll: 'M8 4h9a2 2 0 012 2v11a3 3 0 01-3 3H8a3 3 0 01-3-3v-1h3M8 4a2 2 0 00-2 2v10M10 9h6M10 13h6',
    trophy: 'M8 4h8v5a4 4 0 01-8 0V4zM8 6H5v1.5A3 3 0 008 10.5M16 6h3v1.5a3 3 0 01-3 3M12 13v4M8.5 20h7M10 17h4', swap: 'M7 7h12l-3-3M17 17H5l3 3', trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13', share: 'M12 3v12M8 7l4-4 4 4M5 13v6h14v-6',
    glove: 'M7 21h10v-3.5l2-3V8.5a1.3 1.3 0 00-2.6 0V11V5a1.3 1.3 0 00-2.6 0v5V4a1.3 1.3 0 00-2.6 0v6V5a1.3 1.3 0 00-2.6 0v8.5l-1.6-2.2a1.4 1.4 0 00-2.2 1.7L7 17.5zM7 17.5h10',
    crown: 'M4 17l-1-9 5 4 4-7 4 7 5-4-1 9zM5 20h14', bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
};

// An inline SVG icon element: icon('lock'), icon('menu', 'lg'). `cls` is appended to the base class `ds-i` (lg = 24px, fill = filled, no stroke).
export const icon = (name, cls = '') => sv('svg', { class: cls ? `ds-i ${cls}` : 'ds-i', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, sv('path', { d: I[name] || '' }));
// The same icon as markup text, for the places that build with innerHTML.
export const iconHtml = (name, cls = '') => `<svg class="${cls ? `ds-i ${cls}` : 'ds-i'}" viewBox="0 0 24 24" aria-hidden="true"><path d="${I[name] || ''}"/></svg>`;
// A picture from the original game's art folder (never recoloured, cropped or stretched): art('monsters_c/wolf.gif', 'cls', 'alt').
export const art = (path, cls = '', alt = '') => h('img', { class: cls, src: `${ART}${path}`, alt, draggable: 'false' });
// The 32px action art (move, hide, search, trade, hire, rest, alert, spell, ban, peer, cache, fly, follow, ...) at an integer multiple of its size.
// 'dash' is the picture of "Nothing": a quiet grey dash, not the red prohibition sign (which reads as an error: QA-134).
export const actIcon = (name, size = 32) => (name === 'dash'
    ? h('span', { class: 'ds-dash', style: `width:${size}px;height:${size}px`, 'aria-hidden': 'true' }, icon('minus'))
    : h('img', { class: 'ds-px', width: size, height: size, src: `${ART}actions/${name}.gif`, alt: '' }));
// A die face on the cream tile (the Journal, the last-action line, the result card).
export const die = (n, cls = '') => h('span', { class: cls ? `ds-die ${cls}` : 'ds-die' }, n);
