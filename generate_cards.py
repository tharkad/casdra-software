#!/usr/bin/env python3
"""Generate Song Burst cards from lyrics in the database.

Each song gets up to 3 cards (easy/medium/hard) from different song sections.
Each card has 3 progressive clues that truncate the answer line.

Difficulty is based on song section:
  - Easy: chorus (most recognizable)
  - Medium: first verse
  - Hard: later verse or bridge
"""

import random
import re
import sqlite3

DB_PATH = "casdra.db"


def init_cards_table(db):
    db.execute("""
        CREATE TABLE IF NOT EXISTS song_burst_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_id INTEGER NOT NULL,
            difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
            section_type TEXT NOT NULL,
            answer_line TEXT NOT NULL,
            clue_3 TEXT NOT NULL,
            clue_2 TEXT NOT NULL,
            clue_1 TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (song_id) REFERENCES song_burst_songs(id)
        )
    """)
    db.commit()


def segment_lyrics(lyrics):
    """Split lyrics into labeled sections.

    Returns list of (section_type, lines) tuples.
    section_type: 'chorus', 'verse1', 'verse2', 'verse3', 'bridge', etc.
    """
    if not lyrics:
        return []

    # Normalize line breaks
    text = lyrics.replace("\r\n", "\n").replace("\r", "\n")

    # Split into blocks by blank lines
    blocks = re.split(r"\n\s*\n", text.strip())
    blocks = [b.strip() for b in blocks if b.strip()]

    if not blocks:
        return []

    # Strip any section headers like [Chorus], [Verse 1], etc.
    cleaned_blocks = []
    for block in blocks:
        lines = block.split("\n")
        cleaned_lines = []
        for line in lines:
            # Remove all [tags] (section markers, speaker labels like [Bell:])
            stripped = re.sub(r"\[.*?\]\s*", "", line).strip()
            if stripped:
                cleaned_lines.append(stripped)
        if cleaned_lines:
            cleaned_blocks.append(cleaned_lines)

    if not cleaned_blocks:
        return []

    # Detect chorus by finding repeated blocks
    # Normalize for comparison (lowercase, strip punctuation)
    def normalize_block(lines):
        return tuple(re.sub(r"[^\w\s]", "", l.lower()).strip() for l in lines)

    normalized = [normalize_block(b) for b in cleaned_blocks]

    # Count occurrences of each block
    block_counts = {}
    for nb in normalized:
        block_counts[nb] = block_counts.get(nb, 0) + 1

    # Blocks that appear 2+ times are likely chorus
    chorus_blocks = {nb for nb, count in block_counts.items() if count >= 2}

    # Label each block
    sections = []
    verse_num = 0
    chorus_added = False
    other_num = 0

    for i, (cleaned, norm) in enumerate(zip(cleaned_blocks, normalized)):
        if norm in chorus_blocks:
            if not chorus_added:
                sections.append(("chorus", cleaned))
                chorus_added = True
            # Skip duplicate chorus blocks
        else:
            verse_num += 1
            if verse_num == 1:
                sections.append(("verse1", cleaned))
            elif verse_num == 2:
                sections.append(("verse2", cleaned))
            else:
                other_num += 1
                sections.append(("bridge" if other_num == 1 else f"verse{verse_num}", cleaned))

    return sections


def is_filler(line):
    """Check if a line is just filler words."""
    return bool(re.match(
        r"^[\s,!.]*(oh|ah|yeah|hey|la|na|da|ooh|whoa|mm|hmm|uh|woo|baby|come on"
        r"|mmm|ooo|aah|wo+|hey+|na na|la la|do do|sha la)[\s,!.]*$",
        line, re.IGNORECASE,
    ))


