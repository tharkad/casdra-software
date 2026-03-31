"""Song Burst trivia game pages — category selection and card play."""

from datetime import datetime
from urllib.parse import quote as url_quote

# These are imported from server.py at module load time (set by server.py)
get_db = None
html_page = None
h = None
WEB_MODE = False


def _app_name():
    return "ChartBurst" if WEB_MODE else "Song Burst"

SONG_BURST_CATEGORIES = [
    # (slug, title, decade_start, decade_end, genre_tag)
    ("60s-90s", "The 60s, 70s, 80s, & 90s", 1960, 1999, None),
    ("60s", "The 60s", 1960, 1969, None),
    ("70s", "The 70s", 1970, 1979, None),
    ("80s", "The 80s", 1980, 1989, None),
    ("90s", "The 90s", 1990, 1999, None),
    ("60s-70s", "The 60s & 70s", 1960, 1979, None),
    ("70s-80s", "The 70s & 80s", 1970, 1989, None),
    ("80s-90s", "The 80s & 90s", 1980, 1999, None),
    ("60s-80s", "The 60s, 70s, & 80s", 1960, 1989, None),
    ("70s-90s", "The 70s, 80s, & 90s", 1970, 1999, None),
    ("prog", "Progressive Rock", 1967, 1993, "prog"),
]


def get_category_info(category):
    """Return (start_year, end_year, genre_tag) for a category slug, or None."""
    for slug, title, start, end, genre in SONG_BURST_CATEGORIES:
        if slug == category:
            return start, end, genre
    return None


