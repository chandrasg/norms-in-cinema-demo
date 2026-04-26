"""
Enrich films.csv with TMDB metadata: poster, plot, year, country, runtime, top cast.

Match strategy:
  1. /search/movie?query=<title>&year=<year_hint>  with region preference
  2. If no result with year, retry without year filter
  3. Pick highest-popularity match, tie-broken by year proximity
  4. For Bolly: bias toward IN-origin films; for Holly: bias toward US

Caching:
  - Per-(title,year) JSON cached in data/cache/tmdb/<hash>.json
  - Re-runs are idempotent and free

Output:
  - data/processed/films_enriched.csv
  - data/processed/films_unmatched.csv
"""

import csv
import json
import os
import re
import time
import hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote_plus

import requests
from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
# Cache is stored outside the project tree by default to avoid mounted-FS perms issues.
# Override with TMDB_CACHE_DIR if needed.
CACHE = Path(os.environ.get("TMDB_CACHE_DIR", "/tmp/mapgen_tmdb_cache"))
CACHE.mkdir(parents=True, exist_ok=True)

ENV = {}
env_path = ROOT / ".env.local"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip()

TMDB_TOKEN = ENV.get("TMDB_READ_TOKEN") or os.environ.get("TMDB_READ_TOKEN")
TMDB_KEY = ENV.get("TMDB_API_KEY") or os.environ.get("TMDB_API_KEY")
if not (TMDB_TOKEN or TMDB_KEY):
    raise SystemExit("Missing TMDB credentials in .env.local")

HEADERS = {"accept": "application/json"}
if TMDB_TOKEN:
    HEADERS["Authorization"] = f"Bearer {TMDB_TOKEN}"

API = "https://api.themoviedb.org/3"


def cache_path(industry: str, title: str, year_hint: str) -> Path:
    h = hashlib.sha1(f"{industry}::{title}::{year_hint}".encode()).hexdigest()[:16]
    return CACHE / f"{h}.json"


JUNK_TOKENS = {
    "avl", "avi", "en", "hd", "webhd", "avc", "untouched", "ddr", "by",
    "rip", "subs", "esubs", "esub", "exclusive", "team", "bindass",
    "video", "running", "time", "you", "tube", "youtube",
    "hindi", "english", "subtitle", "subtitles", "original",
    "indianhacker", "hon3y", "rarbg", "yify",
}


def _do_search(query: str, params: dict) -> list:
    try:
        p = {**params, "query": query}
        r = requests.get(f"{API}/search/movie", params=p, headers=HEADERS, timeout=10)
        r.raise_for_status()
        return r.json().get("results", [])
    except Exception:
        return []


