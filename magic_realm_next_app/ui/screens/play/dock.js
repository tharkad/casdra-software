// play/dock.js: the dock under the map: renderDock() builds the drawer (notes, result card, decision, buttons) for whatever the game is waiting for; wireDrawer() is its pull-down behaviour.
import { WEIGHT_WORDS } from '../../../engine/core.js';
import { phasesFor } from '../../../engine/day.js';
import { nameOf, summaryOf, weightOf } from '../../../engine/items.js';
import { energizeOptions } from '../../../engine/magic/energize.js';
import { heldOptions } from '../../../engine/magic/phase.js';
import { ATTACK_SPELLS, castOptions, dayColors } from '../../../engine/spells.js';
import { nameOfClearing, tileName } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { h } from '../../dom.js';
import { isMeetLine, meetButton, playerOf as playerNameOf } from '../../meet.js';
import { turnOrderLine } from '../../party.js';
import { playersStrip } from '../../shared_ui.js';
import { logText, voice } from '../../voice.js';
import { blockCard, followCard, newDraft as newMeetDraft, resultCards, waitingCard, windowCard } from '../meetui.js';
import { autopilotRecord, awayCard, pendingVote, tableCards, welcomeCard } from '../tableui.js';
import { act } from './actions.js';
import { ACT_LABEL, CURSE_PLAIN, colorChip, ico, mc, tc } from './kit.js';
import { describeSlot, phaseResultLine, searchWhere } from './phases.js';
import { newDraft, planBar, planPanel } from './plan.js';
import { deathBox } from './results.js';
import { sharedBanner, showPlayer } from './shared.js';
import { fxEnds } from './sheet_char.js';
import { prowlers, render } from './shell.js';
import { backSeen, logEnd, markBackSeen, myId, newMeetLines } from './state.js';

