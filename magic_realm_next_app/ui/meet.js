// CHARACTERS MEETING, as a phone reads it (docs/design/multiplayer-meetui.md): with whom may I give or trade right now and what may I name, what an offer says and what happens if it is
// accepted, the plain words for a standing policy, whom I may follow, and the lines the game wrote for ME about a meeting (so a result card can tell them first).
// Pure functions of a redacted view (server/redact.mjs) and the engine's own meetOptions; no DOM, so tests/meet_ui.test.mjs runs them in node against the real engine and the real redaction.
// Nothing here reads another seat's secret: it uses what a seat is sent (positions, hidden flags, open gear, the public day) and the viewer's own record and lines.
import { meetOptions, tradeError, policyOf, followersOf, isBlocked, turnHolder } from '../engine/meet.js';
import { nameOf, summaryOf } from '../engine/items.js';
import { nameOfClearing } from '../engine/world.js';

export const joinList = list => (list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
const here = c => !!c?.at && !c.onRoad && !c.flying;
const CARDS = new Set(['treasure', 'spell']);
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));

/** The player's name for a character id (the table talks about players), and "Ann's Captain" when both help. */
// (a hot seat: one player runs every character, so "You" would name them all alike: they are told by their own names)
export const playerOf = (view, id) => (view.players?.length === 1 && (view.order?.length ?? 0) > 1 ? null : view.players?.find(p => p.id === view.chars?.[id]?.owner)?.name) ?? view.chars?.[id]?.name ?? id;
export const charName = (view, id) => view.chars?.[id]?.name ?? id;
/** Character name to player name. FALLBACK ONLY: a log line of the table carries `p`, the same sentence told with the players' names (docs/design/multiplayer-harden.md section 4), and is read from that. The lines written
 * for one seat alone ("You give White Knight: ...", "You block Captain.") have no `p` yet, so their character names are still translated here; asking the engine for a `p` on those too would end it (multiplayer-harden-ui.md). */
export function nameMap(view) { const m = new Map(); for (const id of view.order ?? []) m.set(view.chars[id].name, playerOf(view, id)); return m; }

/** The engine's sentences carry rule numbers for the audit; a player reads them without. */
export const plainWhy = s => {
    const t = String(s ?? '').replace(/ ?\((?:BOOK\? )?(?:R-)?\d[\w.,\s-]*\)/g, '').replace(/ ?\(R-\d+\)/g, '').replace(/\s+/g, ' ').trim();
    return t ? `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}` : '';
};

// ------------------------------------------------------------------------------------------------------------------------------- who can I meet, and what may I name
const askableOf = (data, c) => (c.items ?? []).filter(i => !i.hidden && !i.destroyed && (!CARDS.has(i.kind) || i.active))
    .map(it => ({ uid: it.uid, kind: it.kind, id: it.id, name: nameOf(data, it), sub: summaryOf(data, it), active: !!it.active, damaged: !!it.damaged }));

/** The state of my meetings. `window`: 'phase' (the start of a phase of someone's turn), 'dayend' (the trade window after the fights) or null. `certain` is false when the view cannot tell whether the
 * turn-holder is exactly at the start of a phase (another seat's question is private): the offer is then allowed and the game says if the moment is wrong.
 * { window, certain, partners:[{ id, player, character, hidden, askable }], others:[{ id, player, character, why }], reason, give, followable, policy, made, received, holder } */
