// SEAT VOICE: the engine tells everything a seat does in the second person ("You rest.", "You try to slip out of sight, but you are seen.") because it was written for one player and one hero. A hired
// leader's (or controlled monster's) turn is not "you": it is "Company leader rests." This module turns the line of a seat into the third person, for the log, the tray's last-action line, the
// result cards and the Journal (storyvoice.js lineFor calls it for a line whose `who` is a seat). Pure text, both voices. It is a small, careful rewrite, not a grammar: every pattern is a plain
// word the engine really writes, and a sentence it does not understand is left as it is (the engine's own words are never lost).
//
//   seatVoice(text, { name, kind })   kind: 'nat' (he / his / him) or 'mon' (it / its / it)

const IRREGULAR = { are: 'is', were: 'was', have: 'has', do: 'does', go: 'goes', don: 'doesn', 'don’t': 'doesn’t', "don't": "doesn't", "haven't": "hasn't", "aren't": "isn't", "can't": "can't" };
const MODAL = new Set(['can', 'cannot', 'may', 'might', 'will', 'would', 'must', 'should', 'could', 'shall', 'did', 'had', 'was', 'got', 'took', 'found', 'saw', 'made', 'lost', 'left', 'fell', 'rolled', 'won', 'came', 'went', 'felt']);
const ADVERB = new Set(['also', 'then', 'still', 'never', 'always', 'just', 'quickly', 'again', 'only', 'now', 'first', 'next', 'soon', 'already', 'even', 'finally', 'barely', 'nearly', 'almost', 'both']);
// a verb in the present tense of "you" to the present tense of "he": try -> tries, rest -> rests, search -> searches, go -> goes. A word that is not a plain verb (a past tense, a modal) is left alone.
function third(w) {
    const lw = w.toLowerCase();
    if (IRREGULAR[lw]) return w[0] === w[0].toUpperCase() ? IRREGULAR[lw][0].toUpperCase() + IRREGULAR[lw].slice(1) : IRREGULAR[lw];
    if (MODAL.has(lw) || /ed$/.test(lw) || /s$/.test(lw) && !/(ss|sh)$/.test(lw)) return w;          // (past tense, a modal, or already a third-person form)
    if (/[^aeiou]y$/.test(lw)) return `${w.slice(0, -1)}ies`;
    if (/(s|sh|ch|x|z|o)$/.test(lw)) return `${w}es`;
    return `${w}s`;
}

// "you" in these places is the object ("A Wolf stops you."), not the subject
const OBJECT = /\b(stops?|finds?|sees?|blocks?|follows?|leaves?|to|from|for|on|at|with|by|of|toward|towards|behind|before|after|against|near|beside|about|over|under|upon|into|onto|past|round|around|hits?|strikes?|catches?|lets?|makes?|gives?|takes?|calls?|asks?|tells?|helps?|joins?|meets?|spots?|notices?|attacks?|wounds?|kills?|lose|loses|lost)\s+$/i;

export function seatVoice(text, { name, kind = 'nat' } = {}) {
    if (typeof text !== 'string' || !/\byou(r|rs|rself)?\b/i.test(text)) return text;
    const P = kind === 'mon' ? { he: 'it', him: 'it', his: 'its', himself: 'itself' } : { he: 'he', him: 'him', his: 'his', himself: 'himself' };
    const cap = w => w[0].toUpperCase() + w.slice(1);
    const re = /\byou(rself|rs|r)?\b/gi, lead = /^Phase \d+:\s+/.exec(text)?.[0].length ?? 0;
    let out = '', i = 0, m, named = false;
    while ((m = re.exec(text))) {
        const before = text.slice(0, m.index), start = m.index === 0 || m.index === lead || /([.!?]\s+|\n)$/.test(before);
        out += text.slice(i, m.index);
        i = m.index + m[0].length;
        const suffix = (m[1] ?? '').toLowerCase();
        if (suffix === 'r' || suffix === 'rs') { out += start && suffix === 'r' ? cap(P.his) : P.his; re.lastIndex = i; continue; }
        if (suffix === 'rself') { out += P.himself; re.lastIndex = i; continue; }
        if (OBJECT.test(before) && !start) { out += P.him; re.lastIndex = i; continue; }
        // the subject: the name the first time at the start of a sentence, the pronoun after; the verb that follows (past any adverbs, and the ones joined by and / or / but) takes its third-person form
        out += start ? (named ? cap(P.he) : name) : P.he;
        if (start) named = true;
        let skip = '', joined = false;
        for (;;) {
            const w = /^(\s+)([A-Za-z\u2019']+)/.exec(text.slice(i));
            if (!w) { out += skip; break; }
            const lw = w[2].toLowerCase();
            if (ADVERB.has(lw)) { skip += w[0]; i += w[0].length; continue; }
            if (joined && NOT_VERB.has(lw)) { out += skip; break; }
            out += skip + w[1] + third(w[2]); i += w[0].length; skip = '';
            // "searches and find nothing": the next verb after and / or / but / then is the same person's
            const j = /^(\s+(?:and|or|but|then))(?=\s)/i.exec(text.slice(i));
            if (!j) break;
            out += j[1]; i += j[1].length; joined = true;
        }
        re.lastIndex = i;
    }
    return out + text.slice(i);
}
const NOT_VERB = new Set(['the', 'a', 'an', 'his', 'its', 'her', 'their', 'him', 'it', 'he', 'she', 'they', 'you', 'your', 'no', 'nothing', 'some', 'one', 'two', 'three', 'this', 'that', 'then', 'on', 'in', 'at', 'to']);
