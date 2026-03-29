// NakaNomad Jurisdiction API — L402 Server
// Serves jurisdiction intelligence for Bitcoin holders, paid in sats via Lightning.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import crypto from 'crypto';
import {
  createMacaroon,
  verifyMacaroon,
  getInvoicePaymentHash,
  buildAuthHeader,
  parseAuthHeader,
  AlbyBackend,
  LNbitsBackend,
  checkInvoiceSettled,
  isSettled,
  cacheSettled
} from './l402.js';
import {
  PRICING,
  getJurisdiction,
  getAllJurisdictions,
  getScore,
  getSummary,
  getNews,
  getHealth
} from './data.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';
const DEV_MODE = process.env.DEV_MODE === 'true';

const LIGHTNING_BACKEND = process.env.LIGHTNING_BACKEND || 'alby';
const ALBY_API_KEY = process.env.ALBY_API_KEY || '';
const LNITS_URL = process.env.LNBITS_URL || '';
const LNBITS_KEY = process.env.LNBITS_INVOICE_KEY || '';

// ─── Backend factory ──────────────────────────────────────────────────────────

function getBackend() {
  if (LIGHTNING_BACKEND === 'lnbits') {
    if (!LNITS_URL || !LNBITS_KEY) throw new Error('LNBITS_URL and LNBITS_INVOICE_KEY required');
    return new LNbitsBackend(LNITS_URL, LNBITS_KEY);
  }
  if (!ALBY_API_KEY) throw new Error('ALBY_API_KEY required (or set LIGHTNING_BACKEND=lnbits)');
  return new AlbyBackend(ALBY_API_KEY);
}

// ─── Invoice store ─────────────────────────────────────────────────────────────

const pendingInvoices = new Map();

function addPendingInvoice(paymentHash, { macaroon, amountSats, endpoint, invoice }) {
  pendingInvoices.set(paymentHash, { macaroon, amountSats, endpoint, invoice, createdAt: Date.now() });
  setTimeout(() => pendingInvoices.delete(paymentHash), 3600000);
}

function findPendingByMacaroon(macaroon) {
  for (const [hash, entry] of pendingInvoices.entries()) {
    if (entry.macaroon === macaroon) {
      if (Date.now() - entry.createdAt > 1800000) {
        pendingInvoices.delete(hash);
        return null;
      }
      return { paymentHash: hash, ...entry };
    }
  }
  return null;
}

// ─── L402 check helper ─────────────────────────────────────────────────────────

/**
 * Returns null if check passes (proceed to handler).
 * Returns a reply object if payment required or unauthorized.
 */
async function checkL402(request, reply, { endpoint, amountSats }) {
  if (DEV_MODE) {
    request.l402 = { devMode: true, amountPaid: 0 };
    return null;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader) {
    // No payment → return 402 with invoice
    const backend = getBackend();
    const { invoice, paymentHash } = await backend.createInvoice(amountSats, `NakaNomad API: ${endpoint}`);
    const macaroon = createMacaroon(amountSats, endpoint);
    addPendingInvoice(paymentHash, { macaroon, amountSats, endpoint, invoice });
    reply.code(402)
      .header('WWW-Authenticate', buildAuthHeader(macaroon, invoice))
      .send({
        error: 'Payment Required',
        satCost: amountSats,
        endpoint,
        paymentHash,
        instructions: {
          step1: 'Pay the Lightning invoice using any wallet (Alby, Muun, Phoenix, etc.)',
          step2: 'Retry this request with the Authorization header from this response'
        }
      });
    return reply;
  }

  // Has auth → verify L402
  try {
    const { macaroon, preimage } = parseAuthHeader(authHeader);
    const macaroonData = verifyMacaroon(macaroon, endpoint);

    const pending = findPendingByMacaroon(macaroon);
    if (!pending) {
      reply.code(401).send({ error: 'Macaroon not found or expired. Request a new invoice.' });
      return reply;
    }

    if (!isSettled(pending.paymentHash)) {
      const settled = await checkInvoiceSettled(pending.paymentHash, getBackend());
      if (!settled) {
        reply.code(402).send({
          error: 'Invoice not yet settled',
          satCost: amountSats,
          paymentHash: pending.paymentHash,
          hint: 'Pay the invoice, then retry. Settlement is usually < 5 seconds.'
        });
        return reply;
      }
    }

    pendingInvoices.delete(pending.paymentHash);
    request.l402 = { amountPaid: macaroonData.amt };
    return null;

  } catch (e) {
    reply.code(401).send({ error: 'Unauthorized', message: e.message });
    return reply;
  }
}

// ─── Server ──────────────────────────────────────────────────────────────────

