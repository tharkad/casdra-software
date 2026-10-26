// play/piece_card.js: the item card. A piece of the game (a monster or a native counter) shown big, with its numbers and what they mean. One reusable sheet:
// openPiece(G, { kind, id, side }) puts it up and Back returns to whatever was open (G.ui.pieceFrom). Treasures and sites can use the same frame later.
import { denSide } from '../../../engine/combat.js';
import { h } from '../../dom.js';
import { monsterCounter } from '../../counter.js';
import { icon } from '../../icons.js';
import { modal } from './kit.js';
import { render } from './shell.js';

export function openPiece(G, spec) {
    G.ui.pieceFrom = G.ui.sheet ?? null;
    G.ui.piece = { side: 'light', ...spec };
    G.ui.sheet = 'piece';
    render(G);
}

const HARM = { L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };
const SIDE_WORD = { light: 'Light side', dark: 'Dark side', red: 'Red side' };

// the sides this piece has, in the order a tap turns them
function sidesOf(def, kind) {
    if (kind !== 'mon') return ['light'];
    return ['light', def.dark ? 'dark' : null, def.red ? 'red' : null].filter(Boolean);
}

// What the numbers on the counter mean, in plain words (printed rules 3.1: vulnerability, harm, attack time, move time).
function factsOf(s, def, kind) {
    const out = [];
    out.push(`${kind === 'nat' ? 'A native' : 'A creature'} of size ${HARM[s.size] ?? HARM[s.vuln] ?? s.vuln}. It takes a blow of ${HARM[s.vuln] ?? s.vuln} harm or more to be killed${s.armored ? ' (armored: a weaker blow glances off)' : ''}.`);
    if (s.attack === 'spell') out.push(`It does not strike: it casts a spell at attack time ${s.atk}.`);
    else if (s.harm) out.push(`Its blow is ${HARM[s.harm] ?? s.harm} harm${'*'.repeat(s.stars || 0)} at attack time ${s.atk}${s.length ? `, length ${s.length}` : ''}.`);
    else out.push('This side has no attack: it only blocks.');
    if (s.move != null) out.push(`Move time ${s.move}: the lower it is, the sooner it moves in a round.`);
    if (def.flies) out.push('It flies.');
    if (s.fame || s.notor) out.push(`Killing it earns ${[s.fame ? `${s.fame} Fame` : '', s.notor ? `${s.notor} Notoriety` : ''].filter(Boolean).join(' and ')}.`);
    return out;
}

export function pieceSheet(G) {
    const sp = G.ui.piece, back = { close: () => { G.ui.sheet = G.ui.pieceFrom ?? null; G.ui.piece = G.ui.pieceFrom = null; render(G); } };
    const def = sp && (sp.kind === 'mon' ? G.data.monsters[sp.id] : G.data.natives[sp.id]);
    if (!def) return modal(G, 'Piece', h('p', { class: 'hint' }, 'Nothing to show.'), back);
    const sides = sidesOf(def, sp.kind), side = sides.includes(sp.side) ? sp.side : 'light';
    const s = denSide(G.st, G.data, { kind: sp.kind, id: sp.id, side, tag: sp.tag });
    const pic = sp.kind === 'nat' ? G.data.art?.natives?.[sp.id] : (G.data.art?.monstersColor?.[def.name] ?? G.data.art?.monsters?.[def.name]);
    const counter = monsterCounter({ s, side, picture: pic ?? null, flies: !!def.flies, size: 220 });
    return modal(G, sp.tag ? s.name : def.name, h('div', { class: 'piececard', 'data-piece': sp.id },
        h('div', { class: 'big' }, counter),
        sides.length > 1 ? h('button', { type: 'button', class: 'ds-btn quiet block', 'data-act': 'piece-turn', onclick: () => { G.ui.piece = { ...sp, side: sides[(sides.indexOf(side) + 1) % sides.length] }; render(G); } }, icon('retry'), `${SIDE_WORD[side]}: turn it over`) : null,
        h('ul', { class: 'facts' }, ...factsOf(s, def, sp.kind).map(t => h('li', {}, t)))), back);
}
