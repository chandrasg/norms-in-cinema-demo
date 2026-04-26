"""
Export per-station JSON from dialogues.csv. These files ship with the static
site; the frontend reads them directly.

Outputs:
  public/data/station1_mirror.json    — gender bias mirror, guess rounds, headline stats
  public/data/station2_atlas.json     — themes, deltas, examples, films index
  public/data/station3_lens/<slug>.json — per-film breakdown (top 50 curated)
  public/data/meta.json               — corpus-wide metadata (counts, last-updated)
"""

import csv
import json
import re
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
PUB = ROOT / "public" / "data"
PUB.mkdir(parents=True, exist_ok=True)
(PUB / "station3_lens").mkdir(parents=True, exist_ok=True)


def slugify(s: str) -> str:
    s = re.sub(r"[^\w\s-]", "", s.lower())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s or "untitled"


def load_dialogues():
    with open(PROC / "dialogues.csv", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# =========================================================================
# Station 1 — The Mirror
# =========================================================================

def build_station1(dialogues: list[dict]) -> dict:
    asym = {
        emo: {ind: Counter() for ind in ("bolly", "holly")}
        for emo in ("shame", "pride")
    }
    for r in dialogues:
        emo, ind = r["emotion"], r["industry"]
        g = r["target_gender"] or "unclear"
        if g not in ("male", "female"):
            g = "unclear"
        asym[emo][ind][g] += 1

    # Headline stats
    bolly_shame_total = sum(asym["shame"]["bolly"].values())
    holly_shame_total = sum(asym["shame"]["holly"].values())
    bolly_pride_total = sum(asym["pride"]["bolly"].values())
    holly_pride_total = sum(asym["pride"]["holly"].values())

    def safe_share(c: Counter, gender: str) -> float:
        labeled = c["male"] + c["female"]
        return c[gender] / labeled if labeled else 0.0

    headline = {
        "shame_count_bolly": bolly_shame_total,
        "shame_count_holly": holly_shame_total,
        "pride_count_bolly": bolly_pride_total,
        "pride_count_holly": holly_pride_total,
        "shame_freq_ratio_bolly_to_holly": (
            (bolly_shame_total / holly_shame_total) if holly_shame_total else 0
        ),
        "shame_female_share_bolly": safe_share(asym["shame"]["bolly"], "female"),
        "shame_female_share_holly": safe_share(asym["shame"]["holly"], "female"),
        "pride_male_share_bolly": safe_share(asym["pride"]["bolly"], "male"),
        "pride_male_share_holly": safe_share(asym["pride"]["holly"], "male"),
    }

    # Guess-the-Industry rounds — pick clear, attributable examples
    guess_rounds = pick_guess_rounds(dialogues, n=8)

    # Linguistic tells (static — paraphrased from paper Fig 2/3)
    linguistic_tells = {
        "bolly_shame": [
            {"phrase": "you / your", "tag": "2nd-person directed", "industry_signal": "bolly"},
            {"phrase": "family / sister / mother", "tag": "social references", "industry_signal": "bolly"},
            {"phrase": "shameless", "tag": "shame about lack-of-shame", "industry_signal": "bolly"},
        ],
        "holly_shame": [
            {"phrase": "I / I'm / I've", "tag": "1st-person self-focus", "industry_signal": "holly"},
            {"phrase": "should have / didn't / failed", "tag": "past-tense regret", "industry_signal": "holly"},
            {"phrase": "sorry / ashamed of myself", "tag": "self-directed shame", "industry_signal": "holly"},
        ],
        "bolly_pride": [
            {"phrase": "we / our / us", "tag": "collective pride", "industry_signal": "bolly"},
            {"phrase": "son / nation / family", "tag": "honor objects", "industry_signal": "bolly"},
        ],
        "holly_pride": [
            {"phrase": "I am / I did", "tag": "1st-person self-pride", "industry_signal": "holly"},
            {"phrase": "earned / achieved / built", "tag": "achievement vocabulary", "industry_signal": "holly"},
        ],
    }

    # Era breakdown — gender by era (existing) + theme by era (new for timeline)
    era_data = {
        emo: {ind: defaultdict(lambda: Counter()) for ind in ("bolly", "holly")}
        for emo in ("shame", "pride")
    }
    era_themes = {
        emo: {ind: defaultdict(Counter) for ind in ("bolly", "holly")}
        for emo in ("shame", "pride")
    }
    for r in dialogues:
        if not r.get("era"):
            continue
        emo, ind, era = r["emotion"], r["industry"], r["era"]
        g = r["target_gender"] if r["target_gender"] in ("male", "female") else "unclear"
        era_data[emo][ind][era][g] += 1
        if r["theme_label"]:
            era_themes[emo][ind][era][r["theme_label"]] += 1

    era_serialized = {
        emo: {
            ind: {
                era: dict(counts) for era, counts in eras.items()
            } for ind, eras in industries.items()
        } for emo, industries in era_data.items()
    }
    era_themes_serialized = {
        emo: {
            ind: {
                era: dict(theme_c.most_common(8))
                for era, theme_c in eras.items()
            } for ind, eras in industries.items()
        } for emo, industries in era_themes.items()
    }

    return {
        "asymmetry": {
            emo: {
                ind: {
                    "male": c["male"], "female": c["female"], "unclear": c["unclear"],
                } for ind, c in asym[emo].items()
            } for emo in ("shame", "pride")
        },
        "headline": headline,
        "guess_rounds": guess_rounds,
        "linguistic_tells": linguistic_tells,
        "era": era_serialized,
        "era_themes": era_themes_serialized,
    }


def pick_guess_rounds(dialogues: list[dict], n: int = 8) -> list[dict]:
    """Pick dialogues that are good for the guess-the-industry game.
    Criteria: well-known film, clear gender label, distinctive cause, dialogue
    length suitable for screen display."""
    candidates = []
    for r in dialogues:
        if r["film_matched"] != "1":
            continue
        if not r["target_gender"] in ("male", "female"):
            continue
        dlg = (r["dialogue"] or "").strip()
        if not (60 <= len(dlg) <= 350):
            continue
        if not r["theme_label"]:
            continue
        candidates.append(r)

    # Pick a balanced mix: 2 bolly-shame, 2 holly-shame, 2 bolly-pride, 2 holly-pride
    picks = []
    seen_films = set()
    for emo, ind in [("shame", "bolly"), ("shame", "holly"),
                      ("pride", "bolly"), ("pride", "holly"),
                      ("shame", "bolly"), ("shame", "holly"),
                      ("pride", "bolly"), ("pride", "holly")]:
        if len(picks) >= n:
            break
        # Prefer recognizable films — filter by valid year + non-empty poster
        pool = [r for r in candidates
                if r["industry"] == ind and r["emotion"] == emo
                and r["film_year"] and r["film_poster_path"]
                and r["film_id"] not in seen_films]
        if not pool:
            continue
        # Prefer dialogues with cleaner cause text
        pool.sort(key=lambda r: (
            -1 if len(r["dialogue"]) > 100 else 0,
            r["dialogue_id"],
        ))
        pick = pool[0]
        seen_films.add(pick["film_id"])
        picks.append({
            "id": f"round_{len(picks)+1:02d}",
            "dialogue": pick["dialogue"],
            "answer_industry": pick["industry"],
            "answer_emotion": pick["emotion"],
            "film": {
                "title": pick["film_title"],
                "year": pick["film_year"],
                "poster_path": pick["film_poster_path"],
                "country": pick["film_country"],
            },
            "target_gender": pick["target_gender"],
            "theme_label": pick["theme_label"],
            "cause_raw": pick["cause_raw"],
        })
    return picks


# =========================================================================
# Station 2 — The Atlas
# =========================================================================

def build_station2(dialogues: list[dict]) -> dict:
    # Compute per-theme: count by industry, total dialogues, delta
    # Δ = (n_bolly / N_bolly_emotion) - (n_holly / N_holly_emotion)
    by_theme = defaultdict(lambda: defaultdict(int))  # theme_id -> {bolly/holly: n}
    theme_meta = {}  # theme_id -> {emotion, label}
    by_emotion_industry = defaultdict(int)  # (emotion, industry) -> total

    for r in dialogues:
        if not r["theme_id"]:
            continue
        tid = r["theme_id"]
        emo = r["emotion"]
        ind = r["industry"]
        by_theme[tid][ind] += 1
        theme_meta[tid] = {"emotion": emo, "label": r["theme_label"]}
        by_emotion_industry[(emo, ind)] += 1

    themes = []
    for tid, counts in by_theme.items():
        meta = theme_meta[tid]
        emo = meta["emotion"]
        n_b = counts["bolly"]
        n_h = counts["holly"]
        N_b = by_emotion_industry[(emo, "bolly")]
        N_h = by_emotion_industry[(emo, "holly")]
        share_b = n_b / N_b if N_b else 0
        share_h = n_h / N_h if N_h else 0
        delta = share_b - share_h
        # Pick example dialogues: 5 per theme, biased toward dominant industry
        examples = pick_theme_examples(dialogues, tid, n=5, delta=delta)
        themes.append({
            "id": int(tid),
            "emotion": emo,
            "label": meta["label"],
            "n_bolly": n_b,
            "n_holly": n_h,
            "total": n_b + n_h,
            "share_bolly": share_b,
            "share_holly": share_h,
            "delta_bolly_minus_holly": delta,
            "examples": examples,
        })

    themes.sort(key=lambda t: (-t["total"]))

    # Films index: top films by dialogue count, for the search bar
    by_film = defaultdict(lambda: {"shame": 0, "pride": 0})
    film_meta = {}
    for r in dialogues:
        if r["film_matched"] != "1":
            continue
        fid = r["film_id"]
        by_film[fid][r["emotion"]] += 1
        if fid not in film_meta:
            film_meta[fid] = {
                "id": fid,
                "title": r["film_title"],
                "year": r["film_year"],
                "industry": r["industry"],
                "country": r["film_country"],
                "poster_path": r["film_poster_path"],
            }
    films_index = []
    for fid, counts in by_film.items():
        m = film_meta[fid]
        films_index.append({
            **m,
            "shame_count": counts["shame"],
            "pride_count": counts["pride"],
            "total_count": counts["shame"] + counts["pride"],
        })
    films_index.sort(key=lambda f: -f["total_count"])

    return {
        "themes": themes,
        "films_index": films_index[:300],  # top 300 by total dialogue count
        "totals_by_emotion_industry": {
            f"{emo}_{ind}": v
            for (emo, ind), v in by_emotion_industry.items()
        },
    }


def pick_theme_examples(dialogues: list[dict], theme_id: str, n: int = 5, delta: float = 0.0) -> list[dict]:
    pool = [r for r in dialogues
            if r["theme_id"] == theme_id
            and r["film_matched"] == "1"
            and 50 <= len(r["dialogue"] or "") <= 400]
    # Bias toward the industry the theme leans toward (delta > 0 → Bollywood, < 0 → Hollywood)
    if delta > 0:
        n_dominant, n_other = max(n - 1, n * 3 // 4), max(1, n // 4)
        dominant, other = "bolly", "holly"
    else:
        n_dominant, n_other = max(n - 1, n * 3 // 4), max(1, n // 4)
        dominant, other = "holly", "bolly"
    dom_pool = [r for r in pool if r["industry"] == dominant][:n_dominant]
    oth_pool = [r for r in pool if r["industry"] == other][:n_other]
    out = (dom_pool + oth_pool)[:n]
    if len(out) < n:
        rest = [r for r in pool if r not in out][: n - len(out)]
        out += rest
    return [{
        "dialogue_id": r["dialogue_id"],
        "dialogue": r["dialogue"],
        "industry": r["industry"],
        "target_gender": r["target_gender"],
        "cause_raw": r["cause_raw"],
        "film": {
            "title": r["film_title"],
            "year": r["film_year"],
            "poster_path": r["film_poster_path"],
        },
    } for r in out]


# =========================================================================
# Station 3 — The Lens (per-film breakdowns)
# =========================================================================

def build_station3(dialogues: list[dict], top_n: int = 50) -> list[dict]:
    """Build per-film JSON for top N most-popular films with both shame and pride coverage.
    Also writes a lens_index.json with the slug list."""
    by_film = defaultdict(list)
    for r in dialogues:
        if r["film_matched"] != "1":
            continue
        by_film[r["film_id"]].append(r)

    scored = []
    for fid, rows in by_film.items():
        emos = set(r["emotion"] for r in rows)
        if len(rows) < 3:
            continue
        if len(emos) < 1:
            continue
        score = len(rows) * (2 if len(emos) == 2 else 1)
        scored.append((score, fid, rows))
    scored.sort(reverse=True)

    written = []
    for _, fid, rows in scored[:top_n]:
        first = rows[0]
        themes = Counter()
        gender_emo = defaultdict(lambda: Counter())
        for r in rows:
            if r["theme_label"]:
                themes[r["theme_label"]] += 1
            if r["target_gender"] in ("male", "female"):
                gender_emo[r["emotion"]][r["target_gender"]] += 1

        film_data = {
            "film": {
                "id": fid,
                "title": first["film_title"],
                "year": first["film_year"],
                "industry": first["industry"],
                "country": first["film_country"],
                "poster_path": first["film_poster_path"],
                "overview": first["film_overview"],
            },
            "totals": {
                "shame": sum(1 for r in rows if r["emotion"] == "shame"),
                "pride": sum(1 for r in rows if r["emotion"] == "pride"),
            },
            "themes": [{"label": k, "count": v} for k, v in themes.most_common()],
            "gender_breakdown": {
                emo: dict(c) for emo, c in gender_emo.items()
            },
            "dialogues": [{
                "dialogue_id": r["dialogue_id"],
                "emotion": r["emotion"],
                "dialogue": r["dialogue"],
                "target_person": r["target_person"],
                "target_gender": r["target_gender"],
                "cause_raw": r["cause_raw"],
                "theme_label": r["theme_label"],
            } for r in rows],
        }
        slug = slugify(f"{first['industry']}-{first['film_title']}-{first['film_year']}")
        out_path = PUB / "station3_lens" / f"{slug}.json"
        out_path.write_text(json.dumps(film_data, ensure_ascii=False, indent=2))
        written.append({
            "slug": slug,
            "title": first["film_title"],
            "year": first["film_year"],
            "industry": first["industry"],
            "poster_path": first["film_poster_path"],
            "totals": film_data["totals"],
        })

    # Sort: industry split + year recency
    written.sort(key=lambda f: (f["industry"], -(int(f["year"]) if f["year"].isdigit() else 0)))
    (PUB / "lens_index.json").write_text(json.dumps(written, ensure_ascii=False, indent=2))
    return written


# =========================================================================
# Main
# =========================================================================

def main():
    print("Loading dialogues.csv...")
    dialogues = load_dialogues()
    print(f"  {len(dialogues)} records")

    # Coverage report
    n_with_gender = sum(1 for r in dialogues if r["target_gender"] in ("male", "female"))
    n_with_theme = sum(1 for r in dialogues if r["theme_id"])
    n_with_film = sum(1 for r in dialogues if r["film_matched"] == "1")
    print(f"  gender labeled: {n_with_gender} ({n_with_gender/len(dialogues)*100:.1f}%)")
    print(f"  theme assigned: {n_with_theme} ({n_with_theme/len(dialogues)*100:.1f}%)")
    print(f"  film matched: {n_with_film} ({n_with_film/len(dialogues)*100:.1f}%)")

    print("\nBuilding Station 1 (Mirror)...")
    s1 = build_station1(dialogues)
    (PUB / "station1_mirror.json").write_text(json.dumps(s1, ensure_ascii=False, indent=2))
    print(f"  guess rounds: {len(s1['guess_rounds'])}")

    print("Building Station 2 (Atlas)...")
    s2 = build_station2(dialogues)
    (PUB / "station2_atlas.json").write_text(json.dumps(s2, ensure_ascii=False, indent=2))
    print(f"  themes: {len(s2['themes'])}")
    print(f"  films in index: {len(s2['films_index'])}")

    print("Building Station 3 (Lens)...")
    s3_films = build_station3(dialogues, top_n=50)
    print(f"  per-film files written: {len(s3_films)}")

    # Meta
    meta = {
        "corpus_size": len(dialogues),
        "films_matched": n_with_film,
        "themes": {
            "shame": sum(1 for t in s2["themes"] if t["emotion"] == "shame"),
            "pride": sum(1 for t in s2["themes"] if t["emotion"] == "pride"),
        },
        "gender_coverage_pct": round(n_with_gender / len(dialogues) * 100, 1),
        "theme_coverage_pct": round(n_with_theme / len(dialogues) * 100, 1),
    }
    (PUB / "meta.json").write_text(json.dumps(meta, indent=2))
    print(f"\nWrote public/data/{{station1_mirror,station2_atlas,meta}}.json + {len(s3_films)} per-film files")


if __name__ == "__main__":
    main()
