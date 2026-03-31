#!/usr/bin/env python3
"""Re-fetch ALL albums with strict artist matching.

The original fetch_albums.py was too loose — it would accept albums from wrong
artists (e.g. Pink Floyd's "Another Brick in the Wall" getting Michael Jackson's
"Off the Wall"). This script re-fetches every album and requires the artist name
to match before accepting a result.
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


def normalize_artist(name):
    """Normalize artist name for comparison."""
    name = name.lower()
    # Remove common prefixes/suffixes
    name = re.sub(r"\s*(featuring|feat\.?|ft\.?|with|and|&|vs\.?)\s+.*", "", name)
    name = re.sub(r"^the\s+", "", name)
    name = re.sub(r"[^\w\s]", "", name)
    return name.strip()


def artists_match(expected, actual):
    """Check if two artist names refer to the same artist."""
    e = normalize_artist(expected)
    a = normalize_artist(actual)
    # One contains the other, or they match
    return e in a or a in e


def search_album(title, artist):
    """Search MusicBrainz with strict artist matching."""
    query = f'recording:"{title}" AND artist:"{artist}"'
    params = urllib.parse.urlencode({"query": query, "fmt": "json", "limit": 10})
    url = f"{MB_BASE}?{params}"

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return None

    recordings = data.get("recordings", [])
    if not recordings:
        return None

    for rec in recordings:
        # Check that the artist matches
        rec_artists = [ac.get("artist", {}).get("name", "")
                       for ac in rec.get("artist-credit", [])]
        rec_artist_str = " ".join(rec_artists)

        if not artists_match(artist, rec_artist_str):
            continue

        # Find an Album release (not compilation/single)
        releases = rec.get("releases", [])
        for rel in releases:
            rg = rel.get("release-group", {})
            primary = rg.get("primary-type", "")
            secondary = rg.get("secondary-types", [])

            # Prefer studio albums, skip compilations
            if primary == "Album" and "Compilation" not in secondary:
                return rel.get("title")

        # Fallback: any Album (including compilations)
        for rel in releases:
            rg = rel.get("release-group", {})
            if rg.get("primary-type") == "Album":
                return rel.get("title")

        # Last resort: any release from the matching artist
        if releases:
            return releases[0].get("title")

    return None


def main():
    db = sqlite3.connect(DB_PATH)

    # Re-fetch ALL songs (not just NULL albums)
    cursor = db.execute(
        "SELECT id, title, artist, year, album FROM song_burst_songs ORDER BY year, rank"
    )
    songs = cursor.fetchall()
    print(f"Re-fetching albums for {len(songs)} songs with strict artist matching...\n")

    found = 0
    fixed = 0
    missed = 0

    for i, (song_id, title, artist, year, old_album) in enumerate(songs):
        print(f"[{i+1}/{len(songs)}] {title} - {artist} ({year})...", end=" ", flush=True)

        album = search_album(title, artist)
        if album:
            if old_album and old_album != album:
                print(f"FIXED: {old_album} -> {album}")
                fixed += 1
            elif not old_album:
                print(f"NEW: {album}")
            else:
                print(f"OK: {album}")
            db.execute("UPDATE song_burst_songs SET album = ? WHERE id = ?", (album, song_id))
            found += 1
        else:
            if old_album:
                # Clear potentially wrong album
                db.execute("UPDATE song_burst_songs SET album = NULL WHERE id = ?", (song_id,))
                print(f"CLEARED: {old_album}")
            else:
                print("MISS")
            missed += 1

        if (i + 1) % 50 == 0:
            db.commit()

        time.sleep(1.1)

    db.commit()
    print(f"\n{'='*60}")
    print(f"Found: {found}, Fixed: {fixed}, Missed: {missed}")
    db.close()


if __name__ == "__main__":
    main()
