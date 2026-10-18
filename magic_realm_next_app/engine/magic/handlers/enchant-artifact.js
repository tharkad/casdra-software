import { ref, fxList } from '../fx.js';
import { knownSpells } from '../cast.js';
import { spellDef } from '../registry.js';
import { enchantableItems, findItem } from '../artifacts.js';
import { nameOf } from '../../items.js';
// Enchant Artifact (VI / Purple / Permanent, one Artifact or Spell Book he has active): he also names one of his recorded spells. That spell and its Magic type are
// added to the item. While the spell is energized the holder can read the runes of the added card to learn it (runes.js runesTargets, only while energized: digest 04
// section 7.3) and can play the item to cast it (cast.js itemCastOptions: time 0, no Magic chit, awakened from the start, once per Evening for each Magic type, the item
// tied to the spell while it lives). An item can be enchanted any number of times; each casting ties up one Enchant Artifact and its Type VI chit (committed for the
// spell's life, tired when it ends). Spec: docs/design/magic/03-control-spells.md section 7.
// HOW: the record `fx.data = { item: uid, spell, type }` applies by writing `item.extra = [{ fx, type, spell }]` (artifacts.js numeralsOf reads it), and unapply removes it, so
// the extra exists exactly while the spell is live: it vanishes when the spell goes inert at Midnight (4.6.7h), is broken (Dissolve, Exorcise, the caster's death: it is cast by
// a chit so it ends with him, 4.6.10h) or is nullified, and comes back when he energizes it again.
// DECISIONS: (1) follow the card, not RealmSpeak: only an item he has ACTIVE can be enchanted (RS accepts any artifact he owns that is not itself enchanted). (2) The
// recorded spell is named in the aim step (params.spell); with none named the first spell he knows (not Enchant Artifact itself) is taken. The spell need not be one he can
// cast now. (3) Naming the same spell on the same item twice does nothing (the later one is nullified, 4.6.10e); a different spell on the same item is a second extra.
// (4) The item goes where its holder goes; if it is abandoned the extra stays on it (it is lost if the spell ends). Dropping or selling the item does not end the spell.
// (5) Hostile spells (Fog and the like) may be recorded: whoever plays the item casts them with his own aim.
const spellsToRecord = (st, data) => knownSpells(st, data).filter(s => s.id !== 'enchant-artifact');
const itemRef = it => ref('item', it.uid);
const typeOf = (data, id) => spellDef(data, id)?.type;

export default {
    id: 'enchant-artifact', dur: 'permanent', benevolent: true,
    legal: (st, data) => (!enchantableItems(st, data).length ? 'You have no active Artifact or Spell Book to enchant.' : !spellsToRecord(st, data).length ? 'You know no other spell to record on it.' : true),
    aim: (st, data) => {
        const o = enchantableItems(st, data).map(it => ({ ref: itemRef(it), label: `${nameOf(data, it)}${it.extra?.length ? ` (already holds ${it.extra.length} added spell${it.extra.length === 1 ? '' : 's'})` : ''}` }));
        return o.length ? o : null;
    },
    params: (st, data) => [{ key: 'spell', kind: 'choice', label: 'Record which of your spells on it', options: spellsToRecord(st, data).map(s => ({ value: s.id, label: `${s.name} (Type ${s.type}, ${s.color ?? 'any colour'})` })) }],
    // worth a prompt when something could be recorded on an item that does not hold it yet; never in a quiet evening by default: it is a long project, not a reflex
    useful: () => false,
    quiet: st => !fxList(st, { spell: 'enchant-artifact', any: true }).length,         // a long project, started in the evening; asked only while none is under way (legal() already needs an item and a spell)
    start(ctx) {
        const { st, data } = ctx;
        const it = (ctx.targets[0] && st.ch.items.find(i => i.uid === ctx.targets[0].id)) ?? enchantableItems(st, data)[0];
        const known = spellsToRecord(st, data), named = ctx.params?.spell;
        const sp = known.find(s => s.id === named) ?? known[0];
        if (!it || !sp) { ctx.log('Enchant Artifact: there is no item or spell to work on.'); return; }
        if (fxList(st, { spell: 'enchant-artifact', target: itemRef(it), any: true }).some(f => f.data.spell === sp.id)) { ctx.log(`Enchant Artifact: the ${nameOf(data, it)} already holds ${sp.name}; casting it again does nothing.`); return; }
        ctx.fx({ targets: [itemRef(it)], data: { item: it.uid, spell: sp.id, type: sp.type } });
        ctx.log(`Enchant Artifact: the ${nameOf(data, it)} gains ${sp.name} and Magic Type ${sp.type}. While this spell is energized (Purple magic) you can read the added card's runes and play the item to cast it.`);
    },
    apply(ctx, fx) {
        const it = findItem(ctx.st, fx.data.item);
        if (!it) return;
        it.extra = (it.extra ?? []).filter(e => e.fx !== fx.id);
        it.extra.push({ fx: fx.id, type: fx.data.type ?? typeOf(ctx.data, fx.data.spell), spell: fx.data.spell });
    },
    unapply(ctx, fx) {
        const it = findItem(ctx.st, fx.data.item);
        if (!it?.extra) return;
        it.extra = it.extra.filter(e => e.fx !== fx.id);
        if (!it.extra.length) delete it.extra;
        // the item's tie to a spell cast from the added card ends with it (its own fx remains; only the card is gone)
    },
    ai: { role: 'utility' },
};
