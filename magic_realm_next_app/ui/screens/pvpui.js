// The screens of CHARACTER AGAINST CHARACTER (docs/design/multiplayer-pvpui.md), builders only. Behind the lobby switch `pvp`: with it off no step here is asked for and nothing here is built.
//   charge      8.3.6: "Do you attack someone?" The characters in the fight as targets (what the rules let you know of each), the Move chit that makes the charge, Pass, Peace
//   targets     the Melee step: characters and other players' hirelings beside the creatures, a confirm before treachery
//   death       the big callout for a character who has fallen: who struck him down, what was taken, what happens next
//   reveal      the round between characters: result first, who went for whom, the order of blows, blow by blow
import { h } from '../dom.js';
import { ask } from '../ask.js';
import { isStory } from '../voice.js';
import { counterIcon } from '../shared_ui.js';
import { joinList } from '../fight.js';
import { foeFacts, gearWords, chargeModel, targetName, pname, treacheryCost, dealWith, spoilsText, blowStory, missStory, inOrder, pvpHeadline } from '../pvp.js';

const nb = s => String(s).replace(/ (?=\d)/g, ' ');
const personOf = (f, id) => f.members.find(m => m.id === id)?.person ?? null;

// ---- a character as a card: the same card is a charge target and a melee target ----
/** One character, as the rules show him. `on`: chosen; `facts`: foeFacts(); `note`: a warning line (a deal made). */
export function foeCard({ facts, person, on, role = 'radio', onclick, data = {}, extra = null }) {
    const state = facts.hidden ? 'hidden: you found them' : 'in plain sight';
    return h('button', { class: `pv-foe${on ? ' on' : ''}${facts.deal || extra ? ' warn' : ''}`, role, 'aria-checked': on ? 'true' : 'false', 'data-foe-char': facts.id, ...data, onclick },
        person ? counterIcon({ ...person, mine: false }, 44) : h('span', { class: 'pv-ico' }),
        h('span', { class: 'pv-ftext' },
            h('b', {}, facts.player, h('i', {}, ` · ${facts.character}`)),
            h('small', { class: 'pv-nums' }, nb(`Fame ${facts.fame} · Notoriety ${facts.notoriety} · ${state}`)),
            h('small', { class: 'pv-gear' }, gearWords(facts)),
            facts.deal ? h('small', { class: 'pv-deal' }, facts.deal) : null,
            extra),
        h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, on ? '✓' : '+'));
}

/** A box that wants one tap of "yes, I mean it" before the primary button works. */
export function confirmBox({ title, text, label, on, ontoggle, key }) {
    return h('div', { class: `pv-confirm${on ? ' on' : ''}`, role: 'alert', 'data-confirm': key },
        h('b', {}, title), h('p', {}, text),
        h('button', { class: `pv-sure${on ? ' on' : ''}`, role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'data-act': 'pvp-confirm', onclick: ontoggle }, h('span', { class: 'pv-box', 'aria-hidden': 'true' }, on ? '✓' : ''), label));
}

