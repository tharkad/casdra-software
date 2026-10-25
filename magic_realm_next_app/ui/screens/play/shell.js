// play/shell.js: the render loop and the layout it fills: render() redraws the status strip, the tray, the sheet layer and the map; mapModel() is what the map is told to draw.
import { earned } from '../../../engine/score.js';
import { dayColors } from '../../../engine/spells.js';
import { isCave, nameOfClearing, roadsFrom, tileClearings, tileOf } from '../../../engine/world.js';
import { flyTiles } from '../../../engine/magic/fly.js';
import { h } from '../../dom.js';
import { lastDayOf, timed } from '../../gametext.js';
import { meetState, playerOf as playerNameOf } from '../../meet.js';
import { party, markers as partyMarkers } from '../../party.js';
import { moveOptions, planState } from '../../planlogic.js';
import { strip } from '../../ds.js';
import { renderParty } from './hotseat.js';
import { setStoryState } from '../../storyvoice.js';
import { icon as dsIcon } from '../../icons.js';
import { revealKey } from '../sharedfight.js';
import { voidBy } from './kit.js';
import { act } from './actions.js';
import { setFly, setMove } from './plan.js';
import { maybeShowDraw, maybeShowFightOver, sharedCamera, showPlayer } from './shared.js';
import { sheets } from './sheets.js';
import { doneLoading } from './states.js';
import { renderTray } from './tray.js';
import { myId, saveUi, vpNow } from './state.js';

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
    // while a Move phase is being set, the clearings he can walk to are ringed on the map: the map is where moves are chosen
    G.ui.moveTargets = []; G.ui.moveMaybe = [];
    if (G.ui.sheet === 'plan' && G.st.pending?.type === 'plan' && G.ui.draft) {
        const i = G.ui.planStep;
        if (i != null && (G.ui.pickMove === i || (G.st.ch.onRoad && i === 0))) {
            // planlogic.js: the roads he can walk (no cave in a sunlight phase, only the mountain once a climb is begun) and the hidden paths a Search earlier in the plan may find (6.2.4e)
            const o = moveOptions(G.st, G.data, G.ui.draft.slots, i);
            G.ui.moveTargets = o.sure; G.ui.moveMaybe = o.maybe;
        }
    }
    return {
        tiles: G.data.tiles, art: G.data.art, placements: G.st.placements, side: 'normal', showHidden: false, discovered: new Set(G.st.ch.discovered.paths),
        chitsByTile, tokens, hero: G.st.ch.onRoad || G.st.ch.dead || G.st.ch.flying ? null : G.st.ch.at, heroAir: !G.st.ch.dead && G.st.ch.flying ? G.st.ch.flying.tile : null, heroHidden: G.st.ch.hidden, selected: G.ui.sel, pathMarks: G.data.pathmarks,
        onTap: id => {
            // a spell aimed on the map (Talk to Wise Bird): a tap on a ringed clearing is the answer; the fight comes back with it chosen
            if (G.ui.combatMap && G.ui.aimMap) {
                const a = G.ui.aimMap;
                if (a.param) { (a.store.aimParams[a.spell] ??= {})[a.param] = id; G.ui.aimMap = null; G.ui.combatMap = false; clearPin(G); render(G); return; }          // a clearing asked by the spell itself (Small Blessing's journey): any clearing
                const ref = a.refs[String(id)];
                if (!ref) { showPin(G, id, 'The spell cannot be aimed there.', 'bad'); return; }
                const now = a.store.aim[a.spell] ?? [];
                if (a.max === 1) { a.store.aim[a.spell] = [ref]; G.ui.aimMap = null; G.ui.combatMap = false; clearPin(G); render(G); return; }
                const has = now.some(r => String(r.id) === String(id));
                if (has) { if (now.length > a.min) a.store.aim[a.spell] = now.filter(r => String(r.id) !== String(id)); else { showPin(G, id, `At least ${a.min} must stay chosen.`, 'bad'); return; } }
                else if (now.length < a.max) a.store.aim[a.spell] = [...now, ref];
                else { showPin(G, id, `No more than ${a.max}.`, 'bad'); return; }
                render(G); return;
            }
            if (G.ui.sheet === 'plan' && G.st.pending?.type === 'plan' && G.ui.draft) {
                // planning: a tap on a clearing next to where this phase starts sets the move; any other tap just looks at that clearing
                const i = G.ui.planStep;
                // Fly: a tap on any clearing of a ringed tile chooses that tile
                if (i != null && (G.ui.pickFly === i || (G.ui.draft.slots[i]?.act === 'fly' && !G.ui.draft.slots[i].to))) { const t = tileOf(id); if (flyTiles(G.st, G.data).includes(t)) { setFly(G, i, t); return; } }
                const wantsMove = i != null && (G.ui.pickMove === i || (G.st.ch.onRoad && i === 0));
                // only a clearing that is ringed can be chosen: the same list the ring is drawn from (so no cave in a sunlight phase, and nothing that would wipe the later phases)
                if (wantsMove && (G.ui.moveTargets.includes(id) || G.ui.moveMaybe.includes(id))) { setMove(G, i, id); return; }
                const why = wantsMove ? dimWhy(G, i).get(id) : null;
                if (why) { showPin(G, id, why, 'bad'); return; }
                clearPin(G);
                G.ui.sel = id; G.ui.peek = true; render(G); return;
            }
            if (G.st.pending?.type === 'phase-pick' && G.ui.pickAct === 'move' && (G.st.pending.moves ?? []).includes(id)) { G.ui.pickAct = null; act(G, { type: 'pick', slot: { act: 'move', to: id } }); return; }          // Prophecy: the Move is chosen on the map
            clearPin(G); G.ui.sel = id; G.ui.sheet = 'clearing'; render(G);
        },
        party: G.shared ? partyMarkers(G.crew) : undefined, tagged: G.shared ? G.ui.tag : undefined,
        onMarker: G.shared ? id => { const p = G.crew.find(x => x.id === id); if (p) showPlayer(G, p); } : undefined,
        onBackground: () => {
            if (G.ui.tag) { G.ui.tag = null; render(G); return; }
            if (G.ui.pin) { clearPin(G); return; }
            if (G.ui.sheet === 'clearing') G.ui.sheet = null;
            G.ui.sel = null; render(G);
        },
    };
}

