// backend/src/services/googleAuth.service.js
/**
 * Shared Google OAuth token plumbing for every Google-backed integration
 * (google_calendar, google_meet, google_sheets).
 *
 * Consolidates what used to be three near-identical copies of
 * getValidAccessToken/googleFetch (one each in googleCalendar.service.js and
 * googleSheets.service.js, with google_meet having none at all) into one
 * place — mirroring zoho.service.js's getValidAccessToken/zohoRequest shape:
 *
 *   - resolveGoogleCredentials(settings): a workspace's own Google OAuth app
 *     (bring-your-own Google Cloud Console registration) beats the platform's
 *     shared one whenever it's set — see saveIntegrationSettings in
 *     integrations.service.js for how clientSecretCipher gets there. This is
 *     what the per-provider getValidAccessToken functions were missing: they
 *     refreshed using env.GOOGLE_CLIENT_ID/SECRET unconditionally, which is
 *     the exact "invalid_client on refresh" bug class Zoho's equivalent
 *     refactor fixed.
 *   - getValidAccessToken(workspaceId, provider, { forceRefresh }): decrypt
 *     the stored access token if still fresh, or refresh it against Google's
 *     token endpoint. `provider` is the real Integration.provider value
 *     ('google_calendar' | 'google_meet' | 'google_sheets') since each is a
 *     distinct Integration/IntegrationToken row — a workspace can connect
 *     Calendar without Meet, or vice versa.
 *   - googleRequest(workspaceId, provider, url, options): resolves a token,
 *     makes the request, and on a 401 forces a fresh refresh and retries
 *     ONCE, transparently — the zohoRequest equivalent. Returns { res, data }
 *     rather than throwing, so each caller decides what "failure" means for
 *     its own endpoint (Calendar's 410-on-delete isn't a failure, for
 *     example).
 *   - googleFetch(workspaceId, provider, url, options): thin wrapper that
 *     throws on a non-OK response — matches the exact contract the two
 *     existing services' private googleFetch(url, token, init) helpers
 *     already assumed at every call site, so refactoring them onto this
 *     shared module is a minimal diff rather than a rewrite.
 */

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';
import logger from '../lib/logger.js';

const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

/** Access tokens live ~1h; refresh a little early to avoid edge-of-expiry races. */
const EXPIRY_SKEW_MS = 60_000;

const PROVIDER_LABELS = {
  google_calendar: 'Google Calendar',
  google_meet: 'Google Meet',
  google_sheets: 'Google Sheets',
};

const notConnected = (provider) => {
  const label = PROVIDER_LABELS[provider] ?? provider;
  return Object.assign(
    new Error(`${label} is not connected for this workspace — connect it on the Integrations page.`),
    { statusCode: 400 },
  );
};

/**
 * This workspace's own Google OAuth app, if it registered one, else the
 * platform-wide env app. All three Google integrations share one
 * GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env pair (they're the same Google
 * Cloud OAuth client, just requesting different scopes), so this resolves
 * per-workspace settings only — no per-provider branching needed here.
 *
 * Resolved fresh on every refresh, not just at connect time: refreshing a
 * token must present the SAME client_id/secret used to obtain it, or Google
 * answers with invalid_client — the failure mode this function exists to
 * prevent from recurring.
 */
export function resolveGoogleCredentials(settings) {
  const clientId = (settings.clientId && String(settings.clientId).trim()) || env.GOOGLE_CLIENT_ID || '';
  let clientSecret = env.GOOGLE_CLIENT_SECRET || '';
  if (settings.clientSecretCipher) {
    try { clientSecret = decryptToken(settings.clientSecretCipher); } catch { /* fall back to the env app */ }
  }
  return { clientId, clientSecret };
}

/**
 * Return { accessToken } for the workspace's connection to the given Google
 * provider, transparently refreshing an expired access token.
 *
 * @param {string} workspaceId
 * @param {'google_calendar'|'google_meet'|'google_sheets'} provider
 * @param {{ forceRefresh?: boolean }} [opts] forceRefresh skips the
 *   expiry-based skip check and always goes through the refresh branch —
 *   used by googleRequest() when Google itself rejects a token that still
 *   looks unexpired on our side (revoked externally, clock drift, the OAuth
 *   consent was reset). Requires a stored refresh token either way.
 */
