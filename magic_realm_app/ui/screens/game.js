import { h } from '../dom.js';
import { mountMap } from '../mapview.js';
import { loadData } from '../../engine/data.js';
import { newGame } from '../../engine/setup.js';
import { apply, phasesFor, validatePlan, restOptions, chitLabel, LAST_DAY } from '../../engine/day.js';
import { roadsFrom, isMountain, isCave, nameOfClearing, tileOf, numOf, tileName } from '../../engine/world.js';
import { nameOf, defOf, priceOf, weightOf, summaryOf } from '../../engine/items.js';
import { WEIGHT_WORDS, lvl } from '../../engine/core.js';
import { REL_NAMES } from '../../engine/tables.js';
import { stockOf, sellable } from '../../engine/trade.js';
import { combatSheet } from './combatui.js';
import { HELP } from './info.js';

// The game screen: status strip, map, a dock that follows the day, and sheets for the plan, the character and the log.
const SAVE_KEY = 'mr-save-v1';
const ACT_LABEL = { move: 'Move', hide: 'Hide', search: 'Search', trade: 'Trade', hire: 'Hire', rest: 'Rest', alert: 'Alert' };
const TABLE_LABEL = { peer: 'Peer', locate: 'Locate', loot: 'Loot', ground: 'Ground', sitecard: 'Site card' };

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
    const layer = h('div', { class: 'layer' });
    const mapTools = h('div', { class: 'maptools' },
        h('button', { 'aria-label': 'Centre on me', onclick: () => map?.focus(st.ch.onRoad ? st.ch.onRoad.from : st.ch.at) }, '\u25CE'),
        h('button', { 'aria-label': 'Show the whole realm', onclick: () => map?.fit() }, '\u2922'));
    mapBox.append(mapTools);
    root.append(strip, mapBox, dock, layer);
    let lastHero = null, st = null, data = null, map = null, ui = { sheet: null, sel: null, draft: null, toast: null };

    function commit(next) { st = next; ctx.state = st; saveGame(st); render(); }
    function act(action) {
        try { commit(apply(st, data, action)); }
        catch (e) { ui.toast = e.message; render(); setTimeout(() => { ui.toast = null; render(); }, 2600); }
    }

    // ---- model for the map ----
    function mapModel() {
        const tokens = {}, chitsByTile = {};
        const add = (id, t) => (tokens[id] ??= []).push(t);
        const KINDNAME = { 'lost-city': 'Lost City', 'lost-castle': 'Lost Castle' };
        for (const c of st.chits) {
            if (c.pile || !c.tile) continue;
            if (c.kind === 'warning' && c.letter === 'V') continue;
            const known = c.up || st.ch.seen.includes(c.id);
            const name = KINDNAME[c.kind] ?? c.name;
            if (c.up && c.clearing && (c.kind === 'sound' || c.kind === 'site')) { add(c.tile + c.clearing, { k: c.kind, label: c.kind === 'sound' ? `${name} (sound)` : `${name} (site)` }); continue; }
            if (!c.up && c.kind === 'site' && st.ch.discovered.sites.includes(c.id)) { add(c.tile + c.num, { k: 'site', label: `${name} (site)` }); continue; }
            (chitsByTile[c.tile] ??= []).push({ up: known, name: known ? (c.kind === 'sound' ? `${name} ${c.num}` : name) : '?', id: c.id });
        }
        for (const d of st.dwellings) {
            const here = d.at === st.ch.at;
            add(d.at, { k: 'dwelling', label: d.kind });
        }
        // creatures by name: "Wolf x2", natives by group
        const group = (list, key) => { const m = {}; for (const x of list) { const k = x.loc.c + '|' + key(x); (m[k] ??= { at: x.loc.c, name: key(x), n: 0 }).n++; } return Object.values(m); };
        const mons = group(st.mons.filter(m => !m.dead && m.loc?.c), m => data.monsters[m.id].name);
        const nats = group(st.nats.filter(n => !n.dead && !n.hired && n.loc?.c), n => data.natives[n.id].group);
        for (const m of mons) add(m.at, { k: 'mon', label: m.n > 1 ? `${m.name} x${m.n}` : m.name });
        for (const n of nats) add(n.at, { k: 'nat', label: n.n > 1 ? `${n.name} x${n.n}` : n.name });
        const hires = st.nats.filter(n => n.hired && !n.dead);
        if (hires.length && st.ch.at) add(st.ch.at, { k: 'ally', label: `Your hirelings x${hires.length}` });
        const planPath = ui.draft ? plannedClearings() : [];
        return {
            tiles: data.tiles, placements: st.placements, side: 'normal', showHidden: false, discovered: new Set(st.ch.discovered.paths),
            chitsByTile, tokens, hero: st.ch.onRoad ? null : st.ch.at, heroHidden: st.ch.hidden, selected: ui.sel, plan: planPath,
            onTap: id => { ui.sel = id; if (ui.sheet !== 'plan') ui.sheet = 'clearing'; render(); },
            onBackground: () => { if (ui.sheet === 'clearing') ui.sheet = null; ui.sel = null; render(); },
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
            h('div', { class: 'daybox' }, h('b', {}, `Day ${st.day}`, h('small', {}, st.mode === 'endless' ? '' : ` of ${st.lastDay ?? 28}`)), h('span', {}, `${st.period === 'over' ? 'finished' : st.period}`)),
            h('button', { class: 'stats', onclick: () => { ui.sheet = ui.sheet === 'char' ? null : 'char'; render(); } },
                h('span', { class: 'stat gold' }, `${st.ch.gold}g`),
                h('span', { class: 'stat' }, `Fame ${st.ch.fame}`),
                h('span', { class: 'stat' }, `Notor ${st.ch.notoriety}`)));
        map.set(mapModel());
        const hero = st.ch.onRoad ? st.ch.onRoad.from : st.ch.at;
        if (hero !== lastHero) { lastHero = hero; map.focus(hero); }
        renderDock();
        layer.replaceChildren(...sheets());
        if (ui.toast) layer.append(h('div', { class: 'toast' }, ui.toast));
    }

    function renderDock() {
        const p = st.pending;
        const where = nameOfClearing(st.ch.at);
        const info = h('div', { class: 'where2' }, h('span', { class: 'you' }, 'You are at'), h('b', {}, st.ch.onRoad ? 'on the road' : where), st.ch.hidden ? h('em', {}, 'hidden') : h('em', { class: 'seen' }, 'visible'));
        const recent = [...st.log].reverse().filter(l => l.k !== 'day').slice(0, 3).reverse();
        let main;
        if (!p) main = h('div', { class: 'note' }, 'Working...');
        else if (p.type === 'plan') main = h('button', { class: 'btn primary big', 'data-act': 'plan', onclick: () => { ui.draft ??= { slots: Array(9).fill(null) }; ui.sheet = 'plan'; render(); } }, 'Plan your day');
        else if (p.type === 'phase') {
            const slot = st.plan[p.i];
            main = h('div', { class: 'phase' },
                h('div', { class: 'phase-info' }, h('b', {}, `Phase ${p.i + 1} of ${st.plan.length}`), h('span', {}, describeSlot(slot))),
                h('div', { class: 'row2' },
                    h('button', { class: 'btn primary', 'data-act': 'next', onclick: () => act({ type: 'next' }) }, 'Do it'),
                    h('button', { class: 'btn', 'data-act': 'all', onclick: () => act({ type: 'next', all: true }) }, 'Play the day')));
        } else if (p.type === 'over') main = h('button', { class: 'btn primary big', onclick: () => { ui.sheet = 'over'; render(); } }, 'See your result');
        else main = h('div', { class: 'note' }, 'Decision needed...');
        dock.replaceChildren(...[info, recent.length ? h('div', { class: 'lastlog' }, ...recent.map((l, i) => h('p', { class: i === recent.length - 1 ? 'new' : '' }, l.t))) : null, main].filter(Boolean));
    }

    function describeSlot(s) {
        if (!s) return 'Do nothing';
        if (s.act === 'move') return `Move to ${nameOfClearing(s.to)}`;
        if (s.act === 'search') return `Search: ${TABLE_LABEL[s.table ?? 'peer']}`;
        return ACT_LABEL[s.act] ?? s.act;
    }

    // ---- sheets ----
    function sheets() {
        const out = [];
        const p = st.pending;
        if (p?.type?.startsWith('combat')) { out.push(combatSheet({ st, data, act, ui, render })); return out; }
        if (p?.type === 'turn-end') out.push(turnEndSheet());
        else if (p?.type === 'turn-end') out.push(turnEndSheet());
        else if (p?.type === 'rest') out.push(modal('Rest', h('div', {}, h('p', { class: 'hint' }, 'You may regain one asterisk of effort. Choose a chit:'), ...p.options.map(o =>
            h('button', { class: 'btn', onclick: () => act({ type: 'rest', chit: o.chit }) }, o.text)))));
        else if (p?.type === 'search-choice') out.push(modal(`${TABLE_LABEL[p.table]}: your choice`, h('div', {}, h('p', { class: 'hint' }, `You rolled ${p.roll.join('+')}: take any result of the table.`),
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
        else if (ui.sheet === 'plan' && p?.type === 'plan') out.push(planSheet());
        else if (ui.sheet === 'char') out.push(charSheet());
        else if (ui.sheet === 'clearing' && ui.sel) out.push(clearingSheet());
        else if (ui.sheet === 'menu') out.push(menuSheet());
        else if (ui.sheet === 'over' || ui.restartVp) out.push(overSheet());
        else if (ui.sheet === 'log') out.push(logSheet());
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

    function tradeSheet(p) {
        if (p.type === 'trade-offer') {
            if (p.insult) {
                return modal(`${p.group}: ${p.insult}!`, h('div', {},
                    h('p', {}, `The ${p.group} are offended. You may pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'} to calm things, or they will block you.`),
                    h('button', { class: 'btn', onclick: () => act({ type: 'trade', act: 'pay' }) }, `Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'}`),
                    h('button', { class: 'btn', onclick: () => act({ type: 'trade', act: 'fight' }) }, 'Refuse')));
            }
            // Rule 7.6.5c: belongings may make up part or all of the price at their basic Gold price; no change is given.
            const mine = sellable(st, data), chosen = new Set((ui.payWith ?? []).filter(u => mine.some(m => m.uid === u)));
            const worth = mine.filter(m => chosen.has(m.uid)).reduce((n, m) => n + m.price, 0);
            const goldDue = Math.max(0, p.price - worth), ok = st.ch.gold >= goldDue;
            const short = goldDue - st.ch.gold;
            return modal(`Buy ${p.name}`, h('div', { class: 'trade' },
                h('p', {}, p.rollNote),
                h('p', { class: 'bigline' }, `${p.price} gold`, h('small', {}, ` (${p.base} x ${p.mult})`)),
                mine.length ? h('div', {},
                    h('h3', {}, 'Pay with your things?'),
                    h('p', { class: 'hint' }, `You have ${st.ch.gold} gold. Anything you hand over counts at its basic price, and they give no change.`),
                    ...mine.map(m => h('button', { class: `btn row${chosen.has(m.uid) ? ' on' : ''}`, 'data-pay': m.uid, onclick: () => {
                        const set = new Set(ui.payWith ?? []); set.has(m.uid) ? set.delete(m.uid) : set.add(m.uid); ui.payWith = [...set]; render();
                    } }, h('span', { class: 'rl' }, h('b', {}, `${chosen.has(m.uid) ? '\u2713 ' : ''}${m.name}`), h('small', {}, m.sub)), h('em', {}, `${m.price}g`)))) : null,
                h('p', { class: 'bigline' }, chosen.size ? `You pay ${goldDue} gold plus ${chosen.size} thing${chosen.size === 1 ? '' : 's'}` : `You pay ${p.price} gold`,
                    worth > p.price ? h('small', {}, ` (${worth - p.price} gold over: no change)`) : null),
                !ok ? h('p', { class: 'hint' }, `You are ${short} gold short: hand over more.`) : null,
                h('div', { class: 'row2' },
                    h('button', { class: 'btn primary', 'data-act': 'buy-ok', disabled: !ok, onclick: () => { const items = [...chosen]; ui.payWith = null; act({ type: 'trade', act: 'accept', items }); } }, 'Buy'),
                    h('button', { class: 'btn', onclick: () => { ui.payWith = null; act({ type: 'trade', act: 'decline' }); } }, 'No thanks'))));
        }
        const goods = stockOf(st, data, p.group), mine = sellable(st, data);
        return modal(`Trade with the ${p.group}`, h('div', { class: 'trade' },
            h('p', { class: 'hint' }, `Relationship: ${REL_NAMES[String(st.ch.rel?.[p.group] ?? 0)]}. You have ${st.ch.gold} gold. In one Trade phase you may sell any number of things, or buy one.${(st.ch.rel?.[p.group] ?? 0) <= -2 ? ' They are your enemies: expect an insult or a fight, not a price.' : ''}`),
            h('h3', {}, 'For sale'),
            ...(goods.length ? goods.map(g => h('button', { class: 'btn row', disabled: p.mode === 'sell', onclick: () => act({ type: 'trade', act: 'buy', idx: g.idx }) },
                h('span', { class: 'rl' }, h('b', {}, g.name), h('small', {}, g.sub)), h('em', {}, `${g.base}g`))) : [h('p', { class: 'hint' }, 'Nothing for sale.')]),
            h('h3', {}, 'Sell yours'),
            ...(mine.length ? mine.map(m => h('button', { class: 'btn row', disabled: p.mode === 'buy', onclick: () => act({ type: 'trade', act: 'sell', item: m.uid }) },
                h('span', { class: 'rl' }, h('b', {}, m.name), h('small', {}, m.sub)), h('em', {}, `${m.price}g`))) : [h('p', { class: 'hint' }, 'You have nothing to sell.')]),
            h('button', { class: 'btn primary', onclick: () => act({ type: 'trade', act: 'done' }) }, 'Done')));
    }

    function hireSheet(p) {
        if (p.type === 'hire-offer') {
            if (p.insult) return modal(`${p.group}: ${p.insult}!`, h('div', {},
                h('p', {}, `The ${p.group} are offended. Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'} to calm things, or they block you.`),
                h('button', { class: 'btn', onclick: () => act({ type: 'hire', act: 'pay' }) }, `Pay 5 ${p.insult === 'Insult' ? 'Notoriety' : 'Fame'}`),
                h('button', { class: 'btn', onclick: () => act({ type: 'hire', act: 'fight' }) }, 'Refuse')));
            return modal(`Hire ${p.names.length === 1 ? p.names[0] : 'the ' + p.group}`, h('div', {},
                h('p', {}, p.why),
                h('p', { class: 'bigline' }, `${p.price} gold`, h('small', {}, ` (wages ${p.wage} x ${p.mult})`)),
                h('p', { class: 'hint' }, 'Hired for 14 days. They follow you and fight beside you.'),
                h('div', { class: 'row2' },
                    h('button', { class: 'btn primary', disabled: !p.affordable, onclick: () => act({ type: 'hire', act: 'accept' }) }, 'Hire'),
                    h('button', { class: 'btn', onclick: () => act({ type: 'hire', act: 'decline' }) }, 'No thanks'))));
        }
        return modal('Hire', h('div', {},
            h('p', { class: 'hint' }, `You have ${st.ch.gold} gold. The price is the wages times a roll on the Meeting Table. Relationships: ${p.options.map(o => `${o.group} ${REL_NAMES[String(st.ch.rel?.[o.group] ?? 0)]}`).join(', ')}.`),
            ...p.options.map(o => h('button', { class: 'btn row', onclick: () => act({ type: 'hire', act: 'pick', group: o.group, rehire: !!o.rehire }) },
                h('span', { class: 'rl' }, h('b', {}, `${o.group}${o.rehire ? ' (extend hire)' : ''}`), h('small', {}, o.names.join(', '))), h('em', {}, `wages ${o.wage}g`))),
            h('button', { class: 'btn', onclick: () => act({ type: 'hire', act: 'cancel' }) }, 'Never mind')));
    }

    function clearingSheet() {
        const id = ui.sel, tile = tileOf(id), n = numOf(id);
        const cdef = data.tile(tile).sides.normal.clearings.find(c => c.n === n);
        const here = st.ch.at === id && !st.ch.onRoad;
        const sections = [];
        const row = (k, text, sub) => h('div', { class: `crow ${k}` }, h('b', {}, text), sub ? h('small', {}, sub) : null);
        // you
        if (here) sections.push(['You', [row('me', st.ch.name, st.ch.hidden ? 'hidden: monsters cannot block you' : 'in plain sight')]]);
        // dwelling and the people who live there
        const dw = st.dwellings.filter(d => d.at === id);
        const natHere = st.nats.filter(x => !x.dead && !x.hired && x.loc?.c === id);
        const byGroup = {};
        for (const x of natHere) (byGroup[data.natives[x.id].group] ??= []).push(data.natives[x.id]);
        const REL = { '-2': 'enemy', '-1': 'unfriendly', '0': 'neutral', '1': 'friendly', '2': 'ally' };
        const people = Object.entries(byGroup).map(([g, list]) => row('nat', `${g}: ${list.length} native${list.length === 1 ? '' : 's'}`,
            `${REL[String(st.ch.rel?.[g] ?? 0)]} to you; ${list.map(x => x.name.replace(/^\w+ /, '')).join(', ')}`));
        if (dw.length || people.length) sections.push(['Dwellings and natives', [...dw.map(d => row('dwelling', d.kind, 'a dwelling: natives live and trade here')), ...people]]);
        // monsters
        const mons = {};
        for (const m of st.mons.filter(m => !m.dead && m.loc?.c === id)) (mons[data.monsters[m.id].name] ??= []).push(m);
        const monRows = Object.entries(mons).map(([name, l]) => row('mon', `${name}${l.length > 1 ? ` x${l.length}` : ''}`, 'a monster: it will block you if you are seen'));
        if (monRows.length) sections.push(['Monsters', monRows]);
        // chits
        const chitRows = [];
        for (const c of st.chits) {
            if (c.pile || c.tile !== tile) continue;
            if (c.clearing === n && c.up) chitRows.push(row(c.kind, c.kind === 'sound' ? `${c.name} (sound ${c.num})` : `${c.name} (site ${c.num})`, c.kind === 'site' ? (st.ch.discovered.sites.includes(c.id) ? 'discovered: you may loot it' : 'seen but not discovered: search with Locate to discover it') : 'monsters stir here'));
            else if (!c.up && c.kind === 'site' && c.num === n && st.ch.discovered.sites.includes(c.id)) chitRows.push(row('site', `${c.name} (site)`, 'you found it: you may loot it'));
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
            { close: () => { ui.sheet = null; ui.sel = null; render(); } });
    }

    // What happened when his turn ended: chits turned up, creatures that came, natives that appeared, being blocked.
    function turnEndSheet() {
        const t = st.turnEnd;
        const lines = [];
        const KIND = { warning: 'warning chit', sound: 'sound chit', site: 'site chit', 'lost-city': 'the Lost City', 'lost-castle': 'the Lost Castle' };
        for (const c of t.chits) {
            const what = c.kind === 'sound' ? `${c.name} (sound, clearing ${c.num})` : c.kind === 'site' ? `${c.name} (site, clearing ${c.num})` : c.kind === 'warning' ? `${c.name} warning` : (KIND[c.kind] ?? c.name);
            lines.push(h('div', { class: 'crow chit' }, h('b', {}, `Turned up: ${what}`),
                h('small', {}, c.summons.length ? `It calls out: ${[...new Set(c.summons)].map(n => `${c.summons.filter(x => x === n).length > 1 ? c.summons.filter(x => x === n).length + ' ' : ''}${n}`).join(', ')}${c.dest === t.at ? ' to your clearing' : c.dest ? ` to clearing ${numOf(c.dest)}` : ''}` : 'It calls nothing out today.')));
        }
        for (const a of t.arrivals.filter(a => a.why === 'prowls in your tile')) lines.push(h('div', { class: 'crow mon' }, h('b', {}, `${a.name} arrives`), h('small', {}, `it was prowling in this tile and comes to your clearing`)));
        for (const nn of t.natives) lines.push(h('div', { class: 'crow nat' }, h('b', {}, `The ${nn.group} appear`), h('small', {}, `${nn.count} of them, at the ${nn.at}`)));
        if (t.blocked) lines.push(h('div', { class: 'crow mon' }, h('b', {}, t.blockers.length ? `Blocked by ${[...new Set(t.blockers)].join(', ')}` : 'Your turn was cut short'), h('small', {}, 'the rest of your turn was lost and you are seen')));
        const summary = t.plan?.length ? h('details', {}, h('summary', {}, 'What you did today'), ...t.plan.map((r, i) => h('p', { class: 'hint' }, `Phase ${i + 1}: ${r ?? '-'}`))) : null;
        return modal(`End of your turn at ${nameOfClearing(t.at)}`, h('div', { class: 'clearing' },
            ...(lines.length ? lines : [h('p', { class: 'hint' }, 'Nothing stirred.')]),
            summary,
            h('button', { class: 'btn primary', 'data-act': 'turn-ok', onclick: () => act({ type: 'continue' }) }, 'Continue to the evening')));
    }

    function charSheet() {
        const ch = st.ch;
        const chitEl = c => h('div', { class: `chit2 ${c.type} ${c.state}` }, h('b', {}, c.type === 'magic' ? `${c.numeral ?? ''}${c.time}` : `${c.strength}${c.time}`), h('span', {}, '*'.repeat(c.effort) || ' '), h('small', {}, c.type === 'move' ? 'Move' : c.type === 'fight' ? 'Fight' : 'Magic'));
        return modal(ch.name, h('div', {},
            h('div', { class: 'chits' }, ch.chits.map(chitEl)),
            h('p', { class: 'hint' }, 'Gold, Fame and Notoriety are shown on the top bar. Fatigued chits are dim; wounded chits are crossed out.'),
            ch.spells?.length || (data.characters[ch.id].stage4.spellsKnown ?? 0) ? h('p', { class: 'hint' }, `Spell: one of type ${(data.characters[ch.id].stage4.spellTypes ?? []).join('/')} (spells cannot be cast in this build yet).`) : null,
            h('h3', {}, 'Carrying'),
            ...ch.items.map(it => h('button', { class: `btn row${it.active ? ' on' : ''}`, onclick: () => { ui.keep = true; act({ type: 'tidy', item: it.uid }); } },
                h('span', {}, nameOf(data, it) + (it.damaged ? ' (damaged)' : '') + (it.destroyed ? ' (destroyed)' : '')), h('em', {}, `${WEIGHT_WORDS[weightOf(data, it)] ?? ''}${it.active ? ' · in use' : ''}`))),
            ch.items.length ? null : h('p', { class: 'hint' }, 'Nothing.'),
            ...(() => { const hs = st.nats.filter(n => n.hired && !n.dead); return hs.length ? [h('h3', {}, 'Hirelings'),
                ...hs.map(n => h('p', {}, `${data.natives[n.id].name} \u2014 term ends at midnight of day ${n.hiredUntil}`))] : []; })(),
            h('h3', {}, 'Standing'),
            h('p', {}, Object.entries(ch.rel).map(([g, r]) => `${g}: ${REL_NAMES[String(r)]}`).join(' · '))),
            { close: () => { ui.sheet = null; render(); } });
    }

    function menuSheet() {
        return modal('Menu', h('div', {},
            h('button', { class: 'btn', onclick: () => { ui.sheet = 'log'; render(); } }, 'Journal'),
            h('button', { class: 'btn', onclick: () => { ui.sheet = 'help'; render(); } }, 'How to play'),
            h('button', { class: 'btn', onclick: () => { ui.sheet = 'key'; render(); } }, 'Map key'),
            h('button', { class: 'btn', onclick: () => { ui.sheet = null; map.fit(); render(); } }, 'Show the whole realm'),
            h('button', { class: 'btn', onclick: () => ctx.go('title') }, 'Back to the title screen'),
            h('button', { class: 'btn', onclick: () => { clearSaved(); ctx.go('title'); } }, 'Abandon this game')),
            { close: () => { ui.sheet = null; render(); } });
    }

    function reportSheet() {
        const prev = st.log.filter(l => l.day === st.day - 1 && l.k !== 'day');
        const key = prev.filter(l => ['combat', 'monster', 'loot', 'trade', 'curse', 'block', 'discover', 'native', 'phase'].includes(l.k));
        return modal(`Day ${st.day - 1} in review`, h('div', {},
            ...(key.length ? key.map(l => h('p', { class: `j-${l.k}` }, l.t)) : [h('p', { class: 'hint' }, 'A quiet day.')]),
            h('div', { class: 'row2' }, h('button', { class: 'btn primary', 'data-act': 'report-ok', onclick: () => { ui.reportedDay = st.day; render(); } }, 'On to the next day'))));
    }

    function logSheet() {
        return modal('Journal', h('div', { class: 'journal' }, [...st.log].reverse().slice(0, 80).map(l => h('p', { class: `j-${l.k}` }, h('small', {}, `Day ${l.day}`), ' ', l.t))),
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
    function planSheet() {
        const d = ui.draft;
        const { total, base, extras } = phasesFor(st, data, d.slots.filter(Boolean));
        // where he will be at the start of each phase, as planned
        const at = [];
        let loc = st.ch.onRoad ? null : st.ch.at;
        for (let i = 0; i < 9; i++) { at.push(loc); const s = d.slots[i]; if (s?.act === 'move' && s.to) loc = s.to; }
        const rows = d.slots.slice(0, Math.max(4, total)).map((s, i) => {
            const off = i >= total;
            const only = i >= base && !off ? extras[i - base] : null;
            return h('div', { class: `slot${off ? ' off' : ''}` },
                h('div', { class: 'slot-head' }, h('b', {}, `Phase ${i + 1}`), h('span', {}, i < 2 ? 'basic' : i < base ? 'sunlight' : `extra (${only ?? ''} only)`), h('em', {}, s ? describeSlot(s) : (off ? 'unavailable on a cave day' : 'not set')),
                    s && !off ? h('button', { class: 'clearbtn', onclick: () => { d.slots[i] = null; render(); } }, 'Clear') : null),
                off ? null : h('div', { class: 'chips2 six' },
                    ...(only ? [only] : ['move', 'hide', 'search', 'trade', 'hire', 'rest', 'alert']).map(a => h('button', { class: `chip${s?.act === a ? ' on' : ''}`, 'data-slot': i, 'data-pick': a,
                        onclick: () => pick(i, a, at[i]) }, ACT_LABEL[a]))),
                !off && ui.pickMove === i ? movePicker(i, at[i]) : null,
                !off && ui.pickSearch === i ? h('div', { class: 'chips2' }, ...['peer', 'locate', 'loot', ...((st.abandoned[at[i]] ?? []).length ? ['ground'] : []), ...(st.ch.siteCards?.[at[i]]?.length ? ['sitecard'] : [])].map(t => h('button', { class: 'chip', onclick: () => { d.slots[i] = { act: 'search', table: t }; ui.pickSearch = null; render(); } }, TABLE_LABEL[t]))) : null);
        });
        const filled = d.slots.slice(0, total).some(Boolean);
        return modal('Plan your day', h('div', { class: 'plan' },
            h('p', { class: 'hint' }, st.day === 1 ? `You start at the ${st.ch.startDwelling}${st.ch.items.length ? ` with ${st.ch.items.map(i => nameOf(data, i)).join(', ')}` : ' with no weapon or armor of your own'}. Plan a Trade phase to see what the natives here sell. Plans are fixed once the day starts; an impossible move is simply lost.` : 'Plans are fixed once the day starts. An impossible move is simply lost. Mountains take two Move phases.'),
            ...rows.filter(Boolean),
            h('button', { class: 'btn primary big', 'data-act': 'start-day', onclick: () => { const slots = d.slots.map(s => s); ui.draft = null; ui.sheet = null; act({ type: 'plan', slots }); } }, filled ? 'Start the day' : 'Start the day (do nothing)')),
            { close: () => { ui.sheet = null; render(); } });
    }

    function pick(i, a, at) {
        const d = ui.draft;
        ui.pickMove = null; ui.pickSearch = null;
        if (a === 'move') { ui.pickMove = i; render(); return; }
        if (a === 'search') { ui.pickSearch = i; render(); return; }
        d.slots[i] = { act: a };
        render();
    }

    function movePicker(i, at) {
        if (st.ch.onRoad && i === 0) {
            const r = st.ch.onRoad;
            return h('div', { class: 'chips2' }, ...[r.from, r.to].map(c => h('button', { class: 'chip', onclick: () => setMove(i, c) }, nameOfClearing(c))));
        }
        if (!at) return h('p', { class: 'hint' }, 'You are on a road; move to one of its ends first.');
        const roads = roadsFrom(st, data, at).filter(r => r.usable);
        return h('div', { class: 'chips2' }, ...roads.map(r => h('button', { class: 'chip', 'data-to': r.to, onclick: () => setMove(i, r.to) },
            `${nameOfClearing(r.to)}${isMountain(st, data, r.to) ? ' ▲' : ''}${isCave(st, data, r.to) ? ' ●' : ''}`)));
    }

    function setMove(i, to) {
        const d = ui.draft;
        d.slots[i] = { act: 'move', to };
        // a mountain takes two moves in a row: fill the next phase with the same move
        if (isMountain(st, data, to) && i + 1 < 4) d.slots[i + 1] = { act: 'move', to };
        ui.pickMove = null;
        render();
    }

    // ---- boot ----
    (async () => {
        try {
            data = await loadData('data/');
            ctx.data = data;
            if (ctx.params?.fresh || !loadSaved()) {
                st = newGame(data, { seed: ctx.params?.seed ?? (Math.floor(Math.random() * 90000) + 1), character: ctx.params?.character ?? 'white-knight', vp: ctx.params?.vp, mode: ctx.params?.mode, lastDay: ctx.params?.lastDay,
                    startDwelling: ctx.params?.startDwelling, startGear: ctx.params?.startGear });
                saveGame(st);
            } else st = loadSaved();
            ctx.state = st;
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
