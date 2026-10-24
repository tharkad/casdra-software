// The screens of a SHARED fight (docs/design/multiplayer-cui.md, mockup 07 i4 and i5): one fight in a clearing with several characters, on the combat scene's chrome (screens/combat_scene.js, P1):
// the top bar, the participants strip (who has played, who is deciding), the stage with MY creatures and me, a narrator line, and one sheet that asks one question. Only for a shared game.
//   step screens  the Meeting, Encounter, secret plays and wounds/fatigue are the combat scene's own, with `shared` = { fight, strip } (a Whom step names others' creatures, characters, hirelings)
//   lure          8.3.4: which creatures to draw onto your own sheet, with what it means; "Lure none" is the default and the button on the right
//   waiting       "Your play is sealed. The fight waits for Ann." with the sealed chip, or who is acting and why you wait; a character who has left the fight watches the rest
//   reveal        the plays of everyone side by side, result first, in the story voice with a Detail view (a sheet over the stage)
//   over          the card that ends a fight: each character's own gains, who fell, who ran (a result sheet)
// Redaction is unchanged: everything here is read from the seat's own view (fight.js, party.js); nothing of another seat's play is on the page before the reveal.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { btn, primary, sheet as dsSheet, voiceSwitch } from '../ds.js';
import { isStory } from '../voice.js';
import { lineFor } from '../storyvoice.js';
import { denSide } from '../../engine/combat.js';
import { roundSynopsis } from '../../engine/story.js';
import { nameOfClearing } from '../../engine/world.js';
import { askBox, gainChip, pcEl } from '../shared_ui.js';
import { fightLines, fightOf, chargeNews, roundReport, playsOf, playsFromLines, headline, third, factsOf, whyNotLurable, fightSummary, joinList, DIRS, MNV, chitText } from '../fight.js';
import { pvpRound, pvpHeadline, allKills, targetName } from '../pvp.js';
import { combatScene } from './combat_scene.js';
import { chargeBody, deathCallout, pvpChips, pvpHow } from './pvpui.js';
import { foeEl, foeSize, heroEl } from '../combat/stage.js';
import { onMine, foesPhrase, cap } from '../combat/model.js';
import { fixNames } from '../names.js';

const nb = s => fixNames(String(s)).replace(/ (?=\d)/g, '\u00A0');          // (the spelling of a name is one thing everywhere: QA-125)
const WORD = { N: 'Negligible', L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };
const tag = (text, cls = '', attrs = {}) => h('span', { class: `ds-tag sf-chip${cls ? ` ${cls}` : ''}`, ...attrs }, nb(text));

/** The reveal that has not been looked at yet, or null: the table's `battle.reveal` of a round the player has not dismissed. */
export const revealKey = (st, f) => (st.battle?.reveal ? `${st.day}|${f.at}|${st.battle.reveal.round}` : null);

// ---- the frame: the top bar, who is in the fight, the stage, the narrator, one sheet ----
/** The participants strip: one chip for every character in the fight; what each is doing in a word (sealed, deciding, stayed out, fled, fallen). `sealedWord`: before the reveal a play made is "sealed". */
export function fightStrip(f, { reveal = false } = {}) {
    const wordOf = m => (m.person?.away && m.status === 'deciding' ? 'away' : m.status === 'sealed' && !reveal ? 'sealed' : m.word);
    return h('div', { class: `ds-players sf-strip n${f.members.length}`, role: 'list', 'aria-label': 'In the fight', 'data-sf-strip': '' }, ...f.members.map(m => {
        const p = m.person;
        return h('div', { class: `ds-pchip pchip sf-who ${m.status}${m.mine ? ' me' : ''}${m.status === 'deciding' ? ' now' : ''}`, role: 'listitem', 'data-who': m.id, 'data-fstatus': m.status, 'data-player': m.player,
            'aria-label': `${m.player}${m.mine ? ' (you)' : ''}, ${m.character}: ${m.word}` },
            pcEl(p ? { ...p, dead: m.status === 'fallen' } : { letter: m.player[0], color: '#8f8872', shape: 'circle' }),
            h('span', { class: 't' }, h('span', { class: 'nm' }, h('b', {}, m.player)), h('span', { class: 'st' }, wordOf(m))),
            h('i', { class: `on pdot${p?.present === false ? ' away' : ''}`, 'aria-hidden': 'true' }));
    }));
}
// "You are hidden: the fight is not yours unless you strike." stands under the strip, for the one who is hidden
const hiddenWarn = (f, ui) => (f.me?.hidden && f.me.state === 'in' ? h('p', { class: 'ds-hint-line sf-warn', 'data-sf-hidden': '' }, 'You are hidden: the fight is not yours unless you strike.') : null);
export const stripBlock = (f, opts = {}) => h('div', { class: 'sf-stripblock' }, fightStrip(f, opts), hiddenWarn(f));

