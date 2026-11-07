// abilities.js: the Optional Abilities of rule 10.A.6 (the characters made for teams, patched for a game played alone), pure and small.
//   6.2 Captain (3rd level) rolls one die on the Hire activity.        6.3 Druid (3rd level) is immune to Curses; (4th level) his Peace with Nature reaches Site chits.
//   6.4 Magician (2nd level) alerted Magic chits are only made unprepared at Midnight.   6.5 Wizard (3rd level) his 2nd-level MOVE M5 chit is a MAGIC III2* chit and he enchants on every Enchant phase.
//   6.6 Woods Girl (2nd level) tracks in every woods clearing but those of the Ruins and the Valleys.   6.7 Elf: a Light Elf cannot play his Medium Fight and Move chits, a Great Elf his MOVE L2* chit.
//   6.8 Knights: the Knights' Adjustment (the trading relationship is Friendly), which also has its own switch.
// The switch is the game option `optionalAbilities` (setup.js stores it only when on, so a game without it is exactly what it was). Each ability begins at a development LEVEL (the stage a hero begins
// at, stages.js; a full hero is at the 4th level and has them all): a hero built at a lower stage has an ability only from that level on. Extra chits earned one at a time do not raise the level (10.E.6.3.1).
// Nothing in this file touches a state.

export const FULL_LEVEL = 4;

/** The development level of a character: the stage he began at (below the fourth, setup.js makeCharacter keeps it in `stage`), else the full hero's 4th. */
export const levelOf = ch => ch?.stage?.start ?? FULL_LEVEL;

/** The abilities: the character they belong to and the level they begin at (rule 10.A.6.2 to 10.A.6.8). */
export const ABILITIES = {
    captain: { char: 'captain', level: 3, rule: '10.A.6.2' },
    druidCurses: { char: 'druid', level: 3, rule: '10.A.6.3' },
    druidSites: { char: 'druid', level: 4, rule: '10.A.6.3' },
    magician: { char: 'magician', level: 2, rule: '10.A.6.4' },
    wizard: { char: 'wizard', level: 3, rule: '10.A.6.5' },
    woodsGirl: { char: 'woods-girl', level: 2, rule: '10.A.6.6' },
    elf: { char: 'elf', level: 1, rule: '10.A.6.7' },
    knights: { chars: ['white-knight', 'black-knight'], level: 3, rule: '10.A.6.8' },
};

/** Is the optional rule on in this game? The one switch for all of them (`options.optionalAbilities`). */
export const optionalAbilities = st => !!st?.options?.optionalAbilities;

/** Does this character have this optional ability in this game? `ch` is the acting character unless given. With the switch off, never. The Knights' Adjustment is also its own switch (`options.knightsAdjustment`). */
export function abilityOn(st, name, ch = st?.ch) {
    const a = ABILITIES[name];
    if (!a || !ch) return false;
    if (!(a.chars ?? [a.char]).includes(ch.id)) return false;
    if (name === 'knights' && st?.options?.knightsAdjustment) return true;
    return optionalAbilities(st) && levelOf(ch) >= a.level;
}

/** Is the Knights' Adjustment in force in this game for any character (his own switch, or the one switch for all)? (setup.js: the relationships are made before the character exists.) */
export const knightsOn = st => !!st?.options?.knightsAdjustment || optionalAbilities(st);

// ---- the Elf (10.A.6.7) ----
export const ELF_KINDS = ['light', 'great'];
/** The kind of Elf a game gives when the player did not say: the Light Elf. */
export const DEFAULT_ELF_KIND = 'light';

/** Is this chit one the Elf of this kind cannot play? A Light Elf: his Medium strength Fight and Move chits. A Great Elf: his MOVE L2* chit (a Light Move chit of time 2 with one asterisk). */
export function elfCannotPlay(kind, chit) {
    if (kind === 'light') return chit.strength === 'M' && (chit.type === 'move' || chit.type === 'fight');
    if (kind === 'great') return chit.type === 'move' && chit.strength === 'L' && chit.time === 2 && (chit.effort ?? 0) === 1;
    return false;
}

// ---- the Wizard (10.A.6.5) ----
/** The Wizard's 2nd-level chit of MOVE M5 is, with the ability, a MAGIC III2* chit: [the chit's place on his card, what it becomes]. */
export const WIZARD_CHIT = { n: 5, becomes: { type: 'magic', strength: null, time: 2, effort: 1, numeral: 'III' } };
