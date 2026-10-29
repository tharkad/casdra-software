import { lvl, die, roll2, say, noteRoll } from './core.js';
import { REPOSITION, DIRS, MANEUVERS } from './tables.js';
import { isCave } from './world.js';

// Hirelings in a fight, the way chapter 8 of the 3.1 rules has it (docs/rules-spec/hire-notes.md, docs/design/rules-tdd/hirefight.md): Melee Sections.
//
// Behind the game option `hireSections` (st.options.hireSections, default off). Without it combat.js keeps the older model (each hireling goes for the most dangerous creature and two dice
// decide the blows) and nothing in this file runs. With it, and while the hero has a live hireling in the fight (and the fight is his alone, not shared), each round has:
//   1. Luring and Deployment (8.3.4c, 8.3.5, 8.3.6a): the question `combat-deploy`. The hirer lures with his hirelings (each lures one attacker), the unlured denizens are assigned (to the hero if
//      he is unhidden, else to one of his unhidden hirelings), and each hireling that is not already being attacked is sent at a target; the hirer may turn the counters (and the horses) of
//      the hirelings he places as attackers. The result is `c.sec.sheets`: one Melee Section per defender.
//   2. The Melee step (8.4.2a, e, f, 8.4.5n, 8.4.6d, 8.4.8d, e): the targets of the denizens and hirelings on sheets, the hirer's placement of what is on his hirelings' sheets (the melee
//      answer carries hireTargets, hireSides and positions), the sheets' own repositioning and tactics dice, and the blows.
//   3. Disengagement (8.6.1): the sheets are gone at the end of the round (c.sec.last keeps the last round's, with the final positions, for the screen and for the tests).
//
// A Melee Section: { id, owner: uid, ownerKind: 'hire' | 'den', attackers: [uid, ...] (the last is on top of the stack), target: uid | null, pos: { counter: 0 | 1 | 2 } }.
// A counter is the unit's own uid, a head or club (its den uid), a native horse of an unhired native (its den uid) or of a hireling (`<hire uid>:horse`). `pos` is where it stands: the owner
// and its horse or parts in a red box, the owner's target in a Maneuver square, the other attackers in Attack circles. Box, circle and square all have the same three directions (0 Thrust and
// Charge, 1 Swing and Dodge, 2 Smash and Duck), and an attack hits the counter that stands in the same direction on the other side (8.4.8d, e), or undercuts its maneuver time.
//
// combat.js hands this module what it needs to know (`K`, filled in at the bottom of combat.js), so that this file does not import combat.js.

export const K = {};

// ---- the rulings (docs/rules-spec/rulings/hirefight.md): each place where the 3.1 text leaves a choice open is one small function, so that a different ruling is a one-line change ----
// F1: a hireling that is attacked by several denizens and is not told whom to attack takes the one put on his section last (8.4.2e leaves the choice to the hirer; this is the default).
export const defaultTargetOfHireling = attackers => attackers[attackers.length - 1];
// F2: a hired native's horse starts the fight walking side up (8.3.1 turns the horses of UNHIRED natives walking, and says they gallop in the Melee step: it does not say it of a hired
// native's horse, which the hirer may turn over only when he places the hireling as an attacker, 8.3.6a.4, and cannot turn over when he positions a defender, 8.4.5n.1).
export const hiredHorseStartSide = () => 'light';
// F3: the hirelings that attack a denizen's section reposition and change tactics with the other attackers (8.4.6d: "the attackers on each sheet"); only a defending hireling stays as placed (8.4.6d.3).
export const hireAttackersMoveRandomly = true;
// F4: with the hero hidden, an attacker nobody lured goes to the hireling the hirer names, else to the first unhidden hireling (8.3.5a.3 says which character gets it by dice and that "he must
// assign it to one of his unhidden hirelings": which one is the hirer's choice).
export const defaultHirelingForAssignment = pool => pool[0];
// F9: the target's head, club and horse stand in the Maneuver squares with it (8.4.5n.2 names squares as well as circles; RealmSpeak does the same); the heads, clubs and horses of the other attackers stand in the Attack circles.

export const sectionsOn = st => !!st.options?.hireSections;
const isUnit = d => d.kind === 'mon' || d.kind === 'nat';
const liveHires = c => (c.hires ?? []).filter(h => !h.dead);
const hireOf = (c, uid) => (c.hires ?? []).find(h => h.uid === uid);
const denOf = (c, uid) => c.dens.find(d => d.uid === uid);
const ownerSheet = (c, uid) => c.sec.sheets.find(s => s.owner === uid);
const holderSheet = (c, uid) => c.sec.sheets.find(s => s.attackers.includes(uid));
const onSheet = (c, uid) => !!c.sec && (!!ownerSheet(c, uid) || !!holderSheet(c, uid));
const heldBy = (c, hireUid) => c.sec.sheets.find(s => s.held && s.attackers[0] === hireUid) ?? null;
const clone = o => JSON.parse(JSON.stringify(o));

// Does this round of this fight run on Melee Sections?
export function active(st) {
    const c = st.combat;
    return sectionsOn(st) && !!c && !c.shared && !c.peaceNow && !st.ch.mist && liveHires(c).length > 0;
}
// Are there sections for the round now being played?
export const inRound = st => sectionsOn(st) && !!st.combat?.sec && st.combat.sec.round === st.combat.round && !st.combat.shared;
// Is this denizen on a section (as owner or attacker)? combat.js asks before it sets a named creature on the hero.
export const denOnSheet = (st, d) => inRound(st) && onSheet(st.combat, d.uid);

