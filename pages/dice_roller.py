"""Dice Vault — dice rolling app for board games and RPGs.

Dark gaming theme with visual dice shapes and a prominent cup tray.
Free mode: tap-based single group, no formula bar, 5 preset limit.
Premium mode: formula bar, multi-group, unlimited presets, game packs.
"""

# Premium mode flag — set via URL param ?premium=1 for dev, or IAP in production
PREMIUM_MODE_DEFAULT = False

DICE_BUTTONS = [
    ("COIN", "&#9679;", "#d4a030"),     # circle — first
    ("d4", "&#9650;", "#3dd68c"),       # triangle
    ("d6", "&#9632;", "#58a6ff"),       # square
    ("d8", "&#9670;", "#bc8cff"),       # diamond
    ("d10", "&#11039;", "#ff9640"),     # pentagon
    ("d12", "&#11042;", "#ff6b8a"),     # hexagon
    ("d20", "&#9651;", "#e8c840"),      # triangle outline
    ("d100", "%", "#40d4e8"),           # percent
    ("DX", '<svg width="20" height="20" viewBox="0 0 20 20"><polygon points="10,1 17.7,4.5 19.1,12.6 14.3,18.9 5.7,18.9 0.9,12.6 2.3,4.5" fill="currentColor"/></svg>', "#b0b8c0"),  # heptagon
]


def build_dice_page(premium=False, restore_state=None):
    buttons_html = ""
    for die_id, shape, color in DICE_BUTTONS:
        key = die_id.lower()
        buttons_html += f"""<button class="dr-die-btn" data-die="{key}" onclick="addToCup('{key}')">
            <span class="dr-die-shape" style="color:{color}">{shape}</span>
            <span class="dr-die-label">{die_id}</span>
        </button>\n"""

    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0d1117">
