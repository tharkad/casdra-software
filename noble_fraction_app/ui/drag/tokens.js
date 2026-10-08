// Bid Token dragging: where a token can come from and which legal action a drop on a card performs. `ctx.legal` is the human's legal list.
export function tokenSources(ctx) {
    const pips = new Set(); let chip = false;
    for (const a of ctx.legal ?? []) {
        if (a.type === 'bid' || a.type === 'placeFreeBid') chip = true;
        if (a.type === 'bidMove') pips.add(a.from);
    }
    return { chip, pips };
}

// source: { kind: 'chip' } (your tokens-left chip) or { kind: 'pip', uid } (one of your tokens on card `uid`). Returns Map(targetUid -> action).
export function tokenTargets(ctx, source) {
    const out = new Map();
    for (const a of ctx.legal ?? []) {
        if (source.kind === 'chip' && (a.type === 'bid' || a.type === 'placeFreeBid') && !out.has(a.uid)) out.set(a.uid, a);
        if (source.kind === 'pip' && a.type === 'bidMove' && a.from === source.uid) out.set(a.to, a);
    }
    return out;
}
