import { lvl, say, tally, die, noteRoll } from './core.js';
import { makeItem, defOf, nameOf, autoEquip, noteGain, noteFind } from './items.js';
import { numOf, tileOf, roadsFrom, pathKey, nameOfClearing } from './world.js';
import { PEER, LOCATE } from './tables.js';
import { fxTags } from './magic/fx.js';
import { rollCurse, hasCurse, pit } from './effects.js';
import { roll2 } from './core.js';
import { convertCard, oneDie, modRoll, modNote } from './modifiers.js';

// Looting: a discovered site in the clearing, or things lying on the ground (rules digest 04 section 3.4).

export function groundPileAt(st, clearing) { return st.abandoned[clearing] ?? []; }

export function sitesHere(st) {
    const here = st.ch.at, tile = tileOf(here), n = numOf(here);
    return st.chits.filter(c => c.kind === 'site' && c.tile === tile && c.num === n && !c.pile && st.ch.discovered.sites.includes(c.id));
}

const chitName = c => (c.type === 'magic' ? `Magic ${c.numeral ?? ''}${c.time}` : `${c.type === 'move' ? 'Move' : 'Fight'} ${c.strength}${c.time}`) + '*'.repeat(c.effort ?? 0);

// The ways he can pay one asterisk of effort (Cairns, Pool): tire any ready chit that has an asterisk. A chit worth two may also "make change":
// it is tired and a tired one-asterisk chit of the same type is brought back (rule 4.2.4). Identical chits are offered once.
export function effortOptions(st) {
    const out = [], seen = new Set();
    const key = c => `${c.type}${c.strength ?? c.numeral}${c.time}${c.effort}`;
    for (const c of st.ch.chits) {
        if (c.state !== 'active' || !(c.effort > 0) || seen.has(key(c))) continue;
        seen.add(key(c));
        out.push({ chit: c.id, text: `Tire ${chitName(c)}` });
        if (c.effort === 2) {
            const seenBack = new Set();
            for (const b of st.ch.chits) {
                if (b.state !== 'fatigued' || b.effort !== 1 || b.type !== c.type || seenBack.has(key(b))) continue;
                seenBack.add(key(b));
                out.push({ chit: c.id, back: b.id, text: `Tire ${chitName(c)} and bring back ${chitName(b)} (change)` });
            }
        }
    }
    return out;
}
export function payEffort(st, o) {
    const c = st.ch.chits.find(x => x.id === o.chit);
    c.state = 'fatigued';
    if (o.back) st.ch.chits.find(x => x.id === o.back).state = 'active';
    return `You ${o.text.charAt(0).toLowerCase()}${o.text.slice(1)}.`;
}

function asterisksAvailable(st) {
    return st.ch.chits.filter(c => c.state === 'active' && c.effort > 0).sort((a, b) => a.effort - b.effort);
}

function takeInto(st, data, it) {
    convertCard(data, it);
    st.ch.items.push(it);
    noteGain(st, it);
    autoEquip(st, data, it);
}

