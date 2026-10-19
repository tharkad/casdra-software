import { h } from '../dom.js';
import { icon } from '../icons.js';
import { sheet, setCalm, calm, textSize, setTextSize, TEXT_SIZES, topGap, setTopGap, TOP_GAPS } from '../ds.js';
import { voice, setVoice } from '../voice.js';
import { myName, setMyName, serverUrl, setServerUrl } from '../online.js';
import { collect as collectReport, send as sendReport } from '../bugreport.js';
import { noteButtonOn, setNoteButton, openNotesList } from '../notes.js';
import { VERSION, BUILD } from '../version.js';
import { bar, field, input, openSheet, say, seg, switchRow } from '../front.js';

// How to play: five rows, each one sentence of the world's voice, each opening to today's paragraphs (review FD-16). The same list feeds the welcome modal (HOW_TO_PLAY is exported for it).
// Every paragraph below is the text the game has always carried: only the grouping and the one-line summaries are new.
const P = {
    day: ['The day', 'Each day has up to four phases: two basic, and two more in daylight if you stay out of the caves. In the morning you plan every phase secretly; then the day plays out. Anything impossible at its turn is simply lost.'],
    move: ['Moving', 'One Move phase takes you one clearing along a road. Mountains cost two Move phases in a row. You can only carry what your strongest Move chit (or horse) can carry; anything heavier is dropped where you stand.'],
    hide: ['Hiding', 'A Hide phase may hide you (a roll of 1 to 5). Hidden, monsters cannot block you. You are revealed when blocked, when you attack, or when your turn comes round.'],
    search: ['Searching', 'Peer finds hidden paths and the identity of chits in your tile. Locate finds secret passages and sites in your clearing. Loot takes a treasure from a site you have found, or from things lying on the ground.'],
    trade: ['Trading and hiring', 'Natives buy anything at its price. To buy from them or to hire them you roll on the Meeting Table: a better relationship gives a better price. Some characters change this: the Black Knight rolls one die, and the White Knight subtracts one from every die.'],
    block: ['Blocking and summoning', 'At the end of each phase any monster in your clearing blocks you and ends your turn. When your turn ends, creatures that prowl today in your tile come to you, the chits in your tile turn up, and they call monsters out of the Appearance Chart.'],
    evening: ['Evening combat', 'Each evening you fight whoever is in your clearing. Each round: one action; then secretly choose your attack direction and chit, your maneuver direction and chit, and which way your shield faces; the dice then shuffle the creatures. A blow hits if its speed is lower than the target\'s maneuver speed, or if the direction matches.'],
    chits: ['Chits', 'Fight chits strike, Move chits maneuver and carry. A star is effort: you may play at most two stars a round, and you fatigue one fewer than you played. Wounded chits are out of play until rested back. When every chit is wounded, you are dead.'],
    win: ['Winning', 'You spend victory points on goals before the game: Fame, Notoriety, Gold, great treasures and spells. At the end each goal is scored as what you earned minus what you set; a shortfall counts triple.'],
};
export const HOW_TO_PLAY = [
    { id: 'plan', title: 'Plan', icon: 'scroll', line: 'Each dawn you plan your day in secret, one phase at a time.', paras: [P.day] },
    { id: 'day', title: 'The day', icon: 'sun', line: 'Then it plays out: you move, hide, search, trade, as you planned.', paras: [P.move, P.hide, P.search, P.trade, P.block] },
    { id: 'evening', title: 'Evening', icon: 'moon', line: 'At dusk you face whatever shares your clearing.', paras: [P.evening] },
    { id: 'chits', title: 'Chits', icon: 'spark', line: 'Fight chits strike, Move chits dodge and carry. Effort tires them.', paras: [P.chits] },
    { id: 'win', title: 'Win', icon: 'trophy', line: 'Spend victory points on goals, then meet them, or pay triple.', paras: [P.win] },
];
// The flat list the in-game help sheet reads today.
export const HELP = HOW_TO_PLAY.flatMap(g => g.paras);

