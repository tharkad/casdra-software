// combat/partyfacts.js: what a fight of a party did, character by character (notes 136, 137 and 138). One reading for every screen that tells it: the round's words over the stage, the recap that ends the
// fight (partyrecap.js) and the evening of the Day Result (play/results.js). It reads the lines of the fight, each tagged with the character it is about (`who`), from the event the engine wrote for the fact
// where there is one (`den.killed`, `hero.wounded` ...) and from the words of the line where there is not (the day's raw log keeps no events). No DOM, no engine: a line is { t, k, r?, who?, ev? }.
import { harmOf } from '../voice/fight.js';

const tagless = s => String(s).replace(/[  ]#\d+$/, '');
const KILL_WORDS = /^You kill (?:the )?(.+?)(?: with| \(|\.|,|$)/;
const BITS = /\(([^)]*kill \d+ today)\)/;
const FELL_WORDS = /you are slain|vital spot|Every action chit is wounded|You have died|adventure ends here/i;
const FLED_WORDS = /You break away and flee|rises out of the fight|breaks away from the fight/;
const num = n => Math.round(n * 100) / 100;

/** The kill a line tells, or null: { uid, name, gain: { fame, notoriety, gold } }. A kill of a character by a character (pvp) is not a creature and is left to the table's own words. */
export function killOf(l) {
    if (l.k !== 'combat') return null;
    const e = l.ev, t = String(l.t ?? '');
    const gain = { fame: 0, notoriety: 0, gold: 0 };
    let name = null, uid = null;
    if (e?.code === 'den.killed') {
        uid = e.den ?? null;
        if (e.fame != null || e.notoriety != null || e.gold != null) { gain.fame = e.fame ?? 0; gain.notoriety = e.notoriety ?? 0; gain.gold = e.gold ?? 0; }
        else words(t, gain);          // (a kill shared in one instant: the event holds no sum, the line says the share)
        name = KILL_WORDS.exec(t)?.[1] ?? null;
        if (e.by === 'power-of-the-pit') name = null;
    } else if (!e && KILL_WORDS.test(t)) { name = KILL_WORDS.exec(t)[1]; words(t, gain); }
    else return null;
    return { uid, name: name ? tagless(name) : null, gain };
}
function words(t, gain) {
    const g = BITS.exec(t);
    if (!g) return;
    for (const bit of g[1].split(/[,;] */)) { const x = /^\+([\d.]+) (Fame|Notoriety|gold)/.exec(bit); if (x) gain[x[2] === 'gold' ? 'gold' : x[2].toLowerCase()] += Number(x[1]); }
}

/** What the party did, from the lines of the fight (all of them, whoever they are about). `members`: [{ id, name }] in the party's order; `nameOfDen(uid)` names a creature the line could not (or null).
 * { rounds, members: [{ id, name, kills: [{ uid, name }], gain: { fame, notoriety, gold }, wounded, tired, destroyed, damaged, paid: [{ amount, cost }], fell, fled }] } */
export function partyFacts(lines, members, nameOfDen = () => null) {
    const rounds = Math.max(1, ...lines.map(l => l.r ?? 1));
    return {
        rounds,
        members: members.map(({ id, name }) => {
            const mine = lines.filter(l => l.who === id), gain = { fame: 0, notoriety: 0, gold: 0 }, kills = [], paid = [];
            let fell = false, fled = false;
            for (const l of mine) {
                const k = killOf(l);
                if (k) { for (const key of Object.keys(gain)) gain[key] = num(gain[key] + k.gain[key]); kills.push({ uid: k.uid, name: (k.uid && nameOfDen(k.uid)) || k.name || 'a foe' }); }
                const e = l.ev, t = String(l.t ?? '');
                if (e?.code === 'combat.natives.paid') paid.push({ amount: Number(e.amount), cost: String(e.cost) });
                else { const x = /^You pay (\d+) (\w+) to avoid the (?:insult|challenge)/i.exec(t); if (x && !e) paid.push({ amount: Number(x[1]), cost: x[2].toLowerCase() }); }
                if (e ? ((e.code === 'hero.slain' || e.code === 'char.dies') && e.told === true) || (e.code === 'combat.over' && e.how === 'died') : FELL_WORDS.test(t)) fell = true;
                if (FLED_WORDS.test(t)) fled = true;
            }
            return { id, name, kills, gain, ...harmOf(mine), paid, fell, fled };
        }),
    };
}

/** Is there anything at all to tell of this character (a kill, a gain, a loss)? */
export const hasNews = m => !!(m.kills.length || m.gain.fame || m.gain.notoriety || m.gain.gold || m.wounded || m.tired || m.destroyed || m.damaged || m.fell || m.fled || m.paid.length);

const NUMW = ['no', 'one', 'two', 'three', 'four', 'five'];
const count = (n, w) => `${NUMW[n] ?? n} ${w}${n === 1 ? '' : 's'}`;
const gainWords = g => [g.fame ? `${g.fame > 0 ? '+' : '−'}${Math.abs(g.fame)} Fame` : null, g.notoriety ? `${g.notoriety > 0 ? '+' : '−'}${Math.abs(g.notoriety)} Notoriety` : null, g.gold ? `${g.gold > 0 ? '+' : '−'}${Math.abs(g.gold)} Gold` : null].filter(Boolean);
export { gainWords };

/** What the OTHER characters did in one round, in words for the one who is asked (note 136: "You kill the Heavy Spider" was Woods Girl's blow): [{ id, story, detail }], every sentence naming the character.
 * `phrase(names)` joins creature names ("a Wolf and two Goblins"). The asked character's own part is told by the round's own synopsis. */
export function othersSay(lines, members, viewerId, phrase) {
    const facts = partyFacts(lines, members.filter(m => m.id !== viewerId));
    const out = [];
    for (const m of facts.members) {
        const kills = m.kills.map(k => k.name), pay = gainWords(m.gain);
        const story = [], detail = [];
        if (kills.length) { story.push(`${m.name} brings down ${phrase(kills)}.`); detail.push(`${m.name} kills ${phrase(kills)}${pay.length ? ` (${pay.join(', ')})` : ''}.`); }
        if (m.wounded) { const s = `${m.name} takes ${count(m.wounded, 'wound')}.`; story.push(s); detail.push(s); }
        if (m.fell) { const s = `${m.name} has fallen.`; story.push(s); detail.push(s); }
        else if (m.fled) { const s = `${m.name} breaks away from the fight.`; story.push(s); detail.push(s); }
        if (story.length) out.push({ id: m.id, story: story.join(' '), detail: detail.join(' ') });
    }
    return out;
}