def pick_lines(lines, count, used_indices=None):
    """Pick up to `count` distinct answer lines from a section.

    Returns list of answer line strings. Each is 8+ words.
    `used_indices` tracks line indices already used (across calls) to avoid duplicates.
    ~25% of picks are multiline (2-3 lines joined with /).
    """
    if used_indices is None:
        used_indices = set()

    # Build scored candidates
    candidates = []
    for i, line in enumerate(lines):
        if i in used_indices:
            continue
        words = line.split()
        word_count = len(words)
        if word_count < 5 or word_count > 15:
            continue
        if is_filler(line):
            continue
        score = 10 - abs(word_count - 8)
        candidates.append((score, i, line))

    if not candidates:
        # Fallback: relax word count constraint
        for i, line in enumerate(lines):
            if i in used_indices:
                continue
            words = line.split()
            if len(words) >= 3 and not is_filler(line):
                candidates.append((0, i, line))

    candidates.sort(key=lambda x: -x[0])

    results = []
    for _, idx, line in candidates:
        if idx in used_indices:
            continue
        if len(results) >= count:
            break

        use_multiline = random.random() < 0.25

        if use_multiline:
            # Grab 2-3 consecutive non-filler lines
            multi = [line]
            used_in_multi = [idx]
            for j in range(idx + 1, len(lines)):
                if j in used_indices:
                    continue
                next_line = lines[j].strip()
                if next_line and not is_filler(next_line):
                    multi.append(next_line)
                    used_in_multi.append(j)
                    if len(multi) >= 3:
                        break
            if len(multi) >= 2:
                answer = " / ".join(multi)
                if len(answer.split()) > 7:
                    for ui in used_in_multi:
                        used_indices.add(ui)
                    results.append(answer)
                    continue

        # Single line — extend if 10 words or fewer
        answer = line
        if len(answer.split()) <= 10:
            for j in range(idx + 1, len(lines)):
                next_line = lines[j].strip()
                if next_line and not is_filler(next_line):
                    answer = answer.rstrip(".,!? ") + ", " + next_line
                    break

        # Skip if still too short or too long
        word_count = len(answer.split())
        if word_count <= 10 or word_count > 25:
            continue

        used_indices.add(idx)
        results.append(answer)

    return results


def build_clues(answer_line):
    """Build 3 progressive clues by truncating the answer line.

    clue_3 (hardest): ~first 25% of words + "..." (minimum 2 words)
    clue_2 (medium):  ~first 50% of words + "..."
    clue_1 (easiest): ~first 80% of words + "..."
    """
    words = answer_line.split()
    n = len(words)

    if n <= 3:
        clue_3 = " ".join(words[:2]) + " . . ."
        clue_2 = " ".join(words[:2]) + " . . ."
        clue_1 = " ".join(words[:max(2, n - 1)]) + " . . ."
    else:
        cut_3 = max(2, round(n * 0.25))
        cut_2 = max(cut_3 + 1, round(n * 0.5))
        cut_1 = max(cut_2 + 1, round(n * 0.8))

        clue_3 = " ".join(words[:cut_3]) + " . . ."
        clue_2 = " ".join(words[:cut_2]) + " . . ."
        clue_1 = " ".join(words[:cut_1]) + " . . ."

    return clue_3, clue_2, clue_1


# Section type influences difficulty for songs in the #1-10 peak range
SECTION_DIFFICULTY_OFFSET = {
    "chorus": 0,    # no increase — chorus is easy
    "verse1": 1,    # bump up one level
    "verse2": 2,    # bump up two levels
    "bridge": 2,
}


def compute_difficulty(peak_position, section_type):
    """Compute card difficulty based on peak chart position and song section.

    Rules:
    - Peak #30-40: always hard, regardless of section
    - Peak #11-29: medium by default, section can increase to hard
    - Peak #1-10: easy by default, section increases difficulty
      (chorus=easy, verse1=medium, verse2/bridge=hard)
    - No chart data: treat as medium
    """
    if peak_position is None:
        base = 1  # medium
    elif peak_position >= 30:
        return "hard"  # always hard for #30-40
    elif peak_position >= 11:
        base = 1  # medium
    else:
        base = 0  # easy (#1-10)

    offset = SECTION_DIFFICULTY_OFFSET.get(section_type, 1)
    level = min(base + offset, 2)

    return ("easy", "medium", "hard")[level]


CARDS_PER_DIFFICULTY = {"easy": 4, "medium": 3, "hard": 2}


