import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';
import { generateSecureToken } from '../lib/hash.js';
import logger from '../lib/logger.js';
import { broadcastIntegrationEvent } from '../lib/integrationEvents.js';
import { INTEGRATION_ORDER, INTEGRATION_PROVIDERS } from '../constants/integrations.js';

const now = () => new Date();
const oauthExpiryMs = 10 * 60 * 1000;

const getProvider = (providerKey) => {
  const provider = INTEGRATION_PROVIDERS[providerKey];
  if (!provider) {
    const error = new Error(`Unsupported integration provider: ${providerKey}`);
    error.statusCode = 404;
    throw error;
  }
  return provider;
};

const providerRedirectUri = (provider) => {
  const envKey = provider.oauth?.redirectUriEnv;
  return envKey ? env[envKey] : null;
};

const providerClientId = (provider) => provider.oauth ? env[provider.oauth.clientIdEnv] : null;
const providerClientSecret = (provider) => provider.oauth ? env[provider.oauth.clientSecretEnv] : null;

const safeJson = (value, fallback = {}) => {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
};

const jsonString = (value) => JSON.stringify(value ?? {});

const upsertIntegrationRow = async (workspaceId, providerKey) => {
  const provider = getProvider(providerKey);
  return prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider: provider.key } },
    create: {
      workspaceId,
      provider: provider.key,
      name: provider.name,
      status: 'disconnected',
      connected: false,
      webhookStatus: 'not_configured',
      metadata: jsonString({ provider: provider.key }),
      settingsJson: jsonString({}),
    },
    update: {
      name: provider.name,
    },
    include: { token: true, settings: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });
};

const serializeIntegration = (integration) => ({
  id: integration.id,
  workspaceId: integration.workspaceId,
  provider: integration.provider,
  name: integration.name,
  status: integration.status,
  connected: integration.connected,
  accountId: integration.accountId,
  accountLabel: integration.accountLabel,
  lastSyncAt: integration.lastSyncAt,
  lastError: integration.lastError,
  tokenExpiresAt: integration.tokenExpiresAt,
  webhookStatus: integration.webhookStatus,
  webhookEnabled: integration.webhookEnabled,
  lastSyncedCount: integration.lastSyncedCount,
  settingsJson: safeJson(integration.settingsJson, {}),
  metadata: safeJson(integration.metadata, {}),
  settings: integration.settings ? {
    enabled: integration.settings.enabled,
    webhookEnabled: integration.settings.webhookEnabled,
    settingsJson: safeJson(integration.settings.settingsJson, {}),
    selectedChannels: safeJson(integration.settings.selectedChannels, []),
    lastValidatedAt: integration.settings.lastValidatedAt,
  } : null,
  logs: (integration.logs ?? []).map((log) => ({
    id: log.id,
    level: log.level,
    event: log.event,
    message: log.message,
    status: log.status,
    metadata: safeJson(log.metadata, {}),
    createdAt: log.createdAt,
  })),
});

const logIntegration = async ({ workspaceId, provider, integrationId = null, level = 'info', event, message, status = null, metadata = {} }) => {
  const log = await prisma.integrationLog.create({
    data: { workspaceId, provider, integrationId, level, event, message, status, metadata: jsonString(metadata) },
  });
  broadcastIntegrationEvent(workspaceId, 'integration:log', { provider, logId: log.id, event, message, level, status });
  return log;
};

const setIntegrationStatus = async (integrationId, data) => prisma.integration.update({ where: { id: integrationId }, data });

const buildAuthorizationUrl = (provider, state, redirectUriOverride) => {
  if (!provider.oauth) return null;
  const authUrl = new URL(provider.oauth.authorizationUrl.replace('{region}', env.GENESYS_REGION));
  authUrl.searchParams.set('client_id', providerClientId(provider) ?? '');
  authUrl.searchParams.set('redirect_uri', redirectUriOverride ?? providerRedirectUri(provider) ?? '');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  if (provider.oauth.scope?.length) authUrl.searchParams.set('scope', provider.oauth.scope.join(' '));
  for (const [key, value] of Object.entries(provider.oauth.extraParams ?? {})) authUrl.searchParams.set(key, value);
  return authUrl.toString();
};

