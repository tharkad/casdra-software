// A picture of what the player sees, taken by the page itself (no library, nothing from a CDN). Used by the note button (notes.js): the DOM and the game state
// say what is on the screen, but layered screens (the map under a combat panel, a sheet over a sheet) cannot be put back together from markup; a picture can.
//
// How: the visible page is cloned (the clone is made at once, synchronously, so the picture is of the moment the button was tapped and not of the sheet that opens next),
// the style sheets are collected as text, every image / font / CSS url() is turned into a data: URL (an SVG that is drawn as an image may not fetch anything), and
// the whole thing is put in an SVG <foreignObject>, drawn on a canvas at device scale (capped to MAX_W pixels wide) and written out as a JPEG.
//   - the map is SVG (<image> tiles and chits inside one <svg>) and the combat scene is DOM + <img>: both come through as they are; there is no canvas / WebGL in the app,
//     but a <canvas> that appears is copied as a picture too.
//   - what the clone cannot know is put back by hand: scroll offsets (children are shifted), typed text, safe-area insets (env() is 0 inside an image), :root.
//   - stopped on purpose: CSS animations / transitions (an image has no time; elements show their settled state), :hover / :focus / :active, scrollbars, the keyboard.
// Nothing in here may ever block or break the note: captureScreen() resolves with null on any failure or after TIMEOUT_MS.
const XHTML = 'http://www.w3.org/1999/xhtml', SVG_NS = 'http://www.w3.org/2000/svg';
export const MAX_W = 1000, QUALITY = 0.7, MAX_BYTES = 230_000, THUMB_W = 150, TIMEOUT_MS = 12_000, SETTLE_MS = 150;
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/g;
const ENV_RE = /env\(\s*safe-area-inset-(top|right|bottom|left)\s*(?:,[^)]*)?\)/g;
const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// ---- files as data: URLs (kept, so the second picture is quick) ----
const cache = new Map();
const blobToData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
function dataUrl(url) {
    if (/^data:/.test(url)) return Promise.resolve(url);
    let p = cache.get(url);
    if (!p) {
        if (cache.size > 400) cache.clear();
        p = fetch(url).then(r => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))).then(blobToData).catch(() => null);
        cache.set(url, p);
    }
    return p;
}
/** Warm the cache (fonts and style sheet images) while the app is idle, so the first picture does not wait for them. */
export function preloadShotAssets() {
    try { for (const src of sheetSources()) sheetText(src).then(s => { for (const m of s.text.matchAll(URL_RE)) { const u = m[1] ?? m[2] ?? m[3]; if (u && !/^(data:|#)/.test(u)) dataUrl(new URL(u, s.base).href); } }).catch(() => {}); } catch { /* nothing to warm */ }
}
async function inlineCssUrls(text, base) {
    const found = new Map();
    for (const m of text.matchAll(URL_RE)) { const u = m[1] ?? m[2] ?? m[3]; if (u && !/^(data:|#)/.test(u)) found.set(m[0], new URL(u, base).href); }
    for (const [m, abs] of found) text = text.split(m).join(`url("${(await dataUrl(abs)) ?? BLANK}")`);
    return text;
}

// ---- style sheets as text ----
// The source text is used, not CSSStyleRule.cssText: Chromium writes a shorthand that holds var() (font: 600 12px var(--font-display)) out as empty longhands, which loses it.
// The rules of a sheet that cannot be fetched are the fallback.
const textCache = new Map();
function fetchText(url) {
    let p = textCache.get(url);
    if (!p) { if (textCache.size > 60) textCache.clear(); p = fetch(url).then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))); textCache.set(url, p); p.catch(() => textCache.delete(url)); }
    return p;
}
function rulesText(sheet) { let out = ''; for (const r of sheet.cssRules) out += r.cssText + '\n'; return out; }
const safeRules = sheet => { try { return rulesText(sheet); } catch { return ''; } };
function sheetSources() {
    const out = [];
    for (const s of [...document.styleSheets, ...(document.adoptedStyleSheets ?? [])]) {
        const media = s.media?.mediaText || '';
        out.push({ href: s.href, text: s.href ? null : (s.ownerNode?.localName === 'style' ? s.ownerNode.textContent : safeRules(s)), sheet: s, base: s.href || document.baseURI, media: media && media !== 'all' ? media : '' });
    }
    return out;
}
async function sheetText(src, depth = 0) {
    let text = src.text;
    if (text == null) { try { text = await fetchText(src.href); } catch { text = src.sheet ? safeRules(src.sheet) : ''; } }
    // @import "x.css" / url(x.css): the imported text goes in its place
    const imports = [...text.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^)\s;]+))\s*\)?[^;]*;/g)];
    for (const m of imports) {
        let inner = ''; if (depth < 4) { try { const u = new URL(m[1] ?? m[2] ?? m[3], src.base).href; inner = await sheetText({ href: u, text: null, sheet: null, base: u, media: '' }, depth + 1); } catch { /* left out */ } }
        text = text.replace(m[0], inner);
    }
    return { text: src.media ? `@media ${src.media} {\n${text}\n}` : text, base: src.base };
}
function safeInsets() {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.append(d); const c = getComputedStyle(d), o = { top: c.paddingTop, right: c.paddingRight, bottom: c.paddingBottom, left: c.paddingLeft }; d.remove(); return o;
}

