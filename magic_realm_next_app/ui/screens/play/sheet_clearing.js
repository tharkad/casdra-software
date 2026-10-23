// play/sheet_clearing.js: the clearing sheet and everything it says about a place (mockup 02 d1): who is here, who lives here, WHAT YOU COULD GET (the sites found here with what is left, the pile
// drawn as the real stack of face-down cards, Small and Large, numbered by depth), signs, what lies on the ground, the roads. The same site blocks stand inside the choice screens
// (the Search table, the Loot pick): the owner asked for exactly that, "the site contents should be in the choice screens so you can see what you could get".
// Only what the Setup Card tells everyone is drawn: Large above Small, never which card is Great (that is unknown until it is looted: the printed rule).
import { lvl } from '../../../engine/core.js';
import { nameOf } from '../../../engine/items.js';
import { colorSources } from '../../../engine/spells.js';
import { nameOfClearing, numOf, roadsFrom, tileName, tileOf } from '../../../engine/world.js';
import { h } from '../../dom.js';
import { sect } from '../../ds.js';
import { actIcon, icon } from '../../icons.js';
import { playerOf as playerNameOf } from '../../meet.js';
import { rosterRows } from '../../shared_ui.js';
import { newDraft as newMeetDraft } from '../meetui.js';
import { modal, mrChit } from './kit.js';
import { render } from './shell.js';

const nbsp = s => String(s).replace(/ (\d+)$/, ' $1');
const REACH = 6;                                                                   // a Loot roll is 1 to 6: the first six cards of a pile can be reached

// ---- small builders ----
// A row of the sheet: the counter picture (a string is a picture path, a Node is placed as it is), a title, one line.
export const row = (k, text, sub, img, end = null) => h('div', { class: `ds-row ${k}` },
    img ? h('span', { class: 'art' }, typeof img === 'string' ? h('img', { src: img, alt: '' }) : img) : null,
    h('span', { class: 'main' }, h('b', {}, text), sub ? (typeof sub === 'string' ? h('span', {}, sub) : sub) : null), end);
const storyDetail = (story, detail) => [h('span', { 'data-v': 'story' }, story), h('span', { 'data-v': 'detail' }, detail ?? story)];

// ---- a site: what is left, the pile, what looting it needs ----
function siteCardText(G, e) {
    const g = G.data.monsters[e.guardian]?.name ?? e.guardian;
    const special = e.special ? ` Needs: ${e.special.replace('fatigue_asterisk', 'an asterisk of effort').replace('fatigue_t,key', 'a Tremendous-strength chit or the Lost Keys')}.` : '';
    return `${e.name}: ${e.small} Small, ${e.large} Large${e.spells?.length ? `, spells ${e.spells.join(', ')}` : ''}. Guardian: ${g} (Monster Roll ${e.row}). Chit printed with clearing ${e.chitNumber}.${special}`;
}

// What looting a site demands, in words (null when it demands nothing).
function siteNeeds(G, name) {
    const asterisk = G.st.ch.chits.some(x => x.state === 'active' && x.effort > 0);
    const tChit = G.st.ch.chits.some(x => x.state === 'active' && lvl(x.strength) >= 4) || G.st.ch.items.some(i => i.id === 'lost-keys' && i.active);
    if (name === 'Cairns') return `Every Loot roll costs an asterisk of effort, found or not. ${asterisk ? 'You have one ready.' : 'You have none ready now, so you could not loot it.'}`;
    if (name === 'Pool') return `Each thing taken costs an asterisk of effort. ${asterisk ? 'You have one ready.' : 'You have none ready now.'}`;
    if (name === 'Vault') return G.st.sitesOpen?.Vault ? 'The Vault is open, for everyone.' : `Sealed until opened with a Tremendous-strength chit or the Lost Keys. ${tChit ? 'You can open it.' : 'You cannot open it now.'}`;
    return null;
}