def build_song_burst_page():
    """Song Burst category selection — toggle genres + decades, then start."""
    css = """
    body { background: linear-gradient(170deg, #2a9d8f 0%, #248f82 40%, #1e7b70 70%, #16655b 100%);
           min-height: 100vh; color: #1c1c1e; overscroll-behavior: none; }
    .ptr-indicator { display: none !important; }
    .navbar { background: transparent; border-bottom: 0.5px solid rgba(255,255,255,0.25); }
    .navbar a { color: #fff; }
    .sb-hero { text-align: center; padding: 40px 20px 20px; }
    .sb-hero h1 { font-size: 36px; font-weight: 800; letter-spacing: -0.5px; color: #fff;
                  text-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .sb-hero p { font-size: 15px; color: rgba(255,255,255,0.7); margin-top: 8px; }
    .sb-setup { padding: 0 16px; }
    .sb-section { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 12px;
                  box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    .sb-section-header { display: flex; align-items: center; justify-content: space-between;
                         margin-bottom: 12px; }
    .sb-section-title { font-size: 13px; font-weight: 700; text-transform: uppercase;
                        letter-spacing: 1px; color: #888; }
    .sb-quick-btns { display: flex; gap: 6px; }
    .sb-quick-btn { padding: 3px 10px; border-radius: 6px; border: 1px solid #ddd;
                    background: #fff; color: #888; font-size: 11px; font-weight: 600;
                    font-family: inherit; cursor: pointer; }
    .sb-quick-btn:active { background: #eee; }
    .sb-toggles { display: flex; flex-wrap: wrap; gap: 8px; }
    .sb-toggle { padding: 10px 18px; border-radius: 10px; border: 2px solid #ddd;
                 background: #fff; color: #666; font-size: 15px; font-weight: 600;
                 font-family: inherit; cursor: pointer; transition: all 0.15s;
                 -webkit-tap-highlight-color: transparent; }
    .sb-toggle.on { border-color: #2a9d8f; background: #2a9d8f; color: #fff; }
    .sb-toggle:active { transform: scale(0.96); }
    .sb-custom-limit { display: flex; align-items: center; gap: 16px; justify-content: center;
                       margin-top: 12px; }
    .sb-limit-btn { width: 44px; height: 44px; border-radius: 50%; border: 2px solid #ddd;
                    background: #fff; font-size: 22px; font-weight: 700; color: #1c1c1e;
                    cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent;
                    user-select: none; }
    .sb-limit-btn:active { background: #eee; }
    .sb-limit-val { font-size: 28px; font-weight: 800; color: #1c1c1e; min-width: 50px;
                    text-align: center; }
    .sb-team-inputs { display: flex; gap: 10px; }
    @media (max-width: 400px) {
        .sb-team-inputs { flex-direction: column; }
    }
    .sb-start-wrap { padding: 20px 16px 40px; }
    .sb-start { display: block; width: 100%; padding: 16px; border-radius: 14px; border: none;
                background: #fff; color: #2a9d8f; font-size: 18px; font-weight: 700;
                font-family: inherit; cursor: pointer; text-align: center;
                text-decoration: none; box-shadow: 0 2px 12px rgba(0,0,0,0.1);
                transition: transform 0.1s; }
    .sb-start:active { transform: scale(0.97); }
    .sb-start-sub { font-size: 12px; font-weight: 400; color: #888; margin-top: 4px; }
    """

    js = """
    var decades = {50: false, 60: true, 70: true, 80: true, 90: true, '00': false, '10': false};
    var genres = {pop: true, newwave: false, prog: false, metal: false, alt: false, grunge: false, hiphop: false};

    function toggle(type, key) {
        if (type === 'decade') { decades[key] = !decades[key]; }
        else if (type === 'genre') { genres[key] = !genres[key]; }
        else if (type === 'diff') { difficulties[key] = !difficulties[key]; }
        updateUI();
    }

    function setAll(type, value) {
        var obj = (type === 'decade') ? decades : (type === 'diff') ? difficulties : genres;
        for (var k in obj) obj[k] = value;
        updateUI();
    }

    function setRandom(type) {
        var obj = (type === 'decade') ? decades : genres;
        var keys = Object.keys(obj);
        for (var k in obj) obj[k] = false;
        var count = Math.floor(Math.random() * keys.length) + 1;
        var shuffled = keys.sort(function() { return 0.5 - Math.random(); });
        for (var i = 0; i < count; i++) obj[shuffled[i]] = true;
        updateUI();
    }

    function updateUI() {
        document.querySelectorAll('[data-toggle]').forEach(function(el) {
            var type = el.dataset.type;
            var key = el.dataset.key;
            if (type === 'decade') el.classList.toggle('on', !!decades[key]);
            else if (type === 'genre') el.classList.toggle('on', !!genres[key]);
            else if (type === 'diff') el.classList.toggle('on', !!difficulties[key]);
            // mode and limit buttons are handled by setMode/setLimit
        });
        updateStartLink();
    }

    function updateStartLink() {
        var selDecades = [];
        for (var d in decades) { if (decades[d]) selDecades.push(d); }
        var selGenres = [];
        for (var g in genres) { if (genres[g]) selGenres.push(g); }

        var params = [];
        if (selDecades.length > 0 && selDecades.length < 7) {
            params.push('decades=' + selDecades.join(','));
        }
        if (selGenres.length > 0 && selGenres.length < 7) {
            params.push('genres=' + selGenres.join(','));
        }

        var url = '/song-burst/play' + (params.length ? '?' + params.join('&') : '');
        document.getElementById('startBtn').href = url;

        // Update summary
        var dLabel = selDecades.length === 7 ? 'All decades' :
                     selDecades.map(function(d) { return d + 's'; }).join(', ');
        var gLabel = selGenres.length === 0 ? 'No genres selected' :
                     selGenres.length === 7 ? 'All genres' :
                     selGenres.map(function(g) { return g.charAt(0).toUpperCase() + g.slice(1); }).join(', ');
        // Fetch card count
        var countUrl = '/song-burst/count?' + params.join('&');
        fetch(countUrl).then(function(r) { return r.json(); }).then(function(d) {
            document.getElementById('startSub').textContent =
                dLabel + ' · ' + gLabel + ' · ' + d.cards.toLocaleString() + ' cards';
        }).catch(function() {
            document.getElementById('startSub').textContent = dLabel + ' · ' + gLabel;
        });

        var valid = selDecades.length > 0 && selGenres.length > 0;
        document.getElementById('startBtn').style.opacity = valid ? '1' : '0.4';
        document.getElementById('startBtn').style.pointerEvents = valid ? 'auto' : 'none';
    }

    var gameMode = 'coop';
    var cardLimit = 5;
    var difficulties = {easy: true, medium: true, hard: true};

    function setMode(mode) {
        gameMode = mode;
        document.querySelectorAll('[data-type="mode"]').forEach(function(el) {
            el.classList.toggle('on', el.dataset.key === mode);
        });
        document.getElementById('compOptions').style.display = mode === 'comp' ? 'block' : 'none';
        updateStartLink();
        saveSettings();
    }

    function setLimit(n) {
        cardLimit = n;
        document.querySelectorAll('[data-type="limit"]').forEach(function(el) {
            el.classList.toggle('on', parseInt(el.dataset.key) === n);
        });
        document.getElementById('limitVal').textContent = n === 0 ? '\u221e' : n;
        saveSettings();
    }

    var holdTimer = null;
    var holdInterval = null;
    function startHold(dir) {
        // Deselect preset buttons
        document.querySelectorAll('[data-type="limit"]').forEach(function(el) {
            el.classList.remove('on');
        });
        adjustLimit(dir);
        holdTimer = setTimeout(function() {
            holdInterval = setInterval(function() { adjustLimit(dir); }, 80);
        }, 400);
    }
    function stopHold() {
        clearTimeout(holdTimer);
        clearInterval(holdInterval);
    }
    function adjustLimit(dir) {
        var n = cardLimit + dir;
        if (n < 1) n = 1;
        if (n > 200) n = 200;
        cardLimit = n;
        document.getElementById('limitVal').textContent = n;
        saveSettings();
    }

    function handleStart(e) {
        if (gameMode === 'coop') return true; // normal link behavior
        e.preventDefault();
        var selD = [], selG = [];
        for (var d in decades) if (decades[d]) selD.push(d);
        for (var g in genres) if (genres[g]) selG.push(g);

        fetch('/song-burst/session/create', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                game_name: document.getElementById('gameName') ? document.getElementById('gameName').value : '',
                decades: selD.length < 7 ? selD.join(',') : '',
                genres: selG.length < 7 ? selG.join(',') : '',
                team1: document.getElementById('team1').value || 'The A-Team',
                team2: document.getElementById('team2').value || 'The Z-Team',
                card_limit: cardLimit,
                difficulties: Object.keys(difficulties).filter(function(k) { return difficulties[k]; }).join(',')
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(d) {
            localStorage.setItem('sb_active_session', JSON.stringify({code: d.code, creator: true}));
            window.location.href = '/song-burst/session/' + d.code + '/lobby';
        });
    }

    function saveSettings() {
        localStorage.setItem('sb_decades', JSON.stringify(decades));
        localStorage.setItem('sb_genres', JSON.stringify(genres));
        localStorage.setItem('sb_mode', gameMode);
        localStorage.setItem('sb_limit', cardLimit);
        localStorage.setItem('sb_team1', document.getElementById('team1') ? document.getElementById('team1').value : 'The A-Team');
        localStorage.setItem('sb_team2', document.getElementById('team2') ? document.getElementById('team2').value : 'The Z-Team');
        localStorage.setItem('sb_difficulties', JSON.stringify(difficulties));
    }

    function loadSettings() {
        try {
            var sd = localStorage.getItem('sb_decades');
            if (sd) decades = JSON.parse(sd);
            var sg = localStorage.getItem('sb_genres');
            if (sg) genres = JSON.parse(sg);
            var sm = localStorage.getItem('sb_mode');
            if (sm) { gameMode = sm; setMode(sm); }
            var sl = localStorage.getItem('sb_limit');
            if (sl) { cardLimit = parseInt(sl); setLimit(cardLimit); }
            var t1 = localStorage.getItem('sb_team1');
            if (t1 && document.getElementById('team1')) document.getElementById('team1').value = t1;
            var t2 = localStorage.getItem('sb_team2');
            if (t2 && document.getElementById('team2')) document.getElementById('team2').value = t2;
            var sd2 = localStorage.getItem('sb_difficulties');
            if (sd2) difficulties = JSON.parse(sd2);
        } catch(e) {}
    }

    // Override updateUI to also save
    var _origUpdateUI = updateUI;
    updateUI = function() { _origUpdateUI(); saveSettings(); };

    // Check for active game session to rejoin
    function checkRejoin() {
        var session = localStorage.getItem('sb_active_session');
        if (session) {
            try {
                var s = JSON.parse(session);
                fetch('/song-burst/session/' + s.code + '/state')
                .then(function(r) { return r.json(); })
                .then(function(state) {
                    if (state && state.status !== 'ended') {
                        var btn = document.getElementById('rejoinBtn');
                        btn.href = '/song-burst/session/' + s.code + '/play?team=' + s.team +
                                   (s.creator ? '&creator=1' : '');
                        btn.textContent = 'Rejoin: ' + (state.team1_name || 'Game') + ' vs ' + (state.team2_name || '');
                        document.getElementById('rejoinWrap').style.display = 'block';
                    } else {
                        localStorage.removeItem('sb_active_session');
                    }
                }).catch(function() { localStorage.removeItem('sb_active_session'); });
            } catch(e) { localStorage.removeItem('sb_active_session'); }
        }
    }

    document.addEventListener('DOMContentLoaded', function() { loadSettings(); updateUI(); checkRejoin(); });
    """

    app_name = _app_name()
    body = f"""
    <div class="navbar"><a href="/">&#8249; Back</a></div>
    <div class="sb-hero">
        <h1>{app_name}</h1>
        <p style="color:rgba(255,255,255,0.7);font-size:15px;margin-top:8px;font-style:italic;">You need to know the lyrics, AND the melody!</p>
    </div>
    <div style="display:flex;justify-content:space-between;padding:0 16px 8px;align-items:center;">
        <div id="rejoinWrap" style="display:none;">
            <a id="rejoinBtn" href="#" style="color:#fff;font-size:14px;font-weight:600;text-decoration:none;
               background:#f0a500;padding:8px 16px;border-radius:10px;display:inline-block;">Rejoin Game</a>
        </div>
        <div style="margin-left:auto;">
            <a href="/song-burst/join" style="color:#fff;font-size:14px;font-weight:600;text-decoration:none;
               background:rgba(255,255,255,0.2);padding:8px 16px;border-radius:10px;display:inline-block;">Join a Game</a>
        </div>
    </div>
    <div class="sb-setup">
        <div class="sb-section">
            <div class="sb-section-header">
                <div class="sb-section-title">Decades</div>
                <div class="sb-quick-btns">
                    <button class="sb-quick-btn" onclick="setAll('decade',true)">All</button>
                    <button class="sb-quick-btn" onclick="setAll('decade',false)">None</button>
                    <button class="sb-quick-btn" onclick="setRandom('decade')">Random</button>
                </div>
            </div>
            <div class="sb-toggles">
                <button class="sb-toggle" data-toggle data-type="decade" data-key="50" onclick="toggle('decade',50)">50s</button>
                <button class="sb-toggle on" data-toggle data-type="decade" data-key="60" onclick="toggle('decade',60)">60s</button>
                <button class="sb-toggle on" data-toggle data-type="decade" data-key="70" onclick="toggle('decade',70)">70s</button>
                <button class="sb-toggle on" data-toggle data-type="decade" data-key="80" onclick="toggle('decade',80)">80s</button>
                <button class="sb-toggle on" data-toggle data-type="decade" data-key="90" onclick="toggle('decade',90)">90s</button>
                <button class="sb-toggle" data-toggle data-type="decade" data-key="00" onclick="toggle('decade','00')">00s</button>
                <button class="sb-toggle" data-toggle data-type="decade" data-key="10" onclick="toggle('decade','10')">10s</button>
            </div>
        </div>
        <div class="sb-section">
            <div class="sb-section-header">
                <div class="sb-section-title">Genre</div>
                <div class="sb-quick-btns">
                    <button class="sb-quick-btn" onclick="setAll('genre',true)">All</button>
                    <button class="sb-quick-btn" onclick="setAll('genre',false)">None</button>
                    <button class="sb-quick-btn" onclick="setRandom('genre')">Random</button>
                </div>
            </div>
            <div class="sb-toggles">
                <button class="sb-toggle on" data-toggle data-type="genre" data-key="pop" onclick="toggle('genre','pop')">Pop</button>
                <button class="sb-toggle" data-toggle data-type="genre" data-key="prog" onclick="toggle('genre','prog')">Prog Rock</button>
                <button class="sb-toggle" data-toggle data-type="genre" data-key="newwave" onclick="toggle('genre','newwave')">New Wave</button>
                <button class="sb-toggle" data-toggle data-type="genre" data-key="metal" onclick="toggle('genre','metal')">Metal</button>
                <button class="sb-toggle" data-toggle data-type="genre" data-key="alt" onclick="toggle('genre','alt')">Alt Rock</button>
                <button class="sb-toggle" data-toggle data-type="genre" data-key="grunge" onclick="toggle('genre','grunge')">Grunge</button>
                <button class="sb-toggle" data-toggle data-type="genre" data-key="hiphop" onclick="toggle('genre','hiphop')">Hip Hop</button>
            </div>
        </div>
        <div class="sb-section">
            <div class="sb-section-header">
                <div class="sb-section-title">Mode</div>
            </div>
            <div class="sb-toggles">
                <button class="sb-toggle on" data-toggle data-type="mode" data-key="coop" onclick="setMode('coop')">Cooperative</button>
                <button class="sb-toggle" data-toggle data-type="mode" data-key="comp" onclick="setMode('comp')">Competitive</button>
            </div>
        </div>
        <div id="compOptions" style="display:none;">
            <div class="sb-section">
                <div class="sb-section-header">
                    <div class="sb-section-title">Difficulty</div>
                    <div class="sb-quick-btns">
                        <button class="sb-quick-btn" onclick="setAll('diff',true)">All</button>
                    </div>
                </div>
                <div class="sb-toggles">
                    <button class="sb-toggle on" data-toggle data-type="diff" data-key="easy" onclick="toggle('diff','easy')">Easy</button>
                    <button class="sb-toggle on" data-toggle data-type="diff" data-key="medium" onclick="toggle('diff','medium')">Medium</button>
                    <button class="sb-toggle on" data-toggle data-type="diff" data-key="hard" onclick="toggle('diff','hard')">Hard</button>
                </div>
            </div>
            <div class="sb-section">
                <div class="sb-section-header">
                    <div class="sb-section-title">Game Name</div>
                </div>
                <input id="gameName" value=\"""" + _app_name() + " — " + datetime.now().strftime("%m/%d/%Y %I:%M %p") + """"
                       style="width:100%;padding:10px 14px;border:2px solid #ddd;border-radius:10px;font-size:15px;font-family:inherit;box-sizing:border-box;">
            </div>
            <div class="sb-section">
                <div class="sb-section-header">
                    <div class="sb-section-title">Teams</div>
                </div>
                <div class="sb-team-inputs">
                    <input id="team1" value="The A-Team" placeholder="The A-Team"
                           style="flex:1;min-width:0;padding:10px 14px;border:2px solid #ddd;border-radius:10px;font-size:15px;font-family:inherit;">
                    <input id="team2" value="The Z-Team" placeholder="The Z-Team"
                           style="flex:1;min-width:0;padding:10px 14px;border:2px solid #ddd;border-radius:10px;font-size:15px;font-family:inherit;">
                </div>
            </div>
            <div class="sb-section">
                <div class="sb-section-header">
                    <div class="sb-section-title">Cards per team</div>
                </div>
                <div class="sb-toggles">
                    <button class="sb-toggle" data-toggle data-type="limit" data-key="10" onclick="setLimit(10)">10</button>
                    <button class="sb-toggle" data-toggle data-type="limit" data-key="20" onclick="setLimit(20)">20</button><!-- no default on -->
                    <button class="sb-toggle" data-toggle data-type="limit" data-key="50" onclick="setLimit(50)">50</button>
                    <button class="sb-toggle" data-toggle data-type="limit" data-key="0" onclick="setLimit(0)">&infin;</button>
                </div>
                <div class="sb-custom-limit">
                    <button class="sb-limit-btn" onmousedown="startHold(-1)" onmouseup="stopHold()" onmouseleave="stopHold()"
                            ontouchstart="startHold(-1)" ontouchend="stopHold()">&minus;</button>
                    <span class="sb-limit-val" id="limitVal">5</span>
                    <button class="sb-limit-btn" onmousedown="startHold(1)" onmouseup="stopHold()" onmouseleave="stopHold()"
                            ontouchstart="startHold(1)" ontouchend="stopHold()">&plus;</button>
                </div>
            </div>
        </div>
    </div>
    <div class="sb-start-wrap">
        <a class="sb-start" id="startBtn" href="/song-burst/play" onclick="return handleStart(event);">
            Start Game
            <div class="sb-start-sub" id="startSub">All decades · Pop</div>
        </a>
    </div>
    """
    return html_page(_app_name(), body, extra_css=css, extra_js=js)


