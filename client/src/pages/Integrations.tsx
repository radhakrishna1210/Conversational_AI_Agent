import { useEffect, useState } from 'react';
import { RefreshCw, Loader2, X, AlertCircle, ExternalLink, Plug, Zap, PlugZap, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { whapi } from '../lib/whapi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectField {
  name: string; label: string; placeholder: string;
  type: 'text' | 'password' | 'url' | 'select' | 'textarea'; options?: string[]; help?: string; optional?: boolean;
}

interface ProviderMeta {
  key: string; name: string; category: string; tab: string;
  connectType: 'oauth' | 'apikey' | 'webhook' | 'custom';
  connectFields: ConnectField[];
  logo: string; accent: string; tint: string;
  description: string; modalDescription: string;
  connectLabel: string; docsUrl: string; dashboardUrl?: string;
}

interface Integration {
  id: string; provider: string; name: string; status: string; connected: boolean;
  accountLabel?: string | null; lastSyncAt?: string | null; lastSyncedCount?: number;
  lastError?: string | null; webhookEnabled?: boolean; metadata?: Record<string, any>;
}

interface Dashboard {
  integrations: Integration[];
  stats: { connected: number; total: number; failed: number; queuedJobs: number };
}

// ─── Provider definitions ─────────────────────────────────────────────────────