// Where he is for the camera: his clearing, the near end of the road he fled along, or (in the air) the tile he is over, whose id the map also takes.
const heroSpot = G => (G.st.ch.flying ? G.st.ch.flying.tile : G.st.ch.onRoad ? G.st.ch.onRoad.from : G.st.ch.at);

// ---- the map's overlay (rings, the route, the "why" pin) and its camera: the vocabulary of mapview.js (docs/design/redesign/MAP-API.md) ----
// Why a road he could see is not open to this Move: said in one sentence on a pin when he taps it (the ring is dashed).
function dimWhy(G, i) {
    const out = new Map(), at = planState(G.st, G.data, G.ui.draft.slots).at[i];
    if (!at) return out;
    const o = moveOptions(G.st, G.data, G.ui.draft.slots, i), open = new Set([...o.sure, ...o.maybe]), climbing = planState(G.st, G.data, G.ui.draft.slots).climbing[i];
    for (const r of roadsFrom(G.st, G.data, at)) {
        if (open.has(r.to)) continue;
        if (climbing) out.set(r.to, 'You are halfway up a mountain: this Move must finish the climb.');
        else if (r.usable && isCave(G.st, G.data, r.to)) out.set(r.to, 'No caves in a sunlight phase: a cave can be entered only in the first two phases, and it takes the sunlight phases away.');
        else if (!r.usable && (r.kind === 'hidden' || r.kind === 'secret')) out.set(r.to, 'A hidden path you have not found. A Search earlier in the day may find it.');
    }
    return out;
}