export function meetState(view, data, myId, table = null) {
    const me = view?.chars?.[myId];
    const known = !!table && 'meetWindow' in table;          // the server says whether a meeting is possible now (answer.table.meetWindow): 'phase', 'dayend' or null
    const out = { window: null, certain: false, partners: [], others: [], reason: null, give: { items: [], gold: 0, discoveries: [] }, followable: [], followWhy: [], policy: policyOf(me), made: null, received: null, holder: null };
    if (!me || !view.order || view.order.length < 2) return out;
    let o = null;
    try { o = meetOptions(view, data, myId); } catch { o = null; }
    if (o) { out.give = o.give; out.followable = o.followable; out.followWhy = o.followWhy ?? []; out.policy = o.policy; }
    const offers = view.offers ?? [];
    out.made = offers.find(x => x.from === myId) ?? null;
    out.received = offers.find(x => x.to === myId) ?? null;
    const hereIds = view.order.filter(id => id !== myId && !view.chars[id].dead && here(view.chars[id]) && here(me) && view.chars[id].at === me.at);
    const row = (id, extra) => ({ id, player: playerOf(view, id), character: charName(view, id), hidden: !!view.chars[id].hidden, ...extra });
    if (o?.partners?.length) {
        out.window = o.window; out.certain = true;
        out.partners = o.partners.map(p => row(p.id, { askable: p.askable }));
    } else if (hereIds.length && !view.tradeWindow && (!known || table.meetWindow === 'phase')) {
        // The turn-holder is at a phase start, or not: only he knows. With the server's word (`table.meetWindow`) it is certain; without it, if the day is open for a turn at all, the offer may be tried.
        const holder = known ? table.meetActor : turnHolder(view), group = known ? (table.meetGroup ?? [holder]) : holder ? [holder, ...followersOf(view, holder)] : [];
        if (holder && !view.blockCheck && !view.followCheck) {
            for (const id of hereIds) {
                const ok = (group.includes(myId) || group.includes(id)) && !isBlocked(me) && !isBlocked(view.chars[id]) && !offers.some(x => x.to === id || x.to === myId && x.from !== id);
                if (ok && !me.mist) out.partners.push(row(id, { askable: askableOf(data, view.chars[id]) }));
            }
            if (out.partners.length) { out.window = 'phase'; out.certain = known; }
        }
    }
    out.holder = known && table.meetActor ? table.meetActor : turnHolder(view);
    const partnerIds = new Set(out.partners.map(p => p.id));
    const group = out.holder ? [out.holder, ...followersOf(view, out.holder)] : [], hp = out.holder ? playerOf(view, out.holder) : null;
    for (const id of hereIds) if (!partnerIds.has(id)) {
        let why = null; try { why = tradeError(view, myId, id); } catch { why = null; }
        why = plainWhy(why);
        // the turn-holder's own question is private to him: from another seat the reason is read from the public day instead
        if (known && !table.meetWindow && !view.tradeWindow) why = 'A trade is started at the start of a phase of someone\u2019s turn, or after the fights, before Midnight.';
        else if (!view.tradeWindow && out.holder && !view.blockCheck && !view.followCheck) {
            if (!group.includes(myId) && !group.includes(id)) why = `Only ${hp} and those who follow ${hp} can trade now. The others can trade with ${hp}, not with each other.`;
            else if (isBlocked(me) || isBlocked(view.chars[id])) why = `${isBlocked(me) ? 'You were' : `${playerOf(view, id)} was`} blocked today: a blocked character cannot trade with those about to start phases.`;
        }
        out.others.push(row(id, { why: why || 'not now' }));
    }
    if (!out.partners.length) out.reason = hereIds.length ? (out.others[0]?.why ?? null) : 'Nobody else is in your clearing.';
    return out;
}

/** Whether to show a "Meet" button, and what it says. */
export function meetButton(state, view, myId) {
    if (!state.partners.length) return null;
    if (state.made) return { label: 'Your offer', waiting: true };
    const names = joinList(state.partners.map(p => p.player));
    return { label: state.partners.length === 1 ? `Meet ${state.partners[0].player}` : 'Meet', names, window: state.window, certain: state.certain };
}

// ------------------------------------------------------------------------------------------------------------------------------- what an offer says
const goldWord = n => `${n} gold`;
const TITLES = { path: 'path', site: 'site', sitecard: 'site card' };

/** One side of an offer (the engine's `viewSide`: items with names, gold, discoveries with labels) as a list of short phrases. */
export function sideParts(side) {
    const parts = [];
    for (const it of side?.items ?? []) parts.push(`the ${it.name}${it.damaged ? ' (damaged)' : ''}`);
    if (side?.gold) parts.push(goldWord(side.gold));
    for (const d of side?.discoveries ?? []) parts.push(d.label ?? `a ${TITLES[d.kind] ?? 'discovery'}`);
    return parts;
}
export const sideLine = side => { const p = sideParts(side); return p.length ? joinList(p) : 'nothing'; };
export const sideEmpty = side => !sideParts(side).length;

