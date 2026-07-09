import * as service from '../services/integrations.service.js';
import { INTEGRATION_PROVIDERS } from '../constants/integrations.js';
import logger from '../lib/logger.js';

// ── Helper to return clean error responses ────────────────────────────────────
const handleError = (res, err, context = 'integrations') => {
  const status = err.statusCode ?? 500;
  const message = status < 500 ? err.message : 'Internal server error';
  if (status >= 500) logger.error({ err, context }, err.message);
  return res.status(status).json({ error: message });
};

export const getDashboard = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const [integrations, logs] = await Promise.all([
      service.listIntegrations(workspaceId),
      service.getIntegrationLogs(workspaceId),
    ]);

    const stats = {
      total: integrations.length,
      connected: integrations.filter((i) => i.connected).length,
      failed: integrations.filter((i) => i.status === 'error').length,
      queuedJobs: 0,
    };

    res.json({ integrations, logs, stats });
  } catch (err) {
    handleError(res, err, 'getDashboard');
  }
};

export const getLogs = async (req, res) => {
  try {
    const logs = await service.getIntegrationLogs(req.params.workspaceId, req.query.provider || null);
    res.json({ logs });
  } catch (err) {
    handleError(res, err, 'getLogs');
  }
};

export const getIntegration = async (req, res) => {
  try {
    const integration = await service.getIntegration(req.params.workspaceId, req.params.provider);
    res.json(integration);
  } catch (err) {
    handleError(res, err, 'getIntegration');
  }
};

export const connect = async (req, res) => {
  try {
    const dynamicCallbackUrl = `${req.protocol}://${req.get('host')}/api/v1/integrations/${req.params.provider}/callback`;
    
    // Get provider config to determine correct redirect URI env var
    const provider = INTEGRATION_PROVIDERS[req.params.provider];
    const redirectUriEnv = provider?.oauth?.redirectUriEnv;
    const finalRedirectUri = (redirectUriEnv && process.env[redirectUriEnv]) || dynamicCallbackUrl;
    
    const result = await service.createOAuthConnectUrl(
      req.params.workspaceId,
      req.params.provider,
      req.user?.userId ?? req.user?.id,
      finalRedirectUri
    );
    res.json(result);
  } catch (err) {
    handleError(res, err, 'connect');
  }
};

export const disconnect = async (req, res) => {
  try {
    const integration = await service.disconnectIntegration(req.params.workspaceId, req.params.provider);
    res.json({ integration, message: 'Integration disconnected' });
  } catch (err) {
    handleError(res, err, 'disconnect');
  }
};

export const saveSettings = async (req, res) => {
  try {
    const integration = await service.saveIntegrationSettings(
      req.params.workspaceId,
      req.params.provider,
      req.body.settings ?? req.body,
      req.body.enabled ?? true
    );
    res.json({ integration, message: 'Settings saved' });
  } catch (err) {
    handleError(res, err, 'saveSettings');
  }
};

export const sync = async (req, res) => {
  try {
    const job = await service.createSyncJob(req.params.workspaceId, req.params.provider, req.body.jobType ?? 'manual');
    const result = await service.runSyncJob(job.id);
    res.json({ job, result });
  } catch (err) {
    handleError(res, err, 'sync');
  }
};

export const testCustomApi = async (req, res) => {
  try {
    const result = await service.testCustomApi(req.params.workspaceId, req.body);
    res.json(result);
  } catch (err) {
    handleError(res, err, 'testCustomApi');
  }
};

export const events = async (req, res) => {
  try {
    const { registerIntegrationClient } = await import('../lib/integrationEvents.js');
    registerIntegrationClient(req.params.workspaceId, res);
  } catch (err) {
    handleError(res, err, 'events');
  }
};