// ---- the CHARGE step ----
const chitFace = c => `${c.strength}${c.time}`;
/** The charge question, as { body, foot } for the frame of the shared fight (like the lure). `ui.charge` holds the choices of this round. */
export function chargeBody({ st, data, p, ui, render, act, f }) {
    const model = chargeModel(st, data, p, st.ch.id);
    if (!ui.charge || ui.charge.round !== p.round) ui.charge = { round: p.round, target: null, chit: null, hires: {}, sure: false };
    const c = ui.charge, tgt = model.targets.find(t => t.id === c.target) ?? null;
    if (c.target && !tgt) { c.target = null; c.sure = false; }
    const usable = model.chits.usable;
    if (c.chit && !usable.some(r => r.id === c.chit)) c.chit = null;
    if (tgt && !c.chit && usable.length) c.chit = usable[0].id;                              // the fastest, then the cheapest
    const chit = usable.find(r => r.id === c.chit)?.chit ?? null;
    const canCharge = !!usable.length;
    const sent = Object.entries(c.hires).filter(([, id]) => id && model.targets.some(t => t.id === id));
    const hireName = uid => model.hires.find(x => x.uid === uid)?.name ?? 'hireling';
    const charging = !!tgt && canCharge;
    const peaceOk = model.peace && !charging && !sent.length;

    // what the others have said in the open already: a charge that is not at me, a hush
    const news = [...(f.charges ?? []).filter(x => !x.on.mine).map(x => `${x.by.player} charges ${x.on.player}.`), ...f.members.filter(m => m.peace === true && !m.mine).map(m => `${m.player} means no harm.`)];
    const body = [
        ask(`Round ${p.round}: do you attack someone?`,
            canCharge ? 'A charge is your Encounter action. Everyone sees it made, the one charged may answer only with faster chits, and you may strike nobody else this round. Your secret play comes later.'
                : 'You cannot charge this round (see why below), but you may still name someone in the secret plays that follow, and send your hirelings.'),
        ...(f.charges ?? []).filter(x => x.on.mine).map(x => h('p', { class: 'sf-warn', 'data-pv-charged-me': x.by.id }, nb(`${x.by.player} has charged you with a Move chit of time ${x.time}. In the Encounter step your Fight, Move and Fly chits must be faster than ${x.time}.`))),
        news.length ? h('p', { class: 'sf-now pv-news', 'data-pv-news': '' }, h('b', {}, 'Said so far.'), ' ', news.join(' ')) : null,
        model.hidden ? h('p', { class: 'sf-warn', 'data-sf-hidden': '' }, 'You are hidden. Charging gives you away.') : null,
        h('div', { class: 'pv-foes', role: 'radiogroup', 'aria-label': 'Whom you may charge', 'data-pv-targets': '' },
            ...model.targets.map(t => foeCard({ facts: t, person: personOf(f, t.id), on: c.target === t.id, data: { 'data-target': t.id },
                onclick: () => { c.target = c.target === t.id ? null : t.id; c.sure = false; render(); } }))),
    ];
    // the Move chit that makes the charge, and why the others cannot
    if (canCharge || model.chits.rows.length) {
        body.push(h('div', { class: 'cb-sec pv-chits', 'data-pv-chits': '' },
            h('b', {}, canCharge ? (tgt ? `Charge ${tgt.player} with` : 'The Move chit that would carry a charge') : 'No Move chit can make a charge'),
            h('p', { class: 'hint' }, model.chits.slowest < 99
                ? `A charge needs a Move chit strictly faster than everything holding you back (${model.chits.gateText ?? `time ${model.chits.slowest}`}), and strong enough to carry all you own.`
                : 'A charge needs a Move chit strong enough to carry all you own; no creature is on your sheet to hold it back.'),
            canCharge ? h('div', { class: 'chitrow' }, ...usable.map(r => h('button', { class: `chit3 move${c.chit === r.id ? ' sel' : ''}`, 'data-chit': r.id, onclick: () => { c.chit = r.id; render(); } },
                h('b', {}, chitFace(r.chit)), h('span', {}, '*'.repeat(r.chit.effort ?? 0) || ' ')))) : null,
            model.chits.rows.some(r => !r.ok) ? h('p', { class: 'hint pv-nochit', 'data-pv-nochit': '' }, `Not available: ${joinList(model.chits.rows.filter(r => !r.ok).map(r => `${r.text} (${r.why})`))}.`) : null));
    }
    // the consequences, in plain words
    if (charging) {
        const lines = [
            `${tgt.player} may answer in the Encounter step only with chits faster than ${chit?.time}.`,
            `Your charge uses your Encounter action: you may strike no one but ${tgt.player} this round.`,
            model.hidden ? 'You are hidden: charging gives you away.' : null,
            tgt.hidden ? `${tgt.player} is hidden and you found them: charging reveals them too.` : null,
            'A character struck down loses everything to the one who did it: Notoriety, gold and belongings.',
        ].filter(Boolean);
        body.push(h('ul', { class: 'pv-means', 'data-pv-means': '' }, ...lines.map(t => h('li', {}, nb(t)))));
        if (tgt.deal) body.push(confirmBox({ key: 'deal', title: 'You gave your word', text: `${tgt.deal} Charging ${tgt.player} turns on someone you dealt with, and the whole table sees it.`, label: `I know. Charge ${tgt.player} anyway`, on: c.sure, ontoggle: () => { c.sure = !c.sure; render(); } }));
    }
    // hirelings: at a creature (as usual) or at a character
    if (model.hires.length) {
        body.push(h('div', { class: 'cb-sec pv-hires', 'data-pv-hires': '' }, h('b', {}, 'Your hirelings'),
            h('p', { class: 'hint' }, 'A hireling fights a creature unless you send it at a character. It is yours for this round only.'),
            ...model.hires.map(x => h('div', { class: 'placerow' }, h('span', {}, x.name),
                h('div', { class: 'seg3 wrap' },
                    h('button', { class: `segb${!c.hires[x.uid] ? ' on' : ''}`, 'data-hire': x.uid, 'data-at': '', onclick: () => { delete c.hires[x.uid]; render(); } }, 'A creature'),
                    ...model.targets.map(t => h('button', { class: `segb${c.hires[x.uid] === t.id ? ' on' : ''}`, 'data-hire': x.uid, 'data-at': t.id, onclick: () => { c.hires[x.uid] = t.id; render(); } }, `At ${t.player}`)))))));
    }
    if (model.peace && !charging) body.push(h('p', { class: 'hint pv-peace', 'data-pv-peace': '' }, 'No creature is here. If everyone says they mean no harm, the evening passes in peace; whoever does not, the fight is held, and nobody is bound by what they said.'));

    const needSure = charging && !!tgt.deal && !c.sure;
    const label = charging ? `Charge ${tgt.player}${sent.length ? ` and send ${joinList(sent.map(([u]) => `the ${hireName(u)}`))}` : ''}`
        : sent.length ? `Send ${joinList(sent.map(([u]) => `the ${hireName(u)}`))} at ${joinList([...new Set(sent.map(([, id]) => model.targets.find(t => t.id === id).player))])}` : 'Pass';
    const deploy = Object.fromEntries(sent);
    const chosen = charging || sent.length;
    const foot = h('div', { class: 'sf-foot' },
        chosen ? h('button', { class: 'btn', 'data-act': 'charge-clear', onclick: () => { c.target = null; c.hires = {}; c.sure = false; render(); } }, 'Pass instead')
            : peaceOk ? h('button', { class: 'btn', 'data-act': 'charge-peace', onclick: () => { ui.charge = null; ui.melee = null; act({ type: 'combat', kind: 'charge', act: 'peace' }); } }, 'I mean no harm') : null,
        h('button', { class: 'btn primary big', 'data-act': chosen ? 'charge-go' : 'charge-pass', disabled: needSure || null, onclick: () => {
            const a = charging ? { type: 'combat', kind: 'charge', act: 'charge', target: tgt.id, chit: c.chit, deploy } : { type: 'combat', kind: 'charge', act: 'pass', deploy };
            ui.charge = null; ui.melee = null; act(a);
        } }, label));
    return { body, foot };
}

