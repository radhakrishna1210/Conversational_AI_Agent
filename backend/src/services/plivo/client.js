// Plivo REST client: auth, retries, and webhook signature validation.
//
// Hand-rolled rather than pulling in the `plivo` SDK, matching how Twilio is
// called in this codebase (raw fetch, no vendor SDK). The signature validator
// below is the one place that is a faithful reimplementation rather than a
// convenience wrapper — see the comment on `signingString`.
//
// Credentials: HTTP Basic, base64(auth_id:auth_token), against api.plivo.com.
// Subaccount credentials cannot create subaccounts, assign numbers, or file
// compliance applications — those need the MAIN account. Callers pass the
// credentials they mean explicitly; there is no implicit fallback, because
// silently doing main-account work with subaccount creds fails in confusing
// ways and the reverse spends money on the wrong ledger.

import { createHmac, timingSafeEqual } from 'crypto';
import logger from '../../lib/logger.js';

const API_HOST = 'https://api.plivo.com';

/** Documented rate limits, for the comment record: 300 requests / 5s general,
 *  60/min on the Compliance endpoints, 100/min on Compliance/Requirements.
 *  We do not client-side throttle — provisioning is low-volume and interactive.
 *  429s are retried with backoff below, which is the behaviour that matters. */
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

export class PlivoError extends Error {
  constructor(message, { status, body, retryable = false } = {}) {
    super(message);
    this.name = 'PlivoError';
    this.status = status;
    this.body = body;
    this.retryable = retryable;
  }
}

/**
 * Main-account credentials, or null when Plivo is not configured.
 *
 * Read straight from process.env rather than config/env.js — same convention as
 * ELEVENLABS_API_KEY / DEEPGRAM_API_KEY. It keeps this module importable (and
 * unit-testable) without a database URL, since config/env.js throws on load
 * when DATABASE_URL is absent. The keys are still declared in config/env.js for
 * documentation.
 */
export function mainCredentials() {
  const authId = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  if (!authId || !authToken) return null;
  return { authId, authToken };
}

/** True when the main Plivo account is configured. */
export const isPlivoConfigured = () => Boolean(mainCredentials());

const basicAuth = ({ authId, authToken }) =>
  `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the Plivo REST API.
 *
 * @param {string} path        e.g. `/Subaccount/` — appended to /v1/Account/{authId}
 * @param {object} opts
 * @param {'GET'|'POST'|'DELETE'} [opts.method]
 * @param {object} [opts.json]        JSON body
 * @param {FormData} [opts.form]      multipart body (compliance document upload)
 * @param {object} opts.credentials   { authId, authToken } — required, never implicit
 * @param {boolean} [opts.idempotent] retry 5xx/network errors. Default false:
 *   a retried POST /Subaccount/ creates a SECOND subaccount whose auth_token we
 *   then never see, so unsafe retries here leak real, billable resources.
 * @param {object} [opts.query]
 * @returns {Promise<object>} parsed JSON body
 */
export async function plivoRequest(path, {
  method = 'GET',
  json,
  form,
  credentials,
  idempotent = method === 'GET',
  query,
} = {}) {
  if (!credentials?.authId || !credentials?.authToken) {
    throw new PlivoError('Plivo credentials missing (set PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN).', {
      status: 503,
    });
  }

  const qs = query && Object.keys(query).length
    ? `?${new URLSearchParams(query).toString()}`
    : '';
  const url = `${API_HOST}/v1/Account/${credentials.authId}${path}${qs}`;

  const headers = { Authorization: basicAuth(credentials) };
  let body;
  if (form) {
    body = form; // fetch sets the multipart boundary itself — do NOT set Content-Type
  } else if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { method, headers, body });
    } catch (err) {
      lastError = new PlivoError(`Plivo request failed: ${err.message}`, { retryable: true });
      if (!idempotent || attempt === MAX_ATTEMPTS) throw lastError;
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      continue;
    }

    const text = await response.text();
    let parsed = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }

    if (response.ok) return parsed;

    // 429 is always safe to retry: the request was rejected, not performed.
    const isRateLimit = response.status === 429;
    const isServerError = response.status >= 500;
    const retryable = isRateLimit || (isServerError && idempotent);

    lastError = new PlivoError(
      `Plivo ${method} ${path} failed (${response.status}): ${parsed.error || parsed.message || text.slice(0, 200)}`,
      { status: response.status, body: parsed, retryable },
    );

    if (!retryable || attempt === MAX_ATTEMPTS) throw lastError;

    const retryAfter = Number(response.headers.get('Retry-After'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : BASE_BACKOFF_MS * 2 ** (attempt - 1);
    logger.warn(`Plivo ${response.status} on ${method} ${path}; retrying in ${waitMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);
    await sleep(waitMs);
  }

  throw lastError;
}

