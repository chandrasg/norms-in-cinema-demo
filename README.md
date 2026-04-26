# MAPGEN: Cinema's Mirror — Shame, Pride and Prejudice

A multi-station kiosk + web experience that brings the [Cross-Cultural Social
Norms Dataset](https://github.com/Khushangz/Cross-Cultural-Social-Norms-Dataset)
(Rai et al., NAACL 2025) to life. Built for the MAPGEN session at Cannes 2026.

A research collaboration of the **University of Pennsylvania Computational Social
Listening Lab**, the **World Bank Group**, and the **USC Annenberg Norman Lear
Center**.

## What's here

```
norms-in-cinema-demo/
├── src/                    Astro + React (Tailwind) front-end
│   ├── pages/
│   │   ├── index.astro     Entry hub
│   │   ├── mirror.astro    Station 1 — Guess game + gender asymmetry
│   │   ├── atlas.astro     Station 2 — Theme tug-of-war + film search
│   │   ├── lens.astro      Station 3 — Per-film lens + paste-a-scene
│   │   └── timeline.astro  Ambient — autoplay loop for passive screens
│   ├── components/         React islands per station + shared header/footer
│   ├── layouts/            Shared Layout.astro
│   └── styles/globals.css  MAPGEN brand (navy + gold)
├── api/                    Vercel Edge serverless function (Lens Mode A)
│   └── lens.ts
├── scripts/                Python data pipeline (clean → enrich → cluster → export)
│   ├── clean_filenames.py
│   ├── normalize_causes.py
│   ├── enrich_tmdb.py
│   ├── cluster_themes.py
│   ├── backfill_gender.py
│   ├── flag_cannes.py
│   ├── assemble_dialogues.py
│   ├── export_station_json.py
│   └── deploy.sh
├── data/
│   ├── raw/                Source CSVs (gitignored, pulled at build time)
│   ├── processed/          Pipeline outputs
│   └── SCHEMA.md           Canonical record schema
├── public/
│   ├── data/               Per-station JSON shipped to the client
│   └── logos/              Partner logos
├── logos/                  Source logos (Penn, World Bank, USC, MAPGEN icon)
└── paper_2025.naacl-long.568.pdf
```

## Quickstart (local dev)

```bash
# 1. Install JS deps
npm install

# 2. Pull the dataset (only first time)
git clone --depth 1 https://github.com/Khushangz/Cross-Cultural-Social-Norms-Dataset.git data/raw_clone
cp data/raw_clone/Input_Files/*.csv data/raw/
cp data/raw_clone/Output_Files/*.csv data/raw/

# 3. Set up env
cp .env.example .env.local
# Edit .env.local to add your TMDB key + OpenAI key

# 4. Run the data pipeline (about 15 min for full run, idempotent + cached)
npm run data:full

# 5. Start the dev server
npm run dev
# → open http://localhost:4321/mapgen-demo
```

## Architecture

### Data flow

```
raw CSVs (Input + Output)
   ↓ clean_filenames.py
films.csv (canonical title + year_hint)
   ↓ enrich_tmdb.py     ← TMDB API
films_enriched.csv (poster, plot, country, year, cast)
   ↓ normalize_causes.py
causes_per_dialogue.csv + causes_unique.csv
   ↓ cluster_themes.py  ← OpenAI embeddings + LLM labeling
cause_to_theme.csv + themes.csv (24 shame + 15 pride)
   ↓ backfill_gender.py ← OpenAI chat (single-shot)
gender_backfill.csv
   ↓ assemble_dialogues.py
dialogues.csv (full canonical record — see data/SCHEMA.md)
   ↓ export_station_json.py
public/data/{station1_mirror,station2_atlas,lens_index,meta}.json
              + station3_lens/<film_slug>.json × 50
```

### Front-end

Astro 4 with React islands. Tailwind. Static-only — every page builds to plain
HTML + tiny per-station JS bundles.

| Station | Page | Key components |
|---|---|---|
| Mirror | `/mirror` | `GuessGame`, `AsymmetryDots` |
| Atlas | `/atlas` | `ThemeTugOfWar`, `FilmSearch` |
| Lens | `/lens` | `FilmPicker`, `PasteScene` |
| Timeline (ambient) | `/timeline` | `AmbientTimeline` |

### Kiosk mode

Append `?kiosk=1` to any URL:
- Cursor hides
- Right-click and text-drag are suppressed
- Page idle-resets to the home page after 3 minutes of no interaction
- Fullscreen is auto-requested where supported

The timeline page additionally has a Fullscreen button.

### Lens Mode A (paste-a-scene live LLM)

- Static site reads `PUBLIC_LENS_ENDPOINT` env var at build time and embeds it
- That endpoint is the deployed Vercel Edge function in `api/lens.ts`
- Without `PUBLIC_LENS_ENDPOINT`, the PasteScene component shows a graceful
  "kiosk offline" message — Mode B (50 curated films) still works fully

## Deploy — full release

You need to run two commands. Both require credentials this repo doesn't have.

### Step 1 — Deploy the Lens API to Vercel

```bash
cd api
npm install
vercel login                    # one-time, opens browser
vercel link                     # one-time, creates a Vercel project
vercel env add OPENAI_API_KEY production    # paste key
vercel env add ALLOWED_ORIGIN production    # https://sharathg.cis.upenn.edu
vercel env add LLM_MODEL production         # gpt-4o (or gpt-5.5)
vercel deploy --prod
# Note the deployed URL — e.g. https://mapgen-lens-api.vercel.app
```

### Step 2 — Build + deploy the static site to Penn CIS

```bash
cd ..
export PUBLIC_LENS_ENDPOINT="https://mapgen-lens-api.vercel.app/api/lens"
./scripts/deploy.sh
# Will rsync dist/ to ~/html/mapgen-demo on sharathg.cis.upenn.edu
# Asks for your Penn CIS password unless you have SSH keys set up
```

Site goes live at:

> **https://sharathg.cis.upenn.edu/mapgen-demo/**

## Data refresh

After the dataset is updated (e.g. when Sunny shares the cluster CSV, or after
the gender backfill completes overnight), re-run only the affected stages:

```bash
# Just re-cluster (uses cached embeddings)
python3 scripts/cluster_themes.py

# Re-assemble + re-export
python3 scripts/assemble_dialogues.py
python3 scripts/export_station_json.py

# Then redeploy
./scripts/deploy.sh
```

All caches (TMDB lookups, embeddings, gender backfill, theme labels) are stored
in `/tmp/mapgen_*_cache/` — no API budget is wasted on re-runs.

## Acknowledging the data + ethics

The dialogues shown across the kiosk are real, drawn from the released dataset.
Films are named, but framing stays at the level of *examples of broader
patterns* — never per-film judgement. The footer carries that disclaimer
on every page.

For the live-LLM scene analyzer (Lens Mode A), the response is explicitly
labeled as "exploratory, not peer-reviewed." Filmmakers using their own scenes
won't mistake a model output for a finding.

## Citation

```bibtex
@inproceedings{rai-etal-2025-social,
  title     = {Social Norms in Cinema: A Cross-Cultural Analysis of Shame, Pride and Prejudice},
  author    = {Rai, Sunny and Zaveri, Khushang Jilesh and Havaldar, Shreya and
               Nema, Soumna and Ungar, Lyle H. and Guntuku, Sharath Chandra},
  booktitle = {Proceedings of NAACL 2025},
  pages     = {11396--11415},
  year      = {2025}
}
```

## License

The dataset is CC BY-SA 4.0 (Cross-Cultural-Social-Norms-Dataset).
The demo code in this repo is MIT.
