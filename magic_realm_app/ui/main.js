import { clear } from './dom.js';
import { titleScreen } from './screens/title.js';
import { newGameScreen } from './screens/newgame.js';
import { realmScreen } from './screens/realm.js';
import { gameScreen, loadSaved } from './screens/game.js';
import { helpScreen, stub } from './screens/info.js';

// A very small router: the app is a stack of full-screen views. Each screen is a function (ctx) -> element.
const app = document.getElementById('app');
const SCREENS = { title: titleScreen, newgame: newGameScreen, realm: realmScreen, game: gameScreen, rules: helpScreen,
    join: stub('Join a game', 'Joining other players\' games (RealmSpeak or by mail) is planned. This build plays one character alone.'),
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

window.__mr = { ctx, render };
render();
