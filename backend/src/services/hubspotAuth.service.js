// backend/src/services/hubspotAuth.service.js
/**
 * HubSpot OAuth token plumbing — mirrors googleAuth.service.js's actual role,
 * not its literal contents.
 *
 * What this file deliberately does NOT contain: an authorization-URL builder
 * or the authorization-code token exchange. Those already happen generically
 * for every OAuth provider (Google's three included) in
 * integrations.service.js's createOAuthConnectUrl/completeOAuthCallback,
 * driven entirely by the `hubspot.oauth` block in constants/integrations.js.
 * Duplicating that here would just be a second, divergent implementation of
 * the same thing — googleAuth.service.js doesn't do it either, for the same
 * reason.
 *
 * What this file IS for — everything downstream of that initial connect:
 *   - resolveHubspotCredentials(settings): a workspace's own HubSpot app
 *     (bring-your-own developer app) beats the platform's shared one, same
 *     pattern as resolveGoogleCredentials. Resolved fresh on every refresh —
 *     refreshing must present the SAME client_id/secret used to obtain the
 *     token, or HubSpot answers with an invalid_client-equivalent error.
 *   - getValidAccessToken(workspaceId, { forceRefresh }): decrypt the stored
 *     access token if still fresh, or refresh it against HubSpot's token
 *     endpoint. Only one HubSpot integration per workspace exists (unlike
 *     Google's three variants), so provider is hardcoded to 'hubspot'
 *     rather than taking a parameter.
 *   - hubspotRequest/hubspotFetch: the googleRequest/googleFetch equivalent
 *     — resolve a token, make the request, and on a 401 force a fresh
 *     refresh and retry ONCE, transparently.
 */

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';
import logger from '../lib/logger.js';

const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

const PROVIDER = 'hubspot';

/** Access tokens live ~30min on HubSpot; refresh a little early to avoid edge-of-expiry races. */
const EXPIRY_SKEW_MS = 60_000;

const notConnected = () => Object.assign(
  new Error('HubSpot is not connected for this workspace — connect it on the Integrations page.'),
  { statusCode: 400 },
);

/**
 * This workspace's own HubSpot developer app, if it registered one, else the
 * platform-wide env app. Same shape as resolveGoogleCredentials.
 */
export function resolveHubspotCredentials(settings) {
  const clientId = (settings.clientId && String(settings.clientId).trim()) || env.HUBSPOT_CLIENT_ID || '';
  let clientSecret = env.HUBSPOT_CLIENT_SECRET || '';
  if (settings.clientSecretCipher) {
    try { clientSecret = decryptToken(settings.clientSecretCipher); } catch { /* fall back to the env app */ }
  }
  return { clientId, clientSecret };
}

/**
 * Return { accessToken } for the workspace's HubSpot connection, transparently
 * refreshing an expired access token.
 *
 * @param {string} workspaceId
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function getValidAccessToken(workspaceId, { forceRefresh = false } = {}) {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: PROVIDER } },
    include: { token: true },
  });
  if (!integration?.token || integration.token.revokedAt) throw notConnected();

  const { token } = integration;
  const settings = safeJson(integration.settingsJson, {});
  const stillValid = !forceRefresh
    && (!token.expiresAt || token.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now());
  if (stillValid) {
    try { return { accessToken: decryptToken(token.accessTokenCipher) }; }
    catch { throw notConnected(); }
  }

  let refreshToken = null;
  try { refreshToken = token.refreshTokenCipher ? decryptToken(token.refreshTokenCipher) : null; } catch { /* treat as absent */ }
  if (!refreshToken) {
    // A manually-pasted Private App token (the fallback connect path) has no
    // refresh token at all — it doesn't expire the way OAuth tokens do, so
    // getting here for one means it was revoked/rotated in HubSpot itself.
    throw Object.assign(
      new Error('HubSpot access expired and no refresh token is stored — reconnect the integration.'),
      { statusCode: 401 },
    );
  }

  const { clientId, clientSecret } = resolveHubspotCredentials(settings);

  const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
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
    const detail = data.message || data.error || `HTTP ${res.status}`;
    throw Object.assign(
      new Error(`Could not refresh HubSpot access (${detail}) — reconnect the integration.`),
      { statusCode: 401 },
    );
  }

  await prisma.integrationToken.update({
    where: { integrationId: integration.id },
    data: {
      accessTokenCipher: encryptToken(data.access_token),
      // NEEDS VERIFICATION: HubSpot's docs describe refresh responses as
      // always including a new refresh_token (unlike Google, which omits it).
      // Guarded with `if` anyway rather than assuming — a missing field here
      // should never wipe out a working refresh token.
      ...(data.refresh_token ? { refreshTokenCipher: encryptToken(data.refresh_token) } : {}),
      expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null,
    },
  });
  logger.info({ workspaceId, forceRefresh }, 'HubSpot access token refreshed');
  return { accessToken: data.access_token };
}

/**
 * Central authenticated HubSpot API caller — the googleRequest equivalent.
 * Returns { res, data } rather than throwing; callers decide what counts as
 * failure for their own endpoint.
 */
export async function hubspotRequest(workspaceId, url, options = {}) {
  const attempt = async (forceRefresh) => {
    const { accessToken } = await getValidAccessToken(workspaceId, { forceRefresh });
    const res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });
    if (res.status === 204) return { res, data: null };
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const first = await attempt(false);
  if (first.res.status !== 401) return first;

  logger.warn({ workspaceId, status: first.res.status }, 'HubSpot API call rejected the access token — forcing a refresh and retrying once');
  return attempt(true);
}

/**
 * Thin convenience wrapper over hubspotRequest() — matches the
 * googleFetch(workspaceId, provider, url, options) contract minus the
 * provider argument (HubSpot has only one integration per workspace).
 */
export async function hubspotFetch(workspaceId, url, options = {}) {
  const { res, data } = await hubspotRequest(workspaceId, url, options);
  if (!res.ok) {
    // HubSpot error bodies use `message`, not Google's `error.message`.
    throw new Error(data?.message || `HubSpot API ${res.status}`);
  }
  return data;
}
