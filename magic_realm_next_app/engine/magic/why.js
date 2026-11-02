// Why a spell he knows cannot be cast now, as a CODE plus arguments (docs/engine-api/PHASE3.md, round 5). A handler's `legal` answers `true` or `no(code, params)`; this file is the ONE place
// the sentence for each code is built. The engine puts both on a blocked spell (`why` the sentence, `whyCode` the `{ code, params }`) and the screens, which may import this file
// through catalogue.js, can build the same sentence from the code alone. Pure: it reads nothing but its arguments.

/** The answer of a handler's `legal` when the spell cannot be cast: `{ code, params }`. */
export const no = (code, params = {}) => ({ code, params });
export const isNo = r => !!r && typeof r === 'object' && typeof r.code === 'string';

const TYPE_OF_COLOR = { Grey: 'II', White: 'V', Gold: 'III', Purple: 'IV', Black: 'VI' };          // (only a fallback: the engine passes `chitType`)

export const WHY_SENTENCES = {
    'caster.pentangle': () => 'A Pentangle holds off every new spell aimed at you, your own included.',
    'targets.shielded': () => 'Every legal target is shielded (a Pentangle, or the Wish for Peace).',
    'colour.missing': p => `Needs ${p.color ?? 'some'} magic.${p.next ? ` ${p.color} fills the land on day ${p.next}.` : ''}${p.chapel ? ' It is also here in the clearing of a Chapel.' : ''}${p.color
        ? ` Or enchant a Type ${p.chitType ?? TYPE_OF_COLOR[p.color] ?? '?'} Magic chit in an Enchant phase to hold ${p.color} magic yourself.`
        : ' Or enchant a Magic chit in an Enchant phase to hold a colour yourself.'}`,
    'box.tied': () => 'Its spell box is tied up by the spell you cast with it, which is still in effect (8.4.3c).',
    'chit.none': p => `You have no ready Magic ${p.type} chit.`,
    'chit.slow': p => `Your Magic ${p.type} chit is too slow: a Magic chit must be no slower than the fastest creature facing you (time ${p.slowest}). Alert it in an Alert phase and it acts at time 0.`,
    'place.cave': p => `${p.spell} can be cast only in a cave clearing.`,
    'place.mountain': p => `${p.spell} can be cast only in a mountain clearing.`,
    'ask-demon.nobody': () => 'Ask Demon needs another player to ask.',
    'ask-demon.no-demon': () => 'Ask Demon needs a Demon or Winged Demon in the clearing.',
    'absorb.none': () => 'There is no monster here to absorb.',
    'broomstick.weight': () => 'Broomstick can be cast only on a character of Light weight.',
    'elemental.chits': () => 'Elemental Spirit needs a ready Type IV chit to cast it and another Type IV or VI chit to change.',
    'dissolve.none': () => 'There is no spell in effect here to dissolve.',
    'enchant.no-item': () => 'You have no active Artifact or Spell Book to enchant.',
    'enchant.no-spell': () => 'You know no other spell to record on it.',
    'hurricane.no-tile': () => 'There is no adjacent tile to blow the target to.',
    'hurricane.no-creature': () => 'There is no creature here to blow away.',
    'peace.none': () => 'There is no creature here to make peaceful.',
    'mist.already': () => 'You are already mist.',
    'poison.none': () => 'There is no weapon or creature here that Poison can be put on (not the Alchemist\'s Mixture, not a bare Fight chit).',
    'persuade.none': () => 'There is no native group, Giant or Ogre here to persuade.',
    'remedy.none': () => 'There is no spell or curse here to break.',
    'unleash.no-chit': () => 'You have no other ready Magic chit to transform.',
    'storm.no-clearing': () => 'There is no clearing to storm.',
    'whistle.small-tile': p => `${p.spell} cannot be cast in a tile with fewer than six clearings.`,
    'whistle.no-sound': () => 'No Sound chit is face up on the map.',
};

/** The sentence for `{ code, params }` (a plain string comes back as it is). */
export const whySentence = r => (typeof r === 'string' ? r : WHY_SENTENCES[r?.code]?.(r.params ?? {}) ?? '');
