import { groupLog } from './labels.js';
import { score, winner } from '../engine/index.js';
import { LEVELS } from '../bot/levels.js';

// A plain-text copy of the whole game log, oldest turn first (the sheet shows newest first), with enough
// header (mode, level, seed) to replay or report the game. Pure: callers pass `when` in.
export function buildLogExport({ state, level, achievements = [], when = null }) {
    const mode = state.rules?.mode === 'overtime' ? 'Overtime (10 to end)' : 'Normal (5 to end)';
    const lines = ['NOBLE FRACTION — game log', `Game length: ${mode}`, `Rival level: ${LEVELS.find(l => l.id === level)?.label ?? level}`];
    if (state.rules?.seed !== undefined) lines.push(`Seed: ${state.rules.seed}`);
    if (when) lines.push(`Exported: ${when}`);
    const mine = score(state, 0).total; const theirs = score(state, 1).total;
    lines.push(`Turn ${state.turn.number} · You ${mine} VP ($${state.players[0].money}) — Rival ${theirs} VP ($${state.players[1].money})`);
    if (state.turn.phase === 'over') {
        const w = winner(state);
        lines.push(`Result: ${w.tie ? 'tie' : w.winnerId === 0 ? 'you won' : 'the Rival won'}`);
    }
    lines.push('');
    for (const turn of groupLog(state.log, achievements).reverse()) {
        lines.push(`Turn ${turn.turnNo} — ${turn.by === 0 ? 'You' : 'Rival'}`);
        turn.lines.forEach(l => lines.push(`  - ${l}`));
    }
    return `${lines.join('\n')}\n`;
}

export const lastSaved = { path: null };                       // where the desktop app put the last file, for the confirmation message

// Hands the text to the best thing the device offers. `prefer: 'file'` (Save all logs) means "give me a file": the desktop app's Documents folder, the
// share sheet on phones, otherwise a real download -- never just the clipboard. Without it (a single readable log) the clipboard comes before a download.
// Returns which one worked ('file' | 'share' | 'copy' | 'download').
export async function deliverExport(text, filename = 'noble-fraction-log.txt', { prefer = null, type = 'text/plain' } = {}) {
    if (prefer === 'file' && window.nobleFractionShell?.saveFile) {
        try { const where = await window.nobleFractionShell.saveFile(filename, text); if (where) { lastSaved.path = where; return 'file'; } } catch { /* fall through */ }
    }
    try {
        if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ title: 'Noble Fraction log', text }); return 'share'; }
    } catch (e) { if (e?.name === 'AbortError') return 'share'; }                         // the player closed the share sheet: fine
    if (prefer !== 'file') { try { await navigator.clipboard.writeText(text); return 'copy'; } catch { /* fall through to a download */ } }
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename, rel: 'noopener' });
    a.style.display = 'none';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);                                     // Safari needs the URL to outlive the click
    return 'download';
}