export function clearPin(G) { clearTimeout(G.ui.pinTimer); if (G.ui.pin) { G.ui.pin = null; render(G); } }
export function showPin(G, id, why, tone = '') {
    clearTimeout(G.ui.pinTimer);
    G.ui.pin = { id, html: `<b>${nameOfClearing(id).replace(/ (\d+)$/, ' $1')}</b> ${why}`, tone };
    G.ui.pinTimer = setTimeout(() => { if (G.ui.pin) { G.ui.pin = null; if (G.root.isConnected) render(G); } }, 4000);
    render(G);
}

function overlayFor(G) {
    const st = G.st, p = st.pending, hero = st.ch.onRoad ? st.ch.onRoad.from : st.ch.at, rings = [];
    let route = [];
    if (G.ui.combatMap && G.ui.aimMap) {
        const a = G.ui.aimMap, now = new Set((a.store.aim[a.spell] ?? []).map(r => String(r.id)));
        // (every clearing may be named: ringing them all would hide the map, so only what is chosen is ringed)
        const few = Object.keys(a.refs).length <= 12;
        for (const id of Object.keys(a.refs)) if (now.has(id) || few) rings.push({ id, kind: now.has(id) ? 'chosen' : 'legal' });
        return { rings, route, pin: G.ui.pin ?? null };
    }
    if (G.ui.sheet === 'plan' && p?.type === 'plan' && G.ui.draft) {
        const d = G.ui.draft, i = G.ui.planStep, stops = [];
        for (const s of d.slots) if (s?.act === 'move' && s.to && s.to !== stops.at(-1)) stops.push(s.to);          // (a climb's two Moves are one stop)
        if (stops.length) route = [hero, ...stops];
        const fi = G.ui.pickFly ?? (d.slots[i]?.act === 'fly' && !d.slots[i].to ? i : null);
        if (fi != null && fi === i) for (const t of flyTiles(st, G.data)) { const c = tileClearings(st, G.data, t)[0]; if (c) rings.push({ id: c, kind: d.slots[i]?.to === t ? 'chosen' : 'legal' }); }
        if (i != null && (G.ui.pickMove === i || (st.ch.onRoad && i === 0))) {
            const monsAt = new Set(st.mons.filter(m => !m.dead && !m.hired && m.loc?.c).map(m => m.loc.c));
            const cur = d.slots[i]?.act === 'move' ? d.slots[i].to : null;
            for (const id of G.ui.moveTargets) rings.push({ id, kind: id === cur ? 'chosen' : monsAt.has(id) ? 'danger' : 'legal' });
            for (const id of G.ui.moveMaybe) rings.push({ id, kind: 'maybe' });
            for (const id of dimWhy(G, i).keys()) rings.push({ id, kind: 'illegal' });
        }
    } else if (p?.type === 'phase-pick' && G.ui.pickAct === 'move') {
        const sug = st.planFull?.[st.turn?.i]; const sugTo = sug?.act === 'move' ? sug.to : null;          // (the suggested destination is the filled ring: the primary names it)
        for (const id of p.moves ?? []) rings.push({ id, kind: id === sugTo ? 'chosen' : 'legal' });
    } else if (p?.type === 'phase' && st.plan?.[p.i]?.act === 'move' && st.plan[p.i].to) {
        route = [hero, st.plan[p.i].to]; rings.push({ id: st.plan[p.i].to, kind: 'legal' });
    }
    return { rings, route, pin: G.ui.pin ?? null };
}

