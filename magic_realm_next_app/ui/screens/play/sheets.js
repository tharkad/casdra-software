// play/sheets.js: which sheet or card is on screen: sheets() decides, from the pending question and G.ui.sheet, what the layer shows; diceSheet is the dice and Monster roll sheet.
import { nameOf } from '../../../engine/items.js';
import { nameOfClearing, tileName } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { latestRoll, rollRow } from '../../dice.js';
import { h } from '../../dom.js';
import { lengthLine, timed } from '../../gametext.js';
import { HELP } from '../info.js';
import { meetSheet, offerSheet } from '../meetui.js';
import { endOptionSheet, leaveSheet, quitSheet } from '../tableui.js';
import { abandon, act } from './actions.js';
import { combatHost, sharedFightHost } from './combat.js';
import { mc, modal, tc } from './kit.js';
import { effortSheet, learnSheet, pickSheet, restSheet, tableName, turnEndSheet } from './phases.js';
import { logSheet, overSheet, reportSheet } from './results.js';
import { drawSheet, fightOverSheet, playersSheet, sharedOverSheet, sharedRestartSheet } from './shared.js';
import { cardInfoSheet, charSheet, cursesSheet, itemSheet, spellSheet, spellsSheet } from './sheet_char.js';
import { clearingSheet, hereBlocks, searchCards } from './sheet_clearing.js';
import { bugSheet, calendarSheet, menuSheet, raceSheet, scoreSheet, setupCardSheet } from './sheet_info.js';
import { hireSheet, tradeSheet } from './sheet_trade.js';
import { prowlers, render } from './shell.js';
import { setWelcomed, vpNow, welcomed } from './state.js';

