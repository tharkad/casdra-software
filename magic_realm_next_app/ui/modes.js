// modes.js: the three ways to play, chosen first on the New Game screen (docs/design/MODES.md). Pure (no DOM, no engine), so the wizard, the title, the History and the Menu name a game the same way and tests hold it.
//   Adventure   the standard game: a length, a party of one to four, goals; alone or (online) with others. Today's game, only its name is new.
//   Solo        one player against the realm with the solitaire rules (10.E.1) and the optional abilities (10.A.6): the engine options `solitaire` and `optionalAbilities`.
//   Roguelike   a campaign: one character kept from run to run (screens/campaign.js, roguelike/*).
// A game's kind is read from its params (the saved game's `session.params`, a History record's `params`): the `roguelike` tag, or `options.solitaire`; anything else (every game saved before this) is an Adventure.

export const MODES = [
    { id: 'adventure', title: 'Adventure', line: 'The standard game: choose a length, a party and your goals. Play alone or with others.', icon: 'flag' },
    { id: 'solo', title: 'Solo', line: 'Alone against the realm, with the solitaire rules and abilities that make characters fend for themselves.', icon: 'flame' },
    { id: 'roguelike', title: 'Roguelike', line: 'A campaign: one character you keep from run to run. Survive to grow; fall and lose ground.', icon: 'skull' },
];
export const MODE_IDS = MODES.map(m => m.id);
export const DEFAULT_MODE = 'adventure';

/** 'adventure' | 'solo' | 'roguelike' for a game's params (or a History record: `{ params }` works too; so does a saved game's `{ session: { params } }`). Old records have no kind: they are Adventures. */
export function modeOf(x) {
    const p = x?.params ?? x?.session?.params ?? x ?? {};
    if (p.roguelike) return 'roguelike';
    if (p.options?.solitaire || p.solo) return 'solo';
    return 'adventure';
}
/** The name the player reads: 'Adventure' | 'Solo' | 'Roguelike'. */
export const modeName = x => MODES.find(m => m.id === modeOf(x)).title;
/** "this adventure" / "this solo game" / "this run": the game in a sentence ("Abandon this ..."). */
export const thisGame = x => ({ adventure: 'this adventure', solo: 'this solo game', roguelike: 'this run' })[modeOf(x)];

// ---- the options each mode starts with ----
// The recommended extras Solo turns on (10.E.1.8: "the optional rules are highly recommended for solitaire players"; 10.A.6: the abilities for characters who rely on a team), from the switches that exist in options_list.js:
// Watchful Natives (10.B.4, the denizens fight back), Knights' Adjustment (10.A.6.8, one of the optional abilities), and the two house defaults every game starts with (Cast whenever you can, Hand things over at Birdsong).
// Quiet Monsters is left off: it makes the realm gentler, and the book offers it to beginners. `optionalAbilities` is the engine's own switch for 10.A.6 (the other characters), on in Solo.
export const SOLO_DEFAULTS = { knightsAdjustment: true, watchfulNatives: true, quietMonsters: false, castAnytime: true, shareAtBirdsong: true, optionalAbilities: true };
export const ADVENTURE_DEFAULTS = { knightsAdjustment: false, watchfulNatives: false, quietMonsters: false, castAnytime: true, shareAtBirdsong: true };
export const defaultsFor = mode => ({ ...(mode === 'solo' ? SOLO_DEFAULTS : ADVENTURE_DEFAULTS) });

/** The options object a game is started with: what the wizard holds, plus the engine switches of the mode. Only Solo carries `solitaire` (10.E.1) and has the optional abilities (10.A.6) on unless the player switched them off;
 *  an Adventure may switch the abilities on by itself (the switch in options_list.js), a Roguelike run takes its own options. */
export function modeOptions(g) {
    const { solitaire, optionalAbilities, ...rest } = g.options ?? {};
    if ((g.mode ?? DEFAULT_MODE) === 'solo') return { ...rest, solitaire: true, optionalAbilities: optionalAbilities !== false };
    return optionalAbilities ? { ...rest, optionalAbilities: true } : rest;
}

/** Choose a mode on the wizard draft. The options follow the mode's defaults, except the switches the player has changed themselves (`g.touched[key]`, set by the realm step). Returns g. */
export function setMode(g, mode) {
    if (!MODE_IDS.includes(mode)) mode = DEFAULT_MODE;
    if (g.mode !== mode) {
        const { optionalAbilities, ...rest } = g.options ?? {}, touched = g.touched ?? {}, next = { ...rest };
        for (const [k, v] of Object.entries(defaultsFor(mode))) if (!touched[k]) next[k] = v;
        if (touched.optionalAbilities && optionalAbilities !== undefined) next.optionalAbilities = optionalAbilities;
        g.options = next;
    }
    g.mode = mode;
    return g;
}

/** An old wizard draft (no mode; or the roguelike as a length card) becomes a draft of the new screen. The wizard opens on the mode step (-1); a draft already inside the steps stays where it is. Returns g. */
export function migrateDraft(g) {
    if (!g) return g;
    if (g.length === 'roguelike') { g.length = 'month'; g.mode = 'roguelike'; }
    if (!MODE_IDS.includes(g.mode)) g.mode = DEFAULT_MODE;
    if (typeof g.step !== 'number' || g.step < MODE_STEP) g.step = MODE_STEP;
    return g;
}
export const MODE_STEP = -1;           // the step before the four steps of STEPS (newgame.js): it has no "Step n of m"
