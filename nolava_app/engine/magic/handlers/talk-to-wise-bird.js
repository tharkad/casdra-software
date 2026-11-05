import { graph, nameOfClearing } from '../../world.js';
import { peerGain, remotePeer } from '../../search.js';
import { ref } from '../fx.js';
// Talk to Wise Bird (II / Gold / Instant, one character): the target immediately does a remote Peer activity: he names any clearing on the map and uses
// the Peer table to search it (7.5.4, 4.6.8a.2). One Peer-table roll with his usual dice and modifiers (Lucky Charm, Illusion, Bad Luck apply). It ignores
// Fog and Eyemist (a spell, not the Search activity), may name a cave, uses no Search phase and does not unhide him (7.4.4).
// The clearing is named in the Melee step (aim; the clearings that would teach him most are listed first and are the default). DECISION: a Peer "Choice"
// result cannot ask a question in the middle of a combat round, so the result that shows him the most he does not yet know is taken for him.
// search.js remotePeer() does the work. Spec: docs/design/magic/02-day-spells.md section 4.
const ranked = (st, data) => [...graph(st, data).nodes].map(id => ({ id, gain: peerGain(st, data, id) })).sort((a, b) => b.gain - a.gain);
export default {
    id: 'talk-to-wise-bird', dur: 'instant', benevolent: true,
    useful: (st, data) => ranked(st, data)[0]?.gain > 0,
    aim: (st, data) => ranked(st, data).map(c => ({ ref: ref('clearing', c.id), label: `${nameOfClearing(c.id)}${c.gain ? ` (${c.gain} unknown)` : ''}` })),
    start(ctx) {
        const { st, data } = ctx;
        const clearing = ctx.targets.find(t => t.kind === 'clearing')?.id ?? ranked(st, data)[0].id;
        ctx.log(`Talk to Wise Bird: the bird looks over ${nameOfClearing(clearing)} for you.`);
        ctx.log(remotePeer(st, data, clearing));
    },
    ai: { role: 'utility' },
};
