// play/sheet_info.js: the information sheets: calendar and magic colours, the race standings, the menu, "Report a problem", the score/goals sheet and the Setup Card.
import { defOf, nameOf, priceOf } from '../../../engine/items.js';
import { CATS, FACTORS, earned, progress, scoreGame, targets } from '../../../engine/score.js';
import { COLORS, COLOR_MEANING, colorSources, dayColors, isMagicDay } from '../../../engine/spells.js';
import { nameOfClearing } from '../../../engine/world.js';
import { ask } from '../../ask.js';
import { collect as collectReport, send as sendReport } from '../../bugreport.js';
import { h } from '../../dom.js';
import { SPELLS_HOW, timed } from '../../gametext.js';
import { markable } from '../../table.js';
import { VERSION } from '../../version.js';
import { abandon, copyInvite } from './actions.js';
import { colorChip, modal, mrChit, picOf } from './kit.js';
import { render } from './shell.js';
import { persist } from './state.js';

export function calendarSheet(G) {
    const last = G.st.lastDay ?? 28, weeks = Math.ceil(last / 7);
    const cell = d => {
        const cols = dayColors(d, G.st.lastDay ?? 28);
        return h('div', { class: `calday${d === G.st.day ? ' today' : ''}${d < G.st.day ? ' past' : ''}${cols.length ? ' magic' : ''}` },
            h('b', {}, String(d)), ...cols.map(c => h('i', { class: `dot ${c.toLowerCase()}`, title: c })));
    };
    const here = colorSources(G.st, G.data, G.st.ch.at);
    return modal(G, 'Calendar and magic', h('div', { class: 'calendar' },
        ask(isMagicDay(G.st.day) ? `Today the land is filled with ${dayColors(G.st.day, G.st.lastDay ?? 28).join(' and ')} magic.` : `Day ${G.st.day}${timed(G.st) ? ` of ${last}` : ''}: an ordinary day for magic.`,
            'On the seventh day of each week one colour of magic fills the whole realm, from sunrise to midnight, in every clearing. Spells of that colour can be cast anywhere that evening.'),
        h('div', { class: 'calgrid' }, ...Array.from({ length: weeks }, (_, w) => h('div', { class: 'calweek' }, h('small', {}, `Week ${w + 1}`), ...Array.from({ length: 7 }, (_, k) => cell(w * 7 + k + 1))))),
        h('h3', {}, 'The week\'s colours'),
        ...Array.from({ length: weeks }, (_, w) => h('p', { class: 'calrow' }, h('b', {}, `Day ${(w + 1) * 7}`), ...dayColors((w + 1) * 7, G.st.lastDay ?? 28).map(c => colorChip(c)))),
        h('h3', {}, 'What each colour is'),
        ...COLORS.map(c => h('p', { class: 'calrow' }, colorChip(c), h('span', {}, COLOR_MEANING[c]))),
        h('h3', {}, `In your clearing (${nameOfClearing(G.st.ch.at).replace(/ (\d+)$/, '\u00A0$1')})`),
        here.length ? h('div', {}, ...here.map(x => h('p', { class: 'calrow' }, colorChip(x.color), h('span', {}, x.why)))) : h('p', { class: 'hint' }, 'No colour of magic is present here today.'),
        h('p', { class: 'hint' }, 'Colours of magic come from the seventh day and from a Chapel (White).')),
        { close: () => { G.ui.sheet = null; render(G); } });
}

