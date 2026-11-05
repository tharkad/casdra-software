// How the boxes that describe rolls and results speak: as a short story ("Story") or in the exact words and numbers ("Detail"). One setting for the whole game,
// remembered on this device; every box that describes a roll shows the same switch, and flipping any of them flips them all.
import { h } from './dom.js';
import { lineFor } from './storyvoice.js';

let mode = 'story';
try { if (localStorage.getItem('mr-voice') === 'detail') mode = 'detail'; } catch { /* ignore */ }
const subs = new Set();

export const voice = () => mode;
export const isStory = () => mode === 'story';
export function setVoice(m) {
    mode = m === 'detail' ? 'detail' : 'story';
    try { localStorage.setItem('mr-voice', mode); } catch { /* ignore */ }
    subs.forEach(f => f());
}
export const onVoice = f => { subs.add(f); return () => subs.delete(f); };

// A log line in the current voice (the Story voice of every line the engine wrote without one, and of the lines whose `s` is only the plain words again, lives in
// storyvoice.js; the Detail line is always the entry's own `t`). A line of the table about characters carries `p`: the same sentence told with the players' names,
// which is how a table talks ("Ann follows Mike."). `st` (optional) lets a roll line say what the roll came to.
export const logText = (l, st = null) => lineFor(l, mode, st);

// The little switch every such box carries.
export function voiceChip() {
    const b = (m, label) => h('button', { class: `vc${mode === m ? ' on' : ''}`, 'data-voice': m, 'aria-pressed': mode === m ? 'true' : 'false', onclick: e => { e.stopPropagation(); setVoice(m); } }, label);
    return h('span', { class: 'voicechip', role: 'group', 'aria-label': 'How rolls are described' }, b('story', 'Story'), b('detail', 'Detail'));
}