export function lootFrom(st, data, r, groundOnly = false, { paid = false } = {}) {
    const here = st.ch.at;
    const sites = groundOnly ? [] : sitesHere(st);
    const site = sites[0];
    const pileList = site ? st.sites[site.name] : (st.abandoned[here]?.length ? st.abandoned[here] : null);
    if (!pileList) return `Loot (${r.dice.join('+')}): there is nothing here to loot. You need to discover a site first.`;
    const label = site ? site.name : 'the things on the ground';
    // Conditions at the more dangerous sites.
    // (the Cairns' toll is paid before the roll is made: see doSearch)
    if (site?.name === 'Vault' && !st.sitesOpen?.Vault) {
        const strong = st.ch.chits.some(c => c.state === 'active' && lvl(c.strength) >= 4);
        const keys = st.ch.items.some(i => i.id === 'lost-keys' && i.active);
        if (!strong && !keys) return 'The Vault is sealed. You need Tremendous strength or the Lost Keys.';
        (st.sitesOpen ??= {}).Vault = true;
    }
    const idx = r.value - 1;
    const it = pileList[idx];
    if (!it) return `Loot (${r.dice.join('+')}) at ${label}: nothing at that depth.`;
    if (site?.name === 'Pool' && !paid) {
        // an asterisk is paid each time something is actually taken, and he picks the chit
        const opts = effortOptions(st);
        if (!opts.length) return 'You are too exhausted to wade into the Pool.';
        if (opts.length === 1) say(st, payEffort(st, opts[0]), 'info');
        else { st.pending = { type: 'effort-cost', site: 'Pool', options: opts, resume: 'loot', r, ground: groundOnly }; return 'wait'; }
    }
    pileList.splice(idx, 1);
    const card = it.kind === 'treasure' ? data.treasures[it.id] : null;
    if (card?.kind === 'twt' && it.id !== 'chest') return takeTwt(st, data, pileList, it, card, r, label);
    const item = it.uid ? it : makeItem(st, it.kind, it.id);
    takeInto(st, data, item);
    tally(st, 'looted'); if (site) tally(st, `looted.${site.name}`);
    const text = `Loot (${r.dice.join('+')}) at ${label}: you take the ${nameOf(data, item)}.`;
    say(st, text, 'loot');
    return text;
}

// Counters named by a Treasure-within-Treasure box (Living Sword, Gold Helmet...).
function counterNamed(data, name, box) {
    const pools = [['weapon', data.weapons], ['armor', data.armor], ['horse', data.horses]];
    for (const [kind, pool] of pools) {
        const hit = Object.values(pool).find(d => d.name === name && (d.startBox === box || d.startBox === name));
        if (hit) return { kind, id: hit.id };
    }
    for (const [kind, pool] of pools) { const hit = Object.values(pool).find(d => d.name === name); if (hit) return { kind, id: hit.id }; }
    return null;
}

function takeTwt(st, data, pile, it, card, r, label) {
    const box = st.twt[it.id], here = st.ch.at;
    noteFind(st, { kind: 'card', id: it.id, name: box.name });
    if (!box.siteCard) {
        // A substitute card: it leaves play, curses you, and its contents go on top of the pile.
        const curse = rollCurse(st, data);
        const adds = [];
        for (const c of box.contents) { const ct = counterNamed(data, c.name, box.box); if (ct) adds.push(ct); }
        for (const l of box.large) adds.push(l);
        if (box.gold) st.ch.gold += box.gold;
        let where;
        if (it.id === 'remains-of-thief') {          // the finder keeps everything at once
            const names = [];
            for (const a of adds) { const item = makeItem(st, a.kind, a.id); takeInto(st, data, item); names.push(nameOf(data, item)); }
            where = `You keep: ${names.join(', ') || 'nothing more'}.`;
        } else { pile.unshift(...adds); where = 'Its goods lie on top of the pile.'; }
        const text = `Loot (${r.dice.join('+')}) at ${label}: ${box.name}! Cursed with ${curse}.${box.gold ? ` You find ${box.gold} gold.` : ''} ${where}`;
        say(st, text, 'loot');
        return text;
    }
    // A site card: you have found a place; it returns to the bottom of the pile and may be searched where you stand.
    pile.push(it);
    st.ch.siteCards ??= {};
    (st.ch.siteCards[here] ??= []);
    if (!st.ch.siteCards[here].includes(it.id)) st.ch.siteCards[here].push(it.id);
    const text = `Loot (${r.dice.join('+')}) at ${label}: you find the ${box.name}. You may now search it here with a Loot phase.`;
    say(st, text, 'loot');
    return text;
}