// ---- the hirelings in the fight ----
const sidesOf = (data, h) => {
    const o = h.kind === 'mon' ? data.monsters[h.id] : data.natives[h.id];
    return ['light', 'dark'].filter(s => o[s]);
};
function ownerRec(st, h) { return (h.kind === 'mon' ? st.mons : st.nats).find(x => x.id === h.id); }
// A hireling is put in the fight the first time a round of sections asks for him: the side he starts on (the one that fights best, as the older model played him), whether he is hidden,
// and his horse (a native with a horse that is alive is always played with it, except in caves: 8.3.1, 8.4.5k.4).
function ensureHire(st, data, h) {
    const c = st.combat;
    if (h.side == null) h.side = K.hireBestSide(data, h.id, h.kind);
    if (!('hidden' in h)) h.hidden = !!ownerRec(st, h)?.hidden;
    if (h.kind === 'nat') {
        const n = ownerRec(st, h);
        h.horse = data.natives[h.id].horse && n && !n.horseDead && !isCave(st, data, c.at) ? { alive: true, side: h.horse?.side ?? hiredHorseStartSide() } : null;
    } else h.horse = null;
}
function unhide(st, data, h) {
    K.hsEntered?.(st, data, h);          // (the hireling rules, hirestate.js: the counter goes light side up and the move is told; they delete h.hidden, set again below)
    h.hidden = false;
    const o = ownerRec(st, h);
    if (o && 'hidden' in o) o.hidden = false;
}
const nameOfHire = (st, data, h) => K.hireStats(data, h.id, h.kind, st).name;
const nameOfDen = (st, data, d) => K.denSide(st, data, d).name;
const nameOf = (st, data, uid) => { const c = st.combat, h = hireOf(c, uid); return h ? nameOfHire(st, data, h) : nameOfDen(st, data, denOf(c, uid)); };

// The counters a unit puts on a section: itself, a monster's head or club, a native's horse (a hireling's is `<uid>:horse`).
function counters(c, uid) {
    const h = hireOf(c, uid);
    if (h) return [{ key: uid, role: 'body' }, ...(h.horse?.alive ? [{ key: `${uid}:horse`, role: 'horse' }] : [])];
    return [{ key: uid, role: 'body' }, ...c.dens.filter(x => x.partOf === uid && !x.dead).map(x => ({ key: x.uid, role: x.kind === 'horse' ? 'horse' : 'part' }))];
}
// Where everything stands when a section is made: the owner in the Charge and Thrust box and the attackers in the Thrust circle (8.3.4c.2, 8.3.6a.2, 8.3.6a.3). The Melee step positions them.
function initPos(c, s) {
    for (const u of [s.owner, ...s.attackers]) for (const k of counters(c, u)) s.pos[k.key] ??= 0;
}

// ---- the start of a round ----
// A red-side-up Tremendous monster that holds a hireling stays on him (8.6.2): at the start of the round it is the defender on a section of its own and the native its target; other hirelings
// may be sent at it. Once the hireling is dead it lets go.
function holdSheets(st, data) {
    const c = st.combat;
    for (const d of c.dens) {
        if (!(d.pickedUp && d.engagedBy && !d.dead)) continue;
        const h = hireOf(c, d.engagedBy);
        if (h && !h.dead) {
            const s = newSheet(c, d.uid, 'den');
            s.attackers.push(h.uid); s.held = true; s.target = h.uid;
            d.assigned = false;
        } else { d.pickedUp = false; d.side = 'light'; d.engagedBy = null; }
    }
}
function newSheet(c, owner, ownerKind) {
    const s = { id: 's' + (++c.sec.seq), owner, ownerKind, attackers: [], target: null, pos: {} };
    c.sec.sheets.push(s);
    return s;
}
// What the spells ask: a creature that a hireling is sent at is "engaged by" him (8.4.2h.1, 8.4.4b: the spell is cancelled; a Control spell does not take it).
export function syncEngaged(st) {
    const c = st.combat;
    if (!c?.sec) return;
    for (const d of c.dens) {
        const s = ownerSheet(c, d.uid), h = s?.attackers.map(u => hireOf(c, u)).find(x => x && !x.dead);
        if (d.pickedUp && d.engagedBy && hireOf(c, d.engagedBy) && !hireOf(c, d.engagedBy).dead) continue;          // (a monster that holds a hireling)
        d.engagedBy = h ? h.uid : null;
    }
}

// ---- what the hirer may do now ----
const lurable = (st, data) => {
    const c = st.combat;
    return c.dens.filter(d => isUnit(d) && !d.dead && !d.pickedUp && !d.elsewhere && !onSheet(c, d.uid));
};
export function begin(st, data) {
    const c = st.combat;
    c.sec = { round: c.round, sheets: [], deployed: [], seq: 0, last: c.sec?.last ?? null };
    for (const h of liveHires(c)) ensureHire(st, data, h);
    holdSheets(st, data);
    syncEngaged(st);
    c.step = 'deploy';
    st.pending = { type: 'combat-deploy', round: c.round, ...askOptions(st, data) };
}
export function askOptions(st, data) {
    const c = st.combat;
    return {
        hires: liveHires(c).map(h => ({ uid: h.uid, id: h.id, kind: h.kind, name: nameOfHire(st, data, h), side: h.side, sides: sidesOf(data, h), horse: h.horse ? { ...h.horse } : null, hidden: !!h.hidden, held: !!heldBy(c, h.uid) })),
        lurable: lurable(st, data).map(d => ({ uid: d.uid, kind: d.kind, name: nameOfDen(st, data, d), assigned: !!d.assigned })),
        targets: c.dens.filter(d => isUnit(d) && !d.dead).map(d => ({ uid: d.uid, kind: d.kind, name: nameOfDen(st, data, d), assigned: !!d.assigned })),
        heroHidden: !!st.ch.hidden,
    };
}

