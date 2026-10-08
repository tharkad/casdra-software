import { createGesture, CONFIG } from './gesture.js';
import { wellsFor, nearestWell } from './wells.js';
import { tokenSources, tokenTargets } from './tokens.js';

// Dragging cards and Bid Tokens (design: docs/superpowers/specs/2026-10-08-noble-fraction-drag-design.md).
// A card lifts into a fixed layer above the app, a tray of "action wells" (one per legal action, worded like the zoom sheet) fades in, and
// dropping on a well dispatches exactly that legal action. A Bid Token drags onto the cards that may legally receive it.
// Nothing here decides legality: wells and targets come from `ctx.idx` / `ctx.legal`, which come from the engine.
const SCALE = 1.1;
const SNAP_SCALE = 0.55;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = p => 1 - (1 - p) ** 3;
export const haptic = ms => { try { navigator.vibrate?.(ms); } catch { /* not supported (iPad Safari) */ } };

export function createDrag({ ctx, fx, enabled = () => true, tip = null }) {
    let session = null;
    let suppressUntil = 0;                                       // the click the browser fires right after a drag's pointerup must not open the zoom sheet
    let layer = null;
    const getLayer = () => { if (!layer) { layer = Object.assign(document.createElement('div'), { id: 'drag' }); document.body.append(layer); } return layer; };
    const animates = () => fx.enabled();
    // ?dragdebug=1 shows what the recogniser is doing, for tuning the thresholds on a real device
    const debug = new URLSearchParams(location.search).has('dragdebug') ? Object.assign(document.createElement('div'), { id: 'drag-debug' }) : null;
    if (debug) document.body.append(debug);
    const note = text => { if (debug) debug.textContent = `${text}\nhold ${CONFIG.holdMs}ms/${CONFIG.holdSlop}px  touch ${CONFIG.touchStart}px  bias ${CONFIG.verticalBias}  mouse ${CONFIG.mouseStart}px  lift ${CONFIG.fingerLift}px`; };

    const blocked = () => !enabled() || ctx.busy || ctx.rivalTurn || !ctx.s || ctx.ui.screen === 'start' || ctx.s.turn.phase === 'over'
        || Boolean(document.querySelector('#overlay .sheet'));

    // ---- finding what was pressed ----
    function sourceOf(e) {
        const chip = e.target.closest?.('#hand .tokcount .tok-0');
        if (chip && tokenSources(ctx).chip) return { kind: 'chip', el: chip };
        const card = e.target.closest?.('#app .card[data-uid]');
        if (card) {
            const uid = Number(card.dataset.uid);
            // the pips sit on the card art with pointer-events off, so a press "on a token" is found by geometry (a little slop for fingers)
            if (tokenSources(ctx).pips.has(uid)) {
                for (const pip of card.querySelectorAll('.tok-0')) {
                    const r = pip.getBoundingClientRect();
                    if (e.clientX >= r.left - 10 && e.clientX <= r.right + 10 && e.clientY >= r.top - 10 && e.clientY <= r.bottom + 10) return { kind: 'pip', uid, el: pip };
                }
            }
            return { kind: 'card', uid, el: card };
        }
        return null;
    }

    function onDown(e) {
        if (session) { cancel('second-pointer', true); return; }
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (blocked()) return;
        const src = sourceOf(e);
        if (!src) return;
        const canDrag = src.kind !== 'card' || ctx.idx.byUid.has(src.uid);
        session = { id: e.pointerId, type: e.pointerType || 'mouse', src, g: createGesture({ pointerType: e.pointerType || 'mouse', canDrag }), lifted: false, ending: false,
            last: { x: e.clientX, y: e.clientY, vx: 0 }, liftedAt: 0, raf: 0, active: null, wells: [], targets: null };
        session.g.down({ x: e.clientX, y: e.clientY, t: performance.now() });
        try { src.el.setPointerCapture?.(e.pointerId); } catch { /* element may not accept capture */ }
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onCancel, true);
        window.addEventListener('keydown', onKey, true);
        if (session.type !== 'mouse') session.hold = setTimeout(() => session && dispatch(session.g.tick(performance.now())), CONFIG.holdMs + 8);
    }
    const mine = e => session && !session.ending && e.pointerId === session.id;
    function onMove(e) {
        if (!session || session.ending) return;
        if (e.pointerId !== session.id) return;
        const events = session.g.move({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (session.lifted) e.preventDefault();
        dispatch(events);
    }
    function onUp(e) {
        if (!mine(e)) return;
        if (session.lifted) suppressUntil = performance.now() + 120;
        dispatch(session.g.up({ x: e.clientX, y: e.clientY, t: performance.now() }));
        if (session && !session.lifted && !session.ending) detach();
    }
    function onCancel(e) { if (session && e.pointerId === session.id) cancel('pointercancel', true); }
    function onKey(e) { if (e.key === 'Escape' && session?.lifted) { e.preventDefault(); cancel('escape'); } }

    function dispatch(events) {
        for (const ev of events) {
            if (!session) return;
            note(`${session.type} ${session.src.kind} ${ev.type}${ev.via ? ` (${ev.via})` : ''}`);
            if (ev.type === 'lift') lift(ev);
            else if (ev.type === 'move') move(ev);
            else if (ev.type === 'drop') drop(ev);
            else if (ev.type === 'cancel') glideHome();
            else if (ev.type === 'tug') tug(ev.dy);
            else if (ev.type === 'tugEnd') tugEnd();
            else if (ev.type === 'scroll') detach();
            else if (ev.type === 'tap') {                              // a first tap on a card you can act on teaches the gesture, once per device
                if (tip?.should() && session.type === 'touch' && session.src.kind === 'card' && ctx.idx.byUid.has(session.src.uid)) { fx.toast('Tip: press and drag a card onto an action', 0); tip.mark(); }
                detach();
            }
        }
    }

    // ---- lifting ----
    function lift(ev) {
        const s = session; const { src } = s;
        s.lifted = true; s.liftedAt = performance.now(); suppressUntil = Infinity;
        clearTimeout(s.hold);
        s.rect = src.el.getBoundingClientRect();
        const ghost = src.el.cloneNode(true);
        ghost.classList.add('drag-ghost'); ghost.removeAttribute('data-zoom'); ghost.removeAttribute('data-uid'); ghost.removeAttribute('id'); ghost.tabIndex = -1;
        ghost.setAttribute('aria-hidden', 'true');
        if (src.kind === 'card') { ghost.style.width = `${s.rect.width}px`; ghost.style.height = `${s.rect.height}px`; src.el.classList.add('drag-origin'); }
        else { ghost.classList.add('tok-ghost'); const d = Math.max(34, s.rect.width * 1.5); ghost.style.width = `${d}px`; ghost.style.height = `${d}px`; src.el.classList.add('drag-origin'); }
        s.w = parseFloat(ghost.style.width); s.h = parseFloat(ghost.style.height);
        s.ghost = ghost; getLayer().append(ghost);
        if (src.kind === 'card') buildTray(); else markTargets();
        document.body.classList.add('dragging');
        haptic(8);
        s.last = { x: ev.x, y: ev.y, vx: 0 };
        schedule();
    }
    function buildTray() {
        const s = session;
        const wells = wellsFor(ctx, s.src.uid);
        const tray = document.createElement('div');
        tray.id = 'drag-tray';
        for (const w of wells) {
            const el = document.createElement('div');
            el.className = `drag-well${w.more ? ' more' : ''}`; el.dataset.well = w.key; el.textContent = w.label;
            tray.append(el); w.el = el;
        }
        document.body.append(tray);
        s.tray = tray; s.wells = wells.map(w => ({ ...w, rect: w.el.getBoundingClientRect() }));
    }
    function markTargets() {
        const s = session;
        s.targets = tokenTargets(ctx, s.src.kind === 'chip' ? { kind: 'chip' } : { kind: 'pip', uid: s.src.uid });
        document.body.classList.add('token-drag');
        document.querySelectorAll('#main .card[data-uid]').forEach(el => el.classList.add(s.targets.has(Number(el.dataset.uid)) ? 'drop-ok' : 'drop-dim'));
    }

    // ---- moving ----
    function move(ev) { session.last = { x: ev.x, y: ev.y, vx: ev.vx }; schedule(); }
    function schedule() { if (!session.raf) session.raf = requestAnimationFrame(frame); }
    const liftOffset = s => (s.type === 'touch' ? (s.src.kind === 'card' ? CONFIG.fingerLift : 44) : 0);
    // The card follows the finger exactly. Over a well it settles above that well, shrunk, so the well's label stays readable (b blends 0..1).
    function frame(now) {
        const s = session; if (!s || !s.ghost) return;
        s.raf = 0;
        const { x, y, vx } = s.last;
        const fx0 = x; const fy0 = y - liftOffset(s);
        const p = animates() ? clamp((now - s.liftedAt) / 120, 0, 1) : 1;
        updateActive(fx0, fy0);
        const well = s.src.kind === 'card' && s.active ? s.wells.find(w => w.key === s.active) : null;
        const goal = well ? 1 : 0;
        s.b = animates() ? (s.b ?? 0) + (goal - (s.b ?? 0)) * 0.35 : goal;
        if (Math.abs(goal - s.b) < 0.01) s.b = goal;
        const b = s.b;
        const scale = (1 + (SCALE - 1) * easeOut(p)) * (1 - b) + SNAP_SCALE * b;
        let cx = fx0; let cy = fy0;
        if (well) { const r = well.rect; cx = fx0 * (1 - b) + (r.left + r.width / 2) * b; cy = fy0 * (1 - b) + (r.top - (s.h * SNAP_SCALE) / 2 - 8) * b; }
        else if (b > 0) { const r = (s.lastWell ?? s.wells[0]).rect; cx = fx0 * (1 - b) + (r.left + r.width / 2) * b; cy = fy0 * (1 - b) + (r.top - (s.h * SNAP_SCALE) / 2 - 8) * b; }
        if (well) s.lastWell = well;
        const tilt = animates() && s.src.kind === 'card' ? clamp(vx * 12, -8, 8) * (1 - b) : 0;
        s.cx = cx; s.cy = cy; s.scale = scale; s.tilt = tilt;
        s.ghost.style.transform = `translate3d(${cx - s.w / 2}px, ${cy - s.h / 2}px, 0) scale(${scale}) rotate(${tilt}deg)`;
        if (p < 1 || b !== goal) schedule();
    }
    function updateActive(cx, cy) {
        const s = session; let next = null;
        if (s.src.kind === 'card') next = nearestWell(s.wells.map(w => ({ key: w.key, ...w.rect.toJSON() })), cx, cy);
        else {
            const under = document.elementsFromPoint(cx, cy).find(el => el.matches?.('#main .card[data-uid]'));
            const uid = under ? Number(under.dataset.uid) : null;
            next = uid !== null && s.targets.has(uid) ? uid : null;
        }
        if (next === s.active) return;
        s.active = next; haptic(4);
        if (s.src.kind === 'card') s.wells.forEach(w => w.el.classList.toggle('active', w.key === next));
        else document.querySelectorAll('#main .card.drop-hot').forEach(el => el.classList.remove('drop-hot')), next !== null && document.querySelector(`#main .card[data-uid='${next}']`)?.classList.add('drop-hot');
    }

    // ---- dropping ----
    const glide = (el, frames, ms) => new Promise(resolve => {
        if (!animates() || !el.animate) { resolve(); return; }
        const a = el.animate(frames, { duration: ms, easing: 'cubic-bezier(.2,.9,.3,1.15)', fill: 'forwards' });
        a.onfinish = resolve; a.oncancel = resolve;
    });
    const currentTransform = s => s.ghost.style.transform;
    const homeTransform = s => `translate3d(${s.rect.left + s.rect.width / 2 - s.w / 2}px, ${s.rect.top + s.rect.height / 2 - s.h / 2}px, 0) scale(1) rotate(0deg)`;

    async function drop() {
        const s = session; s.ending = true;
        cancelAnimationFrame(s.raf); detachListeners();
        if (s.src.kind === 'card') {
            const well = s.active ? s.wells.find(w => w.key === s.active) : null;
            if (!well) { await goHome(s); return finish(); }
            if (well.more) { await goHome(s); finish(); ctx.setUi({ zoom: s.src.uid }); return; }
            const r = well.rect; const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
            await glide(s.ghost, [{ transform: currentTransform(s), opacity: 1 }, { transform: `translate3d(${cx - s.w / 2}px, ${cy - s.h / 2}px, 0) scale(.4) rotate(0deg)`, opacity: .0 }], 150);
            const at = s.ghost.getBoundingClientRect();
            finish(); fx.noteDragRect?.(s.src.uid, at); ctx.act(well.action);
        } else {
            const action = s.active !== null ? s.targets.get(s.active) : null;
            if (!action) { await goHome(s); return finish(); }
            const card = document.querySelector(`#main .card[data-uid='${s.active}']`);
            const r = card.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height * 0.3;
            await glide(s.ghost, [{ transform: currentTransform(s), opacity: 1 }, { transform: `translate3d(${cx - s.w / 2}px, ${cy - s.h / 2}px, 0) scale(.7) rotate(0deg)`, opacity: .9 }], 140);
            finish(); ctx.act(action);
        }
    }
    async function goHome(s) {
        await glide(s.ghost, [{ transform: currentTransform(s) }, { transform: homeTransform(s) }], 220);
    }
    async function glideHome() {
        const s = session; if (!s || s.ending) return;
        s.ending = true; suppressUntil = Math.min(suppressUntil, performance.now() + 120);
        cancelAnimationFrame(s.raf); detachListeners();
        if (s.ghost) await goHome(s);
        finish();
    }
    function cancel(reason, immediate = false) {
        const s = session; if (!s) return;
        if (!s.lifted) { detach(); return; }
        if (immediate || !animates()) { s.ending = true; suppressUntil = performance.now() + 120; cancelAnimationFrame(s.raf); detachListeners(); finish(); return; }
        s.g.cancel(reason); glideHome();
    }

    // ---- rubber band for cards with nothing to do ----
    function tug(dy) { const el = session.src.el; el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`; session.tugged = true; }
    function tugEnd() {
        const el = session.src.el; el.style.transition = animates() ? 'transform .22s cubic-bezier(.2,.9,.3,1.4)' : 'none'; el.style.transform = '';
        const done = () => { el.style.transition = ''; };
        setTimeout(done, 260); detach();
    }

    // ---- teardown ----
    function detachListeners() {
        window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onCancel, true); window.removeEventListener('keydown', onKey, true);
        if (session) clearTimeout(session.hold);
    }
    function detach() { detachListeners(); session = null; }
    function finish() {
        const s = session; if (!s) return;
        cancelAnimationFrame(s.raf); detachListeners();
        s.ghost?.remove(); s.tray?.remove();
        s.src.el.classList?.remove('drag-origin');
        document.querySelectorAll('.drop-ok, .drop-dim, .drop-hot, .drag-origin').forEach(el => el.classList.remove('drop-ok', 'drop-dim', 'drop-hot', 'drag-origin'));
        document.body.classList.remove('dragging', 'token-drag');
        if (suppressUntil === Infinity) suppressUntil = performance.now() + 120;       // (a drag that ended without a pointerup, e.g. Escape)
        session = null;
    }

    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', e => {
        if (performance.now() < suppressUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    // Once a card is lifted the finger belongs to the drag: stop the browser from turning a sideways move into a strip scroll
    // (touch-action is fixed at touch start, so after a long-press lift only preventDefault on touchmove can claim the gesture).
    window.addEventListener('touchmove', e => { if (session?.lifted && e.cancelable) e.preventDefault(); }, { passive: false, capture: true });
    window.addEventListener('resize', () => { if (session?.lifted) cancel('resize', true); });
    window.addEventListener('orientationchange', () => { if (session?.lifted) cancel('rotate', true); });

    return {
        active: () => Boolean(session?.lifted),
        cancel,
        // called after every render: a lifted card whose element no longer exists (the game moved on) ends the drag at once
        afterRender() {
            if (!session?.lifted || session.ending) return;
            const { src } = session;
            const gone = src.kind === 'chip' ? !document.querySelector('#hand .tokcount .tok-0') : !document.querySelector(`#app [data-uid='${src.uid}']`);
            if (gone) cancel('rendered', true);
        },
    };
}
