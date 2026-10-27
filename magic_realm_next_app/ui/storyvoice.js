// The Story voice for every line of the log and every roll the engine wrote WITHOUT a story of its own (or with a story that is only the plain words again).
// Pure and UI-side: the engine's logged text is part of saved state, so nothing here changes it; the Detail line is always the entry's own `t`.
//
//   storyLine(entry, st?)      the Story sentence for a log entry or roll record, or null when the entry already carries a real story (`s`)
//   lineFor(entry, voice, st?) the line to show in 'story' or 'detail' (Detail is exactly `entry.t`; a table line's `p` wins in both, as logText always did)
//   storyRoll(roll, st?)       { title, line } for a roll record (the dice tray), the engine's narrateRoll first, then the rolls it has no branch for
//   hasRealStory(entry)        true when `entry.s` is real prose (not the plain words with a full stop, not a rule or a dice digit in disguise)
//
// Every choice among variants is a hash of the entry itself (day, text, roll number), never Math.random: the same line always reads the same, everywhere.
// Rules for what is written here (docs/design/DESIGN-TASTE.md section 5): short, concrete, a living world; no percentages, no "row N", no dice digits or
// "(2+3)", no rules text, no "You:" lines; a number appears only where it is the news (gold, days, a clearing's name).
import { narrateRoll, tell } from '../engine/story.js';

