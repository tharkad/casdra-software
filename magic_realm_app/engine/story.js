// The fight told as a story. Every line of the log keeps its plain, exact form (`t`), and carries this prose as `s` for the places that read the game
// aloud (the fight's last-round panel, the day report, the journal). Phrases vary by the dice rolled so far, so a fight does not repeat itself, and the
// same game always tells the same story.
const v = (st, arr, k = 0) => arr[(((st.rollSeq ?? 0) * 3 + k) % arr.length + arr.length) % arr.length];
const The = n => `The ${n}`, the = n => `the ${n}`;
const harmWord = L => ({ N: 'glances off', L: 'thuds against', M: 'bites into', H: 'hammers', T: 'crashes down on' }[L] ?? 'strikes');
const pos = box => `${box} position`;
const DV = { thrust: 'thrusts', swing: 'swings', smash: 'smashes down' };

export const tell = {
    ambush: st => v(st, ['You burst from your hiding place and strike first: the ambush gives you away.', 'From the shadows you spring, and your cover is gone in an instant.', 'You lunge out of hiding. There is no concealment now, only the fight.']),
    hold: st => v(st, ['The creatures hold their ground.', 'Nothing shifts: every creature stays where it stood.']),
    shuffle: st => v(st, ['The creatures weave and jostle, trading places in the press.', 'The melee churns and the creatures change their ground.']),
    moved: (st, name, from, to, i = 0) => `${The(name)} ${v(st, ['lurches', 'scuttles', 'slides', 'circles', 'shoulders its way'], i)} out of the ${pos(from)} and into the ${pos(to)}.`,
    flipped: (st, box, names) => `In the ${box} box the ${names} grow${names.includes(' and ') || names.includes(',') ? '' : 's'} wilder and show${names.includes(' and ') || names.includes(',') ? '' : 's'} another side.`,
    myHitBox: (st, weapon, dir, name) => `Your ${weapon} ${DV[dir] ?? dir} at ${the(name)}, and it is standing right where the blow falls.`,
    myHitFast: (st, weapon, dir, name, where, mine, its) => `${The(name)} has twisted into the ${pos(where)}, but your ${weapon} is too quick for it (your ${mine} against its ${its}) and the blow lands all the same.`,
    myMiss: (st, weapon, dir, name, where, mine, its) => `Your ${weapon} ${DV[dir] ?? dir} through empty air: ${the(name)} has slipped into the ${pos(where)}${its != null ? ` and is too nimble to catch (its ${its} against your ${mine})` : ''}.`,
    notBack: (st, name, hidden) => (hidden ? `Caught off guard by your ambush, ${the(name)} cannot answer this round.` : `${The(name)}'s companions have not yet joined the fight, so no blow comes back this round.`),
    connectNoMove: (st, name, dir) => `${The(name)}'s ${dir} comes in unchallenged: you have no maneuver to meet it.`,
    connectMeets: (st, name, dir, mnv) => `${The(name)}'s ${dir} is aimed at your ${mnv}, and it finds you there.`,
    connectUnder: (st, name, dir, atk, mine) => `Quick as thought, ${the(name)}'s ${dir} slips beneath your guard (its ${atk} against your ${mine}).`,
    avoid: (st, name, dir, aimed, mnv) => `${The(name)}'s ${dir} sweeps toward your ${aimed}, but your ${mnv} carries you clear.`,
    strike: (st, name, dir, L, armor) => `${The(name)}'s ${dir} ${harmWord(L)} ${armor ? `your ${armor}` : 'you'}${armor ? '' : v(st, [' without anything to turn it', ' through bare flesh'], 2)}.`,
    noEffect: (st, harm, armor, tough) => (armor
        ? `It does nothing: ${harm.toLowerCase()} harm cannot dent your ${armor} (it takes ${tough} harm to damage it), and it is too light to hurt you through it.`
        : `It does nothing: ${harm.toLowerCase()} harm is too light to wound you.`),
    damaged: (st, armor) => v(st, [`Metal shrieks: your ${armor} is dented and damaged.`, `Your ${armor} takes the blow and is damaged.`]),
    destroyed: (st, armor, gold) => `With a crack your ${armor} gives way and is destroyed${gold ? ` (worth ${gold} gold to you)` : ''}.`,
    wound: st => v(st, ['The blow finds a gap: you are wounded.', 'You stagger as the blow gets through: a wound.']),
    kill: (st, weapon, name, reward) => `Your ${weapon} ${v(st, ['cleaves into', 'strikes down', 'bites deep into'], 3)} ${the(name)}, and it ${v(st, ['crumples', 'falls with a crash', 'collapses'], 4)}${reward}.`,
    tough: (st, weapon, name, L, vuln) => `Your ${weapon} bites into ${the(name)}, but it is too tough to fall (harm ${L} against vulnerability ${vuln}).`,
    spent: (st, n) => `The strain tells: ${n} of your chits ${n === 1 ? 'is' : 'are'} spent.`,
    wounded: (st, n) => `The wounds weigh on you: ${n} of your chits ${n === 1 ? 'is' : 'are'} put out of action.`,
    dieDown: st => v(st, ['Spent and wary, both sides draw back: the fighting dies down.', 'The blows grow wild and then stop; neither side presses on.']),
    won: st => v(st, ['The last foe falls, and silence settles over the clearing.', 'Nothing hostile is left standing.']),
    ran: st => 'You tear yourself away from the fight and flee.',
};
