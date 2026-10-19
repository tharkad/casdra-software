// Notes: "what I want to happen on this screen", said out loud. A round button on every screen opens a sheet that listens (the phone's speech recognition where it
// has one; otherwise type, or use the keyboard's microphone) and shows the words as they come. OK saves the note on this device AND sends it to the server's report box,
// with the screen's text and markup, what the game was doing, and the game state, so that it can be worked on later without asking where it was said.
// Nothing is worked on at once: the notes are a master list (the server's report table, tagged "[Note]"; tools/notes_digest.py turns it into docs/notes/MASTER.md).
import { BUG_URL, CHANNEL } from './channel.js';
import { VERSION, BUILD } from './version.js';
import { h } from './dom.js';
import { gzip, toBase64 } from './bugreport.js';

const DB = CHANNEL === 'next' ? 'magic-realm-notes-next' : 'magic-realm-notes', STORE = 'notes', SHOW_KEY = 'mr-notebtn';
const memory = new Map();
let dbp = null;
const open = () => (dbp ??= new Promise((res, rej) => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
export async function putNote(n) { memory.set(n.id, n); try { const db = await open(); await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).put(n)); } catch { /* kept in memory */ } }
export async function allNotes() {
    let list = []; try { const db = await open(); list = await wrap(db.transaction(STORE).objectStore(STORE).getAll()); } catch { /* memory */ }
    const seen = new Set(list.map(n => n.id)); for (const n of memory.values()) if (!seen.has(n.id)) list.push(n);
    return list.sort((a, b) => (a.at < b.at ? 1 : -1));
}
export async function deleteNote(id) { memory.delete(id); try { const db = await open(); await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)); } catch { /* ignore */ } }

export const noteButtonOn = () => { try { return localStorage.getItem(SHOW_KEY) !== '0'; } catch { return true; } };
export function setNoteButton(on) { try { if (on) localStorage.removeItem(SHOW_KEY); else localStorage.setItem(SHOW_KEY, '0'); } catch { /* ignore */ } syncButton(); }

// ---- what the screen was showing and what the game was doing ----
export function context() {
    const mr = window.__mr, g = mr?.game, st = g?.st, ui = g?.ui, app = document.getElementById('app');
    return { build: `${VERSION}${BUILD ? ' ' + BUILD : ''}`, channel: CHANNEL, screen: mr?.ctx?.screen ?? null, sheet: ui?.sheet ?? null, pending: st?.pending?.type ?? null, period: st?.period ?? null,
        day: st?.day ?? null, character: st?.ch?.id ?? null, at: st?.ch?.at ?? null, seed: st?.session?.params?.seed ?? null, voice: document.documentElement.dataset.voiceMode ?? null,
        textScale: document.documentElement.style.getPropertyValue('--ts') || '1', viewport: [innerWidth, innerHeight], pixelRatio: devicePixelRatio, userAgent: navigator.userAgent,
        text: (app?.innerText ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, 4000) };
}
const screenLabel = c => [c.screen, c.sheet && `sheet ${c.sheet}`, c.pending && `asking ${c.pending}`, c.day != null && `day ${c.day}`].filter(Boolean).join(' · ');