// ── Webhook signature validation (V3) ───────────────────────────────────────
//
// Reimplemented from plivo-node's `v3Security.js` rather than described from
// the prose docs, because the prose is ambiguous about separator placement and
// the SDK has two quirks that a reasonable reading of the docs would miss:
//
//   1. A POST that carries form params but NO query string still gets a bare
//      trailing "?" before the params are appended.
//   2. A POST with BOTH a query string and form params gets a "." between them.
//
// Get either wrong and every callback is rejected as forged — or worse, a
// permissive implementation accepts forged ones. The unit tests pin all four
// query/params combinations.

const sortedQueryString = (params) => {
  const parts = [];
  Object.keys(params).sort().forEach((key) => {
    [...params[key]].sort().forEach((value) => parts.push(`${key}=${value}`));
  });
  return parts.join('&');
};

const sortedParamsString = (params) => {
  const parts = [];
  Object.keys(params).sort().forEach((key) => {
    const val = params[key];
    if (Array.isArray(val)) [...val].sort().forEach((v) => parts.push(`${key}${v}`));
    else parts.push(`${key}${val}`);
  });
  return parts.join('');
};

/** Merge a URL's own query params with extra params, as arrays. */
const mergeParams = (queryParams, extra) => {
  const out = {};
  for (const [k, v] of Object.entries(queryParams)) out[k] = Array.isArray(v) ? v : [v];
  for (const [k, v] of Object.entries(extra)) {
    const arr = Array.isArray(v) ? v : [v];
    out[k] = out[k] ? out[k].concat(arr) : arr;
  }
  return out;
};

/**
 * Build the exact string Plivo signs. Exported for the tests, which is the only
 * way to prove the quirks above are preserved.
 */
export function signingString(method, uri, params = {}) {
  const parsed = new URL(uri);
  const base = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;

  const urlQuery = {};
  for (const [k, v] of parsed.searchParams.entries()) {
    urlQuery[k] = urlQuery[k] ? urlQuery[k].concat([v]) : [v];
  }

  if (method === 'GET') {
    const q = sortedQueryString(mergeParams(urlQuery, params));
    return q.length ? `${base}?${q}` : base;
  }

  if (method === 'POST') {
    const hasPostParams = Object.keys(params).length > 0;
    const q = sortedQueryString(mergeParams(urlQuery, {}));
    let out = base;
    // Quirk 1: the "?" is emitted when there are query params OR post params.
    if (q.length > 0 || hasPostParams) out += `?${q}`;
    // Quirk 2: "." separates a query string from the appended post params.
    if (q.length > 0 && hasPostParams) out += '.';
    return out + sortedParamsString(params);
  }

  throw new PlivoError(`Unsupported method for signature validation: ${method}`);
}

const computeV3 = (authToken, base, nonce) =>
  createHmac('sha256', authToken).update(`${base}.${nonce}`).digest('base64');

const safeEqual = (a, b) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

/**
 * Validate an inbound Plivo webhook.
 *
 * @param {object} p
 * @param {string} p.method     'POST' | 'GET'
 * @param {string} p.url        the FULL public URL Plivo called, exactly as configured
 * @param {string} p.nonce      X-Plivo-Signature-V3-Nonce
 * @param {string} p.signature  X-Plivo-Signature-V3 (may be comma-separated)
 * @param {string} p.authToken  the auth token of the account that sent it
 * @param {object} [p.params]   form/query params
 * @returns {boolean}
 */
export function validateV3Signature({ method, url, nonce, signature, authToken, params = {} }) {
  if (!signature || !nonce || !authToken) return false;
  const expected = computeV3(authToken, signingString(method, url, params), nonce);
  // Accounts with multiple auth tokens receive comma-separated signatures; a
  // match on ANY of them is valid.
  return String(signature).split(',').some((s) => safeEqual(s.trim(), expected));
}
