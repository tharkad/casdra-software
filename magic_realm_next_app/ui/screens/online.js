import { h } from '../dom.js';
import { icon } from '../icons.js';
import { myName, setMyName, serverUrl, setServerUrl, myRaces, forgetRace, parseInvite, peekRace, connect, serverAvailable, ApiError } from '../online.js';
import { viewShared } from '../shared_online.js';
import { bar, charLabel, confirmSheet, face, field, foot, input, nb, plural, say, seatBadge } from '../front.js';
import { CHARACTERS } from './newgame.js';

// "Play online" (mockup 06 h5, h6): your name once; a shared game or a race; joining by invite is one inline row; then your games, led by who is in them. An invite link lands on its own
// state ("Mike has invited you to a race"). The server address and its paragraph are under Advanced.

// ---- what we last knew about each game I am in (shown at once, refreshed from the server when it answers) ----
const CACHE_KEY = 'mr-online-last';
export const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') || {}; } catch { return {}; } };
export const writeCache = c => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* storage may be unavailable */ } };
const charIdOf = name => CHARACTERS.find(c => c.name === name)?.id ?? (name ? String(name).toLowerCase().replace(/ /g, '_') : null);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// One look at one game: { characterId, character, day, status, others: [{ name, present }], open, waiting, yourTurn, gone }.
export async function glance(r) {
    const a = r.kind === 'shared' ? await withTimeout(viewShared(r), 5000) : await withTimeout(connect(r).view(), 5000);
    const rows = a.standings ?? [], me = rows.find(s => s.seat === r.seat) ?? null;
    const out = { characterId: me?.characterId ?? charIdOf(me?.character), character: me?.character ?? null, day: me?.day ?? null, status: me?.status ?? null,
        others: rows.filter(s => s.seat !== r.seat).map(s => ({ name: s.name, present: !!s.present })), at: Date.now() };
    if (r.kind === 'shared') {
        out.lobby = a.phase === 'lobby'; out.yourTurn = !!a.yourTurn && a.phase === 'playing';
        out.waiting = a.phase === 'playing' ? (a.waitingFor ?? []).filter(w => w.seat !== r.seat).map(w => w.name) : [];          // (whom the table waits for, when it is not me)
        if (a.lobby) { out.open = Math.max(0, a.lobby.maxSeats - a.lobby.seats.length); out.character = out.character ?? (a.lobby.mine?.character ? CHARACTERS.find(c => c.id === a.lobby.mine.character)?.name ?? null : null); out.characterId = out.characterId ?? a.lobby.mine?.character ?? null; }
        if (a.phase === 'closed' || a.phase === 'archived') out.gone = a.phase;
    }
    return out;
}

const rowTitle = (r, i) => {
    const kind = r.kind === 'shared' ? 'shared' : 'race';
    if (!i) return `${r.kind === 'shared' ? 'A shared game' : 'A race'}`;
    if (i.gone) return `${i.character ?? 'A game'} · ${i.gone === 'closed' ? 'closed' : 'put away'}`;
    return `${i.character ?? 'Not chosen yet'}${i.day != null ? `, day ${i.day}` : ''} · ${kind}`;
};
const rowSub = (r, i) => {
    if (!i) return `as ${r.name}`;
    if (i.gone === 'missing') return 'This game is no longer on the server.';
    const names = i.others.map(o => o.name), here = i.others.some(o => o.present);
    const withs = names.length ? `with ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}${here ? ' (here now)' : ''}` : 'nobody else yet';
    if (i.lobby && i.open) return `${withs} · waiting for ${plural(i.open, 'player')}`;
    // at a live table the row says whose move it is (QA-132): mine is the gold tag at the right, the others' is said here
    const move = i.lobby || i.gone || i.yourTurn ? null : i.waiting?.length ? `Waiting for ${i.waiting.length > 1 ? `${i.waiting.slice(0, -1).join(', ')} and ${i.waiting.at(-1)}` : i.waiting[0]}` : null;
    return move ? `${move} · ${withs}` : withs;
};

