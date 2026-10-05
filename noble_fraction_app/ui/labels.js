import { CARD_DEFS, DISTILL_PRIORITY } from '../data/cards.js';
import { quote } from '../engine/buy.js';
import { findCard } from './find.js';

const nameOf = defId => CARD_DEFS[defId].name;
const count = (cards, id) => cards.filter(c => c.defId === id).length;
const money = n => `${n < 0 ? '−' : '+'}$${Math.abs(n)}`;

export function barLabel(a, s) {
    const p = s.players[s.turn.active];
    switch (a.type) {
    case 'beginTurn': return a.overtime ? 'Night shift' : 'Normal turn';
    case 'distill': {
        const el = DISTILL_PRIORITY.find(e => count(p.hand, e) > 0);
        return el ? `Distill — removes ${el}×${count(p.hand, el)}` : 'Distill — nothing to remove';
    }
    case 'endDistill': {
        const xe = count(p.hand, 'Xe');
        const onlyXe = xe > 0 && !p.hand.some(c => DISTILL_PRIORITY.includes(c.defId));
        const f = s.turn.f;
        const own = defId => p.installed.filter(c => c.defId === defId).length;
        const payouts = [];
        const cash = (f.armedCash + own('heat_exchanger')) * f.removed.O;
        const bids = Math.min(p.tokensLeft, (f.armedBidTokens + own('cryo_chiller')) * f.removed.N);
        if (cash > 0) payouts.push(`${nameOf('heat_exchanger')} +$${cash}`);
        if (bids > 0) payouts.push(`${bids} free Bid Token${bids > 1 ? 's' : ''}`);
        if (onlyXe) payouts.push(`isolates Xe×${xe}`);
        return payouts.length ? `End distill — ${payouts.join(', ')}` : 'End distill';
    }
    case 'air': return a.feed ? 'Intake ×2 (Fan) +$4' : 'Intake +$2';
    case 'wipe': return `PURGE ${a.line === 'contract' ? 'contracts' : 'upgrades'}${a.ppe ? ' (Shift Engineer)' : ''}`;
    case 'endStep': return s.turn.phase === 'overtimeBid' && s.turn.f.stepsLeft > 1 ? 'Next bid step' : 'End step';
    case 'finishTurn': return 'Finish turn';
    case 'choosePrivilege': return a.side === 'plus3' ? 'Take +3 VP and end game' : 'Final turn for both';
    default: return a.type;
    }
}

const nameByUid = (s, uid) => nameOf(findCard(s, uid).card.defId);

// The button text for a card-bound action shown in that card's zoom sheet.
export function cardLabel(a, s) {
    const p = s.players[s.turn.active];
    switch (a.type) {
    case 'play': case 'useInstalled': {
        const verb = a.type === 'play' ? 'Play' : 'Use';
        if (a.discard) return `${verb} — discard ${nameByUid(s, a.discard)}`;
        if (a.install) return `${verb} — install ${nameByUid(s, a.install)} free`;
        if (a.choice) return `${verb} — ${a.choice === 'draw' ? 'draw the top card' : 'discard the top card'}`;
        return verb;
    }
    case 'install': return `Install ($${CARD_DEFS[findCard(s, a.uid).card.defId].installDiff})`;
    case 'buy': {
        const q = quote(s, p, findCard(s, a.uid).card, a.install);
        const kind = CARD_DEFS[findCard(s, a.uid).card.defId].kind;
        const verb = kind === 'contract' ? 'Take contract' : a.install ? 'Buy & install' : 'Buy';
        return `${verb} (net ${money(q.delta)})`;
    }
    case 'bid': return 'Place a Bid Token here';
    case 'bidMove': return `Move a Bid Token here from ${nameByUid(s, a.from)}`;
    case 'placeFreeBid': return 'Place a free Bid Token here';
    case 'discard': return 'Discard';
    default: return a.type;
    }
}

const LINE = { contract: 'Contracts', upgrade: 'Upgrades' };
export function describeEvent(e) {
    switch (e.type) {
    case 'turnStart': return e.overtime ? 'Began a NIGHT SHIFT (two BID steps, no INTAKE/PURGE or BUY)' : null;     // a normal start is not worth a line
    case 'distill': return e.count ? `Distilled away ${e.element}×${e.count}` : 'Distilled (nothing to remove)';
    case 'distillAll': return `Distilled all ${e.element} (×${e.count})`;
    case 'isolated': return `Isolated Xe×${e.xe} into cold storage`;
    case 'cashPerO': return `${nameOf('heat_exchanger')} paid $${e.money}`;
    case 'air': return `Intake: ${e.packets} packet${e.packets > 1 ? 's' : ''} (+$${2 * e.packets})`;
    case 'wipe': return `PURGED the ${LINE[e.line]} line`;
    case 'buy': return `${e.install ? 'Bought & installed' : 'Bought'} ${nameOf(e.card)} (net ${money(e.delta)})`;
    case 'install': return `Installed ${nameOf(e.card)} ($${e.cost})`;
    case 'played': return `Played ${nameOf(e.card)}`;
    case 'usedInstalled': return `Used installed ${nameOf(e.card)}`;
    case 'peekDeck': return `${nameOf('sampling_port')}: ${e.choice === 'draw' ? 'drew' : 'discarded'} ${nameOf(e.card)}`;
    case 'contractCompleted': return `COMPLETED ${nameOf(e.contract)} (+$${e.money})`;
    case 'bid': return `Bid on ${nameOf(e.card)}${e.n > 1 ? ` ×${e.n}` : ''}`;
    case 'bidMove': return `Moved ${e.n > 1 ? `${e.n} Bids` : 'a Bid'} from ${nameOf(e.from)} to ${nameOf(e.card)}`;
    case 'gameEndTriggered': return `Triggered the game end (${e.side === 'plus3' ? '+3 VP' : 'final turn'})`;
    default: return null;
    }
}

// Collapses repeats: three Bids on one card become one line with a count.
export function summarizeEvents(events) {
    const merged = [];
    const seen = new Map();
    for (const e of events) {
        if (e.type !== 'bid' && e.type !== 'bidMove') { merged.push({ ...e }); continue; }
        const key = `${e.type}:${e.from ?? ''}:${nameOf(e.card)}`;
        if (seen.has(key)) seen.get(key).n += 1;
        else { const entry = { ...e, n: 1 }; seen.set(key, entry); merged.push(entry); }
    }
    const lines = merged.map(describeEvent).filter(Boolean);
    return lines;
}

// The whole game as a turn log: one group per turn, newest turn first and newest move first inside it.
export function groupLog(log) {
    const turns = [];
    for (const e of log) {
        const last = turns.at(-1);
        if (last && last.turnNo === e.turnNo && last.by === e.by) last.events.push(e);
        else turns.push({ turnNo: e.turnNo, by: e.by, events: [e] });
    }
    return turns.map(t => ({ turnNo: t.turnNo, by: t.by, lines: summarizeEvents(t.events).reverse() }))
        .filter(t => t.lines.length > 0).reverse();
}
