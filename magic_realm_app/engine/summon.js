import { say } from './core.js';
import { tileOf, numOf, graph } from './world.js';

// What happens when a character's turn ends (rules digest 02 section 5.2 and digest 05 section 5.2):
// prowling monsters in his tile come to him, the map chits of his tile turn up, and chits summon boxes of prowling monsters.

const monRow = (data, id) => data.monsters[id].homeRow ?? 0;
const ROW_ALWAYS = 0;

function boxesOfRow(data, row) { return data.appearance.rows.find(r => r.row === row)?.boxes ?? []; }

// A box matches a chit when one of its summoning entries names it (and any letter condition holds).
function boxMatches(box, chit, tileLetter) {
    return (box.summonedBy ?? []).some(s => {
        if (chit.kind === 'site') return s.site === chit.name;
        if (s.chit !== chit.name) return false;
        if (chit.kind === 'warning') return !s.letter || s.letter === chit.letter;
        return !s.letter || s.letter === tileLetter;                 // a sound chit with a letter needs that letter's warning chit in its tile
    });
}

export function tileLetter(data, tile) {
    const g = data.tile(tile).group;
    return { valley: 'V', woods: 'W', cave: 'C', mountain: 'M' }[g];
}

function monstersInBox(st, boxId) { return st.mons.filter(m => !m.dead && !m.hired && m.loc?.box === boxId); }

export function endOfTurn(st, data) {
    const here = st.ch.at, tile = tileOf(here);
    const out = { arrivals: [], flipped: [], natives: [] };
    if (st.ch.onRoad) return out;                       // on a road he is in no clearing and nothing reacts
    // 1. prowling monsters already in this tile move to him
    for (const m of st.mons) {
        if (m.dead || m.hired || !m.loc?.c || tileOf(m.loc.c) !== tile || m.loc.c === here) continue;
        const row = monRow(data, m.id);
        if (row === ROW_ALWAYS || row === st.prowl) { m.loc = { c: here }; out.arrivals.push(m.id); }
    }
    // 2. chits in the tile turn face up
    const flipped = [];
    for (const c of st.chits) {
        if (c.tile !== tile || c.up || c.pile) continue;
        if (c.kind === 'warning' && c.letter === 'V') continue;       // valley warnings were exchanged for dwellings at setup
        c.up = true;
        if (c.kind === 'sound' || c.kind === 'site') c.clearing = c.num;
        flipped.push(c);
        // Smoke and Stink in the woods turn into campfires, in clearing 5, else 4, else 2.
        if (c.kind === 'warning' && c.letter === 'W' && (c.name === 'Smoke' || c.name === 'Stink')) {
            const reach = graph(st, data).reach;
            const n = [5, 4, 2].find(k => reach.has(tile + k)) ?? 2;
            const kind = c.name === 'Smoke' ? 'Small Campfire' : 'Large Campfire';
            if (!st.dwellings.some(d => d.at === tile + n)) { st.dwellings.push({ kind, at: tile + n, tile }); say(st, `A ${kind.toLowerCase()} burns in clearing ${n}.`, 'discover'); }
        }
        if (c.kind === 'lost-city' || c.kind === 'lost-castle') {
            const pile = c.kind === 'lost-city' ? st.piles.lostCity : st.piles.lostCastle;
            say(st, `${c.kind === 'lost-city' ? 'The Lost City' : 'The Lost Castle'} is revealed!`, 'discover');
            for (const id of pile.splice(0)) {
                const pc = st.chits.find(x => x.id === id);
                pc.pile = false; pc.tile = tile; pc.up = true;
                if (pc.kind === 'sound' || pc.kind === 'site') pc.clearing = pc.num;
                flipped.push(pc);
            }
        }
    }
    out.flipped = flipped.map(c => c.id);
    for (const c of flipped) say(st, chitText(c, tile), 'discover');
    // 3. chits summon: warnings first, then sounds and sites in number order
    const rank = c => (c.kind === 'warning' ? 0 : 1) * 100 + (c.num ?? 0);
    const letter = tileLetter(data, tile);
    for (const c of [...st.chits.filter(x => x.tile === tile && x.up && !x.summoned && x.kind !== 'lost-city' && x.kind !== 'lost-castle')].sort((a, b) => rank(a) - rank(b))) {
        const row = boxesOfRow(data, st.prowl);
        const box = row.find(b => boxMatches(b, c, letter) && monstersInBox(st, b.id).length);
        c.summoned = true;
        if (!box) continue;
        const dest = c.kind === 'warning' ? here : tile + c.num;
        for (const m of monstersInBox(st, box.id)) { m.loc = { c: dest }; out.arrivals.push(m.id); }
        say(st, `${c.name}${c.kind === 'warning' ? '' : ' ' + c.num} summons ${monstersInBox(st, box.id).length ? '' : ''}${boxLabel(data, box)} to ${dest === here ? 'you' : 'clearing ' + numOf(dest)}.`, 'monster');
    }
    // 4. natives appear where a dwelling of theirs stands, if their row prowls
    for (const g of Object.values(data.groups)) {
        if (g.garrison) continue;
        if (g.homeRow !== st.prowl) continue;
        const dw = st.dwellings.find(d => d.at === here && (g.dwellings ?? []).includes(d.kind));
        if (!dw) continue;
        const members = st.nats.filter(n => !n.dead && !n.hired && n.loc?.box && data.natives[n.id].group === g.id);
        if (!members.length) continue;
        for (const n of members) { n.loc = { c: here }; out.natives.push(n.id); }
        say(st, `The ${g.id} appear at the ${dw.kind}.`, 'native');
    }
    return out;
}

function boxLabel(data, box) { return box.label ?? box.id.replace(/-/g, ' '); }

function chitText(c, tile) {
    if (c.kind === 'warning') return `A warning chit turns up in the woods: ${c.name}.`;
    if (c.kind === 'sound') return `You hear ${c.name} from clearing ${c.num}.`;
    if (c.kind === 'site') return `A site is revealed in clearing ${c.num}: ${c.name}.`;
    return 'A chit is revealed.';
}

// Monsters that block him at the end of a phase: any unhired monster in his clearing, if he is not hidden.
export function blockers(st) {
    if (st.ch.hidden || st.ch.onRoad) return [];
    return st.mons.filter(m => !m.dead && !m.hired && m.loc?.c === st.ch.at);
}

// Midnight housekeeping for chits and monster arrivals.
export function resetChitsAtMidnight(st) {
    for (const c of st.chits) {
        c.summoned = false;
        if (c.kind !== 'lost-city' && c.kind !== 'lost-castle' && c.up && !c.pile && !(c.kind === 'warning' && c.letter === 'V')) {
            // valley warnings were replaced by dwellings at setup; every other chit goes face down again
            c.up = false;
            if (c.kind === 'sound' || c.kind === 'site') c.clearing = null;
        }
    }
}
