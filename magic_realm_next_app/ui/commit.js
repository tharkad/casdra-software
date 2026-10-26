// What the screens say about two engine refusals, in both voices (Story: plain and short; Detail: the rule). Nothing here decides a rule: the engine's own
// isWeaponCard (2.3.4d) and extraPhaseCommitment (6.2.4d) say whether, and these functions only word it.
//
//   weaponCardOf(st, data)        the active weapon when it is a weapon card (it has no alerted side), else null
//   alertCardWhy(name)            { story, detail } for "your weapon is a card, so there is nothing to ready"
//   commitmentOf(st, data, it)    { story, detail } when the belonging causes an extra phase he has recorded (it may not be left, sold or handed over), else null
//   committedItems(st, data)      every committed belonging he carries, with its words (the lists that leave them out say so with this)
//   voiced(copy)                  a <span> that shows the Story or the Detail words by the voice switch
//   committedNote(st, data)       the one short line under a list that leaves committed belongings out (sell, pay with, hand over), or null
import { h } from './dom.js';
import { extraPhaseCommitment, isWeaponCard, nameOf } from '../engine/items.js';

export function weaponCardOf(st, data) {
    const w = st.ch?.items?.find(i => i.kind === 'weapon' && i.active && !i.destroyed);
    return w && isWeaponCard(data, w) ? w : null;
}

export const alertCardWhy = name => ({
    story: `Your ${name} is a card: it is always ready.`,
    detail: `Your ${name} is a weapon card, so it has no alerted side and cannot be alerted (2.3.4d).`,
});

export function commitmentOf(st, data, it) {
    let sentence = null;
    try { sentence = extraPhaseCommitment(st, data, it); } catch { sentence = null; }
    if (!sentence) return null;
    return { story: 'You need it for an extra phase you recorded.', detail: sentence };
}

export function committedItems(st, data) {
    return (st.ch?.items ?? []).map(it => ({ it, name: nameOf(data, it), why: commitmentOf(st, data, it) })).filter(x => x.why);
}

export const voiced = (copy, attrs = {}) => h('span', attrs, h('span', { 'data-v': 'story' }, copy.story), h('span', { 'data-v': 'detail' }, copy.detail));

export function committedNote(st, data) {
    const list = committedItems(st, data);
    if (!list.length) return null;
    const names = list.map(x => x.name), nameText = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    return voiced({
        story: `Not listed: the ${nameText}. You need ${list.length > 1 ? 'them' : 'it'} for an extra phase you recorded.`,
        detail: `Not listed: the ${nameText}. ${list.length > 1 ? 'They give' : 'It gives'} you an extra phase you have recorded, so you cannot abandon, sell or hand ${list.length > 1 ? 'them' : 'it'} over until that phase is finished (6.2.4d).`,
    }, { class: 'ds-why kit-committed', 'data-committed': names.length });
}
