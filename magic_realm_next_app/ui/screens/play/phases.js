// play/phases.js: the day's phase screens: how a planned phase is worded (describeSlot, searchWhere, phaseResultLine), the end-of-turn sheet, and the small decision sheets
// (Prophecy pick, effort cost, Rest, Reading Runes).
import { chitLabel } from '../../../engine/day.js';
import { nameOfClearing, numOf, tileName, tileOf } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { nameOf } from '../../../engine/items.js';
import { h } from '../../dom.js';
import { btn, sect, twoLine, voiceSwitch } from '../../ds.js';
import { actIcon, icon } from '../../icons.js';
import { meetLines, playerOf as playerNameOf } from '../../meet.js';
import { arrivalLine, blockedLine, calloutLine, closedInLine, nativesLine, phasePrompt, quietChitsLine, turnEndStory } from '../../storyvoice.js';
import { isStory, logText, voice } from '../../voice.js';
import { act } from './actions.js';
import { ACT_LABEL, TABLE_LABEL, modal, mrChit, showToast } from './kit.js';
import { siteBlock, siteCardRow, row as siteRow } from './sheet_clearing.js';
import { mountSheet } from '../kit/common.js';
import { learnContent } from '../kit/spells.js';
import { render } from './shell.js';

// Where a Search will be made, and what the map already shows of sites on this tile: a site in another clearing is not found from here.
export function searchWhere(G, at) {
    if (!at) return null;
    const tile = tileOf(at), n = numOf(at);
    const sites = G.st.chits.filter(c => c.kind === 'site' && c.tile === tile && !c.pile && c.up);
    const away = sites.filter(c => c.num !== n);
    const there = away.map(c => `the ${c.name} is in clearing ${c.num}`).join(', ');
    return `You will search in ${nameOfClearing(at)}.${sites.some(c => c.num === n) ? '' : ' No site is revealed here yet.'}${there ? ` ${there.charAt(0).toUpperCase()}${there.slice(1)}: a search only finds what is in the clearing you are in, so Move there first.` : ''}`;
}

// a table's name for the player: the site card he found is named (Loot the Crypt of the Knight)
export function tableName(G, t) {
    if (t !== 'sitecard') return TABLE_LABEL[t] ?? t;
    const id = G.st.ch.siteCards?.[G.st.ch.at]?.[0];
    return id ? `Loot the ${G.data.treasures?.[id]?.name ?? 'site card'}` : TABLE_LABEL[t];
}

// What a phase that has just been played came to, in the current voice: the story line, or the exact words (dice and all).
export function phaseResultLine(G, n, fallback = null) {
    const l = [...G.st.log].reverse().find(x => x.k === 'phase' && x.day === G.st.day && x.t.startsWith(`Phase ${n}:`));
    if (!l) return fallback ? { text: fallback.replace(/^Phase \d+:\s*/, ''), bad: false } : null;
    const detail = l.t.replace(/^Phase \d+:\s*/, '');
    const bad = /fail to hide|you are seen|nothing at that depth|cancelled|are lost|blocked|no one here|will not|cannot/i.test(detail);
    return { text: voice() === 'story' ? logText(l, G.st) : detail, bad };
}

export function describeSlot(G, s) {
    if (!s || s.act === 'nothing') return 'Do nothing';
    if (s.act === 'move') return `Move to ${nameOfClearing(s.to).replace(/ (\d+)$/, '\u00A0$1')}`;       // the number never wraps on its own line
    if (s.act === 'search') return s.table ? `Search: ${tableName(G, s.table)}` : 'Search';
    if (s.act === 'follow') return s.who ? `Follow ${playerNameOf(G.st, s.who)}` : 'Follow';
    return ACT_LABEL[s.act] ?? s.act;
}

