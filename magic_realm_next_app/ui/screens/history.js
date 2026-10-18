import { h } from '../dom.js';
import { icon } from '../icons.js';
import { allRecords, getRecord, deleteRecord } from '../gamestore.js';
import { groupByDay, readableLog, bundle, replay } from '../../engine/gamerecord.js';
import { loadData } from '../../engine/data.js';
import { newGame } from '../../engine/setup.js';
import { apply } from '../../engine/day.js';
import { VERSION } from '../version.js';
import { frames, state, voiceSwitch } from '../ds.js';
import { logText, onVoice } from '../voice.js';
import { bar, confirmSheet, dateLabel, face, plural, sign } from '../front.js';
import { loadSaved } from './game.js';

// Previous games (mockup 06 h2, h3). Rows lead with the result; a game opens on its verdict, then the story day by day; the developer tools sit behind one quiet Export disclosure, and
// Delete is alone at the bottom behind the house confirm. Seed and build number live in the detail footer.
const FILTERS = [['all', 'All', null], ['rolls', 'Rolls', ['roll']], ['combat', 'Combat', ['combat']], ['loot', 'Loot & trade', ['loot', 'trade', 'hire']], ['world', 'Monsters & chits', ['monster', 'native', 'discover', 'block', 'curse']], ['days', 'Days', ['day', 'phase']]];
const GOAL = { great: 'Great Treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
const list = names => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

// Who or what ended a character: the last line of the log that says so ("the Giant deals H harm; you are slain").
const SLAIN = [/^(.+?) deals \w harm; (?:the .+? you are is slain|you are slain)\.$/, /^(.+?)'s shot finds a vital spot; /];
export function slainBy(log) {
    for (const l of [...(log ?? [])].reverse()) {
        const t = String(l.t ?? '').replace(/ #\d+/g, '');
        if (!/slain/.test(t)) continue;
        for (const re of SLAIN) { const m = re.exec(t); if (m) return m[1].replace(/^(the|The) /, ''); }
    }
    return null;
}

// What happened to a game, in words: { kind, title, bad, sub }. `live` is the id of the game that is on this device now (its record is "in progress" and plays on).
export function outcome(rec, live) {
    const m = rec.meta ?? {}, name = m.name ?? rec.params?.character ?? 'Game', date = dateLabel(rec.startedAt);
    if (m.result === 'died') { const by = slainBy(rec.log); return { kind: 'died', name, bad: true, label: `Died day ${m.day}`, sub: [by ? `Slain by the ${by}` : null, date].filter(Boolean).join(' \u00b7 ') }; }
    if (m.result === 'abandoned') return { kind: 'abandoned', name, label: `Abandoned day ${m.day}`, sub: date };
    if (m.result === 'finished') return { kind: 'finished', name, label: `Finished day ${m.day}`, sub: `${date} \u00b7 Fame ${m.fame ?? 0} \u00b7 Notoriety ${m.notoriety ?? 0} \u00b7 ${m.gold ?? 0} gold` };
    if (rec.id === live) return { kind: 'playing', name, label: `In progress, day ${m.day ?? 1}`, sub: `${date} \u00b7 plays on this device` };
    return { kind: 'unfinished', name, label: `Unfinished, day ${m.day ?? 1}`, sub: date };
}

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
    const root = h('main', { class: 'screen ds-screen ds-title flush history', 'data-screen': 'history' });
    const state_ = { filter: 'all', check: null };
    const back = () => ctx.go(ctx.params?.back ?? 'title');
    const top = (title, onBack) => bar(title, { onBack, hook: { 'data-act': 'hist-back' } });
    let unsub = null;
    const watchVoice = fn => { unsub?.(); unsub = onVoice(() => { if (root.isConnected) fn(); else unsub?.(); }); };

    async function showList() {
        unsub?.(); unsub = null;
        root.replaceChildren(top('History', back), h('div', { class: 'ds-pad' }, h('div', { class: 'ds-skel ds-skel-row' }), h('div', { class: 'ds-skel ds-skel-row' })));
        const recs = await allRecords();
        const live = loadSaved()?.session?.id ?? null;
        const finished = recs.filter(r => r.meta?.result === 'finished');
        const best = finished.reduce((a, r) => (typeof r.meta.score === 'number' && (a == null || r.meta.score > a) ? r.meta.score : a), null);
        const strip = h('p', { class: 'ds-meta ds-histstrip' }, `${plural(recs.length, 'game')} \u00b7 ${finished.length} finished`, best != null ? [' \u00b7 best ', h('b', { class: best >= 0 ? 'pos' : 'neg' }, sign(best))] : null);
        const row = r => {
            const m = r.meta ?? {}, o = outcome(r, live), id = m.character ?? r.params?.character;
            return h('button', { type: 'button', class: `ds-hrow histrow res-${m.result ?? 'playing'}`, 'data-game': r.id, onclick: () => showDetail(r.id) },
                face(id),
                h('span', { class: 'main' }, h('b', { class: o.bad ? 'bad' : '' }, `${o.name} \u00b7 ${o.label}`), h('span', {}, o.sub)),
                typeof m.score === 'number' && m.result !== 'playing' ? h('span', { class: `score ${m.score >= 0 ? 'pos' : 'neg'}` }, sign(m.score)) : null);
        };
        if (!recs.length) {
            root.replaceChildren(top('History', back), state({ glyph: 'book', title: 'No adventures yet.', text: 'Every game you play from now on is kept here, with its log.',
                body: h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'new', onclick: () => ctx.go('newgame') }, 'New game') }));
            return;
        }
        root.replaceChildren(top('History', back),
            h('div', { class: 'ds-scroll ds-fade-b ds-pad' }, strip, h('div', { class: 'ds-list histlist' }, ...recs.map(row)),
                h('button', { type: 'button', class: 'ds-btn quiet block ds-saveall', 'data-act': 'save-all', onclick: async e => { const b = e.currentTarget; const how = await deliver(bundle(await allRecords()), `magic-realm-games-${new Date().toISOString().slice(0, 10)}.json`, { download: true, type: 'application/json' }); flash(b, `${how} \u2713`, 'Save all games (.json)'); } }, 'Save all games (.json)')));
    }

    async function showDetail(id) {
        const rec = await getRecord(id);
        if (!rec) { await showList(); return; }
        const m = rec.meta ?? {}, live = loadSaved()?.session?.id ?? null, o = outcome(rec, live);
        const filter = FILTERS.find(f => f[0] === state_.filter) ?? FILTERS[0];
        const days = groupByDay(rec.log).reverse();                                    // newest first, as in the Journal
        const lastDay = days[0]?.day;
        const logEls = days.map(d => {
            const lines = filter[2] ? d.lines.filter(l => filter[2].includes(l.k)) : d.lines;
            if (!lines.length) return null;
            return h('details', { class: 'logday', open: d.day === lastDay || null },
                h('summary', { class: 'ds-day-head' }, h('span', {}, `Day ${d.day}`), h('small', {}, plural(lines.length, 'line'))),
                h('ul', { class: 'ds-log' }, ...lines.map(l => h('li', { class: `j-${l.k}` }, h('span', {}, logText(l))))));
        }).filter(Boolean);
        const check = state_.check;
        // the verdict: who, where, the day, the score, then the goals
        const rows = (m.rows ?? []).filter(r => r.need > 0);
        const met = rows.filter(r => r.earned >= r.need).map(r => GOAL[r.cat] ?? r.cat);
        const num = typeof m.score === 'number' && o.kind !== 'abandoned' && o.kind !== 'playing' && o.kind !== 'unfinished' ? m.score : null;
        const verdict = {
            finished: `Victory points. ${met.length ? `You met your goals on ${list(met)}.` : 'No goal was met.'}`,
            died: slainBy(rec.log) ? `Slain by the ${slainBy(rec.log)}.` : 'The adventure ended here.',
            abandoned: 'You put this adventure down. It cannot be picked up again.',
            playing: 'Plays on this device: continue it from the title screen.',
            unfinished: 'This game was left unfinished and cannot be picked up again.',
        }[o.kind];
        const card = h('div', { class: `ds-frame card ${o.kind === 'finished' && num >= 0 ? 'good' : o.kind === 'died' ? 'bad' : ''}`, 'data-verdict': o.kind },
            h('span', { class: 'lg' }, o.label),
            h('div', { class: 'ds-verdict' }, num != null ? h('span', { class: `ds-num ds-bignum ${num >= 0 ? 'pos' : 'neg'}` }, sign(num)) : null, h('span', { class: 'ds-text' }, verdict)));
        const goals = o.kind === 'finished' && rows.length ? [h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'Goals')),
            h('div', { class: 'ds-goals' }, rows.map(r => h('div', { class: `ds-goal${r.earned >= r.need ? ' met' : ''}` }, h('span', {}, GOAL[r.cat] ?? r.cat), h('span', {}, `${r.earned} of ${r.need}`), h('b', {}, sign(r.basic + r.bonus)))))] : [];
        const body = h('div', { class: 'hist-detail' }, card,
            h('div', { class: 'ds-framegap' }, frames({ fame: m.fame ?? 0, notor: m.notoriety ?? 0, gold: m.gold ?? 0 }, { cls: 'sheetbg' })), ...goals,
            h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'The story'), voiceSwitch()),
            h('div', { class: 'ds-chips ds-hist-filters hist-filters' }, FILTERS.map(([k, label]) => h('button', { type: 'button', class: `ds-chip${state_.filter === k ? ' on' : ''}`, 'data-filter': k, onclick: () => { state_.filter = k; showDetail(id); } }, label))),
            h('div', { class: 'hist-log' }, logEls.length ? logEls : h('p', { class: 'ds-meta' }, 'Nothing here.')),
            h('details', { class: 'ds-export', 'data-export': '' },
                h('summary', { class: 'ds-btn quiet block' }, 'Export and checks', icon('down')),
                h('div', { class: 'ds-exportbody' },
                    h('div', { class: 'hist-checks' },
                        h('button', { type: 'button', class: 'ds-btn block', 'data-act': 'replay-check', disabled: !rec.replayable, onclick: async () => {
                            state_.check = { running: true, open: true }; await showDetail(id);
                            const data = await loadData('data/');
                            const r = replay(rec, { newGame, apply, data });
                            state_.check = { ok: r.ok, steps: r.steps, problems: r.problems, sameVersion: rec.version === VERSION, open: true };
                            await showDetail(id);
                        } }, rec.replayable ? 'Replay and check' : 'Cannot replay (earlier moves unknown)'),
                        check?.running ? h('p', { class: 'ds-meta' }, 'Replaying\u2026') : null,
                        check && !check.running ? h('p', { class: check.ok ? 'chk-ok' : 'chk-bad', 'data-replay-result': check.ok ? 'ok' : 'differs' },
                            check.ok ? `Replayed ${check.steps} actions: the same game came out.` : `Replayed ${check.steps} actions: ${check.problems.join('; ')}.`,
                            !check.ok && !check.sameVersion ? ` This game was played on version ${rec.version}; the rules have changed since, so a difference may be expected.` : '') : null,
                        h('p', { class: rec.errors.length ? 'chk-bad' : 'ds-meta' }, rec.errors.length ? `${plural(rec.errors.length, 'action')} refused or failed:` : 'No refused or failed actions.'),
                        ...rec.errors.slice(0, 40).map(e => h('p', { class: `err${e.bug ? ' bug' : ''}` }, h('small', {}, `Day ${e.day} \u00b7 ${e.pending ?? e.kind}`), ' ', e.message))),
                    rec.days.length > 1 ? h('details', { class: 'ds-daytable' }, h('summary', {}, 'Day by day'),
                        h('table', { class: 'level-table' }, h('thead', {}, h('tr', {}, ['Day', 'At', 'Gold', 'Fame', 'Notoriety', 'Tired', 'Hurt'].map(x => h('th', {}, x)))),
                            h('tbody', {}, rec.days.map(d => h('tr', {}, h('td', {}, d.day), h('td', {}, d.at ?? '\u2013'), h('td', {}, d.gold), h('td', {}, d.fame), h('td', {}, d.notoriety), h('td', {}, d.tired), h('td', {}, d.wounded)))))) : null,
                    h('div', { class: 'ds-exportbtns' },
                        h('button', { type: 'button', class: 'ds-btn sm', 'data-act': 'copy-log', onclick: async e => { const b = e.currentTarget; flash(b, `${await deliver(readableLog(rec, { kinds: filter[2] }), `magic-realm-${rec.id}.txt`)} \u2713`, 'Copy or share the log'); } }, 'Copy or share the log'),
                        h('button', { type: 'button', class: 'ds-btn sm', 'data-act': 'save-log', onclick: async e => { const b = e.currentTarget; flash(b, `${await deliver(readableLog(rec), `magic-realm-${rec.id}.txt`, { download: true })} \u2713`, 'Save the log (.txt)'); } }, 'Save the log (.txt)'),
                        h('button', { type: 'button', class: 'ds-btn sm', 'data-act': 'save-record', onclick: async e => { const b = e.currentTarget; flash(b, `${await deliver(bundle([rec]), `magic-realm-${rec.id}.json`, { download: true, type: 'application/json' })} \u2713`, 'Save the record (.json)'); } }, 'Save the record (.json)')))),
            h('div', { class: 'ds-delgap' }),
            h('button', { type: 'button', class: 'ds-btn danger block', 'data-act': 'delete-game', onclick: () => confirmSheet({ eyebrow: 'History', title: 'Delete this record?',
                lines: [`${o.name}, ${o.label.toLowerCase()}${num != null ? `, ${sign(num)}` : ''}.`, 'This cannot be undone.'], attrs: { 'data-confirm': 'delete', role: 'alertdialog' },
                safe: { label: 'Keep it', attrs: { 'data-act': 'delete-keep' } },
                risky: { label: 'Delete', attrs: { 'data-act': 'delete-ok' }, onclick: async () => { await deleteRecord(id); state_.check = null; await showList(); } } }) }, 'Delete this record'),
            h('p', { class: 'ds-meta ds-histfoot' }, `Seed ${rec.params?.seed ?? '?'} \u00b7 v${rec.version} \u00b7 ${plural(rec.moves.length, 'action')}${rec.replayable ? '' : ' \u00b7 earlier moves unknown'}`));
        const scroll = h('div', { class: 'ds-scroll ds-fade-b ds-pad' }, body);
        root.replaceChildren(top(o.name, () => { state_.check = null; showList(); }), scroll);
        if (check?.open) { const ex = root.querySelector('.ds-export'); if (ex) { ex.open = true; ex.scrollIntoView?.({ block: 'center' }); } }
        watchVoice(() => showDetail(id));
    }

    if (ctx.params?.id) showDetail(ctx.params.id); else showList();
    return root;
}
