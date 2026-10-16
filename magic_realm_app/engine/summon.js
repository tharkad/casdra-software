import { say } from './core.js';
import { tileOf, numOf, graph } from './world.js';
import { fxTags, HERO } from './magic/fx.js';

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

// Peace with Nature (the Druid's advantage, or the energized spell): at the end of his own turn the Warning and Sound chits of his tile do not summon.
// They are shown to him but turned face down again, so they call normally for anyone else (7.13.5b). Site chits and dwellings act as usual.
export const peaceWithNature = st => (st.ch.adv ?? []).includes('peace-with-nature') || fxTags(st, HERO, 'noSummon').length > 0;
const quietChit = c => c.kind === 'warning' || c.kind === 'sound';

export function endOfTurn(st, data) {
    const here = st.ch.at, tile = tileOf(here);
    const out = { at: here, tile, prowl: st.prowl, arrivals: [], flipped: [], chits: [], natives: [] };
    if (st.ch.onRoad) return out;                       // on a road he is in no clearing and nothing reacts
    // 1. prowling monsters already in this tile move to him
    for (const m of st.mons) {
        if (m.dead || m.hired || !m.loc?.c || tileOf(m.loc.c) !== tile || m.loc.c === here) continue;
        const row = monRow(data, m.id);
        if (row === ROW_ALWAYS || row === st.prowl) { out.arrivals.push({ id: m.id, name: data.monsters[m.id].name, from: m.loc.c, to: here, why: 'prowls in your tile' }); m.loc = { c: here }; }
    }
    // 2. chits in the tile turn face up (with the optional Quiet Monsters rule, 10.B.1, not if he is hidden: they stay down and call no one)
    const quiet = !!st.options?.quietMonsters && st.ch.hidden;
    const peace = peaceWithNature(st);
    const flipped = [];
    for (const c of st.chits) {
        if (quiet) break;
        if (c.tile !== tile || c.up || c.pile) continue;
        if (c.kind === 'warning' && c.letter === 'V') continue;       // valley warnings were exchanged for dwellings at setup
        if (peace && quietChit(c)) {                                   // he sees it, but it stays face down and has not called anyone
            if (!(st.ch.seen ??= []).includes(c.id)) { st.ch.seen.push(c.id); say(st, `Peace with Nature: you see the ${c.name}${c.kind === 'sound' ? ' ' + c.num : ''} chit, but it keeps quiet and is turned face down again.`, 'discover'); }
            continue;
        }
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
                pc.pile = false; pc.tile = tile; pc.up = !(peace && quietChit(pc));
                if (!pc.up) { if (!(st.ch.seen ??= []).includes(pc.id)) st.ch.seen.push(pc.id); continue; }
                if (pc.kind === 'sound' || pc.kind === 'site') pc.clearing = pc.num;
                flipped.push(pc);
            }
        }
    }
    out.flipped = flipped.map(c => c.id);
    for (const c of flipped) say(st, chitText(c, tile), 'discover');
    const report = Object.fromEntries(flipped.map(c => [c.id, { id: c.id, kind: c.kind, name: c.name, letter: c.letter ?? null, num: c.num ?? null, summons: [], dest: null }]));
    // 3. chits summon: warnings first, then sounds and sites in number order
    const rank = c => (c.kind === 'warning' ? 0 : 1) * 100 + (c.num ?? 0);
    const letter = tileLetter(data, tile);
    // every face-up chit of the tile is named in the report, with what it did and why when it did nothing
    const faceUp = c => c.tile === tile && c.up && c.kind !== 'lost-city' && c.kind !== 'lost-castle';
    if (!quiet) for (const c of st.chits.filter(x => faceUp(x) && x.summoned)) {
        report[c.id] ??= { id: c.id, kind: c.kind, name: c.name, letter: c.letter ?? null, num: c.num ?? null, summons: [], dest: null, already: true, why: 'it has already called out today' };
    }
    if (!quiet) for (const c of [...st.chits.filter(x => faceUp(x) && !x.summoned && !(peace && quietChit(x)))].sort((a, b) => rank(a) - rank(b))) {
        const row = boxesOfRow(data, st.prowl);
        const matching = row.filter(b => boxMatches(b, c, letter));
        const box = matching.find(b => monstersInBox(st, b.id).length);
        c.summoned = true;
        if (!box) {
            const why = matching.length ? 'the creatures it calls are not waiting to come today' : `its row is not the one prowling (the Monster Roll was ${st.prowl})`;
            (report[c.id] ??= { id: c.id, kind: c.kind, name: c.name, letter: c.letter ?? null, num: c.num ?? null, summons: [], dest: null, already: true }).why = why;
            continue;
        }
        const dest = c.kind === 'warning' ? here : tile + c.num;
        for (const m of monstersInBox(st, box.id)) {
            out.arrivals.push({ id: m.id, name: data.monsters[m.id].name, from: null, to: dest, why: `called by ${c.name}${c.kind === 'warning' ? '' : ' ' + c.num}` });
            // a chit that was already face up from an earlier day still calls monsters; it shows in the report too
            const rep = report[c.id] ??= { id: c.id, kind: c.kind, name: c.name, letter: c.letter ?? null, num: c.num ?? null, summons: [], dest: null, already: true };
            rep.summons.push(data.monsters[m.id].name); rep.dest = dest;
            m.loc = { c: dest };
        }
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
        for (const n of members) n.loc = { c: here };
        out.natives.push({ group: g.id, count: members.length, at: dw.kind });
        say(st, `The ${g.id} appear at the ${dw.kind}.`, 'native');
    }
    out.chits = Object.values(report);
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
    return st.mons.filter(m => !m.dead && !m.hired && !m.pacify?.length && m.loc?.c === st.ch.at);        // a pacified monster (Deal with Goblins) does not block him
}

// Midnight housekeeping for chits and monster arrivals.
// House rule (the owner's, 2026-10-13): a chit that has been turned up stays up, and Sound and Site chits stay in their clearing. The rules
// turn them face down again at Midnight, but their faces never change, so nothing is gained by hiding them again. Each chit may still call
// monsters once a day when someone ends a turn in its tile, because `summoned` is cleared here.
export function resetChitsAtMidnight(st) {
    for (const c of st.chits) c.summoned = false;
}
