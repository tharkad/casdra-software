// play/endscreen.js: how a game ends, as a full screen (mockup 08 j1, j2): the DEATH callout (a skull, one Story line that says who did it, where and when, the tally in the three frames, how far the
// goals got) and the VERDICT of a finished game (won or not enough: one sentence, the victory points, the three frames, every goal with its bar and what it is worth, the story of the run, what to do
// next). One screen, shown once, the moment the game is over: the fight stays under the death for the one beat the combat scene gives it (fightBeat), then this. The old death box in the tray and the
// two death sheets are gone. The restart question (a dead character may return tomorrow with new goals) is a sheet over this screen.
import { CATS, FACTORS, earned, scoreGame, targets } from '../../../engine/score.js';
import { priceOf } from '../../../engine/items.js';
import { ownedItems } from '../../../engine/magic/mist.js';
import { nameOfClearing } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { h } from '../../dom.js';
import { lastDayOf } from '../../gametext.js';
import { btn, frames, sect, twoLine, voiceSwitch } from '../../ds.js';
import { icon } from '../../icons.js';
import { lineFor } from '../../storyvoice.js';
import { guardIfChanged } from '../../tapguard.js';
import { act } from './actions.js';
import { modal } from './kit.js';
import { render } from './shell.js';
import { clearSaved } from './state.js';

