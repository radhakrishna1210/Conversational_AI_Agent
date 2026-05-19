import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Settings2, PlugZap, Zap, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { integrationsApi, type IntegrationItem, type IntegrationLogItem } from '../lib/integrationsApi';

type ProviderMeta = {
  key: string;
  name: string;
  description: string;
  mode: 'During Call' | 'Post Call';
  accent: string;
  tint: string;
  ctaLabel?: string;
};

const PROVIDER_META: ProviderMeta[] = [
  { key: 'cal', name: 'Cal.com', description: 'Allow your bot to schedule meetings and sync booking events.', mode: 'During Call', accent: '#23d18b', tint: 'rgba(35, 209, 139, 0.15)' },
  { key: 'calendly', name: 'Calendly', description: 'Route qualified prospects into scheduled follow-ups and event syncs.', mode: 'During Call', accent: '#5aa8ff', tint: 'rgba(90, 168, 255, 0.15)' },
  { key: 'custom_api', name: 'Custom API', description: 'Connect any REST endpoint with custom headers, auth, and testing.', mode: 'During Call', accent: '#f59e0b', tint: 'rgba(245, 158, 11, 0.14)', ctaLabel: 'Configure' },
  { key: 'salesforce', name: 'Salesforce', description: 'Push transcripts, notes, leads, and opportunities back to your CRM.', mode: 'Post Call', accent: '#7cc0ff', tint: 'rgba(124, 192, 255, 0.15)' },
  { key: 'google_calendar', name: 'Google Calendar', description: 'Read calendars, create events, and automate scheduling reminders.', mode: 'During Call', accent: '#7cfd98', tint: 'rgba(124, 253, 152, 0.15)' },
  { key: 'google_sheets', name: 'Google Sheets', description: 'Append AI call logs and reporting rows into spreadsheets in real time.', mode: 'Post Call', accent: '#6ad4ff', tint: 'rgba(106, 212, 255, 0.15)' },
  { key: 'slack', name: 'Slack', description: 'Send alerts, summaries, and live escalations to the right channel.', mode: 'During Call', accent: '#8b99ff', tint: 'rgba(139, 153, 255, 0.15)' },
  { key: 'hubspot', name: 'HubSpot', description: 'Sync contacts, notes, tickets, and follow-up workflows automatically.', mode: 'Post Call', accent: '#ff9f5a', tint: 'rgba(255, 159, 90, 0.15)' },
  { key: 'genesys', name: 'Genesys', description: 'Power queue routing, AI handoff, and real-time conversation sync.', mode: 'During Call', accent: '#ff6f91', tint: 'rgba(255, 111, 145, 0.15)' },
];

const formatRelativeTime = (value?: string | null) => {
  if (!value) return 'Never';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return 'Unknown';
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

const getStatusTone = (integration: IntegrationItem) => {
  if (!integration.connected) return { label: 'Disconnected', color: '#999', background: '#1a1a1a', border: '#333' };
  if (integration.status === 'error' || integration.lastError) return { label: 'Error', color: '#ff8a8a', background: 'rgba(255, 80, 80, 0.12)', border: '#5c2222' };
  if (integration.status === 'syncing') return { label: 'Syncing', color: '#7cc0ff', background: 'rgba(59, 130, 246, 0.12)', border: '#234a7a' };
  return { label: 'Connected', color: '#7cf0ab', background: 'rgba(35, 209, 139, 0.12)', border: '#24583e' };
};

export function StatusBadge({ integration }: { integration: IntegrationItem }) {
  const tone = getStatusTone(integration);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 10px',
      borderRadius: '999px',
      background: tone.background,
      border: `1px solid ${tone.border}`,
      color: tone.color,
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.02em',
    }}>
      <ShieldCheck size={12} />
      {tone.label}
    </span>
  );
}

