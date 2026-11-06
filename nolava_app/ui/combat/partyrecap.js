// combat/partyrecap.js: the resolution of a fight of a party on one phone (note 137), and the card of one character that the evening of the Day Result reuses (note 138): the characters of the party, each with the
// creatures he brought down (their pictures), what he won (Fame, Notoriety, Gold) and what it cost him (wounds, tired chits, armor, a fall). The facts are partyfacts.js' (one reading for the screen after the
// fight and for the day's evening); this file only draws them. Plain game words: Slain, Fame, Notoriety, Gold, wounded, tired.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { delta, primary, voiceSwitch } from '../ds.js';
import { nameOfClearing } from '../../engine/catalogue.js';
import { foeEl, foeSize } from './stage.js';
import { hexFace } from './party.js';
import { picOf, foesPhrase, cap } from './model.js';
import { hasNews } from './partyfacts.js';
import { guardIfChanged } from '../tapguard.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const sgn = n => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);
const menuBtn = (ui, render) => h('button', { type: 'button', class: 'cb-menu', 'data-act': 'menu', 'aria-label': 'Menu', onclick: () => { ui.sheet = ui.sheet === 'menu' ? null : 'menu'; render(); } }, icon('menu', 'lg'));

/** The picture of a creature that fell: its counter's art, found by the den when the screen holds it, else by its name (the day's log names it only in words). Null when the manifest has none. */
export function killPic(data, name, den = null) {
    try {
        if (den) { const p = picOf({}, data, { kind: den.kind, id: den.id, side: den.side ?? 'light' }); if (p) return p; }
        const art = data.art ?? {}, bare = String(name).replace(/[  ]#?\d+$/, '').trim();
        if (art.monsters?.[bare]) return art.monsters[bare];
        const nat = Object.values(data.natives ?? {}).find(n => n.name === bare || String(n.name).replace(/ #?\d+$/, '') === bare);
        return nat ? art.natives?.[nat.id] ?? null : null;
    } catch { return null; }
}

/** What a character won and what it cost him, as the chips under his name. */
export function chipsOf(m) {
    const gains = [['fame', 'fame'], ['notoriety', 'notor'], ['gold', 'gold']].filter(([k]) => m.gain[k]).map(([k, name]) => delta(name, m.gain[k] > 0 ? sgn(m.gain[k]) : `−${Math.abs(m.gain[k])}`, m.gain[k] < 0));
    const lost = [];
    if (m.fell) lost.push(h('span', { class: 'ds-tag bad' }, 'Fell in the fight'));
    else if (m.fled) lost.push(h('span', { class: 'ds-tag' }, 'Broke away'));
    if (m.wounded) lost.push(h('span', { class: 'ds-tag bad' }, `${plural(m.wounded, 'chit')} wounded`));
    if (m.tired) lost.push(h('span', { class: 'ds-tag' }, `${plural(m.tired, 'chit')} tired`));
    if (m.destroyed) lost.push(h('span', { class: 'ds-tag bad' }, `${plural(m.destroyed, 'piece')} of armor destroyed`));
    else if (m.damaged) lost.push(h('span', { class: 'ds-tag bad' }, 'Armor damaged'));
    for (const p of m.paid) lost.push(h('span', { class: 'ds-tag bad' }, `Paid ${p.amount} ${cap(p.cost)}`));
    return { gains, lost };
}

/** One character's card: his face and name, the creatures he slew (a picture for each), his gains and his losses. `data` gives the pictures; `den(uid)` finds the creature a kill names (or null). */
export function memberCard(m, data, { den = () => null, pic = null, sight = null } = {}) {
    const { gains, lost } = chipsOf(m);
    const by = new Map();
    for (const k of m.kills) by.set(k.name, { name: k.name, n: (by.get(k.name)?.n ?? 0) + 1, uid: by.get(k.name)?.uid ?? k.uid });
    const kills = [...by.values()].map(k => {
        const src = killPic(data, k.name, den(k.uid));
        return h('span', { class: 'pr-kill', 'data-kill': k.name }, h('span', { class: 'pr-ctr' }, src ? h('img', { src, alt: '', draggable: 'false' }) : icon('skull')), h('span', { class: 'pr-kn' }, k.n > 1 ? `${k.name} ×${k.n}` : k.name));
    });
    const face = pic ? hexFace({ pic, name: m.name }, 36) : null;
    return h('div', { class: `pr-card${m.fell ? ' fell' : ''}`, 'data-pr': m.id },
        h('div', { class: 'pr-head' }, face, h('b', {}, m.name), sight ? h('small', {}, sight) : null),
        kills.length ? h('div', { class: 'pr-row' }, h('span', { class: 'pr-k' }, 'Slain'), ...kills) : null,
        gains.length || lost.length ? h('div', { class: 'cb-verdict pr-chips' }, ...gains, ...lost) : null,
        hasNews(m) ? null : h('p', { class: 'pr-none' }, 'Slew nothing, won nothing, took no harm.'));
}

/** The screen after a fight of a party: the creatures that fell on the stage with SLAIN, and a card for EVERY character. `rec` is partybeat.js `ended`. */
export function partyRecapScreen({ rec, data, ui, render, onDone }) {
    const fm = rec.fm, kills = rec.slain.map(s => s.name), art = data.art?.characters ?? {};
    const place = nameOfClearing(rec.at).replace(/ (\d+)$/, ' $1');
    const size = Math.min(104, foeSize(Math.max(1, rec.slain.length)));          // (the cards need the room: the counters stand a little smaller than in the fight)
    const foeEls = rec.slain.filter(s => s.den).map(s => foeEl({ st: fm, data, d: { ...s.den, dead: true }, dead: true, size }));
    const fell = rec.members.filter(m => m.fell);
    const story = fell.length && fell.length === rec.members.length ? 'The fight is over, and none of you walks away.' : kills.length ? `${kills.length === 1 ? `The ${kills[0]} lies` : `${cap(foesPhrase(kills))} lie`} still. The clearing is yours.` : 'The blows stop. Neither side presses on.';
    const detail = 'Combat is over: nothing hostile is left.';
    const denOf = uid => rec.slain.find(s => s.uid === uid)?.den ?? null;
    const cards = rec.members.map(m => memberCard(m, data, { den: denOf, pic: art[m.id] ? art[m.id].replace(/\.gif$/, '.png') : null }));
    const slainTags = kills.length ? h('span', { class: 'ds-tag good' }, `${plural(kills.length, 'foe')} slain`) : null;
    const root = h('section', { class: 'cb ds-screen', 'data-mode': 'beat', 'data-beat': 'party', 'data-party-over': '1' },
        h('div', { class: 'cb-top' }, menuBtn(ui, render), h('div', { class: 'where' }, h('b', { class: 'ds-nb' }, place), h('span', {}, `Evening · ${plural(rec.rounds, 'round')}`))),
        h('div', { class: 'cb-bar' }, h('span'), voiceSwitch()),
        h('div', { class: 'cb-stage' }, h('div', { class: 'cb-stagein' }, h('div', { class: 'cb-foes noslot' }, ...foeEls))),
        h('p', { class: `cb-narr verdict${fell.length === rec.members.length ? ' bad' : ''}`, role: 'status', 'aria-live': 'polite' }, h('span', { 'data-v': 'story' }, story), h('span', { 'data-v': 'detail' }, detail)),
        h('div', { class: 'cb-sheet', 'data-kind': 'partyover' },
            h('div', { class: 'cb-recap' }, h('div', { class: `big${fell.length === rec.members.length ? ' fallen' : ''}` }, kills.length && fell.length < rec.members.length ? 'Victory' : 'The fight is over'), slainTags ? h('div', { class: 'cb-verdict', style: 'margin-top:6px' }, slainTags) : null),
            h('div', { class: 'pr-cards' }, ...cards),
            h('div', { class: 'ds-actions' }, primary('On through the night', { 'data-act': 'party-over', onclick: onDone }))));
    guardIfChanged(ui, 'cbGuard', 'partybeat', root.querySelector('.cb-sheet'), 350);          // (the recap is read before it is dismissed: a double tap on the last answer must not skip it)
    return root;
}
