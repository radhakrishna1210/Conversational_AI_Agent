import { whapi } from './whapi';
import { getAuth } from './authStorage';
import { openSseStream, type SseHandle } from './sseClient';

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
  connect: async (provider: string, callbackUrl?: string) =>
    whapi.post<{ authorizationUrl: string | null; connected?: boolean; requiresWebhookConfig?: boolean }>(
      `/integrations/${provider}/connect`,
      callbackUrl ? { callbackUrl } : {}
    ),
  disconnect: async (provider: string) => whapi.post<{ message: string }>(`/integrations/${provider}/disconnect`, {}),
  sync: async (provider: string, jobType = 'manual') => whapi.post(`/integrations/${provider}/sync`, { jobType }),
  saveSettings: async (provider: string, settings: Record<string, unknown>, enabled = true) =>
    whapi.patch(`/integrations/${provider}/settings`, { settings, enabled }),
  testCustomApi: async (payload: Record<string, unknown>) => whapi.post('/integrations/custom-api/test', payload),
  /**
   * Live integration events. Previously used EventSource with no auth header
   * (guaranteed 401 — the stream never actually worked). Now streams over
   * fetch with a proper Authorization header, and recovers workspaceId from
   * the JWT when storage is empty.
   */
  subscribeEvents: (onEvent: () => void): SseHandle | null => {
    const { token, workspaceId } = getAuth();
    if (!token || !workspaceId) return null;

    const interesting = new Set([
      'integration:connected',
      'integration:disconnected',
      'integration:sync_completed',
      'integration:sync_failed',
      'integration:settings',
      'integration:webhook',
      'integration:log',
    ]);

    return openSseStream(`/api/v1/workspaces/${workspaceId}/integrations/events`, {
      headers: { Authorization: `Bearer ${token}` },
      onEvent: (event) => {
        if (interesting.has(event)) onEvent();
      },
    });
  },
};
