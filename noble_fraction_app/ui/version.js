// The game's own version, shown on the title screen. It is the version of the game CONTENT: the desktop app updates the game in place,
// so this can be newer than the installed desktop app, whose version is shown beside it.
// Bump it with every release; tests/version.test.mjs checks it is well-formed and never older than the desktop app.
export const VERSION = '0.5.8';