// ---------------------------------------------------------------- small tools
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// (a line and its "Phase N:" twin share one seed, so the loot line and the phase line of an event read the same and a screen can show one of them)
const seedOf = e => `${e.day ?? 0}|${e.t != null ? bareT(e.t) : `${e.n ?? ''}|${e.what}|${(e.dice ?? []).join('+')}|${e.value ?? ''}`}`;
const bareT = t => String(t ?? '').replace(/^Phase \d+: /, '').trim();
const pickV = (e, list, salt = '') => (Array.isArray(list) ? list[hash(seedOf(e) + salt) % list.length] : list);
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const low = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const stop = s => (/[.!?]$/.test(s) ? s : `${s}.`);
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const numWord = n => NUM[n] ?? String(n);
const bare = t => String(t ?? '').replace(/^Phase \d+: /, '').trim();
const noHash = s => String(s).replace(/ #\d+/g, '');
const typeOf = label => (/^(Move|Fight|Magic|Duck|Berserk)/.exec(label) ?? [])[1] ?? 'action';
const lc = s => (s ?? '').toLowerCase();
const plural = n => (/wolf$/i.test(n) ? n.replace(/wolf$/i, 'Wolves') : /(?:ch|sh|x|s)$/i.test(n) ? `${n}es` : `${n}s`);
// "Heavy Troll, Heavy Troll, Ogre" -> { text: 'two Heavy Trolls and an Ogre', many: true }
export function crowd(list) {
    const names = (Array.isArray(list) ? list : String(list).split(/,\s*/)).map(n => noHash(n).trim()).filter(Boolean);
    const count = new Map(); for (const n of names) count.set(n, (count.get(n) ?? 0) + 1);
    const parts = [...count].map(([n, k]) => (k === 1 ? `${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${n}` : `${numWord(k)} ${plural(n)}`));
    const text = parts.length <= 1 ? (parts[0] ?? 'something') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    return { text, many: names.length > 1 || parts.length > 1 };
}
const place = n => String(n).replace(/^the (?!things)/i, '');
const list = a => (a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

// ---------------------------------------------------------------- is the engine's `s` real prose?
// Phase lines carry an `s` for every line, but for most results it is only the plain words again ("Locate (5+6): Nothing. You find nothing."), the rest line
// with its chit code ("You rest: rest Move L3*."), or a dice digit in parentheses. Those are not stories.
const LOOTY = /^(?:Loot|Magic Sight) \(|^(?:You read the runes of|You open the Chest|The .+'s goods are left)/;
const WEAK_S = /\btime \d|\d+ against your \d+|Blows in order|next round its attack time|\(\d[\d+]*\)|\brolled\b|had to leave behind|\bType [IVX]+\b|not modelled|into the things on the ground|\bPhase \d|\brow \d|%|Its goods lie|\bNaN\b|\bundefined\b|\bnull\b/;
export function hasRealStory(e) {
    if (!e || !e.s) return false;
    if (LOOTY.test(bare(e.t ?? ''))) return false;                                  // (loot lines and their phase lines must read alike, so both come from here)
    const plainT = stop(bare(e.t ?? '').replace(/ \(rolled [^)]*\)/, ''));
    if (e.s === plainT || stop(e.s) === stop(bare(e.t ?? ''))) return false;
    if (/^You rest: /.test(e.s)) return false;
    if (WEAK_S.test(e.s)) return false;
    if (/^(?:Loot|Magic Sight) \(/.test(bare(e.t ?? '')) && /Cursed with/.test(e.t)) return false;
    return true;
}

// ---------------------------------------------------------------- curses and spells (the sentence each one is told in)
export const CURSE_STORY = {
    Eyemist: 'A mist settles over your eyes: you cannot search.',
    Squeak: 'Every step you take squeaks: there is no hiding now.',
    Wither: 'A withering chill saps you: your strongest efforts leave you spent.',
    'Ill Health': 'Sickness takes hold: you cannot rest it off.',
    Ashes: 'Your gold turns to ash: you may add to it, but never spend it.',
    Disgust: 'Your good name sours: Fame can be won, but never spent.',
};
const curseTale = n => CURSE_STORY[n] ?? `A curse takes hold: ${n}.`;
const SPELL_NAMES = new Set(['Exorcise', 'Make Whole', 'Peace', 'Small Blessing', 'Blend Into Background', 'Fog', 'Prophecy', 'Stones Fly', 'Talk to Wise Bird', "Witch's Brew", 'Elven Grace', 'Faerie Lights', 'Illusion', 'Lost',
    'Persuade', 'See Hidden Signs', 'Blazing Light', 'Elemental Spirit', 'Fiery Blast', 'Hurricane Winds', 'Lightning Bolt', 'Roof Collapses', 'Violent Storm', 'Absorb Essence', 'Ask Demon', 'Broomstick', 'Curse', 'Pentangle',
    'Power of the Pit', 'Dissolve Spell', 'Enchant Artifact', 'Melt into Mist', 'Phantasm', 'Transform', 'Unleash Power', 'World Fades', 'Control Bats', 'Peace with Nature', 'Premonition', 'Protection from Magic',
    'Sense Danger', 'Bad Luck', 'Deal with Goblins', 'Guide Spider or Octopus', 'Poison', 'Remedy', 'Whistle for Monsters', 'Health', 'Strength', 'Vision']);
const SPELL_TALE = {
    Prophecy: ['Tomorrow is yours to choose, phase by phase.', 'You will see tomorrow coming, and choose as you go.'],
    Phantasm: ['A second self will walk beside you tomorrow.', 'A phantom of you will wake at dawn.'],
    'World Fades': ['The world thins around you.', 'You may slip from sight whenever the fighting pauses.'],
    'Enchant Artifact': ['The charm sinks into the artifact and stays.', 'Power seeps into the artifact.'],
    'Protection from Magic': ['You are armoured against the spell-craft of others.', 'Protection from Magic stands ready.'],
    Pentangle: ['A pentangle flares: no demon or spell can touch you.', 'Chalk-white fire rings you round against the Pit.'],
    'Bad Luck': ['Bad luck settles on the target like a cloak.', 'Misfortune finds its mark.'],
    'Blend Into Background': ['Tomorrow you will fade into the background, with an extra phase to do it.', 'You grow quiet as the walls.'],
    'Elven Grace': ['Your feet grow quick and light.', 'The grace of the elves is in your stride.'],
    'Unleash Power': ['A Magic chit is pure muscle until sunset tomorrow.', 'Raw power runs into your arm.'],
    'Peace with Nature': ['The woods stay quiet around you.', 'The sleepers in the wood keep their silence.'],
    Premonition: ['You will choose when to take tomorrow\'s turn.', 'You see which way tomorrow leans.'],
    Fog: ['A thick fog settles over the whole tile.', 'The tile drowns in fog.'],
    'Violent Storm': ['A tempest breaks over the tile.', 'The sky tears open over the tile.'],
    Broomstick: ['A broomstick waits at your hand, ready to fly.', 'You hold a broomstick, light as a thought.'],
    'Melt into Mist': ['You thin to mist: nothing can touch you, and you can touch nothing.', 'You drift apart into mist.'],
    Poison: ['Poison beads along your blade.', 'Your blade drips with poison.'],
    Persuade: ['A hush settles over them: they will not fight today.', 'Your words work: they stand down.'],
    Peace: ['A hush falls over the clearing.', 'The fighting has gone out of them.'],
    'Control Bats': ['The bats bend to your will.', 'The bats wheel to your call.'],
    'Whistle for Monsters': ['You whistle up what lurks in the wild.', 'Something answers your whistle.'],
    Curse: ['A curse is on its way.', 'You speak the curse.'],
    Exorcise: ['The rite rings out.', 'Bell, book and candle.'],
    Remedy: ['The remedy takes.', 'A cure is worked.'],
};
const spellTale = (e, n) => pickV(e, SPELL_TALE[n] ?? [`${n} takes hold.`, `${n} is at work.`]);

// ---------------------------------------------------------------- the rules
// Each rule: [pattern on the line without its "Phase N:" prefix, builder(match, entry) -> string or an array of variants].
const R = [];
const rule = (re, fn) => R.push([re, fn]);

// ---- moving
rule(/^You move to (.+?)\. You had to leave behind: (.+?)\.$/, (m) => { const left = list(m[2].split(/,\s*/).map(x => `the ${x}`)); return [`You make your way to ${m[1]}, leaving ${left} behind.`, `You reach ${m[1]}. You had to leave ${left} behind.`]; });
rule(/^You move to ([^.]+?)\.?$/, m => [`You make your way to ${m[1]}.`, `You pick your way to ${m[1]}.`, `You travel on to ${m[1]}.`]);
rule(/^You (?:start|begin) the climb toward (.+?)(?: \(mountains take two Move phases\))?\.?$/, m => [`You start up toward ${m[1]}. The slope will take another phase.`, `The way to ${m[1]} is steep. You begin the climb.`]);
rule(/^There is no road from here to (.+?): the move is lost\.?$/, m => [`No road runs from here to ${m[1]}. The step is wasted.`, `You look for a way to ${m[1]} and find none.`]);
rule(/^You do not know the way to (.+?): the move is lost\.?$/, m => `You do not know the way to ${m[1]}, and the time slips by.`);
rule(/^You cannot reach that from the road/, () => 'From the road you can only go on or turn back.');
rule(/^You are still on the road and cannot do that/, () => ['You are still out on the road: that will have to wait.', 'The road is no place for that. It will have to wait.']);
rule(/^You cannot enter a cave in a sunlight phase/, () => 'The caves are closed to you while the sun is up.');
rule(/^Lost: you wander in circles/, () => ['Lost, you wander in circles and get nowhere.', 'Every path looks the same. The move comes to nothing.']);
rule(/^Your horse cannot go into the caves/, () => 'Your horse will not follow you underground. It waits outside.');
rule(/^As mist you can only move and hide/, () => 'As mist you can do little but drift and hide.');
rule(/^You land in a cave, where there is no sunlight/, () => 'You come down in a cave, where the sun cannot follow. The day is over for you.');
rule(/^You have left the Blazing Light behind/, () => 'The Blazing Light burns far behind you. That hour is gone.');
rule(/^The Shielded Lantern's phase needs a cave/, () => 'The lantern needs a cave to burn in. The hour is lost.');
// ---- the day rulings of chapter 7 (R2, R3): an extra phase whose horse or card was not on, the rest that takes the place of a phase when every chit is spent
rule(/^What gives you this extra (\w+) phase \(a horse or a treasure\) was not active when the phase began: the phase is lost\.?$/, () => ['What would have given you this extra hour was not ready when it began. That hour is lost.', 'You did not have what grants this extra hour at hand when it came. That hour is lost.']);
rule(/^Every chit of yours is fatigued, wounded or committed to a spell: you can only rest, and this phase is for one activity only, so it is lost\.?$/, () => ['You are too spent to do anything but rest, and this hour was meant for something else. It slips away.', 'Every chit is spent. This hour could not be used to rest, so it is lost.']);
rule(/^Every chit of yours is fatigued, wounded or committed to a spell: you can only rest, and your recorded activity is cancelled\.?$/, () => ['You are too spent for what you planned. All you can do is rest.', 'Every chit is spent. What you planned for this hour gives way to rest.']);
rule(/^(?:You can only rest, and you cannot: you die|Every chit is spent and you cannot rest: you die)\.?$/, () => ['You are spent and cannot even rest. You die.', 'There is nothing left in you, and no rest to be had. You die.']);
rule(/^(.+?)'s magic kills you\.?$/, m => [`${m[1]}'s magic strikes you down.`, `${m[1]}'s spell is the end of you.`]);
rule(/^Nothing happens\.?$/, () => ['Nothing comes of it.', 'Nothing happens, and the hour goes by.']);
rule(/^You do nothing\.?$/, () => ['You let the time pass.', 'You let the hour go by.']);

// ---- hiding, resting, alerting, enchanting
rule(/^You hide( \(rolled .*\))?\.?$/, () => ['You melt out of sight.', 'You find cover and stay quiet.', 'You vanish into the surroundings.']);
rule(/^You fail to hide/, () => ['You try to slip out of sight, but you are seen.', 'You look for cover and do not find it.']);
rule(/^You are already hidden/, () => ['You stay out of sight.', 'You keep still and unseen.']);
rule(/^The Squeak curse betrays you: you cannot hide/, () => ['Every step squeaks. There is no hiding with that curse.', 'The curse squeals at your every move. You cannot hide.']);
rule(/^Ill Health: you cannot rest/, () => ['Sickness has you by the throat. There is no resting it off.', 'You lie down, but the sickness will not let you rest.']);
rule(/^You have nothing to rest/, () => 'You are well, and there is nothing to rest.');
rule(/^You rest \((rest|heal) ((?:Move|Fight|Magic|Duck|Berserk) \S+)( to fatigued)?(?:, fatiguing ((?:Move|Fight|Magic|Duck|Berserk) \S+) for change)?\)\.?$/, (m) => {
    const t = typeOf(m[2]), pay = m[4] ? typeOf(m[4]) : null;
    const lead = m[1] === 'rest'
        ? [`You catch your breath. Your ${t} chit is ready again.`, `A little rest, and your ${t} chit answers again.`, `You sit a while, and your ${t} chit comes back to you.`]
        : m[3]
            ? [`You tend a wounded ${t} chit. It mends, but tired.`, `You bind up the hurt in your ${t} chit. It will serve again, weary.`]
            : [`You tend a wounded ${t} chit. It is whole again.`, `You bind the hurt in your ${t} chit. It is whole.`];
    return pay ? lead.map(s => `${s} Another ${pay} chit tires in its place.`) : lead;
});
rule(/^You ready your (.+?)\.?$/, m => [`The ${m[1]} is in your hand and ready.`, `You settle your grip on the ${m[1]}.`, `You ready the ${m[1]}.`]);
rule(/^Your (.+?) is a weapon card: it cannot be alerted/, m => [`Your ${m[1]} is a card: it is always ready.`, `The ${m[1]} needs no readying. A card is always ready.`]);
rule(/^The (.+?) gives you an extra phase you have recorded: you cannot abandon, sell or hand it over until that phase is finished/, () => ['You need it for an extra phase you recorded.', 'It is bound to an extra phase you recorded.']);
rule(/^Your (.+?) is already alerted/, m => [`The ${m[1]} is ready already.`, `Your ${m[1]} is already in hand and waiting.`]);
rule(/^You have no weapon to ready/, () => ['You have nothing in hand to ready.', 'There is no weapon to ready.']);
rule(/^You alert Magic (\S+): it will act at time 0 until Midnight/, () => ['You ready a Magic chit. It will answer before anything else until midnight.', 'A Magic chit hums, ready to act first until midnight.']);
rule(/^Magic (\S+) is already alerted/, () => 'That Magic chit is ready already.');
rule(/^That Magic chit is not ready/, () => 'That Magic chit is too tired to wake.');
rule(/^(?:A creature has no Magic chit to alert|There is no such Magic chit to alert)/, () => 'There is no Magic chit to ready.');
rule(/^You turn your (.+?) alerted\.?$/, m => [`You raise the ${m[1]}.`, `The ${m[1]} comes up, ready.`]);
rule(/^You turn your (.+?) unalerted\.?$/, m => [`You lower the ${m[1]}.`, `The ${m[1]} comes down.`]);
rule(/^You meditate and gather your power/, () => ['You gather your power. Shaping it will take one more phase.', 'Power builds in you. One more phase, and it takes form.']);
rule(/^You have no ready Magic chit of Type [IVX]+ to [IVX]+ to enchant/, () => 'You have no power to spare for enchanting.');
rule(/^You enchant your Magic (\S+): it now holds (\w+) magic until you play it/, m => [`A Magic chit fills with ${m[2]} magic, kept until you play it.`, `${m[2]} magic gathers in a chit of yours and waits.`]);
rule(/^You enchant the tile with (\w+) magic: (.+?) is turned to its (\w+) side/, m => [`${m[1]} magic floods ${m[2]}. The land turns over.`, `You pour ${low(m[1])} magic into ${m[2]}, and the tile turns.`]);

// ---- searching: Peer, Locate, Magic Sight (the sentence the dice tray uses, then what the search actually turned up)
const SEARCH_BASE = {
    Peer: { Nothing: 'You watch. Nothing stirs.', 'Hidden enemies': 'You see them: hidden watchers revealed.', 'Hidden enemies and Paths': 'Watchers and secret ways lie open to you.', Paths: 'A hidden way shows itself.',
        Clues: 'The signs here read clear to you.', 'Clues and Paths': 'The signs read clear, and a hidden way shows itself.', Choice: 'The signs point more than one way.' },
    Locate: { Nothing: 'You search the stones. Nothing.', 'Discover chits': 'Something is here, and you have found it.', 'Passages and Clues': 'Hidden ways whisper their secrets.', Passages: 'A secret way opens before you.',
        Clues: 'The signs here read clear to you.', Choice: 'The signs point more than one way.' },
};
SEARCH_BASE['Magic Sight'] = { ...SEARCH_BASE.Peer, ...SEARCH_BASE.Locate, Nothing: 'Your sight sweeps the clearing and finds nothing.', 'Discover chits': 'Your sight finds something hidden here.' };
const searchTale = (e, table, res, tail = '') => {
    // with the line's own tail (the phase line) the sentence says what the search really turned up; without it, what the table result promises
    const hasTail = tail !== null && tail !== undefined && tail !== '';
    if (!hasTail) {
        if (/Discover chits/.test(res) && table !== 'Locate') return SEARCH_BASE[table]?.['Discover chits'] ?? 'Something is here, and you have found it.';
        return SEARCH_BASE[table]?.[res] ?? stop(cap([/Hidden enemies/.test(res) && 'hidden watchers show themselves', /Clues/.test(res) && 'the signs speak to you', /Paths|Passages/.test(res) && 'a hidden way stirs'].filter(Boolean).join(', and ')) || 'You find nothing new');
    }
    const out = [];
    if (/Hidden enemies/.test(res)) out.push(pickV(e, ['Hidden watchers show themselves.', 'You spot what was hiding here.']));
    const n = /learn what the (\d+) unrevealed chit/.exec(tail);
    if (/Clues/.test(res) && n && +n[1] > 0) out.push(pickV(e, ['The signs here read clear to you.', 'You read the signs: you know what lurks here.']));
    for (const m of tail.matchAll(/You discover the hidden path to ([^.]+)\./g)) out.push(`A hidden path to ${m[1]} shows itself.`);
    for (const m of tail.matchAll(/You discover the secret passage to ([^.]+)\./g)) out.push(`A secret passage to ${m[1]} opens before you.`);
    const site = /You discover a site here: ([^.]+)\./.exec(tail);
    if (/Discover chits/.test(res)) out.push(site ? pickV(e, [`A hidden place shows itself: the ${site[1]}.`, `Something is here, and you have found it: the ${site[1]}.`]) : pickV(e, ['No hidden place is here.', 'Nothing is hidden in this clearing.']));
    if (res !== 'Nothing' && !out.length) return pickV(e, ['You study the signs, but there is nothing new to learn.', 'You look again. Nothing new shows itself.']);
    if (res === 'Nothing' || !out.length) return table === 'Peer' ? SEARCH_BASE.Peer.Nothing : table === 'Locate' ? SEARCH_BASE.Locate.Nothing : SEARCH_BASE['Magic Sight'].Nothing;
    return out.join(' ');
};
rule(/^(Peer|Locate) \([\d+]+\): ([^.]+)\.(?: (.*))?$/, (m, e) => searchTale(e, m[1], m[2], m[3] ?? ''));
rule(/^Magic Sight \([\d+]*\):? (?:nothing|Nothing)\.?$/, () => ['Your sight sweeps the clearing and finds nothing.', 'The Sight shows you only an empty clearing.']);
rule(/^Magic Sight \([\d+]*\):? ([A-Z][^.]*)\.(?: (.*))?$/, (m, e) => searchTale(e, 'Magic Sight', m[1], m[2] ?? ''));
rule(/^Magic Sight \([\d+]*\):? no treasure card lies/, () => 'No treasure shows itself to your sight.');
rule(/^Magic Sight \([\d+]*\):? no counter lies/, () => 'No gear shows itself to your sight.');
rule(/^Magic Sight \([\d+]*\):? you perceive no spell cards/, () => 'Your sight finds no spell to read here.');
rule(/^Magic Sight \([\d+]*\):? you perceive the spells of (.+?): .*? You cannot learn any of them\.?$/, m => `Your sight reads the spells in ${m[1]}, but none is yours to learn.`);
rule(/^Magic Sight \([\d+]*\):? you perceive the spells of (.+?): .*?(?:you|You) learn (.+?) \(Type [IVX]+(?:, [^)]*)?\)\.?$/, m => `Your sight reads the spells in ${m[1]}, and you learn ${m[2]}.`);
rule(/^Magic Sight \([\d+]*\):? you perceive the spells of (.+?): .*?(?:you|You) look at (.+?) \(Type [IVX]+\) and leave it\.?$/, m => `Your sight reads the spells in ${m[1]}. You study ${m[2]} and leave it.`);
rule(/^Magic Sight \([\d+]*\):? you perceive the spells of (.+?):/, m => `Your sight reads the spells in ${m[1]}.`);
rule(/^Fog hangs over this tile/, () => ['Fog hides the tile: there is nothing to see.', 'You peer into the fog and see nothing at all.']);
rule(/^The Eyemist curse blinds you: you cannot search/, () => 'A mist clouds your eyes. You cannot search.');
rule(/^The Cairns demand an asterisk/, () => 'The Cairns ask for a strength you no longer have.');
rule(/^You are not using Magic Sight/, () => 'Your sight is not with you.');

// ---- runes
rule(/^You read the runes of (.+?) \([\d+]+\): nothing\.?$/, m => [`The runes of ${m[1]} say nothing.`, `You read the runes of ${m[1]}, and they stay silent.`]);
rule(/^You read the runes of (.+?) \([\d+]+\): a curse! (.+?)\.?$/, m => [`The runes of ${m[1]} bite back: ${curseTale(m[2])}`, `The runes turn on you. ${curseTale(m[2])}`]);
rule(/^You read the runes of (.+?) \([\d+]+\): you learn (.+?) \(Type [IVX]+[^)]*\)\.?$/, m => [`The runes of ${m[1]} give up their secret: you learn ${m[2]}.`, `You read the runes of ${m[1]}, and ${m[2]} is yours.`]);
rule(/^You read the runes of (.+?) \([\d+]+\): you look at (.+?) \(Type [IVX]+\) and leave it\.?$/, m => [`You study ${m[2]} in the runes of ${m[1]}, and leave it.`, `${cap(m[2])} is there in the runes of ${m[1]}. You leave it be.`]);
rule(/^You read the runes of (.+?) \([\d+]+\): (.+?) \(Type [IVX]+[^)]*\): you may only look at it\.?$/, m => [`The runes of ${m[1]} stir. You may look at ${m[2]}, no more.`, `${cap(m[2])} shows itself in the runes of ${m[1]}, but will not be learned.`]);
rule(/^You read the runes of (.+?) \([\d+]+\): (.+?) \(Type [IVX]+[^)]*\): you have no Type [IVX]+ Magic chit/, m => `${cap(m[2])} lies in the runes of ${m[1]}, but you have no chit that could hold it.`);
rule(/^You read the runes of (.+?) \([\d+]+\): (.+?) \(Type [IVX]+[^)]*\): you have already learned it/, m => `You know ${m[2]} already.`);
rule(/^You read the runes of (.+?) \([\d+]+\): the writing is smudged/, m => `The writing in ${m[1]} is too smudged to read.`);
rule(/^You read the runes of (.+?) \([\d+]+\): (.+)$/, m => `You read the runes of ${m[1]}.`);
rule(/^There is nothing here whose runes you can read/, () => 'There are no runes here to read.');
rule(/^You erase (.+?) from your sheet to make room/, m => `You rub ${m[1]} from your sheet to make room.`);

// ---- looting (the loot lines and the phase lines of the same event read alike, so the dock can show one)
rule(/^(?:Loot|Magic Sight) \([\d+]+\): there is nothing here to loot/, () => ['There is nothing to take here. No site has shown itself.', 'You scrabble in the dirt and come up empty. Find a site first.']);
rule(/^(?:Loot|Magic Sight) \([\d+]+\) at (.+?): nothing at that depth\.?$/, m => (m[1] === 'the things on the ground' ? ['Your hand closes on nothing among the scattered things.', 'You sift the ground and find nothing more.'] : [`Your hand closes on nothing in the ${place(m[1])}.`, `The ${place(m[1])} has nothing that deep.`, `You reach into the ${place(m[1])} and find only dust.`]));
rule(/^(?:Loot|Magic Sight) \([\d+]+\) at (.+?): you take the (.+?)\.?$/, m => (m[1] === 'the things on the ground'
    ? [`You pick the ${m[2]} from the things on the ground.`, `The ${m[2]} is yours, off the ground.`]
    : [`You reach into the ${place(m[1])} and draw out the ${m[2]}.`, `Your hand closes on the ${m[2]}.`, `You come away from the ${place(m[1])} with the ${m[2]}.`]));
rule(/^(?:Loot|Magic Sight) \([\d+]+\) at (.+?): (.+?)! Cursed with (\w[\w ]*?)\.(?: You find (\d+) gold\.)?(?: (.*))?$/, (m) => {
    const gold = m[4] ? ` Gold glints within: ${m[4]} pieces.` : '';
    const keep = /^You keep: (.+)\.$/.exec(m[5] ?? '');
    const more = `${gold}${keep ? ` You keep ${keep[1]}.` : ''}`;
    return [`The ${m[2]} comes out of the ${place(m[1])}, and a bad feeling with it: ${m[3]}.${more}`, `${m[2]}! It comes out of the ${place(m[1])} with a curse on it: ${m[3]}.${more}`];
});
rule(/^(?:Loot|Magic Sight) \([\d+]+\) at (.+?): you find the (.+?)\. You may now search it here with a Loot phase\.?$/, m => [`Under the ${place(m[1])} lies a place of its own: the ${m[2]}.`, `The ${place(m[1])} shows you the ${m[2]}. It can be searched here.`]);
rule(/^The Vault is sealed/, () => 'The Vault is sealed. Only great strength or the Lost Keys will open it.');
rule(/^You are too exhausted to wade into the Pool/, () => 'You are too spent to wade into the Pool.');
rule(/^You open the Chest: (.+?)\.?$/, m => `The Chest swings open: ${place(m[1])}.`);
rule(/^The (.+?)'s goods are left lying where their leader fell\.?$/, m => `${/s$/.test(m[1]) ? `The ${place(m[1])}'` : `The ${place(m[1])}'s`} goods lie where their leader fell.`);
rule(/^You tire ((?:Move|Fight|Magic|Duck|Berserk) \S+)( and bring back ((?:Move|Fight|Magic|Duck|Berserk) \S+) \(change\))?\.?$/, m => (m[3]
    ? [`You push on: a ${typeOf(m[1])} chit tires, and a ${typeOf(m[3])} chit comes back in its place.`, `You trade a tired chit for a fresh one to pay the toll.`]
    : [`You push on: a ${typeOf(m[1])} chit tires.`, `The effort costs you a ${typeOf(m[1])} chit.`]));
rule(/^You leave the (.+?) behind\.?$/, m => `You leave the ${place(m[1])} where it lies.`);
rule(/^You (activate|deactivate) the (.+?)\.?$/, m => (m[1] === 'activate' ? `You take up the ${m[2]}.` : `You put the ${m[2]} away.`));
// a site card (Treasure within Treasure) searched: "<Card> (4): You take the Devil Sword."
rule(/^(.+?) \([\d+]+\): the crypt is sealed/, m => `The ${place(m[1])} is sealed. Only great strength or the Lost Keys will open it.`);
rule(/^(.+?) \([\d+]+\): You take the (.+?)\.?$/, m => [`The ${place(m[1])} gives up the ${m[2]}.`, `Your hand closes on the ${m[2]} in the ${place(m[1])}.`]);
rule(/^(.+?) \([\d+]+\): A curse! (\w[\w ]*?)\.?$/, m => `The ${place(m[1])} turns on you. ${curseTale(m[2])}`);
rule(/^(.+?) \([\d+]+\): All your fatigue and wounds are gone/, m => `The ${place(m[1])} mends every hurt and weariness.`);
rule(/^(.+?) \([\d+]+\): You pocket a piece of gold/, m => `A single coin glints in the ${place(m[1])}. You pocket it.`);
rule(/^(.+?) \([\d+]+\): The Pit answers: (.+?)\.?$/, m => `The Pit answers from the ${place(m[1])}: ${m[2]}.`);
rule(/^(.+?) \([\d+]+\): (?:Nothing happens|Nothing is left)\.?$/, m => `The ${place(m[1])} has nothing more for you.`);
rule(/^(.+?) \([\d+]+\): The (.+?) (?:has already been taken|is gone)\.?$/, m => `The ${m[2]} has been taken already.`);
rule(/^(.+?) \([\d+]+\): (?:You feel a pull|You make a wish|Your sight)/, m => `The ${place(m[1])} stirs, and nothing more comes of it.`);
rule(/^The (.+?) is gone\.$/, m => `The ${place(m[1])} is gone.`);
rule(/^The (.+?) has already been taken\.$/, m => `The ${place(m[1])} has been taken already.`);
rule(/^The (.+?) is used up and returns to the (.+?)\.?$/, m => [`The ${place(m[1])} is spent. The ${m[2]} will have it back.`, `You use up the ${place(m[1])}.`]);

// ---- curses
rule(/^A curse falls on you: (\w[\w ]*?)\./, m => curseTale(m[1]));
rule(/^(?:You are|(.+?) is) shielded from magic: the (?:(\w[\w ]*?) )?curse (?:finds nothing to hold on to|has no hold)/, () => 'The curse finds nothing to hold: you are shielded from magic.');
rule(/^You already bear the (.+?) curse/, m => `The ${m[1]} curse is on you already.`);
rule(/^The Chapel lifts your curses/, () => ['The Chapel lifts your curses.', 'Prayer in the Chapel lifts every curse from you.']);
rule(/^Curse: (\w[\w ]*?) on you\.?$/, m => curseTale(m[1]));
rule(/^Curse: (\w[\w ]*?) on (.+?)\.?$/, m => `A curse falls on ${m[2]}: ${m[1]}.`);

// What a loot line says when the Found box beside it names the thing (QA-112): only the act. The box carries the name, so the headline does not say it twice. null when the line is not a loot of a thing.
export function lootActLine(entry) {
    const t = bare(entry?.t ?? '');
    let m = /^(?:Loot|Magic Sight) \([\d+]+\) at (.+?): you take the .+?\.?$/.exec(t);
    if (m) return m[1] === 'the things on the ground' ? pickV(entry, ['You sift through the things on the ground.', 'You turn over what lies about.']) : pickV(entry, [`You reach into the ${place(m[1])}.`, `You put your hand into the ${place(m[1])}.`, `You dig into the ${place(m[1])}.`]);
    m = /^(?:Loot|Magic Sight) \([\d+]+\) at (.+?): .+?! Cursed with (\w[\w ]*?)\./.exec(t);
    if (m) return `You reach into the ${place(m[1])}, and a bad feeling comes with what you draw: ${m[2]}.`;
    m = /^(.+?) \([\d+]+\): You take the .+?\.?$/.exec(t);
    if (m) return `You reach into the ${place(m[1])}.`;
    return null;
}

// ---- trade and hire
rule(/^No one here will trade with you/, () => ['Nobody here will deal with you.', 'Nobody here has a thing to trade with you.']);
rule(/^There is no one here to hire/, () => ['There is no one here to hire.', 'No one here is for hire.']);
rule(/^You decide not to hire anyone/, () => ['You think better of it and hire no one.', 'You keep your coin and hire no one.']);
rule(/^You decide not to trade with the (.+?)\.?$/, m => [`You walk away from the ${m[1]} without a deal.`, `You leave the ${m[1]} to their business.`]);
rule(/^You finish trading with the (.+?)\.?$/, m => [`You are done with the ${m[1]}.`, `You close your pack and leave the ${m[1]}.`]);
rule(/^The (.+?) (?:will not hire out|refuse to hire)\.?$/, m => `The ${m[1]} will not hire out to you.`);
rule(/^The (.+?) (?:refuse to sell|will not sell)\.?$/, m => [`The ${m[1]} turn their backs: nothing for sale.`, `The ${m[1]} will sell you nothing.`]);
rule(/^The (.+?) block you(?: \(.*\))?\.?$/, m => [`The ${m[1]} bar your way.`, `The ${m[1]} step in front of you.`]);
rule(/^You pay to smooth things over; the (.+?) will not deal/, m => `Your coin buys no goodwill: the ${m[1]} will not deal.`);
rule(/^You turn the offer down/, () => ['You turn the offer down.', 'You shake your head and turn it down.']);
rule(/^You hire (.+?) for (\d+) gold\.?$/, m => { const who = m[1].replace(/ (?=#?\d+$)/, '\u00A0'); return [`${who} takes your ${m[2]} gold and joins you.`, `${m[2]} gold, and ${who} is yours to command.`]; });          // (QA-115: a number that ends a name never wraps alone)
rule(/^You hire (.+?) of the (.+?) for (\d+) days, paying (\d+) gold\.?$/, m => [`${m[1]} of the ${m[2]} signs on for ${m[3]} days, ${m[4]} gold in hand.`, `${m[4]} gold buys you ${m[1]} for ${m[3]} days.`]);
rule(/^You hire (.+?) for (\d+) days, paying (\d+) gold\.?$/, m => `${cap(m[1])} bends to your will for ${m[2]} days.`);
rule(/^You extend the hire of (.+?) by (\d+) days, paying (\d+) gold\.?$/, m => `${cap(m[1])} stays on another ${m[2]} days for ${m[3]} gold.`);
rule(/^You extend the hire of (.+?) for (\d+) gold\.?$/, m => `${cap(m[1])} stays on for ${m[2]} gold.`);
rule(/^(.+?)'s term of hire ends\.?$/, m => [`${m[1]}'s time with you is up.`, `${m[1]} has served out the hire and goes.`]);
rule(/^(.+?) join you as a favour\./, m => `${cap(m[1])} join you as a favour. You owe them one.`);
rule(/^You sell the (.+?) to the (.+?) for (\d+) gold\.?$/, m => [`The ${m[2]} take your ${m[1]} for ${m[3]} gold.`, `The ${m[2]} pay ${m[3]} gold for your ${m[1]}.`]);
rule(/^You buy drinks for the (.+?) \((\d+) gold\): they warm to you\.?$/, m => [`A round for the ${m[1]}, ${m[2]} gold: they warm to you.`, `${m[2]} gold buys the ${m[1]} a round, and a kinder look.`]);
rule(/^No deal with the (.+?) \(.*\)\.?$/, m => [`The ${m[1]} will not deal.`, `The ${m[1]} shake their heads.`]);
rule(/^No deal: the (.+?) will not sell \(.*\)\.?$/, m => `The ${m[1]} turn you away.`);
rule(/^The (.+?) take offence and block you/, m => `You give offence, and the ${m[1]} bar your way.`);
rule(/^You refuse the (.+?): the (.+?) block you\.?$/, m => `You refuse, and the ${m[2]} bar your way.`);
rule(/^You refuse the challenge, so the (.+?) block you/, m => `You refuse the challenge, and the ${m[1]} bar your way.`);
rule(/^You buy the (.+?) from the (.+?) for (.+?)\.?$/, m => [`The ${m[2]} let the ${m[1]} go for ${m[3]}.`, `You buy the ${m[1]} from the ${m[2]}, ${m[3]} lighter.`]);
rule(/^You win back the (.+?)'s goodwill for (.+?)\.?$/, m => [`You win back the goodwill of the ${m[1]}, at a cost of ${m[2]}.`, `The ${m[1]} think better of you again, for ${m[2]}.`]);
rule(/^The (.+?) give you the (.+?) as a favour/, m => `The ${m[1]} hand you the ${m[2]} as a favour. You owe them.`);
rule(/^You turn down the (.+?)'s price: the lost level is gone for good/, m => `You turn down the ${m[1]} price. The lost goodwill stays lost.`);
rule(/^The (.+?) will not hear of it/, m => `The ${m[1]} will not hear of it.`);
rule(/^Your gold is worthless under the Ashes curse/, () => 'Your gold has turned to ash. Nobody will take it.');
rule(/^You (?:pay|paid) (\d+) (fame|notoriety) to avoid the (challenge|insult) from the (.+?)\.?$/, m => (m[3] === 'insult' ? `You swallow the insult from the ${m[4]} and pay ${m[1]} ${m[2]} to let it lie.` : `You pay ${m[1]} ${m[2]} to turn the ${m[4]}'s challenge aside.`));
rule(/^You let the natives be/, () => ['You leave the natives in peace.', 'You let the natives be.']);
rule(/^The (.+?) will fight you\.?$/, m => [`The ${m[1]} have settled on a fight.`, `The ${m[1]} want blood.`]);

// ---- flying
rule(/^You fly to the (.+?)\.(?: You had to leave behind: (.+?)\.)?$/, (m) => { const left = m[2] && list(m[2].split(/,\s*/).map(x => `the ${x}`)); return [`You rise and cross to the ${m[1]}.${left ? ` You leave ${left} behind.` : ''}`, `You take to the air toward the ${m[1]}.${left ? ` ${cap(left)} stays on the ground.` : ''}`]; });
rule(/^(?:You land|Landing) in (.+?)\.?$/, m => [`You come down in ${m[1]}.`, `The air sets you down in ${m[1]}.`]);
rule(/^That tile is too far away to fly to/, () => 'That tile is too far to reach on the wing. The hour is lost.');
rule(/^You have nothing to fly with/, () => 'You have nothing to fly with. The hour is lost.');
rule(/^You are too heavy to fly with that/, () => 'You are too heavy for that to carry you. The hour is lost.');
rule(/^You land among the (.+?) and are blocked before you can act\.?$/, m => `You come down among ${crowd(m[1]).text}. They are on you at once.`);

// ---- blocks, summons, discoveries
rule(/^Blocked by (.+?)! The rest of your turn is lost\.?$/, (m) => { const c = crowd(m[1]); return [`${cap(c.text)} ${c.many ? 'bar' : 'bars'} the way. The rest of the day is lost.`, `${cap(c.text)} ${c.many ? 'stop' : 'stops'} you cold. Your day ends here.`]; });
rule(/^(.+?) close in on you\.?$/, (m) => { const c = crowd(m[1]); return [`${cap(c.text)} ${c.many ? 'close' : 'closes'} in on you.`, `${cap(c.text)} ${c.many ? 'rush' : 'rushes'} you.`]; });
rule(/^You are stopped: the rest of your turn is lost/, () => ['Something stops you. The rest of the day is lost.', 'You are brought up short. The day is over for you.']);
rule(/^Your Prophecy is broken: you are stopped/, () => 'Your Prophecy breaks, and the day with it.');
rule(/^The Violent Storm batters you: (.*)$/, () => ['The storm batters you, and part of your day is lost.', 'Wind and rain tear at you. Some of the day is lost.']);
rule(/^Your control of the (.+?) ends(?: with the Sunset)?\.?$/, m => `The ${m[1]} slips your control.`);
rule(/^A warning chit turns up in the woods: (.+?)\.?$/, m => [`The woods carry a warning: ${m[1]}.`, `A sign in the woods: ${m[1]}.`]);
rule(/^A site is revealed in clearing (\d+): (.+?)\.?$/, m => [`A hidden place shows itself in clearing ${m[1]}: the ${m[2]}.`, `The ${m[2]} lies revealed in clearing ${m[1]}.`]);
rule(/^A site chit turns up: the (.+?) in clearing (\d+)\.?$/, m => `The ${m[1]} turns up in clearing ${m[2]}.`);
rule(/^You hear (.+?) from clearing (\d+)\.?$/, m => [`${m[1]} sounds from clearing ${m[2]}.`, `You hear ${m[1]} from clearing ${m[2]}.`]);
rule(/^A chit is revealed\.?$/, () => 'Something in the tile shows itself.');
rule(/^A (small|large) campfire burns in clearing (\d+)\.?$/, m => [`A ${m[1]} campfire burns in clearing ${m[2]}.`, `Smoke rises from a ${m[1]} campfire in clearing ${m[2]}.`]);
rule(/^The Lost (City|Castle) is revealed!?$/, m => `The Lost ${m[1]} lies revealed.`);
rule(/^Peace with Nature: you see the (.+?) chit, but it keeps quiet/, m => `Peace with Nature holds: the ${noHash(m[1]).replace(/ \d+$/, '')} keeps quiet.`);
rule(/^The (.+?) appear at the (.+?)\.?$/, (m) => (/campfire/i.test(m[2]) ? [`The ${m[1]} gather at the ${m[2].toLowerCase()}.`, `The ${m[1]} sit around the ${m[2].toLowerCase()}.`] : [`The ${m[1]} come out of the ${m[2]}.`, `The ${m[1]} gather at the ${m[2]}.`]));
// "Smoke summons dragon heavy to you."  (a chit calls its monsters, or its site)
const creatureOf = (label) => {
    const w = noHash(label).trim().split(/\s+/).filter(x => !/^\d+$/.test(x));
    if (w[0] === 'site') return { site: cap(w.slice(1).join(' ')) };
    const [fam, ...mods] = w, MOD = new Set(['heavy', 'tremendous', 'flying', 'winged', 'axe', 'spear', 'sword']);
    const ms = mods.filter(x => MOD.has(x)), ord = [...ms.filter(x => x === 'heavy' || x === 'tremendous'), ...ms.filter(x => x !== 'heavy' && x !== 'tremendous')];
    const text = [...ord, fam].join(' ');
    return { text, many: /s$/.test(fam) && !/ss$/.test(fam) || /^wolves$/.test(fam) };
};
rule(/^(.+?) summons (.+?) to (you|clearing (\d+))\.?$/, (m) => {
    const c = creatureOf(m[2]), chit = noHash(m[1]).replace(/ \d+$/, ''), here = m[3] === 'you';
    if (c.site) return here ? [`The ${c.site} lies revealed in your clearing.`, `Your clearing holds the ${c.site}.`] : [`The ${c.site} lies revealed in clearing ${m[4]}.`, `Clearing ${m[4]} gives up the ${c.site}.`];
    const art = c.many ? '' : `${/^[aeiou]/.test(c.text) ? 'an' : 'a'} `, verb = c.many ? 'come' : 'comes';
    return here ? [`${cap(chit)} stirs the wild: ${art}${c.text} ${verb} for you.`, `Something answers ${chit}: ${art}${c.text} ${verb} for you.`]
        : [`${cap(chit)} stirs the wild: ${art}${c.text} ${c.many ? 'wake' : 'wakes'} in clearing ${m[4]}.`, `Something answers ${chit}: ${art}${c.text} ${c.many ? 'stir' : 'stirs'} in clearing ${m[4]}.`];
});

// ---- the day itself
rule(/^Day (\d+) begins\.?$/, m => [`Day ${m[1]} begins.`, `Day ${m[1]} opens.`]);
rule(/^The sun sets\.?$/, () => ['The sun sets.', 'Dusk comes.']);
rule(/^A quiet evening\.?$/, () => ['A quiet evening: nothing stirs near you.', 'The evening is quiet. Nothing comes for you.']);
rule(/^(.+?) begins at the (.+?)\.?$/, m => [`${m[1]} sets out from the ${m[2]}.`, `${m[1]} starts the day at the ${m[2]}.`]);
rule(/^A new (.+?) arrives at the (.+?)\.?$/, m => `A new ${m[1]} walks into the ${m[2]}.`);
rule(/^(?:Your|(.+?)'s) adventure ends here\.?$/, m => (m[1] ? `${m[1]}'s tale ends here.` : ['Your tale ends here.', 'Your road ends here.']));
rule(/^The month ends\.?$/, () => ['The month is out.', 'The last day is behind you.']);
rule(/^Dawn of day (\d+)/, m => `Day ${m[1]} dawns.`);
rule(/^Regeneration: /, () => 'The week turns, and the wilds are called home.');
rule(/^The chits are drawn: (.+?)\.?$/, m => `The chits are drawn: ${m[1]}.`);
rule(/^Nobody has a chit to draw today/, () => 'Nobody has a chit to draw today.');
rule(/^(.+?)'s chit is drawn\.?$/, m => `${m[1]}'s turn comes round.`);
rule(/^You have died\.?$/, () => ['Your story ends here.', 'The light goes out of the day.']);
rule(/^Every action chit is wounded; you die\.?$/, () => 'Every chit lies wounded. You cannot go on.');
rule(/^(.+?) comes down in clearing (\d+) of the (.+?)\.?$/, m => `${m[1]} comes down in clearing ${m[2]} of the ${m[3]}.`);
rule(/^You flee along the road toward (.+?)\.?$/, m => [`You break away and run for ${m[1]}.`, `You flee down the road toward ${m[1]}.`]);
rule(/^You break away from the fight\.?$/, () => ['You break away from the fight.', 'You tear free and run.']);
rule(/^You make change for the extra asterisk: ((?:Move|Fight|Magic|Duck|Berserk) \S+) is ready again\.?$/, m => `You trade a tired chit for a fresh ${typeOf(m[1])} chit.`);

// ---- fighting, in the few places the day's story needs it (the fight itself is told by the engine's own Story lines)
// the few lines of a fight that carry numbers in their Story (the engine's `s` keeps "(3 against your 4)", "time 3, length 5"): told without them
rule(/^Order of blows \(.*?\): (.*)\.$/, (m) => { const who = m[1].split(/;\s*/).map(x => x.replace(/^\d+\.\s*/, '').replace(/\s*\((?:time|length)[^)]*\)/g, '').replace(/^the /, 'the ')); return [`The blows fall in turn: ${who.slice(0, 4).join(', then ')}${who.length > 4 ? ', and the rest' : ''}.`, `They strike in this order: ${who.slice(0, 4).join(', then ')}${who.length > 4 ? ', and the rest' : ''}.`]; });
rule(/^(.+?) gets under your maneuver \(its time \d+ beats your \d+\)\.?$/, m => [`The ${noHash(m[1])} gets under your guard.`, `Your guard is too slow: the ${noHash(m[1])} slips under it.`]);
rule(/^Only one blow can land this round: (.+?) \(time \d+(?:, length \d+)?\)\.?$/, m => `Only one blow lands: ${noHash(m[1])}.`);
rule(/^You: (Thrust|Swing|Smash) at (.+?) \((\w+) box\): miss/, (m) => ({ Thrust: [`Your thrust finds only air: the ${noHash(m[2])} is in ${m[3]}, too quick to catch.`], Swing: [`Your swing finds only air: the ${noHash(m[2])} is in ${m[3]}, too quick to catch.`], Smash: [`Your smash finds only air: the ${noHash(m[2])} is in ${m[3]}, too quick to catch.`] }[m[1]]));
rule(/^Your (.+?) found no mark, so it (?:is now alerted|stays alerted)/, m => [`Your ${m[1]} finds no mark, and stays at the ready.`, `Your ${m[1]} swings wide and stays alerted.`]);
const HARM = { N: 'glances off', L: 'thuds against', M: 'bites into', H: 'hammers', T: 'crashes down on' };
rule(/^(.+?) deals (\w) harm; you are slain\.?$/, m => `The ${noHash(m[1])}'s blow ${HARM[m[2]] ?? 'strikes'} you. You fall.`);
rule(/^(.+?) deals (\w) harm; the (.+?) you are is slain\.?$/, m => `The ${noHash(m[1])}'s blow ${HARM[m[2]] ?? 'strikes'} you. The ${m[3]} you are falls.`);
rule(/^(.+?)'s shot finds a vital spot; you are slain\.?$/, m => `The ${noHash(m[1])}'s shot finds a vital spot. You fall.`);
rule(/^(.+?)'s shot finds a vital spot; the (.+?) you are is slain\.?$/, m => `The ${noHash(m[1])}'s shot finds a vital spot. The ${m[2]} you are falls.`);
rule(/^(.+?) (seizes|crushes) you!?\.?$/, (m) => (m[2] === 'seizes' ? `The ${noHash(m[1])} seizes you!` : `The ${noHash(m[1])} crushes you.`));
rule(/^Repositioning roll: (\d)\.?$/, m => (m[1] === '4' ? 'Nothing shifts.' : 'The creatures trade places.'));
rule(/^(?:You (?:attacked no one|named a target but played no Fight chit)|You played .+? but named no one to strike)/, (m, e) => (/still hidden/.test(e.t) ? ['You stay hidden, and the round passes without a blow.', 'Hidden, you strike at no one. Nothing happens.'] : ['Nobody strikes and nobody is struck. Nothing lands.', 'A round of circling. No blow lands.']));
rule(/^Every blow, theirs and yours, missed/, () => ['Every blow misses. Nothing lands.', 'Steel finds only air.']);
rule(/^No creature could strike you either/, () => 'Nothing could strike you. No blow lands.');
rule(/^You give yourself away by naming a target/, () => 'Naming a target gives you away.');
rule(/^You stay hidden\. Nothing here can find you/, () => ['You keep still. The evening passes unnoticed.', 'Nothing finds you in the dark. The evening passes.']);
rule(/^You strike down the (.+?)(?: \(.*\))?\.?$/, m => [`You strike down the ${m[1]}.`, `The ${m[1]} goes down under your blow.`]);
rule(/^You hit the (.+?) but harm \w is not enough/, m => `Your blow bounces off the ${m[1]}.`);
rule(/^(.+?) kills (?:the )?(.+?) for you\.?$/, m => `${cap(noHash(m[1]))} cuts down the ${noHash(m[2])} for you.`);
rule(/^(.+?) hits (?:the )?(.+?) but (?:fails to kill|does not kill it)\.?$/, m => `${cap(noHash(m[1]))} wounds the ${noHash(m[2])}, but it stands.`);
rule(/^(.+?) hits your (.+?) but it stands\.?$/, m => `${cap(noHash(m[1]))} strikes your ${m[2]}, but it stands.`);
rule(/^(.+?) strikes your (.+?) dead\.?$/, m => `Your ${m[2]} falls under ${noHash(m[1])}.`);
rule(/^(?:The )?(.+?) kills (.+?); you lose (\d+) Notoriety\.?$/, m => `The ${noHash(m[1])} cuts down ${noHash(m[2])}, who fought for you.`);
rule(/^Your (.+?) is destroyed\.?$/, m => `Your ${m[1]} is smashed beyond use.`);
rule(/^You melt away as mist: the fight is over for you/, () => 'You melt away as mist. The fight is over for you.');
rule(/^You are yourself again/, () => 'The mist gathers and you are yourself again, belongings and gold restored.');
rule(/^(.+?)'s magic is aimed at you\.?$/, m => `The ${m[1]} turns its magic on you.`);
rule(/^(.+?)'s magic cannot touch you: you are shielded/, m => `The ${m[1]}'s magic slides off you.`);
const PIT_TALE = { 'Fiery Chasm': 'A fiery chasm opens underfoot.', 'Carried Away': 'Something vast carries the target away.', Terror: 'Terror sweeps the clearing.', Blight: 'Blight withers every straining chit.', Forget: 'Forget empties the Magic chits.', Rust: 'Rust eats at the armour.' };
rule(/^(.+?): (Fiery Chasm|Carried Away|Terror|Blight|Forget|Rust) \(rolled [^)]*\)\./, (m) => { const where = noHash(m[1]).replace(/^Power of the Pit( at)?\s*/, '').replace(/^the /i, ''); return `The Pit answers${where && !/^pit$/i.test(where) ? ` at the ${where}` : ''}. ${PIT_TALE[m[2]]}`; });
rule(/^(.+?)'s magic: (\w[\w ]*?) \(rolled [^)]*\)\./, m => `The ${m[1]} calls on the Pit: ${m[2]}.`);
rule(/^(\w[\w ]*?) works only on a character: (?:the )?(.+?) is untouched\.?$/, m => `${m[1]} finds nothing to bite in the ${noHash(m[2])}.`);
rule(/^Terror kills: (.+?)\.?$/, m => `Terror cuts through them: ${crowd(m[1]).text}.`);
rule(/^The (.+?) is carried away/, m => `The ${noHash(m[1])} is carried away.`);
rule(/^You cast (.+?), playing Magic \S+\.?$/, m => [`You cast ${m[1]}.`, `${m[1]} leaves your hands.`, `You call up ${m[1]}.`]);
rule(/^You cast (.+?) from your (.+?)\.?$/, m => [`Your ${m[2]} gives up ${m[1]}.`, `You call ${m[1]} out of your ${m[2]}.`]);
rule(/^You use up an enchanted chit for its (\w+) magic\.?$/, m => (m[1] === 'magic' ? 'An enchanted chit burns away to feed the spell.' : `An enchanted chit burns away for its ${m[1]} magic.`));
rule(/^You use up an enchanted (\w+) chit to energize (.+?)\.?$/, m => [`You burn an enchanted ${m[1]} chit to wake ${m[2]}.`, `${m[2]} drinks the ${m[1]} chit and wakes.`]);
rule(/^(.+?) falls inert at Midnight\.?$/, m => [`${m[1]} sputters out at midnight.`, `At midnight ${m[1]} goes dark.`]);
rule(/^(.+?) is energized again\.?$/, m => [`${m[1]} stirs awake again.`, `${m[1]} wakes.`]);
rule(/^(.+?) is energized twice at once, and the two would make different creatures: they cancel each other out\.?$/, m => [`${m[1]} wakes twice and the two shapes fight each other: both fall still.`, `Two ${m[1]} spells stir at once and pull toward different creatures; they cancel, and nothing changes.`]);
rule(/^You let the (.+?) fall: it lands in (.+?)\.?$/, m => [`The ${m[1]} slips from your grasp and drops into ${m[2]}.`, `You let the ${m[1]} go, and it falls to ${m[2]}.`]);
rule(/^Your altered Magic chit loses its colou?r as (.+?) ends\.?$/, m => [`With ${m[1]} over, your Magic chit loses its colour.`, `${m[1]} ends, and the colour drains from your Magic chit.`]);
rule(/^(.+?) is overridden by a stronger spell on the same target and lies dormant/, m => `A stronger spell drowns out ${m[1]}.`);
rule(/^(.+?) is overridden by (.+?)\.?$/, m => `${m[2]} drowns out ${m[1]}.`);
rule(/^Exorcise: (.*)$/, (m, e) => {
    const broken = [...m[1].matchAll(/([A-Z][\w' ]*?) is broken/g)].map(x => x[1]), gone = /the (.+?) is destroyed/.exec(m[1]);
    return gone ? `Exorcise drives out the ${gone[1]}.` : broken.length ? `Exorcise breaks ${list(broken)}.` : pickV(e, ['The rite rings out and finds nothing to break.', 'Exorcise finds nothing to drive out.']);
});
rule(/^Make Whole: (?:no|0) action chits restored/, () => 'Make Whole finds nothing to mend.');
rule(/^(Make Whole|Health): .*restored/, m => (m[1] === 'Health' ? 'Health floods back into you.' : 'Make Whole knits your chits whole.'));
rule(/^Remedy breaks (.+?)\.?$/, m => `Remedy breaks ${m[1]}.`);
rule(/^Violent Storm: a tempest breaks/, () => ['A tempest breaks over the tile, to rage until sunset tomorrow.', 'The sky tears open over the tile. It will rage until sunset tomorrow.']);
rule(/^Small Blessing: you wish and the Wishes Table gives (.+?) \(rolled [^)]*\)\.?$/, m => `You wish, and the answer is ${m[1]}.`);
rule(/^Strength: your next Fight chit/, () => 'Strength fills your arm: the next blow will fall like a hammer.');
rule(/^Vision: the (.+?) box holds/, m => `You glimpse what lies in the ${m[1]} box.`);
rule(/^(Fiery Blast|Stones Fly|Lightning Bolt): (?:Thrust|Swing|Smash) at (.+?) \(\w+ box\): (\d+ hits|hit|miss)(?: by undercutting)?\.?$/, (m, e) => (m[3] === 'miss' ? `${m[1]} goes wide of the ${noHash(m[2])}.` : /hits/.test(m[3]) ? `${m[1]} hammers the ${noHash(m[2])}.` : pickV(e, [`${m[1]} strikes the ${noHash(m[2])}.`, `${m[1]} finds the ${noHash(m[2])}.`])));
rule(/^(.+?) is cast at no one and fizzles/, m => `${m[1]} goes off at nothing.`);
rule(/^Another (.+?) hit finds the (.+?) already dead/, m => `The ${m[1].toLowerCase()} find the ${noHash(m[2])} already fallen.`);
rule(/^Control Bats: there are no Bats here/, () => 'There are no bats here to answer you.');
rule(/^Control Bats: the (.+?) is yours/, m => `The ${m[1]} bends to your will.`);
rule(/^Persuade: the (.+?) (?:are|is) pacified/, m => `Your words settle the ${m[1]}: they will not fight today.`);
rule(/^Persuade is broken: its target was named/, () => 'Naming a target breaks the spell.');
rule(/^You name the (.+?): (\w[\w ]*?) is broken, and it fights back/, m => `You name the ${noHash(m[1])}, and ${m[2]} breaks. It fights back.`);
rule(/^Peace: the (.+?) loses interest in the fight/, m => `The ${noHash(m[1])} loses interest in the fight.`);
rule(/^Peace: no one in this clearing will fight/, () => 'A hush falls: nobody here will fight today.');
rule(/^A hush falls: there will be no more fighting here today/, () => 'A hush falls: there will be no more fighting here today.');
rule(/^Poison: (.*?)(?:'s weapon|your (.+?)) now inflicts/, (m) => (m[2] ? `Poison drips along your ${m[2]}.` : `Poison beads on ${m[1]}'s weapon.`));
rule(/^Elven Grace: the (.+?) moves at the speed of its size/, m => `Elven Grace is on the ${m[1]}: it moves as heavily as it looks.`);
rule(/^Elven Grace: each of your Move chits/, () => 'Your feet grow quick and light.');
rule(/^Unleash Power: Magic (\S+) \(\w\) can be played/, () => 'Unleash Power turns a Magic chit into muscle until sunset tomorrow.');
rule(/^Whistle for Monsters: the (.+?) from clearing/, m => `You whistle for monsters, and the ${m[1]} moves to call them.`);
rule(/^Pentangle: you are shielded/, () => 'A pentangle flares: no demon or spell can touch you.');
rule(/^(.+?) is held off by the (Pentangle|mist)\.?$/, m => `${m[1]} cannot get past the ${m[2]}.`);
// ---- the rulings of 2026-10-26 (S2, S3, S6, S7, S8, R5, R7, M4): Peace, Wish for Peace, the Pit on a character, the split Melee step, luring, the Vault, the edge of the map
rule(/^Peace: (?:you take|the target takes) back (?:your|his) Attention chit/, () => ['Peace takes the fight out of you: no target, no attack until midnight.', 'A calm falls over you. You cannot name a target until midnight.']);
rule(/^Peace takes back your Attention chit: the attack you were playing is cancelled/, () => 'Peace takes the fight out of you: the attack you were playing is called off.');
rule(/^Peace: no one in this clearing may target or attack anyone for two more rounds/, () => ['A hush falls: for two more rounds nobody here may strike or name a target.', 'Peace settles over the clearing for two more rounds. Everyone may act, but nobody may attack.']);
rule(/^The Wish for Peace: nobody may target or attack anyone; the attack you were playing is cancelled/, () => 'The wish for peace takes hold: the attack you were playing is called off.');
rule(/^Your own Power of the Pit \((.+?)\) kills you\.?$/, m => [`Your own Pit turns on you: ${m[1]} is the end of you.`, `The Pit you called answers with ${m[1]}, and takes you.`]);
rule(/^Power of the Pit: (?:you are|.+? is) shielded from magic/, () => 'The Pit finds nothing to take: magic cannot touch its target.');
rule(/^The Power of the Pit finds no target/, () => 'The Pit has nothing to take.');
rule(/^Power of the Pit at (.+?): (Fiery Chasm|Carried Away|Terror|Blight|Forget|Rust) \(rolled [^)]*\)\./, m => `The Pit answers at ${noHash(m[1])}: ${m[2]}.`);
rule(/^(.+?) is held off by a Pentangle/, m => `A pentangle holds ${m[1]} off.`);
rule(/^You name a monster you control as your target: the spell that holds it is broken/, () => 'You turn on a monster that served you, and the spell that held it breaks.');
rule(/^You lure the (.+?): (.+?) is broken, and it comes for you/, m => `You lure the ${noHash(m[1])}: ${m[2]} breaks, and it comes for you.`);
rule(/^Luring it breaks the spell that kept the peace/, () => 'Luring it breaks the spell that kept the peace.');
rule(/^Your play of the (Fight|Move) chit is cancelled: the spell forbids it/, m => `A spell takes the ${m[1]} chit out of your hand: that play is called off.`);
rule(/^(.+?): one of your hirelings is set on one of its targets, so the spell is cancelled/, m => `${m[1]} fizzles: one of your own people is fighting its target.`);
rule(/^You play (.+?) to break the door \(it is tired\)\.?$/, m => `You put your strength into ${m[1]} and break the Vault door. The chit is tired.`);
rule(/^You break the door with your (.+?)\.?$/, m => `You break the Vault door with your ${m[1]}.`);
rule(/^(.+?) leaves the map\.?$/, m => `${m[1]} walks off the map.`);
rule(/^Protection from Magic is prepared/, () => 'Protection from Magic stands ready.');
rule(/^Fog: a thick fog settles/, () => ['A thick fog settles over the tile. Nobody will see far in it.', 'Fog rolls over the tile and blots out the view.']);
rule(/^Broomstick: you now hold a Fly chit/, () => 'A broomstick waits at your hand, ready to fly.');
rule(/^Melt into Mist: you turn to mist/, () => 'You thin to mist: nothing can touch you, and you can do little but drift.');
rule(/^Blend Into Background: /, () => 'Tomorrow you will blend into the background, with an extra phase to hide.');
rule(/^(?:Peace with Nature): the Warning and Sound chits/, () => 'The woods will keep quiet around you.');
rule(/^Phantasm: tomorrow at Birdsong/, () => 'A phantom of you will wake at dawn.');
rule(/^Prophecy: tomorrow you need not record/, () => 'Tomorrow you may choose each phase as it comes.');
rule(/^World Fades: while it is energized/, () => 'The world thins around you.');
rule(/^World Fades: the Squeak curse betrays you/, () => 'The Squeak curse gives you away. The world will not fade for you.');
rule(/^World Fades: you slip out of sight/, () => 'The world fades, and you slip out of sight.');
rule(/^Enchant Artifact: the (.+?) gains/, m => `The ${m[1]} drinks in the enchantment.`);
rule(/^Enchant Artifact: the (.+?) already holds/, m => `The ${m[1]} holds that charm already.`);
rule(/^Premonition: /, () => 'You see which way tomorrow leans.');
rule(/^Bad Luck: /, () => 'Bad luck settles on the target like a cloak.');
rule(/^Bad Luck is already in force there/, () => 'Bad luck hangs there already.');
rule(/^Dissolve Spell: (.+?) is broken\.?$/, m => `Dissolve Spell unravels ${m[1]}.`);
rule(/^Health: .*restored/, () => 'Health floods back into you.');
rule(/^Your (.+?) is damaged\.?$/, m => `Your ${m[1]} is damaged.`);

// ---------------------------------------------------------------- a roll, told
const rollTale = (e, what, res, st, anchor) => {
    let m;
    const next = () => after(anchor ?? e, st);
    if ((m = /^Search: (Peer|Locate)$/.exec(what))) { const n = next(); return { title: m[1] === 'Peer' ? 'Peering' : 'Searching', line: n ? (storyOfBare(bare(n.t), n) ?? SEARCH_BASE[m[1]][res]) : (SEARCH_BASE[m[1]][res] ?? searchTale(e, m[1], res)) }; }
    if (what === 'Search: Magic Sight') {
        const n = next(), plain = n ? bare(n.t) : '';
        return { title: 'Magic Sight', line: n ? storyOfBare(plain, n) : ({ Nothing: SEARCH_BASE['Magic Sight'].Nothing, Choice: 'The signs point more than one way.', 'Perceive spell': 'Your sight reads the spells of what lies here.', 'Discover chits': SEARCH_BASE['Magic Sight']['Discover chits'], Counters: 'Your sight searches for gear.', 'Treasure cards': 'Your sight searches for treasure.' }[res] ?? 'Your sight sweeps the clearing.') };
    }
    if ((m = /^Search: Loot( the ground)?$/.exec(what)) || what === 'Search: Site card') {
        const n = next();
        return { title: m && m[1] ? 'The ground' : what === 'Search: Site card' ? 'The site' : 'Looting', line: n ? storyOfBare(bare(n.t), n) : (m ? 'You turn over what lies about.' : 'You search the site.') };
    }
    if (what === 'Landing') return { title: 'Landing', line: /roll again/.test(res) ? 'The air carries you on: there is nothing to land on there.' : `The air sets you down in ${res.replace(/^clearing (\d+) of the (.+)$/, 'clearing $1 of the $2')}.` };
    if (what === 'Lost') return { title: 'Lost', line: /^you wander toward (.+)$/.test(res) ? `Lost, you stumble toward ${/^you wander toward (.+)$/.exec(res)[1]}.` : 'Lost, you wander in circles.' };
    if (what === 'Violent Storm') return { title: 'The storm', line: 'The storm tears at the land.' };
    if (what === 'Wish') return { title: 'A wish', line: `You wish, and the answer is ${res}.` };
    if (what === 'Transform Table') return { title: 'Transformed', line: `You change, and become ${/^[aeiou]/i.test(res) ? 'an' : 'a'} ${low(res)}.` };
    if (what === 'World Fades: Hide') return { title: 'Hiding', line: /seen/i.test(res) ? 'Eyes find you. The world does not fade enough.' : 'The world fades and you slip from sight.' };
    if (/^Talk to Wise Bird/.test(what)) return { title: 'The Wise Bird', line: SEARCH_BASE.Peer[res] ?? 'The bird looks far, and tells you what it sees.' };
    if ((m = /^(.+?): Peer$/.exec(what))) { const mm = /^(.+?)(?: \(|$)/.exec(res); return { title: `${m[1]} peers`, line: SEARCH_BASE.Peer[mm?.[1] ?? res] ?? 'It watches the clearing.' }; }
    if ((m = /^Assignment roll for the (.+)$/.exec(what))) return { title: `The ${m[1]}`, line: 'They draw lots for who takes it.' };
    if (what === 'Curse') return { title: 'A curse', line: curseTale(res) };
    return null;
};
// the first phase or loot line written after this roll (so the tray can say what the roll came to). The nth roll line of the log is roll n (noteRoll writes one
// for every roll it notes); an entry that is a copy of a log line is found again by its day and words.
const ROLL_INDEX = new WeakMap();
const rollLines = log => {
    let c = ROLL_INDEX.get(log);
    if (!c || c.len !== log.length) { c = { len: log.length, at: [] }; log.forEach((l, i) => { if (l.k === 'roll') c.at.push(i); }); ROLL_INDEX.set(log, c); }
    return c.at;
};
// The game state the screens are showing, set once per render by the shell (setStoryState), so that a roll in the dice tray can find the line that followed it without every
// caller passing `st`. A state given to a function wins over it; with neither, a roll is told from its own record alone.
let CTX = null;
export const setStoryState = st => { CTX = st ?? null; };
const after = (e, st) => {
    const log = (st ?? CTX)?.log; if (!log?.length) return null;
    const rolls = rollLines(log);
    let i = -1;
    if (e.t) { i = log.lastIndexOf(e); if (i < 0) for (let k = log.length - 1; k >= 0; k--) if (log[k].t === e.t && log[k].day === e.day) { i = k; break; } }
    else if (e.n >= 1 && e.n <= rolls.length && log[rolls[e.n - 1]].t.startsWith(`\u{1F3B2} ${e.what}: rolled`)) i = rolls[e.n - 1];
    else for (let k = rolls.length - 1; k >= 0; k--) { const l = log[rolls[k]]; if (l.t.startsWith(`\u{1F3B2} ${e.what}: rolled ${(e.dice ?? []).join('+')}`) && l.day === e.day) { i = rolls[k]; break; } }
    if (i < 0) return null;
    for (let k = i + 1; k < Math.min(log.length, i + 6); k++) { const l = log[k]; if (l.k === 'phase' || l.k === 'loot') return l; if (l.k === 'day' || l.k === 'roll') return null; }
    return null;
};
// the line a roll record shows in the dice tray in the Story voice. `anchor`: the log line of the roll, when the roll is read from the log.
export function storyRoll(r, st = null, anchor = null) {
    const what = r.what ?? '', res = r.result ?? '';
    const t = rollTale(r, what, res, st, anchor);
    if (t) return t;
    const n = narrateRoll(r);
    if (n?.line && n.line !== res && !/\(\d[\d+]*\)|rolled/.test(n.line)) return n;
    return { title: n?.title ?? tidyTitle(what), line: stop(tidy(cap(res) || tidyTitle(what))) };
}
const tidyTitle = w => String(w ?? 'Roll').replace(/^Search: /, '').replace(/ roll$/i, '').replace(/'s missile$/, '');

// ---------------------------------------------------------------- the last resort: the plain words, cleaned of what Story must never show
function tidy(t) {
    let s = String(t ?? '');
    s = s.replace(/^\u{1F3B2}\s*/u, '').replace(/^Phase \d+: /, '');
    s = s.replace(/ \((?:rolled|missile roll)[^)]*\)/g, '').replace(/ \([\d+]+\)/g, '').replace(/ \(Aim -1\)/g, '').replace(/,? ?\(?rolled [\d+-]+(?:, \d+ counts)?\)?/g, '');
    s = s.replace(/\browS?\b \d+/g, 'a row').replace(/%/g, ' percent').replace(/\bnull\b|\bundefined\b/g, '').replace(/\broll of\b/g, 'throw of').replace(/You:/g, 'You');
    s = noHash(s).replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!])/g, '$1').trim();
    // the rules paragraph after the first sentence is Detail's: keep the headline
    if (s.length > 110) { const first = /^(.+?[.!?])(?:\s|$)/.exec(s); if (first && first[1].length >= 12) s = first[1]; }
    return s;
}
const FALLBACK = { count: 0, last: [] };
export const fallbackStats = FALLBACK;

function storyOfBare(b, e) {
    for (const [re, fn] of R) {
        const m = re.exec(b);
        if (!m) continue;
        const out = fn(m, e);
        const line = pickV(e, out);
        if (line) return line;
    }
    return null;
}
// "Phantasm, phase 2: Phantasm peers: Peer (3+5): ..." and the like: a phantom's phase, told as the phantom's
function companionTale(b, e) {
    const m = /^(.+?), phase \d+: (.*)$/.exec(b);
    if (!m) return null;
    const who = m[1], inner = m[2], the = `The ${who}`;
    let x;
    if ((x = new RegExp(`^${who} moves to (.+?)\\.?$`).exec(inner))) return pickV(e, [`${the} drifts to ${x[1]}.`, `${the} slips on to ${x[1]}.`]);
    if (new RegExp(`^${who} does nothing`).test(inner)) return `${the} waits.`;
    if ((x = new RegExp(`^${who} peers: (.*)$`).exec(inner))) return `${the} peers about. ${storyOfBare(x[1], e) ?? tidy(x[1])}`;
    if (new RegExp(`^${who} meditates`).test(inner)) return `${the} gathers its power.`;
    if ((x = new RegExp(`^${who} enchants your Magic \\S+: it now holds (\\w+) magic`).exec(inner))) return `${the} fills a Magic chit with ${x[1]} magic.`;
    if ((x = new RegExp(`^${who} starts the climb toward (.+?)(?: \\(.*)?\\.?$`).exec(inner))) return `${the} starts up toward ${x[1]}.`;
    return storyOfBare(inner.replace(new RegExp(`^${who} `), 'You '), e);
}

// ---------------------------------------------------------------- the public face
const ROLL_LINE = /^\u{1F3B2} (.+?): rolled [^:]*?(?:: (.*))?$/u;
export function storyLine(entry, st = null) {
    if (!entry) return '';
    // a roll record (the dice tray): { what, dice, value, result }
    if (entry.t == null && entry.what != null) return storyRoll(entry, st).line;
    if (hasRealStory(entry)) return null;
    const t = String(entry.t ?? '');
    const b = bare(t);
    let m;
    if (entry.k === 'roll' && (m = ROLL_LINE.exec(t))) return storyRoll({ day: entry.day, t: entry.t, what: m[1], result: m[2] ?? '', dice: [] }, st, entry).line;
    const line = companionTale(b, entry) ?? storyOfBare(b, entry);
    if (line) return stop(line);
    FALLBACK.count++; if (FALLBACK.last.length < 400) FALLBACK.last.push(t);
    return stop(tidy(b)) || 'Time passes.';
}
// The line for one voice. Detail is the entry's own words, untouched. A table line (several characters) carries `p`, told with the players' names, in both voices.
export function lineFor(entry, voice = 'story', st = null) {
    if (!entry) return '';
    if (entry.p) return entry.p;
    if (voice !== 'story') return entry.t ?? '';
    const s = storyLine(entry, st) ?? entry.s;
    return STORY_SWAPS[s] ?? s;
}
// TODO (Mike, note 21): the whole Story text needs one big pass so it stops sounding generated. Until then, engine lines that talk about "blows" are swapped here (the engine's own text is shared with the stable game).
const STORY_SWAPS = { 'The blows stop; neither side presses on.': 'The fighting dies down.' };

// Detail for the rolls whose own record says nothing of the outcome (Loot, the ground, a site card: noteRoll is given no result): the roll's number and what it
// took, read from the phase line that follows it ("6: you take the Ancient Telescope"). null when there is nothing to add. (docs/design/review/04-daylight-activities.md 04-05)
export function rollDetail(r, st = null) {
    if (!/^Search: (Loot|Site card)/.test(r?.what ?? '') || r.result) return null;
    const n = after(r, st);
    const m = n && /: (.+?)\.?$/.exec(bare(n.t));
    return m ? `${r.value}: ${m[1]}` : null;
}

// Which rule tells a line (for the coverage table and for debugging): the pattern's source, 'roll', 'companion', 'real' (the engine's own story is kept) or 'fallback'.
export function explain(entry) {
    if (!entry) return 'none';
    if (hasRealStory(entry)) return 'real';
    const b = bare(entry.t ?? '');
    if (entry.k === 'roll' && ROLL_LINE.test(entry.t ?? '')) return `roll: ${ROLL_LINE.exec(entry.t)[1].replace(/\d+/g, 'N').replace(/ (?:with|for) the .+$/, ' the G')}`;
    if (/^(.+?), phase \d+: /.test(b)) return 'companion phase';
    for (const [re] of R) if (re.test(b)) return re.source;
    return 'fallback';
}

// ---------------------------------------------------------------- the end-of-turn card, from the engine's structured `st.turnEnd` (no log text to parse)
// These replace the template strings of the turn-end sheet ("Calls nothing out today: its row is not the one prowling (the Monster Roll was 3)", "The Patrol appear 3 of them,
// at the Inn", "the rest of your turn was lost"). Each takes the record the sheet already holds and returns one short Story sentence.
const seedFor = (...parts) => ({ day: 0, t: parts.join('|') });
const chitTitle = c => noHash(c.name ?? c.kind ?? 'chit').replace(/ \d+$/, '');
export function calloutLine(c, t = {}) {
    const e = seedFor('callout', c.id, (c.summons ?? []).join(','), c.dest);
    if (c.summons?.length) {
        const cr = crowd(c.summons), where = c.dest && c.dest !== t.at ? ` in clearing ${c.dest.replace(/^\D+/, '')}` : '';
        return pickV(e, [`${cap(cr.text)} ${cr.many ? 'answer' : 'answers'}${where}.`, `${chitTitle(c)} calls, and ${cr.text} ${cr.many ? 'come' : 'comes'}${where || ' for you'}.`]);
    }
    if (c.why && /already called/.test(c.why)) return pickV(e, [`${chitTitle(c)} has called already.`, `${chitTitle(c)} has nothing left to call today.`]);
    return pickV(e, [`${chitTitle(c)}: nothing answers.`, `Nothing answers ${chitTitle(c)} today.`]);
}
// A chit is named by what it is (DR-29): "Dank" alone means nothing to the player; "the Dank warning" says what kind of chit it is.
const chitKindName = c => (c.kind === 'warning' ? `the ${chitTitle(c)} warning` : c.kind === 'sound' ? `the ${chitTitle(c)} sound` : c.kind === 'site' ? `the ${chitTitle(c)}` : chitTitle(c));
export function quietChitsLine(chits) {
    const names = [...new Set(chits.map(chitKindName))];
    return names.length ? `${cap(list(names))} ${names.length === 1 ? 'stays' : 'stay'} quiet today.` : '';
}
export function nativesLine(n) {
    const e = seedFor('natives', n.group, n.count, n.at), many = n.count > 1, at = /campfire/i.test(n.at) ? `the ${n.at.toLowerCase()}` : `the ${n.at}`;
    return pickV(e, [`The ${n.group}${many ? `, ${numWord(n.count)} strong,` : ''} gather at ${at}.`, `${many ? `${cap(numWord(n.count))} of the ${n.group}` : `One of the ${n.group}`} ${many ? 'come' : 'comes'} out to ${at}.`]);
}
export function arrivalLine(a) {
    const e = seedFor('arrival', a.name, a.why);
    if (/prowls in your tile/.test(a.why ?? '')) return pickV(e, [`${/^[aeiou]/i.test(a.name) ? 'An' : 'A'} ${noHash(a.name)} was prowling this tile and comes to your clearing.`, `${cap(noHash(a.name))} comes in from the prowl.`]);
    return `${cap(noHash(a.name))} arrives.`;
}
export function blockedLine(blockers = []) {
    if (!blockers.length) return 'Your turn was cut short.';
    const c = crowd(blockers);
    return `${cap(c.text)} ${c.many ? 'stop' : 'stops'} you. The rest of the day is lost.`;
}
export function closedInLine(names = []) {
    const c = crowd(names);
    return `${cap(c.text)} ${c.many ? 'find' : 'finds'} you when your turn is over.`;
}
// The status box at the head of the card: who you are tonight, and why. The evening is about not fighting.
export function turnEndStory(t) {
    const e = seedFor('end', t.day, t.hidden, t.blocked, (t.blockers ?? []).join(','), (t.closedIn ?? []).join(','));
    if (t.noTurn) return { title: 'You have no turn today', why: 'Creatures closed in before your chit was drawn. You are seen, and that is all it cost you.' };
    if (t.blocked) return { title: 'You are in plain sight', why: t.blockers?.length ? `${blockedLine(t.blockers)} You are seen.` : 'Your turn was cut short, and you are seen.' };
    if (t.closedIn?.length) return { title: 'You are in plain sight', why: `${closedInLine(t.closedIn)} No phase was lost.` };
    if (t.hidden) return { title: 'You are hidden', why: pickV(e, ['No one can find you tonight unless you strike first.', 'You are out of sight. Tonight nothing will come for you.']) };
    return { title: 'You are in plain sight', why: pickV(e, ['Whatever shares your clearing may come for you tonight.', 'You stand in the open, and whoever is here has seen you.']) };
}

// ---------------------------------------------------------------- the ask at the start of a phase (review 04-01): one situation line and one why line, in the Story voice
// `c`: what the screen knows: { at: 'Curst Valley 4', weapon: 'Great Sword', magic: true (alerting a Magic chit), enchants: 0|1 (Enchant phases already played today), tile: 'Crag' (Fly), to: 'Dark Valley 5' (Move) }.
// Detail may add the rule; Story never does. Returns { line, why } (why may be null).
export function phasePrompt(act, c = {}) {
    const e = seedFor('prompt', act, c.at, c.weapon, c.tile, c.to);
    switch (act) {
        case 'hide': return { line: pickV(e, ['Slip out of sight.', 'Find cover.']), why: 'A hidden hero cannot be blocked.' };
        case 'search': return { line: c.at ? `Search ${c.at}.` : 'Search the clearing.', why: 'You choose what to look for when you begin.' };
        case 'rest': return { line: pickV(e, ['Catch your breath.', 'Rest a while.']), why: 'One tired chit comes back.' };
        case 'alert': return c.magic ? { line: 'Wake a Magic chit.', why: 'It will answer before anything else until midnight.' } : { line: c.weapon ? `Ready your ${c.weapon}.` : 'Ready your weapon.', why: 'An alerted weapon strikes at its own time.' };
        case 'enchant': return c.enchants ? { line: 'Pour your power into a chit or the land.', why: null } : { line: 'Gather your power.', why: 'Enchanting takes a second phase.' };
        case 'fly': return { line: c.tile ? `Take to the air over the ${c.tile}.` : 'Take to the air.', why: 'Nothing can block you in flight. You come down where chance puts you.' };
        case 'move': return { line: c.to ? `Make for ${c.to}.` : 'Set out.', why: null };
        case 'trade': return { line: 'Do some business.', why: null };
        case 'hire': return { line: 'Look for hands to hire.', why: null };
        case 'follow': return { line: 'Follow the guide.', why: null };
        default: return { line: 'Let the hour pass.', why: null };
    }
}