// What happened when his turn ended: who he is tonight (hidden or in plain sight) and why, then the chits turned up, the creatures that came, the natives that appeared, being blocked.
// The day is not retold here (the Day Overview does that, review 02-18); a blocked turn names the phases that were lost. Story tells it in sentences (storyvoice.js turn-end helpers);
// Detail keeps the rule words (the row, the Monster Roll).
export function turnEndSheet(G) {
    const t = G.st.turnEnd, story = isStory();
    const monsterIcon = n => G.data.art?.monstersColor?.[n] ?? G.data.art?.monsters?.[n] ?? null;
    const row = (cls, art, ...kids) => h('div', { class: `ds-row te-row ${cls}` }, art ? h('span', { class: /chit/.test(cls) ? 'chitwrap' : 'art' }, art) : null, h('span', { class: 'main' }, ...kids));
    const rows = [];
    const quietChits = t.chits.filter(c => !(c.summons?.length));
    for (const c of t.chits.filter(c => c.summons?.length)) {
        const counts = new Map(); for (const n of c.summons) counts.set(n, (counts.get(n) ?? 0) + 1);
        const where = c.dest === t.at ? 'to your clearing' : c.dest ? `to clearing ${numOf(c.dest)}` : '';
        const icons = h('span', { class: 'te-who' }, ...[...counts].map(([n, k]) => h('span', { class: 'who' }, monsterIcon(n) ? h('img', { class: 'ico', src: monsterIcon(n), alt: n, title: n }) : null, story && monsterIcon(n) ? null : h('b', {}, `${k > 1 ? k + ' ' : ''}${n}`))));
        if (story) rows.push(row('chit', mrChit(c), h('span', { class: 'one' }, calloutLine(c, t)), icons));
        else rows.push(row('chit', mrChit(c), h('b', {}, 'Calls out'), icons, h('small', {}, where)));
    }
    for (const c of t.chits.filter(c => !(c.summons?.length) && c.why && !/already called|not the one prowling/.test(c.why))) if (!story) rows.push(row('chit quiet', mrChit(c), h('small', {}, `Calls nothing out today: ${c.why}.`)));
    if (quietChits.length) rows.push(h('p', { class: 'ds-meta te-quiet', 'data-quiet-chits': String(quietChits.length) }, story ? quietChitsLine(quietChits) : `Call nothing out today (row not prowling; Monster Roll ${G.st.prowl ?? '?'}): ${[...new Set(quietChits.map(c => c.name ?? c.kind))].join(', ')}.`));
    for (const a of t.arrivals.filter(a => a.why === 'prowls in your tile')) rows.push(row('mon', null, story ? h('span', { class: 'one' }, arrivalLine(a)) : [h('b', {}, `${a.name} arrives`), h('small', {}, 'it was prowling in this tile and comes to your clearing')]));
    for (const nn of t.natives) rows.push(row('nat', null, story ? h('span', { class: 'one' }, nativesLine(nn)) : [h('b', {}, `The ${nn.group} appear`), h('small', {}, `${nn.count} of them, at the ${nn.at}`)]));
    if (t.blocked) rows.push(row('mon', null, story ? h('span', { class: 'one' }, blockedLine(t.blockers)) : [h('b', {}, t.blockers.length ? `Blocked by ${[...new Set(t.blockers)].join(', ')}` : 'Your turn was cut short'), h('small', {}, 'the rest of your turn was lost')]));
    if (!t.blocked && t.closedIn?.length) rows.push(row('mon', null, story ? h('span', { class: 'one' }, closedInLine(t.closedIn)) : [h('b', {}, `${[...new Set(t.closedIn)].join(', ')} ${new Set(t.closedIn).size === 1 && t.closedIn.length === 1 ? 'arrives' : 'arrive'} and ${t.closedIn.length === 1 ? 'finds' : 'find'} you`), h('small', {}, 'your turn was already over, so nothing was lost')]));
    // Blocked: the phases still to come, extra ones included, are lost with the rest of the turn.
    const lostPhases = (t.blocked ? (G.st.plan ?? []).map((s, i) => ({ i, s })).filter(x => x.i >= (t.plan?.length ?? 0) && x.s && x.s.act !== 'nothing').map(x => ({ i: x.i, what: describeSlot(G, x.s) })) : []);
    if (lostPhases.length) rows.push(h('p', { class: 'ds-meta te-lost' }, story ? `Lost with the turn: ${lostPhases.map(l => l.what).join(', ')}.` : lostPhases.map(l => `Phase ${l.i + 1} ${l.what}: lost, because you were blocked.`).join(' ')));
    // Shared Daylight (7.12.4): monsters that arrived at someone else's turn's end closed in on him before his own chit was drawn; he has no turn today.
    const noTurnLine = t.noTurn ? [...G.st.log].reverse().find(l => l.k === 'block' && l.day === G.st.day && l.who === G.st.ch.id) : null;
    const dWhy = t.noTurn ? `Creatures closed in on you before your chit was drawn, so you are seen and have no turn today. Nothing was lost but the turn.`
        : t.blocked ? `${t.blockers.length ? [...new Set(t.blockers)].join(', ') + ' closed in' : 'Your turn was cut short'}, so you are seen${lostPhases.length ? ` and your remaining ${lostPhases.length === 1 ? 'phase is' : 'phases are'} lost` : ''}.`
        : t.closedIn?.length ? `${[...new Set(t.closedIn)].join(', ')} found you after your turn was over, so you are seen. No phase was lost.`
        : t.hidden ? 'Nothing here can be set on you this evening unless you strike first.' : 'Whatever shares your clearing will fight you this evening.';
    const sv = turnEndStory(t);
    const status = h('div', { class: `te-status ds-ask ${t.hidden ? 'hidden' : 'seen'}`, 'data-no-turn': t.noTurn ? '1' : null },
        h('b', {}, story ? sv.title : t.noTurn ? 'You have no turn today' : t.hidden ? 'You are hidden' : 'You are in plain sight'), h('span', {}, story ? sv.why : dWhy),
        noTurnLine ? h('span', {}, logText(noTurnLine, G.st)) : null);
    // Blocked by other characters (7.12): told first, in a card of its own, with who did it
    const bl = G.shared && !t.noTurn ? meetLines(G.st, G.st.ch.id).filter(l => l.kind === 'blocked').at(-1) : null;
    const blockCardEl = bl && t.blocked ? h('div', { class: 'phase-result bad meet-result', role: 'status', 'data-meet-result': 'blocked' }, h('div', { class: 'pr-head' }, h('small', {}, 'Blocked')), h('p', { class: 'pr-line' }, voice() === 'story' ? bl.story : bl.text)) : null;
    const place = nameOfClearing(t.at).replace(/ (\d+)$/, '\u00A0$1');
    return modal(G, 'Turn\u2019s end', h('div', { class: 'turnend clearing' }, blockCardEl, status, rows.length ? sect('At the end of your turn') : null, ...rows),
        { kind: 'result', bare: true, eyebrow: `Day ${G.st.day} \u00B7 ${place}`, head: voiceSwitch(), cls: 'turnend-sheet',
            footer: h('div', { class: 'dayres-foot' }, h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'turn-ok', onclick: () => act(G, { type: 'continue' }) }, 'End turn')) });
}

