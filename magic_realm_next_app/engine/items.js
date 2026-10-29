import { lvl } from './core.js';
import { cardChits, BOOTS, GLOVES, EXTRA, hasTreasure, extraActs } from './modifiers.js';
import { isCave } from './world.js';

// The five Enchanted cards: carried by a hired leader they stay activated (7.2.2b); he can activate nothing else.
const ENCHANTED_CARDS = new Set(['sacred-grail', 'golden-icon', 'flowers-of-rest', 'dragon-essence', 'cloven-hoof']);

// Everything a character can own is an item: { uid, kind: 'weapon'|'armor'|'horse'|'treasure', id, active, alerted, damaged, destroyed }.
export function makeItem(st, kind, id, extra = {}) {
    st.uidSeq = (st.uidSeq ?? 0) + 1;
    return { uid: 'i' + st.uidSeq, kind, id, active: false, alerted: false, damaged: false, destroyed: false, ...extra };
}

// What he has just come by, for the screen to make a fuss of (display only; the rules never read it).
export function noteGain(st, it) {
    // With `st.pauseGear` (the game screens set it) what he comes by during a Daylight phase is remembered on his turn, so the phase can end on the question where he chooses what to do
    // with it (4.3.2, 4.3.3b; day.js gearPause). Cleared when the next phase begins. Nothing is written when the option is off.
    if (st.pauseGear && st.turn && st.period === 'daylight') { const f = (st.turn.fresh ??= []); if (!f.includes(it.uid)) f.push(it.uid); }
    st.gainSeq = (st.gainSeq ?? 0) + 1;
    (st.gains ??= []).push({ n: st.gainSeq, uid: it.uid, day: st.day, ...(st.order?.length > 1 ? { who: st.actor } : null) });          // (several characters: whose find it was)
    if (st.gains.length > 40) st.gains.shift();
}

// Something he has just found that is not an item he carries: a treasure card that turns out to be a Mouldy Skeleton, a site discovered.
// { kind: 'card', id } opens the card; { kind: 'site', clearing } opens the clearing.
export function noteFind(st, f) {
    st.findSeq = (st.findSeq ?? 0) + 1;
    (st.finds ??= []).push({ n: st.findSeq, day: st.day, ...(st.order?.length > 1 ? { who: st.actor } : null), ...f });
    if (st.finds.length > 40) st.finds.shift();
}

export function defOf(data, it) {
    if (it.kind === 'spell') return { name: `Spell card (type ${it.id.replace('spell-', '')})`, weight: 'N', gold: 0 };
    return it.kind === 'weapon' ? data.weapons[it.id] : it.kind === 'armor' ? data.armor[it.id] : it.kind === 'horse' ? data.horses[it.id] : data.treasures[it.id];
}
export const nameOf = (data, it) => defOf(data, it)?.name ?? it.id;
// Weapon cards cannot be alerted (2.3.4d note): they stay face up whenever they are active and always have the values on the card. Only a weapon counter has an alerted side.
export const isWeaponCard = (data, it) => it?.kind === 'weapon' && !!data.weapons[it.id]?.card;
export const weightOf = (data, it) => defOf(data, it)?.weight ?? 'N';

// Gold a native pays for an item (damaged armor is worth less).
export function priceOf(data, it) {
    const d = defOf(data, it);
    if (!d) return 0;
    if (it.kind === 'armor') return it.damaged ? (d.priceDamaged ?? Math.floor((d.priceIntact ?? 0) * 0.7)) : (d.priceIntact ?? 0);
    return d.gold ?? d.price ?? 0;
}

// 7.3.2a (ruling R5, ch7-day.md): a horse counter with different strengths on its two sides may be used by the strength letter on either side, so for activation, for
// carrying (what a ridden horse bears) and for a pack horse the stronger of the two sides counts. (In combat each side is still its own Move chit, combat.js.)
export function horseLevel(data, h) {
    const d = data.horses[h.id];
    return d ? Math.max(lvl(d.walk.strength), lvl(d.gallop?.strength ?? d.walk.strength)) : -1;
}

// Pack horses (7.3.1i, 4.3.8b): every horse he owns that is not the one he rides is a pack horse. It carries any number of his INACTIVE items, so long as its
// strength (its walking strength) bears the weight of each; what it carries needs no Move chit of his (7.3.1e, 8.4.5f.3), even in a cave (7.3.1i.5) or when the horse
// itself is not ridden. An item in use stays with him: RealmSpeak (CharacterWrapper getNeededSupportWeight) and its test "pack horses don't support active weight".
// `except` names a horse that is about to be ridden, which can no longer be a pack horse.
export function packStrength(st, data, except = null) {
    let best = -1;
    for (const h of st.ch.items) if (h.kind === 'horse' && !h.active && !h.destroyed && h.uid !== except && data.horses[h.id]) best = Math.max(best, horseLevel(data, h));
    return best;
}
// Does a pack horse carry this item? (Only an inactive item that is not a horse itself, no heavier than the strongest pack horse.)
export const onPackHorse = (st, data, it, except = null) => it.kind !== 'horse' && !it.active && !it.destroyed && lvl(weightOf(data, it)) <= packStrength(st, data, except);

