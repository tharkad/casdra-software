// gamesettings.js: the settings a game was begun with, read from the VIEW of a game in progress, as rows of { id, title, value, line } (note 108). Pure (no DOM, no engine): play/sheet_settings.js draws them in the
// Menu's Settings look, marked as fixed (they cannot change once the game has begun) beside the controls that can (reading size, voice ...).
//   gameSettingRows(view, { groups, params }) -> rows
//   view     `api.view(...)` of the game: table.game (mode, lastDay, day, options, players), table.missions, me.vp, me.standing.targets
//   groups   the optional rules as the New Game screen lists them (options_list.js, plus leaders.js HIRELING_GROUP): [{ title, items: [{ k, title, line, rule }] }]
//   params   what the game was begun with, when the screen has it (the game record's `params`): the seed and the place he began at

const GOALS = [['fame', 'Fame'], ['notoriety', 'Notoriety'], ['gold', 'Gold'], ['spells', 'Spells'], ['great', 'Great treasure']];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function gameSettingRows(view, { groups = [], params = null } = {}) {
    const g = view?.table?.game ?? {}, rows = [];
    const day = g.day ?? 1, last = g.lastDay ?? 28;
    // how long
    if (g.mode === 'sudden') rows.push({ id: 'length', title: 'How long', value: 'Sudden death', line: `Ends at the first midnight someone has met every goal. Day ${day} now.` });
    else if (g.mode === 'endless') rows.push({ id: 'length', title: 'How long', value: 'Endless', line: `No last day and no scoring. Day ${day} now.` });
    else rows.push({ id: 'length', title: 'How long', value: `${last} days`, line: `${last === 28 ? 'A month: four weeks.' : `${last / 7 === Math.round(last / 7) ? plural(last / 7, 'week') : `${last} days`}.`} Day ${day} of ${last}.` });
    // what he plays for: the points he spread over the goals, and what each goal asks
    const vp = view?.me?.vp ?? null, need = view?.me?.standing?.targets ?? {};
    if (vp) {
        const parts = GOALS.filter(([k]) => (vp[k] ?? 0) > 0).map(([k, label]) => `${label} ${need[k] ?? 0} (${plural(vp[k], 'point')})`);
        const total = GOALS.reduce((n, [k]) => n + (vp[k] ?? 0), 0);
        rows.push({ id: 'goals', title: 'What you play for', value: plural(total, 'point'), line: parts.length ? `${parts.join(', ')}.` : 'No goals set.' });
    }
    // the optional rules, as the New Game screen worded them
    const opts = g.options ?? {};
    for (const grp of groups) for (const o of grp.items) rows.push({ id: o.k, title: o.title, value: opts[o.k] ? 'On' : 'Off', line: o.line, rule: o.rule, group: grp.title });
    rows.push({ id: 'missions', title: 'Missions and campaigns', value: view?.table?.missions ? 'On' : 'Off', line: 'Visitors, missions and campaigns lie in the realm.', group: 'Visitors' });
    // a table of several players
    if ((g.players ?? []).length > 1) {
        rows.push({ id: 'pvp', title: 'Players may fight each other', value: opts.pvp ? 'On' : 'Off', line: opts.pvp ? 'A character can charge another player’s character in the evening.' : 'Nobody can attack another player’s character.', group: 'The table' });
        rows.push({ id: 'dayEnd', title: 'Trade at the end of the day', value: opts.dayEnd !== false ? 'On' : 'Off', line: 'After the evening’s fights, characters who stand together may trade before Midnight.', group: 'The table' });
    }
    // the realm and where he began
    if (params?.seed != null) rows.push({ id: 'realm', title: 'The realm', value: `Seed ${params.seed}`, line: params.startDwelling ? `You began at the ${params.startDwelling}.` : 'The same seed always lays out the same realm.', group: 'The realm' });
    return rows;
}
