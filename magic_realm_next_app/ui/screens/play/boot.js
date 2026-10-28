// play/boot.js: starting the game screen: loads the data, then connects (a shared table), joins (a race), or starts or resumes the solo game; mounts the map and publishes window.__mr.game.
import { loadData } from '../../../engine/data.js';
import { daySnapshot, finalize, newRecord } from '../../../engine/gamerecord.js';
import { upgradeState } from '../../../engine/party.js';
import { newGame } from '../../../engine/setup.js';
import { getRecord, putRecord } from '../../gamestore.js';
import { mountMap } from '../../mapview.js';
import { connect } from '../../online.js';
import { party } from '../../party.js';
import { ApiError, connectShared } from '../../shared_online.js';
import { VERSION } from '../../version.js';
import { act, applyAnswer, refresh } from './actions.js';
import { mapModel, render, wireShell } from './shell.js';
import { plainReason, showError, showLoading } from './states.js';
import { loadSaved, myId, noteError, persist, restoreUi, saveGame } from './state.js';

export function boot(G) {
    showLoading(G);
    (async () => {
        try {
            G.data = await loadData('data/');
            G.ctx.data = G.data;
            if (G.shared) {
                G.sconn = connectShared(G.shared, { onUpdate: applyAnswer.bind(null, G), onStatus: s => { const was = G.here; G.here = s === 'here'; if (G.here && was === false) G.sconn.view().catch(() => {}); } });
                let first;
                try { first = await G.sconn.view(); } catch (e) {
                    const gone = e instanceof ApiError && (e.status === 401 || e.status === 404);
                    showError(G, { title: gone ? 'This game is gone' : 'The table would not open', text: gone ? 'This game is no longer on the server.' : plainReason(e), details: e.message, glyph: gone ? 'flag' : 'warn',
                        back: { label: 'Back', go: () => G.ctx.go('online') }, retry: gone ? null : () => G.ctx.go('game', G.ctx.params) });
                    return;
                }
                if (first.phase === 'lobby') { G.ctx.go('sharedlobby', { game: G.shared }); return; }
                if (first.phase === 'archived' || first.view == null) {
                    showError(G, { title: 'This game was put away', text: 'Nobody played it for a long time, so the server put it away. Ask the host or whoever runs the server to bring it back.', glyph: 'hourglass', back: { label: 'Back', act: 'forget', go: () => { G.sconn.unwatch(); G.ctx.go('online'); } } });
                    G.mapBox.querySelector('.ds-state-host').dataset.archived = '';
                    return;
                }
                G.st = upgradeState(first.view); G.answer = first; G.standings = first.standings ?? []; G.ctx.state = G.st; G.crew = party(G.st, first, myId(G));
                if (G.st.period === 'over') { G.ui.overAuto = true; G.ui.sheet = 'over'; }          // (a finished game opens on its result)
                G.map = mountMap(G.mapBox); wireShell(G);
                G.mapBox.addEventListener('pointerdown', () => { G.ui.touched = Date.now(); }, { capture: true });
                window.__mr.game = { get st() { return G.st; }, act: act.bind(null, G), data: G.data, ui: G.ui, render: () => render(G), shared: G.shared, get sconn() { return G.sconn; }, get answer() { return G.answer; }, get standings() { return G.standings; }, get crew() { return G.crew; }, get feed() { return G.feed; }, get map() { return G.map; } };
                G.map.set(mapModel(G), { refit: true });
                render(G);
                G.sconn.watch();
                // (the trade window after the day's fights is a lobby option, on by default and kept with the game: the server gives every character the standing choice; nothing is sent from here)
                requestAnimationFrame(() => { G.map.fit(false); G.map.focus(G.st.ch.onRoad ? G.st.ch.onRoad.from : G.st.ch.at, 1.5, false); G.lastHero = G.st.ch.at; });
                window.addEventListener('resize', () => G.map?.fit(false));
                return;
            }
            if (G.race) {
                G.conn = connect(G.race, { onStandings: list => { G.standings = list; if (G.root.isConnected) render(G); else G.conn.stop(); }, onStatus: s => { const was = G.here; G.here = s === 'here'; if (G.here && was === false) refresh(G); } });
                const v = await G.conn.view();
                G.st = v.view; G.standings = v.standings; G.ctx.state = G.st;
                G.conn.start();
                G.map = mountMap(G.mapBox); wireShell(G);
                window.__mr.game = { get st() { return G.st; }, act: act.bind(null, G), data: G.data, ui: G.ui, render: () => render(G), race: G.race, get standings() { return G.standings; } };
                G.map.set(mapModel(G), { refit: true });
                render(G);
                requestAnimationFrame(() => { G.map.fit(false); G.map.focus(G.st.ch.onRoad ? G.st.ch.onRoad.from : G.st.ch.at, 1.5, false); G.lastHero = G.st.ch.at; });
                window.addEventListener('resize', () => G.map?.fit(false));
                return;
            }
            let fresh = null;
            if (G.ctx.params?.fresh || !loadSaved()) {
                // a game that was in progress and is being replaced is closed in the History as abandoned, not left "in progress" for ever
                const prev = loadSaved();
                if (prev?.session?.id && prev.period !== 'over') getRecord(prev.session.id).then(r => { if (r && !r.meta?.result) { finalize(r, prev); r.meta.result = 'abandoned'; putRecord(r); } }).catch(() => {});
                fresh = { seed: G.ctx.params?.seed ?? (Math.floor(Math.random() * 90000) + 1), character: G.ctx.params?.character ?? 'white-knight', vp: G.ctx.params?.vp, mode: G.ctx.params?.mode, lastDay: G.ctx.params?.lastDay,
                    startDwelling: G.ctx.params?.startDwelling, startGear: G.ctx.params?.startGear, options: G.ctx.params?.options, missions: G.ctx.params?.missions, pauseVictory: true, pauseEvening: true, pauseGear: true, startSpells: G.ctx.params?.startSpells, characters: G.ctx.params?.characters };
                G.st = newGame(G.data, fresh);
                G.st.session = { id: String(Date.now()), started: new Date().toISOString(), version: VERSION, params: JSON.parse(JSON.stringify(fresh)) };
                saveGame(G.st);
            } else G.st = loadSaved();
            if (G.st.pauseVictory === undefined) G.st.pauseVictory = true;
            if (G.st.pauseShift === undefined) G.st.pauseShift = true;
            if (G.st.pauseEvening === undefined) G.st.pauseEvening = true;          // (the evening ends on the question where he may rearrange his belongings: ruling R6, ch7-day.md)
            if (G.st.pauseGear === undefined) G.st.pauseGear = true;          // (a phase in which he came by a belonging ends on the question where he may switch it off or leave it: ruling R1, ch2469.md)
            G.ctx.state = G.st;
            restoreUi(G);                                    // (a plan that was being made when the page went away comes back as it was)
            // a game saved before records existed gets one now; its earlier moves are unknown, so it cannot be replayed
            G.st.session ??= { id: String(Date.now()), started: new Date().toISOString(), version: VERSION, params: null };
            G.rec = (await getRecord(G.st.session.id).catch(() => null)) ?? newRecord({ id: G.st.session.id, version: G.st.session.version, params: G.st.session.params, startedAt: G.st.session.started, replayable: !!G.st.session.params });
            if (!G.rec.days.length) G.rec.days.push(daySnapshot(G.st));
            persist(G, true);
            window.addEventListener('error', e => noteError(G, null, e.error ?? e.message, 'js'));
            window.addEventListener('pagehide', () => persist(G, true));
            G.map = mountMap(G.mapBox); wireShell(G);
            window.__mr.game = { get st() { return G.st; }, act: act.bind(null, G), data: G.data, ui: G.ui, render: () => render(G) };
            G.map.set(mapModel(G), { refit: true });
            render(G);
            requestAnimationFrame(() => { G.map.fit(false); G.map.focus(G.st.ch.at, 1.5, false); G.lastHero = G.st.ch.at; });
            window.addEventListener('resize', () => G.map?.fit(false));
        } catch (e) {
            console.error(e);
            showError(G, { text: plainReason(e), details: e.message, back: { label: 'Back to the title', go: () => G.ctx.go('title') }, retry: () => G.ctx.go('game', G.ctx.params) });
        }
    })();
}
