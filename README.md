# NakaNomad Jurisdiction API

**Paid, machine-readable jurisdiction intelligence for Bitcoin holders and AI agents.**

Covers tax rates, visa programs, banking rules, CARF status, and policy change timelines — all the data that exists in legal text but has no machine-friendly home anywhere else.

Paid in Bitcoin via Lightning Network using the L402 protocol. No accounts. No API keys. Payment is authentication.

---

## Quick Start

```bash
# Install
npm install

# Development (free, no Lightning)
DEV_MODE=true node src/server.js

# Production (requires Lightning backend)
ALBY_API_KEY=your_key node src/server.js
```

API available at `http://localhost:3000`

---

## Endpoints

| Endpoint | Sats | Description |
|---|---|---|
| `GET /health` | **FREE** | Service status |
| `GET /v1/jurisdictions` | 100 | All jurisdictions, ranked |
| `GET /v1/jurisdiction/:country` | 50 | Full data for one country |
| `GET /v1/score?country=X` | 25 | Bitcoin sovereignty score |
| `GET /v1/news` | 30 | Latest policy alerts |
| `GET /v1/summary?asset=btc` | 75 | Top 5 jurisdictions for BTC |

---

## Usage

### 1. Request (no payment)
```bash
curl https://api.nakanomad.com/v1/jurisdiction/thailand
```
Returns `402 Payment Required` with a Lightning invoice.

### 2. Pay the invoice
Open your Lightning wallet, scan or paste the invoice, pay 50 sats.

### 3. Retry with proof of payment
```bash
curl -H "Authorization: L402 macaroon=\"...\", preimage=\"...\"" \
  https://api.nakanomad.com/v1/jurisdiction/thailand
```
Returns the full jurisdiction data.

---

## L402 Protocol

L402 is Bitcoin Lightning native. The flow:

1. Client requests resource
2. Server returns HTTP 402 + Lightning invoice
3. Client pays invoice (any Lightning wallet)
4. Client gets payment preimage
5. Client retries with `Authorization: L402 macaroon:PREIMAGE`
6. Server verifies preimage → serves data

For AI agents, this whole flow is automated. The agent's wallet pays, gets the preimage, retries — all without human intervention.

---

## Lightning Setup

### Option A: Alby (easiest)
1. Get an Alby API key: https://getalby.com
2. Set `ALBY_API_KEY=your_key`

### Option B: LNbits (self-hosted)
1. Run your own LNbits instance
2. Set `LIGHTNING_BACKEND=lnbits`
3. Set `LNBITS_URL=https://your-lnbits.com`
4. Set `LNBITS_INVOICE_KEY=your_invoice_key`

### Webhook
Point your Lightning backend's webhook to `/webhook/lightning` so the server gets instant settlement notifications.

---

## Deployment

### 1. Get Alby API Key
1. Sign up at https://getalby.com
2. Go to Account → API Keys → Create new key
3. Copy the key

### 2. Deploy to Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Authenticate
flyctl auth login

# Deploy (from the nakanomad-api directory)
cd nakanomad-api
ALBY_API_KEY=your_key_here flyctl launch --copy-config
flyctl secrets set ALBY_API_KEY=your_key_here
flyctl deploy
```

Or use the deploy script:
```bash
chmod +x deploy.sh
ALBY_API_KEY=your_key ./deploy.sh
```

Your API will be live at `https://nakanomad-api.fly.dev`

### 3. Configure Webhook

In your Alby dashboard → Webhooks, add:
```
https://nakanomad-api.fly.dev/webhook/lightning
```

This lets the API receive instant settlement notifications so paid requests succeed within seconds.

---

## Submit to satring.com

Once your API is live, submit it to the directory so AI agents can discover it:

```bash
# Install satring CLI
npx satring submit --new

# Interactive form:
# name> nakanomad-api
# url> https://nakanomad-api.fly.dev
# description> Bitcoin jurisdiction intelligence for AI agents. Tax rates, visa programs, banking rules, CARF status — practitioner-sourced data.
# protocol> L402
# price (sats)> 50
# model> gpt-4
# categories> data, finance
# your name> NakaNomad
# contact> yummystarfish23@primal.net
```

This costs **1,000 sats** — paid via L402 at submission time.

The satring team reviews listings and publishes within 24-48 hours.

---

## For AI Agents

Add to your agent's MCP config:

```json
{
  "mcpServers": {
    "nakanomad-api": {
      "command": "npx",
      "args": ["-y", "@nakanomad/api-client"]
    }
  }
}
```

Or call the API directly with an L402-capable HTTP client (lnget, Alby SDK, or implement the 402 flow yourself — it's just two HTTP requests).

---

## Data Sources

All data is practitioner-sourced from:
- Actual visa applications (Thailand Elite Visa, UAE Golden Visa, Czech Trade License)
- Real tax filings and legal analysis (Norway → Thailand exit)
- Live policy monitoring (DAC8, CARF, per-country tax law changes)

Updated manually as policies change. For the latest human-readable version: [nakanomad.com](https://nakanomad.com)

---

## Pricing

All prices in satoshis (sats) — the Bitcoin Lightning unit.

| Endpoint | Price |
|---|---|
| `/v1/jurisdictions` | 100 sats |
| `/v1/jurisdiction/:country` | 50 sats |
| `/v1/score` | 25 sats |
| `/v1/news` | 30 sats |
| `/v1/summary` | 75 sats |

At current BTC prices: 100 sats ≈ $0.07. You get full jurisdiction intelligence for less than one cent.

---

## No Competition

Generic crypto data (prices, OHLCV) is saturated and mostly free. Jurisdiction intelligence for Bitcoiners — with a practitioner track record — has no machine-readable equivalent anywhere.

This is NakaNomad's moat: the relationships, the field experience, the actual exits documented.

---

*Built on Bitcoin. Paid in sats. Run by practitioners.*
# Deploy triggered Sun Mar 29 07:46:47 UTC 2026