// The clearings he is being asked to choose between (the rings of a Move or a Fly) must all be in the part of the map he can see, with the hero: a ring under the status strip or off the edge
// cannot be tapped (QA-1). Once per question: a map he then pans himself is left alone.
function revealChoices(G, hero) {
    if (G.ui.aimMap) return;                 // (aiming a spell on the map: the player looks where they like)
    const ids = G.map.getOverlay().rings.filter(r => r.kind !== 'illegal').map(r => r.id);
    if (!ids.length) { G.ui.revealKey = null; return; }
    const key = [G.st.day, G.ui.planStep, G.st.pending?.type, G.ui.pickAct, ...ids].join('|');
    if (G.ui.revealKey === key) return;
    G.ui.revealKey = key;
    G.map.reveal([hero, ...ids]);
}

// A sheet covers the bottom of the map: the camera glides so the clearing that matters sits in the strip above it (the clearing he is looking at, else where he stands), and glides back when it goes.
function syncCamera(G, force = false) {
    const sh = [...G.layer.querySelectorAll('.ds-sheet')].at(-1);
    if (!G.map || !sh) { if (G.ui.camKey) { G.ui.camKey = null; G.map?.release(); } return; }
    const inset = Math.max(0, Math.round(sh.offsetHeight - (G.layer.getBoundingClientRect().bottom - G.mapBox.getBoundingClientRect().bottom)));
    const hero = heroSpot(G), id = G.ui.sheet === 'clearing' && G.ui.sel ? G.ui.sel : hero, key = `${id}|${inset}`;
    if (key === G.ui.camKey && !force) return;
    G.ui.camKey = key; G.map.focus(id, { insetBottom: inset });
}

// ---- rendering ----
// The status strip (mockup 01): menu, Day and phase (opens the calendar), Fame / Notoriety / Gold (one button: the Kit), VP (the goals).
function renderStrip(G) {
    const cursed = (G.st.ch.curses ?? []).length > 0, magicToday = dayColors(G.st.day, G.st.lastDay ?? 28);
    // Fame and Notoriety are what counts (recorded plus what the things he owns add); the recorded part is in the Kit.
    let ern = null; try { ern = earned(G.st, G.data); } catch { /* scoring not available */ }
    const total = (kind, val) => (ern && (kind === 'fame' || kind === 'notoriety') ? ern[kind] : val);
    const tot = vpNow(G), dead = G.st.period === 'over' && G.st.ch.dead;
    // The score is counted from the shortfall of each goal, so on day 1 it is a negative number: the honest figure, and the one Mike wants on the chip (it said "0/N" until the first night: QA-19, reversed by note 32).
    // DR-14: the strip does not run ahead of the Day Result. While the morning report is on screen it keeps the day, the phase and the numbers it showed at midnight; the new day shows when it is closed.
    const cur = { day: G.st.day, total: lastDayOf(G.st), phase: G.st.period === 'over' ? 'finished' : G.st.period, gold: G.st.ch.gold, fame: total('fame', G.st.ch.fame), notor: total('notoriety', G.st.ch.notoriety),
        vp: tot > 0 ? `+${tot}` : String(tot).replace('-', '\u2212'), vpc: dead ? 'bad' : tot > 0 ? 'pos' : 'neg', tot };
    const reportUp = !G.shared && G.st.pending?.type === 'plan' && G.st.day > 1 && G.ui.reportedDay !== G.st.day && G.ui.sheet !== 'plan';
    const held = reportUp && G.ui.stripSnap && G.ui.stripSnap.day === G.st.day - 1 ? { ...G.ui.stripSnap, phase: 'midnight' } : null;
    if (!reportUp) G.ui.stripSnap = cur;
    const f = held ?? cur;
    const el = strip({ day: f.day, total: f.total, phase: f.phase, gold: f.gold, fame: f.fame, notor: f.notor, vp: f.vp, vpc: f.vpc,
        attrs: {
            menu: { 'data-act': 'menu', onclick: () => { G.ui.sheet = G.ui.sheet === 'menu' ? null : 'menu'; render(G); } },
            day: { 'data-act': 'calendar', role: 'button', tabindex: '0', 'aria-label': 'Calendar and the colours of magic', onclick: () => { G.ui.sheet = G.ui.sheet === 'calendar' ? null : 'calendar'; render(G); } },
            stats: { 'aria-label': 'Fame, Notoriety and Gold: open your kit', onclick: () => { G.ui.sheet = G.ui.sheet === 'char' ? null : 'char'; render(G); } },
            vp: { 'data-act': 'vp', role: 'button', tabindex: '0', 'aria-label': `Victory points: ${f.tot}. Tap for your goals`, onclick: () => { G.ui.sheet = G.ui.sheet === 'score' ? null : 'score'; render(G); } },
        } });
    if (!timed(G.st)) el.querySelector('.ds-day b small')?.remove();
    // legacy hooks the tests read
    el.querySelector('.ds-day').classList.add('daybox', ...(magicToday.length ? ['magic'] : []));
    el.querySelector('.ds-stats').classList.add('stats'); el.querySelector('.ds-vp').classList.add('vpchip', ...(f.tot < 0 ? ['neg'] : []));
    // a curse takes the use of a number away: it stays on screen, struck through (the Kit and the curse sheet say why)
    for (const [kind, cls] of [['gold', 'gold'], ['fame', 'fame']]) {
        const w = voidBy(G.st, kind), s = el.querySelector(`.ds-stat.${cls}`); s.dataset.stat = kind;
        if (w) { s.classList.add('void'); s.title = `Worthless: the ${w} curse`; s.append(h('i', { class: 'voidmark', 'aria-label': `worthless: ${w} curse` }, dsIcon('skull'))); }
    }
    el.querySelector('.ds-stat.notor').dataset.stat = 'notoriety';
    // the day's colours of magic and a curse, as two small marks under the phase word; the Journal says what they mean
    const ph = el.querySelector('.ds-day span');
    for (const c of magicToday) ph.append(h('i', { class: `ds-dot mdot ${c.toLowerCase()}`, title: `${c} magic` }));
    if (cursed) ph.append(h('i', { class: 'cursedmark', 'aria-label': 'cursed' }, dsIcon('skull')));
    if ((G.race || G.shared) && G.standings.some(x => x.present && x.seat !== G.mySeat)) el.querySelector('.menu').append(h('i', { class: 'pdot on corner', 'aria-label': 'Others are here' }));
    G.strip.replaceChildren(...el.childNodes);
}

