import * as service from '../services/integrations.service.js';
import { INTEGRATION_PROVIDERS } from '../constants/integrations.js';

export const getDashboard = async (req, res) => {
  const data = await service.getIntegrationDashboard(req.params.workspaceId);
  res.json(data);
};

export const getLogs = async (req, res) => {
  const logs = await service.getIntegrationLogs(req.params.workspaceId, req.query.provider || null);
  res.json({ logs });
};

export const getIntegration = async (req, res) => {
  const integration = await service.getIntegration(req.params.workspaceId, req.params.provider);
  res.json(integration);
};

export const connect = async (req, res) => {
  const dynamicCallbackUrl = `${req.protocol}://${req.get('host')}/api/v1/integrations/${req.params.provider}/callback`;
  
  // Get provider config to determine correct redirect URI env var
  const provider = INTEGRATION_PROVIDERS[req.params.provider];
  const redirectUriEnv = provider?.oauth?.redirectUriEnv;
  const finalRedirectUri = (redirectUriEnv && process.env[redirectUriEnv]) || dynamicCallbackUrl;
  
  const result = await service.createOAuthConnectUrl(req.params.workspaceId, req.params.provider, req.user?.userId ?? req.user?.id, finalRedirectUri);
  res.json(result);
};

export const disconnect = async (req, res) => {
  const integration = await service.disconnectIntegration(req.params.workspaceId, req.params.provider);
  res.json({ integration, message: 'Integration disconnected' });
};

export const saveSettings = async (req, res) => {
  const integration = await service.saveIntegrationSettings(req.params.workspaceId, req.params.provider, req.body.settings ?? req.body, req.body.enabled ?? true);
  res.json({ integration, message: 'Settings saved' });
};

export const sync = async (req, res) => {
  const job = await service.createSyncJob(req.params.workspaceId, req.params.provider, req.body.jobType ?? 'manual');
  const result = await service.runSyncJob(job.id);
  res.json({ job, result });
};

export const testCustomApi = async (req, res) => {
  const result = await service.testCustomApi(req.params.workspaceId, req.body);
  res.json(result);
};

export const events = async (req, res) => {
  const { registerIntegrationClient } = await import('../lib/integrationEvents.js');
  registerIntegrationClient(req.params.workspaceId, res);
};
