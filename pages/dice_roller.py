"""Dice Vault — dice rolling app for board games and RPGs.

Dark gaming theme with visual dice shapes and a prominent cup tray.
Free mode: tap-based single group, no formula bar, 5 preset limit.
Premium mode: formula bar, multi-group, unlimited presets, game packs.
"""

import json

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
<meta name="apple-mobile-web-app-title" content="Dice Vault">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0d1117">
<title>Dice Vault</title>
<style>
:root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d; --border2: #21262d;
    --text: #c9d1d9; --text-bright: #e6edf3; --text-dim: #484f58; --text-muted: #8b949e;
    --accent: #58a6ff; --accent2: #f0883e;
    --cup-border: #58a6ff; --btn-bg: #161b22; --felt-color: #1a5a2a;
    --grad-top: #161b24; --grad-bot: #080b10;
}
[data-theme="light"] {
    --bg: #f0e6d4; --surface: #ffffff; --border: #c8b898; --border2: #ddd0b8;
    --text: #3d2b1f; --text-bright: #1c1208; --text-dim: #a09080; --text-muted: #7a6a58;
    --accent: #b8860b; --accent2: #8b0000;
    --cup-border: #b8860b; --btn-bg: #ffffff; --felt-color: #6b2d2d;
    --grad-top: #f8f0e0; --grad-bot: #e4d8c0;
}
[data-theme="midnight"] {
    --bg: #0a0e1a; --surface: #111827; --border: #1e2a4a; --border2: #162040;
    --text: #a5b4cf; --text-bright: #d1ddf0; --text-dim: #4a5578; --text-muted: #6b7da0;
    --accent: #6366f1; --accent2: #f59e0b;
    --cup-border: #6366f1; --btn-bg: #111827; --felt-color: #1a2850;
    --grad-top: #0e1428; --grad-bot: #060810;
}
[data-theme="purple"] {
    --bg: #13051e; --surface: #1e0a30; --border: #3b1d5e; --border2: #2a1345;
    --text: #c4a8e0; --text-bright: #e8d5f5; --text-dim: #5a3d78; --text-muted: #8a6aad;
    --accent: #a855f7; --accent2: #ec4899;
    --cup-border: #a855f7; --btn-bg: #1e0a30; --felt-color: #3a1858;
    --grad-top: #1a0828; --grad-bot: #0a0312;
}
[data-theme="forest"] {
    --bg: #0a1208; --surface: #12201a; --border: #1e3a28; --border2: #162d20;
    --text: #a8c4a0; --text-bright: #d5e8d0; --text-dim: #3d5a38; --text-muted: #6a8a60;
    --accent: #22c55e; --accent2: #eab308;
    --cup-border: #22c55e; --btn-bg: #12201a; --felt-color: #1a4a20;
    --grad-top: #0e1a10; --grad-bot: #060a05;
}
[data-theme="blood"] {
    --bg: #120808; --surface: #1e0e0e; --border: #3a1818; --border2: #2d1212;
    --text: #c4a0a0; --text-bright: #e8d0d0; --text-dim: #5a3838; --text-muted: #8a6060;
    --accent: #ef4444; --accent2: #f59e0b;
    --cup-border: #ef4444; --btn-bg: #1e0e0e; --felt-color: #5a1818;
    --grad-top: #1a0c0c; --grad-bot: #0a0404;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
button, a, input { outline: none; -webkit-tap-highlight-color: transparent; }
html {
    background: linear-gradient(180deg, var(--grad-top) 0%, var(--bg) 30%, var(--bg) 70%, var(--grad-bot) 100%);
    background-attachment: fixed; min-height: 100vh;
    overscroll-behavior: none;
}
body {
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    -webkit-tap-highlight-color: transparent;
    max-width: 500px; margin: 0 auto;
    min-height: 100vh; display: flex; flex-direction: column;
    overscroll-behavior: none;
    touch-action: pan-y;
}

/* Header */
.dr-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid var(--border2); flex-shrink: 0;
    position: sticky; top: 0; z-index: 100;
    background: var(--bg, #0d1117);
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
    border-bottom: 1px solid var(--border2);
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
.dr-preset-expr {
    font-size: 12px; color: var(--text-muted); margin-top: 1px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 120px;
}
/* Pack tabs */
.dr-pack-tabs {
    display: flex; gap: 4px; margin-bottom: 6px; overflow-x: auto;
    padding-bottom: 2px; border-bottom: 1px solid var(--border);
    -webkit-overflow-scrolling: touch;
}
.dr-pack-tab {
    background: var(--btn-bg); color: #ffa657; border: 1px solid var(--border);
    border-bottom: none; border-radius: 6px 6px 0 0; padding: 4px 12px;
    font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
    flex-shrink: 0; font-family: inherit; transition: all 0.15s;
}
.dr-pack-tab:hover { border-color: #ffa657; }
.dr-pack-tab.active { background: #ffa657; color: #000; border-color: #ffa657; font-weight: 700; }
.dr-pack-tab.add-pack { border-style: dashed; border-bottom: none; }
.dr-pack-tab.add-pack:hover { background: #ffa65712; }
.dr-pack-upsell {
    text-align: center; margin-bottom: 6px;
    font-size: 11px; color: #ffa657; font-weight: 600;
    cursor: pointer; letter-spacing: 0.3px;
}
.dr-pack-upsell:hover { text-decoration: underline; }
/* Pack Browser */
.dr-pack-browser {
    display: none; position: fixed; inset: 0; background: var(--bg);
    z-index: 1000; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch;
}
.dr-pack-browser.open { display: block; }
.dr-pb-header {
    display: flex; align-items: center; gap: 12px; padding: 16px;
    border-bottom: 1px solid var(--border); position: sticky; top: 0;
    background: var(--bg); z-index: 1;
}
.dr-pb-back {
    background: none; border: none; color: var(--text-bright); font-size: 24px;
    cursor: pointer; padding: 0 4px; font-family: inherit;
}
.dr-pb-title { font-size: 20px; font-weight: 800; color: var(--text-bright); flex: 1; }
.dr-pb-search {
    width: 100%; background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; color: var(--text-bright); padding: 10px 14px;
    font-size: 15px; font-family: inherit; outline: none; margin: 0 24px 8px; width: calc(100% - 48px);
}
.dr-pb-search:focus { border-color: #58a6ff; }
.dr-pb-search::placeholder { color: var(--text-dim); }
.dr-pb-category {
    font-size: 13px; font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.5px;
    padding: 12px 24px 4px; margin-top: 4px;
}
.dr-pb-card {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 24px; border-bottom: 1px solid var(--border2);
    cursor: default;
}
.dr-pb-card-info { flex: 1; min-width: 0; }
.dr-pb-card-name { font-size: 15px; font-weight: 700; color: var(--text-bright); }
.dr-pb-card-desc {
    font-size: 12px; color: var(--text-muted); margin-top: 2px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
}
.dr-pb-card-meta { font-size: 11px; color: var(--text-dim); margin-top: 3px; }
.dr-pb-btn {
    flex-shrink: 0; border: none; border-radius: 8px; padding: 8px 16px;
    font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit;
    transition: all 0.15s;
}
.dr-pb-btn.install { background: #238636; color: #fff; }
.dr-pb-btn.install:hover { background: #2ea043; }
.dr-pb-btn.installed { background: var(--btn-bg); color: var(--text-muted); border: 1px solid var(--border); }
.dr-pb-btn.installed:hover { background: #da363450; color: #f85149; border-color: #f85149; }
.dr-pb-empty {
    text-align: center; color: var(--text-dim); padding: 40px 16px;
    font-size: 14px;
}
/* Toast */
.dr-toast {
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 20px; color: var(--text-bright); font-size: 14px; font-weight: 600;
    z-index: 1001; opacity: 0; transition: opacity 0.3s; pointer-events: none;
    font-family: inherit;
}
.dr-toast.show { opacity: 1; }
/* Game Room */
.dr-room-feed {
    border-top: 1px solid var(--border); padding: 8px 16px; max-height: 300px;
    overflow-y: auto; -webkit-overflow-scrolling: touch;
}
.dr-room-feed-card {
    display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border2);
    animation: dr-feed-in 0.3s ease;
}
@keyframes dr-feed-in { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
.dr-room-feed-bar { width: 4px; border-radius: 2px; flex-shrink: 0; }
.dr-room-feed-body { flex: 1; min-width: 0; }
.dr-room-feed-name { font-size: 11px; font-weight: 700; }
.dr-room-feed-expr { font-size: 12px; color: var(--text-muted); }
.dr-room-feed-result { font-size: 15px; font-weight: 700; color: var(--text-bright); margin-top: 1px; }
.dr-room-feed-time { font-size: 10px; color: var(--text-dim); white-space: nowrap; align-self: center; }
.dr-room-host-bar {
    display: flex; gap: 8px; padding: 6px 16px; border-top: 1px solid var(--border);
    background: var(--surface);
}
.dr-room-host-btn {
    background: var(--btn-bg); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text-muted); padding: 6px 12px; font-size: 12px; font-weight: 600;
    cursor: pointer; font-family: inherit;
}
.dr-room-host-btn:hover { border-color: var(--accent); color: var(--accent); }
.dr-room-dots { display: flex; gap: 4px; align-items: center; }
.dr-room-dot { width: 8px; height: 8px; border-radius: 50%; }
.dr-color-picker { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
.dr-color-swatch {
    width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
    border: 2px solid transparent; transition: border-color 0.15s;
}
.dr-color-swatch:hover { border-color: var(--text-bright); }
.dr-color-swatch.selected { border-color: #fff; box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px currentColor; }
.dr-color-swatch.taken { opacity: 0.2; pointer-events: none; }
/* Symbol mode face chips */
.dr-face-chips {
    display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
    padding: 8px 0; margin-top: 28px;
}
.dr-face-chip {
    background: var(--surface); border: 2px solid var(--accent, #ffa657);
    border-radius: 10px; padding: 8px 14px; font-size: 18px; font-weight: 700;
    color: var(--text-bright); font-family: inherit;
}
.dr-modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.dr-modal {
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px 20px; max-width: 300px; width: 90%;
}
.dr-modal-title {
    font-size: 16px; font-weight: 700; color: var(--text-bright); margin-bottom: 12px;
    text-align: center;
}

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
.dr-group-flow {
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center;
}
.dr-group-section {
    border: 2px solid rgba(255,255,255,0.25); border-radius: 12px;
    padding: 12px; margin: 4px; position: relative; cursor: pointer;
    transition: all 0.15s; z-index: 1;
    display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center;
    /* flex-shrink=1 + min-width=0 lets the group squeeze below its intrinsic
       content width so its inner dice can wrap; max-width=100% caps it at
       the parent so nothing ever overflows the cup. */
    flex: 0 1 auto; min-width: 0; max-width: 100%; box-sizing: border-box;
}
/* Transparent click blocker — prevents dice interaction in inactive groups */
.dr-group-section::after {
    content: ''; position: absolute; inset: -2px;
    border-radius: 12px; z-index: 3; pointer-events: auto;
}
.dr-group-section.active::after { display: none; }
/* Nested groups pop above parent's dim overlay */
.dr-group-section .dr-group-section { z-index: 5; }
.dr-group-section.active { border-color: #ffa657; box-shadow: 0 0 0 2px #ffa657, 0 0 4px rgba(255,166,87,0.6); }
.dr-group-section.active .dr-cup-tag { background: rgba(0,0,0,0.3); color: #fff; border-color: rgba(0,0,0,0.2); }
.dr-group-section .dr-group-dice {
    display: flex; flex-wrap: wrap; gap: 4px; justify-content: center;
    align-items: center;
}
.dr-group-section .dr-group-empty { color: var(--text-dim); font-size: 12px; font-style: italic; padding: 4px 8px; }
.dr-group-op {
    display: flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
    border: 2px solid var(--border); background: var(--btn-bg);
    font-size: 13px; font-weight: 800; color: var(--text-muted); cursor: pointer;
}
.dr-group-op:hover { border-color: var(--accent); color: var(--accent); }
.dr-add-group {
    position: absolute; right: 8px; bottom: 0;
}
.dr-add-group.below { position: static; text-align: right; margin-top: 4px; }
.dr-add-group button {
    background: var(--btn-bg); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text-muted); padding: 5px 10px; font-size: 11px; font-weight: 600;
    cursor: pointer; font-family: inherit;
}
.dr-add-group button:hover { border-color: var(--accent); color: var(--accent); }
.dr-group-repeat {
    text-align: center; font-size: 14px; color: #f0883e; font-weight: 600;
    margin-bottom: 2px;
}

/* Star button active — handled in .dr-save-preset.fav-active above */

/* Result */
.dr-result-area { text-align: center; padding: 20px 16px 12px; flex-shrink: 0; position: relative; border-bottom: 1px solid var(--border2); }
.dr-result { cursor: pointer; }
.dr-history-nav {
    position: absolute; top: 16px; left: 16px;
    display: flex; gap: 4px;
}
.dr-history-btn {
    background: var(--btn-bg); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text-muted); padding: 6px 9px; cursor: pointer;
    font-size: 11px; line-height: 1; font-family: inherit;
}
.dr-history-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.dr-history-btn:disabled { opacity: 0.3; cursor: default; }
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
    min-height: 64px; transition: color 0.3s, transform 0.1s;
}
.dr-result:active { transform: scale(0.92); }
.dr-result.dr-rolling { color: #f0883e; }
.dr-tap-hint {
    font-size: 12px; color: rgba(255,255,255,0.45); margin-top: 2px;
    transition: opacity 0.5s; opacity: 1; text-align: center;
}
.dr-tap-hint.hidden { opacity: 0; pointer-events: none; }
.dr-breakdown {
    font-size: 16px; color: var(--text-muted); margin-top: 4px;
    font-family: 'SF Mono', ui-monospace, monospace;
    min-height: 20px;
}
.dr-die-result {
    display: inline-block; background: var(--surface); border: 2px solid var(--border);
    border-radius: 4px; padding: 1px 5px; margin: 2px 1px;
    font-weight: 600; color: var(--text-bright); font-size: 15px;
}
.dr-breakdown-group {
    display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: center;
    gap: 2px; padding: 4px 6px; margin: 2px;
    border: 2px solid var(--border); border-radius: 10px;
    background: rgba(0,0,0,0.18);
}
.dr-breakdown-group .dr-breakdown-group {
    background: rgba(0,0,0,0.3);
}
.dr-breakdown-group .dr-breakdown-group .dr-breakdown-group {
    background: rgba(0,0,0,0.42);
}

/* Lock toggle — sits in the formula row */
/* Lock button: always highlighted, with a caret indicator */
.dr-lock-wrap {
    display: flex; flex-shrink: 0; cursor: pointer; position: relative;
    align-items: center; flex-direction: row;
    /* Fixed height so the down-caret doesn't push layout */
    height: 44px; width: 64px;
}
.dr-lock-btn {
    background: none; border: 1px solid #ffa657; border-radius: 50%;
    color: #ffa657; width: 44px; height: 44px;
    cursor: pointer; display: inline-flex; align-items: center;
    justify-content: center; flex-shrink: 0; transition: all 0.2s;
    position: relative; z-index: 1;
}
.dr-lock-btn:hover { background: #ffa65722; }
/* When cup is locked, block ALL interaction in staging + cup body,
   but keep the bottom bar (fav/roll/trash) active. !important
   overrides the pointer-events:auto on .dr-group-section::after. */
.dr-cup.cup-locked .dr-cup-staging,
.dr-cup.cup-locked .dr-cup-staging * { pointer-events: none !important; }
.dr-cup.cup-locked .dr-dist-wrap,
.dr-cup.cup-locked .dr-cup-summary { pointer-events: none !important; }
.dr-cup.cup-locked .dr-add-group { display: none !important; }
.dr-cup.cup-locked .dr-tap-hint { display: none !important; }
.dr-lock-caret {
    color: #ffa657; font-size: 28px; font-weight: 900; line-height: 1;
    user-select: none; position: absolute;
    /* Anchor at circle center, then orbit outward. The rotation carries
       the glyph around the circle edge so it always points outward. */
    left: 22px; top: 22px;
    transform-origin: 0 0;
    transition: transform 0.35s ease-in-out;
}
/* Locked: caret to the right, vertically centered with circle */
.dr-lock-wrap.locked .dr-lock-caret {
    transform: rotate(0deg) translate(24px, -15px);
}
/* Unlocked: caret below, horizontally centered with circle */
.dr-lock-wrap:not(.locked) .dr-lock-caret {
    transform: rotate(90deg) translate(24px, -15px);
}
/* Dice grid */
.dr-dice-grid {
    display: flex; flex-wrap: wrap; justify-content: center;
    gap: 8px; padding: 8px 16px;
    max-width: 500px; margin: 0 auto; width: 100%; flex-shrink: 0;
}
.dr-dice-grid.disabled, .dr-mod-rows.disabled { opacity: 0.3; pointer-events: none; }
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
.dr-mod-boxes {
    display: flex; justify-content: center; gap: 16px; margin-top: 6px;
    max-width: 500px; margin-left: auto; margin-right: auto;
}
.dr-mod-box {
    display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
    flex: 1 1 0; min-width: 0;
}
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
    /* Felt extends to the bottom of the viewport */
    flex: 1 0 auto; min-height: 0;
}
.dr-cup > * { position: relative; }
.dr-cup::before {
    content: ''; position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
    width: 40px; height: 4px; border-radius: 2px; background: var(--border);
}
.dr-cup-summary { display: none; }
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
.dr-group-badge {
    display: inline-flex; align-items: center; justify-content: center;
    align-self: center;
    font-size: 13px; font-weight: 800; color: #ffa657;
    background: #ffa65722; border: 2px solid #ffa657;
    border-radius: 6px; padding: 1px 4px; letter-spacing: 0;
    line-height: 1; white-space: nowrap;
    flex: 0 0 auto;
}
.dr-group-badge svg { width: 12px; height: 12px; }
.dr-cup-badges {
    display: grid;
    grid-template-rows: repeat(2, auto);
    grid-auto-flow: column;
    gap: 3px 4px;
    align-self: center;
    flex: 0 0 auto;
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
    display: flex; flex-direction: column;
    background: #0a0a0a; border-radius: 8px; margin: 4px auto;
    padding: 8px 8px 4px; max-width: 100%; overflow: hidden;
    /* Fixed width so the chart doesn't jump when binning changes
       the bar count. Bars are centered within. */
    width: 100%; box-sizing: border-box;
}
.dr-dist-bars {
    display: flex; align-items: flex-end; justify-content: center; gap: 1px; height: 52px;
}
.dr-dist-wrap { text-align: center; position: relative; }
.dr-dist-labels {
    display: flex; justify-content: space-between; padding: 3px 0 0;
    font-size: 15px; color: #c9d1d9; font-weight: 700;
    font-family: ui-monospace, monospace;
    gap: 8px;
}
.dr-dist-bar {
    flex: 1 1 0; min-width: 2px;
    border-radius: 2px 2px 0 0; transition: height 0.2s; filter: brightness(0.75);
}
.dr-dist-bar.highlight { filter: brightness(1); box-shadow: 0 0 6px 3px rgba(255,255,255,0.5), 0 0 14px 5px rgba(255,255,255,0.2); z-index: 1; position: relative; }

/* Formula input */
.dr-formula {
    display: flex; gap: 8px; padding: 4px 16px 8px;
    max-width: 500px; margin: 0 auto; width: 100%; flex-shrink: 0;
}
.dr-formula-wrap {
    flex: 1; position: relative; background: var(--surface); border-radius: 10px;
}
.dr-formula-input {
    width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    color: var(--text-bright); padding: 8px 12px; font-size: 16px; font-family: 'SF Mono', ui-monospace, monospace;
    outline: none;
}
.dr-formula-overlay {
    position: absolute; top: 0; left: 0; right: 0;
    padding: 8px 12px; font-size: 16px; font-family: 'SF Mono', ui-monospace, monospace;
    color: var(--text-bright); pointer-events: none;
    display: none; white-space: pre-wrap; word-break: keep-all; min-height: 100%;
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
    <h1 id="appTitle" ontouchstart="startTitleLongPress(event)" ontouchend="cancelTitleLongPress()" onmousedown="startTitleLongPress(event)" onmouseup="cancelTitleLongPress()" onmouseleave="cancelTitleLongPress()">Dice Vault</h1>
    <div class="dr-header-right">
        <button class="dr-header-btn" onclick="showRoomDialog()" title="Room" id="roomBtn">&#x1F465;</button>
        <button class="dr-header-btn" onclick="showBugReport()" title="Report Bug">&#x1F41B;</button>
        <button class="dr-header-btn" id="themeBtn" onclick="toggleThemePicker(event)" title="Theme">&#x1F3A8;</button>
        <a class="dr-header-btn dr-history-btn" href="/dice/history" title="History" id="historyLink">&#x1F552;</a>
        <button class="dr-header-btn off" onclick="alert('Sound — coming soon!')" title="Sound">&#x1F50A;</button>
        <button class="dr-header-btn off" onclick="alert('Shake to roll — coming soon!')" title="Shake" style="display:inline-flex;align-items:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="7" y="3" width="10" height="18" rx="2"/><line x1="4" y1="7" x2="2" y2="5"/><line x1="4" y1="12" x2="1" y2="12"/><line x1="4" y1="17" x2="2" y2="19"/><line x1="20" y1="7" x2="22" y2="5"/><line x1="20" y1="12" x2="23" y2="12"/><line x1="20" y1="17" x2="22" y2="19"/></svg></button>
    </div>
</div>

<div id="packTabs"></div>
<div class="dr-presets" id="presets"></div>
<div class="dr-theme-picker" id="themePicker" style="display:none">
    <div class="dr-theme-picker-title">Theme</div>
    <div class="dr-theme-grid" id="themeGrid"></div>
</div>

<div class="dr-result-area" id="resultArea">
    <div class="dr-history-nav">
        <button class="dr-history-btn" id="histPrevBtn" onclick="navigateHistory(1)" title="Previous roll">&#9664;</button>
        <button class="dr-history-btn" id="histNextBtn" onclick="navigateHistory(-1)" title="Next roll">&#9654;</button>
    </div>
    <div class="dr-result" id="result" onclick="handleResultClick()">Add dice to the cup</div>
    <div class="dr-breakdown" id="breakdown"></div>
    <div class="dr-prob" id="prob"></div>
    <div class="dr-tap-hint" id="tapHint">tap result to roll</div>
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
    <div class="dr-lock-wrap" id="lockWrap" onclick="toggleLock()">
        <button class="dr-lock-btn" id="lockBtn" title="Lock/unlock cup">
            <svg id="lockIcon" width="22" height="22" viewBox="0 -5 24 29" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V1a5 5 0 0 1 10 0"/></svg>
        </button>
        <span class="dr-lock-caret" id="lockCaret">&#x203A;</span>
    </div>
    <div class="dr-formula-wrap">
        <input class="dr-formula-input" id="formulaInput" type="text" placeholder="3d6+2d8+5" autocomplete="off" autocapitalize="off" spellcheck="false"
               readonly style="pointer-events:none;cursor:default">
        <div class="dr-formula-overlay" id="formulaOverlay"></div>
    </div>
    <button class="dr-formula-help" onclick="toggleFormulaHelp()">?</button>
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
    <div class="dr-lock-wrap" id="lockWrap" onclick="toggleLock()">
        <button class="dr-lock-btn" id="lockBtn" title="Lock/unlock cup">
            <svg id="lockIcon" width="22" height="22" viewBox="0 -5 24 29" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V1a5 5 0 0 1 10 0"/></svg>
        </button>
        <span class="dr-lock-caret" id="lockCaret">&#x203A;</span>
    </div>
    <div class="dr-formula-wrap">
    <input class="dr-formula-input" id="formulaInput" type="text" placeholder="3d6+2d8+5" readonly
           style="pointer-events:none;cursor:default">
    <div class="dr-formula-overlay" id="formulaOverlay"></div>
    </div>
    <button class="dr-formula-help" onclick="showFormulaUpsell()">?</button>
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
    <div class="dr-formula-row"><code>d{1,1,2,3,5}</code> Custom dice faces</div>
    <div class="dr-formula-row"><code>(4d6dl)+(2d8!)</code> Multi-group rolls</div>
    <div class="dr-formula-row">&#x1F3B2; Game Packs &mdash; Formula De &amp; more</div>
    <div class="dr-formula-row">&#x1F50D; Game Pack browser</div>
    <div class="dr-formula-row">&#x2B50; Unlimited presets</div>
    <div class="dr-formula-row">&#x1F3A8; Premium themes</div>
    <div class="dr-formula-row">&#x1F446; Tap-hold dice editing</div>
    <div style="text-align:center;margin-top:12px">
        <button onclick="showGameList()" style="background:none;border:1px solid var(--border);border-radius:10px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;color:#58a6ff;margin-bottom:8px;width:100%">See all supported games &#x203A;</button>
        <button onclick="showPremiumUpsell()" style="background:#ffa657;color:#000;border:none;border-radius:10px;padding:10px 24px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit">Unlock Premium</button>
    </div>
</div>
""") + """

<div class="dr-dice-grid" id="diceGrid">
""" + buttons_html + """
</div>

<div class="dr-mod-rows">
    <div class="dr-mod-row">
        <button class="dr-mod-btn" onclick="promptMod(-1)">-X</button>
        <button class="dr-mod-btn" onclick="adjustMod(-1)">-1</button>
        <button class="dr-mod-btn" onclick="adjustMod(+1)">+1</button>
        <button class="dr-mod-btn" onclick="promptMod(1)">+X</button>
    </div>
    <div class="dr-mod-boxes">
        <div class="dr-mod-box">
            <button class="dr-mod-btn dimmed" id="dropHBtn" onclick="toggleDropHighest()" title="Drop highest">Drop High</button>
            <button class="dr-mod-btn dimmed" id="capBtn" onclick="toggleCap()" title="Cap group total">Cap</button>
            <button class="dr-mod-btn dimmed" id="dropBtn" onclick="toggleDropLowest()" title="Drop lowest">Drop Low</button>
            <button class="dr-mod-btn dimmed" id="floorBtn" onclick="toggleFloor()" title="Floor group total">Floor</button>
        </div>
        <div class="dr-mod-box">
            <button class="dr-mod-btn dimmed" id="maxBtn" onclick="toggleMax()" title="Maximum value">Max</button>
            <button class="dr-mod-btn dr-mod-explode dimmed" id="explodeBtn" onclick="toggleExploding()" title="Exploding"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><polygon points="12,0.5 13.5,7.5 17,2 15,8.5 21,4.5 16,9.5 23.5,10 16,11.5 22,16 15.5,13 18,20 13,13.5 12,23.5 11,13.5 6,20 9,13 2,16 8,11.5 0.5,10 8,9.5 3,4.5 9,8.5 7,2 10.5,7.5"/></svg></button>
            <button class="dr-mod-btn dimmed" id="minBtn" onclick="toggleMin()" title="Minimum value">Min</button>
            <button class="dr-mod-btn dimmed" id="successBtn" onclick="toggleSuccess()" title="Count successes">Success</button>
        </div>
    </div>
</div>

<div class="dr-cup" id="cup" onclick="deselectGroups(event)">
    <div class="dr-cup-preset-label" id="cupPresetLabel"></div>
    <div id="editBanner" style="display:none"></div>
    <div class="dr-dist-wrap"><div class="dr-dist" id="distChart"></div><div id="addGroupSlot"></div></div>
    <div class="dr-tap-hint" id="cupHint">tap dice to remove from cup</div>
    <div class="dr-cup-summary" id="cupSummary"></div>
    <div class="dr-cup-staging" id="cupStaging" onclick="deselectGroups(event)">
        <span class="dr-cup-empty">Add dice to the cup</span>
    </div>
    <div class="dr-cup-tags" id="cupTags"></div>
    <div class="dr-cup-bottom">
        <button class="dr-cup-btn dr-save-preset" id="favStar" onclick="event.stopPropagation();toggleFavorite()">&#9734;</button>
        <button class="dr-cup-btn dr-roll-btn dimmed" id="rollBtn" onclick="event.stopPropagation();rollDice()">ROLL</button>
        <button class="dr-cup-btn dr-clear-cup" onclick="event.stopPropagation();clearCup()" title="Empty cup">&#x1F5D1;</button>
    </div>
</div>

<div id="roomBar" class="dr-room-host-bar" style="display:none">
    <span id="roomCodeLabel" style="font-size:14px;font-weight:800;color:var(--text-bright);font-family:SF Mono,ui-monospace,monospace;letter-spacing:3px;margin-right:8px"></span>
    <div id="roomHostControls" style="display:contents">
        <button class="dr-room-host-btn" onclick="roomCopyLink()">Copy Link</button>
        <button class="dr-room-host-btn" onclick="roomSharePack()">Share Pack</button>
        <button class="dr-room-host-btn" onclick="roomExportLog()">Export Log</button>
        <button class="dr-room-host-btn" onclick="roomClose()" style="color:#f85149;border-color:#f85149">Close Room</button>
    </div>
    <button id="roomLeaveBtn" class="dr-room-host-btn" onclick="confirmLeaveRoom()" style="display:none">Leave Room</button>
    <div style="flex:1"></div>
    <div class="dr-room-dots" id="roomDots"></div>
</div>
<div id="roomFeed" class="dr-room-feed" style="display:none"></div>

<div class="dr-toast" id="toast"></div>
<div class="dr-pack-browser" id="packBrowser">
    <div class="dr-pb-header">
        <button class="dr-pb-back" onclick="closePackBrowser()">&larr;</button>
        <div class="dr-pb-title">Game Packs</div>
    </div>
    <input class="dr-pb-search" id="pbSearch" type="text" placeholder="Search games..." oninput="renderPackBrowser()">
    <div id="pbList"></div>
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
    custom:{shape:'\\u2731', color:'#e8a0e8'},
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


// Toast notification
var toastTimer = null;
function showToast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { el.classList.remove('show'); }, 2000);
}

// Inline input modal (replaces OS prompt)
function esc(s) { var d=document.createElement('div');d.textContent=s;return d.innerHTML; }
function showInlineInput(title, defaultVal, callback) {
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal">' +
        '<div class="dr-modal-title">' + esc(title) + '</div>' +
        '<input type="text" id="drModalInput" value="' + esc(defaultVal||'') + '" autocomplete="off">' +
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
var _dxCount = 1;
function showDxInput(defaultVal, callback) {
    _dxCount = 1;
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal">' +
        '<div class="dr-modal-title">Custom Dice</div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
            '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:36px">' +
                '<button id="dxCountUp" class="dr-modal-cancel" style="width:36px;padding:2px 0;font-size:12px;line-height:1;border-radius:6px" onclick="changeDxCount(1)">\\u25B2</button>' +
                '<span id="dxCountLabel" style="font-size:15px;font-weight:700;color:var(--text-bright)">1\\u00d7</span>' +
                '<button id="dxCountDown" class="dr-modal-cancel" style="width:36px;padding:2px 0;font-size:12px;line-height:1;border-radius:6px;opacity:0.3;pointer-events:none" onclick="changeDxCount(-1)">\\u25BC</button>' +
            '</div>' +
            '<input type="text" id="drModalInput" value="' + esc(defaultVal||'') + '" autocomplete="off" style="flex:1" placeholder="7 or Heads,Tails">' +
        '</div>' +
        '<div style="color:var(--text-muted);font-size:13px;margin-bottom:10px;line-height:1.6">e.g. <code style="background:var(--bg);padding:2px 6px;border-radius:4px;color:var(--text-bright)">8</code> = d8, ' +
            '<code style="background:var(--bg);padding:2px 6px;border-radius:4px;color:var(--text-bright)">1,1,2,3</code> = custom faces, ' +
            '<code style="background:var(--bg);padding:2px 6px;border-radius:4px;color:var(--text-bright)">Heads, Tails</code> = word die</div>' +
        '<div class="dr-modal-btns">' +
        '<button class="dr-modal-cancel" onclick="closeModal()">Cancel</button>' +
        '<button class="dr-modal-ok" onclick="submitDxModal()">OK</button>' +
        '</div></div>';
    document.body.appendChild(overlay);
    var inp = document.getElementById('drModalInput');
    inp.focus(); inp.select();
    inp.onkeydown = function(e) { if(e.key==='Enter') submitDxModal(); if(e.key==='Escape') closeModal(); };
    overlay.onclick = function(e) { if(e.target===overlay) closeModal(); };
    window._modalCallback = callback;
    window._modalOverlay = overlay;
}
function changeDxCount(delta) {
    _dxCount = Math.max(1, _dxCount + delta);
    document.getElementById('dxCountLabel').textContent = _dxCount + '\\u00d7';
    var down = document.getElementById('dxCountDown');
    down.style.opacity = _dxCount <= 1 ? '0.3' : '';
    down.style.pointerEvents = _dxCount <= 1 ? 'none' : '';
}
function submitDxModal() {
    var val = document.getElementById('drModalInput').value;
    var cb = window._modalCallback;
    closeModal();
    if(cb) cb(_dxCount, val);
}
function closeModal() {
    if(window._modalOverlay) { window._modalOverlay.remove(); window._modalOverlay=null; }
    window._modalCallback = null;
}

function showConfirm(msg, onYes) {
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal">' +
        '<div class="dr-modal-title">'+esc(msg)+'</div>' +
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

// Testing: default Pro. Override with ?premium=0 or localStorage.
var PREMIUM = (function() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('premium') === '0') return false;
    if (localStorage.getItem('dice_vault_mode') === 'free') return false;
    return true;
})();
var MAX_FREE_PRESETS = 5;

// ===== Multi-Group Data Model =====
// The root cup contains one or more groups.
// Free mode: exactly one group. Premium: multiple groups with operators.

function makeGroup(label) {
    return {
        type: 'group', operation: 'sum',
        children: [],
        modifiers: {keep:null, clamp:null},
        modifier: 0, dropLowest: false, dropHighest: false, floor: 0, cap: 0,
        repeat: 1, label: label||'', color: '', id: Date.now()+Math.floor(Math.random()*1000)
    };
}

// Root state
var cupGroups = [makeGroup('')];  // array of groups
var rootOperation = 'sum';        // how groups combine: sum | max | min
var activeGroupIdx = 0;           // which group is selected for dice input

// Does this group contain any sub-groups (making it a container)?
function isContainer(g) {
    return !!(g && g.children && g.children.some(function(c){return c.type==='group';}));
}
// Collect all dice (recursive) from a group's children
function allDescendantDice(g) {
    var dice = [];
    if (!g || !g.children) return dice;
    g.children.forEach(function(c) {
        if (c.type === 'group') dice = dice.concat(allDescendantDice(c));
        else dice.push(c);
    });
    return dice;
}
// Flatten group tree to get ordered list of all groups (including nested)
function flatGroups() {
    var list = [];
    function walk(g) {
        list.push(g);
        if (g.children) g.children.forEach(function(c){ if(c.type==='group') walk(c); });
    }
    cupGroups.forEach(walk);
    return list;
}
function flatGroupIndex(id) {
    var list = flatGroups();
    for (var i=0; i<list.length; i++) { if(list[i].id === id) return i; }
    return 0;
}
// The "active group" is what dice buttons add to
function activeGroup() {
    var list = flatGroups();
    return list[activeGroupIdx] || cupGroups[0];
}

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
// Per-die selection: when set, modifier actions (explode/min/max/success)
// target this specific die instead of the active group. Set by long-pressing
// a die; cleared on deselect / roll (see tryAutoRejoin).
var selectedDieId = null;

var lastDxValue = '6'; // sticky default for the DX button prompt
// Exit history view (if in it) before any mutation. Must be defined early.
function exitHistoryView() {
    if (typeof historyViewIdx !== 'undefined' && historyViewIdx > -1 && typeof restoreLiveState === 'function') {
        restoreLiveState();
    }
}

// ===== Symbol Mode Detection =====
function isSymbolDie(d) {
    return d.type === 'custom' && d.faces && d.faces.some(function(f) { return typeof f === 'string'; });
}
function isSymbolMode() {
    return getAllDice().some(isSymbolDie);
}
var FACE_SYMBOLS = {
    // King of Tokyo
    'claw':'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle"><path d="M4 2C5 6 7 10 10 14c1 1.5.5 3 0 4-.5-1-3-5-6-10C3 6 3 4 4 2z"/><path d="M8 1C9 5 11 9 14 13c1 1.5.5 3 0 4-.5-1-3-5-6-10C7 5 7 3 8 1z"/><path d="M12 2C13 6 15 10 18 14c1 1.5.5 3 0 4-.5-1-3-5-6-10C11 6 11 4 12 2z"/><path d="M16 3C17 7 19 11 22 15c1 1.5.5 3 0 4-.5-1-3-5-6-10C15 7 15 5 16 3z"/></svg>', 'heart':'\\u2764\\uFE0F', 'bolt':'\\u26A1',
    // Zombie Dice
    'brain':'\\u{1F9E0}', 'shot':'\\u{1F4A5}', 'step':'<span style="filter:brightness(3)">\\u{1F463}</span>',
    // Slot Machine
    'cherry':'\\u{1F352}', 'cherries':'\\u{1F352}', 'lemon':'\\u{1F34B}', 'bell':'\\u{1F514}',
    '7':'<span style="color:#e33;font-weight:900;font-style:italic;font-size:1.1em;font-family:serif">7</span>',
    'bar':'<svg width="22" height="18" viewBox="0 0 22 18" style="vertical-align:middle"><rect x="1" y="1" width="20" height="4" rx="1" fill="#c8a84e"/><rect x="1" y="7" width="20" height="4" rx="1" fill="#c8a84e"/><rect x="1" y="13" width="20" height="4" rx="1" fill="#c8a84e"/></svg>',
    // Astronomy
    'sun':'\\u2600\\uFE0F', 'moon':'\\u{1F319}', 'full moon':'\\u{1F315}', 'crescent':'\\u{1F319}',
    'star':'\\u2B50', 'stars':'\\u{1F320}', 'shooting star':'\\u{1F320}',
    'comet':'\\u2604\\uFE0F', 'meteor':'\\u2604\\uFE0F',
    'planet':'\\u{1FA90}', 'saturn':'\\u{1FA90}', 'earth':'\\u{1F30D}', 'globe':'\\u{1F30D}',
    'mars':'\\u{1F534}', 'venus':'\\u{1F7E0}', 'jupiter':'\\u{1F7E4}', 'mercury':'\\u{1F7E1}',
    'neptune':'\\u{1F535}', 'uranus':'\\u{1F7E2}',
    'galaxy':'\\u{1F30C}', 'milky way':'\\u{1F30C}', 'nebula':'\\u{1F30C}',
    'eclipse':'\\u{1F311}', 'orbit':'\\u{1F4AB}', 'constellation':'\\u2728',
    'rocket':'\\u{1F680}', 'satellite':'\\u{1F6F0}\\uFE0F', 'telescope':'\\u{1F52D}',
    'astronaut':'\\u{1F9D1}\\u200D\\u{1F680}', 'alien':'\\u{1F47D}', 'ufo':'\\u{1F6F8}',
    'asteroid':'\\u{1FAA8}', 'black hole':'\\u{1F573}\\uFE0F', 'supernova':'\\u{1F4A5}',
    'void':'\\u2B1B', 'nova':'\\u{1F4A5}', 'pulsar':'\\u{1F4AB}',
    // Common
    'sword':'\\u2694\\uFE0F', 'shield':'\\u{1F6E1}\\uFE0F', 'skull':'\\u{1F480}',
    'fire':'\\u{1F525}', 'hit':'\\u{1F3AF}',
    'miss':'\\u274C', 'blank':'<span style="opacity:0.15">\\u2014</span>',
    'heads':'\\u{1FA99}', 'tails':'\\u{1FA99}',
    // More common
    'crown':'\\u{1F451}', 'gem':'\\u{1F48E}', 'diamond':'\\u{1F48E}',
    'lightning':'\\u26A1', 'thunder':'\\u26A1', 'arrow':'\\u{1F3F9}', 'bow':'\\u{1F3F9}',
    'axe':'\\u{1FA93}', 'dagger':'\\u{1F5E1}\\uFE0F', 'bomb':'\\u{1F4A3}',
    'poison':'\\u2620\\uFE0F', 'potion':'\\u{1F9EA}', 'magic':'\\u2728', 'spell':'\\u2728',
    'dragon':'\\u{1F409}', 'snake':'\\u{1F40D}', 'wolf':'\\u{1F43A}', 'eagle':'\\u{1F985}',
    'eye':'\\u{1F441}\\uFE0F', 'hand':'\\u270B', 'fist':'\\u270A', 'thumbs up':'\\u{1F44D}',
    'gold':'\\u{1FA99}', 'coin':'\\u{1FA99}', 'treasure':'\\u{1F4B0}', 'money':'\\u{1F4B0}',
    'key':'\\u{1F511}', 'lock':'\\u{1F512}', 'door':'\\u{1F6AA}', 'chest':'\\u{1F4E6}',
    'heal':'\\u{1F49A}', 'damage':'\\u{1F4A2}', 'block':'\\u{1F6E1}\\uFE0F', 'dodge':'\\u{1F4A8}',
    'critical':'\\u{1F4A5}', 'fumble':'\\u274C', 'success':'\\u2705', 'failure':'\\u274C',
    'yes':'\\u2705', 'no':'\\u274C', 'maybe':'\\u{1F914}',
    'win':'\\u{1F3C6}', 'lose':'\\u{1F4A9}', 'draw':'\\u{1F91D}',
    'up':'\\u2B06\\uFE0F', 'down':'\\u2B07\\uFE0F', 'left':'\\u2B05\\uFE0F', 'right':'\\u27A1\\uFE0F',
    'north':'\\u2B06\\uFE0F', 'south':'\\u2B07\\uFE0F', 'east':'\\u27A1\\uFE0F', 'west':'\\u2B05\\uFE0F',
    // Colors
    'red':'\\u{1F534}', 'blue':'\\u{1F535}', 'green':'\\u{1F7E2}', 'yellow':'\\u{1F7E1}',
    'orange':'\\u{1F7E0}', 'purple':'\\u{1F7E3}', 'brown':'\\u{1F7E4}', 'black':'\\u26AB',
    'white':'\\u26AA', 'pink':'\\u{1F7E3}',
};
function faceToDisplay(face) {
    var sym = FACE_SYMBOLS[face.toLowerCase()];
    if (sym) return '<span title="' + esc(face) + '">' + sym + '</span>';
    return esc(face);
}

function addToCup(type) {
    if (cupLocked) return;
    exitHistoryView();
    // Check selected die before clearing selection — used to preload DX input
    var selDie = null;
    if (type === 'dx') {
        if (selectedDieId != null) {
            var r = findDieById(selectedDieId);
            if (r) selDie = r.die;
        }
        // Fallback: if no selection but cup has custom/dx dice, use the first one
        if (!selDie) {
            var allD = getAllDice();
            for (var di = 0; di < allD.length; di++) {
                if (allD[di].type === 'custom' && allD[di].faces) { selDie = allD[di]; break; }
                if (allD[di].type === 'dx' && allD[di].sides) { selDie = allD[di]; break; }
            }
        }
    }
    // Adding dice clears any single-die selection
    tryAutoRejoin();
    selectedDieId = null;
    var g = activeGroup();
    if (isContainer(g)) return; // Container groups can't receive dice directly
    function makeDie(t, extras) {
        return {type:t, id:Date.now()+(extras||0)};
    }
    if (type === 'dfate') {
        if (isSymbolMode()) { showToast('Clear cup to add standard dice'); return; }
        cupDice.push(makeDie('df'));
    }
    else if (type === 'dx') {
        // Preload from selected die if it's a dx or custom die
        var dxDefault = lastDxValue || '6';
        if (selDie) {
            if (selDie.type === 'custom' && selDie.faces) {
                dxDefault = selDie.faces.join(', ');
            } else if (selDie.type === 'dx' && selDie.sides) {
                dxDefault = String(selDie.sides);
            }
        }
        showDxInput(dxDefault, function(count, v) {
            if (!v) return;
            var val = v.trim();
            lastDxValue = val;
            if (val.indexOf(',') >= 0) {
                // Comma-separated: check if any face is non-numeric → symbol die
                var rawFaces = val.split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });
                if (rawFaces.length < 2) return;
                var hasWords = rawFaces.some(function(s){ return isNaN(Number(s)); });
                if (hasWords) {
                    if (getAllDice().length > 0 && !isSymbolMode()) {
                        showToast('Clear cup to add symbol dice');
                        return;
                    }
                    for (var ci = 0; ci < count; ci++) { var d = makeDie('custom', ci); d.faces = rawFaces.slice(); cupDice.push(d); }
                } else {
                    if (isSymbolMode()) { showToast('Clear cup to add numeric dice'); return; }
                    var faces = rawFaces.map(function(s){ return parseInt(s); }).filter(function(n){ return !isNaN(n); });
                    if (faces.length < 2) return;
                    for (var ci = 0; ci < count; ci++) { var d = makeDie('custom', ci); d.faces = faces.slice(); cupDice.push(d); }
                }
            } else {
                if (isSymbolMode()) { showToast('Clear cup to add numeric dice'); return; }
                var sides = parseInt(val);
                if (!sides || sides < 2) return;
                for (var ci = 0; ci < count; ci++) { var d = makeDie('dx', ci); d.sides = sides; cupDice.push(d); }
            }
            updateCupDisplay();
        });
        return;
    }
    else {
        // Standard die (d4, d6, d8, etc.)
        if (isSymbolMode()) { showToast('Clear cup to add standard dice'); return; }
        cupDice.push(makeDie(type));
    }
    updateCupDisplay();
}

function removeFromCup(idx) {
    if (cupLocked) return;
    exitHistoryView();
    // Note: the "click the selected die to deselect instead of remove"
    // gesture is now handled in handleDieClick, before selectGroup gets
    // a chance to clear the selection. removeFromCup is strictly a data
    // mutation.
    cupDice.splice(idx,1); closePopup();
    // Auto-remove empty group if there are other groups. Walks the tree
    // recursively so deeply-nested empty groups also get cleaned up, and
    // empty container groups (which lose their last dice-holding sub-group)
    // bubble up and are removed too.
    if (PREMIUM && flatGroups().length > 1) {
        var ag = activeGroup();
        function pruneEmpty(groups, target) {
            // Remove target from groups[] if present; also recurse into each
            // group's children and recursively prune. After pruning children,
            // if a group is now completely empty (no children, no modifiers),
            // we let its parent remove it on the way up.
            return groups.filter(function(g) {
                if (g === target) return false;
                if (g.children && g.children.length) {
                    g.children = pruneEmpty(g.children, target);
                    // Also remove any sub-group that's become empty
                    g.children = g.children.filter(function(c) {
                        if (c.type !== 'group') return true;
                        if (c.children && c.children.length > 0) return true;
                        return false;
                    });
                }
                return true;
            });
        }
        if (ag.children.length === 0) {
            cupGroups = pruneEmpty(cupGroups, ag);
            if (cupGroups.length === 0) cupGroups = [makeGroup('')];
            var allFlat = flatGroups();
            if (activeGroupIdx >= allFlat.length) activeGroupIdx = Math.max(0, allFlat.length - 1);
        }
    }
    updateCupDisplay();
}
function adjustMod(n) { exitHistoryView(); modifier += n; updateCupDisplay(); }
function clearCup() {
    exitHistoryView();
    if(editMode) { undoEditMode(); }
    cupDice = []; modifier = 0; dropLowest = false; dropHighest = false;
    cupGroups = [makeGroup('')]; activeGroupIdx = 0; rootOperation = 'sum';
    selectedDieId = null;
    activePresetIdx = -1; editMode = false; editOriginal = null;
    document.getElementById('dropBtn').classList.remove('on');
    document.getElementById('dropHBtn').classList.remove('on');
    var fInp = document.getElementById('formulaInput');
    fInp.value = '';
    fInp.style.color = ''; fInp.style.background = ''; fInp.style.height = '';
    var fOvr = document.getElementById('formulaOverlay');
    if (fOvr) { fOvr.innerHTML = ''; fOvr.style.display = 'none'; }
    updateCupDisplay();
}

// ===== Multi-Group Management (Premium) =====
function addGroup() {
    if(!PREMIUM || cupLocked) return;
    exitHistoryView();
    var allGroups = flatGroups();
    var newG = makeGroup('');
    if (allGroups.length <= 1 || activeGroupIdx < 0) {
        // Add as sibling at root level
        cupGroups.push(newG);
    } else {
        // Add sub-group inside selected group
        var parent = activeGroup();
        // If parent has dice, wrap them into a sub-group first. ALL modifiers
        // move onto the wrapping group so the newly-empty container starts clean.
        var existingDice = parent.children.filter(function(c){return c.type!=='group';});
        if (existingDice.length > 0) {
            var wrapG = makeGroup('');
            wrapG.children = existingDice;
            wrapG.modifier = parent.modifier || 0;
            wrapG.dropLowest = parent.dropLowest || 0;
            wrapG.dropHighest = parent.dropHighest || 0;
            wrapG.floor = parent.floor || 0;
            wrapG.cap = parent.cap || 0;
            if (parent.exploding) wrapG.exploding = true;
            if (parent.clampMin && parent.clampMin > 1) wrapG.clampMin = parent.clampMin;
            if (parent.clampMax) wrapG.clampMax = parent.clampMax;
            if (parent.countSuccess) wrapG.countSuccess = parent.countSuccess;
            // Replace parent's children: remove dice, add wrapped group + new group
            parent.children = [wrapG, newG];
            parent.modifier = 0;
            parent.dropLowest = 0;
            parent.dropHighest = 0;
            parent.floor = 0;
            parent.cap = 0;
            parent.exploding = false;
            delete parent.clampMin;
            delete parent.clampMax;
            delete parent.countSuccess;
        } else {
            parent.children.push(newG);
        }
    }
    activeGroupIdx = flatGroupIndex(newG.id);
    selectedDieId = null;
    updateCupDisplay();
}
function deselectGroups(e) {
    if (cupLocked) return;
    // Groups stop propagation, so any click reaching here is a felt click
    exitHistoryView();
    activeGroupIdx = -1;
    selectedDieId = null;
    tryAutoRejoin();
    updateCupDisplay();
}
function removeGroup(idx) {
    if(cupGroups.length <= 1) return;
    cupGroups.splice(idx, 1);
    // Recompute activeGroupIdx against the new flat ordering; clear any
    // die selection (the die may have belonged to the removed subtree).
    var flatLen = flatGroups().length;
    if (activeGroupIdx >= flatLen) activeGroupIdx = Math.max(0, flatLen - 1);
    selectedDieId = null;
    updateCupDisplay();
}
function selectGroup(idx) {
    if (cupLocked) return;
    exitHistoryView();
    // Selecting any group clears any single-die selection — focus moves from
    // the die to the group (or to a different group). The one exception
    // ("click selected die to toggle off without removing") is handled in
    // handleDieClick BEFORE calling selectGroup.
    tryAutoRejoin();
    selectedDieId = null;
    activeGroupIdx = idx;
    document.getElementById('dropBtn').classList.toggle('on', activeGroup().dropLowest);
    document.getElementById('dropHBtn').classList.toggle('on', activeGroup().dropHighest);
    updateCupDisplay();
}
function toggleExploding() {
    exitHistoryView();
    // If a single die is selected, toggle it on that die
    if (selectedDieId != null) {
        var r = findDieById(selectedDieId);
        if (r) {
            r.die.exploding = !r.die.exploding;
            document.getElementById('explodeBtn').classList.toggle('on', !!r.die.exploding);
            updateCupDisplay();
            return;
        }
    }
    var g = activeGroup();
    if (allDescendantDice(g).length === 0) return;
    g.exploding = !g.exploding;
    document.getElementById('explodeBtn').classList.toggle('on', !!g.exploding);
    updateCupDisplay();
}
function cycleRootOp() {
    exitHistoryView();
    rootOperation = rootOperation === 'sum' ? 'minus' : 'sum';
    updateCupDisplay();
}
function setGroupRepeat(gIdx) {
    showInlineInput('Repeat how many times?', cupGroups[gIdx].repeat, function(v) {
        var n = parseInt(v);
        if(n && n >= 1 && n <= 20) { cupGroups[gIdx].repeat = n; updateCupDisplay(); }
    });
}
function toggleDropLowest() {
    exitHistoryView();
    var g = activeGroup();
    if (allDescendantDice(g).length === 0) return;
    if (g.dropLowest) { g.dropLowest = 0; updateCupDisplay(); return; }
    showInlineInput('Drop how many lowest?', '1', function(val) {
        var c = parseInt(val);
        if (!c || c < 1) return;
        activeGroup().dropLowest = c;
        updateCupDisplay();
    });
}
function toggleDropHighest() {
    exitHistoryView();
    var g = activeGroup();
    if (allDescendantDice(g).length === 0) return;
    if (g.dropHighest) { g.dropHighest = 0; updateCupDisplay(); return; }
    showInlineInput('Drop how many highest?', '1', function(val) {
        var c = parseInt(val);
        if (!c || c < 1) return;
        activeGroup().dropHighest = c;
        updateCupDisplay();
    });
}
function toggleFloor() {
    exitHistoryView();
    var g = activeGroup();
    if (allDescendantDice(g).length === 0) return;
    if (g.floor) { g.floor = 0; updateCupDisplay(); return; }
    showInlineInput('Floor group total at:', '', function(val) {
        var v = parseInt(val);
        if (v === undefined || v === null || isNaN(v)) return;
        if (g.cap && v > g.cap) {
            showConfirm('Floor must be \\u2264 Cap (' + g.cap + ')', function(){}); return;
        }
        activeGroup().floor = v;
        updateCupDisplay();
    });
}
function toggleCap() {
    exitHistoryView();
    var g = activeGroup();
    if (allDescendantDice(g).length === 0) return;
    if (g.cap) { g.cap = 0; updateCupDisplay(); return; }
    showInlineInput('Cap group total at:', '', function(val) {
        var v = parseInt(val);
        if (v === undefined || v === null || isNaN(v)) return;
        if (g.floor && v < g.floor) {
            showConfirm('Cap must be \\u2265 Floor (' + g.floor + ')', function(){}); return;
        }
        activeGroup().cap = v;
        updateCupDisplay();
    });
}
// Returns the target object for modifier toggles: the selected die if any,
// else the active group. Both have clampMin/clampMax/countSuccess fields.
function modTarget() {
    if (selectedDieId != null) {
        var r = findDieById(selectedDieId);
        if (r) return r.die;
    }
    return activeGroup();
}
function toggleMin() {
    exitHistoryView();
    var t = modTarget();
    // Only gate on dice count when targeting a group
    if (!t || (selectedDieId == null && allDescendantDice(t).length === 0)) return;
    if (t.clampMin && t.clampMin > 1) {
        delete t.clampMin;
        updateCupDisplay();
    } else {
        showInlineInput('Minimum die value?', '', function(val) {
            if (!val) return;
            var mn = parseInt(val);
            if (!mn || mn < 1) return;
            if (t.clampMax && mn >= t.clampMax) {
                showConfirm('Min must be less than Max (' + t.clampMax + ')', function(){}); return;
            }
            t.clampMin = mn;
            updateCupDisplay();
        });
    }
}
function toggleMax() {
    exitHistoryView();
    var t = modTarget();
    if (!t || (selectedDieId == null && allDescendantDice(t).length === 0)) return;
    if (t.clampMax) {
        delete t.clampMax;
        updateCupDisplay();
    } else {
        showInlineInput('Maximum die value?', '', function(val) {
            if (!val) return;
            var mx = parseInt(val);
            if (!mx || mx < 1) return;
            if (t.clampMin && t.clampMin > 1 && mx <= t.clampMin) {
                showConfirm('Max must be greater than Min (' + t.clampMin + ')', function(){}); return;
            }
            t.clampMax = mx;
            updateCupDisplay();
        });
    }
}
function toggleSuccess() {
    exitHistoryView();
    // countSuccess is group-only: it transforms the group total from sum to
    // count-of-successes. Per-die semantics would be muddled, and the roll
    // engine (rollSingleGroup) reads ctx.countSuccess at the group level.
    var g = activeGroup();
    if (!g || allDescendantDice(g).length === 0) return;
    if (g.countSuccess) {
        delete g.countSuccess;
        updateCupDisplay();
    } else {
        showInlineInput('Count successes: die \\u2265 ?', '', function(val) {
            if (!val) return;
            var threshold = parseInt(val);
            if (!threshold || threshold < 1) return;
            g.countSuccess = threshold;
            updateCupDisplay();
        });
    }
}
function promptMod(sign) {
    exitHistoryView();
    showInlineInput(sign > 0 ? 'Add modifier:' : 'Subtract modifier:', '', function(val) {
        if (val && parseInt(val)) { modifier += sign * Math.abs(parseInt(val)); updateCupDisplay(); }
    });
}

function saveCupState() {
    // Don't overwrite the user's live cup while they're viewing a historical snapshot
    if (typeof historyViewIdx !== 'undefined' && historyViewIdx > -1) return;
    // Don't persist selection state — on reload, nothing should be selected.
    // Save the cup contents + operation, but not which group/die was active.
    localStorage.setItem('dice_roller_cup', JSON.stringify({
        groups: cupGroups, rootOperation: rootOperation
    }));
}
function saveLastRoll(resultText, breakdownHtml, symbolFaces) {
    var data = {result:resultText, breakdown:breakdownHtml};
    if (symbolFaces) data.symbolFaces = symbolFaces;
    localStorage.setItem('dice_roller_last_roll', JSON.stringify(data));
}
function renderSymbolResult(faces) {
    var html = '<div class="dr-face-chips">';
    faces.forEach(function(f) { html += '<span class="dr-face-chip">' + faceToDisplay(String(f)) + '</span>'; });
    html += '</div>';
    return html;
}
function restoreLastRoll() {
    try {
        var lr = JSON.parse(localStorage.getItem('dice_roller_last_roll'));
        if (lr && lr.result) {
            if (lr.symbolFaces && lr.symbolFaces.length) {
                document.getElementById('result').innerHTML = renderSymbolResult(lr.symbolFaces);
            } else {
                document.getElementById('result').textContent = lr.result;
            }
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
            activeGroupIdx = 0;
            selectedDieId = null;
        } else if (s.dice || s.children) {
            // Legacy single-group format — migrate
            var g = cupGroups[0];
            g.children = s.children || s.dice || [];
            g.modifier = s.modifier || 0;
            g.dropLowest = (typeof s.dropLowest === 'number') ? s.dropLowest : (s.dropLowest ? 1 : 0);
            g.dropHighest = (typeof s.dropHighest === 'number') ? s.dropHighest : (s.dropHighest ? 1 : 0);
            g.operation = s.operation || 'sum';
            g.repeat = s.repeat || 1;
        }
        // Back-compat: convert any boolean DL/DH flags to counts across all groups
        function migrateFlags(g) {
            if (g.dropLowest === true) g.dropLowest = 1;
            if (g.dropLowest === false) g.dropLowest = 0;
            if (g.dropHighest === true) g.dropHighest = 1;
            if (g.dropHighest === false) g.dropHighest = 0;
            (g.children || []).forEach(function(c){ if (c.type === 'group') migrateFlags(c); });
        }
        cupGroups.forEach(migrateFlags);
    } catch(e) {}
}
function dieKey(d) {
    // Keep the selected die separate from its siblings and keep any die with
    // its own per-die modifiers separate too, so they render independently.
    var sel = (d.id === selectedDieId) ? '*' + d.id : '';
    return [
        d.type||'', d.sides||'',
        d.exploding?'!':'',
        d.clampMin>1?'mn'+d.clampMin:'',
        d.clampMax?'mx'+d.clampMax:'',
        d.countSuccess?'cs'+d.countSuccess:'',
        d.reroll?'rr'+d.reroll:'',
        d.color||'', d.label||'', sel
    ].join('|');
}
// Does this die have per-die modifiers (things that would be displayed on it)?
function hasPerDieMods(d) {
    return !!(d.exploding || (d.clampMin && d.clampMin > 1) || d.clampMax || d.countSuccess || d.reroll);
}
// Walk all dice in cupGroups and find the one with this id; return {die, group}
function findDieById(id) {
    function walk(g) {
        for (var i = 0; i < g.children.length; i++) {
            var c = g.children[i];
            if (c.type === 'group') {
                var r = walk(c);
                if (r) return r;
            } else if (c.id === id) {
                return {die: c, group: g};
            }
        }
        return null;
    }
    for (var i = 0; i < cupGroups.length; i++) {
        var r = walk(cupGroups[i]);
        if (r) return r;
    }
    return null;
}
// If a die is no longer special (no per-die mods), forget its selection so
// it will visually merge back with its siblings on next render.
function tryAutoRejoin() {
    if (selectedDieId == null) return;
    var r = findDieById(selectedDieId);
    if (!r || !hasPerDieMods(r.die)) selectedDieId = null;
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
        var label = d.label || (d.type === 'custom' ? 'd['+d.faces.length+']' : d.type === 'dx' ? 'd'+d.sides : d.type);
        var dieColor = d.color || info.color;
        var isSelected = d.id === selectedDieId;
        // Selected die: fill with accent color, symbol overlayed on top
        var bg = isSelected ? '#ffa657' : '#0a0a0a';
        var border = isSelected ? '#ffa657' : dieColor;
        var fgColor = isSelected ? '#0a0a0a' : dieColor;
        var countTag = grp.count > 1 ? '<span class="dr-cup-die-count">'+grp.count+'\\u00d7</span>' : '';
        var badges = [];
        if (d.exploding) badges.push('<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round" style="vertical-align:-1px"><polygon points="12,0.5 13.5,7.5 17,2 15,8.5 21,4.5 16,9.5 23.5,10 16,11.5 22,16 15.5,13 18,20 13,13.5 12,23.5 11,13.5 6,20 9,13 2,16 8,11.5 0.5,10 8,9.5 3,4.5 9,8.5 7,2 10.5,7.5"/></svg>');
        if (d.clampMin && d.clampMin > 1) badges.push('\\u2265'+d.clampMin);
        if (d.clampMax) badges.push('\\u2264'+d.clampMax);
        if (d.countSuccess) badges.push('#\\u2265'+d.countSuccess);
        var badgeTag = badges.length ? '<span class="dr-cup-die-badge">'+badges.join(' ')+'</span>' : '';
        var pressAttr = PREMIUM ? 'ontouchstart="startLongPress('+i+',event,'+gIdx+')" ontouchend="cancelLongPress()" ontouchmove="cancelLongPress()" '+
                'onmousedown="startLongPress('+i+',event,'+gIdx+')" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()" '+
                'oncontextmenu="event.preventDefault();suppressNextDieClick=true;selectSingleDie('+i+','+gIdx+')"' : '';
        html += '<div class="dr-cup-die" style="background:'+bg+';border:2px solid '+border+';color:'+fgColor+';" '+
                'onclick="handleDieClick('+gIdx+','+i+',event)" '+
                pressAttr+'>'+
                countTag+getDieShape(d)+badgeTag+
                '<span class="dr-cup-die-label">'+label+'</span></div>';
    });
    if (g.modifier !== 0) {
        var mc = g.modifier > 0 ? '#7ee787' : '#f85149';
        var ml = g.modifier > 0 ? '+'+g.modifier : ''+g.modifier;
        html += '<span class="dr-group-badge" style="color:'+mc+';border-color:'+mc+';background:'+mc+'22" '+
                'onclick="event.stopPropagation();selectGroup('+gIdx+');modifier=0;updateCupDisplay()">'+ml+'</span>';
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
        // Hide the empty chart box — keep the wrap container visible in premium
        // for the + Group button
        document.getElementById('distChart').style.display = 'none';
        if (!PREMIUM) document.getElementById('distChart').parentElement.style.display = 'none';
        document.getElementById('formulaInput').value = '';
        document.getElementById('prob').innerHTML = '';
        document.getElementById('rollBtn').classList.add('dimmed');
        document.getElementById('dropBtn').classList.add('dimmed');
        document.getElementById('dropHBtn').classList.add('dimmed');
        document.getElementById('floorBtn').classList.add('dimmed');
        document.getElementById('capBtn').classList.add('dimmed');
        document.getElementById('explodeBtn').classList.add('dimmed');
        document.getElementById('minBtn').classList.add('dimmed');
        document.getElementById('maxBtn').classList.add('dimmed');
        document.getElementById('successBtn').classList.add('dimmed');
        document.getElementById('favStar').classList.add('dimmed');
        document.getElementById('favStar').style.color = '';
        document.getElementById('dropBtn').classList.remove('on');
        document.getElementById('dropHBtn').classList.remove('on');
        document.getElementById('floorBtn').classList.remove('on');
        document.getElementById('capBtn').classList.remove('on');
        document.getElementById('floorBtn').textContent = 'Floor';
        document.getElementById('capBtn').textContent = 'Cap';
        document.getElementById('explodeBtn').classList.remove('on');
        document.getElementById('minBtn').classList.remove('on');
        document.getElementById('minBtn').textContent = 'Min';
        document.getElementById('maxBtn').classList.remove('on');
        document.getElementById('maxBtn').textContent = 'Max';
        document.getElementById('successBtn').classList.remove('on');
        document.getElementById('successBtn').textContent = 'Success';
        document.getElementById('favStar').classList.remove('fav-active');
        document.getElementById('cupTags').innerHTML = '';
        document.getElementById('addGroupSlot').innerHTML = '';
        // Clear active preset indicator — an empty cup has no active favorite
        if(!editMode) {
            activePresetIdx = -1;
            var labelEl = document.getElementById('cupPresetLabel');
            if (labelEl) { labelEl.textContent = ''; labelEl.classList.remove('editing'); }
            if (typeof renderPresets === 'function') renderPresets();
        }
        return;
    }
    document.getElementById('distChart').parentElement.style.display = '';
    document.getElementById('distChart').style.display = '';

    var html = '';
    var allGroups = flatGroups();
    var showGroups = PREMIUM && allGroups.length > 1;

    if (showGroups) {
        // Multi-group rendering — inline flow layout
        function renderGroupTree(groups, depth, parentOp) {
            var out = '<div class="dr-group-flow">';
            groups.forEach(function(g, gi) {
                if (gi > 0) {
                    var opLabel = parentOp === 'minus' ? '\\u2212' : '+';
                    out += '<div class="dr-group-op" onclick="event.stopPropagation();cycleRootOp()" title="Click to change">'+opLabel+'</div>';
                }
                var flatIdx = flatGroupIndex(g.id);
                // Group highlight suppresses when a die is selected — focus has
                // moved to that die, not the group.
                var isActive = flatIdx === activeGroupIdx && selectedDieId == null;
                var bgAlpha = Math.min(0.6, 0.15 + depth * 0.12);
                var cls = 'dr-group-section' + (isActive ? ' active' : '');
                out += '<div class="'+cls+'" style="background:rgba(0,0,0,'+bgAlpha.toFixed(2)+')" onclick="event.stopPropagation();selectGroup('+flatIdx+')">';
                var diceOnly = g.children.filter(function(c){return c.type!=='group';});
                var subGroups = g.children.filter(function(c){return c.type==='group';});
                if (diceOnly.length > 0 || g.modifier !== 0) {
                    out += renderGroupDice({children:diceOnly, modifier:g.modifier, dropLowest:g.dropLowest, dropHighest:g.dropHighest}, flatIdx);
                }
                if (subGroups.length > 0) {
                    out += renderGroupTree(subGroups, depth+1, g.operation || 'sum');
                }
                if (diceOnly.length === 0 && subGroups.length === 0 && g.modifier === 0) {
                    out += '<span class="dr-group-empty">empty</span>';
                }
                // Modifier tags — strictly group-level, do not inherit from or propagate to children
                var tags = '';
                var explodePts = '12,0.5 13.5,7.5 17,2 15,8.5 21,4.5 16,9.5 23.5,10 16,11.5 22,16 15.5,13 18,20 13,13.5 12,23.5 11,13.5 6,20 9,13 2,16 8,11.5 0.5,10 8,9.5 3,4.5 9,8.5 7,2 10.5,7.5';
                var explodeSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><polygon points="'+explodePts+'"/></svg>';
                if (g.dropLowest) tags += '<span class="dr-group-badge">DL=' + g.dropLowest + '</span>';
                if (g.dropHighest) tags += '<span class="dr-group-badge">DH=' + g.dropHighest + '</span>';
                if (g.floor) tags += '<span class="dr-group-badge">Floor=' + g.floor + '</span>';
                if (g.cap) tags += '<span class="dr-group-badge">Cap=' + g.cap + '</span>';
                if (g.exploding) tags += '<span class="dr-group-badge">'+explodeSvg+'</span>';
                if (g.clampMin && g.clampMin > 1) tags += '<span class="dr-group-badge">\\u2265'+g.clampMin+'</span>';
                if (g.clampMax) tags += '<span class="dr-group-badge">\\u2264'+g.clampMax+'</span>';
                if (g.countSuccess) tags += '<span class="dr-group-badge">#\\u2265'+g.countSuccess+'</span>';
                // Container group modifier tag (dice groups render modifier inline via renderGroupDice)
                if (isContainer(g) && g.modifier) {
                    var ml = g.modifier > 0 ? '+'+g.modifier : ''+g.modifier;
                    tags += '<span class="dr-group-badge">'+ml+'</span>';
                }
                if (tags) out += '<div class="dr-cup-badges">'+tags+'</div>';
                out += '</div>';
            });
            out += '</div>';
            return out;
        }
        html = renderGroupTree(cupGroups, 0, rootOperation);
    } else {
        // Single group — render the dice, then append a stacked column of modifier badges
        var g0 = cupGroups[0];
        html = renderGroupDice(g0, 0);
        var badgeHtml = '';
        var explodePts = '12,0.5 13.5,7.5 17,2 15,8.5 21,4.5 16,9.5 23.5,10 16,11.5 22,16 15.5,13 18,20 13,13.5 12,23.5 11,13.5 6,20 9,13 2,16 8,11.5 0.5,10 8,9.5 3,4.5 9,8.5 7,2 10.5,7.5';
        var explodeSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><polygon points="'+explodePts+'"/></svg>';
        if (g0.dropLowest) badgeHtml += '<span class="dr-group-badge">DL=' + g0.dropLowest + '</span>';
        if (g0.dropHighest) badgeHtml += '<span class="dr-group-badge">DH=' + g0.dropHighest + '</span>';
        if (g0.floor) badgeHtml += '<span class="dr-group-badge">Floor=' + g0.floor + '</span>';
        if (g0.cap) badgeHtml += '<span class="dr-group-badge">Cap=' + g0.cap + '</span>';
        if (g0.exploding) badgeHtml += '<span class="dr-group-badge">'+explodeSvg+'</span>';
        if (g0.clampMin && g0.clampMin > 1) badgeHtml += '<span class="dr-group-badge">\\u2265'+g0.clampMin+'</span>';
        if (g0.clampMax) badgeHtml += '<span class="dr-group-badge">\\u2264'+g0.clampMax+'</span>';
        if (g0.countSuccess) badgeHtml += '<span class="dr-group-badge">#\\u2265'+g0.countSuccess+'</span>';
        if (badgeHtml) html += '<div class="dr-cup-badges">'+badgeHtml+'</div>';
    }
    staging.innerHTML = html;
    // + Group button in the chart area (premium only)
    if (PREMIUM) {
        var chart = document.getElementById('distChart');
        var chartWide = chart && chart.offsetWidth > 200;
        var cls = chartWide ? 'dr-add-group below' : 'dr-add-group';
        document.getElementById('addGroupSlot').innerHTML = '<div class="'+cls+'"><button onclick="event.stopPropagation();addGroup()">+ Group</button></div>';
    } else {
        document.getElementById('addGroupSlot').innerHTML = '';
    }
    // Summary
    if (showGroups) {
        // Show full multi-group formula in summary
        var parts = cupGroups.map(function(g){ return buildGroupFormula(g) || '()'; });
        var opStr = rootOperation === 'minus' ? ' \\u2212 ' : ' + ';
        summary.textContent = parts.join(opStr);
    } else {
        summary.textContent = buildGroupFormula(activeGroup());
    }
    document.getElementById('rollBtn').classList.toggle('dimmed', totalDice === 0);
    document.getElementById('favStar').classList.toggle('dimmed', totalDice === 0);
    if (totalDice === 0) document.getElementById('favStar').style.color = '';
    // In multi-group mode with no group selected, disable all buttons
    var noGroupSelected = showGroups && activeGroupIdx < 0;
    // Container groups (those with sub-groups) can't receive dice directly
    var activeIsContainer = !noGroupSelected && isContainer(activeGroup());
    document.querySelector('.dr-dice-grid').classList.toggle('disabled', noGroupSelected || activeIsContainer);
    document.querySelector('.dr-mod-rows').classList.toggle('disabled', noGroupSelected);
    // For modifier threshold calc, count all descendant dice of the active group
    var n = noGroupSelected ? 0 : allDescendantDice(activeGroup()).length;
    // DL/DH buttons: need at least 1 die; counts can exceed dice (all get dropped)
    var dlDisable = n < 1;
    var dhDisable = n < 1;
    // DL/DH are group-level only — dim them when a single die is selected
    // (per-die drop doesn't exist) so the user sees these are inactive.
    var dieSel = selectedDieId != null;
    document.getElementById('dropBtn').classList.toggle('dimmed', dlDisable || dieSel);
    document.getElementById('dropHBtn').classList.toggle('dimmed', dhDisable || dieSel);
    // Reflect selected group's DL/DH on button .on state; clear when nothing selected
    document.getElementById('dropBtn').classList.toggle('on', !noGroupSelected && !dieSel && !!dropLowest);
    document.getElementById('dropHBtn').classList.toggle('on', !noGroupSelected && !dieSel && !!dropHighest);
    // Button text shows the count (DL2 / DH3) when > 1
    var dlc = (typeof dropLowest === 'number') ? dropLowest : (dropLowest ? 1 : 0);
    var dhc = (typeof dropHighest === 'number') ? dropHighest : (dropHighest ? 1 : 0);
    var dropBtnEl = document.getElementById('dropBtn');
    var dropHBtnEl = document.getElementById('dropHBtn');
    if (dropBtnEl) dropBtnEl.textContent = dlc > 0 ? 'Drop Low=' + dlc : 'Drop Low';
    if (dropHBtnEl) dropHBtnEl.textContent = dhc > 0 ? 'Drop High=' + dhc : 'Drop High';
    // Floor/Cap buttons — group-only, dimmed when die selected
    var agTmp = noGroupSelected ? null : activeGroup();
    var floorVal = (agTmp && agTmp.floor) ? agTmp.floor : 0;
    var capVal = (agTmp && agTmp.cap) ? agTmp.cap : 0;
    document.getElementById('floorBtn').classList.toggle('dimmed', n === 0 || dieSel);
    document.getElementById('capBtn').classList.toggle('dimmed', n === 0 || dieSel);
    document.getElementById('floorBtn').classList.toggle('on', floorVal !== 0 && !dieSel);
    document.getElementById('capBtn').classList.toggle('on', capVal !== 0 && !dieSel);
    document.getElementById('floorBtn').textContent = floorVal ? 'Floor=' + floorVal : 'Floor';
    document.getElementById('capBtn').textContent = capVal ? 'Cap=' + capVal : 'Cap';
    // Explode/min/max buttons reflect the SELECTED die if one is selected,
    // else the active group. Success/DL/DH stay group-level (no per-die meaning).
    var ag = noGroupSelected ? null : activeGroup();
    var selDie = null;
    if (selectedDieId != null) {
        var sdRef = findDieById(selectedDieId);
        if (sdRef) selDie = sdRef.die;
    }
    var modSrc = selDie || ag;
    var isExploding = !!(modSrc && modSrc.exploding);
    document.getElementById('explodeBtn').classList.toggle('on', isExploding);
    document.getElementById('explodeBtn').classList.toggle('dimmed', n === 0);
    var explodePts = '12,0.5 13.5,7.5 17,2 15,8.5 21,4.5 16,9.5 23.5,10 16,11.5 22,16 15.5,13 18,20 13,13.5 12,23.5 11,13.5 6,20 9,13 2,16 8,11.5 0.5,10 8,9.5 3,4.5 9,8.5 7,2 10.5,7.5';
    var explodeSvgDimmed = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><polygon points="'+explodePts+'"/></svg>';
    var explodeSvgOn = '<svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="#333" stroke-width="1.5" stroke-linejoin="round"><polygon points="'+explodePts+'"/></svg>';
    document.getElementById('explodeBtn').innerHTML = n === 0 ? explodeSvgDimmed : isExploding ? explodeSvgOn : '\\uD83D\\uDCA5';
    // Min button state
    var minVal = (modSrc && modSrc.clampMin && modSrc.clampMin > 1) ? modSrc.clampMin : 0;
    document.getElementById('minBtn').classList.toggle('on', minVal > 0);
    document.getElementById('minBtn').classList.toggle('dimmed', n === 0);
    document.getElementById('minBtn').textContent = minVal > 0 ? 'Min=' + minVal : 'Min';
    // Max button state
    var maxVal = (modSrc && modSrc.clampMax) ? modSrc.clampMax : 0;
    document.getElementById('maxBtn').classList.toggle('on', maxVal > 0);
    document.getElementById('maxBtn').classList.toggle('dimmed', n === 0);
    document.getElementById('maxBtn').textContent = maxVal > 0 ? 'Max=' + maxVal : 'Max';
    // Success button state
    var successVal = (ag && ag.countSuccess) ? ag.countSuccess : 0;
    document.getElementById('successBtn').classList.toggle('on', successVal > 0 && !dieSel);
    document.getElementById('successBtn').classList.toggle('dimmed', n === 0 || dieSel);
    document.getElementById('successBtn').textContent = successVal > 0 ? 'Success \\u2265 ' + successVal : 'Success';
    // Cup tags strip — deprecated, badges are rendered inline with the cup dice now
    document.getElementById('cupTags').innerHTML = '';

    // Symbol mode OR lock mode: hide numeric-only UI elements
    var symMode = isSymbolMode();
    var hideModRows = symMode || cupLocked;
    document.querySelector('.dr-mod-rows').style.display = hideModRows ? 'none' : '';
    var addGroupBtn = document.querySelector('.dr-add-group');
    if (addGroupBtn) addGroupBtn.style.display = (symMode || cupLocked) ? 'none' : '';
    var diceGrid = document.getElementById('diceGrid');
    if (diceGrid) {
        diceGrid.style.display = cupLocked ? 'none' : '';
        // Disable standard dice buttons in symbol mode, keep DX active
        if (!cupLocked) {
            diceGrid.querySelectorAll('.dr-die-btn').forEach(function(btn) {
                var die = btn.getAttribute('data-die');
                if (die !== 'dx') {
                    btn.style.opacity = symMode ? '0.25' : '';
                    btn.style.pointerEvents = symMode ? 'none' : '';
                }
            });
        }
    }

    if (!symMode) {
        document.getElementById('distChart').parentElement.style.display = '';
        renderDistribution();
    } else {
        // Hide chart entirely in symbol mode
        document.getElementById('distChart').parentElement.style.display = 'none';
    }
    syncFormulaFromCup();
    // Auto-save: when a preset is loaded and cup is unlocked, update the
    // preset BEFORE updateFavState runs (which would otherwise clear
    // activePresetIdx because the cup signature changed).
    if(!cupLocked && activePresetIdx >= 0 && presets[activePresetIdx]) {
        var old = presets[activePresetIdx];
        var updated = JSON.parse(JSON.stringify(cupGroups.length === 1 ? cupGroups[0] : {type:'group',children:cupGroups,operation:rootOperation}));
        updated.name = old.name;
        updated.dice = updated.children;
        // Replace in presetData (ungrouped or pack)
        var ui = presetData.ungrouped.indexOf(old);
        if (ui >= 0) presetData.ungrouped[ui] = updated;
        presetData.packs.forEach(function(pk) {
            var pi = pk.presets.indexOf(old);
            if (pi >= 0) pk.presets[pi] = updated;
        });
        savePresetsToStorage();
        rebuildPresetViews();
    }
    updateFavState();
}

// Long press for options
var lpTimer = null;
// Suppress the synthetic click that touchend produces right after a
// long-press fires or an oncontextmenu fires (otherwise the die's
// onclick→removeFromCup would undo the selection immediately).
var suppressNextDieClick = false;
function startLongPress(idx, e, gIdx) {
    // Clear any pending timer so a touchstart→mousedown double-fire on mobile
    // doesn't schedule two timers.
    if (lpTimer) clearTimeout(lpTimer);
    lpTimer = setTimeout(function() {
        lpTimer = null;
        suppressNextDieClick = true;
        selectSingleDie(idx, gIdx);
    }, 400);
}
function cancelLongPress() { clearTimeout(lpTimer); }
function handleDieClick(gIdx, idx, ev) {
    ev.stopPropagation();
    if (cupLocked) return;
    if (suppressNextDieClick) { suppressNextDieClick = false; return; }
    // Deselect-on-same-die: if this click lands on the currently-selected
    // die, toggle the selection off and leave the die in place. Must run
    // before selectGroup (which unconditionally clears selectedDieId).
    var list = flatGroups();
    var g = list[gIdx];
    if (g && g.children && g.children[idx] &&
        selectedDieId != null && g.children[idx].id === selectedDieId) {
        selectedDieId = null;
        activeGroupIdx = gIdx;
        updateCupDisplay();
        return;
    }
    selectGroup(gIdx);
    removeFromCup(idx);
}
// Mark the die at children[idx] of the given flat group as the "selected"
// die. dieKey will render it separately from its siblings (visual split)
// and modifier buttons will target it. No data duplication — the array
// just gains a selection marker via selectedDieId.
function selectSingleDie(idx, gIdx) {
    if (cupLocked) return;
    var list = flatGroups();
    // Fully validate gIdx — the old "|| activeGroup()" fallback would write
    // activeGroupIdx to an out-of-range value if gIdx was invalid.
    if (gIdx < 0 || gIdx >= list.length) return;
    var g = list[gIdx];
    if (!g || !g.children || idx < 0 || idx >= g.children.length) return;
    var d = g.children[idx];
    if (d.type === 'group') return;
    selectedDieId = d.id;
    activeGroupIdx = gIdx;
    updateCupDisplay();
}

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

function rollSingleDie(d, ctx) {
    // ctx: optional {exploding, clampMin, clampMax} inherited from the die's group
    ctx = ctx || {};
    var sides = d.type==='dx' ? (d.sides||6) : (dieRanges[d.type]||6);
    if (d.type==='coin') return {value: Math.random()<0.5 ? 1 : 0, chain: null, clamped: null};
    if (d.type==='df') return {value: Math.floor(Math.random()*3)-1, chain: null, clamped: null};
    // Custom dice: pick a random face from the faces array
    if (d.type==='custom' && d.faces && d.faces.length > 0) {
        var val = d.faces[Math.floor(Math.random() * d.faces.length)];
        // Skip clamping for symbol (string) faces
        if (typeof val === 'string') return {value: val, chain: null, clamped: null};
        var clamped = null;
        var clampMin = (d.clampMin && d.clampMin > 1) ? d.clampMin : ctx.clampMin;
        var clampMax = d.clampMax || ctx.clampMax;
        if (clampMin && val < clampMin) { clamped = val; val = clampMin; }
        if (clampMax && val > clampMax) { clamped = clamped !== null ? clamped : val; val = clampMax; }
        return {value: val, chain: null, clamped: clamped};
    }

    var val = rollOneDie(sides);
    var chain = null;

    // Exploding: die-own OR group-level
    var exploding = d.exploding || ctx.exploding;
    if (exploding) {
        chain = [val];
        var explodeVal = val;
        while (explodeVal === sides && chain.length < 11) {
            explodeVal = rollOneDie(sides);
            chain.push(explodeVal);
            val += explodeVal;
        }
        if (chain.length === 1) chain = null; // no explosion happened
    }

    // Reroll: per-die only
    if (d.reroll && val <= d.reroll) {
        val = rollOneDie(sides);
        chain = null;
    }

    // Clamp: die-own wins, else group-level
    var clampMin = (d.clampMin && d.clampMin > 1) ? d.clampMin : ctx.clampMin;
    var clampMax = d.clampMax || ctx.clampMax;
    var clamped = null;
    if (clampMin && val < clampMin) { clamped = val; val = clampMin; }
    if (clampMax && val > clampMax) { clamped = clamped !== null ? clamped : val; val = clampMax; }

    return {value: val, chain: chain, clamped: clamped};
}

function rollSingleGroup(g, parentCtx) {
    // Roll one group recursively. Modifiers inherit from parentCtx with override.
    // Returns {total, breakdown}
    parentCtx = parentCtx || {};
    var ctx = mergeGroupCtx(g, parentCtx);
    var results = [], total = 0, bParts = [];
    var directDice = g.children.filter(function(c){return c.type!=='group';});
    var subGroups = g.children.filter(function(c){return c.type==='group';});
    // Build a sort key for each die matching the cup's dieKey grouping, so
    // the breakdown groups identical dice together in first-appearance order.
    var dieOrder = {}, dieOrdIdx = 0;
    directDice.forEach(function(d) {
        var fk = d.type==='custom' ? 'custom:'+d.faces.join(',') :
                 d.type==='dx' ? 'dx:'+d.sides :
                 d.type;
        if (!(fk in dieOrder)) dieOrder[fk] = dieOrdIdx++;
    });
    directDice.forEach(function(d, i) {
        var roll = rollSingleDie(d, ctx);
        var info = DIE_SHAPES[d.type] || DIE_SHAPES.dx;
        var dieColor = d.color || info.color || '#58a6ff';
        var fk = d.type==='custom' ? 'custom:'+d.faces.join(',') :
                 d.type==='dx' ? 'dx:'+d.sides :
                 d.type;
        results.push({type:d.type, sides:d.sides, faces:d.faces, value:roll.value, chain:roll.chain, clamped:roll.clamped, exploding:d.exploding||ctx.exploding, dieColor:dieColor, origIdx:i, sortKey:dieOrder[fk]});
    });
    // Keep/Drop logic on direct dice only — supports DL+DH simultaneously with counts
    var kept = [];
    var dropSet = {};
    if (results.length > 0) {
        var sorted = results.map(function(r,i){return{val:r.value,idx:i};});
        sorted.sort(function(a,b){return a.val-b.val;});
        // Per-die keep overrides
        var hasPerDieKeep = false;
        directDice.forEach(function(d){if(d.keep) hasPerDieKeep=true;});
        if (hasPerDieKeep) {
            var keepMode, keepCount;
            directDice.forEach(function(d){if(d.keep){keepMode=d.keep;keepCount=d.keepCount||1;}});
            if(keepMode==='kh') { for(var i=0;i<sorted.length-keepCount;i++) dropSet[sorted[i].idx]=true; }
            else { for(var i=keepCount;i<sorted.length;i++) dropSet[sorted[i].idx]=true; }
        } else {
            var dlCount = (typeof g.dropLowest === 'number') ? g.dropLowest : (g.dropLowest ? 1 : 0);
            var dhCount = (typeof g.dropHighest === 'number') ? g.dropHighest : (g.dropHighest ? 1 : 0);
            for (var di = 0; di < dlCount && di < sorted.length; di++) dropSet[sorted[di].idx] = true;
            for (var di = 0; di < dhCount && di < sorted.length; di++) dropSet[sorted[sorted.length-1-di].idx] = true;
        }
    }
    results.forEach(function(r,i){ kept.push(!dropSet[i]); });
    // Count successes — use effective ctx (inherits)
    var countTh = ctx.countSuccess || 0;
    var countMode = countTh > 0;
    if(countMode){var s=0;results.forEach(function(r,i){if(kept[i]&&r.value>=countTh)s++;});total=s;}
    else{results.forEach(function(r,i){if(kept[i])total+=r.value;});}
    // Sort results by first-unique-key order (matching cup grouping) for display.
    // Total is already computed from unsorted order — this only affects breakdown.
    var sortMap = results.map(function(r,i){return i;});
    sortMap.sort(function(a,b){ return results[a].sortKey - results[b].sortKey || a - b; });
    var sortedResults = sortMap.map(function(i){return results[i];});
    var sortedKept = sortMap.map(function(i){return kept[i];});
    // Recurse into sub-groups and add their totals (sum)
    var subBreakdowns = [];
    subGroups.forEach(function(sg) {
        var sr = rollSingleGroup(sg, ctx);
        total += sr.total;
        subBreakdowns.push(sr.breakdown);
    });
    total += g.modifier||0;
    // Floor/Cap: clamp the group total (not individual dice)
    var preClampTotal = total;
    if (g.floor && total < g.floor) total = g.floor;
    if (g.cap && total > g.cap) total = g.cap;
    var wasClamped = (total !== preClampTotal);
    // Breakdown — uses sortedResults so identical dice are grouped together
    // (matching the cup's visual grouping and formula bar order).
    sortedResults.forEach(function(r,i){
        var label=r.chain?r.chain.join('+')+' = '+r.value:''+r.value;
        if(r.clamped!==null&&r.clamped!==undefined) label=r.clamped+'\\u2192'+r.value;
        if(r.type==='df') label=r.value>0?'+'+r.value:r.value===0?'0':''+r.value;
        var style='border-color:'+r.dieColor;
        if(!sortedKept[i]) style+=';opacity:0.3;text-decoration:line-through';
        if(r.chain)style+=';color:#f0883e';
        if(r.clamped!==null&&r.clamped!==undefined)style+=';color:#d29922';
        if(countMode&&sortedKept[i]){style='border-color:'+r.dieColor+';'+(r.value>=countTh?'color:#7ee787;font-weight:800':'opacity:0.5');}
        bParts.push('<span class="dr-die-result" style="'+style+'">'+label+'</span>');
    });
    // Append sub-group breakdowns after direct dice (each already wrapped in
    // its own container). Insert a "+" operator between each sub-group and
    // the previous breakdown part — sub-groups nested inside a parent are
    // always summed (see total += sr.total above), so the sign is always +.
    var plusOp = '<span style="color:#484f58;font-weight:700;font-size:16px">+</span>';
    subBreakdowns.forEach(function(sb){
        if (bParts.length > 0) bParts.push(plusOp);
        bParts.push(sb);
    });
    if(g.modifier>0) bParts.push('<span class="dr-die-result" style="border-color:#7ee787">+'+g.modifier+'</span>');
    else if(g.modifier<0) bParts.push('<span class="dr-die-result" style="border-color:#f85149">'+g.modifier+'</span>');
    // Floor/Cap indicator: show the pre-clamp total with an arrow to the clamped value
    if (wasClamped) {
        var clampColor = total > preClampTotal ? '#d29922' : '#d29922';
        var clampLabel = preClampTotal + '\\u2192' + total;
        var clampIcon = total > preClampTotal ? '\\u2B61' : '\\u2B63'; // ⭡ up / ⭣ down
        bParts.push('<span class="dr-die-result" style="border-color:'+clampColor+';color:'+clampColor+'">'+clampIcon+' '+clampLabel+'</span>');
    }
    // Wrap this group's entire breakdown in a bordered container so nested groups are visually distinct
    var wrapped = '<span class="dr-breakdown-group">'+bParts.join(' ')+'</span>';
    return {total:total, breakdown:wrapped};
}

function rollDice() {
    // NOTE: intentionally does NOT exit history view. Rolling while viewing
    // a past roll re-rolls that roll's formula, and the historical state
    // becomes the new live cup (saved via saveToHistory below).
    tryAutoRejoin();
    var totalDice = getAllDice().length;
    if (totalDice === 0) { document.getElementById('result').textContent = 'Add dice'; return; }
    playSound(); if (navigator.vibrate) navigator.vibrate(50);

    // Special case: all coins → simple heads/tails display
    var allDiceArr = getAllDice();
    if (allDiceArr.length > 0 && allDiceArr.every(function(d){return d.type==='coin';})) {
        var coinVal = Math.random()<0.5 ? 1 : 0;
        var coinLabel = coinVal ? 'HEADS (1)' : 'TAILS (0)';
        animateResult(coinLabel);
        saveLastRoll(coinLabel, coinLabel);
        saveToHistory({expression:'COIN',total:coinVal,breakdown:coinLabel,timestamp:Date.now()});
        broadcastRoll('COIN', (activePresetIdx>=0&&presets[activePresetIdx])?presets[activePresetIdx].name:'', {total:coinVal, breakdown:coinLabel});
        showProbability(coinVal);
        return;
    }

    // Symbol mode: roll each die and display face chips
    if (isSymbolMode()) {
        var faces = [];
        allDiceArr.forEach(function(d) {
            if (d.type === 'custom' && d.faces && d.faces.length > 0) {
                faces.push(d.faces[Math.floor(Math.random() * d.faces.length)]);
            }
        });
        // Build face chips HTML with symbol rendering
        var chipsHtml = '<div class="dr-face-chips">';
        faces.forEach(function(f) {
            chipsHtml += '<span class="dr-face-chip">' + faceToDisplay(String(f)) + '</span>';
        });
        chipsHtml += '</div>';
        // Display in result area
        var resultEl = document.getElementById('result');
        resultEl.innerHTML = chipsHtml;
        document.getElementById('breakdown').innerHTML = '';
        document.getElementById('prob').textContent = '';
        document.getElementById('shareBtn').style.display = '';
        // Save to history as symbol roll
        var facesList = faces.map(function(f){ return String(f); });
        saveLastRoll(facesList.join(', '), '', facesList);
        var symExpr = buildGroupFormula(cupGroups[0]) || 'Symbol Roll';
        var symFavName = (activePresetIdx>=0&&presets[activePresetIdx])?presets[activePresetIdx].name:'';
        saveToHistory({expression:symExpr, total:facesList.join(', '), breakdown:facesList.join(', '), breakdownHtml:chipsHtml, timestamp:Date.now(), symbolFaces:facesList});
        broadcastRoll(symExpr, symFavName, {symbolFaces:facesList});
        return;
    }

    // Roll every root group through rollSingleGroup — one code path for
    // single-group and multi-group cups. This ensures floor/cap, nested
    // sub-groups, per-die modifiers, and all other group-level features
    // are applied consistently.
    var groupResults = [];
    var allBreakdown = [];
    cupGroups.forEach(function(g) {
        for (var ri = 0; ri < (g.repeat || 1); ri++) {
            var result = rollSingleGroup(g);
            groupResults.push(result);
            allBreakdown.push(result.breakdown);
        }
    });

    // Combine totals across root groups
    var totals = groupResults.map(function(r){return r.total;});
    var finalTotal;
    if (totals.length === 1) finalTotal = totals[0];
    else if (rootOperation === 'max') finalTotal = Math.max.apply(null, totals);
    else if (rootOperation === 'min') finalTotal = Math.min.apply(null, totals);
    else if (rootOperation === 'minus') finalTotal = totals.reduce(function(a,b){return a-b;});
    else finalTotal = totals.reduce(function(a,b){return a+b;}, 0);

    animateResult(finalTotal);

    // Build breakdown display
    if (cupGroups.length > 1) {
        var joinOp = rootOperation === 'minus' ? '\\u2212' : rootOperation === 'sum' ? '+' : rootOperation.toUpperCase();
        var opLabel = rootOperation === 'max' ? ' (highest)' : rootOperation === 'min' ? ' (lowest)' : '';
        document.getElementById('breakdown').innerHTML =
            allBreakdown.join(' <span style="color:#484f58;font-weight:700;font-size:16px">'+joinOp+'</span> ') + opLabel;
    } else {
        document.getElementById('breakdown').innerHTML = allBreakdown[0] || '';
    }

    // Build expression using buildGroupFormula (consistent with formula bar)
    var expression;
    if (cupGroups.length > 1) {
        var parts = cupGroups.map(function(g){ return '(' + (buildGroupFormula(g) || '') + ')'; });
        var opStr = rootOperation === 'minus' ? ' \\u2212 ' : rootOperation === 'sum' ? ' + ' : ' ' + rootOperation + ' ';
        expression = parts.join(opStr);
    } else {
        expression = buildGroupFormula(cupGroups[0]) || '';
    }

    saveLastRoll(String(finalTotal), document.getElementById('breakdown').innerHTML);
    saveToHistory({expression:expression, total:finalTotal, breakdown:document.getElementById('breakdown').textContent, breakdownHtml:document.getElementById('breakdown').innerHTML, timestamp:Date.now()});
    var numFavName = (activePresetIdx>=0&&presets[activePresetIdx])?presets[activePresetIdx].name:'';
    broadcastRoll(expression, numFavName, {total:finalTotal, breakdown:document.getElementById('breakdown').textContent});
    showProbability(finalTotal);
}

function getTheoreticalRange() {
    // Combine per-root-group ranges (each group applies its own DL/DH/mod).
    var totalLo = 0, totalHi = 0, anyDice = false;
    cupGroups.forEach(function(g, gi) {
        var rg = rootGroupRange(g);
        if (rg) {
            anyDice = true;
            if (gi === 0 || rootOperation !== 'minus') {
                totalLo += rg.lo; totalHi += rg.hi;
            } else {
                // Subtract: new lo = old lo - rg.hi, new hi = old hi - rg.lo
                totalLo -= rg.hi; totalHi -= rg.lo;
            }
        }
    });
    if (!anyDice) return {lo: 1, hi: 20};
    if (totalHi <= totalLo) { totalLo = 0; totalHi = 20; }
    return {lo: totalLo, hi: totalHi};
}
function rootGroupRange(rootG) {
    var allDice = effectiveDiceForGroup(rootG);
    var rollable = allDice.filter(function(d) { return dieRanges[d.type] || d.type === 'dx' || d.type === 'df' || d.type === 'coin' || d.type === 'adv' || d.type === 'dis' || d.type === 'custom'; });
    if (rollable.length === 0) return null;
    var gMod = rootG.modifier || 0;
    var countMode = rollable.some(function(d){return d.countSuccess;});
    if (countMode) {
        var threshold = 0;
        rollable.forEach(function(d){ if(d.countSuccess) threshold = d.countSuccess; });
        var guaranteedSuccesses = 0, guaranteedFailures = 0;
        rollable.forEach(function(d){
            var dMin = d.clampMin || 1;
            var dMax = d.clampMax || getDieMax(d);
            if (dMin >= threshold) guaranteedSuccesses++;
            if (dMax < threshold) guaranteedFailures++;
        });
        return {lo: guaranteedSuccesses + gMod, hi: rollable.length - guaranteedFailures + gMod};
    }
    var gDropLo = (typeof rootG.dropLowest === 'number' ? rootG.dropLowest : (rootG.dropLowest ? 1 : 0));
    var gDropHi = (typeof rootG.dropHighest === 'number' ? rootG.dropHighest : (rootG.dropHighest ? 1 : 0));
    var hasKeep = gDropLo || gDropHi || rollable.some(function(d){return d.keep;});
    var allMins = rollable.map(function(d){
        if (d.type==='df') return -1;
        if (d.type==='coin') return 0;
        if (d.type==='adv'||d.type==='dis') return 1;
        if (d.type==='custom'&&d.faces) {
            var nums = d.faces.filter(function(f){return typeof f === 'number';});
            return nums.length > 0 ? Math.min.apply(null, nums) : 0;
        }
        return d.clampMin || 1;
    });
    var allMaxes = rollable.map(function(d){
        if (d.type==='df') return 1;
        if (d.type==='coin') return 1;
        if (d.type==='adv'||d.type==='dis') return 20;
        if (d.type==='custom'&&d.faces) {
            var nums = d.faces.filter(function(f){return typeof f === 'number';});
            return nums.length > 0 ? Math.max.apply(null, nums) : 0;
        }
        return d.clampMax || getDieMax(d);
    });
    var lo = 0, hi = 0;
    if (hasKeep && rollable.length > 0) {
        allMins.sort(function(a,b){return a-b;});
        allMaxes.sort(function(a,b){return a-b;});
        var dLo = Math.min(rollable.length, gDropLo);
        var dHi = Math.min(rollable.length - dLo, gDropHi);
        for (var i = dLo; i < allMins.length - dHi; i++) lo += allMins[i];
        for (var i = dLo; i < allMaxes.length - dHi; i++) hi += allMaxes[i];
    } else {
        lo = allMins.reduce(function(a,b){return a+b;}, 0);
        hi = allMaxes.reduce(function(a,b){return a+b;}, 0);
    }
    lo += gMod; hi += gMod;
    // Floor/Cap clamp the theoretical range
    if (rootG.floor) { lo = Math.max(lo, rootG.floor); hi = Math.max(hi, rootG.floor); }
    if (rootG.cap) { lo = Math.min(lo, rootG.cap); hi = Math.min(hi, rootG.cap); }
    return {lo: lo, hi: hi};
}

function animateResult(finalValue) {
    var el = document.getElementById('result');
    el.classList.add('dr-rolling');
    var range = getTheoreticalRange();
    var lo = range.lo, hi = range.hi;
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
// -1 = live mode (current user cup). 0+ = viewing a historical snapshot.
var historyViewIdx = -1;
function loadHistory() { try{rollHistory=JSON.parse(localStorage.getItem('dice_roller_history')||'[]');}catch(e){rollHistory=[];} }
function saveToHistory(entry) {
    if(activePresetIdx >= 0 && presets[activePresetIdx]) {
        var p = presets[activePresetIdx];
        // Find which pack this preset belongs to (if any)
        var packName = null;
        presetData.packs.forEach(function(pk) {
            if (pk.presets.indexOf(p) >= 0) packName = pk.name;
        });
        entry.favName = packName ? packName + ' : ' + p.name : p.name;
    }
    // Snapshot the full cup state so history navigation can restore it fully
    entry.snapshot = JSON.parse(JSON.stringify({
        cupGroups: cupGroups,
        rootOperation: rootOperation,
        activeGroupIdx: activeGroupIdx
    }));
    // Preserve the rich breakdown HTML (grouped containers, colored dice borders)
    var bEl = document.getElementById('breakdown');
    if (bEl) entry.breakdownHtml = bEl.innerHTML;
    loadHistory();
    rollHistory.unshift(entry);
    if(rollHistory.length>30) rollHistory=rollHistory.slice(0,30);
    localStorage.setItem('dice_roller_history',JSON.stringify(rollHistory));
    historyViewIdx = -1; // this new roll becomes live
    saveCupState(); // persist the rolled cup state (important if we rolled from history view)
    updateHistoryNav();
}
function updateHistoryNav() {
    loadHistory();
    var prev = document.getElementById('histPrevBtn');
    var next = document.getElementById('histNextBtn');
    if (!prev || !next) return;
    // Prev (older): disabled if already at the oldest OR if live has no older rolls.
    // From live, prev needs >=2 entries to show something different.
    if (historyViewIdx === -1) {
        prev.disabled = rollHistory.length < 2;
    } else {
        prev.disabled = historyViewIdx >= rollHistory.length - 1;
    }
    next.disabled = historyViewIdx === -1;
}
function restoreLiveState() {
    // Exit history view and return to whatever the user's live cup is.
    if (historyViewIdx === -1) return false;
    historyViewIdx = -1;
    loadCupState(); // reloads the live cup from localStorage (untouched while viewing)
    updateCupDisplay();
    restoreLastRoll(); // restores the most recent result text/breakdown
    updateHistoryNav();
    return true;
}
function navigateHistory(delta) {
    // delta: +1 = older (back in time), -1 = newer (forward toward live)
    loadHistory();
    if (rollHistory.length === 0) return;
    var target;
    if (historyViewIdx === -1 && delta > 0) {
        // From live, "back" should show the PREVIOUS roll (skip idx 0 which is
        // the roll we just made = same as live). If there's only 1 entry, show it.
        target = rollHistory.length >= 2 ? 1 : 0;
    } else if (historyViewIdx === 1 && delta < 0) {
        // From idx 1, "forward" skips idx 0 (identical to live) and returns to live
        target = -1;
    } else {
        target = historyViewIdx + delta;
    }
    if (target < -1) target = -1;
    if (target > rollHistory.length - 1) target = rollHistory.length - 1;
    if (target === historyViewIdx) return;

    if (target === -1) {
        restoreLiveState();
        return;
    }

    // Entering or moving within history view: load the snapshot into cupGroups
    historyViewIdx = target;
    var e = rollHistory[target];
    if (e && e.snapshot) {
        cupGroups = JSON.parse(JSON.stringify(e.snapshot.cupGroups));
        rootOperation = e.snapshot.rootOperation || 'sum';
        activeGroupIdx = (typeof e.snapshot.activeGroupIdx === 'number') ? e.snapshot.activeGroupIdx : 0;
        updateCupDisplay(); // re-renders cup, formula bar, chart (localStorage write is suppressed)
    }
    // Set the result + breakdown from the entry
    if (e) {
        if (e.symbolFaces && e.symbolFaces.length) {
            document.getElementById('result').innerHTML = renderSymbolResult(e.symbolFaces);
            document.getElementById('breakdown').innerHTML = '';
        } else {
            document.getElementById('result').textContent = e.total;
            document.getElementById('breakdown').innerHTML = e.breakdownHtml || e.breakdown || '';
        }
        // Highlight the chart bar that matches this roll's total
        var n = parseInt(e.total);
        if (!isNaN(n)) {
            highlightDistValue(n);
            showProbabilityText(n);
        }
    }
    updateHistoryNav();
}
// ===== Lock / Unlock =====
var cupLocked = false;
function toggleLock() {
    cupLocked = !cupLocked;
    var lockBtn = document.getElementById('lockBtn');
    var diceGrid = document.getElementById('diceGrid');
    var modRows = document.querySelector('.dr-mod-rows');
    var staging = document.getElementById('cupStaging');
    var presetRow = document.getElementById('presets');

    // Hide dice buttons + modifier rows (pack tabs stay visible for switching presets)
    diceGrid.style.display = cupLocked ? 'none' : '';
    modRows.style.display = cupLocked ? 'none' : '';

    // Lock the cup content area via CSS class (uses !important to override
    // pointer-events:auto on .dr-group-section::after and other children).
    // Fav star, roll, trash, and preset chips stay active.
    document.getElementById('cup').classList.toggle('cup-locked', cupLocked);

    // Update wrap class (controls caret position) and lock icon
    var lockWrap = document.getElementById('lockWrap');
    lockWrap.classList.toggle('locked', cupLocked);
    // Closed lock: shackle closed. Open lock: shackle lifted.
    // Locked: shackle seated on body, both legs in.
    // Unlocked: left hinge stays connected (like a real padlock), shackle
    // slides up so the right leg clears the body. Big visible gap.
    var lockSvg = document.getElementById('lockIcon');
    lockSvg.setAttribute('viewBox', '0 -5 24 29');
    lockSvg.innerHTML = cupLocked
        ? '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
        : '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V1a5 5 0 0 1 10 0"/>';
    // Caret glyph stays the same — CSS rotation orbits it from right to bottom

    localStorage.setItem('dice_roller_locked', cupLocked ? '1' : '0');
}
function restoreLockState() {
    if (localStorage.getItem('dice_roller_locked') === '1') toggleLock();
}

/// Shared: update the #prob text without touching the chart rendering
function showProbabilityText(total) { showProbability(total); }
function handleResultClick() {
    // Clicking the result rolls the dice — restoreLiveState happens inside rollDice
    rollDice();
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

// ===== Presets / Game Packs =====
var presetData = {version:2, activePack:null, packs:[], ungrouped:[]};
var presets = [];           // visible preset list (filtered by active pack)
var allPresets = [];         // flat list of ALL presets across packs+ungrouped
var activePresetIdx = -1;   // index into presets (visible list)
var editMode = false;
var editOriginal = null;

function loadPresets() {
    var raw = localStorage.getItem('dice_roller_presets');
    var parsed = null;
    try { parsed = JSON.parse(raw || 'null'); } catch(e) { parsed = null; }

    if (parsed && parsed.version === 2) {
        presetData = parsed;
    } else if (parsed && Array.isArray(parsed)) {
        // Old flat array → migrate to version 2
        parsed = parsed.filter(function(p) { var d = p.children || p.dice; return d && d.length > 0; });
        // Fate dF → d3 migration
        parsed.forEach(function(p) {
            var kids = p.children || p.dice || [];
            if (p.name === 'Fate' && kids.length > 0 && kids.every(function(c){return c.type==='df';})) {
                var n = kids.length; var nk = [];
                for (var i = 0; i < n; i++) nk.push({type:'dx', sides:3});
                p.children = nk; p.dice = nk.slice(); p.modifier = (p.modifier || 0) - 2*n;
            }
        });
        presetData = {version: 2, activePack: null, packs: [], ungrouped: parsed};
        savePresetsToStorage();
    } else {
        presetData = {
            version: 2, activePack: null, packs: [],
            ungrouped: [
                {name:'D&D Stat',children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}],dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}],modifier:0,dropLowest:true,dropHighest:false},
                {name:'Advantage',children:[{type:'d20'},{type:'d20'}],dice:[{type:'d20'},{type:'d20'}],modifier:0,dropLowest:true,dropHighest:false},
                {name:'Disadvantage',children:[{type:'d20'},{type:'d20'}],dice:[{type:'d20'},{type:'d20'}],modifier:0,dropLowest:false,dropHighest:true},
                {name:'Fate',children:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}],dice:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}],modifier:-8,dropLowest:false,dropHighest:false},
            ]
        };
        savePresetsToStorage();
    }
    // Auto-add Formula De example pack for premium users on first encounter
    if (PREMIUM) addFormulaDeExamplePack();
    rebuildPresetViews();
    renderPackTabs();
    renderPresets();
}
function savePresetsToStorage() { localStorage.setItem('dice_roller_presets', JSON.stringify(presetData)); }

