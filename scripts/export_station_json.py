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


# Cached per-film dialogue counts — used as a popularity proxy when picking
# representative examples. Films with many extracted dialogues are typically
# more notable / better-covered than one-off matches.
_FILM_COUNT_CACHE: dict[str, int] = {}


def _film_counts(dialogues: list[dict]) -> dict[str, int]:
    if _FILM_COUNT_CACHE:
        return _FILM_COUNT_CACHE
    for r in dialogues:
        if r.get("film_matched") == "1" and r.get("film_id"):
            _FILM_COUNT_CACHE[r["film_id"]] = _FILM_COUNT_CACHE.get(r["film_id"], 0) + 1
    return _FILM_COUNT_CACHE


def example_quality_score(r: dict, film_counts: dict[str, int]) -> float:
    """Heuristic score for picking 'good' example dialogues — recent, pithy,
    from films that are well-represented in the corpus (proxy for popularity).
    Higher is better. Designed so a recent line from a famous film with a
    60–120 char punchline will rank near the top."""
    dlg = r.get("dialogue") or ""
    n = len(dlg)
    # Pithy: 60–120 = best, taper to 0 below 40 or above 240
    if 60 <= n <= 120:
        pithy = 1.0
    elif 40 <= n < 60 or 120 < n <= 180:
        pithy = 0.7
    elif 180 < n <= 240:
        pithy = 0.4
    else:
        pithy = 0.1

    year = 0
    yr = r.get("film_year") or ""
    if yr.isdigit():
        year = int(yr)
    # Recency: post-2015 = 1.0, 2000–2014 = 0.6, pre-2000 = 0.3
    if year >= 2015:
        recency = 1.0
    elif year >= 2000:
        recency = 0.6
    else:
        recency = 0.3

    # Popularity proxy: total extracted dialogues from this film, capped at 50
    pop_raw = film_counts.get(r.get("film_id", ""), 0)
    popularity = min(pop_raw / 50.0, 1.0)

    # Has a poster? (small bonus — means TMDB enrichment found a real film)
    poster_bonus = 0.1 if r.get("film_poster_path") else 0.0

    return pithy * 0.45 + recency * 0.30 + popularity * 0.20 + poster_bonus


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

    # Era trend — female share of shame and male share of pride by era
    # This is the punchline: Hollywood is moving women into pride; Bollywood is moving them out.
    era_order = ["pre_2000", "2000_2014", "2015_present"]
    era_trend = []
    for bucket in era_order:
        row = {"era": bucket}
        for ind in ("bolly", "holly"):
            shame_c = era_data["shame"][ind].get(bucket, Counter())
            pride_c = era_data["pride"][ind].get(bucket, Counter())
            shame_lab = shame_c["male"] + shame_c["female"]
            pride_lab = pride_c["male"] + pride_c["female"]
            row[f"{ind}_shame_female_share"] = shame_c["female"] / shame_lab if shame_lab else 0.0
            row[f"{ind}_pride_male_share"] = pride_c["male"] / pride_lab if pride_lab else 0.0
            row[f"{ind}_pride_female_share"] = pride_c["female"] / pride_lab if pride_lab else 0.0
            row[f"{ind}_shame_n"] = shame_lab
            row[f"{ind}_pride_n"] = pride_lab
        era_trend.append(row)

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
        "era_trend": era_trend,
    }


def pick_guess_rounds(dialogues: list[dict], n: int = 8) -> list[dict]:
    """Pick dialogues that are good for the guess-the-industry game.
    Criteria: well-known film, clear gender label, distinctive cause, dialogue
    length suitable for screen display. Biased toward recent + pithy + popular."""
    fc = _film_counts(dialogues)
    candidates = []
    for r in dialogues:
        if r["film_matched"] != "1":
            continue
        if not r["target_gender"] in ("male", "female"):
            continue
        dlg = (r["dialogue"] or "").strip()
        if not (50 <= len(dlg) <= 220):
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
        # Sort by quality score (recent + pithy + popular)
        pool.sort(key=lambda r: -example_quality_score(r, fc))
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
    # Sort: films with BOTH emotions first (more culturally telling),
    # then by total dialogue count.
    films_index.sort(key=lambda f: (
        0 if (f["shame_count"] > 0 and f["pride_count"] > 0) else 1,
        -f["total_count"],
    ))

    return {
        "themes": themes,
        "films_index": films_index[:300],  # top 300 by total dialogue count
        "totals_by_emotion_industry": {
            f"{emo}_{ind}": v
            for (emo, ind), v in by_emotion_industry.items()
        },
    }


