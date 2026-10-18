// play/endscreen.js: how a game ends, as a full screen (mockup 08 j1, j2): the DEATH callout (a skull, one Story line that says who did it, where and when, the tally in the three frames, how far the
// goals got) and the VERDICT of a finished game (won or not enough: one sentence, the victory points, the three frames, every goal with its bar and what it is worth, the story of the run, what to do
// next). One screen, shown once, the moment the game is over: the fight stays under the death for the one beat the combat scene gives it (fightBeat), then this. The old death box in the tray and the
// two death sheets are gone. The restart question (a dead character may return tomorrow with new goals) is a sheet over this screen.
import { CATS, earned, scoreGame, targets } from '../../../engine/score.js';
import { priceOf } from '../../../engine/items.js';
import { ownedItems } from '../../../engine/magic/mist.js';
import { nameOfClearing } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { h } from '../../dom.js';
import { lastDayOf, overTitle } from '../../gametext.js';
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
    const second = f.best && f.best.f >= 3 ? ` The greatest of your kills was ${/^[aeiou]/i.test(f.best.name) ? 'an' : 'a'} ${f.best.name}, on day ${f.best.day}.` : '';
    const third = f.deaths ? ` You fell ${f.deaths === 1 ? 'once' : f.deaths + ' times'} and rose again.` : '';
    return first + second + third;
}

// What every goal fetched, and one sentence (Story) for how it went.
function verdict(G, rows, s, dead) {
    const act_ = rows.filter(r => r.need > 0), allMet = act_.length > 0 && act_.every(r => r.earned >= r.need);
    const worst = act_.filter(r => r.earned < r.need).sort((a, b) => (b.need - b.earned) / b.need - (a.need - a.earned) / a.need)[0];
    if (dead) return null;
    if (s.won) return allMet ? (s.total >= 15 ? 'You walked out of the Realm with more than you carried in.' : 'Every goal you set is met, and the Realm is kept.') : 'You did enough: what one goal lacked, another made up.';
    return worst ? `You fell short: ${NAME[worst.cat]} lacked ${worst.need - worst.earned}.` : 'You did not do enough of what you set out to do.';
}