// Searching a Treasure-within-Treasure site card with its own table (digest 04 section 3.3).
export function lootSiteCard(st, data, r) {
    const here = st.ch.at, ids = st.ch.siteCards?.[here] ?? [];
    if (!ids.length) return null;
    const id = ids[0], box = st.twt[id], v = r.value;
    const give = (name, kind) => {
        const ct = counterNamed(data, name, box.box);
        if (!ct) return `The ${name} is gone.`;
        const used = (st.gone ??= {});
        const key = ct.id;
        if (used[key]) return `The ${name} has already been taken.`;
        used[key] = true;
        const item = makeItem(st, ct.kind, ct.id);
        takeInto(st, data, item);
        return `You take the ${nameOf(data, item)}.`;
    };
    let out = `${box.name} (${r.dice.join('+')}): `;
    const T = data.tables.twtSiteTables[box.box];
    const res = T?.[String(v)];
    const strong = st.ch.chits.some(c => c.state === 'active' && lvl(c.strength) >= 4) || st.ch.items.some(i => i.id === 'lost-keys' && i.active);
    if (box.box === 'Crypt of the Knight' && !strong) return `${out}the crypt is sealed: you need Tremendous strength or the Lost Keys.`;
    switch (res) {
        case 'weapon': out += give(box.contents.find(c => c.kind === 'weapon')?.name ?? 'Devil Sword'); break;
        case 'horse': out += give(box.contents.find(c => c.kind === 'horse')?.name ?? 'Pony'); break;
        case 'armor': out += give(box.contents.find(c => c.kind === 'armor')?.name ?? 'Tremendous Suit of Armor'); break;
        case 'treasure': {
            const l = box.large.shift();
            if (l) { const item = makeItem(st, l.kind, l.id); takeInto(st, data, item); out += `You take the ${nameOf(data, item)}.`; } else out += 'Nothing is left.';
            break;
        }
        case 'gold': st.ch.gold += 1; out += 'You pocket a piece of gold.'; break;
        case 'curse': out += `A curse! ${rollCurse(st, data)}.`; break;
        case 'heal': for (const c of st.ch.chits) c.state = 'active'; out += 'All your fatigue and wounds are gone.'; break;
        case 'teleport_cave': out += 'You feel a pull toward the caves (not modelled yet).'; break;
        case 'power_pit': out += `The Pit answers: ${pit(st, data, box.name)}.`; break;
        case 'wish': out += 'You make a wish (not modelled yet).'; break;
        case 'peer_any': out += 'Your sight ranges far today (not modelled yet).'; break;
        default: out += 'Nothing happens.';
    }
    say(st, out, 'loot');
    return out;
}

// Fog (7.5.4b): nobody may use the Peer table in a fogged tile, from inside it or into it. Spells and cards that Peer are not stopped.
export const peerBlocked = (st, data, clearing) => !!clearing && fxTags(st, { kind: 'tile', id: tileOf(clearing) }, 'noPeer').length > 0;

// What a Peer or Locate result gives, for the clearing searched (his own, or one named from afar by Talk to Wise Bird).
export function applySearchResult(st, data, table, res, dice, here = st.ch.at) {
    const tile = tileOf(here);
    const bits = [];
    const lead = `${table === 'peer' ? 'Peer' : 'Locate'} (${dice.join('+')}): ${res}.`;
    if (/Clues/.test(res)) {
        const ids = st.chits.filter(c => c.tile === tile && !c.up && !c.pile).map(c => c.id);
        for (const id of ids) if (!st.ch.seen.includes(id)) st.ch.seen.push(id);
        bits.push(`You learn what the ${ids.length} unrevealed chit${ids.length === 1 ? '' : 's'} here are.`);
    }
    if (/Hidden enemies/.test(res)) { st.ch.hiddenEnemies = true; bits.push('You can now find hidden foes today.'); }
    if (/Paths/.test(res)) bits.push(discoverPaths(st, data, here, 'hidden'));
    if (/Passages/.test(res)) bits.push(discoverPaths(st, data, here, 'secret'));
    if (/Discover chits/.test(res)) {
        const ids = st.chits.filter(c => c.kind === 'site' && c.tile === tile && c.num === numOf(here) && !c.pile).map(c => c.id);
        for (const id of ids) { if (!st.ch.discovered.sites.includes(id)) { st.ch.discovered.sites.push(id); tally(st, 'sitesDiscovered'); noteFind(st, { kind: 'site', id, name: st.chits.find(c => c.id === id)?.name, clearing: here }); } if (!st.ch.seen.includes(id)) st.ch.seen.push(id); }
        bits.push(ids.length ? `You discover a site here: ${ids.map(id => st.chits.find(c => c.id === id).name).join(', ')}.` : 'There is no site in this clearing.');
    }
    if (res === 'Nothing') bits.push('You find nothing.');
    return [lead, ...bits.filter(Boolean)].join(' ');
}

