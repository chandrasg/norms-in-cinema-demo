# MAPGEN Lens API

Edge serverless function that powers Station 3 Mode A (paste-a-scene) on
sharathg.cis.upenn.edu/mapgen-demo. Hosted on Vercel; the static site at Penn
calls it via CORS.

## Endpoint

`POST /api/lens`

Request:
```json
{ "scene": "FATHER: Where have you been? ..." }
```

Response:
```json
{
  "shame_markers": ["...", "..."],
  "pride_markers": [],
  "target_gender": "female",
  "predicted_themes": { "bolly": ["Marital Status"], "holly": ["Self-Image Issues"] },
  "cultural_reading": { "bolly": "...", "holly": "..." },
  "caveat": "...",
  "model": "gpt-4o"
}
```

## Local dev

```bash
cd api
npm install
vercel link        # one-time, links to a Vercel project
vercel env add OPENAI_API_KEY    # paste key when prompted
vercel env add ALLOWED_ORIGIN    # paste e.g. https://sharathg.cis.upenn.edu
vercel dev         # local server at localhost:3000
```

Test:
```bash
curl -X POST http://localhost:3000/api/lens \
  -H "Content-Type: application/json" \
  -d '{"scene":"FATHER: Where have you been? Look at the time. DAUGHTER: I was at Riya'\''s. FATHER: Have you no shame?"}'
```

## Deploy

```bash
vercel deploy --prod
```

Note the deployed URL (e.g. `https://mapgen-lens-api.vercel.app`).

## Wire into the static site

In `/Users/sharathg/Documents/GitHub/norms-in-cinema-demo`, set the deployed
URL as the build env var before running `npm run build`:

```bash
export PUBLIC_LENS_ENDPOINT="https://mapgen-lens-api.vercel.app/api/lens"
npm run build
```

The Astro site will pick that up at build time and embed it into the Lens
PasteScene component, so the static HTML calls the API directly.

## Environment variables (set on Vercel dashboard or via `vercel env add`)

- `OPENAI_API_KEY` (required) — your OpenAI key
- `LLM_MODEL` (optional) — defaults to `gpt-4o`. Override with whatever
  model your account has access to (e.g. `gpt-5.5` if available).
- `ALLOWED_ORIGIN` (recommended) — comma-separated origins. Set to
  `https://sharathg.cis.upenn.edu` for production. Use `*` for dev only.

## Rate limit

Built-in token bucket: 60 requests / IP / hour. Adjust `USAGE_LIMIT_PER_HOUR`
in `lens.ts` if needed. For real abuse protection, swap to a Redis-backed
limiter (Upstash on Vercel works well).
