// Themes. The game's markup never changes; a theme is one stylesheet (ui/skins/<id>.css) that restyles it through the colour tokens and the
// card-face rules, plus the bundled open fonts (ui/fonts). `classic` is the original theme and has no stylesheet of its own.
// The choice is remembered per device (settings.skin) and can be forced with ?skin=<id>; index.html applies it before first paint.
export const SKINS = [
    { id: 'classic', label: 'Vibes', note: 'The original look: bright, saturated, glowing. (Its id stays "classic" so saved choices and links keep working.)' },
    { id: 'control-room', label: 'Control Room', note: 'Graphite and cool light, like an instrument panel. Calm and precise.' },
    { id: 'blueprint', label: 'Blueprint', note: 'Engineering-drawing blue with fine linework.' },
    { id: 'field-manual', label: 'Field Manual', note: 'Printed-card paper and ink. A light look, easiest to read.' },
];
export const SKIN_IDS = SKINS.map(s => s.id);
export const isSkin = id => SKIN_IDS.includes(id);
// ?skin=vibes is the same theme as ?skin=classic
export const normalizeSkin = id => (id === 'vibes' ? 'classic' : id);

const THEME_COLOR = { classic: '#0b1020', 'control-room': '#12161c', blueprint: '#0b2a4a', 'field-manual': '#ece6d8' };

// Switches the look now (the first paint is handled by the script in index.html). Returns the id actually applied.
export function applySkin(id, doc = document) {
    const skin = isSkin(id) ? id : 'classic';
    const root = doc.documentElement;
    root.dataset.skin = skin;
    let link = doc.getElementById('skin-css');
    if (skin === 'classic') {
        link?.remove();
    } else {
        for (const [elId, href] of [['skin-fonts', 'ui/fonts/fonts.css'], ['skin-base', 'ui/skins/_base.css']]) {
            if (!doc.getElementById(elId)) doc.head.append(Object.assign(doc.createElement('link'), { id: elId, rel: 'stylesheet', href }));
        }
        if (!link) { link = Object.assign(doc.createElement('link'), { id: 'skin-css', rel: 'stylesheet' }); doc.head.append(link); }
        link.href = `ui/skins/${skin}.css`;
    }
    doc.querySelector('meta[name=theme-color]')?.setAttribute('content', THEME_COLOR[skin]);
    return skin;
}
