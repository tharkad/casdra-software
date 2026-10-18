// The screens of a SHARED fight (docs/design/multiplayer-cui.md): one fight in a clearing with several characters. Only for a shared game; the one-character fight (solo, race) is combatui.js
// alone and never comes through here.
//   frame        who is in the fight and what each is doing; whose sheet each creature is on (yours first); one line saying who is acting now
//   lure         8.3.4: which creatures to draw onto your own sheet, with what it means; "Lure none" is the default and the button on the right
//   step screens the Meeting, Encounter, secret plays and wounds/fatigue are combatui.js's own screens, shown with only YOUR sheet and what you may know
//   waiting      "Sealed. Waiting for Ann." with your sealed play, or who is acting and why you wait; a character who has left the fight watches the rest
//   reveal       the plays of everyone side by side, result first, in the story voice with a Detail view
//   over         the card that ends a fight: each character's own gains, who fell, who ran
import { h } from '../dom.js';
import { ask } from '../ask.js';
import { isStory, voiceChip } from '../voice.js';
import { monsterCounter } from '../counter.js';
import { roundSynopsis } from '../../engine/story.js';
import { denSide } from '../../engine/combat.js';
import { nameOfClearing } from '../../engine/world.js';
import { counterIcon } from '../shared_ui.js';
import { fightLines, fightOf, nowLine, chargeNews, STEP_WORDS, roundReport, playsOf, playsFromLines, headline, third, factsOf, whyNotLurable, fightSummary, joinList, DIRS, MNV, chitText } from '../fight.js';
import { combatSheet } from './combatui.js';
import { chargeBody, deathCallout, pvpChips, pvpHow } from './pvpui.js';
import { pvpRound, pvpHeadline, allKills, targetName } from '../pvp.js';

const nb = s => String(s).replace(/ (?=\d)/g, ' ');
const WORD = { N: 'Negligible', L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };

/** The reveal that has not been looked at yet, or null: the table's `battle.reveal` of a round the player has not dismissed. */
export const revealKey = (st, f) => (st.battle?.reveal ? `${st.day}|${f.at}|${st.battle.reveal.round}` : null);

// ---- the frame: who, what, whose ----
function strip(f) {
    return h('div', { class: `sf-strip n${f.members.length}`, role: 'list', 'aria-label': 'In the fight', 'data-sf-strip': '' }, ...f.members.map(m => {
        const p = m.person;
        return h('div', { class: `sf-who ${m.status}${m.mine ? ' me' : ''}`, role: 'listitem', 'data-who': m.id, 'data-fstatus': m.status, 'aria-label': `${m.player}${m.mine ? ' (you)' : ''}, ${m.character}: ${m.word}` },
            p ? counterIcon(p, 26) : null,
            h('span', { class: 'sf-wtxt' }, h('b', {}, m.player), h('small', {}, p?.away && m.status === 'deciding' ? 'away' : m.word)));
    }));
}
const pill = (d, extra = '') => h('span', { class: `sf-den ${d.kind === 'nat' ? 'nat' : 'mon'}${d.standingBy ? ' by' : ''}${extra}`, 'data-den': d.uid }, d.name);
function sheetsBlock(f) {
    const rows = [];
    for (const s of f.sheets) {
        const m = s.owner, any = s.dens.length || s.hires.length;
        if (m.state !== 'in' && !any) continue;
        if (!m.mine && !any) continue;
        rows.push(h('div', { class: `sf-sheet${m.mine ? ' mine' : ''}`, 'data-sheet': m.id },
            h('span', { class: 'sf-owner' }, m.mine ? 'Your sheet' : `${m.player}’s sheet`),
            h('span', { class: 'sf-dens' }, ...(any ? [...s.dens.map(d => pill(d)), ...s.hires.map(x => h('span', { class: 'sf-den hire' }, x.at ? `${x.name} (hired, sent at ${(q => (q?.mine ? 'you' : q?.player ?? 'a character'))(f.members.find(q => q.id === x.at))})` : `${x.name} (hired)`))] : [h('em', {}, f.step === 'meet' || f.step === 'lure' ? 'not dealt yet' : 'nothing')]))));
    }
    if (f.loose.length) rows.push(h('div', { class: 'sf-sheet loose', 'data-sheet': 'loose' }, h('span', { class: 'sf-owner' }, 'Not yet dealt'), h('span', { class: 'sf-dens' }, ...f.loose.map(d => pill(d)))));
    if (f.held.length) rows.push(h('div', { class: 'sf-sheet', 'data-sheet': 'held' }, h('span', { class: 'sf-owner' }, 'Fighting a hireling'), h('span', { class: 'sf-dens' }, ...f.held.map(d => pill(d)))));
    if (f.standingBy.length) rows.push(h('div', { class: 'sf-sheet', 'data-sheet': 'by' }, h('span', { class: 'sf-owner' }, 'Standing by'), h('span', { class: 'sf-dens' }, ...f.standingBy.map(d => pill(d)))));
    return h('div', { class: 'sf-sheets', 'aria-label': 'Whose sheet each creature is on', 'data-sf-sheets': '' }, ...rows);
}
export function frame(f, { quiet = false, now: showNow = true } = {}) {
    const now = nowLine(f);
    // when I am the one deciding the screen below says so itself, so the line that says who is acting is left out
    const mineNow = f.me?.status === 'deciding';
    const hid = !quiet && f.me?.hidden && f.me.state === 'in';
    return h('div', { class: 'sf-frame', 'data-sf-frame': '' }, strip(f), hid ? h('p', { class: 'sf-warn', 'data-sf-hidden': '' }, 'You are hidden: the fight is not yours unless you strike.') : null, sheetsBlock(quiet ? { ...f, loose: [] } : f),
        mineNow || !showNow ? null : h('p', { class: 'sf-now', role: 'status', 'data-sf-now': '' }, h('b', {}, now.title), ' ', now.text));
}
function header(f, peek) {
    return h('div', { class: 'cb-head sf-head' },
        h('div', { class: 'cb-title' }, h('b', { class: 'cb-place' }, nameOfClearing(f.at).replace(/ (\d+)$/, ' $1')), h('em', { class: 'cb-round' }, `Round ${f.round}`)),
        h('span', { class: 'cb-peek' },
            peek ? h('button', { class: 'peekbtn', 'data-act': 'peek-gear', onclick: peek.gear }, 'Belongings') : null,
            peek ? h('button', { class: 'peekbtn', 'data-act': 'peek-map', onclick: peek.map }, 'Map') : null));
}

