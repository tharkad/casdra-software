#!/usr/bin/env python3
"""Sync the local database to the remote production server.

- Schema changes (new tables, new columns) are always synced
- Generated data (song_burst_*) is replaced with local data
- Production data (restaurants, supplements, etc.) is kept from remote

Usage:
    python3 sync_db.py
"""

import os
import sqlite3
import sys
import tempfile
import urllib.request

REMOTE_URL = "http://100.81.129.123:8000/download-db"
UPLOAD_URL = "http://100.81.129.123:8001/_upload-db"
LOCAL_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "casdra.db")

# Tables whose data comes from offline scripts and can be fully replaced
GENERATED_TABLES = ["song_burst_songs", "song_burst_cards"]


def download_remote_db(path):
    """Download the remote database to a local temp file."""
    print(f"Downloading remote database from {REMOTE_URL}...")
    req = urllib.request.Request(REMOTE_URL, headers={"User-Agent": "CasdraSync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    with open(path, "wb") as f:
        f.write(data)
    print(f"  Downloaded {len(data):,} bytes")
    return data


def get_tables(db):
    """Get all table names."""
    return [r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()]


def get_columns(db, table):
    """Get column info for a table: list of (name, type, notnull, default)."""
    return [(r[1], r[2], r[3], r[4]) for r in
            db.execute(f"PRAGMA table_info({table})").fetchall()]


def get_create_sql(db, table):
    """Get the CREATE TABLE statement for a table."""
    row = db.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row[0] if row else None


def sync_schema(local, remote):
    """Sync schema from local to remote. Returns list of changes made."""
    changes = []
    local_tables = get_tables(local)
    remote_tables = get_tables(remote)

    for table in local_tables:
        if table.startswith("sqlite_"):
            continue

        if table not in remote_tables:
            # New table — create it in remote
            create_sql = get_create_sql(local, table)
            if create_sql:
                remote.execute(create_sql)
                changes.append(f"Created table: {table}")
                print(f"  + Created table: {table}")
        else:
            # Existing table — check for missing columns
            local_cols = {c[0]: c for c in get_columns(local, table)}
            remote_cols = {c[0]: c for c in get_columns(remote, table)}

            for col_name, col_info in local_cols.items():
                if col_name not in remote_cols:
                    col_type = col_info[1] or ""
                    default = col_info[3]
                    default_clause = f" DEFAULT {default}" if default is not None else ""
                    sql = f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}{default_clause}"
                    remote.execute(sql)
                    changes.append(f"Added column: {table}.{col_name}")
                    print(f"  + Added column: {table}.{col_name} ({col_type})")

    remote.commit()
    return changes


def pull_user_changes(local, remote):
    """Pull user-reported changes from remote DB into local before overwriting.

    Handles:
    - NEEDS_REFETCH albums (user reported bad album)
    - Difficulty changes on cards
    - Deleted cards (remake_card)
    """
    changes = 0

    # 1. Pull NEEDS_REFETCH markers
    try:
        refetch_rows = remote.execute(
            "SELECT id FROM song_burst_songs WHERE album = 'NEEDS_REFETCH'"
        ).fetchall()
        for (sid,) in refetch_rows:
            local.execute("UPDATE song_burst_songs SET album = 'NEEDS_REFETCH', album_art_url = NULL WHERE id = ?", (sid,))
            changes += 1
        if refetch_rows:
            print(f"  Pulled {len(refetch_rows)} NEEDS_REFETCH markers")
    except Exception:
        pass

    # 2. Pull difficulty changes (compare remote vs local cards)
    try:
        diff_changes = remote.execute("""
            SELECT r.id, r.difficulty FROM song_burst_cards r
            INNER JOIN (SELECT id, difficulty FROM song_burst_cards) l_placeholder
            WHERE r.id = l_placeholder.id AND r.difficulty != l_placeholder.difficulty
        """).fetchall()
        # Simpler approach: just check cards that exist in both and differ
        remote_cards = {r[0]: r[1] for r in remote.execute("SELECT id, difficulty FROM song_burst_cards").fetchall()}
        local_cards = {r[0]: r[1] for r in local.execute("SELECT id, difficulty FROM song_burst_cards").fetchall()}
        diff_fixed = 0
        for card_id, remote_diff in remote_cards.items():
            if card_id in local_cards and local_cards[card_id] != remote_diff:
                local.execute("UPDATE song_burst_cards SET difficulty = ? WHERE id = ?", (remote_diff, card_id))
                diff_fixed += 1
        if diff_fixed:
            print(f"  Pulled {diff_fixed} difficulty changes")
            changes += diff_fixed
    except Exception:
        pass

    # Note: card deletions (remake_card) are not pulled because card IDs
    # change on every regeneration. Deleted cards simply won't be regenerated.

    local.commit()

    if changes == 0:
        print("  No user changes to pull")

    return changes


def sync_generated_data(local, remote):
    """Replace generated table data in remote with local data."""
    stats = {}

    for table in GENERATED_TABLES:
        local_tables = get_tables(local)
        remote_tables = get_tables(remote)

        if table not in local_tables:
            print(f"  Skipping {table} (not in local DB)")
            continue

        if table not in remote_tables:
            print(f"  Skipping {table} (not yet in remote DB — schema sync should have created it)")
            continue

        # Get column names from local
        cols = [c[0] for c in get_columns(local, table)]
        col_list = ", ".join(cols)
        placeholders = ", ".join(["?"] * len(cols))

        # Clear remote data
        remote.execute(f"DELETE FROM {table}")

        # Copy all rows from local
        rows = local.execute(f"SELECT {col_list} FROM {table}").fetchall()
        if rows:
            remote.executemany(
                f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})",
                rows,
            )

        stats[table] = len(rows)
        print(f"  {table}: {len(rows):,} rows synced")

    remote.commit()
    return stats


def upload_db(db_path):
    """Upload the merged database to the remote server."""
    print(f"\nUploading merged database to {UPLOAD_URL}...")
    with open(db_path, "rb") as f:
        data = f.read()

    req = urllib.request.Request(
        UPLOAD_URL,
        data=data,
        headers={
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(data)),
            "User-Agent": "CasdraSync/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = resp.read().decode()
            print(f"  {result.strip()}")
    except Exception as e:
        print(f"  Upload failed: {e}")
        sys.exit(1)


def main():
    if not os.path.exists(LOCAL_DB):
        print(f"Local database not found: {LOCAL_DB}")
        sys.exit(1)

    # Download remote DB to temp file
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    remote_path = tmp.name

    try:
        download_remote_db(remote_path)

        local = sqlite3.connect(LOCAL_DB)
        remote = sqlite3.connect(remote_path)

        # Step 1: Pull user changes from remote into local
        print("\nPulling user changes from remote...")
        user_changes = pull_user_changes(local, remote)

        # Step 2: Schema sync
        print("\nSyncing schema...")
        schema_changes = sync_schema(local, remote)
        if not schema_changes:
            print("  No schema changes needed")

        # Step 3: Sync generated data (local → remote)
        print("\nSyncing generated data...")
        data_stats = sync_generated_data(local, remote)

        local.close()
        remote.close()

        # Step 3: Upload merged DB
        upload_db(remote_path)

        # Summary
        print("\n" + "=" * 50)
        print("Sync complete!")
        print(f"  Schema changes: {len(schema_changes)}")
        for table, count in data_stats.items():
            print(f"  {table}: {count:,} rows")

    finally:
        os.unlink(remote_path)


if __name__ == "__main__":
    main()
