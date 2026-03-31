"""Song Burst competitive/team game session management."""

import json
import random
import string
from urllib.parse import quote as url_quote

# Injected from server.py at load time
get_db = None
WEB_MODE = False
html_page = None
h = None

SCORING = {
    "easy":   {3: 3, 2: 2, 1: 1},
    "medium": {3: 5, 2: 3, 1: 2},
    "hard":   {3: 7, 2: 5, 1: 3},
}


GENRE_LABELS = {
    "pop": "Pop", "newwave": "New Wave", "prog": "Prog Rock",
    "metal": "Metal", "alt": "Alt Rock", "grunge": "Grunge", "hiphop": "Hip Hop",
}


def format_loadout(session):
    """Format the decades + genres selection as badge HTML."""
    badges = []
    decades = session.get("decades", "")
    if decades:
        for d in decades.split(","):
            badges.append(f'<span class="sb-loadout-badge sb-badge-decade">{d}s</span>')
    else:
        badges.append('<span class="sb-loadout-badge sb-badge-decade">All decades</span>')
    genres = session.get("genres", "")
    if genres:
        for g in genres.split(","):
            badges.append(f'<span class="sb-loadout-badge sb-badge-genre">{GENRE_LABELS.get(g, g.title())}</span>')
    else:
        badges.append('<span class="sb-loadout-badge sb-badge-genre">All genres</span>')
    return " ".join(badges)