// ---- the answer: luring, assignment, deployment (8.3.4c, 8.3.5, 8.3.6a) ----
//   { kind: 'deploy', auto?: true,
//     lures?:   [{ hire, den }],                    each hireling lures one denizen onto a section of his own (8.3.4c.2)
//     heroLures?: true,                             a hidden hero lures everything the hirelings did not (8.3.4b); he is unhidden
//     assigns?: { [denUid]: hireUid },              with the hero hidden, which unhidden hireling takes an unlured denizen (8.3.5a.3; the first by default)
//     deploys?: [{ hire, target, side?, horse? }],  in this order: send the hireling at the denizen (target null: he stays out and cannot attack this round); side, horse: turn him / his horse over
//     flips?:   { [hireUid]: { side?, horse? } } }  turn a hireling who ended up as an attacker (8.3.6a.4); side 'light' | 'dark', horse the same
export function deployAction(st, data, a) {
    const c = st.combat;
    if (c.step !== 'deploy') throw new Error('nobody is asking you to deploy now');
    const plan = a.auto ? {} : a;          // (auto: no luring, the usual assignment, and each free hireling sent where autoDeploys says, once the assignment is done)
    const hire = uid => { const h = liveHires(c).find(x => x.uid === uid); if (!h) throw new Error('you have no such hireling'); return h; };
    const den = uid => {
        if (hireOf(c, uid)) throw new Error('a hired or controlled creature cannot be lured or attacked by its hirer (8.3.4d, 8.4.2g)');
        const d = denOf(c, uid);
        if (!d || d.dead || !isUnit(d)) throw new Error('there is no such creature here');
        return d;
    };
    const flips = {};
    // 1. luring (8.3.4c): before anything is assigned
    const lured = new Set();
    for (const l of plan.lures ?? []) {
        const h = hire(l.hire);
        if (heldBy(c, h.uid)) throw new Error('a Tremendous monster holds that hireling');
        if (lured.has(h.uid)) throw new Error('each hireling can lure one attacker (8.3.4c.2)');
        const d = den(l.den);
        if (onSheet(c, d.uid)) throw new Error('that creature was already lured by a hireling and cannot be lured away (8.3.4d)');
        if (d.pickedUp) throw new Error('a Tremendous monster red side up cannot be lured (8.3.4d)');
        if (d.elsewhere) throw new Error('that creature is on another character\'s sheet');
        lured.add(h.uid);
        d.assigned = false;
        lureEffects(st, data, d);
        (ownerSheet(c, h.uid) ?? newSheet(c, h.uid, 'hire')).attackers.push(d.uid);
        say(st, `${nameOfHire(st, data, h)} lures the ${nameOfDen(st, data, d)} onto a Melee Section of his own.`, 'combat');
        if (h.hidden) { unhide(st, data, h); say(st, `${nameOfHire(st, data, h)} gives himself away by luring (8.3.4c.3).`, 'combat'); }
    }
    // 2. the hero lures (8.3.4b)
    if (plan.heroLures) {
        if (!st.ch.hidden) throw new Error('only a hidden character lures; an unhidden one has the creatures set on him anyway');
        const left = lurable(st, data).filter(d => !d.assigned);
        if (!left.length) throw new Error('there is nothing left for you to lure');
        st.ch.hidden = false;
        say(st, 'You lure the creatures onto your sheet and give yourself away: you are no longer hidden.', 'combat');
        for (const d of left) lureEffects(st, data, d, true);
    }
    // 3. random assignment (8.3.5): the denizens nobody has go to the hero if he is in plain sight, else to one of his unhidden hirelings
    const cand = () => c.dens.filter(d => isUnit(d) && !d.dead && !d.assigned && !d.bystander && !d.pacified && !d.pickedUp && !d.elsewhere && !onSheet(c, d.uid));
    const assigns = plan.assigns ?? {};
    if (!st.ch.hidden) {
        if (Object.keys(assigns).length) throw new Error('an unhidden character must assign the attackers to himself (8.3.5a.3)');
        for (const d of cand()) if (!K.barredFromHero(st, data, d)) d.assigned = true;
    } else {
        const pool = liveHires(c).filter(h => !h.hidden && !heldBy(c, h.uid));
        for (const [du, hu] of Object.entries(assigns)) {
            const d = cand().find(x => x.uid === du);
            if (!d) throw new Error('that creature is not one to assign');
            if (!pool.some(h => h.uid === hu)) throw new Error('only an unhidden hireling can be given an attacker');
        }
        for (const d of cand()) {
            const h = pool.find(x => x.uid === assigns[d.uid]) ?? defaultHirelingForAssignment(pool);
            if (!h) continue;                                                       // 8.3.5b: no unhidden target, the denizen stays unassigned
            (ownerSheet(c, h.uid) ?? newSheet(c, h.uid, 'hire')).attackers.push(d.uid);
            say(st, `The ${nameOfDen(st, data, d)} is set on ${nameOfHire(st, data, h)}.`, 'combat');
        }
    }
    // 4. deployment (8.3.6a), one hireling at a time
    for (const dp of a.auto ? autoDeploys(st, data) : plan.deploys ?? []) {
        const h = hire(dp.hire);
        if (c.sec.deployed.includes(h.uid)) throw new Error('each hireling is deployed once');
        if (heldBy(c, h.uid)) throw new Error('a Tremendous monster holds that hireling');
        if (ownerSheet(c, h.uid)?.attackers.length) throw new Error('a hireling who is being attacked cannot be deployed (8.3.6a)');
        if (holderSheet(c, h.uid)) throw new Error('that hireling is already attacking');
        c.sec.deployed.push(h.uid);
        if (dp.target == null) { say(st, `${nameOfHire(st, data, h)} stays out of the fight this round.`, 'combat'); continue; }
        const t = den(dp.target);
        attach(st, data, h, t);
        if (dp.side != null || 'horse' in dp) flips[h.uid] = { ...(dp.side != null ? { side: dp.side } : {}), ...('horse' in dp ? { horse: dp.horse } : {}) };
    }
    // 5. turning the hirelings who are attackers now over, with their horses (8.3.6a.4)
    for (const [hu, f] of Object.entries({ ...flips, ...(plan.flips ?? {}) })) {
        const h = hire(hu);
        if (!holderSheet(c, h.uid)) throw new Error('only a hireling placed as an attacker is turned over now; a defender is positioned in the Melee step (8.3.6a.4)');
        if (f.side != null) setSide(st, data, h, f.side);
        if ('horse' in f) setHorse(st, data, h, f.horse);
    }
    for (const s of c.sec.sheets) initPos(c, s);
    syncEngaged(st);
    if (plan.heroLures) c.eventful = true;          // (the hero's lure is something that happened, as it always was; a deployment, or a hireling who lures again every round, is not: two quiet rounds still end a fight)
    c.step = 'encounter';
    st.pending = { type: 'combat-encounter', round: c.round };
}