// ---- the MELEE step: whom to strike ----
/** What a play at this target needs the player to confirm first (or null): his own native hireling (treachery, 8.4.2g), a character he made a deal with today. */
export function needsConfirm(st, data, t) {
    if (!t) return null;
    if (t.kind === 'hire' && t.treachery) {
        const cost = treacheryCost(st, data, t.id, st.ch.id);
        return { key: 'treachery', title: 'This is treachery', text: `${t.name} is in your pay. Naming them as your target makes ${cost.count > 1 ? `the whole ${cost.group} under your hire` : 'them'} turn on you, wherever they are${cost.fame ? `, and you lose ${cost.fame} Fame` : ''}. They fight you from then on.`, label: `I mean it: strike my own ${t.name}` };
    }
    if (t.kind === 'character') {
        const deal = dealWith(st, st.ch.id, t.id);
        if (deal) return { key: 'deal', title: 'You gave your word', text: `${deal} Striking ${pname(st, t.id)} turns on someone you dealt with, and the whole table sees it.`, label: `I know. Strike ${pname(st, t.id)} anyway` };
    }
    return null;
}
/** The target section of the Melee step when characters or hirelings are among the targets: the creatures as buttons (as before), then characters as cards, other players' hirelings, and the
 * confirm before treachery. `m` is the melee plan in `ui.melee`; `shared.fight` the fight. Returns the elements that follow "Who do you strike?". */