// ---- the choice sheets (Search: which table, Search: your choice, Reading Runes): ONE question, select then commit ----
// The sheet states the situation and why (the ask), the rows say what each answer would give (a site's pile is drawn under the Loot row: what you could get), a tap only SELECTS, and the
// primary at the bottom right does it (dim, "Choose a table", until a row is chosen). A dim row stays tappable and answers with its reason.
const nbsp_ = n => String(n).replace(/ (\d+)$/, ' $1');
const sentence = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function pickSheetOf(G, { title, eyebrow, situation, why, detailWhy, opts, key, idle, verb, act: go, kind, close }) {
    const sel = opts.find(o => o.k === G.ui[key] && !o.dim)?.k ?? null, chosen = opts.find(o => o.k === sel);
    const askEl = h('div', { class: 'ds-ask' }, h('b', {}, situation), why ? h('span', { 'data-v': 'story' }, why) : null, h('span', { 'data-v': 'detail' }, detailWhy ?? why));
    const rows = opts.map(o => {
        const b = h('button', { type: 'button', class: `ds-row ds-opt${o.k === sel ? ' sel' : ''}${o.dim ? ' dim' : ''}${o.quiet ? ' quiet' : ''}`, 'data-card': o.table ?? o.k, 'data-table': o.table ?? null, 'data-opt': o.k, 'aria-pressed': o.dim ? null : String(o.k === sel), 'aria-disabled': o.dim ? 'true' : null, ...(o.attrs ?? {}),
            onclick: () => { if (o.dim) { showToast(G, o.why ?? 'Not now.'); return; } G.ui[key] = o.k; render(G); } },
            o.art ? h('span', { class: 'art' }, o.art) : null, h('span', { class: 'main' }, h('b', {}, o.title), o.line ? h('span', {}, o.dim ? (o.why ?? o.line) : o.line) : null),
            o.dim ? null : h('span', { class: 'ds-check' }, icon('check')));
        return o.extra?.length ? h('div', { class: 'ds-optgroup', 'data-group': o.k }, b, ...o.extra) : b;
    });
    const go_ = () => { G.ui[key] = null; go(chosen); };
    const primary = chosen ? btn(twoLine(verb, chosen.label ?? chosen.title), 'primary', { 'data-act': 'pick-go', onclick: go_ })
        : btn(idle.button, 'primary is-dim', { 'aria-disabled': 'true', onclick: () => showToast(G, idle.toast) });
    return modal(G, title, h('div', { class: 'pickbody' }, askEl, h('div', { class: 'ds-list ds-opts' }, ...rows)), { kind: kind === 'info' ? undefined : kind ?? 'decision', close: kind === 'info' ? close : undefined, bare: true, eyebrow, cls: 'pick-sheet',
        footer: h('div', { class: 'ds-foot-pair' },
            h('div', { class: 'ds-opt-foot' }, h('span', { class: 'lead ds-lead-text' }, idle.lead), primary),
            h('div', { class: 'ds-opt-foot peek-foot' }, h('span', { class: 'lead ds-lead-text' }, 'The map is yours.'), btn('Back to the question', 'primary', { 'data-act': 'back-to-choice' }))) });
}

