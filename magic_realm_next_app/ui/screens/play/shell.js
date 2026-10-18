// play/shell.js: the render loop and the layout it fills: render() redraws the status strip, the map, the dice tray, the dock and the sheet layer; mapModel() is what the map is told to draw.
import { earned } from '../../../engine/score.js';
import { dayColors } from '../../../engine/spells.js';
import { isCave, roadsFrom } from '../../../engine/world.js';
import { latestRoll, rollRow } from '../../dice.js';
import { h } from '../../dom.js';
import { dayCap } from '../../gametext.js';
import { meetState, playerOf as playerNameOf } from '../../meet.js';
import { party, markers as partyMarkers } from '../../party.js';
import { moveOptions, planState } from '../../planlogic.js';
import { voiceChip } from '../../voice.js';
import { revealKey } from '../sharedfight.js';
import { renderDock } from './dock.js';
import { COLOR_DOT, icon, voidBy } from './kit.js';
import { setMove } from './plan.js';
import { maybeShowDraw, maybeShowFightOver, sharedCamera, showPlayer } from './shared.js';
import { sheets } from './sheets.js';
import { myId, vpNow } from './state.js';

function openDice(G) { G.ui.sheet = G.ui.sheet === 'dice' ? null : 'dice'; render(G); }

// ---- model for the map ----
export function mapModel(G) {
    const art = G.data.art;
    const tokens = {}, chitsByTile = {};
    const add = (id, t) => (tokens[id] ??= []).push(t);
    const KINDNAME = { 'lost-city': 'Lost City', 'lost-castle': 'Lost Castle' };
    // every chit of a tile keeps its own spot on the picture, even while it is shown at its clearing instead
    const slotOf = {}, nextSlot = {};
    for (const c of G.st.chits) if (!c.pile && c.tile && !(c.kind === 'warning' && c.letter === 'V')) slotOf[c.id] = (nextSlot[c.tile] = (nextSlot[c.tile] ?? -1) + 1);
    for (const c of G.st.chits) {
        if (c.pile || !c.tile) continue;
        if (c.kind === 'warning' && c.letter === 'V') continue;
        const known = c.up || G.st.ch.seen.includes(c.id);
        const name = KINDNAME[c.kind] ?? c.name;
        // a site he has DISCOVERED (Locate, Discover chits) carries a tick and a gold edge: it may be looted. A site chit merely turned up does not.
        const disc = c.kind === 'site' && G.st.ch.discovered.sites.includes(c.id);
        if (c.up && c.clearing && (c.kind === 'sound' || c.kind === 'site')) { add(c.tile + c.clearing, { k: c.kind, disc, label: c.kind === 'sound' ? `\u266A ${name}` : `\u25C6 ${name}${disc ? ' \u2713' : ''}` }); continue; }
        if (!c.up && c.kind === 'site' && disc) { add(c.tile + c.num, { k: 'site', disc: true, label: `\u25C6 ${name} \u2713` }); continue; }
        (chitsByTile[c.tile] ??= []).push({ up: known, name: known ? (c.kind === 'sound' ? `${name} ${c.num}` : name) : '?', id: c.id, kind: known ? c.kind : null, slot: slotOf[c.id] });
    }
    // a site card he found by looting (the Crypt of the Knight, the Toadstool Circle...) is a place in that clearing, and shows like a discovered site
    for (const [at, ids] of Object.entries(G.st.ch.siteCards ?? {})) for (const id of ids) add(at, { k: 'site', disc: true, label: `\u25C6 ${G.data.treasures?.[id]?.name ?? id} \u2713` });
    for (const d of G.st.dwellings) {
        const here = d.at === G.st.ch.at;
        add(d.at, { k: 'dwelling', label: d.kind, img: art?.dwellings?.[d.kind] ?? null });
    }
    // creatures by name: "Wolf x2", natives by group
    const group = (list, key) => { const m = {}; for (const x of list) { const k = x.loc.c + '|' + key(x); (m[k] ??= { at: x.loc.c, name: key(x), n: 0 }).n++; } return Object.values(m); };
    const mons = group(G.st.mons.filter(m => !m.dead && m.loc?.c), m => G.data.monsters[m.id].name);
    const nats = group(G.st.nats.filter(n => !n.dead && !n.hired && n.loc?.c), n => G.data.natives[n.id].group);
    const monImg = {}; for (const m of G.st.mons) monImg[G.data.monsters[m.id].name] = art?.monsters?.[G.data.monsters[m.id].name] ?? null;
    const natImg = {}; for (const n of G.st.nats) { const g = G.data.natives[n.id].group; if (!natImg[g] || G.data.natives[n.id].leader) natImg[g] = art?.natives?.[n.id] ?? natImg[g] ?? null; }
    for (const m of mons) add(m.at, { k: 'mon', label: m.n > 1 ? `${m.name} x${m.n}` : m.name, img: monImg[m.name] });
    for (const n of nats) add(n.at, { k: 'nat', label: n.n > 1 ? `${n.name} x${n.n}` : n.name, img: natImg[n.name] });
    const hires = G.st.nats.filter(n => n.hired && !n.dead);
    if (G.shared) {
        // a hireling is its hirer's alone (7.7): each character's are shown where that character stands, named for him
        const here = new Map();                                      // clearing -> owner -> how many
        for (const n of hires) { const owner = n.hiredBy ?? G.st.ch.id, at = G.st.chars[owner]?.at; if (!at || G.st.chars[owner]?.onRoad) continue; const m = here.get(at) ?? here.set(at, new Map()).get(at); m.set(owner, (m.get(owner) ?? 0) + 1); }
        // one pill a clearing (two would crowd it into a marker): "Your hirelings x2", "Ann\u2019s hirelings x1", or "Hirelings: Ann 1, Tom 1" when several have them here
        for (const [at, owners] of here) {
            const list = [...owners].sort((a, b) => G.st.order.indexOf(a[0]) - G.st.order.indexOf(b[0]));
            add(at, { k: 'ally', label: list.length === 1 ? `${list[0][0] === G.st.ch.id ? 'Your' : `${playerNameOf(G.st, list[0][0])}\u2019s`} hirelings x${list[0][1]}` : `Hirelings: ${list.map(([o, k]) => `${o === G.st.ch.id ? 'yours' : playerNameOf(G.st, o)} ${k}`).join(', ')}` });
        }
    } else if (hires.length && G.st.ch.at) add(G.st.ch.at, { k: 'ally', label: `Your hirelings x${hires.length}` });
    const planPath = G.ui.draft ? plannedClearings(G) : [];
    // while a Move phase is being set, the clearings he can walk to are ringed on the map: the map is where moves are chosen
    G.ui.moveTargets = []; G.ui.moveMaybe = [];
    if (G.ui.sheet === 'plan' && G.st.pending?.type === 'plan' && G.ui.draft) {
        const i = G.ui.planStep ?? 0;
        if (G.ui.pickMove === i || G.ui.draft.slots[i]?.act === 'move') {
            // planlogic.js: the roads he can walk (no cave in a sunlight phase, only the mountain once a climb is begun) and the hidden paths a Search earlier in the plan may find (6.2.4e)
            const o = moveOptions(G.st, G.data, G.ui.draft.slots, i);
            G.ui.moveTargets = o.sure; G.ui.moveMaybe = o.maybe;
        }
    }
    return {
        tiles: G.data.tiles, art: G.data.art, placements: G.st.placements, side: 'normal', showHidden: false, discovered: new Set(G.st.ch.discovered.paths),
        chitsByTile, tokens, hero: G.st.ch.onRoad ? null : G.st.ch.at, heroHidden: G.st.ch.hidden, selected: G.ui.sel, pathMarks: G.data.pathmarks, plan: planPath, targets: G.ui.moveTargets, targetsMaybe: G.ui.moveMaybe, goingTo: (G.st.pending?.type === 'phase' && G.st.plan?.[G.st.pending.i]?.act === 'move') ? G.st.plan[G.st.pending.i].to : null,
        onTap: id => {
            if (G.ui.sheet === 'plan' && G.st.pending?.type === 'plan' && G.ui.draft) {
                // planning: a tap on a clearing next to where this phase starts sets the move; any other tap just looks at that clearing
                const i = G.ui.planStep ?? 0;
                const wantsMove = G.ui.pickMove === i || G.ui.draft.slots[i]?.act === 'move';
                // only a clearing that is ringed can be chosen: the same list the ring is drawn from (so no cave in a sunlight phase, and nothing that would wipe the later phases)
                if (wantsMove && (G.ui.moveTargets.includes(id) || G.ui.moveMaybe.includes(id))) { G.ui.planCollapsed = false; setMove(G, i, id); return; }
                if (wantsMove && isCave(G.st, G.data, id) && roadsFrom(G.st, G.data, planState(G.st, G.data, G.ui.draft.slots).at[i] ?? '').some(r => r.usable && r.to === id)) { G.ui.planNote = 'No caves in a sunlight phase: a cave can be entered only in the first two phases, and it takes the sunlight phases away.'; G.ui.planCollapsed = false; render(G); return; }
                G.ui.sel = id; G.ui.peek = true; render(G); return;
            }
            G.ui.sel = id; G.ui.sheet = 'clearing'; render(G);
        },
        party: G.shared ? partyMarkers(G.crew) : undefined, tagged: G.shared ? G.ui.tag : undefined,
        onMarker: G.shared ? id => { const p = G.crew.find(x => x.id === id); if (p) showPlayer(G, p); } : undefined,
        onBackground: () => {
            if (G.ui.tag) { G.ui.tag = null; render(G); return; }
            if (G.ui.sheet === 'plan' && G.st.pending?.type === 'plan' && G.ui.draft && !G.ui.planCollapsed) { G.ui.planCollapsed = true; G.ui.sel = null; render(G); return; }   // like a popover: tapping outside tucks it away
            if (G.ui.sheet === 'clearing') G.ui.sheet = null;
            G.ui.sel = null; render(G);
        },
    };
}

