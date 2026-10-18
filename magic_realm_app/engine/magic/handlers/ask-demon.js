// Ask Demon (V / Black / Instant): the caster asks one other player a question (yes, no or a number, about recorded information or game pieces, past or present),
// and the other player must answer truthfully. It targets one Demon or Winged Demon (not the Imp) that is visible to him; the Demon fights as usual.
//
// There is no other player in a solo game (the engine is one hero against the denizens, docs/design/multi-character-and-multiplayer.md), so the spell is learnable and counts for
// the Spells goal but is not offered: it is listed with "needs another player" among the spells he cannot cast. The request is already in its final shape for hot-seat and online
// play: casting posts { id, from, to, text, kind:'demon', answer:null } on st.questions, and only the asker and the answerer may see it (st.asks is the engine's own list of
// questions waiting for a character's answer, party.js; these are questions one player puts to another). The other characters at the table are the other records of
// st.chars, and st.others (effects.js) for a stand-in; `params` are `to` (the answerer's character id) and `text` (the question or a catalogue key). Decision (03 question 6):
// disabled when solo.
export const otherPlayers = st => [...(st.order ?? []).filter(id => id !== st.actor).map(id => st.chars[id]), ...Object.entries(st.others ?? {}).map(([id, c]) => ({ id, ...c }))];
const demons = (st, data) => (st.combat?.dens ?? []).filter(d => d.kind === 'mon' && !d.dead && data.monsters[d.id]?.family === 'Demon');

// Questions a computer-run or absent player can be asked: key -> [text, how to answer for a character record]
export const ASK_CATALOGUE = {
    gold: ['How much recorded gold do you have?', who => who.gold ?? 0],
    fame: ['How much Fame do you have?', who => who.fame ?? 0],
    notoriety: ['How much Notoriety do you have?', who => who.notoriety ?? 0],
    spells: ['How many spells have you recorded?', who => (who.spells ?? []).length],
    hidden: ['Are you hidden?', who => (who.hidden ? 'yes' : 'no')],
    clearing: ['Which clearing are you in?', who => who.at ?? 'on a road'],
};
export const answerAsk = (st, ask, who = st.ch) => { const q = ASK_CATALOGUE[ask.text]; return q ? (ask.answer = q[1](who)) : null; };

export default {
    id: 'ask-demon', dur: 'instant', benevolent: false, listBlocked: true,
    targets: { min: 1, max: 1 },
    params: [{ key: 'to', kind: 'player' }, { key: 'text', kind: 'question' }],
    legal: (st, data) => (!otherPlayers(st).length ? 'Ask Demon needs another player to ask.' : demons(st, data).length ? true : 'Ask Demon needs a Demon or Winged Demon in the clearing.'),
    aim: (st, data) => {
        const out = demons(st, data).map(d => ({ ref: { kind: 'mon', id: d.id }, label: data.monsters[d.id].name }));
        return out.length ? out : null;
    },
    useful: () => false,                         // a question is never worth interrupting a quiet evening for
    start(ctx) {
        const { st, data } = ctx;
        const t = ctx.targets[0], alive = t && demons(st, data).some(d => d.id === t.id);
        if (!alive) { ctx.log('Ask Demon: the Demon is gone before the spell takes hold.'); return; }          // it fizzles; the chit tires (resolveCasts)
        const to = ctx.params.to ?? otherPlayers(st)[0]?.id, text = ctx.params.text ?? 'gold';
        const ask = { id: 'a' + ((st.questions?.length ?? 0) + 1), from: 'ch', to, text, kind: 'demon', day: st.day, answer: null };
        (st.questions ??= []).push(ask);
        ctx.log(`Ask Demon: you put a question to ${to}.`);
    },
    ai: { role: 'utility' },
};
