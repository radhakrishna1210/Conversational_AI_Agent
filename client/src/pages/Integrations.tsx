import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Settings2, PlugZap, Zap, X, AlertTriangle, ShieldCheck, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { integrationsApi, type IntegrationItem, type IntegrationLogItem } from '../lib/integrationsApi';

// ─── Provider metadata ────────────────────────────────────────────────────────

type ProviderMeta = {
  key: string;
  name: string;
  description: string;
  mode: 'During Call' | 'Post Call';
  accent: string;
  tint: string;
  logo: string;      // emoji or letter fallback
  connectType: 'oauth' | 'webhook' | 'config';
};

const PROVIDER_META: ProviderMeta[] = [
  // ── Calendar / Scheduling ──
  { key: 'google_calendar', name: 'Google Calendar', description: 'Read calendars, create events, and automate scheduling reminders during live calls.', mode: 'During Call', accent: '#7cfd98', tint: 'rgba(124,253,152,0.12)', logo: '📅', connectType: 'oauth' },
  { key: 'google_meet',     name: 'Google Meet',     description: 'Automatically generate and share Google Meet links for scheduled meetings.', mode: 'During Call', accent: '#00ac47', tint: 'rgba(0,172,71,0.12)', logo: '🎥', connectType: 'oauth' },
  { key: 'cal',             name: 'Cal.com',          description: 'Allow your bot to schedule meetings and sync booking events in real time.', mode: 'During Call', accent: '#23d18b', tint: 'rgba(35,209,139,0.12)', logo: '📆', connectType: 'oauth' },
  { key: 'calendly',        name: 'Calendly',         description: 'Let your agent book meetings via Calendly during a call without leaving the conversation.', mode: 'During Call', accent: '#006bff', tint: 'rgba(0,107,255,0.12)', logo: '🗓️', connectType: 'oauth' },
  // ── CRM ──
  { key: 'salesforce',      name: 'Salesforce',       description: 'Push transcripts, notes, leads, and opportunities back to your CRM automatically after each call.', mode: 'Post Call', accent: '#7cc0ff', tint: 'rgba(124,192,255,0.12)', logo: '☁️', connectType: 'oauth' },
  { key: 'hubspot',         name: 'HubSpot',          description: 'Sync contacts, notes, tickets, and follow-up workflows automatically post-call.', mode: 'Post Call', accent: '#ff9f5a', tint: 'rgba(255,159,90,0.12)', logo: '🔶', connectType: 'oauth' },
  // ── Communication ──
  { key: 'slack',           name: 'Slack',            description: 'Send real-time alerts and call summaries directly to your Slack workspace channels.', mode: 'Post Call', accent: '#e01e5a', tint: 'rgba(224,30,90,0.12)', logo: '💬', connectType: 'oauth' },
  { key: 'twilio',          name: 'Twilio',           description: 'Connect Twilio numbers and SMS for seamless voice and text interactions.', mode: 'During Call', accent: '#f22f46', tint: 'rgba(242,47,70,0.12)', logo: '📞', connectType: 'oauth' },
  // ── Contact Center ──
  { key: 'genesys',         name: 'Genesys',          description: 'Integrate with Genesys contact center to route and manage calls intelligently.', mode: 'During Call', accent: '#ff6900', tint: 'rgba(255,105,0,0.12)', logo: '🎯', connectType: 'oauth' },
  // ── Data ──
  { key: 'google_sheets',   name: 'Google Sheets',    description: 'Append AI call logs and reporting data into spreadsheets in real time after calls.', mode: 'Post Call', accent: '#6ad4ff', tint: 'rgba(106,212,255,0.12)', logo: '📊', connectType: 'oauth' },
  // ── Automation platforms ──
  { key: 'make',            name: 'Make',             description: 'Send post-call data to Make (formerly Integromat) via webhook to trigger powerful automations.', mode: 'Post Call', accent: '#9b59b6', tint: 'rgba(155,89,182,0.12)', logo: '⚙️', connectType: 'webhook' },
  { key: 'zapier',          name: 'Zapier',           description: 'Trigger Zapier workflows automatically when a call completes using webhook delivery.', mode: 'Post Call', accent: '#ff4a00', tint: 'rgba(255,74,0,0.12)', logo: '⚡', connectType: 'webhook' },
  { key: 'n8n',             name: 'n8n',              description: 'Connect n8n self-hosted or cloud automation flows with post-call webhook events.', mode: 'Post Call', accent: '#ea4b71', tint: 'rgba(234,75,113,0.12)', logo: '🔁', connectType: 'webhook' },
  { key: 'ghl',             name: 'GoHighLevel',      description: 'Sync call data, contacts, and notes into your GoHighLevel CRM via webhook.', mode: 'Post Call', accent: '#00c951', tint: 'rgba(0,201,81,0.12)', logo: '🚀', connectType: 'webhook' },
  // ── Custom ──
  { key: 'custom_api',      name: 'Custom API',       description: 'Connect any REST endpoint. Configure auth, headers, and request templates for your own API.', mode: 'During Call', accent: '#a78bfa', tint: 'rgba(167,139,250,0.12)', logo: '🔌', connectType: 'config' },
];