async function sendNote(n) {
    const doc = { kind: 'note', app: 'magic-realm', note: n.text, ctx: n.ctx, savedAt: n.at, dom: n.dom ?? null, state: n.state ?? null };
    const text = JSON.stringify(doc); let blob = await gzip(text);
    if (blob && blob.length > 800_000) { doc.dom = null; blob = await gzip(JSON.stringify(doc)); }
    if (blob && blob.length > 800_000) { doc.state = null; blob = await gzip(JSON.stringify(doc)); }
    const summary = { version: n.ctx.build, seed: n.ctx.seed, character: n.ctx.character, day: n.ctx.day, result: 'note' };
    const description = `[Note] ${screenLabel(n.ctx)}: ${n.text}`.slice(0, 3900);
    const body = blob ? { description, summary, encoding: 'gzip-base64', payload: toBase64(blob) } : { description, summary, encoding: 'json', payload: JSON.stringify(doc) };
    const res = await fetch(BUG_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = null; try { j = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !j?.ok) throw new Error(j?.error ?? `The server answered ${res.status}.`);
    return j.id;
}
export async function flushNotes() {
    let sent = 0;
    for (const n of (await allNotes()).filter(x => x.status !== 'sent').reverse()) { try { n.serverId = await sendNote(n); n.status = 'sent'; n.dom = null; n.state = null; await putNote(n); sent++; } catch { break; } }
    return sent;
}

// ---- the sheet ----
const standalone = () => navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
const IOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Speech recognition where the browser has it. A Home Screen web app on iPhone has the API but it never hears anything (WebKit): there the keyboard's own microphone key is used.
const Recognition = () => (IOS() && standalone() ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null);
const ERRORS = { 'not-allowed': 'The microphone or speech recognition is switched off for this site (Settings > Safari, or Siri & Dictation).', 'service-not-allowed': 'Speech recognition is switched off on this phone (Settings > Siri & Dictation).',
    'no-speech': 'Nothing heard. Say it again, or type it.', 'audio-capture': 'No microphone found.', network: 'Speech recognition needs a connection.', 'language-not-supported': 'That language is not supported here.' };
let layer = null, rec = null;
const close = () => { try { rec?.stop(); } catch { /* ignore */ } rec = null; layer?.remove(); layer = null; syncButton(); };
const toast = (text, bad = false) => { const t = h('div', { class: `nt-toast${bad ? ' bad' : ''}`, role: 'status' }, text); document.body.append(t); setTimeout(() => t.remove(), 3200); };

export function openNote() {
    if (layer) return;
    const ctx = context();
    const dom = (() => { try { return document.getElementById('app')?.outerHTML ?? null; } catch { return null; } })();
    let state = null; try { state = window.__mr?.game?.st ? JSON.parse(JSON.stringify(window.__mr.game.st)) : null; } catch { /* a state that cannot be copied is left out */ }
    const R = Recognition();
    let base = '', listening = false;
    const ta = h('textarea', { class: 'nt-text', rows: 5, 'data-note-text': '', placeholder: R ? 'Say it, or type it.' : 'Tap the microphone on your keyboard, and say it.', 'aria-label': 'What you want to happen on this screen' });
    const dot = h('span', { class: 'nt-dot', 'aria-hidden': 'true' }), state_ = h('b', {}, R ? 'Listening' : 'Say or type it');
    const msg = h('p', { class: 'nt-msg', 'data-note-msg': '', role: 'status' }, R ? '' : 'Tap the microphone key on your keyboard to speak. Your words appear here.');
    let heard = false, wantListening = false, quietTimer = null;
    const micBtn = h('button', { type: 'button', class: 'ds-btn sm quiet nt-mic', 'data-act': 'note-mic', hidden: !R }, 'Stop');
    const ok = h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'note-ok', disabled: true, onclick: save }, 'OK, save it');
    const sync = () => { ok.disabled = !ta.value.trim(); };
    const paint = () => { layer?.classList.toggle('on', listening); state_.textContent = listening ? 'Listening' : R ? 'Not listening' : 'Say or type it'; micBtn.textContent = listening ? 'Stop' : 'Talk again'; };
    const say = t => { msg.textContent = t; };
    ta.addEventListener('input', sync);
    function start() {
        if (!R) return;
        try {
            rec = new R(); rec.continuous = !IOS(); rec.interimResults = true; rec.lang = navigator.language || 'en-US';
            base = ta.value ? ta.value.trim() + ' ' : ''; heard = false; wantListening = true; say('');
            rec.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; heard = true; clearTimeout(quietTimer); say(''); ta.value = (base + t).trimStart(); sync(); };
            rec.onend = () => { listening = false; paint(); if (wantListening && IOS() && heard) { base = ta.value.trim() + ' '; try { rec.start(); listening = true; paint(); } catch { /* ignore */ } } };
            rec.onerror = e => { listening = false; wantListening = false; paint(); if (e?.error && e.error !== 'aborted') { say(ERRORS[e.error] ?? `Speech recognition stopped (${e.error}). Type it, or use the keyboard microphone.`); ta.focus(); } };
            rec.start(); listening = true; paint();
            clearTimeout(quietTimer); quietTimer = setTimeout(() => { if (!heard && listening) say('Nothing heard yet. Say it again, type it, or use the keyboard microphone.'); }, 6000);
        } catch (e) { listening = false; paint(); say(`Could not start listening (${e?.name ?? 'error'}). Type it, or use the keyboard microphone.`); ta.focus(); }
    }
    micBtn.addEventListener('click', () => { if (listening) { wantListening = false; try { rec.stop(); } catch { /* ignore */ } } else start(); });
    async function save() {
        const text = ta.value.trim(); if (!text) return;
        ok.disabled = true;
        const n = { id: String(Date.now()), at: new Date().toISOString(), text, ctx, dom, state, status: 'queued' };
        await putNote(n); close();
        try { n.serverId = await sendNote(n); n.status = 'sent'; n.dom = null; n.state = null; await putNote(n); toast('Saved and sent. It is on the list.'); }
        catch { toast('Saved on this phone. It will go when the server answers.', true); }
    }
    layer = h('div', { class: 'nt-layer', 'data-note-sheet': '' },
        h('div', { class: 'nt-scrim', onclick: () => { if (!ta.value.trim()) close(); } }),
        h('div', { class: 'nt-sheet', role: 'dialog', 'aria-label': 'Note' },
            h('div', { class: 'nt-head' }, dot, state_, micBtn),
            h('p', { class: 'nt-ask' }, 'Say what you want to happen on this screen.'),
            h('p', { class: 'nt-where' }, screenLabel(ctx) || 'This screen'),
            ta, msg,
            h('div', { class: 'nt-foot' }, h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'note-cancel', onclick: close }, 'Cancel'), ok)));
    document.body.append(layer); syncButton(); start(); paint(); if (!R) ta.focus();
    // the iPhone keyboard covers the bottom of the page without resizing it: follow the visible part
    const vv = window.visualViewport;
    if (vv) { const fit = () => { if (!layer) return; layer.style.top = `${vv.offsetTop}px`; layer.style.height = `${vv.height}px`; }; vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit(); }
}

