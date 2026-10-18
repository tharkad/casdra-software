import { h } from '../dom.js';
import { connectShared, ApiError } from '../shared_online.js';
import { inviteLink, forgetRace, rememberRace } from '../online.js';
import { styleOf } from '../party.js';
import { counterIcon } from '../shared_ui.js';
import { CHARACTERS } from './newgame.js';
import { ask } from '../ask.js';

// The lobby of a SHARED game (docs/design/online-shared.md): who has taken a seat, who has chosen which character (no two alike), who is ready, and the host's Start.
// Sealed choices (goals, starting dwelling, starting spells) are made in the new-game wizard's character step and are never shown to the others.
// When the answer says the game is playing (or over) the screen hands over to the game screen in its shared mode.
const nameOfChar = id => CHARACTERS.find(c => c.id === id)?.name ?? id;

export function sharedLobbyScreen(ctx) {
    const game = ctx.params?.game;
    const root = h('main', { class: 'screen lobby', 'data-screen': 'lobby' });
    let answer = null, error = null, busy = false, copied = false, confirmLeave = false, conn = null, status = 'here', notice = null, left = null, renewed = false;
    const redraw = () => {
        if (!root.isConnected) return;
        const y = root.querySelector('.body')?.scrollTop ?? 0;          // (a push from the server redraws the lobby: keep the place the player was reading)
        root.replaceChildren(...build());
        const body = root.querySelector('.body'); if (body && y) body.scrollTop = y;
    };
    const showLeave = () => { confirmLeave = true; redraw(); root.querySelector('[data-confirm=leave]')?.scrollIntoView({ block: 'end' }); };
    const stop = () => conn?.unwatch();
    const toGame = () => { stop(); ctx.go('game', { shared: game }); };

    const take = a => {
        // the host left and the table came to me: say so once, in words (docs/design/multiplayer-harden.md section 5)
        if (answer?.lobby && a.lobby && !answer.you.host && a.you?.host) notice = `${answer.lobby.seats.find(s => s.host)?.name ?? 'The host'} left the table. You are the host now: you press Start.`;
        answer = a; error = null;
        if (a.phase === 'playing' || a.phase === 'over') { toGame(); return; }
        redraw();
    };
    async function guard(fn) {
        busy = true; error = null; redraw();
        try { await fn(); } catch (e) { error = e.message; if (e instanceof ApiError && (e.status === 401 || e.status === 404)) error = 'This game is no longer on the server.'; } finally { busy = false; redraw(); }
    }
    if (!game) { root.append(h('div', { class: 'note' }, 'No game.')); return root; }
    conn = connectShared(game, { onUpdate: a => { if (root.isConnected) take(a); else stop(); }, onStatus: s => { status = s; redraw(); } });
    conn.view().then(() => { if (root.isConnected) conn.watch(); }).catch(e => { error = e.status === 401 || e.status === 404 ? 'This game is no longer on the server.' : e.message; redraw(); });

    const copyInvite = () => {
        const link = inviteLink(game);
        const done = () => { copied = true; redraw(); setTimeout(() => { copied = false; redraw(); }, 2200); };
        (navigator.clipboard?.writeText(link) ?? Promise.reject()).then(done, () => { game._showLink = link; redraw(); });
    };

    // The invitation is good for a few days (MR_INVITE_DAYS); the host sees until when, and can send a new one (the old one stops working).
    const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
    const expiry = iso => {
        if (!iso) return null;
        const ms = Date.parse(iso) - Date.now(), w = when(iso);
        if (ms <= 0) return { bad: true, text: 'The invitation has run out: nobody can join with it. Make a new one.' };
        return { bad: ms < 24 * 3600 * 1000, text: ms < 24 * 3600 * 1000 ? `The invitation runs out ${w ? `on ${w}` : 'soon'}, within a day.` : `The invitation is good until ${w}.` };
    };
    async function newInvite() {
        await guard(async () => { const r = await conn.invite(); game.invite = r.invite; rememberRace(game); renewed = true; setTimeout(() => { renewed = false; redraw(); }, 3000); await conn.view(); });
    }
    function rulesLine(info) {
        const mode = info.mode === 'sudden' ? 'Sudden death' : info.mode === 'endless' ? 'Endless' : info.lastDay === 28 ? 'A month: 28 days' : `${info.lastDay / 7} week${info.lastDay === 7 ? '' : 's'}`;
        const o = info.options ?? {};
        const extra = [o.knightsAdjustment && "Knights' Adjustment", o.watchfulNatives && 'Watchful Natives', o.quietMonsters && 'Quiet Monsters'].filter(Boolean);
        return h('div', { class: 'lb-rules' },
            h('div', {}, h('b', {}, mode), h('span', {}, ` · up to ${info.maxSeats} players`)),
            h('div', { class: o.dayEnd === false ? 'dayend' : 'dayend on', 'data-dayend': o.dayEnd === false ? 'off' : 'on' }, o.dayEnd === false ? 'No trading after the fights.' : 'Characters who stand together may trade after the fights.'),
            h('div', { class: o.pvp ? 'pvp on' : 'pvp' }, o.pvp ? 'Players may fight each other: whoever is struck down loses their gold and belongings to the one who did it.' : 'Players cannot attack each other.'),
            extra.length ? h('div', { class: 'hint' }, extra.join(' · ')) : null);
    }

    function seatRow(s, i, mine) {
        const st = styleOf(i);
        const person = { shape: st.shape, color: st.color, letter: s.name[0].toUpperCase(), mine: s.seat === mine, hidden: false, dead: false };
        return h('li', { class: `seatcard${s.seat === mine ? ' me' : ''}${s.ready ? ' ready' : ''}`, 'data-seat': s.seat, 'data-ready': s.ready ? '1' : '0' },
            counterIcon(person, 34),
            h('span', { class: 'sc-main' },
                h('b', {}, s.name, s.seat === mine ? h('em', {}, ' you') : null, s.host ? h('em', {}, ' host') : null),
                h('small', { class: s.character ? 'chosen' : 'choosing' }, s.character ? nameOfChar(s.character) : 'choosing a character…')),
            h('span', { class: `sc-state ${s.ready ? 'ready' : 'wait'}` }, s.ready ? 'Ready' : 'Not yet'),
            h('i', { class: `pdot${s.present ? ' on' : ''}`, 'aria-label': s.present ? 'here now' : 'away' }));
    }
    function emptyRow(n, i) {
        return h('li', { class: 'seatcard empty', 'data-seat': 'empty' }, h('span', { class: 'sc-empty', 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'sc-main' }, h('b', {}, 'An empty seat'), h('small', {}, 'waiting for a player to join')), h('span', { class: 'sc-state wait' }, 'Open'));
    }

    // Leaving the table before the game starts (docs/design/multiplayer-harden.md section 5): a guest gives the seat and the character back; the host hands the table to the player who sat down
    // first after him, or cancels the game for everybody; an empty table is simply closed.
    function leaveBox(me, seats) {
        const others = seats.filter(s => s.seat !== me.seat), close = () => { confirmLeave = false; redraw(); };
        const go = body => guard(async () => { const r = await conn.leave(body); forgetRace(game.game, game.server); left = r; confirmLeave = false; });
        if (!me.host) return h('div', { class: 'confirmbox', role: 'alertdialog', 'data-confirm': 'leave' },
            ask('Leave the table?', 'Your seat and your character are free again, and the next person to follow the invitation takes the seat.', { compact: true }),
            h('div', { class: 'row2' }, h('button', { class: 'btn', 'data-act': 'leave-stay', onclick: close }, 'Stay'), h('button', { class: 'btn primary', 'data-act': 'leave-ok', onclick: () => go({}) }, 'Leave')));
        if (!others.length) return h('div', { class: 'confirmbox', role: 'alertdialog', 'data-confirm': 'leave' },
            ask('Close the table?', 'Nobody else has sat down, so leaving closes the game.', { compact: true }),
            h('div', { class: 'row2' }, h('button', { class: 'btn', 'data-act': 'leave-stay', onclick: close }, 'Stay'), h('button', { class: 'btn primary', 'data-act': 'leave-ok', onclick: () => go({}) }, 'Close the table')));
        return h('div', { class: 'confirmbox', role: 'alertdialog', 'data-confirm': 'leave' },
            ask('Leave the table?', `${others.length === 1 ? others[0].name : 'The player who sat down first after you'} becomes the host and starts the game. Or cancel it: the table closes for everybody, and the invitation stops working.`, { compact: true }),
            h('button', { class: 'btn danger', 'data-act': 'leave-cancel', onclick: () => go({ close: true }) }, 'Cancel the game for everybody'),
            h('div', { class: 'row2' }, h('button', { class: 'btn', 'data-act': 'leave-stay', onclick: close }, 'Stay'), h('button', { class: 'btn primary', 'data-act': 'leave-ok', onclick: () => go({}) }, 'Hand over and leave')));
    }

    function build() {
        const back = h('header', { class: 'bar' }, h('button', { class: 'back', 'aria-label': 'Back', onclick: () => { stop(); ctx.go('online'); } }, '‹'), h('h1', {}, 'Shared game'));
        if (left) return [h('header', { class: 'bar' }, h('h1', {}, 'Shared game')), h('div', { class: 'body' }, ask(left.status === 'closed' ? 'The game is closed.' : 'You have left the table.', left.why ?? (left.status === 'closed' ? 'Nobody else is seated.' : 'Your seat and character are free again.'), { compact: true }),
            h('div', { class: 'row-end' }, h('button', { class: 'btn primary', 'data-act': 'left-ok', onclick: () => ctx.go('online') }, 'Back to the games')))];
        if (!answer) return [back, h('div', { class: 'body' }, error ? h('p', { class: 'hint bad', role: 'alert' }, error) : h('p', { class: 'hint' }, 'Opening the table…'),
            error ? h('button', { class: 'btn', 'data-act': 'forget', onclick: () => { forgetRace(game.game, game.server); stop(); ctx.go('online'); } }, 'Forget this game') : null)];
        const lb = answer.lobby, info = answer.game, me = answer.you;
        if (answer.phase === 'closed' || !lb) return [back, h('div', { class: 'body' }, h('p', { class: 'hint bad', role: 'alert' }, 'The host cancelled the game.'), h('button', { class: 'btn', 'data-act': 'forget', onclick: () => { forgetRace(game.game, game.server); stop(); ctx.go('online'); } }, 'Forget it'))];
        const seats = [...lb.seats].sort((a, b) => a.seat - b.seat), openN = lb.maxSeats - seats.length;
        const notReady = seats.filter(s => !s.ready), mineChoice = lb.mine?.character;
        // the situation and the reason, for whoever is reading
        let line, why;
        if (openN > 0) { line = `Waiting for ${openN} more ${openN === 1 ? 'player' : 'players'}.`; why = me.host ? 'Send the invite below. The game starts when every seat is taken and everyone has picked a character.' : 'The host starts the game when every seat is taken and everyone has picked a character.'; }
        else if (notReady.length) { line = `Waiting for ${notReady.map(s => s.name).join(' and ')} to pick a character.`; why = 'Each player takes a different character; the game starts once everyone has one.'; }
        else if (me.host) { line = 'Everyone is ready.'; why = 'Press Start to lay out the realm and begin day 1. Nobody can join after that.'; }
        else { line = `Everyone is ready. Waiting for ${seats.find(s => s.host)?.name ?? 'the host'} to start.`; why = 'The host presses Start.'; }
        const link = inviteLink(game);
        return [back,
            h('div', { class: 'body' },
                notice ? h('div', { class: 'tb-notice', role: 'status', 'data-notice': 'host' }, h('span', {}, notice), h('button', { class: 'x', 'aria-label': 'Dismiss', onclick: () => { notice = null; redraw(); } }, '\u2715')) : null,
                ask(line, why, { compact: true }),
                rulesLine(info),
                h('h3', { class: 'optgroup' }, `The table (${seats.length} of ${lb.maxSeats})`),
                h('ol', { class: 'seatlist' }, ...seats.map((s, i) => seatRow(s, i, me.seat)), ...Array.from({ length: openN }, (_, i) => emptyRow(openN, seats.length + i))),
                h('h3', { class: 'optgroup' }, 'Your character'),
                h('div', { class: 'mychoice', 'data-mine': mineChoice ?? '' },
                    h('span', { class: 'mc-main' }, h('b', {}, mineChoice ? nameOfChar(mineChoice) : 'Not chosen yet'), mineChoice ? h('small', {}, `begins at the ${lb.mine.startDwelling ?? CHARACTERS.find(c => c.id === mineChoice)?.starts[0] ?? 'Inn'} · goals and spells sealed`) : h('small', {}, 'Pick one before the game can start')),
                    h('button', { class: 'btn', 'data-act': 'change-char', disabled: busy || null, onclick: () => { stop(); ctx.onlineIntent = { mode: 'choose', kind: 'shared', game, mySeat: me.seat, seats: lb.seats, current: mineChoice }; ctx.newGame = null; ctx.go('newgame'); } }, mineChoice ? 'Change' : 'Choose')),
                game.invite && openN > 0 ? h('div', { class: 'invite' },
                    h('h3', { class: 'optgroup' }, 'Invite'),
                    h('button', { class: 'btn', 'data-act': 'copy-invite', onclick: copyInvite }, copied ? 'Copied' : 'Copy invite link'),
                    h('p', { class: 'invitelink', 'data-field': 'invite-link' }, link),
                    me.host && lb.inviteExpires ? (() => { const ex = expiry(lb.inviteExpires); return h('p', { class: ex.bad ? 'hint bad' : 'hint', 'data-invite-expiry': ex.bad ? 'soon' : 'ok' }, ex.text); })() : null,
                    me.host ? h('button', { class: 'btn quiet', 'data-act': 'new-invite', disabled: busy || null, onclick: newInvite }, renewed ? 'New link made' : 'Make a new link') : null,
                    me.host ? h('p', { class: 'hint' }, 'A new link stops the old one working, and is good for the usual three days.') : null) : null,
                error ? h('p', { class: 'hint bad', role: 'alert' }, error) : null,
                status === 'away' ? h('p', { class: 'hint' }, 'Reconnecting…') : null,
                confirmLeave ? leaveBox(me, seats) : null),
            h('footer', { class: 'dock' },
                me.host
                    ? h('div', { class: 'row2 lb-actions' },
                        h('button', { class: 'btn quiet', 'data-act': 'leave', onclick: showLeave }, 'Leave'),
                        h('button', { class: 'btn primary big', 'data-act': 'start-game', disabled: !lb.canStart || busy || null, onclick: () => guard(() => conn.start()) }, lb.canStart ? 'Start the game' : openN > 0 ? `Waiting for ${openN}` : 'Waiting for characters'))
                    : h('div', { class: 'row2 lb-actions' },
                        h('button', { class: 'btn quiet', 'data-act': 'leave', onclick: showLeave }, 'Leave'),
                        h('div', { class: 'lb-wait', role: 'status', 'data-wait': 'host' }, `Waiting for ${seats.find(s => s.host)?.name ?? 'the host'} to start`))),
        ];
    }
    root.append(...build());
    return root;
}