export function meleeTargets({ st, data, o, m, shared, render, denName }) {
    const f = shared.fight, chars = o.targets.filter(t => t.kind === 'character'), hires = o.targets.filter(t => t.kind === 'hire'), others = hires.filter(t => !t.own), own = hires.filter(t => t.own);
    const creatures = o.targets.filter(t => t.kind !== 'character' && t.kind !== 'hire');
    const charged = st.combat?.charge?.on ? f.members.find(x => x.id === st.combat.charge.on) : null;
    const pick = uid => { if (m.target !== uid) { m.target = uid; m.sure = null; } render(); };
    const out = [];
    if (charged) out.push(h('p', { class: 'hint', 'data-pv-charged': '' }, `You charged ${charged.player}: no one else may be your target this round.`));
    out.push(h('div', { class: 'seg3 wrap' }, h('button', { class: `segb${m.target == null ? ' on' : ''}`, onclick: () => { m.target = null; m.sure = null; render(); } }, 'No one'),
        ...creatures.map(d => denName(d, h, m, render))));
    if (chars.length) {
        out.push(h('small', { class: 'sf-sub pv-sub' }, chars.length === 1 ? 'Character' : 'Characters'),
            h('div', { class: 'pv-foes', role: 'radiogroup', 'aria-label': 'Characters you may strike', 'data-pv-targets': '' },
                ...chars.map(t => foeCard({ facts: { ...foeFacts(st, data, t.id), hidden: t.hidden, deal: dealWith(st, st.ch.id, t.id) }, person: personOf(f, t.id), on: m.target === t.uid, data: { 'data-target': t.uid }, onclick: () => pick(t.uid) }))));
    }
    if (others.length) {
        out.push(h('small', { class: 'sf-sub pv-sub' }, 'Hirelings of other players'),
            h('div', { class: 'pv-foes', 'data-pv-hires': '' }, ...others.map(t => h('button', { class: `pv-foe hire${m.target === t.uid ? ' on' : ''}`, role: 'radio', 'aria-checked': m.target === t.uid ? 'true' : 'false', 'data-target': t.uid, onclick: () => pick(t.uid) },
                counterIcon({ ...(personOf(f, t.owner) ?? { shape: 'circle', color: '#6fae8a', letter: '?' }), mine: false }, 36),
                h('span', { class: 'pv-ftext' }, h('b', {}, targetName(st, data, t.uid) ?? t.name), h('small', { class: 'pv-nums' }, 'A hireling: no maneuver; a die gives the lane it strikes in')),
                h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, m.target === t.uid ? '✓' : '+')))));
    }
    if (own.length) {
        out.push(h('details', { class: 'pv-own', 'data-pv-own': '', open: own.some(t => t.uid === m.target) || null }, h('summary', {}, 'Your own hirelings: treachery'),
            h('div', { class: 'pv-foes' }, ...own.map(t => h('button', { class: `pv-foe hire warn${m.target === t.uid ? ' on' : ''}`, role: 'radio', 'aria-checked': m.target === t.uid ? 'true' : 'false', 'data-target': t.uid, onclick: () => pick(t.uid) },
                h('span', { class: 'pv-ftext' }, h('b', {}, `Your ${t.name}`), h('small', { class: 'pv-deal' }, 'Striking your own hireling is treachery.')),
                h('span', { class: 'sf-tick', 'aria-hidden': 'true' }, m.target === t.uid ? '✓' : '+'))))));
    }
    const sel = o.targets.find(t => t.uid === m.target), need = needsConfirm(st, data, sel);
    if (need) out.push(confirmBox({ ...need, on: m.sure === m.target, ontoggle: () => { m.sure = m.sure === m.target ? null : m.target; render(); } }));
    if (sel?.kind === 'character' || sel?.kind === 'hire') {
        out.push(h('p', { class: 'hint pv-judge', 'data-pv-judge': '' }, sel.kind === 'hire'
            ? 'A hireling has no maneuver, so your blow lands if it reaches the lane a die gives it (the dice are rolled when the plays are shown).'
            : `Your blow is judged against the maneuver ${pname(st, sel.id)} plays: it lands if it is faster than that maneuver, or goes the way it faces (Thrust meets Charge, Swing meets Dodge, Smash meets Duck), or ${pname(st, sel.id)} plays none. Their play is sealed too.`));
        if (st.ch.hidden) out.push(h('p', { class: 'hint' }, 'You are hidden: striking gives you away.'));
        if (sel.hidden) out.push(h('p', { class: 'hint' }, `${pname(st, sel.id)} is hidden and you found them: naming them reveals them.`));
    }
    return { els: out, blocked: !!need && m.sure !== m.target };
}

