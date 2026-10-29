// combat/payload.js: every action the combat scene sends to the engine, built in one place and without any DOM. The old fight sheet (screens/combatui.js, still used by the shared fight)
// sends the same objects, key for key and in the same order: tests/combat_scene.test.mjs runs a frozen copy of the old builders and these on the same states and compares the JSON.
// The scene calls `act(payload)`; nothing here knows about the screen.
const A = a => ({ type: 'combat', ...a });

export const pay = yes => A({ kind: 'pay', pay: yes });
export const drinks = buy => A({ kind: 'drinks', buy });
export const choice = fight => A({ kind: 'choice', fight });
export const over = () => A({ kind: 'over' });

// ---- the Encounter step: one action before the melee ----
export const pass = () => A({ kind: 'encounter', act: 'pass' });
export const stay = () => A({ kind: 'encounter', act: 'stay' });
export const alert = chit => A({ kind: 'encounter', act: 'alert', chit });
export const berserk = chit => A({ kind: 'encounter', act: 'berserk', chit });
export const run = (chit, to) => A({ kind: 'encounter', act: 'run', chit, to });
export const fly = (chit, to) => A({ kind: 'encounter', act: 'fly', chit, to });
export const protect = fx => A({ kind: 'encounter', act: 'protect', fx });
export const cast = x => A({ kind: 'encounter', act: 'cast', spell: x.spell, chit: x.chit, item: x.item });
export const castAimed = (x, aim) => A({ ...{ kind: 'encounter', act: 'cast', spell: x.spell, chit: x.chit, item: x.item }, spellAim: { [x.spell]: aim } });
export const gear = (item, drop = false) => A(drop ? { kind: 'encounter', act: 'gear', item, drop: true } : { kind: 'encounter', act: 'gear', item });

// one Encounter action may switch one belonging on and another off (8.3.7d): the list goes as `items`; a single belonging keeps the old `item` shape
export const gearItems = items => (items.length === 1 ? gear(items[0]) : A({ kind: 'encounter', act: 'gear', items: [...items] }));

// ---- what a spell is aimed at: the choices kept for it, else the first sensible answer ----
export const aimOf = (a, store) => ({ targets: store.aim?.[a.spell] ?? a.options.slice(0, a.min).map(x => x.ref), params: store.aimParams?.[a.spell] ?? {} });

// ---- the Melee step. `o` is meleeOptions(), `m` the plan in progress: { target, fightChit, attackDir, moveChit, moveDir, shieldDir, boxes, weaponSide, parts, aim, aimParams } ----
export function melee(o, m) {
    const w = o.weapon;
    const boxes = {}; o.boxable.forEach((d, i) => { boxes[d.uid] = m.boxes[d.uid] ?? (i % 3); });
    const spellAim = {}; for (const a of o.aims ?? []) spellAim[a.spell] = aimOf(a, m);
    return A({ kind: 'melee', weaponSide: m.fightChit && !m.target && w ? (m.weaponSide ?? 'alerted') : undefined, parts: m.parts && Object.keys(m.parts).length ? { ...m.parts } : undefined, target: m.target, fightChit: m.fightChit, attackDir: m.attackDir, moveChit: m.moveChit, moveDir: m.moveDir, shieldDir: o.shield ? m.shieldDir : null, boxes, spellAim, ...(m.secx ?? {}) });          // (m.secx: what the hirer chose on Melee Sections: hireTargets, hireSides, positions; combat/sections.js)
}
// The Melee step in two answers (S8, R3): the spells first. They act before anyone plays a chit, and the options are read again after them.
export function aim(o, m) {
    const spellAim = {}; for (const a of o.aims ?? []) spellAim[a.spell] = aimOf(a, m);
    return A({ kind: 'aim', spellAim });
}
// Battle Bracelets / Elusive Cloak: the plays are revealed and the dice have moved the creatures; he may still move his attack circle or maneuver square.
export function shift(o, sh) {
    const a = { kind: 'shift' };
    if (o.attack && sh.attackDir !== o.attackDir) a.attackDir = sh.attackDir;
    if (o.move && sh.moveDir !== o.moveDir) a.moveDir = sh.moveDir;
    return A(a);
}
export const wounds = chits => A({ kind: 'wounds', chits });
export const fatigue = (chits, change) => A({ kind: 'fatigue', chits, change });
