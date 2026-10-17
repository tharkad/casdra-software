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

// The lines that end a character (the engine's killMe) carry no story of their own: their Story form is written here, so the
// plain "deals H harm; you are slain" never reaches the Story voice. The plain words stay for Detail.
const HARM_BLOW = { N: 'glances off', L: 'thuds against', M: 'bites into', H: 'hammers', T: 'crashes down on' };
const DEATH_STORY = [
    [/^(.+?) deals (\w) harm; you are slain\.$/, m => `The ${m[1]}'s blow ${HARM_BLOW[m[2]] ?? 'strikes'} you. You fall.`],
    [/^(.+?) deals (\w) harm; the (.+?) you are is slain\.$/, m => `The ${m[1]}'s blow ${HARM_BLOW[m[2]] ?? 'strikes'} you. The ${m[3]} you are falls.`],
    [/^(.+?)'s shot finds a vital spot; you are slain\.$/, m => `The ${m[1]}'s shot finds a vital spot. You fall.`],
    [/^(.+?)'s shot finds a vital spot; the (.+?) you are is slain\.$/, m => `The ${m[1]}'s shot finds a vital spot. The ${m[2]} you are falls.`],
];
const storyOf = t => { const plain = t.replace(/ #\d+/g, ''); for (const [re, to] of DEATH_STORY) { const m = re.exec(plain); if (m) return to(m); } return null; };

// A log line in the current voice: the story when it has one, else its plain words.
export const logText = l => (mode === 'story' ? (l.s ?? storyOf(l.t) ?? l.t) : l.t);

// The little switch every such box carries.
export function voiceChip() {
    const b = (m, label) => h('button', { class: `vc${mode === m ? ' on' : ''}`, 'data-voice': m, 'aria-pressed': mode === m ? 'true' : 'false', onclick: e => { e.stopPropagation(); setVoice(m); } }, label);
    return h('span', { class: 'voicechip', role: 'group', 'aria-label': 'How rolls are described' }, b('story', 'Story'), b('detail', 'Detail'));
}