function topBar(f, peek) {
    const place = nameOfClearing(f.at).replace(/ (\d+)$/, ' $1');
    return h('div', { class: 'cb-top sf-head' },
        h('div', { class: 'where' }, h('b', { class: 'ds-nb' }, place), h('span', {}, `Evening · round ${f.round}`)),
        peek ? h('button', { type: 'button', class: 'ds-btn icon quiet', 'data-act': 'peek-gear', 'aria-label': 'Belongings', onclick: peek.gear }, icon('bag', 'lg')) : null,
        peek ? h('button', { type: 'button', class: 'ds-btn icon quiet', 'data-act': 'peek-map', 'aria-label': 'Map', onclick: peek.map }, icon('pin', 'lg')) : null);
}

// the stage of a seat that is not asked: my creatures (the ones on my sheet) across the top, me at the bottom. `dens` overrides (the reveal shows every creature of the fight, the slain stamped).
function stageEl({ st, data, ui, dens = null, dead = false }) {
    ui.sfFlip ??= {};
    const list = dens ?? (st.combat ? st.combat.dens.filter(d => !d.dead && d.kind !== 'horse' && d.kind !== 'part' && onMine(st, d)) : []);
    const size = foeSize(list.length);
    const foes = list.map(d => foeEl({ st, data, d, size, dead: !!d.dead || dead, flipped: !!ui.sfFlip[d.uid], onFlip: (den, has) => { if (has) { ui.sfFlip[den.uid] = !ui.sfFlip[den.uid]; ui.sfRender?.(); } } }));
    return h('div', { class: 'cb-stage' }, h('div', { class: 'cb-stagein' }, h('div', { class: 'cb-foes' }, ...foes), h('div'), heroEl({ st, data, ribbon: st.ch.morph ? `You are a ${st.ch.morph.creature?.name ?? 'creature'}` : null })));
}

/** One screen of the fight: the scene's frame (top bar, strip, stage), a narrator line and a sheet. `kind` is the data-sf value the tests read. */
function sceneEl({ st, data, ui, f, kind, peek, narr, sheet, stage = null, cls = '', tone = '' }) {
    const root = h('section', { class: `cb ds-screen sf${cls ? ` ${cls}` : ''}`, 'data-sf': kind },
        topBar(f, peek), stripBlock(f, { reveal: kind === 'reveal' }), stage ?? stageEl({ st, data, ui }),
        narr ? h('p', { class: `cb-narr${tone ? ` ${tone}` : ''}`, role: 'status', 'aria-live': 'polite' }, narr) : null, sheet);
    return root;
}
const sheetBox = (kind, ...kids) => h('div', { class: `cb-sheet sf-sheet${kind === 'lure' ? ' sf-pick' : ''}`, 'data-kind': kind }, ...kids);
const footRow = (lead, prim) => h('div', { class: 'ds-actions' }, lead ? h('div', { class: 'lead' }, lead) : null, prim);