function setSide(st, data, h, side) {
    if (!['light', 'dark'].includes(side)) throw new Error(`a counter has a light and a dark side, not '${side}'`);
    if (!sidesOf(data, h).includes(side)) throw new Error(`the ${nameOfHire(st, data, h)} has no ${side} side: a Tremendous monster is played red side down (8.4.7c)`);
    h.side = side;
}
function setHorse(st, data, h, side) {
    if (side === null || !['light', 'dark'].includes(side)) throw new Error('a hired native with a horse must always be played with his horse and cannot dismount (8.3.6a, 8.4.5k.4)');
    if (!h.horse) throw new Error(`${nameOfHire(st, data, h)} has no horse in this fight`);
    h.horse.side = side;
}

// What luring does to the creature lured (8.3.4e, 8.3.4g): a native's group begins battling, a pacified creature's spell is broken, and the creature comes for the hirer.
function lureEffects(st, data, d, byHero = false) {
    if (d.kind === 'nat' && d.bystander) { K.startBattling(st, data, data.natives[d.id].group); st.combat.eventful = true; }          // (a fight that starts is an event)
    K.breakCalm(st, data, d);
}

// Put a hireling on the target's section: the target becomes the defender of a section if it is not one already, the hireling the newest attacker (8.3.6a.2, .3). A target that was an
// attacker on another section leaves it and is the defender on a section of its own (.5); if that leaves the old owner alone on his section he moves over as the newest attacker (.6).
// A red-side-up Tremendous monster that holds the hero stays on him (.8).
function attach(st, data, h, t) {
    const c = st.combat;
    const from = holderSheet(c, t.uid);
    let s = ownerSheet(c, t.uid), moved = null;
    if (from) {
        from.attackers = from.attackers.filter(u => u !== t.uid);
        s = newSheet(c, t.uid, 'den');
        if (!from.attackers.length && !from.held) { c.sec.sheets = c.sec.sheets.filter(x => x !== from); moved = from.owner; }
        say(st, `The ${nameOfDen(st, data, t)} is attacked by ${nameOfHire(st, data, h)}: it leaves the section it was on and is the defender on one of its own.`, 'combat');
    } else if (!s) {
        s = newSheet(c, t.uid, 'den');
        if (t.pickedUp && t.assigned) s.noTarget = true;                                  // (.8) it keeps attacking its character; it picks no target on its own section
        else t.assigned = false;
        say(st, `${nameOfHire(st, data, h)} is sent at the ${nameOfDen(st, data, t)}.`, 'combat');
    }
    s.attackers.push(h.uid);
    if (moved) { s.attackers.push(moved); c.sec.deployed.push(moved); say(st, `${nameOf(st, data, moved)}, alone on his section, moves onto the ${nameOfDen(st, data, t)}'s as its newest attacker (8.3.6a.6).`, 'combat'); }
    if (h.hidden) { unhide(st, data, h); }
    // sending a hireling at what a spell calmed or protects breaks the spell (8.4.2h.2); at a native, its group begins to battle him and his hirelings (8.3.6a.9)
    K.namedTarget(st, data, t, text => say(st, text, 'combat'));
    if (t.pacified) K.breakPacify(st, data, t, text => say(st, text.replace('Your attack breaks', 'Sending a hireling at it breaks'), 'combat'));
    if (t.kind === 'nat' && t.bystander) { K.startBattling(st, data, data.natives[t.id].group); t.bystander = false; }
}

// A quick plan for a computer player or a hurried hirer: no luring, the leftovers assigned as usual, each hireling who is not being attacked sent at the most dangerous creature nobody
// is facing yet (the older model's choice), on the side of his counter that fights best.
function autoDeploys(st, data) {
    const c = st.combat, deploys = [], taken = new Set();
    const harm = d => lvl(K.denSide(st, data, d).harm ?? 'N');
    const prey = c.dens.filter(d => isUnit(d) && !d.dead && !d.bystander && !d.pacified && !d.pickedUp);
    for (const h of liveHires(c)) {
        if (heldBy(c, h.uid) || ownerSheet(c, h.uid)?.attackers.length) continue;
        const pool = prey.filter(d => !taken.has(d.uid)), any = pool.length ? pool : prey;
        if (!any.length) break;
        const t = [...any].sort((x, y) => harm(y) - harm(x))[0];
        taken.add(t.uid);
        deploys.push({ hire: h.uid, target: t.uid });
    }
    return deploys;
}

// =====================================================================================================================================================================
// The Melee step (8.4.2 to 8.4.8)
// =====================================================================================================================================================================

