// The game screen (router entry): status strip, map, a dock that follows the day, and sheets for the plan, the character and the log.
// The screen itself lives in screens/play/*.js (see docs/design/redesign/MODULE-MAP.md): this file builds the one shared state object (G), wires the table's agreements,
// starts the screen (boot) and keeps the voice switch (Story / Detail) redrawing it. It keeps exporting what other modules import: gameScreen and the save slot.
import { onVoice } from '../voice.js';
import { tableAgreements } from './play/actions.js';
import { boot } from './play/boot.js';
import { render } from './play/shell.js';
import { newPlayState } from './play/state.js';

export { saveGame, loadSaved, clearSaved } from './play/state.js';

export function gameScreen(ctx) {
    const G = newPlayState(ctx);
    G.table = tableAgreements(G);
    boot(G);
    const offVoice = onVoice(() => { if (!G.root.isConnected) { offVoice(); return; } if (G.st) render(G); });
    return G.root;
}
