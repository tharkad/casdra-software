// The SHARED fight of a clearing, as a phone reads it (docs/design/multiplayer-cui.md): who is in it and what each is doing, whose sheet every creature is on, what was played, and what
// the round came to for each character. Pure functions of a redacted view (server/redact.mjs) and the table (party.js): no DOM, so tests/fight_ui.test.mjs runs them in node.
// Only public facts are read: `view.battle` (public by design), the lines of the fight that the server sends to its participants (`vis: 'battle'`, `with`), and the viewer's own record.
import { denSide, hireStats } from '../engine/combat.js';

export const DIRS = ['Thrust', 'Swing', 'Smash'], MNV = ['Charge', 'Dodge', 'Duck'];
const FLED = new Set(['ran', 'flew', 'mist', 'teleported']);
export const joinList = list => (list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const num = n => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][n] ?? String(n);

// What each step of a fight is called, to a player (8.3: Meeting, luring, assignment, Encounter, Melee, then the harm).
export const STEP_WORDS = { meet: 'The Meeting', lure: 'Luring', assign: 'Dealing', charge: 'Charging', encounter: 'Encounter', melee: 'Plays', harm: 'Wounds and fatigue' };
// ... and what someone who is asked is doing in each (for "Ann is ...").
const DOING = { meet: 'dealing with the natives', lure: 'deciding whom to lure', assign: 'being dealt creatures', charge: 'deciding whether to attack someone', encounter: 'taking an Encounter action', melee: 'choosing a play', harm: 'settling wounds and fatigue' };

/** The word on a participant's chip. */
export const FIGHT_WORDS = { deciding: 'deciding', sealed: 'played', waiting: 'waiting', fled: 'fled', fallen: 'fallen', out: 'stayed out' };

/** The fight of the clearing, or null when no fight is on. `people` is party(); `data` the game data (names of creatures); `myId` the viewer's character.
 * { at, round, step, quiet, pvp, members:[{ id, player, character, mine, state, why, status, word, hidden, person }], me, sheets:[{ owner, dens, hires }], loose, held, standingBy, deciding, doing } */
