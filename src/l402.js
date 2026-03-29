// L402 Protocol Handler
// Implements Lightning Labs' L402 spec: https://github.com/lightninglabs/l402d

import { decode } from 'bolt11';
import { bech32 } from 'bech32';
import axios from 'axios';

// ─── L402 Utilities ────────────────────────────────────────────────────────────

/**
 * Create a macaroon for an L402 session.
 * In production this would come from a proper macaroon library.
 * For our MVP, we encode restrictions in the macaroon payload.
 */
export function createMacaroon(invoiceAmount, endpoint, expiryHours = 1) {
  const payload = {
    v: 1,
    amt: invoiceAmount,
    path: endpoint,
    exp: Math.floor(Date.now() / 1000) + (expiryHours * 3600),
    nonce: crypto.randomUUID()
  };
  const json = JSON.stringify(payload);
  const buf = Buffer.from(json, 'utf8');
  // In production: sign with HMAC using a server secret
  // For MVP: base64url encode (deployment should add signing)
  return buf.toString('base64url');
}

/**
 * Verify a macaroon is valid for the requested endpoint.
 */
export function verifyMacaroon(macaroon, requestedEndpoint) {
  try {
    const buf = Buffer.from(macaroon, 'base64url');
    const payload = JSON.parse(buf.toString('utf8'));
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Macaroon expired');
    }
    if (payload.path !== requestedEndpoint) {
      throw new Error('Macaroon path mismatch');
    }
    return payload;
  } catch (e) {
    throw new Error(`Macaroon invalid: ${e.message}`);
  }
}

/**
 * Decode a bolt11 invoice to get the payment hash (for preimage verification).
 */
export function getInvoicePaymentHash(invoice) {
  try {
    const decoded = decode(invoice);
    return decoded.tags.find(t => t.tagName === 'payment_hash')?.data;
  } catch (e) {
    throw new Error(`Invalid invoice: ${e.message}`);
  }
}

/**
 * Build the WWW-Authenticate header for a 402 response.
 */
export function buildAuthHeader(macaroon, invoice) {
  return `L402 macaroon="${macaroon}", invoice="${invoice}"`;
}

/**
 * Parse the Authorization header from an L402 request.
 */
export function parseAuthHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('L402 ')) {
    throw new Error('Missing or invalid L402 auth header');
  }
  const parts = authHeader.slice(5).split(',').map(p => p.trim());
  const result = {};
  for (const part of parts) {
    const [key, val] = part.split('=');
    result[key] = val.replace(/^"|"$/g, '');
  }
  if (!result.macaroon || !result.preimage) {
    throw new Error('Missing macaroon or preimage in auth header');
  }
  return result;
}

/**
 * Verify the preimage against an invoice payment hash.
 * The preimage must SHA256-hash to the payment hash from the invoice.
 */
export function verifyPreimage(preimage, invoicePaymentHash) {
  const preimageBuf = Buffer.from(preimage, 'hex');
  const hash = crypto.createHash('sha256').update(preimageBuf).digest('hex');
  if (hash !== invoicePaymentHash) {
    throw new Error('Preimage does not match invoice payment hash');
  }
  return true;
}

// ─── Lightning Backend Interface ──────────────────────────────────────────────
// Abstract interface — plug in Alby, LNbits, or a custom LND instance

export class LightningBackend {
  async createInvoice(amountSats, memo) {
    throw new Error('Must implement createInvoice()');
  }
  async lookupInvoice(paymentHash) {
    throw new Error('Must implement lookupInvoice()');
  }
}

// ─── Alby Backend ─────────────────────────────────────────────────────────────
// Uses Alby's REST API. Requires ALBY_API_KEY env var.

export class AlbyBackend extends LightningBackend {
  constructor(apiKey, invoiceWebhookSecret) {
    super();
    this.apiKey = apiKey;
    this.webhookSecret = invoiceWebhookSecret;
    this.baseUrl = 'https://api.getalby.com';
  }

  async createInvoice(amountSats, memo) {
    const res = await axios.post(
      `${this.baseUrl}/invoices`,
      {
        amount: amountSats * 1000, // Alby uses millisats
        memo: memo || 'NakaNomad API',
        description_hash: Buffer.from(memo || 'NakaNomad API').toString('base64')
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return {
      invoice: res.data.payment_request,
      paymentHash: res.data.id,
      expiresAt: res.data.expires_at
    };
  }

  async lookupInvoice(paymentHash) {
    // Alby uses internal ID, not payment hash — fallback to checking
    // a recent invoice list (in production, use webhook for async settlement)
    const res = await axios.get(
      `${this.baseUrl}/invoices/${paymentHash}`,
      {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      }
    );
    return {
      settled: res.data.state === 'paid',
      preimage: res.data.preimage
    };
  }
}

// ─── LNbits Backend ───────────────────────────────────────────────────────────
// Self-hosted option. Requires LNbits URL + INVOICE_KEY.

export class LNbitsBackend extends LightningBackend {
  constructor(url, invoiceKey) {
    super();
    this.url = url.replace(/\/$/, '');
    this.key = invoiceKey;
  }

  async createInvoice(amountSats, memo) {
    const res = await axios.post(
      `${this.url}/api/v1/invoices`,
      {
        out: false,
        amount: amountSats,
        memo: memo || 'NakaNomad API'
      },
      {
        headers: { 'X-Api-Key': this.key }
      }
    );
    return {
      invoice: res.data.payment_request,
      paymentHash: res.data.payment_hash,
      expiresAt: null
    };
  }

  async lookupInvoice(paymentHash) {
    const res = await axios.get(
      `${this.url}/api/v1/poll/${paymentHash}`,
      { headers: { 'X-Api-Key': this.key } }
    );
    return {
      settled: res.data.paid,
      preimage: res.data.preimage || null
    };
  }
}

// ─── Settlement Cache ──────────────────────────────────────────────────────────
// In-memory cache of settled invoices. In production, use Redis or a database.
// For a stateless API server, use webhooks for settlement notifications.

const settledCache = new Map(); // paymentHash → { preimage, settledAt }

export function cacheSettled(paymentHash, preimage) {
  settledCache.set(paymentHash, { preimage, settledAt: Date.now() });
}

export function isSettled(paymentHash) {
  const entry = settledCache.get(paymentHash);
  if (!entry) return false;
  // Expire cache entries after 1 hour
  if (Date.now() - entry.settledAt > 3600000) {
    settledCache.delete(paymentHash);
    return false;
  }
  return true;
}

/**
 * Check if an invoice has been paid.
 * In production: use webhook for async confirmation + poll fallback.
 */
export async function checkInvoiceSettled(paymentHash, backend) {
  if (isSettled(paymentHash)) return true;
  try {
    const result = await backend.lookupInvoice(paymentHash);
    if (result.settled) {
      cacheSettled(paymentHash, result.preimage);
      return true;
    }
  } catch (e) {
    // Invoice not found or not settled
  }
  return false;
}
