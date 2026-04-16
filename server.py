import argparse
import json
import os
import random
import re
import signal
import sqlite3
import string
import struct
import time
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote as url_quote, urlencode, urlparse, parse_qsl

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "casdra.db")

# Web mode: public-facing, hides internal apps, renames Song Burst → ChartBurst
WEB_MODE = bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("WEB_MODE"))
ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "casdra-admin-local")

def _check_admin(handler):
    """Check if request has valid admin secret. Returns True if authorized."""
    from urllib.parse import parse_qs, urlparse
    qs = parse_qs(urlparse(handler.path).query)
    token = qs.get("token", [None])[0]
    if not token:
        token = handler.headers.get("X-Admin-Token")
    return token == ADMIN_SECRET

# Import page modules (initialized after helpers are defined — see bottom of helpers section)
import pages.song_burst as _song_burst
import pages.song_burst_session as _session
import pages.dice_roller as _dice_roller


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def slugify(name):
    """Convert a restaurant name to a URL-safe slug. e.g. "Roy's" -> "roys" """
    s = name.lower()
    s = re.sub(r"[^\w\s-]", "", s)   # strip punctuation except hyphens
    s = re.sub(r"[\s_]+", "-", s)    # spaces/underscores -> hyphens
    s = re.sub(r"-+", "-", s)        # collapse multiple hyphens
    s = s.strip("-")
    return s or "restaurant"


def unique_slug(conn, name, exclude_id=None):
    """Generate a slug that doesn't already exist in the restaurants table."""
    base = slugify(name)
    candidate = base
    n = 2
    while True:
        if exclude_id is not None:
            row = conn.execute(
                "SELECT id FROM restaurants WHERE slug = ? AND id != ?", (candidate, exclude_id)
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT id FROM restaurants WHERE slug = ?", (candidate,)
            ).fetchone()
        if not row:
            return candidate
        candidate = f"{base}-{n}"
        n += 1


