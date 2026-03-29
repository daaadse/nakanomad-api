// Jurisdiction data adapter
// Reads from NakaNomad's status.json, normalizes for API responses

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Pricing (sats) ───────────────────────────────────────────────────────────

export const PRICING = {
  '/v1/jurisdiction': 50,
  '/v1/jurisdictions': 100,
  '/v1/score': 25,
  '/v1/news': 30,
  '/v1/summary': 75
};

// ─── Raw data loader ──────────────────────────────────────────────────────────

function loadRawData() {
  try {
    const raw = readFileSync(
      resolve(__dirname, '../../nakanomad.com/api/status.json'),
      'utf8'
    );
    return JSON.parse(raw);
  } catch (e) {
    // Fallback: return embedded minimal data if file not found
    return null;
  }
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeCountry(raw) {
  return {
    id: raw.id,
    name: raw.name,
    flag: raw.flag,
    status: raw.status,
    cryptoTax: {
      rate: raw.cryptoTax,
      territorial: raw.cryptoTax?.includes('0%'),
      note: raw.bitcoinScore ? 'Bitcoin gains tax treatment per current law' : null,
      carfStatus: 'preparing' // TODO: track per-country CARF implementation
    },
    foreignIncome: raw.foreignIncome,
    visa: raw.details ? {
      program: raw.details.program,
      costUsd: parseInt(raw.details.cost?.replace(/[$,]/g, '') || '0'),
      durationYears: raw.details.duration === 'Indefinite' ? null
        : parseInt(raw.details.duration) || null,
      physicalPresence: raw.details.physicalPresence,
      bitcoinScene: raw.details.bitcoinScene
    } : null,
    banking: {
      noLocalBankRequired: true,
      ibkrCompatible: true,
      wiseCompatible: true
    },
    costOfLiving: raw.details?.costOfLiving || null,
    timezone: raw.timezone || null,
    bitcoinScore: raw.bitcoinScore?.total || null,
    bitcoinScoreBreakdown: raw.bitcoinScore || null,
    lastUpdated: raw.lastChange,
    urgency: raw.urgency,
    alert: raw.alert,
    nextPolicyChange: raw.id === 'thailand' ? 'April 2026 (new government)'
      : raw.id === 'czech' ? 'July 2026 (effective date)'
      : null
  };
}

function normalizeNewsItem(item) {
  return {
    timestamp: item.timestamp,
    type: item.type,
    icon: item.icon,
    jurisdiction: item.jurisdiction,
    message: item.message,
    source: item.source,
    severity: item.severity
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getJurisdiction(countryId) {
  const raw = loadRawData();
  if (!raw) return null;
  const found = raw.jurisdictions?.find(j => j.id === countryId.toLowerCase());
  return found ? normalizeCountry(found) : null;
}

export function getAllJurisdictions() {
  const raw = loadRawData();
  if (!raw) return [];
  return (raw.jurisdictions || []).map(normalizeCountry);
}

export function getScore(countryId) {
  const raw = loadRawData();
  if (!raw) return null;
  const found = raw.jurisdictions?.find(j => j.id === countryId.toLowerCase());
  if (!found) return null;
  return {
    country: found.id,
    name: found.name,
    flag: found.flag,
    totalScore: found.bitcoinScore?.total || 0,
    breakdown: found.bitcoinScore || null,
    status: found.status
  };
}

export function getSummary(asset = 'btc') {
  const raw = loadRawData();
  if (!raw) return [];
  const jurisdictions = (raw.jurisdictions || [])
    .filter(j => j.status === 'favorable' || j.bitcoinScore?.total > 70)
    .sort((a, b) => (b.bitcoinScore?.total || 0) - (a.bitcoinScore?.total || 0))
    .slice(0, 5);

  return jurisdictions.map(j => ({
    rank: 0,
    id: j.id,
    name: j.name,
    flag: j.flag,
    status: j.status,
    cryptoTax: j.cryptoTax,
    bitcoinScore: j.bitcoinScore?.total,
    visaProgram: j.details?.program,
    visaCost: j.details?.cost,
    why: j.id === 'thailand' ? 'Territorial tax confirmed through 2029. Elite Visa. No local bank needed.'
      : j.id === 'uae' ? '0% across the board. Golden Visa. No tax residency requirement.'
      : j.id === 'czech' ? '0% Bitcoin tax effective July 2026. EU member. 3-year hold.'
      : j.id === 'elsalvador' ? 'Legal tender. 0% gains. Bitcoin bonds. Identity economy.'
      : j.id === 'paraguay' ? '0%. Permanent residency from $5K. No local presence required.'
      : null
  })).map((j, i) => ({ ...j, rank: i + 1 }));
}

export function getNews({ type, jurisdiction } = {}) {
  const raw = loadRawData();
  if (!raw) return [];
  let items = (raw.newsStream || []).map(normalizeNewsItem);
  if (type) items = items.filter(n => n.type === type);
  if (jurisdiction) items = items.filter(n =>
    n.jurisdiction?.toLowerCase() === jurisdiction.toLowerCase()
  );
  return items.slice(0, 20);
}

export function getHealth() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    network: 'mainnet',
    protocol: 'L402'
  };
}
