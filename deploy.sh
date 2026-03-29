#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# NakaNomad API — Fly.io Deploy Script
# ─────────────────────────────────────────────────────────────
set -e

echo "🚀 Deploying NakaNomad Jurisdiction API to Fly.io..."

# Check dependencies
command -v flyctl >/dev/null 2>&1 || { echo "❌ flyctl not found. Install: curl -L https://fly.io/install.sh | sh"; exit 1; }

# Check Alby API key
if [[ -z "$ALBY_API_KEY" ]]; then
  echo "❌ ALBY_API_KEY not set."
  echo "   Get your key at: https://getalby.com"
  echo "   Then run: ALBY_API_KEY=xxx ./deploy.sh"
  exit 1
fi

# Launch app (creates fly.toml if it doesn't exist)
echo "📦 Launching app..."
fly launch --no-generate-names --copy-config 2>/dev/null || true

# Set secrets
echo "🔐 Setting secrets..."
fly secrets set ALBY_API_KEY="$ALBY_API_KEY"
fly secrets set L402_SECRET="$(openssl rand -hex 32)"

# Generate a random L402 secret if not provided
if [[ -z "$L402_SECRET" ]]; then
  fly secrets set L402_SECRET="$(openssl rand -hex 32)"
fi

# Deploy
echo "🚀 Deploying..."
fly deploy

# Get public URL
echo ""
echo "✅ Deployed!"
fly apps list | grep nakanomad || true
echo ""
echo "Your API is live. Next steps:"
echo "  1. Set your Lightning backend's webhook to: https://<app-name>.fly.dev/webhook/lightning"
echo "  2. Submit to satring.com:   satring submit --new"
echo "  3. See your endpoints:       curl https://<app-name>.fly.dev/health"
