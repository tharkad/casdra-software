// Pure pointer-gesture recogniser for card dragging: no DOM, so it is tested in Node. See the design doc, "Gesture grammar":
//   tap = press and release;  touch/pen = 10px mostly-vertical movement lifts, mostly-horizontal movement yields to the strip's scrolling,
//   a 220ms hold without moving lifts in place;  mouse = 4px any direction;  a card with no legal action only rubber-bands.
export const CONFIG = { holdMs: 220, holdSlop: 6, touchStart: 10, verticalBias: 1.2, mouseStart: 4, rubberMax: 8, fingerLift: 56 };

export function createGesture({ pointerType = 'touch', canDrag = true, config = CONFIG } = {}) {
    const mouse = pointerType === 'mouse';
    let state = 'idle'; let start = null; let last = null; let holdDead = false; let vx = 0;
    const clampTug = dy => Math.sign(dy) * Math.min(config.rubberMax, Math.abs(dy) * 0.25);
    const end = () => { state = 'idle'; start = null; };
    const lift = (p, via) => { state = 'dragging'; last = p; return [{ type: 'lift', via, x: p.x, y: p.y }]; };
    const tug = dy => { state = 'tugging'; return [{ type: 'tug', dy: clampTug(dy) }]; };

    return {
        state: () => state,
        down(p) { state = 'pressing'; start = p; last = p; holdDead = false; vx = 0; return []; },
        move(p) {
            if (state === 'pressing') {
                const dx = p.x - start.x; const dy = p.y - start.y; const d = Math.hypot(dx, dy);
                last = p;
                if (d > config.holdSlop) holdDead = true;
                if (mouse) return d >= config.mouseStart ? (canDrag ? lift(p, 'move') : tug(dy)) : [];
                if (d < config.touchStart) return [];
                if (Math.abs(dy) > config.verticalBias * Math.abs(dx)) return canDrag ? lift(p, 'move') : tug(dy);
                state = 'scrolling'; return [{ type: 'scroll' }];                   // a horizontal swipe belongs to the strip
            }
            if (state === 'dragging') {
                const dt = Math.max(1, p.t - last.t); vx = 0.7 * vx + 0.3 * ((p.x - last.x) / dt); last = p;
                return [{ type: 'move', x: p.x, y: p.y, vx }];
            }
            if (state === 'tugging') return [{ type: 'tug', dy: clampTug(p.y - start.y) }];
            return [];
        },
        tick(t) {
            if (state !== 'pressing' || holdDead || mouse || !canDrag) return [];
            return t - start.t >= config.holdMs && Math.hypot(last.x - start.x, last.y - start.y) <= config.holdSlop ? lift(last, 'hold') : [];
        },
        up(p) {
            const was = state; end();
            if (was === 'pressing') return [{ type: 'tap' }];
            if (was === 'dragging') return [{ type: 'drop', x: p.x, y: p.y }];
            if (was === 'tugging') return [{ type: 'tugEnd' }];
            return [];
        },
        cancel(reason) { const was = state; end(); return was === 'idle' || was === 'scrolling' ? [] : [{ type: 'cancel', reason }]; },
    };
}
