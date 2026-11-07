// calendar_turns.js: the words of the Calendar sheet's "Turn order" tab, and where in the day a game is. No DOM here, so a test can read it.
// The stages are the periods the app already names (title.js PERIOD_LABEL): Birdsong, Sunrise, Daylight, Day's end, Sunset, Evening, Midnight.
// The activities are the ones the plan sheet offers (play/kit.js ACT_LABEL). Spells are cast in the Evening (rule 8.0), so "Enchant" is the only magic a player plans.

export const STAGES = [
    { key: 'birdsong', name: 'Birdsong', line: 'You plan the day.',
      more: ['Pick one activity for each phase: Move, Hide, Search, Rest, Trade, Hire, Alert or Enchant.',
          'You have two Basic phases, and two more Sunlight phases if you stay out of caves all day. A horse or a treasure can add a phase.',
          'Plans are secret. A plan you cannot carry out becomes a blank phase.'] },
    { key: 'sunrise', name: 'Sunrise', line: 'The realm wakes.',
      more: ['One die, the Monster Roll, says which row of monsters prowls today.',
          'On the seventh day of a week the prowlers go home, and the day’s colours of magic fill the land until Midnight.',
          'Hirelings are put with their guides, and the Attention chits are mixed.'] },
    { key: 'daylight', name: 'Daylight', line: 'You act, one phase at a time.',
      more: ['Each phase goes in three steps. First you may trade or rearrange what you carry. Then you do the activity you planned. Then anyone may try to block you.',
          'A block ends your turn, and the phases you had left are lost. Monsters in your clearing block you at once unless you are hidden.',
          'With a party, each character takes their whole turn before the next one begins.'] },
    { key: 'dayend', name: 'Day’s end', line: 'Your turn closes.',
      more: ['Monsters prowling in your tile come to your clearing.',
          'The face-down chits in your tile turn up, and each may call monsters. They stay face up until Midnight and call only once a day.'] },
    { key: 'sunset', name: 'Sunset', line: 'The day’s spells end.',
      more: ['Day spells cast last evening wear off.',
          'Every clearing that holds a character or a hired leader will have an Evening. A clearing with only monsters or natives does not.'] },
    { key: 'evening', name: 'Evening', line: 'Combat, one clearing at a time.',
      more: ['Each clearing fights alone while the others wait. Spells are cast here, and only here.',
          'There are at least two rounds, even with no enemy. They go on until two rounds in a row pass quietly.',
          'Afterwards you may trade and rearrange what you carry.'] },
    { key: 'midnight', name: 'Midnight', line: 'The day is put away.',
      more: ['Potions wear off, weapons are unalerted, alerted Magic chits tire, and face-up map chits turn back down. The day’s colour of magic ends.',
          'On the last day the game ends here and is scored.'] },
];

// Who goes first, in the app’s own order of play (engine/day.js drawChits and sunsetAll).
export const PARTY_LINES = [
    'Alone, you simply take every turn in turn.',
    'With a party, Birdsong is all at once and secret: the day waits for the last plan.',
    'At Sunrise the Attention chits are drawn at random. That draw is the order of the whole day, and the first character drawn leads. Each takes their whole Daylight turn before the next begins.',
    'A follower goes right after their guide. A hired leader, or a monster you take in hand, has a chit of its own.',
    'The Evening keeps the same order: the clearing of the first character drawn fights first, then the first drawn of the clearings left. A clearing with several characters is one fight.',
];

// The stage a game is in. `period` is the engine's period; `pending` the type of the question the viewer is asked (or null).
// 'turn-end' is a question of the Daylight period (a party stays in Daylight until the last chit is played), so either one means Day’s end.
export function stageKey(period, pending = null) {
    if (period === 'daylight') return pending === 'turn-end' ? 'dayend' : 'daylight';
    if (period === 'turn-end') return 'dayend';
    if (period === 'setup') return 'birdsong';
    return STAGES.some(s => s.key === period) ? period : null;          // 'over' (and anything unknown): no stage is lit
}

// One line about where the viewer is inside the lit stage, or '' when there is nothing more to say.
// `d`: { pending, phase (0-based), phases (count planned), several (a party), turnName (whose Daylight turn it is), count (living characters planned/total) }
export function nowLine(key, d = {}) {
    if (key === 'birdsong') return d.pending === 'plan' ? 'You are recording today’s plan.' : d.several ? 'Your plan is in. The others are still planning.' : '';
    if (key === 'daylight') {
        if (d.pending === 'phase' && d.phase != null) return `You are in phase ${d.phase + 1}${d.phases ? ` of ${d.phases}` : ''}.`;
        return d.several && d.turnName ? `It is ${d.turnName}’s turn.` : '';
    }
    if (key === 'dayend') return 'Your turn is over: read what it did.';
    if (key === 'evening') return d.pending ? 'Your clearing is fighting now.' : '';
    return '';
}