// The heaviest thing he owns bounds what he can carry when he walks (what a pack horse carries does not count).
export function carriedLevel(st, data, except = null) {
    let w = 0;
    const pack = packStrength(st, data, except);
    for (const it of st.ch.items) {
        if (it.destroyed || it.kind === 'horse') continue;
        const l = lvl(weightOf(data, it));
        if (!it.active && l <= pack) continue;
        w = Math.max(w, l);
    }
    return w;
}

// Strongest active Move chit's strength (or a horse's): what he can carry on a Move.
export function activeHorse(st) { return st.ch.items.find(i => i.kind === 'horse' && i.active && !i.destroyed) ?? null; }

export function carryCapacity(st, data) {
    if (st.ch.morph) return lvl(st.ch.morph.creature.vuln);          // a creature carries what its vulnerability weight can (RS CharacterWrapper:863-868)
    let c = st.ch.leader ? lvl(st.ch.leader.moveStrength) : -1;      // a hired leader's move strength defines the weight he can carry (7.3.1g, 7.7.5e)
    for (const x of st.ch.chits) if (x.state === 'active' && x.type === 'move') c = Math.max(c, lvl(x.strength));
    for (const x of st.ch.chits) if (x.state === 'active' && x.alt?.mf) c = Math.max(c, lvl(x.alt.strength));          // a Magic chit changed by Unleash Power carries like a Move chit
    const h = activeHorse(st);
    if (h && data.horses[h.id]) c = Math.max(c, horseLevel(data, h));
    for (const b of cardChits(st, 'move')) c = Math.max(c, lvl(b.strength));
    return c;
}

// Items beyond what he can carry are dropped where he stands when he moves.
export function dropHeavy(st, data) {
    const cap = carryCapacity(st, data);
    const dropped = [];
    st.ch.items = st.ch.items.filter(it => {
        if (it.destroyed || it.kind === 'horse') return true;
        if (onPackHorse(st, data, it)) return true;                 // a pack horse carries it (7.3.1i.2)
        if (lvl(weightOf(data, it)) > Math.max(cap, 0) && lvl(weightOf(data, it)) > 0) { dropped.push(it); return false; }
        return true;
    });
    return dropped;
}

export function abandon(st, clearing, items) {
    // new things go underneath what is already lying there
    st.abandoned[clearing] = [...(st.abandoned[clearing] ?? []), ...items.map(i => ({ ...i, active: false, alerted: false }))];
}

// One weapon at a time, and of armor one of each type: a helmet, a breastplate, a shield and a suit of armor may all be active together (rule 4.3.7: a
// breastplate is fitted over a suit, a helmet worn over its basinet); two of the same type may not. Armor cards each have a place of their own.
export function slotsOf(data, it) {
    const d = defOf(data, it);
    if (it.kind === 'weapon') return ['weapon'];
    if (it.kind === 'treasure') return BOOTS[it.id] ? ['boots'] : GLOVES[it.id] ? ['gloves'] : [];
    if (it.kind === 'armor') {
        if (d?.card) return ['card:' + it.id];
        const t = (d?.type ?? '').toLowerCase();
        if (['suit', 'helmet', 'breastplate', 'shield'].includes(t)) return [t];
    }
    return [];
}

// A potion or ointment that is used up: it is never put to use for him (using it spends it, so it is his choice and his moment).
const ONE_USE = new Set(['flowers-of-rest']);
export function isOneUse(data, it) {
    if (it.kind !== 'treasure') return false;
    const d = defOf(data, it);
    return ONE_USE.has(it.id) || /one-use|\bpotion\b/i.test(d?.effectText ?? '');
}

// Gripping Dust (Treasures 11): the weapon he has in use stays alerted side up at all times, even when it hits. Called whenever the weapon or the Dust changes.
export function keepAlerted(st, data) {
    if (!hasTreasure(st, 'gripping-dust')) return;
    const w = st.ch.items.find(i => i.kind === 'weapon' && i.active && !i.destroyed);
    if (w && !(data && isWeaponCard(data, w))) w.alerted = true;
}