def build_where(decades=None, genres=None, difficulty=None, conn=None):
    """Build SQL WHERE clause for filtering cards by decades/genres/difficulty."""
    clauses = []
    params = []

    if difficulty and difficulty in ("easy", "medium", "hard"):
        clauses.append("c.difficulty = ?")
        params.append(difficulty)

    if decades:
        decade_list = [int(d) for d in decades.split(",") if d.strip().isdigit()]
        if decade_list and len(decade_list) < 7:
            yc = []
            for d in decade_list:
                ys = 1900 + d if d >= 50 else 2000 + d
                yc.append(f"(s.year BETWEEN {ys} AND {ys + 9})")
            clauses.append("(" + " OR ".join(yc) + ")")

    if genres and conn:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(song_burst_songs)").fetchall()]
        if "genre_tags" in cols:
            genre_list = [g.strip() for g in genres.split(",")]
            all_genres = {"pop", "newwave", "prog", "metal", "alt", "grunge", "hiphop"}
            selected = set(genre_list) & all_genres
            if selected and selected != all_genres:
                gc = []
                if "pop" in selected:
                    gc.append("(s.genre_tags IS NULL OR s.genre_tags = '' OR s.genre_tags = 'pop')")
                for g in ("newwave", "prog", "metal", "alt", "grunge", "hiphop"):
                    if g in selected:
                        gc.append(f"s.genre_tags = '{g}'")
                if gc:
                    clauses.append("(" + " OR ".join(gc) + ")")

    where = " AND ".join(clauses) if clauses else "1=1"
    return where, params


