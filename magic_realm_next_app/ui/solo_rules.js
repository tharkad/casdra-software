// solo_rules.js: what the Solo mode changes, in plain words, for the "Solo rules" card on the realm step of the New Game screen (screens/newgame.js). Pure data.
// `built` says whether the engine does the rule yet. The card marks a rule that is not built "coming", so it never promises more than the game does: when an engine agent lands a rule (search for
// `solitaire` in app/engine/*.js), flip its flag here. The engine reads `options.solitaire` (rules 10.E.1) and `options.optionalAbilities` (10.A.6), which this mode sets.
export const SOLO_RULES = [
    { id: 'two-rows', rule: '10.E.1.7', built: true, title: 'Two rows of denizens prowl each day',
      line: 'At Sunrise two Monster Rolls are made, and both rows can appear and move. Doubles put both in one row, and only that row prowls.' },
    { id: 'valley-chits', rule: '10.E.1.5', built: true, title: 'The Valley chits stay face down',
      line: 'Nothing in the Valleys is turned up at the start. Dwellings and Ghosts show as campfires when their chits are turned up.' },
    { id: 'enter-by-road', rule: '10.E.1.6', built: true, title: 'You enter the map along a road',
      line: 'Your first activity is a Move onto the map along a road that runs to the Borderland. A new character enters by the same road.' },
    { id: 'all-must-win', rule: '10.E.1.4.2', built: true, title: 'All of your characters must win',
      line: 'Take up to four characters. You win only if every one of them meets their goals.' },
    { id: 'abilities', rule: '10.A.6', built: true, title: 'Abilities for the characters who need a team',
      line: 'The Captain, Druid, Magician, Wizard, Woods Girl, Elf and the Knights gain extra abilities, so they do well without allies to trade with.' },
];
export const soloRulesComing = (rules = SOLO_RULES) => rules.filter(r => !r.built);
