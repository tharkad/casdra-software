import { h } from '../dom.js';
import { allRecords, getRecord, deleteRecord } from '../gamestore.js';
import { resultLabel, groupByDay, readableLog, bundle, replay, kindLabel } from '../../engine/gamerecord.js';
import { loadData } from '../../engine/data.js';
import { newGame } from '../../engine/setup.js';
import { apply } from '../../engine/day.js';
import { VERSION } from '../version.js';

// Previous games: a list with their numbers, and for each one the readable log, the day-by-day table and anything that was refused or failed.

const when = iso => { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return iso; } };
const sign = n => (n >= 0 ? `+${n}` : String(n));
const FILTERS = [['all', 'All', null], ['rolls', 'Rolls', ['roll']], ['combat', 'Combat', ['combat']], ['loot', 'Loot & trade', ['loot', 'trade', 'hire']], ['world', 'Monsters & chits', ['monster', 'native', 'discover', 'block', 'curse']], ['days', 'Days', ['day', 'phase']]];

// Hands text to the best thing the device has: the share sheet on a phone, the clipboard, else a download.
async function deliver(text, filename, { download = false, type = 'text/plain' } = {}) {
    if (!download) {
        try { if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ title: filename, text }); return 'Shared'; } } catch (e) { if (e?.name === 'AbortError') return 'Shared'; }
        try { await navigator.clipboard.writeText(text); return 'Copied'; } catch { /* fall back to a file */ }
    }
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename, rel: 'noopener' });
    a.style.display = 'none'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    return 'Saved';
}
const flash = (btn, text, back) => { btn.textContent = text; setTimeout(() => { btn.textContent = back; }, 2000); };

