// The screens of CHARACTER AGAINST CHARACTER (docs/design/multiplayer-pvpui.md), builders only. Behind the lobby switch `pvp`: with it off no step here is asked for and nothing here is built.
//   charge      8.3.6: "Do you attack someone?" The characters in the fight as targets (what the rules let you know of each), the Move chit that makes the charge, Pass, Peace
//   targets     the Melee step: characters and other players' hirelings beside the creatures, a confirm before treachery
//   death       the big callout for a character who has fallen: who struck him down, what was taken, what happens next
//   reveal      the round between characters: result first, who went for whom, the order of blows, blow by blow
import { h } from '../dom.js';
import { btn, primary } from '../ds.js';
import { icon } from '../icons.js';
import { fixNames } from '../names.js';
import { isStory } from '../voice.js';
import { lineFor } from '../storyvoice.js';
import { askBox, gainChip, pcEl } from '../shared_ui.js';
import { joinList } from '../fight.js';
import { foeCard, confirmBox, needsConfirm } from '../combat/shared.js';
import { chargeModel, spoilsText, blowStory, missStory, inOrder, pvpHeadline } from '../pvp.js';

const nb = s => fixNames(String(s)).replace(/ (?=\d)/g, '\u00A0');          // (the spelling of a name is one thing everywhere: QA-125)
const personOf = (f, id) => f.members.find(m => m.id === id)?.person ?? null;
const tag = (text, cls = '', attrs = {}) => h('span', { class: `ds-tag sf-chip${cls ? ` ${cls}` : ''}`, ...attrs }, nb(text));
export { foeCard, confirmBox, needsConfirm };