/** What the recipient of a `meet-offer` question reads: the deal in plain words, what accepting does, and whether he can accept at all (he must have what is asked of him). */
export function offerReading(view, q) {
    const me = view.ch;
    const from = q.from, player = playerOf(view, from);
    const wantItems = q.want?.items ?? [], missing = wantItems.filter(w => !me.items.some(i => i.uid === w.uid && !i.destroyed));
    const short = (q.want?.gold ?? 0) > me.gold ? q.want.gold - me.gold : 0;
    const gift = sideEmpty(q.want), ask = sideEmpty(q.give);
    const lacks = missing.length ? `You no longer have the ${missing[0].name}.` : short ? `You are ${short} gold short.` : null;
    let outcome;
    if (gift) outcome = `If you accept, ${player} gives you ${sideLine(q.give)} and asks nothing back.`;
    else if (ask) outcome = `If you accept, you hand ${player} ${sideLine(q.want)} and get nothing back.`;
    else outcome = `If you accept, you take ${sideLine(q.give)} and hand over ${sideLine(q.want)}.`;
    const title = gift ? `${player} offers you a gift.` : ask ? `${player} asks you for something.` : `${player} offers you a trade.`;
    const bar = gift ? `Take ${sideLine(q.give)} from ${player}.` : ask ? `Hand ${player} ${sideLine(q.want)}.` : `Take ${sideLine(q.give)}, hand over ${sideLine(q.want)}.`;
    return { player, gift, ask, lacks, title, outcome, bar, why: q.window === 'dayend' ? 'The fighting is over and you may trade before Midnight. It is done at once, whole or not at all.' : 'It is done at once, whole or not at all, and cannot be taken back.' };
}

/** What the proposer says about his own open offer ("Waiting for Ann": what he put on the table). Items are named from the two records that are open to him. */
export function madeReading(view, data, o) {
    const me = view.ch, other = view.chars[o.to];
    const nm = (c, uid) => { const it = c?.items?.find(i => i.uid === uid); return it && !it.hidden ? nameOf(data, it) : 'something'; };
    const side = (c, s) => ({ items: (s.items ?? []).map(u => ({ name: nm(c, u) })), gold: s.gold ?? 0, discoveries: (s.discoveries ?? []).map(d => ({ label: d.label ?? (d.kind === 'path' ? 'a hidden path' : d.kind === 'site' ? 'a site' : 'a site card') })) });
    const give = side(me, o.give), want = side(other, o.want), player = playerOf(view, o.to);
    const line = sideEmpty(want) ? `a gift of ${sideLine(give)}` : sideEmpty(give) ? `a request for ${sideLine(want)}` : `${sideLine(give)} for ${sideLine(want)}`;
    return { player, give, want, line };
}

/** What the draft being built in the Meet sheet comes to, in one sentence (the action bar), and whether it can be sent. */
export function draftReading(player, give, want) {
    const g = sideParts(give), w = sideParts(want);
    if (!g.length && !w.length) return { ok: false, text: `Tick what you give ${player}, or what you want from ${player}.` };
    if (g.length && !w.length) return { ok: true, text: `Give ${player} ${joinList(g)}. Ask nothing back.` };
    if (!g.length) return { ok: true, text: `Ask ${player} for ${joinList(w)}. Give nothing.` };
    return { ok: true, text: `Offer ${player} ${joinList(g)} for ${joinList(w)}.` };
}

// ------------------------------------------------------------------------------------------------------------------------------- standing policies, in plain words
export const BLOCK_WORDS = {
    never: { label: 'Never', says: 'You let everyone pass. Nobody asks you anything.' },
    ask: { label: 'Ask me', says: 'When someone ends a phase in your clearing you are asked, once for each of them each day.' },
    always: { label: 'Always', says: 'You block everyone who ends a phase in your clearing, without asking.' },
};
export const BLOCK_COST = 'A block ends their turn: they lose their remaining phases and both of you are seen. If your own turn has not come yet you lose it too. A hidden character can be blocked only by someone who has found hidden enemies today.';
export const FOLLOW_WORDS = {
    stay: { label: 'Stay', says: 'When you follow someone you go the whole way. You can still stop yourself at the start of any of their activities.' },
    ask: { label: 'Ask me', says: 'When you follow someone you are asked before each of their activities whether to stop.' },
};
export const DAYEND_SAYS = 'After the day’s fights, before Midnight, those who stand together may trade. If you leave this off nobody waits for you.';

// ------------------------------------------------------------------------------------------------------------------------------- following
export const FOLLOW_EXPLAIN = [
    'You copy their whole turn: you record nothing else today, and your own chit is not drawn.',
    'At the start of each of their activities you can drop out; your turn then ends where you stand.',
    'You are called out together: the chits of the place you reach are turned once for both of you.',
];

/** The pair of a follow, in words: "Mike" for a guide the viewer sees as a player; and who follows whom today, from the public `follows`. */
export function followsToday(view) {
    const f = view.follows ?? {};
    return Object.entries(f).map(([follower, guide]) => ({ follower, guide, text: `${playerOf(view, follower)} follows ${playerOf(view, guide)}` }));
}