function plannedClearings(G) {
    const out = [];
    let at = G.st.ch.at;
    for (const s of G.ui.draft.slots) if (s?.act === 'move' && s.to) { out.push(s.to); at = s.to; }
    return out;
}

// ---- rendering ----
export function render(G) {
    const cursed = (G.st.ch.curses ?? []).length > 0, magicToday = dayColors(G.st.day, G.st.lastDay ?? 28);
    // Fame and Notoriety are shown as what counts (recorded plus what the things he owns add) with the recorded part beneath, so both are always in view.
    let ern = null; try { ern = earned(G.st, G.data); } catch { /* scoring not available */ }
    const stat = (key, label, val, ic) => {
        const kind = key === 'notor' ? 'notoriety' : key, worthless = voidBy(G.st, kind);
        const total = ern && (kind === 'fame' || kind === 'notoriety') ? ern[kind] : val, items = total - val;
        const sub = items ? `${val} ${items > 0 ? '+' : '\u2212'}${Math.abs(items)}` : null;
        return h('span', { class: `statbox ${key}${worthless ? ' void' : ''}${sub ? ' two' : ''}`, 'data-stat': kind,
            title: worthless ? `Worthless: the ${worthless} curse` : sub ? `${label}: ${total} counting your belongings (${val} recorded ${items > 0 ? 'plus' : 'minus'} ${Math.abs(items)} from what you own)` : label,
            'aria-label': `${label} ${total}${sub ? `, ${val} recorded ${items > 0 ? 'plus' : 'minus'} ${Math.abs(items)} from belongings` : ''}` },
            icon(ic, 17), h('span', { class: 'sv' }, h('b', {}, String(total)), sub ? h('small', {}, sub) : null));
    };
    const tot = vpNow(G);
    G.strip.replaceChildren(
        h('button', { class: 'back', 'aria-label': 'Menu', 'data-act': 'menu', onclick: () => { G.ui.sheet = G.ui.sheet === 'menu' ? null : 'menu'; render(G); } }, icon('menu', 22),
            (G.race || G.shared) && G.standings.some(x => x.present && x.seat !== G.mySeat) ? h('i', { class: 'pdot on corner', 'aria-label': 'Others are here' }) : null),
        h('button', { class: `daybox${magicToday.length ? ' magic' : ''}`, 'data-act': 'calendar', 'aria-label': 'Calendar and the colours of magic', onclick: () => { G.ui.sheet = G.ui.sheet === 'calendar' ? null : 'calendar'; render(G); } },
            h('b', {}, `Day ${G.st.day}`, h('small', {}, dayCap(G.st)), cursed ? h('i', { class: 'cursedmark', 'aria-label': 'cursed' }, icon('skull', 15)) : null),
            h('span', {}, G.st.period === 'over' ? 'finished' : G.st.period, ...magicToday.map(c => h('i', { class: 'mdot', title: `${c} magic`, style: `background:${COLOR_DOT[c] ?? '#aaa'}` })))),
        h('button', { class: 'stats', 'aria-label': 'Gold, Fame and Notoriety: open your sheet', onclick: () => { G.ui.sheet = G.ui.sheet === 'char' ? null : 'char'; render(G); } },
            stat('gold', 'Gold', G.st.ch.gold, 'coin'), stat('fame', 'Fame', G.st.ch.fame, 'fame'), stat('notor', 'Notoriety', G.st.ch.notoriety, 'notor')),
        h('button', { class: `vpchip${tot < 0 ? ' neg' : ''}`, 'data-act': 'vp', 'aria-label': `Victory points: ${tot}. Tap for your goals`, onclick: () => { G.ui.sheet = G.ui.sheet === 'score' ? null : 'score'; render(G); } },
            h('small', {}, 'VP'), h('b', {}, tot > 0 ? `+${tot}` : String(tot))));
    G.map.set(mapModel(G));
    const hero = G.st.ch.onRoad ? G.st.ch.onRoad.from : G.st.ch.at;
    if (G.shared) { G.crew = party(G.st, G.answer, myId(G)); G.ms = meetState(G.st, G.data, myId(G), G.answer?.table); sharedCamera(G); }
    if (hero !== G.lastHero) { const first = G.lastHero === null; G.lastHero = hero; G.map.focus(hero, undefined, !first); }
    // A Move phase that is about to be played: show where he is and where he is going, so the press is a decision with the road in view.
    { const pp = G.st.pending, slot = pp?.type === 'phase' ? G.st.plan?.[pp.i] : null;
      if (slot?.act === 'move' && slot.to) { const key = `${G.st.day}.${pp.i}.${slot.to}`; if (G.ui.framedMove !== key) { G.ui.framedMove = key; G.map.frame([hero, slot.to]); } } }
    if (G.shared) { maybeShowDraw(G); maybeShowFightOver(G); }
    renderTray(G);
    renderDock(G);
    // Sheets are rebuilt on every change; keep each scrolling area where it was while the same question is still on screen
    // (tapping a chit or a target must not throw the view back to the top). A new question starts at the top.
    const sfKey = G.shared && G.st.battle?.members?.[G.st.ch.id] ? `${G.st.battle.round}.${G.st.battle.step}.${G.st.battle.members[G.st.ch.id].state}.${revealKey(G.st, { at: G.st.battle.at }) && G.ui.revealSeen !== revealKey(G.st, { at: G.st.battle.at }) ? 'r' : ''}` : '';
    const viewKey = `${G.st.pending?.type ?? ''}|${G.st.combat?.round ?? ''}|${G.ui.sheet ?? ''}|${sfKey}`;
    const scrolled = new Map();
    if (G.ui.scrollKey === viewKey) G.layer.querySelectorAll('.cb-scroll, .sheet2, .sheet-scroll, .plan-body, .journal').forEach(el => scrolled.set(el.className, el.scrollTop));
    const sameView = G.ui.scrollKey === viewKey;
    G.layer.replaceChildren(...sheets(G));
    // the same question redrawn (a tick, a tap) must not slide in again: the entrance animation is for a new question only
    if (sameView) G.layer.querySelectorAll('.sheet-bg, .sheet2').forEach(el => { el.style.animation = 'none'; });
    G.ui.scrollKey = viewKey;
    if (scrolled.size) G.layer.querySelectorAll('.cb-scroll, .sheet2, .sheet-scroll, .plan-body, .journal').forEach(el => { const t = scrolled.get(el.className); if (t) el.scrollTop = t; });
    if (G.ui.toast) G.layer.append(h('div', { class: 'toast' }, G.ui.toast));
}

