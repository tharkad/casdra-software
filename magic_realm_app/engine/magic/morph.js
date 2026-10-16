import { lvl } from '../core.js';
import { slotsOf } from '../items.js';
import { fxTags, HERO, sameRef } from './fx.js';

// The hero becomes a creature (Absorb Essence, Transform aimed at himself; the same mode will serve Melt into Mist's mist if it wants one).
// docs/design/magic/03-control-spells.md section 14 (Implementation notes, "hero morph mode") says what the rest of the engine does about it.
//
//   st.ch.morph = { fx, kind: 'absorb'|'transform', creature, pin }          present exactly while a live spell shapes him
//   creature = { name, vuln, size, armored, flies, light, dark, red, parts, fame, notor, mon?, row? }      a copy of the counter, so a save does not need the data
//   a side = { harm, stars, atk, move, length, attack: 'weapon'|'spell'|'none', spell }
//
// While it is set he plays "dummy chits" made from the creature's numbers instead of his own Fight and Move chits (RS CharacterChitComponent, CombatFrame
// getAvailableManeuverOptions: the transmorphed character is offered the monster's move and fight chit), harm lands on the creature (its vulnerability,
// never a wound), his belongings do not work, and he does nothing in the day but move, hide, search and alert (RS CharacterWrapper.actionIsValid:2178).

export const heroMorph = st => st.ch?.morph ?? null;

const side = s => (s ? { harm: s.harm ?? null, stars: s.stars ?? 0, atk: s.attackTime ?? null, move: s.moveTime ?? null, length: s.length ?? 0, attack: s.attack ?? 'weapon', spell: s.spell ?? null } : null);

// A monster's counter as a creature the hero can be (Absorb Essence).
export function creatureOfMonster(data, id) {
    const m = data.monsters[id];
    return {
        name: m.name, mon: id, family: m.family, vuln: m.vulnerability, size: m.size, armored: !!m.armored, flies: !!m.flies, fame: m.fame ?? 0, notor: m.notoriety ?? 0,
        light: side(m.light), dark: side(m.dark), red: side(m.red),
        parts: (m.parts ?? []).map(p => ({ id: p.id, name: p.name, light: side(p.light), dark: side(p.dark) })),
    };
}
// A row of the Transform Table as a creature (Transform): one side, no head or club, no bounty of its own.
export function creatureOfRow(row) {
    return {
        name: row.name, row: row.roll, vuln: row.vulnerability, size: row.vulnerability, armored: !!row.armored, flies: !!row.flies, fame: 0, notor: 0,
        light: { harm: row.strength ?? null, stars: 0, atk: row.attackTime ?? null, move: row.moveTime ?? null, length: 0, attack: row.strength ? 'weapon' : 'none', spell: null },
        dark: null, red: null, parts: [],
    };
}

// ---- the dummy chits ----
// A counter has one face up at a time; a Medium or Heavy monster may be played either side up each time he plays it (it is not a change of tactics); a Tremendous
// one shows its red side only after it has hit what he is fighting (`pin` holds that creature's counter uid) and may be turned red side down again at will.
// The creature a Tremendous counter is holding, if it is still there to be held (dead or gone: the counter is red side down again).
export const livePin = st => {
    const m = heroMorph(st);
    return m?.pin && st.combat?.dens?.some(d => d.uid === m.pin && !d.dead) ? m.pin : null;
};
export function sidesOf(st, kind) {
    const m = heroMorph(st);
    if (!m) return [];
    const cr = m.creature, out = ['light'];
    if (cr.dark) out.push('dark');
    if (cr.red && livePin(st)) out.push('red');
    return out.filter(s => (kind === 'fight' ? cr[s]?.atk != null && (cr[s].harm != null || cr[s].attack === 'spell') : cr[s]?.move != null));
}
const SIDE_WORD = { light: 'light side', dark: 'dark side', red: 'red side' };
// The chits he may play, of type 'fight' or 'move' (or both). They are never fatigued (no effort) and are played once a round each, whichever side is up.
export function morphChits(st, type) {
    const m = heroMorph(st);
    if (!m) return [];
    const cr = m.creature, out = [];
    for (const kind of type ? [type] : ['fight', 'move']) {
        for (const sd of sidesOf(st, kind)) {
            const s = cr[sd];
            if (kind === 'fight') out.push({ id: `morph:fight:${sd}`, type: 'fight', strength: s.attack === 'spell' ? 'T' : s.harm, stars: s.stars, time: s.atk, length: s.length, effort: 0, state: 'active', morph: true, side: sd, spell: s.attack === 'spell' ? s.spell : null,
                name: `${cr.name} (${SIDE_WORD[sd]})` });
            else out.push({ id: `morph:move:${sd}`, type: 'move', strength: cr.vuln, time: s.move, effort: 0, state: 'active', morph: true, side: sd, name: `${cr.name} (${SIDE_WORD[sd]})` });
        }
    }
    return out;
}
// The head or club of an absorbed monster, playable as a second attack against his target, either side up (Absorb Essence 2.1).
export function morphParts(st) {
    const m = heroMorph(st);
    return (m?.creature.parts ?? []).map(p => ({ id: p.id, name: p.name, sides: ['light', 'dark'].filter(sd => p[sd]?.atk != null).map(sd => ({ side: sd, ...p[sd] })) }));
}
// A summary for the screens: who he is, what he fights with.
export function morphView(st) {
    const m = heroMorph(st);
    if (!m) return null;
    const cr = m.creature;
    return { fx: m.fx, kind: m.kind, name: cr.name, vuln: cr.vuln, armored: cr.armored, flies: cr.flies, sides: { fight: sidesOf(st, 'fight'), move: sidesOf(st, 'move') }, pin: livePin(st), parts: morphParts(st).map(p => ({ id: p.id, name: p.name })) };
}

