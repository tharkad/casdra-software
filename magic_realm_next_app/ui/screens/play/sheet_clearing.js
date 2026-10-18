// play/sheet_clearing.js: the clearing sheet and everything it says about a place: sites and their loot stacks, the Setup Card lines, search cards, who is here (shared), hired companions.
import { lvl } from '../../../engine/core.js';
import { nameOf } from '../../../engine/items.js';
import { colorSources } from '../../../engine/spells.js';
import { nameOfClearing, numOf, roadsFrom, tileOf } from '../../../engine/world.js';
import { h } from '../../dom.js';
import { playerOf as playerNameOf } from '../../meet.js';
import { rosterRows } from '../../shared_ui.js';
import { newDraft as newMeetDraft } from '../meetui.js';
import { act } from './actions.js';
import { colorChip, modal, mrChit } from './kit.js';
import { tableName } from './phases.js';
import { render } from './shell.js';

// One treasure site the way the printed Setup Card words it; the same sentence heads the site in the clearing sheet.
// A site card he found by looting: what each Loot roll on it gives (the card's own table), and what it demands.
function siteCardRow(G, cid, bare = false) {
    const box = G.st.twt?.[cid], name = G.data.treasures?.[cid]?.name ?? box?.name ?? cid;
    const T = G.data.tables?.twtSiteTables?.[box?.box ?? name] ?? {};
    const gave = n => (G.st.gone ?? {})[n] ? ' (already taken)' : '';
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

function siteCardText(G, e) {
    const g = G.data.monsters[e.guardian]?.name ?? e.guardian;
    const special = e.special ? ` Needs: ${e.special.replace('fatigue_asterisk', 'an asterisk of effort').replace('fatigue_t,key', 'a Tremendous-strength chit or the Lost Keys')}.` : '';
    return `${e.name}: ${e.small} Small, ${e.large} Large${e.spells?.length ? `, spells ${e.spells.join(', ')}` : ''}. Guardian: ${g} (Monster Roll ${e.row}). Chit printed with clearing ${e.chitNumber}.${special}`;
}

// A site: whether you have discovered it and, once you have, what is left in it (how many things, and how many of those are Great Treasures),
// what looting it demands, and what guards it.
function siteNeeds(G, name) {
    const asterisk = G.st.ch.chits.some(x => x.state === 'active' && x.effort > 0);
    const tChit = G.st.ch.chits.some(x => x.state === 'active' && lvl(x.strength) >= 4) || G.st.ch.items.some(i => i.id === 'lost-keys' && i.active);
    if (name === 'Cairns') return `Needs: one asterisk of effort for every Loot roll, found or not (a chit with an asterisk is tired). ${asterisk ? 'You have one ready.' : 'You have none ready now, so you could not loot it.'}`;
    if (name === 'Pool') return `Needs: one asterisk of effort each time something is actually taken. ${asterisk ? 'You have one ready.' : 'You have none ready now.'}`;
    if (name === 'Vault') return G.st.sitesOpen?.Vault ? 'The Vault is open: it stays open for everyone.' : `Needs: the Vault is sealed until it is opened with a Tremendous-strength chit, or the Lost Keys. ${tChit ? 'You can open it.' : 'You cannot open it now.'}`;
    return 'Needs: nothing to loot it.';
}

// What the printed Treasure Set Up Card tells every player, before anything is discovered.
const SPELL_WORD = t => `Type ${t}`;

function setupDwelling(G, kind) {
    const e = G.data.setupcard?.dwellings?.find(x => x.name === kind || x.rsName === kind);
    if (!e) return '';
    const goods = Object.entries(e.treasures?.counters ?? {}).map(([n, k]) => `${n}${k > 1 ? ` \u00D7${k}` : ''}`).join(', ');
    return `Setup card: the ${e.group} live here (${e.nativeCounters} native counters). They keep ${e.treasures?.small ?? 0} Small treasures${goods ? ` and: ${goods}` : ''}.`;
}

// The pile at a site drawn top to bottom, the way a Loot roll counts it: a roll of 1 takes the top card, 2 the second, and so on to 6.
// Only what the Setup Card tells everyone is drawn: Large above Small, never which card is Great. Spell cards lie apart, by type.
const REACH = 6;

function lootStack(G, name, pile) {
    const sizes = pile.filter(it => it.kind !== 'spell').map(it => ((G.data.treasures[it.id]?.kind ?? 'small') === 'small' ? 'small' : 'large'));
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
    const spells = (G.st.spellBox?.sites?.[name] ?? []).map(sp => G.data.spells?.[sp.id]?.type).filter(Boolean);
    return h('div', { class: 'lootstack', 'data-site': name },
        h('div', { class: 'ls-head' }, 'THE PILE, TOP FIRST', h('small', {}, `a Loot roll of 1\u2013${REACH} takes that card`)),
        ...rows,
        sizes.length > REACH ? h('p', { class: 'ls-note' }, `Cards below the ${REACH}th cannot be reached until those above are taken.`) : null,
        spells.length ? h('div', { class: 'ls-spells' }, h('b', {}, 'Spell cards kept apart'), h('small', {}, `${spells.map(t => `Type ${t}`).join(', ')}: read them with Reading Runes, they are not in the pile.`)) : null);
}

function siteLine(G, c) {
    const found = G.st.ch.discovered.sites.includes(c.id);
    const e = G.data.setupcard?.sites?.find(x => x.name === c.name);
    const needs = siteNeeds(G, c.name);
    const status = [];
    if (!found) status.push(h('p', { class: 'setupline' }, h('b', {}, 'Not discovered yet. '), 'Search with Locate to discover it. What it holds is unknown until you do.'));
    else {
        const pile = G.st.sites?.[c.name] ?? [];
        const spells = G.st.spellBox?.sites?.[c.name]?.length ?? 0;                  // spell cards stay in their box: only readable with runes
        const treasures = pile.filter(it => it.kind !== 'spell');
        const small = treasures.filter(it => (G.data.treasures[it.id]?.kind ?? 'small') === 'small').length, large = treasures.length - small;
        const left = pile.length ? [`${small} Small`, `${large} Large`, ...(spells ? [`${spells} spell${spells === 1 ? '' : 's'}`] : [])].join(', ') : 'nothing';
        status.push(h('p', { class: 'setupline' }, h('b', {}, pile.length ? 'Discovered: you may loot it. ' : 'Discovered, and empty. '), pile.length ? `Left: ${left}.` : ''));
        if (pile.length) status.push(lootStack(G, c.name, pile), h('p', { class: 'setupline dim' }, 'Which are Great is not known until they are looted.'));
    }
    status.push(h('p', { class: 'setupline dim' }, needs));
    return h('div', { class: 'sitecard' }, e ? h('p', { class: 'setupline card' }, siteCardText(G, e)) : null, ...status);
}

// What a Search here could reach, for the choice sheets: each discovered site's loot stack, what lies on the ground, and any site card he holds.
// One card per thing that can be searched here: what it is, what could come of it, and the button that does it at the bottom of the card.
export function searchCards(G, p) {
    const at = G.st.ch.at, tile = tileOf(at), n = numOf(at), opts = p.options ?? [], cards = [];
    const go = t => act(G, { type: 'search-table', table: t });
    const card = (cls, title, body, table, label, { disabled = false, why = null } = {}) => h('section', { class: `searchcard ${cls}`, 'data-card': table },
        h('h3', {}, title), ...body, why ? h('p', { class: 'hint' }, why) : null,
        h('button', { class: 'btn primary', 'data-table': table, disabled, onclick: () => go(table) }, label));
    const sites = G.st.ch.onRoad ? [] : G.st.chits.filter(x => x.kind === 'site' && x.tile === tile && x.num === n && !x.pile && G.st.ch.discovered.sites.includes(x.id));
    if (opts.includes('peer')) cards.push(card('peer', 'Peer around the clearing', [h('p', {}, 'The Peer table turns up clues, hidden enemies and hidden paths.')], 'peer', 'Peer'));
    if (opts.includes('locate')) cards.push(card('locate', 'Locate what is hidden', [h('p', {}, 'Search the clearing for passages, clues and sites you have not discovered yet.')], 'locate', 'Locate'));
    if (opts.includes('loot')) {
        if (sites.length) for (const c of sites) cards.push(card('loot', `Loot the ${c.name}`, [siteLine(G, c)], 'loot', 'Loot'));
        else cards.push(card('loot', 'Loot a site', [h('p', {}, 'Take treasure from a site you have discovered in this clearing.')], 'loot', 'Loot', { disabled: true, why: 'No site here is discovered yet. Locate is how a site is found.' }));
    }
    if (opts.includes('ground')) { const g = G.st.abandoned?.[at] ?? []; cards.push(card('ground', 'Take what lies here', [h('p', {}, g.length ? `${g.map(i => nameOf(G.data, i)).join(', ')}.` : 'Nothing lies here.')], 'ground', 'Take it', { disabled: !g.length })); }
    if (opts.includes('sitecard')) for (const cid of G.st.ch.siteCards?.[at] ?? []) cards.push(card('sitecard', `Loot the ${G.data.treasures?.[cid]?.name ?? 'site card'}`, [siteCardRow(G, cid, true)], 'sitecard', 'Loot'));
    if (opts.includes('runes')) cards.push(card('runes', 'Read the runes', [h('p', {}, 'Learn a spell from a site here, or from an artifact or book you carry.')], 'runes', 'Read'));
    for (const t of opts.filter(x => !['peer', 'locate', 'loot', 'ground', 'sitecard', 'runes'].includes(x))) cards.push(card(t, tableName(G, t), [], t, tableName(G, t)));
    return cards;
}

export function hereBlocks(G) {
    const at = G.st.ch.at; if (!at || G.st.ch.onRoad) return [];
    const tile = tileOf(at), n = numOf(at), out = [];
    for (const c of G.st.chits.filter(x => x.kind === 'site' && x.tile === tile && x.num === n && !x.pile && G.st.ch.discovered.sites.includes(x.id)))
        out.push(h('details', { class: 'here-block', open: true }, h('summary', {}, `${c.name}: what Loot could reach`), siteLine(G, c)));
    const ground = G.st.abandoned?.[at] ?? [];
    if (ground.length) out.push(h('div', { class: 'here-block' }, h('h3', {}, 'On the ground'), h('p', { class: 'hint' }, ground.map(i => nameOf(G.data, i)).join(', ') + '.')));
    for (const cid of G.st.ch.siteCards?.[at] ?? []) out.push(h('div', { class: 'here-block' }, siteCardRow(G, cid)));
    return out.length ? [h('div', { class: 'here', 'data-here': 'search' }, ...out)] : [h('p', { class: 'hint' }, 'No site here is discovered yet, so Loot would find nothing: Locate is how a site is found.')];
}

// Meeting the others in the clearing I stand in: who I may give or trade with now, who I may not (and why), and who follows whom today.
function meetRowsFor(G, id, row) {
    if (!G.ms || G.st.ch.at !== id || G.st.ch.onRoad) return [];
    const out = [];
    for (const p of G.ms.partners) out.push(h('button', { class: 'btn row meetwith', 'data-act': 'meet-with', 'data-meet-with': p.id, onclick: () => { G.ui.meet = newMeetDraft(); G.ui.meet.to = p.id; G.ui.sheet = 'meet'; render(G); } },
        h('span', { class: 'rl' }, h('b', {}, `Meet ${p.player}`), h('small', {}, G.ms.window === 'dayend' ? 'Give or trade before Midnight' : 'Give or trade: nothing changes hands until they accept')), h('em', {}, '\u203A')));
    for (const o of G.ms.others) out.push(row('meet off', `${o.player}: not now`, o.why));
    for (const [f, g] of Object.entries(G.st.follows ?? {})) if (G.st.chars[f]?.at === id || G.st.chars[g]?.at === id) out.push(row('meet', `${playerNameOf(G.st, f)} follows ${playerNameOf(G.st, g)} today`, 'A follower goes wherever the guide goes and is called out with him.'));
    return out;
}

// Hired natives and creatures in a clearing belong to the character who hired them (7.7): they follow him and fight for him alone.
function companionRows(G, id, row) {
    const out = [], by = new Map();
    for (const o of [...G.st.nats, ...G.st.mons]) if (o.hired && !o.dead && o.hiredBy && o.loc?.c === id) (by.get(o.hiredBy) ?? by.set(o.hiredBy, []).get(o.hiredBy)).push(o);
    for (const [owner, list] of by) {
        const mine = owner === G.st.ch.id, nm = o => G.data.natives[o.id]?.name ?? G.data.monsters[o.id]?.name ?? o.id, until = Math.max(...list.map(o => o.hiredUntil ?? o.controlledUntil ?? 0));
        out.push(row('nat', `${list.map(nm).join(', ')}`, `${mine ? 'Hired by you' : `Hired by ${playerNameOf(G.st, owner)}`}: they follow ${mine ? 'you' : 'their employer'} and fight for no one else${until ? `, until the end of day ${until}` : ''}.`, G.data.art?.natives?.[list[0].id]));
    }
    return out;
}

export function clearingSheet(G) {
    const id = G.ui.sel, tile = tileOf(id), n = numOf(id);
    const cdef = G.data.tile(tile).sides.normal.clearings.find(c => c.n === n);
    const here = G.st.ch.at === id && !G.st.ch.onRoad;
    const sections = [];
    const row = (k, text, sub, img) => h('div', { class: `crow ${k}` }, img ? (typeof img === 'string' ? h('img', { class: 'ico', src: img, alt: '' }) : img) : null, h('div', { class: 'crow-t' }, h('b', {}, text), sub ? (typeof sub === 'string' ? h('small', {}, sub) : sub) : null));
    // you
    const srcs = colorSources(G.st, G.data, id);
    if (srcs.length) sections.push(['Magic here', srcs.map(x => row('magic', x.color, x.why, colorChip(x.color)))]);
    if (G.shared) {
        const who = rosterRows(G.crew, id, row); if (who.length) sections.push(['Who is here', who]);
        const meetRows = meetRowsFor(G, id, row);
        if (meetRows.length) sections.push(['Meeting', meetRows]);
    }
    else if (here) sections.push(['You', [row('me', G.st.ch.name, G.st.ch.hidden ? 'hidden: monsters cannot block you' : 'in plain sight')]]);
    // dwelling and the people who live there
    const dw = G.st.dwellings.filter(d => d.at === id);
    const natHere = G.st.nats.filter(x => !x.dead && !x.hired && x.loc?.c === id);
    const byGroup = {};
    for (const x of natHere) (byGroup[G.data.natives[x.id].group] ??= []).push(G.data.natives[x.id]);
    const REL = { '-2': 'enemy', '-1': 'unfriendly', '0': 'neutral', '1': 'friendly', '2': 'ally' };
    const people = Object.entries(byGroup).map(([g, list]) => row('nat', `${g}: ${list.length} native${list.length === 1 ? '' : 's'}`,
        `${REL[String(G.st.ch.rel?.[g] ?? 0)]} to you; ${list.map(x => x.name.replace(/^\w+ /, '')).join(', ')}`, G.data.art?.natives?.[(list.find(x => x.leader) ?? list[0]).id]));
    if (dw.length || people.length) sections.push(['Dwellings and natives', [...dw.map(d => row('dwelling', d.kind, `${setupDwelling(G, d.kind) || 'a dwelling: natives live and trade here'}`, G.data.art?.dwellings?.[d.kind])), ...people]]);
    if (G.shared) { const comp = companionRows(G, id, row); if (comp.length) sections.push(['Companions', comp]); }
    // monsters
    const mons = {};
    for (const m of G.st.mons.filter(m => !m.dead && m.loc?.c === id)) (mons[G.data.monsters[m.id].name] ??= []).push(m);
    const monRows = Object.entries(mons).map(([name, l]) => {
        const md = G.data.monsters[l[0].id], ls = md.light;
        const blow = ls.attack === 'spell' ? `casts a Type ${ls.spell ?? ''} spell at ${ls.attackTime}` : ls.harm ? `harm ${ls.harm}${'*'.repeat(ls.stars || 0)} at ${ls.attackTime}` : `no attack on this side (${md.dark?.harm ? `harm ${md.dark.harm}${'*'.repeat(md.dark.stars || 0)} at ${md.dark.attackTime} on the other` : 'it only blocks'})`;
        const stats = `vuln ${md.vulnerability}${md.armored ? ' (armored)' : ''} \u00B7 ${blow} \u00B7 moves ${ls.moveTime}${md.flies ? ' \u00B7 flies' : ''}`;
        return row('mon', `${name}${l.length > 1 ? ` x${l.length}` : ''}`, `${stats}. It will block you if you are seen.`, G.data.art?.monstersColor?.[name] ?? G.data.art?.monsters?.[name]);
    });
    if (monRows.length) sections.push(['Monsters', monRows]);
    // chits
    const chitRows = [];
    for (const c of G.st.chits) {
        if (c.pile || c.tile !== tile) continue;
        if (c.clearing === n && c.up) chitRows.push(row(c.kind, c.kind === 'sound' ? `${c.name} (sound ${c.num})` : `${c.name} (site ${c.num})`, c.kind === 'site' ? siteLine(G, c) : 'monsters stir here', mrChit(c)));
        else if (!c.up && c.kind === 'site' && c.num === n && G.st.ch.discovered.sites.includes(c.id)) chitRows.push(row('site', `${c.name} (site ${c.num})`, siteLine(G, c), mrChit(c)));
    }
    for (const cid of G.st.ch.siteCards?.[id] ?? []) chitRows.push(siteCardRow(G, cid));
    if (chitRows.length) sections.push(['Chits and sites', chitRows]);
    const ground = (G.st.abandoned[id] ?? []);
    if (ground.length) sections.push(['On the ground', ground.map(i => row('loot', nameOf(G.data, i), 'anyone here may pick it up with a Loot phase'))]);
    const roads = roadsFrom(G.st, G.data, id);
    const KIND = { open: 'road', tunnel: 'tunnel', hidden: 'hidden path', secret: 'secret passage' };
    sections.push(['Roads', roads.length ? roads.map(r => row(r.usable ? 'road' : 'road off', `to ${nameOfClearing(r.to)}`, r.usable ? KIND[r.kind] : `${KIND[r.kind]} (not discovered)`)) : [row('road off', 'none', '')]]);
    const mtn = cdef.type === 'mountain' ? 'mountain clearing: entering takes two Move phases' : cdef.type === 'cave' ? 'cave clearing: no sunlight phases on the day you are in one' : 'woods clearing';
    return modal(G, nameOfClearing(id), h('div', { class: 'clearing' },
        h('p', { class: 'hint' }, mtn),
        ...sections.flatMap(([title, rows]) => [h('h3', {}, title), ...rows])),
        { close: () => { if (G.ui.peek) { G.ui.peek = false; G.ui.sel = null; } else { G.ui.sheet = null; G.ui.sel = null; } render(G); }, detent: 'half', eyebrow: 'Clearing' });
}
