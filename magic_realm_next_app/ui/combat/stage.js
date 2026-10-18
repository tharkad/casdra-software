// combat/stage.js: the scene's stage: the foes across the top as the real counters, the three lanes of the melee sheet, and you at the bottom with your weapon, your armor and one pip per chit.
// Pure DOM builders: everything they show comes in as arguments, and every tap goes out through a callback. No engine calls except denSide (the counter must say what the rules say).
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { monsterCounter, itemFace } from '../counter.js';
import { denSide, weaponOf, activeArmor } from '../../engine/combat.js';
import { nameOf, defOf } from '../../engine/items.js';
import { DIRS, MNV, otherSide, picOf, chitText, WORD } from './model.js';

// foe counter size by how many stand on the stage: the full size (92, or 64 on a short phone) up to three, then smaller so six still fit in two rows
// a picture straight from the art manifest (its paths already start with art/)
const pic = (src, alt = '') => h('img', { src, alt, draggable: 'false' });
export const foeSize = n => {
    const base = typeof matchMedia === 'function' && matchMedia('(max-height: 700px)').matches ? 64 : 92;
    if (n <= 3) return base;
    // four stand in one row at the width of the screen; more take two rows, smaller
    const w = Math.min(typeof innerWidth === 'number' ? innerWidth : 393, 520) - 32;
    if (n === 4) return Math.min(base, Math.floor((w - 3 * 10) / 4));
    return Math.round(base * (n <= 6 ? 0.72 : 0.6));
};

// One foe: its counter (tap to turn it over), and an optional tag (TARGET, a box, WOUNDED YOU). `view` says which side shows; `tag` is { text, kind, onclick? }.
export function foeEl({ st, data, d, flipped = false, tag = null, dead = false, onFlip, size = 92, justFlipped = false, selected = false }) {
    const other = otherSide(data, d);
    const showRev = !!flipped && other && other !== (d.side ?? 'light');
    const view = showRev ? { ...d, side: other } : d;
    const s = denSide(st, data, view);
    const side = showRev ? other : (d.side ?? 'light');
    const flies = d.kind === 'mon' && !!data.monsters[d.id]?.flies;
    const svg = monsterCounter({ s, side, picture: picOf(st, data, d), flies, size: 92 });
    const tagEl = tag ? h(tag.onclick ? 'button' : 'span', { class: `tag ${tag.kind ?? ''}`, ...(tag.onclick ? { type: 'button', 'data-tag': d.uid, 'aria-label': tag.label ?? tag.text, onclick: e => { e.stopPropagation(); tag.onclick(); } } : {}) }, tag.text) : null;
    return h('div', { class: `cb-foe${dead ? ' dead' : ''}${justFlipped ? ' flip' : ''}${d.pacified ? ' pacified' : ''}${d.pickedUp ? ' held' : ''}${selected ? ' sel' : ''}`, style: `--foe:${size}px`, 'data-foe': d.uid },
        h('button', { type: 'button', class: 'cb-flip', 'data-flip': d.uid, 'aria-pressed': showRev ? 'true' : 'false', 'aria-label': `${s.name}${dead ? ', slain' : ''}: tap to turn the counter over`, onclick: () => onFlip?.(d, !!other), style: 'padding:0;display:block' },
            h('span', { class: 'ds-cs-wrap' }, svg), other && !dead ? h('span', { class: 'turn', 'aria-hidden': 'true' }, icon('retry')) : null),
        tagEl);
}

// the lanes: the three attack circles (Thrust, Swing, Smash) on top, the three maneuver squares (Charge, Dodge, Duck) under them. Same index = same red box (rules 4.1).
// attack = { dir, text } puts his Fight chit in that circle; guard = { dir, text } his Move chit in that square; boxes = { [lane]: [pictureSrc...] } the creatures standing in each red box.
export function lanesEl({ attack = null, guard = null, boxes = {}, sec = null } = {}) {
    const top = [0, 1, 2].map(i => h('div', { class: `cb-lane${attack && attack.dir === i ? ' mine' : ''}`, 'data-lane': `a${i}` },
        attack && attack.dir === i && attack.text ? h('span', { class: 'cb-pill' }, attack.text) : DIRS[i],
        ...(boxes[i] ?? []).slice(0, 3).map(src => h('span', { class: 'ds-counter sm', 'aria-hidden': 'true' }, src ? pic(src) : null)), (boxes[i] ?? []).length > 3 ? h('span', { class: 'cb-more' }, `+${boxes[i].length - 3}`) : null));
    const bot = [0, 1, 2].map(i => h('div', { class: `cb-lane${guard && guard.dir === i ? ' guard' : ''}`, 'data-lane': `g${i}` }, guard && guard.dir === i && guard.text ? h('span', { class: 'cb-pill g' }, guard.text) : MNV[i]));
    return h('div', { class: 'cb-lanewrap', 'aria-hidden': 'true', 'data-sec': sec }, h('div', { class: 'cb-lanes top' }, ...top), h('div', { class: 'cb-lanes bot' }, ...bot));
}