export function discoverPaths(st, data, clearing, kind) {
    const found = [];
    for (const r of roadsFrom(st, data, clearing)) {
        if (r.kind !== kind) continue;
        const key = pathKey(clearing, r.to);
        if (!st.ch.discovered.paths.includes(key)) { st.ch.discovered.paths.push(key); found.push(nameOfClearing(r.to)); }
    }
    return found.length ? `You discover the ${kind === 'hidden' ? 'hidden path' : 'secret passage'} to ${found.join(', ')}.` : '';
}


// ---- Talk to Wise Bird: a remote Peer of any clearing on the map (7.5.4, 4.6.8a.2) ----
// What a clearing would give him: the unrevealed chits of its tile he has not seen, its hidden paths he has not found.
const unseenChits = (st, tile) => st.chits.filter(c => c.tile === tile && !c.up && !c.pile && !st.ch.seen.includes(c.id)).length;
const hiddenPaths = (st, data, clearing, kind) => roadsFrom(st, data, clearing).filter(r => r.kind === kind && !st.ch.discovered.paths.includes(pathKey(clearing, r.to))).length;
export const peerGain = (st, data, clearing) => unseenChits(st, tileOf(clearing)) + hiddenPaths(st, data, clearing, 'hidden');
// "Choice" cannot ask a question in the middle of a combat round, so the best result is taken: the one that shows him the most he does not know yet.
function bestChoice(st, data, clearing) {
    const tile = tileOf(clearing);
    const sites = () => st.chits.filter(c => c.kind === 'site' && c.tile === tile && c.num === numOf(clearing) && !c.pile && !st.ch.discovered.sites.includes(c.id)).length;
    const worth = res => (/Clues/.test(res) ? unseenChits(st, tile) : 0) + (/Paths/.test(res) ? hiddenPaths(st, data, clearing, 'hidden') : 0)
        + (/Passages/.test(res) ? hiddenPaths(st, data, clearing, 'secret') : 0) + (/Discover chits/.test(res) ? sites() : 0) + (/Hidden enemies/.test(res) && !st.ch.hiddenEnemies ? 0.5 : 0);
    const options = [...new Set([...PEER, ...LOCATE].filter(x => x !== 'Choice' && x !== 'Nothing'))];
    return options.reduce((best, o) => (worth(o) > worth(best) ? o : best), options[0]);
}
// One Peer-table roll for the named clearing, with his usual dice and modifiers; Fog and Eyemist do not matter (a spell, not the Search activity).
export function remotePeer(st, data, clearing) {
    const r = oneDie(st, 'search', st.ch.at, data) ? (() => { const d1 = die(st); return { dice: [d1], value: d1 }; })() : roll2(st);
    const raw = [...r.dice];
    modRoll(st, data, 'peer', r);
    let res = PEER[r.value - 1];
    noteRoll(st, 'Talk to Wise Bird: Peer', raw, r.value, res + modNote(r));
    if (res === 'Choice') res = bestChoice(st, data, clearing);
    return applySearchResult(st, data, 'peer', res, raw, clearing);
}
