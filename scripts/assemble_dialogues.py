"""
Assemble the canonical dialogues.csv — single source of truth for all stations.

Joins:
  - data/raw/<industry>_<emotion>.csv          (dialogue + context)
  - data/raw/<industry>_<emotion>_Norms.csv    (target_person, gender_raw, cause_raw)
  - data/processed/causes_per_dialogue.csv     (cause_normalized)
  - data/processed/cause_to_theme.csv          (theme_id, theme_label)
  - data/processed/films_enriched.csv          (tmdb metadata)

Output: data/processed/dialogues.csv with the schema from data/SCHEMA.md.
"""

import csv
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"


def era_bucket(year_str: str) -> str:
    if not year_str or not year_str.isdigit():
        return ""
    y = int(year_str)
    if y < 2000:
        return "pre_2000"
    if y < 2015:
        return "2000_2014"
    return "2015_present"


def normalize_gender(g: str) -> tuple[str, str]:
    """Returns (gender, source). Source is 'original' if labeled, '' if blank."""
    g = (g or "").strip().lower()
    if g in ("male", "m"):
        return "male", "original"
    if g in ("female", "f"):
        return "female", "original"
    return "unclear", ""  # blank/unclear/unknown — eligible for LLM backfill


def main():
    # 1. Load films_enriched into a lookup by (industry, original_filename)
    films_by_key = {}
    with open(PROC / "films_enriched.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            films_by_key[(r["industry"], r["original_filename"])] = r

    # 1b. Load LLM gender backfill (if available)
    backfilled_gender = {}
    backfill_path = PROC / "gender_backfill.csv"
    if backfill_path.exists():
        with open(backfill_path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                backfilled_gender[r["dialogue_id"]] = r["predicted_gender"]
        print(f"Loaded {len(backfilled_gender)} backfilled gender labels")

    # 2. Load cause_normalized per dialogue
    cause_norm = {}  # dialogue_id -> cause_normalized
    with open(PROC / "causes_per_dialogue.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            cause_norm[r["dialogue_id"]] = r["cause_normalized"]

    # 3. Load cause -> theme (separate per emotion)
    theme_by_cause = {}  # (emotion, cause_normalized) -> (theme_id, theme_label)
    with open(PROC / "cause_to_theme.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            theme_by_cause[(r["emotion"], r["cause_normalized"])] = (r["theme_id"], r["theme_label"])

    file_specs = [
        ("Bolly_Shame", "bolly", "shame"),
        ("Bolly_Pride", "bolly", "pride"),
        ("Holly_Shame", "holly", "shame"),
        ("Holly_Pride", "holly", "pride"),
    ]

    out_records = []
    stats = defaultdict(int)

    for stem, industry, emotion in file_specs:
        # Load input (dialogue text)
        dialogues = {}
        with open(RAW / f"{stem}.csv", newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                dialogues[r["Message_id"]] = (r["Movie_name"].strip(), r["Message"].strip())

        # Load output (norms: person, gender, cause)
        with open(RAW / f"{stem}_Norms.csv", newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                did = r["Message_id"]
                if did not in dialogues:
                    stats["missing_dialogue_text"] += 1
                    continue
                movie_name, dialogue = dialogues[did]

                film = films_by_key.get((industry, movie_name))
                if not film or not film.get("matched") in ("True", "true", True, "1"):
                    stats["unmatched_film"] += 1
                    film = None

                gender, gender_src = normalize_gender(r.get("Gender", ""))
                # If original was unclear and we have a backfilled label, apply it
                if gender == "unclear" and did in backfilled_gender:
                    bf = backfilled_gender[did]
                    if bf in ("male", "female"):
                        gender = bf
                        gender_src = "llm_backfill"
                    elif bf == "unclear":
                        gender_src = "llm_backfill_unclear"
                cause_raw = (r.get("Cause", "") or "").strip()
                cause_n = cause_norm.get(did, "")
                theme_id, theme_label = ("", "")
                if cause_n:
                    t = theme_by_cause.get((emotion, cause_n))
                    if t:
                        theme_id, theme_label = t

                year = (film or {}).get("tmdb_year", "") if film else ""
                if not year:
                    year = (film or {}).get("year_hint", "") if film else ""

                rec = {
                    "dialogue_id": did,
                    "industry": industry,
                    "emotion": emotion,
                    "film_id": (film or {}).get("tmdb_id", "") if film else "",
                    "film_title": (film or {}).get("tmdb_title", "") if film else movie_name,
                    "film_year": year,
                    "film_country": (film or {}).get("tmdb_country_codes", "") if film else "",
                    "film_poster_path": (film or {}).get("tmdb_poster_path", "") if film else "",
                    "film_overview": (film or {}).get("tmdb_overview", "") if film else "",
                    "film_matched": "1" if film else "0",
                    "original_filename": movie_name,
                    "dialogue": dialogue,
                    "target_person": (r.get("Person Who Felt the Emotion") or "").strip(),
                    "target_gender": gender,
                    "target_gender_source": gender_src,
                    "cause_raw": cause_raw,
                    "cause_normalized": cause_n,
                    "theme_id": theme_id,
                    "theme_label": theme_label,
                    "era": era_bucket(year),
                }
                out_records.append(rec)
                stats["total"] += 1
                stats[f"{industry}_{emotion}"] += 1

    fieldnames = [
        "dialogue_id", "industry", "emotion",
        "film_id", "film_title", "film_year", "film_country",
        "film_poster_path", "film_overview", "film_matched",
        "original_filename", "dialogue",
        "target_person", "target_gender", "target_gender_source",
        "cause_raw", "cause_normalized", "theme_id", "theme_label",
        "era",
    ]
    with open(PROC / "dialogues.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(out_records)

    print(f"Wrote {len(out_records)} dialogue records → data/processed/dialogues.csv\n")
    print("Distribution:")
    for k, v in sorted(stats.items()):
        print(f"  {k:>32} : {v}")

    # Quick coverage sanity
    print("\nField coverage:")
    for field in ("film_id", "film_year", "film_poster_path", "target_gender", "theme_id", "era"):
        if field == "target_gender":
            n = sum(1 for r in out_records if r[field] in ("male", "female"))
        elif field == "theme_id":
            n = sum(1 for r in out_records if r[field])
        else:
            n = sum(1 for r in out_records if r[field])
        print(f"  {field:>20} : {n}/{len(out_records)} ({n/len(out_records)*100:.1f}%)")


if __name__ == "__main__":
    main()