// ---- the lure (8.3.4) ----
function denPicture(data, d) {
    const a = data.art;
    if (d.kind === 'mon') { const nm = data.monsters[d.id]?.name; return a?.monstersColor?.[nm] ?? a?.monsters?.[nm] ?? null; }
    return a?.natives?.[d.id] ?? null;
}
function lureSheet({ st, data, p, ui, render, act, f }) {
    const sel = ui.lureSel ??= [];
    for (let i = sel.length - 1; i >= 0; i--) if (!p.lurable.some(o => o.uid === sel[i])) sel.splice(i, 1);
    const dens = st.battle?.dens ?? st.combat?.dens ?? [];
    const hidden = !!st.ch.hidden, byId = Object.fromEntries(f.members.map(m => [m.id, m]));
    const rows = p.lurable.map(o => {
        const d = dens.find(x => x.uid === o.uid) ?? { uid: o.uid, kind: 'mon', id: '', side: 'light' };
        let s = null; try { s = denSide(st, data, d); } catch { /* a name only */ }
        const on = sel.includes(o.uid), from = o.from ? byId[o.from] : null, pic = denPicture(data, d);
        const meaning = [from ? `On ${from.player}’s sheet: draw it away and it comes for you, not ${from.player}.` : null, d.kind === 'nat' ? 'A native: its whole group will fight you.' : null].filter(Boolean).join(' ') || null;
        const stat = s ? [s.attack === 'none' ? 'no attack' : s.attack === 'spell' ? 'casts' : `hits ${WORD[String(s.harm)[0]] ?? s.harm}${'*'.repeat(s.stars || 0)}`, s.atk != null && s.attack !== 'none' ? `speed ${s.atk}` : null, s.vuln ? `falls to ${WORD[s.vuln] ?? s.vuln}` : null].filter(Boolean).join(' · ') : '';
        return h('button', { type: 'button', class: `ds-row sf-lure${on ? ' on sel' : ''}`, role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'data-lure': o.uid, 'data-from': o.from ?? '',
            onclick: () => { const i = sel.indexOf(o.uid); if (i >= 0) sel.splice(i, 1); else sel.push(o.uid); render(); } },
            h('span', { class: 'art' }, pic ? h('img', { src: pic, alt: '' }) : null),
            h('span', { class: 'main sf-ltext' }, h('b', {}, o.name), stat ? h('span', {}, stat) : null, meaning ? h('span', { class: 'mean' }, meaning) : null),
            h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, on ? icon('check') : icon('plus')));
    });
    // what cannot be drawn, and the plain reason (shown muted, so nothing is offered that the rules forbid)
    const lurableIds = new Set(p.lurable.map(o => o.uid)), mineIds = new Set(p.mine ?? []);
    const cannot = [...f.held, ...f.standingBy, ...f.sheets.filter(s => !s.owner.mine).flatMap(s => s.dens).filter(d => !lurableIds.has(d.uid) && !mineIds.has(d.uid))].filter(d => !lurableIds.has(d.uid) && !mineIds.has(d.uid));
    const names = sel.map(u => p.lurable.find(o => o.uid === u)?.name).filter(Boolean), none = !sel.length;
    const scroll = h('div', { class: 'sf-scroll' },
        hidden ? h('p', { class: 'ds-hint-line bad', 'data-sf-hidden-lure': '' }, 'Drawing a creature onto your sheet gives you away.') : null,
        h('div', { class: 'ds-list sf-lures', role: 'group', 'aria-label': 'Creatures you may draw', 'data-sf-lures': '' }, ...rows),
        cannot.length ? h('p', { class: 'cb-hint sf-cannot', 'data-sf-cannot': '' }, `Not available: ${joinList([...new Set(cannot.map(d => `the ${d.name} (${whyNotLurable(d)})`))])}.`) : null);
    const lead = none ? null : btn('Lure none', 'quiet', { 'data-act': 'lure-none', onclick: () => { ui.lureSel = []; render(); } });
    const go = primary(none ? 'Lure none' : `Draw ${names.length === 1 ? `the ${names[0]}` : `${names.length} creatures`}${hidden ? ' and be seen' : ''}`,
        { 'data-act': 'lure-go', 'data-count': String(sel.length), onclick: () => { const dens = sel.slice(); ui.lureSel = null; ui.melee = null; act({ type: 'combat', kind: 'lure', dens }); } });
    const mineNow = f.sheets.find(s => s.owner.mine)?.dens ?? [];
    return { sheet: sheetBox('lure', h('div', { class: 'sf-ask' }, askBox(`Round ${p.round}: draw any creature onto your sheet?`, 'One on your sheet attacks you alone, and what it pays is yours. The dice deal out whatever nobody draws.')), scroll, footRow(lead, go)),
        narr: lureNarr(st, data, f, mineNow) };
}
// the creatures that circle, in a sentence ("An Ogre and two Wolves circle the clearing.")
function lureNarr(st, data, f, mineNow) {
    const all = [...f.sheets.flatMap(s => s.dens), ...f.loose, ...f.held, ...f.standingBy], seen = new Set(), names = [];
    for (const d of all) if (!seen.has(d.uid)) { seen.add(d.uid); names.push(d.name); }
    // (QA-125: "an Ogre", never "a Ogre": the article follows the first letter, whatever the phrase builder wrote)
    const phrase = fixNames(cap(foesPhrase(names))).replace(/\b([Aa]) (?=[AEIOUaeiou])/g, '$1n ');
    return names.length ? `${phrase} circle${names.length === 1 && !/s$/.test(names[0]) ? 's' : ''} the clearing.` : 'The clearing is quiet.';
}

