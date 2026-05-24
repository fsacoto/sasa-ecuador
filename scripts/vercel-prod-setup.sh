#!/usr/bin/env bash
# Sync production Firebase env vars to Vercel and deploy.
# Requires: vercel login (once), then run from repo root:
#   ./scripts/vercel-prod-setup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${1:-.env.production.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Install Vercel CLI: npm i -g vercel"
  exit 1
fi

echo "→ Linking project (skip if already linked)..."
vercel link --yes 2>/dev/null || vercel link

echo "→ Setting Production environment variables from $ENV_FILE..."
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  key="$(echo "$key" | xargs)"
  value="$(echo "$value" | xargs)"
  [[ -z "$key" ]] && continue
  echo "  $key"
  printf '%s' "$value" | vercel env add "$key" production --force 2>/dev/null \
    || printf '%s' "$value" | vercel env add "$key" production
done < "$ENV_FILE"

echo "→ Deploying to Production..."
vercel deploy --prod --yes

echo "✓ Done. Add the deployment URL to Firebase Auth → Authorized domains if needed."