export function helpScreen(ctx) {
    const open = new Set();
    const list = h('div', { class: 'ds-list ds-how' });
    const draw = () => list.replaceChildren(...HOW_TO_PLAY.map(g => {
        const on = open.has(g.id);
        return h('div', { class: `ds-howrow${on ? ' on' : ''}`, 'data-how': g.id },
            h('button', { type: 'button', class: 'ds-row', 'aria-expanded': on ? 'true' : 'false', onclick: () => { if (on) open.delete(g.id); else open.add(g.id); draw(); } },
                h('span', { class: 'glyph' }, icon(g.icon, 'lg')),
                h('span', { class: 'main' }, h('b', {}, g.title), h('span', {}, g.line)),
                icon(on ? 'up' : 'down')),
            on ? h('div', { class: 'ds-howbody' }, ...g.paras.flatMap(([t, x]) => [g.paras.length > 1 ? h('h3', {}, t) : null, h('p', {}, x)])) : null);
    }));
    draw();
    return h('main', { class: 'screen ds-screen ds-title flush', 'data-screen': 'rules' },
        bar('How to play', { onBack: () => ctx.go('title') }),
        h('div', { class: 'ds-scroll ds-fade-b ds-pad' }, h('p', { class: 'ds-voice lg ds-q' }, 'A day in the realm.'), list));
}

// ---- Settings (mockup 06 h4): only what is real. Stored per channel, because channel.js prefixes every localStorage key of the redesign build. ----
const WELCOME_KEY = 'mr-welcomed-v1';                        // the same key play/state.js reads
const clearWelcome = () => { try { localStorage.removeItem(WELCOME_KEY); } catch { /* ignore */ } };

// "Report a bug" from outside a game: a description, this device's recorded games, the app version and screen size.
export function bugSheetFront() {
    const b = { text: '', status: 'idle', error: null, packed: null, id: null };
    let close = () => {};
    const draw = () => {
        const sending = b.status === 'sending';
        close();
        if (b.status === 'sent') {
            close = openSheet(sheet({ title: 'Report sent', detent: 'hug', onClose: () => close(), attrs: { 'data-sheet': 'bug' },
                body: h('p', { class: 'ds-voice lg' }, `Thank you. Your report is number ${b.id}.`),
                foot: h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'bug-done', onclick: () => close() }, 'Done') }));
            return;
        }
        const area = h('textarea', { class: 'ds-input ds-textarea', rows: 5, placeholder: 'What happened, and what did you expect? (Which screen, which action.)', 'data-bug-text': '', disabled: sending || null,
            oninput: e => { b.text = e.target.value; send.disabled = !b.text.trim(); } });
        area.value = b.text;
        const send = h('button', { type: 'button', class: 'ds-btn primary', 'data-act': 'bug-send', disabled: !b.text.trim() || sending || null, onclick: async () => {
            b.status = 'sending'; b.error = null; draw();
            try { b.packed = await collectReport({ st: null, rec: null, version: VERSION, ui: null }); b.id = await sendReport(b.text.trim(), b.packed); b.status = 'sent'; }
            catch (e) { b.status = 'failed'; b.error = e.message; }
            draw();
        } }, sending ? 'Sending…' : b.status === 'failed' ? 'Try again' : 'Send it');
        close = openSheet(sheet({ eyebrow: 'Settings', title: 'Report a bug', detent: 'tall', onClose: () => close(), attrs: { 'data-sheet': 'bug' },
            body: [h('p', { class: 'ds-voice ds-q' }, 'What went wrong?'), area,
                b.status === 'failed' ? h('p', { class: 'ds-why bad', role: 'alert' }, `Could not send: ${b.error}`) : null,
                b.status === 'failed' && b.packed ? h('button', { type: 'button', class: 'ds-btn block', 'data-act': 'bug-save', onclick: () => {
                    const url = URL.createObjectURL(new Blob([b.packed.text], { type: 'application/json' }));
                    const a = Object.assign(document.createElement('a'), { href: url, download: `magic-realm-report-${Date.now()}.json` });
                    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
                } }, 'Save it as a file instead') : null,
                h('p', { class: 'ds-meta ds-sheet-line' }, 'Sends your words, the games recorded on this device, the version and your screen size.')],
            foot: [h('button', { type: 'button', class: 'ds-btn quiet', 'data-act': 'bug-cancel', disabled: sending || null, onclick: () => close() }, 'Cancel'), send] }));
        if (!b.text) area.focus?.();
    };
    draw();
}