// ---- the CHARGE step ----
const chitFace = c => `${c.strength}${c.time}`;
/** The charge question, as { body, foot, narr } for the scene of the shared fight (like the lure). `ui.charge` holds the choices of this round. */
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
        askBox(`Round ${p.round}: do you attack someone?`,
            canCharge ? 'A charge is your Encounter action. Everyone sees it made, the one charged may answer only with faster chits, and you may strike nobody else this round. Your secret play comes later.'
                : 'You cannot charge this round, but you may still name someone in the secret plays that follow, and send your hirelings.'),
        ...(f.charges ?? []).filter(x => x.on.mine).map(x => h('p', { class: 'ds-hint-line bad', 'data-pv-charged-me': x.by.id }, nb(`${x.by.player} has charged you: in the Encounter step only chits faster than their charge may answer.`))),
        news.length ? h('p', { class: 'ds-hint-line pv-news', 'data-pv-news': '' }, h('b', {}, 'Said so far.'), ' ', news.join(' ')) : null,
        model.hidden ? h('p', { class: 'ds-hint-line bad', 'data-sf-hidden-charge': '' }, 'You are hidden. Charging gives you away.') : null,
        h('div', { class: 'ds-list pv-foes', role: 'radiogroup', 'aria-label': 'Whom you may charge', 'data-pv-targets': '' },
            ...model.targets.map(t => foeCard({ facts: t, person: personOf(f, t.id), on: c.target === t.id, data: { 'data-target': t.id },
                onclick: () => { c.target = c.target === t.id ? null : t.id; c.sure = false; render(); } }))),
    ];
    // the Move chit that makes the charge, and why the others cannot. One plain sentence; the reasons, chit by chit, sit behind "Why?" (QA-130)
    if (canCharge || model.chits.rows.length) {
        const gate = model.chits.slowest < 99
            ? `A charge needs a Move chit strictly faster than everything holding you back (${model.chits.gateText ?? `time ${model.chits.slowest}`}), and strong enough to carry all you own.`
            : 'A charge needs a Move chit strong enough to carry all you own; no creature is on your sheet to hold it back.';
        const no = model.chits.rows.filter(r => !r.ok), byWhy = new Map();
        for (const r of no) byWhy.set(r.why, [...(byWhy.get(r.why) ?? []), r.text]);          // (one line for every reason, not one bracket for every chit)
        const chargedBy = (f.charges ?? []).find(x => x.on.mine);
        const notYet = no.length ? h('p', { class: 'cb-hint pv-nochit', 'data-pv-nochit': '' }, `Not available: ${joinList([...byWhy].map(([w, list]) => `${joinList(list)} (${w})`))}.`) : null;
        // (a charge that can be made says its gate in the open; one that cannot keeps the gate and the list behind "Why?")
        const why = canCharge ? (notYet ? h('details', { class: 'pv-why', 'data-pv-why': '' }, h('summary', {}, h('b', {}, 'The other chits'), icon('down')), notYet) : null)
            : h('details', { class: 'pv-why', 'data-pv-why': '' }, h('summary', {}, h('b', {}, 'Why?'), icon('down')), h('p', { class: 'cb-hint' }, gate), notYet);
        body.push(h('div', { class: 'pv-chits', 'data-pv-chits': '' },
            canCharge ? h('span', { class: 'ds-eyebrow' }, tgt ? `Charge ${tgt.player} with` : 'The Move chit that would carry a charge')
                : h('p', { class: 'pv-nocharge' }, chargedBy ? `None of your Move chits is faster than ${chargedBy.by.player}’s charge.` : 'None of your Move chits can make a charge.'),
            canCharge ? h('p', { class: 'cb-hint' }, gate) : null,
            canCharge ? h('div', { class: 'cb-chits', 'data-scope': '' }, ...usable.map(r => h('button', { type: 'button', class: `ds-chit move${c.chit === r.id ? ' sel' : ''}`, 'data-chit': r.id, 'aria-pressed': c.chit === r.id ? 'true' : 'false', onclick: () => { c.chit = r.id; render(); } },
                h('span', {}, chitFace(r.chit)), h('small', {}, '*'.repeat(r.chit.effort ?? 0) || 'MOVE')))) : null,
            why));
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
        body.push(h('ul', { class: 'pv-means cb-hint', 'data-pv-means': '' }, ...lines.map(t => h('li', {}, nb(t)))));
        if (tgt.deal) body.push(confirmBox({ key: 'deal', title: 'You gave your word', text: `${tgt.deal} Charging ${tgt.player} turns on someone you dealt with, and the whole table sees it.`, label: `I know. Charge ${tgt.player} anyway`, on: c.sure, ontoggle: () => { c.sure = !c.sure; render(); } }));
    }
    // hirelings: at a creature (as usual) or at a character
    if (model.hires.length) {
        body.push(h('div', { class: 'pv-hires', 'data-pv-hires': '' }, h('span', { class: 'ds-eyebrow' }, 'Your hirelings'),
            h('p', { class: 'cb-hint' }, 'A hireling fights a creature unless you send it at a character. It is yours for this round only.'),
            ...model.hires.map(x => h('div', { class: 'placerow pv-hire' }, h('b', {}, x.name),
                h('div', { class: 'ds-seg' },
                    h('button', { type: 'button', class: !c.hires[x.uid] ? 'on' : null, 'data-hire': x.uid, 'data-at': '', onclick: () => { delete c.hires[x.uid]; render(); } }, 'A creature'),
                    ...model.targets.map(t => h('button', { type: 'button', class: c.hires[x.uid] === t.id ? 'on' : null, 'data-hire': x.uid, 'data-at': t.id, onclick: () => { c.hires[x.uid] = t.id; render(); } }, `At ${t.player}`)))))));
    }
    if (model.peace && !charging) body.push(h('p', { class: 'cb-hint pv-peace', 'data-pv-peace': '' }, 'No creature is here. If everyone says they mean no harm, the evening passes in peace; whoever does not, the fight is held, and nobody is bound by what they said.'));

    const needSure = charging && !!tgt.deal && !c.sure;
    const label = charging ? `Charge ${tgt.player}${sent.length ? ` and send ${joinList(sent.map(([u]) => `the ${hireName(u)}`))}` : ''}`
        : sent.length ? `Send ${joinList(sent.map(([u]) => `the ${hireName(u)}`))} at ${joinList([...new Set(sent.map(([, id]) => model.targets.find(t => t.id === id).player))])}` : 'Pass';
    const deploy = Object.fromEntries(sent);
    const chosen = charging || sent.length;
    const lead = chosen ? btn('Pass instead', 'quiet', { 'data-act': 'charge-clear', onclick: () => { c.target = null; c.hires = {}; c.sure = false; render(); } })
        : peaceOk ? btn('I mean no harm', 'quiet', { 'data-act': 'charge-peace', onclick: () => { ui.charge = null; ui.melee = null; act({ type: 'combat', kind: 'charge', act: 'peace' }); } }) : null;
    const go = primary(label, { 'data-act': chosen ? 'charge-go' : 'charge-pass', disabled: needSure || null, onclick: () => {
        const a = charging ? { type: 'combat', kind: 'charge', act: 'charge', target: tgt.id, chit: c.chit, deploy } : { type: 'combat', kind: 'charge', act: 'pass', deploy };
        ui.charge = null; ui.melee = null; act(a);
    } });
    const foot = h('div', { class: 'ds-actions' }, lead ? h('div', { class: 'lead' }, lead) : null, go);
    return { body, foot, narr: charging ? `You will charge ${tgt.player}.` : 'Will anyone draw steel on another?' };
}

