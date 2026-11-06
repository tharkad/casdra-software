// screens/kit/finds.js (note 131): the two rooms of the character sheet between Kit and Company: Discoveries (the hidden paths, sites and site cards he has found) and Curses.
import { nameOfClearing } from '../../../engine/catalogue.js';
import { h } from '../../dom.js';
import { ownSheet, siteChits } from '../../combat/feed.js';
import { roadsFrom } from '../../combat/mapfeed.js';
import { cursesBody } from '../play/sheet_char.js';

const sect = (t, r) => h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, t), r ? h('small', {}, r) : null);
const row = (title, line) => h('div', { class: 'ds-row kit-find' }, h('span', { class: 'main' }, h('b', {}, title), line ? h('span', {}, line) : null));

/** What he has found: [{ kind: 'path'|'site'|'card', title, line }] in the order shown. */
export function findsOf(G) {
    const me = ownSheet(G.st, G.data), out = [];
    for (const key of me.discovered?.paths ?? []) {
        const [a, b] = String(key).replace(':enchanted', '').split('~');
        // note 144: it says what it is, a Secret passage or a Hidden path (the road's own kind), and where it runs
        const kind = roadsFrom(G.st, G.data, a).find(r => r.to === b)?.kind, what = kind === 'secret' ? 'Secret passage' : kind === 'hidden' ? 'Hidden path' : 'Path or passage';
        out.push({ kind: 'path', title: what, line: `${nameOfClearing(a)} to ${nameOfClearing(b)}${String(key).endsWith(':enchanted') ? ', on the enchanted side of the tile' : ''}` });
    }
    const chits = siteChits(G.st, G.data);
    for (const id of me.discovered?.sites ?? []) {
        const c = chits.find(x => x.id === id);
        out.push({ kind: 'site', title: c?.name ?? String(id), line: c ? `In ${nameOfClearing(`${c.tile}${c.num}`)}.` : 'A site you have found.' });
    }
    for (const [at, cards] of Object.entries(me.siteCards ?? {})) for (const cid of cards ?? []) out.push({ kind: 'card', title: G.data.treasures?.[cid]?.name ?? String(cid), line: `A site found by looting, in ${nameOfClearing(at)}.` });
    return out;
}
export const findCount = G => findsOf(G).length;
export const curseCount = G => (ownSheet(G.st, G.data).curses ?? []).length;

export function findsTab(G) {
    const list = findsOf(G), by = k => list.filter(x => x.kind === k);
    const part = (k, t) => (by(k).length ? [sect(t, String(by(k).length)), h('div', { class: 'ds-list' }, by(k).map(x => row(x.title, x.line)))] : []);
    return h('div', { class: 'kit-room kit-finds', 'data-room': 'discoveries' },
        list.length ? null : h('p', { class: 'kit-none' }, 'Nothing found yet. Peering, locating and searching can show hidden paths, passages and sites; what you find is kept here.'),
        ...part('site', 'Sites'), ...part('card', 'Found by looting'), ...part('path', 'Hidden paths and passages'));
}

export function cursesTab(G) {
    return h('div', { class: 'kit-room kit-curses', 'data-room': 'curses' }, cursesBody(G));
}
