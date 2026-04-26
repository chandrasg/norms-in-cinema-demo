"""
Flag films in our corpus that played at Cannes Film Festival.

Strategy: TMDB tags films with the "Cannes Film Festival" keyword (ID 9748)
plus several related keywords. We pull the full list of films tagged with any
of these, then intersect with our films_enriched.csv on tmdb_id.

Output: data/processed/cannes_films.csv
"""

import csv
import json
import os
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"

ENV = {}
env_path = ROOT / ".env.local"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            ENV[k.strip()] = v.strip()
TMDB_TOKEN = ENV.get("TMDB_READ_TOKEN")
HEADERS = {"accept": "application/json", "Authorization": f"Bearer {TMDB_TOKEN}"}

# Cannes-related TMDB keyword IDs (we use multiple to maximize recall)
CANNES_KEYWORDS = {
    9748: "cannes film festival",
    214180: "palme d'or",
    231050: "cannes",
}


def fetch_keyword_movies(keyword_id: int) -> list[dict]:
    """Discover movies tagged with a keyword (paginated, with concurrency)."""
    from concurrent.futures import ThreadPoolExecutor

    # First request to discover total pages
    try:
        r = requests.get(
            "https://api.themoviedb.org/3/discover/movie",
            params={"with_keywords": keyword_id, "page": 1, "include_adult": "true",
                    "sort_by": "popularity.desc"},
            headers=HEADERS, timeout=15,
        )
        r.raise_for_status()
        first = r.json()
    except Exception as e:
        print(f"  initial fetch failed: {e}", flush=True)
        return []

    total_pages = min(first.get("total_pages", 1), 500)
    print(f"  total_pages={total_pages}, total_results={first.get('total_results', 0)}", flush=True)
    movies = list(first.get("results", []))

    if total_pages == 1:
        return movies

    def fetch_page(p):
        try:
            r = requests.get(
                "https://api.themoviedb.org/3/discover/movie",
                params={"with_keywords": keyword_id, "page": p, "include_adult": "true",
                        "sort_by": "popularity.desc"},
                headers=HEADERS, timeout=15,
            )
            r.raise_for_status()
            return r.json().get("results", [])
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=10) as ex:
        for results in ex.map(fetch_page, range(2, total_pages + 1)):
            movies.extend(results)
    return movies


def main():
    cannes_ids = {}
    for kid, label in CANNES_KEYWORDS.items():
        print(f"Fetching films tagged '{label}' (keyword {kid})...", flush=True)
        movies = fetch_keyword_movies(kid)
        print(f"  → {len(movies)} films", flush=True)
        for m in movies:
            mid = m.get("id")
            if mid:
                cannes_ids[mid] = {
                    "tmdb_id": str(mid),
                    "tmdb_title": m.get("title", ""),
                    "tmdb_year": (m.get("release_date") or "")[:4],
                    "matched_keyword": label,
                }
    print(f"\nTotal unique Cannes-tagged films: {len(cannes_ids)}")

    # Load our films
    with open(PROC / "films_enriched.csv", newline="", encoding="utf-8") as f:
        our_films = list(csv.DictReader(f))
    our_by_id = {r["tmdb_id"]: r for r in our_films if r.get("tmdb_id")}

    # Intersect
    matches = []
    for tid, info in cannes_ids.items():
        sid = str(tid)
        if sid in our_by_id:
            ours = our_by_id[sid]
            matches.append({
                "tmdb_id": sid,
                "industry": ours["industry"],
                "title": ours["tmdb_title"],
                "year": ours["tmdb_year"],
                "country": ours["tmdb_country_codes"],
                "matched_keyword": info["matched_keyword"],
            })

    matches.sort(key=lambda r: (r["year"] or "0000", r["title"]))

    out_path = PROC / "cannes_films.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["tmdb_id", "industry", "title", "year", "country", "matched_keyword"])
        w.writeheader()
        w.writerows(matches)

    print(f"\n{len(matches)} of our films played at Cannes (or are tagged with Cannes keywords).")
    print()
    bolly = [r for r in matches if r["industry"] == "bolly"]
    holly = [r for r in matches if r["industry"] == "holly"]
    print(f"Bollywood: {len(bolly)}")
    for r in bolly[:15]:
        print(f"  {r['year']} | {r['title']!r}")
    print(f"\nHollywood: {len(holly)}")
    for r in holly[:25]:
        print(f"  {r['year']} | {r['title']!r}")


if __name__ == "__main__":
    main()
