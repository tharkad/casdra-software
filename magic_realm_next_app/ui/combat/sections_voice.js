// combat/sections_voice.js: the Story voice for the lines the engine writes when hirelings fight on Melee Sections (app/engine/hirefight.js), and the one-breath account of a round's hirelings for the verdict.
// storyvoice.js adds SECTION_RULES to its own rules (a pattern on the line without its "Phase N:" prefix and a builder returning a sentence or a list of variants); Detail is always the engine's own line.
// Story is plain and short (docs/design/DESIGN-TASTE.md section 5): no numbers, no rule numbers, no dice digits. Pure functions of the text; no DOM.
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const noHash = s => String(s).replace(/ #\d+/g, '');
const list = a => (a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const names = s => String(s).split(/,\s*/).map(noHash).filter(Boolean);
const the = n => (/^(?:The |the )/.test(n) ? n : `the ${n}`);
const LANE = { Thrust: 'thrust', Swing: 'swing', Smash: 'smash' }, VERB = { Thrust: 'thrusts', Swing: 'swings', Smash: 'smashes' };

export const SECTION_RULES = [
    // ---- luring and deployment (8.3.4c, 8.3.5, 8.3.6a)
    [/^(.+?) lures the (.+?) onto a Melee Section of his own\.?$/, m => [`${cap(noHash(m[1]))} draws the ${noHash(m[2])} onto himself.`, `${cap(noHash(m[1]))} calls out the ${noHash(m[2])}, and it comes for him.`]],
    [/^(.+?) gives himself away by luring/, m => `${cap(noHash(m[1]))} is seen: he has given himself away.`],
    [/^You lure the creatures onto your sheet and give yourself away/, () => 'You draw the creatures to you, and they see you.'],
    [/^The (.+?) is set on (.+?)\.?$/, m => [`The ${noHash(m[1])} turns on ${noHash(m[2])}.`, `The ${noHash(m[1])} goes for ${noHash(m[2])}.`]],
    [/^(.+?) stays out of the fight this round\.?$/, m => `${cap(noHash(m[1]))} holds back this round.`],
    [/^The (.+?) is attacked by (.+?): it leaves the section it was on and is the defender on one of its own\.?$/, m => `${cap(noHash(m[2]))} goes at the ${noHash(m[1])}, and it turns from what it was fighting to face him.`],
    [/^(.+?) is sent at the (.+?)\.?$/, m => [`${cap(noHash(m[1]))} goes in against the ${noHash(m[2])}.`, `${cap(noHash(m[1]))} is sent at the ${noHash(m[2])}.`]],
    [/^(.+?), alone on his section, moves onto the (.+?)'s as its newest attacker/, m => `${cap(noHash(m[1]))}, left on his own, joins the fight against the ${noHash(m[2])}.`],
    // ---- the sections of the round
    [/^(.+?)'s section: (.+?) attacks? (him|it)(?:; (?:he|it) attacks (.+?))?\.?$/, m => {
        const who = names(m[2]), many = who.length > 1, back = m[4] ? noHash(m[4]) : null, owner = noHash(m[1]);
        return m[3] === 'him'
            ? `${cap(list(who))} ${many ? 'come' : 'comes'} at ${owner}${back ? `, who strikes back at ${back}` : ''}.`
            : `${cap(list(who))} ${many ? 'go' : 'goes'} at the ${owner}${back ? `, which strikes at ${back}` : ''}.`;
    }],
    [/^(.+?) (Charge|Dodge|Duck|Thrust|Swing|Smash) → (Charge|Dodge|Duck|Thrust|Swing|Smash)\.?$/, m => `${cap(noHash(m[1]))} shifts from ${m[2]} to ${m[3]}.`],
    [/^Tactics change on the section \(.+?; rolled [\d+]+\): (.+?) switch(?:es)? sides\.?$/, m => { const who = names(m[1]); return who.length > 1 ? `${cap(list(who))} change tactics and show their other sides.` : `${cap(who[0])} changes tactics and shows its other side.`; }],
    // ---- the blows (8.4.8)
    [/^(.+?): (Thrust|Swing|Smash) at (.+?) \((?:Charge|Dodge|Duck)(, on the horse)?\): miss\.?$/, m => [`${cap(noHash(m[1]))}'s ${LANE[m[2]]} goes wide of ${noHash(m[3])}.`, `${cap(noHash(m[1]))} ${VERB[m[2]]} at ${noHash(m[3])} and finds only air.`]],
    [/^(.+?): (Thrust|Swing|Smash) at (.+?) \((?:Charge|Dodge|Duck)(, on the horse)?\): hit by undercutting\.?$/, m => `${cap(noHash(m[1]))}'s ${LANE[m[2]]} gets under the guard of ${noHash(m[3])}.`],
    [/^(.+?): (Thrust|Swing|Smash) at (.+?) \((?:Charge|Dodge|Duck)(, on the horse)?\): hit\.?$/, m => `${cap(noHash(m[1]))}'s ${LANE[m[2]]} lands on ${noHash(m[3])}.`],
    [/^(.+?) cannot attack on this side\.?$/, m => `${cap(noHash(m[1]))} has no attack on the side that shows.`],
    [/^(.+?) is no longer your hireling: his blow is cancelled/, m => `${cap(noHash(m[1]))} is no longer yours, so his blow comes to nothing.`],
    [/^(.+?) is dead before its blow can land\.?$/, m => `${cap(noHash(m[1]))} falls before its blow can land.`],
    [/^(.+?)'s blow at (.+?) is cancelled: he is no longer your hireling/, m => `${cap(noHash(m[1]))}'s blow at ${noHash(m[2])} is called off: he is no longer yours.`],
    [/^(.+?)'s blow finds (.+?) already dead\.?$/, m => `${cap(noHash(m[1]))}'s blow finds ${noHash(m[2])} already fallen.`],
    // ---- a horse takes the blow (8.4.9i)
    [/^The (.+?) strikes down (.+?)'s (.+?)\.?$/, m => `The ${noHash(m[1])} brings down ${noHash(m[2])}'s ${m[3].toLowerCase()}.`],
    [/^(.+?) strikes down the (.+?)'s (.+?)\.?$/, m => `${cap(noHash(m[1]))} brings down the ${noHash(m[2])}'s ${m[3].toLowerCase()}.`],
    [/^The (.+?) hits (.+?)'s (.+?) but does not kill it\.?$/, m => `The ${noHash(m[1])} wounds ${noHash(m[2])}'s ${m[3].toLowerCase()}, but it stands.`],
    [/^(.+?) hits the (.+?)'s (.+?) but does not kill it\.?$/, m => `${cap(noHash(m[1]))} wounds the ${noHash(m[2])}'s ${m[3].toLowerCase()}, but it stands.`],
];

// Is this log line one of the section lines (so the Record can tell it in Story)? Tested on the line without a "Phase N:" prefix and without leading spaces.
export const isSectionLine = t => {
    const b = String(t ?? '').replace(/^Phase \d+: /, '').trim();
    return SECTION_RULES.some(([re]) => re.test(b));
};
export const sectionStory = (t, pick = a => a[0]) => {
    const b = String(t ?? '').replace(/^Phase \d+: /, '').trim();
    for (const [re, fn] of SECTION_RULES) { const m = re.exec(b); if (m) { const out = fn(m); return Array.isArray(out) ? pick(out) : out; } }
    return null;
};

// ---- the round's hirelings in a breath, for the verdict (events: the lines of the round) ----
// -> { story, detail } or null when no hireling took part. Story names who fell and who struck down what; Detail adds how many blows hit and which counters turned over.
export function hireRound(events) {
    const L = (events ?? []).map(e => String(e).trim());
    const blow = /^(.+?): (?:Thrust|Swing|Smash) at (.+?) \((?:Charge|Dodge|Duck)(?:, on the horse)?\): (hit by undercutting|hit|miss)\.$/;
    const blows = L.map(l => blow.exec(l)).filter(Boolean);
    if (!blows.length && !L.some(l => / section: /.test(l))) return null;
    const hits = blows.filter(b => b[3] !== 'miss'), under = blows.filter(b => b[3] === 'hit by undercutting').length;
    const killed = L.map(l => /^(.+?) kills the (.+?) for you\.$/.exec(l)).filter(Boolean).map(x => ({ by: noHash(x[1]), who: noHash(x[2]) }));
    const fallen = L.map(l => /^The (.+?) kills (.+?); you lose \d+ Notoriety\.$/.exec(l)).filter(Boolean).map(x => ({ by: noHash(x[1]), who: noHash(x[2]) }));
    const horses = [...L.map(l => /^The (.+?) strikes down (.+?)'s (.+?)\.$/.exec(l)).filter(Boolean).map(x => `${noHash(x[2])}'s ${x[3].toLowerCase()}`), ...L.map(l => /^(.+?) strikes down the (.+?)'s (.+?)\.$/.exec(l)).filter(Boolean).map(x => `the ${noHash(x[2])}'s ${x[3].toLowerCase()}`)];
    const turned = L.map(l => /^Tactics change on the section \(.+?\): (.+?) switch(?:es)? sides\.$/.exec(l)).filter(Boolean).flatMap(x => names(x[1]));
    const said = [];
    for (const k of killed) said.push(`${k.by} cut down the ${k.who}.`);
    for (const f of fallen) said.push(`The ${f.by} cut down ${f.who}.`);
    for (const hz of horses) said.push(`${cap(hz)} fell.`);
    if (!said.length) said.push(hits.length ? 'Your hirelings traded blows, and nothing fell.' : 'The blows on your hirelings’ sections found only air.');
    const detail = `Sections: ${hits.length} of ${blows.length} blows ${hits.length === 1 ? 'hit' : 'hit'}${under ? `, ${under} by undercutting` : ''} (8.4.8).${turned.length ? ` Turned over by Tactics: ${list(turned)} (8.4.6d).` : ''}`;
    return { story: said.join(' '), detail: `${said.join(' ')} ${detail}` };
}

// ---- the dice of a section (8.4.6d): a Repositioning roll moves the counters of one place among its three lanes, a Tactics roll (a 6 on either die) turns some over ----
// -> { title, line } for the dice tray, or null when this roll is not one of a section's
export function sectionRoll(what, res = '') {
    let m;
    const moved = /shuffle/.test(res), turned = /switch sides/.test(res);
    if ((m = /^Repositioning roll \(target on (.+?)'s section\)$/.exec(what))) return { title: 'The one it strikes', line: moved ? 'The counter it strikes at shifts to another lane.' : 'It holds its lane.' };
    if ((m = /^Repositioning roll \(attackers on (.+?)'s section\)$/.exec(what))) return { title: 'The attackers', line: moved ? 'The attackers circle and trade lanes.' : 'The attackers hold their lanes.' };
    if ((m = /^Repositioning roll \((.+?)'s section\)$/.exec(what))) return { title: noHash(m[1]), line: moved ? `${cap(noHash(m[1]))} shifts its stance.` : `${cap(noHash(m[1]))} holds its ground.` };
    if ((m = /^Tactics roll \((its box|the target|the attackers), (Charge|Dodge|Duck)\)$/.exec(what))) return { title: m[1] === 'its box' ? 'Its stance' : m[1] === 'the target' ? 'The one it strikes' : 'The attackers', line: turned ? 'A snarl, a twist: they change their stance.' : 'They hold their stance.' };
    return null;
}
