# CLAUDE.md — Resume Notes for Future Sessions

This file is a hand-off brief for any Claude (Code or Cowork) picking up the
project after the initial Cowork build. Read this first before reading code.

---

## What this is

**MAPGEN: Cinema's Mirror — Shame, Pride and Prejudice**

A multi-station kiosk + web demo for Sharath Guntuku's MAPGEN session at
Cannes 2026. Brings the Cross-Cultural Social Norms Dataset (Rai et al., NAACL
2025) to life through three interactive stations + an ambient timeline.

Partner orgs (footer logos): University of Pennsylvania, World Bank Group,
USC Annenberg Norman Lear Center.

Hosted at: **https://sharathg.cis.upenn.edu/mapgen-demo**
(Lens API on Vercel — deployed separately, see below.)

---

## Status as of last session

**All 22 tasks completed.** The site builds clean, all stations work end-to-end
on real data, and `dist/` is ready to ship. Two manual auth steps remain for
Sharath:

1. `vercel login` + `vercel deploy --prod` for the Lens API
2. `./scripts/deploy.sh` to rsync `dist/` to Penn CIS

Everything else (data pipeline, frontend, brand, content, accessibility,
kiosk-mode) is done.

### Coverage at last build
- 12,387 dialogue records
- 88.9% of films matched to TMDB (97.6% Hollywood, 82.6% Bollywood)
- 77.4% target_gender coverage (after LLM backfill)
- 84.4% theme assignment coverage
- 80.4% have movie posters

### The numbers that matter
The Mirror's headline reproduces the paper:
- Shame is **4.39× more common** in Bollywood than Hollywood (paper said 4.5)
- Female share of labeled shame: **31% Bollywood, 30% Hollywood** — the
  cross-cultural finding
- Male share of labeled pride: **79% Bollywood, 75% Hollywood**

---

## Architecture overview

```
norms-in-cinema-demo/
├── src/                    Astro 4 + React islands + Tailwind
│   ├── pages/              Each route is one station
│   │   ├── index.astro       Entry hub + audience-segmented closing
│   │   ├── mirror.astro      Station 1
│   │   ├── atlas.astro       Station 2
│   │   ├── lens.astro        Station 3
│   │   └── timeline.astro    Ambient autoplay (kiosk passive screen)
│   ├── components/
│   │   ├── Mirror/           GuessGame + AsymmetryDots
│   │   ├── Atlas/            ThemeTugOfWar + FilmSearch
│   │   ├── Lens/             FilmPicker + PasteScene
│   │   ├── Timeline/         AmbientTimeline
│   │   ├── BrandHeader.astro
│   │   ├── PartnerFooter.astro
│   │   └── KioskMode.astro
│   ├── layouts/Layout.astro
│   └── styles/globals.css   MAPGEN palette (navy + gold, taken from icon)
├── api/                     Vercel Edge function — Lens Mode A
│   ├── lens.ts              POST /api/lens — paste-a-scene LLM analysis
│   ├── package.json
│   ├── vercel.json
│   └── README.md            Deploy steps for the API specifically
├── scripts/                 Python data pipeline (each step idempotent + cached)
│   ├── clean_filenames.py     Subtitle filenames → clean (title, year_hint)
│   ├── normalize_causes.py    Lowercase + lemmatize Cause column
│   ├── enrich_tmdb.py         Title → TMDB metadata (poster, country, year)
│   ├── flag_cannes.py         (UNUSED — TMDB Cannes keyword too noisy)
│   ├── cluster_themes.py      Cause embeddings → 24 shame + 15 pride themes
│   ├── backfill_gender.py     LLM single-shot pass on blank gender records
│   ├── assemble_dialogues.py  Join everything → canonical dialogues.csv
│   ├── export_station_json.py Per-station JSON for the frontend
│   └── deploy.sh              rsync dist/ to Penn CIS
├── data/
│   ├── raw/                 (gitignored) — pulled from
│   │   github.com/Khushangz/Cross-Cultural-Social-Norms-Dataset
│   ├── processed/           Pipeline artifacts (films.csv, dialogues.csv,
│   │                        themes.csv, cause_to_theme.csv, etc.)
│   └── SCHEMA.md            Canonical record schema documentation
├── public/
│   ├── data/                Per-station JSON shipped with the static site
│   │   ├── meta.json
│   │   ├── station1_mirror.json
│   │   ├── station2_atlas.json
│   │   ├── lens_index.json
│   │   └── station3_lens/<slug>.json (×50)
│   └── logos/               Partner logos
├── logos/                   Source logos
├── paper_2025.naacl-long.568.pdf
├── package.json
├── astro.config.mjs         Sets base: '/mapgen-demo'
├── tailwind.config.mjs
├── tsconfig.json
├── README.md                Public-facing project doc
└── CLAUDE.md                This file
```