// Search: which table? What the clearing holds is on the sheet: what could come of each roll.
export function searchSheet(G, p) {
    const st = G.st, at = st.ch.at, opts = p.options ?? [], place = nbsp_(nameOfClearing(at)), tile = tileOf(at), n = numOf(at);
    const sites = st.ch.onRoad ? [] : st.chits.filter(x => x.kind === 'site' && x.tile === tile && x.num === n && !x.pile && st.ch.discovered.sites.includes(x.id));
    const ground = st.abandoned?.[at] ?? [], cards = st.ch.siteCards?.[at] ?? [];
    const defs = [];
    if (opts.includes('peer')) defs.push({ k: 'peer', table: 'peer', title: 'Peer', line: 'Hidden enemies and secret paths.', art: actIcon('peer', 28) });
    if (opts.includes('locate')) defs.push({ k: 'locate', table: 'locate', title: 'Locate', line: 'Passages, clues, and any site hidden here.', art: actIcon('search', 28) });
    if (opts.includes('loot')) {
        if (sites.length) defs.push({ k: 'loot', table: 'loot', title: sites.length === 1 ? `Loot the ${sites[0].name}` : 'Loot a site here', line: sites.length === 1 ? 'Reach into the pile. The cards you could reach are lit.' : 'Reach into a pile. The cards you could reach are lit.', art: actIcon('cache', 28), extra: sites.map(c => siteBlock(G, c, { compact: true })) });
        else defs.push({ k: 'loot', table: 'loot', title: 'Loot', line: 'Nothing to open here yet.', why: 'Nothing here to loot. A site has to be found first: Locate is how.', art: actIcon('cache', 28), dim: true });
    }
    if (opts.includes('ground')) defs.push(ground.length ? { k: 'ground', table: 'ground', title: 'Take what lies here', line: `${ground.map(i => nameOf(G.data, i)).join(', ')}.`, art: actIcon('cache', 28) } : { k: 'ground', table: 'ground', title: 'Take what lies here', line: 'Nothing lies here.', why: 'Nothing lies here.', art: actIcon('cache', 28), dim: true });
    if (opts.includes('sitecard')) for (const cid of cards) defs.push({ k: `sitecard:${cid}`, table: 'sitecard', title: `Loot the ${G.data.treasures?.[cid]?.name ?? 'site card'}`, line: 'A place you found by looting: one roll on its own table.', label: G.data.treasures?.[cid]?.name, art: actIcon('cache', 28), extra: [siteCardRow(G, cid, true)] });
    if (opts.includes('runes')) defs.push({ k: 'runes', table: 'runes', title: 'Read the runes', line: 'Learn a spell from a site here, or from an artifact or book you carry.', art: actIcon('spell', 28) });
    for (const t of opts.filter(x => !['peer', 'locate', 'loot', 'ground', 'sitecard', 'runes'].includes(x))) defs.push({ k: t, table: t, title: tableName(G, t), line: '', art: actIcon('search', 28) });
    const names = sites.map(c => c.name);
    const why = names.length ? `The ${names.join(' and the ')} ${names.length === 1 ? 'lies' : 'lie'} here, found but not yet opened.` : 'Nothing here is open yet: no site has shown itself in this clearing.';
    const slot = G.ui.pmark?.i != null && G.ui.pmark.day === st.day ? G.ui.pmark.i + 1 : null;
    return pickSheetOf(G, { title: 'Which table?', eyebrow: `${slot ? `Phase ${slot} · ` : ''}Search`, situation: `Search ${place}: one roll on one table.`, why, detailWhy: `${why} Each table finds different things.`, opts: defs, key: 'tablePick',
        idle: { button: 'Choose a table', lead: 'One roll on one table.', toast: 'Pick one of the tables first.' }, verb: 'Search', act: o => act(G, { type: 'search-table', table: o.table }) });
}