// ---- the clone (synchronous) ----
/** @returns the page as it is now: a detached copy of <body> with state put back, and what must be fetched. */
function snapshot() {
    const w = document.documentElement.clientWidth || innerWidth, h = innerHeight, ins = safeInsets();
    const live = document.body, clone = live.cloneNode(true);
    const L = live.querySelectorAll('*'), C = clone.querySelectorAll('*');
    const fetches = [];                       // [element, attribute, absolute url]
    const drop = [];
    for (let i = 0; i < L.length && i < C.length; i++) {
        const a = L[i], b = C[i], tag = a.localName;
        if (tag === 'script' || tag === 'noscript' || tag === 'link' || tag === 'iframe' || tag === 'video' || tag === 'audio' || tag === 'object' || tag === 'embed') { drop.push(b); continue; }
        if (a.classList?.contains('nt-toast')) { drop.push(b); continue; }          // the "Saved and sent" of the note before is not part of the screen
        for (const at of [...b.attributes]) if (/^on/i.test(at.name)) b.removeAttribute(at.name);
        if (tag === 'canvas') {
            try {
                const r = a.getBoundingClientRect(), img = document.createElement('img');
                img.setAttribute('src', a.toDataURL('image/png')); img.setAttribute('style', (b.getAttribute('style') ?? '') + `;width:${r.width}px;height:${r.height}px;display:block`); if (b.className) img.className = b.className;
                b.replaceWith(img); continue;
            } catch { drop.push(b); continue; }
        }
        if (tag === 'textarea') b.textContent = a.value;
        else if (tag === 'input') { b.setAttribute('value', a.value); if (a.checked) b.setAttribute('checked', ''); else b.removeAttribute('checked'); }
        else if (tag === 'select') for (let k = 0; k < a.options.length; k++) { if (a.options[k].selected) b.options[k].setAttribute('selected', ''); else b.options[k].removeAttribute('selected'); }
        else if (tag === 'img') { const u = a.currentSrc || a.src; b.removeAttribute('srcset'); b.removeAttribute('loading'); if (u) { b.setAttribute('src', u); fetches.push([b, 'src', u]); } }
        else if (tag === 'image' && a.namespaceURI === SVG_NS) {
            const u = a.href?.baseVal; if (u) { const abs = new URL(u, document.baseURI).href; b.removeAttribute('xlink:href'); b.setAttribute('href', abs); fetches.push([b, 'href', abs]); }
        }
        const st = b.getAttribute?.('style');
        if (st && (ENV_RE.test(st) || URL_RE.test(st))) { ENV_RE.lastIndex = 0; URL_RE.lastIndex = 0; fetches.push([b, 'style', null]); }
        // scrolled content: an image has no scroll position, so the children are shifted by hand
        if ((a.scrollTop || a.scrollLeft) && a.nodeType === 1) {
            const cs = getComputedStyle(a);
            if (/(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY)) {
                b.style.overflow = 'hidden';
                for (let k = 0; k < a.children.length; k++) {
                    const ca = a.children[k], pos = getComputedStyle(ca).position;
                    if (pos === 'fixed' || pos === 'sticky') continue;
                    b.children[k].style.translate = `${-a.scrollLeft}px ${-a.scrollTop}px`;
                }
            }
        }
    }
    for (const d of drop) d.remove();
    const rootScroll = document.scrollingElement; if (rootScroll && (rootScroll.scrollTop || rootScroll.scrollLeft)) for (const c of clone.children) c.style.translate = `${-rootScroll.scrollLeft}px ${-rootScroll.scrollTop}px`;
    const attrs = el => [...el.attributes].filter(x => !/^on/i.test(x.name) && x.name !== 'xmlns' && x.name !== 'style').map(x => ` ${x.name}="${esc(x.value.replace(ENV_RE, (_, k) => ins[k]))}"`).join('');
    const bg = getComputedStyle(live).backgroundColor, bgRoot = getComputedStyle(document.documentElement).backgroundColor;
    return { w, h, ins, clone, fetches, htmlAttrs: attrs(document.documentElement), sheets: sheetSources(), bg: [bg, bgRoot].find(c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') ?? '#0f1117' };
}

// ---- the picture (asynchronous) ----
async function toSvg(s) {
    const css = (await Promise.all(s.sheets.map(async x => { const t = await sheetText(x); return inlineCssUrls(t.text, t.base); }))).join('\n').replace(ENV_RE, (_, k) => s.ins[k]).replace(/:root\b/g, '[data-shot-root]');
    for (const [el, attr, url] of s.fetches) {
        if (attr === 'style') { el.setAttribute('style', await inlineCssUrls(el.getAttribute('style').replace(ENV_RE, (_, k) => s.ins[k]), document.baseURI)); continue; }
        el.setAttribute(attr, (await dataUrl(url)) ?? BLANK);
    }
    const body = new XMLSerializer().serializeToString(s.clone);
    const page = `<html xmlns="${XHTML}" data-shot-root=""${s.htmlAttrs} style="${esc(document.documentElement.getAttribute('style') ?? '')};width:${s.w}px;height:${s.h}px;overflow:hidden;background:${esc(s.bg)}">`
        + `<head><style><![CDATA[*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}\n${css.replace(/]]>/g, ']]]]><![CDATA[>')}]]></style></head>${body}</html>`;
    return page.replace(ILLEGAL_XML, '');
}
// (the SVG is w x h CSS pixels, not scaled up: media queries inside it see the size of the SVG, and @media (max-height: ...) must see the phone's; drawImage scales it afterwards)
const svgDoc = (page, w, h) => `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="${w}" height="${h}">${page}</foreignObject></svg>`;
const loadImage = (src, ms) => new Promise((res, rej) => {
    const img = new Image(), t = setTimeout(() => rej(new Error('image timeout')), ms);
    img.onload = () => { clearTimeout(t); res(img); }; img.onerror = () => { clearTimeout(t); rej(new Error('image error')); }; img.src = src;
});
async function rasterize(svg, w, h, k, bg) {
    // a blob: URL first (no size limit); some engines refuse to hand back a canvas drawn from it, so a data: URL is the second try
    const tries = [() => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), () => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)];
    let lastErr;
    for (const make of tries) {
        const src = make();
        try {
            const img = await loadImage(src, 9000); try { await img.decode(); } catch { /* drawn anyway */ }
            const canvas = document.createElement('canvas'); canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
            const g = canvas.getContext('2d'), paint = () => { g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height); g.drawImage(img, 0, 0, canvas.width, canvas.height); };
            paint(); await new Promise(r => setTimeout(r, SETTLE_MS)); paint();          // fonts and pictures inside an SVG image arrive a moment after it loads (Safari draws them blank the first time)
            canvas.toDataURL('image/jpeg', 0.1);                               // throws SecurityError if the canvas is tainted
            return canvas;
        } catch (e) { lastErr = e; } finally { if (src.startsWith('blob:')) URL.revokeObjectURL(src); }
    }
    throw lastErr;
}
function encode(canvas) {
    // JPEG (Safari cannot write WebP and silently writes PNG instead); smaller until it is light enough for a report
    let q = QUALITY, c = canvas, url = c.toDataURL('image/jpeg', q);
    for (let i = 0; i < 4 && url.length * 0.75 > MAX_BYTES; i++) {
        if (i === 1) { const s = document.createElement('canvas'); s.width = Math.round(canvas.width * 0.8); s.height = Math.round(canvas.height * 0.8); s.getContext('2d').drawImage(canvas, 0, 0, s.width, s.height); c = s; }
        q = Math.max(0.45, q - 0.1); url = c.toDataURL('image/jpeg', q);
    }
    return { url, width: c.width, height: c.height, quality: q };
}
function thumb(canvas) {
    const t = document.createElement('canvas'); t.width = THUMB_W; t.height = Math.round(canvas.height * THUMB_W / canvas.width);
    t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', 0.6);
}

/** Take the picture now. Returns a promise of { shot, thumb, width, height, bytes, ms } (shot: a data: URL of a JPEG) or null: it never rejects and never takes longer than TIMEOUT_MS. */
export function captureScreen() {
    const t0 = performance.now();
    let snap; try { snap = snapshot(); } catch (e) { captureScreen.lastError = String(e?.stack ?? e); return Promise.resolve(null); }
    const work = (async () => {
        const k = Math.min(devicePixelRatio || 1, MAX_W / snap.w);
        const svg = svgDoc(await toSvg(snap), snap.w, snap.h);
        const canvas = await rasterize(svg, snap.w, snap.h, k, snap.bg), out = encode(canvas);
        return { shot: out.url, thumb: thumb(canvas), width: out.width, height: out.height, quality: out.quality, bytes: Math.round(out.url.length * 0.75), svgBytes: svg.length, ms: Math.round(performance.now() - t0) };
    })().catch(e => { captureScreen.lastError = String(e?.stack ?? e); return null; });
    return Promise.race([work, new Promise(res => setTimeout(() => res(null), TIMEOUT_MS))]);
}
