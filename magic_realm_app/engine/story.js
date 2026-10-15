// The fight told as a story. Every line of the log keeps its plain, exact form (`t`), and carries this prose as `s` for the places that read the game
// aloud (the fight's last-round panel, the day report, the journal). Phrases vary by the dice rolled so far, so a fight does not repeat itself, and the
// same game always tells the same story.
const v = (st, arr, k = 0) => arr[(((st.rollSeq ?? 0) * 3 + k) % arr.length + arr.length) % arr.length];
const The = n => `The ${n}`, the = n => `the ${n}`;
const harmWord = L => ({ N: 'glances off', L: 'thuds against', M: 'bites into', H: 'hammers', T: 'crashes down on' }[L] ?? 'strikes');
const pos = box => `${box} position`;
const DV = { thrust: 'thrusts', swing: 'swings', smash: 'smashes down' };

export const tell = {
    ambush: st => v(st, ['You spring from hiding and strike first: your cover is gone.', 'You lunge out of the shadows; there is no hiding now.']),
    hold: st => v(st, ['Nothing shifts.', 'The creatures hold their ground.']),
    shuffle: st => v(st, ['The creatures trade places.', 'The melee churns.']),
    moved: (st, name, from, to, i = 0) => `${The(name)} ${v(st, ['slips', 'scuttles', 'circles', 'shifts', 'lurches'], i)} from ${from} to ${to}.`,
    flipped: (st, box, names) => `In the ${box} box the ${names} show${names.includes(' and ') || names.includes(',') ? '' : 's'} another side.`,
    myHitBox: (st, weapon, dir, name) => `Your ${weapon} ${DV[dir] ?? dir} at ${the(name)} and finds it there.`,
    myHitFast: (st, weapon, dir, name, where, mine, its) => `${The(name)} twists into ${where}, but your ${weapon} is quicker (${mine} against ${its}) and lands.`,
    myMiss: (st, weapon, dir, name, where, mine, its) => `Your ${weapon} ${DV[dir] ?? dir} at empty air: ${the(name)} is in ${where}${its != null ? `, too quick to catch (${its} against your ${mine})` : ''}.`,
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
    kill: (st, weapon, name, reward) => `Your ${weapon} ${v(st, ['cleaves', 'strikes down', 'cuts down'], 3)} ${the(name)}, which ${v(st, ['crumples', 'falls', 'collapses'], 4)}${reward}.`,
    tough: (st, weapon, name, L, vuln) => `Your ${weapon} bites ${the(name)}, but harm ${L} cannot fell it (vulnerability ${vuln}).`,
    spent: (st, n) => `${n} of your chits ${n === 1 ? 'is' : 'are'} tired.`,
    wounded: (st, n) => `${n} of your chits ${n === 1 ? 'is' : 'are'} put out of action.`,
    dieDown: st => v(st, ['Both sides draw back: the fighting dies down.', 'The blows stop; neither side presses on.']),
    won: st => v(st, ['The last foe falls.', 'Nothing hostile is left standing.']),
    ran: st => 'You break away and flee.',
};