export function render(G) {
    setStoryState(G.st);                                 // (the Story voice finds what a roll came to without every caller passing the state)
    if (G.shared) { G.crew = party(G.st, G.answer, myId(G)); G.ms = meetState(G.st, G.data, myId(G), G.answer?.table); }
    G.ui.onSheetMove = () => setTimeout(() => { if (G.root.isConnected) syncCamera(G); }, 320);           // a decision sheet dropped to a peek (or came back): the camera follows once it has settled
    const model = mapModel(G);                           // first: it settles which clearings are ringed (G.ui.moveTargets), which the plan reads
    renderStrip(G);
    renderParty(G);
    if (G.shared) sharedCamera(G);
    if (G.shared) { maybeShowDraw(G); maybeShowFightOver(G); }
    renderTray(G);
    // Sheets are rebuilt on every change; keep each scrolling area where it was while the same question is still on screen
    // (tapping a chit or a target must not throw the view back to the top). A new question starts at the top.
    const sfKey = G.shared && G.st.battle?.members?.[G.st.ch.id] ? `${G.st.battle.round}.${G.st.battle.step}.${G.st.battle.members[G.st.ch.id].state}.${revealKey(G.st, { at: G.st.battle.at }) && G.ui.revealSeen !== revealKey(G.st, { at: G.st.battle.at }) ? 'r' : ''}` : '';
    const viewKey = `${G.st.pending?.type ?? ''}|${G.st.combat?.round ?? ''}|${G.ui.sheet ?? ''}|${sfKey}`;
    const scrolled = new Map();
    const SCROLLERS = '.cb-scroll, .ds-sheet-body, .tray-body, .journal';
    if (G.ui.scrollKey === viewKey) G.layer.querySelectorAll(SCROLLERS).forEach(el => scrolled.set(el.className, el.scrollTop));
    const sameView = G.ui.scrollKey === viewKey;
    G.layer.replaceChildren(...sheets(G));
    // the same question redrawn (a tick, a tap) must not slide in again: the entrance animation is for a new question only
    if (sameView) G.layer.querySelectorAll('.ds-scrim, .ds-sheet').forEach(el => { el.style.animation = 'none'; });
    G.ui.scrollKey = viewKey;
    if (scrolled.size) G.layer.querySelectorAll(SCROLLERS).forEach(el => { const t = scrolled.get(el.className); if (t) el.scrollTop = t; });
    if (G.ui.toast) G.layer.append(h('div', { class: `toast ds-toast${G.ui.toastWhy ? '' : ' bad'}`, role: 'status', style: `bottom:${G.tray.offsetHeight + 12}px` }, G.ui.toast));
    // the map last: the tray has its height now, so the map box has its own
    G.map.set(model);
    G.map.setOverlay(overlayFor(G));
    const hero = heroSpot(G);
    const moved = hero !== G.lastHero;
    if (moved) { const first = G.lastHero === null; G.lastHero = hero; G.map.focus(hero, undefined, !first); }
    revealChoices(G, hero);
    // A Move phase that is about to be played: show where he is and where he is going, so the press is a decision with the road in view.
    { const pp = G.st.pending, slot = pp?.type === 'phase' ? G.st.plan?.[pp.i] : null;
      if (slot?.act === 'move' && slot.to) { const key = `${G.st.day}.${pp.i}.${slot.to}`; if (G.ui.framedMove !== key) { G.ui.framedMove = key; G.map.frame([hero, slot.to]); } } }
    syncCamera(G, moved);
    syncMapButton(G);
    saveUi(G);
    syncHistory(G);
}