// Monsters whose home row the Monster Roll has just called: they are the ones that can come to you at the end of the turn.
export function prowlers(G) {
    const alive = G.st.mons.filter(m => !m.dead && !m.hired && (G.data.monsters[m.id].homeRow === G.st.prowl || G.data.monsters[m.id].prowlsEveryDay));
    const by = {};
    for (const m of alive) (by[G.data.monsters[m.id].name] ??= 0), by[G.data.monsters[m.id].name]++;
    return Object.entries(by).map(([name, n]) => (n > 1 ? `${name} x${n}` : name));
}

function renderTray(G) {
    const r = latestRoll(G.st), fresh = r && r.n !== G.ui.seenRoll;
    G.ui.seenRoll = r?.n;
    G.tray.className = `tray${fresh ? ' fresh' : ''}`;
    const row = r ? rollRow(r, { compact: true }) : h('div', { class: 'rollrow compact none' }, h('div', { class: 'rr-what' }, 'Dice'), h('div', { class: 'rr-body' }, h('span', { class: 'rr-res dim' }, 'Your rolls show here')));
    G.tray.replaceChildren(h('button', { class: 'tray-main', 'aria-label': 'Dice rolls', 'data-act': 'dice', onclick: () => openDice(G) }, row), voiceChip());
    // while the plan is open the map needs the room: the dice tray waits (its rolls are in the journal)
    G.tray.hidden = !!(G.st.pending?.type === 'plan' && G.ui.sheet === 'plan' && G.ui.draft && !G.ui.planCollapsed);
}
