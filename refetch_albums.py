#!/usr/bin/env python3
"""Process songs marked NEEDS_REFETCH and look up correct albums.

Uses strict search: rejects compilations, live albums, soundtracks,
non-English titles, and blacklisted albums. Run periodically by
deployer or manually.
"""

import json
import re
import sqlite3
import time
import urllib.parse
import urllib.request

DB_PATH = "casdra.db"
MB_BASE = "https://musicbrainz.org/ws/2/recording"
HEADERS = {"User-Agent": "CasdraBot/1.0 (personal project)"}

# Combined reject patterns from fix_compilations.py + fix_live_albums.py
BAD_ALBUM_WORDS = re.compile(
    r"(greatest|hits|collection|best of|anthology|essential|ultimate|"
    r"gold|legends|classic|definitive|#1|number one|top \d|"
    r"mix |dance mix|rock mix|power ballad|love songs|"
    r"various|sampler|soundtrack|karaoke|tribute|cover|halloween|christmas|"
    r"party|driving|workout|road trip|NOW that|jukebox|monster|"
    r"60.s|70.s|80.s|90.s|sixties|seventies|eighties|nineties|"
    r"live|concert|tour|unplugged|bootleg|broadcasting|stadium|"
    r"coliseum|amphitheatre|palladium|knebworth|budokan|"
    r"\d{4}-\d{2}-\d{2}|, USA|, UK|, NY|, CA|, PA|, TX)",
    re.IGNORECASE,
)

# Reject non-Latin script album titles
NON_ENGLISH = re.compile(r"[^\x00-\x7F]{3,}")


def normalize_artist(name):
    name = name.lower()
    name = re.sub(r"\s*(featuring|feat\.?|ft\.?|with|and|&|vs\.?)\s+.*", "", name)
    name = re.sub(r"^the\s+", "", name)
    name = re.sub(r"[^\w\s]", "", name)
    return name.strip()


def artists_match(expected, actual):
    e = normalize_artist(expected)
    a = normalize_artist(actual)
    return e in a or a in e


def search_clean_album(title, artist, blacklist=None):
    """Search MusicBrainz for a studio album, rejecting bad matches."""
    blacklist = blacklist or set()

    query = f'recording:"{title}" AND artist:"{artist}"'
    params = urllib.parse.urlencode({"query": query, "fmt": "json", "limit": 15})
    url = f"{MB_BASE}?{params}"

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None

    for rec in data.get("recordings", []):
        rec_artists = " ".join(
            ac.get("artist", {}).get("name", "") for ac in rec.get("artist-credit", [])
        )
        if not artists_match(artist, rec_artists):
            continue

        for rel in rec.get("releases", []):
            rg = rel.get("release-group", {})
            primary = rg.get("primary-type", "")
            secondary = rg.get("secondary-types", [])
            album_title = rel.get("title", "")

            # Must be Album
            if primary != "Album":
                continue
            # No compilations, soundtracks, live
            if any(s in secondary for s in ["Compilation", "Soundtrack", "Live"]):
                continue
            # Reject bad title patterns
            if BAD_ALBUM_WORDS.search(album_title):
                continue
            # Reject non-English titles
            if NON_ENGLISH.search(album_title):
                continue
            # Reject blacklisted albums
            if album_title in blacklist:
                continue

            return album_title

    return None


def main():
    db = sqlite3.connect(DB_PATH, timeout=30)

    # Add bad_albums column if missing
    cols = [r[1] for r in db.execute("PRAGMA table_info(song_burst_songs)").fetchall()]
    if "bad_albums" not in cols:
        db.execute("ALTER TABLE song_burst_songs ADD COLUMN bad_albums TEXT DEFAULT ''")
        db.commit()

    rows = db.execute(
        "SELECT id, title, artist, bad_albums FROM song_burst_songs WHERE album = 'NEEDS_REFETCH'"
    ).fetchall()

    if not rows:
        print("No songs need refetching.")
        return

    print(f"Refetching albums for {len(rows)} songs...\n")
    fixed = 0
    cleared = 0

    for song_id, title, artist, bad_albums_str in rows:
        blacklist = set(b for b in (bad_albums_str or "").split("|") if b)
        print(f"  {title} - {artist} (blacklist: {len(blacklist)})...", end=" ", flush=True)

        new_album = search_clean_album(title, artist, blacklist)

        if new_album:
            db.execute("UPDATE song_burst_songs SET album = ? WHERE id = ?", (new_album, song_id))
            print(f"-> {new_album}")
            fixed += 1
        else:
            db.execute("UPDATE song_burst_songs SET album = NULL WHERE id = ?", (song_id,))
            print("-> cleared")
            cleared += 1
        db.commit()
        time.sleep(1.1)

    print(f"\nDone! Fixed: {fixed}, Cleared: {cleared}")
    db.close()


if __name__ == "__main__":
    main()