const NAME = { great: 'Great Treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
const COLOR = { great: 'var(--gold-hi)', spells: 'var(--magic-purple, #b79af0)', fame: 'var(--c-fame)', notoriety: 'var(--c-notor)', gold: 'var(--c-gold)' };
const sgn = n => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const nbsp = s => String(s).replace(/ (\d+)$/, ' $1');

// ---- the facts ----
function goalRows(G) {
    const st = G.st, s = st.score;
    if (s?.rows?.length) return s.rows.map(r => ({ ...r, pts: r.basic + r.bonus }));
    const e = earned(st, G.data), need = targets(st);                              // (a dead character has no rows: show how far each goal got)
    return CATS.map(c => ({ cat: c, earned: e[c], need: need[c], diff: e[c] - need[c], pts: null }));
}

// The line that killed him, told in the Story voice (the log line "X deals T harm; you are slain" has a Story of its own), and in Detail as written.
function deathLines(G) {
    const st = G.st, o = st.over ?? {}, by = o.by ? o.by.replace(/ #\d+$/, '') : null;
    const l = [...(st.log ?? [])].reverse().find(x => x.k !== 'roll' && /you are slain|^You die|dies\b|slain/i.test(x.t) && x.day === (o.day ?? st.day));
    const story = l ? lineFor(l, 'story', st) : (by ? `The ${by} is too much for you. You do not get up.` : 'You do not get up.');
    const detail = l ? l.t : (o.text ?? (by ? `Slain by the ${by}.` : 'Fallen.'));
    return { story, detail };
}

// "The greatest of your kills" from the whole log, and the run's numbers (st.stats: kills, looted, sites found, wounds; the game keeps them for the record).
function runFacts(G) {
    const st = G.st, S = st.stats ?? {};
    let best = null;
    for (const l of st.log ?? []) {
        const m = /^You kill the (.+?) with /.exec(l.t); if (!m) continue;
        const f = [...l.t.matchAll(/\+(\d+) (?:Fame|Notoriety)/g)].reduce((a, x) => a + Number(x[1]), 0);
        if (!best || f > best.f) best = { name: m[1].replace(/ #\d+$/, ''), day: l.day, f };
    }
    return { days: st.over?.day ?? st.day, kills: S.kills ?? 0, looted: S.looted ?? 0, sites: S.sitesDiscovered ?? 0, wounds: S.woundsTaken ?? 0, deaths: st.deaths ?? 0, best };
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function runStory(f) {
    const bits = [];
    if (f.kills) bits.push(`put down ${plural(f.kills, 'creature')}`);
    if (f.looted) bits.push(`took ${plural(f.looted, 'treasure')}`);
    if (f.sites) bits.push(`found ${plural(f.sites, 'hidden place')}`);
    const first = `You walked the Realm for ${plural(f.days, 'day')}${bits.length ? `: you ${bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}` : bits[0]}` : ''}.`;
    const third = f.deaths ? ` You fell ${f.deaths === 1 ? 'once' : f.deaths + ' times'} and rose again.` : '';
    return first + third;
}

// What every goal fetched, and one sentence (Story) for how it went.
function verdict(G, rows, s, dead) {
    const act_ = rows.filter(r => r.need > 0), allMet = act_.length > 0 && act_.every(r => r.earned >= r.need);
    const worst = act_.filter(r => r.earned < r.need).sort((a, b) => (b.need - b.earned) / b.need - (a.need - a.earned) / a.need)[0];
    if (dead) return null;
    if (s.won) return allMet ? (s.total >= 15 ? 'You walked out of the Realm with more than you carried in.' : 'Every goal you set is met.') : 'You did enough: what one goal lacked, another made up.';
    return worst ? `You fell short: ${NAME[worst.cat]} lacked ${worst.need - worst.earned}.` : 'You did not do enough of what you set out to do.';
}

// "Your greatest deed": the kill that won the most Fame and Notoriety, from the whole log (the run's best moment, told under the headline).
function deedLine(f) {
    if (!f.best || f.best.f < 1) return null;
    const a = /^[aeiou]/i.test(f.best.name) ? 'an' : 'a';
    return { story: `Your greatest deed: ${a} ${f.best.name} cut down on day ${f.best.day}.`, detail: `Greatest kill: ${f.best.name}, day ${f.best.day} (+${f.best.f} Fame and Notoriety).` };
}

// ---- the pieces ----
function goalRow(r) {
    const idle = !(r.need > 0), met = idle || r.earned >= r.need, frac = Math.max(0, Math.min(1, r.need ? r.earned / r.need : 0));
    const short = r.need - r.earned, per = FACTORS[r.cat];
    // what a surplus is worth, and why when it is worth nothing (a point is a whole number of Fame, Notoriety, Gold: QA-109)
    const surplus = r.pts === 0 && !idle && met && r.diff > 0 ? ` Not yet a whole point: ${NAME[r.cat]} counts ${per} to the point.` : '';
    const story = idle ? (r.pts ? 'Not one of your goals, but it counts.' : 'Not one of your goals.') : met ? (r.diff > 0 ? `Past the goal by ${r.diff}.${surplus}` : 'Exactly on the goal.') : `Short by ${short}.`;
    const detail = idle ? `No goal: ${r.basic} + bonus ${r.bonus}.` : met ? `Over by ${r.diff}: ${r.basic} + bonus ${r.bonus}.${surplus}` : `Short by ${short}, counted three times: ${r.basic} + bonus ${r.bonus}.`;
    return h('div', { class: `ds-egoal ${met ? 'met' : 'short'}${idle ? ' idle' : ''}`, style: `--frame:${COLOR[r.cat]}`, 'data-cat': r.cat },
        h('span', { class: 'main' },
            h('div', { class: 'top' }, h('b', {}, NAME[r.cat]), h('span', { class: 'of' }, idle ? `${r.earned} earned` : `${r.earned} of ${r.need}`)),
            idle ? null : h('div', { class: 'bar', role: 'img', 'aria-label': `${r.earned} of ${r.need}` }, h('i', { style: `width:${Math.round(frac * 100)}%` })),
            r.pts != null ? h('small', { class: 'egn' }, h('span', { 'data-v': 'story' }, story), h('span', { 'data-v': 'detail' }, detail)) : null),
        r.pts != null ? h('span', { class: `worth ${r.pts >= 0 ? 'pos' : 'neg'}`, 'aria-label': `worth ${sgn(r.pts)} victory points` }, h('b', {}, sgn(r.pts)), h('small', {}, 'VP')) : null,
        met && !idle ? h('span', { class: 'ds-check on', 'aria-label': 'goal met' }, icon('check')) : null);
}

// For interest only: what the goods he carries would fetch if he sold the lot at the printed prices.
function saleLine(G) {
    const sum = ownedItems(G.st).filter(i => !i.destroyed).reduce((a, i) => a + Math.max(0, priceOf(G.data, i)), 0);
    return sum > 0 ? h('p', { class: 'ds-meta end-sale' }, 'If you sold everything you carry: ', h('b', { class: 'ds-c-gold' }, `+${sum} Gold`), '. For interest only.') : null;
}

// ---- the screen ----
export function overScreen(G) {
    const st = G.st, o = st.over ?? {}, dead = o.reason === 'died' || !!st.ch.dead, s = st.score ?? scoreGame(st, G.data);
    const rows = goalRows(G), won = !dead && s.won, mode = st.mode ?? 'month';
    const canRestart = dead && mode !== 'endless' && st.day < (st.lastDay ?? 28) && !G.race;
    const goTitle = () => { clearSaved(); G.ctx.go('title'); };
    const place = o.at ? nbsp(nameOfClearing(o.at)) : null;
    const f = runFacts(G);
    let hero, middle;
    if (dead) {
        const d = deathLines(G);
        hero = h('div', { class: 'ds-death' },
            h('div', { class: 'skull ds-stamp' }, icon('skull')),
            h('div', { class: 'ds-eyebrow', style: 'color:var(--danger)' }, `Day ${o.day ?? st.day}${place ? ` · ${place}` : ''}`),
            h('h1', {}, 'You have fallen'),
            h('p', { class: 'ds-voice lg', 'data-v': 'story' }, d.story), h('p', { class: 'ds-voice lg', 'data-v': 'detail' }, d.detail),
            h('div', { class: 'vsw' }, voiceSwitch()));
        middle = [
            frames({ fame: st.ch.fame, notor: st.ch.notoriety, gold: st.ch.gold }),
            h('div', { class: 'end-final' }, h('span', { class: 'ds-eyebrow' }, 'Final score'), h('div', { class: 'ds-num neg' }, '−100'), h('p', { class: 'ds-meta' }, 'A dead character scores −100.')),
            ...(rows.some(r => r.need > 0) ? [sect('How far you got'), h('div', { class: 'ds-list' }, ...rows.filter(r => r.need > 0).map(goalRow))] : []),
        ];
    } else {
        const title = won ? 'Victory' : 'Short of your goals';
        const sent = verdict(G, rows, s, false), deed = deedLine(f);
        const det = `Final score ${sgn(s.total)}: ${rows.filter(r => r.need > 0 || r.pts).map(r => `${NAME[r.cat]} ${sgn(r.pts)}`).join(', ')}.`;
        hero = h('div', { class: 'end-hero' },
            h('div', { class: `end-mark ds-stamp ${won ? 'win' : 'lose'}` }, icon(won ? 'trophy' : 'flag')),
            h('div', { class: 'ds-eyebrow', style: `color:${won ? 'var(--gold)' : 'var(--ink-2)'}` }, `Day ${o.day ?? st.day}${o.reason === 'finished' && mode === 'month' ? ` \u00B7 the ${lastDayOf(st) === 28 ? 'month' : 'game'} ends` : ''}`),
            h('h1', { class: 'ds-h1' }, title),
            h('p', { class: 'ds-voice lg', 'data-v': 'story' }, won ? `The Realm is kept. ${sent}` : sent), h('p', { class: 'ds-voice lg', 'data-v': 'detail' }, det),
            deed ? h('p', { class: 'ds-meta end-deed' }, h('span', { 'data-v': 'story' }, deed.story), h('span', { 'data-v': 'detail' }, deed.detail)) : null,
            h('div', { class: 'vsw' }, voiceSwitch()));
        const e = Object.fromEntries(rows.map(r => [r.cat, r.earned]));
        middle = [
            h('div', { class: 'end-final' }, h('span', { class: 'ds-eyebrow' }, 'Victory points'), h('div', { class: `ds-num ${s.total >= 0 ? 'pos' : 'neg'}` }, sgn(s.total))),
            frames({ fame: e.fame ?? 0, notor: e.notoriety ?? 0, gold: e.gold ?? 0 }),
            sect(rows.some(r => r.need > 0) ? 'Your goals' : 'Your score', 'what each was worth'),
            h('div', { class: 'ds-list' }, ...rows.filter(r => r.need > 0).map(goalRow), ...rows.filter(r => !(r.need > 0) && r.pts).map(goalRow)),
            saleLine(G),
        ];
    }
    const story = h('div', { class: 'end-run' }, sect('The run'), h('p', { class: 'ds-voice', 'data-v': 'story' }, runStory(f)),
        h('p', { class: 'ds-meta', 'data-v': 'detail' }, `Days ${f.days} · kills ${f.kills} · looted ${f.looted} · sites found ${f.sites} · wounds taken ${f.wounds}${f.deaths ? ` · deaths ${f.deaths}` : ''}.`));
    const restart = () => { G.ui.restartVp = { great: 0, spells: 0, fame: 0, notoriety: 0, gold: 0 }; render(G); };
    const primary = canRestart ? btn(twoLine('Return tomorrow', `as a new ${st.ch.name}`), 'primary', { 'data-act': 'restart', onclick: restart })
        : G.race ? btn('Back to the title', 'primary', { 'data-act': 'over-title', onclick: goTitle })
            : btn(dead ? 'Begin again' : 'New game', 'primary', { 'data-act': 'over-new', onclick: () => { clearSaved(); G.ctx.go('newgame'); } });
    const quiet = G.race ? null : btn('History', 'quiet', { 'data-act': 'over-history', onclick: () => { clearSaved(); G.ctx.go('history'); } });
    const screen = h('main', { class: `ds-end ds-screen ${dead ? 'dead' : won ? 'won' : 'lost'}`, 'data-screen': 'over', role: 'dialog', 'aria-label': dead ? 'You have fallen' : won ? 'Victory' : 'The game is over' },
        h('div', { class: 'ds-scroll ds-fade-b end-scroll' }, hero, ...middle, story,
            canRestart || G.race ? null : h('div', { class: 'end-title' }, btn('Back to the title', 'quiet sm', { 'data-act': 'over-title', onclick: goTitle })),
            canRestart ? h('div', { class: 'end-title' }, btn('Back to the title', 'quiet sm', { 'data-act': 'over-title', onclick: goTitle })) : null),
        h('div', { class: 'ds-foot' }, quiet, primary));
    // every button of the end screen, the leaving ones too, waits a moment: the taps that were on their way to the fight's last primary (Roll) must not land on "Begin again" or "Back to the title" (QA-4)
    guardIfChanged(G.ui.guards ??= {}, 'over', `${dead}|${o.day ?? st.day}`, screen, 700, 'button');
    return screen;
}

// A dead character may return tomorrow, with new goals (the victory points he has left to spend): a sheet over the end screen. One ask, five rows of goals with their steppers, and the foot: how many points are
// left and the one primary (Begin), which never scrolls away (QA-102).
export function restartSheet(G) {
    const st = G.st, weeks = Math.ceil(((st.lastDay ?? 28) - st.day) / 7), total = Math.max(2, weeks + 1), v = G.ui.restartVp;
    const used = Object.values(v).reduce((a, b) => a + b, 0);
    const rows = [['fame', 'Fame', 10], ['notoriety', 'Notoriety', 20], ['gold', 'Gold', 30], ['great', 'Great treasures', 1], ['spells', 'Spells', 2]];
    const left = total - used;
    const begin = h('button', { type: 'button', class: `ds-btn primary${left ? ' is-dim' : ''}`, disabled: left !== 0 || null, 'data-act': 'restart-go', onclick: () => { const vp = { ...v }; G.ui.restartVp = null; G.ui.sheet = null; act(G, { type: 'restart', vp }); } }, 'Begin');
    const foot = h('div', { class: 'ds-opt-foot' }, h('span', { class: `lead ds-lead-text${left ? ' bad' : ''}` }, left === 0 ? 'All points spent.' : `${left} left to spend.`), begin);
    return modal(G, `A new ${st.ch.name}`, h('div', { class: 'restart-goals' },
        ask('Set the goals for your next character.', `He arrives at the Inn tomorrow and is scored against what you set now. With ${weeks} week${weeks === 1 ? '' : 's'} left he has ${total} victory points to spend.`),
        ...rows.map(([k, label, fct]) => h('div', { class: 'ds-row vprow' },
            h('div', { class: 'vp-l main' }, h('b', {}, label), h('span', {}, v[k] ? `goal: ${v[k] * fct}` : 'no goal')),
            h('div', { class: 'stepper' },
                h('button', { type: 'button', class: 'step-btn', 'aria-label': `Less ${label}`, disabled: v[k] <= 0, onclick: () => { v[k]--; render(G); } }, '\u2212'),
                h('div', { class: 'step-val' }, h('b', {}, String(v[k]))),
                h('button', { type: 'button', class: 'step-btn', 'aria-label': `More ${label}`, disabled: used >= total || v[k] >= 5, onclick: () => { v[k]++; render(G); } }, '+'))))),
        { close: () => { G.ui.restartVp = null; render(G); }, bare: true, eyebrow: `Day ${st.day} \u00B7 the Inn`, cls: 'restart-sheet', footer: foot });
}
