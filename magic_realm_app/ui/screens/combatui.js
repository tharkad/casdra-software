import { rollRow } from '../dice.js';
import { monsterCounter, itemFace } from '../counter.js';
import { roundSynopsis, narrateRoll } from '../../engine/story.js';
import { isStory, voiceChip } from '../voice.js';
import { ask } from '../ask.js';
import { h } from '../dom.js';
import { encounterOptions, meleeOptions, denSide, weaponOf, activeArmor, weaponSide } from '../../engine/combat.js';
import { roadsFrom, nameOfClearing } from '../../engine/world.js';
import { chitLabel } from '../../engine/day.js';
import { nameOf, weightOf, defOf } from '../../engine/items.js';
import { lvl } from '../../engine/core.js';

// The evening fight: a vertical, one-hand layout. Foes on top, then the choice in front of you, then the chits you may play.
const DIRS = ['Thrust', 'Swing', 'Smash'], MNV = ['Charge', 'Dodge', 'Duck'];

export function combatSheet({ st, data, act, ui, render, peek }) {
    const p = st.pending, c = st.combat;
    ui.melee ??= { target: c.dens.find(d => !d.dead && d.kind !== 'part' && d.kind !== 'horse')?.uid ?? null, fightChit: null, attackDir: 0, moveChit: null, moveDir: 0, shieldDir: 0, boxes: {} };
    const m = ui.melee;
    const send = a => { ui.melee = null; act({ type: 'combat', ...a }); };
    const foes = c.dens.filter(d => !d.dead && d.kind !== 'horse');
    const cs = { active: 0, fatigued: 0, wounded: 0, enchanted: 0 }; st.ch.chits.forEach(x => { cs[x.state] = (cs[x.state] ?? 0) + 1; });
    const gear = st.ch.items.filter(i => i.kind === 'armor' && i.active).map(i => `${nameOf(data, i)}${i.damaged ? ' (damaged)' : i.destroyed ? ' (destroyed)' : ''}`);
    const header = h('div', { class: 'cb-head' },
        h('b', {}, `Evening at ${nameOfClearing(c.at)}`),
        h('span', { class: 'cb-peek' },
            peek ? h('button', { class: 'peekbtn', 'data-act': 'peek-gear', onclick: peek.gear }, 'Belongings') : null,
            peek ? h('button', { class: 'peekbtn', 'data-act': 'peek-map', onclick: peek.map }, 'Map') : null,
            st.pending?.spellOnly ? null : h('em', {}, `Round ${c.round}`)));
    const state = h('div', { class: 'cb-state' }, h('span', {}, `Chits: ${cs.active} ready \u00B7 ${cs.fatigued} tired \u00B7 ${cs.wounded} wounded${cs.enchanted ? ` \u00B7 ${cs.enchanted} enchanted` : ''}`), h('span', {}, gear.join(', ') || 'no armor'));
    // A tap on a creature turns its counter over: the other side, with its own numbers, and what changed.
    ui.flipped ??= {};
    const SIDE_NAME = { light: 'light side', dark: 'dark side', red: 'red side' };
    const otherSide = d => {
        if (d.kind === 'mon') { const m = data.monsters[d.id]; const order = ['light', ...(m.dark ? ['dark'] : []), ...(m.red ? ['red'] : [])]; return order[(order.indexOf(d.side ?? 'light') + 1) % order.length]; }
        if (d.kind === 'nat' || d.kind === 'part') return d.side === 'dark' ? 'light' : 'dark';
        return null;
    };
    const WORD = { N: 'Negligible', L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };
    const stat = s => ({ harm: s.attack === 'none' ? 'no attack' : s.attack === 'spell' ? 'Power of the Pit' : `${s.harm}${'*'.repeat(s.stars || 0)}`, speed: s.attack === 'none' ? '\u2013' : s.atk, moves: s.move ?? '\u2013', vuln: s.vuln ?? '\u2013' });
    const foeEls = foes.map(d => {
        const now = denSide(st, data, d), other = otherSide(d);
        const showRev = !!ui.flipped[d.uid] && other && other !== (d.side ?? 'light');
        const view = showRev ? { ...d, side: other } : d;
        const s = showRev ? denSide(st, data, view) : now;
        const a = stat(now), b = stat(s);
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
                // what the numbers on its counter mean, in the words the rules use
                h('span', { class: 'foe-kind' }, [s.size ? WORD[s.size] ?? s.size : '', b.vuln && b.vuln !== '\u2013' ? `killed by ${WORD[b.vuln] ?? b.vuln} harm` : ''].filter(Boolean).join(' \u00B7 ')),
                h('div', { class: 'foe-stats' },
                    ...[['Hits', /^[NLMHT]\*{0,3}$/.test(String(b.harm)) ? `${WORD[String(b.harm)[0]]}${String(b.harm).slice(1)}` : b.harm, 'harm'], ['Speed', b.speed, 'speed'], ['Moves', b.moves, 'moves']]
                        .map(([k, v, key]) => h('div', { class: 'fs' }, h('small', {}, k), h('i', { class: diff(key) }, String(v))))),
                ui.flipped[d.uid] && !showRev ? h('small', { class: 'was' }, 'This counter has no other side.') : null,
                showRev ? h('small', { class: 'was' }, `now: harm ${a.harm} \u00B7 speed ${a.speed} \u00B7 moves ${a.moves}${a.vuln !== b.vuln ? ` \u00B7 vuln ${a.vuln}` : ''}`) : null,
                d.pickedUp ? h('em', {}, 'has seized you') : null,
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
                `${showA ? 'Alerted' : 'Not alerted'}: harm ${s.harm}${'*'.repeat(s.stars ?? 0)}, ${s.attackTime == null ? 'attack time from your Fight chit' : `attack time ${s.attackTime}`}`];
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
            : h('div', { class: 'cb-steps' }, ...c.events.map(e => h('p', { class: e.startsWith('  ') ? 'sub' : /^(Round \d+:|Order of blows|Boxes as|Repositioning)/.test(e) ? 'hd' : '' }, e.trim())))) : null;
    const body = [];
    const chitBtn = (ch, sel, on, ok = true) => h('button', { class: `chit3 ${ch.type}${sel ? ' sel' : ''}`, disabled: !ok, onclick: on }, h('b', {}, ch.type === 'magic' ? `${ch.numeral ?? ''}${ch.time}` : `${ch.strength}${ch.time}`), h('span', {}, '*'.repeat(ch.effort) || ' '));

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
        // creatures that cast rather than strike: how the Power of the Pit works, and how likely each result is
        const casters = foes.filter(d => denSide(st, data, d).attack === 'spell');
        if (casters.length) {
            const rows = data.tables?.powerOfThePit?.rows ?? {};
            const odds = k => `${Math.round((2 * k - 1) / 36 * 100)}%`;
            body.push(h('details', { class: 'ask pitnote', open: c.round === 1 || null },
                h('summary', {}, h('b', {}, `${[...new Set(casters.map(d => denSide(st, data, d).name))].join(', ')}: casts the Power of the Pit`)),
                h('p', {}, `It does not strike a blow. At its attack time it casts a Type ${denSide(st, data, casters[0]).spell ?? 'V'} spell, the Power of the Pit, and the dice decide what happens to whoever it is aimed at. It is aimed like any attack: your maneuver can turn it aside, but armor does not help against it. Roll two dice and the higher counts:`),
                ...Object.entries(rows).map(([k, r]) => h('p', { class: 'pitrow' }, h('b', {}, `${k} (${odds(Number(k))}) ${r.name}: `), r.effect)),
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
            if (o.casts.length) {
                body.push(h('p', { class: 'quiet-q' }, 'Would you like to cast a spell?'));
                for (const x of o.casts) {
                    const sp = data.spells?.[x.spell], chit = st.ch.chits.find(c => c.id === x.chit);
                    body.push(h('button', { class: `btn castcard${x.useful ? ' primary' : ''}`, 'data-act': 'cast', 'data-spell': x.spell, onclick: () => send({ kind: 'encounter', act: 'cast', spell: x.spell, chit: x.chit }) },
                        h('span', { class: 'col' }, h('b', {}, `Cast ${x.name}`), h('span', { class: 'what' }, what(x)),
                            h('small', {}, `Uses your Magic ${chit?.numeral ?? ''}${x.time}${'*'.repeat(x.effort)}, which is tired afterwards${sp?.color ? ` \u00B7 ${sp.color} magic` : ''}`))));
                }
            }
            body.push(h('button', { class: 'btn quiet-no', 'data-act': 'pass', onclick: () => send({ kind: 'encounter', act: 'pass' }) }, 'Not tonight'));
        } else {
        if (c.round === 1 && c.intro?.length) body.push(h('div', { class: 'ask', role: 'note' }, h('b', {}, 'How this came about'), ...c.intro.map(t => h('p', {}, t))));
        body.push(ask(p.spellOnly ? 'Evening: nothing is fighting you. Do you want to cast a spell?' : `Round ${c.round}, Encounter step: you may take one action before the melee.`,
            p.spellOnly ? 'Spells are cast in the evening (rule 8.1.3a: a quiet clearing still gets its rounds), so the game stops here to let you cast one now. You may also do nothing.'
                : 'Before plays are chosen you may ready your weapon, run from the fight, cast a spell, or simply go on. A chit you play here has to be faster than every creature facing you.'));
        if (o.canStay && !p.spellOnly) {
            body.push(h('p', { class: 'hint' }, 'You are hidden. Creatures cannot be set on a hidden character, so nothing here can attack you. You may stay hidden and let the evening pass, or strike from hiding: you get the first blow, but you are revealed.'));
            body.push(h('button', { class: 'btn primary', 'data-act': 'stay-hidden', onclick: () => send({ kind: 'encounter', act: 'stay' }) }, 'Stay hidden: let the evening pass'));
        }
        body.push(h('button', { class: `btn${(p.spellOnly && o.casts.some(x => x.useful)) || (o.canStay && !p.spellOnly) ? '' : ' primary'}`, 'data-act': 'pass', onclick: () => send({ kind: 'encounter', act: 'pass' }) }, p.spellOnly ? 'Do nothing' : o.canStay ? 'Strike from hiding' : 'Go on to the fight'));
        if (o.blocked?.length && !o.casts.length) {
            body.push(h('h3', {}, 'Spells you know'));
            for (const x of o.blocked) body.push(h('p', { class: 'hint' }, h('b', {}, `${x.name}: `), x.why));
        }
        if (o.casts.length) {
            body.push(h('h3', {}, 'Cast a spell'));
            body.push(h('p', { class: 'hint' }, 'The Magic chit you play is the spell\'s cost; it counts toward the two asterisks of the round and is tired afterwards.'));
            for (const x of o.casts) {
                const sp = data.spells?.[x.spell];
                body.push(h('button', { class: `btn${p.spellOnly && x.useful ? ' primary' : ''}`, 'data-act': 'cast', 'data-spell': x.spell, onclick: () => send({ kind: 'encounter', act: 'cast', spell: x.spell, chit: x.chit }) },
                    h('span', { class: 'col' }, h('b', {}, x.name), h('small', {}, `Type ${sp?.type ?? ''} \u00B7 ${sp?.color ?? 'any'} \u00B7 Magic ${st.ch.chits.find(c => c.id === x.chit)?.numeral}${x.time}${'*'.repeat(x.effort)}${x.useful ? '' : ' \u00B7 nothing to mend'}`))));
                if (sp?.text) body.push(h('p', { class: 'hint' }, sp.text));
            }
        }
        if (!p.spellOnly && o.weapon && o.alertChits.length) {
            body.push(h('h3', {}, o.weapon.item.alerted ? 'Put your weapon away (unalert)' : 'Ready your weapon (alert)'));
            body.push(h('div', { class: 'chitrow' }, ...o.alertChits.map(ch => chitBtn(ch, false, () => send({ kind: 'encounter', act: 'alert', chit: ch.id })))));
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
        }
    } else if (p.type === 'combat-melee') {
        const o = meleeOptions(st, data);
        const w = o.weapon;
        const wname = w ? nameOf(data, w.item) + (w.item.alerted ? ' (alerted)' : '') : 'bare hands';
        body.push(ask(`Round ${c.round}, Melee: choose your plays.`,
            'Pick whom you strike and in which direction, the maneuver that defends you, and where the creatures stand in the three boxes. Plays are chosen together; then the dice shuffle the creatures and the blows land. You may play at most two asterisks of effort.'));
        // the three lanes: where the creatures stand (before the dice move them) and which way you attack, maneuver and guard
        body.push(h('div', { class: 'board' }, ...[0, 1, 2].map(b => h('div', { class: 'lane' },
            h('div', { class: 'lane-h' }, h('b', {}, MNV[b]), h('small', {}, DIRS[b])),
            h('div', { class: 'lane-tags' }, ...[m.attackDir === b && (m.fightChit || o.attackSpell) ? 'your attack' : null, m.moveDir === b && m.moveChit ? 'your maneuver' : null, o.shield && m.shieldDir === b ? 'shield' : null]
                .filter(Boolean).map(t => h('span', { class: 'tag' }, t))),
            ...o.boxable.filter((d, i) => (m.boxes[d.uid] ?? (i % 3)) === b).map(d => h('div', { class: 'lane-foe' }, denSide(st, data, d).name))))));
        // 1 target
        body.push(h('div', { class: 'cb-sec' }, h('b', {}, '1. Who do you strike?'),
            h('div', { class: 'seg3 wrap' }, h('button', { class: `segb${m.target == null ? ' on' : ''}`, onclick: () => { m.target = null; render(); } }, 'No one'),
                ...o.targets.map(d => h('button', { class: `segb${m.target === d.uid ? ' on' : ''}`, onclick: () => { m.target = d.uid; render(); } }, denSide(st, data, d).name)))));
        // 2 attack
        const spl = o.attackSpell ? data.spells?.[o.attackSpell.spell] : null;
        // the time the attack goes off at: a weapon's own printed time for the side showing, else the Fight chit's
        const wside = w ? weaponSide(w) : null;
        const timeNote = spl ? null : !w ? 'Attack time: the Fight chit\u2019s own time.'
            : wside.time != null ? `Attack time ${wside.time}: printed on the ${w.item.alerted ? 'alerted ' : ''}weapon, so it is ${wside.time} whichever Fight chit you play.`
                : 'Attack time: the time on the Fight chit you play (this side of the weapon prints none).';
        body.push(h('div', { class: 'cb-sec' }, h('b', {}, spl ? `2. Attack with ${spl.name}` : `2. Attack with your ${wname}${wside?.time != null ? ` \u00B7 time ${wside.time}` : ''}`),
            timeNote ? h('p', { class: 'hint' }, timeNote) : null,
            h('div', { class: 'seg3' }, ...DIRS.map((n, i) => h('button', { class: `segb${m.attackDir === i ? ' on' : ''}`, onclick: () => { m.attackDir = i; render(); } }, n))),
            spl ? h('p', { class: 'hint' }, `The spell strikes from the attack circle: ${o.attackSpell.hits > 1 ? `${o.attackSpell.hits} attacks` : 'one attack'} of harm ${o.attackSpell.harm}${'*'.repeat(o.attackSpell.stars)}, length ${o.attackSpell.length}, each with its own Missile Table roll. You cannot also use a Fight chit or weapon this round.`)
            : h('div', { class: 'chitrow' }, h('button', { class: `chit3 none${m.fightChit == null ? ' sel' : ''}`, onclick: () => { m.fightChit = null; render(); } }, 'none'),
                ...o.fightChits.map(ch => chitBtn(ch, m.fightChit === ch.id, () => { m.fightChit = ch.id; render(); }, o.fightOk(ch))))));
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
        const ast = o.asterisksPlayed + [m.fightChit, m.moveChit].map(id => st.ch.chits.find(x => x.id === id)?.effort ?? 0).reduce((a, b) => a + b, 0);
        body.push(h('div', { class: 'cb-go' },
            h('span', { class: ast > 2 ? 'bad' : '' }, `Effort ${ast}/2`),
            m.fightChit && !m.target ? h('span', { class: 'bad' }, 'Pick whom to strike, or play no Fight chit') : null,
            h('button', { class: 'btn primary big', 'data-act': 'commit', disabled: ast > 2 || (m.fightChit && !m.target) || null, onclick: () => {
                const boxes = {}; o.boxable.forEach((d, i) => { boxes[d.uid] = m.boxes[d.uid] ?? (i % 3); });
                send({ kind: 'melee', target: m.target, fightChit: m.fightChit, attackDir: m.attackDir, moveChit: m.moveChit, moveDir: m.moveDir, shieldDir: o.shield ? m.shieldDir : null, boxes });
            } }, 'Commit and roll')));
    } else if (p.type === 'combat-wounds') {
        ui.pickChits ??= [];
        body.push(ask(`You took ${p.count} wound${p.count === 1 ? '' : 's'}: choose ${p.count === 1 ? 'the chit' : 'the chits'} to wound.`,
            'Each wound puts one of your action chits out of play until you rest it back. The choice is yours, so give up the chits you will miss least.'));
        body.push(h('div', { class: 'chitrow' }, ...p.chits.map(id => { const ch = st.ch.chits.find(x => x.id === id); return chitBtn(ch, ui.pickChits.includes(id), () => { const i = ui.pickChits.indexOf(id); if (i >= 0) ui.pickChits.splice(i, 1); else ui.pickChits.push(id); render(); }); })));
        body.push(h('button', { class: 'btn primary', disabled: ui.pickChits.length !== p.count, onclick: () => { const ids = ui.pickChits; ui.pickChits = null; send({ kind: 'wounds', chits: ids }); } }, 'Wound these'));
    } else if (p.type === 'combat-fatigue') {
        ui.pickChits ??= [];
        body.push(h('h3', {}, `Fatigue ${p.need} asterisk${p.need === 1 ? '' : 's'}`));
        if (p.why) body.push(h('p', { class: 'hint' }, p.why));
        body.push(h('div', { class: 'chitrow' }, ...p.chits.map(id => { const ch = st.ch.chits.find(x => x.id === id); return chitBtn(ch, ui.pickChits.includes(id), () => { const i = ui.pickChits.indexOf(id); if (i >= 0) ui.pickChits.splice(i, 1); else ui.pickChits.push(id); render(); }); })));
        const sum = ui.pickChits.reduce((s, id) => s + st.ch.chits.find(x => x.id === id).effort, 0);
        body.push(h('button', { class: 'btn primary', disabled: sum < p.need || sum - p.need > 1, onclick: () => { const ids = ui.pickChits; ui.pickChits = null; send({ kind: 'fatigue', chits: ids }); } }, 'Fatigue these'));
    }
    // Wounds and fatigue are decisions the player must not miss: they come first, above the foes and the account of the last round, so the
    // tiles and the confirm button are on screen the moment the question is asked.
    const decideFirst = p.type === 'combat-wounds' || p.type === 'combat-fatigue';
    // What the round did comes first: a kill, or the whole fight won, before the housekeeping of wounds and fatigue.
    const liveFoes = c.dens.some(d => !d.dead && d.kind !== 'part' && d.kind !== 'horse' && d.assigned);       // anyone not set against him is not a foe
    const killed = c.killed ?? [];
    const names = killed.map(n => `the ${n}`).join(' and ');
    const price = p.type === 'combat-wounds' ? 'The wounds below are the price' : 'The tiredness below is the price';
    const gain = c.roundGain ?? { fame: 0, notoriety: 0, gold: 0 };
    const gainChips = [['Fame', gain.fame], ['Notoriety', gain.notoriety], ['gold', gain.gold]].filter(x => x[1]).map(([n, v]) => h('span', { class: `gain-chip ${n.toLowerCase()}` }, `${v > 0 ? '+' : ''}${v} ${n}`));
    const headline = decideFirst && (killed.length || !liveFoes)
        ? h('div', { class: 'cb-victory', role: 'status' }, h('b', {}, liveFoes ? `You killed ${names}.` : 'The fight is won.'),
            gainChips.length ? h('div', { class: 'gain-chips' }, ...gainChips) : null,
            h('span', {}, liveFoes ? 'Others are still on their feet.' : `${killed.length ? `You killed ${names}: n` : 'N'}othing hostile is left standing. ${price}; settle it and the evening is yours.`))
        : null;
    const decision = h('div', { class: 'cb-body' }, ...body.filter(Boolean));
    const meetingQuestion = ['combat-pay', 'combat-drinks', 'combat-choice'].includes(p.type);
    return h('div', { class: 'combat' }, header, state,
        h('div', { class: 'cb-scroll' },
            resultsBlock,
            // A question that comes straight out of the meeting (pay, buy drinks, leave them be) sits right under its results, not under a page of creatures.
            ...(meetingQuestion && !decideFirst ? [decision] : []),
            // After a round: what happened comes first (it is the first chance to read it), then the choice it leaves, then the table.
            ...(decideFirst ? [headline, last, decision] : []),
            h('div', { class: 'cb-foes' }, ...foeEls), st.pending?.spellOnly ? null : gearBlock, diceBlock,
            ...(decideFirst ? [] : meetingQuestion ? [last] : [last, decision])));
}
