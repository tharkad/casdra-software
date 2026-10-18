import { h } from '../dom.js';
import { myName, setMyName, serverUrl, setServerUrl, myRaces, forgetRace, parseInvite } from '../online.js';

// "Play online": start a shared game or a race, join one by invite, or go back to one you are in. A shared game is one realm for the table (the lobby is screens/lobby.js); in a race everyone plays a private copy.
export function onlineScreen(ctx) {
    const p = ctx.params ?? {};
    let name = myName(), status = p.message ?? '';
    const root = h('main', { class: 'screen online', 'data-screen': 'online' });
    const redraw = () => root.replaceChildren(...build());
    const needName = () => { name = (name || '').trim(); if (!name) { status = 'Enter the name the others will see.'; redraw(); return false; } setMyName(name); return true; };

    function build() {
        const races = myRaces();
        const joinText = p.invite ? `${p.invite.game}.${p.invite.invite}` : '';
        return [
            h('header', { class: 'bar' }, h('button', { class: 'back', 'aria-label': 'Back', onclick: () => ctx.go('title') }, '‹'), h('h1', {}, 'Play online')),
            h('div', { class: 'body' },
                h('p', { class: 'hint' }, 'A shared game: two to four players on one map, in one realm. Each morning everyone plans in secret, the chits are drawn for the turn order, and then each plays a whole turn in that order.'),
                h('label', { class: 'fld' }, h('span', {}, 'Your name'),
                    h('input', { type: 'text', maxlength: 24, value: name, placeholder: 'Shown to the others', autocomplete: 'nickname', 'data-field': 'name', oninput: e => { name = e.target.value; } })),
                status ? h('p', { class: 'hint bad', role: 'alert' }, status) : null,
                h('button', { class: 'btn primary big', 'data-act': 'start-shared', onclick: () => { if (needName()) { ctx.onlineIntent = { mode: 'create', kind: 'shared', name }; ctx.newGame = null; ctx.go('newgame'); } } }, 'Start a shared game'),
                h('p', { class: 'hint' }, 'Or a race: everyone gets the same realm and plays their own copy of it. Nothing one player does changes another\u2019s world, and nobody waits for anybody: you race, you do not meet.'),
                h('button', { class: 'btn big', 'data-act': 'start-race', onclick: () => { if (needName()) { ctx.onlineIntent = { mode: 'create', name }; ctx.newGame = null; ctx.go('newgame'); } } }, 'Start a race'),
                h('h3', { class: 'optgroup' }, 'Join with an invite'),
                h('label', { class: 'fld' }, h('span', {}, 'Invite link or code'),
                    h('input', { type: 'text', value: joinText, placeholder: 'Paste the link you were sent', 'data-field': 'invite', oninput: e => { p.joinText = e.target.value; } })),
                h('button', { class: 'btn big', 'data-act': 'join-race', onclick: () => {
                    const inv = parseInvite(p.joinText ?? joinText);
                    if (!inv) { status = 'That is not an invite.'; redraw(); return; }
                    if (!needName()) return;
                    ctx.onlineIntent = { mode: 'join', name, invite: inv, server: inv.server ?? serverUrl() }; ctx.newGame = null; ctx.go('newgame');
                } }, 'Join'),
                races.length ? h('h3', { class: 'optgroup' }, 'Your games') : null,
                ...races.map(r => h('div', { class: 'racerow' },
                    h('button', { class: 'btn', 'data-act': r.kind === 'shared' ? 'open-shared' : 'open-race', onclick: () => (r.kind === 'shared' ? ctx.go('sharedlobby', { game: r }) : ctx.go('game', { online: r })) },
                        h('span', { class: 'col' }, `${r.kind === 'shared' ? 'Shared game' : 'Race'} ${r.game.slice(0, 5)}`, h('small', {}, `as ${r.name}${r.server === location.origin ? '' : ' \u00b7 ' + r.server.replace(/^https?:\/\//, '')}`))),
                    h('button', { class: 'btn quiet', 'aria-label': 'Forget this game on this device', onclick: () => { forgetRace(r.game, r.server); redraw(); } }, '\u00d7'))),
                h('h3', { class: 'optgroup' }, 'Server'),
                h('label', { class: 'fld' }, h('span', {}, 'Game server address'),
                    h('input', { type: 'url', value: serverUrl(), 'data-field': 'server', onchange: e => { setServerUrl(e.target.value === location.origin ? '' : e.target.value); } })),
                h('p', { class: 'hint' }, 'Leave it alone when this page was opened from the game server itself.')),
        ];
    }
    root.append(...build());
    return root;
}
