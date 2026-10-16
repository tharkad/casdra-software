// How the boxes that describe rolls and results speak: as a short story ("Story") or in the exact words and numbers ("Detail"). One setting for the whole game,
// remembered on this device; every box that describes a roll shows the same switch, and flipping any of them flips them all.
import { h } from './dom.js';

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

// A log line in the current voice: the story when it has one, else its plain words.
export const logText = l => (mode === 'story' ? (l.s ?? l.t) : l.t);

// The little switch every such box carries.
export function voiceChip() {
    const b = (m, label) => h('button', { class: `vc${mode === m ? ' on' : ''}`, 'data-voice': m, 'aria-pressed': mode === m ? 'true' : 'false', onclick: e => { e.stopPropagation(); setVoice(m); } }, label);
    return h('span', { class: 'voicechip', role: 'group', 'aria-label': 'How rolls are described' }, b('story', 'Story'), b('detail', 'Detail'));
}