export function renderDock(G) {
    const p = G.st.pending;
    const where = nameOfClearing(G.st.ch.at);
    const magicNow = dayColors(G.st.day, G.st.lastDay ?? 28);
    const magicBar = magicNow.length ? h('button', { class: 'magicbar', 'data-act': 'magic-day', onclick: () => { G.ui.sheet = 'calendar'; render(G); } },
        h('span', {}, 'The land is filled with'), ...magicNow.map(c => colorChip(c)), h('span', { class: 'until' }, 'until midnight')) : null;
    const cursesOn = G.st.ch.curses ?? [];
    const curseJustFell = (G.st.finds ?? []).some(f => f.kind === 'curse' && f.n > (G.ui.findSeen ?? G.st.findSeq ?? 0));
    const curseBar = cursesOn.length && !curseJustFell ? h('button', { class: 'cursebar', 'data-act': 'curses', 'aria-label': `You are cursed: ${cursesOn.join(', ')}. Tap for what it does`, onclick: () => { G.ui.sheet = 'curses'; render(G); } },
        h('span', { class: 'skull', 'aria-hidden': 'true' }, '\u2620'),
        h('span', { class: 'rl' }, h('small', { class: 'gl' }, 'YOU ARE CURSED'), ...cursesOn.map(n => h('span', { class: 'cl' }, h('b', {}, n), ' ', CURSE_PLAIN[n] ?? ''))),
        h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A')) : null;
    // a spell that could be cast tonight: said during the day so it is not a surprise that the evening stops to ask
    const tonight = (G.st.period === 'daylight' || G.st.period === 'birdsong') && !G.st.combat && !G.st.ch.onRoad ? castOptions(G.st, G.data).filter(o => (o.useful || o.quiet) && !ATTACK_SPELLS[o.spell]) : [];
    const tonightBar = tonight.length ? h('p', { class: 'hint tonight', 'data-act': 'cast-tonight' }, `\u2728 You can cast ${[...new Set(tonight.map(o => o.name))].join(', ')} this evening: the game will stop and ask you, even if nothing attacks.`) : null;
    const info = h('div', { class: 'where2' }, h('span', { class: 'you' }, 'You are at'), h('b', {}, G.st.ch.onRoad ? 'on the road' : where), G.st.ch.hidden ? h('em', {}, 'hidden') : h('em', { class: 'seen' }, 'visible'));
    const recent0 = [...G.st.log].reverse().filter(l => l.k !== 'day' && l.k !== 'roll' && !(G.shared && isMeetLine(l))).slice(0, 3).reverse();
    G.ui.gainSeen ??= G.st.gainSeq ?? 0;
    const fresh = (G.st.gains ?? []).filter(x => x.n > G.ui.gainSeen && G.st.ch.items.some(i => i.uid === x.uid)).map(x => G.st.ch.items.find(i => i.uid === x.uid));
    const gainBars = fresh.map(it => {
        const nm = nameOf(G.data, it);
        return h('button', { class: 'gainbar', 'data-act': 'gain', 'data-item': it.uid, 'aria-label': `You found ${nm}: tap for details`, onclick: () => { G.ui.itemUid = it.uid; G.ui.itemFrom = 'dock'; G.ui.sheet = 'item'; render(G); } },
            ico(G, nm), h('span', { class: 'rl' }, h('small', { class: 'gl' }, 'YOU GOT'), h('b', {}, nm), h('small', {}, summaryOf(G.data, it))),
            h('em', {}, `${WEIGHT_WORDS[weightOf(G.data, it)] ?? ''}`), h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'));
    });
    G.ui.findSeen ??= G.st.findSeq ?? 0;
    const findBars = (G.st.finds ?? []).filter(f => f.n > G.ui.findSeen).map(f => {
        const isCard = f.kind === 'card';
        if (f.kind === 'curse') return h('button', { class: 'gainbar find curse', 'data-act': 'curse-new', onclick: () => { G.ui.sheet = 'curses'; render(G); } },
            h('span', { class: 'skull', 'aria-hidden': 'true' }, '\u2620'),
            h('span', { class: 'rl' }, h('small', { class: 'gl' }, 'A CURSE HAS FALLEN ON YOU'), h('b', {}, f.name), h('small', {}, CURSE_PLAIN[f.name] ?? f.effect)),
            h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'));
        return h('button', { class: 'gainbar find', 'data-act': 'find', onclick: () => { if (isCard) { G.ui.cardId = f.id; G.ui.sheet = 'cardinfo'; } else { G.ui.sel = f.clearing; G.ui.sheet = 'clearing'; } render(G); } },
            h('span', { class: 'rl' }, h('small', { class: 'gl' }, isCard ? 'YOU FOUND' : 'YOU DISCOVERED'), h('b', {}, f.name ?? 'a site'), h('small', {}, isCard ? 'Tap to read the card' : `at ${nameOfClearing(f.clearing)}: tap for what is there`)),
            h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'));
    });
    const gainNames = fresh.map(it => nameOf(G.data, it)).concat((G.st.finds ?? []).filter(f => f.n > G.ui.findSeen).map(f => f.name).filter(Boolean));
    // a line that names a new item is dropped (its gain box says it), except a deal's own line: that one says what was paid
    const recent = recent0.filter(l => l.k === 'trade' || !gainNames.some(n => logText(l).includes(n)));
    const prowl = G.st.period === 'daylight' && G.st.prowl ? h('button', { class: 'prowl', 'data-act': 'prowl', onclick: () => { G.ui.sheet = 'dice'; render(G); } },
        h('b', {}, voice() === 'story' ? 'The wilds stir' : `Monster roll ${G.st.prowl}`), h('span', {}, prowlers(G).join(', ') || 'no one stirs'),
        G.st.day % 7 === 0 ? h('small', { class: 'weekend' }, (voice() === 'story' ? 'The week turns: the creatures of the wilds are called home to where they began, the slain among them.' : `Week\u2019s end: row ${G.st.prowl} was called back to where it began, the slain among them.`)) : null) : null;
    // What the drawer shows: `body` is everything that explains (it slides away), `actions` is what you press (it stays).
    let body = null, actions = null;
    const banner = G.shared && !p ? sharedBanner(G) : null;
    if (!p) body = G.shared ? null : h('div', { class: 'note' }, 'Working...');
    else if (p.type === 'plan' && G.ui.sheet === 'plan' && G.ui.draft) { G.dock.classList.remove('closed'); G.dock.replaceChildren(h('div', { class: 'dock-plan' }, G.ui.planCollapsed ? planBar(G) : planPanel(G))); return; }
    else if (p.type === 'plan') {
        body = ask(`Day ${G.st.day}, Birdsong: plan your day.`, `You choose one action for each of your ${phasesFor(G.st, G.data, []).total} phases now, in secret; they are then played in order after the Monster Roll.${G.st.ch.onRoad ? ' You are still out on the road after running away, so your first phase is a Move to one end of it, already set for you.' : ''}`, { compact: true });
        actions = h('button', { class: 'btn primary big', 'data-act': 'plan', onclick: () => { G.ui.draft ??= newDraft(G); G.ui.sheet = 'plan'; G.ui.planCollapsed = false; render(G); } }, 'Plan your day');
    } else if (p.type === 'phase') {
        const slot = G.st.plan[p.i];
        body = h('div', { class: 'phase' },
            ask(`Phase ${p.i + 1} of ${G.st.plan.length}: ${describeSlot(G, slot)}.`, 'This is the action you planned. Press the button to carry it out. Anything that needs your decision will stop and ask.', { compact: true }),
            slot?.act === 'search' && !G.st.ch.onRoad ? h('p', { class: 'hint', 'data-hint': 'search-where' }, searchWhere(G, G.st.ch.at)) : null);
        actions = h('div', { class: 'row-end' },
            h('button', { class: 'btn primary', 'data-act': 'next', onclick: () => act(G, { type: 'next' }) }, describeSlot(G, slot)));
    } else if (p.type === 'phase-pick') {
        // Prophecy: no plan was recorded; each phase is chosen as it comes (the printed rule: he learns his day as he lives it)
        body = h('div', { class: 'phase' },
            ask(`Phase ${p.i + 1}: choose what you do (Prophecy).`, 'Under Prophecy you do not record your day in advance: you pick each phase as it comes. Move, Hide, Search, Rest, Alert and the rest work as usual.'),
            h('div', { class: 'phase-info' }, h('b', {}, `Phase ${p.i + 1}`), h('span', {}, `${p.regularLeft ?? '?'} ordinary phases left${p.extrasLeft ? `, ${p.extrasLeft} extra` : ''}`)));
        actions = h('div', { class: 'pickrow' }, ...p.acts.map(a => h('button', { class: `btn${a.kind === 'extra' ? '' : ' primary'}`, 'data-pick-act': a.act, onclick: () => { G.ui.pickAct = G.ui.pickAct === a.act ? null : a.act; render(G); } }, ACT_LABEL[a.act] ?? a.act)),
            h('button', { class: 'btn', 'data-act': 'next', onclick: () => act(G, { type: 'next' }) }, 'Follow the suggestion'));
    } else if (p.type === 'over') {
        body = G.shared ? h('div', { class: 'note' }, 'The game is over.') : G.st.ch.dead || G.st.over?.reason === 'died' ? deathBox(G) : null;
        actions = h('button', { class: 'btn primary big', 'data-act': 'see-result', onclick: () => { G.ui.sheet = 'over'; render(G); } }, 'See your result');
    } else if (p.type === 'restart') {
        body = ask('You have fallen.', 'Choose who returns and set new goals; then the day goes on.', { compact: true });
        actions = null;
    } else if (G.shared && p.type === 'end-option') {
        body = ask('Sudden Death: you have met every goal.', 'The game waits for you to say whether it ends at this Midnight. The question is on screen; the map is one tap away.', { compact: true });
    } else if (G.shared && p.type === 'meet-offer') {
        body = ask(`${playerNameOf(G.st, p.from)} has made you an offer.`, 'The offer is on screen. Look at it, then accept or decline; the map is one tap away.', { compact: true });
    } else if (G.shared && (p.type === 'meet-block' || p.type === 'meet-follow' || p.type === 'meet-window')) {
        if (p.type === 'meet-window' && G.ui.windowDay !== G.st.day) { G.ui.windowDay = G.st.day; G.ui.windowLog = logEnd(G); }          // (what counts as "traded" starts when the window opens)
        const k = (p.type === 'meet-block' ? blockCard : p.type === 'meet-follow' ? followCard : windowCard)(mc(G), p);
        body = k.body; actions = k.actions;
    } else body = h('div', { class: 'note' }, 'Decision needed...');
    // Meeting other characters: my own offer is open (the game waits and says so), or I may meet someone now
    let meetBtn = null;
    if (G.shared && G.ms) {
        if (G.ms.made && (!p || p.type === 'phase' || p.type === 'phase-pick' || p.type === 'meet-window')) { const w = waitingCard(mc(G)); body = w.body; actions = w.actions; }
        else if (!p && G.crew.find(x => x.mine)?.status === 'following') {
            // I follow someone: his turn is mine. I may stop at the start of any of his activities (the game says so if it is not the moment)
            actions = h('button', { class: 'btn', 'data-act': 'stop-follow', onclick: () => act(G, { type: 'meet', kind: 'stop-follow' }) }, `Stop following ${playerNameOf(G.st, G.st.follows?.[G.st.ch.id] ?? '')}`.trim());
        }
        else if (p?.type === 'phase' && G.st.ch.hidden && Object.values(G.st.follows ?? {}).includes(G.st.ch.id) && !G.ms.made) {
            // a hidden guide may leave behind followers who have not found hidden enemies (7.11.6a.1); the game says if every one has
            const g = playerNameOf(G.st, Object.keys(G.st.follows).find(f => G.st.follows[f] === G.st.ch.id));
            const lb = h('button', { class: 'btn meetbtn', 'data-act': 'ditch', onclick: () => act(G, { type: 'meet', kind: 'ditch' }) }, 'Leave them behind');
            body = h('div', { class: 'dock-stack' }, body, h('p', { class: 'hint', 'data-hint': 'ditch' }, `You are hidden and ${g} follows you. You may slip away and leave ${g} behind, unless they have found hidden enemies today.`));
            actions = h('div', { class: 'meet-row' }, lb, actions);
        }
        else if (G.ms.partners.length && (!p || p.type === 'phase' || p.type === 'phase-pick')) {
            const mb = meetButton(G.ms, G.st, myId(G));
            meetBtn = h('button', { class: 'btn meetbtn', 'data-act': 'meet', 'data-meet-certain': mb.certain ? '1' : '0', 'aria-label': `Meet ${mb.names}: give or trade`, onclick: () => { G.ui.meet = null; G.ui.sheet = 'meet'; render(G); } }, mb.label);
            actions = actions ? h('div', { class: 'meet-row' }, meetBtn, actions) : meetBtn;
        }
    }

    // The drawer: a grabber on top, then what explains, then what you press. Pulled down, only the grabber and the buttons are left.
    const newCount = findBars.length + gainBars.length + (curseJustFell ? 1 : 0);
    // Anything that comes with a note (a find, an item, a curse, the day's Monster roll) brings the drawer up if it was pulled down. A find or an item
    // sends it back to where he had left it once it is old news; the Monster roll just opens it and leaves it to him.
    const transient = [...fresh.map(i => `g${i.uid}`), ...(G.st.finds ?? []).filter(f => f.n > G.ui.findSeen).map(f => `f${f.n}`), ...(curseJustFell ? ['c'] : [])];
    G.ui.prowlPopped ??= G.st.period === 'daylight' ? G.st.day : 0;                 // loading a game in the middle of a day is not news
    const prowlNew = G.st.period === 'daylight' && !!G.st.prowl && G.ui.prowlPopped !== G.st.day;
    const sig = transient.join(',');
    if (G.ui.dockOpen === false && ((transient.length && sig !== G.ui.attnSig) || prowlNew)) {
        G.ui.dockPref = false; G.ui.dockOpen = true; G.ui.dockAuto = transient.length > 0 && !prowlNew;
    } else if (G.ui.dockAuto && !transient.length) { G.ui.dockOpen = G.ui.dockPref ?? false; G.ui.dockAuto = false; }
    if (prowlNew) G.ui.prowlPopped = G.st.day;
    G.ui.attnSig = sig;
    // The phase that was just played is told first and large, before the next one is offered; the drawer opens for it once, so a pulled-down drawer cannot hide what happened.
    const rn = (p?.type === 'phase' || p?.type === 'phase-pick') && p.i > 0 ? p.i : null, rkey = rn ? `${G.st.day}:${rn}` : null;
    if (rkey && G.ui.resultKey !== rkey) { G.ui.resultKey = rkey; G.ui.dockOpen = true; }
    const rl = rn ? phaseResultLine(G, rn) : null;
    const resultCard = rl ? h('div', { class: `phase-result ${rl.bad ? 'bad' : 'good'}`, role: 'status', 'data-phase-result': String(rn) },
        h('div', { class: 'pr-head' }, h('small', {}, `Phase ${rn}${G.st.plan?.[rn - 1] ? `: ${describeSlot(G, G.st.plan[rn - 1])}` : ''}`)),
        h('p', { class: 'pr-line' }, rl.text)) : null;
    const open = G.ui.dockOpen !== false;
    // spells in force: one line, tap for the card text, what is tied to what, and when each ends
    const fxOn = (G.st.fx ?? []).filter(f => f.state !== 'done');
    const spellBar = fxOn.length ? h('button', { class: 'spellbar', 'data-act': 'spells', 'aria-label': `Spells in effect: ${fxOn.map(f => G.data.spells?.[f.spell]?.name ?? f.spell).join(', ')}. Tap for details`, onclick: () => { G.ui.sheet = 'spells'; render(G); } },
        h('span', { class: 'rl' }, h('small', { class: 'gl' }, 'SPELLS IN EFFECT'), ...fxOn.map(f => h('span', { class: 'cl' }, h('b', {}, G.data.spells?.[f.spell]?.name ?? f.spell), ` ${fxEnds(G, f)}`))),
        h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A')) : null;
    // free spell actions at the start of a phase: wake a permanent spell with a colour chit, or use a Phase spell he is holding
    const freeActs = p && (p.type === 'phase' || p.type === 'plan') ? [
        ...energizeOptions(G.st, G.data).map(o => h('button', { class: 'btn spellact', 'data-act': 'energize', 'data-fx': o.fx, onclick: () => act(G, { type: 'energize', fx: o.fx, colorChit: o.chits[0] }) },
            h('span', { class: 'col' }, h('b', {}, `Energize ${o.name}`), h('small', {}, `Burn an enchanted chit (${o.chits.length} held) to wake it: it works until Midnight`)))),
        ...(p.type === 'phase' ? heldOptions(G.st, G.data).map(o => h('button', { class: 'btn spellact', 'data-act': 'protect', 'data-fx': o.fx, onclick: () => act(G, { type: 'protect', fx: o.fx }) },
            h('span', { class: 'col' }, h('b', {}, `Use ${o.name}`), h('small', {}, 'It lasts through this phase (it also holds off your own helpful spells)')))) : []),
    ] : [];
    const spellActs = freeActs.length ? h('div', { class: 'spellacts' }, ...freeActs) : null;
    // what he has become: a creature (Absorb Essence, Transform), mist, or a flier
    const formBar = G.st.ch.morph ? h('div', { class: 'formbar', 'data-act': 'form' }, h('small', { class: 'gl' }, 'YOU ARE A CREATURE'), h('b', {}, G.st.ch.morph.creature?.name ?? 'a creature'), h('span', {}, 'You cannot cast, trade, hire or enchant until the spell ends.'))
        : G.st.ch.mist ? h('div', { class: 'formbar mist', 'data-act': 'form' }, h('small', { class: 'gl' }, 'YOU ARE MIST'), h('span', {}, `You can only Move and Hide; nothing can block you. Your ${G.st.ch.mist.items?.length ?? 0} things and ${G.st.ch.mist.gold ?? 0} gold are held in the spell.`))
        : G.st.ch.flying ? h('div', { class: 'formbar fly', 'data-act': 'form' }, h('small', { class: 'gl' }, 'YOU ARE FLYING'), h('span', {}, `Over ${tileName(G.st.ch.flying.tile)}. You land at a clearing on it by a die roll.`)) : null;
    const orderLine = G.shared && !banner ? turnOrderLine(G.st) : null;
    const mlines = newMeetLines(G);
    if (mlines.length && G.ui.meetKey !== mlines.at(-1).i) { G.ui.meetKey = mlines.at(-1).i; G.ui.dockOpen = true; }              // a deal, a block, a spy's notice: told first, and the drawer opens for it once
    const meetCards = resultCards(mc(G), mlines);
    // the table's agreements come first: a vote I must answer, that I am marked away, that I am welcome back (each opens the drawer once)
    let tableEls = [];
    if (G.shared && G.answer) {
        const tcx = tc(G), pv = pendingVote(G.answer, G.mySeat), rec = autopilotRecord(G.st, playerNameOf(G.st, G.st.ch.id)), back = !G.answer.you?.away && rec.back >= 0 && rec.key && !backSeen(G, rec.key) ? rec : null;
        const note = G.ui.tableNote ? h('div', { class: 'tb-card note', 'data-table-card': 'note', role: 'status' }, ask(G.ui.tableNote.text, null, { compact: true }),
            h('div', { class: 'row-end' }, h('button', { class: 'btn', 'data-act': 'note-ok', onclick: () => { G.ui.tableNote = null; render(G); } }, 'Got it'))) : null;
        tableEls = [...(note ? [note] : []), ...(G.answer.you?.away ? [awayCard(tcx)] : []), ...(back ? [welcomeCard(tcx, back, () => { markBackSeen(G, back.key); render(G); })] : []), ...tableCards(tcx)];
        const nk = (pv?.key ?? '') + (G.answer.you?.away ? '|away' : '') + (back ? `|back${back.key}` : '') + (G.ui.tableNote ? `|note${G.ui.tableNote.text}` : '');
        if (nk && G.ui.tableKey !== nk) { G.ui.tableKey = nk; G.ui.dockOpen = true; }
    }
    // a decision about another character (block, follow, the trade window) comes first, before the day's other notes: it is what the game waits for
    const decisionFirst = !!(G.shared && ((p && /^meet-(block|follow|window)$/.test(p.type)) || G.ms?.made));
    const items = [...tableEls, ...meetCards, decisionFirst ? body : null, banner, resultCard, curseBar, formBar, spellBar, spellActs, magicBar, info, tonightBar, ...findBars, ...gainBars, prowl, recent.length && !resultCard && !banner ? h('div', { class: 'lastlog' }, ...recent.map((l, i) => h('p', { class: i === recent.length - 1 ? 'new' : '' }, logText(l)))) : null, decisionFirst ? null : body,
        orderLine ? h('p', { class: 'wc-order', 'data-order': '' }, orderLine) : null].filter(Boolean);
    const peek = `${G.st.ch.onRoad ? 'On the road' : where} \u00B7 ${G.st.ch.hidden ? 'hidden' : 'visible'}`;
    const grab = h('button', { class: 'grab', 'data-act': 'dock-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'dock-body',
        'aria-label': open ? 'Details panel, open. Press to slide it away' : `Details panel, closed${newCount ? `, ${newCount} new` : ''}. Press to open it` },
        h('span', { class: 'grip', 'aria-hidden': 'true' }),
        h('span', { class: 'peek' }, h('span', { class: 'peek-t' }, peek), newCount ? h('span', { class: 'badge', 'aria-hidden': 'true' }, String(newCount)) : null,
            h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u2303')));
    const wrap = h('div', { class: `dock-body${open ? '' : ' closed'}`, id: 'dock-body' }, h('div', { class: 'dock-inner' }, ...items));
    G.dock.classList.toggle('closed', !open);
    const waitingIds = new Set((G.answer?.waitingFor ?? []).map(w => w.character));
    const meetIds = new Set(G.shared && G.ms ? G.ms.partners.map(x => x.id) : []);
    const tapChip = x => { if (meetIds.has(x.id) && !G.ms.made) { G.ui.meet = newMeetDraft(); G.ui.meet.to = x.id; G.ui.sheet = 'meet'; render(G); } else showPlayer(G, x); };
    G.dock.replaceChildren(...[G.shared ? playersStrip(G.crew, { onTap: tapChip, waitingIds, meetIds }) : null, grab, wrap, actions ? h('div', { class: 'dock-actions' }, actions) : null].filter(Boolean));
    wireDrawer(G, grab, wrap);
}

// The drawer's behaviour is the usual bottom sheet: tap the grabber or drag it; a swipe down on the content, when it is at its top, closes it.
// It follows the finger and settles on whichever end is nearer, or the one the flick was heading for.
function wireDrawer(G, grab, wrap) {
    const inner = wrap.firstChild, reduce = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const fullH = () => { const had = wrap.classList.contains('closed'); wrap.classList.remove('closed'); const keep = wrap.style.height; wrap.style.height = 'auto'; const hh = wrap.getBoundingClientRect().height; wrap.style.height = keep; if (had) wrap.classList.add('closed'); return hh; };
    const remember = o => { try { localStorage.setItem('mr-dock-open', o ? '1' : '0'); } catch { /* ignore */ } };
    const settle = (o, from = null) => {
        G.ui.dockOpen = o; G.ui.dockAuto = false; G.ui.dockPref = o; remember(o);
        const target = o ? fullH() : 0;
        G.dock.classList.toggle('closed', !o);
        grab.setAttribute('aria-expanded', o ? 'true' : 'false');
        wrap.classList.remove('closed'); wrap.classList.remove('dragging');
        if (reduce) { wrap.style.height = ''; wrap.classList.toggle('closed', !o); return; }
        if (from != null) wrap.style.height = from + 'px';
        else wrap.style.height = (o ? 0 : fullH()) + 'px';
        void wrap.offsetHeight;                              // start the transition from where it is
        wrap.style.height = target + 'px';
        const done = () => { wrap.removeEventListener('transitionend', done); wrap.style.height = ''; wrap.classList.toggle('closed', !o); render(G); };
        wrap.addEventListener('transitionend', done);
        setTimeout(() => { if (wrap.style.height !== '') done(); }, 400);
    };
    grab.addEventListener('click', () => { if (grab._dragged) return; settle(!(G.ui.dockOpen !== false)); });
    // dragging the grabber
    let y0 = null, h0 = 0, full = 0, moved = false, lastY = 0, lastT = 0, vel = 0;
    grab.addEventListener('pointerdown', e => {
        if (e.button) return;
        y0 = e.clientY; moved = false; full = fullH(); h0 = G.ui.dockOpen !== false ? wrap.getBoundingClientRect().height : 0; lastY = e.clientY; lastT = e.timeStamp; vel = 0;
        try { grab.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    grab.addEventListener('pointermove', e => {
        if (y0 == null) return;
        const dy = e.clientY - y0;
        if (!moved && Math.abs(dy) < 5) return;
        if (!moved) { moved = true; wrap.classList.remove('closed'); wrap.classList.add('dragging'); }
        vel = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT); lastY = e.clientY; lastT = e.timeStamp;
        wrap.style.height = Math.max(0, Math.min(full, h0 - dy)) + 'px';
    });
    const release = () => {
        if (y0 == null) return;
        y0 = null;
        if (!moved) return;
        grab._dragged = true; setTimeout(() => { grab._dragged = false; }, 50);
        const cur = wrap.getBoundingClientRect().height;
        settle(vel < -0.35 ? true : vel > 0.35 ? false : cur > full / 2, cur);
    };
    grab.addEventListener('pointerup', release); grab.addEventListener('pointercancel', release);
    // a swipe down from the top of the content
    let ty = null, tx = 0;
    inner.addEventListener('touchstart', e => { ty = inner.scrollTop <= 0 ? e.touches[0].clientY : null; tx = e.touches[0].clientX; }, { passive: true });
    inner.addEventListener('touchmove', e => {
        if (ty == null) return;
        const dy = e.touches[0].clientY - ty, dx = Math.abs(e.touches[0].clientX - tx);
        if (dy > 36 && dy > dx * 1.5) { ty = null; settle(false); }
    }, { passive: true });
}