// ---- the death callout ----
/** The big callout for a character who has fallen. `k` is a kill (pvp.js); `viewerId` the viewer's character. Nothing here is quieter than the rest of the screen on purpose. */
export function deathCallout({ st, f, k, viewerId, round = null, compact = false, next: nextText = null }) {
    const v = k.victim, mineV = v.id === viewerId, killers = k.killers ?? [], mineK = killers.some(x => x.id === viewerId);
    const killerP = joinList(killers.map(x => x.player)), killerBoth = joinList(killers.map(x => `${x.player}’s ${x.character}`));
    const who = mineV ? 'You have fallen.' : `${v.player}’s ${v.character} has fallen.`;
    const by = !killers.length ? (k.killerName ? `Struck down by ${k.creature ? `the ${k.killerName}` : k.killerName}.` : 'Struck down.')
        : mineV ? `${killerBoth}${k.hired ? '’s hireling' : ''} struck you down${round ? ` in round ${round}` : ''}.`
            : mineK ? `You struck down ${v.player}’s ${v.character}${round ? ` in round ${round}` : ''}.`
                : `${killerBoth}${k.hired ? '’s hireling' : ''} struck them down${round ? ` in round ${round}` : ''}.`;
    const sp = spoilsText(k, { victim: mineV });
    const takes = sp === 'nothing' ? null : mineK ? `You take ${sp}.` : mineV ? `${killerP} takes ${sp.replace('their belongings', 'your belongings')}.` : `${killerP} takes ${sp}.`;
    let next = mineV ? 'You return at the next Birdsong, with a new character and new goals. Your Fame is lost with this one.' : `${v.player} returns at the next Birdsong, with a new character.`;
    if (nextText) next = nextText;
    const chips = mineK || (!mineV && killers.length) ? [['Notoriety', k.notoriety], ['gold', k.gold]].filter(([, n]) => n).map(([n, val]) => h('span', { class: `gain-chip ${n.toLowerCase()}` }, `${mineK ? '+' : ''}${val} ${n}`)) : [];
    return h('div', { class: `pv-death${mineV ? ' me' : ''}${compact ? ' compact' : ''}`, role: 'alert', 'data-death': v.id, 'data-victim': v.id },
        h('div', { class: 'pv-dhead' }, v.person ? counterIcon({ ...v.person, dead: true, hidden: false, mine: false }, 46) : null,
            h('span', { class: 'pv-dtitle' }, h('small', {}, 'A character has fallen'), h('b', {}, who))),
        h('p', { class: 'pv-dby' }, nb(by)),
        takes ? h('p', { class: 'pv-dtake' }, nb(takes)) : null,
        chips.length ? h('div', { class: 'gain-chips' }, ...chips) : null,
        compact ? null : h('p', { class: 'pv-dnext' }, next));
}

