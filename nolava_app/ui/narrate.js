// narrate.js: a round of combat, and a roll, told in a few sentences. Moved out of the engine (app/engine/story.js, CONTRACT section 6 step 3): they read the sentences the engine writes, not its state, so they are
// the voice layer's, and the engine no longer carries them. The words are unchanged.
const num = n => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] ?? String(n);

// ---- a round of combat told in a few sentences (the full lines stay behind it, step by step) ----
export function roundSynopsis(events) {
    const L = (events ?? []).map(e => String(e).trim()).filter(Boolean);
    if (!L.length) return '';
    const m = (re, from = L) => from.map(l => re.exec(l)).filter(Boolean);
    const strikeRe = /^(?:The |the )?(.+?)(?:'s) (?:thrust|swing|smash|bite|club|claw|blow|sting|attack|strike)s? (glances off|thuds against|bites into|hammers|crashes down on) /i;
    const lines = {
        killed: m(/^Your (.+?) (?:cleaves|strikes down|cuts down|brings down|drops) the (.+?), which /),
        felled: m(/ (?:dies|falls|is slain|is struck down)\b/i),
        found: m(/^Your (?:.+? (?:thrusts|swings|smashes down)|arrow flies|bolt flies|stone flies) at the (.+?) and finds it there/),
        quicker: m(/^The (.+?) twists into .+?, but your .+? is quicker/),
        missed: m(/^Your (?:.+? (?:thrusts|swings|smashes down)|arrow flies|bolt flies|stone flies) at empty air: the (.+?) is in /),
        tough: m(/^Your (.+?) (?:bites|strikes) the (.+?), but harm (\w) cannot fell it \(vulnerability (\w)\)(; the shot (?:lost its sting|bit deeper than it looked))?/),
        spell: m(/^(?:You cast|Your (?:Stones Fly|Fiery Blast|Lightning Bolt|Make Whole)|.+?: .*(?:hit|hits|miss)\b)/),
        landed: m(strikeRe),
        avoided: m(/ misses: your .+? carries you clear/),
        destroyed: m(/^Your (.+?) is destroyed/),
        damaged: m(/^Your (.+?) (?:is dented and damaged|takes the blow and is damaged)/),
        wounds: m(/^(?:The blow gets through: a wound|You are wounded)\b/),
        ran: m(/You break away and flee/),
        ended: m(/(?:fighting dies down|draw back|The last foe falls|Nothing hostile is left)/),
    };
    const out = [];
    // what you did
    if (lines.ran.length) out.push('You broke away and fled.');
    else if (lines.killed.length) {
        const [, how, who] = lines.killed[0], shot = ['arrow', 'bolt', 'stone'].includes(how);
        out.push(`${shot ? `Your ${how} brought down` : 'You cut down'} the ${who}${lines.killed.length > 1 ? ` and ${num(lines.killed.length - 1)} more` : ''}.`);
    } else if (lines.tough.length) {
        // it was hit, and that was not enough: say with what, how hard, and what it takes
        const [, how, who, harm, need, sting] = lines.tough[0], shot = ['arrow', 'bolt', 'stone'].includes(how);
        const WORD = { N: 'Negligible', L: 'Light', M: 'Medium', H: 'Heavy', T: 'Tremendous' };
        out.push(`${shot ? `Your ${how} struck` : 'Your blow bit'} the ${who}, but ${WORD[harm] ?? harm} harm was not enough: it takes ${WORD[need] ?? need} to bring it down${sting ? (/lost/.test(sting) ? ', and the shot lost its sting on the way' : ', though the shot bit deeper than it looked') : ''}.`);
    } else if (lines.found.length || lines.quicker.length) out.push(`Your ${lines.found.length && /^Your (arrow|bolt|stone)/.test(L.find(l => /finds it there/.test(l)) ?? '') ? 'shot' : 'blow'} found the ${(lines.found[0] ?? lines.quicker[0])[1]}.`);
    else if (lines.missed.length) out.push(`You struck at empty air: the ${lines.missed[0][1]} was too quick to catch.`);
    // what came back
    const hit = lines.landed.length, wounds = lines.wounds.length;
    if (hit) {
        const gear = [...lines.destroyed.map(x => `your ${x[1]} was destroyed`), ...lines.damaged.map(x => `your ${x[1]} was damaged`)];
        out.push(`${hit === 1 ? 'One blow' : `${num(hit)[0].toUpperCase()}${num(hit).slice(1)} blows`} came back at you${gear.length ? `: ${gear.join(', ').replace(/, ([^,]+)$/, ' and $1')}` : ''}${wounds ? ` ${gear.length ? 'and' : '—'} you took ${num(wounds)} wound${wounds === 1 ? '' : 's'}` : ''}.`.replace(/ — you took/, ', and you took'));
    } else if (lines.avoided.length) out.push('Every blow missed you.');
    if (lines.ended.length && !out.length) out.push('The fighting died down.');
    return out.join(' ');
}

// ---- a roll in the story voice: { title, line } for the dice tray and every box that describes a roll; the exact words stay as they were ("Detail") ----
const EVENING = [
    [/^Friendly: /, 'Friends here. No blades will be drawn.'], [/^Wary: /, 'Wary eyes, but no blades.'], [/^Cool: /, 'A cool stare. No blades drawn.'],
    [/^Cold, but/, 'A cold silence. They let you be.'], [/^Glad of you/, 'They greet you gladly. No blades.'], [/^They want nothing/, 'They turn away: no blades, no words.'],
    [/^A chance to win/, 'A chance to win them over.'], [/^The talk turns sour/, 'The mood sours.'],
    [/^They insult you: pay (\d+) (\w+)/, (m) => `An insult hangs in the air. Pay ${m[1]} ${m[2]}, or draw steel.`],
    [/^They challenge you: pay (\d+) (\w+)/, (m) => `A challenge is thrown down. Pay ${m[1]} ${m[2]}, or fight.`], [/^They attack/, 'Steel is drawn. They attack!'],
];
const TRADE = [
    [/^A warm welcome/, 'A warm welcome: a fair price.'], [/^A guarded welcome/, 'Guarded, but willing: a price is named.'], [/^A cold welcome/, 'Grudging: they will deal, at a premium.'],
    [/^A very cold welcome/, 'Cold: they will deal, but dearly.'], [/^They are glad of you/, 'Glad of you: they offer a favour.'], [/^They have no wish/, 'They turn their backs. No deal.'],
    [/^A chance to win/, 'Your words land: they hear you out again.'], [/^The talk turns sour/, 'The talk sours. They hear you out, grudgingly.'],
    [/^They insult you/, 'An insult.'], [/^They challenge you/, 'A challenge.'], [/^They bar your way/, 'They bar the way, blades out.'],
];
const SEARCH = {
    'Peer': { 'Nothing': 'You watch. Nothing stirs.', 'Hidden enemies': 'You see them: hidden watchers revealed.', 'Hidden enemies and Paths': 'Watchers and secret ways lie open to you.', 'Paths': 'A hidden way shows itself.' },
    'Locate': { 'Nothing': 'You search the stones. Nothing.', 'Discover chits': 'Something is here, and you have found it.', 'Passages and Clues': 'Hidden ways whisper their secrets.', 'Choice': 'The signs point more than one way.' },
};
const pick = (list, text) => { for (const [re, to] of list) { const m = re.exec(text); if (m) return typeof to === 'function' ? to(m) : to; } return null; };
// The same lines, by the code of the result (a roll the engine tagged with `kind` and `res`, Phase 3 round 8): the words are the ones above, chosen without reading a sentence.
const EVENING_BY = { 'price-x1': 'Friends here. No blades will be drawn.', 'price-x2': 'Wary eyes, but no blades.', 'price-x3': 'A cool stare. No blades drawn.', 'price-x4': 'A cold silence. They let you be.',
    boon: 'They greet you gladly. No blades.', 'boon-x1': 'They greet you gladly. No blades.', 'no-deal': 'They turn away: no blades, no words.', opportunity: 'A chance to win them over.', trouble: 'The mood sours.',
    insult: 'An insult hangs in the air. Pay 5 Notoriety, or draw steel.', challenge: 'A challenge is thrown down. Pay 5 Fame, or fight.', 'block-battle': 'Steel is drawn. They attack!' };
const TRADE_BY = { 'price-x1': 'A warm welcome: a fair price.', 'price-x2': 'Guarded, but willing: a price is named.', 'price-x3': 'Grudging: they will deal, at a premium.', 'price-x4': 'Cold: they will deal, but dearly.',
    boon: 'Glad of you: they offer a favour.', 'boon-x1': 'Glad of you: they offer a favour.', 'no-deal': 'They turn their backs. No deal.', opportunity: 'Your words land: they hear you out again.',
    trouble: 'The talk sours. They hear you out, grudgingly.', insult: 'An insult.', challenge: 'A challenge.', 'block-battle': 'They bar the way, blades out.' };
const SEARCH_BY = { 'search.peer': { nothing: 'You watch. Nothing stirs.', 'hidden-enemies': 'You see them: hidden watchers revealed.', 'hidden-enemies-and-paths': 'Watchers and secret ways lie open to you.', paths: 'A hidden way shows itself.' },
    'search.locate': { nothing: 'You search the stones. Nothing.', 'discover-chits': 'Something is here, and you have found it.', 'passages-and-clues': 'Hidden ways whisper their secrets.', choice: 'The signs point more than one way.' } };
function narrateByKind(r) {
    const res = r.result ?? '', t = r.res;
    const group = () => r.group ?? (/^Evening meeting with the ([^:]+)/.exec(r.what ?? '') ?? /^Meeting roll: .* the ([^:]+)/.exec(r.what ?? ''))?.[1];
    switch (r.kind) {
        case 'meeting.evening': return { title: `The ${group()}`, line: EVENING_BY[t] ?? res };
        case 'meeting.table': return { title: `The ${group()}`, line: TRADE_BY[t] ?? res };
        case 'move.hide': return { title: 'Hiding', line: t === 'seen' ? 'Eyes find you. There is no cover.' : 'You slip out of sight.' };
        case 'day.prowl': { const row = /^row-(\d)/.exec(t ?? '')?.[1]; return { title: 'The wilds', line: r.tale ?? (row ? 'Something stirs in the wilds.' : res) }; }
        case 'combat.reposition': return { title: 'The melee', line: t === 'shuffle' ? 'The creatures circle and trade places.' : 'Nothing shifts.' };
        case 'combat.tactics': return { title: `The ${r.box} box`, line: t === 'flip' ? 'A snarl, a twist: they change their stance.' : 'They hold their stance.' };
        case 'combat.missile': case 'combat.missile.foe': {
            const own = r.kind === 'combat.missile', d = /^([+-])(\d)/.exec(t ?? ''), who = own ? 'Your shot' : 'The shot';
            return { title: own ? 'Your shot' : 'Their shot', line: !d ? res : d[1] === '+' ? `${who} bites deeper than it looked.` : `${who} loses its sting.` };
        }
        case 'search.peer': case 'search.locate': return { title: r.kind === 'search.peer' ? 'Peering' : 'Searching', line: SEARCH_BY[r.kind][t] ?? res };
        case 'search.runes': return { title: 'The runes', line: t === 'learn-and-awaken' ? 'The runes yield their secret: a spell, yours to learn.' : t === 'awaken' ? 'The runes stir: you may look, no more.' : t === 'curse' ? 'The runes bite back.' : 'The runes stay silent.' };
        case 'curse.laid': return { title: 'A curse', line: `A curse takes hold: ${res}.` };
        case 'pit.rolled': return { title: 'The Pit', line: `From the Pit: ${res}.` };
        default: return undefined;
    }
}
export function narrateRoll(r) {
    const byKind = r.kind ? narrateByKind(r) : undefined;
    if (byKind) return byKind;
    const w = r.what ?? '', res = r.result ?? '';
    let m;
    if ((m = /^Evening meeting with the ([^:]+)/.exec(w))) return { title: `The ${m[1]}`, line: pick(EVENING, res) ?? res };
    if ((m = /^Meeting roll: (?:buying from|repaying|hiring from|buying drinks for) the ([^:]+)/.exec(w)) || (m = /^Meeting roll: .* the ([^:]+)/.exec(w))) return { title: `The ${m[1]}`, line: pick(TRADE, res) ?? res };
    if (w === 'Hide') return { title: 'Hiding', line: /seen/i.test(res) ? 'Eyes find you. There is no cover.' : 'You slip out of sight.' };
    if (w === 'Monster roll') { const row = /row (\d)/.exec(res)?.[1]; return { title: 'The wilds', line: r.tale ?? (row ? 'Something stirs in the wilds.' : res) }; }
    if (/^Repositioning roll/.test(w)) return { title: 'The melee', line: /shuffle/.test(res) ? 'The creatures circle and trade places.' : 'Nothing shifts.' };
    if ((m = /^Tactics roll \((\w+) box\)/.exec(w))) return { title: `The ${m[1]} box`, line: /switch sides/.test(res) ? 'A snarl, a twist: they change their stance.' : 'They hold their stance.' };
    if (/missile roll/.test(w)) { const d = /([+-])(\d)/.exec(res); const who = /^Your/.test(w) ? 'Your shot' : 'The shot'; return { title: /^Your/.test(w) ? 'Your shot' : 'Their shot', line: !d ? res : d[1] === '+' ? `${who} bites deeper than it looked.` : `${who} loses its sting.` }; }
    if ((m = /^Search: (Peer|Locate)$/.exec(w))) return { title: m[1] === 'Peer' ? 'Peering' : 'Searching', line: SEARCH[m[1]][res] ?? res };
    if (/^Search: Read runes/.test(w)) return { title: 'The runes', line: /Learn and awaken/.test(res) ? 'The runes yield their secret: a spell, yours to learn.' : /Awaken/.test(res) ? 'The runes stir: you may look, no more.' : /Curse/.test(res) ? 'The runes bite back.' : 'The runes stay silent.' };
    if (w === 'Curse') return { title: 'A curse', line: `A curse takes hold: ${res}.` };
    if (/^Power of the Pit/.test(w)) return { title: 'The Pit', line: `From the Pit: ${res}.` };
    return null;
}