export function raceSheet(G) {
    const rows = G.standings.length ? G.standings : [];
    const stat = x => x.status === 'finished' ? `finished ${x.score >= 0 ? '+' : ''}${x.score}` : x.status === 'died' ? `died, day ${x.day}` : `day ${x.day}`;
    return modal(G, 'The race', h('div', { class: 'racelist' },
        h('p', { class: 'hint' }, 'Everyone plays the same realm. A green dot means they have the game open right now.'),
        ...rows.map(x => h('div', { class: `raceplayer${x.seat === G.race.seat ? ' me' : ''}`, 'data-seat': x.seat },
            h('i', { class: `pdot${x.present ? ' on' : ''}`, 'aria-label': x.present ? 'here now' : 'away' }),
            h('span', { class: 'rp-main' }, h('b', {}, x.name + (x.seat === G.race.seat ? ' (you)' : '')), h('small', {}, `${x.character ?? ''} \u00b7 ${stat(x)}`)),
            h('span', { class: 'rp-nums' }, `${x.gold} gold \u00b7 ${x.fame} fame \u00b7 ${x.notoriety} notor.`))),
        G.race.invite ? h('div', {}, h('button', { type: 'button', class: 'ds-btn block', 'data-act': 'copy-invite', onclick: () => copyInvite(G) }, 'Copy invite link'), G.ui.invite ? h('input', { class: 'invitebox', readonly: true, value: G.ui.invite, onfocus: e => e.target.select() }) : null) : null),
        { close: () => { G.ui.sheet = null; render(G); } });
}

export function menuSheet(G) {
    const go = (sheet) => () => { G.ui.sheet = sheet; render(G); };
    const row = (label, hint, onclick, extra = {}) => h('button', { class: `mrow${extra.danger ? ' danger' : ''}`, 'data-act': extra.act ?? null, onclick },
        h('span', { class: 't' }, h('span', {}, label), hint ? h('small', {}, hint) : null), extra.danger ? null : h('span', { class: 'chev', 'aria-hidden': 'true' }, '\u203A'));
    return modal(G, 'Menu', h('div', { class: 'menulist' },
        ...(G.shared ? [h('h4', {}, 'The table'),
            row('Players and turn order', (() => { const mk = markable(G.answer, G.mySeat); return mk.length ? `${mk[0].name} has been gone ${mk[0].text}: the table can mark them away` : `${G.crew.length} players \u00b7 ${G.standings.filter(x => x.present).length} here now`; })(), go('players'), { act: 'open-players' })] : []),
        ...(G.race ? [h('h4', {}, 'The race'),
            row('Standings', `${G.standings.filter(x => x.present).length} here now`, go('race'), { act: 'open-race' }),
            ...(G.race.invite ? [row('Invite someone', 'Copy the link to send them', () => copyInvite(G), { act: 'invite' })] : [])] : []),
        h('h4', {}, 'This game'),
        row('Journal', 'What has happened, day by day', go('log')),
        row('Calendar and magic', 'The colours of magic through the month', go('calendar'), { act: 'open-calendar' }),
        row('Show the whole realm', null, () => { G.ui.sheet = null; G.map.fit(); render(G); }),
        ...(G.race || G.shared ? [] : [row('This game\u2019s record', null, () => { persist(G, true); G.ctx.go('history', { id: G.st.session?.id, back: 'game' }); })]),
        h('h4', {}, 'Reference'),
        row('How to play', null, go('help')),
        row('Map key', null, go('key')),
        row('The Setup Card', 'What the printed card tells everyone', go('setupcard'), { act: 'setup-card' }),
        ...(G.data.art?.misc?.meetingTable ? [row('Tables', 'Meeting, Search, Missile, Pit', go('tables'))] : []),
        h('h4', {}, 'Other'),
        row('Report a problem', null, go('bug'), { act: 'menu-bug' }),
        row('Back to the title screen', null, () => { G.conn?.stop(); G.sconn?.unwatch(); G.ctx.go('title'); }),
        row(G.shared ? 'Put the game down (it waits for you on the server)' : G.race ? 'Leave the race (your game stays on the server)' : 'Abandon this game', null, G.race || G.shared ? () => abandon(G) : () => { G.ui.sheet = 'confirm-abandon'; render(G); }, { danger: true })),
        { close: () => { G.ui.sheet = null; render(G); } });
}

