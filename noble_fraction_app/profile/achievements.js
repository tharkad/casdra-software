// Pure achievement definitions. `check(ctx)` takes { game, lifetime }:
//  - game: a summarizeGame() result (possibly of a game still in progress)
//  - lifetime: the lifetime AFTER merging the current game for when:'final' checks,
//    otherwise the lifetime so far.
// 'live' achievements may be earned mid-game; 'final' ones are only evaluated once the game is over.

const win = g => g.result === 'win';

const A = (id, name, text, group, glyph, when, check) => ({ id, name, text, group, glyph, when, check });

export const ACHIEVEMENTS = [
    // ---- play ----
    A('first_light', 'First Light', 'Finish your first game.', 'play', 'intake_fan', 'final', ({ lifetime }) => lifetime.gamesPlayed >= 1),
    A('regular', 'Regular Operator', 'Play 10 games.', 'play', 'shift_engineer', 'final', ({ lifetime }) => lifetime.gamesPlayed >= 10),
    A('plant_veteran', 'Plant Veteran', 'Play 25 games.', 'play', 'packed_tower', 'final', ({ lifetime }) => lifetime.gamesPlayed >= 25),
    A('win_easy', 'Warm-Up Win', 'Beat the Rival on Easy.', 'play', 'gas_reclaimer', 'final', ({ game }) => win(game) && game.level === 'easy'),
    A('win_normal', 'Shift Supervisor', 'Beat the Rival on Normal.', 'play', 'procurement_agent', 'final', ({ game }) => win(game) && game.level === 'normal'),
    A('win_hard', 'Master Fractionator', 'Beat the Rival on Hard.', 'play', 'molecular_sieve', 'final', ({ game }) => win(game) && game.level === 'hard'),
    A('hat_trick', 'Hat Trick', 'Win three games in a row.', 'play', 'return_loop', 'final', ({ lifetime }) => lifetime.bestStreak >= 3),
    A('ten_wins', 'Ten Barrels', 'Win 10 games.', 'play', 'reserve_fund', 'final', ({ lifetime }) => lifetime.wins >= 10),

    // ---- skill ----
    A('shutout', 'Shutout', 'Win by 15 VP or more.', 'skill', 'spotless_audit', 'final', ({ game }) => win(game) && game.margin >= 15),
    A('photo_finish', 'Photo Finish', 'Win by 2 VP or less.', 'skill', 'flow_regulator', 'final', ({ game }) => win(game) && game.margin <= 2),
    A('comeback', 'Comeback Kid', 'Win after trailing by 8 VP or more.', 'skill', 'freelance_fitter', 'final', ({ game }) => win(game) && game.maxDeficit >= 8),
    A('wire_to_wire', 'Wire to Wire', 'Win without ever trailing.', 'skill', 'floor_broker', 'final', ({ game }) => win(game) && game.maxDeficit === 0),
    A('rainy_day', 'Rainy Day Fund', 'Finish a game holding $15 or more.', 'skill', 'ph_buy', 'final', ({ game }) => game.over && game.money >= 15),
    A('mains_magnate', 'Mains Magnate', 'Finish a game owning all three Mains.', 'skill', 'pipe_main', 'final', ({ game }) => game.over && game.mains >= 3),
    A('slow_steady', 'Slow and Steady', 'Win without taking a Night Shift.', 'skill', 'ph_distill', 'final', ({ game }) => win(game) && game.nightShifts === 0),
    A('night_owl', 'Night Owl', 'Take a Night Shift turn.', 'skill', 'cold_turbine', 'live', ({ game }) => game.nightShifts >= 1),

    // ---- plant ----
    A('cold_storage', 'Cold Storage', 'Isolate 4 or more Xe in a single turn.', 'plant', 'cryo_chiller', 'live', ({ game }) => game.maxXeIsolatedInOneTurn >= 4),
    A('special_delivery', 'Special Delivery', 'Buy a Contract and complete it the same turn.', 'plant', 'deal_maker', 'live', ({ game }) => game.boughtAndCompletedSameTurn === true),
    A('blockbuster', 'Blockbuster', 'Complete a Contract worth 8 VP or more.', 'plant', 'sales_director', 'live', ({ game }) => game.biggestContractVp >= 8),
    A('contract_spree', 'Contract Spree', 'Complete 3 Contracts in one game.', 'plant', 'account_manager', 'live', ({ game }) => game.contractsCompleted >= 3),
    A('heat_wave', 'Heat Wave', 'Collect $3 or more from Heat Exchangers at once.', 'plant', 'heat_exchanger', 'live', ({ game }) => game.heatWaveMax >= 3),
    A('all_tokens_out', 'All Tokens Out', 'Have all 5 of your Bid Tokens on the table at once.', 'plant', 'ph_bid', 'live', ({ game }) => game.allTokensOut === true),
    A('bidding_frenzy', 'Bidding Frenzy', 'Place 5 or more Bids in a single turn.', 'plant', 'sampling_port', 'live', ({ game }) => game.maxBidsInOneTurn >= 5),
    A('fully_upgraded', 'Fully Upgraded', 'Install 5 Upgrades in one game.', 'plant', 'ph_any', 'live', ({ game }) => game.upgradesInstalled >= 5),
    A('clean_sweep', 'Clean Sweep', 'Purge a line 3 times in one game.', 'plant', 'ph_purge', 'live', ({ game }) => game.purges >= 3),
];

const BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
export const achievementById = id => BY_ID.get(id) ?? null;

// Ids earned now that are not in `unlocked`. While the game is in progress (`final` false) only the
// 'live' achievements are looked at; once it is over, 'final' ones are checked too.
export function evaluate({ unlocked = {}, game, lifetime, final = false }) {
    const have = unlocked ?? {};
    return ACHIEVEMENTS
        .filter(a => !Object.hasOwn(have, a.id))
        .filter(a => final || a.when === 'live')
        .filter(a => a.check({ game, lifetime }))
        .map(a => a.id);
}
