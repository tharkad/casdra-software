// Spells (rules 4.6, 8.3.9): the facade. The work is in magic/: colour.js (colours of magic), cast.js (casting), fx.js (effects with a duration),
// registry.js and handlers/ (one file per spell). Everything the rest of the engine, the UI and the tests import from here is still here.
export { COLORS, TYPE_COLOR, COLOR_MEANING, enchantableChits, colorChits, isMagicDay, dayColors, nextDayWith, colorSources, colorsAt } from './magic/colour.js';
export { ATTACK_SPELLS, castable, knownSpells, castOptions, blockedSpells, canCastUsefully, castSpell, resolveCasts as resolveSpells, aimOptions, applyAim } from './magic/cast.js';
