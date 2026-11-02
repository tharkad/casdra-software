// The fight told as a story. Every line of the log keeps its plain, exact form (`t`), and carries this prose as `s` for the places that read the game
// aloud (the fight's last-round panel, the day report, the journal). Phrases vary by the dice rolled so far, so a fight does not repeat itself, and the
// same game always tells the same story.
const v = (st, arr, k = 0) => arr[(((st.rollSeq ?? 0) * 3 + k) % arr.length + arr.length) % arr.length];
const The = n => `The ${n}`, the = n => `the ${n}`;
const harmWord = L => ({ N: 'glances off', L: 'thuds against', M: 'bites into', H: 'hammers', T: 'crashes down on' }[L] ?? 'strikes');
const pos = box => `${box} position`;
const DV = { thrust: 'thrusts', swing: 'swings', smash: 'smashes down' };
// What a missile weapon sends: the story says "arrow", not "blow".
export const shotOf = w => (/crossbow/i.test(w ?? '') ? 'bolt' : /\bbow\b/i.test(w ?? '') ? 'arrow' : /sling/i.test(w ?? '') ? 'stone' : null);

export const tell = {
    ambush: st => v(st, ['You spring from hiding and strike first: your cover is gone.', 'You lunge out of the shadows; there is no hiding now.']),
    hold: st => v(st, ['Nothing shifts.', 'The creatures hold their ground.']),
    shuffle: st => v(st, ['The creatures trade places.', 'The melee churns.']),
    moved: (st, name, from, to, i = 0) => `${The(name)} ${v(st, ['slips', 'scuttles', 'circles', 'shifts', 'lurches'], i)} from ${from} to ${to}.`,
    flipped: (st, box, names) => `In the ${box} box the ${names} show${names.includes(' and ') || names.includes(',') ? '' : 's'} another side.`,
    myHitBox: (st, weapon, dir, name) => (shotOf(weapon) ? `Your ${shotOf(weapon)} flies at ${the(name)} and finds it there.` : `Your ${weapon} ${DV[dir] ?? dir} at ${the(name)} and finds it there.`),
    myHitFast: (st, weapon, dir, name, where, mine, its) => `${The(name)} twists into ${where}, but your ${shotOf(weapon) ?? weapon} is quicker (${mine} against ${its}) and lands.`,
    myMiss: (st, weapon, dir, name, where, mine, its) => `Your ${shotOf(weapon) ? `${shotOf(weapon)} flies` : `${weapon} ${DV[dir] ?? dir}`} at empty air: ${the(name)} is in ${where}${its != null ? `, too quick to catch (${its} against your ${mine})` : ''}.`,
    notBack: (st, name, hidden) => (hidden ? `Caught off guard, ${the(name)} cannot answer this round.` : `${The(name)}'s companions have not joined in: no blow comes back.`),
    connectNoMove: (st, name, dir) => `${The(name)}'s ${dir} comes in unchallenged: you played no maneuver.`,
    connectMeets: (st, name, dir, mnv) => `${The(name)}'s ${dir} is aimed at your ${mnv} and finds you.`,
    connectUnder: (st, name, dir, atk, mine) => `${The(name)}'s ${dir} gets under your guard (${atk} against your ${mine}).`,
    avoid: (st, name, dir, aimed, mnv) => `${The(name)}'s ${dir} misses: your ${mnv} carries you clear.`,
    strike: (st, name, dir, L, armor) => `${The(name)}'s ${dir} ${harmWord(L)} ${armor ? `your ${armor}` : 'you'}.`,
    noEffect: (st, harm, armor, tough) => (armor
        ? `No effect: ${harm.toLowerCase()} harm cannot dent your ${armor} (it takes ${tough}) or hurt you through it.`
        : `No effect: ${harm.toLowerCase()} harm is too light to wound you.`),
    damaged: (st, armor) => v(st, [`Your ${armor} is dented and damaged.`, `Your ${armor} takes the blow and is damaged.`]),
    destroyed: (st, armor, gold) => `Your ${armor} is destroyed${gold ? ` (worth ${gold} gold)` : ''}.`,
    wound: st => v(st, ['The blow gets through: a wound.', 'You are wounded.']),
    kill: (st, weapon, name, reward) => `Your ${shotOf(weapon) ?? weapon} ${shotOf(weapon) ? v(st, ['brings down', 'drops', 'cuts down'], 3) : v(st, ['cleaves', 'strikes down', 'cuts down'], 3)} ${the(name)}, which ${v(st, ['crumples', 'falls', 'collapses'], 4)}${reward}.`,
    // `shotDelta`: what the Missile Table did to the harm (a missile weapon only): -1 and it lost its sting, +1 and it bit deeper.
    tough: (st, weapon, name, L, vuln, shotDelta = null) => `Your ${shotOf(weapon) ?? weapon} ${shotOf(weapon) ? 'strikes' : 'bites'} ${the(name)}, but harm ${L} cannot fell it (vulnerability ${vuln})${shotDelta ? `; the shot ${shotDelta < 0 ? 'lost its sting' : 'bit deeper than it looked'}` : ''}.`,
    spent: (st, n) => `${n} of your chits ${n === 1 ? 'is' : 'are'} tired.`,
    wounded: (st, n) => `${n} of your chits ${n === 1 ? 'is' : 'are'} put out of action.`,
    dieDown: st => v(st, ['Both sides draw back: the fighting dies down.', 'The blows stop; neither side presses on.']),
    won: st => v(st, ['The last foe falls.', 'Nothing hostile is left standing.']),
    ran: st => 'You break away and flee.',
};

