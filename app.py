"""ChartBurst — music lyric trivia game. Casdra Software."""

import os
import sqlite3
from flask import Flask, render_template, request, jsonify
from urllib.parse import quote as url_quote

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chartburst.db")

GENRES = ["pop", "newwave", "prog", "metal", "alt", "grunge", "hiphop"]
GENRE_LABELS = {
    "pop": "Pop", "newwave": "New Wave", "prog": "Prog Rock",
    "metal": "Metal", "alt": "Alt Rock", "grunge": "Grunge", "hiphop": "Hip Hop",
}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def build_where(decades=None, genres=None, difficulty=None, conn=None):
    """Build WHERE clause from filter params. Returns (where_str, params_list)."""
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
            selected = set(genre_list) & set(GENRES)
            if selected and selected != set(GENRES):
                gc = []
                if "pop" in selected:
                    gc.append("(s.genre_tags IS NULL OR s.genre_tags = '' OR s.genre_tags = 'pop')")
                for g in GENRES[1:]:
                    if g in selected:
                        gc.append(f"s.genre_tags = '{g}'")
                if gc:
                    clauses.append("(" + " OR ".join(gc) + ")")

    where = " AND ".join(clauses) if clauses else "1=1"
    return where, params


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    return render_template("home.html")


@app.route("/chartburst")
def categories():
    return render_template("chartburst/categories.html", genres=GENRES, genre_labels=GENRE_LABELS)


@app.route("/chartburst/count")
def card_count():
    conn = get_db()
    where, params = build_where(
        decades=request.args.get("decades"),
        genres=request.args.get("genres"),
        conn=conn,
    )
    cards = conn.execute(
        f"SELECT COUNT(*) FROM song_burst_cards c JOIN song_burst_songs s ON c.song_id = s.id WHERE {where}",
        params,
    ).fetchone()[0]
    conn.close()
    return jsonify({"cards": cards})


@app.route("/chartburst/play")
def play():
    conn = get_db()
    decades = request.args.get("decades")
    genres = request.args.get("genres")
    difficulty = request.args.get("difficulty")

    where, params = build_where(decades=decades, genres=genres, difficulty=difficulty, conn=conn)

    # Check optional columns
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
        conn.close()
        return render_template("chartburst/play.html", card=None,
                               decades=decades, genres=genres, difficulty=difficulty)

    card_id, song_id = row[0], row[1]
    diff = row[2]
    c3, c2, c1, answer = row[4], row[5], row[6], row[7]
    title, artist, year, album = row[8], row[9], row[10], row[11]
    peak, weeks = row[12], row[13]

    extra = {name: row[14 + i] for i, name in enumerate(extra_col_names)}
    weeks_40 = extra.get("weeks_top_40")
    album_art_url = extra.get("album_art_url")
    apple_track_id = extra.get("apple_track_id")

    chart_parts = []
    if peak:
        chart_parts.append(f"Peaked at #{peak}")
    if weeks_40:
        chart_parts.append(f"{weeks_40} weeks on Top 40")
    elif weeks:
        chart_parts.append(f"{weeks} weeks on Hot 100")

    if apple_track_id:
        play_url = f"https://song.link/i/{apple_track_id}"
    else:
        play_url = f"https://song.link/s/{url_quote(artist + ' ' + title)}"

    genius_url = f"https://genius.com/search?q={url_quote(artist + ' ' + title)}"

    # Build nav label
    label_parts = []
    if decades:
        label_parts.append(", ".join(d + "s" for d in decades.split(",")))
    if genres:
        label_parts.append(", ".join(GENRE_LABELS.get(g, g.title()) for g in genres.split(",")))
    cat_label = " · ".join(label_parts) if label_parts else "ChartBurst"

    conn.close()

    return render_template("chartburst/play.html",
        card=True, card_id=card_id, song_id=song_id,
        diff=diff, c3=c3, c2=c2, c1=c1, answer=answer,
        title=title, artist=artist, year=year, album=album,
        album_art_url=album_art_url, chart_info=" · ".join(chart_parts),
        play_url=play_url, genius_url=genius_url, cat_label=cat_label,
        decades=decades, genres=genres, difficulty=difficulty,
    )


@app.route("/chartburst/report", methods=["POST"])
def report():
    data = request.get_json() or {}
    card_id = data.get("card_id")
    song_id = data.get("song_id")
    action = data.get("action", "")

    if card_id and action in ("bad_album", "remake_card"):
        conn = get_db()
        if action == "bad_album":
            conn.execute("UPDATE song_burst_songs SET album = NULL, album_art_url = NULL WHERE id = ?",
                         (int(song_id),))
        elif action == "remake_card":
            conn.execute("DELETE FROM song_burst_cards WHERE id = ?", (int(card_id),))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    return jsonify({"ok": False, "error": "Invalid report"}), 400


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
