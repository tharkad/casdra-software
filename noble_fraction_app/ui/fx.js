import { h } from './dom.js';
import { describeEvent } from './labels.js';
import { score } from '../engine/index.js';
import { CARD_DEFS } from '../data/cards.js';

// The animation layer. Everything is derived by comparing the game state (and the card elements on
// screen) before and after a move, so any rule that adds, moves or removes cards is animated without
// the rule knowing about it. All motion uses the Web Animations API scaled by one speed factor;
// speed "off" does nothing at all (tests, reduced motion).
let scale = 1;
export const SPEEDS = { off: 0, fast: 0.55, normal: 1 };
export const setSpeed = mode => { scale = SPEEDS[mode] ?? 1; };
export const enabled = () => scale > 0;
export const ms = n => Math.round(n * scale);

const layer = () => document.getElementById('fx');
const one = sel => document.querySelector(sel);
const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

const ZONES = ['draw', 'hand', 'discard', 'installed', 'completed', 'pipelines'];
const marketUids = s => new Set(Object.values(s.market).flat().map(c => c.uid));

function snapshot(s) {
    const market = marketUids(s);
    return s.players.map(p => {
        const sets = Object.fromEntries(ZONES.map(z => [z, new Set(p[z].map(c => c.uid))]));
        const all = new Set([...ZONES.flatMap(z => [...sets[z]]), ...(p.contract ? [p.contract.uid] : [])]);
        const sc = score(s, p.id);
        return { money: p.money, vp: sc.total, parts: sc.parts, sets, all, market, defs: new Map([...ZONES.flatMap(z => p[z])].map(c => [c.uid, c.defId])) };
    });
}
const bidKey = s => new Map([...s.market.contractLine, ...s.market.upgradeLine].map(c => [c.uid, JSON.stringify(c.bids ?? {})]));

// A card that was dragged and dropped starts its flight from where the player released it, not from its slot.
const dragRects = new Map();
export const noteDragRect = (uid, rect) => { dragRects.set(uid, rect); };

// Call BEFORE the move: remembers the state and where every card element is.
export function capture(s) {
    const cards = new Map();
    if (enabled()) {
        document.querySelectorAll('#app .card[data-uid]').forEach(el => {
            const uid = Number(el.dataset.uid);
            cards.set(uid, { rect: dragRects.get(uid) ?? el.getBoundingClientRect(), node: el.cloneNode(true) });
        });
    }
    dragRects.clear();
    return { cards, snap: snapshot(s), bids: bidKey(s) };
}

function animate(el, frames, opts) {
    if (!el || !el.animate) return null;
    return el.animate(frames, { fill: 'both', ...opts });
}

// The opening of a new game: the header and console settle in, then the market cards are dealt in from above and the hand from below,
// each with a short stagger. Resolves when everything has landed; a tap or key press finishes it at once. Does nothing when animations are off.
export function intro() {
    if (!enabled()) return Promise.resolve();
    const market = [...document.querySelectorAll('#main .card[data-uid]')];
    const hand = [...document.querySelectorAll('#hand .card[data-uid]')];
    const anims = [];
    const go = (el, from, delay, duration, easing = 'cubic-bezier(.2,.85,.25,1.08)') => {
        const a = animate(el, [{ opacity: 0, ...from }, { opacity: 1, transform: 'none' }], { duration: ms(duration), delay: ms(delay), easing, fill: 'backwards' });
        if (a) anims.push(a);
    };
    const hud = one('#hud'); const consoleEl = one('#console');
    if (hud) go(hud, { transform: 'translateY(-22px)' }, 0, 360, 'ease-out');
    if (consoleEl) go(consoleEl, { transform: 'translateY(-10px)' }, 90, 360, 'ease-out');
    market.forEach((el, i) => go(el, { transform: 'translateY(-70px) scale(.6) rotate(-6deg)' }, 220 + i * 55, 460));
    hand.forEach((el, i) => go(el, { transform: 'translateY(150px) scale(.8) rotate(5deg)' }, 220 + market.length * 55 + i * 75, 480));
    if (!anims.length) return Promise.resolve();
    return new Promise(resolve => {
        const done = () => { document.removeEventListener('pointerdown', skip, true); document.removeEventListener('keydown', skip, true); resolve(); };
        const skip = () => anims.forEach(a => a.finish());
        document.addEventListener('pointerdown', skip, true); document.addEventListener('keydown', skip, true);
        Promise.all(anims.map(a => a.finished.catch(() => null))).then(done);
    });
}