// one pip per action chit, in the chits' own order (fight, move, magic), coloured by kind and shaped by state: ready, tired (faded), wounded (dashed red)
export function pipsEl(st, prev = null) {
    const order = { fight: 0, move: 1, magic: 2 };
    const chits = [...st.ch.chits].sort((a, b) => (order[a.type] ?? 3) - (order[b.type] ?? 3));
    const cls = x => (x.state === 'fatigued' ? 'tired' : x.state === 'wounded' ? 'wounded' : x.state === 'committed' ? 'committed' : x.state === 'enchanted' ? 'enchanted' : '');
    return h('div', { class: 'cb-pips', role: 'img', 'aria-label': `${chits.filter(x => x.state === 'active').length} chits ready, ${chits.filter(x => x.state === 'fatigued').length} tired, ${chits.filter(x => x.state === 'wounded').length} wounded` },
        ...chits.map(x => h('i', { class: `ds-chit mini ${x.type}${cls(x) ? ` ${cls(x)}` : ''}${prev && prev[x.id] && prev[x.id] !== x.state ? ' fresh' : ''}`, 'data-pip': x.id })));
}

// you: the weapon on the left, the armor on the right, your face and a pip per chit between. A morphed hero is the creature's counter. Tap a piece of gear to read it (and turn it over).
export function heroEl({ st, data, onGear, hurtArmor = false, ribbon = null, prevChits = null, wasHidden = false }) {
    const ch = st.ch, w = weaponOf(st, data), armor = activeArmor(st, data).map(a => a.item ?? a).filter(x => x && x.uid);
    const wName = w ? nameOf(data, w.item) : null, aName = armor[0] ? nameOf(data, armor[0]) : null;
    const cr = ch.morph?.creature, lt = cr?.light ?? {};
    const face = cr
        ? h('span', { class: 'face morph' }, monsterCounter({ s: { name: cr.name, vuln: cr.vuln, armored: !!cr.armored, attack: lt.attack ?? 'weapon', harm: lt.harm, stars: lt.stars ?? 0, atk: lt.atk, move: lt.move, length: lt.length ?? 0, fame: cr.fame ?? 0, notor: cr.notor ?? 0 }, side: 'light', picture: data.art?.monstersColor?.[cr.name] ?? data.art?.monsters?.[cr.name] ?? null, flies: !!cr.flies, size: 72 }))
        : h('span', { class: `face${ch.hidden ? ' hid' : ''}` }, data.art?.characters?.[ch.id] ? pic(data.art.characters[ch.id].replace(/\.gif$/, '.png'), ch.name) : null);
    const gear = (kind, name, src, more, hurt) => h('div', { class: 'gcol' },
        h('button', { type: 'button', class: `gear${src ? '' : ' none'}${hurt ? ' hurt' : ''}`, 'data-act': 'peek-gear-card', 'aria-label': name ? `${name}: read it` : `No ${kind}`, onclick: () => onGear?.(kind), disabled: !name || null },
            src ? pic(src) : null, more > 1 ? h('span', { class: 'more' }, `+${more - 1}`) : null),
        h('span', { class: 'cap' }, name ?? (ch.morph ? '' : `no ${kind}`)));
    const hurtGear = armor.some(a => a.damaged);
    return h('div', { class: 'cb-hero' },
        ch.morph ? h('div', { class: 'gcol' }) : gear('weapon', wName, wName ? data.art?.weapons?.[wName] : null, w ? 1 : 0, false),
        h('div', { class: 'mid' }, face, h('span', { class: 'name' }, ch.name), ribbon ? h('span', { class: 'ribbon' }, ribbon) : null, pipsEl(st, prevChits)),
        ch.morph ? h('div', { class: 'gcol' }) : gear('armor', aName, aName ? data.art?.armor?.[aName] : null, armor.length, hurtGear));
}

// The things he carries into the fight, as counters he can turn over (alerted or not, whole or damaged): the old Belongings cards, as one small card over the stage.
export function gearPopover({ st, data, flippedGear, onFlip, onClose }) {
    const w = weaponOf(st, data), items = [...(w ? [w.item] : []), ...activeArmor(st, data).map(a => a.item ?? a).filter(x => x && x.uid)];
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