// What spells, kills and rebellions have done to the sections since they were made: the dead are off them, and a section with nobody attacking is no section.
function prune(st) {
    const c = st.combat;
    const alive = uid => { const h = hireOf(c, uid); if (h) return !h.dead; const d = denOf(c, uid); return !!d && !d.dead; };
    c.sec.sheets = c.sec.sheets.filter(s => {
        if (!alive(s.owner)) return false;
        s.attackers = s.attackers.filter(alive);
        if (s.target && !alive(s.target)) s.target = null;
        return s.attackers.length > 0;
    });
    syncEngaged(st);
}
// A creature a spell has taken from the fight (Control, Deal with Goblins): it is off every section, and what was attacking it is left with nothing to attack (8.4.4b, 8.4.4c).
export function dropDen(st, den) {
    const c = st.combat;
    if (!inRound(st)) return;
    c.sec.sheets = c.sec.sheets.filter(s => s.owner !== den.uid);
    for (const s of c.sec.sheets) s.attackers = s.attackers.filter(u => u !== den.uid);
    c.sec.sheets = c.sec.sheets.filter(s => s.attackers.length);
    den.engagedBy = null;
}

// ---- which counters stand where ----
const last = a => a[a.length - 1];
const DIR_OK = v => Number.isInteger(v) && v >= 0 && v <= 2;
const flippableCounter = (st, data, c, key) => {
    const h = hireOf(c, key);
    if (h) return !h.dead && sidesOf(data, h).length === 2 && !K.morphOf(st, { kind: h.kind, id: h.id }) && !(h.kind === 'mon' && data.monsters[h.id].red);
    const d = denOf(c, key);
    return !!d && !d.dead && d.kind !== 'horse' && K.canFlip(st, data, d);
};
// The three kinds of place on a section: a red box (the owner, its head or club, its horse), a Maneuver square (the owner's target and its horse) and an Attack circle (everybody else).
function zonesOf(c, s) {
    const box = [], square = [], circle = [];
    if (!s.noTarget) box.push(...counters(c, s.owner).map(k => ({ ...k, unit: s.owner })));
    for (const u of s.attackers) {
        for (const k of counters(c, u)) {
            if (u === s.target) square.push({ ...k, unit: u });          // (the target, its head or club and its horse stand in the Maneuver squares: RealmSpeak puts them there too)
            else circle.push({ ...k, unit: u });
        }
    }
    return { box, square, circle };
}
// All the counters on all the sections, by key (for checking what a plan names).
function allCounters(c) {
    const m = new Map();
    for (const s of c.sec.sheets) { const z = zonesOf(c, s); for (const k of [...z.box, ...z.square, ...z.circle]) m.set(k.key, { ...k, sheet: s }); }
    return m;
}

// The target of each section (8.4.2a, 8.4.2e): a hireling chooses among his attackers (the one put on last if he says nothing); an uncontrolled denizen takes the attacker put on last; the
// monster that holds a hireling keeps him (8.6.2); a Tremendous monster that holds its character picks none (8.3.6a.8).
function targetsOf(st, p) {
    const c = st.combat;
    for (const s of c.sec.sheets) {
        if (s.noTarget) { s.target = null; continue; }
        if (s.held) { s.target = s.attackers[0]; continue; }
        const named = s.ownerKind === 'hire' ? p.hireTargets?.[s.owner] : null;
        s.target = named && s.attackers.includes(named) ? named : defaultTargetOfHireling(s.attackers);
    }
}

// Where everything on a section may stand. `named` is what the hirer said (positions by counter). Returns the positions or throws: 8.4.5n.2 (as many circles as possible, no head, club or
// horse of an unhired denizen with its owner), 8.4.2a (the defending denizen and its parts are placed by the rules).
function layout(st, data, s, named) {
    const c = st.combat, pos = {}, z = zonesOf(c, s);
    const give = (k, d) => { if (!DIR_OK(d)) throw new Error('a position is a direction from 0 to 2'); pos[k.key] = d; };
    const hiredUnit = u => !!hireOf(c, u);
    const ob = z.box.find(k => k.role === 'body');
    if (ob) {
        if (s.ownerKind === 'hire') {
            give(ob, named[ob.key] ?? s.pos[ob.key] ?? 0);
            for (const k of z.box.filter(k => k.role === 'horse')) give(k, named[k.key] ?? pos[ob.key]);          // (a hireling's horse may stand in his box or in another, 8.4.5n.1)
        } else {
            for (const k of z.box) if (k.key in named) throw new Error('the defending creature and its head, club or horse are placed by the rules (8.4.2a): the Charge and Thrust box and the Dodge and Swing box');
            give(ob, 0);
            for (const k of z.box.filter(k => k.role !== 'body')) give(k, 1);
        }
    }
    const tb = z.square.find(k => k.role === 'body');
    if (tb) {
        give(tb, named[tb.key] ?? 0);
        for (const k of z.square.filter(k => k.role !== 'body')) {
            const d = named[k.key] ?? (hiredUnit(k.unit) ? pos[tb.key] : (pos[tb.key] + 1) % 3);
            if (!hiredUnit(k.unit) && d === pos[tb.key]) throw new Error(`a head, club or horse of an unhired denizen cannot stand in the same square as its owner (8.4.5n.2)`);
            give(k, d);
        }
    }
    const attacking = z.circle.filter(k => k.role !== 'horse'), use = [0, 0, 0];
    for (const k of attacking.filter(k => k.key in named)) { give(k, named[k.key]); use[pos[k.key]]++; }
    for (const k of attacking.filter(k => !(k.key in named))) {
        const bodyAt = k.role === 'part' ? pos[k.unit] : null;
        const order = [0, 1, 2].sort((a, b) => use[a] - use[b] || a - b);
        const d = k.role === 'part' && order[0] === bodyAt ? order[1] : order[0];
        give(k, d); use[d]++;
    }
    if (use.filter(n => n > 0).length < Math.min(attacking.length, 3)) throw new Error('put an attacking counter in as many of the three Attack circles as you can: you cannot leave a circle empty while you double up counters in another (8.4.5n.2)');
    for (const k of attacking.filter(k => k.role === 'part')) if (pos[k.key] === pos[k.unit] && !hiredUnit(k.unit)) throw new Error('a head or club cannot stand in the same circle as its monster (8.4.5n.2)');
    for (const k of z.circle.filter(k => k.role === 'horse')) {
        const d = named[k.key] ?? (hiredUnit(k.unit) ? pos[k.unit] : [0, 1, 2].find(x => x !== pos[k.unit]));
        if (!hiredUnit(k.unit) && d === pos[k.unit]) throw new Error('an unhired native\'s horse cannot stand in the same circle as its rider (8.4.5n.2)');
        give(k, d);
    }
    return pos;
}

