// Noble Fraction card data. Names, wording and art are original to this game; the numbers are the
// game's own balance table. `phase` is the icon the card shows (when it is used), `ability` a tag
// engine/abilities.js acts on, and `glyph` the id of its artwork in ui/art/glyphs.js.

const element = (id, name) => ({ id, kind: 'element', name, glyph: 'element_ring' });

// Upgrades: buy cost, cost to install LATER from hand (installDiff), total to install straight
// from the line (installTotal). A null installDiff means the card can never be installed.
const upgrade = (id, name, buy, installDiff, copies, phase, ability, text) => ({
    id, kind: 'upgrade', name, glyph: id, buy, copies, phase, ability, text,
    pink: installDiff === null,
    installDiff,
    installTotal: installDiff === null ? null : buy + installDiff,
});

const starter = (id, name, installCost, phase, ability, text) => ({
    id, kind: 'starter', name, glyph: id, buy: 0, pink: false, copies: 0,
    installDiff: installCost, installTotal: installCost, phase, ability, text,
});

const contract = (id, name, sector, xe, money, vp) => ({
    id, kind: 'contract', name, glyph: id, sector, xe, money, vp, buy: 0, copies: 1,
});

const pipeline = (id, name, color) => ({
    id, kind: 'pipeline', name, glyph: 'pipe_main', color, buy: 5, copies: 2,
    text: 'Your hand size goes up by one.',
});

export const SECTORS = {
    health: { name: 'Health', glyph: 'sec_health', hue: 200 },
    showbiz: { name: 'Showbiz', glyph: 'sec_showbiz', hue: 32 },
    aerospace: { name: 'Aerospace', glyph: 'sec_aero', hue: 140 },
};

export const PHASES = {
    distill: 'DISTILL', air: 'INTAKE', wipe: 'PURGE', bid: 'BID', buy: 'BUY', any: 'ANY TIME', end: 'GAME END', passive: 'ALWAYS',
};

