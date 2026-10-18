import { clear } from './dom.js';
import { titleScreen } from './screens/title.js';
import { newGameScreen } from './screens/newgame.js';
import { realmScreen } from './screens/realm.js';
import { gameScreen, loadSaved } from './screens/game.js';
import { helpScreen, stub } from './screens/info.js';
import { historyScreen } from './screens/history.js';
import { onlineScreen } from './screens/online.js';
import { sharedLobbyScreen } from './screens/lobby.js';
import { parseInvite } from './online.js';

// A very small router: the app is a stack of full-screen views. Each screen is a function (ctx) -> element.
const app = document.getElementById('app');
const SCREENS = { title: titleScreen, newgame: newGameScreen, realm: realmScreen, game: gameScreen, rules: helpScreen, history: historyScreen, online: onlineScreen, sharedlobby: sharedLobbyScreen,
    settings: stub('Settings', 'No settings yet. Your game saves itself on this device after every step.') };

const ctx = {
    screen: 'title',
    saved: [],                                           // the games on this device
    go(name, params = {}) { ctx.screen = name; ctx.params = params; render(); },
};

function render() {
    if (ctx.screen === 'title') {
        const s = loadSaved();
        ctx.saved = s && s.period !== 'over' ? [{ id: 'auto', character: s.ch.name, day: s.day }] : [];
    }
    clear(app);
    const make = SCREENS[ctx.screen] ?? SCREENS.title;
    app.append(make(ctx));
}

// The game is laid out for a phone held upright. Where the browser allows it the orientation is locked (installed apps, full screen);
// elsewhere index.html's #turnup cover asks for the phone to be turned back.
function lockPortrait() {
    try { const p = screen.orientation?.lock?.('portrait'); if (p?.catch) p.catch(() => {}); } catch { /* not allowed here */ }
}
lockPortrait();
addEventListener('pointerdown', lockPortrait, { once: true });

window.__mr = { ctx, render };
// An invite link (#race=GAME.INVITE) opens the Play online screen with the invite filled in.
const invite = parseInvite(location.hash);
if (invite) { ctx.screen = 'online'; ctx.params = { invite, joinText: `${invite.game}.${invite.invite}` }; if (invite.server) ctx.params.server = invite.server; history.replaceState(null, '', location.pathname + location.search); }
render();