export function fightOf(view, people, data, myId = view?.actor) {
    const b = view?.battle;
    if (!b?.order) return null;
    const asked = new Set((view.asks ?? []).map(a => a.who)), byId = new Map((people ?? []).map(p => [p.id, p]));
    const members = b.order.map(id => {
        const m = b.members[id] ?? { state: 'out', why: null }, p = byId.get(id) ?? null, c = view.chars?.[id];
        let status;
        if (m.state === 'out') status = m.why === 'died' || c?.dead ? 'fallen' : FLED.has(m.why) ? 'fled' : 'out';
        else if (asked.has(id)) status = 'deciding';
        else if (b.step === 'melee' && m.ready) status = 'sealed';
        else status = 'waiting';
        return { id, player: p?.player ?? c?.name ?? id, character: c?.name ?? id, mine: id === myId, state: m.state, why: m.why ?? null, status, word: FIGHT_WORDS[status], hidden: !!c?.hidden, person: p, charged: m.charged ?? null, peace: m.peace ?? null };
    });
    const nameOfDen = d => { try { return denSide(view, data, d).name; } catch { return `${d.id}${d.tag ? ` #${d.tag}` : ''}`; } };
    const alive = (b.dens ?? []).filter(d => !d.dead && (d.kind === 'mon' || d.kind === 'nat'));
    const standing = d => (d.kind === 'nat' ? !(d.battlers ?? []).length : !!(d.bystander || d.pacified));
    const denOf = d => ({ uid: d.uid, kind: d.kind, id: d.id, name: nameOfDen(d), side: d.side ?? 'light', standingBy: !d.sheet && !d.engagedBy && standing(d), tag: d.tag ?? null, engagedBy: d.engagedBy ?? null });
    const hireName = h => { try { return hireStats(data, h.id, h.kind, view).name; } catch { return h.id; } };
    const sheets = members.map(m => ({
        owner: m,
        dens: alive.filter(d => d.sheet === m.id).map(denOf),
        hires: (b.hires ?? []).filter(h => h.owner === m.id && !h.dead).map(h => ({ uid: h.uid, id: h.id, kind: h.kind, name: hireName(h), at: h.targetChar ?? null })),
    }));
    const free = alive.filter(d => !d.sheet);
    const f = {
        at: b.at, round: b.round, step: b.step, quiet: b.quiet ?? 0, pvp: !!b.pvp, members, me: members.find(m => m.mine) ?? null,
        sheets: [...sheets.filter(s => s.owner.mine), ...sheets.filter(s => !s.owner.mine)],           // yours first
        loose: free.filter(d => !d.engagedBy && !standing(d)).map(denOf), held: free.filter(d => d.engagedBy).map(denOf), standingBy: free.filter(d => !d.engagedBy && standing(d)).map(denOf),
        deciding: members.filter(m => m.status === 'deciding'),
        // character against character (the lobby switch `pvp`): the charges of this round are made in the open; the record of who fell to whom is table talk too
        charges: (b.charges ?? []).map(c => ({ by: members.find(m => m.id === c.by), on: members.find(m => m.id === c.on), time: c.time })).filter(c => c.by && c.on),
        kills: b.kills ?? [],
    };
    f.doing = DOING[b.step] ?? 'deciding';
    return f;
}

/** What has been said in the open at the charge step (8.3.6b): who charges whom, who says they mean no harm. Told as it happens, to everyone, in the viewer's voice ("You charge Ann."). */
export function chargeNews(f) {
    const who = m => (m.mine ? 'you' : m.player);
    const charges = (f.charges ?? []).map(c => `${cap(who(c.by))} ${c.by.mine ? 'charge' : 'charges'} ${c.on.mine ? 'you' : c.on.player}.`);
    const hush = (f.members ?? []).filter(m => m.peace === true && f.step === 'charge').map(m => `${cap(who(m))} ${m.mine ? 'mean' : 'means'} no harm.`);
    return [...charges, ...hush].join(' ');
}

/** One line about where the fight stands now, for a banner: { title, text }. The viewer is "you"; the others are named by player. */
export function nowLine(f) {
    const who = m => (m.mine ? 'you' : m.player);
    const plural = list => list.length > 1 || (list.length === 1 && list[0].mine);                       // "you" and a crowd take "are/have"
    const are = list => (plural(list) ? 'are' : 'is');
    if (!f.members.some(m => m.state === 'in')) return { title: 'The fight is ending.', text: '' };
    if (f.step === 'melee') {
        const sealed = f.members.filter(m => m.status === 'sealed').sort((a, b) => b.mine - a.mine), open = f.members.filter(m => m.state === 'in' && m.status !== 'sealed').sort((a, b) => b.mine - a.mine);
        const a = sealed.length ? `${joinList(sealed.map(who))} ${plural(sealed) ? 'have' : 'has'} played` : '';
        const b = open.length ? `${joinList(open.map(who))} ${are(open)} choosing${sealed.length ? '' : ' plays'}` : 'all the plays are in';
        return { title: `Round ${f.round}: plays.`, text: cap(`${a}${a ? '; ' : ''}${b}.`) };
    }
    const dec = f.deciding;
    const charged = chargeNews(f);
    if (!dec.length) return { title: `Round ${f.round}.`, text: charged || 'The fight goes on.' };
    return { title: `Round ${f.round}: ${(STEP_WORDS[f.step] ?? f.step).toLowerCase()}.`, text: `${charged ? `${charged} ` : ''}${cap(`${joinList(dec.map(who))} ${are(dec)} ${DOING[f.step] ?? 'deciding'}.`)}` };
}

/** Why a creature cannot be lured (8.3.4), in the words of the table: for the muted line under the lure choices. Nothing is guessed that the public fields do not say. */
export function whyNotLurable(d) {
    if (d.engagedBy) return 'is fighting a hireling';
    if (d.kind === 'nat' && d.standingBy) return 'is not fighting anyone';
    if (d.standingBy) return 'stands by';
    return 'cannot be drawn away';
}

// ---- the lines of the fight ----
const mineLine = (l, myId) => l.vis === 'battle' && Array.isArray(l.with) && l.with.includes(myId);
const START = /stand together at |stands alone at /;
/** The lines of the fight the viewer took part in: the last run of `vis: 'battle'` lines that name him in `with`, from the line that opens the fight ("... stand together at ...") to its end.
 * Returns [{ t, s, who, r, k }] oldest first. */
export function fightLines(view, myId) {
    const L = (view?.log ?? []).filter(l => mineLine(l, myId));
    let from = 0;
    for (let i = L.length - 1; i >= 0; i--) if (START.test(L[i].t)) { from = i; break; }
    return L.slice(from);
}

// ---- second person to third: the lines are told to "you" by the engine; the table reads them with a name ----
const IRREG = { are: 'is', have: 'has', do: 'does', go: 'goes', were: 'was', am: 'is' };
const he = verb => IRREG[verb] ?? (/(?:s|x|z|ch|sh)$/.test(verb) ? `${verb}es` : /[^aeiou]y$/.test(verb) ? `${verb.slice(0, -1)}ies` : `${verb}s`);
/** "You kill the Wolf. Your Mace ... at you" told of Ann: "Ann kills the Wolf. Ann's Mace ... at them". Past-tense verbs stay as they are; present ones take the -s. */
export function third(text, name) {
    if (text == null) return text;
    let s = String(text);
    s = s.replace(/^You: /, `${name}: `);
    s = s.replace(/(^|[.!?;:] )You (\w+)/g, (m, pre, verb) => `${pre}${name} ${/ed$|^(took|lost|found|fell|struck|broke|won|was|were|had|did|could|would|played|cut|put)$/.test(verb) ? verb : he(verb)}`);
    s = s.replace(/(^|[.!?;:] )Your /g, `$1${name}’s `);
    s = s.replace(/\byou(?= (?:took|were|had|did|could|would|played|[a-z]+ed)\b)/g, 'they');
    s = s.replace(/\byou are\b/g, 'they are').replace(/\byourself\b/g, 'themself').replace(/\byour\b/g, 'their').replace(/\byou\b/g, 'them').replace(/\bYou\b/g, name);
    return s;
}

// ---- what one round did to each ----
const GAIN = /\+(\d+) (Fame|Notoriety|gold)/g;
/** The facts of the lines one character wrote in a round: what he killed (with what it paid him), the wounds he took, armor lost, whether he broke away. */
export function factsOf(lines) {
    const out = { kills: [], gain: { fame: 0, notoriety: 0, gold: 0 }, wounds: 0, gear: [], fled: false, struck: false, died: null };
    for (const l of lines) {
        const t = l.t ?? '';
        let m;
        if ((m = /^You kill the (.+?) with /.exec(t))) {
            const got = { fame: 0, notoriety: 0, gold: 0 };
            for (const g of t.matchAll(GAIN)) got[g[2] === 'gold' ? 'gold' : g[2].toLowerCase()] += Number(g[1]);
            const shared = /same instant as/.test(t);
            out.kills.push({ name: m[1], ...got, shared });
            out.gain.fame += got.fame; out.gain.notoriety += got.notoriety; out.gain.gold += got.gold;
        } else if (/^You strike down the /.test(t)) out.struck = true;
        else if ((m = /^(.+?) deals \w harm; (?:the .+? )?you are slain|^(.+?)'s shot finds a vital spot; you are slain/.exec(t))) out.died = { by: m[1] ?? m[2] };
        else if (/^You are dead\.|magic kills you/.test(t)) out.died = { by: null };
        else if (/^You take a wound\./.test(t)) out.wounds++;
        else if ((m = /^Your (.+?) is (destroyed|damaged)\./.exec(t))) out.gear.push({ name: m[1], how: m[2] });
        else if (/You break away and flee|break away/.test(t)) out.fled = true;
        else if (/^You: .*: hit\b/.test(t)) out.struck = true;
    }
    return out;
}

/** The round `round` of the fight, written for the table: for every participant his lines and facts, and the table's own lines (the order of the blows). `f` is fightOf(). */
export function roundReport(view, f, round, myId) {
    let lines = fightLines(view, myId).filter(l => l.r === round);
    // the plays are shown at the barrier: the round's account starts there (what was said before it is the lure and the dealing)
    const cut = lines.map(l => /^The plays are shown/.test(l.t)).lastIndexOf(true);
    if (cut >= 0) lines = lines.slice(cut);
    const per = {};
    for (const m of f.members) {
        const mine = lines.filter(l => l.who === m.id);
        per[m.id] = { member: m, lines: mine, facts: factsOf(mine) };
    }
    const table = lines.filter(l => !l.who && l.k === 'combat');
    return {
        round, per, table,
        order: table.find(l => /^Order of blows/.test(l.t)) ?? null,
        sameInstant: table.find(l => /land at the same instant/.test(l.t)) ?? null,
        any: lines.length > 0,
    };
}

/** A chit as the player reads it on the chit itself: "Fight H5*" (type, strength, time, asterisks). */
export function chitText(view, id, chitId) {
    const ch = view?.chars?.[id]?.chits?.find(c => c.id === chitId);
    if (!ch) return chitId ? 'a chit' : null;
    const kind = ch.type === 'fight' ? 'Fight' : ch.type === 'move' ? 'Move' : 'Magic';
    return `${kind} ${ch.type === 'magic' ? `${ch.numeral ?? ''}${ch.time}` : `${ch.strength}${ch.time}`}${'*'.repeat(ch.effort || 0)}`;
}

/** What each participant played, from the plays the table has shown (`battle.reveal`): [{ id, member, target, attack, fight, move, maneuver, shield, spell }]. The target is a creature name. */
export function playsOf(view, f, data, reveal = view?.battle?.reveal) {
    if (!reveal?.plays) return [];
    const dens = view?.battle?.dens ?? [];
    return f.members.filter(m => reveal.plays[m.id]).map(m => {
        const p = reveal.plays[m.id];
        let target = null, targetKind = null, d = null;
        if (typeof p.target === 'string' && p.target.startsWith('char:')) {
            // character against character: the target is a character (the plays are shown now, so it is no secret)
            const t = f.members.find(x => x.id === p.target.slice(5));
            if (t) { target = `${t.player}\u2019s ${t.character}`; targetKind = 'char'; }
        } else if (typeof p.target === 'string' && p.target.startsWith('hire:')) {
            const hh = (view?.battle?.hires ?? []).find(x => x.uid === p.target.slice(5)), owner = hh ? f.members.find(x => x.id === hh.owner) : null;
            let nm = hh?.id ?? 'a hireling'; if (hh) { try { nm = hireStats(data, hh.id, hh.kind, view).name; } catch { /* the id */ } }
            target = `${owner ? `${owner.player}\u2019s ` : ''}${nm}`; targetKind = 'hire';
        } else {
            d = p.target ? dens.find(x => x.uid === p.target) : null;
            if (d) { try { target = denSide(view, data, d).name; } catch { target = d.id; } targetKind = 'den'; }
        }
        return {
            id: m.id, member: m, target, targetKind, targetSheet: d?.sheet ?? null, attack: p.attackDir != null && (p.fightChit || p.spell) ? DIRS[p.attackDir] : null,
            fight: p.fightChit ? chitText(view, m.id, p.fightChit) : null, move: p.moveChit ? chitText(view, m.id, p.moveChit) : null, maneuver: p.moveChit && p.moveDir != null ? MNV[p.moveDir] : null,
            shield: p.shieldDir != null && p.shieldDir !== undefined && p.shieldDir !== 0 ? DIRS[p.shieldDir] : null, spell: !!p.spell,
        };
    });
}

/** The same, from the lines alone, when the table's reveal is gone (the last round of a won fight ends the fight in the same instant): the direction and the creature are in the viewer-told lines. */
export function playsFromLines(report) {
    return Object.values(report.per).map(({ member, lines }) => {
        const l = lines.find(x => /^You: (Thrust|Swing|Smash) at /.test(x.t));
        const m = l ? /^You: (Thrust|Swing|Smash) at (.+?) \(/.exec(l.t) : null;
        return { id: member.id, member, target: m?.[2] ?? null, attack: m?.[1] ?? null, fight: null, move: null, maneuver: null, shield: null, spell: false, fromLines: true };
    }).filter(p => p.attack);
}

/** The headline of a round, in the story voice: what fell and what was paid, who was hurt. One or two short sentences naming players. `report` is roundReport(). */
export function headline(report) {
    const bits = [];
    const dead = Object.values(report.per).filter(({ facts }) => facts.died);
    if (dead.length) bits.push(`${joinList(dead.map(({ member, facts }) => `${member.player} falls${facts.died.by ? ` to the ${facts.died.by}` : ''}`))}.`);
    const kills = Object.values(report.per).flatMap(({ member, facts }) => facts.kills.map(k => ({ who: member, ...k })));
    if (kills.length) {
        const byName = new Map();
        for (const k of kills) { const e = byName.get(k.name) ?? { name: k.name, by: [] }; e.by.push(k.who.player); byName.set(k.name, e); }
        bits.push(`${joinList([...byName.values()].map(e => `the ${e.name} falls to ${joinList([...new Set(e.by)])}`)).replace(/^the/, 'The')}.`);
    } else if (!dead.length) bits.push('No creature falls.');
    const hurt = Object.values(report.per).filter(({ facts }) => !facts.died && (facts.wounds || facts.gear.length));
    if (hurt.length) bits.push(`${joinList(hurt.map(({ member, facts }) => `${member.player}${facts.wounds ? ` takes ${num(facts.wounds)} wound${facts.wounds === 1 ? '' : 's'}` : ` loses ${facts.gear.map(g => g.name).join(' and ')}`}`))}.`);
    const fled = Object.values(report.per).filter(({ facts }) => facts.fled);
    if (fled.length) bits.push(`${joinList(fled.map(x => x.member.player))} breaks away.`);
    return bits.join(' ');
}

/** The whole fight, round by round, as the viewer may read it: totals of what each character gained, what they killed, how they left. For the card that ends the fight. */
export function fightSummary(view, myId) {
    const lines = fightLines(view, myId);
    const ids = [...new Set(lines.filter(l => l.who).map(l => l.who))];
    const per = {};
    for (const id of ids) per[id] = factsOf(lines.filter(l => l.who === id));
    const over = [...lines].reverse().find(l => /^The fighting at (\S+) is over\./.test(l.t));
    const at = over ? /^The fighting at (\S+) is over\./.exec(over.t)[1] : (lines.find(l => START.test(l.t)) ? /together at (\S+) as/.exec(lines.find(l => START.test(l.t)).t)?.[1] ?? null : null);
    const rounds = [...new Set(lines.map(l => l.r).filter(Boolean))];
    const lastRound = rounds.length ? Math.max(...rounds) : 0;
    return { lines, per, ids, at, over: !!over, day: over?.day ?? lines.at(-1)?.day ?? view?.day, lastRound, key: `${over?.day ?? view?.day}|${at}` };
}