// ---- "Report a problem": a description, and the game's record and state sent to the server ----
export function bugSheet(G) {
    const b = G.ui.bug ??= { text: '', status: 'idle', id: null, error: null, packed: null };
    const close = { close: () => { G.ui.sheet = null; if (b.status === 'sent') G.ui.bug = null; render(G); } };
    const kb = n => (n < 1024 ? `${n} bytes` : `${Math.round(n / 1024)} KB`);
    if (b.status === 'sent') return modal(G, 'Report sent', h('div', { class: 'bugform' },
        h('p', {}, `Thank you. Your report is number ${b.id}. It has your description, this game's record and log, and its current state.`),
        h('button', { type: 'button', class: 'ds-btn primary block', 'data-act': 'bug-done', onclick: close.close }, 'Done')), close);
    const sending = b.status === 'sending';
    const area = h('textarea', { class: 'bugtext', rows: 5, placeholder: 'What happened, and what did you expect? (Which screen, which action.)', 'data-bug-text': '', disabled: sending || null,
        oninput: e => { b.text = e.target.value; ok.disabled = !b.text.trim() || sending; } });
    area.value = b.text;
    const ok = h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'bug-send', disabled: !b.text.trim() || sending || null, onclick: async () => {
        b.status = 'sending'; b.error = null; render(G);
        try {
            b.packed = await collectReport({ st: G.st, rec: G.rec, version: VERSION, ui: G.ui });
            b.id = await sendReport(b.text.trim(), b.packed);
            b.status = 'sent';
        } catch (e) { b.status = 'failed'; b.error = e.message; }
        render(G);
    } }, sending ? 'Sending\u2026' : b.status === 'failed' ? 'Try again' : 'OK, send it');
    return modal(G, 'Report a problem', h('div', { class: 'bugform' },
        h('p', { class: 'hint' }, 'Describe what went wrong. Saying OK sends your description with this game\'s record (every action and the whole log), its current state, your other recorded games, and your browser and screen size to the server.'),
        area,
        b.status === 'failed' ? h('p', { class: 'chk-bad' }, `Could not send: ${b.error}`) : null,
        b.status === 'failed' && b.packed ? h('button', { type: 'button', class: 'ds-btn block', 'data-act': 'bug-save', onclick: () => {
            const url = URL.createObjectURL(new Blob([b.packed.text], { type: 'application/json' }));
            const a = Object.assign(document.createElement('a'), { href: url, download: `magic-realm-report-${Date.now()}.json` });
            document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        } }, `Save it as a file instead (${kb(b.packed.bytes)})`) : null,
        h('div', { class: 'row2' }, h('button', { type: 'button', class: 'ds-btn', 'data-act': 'bug-cancel', disabled: sending || null, onclick: close.close }, 'Cancel'), ok)), close);
}

