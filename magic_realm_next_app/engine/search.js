import { lvl, say, tally, die, noteRoll } from './core.js';
import { makeItem, defOf, nameOf, autoEquip, noteGain, noteFind, horseLevel } from './items.js';
import { BOOTS, GLOVES } from './modifiers.js';
import { numOf, tileOf, roadsFrom, pathKeyAt, nameOfClearing } from './world.js';
import { PEER, LOCATE } from './tables.js';
import { fxTags } from './magic/fx.js';
import { rollCurse, hasCurse, pit } from './effects.js';
import { roll2, chitWord } from './core.js';
import { convertCard, oneDie, modRoll, modNote } from './modifiers.js';
import { isMulti } from './party.js';
import { spyOnLoot, snap, shareFind, followersOf } from './meet.js';
import { opensVault } from './leaders.js';

// Looting: a discovered site in the clearing, or things lying on the ground (rules digest 04 section 3.4).

export function groundPileAt(st, clearing) { return st.abandoned[clearing] ?? []; }

export function sitesHere(st) {
    const here = st.ch.at, tile = tileOf(here), n = numOf(here);
    return st.chits.filter(c => c.kind === 'site' && c.tile === tile && c.num === n && !c.pile && st.ch.discovered.sites.includes(c.id));
}

const chitName = c => (c.type === 'magic' ? `Magic ${c.numeral ?? ''}${c.time}` : `${chitWord(c)} ${c.strength}${c.time}`) + '*'.repeat(c.effort ?? 0);

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
// 7.5.5d.2 (ruling S7, Mike 2026-10-26: the recommendation, ask which piece): to break into the Vault without the Lost Keys he plays a piece of Tremendous strength: a Fight, Move, Duck or
// Berserk chit, a horse, a Gloves card or a Boots card. A chit he plays is fatigued; a horse or a card is not. Identical chits are offered once.
export function vaultPieces(st, data) {
    const out = [], seen = new Set();
    for (const c of st.ch.chits) {
        if (c.state !== 'active' || !['move', 'fight', 'duck', 'berserk'].includes(c.type) || lvl(c.strength) < 4) continue;
        const key = `${c.type}${c.strength}${c.time}${c.effort}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ chit: c.id, text: `Play ${chitName(c)} to break the door (it is tired)` });
    }
    for (const it of st.ch.items) {
        if (it.destroyed || !it.active) continue;
        if (it.kind === 'horse' && data.horses[it.id] && horseLevel(data, it) >= 4) out.push({ chit: null, piece: 'horse', item: it.uid, text: `Break the door with your ${nameOf(data, it)}` });
        else if (it.kind === 'treasure' && (BOOTS[it.id]?.[0] === 'T' || GLOVES[it.id]?.[0] === 'T')) out.push({ chit: null, piece: 'card', item: it.uid, text: `Break the door with your ${nameOf(data, it)}` });
    }
    return out;
}
export function payEffort(st, o) {
    if (!o.chit) return `You ${o.text.charAt(0).toLowerCase()}${o.text.slice(1)}.`;          // a horse or a card is played, not tired (7.5.5d.2)
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

// `sight`: taken through the Magic Sight table (7.5.7): the same piles and conditions, but the Cairns' toll is paid when something is actually taken (like the Pool's).
export function lootFrom(st, data, r, groundOnly = false, { paid = false, sight = false } = {}) {
    const here = st.ch.at, what = sight ? 'Magic Sight' : 'Loot';
    const sites = groundOnly ? [] : sitesHere(st);
    const site = sites[0];
    const pileList = site ? st.sites[site.name] : (st.abandoned[here]?.length ? st.abandoned[here] : null);
    if (!pileList) return `${what} (${r.dice.join('+')}): there is nothing here to loot. You need to discover a site first.`;
    const label = site ? site.name : 'the things on the ground';
    // Conditions at the more dangerous sites.
    // (the Cairns' toll is paid before the roll is made: see doSearch)
    if (site?.name === 'Vault' && !st.sitesOpen?.Vault) {
        const keys = st.ch.items.some(i => i.id === 'lost-keys' && i.active) || opensVault(st, data);          // (a hired leader with Tremendous harm or move strength opens it, 7.7.2c)
        if (!keys) {
            const opts = vaultPieces(st, data);
            if (!opts.length) return 'The Vault is sealed. You need Tremendous strength or the Lost Keys.';
            if (opts.length === 1) say(st, payEffort(st, opts[0]), 'info');
            else { st.pending = { type: 'effort-cost', site: 'Vault', options: opts, resume: 'loot', r, ground: groundOnly, sight, opens: 'Vault' }; return 'wait'; }
        }
        (st.sitesOpen ??= {}).Vault = true;
    }
    const idx = r.value - 1;
    const it = pileList[idx];
    if (!it) return `${what} (${r.dice.join('+')}) at ${label}: nothing at that depth.`;
    if ((site?.name === 'Pool' || (sight && site?.name === 'Cairns')) && !paid && !st.ch.leader) {          // (a hired leader pays no asterisk, 7.7.2c)
        // an asterisk is paid each time something is actually taken, and he picks the chit
        const opts = effortOptions(st);
        if (!opts.length) return 'You are too exhausted to wade into the Pool.';
        if (opts.length === 1) say(st, payEffort(st, opts[0]), 'info');
        else { st.pending = { type: 'effort-cost', site: site.name, options: opts, resume: 'loot', r, ground: groundOnly, sight }; return 'wait'; }
    }
    pileList.splice(idx, 1);
    if (site && isMulti(st)) spyOnLoot(st, data, st.ch.id, { siteId: site.id });                         // the characters who see him loot it learn the site (4.5.6b.2)
    const card = it.kind === 'treasure' ? data.treasures[it.id] : null;
    if (card?.kind === 'twt' && it.id !== 'chest') return takeTwt(st, data, pileList, it, card, r, label);
    const item = it.uid ? it : makeItem(st, it.kind, it.id);
    takeInto(st, data, item);
    tally(st, 'looted'); if (site) tally(st, `looted.${site.name}`);
    const text = `${what} (${r.dice.join('+')}) at ${label}: you take the ${nameOf(data, item)}.`;
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
    if (isMulti(st)) spyOnLoot(st, data, st.ch.id, { cardId: id });                                       // a Site card searched: the card and the chit it came from are seen
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
    const strong = st.ch.chits.some(c => c.state === 'active' && lvl(c.strength) >= 4) || st.ch.items.some(i => i.id === 'lost-keys' && i.active) || opensVault(st, data);
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
    // his followers share what he finds (7.11.6c)
    const before = isMulti(st) && followersOf(st, st.actor).length ? snap(st.ch) : null;
    const out = searchResult(st, data, table, res, dice, here);
    if (before) shareFind(st, before);
    return out;
}
function searchResult(st, data, table, res, dice, here) {
    const tile = tileOf(here);
    const bits = [];
    const lead = `${table === 'peer' ? 'Peer' : table === 'magicsight' ? 'Magic Sight' : 'Locate'} (${dice.join('+')}): ${res}.`;
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
        const key = pathKeyAt(st, clearing, r.to);
        if (!st.ch.discovered.paths.includes(key)) { st.ch.discovered.paths.push(key); found.push(nameOfClearing(r.to)); }
    }
    return found.length ? `You discover the ${kind === 'hidden' ? 'hidden path' : 'secret passage'} to ${found.join(', ')}.` : '';
}


// ---- Talk to Wise Bird: a remote Peer of any clearing on the map (7.5.4, 4.6.8a.2) ----
// What a clearing would give him: the unrevealed chits of its tile he has not seen, its hidden paths he has not found.
const unseenChits = (st, tile) => st.chits.filter(c => c.tile === tile && !c.up && !c.pile && !st.ch.seen.includes(c.id)).length;
const hiddenPaths = (st, data, clearing, kind) => roadsFrom(st, data, clearing).filter(r => r.kind === kind && !st.ch.discovered.paths.includes(pathKeyAt(st, clearing, r.to))).length;
export const peerGain = (st, data, clearing) => unseenChits(st, tileOf(clearing)) + hiddenPaths(st, data, clearing, 'hidden');
// "Choice" cannot ask a question in the middle of a combat round, so the best result is taken: the one that shows him the most he does not know yet.
export function bestChoice(st, data, clearing) {
    const tile = tileOf(clearing);
    const sites = () => st.chits.filter(c => c.kind === 'site' && c.tile === tile && c.num === numOf(clearing) && !c.pile && !st.ch.discovered.sites.includes(c.id)).length;
    const worth = res => (/Clues/.test(res) ? unseenChits(st, tile) : 0) + (/Paths/.test(res) ? hiddenPaths(st, data, clearing, 'hidden') : 0)
        + (/Passages/.test(res) ? hiddenPaths(st, data, clearing, 'secret') : 0) + (/Discover chits/.test(res) ? sites() : 0) + (/Hidden enemies/.test(res) && !st.ch.hiddenEnemies ? 0.5 : 0);
    const options = [...new Set([...PEER, ...LOCATE].filter(x => x !== 'Choice' && x !== 'Nothing'))];
    return options.reduce((best, o) => (worth(o) > worth(best) ? o : best), options[0]);
}
// One Peer-table roll for the named clearing, with his usual dice and modifiers; Fog and Eyemist do not matter (a spell, not the Search activity).
export function remotePeer(st, data, clearing) {
    const r = oneDie(st, 'search', st.ch.at, data) ? (() => { const d1 = die(st, 'search.peer'); return { dice: [d1], value: d1 }; })() : roll2(st, 'search.peer');
    const raw = [...r.dice];
    modRoll(st, data, 'peer', r);
    let res = PEER[r.value - 1];
    noteRoll(st, 'Talk to Wise Bird: Peer', raw, r.value, res + modNote(r));
    if (res === 'Choice') res = bestChoice(st, data, clearing);
    return applySearchResult(st, data, 'peer', res, raw, clearing);
}
