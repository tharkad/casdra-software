// goalspread.js: how a game's victory points are spread over the five goals when nobody chose (the New Game screen's quick start and the roguelike's runs share it).
// Fame takes the larger part (about three in five, at most five), Notoriety the rest up to five, Gold what is left over; Great Treasures and Spells none. For the usual five points that is the engine's own
// default (Fame 3, Notoriety 2), for two it is Fame 2.
export const spreadVp = total => {
    const fame = Math.min(5, Math.ceil(total * 0.6)), notoriety = Math.min(5, total - fame);
    return { great: 0, spells: 0, fame, notoriety, gold: Math.max(0, total - fame - notoriety) };
};
