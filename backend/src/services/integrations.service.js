import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';
import { generateSecureToken } from '../lib/hash.js';
import logger from '../lib/logger.js';
import { broadcastIntegrationEvent } from '../lib/integrationEvents.js';
import { INTEGRATION_ORDER, INTEGRATION_PROVIDERS } from '../constants/integrations.js';
import { buildConnectionIdentity, isPlaceholderValue, isValidWebhookUrl, normalizeIntegrationName, normalizeWebhookUrl, validateIntegrationCredentials, validateWebhookProviderUrl } from './integrationConnectionUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = () => new Date();
const oauthExpiryMs = 10 * 60 * 1000; // 10 min

const safeJson = (value, fallback = {}) => {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
};
const jsonStr = (v) => JSON.stringify(v ?? {});

const getProvider = (key) => {
  const p = INTEGRATION_PROVIDERS[key];
  if (!p) { const e = new Error(`Unsupported provider: ${key}`); e.statusCode = 404; throw e; }
  return p;
};

const clientId     = (p) => p.oauth ? (env[p.oauth.clientIdEnv]     ?? null) : null;
const clientSecret = (p) => p.oauth ? (env[p.oauth.clientSecretEnv] ?? null) : null;
const redirectUri  = (p) => p.oauth ? (env[p.oauth.redirectUriEnv]  ?? null) : null;
const genesysRegion = () => env.GENESYS_REGION || 'mypurecloud.com';

const isMockProvider = (p) => false;
const shouldAllowConnectionFallback = () => process.env.ALLOW_FAKE_INTEGRATION_CREDENTIALS === 'true' || process.env.USE_MOCK_AUTH === 'true' || process.env.DB_STATUS === 'unavailable';

const providerApiBase = (p) => p.apiBaseUrl ?? (p.apiBaseUrlEnv ? (env[p.apiBaseUrlEnv] ?? '') : '');

const calApiHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'cal-api-version': '2024-08-13',
});

// ─── DB helpers ───────────────────────────────────────────────────────────────

const withIncludes = { include: { token: true, settings: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } } };

const ensureWorkspaceExists = async (workspaceId) => {
  if (!workspaceId) return null;
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: { id: workspaceId, name: 'Mock Workspace', slug: `mock-${workspaceId}` },
  }).catch(() => {});
  return prisma.workspace.findUnique({ where: { id: workspaceId } }).catch(() => null);
};

const upsertRow = async (workspaceId, providerKey) => {
  await ensureWorkspaceExists(workspaceId);
  const p = getProvider(providerKey);
  return prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider: p.key } },
    create: { workspaceId, provider: p.key, name: p.name, status: 'disconnected', connected: false, webhookStatus: 'not_configured', metadata: jsonStr({ provider: p.key }), settingsJson: jsonStr({}) },
    update: { name: p.name },
    ...withIncludes,
  });
};

const serialize = (i) => ({
  id: i.id,
  workspaceId: i.workspaceId,
  provider: i.provider,
  name: i.name,
  status: i.status,
  connected: i.connected,
  accountId: i.accountId,
  accountLabel: i.accountLabel,
  lastSyncAt: i.lastSyncAt,
  lastError: i.lastError,
  tokenExpiresAt: i.tokenExpiresAt,
  webhookStatus: i.webhookStatus,
  webhookEnabled: i.webhookEnabled,
  lastSyncedCount: i.lastSyncedCount,
  settingsJson: safeJson(i.settingsJson, {}),
  metadata: safeJson(i.metadata, {}),
  settings: i.settings ? {
    enabled: i.settings.enabled,
    webhookEnabled: i.settings.webhookEnabled,
    settingsJson: safeJson(i.settings.settingsJson, {}),
    selectedChannels: safeJson(i.settings.selectedChannels, []),
    lastValidatedAt: i.settings.lastValidatedAt,
  } : null,
  logs: (i.logs ?? []).map((l) => ({ id: l.id, level: l.level, event: l.event, message: l.message, status: l.status, metadata: safeJson(l.metadata, {}), createdAt: l.createdAt })),
});

const addLog = async ({ workspaceId, provider, integrationId = null, level = 'info', event, message, status = null, metadata = {} }) => {
  try {
    const log = await prisma.integrationLog.create({
      data: { workspaceId, provider, integrationId, level, event, message, status, metadata: jsonStr(metadata) },
    });
    broadcastIntegrationEvent(workspaceId, 'integration:log', { provider, logId: log.id, event, message, level, status });
    return log;
  } catch (err) {
    logger.warn({ err }, 'addLog failed — non-fatal');
  }
};

// ─── Token helpers ────────────────────────────────────────────────────────────

const getAccessToken = async (integration) => {
  if (!integration?.token || integration.token.revokedAt) return null;
  try { return decryptToken(integration.token.accessTokenCipher); } catch { return null; }
};

const buildAuthUrl = (p, state, redirectUriOverride) => {
  const base = p.oauth.authorizationUrl.replace('{region}', genesysRegion());
  const url = new URL(base);
  url.searchParams.set('client_id',    clientId(p) ?? '');
  url.searchParams.set('redirect_uri', redirectUriOverride ?? redirectUri(p) ?? '');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  if (p.oauth.scope?.length) url.searchParams.set('scope', p.oauth.scope.join(' '));
  for (const [k, v] of Object.entries(p.oauth.extraParams ?? {})) url.searchParams.set(k, v);
  return url.toString();
};

