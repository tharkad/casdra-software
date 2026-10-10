import { handle, provide } from './registry.js';
import { activePlayer, logEvent, newCard, takeFrom } from './helpers.js';
import { lineSize, drawForLine, lineOf, discardOf, lineNames } from './market.js';
import { enterBuyBid } from './buybid.js';

const hasBid = card => Object.values(card.bids ?? {}).some(n => n > 0);

export function introduceAir(s, p, times) {
    for (let i = 0; i < times; i += 1) {
        ['N', 'O', 'Kr', 'Xe'].forEach(el => p.discard.push(newCard(s, el)));
        p.money += 2;
    }
    logEvent(s, { type: 'air', packets: times });
}

function combinations(items, k) {
    if (k === 0) return [[]];
    if (items.length < k) return [];
    const [head, ...rest] = items;
    return [...combinations(rest, k - 1).map(c => [head, ...c]), ...combinations(rest, k)];
}

provide(s => {
    if (s.turn.phase !== 'airwipe') return [];
    const p = activePlayer(s);
    const ppe = s.turn.f.ppe;
    if (ppe) {
        const pick = Math.min(ppe.slots, ppe.drawn.length);
        return combinations(ppe.drawn.map(c => c.uid), pick).map(uids => ({ type: 'ppeChoose', uids }));
    }
    const acts = [{ type: 'air' }];
    p.hand.filter(c => c.defId === 'intake_fan').forEach(c => acts.push({ type: 'air', feed: c.uid }));
    p.installed.filter(c => c.defId === 'intake_fan').forEach(c => acts.push({ type: 'air', feed: c.uid }));
    for (const line of lineNames) {
        if (!lineOf(s, line).some(c => !hasBid(c))) continue;
        acts.push({ type: 'wipe', line });
        p.hand.filter(c => c.defId === 'shift_engineer')
            .forEach(c => acts.push({ type: 'wipe', line, ppe: c.uid }));
    }
    return acts;
});

handle('air', (s, a) => {
    const p = activePlayer(s);
    if (a.feed) {
        const inHand = takeFrom(p.hand, a.feed);
        introduceAir(s, p, 2);
        if (inHand) p.discard.push(inHand);
    } else {
        introduceAir(s, p, 1);
    }
    enterBuyBid(s);
});

handle('wipe', (s, a) => {
    const p = activePlayer(s);
    const line = lineOf(s, a.line);
    const keep = line.filter(hasBid);
    line.filter(c => !hasBid(c)).forEach(c => { delete c.bids; discardOf(s, a.line).push(c); });
    line.splice(0, line.length, ...keep);
    logEvent(s, { type: 'wipe', line: a.line, kept: keep.length });
    if (!a.ppe) {
        while (line.length < lineSize(s)) {
            const card = drawForLine(s, a.line);
            if (!card) break;
            line.push(card);
        }
        enterBuyBid(s);
        return;
    }
    const played = takeFrom(p.hand, a.ppe);
    const drawn = [];
    for (let i = 0; i < 6; i += 1) {
        const card = drawForLine(s, a.line);
        if (card) drawn.push(card);
    }
    p.discard.push(played);
    s.turn.f.ppe = { line: a.line, drawn, slots: lineSize(s) - keep.length };
});

handle('ppeChoose', (s, a) => {
    const { line, drawn } = s.turn.f.ppe;
    drawn.forEach(card => {
        if (a.uids.includes(card.uid)) lineOf(s, line).push(card);
        else { delete card.bids; discardOf(s, line).push(card); }
    });
    delete s.turn.f.ppe;
    enterBuyBid(s);
});