// 6.2.4d: "If a character uses a Treasure card or horse to record an extra activity or an enhanced activity, he is committed to keeping that belonging and having it active when he
// does that activity. He cannot voluntarily abandon or transfer the belonging until he has finished the phase it caused." (He can still deactivate it; the phase is then lost, 7.3.2b.)
// The plan does not note which belonging caused which extra phase, so the engine counts, as extraLost (day.js) does: the extra phases still to be finished for an activity (the
// current phase included, a finished or lost turn none) against the other sources of that activity he keeps: his advantages and spells (which no one can take from him) and the
// other belongings he has active. If the plan needs this belonging for an extra phase, it is committed. Returns the sentence that says so, or null when he is free to part with it.
// Shielded Lantern: its phase ('lantern' in the plan's kinds) is for any activity, so it is counted on its own. The pony's Moves (6.2.4c) are told by the `via: 'pony'` note.
const extraSourceAct = (data, it) => {
    if (it.kind === 'horse') { const k = data.horses[it.id]?.kind; return k === 'workhorse' || k === 'pony' ? 'move' : null; }
    if (it.kind === 'treasure') return it.id === 'shielded-lantern' ? 'lantern' : EXTRA[it.id] ?? null;
    return null;
};
// 4.4.3c (ruling S6, Mike 2026-10-26: `potion` is a field of the card data): a Potion that is "consumed by activation" is used up by the character who activates it; he keeps the card until
// Midnight to represent the effect, which cannot be transferred. Returns why the belonging cannot be sold or handed over, or null. (Reusable potions can be transferred while active, 4.4.3a.)
export function transferLock(data, it) {
    const d = it && it.active && !it.destroyed && it.kind === 'treasure' ? data.treasures?.[it.id] : null;
    return d?.potion === 'consumed' ? `The ${d.name} is used up by the character who activated it: its effect cannot be transferred while it is active (4.4.3c).` : null;
}
export function extraPhaseCommitment(st, data, it) {
    if (!it || it.destroyed || !st.plan || st.planFree || !st.planKinds) return null;
    const t = st.turn;
    if (t && (t.end || t.pro || t.blocked || t.noTurn)) return null;          // the turn is over (or lost): every phase it could have caused is finished
    const act = extraSourceAct(data, it);
    if (!act) return null;
    const from = t?.i ?? 0, lantern = act === 'lantern';
    let due = 0, pony = 0;
    st.planKinds.forEach((k, j) => {
        if (j < from || !st.plan[j] || st.plan[j].act === 'nothing') return;
        if (lantern ? k === 'lantern' : k === 'extra' && st.plan[j].act === act) { due++; if (st.plan[j].via === 'pony') pony++; }
    });
    if (!due) return null;
    // what covers the extra phases without this belonging: nothing he owns (advantages, spells), the other active sources of the activity, the pony's noted Moves
    const saved = st.ch.items.map(x => x.active);
    st.ch.items.forEach(x => { x.active = false; });
    const fixed = extraActs(st, data).filter(a => a === (lantern ? null : act)).length;
    st.ch.items.forEach((x, k) => { x.active = saved[k]; });
    const others = st.ch.items.filter(x => x.uid !== it.uid && x.active && !x.destroyed && extraSourceAct(data, x) === act && !(x.kind === 'horse' && data.horses[x.id]?.kind === 'pony')).length;
    const isPony = it.kind === 'horse' && data.horses[it.id]?.kind === 'pony';
    const short = due - pony > fixed + others;                               // phases that only this belonging can be the cause of
    if (isPony ? pony > 0 || (it.active && short) : short)
        return `The ${nameOf(data, it)} gives you an extra phase you have recorded: you cannot abandon, sell or hand it over until that phase is finished (6.2.4d).`;
    return null;
}

// Puts a newly acquired item into use if the slots it needs are free.
export function autoEquip(st, data, it) {
    if (st.ch.leader) { it.active = ENCHANTED_CARDS.has(it.id) && it.kind === 'treasure'; return; }          // a hired leader activates nothing, except that an Enchanted card he carries is active (7.2.2b)
    const slots = slotsOf(data, it);
    if (it.kind === 'treasure' && !slots.length) { if (!isOneUse(data, it)) it.active = true; return; }
    if (!slots.length) return;
    if (BOOTS[it.id] && !bootsStrongEnough(st, data, it)) return;
    const taken = st.ch.items.filter(o => o.uid !== it.uid && o.active && !o.destroyed && slotsOf(data, o).some(s => slots.includes(s)));
    if (!taken.length) { it.active = true; keepAlerted(st, data); }
}

// Switching one item on switches off anything that needs the same slot.
// Boots (like a horse) must be able to carry him and everything he owns.
export function bootsStrongEnough(st, data, it) {
    const need = Math.max(lvl(st.ch.weight), carriedLevel(st, data));
    return lvl(BOOTS[it.id][0]) >= need;
}

