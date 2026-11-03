// combat/stage.js: the scene's stage: the foes across the top as the real counters, the three lanes of the melee sheet, and you at the bottom with your weapon, your armor and one pip per chit.
// Pure DOM builders: everything they show comes in as arguments, and every tap goes out through a callback. No engine calls except denSide (the counter must say what the rules say).
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { monsterCounter, itemFace } from '../counter.js';
import { nameOf, defOf, isWeaponCard, weaponSide } from '../../engine/catalogue.js';
import { denSide, weaponOf, activeArmor, own } from './feed.js';
import { DIRS, MNV, otherSide, picOf, chitText, chitName, WORD, isWithered, WITHER_STORY, WITHER_DETAIL } from './model.js';
import { displayName, tieNumber } from '../names.js';

// foe counter size by how many stand on the stage: the full size (92, or 64 on a short phone) up to three, then smaller so six still fit in two rows
// a picture straight from the art manifest (its paths already start with art/)
const pic = (src, alt = '') => h('img', { src, alt, draggable: 'false' });
export const foeSize = (n, roomy = false) => {
    const short = typeof matchMedia === 'function' && matchMedia('(max-height: 700px)').matches, base = short ? 64 : 92;
    // a Meeting has few creatures and no lanes (DR-20): the counters take the room, up to 128 (three still stand in one row)
    if (roomy && !short && n >= 1 && n <= 3) return Math.min(128, Math.floor((Math.min(typeof innerWidth === 'number' ? innerWidth : 393, 520) - 32 - (n - 1) * 10) / n));
    // a fight with room (a tall phone, up to three on the stage): the counters take the width the row has, up to 116
    if (n <= 3) return short ? base : Math.max(base, Math.min(n <= 2 ? 144 : 124, Math.floor((Math.min(typeof innerWidth === 'number' ? innerWidth : 393, 520) - 32 - (n - 1) * 10) / n)));
    // four stand in one row at the width of the screen; more take two rows, smaller
    const w = Math.min(typeof innerWidth === 'number' ? innerWidth : 393, 520) - 32;
    if (n === 4) return Math.min(base, Math.floor((w - 3 * 10) / 4));
    return Math.round(base * (n <= 6 ? 0.72 : 0.6));
};

