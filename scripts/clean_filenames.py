"""
Clean and normalize movie filenames from the Cross-Cultural-Social-Norms-Dataset
into canonical (title, year_hint) pairs ready for TMDB lookup.

Strategy:
  1. Strip extension and leading bracketed tag prefixes ("(SUBS ENG)").
  2. Find the earliest "boundary marker" — anything that signals "everything from
     here is metadata, not title": rip tags, quality markers, year, codec, etc.
     Truncate the string at that boundary.
  3. From the kept prefix: extract year (parenthesized or free), camel-case
     split if needed, strip brackets/dots, normalize whitespace.

Output: data/processed/films.csv with columns:
    industry, original_filename, clean_title, year_hint
"""

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)

EXT = re.compile(r"\.(txt|srt|sub|sub\d+|vtt|ass)$", re.IGNORECASE)

# Boundary markers — anything from the FIRST occurrence onward is metadata.
# Patterns are case-insensitive and tolerant of camel/mixed case ("DvDRip").
# We use lookarounds so they match inside glued strings too.
BOUNDARY_PATTERNS = [
    r"D\.?V\.?D\.?Rip",
    r"D\.?V\.?D",  # bare DVD
    r"BluRay(?:Rip)?",
    r"BD\.?Rip",
    r"BR\.?Rip",
    r"WEB[-\.]?(?:Rip|DL)",
    r"HD\.?Rip",
    r"HD\.?TV",
    r"H[-\.]?DCAM",
    r"HDCAM",
    r"x[-\.]?26[45]",
    r"H[-\.]?26[45]",
    r"HEVC",
    r"XviD",
    r"DivX",
    r"720p",
    r"1080p",
    r"480p",
    r"2160p",
    r"4K(?:UHD)?",
    r"AC3",
    r"DTS(?:HD)?",
    r"AAC",
    r"DD[5-7]\.?[01]",
    r"DD\d+",
    r"5\.1ch?",
    r"7\.1ch?",
    r"10Bit",
    r"LiMiTED",
    r"UNRATED",
    r"EXTENDED",
    r"REPACK",
    r"PROPER",
    r"REMUX",
    r"MoviesWbb",
    r"YIFY",
    r"RARBG",
    r"YTS",
    r"\d+\s*MB\b",
    r"\d+\s*GB\b",
    r"\d+\s*[Cc][Dd](?:Rip)?",
    r"\b[Cc][Dd]\d+\b",
    r"By\s+\w+",
    r"English\s*Subtitle",
    r"Hindi\s*Subtitle",
]
BOUNDARY_RE = re.compile(
    r"(?:" + "|".join(BOUNDARY_PATTERNS) + r")",
    re.IGNORECASE,
)

# Free-standing year (after non-letter or at start)
YEAR_FREE = re.compile(r"(?:^|[^A-Za-z0-9])(19\d{2}|20\d{2})(?:[^A-Za-z0-9]|$)")
# Year glued inside camelcase: "12YearsaSlave2013BluRay" → 2013
YEAR_GLUED = re.compile(r"(?<=[A-Za-z])(19\d{2}|20\d{2})(?=[A-Za-z])")
# Parenthesized year
YEAR_PAREN = re.compile(r"[\(\[](19\d{2}|20\d{2})[\)\]]")

BRACKETED_GROUP = re.compile(r"[\[\(\{][^\]\)\}]*[\]\)\}]")
DOTS_TO_SPACES = re.compile(r"[._]+")
TRAILING_GROUP = re.compile(r"[-_]\s*[A-Za-z0-9]+\s*$")
MULTI_DASH = re.compile(r"\s*-\s*")
WS = re.compile(r"\s+")
CAMEL_BOUNDARY = re.compile(r"(?<=[a-z])(?=[A-Z])")


def split_camelcase(tok: str) -> str:
    """Insert spaces at lowercase→uppercase transitions only."""
    return CAMEL_BOUNDARY.sub(" ", tok)