const exchangeCode = async (p, code, cbUri) => {
  const params = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: cbUri,
    client_id:    clientId(p) ?? '',
    client_secret: clientSecret(p) ?? '',
  });
  const res = await fetch(p.oauth.tokenUrl.replace('{region}', genesysRegion()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`);
  return data;
};

const fetchProviderSnapshot = async (integration) => {
  const provider = getProvider(integration.provider);
  const accessToken = await getAccessToken(integration);
  if (!accessToken) {
    return { accountLabel: integration.accountLabel ?? provider.name, lastSyncedCount: integration.lastSyncedCount ?? 0 };
  }

  if (accessToken.startsWith('mock_access_token_')) {
    return { accountLabel: `${provider.name} (Dev Mode)`, lastSyncedCount: Math.floor(Math.random() * 100) + 1, snapshot: { mock: true } };
  }

  if (provider.key === 'twilio') {
    const sid = env.TWILIO_ACCOUNT_SID;
    const auth = env.TWILIO_AUTH_TOKEN;
    if (sid && auth) {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        return { accountLabel: payload.friendly_name ?? sid, lastSyncedCount: 1, snapshot: payload };
      }
    }
    // If no SID/Auth or it fails, fallback to normal below if it somehow uses a real token
  }

  if (!provider.oauth) {
    return { accountLabel: integration.accountLabel ?? provider.name, lastSyncedCount: integration.lastSyncedCount ?? 0 };
  }

  const baseUrl = provider.apiBaseUrlEnv ? (env[provider.apiBaseUrlEnv] ?? '') : '';
  const endpoint = provider.syncEndpoint ?? '';
  if (!baseUrl || !endpoint) {
    return { accountLabel: integration.accountLabel ?? provider.name, lastSyncedCount: integration.lastSyncedCount ?? 0 };
  }

  const res = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || payload.error || `Sync failed (${res.status})`);
  }

  let accountLabel = integration.accountLabel ?? provider.name;
  let syncCount = integration.lastSyncedCount ?? 0;

  if (provider.key === 'slack') {
    accountLabel = payload.team ?? payload.team_name ?? accountLabel;
  } else if (provider.key === 'google_calendar') {
    syncCount = Array.isArray(payload.items) ? payload.items.length : syncCount;
  } else if (provider.key === 'google_sheets') {
    syncCount = Array.isArray(payload.files) ? payload.files.length : syncCount;
  } else if (provider.key === 'google_meet') {
    syncCount = Array.isArray(payload.items) ? payload.items.length : syncCount;
  } else if (provider.key === 'hubspot') {
    syncCount = Array.isArray(payload.results) ? payload.results.length : syncCount;
    if (payload.results?.[0]?.properties?.email) {
      accountLabel = payload.results[0].properties.email;
    }
  } else if (provider.key === 'calendly') {
    accountLabel = payload.resource?.name ?? payload.resource?.email ?? accountLabel;
  } else if (provider.key === 'salesforce') {
    syncCount = payload.totalSize ?? 0;
    accountLabel = payload.totalSize > 0 && payload.records?.[0]?.Name ? 
      payload.records[0].Name : accountLabel;
  } else if (provider.key === 'genesys') {
    accountLabel = payload.name ?? payload.email ?? accountLabel;
  } else if (provider.key === 'cal') {
    if (Array.isArray(payload.bookings) && payload.bookings.length > 0) {
      syncCount = payload.bookings.length;
      accountLabel = payload.bookings[0].user?.email ?? 
                    payload.bookings[0].user?.name ?? 
                    accountLabel;
    } else if (payload.user?.name) {
      accountLabel = payload.user.name;
    }
  }

  return { accountLabel, lastSyncedCount: syncCount, snapshot: payload };
};

export const listIntegrations = async (workspaceId) => {
  const records = await prisma.integration.findMany({
    where: { workspaceId },
    include: { token: true, settings: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
    orderBy: { updatedAt: 'desc' },
  });

  const byProvider = new Map(records.map((record) => [record.provider, record]));
  const ordered = INTEGRATION_ORDER.map((key) => byProvider.get(key) ?? null).filter(Boolean);

  for (const key of INTEGRATION_ORDER) {
    if (!byProvider.has(key)) {
      ordered.push(await upsertIntegrationRow(workspaceId, key));
    }
  }

  return ordered.map(serializeIntegration);
};

export const getIntegration = async (workspaceId, providerKey) => {
  const integration = await upsertIntegrationRow(workspaceId, providerKey);
  return serializeIntegration(integration);
};

export const getIntegrationLogs = async (workspaceId, providerKey = null) => {
  const where = providerKey ? { workspaceId, provider: providerKey } : { workspaceId };
  const logs = await prisma.integrationLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  return logs.map((log) => ({
    id: log.id,
    provider: log.provider,
    level: log.level,
    event: log.event,
    message: log.message,
    status: log.status,
    metadata: safeJson(log.metadata, {}),
    createdAt: log.createdAt,
  }));
};

export const createOAuthConnectUrl = async (workspaceId, providerKey, userId, redirectUriOverride = null) => {
  const provider = getProvider(providerKey);
  if (!provider.oauth) {
    const error = new Error('This integration does not use OAuth');
    error.statusCode = 400;
    throw error;
  }

  const integration = await upsertIntegrationRow(workspaceId, providerKey);
  const state = generateSecureToken(24);
  const redirectUri = redirectUriOverride ?? providerRedirectUri(provider);

  const clientId = providerClientId(provider);
  const clientSecret = providerClientSecret(provider);
 
  const isMock = !clientId || !clientSecret || provider.key === 'twilio';

  await prisma.oAuthSession.create({
    data: {
      workspaceId,
      integrationId: integration.id,
      provider: provider.key,
      userId,
      state,
      redirectUri,
      expiresAt: new Date(Date.now() + oauthExpiryMs),
      metadata: jsonString({ provider: provider.key, mock: isMock }),
    },
  });
   

  let authorizationUrl;
  if (!isMock) {
    throw new Error("I AM HERE");
    console.log("STATE GENERATED:", state);
    authorizationUrl = buildAuthorizationUrl(provider, state, redirectUri);
    console.log("AUTHORIZATION URL:");
console.log(authorizationUrl);
  } else {
    // MOCK CONNECT: Redirect straight back to our own callback to simulate completion
    const url = new URL(redirectUri || 'http://localhost:4000/api/v1/integrations/mock/callback');
    url.searchParams.set('code', 'mock_code_' + generateSecureToken(8));
    url.searchParams.set('state', state);
    authorizationUrl = url.toString();
  }
  await logIntegration({
    workspaceId,
    provider: provider.key,
    integrationId: integration.id,
    event: 'oauth_connect_requested',
    message: `OAuth connect flow started for ${provider.name}`,
  });

  return { authorizationUrl, state, provider: serializeIntegration(integration) };
};

export const completeOAuthCallback = async (providerKey, code, state, callbackRedirectUri = null) => {
  const provider = getProvider(providerKey);

  let session;

  try {
    session = await prisma.oAuthSession.findUnique({
      where: { state }
    });

    console.log("SESSION FOUND:", session);

  } catch (err) {
    console.error("OAUTH SESSION ERROR:", err);
    throw err;
  }

  if (!session || session.provider !== provider.key || session.consumedAt || session.expiresAt < now()) {
    const error = new Error('OAuth session expired or invalid');
    error.statusCode = 400;
    throw error;
  }

  const redirectUri = callbackRedirectUri ?? session.redirectUri ?? providerRedirectUri(provider);
  const metadata = safeJson(session.metadata);
  
  let tokenPayload;
  if (metadata.mock) {
    if (provider.key === 'twilio' && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      tokenPayload = {
        access_token: env.TWILIO_AUTH_TOKEN, // just store auth token securely
        token_type: 'Basic',
        scope: 'api',
        expires_in: 3600 * 24 * 365 * 10 // never expires practically
      };
    } else {
      tokenPayload = {
        access_token: 'mock_access_token_' + generateSecureToken(12),
        refresh_token: 'mock_refresh_token_' + generateSecureToken(12),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: provider.oauth?.scope?.join(' ') || ''
      };
    }
  } else {
    tokenPayload = await requestToken(provider, code, redirectUri ?? '');
  }

  const integration = await prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId: session.workspaceId, provider: provider.key } },
const upsertToken = (integrationId, workspaceId, providerKey, payload) =>
  prisma.integrationToken.upsert({
    where: { integrationId },
    create: {
      integrationId, workspaceId, provider: providerKey,
      accessTokenCipher:  encryptToken(payload.access_token),
      refreshTokenCipher: payload.refresh_token ? encryptToken(payload.refresh_token) : null,
      tokenType: payload.token_type ?? 'Bearer',
      scopes:    payload.scope ?? '',
      expiresAt: payload.expires_in ? new Date(Date.now() + Number(payload.expires_in) * 1000) : null,
    },
    update: {
      provider: providerKey,
      accessTokenCipher:  encryptToken(payload.access_token),
      refreshTokenCipher: payload.refresh_token ? encryptToken(payload.refresh_token) : null,
      tokenType: payload.token_type ?? 'Bearer',
      scopes:    payload.scope ?? '',
      expiresAt: payload.expires_in ? new Date(Date.now() + Number(payload.expires_in) * 1000) : null,
      revokedAt: null,
    },
  });

const markConnected = (workspaceId, providerKey, p, expiresIn) =>
  prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider: p.key } },
    create: { workspaceId, provider: p.key, name: p.name, status: 'connected', connected: true, webhookStatus: 'ready', lastSyncAt: now() },
    update: { name: p.name, status: 'connected', connected: true, webhookStatus: 'ready', lastError: null, tokenExpiresAt: expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000) : null },
    ...withIncludes,
  });

// ─── Snapshot (sync) ─────────────────────────────────────────────────────────

const parseSnapshotResponse = (providerKey, data, fallbackLabel, fallbackCount) => {
  let label = fallbackLabel;
  let count = fallbackCount;

  if (providerKey === 'slack')            label = data.team ?? label;
  else if (providerKey === 'calendly')    label = data.resource?.name ?? data.resource?.email ?? label;
  else if (providerKey === 'salesforce')  { count = data.totalSize ?? count; label = data.records?.[0]?.Name ?? label; }
  else if (providerKey === 'genesys')     label = data.name ?? data.email ?? label;
  else if (providerKey === 'hubspot')     { count = data.results?.length ?? count; label = data.results?.[0]?.properties?.email ?? label; }
  else if (providerKey === 'cal')         { label = data.data?.username ?? data.data?.email ?? label; count = data.data?.eventTypes?.length ?? count; }
  else if (providerKey === 'google_calendar' || providerKey === 'google_meet') count = data.items?.length ?? count;
  else if (providerKey === 'google_sheets') count = data.files?.length ?? count;
  else if (providerKey === 'twilio')      label = data.friendly_name ?? label;

  return { accountLabel: label, lastSyncedCount: count };
};

const fetchSnapshot = async (integration) => {
  const p = getProvider(integration.provider);
  const token = await getAccessToken(integration);
  const metadata = safeJson(integration.metadata, {});
  const fallbackLabel = integration.accountLabel ?? p.name;
  const fallbackCount = integration.lastSyncedCount ?? 0;

  if (!token) return { accountLabel: fallbackLabel, lastSyncedCount: fallbackCount };

  if (token.startsWith('mock_access_token_') || token === integration.provider + '_mock') {
    return { accountLabel: `${p.name} (Dev Mode)`, lastSyncedCount: Math.floor(Math.random() * 50) + 1 };
  }

  if (['make', 'zapier', 'n8n', 'ghl'].includes(p.key)) {
    const webhookUrl = metadata.webhookUrl ?? token;
    let label = fallbackLabel;
    try { label = new URL(webhookUrl).hostname; } catch { /* keep fallback */ }
    return { accountLabel: label, lastSyncedCount: 1 };
  }

  if (p.key === 'custom_api') {
    return { accountLabel: metadata.endpointUrl ?? fallbackLabel, lastSyncedCount: 0 };
  }

  if (p.key === 'twilio') {
    const sid = metadata.accountSid;
    if (!sid) return { accountLabel: fallbackLabel, lastSyncedCount: fallbackCount };
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Twilio sync failed (${res.status})`);
    return parseSnapshotResponse(p.key, data, fallbackLabel, fallbackCount);
  }

  if (p.key === 'salesforce') {
    const instanceUrl = metadata.instanceUrl;
    const endpoint = p.syncEndpoint ?? '';
    if (!instanceUrl || !endpoint) return { accountLabel: fallbackLabel, lastSyncedCount: fallbackCount };
    const res = await fetch(`${instanceUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `Salesforce sync failed (${res.status})`);
    return parseSnapshotResponse(p.key, data, fallbackLabel, fallbackCount);
  }

  if (p.key === 'genesys') {
    const region = metadata.region || 'mypurecloud.com';
    const endpoint = p.syncEndpoint ?? '';
    if (!endpoint) return { accountLabel: fallbackLabel, lastSyncedCount: fallbackCount };
    const res = await fetch(`https://api.${region}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.description || data.message || `Genesys sync failed (${res.status})`);
    return parseSnapshotResponse(p.key, data, fallbackLabel, fallbackCount);
  }

  const baseUrl = providerApiBase(p);
  const endpoint = p.syncEndpoint ?? '';
  const verifyUrl = p.verifyUrl ?? '';
  const url = verifyUrl || (baseUrl && endpoint ? `${baseUrl}${endpoint}` : '');
  if (!url) return { accountLabel: fallbackLabel, lastSyncedCount: fallbackCount };

  const headers = p.key === 'cal'
    ? calApiHeaders(token)
    : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Sync failed (${res.status})`);

  return parseSnapshotResponse(p.key, data, fallbackLabel, fallbackCount);
};

// ─── createSyncJob — defined here so it can be called by connectWithCredentials ─

export const createSyncJob = async (workspaceId, providerKey, jobType = 'manual', integrationId = null) => {
  const job = await prisma.syncJob.create({
    data: { workspaceId, provider: providerKey, jobType, integrationId, status: 'queued', scheduledAt: now(), metadata: jsonStr({ jobType }) },
  });
  broadcastIntegrationEvent(workspaceId, 'integration:sync_queued', { provider: providerKey, jobId: job.id });
  return job;
};

// ─── Token / credential based connect (no OAuth redirect needed) ──────────────

export const connectWithCredentials = async (workspaceId, providerKey, credentials) => {
  const p = getProvider(providerKey);
  const sanitizedCredentials = validateIntegrationCredentials(providerKey, credentials);
  const row = await upsertRow(workspaceId, providerKey);

  let accessToken = null;
  let accountLabel = p.name;
  let extraMeta = {};
  const normalizedName = normalizeIntegrationName(sanitizedCredentials.integrationName, p.name);
  const fallbackEnabled = shouldAllowConnectionFallback() && !isPlaceholderValue(sanitizedCredentials.integrationName ?? '') && Object.values(sanitizedCredentials).some((value) => typeof value === 'string' && value.trim() && !isPlaceholderValue(value));

  try {
    // ── Google providers (Calendar, Meet, Sheets) ──
    if (['google_calendar', 'google_meet', 'google_sheets'].includes(providerKey)) {
      accessToken = sanitizedCredentials.accessToken;
      if (!accessToken) throw Object.assign(new Error('OAuth Access Token is required'), { statusCode: 400 });
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error_description || data.error || 'Invalid Google OAuth token — generate a new one from the OAuth Playground'), { statusCode: 400 });
      accountLabel = data.email ?? data.name ?? p.name;
      extraMeta = { email: data.email, sheetUrl: sanitizedCredentials.sheetUrl };
    }
    else if (providerKey === 'calendly') {
      accessToken = sanitizedCredentials.personalToken;
      const res = await fetch('https://api.calendly.com/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.message || 'Invalid Calendly token'), { statusCode: 400 });
      accountLabel = data.resource?.name ?? data.resource?.email ?? 'Calendly';
    }
    else if (providerKey === 'cal') {
      accessToken = sanitizedCredentials.apiKey;
      const res = await fetch('https://api.cal.com/v2/me', {
        headers: calApiHeaders(accessToken),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.message || 'Invalid Cal.com API key'), { statusCode: 400 });
      accountLabel = data.data?.username ?? data.data?.email ?? 'Cal.com';
    }
    else if (providerKey === 'hubspot') {
      accessToken = sanitizedCredentials.accessToken;
      const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.message || 'Invalid HubSpot token'), { statusCode: 400 });
      accountLabel = 'HubSpot';
    }
    else if (providerKey === 'slack') {
      accessToken = sanitizedCredentials.botToken;
      const res = await fetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw Object.assign(new Error(data.error || 'Invalid Slack bot token'), { statusCode: 400 });
      accountLabel = data.team ?? 'Slack';
      extraMeta = { channelId: sanitizedCredentials.channelId, teamId: data.team_id };
    }
    else if (providerKey === 'salesforce') {
      accessToken = sanitizedCredentials.accessToken;
      const instanceUrl = sanitizedCredentials.instanceUrl?.replace(/\/$/, '');
      const res = await fetch(`${instanceUrl}/services/data/v60.0/limits`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw Object.assign(new Error('Invalid Salesforce token or instance URL'), { statusCode: 400 });
      accountLabel = instanceUrl.replace('https://', '').split('.')[0];
      extraMeta = { instanceUrl };
    }
    else if (providerKey === 'twilio') {
      const sid = sanitizedCredentials.accountSid;
      const auth = sanitizedCredentials.authToken;
      accessToken = auth;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.message || 'Invalid Twilio credentials'), { statusCode: 400 });
      accountLabel = data.friendly_name ?? sid;
      extraMeta = { accountSid: sid };
    }
    else if (providerKey === 'genesys') {
      const region = sanitizedCredentials.region || 'mypurecloud.com';
      const tokenRes = await fetch(`https://login.${region}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: sanitizedCredentials.clientId,
          client_secret: sanitizedCredentials.clientSecret,
        }),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) throw Object.assign(new Error(tokenData.description || 'Invalid Genesys credentials'), { statusCode: 400 });
      accessToken = tokenData.access_token;
      accountLabel = 'Genesys';
      extraMeta = { region, clientId: sanitizedCredentials.clientId };
    }
    else if (['make', 'zapier', 'n8n', 'ghl'].includes(providerKey)) {
      const candidate = validateWebhookProviderUrl(providerKey, sanitizedCredentials.webhookUrl);
      accessToken = candidate;
      accountLabel = `${p.name} webhook`;
      extraMeta = { webhookUrl: candidate };
    }
    else if (providerKey === 'custom_api') {
      accessToken = sanitizedCredentials.authValue || 'none';
      accountLabel = sanitizedCredentials.endpointUrl ?? 'Custom API';
      extraMeta = {
        endpointUrl: sanitizedCredentials.endpointUrl,
        method: sanitizedCredentials.method,
        authType: sanitizedCredentials.authType,
      };
      const existing = await prisma.customApiConfig.findFirst({ where: { workspaceId, name: sanitizedCredentials.endpointUrl ?? 'Custom API' } });
      const cfgData = {
        name: sanitizedCredentials.endpointUrl ?? 'Custom API',
        endpointUrl: sanitizedCredentials.endpointUrl ?? '',
        method: sanitizedCredentials.method ?? 'POST',
        authType: sanitizedCredentials.authType ?? 'none',
        authValueCipher: sanitizedCredentials.authValue ? encryptToken(sanitizedCredentials.authValue) : null,
        headersJson: jsonStr({}),
        queryParamsJson: jsonStr({}),
        enabled: true,
      };
      if (existing) await prisma.customApiConfig.update({ where: { id: existing.id }, data: cfgData });
      else await prisma.customApiConfig.create({ data: { workspaceId, ...cfgData } });
    }

    if (!accessToken) throw Object.assign(new Error('No credentials provided'), { statusCode: 400 });

    const { displayName, metadata } = buildConnectionIdentity(p.name, sanitizedCredentials, extraMeta);

    const tokenPayload = {
      access_token: accessToken,
      token_type: 'Bearer',
      scope: 'api',
      expires_in: 3600 * 24 * 365 * 10,
    };
    const connected = await markConnected(workspaceId, providerKey, p, null);
    await upsertToken(connected.id, workspaceId, providerKey, tokenPayload);

    await prisma.integration.update({
      where: { id: connected.id },
      data: {
        name: normalizedName,
        accountLabel,
        metadata: jsonStr({ ...metadata, provider: providerKey }),
      },
    });

    await addLog({ workspaceId, provider: providerKey, integrationId: connected.id, event: 'connected', message: `${p.name} connected as ${displayName}` });
    await createSyncJob(workspaceId, providerKey, 'initial_sync', connected.id);
    broadcastIntegrationEvent(workspaceId, 'integration:connected', { provider: providerKey });

    return serialize(await prisma.integration.findUniqueOrThrow({ where: { id: connected.id }, ...withIncludes }));
  } catch (error) {
    if (fallbackEnabled) {
      const fallbackToken = accessToken ?? `mock_access_token_${providerKey}`;
      const fallbackDisplayName = normalizedName || p.name;
      const connected = await markConnected(workspaceId, providerKey, p, null);
      await upsertToken(connected.id, workspaceId, providerKey, {
        access_token: fallbackToken,
        token_type: 'Bearer',
        scope: 'api',
        expires_in: 3600 * 24 * 365 * 10,
      });
      await prisma.integration.update({
        where: { id: connected.id },
        data: {
          name: normalizedName,
          accountLabel: accountLabel || p.name,
          metadata: jsonStr({ provider: providerKey, connectionMode: 'fallback' }),
        },
      });
      await addLog({ workspaceId, provider: providerKey, integrationId: connected.id, event: 'connected_fallback', message: `${p.name} connected in fallback mode` });
      await createSyncJob(workspaceId, providerKey, 'initial_sync', connected.id);
      broadcastIntegrationEvent(workspaceId, 'integration:connected', { provider: providerKey });
      return serialize(await prisma.integration.findUniqueOrThrow({ where: { id: connected.id }, ...withIncludes }));
    }
    throw error;
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const listIntegrations = async (workspaceId) => {
  const records = await prisma.integration.findMany({ where: { workspaceId }, ...withIncludes, orderBy: { updatedAt: 'desc' } });
  const byKey = new Map(records.map((r) => [r.provider, r]));

  // Ensure every known provider has a row (batch-create missing ones)
  const missing = INTEGRATION_ORDER.filter((k) => !byKey.has(k));
  if (missing.length) {
    await Promise.all(missing.map((k) => upsertRow(workspaceId, k).then((r) => byKey.set(k, r))));
  }

  return INTEGRATION_ORDER.map((k) => byKey.get(k)).filter(Boolean).map(serialize);
};

export const getIntegration = async (workspaceId, providerKey) =>
  serialize(await upsertRow(workspaceId, providerKey));

export const getIntegrationLogs = async (workspaceId, providerKey = null) => {
  const where = providerKey ? { workspaceId, provider: providerKey } : { workspaceId };
  const logs = await prisma.integrationLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  return logs.map((l) => ({ id: l.id, provider: l.provider, level: l.level, event: l.event, message: l.message, status: l.status, metadata: safeJson(l.metadata, {}), createdAt: l.createdAt }));
};

export const getIntegrationDashboard = async (workspaceId) => {
  const [integrations, logs, jobs] = await Promise.all([
    listIntegrations(workspaceId),
    getIntegrationLogs(workspaceId),
    prisma.syncJob.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  return {
    integrations,
    logs,
    stats: {
      connected:  integrations.filter((i) => i.connected).length,
      total:      integrations.length,
      failed:     integrations.filter((i) => i.status === 'error').length,
      queuedJobs: jobs.filter((j) => j.status === 'queued').length,
    },
  };
};

// ─── Connect / OAuth ─────────────────────────────────────────────────────────

export const createOAuthConnectUrl = async (workspaceId, providerKey, userId, redirectUriOverride = null) => {
  const p = getProvider(providerKey);

  if (!p.oauth) {
    throw Object.assign(
      new Error(`${p.name} requires credentials. Use the connect form to provide API keys, tokens, or webhook URLs.`),
      { statusCode: 400, requiresCredentials: true },
    );
  }

  const row   = await upsertRow(workspaceId, providerKey);
  const state = generateSecureToken(24);
  const cbUri = redirectUriOverride ?? redirectUri(p) ?? `${env.CLIENT_URL ?? 'http://localhost:5173'}/api/v1/integrations/${p.key}/callback`;

  await prisma.oAuthSession.create({
    data: { workspaceId, integrationId: row.id, provider: p.key, userId: userId ?? 'unknown', state, redirectUri: cbUri, expiresAt: new Date(Date.now() + oauthExpiryMs), metadata: jsonStr({ mock: isMockProvider(p) }) },
  });

  if (!clientId(p) || !clientSecret(p)) {
    throw Object.assign(new Error(`OAuth is not configured for ${p.name}. Set Google client credentials in environment variables.`), { statusCode: 400 });
  }

  await addLog({ workspaceId, provider: p.key, integrationId: row.id, event: 'oauth_started', message: `${p.name} OAuth flow started` });
  return { authorizationUrl: buildAuthUrl(p, state, cbUri), state };
};

export const completeOAuthCallback = async (providerKey, code, state, callbackUri = null) => {
  const p = getProvider(providerKey);

  const session = await prisma.oAuthSession.findUnique({ where: { state } });
  if (!session)                             throw Object.assign(new Error('OAuth session not found — please try connecting again.'),             { statusCode: 400 });
  if (session.provider !== p.key)           throw Object.assign(new Error(`Provider mismatch in OAuth session (${session.provider} vs ${p.key})`), { statusCode: 400 });
  if (session.consumedAt)                   throw Object.assign(new Error('OAuth session already used — please try connecting again.'),          { statusCode: 400 });
  if (session.expiresAt < now())            throw Object.assign(new Error('OAuth session expired — please try connecting again.'),               { statusCode: 400 });

  const cbUri       = callbackUri ?? session.redirectUri ?? redirectUri(p) ?? '';
  const tokenPayload = await exchangeCode(p, code, cbUri);

  const connected = await markConnected(session.workspaceId, p.key, p, tokenPayload.expires_in);
  await upsertToken(connected.id, session.workspaceId, p.key, tokenPayload);
  await prisma.oAuthSession.update({ where: { id: session.id }, data: { consumedAt: now() } });

  if (['google_calendar', 'google_meet', 'google_sheets'].includes(p.key)) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.email || data.name) {
        await prisma.integration.update({
          where: { id: connected.id },
          data: { accountLabel: data.email ?? data.name },
        });
      }
    } catch { /* non-fatal */ }
  }

  await addLog({ workspaceId: session.workspaceId, provider: p.key, integrationId: connected.id, event: 'oauth_connected', message: `${p.name} connected successfully` });
  await createSyncJob(session.workspaceId, p.key, 'initial_sync', connected.id);
  broadcastIntegrationEvent(session.workspaceId, 'integration:connected', { provider: p.key, integrationId: connected.id });

  return serialize(await prisma.integration.findUniqueOrThrow({ where: { id: connected.id }, ...withIncludes }));
};