export function onlineScreen(ctx) {
    const p = ctx.params ?? {};
    let name = myName(), status = p.message ?? '';
    let health = 'checking';                                           // 'checking' | 'up' | 'down'
    let invited = !!p.invite;                                          // arrived by a link: the invitation state
    let peek = null;                                                   // { loading } | { r } | { error }
    const root = h('main', { class: 'screen ds-screen ds-title flush online', 'data-screen': 'online' });
    const info = readCache();
    const redraw = () => { const y = root.querySelector('.ds-scroll')?.scrollTop ?? 0; root.replaceChildren(...build()); const s = root.querySelector('.ds-scroll'); if (s && y) s.scrollTop = y; };
    const needName = () => { name = (name || '').trim(); if (!name) { status = 'Enter the name the others will see.'; redraw(); root.querySelector('[data-field=name]')?.focus?.(); return false; } setMyName(name); return true; };
    const down = () => health === 'down';
    const offline = () => say('The game server did not answer, so there is nothing to start or join. Try again in a moment.', { bad: true });

    // ---- the server ----
    const check = () => { health = 'checking'; serverAvailable().then(ok => { health = ok ? 'up' : 'down'; if (root.isConnected) { if (!ok || invited) redraw(); if (ok) refreshGames(); } }); };
    check();

    // ---- my games ----
    let gamesHost = null;
    const races = () => myRaces();
    const forget = r => confirmSheet({ eyebrow: 'Your games', title: 'Forget this game?', lines: [`${rowTitle(r, info[r.game])}.`, 'It stays on the server, but this device loses its seat: you cannot get back in.'], attrs: { 'data-confirm': 'forget', role: 'alertdialog' },
        safe: { label: 'Keep it', attrs: { 'data-act': 'forget-keep' } }, risky: { label: 'Forget it', attrs: { 'data-act': 'forget-ok' }, onclick: () => { forgetRace(r.game, r.server); delete info[r.game]; redraw(); } } });
    const gameRow = r => {
        const i = info[r.game], mine = i?.yourTurn;
        return h('div', { class: 'racerow' },
            h('button', { type: 'button', class: `ds-hrow ds-gamerow${mine ? ' turn' : ''}`, 'data-act': r.kind === 'shared' ? 'open-shared' : 'open-race', 'data-game': r.game, onclick: () => (r.kind === 'shared' ? ctx.go('sharedlobby', { game: r }) : ctx.go('game', { online: r })) },
                face(i?.characterId), h('span', { class: 'main' }, h('b', {}, rowTitle(r, i)), h('span', {}, rowSub(r, i))),
                mine ? h('span', { class: 'ds-tag gold' }, 'your move') : icon('right')),
            h('button', { type: 'button', class: 'ds-btn quiet icon ds-forget', 'aria-label': 'Forget this game on this device', onclick: () => forget(r) }, icon('close')));
    };
    const drawGames = () => { if (!gamesHost) return; const list = races(); gamesHost.replaceChildren(...(list.length ? [h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'Your games'), h('small', {}, String(list.length))), h('div', { class: 'ds-list' }, list.map(gameRow))] : [])); };
    async function refreshGames() {
        const list = races().slice(0, 6);
        await Promise.all(list.map(async r => {
            try { info[r.game] = await glance(r); } catch (e) { if (e instanceof ApiError && (e.status === 401 || e.status === 404)) info[r.game] = { ...(info[r.game] ?? { others: [] }), gone: 'missing', yourTurn: false }; return; }
            if (root.isConnected) drawGames();
        }));
        writeCache(Object.fromEntries(Object.entries(info).filter(([g]) => races().some(r => r.game === g))));
        if (root.isConnected) drawGames();
    }

    // ---- the invitation ----
    const inv = p.invite ?? null;
    if (inv) {
        peek = { loading: true };
        peekRace(inv.server ?? p.server ?? serverUrl(), inv).then(r => { peek = { r }; }, e => { peek = { error: e.message }; }).then(() => { if (root.isConnected) redraw(); });
    }
    const modeLine = r => r.mode === 'sudden' ? 'Sudden death' : r.mode === 'endless' ? 'Endless' : `${r.lastDay} days · ${r.lastDay / 7 + 1} VP`;
    const optionsLine = r => { const o = r.options ?? {}; return [o.quietMonsters && 'Quiet Monsters on.', o.watchfulNatives && 'Watchful Natives on.', o.knightsAdjustment && 'Knights’ Adjustment on.', r.kind === 'shared' && (o.pvp ? 'Players may fight each other.' : 'Players cannot attack each other.')].filter(Boolean).join(' '); };
    function invitation() {
        const join = () => { if (!needName()) return; ctx.onlineIntent = { mode: 'join', name, invite: inv, server: inv.server ?? serverUrl() }; ctx.newGame = null; ctx.go('newgame'); };
        const own = () => { invited = false; p.invite = null; p.joinText = ''; redraw(); };
        const r = peek?.r, shared = r?.kind === 'shared', host = r?.players?.[0] ?? 'Someone';
        const full = r && (shared ? (r.status && r.status !== 'lobby') || r.open === 0 : (r.players?.length ?? 0) >= (r.maxSeats ?? 99));
        const block = peek?.error ? null : down() ? 'The game server did not answer.' : full ? (shared && r.status !== 'lobby' ? 'That game has already started: nobody joins late.' : 'That game is full.') : null;
        const seats = r ? (shared ? r.seats.map(s => ({ name: s.name, char: s.character })) : r.players.map(n => ({ name: n }))) : [];
        const badge = (s, i) => (s.char ? face(s.char) : seatBadge(i, String(s.name)[0].toUpperCase()));
        const body = [
            peek?.loading ? [h('div', { class: 'ds-skel ds-skel-line' }), h('div', { class: 'ds-skel ds-skel-card' })]
                : peek?.error ? [h('p', { class: 'ds-voice lg ds-q' }, 'This invitation does not work.'), h('p', { class: 'ds-text ds-dim' }, peek.error)]
                : [h('p', { class: 'ds-voice lg ds-q', 'data-invited': '' }, `${host} has invited you to ${shared ? 'a shared game' : 'a race'}.`),
                    h('div', { class: 'ds-group ds-invitecard' }, h('div', { class: 'hd' }, h('b', {}, `${host}’s ${shared ? 'game' : 'race'}`), h('span', { class: 'ds-tag gold' }, modeLine(r))),
                        h('p', { class: 'ds-text ds-dim' }, `${shared ? `${r.maxSeats} players share one map, one turn at a\u00A0time.` : 'The same realm for everyone, each at their own\u00A0pace.'} ${optionsLine(r)}`.trim()),
                        h('div', { class: 'ds-list' }, seats.map((s, i) => h('div', { class: 'ds-hrow ds-playerrow' }, badge(s, i), h('span', { class: 'main' }, h('b', {}, s.name), h('span', {}, s.char ? `playing the ${CHARACTERS.find(c => c.id === s.char)?.name ?? charLabel(s.char)}` : (shared ? 'choosing a character…' : 'in the race')))))))],
            block ? h('p', { class: 'ds-why bad ds-why-slot', role: 'alert' }, block) : null,
            peek?.error ? null : h('div', { class: 'ds-invitename' }, field('Your name', input({ value: name, placeholder: 'Shown to the others', maxlength: 24, autocomplete: 'nickname', 'data-field': 'name', oninput: e => { name = e.target.value; } }),
                { why: h('span', { class: 'ds-why bad ds-why-slot', role: 'alert' }, status) }))];
        return [bar('Play online', { onBack: () => ctx.go('title') }), h('div', { class: 'ds-scroll ds-pad' }, ...body),
            foot(h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'own-game', onclick: own }, shared ? 'Start a game of my own' : 'Start a race of my own'),
                h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'join-race', disabled: peek?.loading || block ? true : null, onclick: join }, shared ? 'Join the game' : 'Join the race'))];
    }

    function build() {
        if (invited && inv) return invitation();
        const joinText = p.joinText ?? '';
        const dim = down();
        const go = (mk) => () => { if (dim) { offline(); return; } if (needName()) { ctx.onlineIntent = mk(); ctx.newGame = null; ctx.go('newgame'); } };
        const card = (act, title, line, onclick) => h('button', { type: 'button', class: `ds-choice${dim ? ' dim' : ''}`, 'data-act': act, 'aria-disabled': dim ? 'true' : null, onclick },
            h('span', { class: 'main' }, h('b', {}, title), h('span', { class: 'l' }, nb(line))), icon('right'));
        gamesHost = h('div', { class: 'ds-gameshost' });
        const els = [bar('Play online', { onBack: () => ctx.go('title') }),
            h('div', { class: 'ds-scroll ds-fade-b ds-pad' },
                dim ? h('div', { class: 'ds-ask', 'data-server': 'down' }, h('b', {}, 'The game server did not answer.'), h('span', {}, 'Your games will show when it is back.'), h('button', { type: 'button', class: 'ds-btn sm quiet ds-retry', 'data-act': 'retry', onclick: check }, 'Try again')) : null,
                field('Your name', input({ value: name, placeholder: 'Shown to the others', maxlength: 24, autocomplete: 'nickname', 'data-field': 'name', oninput: e => { name = e.target.value; } }), { why: h('span', { class: 'ds-why bad ds-why-slot', role: 'alert' }, status) }),
                h('div', { class: 'ds-choices ds-startcards' },
                    card('start-shared', 'A shared game', 'Two to four of you on one map, one turn at a time.', go(() => ({ mode: 'create', kind: 'shared', name }))),
                    card('start-race', 'A race', 'The same realm, your own pace. Nobody waits.', go(() => ({ mode: 'create', name })))),
                h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'Join with an invite')),
                h('div', { class: 'ds-joinrow' },
                    input({ value: joinText, placeholder: 'Paste the link you were sent', 'data-field': 'invite', 'aria-label': 'Invite link or code', oninput: e => { p.joinText = e.target.value; } }),
                    h('button', { type: 'button', class: `ds-btn${dim ? ' is-dim' : ''}`, 'data-act': 'join-race', onclick: () => {
                        if (dim) { offline(); return; }
                        const inv2 = parseInvite(p.joinText ?? joinText);
                        if (!inv2) { status = 'That is not an invite.'; redraw(); return; }
                        if (!needName()) return;
                        ctx.onlineIntent = { mode: 'join', name, invite: inv2, server: inv2.server ?? serverUrl() }; ctx.newGame = null; ctx.go('newgame');
                    } }, 'Join')),
                gamesHost,
                h('details', { class: 'ds-advanced ds-advanced-online' }, h('summary', { class: 'ds-btn quiet block' }, 'Advanced', icon('down')),
                    h('div', { class: 'ds-advbody' }, field('Game server address', input({ type: 'url', value: serverUrl(), 'data-field': 'server', onchange: e => { setServerUrl(e.target.value === location.origin ? '' : e.target.value); check(); } }),
                        { why: h('span', { class: 'ds-why' }, 'Leave it alone when this page was opened from the game server itself.') }))))];
        drawGames();
        return els;
    }
    root.append(...build());
    refreshGames();
    return root;
}