def pick_theme_examples(dialogues: list[dict], theme_id: str, n: int = 5, delta: float = 0.0) -> list[dict]:
    fc = _film_counts(dialogues)
    pool = [r for r in dialogues
            if r["theme_id"] == theme_id
            and r["film_matched"] == "1"
            and 40 <= len(r["dialogue"] or "") <= 280]
    # Rank pool by quality (recent + pithy + popular)
    pool.sort(key=lambda r: -example_quality_score(r, fc))

    # Bias toward the industry the theme leans toward (delta > 0 → Bollywood, < 0 → Hollywood)
    if delta > 0:
        n_dominant, n_other = max(n - 1, n * 3 // 4), max(1, n // 4)
        dominant, other = "bolly", "holly"
    else:
        n_dominant, n_other = max(n - 1, n * 3 // 4), max(1, n // 4)
        dominant, other = "holly", "bolly"
    # Take top-quality from each industry within the ranked pool
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
# Station 4 — The Studio (stakeholder dossiers)
# =========================================================================

def build_studio(dialogues: list[dict]) -> dict:
    """Build per-stakeholder data: archetype compass, convergence zone,
    whitespace map. Companion to station2_atlas which has the per-theme
    deltas — this layer cuts the same data by character archetype and
    surfaces the cross-cultural / under-explored views."""

    # ---------- Norm Compass — archetype × theme ranking ----------
    # 4 archetypes: female/male × bolly/holly. For each, top shame triggers
    # and top pride triggers, with one example dialogue per top trigger.
    archetypes = [
        ("female", "bolly", "Women in Bollywood"),
        ("female", "holly", "Women in Hollywood"),
        ("male", "bolly", "Men in Bollywood"),
        ("male", "holly", "Men in Hollywood"),
    ]

    fc = _film_counts(dialogues)

    def _compass_for(gender: str, industry: str) -> dict:
        rows = [r for r in dialogues
                if r["target_gender"] == gender
                and r["industry"] == industry
                and r["theme_label"]]

        out = {"shame": [], "pride": []}
        for emo in ("shame", "pride"):
            theme_counts = Counter(
                r["theme_label"] for r in rows if r["emotion"] == emo
            )
            total = sum(theme_counts.values())
            triggers = []
            for theme_label, n in theme_counts.most_common(6):
                # Pick a clean, pithy, recent, popular-film example for this theme
                example_pool = [r for r in rows
                                if r["emotion"] == emo
                                and r["theme_label"] == theme_label
                                and r["film_matched"] == "1"
                                and r["dialogue"]
                                and 40 <= len(r["dialogue"]) <= 220
                                and r["film_poster_path"]]
                example = None
                if example_pool:
                    # Rank by overall quality, with a small bonus for clean cause text
                    example_pool.sort(key=lambda r: -(
                        example_quality_score(r, fc) +
                        (0.05 if r.get("cause_raw") and len(r["cause_raw"]) > 10 else 0)
                    ))
                    e = example_pool[0]
                    example = {
                        "dialogue": e["dialogue"],
                        "cause_raw": e["cause_raw"],
                        "film": {
                            "title": e["film_title"],
                            "year": e["film_year"],
                            "poster_path": e["film_poster_path"],
                        },
                    }
                triggers.append({
                    "theme": theme_label,
                    "n": n,
                    "share": n / total if total else 0,
                    "example": example,
                })
            out[emo] = {"total": total, "triggers": triggers}
        return out

    compass = []
    for gender, industry, label in archetypes:
        data = _compass_for(gender, industry)
        compass.append({
            "id": f"{gender}_{industry}",
            "gender": gender,
            "industry": industry,
            "label": label,
            **data,
        })

    # ---------- Convergence Zone — themes present in BOTH industries ----------
    # Rank themes by min(share_bolly, share_holly): high score = strongly present
    # in both. These are the cross-cultural findings.
    by_theme = defaultdict(lambda: defaultdict(int))
    theme_meta = {}
    by_emotion_industry = defaultdict(int)
    for r in dialogues:
        if not r["theme_id"]:
            continue
        tid = r["theme_id"]
        by_theme[tid][r["industry"]] += 1
        theme_meta[tid] = {"emotion": r["emotion"], "label": r["theme_label"]}
        by_emotion_industry[(r["emotion"], r["industry"])] += 1

    convergence = []
    for tid, counts in by_theme.items():
        meta = theme_meta[tid]
        n_b, n_h = counts["bolly"], counts["holly"]
        N_b = by_emotion_industry[(meta["emotion"], "bolly")]
        N_h = by_emotion_industry[(meta["emotion"], "holly")]
        if N_b == 0 or N_h == 0:
            continue
        share_b = n_b / N_b
        share_h = n_h / N_h
        # convergence score = harmonic mean (penalizes themes only present in one)
        if share_b + share_h > 0:
            harmonic = 2 * share_b * share_h / (share_b + share_h)
        else:
            harmonic = 0
        convergence.append({
            "label": meta["label"],
            "emotion": meta["emotion"],
            "n_bolly": n_b,
            "n_holly": n_h,
            "share_bolly": share_b,
            "share_holly": share_h,
            "convergence_score": harmonic,
            "delta": share_b - share_h,
        })
    convergence.sort(key=lambda t: -t["convergence_score"])
    convergence = convergence[:12]

    # ---------- Whitespace Map — under-explored themes ----------
    # For funders: themes where one industry has substantial coverage but the
    # other doesn't. Frames "what stories haven't been told yet."
    whitespace = []
    for tid, counts in by_theme.items():
        meta = theme_meta[tid]
        n_b, n_h = counts["bolly"], counts["holly"]
        N_b = by_emotion_industry[(meta["emotion"], "bolly")]
        N_h = by_emotion_industry[(meta["emotion"], "holly")]
        share_b = n_b / N_b if N_b else 0
        share_h = n_h / N_h if N_h else 0
        # "Whitespace" = a theme robustly present on one side (>=3%), with at
        # least a 2.5x share gap to the other side. Frames "stories one
        # industry tells that the other under-tells."
        if share_h >= 0.03 and share_b < share_h / 2.5:
            whitespace.append({
                "label": meta["label"],
                "emotion": meta["emotion"],
                "absent_in": "bolly",
                "present_in": "holly",
                "n_present": n_h,
                "n_absent": n_b,
                "share_present": share_h,
                "share_absent": share_b,
                "ratio": share_h / share_b if share_b else 999,
            })
        elif share_b >= 0.03 and share_h < share_b / 2.5:
            whitespace.append({
                "label": meta["label"],
                "emotion": meta["emotion"],
                "absent_in": "holly",
                "present_in": "bolly",
                "n_present": n_b,
                "n_absent": n_h,
                "share_present": share_b,
                "share_absent": share_h,
                "ratio": share_b / share_h if share_h else 999,
            })
    whitespace.sort(key=lambda t: -t["ratio"])

    # ---------- Subversion Files — one inverted-gender example per dominant trope ----------
    # For each top Bolly-leaning shame theme, find an example where a MAN is
    # shamed (against the dominant pattern). Same for top Holly-leaning, etc.
    # Quick set of "subverted" picks for the filmmakers section.
    subversions = []
    bolly_shame_themes = sorted(
        [t for tid, t in theme_meta.items() if t["emotion"] == "shame"],
        key=lambda t: -by_theme[next(k for k, v in theme_meta.items() if v == t)]["bolly"]
    )[:4]
    # For simplicity here we pick across the corpus: themes for women-shame
    # but where the labeled target was male, and vice versa.
    seen = set()
    for theme_label_target in [
        "Inappropriate Behavior", "Marital Status", "Sexual Harassment",
        "Family Honor", "Modesty", "Promiscuity",
    ]:
        # Find a film/dialogue where this theme is applied to a MAN
        # (in either industry) — this is the subversion.
        candidates = [r for r in dialogues
                      if r["theme_label"] == theme_label_target
                      and r["target_gender"] == "male"
                      and r["film_matched"] == "1"
                      and r["dialogue"]
                      and 50 <= len(r["dialogue"]) <= 220
                      and r["film_poster_path"]
                      and r["film_id"] not in seen]
        if not candidates:
            continue
        # Rank by quality score; small Hollywood preference as the inversion
        # is more striking when it shows up in the otherwise-individualist culture
        candidates.sort(key=lambda r: -(
            example_quality_score(r, fc) +
            (0.05 if r["industry"] == "holly" else 0)
        ))
        c = candidates[0]
        seen.add(c["film_id"])
        subversions.append({
            "trope": theme_label_target,
            "subversion": "applied to a male character",
            "dialogue": c["dialogue"],
            "industry": c["industry"],
            "cause_raw": c["cause_raw"],
            "film": {
                "title": c["film_title"],
                "year": c["film_year"],
                "poster_path": c["film_poster_path"],
            },
        })

    return {
        "compass": compass,
        "convergence": convergence,
        "whitespace": whitespace[:8],
        "subversions": subversions,
    }


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

    print("Building Station 4 (Studio)...")
    s4 = build_studio(dialogues)
    (PUB / "station4_studio.json").write_text(json.dumps(s4, ensure_ascii=False, indent=2))
    print(f"  archetypes: {len(s4['compass'])}")
    print(f"  convergence themes: {len(s4['convergence'])}")
    print(f"  whitespace themes: {len(s4['whitespace'])}")
    print(f"  subversions: {len(s4['subversions'])}")

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