// The pile drawn top to bottom, the way a Loot roll counts it: 1 takes the top card, 2 the second, and so on to 6. Large cards are taller; the reachable ones are lit, the deep ones dashed.
export function pileEl(G, name, pile, sizes = null) {
    const cards = sizes ?? pile.filter(it => it.kind !== 'spell').map(it => ((G.data.treasures[it.id]?.kind ?? 'small') === 'small' ? 'small' : 'large'));
    const spells = (G.st.spellBox?.sites?.[name] ?? []).map(sp => G.data.spells?.[sp.id]?.type).filter(Boolean);
    if (!cards.length && !spells.length) return null;
    return h('div', { class: 'ds-pilebox', 'data-site': name },
        cards.length ? h('div', { class: 'ds-pile', 'data-site': name, role: 'img', 'aria-label': `${cards.length} cards, top first` },
            ...cards.map((size, i) => h('span', { class: `ds-card ${size} ${i < REACH ? 'reach' : 'deep'}`, 'data-pos': String(i + 1) }, h('span', { class: 't' }, size), String(i + 1)))) : null,
        cards.length ? h('div', { class: 'ds-pile-key' }, h('span', {}, 'The pile, top first'),
            h('span', { 'data-v': 'story' }, cards.length > REACH ? 'The lit cards are within reach; the rest lie too deep.' : 'Every card is within reach.'),
            h('span', { 'data-v': 'detail' }, `A Loot roll of 1 to ${REACH} takes that card.${cards.length > REACH ? ` Cards below the ${REACH}th cannot be reached until those above are taken.` : ''}`)) : null,
        spells.length ? h('p', { class: 'ds-meta ds-spellsapart' }, `Spell cards lie apart (${spells.length}): read them with Reading Runes, they are not in the pile.`) : null);
}

// A site: its counter, whether it is found, what is left (and the pile), what looting it needs. `fresh`: it has just been found (the tag, and it leads the sheet).
export function siteBlock(G, c, { fresh = false, withPile = true, compact = false } = {}) {
    const found = G.st.ch.discovered.sites.includes(c.id);
    const e = G.data.setupcard?.sites?.find(x => x.name === c.name);
    const pile = found ? (G.st.sites?.[c.name] ?? []) : [];
    const spells = G.st.spellBox?.sites?.[c.name]?.length ?? 0;
    const treasures = pile.filter(it => it.kind !== 'spell');
    const small = treasures.filter(it => (G.data.treasures[it.id]?.kind ?? 'small') === 'small').length, large = treasures.length - small;
    const printed = !found && e ? [...Array(e.large ?? 0).fill('large'), ...Array(e.small ?? 0).fill('small')] : null;       // the Setup Card is public: how many, never which
    const left = !found ? `Not found yet. The Setup Card says ${e ? `${e.small} Small, ${e.large} Large` : 'nothing'}; locate it to see what it holds.`
        : !pile.length ? 'Found, and empty.'
            : `${[small ? `${small} Small` : '', large ? `${large} Large` : ''].filter(Boolean).join(', ') || 'No treasure'}${spells ? ` and ${spells} spell${spells === 1 ? '' : 's'}` : ''} left. Great ones show when looted.`;
    const needs = found && pile.length ? siteNeeds(G, c.name) : null;
    return h('div', { class: `ds-site sitecard${found ? ' found' : ''}${fresh ? ' fresh' : ''}`, 'data-site': c.name },
        compact ? h('span', { class: 'ds-dim setupline' }, left) : h('div', { class: 'head' },
            h('span', { class: 'ds-counter sm' }, actIcon(found ? 'cache' : 'search', 32)),
            h('span', { class: 'main' }, h('b', {}, c.name, fresh ? h('span', { class: 'ds-tag gold' }, 'Just found') : null), h('span', { class: 'ds-dim setupline' }, left))),
        withPile && (found || printed?.length) ? pileEl(G, c.name, pile, printed) : null,
        needs ? h('p', { class: 'ds-meta setupline dim' }, needs) : null,
        e ? h('details', { class: 'ds-more' }, h('summary', {}, `About the ${c.name}`), h('p', { class: 'ds-meta setupline card' }, siteCardText(G, e))) : null);
}

