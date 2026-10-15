import { h } from '../dom.js';
import { mountMap } from '../mapview.js';
import { loadData } from '../../engine/data.js';
import { newGame } from '../../engine/setup.js';
import { apply, phasesFor, validatePlan, planKinds, restOptions, chitLabel, LAST_DAY } from '../../engine/day.js';
import { roadsFrom, isMountain, isCave, nameOfClearing, tileOf, numOf, tileName } from '../../engine/world.js';
import { nameOf, defOf, priceOf, weightOf, summaryOf } from '../../engine/items.js';
import { WEIGHT_WORDS, lvl } from '../../engine/core.js';
import { REL_NAMES } from '../../engine/tables.js';
import { stockOf, sellable } from '../../engine/trade.js';
import { drinksCost } from '../../engine/meeting.js';
import { rollRow, rollsByIds, latestRoll, diceOf } from '../dice.js';
import { combatSheet } from './combatui.js';
import { HELP } from './info.js';
import { newRecord, daySnapshot, finalize } from '../../engine/gamerecord.js';
import { putRecord, getRecord } from '../gamestore.js';
import { VERSION } from '../version.js';
import { ask } from '../ask.js';
import { itemFace } from '../counter.js';
import { cardEl } from '../card.js';
import { earned, targets, scoreGame, progress, FACTORS, CATS } from '../../engine/score.js';
import { COLORS, COLOR_MEANING, dayColors, isMagicDay, colorSources, castable } from '../../engine/spells.js';
import { collect as collectReport, send as sendReport } from '../bugreport.js';

