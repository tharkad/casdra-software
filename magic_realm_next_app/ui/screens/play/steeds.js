// play/steeds.js: the tray while he is in the air on a STEED (7.3.3g): who carries him, what it means, and the one thing he may do about it between two Fly phases: let the steed go (the engine's
// `dismiss`; 7.3.3g.5: when the steed stops following him he and it must land, in the same clearing, by the usual die). Two taps, like every dismissal: the first asks, the second lets it go.
// The engine: steeds.js steedReleased (called by hire.js dismissHire). Payload: { type: 'dismiss', kind: 'monster' | 'native', id }.
import { tileName } from '../../../engine/world.js';
import { voiced } from '../../commit.js';
import { h } from '../../dom.js';
import { actIcon } from '../../icons.js';
import { steedAloft } from '../../steeds.js';
import { act } from './actions.js';
import { render } from './shell.js';

const OPEN = new Set(['phase', 'phase-pick']);          // (the engine lets him dismiss at the start of a phase or while planning; in the air only a phase of the day is open)

// The card for the tray body, or null when he is not on a steed (a Fly chit asks nothing of him).
export function airCard(G) {
    const st = G.st, s = steedAloft(st, G.data);
    if (!s || !st.ch.flying || !OPEN.has(st.pending?.type)) return null;
    const over = tileName(st.ch.flying.tile), asking = G.ui.steedAsk === s.id;
    if (asking) {
        return h('div', { class: 'st-air asking', role: 'alertdialog', 'aria-label': `Let the ${s.name} go?`, 'data-steed-ask': s.id },
            h('div', { class: 'main' }, h('b', {}, `Let the ${s.name} go?`),
                voiced({ story: `It is no longer yours, and you both come down at once, in a clearing of the ${over} that a die picks.`,
                    detail: `When his steed stops following him he and it must land, in the same clearing, by the usual die (7.3.3g.5, 7.3.3b.1).` })),
            h('div', { class: 'row2' },
                h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'steed-keep', onclick: () => { G.ui.steedAsk = null; render(G); } }, 'Keep it'),
                h('button', { type: 'button', class: 'ds-btn', 'data-act': 'steed-go', onclick: () => { G.ui.steedAsk = null; act(G, { type: 'dismiss', kind: s.monster ? 'monster' : 'native', id: s.id }); } }, `Let it go`)));
    }
    return h('div', { class: 'st-air', 'data-steed': s.id },
        h('span', { class: 'st-ico' }, actIcon('fly', 32)),
        h('div', { class: 'main' }, h('b', {}, `Flying on the ${s.name}`),
            voiced({ story: 'It carries you and all you own, and lands with you.',
                detail: `A ${s.name} (7.3.3g): its flying strength carries him and his belongings in Daylight; it comes down with him.` })),
        h('button', { type: 'button', class: 'ds-btn sm quiet', 'data-act': 'steed-let-go', onclick: () => { G.ui.steedAsk = s.id; render(G); } }, 'Let it go'));
}
