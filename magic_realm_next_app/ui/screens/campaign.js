import { h } from '../dom.js';
import { sect } from '../ds.js';
import { loadData } from '../dataload.js';
import { bar, charLabel, foot, nb, portraitSrc, sum, switchRow } from '../front.js';
import { chitsOwned, heroOf, loadRecord, playable, runParams, runPlan, saveRecord, setLast, setUnlockedAll, stageLabel } from '../roguelike/campaign.js';
import { chitPick } from '../roguelike/chitpick.js';
import { settleAbandonedRun } from '../roguelike/endblock.js';
import { loadSaved } from './game.js';
import { chitFacts } from '../roguelike/chitfacts.js';
import { defaultGame } from './newgame.js';

// The Campaign (roguelike v0): a character kept from run to run (docs/design/roguelike/ROGUELIKE-V0.md). The six starters are open; the others are locked until a later build, or until the testing switch is on.
// One character is chosen; the screen shows his stage, his chits, the run that comes (its length, victory points and goals) and the one primary button, Begin run N.
const GOAL_NAME = { great: 'Great treasure', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
const goalsText = goals => ['fame', 'notoriety', 'gold', 'spells', 'great'].filter(k => goals[k]).map(k => `${GOAL_NAME[k]} ${goals[k]}`).join(', ');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const chitsWord = n => plural(n, 'chit');
const sub = (data, id, hero) => `${stageLabel(hero.stage)}${hero.stage > 4 ? ` (${hero.stage})` : ''} · ${chitsWord(chitsOwned(data, id, hero).length)}`;
const record = hero => (hero.runs ? `${plural(hero.runs, 'run')} · ${plural(hero.wins, 'win')} · ${plural(hero.deaths, 'fall')}` : 'Not played yet');

export function campaignScreen(ctx) {
    const st = ctx.campaign ??= { sel: null };
    const root = h('main', { class: 'screen ds-screen ds-title flush campaign', 'data-screen': 'campaign' });
    let data = ctx.data ?? null, rec = loadRecord(), err = null;
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

    function detail(id) {
        const hero = heroOf(rec, id), plan = runPlan(rec, id), mine = chitsOwned(data, id, hero), extras = new Set(hero.extra);
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
                h('dt', {}, 'To win'), h('dd', {}, `${plan.vp} victory points`),
                h('dt', {}, 'Goals'), h('dd', {}, goalsText(plan.goals))),
            h('p', { class: 'ds-why' }, nb(`Reach your goals by the end of day ${plan.days} to win and rise a stage. Live to the end and you earn a chit. Fall and you drop back a stage.`)),
            last ? h('p', { class: 'ds-meta rl-last', 'data-last': '' }, nb(`Last run: ${last.outcome.text}`)) : null);
    }

    function build() {
        if (err) return [bar('Campaign', { onBack: back }), h('div', { class: 'ds-scroll ds-pad ds-wizbody' }, h('p', { class: 'ds-voice lg' }, 'The campaign could not load its data.'), h('p', { class: 'ds-why' }, err)), foot(h('span'), h('button', { type: 'button', class: 'ds-btn primary', onclick: back }, 'Back'))];
        if (!data) return [bar('Campaign', { onBack: back }), h('div', { class: 'ds-scroll ds-pad ds-wizbody' }, h('p', { class: 'ds-voice lg' }, 'Opening the campaign…')), foot(h('span'), h('button', { type: 'button', class: 'ds-btn primary', disabled: true }, 'Begin run'))];
        const all = Object.keys(data.characters), open = playable(rec, all), closed = all.filter(id => !open.includes(id));
        if (!st.sel || !open.includes(st.sel)) st.sel = open.includes(rec.last) ? rec.last : open[0];
        const waiting = rec.pending ? rec.pending.character : null;
        const plan = st.sel ? runPlan(rec, st.sel) : null;
        const stop = waiting ? 'Choose your chit first.' : null;
        // a run still being played is ended by beginning another: it counts as a fall (9.2.2a), and the next run is built from the record as it stands after it
        const going = loadSaved(), inRun = going && going.period !== 'over' && going.session?.params?.roguelike ? going : null;
        const begin = () => {
            if (inRun) { settleAbandonedRun(inRun, data); rec = loadRecord(); }
            const next = setLast(rec, st.sel); saveRecord(next); rec = next;
            ctx.go('game', runParams(rec, st.sel, { seed: Math.floor(Math.random() * 90000) + 1, options: defaultGame().options }));
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