// The game screen: status strip, map, a dock that follows the day, and sheets for the plan, the character and the log.
const SAVE_KEY = 'mr-save-v1';
const ACT_LABEL = { move: 'Move', hide: 'Hide', search: 'Search', trade: 'Trade', hire: 'Hire', rest: 'Rest', alert: 'Alert', enchant: 'Enchant', nothing: 'Nothing' };
const TABLE_LABEL = { peer: 'Peer', locate: 'Locate', loot: 'Loot', ground: 'Ground', sitecard: 'Site card', runes: 'Read runes' };

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
    const tray = h('button', { class: 'tray', 'aria-label': 'Dice rolls', 'data-act': 'dice', onclick: () => { ui.sheet = ui.sheet === 'dice' ? null : 'dice'; render(); } });
    const layer = h('div', { class: 'layer' });
    const mapTools = h('div', { class: 'maptools' },
        h('button', { 'aria-label': 'Centre on me', onclick: () => map?.focus(st.ch.onRoad ? st.ch.onRoad.from : st.ch.at) }, '\u25CE'),
        h('button', { 'aria-label': 'Show the whole realm', onclick: () => map?.fit() }, '\u2922'));
    mapBox.append(mapTools);
    root.append(strip, mapBox, tray, dock, layer);
    let lastHero = null, st = null, data = null, map = null, ui = { sheet: null, sel: null, draft: null, toast: null };

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

    function commit(next) { st = next; ctx.state = st; saveGame(st); render(); }
    function act(action) {
        ui.combatMap = false;
        if (action.type !== 'tidy') ui.gainSeen = st.gainSeq ?? 0;          // what he found last time is old news once he does something else
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
    function abandon() {
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
            if (c.up && c.clearing && (c.kind === 'sound' || c.kind === 'site')) { add(c.tile + c.clearing, { k: c.kind, label: c.kind === 'sound' ? `\u266A ${name}` : `\u25C6 ${name}` }); continue; }
            if (!c.up && c.kind === 'site' && st.ch.discovered.sites.includes(c.id)) { add(c.tile + c.num, { k: 'site', label: `\u25C6 ${name}` }); continue; }
            (chitsByTile[c.tile] ??= []).push({ up: known, name: known ? (c.kind === 'sound' ? `${name} ${c.num}` : name) : '?', id: c.id, kind: known ? c.kind : null, slot: slotOf[c.id] });
        }
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
        ui.moveTargets = [];
        if (ui.sheet === 'plan' && st.pending?.type === 'plan' && ui.draft) {
            const i = ui.planStep ?? 0, from = planLocations()[i];
            if (ui.pickMove === i || ui.draft.slots[i]?.act === 'move') {
                ui.moveTargets = st.ch.onRoad && i === 0 ? [st.ch.onRoad.from, st.ch.onRoad.to] : from ? roadsFrom(st, data, from).filter(r => r.usable).map(r => r.to) : [];
            }
        }
        return {
            tiles: data.tiles, art: data.art, placements: st.placements, side: 'normal', showHidden: false, discovered: new Set(st.ch.discovered.paths),
            chitsByTile, tokens, hero: st.ch.onRoad ? null : st.ch.at, heroHidden: st.ch.hidden, selected: ui.sel, plan: planPath, targets: ui.moveTargets,
            onTap: id => {
                if (ui.sheet === 'plan' && st.pending?.type === 'plan' && ui.draft) {
                    // planning: a tap on a clearing next to where this phase starts sets the move; any other tap just looks at that clearing
                    const i = ui.planStep ?? 0, from = planLocations()[i];
                    const wantsMove = ui.pickMove === i || ui.draft.slots[i]?.act === 'move';
                    const reach = from && roadsFrom(st, data, from).some(r => r.usable && r.to === id);
                    if (wantsMove && (reach || (st.ch.onRoad && i === 0 && (id === st.ch.onRoad.from || id === st.ch.onRoad.to)))) { ui.planCollapsed = false; setMove(i, id); return; }
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
        strip.replaceChildren(
            h('button', { class: 'back', 'aria-label': 'Menu', onclick: () => { ui.sheet = ui.sheet === 'menu' ? null : 'menu'; render(); } }, '☰'),
            h('button', { class: 'bugbtn', 'aria-label': 'Report a problem', 'data-act': 'bug', onclick: () => { ui.sheet = 'bug'; render(); } }, '\u{1F41E}'),
            h('button', { class: `daybox${isMagicDay(st.day) ? ' magic' : ''}`, 'data-act': 'calendar', 'aria-label': 'Calendar and the colours of magic', onclick: () => { ui.sheet = ui.sheet === 'calendar' ? null : 'calendar'; render(); } },
                h('b', {}, `Day ${st.day}`, h('small', {}, st.mode === 'endless' ? '' : `/${st.lastDay ?? 28}`)),
                h('span', {}, isMagicDay(st.day) ? `${dayColors(st.day).join(' & ')} magic` : `${st.period === 'over' ? 'finished' : st.period}`)),
            h('button', { class: 'stats', onclick: () => { ui.sheet = ui.sheet === 'char' ? null : 'char'; render(); } },
                h('span', { class: 'statbox gold', 'data-stat': 'gold' }, h('small', {}, 'Gold'), h('b', {}, String(st.ch.gold))),
                h('span', { class: 'statbox fame', 'data-stat': 'fame' }, h('small', {}, 'Fame'), h('b', {}, String(st.ch.fame))),
                h('span', { class: 'statbox notor', 'data-stat': 'notoriety' }, h('small', {}, 'Notor'), h('b', {}, String(st.ch.notoriety)))),
            (() => {
                const tot = vpNow();
                return h('button', { class: 'vpchip', 'data-act': 'vp', 'aria-label': `Victory points: ${tot}. Tap for your goals`, onclick: () => { ui.sheet = ui.sheet === 'score' ? null : 'score'; render(); } },
                    h('small', {}, 'VP'), h('b', {}, tot > 0 ? `+${tot}` : String(tot)));
            })());
        map.set(mapModel());
        const hero = st.ch.onRoad ? st.ch.onRoad.from : st.ch.at;
        if (hero !== lastHero) { lastHero = hero; map.focus(hero); }
        renderTray();
        renderDock();
        // Sheets are rebuilt on every change; keep each scrolling area where it was while the same question is still on screen
        // (tapping a chit or a target must not throw the view back to the top). A new question starts at the top.
        const viewKey = `${st.pending?.type ?? ''}|${st.combat?.round ?? ''}|${ui.sheet ?? ''}`;
        const scrolled = new Map();
        if (ui.scrollKey === viewKey) layer.querySelectorAll('.cb-scroll, .sheet2, .plan-body, .journal').forEach(el => scrolled.set(el.className, el.scrollTop));
        layer.replaceChildren(...sheets());
        ui.scrollKey = viewKey;
        if (scrolled.size) layer.querySelectorAll('.cb-scroll, .sheet2, .plan-body, .journal').forEach(el => { const t = scrolled.get(el.className); if (t) el.scrollTop = t; });
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
        tray.replaceChildren(r ? rollRow(r, { compact: true }) : h('div', { class: 'rollrow compact none' }, h('div', { class: 'rr-what' }, 'Dice'), h('div', { class: 'rr-body' }, h('span', { class: 'rr-res dim' }, 'Your rolls show here'))),
            h('span', { class: 'tray-more' }, '\u2026'));
        // while the plan is open the map needs the room: the dice tray waits (its rolls are in the journal)
        tray.hidden = !!(st.pending?.type === 'plan' && ui.sheet === 'plan' && ui.draft && !ui.planCollapsed);
    }

    function renderDock() {
        const p = st.pending;
        const where = nameOfClearing(st.ch.at);
        const magicNow = dayColors(st.day);
        const magicBar = magicNow.length ? h('button', { class: 'magicbar', 'data-act': 'magic-day', onclick: () => { ui.sheet = 'calendar'; render(); } },
            h('span', {}, 'The land is filled with'), ...magicNow.map(c => colorChip(c)), h('span', { class: 'until' }, 'until midnight')) : null;
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
        const gainNames = fresh.map(it => nameOf(data, it));
        const recent = recent0.filter(l => !gainNames.some(n => (l.s ?? l.t).includes(n)));
        const prowl = st.period === 'daylight' && st.prowl ? h('button', { class: 'prowl', 'data-act': 'prowl', onclick: () => { ui.sheet = 'dice'; render(); } },
            h('b', {}, `Monster roll ${st.prowl}`), h('span', {}, prowlers().join(', ') || 'no one stirs')) : null;
        let main;
        if (!p) main = h('div', { class: 'note' }, 'Working...');
        else if (p.type === 'plan' && ui.sheet === 'plan' && ui.draft) { dock.replaceChildren(ui.planCollapsed ? planBar() : planPanel()); return; }
        else if (p.type === 'plan') main = h('div', { class: 'dock-ask' },
            ask(`Day ${st.day}, Birdsong: plan your day.`, `You choose one action for each of your ${phasesFor(st, data, []).total} phases now, in secret; they are then played in order after the Monster Roll.`, { compact: true }),
            h('button', { class: 'btn primary big', 'data-act': 'plan', onclick: () => { ui.draft ??= { slots: Array(9).fill(null) }; ui.sheet = 'plan'; ui.planCollapsed = false; render(); } }, 'Plan your day'));
        else if (p.type === 'phase') {
            const slot = st.plan[p.i];
            main = h('div', { class: 'phase' },
                ask(`Phase ${p.i + 1} of ${st.plan.length}: ${describeSlot(slot)}.`, 'This is the action you planned. Press it to carry it out; "Play the day" carries out every phase that is left. Anything that needs your decision will stop and ask.', { compact: true }),
                h('div', { class: 'phase-info' }, h('b', {}, `Phase ${p.i + 1} of ${st.plan.length}`), h('span', {}, describeSlot(slot))),
                h('div', { class: 'row2' },
                    h('button', { class: 'btn primary', 'data-act': 'next', onclick: () => act({ type: 'next' }) }, describeSlot(slot)),
                    h('button', { class: 'btn', 'data-act': 'all', onclick: () => act({ type: 'next', all: true }) }, 'Play the day')));
        } else if (p.type === 'over') main = h('button', { class: 'btn primary big', onclick: () => { ui.sheet = 'over'; render(); } }, 'See your result');
        else main = h('div', { class: 'note' }, 'Decision needed...');
        dock.replaceChildren(...[magicBar, info, ...gainBars, prowl, recent.length ? h('div', { class: 'lastlog' }, ...recent.map((l, i) => h('p', { class: i === recent.length - 1 ? 'new' : '' }, l.s ?? l.t))) : null, main].filter(Boolean));
    }

    function describeSlot(s) {
        if (!s || s.act === 'nothing') return 'Do nothing';
        if (s.act === 'move') return `Move to ${nameOfClearing(s.to)}`;
        if (s.act === 'search') return s.table ? `Search: ${TABLE_LABEL[s.table]}` : 'Search';
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
            else if (ui.sheet === 'spell') out.push(spellSheet());
            else if (ui.sheet === 'card') out.push(modal(st.ch.name, h('div', {}, data.art?.cards?.[st.ch.id] ? h('img', { class: 'cardpic', src: data.art.cards[st.ch.id], alt: 'Character card' }) : h('p', {}, 'No card picture.')), { close: () => { ui.sheet = 'char'; render(); } }));
            return out;
        }
        if (ui.peek && ui.sel && p?.type === 'plan') { out.push(clearingSheet()); return out; }
        if (p?.type === 'turn-end') out.push(turnEndSheet());
        else if (p?.type === 'turn-end') out.push(turnEndSheet());
        else if (p?.type === 'rest') out.push(restSheet(p));
        else if (p?.type === 'search-table') out.push(modal('Search: which table?', h('div', {},
            ask(`You are searching at ${nameOfClearing(st.ch.at)}: choose the table.`, 'Your plan said only Search, and the rules let you name the table when the phase comes. A Search phase is one roll on one table, and each table finds different things, so pick the one that matches what you are after.'),
            ...p.options.map(t => h('button', { class: 'btn', 'data-table': t, onclick: () => act({ type: 'search-table', table: t }) }, h('b', {}, TABLE_LABEL[t]),
                h('small', {}, { peer: 'look for clues, hidden enemies and hidden paths', locate: 'find passages, clues and sites in this clearing', loot: 'take treasure from a site you have discovered here',
                    ground: 'pick up what lies on the ground here', sitecard: 'search the place you found with a treasure card', runes: 'learn a spell from a site here or an artifact or book you carry' }[t] ?? ''))))));
        else if (p?.type === 'effort-cost') out.push(effortSheet(p));
        else if (p?.type === 'runes-target') out.push(modal('Read runes: which?', h('div', {},
            ask('Which runes will you read?', 'A Reading Runes search needs one target: a discovered site here that holds spell cards, or an artifact or book you carry and have active.'),
            ...p.options.map(o => h('button', { class: 'btn', 'data-target': o.key, onclick: () => act({ type: 'runes-target', target: o.key }) }, o.label)))));
        else if (p?.type === 'learn-spell') out.push(learnSheet(p));
        else if (p?.type === 'enchant-choice') out.push(modal('Enchant', h('div', { class: 'restsheet' },
            ask('Which Magic chit will you enchant?', 'It turns over to its colour and stays enchanted until you play it. A colour chit supplies that colour of magic to your own spells, and is used up when played.'),
            h('div', { class: 'chitgrid' }, ...st.ch.chits.map(c => {
                const o = p.options.find(x => x.chit === c.id);
                const label = c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`;
                return h('button', { class: `chit2 ${c.type} ${c.state}${o ? ' pick' : ' off'}`, 'data-enchant-chit': c.id, disabled: !o || null, onclick: () => act({ type: 'enchant-choice', chit: c.id }) },
                    h('b', {}, label), h('span', {}, '*'.repeat(c.effort) || ' '), h('small', {}, o ? o.color : c.type === 'magic' ? 'Magic' : c.type === 'move' ? 'Move' : 'Fight'));
            })))));
        else if (p?.type === 'search-choice') out.push(modal(`${TABLE_LABEL[p.table]}: your choice`, h('div', {}, latestRoll(st) ? rollRow(latestRoll(st)) : null, ask(`You rolled ${p.roll.join('+')}: the table gives you a choice.`, 'This result lets you pick whichever entry of the table you want instead of the one the dice name. Choose the one that helps you most.'),
            ...p.options.map(r => h('button', { class: 'btn', onclick: () => act({ type: 'search-choice', result: r }) }, r)))));
        else if (p?.type === 'trade' || p?.type === 'trade-offer') out.push(tradeSheet(p));
        else if (p?.type === 'hire' || p?.type === 'hire-offer') out.push(hireSheet(p));
        else if (!ui.welcomeDone && !welcomed() && st.day === 1 && p?.type === 'plan') out.push(modal(`Welcome, ${st.ch.name}`, h('div', {},
            h('p', {}, `You are at the ${st.ch.startDwelling}${st.ch.items.length ? ' with ' + st.ch.items.map(i => nameOf(data, i)).join(', ') : ' with no weapon or armor yet: trade for some'}. You have ${st.lastDay ?? 28} days.`),
            h('p', {}, h('b', {}, 'Each morning'), ' you plan up to four phases in secret: move, hide, search, trade, hire, rest or alert.'),
            h('p', {}, h('b', {}, 'Then the day plays out'), ', a phase at a time, and anything you meet is called out by the chits you turn up.'),
            h('p', {}, h('b', {}, 'Each evening'), ' you fight whoever shares your clearing, playing your chits in secret.'),
            h('p', { class: 'hint' }, 'Tap your gold, Fame and Notoriety for your chits and gear. The menu has the map key and a short guide.'),
            h('button', { class: 'btn primary', 'data-act': 'welcome-ok', onclick: () => { setWelcomed(); ui.welcomeDone = true; render(); } }, 'Begin'))));
        else if (p?.type === 'plan' && st.day > 1 && ui.reportedDay !== st.day && ui.sheet !== 'plan') out.push(reportSheet());
        else if (ui.sheet === 'char') out.push(charSheet());
        else if (ui.sheet === 'clearing' && ui.sel) out.push(clearingSheet());
        else if (ui.sheet === 'menu') out.push(menuSheet());
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
        else if (ui.sheet === 'spell') out.push(spellSheet());
        else if (ui.sheet === 'score') out.push(scoreSheet());
        else if (ui.sheet === 'key') out.push(modal('Map key', h('div', { class: 'key' },
            ...[['I H C G', 'Dwellings: Inn, House, Chapel, Guard house; the number beside it is the natives there'],
                ['\u25C6', 'A site you have found: treasure lies there'], ['\u266A', 'A sound chit that has turned up: monsters stir in that clearing'],
                ['?', 'A face-down chit in that tile; a letter means you have peeked at it'], ['red', 'Monsters (the number is how many)'], ['blue', 'Natives'],
                ['? on a dotted line', 'A hidden path or secret passage printed on the tile that you have not discovered yet: you cannot use it until you do'],
                ['\u25C7', 'You: solid when you are seen, hollow when you are hidden']].map(([k, t]) => h('p', {}, h('b', {}, k), ' ', t))), { close: () => { ui.sheet = null; render(); } }));
        else if (ui.sheet === 'help') out.push(modal('How to play', h('div', {}, ...HELP.flatMap(([t, x]) => [h('h3', {}, t), h('p', {}, x)])), { close: () => { ui.sheet = null; render(); } }));
        return out;
    }

    // Sheets that are only for looking can be dismissed by tapping anywhere outside them; those that need an answer cannot.
    const modal = (title, body, { close } = {}) => h('div', { class: 'sheet-bg', onclick: e => { if (close && e.target === e.currentTarget) close(); } }, h('div', { class: 'sheet2' },
        h('div', { class: 'sheet2-head' }, h('b', {}, title), close ? h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '\u2715') : null), body));

    // Pictures from the original game, when we have them.
    const picOf = name => { const a = data.art; return a ? (a.weapons?.[name] ?? a.armor?.[name] ?? a.horses?.[name] ?? null) : null; };
    const ico = (name, cls = 'ico') => { const s = picOf(name); return s ? h('img', { class: cls, src: s, alt: '', loading: 'lazy' }) : null; };
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

    function tradeSheet(p) {
        if (p.type === 'trade-offer') {
            if (p.insult) {
                return modal(`${p.group}: ${p.insult}!`, h('div', {},
                    offerDice(p),
                    h('p', {}, `The ${p.group} are offended. You may pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'} to calm things, or they will block you.`),
                    h('button', { class: 'btn', onclick: () => act({ type: 'trade', act: 'pay' }) }, `Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'}`),
                    h('button', { class: 'btn', onclick: () => act({ type: 'trade', act: 'fight' }) }, 'Refuse')));
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
        return modal(`Trade with the ${p.group}`, h('div', { class: 'trade' },
            ask(`Trade phase with the ${p.group} at ${nameOfClearing(st.ch.at)}.`, 'Sell your things at their basic price, or choose one thing to buy: a purchase is priced by a roll on the Meeting Table, so how they feel about you matters. Press Done when you have finished.'),
            h('p', { class: 'hint' }, `Relationship: ${REL_NAMES[String(st.ch.rel?.[p.group] ?? 0)]}. You have ${st.ch.gold} gold. In one Trade phase you may sell any number of things, or buy one.${(st.ch.rel?.[p.group] ?? 0) <= -2 ? ' They are your enemies: expect an insult or a fight, not a price.' : ''}`),
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
            ...(goods.length ? goods.map(g => h('button', { class: 'btn row', disabled: p.mode === 'sell', onclick: () => act({ type: 'trade', act: 'buy', idx: g.idx }) },
                ico(g.name), h('span', { class: 'rl' }, h('b', {}, g.name), h('small', {}, g.sub)), h('em', {}, `${g.base}g`))) : [h('p', { class: 'hint' }, 'Nothing for sale.')]),
            h('h3', {}, 'Sell yours'),
            ...(mine.length ? mine.map(m => h('button', { class: 'btn row', disabled: p.mode === 'buy', onclick: () => act({ type: 'trade', act: 'sell', item: m.uid }) },
                ico(m.name), h('span', { class: 'rl' }, h('b', {}, m.name), h('small', {}, m.sub)), h('em', {}, `${m.price}g`))) : [h('p', { class: 'hint' }, 'You have nothing to sell.')]),
            h('button', { class: 'btn primary', onclick: () => act({ type: 'trade', act: 'done' }) }, 'Done')));
    }

    function hireSheet(p) {
        if (p.type === 'hire-offer') {
            if (p.insult) return modal(`${p.group}: ${p.insult}!`, h('div', {},
                offerDice(p),
                h('p', {}, `The ${p.group} are offended. Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'} to calm things, or they block you.`),
                h('button', { class: 'btn', onclick: () => act({ type: 'hire', act: 'pay' }) }, `Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'}`),
                h('button', { class: 'btn', onclick: () => act({ type: 'hire', act: 'fight' }) }, 'Refuse')));
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
            h('button', { class: 'btn', onclick: () => act({ type: 'hire', act: 'cancel' }) }, 'Never mind')));
    }

    // One treasure site the way the printed Setup Card words it; the same sentence heads the site in the clearing sheet.
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
            if (pile.length) status.push(h('p', { class: 'setupline dim' }, 'Which are Great is not known until they are looted.'));
        }
        status.push(h('p', { class: 'setupline dim' }, needs));
        return h('div', { class: 'sitecard' }, e ? h('p', { class: 'setupline card' }, siteCardText(e)) : null, ...status);
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
            const stats = `vuln ${md.vulnerability}${md.armored ? ' (armored)' : ''} \u00B7 harm ${ls.harm}${'*'.repeat(ls.stars || 0)} at ${ls.attackTime} \u00B7 moves ${ls.moveTime}${md.flies ? ' \u00B7 flies' : ''}`;
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
        const chitEl = c => h('div', { class: `chit2 ${c.type} ${c.state}` }, h('b', {}, c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`), h('span', {}, '*'.repeat(c.effort) || ' '), h('small', {}, c.type === 'move' ? 'Move' : c.type === 'fight' ? 'Fight' : 'Magic'));
        const portrait = data.art?.characters?.[ch.id];
        return modal(ch.name, h('div', {},
            portrait ? h('button', { class: 'portrait', 'aria-label': 'Show the character card', onclick: () => { ui.sheet = 'card'; render(); } }, h('img', { src: portrait, alt: ch.name }), data.art?.cards?.[ch.id] ? h('small', {}, 'Tap for the character card') : null) : null,
            h('div', { class: 'chits' }, ch.chits.map(chitEl)),
            h('p', { class: 'hint' }, 'Gold, Fame and Notoriety are shown on the top bar. Fatigued chits are dim; wounded chits are crossed out.'),
            ...(ch.spells?.length ? [h('h3', {}, 'Spells'), ...ch.spells.map(id => h('div', { class: 'itemrow spellrow' }, h('button', { class: 'btn row', 'data-spell': id, onclick: () => { ui.spellId = id; ui.sheet = 'spell'; render(); } },
                h('span', { class: 'rl' }, h('b', {}, data.spells?.[id]?.name ?? id), h('small', {}, `Type ${data.spells?.[id]?.type ?? '?'} \u00B7 ${data.spells?.[id]?.color ?? 'any colour'} \u00B7 ${data.spells?.[id]?.duration ?? ''}`)),
                h('em', {}, castable(data.spells?.[id]) ? 'castable' : 'not yet'))))]
                : (data.characters[ch.id].stage4.spellsKnown ?? 0) ? [h('p', { class: 'hint' }, `Spells: one of type ${(data.characters[ch.id].stage4.spellTypes ?? []).join('/')} (not castable in this build yet).`)] : []),
            h('h3', {}, 'Carrying'),
            ...ch.items.map(it => {
                const canSwitch = st.pending?.type === 'phase' || st.pending?.type === 'plan';
                return h('div', { class: 'itemrow' },
                    h('button', { class: `btn row${it.active ? ' on' : ''}`, 'data-item': it.uid, 'aria-label': `About the ${nameOf(data, it)}`, onclick: () => { ui.itemUid = it.uid; ui.sheet = 'item'; render(); } },
                        ico(nameOf(data, it)), h('span', { class: 'rl' }, h('b', {}, nameOf(data, it) + (it.damaged ? ' (damaged)' : '') + (it.destroyed ? ' (destroyed)' : '')), h('small', {}, summaryOf(data, it))),
                        h('em', {}, `${WEIGHT_WORDS[weightOf(data, it)] ?? ''}`)),
                    h('button', { class: `switch${it.active ? ' on' : ''}`, role: 'switch', 'aria-checked': it.active ? 'true' : 'false', 'data-switch': it.uid, disabled: !canSwitch || it.destroyed || null,
                        'aria-label': `${nameOf(data, it)}: ${it.active ? 'active' : 'inactive'}`, onclick: () => { ui.keep = true; act({ type: 'tidy', item: it.uid }); } }, it.active ? 'Active' : 'Inactive'),
                    h('button', { class: 'leavebtn', 'aria-label': `Leave the ${nameOf(data, it)} behind`, onclick: () => { ui.keep = true; act({ type: 'tidy', item: it.uid, drop: true }); } }, 'Leave'));
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
            const cols = dayColors(d);
            return h('div', { class: `calday${d === st.day ? ' today' : ''}${d < st.day ? ' past' : ''}${cols.length ? ' magic' : ''}` },
                h('b', {}, String(d)), ...cols.map(c => h('i', { class: `dot ${c.toLowerCase()}`, title: c })));
        };
        const here = colorSources(st, data, st.ch.at);
        return modal('Calendar and magic', h('div', { class: 'calendar' },
            ask(isMagicDay(st.day) ? `Today the land is filled with ${dayColors(st.day).join(' and ')} magic.` : `Day ${st.day} of ${last}: an ordinary day for magic.`,
                'On the seventh day of each week one colour of magic fills the whole realm, from sunrise to midnight, in every clearing. Spells of that colour can be cast anywhere that evening.'),
            h('div', { class: 'calgrid' }, ...Array.from({ length: weeks }, (_, w) => h('div', { class: 'calweek' }, h('small', {}, `Week ${w + 1}`), ...Array.from({ length: 7 }, (_, k) => cell(w * 7 + k + 1))))),
            h('h3', {}, 'The week\'s colours'),
            ...Array.from({ length: weeks }, (_, w) => h('p', { class: 'calrow' }, h('b', {}, `Day ${(w + 1) * 7}`), ...dayColors((w + 1) * 7).map(c => colorChip(c)))),
            h('h3', {}, 'What each colour is'),
            ...COLORS.map(c => h('p', { class: 'calrow' }, colorChip(c), h('span', {}, COLOR_MEANING[c]))),
            h('h3', {}, `In your clearing (${nameOfClearing(st.ch.at)})`),
            here.length ? h('div', {}, ...here.map(x => h('p', { class: 'calrow' }, colorChip(x.color), h('span', {}, x.why)))) : h('p', { class: 'hint' }, 'No colour of magic is present here today.'),
            h('p', { class: 'hint' }, 'In this build the colours come from the seventh day and from a Chapel (White). Enchanted tiles and cards will add more once Enchant is built.')),
            { close: () => { ui.sheet = null; render(); } });
    }

    function menuSheet() {
        return modal('Menu', h('div', {},
            h('button', { class: 'btn', 'data-act': 'menu-bug', onclick: () => { ui.sheet = 'bug'; render(); } }, 'Report a problem'),
            h('button', { class: 'btn', 'data-act': 'open-calendar', onclick: () => { ui.sheet = 'calendar'; render(); } }, 'Calendar and magic'),
            h('button', { class: 'btn', onclick: () => { ui.sheet = 'log'; render(); } }, 'Journal'),
            h('button', { class: 'btn', onclick: () => { ui.sheet = 'help'; render(); } }, 'How to play'),
            h('button', { class: 'btn', onclick: () => { ui.sheet = 'key'; render(); } }, 'Map key'),
            h('button', { class: 'btn', 'data-act': 'setup-card', onclick: () => { ui.sheet = 'setupcard'; render(); } }, 'The Setup Card (what the printed card tells you)'),
            data.art?.misc?.meetingTable ? h('button', { class: 'btn', onclick: () => { ui.sheet = 'tables'; render(); } }, 'Tables (Meeting, Search, Missile, Pit)') : null,
            h('button', { class: 'btn', onclick: () => { ui.sheet = null; map.fit(); render(); } }, 'Show the whole realm'),
            h('button', { class: 'btn', onclick: () => ctx.go('title') }, 'Back to the title screen'),
            h('button', { class: 'btn', onclick: () => { persist(true); ctx.go('history', { id: st.session?.id, back: 'game' }); } }, 'This game\'s record'),
            h('button', { class: 'btn', onclick: abandon }, 'Abandon this game')),
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
            spells: 'Spells learned from cards during the game count (starting spells do not). None can be learned in this build yet.',
            fame: `Recorded Fame ${st.ch.fame} plus the Fame of what you own${belong('fame').length ? ` (${belong('fame').map(x => `${x.name} ${x.v > 0 ? '+' : ''}${x.v}`).join(', ')})` : ''}.`,
            notoriety: `Recorded Notoriety ${st.ch.notoriety} plus the Notoriety of what you own${belong('notoriety').length ? ` (${belong('notoriety').map(x => `${x.name} ${x.v > 0 ? '+' : ''}${x.v}`).join(', ')})` : ''}.`,
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
                h('p', { class: 'hint' }, `${g.vp} victory point${g.vp === 1 ? '' : 's'} are riding on this goal. ${how[g.cat]}`),
                h('details', { class: 'sr-math' }, h('summary', {}, sumUp(g.cat) || 'The arithmetic'),
                    r ? h('p', { class: 'hint' }, r.diff < 0
                        ? `Short by ${Math.abs(r.diff / 3)}, counted three times (${r.diff}), divided by ${FACTORS[g.cat]} and rounded down: ${r.basic}. Bonus ${r.basic} \u00D7 ${vp[g.cat] ?? 0} VP = ${r.bonus}.`
                        : `Over by ${r.diff}, divided by ${FACTORS[g.cat]} and rounded down: ${r.basic}. Bonus ${r.basic} \u00D7 ${vp[g.cat] ?? 0} VP = ${r.bonus}.`) : null));
        };
        const idle = CATS.filter(c => !(need[c] > 0));
        return modal('Your goals', h('div', { class: 'scoresheet' },
            ask(over ? `Final score: ${sign(res.total ?? -100)}${res.dead ? ' (dead characters score -100)' : (res.total >= 0 ? ': a win' : ': not enough')}`
                : res.dead ? 'You are dead: a dead character scores -100.' : `Score ${sign(res.total ?? 0)}. You have reached ${pr.met} of your ${pr.count} goals.`,
                over ? 'The game is over; this is how each goal finished.'
                    : 'Reach every goal by the end of the month to win. Going past a goal earns bonus points; ending short of one costs points, counted three times over.'),
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
            notes: [castable(sp) ? 'You can cast this in this build: in the Encounter step of an evening fight, where its colour of magic is present.' : 'This spell cannot be cast in this build yet.'] });
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
        const sp = data.spells?.[p.spell];
        return modal('Read the runes', h('div', { class: 'itemsheet' },
            ask(`${p.from}: the runes show a spell.`, `You hold a Type ${sp?.type} Magic chit, so you may write it on your sheet. The card stays where it is.`),
            sp ? spellCard(sp) : null,
            h('div', { class: 'row2' },
                h('button', { class: 'btn primary', 'data-act': 'learn', onclick: () => act({ type: 'learn-spell', learn: true }) }, 'Learn it'),
                h('button', { class: 'btn', 'data-act': 'leave', onclick: () => act({ type: 'learn-spell', learn: false }) }, 'Leave it'))));
    }

    // One belonging: both of its faces drawn as counters, the facts, and the switch.
    function itemSheet() {
        const it = st.ch.items.find(i => i.uid === ui.itemUid);
        const back = { close: () => { ui.sheet = ui.itemFrom === 'dock' ? null : 'char'; ui.itemFrom = null; render(); } };
        if (!it) return modal('Belonging', h('p', { class: 'hint' }, 'You no longer have it.'), back);
        const d = defOf(data, it), name = nameOf(data, it), pic = picOf(name) ?? (d?.name ? picOf(d.name) : null);
        const faces = [], facts = [];
        let card = null;
        const fmtT = t => (t == null ? '\u2013' : t);
        if (it.kind === 'weapon') {
            const u = d.unalerted, a = d.alerted;
            faces.push(itemFace({ name, picture: pic, face: 'Not alerted', big: `${u.harm}${fmtT(u.attackTime)}`, stars: u.stars ?? 0, corner: `(${d.length})`, current: !it.alerted && !it.destroyed }));
            faces.push(itemFace({ name, picture: pic, face: 'Alerted', big: `${a.harm}${a.attackTime == null ? '' : a.attackTime}`, stars: a.stars ?? 0, corner: `(${d.length})${a.attackTime == null ? ' time: your chit' : ''}`, current: it.alerted && !it.destroyed }));
            facts.push(`${d.missile ? 'A missile weapon' : 'A striking weapon'}, length ${d.length}, weight ${WEIGHT_WORDS[d.weight]}.`);
            facts.push(`Not alerted: harm ${u.harm}${'*'.repeat(u.stars ?? 0)}, attack time ${fmtT(u.attackTime)}.`);
            facts.push(`Alerted: harm ${a.harm}${'*'.repeat(a.stars ?? 0)}, ${a.attackTime == null ? 'no printed attack time: the Fight chit you play gives the time' : `attack time ${a.attackTime}`}.`);
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
            card = cardEl({ title: td?.name ?? name, kind: td?.great ? 'great' : 'treasure', tag: `${td?.great ? 'Great treasure' : td?.kind === 'large' ? 'Large treasure' : td?.kind === 'small' ? 'Small treasure' : 'Treasure'}${td?.magic ? ` \u00B7 magic ${td.magic}` : ''}`, stats, text, notes, picture: pic });
        }
        const canSwitch = (st.pending?.type === 'phase' || st.pending?.type === 'plan') && !it.destroyed;
        return modal(name, h('div', { class: 'itemsheet' },
            card ?? h('div', { class: 'faces' }, ...faces),
            h('p', { class: 'hint' }, `${it.destroyed ? 'Destroyed. ' : ''}${it.active ? 'Active' : 'Inactive'}${it.kind === 'weapon' ? (it.alerted ? ', alerted' : ', not alerted') : ''}${it.kind === 'armor' ? (it.damaged ? ', damaged' : ', whole') : ''}.`),
            ...facts.map(t => h('p', {}, t)),
            h('div', { class: 'row2' },
                h('button', { class: `switch big${it.active ? ' on' : ''}`, role: 'switch', 'aria-checked': it.active ? 'true' : 'false', 'data-act': 'item-switch', disabled: !canSwitch || null, onclick: () => { ui.keep = true; act({ type: 'tidy', item: it.uid }); } }, it.active ? 'Active: deactivate it' : 'Inactive: activate it'),
                h('button', { class: 'btn', onclick: back.close }, 'Back')),
            canSwitch ? null : h('p', { class: 'hint' }, 'Gear can be changed between phases, not in the middle of one.')), back);
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
            const line = h('p', { class: `j-${l.k}` }, l.s ?? l.t);
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
        const heads = prev.filter(l => /^You kill |^You die|^Every action chit|^You wound |dies\b|^Loot \(|^You take|^You buy|^You pay|curse/i.test(l.t) || ['loot', 'curse', 'discover'].includes(l.k));
        const seen = new Set(), result = [];
        for (const l of heads) { const t = (l.s ?? l.t).trim(); if (!seen.has(t)) { seen.add(t); result.push(l); } }
        if (ui.reportPage !== day + ':overview') {
            return modal(`Day ${day}: the result`, h('div', { class: 'reportsheet' },
                h('div', { class: 'repchips' }, ...(chips.length ? chips.map(([n, v]) => h('span', { class: `repchip ${v > 0 ? 'up' : 'down'}` }, `${n} ${sign(v)}`)) : [h('span', { class: 'repchip' }, 'No change in Fame, Notoriety or gold')])),
                ...(result.length ? result.slice(0, 5).map(l => h('p', { class: `j-${l.k}` }, l.t.replace(/ \(rolled [^)]*\)/, ''))) : [h('p', { class: 'hint' }, 'A quiet day: nothing was won or lost.')]),
                result.length > 5 ? h('p', { class: 'hint' }, `and ${result.length - 5} more: see the overview.`) : null,
                h('div', { class: 'row2' },
                    h('button', { class: 'btn', 'data-act': 'report-next', onclick: () => { ui.reportPage = `${day}:overview`; render(); } }, 'Day Overview'),
                    h('button', { class: 'btn primary', 'data-act': 'report-ok', onclick: () => { ui.reportedDay = st.day; render(); } }, 'On to the next day'))));
        }
        // group the day's lines under the phase or the evening they belong to
        const groups = [];
        for (const l of prev) {
            if (l.k === 'phase') groups.push({ head: l.s ?? l.t, kids: [] });
            else if (/sun sets/.test(l.t) || !groups.length) groups.push({ head: /sun sets/.test(l.t) ? 'The evening' : 'Morning', kids: [] });
            else groups.at(-1).kids.push(l);
        }
        const show = groups.filter(g => g.kids.length || /^Phase/.test(g.head));
        return modal(`Day ${day}: overview`, h('div', { class: 'reportsheet' },
            ...show.map(g => g.kids.length
                ? h('details', { class: 'repstep' }, h('summary', {}, g.head), ...roundBoxes(g.kids))
                : h('p', { class: 'repstep plain' }, g.head)),
            h('div', { class: 'row2' },
                h('button', { class: 'btn', onclick: () => { ui.reportPage = null; render(); } }, 'Back to the result'),
                h('button', { class: 'btn primary', 'data-act': 'report-ok', onclick: () => { ui.reportedDay = st.day; render(); } }, 'On to the next day'))));
    }

    function logSheet() {
        return modal('Journal', h('div', { class: 'journal' }, [...st.log].reverse().slice(0, 80).map(l => h('p', { class: `j-${l.k}` }, h('small', {}, `Day ${l.day}`), ' ', l.s ?? l.t))),
            { close: () => { ui.sheet = null; render(); } });
    }

    function overSheet() {
        const s = st.score;
        const dead = st.over?.reason === 'died';
        const canRestart = dead && st.mode !== 'endless' && st.day < (st.lastDay ?? 28);
        if (canRestart && ui.restartVp) return restartSheet();
        return modal(dead ? 'You have died' : 'The month is over', h('div', {},
            dead ? h('p', {}, 'Your character is dead and scores -100.') : null,
            ...(s.rows ?? []).map(r => h('p', { class: 'scorerow' }, h('b', {}, r.cat), ` ${r.earned} of ${r.need}`, h('span', {}, ` \u2192 ${r.basic + r.bonus >= 0 ? '+' : ''}${r.basic + r.bonus}`))),
            h('p', { class: 'bigline' }, `Total ${s.total}`, h('small', {}, s.won ? ' (you won)' : ' (not enough)')),
            st.deaths ? h('p', { class: 'hint' }, `You have died ${st.deaths} time${st.deaths === 1 ? '' : 's'} this game.`) : null,
            canRestart ? h('button', { class: 'btn primary', 'data-act': 'restart', onclick: () => { ui.restartVp = { great: 0, spells: 0, fame: 2, notoriety: 1, gold: 0 }; render(); } }, `Return tomorrow as a new ${st.ch.name}`) : null,
            h('button', { class: 'btn', onclick: () => { clearSaved(); ctx.go('title'); } }, 'Back to the title')));
    }

    function restartSheet() {
        const weeks = Math.ceil(((st.lastDay ?? 28) - st.day) / 7), total = Math.max(2, weeks + 1), v = ui.restartVp;
        const used = Object.values(v).reduce((a, b) => a + b, 0);
        const rows = [['fame', 'Fame', 10], ['notoriety', 'Notoriety', 20], ['gold', 'Gold', 30], ['great', 'Great treasures', 1]];
        return modal(`A new ${st.ch.name}`, h('div', {},
            ask('Your character is dead: set the goals for the next one.', 'A new character arrives at the Inn tomorrow with fresh chits and gear. The goals you set now are what he will be scored against at the end of the game.'),
            h('p', {}, `He arrives at the Inn tomorrow. With ${weeks} week${weeks === 1 ? '' : 's'} left he has ${total} victory points to spend.`),
            ...rows.map(([k, label, f]) => h('div', { class: 'vprow' },
                h('div', { class: 'vp-l' }, h('b', {}, label), h('small', {}, v[k] ? `goal: ${v[k] * f}` : 'no goal')),
                h('div', { class: 'stepper' },
                    h('button', { class: 'step-btn', disabled: v[k] <= 0, onclick: () => { v[k]--; render(); } }, '\u2212'),
                    h('div', { class: 'step-val' }, h('b', {}, String(v[k]))),
                    h('button', { class: 'step-btn', disabled: used >= total, onclick: () => { v[k]++; render(); } }, '+')))),
            h('p', { class: used === total ? 'hint' : 'hint bad' }, used === total ? 'All points spent.' : `${total - used} left to spend.`),
            h('button', { class: 'btn primary', disabled: used !== total, 'data-act': 'restart-go', onclick: () => { const vp = { ...v }; ui.restartVp = null; ui.sheet = null; act({ type: 'restart', vp }); } }, 'Begin')),
            { close: () => { ui.restartVp = null; render(); } });
    }

    // ---- planning ----
    // ---- planning: a panel under the map, one phase at a time (or all of them), with the map still live above it ----
    // where he will be at the start of each phase, as planned
    function planLocations() {
        const at = []; let loc = st.ch.onRoad ? null : st.ch.at;
        for (let i = 0; i < 9; i++) { at.push(loc); const s = ui.draft.slots[i]; if (s?.act === 'move' && s.to) loc = s.to; }
        return at;
    }
    const planInfo = () => {
        const v = planKinds(st, data, ui.draft.slots);
        return { total: v.total, base: v.base, extras: v.extras, kinds: v.kinds, errors: v.errors };
    };

    // what kind of phase this recorded activity uses: an extra phase may be recorded anywhere, the rest fill the basic and then the sunlight phases
    function slotKind(i, base, extras) {
        const k = planInfo().kinds[i];
        if (k === 'extra') return 'extra phase';
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
        out.push(h('div', { class: 'chips2 six' },
            ...['move', 'hide', 'search', 'trade', 'hire', 'rest', 'alert', ...(st.ch.chits.some(x => x.type === 'magic') ? ['enchant'] : []), 'nothing'].map(a => {
                const dim = a !== 'nothing' && over(others.map((x, j) => (j === i ? { act: a, to: s?.act === a ? s.to : undefined } : x))) > baseOver;
                return h('button', { class: `chip${s?.act === a ? ' on' : ''}${dim ? ' dim' : ''}`, 'data-slot': i, 'data-pick': a, disabled: dim, onclick: () => pick(i, a, at[i]) }, ACT_LABEL[a]);
            })));
        // a climb needs its second Move straight after the first
        if (s?.act === 'move' && s.to && isMountain(st, data, s.to)) {
            const prev = d.slots[i - 1], next = d.slots[i + 1];
            const paired = (next?.act === 'move' && next.to === s.to) || (prev?.act === 'move' && prev.to === s.to);
            if (!paired) out.push(h('p', { class: 'hint bad' }, `${nameOfClearing(s.to)} is a mountain: it takes two Move phases in a row, so the next phase must be this Move too.`));
        }
        if (ui.pickMove === i || s?.act === 'move') {
            out.push(h('p', { class: 'hint' }, at[i] || st.ch.onRoad ? 'Tap a ringed clearing on the map to go there.' : 'You are on a road; move to one of its ends first.'));
        }
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

    function planPanel() {
        const d = ui.draft, { total, base, extras } = planInfo(), at = planLocations();
        ui.planStep = Math.max(0, Math.min(total - 1, ui.planStep ?? 0));
        const step = ui.planStep;
        const tabs = h('div', { class: 'plan-tabs', role: 'tablist' }, ...Array.from({ length: total }, (_, i) => h('button', { class: `ptab${i === step ? ' on' : ''}${d.slots[i] ? ' set' : ''}`, 'data-tab': i, role: 'tab',
            onclick: () => { ui.planStep = i; ui.pickMove = null; ui.pickSearch = null; render(); } },
            h('b', {}, i + 1), h('small', {}, d.slots[i] ? (ACT_LABEL[d.slots[i].act] ?? d.slots[i].act) : '\u2013'))));
        const head = h('div', { class: 'plan-head' }, h('b', {}, 'Plan your day'), h('button', { class: 'x', 'aria-label': 'Hide the plan', onclick: () => { ui.planCollapsed = true; render(); } }, '\u25BE'));
        const s = d.slots[step];
        const body = h('div', { class: 'plan-step' },
            h('div', { class: 'slot-head' }, h('b', {}, `Phase ${step + 1} of ${total}`), h('span', {}, slotKind(step, base, extras)), h('em', {}, s ? describeSlot(s) : 'not set'),
                s ? h('button', { class: 'clearbtn', onclick: () => { d.slots[step] = null; render(); } }, 'Clear') : null),
            ...phaseChoices(step, at, base, extras, total),
            at[step] ? h('p', { class: 'hint' }, `You will be at ${nameOfClearing(at[step])}.`) : null,
            step === 0 ? ask(`Day ${st.day}: choose what you will do in each phase.`, 'Your plan is secret and fixed once you start the day. Fill the phases in any order: extra phases may fall anywhere, and an action is greyed out only when the others have used up what it needs.', { compact: true }) : null);
        const nav = h('div', { class: 'row2 plan-nav' },
            h('button', { class: 'btn', 'data-act': 'plan-back', disabled: step === 0, onclick: () => { ui.planStep = step - 1; ui.pickMove = null; ui.pickSearch = null; render(); } }, '\u2039 Back'),
            step < total - 1 ? h('button', { class: 'btn', 'data-act': 'plan-next', onclick: () => { ui.planStep = step + 1; ui.pickMove = null; ui.pickSearch = null; render(); } }, 'Next \u203A') : null,
            startButton());
        return h('div', { class: 'planpanel' }, head, tabs, h('div', { class: 'plan-body' }, body), nav);
    }

    // the plan tucked away so the whole map shows; tap it to bring the plan back
    function planBar() {
        const d = ui.draft, { total } = planInfo();
        const parts = d.slots.slice(0, total).map((s, i) => `${i + 1} ${s ? describeSlot(s) : '–'}`);
        return h('div', { class: 'planbar' },
            h('button', { class: 'planbar-main', 'data-act': 'plan-open', onclick: () => { ui.planCollapsed = false; render(); } }, h('b', {}, 'Your plan'), h('small', {}, parts.join(' · '))),
            startButton());
    }

    function pick(i, a, at) {
        const d = ui.draft;
        ui.pickMove = null; ui.pickSearch = null;
        if (a === 'move') { ui.pickMove = i; render(); return; }
        d.slots[i] = { act: a };
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
        d.slots[i] = { act: 'move', to };
        // a mountain takes two moves in a row: fill the next phase with the same move
        // (only if the next phase can really be a Move: an extra phase that is for Rest alone, or a day with no phase left, is not filled)
        if (isMountain(st, data, to) && i + 1 < planInfo().total && !d.slots[i + 1]) {
            const trial = d.slots.map((x, j) => (j === i + 1 ? { act: 'move', to } : x));
            const k = planKinds(st, data, trial);
            if (k.kinds[i + 1] === 'basic' || k.kinds[i + 1] === 'sunlight' || k.kinds[i + 1] === 'extra') d.slots[i + 1] = { act: 'move', to };
        }
        ui.pickMove = null;
        advance(i + 1);
        render();
    }

    // ---- boot ----
    (async () => {
        try {
            data = await loadData('data/');
            ctx.data = data;
            let fresh = null;
            if (ctx.params?.fresh || !loadSaved()) {
                fresh = { seed: ctx.params?.seed ?? (Math.floor(Math.random() * 90000) + 1), character: ctx.params?.character ?? 'white-knight', vp: ctx.params?.vp, mode: ctx.params?.mode, lastDay: ctx.params?.lastDay,
                    startDwelling: ctx.params?.startDwelling, startGear: ctx.params?.startGear, options: ctx.params?.options, startSpells: ctx.params?.startSpells };
                st = newGame(data, fresh);
                st.session = { id: String(Date.now()), started: new Date().toISOString(), version: VERSION, params: JSON.parse(JSON.stringify(fresh)) };
                saveGame(st);
            } else st = loadSaved();
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
            requestAnimationFrame(() => { map.fit(); map.focus(st.ch.at, 1.5); lastHero = st.ch.at; });
            window.addEventListener('resize', () => map?.fit());
        } catch (e) {
            console.error(e);
            root.append(h('div', { class: 'note' }, 'Could not start the game: ' + e.message));
        }
    })();
    return root;
}
