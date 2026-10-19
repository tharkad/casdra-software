import { BUG_URL } from './channel.js';
import { allRecords } from './gamestore.js';
import { finalize } from '../engine/gamerecord.js';

// "Report a problem": everything needed to see what happened, sent with the player's description.
//   - the current game: its record (parameters, every action, the whole log, refused actions, day table) and its full state
//   - the other games kept on the device (newest first, as much as fits)
//   - the app version and the device (browser, screen)
// Nothing about the player is sent beyond that. The server keeps it in a table for later analysis.

const LIMIT = 800_000;                 // bytes of gzip the server will take is 900,000

export const toBase64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

export async function gzip(text) {
    if (typeof CompressionStream === 'undefined') return null;
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function collect({ st, rec, version, ui }) {
    if (rec) finalize(rec, st);
    const others = (await allRecords().catch(() => [])).filter(r => r.id !== rec?.id);
    const env = { userAgent: navigator.userAgent, language: navigator.language, viewport: [innerWidth, innerHeight], pixelRatio: devicePixelRatio, url: location.href, tzOffset: new Date().getTimezoneOffset(), online: navigator.onLine };
    const make = games => JSON.stringify({ app: 'magic-realm', format: 1, version, sentAt: new Date().toISOString(), env,
        where: { sheet: ui?.sheet ?? null, pending: st?.pending?.type ?? null, period: st?.period ?? null, day: st?.day ?? null },
        record: rec, state: st, otherGames: games });
    // as many of the other games as fit, newest first; the rest are left out (the list says how many)
    let keep = others.length, text = make(others.slice(0, keep)), blob = await gzip(text);
    while (blob && blob.length > LIMIT && keep > 0) { keep = Math.floor(keep / 2); text = make(others.slice(0, keep)); blob = await gzip(text); }
    const summary = { version, seed: rec?.params?.seed ?? null, character: st?.ch?.id ?? null, day: st?.day ?? null, result: rec?.meta?.result ?? 'playing' };
    return { text, blob, summary, games: 1 + keep, omitted: others.length - keep, bytes: blob ? blob.length : text.length };
}

export async function send(description, packed) {
    const body = packed.blob
        ? { description, summary: packed.summary, encoding: 'gzip-base64', payload: toBase64(packed.blob) }
        : { description, summary: packed.summary, encoding: 'json', payload: packed.text };
    const res = await fetch(BUG_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = null;
    try { j = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !j?.ok) throw new Error(j?.error ?? `The server answered ${res.status}.`);
    return j.id;
}