const PROVIDERS: ProviderMeta[] = [
  {
    key: 'google_calendar', name: 'Google Calendar', category: 'During Call', tab: 'calendar',
    connectType: 'oauth',
    logo: '📅', accent: '#4285F4', tint: 'rgba(66,133,244,0.12)',
    description: 'Read calendars, create events, and automate scheduling during calls.',
    modalDescription: 'Connect Google Calendar to manage events and scheduling during AI calls.',
    connectLabel: 'Connect Google Calendar',
    dashboardUrl: 'https://calendar.google.com',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Google Calendar Integration', type: 'text' },
      { name: 'accessToken', label: 'OAuth Access Token', placeholder: 'ya29.a0A...', type: 'password', help: 'Only needed if OAuth redirect is unavailable. Get from Google OAuth Playground.', optional: true },
      { name: 'description', label: 'Description', placeholder: 'Manage Google Calendar events during AI calls.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/google-calendar',
  },
  {
    key: 'google_meet', name: 'Google Meet', category: 'During Call', tab: 'calendar',
    connectType: 'oauth',
    logo: '🎥', accent: '#00AC47', tint: 'rgba(0,172,71,0.12)',
    description: 'Auto-generate Google Meet links for scheduled meetings.',
    modalDescription: 'Connect Google Meet to auto-generate meeting links during AI conversations.',
    connectLabel: 'Connect Google Meet',
    dashboardUrl: 'https://meet.google.com',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Google Meet Integration', type: 'text' },
      { name: 'accessToken', label: 'OAuth Access Token', placeholder: 'ya29.a0A...', type: 'password', help: 'Only needed if OAuth redirect is unavailable.', optional: true },
      { name: 'description', label: 'Description', placeholder: 'Automatically create Google Meet links.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/google-meet',
  },
  {
    key: 'google_sheets', name: 'Google Sheets', category: 'Post Call', tab: 'calendar',
    connectType: 'oauth',
    logo: '📊', accent: '#0F9D58', tint: 'rgba(15,157,88,0.12)',
    description: 'Append call logs and reporting data to spreadsheets in real time.',
    modalDescription: 'Connect Google Sheets to read, write, and manage spreadsheet data through your AI assistant.',
    connectLabel: 'Connect with Google Sheets',
    dashboardUrl: 'https://docs.google.com/spreadsheets',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Google Sheets Integration', type: 'text' },
      { name: 'accessToken', label: 'OAuth Access Token', placeholder: 'ya29.a0A...', type: 'password', help: 'Only needed if OAuth redirect is unavailable.', optional: true },
      { name: 'sheetUrl', label: 'Google Sheet URL (Optional)', placeholder: 'https://docs.google.com/spreadsheets/d/...', type: 'url', help: 'Provide a specific sheet URL to optimize agent performance.', optional: true },
      { name: 'description', label: 'Description', placeholder: 'Log call data to Google Sheets in real time.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/google-sheets',
  },
  {
    key: 'cal', name: 'Cal.com', category: 'During Call', tab: 'calendar', connectType: 'apikey',
    logo: '📆', accent: '#111827', tint: 'rgba(55,65,81,0.2)',
    description: 'Let your AI agent schedule meetings and sync bookings in real time.',
    modalDescription: 'Connect Cal.com to allow your AI agent to check availability and book meetings on your behalf.',
    connectLabel: 'Connect with Cal.com',
    dashboardUrl: 'https://app.cal.com/event-types',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Cal.com Integration', type: 'text' },
      { name: 'apiKey', label: 'API Key', placeholder: 'cal_live_xxxxxxxxxxxxxxxx', type: 'password', help: 'cal.com → Settings → Developer → API Keys → Create new key' },
      { name: 'description', label: 'Description', placeholder: 'Schedule meetings and manage bookings automatically.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://docs.omnidim.io/docs/integrations/cal-com',
  },
  {
    key: 'calendly', name: 'Calendly', category: 'During Call', tab: 'calendar', connectType: 'apikey',
    logo: '🗓️', accent: '#006BFF', tint: 'rgba(0,107,255,0.12)',
    description: 'Book Calendly meetings directly from your voice AI agent during calls.',
    modalDescription: 'Connect Calendly to let your AI agent schedule meetings directly during conversations.',
    connectLabel: 'Connect with Calendly',
    dashboardUrl: 'https://calendly.com/event_types',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Calendly Integration', type: 'text' },
      { name: 'personalToken', label: 'Personal Access Token', placeholder: 'eyJra...', type: 'password', help: 'calendly.com → Integrations → API & Webhooks → Generate new token' },
      { name: 'description', label: 'Description', placeholder: 'Automatically schedule Calendly meetings during AI calls.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://docs.omnidim.io/docs/integrations/calendly',
  },
  {
    key: 'salesforce', name: 'Salesforce', category: 'Post Call', tab: 'calendar', connectType: 'apikey',
    logo: '☁️', accent: '#00A1E0', tint: 'rgba(0,161,224,0.12)',
    description: 'Push call transcripts, leads, and opportunities to your Salesforce CRM.',
    modalDescription: 'Connect Salesforce to automatically log calls, update leads, and manage opportunities post-call.',
    connectLabel: 'Connect with Salesforce',
    dashboardUrl: 'https://login.salesforce.com',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Salesforce Integration', type: 'text' },
      { name: 'instanceUrl', label: 'Instance URL', placeholder: 'https://yourorg.salesforce.com', type: 'url', help: 'Your Salesforce org URL from your browser address bar' },
      { name: 'accessToken', label: 'Access Token', placeholder: '00D...', type: 'password', help: 'Setup → Users → Your profile → Reset Security Token (sent to your email)' },
      { name: 'description', label: 'Description', placeholder: 'Log call outcomes and update CRM records automatically.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/salesforce-integration',
  },
  {
    key: 'hubspot', name: 'HubSpot', category: 'Post Call', tab: 'calendar', connectType: 'apikey',
    logo: '🔶', accent: '#FF7A59', tint: 'rgba(255,122,89,0.12)',
    description: 'Sync contacts, notes, and follow-up workflows post-call.',
    modalDescription: 'Connect HubSpot to automatically create contacts, log call notes, and trigger workflows.',
    connectLabel: 'Connect with HubSpot',
    dashboardUrl: 'https://app.hubspot.com',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My HubSpot Integration', type: 'text' },
      { name: 'accessToken', label: 'Private App Access Token', placeholder: 'pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', type: 'password', help: 'HubSpot → Settings → Integrations → Private Apps → Create app → copy token' },
      { name: 'description', label: 'Description', placeholder: 'Sync contacts and deals from AI call outcomes.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://www.omnidim.io/docs/guides/hubspot-integration',
  },
  {
    key: 'slack', name: 'Slack', category: 'Post Call', tab: 'messaging', connectType: 'apikey',
    logo: '💬', accent: '#E01E5A', tint: 'rgba(224,30,90,0.12)',
    description: 'Send real-time call alerts and summaries to your Slack workspace.',
    modalDescription: 'Connect Slack to receive real-time notifications, call summaries, and alerts in your channels.',
    connectLabel: 'Connect with Slack',
    dashboardUrl: 'https://slack.com/signin',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Slack Integration', type: 'text' },
      { name: 'botToken', label: 'Bot Token', placeholder: 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password', help: 'api.slack.com/apps → Your App → OAuth & Permissions → Bot User OAuth Token' },
      { name: 'channelId', label: 'Default Channel ID', placeholder: 'C01234ABCDE', type: 'text', help: 'Right-click channel → View channel details → Channel ID at the bottom', optional: true },
      { name: 'description', label: 'Description', placeholder: 'Receive call notifications and summaries in Slack.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/slack-integration',
  },
  {
    key: 'twilio', name: 'Twilio', category: 'During Call', tab: 'telephony', connectType: 'apikey',
    logo: '📞', accent: '#F22F46', tint: 'rgba(242,47,70,0.12)',
    description: 'Connect Twilio numbers and SMS for voice and text interactions.',
    modalDescription: 'Connect Twilio to enable SMS, voice calls, and phone number management for your AI agent.',
    connectLabel: 'Connect with Twilio',
    dashboardUrl: 'https://console.twilio.com',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Twilio Integration', type: 'text' },
      { name: 'accountSid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', type: 'text', help: 'console.twilio.com → Dashboard → Account SID' },
      { name: 'authToken', label: 'Auth Token', placeholder: 'your_auth_token_here', type: 'password', help: 'console.twilio.com → Dashboard → Auth Token (click to reveal)' },
      { name: 'description', label: 'Description', placeholder: 'Manage calls and SMS through Twilio.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/twilio',
  },
  {
    key: 'genesys', name: 'Genesys', category: 'During Call', tab: 'telephony', connectType: 'apikey',
    logo: '🎯', accent: '#FF6900', tint: 'rgba(255,105,0,0.12)',
    description: 'Integrate with Genesys contact center for intelligent call routing.',
    modalDescription: 'Connect Genesys Cloud to route calls intelligently and integrate with your contact center.',
    connectLabel: 'Connect with Genesys',
    dashboardUrl: 'https://login.mypurecloud.com',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Genesys Integration', type: 'text' },
      { name: 'clientId', label: 'OAuth Client ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', type: 'text', help: 'Genesys Cloud Admin → OAuth → Add Client → Grant Type: Client Credentials' },
      { name: 'clientSecret', label: 'OAuth Client Secret', placeholder: 'your_client_secret', type: 'password', help: 'Copy the secret shown when you create the OAuth client' },
      { name: 'region', label: 'Region', placeholder: 'mypurecloud.com', type: 'text', help: 'US: mypurecloud.com | EU: mypurecloud.ie | EU2: euw2.pure.cloud | AU: mypurecloud.com.au' },
      { name: 'description', label: 'Description', placeholder: 'Integrate Genesys for contact center routing.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/genesys',
  },
  {
    key: 'make', name: 'Make', category: 'Post Call', tab: 'automation', connectType: 'webhook',
    logo: '⚙️', accent: '#9B59B6', tint: 'rgba(155,89,182,0.12)',
    description: 'Trigger Make automations when calls complete via webhook.',
    modalDescription: 'Connect Make (formerly Integromat) to trigger powerful automated workflows when calls end.',
    connectLabel: 'Connect with Make',
    dashboardUrl: 'https://www.make.com/en/scenarios',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Make Integration', type: 'text' },
      { name: 'webhookUrl', label: 'Make Webhook URL', placeholder: 'https://hook.eu1.make.com/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', type: 'url', help: 'Make → Create Scenario → Webhooks module → Add webhook → copy URL' },
      { name: 'description', label: 'Description', placeholder: 'Trigger Make workflows on call completion.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/integration-with-automation-platforms',
  },
  {
    key: 'zapier', name: 'Zapier', category: 'Post Call', tab: 'automation', connectType: 'webhook',
    logo: '⚡', accent: '#FF4A00', tint: 'rgba(255,74,0,0.12)',
    description: 'Trigger Zapier workflows automatically when calls complete.',
    modalDescription: 'Connect Zapier to automate thousands of app connections when your AI calls finish.',
    connectLabel: 'Connect with Zapier',
    dashboardUrl: 'https://zapier.com/app/zaps',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Zapier Integration', type: 'text' },
      { name: 'webhookUrl', label: 'Zapier Webhook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/xxxxxxx/xxxxxxx/', type: 'url', help: 'Create a Zap → Trigger: Webhooks by Zapier → Catch Hook → copy URL' },
      { name: 'description', label: 'Description', placeholder: 'Automate tasks on call completion with Zapier.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/integration-with-automation-platforms',
  },
  {
    key: 'n8n', name: 'n8n', category: 'Post Call', tab: 'automation', connectType: 'webhook',
    logo: '🔁', accent: '#EA4B71', tint: 'rgba(234,75,113,0.12)',
    description: 'Connect n8n automation flows with post-call webhook events.',
    modalDescription: 'Connect n8n to build self-hosted or cloud automation workflows triggered by call events.',
    connectLabel: 'Connect with n8n',
    dashboardUrl: 'https://app.n8n.cloud',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My n8n Integration', type: 'text' },
      { name: 'webhookUrl', label: 'n8n Webhook URL', placeholder: 'https://your-n8n-instance.com/webhook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', type: 'url', help: 'n8n → Add Webhook node → set to POST → copy Production URL' },
      { name: 'description', label: 'Description', placeholder: 'Trigger n8n workflows on AI call events.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/integration-with-automation-platforms',
  },
  {
    key: 'ghl', name: 'GoHighLevel', category: 'Post Call', tab: 'automation', connectType: 'webhook',
    logo: '🚀', accent: '#00C951', tint: 'rgba(0,201,81,0.12)',
    description: 'Sync call data and contacts into GoHighLevel CRM.',
    modalDescription: 'Connect GoHighLevel to sync contacts, call outcomes, and trigger GHL automations post-call.',
    connectLabel: 'Connect with GoHighLevel',
    dashboardUrl: 'https://app.gohighlevel.com',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My GoHighLevel Integration', type: 'text' },
      { name: 'webhookUrl', label: 'GHL Webhook URL', placeholder: 'https://services.leadconnectorhq.com/hooks/xxxxxxxx/webhook-trigger/xxxxxxxx', type: 'url', help: 'GHL → Automation → Create Workflow → Webhook Trigger → copy URL' },
      { name: 'description', label: 'Description', placeholder: 'Sync call data and contacts to GoHighLevel.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://omnidim.io/docs/guides/integration-with-automation-platforms',
  },
  {
    key: 'custom_api', name: 'Custom API', category: 'During Call', tab: 'custom', connectType: 'custom',
    logo: '🔌', accent: '#A78BFA', tint: 'rgba(167,139,250,0.12)',
    description: 'Connect any REST API with custom auth, headers, and request format.',
    modalDescription: 'Connect any REST API endpoint. Configure authentication, method, and request format for your custom integration.',
    connectLabel: 'Save Custom API',
    connectFields: [
      { name: 'integrationName', label: 'Integration Name', placeholder: 'My Custom API Integration', type: 'text' },
      { name: 'endpointUrl', label: 'API Endpoint URL', placeholder: 'https://api.yourservice.com/webhook', type: 'url', help: 'The URL your agent will POST call data to' },
      { name: 'method', label: 'HTTP Method', placeholder: 'POST', type: 'select', options: ['POST', 'GET', 'PUT', 'PATCH'] },
      { name: 'authType', label: 'Authentication Type', placeholder: 'none', type: 'select', options: ['none', 'bearer', 'api_key'] },
      { name: 'authValue', label: 'Token / API Key', placeholder: 'sk-...', type: 'password', help: 'Leave empty if no authentication required', optional: true },
      { name: 'description', label: 'Description', placeholder: 'Describe what this API integration does.', type: 'textarea', optional: true },
    ],
    docsUrl: 'https://www.omnidim.io/docs/guides/custom-api',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const timeAgo = (v?: string | null) => {
  if (!v) return 'Never';
  const diff = Date.now() - new Date(v).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

// ─── Connect Modal ────────────────────────────────────────────────────────────

const TAB_LABELS: Record<string, string> = {
  all: 'All',
  calendar: 'Calendar & CRM',
  automation: 'Automation',
  telephony: 'Telephony',
  messaging: 'Messaging',
  custom: 'Custom & Tools',
  connected: 'Connected',
};

function ConnectModal({ provider, oauthAvailable, onClose, onConnected }: {
  provider: ProviderMeta; oauthAvailable: boolean; onClose: () => void; onConnected: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    integrationName: `My ${provider.name} Integration`,
    method: 'POST', authType: 'none',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [showManual, setShowManual] = useState(provider.connectType !== 'oauth' || !oauthAvailable);

  const set = (k: string, v: string) => setValues(prev => ({ ...prev, [k]: v }));

  const handleOAuthConnect = async () => {
    setSaving(true); setError('');
    try {
      const r = await whapi.post<any>(`/integrations/${provider.key}/connect`, {});
      if (r.authorizationUrl) {
        window.location.href = r.authorizationUrl;
        return;
      }
      throw new Error('OAuth redirect URL was not returned. Try manual token entry.');
    } catch (e: any) {
      setError(e.message || 'OAuth connection failed.');
      setShowManual(true);
    } finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      const payload = { ...values };
      Object.entries(payload).forEach(([key, value]) => {
        if (typeof value === 'string') payload[key] = value.trim();
      });

      if (provider.connectType === 'oauth' && !showManual) {
        await handleOAuthConnect();
        return;
      }

      if (provider.connectType === 'oauth' && showManual) {
        if (!payload.accessToken?.trim()) {
          throw new Error('OAuth access token is required for manual connection.');
        }
      }

      const result = await whapi.post<any>(`/integrations/${provider.key}/connect-token`, payload);
      if (result?.connected || result?.integration?.connected) {
        toast.success(`${provider.name} connected successfully!`);
        onConnected();
        onClose();
        return;
      }
      throw new Error('The server did not confirm the connection state.');
    } catch (e: any) {
      setError(e.message || 'Connection failed. Please check your credentials.');
    } finally { setSaving(false); }
  };

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#f2f2f2', padding: '11px 14px', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.2s',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: 'min(580px,100%)', maxHeight: '90vh', overflowY: 'auto', background: '#111', border: '1px solid #2a2a2a', borderRadius: '16px' }}>

        {/* Header */}
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: provider.tint, border: `1px solid ${provider.accent}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
              {provider.logo}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f2f2f2' }}>{provider.name} Integration</h2>
              <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#888', lineHeight: 1.5, maxWidth: '400px' }}>{provider.modalDescription}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'grid', gap: '20px' }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 14px', color: '#fca5a5', fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          {provider.connectType === 'oauth' && oauthAvailable && !showManual && (
            <div style={{ display: 'grid', gap: '14px' }}>
              <button
                onClick={handleOAuthConnect}
                disabled={saving}
                style={{ padding: '14px', borderRadius: '10px', border: 'none', background: provider.accent, color: '#fff', fontSize: '15px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
              >
                {saving ? <><Loader2 size={16} className="animate-spin" /> Redirecting…</> : <>Sign in with Google</>}
              </button>
              <button onClick={() => setShowManual(true)} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
                Or enter access token manually
              </button>
            </div>
          )}

          {(showManual || provider.connectType !== 'oauth') && provider.connectFields.map(field => (
            <div key={field.name}>
              <label style={{ display: 'block', color: '#d4d4d4', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                {field.label}{field.optional && <span style={{ color: '#666', fontWeight: 400 }}> (Optional)</span>}
              </label>

              {field.type === 'select' ? (
                <select value={values[field.name] ?? field.options?.[0] ?? ''} onChange={e => set(field.name, e.target.value)} style={{ ...inp }}>
                  {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={values[field.name] ?? ''}
                  onChange={e => set(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                  style={{ ...inp, resize: 'vertical', minHeight: '80px' }}
                />
              ) : (
                <input
                  type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                  value={values[field.name] ?? ''}
                  onChange={e => set(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  style={inp}
                  autoComplete="off"
                  onFocus={e => (e.currentTarget.style.borderColor = provider.accent)}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
              )}

              {field.help && <p style={{ margin: '6px 0 0', color: '#666', fontSize: '12px', lineHeight: 1.5 }}>{field.help}</p>}
            </div>
          ))}

          {/* Docs link */}
          <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer"
            style={{ color: provider.accent, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none', opacity: 0.85 }}>
            <ExternalLink size={13} /> View setup guide →
          </a>

          {/* Buttons */}
          {(showManual || provider.connectType !== 'oauth') && (
          <div style={{ display: 'flex', gap: '12px', paddingTop: '4px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '13px', borderRadius: '10px', border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#ccc', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{ flex: 2, padding: '13px', borderRadius: '10px', border: 'none', background: provider.key === 'custom_api' ? '#0eb39e' : provider.accent, color: '#fff', fontSize: '14px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {saving ? <><Loader2 size={16} className="animate-spin" /> Connecting…</> : provider.connectLabel}
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Integrations() {
  const [dashboard,  setDashboard]  = useState<Dashboard | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal,      setModal]      = useState<ProviderMeta | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [syncing,       setSyncing]       = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'calendar' | 'automation' | 'telephony' | 'messaging' | 'custom' | 'connected'>('all');
  const [search, setSearch] = useState('');
  const [callbackState, setCallbackState] = useState<{ type: 'success' | 'error'; provider?: string; message: string } | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState<Record<string, boolean>>({});

  const load = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [data, providersRes] = await Promise.all([
        whapi.get<Dashboard>('/integrations'),
        whapi.get<{ providers: Array<{ key: string; oauthAvailable?: boolean }> }>('/integrations/providers').catch(() => ({ providers: [] })),
      ]);
      setDashboard(data);
      const oauthMap: Record<string, boolean> = {};
      for (const p of providersRes.providers ?? []) {
        if (p.oauthAvailable) oauthMap[p.key] = true;
      }
      setOauthAvailable(oauthMap);
    } catch (e: any) {
      if (!silent) toast.error(e.message || 'Failed to load integrations');
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  // OAuth callback query params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const connected = p.get('connected'); const provider = p.get('provider'); const err = p.get('error');
    if (connected && provider) {
      const providerName = provider.replace(/_/g, ' ');
      const message = `${providerName.charAt(0).toUpperCase() + providerName.slice(1)} connected successfully.`;
      setCallbackState({ type: 'success', provider, message });
      toast.success(message);
      load(true);
    }
    if (err) {
      const message = decodeURIComponent(err);
      setCallbackState({ type: 'error', provider, message });
      toast.error(message);
    }
    if (connected || err) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // SSE live updates
  useEffect(() => {
    const wsId = localStorage.getItem('workspaceId');
    if (!wsId) return;
    const src = new EventSource(`/api/v1/workspaces/${wsId}/integrations/events`, { withCredentials: true });
    const refresh = () => load(true);
    ['integration:connected', 'integration:disconnected', 'integration:sync_completed', 'integration:sync_failed'].forEach(e => src.addEventListener(e, refresh));
    return () => src.close();
  }, []);

  const byProvider = new Map((dashboard?.integrations ?? []).map(i => [i.provider, i]));

  const visible = PROVIDERS.filter(p => {
    if (filter === 'connected') return byProvider.get(p.key)?.connected === true;
    if (filter !== 'all') return p.tab === filter;
    return true;
  }).filter(p => !search.trim() || `${p.name} ${p.category} ${TAB_LABELS[p.tab] ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  const handleDisconnect = async (key: string) => {
    setDisconnecting(key);
    try {
      await whapi.post(`/integrations/${key}/disconnect`, {});
      toast.success('Disconnected'); load(true);
    } catch (e: any) { toast.error(e.message); }
    finally { setDisconnecting(null); }
  };

  const handleSync = async (key: string, name: string) => {
    setSyncing(key);
    try {
      await whapi.post(`/integrations/${key}/sync`, {});
      toast.success(`${name} sync started`); load(true);
    } catch (e: any) { toast.error(e.message); }
    finally { setSyncing(null); }
  };

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
    border: `1px solid ${active ? '#0eb39e' : 'rgba(255,255,255,0.1)'}`,
    background: active ? 'rgba(14,179,158,0.1)' : 'transparent',
    color: active ? '#0eb39e' : '#888',
  });

  const connected = dashboard?.stats.connected ?? 0;

  return (
    <div style={{ color: '#e2e8f0' }}>

      {/* ── Header ── */}
      {callbackState && (
        <div style={{ marginBottom: '18px', padding: '14px 16px', borderRadius: '12px', border: callbackState.type === 'success' ? '1px solid rgba(74,222,128,0.25)' : '1px solid rgba(248,113,113,0.25)', background: callbackState.type === 'success' ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', color: callbackState.type === 'success' ? '#bbf7d0' : '#fecaca' }}>
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>{callbackState.type === 'success' ? 'Connected successfully' : 'Connection failed'}</div>
          <div style={{ fontSize: '13px', opacity: 0.95 }}>{callbackState.message}</div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em', color: '#f8fafc', marginBottom: '8px' }}>Integrations</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', maxWidth: '620px', lineHeight: 1.6, margin: 0 }}>
            Connect your AI agent with 15+ tools. Click <strong style={{ color: '#f8fafc' }}>Connect</strong> on any card, fill in your credentials, and your integration activates instantly — no code required.
          </p>
        </div>
        <button onClick={() => load(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#d4d4d4', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Connected',    val: connected,                         color: '#4ade80', icon: <ShieldCheck size={14} /> },
          { label: 'Available',    val: PROVIDERS.length,                  color: '#60a5fa', icon: <PlugZap size={14} />     },
          { label: 'Errors',       val: dashboard?.stats.failed ?? 0,      color: '#f87171', icon: <AlertTriangle size={14}/> },
          { label: 'Queued Jobs',  val: dashboard?.stats.queuedJobs ?? 0,  color: '#fbbf24', icon: <Zap size={14} />          },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {(Object.keys(TAB_LABELS) as Array<keyof typeof TAB_LABELS>).map(tab => (
          <button key={tab} onClick={() => setFilter(tab)} style={pill(filter === tab)}>
            {TAB_LABELS[tab]}{tab === 'all' ? ` (${PROVIDERS.length})` : tab === 'connected' ? ` (${connected})` : ''}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search integrations…"
          style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '13px', outline: 'none', minWidth: '180px' }} />
      </div>

      {/* ── Cards ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
          <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <p>Loading integrations…</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '16px' }}>
          {visible.length === 0 ? (
            <div style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: '#64748b', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '14px' }}>
              No integrations match your search.
            </div>
          ) : visible.map(meta => {
            const row = byProvider.get(meta.key);
            const isConnected = row?.connected ?? false;
            const isError     = row?.status === 'error' || !!row?.lastError;

            return (
              <div key={meta.key}
                style={{ background: 'linear-gradient(180deg,#141414 0%,#0e0e0e 100%)', border: `1px solid ${isConnected ? meta.accent + '50' : 'rgba(255,255,255,0.07)'}`, borderRadius: '14px', display: 'flex', flexDirection: 'column', transition: 'all 0.2s', overflow: 'hidden' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = meta.accent + '80'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = isConnected ? meta.accent + '50' : 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {/* Body */}
                <div style={{ padding: '18px 18px 14px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: meta.tint, border: `1px solid ${meta.accent}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                        {meta.logo}
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>{meta.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          {isConnected ? (row?.accountLabel ?? 'Connected') : 'Not connected'}
                        </div>
                      </div>
                    </div>
                    {/* Status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', background: isConnected ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isConnected ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.08)'}`, flexShrink: 0 }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isConnected ? '#4ade80' : '#555' }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: isConnected ? '#4ade80' : '#777', whiteSpace: 'nowrap' }}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </div>

                  {/* Category badge */}
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', color: meta.category === 'During Call' ? '#4ade80' : '#60a5fa', background: meta.category === 'During Call' ? 'rgba(74,222,128,0.1)' : 'rgba(96,165,250,0.1)', border: `1px solid ${meta.category === 'During Call' ? 'rgba(74,222,128,0.2)' : 'rgba(96,165,250,0.2)'}` }}>
                      {meta.category}
                    </span>
                  </div>

                  <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>{meta.description}</p>

                  {isError && row?.lastError && (
                    <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: '12px', lineHeight: 1.5 }}>
                      ⚠️ {row.lastError}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {isConnected ? (
                      <>
                        {meta.dashboardUrl && (
                          <a href={meta.dashboardUrl} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: `1px solid ${meta.accent}55`, background: meta.tint, color: meta.accent, fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                            <ExternalLink size={12} /> Open
                          </a>
                        )}
                        <button onClick={() => handleDisconnect(meta.key)} disabled={disconnecting === meta.key}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#ccc', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                          {disconnecting === meta.key && <Loader2 size={12} className="animate-spin" />}
                          Disconnect
                        </button>
                        <button onClick={() => handleSync(meta.key, meta.name)} disabled={syncing === meta.key}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: `1px solid ${meta.accent}55`, background: meta.tint, color: meta.accent, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          {syncing === meta.key ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          Sync
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setModal(meta)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: `1px solid ${meta.accent}66`, background: meta.tint, color: meta.accent, fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                        <Plug size={13} />
                        Connect
                      </button>
                    )}
                  </div>
                  <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#475569', display: 'inline-flex', alignItems: 'center' }} title="View docs">
                    <ExternalLink size={14} />
                  </a>
                </div>

                {/* Sync strip */}
                {isConnected && (
                  <div style={{ padding: '7px 18px', borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)', display: 'flex', gap: '20px' }}>
                    <span style={{ fontSize: '11px', color: '#475569' }}>Last synced: {timeAgo(row?.lastSyncAt)}</span>
                    <span style={{ fontSize: '11px', color: '#475569' }}>{row?.lastSyncedCount ?? 0} items synced</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Connect Modal ── */}
      {modal && (
        <ConnectModal
          provider={modal}
          oauthAvailable={!!oauthAvailable[modal.key]}
          onClose={() => setModal(null)}
          onConnected={() => { load(true); setModal(null); }}
        />
      )}
    </div>
  );
}