function rebuildPresetViews() {
    allPresets = [];
    presetData.ungrouped.forEach(function(p) { allPresets.push(p); });
    presetData.packs.forEach(function(pack) {
        pack.presets.forEach(function(p) { allPresets.push(p); });
    });
    presets = getVisiblePresets();
}
function getVisiblePresets() {
    if (!PREMIUM) return presetData.ungrouped.slice();
    if (presetData.activePack === null) return presetData.ungrouped.slice();
    var pack = presetData.packs.find(function(pk) { return pk.name === presetData.activePack; });
    return pack ? pack.presets.slice() : allPresets.slice();
}

// ===== Pack Management =====
function createPack(name) {
    if (!PREMIUM) return;
    name = (name || '').trim();
    if (!name) return;
    if (presetData.packs.some(function(pk) { return pk.name === name; })) return;
    presetData.packs.push({name: name, presets: []});
    presetData.activePack = name;
    savePresetsToStorage(); rebuildPresetViews(); renderPackTabs(); renderPresets();
}
function deletePack(packIdx) {
    if (packIdx < 0 || packIdx >= presetData.packs.length) return;
    var pack = presetData.packs[packIdx];
    showConfirm('Delete "' + pack.name + '" and all its presets?', function() {
        if (presetData.activePack === pack.name) presetData.activePack = null;
        presetData.packs.splice(packIdx, 1);
        savePresetsToStorage(); rebuildPresetViews(); renderPackTabs(); renderPresets();
    });
}
function renamePack(packIdx) {
    if (packIdx < 0 || packIdx >= presetData.packs.length) return;
    var oldName = presetData.packs[packIdx].name;
    showInlineInput('Rename pack:', oldName, function(newName) {
        newName = (newName || '').trim();
        if (!newName || newName === oldName) return;
        if (presetData.packs.some(function(pk) { return pk.name === newName; })) return;
        presetData.packs[packIdx].name = newName;
        if (presetData.activePack === oldName) presetData.activePack = newName;
        savePresetsToStorage(); renderPackTabs(); renderPresets();
    });
}
function movePresetToPack(presetObj, targetPackName) {
    var idx = presetData.ungrouped.indexOf(presetObj);
    if (idx >= 0) presetData.ungrouped.splice(idx, 1);
    presetData.packs.forEach(function(pk) {
        var pi = pk.presets.indexOf(presetObj);
        if (pi >= 0) pk.presets.splice(pi, 1);
    });
    if (targetPackName === null) { presetData.ungrouped.push(presetObj); }
    else {
        var target = presetData.packs.find(function(pk) { return pk.name === targetPackName; });
        if (target) target.presets.push(presetObj);
    }
    savePresetsToStorage(); rebuildPresetViews(); renderPresets();
}
function showMoveToPackMenu(presetObj) {
    var html = '<div style="display:flex;flex-direction:column;gap:6px;padding:8px">';
    html += '<button style="background:var(--btn-bg);border:1px solid var(--border);border-radius:8px;padding:8px 16px;color:var(--text-bright);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit" onclick="movePresetToPack(window._moveTarget,null);closeModal()">Ungrouped</button>';
    presetData.packs.forEach(function(pk) {
        html += '<button style="background:var(--btn-bg);border:1px solid var(--border);border-radius:8px;padding:8px 16px;color:var(--text-bright);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit" onclick="movePresetToPack(window._moveTarget,&quot;'+pk.name.replace(/"/g,'&amp;quot;')+'&quot;);closeModal()">'+pk.name+'</button>';
    });
    html += '</div>';
    window._moveTarget = presetObj;
    showModal('Move to pack', html);
}
function showModal(title, bodyHtml) {
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };
    overlay.innerHTML = '<div class="dr-modal"><div class="dr-modal-title">' + title + '</div>' + bodyHtml + '</div>';
    document.body.appendChild(overlay);
    window._modalOverlay = overlay;
}
function closeModal() {
    if (window._modalOverlay) { window._modalOverlay.remove(); window._modalOverlay = null; }
}
function selectPackTab(packName) {
    presetData.activePack = packName;
    savePresetsToStorage(); rebuildPresetViews();
    activePresetIdx = -1;
    renderPackTabs(); renderPresets();
}
function promptCreatePack() {
    showInlineInput('Pack name:', '', function(name) { if (name) createPack(name); });
}
function showPackOptions(idx) {
    var pack = presetData.packs[idx];
    if (!pack) return;
    var html = '<div style="display:flex;flex-direction:column;gap:6px;padding:8px">';
    html += '<button style="background:var(--btn-bg);border:1px solid var(--border);border-radius:8px;padding:8px 16px;color:var(--text-bright);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit" onclick="closeModal();renamePack('+idx+')">Rename</button>';
    if (presetData.packs.length > 1) {
        html += '<button style="background:var(--btn-bg);border:1px solid var(--border);border-radius:8px;padding:8px 16px;color:var(--text-bright);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit" onclick="closeModal();showReorderPacks()">Reorder Packs</button>';
    }
    if (pack.presets && pack.presets.length > 0) {
        html += '<button style="background:var(--btn-bg);border:1px solid #58a6ff;border-radius:8px;padding:8px 16px;color:#58a6ff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit" onclick="closeModal();showSubmitPack('+idx+')">Submit to Community</button>';
    }
    html += '<button style="background:var(--btn-bg);border:1px solid #f85149;border-radius:8px;padding:8px 16px;color:#f85149;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit" onclick="closeModal();deletePack('+idx+')">Delete</button>';
    html += '<button style="background:var(--btn-bg);border:1px solid var(--border);border-radius:8px;padding:8px 16px;color:var(--text-muted);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit" onclick="closeModal()">Cancel</button>';
    html += '</div>';
    showModal(pack.name, html);
}
var packLpTimer = null;
function startPackLongPress(idx, e) {
    if (packLpTimer) clearTimeout(packLpTimer);
    packLpTimer = setTimeout(function() { packLpTimer = null; showPackOptions(idx); }, 400);
}
function cancelPackLongPress() { if (packLpTimer) { clearTimeout(packLpTimer); packLpTimer = null; } }

