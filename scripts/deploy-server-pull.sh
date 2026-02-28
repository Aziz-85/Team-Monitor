#!/bin/bash
# On the server: pull latest without losing server-specific config.
# Run from repo root: bash scripts/deploy-server-pull.sh
#
# This discards only package-lock.json local changes so pull can fast-forward.
# Your .env and ecosystem.config.cjs are left unchanged.

set -e
echo "=== Discarding local package-lock.json so pull can proceed ==="
git checkout -- package-lock.json
echo "=== Pulling origin main ==="
git pull origin main
echo "=== Done. Next: npm install && npx prisma generate && npx prisma migrate deploy && npm run build && pm2 restart ... ==="