def _clean_for_search(t: str) -> str:
    """Drop orphan junk tokens and special punctuation before sending to TMDB."""
    # Strip "+", "_" leftovers and reduce punctuation to spaces (preserve apostrophes)
    s = re.sub(r"[+_]", " ", t)
    s = re.sub(r"[^\w\s\-'.&!?:]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Drop junk tokens
    tokens = [tok for tok in s.split() if tok.lower() not in JUNK_TOKENS]
    return " ".join(tokens)


def search_movie(title: str, year_hint: str | None, industry: str) -> dict | None:
    """Search TMDB and return the best matching movie record, or None."""
    if not title:
        return None

    params_base = {"include_adult": "true"}
    if year_hint:
        params_base["primary_release_year"] = year_hint
    if industry == "bolly":
        params_base["region"] = "IN"
    elif industry == "holly":
        params_base["region"] = "US"

    # Pass 1: full title, with year
    results = _do_search(title, params_base)

    # Pass 2: cleaned title (junk tokens dropped), with year
    cleaned = _clean_for_search(title)
    if not results and cleaned and cleaned != title:
        results = _do_search(cleaned, params_base)

    # Pass 3: drop year filter
    if not results and year_hint:
        no_year = {k: v for k, v in params_base.items() if k != "primary_release_year"}
        results = _do_search(cleaned or title, no_year)

    # Pass 4: try just the first 4 words (handles "Amar Akbar Anthony Manmohan Desai")
    if not results:
        short = " ".join((cleaned or title).split()[:4])
        if short and short != (cleaned or title):
            results = _do_search(short, params_base)
            if not results and year_hint:
                no_year = {k: v for k, v in params_base.items() if k != "primary_release_year"}
                results = _do_search(short, no_year)

    if not results:
        return None

    # Title similarity helpers
    def normalize_for_match(t: str) -> str:
        return re.sub(r"[^a-z0-9 ]", "", t.lower()).strip()

    def title_similarity(a: str, b: str) -> float:
        """Token-set Jaccard with a bonus for exact-prefix match."""
        a_n, b_n = normalize_for_match(a), normalize_for_match(b)
        if not a_n or not b_n:
            return 0.0
        if a_n == b_n:
            return 1.0
        a_tokens = set(a_n.split())
        b_tokens = set(b_n.split())
        if not a_tokens or not b_tokens:
            return 0.0
        jaccard = len(a_tokens & b_tokens) / len(a_tokens | b_tokens)
        # Bonus if one is a prefix/contained-in-the-other (handles "Dil Se" → "Dil Se..")
        if a_n in b_n or b_n in a_n:
            jaccard = max(jaccard, 0.6)
        return jaccard

    # Score: title similarity is dominant, then origin country, then year proximity,
    # then popularity (gentle tiebreaker only).
    def score(m):
        tmdb_title = m.get("title", "")
        tmdb_orig = m.get("original_title", "") or tmdb_title
        sim = max(title_similarity(title, tmdb_title), title_similarity(title, tmdb_orig))
        s = sim * 1000  # title match dominates everything

        origin = (m.get("origin_country") or [])
        rd = m.get("release_date") or ""
        rd_year = int(rd[:4]) if rd[:4].isdigit() else None

        # Industry alignment — strong, but not dominant
        if industry == "bolly":
            if "IN" in origin:
                s += 200
            elif any(c in origin for c in ("PK", "BD", "NP", "LK")):
                s += 30
            else:
                s -= 50  # penalize non-South-Asian films
        elif industry == "holly":
            if "US" in origin:
                s += 200
            elif any(c in origin for c in ("GB", "CA", "AU", "NZ", "IE")):
                s += 80
            else:
                s -= 30

        # Year proximity
        if year_hint and rd_year:
            try:
                yh = int(year_hint)
                diff = abs(yh - rd_year)
                if diff == 0:
                    s += 100
                elif diff <= 1:
                    s += 40
                elif diff <= 3:
                    s += 10
                else:
                    s -= diff * 2
            except ValueError:
                pass

        # Popularity is a soft tiebreaker only (cap so it can't override sim)
        s += min(m.get("popularity", 0.0), 50)

        return s

    best = max(results, key=score)

    # Reject matches with very low title similarity — they're noise
    tmdb_title = best.get("title", "")
    tmdb_orig = best.get("original_title", "") or tmdb_title
    best_sim = max(title_similarity(title, tmdb_title), title_similarity(title, tmdb_orig))
    if best_sim < 0.34:  # below ~1/3 token overlap with no prefix containment
        return None

    return best


def fetch_full(movie_id: int) -> dict | None:
    """Fetch /movie/<id>?append_to_response=credits for cast and full details."""
    try:
        r = requests.get(
            f"{API}/movie/{movie_id}",
            params={"append_to_response": "credits"},
            headers=HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def enrich_one(row: dict) -> dict:
    """Look up one film and return an enriched record (using cache)."""
    industry = row["industry"]
    title = row["clean_title"]
    year_hint = row.get("year_hint", "") or ""

    cp = cache_path(industry, title, year_hint)
    if cp.exists():
        try:
            cached = json.loads(cp.read_text())
            # If the cache says we couldn't match, optionally retry — controlled by env flag.
            # This lets us re-run the loose-retry path without clearing the cache directory.
            if cached.get("matched") or os.environ.get("TMDB_RETRY_UNMATCHED") != "1":
                return cached
        except Exception:
            pass

    if not title or len(title) < 1:
        result = {**row, "tmdb_id": "", "matched": False, "reason": "empty_title"}
        cp.write_text(json.dumps(result))
        return result

    match = search_movie(title, year_hint, industry)
    if not match:
        result = {**row, "tmdb_id": "", "matched": False, "reason": "no_search_results"}
        cp.write_text(json.dumps(result))
        return result

    full = fetch_full(match["id"])
    if not full:
        result = {**row, "tmdb_id": match["id"], "matched": False, "reason": "fetch_failed"}
        cp.write_text(json.dumps(result))
        return result

    cast = full.get("credits", {}).get("cast", [])[:5]
    rd = full.get("release_date") or ""
    countries = [c.get("iso_3166_1", "") for c in full.get("production_countries", [])]
    languages = full.get("spoken_languages", [])

    result = {
        **row,
        "tmdb_id": full.get("id", ""),
        "matched": True,
        "tmdb_title": full.get("title", ""),
        "tmdb_original_title": full.get("original_title", ""),
        "tmdb_year": rd[:4] if rd else "",
        "tmdb_overview": full.get("overview", ""),
        "tmdb_poster_path": full.get("poster_path", "") or "",
        "tmdb_runtime": full.get("runtime", "") or "",
        "tmdb_country_codes": "|".join(countries),
        "tmdb_languages": "|".join(l.get("iso_639_1", "") for l in languages),
        "tmdb_popularity": full.get("popularity", 0),
        "tmdb_vote_avg": full.get("vote_average", 0),
        "tmdb_vote_count": full.get("vote_count", 0),
        "tmdb_cast": "|".join(c.get("name", "") for c in cast),
    }
    cp.write_text(json.dumps(result))
    return result


def main():
    films_path = PROC / "films.csv"
    with open(films_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # Drop empty / single-char shards we won't recover from
    rows = [r for r in rows if len(r.get("clean_title", "")) >= 2]
    print(f"Enriching {len(rows)} films...")

    results = []
    # TMDB tolerates ~50 req/sec but we go conservative; 8 workers is fine.
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(enrich_one, r): r for r in rows}
        for fut in tqdm(as_completed(futures), total=len(futures), unit="film"):
            try:
                results.append(fut.result())
            except Exception as e:
                r = futures[fut]
                results.append({**r, "matched": False, "reason": f"error:{e}"})

    # Write enriched
    matched = [r for r in results if r.get("matched")]
    unmatched = [r for r in results if not r.get("matched")]

    enriched_fields = [
        "industry", "original_filename", "clean_title", "year_hint",
        "tmdb_id", "matched", "tmdb_title", "tmdb_original_title", "tmdb_year",
        "tmdb_overview", "tmdb_poster_path", "tmdb_runtime",
        "tmdb_country_codes", "tmdb_languages",
        "tmdb_popularity", "tmdb_vote_avg", "tmdb_vote_count", "tmdb_cast",
    ]
    with open(PROC / "films_enriched.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=enriched_fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(matched)

    unmatched_fields = ["industry", "original_filename", "clean_title", "year_hint", "reason"]
    with open(PROC / "films_unmatched.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=unmatched_fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(unmatched)

    print(f"\nMatched: {len(matched)} / {len(results)} ({len(matched)/len(results)*100:.1f}%)")
    print(f"Unmatched: {len(unmatched)}")

    # Reason breakdown for unmatched
    from collections import Counter
    rc = Counter(r.get("reason", "") for r in unmatched)
    for reason, n in rc.most_common():
        print(f"  {n:>4} | {reason}")

    # Per-industry match rate
    for ind in ("bolly", "holly"):
        ind_total = sum(1 for r in results if r["industry"] == ind)
        ind_matched = sum(1 for r in results if r["industry"] == ind and r.get("matched"))
        print(f"\n{ind}: {ind_matched}/{ind_total} ({ind_matched/ind_total*100:.1f}% matched)")


if __name__ == "__main__":
    main()