export const disconnectIntegration = async (workspaceId, providerKey) => {
  const row = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider: providerKey } }, ...withIncludes });
  if (!row) return null;
  if (row.token?.id) await prisma.integrationToken.update({ where: { id: row.token.id }, data: { revokedAt: now() } });
  await prisma.integration.update({ where: { id: row.id }, data: { connected: false, status: 'disconnected', webhookStatus: 'not_configured', lastError: null } });
  await addLog({ workspaceId, provider: providerKey, integrationId: row.id, event: 'disconnected', message: `${row.name} disconnected` });
  broadcastIntegrationEvent(workspaceId, 'integration:disconnected', { provider: providerKey });
  return serialize(await prisma.integration.findUniqueOrThrow({ where: { id: row.id }, ...withIncludes }));
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export const saveIntegrationSettings = async (workspaceId, providerKey, settings, enabled = true) => {
  const row = await upsertRow(workspaceId, providerKey);
  await prisma.integrationSetting.upsert({
    where: { integrationId: row.id },
    create: { workspaceId, integrationId: row.id, provider: providerKey, settingsJson: jsonStr(settings), enabled, webhookEnabled: Boolean(settings?.webhookEnabled), selectedChannels: jsonStr(settings?.selectedChannels ?? []), lastValidatedAt: now() },
    update: { settingsJson: jsonStr(settings), enabled, webhookEnabled: Boolean(settings?.webhookEnabled), selectedChannels: jsonStr(settings?.selectedChannels ?? []), lastValidatedAt: now() },
  });
  await prisma.integration.update({ where: { id: row.id }, data: { settingsJson: jsonStr(settings), webhookEnabled: Boolean(settings?.webhookEnabled) } });

  // Custom API — save config
  if (providerKey === 'custom_api' && settings?.endpointUrl) {
    const existing = await prisma.customApiConfig.findFirst({ where: { workspaceId, name: settings?.name ?? 'Custom API' } });
    const configData = {
      name: settings?.name ?? 'Custom API',
      endpointUrl: settings.endpointUrl,
      method: settings?.method ?? 'GET',
      authType: settings?.authType ?? 'none',
      authValueCipher: settings?.authValue ? encryptToken(settings.authValue) : (existing?.authValueCipher ?? null),
      headersJson: jsonStr(settings?.headers ?? {}),
      queryParamsJson: jsonStr(settings?.queryParams ?? {}),
      bodyTemplate: settings?.bodyTemplate ?? null,
      enabled,
    };
    if (existing) await prisma.customApiConfig.update({ where: { id: existing.id }, data: configData });
    else await prisma.customApiConfig.create({ data: { workspaceId, ...configData } });
  }

  await addLog({ workspaceId, provider: providerKey, integrationId: row.id, event: 'settings_saved', message: `${row.name} settings updated` });
  broadcastIntegrationEvent(workspaceId, 'integration:settings', { provider: providerKey });
  return serialize(await prisma.integration.findUniqueOrThrow({ where: { id: row.id }, ...withIncludes }));
};

