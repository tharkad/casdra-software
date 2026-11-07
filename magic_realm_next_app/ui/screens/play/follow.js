// play/follow.js: Follow (7.11) once it is recorded, told on the screen of the one who follows and in the Journal.
//   followerCard(G)   the tray of a character who recorded Follow (Birdsong: "he will follow X") or is following now (Daylight: "he follows X"), with the way to X's turn and "Stop following"
//   followNotes(G)    the Journal's lines: who follows whom today (public once Sunrise has set it), and in a hot seat what was recorded at Birdsong (the plan is not secret from one player)
// Names are the characters' own in a hot seat (one player runs them all) and the players' at a table: meet.js `playerOf`.
import { h } from '../../dom.js';
import { btn, primary } from '../../ds.js';
import { icon } from '../../icons.js';
import { voiced } from '../../commit.js';
import { followsToday, playerOf } from '../../meet.js';
import { isStory } from '../../voice.js';
import { act } from './actions.js';
import { switchTo } from './hotseat.js';
import { tableModel } from '../../combat/feed.js';

const who = (G, id) => playerOf(tableModel(G.st, G.data), id);

/** The guide this character follows now (Daylight, stage `following`), or the one he has recorded (Birdsong): { id, now } or null. */
export function guideOfActor(G) {
    const tm = tableModel(G.st, G.data), me0 = tm.ch, me = tm.chars[me0.id] ?? me0;
    if (!me0.id || (tm.order?.length ?? 0) < 2) return null;
    if (me.today?.stage === 'following' && tm.follows?.[me.id]) return { id: tm.follows[me.id], now: true };
    const slot = Array.isArray(me.today?.plan) ? me.today.plan[0] : null;
    if (tm.period === 'birdsong' && slot?.act === 'follow' && slot.who && tm.chars[slot.who]) return { id: slot.who, now: false };
    return null;
}

/** { body, lead, primary } for the tray of a character who follows (hot seat: nothing is asked of him), or null. */
export function followerCard(G) {
    const tm = tableModel(G.st, G.data), g = guideOfActor(G);
    if (!g) return null;
    const me = tm.ch.name, gn = who(G, g.id), card = g.now
        ? voiced({ story: `${me} follows ${gn} today. ${me} goes where ${gn} goes and plays no turn of their own: to go on, play ${gn}’s turn.`,
            detail: `${me} follows ${gn} (7.11): ${me}’s turn is ${gn}’s, and their own chit is not drawn. ${me} may stop following at the start of any of ${gn}’s activities (7.11.5); their turn then ends where they stand.` })
        : voiced({ story: `${me} has recorded to follow ${gn}. The day begins when everyone has planned, and their turn will be ${gn}’s.`,
            detail: `Plan recorded: Follow ${gn} (7.11.2). At Sunrise ${me} goes with ${gn} and their own chit is not drawn, unless ${gn} is gone or they follow each other.` });
    const body = [h('div', { class: 'ds-ask', 'data-hint': g.now ? 'following' : 'follow-recorded' }, h('b', {}, g.now ? `${me} follows ${gn}` : `${me} will follow ${gn}`), card)];
    if (!g.now) return { body, lead: null, primary: primary(`To ${gn}`, { 'data-act': 'to-guide', onclick: () => switchTo(G, g.id) }) };
    return { body,
        lead: btn(`Stop following ${gn}`, 'sm', { 'data-act': 'stop-follow', onclick: () => act(G, { type: 'meet', kind: 'stop-follow', who: tm.ch.id }) }),
        primary: primary(`To ${gn}`, { 'data-act': 'to-guide', onclick: () => switchTo(G, g.id) }) };
}

/** Journal notes: "X follows Y today." for each pair Sunrise made; before Sunrise, in a hot seat, "X has recorded to follow Y." */
export function followNotes(G) {
    const tm = tableModel(G.st, G.data), out = [];
    for (const f of followsToday(tm)) out.push(h('span', { class: 'ds-note', 'data-act': 'follows', 'data-follower': f.follower }, icon('right'), isStory() ? `${f.text} today.` : `${f.text} (7.11): their turn is ${who(G, f.guide)}’s.`));
    if (!G.shared && tm.period === 'birdsong') {
        for (const id of tm.order) {
            const s = tm.chars[id].today?.plan?.[0];
            if (s?.act === 'follow' && s.who && tm.chars[s.who]) out.push(h('span', { class: 'ds-note', 'data-act': 'follows', 'data-follower': id }, icon('right'), `${who(G, id)} has recorded to follow ${who(G, s.who)}.`));
        }
    }
    return out;
}