// ===== Pack Tab Rendering =====
function renderPackTabs() {
    var el = document.getElementById('packTabs');
    if (!el) return;
    if (!PREMIUM) {
        el.innerHTML = '<div class="dr-pack-upsell" onclick="showPremiumUpsell()">Organize with Game Packs \\u203A</div>';
        return;
    }
    var html = '<div class="dr-pack-tabs">';
    var allActive = presetData.activePack === null ? ' active' : '';
    html += '<div class="dr-pack-tab' + allActive + '" onclick="selectPackTab(null)">Favs</div>';
    presetData.packs.forEach(function(pk, i) {
        var active = presetData.activePack === pk.name ? ' active' : '';
        var eName = pk.name.replace(/'/g, "\\\\'");
        html += '<div class="dr-pack-tab' + active + '" data-pack-idx="' + i + '" onclick="selectPackTab(\\'' + eName + '\\')" ' +
            'oncontextmenu="event.preventDefault();showPackOptions(' + i + ')" ' +
            'onmousedown="startPackLongPress(' + i + ',event)" onmouseup="cancelPackLongPress()" onmouseleave="cancelPackLongPress()" ' +
            'ontouchstart="startPackLongPress(' + i + ',event)" ontouchend="cancelPackLongPress()" ontouchmove="cancelPackLongPress()"' +
            '>' + pk.name + '</div>';
    });
    html += '<div class="dr-pack-tab add-pack" onclick="promptCreatePack()">+ Pack</div>';
    html += '<div class="dr-pack-tab add-pack" onclick="openPackBrowser()" style="border-color:#58a6ff;color:#58a6ff">Browse</div>';
    html += '</div>';
    el.innerHTML = html;
}

// ===== Pack Reorder Dialog =====
function showSubmitPack(idx) {
    var pack = presetData.packs[idx];
    if (!pack || !pack.presets || !pack.presets.length) return;
    var savedHandle = localStorage.getItem('dice_community_handle') || '';
    var presetList = pack.presets.map(function(p) { return esc(p.name || '?'); }).join(', ');
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal" style="max-width:340px">' +
        '<div class="dr-modal-title">Submit to Community</div>' +
        '<input type="text" id="submitPackName" value="' + esc(pack.name) + '" placeholder="Pack name" style="margin-bottom:8px" autocomplete="off">' +
        '<input type="text" id="submitPackHandle" value="' + esc(savedHandle) + '" placeholder="Your name or handle" style="margin-bottom:8px" autocomplete="off">' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px"><strong>' + pack.presets.length + ' presets:</strong> ' + presetList + '</div>' +
        '<div class="dr-modal-btns">' +
        '<button class="dr-modal-cancel" onclick="closeModal()">Cancel</button>' +
        '<button class="dr-modal-ok" id="submitPackBtn">Submit</button>' +
        '</div></div>';
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };
    window._modalOverlay = overlay;
    document.getElementById('submitPackBtn').onclick = function() {
        var name = document.getElementById('submitPackName').value.trim();
        var handle = document.getElementById('submitPackHandle').value.trim();
        if (!name || !handle) { showToast('Name and handle required'); return; }
        localStorage.setItem('dice_community_handle', handle);
        this.disabled = true;
        this.textContent = 'Submitting...';
        fetch('/dice/pack/submit', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: name, submitter: handle, presets: pack.presets})
        }).then(function(r) { return r.json(); }).then(function(d) {
            closeModal();
            if (d.ok) showToast('Pack submitted for review!');
            else showToast(d.error || 'Submit failed');
        }).catch(function() { closeModal(); showToast('Network error'); });
    };
    document.getElementById('submitPackName').focus();
}