/** Why a character cannot be followed now, in both voices (the engine's `followWhy` row says which reason; the Detail voice cites the rule). Story says what it would take. */
export function followReason(r) {
    const n = r.name;
    switch (r.code) {
        case 'apart': return { story: `${n} is not in your clearing: ${n} is at ${r.at}. Move there first (on an earlier day), or start together.`,
            detail: `${n} is not in your clearing (${n}: ${r.at}; you: ${r.from}). A follower stands in his guide’s clearing at Birdsong (7.11.3). Move there on an earlier day, or choose Start together in the party step of a new game.` };
        case 'circle': return { story: `${n} has already recorded to follow you, so you cannot follow back: you would both stay home.`,
            detail: `${n} has already recorded Follow with you as his guide. Two who follow each other make a circle: it cancels, and neither has a turn (7.11).` };
        case 'dead': return { story: r.why[0].toUpperCase() + r.why.slice(1) + '.', detail: `${r.why[0].toUpperCase() + r.why.slice(1)}: a dead character cannot be followed or follow (7.11.3).` };
        case 'time': return { story: 'Follow is chosen at Birdsong, while you plan your day.', detail: 'Follow is recorded in the plan at Birdsong, with the guide in your clearing (7.11.2, 7.11.3).' };
        case 'you-away': return { story: `${r.why[0].toUpperCase() + r.why.slice(1)}.`, detail: `${r.why[0].toUpperCase() + r.why.slice(1)}: a follower and his guide both stand in a clearing at Birdsong (7.11.3).` };
        case 'him-away': return { story: `${r.why[0].toUpperCase() + r.why.slice(1)}.`, detail: `${r.why[0].toUpperCase() + r.why.slice(1)}: a guide stands in the follower’s clearing at Birdsong (7.11.3).` };
        default: return { story: `${r.why ?? 'Not now'}.`, detail: `${r.why ?? 'Not now'}.` };
    }
}
export const FOLLOW_FIRST = { story: 'Follow takes your whole day, so it is chosen in phase 1.', detail: 'Follow is recorded in the first phase and is the only activity of the day (7.11.2).' };
export const guideOf = (view, id) => view.follows?.[id] ?? null;
export const followersNamed = (view, id) => followersOf(view, id).map(f => playerOf(view, f));

// ------------------------------------------------------------------------------------------------------------------------------- the lines the game wrote for me about a meeting
const GIVE_ME = /^You give (.+?): (.+); you receive: (.+)\.$/;
const GAVE_ME = /^(.+?) gives you: (.+); you give: (.+)\.$/;
const TURNED = /^You turn down (.+?)'s offer\.$/;
const TURNED_ME = /^(.+?) turns down your offer\.$/;
const WITHDREW = /^You withdraw your offer to (.+?)\.$/;
const WITHDREW_ME = /^(.+?) withdraws the offer he made you\.$/;
const LAPSE_TO = /^(.+?)'s offer lapses: (.+)\.$/;
const LAPSE_FROM = /^Your offer to (.+?) lapses: (.+)\.$/;
const SAW = /^You saw (.+?) (use|loot|search|sell) (.+): you know of it now\.$/;
const BLOCKED_ME = /^(.+?) blocks? you! The rest of your turn is lost\.$/;
const BLOCKS = /^(.+?) blocks (.+?)\.$/;
const STOPS = /^(.+?) stops following (.+?)(?: \((.+)\))?: his turn ends here\.$/;
const ENDS_WITH = /^(.+?)'s turn ends with (.+?)'s\.$/;
const FOLLOWS = /^(.+?) follows (.+?)\.$/;
// ... the same lines as the table tells them with the players' names (`p`)
const P_BLOCKED_ME = /^(.+?) blocks? (.+?)! /;
const P_STOPS = /^(.+?) stops following (.+?)(?: \((.+)\))?: the turn ends here\.$/;
const P_ENDS_WITH = /^(.+?)'s turn ends with (.+?)'s\.$/;
const list = s => (s === 'nothing' ? [] : String(s).split(/, (?=the |\d+ gold)/));