export function OAuthButton({ loading, label, onClick }: { loading?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        borderRadius: '10px',
        border: '1px solid #323232',
        background: loading ? '#222' : 'linear-gradient(180deg, #202020 0%, #171717 100%)',
        color: '#f2f2f2',
        fontSize: '12px',
        fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
      {label}
    </button>
  );
}

export function SyncButton({ loading, onClick }: { loading?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        borderRadius: '10px',
        border: '1px solid #2d3a4b',
        background: loading ? '#14202d' : 'linear-gradient(180deg, rgba(32, 52, 72, 0.95) 0%, rgba(20, 31, 42, 1) 100%)',
        color: '#dcecff',
        fontSize: '12px',
        fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
      Sync Now
    </button>
  );
}

export function IntegrationLogs({ logs }: { logs: IntegrationLogItem[] }) {
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {logs.length === 0 ? (
        <div style={{ color: '#8a8a8a', fontSize: '13px' }}>No activity yet.</div>
      ) : logs.map((log) => (
        <div key={log.id} style={{ border: '1px solid #232323', borderRadius: '10px', padding: '12px', background: '#101010' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
            <strong style={{ color: '#f4f4f4', fontSize: '13px' }}>{log.event}</strong>
            <span style={{ color: '#777', fontSize: '11px' }}>{formatRelativeTime(log.createdAt)}</span>
          </div>
          <div style={{ color: '#a1a1a1', fontSize: '12px', lineHeight: 1.5 }}>{log.message}</div>
        </div>
      ))}
    </div>
  );
}

export function SettingsModal({
  open,
  integration,
  onClose,
  onSave,
  onTest,
}: {
  open: boolean;
  integration: IntegrationItem | null;
  onClose: () => void;
  onSave: (settings: Record<string, unknown>, enabled: boolean) => Promise<void>;
  onTest: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(true);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState('30');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [name, setName] = useState('Custom API');
  const [endpointUrl, setEndpointUrl] = useState('https://api.example.com');
  const [method, setMethod] = useState('GET');
  const [authType, setAuthType] = useState('none');
  const [authValue, setAuthValue] = useState('');
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [queryParams, setQueryParams] = useState('{\n}');
  const [bodyTemplate, setBodyTemplate] = useState('');

  useEffect(() => {
    if (!integration) return;
    const settings = integration.settings?.settingsJson ?? {};
    setEnabled(integration.settings?.enabled ?? true);
    setWebhookEnabled(integration.settings?.webhookEnabled ?? false);
    setSyncIntervalMinutes(String((settings as any).syncIntervalMinutes ?? 30));
    setName(String((settings as any).name ?? integration.name));
    setEndpointUrl(String((settings as any).endpointUrl ?? 'https://api.example.com'));
    setMethod(String((settings as any).method ?? 'GET'));
    setAuthType(String((settings as any).authType ?? 'none'));
    setAuthValue(String((settings as any).authValue ?? ''));
    setHeaders(JSON.stringify((settings as any).headers ?? { 'Content-Type': 'application/json' }, null, 2));
    setQueryParams(JSON.stringify((settings as any).queryParams ?? {}, null, 2));
    setBodyTemplate(String((settings as any).bodyTemplate ?? ''));
  }, [integration]);

  if (!open || !integration) return null;

  const isCustomApi = integration.provider === 'custom_api';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: 'min(840px, 100%)', maxHeight: '90vh', overflow: 'auto', background: 'linear-gradient(180deg, #151515 0%, #0f0f0f 100%)', border: '1px solid #252525', borderRadius: '18px', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid #232323' }}>
          <div>
            <div style={{ color: '#f4f4f4', fontSize: '16px', fontWeight: 800 }}>{integration.name} Settings</div>
            <div style={{ color: '#8a8a8a', fontSize: '12px', marginTop: '4px' }}>Configure sync, webhook, and API settings.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px', display: 'grid', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            <label style={{ display: 'grid', gap: '8px', color: '#d6d6d6', fontSize: '12px' }}>
              Enabled
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            </label>
            <label style={{ display: 'grid', gap: '8px', color: '#d6d6d6', fontSize: '12px' }}>
              Webhook Enabled
              <input type="checkbox" checked={webhookEnabled} onChange={(e) => setWebhookEnabled(e.target.checked)} />
            </label>
            <label style={{ display: 'grid', gap: '8px', color: '#d6d6d6', fontSize: '12px' }}>
              Sync Interval (minutes)
              <input value={syncIntervalMinutes} onChange={(e) => setSyncIntervalMinutes(e.target.value)} style={inputStyle} />
            </label>
          </div>

          {isCustomApi && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#f4f4f4' }}>Custom API Configuration</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="API Name" style={inputStyle} />
                <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://api.example.com" style={inputStyle} />
                <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option></select>
                <select value={authType} onChange={(e) => setAuthType(e.target.value)} style={inputStyle}><option value="none">No Auth</option><option value="bearer">Bearer Token</option><option value="api_key">API Key</option></select>
                <input value={authValue} onChange={(e) => setAuthValue(e.target.value)} placeholder="Auth token or API key" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <textarea value={headers} onChange={(e) => setHeaders(e.target.value)} rows={8} style={textareaStyle} placeholder='{"Content-Type":"application/json"}' />
                <textarea value={queryParams} onChange={(e) => setQueryParams(e.target.value)} rows={8} style={textareaStyle} placeholder='{}' />
              </div>
              <textarea value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} rows={8} style={textareaStyle} placeholder="Request body template" />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={async () => {
              try {
                if (isCustomApi) {
                  await onTest({ name, endpointUrl, method, authType, authValue, headers: JSON.parse(headers), queryParams: JSON.parse(queryParams), bodyTemplate });
                } else {
                  await onSave({ syncIntervalMinutes: Number(syncIntervalMinutes), webhookEnabled }, enabled);
                }
                toast.success('Settings saved');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Failed to save settings');
              }
            }} style={actionButtonStyle}>Save Changes</button>
            <button onClick={onClose} style={{ ...actionButtonStyle, background: '#151515', borderColor: '#333', color: '#ddd' }}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f0f0f',
  border: '1px solid #303030',
  borderRadius: '10px',
  color: '#fff',
  padding: '11px 12px',
  fontSize: '13px',
  outline: 'none',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '140px',
  fontFamily: 'inherit',
  resize: 'vertical',
};

const actionButtonStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1px solid #2f2f2f',
  background: 'linear-gradient(180deg, #2b2b2b 0%, #1a1a1a 100%)',
  color: '#fff',
  fontSize: '12px',
  fontWeight: 800,
  cursor: 'pointer',
};

export default function Integrations() {
  const [dashboard, setDashboard] = useState<{ integrations: IntegrationItem[]; logs: IntegrationLogItem[]; stats: { connected: number; total: number; failed: number; queuedJobs: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modalIntegration, setModalIntegration] = useState<IntegrationItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'connected'>('all');
  const [search, setSearch] = useState('');

  const refresh = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const data = await integrationsApi.getDashboard();
      setDashboard(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
    const source = integrationsApi.subscribeEvents(() => refresh(true));
    return () => source?.close();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const provider = params.get('provider');
    const error = params.get('error');
    if (connected && provider) toast.success(`${provider} connected successfully`);
    if (error) toast.error(decodeURIComponent(error));
    if (connected || error) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const items = (dashboard?.integrations ?? []).filter((item) => {
    if (filter === 'connected' && !item.connected) return false;
    if (!search.trim()) return true;
    return `${item.name} ${item.provider} ${item.accountLabel ?? ''}`.toLowerCase().includes(search.toLowerCase());
  });

  const handleConnect = async (integration: IntegrationItem) => {
    if (integration.provider === 'custom_api') {
      setModalIntegration(integration);
      return;
    }

    const key = `connect:${integration.provider}`;
    setActionLoading(key);
    try {
      const callbackUrl = `${window.location.origin}/api/v1/integrations/${integration.provider}/callback`;
      const { authorizationUrl } = await integrationsApi.connect(integration.provider, callbackUrl);
      window.location.href = authorizationUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to begin OAuth');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (integration: IntegrationItem) => {
    const key = `disconnect:${integration.provider}`;
    setActionLoading(key);
    try {
      await integrationsApi.disconnect(integration.provider);
      toast.success(`${integration.name} disconnected`);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Disconnect failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSync = async (integration: IntegrationItem) => {
    const key = `sync:${integration.provider}`;
    setActionLoading(key);
    try {
      await integrationsApi.sync(integration.provider);
      toast.success(`Sync started for ${integration.name}`);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveSettings = async (settings: Record<string, unknown>, enabled: boolean) => {
    if (!modalIntegration) return;
    await integrationsApi.saveSettings(modalIntegration.provider, settings, enabled);
    setModalIntegration(null);
    await refresh(true);
  };

  const handleTestCustomApi = async (payload: Record<string, unknown>) => {
    await integrationsApi.testCustomApi(payload);
    toast.success('Custom API test completed');
    setModalIntegration(null);
    await refresh(true);
  };

  const metaByKey = new Map(PROVIDER_META.map((provider) => [provider.key, provider]));

  return (
    <div style={{ color: '#fff' }}>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '30px', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '8px' }}>Integrations</div>
          <div style={{ color: '#9a9a9a', fontSize: '14px', maxWidth: '760px', lineHeight: 1.6 }}>
            Connect Cal.com, Calendly, Salesforce, Google, Slack, HubSpot, Genesys, and custom APIs with secure OAuth, logs, sync jobs, and webhook-driven updates.
          </div>
        </div>
        <button
          onClick={() => refresh(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', border: '1px solid #2e2e2e', background: 'linear-gradient(180deg, #1e1e1e 0%, #141414 100%)', color: '#f2f2f2', fontWeight: 700, cursor: 'pointer'
          }}
        >
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '18px' }}>
        {[
          { label: 'Connected', value: dashboard?.stats.connected ?? 0, icon: ShieldCheck },
          { label: 'Total Integrations', value: dashboard?.stats.total ?? 0, icon: PlugZap },
          { label: 'Failed Syncs', value: dashboard?.stats.failed ?? 0, icon: AlertTriangle },
          { label: 'Queued Jobs', value: dashboard?.stats.queuedJobs ?? 0, icon: Zap },
        ].map((stat) => (
          <div key={stat.label} style={{ background: 'linear-gradient(180deg, #141414 0%, #101010 100%)', border: '1px solid #232323', borderRadius: '16px', padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ color: '#9a9a9a', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
              <stat.icon size={16} color="#8b8b8b" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')} style={pillStyle(filter === 'all')}>All Integrations</button>
        <button onClick={() => setFilter('connected')} style={pillStyle(filter === 'connected')}>Connected</button>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search integrations" style={{ ...pillStyle(true), width: '100%', textAlign: 'left' }} />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '32px', border: '1px solid #222', borderRadius: '16px', background: '#101010', color: '#9a9a9a' }}>Loading integrations...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {items.map((integration) => {
            const meta = metaByKey.get(integration.provider) ?? { key: integration.provider, name: integration.name, description: '', mode: 'Post Call', accent: '#fff', tint: 'rgba(255,255,255,0.05)' };
            const connectLoading = actionLoading === `connect:${integration.provider}`;
            const disconnectLoading = actionLoading === `disconnect:${integration.provider}`;
            const syncLoading = actionLoading === `sync:${integration.provider}`;

            return (
              <div key={integration.provider} style={{
                background: 'linear-gradient(180deg, #151515 0%, #101010 100%)',
                border: '1px solid #222',
                borderRadius: '18px',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100%',
                overflow: 'hidden',
                transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = '#343434';
                e.currentTarget.style.boxShadow = `0 0 0 1px ${meta.tint}, 0 20px 40px rgba(0,0,0,0.35)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#222';
                e.currentTarget.style.boxShadow = 'none';
              }}
              >
                <div style={{ padding: '18px', display: 'grid', gap: '14px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: meta.tint, border: `1px solid ${meta.accent}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.accent, fontWeight: 900 }}>
                          {meta.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: '#f6f6f6' }}>{meta.name}</div>
                          <div style={{ color: '#8e8e8e', fontSize: '12px' }}>{integration.accountLabel ?? 'Not connected yet'}</div>
                        </div>
                      </div>
                      <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ padding: '5px 10px', borderRadius: '999px', border: `1px solid ${meta.mode === 'During Call' ? '#1f7a49' : '#215f9c'}`, color: meta.mode === 'During Call' ? '#7cf0ab' : '#7eb7ff', background: meta.mode === 'During Call' ? 'rgba(35, 209, 139, 0.12)' : 'rgba(59, 130, 246, 0.12)', fontSize: '11px', fontWeight: 800 }}>{meta.mode}</span>
                        <StatusBadge integration={integration} />
                      </div>
                    </div>
                    {integration.provider !== 'custom_api' && <ExternalLink size={15} color="#7d7d7d" />}
                  </div>

                  <p style={{ color: '#a3a3a3', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>{meta.description}</p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                    <MiniStat label="Last synced" value={formatRelativeTime(integration.lastSyncAt)} />
                    <MiniStat label="Webhook" value={integration.webhookEnabled ? 'Enabled' : 'Disabled'} />
                    <MiniStat label="Synced items" value={String(integration.lastSyncedCount ?? 0)} />
                    <MiniStat label="Token expiry" value={formatRelativeTime(integration.tokenExpiresAt)} />
                  </div>

                  {integration.lastError && (
                    <div style={{ border: '1px solid #5c2222', background: 'rgba(255, 80, 80, 0.08)', borderRadius: '12px', padding: '12px', color: '#ffb8b8', fontSize: '12px', lineHeight: 1.5 }}>
                      {integration.lastError}
                    </div>
                  )}

                  <div style={{ marginTop: 'auto', display: 'grid', gap: '10px' }}>
                    <IntegrationLogs logs={(integration.logs ?? []).slice(0, 2)} />
                  </div>
                </div>

                <div style={{ padding: '16px 18px', borderTop: '1px solid #222', display: 'flex', gap: '10px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {integration.connected ? (
                      <>
                        <button onClick={() => handleDisconnect(integration)} style={secondaryButtonStyle} disabled={disconnectLoading}>{disconnectLoading ? 'Disconnecting...' : 'Disconnect'}</button>
                        <SyncButton loading={syncLoading} onClick={() => handleSync(integration)} />
                      </>
                    ) : (
                      <OAuthButton loading={connectLoading} label={meta.ctaLabel ?? 'Connect'} onClick={() => handleConnect(integration)} />
                    )}
                  </div>
                  <button onClick={() => setModalIntegration(integration)} style={secondaryButtonStyle}>
                    <Settings2 size={14} /> Settings
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SettingsModal
        open={Boolean(modalIntegration)}
        integration={modalIntegration}
        onClose={() => setModalIntegration(null)}
        onSave={handleSaveSettings}
        onTest={handleTestCustomApi}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #232323', borderRadius: '12px', padding: '12px', background: '#111' }}>
      <div style={{ color: '#7d7d7d', fontSize: '11px', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: '#f4f4f4', fontSize: '13px', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: '999px',
    border: '1px solid #2d2d2d',
    background: active ? 'linear-gradient(180deg, #212121 0%, #161616 100%)' : '#111',
    color: active ? '#fff' : '#9f9f9f',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  };
}

const secondaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1px solid #303030',
  background: '#141414',
  color: '#e8e8e8',
  fontSize: '12px',
  fontWeight: 800,
  cursor: 'pointer',
};
