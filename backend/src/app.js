import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import 'express-async-errors';

import { env } from './config/env.js';
import { cspDirectives } from './config/csp.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './lib/logger.js';

const app = express();

const clientUrls = env.CLIENT_URL ? env.CLIENT_URL.split(',').map(url => url.trim()) : [];
const localDevOrigins = ['http://localhost:5173', 'http://localhost:5174'];
const allowedOrigins = [...new Set([...clientUrls, ...(env.NODE_ENV !== 'production' ? localDevOrigins : [])])].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// In production this process also serves the built SPA (see the static handler
// below), so this Content-Security-Policy governs the real page. Every directive
// and the reasoning behind it lives in config/csp.js, which exists so the policy
// can be asserted in a test — a missing entry here is invisible in development,
// where Vite serves the SPA with no CSP at all.
app.use(helmet({
  contentSecurityPolicy: { directives: cspDirectives() },
  // The SPA loads cross-origin fonts and Calendly's iframe; COEP would reject
  // both. It is already off by default in helmet 7 — stated here so a future
  // helmet upgrade turning it on is an obvious diff rather than a mystery.
  crossOriginEmbedderPolicy: false,
  // helmet's default is `same-origin`, which severs `window.opener` for any
  // cross-origin popup. Razorpay Checkout is an iframe in the normal case, but
  // some bank and 3-D Secure flows finish in a popup that has to call back into
  // this page — under the default it simply cannot, and the payment appears to
  // hang at the final step. `same-origin-allow-popups` keeps the isolation that
  // matters (nothing can reach INTO this page) while letting a popup we opened
  // report back.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// Raw body for Meta webhook HMAC verification
app.use('/api/v1/webhook/meta', express.raw({ type: 'application/json' }));
app.use('/api/v1/integrations/webhooks', express.raw({ type: 'application/json' }));
// Raw body for the Razorpay webhook HMAC (BUG-002). The signature is computed
// over the EXACT bytes Razorpay sent; JSON.parse + JSON.stringify does not
// round-trip byte-for-byte (key order, whitespace, unicode escapes), so
// verifying a re-serialised body fails intermittently. Must be mounted before
// express.json so that parser never sees this route.
app.use('/api/v1/billing/razorpay/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

app.use((req, _res, next) => {
  logger.debug({ method: req.method, url: req.url }, 'Incoming request');
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/v1', routes);

// ── Built SPA (single-origin deployment) ─────────────────────────────────────
// In production this process serves the React build as well as the API. That is
// not a convenience: the voice web-call WebSocket is opened against
// window.location.host (client/src/services/modularCallSocket.ts:44) and ~22
// client files fetch relative "/api/v1" paths, so the page MUST be served from
// the same origin as the API. Serving the frontend from a separate host or a
// CDN breaks every web call unless that host also proxies WS upgrades.
//
// Resolved from this file rather than process.cwd() so it does not depend on
// which directory the start command happened to cd into.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
const hasClientBuild = existsSync(path.join(clientDist, 'index.html'));

if (hasClientBuild) {
  app.use(express.static(clientDist));

  // History fallback for client-side routes (/admin, /agents/:id, ...). Deep
  // links would otherwise hit the JSON 404 below. Anything under /api/v1 is
  // left alone so a genuinely missing endpoint still answers as JSON instead of
  // handing an API client a page of HTML.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  // Normal in local development, where Vite serves the client on :5173 and
  // proxies /api here. Logged because in production it means the build step
  // did not run and the site will answer every page request with JSON 404.
  logger.warn(`No client build at ${clientDist} — serving API only.`);
}

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);

export default app;