// Press and hold on a counter (about half a second) calls onHold instead of the tap: the same item card as a tap on the map. The click that follows the release is swallowed.
function holdable(btn, onHold) {
    if (!onHold) return;
    let timer = null, held = false;
    const stop = () => { clearTimeout(timer); timer = null; };
    btn.addEventListener('pointerdown', () => { held = false; stop(); timer = setTimeout(() => { held = true; onHold(); }, 480); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'pointermove']) btn.addEventListener(ev, ev === 'pointermove' ? () => {} : stop);
    btn.addEventListener('click', e => { if (held) { held = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    btn.addEventListener('contextmenu', e => e.preventDefault());
}

// What the rules say about a creature on a given side, or, if the engine cannot say (a creature that has left the game's lists, a part whose owner is gone, a kind nobody knew), at least its name: a counter is never blank.
export function safeSide(fm, data, d) {
    try { const s = denSide(fm, data, d); if (s && s.name) return d?.kind === 'hire' && d.hireKind === 'nat' && !s.group ? { ...s, group: data.natives?.[d.id]?.group } : s; } catch { /* fall through to the bare name */ }
    const name = d?.kind === 'mon' || d?.kind === 'hire' ? data.monsters?.[d.id]?.name : d?.kind === 'nat' ? data.natives?.[d.id]?.name : null;
    return { name: name ?? d?.name ?? String(d?.id ?? 'Unknown creature'), size: null, vuln: null, armored: false, harm: null, stars: 0, atk: null, move: null, length: 0, attack: 'none', fame: 0, notor: 0 };
}
// The counter of one creature on one side: the frame, the name and the picture (the main art, else the rulebook's own counter, else none) whatever the creature is, alive or slain.
export function counterOf(fm, data, d, side, flies = false) {
    let picture = null;
    try { picture = picOf(fm, data, d, side); } catch { picture = null; }
    const turned = side !== (d?.side ?? 'light');          // (the other side: what is printed on it, never the stat of the side in play)
    return monsterCounter({ s: safeSide(fm, data, { ...d, side, ...(turned ? { stat: undefined } : {}) }), side, picture, flies, size: 92 });
}

// One foe: its counter (tap to turn it over), and an optional tag (TARGET, a box, WOUNDED YOU). `view` says which side shows; `tag` is { text, kind, onclick? }.
export function foeEl({ st: fm, data, d, flipped = false, tag = null, dead = false, onFlip, size = 92, justFlipped = false, selected = false, turnedOver = false, onHold = null, seton = null, onPick = null }) {          // (onPick: a crowded stage, a tap on a counter that is not the target names it; the chosen one turns over on the next tap)
    let other = null; try { other = otherSide(data, d); } catch { other = null; }
    const showRev = !!flipped && other && other !== (d.side ?? 'light');
    const view = showRev ? { ...d, side: other, stat: undefined } : d;
    const s = safeSide(fm, data, view);
    const side = showRev ? other : (d.side ?? 'light');
    const flies = d.kind === 'mon' && !!data.monsters?.[d.id]?.flies;
    const svg = counterOf(fm, data, d, side, flies);
    // The tag (TARGET, a box, WOUNDED YOU) stands in its own slot ABOVE the counter, never over its name (QA-8). `tag.dot`: a crowded stage (QA-6) shows the offer as a ghost dot with a 44px hit area instead of a word.
    const tagEl = tag ? h(tag.onclick ? 'button' : 'span', { class: `tag ${tag.kind ?? ''}${tag.dot ? ' dot' : ''}`, ...(tag.onclick ? { type: 'button', 'data-tag': d.uid, 'aria-label': tag.label ?? tag.text, onclick: e => { e.stopPropagation(); tag.onclick(); } } : {}) }, tag.dot ? null : tag.text) : null;
    const flipBtn = h('button', { type: 'button', class: 'cb-flip', 'data-flip': d.uid, 'aria-pressed': showRev ? 'true' : 'false', 'aria-label': `${s.name}${dead ? ', slain' : ''}, ${showRev ? 'other side showing, not the current side' : 'current side up'}: ${onPick && !selected ? 'tap to name it as your target' : onPick ? 'your target: tap to turn the counter over' : 'tap to turn the counter over'}, press and hold for its card`, onclick: () => (onPick && !selected ? onPick(d) : onFlip?.(d, !!other)), style: 'padding:0;display:block' },
            h('span', { class: 'ds-cs-wrap' }, svg), other && !dead ? h('span', { class: 'turn', 'aria-hidden': 'true' }, icon('retry')) : null,
            showRev && !dead ? h('span', { class: 'sidelbl peek', 'data-side': d.uid }, size < 76 ? 'NOT NOW' : 'NOT CURRENT SIDE') : null,
            turnedOver && !dead ? h('span', { class: 'turned', 'data-turned': d.uid }, size < 76 ? 'TURNED' : 'TURNED OVER') : null);
    if (!dead) holdable(flipBtn, onHold ? () => onHold(d) : null);
    return h('div', { class: `cb-foe${dead ? ' dead' : ''}${justFlipped ? ' flip' : ''}${d.pacified || (d.bystander && !d.assigned && !dead) ? ' pacified' : ''}${d.pickedUp ? ' held' : ''}${selected ? ' sel' : ''}`, style: `--foe:${size}px`, 'data-foe': d.uid, 'data-on': seton?.on ?? null },
        h('div', { class: 'tagslot' }, tagEl),
        flipBtn,
        seton && !dead ? h('span', { class: `seton ${seton.kind}`, 'data-seton': d.uid }, seton.text) : null);
}

// A long name ("Company Short Swords #1") would run off the counter: shrink it to fit the printed strip, and if it would be too small to read, set it on two lines. Needs the counters to be in the page (text is
// measured), so the scene calls it once it is mounted. The measure is in the counter's own units (a 100 x 100 box).
export function fitNames(root) {
    for (const svg of root.querySelectorAll('.cb-foe svg.counter, .cb-foe .ds-cs-wrap svg, .cb-ally .ds-cs-wrap svg')) {
        const t = svg.querySelector('text');
        if (!t || t.dataset.fit) continue;
        t.dataset.fit = '1';
        let len = 0; try { len = t.getComputedTextLength(); } catch { continue; }
        const fs = parseFloat(t.getAttribute('font-size')), room = 90;
        if (!len || len <= room) continue;
        const small = fs * room / len;
        if (small >= 6.4) { t.setAttribute('font-size', String(Math.floor(small * 10) / 10)); continue; }
        const words = t.textContent.split(/[ \u00A0]/), cut = Math.ceil(words.length / 2) + (words.length > 3 ? -1 : 0);
        t.textContent = words.slice(0, cut).join(' ');
        t.setAttribute('font-size', '7.5');
        const t2 = t.cloneNode(false); t2.textContent = words.slice(cut).join('\u00A0'); t2.setAttribute('y', '21'); t2.setAttribute('font-size', '7.5'); t2.dataset.fit = '1';
        t.after(t2);
    }
}

// The other characters standing in the clearing, and the hirelings that are theirs, drawn as counters under the foes (F1 "The Clearing": everyone who is here is on the stage). `others` = M.othersHere();
// `targetable` = the uids the engine lets him name; `target` = the one he named. A tap on a targetable one names it; a hidden one is dimmed with a dashed ring.
export function othersEl({ others, targetable = new Set(), target = null, onPick = null, size = 52, hiresOnly = false }) {          // (hiresOnly: a party on one phone stands in its own row, combat/party.js; only the hirelings are drawn here)
    const face = (o, kind) => h('span', { class: `face${o.hidden ? ' hid' : ''}${kind === 'hire' ? ' hire' : ''}` }, o.pic ? pic(o.pic, '') : h('i', {}, (o.name ?? '?')[0]));
    const one = (o, kind, ownerId) => {
        const can = targetable.has(o.uid), sel = target === o.uid;
        const tag = can ? h('button', { type: 'button', class: `tag ${sel ? '' : 'ghost'}`, 'data-tag': o.uid, 'aria-label': sel ? `Target: ${o.name}. Tap to strike no one` : `Target ${o.name}`, onclick: e => { e.stopPropagation(); onPick?.(sel ? null : o.uid); } }, 'TARGET') : null;
        const body = h(can ? 'button' : 'span', { class: 'cb-flip', ...(can ? { type: 'button', 'data-pick': o.uid, 'aria-pressed': sel ? 'true' : 'false', 'aria-label': `${o.name}${o.hidden ? ', hidden' : ''}: ${sel ? 'your target' : 'tap to name as your target'}`, onclick: () => onPick?.(sel ? null : o.uid), style: 'padding:0;display:block' } : {}) }, face(o, kind));
        return h('div', { class: `cb-other${kind === 'hire' ? ' hire' : ''}${sel ? ' sel' : ''}${o.hidden ? ' dim' : ''}`, style: `--foe:${size}px`, 'data-other': kind === 'hire' ? o.uid : o.id, 'data-owner': ownerId ?? null },
            h('div', { class: 'tagslot' }, tag), body,
            h('span', { class: 'cap' }, h('b', {}, o.name), h('small', {}, kind === 'hire' ? 'a hireling' : o.hidden ? 'hidden' : 'in plain sight')));
    };
    return h('div', { class: 'cb-others', role: 'group', 'aria-label': `Also here: ${others.map(o => o.name).join(', ')}` },
        ...others.flatMap(o => [hiresOnly ? null : one(o, 'char', null), ...o.hires.map(x => one(x, 'hire', o.id))]).filter(Boolean));
}

// Threads on the stage (F1): the one he named, a gold thread from him to it; a creature set on another character, a thread to that character. Drawn in the stage's own units (the layout offsets, which
// the stage's zoom does not change), from what is in the page, so it follows the counters wherever they stand. `root` is the scene.
export function drawThreads(root) {
    const inner = root.querySelector('.cb-stagein');
    if (!inner) return;
    inner.querySelector(':scope > svg.cb-threads')?.remove();
    const where = el => { let x = 0, y = 0, n = el; while (n && n !== inner) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x: x + el.offsetWidth / 2, y, w: el.offsetWidth, h: el.offsetHeight }; };
    const hero = inner.querySelector('.cb-hero .face, .cb-ptile.me .hex');
    const art = el => el;          // (the whole of a creature: its counter and the word under it)
    const lines = [];
    const target = inner.querySelector('.cb-foe.sel[data-foe], .cb-other.sel');
    if (hero && target) lines.push({ a: hero, b: art(target), cls: 'tgt' });          // (from him to what he named: the arrow ends on it)
    for (const f of inner.querySelectorAll('.cb-foe[data-foe][data-on]')) {
        const on = f.dataset.on; if (!on || on === 'you' || f === target) continue;
        const to = inner.querySelector(`.cb-other[data-other="${CSS.escape(on)}"]`); if (to) lines.push({ a: art(f), b: art(to), cls: 'on' });
    }
    if (!lines.length) return;
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'cb-threads'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('width', String(inner.offsetWidth)); svg.setAttribute('height', String(inner.offsetHeight));
    const defs = document.createElementNS(NS, 'defs'); svg.append(defs);
    for (const cls of ['tgt', 'on']) {
        const m = document.createElementNS(NS, 'marker'); m.setAttribute('id', `cbth-${cls}`); m.setAttribute('viewBox', '0 0 10 10'); m.setAttribute('refX', '8'); m.setAttribute('refY', '5'); m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7'); m.setAttribute('orient', 'auto-start-reverse');
        const pth = document.createElementNS(NS, 'path'); pth.setAttribute('d', 'M0 0 L10 5 L0 10 z'); pth.setAttribute('class', `cb-thead ${cls}`); m.append(pth); defs.append(m);
    }
    for (const { a, b, cls } of lines) {
        const A = where(a), B = where(b);
        // from the edge of one to the edge of the other: the lower one's top, the upper one's bottom
        const up = A.y < B.y, x1 = A.x, y1 = up ? A.y + A.h : A.y, x2 = B.x, y2 = up ? B.y : B.y + B.h;
        const p = document.createElementNS(NS, 'path'), bend = Math.abs(x2 - x1) < 6 ? 28 : 0;
        p.setAttribute('d', `M${x1} ${y1} Q ${(x1 + x2) / 2 + bend} ${(y1 + y2) / 2} ${x2} ${y2}`); p.setAttribute('class', `cb-thread ${cls}`); p.setAttribute('marker-end', `url(#cbth-${cls})`);
        if (cls === 'tgt') p.setAttribute('data-thread', 'target');
        svg.append(p);
    }
    inner.prepend(svg);
}

// The hirelings (and the creatures a spell won over) beside you, as real counters (QA-116): the picture, the name, the days left as pips, and a tap turns the counter over like a foe's.
// `allies` = M.alliesOf(); `flipped` = { [uid]: true } for the ones turned over; `size` is the counter's size.
export function alliesEl({ st: fm, data, allies, flipped = {}, onFlip, size = 56 }) {
    return h('div', { class: 'cb-allies', style: `--ally:${size}px`, role: 'group', 'aria-label': `On your side: ${allies.map(a => a.name).join(', ')}` }, ...allies.map(a => {
        const den = { uid: `ally:${a.uid}`, kind: a.kind, id: a.id, side: a.side };
        let other = null; try { other = otherSide(data, den); } catch { other = null; }
        const turned = !!flipped[a.uid] && !!other;
        const svg = counterOf(fm, data, den, turned ? other : a.side, a.kind === 'mon' && !!data.monsters?.[a.id]?.flies);
        const low = a.days != null && a.days <= 3;
        return h('div', { class: `cb-ally${a.controlled ? ' ctl' : ''}`, 'data-ally': a.uid },
            h('button', { type: 'button', class: 'cb-flip', 'data-ally-flip': a.uid, 'aria-pressed': turned ? 'true' : 'false', 'aria-label': `${a.name}, on your side: tap to turn the counter over`, onclick: () => onFlip?.(a, !!other), style: 'padding:0;display:block' },
                h('span', { class: 'ds-cs-wrap' }, svg), other ? h('span', { class: 'turn', 'aria-hidden': 'true' }, icon('retry')) : null),
            h('span', { class: 'cap' }, h('b', {}, tieNumber(a.name)), h('small', {}, `${a.hidden ? 'hidden \u00B7 ' : ''}${a.days != null ? `with you \u00B7 ${a.days} day${a.days === 1 ? '' : 's'}` : a.controlled ? 'with you \u00B7 until Sunset' : 'with you'}`),
                a.days != null ? h('span', { class: `ds-daypips${low ? ' low' : ''}`, 'aria-hidden': 'true' }, Array.from({ length: 14 }, (_, i) => h('i', { class: i < a.days ? null : 'off' }))) : null));
    }));
}

// the lanes: the three attack circles (Thrust, Swing, Smash) on top, the three maneuver squares (Charge, Dodge, Duck) under them. Same index = same red box (rules 4.1).
// attack = { dir, text } puts his Fight chit in that circle; guard = { dir, text } his Move chit in that square; boxes = { [lane]: [pictureSrc...] } the creatures standing in each red box.
// Notes 102 and 103: a lane always keeps its name (the chit stands under it, never in its place); each row says what was played (the chit used, the weapon used, the attack time: `attack.says`, `guard.says`,
// see playSays); and beneath the defence row stand the armor pieces, each under the lanes it covers (`armor` = armorPieces()), with `why` (the voice pair { story, detail }) saying why the player does
// not place a lone creature in a lane.
export function lanesEl({ attack = null, guard = null, boxes = {}, sec = null, armor = null, why = null } = {}) {
    const top = [0, 1, 2].map(i => h('div', { class: `cb-lane${attack && attack.dir === i ? ' mine' : ''}${(boxes[i] ?? []).length ? ' crowd' : ''}`, 'data-lane': `a${i}` },
        h('span', { class: 'lbl' }, DIRS[i]),
        attack && attack.dir === i && attack.text ? h('span', { class: 'cb-pill' }, attack.glove ? icon('glove') : null, attack.text) : null,
        ...(boxes[i] ?? []).slice(0, 3).map(src => h('span', { class: 'ds-counter sm', 'aria-hidden': 'true' }, src ? pic(src) : null)), (boxes[i] ?? []).length > 3 ? h('span', { class: 'cb-more' }, `+${boxes[i].length - 3}`) : null));
    const bot = [0, 1, 2].map(i => h('div', { class: `cb-lane${guard && guard.dir === i ? ' guard' : ''}`, 'data-lane': `g${i}` },
        h('span', { class: 'lbl' }, MNV[i]),
        guard && guard.dir === i && guard.text ? h('span', { class: 'cb-pill g' }, guard.text) : null));
    const nbsp = t => String(t).replace(/ (?=\d)/g, ' ');
    const line = (row, says, what) => (says ? h('p', { class: `cb-pl ${row === 'attack' ? 'atk' : 'grd'}`, 'data-row': row },
        ...[says.kind, says.weapon, says.time != null ? nbsp(`${what} time ${says.time}`) : null].filter(Boolean).flatMap((t, k) => [k ? h('span', { class: 'sep', 'aria-hidden': 'true' }, '·') : null, h('span', { class: 'nbw' }, t)]).filter(Boolean)) : null);
    return h('div', { class: 'cb-lanewrap', 'data-sec': sec },
        h('div', { class: 'cb-lanes top', 'aria-hidden': 'true' }, ...top), line('attack', attack?.text ? attack.says : null, 'attack'),
        h('div', { class: 'cb-lanes bot', 'aria-hidden': 'true' }, ...bot), line('guard', guard?.text ? guard.says : null, 'maneuver'),
        armor ? armorRow(armor, why) : null);
}

/** What the armor in use covers (rules 8.4.5i, 8.4.9j): [{ uid, name, pic, dirs: [0..2] | null, shield, damaged }] in the order a blow meets them (the Ointment of Steel, then a shield or armor card, then a helmet
 * or breastplate, then a suit). `dirs` is the attack directions it stops: the data's `protects`; a shield stops the one lane he picks (`shieldDir`; null while he has not picked: `dirs` is null). */
export function armorPieces(fm, data, shieldDir = null) {
    const rank = d => (d.id === 'ointment-of-steel-1' ? 0 : d.type === 'shield' || d.chooseOneDirection || d.card ? 1 : /helmet|breastplate/.test(d.type ?? '') ? 2 : 3);
    return activeArmor(fm, data).map(({ item, def }) => {
        const shield = (def.type ?? '').toLowerCase() === 'shield' || !!def.chooseOneDirection, name = nameOf(data, item);
        const dirs = shield ? (shieldDir == null ? null : [shieldDir]) : ['thrust', 'swing', 'smash'].map((w, i) => ((def.protects ?? []).includes(w) ? i : null)).filter(i => i != null);
        return { uid: item.uid, name, pic: data.art?.armor?.[name] ?? null, dirs, shield, damaged: !!item.damaged, rank: rank(def), card: !!def.card };
    }).sort((a, b) => a.rank - b.rank || Number(a.card) - Number(b.card));
}

// the armor ovals of the melee section, beneath the defence squares: each piece stands under the lanes it covers (the same three columns), stacked where two pieces cover one lane; a lane no piece covers says so
function armorRow(pieces, why) {
    const rows = [], place = [];
    for (const pc of pieces) {
        const cols = pc.dirs ?? [0, 1, 2];
        let r = 0; while ((rows[r] ??= new Set()) && cols.some(c => rows[r].has(c))) r++;
        cols.forEach(c => rows[r].add(c)); place.push({ pc, r, cols });
    }
    const covered = new Set(place.flatMap(x => x.cols));
    const kids = place.map(({ pc, r, cols }) => {
        const lanes = pc.dirs ? pc.dirs.map(d => DIRS[d]).join(' · ') : 'the lane you pick';
        const say = pc.shield && pc.dirs ? `guards ${DIRS[pc.dirs[0]]}` : pc.shield ? 'guards one lane, your pick' : `stops ${pc.dirs.map(d => DIRS[d]).join(', ').replace(/, ([^,]*)$/, ' and $1')}`;
        return h('div', { class: `cb-apiece s${cols.length}${pc.damaged ? ' dmg' : ''}`, 'data-armor': pc.uid, 'data-lanes': pc.dirs ? pc.dirs.join(',') : '0,1,2', role: 'img', 'aria-label': `${pc.name}${pc.damaged ? ', damaged' : ''}: ${say}`, style: `grid-column:${cols[0] + 1} / span ${cols.length};grid-row:${r + 1}` },
            pc.pic ? h('span', { class: 'th ds-counter sm', 'aria-hidden': 'true' }, pic(pc.pic)) : null,
            h('span', { class: 't' }, h('b', {}, pc.name), h('small', {}, pc.shield && pc.dirs ? `guards ${lanes}` : lanes, pc.damaged ? ' · damaged' : '')));
    });
    for (const c of [0, 1, 2]) if (!covered.has(c)) kids.push(h('div', { class: 'cb-abare', 'data-lane': c, 'aria-label': `No armor against ${DIRS[c]}`, style: `grid-column:${c + 1};grid-row:1` }, h('span', {}, DIRS[c]), h('small', {}, 'no armor')));
    return h('div', { class: 'cb-armor' }, h('div', { class: 'cb-agrid' }, ...kids),
        why ? h('p', { class: 'cb-armor-why' }, h('span', { 'data-v': 'story' }, why.story), h('span', { 'data-v': 'detail' }, why.detail)) : null);
}

/** What a play says, in the words of the lane lines (note 102): `kind` the chit (Fight H6, Move M4), `weapon` the weapon used, `time` the attack time: the weapon's printed time for the side it lies on, else the Fight chit's
 * (8.4.5, the engine's attackTimeOf); for a Move chit the maneuver time. A spell names itself and has no weapon. A creature he has become strikes with its own counter (no time said: the engine reads it off the counter's side). */
export function playSays(fm, data, chit, { move = false, spell = false } = {}) {
    if (spell) return { kind: 'Spell', weapon: null, time: null };
    if (!chit) return null;
    const kind = chit.card && chit.name ? chit.name : chitName(chit);
    if (move) return { kind, weapon: null, time: chit.time ?? null };
    const cr = fm.ch.morph?.creature, w = weaponOf(fm, data);
    if (cr) return { kind, weapon: cr.name, time: null };
    return { kind, weapon: w ? nameOf(data, w.item) : 'bare hands', time: (w ? weaponSide(w).time : null) ?? chit.time ?? null };
}

// one pip per action chit, in the chits' own order (fight, move, magic), coloured by kind and shaped by state: ready, tired (faded), wounded (dashed red)
export function pipsEl(fm, prev = null, data = null) {
    const order = { fight: 0, move: 1, magic: 2 };
    const chits = [...own(fm, data).chits].sort((a, b) => (order[a.type] ?? 3) - (order[b.type] ?? 3));
    const cls = x => (isWithered(fm, x) ? 'tired withered' : x.state === 'fatigued' ? 'tired' : x.state === 'wounded' ? 'wounded' : x.state === 'committed' ? 'committed' : x.state === 'enchanted' ? 'enchanted' : '');
    return h('div', { class: 'cb-pips', role: 'img', 'aria-label': `${chits.filter(x => x.state === 'active').length} chits ready, ${chits.filter(x => x.state === 'fatigued').length} tired, ${chits.filter(x => x.state === 'wounded').length} wounded` },
        ...chits.map(x => h('i', { class: `ds-chit mini ${x.type}${cls(x) ? ` ${cls(x)}` : ''}${prev && prev[x.id] && prev[x.id] !== x.state ? ' fresh' : ''}`, 'data-pip': x.id }, ({ fight: 'F', move: 'M', magic: '✦' })[x.type] || '?')));
}

/** What the hero's weapon chip says about it: { state: 'alerted' | 'unalerted' | 'card', words: 'ALERTED' | 'NOT ALERTED' | 'WEAPON CARD', fig: 'H6', say: plain words for a screen reader }.
 * A weapon counter is "alerted" when its red side is face up (rule 2.3.4d); a weapon card cannot be alerted and stays face up. The figures are the harm and attack time of the side up now. */
export function weaponState(data, w) {
    const card = isWeaponCard(data, w.item), s = weaponSide(w);
    const fig = `${s.harm ?? ''}${'*'.repeat(s.stars ?? 0)}${s.time ?? ''}`;
    const state = card ? 'card' : w.item.alerted ? 'alerted' : 'unalerted';
    const words = card ? 'WEAPON CARD' : state === 'alerted' ? 'ALERTED' : 'NOT ALERTED';
    return { state, words, fig, say: `harm ${s.harm}${s.time != null ? `, attack time ${s.time}` : ''}${card ? ', always ready' : ''}` };
}

/** The Belongings and the map buttons (DR-21): an icon button that opens one of them and brings the fight back. */
export const peekBtn = (act, label, ic, on) => (on ? h('button', { type: 'button', class: 'ds-btn icon quiet cb-peek', 'data-act': act, 'aria-label': label, onclick: on }, icon(ic), h('span', { class: 'pk' }, label)) : null);          // (a word under the picture: note 102, always the name)

// you: the weapon on the left, the armor on the right, your face and a pip per chit between. A morphed hero is the creature's counter. Tap a piece of gear to read it (and turn it over).
export function heroEl({ st: fm, data, onGear, onPeekGear = null, onPeekMap = null, onCurse = null, hurtArmor = false, ribbon = null, prevChits = null, wasHidden = false, bare = false, slim = false, inline = null }) {          // (bare: his face and name stand in the party row instead, combat/party.js)
    const ch = fm.ch, w = weaponOf(fm, data), armor = activeArmor(fm, data).map(a => a.item ?? a).filter(x => x && x.uid);
    const wName = w ? nameOf(data, w.item) : null, aName = armor[0] ? nameOf(data, armor[0]) : null;
    const cr = ch.morph?.creature, lt = cr?.light ?? {};
    const face = cr
        ? h('span', { class: 'face morph' }, monsterCounter({ s: { name: cr.name, vuln: cr.vuln, armored: !!cr.armored, attack: lt.attack ?? 'weapon', harm: lt.harm, stars: lt.stars ?? 0, atk: lt.atk, move: lt.move, length: lt.length ?? 0, fame: cr.fame ?? 0, notor: cr.notor ?? 0 }, side: 'light', picture: data.art?.monsters?.[cr.name] ?? null, flies: !!cr.flies, size: 72 }))
        : h('span', { class: `face${ch.hidden ? ' hid' : ''}` }, data.art?.characters?.[ch.id] ? pic(data.art.characters[ch.id].replace(/\.gif$/, '.png'), displayName(ch.name)) : null);
    // Note 100: the weapon says on its own chip whether it is alerted, in the item card's words (ALERTED / NOT ALERTED, or a weapon card, which cannot be alerted: rule 2.3.4d), with the figures of the side up now.
    const ws = w ? weaponState(data, w) : null;
    const gear = (kind, name, src, more, hurt, peekBtn = null) => h('div', { class: 'gcol' },
        h('button', { type: 'button', class: `gear${src ? '' : ' none'}${hurt ? ' hurt' : ''}${kind === 'weapon' && ws ? ` w-${ws.state}` : ''}`, 'data-act': 'peek-gear-card', ...(kind === 'weapon' && ws ? { 'data-alerted': ws.state === 'alerted' ? '1' : '0', 'data-wstate': ws.state } : {}),
            'aria-label': name ? `${name}${kind === 'weapon' && ws ? `, ${ws.words.toLowerCase()}, ${ws.say}` : ''}: read it` : `No ${kind}`, onclick: () => onGear?.(kind), disabled: !name || null },
            src ? pic(src) : null, more > 1 ? h('span', { class: 'more' }, `+${more - 1}`) : null, kind === 'weapon' && ws ? h('span', { class: 'wfig', 'aria-hidden': 'true' }, ws.fig) : null),
        h('span', { class: 'cap' }, name ?? (ch.morph ? '' : `no ${kind}`)),
        kind === 'weapon' && ws ? h('span', { class: `wplate ${ws.state}`, 'data-wplate': ws.state }, ws.words) : null, peekBtn);
    const hurtGear = armor.some(a => a.damaged);
    // DR-21: the Belongings and the map are one thumb away, bottom left and bottom right of the stage under the weapon and the armor, not in the top 100px. (data-act peek-gear / peek-map: the tests' hooks)
    const peek0 = peekBtn;
    const peek = (...a) => (slim ? null : peek0(...a));          // (slim: the Belongings and the map buttons stand at the ends of the party's row, combat/party.js)
    const gcol = (kids, peekBtn) => h('div', { class: 'gcol' }, ...kids, peekBtn);
    return h('div', { class: 'cb-hero' },
        ch.morph ? gcol([], peek('peek-gear', 'Belongings', 'bag', onPeekGear)) : gear('weapon', wName, wName ? data.art?.weapons?.[wName] : null, w ? 1 : 0, false, peek('peek-gear', 'Belongings', 'bag', onPeekGear)),
        h('div', { class: `mid${onPeekGear ? ' tappable' : ''}`, 'data-act': onPeekGear ? 'peek-hero' : null, onclick: onPeekGear ?? null }, bare ? null : face, bare ? null : h('span', { class: 'name' }, displayName(ch.name)), inline, ribbon ? h('span', { class: 'ribbon' }, ribbon) : null, pipsEl(fm, prevChits, data), (ch.curses ?? []).length && onCurse ? h('button', { type: 'button', class: 'cb-curse', 'data-act': 'curse-badge', 'aria-label': `Cursed: ${ch.curses.join(', ')}. Tap to read`, onclick: e => { e.stopPropagation(); onCurse(); } }, icon('skull'), ch.curses.join(', ')) : null),
        ch.morph ? gcol([], peek('peek-map', 'Map', 'pin', onPeekMap)) : gear('armor', aName, aName ? data.art?.armor?.[aName] : null, armor.length, hurtGear, peek('peek-map', 'Map', 'pin', onPeekMap)));
}

// The things he carries into the fight, as counters he can turn over (alerted or not, whole or damaged): the old Belongings cards, as one small card over the stage.
export function gearPopover({ st: fm, data, flippedGear, onFlip, onClose }) {
    const w = weaponOf(fm, data), items = [...(w ? [w.item] : []), ...activeArmor(fm, data).map(a => a.item ?? a).filter(x => x && x.uid)];
    const card = it => {
        const d = defOf(data, it), name = nameOf(data, it), pic = data.art?.weapons?.[name] ?? data.art?.armor?.[name] ?? null, flip = !!flippedGear[it.uid];
        let counter, cap;
        if (it.kind === 'weapon') {
            const showA = flip ? !it.alerted : !!it.alerted, s = showA ? d.alerted : d.unalerted;
            counter = itemFace({ name, picture: pic, face: showA ? 'Alerted' : 'Not alerted', big: `${s.harm}${s.attackTime ?? ''}`, stars: s.stars ?? 0, corner: `(${d.length})`, current: !flip, size: 92 });
            cap = `${name}: ${showA ? 'alerted' : 'not alerted'}${flip ? ' (other side)' : ''}`;
        } else {
            const showD = flip ? !it.damaged : !!it.damaged;
            counter = itemFace({ name, picture: pic, face: showD ? 'Damaged' : 'Whole', big: d.toughness ?? '', circle: showD ? d.priceDamaged ?? null : d.priceIntact ?? null, circleTone: showD ? 'red' : 'blue', current: !flip, size: 92 });
            cap = `${name}: ${showD ? 'damaged' : 'whole'}${flip ? ' (other side)' : ''}, toughness ${WORD[d.toughness] ?? d.toughness ?? '?'}`;
        }
        return h('button', { type: 'button', class: 'gc', 'data-gear': it.uid, 'aria-label': `${name}: tap to turn it over`, onclick: e => { e.stopPropagation(); onFlip(it.uid); } }, counter, h('span', {}, cap));
    };
    return h('div', { class: 'cb-pop', role: 'dialog', 'aria-label': 'Your weapon and armor', onclick: onClose }, ...items.map(card));
}

export { chitText };

// Note 75: the curse badge's card (the map shell shows the same skull): the Story line, then the rule
export function cursePopover({ st: fm, data, onClose }) {
    const wither = (own(fm, data).curses ?? []).includes('Wither');
    return h('div', { class: 'cb-pop curse', role: 'dialog', 'aria-label': 'Your curse', onclick: onClose },
        h('p', { class: 'story' }, wither ? WITHER_STORY : `You bear ${own(fm, data).curses.join(' and ')}: see the Journal for what it takes away.`),
        wither ? h('p', { class: 'detail' }, WITHER_DETAIL) : null);
}

// When the stage holds more than it has room for (six creatures, a tall sheet), the whole stage is scaled to fit rather than letting anything overlap. One look after the scene is in the page, and again
// when the phone turns or the keyboard comes and goes.
export function fitStage(root) {
    const fit = () => {
        const stage = root.querySelector('.cb-stage'), inner = stage?.querySelector('.cb-stagein');
        if (!stage || !inner || !root.isConnected) return;
        fitNames(root);
        inner.style.zoom = ''; inner.style.removeProperty('--z'); inner.removeAttribute('data-tight');
        const lw = inner.querySelector('.cb-lanewrap'); if (lw) lw.style.zoom = '';
        const cs = getComputedStyle(stage), room = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        let need = inner.scrollHeight;
        // a crowded stage on a short phone (note 102): below 0.6 the words would be too small to read, so the played lines give way (the chits stay in their lanes, the armor stays); data-tight says so
        if (need > room / 0.6 && room > 80 && typeof matchMedia === 'function' && matchMedia('(max-height: 700px)').matches && inner.querySelector('.cb-pl')) { inner.setAttribute('data-tight', ''); need = inner.scrollHeight; }
        if (need > room + 1 && room > 80) {
            // Note 111: the words of the lanes, the played lines and the armor keep their own size on the screen (12px stays 12px): the stage is scaled by what is left after them, and they are scaled back by the same factor
            // (on a short phone they give up an eighth: 12px words are 10.5px there)
            const E = typeof matchMedia === 'function' && matchMedia('(max-height: 700px)').matches ? 0.88 : 1;
            const F = lw ? lw.getBoundingClientRect().height : 0;
            const z = Math.max(0.45, F && need > F ? Math.min(1, (room - F * E) / (need - F)) : room / need);
            inner.style.zoom = String(z); inner.style.setProperty('--z', String(z));
            if (lw && z < E) lw.style.zoom = String(Math.min(E, Math.max(0.5, F && (room - (need - F) * z) / F)) / z);          // (and when the stage is at its floor the lanes give what is still missing)
        }
        // whatever is still past the stage's bottom (a rounding, a row that did not scale as measured) takes the rest of the scale off, so nothing is ever cut off
        for (let k = 0; k < 3 && inner.style.zoom; k++) {
            const over = inner.getBoundingClientRect().bottom - (stage.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom)), z0 = parseFloat(inner.style.zoom);
            if (over <= 0.5 || z0 <= 0.3) break;
            const z1 = Math.max(0.3, z0 * (1 - over / Math.max(1, inner.getBoundingClientRect().height)));
            inner.style.zoom = String(z1); inner.style.setProperty('--z', String(z1)); if (lw && lw.style.zoom) lw.style.zoom = String(parseFloat(lw.style.zoom) * z0 / z1);
        }
        drawThreads(root);
    };
    requestAnimationFrame(fit);
    if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => fit()); ro.observe(root); const gone = new MutationObserver(() => { if (!root.isConnected) { ro.disconnect(); gone.disconnect(); } }); gone.observe(document.body, { childList: true, subtree: true }); }
}
