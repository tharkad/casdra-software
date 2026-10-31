// combat/modes.js: every question a fight can ask (every `st.pending.type` that starts with 'combat-', written by engine/combat.js, hirelings (hirefight.js) and battle.js), and the screen mode of the
// combat scene that answers it. The engine refuses any answer that is not the kind it is waiting for ("that is not what the fight is waiting for", day.js), so a screen that does not know a
// question would offer buttons that cannot work. tests/fight_asks_ui.test.mjs holds this table to the engine (a new `type: 'combat-...'` without a mode here fails), and tools/ui_pending.py renders
// the scene for each one. 'unknown' is the safety net: a question nobody has drawn yet gets an honest screen (what it is, a way back to the map), never the Encounter tiles.
export const PENDING_MODES = {
    'combat-drinks': 'meet', 'combat-pay': 'meet', 'combat-choice': 'meet',            // the evening's Meeting: drinks, pay, fight or not
    'combat-encounter': 'encounter',                                                    // the Encounter step (also the quiet evening held for a spell, and a Melee Sections round after its result)
    'combat-lure': 'lure',                                                              // 8.3.4: several characters in one clearing, each may draw creatures onto his own sheet
    'combat-charge': 'charge',                                                          // 8.3.6: character against character (a shared table only: screens/pvpui.js)
    'combat-deploy': 'deploy',                                                          // Melee Sections: hirelings sent at creatures
    'combat-melee': 'melee', 'combat-shift': 'shift',
    'combat-wounds': 'grid', 'combat-fatigue': 'grid',
    'combat-over': 'over',
};
/** The mode that answers a question; 'unknown' for one this table does not list. (the scene turns 'result' on top of some of these when the round has news) */
export const modeOfPending = type => PENDING_MODES[type] ?? 'unknown';
/** Modes the plain (one screen, one character) combat scene draws itself. 'charge' is a table question: with no table there is nothing to answer it with, and the scene says so. */
export const SCENE_MODES = new Set(['meet', 'encounter', 'lure', 'deploy', 'melee', 'shift', 'grid', 'over']);