// A site card he found by looting: what each Loot roll on it gives (the card's own table), and what it demands.
export function siteCardRow(G, cid, bare = false) {
    const box = G.st.twt?.[cid], name = G.data.treasures?.[cid]?.name ?? box?.name ?? cid;
    const T = G.data.tables?.twtSiteTables?.[box?.box ?? name] ?? {};
    const what = res => {
        const named = k => box?.contents?.find(c => c.kind === k)?.name;
        switch (res) {
            case 'weapon': return `a weapon: ${named('weapon') ?? 'a weapon'}`;
            case 'horse': return `a horse: ${named('horse') ?? 'a horse'}`;
            case 'armor': return `armor: ${named('armor') ?? 'a suit of armor'}`;
            case 'treasure': return box?.large?.length ? `a Large treasure (${box.large.length} left)` : 'a Large treasure (none left)';
            case 'gold': return 'one piece of gold';
            case 'curse': return 'a curse';
            case 'heal': return 'all your fatigue and wounds are healed';
            case 'power_pit': return 'the Power of the Pit';
            case 'teleport_cave': return 'a pull toward the caves';
            case 'wish': return 'a wish';
            case 'peer_any': return 'your sight ranges far';
            default: return 'nothing happens';
        }
    };
    const tm = (box?.box ?? name) === 'Crypt of the Knight' ? 'Needs a Tremendous-strength chit or the Lost Keys on every roll.' : null;
    return h('div', { class: 'ds-site sitecard found', 'data-sitecard': cid },
        bare ? null : h('div', { class: 'head' }, h('span', { class: 'ds-counter sm' }, actIcon('cache', 32)), h('span', { class: 'main' }, h('b', {}, name), h('span', { class: 'ds-dim' }, 'Found by looting: a place you can search here with a Loot phase.'))),
        h('div', { class: 'ds-twt' }, ...Object.entries(T).map(([roll, res]) => h('div', { class: 'twtrow' }, h('b', {}, roll), h('span', {}, what(res))))),
        tm ? h('p', { class: 'ds-meta setupline dim' }, tm) : null);
}

// What the printed Treasure Set Up Card tells every player about a dwelling.
function setupDwelling(G, kind) {
    const e = G.data.setupcard?.dwellings?.find(x => x.name === kind || x.rsName === kind);
    if (!e) return '';
    const goods = Object.entries(e.treasures?.counters ?? {}).map(([n, k]) => `${n}${k > 1 ? ` ×${k}` : ''}`).join(', ');
    return `Setup card: the ${e.group} live here (${e.nativeCounters} native counters). They keep ${e.treasures?.small ?? 0} Small treasures${goods ? ` and: ${goods}` : ''}.`;
}

// The sites of the clearing he stands in that Loot could reach, the ground and any site card: for the choice screens (Loot, Search choice).
export function hereBlocks(G) {
    const at = G.st.ch.at; if (!at || G.st.ch.onRoad) return [];
    const tile = tileOf(at), n = numOf(at), out = [];
    for (const c of G.st.chits.filter(x => x.kind === 'site' && x.tile === tile && x.num === n && !x.pile && G.st.ch.discovered.sites.includes(x.id))) out.push(siteBlock(G, c));
    const ground = G.st.abandoned?.[at] ?? [];
    if (ground.length) out.push(row('loot', 'On the ground', ground.map(i => nameOf(G.data, i)).join(', ') + '.', actIcon('cache', 32)));
    for (const cid of G.st.ch.siteCards?.[at] ?? []) out.push(siteCardRow(G, cid));
    return out.length ? [h('div', { class: 'here', 'data-here': 'search' }, ...out)] : [h('p', { class: 'ds-meta' }, 'No site here is found yet, so Loot would find nothing. Locate is how a site is found.')];
}