// ---- sheets ----
export function sheets(G) {
    const out = [];
    const p = G.st.pending;
    if (G.ui.sheet === 'bug') { out.push(bugSheet(G)); return out; }
    if (G.shared && G.ui.sheet === 'draw') { out.push(drawSheet(G)); return out; }
    if (G.shared && p?.type === 'restart') { out.push(sharedRestartSheet(G, p)); if (G.ui.sheet === 'menu') out.push(menuSheet(G)); return out; }
    if (G.shared && p?.type === 'end-option') { out.push(endOptionSheet(tc(G), p)); return out; }
    if (G.shared && G.ui.sheet === 'fightover') { out.push(fightOverSheet(G)); return out; }
    // A shared fight: a seat that is in it (or was, and watches) gets the shared frame; the map is one tap away at every step. Anyone else only sees the banner in the dock.
    if (G.shared && G.st.battle?.members?.[G.st.ch.id] && sharedFightHost(G, out)) return out;
    if (p?.type?.startsWith('combat')) { combatHost(G, out); return out; }
    if (G.ui.peek && G.ui.sel && p?.type === 'plan') { out.push(clearingSheet(G)); return out; }
    if (G.ui.mapPeek && G.ui.sheet === 'clearing' && G.ui.sel) { out.push(clearingSheet(G)); return out; }       // a clearing looked at while a decision waits: close it to come back to the bar
    if (p?.type === 'turn-end') out.push(turnEndSheet(G));
    else if (p?.type === 'turn-end') out.push(turnEndSheet(G));
    else if (p?.type === 'rest') out.push(restSheet(G, p));
    else if (p?.type === 'search-table') out.push(modal(G, 'Search here', h('div', { class: 'searchcards' },
        ask(`You search at ${nameOfClearing(G.st.ch.at)}.`, 'A Search phase is one roll on one table, and each place or table finds different things. Read what each could give you, then press the button at the bottom of the one you want.'),
        ...searchCards(G, p))));
    else if (p?.type === 'effort-cost') out.push(effortSheet(G, p));
    else if (p?.type === 'runes-target') out.push(modal(G, 'Read runes: which?', h('div', {},
        ask('Which runes will you read?', 'A Reading Runes search needs one target: a discovered site here that holds spell cards, or an artifact or book you carry and have active.'),
        ...p.options.map(o => h('button', { class: 'btn', 'data-target': o.key, onclick: () => act(G, { type: 'runes-target', target: o.key }) }, o.label)))));
    else if (p?.type === 'learn-spell') out.push(learnSheet(G, p));
    else if (p?.type === 'phase-pick' && G.ui.pickAct) out.push(pickSheet(G, p));
    else if (p?.type === 'enchant-choice') {
        const chitOpts = p.options.filter(x => (x.kind ?? 'chit') === 'chit'), tileOpts = p.options.filter(x => x.kind === 'tile');
        const tile = tileOpts[0]?.tile, here = tile ? G.st.placements.find(x => x.id === tile) : null;
        const other = here ? (here.side === 'enchanted' ? 'normal' : 'enchanted') : null;
        const cols = other ? [...new Set(G.data.tile(tile).sides[other].clearings.flatMap(c => c.magic ?? []))].map(c => c[0].toUpperCase() + c.slice(1)) : [];
        out.push(modal(G, 'Enchant', h('div', { class: 'restsheet' },
            ask('Which Magic chit will you enchant?', 'It turns over to its colour and stays enchanted until you play it. A colour chit supplies that colour of magic to your own spells, and is used up when played.'),
            h('div', { class: 'chitgrid' }, ...G.st.ch.chits.map(c => {
                const o = chitOpts.find(x => x.chit === c.id);
                const label = c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`;
                return h('button', { class: `chit2 ${c.type} ${c.state}${o ? ' pick' : ' off'}`, 'data-enchant-chit': c.id, disabled: !o || null, onclick: () => act(G, { type: 'enchant-choice', chit: c.id, kind: 'chit' }) },
                    h('b', {}, label), h('span', {}, '*'.repeat(c.effort) || ' '), h('small', {}, o ? o.color : c.type === 'magic' ? 'Magic' : c.type === 'move' ? 'Move' : 'Fight'));
            })),
            tileOpts.length ? h('div', { class: 'tileenchant' },
                h('h3', {}, `Or enchant the tile: ${tileName(tile)}`),
                h('p', { class: 'hint' }, `Turn ${tileName(tile)} to its ${other} side. ${other === 'enchanted' ? `Its clearings then hold ${cols.length ? cols.join(', ') : 'colours of'} magic for everyone, and some of its roads change.` : 'It goes back to its ordinary side: its roads change back and its colours go.'} The Magic chit is not used up${tileOpts.some(o => o.supply) ? ' (but a colour chit that supplies the colour is)' : ''}.`),
                ...tileOpts.map(o => h('button', { class: 'btn', 'data-enchant-tile': o.chit, onclick: () => act(G, { type: 'enchant-choice', chit: o.chit, kind: 'tile' }) }, `Use Magic ${o.numeral}${o.time}${'*'.repeat(o.effort)} (${o.color})${o.supply ? ', burning a colour chit' : ''}`))) : null)));
    }
    else if (p?.type === 'search-choice') out.push(modal(G, `${tableName(G, p.table)}: your choice`, h('div', {}, latestRoll(G.st) ? rollRow(latestRoll(G.st)) : null, ask(`You rolled ${p.roll.join('+')}: the table gives you a choice.`, 'This result lets you pick whichever entry of the table you want instead of the one the dice name. Choose the one that helps you most.'),
        ...p.options.map(r => h('button', { class: 'btn', onclick: () => act(G, { type: 'search-choice', result: r }) }, r)),
        ...hereBlocks(G))));
    else if (p?.type === 'trade' || p?.type === 'trade-offer') out.push(tradeSheet(G, p));
    else if (p?.type === 'hire' || p?.type === 'hire-offer') out.push(hireSheet(G, p));
    else if (G.shared && p?.type === 'meet-offer') { out.push(offerSheet(mc(G), p)); if (G.ui.sheet === 'players') out.push(playersSheet(G)); }
    else if (G.shared && G.ui.sheet === 'meet') out.push(meetSheet(mc(G)));
    else if (!G.ui.welcomeDone && !welcomed() && G.st.day === 1 && p?.type === 'plan') out.push(modal(G, `Welcome, ${G.st.ch.name}`, h('div', {},
        h('p', {}, `You are at the ${G.st.ch.startDwelling}${G.st.ch.items.length ? ' with ' + G.st.ch.items.map(i => nameOf(G.data, i)).join(', ') : ' with no weapon or armor yet: trade for some'}. ${lengthLine(G.st)}`),
        h('p', {}, h('b', {}, 'Each morning'), ' you plan up to four phases in secret: move, hide, search, trade, hire, rest or alert.'),
        h('p', {}, h('b', {}, 'Then the day plays out'), ', a phase at a time, and anything you meet is called out by the chits you turn up.'),
        h('p', {}, h('b', {}, 'Each evening'), ' you fight whoever shares your clearing, playing your chits in secret.'),
        h('p', { class: 'hint' }, 'Tap your gold, Fame and Notoriety for your chits and gear. The menu has the map key and a short guide.'),
        h('button', { class: 'btn primary', 'data-act': 'welcome-ok', onclick: () => { setWelcomed(); G.ui.welcomeDone = true; render(G); } }, 'Begin'))));
    else if (p?.type === 'plan' && G.st.day > 1 && G.ui.reportedDay !== G.st.day && G.ui.sheet !== 'plan') out.push(reportSheet(G));
    else if (G.ui.sheet === 'char') out.push(charSheet(G));
    else if (G.ui.sheet === 'clearing' && G.ui.sel) out.push(clearingSheet(G));
    else if (G.ui.sheet === 'menu') out.push(menuSheet(G));
    else if (G.ui.sheet === 'confirm-abandon' && !G.race) out.push(modal(G, 'Abandon this game?', h('div', { class: 'confirmbox' },
        h('p', {}, `${G.st.ch?.name ?? 'Your hero'} is on day ${G.st.day}${timed(G.st) ? ` of ${G.st.lastDay ?? 28}` : ''}, with ${G.st.ch?.gold ?? 0} gold, ${G.st.ch?.fame ?? 0} Fame and ${G.st.ch?.notoriety ?? 0} Notoriety.`),
        h('p', { class: 'hint bad' }, 'Abandoning ends this adventure for good. It stays in History as abandoned, but it cannot be picked up again.'),
        h('button', { class: 'btn primary big', 'data-act': 'keep-playing', onclick: () => { G.ui.sheet = null; render(G); } }, 'Keep playing'),
        h('button', { class: 'btn danger', 'data-act': 'confirm-abandon', onclick: () => abandon(G) }, 'Abandon this game')), { close: () => { G.ui.sheet = null; render(G); } }));
    else if (G.ui.sheet === 'race' && G.race) out.push(raceSheet(G));
    else if (G.ui.sheet === 'players' && G.shared) out.push(playersSheet(G));
    else if (G.ui.sheet === 'quit-confirm' && G.shared) out.push(quitSheet(tc(G)));
    else if (G.ui.sheet === 'leave-confirm' && G.shared) out.push(leaveSheet(tc(G), vpNow(G)));
    else if (G.ui.sheet === 'calendar') out.push(calendarSheet(G));
    else if (G.ui.sheet === 'over' && G.shared) out.push(sharedOverSheet(G));
    else if (G.ui.sheet === 'over' || G.ui.restartVp) out.push(overSheet(G));
    else if (G.ui.sheet === 'card') out.push(modal(G, G.st.ch.name, h('div', {}, G.data.art?.cards?.[G.st.ch.id] ? h('img', { class: 'cardpic', src: G.data.art.cards[G.st.ch.id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { G.ui.sheet = 'char'; render(G); } }));
    else if (G.ui.sheet === 'dice') out.push(diceSheet(G));
    else if (G.ui.sheet === 'tables') out.push(modal(G, 'Tables', h('div', { class: 'tables' },
        ...[['Meeting Table', 'meetingTable'], ['Search table', 'searchTable'], ['Missile table', 'missileTable'], ['Power of the Pit', 'pitTable']].filter(([, k]) => G.data.art?.misc?.[k])
            .flatMap(([t, k]) => [h('h3', {}, t), h('img', { class: 'tablepic', src: G.data.art.misc[k], alt: t })])), { close: () => { G.ui.sheet = null; render(G); } }));
    else if (G.ui.sheet === 'log') out.push(logSheet(G));
    else if (G.ui.sheet === 'setupcard') out.push(setupCardSheet(G));
    else if (G.ui.sheet === 'item') out.push(itemSheet(G));
    else if (G.ui.sheet === 'cardinfo') out.push(cardInfoSheet(G));
    else if (G.ui.sheet === 'curses') out.push(cursesSheet(G));
    else if (G.ui.sheet === 'spells') out.push(spellsSheet(G));
    else if (G.ui.sheet === 'spell') out.push(spellSheet(G));
    else if (G.ui.sheet === 'score') out.push(scoreSheet(G));
    else if (G.ui.sheet === 'key') out.push(modal(G, 'Map key', h('div', { class: 'key' },
        ...[['I H C G', 'Dwellings: Inn, House, Chapel, Guard house; the number beside it is the natives there'],
            ['\u25C6 \u2713', 'A site you have discovered (gold edge): you may loot it or read its runes'], ['\u25C6', 'A site chit that has turned up but is not yet discovered: Locate it first'], ['\u266A', 'A sound chit that has turned up: monsters stir in that clearing'],
            ['?', 'A face-down chit in that tile; a letter means you have peeked at it'], ['red', 'Monsters (the number is how many)'], ['blue', 'Natives'],
            ['5 \u25A0 \u25A0 \u25C6 \u266A', 'A busy clearing: when its names will not fit beside it they become one marker. The number is the clearing; each chip is a kind of thing there (red monsters, blue people, \u2302 dwellings, \u25C6 sites, \u266A sounds, with how many). Tap it to see everything in the clearing'],
            ['? on a dotted line', 'A hidden path or secret passage printed on the tile that you have not discovered yet: you cannot use it until you do'],
            ['\u25C7', 'You: solid when you are seen, hollow when you are hidden']].map(([k, t]) => h('p', {}, h('b', {}, k), ' ', t))), { close: () => { G.ui.sheet = null; render(G); } }));
    else if (G.ui.sheet === 'help') out.push(modal(G, 'How to play', h('div', {}, ...HELP.flatMap(([t, x]) => [h('h3', {}, t), h('p', {}, x)])), { close: () => { G.ui.sheet = null; render(G); } }));
    return out;
}

export function diceSheet(G) {
    const rolls = [...(G.st.rolls ?? [])].reverse().slice(0, 30);
    const mon = G.st.prowl ? h('div', { class: 'monroll' },
        h('b', {}, `Today's Monster roll: ${G.st.prowl}`),
        h('p', {}, `Monsters of row ${G.st.prowl} prowl today. At the end of your turn any that are in your tile come to you, and chits that turn up can call more.`),
        h('p', { class: 'prowlers' }, prowlers(G).join(', ') || 'None of them are left in the realm.')) : null;
    return modal(G, 'Dice', h('div', { class: 'dicesheet' }, mon,
        h('h3', {}, 'Your rolls'),
        ...(rolls.length ? rolls.map(r => h('div', { class: 'histrow' }, h('small', {}, `Day ${r.day}`), rollRow(r))) : [h('p', { class: 'hint' }, 'Nothing has been rolled yet.')])),
        { close: () => { G.ui.sheet = null; render(G); } });
}
