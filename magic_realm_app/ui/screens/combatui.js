import { rollRow } from '../dice.js';
import { monsterCounter } from '../counter.js';
import { ask } from '../ask.js';
import { h } from '../dom.js';
import { encounterOptions, meleeOptions, denSide } from '../../engine/combat.js';
import { roadsFrom, nameOfClearing } from '../../engine/world.js';
import { chitLabel } from '../../engine/day.js';
import { nameOf, weightOf } from '../../engine/items.js';
import { lvl } from '../../engine/core.js';

// The evening fight: a vertical, one-hand layout. Foes on top, then the choice in front of you, then the chits you may play.
const DIRS = ['Thrust', 'Swing', 'Smash'], MNV = ['Charge', 'Dodge', 'Duck'];

export function combatSheet({ st, data, act, ui, render, peek }) {
    const p = st.pending, c = st.combat;
    ui.melee ??= { target: c.dens.find(d => !d.dead && d.kind !== 'part' && d.kind !== 'horse')?.uid ?? null, fightChit: null, attackDir: 0, moveChit: null, moveDir: 0, shieldDir: 0, boxes: {} };
    const m = ui.melee;
    const send = a => { ui.melee = null; act({ type: 'combat', ...a }); };
    const foes = c.dens.filter(d => !d.dead && d.kind !== 'horse');
    const cs = { active: 0, fatigued: 0, wounded: 0 }; st.ch.chits.forEach(x => { cs[x.state]++; });
    const gear = st.ch.items.filter(i => i.kind === 'armor' && i.active).map(i => `${nameOf(data, i)}${i.damaged ? ' (damaged)' : i.destroyed ? ' (destroyed)' : ''}`);
    const header = h('div', { class: 'cb-head' },
        h('b', {}, `Evening at ${nameOfClearing(c.at)}`),
        h('span', { class: 'cb-peek' },
            peek ? h('button', { class: 'peekbtn', 'data-act': 'peek-gear', onclick: peek.gear }, 'Belongings') : null,
            peek ? h('button', { class: 'peekbtn', 'data-act': 'peek-map', onclick: peek.map }, 'Map') : null,
            h('em', {}, `Round ${c.round}`)));
    const state = h('div', { class: 'cb-state' }, h('span', {}, `Chits: ${cs.active} ready \u00B7 ${cs.fatigued} tired \u00B7 ${cs.wounded} wounded`), h('span', {}, gear.join(', ') || 'no armor'));
    // A tap on a creature turns its counter over: the other side, with its own numbers, and what changed.
    ui.flipped ??= {};
    const SIDE_NAME = { light: 'light side', dark: 'dark side', red: 'red side' };
    const otherSide = d => {
        if (d.kind === 'mon') { const m = data.monsters[d.id]; const order = ['light', ...(m.dark ? ['dark'] : []), ...(m.red ? ['red'] : [])]; return order[(order.indexOf(d.side ?? 'light') + 1) % order.length]; }
        if (d.kind === 'nat' || d.kind === 'part') return d.side === 'dark' ? 'light' : 'dark';
        return null;
    };
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
                h('span', {}, `${s.size ?? ''} \u00B7 vuln `, h('i', { class: diff('vuln') }, b.vuln), ' \u00B7 harm ', h('i', { class: diff('harm') }, b.harm), ' \u00B7 speed ', h('i', { class: diff('speed') }, b.speed),
                    ' \u00B7 moves ', h('i', { class: diff('moves') }, b.moves)),
                ui.flipped[d.uid] && !showRev ? h('small', { class: 'was' }, 'This counter has no other side.') : null,
                showRev ? h('small', { class: 'was' }, `now: harm ${a.harm} \u00B7 speed ${a.speed} \u00B7 moves ${a.moves}${a.vuln !== b.vuln ? ` \u00B7 vuln ${a.vuln}` : ''}`) : null,
                d.pickedUp ? h('em', {}, 'has seized you') : null,
                d.engagedBy ? h('em', { class: 'ally' }, 'is fighting your hireling') : null));
    });
    const dice = (st.rolls ?? []).filter(r => r.n > (c.roundRollFrom ?? c.rollFrom ?? 0)).slice(-8);
    const diceBlock = dice.length ? h('div', { class: 'cb-dice' }, ...dice.map(r => rollRow(r, { compact: true }))) : null;
    const last = c.events?.length ? h('div', { class: 'cb-last' }, h('b', {}, 'Last round'), ...c.events.map(e => h('p', { class: e.startsWith('  ') ? 'sub' : /^(Round \d+:|Order of blows|Boxes as|Repositioning)/.test(e) ? 'hd' : '' }, e.trim()))) : null;
    const body = [];
    const chitBtn = (ch, sel, on, ok = true) => h('button', { class: `chit3 ${ch.type}${sel ? ' sel' : ''}`, disabled: !ok, onclick: on }, h('b', {}, `${ch.strength}${ch.time}`), h('span', {}, '*'.repeat(ch.effort) || ' '));

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
        body.push(h('div', { class: 'cb-q' }, h('p', {}, `The ${p.groups.join(' and the ')} ${p.groups.length > 1 ? 'are' : 'is'} here and not looking for a fight. You may attack ${p.groups.length > 1 ? 'one of them, which brings its whole group in' : 'them'}, or let them be.`),
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
        if (c.round === 1 && c.intro?.length) body.push(h('div', { class: 'ask', role: 'note' }, h('b', {}, 'How this came about'), ...c.intro.map(t => h('p', {}, t))));
        body.push(ask(p.spellOnly ? 'A quiet evening: nothing is fighting you.' : `Round ${c.round}, Encounter step: you may take one action before the melee.`,
            p.spellOnly ? 'Spells are cast in the evening, so the game stops here to let you cast one. You may also do nothing.'
                : 'Before plays are chosen you may ready your weapon, run from the fight, cast a spell, or simply go on. A chit you play here has to be faster than every creature facing you.'));
        if (o.canStay && !p.spellOnly) {
            body.push(h('p', { class: 'hint' }, 'You are hidden. Creatures cannot be set on a hidden character, so nothing here can attack you. You may stay hidden and let the evening pass, or strike from hiding: you get the first blow, but you are revealed.'));
            body.push(h('button', { class: 'btn primary', 'data-act': 'stay-hidden', onclick: () => send({ kind: 'encounter', act: 'stay' }) }, 'Stay hidden: let the evening pass'));
        }
        body.push(h('button', { class: `btn${(p.spellOnly && o.casts.some(x => x.useful)) || (o.canStay && !p.spellOnly) ? '' : ' primary'}`, 'data-act': 'pass', onclick: () => send({ kind: 'encounter', act: 'pass' }) }, p.spellOnly ? 'Do nothing' : o.canStay ? 'Strike from hiding' : 'Go on to the fight'));
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
    } else if (p.type === 'combat-melee') {
        const o = meleeOptions(st, data);
        const w = o.weapon;
        const wname = w ? nameOf(data, w.item) + (w.item.alerted ? ' (alerted)' : '') : 'bare hands';
        body.push(ask(`Round ${c.round}, Melee: choose your plays.`,
            'Pick whom you strike and in which direction, the maneuver that defends you, and where the creatures stand in the three boxes. Plays are chosen together; then the dice shuffle the creatures and the blows land. You may play at most two asterisks of effort.'));
        // the three lanes: where the creatures stand (before the dice move them) and which way you attack, maneuver and guard
        body.push(h('div', { class: 'board' }, ...[0, 1, 2].map(b => h('div', { class: 'lane' },
            h('div', { class: 'lane-h' }, h('b', {}, MNV[b]), h('small', {}, DIRS[b])),
            h('div', { class: 'lane-tags' }, ...[m.attackDir === b && m.fightChit ? 'your attack' : null, m.moveDir === b && m.moveChit ? 'your maneuver' : null, o.shield && m.shieldDir === b ? 'shield' : null]
                .filter(Boolean).map(t => h('span', { class: 'tag' }, t))),
            ...o.boxable.filter((d, i) => (m.boxes[d.uid] ?? (i % 3)) === b).map(d => h('div', { class: 'lane-foe' }, denSide(st, data, d).name))))));
        // 1 target
        body.push(h('div', { class: 'cb-sec' }, h('b', {}, '1. Who do you strike?'),
            h('div', { class: 'seg3 wrap' }, h('button', { class: `segb${m.target == null ? ' on' : ''}`, onclick: () => { m.target = null; render(); } }, 'No one'),
                ...o.targets.map(d => h('button', { class: `segb${m.target === d.uid ? ' on' : ''}`, onclick: () => { m.target = d.uid; render(); } }, denSide(st, data, d).name)))));
        // 2 attack
        body.push(h('div', { class: 'cb-sec' }, h('b', {}, `2. Attack with your ${wname}`),
            h('div', { class: 'seg3' }, ...DIRS.map((n, i) => h('button', { class: `segb${m.attackDir === i ? ' on' : ''}`, onclick: () => { m.attackDir = i; render(); } }, n))),
            h('div', { class: 'chitrow' }, h('button', { class: `chit3 none${m.fightChit == null ? ' sel' : ''}`, onclick: () => { m.fightChit = null; render(); } }, 'none'),
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
    return h('div', { class: 'combat' }, header, state, h('div', { class: 'cb-scroll' }, h('div', { class: 'cb-foes' }, ...foeEls), diceBlock, last, h('div', { class: 'cb-body' }, ...body.filter(Boolean))));
}
