// combat/party.js: a fight of several characters on ONE phone (a hot-seat party; docs/design/redesign/MULTICHAR.md, notes 87 to 89). The scene used to draw the character who is asked as a big "you"
// at the bottom and everyone else as a small "also here" counter, and never said whose question it was; under 700px tall it did not even write his name. Now the whole party stands on the stage as
// a row of equal tiles (hex face, name, sight, one word for where each is in the round), a banner on top of the decision sheet names the character who is asked and the step in the game's word, and
// the others stand quiet. Everything is read from `view.table.fight` (the members' `state`, `why` and the step they are at) and the characters' public sheets; nothing is parsed from a sentence.
import { h } from '../dom.js';
import { displayName } from '../names.js';
import { crowdedFight } from './model.js';

const pic = (src, alt = '') => h('img', { src, alt, draggable: 'false' });
const FLED = { ran: 'ran', flew: 'flew', mist: 'as mist', teleported: 'carried off', peace: 'at peace', quiet: 'out' };

/** What each step of a fight is called to a player: the rulebook's own words (8.3: the Meeting, Luring, Charging, the Encounter step, the Melee step, then the harm). */
export const STEP_NAME = { 'combat-drinks': 'Meeting', 'combat-pay': 'Meeting', 'combat-choice': 'Meeting', 'combat-lure': 'Lure', 'combat-charge': 'Charge', 'combat-deploy': 'Deployment', 'combat-encounter': 'Encounter', 'combat-melee': 'Melee', 'combat-shift': 'Melee', 'combat-wounds': 'Wounds', 'combat-fatigue': 'Fatigue', 'combat-over': 'The fight is over' };

/** The word under a character's tile: where he is in this step. `asked`: the engine is waiting for him now. */
function roleOf(b, id, m, asked, sheetN) {
    if (m.state === 'out') return { key: 'out', word: m.why === 'died' ? 'fallen' : FLED[m.why] ?? 'out' };
    if (asked) return { key: 'now', word: 'NOW' };
    switch (b.step) {
        case 'lure': return m.lure === 'done' ? { key: 'done', word: sheetN ? 'lured' : 'none lured' } : { key: 'wait', word: 'next' };
        case 'charge': return m.charge === 'done' ? { key: 'done', word: 'chose' } : { key: 'wait', word: 'next' };
        case 'encounter': return m.enc === 'done' ? { key: 'done', word: 'acted' } : { key: 'wait', word: 'next' };
        case 'melee': return m.ready ? { key: 'done', word: 'played' } : { key: 'wait', word: 'choosing' };
        case 'harm': return m.done ? { key: 'done', word: 'settled' } : { key: 'wait', word: 'next' };
        default: return { key: 'wait', word: 'waits' };
    }
}

/** The party of a fight on one phone, or null (alone, a table, or character against character, where the table's strip already says who is who).
 * { actor: id, members: [{ id, name, pic, hidden, sight, key: 'now' | 'wait' | 'done' | 'out', word }] } */
export function partyOf(fm, data) {
    const b = fm.battle;
    if (!b?.order || b.pvp || !crowdedFight(fm)) return null;
    const asked = new Set((fm.asks ?? []).map(a => a.who)), art = data.art?.characters ?? {};
    const members = b.order.map(id => {
        const m = b.members[id] ?? { state: 'out', why: null }, c = fm.chars?.[id] ?? {}, mine = (b.dens ?? []).filter(d => d.sheet === id && !d.dead && d.kind !== 'part' && d.kind !== 'horse').length;
        const role = roleOf(b, id, m, id === fm.actor && asked.has(id), mine);
        return { id, name: displayName(c.name ?? id), pic: art[id] ? art[id].replace(/\.gif$/, '.png') : null, hidden: !!c.hidden, sight: c.dead ? 'fallen' : c.mist ? 'mist' : c.hidden ? 'hidden' : 'in plain sight', ...role };
    });
    return { actor: fm.actor, members, me: members.find(x => x.id === fm.actor) ?? null };
}

/** A hex face (the look of the party step: `.pt-face` in ds-front.css), at a given width. */
export const hexFace = (m, w) => h('span', { class: 'cb-hexface', style: `--hw:${w}px` }, h('span', { class: 'pt-face' }, m.pic ? pic(m.pic) : h('i', {}, (m.name ?? '?')[0])));

/** The banner on top of the decision sheet: whose question this is, his sight, and the step in the game's word. */
export function actorBanner(party, { round = null, step }) {
    const m = party.me;
    if (!m) return null;
    return h('div', { class: `cb-actor${m.hidden ? ' hid' : ''}`, role: 'status', 'aria-live': 'polite', 'data-actor': m.id, 'aria-label': `${m.name}, ${m.sight}. ${step ? `${round != null ? `Round ${round}, ` : ''}${step}.` : ''} It is ${m.name}'s turn.` },
        hexFace(m, 44),
        h('span', { class: 'who' }, h('b', {}, m.name), h('small', { class: `sight${m.hidden ? ' hid' : ''}`, 'data-sight': m.hidden ? 'hidden' : 'seen' }, m.sight)),
        h('span', { class: 'step' }, round != null ? h('small', {}, `Round ${round}`) : null, step ? h('b', {}, step) : null));
}

/** The party on the stage: every character as a tile of the same size. The one who is asked is lit and carries NOW, the others are quiet and say a word (next, lured, played, out ...). A tile of the one who is
 * not asked is a `.cb-other` so the threads from creatures set on him end on it. */
export function partyRowEl(party, { size = 52, lead = null, tail = null } = {}) {
    return h('div', { class: `cb-party${lead || tail ? ' ends' : ''}`, role: 'group', style: `--pt:${size}px`, 'aria-label': `The party: ${party.members.map(m => `${m.name}, ${m.sight}, ${m.word}`).join('; ')}` },
        lead, ...party.members.map(m => h('div', { class: `cb-ptile ${m.key}${m.id === party.actor ? ' me' : ' cb-other'}${m.hidden ? ' hid' : ''}`, 'data-ptile': m.id, 'data-other': m.id === party.actor ? null : m.id, 'data-role': m.key },
            h('div', { class: 'tagslot' }, h('span', { class: `tag ${m.key === 'now' ? '' : 'ghost'}`, 'data-role-word': '' }, m.word)),
            h('span', { class: 'hex' }, hexFace(m, size)),
            h('span', { class: 'cap' }, h('b', {}, m.name), h('small', {}, m.sight)))), tail);
}
