import { rollRow } from '../dice.js';
import { monsterCounter, itemFace } from '../counter.js';
import { roundSynopsis, narrateRoll } from '../../engine/story.js';
import { isStory, voiceChip } from '../voice.js';
import { ask } from '../ask.js';
import { h } from '../dom.js';
import { encounterOptions, meleeOptions, denSide, weaponOf, activeArmor, weaponSide, shiftOptions, makeChangeOptions } from '../../engine/combat.js';
import { hasTreasure, NO_EFFORT_LIMIT } from '../../engine/modifiers.js';
import { roadsFrom, nameOfClearing, tileName } from '../../engine/world.js';
import { chitLabel } from '../../engine/day.js';
import { nameOf, weightOf, defOf } from '../../engine/items.js';
import { lvl } from '../../engine/core.js';
import { meleeTargets } from './pvpui.js';

// The evening fight: a vertical, one-hand layout. Foes on top, then the choice in front of you, then the chits you may play.
const DIRS = ['Thrust', 'Swing', 'Smash'], MNV = ['Charge', 'Dodge', 'Duck'];
// A number is kept with the word before it (a non-breaking space), so "attack time 6" or "Round 1" never breaks with the number alone on a line.
const nb = s => String(s).replace(/ (?=\d)/g, '\u00A0');