// A Peer or Locate that rolled a Choice: take whichever reading helps most, one line on what each would find here.
const CHOICE_LINE = {
    'Clues and Paths': 'Learn what the hidden chits here are, and find the hidden paths.',
    'Hidden enemies and Paths': 'See any creature lurking here today, and find the hidden paths.',
    'Hidden enemies': 'See any creature lurking here today.',
    Clues: 'Learn what the hidden chits in this tile are.',
    'Passages and Clues': 'Find the secret passages out of this clearing, and learn what the hidden chits are.',
    Passages: 'Find the secret passages out of this clearing.',
    'Discover chits': 'Find the site in this clearing.',
};
export function choiceSheet(G, p) {
    const st = G.st, at = st.ch.at, tile = tileOf(at), n = numOf(at);
    const siteHere = st.chits.some(x => x.kind === 'site' && x.tile === tile && x.num === n && !x.pile && !st.ch.discovered.sites.includes(x.id));
    const opts = p.options.map(r => ({ k: r, title: r === 'Discover chits' ? 'Discover a site' : r, label: r === 'Discover chits' ? 'a site' : r, line: CHOICE_LINE[r] ?? '', art: actIcon(/enem/i.test(r) ? 'peer' : 'search', 28),
        quiet: r === 'Discover chits' && !siteHere, ...(r === 'Discover chits' && !siteHere ? { line: 'There is no site left to find here.' } : null) }));
    return pickSheetOf(G, { title: `${tableName(G, p.table)}: take your pick`, eyebrow: 'Search', situation: 'The signs point more than one way.', why: 'Take whichever reading helps you most.', opts, key: 'choicePick',
        idle: { button: 'Choose a reading', lead: 'Pick one.', toast: 'Pick one of the readings first.' }, verb: 'Take', act: o => act(G, { type: 'search-choice', result: o.k }), kind: 'decision' });
}

// Reading Runes: which runes? a site here that holds spell cards, or an artifact or book carried and active.
export function runesSheet(G, p) {
    const opts = p.options.map(o => ({ k: o.key, title: o.label, label: o.label, line: '', art: actIcon('spell', 28), attrs: { 'data-target': o.key } }));
    return pickSheetOf(G, { title: 'Which runes?', eyebrow: 'Read runes', situation: 'Which runes will you read?', why: 'A site here that keeps spell cards, or an artifact or book you carry.', opts, key: 'runesPick',
        idle: { button: 'Choose the runes', lead: 'Pick one.', toast: 'Pick the runes to read first.' }, verb: 'Read', act: o => act(G, { type: 'runes-target', target: o.k }) });
}

