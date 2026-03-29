#!/usr/bin/env python3
"""Export Song Burst data from internal casdra.db to chartburst.db."""

import os
import sqlite3

INTERNAL_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "casdra-server", "casdra.db")
CHART_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chartburst.db")


def main():
    if not os.path.exists(INTERNAL_DB):
        print(f"Internal DB not found: {INTERNAL_DB}")
        return

    src = sqlite3.connect(INTERNAL_DB)
    dst = sqlite3.connect(CHART_DB)

    # Create tables
    for table in ["song_burst_songs", "song_burst_cards"]:
        create_sql = src.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
        if create_sql:
            dst.execute(f"DROP TABLE IF EXISTS {table}")
            dst.execute(create_sql[0])

    # Copy data
    for table in ["song_burst_songs", "song_burst_cards"]:
        cols = [r[1] for r in src.execute(f"PRAGMA table_info({table})").fetchall()]
        col_list = ", ".join(cols)
        placeholders = ", ".join(["?"] * len(cols))
        rows = src.execute(f"SELECT {col_list} FROM {table}").fetchall()
        dst.executemany(f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})", rows)
        print(f"  {table}: {len(rows):,} rows")

    dst.commit()
    src.close()
    dst.close()
    print(f"\nExported to {CHART_DB}")


if __name__ == "__main__":
    main()
