import { whapi } from './whapi';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'syncing';

export interface IntegrationLogItem {
  id: string;
  provider: string;
  level: string;
  event: string;
  message: string;
  status?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface IntegrationItem {
  id: string;
  provider: string;
  name: string;
  status: IntegrationStatus | string;
  connected: boolean;
  accountLabel?: string | null;
  accountId?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  tokenExpiresAt?: string | null;
  webhookStatus?: string;
  webhookEnabled?: boolean;
  lastSyncedCount?: number;
  settings?: {
    enabled: boolean;
    webhookEnabled: boolean;
    settingsJson: Record<string, unknown>;
    selectedChannels: string[];
    lastValidatedAt?: string | null;
  } | null;
  logs?: IntegrationLogItem[];
}

export interface IntegrationDashboardResponse {
  integrations: IntegrationItem[];
  logs: IntegrationLogItem[];
  stats: {
    connected: number;
    total: number;
    failed: number;
    queuedJobs: number;
  };
}

export const integrationsApi = {
  getDashboard: async () => whapi.get<IntegrationDashboardResponse>('/integrations'),
  getLogs: async (provider?: string) => {
    const suffix = provider ? `?provider=${encodeURIComponent(provider)}` : '';
    return whapi.get<{ logs: IntegrationLogItem[] }>(`/integrations/logs${suffix}`);
  },
  connect: async (provider: string, redirectUri?: string) => whapi.post<{ authorizationUrl: string }>(`/integrations/${provider}/connect`, { redirectUri }),
  disconnect: async (provider: string) => whapi.post<{ message: string }>(`/integrations/${provider}/disconnect`, {}),
  sync: async (provider: string, jobType = 'manual') => whapi.post(`/integrations/${provider}/sync`, { jobType }),
  saveSettings: async (provider: string, settings: Record<string, unknown>, enabled = true) =>
    whapi.patch(`/integrations/${provider}/settings`, { settings, enabled }),
  testCustomApi: async (payload: Record<string, unknown>) => whapi.post('/integrations/custom-api/test', payload),
  subscribeEvents: (onEvent: () => void) => {
    const workspaceId = localStorage.getItem('workspaceId');
    if (!workspaceId) return null;

    const source = new EventSource(`/api/v1/workspaces/${workspaceId}/integrations/events`, { withCredentials: true });
    const refresh = () => onEvent();

    source.addEventListener('integration:connected', refresh);
    source.addEventListener('integration:disconnected', refresh);
    source.addEventListener('integration:sync_completed', refresh);
    source.addEventListener('integration:sync_failed', refresh);
    source.addEventListener('integration:settings', refresh);
    source.addEventListener('integration:webhook', refresh);
    source.addEventListener('integration:log', refresh);

    return source;
  },
};