const fastify = Fastify({ logger: true });
await fastify.register(cors, { origin: '*' });

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health — FREE
fastify.get('/health', async () => getHealth());

// GET /v1/jurisdictions
fastify.get('/v1/jurisdictions', async (request, reply) => {
  const result = await checkL402(request, reply, {
    endpoint: '/v1/jurisdictions',
    amountSats: PRICING['/v1/jurisdictions']
  });
  if (result) return; // 402/401 sent

  const data = getAllJurisdictions();
  return { count: data.length, jurisdictions: data, _paid: request.l402 };
});

// GET /v1/jurisdiction/:country
fastify.get('/v1/jurisdiction/:country', async (request, reply) => {
  const country = request.params.country;
  const result = await checkL402(request, reply, {
    endpoint: `/v1/jurisdiction/${country}`,
    amountSats: PRICING['/v1/jurisdiction']
  });
  if (result) return;

  const data = getJurisdiction(country);
  if (!data) {
    return reply.code(404).send({
      error: 'Country not found',
      hint: 'Try /v1/jurisdictions for all available countries',
      available: ['thailand', 'uae', 'czech', 'elsalvador', 'portugal', 'norway', 'netherlands', 'paraguay', 'malaysia', 'cyprus', 'hongkong', 'switzerland', 'italy']
    });
  }
  return { ...data, _paid: request.l402 };
});

// GET /v1/score?country=X
fastify.get('/v1/score', async (request, reply) => {
  const country = request.query.country;
  if (!country) {
    return reply.code(400).send({ error: 'Missing required query param: country' });
  }
  const result = await checkL402(request, reply, {
    endpoint: '/v1/score',
    amountSats: PRICING['/v1/score']
  });
  if (result) return;

  const data = getScore(country);
  if (!data) return reply.code(404).send({ error: 'Country not found' });
  return { ...data, _paid: request.l402 };
});

// GET /v1/news?type=X&jurisdiction=X
fastify.get('/v1/news', async (request, reply) => {
  const result = await checkL402(request, reply, {
    endpoint: '/v1/news',
    amountSats: PRICING['/v1/news']
  });
  if (result) return;

  const data = getNews({
    type: request.query.type,
    jurisdiction: request.query.jurisdiction
  });
  return { count: data.length, items: data, _paid: request.l402 };
});

// GET /v1/summary?asset=btc
fastify.get('/v1/summary', async (request, reply) => {
  const result = await checkL402(request, reply, {
    endpoint: '/v1/summary',
    amountSats: PRICING['/v1/summary']
  });
  if (result) return;

  const data = getSummary(request.query.asset || 'btc');
  return { asset: request.query.asset || 'btc', count: data.length, rankings: data, _paid: request.l402 };
});

// ─── Lightning Webhook ─────────────────────────────────────────────────────────
// POST /webhook/lightning — receives settlement notifications from Alby/LNbits

fastify.post('/webhook/lightning', async (request, reply) => {
  const body = request.body || {};
  const paymentHash = body.payment_hash || body.id;
  if (!paymentHash) return reply.code(400).send({ error: 'Missing payment_hash' });

  const settled = body.settled || body.paid;
  if (settled) {
    cacheSettled(paymentHash, body.preimage || body.payment_preimage || 'dev-settled');
    // Also mark the pending invoice as settled so checkL402 can verify
    for (const [hash, entry] of pendingInvoices.entries()) {
      if (hash === paymentHash) {
        entry.settled = true;
      }
    }
  }
  return { ok: true, paymentHash };
});

// ─── Start ────────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 NakaNomad API running on http://${HOST}:${PORT}`);
    console.log(`📋 Endpoints (prices in sats):`);
    console.log(`   GET /health                   — FREE${DEV_MODE ? ' [DEV MODE]' : ''}`);
    console.log(`   GET /v1/jurisdictions         — ${PRICING['/v1/jurisdictions']} sats`);
    console.log(`   GET /v1/jurisdiction/:country — ${PRICING['/v1/jurisdiction']} sats`);
    console.log(`   GET /v1/score?country=X       — ${PRICING['/v1/score']} sats`);
    console.log(`   GET /v1/news                  — ${PRICING['/v1/news']} sats`);
    console.log(`   GET /v1/summary?asset=btc     — ${PRICING['/v1/summary']} sats`);
    console.log(`⚡ Lightning: ${DEV_MODE ? 'DISABLED (DEV_MODE=true)' : LIGHTNING_BACKEND}`);
    if (!DEV_MODE) console.log(`🔑 Alby: ${ALBY_API_KEY ? 'configured' : 'NOT CONFIGURED — set ALBY_API_KEY'}`);
    console.log(`\n💡 DEV_MODE=true: node src/server.js (free, no Lightning)\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
