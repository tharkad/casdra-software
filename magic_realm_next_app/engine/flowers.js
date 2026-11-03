// The Flowers of Rest (Complete Rules, Treasures, "3. DAYLIGHT cards": "automatically in effect whenever they are active. They have effects that apply only during Daylight"):
//   "During Daylight, this card instantly activates all fatigued chits in its clearing, but when it activates a chit it causes the chit's owner to fall asleep until Sunset. He skips his turn
//    (if he has not already taken it) and he cannot block or be blocked or summon monsters. At Sunset he returns to normal, and all of his fatigued action chits are rested at no cost
//    (wounded chits are not affected). This effect occurs only during Daylight and only if he has one or more fatigued action chits - the flowers have no effect after Sunset, and they have no
//    effect if all of his action chits are active and/or wounded."
//   1. "Characters can fall asleep only when they are in the clearings, not when they are on roadways."
//   2. "If a character is affected by the Flowers of Rest and the Wither curse at the same time, his chits cannot be activated or rested and he does not fall asleep."
// 8.1.1: "Characters put to sleep by the Flowers of Rest awake refreshed, with all their fatigued chits activated."
// What the card does at one moment of Daylight is here; day.js asks it when Daylight begins (sunrise), after every phase, and wakes the sleepers at Sunset.
import { say } from './core.js';
import { hasCurse } from './effects.js';
import { withActor, livingIds } from './party.js';

export const CARD = 'flowers-of-rest';
const standing = c => !!c && !c.dead && !!c.at && !c.onRoad && !c.flying && !c.mist;

/** An ACTIVE Flowers of Rest in this clearing: carried, active, by a character (or a hired leader) who stands in it. */
export const activeCardAt = (st, at) => !!at && Object.values(st.chars ?? {}).some(c => standing(c) && c.at === at && c.items.some(i => i.kind === 'treasure' && i.id === CARD && i.active && !i.destroyed));

/** What the card means for the acting character right now: { card, tired (fatigued action chits), will (he would fall asleep now), why (a plain sentence), asleep }. null when no such card is in his clearing. */
export function lullFacts(st, data) {
    const c = st.ch;
    if (!c || c.leader || !activeCardAt(st, c.at)) return null;
    const name = data?.treasures?.[CARD]?.name ?? 'Flowers of Rest';
    const tired = c.chits.filter(x => x.state === 'fatigued').length, wounded = c.chits.filter(x => x.state === 'wounded').length;
    const base = { card: CARD, name, tired, asleep: !!c.asleep };
    if (c.asleep) return { ...base, will: false, why: `The ${name} have put you to sleep until Sunset.` };
    if (!standing(c)) return { ...base, will: false, why: `The ${name} work only in a clearing: nobody falls asleep on a road.` };
    if (hasCurse(st, 'Wither')) return { ...base, will: false, why: `Wither: your tired chits cannot be woken, so the ${name} do nothing.` };
    if (!tired) return { ...base, will: false, why: `None of your chits is tired${wounded ? ' (the wounded ones are not helped)' : ''}, so the ${name} do nothing today. They work in Daylight, on tired chits only.` };
    return { ...base, will: true, why: `When Daylight begins the ${name} wake your ${tired} tired chit${tired === 1 ? '' : 's'} and you fall asleep until Sunset: you skip your turn, and nothing can block you or be called by you.` };
}

/** The acting character falls asleep if the card says so: his fatigued chits are activated (wounded ones left alone) and `asleep` is set until Sunset. True when he fell asleep just now. */
export function fallAsleep(st, data, when = 'Daylight begins') {
    const f = lullFacts(st, data);
    if (!f?.will) return false;
    for (const c of st.ch.chits) if (c.state === 'fatigued') c.state = 'active';
    st.ch.asleep = true;
    say(st, `The ${f.name} work: ${f.tired} tired chit${f.tired === 1 ? ' wakes' : 's wake'}, and ${st.ch.name} falls asleep until Sunset (${when}).`, 'day',
        `The flowers' scent settles on you. Your tired chits stir, and you sleep the day away.`, { ev: { code: 'flowers.sleep', who: st.ch.id, tired: f.tired } });
    return true;
}

/** Daylight begins: everyone the card reaches falls asleep (the turn that follows is skipped by day.js). */
export function lullAll(st, data) {
    for (const id of livingIds(st)) withActor(st, id, () => { fallAsleep(st, data); });
}

/** Sunset: every sleeper wakes refreshed, all his fatigued chits activated at no cost (8.1.1). */
export function wakeAll(st, data) {
    for (const id of livingIds(st)) withActor(st, id, () => {
        if (!st.ch.asleep) return;
        delete st.ch.asleep;
        for (const c of st.ch.chits) if (c.state === 'fatigued') c.state = 'active';
        say(st, `The sun sets. ${st.ch.name} wakes refreshed: every tired chit is active again.`, 'day', 'You wake with the sunset, rested.', { ev: { code: 'flowers.wake', who: st.ch.id } });
    });
}
