import { lvl, say } from './core.js';
import { makeItem, defOf, nameOf, autoEquip } from './items.js';
import { numOf, tileOf } from './world.js';
import { rollCurse, hasCurse, pit } from './effects.js';
import { roll2 } from './core.js';
import { convertCard } from './modifiers.js';

// Looting: a discovered site in the clearing, or things lying on the ground (rules digest 04 section 3.4).

export function groundPileAt(st, clearing) { return st.abandoned[clearing] ?? []; }

export function sitesHere(st) {
    const here = st.ch.at, tile = tileOf(here), n = numOf(here);
    return st.chits.filter(c => c.kind === 'site' && c.tile === tile && c.num === n && !c.pile && st.ch.discovered.sites.includes(c.id));
}

function asterisksAvailable(st) {
    return st.ch.chits.filter(c => c.state === 'active' && c.effort > 0).sort((a, b) => a.effort - b.effort);
}

function takeInto(st, data, it) {
    convertCard(data, it);
    st.ch.items.push(it);
    autoEquip(st, data, it);
}

export function lootFrom(st, data, r, groundOnly = false) {
    const here = st.ch.at;
    const sites = groundOnly ? [] : sitesHere(st);
    const site = sites[0];
    const pileList = site ? st.sites[site.name] : (st.abandoned[here]?.length ? st.abandoned[here] : null);
    if (!pileList) return `Loot (${r.dice.join('+')}): there is nothing here to loot. You need to discover a site first.`;
    const label = site ? site.name : 'the things on the ground';
    // Conditions at the more dangerous sites.
    if (site?.name === 'Cairns') {
        const c = asterisksAvailable(st)[0];
        if (!c) return 'The Cairns demand effort and you have none to give.';
        c.state = 'fatigued';
    }
    if (site?.name === 'Vault' && !st.sitesOpen?.Vault) {
        const strong = st.ch.chits.some(c => c.state === 'active' && lvl(c.strength) >= 4);
        const keys = st.ch.items.some(i => i.id === 'lost-keys' && i.active);
        if (!strong && !keys) return 'The Vault is sealed. You need Tremendous strength or the Lost Keys.';
        (st.sitesOpen ??= {}).Vault = true;
    }
    const idx = r.value - 1;
    const it = pileList[idx];
    if (!it) return `Loot (${r.dice.join('+')}) at ${label}: nothing at that depth.`;
    if (site?.name === 'Pool') {
        const c = asterisksAvailable(st)[0];
        if (!c) return 'You are too exhausted to wade into the Pool.';
        c.state = 'fatigued';
    }
    pileList.splice(idx, 1);
    const card = it.kind === 'treasure' ? data.treasures[it.id] : null;
    if (card?.kind === 'twt' && it.id !== 'chest') return takeTwt(st, data, pileList, it, card, r, label);
    const item = it.uid ? it : makeItem(st, it.kind, it.id);
    takeInto(st, data, item);
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