export function scoreSheet(G) {
    const res = scoreGame(G.st, G.data), e = earned(G.st, G.data), need = targets(G.st), vp = G.st.ch.vp ?? {};
    const NAME = { great: 'Great Treasures', spells: 'Spells', fame: 'Fame', notoriety: 'Notoriety', gold: 'Gold' };
    const belong = (key) => G.st.ch.items.filter(i => !i.destroyed).map(i => { const d = defOf(G.data, i); const t = i.card ? G.data.treasures[i.card] : d; return { name: nameOf(G.data, i), v: (t?.[key] ?? d?.[key] ?? 0) }; }).filter(x => x.v);
    const how = {
        great: `Great Treasures you own and can carry (${e.great}). Each is worth one point of the goal.`,
        spells: SPELLS_HOW,
        fame: 'Recorded Fame plus the Fame of what you own.',
        notoriety: 'Recorded Notoriety plus the Notoriety of what you own.',
        gold: `Recorded gold ${G.st.ch.gold} minus your starting value ${G.st.ch.startValue ?? 10} (your starting gold and the price of the gear you began with). Only gold counts, not the price of things you own.`,
    };
    const rows = res.rows ?? [];
    const sign = n => (n > 0 ? `+${n}` : String(n));
    const pr = progress(G.st, G.data), over = G.st.period === 'over';
    const sumUp = c => { const r = rows.find(x => x.cat === c); return r ? `${sign(r.basic + r.bonus)} points if the game ended now` : ''; };
    const goalCard = g => {
        const r = rows.find(x => x.cat === g.cat);
        return h('div', { class: 'scorerow2' },
            h('div', { class: 'sr-head' }, h('b', {}, NAME[g.cat]), h('span', {}, g.earned >= g.need ? `${g.earned} of ${g.need} \u2713${g.earned > g.need ? ` (${g.earned - g.need} over)` : ''}` : `${g.earned} of ${g.need}: ${g.need - g.earned} to go`)),
            h('div', { class: 'goalbar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': g.need, 'aria-valuenow': Math.max(0, g.earned) }, h('i', { style: `width:${Math.round(g.frac * 100)}%` })),
            h('p', { class: 'hint' }, `${g.vp} victory point${g.vp === 1 ? ' is' : 's are'} riding on this goal. ${how[g.cat]}`),
            partsEl(g),
            h('details', { class: 'sr-math' }, h('summary', {}, sumUp(g.cat) || 'The arithmetic'),
                r ? h('p', { class: 'hint' }, r.diff < 0
                    ? `Short by ${Math.abs(r.diff / 3)}, counted three times (${r.diff}), divided by ${FACTORS[g.cat]} and rounded\u00A0down:\u00A0${r.basic}. Bonus ${r.basic}\u00A0\u00D7\u00A0${vp[g.cat] ?? 0}\u00A0VP\u00A0=\u00A0${r.bonus}.`
                    : `Over by ${r.diff}, divided by ${FACTORS[g.cat]} and rounded\u00A0down:\u00A0${r.basic}. Bonus ${r.basic}\u00A0\u00D7\u00A0${vp[g.cat] ?? 0}\u00A0VP\u00A0=\u00A0${r.bonus}.`) : null));
    };
    // where a goal's figure comes from: the recorded part, then one line per belonging that adds to it
    const parts = cat => {
        if (cat === 'fame' || cat === 'notoriety') {
            const own = belong(cat), rec = G.st.ch[cat] ?? 0;
            return [[`Recorded ${NAME[cat]} (earned so far)`, rec], ...own.map(x => [x.name, x.v]), ...(own.length ? [] : [['What you own adds nothing', 0]])];
        }
        if (cat === 'great') return G.st.ch.items.filter(i => !i.destroyed && (i.card ? G.data.treasures[i.card] : defOf(G.data, i))?.great).map(i => [nameOf(G.data, i), 1]);
        if (cat === 'gold') return [['Gold you hold', G.st.ch.gold], ['Your starting value (gold and the price of your first gear)', -(G.st.ch.startValue ?? 10)]];
        return [];
    };
    // what the goods would fetch if he sold the lot at their printed prices: for his information only, it never changes the score
    const saleRows = () => G.st.ch.items.filter(i => !i.destroyed).map(i => [nameOf(G.data, i), priceOf(G.data, i)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const saleEl = g => {
        const list = saleRows(), sum = list.reduce((a, x) => a + x[1], 0), start = G.st.ch.startValue ?? 10;
        if (g.cat !== 'gold') return null;
        return h('details', { class: 'sr-parts sr-sale' }, h('summary', {}, `If you sold everything you own: ${G.st.ch.gold + sum - start} of ${g.need}`),
            h('p', { class: 'hint' }, 'For your information only: it does not change your score. Only gold in hand counts, and trading prices vary with the roll.'),
            ...list.map(([n, v]) => h('div', { class: 'sr-part' }, h('span', {}, n), h('b', {}, `+${v}`))),
            h('div', { class: 'sr-part' }, h('span', {}, 'Gold you hold'), h('b', {}, String(G.st.ch.gold))),
            h('div', { class: 'sr-part' }, h('span', {}, 'Your starting value'), h('b', {}, String(-start))),
            h('div', { class: 'sr-part total' }, h('span', {}, `Gold would stand at (${g.need} needed)`), h('b', {}, String(G.st.ch.gold + sum - start))));
    };
    const partsEl = g => {
        const rowsOf = parts(g.cat);
        if (!rowsOf.length) return null;
        return h('div', {}, h('details', { class: 'sr-parts' }, h('summary', {}, `Where the ${g.earned} comes from`),
            ...rowsOf.map(([n, v]) => h('div', { class: 'sr-part' }, h('span', {}, n), h('b', {}, v > 0 && g.cat !== 'great' ? `+${v}` : String(v)))),
            h('div', { class: 'sr-part total' }, h('span', {}, 'Total'), h('b', {}, String(g.earned)))), saleEl(g));
    };
    const idle = CATS.filter(c => !(need[c] > 0));
    return modal(G, 'Your goals', h('div', { class: 'scoresheet' },
        ask(over ? `Final score: ${sign(res.total ?? -100)}${res.dead ? ' (dead characters score -100)' : (res.total >= 0 ? ': a win' : ': not enough')}`
            : res.dead ? 'You are dead: a dead character scores -100.' : `Score ${sign(res.total ?? 0)}. You have reached ${pr.met} of your ${pr.count} goals.`,
            over ? 'The game is over; this is how each goal finished.'
                : 'You win if your total is zero or more when the game ends. Going past a goal earns bonus points; ending short of one costs points, counted three times over.'),
        ...pr.goals.map(goalCard),
        idle.length ? h('details', { class: 'sr-idle' }, h('summary', {}, 'Goals you put no points on'),
            ...idle.map(c => h('p', { class: 'hint' }, `${NAME[c]}: need 0, earned ${e[c]}. ${r0(c)}`))) : null,
        h('div', { class: 'scorerow2 ifnow' },
            h('div', { class: 'sr-head' }, h('b', {}, over ? 'Final total' : 'If the game ended right now'), h('span', {}, res.dead ? '-100' : sign(res.total ?? 0))),
            h('p', { class: 'hint' }, over ? 'Zero or more is a win.' : 'The score is only worked out for real at the end. Early on it is always low, because every goal still counts as short; it rises as you earn.')),
        h('details', { class: 'sr-math' }, h('summary', {}, 'How the score is worked out'),
            h('p', {}, 'At the start you spread your victory points over five goals. A goal\'s need is its points times its factor: Great Treasures 1, Spells 2, Fame 10, Notoriety 20, Gold 30.'),
            h('p', {}, 'For each goal: points = (earned \u2212 need) \u00F7 factor, rounded down, and a shortfall is counted three times. The bonus is those points times the victory points you put on that goal. Your total is every goal\'s points plus bonus.'),
            h('p', {}, 'A total of zero or more is a win. A character who dies scores \u2212100. At the end, belongings too heavy for your strongest Move chit (or horse or boots) are put down before anything is counted.'))), { close: () => { G.ui.sheet = null; render(G); } });
    function r0(c) { const r = rows.find(x => x.cat === c); return r ? sumUp(c) + '.' : ''; }
}

// The printed Treasure Set Up Card in full: it is the same for every game, so every player may read it.
export function setupCardSheet(G) {
    const c = G.data.setupcard;
    const guardName = id => G.data.monsters[id]?.name ?? id;
    const monsterArt = name => G.data.art?.monstersColor?.[name] ?? G.data.art?.monsters?.[name] ?? null;
    const pips = (n, cls) => Array.from({ length: n }, () => h('i', { class: `pip ${cls}` }));
    const treasureRow = e => h('div', { class: 'sc-treasure' },
        e.small ? h('span', { class: 'sc-t', title: 'Small treasures' }, ...pips(e.small, 'small'), h('small', {}, `${e.small} Small`)) : null,
        e.large ? h('span', { class: 'sc-t', title: 'Large treasures' }, ...pips(e.large, 'large'), h('small', {}, `${e.large} Large`)) : null,
        ...(e.spells ?? []).map(t => h('span', { class: 'sc-spell', title: `A spell of Type ${t}` }, t)));
    const found = name => G.st.chits.some(ch => ch.name === name && G.st.ch.discovered.sites.includes(ch.id));
    const need = e => e.special ? e.special.replace('fatigue_asterisk', 'an asterisk of effort').replace('fatigue_t,key', 'a Tremendous chit or the Lost Keys') : null;
    const siteCard = e => {
        const gn = guardName(e.guardian), art = monsterArt(gn);
        return h('div', { class: `sc-card site${found(e.name) ? ' found' : ''}` },
            h('div', { class: 'sc-head' }, mrChit({ kind: 'site', name: e.name, num: e.chitNumber }),
                h('div', { class: 'sc-title' }, found(e.name) ? h('em', {}, 'discovered') : h('small', {}, 'not yet found'))),
            h('div', { class: 'sc-guard' }, art ? h('img', { src: art, alt: '' }) : null, h('span', {}, h('b', {}, gn), h('small', {}, `comes on Monster Roll ${e.row}`))),
            treasureRow(e),
            need(e) ? h('div', { class: 'sc-need' }, `Needs ${need(e)}`) : null);
    };
    const nativeArt = group => { const n = Object.values(G.data.natives ?? {}).find(x => x.group === group && x.leader) ?? Object.values(G.data.natives ?? {}).find(x => x.group === group); return n ? G.data.art?.natives?.[n.id] : null; };
    const goodsArt = name => picOf(G, name);
    const dwellingCard = e => h('div', { class: 'sc-card dwelling' },
        h('div', { class: 'sc-head' }, G.data.art?.dwellings?.[e.name] ? h('img', { class: 'sc-dw', src: G.data.art.dwellings[e.name], alt: '' }) : null,
            h('div', { class: 'sc-title' }, h('b', {}, e.name), h('small', {}, e.group + (e.virtual ? ' (come with the group)' : '')))),
        h('div', { class: 'sc-natives' }, nativeArt(e.group) ? h('img', { src: nativeArt(e.group), alt: '' }) : null, h('span', {}, h('b', {}, `${e.nativeCounters}`), h('small', {}, ' native counters'))),
        e.treasures?.small ? treasureRow({ small: e.treasures.small }) : null,
        Object.keys(e.treasures?.counters ?? {}).length ? h('div', { class: 'sc-goods' }, ...Object.entries(e.treasures.counters).map(([n, k]) =>
            h('span', { class: 'sc-good' }, goodsArt(n) ? h('img', { src: goodsArt(n), alt: '' }) : null, `${n}${k > 1 ? ` \u00D7${k}` : ''}`))) : null);
    const twtCard = e => h('div', { class: 'sc-card twt' }, h('b', {}, e.name),
        h('div', { class: 'sc-treasure' }, ...pips(e.largeTreasures, 'large'), h('small', {}, `${e.largeTreasures} Large`)),
        h('small', {}, [e.goldReward ? `${e.goldReward} gold` : '', e.needsKey ? 'needs the Lost Keys' : '', e.curse ? 'carries a curse' : '', e.siteCard ? 'searched with its own table' : ''].filter(Boolean).join(' \u00B7 ')));
    const visitorCard = e => h('div', { class: 'sc-card visitor' }, h('b', {}, e.name), treasureRow({ small: e.small, spells: e.spells }));
    const byKind = {}; for (const e of c.spellContainers ?? []) (byKind[e.kind] ??= []).push(e);
    const KIND_LABEL = { book: 'Spell books', artifact: 'Artifacts', site: 'Treasure sites', visitor: 'Visitors' };
    return modal(G, 'The Setup Card', h('div', { class: 'setupcard graphic' },
        h('p', { class: 'hint' }, 'What the printed card says, true in every game. What is in a pile, and in which order, is hidden until it is looted.'),
        h('div', { class: 'sc-key' }, h('span', {}, h('i', { class: 'pip small' }), ' Small treasure'), h('span', {}, h('i', { class: 'pip large' }), ' Large treasure'), h('span', {}, h('i', { class: 'sc-spell' }, 'II'), ' Spell (its type)')),
        h('h3', {}, 'Treasure sites'), h('div', { class: 'sc-grid' }, ...(c.sites ?? []).map(siteCard)),
        h('h3', {}, 'Dwellings'), h('div', { class: 'sc-grid' }, ...(c.dwellings ?? []).map(dwellingCard)),
        h('h3', {}, 'Treasures within Treasures'), h('div', { class: 'sc-grid' }, ...(c.twt ?? []).map(twtCard)),
        h('h3', {}, 'Visitors'), h('div', { class: 'sc-grid' }, ...(c.visitors ?? []).map(visitorCard)),
        h('h3', {}, 'Spell books and artifacts'),
        ...Object.entries(byKind).map(([k, list]) => h('div', { class: 'sc-spells' }, h('small', {}, KIND_LABEL[k] ?? k),
            h('div', { class: 'sc-chips' }, ...list.map(e => h('span', { class: 'sc-chip' }, e.name, ...e.spells.map(t => h('i', { class: 'sc-spell' }, t))))))),
        h('p', { class: 'hint' }, c.notes ?? '')), { close: () => { G.ui.sheet = 'menu'; render(G); } });
}