const requestToken = async (provider, code, redirectUri) => {
  if (!provider.oauth) return null;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const clientId = providerClientId(provider);
  const clientSecret = providerClientSecret(provider);

  let headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (provider.key === 'slack') {
    params.set('client_id', clientId ?? '');
    params.set('client_secret', clientSecret ?? '');
  } else if (provider.key === 'calendly') {
    params.set('client_id', clientId ?? '');
    params.set('client_secret', clientSecret ?? '');
  } else {
    params.set('client_id', clientId ?? '');
    params.set('client_secret', clientSecret ?? '');
  }

  if (provider.key === 'genesys') {
    params.set('grant_type', 'authorization_code');
  }

  const res = await fetch(provider.oauth.tokenUrl.replace('{region}', env.GENESYS_REGION), {
    method: 'POST',
    headers,
    body: params.toString(),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error_description || payload.error || `Token exchange failed (${res.status})`);
  }
  return payload;
};

const getAccessToken = async (integration) => {
  if (!integration?.token) return null;
  if (integration.token.revokedAt) return null;
  return decryptToken(integration.token.accessTokenCipher);
};

const getRefreshToken = async (integration) => {
  if (!integration?.token?.refreshTokenCipher) return null;
  if (integration.token.revokedAt) return null;
  return decryptToken(integration.token.refreshTokenCipher);
};

const maybeRefreshToken = async (integration) => {
  if (!integration?.token || !integration.token.expiresAt || !integration.token.refreshTokenCipher) {
    return integration;
  }
  const expiresAt = new Date(integration.token.expiresAt).getTime();
  if (expiresAt - Date.now() > 60 * 1000) return integration;
  const provider = getProvider(integration.provider);
  if (!provider.oauth) return integration;

  const refreshToken = await getRefreshToken(integration);
  if (!refreshToken) return integration;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: providerClientId(provider) ?? '',
    client_secret: providerClientSecret(provider) ?? '',
  });

  const res = await fetch(provider.oauth.tokenUrl.replace('{region}', env.GENESYS_REGION), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error_description || payload.error || 'Token refresh failed');
  }

  await prisma.integrationToken.update({
    where: { id: integration.token.id },
    data: {
      accessTokenCipher: encryptToken(payload.access_token),
      refreshTokenCipher: payload.refresh_token ? encryptToken(payload.refresh_token) : integration.token.refreshTokenCipher,
      tokenType: payload.token_type ?? integration.token.tokenType,
      scopes: payload.scope ?? integration.token.scopes,
      expiresAt: payload.expires_in ? new Date(Date.now() + Number(payload.expires_in) * 1000) : integration.token.expiresAt,
      revokedAt: null,
    },
  });

  return prisma.integration.findUnique({
    where: { id: integration.id },
    include: { token: true, settings: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });
};