// Enchant: two things can come of it: a Magic chit takes its colour, or the tile turns over. Two cards, only the chits that can be enchanted (review 04-15).
export function enchantSheet(G, p) {
    const st = G.st, chitOpts = p.options.filter(x => (x.kind ?? 'chit') === 'chit'), tileOpts = p.options.filter(x => x.kind === 'tile');
    const tile = tileOpts[0]?.tile, here = tile ? st.placements.find(x => x.id === tile) : null, other = here ? (here.side === 'enchanted' ? 'normal' : 'enchanted') : null;
    const cols = other ? [...new Set(G.data.tile(tile).sides[other].clearings.flatMap(c => c.magic ?? []))].map(c => c[0].toUpperCase() + c.slice(1)) : [];
    const lab = o => `Magic ${o.numeral}${o.time}${'*'.repeat(o.effort)}`;
    const opts = [
        ...chitOpts.map(o => { const c = st.ch.chits.find(x => x.id === o.chit); return { k: `chit:${o.chit}`, title: c ? lab({ numeral: c.numeral, time: c.time, effort: c.effort }) : 'A Magic chit', label: c ? lab({ numeral: c.numeral, time: c.time, effort: c.effort }) : 'chit', line: `It will hold ${o.color ?? 'its colour of'} magic until you play it.`, art: actIcon('spell', 28), chit: o.chit, kind: 'chit', attrs: { 'data-enchant-chit': o.chit } }; }),
        ...tileOpts.map(o => ({ k: `tile:${o.chit}`, title: `Enchant the tile: ${tileName(tile)}`, label: `the ${tileName(tile)} tile`, line: other === 'enchanted' ? `It turns to its enchanted side${cols.length ? `: ${cols.join(', ')} magic fills its clearings` : ''}.` : 'It turns back to its ordinary side.', art: actIcon('fly', 28), chit: o.chit, kind: 'tile', attrs: { 'data-enchant-tile': o.chit } })),
    ];
    const pr = phasePrompt('enchant', { enchants: st.turn?.enchants ?? 0 });
    return pickSheetOf(G, { title: 'Enchant', eyebrow: 'Phase · Enchant', situation: pr.line, why: pr.why ?? 'Pick a Magic chit to fill, or the land beneath you.', detailWhy: 'A filled chit holds its colour of magic until you play it; a colour chit is used up when played.', opts, key: 'enchantPick',
        idle: { button: 'Choose what to enchant', lead: 'A chit or the tile.', toast: 'Pick a chit, or the tile, first.' }, verb: 'Enchant', act: o => act(G, { type: 'enchant-choice', chit: o.chit, kind: o.kind }) });
}

// Prophecy: the details of the phase being chosen (which table, weapon or chit), then it is sent. Move is chosen on the map (the roads are ringed): no sheet.
export function pickSheet(G, p) {
    const act2 = G.ui.pickAct, send = slot => { G.ui.pickAct = null; act(G, { type: 'pick', slot }); };
    const eyebrow = `Phase ${p.i + 1} \u00B7 ${ACT_LABEL[act2] ?? act2}`, close = () => { G.ui.pickAct = null; render(G); };
    if (act2 === 'search') {
        const LINE = { peer: 'Hidden enemies and secret paths.', locate: 'Passages, clues, and any site hidden here.', loot: 'Reach into a pile you have found.', ground: 'Take what lies here.', sitecard: 'A place you found by looting.', runes: 'Learn a spell from a site or an item.' };
        return pickSheetOf(G, { title: 'Which table?', eyebrow, situation: `Search ${nbsp_(nameOfClearing(G.st.ch.at))}: one roll on one table.`, why: 'Each table finds different things.', key: 'tablePick', kind: 'info', close,
            opts: (p.tables ?? []).map(t => ({ k: t, table: t, title: tableName(G, t), line: LINE[t] ?? '', art: actIcon(t === 'peer' ? 'peer' : t === 'loot' || t === 'ground' || t === 'sitecard' ? 'cache' : 'search', 28), attrs: { 'data-pick-table': t } })),
            idle: { button: 'Choose a table', lead: 'One roll on one table.', toast: 'Pick one of the tables first.' }, verb: 'Search', act: o => send({ act: 'search', table: o.table }) });
    }
    const mags = G.st.ch.chits.filter(c => c.type === 'magic' && c.state === 'active'), pr = phasePrompt('alert', {});
    return pickSheetOf(G, { title: 'Alert', eyebrow, situation: 'Ready your weapon, or wake a Magic chit.', why: 'An alerted Magic chit acts first, and tires at Midnight if unused.', key: 'alertPick', kind: 'info', close,
        opts: [{ k: 'weapon', title: 'Your weapon', label: 'weapon', line: 'It strikes at its own time.', art: actIcon('alert', 28) }, ...mags.map(c => ({ k: c.id, title: `Magic ${c.numeral}${c.time}${'*'.repeat(c.effort)}`, label: `Magic ${c.numeral}${c.time}`, line: 'It will answer before anything else until midnight.', art: actIcon('spell', 28), attrs: { 'data-pick-magic': c.id } }))],
        idle: { button: 'Choose one', lead: 'Weapon or Magic chit.', toast: 'Pick the weapon or a chit first.' }, verb: 'Alert', act: o => send(o.k === 'weapon' ? { act: 'alert' } : { act: 'alert', magic: o.k }) });
}