export function settingsScreen(ctx) {
    const root = h('main', { class: 'screen ds-screen ds-title flush', 'data-screen': 'settings' });
    let advanced = false;
    const build = () => {
        const nameIn = input({ value: myName(), placeholder: 'Shown to the others', maxlength: 24, autocomplete: 'nickname', 'data-field': 'name', oninput: e => setMyName(e.target.value.trim()) });
        const serverIn = input({ type: 'url', value: serverUrl(), 'data-field': 'server', onchange: e => setServerUrl(e.target.value === location.origin ? '' : e.target.value) });
        const row = (title, sub, onclick, attrs = {}) => h('button', { type: 'button', class: 'ds-row ds-setrow', ...attrs, onclick }, h('span', { class: 'main' }, h('b', {}, title), sub ? h('span', {}, sub) : null), icon(attrs['aria-expanded'] === 'true' ? 'down' : 'right'));
        return [bar('Settings', { onBack: () => ctx.go('title') }),
            h('div', { class: 'ds-scroll ds-fade-b ds-pad' },
                h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'Reading')),
                field('Tell it as', seg([['story', 'Story'], ['detail', 'Detail']], voice(), v => { setVoice(v); redraw(); }, { label: 'Tell it as', attrOf: id => ({ 'data-voice-pick': id }) }),
                    { cls: 'ds-fieldgap', why: h('span', { class: 'ds-why' }, 'The Story is short and told in the world’s voice; Detail adds every number.') }),
                field('Text size', seg(TEXT_SIZES, textSize(), v => { setTextSize(v); redraw(); }, { label: 'Text size', attrOf: id => ({ 'data-textsize-pick': id }) }),
                    { cls: 'ds-fieldgap', why: h('span', { class: 'ds-why' }, 'Makes the words bigger everywhere. The map keeps its own size: pinch it to zoom.') }),
                field('Top margin', seg(TOP_GAPS, topGap(), v => { setTopGap(v); redraw(); }, { label: 'Top margin', attrOf: id => ({ 'data-topgap-pick': id }) }),
                    { cls: 'ds-fieldgap', why: h('span', { class: 'ds-why' }, 'Room under the status bar. On an iPhone the very top of the page can look faded; more margin moves the text out of it.') }),
                switchRow({ title: 'Calm motion', line: 'No gliding or flipping. The game follows your phone’s setting unless you turn this on.', on: calm(), attrs: { 'data-option': 'calm' }, onToggle: () => { setCalm(!calm()); redraw(); } }),
                switchRow({ title: 'Note button', line: 'A round microphone button on every screen: say what you want to happen there. It goes on a list for later.', on: noteButtonOn(), attrs: { 'data-option': 'notebtn' }, onToggle: () => { setNoteButton(!noteButtonOn()); redraw(); } }),
                row('Your notes', 'What you have said, and whether the server has it', () => openNotesList(), { 'data-act': 'notes' }),
                h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'Online')),
                field('Your name', nameIn),
                h('div', { class: 'ds-sect' }, h('span', { class: 'ds-eyebrow' }, 'This device')),
                h('div', { class: 'ds-list' },
                    row('Show the welcome again', null, () => { clearWelcome(); say('You will see the welcome at the start of your next game.'); }, { 'data-act': 'welcome-again' }),
                    row('Report a bug', null, () => bugSheetFront(), { 'data-act': 'bug' }),
                    row('Advanced', 'Game server address', () => { advanced = !advanced; redraw(); }, { 'data-act': 'advanced', 'aria-expanded': advanced ? 'true' : 'false' }),
                    advanced ? h('div', { class: 'ds-advanced' }, field('Game server address', serverIn), h('p', { class: 'ds-why' }, 'Leave it alone when this page was opened from the game server itself.')) : null),
                h('p', { class: 'ds-meta ds-about' }, `Magic Realm, third edition · v${VERSION}${BUILD ? `-${BUILD}` : ''}`, h('br'), 'An unofficial fan project. Magic Realm belongs to its owners.'))];
    };
    const redraw = () => { const y = root.querySelector('.ds-scroll')?.scrollTop ?? 0; root.replaceChildren(...build()); const s = root.querySelector('.ds-scroll'); if (s && y) s.scrollTop = y; };
    root.append(...build());
    return root;
}
