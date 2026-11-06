// options_list.js: the optional rules of the New Game screen, as data (title, one plain line, the rule number, the full text). Pure (no DOM): the wizard (screens/newgame.js) draws them as switches and the
// Menu's Settings look (play/sheet_settings.js, gamesettings.js) lists them, with their values, in a game in progress.
import { SECTIONS_GROUP } from './combat/sections_opts.js';

// Optional rules (3.1 section 10). Everything is off until switched on, as printed. A plain sentence on the row; the rule number and the full text sit behind the (i).
export const OPTION_GROUPS = [
    // (the one switch that starts ON: it is rule 8.8.3 as printed, "combat is held every evening a spell could be cast", not an optional rule)
    { title: 'Magic', items: [
        { k: 'castAnytime', title: 'Cast whenever you can', rule: '8.8.3', line: 'Each evening stops for any spell you could cast.',
          text: 'Combat is held every evening a spell could be cast. On: you are asked each evening you could cast anything, even a spell with nothing to do tonight (you can say Not tonight). Off: the evening stops only when a spell would do something.' },
    ] },
    { title: 'Denizens', items: [
        { k: 'quietMonsters', title: 'Quiet Monsters', rule: '10.B.1', line: 'A hidden character is left alone by wandering monsters.',
          text: 'A character who is hidden when his turn ends does not turn up the chits in his tile, and monsters from the Appearance Chart do not come.' },
        { k: 'watchfulNatives', title: 'Watchful Natives', rule: '10.B.4', line: 'Natives you strike hit back in the same round.',
          text: 'Natives you strike surprise you back: the whole group fights you in the same round, not the next.' },
    ] },
    SECTIONS_GROUP,
    { title: 'Characters', items: [
        // (a house rule that starts ON, like the one above: the characters of one player tell each other their finds while planning; the engine stores only the OFF switch)
        { k: 'shareAtBirdsong', title: 'Hand things over at Birdsong', rule: '4.5.5h', line: 'Your characters may tell each other finds and hand over belongings while you plan.',
          text: 'The book lets characters trade and share information at the start of a phase or after the evening’s fights. This house rule adds Birdsong (and Midnight, which is the same moment) for the characters of one player standing in the same clearing: they may tell each other what they found and give each other belongings and gold, so everything is in the right hands for the plan of the day.' },
        { k: 'knightsAdjustment', title: "Knights’ Adjustment", rule: '10.A.6.8', line: 'Tames the Knights’ trading edge: their allies are only Friendly.',
          text: 'The White Knight is only Friendly with the Order, and the Black Knight Friendly with the Company, instead of Allies. It tames their trading advantage.' },
    ] },
];