// ---- the pieces ----
function goalRow(r) {
    const met = r.earned >= r.need, frac = Math.max(0, Math.min(1, r.need ? r.earned / r.need : 0));
    const short = r.need - r.earned;
    return h('div', { class: `ds-egoal ${met ? 'met' : 'short'}`, style: `--frame:${COLOR[r.cat]}`, 'data-cat': r.cat },
        h('span', { class: 'main' },
            h('div', { class: 'top' }, h('b', {}, NAME[r.cat]), h('span', { class: 'of' }, `${r.earned} of ${r.need}`)),
            h('div', { class: 'bar', role: 'img', 'aria-label': `${r.earned} of ${r.need}` }, h('i', { style: `width:${Math.round(frac * 100)}%` })),
            r.pts != null ? h('small', { class: 'egn' },
                h('span', { 'data-v': 'story' }, met ? (r.diff > 0 ? `Past the goal by ${r.diff}.` : 'Exactly on the goal.') : `Short by ${short}.`),
                h('span', { 'data-v': 'detail' }, met ? `Over by ${r.diff}: ${r.basic} + bonus ${r.bonus}.` : `Short by ${short}, counted three times: ${r.basic} + bonus ${r.bonus}.`)) : null),
        r.pts != null ? h('span', { class: `worth ${r.pts >= 0 ? 'pos' : 'neg'}`, 'aria-label': `worth ${sgn(r.pts)} victory points` }, h('b', {}, sgn(r.pts)), h('small', {}, 'VP')) : null,
        met ? h('span', { class: 'ds-check on', 'aria-label': 'goal met' }, icon('check')) : null);
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
        const title = won ? (mode === 'month' && lastDayOf(st) === 28 ? 'Your month is done' : overTitle(st, false)) : 'Not enough';
        const sent = verdict(G, rows, s, false);
        const det = `Final score ${sgn(s.total)}: ${rows.filter(r => r.need > 0 || r.pts).map(r => `${NAME[r.cat]} ${sgn(r.pts)}`).join(', ')}.`;
        hero = h('div', { class: 'end-hero' },
            h('div', { class: `end-mark ds-stamp ${won ? 'win' : 'lose'}` }, icon(won ? 'trophy' : 'flag')),
            h('div', { class: 'ds-eyebrow', style: `color:${won ? 'var(--gold)' : 'var(--ink-3)'}` }, `Day ${o.day ?? st.day}${o.reason === 'finished' && mode === 'month' ? ` · the ${lastDayOf(st) === 28 ? 'month' : 'game'} ends` : ''}`),
            h('h1', { class: 'ds-h1' }, title),
            h('p', { class: 'ds-voice lg', 'data-v': 'story' }, sent), h('p', { class: 'ds-voice lg', 'data-v': 'detail' }, det),
            h('div', { class: 'vsw' }, voiceSwitch()));
        const e = Object.fromEntries(rows.map(r => [r.cat, r.earned]));
        middle = [
            h('div', { class: 'end-final' }, h('span', { class: 'ds-eyebrow' }, 'Victory points'), h('div', { class: `ds-num ${s.total >= 0 ? 'pos' : 'neg'}` }, sgn(s.total))),
            frames({ fame: e.fame ?? 0, notor: e.notoriety ?? 0, gold: e.gold ?? 0 }),
            sect(rows.some(r => r.need > 0) ? 'Your goals' : 'Your score'),
            h('div', { class: 'ds-list' }, ...rows.filter(r => r.need > 0).map(goalRow)),
            ...(rows.some(r => !(r.need > 0) && r.pts) ? [h('details', { class: 'end-idle' }, h('summary', {}, 'Goals you put no points on'), ...rows.filter(r => !(r.need > 0) && r.pts).map(r => h('p', { class: 'ds-meta' }, `${NAME[r.cat]}: ${r.earned} earned, ${sgn(r.pts)} VP.`)))] : []),
            saleLine(G),
        ];
    }
    const story = h('div', { class: 'end-run' }, sect('The run'), h('p', { class: 'ds-voice', 'data-v': 'story' }, runStory(f)),
        h('p', { class: 'ds-meta', 'data-v': 'detail' }, `Days ${f.days} · kills ${f.kills} · looted ${f.looted} · sites found ${f.sites} · wounds taken ${f.wounds}${f.deaths ? ` · deaths ${f.deaths}` : ''}.`));
    const restart = () => { const total = Math.max(2, Math.ceil(((st.lastDay ?? 28) - st.day) / 7) + 1), fame = Math.min(5, Math.ceil(total * 0.6)); G.ui.restartVp = { great: 0, spells: 0, fame, notoriety: Math.min(5, total - fame), gold: 0 }; render(G); };
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

// A dead character may return tomorrow, with new goals (the victory points he has left to spend): a sheet over the end screen.
export function restartSheet(G) {
    const st = G.st, weeks = Math.ceil(((st.lastDay ?? 28) - st.day) / 7), total = Math.max(2, weeks + 1), v = G.ui.restartVp;
    const used = Object.values(v).reduce((a, b) => a + b, 0);
    const rows = [['fame', 'Fame', 10], ['notoriety', 'Notoriety', 20], ['gold', 'Gold', 30], ['great', 'Great treasures', 1], ['spells', 'Spells', 2]];
    return modal(G, `A new ${st.ch.name}`, h('div', {},
        ask('Set the goals for your next character.', 'A new character arrives at the Inn tomorrow with fresh chits and gear. The goals you set now are what he will be scored against at the end of the game.'),
        h('p', {}, `He arrives at the Inn tomorrow. With ${weeks} week${weeks === 1 ? '' : 's'} left he has ${total} victory points to spend.`),
        ...rows.map(([k, label, fct]) => h('div', { class: 'vprow' },
            h('div', { class: 'vp-l' }, h('b', {}, label), h('small', {}, v[k] ? `goal: ${v[k] * fct}` : 'no goal')),
            h('div', { class: 'stepper' },
                h('button', { class: 'step-btn', disabled: v[k] <= 0, onclick: () => { v[k]--; render(G); } }, '−'),
                h('div', { class: 'step-val' }, h('b', {}, String(v[k]))),
                h('button', { class: 'step-btn', disabled: used >= total || v[k] >= 5, onclick: () => { v[k]++; render(G); } }, '+')))),
        h('p', { class: used === total ? 'hint' : 'hint bad' }, used === total ? 'All points spent.' : `${total - used} left to spend.`),
        h('button', { class: 'btn primary', disabled: used !== total, 'data-act': 'restart-go', onclick: () => { const vp = { ...v }; G.ui.restartVp = null; G.ui.sheet = null; act(G, { type: 'restart', vp }); } }, 'Begin')),
        { close: () => { G.ui.restartVp = null; render(G); } });
}
