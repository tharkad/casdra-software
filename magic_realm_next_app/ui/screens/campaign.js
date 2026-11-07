import { h } from '../dom.js';
import { sect } from '../ds.js';
import { loadData } from '../dataload.js';
import { bar, charLabel, foot, nb, portraitSrc, sum, switchRow } from '../front.js';
import { chitsOwned, heroOf, loadRecord, playable, rememberGoals, runParams, runPlan, saveRecord, setLast, setUnlockedAll, stageLabel } from '../roguelike/campaign.js';
import { GOAL_NAME, GOAL_ORDER, GOAL_MAX, fitSpread, goalList, goalMax, goalWords, sameSpread, setGoal, spreadUsed, validSpread } from '../goalspread.js';
import { howWinEl } from '../howwin.js';
import { apiOf } from '../../engine/api.js';
import { ownSheet, standingOf } from '../combat/feed.js';
import { chitPick } from '../roguelike/chitpick.js';
import { settleAbandonedRun } from '../roguelike/endblock.js';
import { loadSaved } from './game.js';
import { chitFacts } from '../roguelike/chitfacts.js';
import { defaultGame, stepper } from './newgame.js';

// The Campaign (roguelike v0): a character kept from run to run (docs/design/roguelike/ROGUELIKE-V0.md). The six starters are open; the others are locked until a later build, or until the testing switch is on.
// One character is chosen; the screen shows his stage, his chits, the run that comes (its length, victory points and goals) and the one primary button, Begin run N.
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const GOAL_CLS = { fame: 'ds-c-fame', notoriety: 'ds-c-notor', gold: 'ds-c-gold' };
// What the game would begin with for this run and these goals, asked of the engine itself (a throwaway game, the same character, stage and spread): the score with nothing earned and the starting worth that
// Gold counts from (9.3.2e: 10 gold and the price of the gear the character begins with). null when the engine cannot say. Kept per run shape, so a redraw does not build the game again.
const startCache = new Map();
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const chitsWord = n => plural(n, 'chit');
const sub = (data, id, hero) => `${stageLabel(hero.stage)}${hero.stage > 4 ? ` (${hero.stage})` : ''} · ${chitsWord(chitsOwned(data, id, hero).length)}`;
const record = hero => (hero.runs ? `${plural(hero.runs, 'run')} · ${plural(hero.wins, 'win')} · ${plural(hero.deaths, 'fall')}` : 'Not played yet');