const fetchProviderSnapshot = async (integration) => {
  const provider = getProvider(integration.provider);
  const accessToken = await getAccessToken(integration);
  if (!accessToken || !provider.oauth) {
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
  } else if (provider.key === 'hubspot') {
    syncCount = Array.isArray(payload.results) ? payload.results.length : syncCount;
  } else if (provider.key === 'calendly') {
    accountLabel = payload.resource?.name ?? payload.resource?.email ?? accountLabel;
  } else if (provider.key === 'salesforce') {
    accountLabel = payload.label ?? payload.name ?? accountLabel;
  } else if (provider.key === 'genesys') {
    accountLabel = payload.name ?? payload.email ?? accountLabel;
  } else if (provider.key === 'cal') {
    accountLabel = payload.name ?? payload.email ?? accountLabel;
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

  await prisma.oauthSession.create({
    data: {
      workspaceId,
      integrationId: integration.id,
      provider: provider.key,
      userId,
      state,
      redirectUri,
      expiresAt: new Date(Date.now() + oauthExpiryMs),
      metadata: jsonString({ provider: provider.key }),
    },
  });

  const authorizationUrl = buildAuthorizationUrl(provider, state, redirectUri);
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
  const session = await prisma.oauthSession.findUnique({ where: { state } });
  if (!session || session.provider !== provider.key || session.consumedAt || session.expiresAt < now()) {
    const error = new Error('OAuth session expired or invalid');
    error.statusCode = 400;
    throw error;
  }

  const redirectUri = callbackRedirectUri ?? session.redirectUri ?? providerRedirectUri(provider);
  const tokenPayload = await requestToken(provider, code, redirectUri ?? '');

  const integration = await prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId: session.workspaceId, provider: provider.key } },
    create: {
      workspaceId: session.workspaceId,
      provider: provider.key,
      name: provider.name,
      status: 'connected',
      connected: true,
      webhookStatus: 'ready',
      lastSyncAt: now(),
    },
    update: {
      name: provider.name,
      status: 'connected',
      connected: true,
      webhookStatus: 'ready',
      lastError: null,
      tokenExpiresAt: tokenPayload.expires_in ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000) : null,
    },
    include: { token: true, settings: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });

  await prisma.integrationToken.upsert({
    where: { integrationId: integration.id },
    create: {
      integrationId: integration.id,
      workspaceId: session.workspaceId,
      provider: provider.key,
      accessTokenCipher: encryptToken(tokenPayload.access_token),
      refreshTokenCipher: tokenPayload.refresh_token ? encryptToken(tokenPayload.refresh_token) : null,
      tokenType: tokenPayload.token_type ?? 'Bearer',
      scopes: tokenPayload.scope ?? provider.oauth.scope.join(' '),
      expiresAt: tokenPayload.expires_in ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000) : null,
    },
    update: {
      provider: provider.key,
      accessTokenCipher: encryptToken(tokenPayload.access_token),
      refreshTokenCipher: tokenPayload.refresh_token ? encryptToken(tokenPayload.refresh_token) : null,
      tokenType: tokenPayload.token_type ?? 'Bearer',
      scopes: tokenPayload.scope ?? provider.oauth.scope.join(' '),
      expiresAt: tokenPayload.expires_in ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000) : null,
      revokedAt: null,
    },
  });

  await prisma.oauthSession.update({ where: { id: session.id }, data: { consumedAt: now() } });

  await logIntegration({
    workspaceId: session.workspaceId,
    provider: provider.key,
    integrationId: integration.id,
    event: 'oauth_connected',
    message: `${provider.name} connected successfully`,
  });

  await createSyncJob(session.workspaceId, provider.key, 'initial_sync', integration.id);

  broadcastIntegrationEvent(session.workspaceId, 'integration:connected', {
    provider: provider.key,
    integrationId: integration.id,
  });

  return serializeIntegration(await prisma.integration.findUniqueOrThrow({
    where: { id: integration.id },
    include: { token: true, settings: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  }));
};

export const disconnectIntegration = async (workspaceId, providerKey) => {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: providerKey } },
    include: { token: true, settings: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });
  if (!integration) return null;

  if (integration.token?.id) {
    await prisma.integrationToken.update({ where: { id: integration.token.id }, data: { revokedAt: now() } });
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      connected: false,
      status: 'disconnected',
      webhookStatus: 'not_configured',
      lastError: null,
      metadata: jsonString({ provider: providerKey }),
    },
  });

  await logIntegration({
    workspaceId,
    provider: providerKey,
    integrationId: integration.id,
    event: 'integration_disconnected',
    message: `${integration.name} disconnected`,
    status: 'disconnected',
  });

  broadcastIntegrationEvent(workspaceId, 'integration:disconnected', { provider: providerKey, integrationId: integration.id });
  return serializeIntegration(await prisma.integration.findUniqueOrThrow({
    where: { id: integration.id },
    include: { token: true, settings: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  }));
};