// 8.3.8d: "While between clearings he cannot ... rearrange or abandon belongings". A hero out on a roadway (`st.ch.onRoad`, after running away) may not switch an item on or off,
// leave one behind or open the Chest, whatever the question. Returns the reason, or null when his gear is free. The screens use it to grey out the switches and "Leave it here".
export const gearLockedWhy = st => (st.ch?.onRoad ? 'You are out on the road between clearings: you cannot rearrange or abandon your belongings until you reach a clearing (8.3.8d).' : null);

// Why this inactive item cannot be switched on now (null: it can). A horse (4.3.8a, 7.3.2a): never in a cave, strong enough for him and everything he owns (either side of the
// counter, ruling R5), and only one at a time. The same checks whether he switches it on between phases (day.js tidy) or as his Encounter action in a fight (combat.js gear).
export function activationBlock(st, data, it) {
    if (it.kind === 'horse') {
        const at = st.combat?.at ?? st.ch.at;
        if (at && isCave(st, data, at)) return 'A horse cannot be ridden in a cave.';
        if (horseLevel(data, it) < Math.max(lvl(st.ch.weight), carriedLevel(st, data, it.uid))) return 'The horse is not strong enough to carry you and your gear.';
    }
    if (BOOTS[it.id] && !bootsStrongEnough(st, data, it)) return 'Those boots are not strong enough to carry you and your gear.';
    return null;
}

export function toggleItem(st, data, it) {
    if (it.active) { it.active = false; if (it.kind === 'weapon') it.alerted = false; return; }
    const why = activationBlock(st, data, it);
    if (why) throw new Error(why);
    if (it.kind === 'horse') st.ch.items.filter(o => o.kind === 'horse').forEach(o => { o.active = false; });
    const slots = slotsOf(data, it);
    for (const o of st.ch.items) if (o.uid !== it.uid && o.active && slotsOf(data, o).some(s => slots.includes(s))) { o.active = false; if (o.kind === 'weapon') o.alerted = false; }
    it.active = true;
    keepAlerted(st, data);
}

// The belongings that decide tomorrow's Birdsong plan, for the reminder at the end of the day (ruling R6, ch7-day.md; 6.2.2c.1, 6.2.4d): an extra phase caused by a horse or a
// treasure card can be recorded only if the item is ACTIVE during Birdsong, and rearranging is allowed only at the start of a phase of the Daylight turn and after the Evening's
// combat (4.3.3a), never in Birdsong. So tonight is the last chance. Pure: it reads the state and changes nothing.
//   { uid, id, name, kind, active, act, gives, canActivate, why, last: 'evening' }
//   act: the one activity the extra phase may be used for ('move', 'search', ...; null: any activity); gives: a few words for the reminder;
//   canActivate: he could switch it on right now; why: what stops him (a cave, strength) when he cannot. An entry that is active already needs no action (a reminder that it is on).
export function nextDayGear(st, data) {
    const out = [];
    if (!st.ch || st.ch.dead) return out;
    for (const it of st.ch.items) {
        if (it.destroyed) continue;
        let act = null, gives = null;
        if (it.kind === 'horse') {
            const k = data.horses[it.id]?.kind;
            if (k === 'workhorse') { act = 'move'; gives = 'one extra Move phase a day'; }
            else if (k === 'pony') { act = 'move'; gives = 'a second Move phase after each other Move phase (never the first Move of the day)'; }
            else continue;
        } else if (it.kind === 'treasure' && EXTRA[it.id]) { act = EXTRA[it.id]; gives = `an extra ${act} phase`; }
        else if (it.kind === 'treasure' && it.id === 'shielded-lantern') { act = null; gives = 'an extra phase for any activity, usable only when he stands in a cave clearing'; }
        else continue;
        const why = it.active ? null : (gearLockedWhy(st) ?? activationBlock(st, data, it));
        out.push({ uid: it.uid, id: it.id, name: nameOf(data, it), kind: it.kind, active: !!it.active, act, gives, canActivate: !it.active && !why, why, last: 'evening' });
    }
    return out;
}

// One short line describing an item for a person (stats, not rules text).
export function summaryOf(data, it) {
    const d = defOf(data, it);
    if (!d) return '';
    if (it.kind === 'weapon') {
        const u = d.unalerted, a = d.alerted;
        const fmt = x => `${x.harm}${'*'.repeat(x.stars ?? 0)}${x.attackTime != null ? ' speed ' + x.attackTime : ''}`;
        return `${d.missile ? 'missile' : 'striking'}, length ${d.length}; ready ${fmt(a)}`;
    }
    if (it.kind === 'armor') return `${d.type}, toughness ${d.toughness}${it.damaged ? ', damaged' : ''}`;
    if (it.kind === 'horse') return `walks ${d.walk.strength}${d.walk.moves}, gallops ${d.gallop.strength}${d.gallop.moves}`;
    if (it.kind === 'treasure') return d.effectText ? d.effectText.slice(0, 80) : '';
    return '';
}