const META_MAP = new Map(PROVIDER_META.map(p => [p.key, p]));

// ─── Helper functions ─────────────────────────────────────────────────────────

const formatRelativeTime = (value?: string | null) => {
  if (!value) return 'Never';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return 'Unknown';
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const getStatusTone = (integration: IntegrationItem) => {
  if (!integration.connected) return { label: 'Disconnected', color: '#888', bg: 'rgba(255,255,255,0.04)', border: '#2a2a2a' };
  if (integration.status === 'error' || integration.lastError) return { label: 'Error', color: '#ff8a8a', bg: 'rgba(255,80,80,0.1)', border: '#5c2222' };
  if (integration.status === 'syncing') return { label: 'Syncing…', color: '#7cc0ff', bg: 'rgba(59,130,246,0.1)', border: '#1e3a5f' };
  return { label: 'Connected', color: '#7cf0ab', bg: 'rgba(35,209,139,0.1)', border: '#1e4d30' };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ integration }: { integration: IntegrationItem }) {
  const tone = getStatusTone(integration);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, fontSize: '11px', fontWeight: 700 }}>
      <ShieldCheck size={11} />
      {tone.label}
    </span>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  const isDuring = mode === 'During Call';
  return (
    <span style={{ padding: '3px 9px', borderRadius: '999px', border: `1px solid ${isDuring ? '#1f5c38' : '#1e3a5f'}`, color: isDuring ? '#7cf0ab' : '#7eb7ff', background: isDuring ? 'rgba(35,209,139,0.1)' : 'rgba(59,130,246,0.1)', fontSize: '10px', fontWeight: 700 }}>
      {mode}
    </span>
  );
}

