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

// Hands the text to the best thing the device offers: the share sheet (phones), the clipboard, or a download.
// Returns which one worked ('share' | 'copy' | 'download').
export async function deliverExport(text, filename = 'noble-fraction-log.txt') {
    try {
        if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ title: 'Noble Fraction log', text }); return 'share'; }
    } catch (e) { if (e?.name === 'AbortError') return 'share'; }                         // the player closed the share sheet: fine
    try { await navigator.clipboard.writeText(text); return 'copy'; } catch { /* fall through to a download */ }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'download';
}
