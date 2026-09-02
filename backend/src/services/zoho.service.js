// backend/src/services/zoho.service.js
/**
 * Zoho CRM token access for a connected workspace integration.
 *
 * Mirrors googleCalendar.service.js's getValidAccessToken: decrypt-and-return
 * if the stored access token is still fresh, transparently refresh it against
 * Zoho's accounts server if not. Zoho access tokens live ~1h, same order of
 * magnitude as Google's, so the same skew-guarded refresh shape applies.
 *
 * Two Zoho-specific things this does that Google's version doesn't:
 *   - Reads/writes metadata.apiDomain: Zoho's CRM API lives on a different
 *     host per data center (accounts.zoho.com vs .eu vs .in etc.), returned
 *     by the accounts server on both the initial connect (see
 *     completeOAuthCallback in integrations.service.js) and on refresh.
 *   - Sends the Authorization header as `Zoho-oauthtoken <token>`, not the
 *     `Bearer <token>` every other provider in this codebase uses — that's
 *     Zoho CRM API's own requirement, not a typo.
 */

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';
import logger from '../lib/logger.js';
import { addLog } from './integrations.service.js';

const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

/** Access tokens live ~1h; refresh a little early to avoid edge-of-expiry races. */
const EXPIRY_SKEW_MS = 60_000;

const notConnected = () =>
  Object.assign(new Error('Zoho CRM is not connected for this workspace — connect it on the Integrations page.'), { statusCode: 400 });

/**
 * Return { accessToken, apiDomain } for the workspace's Zoho integration,
 * transparently refreshing an expired access token.
 */
export async function getValidAccessToken(workspaceId) {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: 'zoho' } },
    include: { token: true },
  });
  if (!integration?.token || integration.token.revokedAt) throw notConnected();

  const { token } = integration;
  const metadata = safeJson(integration.metadata, {});
  const stillValid = !token.expiresAt || token.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (stillValid) {
    try { return { accessToken: decryptToken(token.accessTokenCipher), apiDomain: metadata.apiDomain }; }
    catch { throw notConnected(); }
  }

  let refreshToken = null;
  try { refreshToken = token.refreshTokenCipher ? decryptToken(token.refreshTokenCipher) : null; } catch { /* treat as absent */ }
  if (!refreshToken) {
    throw Object.assign(
      new Error('Zoho CRM access expired and no refresh token is stored — reconnect the integration.'),
      { statusCode: 401 },
    );
  }

  const res = await fetch(`${env.ZOHO_ACCOUNTS_BASE_URL}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.ZOHO_CLIENT_ID ?? '',
      client_secret: env.ZOHO_CLIENT_SECRET ?? '',
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw Object.assign(
      new Error(`Could not refresh Zoho CRM access (${detail}) — reconnect the integration.`),
      { statusCode: 401 },
    );
  }

  const nextApiDomain = data.api_domain ?? metadata.apiDomain;
  await prisma.integrationToken.update({
    where: { integrationId: integration.id },
    data: {
      accessTokenCipher: encryptToken(data.access_token),
      // Zoho does not reliably reissue refresh_token on refresh; keep the existing one.
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

  logger.info({ workspaceId }, 'Zoho CRM access token refreshed');
  return { accessToken: data.access_token, apiDomain: nextApiDomain };
}

/** Same name-guessing list platform.controller.js's googlecalendar delivery uses. */
const NAME_KEYS = ['patient_name', 'customer_name', 'caller_name', 'name', 'full_name'];
const findVariable = (variables, keys) => {
  for (const k of keys) {
    const hit = variables.find((v) => String(v.key).toLowerCase() === k);
    if (hit?.value) return String(hit.value);
  }
  return null;
};

/**
 * Split a full name into Zoho's mandatory { First_Name, Last_Name } shape.
 * Zoho CRM refuses to create a Lead without Last_Name — a single-token name
 * (or none at all) goes entirely into Last_Name rather than being dropped.
 */
const splitName = (fullName) => {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return { firstName: undefined, lastName: 'Unknown Caller' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: undefined, lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
};

/**
 * Push a completed call as a new Zoho CRM Lead. Fires from deliverPostCall
 * (agentCallLog.controller.js) for any workspace with a connected Zoho
 * integration — no per-agent config, no webhook URL, unlike the Zapier/n8n/
 * Make/GHL dispatch path in integrations.service.js.
 */
export async function pushCallAsLead(workspaceId, agentId, postCallPayload) {
  const { accessToken, apiDomain } = await getValidAccessToken(workspaceId);
  if (!apiDomain) throw new Error('Zoho integration has no apiDomain on record — reconnect it.');

  const agent = await prisma.agent.findUnique({ where: { id: agentId } }).catch(() => null);
  const variables = Array.isArray(postCallPayload.variables) ? postCallPayload.variables : [];
  const { firstName, lastName } = splitName(findVariable(variables, NAME_KEYS));
  const variableLines = variables.length
    ? variables.map((v) => `${v.key}: ${v.value ?? '(not provided)'}`).join('\n')
    : '(no variables extracted)';

  const leadPayload = {
    data: [{
      Last_Name: lastName,
      ...(firstName ? { First_Name: firstName } : {}),
      ...(postCallPayload.phoneNumber ? { Phone: postCallPayload.phoneNumber } : {}),
      Lead_Source: agent?.name ? `Spandan — ${agent.name}` : 'Spandan',
      Description: `Call outcome: ${postCallPayload.outcome ?? 'n/a'}\nDuration: ${postCallPayload.durationSec ?? 0}s\n\n${variableLines}`,
    }],
    trigger: [], // explicit no-op: don't fire the org's own Zoho workflow rules on this insert
  };

  const res = await fetch(`${apiDomain}/crm/v8/Leads`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(leadPayload),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  // Zoho's bulk-record APIs return HTTP 201/200 even when an individual record
  // in the batch failed — the real result is data.data[0].code, not res.ok.
  const record = data.data?.[0];
  if (!res.ok || record?.code !== 'SUCCESS') {
    const detail = record?.message || data.message || `HTTP ${res.status}`;
    await addLog({ workspaceId, provider: 'zoho', level: 'error', event: 'lead_push_failed', message: `Zoho Lead creation failed: ${detail}`, metadata: { callId: postCallPayload.callId } });
    throw new Error(`Zoho Lead creation failed: ${detail}`);
  }

  await addLog({ workspaceId, provider: 'zoho', event: 'lead_pushed', message: `Zoho Lead created (${record.details?.id})`, metadata: { callId: postCallPayload.callId, leadId: record.details?.id } });
  logger.info({ workspaceId, callId: postCallPayload.callId, leadId: record.details?.id }, 'Zoho Lead created from call');
  return record.details?.id;
}