// ---- putting the form on and off ----
// Absorb Essence: his belongings are not transmorphized, but they do not work: every active one is switched off, remembered, and switched on again when the form
// ends (RS TransmorphEffect:291-296, 92-113). Transform: his recorded gold and belongings (horses included) are transmorphized with him: they go into the spell and
// come back, merged with what he gained meanwhile, when the form ends (RS :236-250, 152-161).
export function putOn(st, data, fx, creature, { hold }) {
    st.ch.morph = { fx: fx.id, kind: hold ? 'transform' : 'absorb', creature, pin: null };
    if (hold) {
        fx.data.hold = { items: st.ch.items.splice(0), gold: st.ch.gold };
        st.ch.gold = 0;
    } else {
        fx.data.activated = st.ch.items.filter(i => i.active && !i.destroyed).map(i => i.uid);
        for (const it of st.ch.items) if (it.active) { it.active = false; if (it.kind === 'weapon') it.alerted = false; }
    }
}
export function takeOff(st, data, fx) {
    if (st.ch.morph?.fx !== fx.id) return;
    st.ch.morph = null;
    if (fx.data.hold) {
        const { items, gold } = fx.data.hold;
        st.ch.gold += gold;
        // what he picked up meanwhile may have switched itself on; the older belongings keep their places
        const old = new Set(items.flatMap(it => (it.active ? slotsOf(data, it) : [])));
        for (const it of st.ch.items) if (it.active && slotsOf(data, it).some(s => old.has(s))) it.active = false;
        st.ch.items = [...items, ...st.ch.items];
        fx.data.hold = null;
    }
    if (fx.data.activated) {
        const taken = new Set(st.ch.items.filter(i => i.active).flatMap(i => slotsOf(data, i)));
        for (const uid of fx.data.activated) {
            const it = st.ch.items.find(i => i.uid === uid);
            if (!it || it.destroyed || it.active) continue;
            const slots = slotsOf(data, it);
            if (slots.some(s => taken.has(s))) continue;
            it.active = true; slots.forEach(s => taken.add(s));
        }
        fx.data.activated = null;
    }
}
// A new spell that comes alive under a Pentangle or another shield on him is held with it (restored when the shield ends).
export function holdUnderShield(st, fx) {
    const shield = fxTags(st, HERO, 'shield').find(t => t.fx !== fx)?.fx;
    if (!shield) return false;
    shield.data.held = [...(shield.data.held ?? []), fx.id];
    fx.state = 'nullified';
    return true;
}

// What he can carry while he is a creature: no more than its vulnerability weight (RS CharacterWrapper:863-868, WeightTest testTransmorphDragonCarryT).
export const morphCapacity = st => lvl(heroMorph(st).creature.vuln);

// The reasons the day activities are refused (RS actionIsValid: a transmorphed character cannot Trade, Hire, cast or Enchant; ActionRow:1352 no Rest).
export const MORPH_REFUSED = {
    rest: 'You cannot rest in this shape.',
    trade: 'Nobody will trade with a creature.',
    hire: 'Nobody will take hire from a creature.',
    enchant: 'You cannot work magic in this shape.',
};

export { sameRef };