function showReorderPacks() {
    var html = '<div id="reorderList" style="display:flex;flex-direction:column;gap:4px;padding:8px">';
    presetData.packs.forEach(function(pk, i) {
        html += '<div class="dr-reorder-item" data-idx="'+i+'" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--btn-bg);border:1px solid var(--border);border-radius:8px;cursor:grab;touch-action:none">' +
            '<span style="color:var(--text-dim);font-size:16px">\\u2261</span>' +
            '<span style="flex:1;color:var(--text-bright);font-size:14px;font-weight:600">'+esc(pk.name)+'</span>' +
            '<span style="display:flex;flex-direction:column;gap:2px">' +
                '<button onclick="event.stopPropagation();reorderPackMove('+i+',-1)" style="background:none;border:none;color:'+(i===0?'var(--text-dim)':'var(--text-bright)')+';font-size:14px;cursor:pointer;padding:0 4px;opacity:'+(i===0?'0.3':'1')+'">\\u25B2</button>' +
                '<button onclick="event.stopPropagation();reorderPackMove('+i+',1)" style="background:none;border:none;color:'+(i===presetData.packs.length-1?'var(--text-dim)':'var(--text-bright)')+';font-size:14px;cursor:pointer;padding:0 4px;opacity:'+(i===presetData.packs.length-1?'0.3':'1')+'">\\u25BC</button>' +
            '</span>' +
        '</div>';
    });
    html += '</div>';
    showModal('Reorder Packs', html);
}
function reorderPackMove(idx, dir) {
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= presetData.packs.length) return;
    var pack = presetData.packs.splice(idx, 1)[0];
    presetData.packs.splice(newIdx, 0, pack);
    savePresetsToStorage();
    renderPackTabs();
    // Re-render the dialog
    closeModal();
    showReorderPacks();
}