export function floatText(el, text, cls = '') {
    if (!el || !enabled()) return;
    const r = el.getBoundingClientRect();
    const d = h('div', { class: `float ${cls}` }, text);
    d.style.left = `${r.left + r.width / 2}px`; d.style.top = `${r.top + 2}px`;
    layer().append(d);
    const a = animate(d, [{ transform: 'translate(-50%, 0)', opacity: 0 }, { transform: 'translate(-50%, -8px)', opacity: 1, offset: .18 },
        { transform: 'translate(-50%, -42px)', opacity: 0 }], { duration: ms(1500), easing: 'ease-out' });
    if (a) a.onfinish = () => d.remove(); else d.remove();
}

export function pulse(el, strength = 1.25) {
    if (el?.classList?.contains('side')) {                    // a score box must not swell into its neighbour: it glows in its own colour instead
        const colour = getComputedStyle(el).borderColor;
        animate(el, [{ boxShadow: `0 0 0 0 ${colour}`, filter: 'brightness(1)' }, { boxShadow: `0 0 14px 3px ${colour}`, filter: 'brightness(1.35)', offset: .4 }, { boxShadow: `0 0 0 0 ${colour}`, filter: 'brightness(1)' }], { duration: ms(620), fill: 'none' });
        return;
    }
    animate(el, [{ transform: 'scale(1)' }, { transform: `scale(${strength})`, offset: .4 }, { transform: 'scale(1)' }], { duration: ms(520), fill: 'none' });
}

