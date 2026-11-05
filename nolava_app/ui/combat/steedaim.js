// combat/steedaim.js: the Broomstick's target chooser (aimEl in sheets.js calls it when the spell offers a choice: himself, if he is Light, or one of his Light hirelings in the clearing; engine:
// magic/handlers/broomstick.js aim, steeds.js broomstickHirelings). The spell is cast in the evening; the chit is held until a Fly phase (or a fight to fly away), or by the hireling until his guide flies.
// Same store and payload as every aimed spell: store.aim.broomstick = [ref], sent as spellAim.
import { voiced } from '../commit.js';
import { h } from '../dom.js';
import { broomstickOption } from '../steeds.js';

const sameRef = (x, y) => x.kind === y.kind && String(x.id) === String(y.id);

export function broomstickAim(X, a, store) {
    const { render } = X;
    const sel = store.aim[a.spell] ??= a.options.slice(0, a.min).map(x => x.ref);
    const cur = a.options.find(o => sameRef(o.ref, sel[0])) ?? a.options[0];
    const words = o => broomstickOption(o, X.data);
    return h('div', { class: 'cb-aimwrap cb-aimbroom', 'data-aim': a.spell },
        h('div', { class: 'cb-aim', role: 'radiogroup', 'aria-label': 'Who holds the Fly chit' }, ...a.options.map(o => {
            const on = sameRef(o.ref, cur.ref);
            return h('button', { type: 'button', class: `ds-btn${on ? ' on' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-aim-opt': `${o.ref.kind}:${o.ref.id}`, 'aria-pressed': on ? 'true' : 'false',
                onclick: () => { store.aim[a.spell] = [o.ref]; render(); } }, words(o).short);
        })),
        h('p', { class: 'cb-hint cb-hint-sub', 'data-aim-line': cur.ref.kind }, voiced({ story: words(cur).story, detail: words(cur).detail })));
}