// The answer to the Melee step may carry, for the sections of his hirelings and what he sent at an uncontrolled denizen:
//   hireTargets: { [hireling uid]: attacker uid }, hireSides: { [defending hireling uid]: 'light' | 'dark' }, positions: { [counter]: 0 | 1 | 2 }
// It is judged before anything is played (checkPlay) and carried out after the spells (setup).
export function checkPlay(st, data, p) {
    const c = st.combat;
    if (!p.hireTargets && !p.hireSides && !p.positions) return;
    const all = allCounters(c);
    for (const [u, t] of Object.entries(p.hireTargets ?? {})) {
        const s = c.sec.sheets.find(x => x.owner === u && x.ownerKind === 'hire');
        if (!s || !s.attackers.length) throw new Error('a hireling nobody is attacking does not choose a target (8.4.2e)');
        if (!s.attackers.includes(t)) throw new Error('a hireling must choose his target among the attackers on his own section: not another section, not a character (8.4.2e)');
    }
    for (const [u, side] of Object.entries(p.hireSides ?? {})) {
        const h = hireOf(c, u);
        if (!h || h.dead) throw new Error('you have no such hireling');
        if (!c.sec.sheets.some(x => x.owner === u)) throw new Error('only a hireling who defends a section is turned over now; an attacker was turned at Deployment and cannot be turned over (8.4.2f, 8.4.5n.2)');
        if (!['light', 'dark'].includes(side) || !sidesOf(data, h).includes(side)) throw new Error(`the ${nameOfHire(st, data, h)} has no ${side} side`);
    }
    for (const k of Object.keys(p.positions ?? {})) if (!all.has(k)) throw new Error(`there is no counter '${k}' on any Melee Section`);
    // the whole plan is tried on the sections as they would be
    const saved = c.sec.sheets.map(s => [s, s.target]);
    try { targetsOf(st, p); for (const s of c.sec.sheets) layout(st, data, s, p.positions ?? {}); } finally { for (const [s, t] of saved) s.target = t; }
}

// After the spells have acted: the targets, the sides of the defending hirelings, and where everything stands. What a spell left over from the plan is placed by the defaults.
export function setup(st, data, p, log) {
    const c = st.combat;
    prune(st);
    targetsOf(st, p);
    for (const [u, side] of Object.entries(p.hireSides ?? {})) { const h = hireOf(c, u); if (h && !h.dead && c.sec.sheets.some(x => x.owner === u)) h.side = side; }
    for (const s of c.sec.sheets) {
        let pos;
        try { pos = layout(st, data, s, p.positions ?? {}); } catch (e) { pos = layout(st, data, s, {}); }          // (a spell changed the section after the plan was judged: the defaults)
        s.pos = pos; s.start = { ...pos };
        const t = s.target ? nameOf(st, data, s.target) : null;
        log(`${nameOf(st, data, s.owner)}'s section: ${s.attackers.map(u => nameOf(st, data, u)).join(', ')} ${s.attackers.length > 1 ? 'attack' : 'attacks'} ${s.ownerKind === 'hire' ? 'him' : 'it'}${t ? `; ${s.ownerKind === 'hire' ? 'he' : 'it'} attacks ${t}` : ''}.`);
    }
}

// ---- 8.4.6d: the dice of each section ----
function flipSide(st, key) {
    const c = st.combat, h = hireOf(c, key);
    if (h) h.side = h.side === 'light' ? 'dark' : 'light';
    else { const d = denOf(c, key); d.side = d.side === 'light' ? 'dark' : 'light'; }
}
const sideOfCounter = (c, key) => hireOf(c, key)?.side ?? denOf(c, key)?.side;
// Roll once to move the counters of one place among its three positions (the Repositioning Denizens Table), then two dice for each position that holds counters that can change tactics.
function shuffleZone(st, data, why, label, list, pos, log) {
    if (!list.length) return;
    const rr = die(st, why), perm = REPOSITION[rr];
    noteRoll(st, label, [rr], rr, rr === 4 ? 'no change' : 'the counters shuffle');
    const before = { ...pos };
    for (const k of list) { const old = before[k.key]; for (let nb = 0; nb < 3; nb++) if (perm[nb] === old) { pos[k.key] = nb; break; } }
    for (const k of list) if (pos[k.key] !== before[k.key] && k.role !== 'horse') log(`  ${nameOf(st, data, k.key)} ${MANEUVERS[before[k.key]]} → ${MANEUVERS[pos[k.key]]}.`);
}
function tacticsZone(st, data, list, pos, log, where) {
    const c = st.combat;
    for (let b = 0; b < 3; b++) {
        const here = list.filter(k => k.role !== 'horse' && pos[k.key] === b && flippableCounter(st, data, c, k.key));
        if (!here.length) continue;
        const t = roll2(st, 'combat.sheet.tactics');
        noteRoll(st, `Tactics roll (${where}, ${MANEUVERS[b]})`, t.dice, t.value, t.dice.includes(6) ? 'a 6: they switch sides' : 'no change');
        if (t.dice.includes(6)) {
            for (const k of here) flipSide(st, k.key);
            log(`Tactics change on the section (${where}, ${MANEUVERS[b]}; rolled ${t.dice.join('+')}): ${here.map(k => nameOf(st, data, k.key)).join(', ')} switch sides.`);
        }
    }
}
// After the plays are revealed: for each section, the owner (if it is an uncontrolled denizen) moves and changes tactics with a roll of its own; the owner's target moves with one roll, and all
// the extra attackers with another. A hireling who is the owner stays as he was placed (8.4.6d.3). Then the creatures take their places for the blows (a hero who hits one aims at that place, 8.4.8d).
export function reposition(st, data, log) {
    const c = st.combat;
    for (const s of c.sec.sheets) {
        const z = zonesOf(c, s), pos = s.pos;          // (a Tremendous monster that holds its character picks no target and is placed with his creatures: only its attackers are shuffled here)
        if (s.ownerKind === 'den' && z.box.length) {
            shuffleZone(st, data, 'combat.sheet.defender', `Repositioning roll (${nameOf(st, data, s.owner)}'s section)`, z.box, pos, log);
            tacticsZone(st, data, z.box, pos, log, 'its box');
        }
        const moves = list => (hireAttackersMoveRandomly ? list : list.filter(k => !hireOf(c, k.unit)));          // (ruling F3)
        if (z.square.length) {
            shuffleZone(st, data, 'combat.sheet.target', `Repositioning roll (target on ${nameOf(st, data, s.owner)}'s section)`, moves(z.square), pos, log);
            tacticsZone(st, data, moves(z.square), pos, log, 'the target');
        }
        if (z.circle.length) {
            shuffleZone(st, data, 'combat.sheet.attackers', `Repositioning roll (attackers on ${nameOf(st, data, s.owner)}'s section)`, moves(z.circle), pos, log);
            tacticsZone(st, data, moves(z.circle), pos, log, 'the attackers');
        }
        s.sides = {};
        for (const k of [...z.box, ...z.square, ...z.circle]) if (k.role !== 'horse') s.sides[k.key] = sideOfCounter(c, k.key);
    }
    for (const s of c.sec.sheets) for (const [key, dir] of Object.entries(s.pos)) { const d = denOf(c, key); if (d) d.box = dir; }
    c.sec.last = { round: c.round, sheets: clone(c.sec.sheets) };
}

