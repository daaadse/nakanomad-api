# NakaNomad Jurisdiction API — SPEC.md

## Concept & Vision

A paid, machine-readable API for Bitcoin holders and AI agents seeking jurisdiction intelligence. 
Covers tax rates, visa programs, banking rules, CARF status, and policy change timelines — 
all things that exist in legal text but have no machine-friendly home anywhere else.

The data is practitioner-built: not scraped from Twitter, not inferred from press releases. 
Danny's actual experience mapping Thailand + Norway exit, documented for other agents to consume.

## Protocol

L402 — Bitcoin Lightning, native. No accounts, no API keys. 
Payment is authentication. The 402 flow:
1. Request → 402 + Lightning invoice
2. Agent pays → gets preimage
3. Retry with `Authorization: L402 macaroon:preimage`
4. Server verifies → serves data

## Endpoints

### GET /v1/jurisdiction/:country
Full structured data for one country. Asset-aware: can pass ?asset=btc for Bitcoin-specific fields.

Response:
```json
{
  "id": "thailand",
  "name": "Thailand", 
  "flag": "🇹🇭",
  "status": "favorable",
  "cryptoTax": {
    "rate": "0%",
    "note": "2025-2029 exemption on licensed exchanges",
    "territorial": true,
    "remittanceRequired": false
  },
  "foreignIncome": "Exempt (LTR Visa)",
  "visa": {
    "program": "Elite Visa / LTR",
    "costUsd": 14000,
    "durationYears": 5,
    "physicalPresence": "Low"
  },
  "banking": {
    "thaiBankRequired": false,
    "ibkrCompatible": true,
    "wiseCompatible": true,
    "restrictions": "No Thai bank needed for offshore holdings"
  },
  "carfStatus": "preparing",
  "bitcoinScore": 88,
  "lastUpdated": "2026-02-18",
  "nextPolicyChange": "April 2026 (new government)"
}
```

### GET /v1/jurisdictions
List all jurisdictions. Returns array of id, name, flag, status, cryptoTax, bitcoinScore.

### GET /v1/score?country=X&asset=btc
Bitcoin-specific sovereignty score. 
Score = weighted sum of: legalStatus, noCapitalGains, exchangeFreedom, bankingFreedom, etc.
Returns score + breakdown.

### GET /v1/news
Latest jurisdiction alerts (breaking, alert, opportunity).
Filtered by ?type=breaking or ?jurisdiction=thailand

### GET /v1/summary?asset=btc
Best jurisdictions for Bitcoin holders right now.
Returns ranked list with why each matters.

## Pricing

| Endpoint | Price (sats) |
|---|---|
| /jurisdiction/:country | 50 |
| /jurisdictions | 100 |
| /score | 25 |
| /news | 30 |
| /summary | 75 |

## Technical Stack

- Node.js + Fastify
- L402: lightning-polaris or raw lnurl-auth + bolt11 verification
- Data: static JSON (updated manually from NakaNomad research)
- Deployment: Fly.io (Singapore region, close to Thailand)

## Moat

No one else is building this. The data is practitioner-sourced. 
NakaNomad brand = trust in the data.