export const testCustomApi = async (workspaceId, payload) => {
  const cfg = await prisma.customApiConfig.create({
    data: { workspaceId, name: payload.name, endpointUrl: payload.endpointUrl, method: payload.method, authType: payload.authType, authValueCipher: payload.authValue ? encryptToken(payload.authValue) : null, headersJson: jsonStr(payload.headers), queryParamsJson: jsonStr(payload.queryParams), bodyTemplate: payload.bodyTemplate ?? null, enabled: true },
  });

  const url = new URL(cfg.endpointUrl);
  Object.entries(safeJson(cfg.queryParamsJson, {})).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers = { ...safeJson(cfg.headersJson, {}) };
  if (cfg.authType === 'bearer'  && cfg.authValueCipher) headers.Authorization = `Bearer ${decryptToken(cfg.authValueCipher)}`;
  if (cfg.authType === 'api_key' && cfg.authValueCipher) headers['X-API-Key']   = decryptToken(cfg.authValueCipher);

  const res  = await fetch(url.toString(), { method: cfg.method, headers: { 'Content-Type': 'application/json', ...headers }, body: ['GET','DELETE'].includes(cfg.method) ? undefined : (cfg.bodyTemplate ?? undefined) });
  const text = await res.text();

  await prisma.customApiConfig.update({ where: { id: cfg.id }, data: { lastTestAt: now(), lastTestStatus: res.status, lastTestError: res.ok ? null : text.slice(0, 500) } });
  await addLog({ workspaceId, provider: 'custom_api', event: 'api_test', message: `Custom API test ${res.ok ? 'succeeded' : 'failed'} (${res.status})`, status: String(res.status) });

  return { status: res.status, ok: res.ok, response: text.slice(0, 2000) };
};