<title>Dice Vault</title>
<style>
:root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d; --border2: #21262d;
    --text: #c9d1d9; --text-bright: #e6edf3; --text-dim: #484f58; --text-muted: #8b949e;
    --accent: #58a6ff; --accent2: #f0883e;
    --cup-border: #58a6ff; --btn-bg: #161b22; --felt-color: #1a5a2a;
}
[data-theme="light"] {
    --bg: #faf7f2; --surface: #ffffff; --border: #d4c5a9; --border2: #e8dcc8;
    --text: #3d2b1f; --text-bright: #1c1208; --text-dim: #a09080; --text-muted: #7a6a58;
    --accent: #b8860b; --accent2: #8b0000;
    --cup-border: #b8860b; --btn-bg: #f5f0e8; --felt-color: #6b2d2d;
}
[data-theme="midnight"] {
    --bg: #0a0e1a; --surface: #111827; --border: #1e2a4a; --border2: #162040;
    --text: #a5b4cf; --text-bright: #d1ddf0; --text-dim: #4a5578; --text-muted: #6b7da0;
    --accent: #6366f1; --accent2: #f59e0b;
    --cup-border: #6366f1; --btn-bg: #111827; --felt-color: #1a2850;
}
[data-theme="purple"] {
    --bg: #13051e; --surface: #1e0a30; --border: #3b1d5e; --border2: #2a1345;
    --text: #c4a8e0; --text-bright: #e8d5f5; --text-dim: #5a3d78; --text-muted: #8a6aad;
    --accent: #a855f7; --accent2: #ec4899;
    --cup-border: #a855f7; --btn-bg: #1e0a30; --felt-color: #3a1858;
}
[data-theme="forest"] {
    --bg: #0a1208; --surface: #12201a; --border: #1e3a28; --border2: #162d20;
    --text: #a8c4a0; --text-bright: #d5e8d0; --text-dim: #3d5a38; --text-muted: #6a8a60;
    --accent: #22c55e; --accent2: #eab308;
    --cup-border: #22c55e; --btn-bg: #12201a; --felt-color: #1a4a20;
}
[data-theme="blood"] {
    --bg: #120808; --surface: #1e0e0e; --border: #3a1818; --border2: #2d1212;
    --text: #c4a0a0; --text-bright: #e8d0d0; --text-dim: #5a3838; --text-muted: #8a6060;
    --accent: #ef4444; --accent2: #f59e0b;
    --cup-border: #ef4444; --btn-bg: #1e0e0e; --felt-color: #5a1818;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
button, a, input { outline: none; -webkit-tap-highlight-color: transparent; }
body {
    background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    -webkit-tap-highlight-color: transparent;
    max-width: 500px; margin: 0 auto;
}

/* Header */
.dr-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; background: var(--bg);
    border-bottom: 1px solid #21262d; flex-shrink: 0;
}
.dr-header h1 { font-size: 18px; font-weight: 700; color: var(--text-bright); }
a.dr-back { color: #58a6ff; text-decoration: none; font-size: 16px; font-weight: 600; }
.dr-header-right { display: flex; gap: 6px; align-items: center; }
.dr-header-btn {
    background: var(--btn-bg); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text-muted); padding: 4px 8px; font-size: 16px; cursor: pointer;
    text-decoration: none; min-height: 30px; display: inline-flex; align-items: center; justify-content: center;
}
.dr-header-btn.on { color: #58a6ff; border-color: #58a6ff; }
.dr-header-btn.off { color: var(--text-dim); position: relative; }
.dr-header-btn.off::after {
    content: ''; position: absolute; top: 45%; left: 15%; right: 15%;
    height: 2px; background: #f85149; transform: rotate(45deg);
}

/* Presets */
.dr-presets {
    display: flex; gap: 6px; padding: 8px 16px; overflow-x: auto;
    -webkit-overflow-scrolling: touch; flex-shrink: 0;
}
.dr-preset-chip {
    flex-shrink: 0; background: var(--btn-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 6px 12px; cursor: pointer;
    text-align: center; min-width: 70px; transition: all 0.15s;
}
.dr-preset-chip:hover { border-color: #58a6ff; }
.dr-preset-chip.active { border-color: #ffa657; background: #ffa65715; }
.dr-preset-chip.dimmed { opacity: 0.3; pointer-events: none; }
.dr-preset-name { font-size: 14px; font-weight: 600; color: var(--text-bright); }
.dr-preset-expr { font-size: 12px; color: var(--text-muted); margin-top: 1px; }

/* Active preset label in cup */
.dr-cup-preset-label {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    font-size: 18px; color: #ffa657; font-weight: 700; min-height: 24px;
    position: relative;
}
.dr-cup-preset-label .dr-edit-btn {
    background: none; border: none; color: #ffa657; font-size: 20px;
    cursor: pointer; padding: 2px 6px; display: inline-block; transform: scaleX(-1);
}
.dr-cup-preset-label .dr-edit-btn:hover { color: #ffbd7a; }

/* Edit mode */
.dr-cup.editing { border-color: #f85149; }
.dr-fav-name-edit {
    border: 2px solid #ffa657; border-radius: 8px; padding: 4px 12px;
    cursor: pointer;
}
.dr-fav-name-edit:hover { background: #ffa65722; }
.dr-cup-preset-label .dr-rename-hint {
    font-size: 13px; color: var(--text-dim); font-weight: 400; margin-left: 6px;
}
.dr-undo-float {
    position: absolute; top: 12px; right: 12px;
    background: none; border: 1px solid #f85149; border-radius: 8px;
    color: #f85149; padding: 6px 12px; font-size: 14px; font-weight: 600;
    cursor: pointer; font-family: inherit; z-index: 10;
}
.dr-undo-float:hover { background: #f8514933; }
.dr-done-float {
    position: absolute; top: 12px; left: 12px;
    background: none; border: 1px solid #7ee787; border-radius: 8px;
    color: #7ee787; padding: 6px 12px; font-size: 14px; font-weight: 600;
    cursor: pointer; font-family: inherit; z-index: 10;
}
.dr-done-float:hover { background: #7ee78733; }

/* Inline input modal (replaces OS prompt) */
.dr-modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6); z-index: 200;
    display: flex; align-items: center; justify-content: center;
}
.dr-modal {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 20px; width: 280px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.dr-modal-title { font-size: 15px; font-weight: 600; color: var(--text-bright); margin-bottom: 12px; }
.dr-modal input {
    width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text-bright); padding: 10px 12px; font-size: 16px; font-family: inherit;
    outline: none; margin-bottom: 12px;
}
.dr-modal input:focus { border-color: #58a6ff; }
.dr-modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
.dr-modal-btns button {
    padding: 8px 16px; border-radius: 8px; font-size: 16px; font-weight: 600;
    cursor: pointer; font-family: inherit; border: none;
}
.dr-modal-ok { background: var(--accent); color: #fff; }
.dr-modal-cancel { background: var(--border2); color: var(--text-muted); }

/* Theme picker */
.dr-theme-picker {
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; margin: 0 16px 8px; max-width: 468px;
    margin-left: auto; margin-right: auto;
}
.dr-theme-picker-title { font-size: 14px; font-weight: 700; color: var(--accent);
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
.dr-theme-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.dr-theme-swatch {
    border-radius: 10px; padding: 10px 8px; text-align: center; cursor: pointer;
    border: 2px solid transparent; transition: all 0.15s; position: relative;
}
.dr-theme-swatch.active { border-color: var(--accent); }
.dr-theme-swatch.locked { opacity: 0.4; cursor: default; }
.dr-theme-swatch .swatch-name { font-size: 13px; font-weight: 600; margin-top: 4px; }
.dr-theme-swatch .swatch-lock { position: absolute; top: 4px; right: 6px; font-size: 12px; }
.dr-theme-swatch .swatch-colors { display: flex; gap: 3px; justify-content: center; }
.dr-theme-swatch .swatch-dot { width: 14px; height: 14px; border-radius: 50%; }

/* Multi-group (premium) */
.dr-group-section {
    background: #161b2288; border: 1px solid var(--border); border-radius: 12px;
    padding: 8px; margin: 4px 0; position: relative; cursor: pointer;
    transition: all 0.15s;
}
.dr-group-section.active { border-color: #58a6ff; background: #58a6ff11; }
.dr-group-section .dr-group-label {
    font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px;
    text-align: center; margin-bottom: 4px;
}
.dr-group-section.active .dr-group-label { color: #58a6ff; }
.dr-group-section .dr-group-dice {
    display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; min-height: 36px;
    align-items: center;
}
.dr-group-section .dr-group-empty { color: #30363d; font-size: 14px; }
.dr-group-op {
    text-align: center; padding: 2px 0; font-size: 15px; font-weight: 700;
    color: var(--text-dim); cursor: pointer;
}
.dr-group-op:hover { color: #58a6ff; }
.dr-group-controls {
    display: flex; gap: 6px; justify-content: center; padding: 6px 0;
}
.dr-group-controls button {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text-muted); padding: 6px 12px; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit;
}
.dr-group-controls button:hover { border-color: #58a6ff; color: #58a6ff; }
.dr-group-repeat {
    text-align: center; font-size: 14px; color: #f0883e; font-weight: 600;
    margin-bottom: 2px;
}

/* Star button active — handled in .dr-save-preset.fav-active above */

/* Result */
.dr-result-area { text-align: center; padding: 20px 16px 12px; flex-shrink: 0; position: relative; }
.dr-share-btn {
    position: absolute; top: 16px; right: 16px;
    background: var(--btn-bg); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text-muted); padding: 6px 8px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
}
.dr-share-btn:hover { border-color: #58a6ff; color: #58a6ff; }
.dr-result {
    font-size: 52px; font-weight: 800; color: var(--text-bright);
    font-family: 'SF Mono', ui-monospace, monospace;
    min-height: 64px; transition: color 0.3s;
}
.dr-result.dr-rolling { color: #f0883e; }
.dr-breakdown {
    font-size: 16px; color: var(--text-muted); margin-top: 4px;
    font-family: 'SF Mono', ui-monospace, monospace;
    min-height: 20px;
}
.dr-die-result {
    display: inline-block; background: var(--surface); border: 2px solid var(--border);
    border-radius: 4px; padding: 1px 5px; margin: 0 1px;
    font-weight: 600; color: var(--text-bright); font-size: 15px;
}

/* Dice grid */
.dr-dice-grid {
    display: flex; flex-wrap: wrap; justify-content: center;
    gap: 8px; padding: 8px 16px;
    max-width: 500px; margin: 0 auto; width: 100%; flex-shrink: 0;
}
.dr-die-btn {
    background: var(--btn-bg); border: 1px solid var(--border);
    border-radius: 14px; padding: 12px 6px 8px; width: 72px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    cursor: pointer; transition: all 0.15s; font-family: inherit;
    -webkit-tap-highlight-color: transparent;
}
.dr-die-btn:hover { border-color: #58a6ff; box-shadow: 0 0 8px rgba(88,166,255,0.2); }
.dr-die-btn:active { transform: scale(0.9); background: #1f2937; }
.dr-die-shape { font-size: 26px; line-height: 1; }
.dr-die-label { font-size: 14px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }

/* Modifier rows */
.dr-mod-rows { padding: 4px 16px 8px; flex-shrink: 0; }
.dr-mod-row {
    display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;
}
.dr-mod-row + .dr-mod-row { margin-top: 6px; }
.dr-mod-btn {
    background: var(--btn-bg); color: var(--text-muted); border: 1px solid var(--border);
    border-radius: 10px; padding: 8px 12px; font-size: 14px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    min-height: 40px; display: inline-flex; align-items: center; justify-content: center;
}
.dr-mod-btn:hover { border-color: #58a6ff; color: var(--text-bright); }
.dr-mod-btn:active { transform: scale(0.95); }
.dr-mod-btn.on { border-color: #ffa657; color: #fff; background: #ffa657; }
.dr-mod-btn.dimmed { border-color: var(--border); color: var(--text-dim); pointer-events: none; }

/* === THE CUP === */
.dr-cup {
    background-color: var(--felt-color, #1a5a2a);
    background-image:
        radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.06) 0%, transparent 60%),
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)' opacity='0.08'/%3E%3C/svg%3E");
    border-top: 3px solid var(--cup-border);
    border-radius: 24px 24px 0 0;
    padding: 12px 16px 16px;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    display: flex; flex-direction: column;
    box-shadow: inset 0 2px 12px rgba(88,166,255,0.1), 0 -4px 20px rgba(0,0,0,0.5);
}
.dr-cup > * { position: relative; }
.dr-cup::before {
    content: ''; position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
    width: 40px; height: 4px; border-radius: 2px; background: #30363d;
}
.dr-cup-summary {
    font-size: 15px; color: #e6edf3; font-weight: 600; text-align: center;
    min-height: 18px; margin-top: 8px;
}
.dr-cup-staging {
    display: flex; flex-wrap: wrap; gap: 8px;
    justify-content: center; align-content: center;
    padding: 8px 0; min-height: 50px;
}
.dr-cup-die {
    width: 57px; height: 57px; border-radius: 13px;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; font-weight: 700; cursor: pointer;
    transition: all 0.15s; position: relative;
    animation: dropIn 0.2s ease-out;
}
@keyframes dropIn { from { transform: scale(0.5) translateY(-20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
.dr-cup-die:active { transform: scale(0.85); }
.dr-cup-die .dr-cup-die-label {
    position: absolute; bottom: -3px; right: -3px;
    font-size: 13px; font-weight: 800; background: var(--bg);
    padding: 0 4px; border-radius: 4px; color: var(--text-muted);
}
.dr-cup-die-count {
    position: absolute; top: -8px; right: -8px;
    font-size: 14px; font-weight: 800; color: var(--text-bright);
    background: var(--accent); border-radius: 10px; padding: 0 5px;
    line-height: 20px; min-width: 20px; text-align: center;
}
.dr-cup-die-explode {
    position: absolute; top: -8px; left: -8px;
    font-size: 20px; line-height: 1;
}
.dr-cup-die-badge {
    position: absolute; bottom: -5px; left: -5px;
    font-size: 9px; font-weight: 800; line-height: 1;
    background: var(--bg); border-radius: 4px; padding: 1px 3px;
    color: #d2a8ff; white-space: nowrap;
}
.dr-cup-empty { color: rgba(255,255,255,0.5); font-size: 18px; font-weight: 600; padding: 20px 0;
    text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
.dr-cup-mod {
    display: flex; align-items: center; justify-content: center;
    width: 57px; height: 57px; border-radius: 13px;
    font-size: 20px; font-weight: 800; cursor: pointer;
    animation: dropIn 0.2s ease-out;
}
.dr-cup-tags {
    display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;
    min-height: 0; padding-top: 4px;
}
.dr-cup-tags:empty { display: none; }
.dr-cup-tag {
    font-size: 11px; font-weight: 800; color: #ffa657;
    background: #ffa65718; border: 1px solid #ffa65744;
    border-radius: 6px; padding: 2px 8px; letter-spacing: 0.5px;
}
.dr-cup-bottom {
    display: flex; gap: 6px; align-items: stretch; justify-content: center;
    padding-top: 8px; flex-shrink: 0; flex-wrap: wrap;
}
.dr-cup-btn {
    border-radius: 10px; font-family: inherit; cursor: pointer;
    padding: 8px 12px; font-size: 13px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    text-align: center; line-height: 1.2; transition: all 0.15s;
    min-height: 42px;
}
.dr-roll-btn {
    background: #58a6ff; color: #fff; border: none;
    padding: 8px 32px; font-size: 18px; font-weight: 800;
    letter-spacing: 3px; flex-grow: 1; max-width: 200px;
}
.dr-roll-btn:hover { box-shadow: 0 0 20px rgba(88,166,255,0.5); }
.dr-roll-btn:active { transform: scale(0.96); }
.dr-roll-btn.dimmed { background: var(--border); color: var(--text-dim); pointer-events: none; }
.dr-save-preset {
    background: #0a0a0a; border: 2px solid var(--text-muted); color: #ffa657; font-size: 16px;
}
@media (hover: hover) { .dr-save-preset:hover { border-color: #ffa657; color: #ffbd7a; } }
.dr-save-preset.fav-active { border-color: #ffa657; color: #fff; background: #ffa657; }
.dr-save-preset.dimmed { border-color: var(--border); color: var(--border); pointer-events: none; }
.dr-clear-cup {
    background: #0a0a0a; border: 1px solid var(--border); color: var(--text-dim); font-size: 16px;
}
.dr-clear-cup:hover { border-color: #f85149; color: #f85149; }

/* Die options panel */
.dr-die-options {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--surface); border-top: 2px solid #58a6ff;
    border-radius: 16px 16px 0 0; padding: 16px;
    z-index: 200; max-height: 60vh; overflow-y: auto;
    box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
    animation: slideUp 0.2s ease-out;
}
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.dr-die-options-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #21262d;
}
.dr-die-options-title { font-size: 16px; font-weight: 700; color: var(--text-bright); }
.dr-die-options-close {
    background: none; border: none; color: var(--text-dim); font-size: 20px;
    cursor: pointer; padding: 4px 8px;
}
.dr-opt-section { margin-bottom: 12px; }
.dr-opt-label { font-size: 13px; font-weight: 600; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.dr-opt-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.dr-opt-toggle {
    padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg); color: var(--text-muted); font-size: 15px; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.dr-opt-toggle.on { border-color: #58a6ff; color: #58a6ff; background: #58a6ff22; }
.dr-opt-toggle.danger { border-color: #f85149; color: #f85149; }
.dr-opt-input {
    width: 50px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    color: var(--text-bright); padding: 6px 8px; font-size: 15px; text-align: center;
    font-family: inherit; outline: none;
}
.dr-opt-input:focus { border-color: #58a6ff; }
.dr-opt-colors { display: flex; gap: 6px; }
.dr-opt-color {
    width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent;
    cursor: pointer;
}
.dr-opt-color.selected { border-color: #fff; }
.dr-die-options button.dr-opt-action {
    display: block; width: 100%; padding: 8px 14px; background: none; border: none;
    color: #c9d1d9; font-size: 15px; text-align: left; cursor: pointer;
    font-family: inherit;
}
.dr-die-options button:hover { background: #30363d; }
.dr-die-options button.danger { color: #f85149; }

/* History page */
.dr-history-page { padding: 16px; max-width: 500px; margin: 0 auto; }
.dr-history-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
}
.dr-history-title { font-size: 18px; font-weight: 700; color: var(--text-bright); }
.dr-history-clear { background: none; border: 1px solid var(--border); border-radius: 8px;
    color: var(--text-dim); padding: 6px 12px; font-size: 14px; cursor: pointer; font-family: inherit; }
.dr-history-clear:hover { color: #f85149; border-color: #f85149; }
.dr-history-list { }
.dr-history-entry {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px; border-radius: 10px; margin-bottom: 6px;
    background: var(--surface); border: 1px solid #21262d;
}
.dr-history-total { font-weight: 700; color: var(--text-bright); font-size: 18px;
    font-family: 'SF Mono', ui-monospace, monospace; min-width: 45px; }
.dr-history-expr { color: var(--text-muted); font-size: 15px; flex: 1; text-align: center; }
.dr-history-time { color: var(--text-dim); font-size: 13px; min-width: 60px; text-align: right; }
.dr-history-empty { text-align: center; color: #30363d; padding: 40px; font-size: 15px; }

/* Probability display */
.dr-prob { font-size: 14px; color: var(--text-muted); margin-top: 4px; min-height: 16px; font-weight: 600; }
.dr-prob span { color: #58a6ff; font-weight: 600; }

/* Distribution mini chart */
.dr-dist {
    display: inline-flex; flex-direction: column;
    background: #0a0a0a; border-radius: 8px; margin: 4px auto;
    padding: 8px 8px 4px; max-width: 100%; overflow: hidden;
}
.dr-dist-bars {
    display: flex; align-items: flex-end; gap: 1px; height: 52px;
}
.dr-dist-wrap { text-align: center; }
.dr-dist-labels {
    display: flex; justify-content: space-between; padding: 3px 0 0;
    font-size: 15px; color: #c9d1d9; font-weight: 700;
    font-family: ui-monospace, monospace;
}
.dr-dist-bar {
    flex: 0 0 auto; max-width: 8px; min-width: 1px;
    border-radius: 2px 2px 0 0; transition: height 0.2s; filter: brightness(0.75);
}
.dr-dist-bar.highlight { filter: brightness(1); box-shadow: 0 0 6px 3px rgba(255,255,255,0.5), 0 0 14px 5px rgba(255,255,255,0.2); z-index: 1; position: relative; }

/* Formula input */
.dr-formula {
    display: flex; gap: 8px; padding: 4px 16px 8px;
    max-width: 500px; margin: 0 auto; width: 100%; flex-shrink: 0;
}
.dr-formula-input {
    flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    color: var(--text-bright); padding: 8px 12px; font-size: 16px; font-family: 'SF Mono', ui-monospace, monospace;
    outline: none;
}
.dr-formula-input:focus { border-color: #58a6ff; }
.dr-formula-input::placeholder { color: #30363d; }
.dr-formula-go {
    background: #238636; color: #fff; border: none; border-radius: 10px;
    padding: 8px 14px; font-size: 15px; font-weight: 700; cursor: pointer;
    font-family: inherit;
}
.dr-formula-go:active { transform: scale(0.95); }
.dr-formula-help {
    background: none; border: 1px solid var(--border); border-radius: 50%;
    color: var(--text-dim); width: 32px; height: 32px; font-size: 16px; font-weight: 700;
    cursor: pointer; font-family: inherit; flex-shrink: 0;
}
.dr-formula-help:hover { border-color: #58a6ff; color: #58a6ff; }
.dr-formula-popup {
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 12px 16px; margin: 0 16px 8px; max-width: 468px;
    margin-left: auto; margin-right: auto;
}
.dr-formula-popup-title { font-size: 14px; font-weight: 700; color: #58a6ff;
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.dr-formula-row { font-size: 14px; color: var(--text-muted); padding: 3px 0; display: flex; align-items: baseline; }
.dr-formula-row code { background: var(--bg); padding: 2px 6px; border-radius: 4px;
    color: var(--text-bright); font-size: 13px; font-family: 'SF Mono', monospace;
    display: inline-block; width: 140px; flex-shrink: 0; margin-right: 8px; }
</style>
</head>
<body>
<div class="dr-header">
    <a class="dr-back" href="/">&larr;</a>
    <h1>Dice Vault</h1>
    <div class="dr-header-right">
        <button class="dr-header-btn" id="premiumToggle" onclick="showPremiumUpsell()" title="Go Premium" style="font-size:11px;font-weight:700;letter-spacing:0.5px">FREE</button>
        <button class="dr-header-btn" onclick="showBugReport()" title="Report Bug">&#x1F41B;</button>
        <button class="dr-header-btn" id="themeBtn" onclick="toggleThemePicker(event)" title="Theme">&#x1F3A8;</button>
        <a class="dr-header-btn dr-history-btn" href="/dice/history" title="History">&#x1F552;</a>
        <button class="dr-header-btn off" onclick="alert('Sound — coming soon!')" title="Sound">&#x1F50A;</button>
        <button class="dr-header-btn off" onclick="alert('Shake to roll — coming soon!')" title="Shake" style="display:inline-flex;align-items:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="7" y="3" width="10" height="18" rx="2"/><line x1="4" y1="7" x2="2" y2="5"/><line x1="4" y1="12" x2="1" y2="12"/><line x1="4" y1="17" x2="2" y2="19"/><line x1="20" y1="7" x2="22" y2="5"/><line x1="20" y1="12" x2="23" y2="12"/><line x1="20" y1="17" x2="22" y2="19"/></svg></button>
    </div>
</div>

<div class="dr-presets" id="presets"></div>
<div class="dr-theme-picker" id="themePicker" style="display:none">
    <div class="dr-theme-picker-title">Theme</div>
    <div class="dr-theme-grid" id="themeGrid"></div>
</div>

<div class="dr-result-area" id="resultArea">
    <div class="dr-result" id="result">Add dice to the cup</div>
    <div class="dr-breakdown" id="breakdown"></div>
    <div class="dr-prob" id="prob"></div>
    <button class="dr-share-btn" id="shareBtn" onclick="shareResult()" style="display:none" title="Share">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
    </button>
</div>

""" + ("""
<div class="dr-formula">
    <button class="dr-formula-help" onclick="toggleFormulaHelp()">?</button>
    <input class="dr-formula-input" id="formulaInput" type="text" placeholder="3d6+2d8+5" autocomplete="off" autocapitalize="off" spellcheck="false"
           oninput="liveParseFormula()" onkeydown="if(event.key==='Enter'){event.preventDefault();rollDice();}">
</div>
<div class="dr-formula-popup" id="formulaHelp" style="display:none">
    <div class="dr-formula-popup-title">Formula Syntax</div>
    <div class="dr-formula-row"><code>3d6</code> Roll 3 six-sided dice</div>
    <div class="dr-formula-row"><code>1d20+5</code> Roll d20, add 5</div>
    <div class="dr-formula-row"><code>2d8+1d6+3</code> Mix dice types</div>
    <div class="dr-formula-row"><code>4d6dl</code> Roll 4d6, drop lowest</div>
    <div class="dr-formula-row"><code>3d20kh1</code> Roll 3d20, keep highest 1</div>
    <div class="dr-formula-row"><code>4d6!</code> Exploding dice (max = reroll &amp; add)</div>
    <div class="dr-formula-row"><code>4d6r1</code> Reroll 1s</div>
    <div class="dr-formula-row"><code>6d6#&gt;=5</code> Count successes &ge; 5</div>
    <div class="dr-formula-row"><code>4dF</code> Fate dice (-1, 0, +1)</div>
    <div class="dr-formula-row"><code>d100</code> Percentile die</div>
</div>
""" if premium else """
<div class="dr-formula">
    <button class="dr-formula-help" onclick="showFormulaUpsell()">?</button>
    <input class="dr-formula-input" id="formulaInput" type="text" placeholder="3d6+2d8+5" readonly
           onclick="showFormulaUpsell()" style="cursor:pointer">
</div>
<div class="dr-formula-popup" id="formulaHelp" style="display:none">
    <div class="dr-formula-popup-title">Formula Syntax</div>
    <div class="dr-formula-row"><code>3d6+2d8+5</code> Mix dice &amp; modifiers</div>
    <div class="dr-formula-row"><code>4d6dl</code> Drop lowest</div>
    <div class="dr-formula-row"><code>3d20kh1</code> Keep highest</div>
    <div class="dr-formula-row"><code>4d6!</code> Exploding dice</div>
    <div class="dr-formula-row"><code>6d6#&gt;=5</code> Count successes</div>
    <div class="dr-formula-row" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
        <strong style="color:#ffa657">Premium unlocks:</strong>
    </div>
    <div class="dr-formula-row"><code>(4d6dl)+(2d8!)</code> Multi-group formulas</div>
    <div class="dr-formula-row"><code>max(2d6, 2d8)</code> Best of groups</div>
    <div class="dr-formula-row"><code>6&times;(4d6dl)</code> Repeat rolls</div>
    <div class="dr-formula-row"><code>2d20kh1+STR</code> Named variables</div>
    <div class="dr-formula-row"><code>d[1,1,2,3,4]</code> Custom dice faces</div>
    <div style="text-align:center;margin-top:12px">
        <button onclick="showPremiumUpsell()" style="background:#ffa657;color:#000;border:none;border-radius:10px;padding:10px 24px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit">Unlock Premium</button>
    </div>
</div>
""") + """

<div class="dr-dice-grid">
""" + buttons_html + """
</div>

<div class="dr-mod-rows">
    <div class="dr-mod-row">
        <button class="dr-mod-btn" onclick="promptMod(-1)">-X</button>
        <button class="dr-mod-btn" onclick="adjustMod(-1)">-1</button>
        <button class="dr-mod-btn" onclick="adjustMod(+1)">+1</button>
        <button class="dr-mod-btn" onclick="promptMod(1)">+X</button>
    </div>
    <div class="dr-mod-row">
        <button class="dr-mod-btn dimmed" id="dropBtn" onclick="toggleDropLowest()" title="Drop lowest">DL</button>
        <button class="dr-mod-btn dimmed" id="dropHBtn" onclick="toggleDropHighest()" title="Drop highest">DH</button>
        <button class="dr-mod-btn dr-mod-explode dimmed" id="explodeBtn" onclick="toggleExploding()" title="Exploding"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><polygon points="12,0.5 13.5,7.5 17,2 15,8.5 21,4.5 16,9.5 23.5,10 16,11.5 22,16 15.5,13 18,20 13,13.5 12,23.5 11,13.5 6,20 9,13 2,16 8,11.5 0.5,10 8,9.5 3,4.5 9,8.5 7,2 10.5,7.5"/></svg></button>
        <button class="dr-mod-btn dimmed" id="minBtn" onclick="toggleMin()" title="Minimum value">Min</button>
        <button class="dr-mod-btn dimmed" id="maxBtn" onclick="toggleMax()" title="Maximum value">Max</button>
        <button class="dr-mod-btn dimmed" id="successBtn" onclick="toggleSuccess()" title="Count successes">Success</button>
    </div>
</div>

<div class="dr-cup" id="cup">
    <div class="dr-cup-preset-label" id="cupPresetLabel"></div>
    <div id="editBanner" style="display:none"></div>
    <div class="dr-dist-wrap"><div class="dr-dist" id="distChart"></div></div>
    <div class="dr-cup-summary" id="cupSummary"></div>
    <div class="dr-cup-staging" id="cupStaging">
        <span class="dr-cup-empty">Add dice to the cup</span>
    </div>
    <div class="dr-cup-tags" id="cupTags"></div>
    <div class="dr-cup-bottom">
        <button class="dr-cup-btn dr-save-preset" id="favStar" onclick="toggleFavorite()">&#9734;</button>
        <button class="dr-cup-btn dr-roll-btn dimmed" id="rollBtn" onclick="rollDice()">ROLL</button>
        <button class="dr-cup-btn dr-clear-cup" onclick="clearCup()" title="Empty cup">&#x1F5D1;</button>
    </div>""" + ("""
    <div class="dr-group-controls" id="groupControls">
        <button onclick="addGroup()">+ Group</button>
        <button onclick="setGroupRepeat(activeGroupIdx)">&times;N</button>
    </div>""" if premium else '') + """
</div>

<script>
// Die visual config
var DIE_SHAPES = {
    d4:  {shape:'\\u25B2', color:'#3dd68c'},
    d6:  {shape:'\\u25A0', color:'#58a6ff'},
    d8:  {shape:'\\u25C6', color:'#bc8cff'},
    d10: {shape:'\\u2B1F', color:'#ff9640'},
    d12: {shape:'\\u2B22', color:'#ff6b8a'},
    d20: {shape:'\\u25B3', color:'#e8c840'},
    d100:{shape:'%',       color:'#40d4e8'},
    adv: {shape:'\\u25B2', color:'#50e890'},
    dis: {shape:'\\u25BC', color:'#f85149'},
    coin:{shape:'\\u25CF', color:'#d4a030'},
    dx:  {shape:'', color:'#b0b8c0', dynamic:true},
    df:  {shape:'F',      color:'#c0c8d0'},
};

function nGonSVG(n, size, color) {
    // Generate an N-sided polygon SVG
    n = Math.max(3, Math.min(n, 20)); // clamp 3-20
    var cx = size/2, cy = size/2, r = size/2 - 1;
    var pts = [];
    for (var i = 0; i < n; i++) {
        var a = (2 * Math.PI * i / n) - Math.PI/2;
        pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
    }
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">' +
           '<polygon points="'+pts.join(' ')+'" fill="'+color+'" opacity="0.7"/></svg>';
}

function getDieShape(d) {
    var info = DIE_SHAPES[d.type] || DIE_SHAPES.dx;
    if (d.type === 'dx' && d.sides) {
        return nGonSVG(d.sides, 26, d.color || info.color);
    }
    return info.shape;
}


// Inline input modal (replaces OS prompt)
function showInlineInput(title, defaultVal, callback) {
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal">' +
        '<div class="dr-modal-title">' + title + '</div>' +
        '<input type="text" id="drModalInput" value="' + (defaultVal||'') + '" autocomplete="off">' +
        '<div class="dr-modal-btns">' +
        '<button class="dr-modal-cancel" onclick="closeModal()">Cancel</button>' +
        '<button class="dr-modal-ok" onclick="submitModal()">OK</button>' +
        '</div></div>';
    document.body.appendChild(overlay);
    var inp = document.getElementById('drModalInput');
    inp.focus(); inp.select();
    inp.onkeydown = function(e) { if(e.key==='Enter') submitModal(); if(e.key==='Escape') closeModal(); };
    overlay.onclick = function(e) { if(e.target===overlay) closeModal(); };
    window._modalCallback = callback;
    window._modalOverlay = overlay;
}
function submitModal() {
    var val = document.getElementById('drModalInput').value;
    var cb = window._modalCallback;
    closeModal();
    if(cb) cb(val);
}
function closeModal() {
    if(window._modalOverlay) { window._modalOverlay.remove(); window._modalOverlay=null; }
    window._modalCallback = null;
}

function showConfirm(msg, onYes) {
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal">' +
        '<div class="dr-modal-title">'+msg+'</div>' +
        '<div class="dr-modal-btns">' +
        '<button class="dr-modal-cancel" id="drConfirmNo">Cancel</button>' +
        '<button class="dr-modal-ok" id="drConfirmYes" style="background:#f85149">Remove</button>' +
        '</div></div>';
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if(e.target===overlay) closeModal(); };
    window._modalOverlay = overlay;
    document.getElementById('drConfirmNo').onclick = closeModal;
    document.getElementById('drConfirmYes').onclick = function() { closeModal(); onYes(); };
}

var PREMIUM = """ + ('true' if premium else 'false') + """;
var MAX_FREE_PRESETS = 5;

// ===== Multi-Group Data Model =====
// The root cup contains one or more groups.
// Free mode: exactly one group. Premium: multiple groups with operators.

function makeGroup(label) {
    return {
        type: 'group', operation: 'sum',
        children: [],
        modifiers: {keep:null, clamp:null},
        modifier: 0, dropLowest: false, dropHighest: false,
        repeat: 1, label: label||'', color: '', id: Date.now()
    };
}

// Root state
var cupGroups = [makeGroup('')];  // array of groups
var rootOperation = 'sum';        // how groups combine: sum | max | min
var activeGroupIdx = 0;           // which group is selected for dice input

// The "active group" is what dice buttons add to
function activeGroup() { return cupGroups[activeGroupIdx] || cupGroups[0]; }

// Legacy accessors — point to the active group
Object.defineProperty(window, 'cupGroup', {
    get: function() { return activeGroup(); }
});
Object.defineProperty(window, 'cupDice', {
    get: function() { return activeGroup().children; },
    set: function(v) { activeGroup().children = v; }
});
Object.defineProperty(window, 'modifier', {
    get: function() { return activeGroup().modifier; },
    set: function(v) { activeGroup().modifier = v; }
});
Object.defineProperty(window, 'dropLowest', {
    get: function() { return activeGroup().dropLowest; },
    set: function(v) { activeGroup().dropLowest = v; }
});
Object.defineProperty(window, 'dropHighest', {
    get: function() { return activeGroup().dropHighest; },
    set: function(v) { activeGroup().dropHighest = v; }
});

var activePopup = null;

function addToCup(type) {
    var g = activeGroup();
    var inherit = g.children.length > 0 && g.children.every(function(d){return d.exploding;});
    function makeDie(t, extras) {
        var d = {type:t, id:Date.now()+(extras||0)};
        if (inherit) d.exploding = true;
        return d;
    }
    if (type === 'dfate') { cupDice.push(makeDie('df')); }
    else if (type === 'dx') { showInlineInput('How many sides?','6',function(v){if(v&&parseInt(v)>1){var d=makeDie('dx');d.sides=parseInt(v);cupDice.push(d);updateCupDisplay();}}); return; }
    else { cupDice.push(makeDie(type)); }
    updateCupDisplay();
}

function removeFromCup(idx) { cupDice.splice(idx,1); closePopup(); updateCupDisplay(); }
function adjustMod(n) { modifier += n; updateCupDisplay(); }
function clearCup() {
    if(editMode) { undoEditMode(); }
    cupDice = []; modifier = 0; dropLowest = false; dropHighest = false;
    cupGroups = [makeGroup('')]; activeGroupIdx = 0; rootOperation = 'sum';
    activePresetIdx = -1; editMode = false; editOriginal = null;
    document.getElementById('dropBtn').classList.remove('on');
    document.getElementById('dropHBtn').classList.remove('on');
    document.getElementById('formulaInput').value = '';
    updateCupDisplay();
}

// ===== Multi-Group Management (Premium) =====
function addGroup() {
    if(!PREMIUM) return;
    cupGroups.push(makeGroup('Group '+(cupGroups.length+1)));
    activeGroupIdx = cupGroups.length - 1;
    updateCupDisplay();
}
function removeGroup(idx) {
    if(cupGroups.length <= 1) return;
    cupGroups.splice(idx, 1);
    if(activeGroupIdx >= cupGroups.length) activeGroupIdx = cupGroups.length - 1;
    updateCupDisplay();
}
function selectGroup(idx) {
    activeGroupIdx = idx;
    // Update DL/DH buttons to reflect this group
    document.getElementById('dropBtn').classList.toggle('on', activeGroup().dropLowest);
    document.getElementById('dropHBtn').classList.toggle('on', activeGroup().dropHighest);
    updateCupDisplay();
}
function toggleExploding() {
    if (cupDice.length === 0) return;
    var g = activeGroup();
    var allExploding = g.children.every(function(d){ return d.exploding; });
    g.children.forEach(function(d){ d.exploding = !allExploding; });
    document.getElementById('explodeBtn').classList.toggle('on', !allExploding);
    updateCupDisplay();
}
function cycleRootOp() {
    var ops = ['sum','max','min'];
    var idx = ops.indexOf(rootOperation);
    rootOperation = ops[(idx+1) % ops.length];
    updateCupDisplay();
}
function setGroupRepeat(gIdx) {
    showInlineInput('Repeat how many times?', cupGroups[gIdx].repeat, function(v) {
        var n = parseInt(v);
        if(n && n >= 1 && n <= 20) { cupGroups[gIdx].repeat = n; updateCupDisplay(); }
    });
}
function toggleDropLowest() {
    var n = cupDice.length;
    if (n < 2) return;
    if (!dropLowest && dropHighest && n < 3) return; // can't enable both with < 3
    dropLowest = !dropLowest;
    document.getElementById('dropBtn').classList.toggle('on', dropLowest);
    updateCupDisplay();
}
function toggleDropHighest() {
    var n = cupDice.length;
    if (n < 2) return;
    if (!dropHighest && dropLowest && n < 3) return; // can't enable both with < 3
    dropHighest = !dropHighest;
    document.getElementById('dropHBtn').classList.toggle('on', dropHighest);
    updateCupDisplay();
}
function toggleMin() {
    if (cupDice.length === 0) return;
    var g = activeGroup();
    var hasMin = g.children.some(function(d){ return d.clampMin > 1; });
    if (hasMin) {
        g.children.forEach(function(d){ delete d.clampMin; });
        updateCupDisplay();
    } else {
        showInlineInput('Minimum die value?', '', function(val) {
            if (!val) return;
            var mn = parseInt(val);
            if (!mn || mn < 1) return;
            // Check against existing max
            var curMax = 0;
            g.children.forEach(function(d){ if(d.clampMax) curMax = d.clampMax; });
            if (curMax && mn >= curMax) {
                showInlineInput('Min must be less than Max (' + curMax + ')', '', function(){}); return;
            }
            g.children.forEach(function(d){ d.clampMin = mn; });
            updateCupDisplay();
        });
    }
}
function toggleMax() {
    if (cupDice.length === 0) return;
    var g = activeGroup();
    var hasMax = g.children.some(function(d){ return d.clampMax; });
    if (hasMax) {
        g.children.forEach(function(d){ delete d.clampMax; });
        updateCupDisplay();
    } else {
        showInlineInput('Maximum die value?', '', function(val) {
            if (!val) return;
            var mx = parseInt(val);
            if (!mx || mx < 1) return;
            // Check against existing min
            var curMin = 0;
            g.children.forEach(function(d){ if(d.clampMin > 1) curMin = d.clampMin; });
            if (curMin && mx <= curMin) {
                showInlineInput('Max must be greater than Min (' + curMin + ')', '', function(){}); return;
            }
            g.children.forEach(function(d){ d.clampMax = mx; });
            updateCupDisplay();
        });
    }
}
function toggleSuccess() {
    if (cupDice.length === 0) return;
    var g = activeGroup();
    var hasSuccess = g.children.some(function(d){ return d.countSuccess; });
    if (hasSuccess) {
        g.children.forEach(function(d){ delete d.countSuccess; });
        updateCupDisplay();
    } else {
        showInlineInput('Count successes: die \\u2265 ?', '', function(val) {
            if (!val) return;
            var threshold = parseInt(val);
            if (!threshold || threshold < 1) return;
            g.children.forEach(function(d){ d.countSuccess = threshold; });
            updateCupDisplay();
        });
    }
}
function promptMod(sign) {
    showInlineInput(sign > 0 ? 'Add modifier:' : 'Subtract modifier:', '', function(val) {
        if (val && parseInt(val)) { modifier += sign * Math.abs(parseInt(val)); updateCupDisplay(); }
    });
}

function saveCupState() {
    localStorage.setItem('dice_roller_cup', JSON.stringify({
        groups: cupGroups, rootOperation: rootOperation, activeGroupIdx: activeGroupIdx
    }));
}
function saveLastRoll(resultText, breakdownHtml) {
    localStorage.setItem('dice_roller_last_roll', JSON.stringify({result:resultText, breakdown:breakdownHtml}));
}
function restoreLastRoll() {
    try {
        var lr = JSON.parse(localStorage.getItem('dice_roller_last_roll'));
        if (lr && lr.result) {
            document.getElementById('result').textContent = lr.result;
            document.getElementById('breakdown').innerHTML = lr.breakdown || '';
        }
    } catch(e) {}
}
function loadCupState() {
    try {
        var s = JSON.parse(localStorage.getItem('dice_roller_cup'));
        if (!s) return;
        if (s.groups) {
            // Multi-group format
            cupGroups = s.groups;
            rootOperation = s.rootOperation || 'sum';
            activeGroupIdx = Math.min(s.activeGroupIdx || 0, cupGroups.length - 1);
        } else if (s.dice || s.children) {
            // Legacy single-group format — migrate
            var g = cupGroups[0];
            g.children = s.children || s.dice || [];
            g.modifier = s.modifier || 0;
            g.dropLowest = !!s.dropLowest;
            g.dropHighest = !!s.dropHighest;
            g.operation = s.operation || 'sum';
            g.repeat = s.repeat || 1;
        }
    } catch(e) {}
}
function dieKey(d) {
    return (d.type||'')+'|'+(d.sides||'')+'|'+(d.exploding?'!':'')+'|'+(d.color||'')+'|'+(d.label||'');
}

function renderGroupDice(g, gIdx) {
    var html = '';
    // Group identical dice
    var groups = [], groupMap = {};
    g.children.forEach(function(d, i) {
        var k = dieKey(d);
        if (groupMap[k] !== undefined) {
            groups[groupMap[k]].count++;
            groups[groupMap[k]].indices.push(i);
        } else {
            groupMap[k] = groups.length;
            groups.push({die:d, count:1, indices:[i], firstIdx:i});
        }
    });
    groups.forEach(function(grp) {
        var d = grp.die, i = grp.firstIdx;
        var info = DIE_SHAPES[d.type] || DIE_SHAPES.dx;
        var label = d.label || (d.type === 'dx' ? 'd'+d.sides : d.type);
        var dieColor = d.color || info.color;
        var bg = '#0a0a0a';
        var border = dieColor;
        var explodeTag = d.exploding ? '<span class="dr-cup-die-explode">💥</span>' : '';
        var explodeStyle = d.exploding ? 'box-shadow:0 0 8px '+dieColor+'66;' : '';
        var countTag = grp.count > 1 ? '<span class="dr-cup-die-count">'+grp.count+'\\u00d7</span>' : '';
        var badges = [];
        if (d.clampMin && d.clampMin > 1) badges.push('\\u2265'+d.clampMin);
        if (d.clampMax) badges.push('\\u2264'+d.clampMax);
        if (d.countSuccess) badges.push('#\\u2265'+d.countSuccess);
        var badgeTag = badges.length ? '<span class="dr-cup-die-badge">'+badges.join(' ')+'</span>' : '';
        var longPressAttr = PREMIUM ? 'oncontextmenu="event.preventDefault();selectGroup('+gIdx+');showDieOptions('+i+',event)" '+
                'ontouchstart="startLongPress('+i+',event,'+gIdx+')" ontouchend="cancelLongPress()" ontouchmove="cancelLongPress()"' : '';
        html += '<div class="dr-cup-die" style="background:'+bg+';border:2px solid '+border+';color:'+dieColor+';'+explodeStyle+'" '+
                'onclick="selectGroup('+gIdx+');removeFromCup('+i+')" '+
                longPressAttr+'>'+
                countTag+getDieShape(d)+explodeTag+badgeTag+
                '<span class="dr-cup-die-label">'+label+'</span></div>';
    });
    if (g.modifier !== 0) {
        var mc = g.modifier > 0 ? '#7ee787' : '#f85149';
        var ml = g.modifier > 0 ? '+'+g.modifier : ''+g.modifier;
        html += '<div class="dr-cup-mod" style="background:#0a0a0a;border:2px solid '+mc+';color:'+mc+'" '+
                'onclick="selectGroup('+gIdx+');modifier=0;updateCupDisplay()">'+ml+'</div>';
    }
    return html;
}

function updateCupDisplay() {
    saveCupState();
    var staging = document.getElementById('cupStaging');
    var summary = document.getElementById('cupSummary');

    // Check if all groups are empty
    var totalDice = 0, totalMod = 0;
    cupGroups.forEach(function(g) { totalDice += g.children.length; totalMod += Math.abs(g.modifier); });

    if (totalDice === 0 && totalMod === 0) {
        staging.innerHTML = '<span class="dr-cup-empty">Add dice to the cup</span>';
        summary.textContent = '';
        document.getElementById('distChart').innerHTML = '';
        document.getElementById('distChart').parentElement.style.display = 'none';
        document.getElementById('formulaInput').value = '';
        document.getElementById('prob').innerHTML = '';
        document.getElementById('rollBtn').classList.add('dimmed');
        document.getElementById('dropBtn').classList.add('dimmed');
        document.getElementById('dropHBtn').classList.add('dimmed');
        document.getElementById('explodeBtn').classList.add('dimmed');
        document.getElementById('minBtn').classList.add('dimmed');
        document.getElementById('maxBtn').classList.add('dimmed');
        document.getElementById('successBtn').classList.add('dimmed');
        document.getElementById('favStar').classList.add('dimmed');
        document.getElementById('favStar').style.color = '';
        document.getElementById('dropBtn').classList.remove('on');
        document.getElementById('dropHBtn').classList.remove('on');
        document.getElementById('explodeBtn').classList.remove('on');
        document.getElementById('minBtn').classList.remove('on');
        document.getElementById('minBtn').textContent = 'Min';
        document.getElementById('maxBtn').classList.remove('on');
        document.getElementById('maxBtn').textContent = 'Max';
        document.getElementById('successBtn').classList.remove('on');
        document.getElementById('successBtn').textContent = 'Success';
        document.getElementById('favStar').classList.remove('fav-active');
        document.getElementById('cupTags').innerHTML = '';
        if(!editMode) { activePresetIdx = -1; }
        return;
    }
    document.getElementById('distChart').parentElement.style.display = '';

    var html = '';
    if (PREMIUM && cupGroups.length > 1) {
        // Multi-group rendering
        cupGroups.forEach(function(g, gi) {
            if (gi > 0) {
                var opLabel = rootOperation === 'max' ? 'MAX' : rootOperation === 'min' ? 'MIN' : '+';
                html += '<div class="dr-group-op" onclick="cycleRootOp()" title="Click to change">'+opLabel+'</div>';
            }
            var active = gi === activeGroupIdx ? ' active' : '';
            var repeatLabel = g.repeat > 1 ? '<div class="dr-group-repeat">'+g.repeat+'\\u00d7</div>' : '';
            html += '<div class="dr-group-section'+active+'" onclick="selectGroup('+gi+')">';
            html += repeatLabel;
            html += '<div class="dr-group-label">'+(g.label || 'Group '+(gi+1))+'</div>';
            html += '<div class="dr-group-dice">';
            if (g.children.length === 0 && g.modifier === 0) {
                html += '<span class="dr-group-empty">tap dice to add</span>';
            } else {
                html += renderGroupDice(g, gi);
            }
            html += '</div></div>';
        });
        // Controls
        html += '<div class="dr-group-controls">';
        html += '<button onclick="addGroup()">+ Group</button>';
        if(cupGroups.length > 1) html += '<button onclick="removeGroup(activeGroupIdx)">- Group</button>';
        html += '<button onclick="setGroupRepeat(activeGroupIdx)">\\u00d7N</button>';
        html += '</div>';
    } else {
        // Single group — same as before
        html = renderGroupDice(cupGroups[0], 0);
    }
    staging.innerHTML = html;
    // Summary — use buildGroupFormula for consistency
    summary.textContent = buildGroupFormula(activeGroup());
    document.getElementById('rollBtn').classList.toggle('dimmed', totalDice === 0);
    document.getElementById('favStar').classList.toggle('dimmed', totalDice === 0);
    if (totalDice === 0) document.getElementById('favStar').style.color = '';
    var n = activeGroup().children.length;
    // DL or DH alone needs >= 2 dice; both together needs >= 3
    var dlDisable = n < 2;
    var dhDisable = n < 2;
    if (dropLowest && dropHighest && n < 3) {
        // Can't have both with < 3 dice — turn off the one just toggled (keep the other)
        dropHighest = false; document.getElementById('dropHBtn').classList.remove('on');
    }
    if (dropLowest) dhDisable = n < 3;
    if (dropHighest) dlDisable = n < 3;
    document.getElementById('dropBtn').classList.toggle('dimmed', dlDisable);
    document.getElementById('dropHBtn').classList.toggle('dimmed', dhDisable);
    if (n < 2) { dropLowest = false; dropHighest = false;
        document.getElementById('dropBtn').classList.remove('on');
        document.getElementById('dropHBtn').classList.remove('on'); }
    // Explode button state
    var allExploding = n > 0 && activeGroup().children.every(function(d){return d.exploding;});
    document.getElementById('explodeBtn').classList.toggle('on', allExploding);
    document.getElementById('explodeBtn').classList.toggle('dimmed', n === 0);
    var explodePts = '12,0.5 13.5,7.5 17,2 15,8.5 21,4.5 16,9.5 23.5,10 16,11.5 22,16 15.5,13 18,20 13,13.5 12,23.5 11,13.5 6,20 9,13 2,16 8,11.5 0.5,10 8,9.5 3,4.5 9,8.5 7,2 10.5,7.5';
    var explodeSvgDimmed = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><polygon points="'+explodePts+'"/></svg>';
    var explodeSvgOn = '<svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="#333" stroke-width="1.5" stroke-linejoin="round"><polygon points="'+explodePts+'"/></svg>';
    document.getElementById('explodeBtn').innerHTML = n === 0 ? explodeSvgDimmed : allExploding ? explodeSvgOn : '\\uD83D\\uDCA5';
    // Min button state
    var minVal = 0;
    activeGroup().children.forEach(function(d){ if(d.clampMin > 1) minVal = d.clampMin; });
    document.getElementById('minBtn').classList.toggle('on', minVal > 0);
    document.getElementById('minBtn').classList.toggle('dimmed', n === 0);
    document.getElementById('minBtn').textContent = minVal > 0 ? 'Min=' + minVal : 'Min';
    // Max button state
    var maxVal = 0;
    activeGroup().children.forEach(function(d){ if(d.clampMax) maxVal = d.clampMax; });
    document.getElementById('maxBtn').classList.toggle('on', maxVal > 0);
    document.getElementById('maxBtn').classList.toggle('dimmed', n === 0);
    document.getElementById('maxBtn').textContent = maxVal > 0 ? 'Max=' + maxVal : 'Max';
    // Success button state
    var successVal = 0;
    activeGroup().children.forEach(function(d){ if(d.countSuccess) successVal = d.countSuccess; });
    document.getElementById('successBtn').classList.toggle('on', successVal > 0);
    document.getElementById('successBtn').classList.toggle('dimmed', n === 0);
    document.getElementById('successBtn').textContent = successVal > 0 ? 'Success \\u2265 ' + successVal : 'Success';
    // Cup tags strip
    var tags = [];
    if (dropLowest) tags.push('Drop Lowest');
    if (dropHighest) tags.push('Drop Highest');
    var cupTagsEl = document.getElementById('cupTags');
    cupTagsEl.innerHTML = tags.map(function(t){ return '<span class="dr-cup-tag">'+t+'</span>'; }).join('');
    renderDistribution();
    syncFormulaFromCup();
    updateFavState();
    // In edit mode, auto-save changes to the active preset
    if(editMode && activePresetIdx >= 0) {
        var updated = JSON.parse(JSON.stringify(cupGroup));
        updated.name = presets[activePresetIdx].name;
        updated.dice = updated.children; // backward compat
        presets[activePresetIdx] = updated;
        savePresetsToStorage();
    }
}

// Long press for options
var lpTimer = null;
function startLongPress(idx, e) {
    lpTimer = setTimeout(function() { showDieOptions(idx, e); }, 500);
}
function cancelLongPress() { clearTimeout(lpTimer); }

var optionsDieIdx = -1;
var COLORS = ['#58a6ff','#7ee787','#f0883e','#f85149','#d2a8ff','#d29922','#ff7b72','#79c0ff'];

function showDieOptions(idx, e) {
    if(e) { e.preventDefault(); e.stopPropagation(); }
    closePopup();
    optionsDieIdx = idx;
    var d = cupDice[idx];
    var info = DIE_SHAPES[d.type] || DIE_SHAPES.dx;
    var sides = d.type==='dx' ? (d.sides||6) : (dieRanges[d.type]||6);
    var label = d.type==='dx' ? 'd'+d.sides : d.type==='df' ? 'dF' : d.type;

    var panel = document.createElement('div');
    panel.className = 'dr-die-options';
    panel.onclick = function(ev) { ev.stopPropagation(); };

    var html = '<div class="dr-die-options-header">' +
        '<span class="dr-die-options-title" style="color:'+info.color+'">'+label.toUpperCase()+' Options</span>' +
        '<button class="dr-die-options-close" onclick="closePopup()">&times;</button></div>';

    // Sides (for DX)
    if (d.type === 'dx') {
        html += '<div class="dr-opt-section"><div class="dr-opt-label">Sides</div>' +
            '<div class="dr-opt-row"><input class="dr-opt-input" type="number" value="'+sides+'" min="2" ' +
            'onchange="cupDice['+idx+'].sides=parseInt(this.value)||6;updateCupDisplay()"></div></div>';
    }

    // Explode
    html += '<div class="dr-opt-section"><div class="dr-opt-label">Explode</div>' +
        '<div class="dr-opt-row">' +
        '<button class="dr-opt-toggle'+(d.exploding?' on':'')+'" onclick="toggleDieOpt('+idx+',&quot;exploding&quot;)">'+
        (d.exploding ? '\\u2714 Exploding' : 'Off')+'</button>';
    if (d.exploding) {
        html += ' <span style="color:#484f58;font-size:12px">on</span> ' +
            '<select class="dr-opt-input" style="width:auto" onchange="setExplodeOp('+idx+',this.value)">' +
            '<option value="="'+((!d.explodeOp||d.explodeOp==='=')?' selected':'')+'>= (equals)</option>' +
            '<option value=">="'+((d.explodeOp==='>=')?' selected':'')+'>= (or above)</option>' +
            '</select> ' +
            '<input class="dr-opt-input" type="number" value="'+(d.explodeVal||sides)+'" min="1" max="'+sides+'" ' +
            'onchange="cupDice['+idx+'].explodeVal=parseInt(this.value);updateCupDisplay()">';
    }
    html += '</div></div>';

    // Reroll
    html += '<div class="dr-opt-section"><div class="dr-opt-label">Reroll</div>' +
        '<div class="dr-opt-row">' +
        '<button class="dr-opt-toggle'+(d.reroll?' on':'')+'" onclick="toggleDieReroll('+idx+')">' +
        (d.reroll ? '\\u2714 Reroll \\u2264 '+d.reroll : 'Off') + '</button>';
    if (d.reroll) {
        html += ' <input class="dr-opt-input" type="number" value="'+d.reroll+'" min="1" max="'+(sides-1)+'" ' +
            'onchange="cupDice['+idx+'].reroll=parseInt(this.value)||1;updateCupDisplay();showDieOptions('+idx+')">';
    }
    html += '</div></div>';

    // Min / Max (clamp)
    html += '<div class="dr-opt-section"><div class="dr-opt-label">Clamp</div>' +
        '<div class="dr-opt-row">' +
        '<span style="color:#8b949e;font-size:12px">Min</span> ' +
        '<input class="dr-opt-input" type="number" value="'+(d.clampMin||1)+'" min="1" max="'+sides+'" ' +
        'onchange="cupDice['+idx+'].clampMin=parseInt(this.value)||1;updateCupDisplay()"> ' +
        '<span style="color:#8b949e;font-size:12px">Max</span> ' +
        '<input class="dr-opt-input" type="number" value="'+(d.clampMax||sides)+'" min="1" max="'+sides+'" ' +
        'onchange="cupDice['+idx+'].clampMax=parseInt(this.value)||'+sides+';updateCupDisplay()">' +
        '</div></div>';

    // Count as success
    html += '<div class="dr-opt-section"><div class="dr-opt-label">Count Success</div>' +
        '<div class="dr-opt-row">' +
        '<button class="dr-opt-toggle'+(d.countSuccess?' on':'')+'" onclick="toggleDieCount('+idx+')">' +
        (d.countSuccess ? '\\u2714 Success \\u2265 '+d.countSuccess : 'Off') + '</button>';
    if (d.countSuccess) {
        html += ' <input class="dr-opt-input" type="number" value="'+d.countSuccess+'" min="1" max="'+sides+'" ' +
            'onchange="cupDice['+idx+'].countSuccess=parseInt(this.value)||1;updateCupDisplay();showDieOptions('+idx+')">';
    }
    html += '</div></div>';

    // Label
    html += '<div class="dr-opt-section"><div class="dr-opt-label">Label</div>' +
        '<div class="dr-opt-row">' +
        '<input class="dr-opt-input" style="width:120px;text-align:left" type="text" value="'+(d.label||'')+'" ' +
        'placeholder="e.g. Fire dmg" onchange="cupDice['+idx+'].label=this.value;updateCupDisplay()">' +
        '</div></div>';

    // Color
    html += '<div class="dr-opt-section"><div class="dr-opt-label">Color</div>' +
        '<div class="dr-opt-colors">';
    COLORS.forEach(function(c) {
        var sel = (d.color||info.color) === c ? ' selected' : '';
        html += '<div class="dr-opt-color'+sel+'" style="background:'+c+'" ' +
            'onclick="cupDice['+idx+'].color=&quot;'+c+'&quot;;updateCupDisplay();showDieOptions('+idx+')"></div>';
    });
    html += '</div></div>';

    // Actions
    html += '<div class="dr-opt-section" style="display:flex;gap:8px;padding-top:8px;border-top:1px solid #21262d">' +
        '<button class="dr-opt-toggle" onclick="duplicateDie('+idx+')">Duplicate</button>' +
        '<button class="dr-opt-toggle danger" onclick="removeFromCup('+idx+')">Remove</button>' +
        '</div>';

    panel.innerHTML = html;
    document.body.appendChild(panel);
    activePopup = panel;

    // Add backdrop
    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:199';
    backdrop.onclick = closePopup;
    backdrop.id = 'optBackdrop';
    document.body.appendChild(backdrop);
}

function closePopup() {
    if (activePopup) { activePopup.remove(); activePopup = null; }
    var bd = document.getElementById('optBackdrop');
    if (bd) bd.remove();
    optionsDieIdx = -1;
}

function toggleDieOpt(idx, prop) {
    cupDice[idx][prop] = !cupDice[idx][prop];
    if (prop === 'exploding' && cupDice[idx].exploding) {
        var sides = cupDice[idx].type==='dx' ? (cupDice[idx].sides||6) : (dieRanges[cupDice[idx].type]||6);
        cupDice[idx].explodeVal = sides; // default: explode on max
    }
    updateCupDisplay(); showDieOptions(idx);
}
function setExplodeOp(idx, op) { cupDice[idx].explodeOp = op; updateCupDisplay(); }
function toggleDieReroll(idx) {
    cupDice[idx].reroll = cupDice[idx].reroll ? 0 : 1;
    updateCupDisplay(); showDieOptions(idx);
}
function toggleDieCount(idx) {
    var sides = cupDice[idx].type==='dx' ? (cupDice[idx].sides||6) : (dieRanges[cupDice[idx].type]||6);
    cupDice[idx].countSuccess = cupDice[idx].countSuccess ? 0 : Math.ceil(sides*0.7);
    updateCupDisplay(); showDieOptions(idx);
}

function duplicateDie(idx) {
    var copy = JSON.parse(JSON.stringify(cupDice[idx]));
    copy.id = Date.now();
    cupDice.push(copy);
    closePopup(); updateCupDisplay();
}

// Roll engine
var dieRanges = {d4:4,d6:6,d8:8,d10:10,d12:12,d20:20,d100:100};

function rollOneDie(sides) { return Math.floor(Math.random()*sides)+1; }

function rollSingleDie(d) {
    var sides = d.type==='dx' ? (d.sides||6) : (dieRanges[d.type]||6);
    if (d.type==='df') return {value: Math.floor(Math.random()*3)-1, chain: null};

    var val = rollOneDie(sides);
    var chain = null;

    // Exploding: if max, roll again and add (cap at 10 explosions)
    if (d.exploding) {
        chain = [val];
        var explodeVal = val;
        while (explodeVal === sides && chain.length < 11) {
            explodeVal = rollOneDie(sides);
            chain.push(explodeVal);
            val += explodeVal;
        }
        if (chain.length === 1) chain = null; // no explosion happened
    }

    // Reroll: if val <= reroll threshold, reroll once
    if (d.reroll && val <= d.reroll) {
        val = rollOneDie(sides);
        chain = null;
    }

    // Clamp
    var clamped = null;
    if (d.clampMin && val < d.clampMin) { clamped = val; val = d.clampMin; }
    if (d.clampMax && val > d.clampMax) { clamped = clamped !== null ? clamped : val; val = d.clampMax; }

    return {value: val, chain: chain, clamped: clamped};
}

function rollSingleGroup(g) {
    // Roll one group, return {total, breakdown (html string)}
    var results = [], total = 0, bParts = [];
    g.children.forEach(function(d) {
        var roll = rollSingleDie(d);
        results.push({type:d.type, sides:d.sides, value:roll.value, chain:roll.chain, clamped:roll.clamped, exploding:d.exploding});
    });
    // Keep/Drop logic — supports DL+DH simultaneously
    var kept = [];
    var dropSet = {};
    if (results.length > 1) {
        var sorted = results.map(function(r,i){return{val:r.value,idx:i};});
        sorted.sort(function(a,b){return a.val-b.val;});
        // Per-die keep overrides
        var hasPerDieKeep = false;
        g.children.forEach(function(d){if(d.keep) hasPerDieKeep=true;});
        if (hasPerDieKeep) {
            var keepMode, keepCount;
            g.children.forEach(function(d){if(d.keep){keepMode=d.keep;keepCount=d.keepCount||1;}});
            if(keepMode==='kh') { for(var i=0;i<sorted.length-keepCount;i++) dropSet[sorted[i].idx]=true; }
            else { for(var i=keepCount;i<sorted.length;i++) dropSet[sorted[i].idx]=true; }
        } else {
            if(g.dropLowest) dropSet[sorted[0].idx] = true;
            if(g.dropHighest) dropSet[sorted[sorted.length-1].idx] = true;
        }
    }
    results.forEach(function(r,i){ kept.push(!dropSet[i]); });
    // Count successes
    var countMode=false, countTh=0;
    g.children.forEach(function(d){if(d.countSuccess){countMode=true;countTh=d.countSuccess;}});
    if(countMode){var s=0;results.forEach(function(r,i){if(kept[i]&&r.value>=countTh)s++;});total=s;}
    else{results.forEach(function(r,i){if(kept[i])total+=r.value;});}
    total += g.modifier||0;
    // Breakdown
    results.forEach(function(r,i){
        var label=r.chain?r.chain.join('+')+' = '+r.value:''+r.value;
        if(r.clamped!==null&&r.clamped!==undefined) label=r.clamped+'\\u2192'+r.value;
        if(r.type==='df') label=r.value>0?'+'+r.value:r.value===0?'0':''+r.value;
        var style=kept[i]?'':'opacity:0.3;text-decoration:line-through';
        if(r.chain)style+=(style?';':'')+'color:#f0883e';
        if(r.clamped!==null&&r.clamped!==undefined)style+=(style?';':'')+'color:#d29922';
        if(countMode&&kept[i]){style=r.value>=countTh?'color:#7ee787;font-weight:800':'opacity:0.5';}
        bParts.push('<span class="dr-die-result" style="'+style+'">'+label+'</span>');
    });
    if(g.modifier>0) bParts.push('+'+g.modifier);
    else if(g.modifier<0) bParts.push(''+g.modifier);
    return {total:total, breakdown:bParts.join(' ')};
}

function rollDice() {
    var totalDice = 0;
    cupGroups.forEach(function(g) { totalDice += g.children.length; });
    if (totalDice === 0) { document.getElementById('result').textContent = 'Add dice'; return; }
    playSound(); if (navigator.vibrate) navigator.vibrate(50);

    // Multi-group: evaluate each group, combine
    if (PREMIUM && cupGroups.length > 1) {
        var groupResults = [];
        var allBreakdown = [];
        cupGroups.forEach(function(g, gi) {
            // Temporarily set active group for rollSingleGroup
            var saved = activeGroupIdx; activeGroupIdx = gi;
            var result = rollSingleGroup(g);
            activeGroupIdx = saved;

            for (var ri = 0; ri < (g.repeat || 1); ri++) {
                if (ri > 0) result = rollSingleGroup(g);
                groupResults.push(result);
                var prefix = cupGroups.length > 1 ? '<span style="color:#484f58;font-size:11px">'+(g.label||'G'+(gi+1))+':</span> ' : '';
                allBreakdown.push(prefix + result.breakdown + ' = ' + result.total);
            }
        });

        var finalTotal;
        var totals = groupResults.map(function(r){return r.total;});
        if (rootOperation === 'max') finalTotal = Math.max.apply(null, totals);
        else if (rootOperation === 'min') finalTotal = Math.min.apply(null, totals);
        else finalTotal = totals.reduce(function(a,b){return a+b;}, 0);

        var opLabel = rootOperation === 'max' ? ' (highest)' : rootOperation === 'min' ? ' (lowest)' : '';
        animateResult(finalTotal);
        document.getElementById('breakdown').innerHTML = allBreakdown.join(' <span style="color:#484f58">'+
            (rootOperation==='sum'?'+':rootOperation.toUpperCase())+'</span> ') + opLabel;
        saveLastRoll(String(finalTotal), document.getElementById('breakdown').innerHTML);
        var expr = cupGroups.map(function(g){
            var c={}; g.children.forEach(function(d){var k=d.type==='dx'?'d'+(d.sides||6):d.type;c[k]=(c[k]||0)+1;});
            var p=[]; for(var t in c) p.push(c[t]>1?c[t]+t:t);
            if(g.modifier>0) p.push('+'+g.modifier); else if(g.modifier<0) p.push(''+g.modifier);
            var e=p.join('+'); if(g.repeat>1) e=g.repeat+'\\u00d7('+e+')';
            return e;
        }).join(rootOperation==='sum'?' + ':' '+rootOperation+' ');
        saveToHistory({expression:expr, total:finalTotal, breakdown:document.getElementById('breakdown').textContent, timestamp:Date.now()});
        showProbability(finalTotal);
        return;
    }
    var results = [], total = 0, expression = '', breakdownParts = [];
    {
        var hasCoin = cupDice.some(function(d){return d.type==='coin';});
        if (hasCoin) {
            var coinVal = Math.random()<0.5 ? 1 : 0;
            var coinLabel = coinVal ? 'HEADS (1)' : 'TAILS (0)';
            animateResult(coinLabel);
            saveLastRoll(coinLabel, coinLabel);
            saveToHistory({expression:'COIN',total:coinVal,breakdown:coinLabel,timestamp:Date.now()});
            showProbability(coinVal);
            return;
        }

        // Roll all dice — store color and original index for sorting
        cupDice.forEach(function(d, idx) {
            var roll = rollSingleDie(d);
            var info = DIE_SHAPES[d.type] || DIE_SHAPES.dx || {color:'#8b949e'};
            var dieColor = d.color || info.color;
            results.push({type:d.type, sides:d.sides, value:roll.value, chain:roll.chain, clamped:roll.clamped, exploding:d.exploding, reroll:d.reroll, dieColor:dieColor, origIdx:idx});
        });

        // Sort results by die type to group them (matching formula order)
        var typeOrder = {};
        var orderIdx = 0;
        cupDice.forEach(function(d) {
            var k = d.type==='dx'?'d'+(d.sides||6):d.type;
            if (!(k in typeOrder)) { typeOrder[k] = orderIdx++; }
        });
        var sortMap = results.map(function(r,i){return i;});
        sortMap.sort(function(a,b) {
            var ka = results[a].type==='dx'?'d'+(results[a].sides||6):results[a].type;
            var kb = results[b].type==='dx'?'d'+(results[b].sides||6):results[b].type;
            return (typeOrder[ka]||0) - (typeOrder[kb]||0);
        });
        var sortedResults = sortMap.map(function(i){return results[i];});
        var sortedKept = []; // will fill after keep/drop

        // Keep/Drop — supports DL+DH simultaneously
        var kept = [];
        var dropSet = {};
        if (results.length > 1) {
            var sorted = results.map(function(r,i){return{val:r.value,idx:i};});
            sorted.sort(function(a,b){return a.val-b.val;});
            var hasPerDieKeep = false;
            cupDice.forEach(function(d){if(d.keep) hasPerDieKeep=true;});
            if (hasPerDieKeep) {
                var keepMode, keepCount;
                cupDice.forEach(function(d){if(d.keep){keepMode=d.keep;keepCount=d.keepCount||1;}});
                if(keepMode==='kh'){for(var ki=0;ki<sorted.length-keepCount;ki++) dropSet[sorted[ki].idx]=true;}
                else{for(var ki=keepCount;ki<sorted.length;ki++) dropSet[sorted[ki].idx]=true;}
            } else {
                if(dropLowest) dropSet[sorted[0].idx]=true;
                if(dropHighest) dropSet[sorted[sorted.length-1].idx]=true;
            }
        }
        results.forEach(function(r,i){ kept.push(!dropSet[i]); });
        // Map kept to sorted order
        sortedKept = sortMap.map(function(i){return kept[i];});

        // Count successes mode
        var countMode = false, countThreshold = 0;
        cupDice.forEach(function(d) { if(d.countSuccess) { countMode = true; countThreshold = d.countSuccess; } });

        // Calculate total
        if (countMode) {
            var successes = 0;
            results.forEach(function(r,i) { if(kept[i] && r.value >= countThreshold) successes++; });
            total = successes;
        } else {
            results.forEach(function(r,i) { if(kept[i]) total += r.value; });
        }

        // Build expression — use buildGroupFormula for consistency
        expression = buildGroupFormula(activeGroup());

        // Build breakdown (sorted by die type)
        sortedResults.forEach(function(r, i) {
            var label;
            if (r.type==='df') {
                label = r.value>0?'+'+r.value:r.value===0?'0':''+r.value;
            } else if (r.chain) {
                label = r.chain.join('+')+' = '+r.value;
            } else if (r.clamped !== null && r.clamped !== undefined) {
                label = r.clamped+'\\u2192'+r.value;
            } else {
                label = ''+r.value;
            }
            var style = sortedKept[i] ? '' : 'opacity:0.3;text-decoration:line-through';
            if (r.chain) style += (style?';':'') + 'color:#f0883e';
            if (r.clamped !== null && r.clamped !== undefined) style += (style?';':'') + 'color:#d29922';
            if (countMode && sortedKept[i]) {
                var hit = r.value >= countThreshold;
                style = hit ? 'color:#7ee787;font-weight:800' : 'opacity:0.5';
            }
            var borderStyle = 'border-color:'+r.dieColor;
            breakdownParts.push('<span class="dr-die-result" style="'+borderStyle+';'+style+'">'+label+'</span>');
        });
        if (countMode) breakdownParts.push('= '+total+(total===1?' success':' successes'));
    }
    total += modifier;
    if (modifier>0) { expression+='+'+modifier; breakdownParts.push('<span class="dr-die-result" style="border-color:#7ee787">+'+modifier+'</span>'); }
    else if (modifier<0) { expression+=modifier; breakdownParts.push('<span class="dr-die-result" style="border-color:#f85149">'+modifier+'</span>'); }
    if (!countMode) breakdownParts.push('= '+total);
    animateResult(total);
    document.getElementById('breakdown').innerHTML = breakdownParts.join(' ');
    saveLastRoll(String(total), breakdownParts.join(' '));
    saveToHistory({expression:expression,total:total,breakdown:breakdownParts.join(' ').replace(/<[^>]*>/g,''),timestamp:Date.now()});
    showProbability(total);
}

function animateResult(finalValue) {
    var el = document.getElementById('result');
    el.classList.add('dr-rolling');
    var lo=0, hi=0;
    cupDice.forEach(function(d) {
        if(d.type==='adv'||d.type==='dis'){lo=1;hi=20;}
        else if(d.type==='coin'){lo+=0;hi+=1;}
        else if(d.type==='df'){lo+=-1;hi+=1;}
        else{var s=d.type==='dx'?(d.sides||6):(dieRanges[d.type]||6);lo+=1;hi+=s;}
    });
    lo+=modifier; hi+=modifier;
    if(hi<=lo){lo=1;hi=Math.max(20,typeof finalValue==='number'?finalValue:20);}
    var frames = 0;
    var iv = setInterval(function() {
        el.textContent = typeof finalValue==='number' ? (Math.floor(Math.random()*(hi-lo+1))+lo) : finalValue;
        if(++frames>=10) { clearInterval(iv); el.textContent=finalValue; el.classList.remove('dr-rolling');
            document.getElementById('shareBtn').style.display = '';
        }
    }, 50);
}

function shareResult() {
    var resultText = document.getElementById('result').textContent;
    var breakdown = document.getElementById('breakdown').textContent;
    var formula = document.getElementById('formulaInput').value || document.getElementById('cupSummary').textContent;
    var text = 'I rolled ' + resultText + '! (' + formula + ')\\n' + breakdown + '\\n\\u2014 Dice Vault';
    var btn = document.getElementById('shareBtn');

    if (navigator.share) {
        navigator.share({title: 'Dice Vault', text: text}).then(function() {
            btn.innerHTML = '\\u2714';
            setTimeout(function(){ resetShareBtn(); }, 1500);
        }).catch(function(err) {
            // User cancelled or error — show feedback anyway if not AbortError
            if (err.name !== 'AbortError') {
                alert('Share failed: ' + err.message);
            }
        });
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
            btn.innerHTML = '\\u2714';
            setTimeout(function(){ resetShareBtn(); }, 1500);
        }).catch(function(){ alert('Could not copy to clipboard'); });
    } else {
        alert(text);
    }
}
function resetShareBtn() {
    document.getElementById('shareBtn').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
}

// History (localStorage only — rendered on /dice/history page)
var rollHistory = [];
function loadHistory() { try{rollHistory=JSON.parse(localStorage.getItem('dice_roller_history')||'[]');}catch(e){rollHistory=[];} }
function saveToHistory(entry) {
    if(activePresetIdx >= 0 && presets[activePresetIdx]) entry.favName = presets[activePresetIdx].name;
    loadHistory();
    rollHistory.unshift(entry);
    if(rollHistory.length>30) rollHistory=rollHistory.slice(0,30);
    localStorage.setItem('dice_roller_history',JSON.stringify(rollHistory));
}

// Sound
var isMuted=false, audioCtx=null;
function toggleMute() {
    isMuted=!isMuted;
    document.getElementById('muteBtn').classList.toggle('on',!isMuted);
    document.getElementById('muteBtn').innerHTML=isMuted?'🔇':'🔊';
    localStorage.setItem('dice_roller_muted',isMuted?'1':'0');
}
function playSound() {
    if(isMuted) return;
    try {
        if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)();
        var buf=audioCtx.createBuffer(1,audioCtx.sampleRate*0.12,audioCtx.sampleRate);
        var data=buf.getChannelData(0);
        for(var i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/(audioCtx.sampleRate*0.025));
        var src=audioCtx.createBufferSource(); src.buffer=buf;
        var f=audioCtx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=900; f.Q.value=1.2;
        src.connect(f); f.connect(audioCtx.destination); src.start();
    } catch(e){}
}

// ===== Presets / Favorites =====
var presets=[];
var activePresetIdx = -1;  // which preset is loaded (-1 = none)
var editMode = false;
var editOriginal = null;   // snapshot for undo

function loadPresets() {
    var raw = localStorage.getItem('dice_roller_presets');
    try{presets=JSON.parse(raw||'null');}catch(e){presets=null;}
    if(presets && Array.isArray(presets)) {
        // Remove any presets with no dice
        presets=presets.filter(function(p){var d=p.children||p.dice; return d&&d.length>0;});
        // If user had presets but all were empty, don't overwrite with defaults
        if(presets.length === 0 && raw) { presets = []; savePresetsToStorage(); renderPresets(); return; }
    }
    if(!presets) {
        // First time — set defaults
        presets=[
            {name:'D&D Stat',children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}],dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}],modifier:0,dropLowest:true,dropHighest:false},
            {name:'Advantage',children:[{type:'d20'},{type:'d20'}],dice:[{type:'d20'},{type:'d20'}],modifier:0,dropLowest:true,dropHighest:false},
            {name:'Disadvantage',children:[{type:'d20'},{type:'d20'}],dice:[{type:'d20'},{type:'d20'}],modifier:0,dropLowest:false,dropHighest:true},
            {name:'Fate',children:[{type:'df'},{type:'df'},{type:'df'},{type:'df'}],dice:[{type:'df'},{type:'df'},{type:'df'},{type:'df'}],modifier:0,dropLowest:false,dropHighest:false},
        ];
        savePresetsToStorage();
    }
    renderPresets();
}
function savePresetsToStorage() { localStorage.setItem('dice_roller_presets',JSON.stringify(presets)); }

function getCupSignature() {
    // Build a comparable string from current cup state
    var counts={};
    var expl=0, clMin=0, clMax=0, succ=0;
    cupDice.forEach(function(d){
        var k=d.type==='dx'?'d'+(d.sides||6):d.type;counts[k]=(counts[k]||0)+1;
        if(d.exploding) expl++;
        if(d.clampMin>1) clMin=d.clampMin;
        if(d.clampMax) clMax=d.clampMax;
        if(d.countSuccess) succ=d.countSuccess;
    });
    var parts=[]; for(var t in counts) parts.push(counts[t]+t);
    parts.sort();
    if(modifier) parts.push('m'+modifier);
    if(dropLowest) parts.push('dl');
    if(dropHighest) parts.push('dh');
    if(expl) parts.push('x'+expl);
    if(clMin) parts.push('mn'+clMin);
    if(clMax) parts.push('mx'+clMax);
    if(succ) parts.push('s'+succ);
    return parts.join('|');
}

function getPresetSignature(p) {
    var counts={};
    var expl=0, clMin=0, clMax=0, succ=0;
    var dice = p.children || p.dice || [];
    dice.forEach(function(d){
        var k=d.type==='dx'?'d'+(d.sides||6):d.type;counts[k]=(counts[k]||0)+1;
        if(d.exploding) expl++;
        if(d.clampMin>1) clMin=d.clampMin;
        if(d.clampMax) clMax=d.clampMax;
        if(d.countSuccess) succ=d.countSuccess;
    });
    var parts=[]; for(var t in counts) parts.push(counts[t]+t);
    parts.sort();
    if(p.modifier) parts.push('m'+p.modifier);
    if(p.dropLowest) parts.push('dl');
    if(p.dropHighest) parts.push('dh');
    if(expl) parts.push('x'+expl);
    if(clMin) parts.push('mn'+clMin);
    if(clMax) parts.push('mx'+clMax);
    if(succ) parts.push('s'+succ);
    return parts.join('|');
}

function findMatchingPreset() {
    if(cupDice.length===0 && modifier===0) return -1;
    var sig = getCupSignature();
    for(var i=0;i<presets.length;i++) {
        if(getPresetSignature(presets[i])===sig) return i;
    }
    return -1;
}

function updateFavState() {
    var match = findMatchingPreset();
    if(!editMode) activePresetIdx = match;

    // Star
    var star = document.getElementById('favStar');
    star.innerHTML = activePresetIdx >= 0 ? '\\u2605' : '\\u2606';
    star.style.color = activePresetIdx >= 0 ? '#fff' : '#ffa657';
    star.classList.toggle('fav-active', activePresetIdx >= 0);

    // Cup border
    document.getElementById('cup').classList.toggle('editing', editMode);

    // Preset label in cup
    var label = document.getElementById('cupPresetLabel');
    label.classList.toggle('editing', editMode && activePresetIdx >= 0);
    label.classList.remove('editing');
    if(activePresetIdx >= 0) {
        var name = presets[activePresetIdx].name;
        if(editMode) {
            label.onclick = null;
            label.innerHTML = '<span class="dr-fav-name-edit" onclick="renamePreset()">' + name + '</span>' +
                '<span class="dr-rename-hint">&larr; tap to rename</span>';
        } else {
            label.onclick = null;
            label.innerHTML = name + ' <button class="dr-edit-btn" onclick="event.stopPropagation();startEditMode()" title="Edit">\\u270E</button>';
        }
    } else {
        label.innerHTML = '';
        label.onclick = null;
    }

    // Float buttons in cup corners during edit mode
    var cup = document.getElementById('cup');
    var existingUndo = document.getElementById('undoFloat');
    var existingDone = document.getElementById('doneFloat');
    if(editMode) {
        if(!existingUndo) {
            var btn = document.createElement('button');
            btn.id = 'undoFloat';
            btn.className = 'dr-undo-float';
            btn.textContent = 'Undo';
            btn.onclick = undoEditMode;
            cup.appendChild(btn);
        }
        if(!existingDone) {
            var btn2 = document.createElement('button');
            btn2.id = 'doneFloat';
            btn2.className = 'dr-done-float';
            btn2.textContent = 'Done';
            btn2.onclick = saveEditMode;
            cup.appendChild(btn2);
        }
    } else {
        if(existingUndo) existingUndo.remove();
        if(existingDone) existingDone.remove();
    }

    // Remove old banner
    document.getElementById('editBanner').style.display = 'none';

    // Highlight active preset chip, dim others in edit mode
    renderPresets();
}

function renderPresets() {
    var el=document.getElementById('presets'),html='';
    presets.forEach(function(p,i) {
        var expr = buildGroupFormula(p);
        var cls = 'dr-preset-chip';
        if(i === activePresetIdx) cls += ' active';
        if(editMode && i !== activePresetIdx) cls += ' dimmed';
        html+='<div class="'+cls+'" onclick="loadPreset('+i+')">' +
            '<div class="dr-preset-name">'+p.name+'</div>' +
            '<div class="dr-preset-expr">'+expr+'</div></div>';
    });
    el.innerHTML=html;
}

function loadPreset(i) {
    if(editMode) return;
    var p=presets[i];
    // Load from group or legacy format
    cupGroup.children = JSON.parse(JSON.stringify(p.children || p.dice || []));
    cupGroup.modifier = p.modifier || 0;
    cupGroup.dropLowest = !!p.dropLowest;
    cupGroup.dropHighest = !!p.dropHighest;
    cupGroup.operation = p.operation || 'sum';
    cupGroup.modifiers = p.modifiers || {keep:null, clamp:null};
    cupGroup.repeat = p.repeat || 1;
    document.getElementById('dropBtn').classList.toggle('on', cupGroup.dropLowest);
    document.getElementById('dropHBtn').classList.toggle('on', cupGroup.dropHighest);
    activePresetIdx = i;
    updateCupDisplay();
}

function toggleFavorite() {
    if(editMode) return;
    if(activePresetIdx >= 0) {
        // Remove favorite — confirm first
        showConfirm('Remove "'+presets[activePresetIdx].name+'"?', function() {
            presets.splice(activePresetIdx, 1);
            activePresetIdx = -1;
            savePresetsToStorage();
            updateFavState();
        });
    } else {
        // Save as new favorite — must have dice
        if(cupDice.length===0) return;
        if(!PREMIUM && presets.length >= MAX_FREE_PRESETS) {
            showPremiumUpsell();
            return;
        }
        showInlineInput('Favorite name:', '', function(name) {
            if(!name) return;
            var preset = JSON.parse(JSON.stringify(cupGroup));
            preset.name = name;
            // Keep backward compat: also store as 'dice' for old format readers
            preset.dice = preset.children;
            presets.push(preset);
            if(presets.length>20) presets=presets.slice(-20);
            savePresetsToStorage();
            activePresetIdx = presets.length - 1;
            updateFavState();
        });
    }
}

function startEditMode() {
    if(activePresetIdx < 0) return;
    editMode = true;
    editOriginal = JSON.parse(JSON.stringify(presets[activePresetIdx]));
    updateFavState();
}

function saveEditMode() {
    if(activePresetIdx >= 0) {
        var updated = JSON.parse(JSON.stringify(cupGroup));
        updated.name = presets[activePresetIdx].name;
        updated.dice = updated.children; // backward compat
        presets[activePresetIdx] = updated;
        savePresetsToStorage();
    }
    editMode = false;
    editOriginal = null;
    updateFavState();
}

function undoEditMode() {
    if(editOriginal && activePresetIdx >= 0) {
        presets[activePresetIdx] = editOriginal;
        cupDice = JSON.parse(JSON.stringify(editOriginal.dice));
        modifier = editOriginal.modifier || 0;
        dropLowest = !!editOriginal.dropLowest;
        dropHighest = !!editOriginal.dropHighest;
        document.getElementById('dropBtn').classList.toggle('on',dropLowest);
        document.getElementById('dropHBtn').classList.toggle('on',dropHighest);
        savePresetsToStorage();
    }
    editMode = false;
    editOriginal = null;
    updateCupDisplay();
}

function renamePreset() {
    if(activePresetIdx < 0) return;
    showInlineInput('Rename favorite:', presets[activePresetIdx].name, function(name) {
    if(name) {
        presets[activePresetIdx].name = name;
        savePresetsToStorage();
        updateFavState();
    }
    });
}

// Shake
var shakeEnabled=true, lastShake=0;
function toggleShake() {
    shakeEnabled=!shakeEnabled;
    var btn = document.getElementById('shakeToggle');
    btn.classList.toggle('on',shakeEnabled);
    btn.classList.toggle('off',!shakeEnabled);
    localStorage.setItem('dice_roller_shake',shakeEnabled?'1':'0');
    if(shakeEnabled) startShakeListener(); else stopShakeListener();
}
function startShakeListener() {
    if(typeof DeviceMotionEvent==='undefined'){document.getElementById('shakeToggle').style.display='none';return;}
    if(typeof DeviceMotionEvent.requestPermission==='function'){
        DeviceMotionEvent.requestPermission().then(function(s){if(s==='granted')window.addEventListener('devicemotion',onShake);}).catch(function(){});
    } else window.addEventListener('devicemotion',onShake);
}
function stopShakeListener(){window.removeEventListener('devicemotion',onShake);}
function onShake(e){
    if(!shakeEnabled)return; var a=e.accelerationIncludingGravity; if(!a)return;
    var mag=Math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z),now=Date.now();
    if(mag>25&&now-lastShake>1000){lastShake=now;rollDice();}
}

// ===== Probability & Distribution Engine =====
function getDieMax(d) {
    if (d.type === 'dx') return d.sides || 6;
    return dieRanges[d.type] || 6;
}

function calcDistribution() {
    if (cupDice.length === 0) return null;
    var rollable = cupDice.filter(function(d) { return dieRanges[d.type] || d.type === 'dx' || d.type === 'df' || d.type === 'coin'; });
    if (rollable.length === 0) return null;

    // Check for count successes mode
    var countSuccess = 0;
    cupDice.forEach(function(d) { if (d.countSuccess) countSuccess = d.countSuccess; });

    if (countSuccess > 0) {
        // Per-die success probability (handles mixed dice + clamp)
        var probs = rollable.map(function(d) {
            var sides = getDieMax(d);
            var successes = 0;
            for (var v = 1; v <= sides; v++) {
                var cv = v;
                if (d.clampMin && cv < d.clampMin) cv = d.clampMin;
                if (d.clampMax && cv > d.clampMax) cv = d.clampMax;
                if (cv >= countSuccess) successes++;
            }
            return successes / sides;
        });
        // If all dice have same probability, use binomial
        var allSameP = probs.every(function(p){ return p === probs[0]; });
        if (allSameP) {
            var n = rollable.length;
            var p = probs[0];
            var dist = {};
            for (var k = 0; k <= n; k++) {
                dist[k] = binomial(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
            }
            return dist;
        }
        // Mixed probabilities: enumerate via convolution of Bernoulli distributions
        var dist = {};
        dist[probs[0] >= 0 ? 0 : 0] = 0; // init
        dist[0] = 1 - probs[0]; dist[1] = probs[0];
        for (var i = 1; i < probs.length; i++) {
            var newDist = {};
            for (var k in dist) {
                var ki = parseInt(k);
                newDist[ki] = (newDist[ki]||0) + dist[k] * (1 - probs[i]);
                newDist[ki+1] = (newDist[ki+1]||0) + dist[k] * probs[i];
            }
            dist = newDist;
        }
        return dist;
    }

    // Determine if keep/drop is needed
    var needKeep = dropLowest || dropHighest;
    cupDice.forEach(function(d) { if (d.keep) needKeep = true; });

    // Mixed dice with possible exploding — build per-die distributions and convolve
    var hasExploding = rollable.some(function(d) { return d.exploding; });
    var hasCoin = rollable.some(function(d) { return d.type === 'coin'; });
    var hasClamp = rollable.some(function(d) { return (d.clampMin && d.clampMin > 1) || d.clampMax; });
    var hasMixed = !rollable.every(function(d) { return getDieMax(d) === getDieMax(rollable[0]) && !!d.exploding === !!rollable[0].exploding; });
    if ((hasExploding || hasMixed || hasCoin || hasClamp) && rollable.length <= 20 && !needKeep) {
        function singleDieDist(d) {
            var sides = getDieMax(d);
            var sd = {};
            if (d.exploding) {
                for (var v=1; v<sides; v++) sd[v] = 1.0/sides;
                var pChain = 1.0/sides;
                for (var depth=1; depth<=3; depth++) {
                    for (var v=1; v<sides; v++) sd[sides*depth+v] = (sd[sides*depth+v]||0) + pChain/sides;
                    if (depth===3) sd[sides*(depth+1)] = (sd[sides*(depth+1)]||0) + pChain/sides;
                    pChain /= sides;
                }
            } else if (d.type === 'coin') {
                sd[0]=0.5; sd[1]=0.5;
            } else if (d.type === 'df') {
                sd['-1']=1/3; sd['0']=1/3; sd['1']=1/3;
            } else {
                for (var v=1; v<=sides; v++) sd[v] = 1.0/sides;
            }
            // Apply clamp: redistribute probabilities
            if (d.clampMin > 1 || d.clampMax) {
                var csd = {};
                for (var v in sd) {
                    var cv = parseInt(v);
                    if (d.clampMin && cv < d.clampMin) cv = d.clampMin;
                    if (d.clampMax && cv > d.clampMax) cv = d.clampMax;
                    csd[cv] = (csd[cv]||0) + sd[v];
                }
                sd = csd;
            }
            return sd;
        }
        function convolve(distA, distB) {
            var r = {};
            for (var a in distA) for (var b in distB) {
                var s = parseInt(a)+parseInt(b);
                r[s] = (r[s]||0) + distA[a]*distB[b];
            }
            return r;
        }
        var dist = singleDieDist(rollable[0]);
        for (var i=1; i<rollable.length; i++) dist = convolve(dist, singleDieDist(rollable[i]));
        if (modifier !== 0) {
            var shifted = {};
            for (var k in dist) shifted[parseInt(k)+modifier] = dist[k];
            dist = shifted;
        }
        return dist;
    }

    // Fate dice
    if (rollable[0].type === 'df') {
        // Convolve -1,0,+1 distributions
        var dist = {'-1': 1/3, '0': 1/3, '1': 1/3};
        for (var i = 1; i < rollable.length; i++) {
            var newDist = {};
            for (var existing in dist) {
                for (var face = -1; face <= 1; face++) {
                    var sum = parseInt(existing) + face;
                    newDist[sum] = (newDist[sum] || 0) + dist[existing] / 3;
                }
            }
            dist = newDist;
        }
        if (modifier !== 0) {
            var shifted = {};
            for (var k in dist) shifted[parseInt(k) + modifier] = dist[k];
            dist = shifted;
        }
        return dist;
    }

    // needKeep already defined above

    // Keep/drop enumeration — works for mixed dice too
    var enumTotal = 1;
    rollable.forEach(function(d) { enumTotal *= getDieMax(d); });
    if (needKeep && rollable.length > 1 && enumTotal <= 1000000 && !hasExploding) {
        var sidesArr = rollable.map(function(d) { return getDieMax(d); });
        var n = rollable.length;
        var dLo = dropLowest ? 1 : 0;
        var dHi = dropHighest ? 1 : 0;
        var keepCount = n - dLo - dHi;
        var keepMode = (dLo && dHi) ? 'mid' : dLo ? 'kh' : 'kl';

        // Check for explicit keep from dice properties
        cupDice.forEach(function(d) {
            if (d.keep) { keepMode = d.keep; keepCount = d.keepCount || 1; }
        });

        var dist = calcKeepDist(sidesArr, keepCount, keepMode);

        if (modifier !== 0) {
            var shifted = {};
            for (var k in dist) shifted[parseInt(k) + modifier] = dist[k];
            dist = shifted;
        }
        return dist;
    }

    // Monte Carlo fallback for keep/drop when enumeration too expensive
    if (needKeep && rollable.length > 1) {
        var dLo = dropLowest ? 1 : 0;
        var dHi = dropHighest ? 1 : 0;
        var keepCount = rollable.length - dLo - dHi;
        var keepMode = (dLo && dHi) ? 'mid' : dLo ? 'kh' : 'kl';
        cupDice.forEach(function(d) {
            if (d.keep) { keepMode = d.keep; keepCount = d.keepCount || 1; }
        });
        var trials = 200000;
        var counts = {};
        for (var t = 0; t < trials; t++) {
            var rolls = rollable.map(function(d) {
                var sides = getDieMax(d);
                var val = Math.floor(Math.random() * sides) + 1;
                if (d.exploding) {
                    var chain = 0;
                    while (val - chain === sides && chain < 3 * sides) {
                        var extra = Math.floor(Math.random() * sides) + 1;
                        val += extra;
                        chain += sides;
                    }
                }
                if (d.clampMin && val < d.clampMin) val = d.clampMin;
                if (d.clampMax && val > d.clampMax) val = d.clampMax;
                return val;
            });
            rolls.sort(function(a,b){return a-b;});
            var kept;
            if (keepMode === 'kh') kept = rolls.slice(rolls.length - keepCount);
            else if (keepMode === 'kl') kept = rolls.slice(0, keepCount);
            else kept = rolls.slice(dLo, rolls.length - dHi);
            var sum = kept.reduce(function(a,b){return a+b;}, 0) + (modifier || 0);
            counts[sum] = (counts[sum] || 0) + 1;
        }
        var dist = {};
        for (var k in counts) dist[k] = counts[k] / trials;
        return dist;
    }

    // Standard sum distribution via convolution (no keep/drop)
    var first = getDieMax(rollable[0]);
    var dist = {};
    for (var v = 1; v <= first; v++) dist[v] = 1.0 / first;

    for (var i = 1; i < rollable.length; i++) {
        var sides = getDieMax(rollable[i]);
        var newDist = {};
        for (var existing in dist) {
            for (var face = 1; face <= sides; face++) {
                var sum = parseInt(existing) + face;
                newDist[sum] = (newDist[sum] || 0) + dist[existing] / sides;
            }
        }
        dist = newDist;
    }

    if (modifier !== 0) {
        var shifted = {};
        for (var k in dist) shifted[parseInt(k) + modifier] = dist[k];
        dist = shifted;
    }

    return dist;
}

function calcKeepDist(sidesArr, keepCount, keepMode) {
    // Exact enumeration: iterate all outcomes for mixed dice, sort, keep top/bottom K
    var dist = {};
    var total = 1;
    sidesArr.forEach(function(s) { total *= s; });

    function enumerate(dice, dieIdx) {
        if (dieIdx === sidesArr.length) {
            var sorted = dice.slice().sort(function(a,b){return a-b;});
            var sum = 0;
            var lo = keepMode==='kh' ? sorted.length - keepCount : keepMode==='mid' ? 1 : 0;
            var hi = keepMode==='kl' ? keepCount : keepMode==='mid' ? sorted.length-1 : sorted.length;
            for (var i = lo; i < hi; i++) sum += sorted[i];
            dist[sum] = (dist[sum] || 0) + 1;
            return;
        }
        for (var face = 1; face <= sidesArr[dieIdx]; face++) {
            dice.push(face);
            enumerate(dice, dieIdx + 1);
            dice.pop();
        }
    }

    enumerate([], 0);

    // Normalize to probabilities
    for (var k in dist) dist[k] /= total;
    return dist;
}

function binomial(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    var c = 1;
    for (var i = 0; i < k; i++) { c = c * (n - i) / (i + 1); }
    return c;
}

function renderDistribution() {
    var chart = document.getElementById('distChart');
    var dist = calcDistribution();
    if (!dist) { chart.innerHTML = ''; return; }

    // Remove zero-probability entries
    var keys = Object.keys(dist).filter(function(k){return dist[k] > 0;}).map(Number).sort(function(a,b){return a-b;});
    if (keys.length === 0) { chart.innerHTML = ''; return; }

    // Calculate theoretical min/max from dice (not from sampled data)
    var rollable = cupDice.filter(function(d) { return dieRanges[d.type] || d.type === 'dx' || d.type === 'df' || d.type === 'coin'; });
    var countMode = rollable.some(function(d){return d.countSuccess;});
    var hasKeep = dropLowest || dropHighest || rollable.some(function(d){return d.keep;});
    if (countMode) {
        var trueMin = 0, trueMax = rollable.length;
    } else if (hasKeep && rollable.length > 1) {
        // With keep/drop: sort all dice mins/maxes
        var allMins = rollable.map(function(d){ return d.type==='df'?-1:d.type==='coin'?0:(d.clampMin||1); }).sort(function(a,b){return a-b;});
        var allMaxes = rollable.map(function(d){ return d.type==='df'?1:d.type==='coin'?1:(d.clampMax||getDieMax(d)); }).sort(function(a,b){return a-b;});
        var dLo = dropLowest ? 1 : 0, dHi = dropHighest ? 1 : 0;
        var trueMin = 0, trueMax = 0;
        for (var ki = dLo; ki < allMins.length - dHi; ki++) trueMin += allMins[ki];
        for (var ki = dLo; ki < allMaxes.length - dHi; ki++) trueMax += allMaxes[ki];
        trueMin += modifier; trueMax += modifier;
    } else {
        var trueMin = keys[0], trueMax = keys[keys.length-1];
    }

    // Bin if too many values (>80 bars won't fit)
    var maxBars = 80;
    if (keys.length > maxBars) {
        var binned = {};
        var binSize = Math.ceil(keys.length / maxBars);
        for (var bi = 0; bi < keys.length; bi += binSize) {
            var sum = 0;
            var binKey = keys[Math.min(bi + Math.floor(binSize/2), keys.length-1)];
            for (var bj = bi; bj < Math.min(bi+binSize, keys.length); bj++) sum += dist[keys[bj]];
            binned[binKey] = sum;
        }
        dist = binned;
        keys = Object.keys(dist).map(Number).sort(function(a,b){return a-b;});
    }

    var maxProb = 0;
    keys.forEach(function(k) { if (dist[k] > maxProb) maxProb = dist[k]; });

    var barW = Math.max(2, Math.min(8, Math.floor(260 / keys.length)));
    var minVal = trueMin, maxVal = trueMax;
    var midVal = keys[Math.floor(keys.length/2)];

    var hasExploding = cupDice.some(function(d){return d.exploding;});

    var html = '<div class="dr-dist-bars">';
    keys.forEach(function(k) {
        var h = Math.max(3, Math.round((dist[k] / maxProb) * 52));
        var pct = dist[k] / maxProb;
        var hue = Math.round(pct * 120);
        var barColor = 'hsl('+hue+',85%,50%)';
        html += '<div class="dr-dist-bar" data-val="'+k+'" style="height:'+h+'px;width:'+barW+'px;background:'+barColor+';--bar-color:'+barColor+'" title="'+k+': '+(dist[k]*100).toFixed(1)+'%"></div>';
    });
    html += '</div>';
    if (keys.length === 1) {
        html += '<div class="dr-dist-labels"><span></span><span>'+minVal+'</span><span></span></div>';
    } else {
        var maxLabel = hasExploding ? '\\u221e' : maxVal;
        var midLabel = keys.length > 2 ? midVal : '';
        html += '<div class="dr-dist-labels"><span>'+minVal+'</span><span>'+midLabel+'</span><span>'+maxLabel+'</span></div>';
    }
    chart.innerHTML = html;
}

function highlightDistValue(val) {
    var bars = document.querySelectorAll('.dr-dist-bar');
    if (!bars.length) return;
    var closestIdx = 0, closestDist = Infinity;
    bars.forEach(function(bar, i) {
        var d = Math.abs(parseInt(bar.dataset.val) - val);
        if (d < closestDist) { closestDist = d; closestIdx = i; }
    });
    // If val exceeds rightmost bar, highlight rightmost
    if (val > parseInt(bars[bars.length-1].dataset.val)) closestIdx = bars.length - 1;
    bars.forEach(function(bar, i) { bar.classList.toggle('highlight', i === closestIdx); });
}

function showProbability(total) {
    var dist = calcDistribution();
    if (!dist || typeof total !== 'number') { document.getElementById('prob').innerHTML = ''; return; }

    // P(X >= total)
    var pGte = 0;
    for (var k in dist) { if (parseInt(k) >= total) pGte += dist[k]; }
    var pct = (pGte * 100).toFixed(1);

    var label = pGte > 0.5 ? 'common' : pGte > 0.2 ? 'decent' : pGte > 0.05 ? 'lucky' : 'rare';
    var isLight = currentTheme === 'light';
    var color = pGte > 0.5 ? (isLight ? '#1a7f37' : '#7ee787') : pGte > 0.2 ? (isLight ? '#b35900' : '#ffa657') : pGte > 0.05 ? (isLight ? '#a3400a' : '#f0883e') : (isLight ? '#cf222e' : '#f85149');

    var countMode = cupDice.some(function(d){return d.countSuccess;});
    var suffix = countMode ? (total===1?'+ success':'+ successes') : ' or better';
    document.getElementById('prob').innerHTML = '<span style="color:'+color+'">'+pct+'%</span> chance of '+total+suffix+' <span style="color:'+color+'">('+label+')</span>';
    highlightDistValue(total);
}

var formulaTyping = false; // true when user is typing in formula box

function liveParseFormula() {
    var input = document.getElementById('formulaInput').value.trim();
    formulaTyping = true;
    if (!input) {
        cupDice = []; modifier = 0; dropLowest = false;
        document.getElementById('dropBtn').classList.remove('on');
        updateCupDisplay();
        return;
    }
    // Try parsing — if invalid, show red X in cup
    try {
        parseFormulaStr(input);
        document.getElementById('dropBtn').classList.toggle('on', dropLowest);
        updateCupDisplay();
    } catch(e) {
        // Invalid formula — show red X
        document.getElementById('cupStaging').innerHTML = '<span class="dr-cup-empty" style="color:#f85149;font-size:24px">\\u2716</span>';
        document.getElementById('cupSummary').textContent = 'Invalid formula';
        document.getElementById('distChart').innerHTML = '';
    }
    formulaTyping = false;
}

function buildGroupFormula(g) {
    // Build formula for a single group using :attr,attr syntax
    // Per-type attrs inline: 3d6:dl,!
    // Group attrs after (): (2d6 + 3d12):dl,!
    var dice = g.children || [];
    if (dice.length === 0 && !g.modifier) return '';

    // Count dice by type, track per-type modifiers
    var types = []; // ordered list of unique type keys
    var counts = {}, explCount = {}, specials = [];
    dice.forEach(function(d) {
        if (d.type==='adv') { specials.push('ADV'); return; }
        if (d.type==='dis') { specials.push('DIS'); return; }
        if (d.type==='coin') { specials.push('COIN'); return; }
        var k = d.type==='dx'?'d'+(d.sides||6):(d.type==='df'?'dF':d.type);
        if (!counts[k]) types.push(k);
        counts[k] = (counts[k]||0)+1;
        if (d.exploding) explCount[k] = (explCount[k]||0)+1;
    });

    // Check which modifiers are uniform across ALL dice vs per-type
    var totalDice = dice.length - specials.length;
    var explTotal = 0; for (var t in explCount) explTotal += explCount[t];
    var allExploding = explTotal === totalDice && totalDice > 0;
    var someExploding = explTotal > 0 && !allExploding;

    // Collect uniform clamp/success values
    var mnVal = 0, mxVal = 0, succVal = 0;
    dice.forEach(function(d) {
        if (d.clampMin > 1) mnVal = d.clampMin;
        if (d.clampMax) mxVal = d.clampMax;
        if (d.countSuccess) succVal = d.countSuccess;
    });

    // Build per-type dice tokens with inline :attrs where needed
    var diceParts = [];
    types.forEach(function(t) {
        var p = counts[t] > 1 ? counts[t] + t : t;
        // Per-type attrs (only if not all dice share the modifier)
        var attrs = [];
        if (someExploding && explCount[t] === counts[t]) attrs.push('!');
        if (attrs.length) p += ':' + attrs.join(',');
        diceParts.push(p);
    });
    diceParts = diceParts.concat(specials);

    // Flat modifier (+/-)
    var mod = g.modifier || 0;
    if (mod > 0) diceParts.push('+' + mod);
    else if (mod < 0) diceParts.push('' + mod);

    // Join dice expression
    var diceStr = '';
    diceParts.forEach(function(p, i) {
        if (i === 0) diceStr = p;
        else if (p.charAt(0) === '-' || p.charAt(0) === '+') diceStr += ' ' + p;
        else diceStr += ' + ' + p;
    });

    // Group-level attrs (uniform across all dice)
    var groupAttrs = [];
    if (allExploding) groupAttrs.push('!');
    if (g.dropLowest) groupAttrs.push('dl');
    if (g.dropHighest) groupAttrs.push('dh');
    if (mnVal) groupAttrs.push('min=' + mnVal);
    if (mxVal) groupAttrs.push('max=' + mxVal);
    if (succVal) groupAttrs.push('#>=' + succVal);

    // Combine: dice:groupAttrs or (dice):groupAttrs
    if (groupAttrs.length > 0 && diceStr) {
        var needParens = diceParts.length > 1 || mod;
        var expr = needParens ? '(' + diceStr + ')' : diceStr;
        return expr + ':' + groupAttrs.join(',');
    }
    return diceStr;
}

function syncFormulaFromCup() {
    if (document.activeElement === document.getElementById('formulaInput')) return;

    // Build per-group formulas
    var groupFormulas = [];
    cupGroups.forEach(function(g) {
        var f = buildGroupFormula(g);
        if (f) {
            if (g.repeat > 1) f = g.repeat + '\\u00d7(' + f + ')';
            groupFormulas.push(f);
        }
    });

    // Combine with root operation
    var formula = '';
    if (rootOperation === 'max') formula = 'max(' + groupFormulas.join(', ') + ')';
    else if (rootOperation === 'min') formula = 'min(' + groupFormulas.join(', ') + ')';
    else formula = groupFormulas.join(' + ');

    document.getElementById('formulaInput').value = formula;
}

function toggleFormulaHelp() {
    var el = document.getElementById('formulaHelp');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function showFormulaUpsell() {
    var el = document.getElementById('formulaHelp');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function showPremiumUpsell() {
    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:999;display:flex;align-items:center;justify-content:center';
    backdrop.onclick = function(e){ if(e.target===backdrop) backdrop.remove(); };
    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--surface);border:2px solid #ffa657;border-radius:16px;padding:24px;max-width:340px;width:90%;text-align:center';
    modal.innerHTML = '<div style="font-size:28px;margin-bottom:8px">\\u2728</div>' +
        '<div style="font-size:20px;font-weight:800;color:var(--text-bright);margin-bottom:4px">Go Premium</div>' +
        '<div style="color:var(--text-muted);font-size:14px;margin-bottom:16px">One-time purchase \\u2014 $4.99</div>' +
        '<div style="text-align:left;color:var(--text);font-size:14px;line-height:1.8">' +
        '\\u2705 Editable formula bar<br>' +
        '\\u2705 Multi-group dice (sum, max, min)<br>' +
        '\\u2705 Repeat rolls (6\\u00d74d6dl)<br>' +
        '\\u2705 Named variables (STR, DEX)<br>' +
        '\\u2705 Unlimited presets<br>' +
        '\\u2705 Game system packs<br>' +
        '\\u2705 Premium themes<br>' +
        '\\u2705 No ads</div>' +
        '<button onclick="this.closest(\\x27div[style]\\x27).parentElement.remove()" style="margin-top:16px;background:#ffa657;color:#000;border:none;border-radius:10px;padding:12px 32px;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit;width:100%">Coming Soon</button>' +
        '<button onclick="this.closest(\\x27div[style]\\x27).parentElement.remove()" style="margin-top:8px;background:none;border:none;color:var(--text-dim);font-size:13px;cursor:pointer;font-family:inherit">Not now</button>';
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
}

// ===== Formula Parser =====
function parseFormula() {
    var input = document.getElementById('formulaInput').value.trim();
    if (!input) return;
    parseFormulaStr(input);
    document.getElementById('dropBtn').classList.toggle('on', dropLowest);
    document.getElementById('formulaInput').value = '';
    updateCupDisplay();
}

function parseFormulaStr(input) {
    cupDice = [];
    modifier = 0;
    dropLowest = false;

    // Split on + and - (keeping the sign)
    var tokens = input.replace(/\\s/g, '').match(/[+-]?[^+-]+/g);
    if (!tokens) return;

    tokens.forEach(function(token) {
        var sign = 1;
        if (token.charAt(0) === '-') { sign = -1; token = token.substring(1); }
        else if (token.charAt(0) === '+') { token = token.substring(1); }

        // Fate dice: NdF
        if (/^(\\d+)?dF$/i.test(token)) {
            var fc = parseInt(token) || 1;
            for (var fi=0; fi<fc; fi++) cupDice.push({type:'df', id:Date.now()+fi});
            return;
        }

        // Full dice pattern: NdX with optional modifiers
        // Supports: 4d6dl, 3d20kh1, 4d6!, 6d6#>=5, 4d6r1
        var diceMatch = token.match(/^(\\d+)?d(\\d+)([-d][lh]|d1|kh\\d*|kl\\d*|!|r\\d+|#>=?\\d+)*$/i);
        if (diceMatch) {
            var count = parseInt(diceMatch[1]) || 1;
            var sides = parseInt(diceMatch[2]);
            var mods = token.substring(diceMatch[1] ? diceMatch[1].length : 0);
            mods = mods.substring(('d'+sides).length); // strip dN prefix

            var exploding = /!/.test(mods);
            var rerollMatch = mods.match(/r(\\d+)/);
            var reroll = rerollMatch ? parseInt(rerollMatch[1]) : 0;
            var khMatch = mods.match(/kh(\\d*)/);
            var klMatch = mods.match(/kl(\\d*)/);
            var keepMode = khMatch ? 'kh' : klMatch ? 'kl' : null;
            var keepCount = khMatch ? (parseInt(khMatch[1])||1) : klMatch ? (parseInt(klMatch[1])||1) : count;
            var countMatch = mods.match(/#(>=?)(\\d+)/);
            var countSuccess = 0;
            if (countMatch) {
                countSuccess = parseInt(countMatch[2]);
                if (countMatch[1] === '>') countSuccess += 1; // #>4 means >=5
            }

            if (/dl|d1|-l/i.test(mods)) { dropLowest = true; }
            if (/dh|-h/i.test(mods)) { dropHighest = true; }

            var dieType = 'd' + sides;
            if (!dieRanges[dieType]) dieType = 'dx';

            for (var i = 0; i < count; i++) {
                var die = {type: dieType, id: Date.now() + i};
                if (dieType === 'dx') die.sides = sides;
                if (exploding) die.exploding = true;
                if (reroll) die.reroll = reroll;
                if (keepMode) { die.keep = keepMode; die.keepCount = keepCount; }
                if (countSuccess) die.countSuccess = countSuccess;
                cupDice.push(die);
            }
        } else {
            // Plain number — treat as modifier
            var num = parseInt(token);
            if (!isNaN(num)) modifier += sign * num;
        }
    });
}

// ===== Themes =====
var THEMES = [
    {id:'dark',    name:'Dark',     free:true,  bg:'#0d1117', accent:'#58a6ff', surface:'#1a5a2a'},
    {id:'light',   name:'Light',    free:true,  bg:'#faf7f2', accent:'#b8860b', surface:'#6b2d2d'},
    {id:'midnight',name:'Midnight', free:false, bg:'#0a0e1a', accent:'#6366f1', surface:'#1a2850'},
    {id:'purple',  name:'Purple',   free:false, bg:'#13051e', accent:'#a855f7', surface:'#3a1858'},
    {id:'forest',  name:'Forest',   free:false, bg:'#0a1208', accent:'#22c55e', surface:'#1a4a20'},
    {id:'blood',   name:'Blood',    free:false, bg:'#120808', accent:'#ef4444', surface:'#5a1818'},
];
var currentTheme = 'dark';

function toggleThemePicker(e) {
    if(e) e.stopPropagation();
    var el = document.getElementById('themePicker');
    var btn = document.getElementById('themeBtn');
    var open = el.style.display === 'none';
    el.style.display = open ? 'block' : 'none';
    btn.classList.toggle('on', open);
    if (open) {
        renderThemeGrid();
        setTimeout(function() {
            document.addEventListener('click', closeThemePicker);
        }, 10);
    }
}
function closeThemePicker(e) {
    var picker = document.getElementById('themePicker');
    if (picker.contains(e.target)) return; // clicks inside picker are fine
    picker.style.display = 'none';
    document.getElementById('themeBtn').classList.remove('on');
    document.removeEventListener('click', closeThemePicker);
}

function renderThemeGrid() {
    var html = '';
    THEMES.forEach(function(t) {
        var isActive = currentTheme === t.id;
        var isLocked = !t.free && !PREMIUM;
        var cls = 'dr-theme-swatch' + (isActive ? ' active' : '') + (isLocked ? ' locked' : '');
        var onclick = isLocked ? '' : 'onclick="setTheme(&quot;'+t.id+'&quot;)"';
        var lock = isLocked ? '<span class="swatch-lock">🔒</span>' : '';
        html += '<div class="'+cls+'" style="background:'+t.bg+'" '+onclick+'>'+lock+
            '<div class="swatch-colors">'+
            '<div class="swatch-dot" style="background:'+t.accent+'"></div>'+
            '<div class="swatch-dot" style="background:'+t.surface+'"></div>'+
            '</div><div class="swatch-name" style="color:'+t.accent+'">'+t.name+'</div></div>';
    });
    document.getElementById('themeGrid').innerHTML = html;
}

function setTheme(id) {
    currentTheme = id;
    document.documentElement.setAttribute('data-theme', id === 'dark' ? '' : id);
    if (id === 'dark') document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('dice_roller_theme', id);
    renderThemeGrid();
}

function loadTheme() {
    var saved = localStorage.getItem('dice_roller_theme');
    if (saved) {
        var t = THEMES.find(function(t){return t.id===saved;});
        if (t && (t.free || PREMIUM)) { setTheme(saved); return; }
    }
    setTheme('dark');
}

function togglePremium() {
    var url = new URL(window.location);
    if (PREMIUM) { url.searchParams.delete('premium'); }
    else { url.searchParams.set('premium', '1'); }
    window.location.href = url.toString();
}
function updatePremiumBtn() {
    var btn = document.getElementById('premiumToggle');
    btn.textContent = PREMIUM ? 'PRO' : 'FREE';
    btn.classList.toggle('on', PREMIUM);
}

// Init
(function(){
    // v3 migration: reset to new defaults
    if(localStorage.getItem('dice_roller_v4')!=='1') {
        localStorage.removeItem('dice_roller_presets');
        localStorage.setItem('dice_roller_v4','1');
    }

    isMuted = true;
    shakeEnabled = false;
    loadHistory(); loadPresets();
    loadCupState();
    // In free mode, collapse multi-group to single group
    if (!PREMIUM && cupGroups.length > 1) {
        var merged = makeGroup('');
        cupGroups.forEach(function(g) {
            g.children.forEach(function(d) { merged.children.push(d); });
            merged.modifier += g.modifier;
            if (g.dropLowest) merged.dropLowest = true;
            if (g.dropHighest) merged.dropHighest = true;
        });
        cupGroups = [merged];
        activeGroupIdx = 0;
    }
    updateCupDisplay(); restoreLastRoll();
    document.getElementById('dropBtn').classList.toggle('on', dropLowest);
    document.getElementById('dropHBtn').classList.toggle('on', dropHighest);
    updatePremiumBtn();
    loadTheme();

    // Restore from bug report if ?restore=N
    var RESTORE_STATE = """ + (restore_state if restore_state else 'null') + """;
    if (RESTORE_STATE) {
        try {
            var s = typeof RESTORE_STATE === 'string' ? JSON.parse(RESTORE_STATE) : RESTORE_STATE;
            if (s.cupGroups) { cupGroups = s.cupGroups; activeGroupIdx = s.activeGroupIdx || 0; rootOperation = s.rootOperation || 'sum'; }
            if (s.presets) { presets = s.presets; savePresetsToStorage(); }
            if (s.currentTheme) setTheme(s.currentTheme);
            updateCupDisplay();
            document.getElementById('result').textContent = 'State restored from bug #' + new URLSearchParams(window.location.search).get('restore');
        } catch(e) { console.error('Restore failed:', e); }
    }
})();

// ===== Bug Reporter =====
function collectBugState() {
    return {
        cupGroups: cupGroups,
        activeGroupIdx: activeGroupIdx,
        rootOperation: rootOperation,
        presets: presets,
        currentTheme: currentTheme,
        premium: PREMIUM,
        lastRoll: localStorage.getItem('dice_roller_last_roll'),
        history: localStorage.getItem('dice_roller_history'),
        userAgent: navigator.userAgent,
        screen: {w: screen.width, h: screen.height, dpr: window.devicePixelRatio},
        url: window.location.href,
        timestamp: new Date().toISOString()
    };
}

function captureScreenshot(callback) {
    if (!window.html2canvas) {
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = function() { doCapture(callback); };
        s.onerror = function() { callback(null); };
        document.head.appendChild(s);
    } else { doCapture(callback); }
}
function doCapture(callback) {
    html2canvas(document.body, {scale: 0.5, logging: false}).then(function(canvas) {
        callback(canvas.toDataURL('image/png', 0.6));
    }).catch(function() { callback(null); });
}

function showBugReport() {
    var savedName = localStorage.getItem('dice_bug_reporter') || '';
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal" style="width:320px">' +
        '<div class="dr-modal-title">Report a Bug</div>' +
        '<input type="text" id="bugName" value="'+savedName+'" placeholder="Your name" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text-bright);padding:10px 12px;font-size:16px;font-family:inherit;outline:none;margin-bottom:8px">' +
        '<textarea id="bugDesc" placeholder="Describe the bug..." rows="4" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text-bright);padding:10px 12px;font-size:16px;font-family:inherit;outline:none;resize:vertical;margin-bottom:8px"></textarea>' +
        '<div id="bugStatus" style="font-size:13px;color:var(--text-muted);margin-bottom:8px"></div>' +
        '<div class="dr-modal-btns">' +
        '<button class="dr-modal-cancel" onclick="closeBugReport()">Cancel</button>' +
        '<button class="dr-modal-ok" id="bugSubmitBtn" onclick="submitBugReport()">Submit</button>' +
        '</div></div>';
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if(e.target===overlay) closeBugReport(); };
    window._bugOverlay = overlay;
    document.getElementById('bugName').focus();
}
function closeBugReport() {
    if(window._bugOverlay) { window._bugOverlay.remove(); window._bugOverlay=null; }
}
function submitBugReport() {
    var name = document.getElementById('bugName').value.trim();
    var desc = document.getElementById('bugDesc').value.trim();
    if(!name || !desc) { document.getElementById('bugStatus').textContent = 'Name and description required'; return; }
    localStorage.setItem('dice_bug_reporter', name);
    document.getElementById('bugSubmitBtn').disabled = true;
    document.getElementById('bugStatus').textContent = 'Capturing screenshot...';

    captureScreenshot(function(screenshot) {
        document.getElementById('bugStatus').textContent = 'Submitting...';
        var payload = {
            reporter: name,
            description: desc,
            screenshot: screenshot || '',
            app_state: collectBugState()
        };
        fetch('/dice/bug', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        }).then(function(r) { return r.json(); }).then(function(d) {
            if(d.ok) {
                document.getElementById('bugStatus').innerHTML = '<span style="color:#7ee787">Bug reported! Thank you.</span>';
                setTimeout(closeBugReport, 1500);
            } else {
                document.getElementById('bugStatus').textContent = 'Error: ' + (d.error || 'unknown');
                document.getElementById('bugSubmitBtn').disabled = false;
            }
        }).catch(function(e) {
            document.getElementById('bugStatus').textContent = 'Network error';
            document.getElementById('bugSubmitBtn').disabled = false;
        });
    });
}
</script>
</body>
</html>"""


def build_dice_history_page():
    """Build the roll history page at /dice/history."""
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<meta name="theme-color" content="#0d1117">
<title>Roll History</title>
<style>
:root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d; --border2: #21262d;
    --text: #c9d1d9; --text-bright: #e6edf3; --text-dim: #484f58; --text-muted: #8b949e;
    --accent: #58a6ff; --btn-bg: #161b22;
}
[data-theme="light"] {
    --bg: #faf7f2; --surface: #ffffff; --border: #d4c5a9; --border2: #e8dcc8;
    --text: #3d2b1f; --text-bright: #1c1208; --text-dim: #a09080; --text-muted: #7a6a58;
    --accent: #b8860b; --btn-bg: #f5f0e8;
}
[data-theme="midnight"] {
    --bg: #0a0e1a; --surface: #111827; --border: #1e2a4a; --border2: #162040;
    --text: #a5b4cf; --text-bright: #d1ddf0; --text-dim: #4a5578; --text-muted: #6b7da0;
    --accent: #6366f1; --btn-bg: #111827;
}
[data-theme="purple"] {
    --bg: #13051e; --surface: #1e0a30; --border: #3b1d5e; --border2: #2a1345;
    --text: #c4a8e0; --text-bright: #e8d5f5; --text-dim: #5a3d78; --text-muted: #8a6aad;
    --accent: #a855f7; --btn-bg: #1e0a30;
}
[data-theme="forest"] {
    --bg: #0a1208; --surface: #12201a; --border: #1e3a28; --border2: #162d20;
    --text: #a8c4a0; --text-bright: #d5e8d0; --text-dim: #3d5a38; --text-muted: #6a8a60;
    --accent: #22c55e; --btn-bg: #12201a;
}
[data-theme="blood"] {
    --bg: #120808; --surface: #1e0e0e; --border: #3a1818; --border2: #2d1212;
    --text: #c4a0a0; --text-bright: #e8d0d0; --text-dim: #5a3838; --text-muted: #8a6060;
    --accent: #ef4444; --btn-bg: #1e0e0e;
}
* { margin:0; padding:0; box-sizing:border-box; }
body { background:var(--bg); color:var(--text); min-height:100vh;
       font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif; }
.dr-header { display:flex; align-items:center; justify-content:space-between;
             padding:12px 16px; border-bottom:1px solid var(--border2); }
.dr-header h1 { font-size:18px; font-weight:700; color:var(--text-bright); }
a.dr-back { color:var(--accent); text-decoration:none; font-size:14px; font-weight:600; }
.dr-history-page { padding:16px; max-width:500px; margin:0 auto; }
.dr-history-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.dr-history-clear { background:none; border:1px solid var(--border); border-radius:8px;
                    color:var(--text-dim); padding:6px 12px; font-size:12px; cursor:pointer; font-family:inherit; }
.dr-history-clear:hover { color:#f85149; border-color:#f85149; }
.dr-history-entry { display:flex; justify-content:space-between; align-items:center;
                    padding:10px 14px; border-radius:10px; margin-bottom:6px;
                    background:var(--btn-bg); border:1px solid var(--border2); }
.dr-history-total { font-weight:700; color:var(--text-bright); font-size:18px;
                    font-family:'SF Mono',ui-monospace,monospace; min-width:45px; }
.dr-history-expr { color:var(--text-muted); font-size:13px; flex:1; text-align:center; }
.dr-history-time { color:var(--text-dim); font-size:11px; min-width:60px; text-align:right; }
.dr-history-empty { text-align:center; color:var(--border); padding:40px; font-size:15px; }
</style>
</head>
<body>
<script>
var t=localStorage.getItem('dice_roller_theme')||'dark';
document.body.setAttribute('data-theme',t);
document.querySelector('meta[name=theme-color]').content=getComputedStyle(document.body).getPropertyValue('--bg').trim();
</script>
<div class="dr-header">
    <a class="dr-back" href="/dice">&larr; Back</a>
    <h1>Roll History</h1>
    <div style="width:50px"></div>
</div>
<div class="dr-history-page">
    <div class="dr-history-header">
        <div></div>
        <button class="dr-history-clear" onclick="clearHistory()">Clear All</button>
    </div>
    <div id="historyList"></div>
</div>
<script>
function formatTimeAgo(ts) {
    var diff=(Date.now()-ts)/1000;
    if(diff<60) return 'just now';
    if(diff<3600) return Math.floor(diff/60)+'m ago';
    if(diff<86400) return Math.floor(diff/3600)+'h ago';
    return Math.floor(diff/86400)+'d ago';
}
function render() {
    var list=document.getElementById('historyList');
    var history=[];
    try{history=JSON.parse(localStorage.getItem('dice_roller_history')||'[]');}catch(e){}
    if(!history.length){list.innerHTML='<div class="dr-history-empty">No rolls yet</div>';return;}
    var html='';
    history.forEach(function(e){
        var favLabel = e.favName ? '<div style="font-size:10px;color:#ffa657;font-weight:600;">'+e.favName+'</div>' : '';
        html+='<div class="dr-history-entry"><span class="dr-history-total">'+e.total+'</span><span class="dr-history-expr">'+favLabel+e.expression+'</span><span class="dr-history-time">'+formatTimeAgo(e.timestamp)+'</span></div>';
    });
    list.innerHTML=html;
}
function clearHistory(){localStorage.removeItem('dice_roller_history');render();}
render();
</script>
</body>
</html>"""


def build_dice_bugs_page(reports):
    """Admin page listing all dice roller bug reports."""
    import html as html_mod
    rows = ""
    for r in reports:
        status_color = {"open": "#f85149", "investigating": "#f0883e", "fixed": "#7ee787", "wontfix": "#484f58"}.get(r["status"], "#8b949e")
        desc_preview = html_mod.escape(r["description"][:80]) + ("..." if len(r["description"]) > 80 else "")
        rows += f"""<a href="/dice/bugs/{r['id']}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;
            background:#161b22;border:1px solid #21262d;border-radius:10px;margin-bottom:6px;text-decoration:none;color:#c9d1d9">
            <span style="color:#484f58;font-weight:700;min-width:30px">#{r['id']}</span>
            <span style="flex:1">
                <div style="font-size:15px;font-weight:600;color:#e6edf3">{desc_preview}</div>
                <div style="font-size:12px;color:#8b949e;margin-top:2px">{html_mod.escape(r['reporter'])} &middot; {r['created_at']}</div>
            </span>
            <span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;background:{status_color}22;color:{status_color};text-transform:uppercase">{r['status']}</span>
        </a>"""

    if not rows:
        rows = '<div style="text-align:center;color:#484f58;padding:40px">No bug reports yet</div>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0d1117">
<title>Dice Vault Bugs</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ background:#0d1117; color:#c9d1d9; min-height:100vh;
       font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif; }}
.header {{ display:flex; align-items:center; justify-content:space-between;
           padding:12px 16px; border-bottom:1px solid #21262d; }}
.header h1 {{ font-size:18px; font-weight:700; color:#e6edf3; }}
a.back {{ color:#58a6ff; text-decoration:none; font-size:14px; font-weight:600; }}
.content {{ padding:16px; max-width:600px; margin:0 auto; }}
.count {{ font-size:13px; color:#8b949e; margin-bottom:12px; }}
</style>
</head>
<body>
<div class="header">
    <a class="back" href="/">&larr; Home</a>
    <h1>Dice Vault Bugs</h1>
    <a class="back" href="/dice">Dice &rarr;</a>
</div>
<div class="content">
    <div class="count">{len(reports)} report{'s' if len(reports) != 1 else ''}</div>
    {rows}
</div>
</body>
</html>"""


def build_dice_bug_detail_page(report):
    """Detail page for a single bug report."""
    import html as html_mod
    import json

    status_opts = ""
    for s in ["open", "investigating", "fixed", "wontfix"]:
        sel = " selected" if s == report["status"] else ""
        status_opts += f'<option value="{s}"{sel}>{s}</option>'

    screenshot_html = ""
    if report.get("screenshot"):
        screenshot_html = f'<img src="{report["screenshot"]}" style="width:100%;border-radius:8px;border:1px solid #21262d;margin-bottom:16px">'

    state_json = report.get("app_state", "{}")
    try:
        state_pretty = json.dumps(json.loads(state_json), indent=2)
    except Exception:
        state_pretty = state_json

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0d1117">
<title>Bug #{report['id']}</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ background:#0d1117; color:#c9d1d9; min-height:100vh;
       font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif; }}
.header {{ display:flex; align-items:center; justify-content:space-between;
           padding:12px 16px; border-bottom:1px solid #21262d; }}
.header h1 {{ font-size:18px; font-weight:700; color:#e6edf3; }}
a.back {{ color:#58a6ff; text-decoration:none; font-size:14px; font-weight:600; }}
.content {{ padding:16px; max-width:600px; margin:0 auto; }}
.section {{ background:#161b22; border:1px solid #21262d; border-radius:10px; padding:16px; margin-bottom:12px; }}
.label {{ font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#484f58; font-weight:700; margin-bottom:6px; }}
.desc {{ font-size:15px; line-height:1.5; white-space:pre-wrap; }}
.meta {{ font-size:13px; color:#8b949e; }}
select, textarea {{ width:100%; background:#0d1117; border:1px solid #30363d; border-radius:8px;
                    color:#e6edf3; padding:8px 12px; font-size:14px; font-family:inherit; outline:none; margin-bottom:8px; }}
select:focus, textarea:focus {{ border-color:#58a6ff; }}
.btn {{ padding:10px 20px; border-radius:10px; border:none; font-size:14px; font-weight:700;
        cursor:pointer; font-family:inherit; text-decoration:none; display:inline-block; }}
.btn-blue {{ background:#58a6ff; color:#fff; }}
.btn-green {{ background:#238636; color:#fff; }}
.btn-red {{ background:#da3633; color:#fff; }}
pre {{ background:#0d1117; border:1px solid #21262d; border-radius:8px; padding:12px;
       font-size:12px; overflow-x:auto; max-height:300px; overflow-y:auto; color:#8b949e; }}
</style>
</head>
<body>
<div class="header">
    <a class="back" href="/dice/bugs">&larr; All Bugs</a>
    <h1>Bug #{report['id']}</h1>
    <div></div>
</div>
<div class="content">
    <div class="section">
        <div class="label">Reporter</div>
        <div style="font-size:16px;font-weight:600;color:#e6edf3">{html_mod.escape(report['reporter'])}</div>
        <div class="meta" style="margin-top:4px">{report['created_at']}</div>
    </div>

    <div class="section">
        <div class="label">Description</div>
        <div class="desc">{html_mod.escape(report['description'])}</div>
    </div>

    {f'<div class="section"><div class="label">Screenshot</div>{screenshot_html}</div>' if screenshot_html else ''}

    <div class="section">
        <div class="label">Status</div>
        <select id="bugStatus">{status_opts}</select>
        <div class="label" style="margin-top:8px">Developer Notes</div>
        <textarea id="bugNotes" rows="3" placeholder="Add notes...">{html_mod.escape(report.get('notes', ''))}</textarea>
        <button class="btn btn-blue" onclick="updateStatus()">Save</button>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:12px">
        <a class="btn btn-green" href="/dice?restore={report['id']}">Reproduce</a>
    </div>

    <details>
        <summary style="cursor:pointer;color:#58a6ff;font-size:14px;font-weight:600;margin-bottom:8px">App State JSON</summary>
        <pre>{html_mod.escape(state_pretty)}</pre>
    </details>
</div>
<script>
function updateStatus() {{
    fetch('/dice/bugs/{report["id"]}/status', {{
        method: 'POST',
        headers: {{'Content-Type': 'application/json'}},
        body: JSON.stringify({{
            status: document.getElementById('bugStatus').value,
            notes: document.getElementById('bugNotes').value
        }})
    }}).then(function(r) {{ return r.json(); }}).then(function(d) {{
        if(d.ok) {{ window.location.reload(); }}
    }});
}}
</script>
</body>
</html>"""
