// backend/src/services/pipedriveAuth.service.js
/**
 * Pipedrive OAuth token plumbing for everything downstream of connect.
 * Connect/callback (authorization URL, code exchange, creating the
 * Integration + IntegrationToken rows) is handled generically by
 * integrations.service.js's createOAuthConnectUrl/completeOAuthCallback,
 * driven by the `oauth` block in constants/integrations.js — same as every
 * other OAuth provider. This file only covers token refresh and
 * authenticated requests.
 *
 * Pipedrive has no fixed API host: the token response's per-company
 * `api_domain` is the host for every subsequent request, analogous to
 * Salesforce's instance_url. It lives in Integration.metadata, captured
 * there by completeOAuthCallback's pipedrive branch and read from there below.
 */

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';
import logger from '../lib/logger.js';

const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

const PROVIDER = 'pipedrive';

const TOKEN_URL = 'https://oauth.pipedrive.com/oauth/token';

// V2 endpoints have a fixed path prefix (/api/v2/...) across all accounts —
// unlike Salesforce, there is no per-org version to resolve.
export const API_PREFIX = '/api/v2';

const basicAuthHeader = () =>
  `Basic ${Buffer.from(`${env.PIPEDRIVE_CLIENT_ID ?? ''}:${env.PIPEDRIVE_CLIENT_SECRET ?? ''}`).toString('base64')}`;

const notConnected = () => Object.assign(
  new Error('Pipedrive is not connected for this workspace — connect it on the Integrations page.'),
  { statusCode: 400 },
);

/**
 * Return { accessToken, apiDomain } for the workspace's Pipedrive
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
  const stillValid = !forceRefresh
    && (!token.expiresAt || token.expiresAt.getTime() - 60_000 > Date.now());
  if (stillValid) {
    try {
      return { accessToken: decryptToken(token.accessTokenCipher), apiDomain: metadata.apiDomain };
    } catch { throw notConnected(); }
  }

  let refreshToken = null;
  try { refreshToken = token.refreshTokenCipher ? decryptToken(token.refreshTokenCipher) : null; } catch { /* treat as absent */ }
  if (!refreshToken) {
    throw Object.assign(
      new Error('Pipedrive access expired and no refresh token is stored — reconnect the integration.'),
      { statusCode: 401 },
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw Object.assign(
      new Error(`Could not refresh Pipedrive access (${detail}) — reconnect the integration.`),
      { statusCode: 401 },
    );
  }

  const nextApiDomain = data.api_domain ?? metadata.apiDomain;
  await prisma.integrationToken.update({
    where: { integrationId: integration.id },
    data: {
      accessTokenCipher: encryptToken(data.access_token),
      // A refresh always returns a new refresh_token — but guard anyway
      // rather than overwrite a working one with nothing.
      ...(data.refresh_token ? { refreshTokenCipher: encryptToken(data.refresh_token) } : {}),
      expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null,
    },
  });
  if (nextApiDomain !== metadata.apiDomain) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { metadata: JSON.stringify({ ...metadata, apiDomain: nextApiDomain }) },
    });
  }

  logger.info({ workspaceId, forceRefresh }, 'Pipedrive access token refreshed');
  return { accessToken: data.access_token, apiDomain: nextApiDomain };
}

/**
 * Authenticated Pipedrive API caller. Takes a PATH, not a full URL, since
 * the host (apiDomain) is only known once a token is resolved.
 */
export async function pipedriveRequest(workspaceId, path, options = {}) {
  const attempt = async (forceRefresh) => {
    const { accessToken, apiDomain } = await getValidAccessToken(workspaceId, { forceRefresh });
    if (!apiDomain) throw notConnected();
    const res = await fetch(`${apiDomain}${path}`, {
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

  logger.warn({ workspaceId, status: first.res.status }, 'Pipedrive API call rejected the access token — forcing a refresh and retrying once');
  return attempt(true);
}

/** Thin wrapper over pipedriveRequest() that throws on a non-2xx response. */
export async function pipedriveFetch(workspaceId, path, options = {}) {
  const { res, data } = await pipedriveRequest(workspaceId, path, options);
  if (!res.ok) {
    // Pipedrive error bodies are { success: false, error, error_info }.
    const detail = data?.error_info || data?.error;
    throw new Error(detail || `Pipedrive API ${res.status}`);
  }
  return data;
}