// ─── Remaining sync operations ───────────────────────────────────────────────

export const runSyncJob = async (jobId) => {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId }, include: { integration: { ...withIncludes } } });
  if (!job || !job.integration) return null;

  await prisma.syncJob.update({ where: { id: jobId }, data: { status: 'running', startedAt: now(), attempts: { increment: 1 } } });

  try {
    const snapshot = await fetchSnapshot(job.integration);
    await prisma.integration.update({ where: { id: job.integration.id }, data: { status: 'connected', connected: true, lastSyncAt: now(), lastError: null, accountLabel: snapshot.accountLabel ?? job.integration.accountLabel, lastSyncedCount: snapshot.lastSyncedCount ?? job.integration.lastSyncedCount } });
    await prisma.syncJob.update({ where: { id: jobId }, data: { status: 'completed', completedAt: now(), error: null } });
    await addLog({ workspaceId: job.workspaceId, provider: job.provider, integrationId: job.integration.id, event: 'sync_completed', message: `${job.provider} synced`, status: 'completed' });
    broadcastIntegrationEvent(job.workspaceId, 'integration:sync_completed', { provider: job.provider, jobId });
    return { ok: true, snapshot };
  } catch (err) {
    await prisma.syncJob.update({ where: { id: jobId }, data: { status: 'failed', completedAt: now(), error: err.message } });
    await prisma.integration.update({ where: { id: job.integration.id }, data: { status: 'error', lastError: err.message } });
    await addLog({ workspaceId: job.workspaceId, provider: job.provider, integrationId: job.integration.id, level: 'error', event: 'sync_failed', message: err.message, status: 'failed' });
    broadcastIntegrationEvent(job.workspaceId, 'integration:sync_failed', { provider: job.provider, jobId, error: err.message });
    return { ok: false, error: err.message };
  }
};

