// portrait.js: the realm map turned a quarter turn to fill a tall screen (note 150). docs/design/redesign/PORTRAIT-MAP.md.
// The board is a wide field of flat-top hexagons; an upright phone is tall. Turned clockwise (north to the right, east down) the board's long side runs down the screen and the whole realm
// is drawn larger. This file holds the setting and the one decision; mapview.js does the turning (positions only, so every name, number and ring stays upright).
const KEY = 'mr-portrait';                                    // stored per channel by channel.js, like every setting; absent = on, 'off' = off, 'always' = a testing aid (turn even when it does not make the realm bigger)

/** 'on' (the default), 'off' or 'always'. */
export const portraitSetting = () => { try { const v = localStorage.getItem(KEY); return v === 'off' ? 'off' : v === 'always' ? 'always' : 'on'; } catch { return 'on'; } };
export const portraitOn = () => portraitSetting() !== 'off';
export function setPortraitOn(on) { try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, 'off'); } catch { /* storage may be unavailable */ } return portraitOn(); }

/** A phone held upright: narrower than 700 and taller than wide (the tablets, the desktop and a phone on its side keep the map as it was). */
export const tallPhone = (w, h) => w < 700 && h > w;
// The map box of an upright phone is about the window's width by 62% of its height (the story strip above and the tray below take the rest): the decision is made on that shape, so it does not
// change when a sheet covers part of the map.
const BOX_H = 0.62, ROOM = 56, GAIN = 1.05;

/**
 * Quarter turns (0 or 1, clockwise) for a window of w x h showing a board of bw x bh world units: 0 unless the setting is on, the window is an upright phone, and turning makes the whole realm at
 * least 5% larger (a realm that is already taller than wide stays as it is). 'always' skips the last test.
 */
export function turnFor({ w, h, bw, bh, setting = 'on' }) {
    if (setting === 'off' || !tallPhone(w, h) || !(bw > 0) || !(bh > 0)) return 0;
    if (setting === 'always') return 1;
    const W = w - ROOM, H = h * BOX_H - ROOM, k0 = Math.min(W / bw, H / bh), k1 = Math.min(W / bh, H / bw);
    return k1 > k0 * GAIN ? 1 : 0;
}