// ---- the lure (8.3.4) ----
function denPicture(data, d) {
    const a = data.art;
    if (d.kind === 'mon') { const nm = data.monsters[d.id]?.name; return a?.monstersColor?.[nm] ?? a?.monsters?.[nm] ?? null; }
    return a?.natives?.[d.id] ?? null;
}
function lureBody({ st, data, p, ui, render, act, f }) {
    const sel = ui.lureSel ??= [];
    for (let i = sel.length - 1; i >= 0; i--) if (!p.lurable.some(o => o.uid === sel[i])) sel.splice(i, 1);
    const dens = st.battle?.dens ?? st.combat?.dens ?? [];
    const hidden = !!st.ch.hidden, byId = Object.fromEntries(f.members.map(m => [m.id, m]));
    const mineNow = f.sheets.find(s => s.owner.mine)?.dens ?? [];
    const rows = p.lurable.map(o => {
        const d = dens.find(x => x.uid === o.uid) ?? { uid: o.uid, kind: 'mon', id: '', side: 'light' };
        let s = null; try { s = denSide(st, data, d); } catch { /* a name only */ }
        const on = sel.includes(o.uid), from = o.from ? byId[o.from] : null;
        const meaning = [from ? `On ${from.player}’s sheet: draw it away and it comes for you, not ${from.player}.` : null, d.kind === 'nat' ? 'A native: its whole group will fight you.' : null].filter(Boolean).join(' ') || null;
        const counter = s && d.kind === 'mon' ? monsterCounter({ s, side: d.side ?? 'light', picture: denPicture(data, d), flies: !!data.monsters[d.id]?.flies, size: 60 })
            : denPicture(data, d) ? h('img', { class: 'foepic sf-pic', src: denPicture(data, d), alt: '' }) : null;
        const stat = s ? [s.attack === 'none' ? 'no attack' : s.attack === 'spell' ? 'casts' : `hits ${WORD[String(s.harm)[0]] ?? s.harm}${'*'.repeat(s.stars || 0)}`, s.atk != null && s.attack !== 'none' ? `speed ${s.atk}` : null, s.vuln ? `falls to ${WORD[s.vuln] ?? s.vuln}` : null].filter(Boolean).join(' · ') : '';
        return h('button', { class: `sf-lure${on ? ' on' : ''}`, role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'data-lure': o.uid, 'data-from': o.from ?? '',
            onclick: () => { const i = sel.indexOf(o.uid); if (i >= 0) sel.splice(i, 1); else sel.push(o.uid); render(); } },
            counter ?? h('span', { class: 'sf-pic ph' }),
            h('span', { class: 'sf-ltext' }, h('b', {}, o.name), stat ? h('small', {}, stat) : null, meaning ? h('small', { class: 'mean' }, meaning) : null),
            h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, on ? '✓' : '+'));
    });
    // what cannot be drawn, and the plain reason (shown muted, so nothing is offered that the rules forbid)
    const lurableIds = new Set(p.lurable.map(o => o.uid));
    const mineIds = new Set(p.mine ?? []);
    const cannot = [...f.held, ...f.standingBy, ...f.sheets.filter(s => !s.owner.mine).flatMap(s => s.dens).filter(d => !lurableIds.has(d.uid) && !mineIds.has(d.uid))].filter(d => !lurableIds.has(d.uid) && !mineIds.has(d.uid));
    const names = sel.map(u => p.lurable.find(o => o.uid === u)?.name).filter(Boolean);
    const body = [
        ask(`Round ${p.round}: draw any creature onto your sheet?`,
            'One on your sheet attacks you alone, and what it pays is yours. The dice deal out whatever nobody draws.'),
        hidden ? h('p', { class: 'sf-warn', 'data-sf-hidden': '' }, 'You are hidden: the fight is not yours unless you strike. Drawing a creature onto your sheet gives you away.') : null,
        mineNow.length ? h('div', { class: 'sf-mine', 'data-sf-mine': '' }, h('small', {}, 'Already on your sheet'), h('span', { class: 'sf-dens' }, ...mineNow.map(d => pill(d)))) : null,
        h('div', { class: 'sf-lures', role: 'group', 'aria-label': 'Creatures you may draw', 'data-sf-lures': '' }, ...rows),
        cannot.length ? h('p', { class: 'sf-cannot hint', 'data-sf-cannot': '' }, `Not available: ${joinList([...new Set(cannot.map(d => `the ${d.name} (${whyNotLurable(d)})`))])}.`) : null,
    ];
    const none = !sel.length;
    const foot = h('div', { class: 'sf-foot' },
        none ? null : h('button', { class: 'btn', 'data-act': 'lure-none', onclick: () => { ui.lureSel = []; render(); } }, 'Lure none'),
        h('button', { class: 'btn primary big', 'data-act': 'lure-go', 'data-count': String(sel.length), onclick: () => { const dens = sel.slice(); ui.lureSel = null; ui.melee = null; act({ type: 'combat', kind: 'lure', dens }); } },
            none ? 'Lure none' : `Draw ${names.length === 1 ? `the ${names[0]}` : `${names.length} creatures`}${hidden ? ' and be seen' : ''}`));
    return { body, foot };
}

