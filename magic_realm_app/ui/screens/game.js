import { h } from '../dom.js';
import { mountMap } from '../mapview.js';
import { loadData } from '../../engine/data.js';
import { newGame } from '../../engine/setup.js';
import { apply, phasesFor, validatePlan, planKinds, restOptions, chitLabel, LAST_DAY } from '../../engine/day.js';
import { roadsFrom, isMountain, isCave, nameOfClearing, tileOf, numOf, tileName } from '../../engine/world.js';
import { nameOf, defOf, priceOf, weightOf, summaryOf } from '../../engine/items.js';
import { WEIGHT_WORDS, lvl } from '../../engine/core.js';
import { REL_NAMES } from '../../engine/tables.js';
import { stockOf, sellable, groupChoices, canPayOffer } from '../../engine/trade.js';
import { drinksCost } from '../../engine/meeting.js';
import { rollRow, rollsByIds, latestRoll, diceOf } from '../dice.js';
import { voiceChip, logText, onVoice, voice } from '../voice.js';
import { combatSheet } from './combatui.js';
import { HELP } from './info.js';
import { newRecord, daySnapshot, finalize } from '../../engine/gamerecord.js';
import { putRecord, getRecord } from '../gamestore.js';
import { VERSION } from '../version.js';
import { ask } from '../ask.js';
import { itemFace } from '../counter.js';
import { cardEl } from '../card.js';
import { earned, targets, scoreGame, progress, FACTORS, CATS } from '../../engine/score.js';
import { COLORS, COLOR_MEANING, dayColors, isMagicDay, colorSources, castable, castOptions, ATTACK_SPELLS } from '../../engine/spells.js';
import { collect as collectReport, send as sendReport } from '../bugreport.js';
import { connect, inviteLink } from '../online.js';
import { energizeOptions } from '../../engine/magic/energize.js';
import { heldOptions } from '../../engine/magic/phase.js';
import { flySources, flyTiles } from '../../engine/magic/fly.js';
import { planState, moveOptions, actRefusal } from '../planlogic.js';
import { timed, dayCap, lastDayOf, lengthLine, overTitle, SPELLS_HOW } from '../gametext.js';

// The game screen: status strip, map, a dock that follows the day, and sheets for the plan, the character and the log.
const SAVE_KEY = 'mr-save-v1';
// What each curse takes away, in plain words, the action it spoils (so the plan can say so before the phase is wasted) and how it ends.
const CURSE_ACT = { Eyemist: 'search', Squeak: 'hide', 'Ill Health': 'rest' };
const CURSE_PLAIN = {
    Eyemist: 'You cannot Search at all (Locate, Loot, Peer, Reading Runes).',
    Squeak: 'You cannot Hide, and you were unhidden the moment it struck: monsters will see you.',
    Wither: 'Chits with an asterisk cannot be played: they were all tired when it struck.',
    'Ill Health': 'You cannot Rest, so tired and wounded chits stay that way.',
    Ashes: 'Your gold is worthless: you cannot spend it, so you cannot buy, hire or pay.',
    Disgust: 'Your Fame is worthless: you cannot lose it, so paying an insult in Fame is not possible and Challenges mean a fight.',
};
// The header's icons: one family (24 grid, 1.8 round stroke, currentColor) so they read as a set.
const ICON = {
    menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
    coin: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z'],
    fame: ['M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.5l6.1-.7z'],
    notor: ['M12 3c.8 3.4 5 5.4 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2.2-4.2 0 2 .9 3 1.9 3 .2-3-1.1-5 .9-8.8z'],
    lock: ['M7.5 11V8a4.5 4.5 0 0 1 9 0v3', 'M6 11h12v9H6z', 'M12 14.5v2'],
    skull: ['M12 3.5a7 7 0 0 0-7 7c0 2.4 1.2 4.2 3 5.3v3.2h8v-3.2c1.8-1.1 3-2.9 3-5.3a7 7 0 0 0-7-7z', 'M9 11.2h.01', 'M15 11.2h.01', 'M10.5 19v-2.2', 'M13.5 19v-2.2'],
};
function icon(name, size = 18) {
    const ns = 'http://www.w3.org/2000/svg', el = document.createElementNS(ns, 'svg');
    el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('width', size); el.setAttribute('height', size); el.setAttribute('class', `ico-${name}`);
    el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '1.8'); el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('aria-hidden', 'true');
    for (const d of ICON[name]) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); el.append(p); }
    return el;
}
const COLOR_DOT = { White: '#f2eedc', Black: '#15151c', Grey: '#9aa0aa', Gold: '#e2c068', Purple: '#8f7cc0' };

// Pull a sheet down to put it away: the handle follows the finger, and the sheet goes if it was dragged far enough or flicked; otherwise it springs back.
function pullDown(handle, target, done) {
    let y0 = null, dy = 0, t0 = 0;
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', e => { if (e.button) return; y0 = e.clientY; dy = 0; t0 = e.timeStamp; target.style.transition = 'none'; try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
    handle.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); target.style.transform = `translateY(${dy}px)`; });
    const end = e => {
        if (y0 == null) return;
        const v = dy / Math.max(1, e.timeStamp - t0);
        y0 = null; target.style.transition = 'transform .18s ease-out';
        if (dy > 90 || (v > 0.8 && dy > 50)) { target.style.transform = 'translateY(100%)'; setTimeout(done, 170); } else target.style.transform = '';
    };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    // a swipe down on the content itself, when it is already at its top
    let ty = null, tx = 0;
    target.addEventListener('touchstart', e => { ty = target.scrollTop <= 0 ? e.touches[0].clientY : null; tx = e.touches[0].clientX; }, { passive: true });
    target.addEventListener('touchmove', e => {
        if (ty == null) return;
        const d = e.touches[0].clientY - ty, dx = Math.abs(e.touches[0].clientX - tx);
        if (d > 70 && d > dx * 1.6) { ty = null; target.style.transition = 'transform .18s ease-out'; target.style.transform = 'translateY(100%)'; setTimeout(done, 170); }
    }, { passive: true });
}

// A curse makes a number worthless (Ashes: gold, Disgust: Fame): it is still shown, struck through, so it is plain it cannot be used.
const voidBy = (st, stat) => (stat === 'gold' && (st.ch.curses ?? []).includes('Ashes') ? 'Ashes' : stat === 'fame' && (st.ch.curses ?? []).includes('Disgust') ? 'Disgust' : null);
const ACT_LABEL = { move: 'Move', hide: 'Hide', search: 'Search', trade: 'Trade', hire: 'Hire', rest: 'Rest', alert: 'Alert', enchant: 'Enchant', fly: 'Fly', nothing: 'Nothing' };
const TABLE_LABEL = { peer: 'Peer', locate: 'Locate', loot: 'Loot', ground: 'Ground', sitecard: 'Site card', runes: 'Read runes', magicsight: 'Magic Sight', 'magicsight-take': 'Magic Sight: take' };

const WELCOME_KEY = 'mr-welcomed-v1';
const welcomed = () => { try { return !!localStorage.getItem(WELCOME_KEY); } catch { return true; } };
const setWelcomed = () => { try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ } };

export function saveGame(st) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch { /* storage may be unavailable */ } }
export function loadSaved() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
export function clearSaved() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