// ---- the browser's Back button (QA-20) ----
// A sheet (or the plan) that opens pushes one history entry; Back then puts that sheet away instead of leaving the game. Closing a sheet any other way (its cross, a tap on the scrim, the primary) takes the entry
// back off, so the stack never grows. On the base screen there is no entry of ours: Back leaves as it always did, and the game is on the device (the title offers Continue).
const sheetOpen = G => G.ui.sheet === 'plan' || !!G.layer.querySelector('.ds-sheet');
// One thing at a time: a pop of ours (history.back, asked for when a sheet went away) is async, and a push made before it lands would be popped by it. So while one is on its way nothing is pushed;
// when it lands (onBack) the screen is synced again. (A pop that never lands, e.g. no history, is given up after a second.)
function syncHistory(G) {
    if (G.ui.histBusy) return;
    const open = sheetOpen(G);
    if (open && !G.ui.histOpen) { try { history.pushState({ mrSheet: 1 }, ''); G.ui.histOpen = true; } catch { /* no history here */ } }
    else if (!open && G.ui.histOpen) {
        G.ui.histOpen = false; G.ui.histBusy = true;
        try { history.back(); } catch { G.ui.histBusy = false; return; }
        setTimeout(() => { if (G.ui.histBusy) { G.ui.histBusy = false; if (G.root.isConnected) syncHistory(G); } }, 1000);
    }
}
function onBack(G) {
    if (!G.root.isConnected) { removeEventListener('popstate', G.ui.popHandler); return; }
    if (G.ui.histBusy) { G.ui.histBusy = false; syncHistory(G); return; }          // (the pop that syncHistory asked for has landed)
    if (!G.ui.histOpen) return;
    G.ui.histOpen = false;
    const top = [...G.layer.querySelectorAll('.ds-sheet')].at(-1);
    if (!top && G.ui.sheet === 'plan') { G.ui.sheet = null; G.ui.pickMove = null; }                  // the plan is put aside, the draft kept
    else if (top?.querySelector('.x[data-close]')) top.querySelector('.x[data-close]').click();      // an information sheet: its own way out
    else if (top?.classList.contains('decision')) G.ui.peekGo?.();                                   // a question: the map for a moment
    render(G);                                                                                       // (a sheet that stays puts its entry back)
}