// ---- the list: what has been said, and whether the server has it ----
export async function openNotesList() {
    if (layer) return;
    const notes = await allNotes();
    const rows = notes.length ? notes.map(n => h('div', { class: 'nt-row', 'data-note-row': n.id },
        h('p', {}, n.text), h('small', {}, `${new Date(n.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${screenLabel(n.ctx) || 'a screen'} · ${n.status === 'sent' ? 'on the server' : 'waiting to send'}`),
        h('button', { type: 'button', class: 'ds-btn sm quiet', 'data-act': 'note-delete', onclick: async e => { await deleteNote(n.id); e.target.closest('.nt-row').remove(); } }, 'Delete'))) : [h('p', { class: 'nt-empty' }, 'No notes yet. The round button on every screen records one.')];
    const exportAll = () => { const blob = new Blob([JSON.stringify({ app: 'magic-realm', notes: notes.map(({ dom, state, ...n }) => n) }, null, 1)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: `magic-realm-notes-${new Date().toISOString().slice(0, 10)}.json` }); document.body.append(a); a.click(); a.remove(); };
    layer = h('div', { class: 'nt-layer list', 'data-notes-list': '' }, h('div', { class: 'nt-scrim', onclick: close }),
        h('div', { class: 'nt-sheet tall', role: 'dialog', 'aria-label': 'Your notes' }, h('div', { class: 'nt-head' }, h('b', {}, `Your notes (${notes.length})`), h('button', { type: 'button', class: 'nt-x', 'aria-label': 'Close', onclick: close }, '×')),
            h('div', { class: 'nt-rows' }, rows),
            h('div', { class: 'nt-foot' }, h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'note-flush', onclick: async () => { const n = await flushNotes(); close(); toast(n ? `Sent ${n}.` : 'Nothing to send, or the server is not answering.', !n); } }, 'Send waiting'), h('button', { type: 'button', class: 'ds-btn', 'data-act': 'note-export', onclick: exportAll, disabled: !notes.length }, 'Export'))));
    document.body.append(layer);
}

// ---- the round button ----
let btn = null;
function syncButton() { if (!btn) return; btn.hidden = !noteButtonOn() || !!layer; }
export function initNotes() {
    if (btn) return;
    btn = h('button', { type: 'button', id: 'notebtn', class: 'nt-btn', 'data-act': 'note', 'aria-label': 'Record a note about this screen', onclick: openNote },
        h('span', { html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>' }));
    document.body.append(btn); syncButton();
    // Where it sits: on the map's bottom-left corner (the fit button has the right), so it never covers a clearing; in a fight and on the other screens, at the top right under the status bar
    let queued = false;
    const place = () => {
        queued = false;
        const map = document.querySelector('.ds-map'), cb = document.querySelector('.cb');
        const want = cb ? document.body : (map ?? document.body);
        if (btn.parentNode !== want) want.append(btn);
        btn.classList.toggle('in-map', want === map && !cb);
    };
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(place); } }).observe(document.getElementById('app') ?? document.body, { childList: true, subtree: true });
    place();
    setTimeout(() => { flushNotes().catch(() => {}); }, 4000);
}