// ---- waiting, and watching ----
// Your sealed play, in one chip: "Sealed: Thrust at the Wolf, Duck". Only your own: nobody else's is on the page before the reveal.
function sealedChip(st, data) {
    const c = st.combat, pl = c?.play;
    if (!pl) return null;
    const bits = [];
    const other = targetName(st, data, pl.target);                                            // (a character or a hireling of another player: "Ann’s Captain")
    const d = pl.target && !other ? (st.battle?.dens ?? c.dens).find(x => x.uid === pl.target) : null;
    let tname = null; if (d) { try { tname = denSide(st, data, d).name; } catch { tname = d.id; } }
    const at = other ?? (tname ? `the ${tname}` : null);
    if (pl.fightChit || pl.spellAim) bits.push(`${DIRS[pl.attackDir ?? 0]}${at ? ` at ${at}` : ' at no one'}`);
    else if (at) bits.push(`Strike at ${at}`);
    if (pl.fightChit) bits.push(chitText(st, st.ch.id, pl.fightChit));
    if (pl.moveChit) bits.push(`${MNV[pl.moveDir ?? 0]} · ${chitText(st, st.ch.id, pl.moveChit)}`);
    if (pl.shieldDir != null && st.ch.items?.some(i => i.active && /shield/i.test(i.id ?? ''))) bits.push(`Shield ${DIRS[pl.shieldDir]}`);
    if (!bits.length) bits.push('No blow, no maneuver');
    return h('div', { class: 'cb-verdict sf-sealed', 'data-sealed': '', 'aria-label': 'Your sealed play' }, h('span', { class: 'ds-sealed sf-chip' }, icon('lock'), nb(`Sealed: ${bits.join(', ')}`)));
}
const WAIT_WHY = {
    meet: 'Each character deals with the natives here in turn: drinks, a payment, or a fight. Nothing is hidden, and nothing moves until everyone has answered.',
    lure: 'In the order of today’s draw each character may draw creatures onto their sheet; the dice deal out the rest afterwards.',
    charge: 'In the order of the draw each character may charge another, or send hirelings at one. A charge is made in the open; nothing else is told until the plays are shown.',
    encounter: 'In the order of the draw each character takes one Encounter action against the creatures on their own sheet. The plays follow.',
    harm: 'Each character settles their own wounds and fatigue. Nothing is rolled; the next round starts when all are done.',
    melee: 'Nothing is shown until everyone has played, and a sealed play cannot be changed.',
};
const pausedLine = (answer, away) => (answer?.paused && away.length ? h('p', { class: 'ds-hint-line bad' }, `The game is paused: nothing is played for ${joinList(away.map(m => m.player))}. It goes on where it stopped when they come back.`) : null);
function waitSheet({ st, data, f, answer }) {
    const me = f.me, others = f.members.filter(m => m.status === 'deciding' && !m.mine);
    const away = others.filter(m => m.person?.away);
    const names = joinList(others.map(m => (m.person?.away ? `${m.player} (away)` : m.player)));
    if (f.step === 'melee' && me.status === 'sealed') {
        return { kind: 'sealed', narr: others.length ? `Your play is sealed. The fight waits for ${names}.` : 'Your play is sealed. All the plays are in.',
            sheet: sheetBox('wait', sealedChip(st, data), h('div', { class: 'ds-actions sf-note' }, h('div', { class: 'lead' }, h('span', { class: 'ds-lead-text' }, WAIT_WHY.melee))), pausedLine(answer, away)) };
    }
    const who = others.length ? names : 'the others';
    const after = f.step === 'lure' || f.step === 'meet' || f.step === 'encounter' || f.step === 'charge' ? (() => {
        const order = st.battle?.order ?? [], mine = order.indexOf(me.id), cur = order.findIndex(id => others.some(m => m.id === id));
        return cur >= 0 && mine > cur ? `You come ${mine - cur === 1 ? 'next' : `after ${mine - cur - 1} more`}.` : '';
    })() : '';
    return { kind: f.step, narr: others.length ? `Waiting for ${who}.` : 'One moment. The fight goes on.',
        sheet: sheetBox('wait', h('div', { class: 'sf-waitline', role: 'status' }, others.length ? `${others.length > 1 ? 'They are' : `${others[0].player} is`} ${f.doing}.${after ? ` ${after}` : ''}` : 'The fight goes on.'),
            // a charge is made in the open: everyone is told as it is made
            chargeNews(f) ? h('p', { class: 'sf-line pv-charges', 'data-pv-charges': '' }, chargeNews(f)) : null,
            h('p', { class: 'ds-meta sf-why' }, WAIT_WHY[f.step] ?? ''), pausedLine(answer, away)) };
}
const LEFT_WHY = {
    ran: 'You broke away from the fight and end the day on the road.', flew: 'You rose out of the fight and land on a neighbouring tile at the next Birdsong.', mist: 'You melted away as mist.', teleported: 'You were carried away.',
    quiet: 'You stayed out of it.', won: 'Nothing hostile is left for you.', peace: 'A hush ended the fight for you.', died: 'You return at the next Birdsong, with a new character and new goals. Until then you watch.',
};
function watchSheet({ f, st }) {
    const me = f.me, still = f.members.filter(m => m.state === 'in' && !m.mine);
    const title = me.why === 'died' ? 'You have fallen.' : me.status === 'fled' ? 'You are out of the fight.' : me.hidden ? 'You are hidden: the fight is not yours.' : 'You are out of the fight.';
    const rest = still.length ? `${joinList(still.map(m => m.player))} ${still.length > 1 ? 'fight' : 'fights'} on. You watch.` : 'Nobody is left in it.';
    if (me.why === 'died') {
        // a character who falls gets the big callout, with who struck him down, what was taken, and what happens next; then he watches the rest (a fall to a creature too, QA-106)
        const k = (f.pvp ? allKills(st, f, st.ch.id).find(x => x.victim.id === me.id) : null)
            ?? { victim: me, killers: [], killerName: (() => { const d = factsOf(fightLines(st, st.ch.id).filter(l => l.who === me.id)).died; return d?.by ? String(d.by).replace(/ #\d+$/, '') : null; })(), creature: true, notoriety: 0, gold: null, items: [], belongings: false };
        return { narr: title, tone: 'bad', sheet: h('div', { class: 'cb-sheet sf-sheet sf-watch', 'data-kind': 'watch' }, h('div', { class: 'sf-scroll' }, deathCallout({ st, f, k, viewerId: st.ch.id })), h('div', { class: 'sf-waitline', role: 'status' }, rest)) };
    }
    return { narr: title, tone: me.why === 'died' ? 'bad' : '', sheet: sheetBox('watch', h('div', { class: 'sf-waitline', role: 'status' }, rest), h('p', { class: 'ds-meta sf-why' }, LEFT_WHY[me.why] ?? 'Your part in this fight is over.')) };
}

// ---- the plays shown: result first ----
const kindName = n => `the ${n}`;
function resultChips(facts) {
    const chips = [];
    if (facts.died) chips.push(tag(facts.died.by ? `Fell to the ${facts.died.by}` : 'Has fallen', 'bad fell', { 'data-fell': '' }));
    for (const k of facts.kills) chips.push(tag(`Killed ${kindName(k.name)}`, 'good kill'));
    for (const [n, v] of [['fame', facts.gain.fame], ['notor', facts.gain.notoriety], ['gold', facts.gain.gold]]) if (v) chips.push(gainChip(n, v));
    if (facts.wounds) chips.push(tag(`${facts.wounds} wound${facts.wounds === 1 ? '' : 's'}`, 'bad hurt'));
    for (const g of facts.gear) chips.push(tag(`${g.name} ${g.how}`, 'bad hurt'));
    if (facts.fled) chips.push(tag('Broke away'));
    if (!chips.length) chips.push(tag(facts.struck ? 'Hit, no kill' : 'Nothing struck, nothing taken', 'dim'));
    return chips;
}
const the = pl => (pl.targetKind === 'den' || !pl.targetKind ? `the ${pl.target}` : pl.target);       // (a character or a hireling is named; a creature takes "the")
const playLine = pl => {
    const bits = [];
    if (pl.attack) bits.push(`${pl.attack} at ${pl.target ? the(pl) : 'no one'}`); else if (pl.spell) bits.push('Spell');
    else bits.push(pl.target ? `Strikes ${the(pl)}` : 'No blow');
    return bits;
};
// What a seat played, on one line. The Story voice names the blow and the maneuver but never a chit's code ("Fight T5*"); Detail keeps every code (QA-128).
const playText = (pl, story) => [...playLine(pl), story ? null : pl.fight, pl.maneuver && pl.move ? (story ? pl.maneuver : `${pl.maneuver} · ${pl.move}`) : story ? null : pl.move, pl.shield ? `Shield ${pl.shield}` : null].filter(Boolean).join(' · ');
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
    const text = told(lines, member);
    // the text already begins with who it is about ("You ...", "Your arrow ...", "Ann ...", "Ann’s arrow ..."): the name is set bold where it stands, never said twice (QA-106)
    const m = member.mine ? /^(Your|You)(?=[\s’'])/.exec(text) : text.startsWith(member.player) && /^[\s’']/.test(text.slice(member.player.length)) ? [member.player] : null;
    if (m) return h('p', { class: 'sf-told' }, h('b', {}, m[0]), text.slice(m[0].length));
    return h('p', { class: 'sf-told' }, h('b', {}, member.mine ? 'You' : member.player), ' ', text || 'saw nothing of it.');
}
// the short title of a reveal: what fell
function revealTitle(rows, falls) {
    const kills = [...new Set(rows.flatMap(r => r.facts.kills.map(k => k.name.replace(/ #\d+$/, ''))))];
    if (falls.length) return falls.length === 1 ? `${falls[0].victim.player}’s ${falls[0].victim.character} falls` : 'Characters fall';
    if (rows.some(r => r.facts.died)) return 'A character falls';
    if (kills.length) return `${cap(kindName(joinList(kills.length > 1 ? kills.map((k, i) => (i ? kindName(k) : k)) : kills)).replace(/^the the /, 'the '))} ${kills.length > 1 || /s$/.test(kills[0]) ? 'fall' : 'falls'}`.replace(/^The the /, 'The ');
    if (rows.some(r => r.facts.wounds)) return 'Blood is drawn';
    return 'The plays are shown';
}

/** The round as one card, result first: the headline in the story voice (what fell, who was hurt), what each character played and what it came to, then why. `final`: the fight ended in this round
 * (the card of the end uses it too, `callouts: false`). A round with characters in it (a charge, a blow at a character, a kill) is told by pvp.js / pvpui.js: the fall of a character first and
 * large, then the result, who went for whom, the order of blows, blow by blow. Returns the sheet's body, and `title` for its head. */
export function revealCard({ st, data, f, report, plays, round, callouts = true }) {
    const story = isStory();
    const members = f.members;
    const rows = members.filter(m => report.per[m.id]).map(m => ({ m, facts: report.per[m.id].facts, lines: report.per[m.id].lines }));
    const rd = report.any ? pvpRound(st, f, report, round) : null, pv = !!rd?.pvp;
    const sig = JSON.stringify([plays.map(p => [p.id, p.target, p.attack, p.fight, p.move, p.maneuver]), rows.map(r => [r.m.id, r.facts.kills.map(k => k.name), r.facts.gain, r.facts.wounds, r.facts.gear.map(g => g.name + g.how)]), pv ? rd.kills.map(k => [k.victim.id, k.killers.map(x => x.id), k.notoriety, k.items]) : null]);
    // a character who falls is a big moment (the owner asked for a large callout): by another character, or by a creature when the table plays with the switch on
    const creatureFalls = rd && (pv || f.pvp) ? rows.filter(r => r.facts.died && !rd.kills.some(k => k.victim === r.m)).map(r => ({ victim: r.m, killers: [], killerName: r.facts.died.by ? String(r.facts.died.by).replace(/ #\d+$/, '') : null, creature: true, notoriety: 0, gold: null, items: [], belongings: false })) : [];
    const falls0 = rd && (pv || f.pvp) && callouts ? [...rd.kills, ...creatureFalls] : [];
    // my own fall to a creature, in a game where characters do not fight each other: the same big moment, told to me ("You have fallen"), never in the third person about myself (QA-106)
    const myRow = rows.find(r => r.m.mine), myId = myRow?.m.id ?? st.ch?.id ?? st.actor;
    const ownCreature = callouts && myRow?.facts.died && !falls0.some(k => k.victim.id === myId)
        ? [{ victim: myRow.m, killers: [], killerName: myRow.facts.died.by ? String(myRow.facts.died.by).replace(/ #\d+$/, '') : null, creature: true, notoriety: 0, gold: null, items: [], belongings: false }] : [];
    const falls = [...falls0, ...ownCreature];
    // the fall of a character is the callout's to tell: the result sentence below it is left with what else happened
    let head;
    if (!report.any) head = 'The plays are shown.';
    else if (pv || falls0.length) head = pvpHeadline(st, f, report, rd, { omitFalls: falls0.length > 0 });
    else if (ownCreature.length) {
        const rest = { ...report, per: { ...report.per, [myId]: { ...report.per[myId], facts: { ...report.per[myId].facts, died: null } } } };
        const others = headline(rest);
        head = others === 'No creature falls.' ? '' : others;
    } else head = headline(report);
    const left = pv ? rows.map(r => ({ ...r, lines: r.lines.filter(l => !rd.consumed.has(l)) })) : rows;
    const playOf = id => plays.find(p => p.id === id);
    const body = h('div', { class: `sf-reveal${pv ? ' pv' : ''}`, 'data-reveal': String(round), 'data-sig': sig },
        ...falls.map(k => deathCallout({ st, f, k, viewerId: st.ch?.id ?? st.actor, round, bare: k.victim.id === myId })),
        head ? h('p', { class: `ds-voice lg sf-headline${rows.some(r => r.facts.died) || falls.length ? ' deadly' : ''}` }, fixNames(head)) : null,
        h('div', { class: 'ds-list sf-results', 'data-sf-result': '' }, ...rows.map(r => {
            const pl = playOf(r.m.id);
            return h('div', { class: `ds-row sf-rrow${r.m.mine ? ' me' : ''}`, 'data-rrow': r.m.id, 'data-play': pl ? r.m.id : null },
                r.m.person ? pcEl({ ...r.m.person, dead: false }, { size: 30 }) : null,
                h('div', { class: 'main' }, h('b', {}, r.m.player, r.m.mine ? h('small', {}, ' you') : null),
                    pl ? h('span', { class: 'sf-playline' }, nb(playText(pl, story))) : null,
                    h('span', { class: 'sf-rchips' }, ...(pv ? pvpChips({ m: r.m, facts: r.facts, rd, f }) : resultChips(r.facts)))));
        })),
        h('div', { class: 'sf-how', 'data-sf-how': '' }, h('span', { class: 'ds-eyebrow sf-sub' }, story ? 'How it went' : 'Every line, in order'),
            ...(pv ? pvpHow({ view: st, f, report, rd, mineId: st.ch?.id }) : [
                report.order ? h('p', { class: 'sf-order' }, nb(story ? lineFor(report.order, 'story') : report.order.t)) : null,
                report.sameInstant ? h('p', { class: 'sf-order' }, nb(story ? lineFor(report.sameInstant, 'story') : report.sameInstant.t)) : null].filter(Boolean)),
            ...left.map(r => story
                ? (pv && !told(r.lines, r.m) ? null : toldRow(r.lines, r.m))
                : h('div', { class: 'sf-detail' }, h('b', {}, r.m.player), ...rows.find(x => x.m === r.m).lines.map(l => h('p', { class: l.k === 'roll' ? 'dice' : '' }, nb(r.m.mine ? l.t : third(l.t, r.m.player))))))));
    return { body, title: falls.some(k => k.victim.id === myId) || myRow?.facts.died ? 'You have fallen' : fixNames(revealTitle(rows, falls)) };
}

// ---- the end of a fight ----
/** The card that ends a fight: result first (what each character took away), then the last round told like any other. `st` is the state after the fight; the fight is read from its lines. Returns the sheet body. */
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
    const report = roundReport(st, lastFight, sum.lastRound, myId);
    const plays = playsFromLines(report);
    // character against character: who fell to whom with what taken, and an evening of friends (R-18)
    const kills = allKills(st, lastFight, myId), peace = sum.lines.some(l => /Nobody here means harm/.test(l.t));
    const pvpEnd = kills.length > 0 || peace || sum.lines.some(l => /^[\w' ]+ charges /.test(l.t));
    const fallen = joinList(kills.map(k => `${k.victim.player}’s ${k.victim.character}`));
    const head = peace && kills.length ? ['The fight is over.', 'Nobody who was left meant harm, so the evening passes in peace. You may trade before Midnight.']
        : peace ? ['A friendly evening.', 'Nobody here meant harm, so the evening passes in peace. You may trade before Midnight.']
        : kills.length ? ['The fight is over.', `${fallen} ${kills.length > 1 ? 'have' : 'has'} fallen.`]
            : [total.kills ? 'The fight is won.' : 'The fight is over.', total.kills ? `${total.kills} creature${total.kills === 1 ? '' : 's'} fell between you.` : fadedOut ? 'The fighting died down: neither side pressed on.' : 'Nothing more is to be won here tonight.'];
    return h('div', { class: `sf-over${pvpEnd ? ' pv' : ''}`, 'data-fightover': sum.key },
        ...kills.map(k => deathCallout({ st, f: lastFight, k, viewerId: myId })),
        h('div', { class: 'sf-verdict', role: 'status' }, h('p', { class: 'ds-voice lg' }, h('b', {}, head[0]), ' ', head[1])),
        h('div', { class: `ds-list sf-results${kills.length ? ' deadly' : ''}`, 'data-sf-result': '' },
            ...members.map(m => {
                const x = sum.per[m.id] ?? { kills: [], gain: { fame: 0, notoriety: 0, gold: 0 }, wounds: 0, gear: [], fled: false, struck: false };
                const hw = how[m.id], mineKills = kills.filter(k => k.killers.some(q => q.id === m.id)), fellTo = kills.find(k => k.victim.id === m.id);
                const gain = { fame: x.gain.fame, notor: x.gain.notoriety + mineKills.reduce((a, k) => a + k.notoriety, 0), gold: x.gain.gold + mineKills.reduce((a, k) => a + (k.gold || 0), 0) };
                const took = x.kills.length || mineKills.length || gain.fame || gain.notor || gain.gold;
                return h('div', { class: `ds-row sf-rrow${m.mine ? ' me' : ''}`, 'data-orow': m.id },
                    m.person ? pcEl({ ...m.person, dead: false }, { size: 30 }) : null,
                    h('div', { class: 'main' }, h('b', {}, m.player, m.mine ? h('small', {}, ' you') : null),
                        h('span', { class: 'sf-rchips' },
                            fellTo ? tag(fellTo.killers.length ? `Struck down by ${joinList(fellTo.killers.map(q => q.player))}` : 'Fell in the fight', 'bad fell', { 'data-fell': '' }) : hw === 'fell' ? tag('Fell in the fight', 'bad fell') : hw === 'fled' ? tag('Broke away') : null,
                            ...mineKills.map(k => tag(`Struck down ${k.victim.character}`, 'good kill')),
                            ...(x.kills.length ? [tag(`Killed ${joinList(x.kills.map(k => kindName(k.name)))}`, 'good kill')] : []),
                            ...Object.entries(gain).filter(([, v]) => v).map(([n, v]) => gainChip(n, v)),
                            ...mineKills.filter(k => k.belongings).map(k => tag(k.items.length ? `Took ${k.items.length} belonging${k.items.length === 1 ? '' : 's'}` : 'Took their belongings')),
                            !took && !fellTo && hw !== 'fell' && hw !== 'fled' ? tag(x.wounds ? `${x.wounds} wound${x.wounds === 1 ? '' : 's'} and no spoils` : peace ? 'Meant no harm' : 'Took nothing', 'dim') : null)));
            })),
        report.any ? h('details', { class: 'sf-lastround ds-group', 'data-sf-last': '' }, h('summary', {}, h('b', {}, isStory() ? 'The last round' : `The last round (${sum.lastRound})`), icon('down')),
            revealCard({ st, data, f: lastFight, report, plays, round: sum.lastRound, callouts: false }).body) : null);
}

// ---- the screen itself ----
/** The screen of a seat that is in (or was in) the fight, or null when this seat is not in it (it sees a card and the map). `ctx`: the game screen's { st, data, act, ui, render, peek, crew, answer }.
 * Returns the element to put on the layer (the scene's section, with the reveal sheet inside it when one is shown). */
export function sharedFightSheet(ctx) {
    const { st, data, act, ui, render, peek, crew, answer } = ctx;
    const f = fightOf(st, crew, data, st.ch.id);
    if (!f?.me) return null;
    ui.sfRender = render;
    const p = st.pending, rkey = revealKey(st, f);
    const showReveal = rkey && ui.revealSeen !== rkey;
    if (showReveal) {
        const report = roundReport(st, f, st.battle.reveal.round, st.ch.id), plays = playsOf(st, f, data);
        const next = p?.type === 'combat-wounds' ? 'Choose your wounds' : p?.type === 'combat-fatigue' ? 'Choose what tires' : 'On';
        const { body, title } = revealCard({ st, data, f, report, plays, round: st.battle.reveal.round });
        const frag = dsSheet({ eyebrow: `Round ${st.battle.reveal.round} · the reveal`, title, detent: 'tall', x: false, head: voiceSwitch(), body, foot: primary(next, { 'data-act': 'reveal-ok', onclick: () => { ui.revealSeen = rkey; render(); } }) });
        frag.sheet.classList.add('sf-reveal-sheet', 'sf-reveal'); frag.sheet.dataset.sf = 'reveal';
        const root = sceneEl({ st, data, ui, f, kind: 'reveal', peek, stage: stageEl({ st, data, ui, dens: (st.battle.dens ?? []).filter(d => (d.kind === 'mon' || d.kind === 'nat') && !d.partOf) }) });
        root.append(frag);
        return root;
    }
    if (p?.type === 'combat-charge') {
        const { body, foot, narr } = chargeBody({ st, data, p, ui, render, act, f });
        return sceneEl({ st, data, ui, f, kind: 'charge', peek, narr, sheet: h('div', { class: 'cb-sheet sf-sheet sf-pick', 'data-kind': 'charge' }, h('div', { class: 'sf-scroll' }, ...body), foot) });
    }
    if (p?.type === 'combat-lure') {
        const { sheet, narr } = lureSheet({ st, data, p, ui, render, act, f });
        return sceneEl({ st, data, ui, f, kind: 'lure', peek, narr, sheet });
    }
    if (p?.type?.startsWith('combat') && f.me.state === 'in') {
        return combatScene({ st, data, act, ui, render, peek, shared: { fight: f, strip: stripBlock(f) } });
    }
    if (f.me.state === 'in') {
        const w = waitSheet({ st, data, f, answer });
        w.sheet.dataset.sfWait = w.kind;
        return sceneEl({ st, data, ui, f, kind: 'wait', peek, narr: w.narr, sheet: w.sheet });
    }
    const w = watchSheet({ f, st });
    w.sheet.dataset.sfWait = 'watching';
    return sceneEl({ st, data, ui, f, kind: 'watch', peek, narr: w.narr, tone: w.tone, sheet: w.sheet, stage: stageEl({ st, data, ui, dens: [] }) });
}
