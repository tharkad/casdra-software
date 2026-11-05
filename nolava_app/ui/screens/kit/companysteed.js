// screens/kit/companysteed.js: what the Company room says about steeds and Fly chits (company.js calls these; kept apart so the room's own file stays as it is). A hired or controlled Bat or
// Flying Dragon that follows him can be ridden in a Fly phase (7.3.3g); a Light hireling may hold a Fly chit from a Broomstick (4.6.7e.2, 7.3.3d.2). The engine says which (steeds.js).
import { voiced } from '../../commit.js';
import { h } from '../../dom.js';
import { flyChitWords, steedAloft, steedSources } from '../../steeds.js';
import { isStory } from '../../voice.js';

// Lines under a group's counters: its Fly chits, and a steed he can ride. -> [node]
export function steedNote(G, g) {
    const out = [], fc = flyChitWords(G.st, G.data, g.members, g.kind === 'mon' ? 'mon' : 'nat');
    if (fc) out.push(voiced(fc, { class: 'ds-meta st-note', 'data-fly-note': g.group }));
    if (g.kind === 'mon') {
        const air = steedAloft(G.st, G.data);
        if (air && g.members.some(o => o.id === air.id)) out.push(voiced({ story: `You are riding it now.`, detail: 'He is in the air on it (7.3.3g); it lands with him.' }, { class: 'ds-meta st-note', 'data-steed-note': 'riding' }));
        else {
            let rides = []; try { rides = steedSources(G.st, G.data); } catch { rides = []; }
            if (g.members.some(o => rides.some(r => r.steed === o.id))) out.push(voiced({ story: `${g.members.length > 1 ? 'One of them' : 'It'} can carry you. Plan a Fly phase and ride it, by day. It is not used up.`,
                detail: `A flying monster that follows him can be ridden in a Fly phase, in Daylight only (7.3.3g, 7.11.6a.7); unlike a Fly chit it is not used up.` }, { class: 'ds-meta st-note', 'data-steed-note': 'ride' }));
        }
    }
    return out;
}

// The question of letting a group go, when one of them is the steed he is flying on: the words, in the voice that is on; null for any other group.
export function steedAskWords(G, g) {
    const air = steedAloft(G.st, G.data);
    if (!air || !g.members.some(o => o.id === air.id)) return null;
    return isStory() ? `You are flying on it. If you let it go, you both come down at once. Let it go?` : `He is in the air on it: letting it go brings both down together, by the usual die (7.3.3g.5). Let it go?`;
}
