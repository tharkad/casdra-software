// The spells that can be cast. Each handler is one file in handlers/ with a small contract (docs/design/magic/00-framework.md section 6.3):
//   useful(st, data, opt) -> bool        is casting it worth a prompt right now (default true)
//   quiet(st, data, opt) -> bool         has it a legitimate use in an evening with nothing hostile about, though not `useful` (default false); see cast.js canCastQuietly
//   legal(st, data, ctx) -> true | 'why not'     place and other conditions beyond colour and chit
//   aim(st, data, ctx) -> [{ ref, label }] | null    the legal targets, or null when it needs none
//   start(ctx)                           the spell comes to life (in completion-time order); ctx = { st, data, spell, caster, source, targets, params, say, log, fx(spec) }
//   apply(ctx, fx) / unapply(ctx, fx, why)     an effect comes into force / ends (overlays only; tags need neither)
//   tags(fx) -> { name: value }          what the rules consult through fxTags
//   dur: 'instant'|'attack'|'combat'|'day'|'phase'|'fly'|'permanent'   (also in spells.json 'duration', which wins)
//   ai: { role, score }                  for the computer players
import makeWhole from './handlers/make-whole.js';
import controlBats from './handlers/control-bats.js';
import stonesFly from './handlers/stones-fly.js';
import fieryBlast from './handlers/fiery-blast.js';
import lightningBolt from './handlers/lightning-bolt.js';
import elementalSpirit from './handlers/elemental-spirit.js';
import guideSpider from './handlers/guide-spider-or-octopus.js';
import dealWithGoblins from './handlers/deal-with-goblins.js';
import dissolveSpell from './handlers/dissolve-spell.js';
import transform from './handlers/transform.js';
import askDemon from './handlers/ask-demon.js';
import blendIntoBackground from './handlers/blend-into-background.js';
import seeHiddenSigns from './handlers/see-hidden-signs.js';
import peaceWithNature from './handlers/peace-with-nature.js';
import premonition from './handlers/premonition.js';
import fog from './handlers/fog.js';
import witchsBrew from './handlers/witch-s-brew.js';
import faerieLights from './handlers/faerie-lights.js';
import senseDanger from './handlers/sense-danger.js';
import badLuck from './handlers/bad-luck.js';
import illusion from './handlers/illusion.js';
import lost from './handlers/lost.js';
import talkToWiseBird from './handlers/talk-to-wise-bird.js';
import protectionFromMagic from './handlers/protection-from-magic.js';
import curse from './handlers/curse.js';
import powerOfThePit from './handlers/power-of-the-pit.js';
import remedy from './handlers/remedy.js';
import exorcise from './handlers/exorcise.js';
import pentangle from './handlers/pentangle.js';
import smallBlessing from './handlers/small-blessing.js';
import peace from './handlers/peace.js';
import elvenGrace from './handlers/elven-grace.js';
import poison from './handlers/poison.js';
import persuade from './handlers/persuade.js';
import roofCollapses from './handlers/roof-collapses.js';
import blazingLight from './handlers/blazing-light.js';
import violentStorm from './handlers/violent-storm.js';
import whistleForMonsters from './handlers/whistle-for-monsters.js';
import unleashPower from './handlers/unleash-power.js';
import hurricaneWinds from './handlers/hurricane-winds.js';
import absorbEssence from './handlers/absorb-essence.js';

export const HANDLERS = {};
for (const h of [makeWhole, controlBats, stonesFly, fieryBlast, lightningBolt, elementalSpirit, guideSpider, dealWithGoblins, dissolveSpell, transform, askDemon,
    blendIntoBackground, seeHiddenSigns, peaceWithNature, premonition, fog, witchsBrew, faerieLights, senseDanger, badLuck, illusion, lost, talkToWiseBird, protectionFromMagic,
    curse, powerOfThePit, remedy, exorcise, pentangle, smallBlessing, peace, elvenGrace, poison, persuade, roofCollapses, blazingLight, violentStorm, whistleForMonsters, unleashPower, hurricaneWinds, absorbEssence]) HANDLERS[h.id] = h;

// Extra turns, Magic Sight and artifacts (docs/design/magic/02-day-spells.md, "Implementation notes: turns, sight and artifacts"): a block of its own.
import worldFades from './handlers/world-fades.js';
import enchantArtifact from './handlers/enchant-artifact.js';
import phantasm from './handlers/phantasm.js';
import prophecy from './handlers/prophecy.js';
for (const h of [worldFades, enchantArtifact, phantasm, prophecy]) HANDLERS[h.id] = h;

export const handlerOf = id => HANDLERS[id] ?? null;
export const spellDef = (data, id) => data.spells?.[id] ?? Object.values(data.spells ?? {}).find(x => x.id === id) ?? null;

// Flying and mist (docs/design/magic/02-day-spells.md sections 8 and 15), registered apart from the list above.
import broomstick from './handlers/broomstick.js';
import meltIntoMist from './handlers/melt-into-mist.js';
for (const h of [broomstick, meltIntoMist]) HANDLERS[h.id] = h;
