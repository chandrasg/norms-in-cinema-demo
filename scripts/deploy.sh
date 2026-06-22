#!/usr/bin/env bash
# Deploy the built site to sharathg.cis.upenn.edu/norms-in-cinema-demo
# Usage:
#   ./scripts/deploy.sh
#
# Prereqs:
#   - You can SSH to sharathg.cis.upenn.edu (set up keys or be ready to type password)
#   - Your home dir on Penn CIS has a public_html/ folder served at the URL
#   - npm run build has produced ./dist
#
# Optional env:
#   PUBLIC_LENS_ENDPOINT       Vercel function URL (e.g. https://...vercel.app/api/lens)
#   PUBLIC_ANALYTICS_CF_TOKEN  Cloudflare Web Analytics token (also auto-read
#                              from .env.local). Register the PENN hostname
#                              (sharathg.cis.upenn.edu) in Cloudflare, since
#                              that's the host visitors actually load from.
#   PENN_HOST             default: sharathg.cis.upenn.edu
#   PENN_USER             default: $USER
#   PENN_PATH             default: ~/html/norms-in-cinema-demo

set -euo pipefail

PENN_HOST="${PENN_HOST:-sharathg.cis.upenn.edu}"
PENN_USER="${PENN_USER:-$USER}"
PENN_PATH="${PENN_PATH:-~/html/norms-in-cinema-demo}"

cd "$(dirname "$0")/.."

echo "→ Running data export to refresh public/data/..."
python3 scripts/export_station_json.py | tail -5

echo "→ Building Astro site..."
# Thread optional PUBLIC_* vars into the build only when set, so we never
# override a value coming from .env.local (Astro/Vite auto-loads that file).
BUILD_ENV=()
if [[ -n "${PUBLIC_LENS_ENDPOINT:-}" ]]; then
  echo "  · Lens API endpoint: $PUBLIC_LENS_ENDPOINT"
  BUILD_ENV+=("PUBLIC_LENS_ENDPOINT=$PUBLIC_LENS_ENDPOINT")
else
  echo "  · No PUBLIC_LENS_ENDPOINT set — Mode A will show offline message"
fi
if [[ -n "${PUBLIC_ANALYTICS_CF_TOKEN:-}" ]]; then
  echo "  · Cloudflare analytics: token set"
  BUILD_ENV+=("PUBLIC_ANALYTICS_CF_TOKEN=$PUBLIC_ANALYTICS_CF_TOKEN")
else
  echo "  · No PUBLIC_ANALYTICS_CF_TOKEN in shell env (also auto-read from .env.local)"
fi
# ${arr[@]+...} guard keeps this safe under `set -u` with an empty array (macOS bash 3.2).
env ${BUILD_ENV[@]+"${BUILD_ENV[@]}"} npm run build

echo "→ Sanity-checking dist..."
test -f dist/index.html || { echo "✗ dist/index.html missing"; exit 1; }
test -d dist/data || { echo "✗ dist/data missing"; exit 1; }
echo "  · dist size: $(du -sh dist | cut -f1)"
echo "  · routes:    $(find dist -name '*.html' | wc -l | xargs)"

echo
echo "→ Deploying to ${PENN_USER}@${PENN_HOST}:${PENN_PATH}"
echo "  (you may be prompted for your Penn CIS password)"
ssh "${PENN_USER}@${PENN_HOST}" "mkdir -p ${PENN_PATH}"
rsync -avz --delete \
  --exclude='.DS_Store' \
  dist/ "${PENN_USER}@${PENN_HOST}:${PENN_PATH}/"

echo
echo "✓ Deployed."
echo "  Open: https://${PENN_HOST}/norms-in-cinema-demo/"