export function historyScreen(ctx) {
    const root = h('main', { class: 'screen history', 'data-screen': 'history' });
    const state = { filter: 'all', check: null };
    const back = () => ctx.go(ctx.params?.back ?? 'title');
    const top = (title, onBack) => h('header', { class: 'hist-top' }, h('button', { class: 'back', 'aria-label': 'Back', 'data-act': 'hist-back', onclick: onBack }, '‹'), h('h1', {}, title));

    async function showList() {
        root.replaceChildren(top('Game history', back), h('p', { class: 'hint' }, 'Reading your games…'));
        const recs = await allRecords();
        const finished = recs.filter(r => r.meta?.result === 'finished'), died = recs.filter(r => r.meta?.result === 'died');
        const avg = finished.length ? Math.round(finished.reduce((a, r) => a + r.meta.score, 0) / finished.length) : null;
        const tile = (v, l) => h('div', { class: 'tile' }, h('b', {}, String(v)), h('span', {}, l));
        const rows = recs.map(r => {
            const m = r.meta ?? {};
            return h('button', { class: `histrow res-${m.result ?? 'playing'}`, 'data-game': r.id, onclick: () => showDetail(r.id) },
                h('span', { class: 'hr-main' }, h('b', {}, m.name ?? r.params?.character ?? 'Game'), h('small', {}, `${when(r.startedAt)} · seed ${r.params?.seed ?? '?'} · v${r.version}`)),
                h('span', { class: 'hr-res' }, h('b', {}, resultLabel(m) || 'In progress'), h('small', {}, `Fame ${m.fame ?? 0} · Notor ${m.notoriety ?? 0} · ${m.gold ?? 0}g${r.errors?.length ? ` · ${r.errors.length} refused` : ''}`)));
        });
        root.replaceChildren(top('Game history', back),
            h('div', { class: 'tiles' }, tile(recs.length, 'games'), tile(finished.length, 'finished'), tile(died.length, 'died'), tile(avg == null ? '–' : sign(avg), 'average score'),
                tile(recs.reduce((a, r) => a + (r.meta?.kills ?? 0), 0), 'kills'), tile(recs.reduce((a, r) => a + (r.meta?.day ?? 0), 0), 'days played')),
            recs.length ? h('div', { class: 'hist-tools' },
                h('button', { class: 'btn', 'data-act': 'save-all', onclick: async e => { const b = e.currentTarget; const how = await deliver(bundle(await allRecords()), `magic-realm-games-${new Date().toISOString().slice(0, 10)}.json`, { download: true, type: 'application/json' }); flash(b, `${how} ✓`, 'Save all games (.json)'); } }, 'Save all games (.json)')) : null,
            recs.length ? h('div', { class: 'histlist' }, ...rows) : h('p', { class: 'hint' }, 'No games recorded yet. Every game you play from now on is kept here, with its log.'),
            h('p', { class: 'fine' }, `Records are kept on this device. Version ${VERSION}.`));
    }

    async function showDetail(id) {
        const rec = await getRecord(id);
        if (!rec) { await showList(); return; }
        const m = rec.meta ?? {};
        const tile = (v, l) => h('div', { class: 'tile' }, h('b', {}, String(v)), h('span', {}, l));
        const filter = FILTERS.find(f => f[0] === state.filter) ?? FILTERS[0];
        const days = groupByDay(rec.log);
        const lastDay = days.at(-1)?.day;
        const logEls = days.map(d => {
            const lines = filter[2] ? d.lines.filter(l => filter[2].includes(l.k)) : d.lines;
            if (!lines.length) return null;
            return h('details', { class: 'logday', open: d.day === lastDay || null },
                h('summary', {}, `Day ${d.day}`, h('small', {}, ` ${lines.length} line${lines.length === 1 ? '' : 's'}`)),
                ...lines.map(l => h('p', { class: `j-${l.k}` }, l.t)));
        });
        const check = state.check;
        const body = h('div', { class: 'hist-detail' },
            h('p', { class: 'hist-sub' }, `${when(rec.startedAt)} · seed ${rec.params?.seed ?? '?'} · version ${rec.version} · ${rec.moves.length} actions${rec.replayable ? '' : ' · earlier moves unknown'}`),
            h('div', { class: 'tiles' }, tile(`${m.day ?? '?'}/${m.lastDay ?? 28}`, 'day'), tile(m.score == null ? '–' : sign(m.score), 'score'), tile(m.fame ?? 0, 'fame'), tile(m.notoriety ?? 0, 'notoriety'),
                tile(m.gold ?? 0, 'gold'), tile(m.kills ?? 0, 'kills'), tile(m.combats ?? 0, 'combats'), tile(m.woundsTaken ?? 0, 'wounds taken')),
            m.rows ? h('table', { class: 'level-table' }, h('thead', {}, h('tr', {}, ['Goal', 'Earned', 'Needed', 'Points'].map(x => h('th', {}, x)))),
                h('tbody', {}, m.rows.map(r => h('tr', {}, h('td', {}, r.cat), h('td', {}, r.earned), h('td', {}, r.need), h('td', {}, sign(r.basic + r.bonus)))))) : null,
            rec.days.length > 1 ? h('details', {}, h('summary', {}, 'Day by day'),
                h('table', { class: 'level-table' }, h('thead', {}, h('tr', {}, ['Day', 'At', 'Gold', 'Fame', 'Notor', 'Tired', 'Hurt'].map(x => h('th', {}, x)))),
                    h('tbody', {}, rec.days.map(d => h('tr', {}, h('td', {}, d.day), h('td', {}, d.at ?? '–'), h('td', {}, d.gold), h('td', {}, d.fame), h('td', {}, d.notoriety), h('td', {}, d.tired), h('td', {}, d.wounded)))))) : null,
            h('h3', {}, 'Checks'),
            h('div', { class: 'hist-checks' },
                h('button', { class: 'btn', 'data-act': 'replay-check', disabled: !rec.replayable, onclick: async () => {
                    state.check = { running: true }; await showDetail(id);
                    const data = await loadData('data/');
                    const r = replay(rec, { newGame, apply, data });
                    state.check = { ok: r.ok, steps: r.steps, problems: r.problems, sameVersion: rec.version === VERSION };
                    await showDetail(id);
                } }, rec.replayable ? 'Replay and check' : 'Cannot replay (earlier moves unknown)'),
                check?.running ? h('p', { class: 'hint' }, 'Replaying…') : null,
                check && !check.running ? h('p', { class: check.ok ? 'chk-ok' : 'chk-bad', 'data-replay-result': check.ok ? 'ok' : 'differs' },
                    check.ok ? `Replayed ${check.steps} actions: the same game came out.` : `Replayed ${check.steps} actions: ${check.problems.join('; ')}.`,
                    !check.ok && !check.sameVersion ? ` This game was played on version ${rec.version}; the rules have changed since, so a difference may be expected.` : '') : null,
                h('p', { class: rec.errors.length ? 'chk-bad' : 'hint' }, rec.errors.length ? `${rec.errors.length} action${rec.errors.length === 1 ? '' : 's'} refused or failed:` : 'No refused or failed actions.'),
                ...rec.errors.slice(0, 40).map(e => h('p', { class: `err${e.bug ? ' bug' : ''}` }, h('small', {}, `Day ${e.day} · ${e.pending ?? e.kind}`), ' ', e.message))),
            h('h3', {}, 'Log'),
            h('div', { class: 'seg3 wrap hist-filters' }, ...FILTERS.map(([k, label]) => h('button', { class: `segb${state.filter === k ? ' on' : ''}`, 'data-filter': k, onclick: () => { state.filter = k; showDetail(id); } }, label))),
            h('div', { class: 'journal hist-log' }, ...logEls.filter(Boolean)),
            h('div', { class: 'hist-tools' },
                h('button', { class: 'btn', 'data-act': 'copy-log', onclick: async e => { const b = e.currentTarget; flash(b, `${await deliver(readableLog(rec, { kinds: filter[2] }), `magic-realm-${rec.id}.txt`)} ✓`, 'Copy or share the log'); } }, 'Copy or share the log'),
                h('button', { class: 'btn', 'data-act': 'save-log', onclick: async e => { const b = e.currentTarget; flash(b, `${await deliver(readableLog(rec), `magic-realm-${rec.id}.txt`, { download: true })} ✓`, 'Save the log (.txt)'); } }, 'Save the log (.txt)'),
                h('button', { class: 'btn', 'data-act': 'save-record', onclick: async e => { const b = e.currentTarget; flash(b, `${await deliver(bundle([rec]), `magic-realm-${rec.id}.json`, { download: true, type: 'application/json' })} ✓`, 'Save the record (.json)'); } }, 'Save the record (.json)'),
                h('button', { class: 'btn danger', 'data-act': 'delete-game', onclick: async () => { await deleteRecord(id); state.check = null; await showList(); } }, 'Delete this record')));
        root.replaceChildren(top(resultLabel(m) || m.name || 'Game', () => { state.check = null; showList(); }), body);
    }

    if (ctx.params?.id) showDetail(ctx.params.id); else showList();
    return root;
}
