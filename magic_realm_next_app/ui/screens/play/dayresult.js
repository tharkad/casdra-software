// play/dayresult.js: what a day came to, as facts (daySummary) and as a Story sentence. The Day Result sheet (results.js reportSheet) leads with the headline, then the rows that have
// something in them (Slain, Found, Bought, Sold, Cursed), then the three score frames. Everything is read from the day's log lines (the engine logs no structured record of a day) and from
// `st.report` (what Fame, Notoriety and Gold moved over the day). Nothing here writes to the game.
import { nameOfClearing } from '../../../engine/catalogue.js';
import { crowd } from '../../storyvoice.js';
import { ownSheet, tableModel } from '../../combat/feed.js';
import { partyFacts, hasNews } from '../../combat/partyfacts.js';
import { displayName } from '../../names.js';

const strip = n => String(n).replace(/ #\d+$/, '').replace(/ \d+$/, '').trim();            // "Rogue Swordsman 6" / "Ghost #2" -> "Rogue Swordsman" / "Ghost"
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// What the day's log says happened. `day` is the day that ended.
export function daySummary(G, day) {
    // a hired leader's turns are told apart (leaders.js: the fights he had alone are their own block of the report): the day here is the player's own
    const st = G.st, dayLines = (st.log ?? []).filter(l => l.day === day && (G.shared || !l.who || !st.options?.hirelingRules || tableModel(st, G.data).chars?.[l.who] && !tableModel(st, G.data).chars[l.who].leader));
    // a party on one phone (several characters of one player): the day on screen is the day of the character on screen, and "You" in a line is him. The others' own lines (their phases, their finds) are theirs;
    // the fight of the evening is everyone's, so it is read for every character by name (partyfacts.js), the same facts the screen after the fight shows (notes 137, 138)
    const hot = hotParty(G), seat = hot ? ownSheet(st, G.data).id : null;
    const lines = hot ? dayLines.filter(l => !l.who || l.who === seat) : dayLines;
    const party = hot ? partyFacts(dayLines.filter(l => l.r != null && l.k === 'combat'), hot.map(id => ({ id, name: nameOfChar(G, id) }))) : null;
    const kills = [], found = [], bought = [], sold = [], curses = [], hired = [];
    let wounds = 0, died = false;
    if (party) for (const m of party.members) for (const k of m.kills) kills.push({ name: strip(k.name), full: k.name, ...(m.id === seat ? {} : { byName: m.name }) });
    for (const l of lines) {
        const t = l.t ?? '';
        let m;
        if (hot && /^You kill the (.+?) with /.test(t)) { /* (the kills of a party are the fight's, above) */ }
        else if ((m = /^You kill the (.+?) with /.exec(t))) kills.push({ name: strip(m[1]), full: m[1] });
        else if ((m = /^(.+?) kills the (.+?) for you/.exec(t))) kills.push({ name: strip(m[2]), full: m[2], by: m[1] });
        else if ((m = /^You wound (\d+) action chit/.exec(t))) wounds += Number(m[1]);
        else if (/^You take a wound/.test(t)) wounds += 1;
        else if (/you are slain|^You die/i.test(t)) died = true;
        else if ((m = /^You buy the (.+?) (?:from the .+? )?for (\d+)/.exec(t))) bought.push({ name: m[1], cost: Number(m[2]) });
        else if ((m = /^You sell the (.+?) to the .+? for (\d+) gold/.exec(t))) sold.push({ name: m[1], gold: Number(m[2]) });
        else if ((m = /^You hire (.+?) of the (.+?) for (\d+) days/.exec(t))) hired.push({ name: strip(m[1]), group: m[2] });
        else if ((m = /^A curse falls on you: ([A-Za-z ]+?)\./.exec(t))) curses.push(m[1]);
        else if (l.k === 'phase' || l.k === 'loot') {
            if ((m = /(?:^|: |\) at .+?: |\. )you take the (.+?)\.?$/i.exec(t.replace(/^Phase \d+: /, ''))) || (m = /^You take the (.+?)\.?$/.exec(t.replace(/^Phase \d+: /, '')))) found.push({ name: m[1].replace(/ \(.*$/, '') });
        }
    }
    // sites found today (a site is a place, not a thing carried, but the player is pleased to hear it)
    for (const f of st.finds ?? []) if (f.day === day && f.kind === 'site' && f.name && ((!G.shared && !hot) || !f.who || f.who === (hot ? seat : st.ch.id))) found.push({ name: f.name, site: true, clearing: f.clearing });
    const seen = new Set(); for (let i = found.length - 1; i >= 0; i--) { const k = found[i].name + (found[i].site ? '*' : ''); if (seen.has(k)) found.splice(i, 1); else seen.add(k); }   // (a find is logged as its own line and in its phase line)
    const rep = st.report?.day === day ? st.report : null;
    const deltas = rep ? { fame: rep.fame, notor: rep.notoriety, gold: rep.gold } : { fame: 0, notor: 0, gold: 0 };
    const moved = ['fame', 'notor', 'gold'].some(k => deltas[k]);
    const empty = !kills.length && !(party && party.members.some(hasNews)) && !found.length && !bought.length && !sold.length && !curses.length && !hired.length && !wounds && !moved;
    const sum = { day, kills, found, bought, sold, curses, hired, wounds, died, deltas, moved, empty, party, seat };
    sum.story = storyHeadline(G, sum); sum.detail = detailHeadline(sum);
    return sum;
}

// "You cut down a Wolf at Curst Valley 4 and walked away with a Ruby." The kill leads (taste: "lead with the fact that I killed the monsters").
function storyHeadline(G, s) {
    if (s.empty) return 'A quiet day. Nothing won, nothing lost.';
    const at = G.st.ch?.at && !ownSheet(G.st, G.data).onRoad ? nameOfClearing(ownSheet(G.st, G.data).at) : null;
    const things = s.found.filter(f => !f.site).map(f => f.name), sites = s.found.filter(f => f.site).map(f => f.name);
    const lead = [];
    const mine = s.kills.filter(k => !k.byName), others = [...new Set(s.kills.filter(k => k.byName).map(k => k.byName))];
    const place = at ? ` at ${at.replace(/ (\d+)$/, ' $1')}` : '';
    if (mine.length) lead.push(`You cut down ${crowd(mine.map(k => k.name)).text}${place}`);
    for (const who of others) lead.push(`${who} cut down ${crowd(s.kills.filter(k => k.byName === who).map(k => k.name)).text}${lead.length ? '' : place}`);
    const tail = [];
    if (things.length) tail.push(`${s.kills.length ? 'walked away with' : 'found'} ${listOf(things.map(a))}`);
    if (sites.length && !things.length) tail.push(`${s.kills.length ? 'came upon' : 'came upon'} ${listOf(sites.map(x => `the ${x}`))}`);
    if (s.bought.length) tail.push(`bought ${listOf(s.bought.map(b => a(b.name)))}`);
    if (s.sold.length && !s.bought.length) tail.push(`sold ${listOf(s.sold.map(b => a(b.name)))}`);
    if (s.hired.length) tail.push(`took on ${listOf(s.hired.map(x => `a ${x.name}`))}`);
    if (s.curses.length) tail.push(`bore the curse of ${listOf(s.curses)}`);
    if (!lead.length && !tail.length) return s.died ? 'The day ended badly.' : s.wounds ? 'A hard day. You come away hurt.' : 'The day is done; the coin has moved.';
    const who = lead.length ? listOf(lead) : cap(`You ${tail.shift()}`);
    const rest = lead.length ? tail : tail;
    return `${who}${rest.length ? ` and ${listOf(rest)}` : ''}${s.wounds && !s.died ? ', hurt but standing' : ''}.`;
}
const a = n => (/^(the|a|an|some)\b/i.test(n) ? n : `${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${n}`);
const listOf = x => (x.length <= 1 ? (x[0] ?? '') : `${x.slice(0, -1).join(', ')} and ${x[x.length - 1]}`);

// The Detail line: "Day 3: Wolf slain. Ruby found. Mace bought (8 Gold)."  (instance numbers kept)
function detailHeadline(s) {
    if (s.empty) return `Day ${s.day}: nothing won, nothing lost.`;
    const parts = [
        ...s.kills.map(k => `${k.full} slain${k.byName ? ` by ${k.byName}` : ''}`), ...s.found.map(f => `${f.name} ${f.site ? 'discovered' : 'found'}`), ...s.bought.map(b => `${b.name} bought (${b.cost} Gold)`),
        ...s.sold.map(b => `${b.name} sold (${b.gold} Gold)`), ...s.hired.map(h => `${h.name} hired`), ...s.curses.map(c => `${c} curse`), ...(s.wounds ? [`${s.wounds} wound${s.wounds === 1 ? '' : 's'}`] : []),
    ];
    return `Day ${s.day}: ${parts.length ? parts.join('. ') + '.' : 'the score moved.'}`;
}

const nameOfChar = (G, id) => displayName(tableModel(G.st, G.data).chars?.[id]?.name ?? id);
/** The characters of a party on one phone (several characters of one player, no hired leader among them), in the day's order, or null: a lone character, a table, a race. */
export function hotParty(G) {
    if (G.shared || G.race) return null;
    const tm = tableModel(G.st, G.data), me = tm.chars?.[ownSheet(G.st, G.data).id];
    const ids = (tm.order ?? []).filter(id => tm.chars[id] && !tm.chars[id].leader && tm.chars[id].owner === me?.owner);
    return ids.length > 1 ? ids : null;
}

/** The other characters of a party on one phone, as the story voice tells their lines (by name): Map id -> { name, kind: 'named' }; empty when there is no party. */
export function partyVoice(G) {
    const ids = hotParty(G), me = ownSheet(G.st, G.data).id;
    return new Map((ids ?? []).filter(id => id !== me).map(id => [id, { name: nameOfChar(G, id), kind: 'named' }]));
}