// `shared`: a fight of several characters in one clearing (screens/sharedfight.js passes { header, frame, fight }): the same step screens, but only YOUR sheet is shown and the page is laid out
// by the shared frame. Solo and race games never pass it, and for them nothing below differs.
export function combatSheet({ st, data, act, ui, render, peek, shared = null }) {
    const p = st.pending, c = st.combat;
    const onMine = d => !!(d.assigned || (d.partOf && c.dens.find(o => o.uid === d.partOf)?.assigned));          // (a shared fight: on my sheet, or a part of a creature that is)
    ui.melee ??= { target: (shared?.fight?.pvp && c.charge?.on ? `char:${c.charge.on}` : null) ?? c.dens.find(d => !d.dead && d.kind !== 'part' && d.kind !== 'horse' && (!shared || d.assigned))?.uid ?? null, fightChit: null, attackDir: 0, moveChit: null, moveDir: 0, shieldDir: 0, boxes: {} };
    const m = ui.melee;
    // what holds a chit back at the Encounter step: a creature ("the Ogre, which moves 4") or another player's charge ("Ann\u2019s charge, which moves 3")
    const gateWords = g => {
        const by = /^(.+), charging you$/.exec(g.name);
        if (!by) return `the ${g.name}, which moves ${g.speed}`;
        const who = shared?.fight?.members.find(x => x.character === by[1]);
        return `${who ? who.player : by[1]}\u2019s charge, which moves ${g.speed}`;
    };
    const send = a => { ui.melee = null; ui.quiet = null; act({ type: 'combat', ...a }); };
    const foes = c.dens.filter(d => !d.dead && d.kind !== 'horse' && (!shared || onMine(d)));
    // hirelings and monsters his spells have won over fight beside him
    const allies = (c.hires ?? []).filter(x => !x.dead).map(x => `${x.kind === 'mon' ? data.monsters[x.id]?.name : data.natives[x.id]?.name}${x.kind === 'mon' ? ' (controlled)' : ''}`);
    const cs = { active: 0, fatigued: 0, wounded: 0, enchanted: 0, committed: 0 }; st.ch.chits.forEach(x => { cs[x.state] = (cs[x.state] ?? 0) + 1; });
    const gear = st.ch.items.filter(i => i.kind === 'armor' && i.active).map(i => `${nameOf(data, i)}${i.damaged ? ' (damaged)' : i.destroyed ? ' (destroyed)' : ''}`);
    // One row: the place (its number kept with its name, so it never wraps alone) and the round as a chip; the two peeks sit at the right,
    // and only drop to a line of their own on a narrow phone.
    const header = shared?.header ?? h('div', { class: 'cb-head' },
        h('div', { class: 'cb-title' },
            h('b', { class: 'cb-place' }, nameOfClearing(c.at).replace(/ (\d+)$/, '\u00A0$1')),
            st.pending?.spellOnly ? null : h('em', { class: 'cb-round' }, `Round\u00A0${c.round}`)),
        h('span', { class: 'cb-peek' },
            peek ? h('button', { class: 'peekbtn', 'data-act': 'peek-gear', onclick: peek.gear }, 'Belongings') : null,
            peek ? h('button', { class: 'peekbtn', 'data-act': 'peek-map', onclick: peek.map }, 'Map') : null));
    const state = h('div', { class: 'cb-state' }, h('span', {}, `Chits: ${cs.active} ready \u00B7 ${cs.fatigued} tired \u00B7 ${cs.wounded} wounded${cs.enchanted ? ` \u00B7 ${cs.enchanted} enchanted` : ''}${cs.committed ? ` \u00B7 ${cs.committed} tied to a spell` : ''}`), h('span', {}, gear.join(', ') || 'no armor'));
    // A tap on a creature turns its counter over: the other side, with its own numbers, and what changed.
    ui.flipped ??= {};
    const SIDE_NAME = { light: 'light side', dark: 'dark side', red: 'red side' };
    const otherSide = d => {
        if (d.kind === 'mon') { const m = data.monsters[d.id]; const order = ['light', ...(m.dark ? ['dark'] : []), ...(m.red ? ['red'] : [])]; return order[(order.indexOf(d.side ?? 'light') + 1) % order.length]; }
        if (d.kind === 'nat' || d.kind === 'part') return d.side === 'dark' ? 'light' : 'dark';
        return null;
    };
    const WORD = { N: 'Negligible', L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };
    const isImp = d => d.kind === 'mon' && data.monsters[d.id]?.family === 'Imp';
    const stat = (s, d) => ({ harm: s.attack === 'none' ? 'no attack' : s.attack === 'spell' ? (d && isImp(d) ? 'a Curse' : 'Power of the Pit') : `${s.harm}${'*'.repeat(s.stars || 0)}`, speed: s.attack === 'none' ? '\u2013' : s.atk, moves: s.move ?? '\u2013', vuln: s.vuln ?? '\u2013' });
    const foeEls = foes.map(d => {
        const now = denSide(st, data, d), other = otherSide(d);
        const showRev = !!ui.flipped[d.uid] && other && other !== (d.side ?? 'light');
        const view = showRev ? { ...d, side: other } : d;
        const s = showRev ? denSide(st, data, view) : now;
        const a = stat(now, d), b = stat(s, d);
        const diff = k => (showRev && String(a[k]) !== String(b[k]) ? 'chg' : '');
        const shownSide = showRev ? other : (d.side ?? 'light');
        const ownerDen = d.kind === 'part' ? st.combat.dens.find(o => o.uid === d.partOf) : null;
        const partDef = ownerDen ? data.monsters[ownerDen.id]?.parts?.find(x => x.id === d.id) : null;
        const mname = d.kind === 'mon' ? data.monsters[d.id]?.name : ownerDen ? `${data.monsters[ownerDen.id]?.name} ${partDef?.name ?? ''}`.trim() : null;
        const pic = d.kind === 'mon' || d.kind === 'part' ? (data.art?.monstersColor?.[mname] ?? data.art?.monsters?.[mname]) : d.kind === 'nat' ? data.art?.natives?.[d.id] : null;
        const sideTag = SIDE_NAME[shownSide];
        const counter = d.kind === 'mon' || d.kind === 'part'
            ? monsterCounter({ s, side: shownSide, picture: pic, flies: d.kind === 'mon' && !!data.monsters[d.id]?.flies, size: 92 })
            : (pic ? h('img', { class: 'foepic', src: pic, alt: '' }) : null);
        return h('button', { class: `foe${d.assigned ? ' on' : ''}${d.pickedUp ? ' held' : ''}${m.target === d.uid ? ' target' : ''}${showRev ? ' rev' : ''}`, 'data-foe': d.uid, 'aria-pressed': showRev ? 'true' : 'false',
            'aria-label': `${s.name}: tap to turn the counter over`, onclick: () => { ui.flipped[d.uid] = !ui.flipped[d.uid]; render(); } },
            counter,
            h('div', { class: 'foe-text' },
                h('b', {}, s.name), h('em', { class: 'sidetag' }, other ? (showRev ? `reverse: ${sideTag}` : sideTag) : ''),
                d.pacified ? h('span', { class: 'foe-kind' }, 'Pacified by your spell: it will not fight unless you name it.') : null,
                // what the numbers on its counter mean, in the words the rules use
                h('span', { class: 'foe-kind' }, [s.size ? WORD[s.size] ?? s.size : '', b.vuln && b.vuln !== '\u2013' ? `killed by ${WORD[b.vuln] ?? b.vuln} harm` : ''].filter(Boolean).join(' \u00B7 ')),
                h('div', { class: 'foe-stats' },
                    ...[['Hits', /^[NLMHT]\*{0,3}$/.test(String(b.harm)) ? `${WORD[String(b.harm)[0]]}${String(b.harm).slice(1)}` : b.harm, 'harm'], ['Speed', b.speed, 'speed'], ['Moves', b.moves, 'moves']]
                        .map(([k, v, key]) => h('div', { class: 'fs' }, h('small', {}, k), h('i', { class: diff(key) }, String(v))))),
                ui.flipped[d.uid] && !showRev ? h('small', { class: 'was' }, 'This counter has no other side.') : null,
                showRev ? h('small', { class: 'was' }, `now: harm ${a.harm} \u00B7 speed ${a.speed} \u00B7 moves ${a.moves}${a.vuln !== b.vuln ? ` \u00B7 vuln ${a.vuln}` : ''}`) : null,
                d.pickedUp ? h('em', {}, d.engagedBy ? 'has seized your hireling' : 'has seized you') : null,
                d.engagedBy ? h('em', { class: 'ally' }, 'is fighting your hireling') : null));
    });
    // Your weapon and armor, as counters: tap one to turn it over and read its other side (alerted / not alerted, whole / damaged).
    ui.flippedGear ??= {};
    const gearCard = it => {
        const d = defOf(data, it), name = nameOf(data, it), pic = data.art?.weapons?.[name] ?? data.art?.armor?.[name] ?? null;
        const flip = !!ui.flippedGear[it.uid];
        let counter, lines;
        if (it.kind === 'weapon') {
            const showA = flip ? !it.alerted : !!it.alerted, s = showA ? d.alerted : d.unalerted;
            counter = itemFace({ name, picture: pic, face: showA ? 'Alerted' : 'Not alerted', big: `${s.harm}${s.attackTime ?? ''}`, stars: s.stars ?? 0, corner: `(${d.length})`, current: !flip, size: 92 });
            lines = [`${d.missile ? 'Missile weapon' : 'Striking weapon'} \u00B7 length ${d.length}`,
                `${showA ? 'Alerted' : 'Not alerted'}: harm\u00A0${s.harm}${'*'.repeat(s.stars ?? 0)}, ${s.attackTime == null ? 'attack time from your Fight chit' : `attack time\u00A0${s.attackTime}`}`];
        } else {
            const showD = flip ? !it.damaged : !!it.damaged;
            counter = itemFace({ name, picture: pic, face: showD ? 'Damaged' : 'Whole', big: d.toughness ?? '', circle: showD ? d.priceDamaged ?? null : d.priceIntact ?? null, circleTone: showD ? 'red' : 'blue', current: !flip, size: 92 });
            const dirs = (d.protects ?? []).map(x => (typeof x === 'number' ? DIRS[x] : x)).join(', ');
            lines = [`${(d.type ?? 'armor')[0].toUpperCase()}${(d.type ?? 'armor').slice(1)} \u00B7 toughness ${WORD[d.toughness] ?? d.toughness}`,
                d.chooseOneDirection ? 'guards the one direction you choose each round' : `guards against ${dirs || 'nothing listed'}`,
                showD ? 'damaged: one more blow of its toughness destroys it' : 'whole: a blow as strong as its toughness damages it'];
        }
        return h('button', { class: `foe gear${flip ? ' rev' : ''}`, 'data-gear': it.uid, 'aria-pressed': flip ? 'true' : 'false', 'aria-label': `${name}: tap to turn it over`,
            onclick: () => { ui.flippedGear[it.uid] = !ui.flippedGear[it.uid]; render(); } },
            counter,
            h('div', { class: 'foe-text' }, h('b', {}, name), h('em', { class: 'sidetag' }, flip ? 'other side' : (it.kind === 'weapon' ? (it.alerted ? 'alerted now' : 'not alerted now') : (it.damaged ? 'damaged now' : 'whole now'))),
                ...lines.map(t => h('span', {}, t)),
                it.destroyed ? h('em', {}, 'destroyed') : null));
    };
    const w0 = weaponOf(st, data);
    const gearItems = [...(w0 ? [w0.item] : []), ...activeArmor(st, data).map(a => a.item ?? a).filter(x => x && x.uid)];
    const gearBlock = gearItems.length ? h('div', { class: 'cb-gear' }, h('small', { class: 'cb-gear-h' }, 'Your weapon and armor \u00B7 tap one to turn it over'), ...gearItems.map(gearCard)) : null;
    const isMeet = r => /^Evening meeting with the /.test(r.what);
    const dice = (st.rolls ?? []).filter(r => r.n > (c.roundRollFrom ?? c.rollFrom ?? 0) && !isMeet(r)).slice(-8);
    // The evening's Meeting rolls, said once and kept at the top of every step: one block per native group with its verdict, what that means for the fight,
    // and the dice behind it for whoever wants them.
    const meets = new Map();
    for (const r of (st.rolls ?? []).filter(x => x.n > (c.rollFrom ?? 0) && isMeet(x))) {
        const g = r.what.replace(/^Evening meeting with the ([^:]+).*$/, '$1');
        (meets.get(g) ?? meets.set(g, []).get(g)).push(r);
    }
    const meetFate = g => {
        const line = (c.intro ?? []).find(t => t.startsWith(`The ${g} `)) ?? '';
        if (c.battling?.[g]) return ['fight', 'Will fight you'];
        if ((c.pays ?? []).some(x => x.group === g)) return ['asks', 'Wants you to pay'];
        if (/insulted|challenged/.test(line)) return ['calm', 'Paid off'];
        return ['calm', 'Lets you be'];
    };
    const resultsBlock = meets.size ? h('div', { class: `cb-results${c.round > 1 ? ' small' : ''}`, 'data-block': 'meeting' },
        c.round > 1 ? null : h('div', { class: 'res-head' }, h('b', { class: 'res-h' }, 'The evening meeting'), voiceChip()),
        ...[...meets].map(([g, rolls]) => {
            const [fate, pill] = meetFate(g), last = rolls[rolls.length - 1], tale = isStory() ? narrateRoll(last) : null;
            const verdict = tale ? tale.line : last.result ? `${last.result.charAt(0).toUpperCase()}${last.result.slice(1)}${/[.!?]$/.test(last.result) ? '' : '.'}` : '';
            return h('div', { class: `res-row ${fate}` },
                h('div', { class: 'res-top' }, h('b', {}, g), h('span', { class: 'res-pill' }, pill)),
                c.round > 1 ? null : h('p', { class: `res-verdict${tale ? ' tale' : ''}` }, verdict),
                c.round > 1 || isStory() ? null : h('div', { class: 'res-dice' }, ...rolls.map(r => rollRow(r, { compact: true }))));
        })) : null;
    const diceBlock = dice.length ? h('div', { class: 'cb-dice' }, ...dice.map(r => rollRow(r, { compact: true }))) : null;
    // The round, told first in a few sentences (Story) or line by line with every number (Detail): the same switch as every box that describes a roll.
    const last = c.events?.length ? h('div', { class: 'cb-last' }, h('div', { class: 'res-head' }, h('b', {}, 'Last round'), voiceChip()),
        isStory() ? h('p', { class: 'cb-synopsis' }, roundSynopsis(c.events) || 'The round passed.')
            : h('div', { class: 'cb-steps' }, ...c.events.map(e => h('p', { class: e.startsWith('  ') ? 'sub' : /^(Round \d+:|Order of blows|Boxes as|Repositioning)/.test(e) ? 'hd' : '' }, nb(e.trim()))))) : null;
    // 8.3.7d, 4.3.2: with no chit played he may switch ONE belonging on or off, or leave one behind. In a fight that is the Encounter action (the Melee step follows);
    // on a quiet evening it is free and the step stays open.
    const gearSection = quiet => {
        const items = st.ch.items.filter(i => !i.destroyed);
        if (!items.length) return null;
        const rows = items.map(it => {
            const nm = nameOf(data, it);
            return h('div', { class: 'itemrow gearrow', 'data-gear-row': it.uid },
                h('span', { class: 'rl' }, h('b', {}, nm), h('small', {}, `${it.active ? 'in use' : 'not in use'}${it.kind === 'weapon' && it.active ? (it.alerted ? ', alerted' : ', not alerted') : ''}`)),
                st.ch.morph ? null : h('button', { class: `switch${it.active ? ' on' : ''}`, role: 'switch', 'aria-checked': it.active ? 'true' : 'false', 'data-act': 'gear-switch', 'data-item': it.uid,
                    'aria-label': `${nm}: ${it.active ? 'switch off' : 'switch on'}`, onclick: () => send({ kind: 'encounter', act: 'gear', item: it.uid }) }, it.active ? 'Switch off' : 'Switch on'),
                h('button', { class: 'btn quiet-no leave', 'data-act': 'gear-leave', 'data-item': it.uid, 'aria-label': `Leave the ${nm} behind`,
                    onclick: () => { if (ui.leaveAsk === it.uid) { ui.leaveAsk = null; send({ kind: 'encounter', act: 'gear', item: it.uid, drop: true }); } else { ui.leaveAsk = it.uid; render(); } } },
                    ui.leaveAsk === it.uid ? 'Really leave it?' : 'Leave behind'));
        });
        return h('details', { class: 'ask gearsec', 'data-block': 'gear', open: ui.gearOpen || null, ontoggle: e => { ui.gearOpen = e.target.open; } }, h('summary', {}, h('b', {}, 'Belongings: switch one item or leave one behind')),
            h('p', { class: 'hint' }, quiet ? 'Nothing is fighting you, so this costs nothing and you may do it as often as you like.' : 'This is your Encounter action: no chit is played, and the melee follows. You may switch one item on or off, or leave one behind where you stand.'),
            ...rows);
    };
    const body = [];
    const chitBtn = (ch, sel, on, ok = true) => h('button', { class: `chit3 ${ch.type}${sel ? ' sel' : ''}`, 'data-chit': ch.id, disabled: !ok, onclick: on }, h('b', {}, ch.type === 'magic' ? `${ch.numeral ?? ''}${ch.time}` : `${ch.strength}${ch.time}`), h('span', {}, '*'.repeat(ch.effort) || '\u00A0'));
    // A spell that needs a target named (8.4.2): its legal targets and the questions it asks. `store` keeps the choices ({ aim, aimParams }): the melee plan, or the quiet-evening cast.
    const sameRef = (x, y) => x.kind === y.kind && String(x.id) === String(y.id);
    const aimSheet = (a, store) => {
        store.aim ??= {}; store.aimParams ??= {};
        const sel = store.aim[a.spell] ??= a.options.slice(0, a.min).map(x => x.ref);
        const pars = Array.isArray(a.params) ? a.params : [];
        return h('div', { class: 'cb-sec', 'data-aim': a.spell }, h('b', {}, `Aim ${a.name}`),
            a.options.length ? h('p', { class: 'hint' }, a.max === 1 ? 'Choose what it is aimed at.' : a.max === 0 ? '' : `Choose ${a.min === a.max ? a.min : `${a.min} to ${a.max}`}${a.min === 0 ? ' (or none: it takes every one that qualifies)' : ''}.`) : null,
            a.options.length ? h('div', { class: 'seg3 wrap' }, ...a.options.map(opt => {
                const on = sel.some(r => sameRef(r, opt.ref));
                return h('button', { class: `segb${on ? ' on' : ''}`, 'data-aim-opt': `${opt.ref.kind}:${opt.ref.id}`, onclick: () => {
                    if (a.max === 1) store.aim[a.spell] = [opt.ref];
                    else if (on) store.aim[a.spell] = sel.filter(r => !sameRef(r, opt.ref));
                    else if (sel.length < a.max) store.aim[a.spell] = [...sel, opt.ref];
                    render();
                } }, opt.label);
            })) : null,
            // the questions a spell asks beforehand (a clearing, a tile, a box...): the first sensible answer is taken when none is chosen
            ...pars.map(q => { const cur = (store.aimParams[a.spell] ??= {})[q.key];
                return h('div', { class: 'aimq' }, h('p', { class: 'hint' }, q.label),
                    h('div', { class: 'seg3 wrap' }, ...(q.options ?? []).map(op => h('button', { class: `segb${JSON.stringify(cur) === JSON.stringify(op.value) ? ' on' : ''}`, 'data-param': `${q.key}:${typeof op.value === 'object' ? JSON.stringify(op.value) : op.value}`, onclick: () => { store.aimParams[a.spell][q.key] = op.value; render(); } }, op.label)))); }));
    };
    const aimOf = (a, store) => ({ targets: store.aim?.[a.spell] ?? a.options.slice(0, a.min).map(x => x.ref), params: store.aimParams?.[a.spell] ?? {} });

    if (p.type === 'combat-pay') {
        body.push(h('div', { class: 'cb-q' }, h('p', {}, `The ${p.group} ${p.why === 'Insult' ? 'insult you' : 'challenge you'}. Pay ${p.amount} ${p.cost === 'fame' ? 'Fame' : 'Notoriety'} to avoid a fight, or stand and fight.`),
            h('div', { class: 'row2' },
                h('button', { class: 'btn', onclick: () => send({ kind: 'pay', pay: true }) }, `Pay ${p.amount}`),
                h('button', { class: 'btn primary', onclick: () => send({ kind: 'pay', pay: false }) }, 'Fight'))));
    } else if (p.type === 'combat-drinks') {
        body.push(h('div', { class: 'cb-q' }, h('p', {}, `The ${p.group} are in your clearing and are not friendly to you. Buy them drinks for ${p.cost} gold to make them one level friendlier before the Meeting roll?`),
            h('div', { class: 'row2' },
                h('button', { class: 'btn primary', 'data-act': 'buy-drinks', disabled: st.ch.gold < p.cost, onclick: () => send({ kind: 'drinks', buy: true }) }, `Buy drinks (${p.cost}g)`),
                h('button', { class: 'btn', 'data-act': 'no-drinks', onclick: () => send({ kind: 'drinks', buy: false }) }, 'No thanks'))));
    } else if (p.type === 'combat-choice') {
        body.push(h('div', { class: 'cb-q' }, h('p', {}, `The ${p.groups.join(' and the ')} are here and not looking for a fight. You may attack ${p.groups.length > 1 ? 'one of them, which brings its whole group in' : 'them'}, or let them be.`),
            h('div', { class: 'row2' },
                h('button', { class: 'btn', 'data-act': 'let-be', onclick: () => send({ kind: 'choice', fight: false }) }, 'Let them be'),
                h('button', { class: 'btn primary', 'data-act': 'attack-natives', onclick: () => send({ kind: 'choice', fight: true }) }, 'Pick a fight'))));
    } else if (p.type === 'combat-encounter') {
        const o = encounterOptions(st, data);
        // creatures that cast rather than strike: how the Power of the Pit works, and what each result does. The dice decide; the odds are not printed (players do not talk in percentages)
        const casters = foes.filter(d => denSide(st, data, d).attack === 'spell' && !isImp(d));
        const imps = foes.filter(d => denSide(st, data, d).attack === 'spell' && isImp(d));
        const DICE_NOTE = 'Roll two dice and the higher one counts. A low number is rare; a high one comes up often.';
        if (imps.length) {
            const rows = data.tables?.curses?.rows ?? {};
            body.push(h('details', { class: 'ask pitnote', open: c.round === 1 || null },
                h('summary', {}, h('b', {}, `${[...new Set(imps.map(d => denSide(st, data, d).name))].join(', ')}: casts a Curse`)),
                h('p', {}, `It does not strike a blow. At its attack time it casts a Type ${denSide(st, data, imps[0]).spell ?? 'V'} spell and a curse falls on whoever it is aimed at. It is aimed like any attack: your maneuver can turn it aside, but armor does not help against it. ${DICE_NOTE}`),
                ...Object.entries(rows).map(([k, r]) => h('p', { class: 'pitrow' }, h('b', {}, `${k} ${r.name}: `), r.effect)),
                h('p', {}, 'A Pentangle or Protection from Magic keeps it off you. Chapel clearings lift curses at Midnight.')));
        }
        if (casters.length) {
            const rows = data.tables?.powerOfThePit?.rows ?? {};
            body.push(h('details', { class: 'ask pitnote', open: c.round === 1 || null },
                h('summary', {}, h('b', {}, `${[...new Set(casters.map(d => denSide(st, data, d).name))].join(', ')}: casts the Power of the Pit`)),
                h('p', {}, `It does not strike a blow. At its attack time it casts a Type ${denSide(st, data, casters[0]).spell ?? 'V'} spell, the Power of the Pit, and the dice decide what happens to whoever it is aimed at. It is aimed like any attack: your maneuver can turn it aside, but armor does not help against it. ${DICE_NOTE}`),
                ...Object.entries(rows).map(([k, r]) => h('p', { class: 'pitrow' }, h('b', {}, `${k} ${r.name}: `), r.effect)),
                h('p', {}, 'A hidden character is not touched by the Fiery Chasm. Staying hidden keeps a Demon from being set on you at all.')));
        }
        if (p.spellOnly) {
            // A quiet evening with something worth casting: said the way a person would say it, with what the spell will do, in the buttons themselves.
            const here = (c.intro ?? []).filter(t => !/plain sight|will come for you|hidden, so creatures/i.test(t));
            body.push(h('div', { class: 'quiet' },
                h('h3', { class: 'quiet-h' }, 'A quiet evening'),
                h('p', {}, [...here, 'Nothing here is looking for a fight.'].join(' '))));
            const mendCount = chitId => st.ch.chits.filter(x => x.id !== chitId && (x.state === 'fatigued' || x.state === 'wounded')).length;
            const armorCount = st.ch.items.filter(i => i.kind === 'armor' && i.damaged && !i.destroyed).length;
            const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
            const what = x => {
                if (x.spell === 'make-whole') {
                    const bits = [mendCount(x.chit) ? `${plural(mendCount(x.chit), 'tired or wounded chit')}` : '', armorCount ? `${plural(armorCount, 'damaged piece')} of armor` : ''].filter(Boolean);
                    return bits.length ? `Puts right ${bits.join(' and ')}.` : 'There is nothing of yours to mend.';
                }
                return data.spells?.[x.spell]?.text ?? '';
            };
            const needsAim = x => !!x.aim && (x.aim.options.length > x.aim.min || (Array.isArray(x.aim.params) && x.aim.params.length));
            const picked = ui.quiet ? o.casts.find(x => x.spell === ui.quiet.spell && x.chit === ui.quiet.chit && x.item === ui.quiet.item) : null;
            if (ui.quiet && !picked) ui.quiet = null;
            const castMsg = x => ({ kind: 'encounter', act: 'cast', spell: x.spell, chit: x.chit, item: x.item });
            if (picked) {
                // the quiet evening has no Melee step in between, so the spell is aimed here, before it is cast
                body.push(h('p', { class: 'quiet-q' }, `Cast ${picked.name}`), aimSheet(picked.aim, ui.quiet),
                    h('button', { class: 'btn primary', 'data-act': 'cast-go', 'data-spell': picked.spell, onclick: () => send({ ...castMsg(picked), spellAim: { [picked.spell]: aimOf(picked.aim, ui.quiet) } }) }, `Cast ${picked.name}`),
                    h('button', { class: 'btn quiet-no', 'data-act': 'cast-back', onclick: () => { ui.quiet = null; render(); } }, 'Choose another'));
            } else if (o.casts.length) {
                body.push(h('p', { class: 'quiet-q' }, 'Would you like to cast a spell?'));
                for (const x of o.casts) {
                    const sp = data.spells?.[x.spell], chit = st.ch.chits.find(c => c.id === x.chit);
                    body.push(h('button', { class: `btn castcard${x.useful || x.quiet ? ' primary' : ''}`, 'data-act': 'cast', 'data-spell': x.spell,
                        onclick: () => { if (needsAim(x)) { ui.quiet = { spell: x.spell, chit: x.chit, item: x.item }; render(); } else send(castMsg(x)); } },
                        h('span', { class: 'col' }, h('b', {}, `Cast ${x.name}`), h('span', { class: 'what' }, what(x)),
                            h('small', {}, x.item ? `From your ${x.from}, at time 0; no Magic chit is used${sp?.color ? ` \u00B7 ${sp.color} magic` : ''}` : `Uses your Magic ${chit?.numeral ?? ''}${x.time}${'*'.repeat(x.effort)}, which is tired afterwards${sp?.color ? ` \u00B7 ${sp.color} magic` : ''}`))));
                }
            }
            { const g = gearSection(true); if (g) body.push(g); }
            if (!picked) body.push(h('button', { class: 'btn quiet-no', 'data-act': 'pass', onclick: () => send({ kind: 'encounter', act: 'pass' }) }, c.quietDone?.length ? 'That is enough' : 'Not tonight'));
        } else {
        // (a fight between characters with no creature in it: "the creatures here will come for you" would be untrue, so that line is left out)
        const intro = (c.intro ?? []).filter(t => !(shared?.fight?.pvp && !st.battle?.dens?.some(d => !d.dead && (d.kind === 'mon' || d.kind === 'nat')) && /creatures here will come for you/.test(t)));
        if (c.round === 1 && intro.length) body.push(h('div', { class: 'ask', role: 'note' }, h('b', {}, 'How this came about'), ...intro.map(t => h('p', {}, t))));
        body.push(ask(p.spellOnly ? 'Evening: nothing is fighting you. Do you want to cast a spell?' : `Round\u00A0${c.round}, Encounter step: you may take one action before the melee.`,
            p.spellOnly ? 'Spells are cast in the evening (rule 8.1.3a: a quiet clearing still gets its rounds), so the game stops here to let you cast one now. You may also do nothing.'
                : `Before plays are chosen you may ready your weapon, run from the fight, cast a spell, switch a belonging, or simply go on. ${o.why?.gate ? `A chit you play here has to be faster than every creature facing you: the slowest is ${gateWords(o.why.gate)}, so a chit must be time\u00A0${o.why.gate.speed - 1} or lower.` : 'Nothing is set on you, so no creature holds your chits back: any chit that is strong enough may be played here.'}`));
        if (o.canStay && !p.spellOnly) {
            body.push(h('p', { class: 'hint' }, 'You are hidden. Creatures cannot be set on a hidden character, so nothing here can attack you. You may stay hidden and let the evening pass, or strike from hiding: you get the first blow, but you are revealed.'));
            body.push(h('button', { class: 'btn primary', 'data-act': 'stay-hidden', onclick: () => send({ kind: 'encounter', act: 'stay' }) }, 'Stay hidden: let the evening pass'));
        }
        body.push(h('button', { class: `btn${(p.spellOnly && o.casts.some(x => x.useful)) || (o.canStay && !p.spellOnly) ? '' : ' primary'}`, 'data-act': 'pass', onclick: () => send({ kind: 'encounter', act: 'pass' }) }, p.spellOnly ? 'Do nothing' : o.canStay ? 'Strike from hiding' : 'Go on to the fight'));
        for (const hd of o.held ?? []) body.push(h('button', { class: 'btn primary', 'data-act': 'protect', 'data-fx': hd.fx, onclick: () => send({ kind: 'encounter', act: 'protect', fx: hd.fx }) },
            h('span', { class: 'col' }, h('b', {}, `Use ${hd.name}`), h('small', {}, 'Instead of a chit action; it lasts through this round'))));
        if (o.blocked?.length) {
            body.push(h('details', { class: 'ask blocked-spells', open: !o.casts.length || null }, h('summary', {}, h('b', {}, o.casts.length ? 'Spells you cannot cast now' : 'Spells you know')),
                ...o.blocked.map(x => h('p', { class: 'hint' }, h('b', {}, `${x.name}: `), x.why))));
        }
        if (o.casts.length) {
            body.push(h('h3', {}, 'Cast a spell'));
            body.push(h('p', { class: 'hint' }, 'The Magic chit you play is the spell\'s cost; it counts toward the two asterisks of the round and is tired afterwards.'));
            for (const x of o.casts) {
                const sp = data.spells?.[x.spell];
                body.push(h('button', { class: `btn${p.spellOnly && x.useful ? ' primary' : ''}`, 'data-act': 'cast', 'data-spell': x.spell, onclick: () => send({ kind: 'encounter', act: 'cast', spell: x.spell, chit: x.chit, item: x.item }) },
                    h('span', { class: 'col' }, h('b', {}, x.name), h('small', {}, `Type ${sp?.type ?? ''} \u00B7 ${sp?.color ?? 'any'} \u00B7 ${x.item ? `from your ${x.from}, time 0` : `Magic ${st.ch.chits.find(c => c.id === x.chit)?.numeral}${x.time}${'*'.repeat(x.effort)}`}${x.useful ? '' : x.spell === 'make-whole' ? ' \u00B7 nothing to mend' : ' \u00B7 nothing obvious to gain here'}`))));
                if (sp?.text) body.push(h('p', { class: 'hint' }, sp.text));
            }
        }
        if (!p.spellOnly && o.weapon && o.alertChits.length) {
            body.push(h('h3', {}, o.weapon.item.alerted ? 'Put your weapon away (unalert)' : 'Ready your weapon (alert)'));
            if (!o.why?.gate) body.push(h('p', { class: 'hint' }, 'Nothing is set on you, so any Fight chit strong enough for the weapon may be played.'));
            body.push(h('div', { class: 'chitrow' }, ...o.alertChits.map(ch => chitBtn(ch, false, () => send({ kind: 'encounter', act: 'alert', chit: ch.id })))));
        } else if (!p.spellOnly && o.why?.alert) {
            body.push(h('p', { class: 'hint', 'data-why': 'alert' }, h('b', {}, `${o.weapon?.item.alerted ? 'Putting your weapon away' : 'Readying your weapon'} is not possible this round. `), nb(o.why.alert)));
        }
        if (!p.spellOnly && o.canFly) {
            body.push(h('h3', {}, 'Fly away'));
            body.push(h('p', { class: 'hint' }, 'You leave the fight on a Fly chit, strictly faster than every creature facing you, and are carried to a neighbouring tile; you land there at the next Birdsong.'));
            for (const to of o.flyTiles) body.push(h('div', { class: 'runrow' }, h('span', {}, `to ${tileName(to)}`),
                h('div', { class: 'chitrow' }, ...o.flyChits.map(ch => chitBtn(ch, false, () => send({ kind: 'encounter', act: 'fly', chit: ch.id, to }))))));
        }
        if (!p.spellOnly && o.canRun) {
            const roads = o.runTo.map(to => ({ to }));
            body.push(h('h3', {}, 'Run for it'));
            body.push(h('p', { class: 'hint' }, 'You leave the fight and end the day on a road. Pick a Move chit; the road goes to the clearing you choose.'));
            for (const r of roads) {
                body.push(h('div', { class: 'runrow' }, h('span', {}, `toward ${nameOfClearing(r.to)}`),
                    h('div', { class: 'chitrow' }, ...o.runChits.map(ch => chitBtn(ch, false, () => send({ kind: 'encounter', act: 'run', chit: ch.id, to: r.to }))))));
            }
        } else if (!p.spellOnly && o.pickedUp) body.push(h('p', { class: 'hint' }, 'You are seized and cannot run.'));
        else if (!p.spellOnly && o.why?.run) body.push(h('p', { class: 'hint', 'data-why': 'run' }, h('b', {}, 'You cannot run this round. '), nb(o.why.run)));
        if (!p.spellOnly) { const g = gearSection(false); if (g) body.push(g); }
        }
    } else if (p.type === 'combat-melee') {
        const o = meleeOptions(st, data);
        const w = o.weapon;
        let treachery = false;                                              // (a target that wants a confirm first: own hireling, someone dealt with)
        // a charger may name only the one he charged; a target that is no longer legal is dropped
        if (shared?.fight?.pvp && m.target && !o.targets.some(t => t.uid === m.target)) m.target = o.targets.find(t => t.kind === 'character' && st.combat.charge?.on === t.id)?.uid ?? null;
        const wname = w ? nameOf(data, w.item) + (w.item.alerted ? ' (alerted)' : '') : 'bare hands';
        body.push(ask(`Round\u00A0${c.round}, Melee: choose your plays.`,
            (shared ? (shared.fight?.pvp ? 'Your play is sealed, whom it names too, until everyone has chosen; then every play is shown at once. You may name a creature on another sheet, a character or a hireling. '
                : 'Your play is sealed: nobody sees it until everyone has chosen, then every play is shown at once. You may name a creature on another character\u2019s sheet; a blow that kills it is yours. ')
                : 'Pick whom you strike and in which direction, the maneuver that defends you, and where the creatures stand in the three boxes. Plays are chosen together; then the dice shuffle the creatures and the blows land. ') + 'You may play at most ' + (o.effortLimit >= NO_EFFORT_LIMIT ? 'as many asterisks of effort as you like (your Potion of Energy lifts the limit).' : o.effortLimit === 3 ? 'three asterisks of effort (your Girtle of Energy gives you the extra one).' : 'two asterisks of effort.')));
        // the three lanes: where the creatures stand (before the dice move them) and which way you attack, maneuver and guard
        body.push(h('div', { class: 'board' }, ...[0, 1, 2].map(b => h('div', { class: 'lane' },
            h('div', { class: 'lane-h' }, h('b', {}, MNV[b]), h('small', {}, DIRS[b])),
            h('div', { class: 'lane-tags' }, ...[m.attackDir === b && (m.fightChit || o.attackSpell) ? 'your attack' : null, m.moveDir === b && m.moveChit ? 'your maneuver' : null, o.shield && m.shieldDir === b ? 'shield' : null]
                .filter(Boolean).map(t => h('span', { class: 'tag' }, t))),
            ...o.boxable.filter((d, i) => (m.boxes[d.uid] ?? (i % 3)) === b).map(d => h('div', { class: 'lane-foe' }, denSide(st, data, d).name))))));
        // 1 target
        const creatureBtn = d => {
            // a shared fight: a creature on another character's sheet may be named too; say whose it is, so the choice is clear
            const owner = shared && !d.assigned ? (d.sheet ? shared.fight.members.find(x => x.id === d.sheet) : null) : null;
            return h('button', { class: `segb${m.target === d.uid ? ' on' : ''}`, 'data-target': d.uid, onclick: () => { m.target = d.uid; render(); } },
                denSide(st, data, d).name + (shared && !d.assigned ? (owner ? ` (${owner.player}\u2019s)` : ' (loose)') : ''));
        };
        // character against character (the lobby switch): characters and other players' hirelings are targets too, shown as cards with what the rules let you know of them
        const pvpList = shared?.fight?.pvp && o.targets.some(t => t.kind === 'character' || t.kind === 'hire') ? meleeTargets({ st, data, o, m, shared, render, denName: creatureBtn }) : null;
        if (pvpList) treachery = pvpList.blocked;
        body.push(h('div', { class: 'cb-sec', 'data-sec': 'targets' }, h('b', {}, '1. Who do you strike?'),
            ...(pvpList ? pvpList.els : [h('div', { class: 'seg3 wrap' }, h('button', { class: `segb${m.target == null ? ' on' : ''}`, onclick: () => { m.target = null; render(); } }, 'No one'), ...o.targets.map(creatureBtn))])));
        // spells cast this round that need a target named (8.4.2)
        for (const a of o.aims ?? []) body.push(aimSheet(a, m));
        // a creature he has become (Absorb Essence, Transform): its counter plays for him
        if (o.morph) body.push(h('div', { class: 'ask morphnote', role: 'note' }, h('b', {}, `You are ${/^[aeiou]/i.test(o.morph.name) ? 'an' : 'a'} ${o.morph.name}`), h('p', {}, `Your chits are the creature's counter: its attack, its speed and its moves. A blow that reaches its vulnerability (${WORD[o.morph.vuln] ?? o.morph.vuln}) kills it${o.morph.pin ? `; it is red side up against ${o.morph.pin}` : ''}.`)));
        if (o.morphParts?.length) {
            m.parts ??= {};
            body.push(h('div', { class: 'cb-sec', 'data-morph-parts': '1' }, h('b', {}, 'Its other attacks'),
                ...o.morphParts.map(pt => h('div', { class: 'placerow' }, h('span', {}, pt.name),
                    h('div', { class: 'seg3' }, h('button', { class: `segb${!m.parts[pt.id] ? ' on' : ''}`, onclick: () => { delete m.parts[pt.id]; render(); } }, 'not now'),
                        ...pt.sides.map(sd => h('button', { class: `segb${m.parts[pt.id] === sd.side ? ' on' : ''}`, onclick: () => { m.parts[pt.id] = sd.side; render(); } }, sd.side)))))));
        }
        // a spell cast this round takes the place of the weapon: no Fight chit may be played with it (8.4.5a)
        const castNote = c.casts?.length && !o.attackSpell && !o.fightChits.length ? h('p', { class: 'hint' }, 'You cast a spell this round, so you cannot also swing a weapon (rule 8.4.5a).') : null;
        if (castNote) body.push(castNote);
        // 2 attack
        const spl = o.attackSpell ? data.spells?.[o.attackSpell.spell] : null;
        // the time the attack goes off at: a weapon's own printed time for the side showing, else the Fight chit's
        const wside = w ? weaponSide(w) : null;
        const timeNote = spl ? null : !w ? 'Attack time: the Fight chit\u2019s own time.'
            : wside.time != null ? `Attack time\u00A0${wside.time}: printed on the ${w.item.alerted ? 'alerted ' : ''}weapon, so it is ${wside.time} whichever Fight chit you play.`
                : 'Attack time: the time on the Fight chit you play (this side of the weapon prints none).';
        body.push(h('div', { class: 'cb-sec' }, h('b', {}, spl ? `2. Attack with ${spl.name}` : `2. Attack with your ${wname}${wside?.time != null ? ` \u00B7 time\u00A0${wside.time}` : ''}`),
            timeNote ? h('p', { class: 'hint' }, timeNote) : null,
            h('div', { class: 'seg3' }, ...DIRS.map((n, i) => h('button', { class: `segb${m.attackDir === i ? ' on' : ''}`, onclick: () => { m.attackDir = i; render(); } }, n))),
            spl ? h('p', { class: 'hint' }, `The spell strikes from the attack circle: ${o.attackSpell.hits > 1 ? `${o.attackSpell.hits} attacks` : 'one attack'} of harm\u00A0${o.attackSpell.harm}${'*'.repeat(o.attackSpell.stars)}, length ${o.attackSpell.length}, each with its own Missile Table roll. You cannot also use a Fight chit or weapon this round.`)
            : h('div', { class: 'chitrow' }, h('button', { class: `chit3 none${m.fightChit == null ? ' sel' : ''}`, onclick: () => { m.fightChit = null; render(); } }, 'none'),
                ...o.fightChits.map(ch => chitBtn(ch, m.fightChit === ch.id, () => { m.fightChit = ch.id; render(); }, o.fightOk(ch))))));
        // a Fight chit played at no one is legal (8.4.5h.2): it sets the weapon alerted or not for the next round
        if (m.fightChit && !m.target && w && !spl) {
            m.weaponSide ??= w.item.alerted ? 'alerted' : 'unalerted';
            body.push(h('div', { class: 'cb-sec', 'data-sec': 'weapon-side' }, h('b', {}, 'You strike at no one: how does your weapon end the round?'),
                h('p', { class: 'hint' }, 'A Fight chit played with no target changes nothing else. Your weapon ends the round ready (alerted: its alerted side, usually a faster or harder blow next round) or not ready.'),
                h('div', { class: 'seg3' }, ...[['alerted', 'Alerted'], ['unalerted', 'Not alerted']].map(([k, lbl]) => h('button', { class: `segb${m.weaponSide === k ? ' on' : ''}`, 'data-weapon-side': k, onclick: () => { m.weaponSide = k; render(); } }, lbl)))));
        }
        // 3 maneuver
        body.push(h('div', { class: 'cb-sec' }, h('b', {}, '3. Maneuver'),
            h('div', { class: 'seg3' }, ...MNV.map((n, i) => h('button', { class: `segb${m.moveDir === i ? ' on' : ''}`, onclick: () => { m.moveDir = i; render(); } }, n))),
            h('div', { class: 'chitrow' }, h('button', { class: `chit3 none${m.moveChit == null ? ' sel' : ''}`, onclick: () => { m.moveChit = null; render(); } }, 'none'),
                ...o.moveChits.map(ch => chitBtn(ch, m.moveChit === ch.id, () => { m.moveChit = ch.id; render(); }, o.moveOk(ch))))));
        if (o.shield) body.push(h('div', { class: 'cb-sec' }, h('b', {}, `4. Shield guards`),
            h('div', { class: 'seg3' }, ...DIRS.map((n, i) => h('button', { class: `segb${m.shieldDir === i ? ' on' : ''}`, onclick: () => { m.shieldDir = i; render(); } }, n)))));
        // foe placement
        if (o.boxable.length) {
            body.push(h('div', { class: 'cb-sec' }, h('b', {}, `${o.shield ? 5 : 4}. Where do you place the creatures? (dice shuffle them afterwards)`),
                ...o.boxable.map((d, i) => h('div', { class: 'placerow' }, h('span', {}, denSide(st, data, d).name),
                    h('div', { class: 'seg3' }, ...[0, 1, 2].map(b => h('button', { class: `segb${(m.boxes[d.uid] ?? (i % 3)) === b ? ' on' : ''}`, onclick: () => { m.boxes[d.uid] = b; render(); } }, `${MNV[b]}/${DIRS[b]}`)))))));
        }
        const limit = o.effortLimit ?? 2;
        const ast = o.asterisksPlayed + [m.fightChit, m.moveChit].map(id => st.ch.chits.find(x => x.id === id)?.effort ?? 0).reduce((a, b) => a + b, 0);
        body.push(h('div', { class: 'cb-go' },
            h('span', { class: ast > limit ? 'bad' : '' }, limit >= NO_EFFORT_LIMIT ? `Effort\u00A0${ast} (no limit)` : `Effort\u00A0${ast}/${limit}`),
            h('button', { class: 'btn primary big', 'data-act': 'commit', disabled: ast > limit || treachery || null, onclick: () => {
                const boxes = {}; o.boxable.forEach((d, i) => { boxes[d.uid] = m.boxes[d.uid] ?? (i % 3); });
                const spellAim = {}; for (const a of o.aims ?? []) spellAim[a.spell] = aimOf(a, m);
                send({ kind: 'melee', weaponSide: m.fightChit && !m.target && w ? (m.weaponSide ?? 'alerted') : undefined, parts: m.parts && Object.keys(m.parts).length ? { ...m.parts } : undefined, target: m.target, fightChit: m.fightChit, attackDir: m.attackDir, moveChit: m.moveChit, moveDir: m.moveDir, shieldDir: o.shield ? m.shieldDir : null, boxes, spellAim });
            } }, shared ? 'Seal your play' : 'Commit and roll')));
    } else if (p.type === 'combat-shift') {
        // Battle Bracelets / Elusive Cloak (Treasures 12): the plays are revealed and the dice have moved the creatures; he may still move his attack circle or maneuver square.
        const o = shiftOptions(st, data);
        ui.shift ??= {};
        const sh = ui.shift;
        sh.attackDir ??= o.attackDir; sh.moveDir ??= o.moveDir;
        body.push(ask(`Round\u00A0${c.round}: the plays are revealed.`, 'The dice have moved the creatures. Before the blows land, your cards allow a change.'));
        body.push(h('div', { class: 'board', 'data-sec': 'shift-board' }, ...[0, 1, 2].map(b => h('div', { class: 'lane' },
            h('div', { class: 'lane-h' }, h('b', {}, MNV[b]), h('small', {}, DIRS[b])),
            h('div', { class: 'lane-tags' }, ...[o.hasAttack && sh.attackDir === b ? 'your attack' : null, o.hasMove && sh.moveDir === b ? 'your maneuver' : null].filter(Boolean).map(t => h('span', { class: 'tag' }, t))),
            ...o.placed.filter(d => d.box === b).map(d => h('div', { class: 'lane-foe' }, `${d.name}${d.atk != null && d.aimedAtHim ? ` \u00B7 attacks at ${d.atk}` : ''}${d.move != null ? ` \u00B7 moves ${d.move}` : ''}`))))));
        if (hasTreasure(st, 'battle-bracelets') && o.hasAttack) body.push(h('div', { class: 'cb-sec', 'data-sec': 'shift-attack' }, h('b', {}, 'Battle Bracelets: move your attack'),
            o.attack
                ? h('p', { class: 'hint' }, `${o.foes.map(f => `${f.name} moves at ${f.move}`).join(', ')}: ${o.foes.length > 1 ? 'all are' : 'that is'} 5 or more, so your attack may go to any circle.`)
                : h('p', { class: 'hint' }, `${o.foes.map(f => `${f.name} moves at ${f.move ?? '?'}`).join(', ')}: a target that moves at 4 or less keeps your attack where it is.`),
            h('div', { class: 'seg3' }, ...DIRS.map((n, i) => h('button', { class: `segb${sh.attackDir === i ? ' on' : ''}`, 'data-shift-attack': i, disabled: !o.attack || null, onclick: () => { sh.attackDir = i; render(); } }, n)))));
        if (hasTreasure(st, 'elusive-cloak') && o.hasMove) body.push(h('div', { class: 'cb-sec', 'data-sec': 'shift-move' }, h('b', {}, 'Elusive Cloak: move your maneuver'),
            o.move
                ? h('p', { class: 'hint' }, `Every attack aimed at you comes at time 5 or more (${o.attackers.map(a => `${a.name} ${a.atk}`).join(', ')}), so your maneuver may go to any square.`)
                : h('p', { class: 'hint' }, o.attackers.length ? `An attack aimed at you comes at time 4 or less (${o.attackers.map(a => `${a.name} ${a.atk}`).join(', ')}): the Cloak cannot move your maneuver.` : 'Nothing is aimed at you.'),
            h('div', { class: 'seg3' }, ...MNV.map((n, i) => h('button', { class: `segb${sh.moveDir === i ? ' on' : ''}`, 'data-shift-move': i, disabled: !o.move || null, onclick: () => { sh.moveDir = i; render(); } }, n)))));
        body.push(h('div', { class: 'cb-go' }, h('button', { class: 'btn primary big', 'data-act': 'shift-go', onclick: () => {
            const a = { kind: 'shift' };
            if (o.attack && sh.attackDir !== o.attackDir) a.attackDir = sh.attackDir;
            if (o.move && sh.moveDir !== o.moveDir) a.moveDir = sh.moveDir;
            ui.shift = null; send(a);
        } }, 'Resolve the blows')));
    } else if (p.type === 'combat-wounds') {
        ui.pickChits ??= [];
        body.push(ask(`You took\u00A0${p.count} wound${p.count === 1 ? '' : 's'}: choose ${p.count === 1 ? 'the chit' : 'the chits'} to wound.`,
            'Each wound puts one of your action chits out of play until you rest it back. The choice is yours, so give up the chits you will miss least.'));
        body.push(h('div', { class: 'chitrow' }, ...p.chits.map(id => { const ch = st.ch.chits.find(x => x.id === id); return chitBtn(ch, ui.pickChits.includes(id), () => { const i = ui.pickChits.indexOf(id); if (i >= 0) ui.pickChits.splice(i, 1); else ui.pickChits.push(id); render(); }); })));
        body.push(h('button', { class: 'btn primary', disabled: ui.pickChits.length !== p.count, onclick: () => { const ids = ui.pickChits; ui.pickChits = null; send({ kind: 'wounds', chits: ids }); } }, 'Wound these'));
    } else if (p.type === 'combat-over') {
        body.push(h('button', { class: 'btn primary big', 'data-act': 'fight-over', onclick: () => send({ kind: 'over' }) }, 'On through the night'));
    } else if (p.type === 'combat-fatigue') {
        ui.pickChits ??= [];
        body.push(h('h3', {}, `Fatigue\u00A0${p.need} asterisk${p.need === 1 ? '' : 's'}`));
        if (p.why) body.push(h('p', { class: 'hint' }, p.why));
        body.push(h('div', { class: 'chitrow' }, ...p.chits.map(id => { const ch = st.ch.chits.find(x => x.id === id); return chitBtn(ch, ui.pickChits.includes(id), () => { const i = ui.pickChits.indexOf(id); if (i >= 0) ui.pickChits.splice(i, 1); else ui.pickChits.push(id); render(); }); })));
        const sum = ui.pickChits.reduce((s, id) => s + st.ch.chits.find(x => x.id === id).effort, 0);
        // Making change (4.2.4a): one asterisk too many tired, so a tired one-asterisk chit of the same type comes back, and he picks which
        const changers = sum - p.need === 1 ? makeChangeOptions(st, data, ui.pickChits) : [];
        if (ui.changeChit && !changers.some(x => x.id === ui.changeChit)) ui.changeChit = null;
        if (changers.length > 1) body.push(h('div', { class: 'cb-sec', 'data-sec': 'make-change' }, h('b', {}, 'Make change: which tired chit comes back?'),
            h('p', { class: 'hint' }, 'You tire one asterisk more than you owe, so a tired one-asterisk chit of the same kind is ready again.'),
            h('div', { class: 'chitrow' }, ...changers.map(ch => chitBtn(ch, (ui.changeChit ?? changers[0].id) === ch.id, () => { ui.changeChit = ch.id; render(); })))));
        body.push(h('button', { class: 'btn primary', disabled: sum < p.need || sum - p.need > 1, onclick: () => { const ids = ui.pickChits, change = changers.length > 1 ? (ui.changeChit ?? changers[0].id) : null; ui.pickChits = null; ui.changeChit = null; send({ kind: 'fatigue', chits: ids, change }); } }, 'Fatigue these'));
    }
    // Wounds and fatigue are decisions the player must not miss: they come first, above the foes and the account of the last round, so the
    // tiles and the confirm button are on screen the moment the question is asked.
    const decideFirst = p.type === 'combat-wounds' || p.type === 'combat-fatigue' || p.type === 'combat-over';
    // What the round did comes first: a kill, or the whole fight won, before the housekeeping of wounds and fatigue.
    const liveFoes = c.dens.some(d => !d.dead && d.kind !== 'part' && d.kind !== 'horse' && d.assigned);       // anyone not set against him is not a foe
    const killed = c.killed ?? [];
    const names = killed.map(n => `the ${n}`).join(' and ');
    const price = p.type === 'combat-over' ? 'The evening is yours' : p.type === 'combat-wounds' ? 'The wounds below are the price' : 'The tiredness below is the price';
    const gain = c.roundGain ?? { fame: 0, notoriety: 0, gold: 0 };
    const gainChips = [['Fame', gain.fame], ['Notoriety', gain.notoriety], ['gold', gain.gold]].filter(x => x[1]).map(([n, v]) => h('span', { class: `gain-chip ${n.toLowerCase()}` }, `${v > 0 ? '+' : ''}${v} ${n}`));
    const headline = decideFirst && (killed.length || !liveFoes)
        ? h('div', { class: 'cb-victory', role: 'status' }, h('b', {}, liveFoes ? `You killed ${names}.` : 'The fight is won.'),
            gainChips.length ? h('div', { class: 'gain-chips' }, ...gainChips) : null,
            h('span', {}, liveFoes ? 'Others are still on their feet.' : p.type === 'combat-over' ? 'Nothing hostile is left standing.' : `${killed.length ? `You killed ${names}: n` : 'N'}othing hostile is left standing. ${price}; settle it and the evening is yours.`))
        : (!decideFirst && killed.length && p.type === 'combat-encounter')
            ? h('div', { class: 'cb-victory', role: 'status' }, h('b', {}, liveFoes ? `You killed ${names}.` : 'The fight is won.'), gainChips.length ? h('div', { class: 'gain-chips' }, ...gainChips) : null)
            : null;
    const decision = h('div', { class: 'cb-body' }, ...body.filter(Boolean));
    const meetingQuestion = ['combat-pay', 'combat-drinks', 'combat-choice'].includes(p.type);
    if (shared) {
        // a shared fight: what the round did was shown on the reveal card (sharedfight.js), so there is no kill banner or "last round" box here; only your own sheet is listed
        return h('div', { class: 'combat sf', 'data-sf': 'step', 'data-ask-type': p.type }, header, shared.frame, state,
            h('div', { class: 'cb-scroll sf-scroll' }, resultsBlock, decision,
                allies.length ? h('div', { class: 'ask allies', role: 'note' }, h('b', {}, 'On your side'), h('p', {}, allies.join(', '))) : null,
                // the decision comes first; the counters of your creatures and your own gear are one tap away (tap a counter to turn it over)
                foeEls.length ? h('details', { class: 'sf-more', 'data-sf-foes': '', open: ui.sfFoesOpen || null, ontoggle: e => { ui.sfFoesOpen = e.target.open; } },
                    h('summary', {}, h('b', {}, 'Your creatures'), h('small', {}, ` ${foes.map(d => denSide(st, data, d).name).join(', ')}`)), h('div', { class: 'cb-foes' }, ...foeEls)) : null,
                st.pending?.spellOnly || !gearBlock ? null : h('details', { class: 'sf-more', 'data-sf-gear': '', open: ui.sfGearOpen || null, ontoggle: e => { ui.sfGearOpen = e.target.open; } }, h('summary', {}, h('b', {}, 'Your weapon and armor')), gearBlock),
                diceBlock));
    }
    return h('div', { class: 'combat' }, header, state,
        h('div', { class: 'cb-scroll' },
            resultsBlock,
            // A question that comes straight out of the meeting (pay, buy drinks, leave them be) sits right under its results, not under a page of creatures.
            ...((meetingQuestion || p.type === 'combat-shift') && !decideFirst ? [decision] : []),         // (the Bracelets / Cloak offer too: the dice have just moved the creatures, and it is all that is being asked)
            // After a round: what happened comes first (it is the first chance to read it), then the choice it leaves, then the table.
            ...(decideFirst ? [headline, last, decision] : meetingQuestion || p.type === 'combat-shift' ? [] : [headline, last]),       // the kill, then the story of the round, lead every step
            allies.length ? h('div', { class: 'ask allies', role: 'note' }, h('b', {}, 'On your side'), h('p', {}, allies.join(', '))) : null,
            h('div', { class: 'cb-foes' }, ...foeEls), st.pending?.spellOnly ? null : gearBlock, diceBlock,
            ...(decideFirst ? [] : meetingQuestion ? [last] : p.type === 'combat-shift' ? [] : [decision])));
}
