// The spells that can be cast. Each handler is one file in handlers/ with a small contract (docs/design/magic/00-framework.md section 6.3):
//   useful(st, data, opt) -> bool        is casting it worth a prompt right now
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


export const HANDLERS = {};
for (const h of [makeWhole, controlBats, stonesFly, fieryBlast, lightningBolt, elementalSpirit, guideSpider, dealWithGoblins, dissolveSpell, transform, askDemon,
    blendIntoBackground, seeHiddenSigns, peaceWithNature, premonition, fog, witchsBrew, faerieLights, senseDanger, badLuck, illusion, lost, talkToWiseBird, protectionFromMagic]) HANDLERS[h.id] = h;

export const handlerOf = id => HANDLERS[id] ?? null;
export const spellDef = (data, id) => data.spells?.[id] ?? Object.values(data.spells ?? {}).find(x => x.id === id) ?? null;