export const processPendingSyncJobs = async () => {
  const jobs = await prisma.syncJob.findMany({ where: { status: 'queued', scheduledAt: { lte: now() } }, orderBy: { createdAt: 'asc' }, take: 10 });
  for (const job of jobs) {
    await runSyncJob(job.id).catch((err) => logger.error({ err, jobId: job.id }, 'Sync job failed'));
  }
};

// ─── Webhook events ───────────────────────────────────────────────────────────

export const handleWebhookEvent = async (providerKey, headers, rawBody) => {
  const p = getProvider(providerKey);
  const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '');
  const payload  = safeJson(bodyText, { raw: bodyText });
  const workspaceId    = payload.workspaceId || payload.tenantId || payload.accountId || 'public';
  const eventType      = payload.eventType   || payload.type     || headers['x-event-type'] || 'webhook';
  const providerEventId = payload.id         || headers['x-event-id'] || null;

  const event = await prisma.webhookEvent.create({
    data: { workspaceId, provider: p.key, providerEventId, eventType, payload: jsonStr(payload), headers: jsonStr(headers), signatureValid: true, processingStatus: 'received' },
  });

  await addLog({ workspaceId, provider: p.key, event: 'webhook_received', message: `${p.name} webhook received`, metadata: { eventId: event.id, eventType } });

  const integration = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider: p.key } } });
  if (integration) {
    await createSyncJob(workspaceId, p.key, 'webhook_sync', integration.id);
    broadcastIntegrationEvent(workspaceId, 'integration:webhook', { provider: p.key, eventType });
  }

  return event;
};

// ─── Misc exports used by controller ─────────────────────────────────────────

export const getProviderByName = (name) => INTEGRATION_PROVIDERS[name] ?? null;

