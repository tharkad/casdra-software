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
        if (/^You rest/.test(t)) return t.replace(/^You rest \(?/, 'You rest').replace(/\)$/, '') + '.';
        if ((m = /^Loot \([\d+]+\) at (.+?): you take the (.+)$/.exec(t))) return `You reach into the ${m[1]} and draw out the ${m[2]}.`;
        if ((m = /^Loot \([\d+]+\) at (.+?): nothing at that depth$/.exec(t))) return `Your hand closes on nothing in the ${m[1]}.`;
        if ((m = /^Loot \([\d+]+\) at (.+?): (.+?)! Cursed with (\w+)\.?(.*)$/.exec(t))) return `The ${m[1]} gives up the ${m[2]}, and a curse comes with it: ${m[3]}.${m[4] ? ' ' + m[4].trim().replace(/^You find (\d+) gold\./, 'Gold glints within: $1.').replace('You keep: ', 'You keep ') : ''}`;
        if ((m = /^You discover a site here: (.+)$/.exec(t))) return `A hidden place shows itself: the ${m[1]}.`;
        if (/^You do nothing/.test(t)) return 'You let the time pass.';
        return `${t}.`;
    },
});


// ---- a round of combat told in a few sentences (the full lines stay behind it, step by step) ----
const num = n => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] ?? String(n);
export function roundSynopsis(events) {
    const L = (events ?? []).map(e => String(e).trim()).filter(Boolean);
    if (!L.length) return '';
    const m = (re, from = L) => from.map(l => re.exec(l)).filter(Boolean);
    const strikeRe = /^(?:The |the )?(.+?)(?:'s) (?:thrust|swing|smash|bite|club|claw|blow|sting|attack|strike)s? (glances off|thuds against|bites into|hammers|crashes down on) /i;
    const lines = {
        killed: m(/^Your (.+?) (?:cleaves|strikes down|cuts down|brings down|drops) the (.+?), which /),
        felled: m(/ (?:dies|falls|is slain|is struck down)\b/i),
        found: m(/^Your (?:.+? (?:thrusts|swings|smashes down)|arrow flies|bolt flies|stone flies) at the (.+?) and finds it there/),
        quicker: m(/^The (.+?) twists into .+?, but your .+? is quicker/),
        missed: m(/^Your (?:.+? (?:thrusts|swings|smashes down)|arrow flies|bolt flies|stone flies) at empty air: the (.+?) is in /),
        tough: m(/^Your (.+?) (?:bites|strikes) the (.+?), but harm (\w) cannot fell it \(vulnerability (\w)\)(; the shot (?:lost its sting|bit deeper than it looked))?/),
        spell: m(/^(?:You cast|Your (?:Stones Fly|Fiery Blast|Lightning Bolt|Make Whole)|.+?: .*(?:hit|hits|miss)\b)/),
        landed: m(strikeRe),
        avoided: m(/ misses: your .+? carries you clear/),
        destroyed: m(/^Your (.+?) is destroyed/),
        damaged: m(/^Your (.+?) (?:is dented and damaged|takes the blow and is damaged)/),
        wounds: m(/^(?:The blow gets through: a wound|You are wounded)\b/),
        ran: m(/You break away and flee/),
        ended: m(/(?:fighting dies down|draw back|The last foe falls|Nothing hostile is left)/),
    };
    const out = [];
    // what you did
    if (lines.ran.length) out.push('You broke away and fled.');
    else if (lines.killed.length) {
        const [, how, who] = lines.killed[0], shot = ['arrow', 'bolt', 'stone'].includes(how);
        out.push(`${shot ? `Your ${how} brought down` : 'You cut down'} the ${who}${lines.killed.length > 1 ? ` and ${num(lines.killed.length - 1)} more` : ''}.`);
    } else if (lines.tough.length) {
        // it was hit, and that was not enough: say with what, how hard, and what it takes
        const [, how, who, harm, need, sting] = lines.tough[0], shot = ['arrow', 'bolt', 'stone'].includes(how);
        const WORD = { N: 'Negligible', L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };
        out.push(`${shot ? `Your ${how} struck` : 'Your blow bit'} the ${who}, but ${WORD[harm] ?? harm} harm was not enough: it takes ${WORD[need] ?? need} to bring it down${sting ? (/lost/.test(sting) ? ', and the shot lost its sting on the way' : ', though the shot bit deeper than it looked') : ''}.`);
    } else if (lines.found.length || lines.quicker.length) out.push(`Your ${lines.found.length && /^Your (arrow|bolt|stone)/.test(L.find(l => /finds it there/.test(l)) ?? '') ? 'shot' : 'blow'} found the ${(lines.found[0] ?? lines.quicker[0])[1]}.`);
    else if (lines.missed.length) out.push(`You struck at empty air: the ${lines.missed[0][1]} was too quick to catch.`);
    // what came back
    const hit = lines.landed.length, wounds = lines.wounds.length;
    if (hit) {
        const gear = [...lines.destroyed.map(x => `your ${x[1]} was destroyed`), ...lines.damaged.map(x => `your ${x[1]} was damaged`)];
        out.push(`${hit === 1 ? 'One blow' : `${num(hit)[0].toUpperCase()}${num(hit).slice(1)} blows`} came back at you${gear.length ? `: ${gear.join(', ').replace(/, ([^,]+)$/, ' and $1')}` : ''}${wounds ? ` ${gear.length ? 'and' : '—'} you took ${num(wounds)} wound${wounds === 1 ? '' : 's'}` : ''}.`.replace(/ — you took/, ', and you took'));
    } else if (lines.avoided.length) out.push('Every blow missed you.');
    if (lines.ended.length && !out.length) out.push('The fighting died down.');
    return out.join(' ');
}

// ---- a roll in the story voice: { title, line } for the dice tray and every box that describes a roll; the exact words stay as they were ("Detail") ----
const EVENING = [
    [/^Friendly: /, 'Friends here. No blades will be drawn.'], [/^Wary: /, 'Wary eyes, but no blades.'], [/^Cool: /, 'A cool stare. No blades drawn.'],
    [/^Cold, but/, 'A cold silence. They let you be.'], [/^Glad of you/, 'They greet you gladly. No blades.'], [/^They want nothing/, 'They turn away: no blades, no words.'],
    [/^A chance to win/, 'A chance to win them over.'], [/^The talk turns sour/, 'The mood sours.'],
    [/^They insult you: pay (\d+) (\w+)/, (m) => `An insult hangs in the air. Pay ${m[1]} ${m[2]}, or draw steel.`],
    [/^They challenge you: pay (\d+) (\w+)/, (m) => `A challenge is thrown down. Pay ${m[1]} ${m[2]}, or fight.`], [/^They attack/, 'Steel is drawn. They attack!'],
];
const TRADE = [
    [/^A warm welcome/, 'A warm welcome: a fair price.'], [/^A guarded welcome/, 'Guarded, but willing: a price is named.'], [/^A cold welcome/, 'Grudging: they will deal, at a premium.'],
    [/^A very cold welcome/, 'Cold: they will deal, but dearly.'], [/^They are glad of you/, 'Glad of you: they offer a favour.'], [/^They have no wish/, 'They turn their backs. No deal.'],
    [/^A chance to win/, 'Your words land: they hear you out again.'], [/^The talk turns sour/, 'The talk sours. They hear you out, grudgingly.'],
    [/^They insult you/, 'An insult.'], [/^They challenge you/, 'A challenge.'], [/^They bar your way/, 'They bar the way, blades out.'],
];
const SEARCH = {
    'Peer': { 'Nothing': 'You watch. Nothing stirs.', 'Hidden enemies': 'You see them: hidden watchers revealed.', 'Hidden enemies and Paths': 'Watchers and secret ways lie open to you.', 'Paths': 'A hidden way shows itself.' },
    'Locate': { 'Nothing': 'You search the stones. Nothing.', 'Discover chits': 'Something is here, and you have found it.', 'Passages and Clues': 'Hidden ways whisper their secrets.', 'Choice': 'The signs point more than one way.' },
};
const pick = (list, text) => { for (const [re, to] of list) { const m = re.exec(text); if (m) return typeof to === 'function' ? to(m) : to; } return null; };
export function narrateRoll(r) {
    const w = r.what ?? '', res = r.result ?? '';
    let m;
    if ((m = /^Evening meeting with the ([^:]+)/.exec(w))) return { title: `The ${m[1]}`, line: pick(EVENING, res) ?? res };
    if ((m = /^Meeting roll: (?:buying from|repaying|hiring from|buying drinks for) the ([^:]+)/.exec(w)) || (m = /^Meeting roll: .* the ([^:]+)/.exec(w))) return { title: `The ${m[1]}`, line: pick(TRADE, res) ?? res };
    if (w === 'Hide') return { title: 'Hiding', line: /seen/i.test(res) ? 'Eyes find you. There is no cover.' : 'You slip out of sight.' };
    if (w === 'Monster roll') { const row = /row (\d)/.exec(res)?.[1]; return { title: 'The wilds', line: r.tale ?? (row ? 'Something stirs in the wilds.' : res) }; }
    if (/^Repositioning roll/.test(w)) return { title: 'The melee', line: /shuffle/.test(res) ? 'The creatures circle and trade places.' : 'Nothing shifts.' };
    if ((m = /^Tactics roll \((\w+) box\)/.exec(w))) return { title: `The ${m[1]} box`, line: /switch sides/.test(res) ? 'A snarl, a twist: they change their stance.' : 'They hold their stance.' };
    if (/missile roll/.test(w)) { const d = /([+-])(\d)/.exec(res); const who = /^Your/.test(w) ? 'Your shot' : 'The shot'; return { title: /^Your/.test(w) ? 'Your shot' : 'Their shot', line: !d ? res : d[1] === '+' ? `${who} bites deeper than it looked.` : `${who} loses its sting.` }; }
    if ((m = /^Search: (Peer|Locate)$/.exec(w))) return { title: m[1] === 'Peer' ? 'Peering' : 'Searching', line: SEARCH[m[1]][res] ?? res };
    if (/^Search: Read runes/.test(w)) return { title: 'The runes', line: /Learn and awaken/.test(res) ? 'The runes yield their secret: a spell, yours to learn.' : /Awaken/.test(res) ? 'The runes stir: you may look, no more.' : /Curse/.test(res) ? 'The runes bite back.' : 'The runes stay silent.' };
    if (w === 'Curse') return { title: 'A curse', line: `A curse takes hold: ${res}.` };
    if (/^Power of the Pit/.test(w)) return { title: 'The Pit', line: `From the Pit: ${res}.` };
    return null;
}