export function gameScreen(ctx) {
    const root = h('main', { class: 'screen game', 'data-screen': 'game' });
    const mapBox = h('div', { class: 'mapbox gamemap' });
    const strip = h('header', { class: 'status' });
    const dock = h('footer', { class: 'gdock' });
    const tray = h('div', { class: 'tray' });
    const openDice = () => { ui.sheet = ui.sheet === 'dice' ? null : 'dice'; render(); };
    const layer = h('div', { class: 'layer' });
    const mapTools = h('div', { class: 'maptools' },
        h('button', { 'aria-label': 'Centre on me', onclick: () => map?.focus(st.ch.onRoad ? st.ch.onRoad.from : st.ch.at) }, '\u25CE'),
        h('button', { 'aria-label': 'Show the whole realm', onclick: () => map?.fit() }, '\u2922'));
    mapBox.append(mapTools);
    root.append(strip, mapBox, tray, dock, layer);
    let lastHero = null, st = null, data = null, map = null, ui = { sheet: null, sel: null, draft: null, toast: null };
    // Online: this screen is one seat in a race. The server holds the game; `st` is the view it sent, and every action goes to it.
    const race = ctx.params?.online ?? null;
    let conn = null, standings = [], inflight = false, here = false;
    if (race) ui.sheet = ctx.params?.invited ? 'race' : null;
    try { if (localStorage.getItem('mr-dock-open') === '0') ui.dockOpen = false; } catch { /* ignore */ }

    // The game record (engine/gamerecord.js): every action taken and what the game said, kept on the device so a game can be listed, read and replayed.
    let rec = null, persistTimer = null;
    function persist(now = false) {
        if (!rec || !st) return;
        clearTimeout(persistTimer);
        const write = () => { finalize(rec, st); putRecord(rec); };
        if (now) write(); else persistTimer = setTimeout(write, 700);
    }
    function noteError(action, e, kind) {
        rec?.errors.push({ day: st?.day, period: st?.period, pending: st?.pending?.type ?? null, action: action ? JSON.parse(JSON.stringify(action)) : null, message: String(e?.message ?? e), kind,
            bug: /^(TypeError|ReferenceError|RangeError)$/.test(e?.name ?? '') });
        persist();
    }

    function commit(next) { st = next; ctx.state = st; if (!race) saveGame(st); render(); }
    function act(action) {
        ui.combatMap = false; ui.mapPeek = false; if (action.type !== 'tidy') ui.tradePick = null;
        if (action.type !== 'tidy') { ui.gainSeen = st.gainSeq ?? 0; ui.findSeen = st.findSeq ?? 0; }          // what he found last time is old news once he does something else
        if (race) { actRemote(action); return; }
        try {
            const next = apply(st, data, action);
            rec?.moves.push(JSON.parse(JSON.stringify(action)));
            const newDay = next.day !== st.day;
            commit(next);
            if (newDay) rec?.days.push(daySnapshot(next));
            persist(next.period === 'over');
        } catch (e) {
            noteError(action, e, 'rejected');
            ui.toast = e.message; render(); setTimeout(() => { ui.toast = null; render(); }, 2600);
        }
    }
    async function actRemote(action) {
        if (inflight) return;
        inflight = true; ui.busy = true; render();
        try { const r = await conn.act(action); st = r.view; commit(st); }
        catch (e) {
            if (e.status === 409 && e.body?.view) commit(e.body.view);
            ui.toast = e.message; render(); setTimeout(() => { ui.toast = null; render(); }, 2600);
        } finally { inflight = false; ui.busy = false; render(); }
    }
    // Back from a lost connection (or another device): take the server's word for where the game is.
    async function refresh() { try { const v = await conn.view(); standings = v.standings; if (!inflight && JSON.stringify(v.view) !== JSON.stringify(st)) commit(v.view); else render(); } catch { /* the next try will do */ } }
    function abandon() {
        if (race) { conn?.stop(); ctx.go('online'); return; }
        if (rec && st) { finalize(rec, st); rec.meta.result = 'abandoned'; clearTimeout(persistTimer); putRecord(rec); }
        clearSaved(); ctx.go('title');
    }

    // ---- model for the map ----
    function mapModel() {
        const art = data.art;
        const tokens = {}, chitsByTile = {};
        const add = (id, t) => (tokens[id] ??= []).push(t);
        const KINDNAME = { 'lost-city': 'Lost City', 'lost-castle': 'Lost Castle' };
        // every chit of a tile keeps its own spot on the picture, even while it is shown at its clearing instead
        const slotOf = {}, nextSlot = {};
        for (const c of st.chits) if (!c.pile && c.tile && !(c.kind === 'warning' && c.letter === 'V')) slotOf[c.id] = (nextSlot[c.tile] = (nextSlot[c.tile] ?? -1) + 1);
        for (const c of st.chits) {
            if (c.pile || !c.tile) continue;
            if (c.kind === 'warning' && c.letter === 'V') continue;
            const known = c.up || st.ch.seen.includes(c.id);
            const name = KINDNAME[c.kind] ?? c.name;
            // a site he has DISCOVERED (Locate, Discover chits) carries a tick and a gold edge: it may be looted. A site chit merely turned up does not.
            const disc = c.kind === 'site' && st.ch.discovered.sites.includes(c.id);
            if (c.up && c.clearing && (c.kind === 'sound' || c.kind === 'site')) { add(c.tile + c.clearing, { k: c.kind, disc, label: c.kind === 'sound' ? `\u266A ${name}` : `\u25C6 ${name}${disc ? ' \u2713' : ''}` }); continue; }
            if (!c.up && c.kind === 'site' && disc) { add(c.tile + c.num, { k: 'site', disc: true, label: `\u25C6 ${name} \u2713` }); continue; }
            (chitsByTile[c.tile] ??= []).push({ up: known, name: known ? (c.kind === 'sound' ? `${name} ${c.num}` : name) : '?', id: c.id, kind: known ? c.kind : null, slot: slotOf[c.id] });
        }
        // a site card he found by looting (the Crypt of the Knight, the Toadstool Circle...) is a place in that clearing, and shows like a discovered site
        for (const [at, ids] of Object.entries(st.ch.siteCards ?? {})) for (const id of ids) add(at, { k: 'site', disc: true, label: `\u25C6 ${data.treasures?.[id]?.name ?? id} \u2713` });
        for (const d of st.dwellings) {
            const here = d.at === st.ch.at;
            add(d.at, { k: 'dwelling', label: d.kind, img: art?.dwellings?.[d.kind] ?? null });
        }
        // creatures by name: "Wolf x2", natives by group
        const group = (list, key) => { const m = {}; for (const x of list) { const k = x.loc.c + '|' + key(x); (m[k] ??= { at: x.loc.c, name: key(x), n: 0 }).n++; } return Object.values(m); };
        const mons = group(st.mons.filter(m => !m.dead && m.loc?.c), m => data.monsters[m.id].name);
        const nats = group(st.nats.filter(n => !n.dead && !n.hired && n.loc?.c), n => data.natives[n.id].group);
        const monImg = {}; for (const m of st.mons) monImg[data.monsters[m.id].name] = art?.monsters?.[data.monsters[m.id].name] ?? null;
        const natImg = {}; for (const n of st.nats) { const g = data.natives[n.id].group; if (!natImg[g] || data.natives[n.id].leader) natImg[g] = art?.natives?.[n.id] ?? natImg[g] ?? null; }
        for (const m of mons) add(m.at, { k: 'mon', label: m.n > 1 ? `${m.name} x${m.n}` : m.name, img: monImg[m.name] });
        for (const n of nats) add(n.at, { k: 'nat', label: n.n > 1 ? `${n.name} x${n.n}` : n.name, img: natImg[n.name] });
        const hires = st.nats.filter(n => n.hired && !n.dead);
        if (hires.length && st.ch.at) add(st.ch.at, { k: 'ally', label: `Your hirelings x${hires.length}` });
        const planPath = ui.draft ? plannedClearings() : [];
        // while a Move phase is being set, the clearings he can walk to are ringed on the map: the map is where moves are chosen
        ui.moveTargets = []; ui.moveMaybe = [];
        if (ui.sheet === 'plan' && st.pending?.type === 'plan' && ui.draft) {
            const i = ui.planStep ?? 0;
            if (ui.pickMove === i || ui.draft.slots[i]?.act === 'move') {
                // planlogic.js: the roads he can walk (no cave in a sunlight phase, only the mountain once a climb is begun) and the hidden paths a Search earlier in the plan may find (6.2.4e)
                const o = moveOptions(st, data, ui.draft.slots, i);
                ui.moveTargets = o.sure; ui.moveMaybe = o.maybe;
            }
        }
        return {
            tiles: data.tiles, art: data.art, placements: st.placements, side: 'normal', showHidden: false, discovered: new Set(st.ch.discovered.paths),
            chitsByTile, tokens, hero: st.ch.onRoad ? null : st.ch.at, heroHidden: st.ch.hidden, selected: ui.sel, pathMarks: data.pathmarks, plan: planPath, targets: ui.moveTargets, targetsMaybe: ui.moveMaybe, goingTo: (st.pending?.type === 'phase' && st.plan?.[st.pending.i]?.act === 'move') ? st.plan[st.pending.i].to : null,
            onTap: id => {
                if (ui.sheet === 'plan' && st.pending?.type === 'plan' && ui.draft) {
                    // planning: a tap on a clearing next to where this phase starts sets the move; any other tap just looks at that clearing
                    const i = ui.planStep ?? 0;
                    const wantsMove = ui.pickMove === i || ui.draft.slots[i]?.act === 'move';
                    // only a clearing that is ringed can be chosen: the same list the ring is drawn from (so no cave in a sunlight phase, and nothing that would wipe the later phases)
                    if (wantsMove && (ui.moveTargets.includes(id) || ui.moveMaybe.includes(id))) { ui.planCollapsed = false; setMove(i, id); return; }
                    if (wantsMove && isCave(st, data, id) && roadsFrom(st, data, planState(st, data, ui.draft.slots).at[i] ?? '').some(r => r.usable && r.to === id)) { ui.planNote = 'No caves in a sunlight phase: a cave can be entered only in the first two phases, and it takes the sunlight phases away.'; ui.planCollapsed = false; render(); return; }
                    ui.sel = id; ui.peek = true; render(); return;
                }
                ui.sel = id; ui.sheet = 'clearing'; render();
            },
            onBackground: () => {
                if (ui.sheet === 'plan' && st.pending?.type === 'plan' && ui.draft && !ui.planCollapsed) { ui.planCollapsed = true; ui.sel = null; render(); return; }   // like a popover: tapping outside tucks it away
                if (ui.sheet === 'clearing') ui.sheet = null;
                ui.sel = null; render();
            },
        };
    }

    function plannedClearings() {
        const out = [];
        let at = st.ch.at;
        for (const s of ui.draft.slots) if (s?.act === 'move' && s.to) { out.push(s.to); at = s.to; }
        return out;
    }

    // ---- rendering ----
    function render() {
        const cursed = (st.ch.curses ?? []).length > 0, magicToday = dayColors(st.day, st.lastDay ?? 28);
        // Fame and Notoriety are shown as what counts (recorded plus what the things he owns add) with the recorded part beneath, so both are always in view.
        let ern = null; try { ern = earned(st, data); } catch { /* scoring not available */ }
        const stat = (key, label, val, ic) => {
            const kind = key === 'notor' ? 'notoriety' : key, worthless = voidBy(st, kind);
            const total = ern && (kind === 'fame' || kind === 'notoriety') ? ern[kind] : val, items = total - val;
            const sub = items ? `${val} ${items > 0 ? '+' : '\u2212'}${Math.abs(items)}` : null;
            return h('span', { class: `statbox ${key}${worthless ? ' void' : ''}${sub ? ' two' : ''}`, 'data-stat': kind,
                title: worthless ? `Worthless: the ${worthless} curse` : sub ? `${label}: ${total} counting your belongings (${val} recorded ${items > 0 ? 'plus' : 'minus'} ${Math.abs(items)} from what you own)` : label,
                'aria-label': `${label} ${total}${sub ? `, ${val} recorded ${items > 0 ? 'plus' : 'minus'} ${Math.abs(items)} from belongings` : ''}` },
                icon(ic, 17), h('span', { class: 'sv' }, h('b', {}, String(total)), sub ? h('small', {}, sub) : null));
        };
        const tot = vpNow();
        strip.replaceChildren(
            h('button', { class: 'back', 'aria-label': 'Menu', 'data-act': 'menu', onclick: () => { ui.sheet = ui.sheet === 'menu' ? null : 'menu'; render(); } }, icon('menu', 22),
                race && standings.some(x => x.present && x.seat !== race.seat) ? h('i', { class: 'pdot on corner', 'aria-label': 'Others are here' }) : null),
            h('button', { class: `daybox${magicToday.length ? ' magic' : ''}`, 'data-act': 'calendar', 'aria-label': 'Calendar and the colours of magic', onclick: () => { ui.sheet = ui.sheet === 'calendar' ? null : 'calendar'; render(); } },
                h('b', {}, `Day ${st.day}`, h('small', {}, dayCap(st)), cursed ? h('i', { class: 'cursedmark', 'aria-label': 'cursed' }, icon('skull', 15)) : null),
                h('span', {}, st.period === 'over' ? 'finished' : st.period, ...magicToday.map(c => h('i', { class: 'mdot', title: `${c} magic`, style: `background:${COLOR_DOT[c] ?? '#aaa'}` })))),
            h('button', { class: 'stats', 'aria-label': 'Gold, Fame and Notoriety: open your sheet', onclick: () => { ui.sheet = ui.sheet === 'char' ? null : 'char'; render(); } },
                stat('gold', 'Gold', st.ch.gold, 'coin'), stat('fame', 'Fame', st.ch.fame, 'fame'), stat('notor', 'Notoriety', st.ch.notoriety, 'notor')),
            h('button', { class: `vpchip${tot < 0 ? ' neg' : ''}`, 'data-act': 'vp', 'aria-label': `Victory points: ${tot}. Tap for your goals`, onclick: () => { ui.sheet = ui.sheet === 'score' ? null : 'score'; render(); } },
                h('small', {}, 'VP'), h('b', {}, tot > 0 ? `+${tot}` : String(tot))));
        map.set(mapModel());
        const hero = st.ch.onRoad ? st.ch.onRoad.from : st.ch.at;
        if (hero !== lastHero) { const first = lastHero === null; lastHero = hero; map.focus(hero, undefined, !first); }
        // A Move phase that is about to be played: show where he is and where he is going, so the press is a decision with the road in view.
        { const pp = st.pending, slot = pp?.type === 'phase' ? st.plan?.[pp.i] : null;
          if (slot?.act === 'move' && slot.to) { const key = `${st.day}.${pp.i}.${slot.to}`; if (ui.framedMove !== key) { ui.framedMove = key; map.frame([hero, slot.to]); } } }
        renderTray();
        renderDock();
        // Sheets are rebuilt on every change; keep each scrolling area where it was while the same question is still on screen
        // (tapping a chit or a target must not throw the view back to the top). A new question starts at the top.
        const viewKey = `${st.pending?.type ?? ''}|${st.combat?.round ?? ''}|${ui.sheet ?? ''}`;
        const scrolled = new Map();
        if (ui.scrollKey === viewKey) layer.querySelectorAll('.cb-scroll, .sheet2, .sheet-scroll, .plan-body, .journal').forEach(el => scrolled.set(el.className, el.scrollTop));
        const sameView = ui.scrollKey === viewKey;
        layer.replaceChildren(...sheets());
        // the same question redrawn (a tick, a tap) must not slide in again: the entrance animation is for a new question only
        if (sameView) layer.querySelectorAll('.sheet-bg, .sheet2').forEach(el => { el.style.animation = 'none'; });
        ui.scrollKey = viewKey;
        if (scrolled.size) layer.querySelectorAll('.cb-scroll, .sheet2, .sheet-scroll, .plan-body, .journal').forEach(el => { const t = scrolled.get(el.className); if (t) el.scrollTop = t; });
        if (ui.toast) layer.append(h('div', { class: 'toast' }, ui.toast));
    }

    // Monsters whose home row the Monster Roll has just called: they are the ones that can come to you at the end of the turn.
    function prowlers() {
        const alive = st.mons.filter(m => !m.dead && !m.hired && (data.monsters[m.id].homeRow === st.prowl || data.monsters[m.id].prowlsEveryDay));
        const by = {};
        for (const m of alive) (by[data.monsters[m.id].name] ??= 0), by[data.monsters[m.id].name]++;
        return Object.entries(by).map(([name, n]) => (n > 1 ? `${name} x${n}` : name));
    }

    function renderTray() {
        const r = latestRoll(st), fresh = r && r.n !== ui.seenRoll;
        ui.seenRoll = r?.n;
        tray.className = `tray${fresh ? ' fresh' : ''}`;
        const row = r ? rollRow(r, { compact: true }) : h('div', { class: 'rollrow compact none' }, h('div', { class: 'rr-what' }, 'Dice'), h('div', { class: 'rr-body' }, h('span', { class: 'rr-res dim' }, 'Your rolls show here')));
        tray.replaceChildren(h('button', { class: 'tray-main', 'aria-label': 'Dice rolls', 'data-act': 'dice', onclick: openDice }, row), voiceChip());
        // while the plan is open the map needs the room: the dice tray waits (its rolls are in the journal)
        tray.hidden = !!(st.pending?.type === 'plan' && ui.sheet === 'plan' && ui.draft && !ui.planCollapsed);
    }

    function renderDock() {
        const p = st.pending;
        const where = nameOfClearing(st.ch.at);
        const magicNow = dayColors(st.day, st.lastDay ?? 28);
        const magicBar = magicNow.length ? h('button', { class: 'magicbar', 'data-act': 'magic-day', onclick: () => { ui.sheet = 'calendar'; render(); } },
            h('span', {}, 'The land is filled with'), ...magicNow.map(c => colorChip(c)), h('span', { class: 'until' }, 'until midnight')) : null;
        const cursesOn = st.ch.curses ?? [];
        const curseJustFell = (st.finds ?? []).some(f => f.kind === 'curse' && f.n > (ui.findSeen ?? st.findSeq ?? 0));
        const curseBar = cursesOn.length && !curseJustFell ? h('button', { class: 'cursebar', 'data-act': 'curses', 'aria-label': `You are cursed: ${cursesOn.join(', ')}. Tap for what it does`, onclick: () => { ui.sheet = 'curses'; render(); } },
            h('span', { class: 'skull', 'aria-hidden': 'true' }, '\u2620'),
            h('span', { class: 'rl' }, h('small', { class: 'gl' }, 'YOU ARE CURSED'), ...cursesOn.map(n => h('span', { class: 'cl' }, h('b', {}, n), ' ', CURSE_PLAIN[n] ?? ''))),
            h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A')) : null;
        // a spell that could be cast tonight: said during the day so it is not a surprise that the evening stops to ask
        const tonight = (st.period === 'daylight' || st.period === 'birdsong') && !st.combat && !st.ch.onRoad ? castOptions(st, data).filter(o => (o.useful || o.quiet) && !ATTACK_SPELLS[o.spell]) : [];
        const tonightBar = tonight.length ? h('p', { class: 'hint tonight', 'data-act': 'cast-tonight' }, `\u2728 You can cast ${[...new Set(tonight.map(o => o.name))].join(', ')} this evening: the game will stop and ask you, even if nothing attacks.`) : null;
        const info = h('div', { class: 'where2' }, h('span', { class: 'you' }, 'You are at'), h('b', {}, st.ch.onRoad ? 'on the road' : where), st.ch.hidden ? h('em', {}, 'hidden') : h('em', { class: 'seen' }, 'visible'));
        const recent0 = [...st.log].reverse().filter(l => l.k !== 'day' && l.k !== 'roll').slice(0, 3).reverse();
        ui.gainSeen ??= st.gainSeq ?? 0;
        const fresh = (st.gains ?? []).filter(x => x.n > ui.gainSeen && st.ch.items.some(i => i.uid === x.uid)).map(x => st.ch.items.find(i => i.uid === x.uid));
        const gainBars = fresh.map(it => {
            const nm = nameOf(data, it);
            return h('button', { class: 'gainbar', 'data-act': 'gain', 'data-item': it.uid, 'aria-label': `You found ${nm}: tap for details`, onclick: () => { ui.itemUid = it.uid; ui.itemFrom = 'dock'; ui.sheet = 'item'; render(); } },
                ico(nm), h('span', { class: 'rl' }, h('small', { class: 'gl' }, 'YOU GOT'), h('b', {}, nm), h('small', {}, summaryOf(data, it))),
                h('em', {}, `${WEIGHT_WORDS[weightOf(data, it)] ?? ''}`), h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'));
        });
        ui.findSeen ??= st.findSeq ?? 0;
        const findBars = (st.finds ?? []).filter(f => f.n > ui.findSeen).map(f => {
            const isCard = f.kind === 'card';
            if (f.kind === 'curse') return h('button', { class: 'gainbar find curse', 'data-act': 'curse-new', onclick: () => { ui.sheet = 'curses'; render(); } },
                h('span', { class: 'skull', 'aria-hidden': 'true' }, '\u2620'),
                h('span', { class: 'rl' }, h('small', { class: 'gl' }, 'A CURSE HAS FALLEN ON YOU'), h('b', {}, f.name), h('small', {}, CURSE_PLAIN[f.name] ?? f.effect)),
                h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'));
            return h('button', { class: 'gainbar find', 'data-act': 'find', onclick: () => { if (isCard) { ui.cardId = f.id; ui.sheet = 'cardinfo'; } else { ui.sel = f.clearing; ui.sheet = 'clearing'; } render(); } },
                h('span', { class: 'rl' }, h('small', { class: 'gl' }, isCard ? 'YOU FOUND' : 'YOU DISCOVERED'), h('b', {}, f.name ?? 'a site'), h('small', {}, isCard ? 'Tap to read the card' : `at ${nameOfClearing(f.clearing)}: tap for what is there`)),
                h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'));
        });
        const gainNames = fresh.map(it => nameOf(data, it)).concat((st.finds ?? []).filter(f => f.n > ui.findSeen).map(f => f.name).filter(Boolean));
        // a line that names a new item is dropped (its gain box says it), except a deal's own line: that one says what was paid
        const recent = recent0.filter(l => l.k === 'trade' || !gainNames.some(n => logText(l).includes(n)));
        const prowl = st.period === 'daylight' && st.prowl ? h('button', { class: 'prowl', 'data-act': 'prowl', onclick: () => { ui.sheet = 'dice'; render(); } },
            h('b', {}, voice() === 'story' ? 'The wilds stir' : `Monster roll ${st.prowl}`), h('span', {}, prowlers().join(', ') || 'no one stirs'),
            st.day % 7 === 0 ? h('small', { class: 'weekend' }, (voice() === 'story' ? 'The week turns: the creatures of the wilds are called home to where they began, the slain among them.' : `Week\u2019s end: row ${st.prowl} was called back to where it began, the slain among them.`)) : null) : null;
        // What the drawer shows: `body` is everything that explains (it slides away), `actions` is what you press (it stays).
        let body = null, actions = null;
        if (!p) body = h('div', { class: 'note' }, 'Working...');
        else if (p.type === 'plan' && ui.sheet === 'plan' && ui.draft) { dock.classList.remove('closed'); dock.replaceChildren(h('div', { class: 'dock-plan' }, ui.planCollapsed ? planBar() : planPanel())); return; }
        else if (p.type === 'plan') {
            body = ask(`Day ${st.day}, Birdsong: plan your day.`, `You choose one action for each of your ${phasesFor(st, data, []).total} phases now, in secret; they are then played in order after the Monster Roll.${st.ch.onRoad ? ' You are still out on the road after running away, so your first phase is a Move to one end of it, already set for you.' : ''}`, { compact: true });
            actions = h('button', { class: 'btn primary big', 'data-act': 'plan', onclick: () => { ui.draft ??= newDraft(); ui.sheet = 'plan'; ui.planCollapsed = false; render(); } }, 'Plan your day');
        } else if (p.type === 'phase') {
            const slot = st.plan[p.i];
            body = h('div', { class: 'phase' },
                ask(`Phase ${p.i + 1} of ${st.plan.length}: ${describeSlot(slot)}.`, 'This is the action you planned. Press the button to carry it out. Anything that needs your decision will stop and ask.', { compact: true }),
                h('div', { class: 'phase-info' }, h('b', {}, `Phase ${p.i + 1} of ${st.plan.length}`), h('span', {}, describeSlot(slot))),
                slot?.act === 'search' && !st.ch.onRoad ? h('p', { class: 'hint', 'data-hint': 'search-where' }, searchWhere(st.ch.at)) : null);
            actions = h('div', { class: 'row-end' },
                h('button', { class: 'btn primary', 'data-act': 'next', onclick: () => act({ type: 'next' }) }, describeSlot(slot)));
        } else if (p.type === 'phase-pick') {
            // Prophecy: no plan was recorded; each phase is chosen as it comes (the printed rule: he learns his day as he lives it)
            body = h('div', { class: 'phase' },
                ask(`Phase ${p.i + 1}: choose what you do (Prophecy).`, 'Under Prophecy you do not record your day in advance: you pick each phase as it comes. Move, Hide, Search, Rest, Alert and the rest work as usual.'),
                h('div', { class: 'phase-info' }, h('b', {}, `Phase ${p.i + 1}`), h('span', {}, `${p.regularLeft ?? '?'} ordinary phases left${p.extrasLeft ? `, ${p.extrasLeft} extra` : ''}`)));
            actions = h('div', { class: 'pickrow' }, ...p.acts.map(a => h('button', { class: `btn${a.kind === 'extra' ? '' : ' primary'}`, 'data-pick-act': a.act, onclick: () => { ui.pickAct = ui.pickAct === a.act ? null : a.act; render(); } }, ACT_LABEL[a.act] ?? a.act)),
                h('button', { class: 'btn', 'data-act': 'next', onclick: () => act({ type: 'next' }) }, 'Follow the suggestion'));
        } else if (p.type === 'over') {
            body = st.ch.dead || st.over?.reason === 'died' ? deathBox() : null;
            actions = h('button', { class: 'btn primary big', onclick: () => { ui.sheet = 'over'; render(); } }, 'See your result');
        } else body = h('div', { class: 'note' }, 'Decision needed...');

        // The drawer: a grabber on top, then what explains, then what you press. Pulled down, only the grabber and the buttons are left.
        const newCount = findBars.length + gainBars.length + (curseJustFell ? 1 : 0);
        // Anything that comes with a note (a find, an item, a curse, the day's Monster roll) brings the drawer up if it was pulled down. A find or an item
        // sends it back to where he had left it once it is old news; the Monster roll just opens it and leaves it to him.
        const transient = [...fresh.map(i => `g${i.uid}`), ...(st.finds ?? []).filter(f => f.n > ui.findSeen).map(f => `f${f.n}`), ...(curseJustFell ? ['c'] : [])];
        ui.prowlPopped ??= st.period === 'daylight' ? st.day : 0;                 // loading a game in the middle of a day is not news
        const prowlNew = st.period === 'daylight' && !!st.prowl && ui.prowlPopped !== st.day;
        const sig = transient.join(',');
        if (ui.dockOpen === false && ((transient.length && sig !== ui.attnSig) || prowlNew)) {
            ui.dockPref = false; ui.dockOpen = true; ui.dockAuto = transient.length > 0 && !prowlNew;
        } else if (ui.dockAuto && !transient.length) { ui.dockOpen = ui.dockPref ?? false; ui.dockAuto = false; }
        if (prowlNew) ui.prowlPopped = st.day;
        ui.attnSig = sig;
        const open = ui.dockOpen !== false;
        // spells in force: one line, tap for the card text, what is tied to what, and when each ends
        const fxOn = (st.fx ?? []).filter(f => f.state !== 'done');
        const spellBar = fxOn.length ? h('button', { class: 'spellbar', 'data-act': 'spells', 'aria-label': `Spells in effect: ${fxOn.map(f => data.spells?.[f.spell]?.name ?? f.spell).join(', ')}. Tap for details`, onclick: () => { ui.sheet = 'spells'; render(); } },
            h('span', { class: 'rl' }, h('small', { class: 'gl' }, 'SPELLS IN EFFECT'), ...fxOn.map(f => h('span', { class: 'cl' }, h('b', {}, data.spells?.[f.spell]?.name ?? f.spell), ` ${fxEnds(f)}`))),
            h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A')) : null;
        // free spell actions at the start of a phase: wake a permanent spell with a colour chit, or use a Phase spell he is holding
        const freeActs = p && (p.type === 'phase' || p.type === 'plan') ? [
            ...energizeOptions(st, data).map(o => h('button', { class: 'btn spellact', 'data-act': 'energize', 'data-fx': o.fx, onclick: () => act({ type: 'energize', fx: o.fx, colorChit: o.chits[0] }) },
                h('span', { class: 'col' }, h('b', {}, `Energize ${o.name}`), h('small', {}, `Burn an enchanted chit (${o.chits.length} held) to wake it: it works until Midnight`)))),
            ...(p.type === 'phase' ? heldOptions(st, data).map(o => h('button', { class: 'btn spellact', 'data-act': 'protect', 'data-fx': o.fx, onclick: () => act({ type: 'protect', fx: o.fx }) },
                h('span', { class: 'col' }, h('b', {}, `Use ${o.name}`), h('small', {}, 'It lasts through this phase (it also holds off your own helpful spells)')))) : []),
        ] : [];
        const spellActs = freeActs.length ? h('div', { class: 'spellacts' }, ...freeActs) : null;
        // what he has become: a creature (Absorb Essence, Transform), mist, or a flier
        const formBar = st.ch.morph ? h('div', { class: 'formbar', 'data-act': 'form' }, h('small', { class: 'gl' }, 'YOU ARE A CREATURE'), h('b', {}, st.ch.morph.creature?.name ?? 'a creature'), h('span', {}, 'You cannot cast, trade, hire or enchant until the spell ends.'))
            : st.ch.mist ? h('div', { class: 'formbar mist', 'data-act': 'form' }, h('small', { class: 'gl' }, 'YOU ARE MIST'), h('span', {}, `You can only Move and Hide; nothing can block you. Your ${st.ch.mist.items?.length ?? 0} things and ${st.ch.mist.gold ?? 0} gold are held in the spell.`))
            : st.ch.flying ? h('div', { class: 'formbar fly', 'data-act': 'form' }, h('small', { class: 'gl' }, 'YOU ARE FLYING'), h('span', {}, `Over ${tileName(st.ch.flying.tile)}. You land at a clearing on it by a die roll.`)) : null;
        const items = [curseBar, formBar, spellBar, spellActs, magicBar, info, tonightBar, ...findBars, ...gainBars, prowl, recent.length ? h('div', { class: 'lastlog' }, ...recent.map((l, i) => h('p', { class: i === recent.length - 1 ? 'new' : '' }, logText(l)))) : null, body].filter(Boolean);
        const peek = `${st.ch.onRoad ? 'On the road' : where} \u00B7 ${st.ch.hidden ? 'hidden' : 'visible'}`;
        const grab = h('button', { class: 'grab', 'data-act': 'dock-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'dock-body',
            'aria-label': open ? 'Details panel, open. Press to slide it away' : `Details panel, closed${newCount ? `, ${newCount} new` : ''}. Press to open it` },
            h('span', { class: 'grip', 'aria-hidden': 'true' }),
            h('span', { class: 'peek' }, h('span', { class: 'peek-t' }, peek), newCount ? h('span', { class: 'badge', 'aria-hidden': 'true' }, String(newCount)) : null,
                h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u2303')));
        const wrap = h('div', { class: `dock-body${open ? '' : ' closed'}`, id: 'dock-body' }, h('div', { class: 'dock-inner' }, ...items));
        dock.classList.toggle('closed', !open);
        dock.replaceChildren(...[grab, wrap, actions ? h('div', { class: 'dock-actions' }, actions) : null].filter(Boolean));
        wireDrawer(grab, wrap);
    }

    // The drawer's behaviour is the usual bottom sheet: tap the grabber or drag it; a swipe down on the content, when it is at its top, closes it.
    // It follows the finger and settles on whichever end is nearer, or the one the flick was heading for.
    function wireDrawer(grab, wrap) {
        const inner = wrap.firstChild, reduce = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const fullH = () => { const had = wrap.classList.contains('closed'); wrap.classList.remove('closed'); const keep = wrap.style.height; wrap.style.height = 'auto'; const hh = wrap.getBoundingClientRect().height; wrap.style.height = keep; if (had) wrap.classList.add('closed'); return hh; };
        const remember = o => { try { localStorage.setItem('mr-dock-open', o ? '1' : '0'); } catch { /* ignore */ } };
        const settle = (o, from = null) => {
            ui.dockOpen = o; ui.dockAuto = false; ui.dockPref = o; remember(o);
            const target = o ? fullH() : 0;
            dock.classList.toggle('closed', !o);
            grab.setAttribute('aria-expanded', o ? 'true' : 'false');
            wrap.classList.remove('closed'); wrap.classList.remove('dragging');
            if (reduce) { wrap.style.height = ''; wrap.classList.toggle('closed', !o); return; }
            if (from != null) wrap.style.height = from + 'px';
            else wrap.style.height = (o ? 0 : fullH()) + 'px';
            void wrap.offsetHeight;                              // start the transition from where it is
            wrap.style.height = target + 'px';
            const done = () => { wrap.removeEventListener('transitionend', done); wrap.style.height = ''; wrap.classList.toggle('closed', !o); render(); };
            wrap.addEventListener('transitionend', done);
            setTimeout(() => { if (wrap.style.height !== '') done(); }, 400);
        };
        grab.addEventListener('click', () => { if (grab._dragged) return; settle(!(ui.dockOpen !== false)); });
        // dragging the grabber
        let y0 = null, h0 = 0, full = 0, moved = false, lastY = 0, lastT = 0, vel = 0;
        grab.addEventListener('pointerdown', e => {
            if (e.button) return;
            y0 = e.clientY; moved = false; full = fullH(); h0 = ui.dockOpen !== false ? wrap.getBoundingClientRect().height : 0; lastY = e.clientY; lastT = e.timeStamp; vel = 0;
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

    // Where a Search will be made, and what the map already shows of sites on this tile: a site in another clearing is not found from here.
    function searchWhere(at) {
        if (!at) return null;
        const tile = tileOf(at), n = numOf(at);
        const sites = st.chits.filter(c => c.kind === 'site' && c.tile === tile && !c.pile && c.up);
        const away = sites.filter(c => c.num !== n);
        const there = away.map(c => `the ${c.name} is in clearing ${c.num}`).join(', ');
        return `You will search in ${nameOfClearing(at)}.${sites.some(c => c.num === n) ? '' : ' No site is revealed here yet.'}${there ? ` ${there.charAt(0).toUpperCase()}${there.slice(1)}: a search only finds what is in the clearing you are in, so Move there first.` : ''}`;
    }
    // a table's name for the player: the site card he found is named (Loot the Crypt of the Knight)
    function tableName(t) {
        if (t !== 'sitecard') return TABLE_LABEL[t] ?? t;
        const id = st.ch.siteCards?.[st.ch.at]?.[0];
        return id ? `Loot the ${data.treasures?.[id]?.name ?? 'site card'}` : TABLE_LABEL[t];
    }
    function describeSlot(s) {
        if (!s || s.act === 'nothing') return 'Do nothing';
        if (s.act === 'move') return `Move to ${nameOfClearing(s.to).replace(/ (\d+)$/, '\u00A0$1')}`;       // the number never wraps on its own line
        if (s.act === 'search') return s.table ? `Search: ${tableName(s.table)}` : 'Search';
        return ACT_LABEL[s.act] ?? s.act;
    }

    // ---- sheets ----
    function sheets() {
        const out = [];
        const p = st.pending;
        if (ui.sheet === 'bug') { out.push(bugSheet()); return out; }
        if (p?.type?.startsWith('combat')) {
            // The fight can be set aside to look at the map, or covered by the belongings sheets, and then picked up again.
            if (ui.combatMap) {
                if (ui.sheet === 'clearing' && ui.sel) out.push(clearingSheet());
                out.push(h('div', { class: 'combat-back' }, h('button', { class: 'btn primary big', 'data-act': 'back-to-fight', onclick: () => { ui.combatMap = false; render(); } }, 'Back to the fight')));
                return out;
            }
            out.push(combatSheet({ st, data, act, ui, render, peek: { gear: () => { ui.sheet = 'char'; render(); }, map: () => { ui.combatMap = true; ui.sheet = null; render(); } } }));
            if (ui.sheet === 'char') out.push(charSheet());
            else if (ui.sheet === 'item') out.push(itemSheet());
            else if (ui.sheet === 'cardinfo') out.push(cardInfoSheet());
            else if (ui.sheet === 'spell') out.push(spellSheet());
            else if (ui.sheet === 'card') out.push(modal(st.ch.name, h('div', {}, data.art?.cards?.[st.ch.id] ? h('img', { class: 'cardpic', src: data.art.cards[st.ch.id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { ui.sheet = 'char'; render(); } }));
            return out;
        }
        if (ui.peek && ui.sel && p?.type === 'plan') { out.push(clearingSheet()); return out; }
        if (ui.mapPeek && ui.sheet === 'clearing' && ui.sel) { out.push(clearingSheet()); return out; }       // a clearing looked at while a decision waits: close it to come back to the bar
        if (p?.type === 'turn-end') out.push(turnEndSheet());
        else if (p?.type === 'turn-end') out.push(turnEndSheet());
        else if (p?.type === 'rest') out.push(restSheet(p));
        else if (p?.type === 'search-table') out.push(modal('Search here', h('div', { class: 'searchcards' },
            ask(`You search at ${nameOfClearing(st.ch.at)}.`, 'A Search phase is one roll on one table, and each place or table finds different things. Read what each could give you, then press the button at the bottom of the one you want.'),
            ...searchCards(p))));
        else if (p?.type === 'effort-cost') out.push(effortSheet(p));
        else if (p?.type === 'runes-target') out.push(modal('Read runes: which?', h('div', {},
            ask('Which runes will you read?', 'A Reading Runes search needs one target: a discovered site here that holds spell cards, or an artifact or book you carry and have active.'),
            ...p.options.map(o => h('button', { class: 'btn', 'data-target': o.key, onclick: () => act({ type: 'runes-target', target: o.key }) }, o.label)))));
        else if (p?.type === 'learn-spell') out.push(learnSheet(p));
        else if (p?.type === 'phase-pick' && ui.pickAct) out.push(pickSheet(p));
        else if (p?.type === 'enchant-choice') {
            const chitOpts = p.options.filter(x => (x.kind ?? 'chit') === 'chit'), tileOpts = p.options.filter(x => x.kind === 'tile');
            const tile = tileOpts[0]?.tile, here = tile ? st.placements.find(x => x.id === tile) : null;
            const other = here ? (here.side === 'enchanted' ? 'normal' : 'enchanted') : null;
            const cols = other ? [...new Set(data.tile(tile).sides[other].clearings.flatMap(c => c.magic ?? []))].map(c => c[0].toUpperCase() + c.slice(1)) : [];
            out.push(modal('Enchant', h('div', { class: 'restsheet' },
                ask('Which Magic chit will you enchant?', 'It turns over to its colour and stays enchanted until you play it. A colour chit supplies that colour of magic to your own spells, and is used up when played.'),
                h('div', { class: 'chitgrid' }, ...st.ch.chits.map(c => {
                    const o = chitOpts.find(x => x.chit === c.id);
                    const label = c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`;
                    return h('button', { class: `chit2 ${c.type} ${c.state}${o ? ' pick' : ' off'}`, 'data-enchant-chit': c.id, disabled: !o || null, onclick: () => act({ type: 'enchant-choice', chit: c.id, kind: 'chit' }) },
                        h('b', {}, label), h('span', {}, '*'.repeat(c.effort) || ' '), h('small', {}, o ? o.color : c.type === 'magic' ? 'Magic' : c.type === 'move' ? 'Move' : 'Fight'));
                })),
                tileOpts.length ? h('div', { class: 'tileenchant' },
                    h('h3', {}, `Or enchant the tile: ${tileName(tile)}`),
                    h('p', { class: 'hint' }, `Turn ${tileName(tile)} to its ${other} side. ${other === 'enchanted' ? `Its clearings then hold ${cols.length ? cols.join(', ') : 'colours of'} magic for everyone, and some of its roads change.` : 'It goes back to its ordinary side: its roads change back and its colours go.'} The Magic chit is not used up${tileOpts.some(o => o.supply) ? ' (but a colour chit that supplies the colour is)' : ''}.`),
                    ...tileOpts.map(o => h('button', { class: 'btn', 'data-enchant-tile': o.chit, onclick: () => act({ type: 'enchant-choice', chit: o.chit, kind: 'tile' }) }, `Use Magic ${o.numeral}${o.time}${'*'.repeat(o.effort)} (${o.color})${o.supply ? ', burning a colour chit' : ''}`))) : null)));
        }
        else if (p?.type === 'search-choice') out.push(modal(`${tableName(p.table)}: your choice`, h('div', {}, latestRoll(st) ? rollRow(latestRoll(st)) : null, ask(`You rolled ${p.roll.join('+')}: the table gives you a choice.`, 'This result lets you pick whichever entry of the table you want instead of the one the dice name. Choose the one that helps you most.'),
            ...p.options.map(r => h('button', { class: 'btn', onclick: () => act({ type: 'search-choice', result: r }) }, r)),
            ...hereBlocks())));
        else if (p?.type === 'trade' || p?.type === 'trade-offer') out.push(tradeSheet(p));
        else if (p?.type === 'hire' || p?.type === 'hire-offer') out.push(hireSheet(p));
        else if (!ui.welcomeDone && !welcomed() && st.day === 1 && p?.type === 'plan') out.push(modal(`Welcome, ${st.ch.name}`, h('div', {},
            h('p', {}, `You are at the ${st.ch.startDwelling}${st.ch.items.length ? ' with ' + st.ch.items.map(i => nameOf(data, i)).join(', ') : ' with no weapon or armor yet: trade for some'}. ${lengthLine(st)}`),
            h('p', {}, h('b', {}, 'Each morning'), ' you plan up to four phases in secret: move, hide, search, trade, hire, rest or alert.'),
            h('p', {}, h('b', {}, 'Then the day plays out'), ', a phase at a time, and anything you meet is called out by the chits you turn up.'),
            h('p', {}, h('b', {}, 'Each evening'), ' you fight whoever shares your clearing, playing your chits in secret.'),
            h('p', { class: 'hint' }, 'Tap your gold, Fame and Notoriety for your chits and gear. The menu has the map key and a short guide.'),
            h('button', { class: 'btn primary', 'data-act': 'welcome-ok', onclick: () => { setWelcomed(); ui.welcomeDone = true; render(); } }, 'Begin'))));
        else if (p?.type === 'plan' && st.day > 1 && ui.reportedDay !== st.day && ui.sheet !== 'plan') out.push(reportSheet());
        else if (ui.sheet === 'char') out.push(charSheet());
        else if (ui.sheet === 'clearing' && ui.sel) out.push(clearingSheet());
        else if (ui.sheet === 'menu') out.push(menuSheet());
        else if (ui.sheet === 'confirm-abandon' && !race) out.push(modal('Abandon this game?', h('div', { class: 'confirmbox' },
            h('p', {}, `${st.ch?.name ?? 'Your hero'} is on day ${st.day}${timed(st) ? ` of ${st.lastDay ?? 28}` : ''}, with ${st.ch?.gold ?? 0} gold, ${st.ch?.fame ?? 0} Fame and ${st.ch?.notoriety ?? 0} Notoriety.`),
            h('p', { class: 'hint bad' }, 'Abandoning ends this adventure for good. It stays in History as abandoned, but it cannot be picked up again.'),
            h('button', { class: 'btn primary big', 'data-act': 'keep-playing', onclick: () => { ui.sheet = null; render(); } }, 'Keep playing'),
            h('button', { class: 'btn danger', 'data-act': 'confirm-abandon', onclick: abandon }, 'Abandon this game')), { close: () => { ui.sheet = null; render(); } }));
        else if (ui.sheet === 'race' && race) out.push(raceSheet());
        else if (ui.sheet === 'calendar') out.push(calendarSheet());
        else if (ui.sheet === 'over' || ui.restartVp) out.push(overSheet());
        else if (ui.sheet === 'card') out.push(modal(st.ch.name, h('div', {}, data.art?.cards?.[st.ch.id] ? h('img', { class: 'cardpic', src: data.art.cards[st.ch.id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { ui.sheet = 'char'; render(); } }));
        else if (ui.sheet === 'dice') out.push(diceSheet());
        else if (ui.sheet === 'tables') out.push(modal('Tables', h('div', { class: 'tables' },
            ...[['Meeting Table', 'meetingTable'], ['Search table', 'searchTable'], ['Missile table', 'missileTable'], ['Power of the Pit', 'pitTable']].filter(([, k]) => data.art?.misc?.[k])
                .flatMap(([t, k]) => [h('h3', {}, t), h('img', { class: 'tablepic', src: data.art.misc[k], alt: t })])), { close: () => { ui.sheet = null; render(); } }));
        else if (ui.sheet === 'log') out.push(logSheet());
        else if (ui.sheet === 'setupcard') out.push(setupCardSheet());
        else if (ui.sheet === 'item') out.push(itemSheet());
        else if (ui.sheet === 'cardinfo') out.push(cardInfoSheet());
        else if (ui.sheet === 'curses') out.push(cursesSheet());
        else if (ui.sheet === 'spells') out.push(spellsSheet());
        else if (ui.sheet === 'spell') out.push(spellSheet());
        else if (ui.sheet === 'score') out.push(scoreSheet());
        else if (ui.sheet === 'key') out.push(modal('Map key', h('div', { class: 'key' },
            ...[['I H C G', 'Dwellings: Inn, House, Chapel, Guard house; the number beside it is the natives there'],
                ['\u25C6 \u2713', 'A site you have discovered (gold edge): you may loot it or read its runes'], ['\u25C6', 'A site chit that has turned up but is not yet discovered: Locate it first'], ['\u266A', 'A sound chit that has turned up: monsters stir in that clearing'],
                ['?', 'A face-down chit in that tile; a letter means you have peeked at it'], ['red', 'Monsters (the number is how many)'], ['blue', 'Natives'],
                ['5 \u25A0 \u25A0 \u25C6 \u266A', 'A busy clearing: when its names will not fit beside it they become one marker. The number is the clearing; each chip is a kind of thing there (red monsters, blue people, \u2302 dwellings, \u25C6 sites, \u266A sounds, with how many). Tap it to see everything in the clearing'],
                ['? on a dotted line', 'A hidden path or secret passage printed on the tile that you have not discovered yet: you cannot use it until you do'],
                ['\u25C7', 'You: solid when you are seen, hollow when you are hidden']].map(([k, t]) => h('p', {}, h('b', {}, k), ' ', t))), { close: () => { ui.sheet = null; render(); } }));
        else if (ui.sheet === 'help') out.push(modal('How to play', h('div', {}, ...HELP.flatMap(([t, x]) => [h('h3', {}, t), h('p', {}, x)])), { close: () => { ui.sheet = null; render(); } }));
        return out;
    }

    // Sheets that are only for looking can be dismissed by tapping anywhere outside them; those that need an answer cannot.
    // Every sheet is the same object: a scrim, a rounded sheet with a grabber and a title, and (when it is only for looking) a way out three ways:
    // pull it down, tap outside it, or the cross. A sheet that needs an answer has none of them and no grabber.
    const modal = (title, body, { close, footer } = {}) => {
        // a sheet that needs an answer can be set aside to look at the map, and brought back (the decision may depend on what is on the map)
        if (!close && ui.mapPeek) return h('div', { class: 'combat-back' }, h('button', { class: 'btn primary big', 'data-act': 'back-to-choice', onclick: () => { ui.mapPeek = false; render(); } }, `Back to: ${title}`));
        const sheet = h('div', { class: `sheet2${footer ? ' has-footer' : ''}` },
            h('div', { class: 'sheet-top' },
                close ? h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }, h('span', { class: 'grip' })) : null,
                h('div', { class: 'sheet2-head' }, h('b', {}, title), close ? h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '\u2715')
                    : h('button', { class: 'peekmap', 'data-act': 'peek-sheet-map', onclick: () => { ui.mapPeek = true; render(); } }, 'Map'))),
            footer ? h('div', { class: 'sheet-scroll' }, body) : body,
            footer ?? null);
        const bg = h('div', { class: 'sheet-bg', onclick: e => { if (close && e.target === e.currentTarget) close(); } }, sheet);
        if (close) pullDown(sheet.querySelector('.sheet-grab'), sheet, close);
        return bg;
    };

    // Pictures from the original game, when we have them.
    const picOf = name => { const a = data.art; return a ? (a.weapons?.[name] ?? a.armor?.[name] ?? a.horses?.[name] ?? null) : null; };
    const ico = (name, cls = 'ico') => { const s = picOf(name); return s ? h('img', { class: cls, src: s, alt: '', decoding: 'sync' }) : null; };
    const nativePic = id => data.art?.natives?.[id] ?? null;

    function diceSheet() {
        const rolls = [...(st.rolls ?? [])].reverse().slice(0, 30);
        const mon = st.prowl ? h('div', { class: 'monroll' },
            h('b', {}, `Today's Monster roll: ${st.prowl}`),
            h('p', {}, `Monsters of row ${st.prowl} prowl today. At the end of your turn any that are in your tile come to you, and chits that turn up can call more.`),
            h('p', { class: 'prowlers' }, prowlers().join(', ') || 'None of them are left in the realm.')) : null;
        return modal('Dice', h('div', { class: 'dicesheet' }, mon,
            h('h3', {}, 'Your rolls'),
            ...(rolls.length ? rolls.map(r => h('div', { class: 'histrow' }, h('small', {}, `Day ${r.day}`), rollRow(r))) : [h('p', { class: 'hint' }, 'Nothing has been rolled yet.')])),
            { close: () => { ui.sheet = null; render(); } });
    }

    const offerDice = p => { const rs = rollsByIds(st, p.rollIds); return rs.length ? h('div', { class: 'offerdice' }, ...rs.map(r => rollRow(r))) : null; };

    const c0Hint = choices => choices.some(c => c.canSwitch) ? 'More than one leader is here. Pick whose goods you deal with before you sell, buy or buy drinks.' : 'You have started dealing with this leader, so the choice is made for this phase.';

    function tradeSheet(p) {
        if (p.type === 'trade-offer') {
            if (p.insult) {
                return modal(`${p.group}: ${p.insult}!`, h('div', {},
                    offerDice(p),
                    canPayOffer(st, p)
                        ? h('p', {}, `The ${p.group} are offended. You may pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'} to calm things, or they will block you.`)
                        : h('p', {}, `The ${p.group} challenge you. Under the Disgust curse you cannot pay Fame, so they will block you and fight.`),
                    canPayOffer(st, p) ? h('button', { class: 'btn', onclick: () => act({ type: 'trade', act: 'pay' }) }, `Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'}`) : null,
                    h('button', { class: 'btn', onclick: () => act({ type: 'trade', act: 'fight' }) }, canPayOffer(st, p) ? 'Refuse' : 'Fight')));
            }
            // Rule 7.6.5c: belongings may make up part or all of the price at their basic Gold price; no change is given.
            const mine = sellable(st, data), chosen = new Set((ui.payWith ?? []).filter(u => mine.some(m => m.uid === u)));
            const worth = mine.filter(m => chosen.has(m.uid)).reduce((n, m) => n + m.price, 0);
            const goldDue = Math.max(0, p.price - worth), ok = st.ch.gold >= goldDue;
            const short = goldDue - st.ch.gold;
            return modal(p.repay != null ? `Win back ${p.name}` : `Buy ${p.name}`, h('div', { class: 'trade' },
                ask(p.repay != null ? `The ${p.group} will sell back their goodwill for ${p.price} gold.` : `The ${p.group} will sell you ${p.name} for ${p.price} gold.`,
                    'That price came from your roll on the Meeting Table. Accept to pay it (in gold, or with things you hand over), or say no thanks and keep what you have.'),
                offerDice(p) ?? h('p', {}, p.rollNote),
                h('p', { class: 'bigline' }, `${p.price} gold`, h('small', {}, ` (${p.base} x ${p.mult})`)),
                p.repay != null ? h('p', { class: 'hint' }, `This is your one chance to buy back the level the boon cost you: pay now, or it is lost for good.`) : null,
                p.boon ? h('div', {},
                    h('p', { class: 'hint' }, `It is a boon: you may take it free. The ${p.group} will think one level less of you until you buy that level back from them in a Trade phase.`),
                    h('button', { class: 'btn', 'data-act': 'take-boon', onclick: () => { ui.payWith = null; act({ type: 'trade', act: 'accept', boon: true }); } }, 'Take it as a boon (free)')) : null,
                mine.length ? h('div', {},
                    h('h3', {}, 'Pay with your things?'),
                    h('p', { class: 'hint' }, `You have ${st.ch.gold} gold. Anything you hand over counts at its basic price, and they give no change.`),
                    ...mine.map(m => h('button', { class: `btn row${chosen.has(m.uid) ? ' on' : ''}`, 'data-pay': m.uid, onclick: () => {
                        const set = new Set(ui.payWith ?? []); set.has(m.uid) ? set.delete(m.uid) : set.add(m.uid); ui.payWith = [...set]; render();
                    } }, ico(m.name), h('span', { class: 'rl' }, h('b', {}, `${chosen.has(m.uid) ? '\u2713 ' : ''}${m.name}`), h('small', {}, m.sub)), h('em', {}, `${m.price}g`)))) : null,
                h('p', { class: 'bigline' }, chosen.size ? `You pay ${goldDue} gold plus ${chosen.size} thing${chosen.size === 1 ? '' : 's'}` : `You pay ${p.price} gold`,
                    worth > p.price ? h('small', {}, ` (${worth - p.price} gold over: no change)`) : null),
                !ok ? h('p', { class: 'hint' }, `You are ${short} gold short: hand over more.`) : null,
                h('div', { class: 'row2' },
                    h('button', { class: 'btn primary', 'data-act': 'buy-ok', disabled: !ok, onclick: () => { const items = [...chosen]; ui.payWith = null; act({ type: 'trade', act: 'accept', items }); } }, p.repay != null ? 'Pay' : p.boon ? `Pay ${p.price} gold` : 'Buy'),
                    h('button', { class: 'btn', onclick: () => { ui.payWith = null; act({ type: 'trade', act: 'decline' }); } }, 'No thanks'))));
        }
        const goods = stockOf(st, data, p.group), mine = sellable(st, data);
        const sel = (ui.tradePick ??= { buy: null, sell: [], info: null });
        sel.sell = sel.sell.filter(u => mine.some(m => m.uid === u));
        if (sel.buy != null && !goods.some(g => g.idx === sel.buy)) sel.buy = null;
        const fresh = !p.mode && !(p.sold?.length) && !p.drinks;
        const chosenSell = mine.filter(m => sel.sell.includes(m.uid)), sellSum = chosenSell.reduce((n, m) => n + m.price, 0);
        const chosenBuy = sel.buy != null ? goods.find(g => g.idx === sel.buy) : null;
        const pickBuy = idx => { sel.buy = sel.buy === idx ? null : idx; if (sel.buy != null) sel.sell = []; render(); };
        const pickSell = uid => { const k = sel.sell.indexOf(uid); if (k >= 0) sel.sell.splice(k, 1); else { sel.sell.push(uid); sel.buy = null; } render(); };
        const infoOf = it => { const { card, faces, facts } = itemParts(it); return h('div', { class: 'ti-info itemsheet' }, card ?? h('div', { class: 'faces' }, ...faces), ...facts.map(t => h('p', {}, t))); };
        // one row: a box to select it, and the rest of the row opens what it is
        const item = ({ key, name, sub, price, selected, disabled, onSelect, info }) => h('div', { class: `tradeitem${selected ? ' sel' : ''}${disabled ? ' off' : ''}`, 'data-item': key },
            h('div', { class: 'ti-row' },
                h('button', { class: 'ti-check', role: 'checkbox', 'aria-checked': selected ? 'true' : 'false', 'aria-label': `${selected ? 'Deselect' : 'Select'} ${name}`, disabled: disabled || null, onclick: onSelect }, selected ? '\u2713' : ''),
                h('button', { class: 'ti-body', 'aria-expanded': sel.info === key ? 'true' : 'false', onclick: () => { sel.info = sel.info === key ? null : key; render(); } },
                    ico(name), h('span', { class: 'rl' }, h('b', {}, name), h('small', {}, sub)), h('em', {}, `${price}g`), h('span', { class: 'ti-i', 'aria-hidden': 'true' }, sel.info === key ? '\u25BE' : '\u25B8'))),
            sel.info === key ? info : null);
        const summary = chosenBuy ? `Buy the ${chosenBuy.name}. Its price comes from a roll on the Meeting Table (basic ${chosenBuy.base} gold).`
            : chosenSell.length ? `Sell ${chosenSell.length} thing${chosenSell.length === 1 ? '' : 's'} for ${sellSum} gold.`
                : p.mode === 'sell' ? `You have sold ${p.sold.length} thing${p.sold.length === 1 ? '' : 's'} so far. Sell more, or press Done.`
                    : 'Tick the things you want to sell, or one thing to buy. Tap a name to see what it is.';
        const go = () => {
            if (chosenBuy) { const idx = sel.buy; ui.tradePick = null; act({ type: 'trade', act: 'buy', idx }); }
            else if (chosenSell.length) { const items = chosenSell.map(m => m.uid); ui.tradePick = null; act({ type: 'trade', act: 'sell', items }); }
        };
        const tradeBar = h('div', { class: 'trade-bar' },
                h('p', { class: 'tb-sum', 'data-trade-summary': '1' }, summary),
                h('div', { class: 'row-end tb-actions' },
                    fresh ? h('button', { class: 'btn', 'data-act': 'trade-cancel', onclick: () => { ui.tradePick = null; act({ type: 'trade', act: 'back' }); } }, 'Cancel')
                        : h('button', { class: 'btn', 'data-act': 'trade-done', onclick: () => { ui.tradePick = null; act({ type: 'trade', act: 'done' }); } }, 'Done'),
                    h('button', { class: 'btn primary', 'data-act': 'trade-go', disabled: !(chosenBuy || chosenSell.length) || null, onclick: go },
                        chosenBuy ? `Buy ${chosenBuy.name}` : chosenSell.length ? `Sell ${chosenSell.length} for ${sellSum}g` : 'Choose first')),
                fresh ? null : h('p', { class: 'hint' }, 'You have begun dealing, so this phase can only be finished.'));
        return modal(`Trade with the ${p.group}`, h('div', { class: 'trade' },
            ask(`Trade phase with the ${p.group} at ${nameOfClearing(st.ch.at)}.`, 'Sell any number of things at their basic price, or buy one thing: a purchase is priced by a roll on the Meeting Table, so how they feel about you matters.', { compact: true }),
            ...(() => {
                const choices = groupChoices(p);
                return choices.length > 1 ? [h('h3', {}, 'Trade with'),
                    h('div', { class: 'row2 grouppick' }, ...choices.map(c => h('button', { class: `btn${c.selected ? ' on' : ''}`, 'data-trade-group': c.group, 'aria-pressed': c.selected, disabled: !c.canSwitch && !c.selected,
                        onclick: () => { if (!c.selected) act({ type: 'trade', act: 'group', group: c.group }); } }, `${c.selected ? '\u2713 ' : ''}${c.group}`))),
                    h('p', { class: 'hint' }, c0Hint(choices))] : [];
            })(),
            h('p', { class: 'hint' }, `Relationship: ${REL_NAMES[String(st.ch.rel?.[p.group] ?? 0)]}. You have ${st.ch.gold} gold.${(st.ch.rel?.[p.group] ?? 0) <= -2 ? ' They are your enemies: expect an insult or a fight, not a price.' : ''}`),
            ...(() => {
                const cost = drinksCost(st, data, p.group), owed = (st.ch.boons ?? []).map((b, n) => ({ ...b, n })).filter(b => b.group === p.group);
                return [
                    p.drinks ? h('p', { class: 'hint' }, `You have bought drinks for the ${p.group} (${p.drinksCost} gold): they count one level friendlier this phase.`)
                        : h('button', { class: 'btn row', 'data-act': 'drinks', disabled: p.mode === 'sell' || st.ch.gold < cost, onclick: () => act({ type: 'trade', act: 'drinks' }) },
                            h('span', { class: 'rl' }, h('b', {}, 'Buy drinks'), h('small', {}, `one gold for each of them here; one level friendlier for this phase's deal`)), h('em', {}, `${cost}g`)),
                    ...(owed.length ? [h('h3', {}, 'Boons you owe'),
                        ...owed.map(b => h('button', { class: 'btn row', 'data-act': 'repay', disabled: p.mode === 'sell', onclick: () => act({ type: 'trade', act: 'repay', n: b.n }) },
                            h('span', { class: 'rl' }, h('b', {}, `Win back goodwill: ${b.what}`), h('small', {}, `one roll only; if you do not buy the level back now, it is lost for good`)), h('em', {}, `${b.price}g`)))] : []),
                ];
            })(),
            h('h3', {}, 'For sale'),
            ...(goods.length ? goods.map(g => item({ key: `buy:${g.idx}`, name: g.name, sub: g.sub, price: g.base, selected: sel.buy === g.idx, disabled: p.mode === 'sell', onSelect: () => pickBuy(g.idx), info: infoOf({ kind: g.kind, id: g.id }) })) : [h('p', { class: 'hint' }, 'Nothing for sale.')]),
            h('h3', {}, 'Yours'),
            ...(mine.length ? mine.map(m => item({ key: `sell:${m.uid}`, name: m.name, sub: m.sub, price: m.price, selected: sel.sell.includes(m.uid), disabled: p.mode === 'buy', onSelect: () => pickSell(m.uid), info: infoOf(st.ch.items.find(i => i.uid === m.uid)) })) : [h('p', { class: 'hint' }, 'You have nothing to sell.')])
            ), { footer: tradeBar });
    }

    function hireSheet(p) {
        if (p.type === 'hire-offer') {
            if (p.insult) return modal(`${p.group}: ${p.insult}!`, h('div', {},
                offerDice(p),
                canPayOffer(st, p)
                    ? h('p', {}, `The ${p.group} are offended. Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'} to calm things, or they block you.`)
                    : h('p', {}, `The ${p.group} challenge you. Under the Disgust curse you cannot pay Fame, so they will block you and fight.`),
                canPayOffer(st, p) ? h('button', { class: 'btn', onclick: () => act({ type: 'hire', act: 'pay' }) }, `Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'}`) : null,
                h('button', { class: 'btn', onclick: () => act({ type: 'hire', act: 'fight' }) }, canPayOffer(st, p) ? 'Refuse' : 'Fight')));
            return modal(`Hire ${p.names.length === 1 ? p.names[0] : 'the ' + p.group}`, h('div', {},
                ask(`${p.names.length === 1 ? p.names[0] : 'The ' + p.group} will join you for ${p.price} gold.`, 'That is their wages times your Meeting Table roll. Hire them to pay it now, or say no thanks and keep your gold.'),
                offerDice(p) ?? h('p', {}, p.why),
                h('p', { class: 'bigline' }, `${p.price} gold`, h('small', {}, ` (wages ${p.wage} x ${p.mult})`)),
                p.boon ? h('div', {},
                    h('p', { class: 'hint' }, `It is a boon: they will join you free, but the ${p.group} will think one level less of you until you buy that level back from their leader in a Trade phase.`),
                    h('button', { class: 'btn', 'data-act': 'take-boon', onclick: () => act({ type: 'hire', act: 'accept', boon: true }) }, 'Take it as a boon (free)')) : null,
                h('p', { class: 'hint' }, 'Hired for 14 days. They follow you and fight beside you.'),
                h('div', { class: 'row2' },
                    h('button', { class: 'btn primary', disabled: !p.affordable, onclick: () => act({ type: 'hire', act: 'accept' }) }, p.boon ? `Pay ${p.price} gold` : 'Hire'),
                    h('button', { class: 'btn', onclick: () => act({ type: 'hire', act: 'decline' }) }, 'No thanks'))));
        }
        return modal('Hire', h('div', {},
            ask(`Hire phase at ${nameOfClearing(st.ch.at)}: choose whom to ask.`, 'Hired natives follow you and fight beside you for 14 days. You pay their wages multiplied by a roll on the Meeting Table, so you see the price only after you choose a group.'),
            h('p', { class: 'hint' }, `You have ${st.ch.gold} gold. The price is the wages times a roll on the Meeting Table. Relationships: ${p.options.map(o => `${o.group} ${REL_NAMES[String(st.ch.rel?.[o.group] ?? 0)]}`).join(', ')}.`),
            h('button', { class: 'btn row' + (ui.drinks ? ' on' : ''), 'data-act': 'drinks-toggle', onclick: () => { ui.drinks = !ui.drinks; render(); } },
                h('span', { class: 'rl' }, h('b', {}, `${ui.drinks ? '\u2713 ' : ''}Buy drinks first`), h('small', {}, 'one gold for each of them here, hired or not; one level friendlier for the roll')), h('em', {}, ui.drinks ? 'on' : 'off')),
            ...p.options.map(o => { const dc = drinksCost(st, data, o.group); return h('button', { class: 'btn row', disabled: ui.drinks && st.ch.gold < dc, onclick: () => { const drinks = !!ui.drinks; ui.drinks = false; act({ type: 'hire', act: 'pick', group: o.group, rehire: !!o.rehire, drinks }); } },
                nativePic(o.members?.[0]) ? h('img', { class: 'ico', src: nativePic(o.members[0]), alt: '' }) : null, h('span', { class: 'rl' }, h('b', {}, `${o.group}${o.rehire ? ' (extend hire)' : ''}`), h('small', {}, o.names.join(', ') + (ui.drinks ? ` (drinks ${dc}g)` : ''))), h('em', {}, `wages ${o.wage}g`)); }),
            h('button', { class: 'btn', 'data-act': 'hire-back', onclick: () => act({ type: 'hire', act: 'back' }) }, 'Back')));
    }

    // One treasure site the way the printed Setup Card words it; the same sentence heads the site in the clearing sheet.
    // A site card he found by looting: what each Loot roll on it gives (the card's own table), and what it demands.
    function siteCardRow(cid, bare = false) {
        const box = st.twt?.[cid], name = data.treasures?.[cid]?.name ?? box?.name ?? cid;
        const T = data.tables?.twtSiteTables?.[box?.box ?? name] ?? {};
        const gave = n => (st.gone ?? {})[n] ? ' (already taken)' : '';
        const what = (res, ct) => {
            const named = k => box?.contents?.find(c => c.kind === k)?.name;
            switch (res) {
                case 'weapon': return `a weapon: ${named('weapon') ?? 'a weapon'}`;
                case 'horse': return `a horse: ${named('horse') ?? 'a horse'}`;
                case 'armor': return `armor: ${named('armor') ?? 'a suit of armor'}`;
                case 'treasure': return box?.large?.length ? `a Large treasure (${box.large.length} left)` : 'a Large treasure (none left)';
                case 'gold': return 'one piece of gold';
                case 'curse': return 'a curse (roll on the Curses table)';
                case 'heal': return 'all your fatigue and wounds are healed';
                case 'power_pit': return 'the Power of the Pit';
                case 'teleport_cave': return 'a pull toward the caves';
                case 'wish': return 'a wish';
                case 'peer_any': return 'your sight ranges far';
                default: return 'nothing happens';
            }
        };
        const tm = (box?.box ?? name) === 'Crypt of the Knight' ? 'Needs a Tremendous-strength chit or the Lost Keys on every roll.' : 'Needs: nothing special.';
        return h('div', { class: 'crow site', 'data-sitecard': cid }, h('div', { class: 'crow-t' }, bare ? null : h('b', {}, `${name} (found by looting)`), h('small', {}, `A place you can search here with a Loot phase, one roll on its own table. ${tm}`),
            h('div', { class: 'twtrows' }, ...Object.entries(T).map(([roll, res]) => h('div', { class: 'twtrow' }, h('b', {}, roll), h('span', {}, what(res)))))));
    }
    function siteCardText(e) {
        const g = data.monsters[e.guardian]?.name ?? e.guardian;
        const special = e.special ? ` Needs: ${e.special.replace('fatigue_asterisk', 'an asterisk of effort').replace('fatigue_t,key', 'a Tremendous-strength chit or the Lost Keys')}.` : '';
        return `${e.name}: ${e.small} Small, ${e.large} Large${e.spells?.length ? `, spells ${e.spells.join(', ')}` : ''}. Guardian: ${g} (Monster Roll ${e.row}). Chit printed with clearing ${e.chitNumber}.${special}`;
    }
    // A site: whether you have discovered it and, once you have, what is left in it (how many things, and how many of those are Great Treasures),
    // what looting it demands, and what guards it.
    function siteNeeds(name) {
        const asterisk = st.ch.chits.some(x => x.state === 'active' && x.effort > 0);
        const tChit = st.ch.chits.some(x => x.state === 'active' && lvl(x.strength) >= 4) || st.ch.items.some(i => i.id === 'lost-keys' && i.active);
        if (name === 'Cairns') return `Needs: one asterisk of effort for every Loot roll, found or not (a chit with an asterisk is tired). ${asterisk ? 'You have one ready.' : 'You have none ready now, so you could not loot it.'}`;
        if (name === 'Pool') return `Needs: one asterisk of effort each time something is actually taken. ${asterisk ? 'You have one ready.' : 'You have none ready now.'}`;
        if (name === 'Vault') return st.sitesOpen?.Vault ? 'The Vault is open: it stays open for everyone.' : `Needs: the Vault is sealed until it is opened with a Tremendous-strength chit, or the Lost Keys. ${tChit ? 'You can open it.' : 'You cannot open it now.'}`;
        return 'Needs: nothing to loot it.';
    }
    // What the printed Treasure Set Up Card tells every player, before anything is discovered.
    const SPELL_WORD = t => `Type ${t}`;
    function setupDwelling(kind) {
        const e = data.setupcard?.dwellings?.find(x => x.name === kind || x.rsName === kind);
        if (!e) return '';
        const goods = Object.entries(e.treasures?.counters ?? {}).map(([n, k]) => `${n}${k > 1 ? ` \u00D7${k}` : ''}`).join(', ');
        return `Setup card: the ${e.group} live here (${e.nativeCounters} native counters). They keep ${e.treasures?.small ?? 0} Small treasures${goods ? ` and: ${goods}` : ''}.`;
    }
    // The pile at a site drawn top to bottom, the way a Loot roll counts it: a roll of 1 takes the top card, 2 the second, and so on to 6.
    // Only what the Setup Card tells everyone is drawn: Large above Small, never which card is Great. Spell cards lie apart, by type.
    const REACH = 6;
    function lootStack(name, pile) {
        const sizes = pile.filter(it => it.kind !== 'spell').map(it => ((data.treasures[it.id]?.kind ?? 'small') === 'small' ? 'small' : 'large'));
        const groups = [];
        sizes.forEach((s, i) => { const g = groups[groups.length - 1]; if (g && g.size === s) g.to = i + 1; else groups.push({ size: s, from: i + 1, to: i + 1 }); });
        const rows = [];
        groups.forEach(g => {
            const cards = [];
            for (let p = g.from; p <= g.to; p++) cards.push(h('div', { class: `ls-card ${g.size}${p > REACH ? ' deep' : ''}`, 'data-pos': String(p) },
                h('span', { class: 'ls-n' }, String(p)), h('span', { class: 'ls-t' }, g.size === 'large' ? 'Large' : 'Small'), h('span', { class: 'ls-r' }, p <= REACH ? `Loot roll ${p}` : 'too deep')));
            const n = g.to - g.from + 1;
            rows.push(h('div', { class: `ls-group ${g.size}` },
                h('div', { class: 'ls-label' }, h('b', {}, `${n} ${g.size === 'large' ? 'Large' : 'Small'}`), h('small', {}, n > 1 ? `${g.from}\u2013${g.to}` : `${g.from}`)),
                h('div', { class: 'ls-cards' }, ...cards)));
            if (g.from <= REACH && g.to > REACH) rows[rows.length - 1].classList.add('crosses');
        });
        const spells = (st.spellBox?.sites?.[name] ?? []).map(sp => data.spells?.[sp.id]?.type).filter(Boolean);
        return h('div', { class: 'lootstack', 'data-site': name },
            h('div', { class: 'ls-head' }, 'THE PILE, TOP FIRST', h('small', {}, `a Loot roll of 1\u2013${REACH} takes that card`)),
            ...rows,
            sizes.length > REACH ? h('p', { class: 'ls-note' }, `Cards below the ${REACH}th cannot be reached until those above are taken.`) : null,
            spells.length ? h('div', { class: 'ls-spells' }, h('b', {}, 'Spell cards kept apart'), h('small', {}, `${spells.map(t => `Type ${t}`).join(', ')}: read them with Reading Runes, they are not in the pile.`)) : null);
    }
    function siteLine(c) {
        const found = st.ch.discovered.sites.includes(c.id);
        const e = data.setupcard?.sites?.find(x => x.name === c.name);
        const needs = siteNeeds(c.name);
        const status = [];
        if (!found) status.push(h('p', { class: 'setupline' }, h('b', {}, 'Not discovered yet. '), 'Search with Locate to discover it. What it holds is unknown until you do.'));
        else {
            const pile = st.sites?.[c.name] ?? [];
            const spells = st.spellBox?.sites?.[c.name]?.length ?? 0;                  // spell cards stay in their box: only readable with runes
            const treasures = pile.filter(it => it.kind !== 'spell');
            const small = treasures.filter(it => (data.treasures[it.id]?.kind ?? 'small') === 'small').length, large = treasures.length - small;
            const left = pile.length ? [`${small} Small`, `${large} Large`, ...(spells ? [`${spells} spell${spells === 1 ? '' : 's'}`] : [])].join(', ') : 'nothing';
            status.push(h('p', { class: 'setupline' }, h('b', {}, pile.length ? 'Discovered: you may loot it. ' : 'Discovered, and empty. '), pile.length ? `Left: ${left}.` : ''));
            if (pile.length) status.push(lootStack(c.name, pile), h('p', { class: 'setupline dim' }, 'Which are Great is not known until they are looted.'));
        }
        status.push(h('p', { class: 'setupline dim' }, needs));
        return h('div', { class: 'sitecard' }, e ? h('p', { class: 'setupline card' }, siteCardText(e)) : null, ...status);
    }

    // What a Search here could reach, for the choice sheets: each discovered site's loot stack, what lies on the ground, and any site card he holds.
    // One card per thing that can be searched here: what it is, what could come of it, and the button that does it at the bottom of the card.
    function searchCards(p) {
        const at = st.ch.at, tile = tileOf(at), n = numOf(at), opts = p.options ?? [], cards = [];
        const go = t => act({ type: 'search-table', table: t });
        const card = (cls, title, body, table, label, { disabled = false, why = null } = {}) => h('section', { class: `searchcard ${cls}`, 'data-card': table },
            h('h3', {}, title), ...body, why ? h('p', { class: 'hint' }, why) : null,
            h('button', { class: 'btn primary', 'data-table': table, disabled, onclick: () => go(table) }, label));
        const sites = st.ch.onRoad ? [] : st.chits.filter(x => x.kind === 'site' && x.tile === tile && x.num === n && !x.pile && st.ch.discovered.sites.includes(x.id));
        if (opts.includes('peer')) cards.push(card('peer', 'Peer around the clearing', [h('p', {}, 'The Peer table turns up clues, hidden enemies and hidden paths.')], 'peer', 'Peer'));
        if (opts.includes('locate')) cards.push(card('locate', 'Locate what is hidden', [h('p', {}, 'Search the clearing for passages, clues and sites you have not discovered yet.')], 'locate', 'Locate'));
        if (opts.includes('loot')) {
            if (sites.length) for (const c of sites) cards.push(card('loot', `Loot the ${c.name}`, [siteLine(c)], 'loot', 'Loot'));
            else cards.push(card('loot', 'Loot a site', [h('p', {}, 'Take treasure from a site you have discovered in this clearing.')], 'loot', 'Loot', { disabled: true, why: 'No site here is discovered yet. Locate is how a site is found.' }));
        }
        if (opts.includes('ground')) { const g = st.abandoned?.[at] ?? []; cards.push(card('ground', 'Take what lies here', [h('p', {}, g.length ? `${g.map(i => nameOf(data, i)).join(', ')}.` : 'Nothing lies here.')], 'ground', 'Take it', { disabled: !g.length })); }
        if (opts.includes('sitecard')) for (const cid of st.ch.siteCards?.[at] ?? []) cards.push(card('sitecard', `Loot the ${data.treasures?.[cid]?.name ?? 'site card'}`, [siteCardRow(cid, true)], 'sitecard', 'Loot'));
        if (opts.includes('runes')) cards.push(card('runes', 'Read the runes', [h('p', {}, 'Learn a spell from a site here, or from an artifact or book you carry.')], 'runes', 'Read'));
        for (const t of opts.filter(x => !['peer', 'locate', 'loot', 'ground', 'sitecard', 'runes'].includes(x))) cards.push(card(t, tableName(t), [], t, tableName(t)));
        return cards;
    }
    function hereBlocks() {
        const at = st.ch.at; if (!at || st.ch.onRoad) return [];
        const tile = tileOf(at), n = numOf(at), out = [];
        for (const c of st.chits.filter(x => x.kind === 'site' && x.tile === tile && x.num === n && !x.pile && st.ch.discovered.sites.includes(x.id)))
            out.push(h('details', { class: 'here-block', open: true }, h('summary', {}, `${c.name}: what Loot could reach`), siteLine(c)));
        const ground = st.abandoned?.[at] ?? [];
        if (ground.length) out.push(h('div', { class: 'here-block' }, h('h3', {}, 'On the ground'), h('p', { class: 'hint' }, ground.map(i => nameOf(data, i)).join(', ') + '.')));
        for (const cid of st.ch.siteCards?.[at] ?? []) out.push(h('div', { class: 'here-block' }, siteCardRow(cid)));
        return out.length ? [h('div', { class: 'here', 'data-here': 'search' }, ...out)] : [h('p', { class: 'hint' }, 'No site here is discovered yet, so Loot would find nothing: Locate is how a site is found.')];
    }
    function clearingSheet() {
        const id = ui.sel, tile = tileOf(id), n = numOf(id);
        const cdef = data.tile(tile).sides.normal.clearings.find(c => c.n === n);
        const here = st.ch.at === id && !st.ch.onRoad;
        const sections = [];
        const row = (k, text, sub, img) => h('div', { class: `crow ${k}` }, img ? (typeof img === 'string' ? h('img', { class: 'ico', src: img, alt: '' }) : img) : null, h('div', { class: 'crow-t' }, h('b', {}, text), sub ? (typeof sub === 'string' ? h('small', {}, sub) : sub) : null));
        // you
        const srcs = colorSources(st, data, id);
        if (srcs.length) sections.push(['Magic here', srcs.map(x => row('magic', x.color, x.why, colorChip(x.color)))]);
        if (here) sections.push(['You', [row('me', st.ch.name, st.ch.hidden ? 'hidden: monsters cannot block you' : 'in plain sight')]]);
        // dwelling and the people who live there
        const dw = st.dwellings.filter(d => d.at === id);
        const natHere = st.nats.filter(x => !x.dead && !x.hired && x.loc?.c === id);
        const byGroup = {};
        for (const x of natHere) (byGroup[data.natives[x.id].group] ??= []).push(data.natives[x.id]);
        const REL = { '-2': 'enemy', '-1': 'unfriendly', '0': 'neutral', '1': 'friendly', '2': 'ally' };
        const people = Object.entries(byGroup).map(([g, list]) => row('nat', `${g}: ${list.length} native${list.length === 1 ? '' : 's'}`,
            `${REL[String(st.ch.rel?.[g] ?? 0)]} to you; ${list.map(x => x.name.replace(/^\w+ /, '')).join(', ')}`, data.art?.natives?.[(list.find(x => x.leader) ?? list[0]).id]));
        if (dw.length || people.length) sections.push(['Dwellings and natives', [...dw.map(d => row('dwelling', d.kind, `${setupDwelling(d.kind) || 'a dwelling: natives live and trade here'}`, data.art?.dwellings?.[d.kind])), ...people]]);
        // monsters
        const mons = {};
        for (const m of st.mons.filter(m => !m.dead && m.loc?.c === id)) (mons[data.monsters[m.id].name] ??= []).push(m);
        const monRows = Object.entries(mons).map(([name, l]) => {
            const md = data.monsters[l[0].id], ls = md.light;
            const blow = ls.attack === 'spell' ? `casts a Type ${ls.spell ?? ''} spell at ${ls.attackTime}` : ls.harm ? `harm ${ls.harm}${'*'.repeat(ls.stars || 0)} at ${ls.attackTime}` : `no attack on this side (${md.dark?.harm ? `harm ${md.dark.harm}${'*'.repeat(md.dark.stars || 0)} at ${md.dark.attackTime} on the other` : 'it only blocks'})`;
            const stats = `vuln ${md.vulnerability}${md.armored ? ' (armored)' : ''} \u00B7 ${blow} \u00B7 moves ${ls.moveTime}${md.flies ? ' \u00B7 flies' : ''}`;
            return row('mon', `${name}${l.length > 1 ? ` x${l.length}` : ''}`, `${stats}. It will block you if you are seen.`, data.art?.monstersColor?.[name] ?? data.art?.monsters?.[name]);
        });
        if (monRows.length) sections.push(['Monsters', monRows]);
        // chits
        const chitRows = [];
        for (const c of st.chits) {
            if (c.pile || c.tile !== tile) continue;
            if (c.clearing === n && c.up) chitRows.push(row(c.kind, c.kind === 'sound' ? `${c.name} (sound ${c.num})` : `${c.name} (site ${c.num})`, c.kind === 'site' ? siteLine(c) : 'monsters stir here', mrChit(c)));
            else if (!c.up && c.kind === 'site' && c.num === n && st.ch.discovered.sites.includes(c.id)) chitRows.push(row('site', `${c.name} (site ${c.num})`, siteLine(c), mrChit(c)));
        }
        for (const cid of st.ch.siteCards?.[id] ?? []) chitRows.push(siteCardRow(cid));
        if (chitRows.length) sections.push(['Chits and sites', chitRows]);
        const ground = (st.abandoned[id] ?? []);
        if (ground.length) sections.push(['On the ground', ground.map(i => row('loot', nameOf(data, i), 'anyone here may pick it up with a Loot phase'))]);
        const roads = roadsFrom(st, data, id);
        const KIND = { open: 'road', tunnel: 'tunnel', hidden: 'hidden path', secret: 'secret passage' };
        sections.push(['Roads', roads.length ? roads.map(r => row(r.usable ? 'road' : 'road off', `to ${nameOfClearing(r.to)}`, r.usable ? KIND[r.kind] : `${KIND[r.kind]} (not discovered)`)) : [row('road off', 'none', '')]]);
        const mtn = cdef.type === 'mountain' ? 'mountain clearing: entering takes two Move phases' : cdef.type === 'cave' ? 'cave clearing: no sunlight phases on the day you are in one' : 'woods clearing';
        return modal(nameOfClearing(id), h('div', { class: 'clearing' },
            h('p', { class: 'hint' }, mtn),
            ...sections.flatMap(([title, rows]) => [h('h3', {}, title), ...rows])),
            { close: () => { if (ui.peek) { ui.peek = false; ui.sel = null; } else { ui.sheet = null; ui.sel = null; } render(); } });
    }

    // A map chit as the game prints it: a square counter (sound red, warning yellow, treasure site gold), the name above and the clearing number
    // or tile letter below. RealmSpeak draws them the same way.
    const mrChit = c => {
        const kind = c.kind === 'sound' ? 'sound' : c.kind === 'warning' ? 'warning' : c.kind === 'site' ? 'site' : 'special';
        const second = c.kind === 'warning' ? (c.letter ?? '') : (c.num ?? '');
        return h('span', { class: `mrchit ${kind}`, role: 'img', 'aria-label': `${c.name}${second !== '' ? ` ${second}` : ''} ${c.kind === 'sound' ? 'sound' : c.kind === 'warning' ? 'warning' : 'site'} chit` },
            h('b', {}, c.name), second !== '' ? h('i', {}, String(second)) : null);
    };
    // What happened when his turn ended: chits turned up, creatures that came, natives that appeared, being blocked.
    function turnEndSheet() {
        const t = st.turnEnd;
        const lines = [];
        const KIND = { warning: 'warning chit', sound: 'sound chit', site: 'site chit', 'lost-city': 'the Lost City', 'lost-castle': 'the Lost Castle' };
        const monsterIcon = n => data.art?.monstersColor?.[n] ?? data.art?.monsters?.[n] ?? null;
        for (const c of t.chits) {
            const counts = new Map(); for (const n of c.summons) counts.set(n, (counts.get(n) ?? 0) + 1);
            const where = c.dest === t.at ? 'to your clearing' : c.dest ? `to clearing ${numOf(c.dest)}` : '';
            const out = counts.size
                ? h('span', { class: 'callout' }, h('small', {}, 'Calls out'), ...[...counts].map(([n, k]) => h('span', { class: 'who' }, monsterIcon(n) ? h('img', { class: 'ico', src: monsterIcon(n), alt: '' }) : null, h('b', {}, `${k > 1 ? k + ' ' : ''}${n}`))), h('small', {}, where))
                : h('span', { class: 'callout' }, h('small', {}, `Calls nothing out today${c.why ? `: ${c.why}` : ''}.`));
            lines.push(h('div', { class: 'crow chit' }, mrChit(c), out));
        }
        for (const a of t.arrivals.filter(a => a.why === 'prowls in your tile')) lines.push(h('div', { class: 'crow mon' }, h('b', {}, `${a.name} arrives`), h('small', {}, `it was prowling in this tile and comes to your clearing`)));
        for (const nn of t.natives) lines.push(h('div', { class: 'crow nat' }, h('b', {}, `The ${nn.group} appear`), h('small', {}, `${nn.count} of them, at the ${nn.at}`)));
        if (t.blocked) lines.push(h('div', { class: 'crow mon' }, h('b', {}, t.blockers.length ? `Blocked by ${[...new Set(t.blockers)].join(', ')}` : 'Your turn was cut short'), h('small', {}, 'the rest of your turn was lost')));
        if (!t.blocked && t.closedIn?.length) lines.push(h('div', { class: 'crow mon' }, h('b', {}, `${[...new Set(t.closedIn)].join(', ')} ${new Set(t.closedIn).size === 1 && t.closedIn.length === 1 ? 'arrives' : 'arrive'} and ${t.closedIn.length === 1 ? 'finds' : 'find'} you`), h('small', {}, 'your turn was already over, so nothing was lost')));
        const hide = r => /hide|hidden|seen/i.test(r ?? '');
        // Blocked: the phases still to come, extra ones included, are lost with the rest of the turn.
        const lostPhases = (t.blocked ? (st.plan ?? []).map((s, i) => ({ i, s })).filter(x => x.i >= (t.plan?.length ?? 0) && x.s && x.s.act !== 'nothing').map(x => ({ i: x.i, what: describeSlot(x.s) })) : []);
        const summary = t.plan?.length ? h('details', { class: 'daydid', open: true }, h('summary', {}, 'What you did today'),
            ...t.plan.map((r, i) => h('p', { class: `daydid-row${hide(r) ? ' hide' : ''}` }, h('b', {}, `Phase ${i + 1}`), ` ${(r ?? 'nothing').replace(/^Phase \d+:\s*/, '')}`)),
            ...lostPhases.map(l => h('p', { class: 'daydid-row lost' }, h('b', {}, `Phase ${l.i + 1}`), ` ${l.what}: lost, because you were blocked.`))) : null;
        const why = t.blocked ? `${t.blockers.length ? [...new Set(t.blockers)].join(', ') + ' closed in' : 'Your turn was cut short'}, so you are seen${lostPhases.length ? ` and your remaining ${lostPhases.length === 1 ? 'phase is' : 'phases are'} lost` : ''}.`
            : t.closedIn?.length ? `${[...new Set(t.closedIn)].join(', ')} found you after your turn was over, so you are seen. No phase was lost.`
            : t.hidden ? 'Nothing here can be set on you this evening unless you strike first.' : 'Whatever shares your clearing will fight you this evening.';
        const status = h('div', { class: `endstatus ${t.hidden ? 'hidden' : 'seen'}` }, h('b', {}, t.hidden ? 'You are hidden' : 'You are in plain sight'), h('small', {}, why));
        const callouts = lines.length ? [h('h3', {}, 'At the end of your turn'), ...lines] : [];
        return modal(`End of your turn at ${nameOfClearing(t.at)}`, h('div', { class: 'clearing' },
            status, summary, ...callouts,
            h('button', { class: 'btn primary', 'data-act': 'turn-ok', onclick: () => act({ type: 'continue' }) }, 'End turn')));
    }

    function charSheet() {
        const ch = st.ch;
        const chitEl = c => h('div', { class: `chit2 ${c.type} ${c.state}` }, h('b', {}, c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`), h('span', {}, '*'.repeat(c.effort) || '\u00A0'), h('small', {}, c.type === 'move' ? 'Move' : c.type === 'fight' ? 'Fight' : 'Magic'));
        const portrait = data.art?.characters?.[ch.id];
        return modal(ch.name, h('div', {},
            portrait ? h('button', { class: 'portrait', 'aria-label': 'Show the character card', onclick: () => { ui.sheet = 'card'; render(); } }, h('img', { src: portrait, alt: ch.name }), data.art?.cards?.[ch.id] ? h('small', {}, 'Tap for the character card') : null) : null,
            h('div', { class: 'chits' }, ch.chits.map(chitEl)),
            h('p', { class: 'hint' }, 'Gold, Fame and Notoriety are shown on the top bar. Fatigued chits are dim; wounded chits are crossed out.'),
            ...(ch.spells?.length ? [h('h3', {}, 'Spells'), ...ch.spells.map(id => h('div', { class: 'itemrow spellrow' }, h('button', { class: 'btn row', 'data-spell': id, onclick: () => { ui.spellId = id; ui.sheet = 'spell'; render(); } },
                h('span', { class: 'rl' }, h('b', {}, data.spells?.[id]?.name ?? id), h('small', {}, `Type ${data.spells?.[id]?.type ?? '?'} \u00B7 ${data.spells?.[id]?.color ?? 'any colour'} \u00B7 ${data.spells?.[id]?.duration ?? ''}`)),
                h('em', {}, castable(data.spells?.[id]) ? 'cast in the evening' : 'not yet'))))]
                : (data.characters[ch.id].stage4.spellsKnown ?? 0) ? [h('p', { class: 'hint' }, `Spells: one of type ${(data.characters[ch.id].stage4.spellTypes ?? []).join('/')} (cast in the evening, in the Encounter step).`)] : []),
            h('h3', {}, 'Carrying'),
            ...ch.items.map(it => {
                const canSwitch = st.pending?.type === 'phase' || st.pending?.type === 'plan';
                return h('div', { class: 'itemrow' },
                    h('button', { class: `btn row${it.active ? ' on' : ''}`, 'data-item': it.uid, 'aria-label': `About the ${nameOf(data, it)}`, onclick: () => { ui.itemUid = it.uid; ui.sheet = 'item'; render(); } },
                        ico(nameOf(data, it)), h('span', { class: 'rl' }, h('b', {}, nameOf(data, it) + (it.damaged ? ' (damaged)' : '') + (it.destroyed ? ' (destroyed)' : '')), h('small', {}, summaryOf(data, it))),
                        h('em', {}, `${WEIGHT_WORDS[weightOf(data, it)] ?? ''}`)),
                    h('button', { class: `switch${it.active ? ' on' : ''}`, role: 'switch', 'aria-checked': it.active ? 'true' : 'false', 'data-switch': it.uid, disabled: !canSwitch || it.destroyed || null,
                        'aria-label': `${nameOf(data, it)}: ${it.active ? 'active' : 'inactive'}`, onclick: () => { ui.keep = true; act({ type: 'tidy', item: it.uid }); } }, it.active ? 'Active' : 'Inactive'),
                );
            }),
            ch.items.length ? null : h('p', { class: 'hint' }, 'Nothing.'),
            ...(() => { const hs = st.nats.filter(n => n.hired && !n.dead); return hs.length ? [h('h3', {}, 'Hirelings'),
                ...hs.map(n => h('p', {}, `${data.natives[n.id].name} \u2014 term ends at midnight of day ${n.hiredUntil}`))] : []; })(),
            h('h3', {}, 'Standing'),
            h('p', {}, Object.entries(ch.rel).map(([g, r]) => `${g}: ${REL_NAMES[String(r)]}`).join(' · '))),
            { close: () => { ui.sheet = null; render(); } });
    }

    // ---- the colours of magic ----
    const COLOR_ART = { White: 'white', Black: 'black', Grey: 'gray', Purple: 'purple', Gold: 'gold' };
    const colorChip = (name, { big = false } = {}) => h('span', { class: `mcolor ${name.toLowerCase()}${big ? ' big' : ''}` },
        h('img', { src: `art/colormagic/${COLOR_ART[name]}.gif`, alt: '', onerror: e => e.target.remove() }), h('b', {}, name));
    function calendarSheet() {
        const last = st.lastDay ?? 28, weeks = Math.ceil(last / 7);
        const cell = d => {
            const cols = dayColors(d, st.lastDay ?? 28);
            return h('div', { class: `calday${d === st.day ? ' today' : ''}${d < st.day ? ' past' : ''}${cols.length ? ' magic' : ''}` },
                h('b', {}, String(d)), ...cols.map(c => h('i', { class: `dot ${c.toLowerCase()}`, title: c })));
        };
        const here = colorSources(st, data, st.ch.at);
        return modal('Calendar and magic', h('div', { class: 'calendar' },
            ask(isMagicDay(st.day) ? `Today the land is filled with ${dayColors(st.day, st.lastDay ?? 28).join(' and ')} magic.` : `Day ${st.day}${timed(st) ? ` of ${last}` : ''}: an ordinary day for magic.`,
                'On the seventh day of each week one colour of magic fills the whole realm, from sunrise to midnight, in every clearing. Spells of that colour can be cast anywhere that evening.'),
            h('div', { class: 'calgrid' }, ...Array.from({ length: weeks }, (_, w) => h('div', { class: 'calweek' }, h('small', {}, `Week ${w + 1}`), ...Array.from({ length: 7 }, (_, k) => cell(w * 7 + k + 1))))),
            h('h3', {}, 'The week\'s colours'),
            ...Array.from({ length: weeks }, (_, w) => h('p', { class: 'calrow' }, h('b', {}, `Day ${(w + 1) * 7}`), ...dayColors((w + 1) * 7, st.lastDay ?? 28).map(c => colorChip(c)))),
            h('h3', {}, 'What each colour is'),
            ...COLORS.map(c => h('p', { class: 'calrow' }, colorChip(c), h('span', {}, COLOR_MEANING[c]))),
            h('h3', {}, `In your clearing (${nameOfClearing(st.ch.at)})`),
            here.length ? h('div', {}, ...here.map(x => h('p', { class: 'calrow' }, colorChip(x.color), h('span', {}, x.why)))) : h('p', { class: 'hint' }, 'No colour of magic is present here today.'),
            h('p', { class: 'hint' }, 'Colours of magic come from the seventh day and from a Chapel (White).')),
            { close: () => { ui.sheet = null; render(); } });
    }

    // Prophecy: the details of the phase being chosen (where to, which table, which chit), then it is sent.
    function pickSheet(p) {
        const act2 = ui.pickAct, send = slot => { ui.pickAct = null; act({ type: 'pick', slot }); };
        const rows = [];
        if (act2 === 'move') rows.push(h('p', { class: 'hint' }, 'Where to?'), ...(p.moves ?? []).map(id => h('button', { class: 'btn', 'data-pick-to': id, onclick: () => send({ act: 'move', to: id }) }, nameOfClearing(id))));
        else if (act2 === 'search') rows.push(h('p', { class: 'hint' }, 'Which Search?'), ...(p.tables ?? []).map(t => h('button', { class: 'btn', 'data-pick-table': t, onclick: () => send({ act: 'search', table: t }) }, tableName(t))));
        else if (act2 === 'alert') {
            rows.push(h('p', { class: 'hint' }, 'Ready your weapon, or alert a Magic chit (time 0, tires at Midnight if unused).'), h('button', { class: 'btn', onclick: () => send({ act: 'alert' }) }, 'Weapon'),
                ...st.ch.chits.filter(c => c.type === 'magic' && c.state === 'active').map(c => h('button', { class: 'btn', 'data-pick-magic': c.id, onclick: () => send({ act: 'alert', magic: c.id }) }, `Magic ${c.numeral}${c.time}${'*'.repeat(c.effort)}`)));
        } else rows.push(h('button', { class: 'btn primary', onclick: () => send({ act: act2 }) }, `Do it: ${ACT_LABEL[act2] ?? act2}`));
        return modal(`Phase ${p.i + 1}: ${ACT_LABEL[act2] ?? act2}`, h('div', { class: 'restsheet' }, ...rows), { close: () => { ui.pickAct = null; render(); } });
    }

    function copyInvite() {
        const link = inviteLink(race);
        (navigator.clipboard?.writeText(link) ?? Promise.reject()).then(() => { ui.toast = 'Invite copied.'; render(); setTimeout(() => { ui.toast = null; render(); }, 2000); },
            () => { ui.invite = link; ui.sheet = 'race'; render(); });
    }
    function raceSheet() {
        const rows = standings.length ? standings : [];
        const stat = x => x.status === 'finished' ? `finished ${x.score >= 0 ? '+' : ''}${x.score}` : x.status === 'died' ? `died, day ${x.day}` : `day ${x.day}`;
        return modal('The race', h('div', { class: 'racelist' },
            h('p', { class: 'hint' }, 'Everyone plays the same realm. A green dot means they have the game open right now.'),
            ...rows.map(x => h('div', { class: `raceplayer${x.seat === race.seat ? ' me' : ''}`, 'data-seat': x.seat },
                h('i', { class: `pdot${x.present ? ' on' : ''}`, 'aria-label': x.present ? 'here now' : 'away' }),
                h('span', { class: 'rp-main' }, h('b', {}, x.name + (x.seat === race.seat ? ' (you)' : '')), h('small', {}, `${x.character ?? ''} \u00b7 ${stat(x)}`)),
                h('span', { class: 'rp-nums' }, `${x.gold} gold \u00b7 ${x.fame} fame \u00b7 ${x.notoriety} notor.`))),
            race.invite ? h('div', {}, h('button', { class: 'btn', 'data-act': 'copy-invite', onclick: copyInvite }, 'Copy invite link'), ui.invite ? h('input', { class: 'invitebox', readonly: true, value: ui.invite, onfocus: e => e.target.select() }) : null) : null),
            { close: () => { ui.sheet = null; render(); } });
    }

    function menuSheet() {
        const go = (sheet) => () => { ui.sheet = sheet; render(); };
        const row = (label, hint, onclick, extra = {}) => h('button', { class: `mrow${extra.danger ? ' danger' : ''}`, 'data-act': extra.act ?? null, onclick },
            h('span', { class: 't' }, h('span', {}, label), hint ? h('small', {}, hint) : null), extra.danger ? null : h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'));
        return modal('Menu', h('div', { class: 'menulist' },
            ...(race ? [h('h4', {}, 'The race'),
                row('Standings', `${standings.filter(x => x.present).length} here now`, go('race'), { act: 'open-race' }),
                ...(race.invite ? [row('Invite someone', 'Copy the link to send them', copyInvite, { act: 'invite' })] : [])] : []),
            h('h4', {}, 'This game'),
            row('Journal', 'What has happened, day by day', go('log')),
            row('Calendar and magic', 'The colours of magic through the month', go('calendar'), { act: 'open-calendar' }),
            row('Show the whole realm', null, () => { ui.sheet = null; map.fit(); render(); }),
            ...(race ? [] : [row('This game\u2019s record', null, () => { persist(true); ctx.go('history', { id: st.session?.id, back: 'game' }); })]),
            h('h4', {}, 'Reference'),
            row('How to play', null, go('help')),
            row('Map key', null, go('key')),
            row('The Setup Card', 'What the printed card tells everyone', go('setupcard'), { act: 'setup-card' }),
            ...(data.art?.misc?.meetingTable ? [row('Tables', 'Meeting, Search, Missile, Pit', go('tables'))] : []),
            h('h4', {}, 'Other'),
            row('Report a problem', null, go('bug'), { act: 'menu-bug' }),
            row('Back to the title screen', null, () => { conn?.stop(); ctx.go('title'); }),
            row(race ? 'Leave the race (your game stays on the server)' : 'Abandon this game', null, race ? abandon : () => { ui.sheet = 'confirm-abandon'; render(); }, { danger: true })),
            { close: () => { ui.sheet = null; render(); } });
    }

    // ---- "Report a problem": a description, and the game's record and state sent to the server ----
    function bugSheet() {
        const b = ui.bug ??= { text: '', status: 'idle', id: null, error: null, packed: null };
        const close = { close: () => { ui.sheet = null; if (b.status === 'sent') ui.bug = null; render(); } };
        const kb = n => (n < 1024 ? `${n} bytes` : `${Math.round(n / 1024)} KB`);
        if (b.status === 'sent') return modal('Report sent', h('div', { class: 'bugform' },
            h('p', {}, `Thank you. Your report is number ${b.id}. It has your description, this game's record and log, and its current state.`),
            h('button', { class: 'btn primary', 'data-act': 'bug-done', onclick: close.close }, 'Done')), close);
        const sending = b.status === 'sending';
        const area = h('textarea', { class: 'bugtext', rows: 5, placeholder: 'What happened, and what did you expect? (Which screen, which action.)', 'data-bug-text': '', disabled: sending || null,
            oninput: e => { b.text = e.target.value; ok.disabled = !b.text.trim() || sending; } });
        area.value = b.text;
        const ok = h('button', { class: 'btn primary', 'data-act': 'bug-send', disabled: !b.text.trim() || sending || null, onclick: async () => {
            b.status = 'sending'; b.error = null; render();
            try {
                b.packed = await collectReport({ st, rec, version: VERSION, ui });
                b.id = await sendReport(b.text.trim(), b.packed);
                b.status = 'sent';
            } catch (e) { b.status = 'failed'; b.error = e.message; }
            render();
        } }, sending ? 'Sending\u2026' : b.status === 'failed' ? 'Try again' : 'OK, send it');
        return modal('Report a problem', h('div', { class: 'bugform' },
            h('p', { class: 'hint' }, 'Describe what went wrong. Saying OK sends your description with this game\'s record (every action and the whole log), its current state, your other recorded games, and your browser and screen size to the server.'),
            area,
            b.status === 'failed' ? h('p', { class: 'chk-bad' }, `Could not send: ${b.error}`) : null,
            b.status === 'failed' && b.packed ? h('button', { class: 'btn', 'data-act': 'bug-save', onclick: () => {
                const url = URL.createObjectURL(new Blob([b.packed.text], { type: 'application/json' }));
                const a = Object.assign(document.createElement('a'), { href: url, download: `magic-realm-report-${Date.now()}.json` });
                document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
            } }, `Save it as a file instead (${kb(b.packed.bytes)})`) : null,
            h('div', { class: 'row2' }, h('button', { class: 'btn', 'data-act': 'bug-cancel', disabled: sending || null, onclick: close.close }, 'Cancel'), ok)), close);
    }

    // Resting: the twelve chits are on the table; tap the one you want back. A chit worth two asterisks needs "change": then tap the ready
    // one-asterisk chit you give up for it.
    // Cairns / Pool: tap the chit that pays an asterisk of effort (a two-asterisk chit may make change for a tired one-asterisk chit).
    function effortSheet(p) {
        const sameKind = (a, b) => a.type === b.type && (a.strength ?? a.numeral) === (b.strength ?? b.numeral) && a.time === b.time && a.effort === b.effort;
        const chits = st.ch.chits;
        const optIdx = p.options.map((o, n) => ({ o, n }));
        const payer = id => { const c = chits.find(x => x.id === id); return optIdx.filter(({ o }) => sameKind(chits.find(x => x.id === o.chit), c)); };
        const waiting = ui.effortChit && payer(ui.effortChit).length ? chits.find(c => c.id === ui.effortChit) : null;
        const backs = waiting ? payer(waiting.id).filter(({ o }) => o.back) : [];
        const tile = c => {
            const label = c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`;
            const opts = payer(c.id);
            const canPay = !waiting && opts.length > 0;
            const canBack = !!waiting && backs.some(({ o }) => sameKind(chits.find(x => x.id === o.back), c));
            const isWaiting = waiting?.id === c.id;
            return h('button', { class: `chit2 ${c.type} ${c.state}${canPay || canBack ? ' pick' : ''}${isWaiting ? ' sel' : ''}${canPay || canBack || isWaiting ? '' : ' off'}`, 'data-effort-chit': c.id, disabled: !(canPay || canBack) || null,
                onclick: () => {
                    if (canBack) { const hit = backs.find(({ o }) => sameKind(chits.find(x => x.id === o.back), c)); ui.effortChit = null; act({ type: 'effort-cost', n: hit.n }); return; }
                    const plain = opts.find(({ o }) => !o.back);
                    if (plain && !opts.some(({ o }) => o.back)) { ui.effortChit = null; act({ type: 'effort-cost', n: plain.n }); return; }
                    ui.effortChit = c.id; render();
                } },
                h('b', {}, label), h('span', {}, '*'.repeat(c.effort) || ' '), h('small', {}, `${c.type === 'move' ? 'Move' : c.type === 'fight' ? 'Fight' : 'Magic'}${c.state !== 'active' ? ` \u00B7 ${c.state === 'fatigued' ? 'tired' : 'wounded'}` : ''}`));
        };
        const plainOpt = waiting ? payer(waiting.id).find(({ o }) => !o.back) : null;
        return modal(`${p.site}: pay with effort`, h('div', { class: 'restsheet' },
            waiting
                ? ask(`Paying with ${chitLabel(waiting)}.`, 'It has two asterisks. Tap a tired one-asterisk chit to bring it back ready (making change), or pay with it outright.')
                : ask(p.site === 'Cairns' ? 'The Cairns take an asterisk of effort for every Loot roll, found or not: tap the chit that pays.' : 'The Pool takes an asterisk of effort each time something is taken from it: tap the chit that pays.',
                    'The chit you tap is tired until you rest it. Only the chits glowing gold can pay now.'),
            h('div', { class: 'chitgrid' }, ...chits.map(tile)),
            waiting ? h('div', { class: 'row2' },
                plainOpt ? h('button', { class: 'btn primary', 'data-act': 'effort-plain', onclick: () => { ui.effortChit = null; act({ type: 'effort-cost', n: plainOpt.n }); } }, 'Just tire it') : null,
                h('button', { class: 'btn', onclick: () => { ui.effortChit = null; render(); } }, 'Choose a different chit')) : null));
    }

    function restSheet(p) {
        const mine = new Map();
        for (const o of p.options) (mine.get(o.chit) ?? mine.set(o.chit, []).get(o.chit)).push(o);
        const waiting = ui.restChit && mine.has(ui.restChit) ? ui.restChit : null;
        const changers = new Set(waiting ? mine.get(waiting).map(o => o.change).filter(Boolean) : []);
        const tile = c => {
            const label = c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`;
            const canRest = !waiting && mine.has(c.id), canChange = waiting && changers.has(c.id);
            const isWaiting = waiting === c.id;
            const on = canRest || canChange || isWaiting;
            return h('button', { class: `chit2 ${c.type} ${c.state}${canRest || canChange ? ' pick' : ''}${isWaiting ? ' sel' : ''}${on ? '' : ' off'}`, 'data-rest-chit': c.id, disabled: !(canRest || canChange) || null,
                onclick: () => {
                    if (canChange) { const o = mine.get(waiting).find(x => x.change === c.id); ui.restChit = null; act({ type: 'rest', chit: o.chit, change: o.change }); return; }
                    const opts = mine.get(c.id);
                    const direct = opts.find(x => x.change == null);
                    if (direct) { ui.restChit = null; act({ type: 'rest', chit: c.id }); } else { ui.restChit = c.id; render(); }
                } },
                h('b', {}, label), h('span', {}, '*'.repeat(c.effort) || ' '), h('small', {}, `${c.type === 'move' ? 'Move' : c.type === 'fight' ? 'Fight' : 'Magic'}${c.state !== 'active' ? ` \u00B7 ${c.state === 'fatigued' ? 'tired' : 'wounded'}` : ''}`));
        };
        const target = waiting ? st.ch.chits.find(c => c.id === waiting) : null;
        return modal('Rest', h('div', { class: 'restsheet' },
            waiting
                ? ask(`Making change for ${chitLabel(target)}.`, 'A chit worth two asterisks costs two asterisks of rest. Tap the ready one-asterisk chit you will tire in exchange.')
                : ask('Your Rest phase: tap the chit you want back.', 'One Rest returns one asterisk of effort: a tired chit becomes ready again, or a wounded chit is healed (one with asterisks comes back tired). Only the chits glowing gold can be rested now.'),
            h('div', { class: 'chitgrid' }, ...st.ch.chits.map(tile)),
            waiting ? h('button', { class: 'btn', onclick: () => { ui.restChit = null; render(); } }, 'Choose a different chit') : null));
    }

    // The score as it stands today, worked the way the game works it out at the end.
    function vpNow() { try { return st.period === 'over' && st.ch.dead ? -100 : scoreGame(st, data).total; } catch { return 0; } }
    function scoreSheet() {
        const res = scoreGame(st, data), e = earned(st, data), need = targets(st), vp = st.ch.vp ?? {};
        const NAME = { great: 'Great Treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
        const belong = (key) => st.ch.items.filter(i => !i.destroyed).map(i => { const d = defOf(data, i); const t = i.card ? data.treasures[i.card] : d; return { name: nameOf(data, i), v: (t?.[key] ?? d?.[key] ?? 0) }; }).filter(x => x.v);
        const how = {
            great: `Great Treasures you own and can carry (${e.great}). Each is worth one point of the goal.`,
            spells: SPELLS_HOW,
            fame: 'Recorded Fame plus the Fame of what you own.',
            notoriety: 'Recorded Notoriety plus the Notoriety of what you own.',
            gold: `Recorded gold ${st.ch.gold} minus your starting value ${st.ch.startValue ?? 10} (your starting gold and the price of the gear you began with). Only gold counts, not the price of things you own.`,
        };
        const rows = res.rows ?? [];
        const sign = n => (n > 0 ? `+${n}` : String(n));
        const pr = progress(st, data), over = st.period === 'over';
        const sumUp = c => { const r = rows.find(x => x.cat === c); return r ? `${sign(r.basic + r.bonus)} points if the game ended now` : ''; };
        const goalCard = g => {
            const r = rows.find(x => x.cat === g.cat);
            return h('div', { class: 'scorerow2' },
                h('div', { class: 'sr-head' }, h('b', {}, NAME[g.cat]), h('span', {}, g.earned >= g.need ? `${g.earned} of ${g.need} \u2713${g.earned > g.need ? ` (${g.earned - g.need} over)` : ''}` : `${g.earned} of ${g.need}: ${g.need - g.earned} to go`)),
                h('div', { class: 'goalbar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': g.need, 'aria-valuenow': Math.max(0, g.earned) }, h('i', { style: `width:${Math.round(g.frac * 100)}%` })),
                h('p', { class: 'hint' }, `${g.vp} victory point${g.vp === 1 ? ' is' : 's are'} riding on this goal. ${how[g.cat]}`),
                partsEl(g),
                h('details', { class: 'sr-math' }, h('summary', {}, sumUp(g.cat) || 'The arithmetic'),
                    r ? h('p', { class: 'hint' }, r.diff < 0
                        ? `Short by ${Math.abs(r.diff / 3)}, counted three times (${r.diff}), divided by ${FACTORS[g.cat]} and rounded down: ${r.basic}. Bonus ${r.basic} \u00D7 ${vp[g.cat] ?? 0} VP = ${r.bonus}.`
                        : `Over by ${r.diff}, divided by ${FACTORS[g.cat]} and rounded down: ${r.basic}. Bonus ${r.basic} \u00D7 ${vp[g.cat] ?? 0} VP = ${r.bonus}.`) : null));
        };
        // where a goal's figure comes from: the recorded part, then one line per belonging that adds to it
        const parts = cat => {
            if (cat === 'fame' || cat === 'notoriety') {
                const own = belong(cat), rec = st.ch[cat] ?? 0;
                return [[`Recorded ${NAME[cat]} (earned so far)`, rec], ...own.map(x => [x.name, x.v]), ...(own.length ? [] : [['What you own adds nothing', 0]])];
            }
            if (cat === 'great') return st.ch.items.filter(i => !i.destroyed && (i.card ? data.treasures[i.card] : defOf(data, i))?.great).map(i => [nameOf(data, i), 1]);
            if (cat === 'gold') return [['Gold you hold', st.ch.gold], ['Your starting value (gold and the price of your first gear)', -(st.ch.startValue ?? 10)]];
            return [];
        };
        // what the goods would fetch if he sold the lot at their printed prices: for his information only, it never changes the score
        const saleRows = () => st.ch.items.filter(i => !i.destroyed).map(i => [nameOf(data, i), priceOf(data, i)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
        const saleEl = g => {
            const list = saleRows(), sum = list.reduce((a, x) => a + x[1], 0), start = st.ch.startValue ?? 10;
            if (g.cat !== 'gold') return null;
            return h('details', { class: 'sr-parts sr-sale' }, h('summary', {}, `If you sold everything you own: ${st.ch.gold + sum - start} of ${g.need}`),
                h('p', { class: 'hint' }, 'For your information only: it does not change your score. Only gold in hand counts, and trading prices vary with the roll.'),
                ...list.map(([n, v]) => h('div', { class: 'sr-part' }, h('span', {}, n), h('b', {}, `+${v}`))),
                h('div', { class: 'sr-part' }, h('span', {}, 'Gold you hold'), h('b', {}, String(st.ch.gold))),
                h('div', { class: 'sr-part' }, h('span', {}, 'Your starting value'), h('b', {}, String(-start))),
                h('div', { class: 'sr-part total' }, h('span', {}, `Gold would stand at (${g.need} needed)`), h('b', {}, String(st.ch.gold + sum - start))));
        };
        const partsEl = g => {
            const rowsOf = parts(g.cat);
            if (!rowsOf.length) return null;
            return h('div', {}, h('details', { class: 'sr-parts' }, h('summary', {}, `Where the ${g.earned} comes from`),
                ...rowsOf.map(([n, v]) => h('div', { class: 'sr-part' }, h('span', {}, n), h('b', {}, v > 0 && g.cat !== 'great' ? `+${v}` : String(v)))),
                h('div', { class: 'sr-part total' }, h('span', {}, 'Total'), h('b', {}, String(g.earned)))), saleEl(g));
        };
        const idle = CATS.filter(c => !(need[c] > 0));
        return modal('Your goals', h('div', { class: 'scoresheet' },
            ask(over ? `Final score: ${sign(res.total ?? -100)}${res.dead ? ' (dead characters score -100)' : (res.total >= 0 ? ': a win' : ': not enough')}`
                : res.dead ? 'You are dead: a dead character scores -100.' : `Score ${sign(res.total ?? 0)}. You have reached ${pr.met} of your ${pr.count} goals.`,
                over ? 'The game is over; this is how each goal finished.'
                    : 'You win if your total is zero or more when the game ends. Going past a goal earns bonus points; ending short of one costs points, counted three times over.'),
            ...pr.goals.map(goalCard),
            idle.length ? h('details', { class: 'sr-idle' }, h('summary', {}, 'Goals you put no points on'),
                ...idle.map(c => h('p', { class: 'hint' }, `${NAME[c]}: need 0, earned ${e[c]}. ${r0(c)}`))) : null,
            h('div', { class: 'scorerow2 ifnow' },
                h('div', { class: 'sr-head' }, h('b', {}, over ? 'Final total' : 'If the game ended right now'), h('span', {}, res.dead ? '-100' : sign(res.total ?? 0))),
                h('p', { class: 'hint' }, over ? 'Zero or more is a win.' : 'The score is only worked out for real at the end. Early on it is always low, because every goal still counts as short; it rises as you earn.')),
            h('details', { class: 'sr-math' }, h('summary', {}, 'How the score is worked out'),
                h('p', {}, 'At the start you spread your victory points over five goals. A goal\'s need is its points times its factor: Great Treasures 1, Spells 2, Fame 10, Notoriety 20, Gold 30.'),
                h('p', {}, 'For each goal: points = (earned \u2212 need) \u00F7 factor, rounded down, and a shortfall is counted three times. The bonus is those points times the victory points you put on that goal. Your total is every goal\'s points plus bonus.'),
                h('p', {}, 'A total of zero or more is a win. A character who dies scores \u2212100. At the end, belongings too heavy for your strongest Move chit (or horse or boots) are put down before anything is counted.'))), { close: () => { ui.sheet = null; render(); } });
        function r0(c) { const r = rows.find(x => x.cat === c); return r ? sumUp(c) + '.' : ''; }
    }

    // A spell: its card, with the rules' full description.
    // A spell card as printed: the card art with its colour, type, duration, target and the rules' full description.
    function spellCard(sp) {
        const full = data.cardtext?.spells?.[sp.id] ?? '';
        const m = /^[^(]+\([^)]*\),\s*(.*?),\s*(Instant|Day|Combat|Permanent|Attack|Fly|Phase)\s*:\s*(.*)$/s.exec(full);
        const target = m?.[1], body = m?.[3] ?? full;
        const color = sp.color ?? 'any';
        return cardEl({ title: sp.name, kind: sp.color ?? 'any', tag: `Type ${sp.type} spell \u00B7 ${color === 'any' ? 'any colour of magic' : `${color} magic`} \u00B7 ${sp.duration}`,
            stats: [...(target ? [['Target', target]] : []), ['Cast with', `a Magic chit of type ${sp.type}`], ['Colour needed', color === 'any' ? 'any' : color]], text: body,
            notes: [castable(sp) ? 'You cast this in the Encounter step of the evening, where its colour of magic is present. If nothing is fighting you the evening is still held (rule 8.1.3a) and the game stops to ask whether you want to cast it, when there is something for it to do.' : 'This spell cannot be cast yet.'] });
    }
    function spellSheet() {
        const sp = data.spells?.[ui.spellId];
        const back = { close: () => { ui.sheet = 'char'; render(); } };
        if (!sp) return modal('Spell', h('p', { class: 'hint' }, 'Unknown spell.'), back);
        return modal(sp.name, h('div', { class: 'itemsheet' }, spellCard(sp),
            h('button', { class: 'btn', onclick: back.close }, 'Back')), back);
    }
    // Reading Runes found a card he can learn.
    function learnSheet(p) {
        // Magic Sight (Perceive a spell): all the cards are shown and he may learn one (he does not awaken it)
        if (p.sight && p.choices?.length) return modal('Magic Sight: the spells you perceive', h('div', { class: 'itemsheet' },
            ask(`${p.from ?? 'Magic Sight'}: you see these spell cards.`, 'You may write one of them on your sheet if you hold a Magic chit of its Type. The card stays where it is.'),
            ...p.choices.map(c => h('button', { class: 'btn', 'data-learn': c.spell, disabled: !c.learnable || null, onclick: () => act({ type: 'learn-spell', learn: true, spell: c.spell }) },
                h('span', { class: 'col' }, h('b', {}, c.name), h('small', {}, `Type ${c.type}${c.color ? ` \u00B7 ${c.color}` : ''}${c.learnable ? '' : ' \u00B7 you cannot learn it'}`)))),
            h('button', { class: 'btn', onclick: () => act({ type: 'learn-spell', learn: false }) }, 'Leave them')));
        const sp = data.spells?.[p.spell];
        const erase = ui.erase ?? null;
        return modal('Read the runes', h('div', { class: 'itemsheet' },
            ask(`${p.from}: the runes show a spell.`, `You hold a Type ${sp?.type} Magic chit, so you may write it on your sheet. The card stays where it is.`),
            sp ? spellCard(sp) : null,
            p.full ? h('div', { class: 'ask' }, h('b', {}, 'Your sheet is full (14 spells).'), h('p', {}, 'To learn this one you must erase another. Choose which:'),
                ...(st.ch.spells ?? []).map(id => h('button', { class: `btn${erase === id ? ' primary' : ''}`, 'data-erase': id, onclick: () => { ui.erase = id; render(); } }, data.spells?.[id]?.name ?? id))) : null,
            h('div', { class: 'row2' },
                h('button', { class: 'btn primary', 'data-act': 'learn', disabled: (p.full && !erase) || null, onclick: () => { const e = ui.erase; ui.erase = null; act({ type: 'learn-spell', learn: true, erase: e }); } }, 'Learn it'),
                h('button', { class: 'btn', 'data-act': 'leave', onclick: () => { ui.erase = null; act({ type: 'learn-spell', learn: false }); } }, 'Leave it'))));
    }

    // One belonging: both of its faces drawn as counters, the facts, and the switch.
    // The curses on him, what each takes away and what lifts it.
    // When a spell in force ends, in words.
    function fxEnds(f) {
        if (f.state === 'inert') return '(inert: needs its colour of magic to act)';
        if (f.state === 'nullified') return '(held off)';
        if (f.state === 'held') return '(held, not yet used)';
        const e = f.expires;
        if (!e) return f.dur === 'permanent' ? 'until it is broken' : '';
        return e.at === 'sunset' ? `until Sunset${e.day === st.day ? '' : e.day === st.day + 1 ? ' tomorrow' : ` of day ${e.day}`}` : e.at === 'midnight' ? 'until Midnight' : e.at === 'phase-end' ? 'this phase' : 'this round';
    }
    function spellsSheet() {
        const back = { close: () => { ui.sheet = null; render(); } };
        const fxOn = (st.fx ?? []).filter(f => f.state !== 'done');
        return modal('Spells in effect', h('div', { class: 'cursesheet' },
            fxOn.length ? null : h('p', { class: 'hint' }, 'No spell of yours is in effect.'),
            ...fxOn.map(f => { const sp = data.spells?.[f.spell], chit = f.source?.kind === 'chit' ? st.ch.chits.find(c => c.id === f.source.id) : null;
                return h('div', { class: 'curserow fxrow' }, h('span', { class: 'skull', 'aria-hidden': 'true' }, '\u2728'), h('div', {}, h('b', {}, sp?.name ?? f.spell), h('p', {}, `${fxEnds(f)}.${chit ? ` Your Magic ${chit.numeral}${chit.time}${'*'.repeat(chit.effort)} is tied to it and tires when it ends.` : ''}`), (sp?.text ?? data.cardtext?.spells?.[f.spell]) ? h('p', { class: 'hint' }, sp?.text ?? data.cardtext.spells[f.spell]) : null)); }),
            h('button', { class: 'btn', onclick: back.close }, 'Back')), back);
    }

    function cursesSheet() {
        const back = { close: () => { ui.sheet = null; render(); } };
        const mine = st.ch.curses ?? [];
        const rows = Object.values(data.tables.curses.rows);
        const atChapel = st.dwellings.some(d => d.kind === 'Chapel' && d.at === st.ch.at);
        return modal(mine.length ? 'You are cursed' : 'Curses', h('div', { class: 'cursesheet' },
            mine.length ? null : h('p', { class: 'hint' }, 'You carry no curse. A curse can fall on you from a Treasure Location card, a Reading Runes result or a Loot result.'),
            ...mine.map(n => h('div', { class: 'curserow' }, h('span', { class: 'skull', 'aria-hidden': 'true' }, '\u2620'), h('div', {}, h('b', {}, n), h('p', {}, CURSE_PLAIN[n] ?? rows.find(r => r.name === n)?.effect ?? '')))),
            mine.length ? h('p', { class: 'hint' }, atChapel ? 'You are in a Chapel\u2019s clearing: at Midnight it lifts every curse.' : 'A curse stays until Midnight finds you in the clearing of a Chapel, which lifts them all. Walk there before the day ends.') : null,
            h('h3', {}, 'All six curses'),
            ...rows.map(r => h('p', { class: `hint${mine.includes(r.name) ? ' bad' : ''}` }, h('b', {}, r.name + ': '), CURSE_PLAIN[r.name] ?? r.effect)),
            h('button', { class: 'btn', onclick: back.close }, 'Back')), back);
    }

    // A treasure card he found but does not carry (a Mouldy Skeleton, a Toadstool Circle): what it says.
    function cardInfoSheet() {
        const td = data.treasures[ui.cardId];
        const back = { close: () => { ui.sheet = null; render(); } };
        if (!td) return modal('Card', h('p', { class: 'hint' }, 'Unknown card.'), back);
        const text = data.cardtext?.treasures?.[ui.cardId] ?? td.effectText ?? '';
        return modal(td.name, h('div', { class: 'itemsheet' },
            cardEl({ title: td.name, kind: 'treasure', tag: td.kind === 'twt' ? 'Treasure within Treasure' : 'Treasure', stats: [], text, notes: ui.cardId === 'chest' ? [] : ['A treasure within a treasure: it is not carried off; what it holds is described on the card.'] }),
            h('button', { class: 'btn', onclick: back.close }, 'Back')), back);
    }

    // The card or faces, and the plain facts, of an item: a belonging of his (it.uid) or a thing on someone's shelf ({ kind, id }).
    function itemParts(it) {
        const d = defOf(data, it), name = nameOf(data, it), pic = picOf(name) ?? (d?.name ? picOf(d.name) : null);
        const faces = [], facts = [];
        let card = null;
        const fmtT = t => (t == null ? '\u2013' : t);
        if (it.kind === 'weapon') {
            const u = d.unalerted, a = d.alerted;
            faces.push(itemFace({ name, picture: pic, face: 'Not alerted', big: `${u.harm}${fmtT(u.attackTime)}`, stars: u.stars ?? 0, corner: `(${d.length})`, current: !it.alerted && !it.destroyed }));
            faces.push(itemFace({ name, picture: pic, face: 'Alerted', big: `${a.harm}${a.attackTime == null ? '' : a.attackTime}`, stars: a.stars ?? 0, corner: `(${d.length})${a.attackTime == null ? ' time: your chit' : ''}`, current: it.alerted && !it.destroyed }));
            facts.push(`${d.missile ? 'A missile weapon' : 'A striking weapon'}, length ${d.length}, weight ${WEIGHT_WORDS[d.weight]}.`);
            facts.push(`Not alerted: harm\u00A0${u.harm}${'*'.repeat(u.stars ?? 0)}, attack time\u00A0${fmtT(u.attackTime)}.`);
            facts.push(`Alerted: harm ${a.harm}${'*'.repeat(a.stars ?? 0)}, ${a.attackTime == null ? 'no printed attack time: the Fight chit you play gives the time' : `attack time\u00A0${a.attackTime}`}.`);
            facts.push('Alert it in an Alert phase, or as your Encounter action in a fight; it goes back to not alerted at Midnight and after a blow that lands.');
        } else if (it.kind === 'armor') {
            const dir = (d.protects ?? []).join(', ');
            faces.push(itemFace({ name, picture: pic, face: 'Whole', big: d.toughness ?? '', corner: dir ? '' : null, circle: d.priceIntact ?? null, current: !it.damaged && !it.destroyed }));
            faces.push(itemFace({ name, picture: pic, face: 'Damaged', big: d.toughness ?? '', circle: d.priceDamaged ?? null, circleTone: 'red', current: it.damaged && !it.destroyed }));
            facts.push(`${((d.type ?? 'armor')[0]).toUpperCase()}${(d.type ?? 'armor').slice(1)}, weight ${WEIGHT_WORDS[d.weight]}, toughness ${d.toughness}.`);
            facts.push(`Guards against: ${dir || 'nothing listed'}${d.chooseOneDirection ? ' (you choose one direction each round)' : ''}.`);
            facts.push(`A blow as strong as its toughness damages it; the next such blow destroys it. Worth ${d.priceIntact ?? '?'} gold whole, ${d.priceDamaged ?? '?'} damaged.`);
        } else if (it.kind === 'horse') {
            faces.push(itemFace({ name, picture: pic, face: 'Walking', big: `${d.walk.strength}${d.walk.moves}`, corner: `vuln ${d.vulnerability}`, circle: d.walk.moves, current: true }));
            faces.push(itemFace({ name, picture: pic, face: 'Galloping', big: `${d.gallop.strength}${d.gallop.moves}`, corner: `vuln ${d.vulnerability}`, circle: d.gallop.moves }));
            facts.push(`${d.kind ?? 'Horse'}${d.armored ? ', armored' : ''}, vulnerability ${d.vulnerability}.`);
            facts.push(`Walking: strength ${d.walk.strength}, moves ${d.walk.moves}. Galloping: strength ${d.gallop.strength}, moves ${d.gallop.moves}. In a fight it is played like a Move chit, either side, once a round.`);
            facts.push('It cannot be ridden in a cave.');
        } else {
            const key = it.card ?? it.id;
            const text = data.cardtext?.treasures?.[key] ?? data.cardtext?.treasures?.[it.id] ?? d?.effectText ?? '';
            const td = data.treasures[key] ?? d;
            const stats = [['Weight', WEIGHT_WORDS[td?.weight] ?? '?'], ['Price', `${td?.gold ?? '?'} gold`]];
            if (td?.fame) stats.push(['Fame', `${td.fame > 0 ? '+' : ''}${td.fame}`]);
            if (td?.notoriety) stats.push(['Notoriety', `${td.notoriety > 0 ? '+' : ''}${td.notoriety}`]);
            const notes = [];
            if (td?.great) notes.push('A Great Treasure: it counts toward the Great Treasures goal while you keep it.');
            if (td?.fameReward) notes.push(`Sold to the ${td.fameReward.group} it earns ${td.fameReward.points} Fame.`);
            card = cardEl({ title: td?.name ?? name, kind: td?.great ? 'great' : 'treasure', tag: `${td?.great ? 'Great treasure' : td?.kind === 'large' ? 'Large treasure' : td?.kind === 'small' ? 'Small treasure' : 'Treasure'}${td?.magic ? ` \u00B7 ${typeof td.magic === 'object' ? `Magic ${(td.magic.numerals ?? [td.magic.numeral]).filter(Boolean).join('/')}${td.magic.colour ? ` ${td.magic.colour}` : ''}` : `magic ${td.magic}`}` : ''}`, stats, text, notes, picture: pic });
        }
        if (card == null) {
            // what it is worth: gold when sold (armor already says whole and damaged above), and the Fame and Notoriety it adds while he owns it
            if (it.kind !== 'armor') { const g = priceOf(data, it); if (g) facts.push(voidBy(st, 'gold') ? h('span', {}, 'Worth ', h('s', { class: 'void' }, `${g} gold`), ' when sold: your gold is worthless while the Ashes curse lasts.') : `Worth ${g} gold when sold.`); }
            const fm = d?.fame ?? 0, nt = d?.notoriety ?? 0;
            if (fm || nt) facts.push(`Owning it adds ${[fm ? `Fame ${fm > 0 ? '+' : ''}${fm}` : '', nt ? `Notoriety ${nt > 0 ? '+' : ''}${nt}` : ''].filter(Boolean).join(' and ')} to your totals.`);
        }
        return { name, card, faces, facts };
    }
    function itemSheet() {
        const it = st.ch.items.find(i => i.uid === ui.itemUid);
        const back = { close: () => { ui.sheet = ui.itemFrom === 'dock' ? null : 'char'; ui.itemFrom = null; render(); } };
        if (!it) return modal('Belonging', h('p', { class: 'hint' }, 'You no longer have it.'), back);
        const { name, card, faces, facts } = itemParts(it);
        const canSwitch = (st.pending?.type === 'phase' || st.pending?.type === 'plan') && !it.destroyed;
        return modal(name, h('div', { class: 'itemsheet' },
            card ?? h('div', { class: 'faces' }, ...faces),
            h('p', { class: 'hint' }, `${it.destroyed ? 'Destroyed. ' : ''}${it.active ? 'Active' : 'Inactive'}${it.kind === 'weapon' ? (it.alerted ? ', alerted' : ', not alerted') : ''}${it.kind === 'armor' ? (it.damaged ? ', damaged' : ', whole') : ''}.`),
            ...facts.map(t => h('p', {}, t)),
            h('div', { class: 'row2' },
                h('button', { class: `switch big${it.active ? ' on' : ''}`, role: 'switch', 'aria-checked': it.active ? 'true' : 'false', 'data-act': 'item-switch', disabled: !canSwitch || null, onclick: () => { ui.keep = true; act({ type: 'tidy', item: it.uid }); } }, it.active ? 'Active: deactivate it' : 'Inactive: activate it'),
                h('button', { class: 'btn', onclick: back.close }, 'Back')),
            canSwitch && !it.destroyed ? h('button', { class: 'btn quiet-no leave', 'data-act': 'item-leave', onclick: () => { ui.keep = true; ui.sheet = ui.itemFrom === 'dock' ? null : 'char'; ui.itemFrom = null; act({ type: 'tidy', item: it.uid, drop: true }); } }, `Leave the ${name} here`) : null,
            canSwitch ? null : h('p', { class: 'hint' }, 'Gear can be changed between phases. In a fight, switching one item or leaving one behind is your Encounter action (open the Encounter step and use "Belongings" there).')), back);
    }

    // The printed Treasure Set Up Card in full: it is the same for every game, so every player may read it.
    function setupCardSheet() {
        const c = data.setupcard;
        const guardName = id => data.monsters[id]?.name ?? id;
        const monsterArt = name => data.art?.monstersColor?.[name] ?? data.art?.monsters?.[name] ?? null;
        const pips = (n, cls) => Array.from({ length: n }, () => h('i', { class: `pip ${cls}` }));
        const treasureRow = e => h('div', { class: 'sc-treasure' },
            e.small ? h('span', { class: 'sc-t', title: 'Small treasures' }, ...pips(e.small, 'small'), h('small', {}, `${e.small} Small`)) : null,
            e.large ? h('span', { class: 'sc-t', title: 'Large treasures' }, ...pips(e.large, 'large'), h('small', {}, `${e.large} Large`)) : null,
            ...(e.spells ?? []).map(t => h('span', { class: 'sc-spell', title: `A spell of Type ${t}` }, t)));
        const found = name => st.chits.some(ch => ch.name === name && st.ch.discovered.sites.includes(ch.id));
        const need = e => e.special ? e.special.replace('fatigue_asterisk', 'an asterisk of effort').replace('fatigue_t,key', 'a Tremendous chit or the Lost Keys') : null;
        const siteCard = e => {
            const gn = guardName(e.guardian), art = monsterArt(gn);
            return h('div', { class: `sc-card site${found(e.name) ? ' found' : ''}` },
                h('div', { class: 'sc-head' }, mrChit({ kind: 'site', name: e.name, num: e.chitNumber }),
                    h('div', { class: 'sc-title' }, found(e.name) ? h('em', {}, 'discovered') : h('small', {}, 'not yet found'))),
                h('div', { class: 'sc-guard' }, art ? h('img', { src: art, alt: '' }) : null, h('span', {}, h('b', {}, gn), h('small', {}, `comes on Monster Roll ${e.row}`))),
                treasureRow(e),
                need(e) ? h('div', { class: 'sc-need' }, `Needs ${need(e)}`) : null);
        };
        const nativeArt = group => { const n = Object.values(data.natives ?? {}).find(x => x.group === group && x.leader) ?? Object.values(data.natives ?? {}).find(x => x.group === group); return n ? data.art?.natives?.[n.id] : null; };
        const goodsArt = name => picOf(name);
        const dwellingCard = e => h('div', { class: 'sc-card dwelling' },
            h('div', { class: 'sc-head' }, data.art?.dwellings?.[e.name] ? h('img', { class: 'sc-dw', src: data.art.dwellings[e.name], alt: '' }) : null,
                h('div', { class: 'sc-title' }, h('b', {}, e.name), h('small', {}, e.group + (e.virtual ? ' (come with the group)' : '')))),
            h('div', { class: 'sc-natives' }, nativeArt(e.group) ? h('img', { src: nativeArt(e.group), alt: '' }) : null, h('span', {}, h('b', {}, `${e.nativeCounters}`), h('small', {}, ' native counters'))),
            e.treasures?.small ? treasureRow({ small: e.treasures.small }) : null,
            Object.keys(e.treasures?.counters ?? {}).length ? h('div', { class: 'sc-goods' }, ...Object.entries(e.treasures.counters).map(([n, k]) =>
                h('span', { class: 'sc-good' }, goodsArt(n) ? h('img', { src: goodsArt(n), alt: '' }) : null, `${n}${k > 1 ? ` \u00D7${k}` : ''}`))) : null);
        const twtCard = e => h('div', { class: 'sc-card twt' }, h('b', {}, e.name),
            h('div', { class: 'sc-treasure' }, ...pips(e.largeTreasures, 'large'), h('small', {}, `${e.largeTreasures} Large`)),
            h('small', {}, [e.goldReward ? `${e.goldReward} gold` : '', e.needsKey ? 'needs the Lost Keys' : '', e.curse ? 'carries a curse' : '', e.siteCard ? 'searched with its own table' : ''].filter(Boolean).join(' \u00B7 ')));
        const visitorCard = e => h('div', { class: 'sc-card visitor' }, h('b', {}, e.name), treasureRow({ small: e.small, spells: e.spells }));
        const byKind = {}; for (const e of c.spellContainers ?? []) (byKind[e.kind] ??= []).push(e);
        const KIND_LABEL = { book: 'Spell books', artifact: 'Artifacts', site: 'Treasure sites', visitor: 'Visitors' };
        return modal('The Setup Card', h('div', { class: 'setupcard graphic' },
            h('p', { class: 'hint' }, 'What the printed card says, true in every game. What is in a pile, and in which order, is hidden until it is looted.'),
            h('div', { class: 'sc-key' }, h('span', {}, h('i', { class: 'pip small' }), ' Small treasure'), h('span', {}, h('i', { class: 'pip large' }), ' Large treasure'), h('span', {}, h('i', { class: 'sc-spell' }, 'II'), ' Spell (its type)')),
            h('h3', {}, 'Treasure sites'), h('div', { class: 'sc-grid' }, ...(c.sites ?? []).map(siteCard)),
            h('h3', {}, 'Dwellings'), h('div', { class: 'sc-grid' }, ...(c.dwellings ?? []).map(dwellingCard)),
            h('h3', {}, 'Treasures within Treasures'), h('div', { class: 'sc-grid' }, ...(c.twt ?? []).map(twtCard)),
            h('h3', {}, 'Visitors'), h('div', { class: 'sc-grid' }, ...(c.visitors ?? []).map(visitorCard)),
            h('h3', {}, 'Spell books and artifacts'),
            ...Object.entries(byKind).map(([k, list]) => h('div', { class: 'sc-spells' }, h('small', {}, KIND_LABEL[k] ?? k),
                h('div', { class: 'sc-chips' }, ...list.map(e => h('span', { class: 'sc-chip' }, e.name, ...e.spells.map(t => h('i', { class: 'sc-spell' }, t))))))),
            h('p', { class: 'hint' }, c.notes ?? '')), { close: () => { ui.sheet = 'menu'; render(); } });
    }

    // The lines of a group, with each combat round in a box of its own under a "Round N" marker.
    function roundBoxes(lines) {
        const out = [];
        let cur = null;
        for (const l of lines) {
            const line = h('p', { class: `j-${l.k}` }, logText(l));
            if (l.r == null) { cur = null; out.push(line); continue; }
            if (!cur || cur.r !== l.r) {
                cur = { r: l.r, box: h('div', { class: 'roundbox' }, h('div', { class: 'roundmark' }, `Round ${l.r}`)) };
                out.push(cur.box);
            }
            cur.box.append(line);
        }
        return out;
    }

    // The morning review: first the result alone, then (after Next) the day step by step, each step a triangle holding its explanation.
    function reportSheet() {
        const day = st.day - 1;
        const prev = st.log.filter(l => l.day === day && l.k !== 'day' || (l.day === day && /sun sets/.test(l.t)));
        const rep = st.report?.day === day ? st.report : null;
        const sign = n => (n > 0 ? `+${n}` : String(n));
        const chips = rep ? [['Fame', rep.fame], ['Notoriety', rep.notoriety], ['Gold', rep.gold]].filter(x => x[1]) : [];
        const heads = prev.filter(l => !(voice() === 'story' && l.k === 'roll') && (/^You kill |^You die|^Every action chit|^You wound |dies\b|^Loot \(|^You take|^You buy|^You pay|curse/i.test(l.t) || ['loot', 'curse', 'discover'].includes(l.k)));
        const seen = new Set(), result = [];
        for (const l of heads) { const t = logText(l).trim(); if (!seen.has(t)) { seen.add(t); result.push(l); } }
        if (ui.reportPage !== day + ':overview') {
            return modal(`Day ${day}: the result`, h('div', { class: 'reportsheet' },
                h('div', { class: 'res-head' }, h('span', {}), voiceChip()),
                h('div', { class: 'repchips' }, ...(chips.length ? chips.map(([n, v]) => h('span', { class: `repchip ${v > 0 ? 'up' : 'down'}${voidBy(st, n.toLowerCase()) ? ' void' : ''}`, title: voidBy(st, n.toLowerCase()) ? `Worthless: the ${voidBy(st, n.toLowerCase())} curse` : null }, `${n} ${sign(v)}`)) : [h('span', { class: 'repchip' }, 'No change in Fame, Notoriety or gold')])),
                ...(result.length ? result.slice(0, 5).map(l => h('p', { class: `j-${l.k}` }, voice() === 'story' ? logText(l) : l.t.replace(/ \(rolled [^)]*\)/, ''))) : [h('p', { class: 'hint' }, 'A quiet day: nothing was won or lost.')]),
                result.length > 5 ? h('p', { class: 'hint' }, `and ${result.length - 5} more: see the overview.`) : null,
                h('div', { class: 'row2' },
                    h('button', { class: 'btn', 'data-act': 'report-next', onclick: () => { ui.reportPage = `${day}:overview`; render(); } }, 'Day Overview'),
                    h('button', { class: 'btn primary', 'data-act': 'report-ok', onclick: () => { ui.reportedDay = st.day; render(); } }, `On to day ${st.day}`))));
        }
        // group the day's lines under the phase or the evening they belong to
        const groups = [];
        for (const l of prev) {
            if (l.k === 'phase') groups.push({ head: logText(l), kids: [] });
            else if (/sun sets/.test(l.t) || !groups.length) groups.push({ head: /sun sets/.test(l.t) ? 'The evening' : 'Morning', kids: [] });
            else groups.at(-1).kids.push(l);
        }
        const show = groups.filter(g => g.kids.length || /^Phase/.test(g.head));
        return modal(`Day ${day}: overview`, h('div', { class: 'reportsheet' },
            ...show.map(g => g.kids.length
                ? h('details', { class: 'repstep' }, h('summary', {}, g.head), ...roundBoxes(g.kids))
                : h('p', { class: 'repstep plain' }, g.head)),
            h('div', { class: 'row2' },
                h('button', { class: 'btn', onclick: () => { ui.reportPage = null; render(); } }, 'Result'),
                h('button', { class: 'btn primary', 'data-act': 'report-ok', onclick: () => { ui.reportedDay = st.day; render(); } }, `On to day ${st.day}`))));
    }

    function logSheet() {
        return modal('Journal', h('div', { class: 'journal' }, h('div', { class: 'res-head' }, h('span', { class: 'hint' }, voice() === 'story' ? 'Told as a story' : 'In exact words'), voiceChip()), ...[...st.log].reverse().slice(0, 80).map(l => h('p', { class: `j-${l.k}` }, h('small', {}, `Day ${l.day}`), ' ', logText(l)))),
            { close: () => { ui.sheet = null; render(); } });
    }

    // How it ended, said loudly: who or what did it, where, which day, and what he had earned.
    function deathBox() {
        const o = st.over ?? {};
        const by = o.by ? o.by.replace(/ #\d+$/, '') : null;
        const where = nameOfClearing(o.at ?? st.ch.at).replace(/ (\d+)$/, '\u00A0$1');       // the place's number stays with its name
        return h('div', { class: 'deathbox', role: 'alert' },
            h('b', {}, 'You have died'),
            h('span', { class: 'dwho' }, by ? `Slain by the ${by} at ${where}, on day ${o.day ?? st.day}.` : `Fallen at ${where}, on day ${o.day ?? st.day}.`),
            o.text && !by ? h('small', {}, o.text) : null,
            h('span', { class: 'dstats' }, `Fame ${st.ch.fame} \u00B7 Notoriety ${st.ch.notoriety} \u00B7 ${st.ch.gold} gold`));
    }

    function overSheet() {
        const s = st.score;
        const dead = st.over?.reason === 'died';
        const canRestart = dead && st.mode !== 'endless' && st.day < (st.lastDay ?? 28);
        if (canRestart && ui.restartVp) return restartSheet();
        const sign = n => (n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : '0');
        const NAME = { great: 'Great Treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
        const rows = s.rows ?? [], active = rows.filter(r => r.need > 0), idle = rows.filter(r => !(r.need > 0));
        const goalCard = r => {
            const pts = r.basic + r.bonus, met = r.diff >= 0, frac = Math.max(0, Math.min(1, r.need ? r.earned / r.need : 0));
            return h('section', { class: `ovgoal ${r.cat} ${met ? 'met' : 'short'}` },
                h('span', { class: 'ov-name' }, NAME[r.cat] ?? r.cat),
                h('div', { class: 'ov-top' },
                    h('div', { class: 'ov-fig' }, h('b', {}, String(r.earned)), h('small', {}, ` of ${r.need}`)),
                    h('div', { class: `ov-pts ${pts >= 0 ? 'up' : 'down'}` }, sign(pts))),
                h('div', { class: 'goalbar', role: 'img', 'aria-label': `${r.earned} of ${r.need}` }, h('i', { style: `width:${Math.round(frac * 100)}%` })),
                h('p', { class: 'ov-line' }, met ? (r.diff > 0 ? `Past the goal by ${r.diff}.` : 'Exactly on the goal.') : `Short by ${-r.diff}: counted three times.`));
        };
        const hero = st.ch?.name ?? 'Your hero', days = st.day;
        const verdict = dead ? null : s.won
            ? h('div', { class: 'ov-hero win', role: 'status' },
                h('small', {}, 'Victory'),
                h('div', { class: 'ov-total' }, sign(s.total)),
                h('p', {}, `${hero} ends the ${lastDayOf(st) === 28 ? 'month' : 'game'} on day ${days}, and the Realm is kept.`))
            : h('div', { class: 'ov-hero lose', role: 'status' },
                h('small', {}, 'Not enough'),
                h('div', { class: 'ov-total' }, sign(s.total)),
                h('p', {}, `${hero} ends the ${lastDayOf(st) === 28 ? 'month' : 'game'} on day ${days} short of what was set out to do.`));
        return modal(overTitle(st, dead), h('div', { class: 'oversheet' },
            dead ? deathBox() : verdict,
            dead ? h('p', { class: 'hint' }, 'A dead character scores \u2212100.') : null,
            dead
                ? h('details', { class: 'ov-details' }, h('summary', {}, 'What you had earned'), ...active.map(goalCard))
                : h('div', { class: 'ov-goals' }, ...active.map(goalCard)),
            !dead && idle.length ? h('details', { class: 'ov-details' }, h('summary', {}, 'Goals you put no points on'), ...idle.map(r => h('p', { class: 'hint' }, `${NAME[r.cat] ?? r.cat}: ${r.earned} earned.`))) : null,
            st.deaths ? h('p', { class: 'hint' }, `You died ${st.deaths} time${st.deaths === 1 ? '' : 's'} on the way.`) : null,
            h('div', { class: 'row-end ov-actions' },
                canRestart ? h('button', { class: 'btn primary', 'data-act': 'restart', onclick: () => { const total = Math.max(2, Math.ceil(((st.lastDay ?? 28) - st.day) / 7) + 1), fame = Math.min(5, Math.ceil(total * 0.6)); ui.restartVp = { great: 0, spells: 0, fame, notoriety: Math.min(5, total - fame), gold: 0 }; render(); } }, `Return tomorrow as a new ${st.ch.name}`) : null,
                h('button', { class: `btn${canRestart ? '' : ' primary'}`, 'data-act': 'over-title', onclick: () => { clearSaved(); ctx.go('title'); } }, 'Back to the title'))));
    }

    function restartSheet() {
        const weeks = Math.ceil(((st.lastDay ?? 28) - st.day) / 7), total = Math.max(2, weeks + 1), v = ui.restartVp;
        const used = Object.values(v).reduce((a, b) => a + b, 0);
        const rows = [['fame', 'Fame', 10], ['notoriety', 'Notoriety', 20], ['gold', 'Gold', 30], ['great', 'Great treasures', 1], ['spells', 'Spells', 2]];
        return modal(`A new ${st.ch.name}`, h('div', {},
            ask('Your character is dead: set the goals for the next one.', 'A new character arrives at the Inn tomorrow with fresh chits and gear. The goals you set now are what he will be scored against at the end of the game.'),
            h('p', {}, `He arrives at the Inn tomorrow. With ${weeks} week${weeks === 1 ? '' : 's'} left he has ${total} victory points to spend.`),
            ...rows.map(([k, label, f]) => h('div', { class: 'vprow' },
                h('div', { class: 'vp-l' }, h('b', {}, label), h('small', {}, v[k] ? `goal: ${v[k] * f}` : 'no goal')),
                h('div', { class: 'stepper' },
                    h('button', { class: 'step-btn', disabled: v[k] <= 0, onclick: () => { v[k]--; render(); } }, '\u2212'),
                    h('div', { class: 'step-val' }, h('b', {}, String(v[k]))),
                    h('button', { class: 'step-btn', disabled: used >= total || v[k] >= 5, onclick: () => { v[k]++; render(); } }, '+')))),
            h('p', { class: used === total ? 'hint' : 'hint bad' }, used === total ? 'All points spent.' : `${total - used} left to spend.`),
            h('button', { class: 'btn primary', disabled: used !== total, 'data-act': 'restart-go', onclick: () => { const vp = { ...v }; ui.restartVp = null; ui.sheet = null; act({ type: 'restart', vp }); } }, 'Begin')),
            { close: () => { ui.restartVp = null; render(); } });
    }

    // ---- planning ----
    // ---- planning: a panel under the map, one phase at a time (or all of them), with the map still live above it ----
    // where he will be at the start of each phase, as planned
    // (the first half of a mountain climb does not bring him there: planlogic.js)
    function planLocations() { return planState(st, data, ui.draft.slots).at; }
    const planInfo = () => {
        const v = planKinds(st, data, ui.draft.slots);
        return { total: v.total, base: v.base, lantern: v.lantern, extras: v.extras, kinds: v.kinds, errors: v.errors };
    };

    // what kind of phase this recorded activity uses: an extra phase may be recorded anywhere, the rest fill the basic and then the sunlight phases
    function slotKind(i, base, extras) {
        const k = planInfo().kinds[i];
        if (k === 'extra') return 'extra phase';
        if (k === 'lantern') return 'Shielded Lantern phase (caves only)';
        if (k === 'basic' || k === 'sunlight') return k;
        return extras.length ? `${base} ordinary + ${extras.length} extra (${[...new Set(extras)].join(', ')})` : 'unset';
    }

    // the choices for one phase: what to do, and where or how
    function phaseChoices(i, at, base, extras, total) {
        const d = ui.draft, s = d.slots[i];
        // Extra phases (a Rest phase of the Health advantage, a Hide phase from a Cloak of Mist, a Move from boots...) are not tied to a place in the day:
        // any phase may be filled with anything, and an action is dimmed only when the other phases have already used up what it would need.
        const over = slots => planKinds(st, data, slots).kinds.filter(k => k === 'over').length;
        const others = d.slots.map((x, j) => (j === i ? null : x));
        const baseOver = over(others);
        const out = [];
        // the chips in rows by count: 8 in four columns, 9 in three (3x3), 10 in five: 'Nothing' is never alone on a row
        const acts = ['move', 'hide', 'search', 'trade', 'hire', 'rest', 'alert', ...(st.ch.chits.some(x => x.type === 'magic') ? ['enchant'] : []), ...(flySources(st, data).length || st.ch.flying ? ['fly'] : []), 'nothing'];
        const cols = acts.length === 9 ? 3 : acts.length === 10 ? 5 : 4;
        out.push(h('div', { class: `chips2 six cols${cols}` },
            ...acts.map(a => {
                const cursed = (st.ch.curses ?? []).some(n => CURSE_ACT[n] === a), refused = actRefusal(st, a);
                const dim = cursed || !!refused || (a !== 'nothing' && over(others.map((x, j) => (j === i ? { act: a, to: s?.act === a ? s.to : undefined } : x))) > baseOver);
                return h('button', { class: `chip${s?.act === a ? ' on' : ''}${dim ? ' dim' : ''}${cursed ? ' cursed' : ''}`, 'data-slot': i, 'data-pick': a, disabled: dim, title: refused ?? undefined, onclick: () => pick(i, a, at[i]) }, ACT_LABEL[a], cursed ? h('small', {}, ' \u2620') : null);
            })));
        if (s?.act === 'search' && at[i]) out.push(h('p', { class: 'hint', 'data-hint': 'search-where' }, searchWhere(at[i])));
        // Alert: ready the weapon, or alert a Magic chit so that it can cast against fast creatures (it acts at time 0, and tires at Midnight if unused)
        const readyMagic = st.ch.chits.filter(x => x.type === 'magic' && x.state === 'active');
        if (s?.act === 'alert' && readyMagic.length) {
            const chip = (label, on, fn, key) => h('button', { class: `chip${on ? ' on' : ''}`, 'data-alert': key, onclick: fn }, label);
            out.push(h('p', { class: 'hint' }, 'Ready your weapon, or alert a Magic chit: an alerted chit acts at time 0, so it can cast even against the fastest creature. It tires at Midnight if it is not used.'));
            out.push(h('div', { class: 'chips2' }, chip('Weapon', !s.magic, () => { delete s.magic; render(); }, 'weapon'),
                ...readyMagic.map(c => chip(`Magic ${c.numeral}${c.time}${'*'.repeat(c.effort)}`, s.magic === c.id, () => { s.magic = c.id; render(); }, c.id))));
        }
        // Fly: a Fly chit (Broomstick, a Flying Carpet...) takes him over to this tile or a neighbouring one; he lands by a die roll (rule 4.3 flying)
        if (s?.act === 'fly' || ui.pickFly === i) {
            out.push(h('p', { class: 'hint' }, 'Fly over which tile? A flight needs a Fly chit; you land at a clearing on that tile by a die roll, and cannot be blocked in the air.'));
            out.push(h('div', { class: 'chips2' }, ...flyTiles(st, data).map(t => h('button', { class: `chip${s?.to === t ? ' on' : ''}`, 'data-fly-tile': t, onclick: () => { d.slots[i] = { act: 'fly', to: t }; ui.pickFly = null; ui.planNote = null; advance(i + 1); render(); } }, tileName(t)))));
        }
        if (st.ch.mist) out.push(h('p', { class: 'hint bad' }, 'As mist you can only move and hide.'));
        else if (st.ch.morph) out.push(h('p', { class: 'hint bad' }, `In this shape you cannot ${['rest', 'trade', 'hire', 'enchant'].map(a => ACT_LABEL[a]?.toLowerCase() ?? a).join(', ')}.`));
        const blockedNow = (st.ch.curses ?? []).filter(n => CURSE_ACT[n]);
        if (blockedNow.length) out.push(h('p', { class: 'hint bad' }, `\u2620 ${blockedNow.map(n => `${n}: ${ACT_LABEL[CURSE_ACT[n]]} is not possible.`).join(' ')}`));
        // a climb needs its second Move straight after the first
        if (s?.act === 'move' && s.to && isMountain(st, data, s.to)) {
            const prev = d.slots[i - 1], next = d.slots[i + 1];
            const paired = (next?.act === 'move' && next.to === s.to) || (prev?.act === 'move' && prev.to === s.to);
            if (!paired) out.push(h('p', { class: 'hint bad' }, `${nameOfClearing(s.to)} is a mountain: it takes two Move phases in a row, so the next phase must be this Move too.`));
        }
        if (ui.pickMove === i || s?.act === 'move') {
            out.push(h('p', { class: 'hint' }, at[i] || st.ch.onRoad ? 'Tap a ringed clearing on the map to go there.' : 'You are on a road; move to one of its ends first.'));
            if (ui.moveMaybe?.length) out.push(h('p', { class: 'hint' }, `Dotted rings: ${ui.moveMaybe.map(nameOfClearing).join(', ')} lie along a hidden path or secret passage you have not found. Your earlier Search may find it; if it has not by then, this Move is lost.`));
        }
        if (planInfo().lantern) out.push(h('p', { class: 'hint', 'data-hint': 'lantern' }, 'Your Shielded Lantern gives one more phase for any activity, but only if you start that phase in a cave clearing: out in the open it is cancelled.'));
        if (extras.length) out.push(h('p', { class: 'hint' }, `${base} ordinary phases take any action; the extra phases (${[...new Set(extras)].map(x => ACT_LABEL[x]?.toLowerCase() ?? x).join(', ')}) can fall anywhere in the day, but only for their own action.`));
        return out;
    }

    function startDay() {
        const d = ui.draft, { total, kinds } = planInfo();
        // A phase that no longer exists (a move into a cave takes the sunlight phases away) is dropped, not refused.
        const slots = d.slots.map((s, i) => (!s || s.act === 'nothing' || i >= total || kinds[i] === 'over' ? null : s));
        ui.draft = null; ui.sheet = null; ui.planStep = 0; ui.planCollapsed = false; ui.peek = false; ui.sel = null;
        act({ type: 'plan', slots });
    }

    // The first phase that has nothing attached yet (null when every phase has an action, or 'Nothing' chosen on purpose).
    function firstUnset() {
        const d = ui.draft, { total } = planInfo();
        for (let i = 0; i < total; i++) if (!d.slots[i]) return i;
        return null;
    }
    const startButton = () => {
        const open = firstUnset();
        const bad = open == null ? planInfo().errors[0] : null;
        if (bad) return h('button', { class: 'btn', 'data-act': 'start-day', 'aria-disabled': 'true', onclick: () => { ui.toast = bad; render(); setTimeout(() => { ui.toast = null; render(); }, 2600); } }, 'Fix the plan');
        return open == null
            ? h('button', { class: 'btn primary', 'data-act': 'start-day', onclick: startDay }, 'Start the day')
            : null;                                  // nothing to press until every phase has an action
    };

    // Out on the road after running away, the first phase is not a choice: it is a Move to one of the road's two ends (rule 8.3.8). The plan starts with it filled in
    // and it cannot be cleared or turned into anything else; only which end can be changed.
    const roadLocked = i => !!st.ch.onRoad && i === 0;
    const newDraft = () => { const slots = Array(9).fill(null); if (st.ch.onRoad) slots[0] = { act: 'move', to: st.ch.onRoad.to }; return { slots }; };
    function roadLockBox(d) {
        const r = st.ch.onRoad, cur = d.slots[0]?.to;
        return h('div', { class: 'roadlock', role: 'note' },
            h('div', { class: 'rl-head' }, icon('lock', 18), h('b', {}, 'This phase is fixed')),
            h('p', {}, `You fled along the road between ${nameOfClearing(r.from)} and ${nameOfClearing(r.to)}. You must Move to one end of it first.`),
            h('div', { class: 'row2' }, ...[r.from, r.to].map(id => h('button', { class: `btn${cur === id ? ' primary' : ''}`, 'data-road-end': id, 'aria-pressed': cur === id ? 'true' : 'false', onclick: () => { d.slots[0] = { act: 'move', to: id }; ui.planNote = null; ui.pickMove = null; advance(1); render(); } }, `${id === r.from ? 'Back to' : 'On to'} ${nameOfClearing(id)}`))));
    }

    function planPanel() {
        const d = ui.draft, { total, base, extras } = planInfo(), at = planLocations();
        ui.planStep = Math.max(0, Math.min(total - 1, ui.planStep ?? 0));
        const step = ui.planStep;
        const tabs = h('div', { class: 'plan-tabs', role: 'tablist' }, ...Array.from({ length: total }, (_, i) => h('button', { class: `ptab${i === step ? ' on' : ''}${d.slots[i] ? ' set' : ''}`, 'data-tab': i, role: 'tab',
            onclick: () => { ui.planStep = i; ui.pickMove = null; ui.pickSearch = null; render(); } },
            h('b', {}, i + 1), h('small', {}, roadLocked(i) ? icon('lock', 11) : null, d.slots[i] ? (ACT_LABEL[d.slots[i].act] ?? d.slots[i].act) : '\u2013'))));
        const grab = h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }, h('span', { class: 'grip' }));
        const head = h('div', { class: 'plan-head' }, h('b', {}, 'Plan your day'), h('button', { class: 'x', 'aria-label': 'Put the plan away', onclick: () => { ui.planCollapsed = true; render(); } }, '\u25BE'));
        const s = d.slots[step];
        const body = h('div', { class: 'plan-step' },
            h('div', { class: 'slot-head' }, h('b', {}, `Phase ${step + 1} of ${total}`), h('span', {}, slotKind(step, base, extras)), h('em', {}, s ? describeSlot(s) : 'not set'),
                s && !roadLocked(step) ? h('button', { class: 'clearbtn', onclick: () => { d.slots[step] = null; render(); } }, 'Clear') : null),
            ui.planNote ? h('p', { class: 'hint bad' }, ui.planNote) : null,
            ...(roadLocked(step) ? [roadLockBox(d)] : phaseChoices(step, at, base, extras, total)),
            at[step] ? h('p', { class: 'hint' }, `You will be at ${nameOfClearing(at[step])}.`) : null,
            step === 0 ? ask(`Day ${st.day}: choose what you will do in each phase.`, 'Your plan is secret and fixed once you start the day. Fill the phases in any order: extra phases may fall anywhere, and an action is greyed out only when the others have used up what it needs.', { compact: true }) : null);
        // No Back or Next: the numbered tabs jump to any phase and choosing an action moves on to the next empty one. Only the start button is left,
        // and only once the plan can be played.
        const go = startButton();
        const nav = go ? h('div', { class: 'plan-nav' }, go) : null;
        const panel = h('div', { class: 'planpanel' }, grab, head, tabs, h('div', { class: 'plan-body' }, body), ...(nav ? [nav] : []));
        pullDown(grab, panel, () => { ui.planCollapsed = true; render(); });
        return panel;
    }

    // the plan tucked away so the whole map shows; tap it to bring the plan back
    function planBar() {
        const d = ui.draft, { total } = planInfo();
        const parts = d.slots.slice(0, total).map((s, i) => `${i + 1} ${s ? describeSlot(s) : '–'}`);
        return h('div', { class: 'planbar' },
            h('button', { class: 'planbar-main', 'data-act': 'plan-open', onclick: () => { ui.planCollapsed = false; render(); } }, h('b', {}, 'Your plan'), h('small', {}, parts.join(' · '))),
            startButton());
    }

    // A move into a cave takes the sunlight phases away, and an action chosen earlier can be left with no phase to stand in: such a slot is cleared
    // (and the plan says so) instead of being left to make the whole plan invalid.
    function pruneOver(why) {
        const d = ui.draft, k = planKinds(st, data, d.slots).kinds, lost = [];
        k.forEach((kind, i) => { if (kind === 'over' && d.slots[i]) { lost.push(i + 1); d.slots[i] = null; } });
        if (lost.length) ui.planNote = `Phase${lost.length > 1 ? 's' : ''} ${lost.join(', ')} cleared: ${why ?? 'there is no ordinary phase left for it'}.`;
        return lost.length > 0;
    }

    function pick(i, a, at) {
        const d = ui.draft;
        if (roadLocked(i)) return;
        if (actRefusal(st, a)) return;
        ui.pickMove = null; ui.pickSearch = null;
        if (a === 'move') { ui.pickMove = i; ui.pickFly = null; render(); return; }
        if (a === 'fly') { ui.pickFly = i; ui.pickMove = null; d.slots[i] = { act: 'fly' }; render(); return; }
        d.slots[i] = { act: a };
        ui.planNote = null;
        pruneOver();
        if (a === 'alert' && st.ch.chits.some(x => x.type === 'magic' && x.state === 'active')) { ui.planStep = i; render(); return; }      // stay: weapon or Magic chit is asked next
        advance(i + 1);
        render();
    }
    // after a phase is set, go on to the next one that still has nothing attached
    function advance(from) {
        const { total } = planInfo();
        let n = from;
        while (n < total && ui.draft.slots[n]) n++;
        if (n < total) ui.planStep = n;
        else if (from < total) ui.planStep = Math.min(from, total - 1);
    }

    function setMove(i, to) {
        const d = ui.draft;
        if (roadLocked(i) && to !== st.ch.onRoad.from && to !== st.ch.onRoad.to) return;
        d.slots[i] = { act: 'move', to };
        // a mountain takes two moves in a row: fill the next phase with the same move
        // (only if the next phase can really be a Move: an extra phase that is for Rest alone, or a day with no phase left, is not filled)
        const secondHalf = !!planState(st, data, d.slots).climbing[i];          // (this Move finishes a climb already begun: nothing more to fill in)
        if (isMountain(st, data, to) && !secondHalf && i + 1 < planInfo().total && !d.slots[i + 1]) {
            const trial = d.slots.map((x, j) => (j === i + 1 ? { act: 'move', to } : x));
            const k = planKinds(st, data, trial);
            if (k.kinds[i + 1] === 'basic' || k.kinds[i + 1] === 'sunlight' || k.kinds[i + 1] === 'extra') d.slots[i + 1] = { act: 'move', to };
        }
        ui.pickMove = null;
        ui.planNote = null;
        pruneOver(isCave(st, data, to) ? 'a move into a cave takes away the sunlight phases, so the day is shorter' : null);
        advance(i + 1);
        render();
    }

    // ---- boot ----
    (async () => {
        try {
            data = await loadData('data/');
            ctx.data = data;
            if (race) {
                conn = connect(race, { onStandings: list => { standings = list; if (root.isConnected) render(); else conn.stop(); }, onStatus: s => { const was = here; here = s === 'here'; if (here && was === false) refresh(); } });
                const v = await conn.view();
                st = v.view; standings = v.standings; ctx.state = st;
                conn.start();
                map = mountMap(mapBox);
                window.__mr.game = { get st() { return st; }, act, data, ui, render, race, get standings() { return standings; } };
                map.set(mapModel(), { refit: true });
                render();
                requestAnimationFrame(() => { map.fit(false); map.focus(st.ch.onRoad ? st.ch.onRoad.from : st.ch.at, 1.5, false); lastHero = st.ch.at; });
                window.addEventListener('resize', () => map?.fit(false));
                return;
            }
            let fresh = null;
            if (ctx.params?.fresh || !loadSaved()) {
                // a game that was in progress and is being replaced is closed in the History as abandoned, not left "in progress" for ever
                const prev = loadSaved();
                if (prev?.session?.id && prev.period !== 'over') getRecord(prev.session.id).then(r => { if (r && !r.meta?.result) { finalize(r, prev); r.meta.result = 'abandoned'; putRecord(r); } }).catch(() => {});
                fresh = { seed: ctx.params?.seed ?? (Math.floor(Math.random() * 90000) + 1), character: ctx.params?.character ?? 'white-knight', vp: ctx.params?.vp, mode: ctx.params?.mode, lastDay: ctx.params?.lastDay,
                    startDwelling: ctx.params?.startDwelling, startGear: ctx.params?.startGear, options: ctx.params?.options, pauseVictory: true, startSpells: ctx.params?.startSpells };
                st = newGame(data, fresh);
                st.session = { id: String(Date.now()), started: new Date().toISOString(), version: VERSION, params: JSON.parse(JSON.stringify(fresh)) };
                saveGame(st);
            } else st = loadSaved();
            if (st.pauseVictory === undefined) st.pauseVictory = true;
            if (st.pauseShift === undefined) st.pauseShift = true;
            ctx.state = st;
            // a game saved before records existed gets one now; its earlier moves are unknown, so it cannot be replayed
            st.session ??= { id: String(Date.now()), started: new Date().toISOString(), version: VERSION, params: null };
            rec = (await getRecord(st.session.id).catch(() => null)) ?? newRecord({ id: st.session.id, version: st.session.version, params: st.session.params, startedAt: st.session.started, replayable: !!st.session.params });
            if (!rec.days.length) rec.days.push(daySnapshot(st));
            persist(true);
            window.addEventListener('error', e => noteError(null, e.error ?? e.message, 'js'));
            window.addEventListener('pagehide', () => persist(true));
            map = mountMap(mapBox);
            window.__mr.game = { get st() { return st; }, act, data, ui, render };
            map.set(mapModel(), { refit: true });
            render();
            requestAnimationFrame(() => { map.fit(false); map.focus(st.ch.at, 1.5, false); lastHero = st.ch.at; });
            window.addEventListener('resize', () => map?.fit(false));
        } catch (e) {
            console.error(e);
            root.append(h('div', { class: 'note' }, 'Could not start the game: ' + e.message));
        }
    })();
    const offVoice = onVoice(() => { if (!root.isConnected) { offVoice(); return; } if (st) render(); });
    return root;
}