// ---- the reveal between characters ----
/** The chips of one character's result in a round that had characters in it. */
export function pvpChips({ m, facts, rd, f }) {
    const chips = [], kill = rd.kills.find(k => k.victim === m.id ? false : k.killers.some(x => x.id === m.id)), mineKills = rd.kills.filter(k => k.killers.some(x => x.id === m.id));
    const fell = rd.kills.find(k => k.victim.id === m.id);
    if (fell) chips.push(h('span', { class: 'sf-chip fell', 'data-fell': '' }, nb(`Struck down by ${joinList((fell.killers.length ? fell.killers.map(x => x.player) : [fell.killerName ?? 'a blow']))}`)));
    else if (facts.died) chips.push(h('span', { class: 'sf-chip fell', 'data-fell': '' }, nb(facts.died.by ? `Fell to the ${facts.died.by}` : 'Has fallen')));
    for (const k of mineKills) chips.push(h('span', { class: 'sf-chip kill' }, nb(`Struck down ${k.victim.character}`)));
    for (const k of facts.kills) chips.push(h('span', { class: 'sf-chip kill' }, nb(`Killed the ${k.name}`)));
    const gain = { Notoriety: mineKills.reduce((a, k) => a + (k.notoriety || 0), 0) + facts.gain.notoriety, gold: mineKills.reduce((a, k) => a + (k.gold || 0), 0) + facts.gain.gold, Fame: facts.gain.fame };
    for (const [n, v] of [['Fame', gain.Fame], ['Notoriety', gain.Notoriety], ['gold', gain.gold]]) if (v) chips.push(h('span', { class: `gain-chip ${n.toLowerCase()}` }, `+${v} ${n}`));
    for (const k of mineKills) if (k.belongings) chips.push(h('span', { class: 'sf-chip' }, nb(k.items.length ? `Took ${k.items.length} belonging${k.items.length === 1 ? '' : 's'}` : 'Took their belongings')));
    const charged = f.members.find(x => x.id === m.charged);
    if (charged) chips.push(h('span', { class: 'sf-chip' }, nb(`Charged ${charged.player}`)));
    if (facts.wounds) chips.push(h('span', { class: 'sf-chip hurt' }, `${facts.wounds} wound${facts.wounds === 1 ? '' : 's'}`));
    for (const g of facts.gear) chips.push(h('span', { class: 'sf-chip hurt' }, nb(`${g.name} ${g.how}`)));
    if (facts.fled) chips.push(h('span', { class: 'sf-chip' }, 'Broke away'));
    if (!chips.length) chips.push(h('span', { class: 'sf-chip dim' }, facts.struck ? 'Hit, no kill' : 'Nothing struck, nothing taken'));
    return chips;
}

/** "How it went" for a round with characters in it: the order of blows, then each blow with what it did (Story), or every line (Detail, built by the caller). */
export function pvpHow({ view, f, report, rd, mineId }) {
    const story = isStory();
    const out = [];
    const orderT = report.order ? (story ? (report.order.s ?? report.order.t) : report.order.t) : null;
    if (orderT) out.push(h('p', { class: 'sf-order' }, nb(orderT)));
    if (report.sameInstant) out.push(h('p', { class: 'sf-order' }, nb(story ? (report.sameInstant.s ?? report.sameInstant.t) : report.sameInstant.t)));
    if (story) {
        const blows = inOrder(rd.blows, report.order);
        out.push(h('ol', { class: 'pv-blows', 'data-pv-blows': '' }, ...blows.map(b => h('li', { class: `pv-blow${b.slain ? ' slain' : b.wound || b.gear?.fate ? ' hurt' : ''}`, 'data-blow': '' }, nb(blowStory(view, b))))));
        const misses = rd.charSwings.filter(s => s.result === 'miss');
        for (const s of misses) out.push(h('p', { class: 'sf-told pv-miss' }, nb(missStory(s))));
    }
    return out;
}
export { pvpHeadline };