def generate_cards_for_song(song_id, lyrics, peak_position, genre_tag=""):
    """Generate up to 9 cards per song: 4 easy, 3 medium, 2 hard.

    Easy cards: drawn from the first lines of the song (most recognizable).
    Medium/Hard cards: drawn from sections based on chart position and section type.
    Each card uses a different lyric line.

    Pop songs that peaked #25-40: no easy cards.
    Pop songs that peaked #30-40: no easy or medium cards (hard only).
    """
    if not lyrics:
        return []

    # Get all non-empty lines from the full lyrics
    all_lines = [l.strip() for l in lyrics.split("\n") if l.strip()]
    if not all_lines:
        return []

    sections = segment_lyrics(lyrics)
    cards = []
    used_indices = set()

    # Pop difficulty cull based on chart position
    is_pop = not genre_tag or genre_tag == "" or genre_tag == "pop"
    skip_easy = is_pop and peak_position and peak_position >= 25
    skip_medium = is_pop and peak_position and peak_position >= 30

    # --- Easy cards: first lines of the song ---
    if not skip_easy:
        easy_pool = all_lines[:8]
        easy_answers = pick_lines(easy_pool, CARDS_PER_DIFFICULTY["easy"], used_indices)
    else:
        easy_answers = []
    for answer_line in easy_answers:
        clue_3, clue_2, clue_1 = build_clues(answer_line)
        cards.append((song_id, "easy", "opening", answer_line, clue_3, clue_2, clue_1))

    # --- Medium and Hard cards: from sections based on chart position ---
    for difficulty in ["medium", "hard"]:
        if difficulty == "medium" and skip_medium:
            continue

        target = CARDS_PER_DIFFICULTY[difficulty]

        # Pool lines from sections that map to this difficulty
        diff_lines = []
        for section_type, lines in sections:
            computed = compute_difficulty(peak_position, section_type)
            if computed == difficulty:
                diff_lines.extend(lines)

        # If no sections mapped to this difficulty, use later lines
        if not diff_lines:
            if difficulty == "medium":
                diff_lines = all_lines[4:12] if len(all_lines) > 4 else []
            else:
                diff_lines = all_lines[8:] if len(all_lines) > 8 else []

        if diff_lines:
            answers = pick_lines(diff_lines, target, used_indices)
            for answer_line in answers:
                clue_3, clue_2, clue_1 = build_clues(answer_line)
                section_type = "verse1" if difficulty == "medium" else "verse2"
                cards.append((song_id, difficulty, section_type, answer_line, clue_3, clue_2, clue_1))

    return cards


def main():
    db = sqlite3.connect(DB_PATH, timeout=30)
    init_cards_table(db)

    # Clear existing cards
    db.execute("DELETE FROM song_burst_cards")
    db.commit()

    # Get all songs that have lyrics (include peak_position for difficulty calc)
    # Check if genre_tags column exists
    cols = [r[1] for r in db.execute("PRAGMA table_info(song_burst_songs)").fetchall()]
    genre_col = ", genre_tags" if "genre_tags" in cols else ""

    cursor = db.execute(
        f"""SELECT id, title, artist, lyric_snippet, peak_position{genre_col}
            FROM song_burst_songs WHERE lyric_snippet IS NOT NULL"""
    )
    songs = cursor.fetchall()
    print(f"Generating cards for {len(songs)} songs with lyrics...\n")

    total_cards = 0
    songs_with_cards = 0
    difficulty_counts = {"easy": 0, "medium": 0, "hard": 0}

    for row in songs:
        song_id, title, artist, lyrics, peak_position = row[:5]
        genre_tag = row[5] if len(row) > 5 else ""
        cards = generate_cards_for_song(song_id, lyrics, peak_position, genre_tag)
        if cards:
            songs_with_cards += 1
            for card in cards:
                db.execute(
                    """INSERT INTO song_burst_cards
                       (song_id, difficulty, section_type, answer_line, clue_3, clue_2, clue_1)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    card,
                )
                difficulty_counts[card[1]] += 1
            total_cards += len(cards)

    db.commit()

    print(f"Generated {total_cards} cards for {songs_with_cards} songs.")
    print(f"  Easy (chorus):  {difficulty_counts['easy']}")
    print(f"  Medium (verse1): {difficulty_counts['medium']}")
    print(f"  Hard (verse2+):  {difficulty_counts['hard']}")
    print(f"\nSongs with lyrics but no cards: {len(songs) - songs_with_cards}")

    # Show a few examples
    print("\n--- Sample Cards ---")
    cursor = db.execute("""
        SELECT c.difficulty, c.section_type, c.clue_3, c.clue_2, c.clue_1, c.answer_line,
               s.title, s.artist, s.year
        FROM song_burst_cards c
        JOIN song_burst_songs s ON c.song_id = s.id
        ORDER BY RANDOM()
        LIMIT 5
    """)
    for row in cursor:
        diff, sec, c3, c2, c1, answer, title, artist, year = row
        print(f"\n  {title} - {artist} ({year})  [{diff}/{sec}]")
        print(f"    ③ {c3}")
        print(f"    ② {c2}")
        print(f"    ① {c1}")
        print(f"    ★ \"{answer}\"")

    db.close()


if __name__ == "__main__":
    main()