export function toast(text, who = 0) {
    if (!enabled()) return;
    const box = one('#toasts');
    if (!box) return;
    while (box.children.length >= 3) box.firstChild.remove();
    const t = h('div', { class: `toast by-${who}` }, text);
    box.append(t);
    const life = ms(2600);
    const a = animate(t, [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none', offset: .08 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: life });
    if (a) a.onfinish = () => t.remove(); else t.remove();
}

export function clearToasts() { const box = one('#toasts'); if (box) box.replaceChildren(); }

function flyChip(label, from, toEl, hue = 190) {
    if (!toEl) return;
    const to = center(toEl.getBoundingClientRect());
    const chip = h('div', { class: 'chip' }, label);
    chip.style.setProperty('--h', hue);
    chip.style.left = `${from.x}px`; chip.style.top = `${from.y}px`;
    layer().append(chip);
    const a = animate(chip, [{ transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: .2 },
        { transform: `translate(${to.x - from.x - 0}px, ${to.y - from.y}px) translate(-50%, -50%) scale(.55)`, opacity: .9 }], { duration: ms(900), easing: 'cubic-bezier(.3,.7,.3,1)' });
    if (a) a.onfinish = () => { chip.remove(); pulse(toEl, 1.3); }; else chip.remove();
}

function confetti(at) {
    if (!enabled()) return;
    for (let i = 0; i < 26; i += 1) {
        const bit = h('i', { class: 'confetti' });
        bit.style.left = `${at.x}px`; bit.style.top = `${at.y}px`;
        bit.style.background = `hsl(${Math.floor(Math.random() * 360)} 90% 62%)`;
        layer().append(bit);
        const ang = Math.random() * Math.PI * 2; const dist = 60 + Math.random() * 120;
        const a = animate(bit, [{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist + 50}px) rotate(${Math.random() * 720}deg) scale(.4)`, opacity: 0 }],
        { duration: ms(1300 + Math.random() * 500), easing: 'cubic-bezier(.2,.7,.4,1)' });
        if (a) a.onfinish = () => bit.remove(); else bit.remove();
    }
}

// Where did card `uid` end up? Returns the on-screen element to fly towards, or null (back to the supply).
function destination(next, uid) {
    for (const p of next.players) {
        const where = ZONES.find(z => p[z].some(c => c.uid === uid)) ?? (p.contract?.uid === uid ? 'contract' : null);
        if (!where) continue;
        if (p.id === 1) return one('.side-1');
        if (where === 'discard') return one('[data-count=discard]');
        if (where === 'draw') return one('[data-count=draw]');
        if (where === 'hand') return one('#hand');
        return one('[data-pane=facility]');
    }
    return null;
}

// Why did the VP total change? Names the score parts that moved (money counts 1 VP per $5, or per $2 with a Reserve Fund).
const PART_NAMES = { contracts: 'Contract', upgrades: 'Upgrade', pipelines: 'Main', money: 'from $', bonuses: 'bonus', privilege: "Founder's Seal" };
const vpReason = (was, is) => Object.keys(PART_NAMES).filter(k => (is.parts[k] ?? 0) !== (was.parts[k] ?? 0)).map(k => PART_NAMES[k]).join(', ');

const namesOf = defIds => {
    const counts = {};
    defIds.forEach(id => { counts[id] = (counts[id] ?? 0) + 1; });
    return Object.entries(counts).map(([id, n]) => `${CARD_DEFS[id].id.length <= 2 ? id : CARD_DEFS[id].name}${n > 1 ? ` ×${n}` : ''}`).join(', ');
};

// Call AFTER the move has been applied and the screen re-rendered.
export function play({ before, next, events, actor }) {
    if (!enabled() || !before) return;
    const now = snapshot(next);
    const who = actor;

    events.forEach(e => {
        const text = describeEvent(e);
        if (text) toast(`${e.by === 1 ? 'Rival: ' : ''}${text}`, e.by ?? who);
        if (e.type === 'contractCompleted') confetti(e.by === 1 ? center(one('.side-1').getBoundingClientRect()) : { x: innerWidth / 2, y: innerHeight / 2 });
    });

    next.players.forEach((_, pid) => {
        const was = before.snap[pid]; const is = now[pid];
        const side = one(`.side-${pid}`);
        if (is.money !== was.money) {
            const d = is.money - was.money;
            floatText(one(`.side-${pid} .cash`), `${d > 0 ? '+' : '−'}$${Math.abs(d)}`, d > 0 ? 'gain' : 'loss');
            pulse(one(`.side-${pid} .cash`));
        }
        if (is.vp !== was.vp) {
            const d = is.vp - was.vp;
            const why = vpReason(was, is);
            floatText(one(`.side-${pid} .vp`), `${d > 0 ? '+' : '−'}${Math.abs(d)} VP${why ? ` (${why})` : ''}`, d > 0 ? 'vp' : 'loss');
            pulse(one(`.side-${pid} .vp`));
        }
        // Cards that did not exist anywhere before: added to the plant's discard pile from the supply.
        const created = [...is.all].filter(uid => !was.all.has(uid) && !was.market.has(uid));
        const createdDefs = created.map(uid => is.defs.get(uid)).filter(Boolean);
        if (createdDefs.length) {
            const home = pid === 0 ? '[data-count=discard]' : '.side-1';
            const label = namesOf(createdDefs);
            toast(`${pid === 1 ? 'Rival: ' : ''}+${label} added to ${pid === 1 ? "the Rival's" : 'your'} discard pile`, pid);
            createdDefs.forEach((id, i) => setTimeout(() => flyChip(id.length <= 2 ? id : '+', { x: innerWidth / 2 + (i - createdDefs.length / 2) * 26, y: 24 }, one(home), CARD_DEFS[id].kind === 'element' ? 190 : 260), ms(120 * i)));
        }
        // Cards that moved from the deck into the hand.
        const drawn = [...is.sets.hand].filter(uid => was.sets.draw.has(uid));
        if (drawn.length && pid === 0) {
            toast(`You drew ${drawn.length} card${drawn.length > 1 ? 's' : ''}`, 0);
            const deck = one('[data-count=draw]'); if (deck) pulse(deck, 1.3);
        } else if (drawn.length && pid === 1 && events.some(e => e.type === 'played' || e.type === 'usedInstalled')) {
            toast(`Rival drew ${drawn.length} card${drawn.length > 1 ? 's' : ''}`, 1);
        }
        if (side && pid === who) animate(side, [{ boxShadow: '0 0 0 0 rgba(255,255,255,0)' }, { boxShadow: '0 0 14px 3px rgba(255,255,255,.55)', offset: .3 }, { boxShadow: '0 0 0 0 rgba(255,255,255,0)' }], { duration: ms(900), fill: 'none' });
    });

    // New card elements: draw them in. Removed ones: fly a ghost to where the card went.
    const deck = one('[data-count=draw]');
    let order = 0;
    document.querySelectorAll('#app .card[data-uid]').forEach(el => {
        const uid = Number(el.dataset.uid);
        if (before.cards.has(uid)) return;
        const r = el.getBoundingClientRect();
        const inHand = Boolean(el.closest('#hand'));
        const from = inHand && deck ? center(deck.getBoundingClientRect()) : { x: r.left + r.width / 2, y: -80 };
        const c = center(r);
        animate(el, [{ transform: `translate(${from.x - c.x}px, ${from.y - c.y}px) scale(.35)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
            { duration: ms(560), delay: ms(110 * order), easing: 'cubic-bezier(.2,.8,.3,1)' });
        if (inHand) animate(el, [{ filter: 'brightness(1.9)' }, { filter: 'none' }], { duration: ms(1400), delay: ms(110 * order), fill: 'none' });
        order += 1;
    });
    // Cards that stayed but now sit somewhere else (the hand closing up after a discard, a market line shifting)
    // slide from where they were to where they are, instead of snapping there while other animations still run.
    document.querySelectorAll('#app .card[data-uid]').forEach(el => {
        const was = before.cards.get(Number(el.dataset.uid));
        if (!was) return;
        const r = el.getBoundingClientRect();
        const dx = was.rect.left - r.left; const dy = was.rect.top - r.top;
        if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) return;
        animate(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: ms(520), easing: 'cubic-bezier(.25,.8,.3,1)' });
    });
    const present = new Set([...document.querySelectorAll('#app .card[data-uid]')].map(el => Number(el.dataset.uid)));
    before.cards.forEach((info, uid) => {
        if (present.has(uid)) return;
        const ghost = info.node;
        ghost.style.position = 'fixed'; ghost.style.left = `${info.rect.left}px`; ghost.style.top = `${info.rect.top}px`;
        ghost.style.width = `${info.rect.width}px`; ghost.style.height = `${info.rect.height}px`; ghost.style.margin = '0'; ghost.style.pointerEvents = 'none';
        layer().append(ghost);
        const dest = destination(next, uid);
        let frames;
        if (dest) {
            const to = center(dest.getBoundingClientRect()); const from = center(info.rect);
            frames = [{ transform: 'none', opacity: 1 }, { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(.25)`, opacity: .2 }];
        } else frames = [{ transform: 'none', opacity: 1 }, { transform: 'translateY(30px) scale(.8) rotate(4deg)', opacity: 0 }];
        const a = animate(ghost, frames, { duration: ms(dest ? 800 : 600), easing: 'ease-in' });
        if (a) a.onfinish = () => { ghost.remove(); if (dest) pulse(dest, 1.25); }; else ghost.remove();
    });

    // Bid Tokens that appeared or moved.
    const bidsNow = bidKey(next);
    bidsNow.forEach((key, uid) => {
        if (before.bids.get(uid) !== key) document.querySelectorAll(`.card[data-uid="${uid}"] .tok`).forEach(t => animate(t, [{ transform: 'scale(.2)' }, { transform: 'scale(1.5)', offset: .6 }, { transform: 'scale(1)' }], { duration: ms(600), fill: 'none' }));
    });
}