def clean(name: str) -> tuple[str, str | None]:
    s = name.strip()
    s = EXT.sub("", s)

    # 1) Drop leading tag-only bracket like "(SUBS ENG)" or "(REPLACEMENT)".
    leading = re.match(r"^[\(\[\{][^\)\]\}]*[\)\]\}]\s*", s)
    if leading:
        inside = leading.group(0).strip("()[]{} ").strip()
        if inside.isupper() or re.search(
            r"\b(SUBS?|ENG|HINDI|REPLACEMENT|HD|BLURAY)\b", inside, re.I
        ):
            s = s[leading.end():]

    # 2) Extract year (priority: parenthesized > free > glued)
    year = None
    for pat in (YEAR_PAREN, YEAR_FREE, YEAR_GLUED):
        m = pat.search(s)
        if m:
            year = m.group(1)
            break

    # 3) BOUNDARY TRUNCATION — find earliest boundary marker, drop everything from there.
    # Markers are unambiguous tokens (DVDRip, XviD, 720p, etc.) that don't appear in real titles.
    # Fallback: if the prefix before the marker is too short/empty (filename starts with
    # rip soup, like "1cd-rangeelay-hdrip-..."), use the segment between the first marker
    # and the next one — that's the real title.
    matches = list(BOUNDARY_RE.finditer(s))
    if matches:
        first = matches[0]
        prefix = s[: first.start()].strip(" -._")
        # Strip leading non-alphanumeric junk to evaluate prefix length
        prefix_alpha = re.sub(r"[^A-Za-z]", "", prefix)
        if len(prefix_alpha) >= 3:
            s = s[: first.start()]
        elif len(matches) >= 2:
            second = matches[1]
            s = s[first.end(): second.start()]
        else:
            s = s[first.end():]

    # 4) Find year again if we lost it during truncation (e.g., year was after boundary)
    if not year:
        for pat in (YEAR_PAREN, YEAR_FREE, YEAR_GLUED):
            m = pat.search(s)
            if m:
                year = m.group(1)
                break

    # 5) Now strip year from the kept prefix
    if year:
        s = re.sub(r"[\(\[]?" + re.escape(year) + r"[\)\]]?", " ", s, count=1)

    # 6) Strip any remaining brackets and bracketed content
    s = BRACKETED_GROUP.sub(" ", s)

    # 7) Dots → spaces
    s = DOTS_TO_SPACES.sub(" ", s)

    # 8) Camelcase split on long glued tokens (after rip tags are gone, this is safer)
    out_tokens = []
    for tok in s.split():
        if len(tok) > 12 and CAMEL_BOUNDARY.search(tok):
            out_tokens.append(split_camelcase(tok))
        else:
            out_tokens.append(tok)
    s = " ".join(out_tokens)

    # 9) Trailing release-group token cleanup
    s = TRAILING_GROUP.sub("", s)
    s = TRAILING_GROUP.sub("", s)

    # 10) Slugified-title hyphens → spaces (only if ≥2 hyphens, preserves "Mughal-E-Azam")
    if s.count("-") >= 2:
        s = MULTI_DASH.sub(" ", s)

    # 11) Drop common subtitle metadata words that survived
    s = re.sub(r"\b(Hindi|English|Subtitle|Subs?|Eng|Sub|Original)\b", " ", s, flags=re.I)

    s = WS.sub(" ", s).strip(" -._")

    if s.islower() or (s.isupper() and len(s) > 4):
        s = s.title()
    return s, year


def collect_filenames():
    seen = {}
    file_map = {
        "Bolly_Shame.csv": "bolly",
        "Bolly_Pride.csv": "bolly",
        "Holly_Shame.csv": "holly",
        "Holly_Pride.csv": "holly",
    }
    for fname, industry in file_map.items():
        with open(RAW / fname, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                key = (industry, row["Movie_name"].strip())
                seen.setdefault(key, None)
    return sorted(seen.keys())


def main():
    rows = []
    for industry, original in collect_filenames():
        title, year = clean(original)
        rows.append({
            "industry": industry,
            "original_filename": original,
            "clean_title": title,
            "year_hint": year or "",
        })

    out_path = OUT / "films.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f, fieldnames=["industry", "original_filename", "clean_title", "year_hint"]
        )
        w.writeheader()
        w.writerows(rows)

    bolly = [r for r in rows if r["industry"] == "bolly"]
    holly = [r for r in rows if r["industry"] == "holly"]
    print(f"Wrote {len(rows)} unique film records → {out_path}")
    print(f"  Bollywood: {len(bolly)} ({sum(1 for r in bolly if r['year_hint'])} with year)")
    print(f"  Hollywood: {len(holly)} ({sum(1 for r in holly if r['year_hint'])} with year)")
    print()
    print("Sample Bollywood after cleaning:")
    for r in bolly[:8]:
        print(f"  {r['original_filename']:60.60}  →  {r['clean_title']!r} ({r['year_hint'] or '?'})")
    print()
    print("Sample Hollywood after cleaning:")
    for r in holly[:8]:
        print(f"  {r['original_filename']:60.60}  →  {r['clean_title']!r} ({r['year_hint'] or '?'})")


if __name__ == "__main__":
    main()