// ---- the world's own events: dawn, who prowls, the week's end, sunset, and the day's phases in prose ----
const PLURAL = n => (/wolf$/i.test(n) ? n.replace(/wolf$/i, 'Wolves') : /s$/i.test(n) ? n : /(?:ch|sh|x)$/i.test(n) ? `${n}es` : `${n}s`);
const listOf = a => (a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// The creatures and peoples whose boxes are in the row the Monster roll named.
export function prowlers(data, row) {
    const mons = [...new Set(Object.values(data.monsters).filter(m => m.homeRow === row && m.family !== 'Ghost').map(m => (m.name ?? '').replace(/^(Tremendous|Heavy|Spear|Sword|Axe) /, '')))].map(n => PLURAL(n));
    const folk = Object.values(data.groups ?? {}).filter(g => g.homeRow === row).map(g => `the ${g.id}`);
    return { mons, folk };
}
// What prowls today, told as a sentence instead of a row number: the creatures of that row (and the ever-wandering Ghosts) that are alive and free, by family.
const WILD = { Dragon: ['dragon', 'wake in their hoards', 'wakes in its hoard'], Giant: ['giant', 'rise from their stones', 'rises from its stones'], Ogre: ['ogre', 'lumber out of their holes', 'lumbers out of its hole'],
    Troll: ['troll', 'prowl the dark places', 'prowls the dark places'], Demon: ['demon', 'stir below', 'stirs below'], Imp: ['imp', 'flit abroad', 'flits abroad'], Octopus: ['octopus', 'stirs in the deep', 'stirs in the deep'],
    Serpent: ['serpent', 'uncoil', 'uncoils'], Spider: ['spider', 'creep from their webs', 'creeps from its web'], Goblin: ['goblin', 'take the field', 'takes the field'], Wolf: ['wolf', 'hunt in packs', 'hunts'],
    Bat: ['giant bat', 'take wing', 'takes wing'], Ghost: ['ghost', 'drift out', 'drifts out'] };
const WILD_ORDER = ['Dragon', 'Giant', 'Ogre', 'Troll', 'Demon', 'Imp', 'Octopus', 'Serpent', 'Spider', 'Goblin', 'Wolf', 'Bat', 'Ghost'];
const WORDNUM = { 10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen', 20: 'twenty' };
const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
export function wilds(st, data) {
    const live = st.mons.filter(m => { const d = data.monsters[m.id]; return !m.dead && !m.hired && d && (d.homeRow === st.prowl || d.prowlsEveryDay); });
    const by = {}; for (const m of live) { const d = data.monsters[m.id]; (by[d.family] ??= []).push(d); }
    const clauses = WILD_ORDER.filter(f => by[f]).map(f => {
        const n = by[f].length, [noun, many, one] = WILD[f] ?? [f.toLowerCase(), 'stir', 'stirs'], winged = f === 'Dragon' && by[f].some(d => d.flies) && by[f].length > 1;
        const count = n === 1 ? `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}` : `${n > 9 ? WORDNUM[n] ?? n : num(n)} ${noun === 'wolf' ? 'wolves' : `${noun}s`}`;
        return `${n === 1 ? count : count}${winged ? ', some winged,' : ''} ${n === 1 ? one : many}`;
    });
    if (!clauses.length) return 'The wilds are quiet today.';
    return `${cap1(listOf(clauses))}.`;
}
Object.assign(tell, {
    wilds,
    dawn: (st, data, { magic = [], weekEnd = false } = {}) => {
        const { mons, folk } = prowlers(data, st.prowl), who = [...mons, ...folk];
        const open = v(st, [`Day ${st.day} dawns.`, `Morning comes on day ${st.day}.`, `The sun rises on day ${st.day}.`]);
        const stir = wilds(st, data);
        const mag = magic.length ? ` The land is filled with ${listOf(magic)} magic until midnight.` : '';
        return `${open} ${stir}${mag}`;
    },
    weekEnd: (st, data, { revived = [], ghosts = false } = {}) => {
        const names = listOf([...new Set(revived)]);
        const dead = revived.length ? ` ${v(st, [`The slain come back with them: ${names}.`, `Even the dead are called home: ${names} rise again.`, `The slain return too (${names}), new arrivals from beyond the Realm.`], 2)}` : '';
        return `${v(st, [`It is the week's end.`, `The week turns.`, `Day ${st.day} closes the week.`])} The creatures of the wilds are called home to where they began.${dead}${ghosts ? ' The Ghosts, who can never be put down, are back where they started.' : ''}`;
    },
    sunset: (st, where) => v(st, [`The sun sets over ${where}.`, `Dusk gathers around ${where}.`, `Evening falls on ${where}.`]),
    quiet: st => v(st, ['A quiet evening: nothing stirs near you.', 'The evening is quiet. Nothing comes for you.']),
    phase: (st, text) => {
        const t = text.replace(/\s*\(rolled [^)]*\)/, '').replace(/\.$/, '');
        let m;
        if ((m = /^You move to (.+)$/.exec(t))) return `${v(st, ['You make your way to', 'You pick your way to', 'You travel on to'], 1)} ${m[1]}.`;
        if (/^You fail to hide/.test(t)) return v(st, ['You try to slip out of sight, but you are seen.', 'You look for cover and do not find it.']);
        if (/^You are already hidden/.test(t)) return v(st, ['You stay out of sight.', 'You keep still and unseen.']);
        if (/^You hide/.test(t)) return v(st, ['You melt out of sight.', 'You find cover and stay quiet.', 'You vanish into the surroundings.'], 2);
        if (/^You have nothing to rest/.test(t)) return 'You are well, and there is nothing to rest.';
        if (/^You rest/.test(t)) return t.replace(/^You rest \(?/, 'You rest: ').replace(/\)$/, '') + '.';
        if ((m = /^Loot \([\d+]+\) at (.+?): you take the (.+)$/.exec(t))) return `You reach into the ${m[1]} and draw out the ${m[2]}.`;
        if ((m = /^Loot \([\d+]+\) at (.+?): nothing at that depth$/.exec(t))) return `Your hand closes on nothing in the ${m[1]}.`;
        if ((m = /^Loot \([\d+]+\) at (.+?): (.+?)! Cursed with (\w+)\.?(.*)$/.exec(t))) return `The ${m[1]} gives up the ${m[2]}, and a curse comes with it: ${m[3]}.${m[4] ? ' ' + m[4].trim().replace(/^You find (\d+) gold\./, 'Gold glints within: $1.').replace('You keep: ', 'You keep ') : ''}`;
        if ((m = /^You discover a site here: (.+)$/.exec(t))) return `A hidden place shows itself: the ${m[1]}.`;
        if (/^You do nothing/.test(t)) return 'You let the time pass.';
        return `${t}.`;
    },
});

const num = n => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] ?? String(n);