// ---- the death callout ----
/** The big callout for a character who has fallen. `k` is a kill (pvp.js); `viewerId` the viewer's character. Nothing here is quieter than the rest of the screen on purpose. */
export function deathCallout({ st, f, k, viewerId, round = null, compact = false, bare = false, next: nextText = null }) {
    const v = k.victim, mineV = v.id === viewerId, killers = k.killers ?? [], mineK = killers.some(x => x.id === viewerId);
    const killerP = joinList(killers.map(x => x.player)), killerBoth = joinList(killers.map(x => `${x.player}’s ${x.character}`));
    const who = mineV ? 'You have fallen.' : fixNames(`${v.player}’s ${v.character} has fallen.`);
    const by = !killers.length ? (k.killerName ? `Struck down by ${k.creature ? `the ${k.killerName}` : k.killerName}.` : 'Struck down.')
        : mineV ? `${killerBoth}${k.hired ? '’s hireling' : ''} struck you down${round ? ` in round ${round}` : ''}.`
            : mineK ? `You struck down ${v.player}’s ${v.character}${round ? ` in round ${round}` : ''}.`
                : `${killerBoth}${k.hired ? '’s hireling' : ''} struck them down${round ? ` in round ${round}` : ''}.`;
    const sp = spoilsText(k, { victim: mineV });
    const takes = sp === 'nothing' ? null : mineK ? `You take ${sp}.` : mineV ? `${killerP} takes ${sp.replace('their belongings', 'your belongings')}.` : `${killerP} takes ${sp}.`;
    let next = mineV ? 'You return at the next Birdsong, with a new character and new goals. Your Fame is lost with this one.' : `${v.player} returns at the next Birdsong, with a new character.`;
    if (nextText) next = nextText;
    const chips = mineK || (!mineV && killers.length) ? [['notor', k.notoriety], ['gold', k.gold]].filter(([, n]) => n).map(([n, val]) => gainChip(n, val, mineK)) : [];
    return h('div', { class: `sf-death pv-death${mineV ? ' me' : ''}${compact ? ' compact' : ''}${bare ? ' bare' : ''}`, role: 'alert', 'data-death': v.id, 'data-victim': v.id },
        // `bare`: the sheet that holds the callout is already titled "You have fallen": no second heading, just the cause, what was taken and what comes next (QA-106)
        bare ? null : h('div', { class: 'pv-dhead' }, v.person ? pcEl({ ...v.person, dead: true }, { size: 40 }) : null,
            h('span', { class: 'pv-dtitle' }, h('small', {}, 'A character has fallen'), h('b', {}, who))),
        h('p', { class: 'dwho pv-dby' }, nb(by)),
        takes ? h('p', { class: 'pv-dtake' }, nb(takes)) : null,
        chips.length ? h('div', { class: 'gain-chips' }, ...chips) : null,
        compact ? null : h('p', { class: 'pv-dnext' }, next));
}

