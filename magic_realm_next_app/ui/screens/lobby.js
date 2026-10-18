import { h } from '../dom.js';
import { connectShared, ApiError } from '../shared_online.js';
import { icon } from '../icons.js';
import { inviteLink, forgetRace, rememberRace } from '../online.js';
import { CHARACTERS } from './newgame.js';
import { sheet } from '../ds.js';
import { bar, charLabel, face, foot, nb, openSheet, seatBadge, sum } from '../front.js';

// The lobby of a SHARED game (docs/design/online-shared.md): who has taken a seat, who has chosen which character (no two alike), who is ready, and the host's Start.
// Sealed choices (goals, starting dwelling, starting spells) are made in the new-game wizard's character step and are never shown to the others.
// When the answer says the game is playing (or over) the screen hands over to the game screen in its shared mode.
const nameOfChar = id => CHARACTERS.find(c => c.id === id)?.name ?? charLabel(id);

export function sharedLobbyScreen(ctx) {
    const game = ctx.params?.game;
    const root = h('main', { class: 'screen ds-screen ds-title flush lobby', 'data-screen': 'lobby' });
    let answer = null, error = null, busy = false, copied = false, closeLeave = null, conn = null, status = 'here', notice = null, left = null, renewed = false;
    const redraw = () => {
        if (!root.isConnected) return;
        const y = root.querySelector('.ds-scroll')?.scrollTop ?? 0;          // (a push from the server redraws the lobby: keep the place the player was reading)
        root.replaceChildren(...build());
        const body = root.querySelector('.ds-scroll'); if (body && y) body.scrollTop = y;
    };
    const stop = () => { closeLeave?.(); conn?.unwatch(); };
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
    if (!game) { root.append(h('div', { class: 'ds-pad' }, h('p', { class: 'ds-voice' }, 'No game.'))); return root; }
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
        const mode = info.mode === 'sudden' ? 'Sudden death' : info.mode === 'endless' ? 'Endless' : info.lastDay === 28 ? '28 days' : `${info.lastDay / 7} week${info.lastDay === 7 ? '' : 's'}`;
        const o = info.options ?? {};
        const extra = [o.knightsAdjustment && 'Knights\u2019 Adjustment', o.watchfulNatives && 'Watchful Natives', o.quietMonsters && 'Quiet Monsters'].filter(Boolean);
        return h('div', { class: 'ds-lbrules' },
            h('p', { class: 'ds-meta' }, [mode, `${info.maxSeats} seats`, o.pvp ? 'players may fight each other' : 'players may not fight each other', ...extra].join(' \u00b7 ')),
            o.pvp ? h('p', { class: 'ds-meta pvp on' }, 'Whoever is struck down loses their gold and belongings to the one who did it.') : null,
            h('p', { class: `ds-meta dayend${o.dayEnd === false ? '' : ' on'}`, 'data-dayend': o.dayEnd === false ? 'off' : 'on' }, o.dayEnd === false ? 'No trading after the fights.' : 'Characters who stand together may trade after the fights.'));
    }

    const pc = seatBadge;

    function seatRow(s, i, mine) {
        return h('li', { class: `ds-hrow seatcard${s.seat === mine ? ' me' : ''}${s.ready ? ' ready' : ''}`, 'data-seat': s.seat, 'data-ready': s.ready ? '1' : '0' },
            pc(i, s.name[0].toUpperCase()),
            h('span', { class: 'main' },
                h('b', {}, s.name, s.seat === mine ? h('span', { class: 'ds-tag gold ds-seattag' }, 'you') : null, s.host ? h('span', { class: 'ds-tag ds-seattag' }, 'host') : null),
                h('span', { class: s.character ? 'chosen' : 'choosing' }, s.character ? nameOfChar(s.character) : 'choosing a character…')),
            s.ready ? h('span', { class: 'ds-tag good' }, 'ready') : h('span', { class: 'ds-tag' }, s.present ? 'here now' : 'away'));
    }
    function emptyRow(n, i) {
        return h('li', { class: 'ds-hrow seatcard empty', 'data-seat': 'empty' }, pc(i, '?', 'ds-empty'), h('span', { class: 'main' }, h('b', {}, 'An empty seat'), h('span', {}, 'Waiting for someone to join')));
    }

    // Leaving the table before the game starts (docs/design/multiplayer-harden.md section 5): a guest gives the seat and the character back; the host hands the table to the player who sat down
    // first after him, or cancels the game for everybody; an empty table is simply closed. The house confirm: the quiet choice at the left, the primary at the right.
    function leaveBox(me, seats) {
        const others = seats.filter(s => s.seat !== me.seat);
        const shut = () => { closeLeave?.(); closeLeave = null; };
        const go = body => () => { shut(); guard(async () => { const r = await conn.leave(body); forgetRace(game.game, game.server); left = r; }); };
        let title, lines, okLabel, cancelBtn = null;
        if (!me.host) { title = 'Leave the table?'; lines = ['Your seat and your character are free again, and the next person to follow the invitation takes the seat.']; okLabel = 'Leave'; }
        else if (!others.length) { title = 'Close the table?'; lines = ['Nobody else has sat down, so leaving closes the game.']; okLabel = 'Close the table'; }
        else { title = 'Leave the table?'; lines = [`${others.length === 1 ? others[0].name : 'The player who sat down first after you'} becomes the host and starts the game. Or cancel it: the table closes for everybody, and the invitation stops working.`]; okLabel = 'Hand over and leave';
            cancelBtn = h('button', { type: 'button', class: 'ds-btn danger block', 'data-act': 'leave-cancel', onclick: go({ close: true }) }, 'Cancel the game for everybody'); }
        const frag = sheet({ eyebrow: 'The table', title, detent: 'hug', x: false, onClose: shut, attrs: { 'data-confirm': 'leave', role: 'alertdialog' },
            body: [h('p', { class: 'ds-voice lg ds-sheet-lede' }, lines[0]), cancelBtn],
            foot: [h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'leave-stay', onclick: shut }, 'Stay'), h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'leave-ok', onclick: go({}) }, okLabel)] });
        closeLeave = openSheet(frag);
    }
    const showLeave = (me, seats) => { closeLeave?.(); leaveBox(me, seats); };
    const hostName = seats => seats.find(s => s.host)?.name ?? 'the host';

    function build() {
        const back = bar('The table', { onBack: () => { stop(); ctx.go('online'); } });
        const plain = (...els) => [back, h('div', { class: 'ds-scroll ds-pad' }, ...els)];
        if (left) return [bar('The table', { onBack: () => ctx.go('online') }), h('div', { class: 'ds-scroll ds-pad' }, h('div', { class: 'ds-ask ask' }, h('b', {}, left.status === 'closed' ? 'The game is closed.' : 'You have left the table.'), h('span', {}, left.why ?? (left.status === 'closed' ? 'Nobody else is seated.' : 'Your seat and character are free again.')))),
            foot(h('span', { class: 'sum' }), h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'left-ok', onclick: () => ctx.go('online') }, 'Back to the games'))];
        if (!answer) return plain(error ? h('p', { class: 'ds-why bad', role: 'alert' }, error) : h('div', { class: 'ds-skel ds-skel-card' }),
            error ? h('button', { type: 'button', class: 'ds-btn block', 'data-act': 'forget', onclick: () => { forgetRace(game.game, game.server); stop(); ctx.go('online'); } }, 'Forget this game') : null);
        const lb = answer.lobby, info = answer.game, me = answer.you;
        if (answer.phase === 'closed' || !lb) return plain(h('p', { class: 'ds-why bad', role: 'alert' }, 'The host cancelled the game.'), h('button', { type: 'button', class: 'ds-btn block', 'data-act': 'forget', onclick: () => { forgetRace(game.game, game.server); stop(); ctx.go('online'); } }, 'Forget it'));
        const seats = [...lb.seats].sort((a, b) => a.seat - b.seat), openN = lb.maxSeats - seats.length;
        const notReady = seats.filter(s => !s.ready), mineChoice = lb.mine?.character;
        // the situation and the reason, for whoever is reading
        let line, why;
        if (openN > 0) { line = `Waiting for ${openN} more ${openN === 1 ? 'player' : 'players'}.`; why = me.host ? 'Send the invite below. The game starts when every seat is taken and everyone has picked a character.' : 'The host starts the game when every seat is taken and everyone has picked a character.'; }
        else if (notReady.length) { line = `Waiting for ${notReady.map(s => s.name).join(' and ')} to pick a character.`; why = 'Each player takes a different character; the game starts once everyone has one.'; }
        else if (me.host) { line = 'Everyone is ready.'; why = 'Press Start to lay out the realm and begin day 1. Nobody can join after that.'; }
        else { line = `Everyone is ready. Waiting for ${hostName(seats)} to start.`; why = 'The host presses Start.'; }
        // what the Start button is waiting for, beside it
        const parts = [...notReady.map(s => s.name), openN > 0 ? `${openN === 1 ? 'one' : openN} more` : null].filter(Boolean);
        const waitText = nb(parts.length ? `Waiting for ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}.` : 'Everyone is ready.');
        const link = inviteLink(game);
        const body = [
            notice ? h('div', { class: 'ds-ask ask ds-notice', role: 'status', 'data-notice': 'host' }, h('span', {}, notice), h('button', { type: 'button', class: 'x', 'aria-label': 'Dismiss', onclick: () => { notice = null; redraw(); } }, icon('close'))) : null,
            h('div', { class: 'ds-ask ask', 'data-ask': '' }, h('b', {}, nb(line)), h('span', {}, nb(why))),
            rulesLine(info),
            h('ol', { class: 'ds-list seatlist', 'aria-label': `The table, ${seats.length} of ${lb.maxSeats}` }, ...seats.map((s, i) => seatRow(s, i, me.seat)), ...Array.from({ length: openN }, (_, i) => emptyRow(openN, seats.length + i))),
            h('div', { class: 'ds-hrow mychoice', 'data-mine': mineChoice ?? '' },
                face(mineChoice), h('span', { class: 'main' }, h('b', {}, mineChoice ? nameOfChar(mineChoice) : 'Not chosen yet'), h('span', {}, nb(mineChoice ? `begins at the ${lb.mine.startDwelling ?? CHARACTERS.find(c => c.id === mineChoice)?.starts[0] ?? 'Inn'} · goals and spells sealed` : 'Pick one before the game can start'))),
                h('button', { type: 'button', class: 'ds-btn sm', 'data-act': 'change-char', disabled: busy || null, onclick: () => { stop(); ctx.onlineIntent = { mode: 'choose', kind: 'shared', game, mySeat: me.seat, seats: lb.seats, current: mineChoice }; ctx.newGame = null; ctx.go('newgame'); } }, mineChoice ? 'Change' : 'Choose')),
            game.invite && openN > 0 ? h('div', { class: 'invite' },
                h('button', { type: 'button', class: 'ds-btn block', 'data-act': 'copy-invite', onclick: copyInvite }, icon('link'), copied ? 'Copied' : 'Copy the invite link'),
                h('p', { class: 'ds-meta ds-linktext', 'data-field': 'invite-link' }, link),
                me.host && lb.inviteExpires ? (() => { const ex = expiry(lb.inviteExpires); return h('p', { class: `ds-meta${ex.bad ? ' bad' : ''}`, 'data-invite-expiry': ex.bad ? 'soon' : 'ok' }, ex.text); })() : null,
                me.host ? h('button', { type: 'button', class: 'ds-btn quiet block', 'data-act': 'new-invite', disabled: busy || null, onclick: newInvite }, renewed ? 'New link made' : 'Make a new link') : null,
                me.host ? h('p', { class: 'ds-meta' }, nb('A new link stops the old one working, and is good for the usual three days.')) : null) : null,
            error ? h('p', { class: 'ds-why bad', role: 'alert' }, error) : null,
            status === 'away' ? h('p', { class: 'ds-why' }, 'Reconnecting…') : null,
            h('button', { type: 'button', class: 'ds-btn quiet block ds-leave', 'data-act': 'leave', onclick: () => showLeave(me, seats) }, 'Leave the table')];
        return [back, h('div', { class: 'ds-scroll ds-fade-b ds-pad' }, ...body),
            me.host ? foot(sum(waitText), h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'start-game', disabled: !lb.canStart || busy ? true : null, onclick: () => guard(() => conn.start()) }, 'Start the game'))
                : foot(sum(`Waiting for ${hostName(seats)} to start.`))];
    }
    root.append(...build());
    return root;
}