const DEFS = [
    element('N', 'Nitrogen'),
    element('O', 'Oxygen'),
    element('Kr', 'Krypton'),
    element('Xe', 'Xenon'),

    starter('intake_fan', 'Intake Fan', 8, 'air', 'feed', 'Bring in two air packets at once (+$4).'),
    starter('return_loop', 'Return Loop', 4, 'distill', 'return_loop', 'Send one card from your hand to your discard pile.'),

    upgrade('floor_broker', 'Floor Broker', 2, 5, 2, 'bid', 'floor_broker', 'You may Bid and Buy in the same step.'),
    upgrade('cold_turbine', 'Cold Turbine', 2, 5, 2, 'any', 'addKrXe', 'Add one Kr and one Xe to your discard pile.'),
    upgrade('gas_reclaimer', 'Gas Reclaimer', 2, null, 1, 'any', 'addXe', 'Add one Xe to your discard pile.'),
    upgrade('packed_tower', 'Packed Tower', 4, 5, 2, 'any', 'lessXe', 'Use it once a turn (or play it from your hand) to finish your Contract with one less Xe (never below 1).'),
    upgrade('sampling_port', 'Sampling Port', 0, 5, 2, 'distill', 'peekDeck', 'Look at the top card of your deck, then draw it or discard it.'),
    upgrade('desiccant_bed', 'Desiccant Bed', 3, 4, 2, 'distill', 'distillAll:O', 'Remove every O from your hand.'),
    upgrade('spotless_audit', 'Spotless Audit', 3, 5, 1, 'end', 'endBonus', 'While installed: +3 VP at game end.'),
    upgrade('flow_regulator', 'Flow Regulator', 3, null, 1, 'any', 'draw3', 'Draw 3 cards from your deck.'),
    upgrade('shift_engineer', 'Shift Engineer', 1, null, 1, 'wipe', 'purgeDraw', 'When you Purge a line, draw 6 for it, keep what fits and discard the rest.'),
    upgrade('freelance_fitter', 'Freelance Fitter', 2, null, 1, 'any', 'freeInstall', 'Return this to the supply to install a card from your hand for free.'),
    upgrade('procurement_agent', 'Procurement Agent', 1, null, 1, 'buy', 'procurement_agent', 'You may Buy up to 3 cards this turn.'),
    upgrade('reserve_fund', 'Reserve Fund', 1, 6, 1, 'end', 'cashBonus', 'While installed: at game end, 1 VP per $2 you hold instead of per $5.'),
    upgrade('cryo_chiller', 'Cryo Chiller', 3, 4, 2, 'distill', 'bidPerN', 'Place a free Bid Token for each N you remove.'),
    upgrade('heat_exchanger', 'Heat Exchanger', 1, 5, 2, 'distill', 'cashPerO', 'Gain $1 for each O you remove.'),
    upgrade('sales_director', 'Sales Director', 2, 7, 1, 'end', 'completedBonus', 'While installed: +1 VP per Contract you completed at game end.'),
    upgrade('deal_maker', 'Deal Maker', 2, 6, 1, 'end', 'tokenBonus', 'While installed: +1 VP per Bid Token of yours sitting on a Contract at game end.'),
    upgrade('molecular_sieve', 'Molecular Sieve', 3, 5, 2, 'distill', 'distillAll:N', 'Remove every N from your hand.'),
    upgrade('account_manager', 'Account Manager', 2, 4, 2, 'bid', 'multiBid', 'A Bid step may place or move up to 3 of your Bid Tokens.'),

    contract('surgical_lights', 'Surgical Light Panels', 'health', 1, 0, 3),
    contract('lung_imaging', 'Lung Imaging Lab', 'health', 2, 1, 4),
    contract('eye_laser', 'Eye-Surgery Laser', 'health', 3, 1, 6),
    contract('isotope_gas', 'Blood-Flow Isotope Gas', 'health', 4, 1, 7),
    contract('uv_sterilizer', 'Hospital UV Sterilizers', 'health', 4, 0, 8),
    contract('anesthesia_unit', 'Anesthesia Recovery Units', 'health', 5, 0, 11),

    contract('stage_spotlight', 'Stage Spotlights', 'showbiz', 2, 4, 1),
    contract('gaming_display', 'Gaming Displays', 'showbiz', 3, 7, 2),
    contract('sun_simulator', 'Sunlight Simulators', 'showbiz', 2, 3, 2),
    contract('laser_cutting_line', 'Auto-Body Laser Line', 'showbiz', 3, 4, 3),
    contract('bright_headlamp', 'Bright-Beam Headlamps', 'showbiz', 3, 3, 4),
    contract('cinema_projector', 'Cinema Projectors', 'showbiz', 3, 2, 5),
    contract('phone_flash', 'Phone Flash Modules', 'showbiz', 4, 4, 6),

    contract('field_torch', 'Field Torches', 'aerospace', 1, 1, 2),
    contract('rugged_display', 'Rugged Field Displays', 'aerospace', 2, 2, 3),
    contract('reactive_lab', 'Reactive Gas Lab', 'aerospace', 2, 1, 3),
    contract('armored_searchlight', 'Armored Searchlights', 'aerospace', 2, 0, 4),
    contract('orbital_thruster', 'Orbital Thruster Tests', 'aerospace', 3, 1, 5),
    contract('runway_lights', 'Runway Landing Lights', 'aerospace', 3, 0, 6),
    contract('planetarium', 'Planetarium Dome Projector', 'aerospace', 4, 2, 7),
    contract('ion_engine', 'Deep-Space Ion Engine', 'aerospace', 5, 1, 9),

    pipeline('pipeline_n', 'Nitrogen Main', 'N'),
    pipeline('pipeline_o', 'Oxygen Main', 'O'),
    pipeline('pipeline_kr', 'Krypton Main', 'Kr'),
];

export const CARD_DEFS = Object.fromEntries(DEFS.map(d => [d.id, d]));
export const ELEMENTS = ['N', 'O', 'Kr', 'Xe'];
export const DISTILL_PRIORITY = ['N', 'O', 'Kr'];

const expand = kinds => DEFS.filter(d => kinds.includes(d.kind)).flatMap(d => Array(d.copies).fill(d.id));
export const UPGRADE_DECK = expand(['upgrade']);
export const CONTRACT_DECK = expand(['contract', 'pipeline']);