// ---- the reveal between characters ----
/** The chips of one character's result in a round that had characters in it. */
export function pvpChips({ m, facts, rd, f }) {
    const chips = [], mineKills = rd.kills.filter(k => k.killers.some(x => x.id === m.id));
    const fell = rd.kills.find(k => k.victim.id === m.id);
    if (fell) chips.push(tag(`Struck down by ${joinList((fell.killers.length ? fell.killers.map(x => x.player) : [fell.killerName ?? 'a blow']))}`, 'bad fell', { 'data-fell': '' }));
    else if (facts.died) chips.push(tag(facts.died.by ? `Fell to the ${facts.died.by}` : 'Has fallen', 'bad fell', { 'data-fell': '' }));
    for (const k of mineKills) chips.push(tag(`Struck down ${k.victim.character}`, 'good kill'));
    for (const k of facts.kills) chips.push(tag(`Killed the ${k.name}`, 'good kill'));
    const gain = { notor: mineKills.reduce((a, k) => a + (k.notoriety || 0), 0) + facts.gain.notoriety, gold: mineKills.reduce((a, k) => a + (k.gold || 0), 0) + facts.gain.gold, fame: facts.gain.fame };
    for (const n of ['fame', 'notor', 'gold']) if (gain[n]) chips.push(gainChip(n, gain[n]));
    for (const k of mineKills) if (k.belongings) chips.push(tag(k.items.length ? `Took ${k.items.length} belonging${k.items.length === 1 ? '' : 's'}` : 'Took their belongings'));
    const charged = f.members.find(x => x.id === m.charged);
    if (charged) chips.push(tag(`Charged ${charged.player}`));
    if (facts.wounds) chips.push(tag(`${facts.wounds} wound${facts.wounds === 1 ? '' : 's'}`, 'bad hurt'));
    for (const g of facts.gear) chips.push(tag(`${g.name} ${g.how}`, 'bad hurt'));
    if (facts.fled) chips.push(tag('Broke away'));
    if (!chips.length) chips.push(tag(facts.struck ? 'Hit, no kill' : 'Nothing struck, nothing taken', 'dim'));
    return chips;
}

/** "How it went" for a round with characters in it: the order of blows, then each blow with what it did (Story), or every line (Detail, built by the caller). */
export function pvpHow({ view, f, report, rd, mineId }) {
    const story = isStory();
    const out = [];
    const orderT = report.order ? (story ? lineFor(report.order, 'story') : report.order.t) : null;
    if (orderT) out.push(h('p', { class: 'sf-order' }, nb(orderT)));
    if (report.sameInstant) out.push(h('p', { class: 'sf-order' }, nb(story ? lineFor(report.sameInstant, 'story') : report.sameInstant.t)));
    if (story) {
        const blows = inOrder(rd.blows, report.order);
        out.push(h('ol', { class: 'pv-blows', 'data-pv-blows': '' }, ...blows.map(b => h('li', { class: `pv-blow${b.slain ? ' slain' : b.wound || b.gear?.fate ? ' hurt' : ''}`, 'data-blow': '' }, nb(blowStory(view, b))))));
        const misses = rd.charSwings.filter(s => s.result === 'miss');
        for (const s of misses) out.push(h('p', { class: 'sf-told pv-miss' }, nb(missStory(s))));
    }
    return out;
}
export { pvpHeadline };