// ---- who is here, who lives here ----
// Meeting the others in the clearing I stand in: who I may give or trade with now, who I may not (and why), and who follows whom today.
function meetRowsFor(G, id) {
    if (!G.ms || G.st.ch.at !== id || G.st.ch.onRoad) return [];
    const out = [];
    for (const p of G.ms.partners) out.push(h('button', { type: 'button', class: 'ds-row meetwith', 'data-act': 'meet-with', 'data-meet-with': p.id, onclick: () => { G.ui.meet = newMeetDraft(); G.ui.meet.to = p.id; G.ui.sheet = 'meet'; render(G); } },
        h('span', { class: 'main' }, h('b', {}, `Meet ${p.player}`), h('span', {}, G.ms.window === 'dayend' ? 'Give or trade before Midnight' : 'Give or trade: nothing changes hands until they accept')), icon('right')));
    for (const o of G.ms.others) out.push(row('meet off', `${o.player}: not now`, o.why));
    for (const [f, g] of Object.entries(G.st.follows ?? {})) if (G.st.chars[f]?.at === id || G.st.chars[g]?.at === id) out.push(row('meet', `${playerNameOf(G.st, f)} follows ${playerNameOf(G.st, g)} today`, 'A follower goes wherever the guide goes and is called out with him.'));
    return out;
}

// Hired natives and creatures in a clearing belong to the character who hired them (7.7): they follow him and fight for him alone.
function companionRows(G, id) {
    const out = [], by = new Map();
    for (const o of [...G.st.nats, ...G.st.mons]) if (o.hired && !o.dead && o.hiredBy && o.loc?.c === id) (by.get(o.hiredBy) ?? by.set(o.hiredBy, []).get(o.hiredBy)).push(o);
    for (const [owner, list] of by) {
        const mine = owner === G.st.ch.id, nm = o => G.data.natives[o.id]?.name ?? G.data.monsters[o.id]?.name ?? o.id, until = Math.max(...list.map(o => o.hiredUntil ?? o.controlledUntil ?? 0));
        out.push(row('nat', `${list.map(nm).join(', ')}`, `${mine ? 'Hired by you' : `Hired by ${playerNameOf(G.st, owner)}`}: they follow ${mine ? 'you' : 'their employer'} and fight for no one else${until ? `, until the end of day ${until}` : ''}.`, G.data.art?.natives?.[list[0].id]));
    }
    return out;
}

const REL = { '-2': 'enemy', '-1': 'unfriendly', '0': 'neutral', '1': 'friendly', '2': 'ally' };
const MOOD = { enemy: 'Enemies of yours.', unfriendly: 'Not friendly to you.', neutral: 'Neutral to you.', friendly: 'Friendly to you.', ally: 'Allies of yours.' };
const tile_ = (src, label = null) => h('span', { class: 'ds-counter sm' }, src ? h('img', { src, alt: label ?? '' }) : actIcon('ban', 32));