def build_song_burst_play_page(conn, difficulty=None, category=None, decades=None, genres=None):
    """Show a random Song Burst card."""
    css = """
    /* Teal gradient matching category page */
    body { background: linear-gradient(170deg, #2a9d8f 0%, #248f82 40%, #1e7b70 70%, #16655b 100%);
           min-height: 100vh; color: #1c1c1e; overscroll-behavior: none; }
    .ptr-indicator { display: none !important; }
    .navbar { background: transparent; border-bottom: 0.5px solid rgba(255,255,255,0.25); }
    .navbar a { color: #fff; }
    .navbar-title { color: #fff; }
    .navbar a.sb-end-game { background: repeating-linear-gradient(135deg, #e0544e, #e0544e 6px, #c4403a 6px, #c4403a 12px) !important;
                   color: #fff !important; padding: 6px 14px !important; border-radius: 8px;
                   font-size: 14px; font-weight: 600; text-decoration: none; }
    .sb-end-confirm { display: none; align-items: center; gap: 10px; background: #fff;
                      padding: 8px 14px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.25);
                      position: absolute; left: 110px; top: 50%; transform: translateY(-50%);
                      white-space: nowrap; z-index: 20; }
    .sb-end-confirm.visible { display: flex; }
    .sb-end-confirm span { color: #1c1c1e; font-size: 14px; font-weight: 600; }
    .sb-end-yes { background: #e0544e !important; color: #fff !important; padding: 6px 12px !important;
                  border-radius: 6px; font-size: 13px; font-weight: 600; text-decoration: none; }
    .sb-end-no { background: #eee !important; color: #1c1c1e !important; padding: 6px 12px !important;
                 border-radius: 6px; font-size: 13px; font-weight: 600; text-decoration: none; }
    .sb-end-game:active { opacity: 0.8; }

    /* Card outer frame — colored border by difficulty */
    .sb-card { margin: 16px; border-radius: 16px; overflow: hidden; padding: 10px;
               background: #5cb8ff; }
    .sb-card-easy { background: #5cb8ff; }
    .sb-card-medium { background: #f0a500; }
    .sb-card-hard { background: #e0544e; }
    .sb-card-inner { background: #fff; border-radius: 10px; overflow: hidden; }

    /* Top section: art + metadata side by side */
    .sb-card-top { display: flex; padding: 16px 20px 12px; gap: 14px; align-items: flex-start; }
    .sb-card-art { width: 80px; height: 80px; border-radius: 6px; object-fit: cover;
                   flex-shrink: 0; box-shadow: 0 2px 12px rgba(0,0,0,0.4); }
    .sb-card-art-placeholder { width: 80px; height: 80px; border-radius: 6px; flex-shrink: 0;
                               background: #f0f0f0; display: flex; align-items: center;
                               justify-content: center; font-size: 28px; color: #ccc; }
    .sb-card-meta { flex: 1; min-width: 0; }
    .sb-card-song { font-size: 18px; font-weight: 800; color: #1c1c1e; letter-spacing: -0.3px;
                    line-height: 1.2; }
    .sb-card-artist { font-size: 15px; font-weight: 600; color: #444; margin-top: 0; }
    .sb-card-year { font-size: 13px; color: #888; margin-top: 1px; }
    .sb-album { font-size: 13px; font-weight: 500; color: #888; font-style: italic; margin-top: 1px;
                overflow: hidden; text-overflow: ellipsis;
                display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }

    /* Chart info */
    .sb-chart-info { font-size: 13px; font-weight: 500; color: #666; margin-top: 6px; }

    /* Difficulty badge inline with metadata */
    .sb-diff-word { font-size: 10px; font-weight: 800; text-transform: uppercase;
                    letter-spacing: 1.5px; padding: 2px 10px; border-radius: 4px;
                    display: inline-block; margin-top: 6px; }
    .sb-diff-word-easy { background: #5cb8ff; color: #fff; }
    .sb-diff-word-medium { background: #f0a500; color: #fff; }
    .sb-diff-word-hard { background: #e0544e; color: #fff; }
    .sb-card-id { font-size: 11px; color: #aaa; margin-left: 6px; font-weight: 400; }

    /* Clues */
    .sb-clues { padding: 4px 20px 12px; }
    .sb-clue { padding: 7px 0; font-size: 17px; line-height: 1.5; display: none; color: #1c1c1e; }
    .sb-clue.visible { display: flex; align-items: flex-start; gap: 10px; }
    .sb-clue-num { flex-shrink: 0; display: inline-flex; width: 30px; height: 30px;
                   align-items: center; justify-content: center; border-radius: 50%;
                   background: #1c1c1e; color: #fff; font-size: 15px; font-weight: 800; }
    .sb-clue-text { flex: 1; padding-top: 4px; }

    /* Answer banner */
    .sb-answer { padding: 16px 20px; font-size: 18px; font-weight: 700; font-style: italic;
                 text-align: center; display: none; line-height: 1.4; }
    .sb-answer.visible { display: block; }
    .sb-answer-easy { background: #5cb8ff; color: #fff; }
    .sb-answer-medium { background: #f0a500; color: #fff; }
    .sb-answer-hard { background: #e0544e; color: #fff; }

    /* Controls */
    .sb-bottom-bar { display: none; padding: 8px 20px 24px; align-items: flex-start;
                     justify-content: space-between; }
    .sb-bottom-bar.visible { display: flex; }
    .sb-uhoh-wrap { position: relative; }
    .sb-bottom-right { display: flex; gap: 12px; align-items: center; }
    .sb-btn { padding: 14px 28px; border-radius: 12px; border: none; font-size: 16px;
              font-weight: 600; font-family: inherit; cursor: pointer; transition: transform 0.1s; }
    .sb-btn:active { transform: scale(0.96); }
    .sb-btn-reveal { color: #fff; }
    .sb-btn-reveal-easy { background: #5cb8ff; }
    .sb-btn-reveal-medium { background: #f0a500; }
    .sb-btn-reveal-hard { background: #e0544e; }
    .sb-btn-next { color: #fff; text-decoration: none; }
    .sb-btn-next-easy { background: #5cb8ff; }
    .sb-btn-next-medium { background: #f0a500; }
    .sb-btn-next-hard { background: #e0544e; }
    .sb-btn-play { background: #fc3c44; color: #fff; font-size: 14px;
                   padding: 10px 18px; text-decoration: none; }
    /* YouTube overlay */
    .sb-yt-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                     background: rgba(0,0,0,0.9); z-index: 100; flex-direction: column; }
    .sb-yt-overlay.visible { display: flex; }
    .sb-yt-header { display: flex; justify-content: flex-end; padding: 12px 16px; flex-shrink: 0; }
    .sb-yt-close { background: #e0544e; color: #fff; border: none; border-radius: 50%;
                   width: 48px; height: 48px; font-size: 24px; font-weight: 700; cursor: pointer; }
    .sb-yt-frame { flex: 1; width: 100%; border: none; }

    .sb-tap-hint { text-align: center; padding: 6px; font-size: 13px; color: rgba(255,255,255,0.6);
                   font-style: italic; }
    .sb-uhoh-btn { background: #e0544e; color: #fff; border: none; border-radius: 12px;
                   padding: 14px 18px; font-size: 14px; font-weight: 600; font-family: inherit;
                   cursor: pointer; }
    .sb-uhoh-btn:active { opacity: 0.8; }
    .sb-uhoh-menu { display: none; margin-top: 8px; background: #fff; border-radius: 10px;
                    overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.25);
                    position: absolute; bottom: 100%; left: 0; min-width: 180px; margin-bottom: 8px; z-index: 10; }
    .sb-uhoh-menu.visible { display: block; }
    .sb-uhoh-item { display: block; width: 100%; padding: 12px 16px; border: none; background: #fff;
                    color: #1c1c1e; font-size: 15px; font-family: inherit; cursor: pointer;
                    text-align: left; border-bottom: 0.5px solid #eee; }
    .sb-uhoh-item:last-child { border-bottom: none; }
    .sb-uhoh-item:active { background: #f0f0f0; }
    .sb-uhoh-done { color: #5cb8ff; font-weight: 600; font-size: 13px; margin-top: 8px;
                    display: none; }
    .sb-filter a.f-nope { background: rgba(255,255,255,0.25); color: #fff; margin-left: auto; }
    .sb-filter a.f-nope:active { background: rgba(255,255,255,0.4); }

    /* Filter buttons */
    .sb-filter { display: flex; gap: 8px; justify-content: center; padding: 12px 16px 0; }
    .sb-filter a { padding: 6px 14px; border-radius: 20px; font-size: 14px; font-weight: 600;
                   text-decoration: none; color: #fff; background: rgba(0,0,0,0.25);
                   border: 3px solid transparent; }
    .sb-filter a.f-all.active { background: #1c1c1e; border-color: #1c1c1e; }
    .sb-filter a.f-easy.active { background: #5cb8ff; border-color: #5cb8ff; }
    .sb-filter a.f-medium.active { background: #f0a500; border-color: #f0a500; }
    .sb-filter a.f-hard.active { background: #e0544e; border-color: #e0544e; }
    """

    clauses = []
    params = []
    if difficulty and difficulty in ("easy", "medium", "hard"):
        clauses.append("c.difficulty = ?")
        params.append(difficulty)
    # Filter by decades
    if decades:
        decade_list = [int(d) for d in decades.split(",") if d.strip().isdigit()]
        if decade_list and len(decade_list) < 7:
            year_clauses = []
            for d in decade_list:
                year_start = 1900 + d if d >= 50 else 2000 + d
                year_clauses.append(f"(s.year BETWEEN {year_start} AND {year_start + 9})")
            clauses.append("(" + " OR ".join(year_clauses) + ")")

    # Filter by genres (via genre_tags column)
    has_genre_col = "genre_tags" in [r[1] for r in conn.execute("PRAGMA table_info(song_burst_songs)").fetchall()]
    if genres and has_genre_col:
        genre_list = [g.strip() for g in genres.split(",")]
        all_genres = {"pop", "newwave", "prog", "metal", "alt", "grunge", "hiphop"}
        selected = set(genre_list) & all_genres
        if selected and selected != all_genres:
            genre_clauses = []
            if "pop" in selected:
                genre_clauses.append("(s.genre_tags IS NULL OR s.genre_tags = '' OR s.genre_tags = 'pop')")
            for g in ("newwave", "prog", "metal", "alt", "grunge", "hiphop"):
                if g in selected:
                    genre_clauses.append(f"s.genre_tags = '{g}'")
            if genre_clauses:
                clauses.append("(" + " OR ".join(genre_clauses) + ")")

    # Legacy category support
    if category:
        base_cat = category.replace("-top10", "")
        is_top10 = category.endswith("-top10")
        cat_info = get_category_info(base_cat)
        if cat_info:
            start, end, genre = cat_info
            clauses.append("s.year BETWEEN ? AND ?")
            params.extend([start, end])
            if genre and has_genre_col:
                clauses.append("s.genre_tags = ?")
                params.append(genre)
        if is_top10:
            clauses.append("s.peak_position <= 10")

    where = " AND ".join(clauses) if clauses else "1=1"

    # Check which optional columns exist
    cols = [r[1] for r in conn.execute("PRAGMA table_info(song_burst_songs)").fetchall()]
    extra_cols = ""
    extra_col_names = []
    for col in ["weeks_top_10", "weeks_top_40", "album_art_url", "apple_track_id"]:
        if col in cols:
            extra_cols += f", s.{col}"
            extra_col_names.append(col)

    row = conn.execute(f"""
        SELECT c.id, c.song_id, c.difficulty, c.section_type, c.clue_3, c.clue_2, c.clue_1, c.answer_line,
               s.title, s.artist, s.year, s.album, s.peak_position, s.weeks_on_chart
               {extra_cols}
        FROM song_burst_cards c
        JOIN song_burst_songs s ON c.song_id = s.id
        WHERE {where}
        ORDER BY RANDOM() LIMIT 1
    """, params).fetchone()

    if not row:
        body = """
        <div class="navbar"><a href="/song-burst">&#8249; Back</a></div>
        <div class="no-results" style="color:rgba(255,255,255,0.7);">No cards available for this category yet. Data is still loading!</div>
        <div style="text-align:center;padding:16px;"><a href="/song-burst" style="color:#fff;font-weight:600;">&#8249; Back to categories</a></div>
        """
        return html_page(_app_name(), body, extra_css=css)

    card_id, song_id, diff, sec, c3, c2, c1, answer, title, artist, year, album, peak, weeks = row[:14]
    extra_vals = {name: row[14 + i] for i, name in enumerate(extra_col_names)}
    weeks_10 = extra_vals.get("weeks_top_10")
    weeks_40 = extra_vals.get("weeks_top_40")
    album_art_url = extra_vals.get("album_art_url")
    apple_track_id = extra_vals.get("apple_track_id")
    diff_class = f"sb-diff-{diff}"
    answer_class = f"sb-answer-{diff}"
    album_html = f'<div class="sb-album">{h(album)}</div>' if album and album != "NEEDS_REFETCH" else ""
    if album_art_url:
        art_html = f'<img class="sb-card-art" src="{h(album_art_url)}" alt="Album art">'
    else:
        art_html = '<div class="sb-card-art-placeholder">&#9835;</div>'

    chart_parts = []
    if peak:
        chart_parts.append(f"Peaked at #{peak}")
    if weeks_40:
        chart_parts.append(f"{weeks_40} weeks on Top 40")
    elif weeks:
        chart_parts.append(f"{weeks} weeks on Hot 100")
    chart_info = " &middot; ".join(chart_parts)
    chart_html = f'<div class="sb-chart-info">{chart_info}</div>' if chart_parts else '<div class="sb-chart-info"></div>'

    cat_qs = f"&category={category}" if category else ""
    def play_url(diff=None):
        parts = []
        if diff:
            parts.append(f"difficulty={diff}")
        if decades:
            parts.append(f"decades={decades}")
        if genres:
            parts.append(f"genres={genres}")
        if category:
            parts.append(f"category={category}")
        return "/song-burst/play" + ("?" + "&".join(parts) if parts else "")

    # Build nav label
    cat_label = _app_name()
    if decades or genres:
        label_parts = []
        if decades:
            label_parts.append(", ".join(d + "s" for d in decades.split(",")))
        if genres:
            label_parts.append(", ".join(g.title() for g in genres.split(",")))
        cat_label = " · ".join(label_parts)
    elif category:
        base_cat = category.replace("-top10", "") if category else ""
        is_top10 = category.endswith("-top10") if category else False
        for cat_slug, cat_title, _, _, _ in SONG_BURST_CATEGORIES:
            if cat_slug == base_cat:
                cat_label = cat_title + (" — Top 10" if is_top10 else "")
                break

    body = f"""
    <div class="navbar">
        <a href="#" class="sb-end-game" onclick="showEndConfirm(event)">End Game</a>
        <div class="sb-end-confirm" id="endConfirm">
            <span>Quit game?</span>
            <a href="/song-burst" class="sb-end-yes">Yes</a>
            <a href="#" class="sb-end-no" onclick="hideEndConfirm(event)">Back to Game</a>
        </div>
        <span class="navbar-title">{cat_label}</span>
    </div>
    <div class="sb-filter">
        <a href="#" class="f-easy {"active" if not difficulty or difficulty == "easy" else ""}" onclick="toggleDiff('easy');return false;">Easy</a>
        <a href="#" class="f-medium {"active" if not difficulty or difficulty == "medium" else ""}" onclick="toggleDiff('medium');return false;">Medium</a>
        <a href="#" class="f-hard {"active" if not difficulty or difficulty == "hard" else ""}" onclick="toggleDiff('hard');return false;">Hard</a>
        <a href="#" class="f-nope" onclick="skipToAnswer();return false;">Nope</a>
    </div>
    <div class="sb-card sb-card-{diff}" onclick="revealNext()" style="cursor:pointer;">
      <div class="sb-card-inner">
        <div class="sb-card-top">
            {art_html}
            <div class="sb-card-meta">
                <div class="sb-card-song">{h(title)}</div>
                <div class="sb-card-artist">{h(artist)} &middot; {year}</div>
                {album_html}
                {chart_html}
                <span class="sb-diff-word sb-diff-word-{diff}">{diff}</span>
                <span class="sb-card-id">#{card_id}</span>
            </div>
        </div>
        <div class="sb-clues">
            <div class="sb-clue visible" id="clue3">
                <span class="sb-clue-num">&bull;</span>
                <span class="sb-clue-text">{h(c3)}</span>
            </div>
            <div class="sb-clue" id="clue2">
                <span class="sb-clue-num">&bull;</span>
                <span class="sb-clue-text">{h(c2)}</span>
            </div>
            <div class="sb-clue" id="clue1">
                <span class="sb-clue-num">&bull;</span>
                <span class="sb-clue-text">{h(c1)}</span>
            </div>
        </div>
        <div class="sb-answer sb-answer-{diff}" id="answer">
            <a href="https://genius.com/search?q={url_quote(artist + ' ' + title)}" target="_blank"
               style="color:inherit;text-decoration:none;">&ldquo;{h(answer)}&rdquo;
            <div style="font-size:11px;font-weight:400;font-style:normal;margin-top:4px;opacity:0.8;">View lyrics on Genius &#8599;</div></a>
        </div>
      </div>
    </div>
    <div class="sb-bottom-bar" id="bottomBar">
        <div class="sb-uhoh-wrap">
            <button class="sb-uhoh-btn" onclick="toggleUhOh()">Uh Oh</button>
            <div class="sb-uhoh-menu" id="uhohMenu">
                <button class="sb-uhoh-item" onclick="reportCard('bad_album')">Bad album</button>
                <button class="sb-uhoh-item" onclick="reportCard('remake_card')">Remake card</button>
                <button class="sb-uhoh-item" onclick="showDiffMenu()">Wrong difficulty</button>
            </div>
            <div class="sb-uhoh-menu" id="diffMenu">
                {"".join(f'<button class="sb-uhoh-item" onclick="changeDifficulty(' + "'" + d + "'" + ')">'
                         + f'Should be {d}</button>' for d in ("easy", "medium", "hard") if d != diff)}
            </div>
            <div class="sb-uhoh-done" id="uhohDone">Reported — thanks!</div>
        </div>
        <div class="sb-bottom-right">
            <a class="sb-btn sb-btn-play" href="https://www.youtube.com/results?search_query={url_quote(artist + ' ' + title + ' official')}" target="_blank">&#9654; Play Song</a>
            <a class="sb-btn sb-btn-next sb-btn-next-{diff}" href="{play_url(difficulty)}">New Card</a>
        </div>
    </div>
    <div class="sb-tap-hint" id="tapHint">Tap card for next clue</div>
    <div class="sb-yt-overlay" id="ytOverlay">
        <div class="sb-yt-header">
            <button class="sb-yt-close" onclick="closeYouTube()">&times;</button>
        </div>
        <iframe class="sb-yt-frame" id="ytFrame" src="" allowfullscreen></iframe>
    </div>
    """

    js = f"""
    var step = 0;
    var diffToggles = {{easy: {str(not difficulty or difficulty == "easy").lower()}, medium: {str(not difficulty or difficulty == "medium").lower()}, hard: {str(not difficulty or difficulty == "hard").lower()}}};
    function toggleDiff(d) {{
        diffToggles[d] = !diffToggles[d];
        if (!diffToggles.easy && !diffToggles.medium && !diffToggles.hard) {{ diffToggles[d] = true; return; }}
        updateDiffUI();
    }}
    var cardId = {card_id};
    var songId = {song_id};
    function updateDiffUI() {{
        document.querySelector('.f-easy').classList.toggle('active', diffToggles.easy);
        document.querySelector('.f-medium').classList.toggle('active', diffToggles.medium);
        document.querySelector('.f-hard').classList.toggle('active', diffToggles.hard);
        var btn = document.querySelector('.sb-btn-next');
        if (btn) {{
            var sel = [];
            if (diffToggles.easy) sel.push('easy');
            if (diffToggles.medium) sel.push('medium');
            if (diffToggles.hard) sel.push('hard');
            var base = '{play_url()}';
            if (sel.length < 3) {{
                var d = sel[Math.floor(Math.random() * sel.length)];
                btn.href = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'difficulty=' + d;
            }} else {{
                btn.href = base;
            }}
            var colors = [];
            if (diffToggles.easy) colors.push('#5cb8ff');
            if (diffToggles.medium) colors.push('#f0a500');
            if (diffToggles.hard) colors.push('#e0544e');
            if (colors.length === 1) {{
                btn.style.background = colors[0];
            }} else {{
                var stops = [];
                var pct = 100 / colors.length;
                for (var i = 0; i < colors.length; i++) {{
                    stops.push(colors[i] + ' ' + (i * pct) + '%');
                    stops.push(colors[i] + ' ' + ((i + 1) * pct) + '%');
                }}
                btn.style.background = 'linear-gradient(90deg, ' + stops.join(', ') + ')';
            }}
        }}
    }}

    function showAnswer() {{
        document.getElementById('clue2').classList.add('visible');
        document.getElementById('clue1').classList.add('visible');
        document.getElementById('answer').classList.add('visible');
        document.getElementById('bottomBar').classList.add('visible');
        document.getElementById('tapHint').style.display = 'none';
        var card = document.querySelector('.sb-card');
        card.style.cursor = 'default';
        card.onclick = null;
        step = 3;
    }}
    function revealNext() {{
        step++;
        if (step === 1) {{
            document.getElementById('clue2').classList.add('visible');
        }} else if (step === 2) {{
            document.getElementById('clue1').classList.add('visible');
        }} else if (step >= 3) {{
            showAnswer();
        }}
    }}
    function skipToAnswer() {{
        if (step >= 3) {{
            window.location.href = document.querySelector('.sb-btn-next').href;
        }} else {{
            showAnswer();
        }}
    }}
    function toggleUhOh() {{
        document.getElementById('uhohMenu').classList.toggle('visible');
        document.getElementById('diffMenu').classList.remove('visible');
    }}
    function showDiffMenu() {{
        document.getElementById('uhohMenu').classList.remove('visible');
        document.getElementById('diffMenu').classList.add('visible');
    }}
    function reportCard(action) {{
        fetch('/song-burst/report', {{
            method: 'POST',
            headers: {{'Content-Type': 'application/json'}},
            body: JSON.stringify({{card_id: cardId, song_id: songId, action: action}})
        }}).then(function() {{
            document.getElementById('uhohMenu').style.display = 'none';
            document.getElementById('diffMenu').style.display = 'none';
            document.getElementById('uhohDone').style.display = 'block';
            document.querySelector('.sb-uhoh-btn').style.display = 'none';
        }});
    }}
    function showEndConfirm(e) {{
        e.preventDefault();
        document.getElementById('endConfirm').classList.add('visible');
    }}
    function hideEndConfirm(e) {{
        e.preventDefault();
        document.getElementById('endConfirm').classList.remove('visible');
    }}
    document.addEventListener('click', function(e) {{
        var ec = document.getElementById('endConfirm');
        if (ec.classList.contains('visible') && !ec.contains(e.target) && !e.target.classList.contains('sb-end-game')) {{
            ec.classList.remove('visible');
        }}
    }});
    var ytQuery = "{url_quote(artist + ' ' + title + ' official')}";
    function openYouTube() {{
        document.getElementById('ytFrame').src = 'https://www.youtube.com/results?search_query=' + ytQuery;
        document.getElementById('ytOverlay').classList.add('visible');
    }}
    function closeYouTube() {{
        document.getElementById('ytFrame').src = '';
        document.getElementById('ytOverlay').classList.remove('visible');
    }}
    function changeDifficulty(newDiff) {{
        fetch('/song-burst/report', {{
            method: 'POST',
            headers: {{'Content-Type': 'application/json'}},
            body: JSON.stringify({{card_id: cardId, song_id: songId, action: 'change_difficulty', new_difficulty: newDiff}})
        }}).then(function() {{
            document.getElementById('diffMenu').style.display = 'none';
            document.getElementById('uhohDone').style.display = 'block';
            document.getElementById('uhohDone').textContent = 'Changed to ' + newDiff + '!';
            document.querySelector('.sb-uhoh-btn').style.display = 'none';
        }});
    }}
    """
    return html_page(_app_name(), body, extra_css=css, extra_js=js)