export const saveIntegrationSettings = async (workspaceId, providerKey, settings, enabled = true) => {
  const integration = await upsertIntegrationRow(workspaceId, providerKey);
  const integrationSetting = await prisma.integrationSetting.upsert({
    where: { integrationId: integration.id },
    create: {
      workspaceId,
      integrationId: integration.id,
      provider: providerKey,
      settingsJson: jsonString(settings),
      enabled,
      webhookEnabled: Boolean(settings?.webhookEnabled),
      selectedChannels: jsonString(settings?.selectedChannels ?? []),
      lastValidatedAt: now(),
    },
    update: {
      settingsJson: jsonString(settings),
      enabled,
      webhookEnabled: Boolean(settings?.webhookEnabled),
      selectedChannels: jsonString(settings?.selectedChannels ?? []),
      lastValidatedAt: now(),
    },
  });

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      settingsJson: jsonString(settings),
      webhookEnabled: Boolean(settings?.webhookEnabled),
    },
  });

  if (providerKey === 'custom_api') {
    const existingConfig = await prisma.customApiConfig.findFirst({
      where: { workspaceId, name: settings?.name ?? 'Custom API' },
    });

    if (existingConfig) {
      await prisma.customApiConfig.update({
        where: { id: existingConfig.id },
        data: {
          name: settings?.name ?? 'Custom API',
          endpointUrl: settings?.endpointUrl ?? 'https://example.com',
          method: settings?.method ?? 'GET',
          authType: settings?.authType ?? 'none',
          authValueCipher: settings?.authValue ? encryptToken(settings.authValue) : existingConfig.authValueCipher,
          headersJson: jsonString(settings?.headers ?? {}),
          queryParamsJson: jsonString(settings?.queryParams ?? {}),
          bodyTemplate: settings?.bodyTemplate ?? null,
          enabled,
        },
      });
    } else {
      await prisma.customApiConfig.create({
        data: {
          workspaceId,
          name: settings?.name ?? 'Custom API',
          endpointUrl: settings?.endpointUrl ?? 'https://example.com',
          method: settings?.method ?? 'GET',
          authType: settings?.authType ?? 'none',
          authValueCipher: settings?.authValue ? encryptToken(settings.authValue) : null,
          headersJson: jsonString(settings?.headers ?? {}),
          queryParamsJson: jsonString(settings?.queryParams ?? {}),
          bodyTemplate: settings?.bodyTemplate ?? null,
          enabled,
        },
      });
    }
  }

  await logIntegration({
    workspaceId,
    provider: providerKey,
    integrationId: integration.id,
    event: 'settings_updated',
    message: `${integration.name} settings saved`,
  });

  broadcastIntegrationEvent(workspaceId, 'integration:settings', { provider: providerKey, integrationId: integration.id });
  return serializeIntegration(await prisma.integration.findUniqueOrThrow({
    where: { id: integration.id },
    include: { token: true, settings: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  }));
};

export const testCustomApi = async (workspaceId, payload) => {
  const config = await prisma.customApiConfig.create({
    data: {
      workspaceId,
      name: payload.name,
      endpointUrl: payload.endpointUrl,
      method: payload.method,
      authType: payload.authType,
      authValueCipher: payload.authValue ? encryptToken(payload.authValue) : null,
      headersJson: jsonString(payload.headers),
      queryParamsJson: jsonString(payload.queryParams),
      bodyTemplate: payload.bodyTemplate ?? null,
      enabled: true,
    },
  });

  const url = new URL(config.endpointUrl);
  for (const [key, value] of Object.entries(safeJson(config.queryParamsJson, {}))) {
    url.searchParams.set(key, value);
  }

  const headers = { ...(safeJson(config.headersJson, {})) };
  if (config.authType === 'bearer' && config.authValueCipher) {
    headers.Authorization = `Bearer ${decryptToken(config.authValueCipher)}`;
  } else if (config.authType === 'api_key' && config.authValueCipher) {
    headers['X-API-Key'] = decryptToken(config.authValueCipher);
  }

  const res = await fetch(url.toString(), {
    method: config.method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: ['GET', 'DELETE'].includes(config.method) ? undefined : (config.bodyTemplate ?? undefined),
  });
  const text = await res.text();

  await prisma.customApiConfig.update({
    where: { id: config.id },
    data: { lastTestAt: now(), lastTestStatus: res.status, lastTestError: res.ok ? null : text.slice(0, 500) },
  });

  await logIntegration({
    workspaceId,
    provider: 'custom_api',
    event: 'custom_api_test',
    message: res.ok ? 'Custom API test succeeded' : 'Custom API test failed',
    status: String(res.status),
    metadata: { response: text.slice(0, 1000) },
  });

  return { status: res.status, ok: res.ok, response: text.slice(0, 2000) };
};

export const createSyncJob = async (workspaceId, providerKey, jobType = 'manual', integrationId = null) => {
  const job = await prisma.syncJob.create({
    data: {
      workspaceId,
      provider: providerKey,
      jobType,
      integrationId,
      status: 'queued',
      scheduledAt: now(),
      metadata: jsonString({ jobType, integrationId }),
    },
  });
  broadcastIntegrationEvent(workspaceId, 'integration:sync_queued', { provider: providerKey, jobId: job.id });
  return job;
};

