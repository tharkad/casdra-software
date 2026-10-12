import { h } from './dom.js';

// The emblem: one map tile seen from above. A hex outline, clearings (the filled discs) and the paths between them, with a sun above and a
// moon below for the day and night of the game. Original line art; it deliberately says "clearings and paths", the heart of the game.
const SVG = `<svg viewBox="0 0 200 200" aria-hidden="true">
  <defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1d27f"/><stop offset="1" stop-color="#b98a2c"/></linearGradient></defs>
  <polygon class="hex" points="100,8 179.7,54 179.7,146 100,192 20.3,146 20.3,54"/>
  <polygon class="hex inner" points="100,24 165.8,62 165.8,138 100,176 34.2,138 34.2,62"/>
  <g class="paths">
    <path d="M100 100 L100 54"/><path d="M100 100 L54 128"/><path d="M100 100 L146 128"/>
    <path d="M100 54 L100 24"/><path d="M54 128 L34.2 138"/><path d="M146 128 L165.8 138"/>
    <path d="M100 54 C 122 60, 142 60, 165.8 62"/><path d="M54 128 C 46 112, 40 90, 34.2 62"/>
  </g>
  <g class="clearings">
    <circle cx="100" cy="100" r="12"/><circle cx="100" cy="54" r="8"/><circle cx="54" cy="128" r="8"/><circle cx="146" cy="128" r="8"/>
  </g>
  <circle class="sun" cx="100" cy="16" r="3.6"/>
  <path class="moon" d="M100 188 a6.5 6.5 0 1 0 5 -10.4 a5 5 0 1 1 -5 10.4z"/>
</svg>`;

export const emblem = (cls = 'emblem') => { const el = h('div', { class: cls }); el.innerHTML = SVG; return el; };