function WebhookSetupModal({ open, provider, onClose, onSave }: {
  open: boolean;
  provider: ProviderMeta | null;
  onClose: () => void;
  onSave: (webhookUrl: string) => void;
}) {
  const [webhookUrl, setWebhookUrl] = useState('');
  if (!open || !provider) return null;

  const inboundUrl = `${window.location.origin}/api/v1/integrations/webhooks/${provider.key}`;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: 'min(560px,100%)', background: 'linear-gradient(180deg,#151515 0%,#0f0f0f 100%)', border: '1px solid #252525', borderRadius: '18px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={{ color: '#f4f4f4', fontSize: '16px', fontWeight: 800 }}>Connect {provider.name}</div>
            <div style={{ color: '#8a8a8a', fontSize: '12px', marginTop: '4px' }}>Configure webhook integration</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ color: '#a78bfa', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>📥 Inbound Webhook URL (copy to {provider.name})</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <code style={{ flex: 1, background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '10px', color: '#d4d4d4', fontSize: '12px', wordBreak: 'break-all' }}>{inboundUrl}</code>
              <button onClick={() => { navigator.clipboard.writeText(inboundUrl); toast.success('Copied!'); }} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#ddd', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}>Copy</button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#d6d6d6', fontSize: '12px', marginBottom: '8px', fontWeight: 700 }}>
              📤 Your {provider.name} Webhook URL (optional — for outbound notifications)
            </label>
            <input
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder={`https://hook.${provider.key}.com/...`}
              style={{ width: '100%', background: '#0f0f0f', border: '1px solid #303030', borderRadius: '10px', color: '#fff', padding: '11px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ background: 'rgba(35,209,139,0.05)', border: '1px solid rgba(35,209,139,0.15)', borderRadius: '10px', padding: '12px', color: '#7cf0ab', fontSize: '12px', lineHeight: 1.6 }}>
            <strong>How to connect:</strong><br />
            1. Copy the Inbound Webhook URL above<br />
            2. Paste it as the webhook destination in your {provider.name} workflow<br />
            3. Click Save below to activate the integration
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => onSave(webhookUrl)} style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #2f2f2f', background: 'linear-gradient(180deg,#2b2b2b 0%,#1a1a1a 100%)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              Save &amp; Activate
            </button>
            <button onClick={onClose} style={{ padding: '11px 20px', borderRadius: '10px', border: '1px solid #333', background: '#151515', color: '#ddd', fontSize: '13px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ open, integration, onClose, onSave, onTest }: {
  open: boolean;
  integration: IntegrationItem | null;
  onClose: () => void;
  onSave: (settings: Record<string, unknown>, enabled: boolean) => Promise<void>;
  onTest: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(true);
  const [syncInterval, setSyncInterval] = useState('30');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [name, setName] = useState('Custom API');
  const [endpointUrl, setEndpointUrl] = useState('https://api.example.com');
  const [method, setMethod] = useState('GET');
  const [authType, setAuthType] = useState('none');
  const [authValue, setAuthValue] = useState('');
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [queryParams, setQueryParams] = useState('{\n}');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!integration) return;
    const s = integration.settings?.settingsJson ?? {};
    setEnabled(integration.settings?.enabled ?? true);
    setWebhookEnabled(integration.settings?.webhookEnabled ?? false);
    setSyncInterval(String((s as any).syncIntervalMinutes ?? 30));
    setName(String((s as any).name ?? integration.name));
    setEndpointUrl(String((s as any).endpointUrl ?? 'https://api.example.com'));
    setMethod(String((s as any).method ?? 'GET'));
    setAuthType(String((s as any).authType ?? 'none'));
    setAuthValue('');
    setHeaders(JSON.stringify((s as any).headers ?? { 'Content-Type': 'application/json' }, null, 2));
    setQueryParams(JSON.stringify((s as any).queryParams ?? {}, null, 2));
    setBodyTemplate(String((s as any).bodyTemplate ?? ''));
  }, [integration]);

  if (!open || !integration) return null;
  const isCustom = integration.provider === 'custom_api';
  const inp: React.CSSProperties = { width: '100%', background: '#0f0f0f', border: '1px solid #303030', borderRadius: '10px', color: '#fff', padding: '10px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: 'min(760px,100%)', maxHeight: '90vh', overflow: 'auto', background: 'linear-gradient(180deg,#151515 0%,#0f0f0f 100%)', border: '1px solid #252525', borderRadius: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid #232323' }}>
          <div>
            <div style={{ color: '#f4f4f4', fontSize: '16px', fontWeight: 800 }}>{integration.name} Settings</div>
            <div style={{ color: '#8a8a8a', fontSize: '12px', marginTop: '4px' }}>Configure sync, webhook, and API options.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px', display: 'grid', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#d6d6d6', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              Integration Enabled
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#d6d6d6', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={webhookEnabled} onChange={e => setWebhookEnabled(e.target.checked)} />
              Webhook Enabled
            </label>
            <label style={{ display: 'grid', gap: '6px', color: '#d6d6d6', fontSize: '12px' }}>
              Sync Interval (minutes)
              <input value={syncInterval} onChange={e => setSyncInterval(e.target.value)} style={inp} />
            </label>
          </div>

          {isCustom && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#f4f4f4', borderTop: '1px solid #222', paddingTop: '12px' }}>Custom API Configuration</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '6px', color: '#d6d6d6', fontSize: '12px' }}>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="My API" style={inp} /></label>
                <label style={{ display: 'grid', gap: '6px', color: '#d6d6d6', fontSize: '12px' }}>Endpoint URL<input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="https://api.example.com/endpoint" style={inp} /></label>
                <label style={{ display: 'grid', gap: '6px', color: '#d6d6d6', fontSize: '12px' }}>Method<select value={method} onChange={e => setMethod(e.target.value)} style={inp}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label>
                <label style={{ display: 'grid', gap: '6px', color: '#d6d6d6', fontSize: '12px' }}>Auth Type<select value={authType} onChange={e => setAuthType(e.target.value)} style={inp}><option value="none">No Auth</option><option value="bearer">Bearer Token</option><option value="api_key">API Key</option></select></label>
                {authType !== 'none' && <label style={{ display: 'grid', gap: '6px', color: '#d6d6d6', fontSize: '12px' }}>Auth Value<input value={authValue} onChange={e => setAuthValue(e.target.value)} type="password" placeholder="Token / API Key" style={inp} /></label>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'grid', gap: '6px', color: '#d6d6d6', fontSize: '12px' }}>Headers (JSON)<textarea value={headers} onChange={e => setHeaders(e.target.value)} rows={6} style={{ ...inp, minHeight: '120px', resize: 'vertical', fontFamily: 'monospace' }} /></label>
                <label style={{ display: 'grid', gap: '6px', color: '#d6d6d6', fontSize: '12px' }}>Query Params (JSON)<textarea value={queryParams} onChange={e => setQueryParams(e.target.value)} rows={6} style={{ ...inp, minHeight: '120px', resize: 'vertical', fontFamily: 'monospace' }} /></label>
              </div>
              <label style={{ display: 'grid', gap: '6px', color: '#d6d6d6', fontSize: '12px' }}>
                Body Template
                <textarea value={bodyTemplate} onChange={e => setBodyTemplate(e.target.value)} rows={5} placeholder='{"key": "{{variable}}"}' style={{ ...inp, minHeight: '100px', resize: 'vertical', fontFamily: 'monospace' }} />
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button disabled={saving} onClick={async () => {
              setSaving(true);
              try {
                if (isCustom) {
                  await onTest({ name, endpointUrl, method, authType, authValue, headers: JSON.parse(headers), queryParams: JSON.parse(queryParams), bodyTemplate });
                } else {
                  await onSave({ syncIntervalMinutes: Number(syncInterval), webhookEnabled }, enabled);
                }
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed');
              } finally { setSaving(false); }
            }} style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #2f2f2f', background: 'linear-gradient(180deg,#2b2b2b 0%,#1a1a1a 100%)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving…' : isCustom ? 'Test & Save' : 'Save Changes'}
            </button>
            <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #333', background: '#151515', color: '#ddd', fontSize: '13px', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Integrations() {
  const [dashboard, setDashboard] = useState<{
    integrations: IntegrationItem[];
    logs: IntegrationLogItem[];
    stats: { connected: number; total: number; failed: number; queuedJobs: number };
  } | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [actionKey,    setActionKey]    = useState<string | null>(null);
  const [settingsItem, setSettingsItem] = useState<IntegrationItem | null>(null);
  const [webhookItem,  setWebhookItem]  = useState<ProviderMeta | null>(null);
  const [filter,       setFilter]       = useState<'all' | 'during' | 'post' | 'connected'>('all');
  const [search,       setSearch]       = useState('');

  const refresh = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const data = await integrationsApi.getDashboard();
      setDashboard(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
    const src = integrationsApi.subscribeEvents(() => refresh(true));
    return () => src?.close();
  }, []);

  // Handle OAuth callback query params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const connected = p.get('connected');
    const provider  = p.get('provider');
    const error     = p.get('error');
    if (connected && provider) toast.success(`${provider} connected successfully!`);
    if (error)                 toast.error(decodeURIComponent(error));
    if (connected || error)    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Build display list from PROVIDER_META order, merging DB state
  const byProvider = new Map((dashboard?.integrations ?? []).map(i => [i.provider, i]));

  const items = PROVIDER_META.filter(meta => {
    if (filter === 'during')    return meta.mode === 'During Call';
    if (filter === 'post')      return meta.mode === 'Post Call';
    if (filter === 'connected') {
      const item = byProvider.get(meta.key);
      return item?.connected;
    }
    return true;
  }).filter(meta => {
    if (!search.trim()) return true;
    return `${meta.name} ${meta.key} ${meta.mode}`.toLowerCase().includes(search.toLowerCase());
  });

  // ── Action handlers ──────────────────────────────────────────────────────

  const handleConnect = async (meta: ProviderMeta) => {
    const existing = byProvider.get(meta.key) as IntegrationItem | undefined;

    // Webhook / config providers — open setup modal
    if (meta.connectType === 'webhook') {
      setWebhookItem(meta);
      return;
    }
    if (meta.connectType === 'config') {
      setSettingsItem(existing ?? { id: meta.key, provider: meta.key, name: meta.name, status: 'disconnected', connected: false });
      return;
    }

    // OAuth providers
    const key = `connect:${meta.key}`;
    setActionKey(key);
    try {
      const callbackUrl = `${window.location.origin}/api/v1/integrations/${meta.key}/callback`;
      const result = await integrationsApi.connect(meta.key, callbackUrl) as any;
      if (result.requiresWebhookConfig) {
        toast.success(`${meta.name} activated`);
        await refresh(true);
        return;
      }
      window.location.href = result.authorizationUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setActionKey(null);
    }
  };

  const handleDisconnect = async (meta: ProviderMeta) => {
    const key = `disconnect:${meta.key}`;
    setActionKey(key);
    try {
      await integrationsApi.disconnect(meta.key);
      toast.success(`${meta.name} disconnected`);
      await refresh(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setActionKey(null);
    }
  };

  const handleSync = async (meta: ProviderMeta) => {
    const key = `sync:${meta.key}`;
    setActionKey(key);
    try {
      await integrationsApi.sync(meta.key);
      toast.success(`Sync started for ${meta.name}`);
      await refresh(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setActionKey(null);
    }
  };

  const handleWebhookSave = async (webhookUrl: string) => {
    if (!webhookItem) return;
    try {
      await integrationsApi.connect(webhookItem.key, undefined);
      await integrationsApi.saveSettings(webhookItem.key, { webhookUrl, webhookEnabled: true }, true);
      toast.success(`${webhookItem.name} connected via webhook`);
      setWebhookItem(null);
      await refresh(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save webhook');
    }
  };

  const handleSaveSettings = async (settings: Record<string, unknown>, enabled: boolean) => {
    if (!settingsItem) return;
    await integrationsApi.saveSettings(settingsItem.provider, settings, enabled);
    toast.success('Settings saved');
    setSettingsItem(null);
    await refresh(true);
  };

  const handleTestCustomApi = async (payload: Record<string, unknown>) => {
    const result = await integrationsApi.testCustomApi(payload) as any;
    toast.success(`Test ${result.ok ? 'succeeded' : 'failed'} (HTTP ${result.status})`);
    setSettingsItem(null);
    await refresh(true);
  };

  // ── Styles ───────────────────────────────────────────────────────────────

  const pillBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: '999px',
    border: `1px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
    background: active ? 'rgba(14,179,158,0.1)' : 'var(--bg-card)',
    color: active ? 'var(--teal)' : 'var(--text-secondary)',
    fontSize: '12px', fontWeight: 700, cursor: 'pointer',
  });

  const connectedCount = dashboard?.stats.connected ?? 0;
  const totalCount     = PROVIDER_META.length;
  const failedCount    = dashboard?.stats.failed ?? 0;
  const queuedCount    = dashboard?.stats.queuedJobs ?? 0;

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '8px' }}>Integrations</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '680px', lineHeight: 1.6 }}>
            Connect your AI agent with 15+ tools — Google, Salesforce, HubSpot, Slack, Twilio, Make, Zapier, n8n, GoHighLevel, and more. All secured with OAuth and encrypted token storage.
          </p>
        </div>
        <button onClick={() => refresh(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Connected', value: connectedCount, icon: ShieldCheck, color: '#7cf0ab' },
          { label: 'Available', value: totalCount,     icon: PlugZap,     color: '#7cc0ff' },
          { label: 'Errors',    value: failedCount,    icon: AlertTriangle, color: '#ff8a8a' },
          { label: 'Queued Jobs', value: queuedCount,  icon: Zap,         color: '#fde68a' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
              <s.icon size={14} color={s.color} />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setFilter('all')}       style={pillBtn(filter === 'all')}>All ({PROVIDER_META.length})</button>
        <button onClick={() => setFilter('during')}    style={pillBtn(filter === 'during')}>During Call</button>
        <button onClick={() => setFilter('post')}      style={pillBtn(filter === 'post')}>Post Call</button>
        <button onClick={() => setFilter('connected')} style={pillBtn(filter === 'connected')}>Connected ({connectedCount})</button>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search integrations…"
          style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', minWidth: '200px' }}
        />
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: '16px', color: 'var(--text-muted)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <p>Loading integrations…</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '16px' }}>
          {items.map(meta => {
            const integration = byProvider.get(meta.key) as IntegrationItem | undefined;
            const isConnected = integration?.connected ?? false;
            const isError     = integration?.status === 'error' || !!integration?.lastError;
            const connectLoading    = actionKey === `connect:${meta.key}`;
            const disconnectLoading = actionKey === `disconnect:${meta.key}`;
            const syncLoading       = actionKey === `sync:${meta.key}`;

            return (
              <div key={meta.key}
                style={{ background: 'linear-gradient(180deg,#151515 0%,#101010 100%)', border: `1px solid ${isConnected ? meta.accent + '33' : '#222'}`, borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'all 0.2s ease' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = meta.accent + '55'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.3)`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = isConnected ? meta.accent + '33' : '#222'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {/* Card header */}
                <div style={{ padding: '18px 18px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: meta.tint, border: `1px solid ${meta.accent}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                        {meta.logo}
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#f6f6f6', lineHeight: 1.2 }}>{meta.name}</div>
                        <div style={{ fontSize: '12px', color: '#777', marginTop: '2px' }}>
                          {isConnected ? (integration?.accountLabel ?? 'Connected') : 'Not connected'}
                        </div>
                      </div>
                    </div>
                    {meta.connectType === 'webhook' && <Webhook size={14} color="#666" />}
                    {meta.connectType === 'oauth'   && <ExternalLink size={14} color="#666" />}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <ModeBadge mode={meta.mode} />
                    {integration && <StatusBadge integration={integration} />}
                    {meta.connectType === 'webhook' && (
                      <span style={{ padding: '3px 9px', borderRadius: '999px', border: '1px solid #333', color: '#888', fontSize: '10px', fontWeight: 700 }}>Webhook</span>
                    )}
                  </div>

                  <p style={{ color: '#a3a3a3', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>{meta.description}</p>

                  {isError && integration?.lastError && (
                    <div style={{ marginTop: '10px', border: '1px solid #5c2222', background: 'rgba(255,80,80,0.07)', borderRadius: '8px', padding: '10px', color: '#ffb8b8', fontSize: '12px', lineHeight: 1.5 }}>
                      {integration.lastError}
                    </div>
                  )}
                </div>

                {/* Card footer */}
                <div style={{ padding: '12px 18px', borderTop: '1px solid #1e1e1e', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {isConnected ? (
                      <>
                        <button onClick={() => handleDisconnect(meta)} disabled={disconnectLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#ddd', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          {disconnectLoading ? <Loader2 size={12} className="animate-spin" /> : null}
                          Disconnect
                        </button>
                        <button onClick={() => handleSync(meta)} disabled={syncLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #2d3a4b', background: 'rgba(32,52,72,0.9)', color: '#dcecff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          {syncLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          Sync
                        </button>
                      </>
                    ) : (
                      <button onClick={() => handleConnect(meta)} disabled={connectLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '8px', border: `1px solid ${meta.accent}44`, background: `linear-gradient(135deg, ${meta.tint}, rgba(0,0,0,0.3))`, color: meta.accent, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        {connectLoading ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
                        {meta.connectType === 'webhook' ? 'Setup Webhook' : meta.connectType === 'config' ? 'Configure' : 'Connect'}
                      </button>
                    )}
                  </div>

                  <button onClick={() => setSettingsItem(integration ?? { id: meta.key, provider: meta.key, name: meta.name, status: 'disconnected', connected: false })}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#888', fontSize: '12px', cursor: 'pointer' }}>
                    <Settings2 size={13} />
                    Settings
                  </button>
                </div>

                {/* Last sync row */}
                {isConnected && (
                  <div style={{ padding: '8px 18px', borderTop: '1px solid #1a1a1a', display: 'flex', gap: '20px', background: 'rgba(255,255,255,0.015)' }}>
                    <span style={{ color: '#666', fontSize: '11px' }}>Synced {formatRelativeTime(integration?.lastSyncAt)}</span>
                    <span style={{ color: '#666', fontSize: '11px' }}>{integration?.lastSyncedCount ?? 0} items</span>
                    <span style={{ color: '#666', fontSize: '11px' }}>Webhook: {integration?.webhookEnabled ? '✅' : '—'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <WebhookSetupModal
        open={Boolean(webhookItem)}
        provider={webhookItem}
        onClose={() => setWebhookItem(null)}
        onSave={handleWebhookSave}
      />
      <SettingsModal
        open={Boolean(settingsItem)}
        integration={settingsItem}
        onClose={() => setSettingsItem(null)}
        onSave={handleSaveSettings}
        onTest={handleTestCustomApi}
      />
    </div>
  );
}