// ---- 8.4.8: who hits whom ----
const numsOf = (st, data, c, key) => {
    const h = hireOf(c, key);
    if (h) { const s = K.hireStats(data, h.id, h.kind, st, h.side); return { name: s.name, atk: s.atk, harm: s.harm, length: s.length, can: s.harm != null && s.atk != null }; }
    const d = denOf(c, key), s = K.denSide(st, data, d);
    return { name: s.name, atk: s.atk, harm: s.harm, length: s.length, can: s.attack !== 'none' && s.atk != null };
};
// What takes a blow aimed at this unit: its horse while it lives (8.4.9i), else the unit.
function defenderOf(st, data, c, uid) {
    const h = hireOf(c, uid);
    if (h) {
        if (h.horse?.alive) { const hd = data.natives[h.id].horse, hv = hd[h.horse.side]; return { key: `${uid}:horse`, horse: true, move: hv.moveTime, name: `${nameOfHire(st, data, h)}'s ${hd.name}` }; }
        return { key: uid, horse: false, move: K.hireStats(data, h.id, h.kind, st, h.side).move, name: nameOfHire(st, data, h) };
    }
    const d = denOf(c, uid), horse = c.dens.find(x => x.kind === 'horse' && x.partOf === uid && !x.dead);
    if (horse) { const s = K.denSide(st, data, horse); return { key: horse.uid, horse: true, move: s.move, name: `the ${nameOfDen(st, data, d)}'s ${s.name}` }; }
    return { key: uid, horse: false, move: K.denSide(st, data, d).move, name: `the ${nameOfDen(st, data, d)}` };
}
const dirOf = (c, s, key) => (s.noTarget && key === s.owner ? denOf(c, key).box : s.pos[key]);

// Hit determination for every section (8.4.8d, e): each attacker hits the owner, and the owner hits its target. An attack hits the counter that stands in the same direction (a circle, a
// box and a square of one direction are the same line, 8.4.8b) or undercuts its maneuver time (8.4.8a). Returns the blows, as combat.js orders and delivers them.
export function blows(st, data, log) {
    const c = st.combat, hits = [];
    prune(st);
    for (const s of c.sec.sheets) {
        const aim = (attUid, defUid) => {
            const def = defenderOf(st, data, c, defUid), dd = dirOf(c, s, def.key);
            for (const k of counters(c, attUid).filter(k => k.role !== 'horse')) {
                if (k.role === 'part' && denOf(c, k.key).dead) continue;
                const n = numsOf(st, data, c, k.key);
                if (!n.can) { log(`${n.name} cannot attack on this side.`); continue; }
                const da = dirOf(c, s, k.key);
                if (da == null || dd == null) continue;
                const hit = da === dd || n.atk < def.move;
                log(`${n.name}: ${DIRS[da]} at ${def.name} (${MANEUVERS[dd]}${def.horse ? ', on the horse' : ''}): ${hit ? `hit${da === dd ? '' : ' by undercutting'}` : 'miss'}.`);
                if (hit) hits.push({ who: 'sec', att: attUid, via: k.key, def: defUid, horse: def.horse, time: n.atk, length: n.length ?? 0, sheet: s.id });
            }
        };
        for (const a of s.attackers) aim(a, s.owner);
        if (s.target && !s.noTarget) aim(s.owner, s.target);
    }
    return hits;
}
export const blowName = (st, data, h) => `${nameOf(st, data, h.via)}'s blow`;