### Astro config
The site is built with `base: '/mapgen-demo'` so it lives at
`sharathg.cis.upenn.edu/mapgen-demo`. **All internal links use
`import.meta.env.BASE_URL` — never hard-code paths.**

### Caching
All API-spending scripts cache outside the repo (in `/tmp/mapgen_*_cache/`):
- TMDB lookups (3,715 cached)
- OpenAI embeddings (7,808 cached, ~$0.002 spend total)
- LLM theme labels (~80 cached, including batch-level cache key)
- LLM gender predictions (4,249 cached)

Re-runs are free; clearing `/tmp/mapgen_*_cache` forces re-fetch.

---

## Key design decisions

These are decisions Sharath approved — don't reverse without asking him.

| Decision | Rationale |
|---|---|
| **No per-film negative claims** | All examples are framed as "examples of broader patterns." Footer carries this disclaimer on every page. |
| **Full corpus in Stations 1 & 2; 2015–present callout only in Timeline** | Don't dilute the corpus-level findings; spotlight #MeToo era separately. |
| **Recluster from scratch (not paper's labels)** | New embeddings + Ward clustering produced 24 shame + 15 pride themes that map closely to the paper but with sharper, LLM-generated labels. Sharath also requested cross-check against Sunny's CSV when she shares it — see "Open follow-ups." |
| **Posters + film names visible** | Decided "fine — maximize impact." But framing must stay at example level. |
| **MAPGEN brand: navy + gold** | Pulled from the MAPGEN icon. Partner logos sit on white plates in the footer to avoid color clash. |
| **Audience-segmented policy close** | Three cards on the home page: For filmmakers / For funders / For festivals. The funder card teases V2 (250K films, 160 countries). |
| **Lens Mode A is exploratory** | The paste-a-scene endpoint explicitly labels its output as extrapolation, not a peer-reviewed claim. |
| **Cannes flagging via TMDB keyword: skipped** | TMDB's `9748 cannes_film_festival` keyword is too noisy (tagged Creepshow 2 and Rambo as Cannes films). Use TMDB popularity proxy for Station 3 curation. A real Cannes alumni list needs Wikipedia year-by-year scraping. |
| **Static-only hosting on Penn CIS** | Lens Mode A's live LLM call is on a separate Vercel deployment, called from the static page via CORS. |

---

## How to run things

### Full data refresh (about 15 min, idempotent)
```bash
python3 scripts/clean_filenames.py
python3 scripts/normalize_causes.py
python3 scripts/enrich_tmdb.py        # ~10 min if cache cold; instant if warm
python3 scripts/cluster_themes.py     # ~1 min if embeddings cached
python3 scripts/backfill_gender.py    # ~10 min, parallel 8 workers, idempotent
python3 scripts/assemble_dialogues.py
python3 scripts/export_station_json.py
```

Or in one shot: `npm run data:full`
For just the export step (after data tweaks): `npm run data`

### Build
```bash
npm install
npm run build           # outputs to dist/
```

To embed the live Lens API URL at build time:
```bash
PUBLIC_LENS_ENDPOINT="https://YOUR-LENS-API.vercel.app/api/lens" npm run build
```

### Dev server
```bash
npm run dev             # localhost:4321/mapgen-demo
```

### Deploy
```bash
# 1. Deploy Lens API to Vercel (one-time setup, then re-run for updates)
cd api
vercel login            # one-time browser auth
vercel link             # one-time project link
vercel env add OPENAI_API_KEY production
vercel env add ALLOWED_ORIGIN production    # https://sharathg.cis.upenn.edu
vercel env add LLM_MODEL production         # gpt-4o or gpt-5.5
vercel deploy --prod
# Note the deployed URL.

# 2. Build + deploy static site to Penn CIS
cd ..
export PUBLIC_LENS_ENDPOINT="https://YOUR-LENS-URL/api/lens"
./scripts/deploy.sh     # rsync dist/ → ~/html/mapgen-demo on Penn CIS
```

### Test the Lens API locally
```bash
cd api && vercel dev    # runs on localhost:3000
curl -X POST localhost:3000/api/lens \
  -H "Content-Type: application/json" \
  -d '{"scene":"FATHER: Have you no shame? DAUGHTER: ..."}'
```

---

## Secrets and env

`.env.local` (gitignored):
- `TMDB_API_KEY`       - present
- `TMDB_READ_TOKEN`    - present
- `OPENAI_API_KEY`     - present
- `LLM_MODEL`          - `gpt-5.5` (Sharath's preference; falls back to `gpt-4o`)

**Sharath sent both keys in chat — they should be rotated after Cannes.**

For the Vercel deployment, set the same vars via `vercel env add`. Don't commit
the `.env.local`.

---

## Open follow-ups (post-V1)

These are explicitly punted, not forgotten:

1. **Sunny's cluster CSV cross-check.** When Sunny Rai shares the original
   theme assignments, run a quick script comparing them to ours
   (`data/processed/cause_to_theme.csv`). If hers are sharper, swap labels by
   updating only the `theme_label` column — IDs and Δ values stay valid.

2. **Better Cannes alumni list.** TMDB keyword data is too noisy. For real
   "this film played at Cannes" data, scrape Wikipedia's per-year selection
   pages or use festival-cannes.com. Plug into Station 3 picker as a
   priority-sort signal.

3. **More Guess Game rounds.** Station 1 currently has 8 hand-curated rounds
   from the dialogues. Adding 12-16 would let the game be re-played without
   repetition. The selection logic in `pick_guess_rounds()` could also be
   biased toward more recognizable films (TMDB vote_count > some threshold).

4. **Mode A live LLM polish.** The PasteScene component currently shows a raw
   JSON dump of the response. Build a proper rendered view: highlighted scene
   text with shame/pride markers, theme tags per culture, side-by-side
   "Bollywood reading" vs. "Hollywood reading" cards.

5. **V2 dataset (250K films, 160 countries).** Sharath mentioned this is
   coming. Architecturally, the same pipeline (clean → enrich → cluster →
   assemble → export) scales — but TMDB enrichment will need substantially
   more API budget, and clustering 200K+ causes will need either bigger
   compute or hierarchical mini-clustering.

6. **Real kiosk hardware testing.** Kiosk-mode (`?kiosk=1`) is built but
   untested on actual hardware. Touch performance, fullscreen behavior,
   network resilience all need validation on the venue's real screens.

7. **i18n / French copy.** Cannes is multilingual. Some prose copy could be
   French-translated. The dialogues themselves are already in English (paper
   used English translations of Bollywood subtitles).

8. **Analytics.** Currently no telemetry. If you want to know which stations
   are getting attention, add Plausible or similar lightweight event tracking.

---

## Things I'd be careful about

- **Don't break the `import.meta.env.BASE_URL` pattern.** Penn CIS hosting
  serves under `/mapgen-demo` — hard-coding `/` will produce 404s for assets.
- **Don't commit `.env.local` or anything from `data/raw/`.** Both are
  gitignored. The dataset is CC-BY-SA but Sharath prefers fetch-at-build.
- **Don't run `npm run data:full` casually.** TMDB enrichment makes ~3,700 API
  calls; gender backfill makes ~4,200 LLM calls. Both are cached in /tmp, but
  if you nuke /tmp those costs come back. (~$2 for full re-run.)
- **Don't change the Δ formula in Station 2 without understanding it.** It's
  `(n_bolly / total_bolly_emotion) - (n_holly / total_holly_emotion)`, which
  matches the paper's Equation 1.
- **The MAPGEN icon's filename has a literal space in it**
  (`file_00000000420c61f6838119d65d059d02 (1).png`). It's used in
  BrandHeader.astro and PartnerFooter.astro. Don't rename without updating
  references. (Renaming might be worth doing, actually.)
- **The "Shamelessness" theme is meta.** It's people being shamed for *not
  feeling shame* ("Shameless one!"). Bollywood-heavy. It's culturally telling,
  not a clustering bug.

---

## File-by-file map

If you need to edit something fast, here's where to look:

| Want to change... | File |
|---|---|
| Brand colors / fonts | `tailwind.config.mjs` + `src/styles/globals.css` |
| Header / nav | `src/components/BrandHeader.astro` |
| Footer / partner logos | `src/components/PartnerFooter.astro` |
| Audience-segmented policy close | `src/pages/index.astro` (bottom of file) |
| Cultural Pattern essay cards | `src/pages/atlas.astro` (bottom of file) |
| Linguistic Tells cards | `src/pages/mirror.astro` (mid-page) |
| Guess Game rounds | regenerated in `scripts/export_station_json.py` → `pick_guess_rounds()` |
| Tug-of-war Δ values | regenerated in `scripts/export_station_json.py` → `build_station2()` |
| Theme labels | regenerated in `scripts/cluster_themes.py` → `label_clusters()` |
| Kiosk idle reset | `src/components/KioskMode.astro` |
| Lens API prompt | `api/lens.ts` → `SYSTEM_PROMPT` |

---

## Quick health check

```bash
cd /Users/sharathg/Documents/GitHub/norms-in-cinema-demo

# 1. Data layer is intact
ls data/processed/dialogues.csv
ls public/data/station1_mirror.json public/data/station2_atlas.json public/data/lens_index.json
ls public/data/station3_lens/ | wc -l    # should be 50

# 2. Build works
npm install
npm run build && ls dist/index.html dist/mirror dist/atlas dist/lens dist/timeline
```

If those all exist, you're good to deploy. If anything's missing,
`npm run data:full && npm run build` from a clean state will rebuild
everything (with caching, ~30 sec if /tmp caches are warm, ~15 min if cold).