/** The meeting lines the viewer has, oldest first: [{ i, kind, other, text, story }]. `text` is the engine's own line (the Detail voice); `story` is the same told with the players' names. */
export function meetLines(view, myId) {
    const names = nameMap(view), pn = n => names.get(n) ?? n, out = [];
    const log = view.log ?? [], skipped = view.logSkipped ?? 0;          // (a long game's view is trimmed to its newest lines: `i` counts from the first line ever, `pos` is the place in this view)
    for (let i = 0; i < log.length; i++) {
        const l = log[i], t = l.t ?? '', mine = l.who === myId;
        let m, e = null;
        if (l.k === 'trade' && mine) {
            if ((m = GIVE_ME.exec(t))) e = { kind: 'done', other: pn(m[1]), gave: list(m[2]), got: list(m[3]), story: dealStory(pn(m[1]), list(m[2]), list(m[3])) };
            else if ((m = GAVE_ME.exec(t))) e = { kind: 'done', other: pn(m[1]), gave: list(m[3]), got: list(m[2]), story: dealStory(pn(m[1]), list(m[3]), list(m[2])) };
            else if ((m = TURNED.exec(t))) e = { kind: 'declined', other: pn(m[1]), story: `You turn ${pn(m[1])}’s offer down. Nothing changes hands.` };
            else if ((m = TURNED_ME.exec(t))) e = { kind: 'refused', other: pn(m[1]), story: `${pn(m[1])} turns your offer down. Nothing changes hands.` };
            else if ((m = WITHDREW.exec(t))) e = { kind: 'withdrawn', other: pn(m[1]), story: `You take your offer back from ${pn(m[1])}.` };
            else if ((m = WITHDREW_ME.exec(t))) e = { kind: 'withdrawn', other: pn(m[1]), story: `${pn(m[1])} takes the offer back.` };
            else if ((m = LAPSE_TO.exec(t))) e = { kind: 'lapsed', other: pn(m[1]), story: `${pn(m[1])}’s offer comes to nothing: ${m[2]}.` };
            else if ((m = LAPSE_FROM.exec(t))) e = { kind: 'lapsed', other: pn(m[1]), story: `Your offer to ${pn(m[1])} comes to nothing: ${m[2]}.` };
        } else if (l.k === 'discover' && mine && (m = SAW.exec(t))) {
            e = { kind: 'spied', other: pn(m[1]), story: `You saw ${pn(m[1])} ${m[2] === 'use' ? 'use' : m[2] === 'sell' ? 'sell' : 'work at'} ${m[3]}. You know of it now.` };
        } else if (l.k === 'block' && mine && (m = BLOCKED_ME.exec(t))) {
            const pm = l.p ? P_BLOCKED_ME.exec(l.p) : null;
            const who = (pm ? pm[1] : m[1]).split(/ and /).map(x => (pm ? x : pn(x)));
            e = { kind: 'blocked', other: joinList(who), story: `${joinList(who)} close${who.length === 1 ? 's' : ''} in and block${who.length === 1 ? 's' : ''} you. The rest of your turn is lost.` };
        } else if (l.k === 'block' && mine && (m = BLOCKS.exec(t))) {
            e = { kind: 'blocks', other: pn(m[2]), story: `You block ${pn(m[2])}.` };
        } else if (l.k === 'day' && mine && (m = STOPS.exec(t))) {
            const pm = l.p ? P_STOPS.exec(l.p) : null, g = pm ? pm[2] : pn(m[2]), why = pm ? pm[3] : m[3];
            e = { kind: 'stops', other: g, story: `You stop following ${g}${why === 'left behind' ? ' (left behind)' : why ? ` (${why.replace('by choice', 'you chose to')})` : ''}. Your turn ends where you stand.`.replace(' (you chose to)', '') };
        } else if (l.k === 'day' && mine && (m = ENDS_WITH.exec(t))) {
            const pm = l.p ? P_ENDS_WITH.exec(l.p) : null, g = pm ? pm[2] : pn(m[2]);
            e = { kind: 'ends-with', other: g, story: `Your turn ends with ${g}’s.` };
        }
        if (e) out.push({ i: skipped + i, pos: i, text: t, ...e });
    }
    return out;
}
function dealStory(other, gave, got) {
    const g = joinList(gave), r = joinList(got);
    if (gave.length && got.length) return `You hand ${other} ${g}, and take ${r} in return.`;
    if (gave.length) return `You give ${other} ${g}.`;
    return `${other} hands you ${r}.`;
}

/** A line of the log that a meeting card already tells (so the dock's "last lines" do not say it twice). */
export const isMeetLine = l => {
    const t = l?.t ?? '';
    if (l?.k === 'trade') return GIVE_ME.test(t) || GAVE_ME.test(t) || TURNED.test(t) || TURNED_ME.test(t) || WITHDREW.test(t) || WITHDREW_ME.test(t) || LAPSE_TO.test(t) || LAPSE_FROM.test(t) || /^.+ and .+ trade\.$/.test(t);
    if (l?.k === 'discover') return SAW.test(t);
    if (l?.k === 'block') return BLOCKED_ME.test(t) || BLOCKS.test(t);
    if (l?.k === 'day') return STOPS.test(t) || ENDS_WITH.test(t);
    return false;
};