// A chit as the game shows it everywhere else (the .ds-chit tile: colour bar for Fight / Move / Magic, its value with its asterisks, one word under it). The ones that can be used now
// come first and are lit gold; the rest are dim (dashed) and stay tappable (they answer with why not).
const KIND_WORD = { move: 'Move', fight: 'Fight', magic: 'Magic' };
function chitTile(G, c, { can, sel, onTap, attr }) {
    const val = `${c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`}${'*'.repeat(c.effort)}`;
    const word = c.state === 'fatigued' ? 'tired' : c.state === 'wounded' ? 'wounded' : KIND_WORD[c.type] ?? c.type;
    const el = h('button', { type: 'button', class: `ds-chit ${c.type} pick-chit${c.state === 'fatigued' ? ' tired' : c.state === 'wounded' ? ' wounded' : ''}${can ? ' pick' : ' dim'}${sel ? ' on' : ''}`, 'aria-disabled': can ? null : 'true', 'aria-label': `${KIND_WORD[c.type] ?? c.type} ${val}, ${word}`, onclick: onTap },
        h('span', {}, val), h('small', {}, word));
    el.setAttribute(attr, c.id);
    return el;
}
const chitGrid = (G, tiles) => h('div', { class: 'ds-chitgrid' }, ...tiles);

// Cairns / Pool: tap the chit that pays an asterisk of effort (a two-asterisk chit may make change for a tired one-asterisk chit).
export function effortSheet(G, p) {
    const sameKind = (a, b) => a.type === b.type && (a.strength ?? a.numeral) === (b.strength ?? b.numeral) && a.time === b.time && a.effort === b.effort;
    const chits = G.st.ch.chits;
    const optIdx = p.options.map((o, n) => ({ o, n }));
    const payer = id => { const c = chits.find(x => x.id === id); return optIdx.filter(({ o }) => sameKind(chits.find(x => x.id === o.chit), c)); };
    const waiting = G.ui.effortChit && payer(G.ui.effortChit).length ? chits.find(c => c.id === G.ui.effortChit) : null;
    const backs = waiting ? payer(waiting.id).filter(({ o }) => o.back) : [];
    const tile = c => {
        const opts = payer(c.id), canPay = !waiting && opts.length > 0, canBack = !!waiting && backs.some(({ o }) => sameKind(chits.find(x => x.id === o.back), c)), isWaiting = waiting?.id === c.id;
        return { c, can: canPay || canBack || isWaiting, el: chitTile(G, c, { can: canPay || canBack, sel: isWaiting, attr: 'data-effort-chit',
            onTap: () => {
                if (!(canPay || canBack)) { showToast(G, isWaiting ? 'That chit is waiting for your choice below.' : 'That chit cannot pay now.'); return; }
                if (canBack) { const hit = backs.find(({ o }) => sameKind(chits.find(x => x.id === o.back), c)); G.ui.effortChit = null; act(G, { type: 'effort-cost', n: hit.n }); return; }
                const plain = opts.find(({ o }) => !o.back);
                if (plain && !opts.some(({ o }) => o.back)) { G.ui.effortChit = null; act(G, { type: 'effort-cost', n: plain.n }); return; }
                G.ui.effortChit = c.id; render(G);
            } }) };
    };
    const tiles = chits.map(tile).sort((a, b) => (b.can - a.can));
    for (const t of tiles) if (t.can && !t.el.classList.contains('on')) t.el.classList.add('pick');
    const plainOpt = waiting ? payer(waiting.id).find(({ o }) => !o.back) : null;
    const toll = p.site === 'Cairns' ? 'The Cairns take an asterisk of effort for every Loot roll, found or not.' : 'The Pool takes an asterisk of effort each time something is taken from it.';
    return modal(G, `${p.site}: pay with effort`, h('div', { class: 'restsheet' },
        waiting ? ask(`Paying with ${chitLabel(waiting)}.`, 'It has two asterisks. Tap a tired one-asterisk chit to bring it back ready, or pay with it outright.')
            : ask(toll, 'Tap the chit that pays. It stays tired until you rest it.'),
        chitGrid(G, tiles.map(t => t.el)),
        waiting ? h('div', { class: 'row2' },
            plainOpt ? h('button', { class: 'btn primary', 'data-act': 'effort-plain', onclick: () => { G.ui.effortChit = null; act(G, { type: 'effort-cost', n: plainOpt.n }); } }, 'Just tire it') : null,
            h('button', { class: 'btn', onclick: () => { G.ui.effortChit = null; render(G); } }, 'Choose a different chit')) : null), { eyebrow: 'Effort', bare: true, cls: 'chit-sheet' });
}

export function restSheet(G, p) {
    const mine = new Map();
    for (const o of p.options) (mine.get(o.chit) ?? mine.set(o.chit, []).get(o.chit)).push(o);
    const waiting = G.ui.restChit && mine.has(G.ui.restChit) ? G.ui.restChit : null;
    const changers = new Set(waiting ? mine.get(waiting).map(o => o.change).filter(Boolean) : []);
    const tile = c => {
        const canRest = !waiting && mine.has(c.id), canChange = !!waiting && changers.has(c.id), isWaiting = waiting === c.id;
        return { can: canRest || canChange || isWaiting, el: chitTile(G, c, { can: canRest || canChange, sel: isWaiting, attr: 'data-rest-chit',
            onTap: () => {
                if (!(canRest || canChange)) { showToast(G, c.state === 'active' ? 'That chit is ready already: only tired or wounded chits can be rested.' : 'That chit cannot be rested now.'); return; }
                if (canChange) { const o = mine.get(waiting).find(x => x.change === c.id); G.ui.restChit = null; act(G, { type: 'rest', chit: o.chit, change: o.change }); return; }
                const opts = mine.get(c.id), direct = opts.find(x => x.change == null);
                if (direct) { G.ui.restChit = null; act(G, { type: 'rest', chit: c.id }); } else { G.ui.restChit = c.id; render(G); }
            } }) };
    };
    const tiles = G.st.ch.chits.map(tile).sort((a, b) => (b.can - a.can));
    const target = waiting ? G.st.ch.chits.find(c => c.id === waiting) : null;
    const pr = phasePrompt('rest');
    const askEl = waiting
        ? ask(`Making change for ${chitLabel(target)}.`, 'A chit worth two asterisks costs two of rest. Tap the ready one-asterisk chit you will tire in exchange.')
        : h('div', { class: 'ds-ask' }, h('b', {}, `${pr.line} Tap the chit you want back.`), h('span', { 'data-v': 'story' }, 'A tired chit comes back ready, or a wounded one heals. The lit ones can be rested now.'),
            h('span', { 'data-v': 'detail' }, 'One Rest returns one asterisk of effort: a tired chit becomes ready again, or a wounded chit is healed (one with asterisks comes back tired).'));
    return modal(G, 'Rest', h('div', { class: 'restsheet' }, askEl, chitGrid(G, tiles.map(t => t.el)),
        waiting ? h('button', { class: 'btn', onclick: () => { G.ui.restChit = null; render(G); } }, 'Choose a different chit') : null), { eyebrow: 'Phase · Rest', bare: true, cls: 'chit-sheet' });
}

// Reading Runes found a card he can learn.
// Reading Runes: the runes show a spell (P2: built in screens/kit/spells.js).
export function learnSheet(G, p) { return mountSheet(G, learnContent(G, p)); }