// ===== Game Pack Catalog =====
var GAME_PACK_CATALOG = [
    {
        id: 'formula-de', name: 'Formula De', category: 'Board Games',
        desc: 'Racing game with gear-specific dice — shift up for speed, down for control.',
        presets: [
            {name:'1st Gear', children:[{type:'custom',faces:[1,1,2,2]}], dice:[{type:'custom',faces:[1,1,2,2]}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'2nd Gear', children:[{type:'custom',faces:[2,2,3,3,4,4]}], dice:[{type:'custom',faces:[2,2,3,3,4,4]}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'3rd Gear', children:[{type:'custom',faces:[4,5,6,7,8]}], dice:[{type:'custom',faces:[4,5,6,7,8]}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'4th Gear', children:[{type:'custom',faces:[7,7,8,8,9,9,10,10,11,11,12]}], dice:[{type:'custom',faces:[7,7,8,8,9,9,10,10,11,11,12]}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'5th Gear', children:[{type:'custom',faces:[11,12,13,14,15,16,17,18,19,20]}], dice:[{type:'custom',faces:[11,12,13,14,15,16,17,18,19,20]}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'6th Gear', children:[{type:'custom',faces:[21,21,22,23,24,25,26,27,28,29,30]}], dice:[{type:'custom',faces:[21,21,22,23,24,25,26,27,28,29,30]}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'dnd-5e', name: 'D&D 5e', category: 'TTRPGs',
        desc: 'The most popular RPG — advantage, stat rolls, damage, and saving throws.',
        presets: [
            {name:'Stat Roll', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:true, dropHighest:false},
            {name:'Advantage', children:[{type:'d20'},{type:'d20'}], dice:[{type:'d20'},{type:'d20'}], modifier:0, dropLowest:true, dropHighest:false},
            {name:'Disadvantage', children:[{type:'d20'},{type:'d20'}], dice:[{type:'d20'},{type:'d20'}], modifier:0, dropLowest:false, dropHighest:true},
            {name:'Attack d20', children:[{type:'d20'}], dice:[{type:'d20'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Fireball 8d6', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Sneak 2d6', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Greatsword 2d6', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Healing Word d4', children:[{type:'d4'}], dice:[{type:'d4'}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'pathfinder-2e', name: 'Pathfinder 2e', category: 'TTRPGs',
        desc: 'Three-action system with crit success/failure thresholds and MAP tracking.',
        presets: [
            {name:'Attack', children:[{type:'d20'}], dice:[{type:'d20'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'2nd Attack (MAP -5)', children:[{type:'d20'}], dice:[{type:'d20'}], modifier:-5, dropLowest:0, dropHighest:0},
            {name:'3rd Attack (MAP -10)', children:[{type:'d20'}], dice:[{type:'d20'}], modifier:-10, dropLowest:0, dropHighest:0},
            {name:'Damage d12', children:[{type:'d12'}], dice:[{type:'d12'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Damage 2d8', children:[{type:'d8'},{type:'d8'}], dice:[{type:'d8'},{type:'d8'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Hero Point d20', children:[{type:'d20'},{type:'d20'}], dice:[{type:'d20'},{type:'d20'}], modifier:0, dropLowest:true, dropHighest:false},
            {name:'Flat Check d20', children:[{type:'d20'}], dice:[{type:'d20'}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'pbta', name: 'PbtA (Powered by the Apocalypse)', category: 'TTRPGs',
        desc: 'Covers 100+ games: Apocalypse World, Dungeon World, Monster of the Week, Masks, and more. 2d6+stat, 10+=strong hit, 7-9=weak hit, 6-=miss.',
        presets: [
            {name:'Move (+0)', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Move (+1)', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:1, dropLowest:0, dropHighest:0},
            {name:'Move (+2)', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:2, dropLowest:0, dropHighest:0},
            {name:'Move (+3)', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:3, dropLowest:0, dropHighest:0},
            {name:'Move (-1)', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:-1, dropLowest:0, dropHighest:0},
            {name:'Move (-2)', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:-2, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'blades', name: 'Blades in the Dark', category: 'TTRPGs',
        desc: 'FitD family: roll d6 pool, take highest. 6=full success, 4-5=partial, 1-3=bad outcome. Also covers Scum & Villainy, Band of Blades, etc.',
        presets: [
            {name:'Zero Dice (2d6 take low)', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:true},
            {name:'1d6', children:[{type:'d6'}], dice:[{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'2d6 (take best)', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:0, dropLowest:true, dropHighest:0},
            {name:'3d6 (take best)', children:[{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:2, dropHighest:0},
            {name:'4d6 (take best)', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:3, dropHighest:0},
            {name:'Fortune 1d6', children:[{type:'d6'}], dice:[{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Resistance 1d6', children:[{type:'d6'}], dice:[{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'fate', name: 'FATE / Fudge', category: 'TTRPGs',
        desc: '4 Fudge dice (+, -, blank) producing -4 to +4 plus skill. Covers FATE Core, Accelerated, Condensed, and all Fudge games.',
        presets: [
            {name:'4dF (+0)', children:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], dice:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], modifier:-8, dropLowest:0, dropHighest:0},
            {name:'4dF (+1)', children:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], dice:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], modifier:-7, dropLowest:0, dropHighest:0},
            {name:'4dF (+2)', children:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], dice:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], modifier:-6, dropLowest:0, dropHighest:0},
            {name:'4dF (+3)', children:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], dice:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], modifier:-5, dropLowest:0, dropHighest:0},
            {name:'4dF (+4)', children:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], dice:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], modifier:-4, dropLowest:0, dropHighest:0},
            {name:'4dF (+5)', children:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], dice:[{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3},{type:'dx',sides:3}], modifier:-3, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'dcc', name: 'Dungeon Crawl Classics', category: 'TTRPGs',
        desc: 'The Dice Chain! Funky dice you probably lack: d3, d5, d7, d14, d16, d24, d30. Digital is the only practical way to play.',
        presets: [
            {name:'d3', children:[{type:'dx',sides:3}], dice:[{type:'dx',sides:3}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'d5', children:[{type:'dx',sides:5}], dice:[{type:'dx',sides:5}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'d7', children:[{type:'dx',sides:7}], dice:[{type:'dx',sides:7}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'d14', children:[{type:'dx',sides:14}], dice:[{type:'dx',sides:14}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'d16', children:[{type:'dx',sides:16}], dice:[{type:'dx',sides:16}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'d24', children:[{type:'dx',sides:24}], dice:[{type:'dx',sides:24}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'d30', children:[{type:'dx',sides:30}], dice:[{type:'dx',sides:30}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Funnel 3d6', children:[{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'call-of-cthulhu', name: 'Call of Cthulhu', category: 'TTRPGs',
        desc: 'd100 roll-under with bonus/penalty dice. Pushed rolls and luck spending.',
        presets: [
            {name:'d100', children:[{type:'dx',sides:100}], dice:[{type:'dx',sides:100}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'d100 Bonus (2 tens)', children:[{type:'dx',sides:10},{type:'dx',sides:10},{type:'dx',sides:10}], dice:[{type:'dx',sides:10},{type:'dx',sides:10},{type:'dx',sides:10}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'d100 Penalty (2 tens)', children:[{type:'dx',sides:10},{type:'dx',sides:10},{type:'dx',sides:10}], dice:[{type:'dx',sides:10},{type:'dx',sides:10},{type:'dx',sides:10}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Damage 1d3', children:[{type:'dx',sides:3}], dice:[{type:'dx',sides:3}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Damage 1d6', children:[{type:'d6'}], dice:[{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Damage 1d8', children:[{type:'d8'}], dice:[{type:'d8'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Luck d100', children:[{type:'dx',sides:100}], dice:[{type:'dx',sides:100}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'savage-worlds', name: 'Savage Worlds', category: 'TTRPGs',
        desc: 'Exploding dice with a Wild Die (d6). Trait dice step from d4 to d12. Raises on every +4 over target.',
        presets: [
            {name:'d4 + Wild d6', children:[{type:'d4'},{type:'d6'}], dice:[{type:'d4'},{type:'d6'}], modifier:0, dropLowest:true, dropHighest:0, exploding:true},
            {name:'d6 + Wild d6', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:0, dropLowest:true, dropHighest:0, exploding:true},
            {name:'d8 + Wild d6', children:[{type:'d8'},{type:'d6'}], dice:[{type:'d8'},{type:'d6'}], modifier:0, dropLowest:true, dropHighest:0, exploding:true},
            {name:'d10 + Wild d6', children:[{type:'d10'},{type:'d6'}], dice:[{type:'d10'},{type:'d6'}], modifier:0, dropLowest:true, dropHighest:0, exploding:true},
            {name:'d12 + Wild d6', children:[{type:'d12'},{type:'d6'}], dice:[{type:'d12'},{type:'d6'}], modifier:0, dropLowest:true, dropHighest:0, exploding:true},
            {name:'Damage 2d6', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0, exploding:true},
            {name:'Damage 3d6', children:[{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0, exploding:true},
        ]
    },
    {
        id: 'yahtzee', name: 'Yahtzee', category: 'Party Games',
        desc: 'The classic dice game. Roll 5d6, keep what you like, reroll the rest up to 3 times.',
        presets: [
            {name:'5d6', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'king-of-tokyo', name: 'King of Tokyo', category: 'Board Games',
        desc: 'Yahtzee-style monster brawl. 6 custom dice with Claws, Hearts, Lightning, and numbers 1-3.',
        presets: [
            {name:'6 Power Dice', children:[{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']},{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']},{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']},{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']},{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']},{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']}], dice:[{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']},{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']},{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']},{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']},{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']},{type:'custom',faces:[1,2,3,'Claw','Heart','Bolt']}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'zombie-dice', name: 'Zombie Dice', category: 'Party Games',
        desc: 'Push-your-luck with 3 dice colors. Green=easy brains, Yellow=medium, Red=dangerous. Shotguns end your turn.',
        presets: [
            {name:'Green Die', children:[{type:'custom',faces:['Brain','Brain','Brain','Step','Step','Shot']}], dice:[{type:'custom',faces:['Brain','Brain','Brain','Step','Step','Shot']}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Yellow Die', children:[{type:'custom',faces:['Brain','Brain','Step','Step','Shot','Shot']}], dice:[{type:'custom',faces:['Brain','Brain','Step','Step','Shot','Shot']}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Red Die', children:[{type:'custom',faces:['Brain','Step','Step','Shot','Shot','Shot']}], dice:[{type:'custom',faces:['Brain','Step','Step','Shot','Shot','Shot']}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'catan', name: 'Catan', category: 'Board Games',
        desc: 'The classic resource game. Roll 2d6 for production — every settler knows the probability of 6 and 8.',
        presets: [
            {name:'Production 2d6', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Robber d6', children:[{type:'d6'}], dice:[{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'shadowrun', name: 'Shadowrun', category: 'TTRPGs',
        desc: 'Roll pools of d6s, count 5s and 6s as hits. More than half 1s = glitch. Large pools (10-20+ dice).',
        presets: [
            {name:'Pool 4d6', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0, countSuccess:5},
            {name:'Pool 6d6', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0, countSuccess:5},
            {name:'Pool 8d6', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0, countSuccess:5},
            {name:'Pool 10d6', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0, countSuccess:5},
            {name:'Pool 12d6', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0, countSuccess:5},
            {name:'Initiative d6', children:[{type:'d6'}], dice:[{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'ironsworn', name: 'Ironsworn / Starforged', category: 'Solo RPGs',
        desc: 'Action die (d6+stat) vs two Challenge dice (d10). Strong hit=beat both, weak hit=beat one, miss=beat neither.',
        presets: [
            {name:'Action d6', children:[{type:'d6'}], dice:[{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Challenge 2d10', children:[{type:'d10'},{type:'d10'}], dice:[{type:'d10'},{type:'d10'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'Oracle d100', children:[{type:'dx',sides:100}], dice:[{type:'dx',sides:100}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'farkle', name: 'Farkle', category: 'Party Games',
        desc: 'Push-your-luck scoring. Roll 6d6, score 1s and 5s, three-of-a-kind, straights, and more.',
        presets: [
            {name:'6d6', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'5d6', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'4d6', children:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'3d6', children:[{type:'d6'},{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'2d6', children:[{type:'d6'},{type:'d6'}], dice:[{type:'d6'},{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
            {name:'1d6', children:[{type:'d6'}], dice:[{type:'d6'}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'wod', name: 'World of Darkness', category: 'TTRPGs',
        desc: 'd10 pools — count 8+ as successes. Covers Vampire, Werewolf, Mage, Hunter, and all Chronicles of Darkness games.',
        presets: [
            {name:'Pool 3d10', children:[{type:'d10'},{type:'d10'},{type:'d10'}], dice:[{type:'d10'},{type:'d10'},{type:'d10'}], modifier:0, dropLowest:0, dropHighest:0, countSuccess:8},
            {name:'Pool 5d10', children:[{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'}], dice:[{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'}], modifier:0, dropLowest:0, dropHighest:0, countSuccess:8},
            {name:'Pool 7d10', children:[{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'}], dice:[{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'}], modifier:0, dropLowest:0, dropHighest:0, countSuccess:8},
            {name:'Pool 10d10', children:[{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'}], dice:[{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'},{type:'d10'}], modifier:0, dropLowest:0, dropHighest:0, countSuccess:8},
            {name:'Humanity d10', children:[{type:'d10'}], dice:[{type:'d10'}], modifier:0, dropLowest:0, dropHighest:0},
        ]
    },
    {
        id: 'slots', name: 'Slot Machine', category: 'Casino',
        desc: 'Classic slot machine reels with weighted symbols. Pull the lever!',
        presets: (function() {
            var reel = ['Blank','Blank','Blank','Blank','Blank','Blank','Blank','Blank',
                        'Cherry','Cherry','Cherry','Cherry','Cherry','Cherry','Cherry','Cherry','Cherry',
                        'Lemon','Lemon','Lemon','Lemon','Lemon','Lemon','Lemon',
                        'Bell','Bell','Bell',
                        '7','7',
                        'Bar'];
            var d = {type:'custom',faces:reel};
            return [
                {name:'Mechanical', children:[d,d,d], dice:[d,d,d], modifier:0, dropLowest:0, dropHighest:0},
            ];
        })()
    },
];

// ===== Pack Install/Uninstall =====
function _findPack(packId) {
    return GAME_PACK_CATALOG.find(function(c) { return c.id === packId; })
        || _communityPacks.find(function(c) { return c.id === packId; });
}
function isPackInstalled(packId) {
    var cat = _findPack(packId);
    return cat && presetData.packs.some(function(pk) { return pk.name === cat.name; });
}
function installPack(packId) {
    if (!PREMIUM) return;
    var cat = _findPack(packId);
    if (!cat) return;
    if (presetData.packs.some(function(pk) { return pk.name === cat.name; })) return;
    presetData.packs.push({name: cat.name, presets: JSON.parse(JSON.stringify(cat.presets))});
    presetData.activePack = cat.name;
    savePresetsToStorage(); rebuildPresetViews(); renderPackTabs(); renderPresets();
    renderPackBrowser();
}
function uninstallPack(packId) {
    var cat = _findPack(packId);
    if (!cat) return;
    var idx = -1;
    presetData.packs.forEach(function(pk, i) { if (pk.name === cat.name) idx = i; });
    if (idx < 0) return;
    if (presetData.activePack === cat.name) presetData.activePack = null;
    presetData.packs.splice(idx, 1);
    savePresetsToStorage(); rebuildPresetViews(); renderPackTabs(); renderPresets();
    renderPackBrowser();
}

// Migrate: if old Formula De was auto-added, keep it (already installed)
function addFormulaDeExamplePack() {
    if (presetData.packs.some(function(pk) { return pk.name === 'Formula De'; })) return;
    installPack('formula-de');
}

// ===== Pack Browser =====
var packBrowserReadOnly = false;
function openPackBrowser() {
    if (!PREMIUM) { showPremiumUpsell(); return; }
    packBrowserReadOnly = false;
    _communityLoaded = false; // Refresh community packs
    document.getElementById('packBrowser').classList.add('open');
    document.getElementById('pbSearch').value = '';
    renderPackBrowser();
    document.getElementById('pbSearch').focus();
}
function showGameList() {
    packBrowserReadOnly = true;
    document.getElementById('packBrowser').classList.add('open');
    document.getElementById('pbSearch').value = '';
    renderPackBrowser();
    document.getElementById('pbSearch').focus();
}
function closePackBrowser() {
    document.getElementById('packBrowser').classList.remove('open');
    packBrowserReadOnly = false;
}
var _communityPacks = [];
var _communityLoaded = false;
function loadCommunityPacks(cb) {
    fetch('/dice/packs/community').then(function(r) { return r.json(); }).then(function(packs) {
        _communityPacks = packs.map(function(p) {
            p.desc = 'by ' + (p.submitter || 'anonymous');
            return p;
        });
        _communityLoaded = true;
        if (cb) cb();
    }).catch(function() { _communityLoaded = true; if (cb) cb(); });
}
function renderPackBrowser() {
    var el = document.getElementById('pbList');
    if (!el) return;
    // Load community packs on first render
    if (!_communityLoaded) { loadCommunityPacks(renderPackBrowser); return; }
    var allPacks = GAME_PACK_CATALOG.concat(_communityPacks);
    var q = (document.getElementById('pbSearch').value || '').toLowerCase().trim();
    var filtered = allPacks.filter(function(pack) {
        if (!q) return true;
        return pack.name.toLowerCase().indexOf(q) >= 0 ||
               (pack.desc || '').toLowerCase().indexOf(q) >= 0 ||
               pack.category.toLowerCase().indexOf(q) >= 0;
    });
    if (filtered.length === 0) {
        el.innerHTML = '<div class="dr-pb-empty">No packs match your search</div>';
        return;
    }
    // Group by category
    var cats = {};
    filtered.forEach(function(pack) {
        if (!cats[pack.category]) cats[pack.category] = [];
        cats[pack.category].push(pack);
    });
    var catOrder = ['TTRPGs', 'Solo RPGs', 'Board Games', 'Party Games', 'Casino', 'Community'];
    var html = '';
    catOrder.forEach(function(cat) {
        if (!cats[cat]) return;
        html += '<div class="dr-pb-category">' + cat + '</div>';
        cats[cat].forEach(function(pack) {
            var installed = isPackInstalled(pack.id);
            var btnCls, btnText, action;
            if (packBrowserReadOnly) {
                btnCls = 'dr-pb-btn installed';
                btnText = '\\u2728 Premium';
                action = 'closePackBrowser();showPremiumUpsell()';
            } else if (installed) {
                btnCls = 'dr-pb-btn installed';
                btnText = 'Installed';
                action = 'uninstallPack(\\'' + pack.id + '\\')';
            } else {
                btnCls = 'dr-pb-btn install';
                btnText = 'Install';
                action = 'installPack(\\'' + pack.id + '\\')';
            }
            html += '<div class="dr-pb-card">' +
                '<div class="dr-pb-card-info">' +
                    '<div class="dr-pb-card-name">' + pack.name + '</div>' +
                    '<div class="dr-pb-card-desc">' + pack.desc + '</div>' +
                    '<div class="dr-pb-card-meta">' + pack.presets.length + ' preset' + (pack.presets.length === 1 ? '' : 's') + '</div>' +
                '</div>' +
                '<button class="' + btnCls + '" onclick="' + action + '">' + btnText + '</button>' +
                '</div>';
        });
    });
    el.innerHTML = html;
}

function getCupSignature() {
    // Build a comparable string from current cup state
    var g = activeGroup();
    var counts={};
    cupDice.forEach(function(d){
        var k=d.type==='custom'&&d.faces?'c['+d.faces.join(',')+']':d.type==='dx'?'d'+(d.sides||6):d.type;
        counts[k]=(counts[k]||0)+1;
    });
    var parts=[]; for(var t in counts) parts.push(counts[t]+t);
    parts.sort();
    if(modifier) parts.push('m'+modifier);
    if(dropLowest) parts.push('dl' + (dropLowest > 1 ? dropLowest : ''));
    if(dropHighest) parts.push('dh' + (dropHighest > 1 ? dropHighest : ''));
    if(g && g.floor) parts.push('fl' + g.floor);
    if(g && g.cap) parts.push('cp' + g.cap);
    if(g && g.exploding) parts.push('x');
    if(g && g.clampMin > 1) parts.push('mn'+g.clampMin);
    if(g && g.clampMax) parts.push('mx'+g.clampMax);
    if(g && g.countSuccess) parts.push('s'+g.countSuccess);
    return parts.join('|');
}

function getPresetSignature(p) {
    var counts={};
    var dice = p.children || p.dice || [];
    dice.forEach(function(d){
        var k=d.type==='custom'&&d.faces?'c['+d.faces.join(',')+']':d.type==='dx'?'d'+(d.sides||6):d.type;
        counts[k]=(counts[k]||0)+1;
    });
    var parts=[]; for(var t in counts) parts.push(counts[t]+t);
    parts.sort();
    if(p.modifier) parts.push('m'+p.modifier);
    if(p.dropLowest) parts.push('dl' + (p.dropLowest > 1 ? p.dropLowest : ''));
    if(p.dropHighest) parts.push('dh' + (p.dropHighest > 1 ? p.dropHighest : ''));
    if(p.floor) parts.push('fl' + p.floor);
    if(p.cap) parts.push('cp' + p.cap);
    if(p.exploding) parts.push('x');
    if(p.clampMin > 1) parts.push('mn'+p.clampMin);
    if(p.clampMax) parts.push('mx'+p.clampMax);
    if(p.countSuccess) parts.push('s'+p.countSuccess);
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
    if (!window._presetJustLoaded) {
        var match = findMatchingPreset();
        if(!editMode) activePresetIdx = match;
    }

    // Star
    var star = document.getElementById('favStar');
    star.innerHTML = activePresetIdx >= 0 ? '\\u2605' : '\\u2606';
    star.style.color = activePresetIdx >= 0 ? '#fff' : '#ffa657';
    star.classList.toggle('fav-active', activePresetIdx >= 0);

    // Cup border
    document.getElementById('cup').classList.toggle('editing', editMode);

    // Preset label in cup
    var label = document.getElementById('cupPresetLabel');
    label.classList.remove('editing');
    if(activePresetIdx >= 0) {
        var name = presets[activePresetIdx].name;
        label.onclick = null;
        var editNote = !cupLocked ? '<div class="dr-tap-hint" style="margin-top:2px">changes will edit this favorite</div>' : '';
        label.innerHTML = name + ' <button class="dr-edit-btn" onclick="event.stopPropagation();renamePreset()" title="Rename">\\u270E</button>' + editNote;
    } else {
        label.innerHTML = '';
        label.onclick = null;
    }

    // Clean up any stale edit-mode float buttons (legacy)
    var existingUndo = document.getElementById('undoFloat');
    var existingDone = document.getElementById('doneFloat');
    if(existingUndo) existingUndo.remove();
    if(existingDone) existingDone.remove();
    document.getElementById('editBanner').style.display = 'none';

    renderPackTabs();
    renderPresets();
}

function renderPresets() {
    var el=document.getElementById('presets'),html='';
    presets.forEach(function(p,i) {
        var expr = buildGroupFormula(p);
        var cls = 'dr-preset-chip';
        if(i === activePresetIdx) cls += ' active';
        var longPress = (PREMIUM && presetData.packs.length > 0) ?
            'oncontextmenu="event.preventDefault();showMoveToPackMenu(presets['+i+'])" ' +
            'onmousedown="startChipLongPress('+i+',event)" onmouseup="cancelChipLongPress()" onmouseleave="cancelChipLongPress()" ' +
            'ontouchstart="startChipLongPress('+i+',event)" ontouchend="cancelChipLongPress()" ontouchmove="cancelChipLongPress()"' : '';
        html+='<div class="'+cls+'" onclick="loadPreset('+i+')" '+longPress+'>' +
            '<div class="dr-preset-name">'+p.name+'</div>' +
            '<div class="dr-preset-expr">'+expr+'</div></div>';
    });
    if (presets.length === 0 && PREMIUM && presetData.activePack !== null) {
        html = '<div style="color:var(--text-dim);font-size:13px;font-style:italic;padding:8px 0;text-align:center">No favorites in this pack</div>';
    }
    el.innerHTML=html;
}
var chipLpTimer = null;
function startChipLongPress(idx, e) {
    if (chipLpTimer) clearTimeout(chipLpTimer);
    chipLpTimer = setTimeout(function() { chipLpTimer = null; showMoveToPackMenu(presets[idx]); }, 400);
}
function cancelChipLongPress() { if (chipLpTimer) { clearTimeout(chipLpTimer); chipLpTimer = null; } }

function loadPreset(i) {
    if(editMode) return;
    var p=presets[i];
    // Detect multi-root wrapper: children are all groups with type:'group'
    var kids = p.children || p.dice || [];
    var isMultiRoot = kids.length > 0 && kids.every(function(c){return c.type === 'group';})
        && !p.dropLowest && !p.dropHighest && !p.exploding && !p.modifier && !p.floor && !p.cap;
    if (isMultiRoot) {
        // Multi-root preset: each child is a root group
        cupGroups = JSON.parse(JSON.stringify(kids));
        rootOperation = p.operation || 'sum';
    } else {
        // Single-root preset: rebuild from the preset's flat fields
        var g = makeGroup('');
        g.children = JSON.parse(JSON.stringify(kids));
        g.modifier = p.modifier || 0;
        g.dropLowest = (typeof p.dropLowest === 'number') ? p.dropLowest : (p.dropLowest ? 1 : 0);
        g.dropHighest = (typeof p.dropHighest === 'number') ? p.dropHighest : (p.dropHighest ? 1 : 0);
        g.operation = p.operation || 'sum';
        g.modifiers = p.modifiers || {keep:null, clamp:null};
        g.repeat = p.repeat || 1;
        g.exploding = !!p.exploding;
        if (p.clampMin && p.clampMin > 1) g.clampMin = p.clampMin;
        if (p.clampMax) g.clampMax = p.clampMax;
        if (p.countSuccess) g.countSuccess = p.countSuccess;
        if (p.floor) g.floor = p.floor;
        if (p.cap) g.cap = p.cap;
        cupGroups = [g];
        rootOperation = 'sum';
    }
    activeGroupIdx = cupGroups.length > 1 ? -1 : 0;
    selectedDieId = null;
    var ag = cupGroups.length === 1 ? cupGroups[0] : null;
    document.getElementById('dropBtn').classList.toggle('on', !!(ag && ag.dropLowest));
    document.getElementById('dropHBtn').classList.toggle('on', !!(ag && ag.dropHighest));
    activePresetIdx = i;
    window._presetJustLoaded = true;
    updateCupDisplay();
    renderPresets();
    window._presetJustLoaded = false;
}

function toggleFavorite() {
    if(editMode) return;
    if(activePresetIdx >= 0) {
        // Remove favorite — find in presetData and remove from correct location
        var toRemove = presets[activePresetIdx];
        showConfirm('Remove "'+toRemove.name+'"?', function() {
            var ri = presetData.ungrouped.indexOf(toRemove);
            if (ri >= 0) presetData.ungrouped.splice(ri, 1);
            presetData.packs.forEach(function(pk) {
                var pi = pk.presets.indexOf(toRemove);
                if (pi >= 0) pk.presets.splice(pi, 1);
            });
            activePresetIdx = -1;
            savePresetsToStorage();
            rebuildPresetViews();
            updateFavState();
        });
    } else {
        // Save as new favorite — must have dice
        if(cupDice.length===0) return;
        if(!PREMIUM && presetData.ungrouped.length >= MAX_FREE_PRESETS) {
            showReplacePresetDialog();
            return;
        }
        showInlineInput('Favorite name:', '', function(name) {
            if(!name) return;
            var preset;
            if (cupGroups.length === 1) {
                preset = JSON.parse(JSON.stringify(cupGroups[0]));
            } else {
                preset = makeGroup('');
                preset.children = JSON.parse(JSON.stringify(cupGroups));
                preset.operation = rootOperation;
            }
            preset.name = name;
            preset.dice = preset.children;
            // Save to active pack or ungrouped
            if (PREMIUM && presetData.activePack !== null) {
                var targetPack = presetData.packs.find(function(pk) { return pk.name === presetData.activePack; });
                if (targetPack) targetPack.presets.push(preset);
                else presetData.ungrouped.push(preset);
            } else {
                presetData.ungrouped.push(preset);
            }
            savePresetsToStorage();
            rebuildPresetViews();
            activePresetIdx = presets.indexOf(preset);
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
        activeGroup().floor = editOriginal.floor || 0;
        activeGroup().cap = editOriginal.cap || 0;
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

function getAllDice() {
    // Collect all dice from all groups (flat)
    var all = [];
    function walk(g) {
        g.children.forEach(function(c) {
            if (c.type === 'group') walk(c);
            else all.push(c);
        });
    }
    cupGroups.forEach(walk);
    return all;
}
// Merge this group's own modifiers over an inherited parent context. Nested groups
// override ancestor modifiers for the same key (a child's own non-empty value wins).
function mergeGroupCtx(g, parentCtx) {
    parentCtx = parentCtx || {};
    return {
        exploding: g.exploding || parentCtx.exploding || false,
        clampMin: (g.clampMin && g.clampMin > 1) ? g.clampMin : (parentCtx.clampMin || 0),
        clampMax: g.clampMax || parentCtx.clampMax || 0,
        countSuccess: g.countSuccess || parentCtx.countSuccess || 0
    };
}
// Collect all dice with modifiers inherited from the full ancestor chain. Deeper
// groups override ancestor values; per-die modifiers take precedence over both.
function getEffectiveDice() {
    var all = [];
    function walk(g, parentCtx) {
        var ctx = mergeGroupCtx(g, parentCtx);
        g.children.forEach(function(c) {
            if (c.type === 'group') { walk(c, ctx); return; }
            var eff = {};
            for (var k in c) eff[k] = c[k];
            if (ctx.exploding && !eff.exploding) eff.exploding = true;
            if (ctx.clampMin && !(eff.clampMin > 1)) eff.clampMin = ctx.clampMin;
            if (ctx.clampMax && !eff.clampMax) eff.clampMax = ctx.clampMax;
            if (ctx.countSuccess && !eff.countSuccess) eff.countSuccess = ctx.countSuccess;
            all.push(eff);
        });
    }
    cupGroups.forEach(function(g){ walk(g, {}); });
    return all;
}
// Collect effective dice for a single root group (walking its sub-groups with
// ancestor-merged modifiers). Used by calcDistribution to compute per-group distributions.
function effectiveDiceForGroup(rootG) {
    var dice = [];
    function walk(g, parentCtx) {
        var ctx = mergeGroupCtx(g, parentCtx);
        g.children.forEach(function(c) {
            if (c.type === 'group') { walk(c, ctx); return; }
            var eff = {};
            for (var k in c) eff[k] = c[k];
            if (ctx.exploding && !eff.exploding) eff.exploding = true;
            if (ctx.clampMin && !(eff.clampMin > 1)) eff.clampMin = ctx.clampMin;
            if (ctx.clampMax && !eff.clampMax) eff.clampMax = ctx.clampMax;
            if (ctx.countSuccess && !eff.countSuccess) eff.countSuccess = ctx.countSuccess;
            dice.push(eff);
        });
    }
    walk(rootG, {});
    return dice;
}
// Convolve two distributions (sum).
function convolveDist(a, b) {
    var r = {};
    for (var k1 in a) for (var k2 in b) {
        var s = parseInt(k1) + parseInt(k2);
        r[s] = (r[s] || 0) + a[k1] * b[k2];
    }
    return r;
}
// Negate a distribution (for subtraction).
function negateDist(d) {
    var r = {};
    for (var k in d) r[-parseInt(k)] = d[k];
    return r;
}
function calcDistribution() {
    // Multi-root-group: compute per group and combine via rootOperation
    if (cupGroups.length > 1) {
        var dists = [];
        for (var ri = 0; ri < cupGroups.length; ri++) {
            var d = calcRootGroupDist(cupGroups[ri]);
            if (d) d = applyFloorCapDist(d, cupGroups[ri]);
            if (d) dists.push(d);
        }
        if (dists.length === 0) return null;
        if (dists.length === 1) return dists[0];
        var combined;
        if (rootOperation === 'minus') {
            combined = dists[0];
            for (var i = 1; i < dists.length; i++) combined = convolveDist(combined, negateDist(dists[i]));
        } else {
            // sum (default)
            combined = dists[0];
            for (var i = 1; i < dists.length; i++) combined = convolveDist(combined, dists[i]);
        }
        return combined;
    }
    var singleDist = calcRootGroupDist(cupGroups[0]);
    return singleDist ? applyFloorCapDist(singleDist, cupGroups[0]) : null;
}
function applyFloorCapDist(dist, g) {
    if (!g || (!g.floor && !g.cap)) return dist;
    var clamped = {};
    for (var k in dist) {
        var v = parseInt(k);
        if (g.floor && v < g.floor) v = g.floor;
        if (g.cap && v > g.cap) v = g.cap;
        clamped[v] = (clamped[v] || 0) + dist[k];
    }
    return clamped;
}
function calcRootGroupDist(rootG) {
    // Uses the root group's own dropLowest/dropHighest/modifier and its descendant
    // dice (with inherited modifiers merged).
    var allDice = effectiveDiceForGroup(rootG);
    if (allDice.length === 0) return null;
    var rollable = allDice.filter(function(d) { return dieRanges[d.type] || d.type === 'dx' || d.type === 'df' || d.type === 'coin' || d.type === 'custom'; });
    if (rollable.length === 0) return null;
    var gDropLo = (typeof rootG.dropLowest === 'number' ? rootG.dropLowest : (rootG.dropLowest ? 1 : 0));
    var gDropHi = (typeof rootG.dropHighest === 'number' ? rootG.dropHighest : (rootG.dropHighest ? 1 : 0));
    var gModifier = rootG.modifier || 0;
    var gDirectDice = (rootG.children || []).filter(function(c){return c.type!=='group';});

    // Check for count successes mode (from any effective die)
    var countSuccess = 0;
    rollable.forEach(function(d) { if (d.countSuccess) countSuccess = d.countSuccess; });

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
    var needKeep = gDropLo || gDropHi;
    gDirectDice.forEach(function(d) { if (d.keep) needKeep = true; });

    // Mixed dice with possible exploding — build per-die distributions and convolve
    var hasExploding = rollable.some(function(d) { return d.exploding; });
    var hasCoin = rollable.some(function(d) { return d.type === 'coin'; });
    var hasClamp = rollable.some(function(d) { return (d.clampMin && d.clampMin > 1) || d.clampMax; });
    var hasCustom = rollable.some(function(d) { return d.type === 'custom'; });
    var hasMixed = !rollable.every(function(d) { return getDieMax(d) === getDieMax(rollable[0]) && !!d.exploding === !!rollable[0].exploding; });
    if ((hasExploding || hasMixed || hasCoin || hasClamp || hasCustom) && rollable.length <= 20 && !needKeep) {
        function singleDieDist(d) {
            var sides = getDieMax(d);
            var sd = {};
            if (d.exploding) {
                // Model explosion depths until remaining probability < 0.01%
                var maxDepth = Math.min(10, Math.ceil(4 / Math.log10(sides)));
                for (var v=1; v<sides; v++) sd[v] = 1.0/sides;
                var pChain = 1.0/sides;
                for (var depth=1; depth<=maxDepth; depth++) {
                    for (var v=1; v<sides; v++) sd[sides*depth+v] = (sd[sides*depth+v]||0) + pChain/sides;
                    if (depth===maxDepth) sd[sides*(depth+1)] = (sd[sides*(depth+1)]||0) + pChain/sides;
                    pChain /= sides;
                }
            } else if (d.type === 'coin') {
                sd[0]=0.5; sd[1]=0.5;
            } else if (d.type === 'df') {
                sd['-1']=1/3; sd['0']=1/3; sd['1']=1/3;
            } else if (d.type === 'custom' && d.faces && d.faces.length > 0) {
                var p = 1.0 / d.faces.length;
                d.faces.forEach(function(f) { sd[f] = (sd[f]||0) + p; });
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
        if (gModifier !== 0) {
            var shifted = {};
            for (var k in dist) shifted[parseInt(k)+gModifier] = dist[k];
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
        if (gModifier !== 0) {
            var shifted = {};
            for (var k in dist) shifted[parseInt(k) + gModifier] = dist[k];
            dist = shifted;
        }
        return dist;
    }

    // needKeep already defined above

    // Keep/drop enumeration — works for mixed dice too
    var enumTotal = 1;
    rollable.forEach(function(d) { enumTotal *= getDieMax(d); });
    if (needKeep && rollable.length > 1 && enumTotal <= 1000000 && !hasExploding && !hasCoin && !rollable.some(function(d){return d.type==='df';})) {
        var diceSpecs = rollable.map(function(d) {
            return {sides: getDieMax(d), clampMin: d.clampMin || 0, clampMax: d.clampMax || 0};
        });
        var n = rollable.length;
        var dLo = Math.min(n, gDropLo);
        var dHi = Math.min(n - dLo, gDropHi);

        // Per-die keep overrides (khN/klN) translate to drop counts
        gDirectDice.forEach(function(d) {
            if (d.keep) {
                var keepCount = d.keepCount || 1;
                if (d.keep === 'kh') { dLo = n - keepCount; dHi = 0; }
                else { dLo = 0; dHi = n - keepCount; }
            }
        });

        // If everything is dropped, the distribution is a point mass at the modifier
        if (dLo + dHi >= n) {
            var dist = {};
            dist[gModifier] = 1;
            return dist;
        }

        var dist = calcKeepDist(diceSpecs, dLo, dHi);

        if (gModifier !== 0) {
            var shifted = {};
            for (var k in dist) shifted[parseInt(k) + gModifier] = dist[k];
            dist = shifted;
        }
        return dist;
    }

    // Monte Carlo fallback for keep/drop when enumeration too expensive
    if (needKeep && rollable.length > 1) {
        var dLo = Math.min(rollable.length, gDropLo);
        var dHi = Math.min(rollable.length - dLo, gDropHi);
        gDirectDice.forEach(function(d) {
            if (d.keep) {
                var kc = d.keepCount || 1;
                if (d.keep === 'kh') { dLo = rollable.length - kc; dHi = 0; }
                else { dLo = 0; dHi = rollable.length - kc; }
            }
        });
        var trials = 200000;
        var counts = {};
        for (var t = 0; t < trials; t++) {
            var rolls = rollable.map(function(d) {
                if (d.type === 'coin') return Math.random() < 0.5 ? 1 : 0;
                if (d.type === 'df') return Math.floor(Math.random() * 3) - 1;
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
            var kept = rolls.slice(dLo, rolls.length - dHi);
            var sum = kept.reduce(function(a,b){return a+b;}, 0) + gModifier;
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

    if (gModifier !== 0) {
        var shifted = {};
        for (var k in dist) shifted[parseInt(k) + gModifier] = dist[k];
        dist = shifted;
    }

    return dist;
}

function calcKeepDist(diceSpecs, dropLo, dropHi) {
    // diceSpecs: either an array of numbers (sides, legacy) or array of
    // {sides, clampMin, clampMax}. Enumerates all outcomes, clamps each face
    // per die, sorts, drops dropLo lowest and dropHi highest, sums the rest.
    var specs = diceSpecs.map(function(d) {
        if (typeof d === 'number') return {sides: d, clampMin: 0, clampMax: 0};
        return {sides: d.sides, clampMin: d.clampMin > 1 ? d.clampMin : 0, clampMax: d.clampMax || 0};
    });
    var dist = {};
    var total = 1;
    specs.forEach(function(s) { total *= s.sides; });

    dropLo = Math.min(dropLo || 0, specs.length);
    dropHi = Math.min(dropHi || 0, specs.length - dropLo);

    function enumerate(dice, dieIdx) {
        if (dieIdx === specs.length) {
            var sorted = dice.slice().sort(function(a,b){return a-b;});
            var sum = 0;
            for (var i = dropLo; i < sorted.length - dropHi; i++) sum += sorted[i];
            dist[sum] = (dist[sum] || 0) + 1;
            return;
        }
        var s = specs[dieIdx];
        for (var face = 1; face <= s.sides; face++) {
            var v = face;
            if (s.clampMin && v < s.clampMin) v = s.clampMin;
            if (s.clampMax && v > s.clampMax) v = s.clampMax;
            dice.push(v);
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

    // Calculate theoretical min/max from dice
    var range = getTheoreticalRange();
    var trueMin = range.lo, trueMax = range.hi;

    // Bin if too many values so bars stay at the "normal" 8px width.
    // Each bar then represents ceil(keys.length / maxBars) consecutive outcomes.
    var maxBars = 50;
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

    var minVal = trueMin, maxVal = trueMax;
    var midVal = keys[Math.floor(keys.length/2)];

    var hasExploding = getEffectiveDice().some(function(d){return d.exploding;});

    // Bars stretch via flex:1 in CSS — no explicit width needed.
    var html = '<div class="dr-dist-bars">';
    keys.forEach(function(k) {
        var h = Math.max(3, Math.round((dist[k] / maxProb) * 52));
        var pct = dist[k] / maxProb;
        var hue = Math.round(pct * 120);
        var barColor = 'hsl('+hue+',85%,50%)';
        html += '<div class="dr-dist-bar" data-val="'+k+'" style="height:'+h+'px;background:'+barColor+';--bar-color:'+barColor+'" title="'+k+': '+(dist[k]*100).toFixed(1)+'%"></div>';
    });
    html += '</div>';
    // Spacing handled via CSS gap on the labels container
    var NB = '';
    if (keys.length === 1) {
        html += '<div class="dr-dist-labels"><span></span><span>'+minVal+'</span><span></span></div>';
    } else {
        var maxLabel = hasExploding ? '\\u221e' : maxVal;
        var midLabel = keys.length > 2 ? midVal : '';
        html += '<div class="dr-dist-labels"><span>'+minVal+NB+'</span><span>'+(midLabel !== '' ? NB+midLabel+NB : '')+'</span><span>'+NB+maxLabel+'</span></div>';
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
    var isLight = currentTheme.indexOf('light') === 0;
    var color = pGte > 0.5 ? (isLight ? '#1a7f37' : '#7ee787') : pGte > 0.2 ? (isLight ? '#b35900' : '#ffa657') : pGte > 0.05 ? (isLight ? '#a3400a' : '#f0883e') : (isLight ? '#cf222e' : '#f85149');

    var countMode = cupGroups.some(function(g){return g.countSuccess;});
    var suffix = countMode ? (total===1?'+ success':'+ successes') : ' or better';
    document.getElementById('prob').innerHTML = '<span style="color:'+color+'">'+pct+'%</span> chance of '+total+suffix+' <span style="color:'+color+'">('+label+')</span>';
    highlightDistValue(total);
}

var formulaTyping = false; // true when user is typing in formula box

function liveParseFormula() {
    exitHistoryView();
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
    var allChildren = g.children || [];
    if (allChildren.length === 0 && !g.modifier) return '';

    // Separate dice from sub-groups
    var dice = allChildren.filter(function(c){return c.type!=='group';});
    var subGroups = allChildren.filter(function(c){return c.type==='group';});

    // If this group is purely a container for sub-groups, recursively build
    // and still apply the container's own group-level modifiers as :attr suffix
    if (dice.length === 0 && subGroups.length > 0) {
        var subFormulas = subGroups.map(function(sg) {
            var sf = buildGroupFormula(sg) || '()';
            if (sf.charAt(0) !== '(') sf = '(' + sf + ')';
            return sf;
        });
        var op = g.operation === 'minus' ? ' \\u2212 ' : ' + ';
        var inner = subFormulas.join(op);
        // Group-level modifiers on this container
        var cAttrs = [];
        if (g.exploding) cAttrs.push('!');
        if (g.dropLowest) cAttrs.push('dl' + (g.dropLowest > 1 ? g.dropLowest : ''));
        if (g.dropHighest) cAttrs.push('dh' + (g.dropHighest > 1 ? g.dropHighest : ''));
        if (g.floor) cAttrs.push('fl' + g.floor);
        if (g.cap) cAttrs.push('cp' + g.cap);
        if (g.clampMin && g.clampMin > 1) cAttrs.push('min' + g.clampMin);
        if (g.clampMax) cAttrs.push('max' + g.clampMax);
        if (g.countSuccess) cAttrs.push('#>=' + g.countSuccess);
        if (g.modifier > 0) inner += '+' + g.modifier;
        else if (g.modifier < 0) inner += '' + g.modifier;
        if (cAttrs.length) return '(' + inner + '):' + cAttrs.join(',');
        return inner;
    }

    // Aggregate dice in insertion order of first unique formula-key, so the
    // formula reads in the same order dice appear in the cup. Dice with the
    // same type+sides+modifiers merge (3d6), while per-die-modified dice get
    // their own token (d6:min3). This replaces the old plain/modified split
    // which pushed all modified dice to the end of the formula.
    var fgOrder = []; // ordered list of unique formula keys
    var fgCount = {};
    var fgInfo = {};  // key → {base, attrs}
    var specials = [];
    dice.forEach(function(d) {
        if (d.type==='adv') { specials.push('ADV'); return; }
        if (d.type==='dis') { specials.push('DIS'); return; }
        var base = d.type==='custom'?'d['+d.faces.join(',')+']':d.type==='coin'?'COIN':d.type==='dx'?'d'+(d.sides||6):(d.type==='df'?'dF':d.type);
        var attrs = [];
        if (d.exploding) attrs.push('!');
        if (d.clampMin && d.clampMin > 1) attrs.push('min' + d.clampMin);
        if (d.clampMax) attrs.push('max' + d.clampMax);
        if (d.countSuccess) attrs.push('#>=' + d.countSuccess);
        if (d.reroll) attrs.push('r' + d.reroll);
        var k = base + (attrs.length ? ':' + attrs.join(',') : '');
        if (!fgCount[k]) { fgOrder.push(k); fgCount[k] = 0; fgInfo[k] = {base:base, attrs:attrs}; }
        fgCount[k]++;
    });
    var diceParts = [];
    fgOrder.forEach(function(k) {
        var n = fgCount[k], info = fgInfo[k];
        var token = (n > 1 ? n : '') + info.base;
        if (info.attrs.length) token += ':' + info.attrs.join(',');
        diceParts.push(token);
    });
    diceParts = diceParts.concat(specials);

    // Group-level clamp/success values
    var mnVal = (g.clampMin && g.clampMin > 1) ? g.clampMin : 0;
    var mxVal = g.clampMax || 0;
    var succVal = g.countSuccess || 0;

    // Flat modifier (+/-)
    var mod = g.modifier || 0;
    if (mod > 0) diceParts.push('+' + mod);
    else if (mod < 0) diceParts.push('' + mod);

    // Join dice expression
    var diceStr = '';
    diceParts.forEach(function(p, i) {
        if (i === 0) diceStr = p;
        else if (p.charAt(0) === '-' || p.charAt(0) === '+') diceStr += p;
        else diceStr += '+' + p;
    });

    // Group-level attrs
    var groupAttrs = [];
    if (g.exploding) groupAttrs.push('!');
    if (g.dropLowest) groupAttrs.push('dl' + (g.dropLowest > 1 ? g.dropLowest : ''));
    if (g.dropHighest) groupAttrs.push('dh' + (g.dropHighest > 1 ? g.dropHighest : ''));
    if (g.floor) groupAttrs.push('fl' + g.floor);
    if (g.cap) groupAttrs.push('cp' + g.cap);
    if (mnVal) groupAttrs.push('min' + mnVal);
    if (mxVal) groupAttrs.push('max' + mxVal);
    if (succVal) groupAttrs.push('#>=' + succVal);

    // Append any sub-groups — the mixed case (direct dice + sub-groups) needs
    // them recursively rendered, otherwise buildGroupFormula would silently
    // hide an entire nested subtree (caused bug #8: the cup showed
    // "(2d20+2d6+d6:min2):dh" while actually holding 35 dice).
    var subFormulasMixed = subGroups.map(function(sg){
        var sf = buildGroupFormula(sg) || '()';
        if (sf.charAt(0) !== '(') sf = '(' + sf + ')';
        return sf;
    });
    if (subFormulasMixed.length > 0) {
        var subJoined = subFormulasMixed.join('+');
        diceStr = diceStr ? (diceStr + '+' + subJoined) : subJoined;
    }

    // Combine: dice:groupAttrs or (dice):groupAttrs
    if (groupAttrs.length > 0 && diceStr) {
        var needParens = diceParts.length > 1 || mod || subFormulasMixed.length > 0;
        var expr = needParens ? '(' + diceStr + ')' : diceStr;
        return expr + ':' + groupAttrs.join(',');
    }
    return diceStr;
}

function syncFormulaFromCup() {
    if (document.activeElement === document.getElementById('formulaInput')) return;

    // Build per-group formulas
    var groupFormulas = [];
    var multiGroup = cupGroups.length > 1;
    cupGroups.forEach(function(g) {
        var f = buildGroupFormula(g);
        if (f === '' && multiGroup) f = '()';
        if (f || g.modifier) {
            if (!f) f = '';
            // In multi-group mode, always wrap each group in ()
            if (multiGroup) f = '(' + f + ')';
            if (g.repeat > 1) f = g.repeat + '\\u00d7(' + f + ')';
            groupFormulas.push(f);
        }
    });

    // Combine with root operation
    var formula = '';
    if (rootOperation === 'max') formula = 'max(' + groupFormulas.join(', ') + ')';
    else if (rootOperation === 'min') formula = 'min(' + groupFormulas.join(', ') + ')';
    else formula = groupFormulas.join(' + ');

    var inp = document.getElementById('formulaInput');
    inp.value = formula;
    // In multi-group mode, render styled formula with selected group highlighted.
    // Recursive: any group at any depth may be the active one.
    var overlay = document.getElementById('formulaOverlay');
    if (multiGroup && overlay) {
        var highlightStyle = 'background:#ffa657;color:#000;border-radius:4px;padding:0 4px;font-weight:700';
        function renderGroupStyled(g) {
            var isActive = flatGroupIndex(g.id) === activeGroupIdx;
            var dice = (g.children||[]).filter(function(c){return c.type!=='group';});
            var subs = (g.children||[]).filter(function(c){return c.type==='group';});
            var inner;
            if (subs.length > 0 && dice.length === 0) {
                // Pure container — render children recursively
                var op = g.operation === 'minus' ? ' \\u2212 ' : ' + ';
                inner = subs.map(renderGroupStyled).join('<span style="color:var(--text-dim)">'+esc(op)+'</span>');
            } else if (subs.length > 0) {
                // Mixed dice + sub-groups
                var parts = [];
                var df = buildGroupFormula({type:'group', children:dice, modifier:g.modifier,
                    dropLowest:g.dropLowest, dropHighest:g.dropHighest, exploding:g.exploding,
                    clampMin:g.clampMin, clampMax:g.clampMax, countSuccess:g.countSuccess});
                if (df) parts.push(esc(df));
                subs.forEach(function(sg){ parts.push(renderGroupStyled(sg)); });
                inner = parts.join('<span style="color:var(--text-dim)"> + </span>');
            } else {
                // Leaf group — dice only
                inner = esc(buildGroupFormula(g) || '').replace(/([+\-,])/g, '$1<wbr>');
            }
            var wrapped = '(' + inner + ')';
            if (isActive) {
                return '<span style="'+highlightStyle+'">'+wrapped+'</span>';
            }
            return wrapped;
        }
        var htmlParts = [];
        var opStr = rootOperation === 'minus' ? ' \\u2212 ' : ' + ';
        cupGroups.forEach(function(g, gi) {
            if (gi > 0) htmlParts.push('<span style="color:var(--text-dim)">'+esc(opStr)+'</span>');
            htmlParts.push(renderGroupStyled(g));
        });
        overlay.innerHTML = htmlParts.join('');
        overlay.style.display = 'block';
        inp.style.color = 'transparent';
        inp.style.background = 'transparent';
        // Size the input to match overlay height
        requestAnimationFrame(function() {
            if (overlay.offsetHeight > inp.offsetHeight) {
                inp.style.height = overlay.offsetHeight + 'px';
            }
        });
    } else if (overlay) {
        if (!formula) {
            // Empty cup — hide overlay, restore input
            overlay.innerHTML = '';
            overlay.style.display = 'none';
            inp.style.color = '';
            inp.style.background = '';
            inp.style.height = '';
        } else {
            // Single group — use overlay for wrapping long formulas
            overlay.innerHTML = esc(formula).replace(/([+\-,])/g, '$1<wbr>');
            overlay.style.display = 'block';
            inp.style.color = 'transparent';
            inp.style.background = 'transparent';
            requestAnimationFrame(function() {
                if (overlay.offsetHeight > inp.offsetHeight) {
                    inp.style.height = overlay.offsetHeight + 'px';
                } else {
                    inp.style.height = '';
                }
            });
        }
    }
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
        '\\u2705 Custom dice faces \\u2014 d{1,1,2,3,5}<br>' +
        '\\u2705 Multi-group rolls \\u2014 (4d6dl)+(2d8!)<br>' +
        '\\u2705 Game Packs \\u2014 Formula De included<br>' +
        '\\u2705 Game Pack browser<br>' +
        '\\u2705 Unlimited presets<br>' +
        '\\u2705 Premium themes<br>' +
        '\\u2705 Tap-hold dice editing</div>' +
        '<button onclick="this.closest(\\x27div[style]\\x27).parentElement.remove();showGameList()" style="margin-top:12px;background:none;border:1px solid var(--border);border-radius:10px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;color:#58a6ff;width:100%">See all supported games \\u203A</button>' +
        '<button onclick="this.closest(\\x27div[style]\\x27).parentElement.remove()" style="margin-top:12px;background:#ffa657;color:#000;border:none;border-radius:10px;padding:12px 32px;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit;width:100%">Coming Soon</button>' +
        '<button onclick="this.closest(\\x27div[style]\\x27).parentElement.remove()" style="margin-top:8px;background:none;border:none;color:var(--text-dim);font-size:13px;cursor:pointer;font-family:inherit">Not now</button>';
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
}

function showReplacePresetDialog() {
    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:999;display:flex;align-items:center;justify-content:center';
    backdrop.onclick = function(e){ if(e.target===backdrop) backdrop.remove(); };
    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--surface);border:2px solid #ffa657;border-radius:16px;padding:24px;max-width:340px;width:90%;text-align:center';
    var html = '<div style="font-size:28px;margin-bottom:8px">\\u2728</div>' +
        '<div style="font-size:20px;font-weight:800;color:var(--text-bright);margin-bottom:4px">Go Premium</div>' +
        '<div style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Unlock unlimited presets and more</div>' +
        '<div style="text-align:left;color:var(--text);font-size:13px;line-height:1.7;margin-bottom:16px">' +
        '\\u2705 Unlimited presets<br>' +
        '\\u2705 Editable formula bar<br>' +
        '\\u2705 Multi-group dice<br>' +
        '\\u2705 Premium themes<br>' +
        '\\u2705 No ads</div>' +
        '<button onclick="this.closest(\\x27div[style]\\x27).parentElement.remove()" style="background:#ffa657;color:#000;border:none;border-radius:10px;padding:12px 32px;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit;width:100%">Coming Soon</button>' +
        '<div id="replaceList" style="display:none;text-align:left;margin-top:12px"></div>' +
        '<button onclick="showReplacePicker()" style="margin-top:10px;background:none;border:1px solid var(--border);border-radius:10px;padding:8px 20px;font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;font-family:inherit;width:100%">Replace an existing preset</button>' +
        '<button onclick="this.closest(\\x27div[style]\\x27).parentElement.remove()" style="margin-top:6px;background:none;border:none;color:var(--text-dim);font-size:13px;cursor:pointer;font-family:inherit">Cancel</button>';
    modal.innerHTML = html;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
}

function showReplacePicker() {
    var list = document.getElementById('replaceList');
    if (list.style.display !== 'none') { list.style.display = 'none'; return; }
    var html = '';
    presets.forEach(function(p, i) {
        var expr = buildGroupFormula(p);
        html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:4px;background:var(--bg);border:1px solid var(--border);border-radius:8px;cursor:pointer" onclick="replacePreset(' + i + ')">' +
            '<span style="flex:1;font-size:14px;font-weight:600;color:var(--text-bright)">' + esc(p.name) + '</span>' +
            '<span style="font-size:11px;color:var(--text-dim)">' + esc(expr) + '</span>' +
            '<span style="color:var(--text-dim);font-size:16px">\\u21BB</span></div>';
    });
    list.innerHTML = html;
    list.style.display = 'block';
}

function replacePreset(idx) {
    // Close the dialog — find backdrop by z-index since browsers normalize style attributes
    var backdrops = document.querySelectorAll('div[style*="z-index"]');
    backdrops.forEach(function(b){ if(b.style.position==='fixed') b.remove(); });
    // Prompt for name, then replace
    showInlineInput('Name for new preset:', '', function(name) {
        if (!name) return;
        var preset = JSON.parse(JSON.stringify(cupGroup));
        preset.name = name;
        preset.dice = preset.children;
        presets[idx] = preset;
        savePresetsToStorage();
        activePresetIdx = idx;
        renderPresets();
        updateFavState();
    });
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
    var g = activeGroup();
    cupDice = [];
    modifier = 0;
    dropLowest = 0;
    dropHighest = 0;
    // Reset group-level modifiers — parseFormula rebuilds them from scratch
    g.exploding = false;
    g.floor = 0; g.cap = 0;
    delete g.clampMin; delete g.clampMax; delete g.countSuccess;

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
        // Supports: 4d6dl, 4d6dl2, 3d20kh1, 4d6!, 6d6#>=5, 4d6r1, 4d6min2, 4d6max5
        var diceMatch = token.match(/^(\\d+)?d(\\d+)([-d][lh]\\d*|d1|kh\\d*|kl\\d*|!|r\\d+|#>=?\\d+|min=?\\d+|max=?\\d+|fl\\d+|cp\\d+)*$/i);
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

            var dlMatch = mods.match(/dl(\\d*)/i);
            var dhMatch = mods.match(/dh(\\d*)/i);
            if (dlMatch || /d1|-l/i.test(mods)) { dropLowest = dlMatch && dlMatch[1] ? parseInt(dlMatch[1]) : 1; }
            if (dhMatch || /-h/i.test(mods)) { dropHighest = dhMatch && dhMatch[1] ? parseInt(dhMatch[1]) : 1; }
            if (exploding) g.exploding = true;
            if (countSuccess) g.countSuccess = countSuccess;
            // Group-level min/max modifiers — support both "min2" and legacy "min=2"
            var minMatch = mods.match(/min=?(\\d+)/i);
            var maxMatch = mods.match(/max=?(\\d+)/i);
            if (minMatch) g.clampMin = parseInt(minMatch[1]);
            if (maxMatch) g.clampMax = parseInt(maxMatch[1]);
            var flMatch = mods.match(/fl(\\d+)/i);
            var cpMatch = mods.match(/cp(\\d+)/i);
            if (flMatch) g.floor = parseInt(flMatch[1]);
            if (cpMatch) g.cap = parseInt(cpMatch[1]);

            var dieType = 'd' + sides;
            if (!dieRanges[dieType]) dieType = 'dx';

            for (var i = 0; i < count; i++) {
                var die = {type: dieType, id: Date.now() + i};
                if (dieType === 'dx') die.sides = sides;
                if (reroll) die.reroll = reroll;
                if (keepMode) { die.keep = keepMode; die.keepCount = keepCount; }
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
    {id:'light',   name:'Light',    free:true,  bg:'#f0e6d4', accent:'#b8860b', surface:'#6b2d2d'},
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
    // No visible button during testing — mode shown in title
    var title = document.getElementById('appTitle');
    // Title stays "Dice Vault" regardless of mode
}
var _titleLpTimer = null;
function startTitleLongPress(e) {
    if (_titleLpTimer) clearTimeout(_titleLpTimer);
    _titleLpTimer = setTimeout(function() {
        _titleLpTimer = null;
        var html = '<div style="display:flex;flex-direction:column;gap:6px;padding:8px">' +
            '<button style="background:var(--btn-bg);border:1px solid '+(PREMIUM?'#ffa657':'var(--border)')+';border-radius:8px;padding:10px 16px;color:'+(PREMIUM?'#ffa657':'var(--text-bright)')+';font-size:14px;font-weight:700;cursor:pointer;font-family:inherit" onclick="closeModal();switchMode(true)">Pro Mode'+(PREMIUM?' \\u2714':'')+' </button>' +
            '<button style="background:var(--btn-bg);border:1px solid '+(!PREMIUM?'#ffa657':'var(--border)')+';border-radius:8px;padding:10px 16px;color:'+(!PREMIUM?'#ffa657':'var(--text-bright)')+';font-size:14px;font-weight:700;cursor:pointer;font-family:inherit" onclick="closeModal();switchMode(false)">Free Mode'+(!PREMIUM?' \\u2714':'')+' </button>' +
            '</div>';
        showModal('Testing Mode', html);
    }, 600);
}
function cancelTitleLongPress() { if (_titleLpTimer) { clearTimeout(_titleLpTimer); _titleLpTimer = null; } }
function switchMode(pro) {
    if (pro) { localStorage.removeItem('dice_vault_mode'); }
    else { localStorage.setItem('dice_vault_mode', 'free'); }
    window.location.reload();
}

// ===== Game Room =====
var room = {code:null, name:null, color:null, isHost:false, sse:null, members:[], feedItems:[]};
var ROOM_COLORS = ['#58a6ff','#7ee787','#f0883e','#f85149','#d2a8ff','#d29922','#ff7b72','#79c0ff',
    '#a5d6ff','#ffa657','#3dd68c','#bc8cff','#ff9640','#ff6b8a','#e8c840','#40d4e8'];

function showRoomDialog() {
    // Check if already in a room
    if (room.code) {
        showConfirm('Leave room ' + room.code + '?', function() { roomLeave(); });
        return;
    }
    var savedName = localStorage.getItem('dice_room_name') || '';
    var savedColor = localStorage.getItem('dice_room_color') || ROOM_COLORS[0];
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal" style="max-width:340px">' +
        '<div class="dr-modal-title">Game Room</div>' +
        '<input type="text" id="drRoomName" placeholder="Your name" value="'+esc(savedName)+'" style="margin-bottom:8px" autocomplete="off">' +
        '<div class="dr-color-picker" id="drRoomColors"></div>' +
        '<input type="text" id="drRoomCode" placeholder="Room code" maxlength="4" style="margin-bottom:4px;text-transform:uppercase;letter-spacing:4px;font-weight:700;text-align:center" autocomplete="off" oninput="updateRoomButtons()">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Leave blank to start a new room</div>' +
        '<div class="dr-modal-btns">' +
        '<button class="dr-modal-cancel" onclick="closeModal()">Cancel</button>' +
        (PREMIUM ? '<button class="dr-modal-ok" id="roomCreateBtn" onclick="roomCreate()">Create</button>' : '') +
        '<button class="dr-modal-ok" id="roomJoinBtn" onclick="roomJoin()" style="opacity:0.3;pointer-events:none">Join</button>' +
        '</div></div>';
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if(e.target===overlay) closeModal(); };
    window._modalOverlay = overlay;
    // Render color picker
    var cpEl = document.getElementById('drRoomColors');
    var cpHtml = '';
    ROOM_COLORS.forEach(function(c) {
        var sel = c === savedColor ? ' selected' : '';
        cpHtml += '<div class="dr-color-swatch'+sel+'" style="background:'+c+'" data-color="'+c+'" onclick="pickRoomColor(this,this.dataset.color)"></div>';
    });
    cpEl.innerHTML = cpHtml;
    window._roomPickedColor = savedColor;
    document.getElementById('drRoomName').focus();
    // Letter-only filter on code input
    var codeInput = document.getElementById('drRoomCode');
    codeInput.addEventListener('input', function() {
        this.value = this.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
        updateRoomButtons();
    });
    codeInput.onkeydown = function(e) {
        if (e.key === 'Enter') {
            var v = codeInput.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
            if (v.length === 4) roomJoin();
            else if (v.length === 0) roomCreate();
        }
    };
    document.getElementById('drRoomName').onkeydown = function(e) { if(e.key==='Enter') codeInput.focus(); };
    updateRoomButtons();
}
function updateRoomButtons() {
    var code = (document.getElementById('drRoomCode').value || '').replace(/[^a-zA-Z]/g, '');
    var createBtn = document.getElementById('roomCreateBtn');
    var joinBtn = document.getElementById('roomJoinBtn');
    if (!joinBtn) return;
    if (code.length === 0) {
        if (createBtn) { createBtn.style.opacity = ''; createBtn.style.pointerEvents = ''; }
        joinBtn.style.opacity = '0.3'; joinBtn.style.pointerEvents = 'none';
    } else if (code.length === 4) {
        if (createBtn) { createBtn.style.opacity = '0.3'; createBtn.style.pointerEvents = 'none'; }
        joinBtn.style.opacity = ''; joinBtn.style.pointerEvents = '';
    } else {
        if (createBtn) { createBtn.style.opacity = '0.3'; createBtn.style.pointerEvents = 'none'; }
        joinBtn.style.opacity = '0.3'; joinBtn.style.pointerEvents = 'none';
    }
}
function pickRoomColor(el, color) {
    document.querySelectorAll('.dr-color-swatch').forEach(function(s) { s.classList.remove('selected'); });
    el.classList.add('selected');
    window._roomPickedColor = color;
}
function roomCreate() {
    var name = (document.getElementById('drRoomName').value || '').trim();
    var color = window._roomPickedColor || ROOM_COLORS[0];
    if (!name) { showToast('Enter your name'); return; }
    closeModal();
    if (!PREMIUM) { showPremiumUpsell(); return; }
    localStorage.setItem('dice_room_name', name);
    localStorage.setItem('dice_room_color', color);
    fetch('/dice/room/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({name:name, color:color})
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.error) { showToast(data.error); return; }
        room.code = data.code; room.name = name; room.color = color;
        room.isHost = true;
        localStorage.setItem('dice_room_code', data.code);
        roomConnect();
        showRoomCreatedDialog(data.code);
    }).catch(function() { showToast('Could not create room'); });
}
function roomJoin() {
    var name = (document.getElementById('drRoomName').value || '').trim();
    var code = (document.getElementById('drRoomCode').value || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
    var color = window._roomPickedColor || ROOM_COLORS[0];
    if (!name) { showToast('Enter your name'); return; }
    if (code.length !== 4) return;
    closeModal();
    localStorage.setItem('dice_room_name', name);
    localStorage.setItem('dice_room_color', color);
    fetch('/dice/room/join', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({code:code, name:name, color:color})
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.error) { showToast(data.error); return; }
        room.code = data.code; room.name = name; room.color = color;
        room.isHost = (data.host === name);
        localStorage.setItem('dice_room_code', data.code);
        if (data.packs) data.packs.forEach(function(pid) { installPack(pid); });
        roomConnect();
        showToast('Joined room ' + data.code);
    }).catch(function() { showToast('Could not join room'); });
}
function roomConnect() {
    if (room.sse) room.sse.close();
    room.feedItems = [];
    var feed = document.getElementById('roomFeed');
    var roomBar = document.getElementById('roomBar');
    feed.style.display = '';
    feed.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:16px;font-size:13px">Connected to room ' + room.code + '</div>';
    roomBar.style.display = '';
    document.getElementById('roomCodeLabel').textContent = room.code;
    document.getElementById('roomHostControls').style.display = room.isHost ? 'contents' : 'none';
    document.getElementById('roomLeaveBtn').style.display = room.isHost ? 'none' : '';
    // Update room button
    document.getElementById('roomBtn').style.color = '#7ee787';
    document.getElementById('roomBtn').title = 'Room ' + room.code;
    // SSE
    room.sse = new EventSource('/dice/room/' + room.code + '/stream');
    room.sse.addEventListener('init', function(e) {
        var data = JSON.parse(e.data);
        room.members = data.members || [];
        renderRoomDots();
    });
    room.sse.addEventListener('roll', function(e) {
        var data = JSON.parse(e.data);
        addFeedItem(data);
    });
    room.sse.addEventListener('join', function(e) {
        var data = JSON.parse(e.data);
        room.members.push(data);
        renderRoomDots();
        showToast(data.name + ' joined');
    });
    room.sse.addEventListener('leave', function(e) {
        var data = JSON.parse(e.data);
        room.members = room.members.filter(function(m) { return m.name !== data.name; });
        renderRoomDots();
    });
    room.sse.addEventListener('pack-push', function(e) {
        var data = JSON.parse(e.data);
        installPack(data.packId);
        showToast('Game pack installed');
    });
    room.sse.addEventListener('room-closed', function(e) {
        showToast('Room closed by host');
        roomDisconnect();
    });
    room.sse.addEventListener('color-change', function(e) {
        var data = JSON.parse(e.data);
        room.members.forEach(function(m) { if(m.name===data.name) m.color=data.color; });
        renderRoomDots();
    });
    room.sse.onerror = function() {
        // Auto-reconnect is handled by EventSource
    };
    // Update feed timestamps every 15s
    if (room._feedTimer) clearInterval(room._feedTimer);
    room._feedTimer = setInterval(function() {
        // Update only timestamps, not the whole feed
        var timeEls = document.querySelectorAll('.dr-room-feed-time');
        timeEls.forEach(function(el, i) {
            if (i < room.feedItems.length && room.feedItems[i]._ts) {
                el.textContent = feedTimeAgo(room.feedItems[i]._ts);
            }
        });
    }, 15000);
}
function roomDisconnect() {
    if (room.sse) room.sse.close();
    if (room._feedTimer) { clearInterval(room._feedTimer); room._feedTimer = null; }
    room.sse = null; room.code = null; room.isHost = false; room.members = [];
    localStorage.removeItem('dice_room_code');
    document.getElementById('roomFeed').style.display = 'none';
    document.getElementById('roomBar').style.display = 'none';
    document.getElementById('roomBtn').style.color = '';
    document.getElementById('roomBtn').title = 'Room';
}
function confirmLeaveRoom() {
    showConfirm('Leave room ' + room.code + '?', roomLeave);
}
function roomLeave() {
    if (!room.code) return;
    fetch('/dice/room/leave', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({code:room.code, name:room.name})
    }).catch(function(){});
    roomDisconnect();
    showToast('Left room');
}
function roomClose() {
    if (!room.code || !room.isHost) return;
    showConfirm('End session for everyone?', function() {
        fetch('/dice/room/close', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({code:room.code, name:room.name})
        }).catch(function(){});
        roomDisconnect();
        showToast('Room closed');
    });
}
function roomSharePack() {
    if (!room.code || !room.isHost) return;
    // Show pack picker from installed packs
    var html = '<div style="display:flex;flex-direction:column;gap:6px;max-height:70vh;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:8px">';
    presetData.packs.forEach(function(pk) {
        html += '<button style="background:var(--btn-bg);border:1px solid var(--border);border-radius:8px;padding:8px 16px;color:var(--text-bright);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;flex-shrink:0" data-pack="'+esc(pk.name)+'" onclick="roomPushPack(this.dataset.pack)">'+esc(pk.name)+'</button>';
    });
    GAME_PACK_CATALOG.forEach(function(cat) {
        if (!presetData.packs.some(function(pk){return pk.name===cat.name;})) {
            html += '<button style="background:var(--btn-bg);border:1px solid var(--border);border-radius:8px;padding:8px 16px;color:var(--text-dim);font-size:14px;cursor:pointer;font-family:inherit;flex-shrink:0" data-packid="'+cat.id+'" data-pack="'+esc(cat.name)+'" onclick="installPack(this.dataset.packid);roomPushPack(this.dataset.pack)">'+esc(cat.name)+' (install & share)</button>';
        }
    });
    html += '</div>';
    showModal('Share Pack', html);
}
function roomPushPack(packName) {
    closeModal();
    var cat = GAME_PACK_CATALOG.find(function(c){return c.name===packName;});
    if (!cat) return;
    installPack(cat.id);
    selectPackTab(packName);
    fetch('/dice/room/push-pack', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({code:room.code, name:room.name, packId:cat.id})
    }).catch(function(){});
    showToast('Shared ' + packName);
}
function showRoomCreatedDialog(code) {
    var link = location.origin + '/dice?room=' + code;
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal" style="text-align:center">' +
        '<div class="dr-modal-title">Room Created</div>' +
        '<div style="font-size:40px;font-weight:900;letter-spacing:10px;color:var(--text-bright);margin:12px 0;font-family:SF Mono,ui-monospace,monospace">' + esc(code) + '</div>' +
        '<div id="roomLinkText" style="font-size:12px;color:var(--text-muted);margin-bottom:16px;word-break:break-all">' + esc(link) + '</div>' +
        '<div class="dr-modal-btns">' +
        '<button class="dr-modal-cancel" id="cancelRoomBtn">Cancel</button>' +
        '<button class="dr-modal-ok" id="copyLinkBtn">Copy Link</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };
    window._modalOverlay = overlay;
    document.getElementById('copyLinkBtn').onclick = function() {
        navigator.clipboard.writeText(link).then(function() {
            document.getElementById('copyLinkBtn').textContent = 'Copied!';
            setTimeout(function() { closeModal(); }, 800);
        });
    };
    document.getElementById('cancelRoomBtn').onclick = function() {
        closeModal();
        // Close the room silently (no confirm dialog)
        if (room.code && room.isHost) {
            fetch('/dice/room/close', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({code:room.code, name:room.name})
            }).catch(function(){});
        }
        roomDisconnect();
    };
}
function roomCopyLink() {
    if (!room.code) return;
    var link = location.origin + '/dice?room=' + room.code;
    navigator.clipboard.writeText(link).then(function() { showToast('Link copied'); });
}
function roomExportLog() {
    if (!room.code) return;
    window.open('/dice/room/' + room.code + '/log', '_blank');
}
function addFeedItem(data) {
    data._ts = Date.now();
    room.feedItems.unshift(data);
    if (room.feedItems.length > 50) room.feedItems = room.feedItems.slice(0, 50);
    renderFeed();
}
function feedTimeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60);
    return h + 'h';
}
function renderFeed() {
    var feed = document.getElementById('roomFeed');
    if (!room.feedItems.length) {
        feed.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:16px;font-size:13px">Waiting for rolls...</div>';
        return;
    }
    var html = '';
    room.feedItems.forEach(function(item) {
        var rd = item.resultData || {};
        var resultHtml = '';
        if (rd.symbolFaces && rd.symbolFaces.length) {
            rd.symbolFaces.forEach(function(f) { resultHtml += '<span style="margin-right:4px">' + faceToDisplay(String(f)) + '</span>'; });
        } else if (rd.total !== undefined) {
            resultHtml = esc(String(rd.total));
        } else if (rd.breakdown) {
            resultHtml = esc(rd.breakdown);
        }
        var favHtml = item.favName ? '<span style="color:#ffa657;font-size:10px;font-weight:600">'+esc(item.favName)+'</span> ' : '';
        html += '<div class="dr-room-feed-card">' +
            '<div class="dr-room-feed-bar" style="background:'+esc(item.color||'#58a6ff')+'"></div>' +
            '<div class="dr-room-feed-body">' +
                '<div class="dr-room-feed-name" style="color:'+esc(item.color||'#58a6ff')+'">'+esc(item.name||'')+'</div>' +
                '<div class="dr-room-feed-expr">'+favHtml+esc(item.expression||'')+'</div>' +
                '<div class="dr-room-feed-result">'+resultHtml+'</div>' +
            '</div>' +
            '<div class="dr-room-feed-time">'+ feedTimeAgo(item._ts || Date.now()) +'</div>' +
        '</div>';
    });
    feed.innerHTML = html;
}
function renderRoomDots() {
    var el = document.getElementById('roomDots');
    if (!el) return;
    var html = '';
    room.members.forEach(function(m) {
        html += '<div class="dr-room-dot" style="background:'+esc(m.color)+'" title="'+esc(m.name)+'"></div>';
    });
    el.innerHTML = html;
}
function broadcastRoll(expression, favName, resultData) {
    if (!room.code) return;
    fetch('/dice/room/roll', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            code: room.code, name: room.name, color: room.color,
            expression: expression, favName: favName || '',
            resultData: resultData
        })
    }).catch(function(){});
}
function showModal(title, bodyHtml) {
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal"><div class="dr-modal-title">'+esc(title)+'</div>'+bodyHtml+'<div class="dr-modal-btns"><button class="dr-modal-cancel" onclick="closeModal()">Close</button></div></div>';
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if(e.target===overlay) closeModal(); };
    window._modalOverlay = overlay;
}
function roomAutoRejoin() {
    var savedCode = localStorage.getItem('dice_room_code');
    var savedName = localStorage.getItem('dice_room_name');
    var savedColor = localStorage.getItem('dice_room_color');
    if (!savedCode || !savedName) return;
    // Check if room is still alive
    fetch('/dice/room/' + savedCode + '/info').then(function(r) {
        if (!r.ok) { localStorage.removeItem('dice_room_code'); return; }
        return r.json();
    }).then(function(data) {
        if (!data) return;
        room.code = savedCode; room.name = savedName; room.color = savedColor || ROOM_COLORS[0];
        // Rejoin
        fetch('/dice/room/join', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({code:savedCode, name:savedName, color:room.color})
        }).then(function(r) { return r.json(); }).then(function(jd) {
            if (jd.error) { localStorage.removeItem('dice_room_code'); return; }
            room.isHost = (jd.host === savedName);
            if (jd.packs) jd.packs.forEach(function(pid) { installPack(pid); });
            roomConnect();
            showToast('Reconnected to room ' + savedCode);
        });
    }).catch(function() { localStorage.removeItem('dice_room_code'); });
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
    // Save query string so history/bugs pages can link back correctly
    if (window.location.search) localStorage.setItem('dice_roller_qs', window.location.search);
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
            if (g.floor) merged.floor = g.floor;
            if (g.cap) merged.cap = g.cap;
        });
        cupGroups = [merged];
        activeGroupIdx = 0;
    }
    updateCupDisplay(); restoreLastRoll(); updateHistoryNav();
    document.getElementById('dropBtn').classList.toggle('on', dropLowest);
    document.getElementById('dropHBtn').classList.toggle('on', dropHighest);
    updatePremiumBtn();
    loadTheme();
    restoreLockState();

    // Restore from bug report if ?restore=N
    var RESTORE_STATE = """ + (json.dumps(json.loads(restore_state)) if restore_state else 'null') + """;
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

    // Shared room: auto-rejoin or handle ?room=CODE
    var urlRoom = new URLSearchParams(window.location.search).get('room');
    if (urlRoom) {
        // Shareable link — show join dialog with code pre-filled
        setTimeout(function() {
            showRoomDialog();
            var codeInput = document.getElementById('drRoomCode');
            if (codeInput) codeInput.value = urlRoom.toUpperCase();
        }, 500);
    } else {
        roomAutoRejoin();
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

var _bugScreenshot = null;
function showBugReport() {
    // Capture screenshot BEFORE showing dialog (so dialog doesn't cover the bug)
    _bugScreenshot = null;
    captureScreenshot(function(ss) { _bugScreenshot = ss; });

    var savedName = localStorage.getItem('dice_bug_reporter') || '';
    var overlay = document.createElement('div');
    overlay.className = 'dr-modal-overlay';
    overlay.innerHTML = '<div class="dr-modal" style="width:320px">' +
        '<div class="dr-modal-title">Report a Bug</div>' +
        '<input type="text" id="bugName" value="'+savedName+'" placeholder="Your name" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text-bright);padding:10px 12px;font-size:16px;font-family:inherit;outline:none;margin-bottom:8px">' +
        '<textarea id="bugDesc" placeholder="Describe the bug..." rows="4" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text-bright);padding:10px 12px;font-size:16px;font-family:inherit;outline:none;resize:vertical;margin-bottom:8px"></textarea>' +
        '<div id="bugScreenPreview" style="margin-bottom:8px;text-align:center;font-size:11px;color:var(--text-dim)">Capturing screenshot...</div>' +
        '<div id="bugStatus" style="font-size:13px;color:var(--text-muted);margin-bottom:8px"></div>' +
        '<div class="dr-modal-btns">' +
        '<button class="dr-modal-cancel" onclick="closeBugReport()">Cancel</button>' +
        '<button class="dr-modal-ok" id="bugSubmitBtn" onclick="submitBugReport()">Submit</button>' +
        '</div></div>';
    document.body.appendChild(overlay);
    overlay.onclick = function(e) { if(e.target===overlay) closeBugReport(); };
    window._bugOverlay = overlay;
    // Show screenshot preview once captured
    var checkSS = setInterval(function() {
        if (_bugScreenshot !== null) {
            clearInterval(checkSS);
            var prev = document.getElementById('bugScreenPreview');
            if (prev) {
                if (_bugScreenshot) {
                    prev.innerHTML = '<img src="'+_bugScreenshot+'" style="width:100%;border-radius:6px;border:1px solid var(--border)">';
                } else {
                    prev.textContent = 'Screenshot failed — bug will be submitted without one';
                }
            }
        }
    }, 200);
    setTimeout(function() { clearInterval(checkSS); }, 5000); // give up after 5s
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
    document.getElementById('bugStatus').textContent = 'Submitting...';

    var screenshot = _bugScreenshot || '';
    (function() {
        var payload = {
            reporter: name,
            description: desc,
            screenshot: screenshot,
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
.dr-history-entry { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center;
                    padding:10px 14px; border-radius:10px; margin-bottom:6px;
                    background:var(--btn-bg); border:1px solid var(--border2); gap:4px; }
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
    <a class="dr-back" href="/dice" id="backLink">&larr; Back</a>
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
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
var FACE_SYMBOLS = {
    'claw':'<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M4 2C5 6 7 10 10 14c1 1.5.5 3 0 4-.5-1-3-5-6-10C3 6 3 4 4 2z"/><path d="M8 1C9 5 11 9 14 13c1 1.5.5 3 0 4-.5-1-3-5-6-10C7 5 7 3 8 1z"/><path d="M12 2C13 6 15 10 18 14c1 1.5.5 3 0 4-.5-1-3-5-6-10C11 6 11 4 12 2z"/><path d="M16 3C17 7 19 11 22 15c1 1.5.5 3 0 4-.5-1-3-5-6-10C15 7 15 5 16 3z"/></svg>',
    'heart':'\\u2764\\uFE0F','bolt':'\\u26A1','brain':'\\u{1F9E0}','shot':'\\u{1F4A5}','step':'<span style="filter:brightness(3)">\\u{1F463}</span>',
    'cherry':'\\u{1F352}','cherries':'\\u{1F352}','lemon':'\\u{1F34B}','bell':'\\u{1F514}',
    '7':'<span style="color:#e33;font-weight:900;font-style:italic;font-size:1.1em;font-family:serif">7</span>',
    'bar':'<svg width="16" height="14" viewBox="0 0 22 18" style="vertical-align:-2px"><rect x="1" y="1" width="20" height="4" rx="1" fill="#c8a84e"/><rect x="1" y="7" width="20" height="4" rx="1" fill="#c8a84e"/><rect x="1" y="13" width="20" height="4" rx="1" fill="#c8a84e"/></svg>',
    // Astronomy
    'sun':'\\u2600\\uFE0F','moon':'\\u{1F319}','full moon':'\\u{1F315}','crescent':'\\u{1F319}',
    'star':'\\u2B50','stars':'\\u{1F320}','shooting star':'\\u{1F320}',
    'comet':'\\u2604\\uFE0F','meteor':'\\u2604\\uFE0F','planet':'\\u{1FA90}','saturn':'\\u{1FA90}',
    'earth':'\\u{1F30D}','mars':'\\u{1F534}','galaxy':'\\u{1F30C}','eclipse':'\\u{1F311}',
    'rocket':'\\u{1F680}','alien':'\\u{1F47D}','ufo':'\\u{1F6F8}','asteroid':'\\u{1FAA8}',
    // Common
    'sword':'\\u2694\\uFE0F','shield':'\\u{1F6E1}\\uFE0F','skull':'\\u{1F480}',
    'fire':'\\u{1F525}','hit':'\\u{1F3AF}','miss':'\\u274C','blank':'<span style="opacity:0.15">\\u2014</span>',
    'crown':'\\u{1F451}','gem':'\\u{1F48E}','diamond':'\\u{1F48E}','lightning':'\\u26A1',
    'dragon':'\\u{1F409}','wolf':'\\u{1F43A}','eagle':'\\u{1F985}',
    'gold':'\\u{1FA99}','key':'\\u{1F511}','heal':'\\u{1F49A}','damage':'\\u{1F4A2}',
    'critical':'\\u{1F4A5}','success':'\\u2705','failure':'\\u274C',
    'yes':'\\u2705','no':'\\u274C','win':'\\u{1F3C6}',
    'up':'\\u2B06\\uFE0F','down':'\\u2B07\\uFE0F','north':'\\u2B06\\uFE0F','south':'\\u2B07\\uFE0F',
    'east':'\\u27A1\\uFE0F','west':'\\u2B05\\uFE0F',
};
function faceToDisplay(face) {
    var sym = FACE_SYMBOLS[face.toLowerCase()];
    return sym || esc(face);
}
function render() {
    var list=document.getElementById('historyList');
    var history=[];
    try{history=JSON.parse(localStorage.getItem('dice_roller_history')||'[]');}catch(e){}
    if(!history.length){list.innerHTML='<div class="dr-history-empty">No rolls yet</div>';return;}
    var html='';
    history.forEach(function(e){
        var favLabel = e.favName ? '<div style="font-size:10px;color:#ffa657;font-weight:600;">'+esc(e.favName)+'</div>' : '';
        var totalHtml;
        if (e.symbolFaces && e.symbolFaces.length > 0) {
            // Symbol roll: render face chips with emoji
            totalHtml = '<span style="display:flex;flex-wrap:wrap;gap:4px">';
            e.symbolFaces.forEach(function(f) {
                totalHtml += '<span style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:2px 6px;font-size:14px">' + faceToDisplay(f) + '</span>';
            });
            totalHtml += '</span>';
        } else {
            totalHtml = '<span class="dr-history-total">'+esc(''+e.total)+'</span>';
        }
        html+='<div class="dr-history-entry">'+totalHtml+'<span class="dr-history-expr">'+favLabel+esc(e.expression)+'</span><span class="dr-history-time">'+formatTimeAgo(e.timestamp)+'</span></div>';
    });
    list.innerHTML=html;
}
function clearHistory(){localStorage.removeItem('dice_roller_history');render();}
// Preserve premium query param on back link
var qs = window.location.search || localStorage.getItem('dice_roller_qs') || '';
if (qs) document.getElementById('backLink').href = '/dice' + qs;
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
    if report.get("screenshot") and report["screenshot"].startswith("data:image/"):
        import html as _html
        screenshot_html = f'<img src="{_html.escape(report["screenshot"])}" style="width:100%;border-radius:8px;border:1px solid #21262d;margin-bottom:16px">'

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


def build_room_log_page(room, rolls, members):
    """Read-only session log page for a shared room."""
    import html as html_mod
    import json
    from datetime import datetime, timedelta

    code = room.get('code', '?')
    created = room.get('created_at', '')
    status = room.get('status', 'closed')

    # Calculate expiry
    try:
        created_dt = datetime.strptime(created, '%Y-%m-%d %H:%M:%S')
        expires_dt = created_dt + timedelta(days=30)
        days_left = max(0, (expires_dt - datetime.utcnow()).days)
    except Exception:
        days_left = 30

    # Build member list
    member_html = ""
    for m in members:
        c = html_mod.escape(m.get('color', '#58a6ff'))
        n = html_mod.escape(m.get('name', ''))
        member_html += f'<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px"><span style="width:10px;height:10px;border-radius:50%;background:{c};display:inline-block"></span>{n}</span>'

    # Build roll list
    rolls_html = ""
    for r in rolls:
        c = html_mod.escape(r.get('player_color', '#58a6ff'))
        n = html_mod.escape(r.get('player_name', ''))
        expr = html_mod.escape(r.get('expression', ''))
        fav = html_mod.escape(r.get('fav_name', ''))
        ts = r.get('timestamp', '')
        try:
            rd = json.loads(r.get('result_data', '{}'))
        except Exception:
            rd = {}
        result_str = ''
        if 'symbolFaces' in rd and rd['symbolFaces']:
            result_str = ', '.join(str(f) for f in rd['symbolFaces'])
        elif 'total' in rd:
            result_str = str(rd['total'])
        elif 'breakdown' in rd:
            result_str = rd['breakdown']
        result_str = html_mod.escape(result_str)
        label = f'<span style="color:#ffa657;font-size:11px">{fav}</span> ' if fav else ''
        rolls_html += f"""<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border2)">
            <div style="width:4px;border-radius:2px;background:{c};flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
                <div style="font-size:12px;color:{c};font-weight:600">{n}</div>
                <div style="font-size:13px;color:var(--text-muted)">{label}{expr}</div>
                <div style="font-size:15px;font-weight:700;color:var(--text-bright);margin-top:2px">{result_str}</div>
            </div>
            <div style="font-size:11px;color:var(--text-dim);white-space:nowrap">{ts}</div>
        </div>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<meta name="theme-color" content="#0d1117">
<title>Room {code} — Session Log</title>
<style>
:root {{
    --bg: #0d1117; --surface: #161b22; --border: #30363d; --border2: #21262d;
    --text: #c9d1d9; --text-bright: #e6edf3; --text-dim: #484f58; --text-muted: #8b949e;
    --accent: #58a6ff;
}}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ background:var(--bg); color:var(--text); min-height:100vh;
       font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
       max-width:500px; margin:0 auto; padding:16px; }}
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <a href="/dice" style="color:var(--accent);text-decoration:none;font-size:14px;font-weight:600">&larr; Dice Vault</a>
    <span style="font-size:11px;color:var(--text-dim)">Expires in {days_left} days</span>
</div>
<h1 style="font-size:22px;font-weight:800;color:var(--text-bright);margin-bottom:4px">Room {code}</h1>
<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Created {created} &middot; {len(rolls)} rolls &middot; {status}</div>
<div style="margin-bottom:16px">{member_html}</div>
<div style="margin-bottom:16px">
    <button onclick="downloadLog()" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text-muted);padding:8px 16px;font-size:13px;cursor:pointer;font-family:inherit">Download Log</button>
</div>
<div>{rolls_html}</div>
<script>
function downloadLog() {{
    var text = document.body.innerText;
    var blob = new Blob([text], {{type: 'text/plain'}});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dice-vault-room-{code}-log.txt';
    a.click();
}}
</script>
</body>
</html>"""