export function clearingSheet(G) {
    const id = G.ui.sel, tile = tileOf(id), n = numOf(id);
    const cdef = G.data.tile(tile).sides.normal.clearings.find(c => c.n === n);
    const here = G.st.ch.at === id && !G.st.ch.onRoad;
    const fresh = G.ui.foundSite ?? null;
    const sections = [];
    const put = (key, title, rows, right = '') => { if (rows?.length || rows?.nodeType) sections.push({ key, node: [sect(title, right), ...(Array.isArray(rows) ? rows : [rows])] }); };

    // here now: you (or the table), the magic of the place, who is meeting whom
    const hereRows = [];
    const srcs = colorSources(G.st, G.data, id);
    if (G.shared) { hereRows.push(...rosterRows(G.crew, id, row)); }
    else if (here) hereRows.push(row('me', 'You', `${G.st.ch.name}, ${G.st.ch.hidden ? 'hidden: nothing can block you' : 'in plain sight'}`, tile_(G.data.art?.characters?.[G.st.ch.id], G.st.ch.name)));
    for (const x of srcs) hereRows.push(row('magic', `${x.color} magic`, x.why, `art/colormagic/${{ Grey: 'gray' }[x.color] ?? x.color.toLowerCase()}chit.gif`));          // (the chit's own art in the tile: DR-3)
    if (G.shared) hereRows.push(...meetRowsFor(G, id));
    put('here', G.shared ? 'Who is here' : 'Here now', hereRows);
    if (G.shared) put('companions', 'Companions', companionRows(G, id));

    // living here: dwellings and natives (counters, mood), then the monsters
    const dw = G.st.dwellings.filter(d => d.at === id);
    const natHere = G.st.nats.filter(x => !x.dead && !x.hired && x.loc?.c === id);
    const byGroup = {};
    for (const x of natHere) (byGroup[G.data.natives[x.id].group] ??= []).push(G.data.natives[x.id]);
    const living = [];
    for (const d of dw) {
        const grp = G.data.setupcard?.dwellings?.find(x => x.name === d.kind)?.group;
        living.push(h('div', { class: 'ds-row dwelling' }, tile_(G.data.art?.dwellings?.[d.kind], d.kind), h('span', { class: 'main' }, h('b', {}, d.kind), ...storyDetail(grp ? `The ${grp} live here.` : 'A dwelling: natives live and trade here.', setupDwelling(G, d.kind) || 'A dwelling: natives live and trade here.'))));
    }
    for (const [g, list] of Object.entries(byGroup)) {
        const rel = REL[String(G.st.ch.rel?.[g] ?? 0)], lead = list.find(x => x.leader) ?? list[0];
        living.push(h('div', { class: 'ds-row nat' }, tile_(G.data.art?.natives?.[lead.id], g),
            h('span', { class: 'main' }, h('b', {}, `${g}${list.length > 1 ? ` ×${list.length}` : ''}`), ...storyDetail(MOOD[rel], `${rel[0].toUpperCase()}${rel.slice(1)} to you; ${list.map(x => x.name.replace(/^\w+ /, '')).join(', ')}`)),
            h('span', { class: `ds-tag mood ${rel}` }, rel[0].toUpperCase() + rel.slice(1))));
    }
    const mons = {};
    for (const m of G.st.mons.filter(m => !m.dead && m.loc?.c === id)) (mons[G.data.monsters[m.id].name] ??= []).push(m);
    for (const [name, l] of Object.entries(mons)) {
        const md = G.data.monsters[l[0].id], ls = md.light;
        const blow = ls.attack === 'spell' ? `casts a Type ${ls.spell ?? ''} spell at ${ls.attackTime}` : ls.harm ? `harm ${ls.harm}${'*'.repeat(ls.stars || 0)} at ${ls.attackTime}` : `no attack on this side (${md.dark?.harm ? `harm ${md.dark.harm}${'*'.repeat(md.dark.stars || 0)} at ${md.dark.attackTime} on the other` : 'it only blocks'})`;
        living.push(h('div', { class: 'ds-row mon' }, tile_(G.data.art?.monstersColor?.[name] ?? G.data.art?.monsters?.[name], name),
            h('span', { class: 'main' }, h('b', {}, `${name}${l.length > 1 ? ` ×${l.length}` : ''}`), ...storyDetail(G.st.ch.hidden ? 'It has not seen you.' : 'It will block you if you are seen.', `vuln ${md.vulnerability}${md.armored ? ' (armored)' : ''} · ${blow} · moves ${ls.moveTime}${md.flies ? ' · flies' : ''}. It will block you if you are seen.`))));
    }
    put('living', 'Living here', living);

    // what you could get: the sites found here (the one just found first), the site cards, what lies on the ground
    const get = [];
    const siteChits = G.st.chits.filter(c => !c.pile && c.tile === tile && c.kind === 'site' && ((c.clearing === n && c.up) || (c.num === n && G.st.ch.discovered.sites.includes(c.id))));
    siteChits.sort((a, b) => (b.id === fresh) - (a.id === fresh));
    for (const c of siteChits) get.push(siteBlock(G, c, { fresh: c.id === fresh }));
    for (const cid of G.st.ch.siteCards?.[id] ?? []) get.push(siteCardRow(G, cid));
    const ground = G.st.abandoned[id] ?? [];
    if (ground.length) get.push(h('div', { class: 'ds-site found ground' }, h('div', { class: 'head' }, h('span', { class: 'ds-counter sm' }, actIcon('cache', 32)), h('span', { class: 'main' }, h('b', {}, 'On the ground'), h('span', { class: 'ds-dim' }, `${ground.map(i => nameOf(G.data, i)).join(', ')}. Anyone here may pick it up with a Loot phase.`)))));
    put('get', 'What you could get', get, get.length ? 'found here' : '');

    // signs: sounds and warnings that have turned up in this clearing
    const signs = G.st.chits.filter(c => !c.pile && c.tile === tile && c.clearing === n && c.up && c.kind !== 'site').map(c => row(c.kind, c.kind === 'sound' ? `${c.name} (sound ${c.num})` : c.name, 'Monsters stir here.', mrChit(c)));
    put('signs', 'Signs', signs);

    // roads: collapsed (a long list; one tap)
    const roads = roadsFrom(G.st, G.data, id);
    const KIND = { open: 'road', tunnel: 'tunnel', hidden: 'hidden path', secret: 'secret passage' };
    const terrain = cdef.type === 'mountain' ? 'Mountain clearing: entering takes two Move phases.' : cdef.type === 'cave' ? 'Cave clearing: no sunlight phases on the day you are in one.' : null;
    const roadsEl = h('details', { class: 'ds-roads' }, h('summary', {}, `${roads.filter(r => r.usable).length} road${roads.filter(r => r.usable).length === 1 ? '' : 's'} out of here`),
        terrain ? h('p', { class: 'ds-meta' }, terrain) : null,
        ...(roads.length ? roads.map(r => row(r.usable ? 'road' : 'road off', `to ${nbsp(nameOfClearing(r.to))}`, r.usable ? KIND[r.kind] : `${KIND[r.kind]} (not found yet)`)) : [row('road off', 'none', '')]));

    // nothing known about the place yet (a clearing far away that no one has seen): one line saying so, not an empty sheet (DR-26)
    if (!sections.length) sections.push({ key: 'none', node: [h('p', { class: 'ds-voice none-known' }, h('span', { 'data-v': 'story' }, 'Nothing is known of this clearing yet.'), h('span', { 'data-v': 'detail' }, 'Nothing is known of this clearing yet: no site, creature or native has been seen here.'))] });
    // a find opens the sheet on what was found: what you could get leads
    const ordered = [...sections].sort((a, b) => (fresh ? (b.key === 'get') - (a.key === 'get') : 0));
    const kindWord = cdef.type === 'mountain' ? 'mountain clearing' : cdef.type === 'cave' ? 'cave clearing' : 'woods clearing';
    const close = () => { G.ui.foundSite = null; if (G.ui.peek) { G.ui.peek = false; G.ui.sel = null; } else { G.ui.sheet = null; G.ui.sel = null; } render(G); };
    return modal(G, nbsp(nameOfClearing(id)), h('div', { class: 'clearing ds-clearing', 'data-clearing': id }, ...ordered.flatMap(s => s.node), roadsEl),
        { close, detent: 'half', eyebrow: `${tileName(tile)} · ${kindWord}`, bare: true, cls: 'clearing-sheet' });
}