// ---- waiting, and watching ----
function sealedChips(st, data, f) {
    const c = st.combat, pl = c?.play;
    if (!pl) return null;
    const chips = [];
    const other = targetName(st, data, pl.target);                                            // (a character or a hireling of another player: "Ann\u2019s Captain")
    const d = pl.target && !other ? (st.battle?.dens ?? c.dens).find(x => x.uid === pl.target) : null;
    let tname = null; if (d) { try { tname = denSide(st, data, d).name; } catch { tname = d.id; } }
    const at = other ?? (tname ? `the ${tname}` : null);
    if (pl.fightChit || pl.spellAim) chips.push(`${DIRS[pl.attackDir ?? 0]}${at ? ` at ${at}` : ' at no one'}`);
    else if (at) chips.push(`Strike at ${at}`);
    if (pl.fightChit) chips.push(chitText(st, st.ch.id, pl.fightChit));
    if (pl.moveChit) chips.push(`${MNV[pl.moveDir ?? 0]} · ${chitText(st, st.ch.id, pl.moveChit)}`);
    if (pl.shieldDir != null && st.ch.items?.some(i => i.active && /shield/i.test(i.id ?? ''))) chips.push(`Shield ${DIRS[pl.shieldDir]}`);
    if (!chips.length) chips.push('No blow, no maneuver');
    return h('div', { class: 'sf-sealed', 'data-sealed': '', 'aria-label': 'Your sealed play' }, ...chips.map(t => h('span', { class: 'sf-chip' }, nb(t))));
}
const WAIT_WHY = {
    meet: 'Each character deals with the natives here in turn: drinks, a payment, or a fight. Nothing is hidden, and nothing moves until everyone has answered.',
    lure: 'In the order of today’s draw each character may draw creatures onto his sheet; the dice deal out the rest afterwards.',
    charge: 'In the order of the draw each character may charge another, or send hirelings at one. A charge is made in the open; nothing else is told until the plays are shown.',
    encounter: 'In the order of the draw each character takes one Encounter action against the creatures on his own sheet. The plays follow.',
    harm: 'Each character settles his own wounds and fatigue. Nothing is rolled; the next round starts when all are done.',
    melee: 'Plays are revealed together once everyone has chosen. Until then nobody sees another’s, and a sealed play cannot be changed.',
};
function waitBody({ st, data, f, answer }) {
    const me = f.me, others = f.members.filter(m => m.status === 'deciding' && !m.mine);
    const away = others.filter(m => m.person?.away);
    const names = joinList(others.map(m => (m.person?.away ? `${m.player} (away)` : m.player)));
    if (f.step === 'melee' && me.status === 'sealed') {
        return [h('div', { class: 'sf-card sealed', role: 'status', 'data-sf-wait': 'sealed' },
            h('b', { class: 'sf-big' }, 'Sealed.'), h('p', { class: 'sf-line' }, others.length ? `Waiting for ${names}.` : 'All plays are in.'),
            sealedChips(st, data, f),
            h('p', { class: 'sf-why' }, WAIT_WHY.melee),
            answer?.paused && away.length ? h('p', { class: 'sf-why bad' }, `The game is paused: nothing is played for ${joinList(away.map(m => m.player))}. It goes on where it stopped when they come back.`) : null)];
    }
    const who = others.length ? names : 'the others';
    const after = f.step === 'lure' || f.step === 'meet' || f.step === 'encounter' || f.step === 'charge' ? (() => {
        const order = st.battle?.order ?? [], mine = order.indexOf(me.id), cur = order.findIndex(id => others.some(m => m.id === id));
        return cur >= 0 && mine > cur ? `You come ${mine - cur === 1 ? 'next' : `after ${mine - cur - 1} more`}.` : '';
    })() : '';
    return [h('div', { class: 'sf-card', role: 'status', 'data-sf-wait': f.step },
        h('b', { class: 'sf-big' }, others.length ? `Waiting for ${who}.` : 'One moment.'),
        h('p', { class: 'sf-line' }, others.length ? `${others.length > 1 ? 'They are' : `${others[0].player} is`} ${f.doing}.${after ? ` ${after}` : ''}` : 'The fight goes on.'),
        // a charge is made in the open: everyone is told as it is made
        chargeNews(f) ? h('p', { class: 'sf-line pv-charges', 'data-pv-charges': '' }, chargeNews(f)) : null,
        h('p', { class: 'sf-why' }, WAIT_WHY[f.step] ?? ''),
        answer?.paused && away.length ? h('p', { class: 'sf-why bad' }, `The game is paused: nothing is played for ${joinList(away.map(m => m.player))}. It goes on where it stopped when they come back.`) : null)];
}
const LEFT_WHY = {
    ran: 'You broke away from the fight and end the day on the road.', flew: 'You rose out of the fight and land on a neighbouring tile at the next Birdsong.', mist: 'You melted away as mist.', teleported: 'You were carried away.',
    quiet: 'You stayed out of it.', won: 'Nothing hostile is left for you.', peace: 'A hush ended the fight for you.', died: 'You return at the next Birdsong, with a new character and new goals. Until then you watch.',
};
function watchBody({ f, st }) {
    const me = f.me, still = f.members.filter(m => m.state === 'in' && !m.mine);
    const title = me.why === 'died' ? 'You have fallen.' : me.status === 'fled' ? 'You are out of the fight.' : me.hidden ? 'You are hidden: the fight is not yours.' : 'You are out of the fight.';
    if (me.why === 'died' && f.pvp) {
        // a character who falls gets the big callout, with who struck him down, what was taken, and what happens next; then he watches the rest
        const k = allKills(st, f, st.ch.id).find(x => x.victim.id === me.id)
            ?? { victim: me, killers: [], killerName: (() => { const d = factsOf(fightLines(st, st.ch.id).filter(l => l.who === me.id)).died; return d?.by ? String(d.by).replace(/ #\d+$/, '') : null; })(), creature: true, notoriety: 0, gold: null, items: [], belongings: false };
        return [deathCallout({ st, f, k, viewerId: st.ch.id }),
            h('div', { class: 'sf-card watch', role: 'status', 'data-sf-wait': 'watching' },
                h('p', { class: 'sf-line' }, still.length ? `${joinList(still.map(m => m.player))} ${still.length > 1 ? 'fight' : 'fights'} on. You watch.` : 'Nobody is left in it.'))];
    }
    return [h('div', { class: 'sf-card watch', role: 'status', 'data-sf-wait': 'watching' },
        h('b', { class: 'sf-big' }, title),
        h('p', { class: 'sf-line' }, still.length ? `${joinList(still.map(m => m.player))} ${still.length > 1 ? 'fight' : 'fights'} on. You watch.` : 'Nobody is left in it.'),
        h('p', { class: 'sf-why' }, LEFT_WHY[me.why] ?? 'Your part in this fight is over.'))];
}

// ---- the plays shown: result first ----
const kindName = n => `the ${n}`;
function resultChips(facts) {
    const chips = [];
    if (facts.died) chips.push(h('span', { class: 'sf-chip fell', 'data-fell': '' }, nb(facts.died.by ? `Fell to the ${facts.died.by}` : 'Has fallen')));
    for (const k of facts.kills) chips.push(h('span', { class: 'sf-chip kill' }, nb(`Killed ${kindName(k.name)}`)));
    for (const [n, v] of [['Fame', facts.gain.fame], ['Notoriety', facts.gain.notoriety], ['gold', facts.gain.gold]]) if (v) chips.push(h('span', { class: `gain-chip ${n.toLowerCase()}` }, `+${v} ${n}`));
    if (facts.wounds) chips.push(h('span', { class: 'sf-chip hurt' }, `${facts.wounds} wound${facts.wounds === 1 ? '' : 's'}`));
    for (const g of facts.gear) chips.push(h('span', { class: 'sf-chip hurt' }, nb(`${g.name} ${g.how}`)));
    if (facts.fled) chips.push(h('span', { class: 'sf-chip' }, 'Broke away'));
    if (!chips.length) chips.push(h('span', { class: 'sf-chip dim' }, facts.struck ? 'Hit, no kill' : 'Nothing struck, nothing taken'));
    return chips;
}
const the = pl => (pl.targetKind === 'den' || !pl.targetKind ? `the ${pl.target}` : pl.target);       // (a character or a hireling is named; a creature takes "the")
const playLine = pl => {
    const bits = [];
    if (pl.attack) bits.push(`${pl.attack} at ${pl.target ? the(pl) : 'no one'}`); else if (pl.spell) bits.push('Spell');
    else bits.push(pl.target ? `Strikes ${the(pl)}` : 'No blow');
    return bits;
};
function told(lines, member) {
    const ev = lines.filter(l => l.k !== 'roll').map(l => l.s ?? l.t);
    const f = factsOf(lines);
    // why a blow landed when it was aimed at a creature in another box: the engine's own words, kept (an undercut: the quicker blow wins)
    const why = lines.filter(l => /\bis quicker\b/.test(l.s ?? '')).map(l => l.s);
    const syn = [roundSynopsis(ev), ...why, f.died ? `${f.died.by ? `The ${f.died.by} brings the blow home. ` : ''}You fall.` : ''].filter(Boolean).join(' ') || (lines.length ? '' : 'Nothing is told of this round.');
    return member.mine ? syn : third(syn, member.player);
}
// "Tom" and what happened to him, the name in bold: the told text already starts with it ("You ..." for the viewer, the name for the others)
function toldRow(lines, member) {
    const lead = member.mine ? 'You' : member.player, text = told(lines, member), body = text.startsWith(`${lead} `) ? text.slice(lead.length + 1) : text;
    return h('p', { class: 'sf-told' }, h('b', {}, lead), ' ', body || 'saw nothing of it.');
}
/** The round as one card: what it came to for each character, the plays side by side, then why. `final`: the fight ended in this round (the card of the end uses it too).
 * A round with characters in it (a charge, a blow at a character, a kill) is told by pvp.js / pvpui.js: the fall of a character first and large, then the result, who went for whom, the order of blows, blow by blow. */
export function revealCard({ st, data, f, report, plays, round, callouts = true }) {
    const story = isStory();
    const members = f.members;
    const rows = members.filter(m => report.per[m.id]).map(m => ({ m, facts: report.per[m.id].facts, lines: report.per[m.id].lines }));
    const rd = report.any ? pvpRound(st, f, report, round) : null, pv = !!rd?.pvp;
    const sig = JSON.stringify([plays.map(p => [p.id, p.target, p.attack, p.fight, p.move, p.maneuver]), rows.map(r => [r.m.id, r.facts.kills.map(k => k.name), r.facts.gain, r.facts.wounds, r.facts.gear.map(g => g.name + g.how)]), pv ? rd.kills.map(k => [k.victim.id, k.killers.map(x => x.id), k.notoriety, k.items]) : null]);
        // a character who falls is a big moment (the owner asked for a large callout): by another character, or by a creature when the table plays with the switch on
    const creatureFalls = rd && (pv || f.pvp) ? rows.filter(r => r.facts.died && !rd.kills.some(k => k.victim === r.m)).map(r => ({ victim: r.m, killers: [], killerName: r.facts.died.by ? String(r.facts.died.by).replace(/ #\d+$/, '') : null, creature: true, notoriety: 0, gold: null, items: [], belongings: false })) : [];
    const falls = rd && (pv || f.pvp) && callouts ? [...rd.kills, ...creatureFalls] : [];
    // the fall of a character is the callout's to tell: the result sentence below it is left with what else happened
    const head = report.any ? (pv || falls.length ? pvpHeadline(st, f, report, rd, { omitFalls: falls.length > 0 }) : headline(report)) : 'The plays are shown.';
    const left = pv ? rows.map(r => ({ ...r, lines: r.lines.filter(l => !rd.consumed.has(l)) })) : rows;
    return h('div', { class: `sf-reveal${pv ? ' pv' : ''}`, 'data-reveal': String(round), 'data-sig': sig },
        h('div', { class: 'res-head' }, h('b', { class: 'res-h' }, `Round ${round}: the plays`), voiceChip()),
        ...falls.map(k => deathCallout({ st, f, k, viewerId: st.ch?.id ?? st.actor, round })),
        h('div', { class: `sf-result${rows.some(r => r.facts.died) || falls.length ? ' deadly' : ''}`, 'data-sf-result': '' },
            head ? h('p', { class: 'sf-headline' }, head) : null,
            ...rows.map(r => h('div', { class: `sf-rrow${r.m.mine ? ' me' : ''}`, 'data-rrow': r.m.id },
                h('span', { class: 'sf-rwho' }, r.m.person ? counterIcon(r.m.person, 24) : null, h('b', {}, r.m.player), r.m.mine ? h('small', {}, 'you') : null),
                h('span', { class: 'sf-rchips' }, ...(pv ? pvpChips({ m: r.m, facts: r.facts, rd, f }) : resultChips(r.facts)))))),
        plays.length ? h('div', { class: 'sf-plays', 'data-sf-plays': '' }, h('small', { class: 'sf-sub' }, 'What each played, sealed until now'),
            ...plays.map(pl => h('div', { class: `sf-play${pl.member.mine ? ' me' : ''}`, 'data-play': pl.id },
                h('span', { class: 'sf-rwho' }, pl.member.person ? counterIcon(pl.member.person, 22) : null, h('b', {}, pl.member.player)),
                h('span', { class: 'sf-pchips' }, ...[...playLine(pl), pl.fight, pl.maneuver && pl.move ? `${pl.maneuver} \u00B7 ${pl.move}` : pl.move, pl.shield ? `Shield ${pl.shield}` : null].filter(Boolean).map(t => h('span', { class: 'sf-chip' }, nb(t))))))) : null,
        h('div', { class: 'sf-how', 'data-sf-how': '' }, h('small', { class: 'sf-sub' }, story ? 'How it went' : 'Every line, in order'),
            ...(pv ? pvpHow({ view: st, f, report, rd, mineId: st.ch?.id }) : [
                report.order ? h('p', { class: 'sf-order' }, nb(story ? (report.order.s ?? report.order.t) : report.order.t)) : null,
                report.sameInstant ? h('p', { class: 'sf-order' }, nb(story ? (report.sameInstant.s ?? report.sameInstant.t) : report.sameInstant.t)) : null].filter(Boolean)),
            ...left.map(r => story
                ? (pv && !told(r.lines, r.m) ? null : toldRow(r.lines, r.m))
                : h('div', { class: 'sf-detail' }, h('b', {}, r.m.player), ...rows.find(x => x.m === r.m).lines.map(l => h('p', { class: l.k === 'roll' ? 'dice' : '' }, nb(r.m.mine ? l.t : third(l.t, r.m.player))))))));
}

// ---- the end of a fight ----
/** The card that ends a fight: result first (what each character took away), then the last round told like any other. `view` is the state after the fight; the fight is read from its lines. */
export function overCard({ st, data, people, myId }) {
    const sum = fightSummary(st, myId);
    const ids = sum.lines[0]?.with ?? sum.ids;
    const ppl = new Map(people.map(p => [p.id, p]));
    const members = ids.map(id => ({ id, player: ppl.get(id)?.player ?? st.chars[id]?.name, character: st.chars[id]?.name, mine: id === myId, person: ppl.get(id) ?? null }));
    const how = {};
    for (const l of sum.lines) {
        if (l.who || l.k !== 'combat') continue;
        for (const m of members) {
            const nm = st.chars[m.id]?.name;
            if (nm && l.t.startsWith(`${nm} `)) how[m.id] = /has fallen/.test(l.t) ? 'fell' : /breaks away|rises out|melts away|carried away/.test(l.t) ? 'fled' : /takes no further part/.test(l.t) ? 'stayed out' : how[m.id];
        }
    }
    const fadedOut = sum.lines.some(l => /dies down|draw back|stop; neither/.test(`${l.t} ${l.s ?? ''}`));
    const total = { kills: 0, fame: 0, notoriety: 0, gold: 0 };
    for (const id of ids) { const x = sum.per[id]; if (x) { total.kills += x.kills.length; total.fame += x.gain.fame; total.notoriety += x.gain.notoriety; total.gold += x.gain.gold; } }
    const lastFight = { members: members.map(m => ({ ...m, state: 'out', status: 'out', word: '' })), at: sum.at, round: sum.lastRound };
    const report = (() => {
        const rep = roundReport(st, lastFight, sum.lastRound, myId);
        return rep;
    })();
    const plays = playsFromLines(report);
    // character against character: who fell to whom with what taken, and an evening of friends (R-18)
    const kills = allKills(st, lastFight, myId), peace = sum.lines.some(l => /Nobody here means harm/.test(l.t));
    const pvpEnd = kills.length > 0 || peace || sum.lines.some(l => /^[\w' ]+ charges /.test(l.t));
    const fallen = joinList(kills.map(k => `${k.victim.player}\u2019s ${k.victim.character}`));
    const head = peace && kills.length ? ['The fight is over.', 'Nobody who was left meant harm, so the evening passes in peace. You may trade before Midnight.']
        : peace ? ['A friendly evening.', 'Nobody here meant harm, so the evening passes in peace. You may trade before Midnight.']
        : kills.length ? ['The fight is over.', `${fallen} ${kills.length > 1 ? 'have' : 'has'} fallen.`]
            : [total.kills ? 'The fight is won.' : 'The fight is over.', total.kills ? `${total.kills} creature${total.kills === 1 ? '' : 's'} fell between you.` : fadedOut ? 'The blows stopped: neither side pressed on.' : 'Nothing more is to be won here tonight.'];
    return h('div', { class: `sf-over${pvpEnd ? ' pv' : ''}`, 'data-fightover': sum.key },
        ...kills.map(k => deathCallout({ st, f: lastFight, k, viewerId: myId })),
        h('div', { class: 'cb-victory', role: 'status' }, h('b', {}, head[0]), h('span', {}, head[1])),
        h('div', { class: `sf-result${kills.length ? ' deadly' : ''}`, 'data-sf-result': '' },
            ...members.map(m => {
                const x = sum.per[m.id] ?? { kills: [], gain: { fame: 0, notoriety: 0, gold: 0 }, wounds: 0, gear: [], fled: false, struck: false };
                const hw = how[m.id], mineKills = kills.filter(k => k.killers.some(q => q.id === m.id)), fellTo = kills.find(k => k.victim.id === m.id);
                const gain = { Fame: x.gain.fame, Notoriety: x.gain.notoriety + mineKills.reduce((a, k) => a + k.notoriety, 0), gold: x.gain.gold + mineKills.reduce((a, k) => a + (k.gold || 0), 0) };
                const took = x.kills.length || mineKills.length || gain.Fame || gain.Notoriety || gain.gold;
                return h('div', { class: `sf-rrow${m.mine ? ' me' : ''}`, 'data-orow': m.id },
                    h('span', { class: 'sf-rwho' }, m.person ? counterIcon(m.person, 24) : null, h('b', {}, m.player), m.mine ? h('small', {}, 'you') : null),
                    h('span', { class: 'sf-rchips' },
                        fellTo ? h('span', { class: 'sf-chip fell', 'data-fell': '' }, nb(fellTo.killers.length ? `Struck down by ${joinList(fellTo.killers.map(q => q.player))}` : 'Fell in the fight')) : hw === 'fell' ? h('span', { class: 'sf-chip fell' }, 'Fell in the fight') : hw === 'fled' ? h('span', { class: 'sf-chip' }, 'Broke away') : null,
                        ...mineKills.map(k => h('span', { class: 'sf-chip kill' }, nb(`Struck down ${k.victim.character}`))),
                        ...(x.kills.length ? [h('span', { class: 'sf-chip kill' }, nb(`Killed ${joinList(x.kills.map(k => kindName(k.name)))}`))] : []),
                        ...Object.entries(gain).filter(([, v]) => v).map(([n, v]) => h('span', { class: `gain-chip ${n.toLowerCase()}` }, `+${v} ${n}`)),
                        ...mineKills.filter(k => k.belongings).map(k => h('span', { class: 'sf-chip' }, nb(k.items.length ? `Took ${k.items.length} belonging${k.items.length === 1 ? '' : 's'}` : 'Took their belongings'))),
                        !took && !fellTo && hw !== 'fell' && hw !== 'fled' ? h('span', { class: 'sf-chip dim' }, x.wounds ? `${x.wounds} wound${x.wounds === 1 ? '' : 's'} and no spoils` : peace ? 'Meant no harm' : 'Took nothing') : null));
            })),
        report.any ? h('details', { class: 'sf-lastround', 'data-sf-last': '' }, h('summary', {}, h('b', {}, `The last round (${sum.lastRound})`)),
            revealCard({ st, data, f: lastFight, report, plays, round: sum.lastRound, callouts: false })) : null);
}

// ---- the sheet itself ----
/** The sheet of a seat that is in (or was in) the fight, or null when this seat is not in it (it sees a banner and the map). `ctx`: the game screen's { st, data, act, ui, render, peek, crew, answer }. */
export function sharedFightSheet(ctx) {
    const { st, data, act, ui, render, peek, crew, answer } = ctx;
    const f = fightOf(st, crew, data, st.ch.id);
    if (!f?.me) return null;
    const p = st.pending, hd = header(f, peek), fr = frame(f);
    const rkey = revealKey(st, f);
    const showReveal = rkey && ui.revealSeen !== rkey;
    if (showReveal) {
        const report = roundReport(st, f, st.battle.reveal.round, st.ch.id);
        const plays = playsOf(st, f, data);
        const next = p?.type === 'combat-wounds' ? 'Choose your wounds' : p?.type === 'combat-fatigue' ? 'Choose what tires' : 'On';
        return h('div', { class: 'combat sf', 'data-sf': 'reveal' }, hd, fr,
            h('div', { class: 'cb-scroll sf-scroll' }, revealCard({ st, data, f, report, plays, round: st.battle.reveal.round })),
            h('div', { class: 'sf-foot' }, h('button', { class: 'btn primary big', 'data-act': 'reveal-ok', onclick: () => { ui.revealSeen = rkey; render(); } }, next)));
    }
    if (p?.type === 'combat-charge') {
        const { body, foot } = chargeBody({ st, data, p, ui, render, act, f });
        return h('div', { class: 'combat sf', 'data-sf': 'charge' }, hd, frame(f, { quiet: true }), h('div', { class: 'cb-scroll sf-scroll' }, ...body), foot);
    }
    if (p?.type === 'combat-lure') {
        const { body, foot } = lureBody({ st, data, p, ui, render, act, f });
        return h('div', { class: 'combat sf', 'data-sf': 'lure' }, hd, frame(f, { quiet: true }), h('div', { class: 'cb-scroll sf-scroll' }, ...body), foot);
    }
    if (p?.type?.startsWith('combat') && f.me.state === 'in') {
        return combatSheet({ st, data, act, ui, render, peek, shared: { header: hd, frame: fr, fight: f, mark: 'step' } });
    }
    const body = f.me.state === 'in' ? waitBody({ st, data, f, answer }) : watchBody({ f, st });
    return h('div', { class: 'combat sf', 'data-sf': f.me.state === 'in' ? 'wait' : 'watch' }, hd, frame(f, { now: false }), h('div', { class: 'cb-scroll sf-scroll' }, ...body));
}