// A blow comes due: carried out against the situation when its instant began. A hireling's blow at a native with a horse falls on the horse; if the horse is dead by then, on the native (8.4.9i).
export function thunk(st, data, h, alive, log) {
    const c = st.combat, attHire = hireOf(c, h.att), defHire = hireOf(c, h.def);
    const attOk = attHire ? !attHire.dead : alive.has(h.att) && alive.has(h.via);
    const defOk = defHire ? !defHire.dead : alive.has(h.def);
    if (!attOk) { log(attHire && !ownerRec(st, attHire)?.dead ? `${nameOf(st, data, h.via)} is no longer your hireling: his blow is cancelled (8.4.2g.1).` : `${nameOf(st, data, h.via)} is dead before its blow can land.`); return null; }
    if (!defOk) { log(defHire && !ownerRec(st, defHire)?.dead ? `${nameOf(st, data, h.via)}'s blow at ${nameOf(st, data, h.def)} is cancelled: he is no longer your hireling (8.4.2g.1).` : `${nameOf(st, data, h.via)}'s blow finds ${nameOf(st, data, h.def)} already dead.`); return null; }
    if (attHire) return () => hireBlow(st, data, attHire, denOf(c, h.def), h, log);
    return () => denBlow(st, data, denOf(c, h.via), defHire, h, log);
}
function hireBlow(st, data, att, den, h, log) {
    const c = st.combat, horse = den.kind === 'nat' ? c.dens.find(x => x.kind === 'horse' && x.partOf === den.uid && !x.dead) : null;
    if (!(h.horse && horse)) return K.hireStrikes(st, data, { hire: att.uid, den: den.uid }, log);
    const hs = K.hireStats(data, att.id, att.kind, st, att.side), ds = K.denSide(st, data, horse);
    let level = lvl(hs.harm) + (ds.armored ? Math.max(0, hs.stars - 1) : hs.stars);
    if (hs.missile) level += K.missileRoll(st, `${hs.name}'s missile roll`, hs.archer);
    if (level >= lvl(ds.vuln)) {
        horse.dead = true;
        const n = st.nats.find(x => x.id === den.id); if (n) n.horseDead = true;
        log(`${hs.name} strikes down the ${nameOfDen(st, data, den)}'s ${ds.name}.`);
        c.eventful = true;
    } else log(`${hs.name} hits the ${nameOfDen(st, data, den)}'s ${ds.name} but does not kill it.`);
}
function denBlow(st, data, den, hire, h, log) {
    const c = st.combat, hd = hire.kind === 'nat' ? data.natives[hire.id].horse : null;
    if (!(h.horse && hire.horse?.alive && hd) || den.pickedUp) return K.denStrikesHire(st, data, den, hire.uid, log);
    const ds = K.denSide(st, data, den), hv = hd[hire.horse.side], hs = K.hireStats(data, hire.id, hire.kind, st, hire.side);
    if (ds.attack === 'spell') return K.denStrikesHire(st, data, den, hire.uid, log);          // (the Demons' and the Imp's numeral sides ignore horses, 8.4.7b.3)
    let level = lvl(ds.harm) + (hd.armored ? Math.max(0, ds.stars - 1) : ds.stars);
    if (ds.attack === 'missile') level += K.missileRoll(st, `${ds.name}'s missile roll (at ${hs.name}'s horse)`, ds.type === 'Archer');
    if (level >= lvl(hv.vulnerability)) {
        hire.horse.alive = false;
        const n = st.nats.find(x => x.id === hire.id); if (n) n.horseDead = true;
        log(`The ${ds.name} strikes down ${hs.name}'s ${hd.name}.`);
        c.eventful = true;
    } else {
        log(`The ${ds.name} hits ${hs.name}'s ${hd.name} but does not kill it.`);
        const owner = den.kind === 'part' ? c.dens.find(d => d.uid === den.partOf) : den;
        if (owner && !owner.dead && K.redCapable(st, data, owner) && !owner.pickedUp) (c.toRedHire ??= []).push({ den: owner.uid, hire: hire.uid });          // (8.4.7d.3: it hit the native's horse)
    }
}

// What the Melee Sections screen shows while the hirer is still choosing: for each section, whom its owner would strike and where every counter would stand if the plan were `{ hireTargets, positions }`
// (the same targetsOf and layout the Melee step uses), or why that plan is not allowed. Changes nothing (the targets it tries are put back).
export function preview(st, data, plan = {}) {
    const c = st.combat;
    if (!inRound(st)) return [];
    const saved = c.sec.sheets.map(s => [s, s.target]);
    try {
        targetsOf(st, plan);
        return c.sec.sheets.map(s => {
            const z = zonesOf(c, s), mine = {};
            for (const k of [...(s.ownerKind === 'hire' ? z.box : []), ...z.square, ...z.circle]) if (k.key in (plan.positions ?? {})) mine[k.key] = plan.positions[k.key];          // (an uncontrolled denizen's own counters are placed by the rules, 8.4.2a)
            let pos, error = null;
            try { pos = layout(st, data, s, mine); } catch (e) { error = e.message; let base; try { base = layout(st, data, s, {}); } catch { base = { ...s.pos }; } pos = { ...base, ...mine }; }          // (a plan that is not allowed is shown as it was named, with the reason)
            return { id: s.id, target: s.target, pos, error };
        });
    } finally { for (const [s, t] of saved) s.target = t; }
}

// ---- what the screen and the computer players may read ----
export function view(st, data) {
    const c = st.combat;
    if (!inRound(st)) return null;
    const all = allCounters(c);
    return c.sec.sheets.map(s => ({
        id: s.id, owner: s.owner, ownerName: nameOf(st, data, s.owner), ownerKind: s.ownerKind, attackers: s.attackers.map(u => ({ uid: u, name: nameOf(st, data, u), hire: !!hireOf(c, u) })),
        target: s.target ?? last(s.attackers) ?? null, counters: Object.fromEntries([...all].filter(([, v]) => v.sheet === s).map(([k, v]) => [k, v.role])),
        chooses: s.ownerKind === 'hire' && s.attackers.length > 1, held: !!s.held, pos: { ...s.pos },
    }));
}