// The map button's picture: the whole realm when the map is zoomed in, the crosshair when it is zoomed out.
const FIT_K = 0.95;
export function syncMapButton(G) {
    const b = G.mapTools, k = G.map?.camera?.().k;
    if (!b || k == null) return;
    const out = k < FIT_K;
    b.dataset.mode = out ? 'locate' : 'fit';
    b.setAttribute('aria-label', out ? 'Centre on me' : 'Show the whole realm');
    b.replaceChildren(dsIcon(out ? 'cross' : 'fit', 'lg'));
    const on = !!G.ui.bare, e = G.bareBtn;
    G.mapBox.classList.toggle('bare', on);
    if (e) { e.setAttribute('aria-pressed', String(on)); e.setAttribute('aria-label', on ? 'Show the names again' : 'Show the bare tiles'); e.classList.toggle('on', on); e.replaceChildren(dsIcon(on ? 'eyeoff' : 'eye', 'lg')); }
}

// Monsters whose home row the Monster Roll has just called: they are the ones that can come to you at the end of the turn.
export function prowlers(G) {
    const alive = G.st.mons.filter(m => !m.dead && !m.hired && (G.data.monsters[m.id].homeRow === G.st.prowl || G.data.monsters[m.id].prowlsEveryDay));
    const by = {};
    for (const m of alive) (by[G.data.monsters[m.id].name] ??= 0), by[G.data.monsters[m.id].name]++;
    return Object.entries(by).map(([name, n]) => (n > 1 ? `${name} x${n}` : name));
}

// Called once after the map is mounted: the map button (tap and long press), and the first touch on the map putting a decision sheet aside ("look at the map first").
export function wireShell(G) {
    const b = G.mapTools; let long = false, timer = null;
    doneLoading(G); G.mapBox.append(b, G.bareBtn);
    G.bareBtn.addEventListener('click', () => { G.ui.bare = !G.ui.bare; syncMapButton(G); });
    try { if (history.state?.mrSheet) history.replaceState(null, ''); } catch { /* ignore */ }               // (a reload with a sheet open keeps that entry's mark: the base screen has none)
    G.ui.popHandler = () => onBack(G); addEventListener('popstate', G.ui.popHandler);
    const hero = () => heroSpot(G);
    const fitAll = () => G.map.fit(), me = () => G.map.focus(hero(), { k: Math.max(G.map.camera().k ?? 1, 1.5), animate: true });
    b.addEventListener('pointerdown', () => { long = false; clearTimeout(timer); timer = setTimeout(() => { long = true; (b.dataset.mode === 'fit' ? me : fitAll)(); setTimeout(() => syncMapButton(G), 500); }, 520); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => clearTimeout(timer));
    b.addEventListener('click', () => { if (long) { long = false; return; } (b.dataset.mode === 'locate' ? me : fitAll)(); setTimeout(() => syncMapButton(G), 500); });
    G.mapBox.addEventListener('pointerdown', e => { if (!b.contains(e.target)) G.ui.peekGo?.(); }, { capture: true });
    for (const ev of ['pointerup', 'wheel']) G.mapBox.addEventListener(ev, () => setTimeout(() => syncMapButton(G), 520), { passive: true });
    // a tray so tall that the map is a sliver has no room for the button: it steps aside until the map has room again
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { const ch = G.mapBox.clientHeight; b.hidden = ch > 0 && ch < 76; G.bareBtn.hidden = ch > 0 && ch < 130; }).observe(G.mapBox);
}