export async function getValidAccessToken(workspaceId, provider, { forceRefresh = false } = {}) {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
    include: { token: true },
  });
  if (!integration?.token || integration.token.revokedAt) throw notConnected(provider);

  const { token } = integration;
  const settings = safeJson(integration.settingsJson, {});
  const stillValid = !forceRefresh
    && (!token.expiresAt || token.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now());
  if (stillValid) {
    try { return { accessToken: decryptToken(token.accessTokenCipher) }; }
    catch { throw notConnected(provider); }
  }

  let refreshToken = null;
  try { refreshToken = token.refreshTokenCipher ? decryptToken(token.refreshTokenCipher) : null; } catch { /* treat as absent */ }
  if (!refreshToken) {
    const label = PROVIDER_LABELS[provider] ?? provider;
    throw Object.assign(
      new Error(`${label} access expired and no refresh token is stored — reconnect the integration.`),
      { statusCode: 401 },
    );
  }

  const { clientId, clientSecret } = resolveGoogleCredentials(settings);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    const label = PROVIDER_LABELS[provider] ?? provider;
    throw Object.assign(
      new Error(`Could not refresh ${label} access (${detail}) — reconnect the integration.`),
      { statusCode: 401 },
    );
  }

  await prisma.integrationToken.update({
    where: { integrationId: integration.id },
    data: {
      accessTokenCipher: encryptToken(data.access_token),
      // Google omits refresh_token on refresh responses; keep the existing one.
      ...(data.refresh_token ? { refreshTokenCipher: encryptToken(data.refresh_token) } : {}),
      expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null,
    },
  });
  logger.info({ workspaceId, provider, forceRefresh }, `${PROVIDER_LABELS[provider] ?? provider} access token refreshed`);
  return { accessToken: data.access_token };
}

/**
 * Central authenticated Google API caller — the zohoRequest equivalent.
 *
 * getValidAccessToken() already refreshes proactively when a token is near
 * its RECORDED expiry, but that's a guess based on our own clock and memory
 * of what Google said last time — Google can still reject a token that looks
 * unexpired on our side (consent revoked, clock drift, the OAuth app got
 * reconfigured). On exactly a 401 — and only once per call, so a genuinely
 * dead integration fails once instead of looping — this forces a fresh
 * refresh (bypassing the expiry check) and retries the SAME request with the
 * new token. The caller never sees the transient failure.
 *
 * Returns { res, data } rather than throwing, because what counts as
 * "failure" differs per endpoint (Calendar's DELETE treats 410 as an
 * already-satisfied delete, not an error) — callers decide that for
 * themselves. Non-JSON/empty bodies (e.g. a 204 No Content) parse to `{}`.
 */
export async function googleRequest(workspaceId, provider, url, options = {}) {
  const attempt = async (forceRefresh) => {
    const { accessToken } = await getValidAccessToken(workspaceId, provider, { forceRefresh });
    const res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });
    if (res.status === 204) return { res, data: null }; // No Content — never a JSON body
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const first = await attempt(false);
  if (first.res.status !== 401) return first;

  logger.warn(
    { workspaceId, provider, status: first.res.status },
    `${PROVIDER_LABELS[provider] ?? provider} API call rejected the access token — forcing a refresh and retrying once`,
  );
  return attempt(true);
}

/**
 * Thin convenience wrapper over googleRequest() for callers that just want
 * the parsed body and a thrown Error on failure — matches the exact contract
 * the two existing services' private googleFetch(url, token, init) helpers
 * already used at every call site.
 */
export async function googleFetch(workspaceId, provider, url, options = {}) {
  const { res, data } = await googleRequest(workspaceId, provider, url, options);
  if (!res.ok) {
    throw new Error(data?.error?.message || `${PROVIDER_LABELS[provider] ?? provider} API ${res.status}`);
  }
  return data;
}
