// backend/src/services/salesforceAuth.service.js
/**
 * Salesforce OAuth token plumbing for everything downstream of connect.
 * Connect/callback (authorization URL, code exchange, creating the
 * Integration + IntegrationToken rows) is handled generically by
 * integrations.service.js's createOAuthConnectUrl/completeOAuthCallback,
 * driven by the `oauth` block in constants/integrations.js — same as every
 * other OAuth provider. This file only covers token refresh and
 * authenticated requests.
 *
 * Salesforce has no fixed API host: the token response's org-specific
 * `instance_url` is the host for every subsequent request, captured into
 * Integration.metadata by completeOAuthCallback's salesforce branch and read
 * from there below.
 */

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';
import logger from '../lib/logger.js';

const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

const PROVIDER = 'salesforce';

// Sandbox orgs use test.salesforce.com instead — not supported here.
const TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token';

const notConnected = () => Object.assign(
  new Error('Salesforce is not connected for this workspace — connect it on the Integrations page.'),
  { statusCode: 400 },
);

/**
 * Return { accessToken, instanceUrl } for the workspace's Salesforce
 * connection, transparently refreshing an expired/rejected access token.
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
  const metadata = safeJson(integration.metadata, {});
  // Salesforce's OAuth response has no expires_in, so expiresAt is always
  // null here and this is never a fallback — it's the normal path.
  const stillValid = !forceRefresh
    && (!token.expiresAt || token.expiresAt.getTime() - 60_000 > Date.now());
  if (stillValid) {
    try {
      return { accessToken: decryptToken(token.accessTokenCipher), instanceUrl: metadata.instanceUrl };
    } catch { throw notConnected(); }
  }

  let refreshToken = null;
  try { refreshToken = token.refreshTokenCipher ? decryptToken(token.refreshTokenCipher) : null; } catch { /* treat as absent */ }
  if (!refreshToken) {
    throw Object.assign(
      new Error('Salesforce access expired and no refresh token is stored — reconnect the integration.'),
      { statusCode: 401 },
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.SALESFORCE_CLIENT_ID ?? '',
      client_secret: env.SALESFORCE_CLIENT_SECRET ?? '',
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw Object.assign(
      new Error(`Could not refresh Salesforce access (${detail}) — reconnect the integration.`),
      { statusCode: 401 },
    );
  }

  const nextInstanceUrl = data.instance_url ?? metadata.instanceUrl;
  await prisma.integrationToken.update({
    where: { integrationId: integration.id },
    data: {
      accessTokenCipher: encryptToken(data.access_token),
      // A new refresh_token is only sent if rotation is enabled on the
      // Connected App — don't overwrite a working one with nothing.
      ...(data.refresh_token ? { refreshTokenCipher: encryptToken(data.refresh_token) } : {}),
    },
  });
  if (nextInstanceUrl !== metadata.instanceUrl) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { metadata: JSON.stringify({ ...metadata, instanceUrl: nextInstanceUrl }) },
    });
  }

  logger.info({ workspaceId, forceRefresh }, 'Salesforce access token refreshed');
  return { accessToken: data.access_token, instanceUrl: nextInstanceUrl };
}

/**
 * Authenticated Salesforce API caller. Takes a PATH, not a full URL, since
 * the host (instanceUrl) is only known once a token is resolved.
 */
export async function salesforceRequest(workspaceId, path, options = {}) {
  const attempt = async (forceRefresh) => {
    const { accessToken, instanceUrl } = await getValidAccessToken(workspaceId, { forceRefresh });
    if (!instanceUrl) throw notConnected();
    const res = await fetch(`${instanceUrl}${path}`, {
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

  logger.warn({ workspaceId, status: first.res.status }, 'Salesforce API call rejected the access token — forcing a refresh and retrying once');
  return attempt(true);
}

/** Thin wrapper over salesforceRequest() that throws on a non-2xx response. */
export async function salesforceFetch(workspaceId, path, options = {}) {
  const { res, data } = await salesforceRequest(workspaceId, path, options);
  if (!res.ok) {
    // Salesforce error bodies are an array of { message, errorCode }.
    const detail = Array.isArray(data) ? data[0]?.message : data?.message;
    throw new Error(detail || `Salesforce API ${res.status}`);
  }
  return data;
}