def log_change(conn, action, description, snapshot=None):
    conn.execute(
        "INSERT INTO change_log (action, description, snapshot) VALUES (?, ?, ?)",
        (action, description, json.dumps(snapshot or {})),
    )


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS restaurants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS restaurant_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            value TEXT NOT NULL,
            info TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS change_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            action TEXT NOT NULL,
            description TEXT NOT NULL,
            snapshot TEXT NOT NULL DEFAULT '{}'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS supplements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL DEFAULT '',
            per_day REAL NOT NULL DEFAULT 1,
            nutrients TEXT NOT NULL DEFAULT '{}',
            dsld_url TEXT NOT NULL DEFAULT ''
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS board_games (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL,
            bgg_id       INTEGER NOT NULL DEFAULT 0,
            bgg_url      TEXT NOT NULL DEFAULT '',
            image_url    TEXT NOT NULL DEFAULT '',
            min_players  INTEGER NOT NULL DEFAULT 0,
            max_players  INTEGER NOT NULL DEFAULT 0,
            best_players TEXT NOT NULL DEFAULT '',
            min_playtime INTEGER NOT NULL DEFAULT 0,
            max_playtime INTEGER NOT NULL DEFAULT 0,
            weight       REAL NOT NULL DEFAULT 0,
            cooperative  INTEGER NOT NULL DEFAULT 0,
            solo         INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS music_gear (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            reverb_id INTEGER NOT NULL DEFAULT 0,
            reverb_url TEXT NOT NULL DEFAULT '',
            image_url TEXT NOT NULL DEFAULT '',
            make TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            condition TEXT NOT NULL DEFAULT '',
            shrink_wrapped INTEGER NOT NULL DEFAULT 0,
            for_sale INTEGER NOT NULL DEFAULT 0
        )
    """)
    # Migrate: add new columns to music_gear if missing
    mg_cols = [row[1] for row in conn.execute("PRAGMA table_info(music_gear)").fetchall()]
    for col, defn in [
        ("make",           "TEXT NOT NULL DEFAULT ''"),
        ("model",          "TEXT NOT NULL DEFAULT ''"),
        ("condition",      "TEXT NOT NULL DEFAULT ''"),
        ("shrink_wrapped", "INTEGER NOT NULL DEFAULT 0"),
        ("for_sale",       "INTEGER NOT NULL DEFAULT 0"),
    ]:
        if col not in mg_cols:
            conn.execute(f"ALTER TABLE music_gear ADD COLUMN {col} {defn}")
    # Migrate: add new columns to board_games if missing
    bg_cols = [row[1] for row in conn.execute("PRAGMA table_info(board_games)").fetchall()]
    for col, defn in [
        ("min_players",  "INTEGER NOT NULL DEFAULT 0"),
        ("max_players",  "INTEGER NOT NULL DEFAULT 0"),
        ("best_players", "TEXT NOT NULL DEFAULT ''"),
        ("min_playtime", "INTEGER NOT NULL DEFAULT 0"),
        ("max_playtime", "INTEGER NOT NULL DEFAULT 0"),
        ("weight",       "REAL NOT NULL DEFAULT 0"),
        ("cooperative",     "INTEGER NOT NULL DEFAULT 0"),
        ("solo",            "INTEGER NOT NULL DEFAULT 0"),
        ("shrink_wrapped",  "INTEGER NOT NULL DEFAULT 0"),
        ("played_in_hawaii","INTEGER NOT NULL DEFAULT 0"),
        ("for_sale",        "INTEGER NOT NULL DEFAULT 0"),
    ]:
        if col not in bg_cols:
            conn.execute(f"ALTER TABLE board_games ADD COLUMN {col} {defn}")
    # Migrate: add dsld_url column to supplements if missing
    sup_cols = [row[1] for row in conn.execute("PRAGMA table_info(supplements)").fetchall()]
    if "dsld_url" not in sup_cols:
        conn.execute("ALTER TABLE supplements ADD COLUMN dsld_url TEXT NOT NULL DEFAULT ''")
    # Migrate: add info column to restaurant_items if missing
    ri_cols = [row[1] for row in conn.execute("PRAGMA table_info(restaurant_items)").fetchall()]
    if "info" not in ri_cols:
        conn.execute("ALTER TABLE restaurant_items ADD COLUMN info TEXT NOT NULL DEFAULT ''")
    # Migrate: add slug column to restaurants if missing, then backfill
    r_cols = [row[1] for row in conn.execute("PRAGMA table_info(restaurants)").fetchall()]
    if "slug" not in r_cols:
        conn.execute("ALTER TABLE restaurants ADD COLUMN slug TEXT NOT NULL DEFAULT ''")
        # Backfill slugs for existing rows, ensuring uniqueness
        rows = conn.execute("SELECT id, name FROM restaurants").fetchall()
        used = set()
        for row in rows:
            base = slugify(row["name"])
            candidate = base
            n = 2
            while candidate in used:
                candidate = f"{base}-{n}"
                n += 1
            used.add(candidate)
            conn.execute("UPDATE restaurants SET slug = ? WHERE id = ?", (candidate, row["id"]))
    # Seed default restaurants if table is empty
    count = conn.execute("SELECT COUNT(*) FROM restaurants").fetchone()[0]
    if count == 0:
        conn.execute("INSERT INTO restaurants (name, slug) VALUES (?, ?)", ("Roy's", "roys"))
        conn.execute("INSERT INTO restaurants (name, slug) VALUES (?, ?)", ("Napua Beach Club", "napua-beach-club"))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS game_sessions (
            id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            game_name TEXT DEFAULT '',
            decades TEXT,
            genres TEXT,
            mode TEXT DEFAULT 'cooperative',
            team1_name TEXT DEFAULT 'Team 1',
            team2_name TEXT DEFAULT 'Team 2',
            team1_score INTEGER DEFAULT 0,
            team2_score INTEGER DEFAULT 0,
            current_card_id INTEGER,
            current_host_team INTEGER DEFAULT 1,
            current_clue_level INTEGER DEFAULT 3,
            card_sequence TEXT DEFAULT '[]',
            card_index INTEGER DEFAULT 0,
            card_limit INTEGER DEFAULT 0,
            lobby_status TEXT DEFAULT 'lobby',
            status TEXT DEFAULT 'active'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS game_players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            player_name TEXT NOT NULL,
            team INTEGER,
            is_host INTEGER DEFAULT 0,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES game_sessions(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dice_bug_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            reporter TEXT NOT NULL,
            description TEXT NOT NULL,
            screenshot TEXT,
            app_state TEXT NOT NULL DEFAULT '{}',
            status TEXT DEFAULT 'open',
            notes TEXT DEFAULT ''
        )
    """)
    # Dice Vault shared rooms
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dice_rooms (
            code TEXT PRIMARY KEY,
            host_name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_activity TEXT NOT NULL DEFAULT (datetime('now')),
            status TEXT NOT NULL DEFAULT 'active'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dice_room_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            last_seen TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (room_code) REFERENCES dice_rooms(code)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dice_room_rolls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code TEXT NOT NULL,
            player_name TEXT NOT NULL,
            player_color TEXT NOT NULL,
            expression TEXT NOT NULL DEFAULT '',
            fav_name TEXT NOT NULL DEFAULT '',
            result_data TEXT NOT NULL DEFAULT '{}',
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (room_code) REFERENCES dice_rooms(code)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dice_room_packs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code TEXT NOT NULL,
            pack_id TEXT NOT NULL,
            pushed_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (room_code) REFERENCES dice_rooms(code)
        )
    """)
    # Community packs
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dice_pack_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pack_name TEXT NOT NULL,
            submitter TEXT NOT NULL,
            presets TEXT NOT NULL,
            submitted_at TEXT DEFAULT (datetime('now')),
            status TEXT DEFAULT 'pending'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dice_community_packs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pack_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            submitter TEXT NOT NULL,
            presets TEXT NOT NULL,
            approved_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()


def _build_restaurant_dict(rest, items):
    grouped = {"servers": [], "food": [], "other": []}
    for item in items:
        grouped.setdefault(item["category"], []).append(item)
    grouped["servers"].sort(key=lambda x: x["value"].lower())
    return {"id": rest["id"], "name": rest["name"], "slug": rest["slug"], **grouped}


def get_restaurant(conn, rid):
    rest = conn.execute("SELECT * FROM restaurants WHERE id = ?", (rid,)).fetchone()
    if not rest:
        return None
    items = conn.execute(
        "SELECT * FROM restaurant_items WHERE restaurant_id = ? ORDER BY id", (rid,)
    ).fetchall()
    return _build_restaurant_dict(rest, items)


def get_restaurant_by_slug(conn, slug):
    rest = conn.execute("SELECT * FROM restaurants WHERE slug = ?", (slug,)).fetchone()
    if not rest:
        return None
    items = conn.execute(
        "SELECT * FROM restaurant_items WHERE restaurant_id = ? ORDER BY id", (rest["id"],)
    ).fetchall()
    return _build_restaurant_dict(rest, items)


def get_all_restaurants(conn):
    rests = conn.execute("SELECT * FROM restaurants ORDER BY name").fetchall()
    items = conn.execute("SELECT * FROM restaurant_items ORDER BY id").fetchall()
    grouped = {}
    for item in items:
        key = (item["restaurant_id"], item["category"])
        grouped.setdefault(key, []).append(item)
    result = []
    for rest in rests:
        servers = sorted(grouped.get((rest["id"], "servers"), []), key=lambda x: x["value"].lower())
        result.append({
            "id": rest["id"],
            "name": rest["name"],
            "slug": rest["slug"],
            "servers": servers,
            "food": grouped.get((rest["id"], "food"), []),
            "other": grouped.get((rest["id"], "other"), []),
        })
    return result


# ---------------------------------------------------------------------------
# Supplements: nutrient categories and helpers
# ---------------------------------------------------------------------------

NUTRIENT_GROUPS = [
    ("Vitamins", [
        ("vitamin_a",   "Vitamin A",                    "mcg"),
        ("vitamin_b1",  "Vitamin B1 (Thiamine)",         "mg"),
        ("vitamin_b2",  "Vitamin B2 (Riboflavin)",       "mg"),
        ("vitamin_b3",  "Vitamin B3 (Niacin)",           "mg"),
        ("vitamin_b5",  "Vitamin B5 (Pantothenic Acid)", "mg"),
        ("vitamin_b6",  "Vitamin B6",                    "mg"),
        ("vitamin_b7",  "Vitamin B7 (Biotin)",           "mcg"),
        ("vitamin_b9",  "Vitamin B9 (Folate)",           "mcg DFE"),
        ("vitamin_b12", "Vitamin B12",                   "mcg"),
        ("vitamin_c",   "Vitamin C",                     "mg"),
        ("vitamin_d",   "Vitamin D",                     "mcg"),
        ("vitamin_e",   "Vitamin E",                     "mg"),
        ("vitamin_k",   "Vitamin K",                     "mcg"),
    ]),
    ("Minerals", [
        ("calcium",     "Calcium",                       "mg"),
        ("chromium",    "Chromium",                      "mcg"),
        ("copper",      "Copper",                        "mg"),
        ("iodine",      "Iodine",                        "mcg"),
        ("iron",        "Iron",                          "mg"),
        ("magnesium",   "Magnesium",                     "mg"),
        ("manganese",   "Manganese",                     "mg"),
        ("molybdenum",  "Molybdenum",                    "mcg"),
        ("phosphorus",  "Phosphorus",                    "mg"),
        ("potassium",   "Potassium",                     "mg"),
        ("selenium",    "Selenium",                      "mcg"),
        ("sodium",      "Sodium",                        "mg"),
        ("zinc",        "Zinc",                          "mg"),
    ]),
    ("Other Nutrients", [
        ("omega3_epa",  "Omega-3 EPA",                   "mg"),
        ("omega3_dha",  "Omega-3 DHA",                   "mg"),
        ("coq10",       "CoQ10",                         "mg"),
        ("lutein",      "Lutein",                        "mcg"),
        ("lycopene",    "Lycopene",                      "mcg"),
    ]),
]

# Flat key → (display name, unit) lookup
NUTRIENT_LOOKUP = {
    key: (name, unit)
    for _, nutrients in NUTRIENT_GROUPS
    for key, name, unit in nutrients
}

ALL_NUTRIENT_KEYS = [key for _, nutrients in NUTRIENT_GROUPS for key, _, _ in nutrients]

# FDA Reference Daily Intakes (2020) — None means no established Daily Value
DAILY_VALUES = {
    # Vitamins
    "vitamin_a":   900,    # mcg RAE
    "vitamin_b1":  1.2,    # mg
    "vitamin_b2":  1.3,    # mg
    "vitamin_b3":  16,     # mg NE
    "vitamin_b5":  5,      # mg
    "vitamin_b6":  1.7,    # mg
    "vitamin_b7":  30,     # mcg
    "vitamin_b9":  400,    # mcg DFE
    "vitamin_b12": 2.4,    # mcg
    "vitamin_c":   90,     # mg
    "vitamin_d":   20,     # mcg (800 IU)
    "vitamin_e":   15,     # mg AT
    "vitamin_k":   120,    # mcg
    # Minerals
    "calcium":     1300,   # mg
    "chromium":    35,     # mcg
    "copper":      0.9,    # mg
    "iodine":      150,    # mcg
    "iron":        18,     # mg
    "magnesium":   420,    # mg
    "manganese":   2.3,    # mg
    "molybdenum":  45,     # mcg
    "phosphorus":  1250,   # mg
    "potassium":   4700,   # mg
    "selenium":    55,     # mcg
    "sodium":      2300,   # mg
    "zinc":        11,     # mg
    # Other — no established FDA Daily Value
    "omega3_epa":  None,
    "omega3_dha":  None,
    "coq10":       None,
    "lutein":      None,
    "lycopene":    None,
}


def get_all_supplements(conn):
    return conn.execute("SELECT * FROM supplements ORDER BY name").fetchall()


def get_supplement(conn, sup_id):
    return conn.execute("SELECT * FROM supplements WHERE id = ?", (sup_id,)).fetchone()


def compute_supplement_totals(supplements):
    """Return {nutrient_key: daily_total} across all supplements multiplied by per_day."""
    totals = {}
    for sup in supplements:
        try:
            nutrients = json.loads(sup["nutrients"] or "{}")
        except (json.JSONDecodeError, TypeError):
            nutrients = {}
        per_day = float(sup["per_day"] or 1)
        for key, val in nutrients.items():
            try:
                totals[key] = totals.get(key, 0.0) + float(val) * per_day
            except (ValueError, TypeError):
                pass
    return totals


def fmt_nutrient_val(val):
    """Format a nutrient total for display — no unnecessary decimals."""
    if val == int(val):
        return str(int(val))
    return f"{val:.2f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------------------
# Board Games — BoardGameGeek XML API v2 (bearer token auth)
# ---------------------------------------------------------------------------

BGG_SEARCH_URL = "https://boardgamegeek.com/xmlapi2/search"
BGG_THING_URL  = "https://boardgamegeek.com/xmlapi2/thing"

_BGG_TOKEN_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bgg_token.txt")
_BGG_TOKEN = open(_BGG_TOKEN_PATH).read().strip() if os.path.exists(_BGG_TOKEN_PATH) else ""


# ---------------------------------------------------------------------------
# Reverb API (music gear)
# ---------------------------------------------------------------------------

REVERB_API_BASE = "https://api.reverb.com/api"
_REVERB_TOKEN_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reverb_token.txt")
_REVERB_TOKEN = open(_REVERB_TOKEN_PATH).read().strip() if os.path.exists(_REVERB_TOKEN_PATH) else ""


def _reverb_request(path):
    """Fetch a Reverb API endpoint with bearer token auth. Returns parsed JSON."""
    url = f"{REVERB_API_BASE}{path}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {_REVERB_TOKEN}",
        "Accept": "application/hal+json",
        "Accept-Version": "3.0",
        "User-Agent": "casdra-music-gear/1.0",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def _bgg_request(url):
    """Fetch a BGG API URL with bearer token auth. Returns response bytes."""
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {_BGG_TOKEN}",
        "User-Agent": "casdra-boardgames/1.0",
        "Accept": "application/xml, text/xml, */*",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


def lookup_bgg_game(query):
    """
    Look up a board game on BGG by name or BGG URL.
    Returns (name, bgg_id, bgg_url, image_url, min_players, max_players,
             best_players, min_playtime, max_playtime, weight, cooperative).
    Raises ValueError if the game cannot be found.
    """
    bgg_id = None

    m = re.search(r"boardgamegeek\.com/boardgame/(\d+)", query)
    if m:
        bgg_id = int(m.group(1))
    else:
        params = urlencode({"query": query, "type": "boardgame"})
        data = _bgg_request(f"{BGG_SEARCH_URL}?{params}")
        root = ET.fromstring(data)
        items = root.findall("item")
        if not items:
            raise ValueError(f"No BGG results found for: {query}")
        # Prefer the result whose name most closely matches the query
        q_lower = query.lower()
        def _score(item):
            name_el = item.find("name")
            n = (name_el.get("value", "") if name_el is not None else "").lower()
            if n == q_lower:
                return 0          # exact match
            if n.startswith(q_lower):
                return 1          # prefix match
            if q_lower in n:
                return 2          # substring match
            return 3              # no match — keep original order as tiebreak
        items.sort(key=_score)
        bgg_id = int(items[0].get("id"))

    # Fetch full game details with stats; BGG may return 202 (queued) — retry once
    # No type filter on the thing endpoint — it would exclude expansions/accessories
    params2 = urlencode({"id": bgg_id, "stats": 1})
    for attempt in range(2):
        data2 = _bgg_request(f"{BGG_THING_URL}?{params2}")
        root2 = ET.fromstring(data2)
        if root2.find("item") is None and attempt == 0:
            time.sleep(2)
            continue
        break

    item = root2.find("item")
    if item is None:
        raise ValueError(f"BGG game ID {bgg_id} not found")

    name_el = item.find("name[@type='primary']")
    name = name_el.get("value", "") if name_el is not None else f"Game #{bgg_id}"

    image_el = item.find("image")
    image_url = ""
    if image_el is not None and image_el.text:
        raw = image_el.text.strip()
        image_url = ("https:" + raw) if raw.startswith("//") else raw

    # Player counts
    def _int_val(tag):
        el = item.find(tag)
        try:
            return int(el.get("value", "0")) if el is not None else 0
        except (ValueError, TypeError):
            return 0

    min_players = _int_val("minplayers")
    max_players = _int_val("maxplayers")

    # Best player count: find numplayers value with highest "Best" votes
    best_players = ""
    poll = item.find("poll[@name='suggested_numplayers']")
    if poll is not None:
        best_votes = 0
        for results in poll.findall("results"):
            numplayers = results.get("numplayers", "")
            for result in results.findall("result"):
                if result.get("value") == "Best":
                    try:
                        votes = int(result.get("numvotes", "0"))
                        if votes > best_votes:
                            best_votes = votes
                            best_players = numplayers
                    except (ValueError, TypeError):
                        pass

    # Playing time
    min_playtime = _int_val("minplaytime")
    max_playtime = _int_val("maxplaytime")
    if max_playtime == 0:
        max_playtime = _int_val("playingtime")

    # Weight / complexity
    weight = 0.0
    weight_el = item.find("statistics/ratings/averageweight")
    if weight_el is not None:
        try:
            weight = float(weight_el.get("value", "0"))
        except (ValueError, TypeError):
            weight = 0.0

    # Cooperative: covers BGG's new name "Cooperative Game" and old "Co-operative Play"
    cooperative = 0
    for link in item.findall("link"):
        val = link.get("value", "").lower()
        typ = link.get("type", "")
        if typ in ("boardgamemechanic", "boardgamecategory") and \
                ("cooperative" in val or "co-op" in val):
            cooperative = 1
            break

    # Solo: min players is 1, or BGG mechanic "Solo / Solitaire Game"
    solo = 1 if min_players == 1 else 0
    if not solo:
        for link in item.findall("link"):
            val = link.get("value", "").lower()
            if link.get("type") == "boardgamemechanic" and \
                    ("solo" in val or "solitaire" in val):
                solo = 1
                break

    bgg_url = f"https://boardgamegeek.com/boardgame/{bgg_id}"
    return (name, bgg_id, bgg_url, image_url,
            min_players, max_players, best_players,
            min_playtime, max_playtime, weight, cooperative, solo)


def lookup_reverb_listing(url):
    """
    Look up music gear on Reverb by URL.
    Supports product pages (/p/slug) and individual listings (/item/id).
    Returns (name, reverb_id, reverb_url, image_url, make, model, condition).
    Raises ValueError if the product/listing cannot be found.
    """
    # Product page: reverb.com/p/some-slug
    m_product = re.search(r"reverb\.com/p/([\w-]+)", url)
    # Individual listing: reverb.com/item/12345
    m_listing = re.search(r"reverb\.com/item/(\d+)", url)

    if m_product:
        slug = m_product.group(1)
        # Search the CSPs API using the slug as a query, progressively
        # shortening until we get results (long slugs can contain noise words)
        words = slug.replace("-", " ").split()
        pages = []
        for n in (len(words), 5, 3, 2):
            if n > len(words):
                continue
            query = " ".join(words[:n])
            try:
                data = _reverb_request(f"/csps?query={urllib.request.quote(query)}")
            except Exception as exc:
                raise ValueError(f"Reverb API error: {exc}")
            pages = data.get("comparison_shopping_pages", [])
            if pages:
                break
        if not pages:
            raise ValueError(f"No Reverb product found for: {slug}")
        match = None
        for p in pages:
            if p.get("slug") == slug:
                match = p
                break
        if not match:
            match = pages[0]
        title = match.get("title", slug.replace("-", " ").title())
        reverb_id = match.get("id", 0)
        brand = match.get("brand", {})
        make = brand.get("name", "") if isinstance(brand, dict) else ""
        model = match.get("model", "")
        photos = match.get("photos", [])
        image_url = ""
        if photos:
            image_url = photos[0].get("_links", {}).get("large_crop", {}).get("href", "")
            if not image_url:
                image_url = photos[0].get("_links", {}).get("full", {}).get("href", "")
        reverb_url = match.get("_links", {}).get("web", {}).get("href",
                     f"https://reverb.com/p/{slug}")
        return (title, reverb_id, reverb_url, image_url, make, model, "")

    elif m_listing:
        listing_id = int(m_listing.group(1))
        try:
            data = _reverb_request(f"/listings/{listing_id}")
        except Exception as exc:
            raise ValueError(f"Reverb API error: {exc}")
        title = data.get("title", f"Listing #{listing_id}")
        make = data.get("make", "")
        model = data.get("model", "")
        condition = data.get("condition", {})
        if isinstance(condition, dict):
            condition = condition.get("display_name", "")
        photos = data.get("photos", [])
        image_url = ""
        if photos:
            image_url = photos[0].get("_links", {}).get("large_crop", {}).get("href", "")
            if not image_url:
                image_url = photos[0].get("_links", {}).get("full", {}).get("href", "")
        reverb_url = data.get("_links", {}).get("web", {}).get("href",
                     f"https://reverb.com/item/{listing_id}")
        return (title, listing_id, reverb_url, image_url, make, model, condition)

    else:
        raise ValueError("Paste a Reverb URL (reverb.com/p/... or reverb.com/item/...)")


_BG_SORT = (
    "CASE "
    "WHEN name LIKE 'The %' THEN SUBSTR(name, 5) "
    "WHEN name LIKE 'A %'   THEN SUBSTR(name, 3) "
    "ELSE name END COLLATE NOCASE"
)

def get_all_board_games(conn):
    return conn.execute(f"SELECT * FROM board_games ORDER BY {_BG_SORT}").fetchall()


def get_board_game(conn, game_id):
    return conn.execute("SELECT * FROM board_games WHERE id = ?", (game_id,)).fetchone()


_MG_SORT = (
    "CASE "
    "WHEN name LIKE 'The %' THEN SUBSTR(name, 5) "
    "WHEN name LIKE 'A %'   THEN SUBSTR(name, 3) "
    "ELSE name END COLLATE NOCASE"
)

def get_all_music_gear(conn):
    return conn.execute(f"SELECT * FROM music_gear ORDER BY {_MG_SORT}").fetchall()


def get_music_gear(conn, gear_id):
    return conn.execute("SELECT * FROM music_gear WHERE id = ?", (gear_id,)).fetchone()


# ---------------------------------------------------------------------------
# Board Game Oracle — price lookups for for-sale games
# ---------------------------------------------------------------------------

_PRICE_CACHE = {}        # game_name -> {"low": float, "high": float, "count": int, "ts": float}
_PRICE_CACHE_TTL = 3600  # 1 hour

_BGO_SEARCH_URL = ("https://www.boardgameoracle.com/api/trpc/boardgame.list"
                   "?input={}")
_BGO_PRICES_URL = ("https://www.boardgameoracle.com/api/trpc/price.list"
                   "?input={}")


def _bgo_fetch_prices(game_name):
    """Fetch price range from Board Game Oracle for a game by name."""
    import urllib.parse
    inp = json.dumps({"region": "us", "q": game_name,
                      "filters": {"type": ["boardgame"]}, "sort": "relevance"})
    url = _BGO_SEARCH_URL.format(urllib.parse.quote(inp))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Casdra/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
    except Exception:
        return None
    # Navigate tRPC response wrapper
    items = []
    try:
        items = data.get("result", {}).get("data", {}).get("items", [])
    except Exception:
        return None
    if not items:
        return None
    # Pick the first boardgame result (best relevance match)
    item = items[0]
    key = item.get("key")
    if not key:
        return None
    # Fetch all prices for this game
    inp2 = json.dumps({"region": "us", "key": key})
    url2 = _BGO_PRICES_URL.format(urllib.parse.quote(inp2))
    try:
        req2 = urllib.request.Request(url2, headers={"User-Agent": "Casdra/1.0"})
        with urllib.request.urlopen(req2, timeout=8) as resp2:
            data2 = json.loads(resp2.read())
    except Exception:
        # Fall back to just the lowest price from search
        lp = item.get("lowest_price", {})
        price = lp.get("price")
        if price:
            slug = item.get("slug", "")
            return {"low": price, "high": price, "count": 1,
                    "key": key, "slug": slug}
        return None
    # Extract price list
    prices = []
    try:
        price_items = data2.get("result", {}).get("data", {}).get("items", [])
        for p in price_items:
            val = p.get("price")
            avail = p.get("availability", "")
            if val and avail == "in_stock":
                prices.append(val)
    except Exception:
        pass
    if not prices:
        # Try all prices regardless of stock
        try:
            price_items = data2.get("result", {}).get("data", {}).get("items", [])
            for p in price_items:
                val = p.get("price")
                if val:
                    prices.append(val)
        except Exception:
            pass
    if not prices:
        return None
    slug = item.get("slug", "")
    return {"low": min(prices), "high": max(prices), "count": len(prices),
            "key": key, "slug": slug}


def get_game_price(game_id):
    """Return cached price for a single game by ID, regardless of for_sale status."""
    conn = get_db()
    g = conn.execute("SELECT id, name, shrink_wrapped FROM board_games WHERE id = ?", (game_id,)).fetchone()
    conn.close()
    if not g:
        return None
    name = g["name"]
    sw = g["shrink_wrapped"]
    now = time.time()
    cached = _PRICE_CACHE.get(name)
    if cached and now - cached["ts"] < _PRICE_CACHE_TTL:
        return {"low": cached["low"], "high": cached["high"], "count": cached["count"],
                "key": cached.get("key", ""), "slug": cached.get("slug", ""), "sw": sw}
    prices = _bgo_fetch_prices(name)
    if prices:
        _PRICE_CACHE[name] = {**prices, "ts": now}
        return {"low": prices["low"], "high": prices["high"], "count": prices["count"],
                "key": prices.get("key", ""), "slug": prices.get("slug", ""), "sw": sw}
    return None


def get_for_sale_prices():
    """Return cached prices for all for-sale games, refreshing stale entries."""
    conn = get_db()
    games = conn.execute("SELECT id, name, shrink_wrapped FROM board_games WHERE for_sale = 1").fetchall()
    conn.close()
    now = time.time()
    result = {}
    for g in games:
        name = g["name"]
        gid = g["id"]
        sw = g["shrink_wrapped"]
        cached = _PRICE_CACHE.get(name)
        if cached and now - cached["ts"] < _PRICE_CACHE_TTL:
            result[str(gid)] = {"low": cached["low"], "high": cached["high"],
                                "count": cached["count"],
                                "key": cached.get("key", ""),
                                "slug": cached.get("slug", ""), "sw": sw}
            continue
        prices = _bgo_fetch_prices(name)
        if prices:
            _PRICE_CACHE[name] = {**prices, "ts": now}
            result[str(gid)] = {"low": prices["low"], "high": prices["high"],
                                "count": prices["count"],
                                "key": prices.get("key", ""),
                                "slug": prices.get("slug", ""), "sw": sw}
    return result


# ---------------------------------------------------------------------------
# Reverb price lookups for for-sale gear
# ---------------------------------------------------------------------------

_GEAR_PRICE_CACHE = {}       # gear_name -> {"low": float, "high": float, "count": int, "ts": float}
_GEAR_PRICE_CACHE_TTL = 3600  # 1 hour


def _reverb_fetch_prices(name, reverb_url=""):
    """Fetch price range from Reverb for a gear item by name."""
    import urllib.parse

    def _iqr_range(prices):
        """Return low/high with IQR outlier removal (like Reverb's price guide)."""
        prices.sort()
        n = len(prices)
        if n < 4:
            return min(prices), max(prices)
        q1 = prices[n // 4]
        q3 = prices[(3 * n) // 4]
        iqr = q3 - q1
        low_fence = q1 - 1.5 * iqr
        high_fence = q3 + 1.5 * iqr
        filtered = [p for p in prices if low_fence <= p <= high_fence]
        if not filtered:
            return min(prices), max(prices)
        return min(filtered), max(filtered)

    # Try CSP detail endpoint to get properly-filtered used listings search URL
    csp_id = None
    if reverb_url:
        m = re.search(r"reverb\.com/p/([\w-]+)", reverb_url)
        if m:
            slug = m.group(1)
            try:
                data = _reverb_request(f"/csps?query={urllib.parse.quote(slug.replace('-', ' '))}")
                pages = data.get("comparison_shopping_pages", [])
                for p in pages:
                    if p.get("slug") == slug:
                        csp_id = p.get("id")
                        break
                if not csp_id and pages:
                    csp_id = pages[0].get("id")
            except Exception:
                pass
    if csp_id:
        try:
            csp = _reverb_request(f"/comparison_shopping_pages/{csp_id}")
            used_href = (csp.get("_links", {}).get("used_search", {}).get("href")
                         or csp.get("_links", {}).get("web", {}).get("used_listings", {}).get("href", ""))
            if used_href and "api.reverb.com" in used_href:
                # Strip base URL to get the API path
                api_path = used_href.split("api.reverb.com/api", 1)[-1]
                data = _reverb_request(api_path)
                listings = data.get("listings", [])
                prices = []
                for listing in listings:
                    amount = listing.get("price", {}).get("amount")
                    if amount:
                        try:
                            prices.append(float(amount))
                        except (ValueError, TypeError):
                            pass
                if prices:
                    lo, hi = _iqr_range(prices)
                    return {"low": lo, "high": hi, "count": len(prices)}
        except Exception:
            pass
    # Fall back to active listings search by name
    try:
        params = urllib.parse.urlencode({"query": name, "state": "live"})
        data = _reverb_request(f"/listings/all?{params}")
        listings = data.get("listings", [])
        prices = []
        for listing in listings:
            amount = listing.get("price", {}).get("amount")
            if amount:
                try:
                    prices.append(float(amount))
                except (ValueError, TypeError):
                    pass
        if prices:
            lo, hi = _iqr_range(prices)
            return {"low": lo, "high": hi, "count": len(prices)}
    except Exception:
        pass
    return None


def get_gear_price(gear_id):
    """Return cached price for a single gear item by ID, regardless of for_sale status."""
    conn = get_db()
    g = conn.execute("SELECT id, name, reverb_url FROM music_gear WHERE id = ?", (gear_id,)).fetchone()
    conn.close()
    if not g:
        return None
    name = g["name"]
    now = time.time()
    cached = _GEAR_PRICE_CACHE.get(name)
    if cached and now - cached["ts"] < _GEAR_PRICE_CACHE_TTL:
        return {"low": cached["low"], "high": cached["high"], "count": cached["count"]}
    prices = _reverb_fetch_prices(name, g["reverb_url"])
    if prices:
        _GEAR_PRICE_CACHE[name] = {**prices, "ts": now}
        return {"low": prices["low"], "high": prices["high"], "count": prices["count"]}
    return None


def get_for_sale_gear_prices():
    """Return cached prices for all for-sale gear, refreshing stale entries."""
    conn = get_db()
    items = conn.execute("SELECT id, name, reverb_url FROM music_gear WHERE for_sale = 1").fetchall()
    conn.close()
    now = time.time()
    result = {}
    for g in items:
        name = g["name"]
        gid = g["id"]
        cached = _GEAR_PRICE_CACHE.get(name)
        if cached and now - cached["ts"] < _GEAR_PRICE_CACHE_TTL:
            result[str(gid)] = {"low": cached["low"], "high": cached["high"],
                                "count": cached["count"]}
            continue
        prices = _reverb_fetch_prices(name, g["reverb_url"])
        if prices:
            _GEAR_PRICE_CACHE[name] = {**prices, "ts": now}
            result[str(gid)] = {"low": prices["low"], "high": prices["high"],
                                "count": prices["count"]}
    return result


# ---------------------------------------------------------------------------
# BGG catalog — loaded into memory at startup for fast autocomplete
# ---------------------------------------------------------------------------

_BGG_CATALOG = []  # list of (bgg_id, name, year)
_CATALOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bgg_catalog.txt")


def load_catalog():
    global _BGG_CATALOG
    if not os.path.exists(_CATALOG_FILE):
        return
    entries = []
    with open(_CATALOG_FILE, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t", 2)
            if len(parts) < 2:
                continue
            try:
                bgg_id = int(parts[0])
            except ValueError:
                continue
            name = parts[1]
            year = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
            entries.append((bgg_id, name, year))
    _BGG_CATALOG = entries
    if _BGG_CATALOG:
        print(f"BGG catalog: {len(_BGG_CATALOG):,} games loaded")


def _catalog_search(q, limit=50, exclude_ids=None):
    """Regex search over the in-memory BGG catalog. Returns up to `limit` results."""
    if not q or not _BGG_CATALOG:
        return []
    try:
        pat = re.compile(q, re.IGNORECASE)
    except re.error:
        pat = re.compile(re.escape(q), re.IGNORECASE)
    exclude = set(exclude_ids) if exclude_ids else set()
    exact, prefix, rest_list = [], [], []
    for bgg_id, name, year in _BGG_CATALOG:
        if bgg_id in exclude:
            continue
        m = pat.search(name)
        if not m:
            continue
        entry = {"bgg_id": bgg_id, "name": name, "year": year}
        if m.start() == 0 and m.end() == len(name):
            exact.append(entry)
        elif m.start() == 0:
            prefix.append(entry)
        else:
            rest_list.append(entry)
    return (exact + prefix + rest_list)[:limit]


# ---------------------------------------------------------------------------
# NIH Office of Dietary Supplements Label Database (DSLD) nutrient lookup
# No API key required.  186,000+ supplement labels.
# Docs: https://api.ods.od.nih.gov/dsld/v9/
# ---------------------------------------------------------------------------

DSLD_SEARCH_URL = "https://api.ods.od.nih.gov/dsld/v9/search-filter"
DSLD_LABEL_URL  = "https://api.ods.od.nih.gov/dsld/v9/label"

# DSLD ingredientGroup (lowercase) → our nutrient key
DSLD_INGREDIENT_MAP = {
    "vitamin a":                        "vitamin_a",
    "vitamin b1 (thiamine)":            "vitamin_b1",
    "thiamin":                          "vitamin_b1",
    "thiamine":                         "vitamin_b1",
    "vitamin b2 (riboflavin)":          "vitamin_b2",
    "riboflavin":                       "vitamin_b2",
    "vitamin b3 (niacin)":              "vitamin_b3",
    "niacin":                           "vitamin_b3",
    "vitamin b5 (pantothenic acid)":    "vitamin_b5",
    "pantothenic acid":                 "vitamin_b5",
    "vitamin b6":                       "vitamin_b6",
    "vitamin b7 (biotin)":              "vitamin_b7",
    "biotin":                           "vitamin_b7",
    "vitamin b9 (folate)":              "vitamin_b9",
    "folate":                           "vitamin_b9",
    "folic acid":                       "vitamin_b9",
    "vitamin b12":                      "vitamin_b12",
    "vitamin c":                        "vitamin_c",
    "ascorbic acid":                    "vitamin_c",
    "vitamin d":                        "vitamin_d",
    "vitamin d3":                       "vitamin_d",
    "vitamin d2":                       "vitamin_d",
    "cholecalciferol":                  "vitamin_d",
    "vitamin e":                        "vitamin_e",
    "vitamin k":                        "vitamin_k",
    "vitamin k1":                       "vitamin_k",
    "vitamin k2":                       "vitamin_k",
    "calcium":                          "calcium",
    "chromium":                         "chromium",
    "copper":                           "copper",
    "iodine":                           "iodine",
    "iron":                             "iron",
    "magnesium":                        "magnesium",
    "manganese":                        "manganese",
    "molybdenum":                       "molybdenum",
    "phosphorus":                       "phosphorus",
    "potassium":                        "potassium",
    "selenium":                         "selenium",
    "sodium":                           "sodium",
    "zinc":                             "zinc",
    "epa (eicosapentaenoic acid)":      "omega3_epa",
    "eicosapentaenoic acid":            "omega3_epa",
    "omega-3":                          "omega3_epa",   # combined Omega-3 fallback
    "dha (docosahexaenoic acid)":       "omega3_dha",
    "docosahexaenoic acid":             "omega3_dha",
    "coenzyme q-10":                    "coq10",
    "coq10":                            "coq10",
    "lutein":                           "lutein",
    "lycopene":                         "lycopene",
}

# IU → target unit conversion factors for fat-soluble vitamins
# (some older supplement labels still use IU)
_IU_CONVERSIONS = {
    "vitamin_a": ("mcg", 0.3),     # 1 IU = 0.3 mcg RAE (retinol)
    "vitamin_d": ("mcg", 0.025),   # 1 IU = 0.025 mcg (cholecalciferol)
    "vitamin_e": ("mg",  0.67),    # 1 IU = 0.67 mg (natural d-alpha-tocopherol)
}


def _convert_nutrient_value(val, from_unit, to_unit, nutrient_key):
    """Convert a nutrient value to our target unit. Returns float or None."""
    f = from_unit.strip().upper()
    t = to_unit.strip().upper()
    # Same unit (handle DFE suffix and mcg/ug synonyms)
    if f == t or f == t.replace(" DFE", "") or (f in ("UG", "MCG") and t in ("UG", "MCG")):
        return float(val)
    if f == "G":
        if t == "MG":           return float(val) * 1000
        if t in ("MCG", "UG"): return float(val) * 1_000_000
    if f == "MG" and t in ("MCG", "UG"): return float(val) * 1000
    if f in ("MCG", "UG") and t == "MG": return float(val) / 1000
    if f == "IU":
        if nutrient_key in _IU_CONVERSIONS:
            target_u, factor = _IU_CONVERSIONS[nutrient_key]
            if (target_u.upper() == t or
                    (t == "MCG" and target_u == "mcg") or
                    (t == "MG"  and target_u == "mg")):
                return float(val) * factor
    return None


def _extract_search_term_from_url(url):
    """Pull a human-readable product name from an Amazon or Costco URL path."""
    if not url:
        return None
    try:
        path = urlparse(url).path
        # Amazon: /Product-Name-Here/dp/ASIN[/...]
        m = re.match(r"^/([A-Za-z0-9][^/]{3,})/dp/", path)
        if m:
            return re.sub(r"[-_]+", " ", m.group(1)).strip()
        # Costco: /product-name-slug.product.NNN.html
        m = re.match(r"^/(.+?)\.product\.", path)
        if m:
            return re.sub(r"[-_]+", " ", m.group(1)).strip()
    except Exception:
        pass
    return None


_STOP_WORDS = {"a", "an", "the", "and", "or", "of", "with", "for", "to", "in", "by", "s"}


def _query_words(text):
    """Lowercase, strip punctuation, remove stop words. Returns a set of significant words."""
    words = re.sub(r"[^a-z0-9 ]", " ", text.lower()).split()
    return {w for w in words if w not in _STOP_WORDS and len(w) > 1}


def _relevance_score_dsld(hit_source, q_words):
    """
    Score a DSLD search hit against the user's query.
    All DSLD results are dietary supplements, so we only need word overlap.
    Returns score ≥ 0 if relevant, -1 if not relevant (overlap < 15%).
    """
    full_name  = (hit_source.get("fullName",  "") or "").lower()
    brand_name = (hit_source.get("brandName", "") or "").lower()
    text_words = _query_words(f"{full_name} {brand_name}")
    overlap    = len(q_words & text_words) / max(len(q_words), 1)
    return (overlap * 10) if overlap >= 0.15 else -1


def fetch_supplement_nutrients(name, url=""):
    """
    Search NIH DSLD for a supplement by name (or URL-derived name).
    Two-step: search → fetch label detail for nutrient quantities.
    Returns (nutrients_dict, status, label, dsld_url) where:
      status   = "found" | "not_found" | "error"
      label    = product description string, or ""
      dsld_url = https://dsld.od.nih.gov/label/{id} if found, else ""
    """
    queries = []
    url_term = _extract_search_term_from_url(url)
    if url_term:
        queries.append(url_term)
    queries.append(name)

    last_status = "not_found"

    for query in queries:
        q_words = _query_words(query)
        try:
            # Step 1: Search DSLD for matching supplement labels
            params = urlencode({"q": query, "size": "15"})
            req = urllib.request.Request(
                f"{DSLD_SEARCH_URL}?{params}",
                headers={"User-Agent":  "casdra-supplements/1.0",
                         "Accept":      "application/json"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                search_data = json.loads(resp.read().decode())

            hits = search_data.get("hits", [])
            if not hits:
                continue

            # Score and filter by name relevance
            scored = []
            for hit in hits:
                src   = hit.get("_source", {})
                score = _relevance_score_dsld(src, q_words)
                if score >= 0:
                    scored.append((hit, score))
            if not scored:
                continue

            best_hit, _ = max(scored, key=lambda x: x[1])
            label_id   = best_hit.get("_id")
            src        = best_hit.get("_source", {})
            brand_name = (src.get("brandName", "") or "").strip()
            full_name  = (src.get("fullName",  "") or "").strip()
            label_str  = f"{brand_name} — {full_name}" if brand_name else full_name

            # Step 2: Fetch full label detail for nutrient quantities
            req2 = urllib.request.Request(
                f"{DSLD_LABEL_URL}/{label_id}",
                headers={"User-Agent": "casdra-supplements/1.0",
                         "Accept":     "application/json"},
            )
            with urllib.request.urlopen(req2, timeout=10) as resp2:
                label_data = json.loads(resp2.read().decode())

            # Build a flat lookup: our_key → display unit (from NUTRIENT_GROUPS)
            key_to_unit = {
                k: u
                for _, grp in NUTRIENT_GROUPS
                for k, _, u in grp
            }

            nutrients = {}
            for row in label_data.get("ingredientRows", []):
                group   = (row.get("ingredientGroup") or row.get("name") or "").strip().lower()
                our_key = DSLD_INGREDIENT_MAP.get(group)
                if not our_key or our_key in nutrients:
                    continue
                quantities = row.get("quantity", [])
                if not quantities:
                    continue
                q_entry = quantities[0]
                val     = q_entry.get("quantity")
                unit    = (q_entry.get("unit") or "").strip()
                if val is None or float(val) <= 0:
                    continue
                target_unit = key_to_unit.get(our_key)
                if not target_unit:
                    continue
                # Strip annotation suffixes (e.g. " DFE") before unit conversion
                base_target = target_unit.replace(" DFE", "").strip()
                converted = _convert_nutrient_value(float(val), unit, base_target, our_key)
                if converted and converted > 0:
                    nutrients[our_key] = fmt_nutrient_val(converted)

            if nutrients:
                dsld_url = f"https://dsld.od.nih.gov/label/{label_id}"
                return nutrients, "found", label_str.strip(" —"), dsld_url

        except Exception:
            last_status = "error"

    return {}, last_status, "", ""


# ---------------------------------------------------------------------------
# HTML helpers
# ---------------------------------------------------------------------------

COMMON_CSS = """
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #fdf0f5; color: #1c1c1e; }
    .navbar { display: flex; align-items: center; padding: 56px 8px 12px;
              background: #fdf0f5; border-bottom: 0.5px solid #f0c4d8;
              position: relative; }
    .navbar a, .back-btn { color: #e91e8c; text-decoration: none; font-size: 17px;
                           padding: 8px; background: none; border: none;
                           font-family: inherit; cursor: pointer; }
    .navbar-title { position: absolute; left: 50%; transform: translateX(-50%);
                    font-size: 17px; font-weight: 600; pointer-events: none; }
    .page-header { padding: 60px 20px 12px; font-size: 32px; font-weight: 700;
                   background: #fdf0f5; display: flex; align-items: baseline;
                   justify-content: space-between; }
    .page-header a { color: #e91e8c; text-decoration: none; font-size: 17px; font-weight: 400; }
    .list { background: #fff; margin: 8px 16px; border-radius: 12px; overflow: hidden; }
    .list a, .list-item { display: flex; align-items: center; justify-content: space-between;
               padding: 14px 16px; text-decoration: none; color: #1c1c1e;
               border-bottom: 0.5px solid #f0c4d8; font-size: 17px; cursor: pointer; }
    .list a:last-child, .list-item:last-child { border-bottom: none; }
    .list a:active, .list-item:active { background: #f8dce8; }
    .chevron { color: #e9a0c0; font-size: 20px; }
    .section { background: #fff; margin: 12px 0; border-radius: 12px; overflow: hidden; }
    .section-header { padding: 8px 16px 4px; font-size: 13px; font-weight: 600;
                      color: #6e6e73; text-transform: uppercase; letter-spacing: 0.5px; }
    .item-row { display: flex; align-items: center; justify-content: space-between;
                padding: 12px 16px; border-bottom: 0.5px solid #f0c4d8; font-size: 17px; }
    .item-row:last-child { border-bottom: none; }
    .delete-btn { color: #ff3b30; background: none; border: none; font-size: 15px;
                  cursor: pointer; padding: 4px 8px; font-family: inherit; }
    .add-row { display: flex; align-items: center; padding: 8px 16px; gap: 8px;
               border-top: 0.5px solid #f0c4d8; }
    .add-row input { flex: 1; padding: 10px 12px; border: 1px solid #f0c4d8;
                     border-radius: 10px; font-size: 16px; font-family: inherit;
                     background: #fdf0f5; outline: none; }
    .add-row input:focus { border-color: #e91e8c; }
    .add-row button { color: #e91e8c; background: none; border: none; font-size: 16px;
                      font-weight: 600; cursor: pointer; padding: 10px 4px; font-family: inherit; }
    .server-info { display: flex; flex-direction: row; align-items: baseline; gap: 8px;
                   flex: 1; min-width: 0; cursor: pointer; }
    .server-name { font-size: 17px; font-weight: 600; }
    .server-detail { font-size: 15px; color: #1c1c1e; }
    .server-info:hover .server-name { color: #e91e8c; }
    .edit-form { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
    .edit-form input { padding: 8px 10px; border: 1px solid #e91e8c; border-radius: 8px;
                       font-size: 16px; font-family: inherit; outline: none; background: #fff; }
    .edit-actions { display: flex; gap: 8px; margin-top: 4px; }
    .edit-actions button { font-size: 15px; font-family: inherit; border: none;
                           background: none; cursor: pointer; padding: 4px 8px; }
    .save-btn { color: #e91e8c; font-weight: 600; }
    .cancel-btn { color: #8e8e93; }
    .add-server-row { flex-wrap: wrap; }
    .add-server-row input { min-width: 0; }
    .editable-item { cursor: pointer; flex: 1; }
    .editable-item:hover { color: #e91e8c; }
    .edit-form-row { flex-direction: row; align-items: center; flex-wrap: wrap; }
    .empty { padding: 12px 16px; color: #8e8e93; font-size: 15px; }
    .body-content { padding: 0 16px 80px; }
    .search-box { margin: 8px 16px; display: flex; gap: 8px; }
    .search-box input { flex: 1; padding: 10px 14px; border: none; border-radius: 10px;
                        font-size: 16px; font-family: inherit; background: #f8dce8;
                        outline: none; -webkit-appearance: none; }
    .search-box input:focus { background: #fff; box-shadow: 0 0 0 2px #e91e8c; }
    .search-btn { color: #e91e8c; background: none; border: none; font-size: 16px;
                  font-weight: 600; cursor: pointer; padding: 0 4px; font-family: inherit; }
    .title-edit-container { display: flex; align-items: center; gap: 6px; }
    .title-edit-container input { padding: 4px 8px; border: 1px solid #e91e8c; border-radius: 8px;
                                   font-size: 16px; font-family: inherit; outline: none;
                                   background: #fff; min-width: 160px; text-align: center; }
    .title-edit-container button { font-size: 14px; font-family: inherit; border: none;
                                    background: none; cursor: pointer; padding: 4px 6px; }
    .title-save-btn { color: #e91e8c; font-weight: 600; }
    .title-cancel-btn { color: #8e8e93; }
    .no-results { padding: 40px 16px; text-align: center; color: #8e8e93; font-size: 17px; }
    .search-rest-header { font-size: 20px; font-weight: 700; margin: 16px 0 4px; }
    .search-rest-header a { text-decoration: none; color: #1c1c1e; }
    .search-cat-header { padding: 6px 0 2px; font-size: 13px; font-weight: 600;
                         color: #6e6e73; text-transform: uppercase; letter-spacing: 0.5px; }
    /* Changelog */
    .changelog-entry { background: #fff; margin: 10px 0; border-radius: 12px; padding: 12px 16px;
                       display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .cl-meta { flex: 1; min-width: 0; }
    .changelog-action { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase;
                        letter-spacing: 0.5px; padding: 2px 7px; border-radius: 6px; margin-bottom: 4px; }
    .cl-action-add { background: #d4f5e0; color: #1a7a3a; }
    .cl-action-update { background: #d4e8ff; color: #1a4a8a; }
    .cl-action-delete { background: #ffd4d4; color: #8a1a1a; }
    .cl-action-rename { background: #fff0cc; color: #7a5500; }
    .cl-action-merge { background: #ead4ff; color: #5a1a8a; }
    .cl-action-revert { background: #f0f0f0; color: #444; }
    .cl-desc { font-size: 15px; color: #1c1c1e; }
    .cl-time { font-size: 12px; color: #8e8e93; margin-top: 3px; }
    .revert-btn { color: #e91e8c; background: none; border: 1px solid #e91e8c; border-radius: 8px;
                  font-size: 14px; font-family: inherit; cursor: pointer; padding: 6px 12px;
                  white-space: nowrap; flex-shrink: 0; }
    .revert-btn:active { background: #fdf0f5; }
    .revert-btn:disabled { opacity: 0.4; cursor: default; }
    .cl-empty { padding: 40px 16px; text-align: center; color: #8e8e93; font-size: 17px; }
    /* PTR */
    .ptr-indicator { position: fixed; top: -50px; left: 50%; transform: translateX(-50%);
                     z-index: 1000; transition: top 0.3s ease; display: flex; align-items: center;
                     gap: 8px; background: #fff; padding: 8px 16px; border-radius: 20px;
                     box-shadow: 0 2px 8px rgba(0,0,0,0.1); pointer-events: none; }
    .ptr-indicator.visible { top: 60px; }
    .ptr-spinner { width: 20px; height: 20px; border: 3px solid #f0c4d8;
                   border-top-color: #e91e8c; border-radius: 50%; animation: spin 0.6s linear infinite; }
    .ptr-text { font-size: 14px; color: #8e8e93; }
    @keyframes spin { to { transform: rotate(360deg); } }
"""

PTR_HTML = '<div class="ptr-indicator" id="ptrIndicator"><div class="ptr-spinner"></div><span class="ptr-text">Refreshing...</span></div>'

PTR_JS = """
    (function() {
        let startY = 0, pulling = false;
        const indicator = document.getElementById('ptrIndicator');
        document.addEventListener('touchstart', function(e) {
            if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
        }, { passive: true });
        document.addEventListener('touchmove', function(e) {
            if (!pulling) return;
            if (e.touches[0].clientY - startY > 10 && window.scrollY === 0)
                indicator.classList.add('visible');
        }, { passive: true });
        document.addEventListener('touchend', function() {
            if (!pulling) return;
            pulling = false;
            if (indicator.classList.contains('visible'))
                setTimeout(function() { window.location.reload(); }, 300);
        });
    })();
"""

INLINE_EDIT_JS = """
    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }
    function escapeAttr(s) {
        return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    async function post(url, params) {
        return fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: Object.entries(params).map(([k,v]) =>
                encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&')
        });
    }
"""


def _make_solid_png(width, height, r, g, b):
    """Generate a minimal valid PNG with a solid fill colour. Pure stdlib."""
    def _chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    scanline = b"\x00" + bytes([r, g, b] * width)
    idat = zlib.compress(scanline * height, level=9)
    sig = b"\x89PNG\r\n\x1a\n"
    return sig + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b"")

_ICON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.png")
if os.path.exists(_ICON_PATH):
    with open(_ICON_PATH, "rb") as _f:
        APPLE_TOUCH_ICON_PNG = _f.read()
else:
    APPLE_TOUCH_ICON_PNG = _make_solid_png(180, 180, 233, 30, 140)  # #e91e8c fallback


def html_page(title, body, extra_css="", extra_js=""):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="Casdra">
    <meta name="theme-color" content="#e91e8c">
    <link rel="manifest" href="/manifest.json">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <title>{title}</title>
    <style>
{COMMON_CSS}
{extra_css}
    </style>
</head>
<body>
    {PTR_HTML}
    {body}
    <script>
{PTR_JS}
{INLINE_EDIT_JS}
{extra_js}
    </script>
</body>
</html>"""


def h(s):
    """HTML-escape a string."""
    return (str(s)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


# ---------------------------------------------------------------------------
# Wire up page module dependencies
# ---------------------------------------------------------------------------

_song_burst.get_db = get_db
_song_burst.html_page = html_page
_song_burst.h = h

_song_burst.WEB_MODE = WEB_MODE

_session.get_db = get_db
_session.html_page = html_page
_session.h = h
_session.WEB_MODE = WEB_MODE

# Expose module functions at server level for routing
build_song_burst_page = _song_burst.build_song_burst_page
build_song_burst_play_page = _song_burst.build_song_burst_play_page
SONG_BURST_CATEGORIES = _song_burst.SONG_BURST_CATEGORIES
get_category_info = _song_burst.get_category_info
build_dice_page = _dice_roller.build_dice_page
build_dice_history_page = _dice_roller.build_dice_history_page
build_dice_bugs_page = _dice_roller.build_dice_bugs_page
build_dice_bug_detail_page = _dice_roller.build_dice_bug_detail_page
build_room_log_page = _dice_roller.build_room_log_page


def build_dice_guide_page():
    return html_page("Dice Vault — Tester Guide", """
<style>
.dg { max-width: 720px; margin: 0 auto; padding: 16px 16px 60px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.dg h1 { font-size: 28px; margin: 0 0 4px; }
.dg .sub { color: var(--text-muted); font-size: 14px; margin-bottom: 24px; }
.dg h2 { font-size: 20px; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
.dg h3 { font-size: 16px; margin: 20px 0 8px; color: var(--accent); }
.dg p, .dg li { line-height: 1.6; color: var(--text); }
.dg ul { padding-left: 20px; }
.dg li { margin-bottom: 6px; }
.dg .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin: 12px 0; }
.dg .card-title { font-weight: 600; font-size: 15px; color: var(--text-bright); margin-bottom: 6px; }
.dg .badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; margin-left: 6px; vertical-align: middle; }
.dg .badge-free { background: #1a5a2a; color: #3dd68c; }
.dg .badge-premium { background: #4a2070; color: #bc8cff; }
.dg .tip { background: #1a2a1a; border: 1px solid #2a4a2a; border-radius: 10px; padding: 12px 14px; margin: 10px 0; font-size: 14px; }
.dg .tip::before { content: "💡 "; }
.dg .warn { background: #2a2a1a; border: 1px solid #4a4a2a; border-radius: 10px; padding: 12px 14px; margin: 10px 0; font-size: 14px; }
.dg .warn::before { content: "⚠️ "; }
.dg code { background: var(--bg); border: 1px solid var(--border2); border-radius: 4px; padding: 1px 6px; font-size: 13px; color: var(--accent); }
.dg .toc { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 16px 16px 20px; margin: 16px 0; }
.dg .toc a { color: var(--accent); text-decoration: none; font-size: 14px; display: block; padding: 3px 0; }
.dg .toc a:hover { text-decoration: underline; }
.dg .links { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0; }
.dg .links a { display: inline-flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 16px; color: var(--accent); text-decoration: none; font-size: 14px; font-weight: 500; }
.dg .links a:hover { border-color: var(--accent); }
.dg .step-num { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: var(--accent); color: var(--bg); border-radius: 50%; font-size: 13px; font-weight: 700; margin-right: 8px; flex-shrink: 0; }
.dg .step { display: flex; align-items: flex-start; margin: 10px 0; }
.dg .step p { margin: 0; }
.dg hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }
</style>
<div class="dg">
<h1>🎲 Dice Vault — Tester Guide</h1>
<p class="sub">Welcome to the Dice Vault beta! This guide covers every feature and how to report bugs. Thanks for helping make this app awesome.</p>

<div class="links">
    <a href="/dice">🎲 Open Dice Vault (Free)</a>
    <a href="/dice?premium=1">⭐ Open Dice Vault (Premium)</a>
    <a href="/dice/bugs">🐛 View Bug Reports</a>
</div>

<div class="toc">
    <strong>Table of Contents</strong>
    <a href="#basics">1. The Basics — Rolling Dice</a>
    <a href="#cup">2. The Dice Cup</a>
    <a href="#modifiers">3. Modifiers (Exploding, Drop, Keep, Floor, Cap, Success)</a>
    <a href="#selection">4. Die Selection System</a>
    <a href="#results">5. Roll Results &amp; Probability</a>
    <a href="#presets">6. Presets &amp; Favorites</a>
    <a href="#packs">7. Game Packs</a>
    <a href="#formula">8. Formula Bar (Premium)</a>
    <a href="#multigroup">9. Multi-Group Rolls (Premium)</a>
    <a href="#custom">10. Custom Dice &amp; Faces</a>
    <a href="#lock">11. Cup Lock</a>
    <a href="#history">12. Roll History</a>
    <a href="#themes">13. Themes &amp; Settings</a>
    <a href="#share">14. Sharing Results</a>
    <a href="#freeVpremium">15. Free vs Premium</a>
    <a href="#bugs">16. How to Report Bugs</a>
    <a href="#checklist">17. Tester Checklist</a>
</div>

<h2 id="basics">1. The Basics — Rolling Dice</h2>
<p>Tap any die button (d4, d6, d8, d10, d12, d20, d100) to add it to your cup. Tap the big <strong>ROLL</strong> button (or shake your device) to roll everything in the cup.</p>
<div class="card">
    <div class="card-title">Die Types Available</div>
    <ul>
        <li><strong>COIN</strong> — Flips heads or tails</li>
        <li><strong>d4, d6, d8, d10, d12, d20</strong> — Standard polyhedral dice</li>
        <li><strong>d100</strong> — Percentile die (1-100)</li>
        <li><strong>DX</strong> — Custom die — enter any number of sides (3-999)</li>
    </ul>
</div>
<div class="tip">Tap a die button multiple times to add more of that die. Adding 3× d6 is just three taps on d6.</div>

<h2 id="cup">2. The Dice Cup</h2>
<p>The cup is the staging area in the center of the screen. It shows all the dice you've added with color-coded shapes and count badges (e.g. "3×" for three d6s).</p>
<ul>
    <li><strong>Remove dice</strong> — Tap a die in the cup to remove one, or long-press and choose "Remove"</li>
    <li><strong>Clear cup</strong> — Tap the trash/clear button to empty the cup</li>
    <li>The cup auto-saves between sessions — close the app and come back, your dice are still there</li>
</ul>

<h2 id="modifiers">3. Modifiers</h2>
<p>Modifiers change how your dice are rolled or how results are calculated. Find them below the cup area.</p>

<div class="card">
    <div class="card-title">Exploding Dice (!)</div>
    <p>When a die rolls its maximum value, it rerolls and the results stack. A d6 that rolls 6 → 4 gives you 10. Can chain infinitely!</p>
</div>

<div class="card">
    <div class="card-title">Drop Lowest (dl) / Drop Highest (dh)</div>
    <p>Remove the lowest (or highest) N dice from your results. Classic example: <code>4d6dl1</code> — roll 4d6, drop the lowest 1 for D&amp;D stat generation.</p>
</div>

<div class="card">
    <div class="card-title">Keep Highest (kh)</div>
    <p>Keep only the highest N dice. <code>2d20kh1</code> is D&amp;D advantage — roll two d20s, keep the better one.</p>
</div>

<div class="card">
    <div class="card-title">Floor &amp; Cap</div>
    <p><strong>Floor</strong> sets a minimum total for a group — the result can never be lower than this value. <strong>Cap</strong> sets a maximum — the result can never exceed it. Useful for bounded rolls.</p>
</div>

<div class="card">
    <div class="card-title">Count Successes (#≥N)</div>
    <p>Instead of summing dice, count how many meet or exceed a threshold. <code>6d6#≥5</code> counts how many of your 6d6 rolled 5 or higher. Essential for Shadowrun, World of Darkness, etc.</p>
</div>

<div class="card">
    <div class="card-title">Flat Modifier (+/-)</div>
    <p>Add or subtract a number from the total. <code>1d20+5</code> adds 5 to whatever the d20 shows.</p>
</div>

<h2 id="selection">4. Die Selection System</h2>
<p><strong>Long-press</strong> (or right-click on desktop) any individual die in the cup to select it. Selected dice get a glowing highlight. Once selected, you can apply <strong>per-die modifiers</strong>:</p>
<ul>
    <li><strong>Min value</strong> — This specific die can never roll below X</li>
    <li><strong>Max value</strong> — This specific die can never roll above X</li>
    <li><strong>Per-die exploding</strong> — Only this die explodes on max</li>
    <li><strong>Per-die reroll</strong> — Reroll this die if it shows a specific value</li>
</ul>
<div class="badge badge-premium">PREMIUM</div>
<div class="tip">Tap elsewhere in the cup to deselect. Per-die modifiers show as small badges on the die.</div>

<h2 id="results">5. Roll Results &amp; Probability</h2>
<p>After rolling, you'll see:</p>
<ul>
    <li><strong>Big animated total</strong> at the top with a counting-up effect</li>
    <li><strong>Detailed breakdown</strong> — every individual die result, exploding chains (e.g. "5+6+4 = 15"), dropped dice shown in strikethrough</li>
    <li><strong>Probability mini-chart</strong> — shows the distribution of possible outcomes with your current roll highlighted</li>
    <li><strong>Clamped values</strong> show arrows indicating Floor/Cap adjustments</li>
    <li><strong>Success counts</strong> — green for successes, dim for failures</li>
</ul>

<h2 id="presets">6. Presets &amp; Favorites</h2>
<p>Save cup configurations you use often so you can load them with one tap.</p>
<div class="step"><span class="step-num">1</span><p>Set up your cup with the dice and modifiers you want</p></div>
<div class="step"><span class="step-num">2</span><p>Tap the <strong>star ⭐</strong> button to save as a preset</p></div>
<div class="step"><span class="step-num">3</span><p>Give it a name (e.g. "Fireball 8d6" or "Attack Roll")</p></div>
<div class="step"><span class="step-num">4</span><p>Your presets appear as chips you can scroll horizontally — tap any to load</p></div>
<ul>
    <li>Free mode: up to 5 presets</li>
    <li>Premium mode: unlimited presets</li>
    <li>Tap the pencil icon to rename, or pin/unpin presets</li>
</ul>

<h2 id="packs">7. Game Packs</h2>
<div class="badge badge-premium">PREMIUM</div>
<p>Game Packs are pre-built collections of presets for specific games. Instead of manually setting up "4d6 drop lowest" for D&amp;D, just install the D&amp;D 5e pack and get a full set of ready-to-roll presets.</p>

<h3>How to use Game Packs:</h3>
<div class="step"><span class="step-num">1</span><p>Tap the <strong>pack browser</strong> button (or look for the catalog icon)</p></div>
<div class="step"><span class="step-num">2</span><p>Browse or search the catalog — D&amp;D, Pathfinder, Shadowrun, King of Tokyo, Savage Worlds, and many more</p></div>
<div class="step"><span class="step-num">3</span><p>Tap <strong>Install</strong> on any pack to add its presets to your collection</p></div>
<div class="step"><span class="step-num">4</span><p>Switch between packs using the pack tabs at the top of your presets</p></div>

<h3>Built-in Packs include:</h3>
<ul>
    <li><strong>D&amp;D 5e</strong> — Stat rolls, advantage, disadvantage, spell damage</li>
    <li><strong>Pathfinder 2e</strong> — Multiple action penalties, skill checks</li>
    <li><strong>PbtA</strong> — Covers Apocalypse World, Dungeon World, Monster of the Week, etc.</li>
    <li><strong>Blades in the Dark / FitD</strong> — Action rolls, resistance rolls, fortune rolls</li>
    <li><strong>Shadowrun</strong> — Large d6 pools with success counting</li>
    <li><strong>World of Darkness</strong> — d10 pools, count 8+ as successes</li>
    <li><strong>Savage Worlds</strong> — Exploding dice with Wild Die</li>
    <li><strong>FATE/Fudge</strong> — 4dF Fudge dice</li>
    <li><strong>Dungeon Crawl Classics</strong> — Unusual dice chain (d3, d5, d7, d14, d16, d24, d30)</li>
    <li><strong>Call of Cthulhu</strong> — d100 roll-under, bonus/penalty dice</li>
    <li><strong>Ironsworn/Starforged</strong> — Action die vs challenge dice</li>
    <li><strong>King of Tokyo</strong> — Custom faces (Claws, Hearts, Lightning, 1/2/3)</li>
    <li><strong>Zombie Dice</strong> — Push-your-luck with color-coded dice</li>
    <li><strong>Formula De</strong> — Gear-specific racing dice</li>
    <li><strong>Yahtzee</strong> — Classic 5d6</li>
    <li><strong>Catan</strong> — 2d6 production rolls</li>
    <li><strong>Farkle/Greed</strong> — 6d6 scoring</li>
    <li><strong>Slot Machine</strong> — Weighted symbol reels (just for fun!)</li>
</ul>
<div class="tip">You can also create <strong>custom packs</strong> to organize your own presets — great for different characters or campaigns.</div>

<h2 id="formula">8. Formula Bar (Premium)</h2>
<div class="badge badge-premium">PREMIUM</div>
<p>Power users can type dice notation directly into the formula bar instead of tapping buttons. Supports the full notation syntax:</p>
<ul>
    <li><code>3d6</code> — Roll three six-sided dice</li>
    <li><code>1d20+5</code> — d20 plus 5 modifier</li>
    <li><code>4d6dl1</code> — Roll 4d6, drop lowest 1</li>
    <li><code>2d20kh1</code> — Advantage (roll 2d20, keep highest)</li>
    <li><code>4d6!</code> — Exploding d6s</li>
    <li><code>4d6r1</code> — Reroll 1s on d6</li>
    <li><code>6d6#≥5</code> — Count successes (5 or higher)</li>
    <li><code>4dF</code> — Fudge/FATE dice</li>
    <li><code>d{1,1,2,3,5}</code> — Custom die with specific faces</li>
    <li><code>(4d6dl1)+(2d8!)</code> — Multi-group with operations</li>
</ul>

<h2 id="multigroup">9. Multi-Group Rolls (Premium)</h2>
<div class="badge badge-premium">PREMIUM</div>
<p>Create multiple independent dice groups combined with operations:</p>
<ul>
    <li><strong>Sum (+)</strong> — Add groups together</li>
    <li><strong>Minus (−)</strong> — Subtract one group from another</li>
    <li><strong>Max</strong> — Take the highest group total</li>
    <li><strong>Min</strong> — Take the lowest group total</li>
</ul>
<p>Each group has its own modifiers. Example: "(4d6 drop lowest) + (2d8 exploding) + 5"</p>

<h2 id="custom">10. Custom Dice &amp; Custom Faces</h2>
<p><strong>Custom sided die (DX):</strong> Tap the DX button and enter any number of sides (3-999). Need a d7? A d30? A d100? Done.</p>
<p><strong>Custom face dice:</strong> Define dice with text or symbol faces instead of numbers. Example for King of Tokyo:</p>
<ul>
    <li>Create a die with faces: "Claw", "Heart", "Lightning", "1", "2", "3"</li>
    <li>Results show as symbol chips instead of numbers</li>
    <li>Game Packs pre-configure these for you</li>
</ul>

<h2 id="lock">11. Cup Lock 🔒</h2>
<p>Tap the <strong>lock button</strong> (padlock icon) to lock your cup. When locked:</p>
<ul>
    <li>Dice buttons and modifier controls are hidden</li>
    <li>You can still <strong>roll</strong> and <strong>switch presets</strong></li>
    <li>Prevents accidental taps from messing up your carefully configured cup</li>
    <li>The padlock icon shows open/closed state</li>
</ul>
<div class="tip">Great for game night — lock your cup after setup and just roll without worrying about bumping buttons.</div>

<h2 id="history">12. Roll History</h2>
<p>Use the <strong>back/forward arrows</strong> in the header to browse your last 30 rolls. Each history entry shows:</p>
<ul>
    <li>The expression that was rolled</li>
    <li>The total result</li>
    <li>Full breakdown of individual dice</li>
    <li>Timestamp</li>
</ul>
<p>Tap any history entry to reload that roll's cup configuration and try it again.</p>

<h2 id="themes">13. Themes &amp; Settings</h2>
<h3>Themes</h3>
<p>Tap the <strong>palette icon</strong> in the header to switch themes:</p>
<ul>
    <li><strong>Default</strong> — Dark mode (charcoal) <span class="badge badge-free">FREE</span></li>
    <li><strong>Midnight</strong> — Deep indigo <span class="badge badge-free">FREE</span></li>
    <li><strong>Light</strong> — Warm tan/brown <span class="badge badge-premium">PREMIUM</span></li>
    <li><strong>Purple</strong> — Rich magenta <span class="badge badge-premium">PREMIUM</span></li>
    <li><strong>Forest</strong> — Deep green <span class="badge badge-premium">PREMIUM</span></li>
    <li><strong>Blood</strong> — Dark red <span class="badge badge-premium">PREMIUM</span></li>
</ul>

<h3>Sound &amp; Haptics</h3>
<ul>
    <li><strong>Sound toggle</strong> — Mute/unmute the dice roll sound (speaker icon in header)</li>
    <li><strong>Haptic feedback</strong> — A short vibration on roll (on supported devices)</li>
</ul>

<h2 id="share">14. Sharing Results</h2>
<p>After rolling, tap the <strong>Share</strong> button to share your result. It uses the native share sheet on your device (or copies to clipboard on desktop). The shared text includes the formula, result, and full breakdown.</p>

<h2 id="freeVpremium">15. Free vs Premium</h2>
<div class="card">
    <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:8px 0">Feature</th>
            <th style="text-align:center;padding:8px">Free</th>
            <th style="text-align:center;padding:8px">Premium</th>
        </tr>
        <tr><td style="padding:6px 0">Standard dice (d4-d100)</td><td style="text-align:center">✅</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Custom sided die (DX)</td><td style="text-align:center">✅</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Exploding, drop, keep</td><td style="text-align:center">✅</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Floor &amp; Cap</td><td style="text-align:center">✅</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Count Successes</td><td style="text-align:center">✅</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Roll history</td><td style="text-align:center">✅</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Probability chart</td><td style="text-align:center">✅</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Cup lock</td><td style="text-align:center">✅</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Presets</td><td style="text-align:center">5 max</td><td style="text-align:center">Unlimited</td></tr>
        <tr><td style="padding:6px 0">Game Packs</td><td style="text-align:center">Browse only</td><td style="text-align:center">✅ Install &amp; use</td></tr>
        <tr><td style="padding:6px 0">Formula bar</td><td style="text-align:center">—</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Multi-group rolls</td><td style="text-align:center">—</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Per-die modifiers</td><td style="text-align:center">—</td><td style="text-align:center">✅</td></tr>
        <tr><td style="padding:6px 0">Extra themes</td><td style="text-align:center">2 themes</td><td style="text-align:center">6 themes</td></tr>
        <tr><td style="padding:6px 0">Custom face dice</td><td style="text-align:center">—</td><td style="text-align:center">✅</td></tr>
    </table>
</div>
<div class="tip">To test Premium features, add <code>?premium=1</code> to the URL or use the "Open Premium" link above.</div>

<h2 id="bugs">16. How to Report Bugs 🐛</h2>
<p>Found something broken or weird? Here's how to report it:</p>

<h3>In-App Bug Reporter (preferred!)</h3>
<div class="step"><span class="step-num">1</span><p>Tap the <strong>bug icon 🐛</strong> in the header bar</p></div>
<div class="step"><span class="step-num">2</span><p>Enter your <strong>name</strong> (saved for next time)</p></div>
<div class="step"><span class="step-num">3</span><p>Describe the bug — what happened vs what you expected</p></div>
<div class="step"><span class="step-num">4</span><p>Hit <strong>Submit</strong> — the app automatically captures a screenshot and your current app state (dice cup, settings, etc.)</p></div>

<div class="card">
    <div class="card-title">What gets captured automatically:</div>
    <ul>
        <li>Screenshot of the current screen</li>
        <li>Your complete cup configuration (which dice, modifiers, etc.)</li>
        <li>Current theme and settings</li>
        <li>Last roll results</li>
        <li>Browser/device info</li>
    </ul>
    <p style="font-size:13px;color:var(--text-muted);margin:8px 0 0">This means I can reproduce your exact state — super helpful for debugging!</p>
</div>

<h3>What makes a great bug report:</h3>
<ul>
    <li><strong>Steps to reproduce</strong> — "I added 4d6, turned on exploding, and rolled. The explosion showed 6+6+3 but the total said 9 instead of 15"</li>
    <li><strong>Expected vs actual</strong> — "I expected X but got Y"</li>
    <li><strong>Consistency</strong> — "Happens every time" vs "happened once"</li>
    <li><strong>Device/browser</strong> — The auto-capture handles this, but mention it if filing manually</li>
</ul>

<h3>View all bug reports:</h3>
<p>Visit <a href="/dice/bugs" style="color:var(--accent)">/dice/bugs</a> to see all submitted reports, their status (open/fixed/wontfix), and any notes.</p>

<div class="warn">Please don't spam the bug reporter — there's a rate limit of 5 reports per short period.</div>

<hr>

<h2 id="checklist">17. Tester Checklist</h2>
<p>Here are specific things to test. Try each one in <strong>both Free and Premium modes</strong>:</p>

<div class="card">
    <div class="card-title">🎯 Core Rolling</div>
    <ul>
        <li>Add each die type (d4 through d100) and roll — are results in the correct range?</li>
        <li>Add multiple of the same die (e.g. 5d6) — do count badges show correctly?</li>
        <li>Coin flip — does it show HEADS/TAILS?</li>
        <li>DX custom die — try d3, d7, d30, d100</li>
        <li>Roll with no dice in cup — should be prevented or show a message</li>
    </ul>
</div>

<div class="card">
    <div class="card-title">🔧 Modifiers</div>
    <ul>
        <li>Exploding dice — roll d6 with exploding many times, verify chains add up correctly</li>
        <li>4d6 drop lowest — verify 3 dice are summed, lowest is shown in strikethrough</li>
        <li>2d20 keep highest — verify only the higher d20 counts</li>
        <li>Floor/Cap — set a floor of 10 on 2d6, verify results are never below 10</li>
        <li>Success counting — 10d6 count ≥5, verify the count is correct</li>
        <li>Flat modifiers — 1d20+5, verify the +5 is applied to the total</li>
        <li>Combine multiple modifiers — exploding + drop lowest together</li>
    </ul>
</div>

<div class="card">
    <div class="card-title">💾 Presets &amp; Packs</div>
    <ul>
        <li>Save a preset — does it appear in the chips?</li>
        <li>Load a preset — does the cup restore correctly?</li>
        <li>Hit the 5-preset limit in Free mode — does it block the 6th?</li>
        <li>Rename and delete presets</li>
        <li>Install a Game Pack and use its presets</li>
        <li>Uninstall a pack — are its presets removed?</li>
        <li>Search the pack catalog</li>
    </ul>
</div>

<div class="card">
    <div class="card-title">📱 UI &amp; Interaction</div>
    <ul>
        <li>Cup lock — lock it, verify dice buttons hide, verify you can still roll</li>
        <li>Theme switching — try each theme, check nothing looks broken</li>
        <li>Sound toggle — mute/unmute, verify persistence after refresh</li>
        <li>History navigation — back/forward arrows, verify results load correctly</li>
        <li>Share button — does it copy/share the roll?</li>
        <li>Probability chart — does it update when you change the cup?</li>
        <li>Long-press a die for selection (Premium)</li>
        <li>Formula bar — type a formula and roll (Premium)</li>
    </ul>
</div>

<div class="card">
    <div class="card-title">🐛 Edge Cases to Poke At</div>
    <ul>
        <li>Roll 100d6 — does it handle large pools?</li>
        <li>Exploding dice with very high explosion chains — does it eventually stop?</li>
        <li>Extremely long formulas in the formula bar</li>
        <li>Rapidly tapping roll many times</li>
        <li>Switching presets while results are animating</li>
        <li>Using the app on a very small screen / landscape mode</li>
        <li>Closing and reopening — does state persist correctly?</li>
        <li>Custom dice with 1 side or very many sides</li>
    </ul>
</div>

<div class="card">
    <div class="card-title">🎮 Game Pack Spot Checks</div>
    <ul>
        <li><strong>D&amp;D 5e</strong> — Roll "4d6 drop lowest" and "advantage" presets, verify correct behavior</li>
        <li><strong>FATE</strong> — Roll 4dF, verify results range from -4 to +4</li>
        <li><strong>Shadowrun</strong> — Roll a big d6 pool with success counting, verify hit counts</li>
        <li><strong>King of Tokyo</strong> — Verify custom face dice show symbol names, not numbers</li>
        <li><strong>DCC</strong> — Verify unusual dice (d3, d5, d7, d14, d16, d24, d30) work correctly</li>
    </ul>
</div>

<hr>
<p style="text-align:center;color:var(--text-muted);font-size:13px;margin-top:24px">Thanks for testing! Every bug you find makes Dice Vault better. 🎲</p>
</div>
""")


# ---------------------------------------------------------------------------
# Page builders
# ---------------------------------------------------------------------------


def build_board_games_list_page(conn):
    games = get_all_board_games(conn)

    if games:
        def _card(g):
            sw = g['shrink_wrapped'] == 1
            img = (f'<img src="{h(g["image_url"])}" alt="{h(g["name"])}"'
                   ' style="width:100%;height:100%;object-fit:cover;display:block;">'
                   if g["image_url"] else '')
            sweep = '<div class="shrink-sweep"></div>' if sw else ''
            hawaii = ('<div style="position:absolute;top:4px;left:4px;width:22px;height:22px;'
                      'background:rgba(255,210,50,0.9);border-radius:50%;display:flex;'
                      'align-items:center;justify-content:center;font-size:13px;'
                      'line-height:1;z-index:1;">🌴</div>'
                      if g['played_in_hawaii'] == 1 else '')
            sale = ('<div style="position:absolute;top:4px;right:4px;width:22px;height:22px;'
                    'background:rgba(34,139,34,0.9);border-radius:50%;display:flex;'
                    'align-items:center;justify-content:center;font-size:13px;font-weight:700;'
                    'color:#fff;line-height:1;z-index:1;">$</div>'
                    if g['for_sale'] == 1 else '')
            price_div = (f'<div class="price-tag" data-gid="{g["id"]}"'
                         ' style="display:none;font-size:10px;font-weight:700;'
                         'color:#228b22;text-align:center;line-height:1.2;'
                         'padding:2px 0 0;"></div>' if g['for_sale'] == 1 else '')
            return (f'<a href="/board-games/{g["id"]}" data-coop="{g["cooperative"]}" data-solo="{g["solo"]}" data-shrink="{g["shrink_wrapped"]}" data-hawaii="{g["played_in_hawaii"]}" data-sale="{g["for_sale"]}" data-name="{h(g["name"])}"'
                    ' style="text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:6px;">'
                    '<div style="width:100%;aspect-ratio:1/1.1;border-radius:10px;overflow:hidden;background:#f0e0ea;'
                    'box-shadow:0 2px 8px rgba(0,0,0,0.15);position:relative;">'
                    f'{img}{hawaii}{sale}{sweep}</div>'
                    f'{price_div}'
                    f'<span style="font-size:11px;font-weight:600;color:#1c1c1e;text-align:center;'
                    'line-height:1.3;max-width:100%;overflow:hidden;'
                    'display:-webkit-box;-webkit-line-clamp:2;'
                    f'-webkit-box-orient:vertical;">{h(g["name"])}</span></a>')
        cards_html = "".join(_card(g) for g in games)
        grid_html = """<style>@keyframes shineSweep{0%{transform:translateX(-100%) rotate(25deg)}100%{transform:translateX(200%) rotate(25deg)}}.shrink-sweep{position:absolute;top:-50%;left:0;width:60%;height:200%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent);transform:translateX(-100%) rotate(25deg);animation:shineSweep 2.5s ease-in-out infinite;pointer-events:none}</style>""" + f"""<div id="game-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));
                                    gap:14px;padding:14px 16px;">{cards_html}</div>"""
    else:
        grid_html = '<div style="padding:16px 20px;color:#8e8e93;font-size:15px;">No games yet.</div>'

    game_count = len(games)

    body = f"""
    <div id="bg-header" style="position:fixed;top:0;left:0;right:0;z-index:40;
                                background:#fdf0f5;box-shadow:0 1px 0 #f0c4d8;">
    <div class="page-header">
        Hawaii Board Games
        <a href="/">Home</a>
    </div>
    <div style="padding:10px 16px 0;font-size:13px;color:#8e8e93;font-weight:500;">
        <span id="game-count">{game_count} game{'s' if game_count != 1 else ''}</span>
    </div>
    <div style="padding:8px 16px 4px;display:flex;gap:5px;align-items:center;">
        <button id="filter-all" onclick="resetFilters()"
                style="padding:6px 10px;border:none;border-radius:20px;font-size:13px;
                       font-weight:600;cursor:pointer;background:#e91e8c;color:#fff;">All</button>
        <button id="filter-coop" onclick="toggleFilter('coop')"
                style="padding:6px 10px;border:none;border-radius:20px;font-size:13px;
                       font-weight:600;cursor:pointer;background:#f0f0f0;color:#1c1c1e;">Coop</button>
        <button id="filter-solo" onclick="toggleFilter('solo')"
                style="padding:6px 10px;border:none;border-radius:20px;font-size:13px;
                       font-weight:600;cursor:pointer;background:#f0f0f0;color:#1c1c1e;">Solo</button>
        <button id="filter-shrink" onclick="toggleFilter('shrink')"
                style="padding:6px 10px;border:none;border-radius:20px;font-size:13px;
                       font-weight:600;cursor:pointer;background:#f0f0f0;color:#1c1c1e;">Shrink</button>
        <button id="filter-hawaii" onclick="toggleFilter('hawaii')"
                style="padding:6px 10px;border:none;border-radius:20px;font-size:13px;
                       font-weight:600;cursor:pointer;background:#f0f0f0;color:#1c1c1e;">Hawaii</button>
        <button id="filter-sale" onclick="toggleFilter('sale')"
                style="padding:6px 10px;border:none;border-radius:20px;font-size:13px;
                       font-weight:600;cursor:pointer;background:#f0f0f0;color:#1c1c1e;">Sale</button>
    </div>
    <div style="padding:4px 16px 8px;display:flex;gap:8px;align-items:center;">
        <div style="flex:1;position:relative;min-width:0;">
            <input type="text" id="name-filter" placeholder="Search…"
                   oninput="applyNameFilter()"
                   style="width:100%;box-sizing:border-box;padding:7px 30px 7px 12px;
                          border-radius:20px;border:1.5px solid #ddd;font-size:14px;outline:none;">
            <button id="name-filter-clear" onclick="clearNameFilter()"
                    style="display:none;position:absolute;right:7px;top:50%;
                           transform:translateY(-50%);width:18px;height:18px;
                           border-radius:50%;border:none;background:#c7c7cc;
                           color:#fff;font-size:12px;cursor:pointer;padding:0;
                           line-height:18px;text-align:center;">&times;</button>
        </div>
        <button id="add-toggle" onclick="toggleAddForm()"
                style="padding:7px 16px;border:none;border-radius:20px;font-size:14px;
                       font-weight:600;cursor:pointer;background:#f0f0f0;color:#1c1c1e;
                       white-space:nowrap;">+ Add</button>
    </div>
    <div id="sale-summary"
         style="display:none;text-align:center;padding:8px 16px;font-size:13px;
                font-weight:600;color:#228b22;border-top:1px solid #e0e0e0;"></div>
    <div id="add-form-container"
         style="overflow:hidden;max-height:0;transition:max-height 0.3s ease;">
        <div style="padding:6px 16px 8px;">
            <input type="text" id="bgg-query" placeholder="Search BGG catalog…"
                   autocomplete="off"
                   style="width:100%;box-sizing:border-box;padding:10px 14px;
                          border-radius:10px;border:1.5px solid #ddd;
                          font-size:16px;outline:none;">
            <input type="text" id="bgg-url" placeholder="or paste BGG URL…"
                   autocomplete="off"
                   style="width:100%;box-sizing:border-box;padding:10px 14px;margin-top:8px;
                          border-radius:10px;border:1.5px solid #ddd;
                          font-size:16px;outline:none;">
            <div id="bgg-status" style="margin-top:8px;font-size:14px;color:#8e8e93;min-height:18px;"></div>
        </div>
    </div>
    </div>
    <div id="bgg-dropdown"
         style="display:none;position:fixed;background:#fff;border:1.5px solid #ddd;
                border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.12);
                z-index:1000;overflow-y:auto;max-height:400px;"></div>
    {grid_html}
    <div id="az-slider" style="position:fixed;right:0;top:140px;bottom:20px;
        z-index:50;display:flex;flex-direction:column;align-items:center;
        justify-content:space-between;padding:4px 0;touch-action:none;"></div>
    <div id="az-indicator" style="position:fixed;left:50%;top:50%;
        transform:translate(-50%,-50%);width:72px;height:72px;
        border-radius:16px;background:rgba(0,0,0,0.72);color:#fff;
        font-size:44px;font-weight:700;display:none;
        align-items:center;justify-content:center;
        z-index:200;pointer-events:none;letter-spacing:-1px;"></div>"""

    extra_js = """
// 0 = off, 1 = yes (must have), 2 = no (must not have)
var _filterState = {coop: 0, solo: 0, shrink: 0, hawaii: 0, sale: 0};
function _syncAllBtn() {
    var allOff = ['coop','solo','shrink','hawaii','sale'].every(function(k) { return _filterState[k] === 0; });
    var allBtn = document.getElementById('filter-all');
    allBtn.style.background = allOff ? '#e91e8c' : '#f0f0f0';
    allBtn.style.color      = allOff ? '#fff'    : '#1c1c1e';
}
function _syncBtn(key) {
    var state = _filterState[key];
    var btn = document.getElementById('filter-' + key);
    if (state === 0) { btn.style.background = '#f0f0f0'; btn.style.color = '#1c1c1e'; btn.style.textDecoration = 'none'; }
    if (state === 1) { btn.style.background = '#e91e8c'; btn.style.color = '#fff';    btn.style.textDecoration = 'none'; }
    if (state === 2) { btn.style.background = '#3a3a3c'; btn.style.color = '#fff';    btn.style.textDecoration = 'line-through'; }
    _syncAllBtn();
}
function toggleFilter(key) {
    _filterState[key] = (_filterState[key] + 1) % 3;
    _syncBtn(key);
    applyFilters();
    _saveState();
    updateSaleSummary();
}
function resetFilters() {
    ['coop','solo','shrink','hawaii','sale'].forEach(function(k) { _filterState[k] = 0; _syncBtn(k); });
    applyFilters();
    _saveState();
    updateSaleSummary();
}
function applyFilters() {
    var raw = document.getElementById('name-filter').value;
    var re = null;
    if (raw) { try { re = new RegExp(raw, 'i'); } catch(e) {} }
    var cards = document.querySelectorAll('#game-grid > a');
    var visible = 0;
    cards.forEach(function(card) {
        var ok = true;
        ['coop','solo','shrink','hawaii','sale'].forEach(function(key) {
            var state = _filterState[key];
            if (state === 0) return;
            var has = card.dataset[key] === '1';
            if (state === 1 && !has) ok = false;
            if (state === 2 &&  has) ok = false;
        });
        var nameOk = !re || re.test(card.dataset.name || '');
        var show = ok && nameOk;
        card.style.display = show ? 'flex' : 'none';
        if (show) visible++;
    });
    var countEl = document.getElementById('game-count');
    if (countEl) countEl.textContent = visible + (visible === 1 ? ' game' : ' games');
}
function applyNameFilter() {
    var val = document.getElementById('name-filter').value;
    document.getElementById('name-filter-clear').style.display = val ? 'block' : 'none';
    applyFilters();
    _saveState();
}
function clearNameFilter() {
    document.getElementById('name-filter').value = '';
    document.getElementById('name-filter-clear').style.display = 'none';
    applyFilters();
    _saveState();
}
function _saveState() {
    try {
        sessionStorage.setItem('bgFilters', JSON.stringify(_filterState));
        sessionStorage.setItem('bgNameFilter', document.getElementById('name-filter').value);
    } catch(e) {}
}
function _restoreState() {
    try {
        var saved = sessionStorage.getItem('bgFilters');
        if (saved) {
            var s = JSON.parse(saved);
            ['coop','solo','shrink','hawaii','sale'].forEach(function(k) {
                if (s[k] !== undefined) _filterState[k] = s[k];
                _syncBtn(k);
            });
        }
        var name = sessionStorage.getItem('bgNameFilter');
        if (name) {
            var nf = document.getElementById('name-filter');
            nf.value = name;
            document.getElementById('name-filter-clear').style.display = name ? 'block' : 'none';
        }
        var scroll = sessionStorage.getItem('bgScroll');
        if (scroll) {
            sessionStorage.removeItem('bgScroll');
            window.scrollTo(0, parseInt(scroll));
        }
    } catch(e) {}
}
// Save scroll position when navigating to a game
document.querySelectorAll('#game-grid > a').forEach(function(card) {
    card.addEventListener('click', function() {
        try { sessionStorage.setItem('bgScroll', String(window.scrollY)); } catch(e) {}
    });
});
_restoreState();
applyFilters();
updateSaleSummary();
function toggleAddForm() {
    var container = document.getElementById('add-form-container');
    var btn = document.getElementById('add-toggle');
    var open = container.style.maxHeight !== '0px' && container.style.maxHeight !== '';
    if (open) {
        container.style.maxHeight = '0';
        btn.style.background = '#f0f0f0';
        btn.style.color = '#1c1c1e';
        document.getElementById('bgg-status').textContent = '';
        document.getElementById('bgg-url').value = '';
        hideDrop();
    } else {
        container.style.maxHeight = '175px';
        btn.style.background = '#e91e8c';
        btn.style.color = '#fff';
        setTimeout(function() { document.getElementById('bgg-query').focus(); }, 300);
    }
}
var _searchTimer = null;
var _selectedBggId = null;
function onQueryInput() {
    _selectedBggId = null;
    var q = document.getElementById('bgg-query').value.trim();
    clearTimeout(_searchTimer);
    if (!q) { hideDrop(); return; }
    _searchTimer = setTimeout(function() { fetchSuggestions(q); }, 200);
}
function fetchSuggestions(q) {
    fetch('/board-games/catalog-search?q=' + encodeURIComponent(q))
        .then(function(r) { return r.json(); })
        .then(function(results) { showDrop(results); })
        .catch(function() { hideDrop(); });
}
function _esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function showDrop(results) {
    var drop = document.getElementById('bgg-dropdown');
    if (!results || !results.length) { hideDrop(); return; }
    var rect = document.getElementById('bgg-query').getBoundingClientRect();
    drop.style.top  = (rect.bottom + 4) + 'px';
    drop.style.left = rect.left + 'px';
    drop.style.width = rect.width + 'px';
    drop.innerHTML = results.map(function(r) {
        var year = r.year ? ' <span style="color:#8e8e93;font-size:13px;">(' + r.year + ')</span>' : '';
        return '<div style="padding:10px 14px;cursor:pointer;font-size:15px;border-bottom:1px solid #f5f5f5;line-height:1.3;"'
             + ' data-bgg-id="' + r.bgg_id + '"'
             + ' data-name="' + escapeAttr(r.name) + '">'
             + _esc(r.name) + year + '</div>';
    }).join('');
    drop.querySelectorAll('div').forEach(function(el) {
        el.addEventListener('mouseover', function() { el.style.background = '#f5f5f7'; });
        el.addEventListener('mouseout',  function() { el.style.background = ''; });
        el.addEventListener('mousedown', function() { selectGame(el); });
    });
    drop.style.display = 'block';
}
function hideDrop() {
    var drop = document.getElementById('bgg-dropdown');
    if (drop) drop.style.display = 'none';
}
function selectGame(el) {
    _selectedBggId = parseInt(el.dataset.bggId);
    document.getElementById('bgg-query').value = el.dataset.name;
    hideDrop();
    addGame();
}
function addGame() {
    var query = document.getElementById('bgg-query').value.trim();
    var url = document.getElementById('bgg-url').value.trim();
    if (!query && !url) return;
    var statusEl = document.getElementById('bgg-status');
    statusEl.style.color = '#8e8e93';
    statusEl.textContent = 'Adding\u2026';
    var payload = _selectedBggId ? {bgg_id: String(_selectedBggId)} : {query: url || query};
    post('/board-games/add', payload).then(function(r) {
        return r.json();
    }).then(function(data) {
        if (data.ok) {
            window.location.href = '/board-games/' + data.id;
        } else {
            statusEl.style.color = '#c0392b';
            statusEl.textContent = data.error || 'Game not found on BGG.';
            _selectedBggId = null;
        }
    }).catch(function() {
        statusEl.style.color = '#c0392b';
        statusEl.textContent = 'Network error \u2014 please try again.';
        _selectedBggId = null;
    });
}
document.getElementById('bgg-query').addEventListener('input', onQueryInput);
document.getElementById('bgg-query').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { hideDrop(); addGame(); }
    if (e.key === 'Escape') { hideDrop(); }
});
document.getElementById('bgg-url').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { addGame(); }
});
document.addEventListener('click', function(e) {
    var q = document.getElementById('bgg-query');
    var d = document.getElementById('bgg-dropdown');
    if (q && d && !q.contains(e.target) && !d.contains(e.target)) hideDrop();
});
(function() {
    var LETTERS = ['#','A','B','C','D','E','F','G','H','I','J','K','L','M',
                   'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    var slider = document.getElementById('az-slider');
    var indic  = document.getElementById('az-indicator');
    if (!slider || !indic) return;

    function cardLetter(name) {
        var n = (name || '').replace(/^The\\s+/i, '').replace(/^A\\s+/i, '');
        var c = n.charAt(0).toUpperCase();
        return /[A-Z]/.test(c) ? c : '#';
    }

    LETTERS.forEach(function(letter) {
        var el = document.createElement('div');
        el.textContent = letter;
        el.dataset.letter = letter;
        el.style.cssText = 'font-size:10px;font-weight:700;padding:0 8px;line-height:1;'
            + 'color:#ddd;user-select:none;-webkit-user-select:none;'
            + 'min-width:24px;text-align:center;cursor:pointer;';
        slider.appendChild(el);
    });

    function updateSlider() {
        var present = {};
        document.querySelectorAll('#game-grid > a').forEach(function(c) {
            if (c.style.display !== 'none')
                present[cardLetter(c.dataset.name || '')] = true;
        });
        LETTERS.forEach(function(l) {
            var el = slider.querySelector('[data-letter="' + l + '"]');
            if (el) el.style.color = present[l] ? '#e91e8c' : '#ddd';
        });
    }

    function scrollToLetter(letter, smooth) {
        var cards = document.querySelectorAll('#game-grid > a');
        for (var i = 0; i < cards.length; i++) {
            var c = cards[i];
            if (c.style.display !== 'none' && cardLetter(c.dataset.name || '') === letter) {
                var hdrEl = document.getElementById('bg-header');
                var hdrH = hdrEl ? hdrEl.offsetHeight : 0;
                var top = c.getBoundingClientRect().top + window.scrollY - hdrH - 8;
                if (smooth) {
                    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
                } else {
                    window.scrollTo(0, Math.max(0, top));
                }
                return;
            }
        }
    }

    function letterAtY(y) {
        var els = slider.querySelectorAll('[data-letter]');
        for (var i = 0; i < els.length; i++) {
            var r = els[i].getBoundingClientRect();
            if (y >= r.top && y <= r.bottom) return els[i].dataset.letter;
        }
        if (els.length) {
            if (y < els[0].getBoundingClientRect().top) return els[0].dataset.letter;
            if (y > els[els.length - 1].getBoundingClientRect().bottom)
                return els[els.length - 1].dataset.letter;
        }
        return null;
    }

    var _indTimer = null;
    function showIndicator(letter) {
        indic.textContent = letter;
        indic.style.display = 'flex';
        clearTimeout(_indTimer);
    }
    function hideIndicator() {
        clearTimeout(_indTimer);
        _indTimer = setTimeout(function() { indic.style.display = 'none'; }, 500);
    }

    var _lastLetter = null;
    function handleY(y) {
        var letter = letterAtY(y);
        if (letter && letter !== _lastLetter) {
            _lastLetter = letter;
            showIndicator(letter);
            scrollToLetter(letter, false);
        }
    }

    slider.addEventListener('touchstart', function(e) {
        e.preventDefault();
        _lastLetter = null;
        handleY(e.touches[0].clientY);
    }, { passive: false });
    slider.addEventListener('touchmove', function(e) {
        e.preventDefault();
        handleY(e.touches[0].clientY);
    }, { passive: false });
    slider.addEventListener('touchend', function() {
        _lastLetter = null;
        hideIndicator();
    }, { passive: true });
    slider.addEventListener('click', function(e) {
        var el = e.target.closest('[data-letter]');
        if (el) {
            showIndicator(el.dataset.letter);
            scrollToLetter(el.dataset.letter, true);
            hideIndicator();
        }
    });

    var _orig = applyFilters;
    applyFilters = function() { _orig(); updateSlider(); };

    var grid = document.getElementById('game-grid');
    if (grid) grid.style.paddingRight = '32px';

    updateSlider();
})();

(function() {
    var hdr = document.getElementById('bg-header');
    var grid = document.getElementById('game-grid');
    var slider = document.getElementById('az-slider');
    if (!hdr) return;
    function syncHeaderHeight() {
        var h = hdr.offsetHeight;
        if (grid) grid.style.paddingTop = (h + 12) + 'px';
        if (slider) slider.style.top = (h + 8) + 'px';
    }
    syncHeaderHeight();
    if (window.ResizeObserver) {
        new ResizeObserver(syncHeaderHeight).observe(hdr);
    }
})();
// Fetch prices for for-sale games
window._salePrices = {};
function updateSaleSummary() {
    var el = document.getElementById('sale-summary');
    if (_filterState.sale !== 1) { el.style.display = 'none'; return; }
    var totalLow = 0, totalHigh = 0, totalNkCash = 0, totalNkCredit = 0, count = 0;
    var keys = Object.keys(window._salePrices);
    for (var i = 0; i < keys.length; i++) {
        var p = window._salePrices[keys[i]];
        totalLow += p.low; totalHigh += p.high;
        var cashRate = p.sw ? 0.30 : 0.25;
        var creditRate = p.sw ? 0.38 : 0.30;
        totalNkCash += p.low * cashRate;
        totalNkCredit += p.low * creditRate;
        count++;
    }
    if (count === 0) { el.style.display = 'none'; return; }
    el.innerHTML = 'BGO Total: $' + totalLow.toFixed(2) + ' (low) \u2013 $' + totalHigh.toFixed(2) + ' (high) \u00b7 ' + count + (count === 1 ? ' game' : ' games') +
        '<br>NK Est Total: ~$' + totalNkCash.toFixed(2) + ' cash \u00b7 ~$' + totalNkCredit.toFixed(2) + ' credit' +
        '<br><a href="/board-games/nk-quote" target="_blank" style="display:inline-block;margin-top:6px;padding:5px 14px;border-radius:16px;background:#228b22;color:#fff;font-size:12px;font-weight:600;text-decoration:none;">Get NK Quote</a>';
    el.style.display = 'block';
}
fetch('/api/board-game-prices').then(function(r){return r.json()}).then(function(prices){
    window._salePrices = prices;
    document.querySelectorAll('.price-tag').forEach(function(el){
        var gid = el.getAttribute('data-gid');
        var p = prices[gid];
        if(p){
            var range = p.low === p.high ? '$' + p.low.toFixed(2) : '$' + p.low.toFixed(2) + ' \u2013 $' + p.high.toFixed(2);
            var bgoLink = p.key ? '<a href="https://www.boardgameoracle.com/boardgame/price/' + p.key + '/' + p.slug + '" target="_blank" rel="noopener" style="color:#228b22;text-decoration:underline;">BG Oracle</a>: ' : '';
            var cashRate = p.sw ? 0.30 : 0.25;
            var creditRate = p.sw ? 0.38 : 0.30;
            var nkCash = (p.low * cashRate).toFixed(2);
            var nkCredit = (p.low * creditRate).toFixed(2);
            var nkLine = '<div style="color:#666;font-size:9px;font-weight:600;">NK Est: ~$' + nkCash + ' cash \u00b7 ~$' + nkCredit + ' credit</div>';
            el.innerHTML = '<div>' + bgoLink + range + '</div>' + nkLine;
            el.style.display = 'block';
        }
    });
    updateSaleSummary();
}).catch(function(){});
"""
    return html_page("Hawaii Board Games", body, extra_js=extra_js)


def build_nk_quote_page(conn):
    games = conn.execute(
        f"SELECT name, shrink_wrapped FROM board_games WHERE for_sale = 1 ORDER BY {_BG_SORT}"
    ).fetchall()
    lines = []
    for g in games:
        cond = "SW" if g["shrink_wrapped"] else "NM"
        lines.append(f"1x {g['name']} - {cond}")
    quote_text = "\n".join(lines)
    body = f"""
    <div style="max-width:600px;margin:20px auto;padding:0 16px;">
        <a href="/board-games" style="color:#e91e8c;text-decoration:none;font-size:14px;">&lsaquo; Board Games</a>
        <h2 style="margin:12px 0 4px;">Noble Knight Quote</h2>
        <p style="color:#8e8e93;font-size:13px;margin:0 0 12px;">{len(lines)} game{'' if len(lines) == 1 else 's'} &middot; paste into email to <a href="mailto:trades@nobleknight.com" style="color:#228b22;">trades@nobleknight.com</a></p>
        <button onclick="navigator.clipboard.writeText(document.getElementById('quote-text').textContent).then(function(){{var b=event.target;b.textContent='Copied!';setTimeout(function(){{b.textContent='Copy to Clipboard'}},1500)}})"
                style="padding:8px 18px;border:none;border-radius:20px;background:#228b22;color:#fff;
                       font-size:14px;font-weight:600;cursor:pointer;margin-bottom:12px;">Copy to Clipboard</button>
        <pre id="quote-text" style="background:#f5f5f5;padding:16px;border-radius:10px;
             font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word;
             border:1px solid #e0e0e0;">{h(quote_text)}</pre>
    </div>"""
    return html_page("NK Quote", body)


def build_board_game_detail_page(conn, game_id):
    g = get_board_game(conn, game_id)
    if not g:
        return None

    # Find previous and next games alphabetically
    all_ids = [row[0] for row in conn.execute(
        f"SELECT id FROM board_games ORDER BY {_BG_SORT}").fetchall()]
    cur_pos  = all_ids.index(game_id) if game_id in all_ids else -1
    prev_id  = all_ids[cur_pos - 1] if cur_pos > 0 else None
    next_id  = all_ids[cur_pos + 1] if cur_pos >= 0 and cur_pos < len(all_ids) - 1 else None

    price_html = f"""
        <div id="detail-price" data-gid="{g['id']}" style="display:none;text-align:center;
             padding:0 20px 12px;font-size:15px;font-weight:700;color:#228b22;"></div>"""

    if g["image_url"]:
        image_html = f"""
        <div style="text-align:center;padding:0 20px 16px;">
            <img src="{h(g['image_url'])}" alt="{h(g['name'])}"
                 style="max-width:240px;width:100%;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.15);">
        </div>{price_html}"""
    else:
        image_html = """
        <div style="margin:0 20px 16px;background:#fff;border-radius:12px;
                    padding:16px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
            <div style="font-size:13px;font-weight:600;color:#8e8e93;
                        text-transform:uppercase;letter-spacing:0.5px;
                        margin-bottom:12px;">Add Image</div>
            <div style="display:flex;gap:8px;align-items:center;">
                <input type="url" id="img-url" placeholder="Paste image URL\u2026"
                       style="flex:1;padding:10px 12px;border:1.5px solid #f0c4d8;
                              border-radius:10px;font-size:15px;font-family:inherit;
                              outline:none;background:#fdf0f5;min-width:0;">
                <button id="img-btn"
                        style="padding:10px 16px;background:#e91e8c;color:#fff;
                               border:none;border-radius:10px;font-size:15px;
                               font-weight:600;cursor:pointer;white-space:nowrap;">Set</button>
            </div>
            <img id="img-preview" alt=""
                 style="display:none;margin-top:12px;max-width:100%;
                        border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12);">
            <div id="img-status" style="min-height:16px;font-size:13px;
                                        color:#8e8e93;margin-top:6px;"></div>
        </div>{price_html}"""

    bgg_link_html = ""
    if g["bgg_url"]:
        bgg_link_html = f"""
        <div style="padding:0 20px 16px;text-align:center;">
            <a href="{h(g['bgg_url'])}" target="_blank" rel="noopener"
               style="display:inline-block;padding:11px 24px;background:#f5f5f7;
                      border-radius:10px;color:#e91e8c;font-size:16px;font-weight:600;
                      text-decoration:none;">BGG Page &#8599;</a>
        </div>"""

    # Build stats rows
    def _stat_row(label, value):
        return (f'<div style="display:flex;justify-content:space-between;align-items:center;'
                f'padding:11px 0;border-bottom:1px solid #f0f0f0;">'
                f'<span style="color:#8e8e93;font-size:15px;">{label}</span>'
                f'<span style="color:#1c1c1e;font-size:15px;font-weight:600;">{value}</span>'
                f'</div>')

    stat_rows = []

    # Players
    if g["min_players"] or g["max_players"]:
        if g["min_players"] == g["max_players"]:
            player_str = str(g["min_players"])
        else:
            player_str = f"{g['min_players']}–{g['max_players']}"
        if g["best_players"]:
            player_str += f" <span style='color:#8e8e93;font-size:13px;font-weight:400;'>(best: {h(g['best_players'])})</span>"
        stat_rows.append(_stat_row("Players", player_str))

    # Playing time
    if g["min_playtime"] or g["max_playtime"]:
        if g["min_playtime"] and g["min_playtime"] != g["max_playtime"]:
            time_str = f"{g['min_playtime']}–{g['max_playtime']} min"
        else:
            time_str = f"{g['max_playtime'] or g['min_playtime']} min"
        stat_rows.append(_stat_row("Playing Time", time_str))

    # Weight
    if g["weight"]:
        stat_rows.append(_stat_row("Weight", f"{g['weight']:.2f} / 5"))

    # Shrink Wrapped (toggleable)
    def _toggle_row(label, field, value, game_id):
        checked = "Yes" if value else "No"
        color = "#34c759" if value else "#8e8e93"
        return (f'<div style="display:flex;justify-content:space-between;align-items:center;'
                f'padding:11px 0;border-bottom:1px solid #f0f0f0;">'
                f'<span style="color:#8e8e93;font-size:15px;">{label}</span>'
                f'<button data-field="{field}" data-id="{game_id}" data-value="{1 if value else 0}"'
                f' style="background:none;border:none;cursor:pointer;font-size:15px;font-weight:600;'
                f'color:{color};padding:0;font-family:inherit;" class="flag-toggle">{checked}</button>'
                f'</div>')

    gid = g["id"]
    stat_rows.append(_toggle_row("Cooperative",      "cooperative",      g["cooperative"],      gid))
    stat_rows.append(_toggle_row("Solo",             "solo",             g["solo"],             gid))
    stat_rows.append(_toggle_row("Shrink Wrapped",   "shrink_wrapped",   g["shrink_wrapped"],   gid))
    stat_rows.append(_toggle_row("Played in Hawaii", "played_in_hawaii", g["played_in_hawaii"], gid))
    stat_rows.append(_toggle_row("For Sale",         "for_sale",         g["for_sale"],         gid))

    stats_html = ""
    if stat_rows:
        stats_html = (f'<div style="margin:0 20px 20px;background:#fff;border-radius:12px;'
                      f'padding:0 14px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">'
                      + "".join(stat_rows)
                      + '</div>')

    body = f"""
    <div class="navbar">
        <a href="/board-games">&#8249; Board Games</a>
    </div>
    <div style="padding:24px 20px 12px;font-size:26px;font-weight:700;color:#1c1c1e;
                line-height:1.2;text-align:center;">{h(g['name'])}</div>
    {image_html}
    {stats_html}
    {bgg_link_html}
    <div style="padding:0 20px 32px;text-align:center;">
        <button onclick="deleteGame({g['id']})"
                style="padding:11px 24px;background:#fff0f5;color:#c0392b;border:1.5px solid #e8a0b0;
                       border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;">Delete</button>
    </div>"""

    game_name_js = json.dumps(g["name"])  # safely JS-escaped, including quotes

    setimage_js = ""
    if not g["image_url"]:
        gid = g["id"]
        setimage_js = f"""
(function() {{
    var urlInput = document.getElementById('img-url');
    var btn      = document.getElementById('img-btn');
    var preview  = document.getElementById('img-preview');
    var status   = document.getElementById('img-status');
    urlInput.addEventListener('input', function() {{
        var url = urlInput.value.trim();
        if (!url) {{ preview.style.display = 'none'; status.textContent = ''; return; }}
        preview.style.display = 'block';
        preview.src = url;
    }});
    preview.addEventListener('error', function() {{
        preview.style.display = 'none';
        status.textContent = 'Could not load image from that URL';
        status.style.color = '#c0392b';
    }});
    preview.addEventListener('load', function() {{
        status.textContent = '';
    }});
    btn.addEventListener('click', function() {{
        var url = urlInput.value.trim();
        if (!url) return;
        btn.disabled = true;
        btn.textContent = 'Saving\u2026';
        post('/board-games/set-image', {{id: {gid}, image_url: url}})
            .then(function(r) {{ return r.json(); }})
            .then(function(data) {{
                if (data.ok) {{ window.location.reload(); }}
                else {{
                    status.textContent = data.error || 'Error saving';
                    status.style.color = '#c0392b';
                    btn.disabled = false;
                    btn.textContent = 'Set';
                }}
            }}).catch(function() {{
                status.textContent = 'Network error \u2014 try again';
                status.style.color = '#c0392b';
                btn.disabled = false;
                btn.textContent = 'Set';
            }});
    }});
}})();"""

    prev_js = f"/board-games/{prev_id}" if prev_id else "null"
    next_js = f"/board-games/{next_id}" if next_id else "null"

    extra_js = f"""
function deleteGame(id) {{
    if (!confirm('Remove ' + {game_name_js} + ' from your collection?')) return;
    post('/board-games/delete', {{id: id}}).then(function(data) {{
        window.location.href = '/board-games';
    }});
}}
{setimage_js}
(function() {{
    document.querySelectorAll('.flag-toggle').forEach(function(btn) {{
        btn.addEventListener('click', function() {{
            var field = btn.dataset.field;
            var id    = parseInt(btn.dataset.id);
            var newVal = btn.dataset.value === '1' ? 0 : 1;
            post('/board-games/set-flag', {{id: id, field: field, value: newVal}})
                .then(function(r) {{ return r.json(); }})
                .then(function(data) {{
                    if (data.ok) {{
                        btn.dataset.value = String(newVal);
                        btn.textContent   = newVal ? 'Yes' : 'No';
                        btn.style.color   = newVal ? '#34c759' : '#8e8e93';
                    }}
                }});
        }});
    }});
}})();
(function() {{
    var prevUrl = {prev_js if prev_js == "null" else f'"{prev_js}"'};
    var nextUrl = {next_js if next_js == "null" else f'"{next_js}"'};
    var startX = null, startY = null, dragging = false;

    var swipeDir = sessionStorage.getItem('swipeDir');
    if (swipeDir) {{
        sessionStorage.removeItem('swipeDir');
        var fromX = swipeDir === 'left' ? '40vw' : '-40vw';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.transition = 'none';
        document.body.style.transform = 'translateX(' + fromX + ')';
        requestAnimationFrame(function() {{
            requestAnimationFrame(function() {{
                document.body.style.transition = 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)';
                document.body.style.transform = 'translateX(0)';
                setTimeout(function() {{ document.documentElement.style.overflow = ''; }}, 300);
            }});
        }});
    }}

    document.addEventListener('touchstart', function(e) {{
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dragging = false;
        document.body.style.transition = 'none';
    }}, {{passive: true}});

    document.addEventListener('touchmove', function(e) {{
        if (startX === null) return;
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        if (!dragging && Math.abs(dy) > Math.abs(dx)) {{ startX = null; return; }}
        if (!dragging && (dx < 0 ? !nextUrl : !prevUrl)) return;
        dragging = true;
        e.preventDefault();
        document.body.style.transform = 'translateX(' + dx + 'px)';
    }}, {{passive: false}});

    document.addEventListener('touchend', function(e) {{
        if (!dragging || startX === null) return;
        var dx = e.changedTouches[0].clientX - startX;
        startX = null; dragging = false;
        var targetUrl = dx < -60 ? nextUrl : dx > 60 ? prevUrl : null;
        if (targetUrl) {{
            var offX = dx < 0 ? '-40vw' : '40vw';
            sessionStorage.setItem('swipeDir', dx < 0 ? 'left' : 'right');
            document.body.style.transition = 'transform 0.28s cubic-bezier(0.55,0,1,0.45)';
            document.body.style.transform = 'translateX(' + offX + ')';
            setTimeout(function() {{ window.location.href = targetUrl; }}, 260);
        }} else {{
            document.body.style.transition = 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)';
            document.body.style.transform = 'translateX(0)';
            setTimeout(function() {{ document.documentElement.style.overflow = ''; }}, 370);
        }}
    }}, {{passive: true}});
}})();
// Fetch price for detail page
(function(){{
    var el = document.getElementById('detail-price');
    if(!el) return;
    var gid = el.getAttribute('data-gid');
    fetch('/api/board-game-price/' + gid).then(function(r){{return r.json()}}).then(function(p){{
        if(p && p.low){{
            var range = p.low === p.high ? '$' + p.low.toFixed(2) : '$' + p.low.toFixed(2) + ' \u2013 $' + p.high.toFixed(2);
            var bgoLink = p.key ? '<a href="https://www.boardgameoracle.com/boardgame/price/' + p.key + '/' + p.slug + '" target="_blank" rel="noopener" style="color:#228b22;text-decoration:underline;">BG Oracle</a>: ' : '';
            el.innerHTML = '<div>' + bgoLink + range + '</div>';
            el.style.display = 'block';
        }}
    }}).catch(function(){{}});
}})();
"""
    return html_page(h(g["name"]), body, extra_js=extra_js)


def build_gear_list_page(conn):
    items = get_all_music_gear(conn)

    if items:
        def _card(g):
            sw = g['shrink_wrapped'] == 1
            img = (f'<img src="{h(g["image_url"])}" alt="{h(g["name"])}"'
                   ' style="width:100%;height:100%;object-fit:cover;display:block;">'
                   if g["image_url"] else '')
            sweep = '<div class="shrink-sweep"></div>' if sw else ''
            sale = ('<div style="position:absolute;top:4px;right:4px;width:22px;height:22px;'
                    'background:rgba(34,139,34,0.9);border-radius:50%;display:flex;'
                    'align-items:center;justify-content:center;font-size:13px;font-weight:700;'
                    'color:#fff;line-height:1;z-index:1;">$</div>'
                    if g['for_sale'] == 1 else '')
            price_div = (f'<div class="gear-price-tag" data-gid="{g["id"]}"'
                         ' style="display:none;font-size:10px;font-weight:700;'
                         'color:#228b22;text-align:center;line-height:1.2;'
                         'padding:2px 0 0;"></div>' if g['for_sale'] == 1 else '')
            return (f'<a href="/music-gear/{g["id"]}" data-shrink="{g["shrink_wrapped"]}" data-sale="{g["for_sale"]}" data-name="{h(g["name"])}"'
                    ' style="text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:6px;">'
                    '<div style="width:100%;aspect-ratio:1/1.1;border-radius:10px;overflow:hidden;background:#e0e8f0;'
                    'box-shadow:0 2px 8px rgba(0,0,0,0.15);position:relative;">'
                    f'{img}{sale}{sweep}</div>'
                    f'{price_div}'
                    f'<span style="font-size:11px;font-weight:600;color:#1c1c1e;text-align:center;'
                    'line-height:1.3;max-width:100%;overflow:hidden;'
                    'display:-webkit-box;-webkit-line-clamp:2;'
                    f'-webkit-box-orient:vertical;">{h(g["name"])}</span></a>')
        cards_html = "".join(_card(g) for g in items)
        grid_html = """<style>@keyframes shineSweep{0%{transform:translateX(-100%) rotate(25deg)}100%{transform:translateX(200%) rotate(25deg)}}.shrink-sweep{position:absolute;top:-50%;left:0;width:60%;height:200%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent);transform:translateX(-100%) rotate(25deg);animation:shineSweep 2.5s ease-in-out infinite;pointer-events:none}</style>""" + f"""<div id="gear-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));
                                    gap:14px;padding:14px 16px;">{cards_html}</div>"""
    else:
        grid_html = '<div style="padding:16px 20px;color:#8e8e93;font-size:15px;">No gear yet.</div>'

    gear_count = len(items)

    body = f"""
    <div id="mg-header" style="position:fixed;top:0;left:0;right:0;z-index:40;
                                background:#f0f5fd;box-shadow:0 1px 0 #c4d8f0;">
    <div class="page-header">
        Music Gear
        <a href="/">Home</a>
    </div>
    <div style="padding:10px 16px 0;font-size:13px;color:#8e8e93;font-weight:500;">
        <span id="gear-count">{gear_count} item{'s' if gear_count != 1 else ''}</span>
    </div>
    <div style="padding:8px 16px 4px;display:flex;gap:5px;align-items:center;">
        <button id="filter-all" onclick="resetFilters()"
                style="padding:6px 10px;border:none;border-radius:20px;font-size:13px;
                       font-weight:600;cursor:pointer;background:#1e7be9;color:#fff;">All</button>
        <button id="filter-shrink" onclick="toggleFilter('shrink')"
                style="padding:6px 10px;border:none;border-radius:20px;font-size:13px;
                       font-weight:600;cursor:pointer;background:#f0f0f0;color:#1c1c1e;">Shrink</button>
        <button id="filter-sale" onclick="toggleFilter('sale')"
                style="padding:6px 10px;border:none;border-radius:20px;font-size:13px;
                       font-weight:600;cursor:pointer;background:#f0f0f0;color:#1c1c1e;">Sale</button>
    </div>
    <div style="padding:4px 16px 8px;display:flex;gap:8px;align-items:center;">
        <div style="flex:1;position:relative;min-width:0;">
            <input type="text" id="name-filter" placeholder="Search…"
                   oninput="applyNameFilter()"
                   style="width:100%;box-sizing:border-box;padding:7px 30px 7px 12px;
                          border-radius:20px;border:1.5px solid #ddd;font-size:14px;outline:none;">
            <button id="name-filter-clear" onclick="clearNameFilter()"
                    style="display:none;position:absolute;right:7px;top:50%;
                           transform:translateY(-50%);width:18px;height:18px;
                           border-radius:50%;border:none;background:#c7c7cc;
                           color:#fff;font-size:12px;cursor:pointer;padding:0;
                           line-height:18px;text-align:center;">&times;</button>
        </div>
        <button id="add-toggle" onclick="toggleAddForm()"
                style="padding:7px 16px;border:none;border-radius:20px;font-size:14px;
                       font-weight:600;cursor:pointer;background:#f0f0f0;color:#1c1c1e;
                       white-space:nowrap;">+ Add</button>
    </div>
    <div id="sale-summary"
         style="display:none;text-align:center;padding:8px 16px;font-size:13px;
                font-weight:600;color:#228b22;border-top:1px solid #e0e0e0;"></div>
    <div id="add-form-container"
         style="overflow:hidden;max-height:0;transition:max-height 0.3s ease;">
        <div style="padding:6px 16px 8px;">
            <input type="text" id="reverb-url" placeholder="Paste Reverb URL\u2026"
                   autocomplete="off"
                   style="width:100%;box-sizing:border-box;padding:10px 14px;
                          border-radius:10px;border:1.5px solid #ddd;
                          font-size:16px;outline:none;">
            <div id="add-status" style="margin-top:8px;font-size:14px;color:#8e8e93;min-height:18px;"></div>
        </div>
    </div>
    </div>
    {grid_html}
    <div id="az-slider" style="position:fixed;right:0;top:140px;bottom:20px;
        z-index:50;display:flex;flex-direction:column;align-items:center;
        justify-content:space-between;padding:4px 0;touch-action:none;"></div>
    <div id="az-indicator" style="position:fixed;left:50%;top:50%;
        transform:translate(-50%,-50%);width:72px;height:72px;
        border-radius:16px;background:rgba(0,0,0,0.72);color:#fff;
        font-size:44px;font-weight:700;display:none;
        align-items:center;justify-content:center;
        z-index:200;pointer-events:none;letter-spacing:-1px;"></div>"""

    extra_js = """
var _filterState = {shrink: 0, sale: 0};
function _syncAllBtn() {
    var allOff = ['shrink','sale'].every(function(k) { return _filterState[k] === 0; });
    var allBtn = document.getElementById('filter-all');
    allBtn.style.background = allOff ? '#1e7be9' : '#f0f0f0';
    allBtn.style.color      = allOff ? '#fff'    : '#1c1c1e';
}
function _syncBtn(key) {
    var state = _filterState[key];
    var btn = document.getElementById('filter-' + key);
    if (state === 0) { btn.style.background = '#f0f0f0'; btn.style.color = '#1c1c1e'; btn.style.textDecoration = 'none'; }
    if (state === 1) { btn.style.background = '#1e7be9'; btn.style.color = '#fff';    btn.style.textDecoration = 'none'; }
    if (state === 2) { btn.style.background = '#3a3a3c'; btn.style.color = '#fff';    btn.style.textDecoration = 'line-through'; }
    _syncAllBtn();
}
function toggleFilter(key) {
    _filterState[key] = (_filterState[key] + 1) % 3;
    _syncBtn(key);
    applyFilters();
    _saveState();
    updateSaleSummary();
}
function resetFilters() {
    ['shrink','sale'].forEach(function(k) { _filterState[k] = 0; _syncBtn(k); });
    applyFilters();
    _saveState();
    updateSaleSummary();
}
function applyFilters() {
    var raw = document.getElementById('name-filter').value;
    var re = null;
    if (raw) { try { re = new RegExp(raw, 'i'); } catch(e) {} }
    var cards = document.querySelectorAll('#gear-grid > a');
    var visible = 0;
    cards.forEach(function(card) {
        var ok = true;
        ['shrink','sale'].forEach(function(key) {
            var state = _filterState[key];
            if (state === 0) return;
            var has = card.dataset[key] === '1';
            if (state === 1 && !has) ok = false;
            if (state === 2 &&  has) ok = false;
        });
        var nameOk = !re || re.test(card.dataset.name || '');
        var show = ok && nameOk;
        card.style.display = show ? 'flex' : 'none';
        if (show) visible++;
    });
    var countEl = document.getElementById('gear-count');
    if (countEl) countEl.textContent = visible + (visible === 1 ? ' item' : ' items');
}
function applyNameFilter() {
    var val = document.getElementById('name-filter').value;
    document.getElementById('name-filter-clear').style.display = val ? 'block' : 'none';
    applyFilters();
    _saveState();
}
function clearNameFilter() {
    document.getElementById('name-filter').value = '';
    document.getElementById('name-filter-clear').style.display = 'none';
    applyFilters();
    _saveState();
}
function _saveState() {
    try {
        sessionStorage.setItem('mgFilters', JSON.stringify(_filterState));
        sessionStorage.setItem('mgNameFilter', document.getElementById('name-filter').value);
    } catch(e) {}
}
function _restoreState() {
    try {
        var saved = sessionStorage.getItem('mgFilters');
        if (saved) {
            var s = JSON.parse(saved);
            ['shrink','sale'].forEach(function(k) {
                if (s[k] !== undefined) _filterState[k] = s[k];
                _syncBtn(k);
            });
        }
        var name = sessionStorage.getItem('mgNameFilter');
        if (name) {
            var nf = document.getElementById('name-filter');
            nf.value = name;
            document.getElementById('name-filter-clear').style.display = name ? 'block' : 'none';
        }
        var scroll = sessionStorage.getItem('mgScroll');
        if (scroll) {
            sessionStorage.removeItem('mgScroll');
            window.scrollTo(0, parseInt(scroll));
        }
    } catch(e) {}
}
document.querySelectorAll('#gear-grid > a').forEach(function(card) {
    card.addEventListener('click', function() {
        try { sessionStorage.setItem('mgScroll', String(window.scrollY)); } catch(e) {}
    });
});
_restoreState();
applyFilters();
updateSaleSummary();
function toggleAddForm() {
    var container = document.getElementById('add-form-container');
    var btn = document.getElementById('add-toggle');
    var open = container.style.maxHeight !== '0px' && container.style.maxHeight !== '';
    if (open) {
        container.style.maxHeight = '0';
        btn.style.background = '#f0f0f0';
        btn.style.color = '#1c1c1e';
        document.getElementById('add-status').textContent = '';
        document.getElementById('reverb-url').value = '';
    } else {
        container.style.maxHeight = '120px';
        btn.style.background = '#1e7be9';
        btn.style.color = '#fff';
        setTimeout(function() { document.getElementById('reverb-url').focus(); }, 300);
    }
}
function addGear() {
    var url = document.getElementById('reverb-url').value.trim();
    if (!url) return;
    var statusEl = document.getElementById('add-status');
    statusEl.style.color = '#8e8e93';
    statusEl.textContent = 'Adding\u2026';
    post('/music-gear/add', {url: url}).then(function(r) {
        return r.json();
    }).then(function(data) {
        if (data.ok) {
            window.location.href = '/music-gear/' + data.id;
        } else {
            statusEl.style.color = '#c0392b';
            statusEl.textContent = data.error || 'Could not add gear.';
        }
    }).catch(function() {
        statusEl.style.color = '#c0392b';
        statusEl.textContent = 'Network error \u2014 please try again.';
    });
}
document.getElementById('reverb-url').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { addGear(); }
});
(function() {
    var LETTERS = ['#','A','B','C','D','E','F','G','H','I','J','K','L','M',
                   'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    var slider = document.getElementById('az-slider');
    var indic  = document.getElementById('az-indicator');
    if (!slider || !indic) return;

    function cardLetter(name) {
        var n = (name || '').replace(/^The\\s+/i, '').replace(/^A\\s+/i, '');
        var c = n.charAt(0).toUpperCase();
        return /[A-Z]/.test(c) ? c : '#';
    }

    LETTERS.forEach(function(letter) {
        var el = document.createElement('div');
        el.textContent = letter;
        el.dataset.letter = letter;
        el.style.cssText = 'font-size:10px;font-weight:700;padding:0 8px;line-height:1;'
            + 'color:#ddd;user-select:none;-webkit-user-select:none;'
            + 'min-width:24px;text-align:center;cursor:pointer;';
        slider.appendChild(el);
    });

    function updateSlider() {
        var present = {};
        document.querySelectorAll('#gear-grid > a').forEach(function(c) {
            if (c.style.display !== 'none')
                present[cardLetter(c.dataset.name || '')] = true;
        });
        LETTERS.forEach(function(l) {
            var el = slider.querySelector('[data-letter="' + l + '"]');
            if (el) el.style.color = present[l] ? '#1e7be9' : '#ddd';
        });
    }

    function scrollToLetter(letter, smooth) {
        var cards = document.querySelectorAll('#gear-grid > a');
        for (var i = 0; i < cards.length; i++) {
            var c = cards[i];
            if (c.style.display !== 'none' && cardLetter(c.dataset.name || '') === letter) {
                var hdrEl = document.getElementById('mg-header');
                var hdrH = hdrEl ? hdrEl.offsetHeight : 0;
                var top = c.getBoundingClientRect().top + window.scrollY - hdrH - 8;
                if (smooth) {
                    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
                } else {
                    window.scrollTo(0, Math.max(0, top));
                }
                return;
            }
        }
    }

    function letterAtY(y) {
        var els = slider.querySelectorAll('[data-letter]');
        for (var i = 0; i < els.length; i++) {
            var r = els[i].getBoundingClientRect();
            if (y >= r.top && y <= r.bottom) return els[i].dataset.letter;
        }
        if (els.length) {
            if (y < els[0].getBoundingClientRect().top) return els[0].dataset.letter;
            if (y > els[els.length - 1].getBoundingClientRect().bottom)
                return els[els.length - 1].dataset.letter;
        }
        return null;
    }

    var _indTimer = null;
    function showIndicator(letter) {
        indic.textContent = letter;
        indic.style.display = 'flex';
        clearTimeout(_indTimer);
    }
    function hideIndicator() {
        clearTimeout(_indTimer);
        _indTimer = setTimeout(function() { indic.style.display = 'none'; }, 500);
    }

    var _lastLetter = null;
    function handleY(y) {
        var letter = letterAtY(y);
        if (letter && letter !== _lastLetter) {
            _lastLetter = letter;
            showIndicator(letter);
            scrollToLetter(letter, false);
        }
    }

    slider.addEventListener('touchstart', function(e) {
        e.preventDefault();
        _lastLetter = null;
        handleY(e.touches[0].clientY);
    }, { passive: false });
    slider.addEventListener('touchmove', function(e) {
        e.preventDefault();
        handleY(e.touches[0].clientY);
    }, { passive: false });
    slider.addEventListener('touchend', function() {
        _lastLetter = null;
        hideIndicator();
    }, { passive: true });
    slider.addEventListener('click', function(e) {
        var el = e.target.closest('[data-letter]');
        if (el) {
            showIndicator(el.dataset.letter);
            scrollToLetter(el.dataset.letter, true);
            hideIndicator();
        }
    });

    var _orig = applyFilters;
    applyFilters = function() { _orig(); updateSlider(); };

    var grid = document.getElementById('gear-grid');
    if (grid) grid.style.paddingRight = '32px';

    updateSlider();
})();

(function() {
    var hdr = document.getElementById('mg-header');
    var grid = document.getElementById('gear-grid');
    var slider = document.getElementById('az-slider');
    if (!hdr) return;
    function syncHeaderHeight() {
        var h = hdr.offsetHeight;
        if (grid) grid.style.paddingTop = (h + 12) + 'px';
        if (slider) slider.style.top = (h + 8) + 'px';
    }
    syncHeaderHeight();
    if (window.ResizeObserver) {
        new ResizeObserver(syncHeaderHeight).observe(hdr);
    }
})();
window._gearPrices = {};
function updateSaleSummary() {
    var el = document.getElementById('sale-summary');
    if (_filterState.sale !== 1) { el.style.display = 'none'; return; }
    var totalLow = 0, totalHigh = 0, count = 0;
    var keys = Object.keys(window._gearPrices);
    for (var i = 0; i < keys.length; i++) {
        var p = window._gearPrices[keys[i]];
        totalLow += p.low; totalHigh += p.high;
        count++;
    }
    if (count === 0) { el.style.display = 'none'; return; }
    el.innerHTML = 'Reverb Total: $' + totalLow.toFixed(2) + ' \u2013 $' + totalHigh.toFixed(2) + ' \u00b7 ' + count + (count === 1 ? ' item' : ' items');
    el.style.display = 'block';
}
fetch('/api/gear-prices').then(function(r){return r.json()}).then(function(prices){
    window._gearPrices = prices;
    document.querySelectorAll('.gear-price-tag').forEach(function(el){
        var gid = el.getAttribute('data-gid');
        var p = prices[gid];
        if(p){
            var range = p.low === p.high ? '$' + p.low.toFixed(2) : '$' + p.low.toFixed(2) + ' \u2013 $' + p.high.toFixed(2);
            el.innerHTML = '<div>Reverb: ' + range + '</div>';
            el.style.display = 'block';
        }
    });
    updateSaleSummary();
}).catch(function(){});
"""
    return html_page("Music Gear", body, extra_js=extra_js)


def build_gear_detail_page(conn, gear_id):
    g = get_music_gear(conn, gear_id)
    if not g:
        return None

    # Find previous and next items alphabetically
    all_ids = [row[0] for row in conn.execute(
        f"SELECT id FROM music_gear ORDER BY {_MG_SORT}").fetchall()]
    cur_pos  = all_ids.index(gear_id) if gear_id in all_ids else -1
    prev_id  = all_ids[cur_pos - 1] if cur_pos > 0 else None
    next_id  = all_ids[cur_pos + 1] if cur_pos >= 0 and cur_pos < len(all_ids) - 1 else None

    price_html = f"""
        <div id="detail-price" data-gid="{g['id']}" style="display:none;text-align:center;
             padding:0 20px 12px;font-size:15px;font-weight:700;color:#228b22;"></div>"""

    if g["image_url"]:
        image_html = f"""
        <div style="text-align:center;padding:0 20px 16px;">
            <img src="{h(g['image_url'])}" alt="{h(g['name'])}"
                 style="max-width:240px;width:100%;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.15);">
        </div>{price_html}"""
    else:
        image_html = f"""
        <div style="margin:0 20px 16px;background:#fff;border-radius:12px;
                    padding:16px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
            <div style="font-size:13px;font-weight:600;color:#8e8e93;
                        text-transform:uppercase;letter-spacing:0.5px;
                        margin-bottom:12px;">Add Image</div>
            <div style="display:flex;gap:8px;align-items:center;">
                <input type="url" id="img-url" placeholder="Paste image URL\u2026"
                       style="flex:1;padding:10px 12px;border:1.5px solid #c4d8f0;
                              border-radius:10px;font-size:15px;font-family:inherit;
                              outline:none;background:#f0f5fd;min-width:0;">
                <button id="img-btn"
                        style="padding:10px 16px;background:#1e7be9;color:#fff;
                               border:none;border-radius:10px;font-size:15px;
                               font-weight:600;cursor:pointer;white-space:nowrap;">Set</button>
            </div>
            <img id="img-preview" alt=""
                 style="display:none;margin-top:12px;max-width:100%;
                        border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12);">
            <div id="img-status" style="min-height:16px;font-size:13px;
                                        color:#8e8e93;margin-top:6px;"></div>
        </div>{price_html}"""

    reverb_link_html = ""
    if g["reverb_url"]:
        reverb_link_html = f"""
        <div style="padding:0 20px 16px;text-align:center;">
            <a href="{h(g['reverb_url'])}" target="_blank" rel="noopener"
               style="display:inline-block;padding:11px 24px;background:#f5f5f7;
                      border-radius:10px;color:#1e7be9;font-size:16px;font-weight:600;
                      text-decoration:none;">Reverb &#8599;</a>
        </div>"""

    # Build stats rows
    def _stat_row(label, value):
        return (f'<div style="display:flex;justify-content:space-between;align-items:center;'
                f'padding:11px 0;border-bottom:1px solid #f0f0f0;">'
                f'<span style="color:#8e8e93;font-size:15px;">{label}</span>'
                f'<span style="color:#1c1c1e;font-size:15px;font-weight:600;">{value}</span>'
                f'</div>')

    stat_rows = []

    if g["make"]:
        stat_rows.append(_stat_row("Make", h(g["make"])))
    if g["model"]:
        stat_rows.append(_stat_row("Model", h(g["model"])))
    if g["condition"]:
        stat_rows.append(_stat_row("Condition", h(g["condition"])))

    def _toggle_row(label, field, value, gear_id):
        checked = "Yes" if value else "No"
        color = "#34c759" if value else "#8e8e93"
        return (f'<div style="display:flex;justify-content:space-between;align-items:center;'
                f'padding:11px 0;border-bottom:1px solid #f0f0f0;">'
                f'<span style="color:#8e8e93;font-size:15px;">{label}</span>'
                f'<button data-field="{field}" data-id="{gear_id}" data-value="{1 if value else 0}"'
                f' style="background:none;border:none;cursor:pointer;font-size:15px;font-weight:600;'
                f'color:{color};padding:0;font-family:inherit;" class="flag-toggle">{checked}</button>'
                f'</div>')

    gid = g["id"]
    stat_rows.append(_toggle_row("Shrink Wrapped", "shrink_wrapped", g["shrink_wrapped"], gid))
    stat_rows.append(_toggle_row("For Sale",       "for_sale",       g["for_sale"],       gid))

    stats_html = ""
    if stat_rows:
        stats_html = (f'<div style="margin:0 20px 20px;background:#fff;border-radius:12px;'
                      f'padding:0 14px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">'
                      + "".join(stat_rows)
                      + '</div>')

    body = f"""
    <div class="navbar">
        <a href="/music-gear">&#8249; Music Gear</a>
    </div>
    <div style="padding:24px 20px 12px;font-size:26px;font-weight:700;color:#1c1c1e;
                line-height:1.2;text-align:center;">{h(g['name'])}</div>
    {image_html}
    {stats_html}
    {reverb_link_html}
    <div style="padding:0 20px 32px;text-align:center;">
        <button onclick="deleteGear({g['id']})"
                style="padding:11px 24px;background:#fff0f5;color:#c0392b;border:1.5px solid #e8a0b0;
                       border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;">Delete</button>
    </div>"""

    gear_name_js = json.dumps(g["name"])

    setimage_js = ""
    if not g["image_url"]:
        gid = g["id"]
        setimage_js = f"""
(function() {{
    var urlInput = document.getElementById('img-url');
    var btn      = document.getElementById('img-btn');
    var preview  = document.getElementById('img-preview');
    var status   = document.getElementById('img-status');
    urlInput.addEventListener('input', function() {{
        var url = urlInput.value.trim();
        if (!url) {{ preview.style.display = 'none'; status.textContent = ''; return; }}
        preview.style.display = 'block';
        preview.src = url;
    }});
    preview.addEventListener('error', function() {{
        preview.style.display = 'none';
        status.textContent = 'Could not load image from that URL';
        status.style.color = '#c0392b';
    }});
    preview.addEventListener('load', function() {{
        status.textContent = '';
    }});
    btn.addEventListener('click', function() {{
        var url = urlInput.value.trim();
        if (!url) return;
        btn.disabled = true;
        btn.textContent = 'Saving\u2026';
        post('/music-gear/set-image', {{id: {gid}, image_url: url}})
            .then(function(r) {{ return r.json(); }})
            .then(function(data) {{
                if (data.ok) {{ window.location.reload(); }}
                else {{
                    status.textContent = data.error || 'Error saving';
                    status.style.color = '#c0392b';
                    btn.disabled = false;
                    btn.textContent = 'Set';
                }}
            }}).catch(function() {{
                status.textContent = 'Network error \u2014 try again';
                status.style.color = '#c0392b';
                btn.disabled = false;
                btn.textContent = 'Set';
            }});
    }});
}})();"""

    prev_js = f"/music-gear/{prev_id}" if prev_id else "null"
    next_js = f"/music-gear/{next_id}" if next_id else "null"

    extra_js = f"""
function deleteGear(id) {{
    if (!confirm('Remove ' + {gear_name_js} + ' from your collection?')) return;
    post('/music-gear/delete', {{id: id}}).then(function(data) {{
        window.location.href = '/music-gear';
    }});
}}
{setimage_js}
(function() {{
    document.querySelectorAll('.flag-toggle').forEach(function(btn) {{
        btn.addEventListener('click', function() {{
            var field = btn.dataset.field;
            var id    = parseInt(btn.dataset.id);
            var newVal = btn.dataset.value === '1' ? 0 : 1;
            post('/music-gear/set-flag', {{id: id, field: field, value: newVal}})
                .then(function(r) {{ return r.json(); }})
                .then(function(data) {{
                    if (data.ok) {{
                        btn.dataset.value = String(newVal);
                        btn.textContent   = newVal ? 'Yes' : 'No';
                        btn.style.color   = newVal ? '#34c759' : '#8e8e93';
                    }}
                }});
        }});
    }});
}})();
(function() {{
    var prevUrl = {prev_js if prev_js == "null" else f'"{prev_js}"'};
    var nextUrl = {next_js if next_js == "null" else f'"{next_js}"'};
    var startX = null, startY = null, dragging = false;

    var swipeDir = sessionStorage.getItem('swipeDir');
    if (swipeDir) {{
        sessionStorage.removeItem('swipeDir');
        var fromX = swipeDir === 'left' ? '40vw' : '-40vw';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.transition = 'none';
        document.body.style.transform = 'translateX(' + fromX + ')';
        requestAnimationFrame(function() {{
            requestAnimationFrame(function() {{
                document.body.style.transition = 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)';
                document.body.style.transform = 'translateX(0)';
                setTimeout(function() {{ document.documentElement.style.overflow = ''; }}, 300);
            }});
        }});
    }}

    document.addEventListener('touchstart', function(e) {{
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dragging = false;
        document.body.style.transition = 'none';
    }}, {{passive: true}});

    document.addEventListener('touchmove', function(e) {{
        if (startX === null) return;
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        if (!dragging && Math.abs(dy) > Math.abs(dx)) {{ startX = null; return; }}
        if (!dragging && (dx < 0 ? !nextUrl : !prevUrl)) return;
        dragging = true;
        e.preventDefault();
        document.body.style.transform = 'translateX(' + dx + 'px)';
    }}, {{passive: false}});

    document.addEventListener('touchend', function(e) {{
        if (!dragging || startX === null) return;
        var dx = e.changedTouches[0].clientX - startX;
        startX = null; dragging = false;
        var targetUrl = dx < -60 ? nextUrl : dx > 60 ? prevUrl : null;
        if (targetUrl) {{
            var offX = dx < 0 ? '-40vw' : '40vw';
            sessionStorage.setItem('swipeDir', dx < 0 ? 'left' : 'right');
            document.body.style.transition = 'transform 0.28s cubic-bezier(0.55,0,1,0.45)';
            document.body.style.transform = 'translateX(' + offX + ')';
            setTimeout(function() {{ window.location.href = targetUrl; }}, 260);
        }} else {{
            document.body.style.transition = 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)';
            document.body.style.transform = 'translateX(0)';
            setTimeout(function() {{ document.documentElement.style.overflow = ''; }}, 370);
        }}
    }}, {{passive: true}});
}})();
(function(){{
    var el = document.getElementById('detail-price');
    if(!el) return;
    var gid = el.getAttribute('data-gid');
    fetch('/api/gear-price/' + gid).then(function(r){{return r.json()}}).then(function(p){{
        if(p && p.low){{
            var range = p.low === p.high ? '$' + p.low.toFixed(2) : '$' + p.low.toFixed(2) + ' \u2013 $' + p.high.toFixed(2);
            el.innerHTML = '<div>Reverb: ' + range + '</div>';
            el.style.display = 'block';
        }}
    }}).catch(function(){{}});
}})();
"""
    return html_page(h(g["name"]), body, extra_js=extra_js)


def _git_version():
    """Return (short_hash, commit_date) from git, or fallback strings.  Shown on home page."""
    import subprocess
    try:
        short = subprocess.check_output(
            ["git", "log", "-1", "--format=%h"], cwd=os.path.dirname(os.path.abspath(__file__)),
            stderr=subprocess.DEVNULL).decode().strip()
        date = subprocess.check_output(
            ["git", "log", "-1", "--format=%ci"], cwd=os.path.dirname(os.path.abspath(__file__)),
            stderr=subprocess.DEVNULL).decode().strip()
        return short, date
    except Exception:
        return "unknown", ""

_GIT_HASH, _GIT_DATE = _git_version()


# Dice roller page moved to pages/dice_roller.py

# ===== Dice Vault Shared Rooms =====
import random, string, threading, time as _time, queue

# Active SSE connections: {room_code: [queue.Queue, ...]}
_room_streams = {}
_room_streams_lock = threading.Lock()

# Rate limiter: {action: {ip: [timestamps]}}
_rate_limits = {}
_rate_lock = threading.Lock()
def _rate_check(ip, action, max_per_minute=10):
    """Returns True if allowed, False if rate limited."""
    now = _time.time()
    with _rate_lock:
        if action not in _rate_limits:
            _rate_limits[action] = {}
        bucket = _rate_limits[action]
        if ip not in bucket:
            bucket[ip] = []
        # Clean old entries
        bucket[ip] = [t for t in bucket[ip] if now - t < 60]
        if len(bucket[ip]) >= max_per_minute:
            return False
        bucket[ip].append(now)
        return True

# Max concurrent SSE connections per IP
_MAX_SSE_PER_IP = 5

ROOM_COLORS = ['#58a6ff', '#7ee787', '#f0883e', '#f85149', '#d2a8ff',
               '#d29922', '#ff7b72', '#79c0ff', '#a5d6ff', '#ffa657',
               '#3dd68c', '#bc8cff', '#ff9640', '#ff6b8a', '#e8c840', '#40d4e8']

def _generate_room_code():
    """Generate a random 4-letter room code, checking for uniqueness."""
    conn = get_db()
    for _ in range(100):
        code = ''.join(random.choices(string.ascii_uppercase, k=4))
        exists = conn.execute("SELECT 1 FROM dice_rooms WHERE code=? AND status='active'", (code,)).fetchone()
        if not exists:
            conn.close()
            return code
    conn.close()
    return None

def _room_broadcast(code, event_type, data):
    """Send an SSE event to all connected clients in a room."""
    import json
    msg = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    with _room_streams_lock:
        queues = _room_streams.get(code, [])
        for q in queues:
            try:
                q.put_nowait(msg)
            except Exception:
                pass

def _room_touch(code):
    """Update last_activity timestamp for a room."""
    try:
        conn = get_db()
        conn.execute("UPDATE dice_rooms SET last_activity=datetime('now') WHERE code=?", (code,))
        conn.commit()
        conn.close()
    except Exception:
        pass

def _room_cleanup():
    """Purge rooms inactive for 24+ hours (keep rolls for 30 days)."""
    try:
        conn = get_db()
        # Close stale rooms
        conn.execute("""
            UPDATE dice_rooms SET status='closed'
            WHERE status='active' AND last_activity < datetime('now', '-24 hours')
        """)
        # Delete members of closed rooms
        conn.execute("""
            DELETE FROM dice_room_members WHERE room_code IN (
                SELECT code FROM dice_rooms WHERE status='closed'
            )
        """)
        # Delete packs of closed rooms
        conn.execute("""
            DELETE FROM dice_room_packs WHERE room_code IN (
                SELECT code FROM dice_rooms WHERE status='closed'
            )
        """)
        # Purge rolls older than 30 days
        conn.execute("DELETE FROM dice_room_rolls WHERE timestamp < datetime('now', '-30 days')")
        # Purge rooms older than 30 days entirely
        conn.execute("DELETE FROM dice_rooms WHERE created_at < datetime('now', '-30 days')")
        conn.commit()
        conn.close()
    except Exception:
        pass

def _get_room_taken_colors(code):
    """Get list of colors currently in use in a room."""
    conn = get_db()
    rows = conn.execute("SELECT color FROM dice_room_members WHERE room_code=?", (code,)).fetchall()
    conn.close()
    return [r['color'] for r in rows]

def _get_room_members(code):
    """Get list of current room members."""
    conn = get_db()
    rows = conn.execute("SELECT name, color FROM dice_room_members WHERE room_code=?", (code,)).fetchall()
    conn.close()
    return [{'name': r['name'], 'color': r['color']} for r in rows]

def _get_room_packs(code):
    """Get list of pack IDs pushed to room."""
    conn = get_db()
    rows = conn.execute("SELECT pack_id FROM dice_room_packs WHERE room_code=?", (code,)).fetchall()
    conn.close()
    return [r['pack_id'] for r in rows]


# Song Burst pages moved to pages/song_burst.py

def build_home_page():
    if WEB_MODE:
        return build_web_home_page()
    body = f"""
    <div class="page-header">Apps</div>
    <div class="list">
        <a href="/hello">Hello World <span class="chevron">&#8250;</span></a>
        <a href="/restaurant-info">Restaurant Info <span class="chevron">&#8250;</span></a>
        <a href="/supplements">Supplements Report <span class="chevron">&#8250;</span></a>
        <a href="/board-games">Hawaii Board Games <span class="chevron">&#8250;</span></a>
        <a href="/music-gear">Music Gear <span class="chevron">&#8250;</span></a>
        <a href="/big-ideas">Big Ideas <span class="chevron">&#8250;</span></a>
        <a href="/song-burst">Song Burst <span class="chevron">&#8250;</span></a>
        <a href="/dice">Dice Vault <span class="chevron">&#8250;</span></a>
        <a href="/dice/bugs">Dice Vault Bugs <span class="chevron">&#8250;</span></a>
    </div>
    <div style="text-align:center;padding:24px 16px;font-size:12px;color:#b0b0b0;">
        {h(_GIT_HASH)} &middot; {h(_GIT_DATE)}
    </div>"""
    return html_page("Home", body)


def build_web_home_page():
    """Public-facing landing page for Casdra Software."""
    css = """
    body { background: linear-gradient(170deg, #1e2a45 0%, #2d3f6b 50%, #1e3a5f 100%);
           min-height: 100vh; color: #e0e0e0; }
    .navbar { display: none; }
    .home { display: flex; flex-direction: column; align-items: center; justify-content: center;
            min-height: 100vh; padding: 40px 20px; text-align: center; }
    .home h1 { font-size: 42px; font-weight: 800; letter-spacing: -1px; color: #fff; }
    .home p { font-size: 16px; color: #888; margin-top: 8px; }
    .home-apps { margin-top: 40px; }
    .app-card { display: block; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
                border-radius: 16px; padding: 24px 32px; text-decoration: none; color: #fff;
                transition: transform 0.15s, background 0.15s; }
    .app-card:hover { background: rgba(255,255,255,0.1); transform: scale(1.02); }
    .app-card:active { transform: scale(0.98); }
    .app-card h2 { font-size: 24px; font-weight: 700; }
    .app-card p { color: #aaa; font-size: 14px; margin-top: 4px; }
    """
    body = """
    <div class="home">
        <h1>Casdra Software</h1>
        <p>Building things we love</p>
        <div class="home-apps">
            <a class="app-card" href="/dice">
                <h2>Dice Vault</h2>
                <p>Roll dice for any game — RPG, board game, or just for fun</p>
            </a>
            <a class="app-card" href="/chartburst" style="margin-top:12px">
                <h2>ChartBurst</h2>
                <p>You need to know the lyrics, AND the melody!</p>
            </a>
        </div>
    </div>
    """
    return html_page("Casdra Software", body, extra_css=css)


def build_hello_page():
    body = """
    <div class="navbar"><a href="/">&#8249; Back</a></div>
    <div style="padding:20px;text-align:center;margin-top:40px;"><h1 style="font-size:28px;font-weight:700;">Hello, World!</h1></div>"""
    return html_page("Hello World", body)


def build_big_ideas_page():
    ideas_file = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              "docs", "big-ideas.md")
    ideas = []
    try:
        with open(ideas_file, "r", encoding="utf-8") as f:
            content = f.read()
        # Parse each ## N. Title section
        sections = re.split(r"^## ", content, flags=re.MULTILINE)[1:]
        for section in sections:
            lines = section.strip().split("\n")
            title_line = lines[0].strip()
            # Extract number and title
            m = re.match(r"(\d+)\.\s+(.*)", title_line)
            if not m:
                continue
            num = int(m.group(1))
            title = m.group(2)
            # Extract description (first non-empty line after title)
            desc = ""
            for line in lines[1:]:
                line = line.strip()
                if line and not line.startswith("-") and not line.startswith("---"):
                    desc = line
                    break
            # Extract status, progress, checklist, metadata
            status = "Unknown"
            progress = 0
            done_items = []
            todo_items = []
            repo = ""
            folder = ""
            dependency = ""
            for line in lines:
                stripped = line.strip()
                if "**Status:**" in stripped:
                    status = re.sub(r".*\*\*Status:\*\*\s*", "", stripped).strip()
                if "**Progress:**" in stripped:
                    pm = re.search(r"(\d+)%", stripped)
                    if pm:
                        progress = int(pm.group(1))
                if stripped.startswith("- ✅"):
                    done_items.append(re.sub(r"^- ✅\s*", "", stripped))
                if stripped.startswith("- ⬜"):
                    todo_items.append(re.sub(r"^- ⬜\s*", "", stripped))
                if "**Repo:**" in stripped:
                    repo = re.sub(r".*\*\*Repo:\*\*\s*", "", stripped).strip()
                if "**Folder:**" in stripped:
                    folder = re.sub(r".*\*\*Folder:\*\*\s*", "", stripped).strip().strip("`")
                if "**Dependency:**" in stripped:
                    dependency = re.sub(r".*\*\*Dependency:\*\*\s*", "", stripped).strip()
            ideas.append((num, title, desc, status, progress, done_items, todo_items, repo, folder, dependency))
    except FileNotFoundError:
        pass

    ideas.sort(key=lambda x: x[0])

    status_colors = {
        "not started": "#888",
        "early discussions": "#d4a017",
        "early prototype": "#2e86de",
    }

    items_html = ""
    for num, title, desc, status, progress, done_items, todo_items, repo, folder, dependency in ideas:
        color = "#888"
        for key, val in status_colors.items():
            if key in status.lower():
                color = val
                break
        if "reviewed" in status.lower() or "progress" in status.lower() or "active" in status.lower():
            color = "#2e86de"
        if "filed" in status.lower():
            color = "#2a9d8f"
        if "complete" in status.lower():
            color = "#2a9d8f"

        # Progress bar color based on percentage
        if progress >= 100:
            bar_color = "#2a9d8f"
            encouragement = "✅ Complete!"
        elif progress >= 70:
            bar_color = "#2a9d8f"
            encouragement = "🔥 Almost there!"
        elif progress >= 40:
            bar_color = "#f0a500"
            encouragement = "💪 Making moves!"
        elif progress >= 15:
            bar_color = "#5cb8ff"
            encouragement = "🚀 Underway"
        elif progress > 0:
            bar_color = "#e0544e"
            encouragement = "🌱 Just getting started"
        else:
            bar_color = "#444"
            encouragement = "⏳ Ready when you are"

        total_items = len(done_items) + len(todo_items)
        done_count = len(done_items)

        # Build checklist HTML
        checklist = ""
        if done_items or todo_items:
            checklist_items = ""
            for item in done_items:
                checklist_items += f'<div style="padding:3px 0;color:#2a9d8f;font-size:13px;">✅ {h(item)}</div>'
            for item in todo_items:
                checklist_items += f'<div style="padding:3px 0;color:#666;font-size:13px;">⬜ {h(item)}</div>'
            checklist = f"""
            <details style="margin-top:8px;">
                <summary style="cursor:pointer;font-size:12px;color:#999;font-weight:600;">
                    {done_count}/{total_items} tasks completed
                </summary>
                <div style="padding:8px 0 0 4px;">{checklist_items}</div>
            </details>"""

        # Metadata badges
        badges = ""
        if repo:
            badges += f'<span style="display:inline-block;padding:2px 8px;background:#333;border-radius:6px;font-size:11px;color:#aaa;margin-right:6px;">📂 {h(repo)}</span>'
        if folder:
            badges += f'<span style="display:inline-block;padding:2px 8px;background:#333;border-radius:6px;font-size:11px;color:#aaa;margin-right:6px;">📁 {h(folder)}</span>'
        if dependency:
            badges += f'<span style="display:inline-block;padding:2px 8px;background:#3a2a1a;border-radius:6px;font-size:11px;color:#d4a017;margin-right:6px;">⚠️ {h(dependency)}</span>'

        items_html += f"""
        <div style="padding:16px 20px;background:#1a1a1a;border-radius:12px;margin-bottom:12px;">
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px;">
                <span style="font-size:13px;color:#e91e8c;font-weight:700;">#{num}</span>
                <span style="font-size:17px;font-weight:600;color:#f5f5f5;">{h(title)}</span>
                <span style="margin-left:auto;font-size:20px;font-weight:800;color:{bar_color};">{progress}%</span>
            </div>
            <div style="background:#333;border-radius:6px;height:10px;margin-bottom:8px;overflow:hidden;">
                <div style="background:linear-gradient(90deg, {bar_color}, {bar_color}dd);height:100%;width:{progress}%;border-radius:6px;transition:width 0.5s;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-size:12px;color:{color};font-weight:600;background:{color}22;padding:3px 10px;border-radius:6px;">{h(status)}</span>
                <span style="font-size:12px;color:{bar_color};font-weight:600;">{encouragement}</span>
            </div>
            <div style="font-size:14px;color:#ccc;line-height:1.5;margin-bottom:6px;">{h(desc)}</div>
            {"<div style='margin-top:6px;'>" + badges + "</div>" if badges else ""}
            {checklist}
        </div>"""

    body = f"""
    <div class="navbar"><a href="/">&#8249; Back</a></div>
    <div class="page-header">Big Ideas</div>
    <div style="font-size:13px;color:#999;padding:0 20px 12px;text-align:center;">
        {len(ideas)} ideas &middot; Casdra Software
    </div>
    <div style="margin:0 12px;">
        {items_html}
    </div>
    <div style="height:40px;"></div>"""
    return html_page("Big Ideas", body)


def build_restaurant_list_page(conn):
    rests = conn.execute("SELECT * FROM restaurants ORDER BY name").fetchall()
    items_html = "".join(
        f'<a href="/restaurant-info/{r["slug"]}">{h(r["name"])} <span class="chevron">&#8250;</span></a>'
        for r in rests
    )
    body = f"""
    <div class="page-header">
        Restaurants
        <div style="display:flex;gap:16px;align-items:baseline">
            <a href="/restaurant-info/changelog" style="font-size:15px;">Changelog</a>
            <a href="/">Home</a>
        </div>
    </div>
    <form class="search-box" action="/restaurant-info/search" method="get">
        <input type="text" name="q" placeholder="Search...">
        <button type="submit" class="search-btn">Search</button>
    </form>
    <div class="list">{items_html}</div>
    <div style="padding:0 16px 32px;">
        <div style="background:#fff;border-radius:12px;padding:14px 16px;
                    box-shadow:0 1px 4px rgba(0,0,0,0.08);">
            <div style="font-size:13px;font-weight:600;color:#8e8e93;
                        text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Add Restaurant</div>
            <div style="display:flex;gap:8px;align-items:center;">
                <input type="text" id="new-rest-name" placeholder="Restaurant name\u2026"
                       style="flex:1;padding:10px 12px;border:1.5px solid #e0e0e0;
                              border-radius:10px;font-size:15px;font-family:inherit;
                              outline:none;min-width:0;">
                <button id="new-rest-btn"
                        style="padding:10px 16px;background:#e91e8c;color:#fff;border:none;
                               border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;
                               white-space:nowrap;">Add</button>
            </div>
            <div id="new-rest-status" style="min-height:16px;font-size:13px;color:#8e8e93;margin-top:6px;"></div>
        </div>
    </div>"""

    extra_js = """
(function() {
    var input  = document.getElementById('new-rest-name');
    var btn    = document.getElementById('new-rest-btn');
    var status = document.getElementById('new-rest-status');
    function doAdd() {
        var name = input.value.trim();
        if (!name) return;
        btn.disabled = true;
        btn.textContent = 'Adding\u2026';
        status.textContent = '';
        post('/restaurant-info/add-restaurant', {name: name})
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.ok && data.slug) {
                    window.location.href = '/restaurant-info/' + data.slug;
                } else {
                    status.textContent = data.error || 'Error adding restaurant';
                    status.style.color = '#c0392b';
                    btn.disabled = false;
                    btn.textContent = 'Add';
                }
            }).catch(function() {
                status.textContent = 'Network error \u2014 try again';
                status.style.color = '#c0392b';
                btn.disabled = false;
                btn.textContent = 'Add';
            });
    }
    btn.addEventListener('click', doAdd);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doAdd(); });
})();
"""
    return html_page("Restaurants", body, extra_js=extra_js)


def build_restaurant_detail_page(conn, slug):
    r = get_restaurant_by_slug(conn, slug)
    if not r:
        return None

    rid = r["id"]
    sections_html = ""
    for cat in ("servers", "food", "other"):
        label = cat.capitalize()
        items = r[cat]
        rows = ""
        if not items:
            rows = '<div class="empty">No items yet</div>'
        if cat == "servers":
            for item in items:
                info_display = h(item["info"]) if item["info"] else "<em style='color:#8e8e93'>Tap to add info</em>"
                rows += f"""
                <div class="item-row" id="server-row-{item['id']}">
                    <div class="server-info" onclick="editServer({item['id']}, {h(json.dumps(item['value']))}, {h(json.dumps(item['info']))})">
                        <span class="server-name">{h(item['value'])}</span>
                        <span class="server-detail">{info_display}</span>
                    </div>
                    <button class="delete-btn" onclick="event.stopPropagation();deleteItem({item['id']})">Delete</button>
                </div>"""
            rows += f"""
            <div class="add-row add-server-row">
                <input type="text" id="add-servers-name" placeholder="Name">
                <input type="text" id="add-servers-info" placeholder="Info">
                <button onclick="addServer({rid})">Add</button>
            </div>"""
        else:
            for item in items:
                info_display = h(item["info"]) if item["info"] else "<em style='color:#8e8e93'>Tap to add info</em>"
                rows += f"""
                <div class="item-row" id="item-row-{item['id']}">
                    <div class="server-info" onclick="editItem({item['id']}, {h(json.dumps(item['value']))}, {h(json.dumps(item['info'] or ''))}, '{cat}')">
                        <span class="server-name">{h(item['value'])}</span>
                        <span class="server-detail">{info_display}</span>
                    </div>
                    <button class="delete-btn" onclick="event.stopPropagation();deleteItem({item['id']})">Delete</button>
                </div>"""
            rows += f"""
            <div class="add-row add-server-row">
                <input type="text" id="add-{cat}-name" placeholder="Name">
                <input type="text" id="add-{cat}-info" placeholder="Info">
                <button onclick="addItem({rid}, '{cat}')">Add</button>
            </div>"""
        sections_html += f'<div class="section-header">{label}</div><div class="section">{rows}</div>'

    body = f"""
    <div class="navbar" id="navbar">
        <a href="/restaurant-info">&#8249; Back</a>
        <span class="navbar-title" id="restTitle" onclick="editRestaurantName()" style="cursor:pointer;pointer-events:all">{h(r['name'])}</span>
    </div>
    <div class="body-content">{sections_html}</div>"""

    js = f"""
    const RESTAURANT_ID = {rid};
    const RESTAURANT_NAME = {json.dumps(r['name'])};

    function editServer(itemId, curValue, curInfo) {{
        const row = document.getElementById('server-row-' + itemId);
        if (!row || row.querySelector('.edit-form')) return;
        row.innerHTML = '<div class="edit-form">' +
            '<input type="text" id="en-' + itemId + '" value="' + escapeAttr(curValue) + '" placeholder="Name">' +
            '<input type="text" id="ei-' + itemId + '" value="' + escapeAttr(curInfo) + '" placeholder="Info">' +
            '<div class="edit-actions">' +
            '<button class="save-btn" onclick="saveServer(' + itemId + ')">Save</button>' +
            '<button class="cancel-btn" onclick="window.location.reload()">Cancel</button>' +
            '</div></div>';
        document.getElementById('en-' + itemId).focus();
    }}

    async function saveServer(itemId) {{
        const name = document.getElementById('en-' + itemId).value.trim();
        if (!name) return;
        const info = document.getElementById('ei-' + itemId).value.trim();
        await post('/restaurant-info/update-item', {{item_id: itemId, value: name, info: info}});
        window.location.reload();
    }}

    function editItem(itemId, curValue, curInfo, category) {{
        const row = document.getElementById('item-row-' + itemId);
        if (!row || row.querySelector('.edit-form')) return;
        row.innerHTML = '<div class="edit-form">' +
            '<input type="text" id="en-item-' + itemId + '" value="' + escapeAttr(curValue) + '" placeholder="Name">' +
            '<input type="text" id="ei-item-' + itemId + '" value="' + escapeAttr(curInfo) + '" placeholder="Info">' +
            '<div class="edit-actions">' +
            '<button class="save-btn" onclick="saveItem(' + itemId + ')">Save</button>' +
            '<button class="cancel-btn" onclick="window.location.reload()">Cancel</button>' +
            '</div></div>';
        document.getElementById('en-item-' + itemId).focus();
    }}

    async function saveItem(itemId) {{
        const value = document.getElementById('en-item-' + itemId).value.trim();
        if (!value) return;
        const info = document.getElementById('ei-item-' + itemId).value.trim();
        await post('/restaurant-info/update-item', {{item_id: itemId, value: value, info: info}});
        window.location.reload();
    }}

    async function addServer(restaurantId) {{
        const name = document.getElementById('add-servers-name').value.trim();
        if (!name) return;
        const info = document.getElementById('add-servers-info').value.trim();
        await post('/restaurant-info/add-item', {{restaurant_id: restaurantId, category: 'servers', value: name, info: info}});
        window.location.reload();
    }}

    async function addItem(restaurantId, category) {{
        const value = document.getElementById('add-' + category + '-name').value.trim();
        if (!value) return;
        const info = document.getElementById('add-' + category + '-info').value.trim();
        await post('/restaurant-info/add-item', {{restaurant_id: restaurantId, category: category, value: value, info: info}});
        window.location.reload();
    }}

    async function deleteItem(itemId) {{
        if (!confirm('Delete this item?')) return;
        await post('/restaurant-info/delete-item', {{item_id: itemId}});
        window.location.reload();
    }}

    function editRestaurantName() {{
        const titleEl = document.getElementById('restTitle');
        titleEl.style.display = 'none';
        const navbar = document.getElementById('navbar');
        const container = document.createElement('div');
        container.className = 'title-edit-container';
        container.id = 'titleEditContainer';
        container.innerHTML = '<input type="text" id="editRestName" value="' + escapeAttr(RESTAURANT_NAME) + '">' +
            '<button class="title-save-btn" onclick="saveRestaurantName()">Save</button>' +
            '<button class="title-cancel-btn" onclick="cancelRestaurantName()">Cancel</button>';
        navbar.appendChild(container);
        const inp = document.getElementById('editRestName');
        inp.focus(); inp.select();
    }}

    function cancelRestaurantName() {{
        document.getElementById('titleEditContainer').remove();
        document.getElementById('restTitle').style.display = '';
    }}

    async function saveRestaurantName() {{
        const newName = document.getElementById('editRestName').value.trim();
        if (!newName) return;
        const res = await post('/restaurant-info/rename-restaurant', {{restaurant_id: RESTAURANT_ID, name: newName}});
        const data = await res.json();
        if (data.merged) {{
            window.location.href = '/restaurant-info/' + data.target_slug;
        }} else {{
            window.location.href = '/restaurant-info/' + data.slug;
        }}
    }}
    """
    return html_page(h(r["name"]), body, extra_js=js)


def build_search_page(conn, query):
    rests = get_all_restaurants(conn)
    q = query.lower()
    results_html = ""
    has_results = False

    for r in rests:
        rest_html = ""
        for cat in ("servers", "food", "other"):
            label = cat.capitalize()
            items = [i for i in (r[cat] or []) if
                     q in i["value"].lower() or
                     q in (i["info"] or "").lower() or
                     q in r["name"].lower()]
            if not items:
                continue
            rows = ""
            if cat == "servers":
                for item in items:
                    rows += f"""
                    <div class="item-row">
                        <div class="server-info">
                            <span class="server-name">{h(item['value'])}</span>
                            <span class="server-detail">{h(item['info'])}</span>
                        </div>
                    </div>"""
            else:
                for item in items:
                    rows += f"""
                    <div class="item-row">
                        <div class="server-info">
                            <span class="server-name">{h(item['value'])}</span>
                            <span class="server-detail">{h(item['info'])}</span>
                        </div>
                    </div>"""
            rest_html += f'<div class="search-cat-header">{label}</div><div class="section">{rows}</div>'

        if rest_html:
            has_results = True
            results_html += f"""
            <div class="search-rest-header">
                <a href="/restaurant-info/{r['slug']}">{h(r['name'])} <span class="chevron">&#8250;</span></a>
            </div>
            {rest_html}"""

    if not has_results:
        results_html = '<div class="no-results">No results found</div>'

    body = f"""
    <div class="navbar">
        <a href="/restaurant-info">&#8249; Back</a>
        <span class="navbar-title">Search</span>
    </div>
    <form class="search-box" action="/restaurant-info/search" method="get" style="margin-top:12px;">
        <input type="text" name="q" value="{h(query)}" placeholder="Search...">
        <button type="submit" class="search-btn">Search</button>
    </form>
    <div class="body-content">{results_html}</div>"""
    return html_page(f"Search: {h(query)}", body)


def build_changelog_page(conn):
    rows = conn.execute("SELECT * FROM change_log ORDER BY id DESC LIMIT 200").fetchall()
    action_classes = {
        "add": "cl-action-add", "update": "cl-action-update",
        "delete": "cl-action-delete", "rename": "cl-action-rename",
        "merge": "cl-action-merge", "revert": "cl-action-revert",
    }
    revertable = {"add", "update", "delete", "rename", "merge"}

    if not rows:
        entries_html = '<div class="cl-empty">No changes recorded yet</div>'
    else:
        entries_html = ""
        for row in rows:
            cls = action_classes.get(row["action"], "cl-action-revert")
            can_revert = row["action"] in revertable
            revert_btn = (
                f'<button class="revert-btn" id="revert-{row["id"]}" onclick="revertChange({row["id"]})">Revert</button>'
                if can_revert else '<span style="width:60px"></span>'
            )
            entries_html += f"""
            <div class="changelog-entry">
                <div class="cl-meta">
                    <span class="changelog-action {cls}">{h(row['action'])}</span>
                    <div class="cl-desc">{h(row['description'])}</div>
                    <div class="cl-time">{h(row['timestamp'])}</div>
                </div>
                {revert_btn}
            </div>"""

    body = f"""
    <div class="navbar">
        <a href="/restaurant-info">&#8249; Back</a>
        <span class="navbar-title">Changelog</span>
    </div>
    <div class="body-content">{entries_html}</div>"""

    js = """
    async function revertChange(logId) {
        const btn = document.getElementById('revert-' + logId);
        if (btn) { btn.disabled = true; btn.textContent = '...'; }
        const res = await post('/restaurant-info/revert-change', {log_id: logId});
        const data = await res.json();
        if (data.ok) {
            window.location.reload();
        } else {
            if (btn) { btn.disabled = false; btn.textContent = 'Revert'; }
            alert('Could not revert this change (the restaurant may no longer exist).');
        }
    }
    """
    return html_page("Changelog", body, extra_js=js)


def build_supplements_list_page(conn):
    sups = get_all_supplements(conn)
    totals = compute_supplement_totals(sups)

    # Per-nutrient breakdown for tap detail: {key: [{n: supname, a: daily_amount}]}
    breakdown = {}
    for sup in sups:
        try:
            sup_nutrients = json.loads(sup["nutrients"] or "{}")
        except (json.JSONDecodeError, TypeError):
            sup_nutrients = {}
        pd_amt = float(sup["per_day"] or 1)
        for k, v in sup_nutrients.items():
            try:
                amt = float(v) * pd_amt
                if amt > 0:
                    breakdown.setdefault(k, []).append({"n": sup["name"], "a": amt})
            except (ValueError, TypeError):
                pass

    # Daily totals sections (only groups/nutrients with data)
    totals_html = ""
    has_any = False
    for group_name, group_nutrients in NUTRIENT_GROUPS:
        rows = ""
        for key, name, unit in group_nutrients:
            val = totals.get(key, 0)
            if val > 0:
                has_any = True
                dv = DAILY_VALUES.get(key)
                if dv:
                    pct      = round(val / dv * 100)
                    pct_col  = "#1a7a3a" if pct >= 100 else "#e91e8c"
                    pct_html = f' <span style="font-size:13px;font-weight:600;color:{pct_col};">{pct}%</span>'
                else:
                    pct_html = ""
                bd_json = json.dumps(breakdown.get(key, []), separators=(',', ':'))
                rows += f"""
                <div class="item-row nutrient-row" style="cursor:pointer;"
                     data-name="{h(name)}" data-unit="{h(unit)}"
                     data-total="{val}" data-dv="{dv if dv is not None else ''}"
                     data-breakdown="{h(bd_json)}">
                    <span>{h(name)}</span>
                    <span style="color:#8e8e93;display:flex;align-items:center;gap:6px;">{h(fmt_nutrient_val(val))} {h(unit)}{pct_html}<span style="color:#c7c7cc;font-size:18px;margin-left:4px;">&#8250;</span></span>
                </div>"""
        if rows:
            totals_html += f'<div class="section-header">{h(group_name)}</div><div class="section">{rows}</div>'

    if not has_any:
        totals_html = '<div class="section"><div class="empty">No nutrient data yet — add supplements and enter their nutrients</div></div>'

    # Supplement list rows
    sup_rows = ""
    for sup in sups:
        per_day = float(sup["per_day"])
        per_day_str = str(int(per_day)) if per_day == int(per_day) else str(per_day)
        links = []
        if sup["url"]:
            links.append(f'<a href="{h(sup["url"])}" target="_blank" rel="noopener" style="color:#e91e8c;text-decoration:none;">Product &#8599;</a>')
        if sup["dsld_url"]:
            links.append(f'<a href="{h(sup["dsld_url"])}" target="_blank" rel="noopener" style="color:#e91e8c;text-decoration:none;">NIH Label &#8599;</a>')
        links_html = (" &middot; " + " &middot; ".join(links)) if links else ""
        sup_rows += f"""
        <div class="item-row" style="flex-wrap:wrap;gap:2px;">
            <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                <a href="/supplements/{sup['id']}" style="font-size:17px;font-weight:600;color:#1c1c1e;text-decoration:none;flex:1;">{h(sup['name'])}</a>
                <button class="delete-btn" onclick="deleteSupplement({sup['id']})">Delete</button>
            </div>
            <div style="font-size:14px;color:#8e8e93;width:100%;padding-bottom:2px;">{h(per_day_str)}/day{links_html}</div>
        </div>"""

    if not sups:
        sup_rows = '<div class="empty">No supplements yet — add one below</div>'

    body = f"""
    <div class="page-header">
        Supplements
        <a href="/">Home</a>
    </div>
    <div class="body-content">
        <div class="section-header" style="padding-left:0;font-size:11px;">Daily Totals</div>
        {totals_html}
        <div class="section-header" style="padding-left:0;font-size:11px;margin-top:16px;">My Supplements</div>
        <div class="section">
            {sup_rows}
            <div class="add-row add-server-row">
                <input type="text" id="add-name" placeholder="Name" style="flex:2;min-width:100px;">
                <input type="url" id="add-url" placeholder="Amazon/Costco URL">
                <input type="number" id="add-perday" placeholder="/day" value="1" min="0.5" step="0.5" style="width:64px;">
                <button id="add-btn" onclick="addSupplement()">Add</button>
            </div>
        </div>
    </div>
    <div id="nutrient-backdrop"></div>
    <div id="nutrient-panel">
        <div id="nutrient-panel-header">
            <button id="nutrient-panel-back">&#8592; Back</button>
            <span id="nutrient-panel-title"></span>
        </div>
        <div id="nutrient-panel-body"></div>
    </div>"""

    css = """
#nutrient-backdrop {
    display:none;position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:100;
}
#nutrient-panel {
    position:fixed;top:0;right:0;bottom:0;width:100%;max-width:420px;
    background:#fff;z-index:101;transform:translateX(100%);
    transition:transform 0.28s cubic-bezier(0.4,0,0.2,1);
    overflow-y:auto;box-shadow:-4px 0 20px rgba(0,0,0,0.15);
}
#nutrient-panel-header {
    display:flex;align-items:center;gap:12px;padding:16px 20px;
    border-bottom:1px solid #f0f0f0;position:sticky;top:0;background:#fff;
}
#nutrient-panel-back {
    background:none;border:none;color:#e91e8c;font-size:16px;
    cursor:pointer;padding:4px 0;font-family:inherit;font-weight:600;
}
#nutrient-panel-title { font-size:17px;font-weight:600;color:#1c1c1e; }
#nutrient-panel-body { padding:16px 20px; }
.np-table { width:100%;border-collapse:collapse;font-size:15px; }
.np-table th {
    text-align:left;font-size:12px;font-weight:600;color:#8e8e93;
    padding:0 0 10px;border-bottom:1px solid #f0f0f0;
}
.np-table th.np-amt,.np-table th.np-pct { text-align:right; }
.np-table td { padding:10px 0;border-bottom:1px solid #f8f8f8;color:#1c1c1e; }
.np-table td.np-amt,.np-table td.np-pct { text-align:right;color:#8e8e93; }
.np-total td {
    font-weight:600;color:#1c1c1e !important;
    border-top:1px solid #f0f0f0;border-bottom:none;padding-top:12px;
}
"""

    js = """
    async function addSupplement() {
        const name = document.getElementById('add-name').value.trim();
        if (!name) return;
        const url = document.getElementById('add-url').value.trim();
        const per_day = document.getElementById('add-perday').value || '1';
        const btn = document.querySelector('#add-btn');
        btn.textContent = 'Looking up…';
        btn.disabled = true;
        try {
            const res = await post('/supplements/add', {name: name, url: url, per_day: per_day});
            const data = await res.json();
            if (data.id) {
                window.location.href = '/supplements/' + data.id
                    + '?auto=' + encodeURIComponent(data.fdc_status || 'error')
                    + '&lbl=' + encodeURIComponent(data.fdc_label || '');
            } else {
                window.location.reload();
            }
        } catch (e) {
            btn.textContent = 'Add';
            btn.disabled = false;
        }
    }
    async function deleteSupplement(supId) {
        if (!confirm('Delete this supplement?')) return;
        await post('/supplements/delete', {id: supId});
        window.location.reload();
    }
    function fmtVal(v) {
        if (v === Math.floor(v)) return String(Math.floor(v));
        var s = v.toFixed(2);
        s = s.replace(/0+$/, '').replace(/\\.$/, '');
        return s;
    }
    function escHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function openNutrientPanel(row) {
        var name = row.dataset.name;
        var unit = row.dataset.unit;
        var total = parseFloat(row.dataset.total);
        var dvRaw = row.dataset.dv;
        var dv = dvRaw ? parseFloat(dvRaw) : null;
        var breakdown = JSON.parse(row.dataset.breakdown || '[]');
        document.getElementById('nutrient-panel-title').textContent = name;
        breakdown.sort(function(a, b) { return b.a - a.a; });
        var tableRows = '';
        for (var i = 0; i < breakdown.length; i++) {
            var item = breakdown[i];
            var amt = fmtVal(item.a) + ' ' + unit;
            var pct = dv ? Math.round(item.a / dv * 100) + '%' : '—';
            var pctColor = (dv && item.a / dv >= 1) ? '#1a7a3a' : '#e91e8c';
            var pctStyle = dv ? ' style="color:' + pctColor + ';font-weight:600;"' : '';
            tableRows += '<tr>'
                + '<td class="np-name">' + escHtml(item.n) + '</td>'
                + '<td class="np-amt">' + escHtml(amt) + '</td>'
                + '<td class="np-pct"' + pctStyle + '>' + pct + '</td>'
                + '</tr>';
        }
        var totalPct = dv ? Math.round(total / dv * 100) + '%' : '—';
        var totalPctColor = (dv && total / dv >= 1) ? '#1a7a3a' : '#e91e8c';
        var totalPctStyle = dv ? ' style="color:' + totalPctColor + ';"' : '';
        var totalAmt = fmtVal(total) + ' ' + unit;
        document.getElementById('nutrient-panel-body').innerHTML =
            '<table class="np-table">'
            + '<thead><tr>'
            + '<th class="np-name">Supplement</th>'
            + '<th class="np-amt">Amount</th>'
            + '<th class="np-pct">% DV</th>'
            + '</tr></thead>'
            + '<tbody>' + tableRows + '</tbody>'
            + '<tfoot><tr class="np-total">'
            + '<td>Total</td>'
            + '<td class="np-amt">' + escHtml(totalAmt) + '</td>'
            + '<td class="np-pct"' + totalPctStyle + '>' + totalPct + '</td>'
            + '</tr></tfoot>'
            + '</table>';
        document.getElementById('nutrient-backdrop').style.display = 'block';
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                document.getElementById('nutrient-panel').style.transform = 'translateX(0)';
            });
        });
    }
    function closeNutrientPanel() {
        document.getElementById('nutrient-panel').style.transform = 'translateX(100%)';
        setTimeout(function() {
            document.getElementById('nutrient-backdrop').style.display = 'none';
        }, 300);
    }
    document.addEventListener('click', function(e) {
        var row = e.target.closest('.nutrient-row');
        if (row) { openNutrientPanel(row); return; }
        if (e.target.id === 'nutrient-backdrop' || e.target.id === 'nutrient-panel-back') {
            closeNutrientPanel();
        }
    });
    (function() {
        var panel = document.getElementById('nutrient-panel');
        var bd = document.getElementById('nutrient-backdrop');
        var startX = 0, startY = 0, active = false, swiping = false;
        panel.addEventListener('touchstart', function(e) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            active = true;
            swiping = false;
            panel.style.transition = 'none';
            bd.style.transition = 'none';
        }, { passive: true });
        panel.addEventListener('touchmove', function(e) {
            if (!active) return;
            var dx = e.touches[0].clientX - startX;
            var dy = e.touches[0].clientY - startY;
            if (!swiping) {
                if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                if (Math.abs(dy) > Math.abs(dx) || dx <= 0) {
                    active = false;
                    panel.style.transition = '';
                    bd.style.transition = '';
                    return;
                }
                swiping = true;
            }
            e.preventDefault();
            panel.style.transform = 'translateX(' + Math.max(0, dx) + 'px)';
            bd.style.opacity = String(Math.max(0, 1 - dx / window.innerWidth));
        }, { passive: false });
        panel.addEventListener('touchend', function(e) {
            if (!active) return;
            active = false;
            if (!swiping) {
                panel.style.transition = '';
                bd.style.transition = '';
                return;
            }
            swiping = false;
            var dx = e.changedTouches[0].clientX - startX;
            var t = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)';
            panel.style.transition = t;
            bd.style.transition = 'opacity 0.28s';
            if (dx > window.innerWidth * 0.3) {
                panel.style.transform = 'translateX(100%)';
                bd.style.opacity = '0';
                setTimeout(function() {
                    bd.style.display = 'none';
                    bd.style.opacity = '';
                    bd.style.transition = '';
                    panel.style.transition = '';
                }, 290);
            } else {
                panel.style.transform = 'translateX(0)';
                bd.style.opacity = '1';
                setTimeout(function() {
                    bd.style.opacity = '';
                    bd.style.transition = '';
                    panel.style.transition = '';
                }, 290);
            }
        }, { passive: true });
    })();
    """
    return html_page("Supplements Report", body, extra_css=css, extra_js=js)


def build_supplement_detail_page(conn, sup_id, fdc_status=None, fdc_label=""):
    sup = get_supplement(conn, sup_id)
    if not sup:
        return None

    try:
        nutrients = json.loads(sup["nutrients"] or "{}")
    except (json.JSONDecodeError, TypeError):
        nutrients = {}

    per_day = float(sup["per_day"])
    per_day_str = str(int(per_day)) if per_day == int(per_day) else str(per_day)

    # Build nutrient input sections
    nutrient_sections = ""
    input_style = ("width:90px;padding:6px 8px;border:1px solid #f0c4d8;border-radius:8px;"
                   "font-size:15px;font-family:inherit;text-align:right;"
                   "background:#fdf0f5;outline:none;")
    for group_name, group_nutrients in NUTRIENT_GROUPS:
        rows = ""
        for key, name, unit in group_nutrients:
            val = nutrients.get(key, "")
            val_str = fmt_nutrient_val(float(val)) if val else ""
            rows += f"""
            <div class="item-row" style="gap:12px;">
                <label style="flex:1;font-size:15px;" for="n-{key}">{h(name)}</label>
                <div style="display:flex;align-items:center;gap:6px;">
                    <input type="number" id="n-{key}" value="{h(val_str)}"
                           min="0" step="any" placeholder="0"
                           style="{input_style}"
                           onfocus="this.style.borderColor='#e91e8c'"
                           onblur="this.style.borderColor='#f0c4d8'">
                    <span style="color:#8e8e93;font-size:13px;min-width:56px;">{h(unit)}</span>
                </div>
            </div>"""
        nutrient_sections += f'<div class="section-header">{h(group_name)}</div><div class="section">{rows}</div>'

    field_style = ("flex:2;padding:8px 10px;border:1px solid #f0c4d8;border-radius:8px;"
                   "font-size:16px;font-family:inherit;outline:none;background:#fdf0f5;")

    dsld_url = sup["dsld_url"] or ""

    # Auto-lookup status banner
    banner_html = ""
    if fdc_status == "found":
        src = h(fdc_label) if fdc_label else "NIH Office of Dietary Supplements (DSLD)"
        dsld_link = (f' &middot; <a href="{h(dsld_url)}" target="_blank" rel="noopener"'
                     f' style="color:#1a7a3a;font-weight:400;">View NIH Label &#8599;</a>'
                     if dsld_url else "")
        banner_html = f"""
        <div style="margin:12px 0 0;padding:12px 14px;background:#d4f5e0;border-radius:12px;
                    font-size:14px;color:#1a7a3a;line-height:1.4;">
            <strong>Nutrients auto-populated</strong> from {src}{dsld_link}.<br>
            <span style="color:#2a8a4a;">Please verify values against your supplement label before saving.</span>
        </div>"""
    elif fdc_status == "not_found":
        banner_html = """
        <div style="margin:12px 0 0;padding:12px 14px;background:#fff3cd;border-radius:12px;
                    font-size:14px;color:#7a5500;line-height:1.4;">
            <strong>No match found</strong> in NIH Office of Dietary Supplements (DSLD).<br>
            <span style="color:#8a6500;">Enter nutrient values manually from your supplement label.</span>
        </div>"""

    body = f"""
    <div class="navbar">
        <a href="/supplements">&#8249; Back</a>
        <span class="navbar-title">Edit Supplement</span>
    </div>
    <div class="body-content">
        {banner_html}
        <div class="section" style="margin-top:12px;">
            <div class="item-row" style="gap:12px;">
                <label style="flex:1;font-size:15px;color:#6e6e73;font-weight:600;" for="field-name">Name</label>
                <input type="text" id="field-name" value="{h(sup['name'])}"
                       style="{field_style}"
                       onfocus="this.style.borderColor='#e91e8c'"
                       onblur="this.style.borderColor='#f0c4d8'">
            </div>
            <div class="item-row" style="gap:12px;">
                <label style="flex:1;font-size:15px;color:#6e6e73;font-weight:600;" for="field-url">URL</label>
                <input type="url" id="field-url" value="{h(sup['url'] or '')}"
                       placeholder="Amazon or Costco URL"
                       style="{field_style}font-size:14px;"
                       onfocus="this.style.borderColor='#e91e8c'"
                       onblur="this.style.borderColor='#f0c4d8'">
            </div>
            <div class="item-row" style="gap:12px;">
                <label style="flex:1;font-size:15px;color:#6e6e73;font-weight:600;" for="field-perday">Per Day</label>
                <input type="number" id="field-perday" value="{h(per_day_str)}"
                       min="0.5" step="0.5"
                       style="width:90px;padding:8px 10px;border:1px solid #f0c4d8;border-radius:8px;font-size:16px;font-family:inherit;outline:none;background:#fdf0f5;"
                       onfocus="this.style.borderColor='#e91e8c'"
                       onblur="this.style.borderColor='#f0c4d8'">
            </div>
            {"" if not dsld_url else f'''
            <div class="item-row" style="gap:12px;">
                <span style="flex:1;font-size:15px;color:#6e6e73;font-weight:600;">NIH Label</span>
                <a href="{h(dsld_url)}" target="_blank" rel="noopener"
                   style="color:#e91e8c;text-decoration:none;font-size:14px;">View on DSLD &#8599;</a>
            </div>'''}
        </div>
        {nutrient_sections}
        <div style="margin:20px 0 40px;">
            <button onclick="saveSupplement()"
                    style="width:100%;padding:14px;background:#e91e8c;color:#fff;border:none;border-radius:12px;font-size:17px;font-weight:600;font-family:inherit;cursor:pointer;">
                Save Changes
            </button>
        </div>
    </div>"""

    js = f"""
    const SUP_ID = {sup_id};
    const NUTRIENT_KEYS = {json.dumps(ALL_NUTRIENT_KEYS)};

    async function saveSupplement() {{
        const name = document.getElementById('field-name').value.trim();
        if (!name) {{ alert('Name is required'); return; }}
        const url = document.getElementById('field-url').value.trim();
        const per_day = document.getElementById('field-perday').value || '1';
        const nutrients = {{}};
        for (const key of NUTRIENT_KEYS) {{
            const el = document.getElementById('n-' + key);
            if (el && el.value !== '' && parseFloat(el.value) > 0) {{
                nutrients[key] = el.value;
            }}
        }}
        await post('/supplements/update', {{
            id: SUP_ID,
            name: name,
            url: url,
            per_day: per_day,
            nutrients: JSON.stringify(nutrients)
        }});
        window.location.href = '/supplements';
    }}
    """
    return html_page(h(sup["name"]), body, extra_js=js)


# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # enable keep-alive so all requests reuse one TCP connection

    def log_message(self, format, *args):
        pass  # suppress default access log noise

    def handle_error(self):
        pass  # silence ConnectionResetError / BrokenPipeError from keep-alive clients

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError):
            pass

    def send_html(self, html, status=200):
        encoded = html.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(encoded)

    def send_json(self, data, status=200):
        encoded = (json.dumps(data) if not isinstance(data, (str, bytes)) else data)
        if isinstance(encoded, str):
            encoded = encoded.encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _build_submissions_page(self, submissions):
        import html as _h
        rows = ""
        for s in submissions:
            sid = s["id"]
            name = _h.escape(s["pack_name"])
            submitter = _h.escape(s["submitter"])
            status = _h.escape(s["status"])
            ts = _h.escape(s.get("submitted_at", ""))
            try:
                presets = json.loads(s["presets"])
                preset_names = ", ".join(p.get("name", "?") for p in presets)
                preset_count = len(presets)
            except Exception:
                preset_names = "?"
                preset_count = 0
            color = "#7ee787" if status == "approved" else "#f85149" if status == "rejected" else "#ffa657"
            actions = ""
            if status == "pending":
                actions = f"""<button onclick="fetch('/dice/packs/submissions/{sid}/approve',{{method:'POST',headers:{{'X-Admin-Token':'{ADMIN_SECRET}'}}}}).then(()=>location.reload())" style="background:#238636;color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-family:inherit;margin-right:4px">Approve</button>
                <button onclick="fetch('/dice/packs/submissions/{sid}/reject',{{method:'POST',headers:{{'X-Admin-Token':'{ADMIN_SECRET}'}}}}).then(()=>location.reload())" style="background:#da3633;color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-family:inherit">Reject</button>"""
            rows += f"""<div style="background:#161b22;border:1px solid #21262d;border-radius:10px;padding:12px 16px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <strong style="color:#e6edf3;font-size:16px">{name}</strong>
                    <span style="color:{color};font-size:12px;font-weight:600">{status}</span>
                </div>
                <div style="color:#8b949e;font-size:13px">by {submitter} &middot; {preset_count} presets &middot; {ts}</div>
                <div style="color:#484f58;font-size:12px;margin-top:4px">{_h.escape(preset_names)}</div>
                <div style="margin-top:8px">{actions}</div>
            </div>"""
        return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Pack Submissions</title>
        <style>*{{margin:0;padding:0;box-sizing:border-box}}body{{background:#0d1117;color:#c9d1d9;font-family:-apple-system,system-ui,sans-serif;max-width:500px;margin:0 auto;padding:16px}}</style>
        </head><body>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <a href="/dice" style="color:#58a6ff;text-decoration:none;font-size:14px">&larr; Dice Vault</a>
            <h1 style="font-size:18px;font-weight:700;color:#e6edf3">Pack Submissions</h1>
            <div style="width:60px"></div>
        </div>
        {rows if rows else '<div style="text-align:center;color:#484f58;padding:40px">No submissions yet</div>'}
        </body></html>"""

    def redirect(self, location):
        self.send_response(303)
        self.send_header("Location", location)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = dict(parse_qsl(parsed.query))

        # In web mode, /chartburst → /song-burst (alias)
        if WEB_MODE and path.startswith("/chartburst"):
            path = "/song-burst" + path[len("/chartburst"):]

        # In web mode, block internal routes
        if WEB_MODE and not (path == "/" or path.startswith("/song-burst") or path.startswith("/dice")
                            or path.startswith("/manifest") or path.startswith("/apple-touch")
                            or path.startswith("/favicon")):
            self.send_response(404)
            self.end_headers()
            return

        if path == "/":
            self.send_html(build_home_page())

        elif path == "/hello":
            self.send_html(build_hello_page())

        elif path == "/big-ideas":
            self.send_html(build_big_ideas_page())

        elif path == "/dice":
            premium = qs.get("premium") == "1"
            restore_id = qs.get("restore")
            restore_state = None
            if restore_id:
                conn = get_db()
                row = conn.execute("SELECT app_state FROM dice_bug_reports WHERE id=?", (restore_id,)).fetchone()
                conn.close()
                if row:
                    restore_state = row["app_state"]
            self.send_html(build_dice_page(premium=premium, restore_state=restore_state))

        elif path == "/dice/history":
            self.send_html(build_dice_history_page())

        elif path.startswith("/dice/room/") and path.endswith("/stream"):
            # SSE stream for a room
            code = path.split("/")[3].upper()
            conn = get_db()
            room = conn.execute("SELECT * FROM dice_rooms WHERE code=? AND status='active'", (code,)).fetchone()
            conn.close()
            if not room:
                self.send_error(404, "Room not found")
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            q = queue.Queue()
            with _room_streams_lock:
                if code not in _room_streams:
                    _room_streams[code] = []
                if len(_room_streams[code]) >= 20:
                    self.send_error(503, "Room full")
                    return
                _room_streams[code].append(q)
            try:
                # Send initial state
                members = _get_room_members(code)
                packs = _get_room_packs(code)
                init_data = json.dumps({"members": members, "packs": packs})
                self.wfile.write(f"event: init\ndata: {init_data}\n\n".encode())
                self.wfile.flush()
                while True:
                    try:
                        msg = q.get(timeout=30)
                        self.wfile.write(msg.encode())
                        self.wfile.flush()
                    except queue.Empty:
                        # Send keepalive
                        self.wfile.write(": keepalive\n\n".encode())
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                with _room_streams_lock:
                    if code in _room_streams and q in _room_streams[code]:
                        _room_streams[code].remove(q)

        elif path.startswith("/dice/room/") and path.endswith("/log"):
            # Session log page
            code = path.split("/")[3].upper()
            conn = get_db()
            room = conn.execute("SELECT * FROM dice_rooms WHERE code=?", (code,)).fetchone()
            if not room:
                conn.close()
                self.send_error(404, "Room not found")
                return
            rolls = conn.execute(
                "SELECT * FROM dice_room_rolls WHERE room_code=? ORDER BY timestamp ASC",
                (code,)
            ).fetchall()
            members = conn.execute("SELECT DISTINCT player_name as name, player_color as color FROM dice_room_rolls WHERE room_code=?", (code,)).fetchall()
            conn.close()
            self.send_html(build_room_log_page(dict(room), [dict(r) for r in rolls], [dict(m) for m in members]))

        elif path.startswith("/dice/room/") and path.endswith("/info"):
            # Room info (for join dialog)
            code = path.split("/")[3].upper()
            conn = get_db()
            room = conn.execute("SELECT * FROM dice_rooms WHERE code=? AND status='active'", (code,)).fetchone()
            conn.close()
            if not room:
                self.send_json({"error": "Room not found"}, 404)
                return
            taken_colors = _get_room_taken_colors(code)
            members = _get_room_members(code)
            packs = _get_room_packs(code)
            data = json.dumps({"code": code, "takenColors": taken_colors, "members": members, "packs": packs})
            self.send_json(data)

        elif path == "/dice/packs/community":
            conn = get_db()
            rows = conn.execute("SELECT pack_id, name, submitter, presets FROM dice_community_packs ORDER BY approved_at DESC").fetchall()
            conn.close()
            packs = []
            for r in rows:
                presets = json.loads(r["presets"])
                packs.append({"id": r["pack_id"], "name": r["name"], "submitter": r["submitter"], "presets": presets, "category": "Community"})
            self.send_json(packs)

        elif path.startswith("/dice/packs/submissions") and not path.endswith("/approve") and not path.endswith("/reject"):
            if not _check_admin(self):
                self.send_error(404)
                return
            conn = get_db()
            rows = conn.execute("SELECT * FROM dice_pack_submissions ORDER BY submitted_at DESC").fetchall()
            conn.close()
            html = self._build_submissions_page([dict(r) for r in rows])
            self.send_html(html)

        elif path == "/dice/guide":
            self.send_html(build_dice_guide_page())

        elif path == "/dice/bugs":
            conn = get_db()
            reports = conn.execute("SELECT id, created_at, reporter, description, status, notes FROM dice_bug_reports ORDER BY created_at DESC").fetchall()
            conn.close()
            self.send_html(build_dice_bugs_page([dict(r) for r in reports]))

        elif path.startswith("/dice/bugs/"):
            bug_id = path.split("/")[3]
            conn = get_db()
            report = conn.execute("SELECT * FROM dice_bug_reports WHERE id=?", (bug_id,)).fetchone()
            conn.close()
            if report:
                self.send_html(build_dice_bug_detail_page(dict(report)))
            else:
                self.send_error(404, "Bug report not found")

        elif path == "/song-burst":
            self.send_html(build_song_burst_page())

        elif path == "/song-burst/count":
            decades = qs.get("decades")
            genres = qs.get("genres")
            conn = get_db()
            clauses = []
            params = []
            if decades:
                decade_list = [int(d) for d in decades.split(",") if d.strip().isdigit()]
                if decade_list and len(decade_list) < 7:
                    yc = []
                    for d in decade_list:
                        ys = 1900 + d if d >= 50 else 2000 + d
                        yc.append(f"(s.year BETWEEN {ys} AND {ys + 9})")
                    clauses.append("(" + " OR ".join(yc) + ")")
            has_gt = "genre_tags" in [r[1] for r in conn.execute("PRAGMA table_info(song_burst_songs)").fetchall()]
            if genres and has_gt:
                gl = [g.strip() for g in genres.split(",")]
                all_g = {"pop", "newwave", "prog", "metal", "alt", "grunge", "hiphop"}
                sel = set(gl) & all_g
                if sel and sel != all_g:
                    gc = []
                    if "pop" in sel:
                        gc.append("(s.genre_tags IS NULL OR s.genre_tags = '' OR s.genre_tags = 'pop')")
                    for g in ("newwave", "prog", "metal", "alt", "grunge", "hiphop"):
                        if g in sel:
                            gc.append(f"s.genre_tags = '{g}'")
                    if gc:
                        clauses.append("(" + " OR ".join(gc) + ")")
            where = " AND ".join(clauses) if clauses else "1=1"
            cards = conn.execute(f"SELECT COUNT(*) FROM song_burst_cards c JOIN song_burst_songs s ON c.song_id = s.id WHERE {where}", params).fetchone()[0]
            conn.close()
            self.send_json({"cards": cards})

        elif path == "/song-burst/play":
            difficulty = qs.get("difficulty")
            category = qs.get("category")
            decades = qs.get("decades")
            genres = qs.get("genres")
            conn = get_db()
            self.send_html(build_song_burst_play_page(conn, difficulty, category, decades, genres))
            conn.close()

        elif path == "/song-burst/join":
            code = qs.get("code", "").strip().upper()
            self.send_html(_session.build_join_page(code if code else None))

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/lobby$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/lobby$", path).group(1)
            self.send_html(_session.build_lobby_page(code))

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/waiting$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/waiting$", path).group(1)
            team = int(qs.get("team", 1))
            self.send_html(_session.build_waiting_page(code, team))

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/players$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/players$", path).group(1)
            players = _session.get_players(code)
            self.send_json(players)

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/(host|guess|play)$", path):
            m = re.match(r"^/song-burst/session/([A-Z0-9]{4})/(host|guess|play)$", path)
            code = m.group(1)
            team = int(qs.get("team", 1))
            is_creator = qs.get("creator") == "1"
            self.send_html(_session.build_play_page(code, team, is_creator))

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/join$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/join$", path).group(1)
            self.send_html(_session.build_join_page(code))

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/state$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/state$", path).group(1)
            state = _session.get_session_state(code)
            if state:
                self.send_json(state)
            else:
                self.send_json({"error": "not found"}, 404)

        elif path == "/download-db":
            with open(DB_PATH, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", 'attachment; filename="casdra.db"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        elif path == "/restaurant-info":
            conn = get_db()
            self.send_html(build_restaurant_list_page(conn))
            conn.close()

        elif path == "/restaurant-info/changelog":
            conn = get_db()
            self.send_html(build_changelog_page(conn))
            conn.close()

        elif path == "/restaurant-info/search":
            q = qs.get("q", "").strip()
            if not q:
                self.redirect("/restaurant-info")
                return
            conn = get_db()
            self.send_html(build_search_page(conn, q))
            conn.close()

        elif re.match(r"^/restaurant-info/([\w-]+)$", path):
            slug = re.match(r"^/restaurant-info/([\w-]+)$", path).group(1)
            conn = get_db()
            page = build_restaurant_detail_page(conn, slug)
            conn.close()
            if page:
                self.send_html(page)
            else:
                self.send_html("<h1>404 Not Found</h1>", 404)

        elif path == "/supplements":
            conn = get_db()
            self.send_html(build_supplements_list_page(conn))
            conn.close()

        elif re.match(r"^/supplements/(\d+)$", path):
            sup_id = int(re.match(r"^/supplements/(\d+)$", path).group(1))
            fdc_status = qs.get("auto")    # "found"|"not_found"|"rate_limited"|"error"|None
            fdc_label = qs.get("lbl", "")
            conn = get_db()
            page = build_supplement_detail_page(conn, sup_id,
                                                fdc_status=fdc_status,
                                                fdc_label=fdc_label)
            conn.close()
            if page:
                self.send_html(page)
            else:
                self.send_html("<h1>404 Not Found</h1>", 404)

        elif path == "/board-games":
            conn = get_db()
            self.send_html(build_board_games_list_page(conn))
            conn.close()

        elif path == "/board-games/nk-quote":
            conn = get_db()
            self.send_html(build_nk_quote_page(conn))
            conn.close()

        elif path == "/board-games/catalog-search":
            q = parse_qs(parsed.query).get("q", [""])[0].strip()
            conn = get_db()
            existing_ids = {r[0] for r in conn.execute("SELECT bgg_id FROM board_games WHERE bgg_id IS NOT NULL")}
            conn.close()
            self.send_json(_catalog_search(q, exclude_ids=existing_ids))

        elif re.match(r"^/board-games/(\d+)$", path):
            game_id = int(re.match(r"^/board-games/(\d+)$", path).group(1))
            conn = get_db()
            page = build_board_game_detail_page(conn, game_id)
            conn.close()
            if page:
                self.send_html(page)
            else:
                self.send_html("<h1>404 Not Found</h1>", 404)

        elif path == "/music-gear":
            conn = get_db()
            self.send_html(build_gear_list_page(conn))
            conn.close()

        elif re.match(r"^/music-gear/(\d+)$", path):
            gear_id = int(re.match(r"^/music-gear/(\d+)$", path).group(1))
            conn = get_db()
            page = build_gear_detail_page(conn, gear_id)
            conn.close()
            if page:
                self.send_html(page)
            else:
                self.send_html("<h1>404 Not Found</h1>", 404)

        elif path == "/api/gear-prices":
            self.send_json(json.dumps(get_for_sale_gear_prices()))

        elif path.startswith("/api/gear-price/"):
            try:
                gid = int(path.split("/")[-1])
            except ValueError:
                self.send_error(400, "Invalid gear ID")
                return
            price = get_gear_price(gid)
            self.send_json(json.dumps(price or {}))

        elif path == "/api/restaurants":
            conn = get_db()
            rests = get_all_restaurants(conn)
            conn.close()
            self.send_json(json.dumps([
                {"id": r["id"], "name": r["name"],
                 "servers": [dict(i) for i in r["servers"]],
                 "food": [dict(i) for i in r["food"]],
                 "other": [dict(i) for i in r["other"]]}
                for r in rests
            ]))

        elif path == "/api/changelog":
            conn = get_db()
            rows = conn.execute("SELECT * FROM change_log ORDER BY id DESC LIMIT 200").fetchall()
            conn.close()
            self.send_json(json.dumps([
                {"id": r["id"], "timestamp": r["timestamp"], "action": r["action"],
                 "description": r["description"], "snapshot": json.loads(r["snapshot"])}
                for r in rows
            ]))

        elif path == "/api/board-game-prices":
            self.send_json(json.dumps(get_for_sale_prices()))

        elif path.startswith("/api/board-game-price/"):
            try:
                gid = int(path.split("/")[-1])
            except ValueError:
                self.send_error(400, "Invalid game ID")
                return
            price = get_game_price(gid)
            self.send_json(json.dumps(price or {}))

        elif path == "/manifest.json":
            manifest = json.dumps({
                "name": "Casdra",
                "short_name": "Casdra",
                "description": "Restaurant & supplement tracker",
                "start_url": "/",
                "display": "standalone",
                "background_color": "#fdf0f5",
                "theme_color": "#e91e8c",
                "icons": [{"src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png"}]
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/manifest+json")
            self.send_header("Content-Length", str(len(manifest)))
            self.end_headers()
            self.wfile.write(manifest)

        elif path in ("/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"):
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(APPLE_TOUCH_ICON_PNG)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(APPLE_TOUCH_ICON_PNG)

        elif path == "/favicon.ico":
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(APPLE_TOUCH_ICON_PNG)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(APPLE_TOUCH_ICON_PNG)

        else:
            self.send_html("<h1>404 Not Found</h1>", 404)

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        # Reject oversized payloads (max 1MB)
        if content_length > 1_000_000:
            self.send_json({"error": "Payload too large"}, 413)
            return
        body = self.rfile.read(content_length).decode()
        params = parse_qs(body)

        def p(key, default=None):
            vals = params.get(key)
            return vals[0] if vals else default

        # In web mode, /chartburst → /song-burst (alias)
        if WEB_MODE and self.path.startswith("/chartburst"):
            self.path = "/song-burst" + self.path[len("/chartburst"):]

        # In web mode, block internal POST routes (allow song-burst + dice)
        if WEB_MODE and not (self.path.startswith("/song-burst") or self.path.startswith("/dice")):
            self.send_response(404)
            self.end_headers()
            return

        path = self.path

        if path == "/restaurant-info/add-restaurant":
            name = p("name", "").strip()
            if not name:
                self.send_json({"ok": False, "error": "Name is required"}, 400)
            else:
                conn = get_db()
                slug = unique_slug(conn, name)
                conn.execute("INSERT INTO restaurants (name, slug) VALUES (?, ?)", (name, slug))
                log_change(conn, "add", f'Added restaurant "{name}"')
                conn.commit()
                conn.close()
                self.send_json({"ok": True, "slug": slug})

        elif path == "/restaurant-info/add-item":
            restaurant_id = p("restaurant_id")
            category = p("category")
            value = p("value")
            info = p("info", "")
            if restaurant_id and category and value:
                conn = get_db()
                rid = int(restaurant_id)
                rest = conn.execute("SELECT name FROM restaurants WHERE id = ?", (rid,)).fetchone()
                rest_name = rest["name"] if rest else str(rid)
                cur = conn.execute(
                    "INSERT INTO restaurant_items (restaurant_id, category, value, info) VALUES (?, ?, ?, ?)",
                    (rid, category, value, info),
                )
                new_id = cur.lastrowid
                cat_label = category[:-1] if category.endswith("s") else category
                log_change(conn, "add", f'Added {cat_label} "{value}" to {rest_name}', {
                    "item_id": new_id, "restaurant_id": rid, "category": category,
                    "value": value, "info": info,
                })
                conn.commit()
                conn.close()
            self.send_json({"ok": True})

        elif path == "/restaurant-info/update-item":
            item_id = p("item_id")
            value = p("value")
            info = p("info")
            if item_id and value is not None:
                conn = get_db()
                iid = int(item_id)
                old = conn.execute(
                    "SELECT ri.*, r.name as rest_name FROM restaurant_items ri "
                    "JOIN restaurants r ON r.id = ri.restaurant_id WHERE ri.id = ?", (iid,)
                ).fetchone()
                if old:
                    snapshot = {"item_id": iid, "restaurant_id": old["restaurant_id"],
                                "category": old["category"], "value": old["value"], "info": old["info"]}
                    desc = f'Updated "{old["value"]}" in {old["rest_name"]}'
                    if info is not None:
                        conn.execute("UPDATE restaurant_items SET value = ?, info = ? WHERE id = ?",
                                     (value, info, iid))
                    else:
                        conn.execute("UPDATE restaurant_items SET value = ? WHERE id = ?", (value, iid))
                    log_change(conn, "update", desc, snapshot)
                conn.commit()
                conn.close()
            self.send_json({"ok": True})

        elif path == "/restaurant-info/delete-item":
            item_id = p("item_id")
            if item_id:
                conn = get_db()
                iid = int(item_id)
                old = conn.execute(
                    "SELECT ri.*, r.name as rest_name FROM restaurant_items ri "
                    "JOIN restaurants r ON r.id = ri.restaurant_id WHERE ri.id = ?", (iid,)
                ).fetchone()
                if old:
                    snapshot = {"item_id": iid, "restaurant_id": old["restaurant_id"],
                                "category": old["category"], "value": old["value"], "info": old["info"]}
                    log_change(conn, "delete", f'Deleted "{old["value"]}" from {old["rest_name"]}', snapshot)
                conn.execute("DELETE FROM restaurant_items WHERE id = ?", (iid,))
                conn.commit()
                conn.close()
            self.send_json({"ok": True})

        elif path == "/restaurant-info/rename-restaurant":
            restaurant_id = p("restaurant_id")
            name = p("name")
            if restaurant_id and name:
                name = name.strip()
                rid = int(restaurant_id)
                conn = get_db()
                src = conn.execute("SELECT name, slug FROM restaurants WHERE id = ?", (rid,)).fetchone()
                old_name = src["name"] if src else str(rid)
                old_slug = src["slug"] if src else ""
                existing = conn.execute(
                    "SELECT id, name, slug FROM restaurants WHERE LOWER(name) = LOWER(?) AND id != ?",
                    (name, rid)
                ).fetchone()
                if existing:
                    target_id = existing[0]
                    target_slug = existing["slug"]
                    moved_ids = [row[0] for row in conn.execute(
                        "SELECT id FROM restaurant_items WHERE restaurant_id = ?", (rid,)
                    ).fetchall()]
                    conn.execute("UPDATE restaurant_items SET restaurant_id = ? WHERE restaurant_id = ?",
                                 (target_id, rid))
                    conn.execute("DELETE FROM restaurants WHERE id = ?", (rid,))
                    log_change(conn, "merge", f'Merged "{old_name}" into "{existing["name"]}"', {
                        "deleted_restaurant_id": rid, "deleted_restaurant_name": old_name,
                        "deleted_restaurant_slug": old_slug,
                        "target_id": target_id, "moved_item_ids": moved_ids,
                    })
                    conn.commit()
                    conn.close()
                    self.send_json({"ok": True, "merged": True, "target_id": target_id, "target_slug": target_slug})
                else:
                    new_slug = unique_slug(conn, name, exclude_id=rid)
                    conn.execute("UPDATE restaurants SET name = ?, slug = ? WHERE id = ?", (name, new_slug, rid))
                    log_change(conn, "rename", f'Renamed restaurant "{old_name}" to "{name}"', {
                        "restaurant_id": rid, "old_name": old_name, "new_name": name,
                        "old_slug": old_slug, "new_slug": new_slug,
                    })
                    conn.commit()
                    conn.close()
                    self.send_json({"ok": True, "merged": False, "slug": new_slug})

        elif path == "/restaurant-info/revert-change":
            log_id = p("log_id")
            if log_id:
                conn = get_db()
                entry = conn.execute("SELECT * FROM change_log WHERE id = ?", (int(log_id),)).fetchone()
                if entry:
                    action = entry["action"]
                    snap = json.loads(entry["snapshot"])
                    ok = True
                    if action == "add":
                        conn.execute("DELETE FROM restaurant_items WHERE id = ?", (snap["item_id"],))
                        log_change(conn, "revert", f'Reverted: {entry["description"]}')
                    elif action == "update":
                        conn.execute(
                            "UPDATE restaurant_items SET value = ?, info = ? WHERE id = ?",
                            (snap["value"], snap["info"], snap["item_id"])
                        )
                        log_change(conn, "revert", f'Reverted: {entry["description"]}')
                    elif action == "delete":
                        rest = conn.execute("SELECT id FROM restaurants WHERE id = ?",
                                            (snap["restaurant_id"],)).fetchone()
                        if rest:
                            conn.execute(
                                "INSERT INTO restaurant_items (restaurant_id, category, value, info) "
                                "VALUES (?, ?, ?, ?)",
                                (snap["restaurant_id"], snap["category"], snap["value"], snap["info"])
                            )
                            log_change(conn, "revert", f'Reverted: {entry["description"]}')
                        else:
                            ok = False
                    elif action == "rename":
                        conn.execute("UPDATE restaurants SET name = ?, slug = ? WHERE id = ?",
                                     (snap["old_name"], snap.get("old_slug", slugify(snap["old_name"])), snap["restaurant_id"]))
                        log_change(conn, "revert", f'Reverted: {entry["description"]}')
                    elif action == "merge":
                        restored_slug = snap.get("deleted_restaurant_slug") or unique_slug(conn, snap["deleted_restaurant_name"])
                        cur = conn.execute("INSERT INTO restaurants (name, slug) VALUES (?, ?)",
                                           (snap["deleted_restaurant_name"], restored_slug))
                        new_rid = cur.lastrowid
                        if snap.get("moved_item_ids"):
                            placeholders = ",".join("?" * len(snap["moved_item_ids"]))
                            conn.execute(
                                f"UPDATE restaurant_items SET restaurant_id = ? WHERE id IN ({placeholders})",
                                [new_rid] + snap["moved_item_ids"]
                            )
                        log_change(conn, "revert", f'Reverted: {entry["description"]}')
                    else:
                        ok = False
                    conn.commit()
                    conn.close()
                    self.send_json({"ok": ok})
                    return
                conn.close()
            self.send_json({"ok": False})

        elif path == "/supplements/add":
            name = p("name", "").strip()
            url = p("url", "").strip()
            per_day = p("per_day", "1")
            if name:
                try:
                    per_day_f = max(0.5, float(per_day))
                except (ValueError, TypeError):
                    per_day_f = 1.0
                # Look up nutrients from NIH Office of Dietary Supplements (DSLD)
                nutrients, fdc_status, fdc_label, dsld_url = fetch_supplement_nutrients(name, url)
                nutrients_json = json.dumps(nutrients)
                conn = get_db()
                cur = conn.execute(
                    "INSERT INTO supplements (name, url, per_day, nutrients, dsld_url) VALUES (?, ?, ?, ?, ?)",
                    (name, url, per_day_f, nutrients_json, dsld_url),
                )
                new_id = cur.lastrowid
                conn.commit()
                conn.close()
                self.send_json({"ok": True, "id": new_id,
                                "fdc_status": fdc_status, "fdc_label": fdc_label})
            else:
                self.send_json({"ok": False, "id": None})

        elif path == "/supplements/update":
            sup_id = p("id")
            name = p("name", "").strip()
            url = p("url", "").strip()
            per_day = p("per_day", "1")
            nutrients_raw = p("nutrients", "{}")
            if sup_id and name:
                try:
                    per_day_f = max(0.5, float(per_day))
                except (ValueError, TypeError):
                    per_day_f = 1.0
                try:
                    nutrients_dict = json.loads(nutrients_raw)
                    nutrients_json = json.dumps(nutrients_dict)
                except (json.JSONDecodeError, TypeError):
                    nutrients_json = "{}"
                conn = get_db()
                conn.execute(
                    "UPDATE supplements SET name = ?, url = ?, per_day = ?, nutrients = ? WHERE id = ?",
                    (name, url, per_day_f, nutrients_json, int(sup_id)),
                )
                conn.commit()
                conn.close()
            self.send_json({"ok": True})

        elif path == "/supplements/delete":
            sup_id = p("id")
            if sup_id:
                conn = get_db()
                conn.execute("DELETE FROM supplements WHERE id = ?", (int(sup_id),))
                conn.commit()
                conn.close()
            self.send_json({"ok": True})

        elif path == "/board-games/add":
            bgg_id_param = p("bgg_id", "").strip()
            query = p("query", "").strip()
            lookup = (f"https://boardgamegeek.com/boardgame/{bgg_id_param}"
                      if bgg_id_param else query)
            if lookup:
                try:
                    (name, bgg_id, bgg_url, image_url,
                     min_players, max_players, best_players,
                     min_playtime, max_playtime, weight, cooperative, solo) = lookup_bgg_game(lookup)
                    conn = get_db()
                    existing = conn.execute(
                        "SELECT id FROM board_games WHERE bgg_id = ?", (bgg_id,)
                    ).fetchone()
                    if existing:
                        conn.close()
                        self.send_json({"ok": False, "error": f"{name} is already in your collection."})
                        return
                    cur = conn.execute(
                        "INSERT INTO board_games (name, bgg_id, bgg_url, image_url,"
                        " min_players, max_players, best_players,"
                        " min_playtime, max_playtime, weight, cooperative, solo)"
                        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (name, bgg_id, bgg_url, image_url,
                         min_players, max_players, best_players,
                         min_playtime, max_playtime, weight, cooperative, solo),
                    )
                    new_id = cur.lastrowid
                    conn.commit()
                    conn.close()
                    self.send_json({"ok": True, "id": new_id})
                except Exception as exc:
                    self.send_json({"ok": False, "error": str(exc)})
            else:
                self.send_json({"ok": False, "error": "Enter a game name or BGG URL"})

        elif path == "/board-games/set-image":
            game_id = p("id")
            image_url = p("image_url", "").strip()
            if game_id and image_url:
                conn = get_db()
                conn.execute("UPDATE board_games SET image_url = ? WHERE id = ?",
                             (image_url, int(game_id)))
                conn.commit()
                conn.close()
                self.send_json({"ok": True})
            else:
                self.send_json({"ok": False, "error": "Missing id or image_url"})

        elif path == "/board-games/delete":
            game_id = p("id")
            if game_id:
                conn = get_db()
                conn.execute("DELETE FROM board_games WHERE id = ?", (int(game_id),))
                conn.commit()
                conn.close()
            self.send_json({"ok": True})

        elif path == "/board-games/set-flag":
            game_id = p("id")
            field   = p("field", "")
            value   = p("value")
            allowed = {"shrink_wrapped", "played_in_hawaii", "for_sale", "cooperative", "solo"}
            if game_id and field in allowed and value is not None:
                conn = get_db()
                conn.execute(f"UPDATE board_games SET {field} = ? WHERE id = ?",
                             (int(value), int(game_id)))
                conn.commit()
                conn.close()
                self.send_json({"ok": True})
            else:
                self.send_json({"ok": False, "error": "Invalid request"}, 400)

        elif path == "/music-gear/add":
            url = p("url", "").strip()
            if url:
                try:
                    (name, reverb_id, reverb_url, image_url,
                     make, model, condition) = lookup_reverb_listing(url)
                    conn = get_db()
                    existing = conn.execute(
                        "SELECT id FROM music_gear WHERE reverb_id = ?", (reverb_id,)
                    ).fetchone()
                    if existing:
                        conn.close()
                        self.send_json({"ok": False, "error": f"{name} is already in your collection."})
                        return
                    cur = conn.execute(
                        "INSERT INTO music_gear (name, reverb_id, reverb_url, image_url,"
                        " make, model, condition)"
                        " VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (name, reverb_id, reverb_url, image_url,
                         make, model, condition),
                    )
                    new_id = cur.lastrowid
                    conn.commit()
                    conn.close()
                    self.send_json({"ok": True, "id": new_id})
                except Exception as exc:
                    self.send_json({"ok": False, "error": str(exc)})
            else:
                self.send_json({"ok": False, "error": "Paste a Reverb URL"})

        elif path == "/music-gear/set-image":
            gear_id = p("id")
            image_url = p("image_url", "").strip()
            if gear_id and image_url:
                conn = get_db()
                conn.execute("UPDATE music_gear SET image_url = ? WHERE id = ?",
                             (image_url, int(gear_id)))
                conn.commit()
                conn.close()
                self.send_json({"ok": True})
            else:
                self.send_json({"ok": False, "error": "Missing id or image_url"})

        elif path == "/music-gear/delete":
            gear_id = p("id")
            if gear_id:
                conn = get_db()
                conn.execute("DELETE FROM music_gear WHERE id = ?", (int(gear_id),))
                conn.commit()
                conn.close()
            self.send_json({"ok": True})

        elif path == "/music-gear/set-flag":
            gear_id = p("id")
            field   = p("field", "")
            value   = p("value")
            allowed = {"shrink_wrapped", "for_sale"}
            if gear_id and field in allowed and value is not None:
                conn = get_db()
                conn.execute(f"UPDATE music_gear SET {field} = ? WHERE id = ?",
                             (int(value), int(gear_id)))
                conn.commit()
                conn.close()
                self.send_json({"ok": True})
            else:
                self.send_json({"ok": False, "error": "Invalid request"}, 400)

        elif path == "/dice/room/create":
            if not _rate_check(self.client_address[0], 'room_create', 3):
                self.send_json({"error": "Too many rooms created. Try again later."}, 429)
                return
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                data = {}
            name = (data.get("name") or "").strip()[:30]
            color = (data.get("color") or ROOM_COLORS[0]).strip()
            if not name:
                self.send_json({"error": "Name required"}, 400)
                return
            _room_cleanup()
            code = _generate_room_code()
            if not code:
                self.send_json({"error": "Could not generate room code"}, 500)
                return
            conn = get_db()
            conn.execute("INSERT INTO dice_rooms (code, host_name) VALUES (?, ?)", (code, name))
            conn.execute("INSERT INTO dice_room_members (room_code, name, color) VALUES (?, ?, ?)", (code, name, color))
            conn.commit()
            conn.close()
            resp = json.dumps({"code": code, "name": name, "color": color})
            self.send_json(resp)

        elif path == "/dice/room/join":
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                data = {}
            code = (data.get("code") or "").strip().upper()[:4]
            name = (data.get("name") or "").strip()[:30]
            color = (data.get("color") or ROOM_COLORS[0]).strip()
            conn = get_db()
            room = conn.execute("SELECT * FROM dice_rooms WHERE code=? AND status='active'", (code,)).fetchone()
            if not room:
                conn.close()
                self.send_json({"error": "Room not found"}, 404)
                return
            # Remove any existing member with same name, then re-add (rejoin case)
            conn.execute("DELETE FROM dice_room_members WHERE room_code=? AND name=?", (code, name))
            conn.execute("INSERT INTO dice_room_members (room_code, name, color) VALUES (?, ?, ?)", (code, name, color))
            conn.commit()
            packs = [r['pack_id'] for r in conn.execute("SELECT pack_id FROM dice_room_packs WHERE room_code=?", (code,)).fetchall()]
            conn.close()
            _room_touch(code)
            _room_broadcast(code, "join", {"name": name, "color": color})
            resp = json.dumps({"code": code, "name": name, "color": color, "host": room["host_name"], "packs": packs})
            self.send_json(resp)

        elif path == "/dice/room/roll":
            if not _rate_check(self.client_address[0], 'room_roll', 30):
                self.send_json({"error": "Slow down"}, 429)
                return
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                data = {}
            code = (data.get("code") or "").strip().upper()[:4]
            name = (data.get("name") or "").strip()[:30]
            color = (data.get("color") or "").strip()[:10]
            expression = (data.get("expression") or "").strip()[:200]
            fav_name = (data.get("favName") or "").strip()[:60]
            result_data = json.dumps(data.get("resultData") or {})[:4096]
            # Verify room exists and is active
            conn = get_db()
            room = conn.execute("SELECT 1 FROM dice_rooms WHERE code=? AND status='active'", (code,)).fetchone()
            if not room:
                conn.close()
                self.send_json({"error": "Room not found"}, 404)
                return
            conn.execute(
                "INSERT INTO dice_room_rolls (room_code, player_name, player_color, expression, fav_name, result_data) VALUES (?, ?, ?, ?, ?, ?)",
                (code, name, color, expression, fav_name, result_data)
            )
            conn.commit()
            conn.close()
            _room_touch(code)
            _room_broadcast(code, "roll", {
                "name": name, "color": color, "expression": expression,
                "favName": fav_name, "resultData": data.get("resultData") or {}
            })
            self.send_json({"ok": True})

        elif path == "/dice/room/push-pack":
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                data = {}
            code = (data.get("code") or "").strip().upper()
            pack_id = (data.get("packId") or "").strip()
            name = (data.get("name") or "").strip()
            conn = get_db()
            room = conn.execute("SELECT host_name FROM dice_rooms WHERE code=? AND status='active'", (code,)).fetchone()
            if not room or room["host_name"] != name:
                conn.close()
                self.send_json({"error": "Not the host"}, 403)
                return
            # Check if already pushed
            exists = conn.execute("SELECT 1 FROM dice_room_packs WHERE room_code=? AND pack_id=?", (code, pack_id)).fetchone()
            if not exists:
                conn.execute("INSERT INTO dice_room_packs (room_code, pack_id) VALUES (?, ?)", (code, pack_id))
                conn.commit()
            conn.close()
            _room_broadcast(code, "pack-push", {"packId": pack_id})
            self.send_json({"ok": True})

        elif path == "/dice/room/close":
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                data = {}
            code = (data.get("code") or "").strip().upper()
            name = (data.get("name") or "").strip()
            conn = get_db()
            room = conn.execute("SELECT host_name FROM dice_rooms WHERE code=? AND status='active'", (code,)).fetchone()
            if not room or room["host_name"] != name:
                conn.close()
                self.send_json({"error": "Not the host"}, 403)
                return
            conn.execute("UPDATE dice_rooms SET status='closed' WHERE code=?", (code,))
            conn.execute("DELETE FROM dice_room_members WHERE room_code=?", (code,))
            conn.commit()
            conn.close()
            _room_broadcast(code, "room-closed", {"code": code})
            # Clean up SSE streams
            with _room_streams_lock:
                _room_streams.pop(code, None)
            self.send_json({"ok": True})

        elif path == "/dice/room/leave":
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                data = {}
            code = (data.get("code") or "").strip().upper()
            name = (data.get("name") or "").strip()
            conn = get_db()
            conn.execute("DELETE FROM dice_room_members WHERE room_code=? AND name=?", (code, name))
            conn.commit()
            conn.close()
            _room_broadcast(code, "leave", {"name": name})
            self.send_json({"ok": True})

        elif path == "/dice/room/color":
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                data = {}
            code = (data.get("code") or "").strip().upper()
            name = (data.get("name") or "").strip()[:30]
            color = (data.get("color") or "").strip()
            if color not in ROOM_COLORS:
                self.send_json({"error": "Invalid color"}, 400)
                return
            conn = get_db()
            conn.execute("UPDATE dice_room_members SET color=? WHERE room_code=? AND name=?", (color, code, name))
            conn.commit()
            conn.close()
            _room_broadcast(code, "color-change", {"name": name, "color": color})
            self.send_json({"ok": True})

        elif path == "/dice/pack/submit":
            if not _rate_check(self.client_address[0], 'pack_submit', 3):
                self.send_json({"error": "Too many submissions. Try again later."}, 429)
                return
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, ValueError):
                data = {}
            pack_name = (data.get("name") or "").strip()[:60]
            submitter = (data.get("submitter") or "").strip()[:30]
            presets = data.get("presets")
            if not pack_name or not submitter or not presets:
                self.send_json({"error": "Name, submitter, and presets required"}, 400)
                return
            if not isinstance(presets, list) or len(presets) > 50:
                self.send_json({"error": "Invalid presets (max 50)"}, 400)
                return
            presets_json = json.dumps(presets)
            if len(presets_json) > 65536:
                self.send_json({"error": "Pack too large"}, 400)
                return
            conn = get_db()
            conn.execute(
                "INSERT INTO dice_pack_submissions (pack_name, submitter, presets) VALUES (?, ?, ?)",
                (pack_name, submitter, presets_json)
            )
            conn.commit()
            conn.close()
            self.send_json({"ok": True})

        elif path.startswith("/dice/packs/submissions/") and path.endswith("/approve"):
            if not _check_admin(self):
                self.send_json({"error": "Not authorized"}, 403)
                return
            sub_id = path.split("/")[4]
            conn = get_db()
            sub = conn.execute("SELECT * FROM dice_pack_submissions WHERE id=? AND status='pending'", (sub_id,)).fetchone()
            if not sub:
                conn.close()
                self.send_json({"error": "Not found"}, 404)
                return
            pack_id = "community-" + sub["pack_name"].lower().replace(" ", "-").replace("'", "")[:40]
            # Ensure unique pack_id
            existing = conn.execute("SELECT 1 FROM dice_community_packs WHERE pack_id=?", (pack_id,)).fetchone()
            if existing:
                pack_id += "-" + str(sub["id"])
            conn.execute(
                "INSERT INTO dice_community_packs (pack_id, name, submitter, presets) VALUES (?, ?, ?, ?)",
                (pack_id, sub["pack_name"], sub["submitter"], sub["presets"])
            )
            conn.execute("UPDATE dice_pack_submissions SET status='approved' WHERE id=?", (sub_id,))
            conn.commit()
            conn.close()
            self.send_json({"ok": True, "packId": pack_id})

        elif path.startswith("/dice/packs/submissions/") and path.endswith("/reject"):
            if not _check_admin(self):
                self.send_json({"error": "Not authorized"}, 403)
                return
            sub_id = path.split("/")[4]
            conn = get_db()
            conn.execute("UPDATE dice_pack_submissions SET status='rejected' WHERE id=?", (sub_id,))
            conn.commit()
            conn.close()
            self.send_json({"ok": True})

        elif path == "/dice/bug":
            if not _rate_check(self.client_address[0], 'bug_report', 5):
                self.send_json({"error": "Too many reports. Try again later."}, 429)
                return
            try:
                data = json.loads(body) if body.startswith("{") else {}
            except (json.JSONDecodeError, ValueError):
                data = {}
            reporter = (data.get("reporter") or "").strip()[:100]
            description = (data.get("description") or "").strip()[:2000]
            screenshot = (data.get("screenshot") or "")[:500000]  # ~500KB max
            app_state = json.dumps(data.get("app_state", {}))[:200000]  # ~200KB max
            if reporter and description:
                conn = get_db()
                conn.execute(
                    "INSERT INTO dice_bug_reports (reporter, description, screenshot, app_state) VALUES (?, ?, ?, ?)",
                    (reporter, description, screenshot, app_state)
                )
                conn.commit()
                conn.close()
                self.send_json({"ok": True})
            else:
                self.send_json({"ok": False, "error": "Name and description required"}, 400)

        elif path.startswith("/dice/bugs/") and path.endswith("/status"):
            bug_id = path.split("/")[3]
            try:
                data = json.loads(body) if body.startswith("{") else {}
            except (json.JSONDecodeError, ValueError):
                data = {}
            conn = get_db()
            conn.execute("UPDATE dice_bug_reports SET status=?, notes=? WHERE id=?",
                         (data.get("status", "open"), data.get("notes", ""), bug_id))
            conn.commit()
            conn.close()
            self.send_json({"ok": True})

        elif path == "/song-burst/session/create":
            try:
                data = json.loads(body) if body.startswith("{") else {}
            except (json.JSONDecodeError, ValueError):
                data = {}
            code = _session.create_session(
                decades=data.get("decades"),
                genres=data.get("genres"),
                team1_name=data.get("team1", "Team 1"),
                team2_name=data.get("team2", "Team 2"),
                card_limit=int(data.get("card_limit", 0)),
                game_name=data.get("game_name", ""),
                difficulties=data.get("difficulties", ""),
            )
            self.send_json({"code": code})

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/join$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/join$", path).group(1)
            try:
                data = json.loads(body) if body.startswith("{") else {}
            except (json.JSONDecodeError, ValueError):
                data = {}
            _session.add_player(
                code,
                player_name=data.get("name", "Player"),
                team=int(data.get("team", 1)),
                is_host=data.get("is_host", False),
            )
            self.send_json({"ok": True})

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/start$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/start$", path).group(1)
            _session.start_game(code)
            self.send_json({"ok": True})

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/advance$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/advance$", path).group(1)
            result = _session.advance_clue(code)
            self.send_json({"ok": True, "level": result})

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/accept$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/accept$", path).group(1)
            result = _session.accept_answer(code)
            self.send_json({"ok": True, **(result or {})})

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/miss$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/miss$", path).group(1)
            result = _session.miss_card(code)
            self.send_json({"ok": True, **(result or {})})

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/skip$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/skip$", path).group(1)
            result = _session.skip_card(code)
            self.send_json({"ok": True, **(result or {})})

        elif re.match(r"^/song-burst/session/([A-Z0-9]{4})/end$", path):
            code = re.match(r"^/song-burst/session/([A-Z0-9]{4})/end$", path).group(1)
            conn = get_db()
            conn.execute("UPDATE game_sessions SET status = 'ended' WHERE id = ?", (code,))
            conn.commit()
            conn.close()
            self.send_json({"ok": True})

        elif path == "/song-burst/report":
            try:
                data = json.loads(body) if body.startswith("{") else {}
            except (json.JSONDecodeError, ValueError):
                data = {}
            card_id = data.get("card_id")
            song_id = data.get("song_id")
            action = data.get("action", "")
            if card_id and action in ("bad_album", "remake_card", "change_difficulty"):
                conn = get_db()
                if action == "bad_album":
                    # Add current album to blacklist before clearing
                    song = conn.execute("SELECT album, bad_albums FROM song_burst_songs WHERE id = ?",
                                        (int(song_id),)).fetchone()
                    if song:
                        current_album = song[0] or ""
                        existing_bad = song[1] or ""
                        if current_album and current_album != "NEEDS_REFETCH":
                            bad_list = [b for b in existing_bad.split("|") if b] + [current_album]
                            conn.execute("UPDATE song_burst_songs SET bad_albums = ? WHERE id = ?",
                                         ("|".join(bad_list), int(song_id)))
                    conn.execute("UPDATE song_burst_songs SET album = 'NEEDS_REFETCH', album_art_url = NULL WHERE id = ?",
                                 (int(song_id),))
                elif action == "remake_card":
                    conn.execute("DELETE FROM song_burst_cards WHERE id = ?", (int(card_id),))
                elif action == "change_difficulty":
                    new_diff = data.get("new_difficulty", "")
                    if new_diff in ("easy", "medium", "hard"):
                        conn.execute("UPDATE song_burst_cards SET difficulty = ? WHERE id = ?",
                                     (new_diff, int(card_id)))
                conn.commit()
                conn.close()
                self.send_json({"ok": True})
            else:
                self.send_json({"ok": False, "error": "Invalid report"}, 400)

        else:
            self.send_json({"ok": False}, 404)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def free_port(port):
    """Kill any process listening on the given port."""
    import socket, subprocess, sys
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", port)) != 0:
            return  # port is already free
    try:
        if sys.platform == "win32":
            out = subprocess.check_output(
                f"netstat -ano | findstr :{port}", shell=True).decode()
            for line in out.splitlines():
                parts = line.split()
                if parts and parts[-1].isdigit():
                    os.kill(int(parts[-1]), signal.SIGTERM)
        else:
            out = subprocess.check_output(
                ["lsof", "-ti", f":{port}"]).decode().strip()
            for pid in out.splitlines():
                os.kill(int(pid), signal.SIGTERM)
        import time as _t; _t.sleep(0.3)
        print(f"Freed port {port}")
    except Exception as e:
        print(f"Could not free port {port}: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--debug", action="store_true", help="Bind to localhost only")
    args = parser.parse_args()

    port = int(os.environ.get("PORT", 8000))
    if args.debug:
        host = "127.0.0.1"
    elif os.environ.get("RAILWAY_ENVIRONMENT"):
        host = "0.0.0.0"
    else:
        host = "100.81.129.123"
    if host != "0.0.0.0":
        free_port(port)
    init_db()
    load_catalog()
    server = ThreadingHTTPServer((host, port), Handler)
    server.socket.setsockopt(__import__("socket").SOL_SOCKET, __import__("socket").SO_REUSEADDR, 1)
    print(f"Server running at http://localhost:{port}")
    if not args.debug:
        print("Network:          http://100.81.129.123:8000")
    server.serve_forever()