export const runSyncJob = async (jobId) => {
  const job = await prisma.syncJob.findUnique({
    where: { id: jobId },
    include: { integration: { include: { token: true, settings: true, logs: { orderBy: { createdAt: 'desc' }, take: 5 } } } },
  });
  if (!job || !job.integration) return null;

  await prisma.syncJob.update({ where: { id: jobId }, data: { status: 'running', startedAt: now(), attempts: { increment: 1 } } });

  try {
    const refreshedIntegration = await maybeRefreshToken(job.integration);
    const snapshot = await fetchProviderSnapshot(refreshedIntegration ?? job.integration);

    await prisma.integration.update({
      where: { id: job.integration.id },
      data: {
        status: 'connected',
        connected: true,
        lastSyncAt: now(),
        lastError: null,
        accountLabel: snapshot.accountLabel ?? job.integration.accountLabel,
        lastSyncedCount: snapshot.lastSyncedCount ?? job.integration.lastSyncedCount,
      },
    });

    await prisma.syncJob.update({ where: { id: jobId }, data: { status: 'completed', completedAt: now(), error: null } });
    await logIntegration({
      workspaceId: job.workspaceId,
      provider: job.provider,
      integrationId: job.integration.id,
      event: 'sync_completed',
      message: `${job.provider} synced successfully`,
      status: 'completed',
      metadata: { count: snapshot.lastSyncedCount ?? 0 },
    });
    broadcastIntegrationEvent(job.workspaceId, 'integration:sync_completed', { provider: job.provider, jobId });
    return { ok: true, snapshot };
  } catch (error) {
    await prisma.syncJob.update({ where: { id: jobId }, data: { status: 'failed', completedAt: now(), error: error.message } });
    await prisma.integration.update({
      where: { id: job.integration.id },
      data: { status: 'error', lastError: error.message },
    });
    await logIntegration({
      workspaceId: job.workspaceId,
      provider: job.provider,
      integrationId: job.integration.id,
      level: 'error',
      event: 'sync_failed',
      message: error.message,
      status: 'failed',
    });
    broadcastIntegrationEvent(job.workspaceId, 'integration:sync_failed', { provider: job.provider, jobId, error: error.message });
    return { ok: false, error: error.message };
  }
};

export const processPendingSyncJobs = async () => {
  const jobs = await prisma.syncJob.findMany({
    where: { status: 'queued', scheduledAt: { lte: now() } },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });
  for (const job of jobs) {
    await runSyncJob(job.id).catch((err) => logger.error({ err, jobId: job.id }, 'Failed to process sync job'));
  }
};

export const handleWebhookEvent = async (providerKey, headers, rawBody) => {
  const provider = getProvider(providerKey);
  const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '');
  const payload = safeJson(bodyText, { raw: bodyText });
  const workspaceId = payload.workspaceId || payload.tenantId || payload.accountId || 'public';
  const eventType = payload.eventType || payload.type || headers['x-event-type'] || 'webhook';
  const providerEventId = payload.id || headers['x-event-id'] || headers['x-request-id'] || null;

  const signatureValid = true;

  const event = await prisma.webhookEvent.create({
    data: {
      workspaceId,
      provider: provider.key,
      providerEventId,
      eventType,
      payload: jsonString(payload),
      headers: jsonString(headers),
      signatureValid,
      processingStatus: 'received',
    },
  });

  await logIntegration({
    workspaceId,
    provider: provider.key,
    event: 'webhook_received',
    message: `${provider.name} webhook received`,
    metadata: { eventId: event.id, eventType },
  });

  const integration = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider: provider.key } } });
  if (integration) {
    await prisma.syncJob.create({
      data: {
        workspaceId,
        provider: provider.key,
        integrationId: integration.id,
        jobType: 'webhook_sync',
        status: 'queued',
        scheduledAt: now(),
        metadata: jsonString({ eventId: event.id, eventType }),
      },
    });
    broadcastIntegrationEvent(workspaceId, 'integration:webhook', { provider: provider.key, eventType });
  }

  return event;
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
      connected: integrations.filter((item) => item.connected).length,
      total: integrations.length,
      failed: integrations.filter((item) => item.status === 'error').length,
      queuedJobs: jobs.filter((job) => job.status === 'queued').length,
    },
  };
};

export const getProviderByName = (name) => INTEGRATION_PROVIDERS[name];