def generate_session_code():
    """Generate a 4-character uppercase session code."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))


def create_session(decades, genres, team1_name, team2_name, card_limit=0, game_name="", difficulties=""):
    """Create a new game session in lobby state. Returns the session code."""
    conn = get_db()
    code = generate_session_code()

    while conn.execute("SELECT id FROM game_sessions WHERE id = ?", (code,)).fetchone():
        code = generate_session_code()

    # Build card deck
    from pages.song_burst import build_where
    where, params = build_where(decades=decades, genres=genres, conn=conn)

    # Filter by difficulty if specified
    if difficulties:
        diff_list = [d.strip() for d in difficulties.split(",") if d.strip() in ("easy", "medium", "hard")]
        if diff_list and len(diff_list) < 3:
            placeholders = ",".join(["?"] * len(diff_list))
            where += f" AND c.difficulty IN ({placeholders})"
            params.extend(diff_list)

    card_ids = [r[0] for r in conn.execute(f"""
        SELECT c.id FROM song_burst_cards c
        JOIN song_burst_songs s ON c.song_id = s.id
        WHERE {where}
    """, params).fetchall()]

    random.shuffle(card_ids)
    if card_limit and card_limit > 0:
        card_ids = card_ids[:card_limit * 2]

    first_card = card_ids[0] if card_ids else None

    conn.execute("""
        INSERT INTO game_sessions
        (id, game_name, decades, genres, team1_name, team2_name, card_sequence, card_limit,
         current_card_id, current_host_team, current_clue_level, lobby_status, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 3, 'lobby', 'active')
    """, (code, game_name or "", decades or "", genres or "", team1_name, team2_name,
          json.dumps(card_ids), card_limit or 0, first_card))
    conn.commit()
    conn.close()
    return code


def get_session(code):
    """Get session data. Returns dict or None."""
    conn = get_db()
    row = conn.execute("SELECT * FROM game_sessions WHERE id = ?", (code,)).fetchone()
    conn.close()
    if not row:
        return None
    return dict(row)


def get_current_card(session):
    """Get the current card data for a session."""
    card_id = session["current_card_id"]
    if not card_id:
        return None

    conn = get_db()
    cols = [r[1] for r in conn.execute("PRAGMA table_info(song_burst_songs)").fetchall()]
    extra = ""
    for c in ["album_art_url"]:
        if c in cols:
            extra += f", s.{c}"

    row = conn.execute(f"""
        SELECT c.id, c.difficulty, c.clue_3, c.clue_2, c.clue_1, c.answer_line,
               s.title, s.artist, s.year, s.album, s.peak_position{extra}
        FROM song_burst_cards c
        JOIN song_burst_songs s ON c.song_id = s.id
        WHERE c.id = ?
    """, (card_id,)).fetchone()
    conn.close()

    if not row:
        return None

    card = {
        "id": row[0], "difficulty": row[1],
        "clue_3": row[2], "clue_2": row[3], "clue_1": row[4],
        "answer": row[5], "title": row[6], "artist": row[7],
        "year": row[8], "album": row[9], "peak": row[10],
    }
    if "album_art_url" in cols:
        card["album_art_url"] = row[11]
    if card["album"] == "NEEDS_REFETCH":
        card["album"] = None
    return card


def advance_clue(code):
    """Advance to next clue level. Returns new level or None if already at 1."""
    conn = get_db()
    session = dict(conn.execute("SELECT * FROM game_sessions WHERE id = ?", (code,)).fetchone())
    level = session["current_clue_level"]
    if level > 1:
        new_level = level - 1
        conn.execute("UPDATE game_sessions SET current_clue_level = ? WHERE id = ?", (new_level, code))
        conn.commit()
        conn.close()
        return new_level
    conn.close()
    return None


def accept_answer(code):
    """Accept answer at current clue level. Awards points, swaps teams, loads next card."""
    conn = get_db()
    session = dict(conn.execute("SELECT * FROM game_sessions WHERE id = ?", (code,)).fetchone())

    # Calculate points
    card = get_current_card(session)
    if not card:
        conn.close()
        return None

    diff = card["difficulty"]
    level = session["current_clue_level"]
    points = SCORING.get(diff, {}).get(level, 0)

    # Award points to guessing team (opposite of host)
    guessing_team = 2 if session["current_host_team"] == 1 else 1
    score_col = f"team{guessing_team}_score"
    new_score = session[score_col] + points

    # Swap host team and advance to next card
    new_host = 2 if session["current_host_team"] == 1 else 1
    card_seq = json.loads(session["card_sequence"])
    new_index = session["card_index"] + 1

    # Check if game should end
    if session["card_limit"] > 0 and new_index >= session["card_limit"] * 2:
        conn.execute(f"""UPDATE game_sessions SET {score_col} = ?, status = 'ended' WHERE id = ?""",
                     (new_score, code))
        conn.commit()
        conn.close()
        return {"points": points, "ended": True}

    next_card = card_seq[new_index] if new_index < len(card_seq) else None

    conn.execute(f"""UPDATE game_sessions SET
        {score_col} = ?, current_host_team = ?, current_card_id = ?,
        card_index = ?, current_clue_level = 3
        WHERE id = ?""",
        (new_score, new_host, next_card, new_index, code))
    conn.commit()
    conn.close()
    return {"points": points, "ended": next_card is None}


def miss_card(code):
    """Team missed. No points. Swap teams, next card."""
    conn = get_db()
    session = dict(conn.execute("SELECT * FROM game_sessions WHERE id = ?", (code,)).fetchone())

    new_host = 2 if session["current_host_team"] == 1 else 1
    card_seq = json.loads(session["card_sequence"])
    new_index = session["card_index"] + 1

    if session["card_limit"] > 0 and new_index >= session["card_limit"] * 2:
        conn.execute("UPDATE game_sessions SET status = 'ended' WHERE id = ?", (code,))
        conn.commit()
        conn.close()
        return {"ended": True}

    next_card = card_seq[new_index] if new_index < len(card_seq) else None

    conn.execute("""UPDATE game_sessions SET
        current_host_team = ?, current_card_id = ?,
        card_index = ?, current_clue_level = 3
        WHERE id = ?""",
        (new_host, next_card, new_index, code))
    conn.commit()
    conn.close()
    return {"ended": next_card is None}


def skip_card(code):
    """Skip current card. No points. Same team hosts, new card (no turn swap)."""
    conn = get_db()
    session = dict(conn.execute("SELECT * FROM game_sessions WHERE id = ?", (code,)).fetchone())

    card_seq = json.loads(session["card_sequence"])
    new_index = session["card_index"] + 1

    if new_index >= len(card_seq):
        conn.execute("UPDATE game_sessions SET status = 'ended' WHERE id = ?", (code,))
        conn.commit()
        conn.close()
        return {"ended": True}

    next_card = card_seq[new_index]

    conn.execute("""UPDATE game_sessions SET
        current_card_id = ?,
        card_index = ?, current_clue_level = 3
        WHERE id = ?""",
        (next_card, new_index, code))
    conn.commit()
    conn.close()
    return {"ended": next_card is None}


def get_session_state(code):
    """Get current session state for polling."""
    session = get_session(code)
    if not session:
        return None
    return {
        "clue_level": session["current_clue_level"],
        "card_id": session["current_card_id"],
        "host_team": session["current_host_team"],
        "team1_score": session["team1_score"],
        "team2_score": session["team2_score"],
        "team1_name": session["team1_name"],
        "team2_name": session["team2_name"],
        "card_index": session["card_index"],
        "card_limit": session["card_limit"],
        "status": session["status"],
        "lobby_status": session.get("lobby_status", "lobby"),
    }


# ---------------------------------------------------------------------------
# Page builders
# ---------------------------------------------------------------------------

def add_player(code, player_name, team, is_host=False):
    """Add a player to the game session."""
    conn = get_db()
    conn.execute(
        "INSERT INTO game_players (session_id, player_name, team, is_host) VALUES (?, ?, ?, ?)",
        (code, player_name, team, 1 if is_host else 0),
    )
    conn.commit()
    conn.close()


def get_players(code):
    """Get all players in a session."""
    conn = get_db()
    rows = conn.execute(
        "SELECT player_name, team, is_host FROM game_players WHERE session_id = ? ORDER BY joined_at",
        (code,),
    ).fetchall()
    conn.close()
    return [{"name": r[0], "team": r[1], "is_host": r[2]} for r in rows]


def start_game(code):
    """Transition from lobby to playing."""
    conn = get_db()
    conn.execute("UPDATE game_sessions SET lobby_status = 'playing' WHERE id = ?", (code,))
    conn.commit()
    conn.close()


def build_lobby_page(code):
    """Lobby screen — host enters name, picks team, waits for players."""
    session = get_session(code)
    if not session:
        return html_page("Game Not Found", "<div style='padding:40px;text-align:center;color:#fff;'>Game not found</div>")

    if session.get("lobby_status") == "playing":
        # Game already started — redirect to host
        return build_host_page(code)

    players = get_players(code)
    team1_players = [p for p in players if p["team"] == 1]
    team2_players = [p for p in players if p["team"] == 2]
    has_host = any(p["is_host"] for p in players)
    host_player = next((p for p in players if p["is_host"]), None)
    host_team = host_player["team"] if host_player else 1
    game_name = session.get("game_name") or "Song Burst Game"
    join_url = f"/song-burst/session/{code}/join"

    def player_list_html(team_players):
        if not team_players:
            return '<div style="color:#aaa;font-style:italic;padding:8px 0;">No players yet</div>'
        html = ""
        for p in team_players:
            star = " ★" if p["is_host"] else ""
            html += f'<div style="padding:4px 0;font-size:15px;">{h(p["name"])}{star}</div>'
        return html

    css = _game_css() + """
    .lobby-box { background: #fff; border-radius: 16px; padding: 24px 20px; margin: 16px;
                 box-shadow: 0 2px 12px rgba(0,0,0,0.1); text-align: center; color: #1c1c1e; }
    .lobby-code { font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #2a9d8f; margin: 8px 0; }
    .lobby-name { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .lobby-copy { display: inline-block; padding: 14px 24px; background: #2a9d8f; color: #fff;
                  border: none; border-radius: 10px; font-size: 15px; font-weight: 600;
                  font-family: inherit; cursor: pointer; }
    .lobby-copy:active {{ opacity: 0.8; }}
    .lobby-teams { display: flex; gap: 16px; margin: 20px 0; text-align: left; }
    .lobby-team { flex: 1; background: #f8f8f8; border-radius: 12px; padding: 16px;
                  min-height: 100px; }
    .lobby-team h3 { font-size: 14px; font-weight: 700; text-transform: uppercase;
                     letter-spacing: 0.5px; margin-bottom: 8px; }
    .lobby-team-1 h3 { color: #5cb8ff; }
    .lobby-team-2 h3 { color: #e0544e; }
    .lobby-join-form { margin-top: 16px; }
    .lobby-input { padding: 10px 14px; border: 2px solid #ddd; border-radius: 10px;
                   font-size: 15px; font-family: inherit; width: 200px; text-align: center; }
    .lobby-input:focus { border-color: #2a9d8f; outline: none; }
    .lobby-team-btns { display: flex; gap: 10px; justify-content: center; margin-top: 12px; }
    .lobby-team-btn { padding: 10px 20px; border-radius: 10px; border: 2px solid #ddd;
                      background: #fff; font-size: 15px; font-weight: 600; font-family: inherit;
                      cursor: pointer; }
    .lobby-team-btn:active { opacity: 0.8; }
    .lobby-btn-1 { border-color: #5cb8ff; color: #5cb8ff; }
    .lobby-btn-2 { border-color: #e0544e; color: #e0544e; }
    .lobby-start { display: block; width: 100%; padding: 16px; border-radius: 14px; border: none;
                   background: #2a9d8f; color: #fff; font-size: 18px; font-weight: 700;
                   font-family: inherit; cursor: pointer; margin-top: 16px; }
    .lobby-start:disabled { opacity: 0.4; cursor: default; }
    .lobby-waiting { color: #888; font-style: italic; padding: 12px 0; }
    .sb-loadout-badge { display: inline-block; padding: 3px 10px; border-radius: 12px;
                        font-size: 11px; font-weight: 600; margin: 1px 2px; }
    .sb-badge-decade { background: #2a9d8f; color: #fff; }
    .sb-badge-genre { background: #e0544e; color: #fff; }
    .lobby-cancel { background: repeating-linear-gradient(135deg, #e0544e, #e0544e 6px, #c4403a 6px, #c4403a 12px);
                    color: #fff; border: none; border-radius: 8px; padding: 6px 14px;
                    font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; }
    .lobby-cancel:active { opacity: 0.8; }
    .lobby-cancel-confirm { display: none; align-items: center; gap: 8px; font-size: 14px; font-weight: 600;
                            justify-content: flex-end; }
    .lobby-cancel-confirm.visible { display: flex; }
    """

    # If host hasn't joined yet, show name + team picker
    if not has_host:
        body = f"""
        <div class="lobby-box">
            <div class="lobby-name">{h(game_name)}</div>
            <div class="lobby-code">{code}</div>
            <div style="font-size:12px;color:#888;margin-bottom:4px;">{format_loadout(session)}</div>
            <div style="text-align:center;margin:12px 0;">
                <button class="lobby-copy" onclick="copyLink()">📋 Copy Join Link</button>
            </div>
            <div class="lobby-join-form">
                <div style="font-weight:600;margin-bottom:8px;">Enter your name:</div>
                <input class="lobby-input" id="hostName" placeholder="Your name" autofocus>
                <div style="font-weight:600;margin:12px 0 8px;">Pick your team:</div>
                <div class="lobby-team-btns">
                    <button class="lobby-team-btn lobby-btn-1" onclick="joinAsHost(1)">{h(session['team1_name'])}</button>
                    <button class="lobby-team-btn lobby-btn-2" onclick="joinAsHost(2)">{h(session['team2_name'])}</button>
                </div>
            </div>
            <div style="text-align:right;margin-top:16px;">
                <button class="lobby-cancel" id="cancelBtn" onclick="showCancelConfirm()">Cancel Game</button>
                <div class="lobby-cancel-confirm" id="cancelConfirm">
                    <span>Cancel?</span>
                    <a href="/song-burst" style="background:#c4403a;color:#fff;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">Yes</a>
                    <button onclick="hideCancelConfirm()" style="background:#888;color:#fff;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;border:none;cursor:pointer;">No</button>
                </div>
            </div>
        </div>
        """
        js = f"""
        function showCancelConfirm() {{
            document.getElementById('cancelConfirm').classList.add('visible');
            document.getElementById('cancelBtn').style.display = 'none';
        }}
        function hideCancelConfirm() {{
            document.getElementById('cancelConfirm').classList.remove('visible');
            document.getElementById('cancelBtn').style.display = '';
        }}
        function copyLink() {{
            navigator.clipboard.writeText(window.location.origin + '{join_url}');
            document.querySelector('.lobby-copy').textContent = 'Copied!';
            setTimeout(function() {{ document.querySelector('.lobby-copy').textContent = '📋 Copy Join Link'; }}, 2000);
        }}
        function joinAsHost(team) {{
            var name = document.getElementById('hostName').value.trim();
            if (!name) {{ document.getElementById('hostName').focus(); return; }}
            fetch('{join_url}', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({{name: name, team: team, is_host: true}})
            }}).then(function() {{
                localStorage.setItem('sb_active_session', JSON.stringify({{code: '{code}', team: team, creator: true}}));
                window.location.reload();
            }});
        }}
        """
    else:
        # Host has joined — show lobby with player list
        can_start = len(team1_players) > 0 and len(team2_players) > 0
        body = f"""
        <div class="lobby-box">
            <div class="lobby-name">{h(game_name)}</div>
            <div class="lobby-code">{code}</div>
            <div style="font-size:12px;color:#888;margin-bottom:4px;">{format_loadout(session)}</div>
            <div style="text-align:center;margin:12px 0;">
                <button class="lobby-copy" onclick="copyLink()">📋 Copy Join Link</button>
            </div>
            <div class="lobby-teams">
                <div class="lobby-team lobby-team-1">
                    <h3>{h(session['team1_name'])}</h3>
                    {player_list_html(team1_players)}
                </div>
                <div class="lobby-team lobby-team-2">
                    <h3>{h(session['team2_name'])}</h3>
                    {player_list_html(team2_players)}
                </div>
            </div>
            <button class="lobby-start" id="startBtn" {"" if can_start else "disabled"}
                    onclick="startGame()">Start Game</button>
            {"" if can_start else '<div class="lobby-waiting">Waiting for players on both teams...</div>'}
            <div style="text-align:right;margin-top:16px;">
                <button class="lobby-cancel" id="cancelBtn" onclick="showCancelConfirm()">Cancel Game</button>
                <div class="lobby-cancel-confirm" id="cancelConfirm">
                    <span>Cancel?</span>
                    <a href="/song-burst" style="background:#c4403a;color:#fff;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">Yes</a>
                    <button onclick="hideCancelConfirm()" style="background:#888;color:#fff;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600;border:none;cursor:pointer;">No</button>
                </div>
            </div>
        </div>
        """
        js = f"""
        function showCancelConfirm() {{
            document.getElementById('cancelConfirm').classList.add('visible');
            document.getElementById('cancelBtn').style.display = 'none';
        }}
        function hideCancelConfirm() {{
            document.getElementById('cancelConfirm').classList.remove('visible');
            document.getElementById('cancelBtn').style.display = '';
        }}
        function copyLink() {{
            navigator.clipboard.writeText(window.location.origin + '{join_url}');
            document.querySelector('.lobby-copy').textContent = 'Copied!';
            setTimeout(function() {{ document.querySelector('.lobby-copy').textContent = '📋 Copy Join Link'; }}, 2000);
        }}
        function startGame() {{
            fetch('/song-burst/session/{code}/start', {{method: 'POST'}})
            .then(function() {{ window.location.href = '/song-burst/session/{code}/play?team={host_team}&creator=1'; }});
        }}
        // Poll for new players
        setInterval(function() {{
            fetch('/song-burst/session/{code}/players')
            .then(function(r) {{ return r.json(); }})
            .then(function(players) {{
                if (players.length !== {len(players)}) window.location.reload();
            }});
        }}, 2000);
        """

    return html_page("Lobby — " + game_name, body, extra_css=css, extra_js=js)


def build_join_page(code=None):
    """Join a game session — enter code and pick team."""
    css = """
    body { background: linear-gradient(170deg, #2a9d8f 0%, #248f82 40%, #1e7b70 70%, #16655b 100%);
           min-height: 100vh; color: #1c1c1e; overscroll-behavior: none; }
    .ptr-indicator { display: none !important; }
    .navbar { display: flex; align-items: center; padding: 56px 16px 12px;
              background: transparent; border-bottom: 0.5px solid rgba(255,255,255,0.25); }
    .navbar a { color: #fff; text-decoration: none; font-size: 17px; }
    .join-box { background: #fff; border-radius: 16px; padding: 30px 20px; margin: 40px 16px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.1); text-align: center; }
    .join-box h2 { font-size: 24px; font-weight: 800; margin-bottom: 20px; }
    .join-input { padding: 14px 20px; border: 2px solid #ddd; border-radius: 12px;
                  font-size: 24px; font-weight: 700; text-align: center; width: 160px;
                  text-transform: uppercase; font-family: inherit; letter-spacing: 4px; }
    .join-input:focus { border-color: #2a9d8f; outline: none; }
    .join-btn { display: block; margin: 20px auto 0; padding: 14px 40px; border-radius: 12px;
                border: none; background: #2a9d8f; color: #fff; font-size: 16px;
                font-weight: 600; font-family: inherit; cursor: pointer; }
    .team-pick { margin-top: 20px; }
    .team-pick h3 { font-size: 16px; margin-bottom: 12px; color: #666; }
    .team-btns { display: flex; gap: 12px; justify-content: center; }
    .team-btn { padding: 16px 24px; border-radius: 12px; border: 2px solid #ddd;
                background: #fff; font-size: 16px; font-weight: 600; font-family: inherit;
                cursor: pointer; text-decoration: none; color: #1c1c1e; }
    .team-btn:active { background: #f0f0f0; }
    .team-btn-1 { border-color: #5cb8ff; color: #5cb8ff; }
    .team-btn-2 { border-color: #e0544e; color: #e0544e; }
    """

    if code:
        session = get_session(code)
        if not session:
            body = """<div class="navbar"><a href="/song-burst">&#8249; Back</a></div>
            <div class="join-box"><h2>Game not found</h2><p>Check the code and try again.</p></div>"""
            return html_page("Join Game", body, extra_css=css)

        players = get_players(code)
        team1_p = [p for p in players if p["team"] == 1]
        team2_p = [p for p in players if p["team"] == 2]
        game_name = session.get("game_name") or "Song Burst Game"

        def plist(team_players):
            if not team_players:
                return '<div style="color:#aaa;font-size:13px;font-style:italic;">empty</div>'
            return "".join(f'<div style="font-size:14px;padding:2px 0;">{h(p["name"])}{"  ★" if p["is_host"] else ""}</div>' for p in team_players)

        body = f"""
        <div class="navbar"><a href="/song-burst">&#8249; Back</a></div>
        <div class="join-box">
            <h2>{h(game_name)}</h2>
            <div style="margin-bottom:16px;">
                <div style="font-weight:600;margin-bottom:8px;">Your name:</div>
                <input class="join-input" id="playerName" placeholder="Enter your name" style="width:100%;max-width:250px;font-size:16px;letter-spacing:0;" autofocus>
            </div>
            <div style="font-weight:600;margin-bottom:8px;">Pick a team:</div>
            <div class="team-btns">
                <div style="flex:1;text-align:center;">
                    <button class="team-btn team-btn-1" onclick="joinTeam(1)" style="width:100%;">{h(session['team1_name'])}</button>
                    <div style="margin-top:8px;">{plist(team1_p)}</div>
                </div>
                <div style="flex:1;text-align:center;">
                    <button class="team-btn team-btn-2" onclick="joinTeam(2)" style="width:100%;">{h(session['team2_name'])}</button>
                    <div style="margin-top:8px;">{plist(team2_p)}</div>
                </div>
            </div>
        </div>"""

        js = f"""
        function joinTeam(team) {{
            var name = document.getElementById('playerName').value.trim();
            if (!name) {{ document.getElementById('playerName').focus(); return; }}
            fetch('/song-burst/session/{code}/join', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({{name: name, team: team}})
            }}).then(function() {{
                localStorage.setItem('sb_active_session', JSON.stringify({{code: '{code}', team: team, creator: false}}));
                window.location.href = '/song-burst/session/{code}/waiting?team=' + team;
            }});
        }}
        """
        return html_page("Join — " + game_name, body, extra_css=css, extra_js=js)
    else:
        body = """
        <div class="navbar"><a href="/song-burst">&#8249; Back</a></div>
        <div class="join-box">
            <h2>Join a Game</h2>
            <form action="/song-burst/join" method="GET">
                <input class="join-input" name="code" placeholder="CODE" maxlength="4" autocomplete="off" autofocus>
                <button class="join-btn" type="submit">Join</button>
            </form>
        </div>"""

    return html_page("Join Game", body, extra_css=css)


def build_waiting_page(code, team):
    """Waiting screen after joining — polls until game starts."""
    session = get_session(code)
    if not session:
        return html_page("Error", "<div style='padding:40px;text-align:center;color:#fff;'>Game not found</div>")

    if session.get("lobby_status") == "playing":
        return build_play_page(code, team)

    players = get_players(code)
    team1_p = [p for p in players if p["team"] == 1]
    team2_p = [p for p in players if p["team"] == 2]
    game_name = session.get("game_name") or "Song Burst Game"
    team_name = session[f"team{team}_name"]

    def plist(tp):
        return "".join(f'<div style="padding:3px 0;font-size:15px;">{h(p["name"])}{"  ★" if p["is_host"] else ""}</div>' for p in tp) or '<div style="color:#aaa;">—</div>'

    css = _game_css() + """
    .wait-box { background: #fff; border-radius: 16px; padding: 24px 20px; margin: 40px 16px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.1); color: #1c1c1e; }
    .wait-title { font-size: 20px; font-weight: 700; text-align: center; }
    .wait-team { font-size: 16px; color: #2a9d8f; font-weight: 600; text-align: center; margin: 8px 0 16px; }
    .wait-teams { display: flex; gap: 16px; }
    .wait-col { flex: 1; background: #f8f8f8; border-radius: 10px; padding: 12px; }
    .wait-col h4 { font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
    .wait-status { text-align: center; padding: 16px; color: rgba(255,255,255,0.6);
                   font-style: italic; font-size: 14px; }
    """

    body = f"""
    <div class="wait-box">
        <div class="wait-title">{h(game_name)}</div>
        <div class="wait-team">You're on: {h(team_name)}</div>
        <div class="wait-teams">
            <div class="wait-col"><h4 style="color:#5cb8ff;">{h(session['team1_name'])}</h4>{plist(team1_p)}</div>
            <div class="wait-col"><h4 style="color:#e0544e;">{h(session['team2_name'])}</h4>{plist(team2_p)}</div>
        </div>
    </div>
    <div class="wait-status">Waiting for host to start the game...</div>
    """

    js = f"""
    setInterval(function() {{
        fetch('/song-burst/session/{code}/state')
        .then(function(r) {{ return r.json(); }})
        .then(function(s) {{
            if (s.lobby_status === 'playing') {{
                window.location.href = '/song-burst/session/{code}/play?team={team}';
            }}
        }});
    }}, 2000);
    """

    return html_page("Waiting — " + game_name, body, extra_css=css, extra_js=js)


def build_play_page(code, team, is_creator=False):
    """Unified play page — shows host or guess view based on whose turn it is."""
    session = get_session(code)
    if not session or session["status"] == "ended":
        return build_game_over_page(session or {"id": code})

    host_team = session["current_host_team"]
    if team == host_team:
        return _build_host_view(code, session, team, is_creator)
    else:
        return _build_guess_view(code, session, team)


def _build_host_view(code, session, team, is_creator=False):
    """Host view — sees all clues + answer, controls the game."""

    card = get_current_card(session)
    if not card:
        return build_game_over_page(session)

    diff = card["difficulty"]
    scoring = SCORING[diff]
    level = session["current_clue_level"]
    points_now = scoring[level]
    host_team = session["current_host_team"]
    guess_team = 2 if host_team == 1 else 1
    host_name = session[f"team{host_team}_name"]
    guess_name = session[f"team{guess_team}_name"]

    album_art = card.get("album_art_url")
    art_html = f'<img class="sb-card-art" src="{h(album_art)}" alt="">' if album_art else '<div class="sb-card-art-placeholder">&#9835;</div>'
    album_html = f'<div class="sb-album">{h(card["album"])}</div>' if card.get("album") else ""

    round_num = (session['card_index'] // 2) + 1
    card_progress = f"Round {round_num}"
    if session["card_limit"] > 0:
        card_progress += f" of {session['card_limit']}"

    # End Game button — only for game creator
    if is_creator:
        end_game_html = """<button class="sb-host-btn sb-end-game-session" id="endBtn"
                onclick="toggleEndConfirm()">End Game</button>
        <div class="sb-end-confirm-session" id="endConfirm">
            <span>End game?</span>
            <button class="sb-host-btn" style="background:#c4403a;padding:6px 12px;font-size:13px;"
                    onclick="sessionAction('end')">Yes</button>
            <button class="sb-host-btn" style="background:#888;padding:6px 12px;font-size:13px;"
                    onclick="toggleEndConfirm()">No</button>
        </div>"""
    else:
        end_game_html = ""

    if is_creator:
        uhoh_html = '<button class="sb-host-btn" style="background:#e0544e;font-size:13px;padding:8px 14px;" onclick="toggleUhOh()">Uh Oh</button>'
        uhoh_menu_html = '''<div class="sb-uhoh-menu" id="uhohMenu" style="display:none;margin:0 20px 12px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.25);">
        <button style="display:block;width:100%;padding:12px 16px;border:none;background:#fff;color:#1c1c1e;font-size:15px;font-family:inherit;cursor:pointer;text-align:left;border-bottom:0.5px solid #eee;"
                onclick="reportCard('bad_album')">Bad album</button>
        <button style="display:block;width:100%;padding:12px 16px;border:none;background:#fff;color:#1c1c1e;font-size:15px;font-family:inherit;cursor:pointer;text-align:left;"
                onclick="reportCard('remake_card')">Remake card</button>
    </div>'''
    else:
        uhoh_html = ""
        uhoh_menu_html = ""

    # Build clue rows with point values, highlight current level
    clue_rows = ""
    for clue_level, clue_key in [(3, "clue_3"), (2, "clue_2"), (1, "clue_1")]:
        pts = scoring[clue_level]
        active = " sb-clue-active" if clue_level == level else ""
        clue_rows += f"""
        <div class="sb-clue visible{active}">
            <span class="sb-clue-num">{pts}</span>
            <span class="sb-clue-text">{h(card[clue_key])}</span>
        </div>"""

    css = _game_css() + """
    .sb-clue-active { background: rgba(42,157,143,0.1); border-radius: 8px; padding: 8px !important; }
    .sb-clue-active .sb-clue-num { background: #2a9d8f; }
    .sb-host-controls { display: flex; gap: 12px; padding: 12px 20px 12px; justify-content: center;
                        flex-wrap: wrap; }
    .sb-host-secondary { display: flex; justify-content: space-between; align-items: center;
                         padding: 0 20px 12px; }
    .sb-end-game-session { background: repeating-linear-gradient(135deg, #e0544e, #e0544e 6px, #c4403a 6px, #c4403a 12px) !important;
                           font-size: 13px !important; padding: 8px 14px !important; }
    .sb-end-confirm-session { display: none; align-items: center; gap: 8px; }
    .sb-end-confirm-session.visible { display: flex; }
    .sb-host-btn { padding: 12px 24px; border-radius: 12px; border: none; font-size: 15px;
                   font-weight: 600; font-family: inherit; cursor: pointer; color: #fff; }
    .sb-host-btn:active { opacity: 0.8; }
    .sb-btn-advance { background: #2a9d8f; }
    .sb-btn-accept { background: #5cb8ff; }
    .sb-btn-skip { background: #888; }
    """

    body = f"""
    <div class="sb-scorebar">
        <span class="sb-team sb-team-1">{h(session['team1_name'])}: {session['team1_score']}</span>
        <span class="sb-team sb-team-2">{h(session['team2_name'])}: {session['team2_score']}</span>
    </div>
    <div class="sb-role-bar">You are hosting for {h(guess_name)} · {card_progress}
        <div style="font-size:13px;opacity:0.8;margin-top:2px;">{format_loadout(session)}</div>
    </div>
    <div class="sb-card sb-card-{diff}">
      <div class="sb-card-inner">
        <div class="sb-card-top">
            {art_html}
            <div class="sb-card-meta">
                <div class="sb-card-song">{h(card['title'])}</div>
                <div class="sb-card-artist">{h(card['artist'])} &middot; {card['year']}</div>
                {album_html}
                <span class="sb-diff-word sb-diff-word-{diff}">{diff}</span>
                <span class="sb-card-id">#{card['id']}</span>
            </div>
        </div>
        <div class="sb-clues">{clue_rows}</div>
        <div class="sb-answer sb-answer-{diff}" style="display:block;">
            &ldquo;{h(card['answer'])}&rdquo;
        </div>
      </div>
    </div>
    <div class="sb-host-controls">
        {"" if level <= 1 else '<button class="sb-host-btn sb-btn-advance" onclick="sessionAction(' + chr(39) + 'advance' + chr(39) + ')">Next Clue</button>'}
        <button class="sb-host-btn sb-btn-accept" onclick="sessionAction('accept')">Accept ({points_now} pts)</button>
        <button class="sb-host-btn" style="background:#888;" onclick="sessionAction('miss')">Missed (0 pts)</button>
    </div>
    <div class="sb-host-secondary">
        {end_game_html}
            {uhoh_html}
        <button class="sb-host-btn" style="background:rgba(255,255,255,0.2);color:#fff;font-size:13px;padding:8px 14px;"
                onclick="sessionAction('skip')">Pick a New Card</button>
    </div>
    {uhoh_menu_html}
    """

    js = f"""
    function toggleEndConfirm() {{
        document.getElementById('endConfirm').classList.toggle('visible');
        document.getElementById('endBtn').style.display =
            document.getElementById('endConfirm').classList.contains('visible') ? 'none' : '';
    }}
    function toggleUhOh() {{
        var menu = document.getElementById('uhohMenu');
        if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }}
    function reportCard(action) {{
        fetch('/song-burst/report', {{
            method: 'POST',
            headers: {{'Content-Type': 'application/json'}},
            body: JSON.stringify({{card_id: {card['id']}, song_id: 0, action: action}})
        }}).then(function() {{
            var menu = document.getElementById('uhohMenu');
            if (menu) menu.style.display = 'none';
        }});
    }}
    function sessionAction(action) {{
        fetch('/song-burst/session/{code}/' + action, {{method: 'POST'}})
        .then(function(r) {{ return r.json(); }})
        .then(function(d) {{
            if (action === 'end' || d.ended) {{
                window.location.href = '/song-burst/session/{code}/play?team={team}&creator={"1" if is_creator else "0"}';
            }} else {{
                window.location.reload();
            }}
        }});
    }}
    // Poll for changes (other host team members, or turn swap)
    var lastLevel = {level};
    var lastCard = {card['id']};
    var lastHost = {session['current_host_team']};
    setInterval(function() {{
        fetch('/song-burst/session/{code}/state')
        .then(function(r) {{ return r.json(); }})
        .then(function(s) {{
            if (s.status === 'ended' || s.card_id !== lastCard || s.clue_level !== lastLevel || s.host_team !== lastHost) {{
                window.location.reload();
            }}
        }});
    }}, 1500);
    """

    return html_page("Host — Song Burst", body, extra_css=css, extra_js=js)


def _build_guess_view(code, session, team):
    """Guesser view — sees only current clue, polls for updates."""

    card = get_current_card(session)
    if not card:
        return build_game_over_page(session)

    diff = card["difficulty"]
    scoring_map = SCORING[diff]
    level = session["current_clue_level"]
    points_now = scoring_map[level]

    # Show only the clues revealed so far
    clue_key = f"clue_{level}" if level == 3 else f"clue_{level}"
    # Actually show all clues from level 3 down to current level
    clue_rows = ""
    for clue_level in range(3, level - 1, -1):
        pts = scoring_map[clue_level]
        clue_rows += f"""
        <div class="sb-clue visible">
            <span class="sb-clue-num">{pts}</span>
            <span class="sb-clue-text">{h(card[f'clue_{clue_level}'])}</span>
        </div>"""

    album_art = card.get("album_art_url")
    art_html = f'<img class="sb-card-art" src="{h(album_art)}" alt="">' if album_art else '<div class="sb-card-art-placeholder">&#9835;</div>'
    album_html = f'<div class="sb-album">{h(card["album"])}</div>' if card.get("album") else ""

    team_name = session[f"team{team}_name"]

    css = _game_css() + """
    .sb-waiting { text-align: center; padding: 16px; color: rgba(255,255,255,0.6);
                  font-style: italic; font-size: 14px; }
    """

    body = f"""
    <div class="sb-scorebar">
        <span class="sb-team sb-team-1">{h(session['team1_name'])}: {session['team1_score']}</span>
        <span class="sb-team sb-team-2">{h(session['team2_name'])}: {session['team2_score']}</span>
    </div>
    <div class="sb-role-bar">{h(team_name)} guessing · Worth {points_now} pts
        <div style="font-size:13px;opacity:0.8;margin-top:2px;">{format_loadout(session)}</div>
    </div>
    <div class="sb-card sb-card-{diff}">
      <div class="sb-card-inner">
        <div class="sb-card-top">
            {art_html}
            <div class="sb-card-meta">
                <div class="sb-card-song">{h(card['title'])}</div>
                <div class="sb-card-artist">{h(card['artist'])} &middot; {card['year']}</div>
                {album_html}
                <span class="sb-diff-word sb-diff-word-{diff}">{diff}</span>
            </div>
        </div>
        <div class="sb-clues" id="clues">{clue_rows}</div>
      </div>
    </div>
    <div class="sb-waiting" id="waiting">Waiting for host...</div>
    """

    js = f"""
    var lastLevel = {level};
    var lastCard = {card['id']};
    setInterval(function() {{
        fetch('/song-burst/session/{code}/state')
        .then(function(r) {{ return r.json(); }})
        .then(function(s) {{
            if (s.status === 'ended' || s.card_id !== lastCard || s.clue_level !== lastLevel) {{
                window.location.reload();
            }}
        }});
    }}, 1500);
    """

    return html_page("Guess — Song Burst", body, extra_css=css, extra_js=js)


def build_game_over_page(session):
    """Game over screen with final scores."""
    css = _game_css() + """
    .gameover { text-align: center; padding: 60px 20px; }
    .gameover h1 { font-size: 32px; font-weight: 800; color: #fff; }
    .gameover .final-scores { margin: 30px 0; }
    .gameover .score-team { font-size: 24px; font-weight: 700; color: #fff; margin: 12px 0; }
    .gameover .winner { color: #f0a500; font-size: 28px; }
    .gameover a { color: #fff; text-decoration: none; background: rgba(255,255,255,0.2);
                  padding: 12px 28px; border-radius: 12px; font-weight: 600; display: inline-block;
                  margin-top: 20px; }
    """

    t1 = session.get("team1_score", 0)
    t2 = session.get("team2_score", 0)
    t1n = session.get("team1_name", "Team 1")
    t2n = session.get("team2_name", "Team 2")

    if t1 > t2:
        winner = f"{t1n} wins!"
    elif t2 > t1:
        winner = f"{t2n} wins!"
    else:
        winner = "It's a tie!"

    body = f"""
    <div class="gameover">
        <h1>Game Over!</h1>
        <div class="final-scores">
            <div class="score-team">{h(t1n)}: {t1}</div>
            <div class="score-team">{h(t2n)}: {t2}</div>
        </div>
        <div class="winner">{winner}</div>
        <a href="/song-burst">New Game</a>
    </div>
    """
    return html_page("Game Over", body, extra_css=css)


def _game_css():
    """Shared CSS for host/guesser/gameover pages."""
    return """
    body { background: linear-gradient(170deg, #2a9d8f 0%, #248f82 40%, #1e7b70 70%, #16655b 100%);
           min-height: 100vh; color: #1c1c1e; overscroll-behavior: none; }
    .ptr-indicator { display: none !important; }
    .sb-loadout-badge { display: inline-block; padding: 3px 10px; border-radius: 12px;
                        font-size: 11px; font-weight: 600; margin: 1px 2px; }
    .sb-badge-decade { background: #5cb8ff; color: #fff; }
    .sb-badge-genre { background: #f0a500; color: #fff; }
    .sb-scorebar { display: flex; justify-content: space-between; padding: 56px 16px 8px;
                   background: transparent; gap: 12px; }
    .sb-team { font-size: 18px; font-weight: 800; padding: 12px 16px; border-radius: 10px;
               flex: 1; text-align: center; }
    .sb-team-1 { background: #5cb8ff; color: #fff; }
    .sb-team-2 { background: #e0544e; color: #fff; }
    .sb-role-bar { text-align: center; padding: 4px 16px 12px; font-size: 14px;
                   color: rgba(255,255,255,0.7); }
    .sb-card { margin: 0 16px; border-radius: 16px; overflow: hidden; padding: 10px; }
    .sb-card-easy { background: #5cb8ff; }
    .sb-card-medium { background: #f0a500; }
    .sb-card-hard { background: #e0544e; }
    .sb-card-inner { background: #fff; border-radius: 10px; overflow: hidden; }
    .sb-card-top { display: flex; padding: 16px 20px 12px; gap: 14px; align-items: flex-start; }
    .sb-card-art { width: 80px; height: 80px; border-radius: 6px; object-fit: cover;
                   flex-shrink: 0; box-shadow: 0 2px 12px rgba(0,0,0,0.4); }
    .sb-card-art-placeholder { width: 80px; height: 80px; border-radius: 6px; flex-shrink: 0;
                               background: #f0f0f0; display: flex; align-items: center;
                               justify-content: center; font-size: 28px; color: #ccc; }
    .sb-card-meta { flex: 1; min-width: 0; }
    .sb-card-song { font-size: 18px; font-weight: 800; color: #1c1c1e; letter-spacing: -0.3px; line-height: 1.2; }
    .sb-card-artist { font-size: 15px; font-weight: 600; color: #444; }
    .sb-album { font-size: 13px; font-weight: 500; color: #888; font-style: italic; }
    .sb-diff-word { font-size: 10px; font-weight: 800; text-transform: uppercase;
                    letter-spacing: 1.5px; padding: 2px 10px; border-radius: 4px;
                    display: inline-block; margin-top: 6px; }
    .sb-diff-word-easy { background: #5cb8ff; color: #fff; }
    .sb-diff-word-medium { background: #f0a500; color: #fff; }
    .sb-diff-word-hard { background: #e0544e; color: #fff; }
    .sb-card-id { font-size: 11px; color: #aaa; margin-left: 6px; }
    .sb-clues { padding: 4px 20px 12px; }
    .sb-clue { padding: 7px 0; font-size: 17px; line-height: 1.5; display: none; color: #1c1c1e; }
    .sb-clue.visible { display: flex; align-items: flex-start; gap: 10px; }
    .sb-clue-num { flex-shrink: 0; display: inline-flex; width: 30px; height: 30px;
                   align-items: center; justify-content: center; border-radius: 50%;
                   background: #1c1c1e; color: #fff; font-size: 15px; font-weight: 800; }
    .sb-clue-text { flex: 1; padding-top: 4px; }
    .sb-answer { padding: 16px 20px; font-size: 18px; font-weight: 700; font-style: italic;
                 text-align: center; line-height: 1.4; }
    .sb-answer-easy { background: #5cb8ff; color: #fff; }
    .sb-answer-medium { background: #f0a500; color: #fff; }
    .sb-answer-hard { background: #e0544e; color: #fff; }
    """
