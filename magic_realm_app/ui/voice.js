// How the boxes that describe rolls and results speak: as a short story ("Story") or in the exact words and numbers ("Detail"). One setting for the whole game,
// remembered on this device; every box that describes a roll shows the same switch, and flipping any of them flips them all.
import { h } from './dom.js';
import { tell, narrateRoll } from '../engine/story.js';

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

// The curses in a sentence of their own (the plain line carries the rules text of the curse).
const CURSE_STORY = {
    Eyemist: 'A mist settles over your eyes: you cannot search.',
    Squeak: 'Every step you take squeaks: there is no hiding now.',
    Wither: 'A withering chill saps you: your strongest efforts leave you spent.',
    'Ill Health': 'Sickness takes hold: you cannot rest it off.',
    Ashes: 'Your gold turns to ash: you may add to it, but never spend it.',
    Disgust: 'Your good name sours: Fame can be won, but never spent.',
};
// Lines the engine wrote without a story of their own (loot results, curses, dice notes) are told here, so the Story voice never shows the plain words twice.
const told = l => {
    let m;
    if (l.k === 'loot') { const t = tell.phase({ rollSeq: 0 }, l.t); if (t && t !== `${l.t.replace(/\.$/, '')}.`) return t; }
    if (l.k === 'curse' && (m = /^A curse falls on you: ([\w ]+)\./.exec(l.t))) return CURSE_STORY[m[1]] ?? `A curse takes hold: ${m[1]}.`;
    if (l.k === 'roll' && (m = /^\u{1F3B2} (.+?): rolled [^:]*?(?:: (.*))?$/u.exec(l.t))) { const n = narrateRoll({ what: m[1], result: m[2] ?? '' }); if (n?.line) return n.line; }
    return null;
};
// A log line in the current voice: the story when it has one, else its plain words.
// A line of the table about characters carries `p`: the same sentence told with the players' names, which is how a table talks ("Ann follows Mike.").
export const logText = l => (l.p ? l.p : mode === 'story' ? (l.s ?? storyOf(l.t) ?? told(l) ?? l.t) : l.t);

// The little switch every such box carries.
export function voiceChip() {
    const b = (m, label) => h('button', { class: `vc${mode === m ? ' on' : ''}`, 'data-voice': m, 'aria-pressed': mode === m ? 'true' : 'false', onclick: e => { e.stopPropagation(); setVoice(m); } }, label);
    return h('span', { class: 'voicechip', role: 'group', 'aria-label': 'How rolls are described' }, b('story', 'Story'), b('detail', 'Detail'));
}