export function campaignScreen(ctx) {
    const st = ctx.campaign ??= { sel: null };
    const root = h('main', { class: 'screen ds-screen ds-title flush campaign', 'data-screen': 'campaign' });
    let data = ctx.data ?? null, rec = loadRecord(), err = null;
    st.draft ??= {};                                                    // the goals being changed, a character's own: a spread with points still to spend is kept here until the run begins
    const back = () => ctx.go(ctx.params?.from === 'over' ? 'title' : 'newgame');
    const save = next => { rec = next; saveRecord(rec); redraw(); };
    const redraw = () => { if (!root.isConnected && root.dataset.mounted) return; const body = root.querySelector('.ds-scroll'), y = body?.scrollTop ?? 0; root.replaceChildren(...build()); const nb_ = root.querySelector('.ds-scroll'); if (nb_) nb_.scrollTop = y; };

    function card(id, open) {
        const hero = heroOf(rec, id), on = st.sel === id;
        if (!open) return h('div', { class: 'rl-card locked', 'data-char': id, 'data-locked': '' }, h('span', { class: 'pt-who' }, h('span', { class: 'pt-face' }, h('img', { src: portraitSrc(id), alt: '' }))), h('span', { class: 'nm' }, charLabel(id)), h('small', {}, 'Locked'));
        return h('button', { type: 'button', class: `rl-card${on ? ' on' : ''}`, role: 'radio', 'aria-checked': on ? 'true' : 'false', 'data-char': id, onclick: () => { st.sel = id; redraw(); } },
            h('span', { class: 'pt-who' }, h('span', { class: 'pt-face' }, h('img', { src: portraitSrc(id), alt: '' }))),
            h('span', { class: 'main' }, h('b', { class: 'nm' }, charLabel(id)), h('span', { class: 'rl-stage', 'data-stage': String(hero.stage) }, data ? sub(data, id, hero) : stageLabel(hero.stage)), h('small', {}, record(hero))));
    }


    // The goals of the run that comes: the plan's own (the ones chosen last time, or the usual spread) until the player changes them. A draft is kept only while it still fits this run's points.
    const goalsOf = (id, plan) => { const d = st.draft[id]; return d && GOAL_ORDER.every(k => Number.isInteger(d[k]) && d[k] >= 0 && d[k] <= GOAL_MAX) && spreadUsed(d) <= plan.vp ? d : plan.goals; };
    const fromWords = (plan, goals) => {
        if (sameSpread(goals, plan.goals)) return plan.goalsFrom === 'last' ? 'Same as last time' : plan.goalsFrom === 'fitted' ? `Last time\u2019s goals, fitted to ${plan.vp} points` : 'The usual spread';
        return sameSpread(goals, plan.usual) ? 'The usual spread' : 'Changed by you';
    };
    const startOf = (id, plan, goals) => {
        const key = [id, plan.playStage, plan.extra.join(','), plan.days, ...GOAL_ORDER.map(k => goals[k])].join('|');
        if (!startCache.has(key)) {
            let r = null;
            try { const state = apiOf(data).newGame({ seed: 1, character: id, vp: goals, lastDay: plan.days, startStage: plan.playStage, extraChits: plan.extra }, { record: false }).state; r = { total: standingOf(state, data).score?.total ?? null, startValue: ownSheet(state, data).startValue ?? null }; } catch { r = null; }
            startCache.set(key, r);
        }
        return startCache.get(key);
    };
    function goalRow(id, plan, goals, k, info) {
        const v = goals[k];
        return h('div', { class: 'ds-row ds-goalrow', 'data-goal': k }, h('span', { class: 'main' }, h('b', { class: GOAL_CLS[k] ?? '' }, GOAL_NAME[k]), h('span', {}, cap(goalWords(k, v, { startValue: info?.startValue ?? null })))),
            stepper(v, null, 0, goalMax(goals, k, plan.vp), n => { st.draft[id] = setGoal(goals, k, n, plan.vp); redraw(); }, { big: true }));
    }
    function goalsBlock(id, plan, goals, info) {
        const left = plan.vp - spreadUsed(goals), open = st.goalsOpen === id;
        const lines = goalList(goals, { startValue: info?.startValue ?? null }).map(g => h('li', { 'data-goal-line': g.k }, h('b', {}, `${g.name} ${g.n}`), `: ${g.words}`));
        const reset = (label, spread, act) => spread && !sameSpread(spread, goals) ? h('button', { type: 'button', class: 'ds-btn sm', 'data-act': act, onclick: () => { st.draft[id] = { ...spread }; redraw(); } }, label) : null;
        return h('div', { class: 'rl-goals', 'data-goals': '' },
            h('div', { class: 'rl-goals-head' }, h('b', {}, 'Your goals'), h('span', { class: 'ds-meta', 'data-goals-from': '' }, fromWords(plan, goals))),
            lines.length ? h('ul', { class: 'rl-goallist' }, ...lines) : h('p', { class: 'ds-why' }, 'No goals yet.'),
            h('button', { type: 'button', class: 'ds-btn', 'data-act': 'change-goals', 'aria-expanded': open ? 'true' : 'false', onclick: () => { st.goalsOpen = open ? null : id; redraw(); } }, open ? 'Done' : 'Change goals'),
            open ? h('div', { class: 'rl-goaledit', 'data-goal-editor': '' },
                h('p', { class: 'ds-why', 'data-goals-left': '' }, nb(`Spread your ${plan.vp} victory points over the five goals. ${left > 0 ? `${left} left to spend.` : 'All spent.'}`)),
                h('div', { class: 'ds-list' }, GOAL_ORDER.map(k => goalRow(id, plan, goals, k, info))),
                h('div', { class: 'rl-goalbtns' }, reset('Same as last time', plan.last ? fitSpread(plan.last, plan.vp) : null, 'goals-last'), reset('The usual spread', plan.usual, 'goals-usual'))) : null);
    }

    function detail(id) {
        const hero = heroOf(rec, id), plan = runPlan(rec, id), goals = goalsOf(id, plan), info = startOf(id, plan, goals), mine = chitsOwned(data, id, hero), extras = new Set(hero.extra);
        const cards = data.characters[id].chits.map((c, i) => ({ c, id: `${id}-${i + 1}` })).filter(x => mine.includes(x.id));
        const chitEls = cards.map(x => { const f = chitFacts(x.c); return h('span', { class: `ds-chit ${f.type}${extras.has(x.id) ? ' on' : ''}`, 'data-chit': x.id, 'aria-label': `${f.line}${extras.has(x.id) ? ', an extra chit' : ''}` }, h('span', {}, f.label, f.stars ? h('sup', {}, '*'.repeat(f.stars)) : null), h('small', {}, f.kind.toUpperCase())); });
        const last = [...rec.runs].reverse().find(r => r.character === id);
        return h('div', { class: 'rl-detail', 'data-detail': id },
            h('div', { class: 'rl-dhead' }, h('h2', { class: 'ds-h2' }, charLabel(id)), h('span', { class: 'ds-tag gold', 'data-stage-tag': '' }, stageLabel(hero.stage))),
            hero.stage > 4 ? h('p', { class: 'ds-why' }, 'A veteran plays as a fourth-stage hero. What a veteran earns above the fourth stage comes in a later build.') : null,
            sect('Chits', `${chitsWord(mine.length)}${hero.extra.length ? `, ${hero.extra.length} beyond the stage` : ''}`),
            h('div', { class: 'rl-chits', 'data-chits': '' }, ...chitEls),
            sect(`The run that comes`, `Run ${plan.runNo}`),
            h('dl', { class: 'ds-kv rl-run', 'data-run': '' },
                h('dt', {}, 'Length'), h('dd', {}, `${plan.days} days`),
                h('dt', {}, 'Points'), h('dd', {}, `${plan.vp} victory points, spread over your goals`),
                info?.total != null ? [h('dt', {}, 'Starts at'), h('dd', { 'data-start-score': '' }, `${info.total} (nothing earned yet)`)] : null),
            goalsBlock(id, plan, goals, info),
            howWinEl({ mode: 'month', lastDay: plan.days, start: info?.total ?? null }),
            h('p', { class: 'ds-why', 'data-consequence': '' }, nb('Win: rise a stage. Survive: earn a chit. Fall: drop a stage.')),
            last ? h('p', { class: 'ds-meta rl-last', 'data-last': '' }, nb(`Last run: ${last.outcome.text}`)) : null);
    }

    function build() {
        if (err) return [bar('Campaign', { onBack: back }), h('div', { class: 'ds-scroll ds-pad ds-wizbody' }, h('p', { class: 'ds-voice lg' }, 'The campaign could not load its data.'), h('p', { class: 'ds-why' }, err)), foot(h('span'), h('button', { type: 'button', class: 'ds-btn primary', onclick: back }, 'Back'))];
        if (!data) return [bar('Campaign', { onBack: back }), h('div', { class: 'ds-scroll ds-pad ds-wizbody' }, h('p', { class: 'ds-voice lg' }, 'Opening the campaign…')), foot(h('span'), h('button', { type: 'button', class: 'ds-btn primary', disabled: true }, 'Begin run'))];
        const all = Object.keys(data.characters), open = playable(rec, all), closed = all.filter(id => !open.includes(id));
        if (!st.sel || !open.includes(st.sel)) st.sel = open.includes(rec.last) ? rec.last : open[0];
        const waiting = rec.pending ? rec.pending.character : null;
        const plan = st.sel ? runPlan(rec, st.sel) : null;
        const goals = plan ? goalsOf(st.sel, plan) : null, left = plan ? plan.vp - spreadUsed(goals) : 0;
        const stop = waiting ? 'Choose your chit first.' : left > 0 ? `${left} victory point${left === 1 ? '' : 's'} left to spend on goals.` : null;
        // a run still being played is ended by beginning another: it counts as a fall (9.2.2a), and the next run is built from the record as it stands after it
        const going = loadSaved(), inRun = going && going.period !== 'over' && going.session?.params?.roguelike ? going : null;
        const begin = () => {
            if (inRun) { settleAbandonedRun(inRun, data); rec = loadRecord(); }
            const id = st.sel, now = runPlan(rec, id), mine = validSpread(goals, now.vp) ? goals : fitSpread(goals, now.vp);       // (the points change if beginning ended a run of this character: a fall)
            const next = setLast(rememberGoals(rec, id, mine), id); saveRecord(next); rec = next;
            delete st.draft[id]; st.goalsOpen = null;
            ctx.go('game', runParams(rec, id, { seed: Math.floor(Math.random() * 90000) + 1, options: defaultGame().options, goals: mine }));
        };
        const pick = rec.pending ? chitPick({ data, rec, onDone: next => { rec = next; redraw(); } }) : null;
        return [bar('Campaign', { onBack: back }),
            h('div', { class: 'ds-scroll ds-pad ds-wizbody', 'data-step': 'campaign' },
                h('p', { class: 'ds-voice lg ds-q' }, nb('One character you keep from run to run.')),
                h('p', { class: 'ds-why ds-qwhy' }, nb('Survive and you earn a chit. Win and you rise a stage. Fall and you drop back one.')),
                inRun ? h('p', { class: 'ds-why rl-going', 'data-inrun': '' }, nb(`Your ${charLabel(inRun.session.params.roguelike.character)} is in a run, on day ${inRun.day} of ${inRun.lastDay}. Beginning another run ends it as a fall. Continue is on the title.`)) : null,
                pick ? h('div', { class: 'rl-waiting', 'data-waiting': '' }, sect(`A chit is waiting for the ${charLabel(waiting)}`, ''), pick) : null,
                sect('Your characters', `${open.length} open`),
                h('div', { class: 'rl-grid', role: 'radiogroup', 'aria-label': 'Characters' }, open.map(id => card(id, true))),
                st.sel ? detail(st.sel) : null,
                closed.length ? [sect('Locked', plural(closed.length, 'character')), h('div', { class: 'rl-grid locked', 'data-locked-list': '' }, closed.map(id => card(id, false))), h('p', { class: 'ds-why', 'data-later': '' }, nb('More characters come in a later build.'))] : null,
                sect('For testing', ''),
                switchRow({ title: 'Open every character (testing)', line: 'Every character can be played, from stage 1. Switch it off to go back to the six.', on: rec.unlockedAll, attrs: { 'data-option': 'unlockAll' }, label: ['Off', 'On'],
                    onToggle: () => save(setUnlockedAll(rec, !rec.unlockedAll)) })),
            foot(stop ? sum(h('b', { class: 'bad' }, stop)) : sum(st.sel ? `${charLabel(st.sel)} · ${data ? sub(data, st.sel, heroOf(rec, st.sel)) : ''}` : ''),
                h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'begin-run', disabled: stop || !st.sel ? true : null, onclick: begin }, plan ? `Begin run ${plan.runNo}` : 'Begin run'))];
    }

    root.append(...build());
    root.dataset.mounted = '1';
    if (!data) (ctx.data ? Promise.resolve(ctx.data) : loadData('data/')).then(d => { data = ctx.data = d; redraw(); }).catch(e => { err = String(e?.message ?? e); redraw(); });
    return root;
}
