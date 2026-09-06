import { Link } from 'react-router-dom';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { Plug, Calendar, Database, Phone, Zap } from 'lucide-react';

export default function UserIntegrations() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Channels & Integrations</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Integrations Ecosystem</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Connect your Voice AI agents directly to CRMs, calendar schedulers, automation platforms, messaging apps, and custom REST APIs.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Integration Architecture: In-Call vs. Post-Call"
        description="How external tools and CRMs interact with Spandan Voice AI agents during and after phone conversations."
        steps={[
          {
            badge: 'DURING CALL',
            title: 'In-Call Tool Calling',
            description: 'Agent queries live calendars (Cal.com, Google) or fetches customer CRM records mid-call.',
            icon: <Calendar size={16} />
          },
          {
            badge: 'CALL FINISH',
            title: 'Event Triggers',
            description: 'Call outcomes (Completed, Voicemail, Busy, Failed) initiate configured automations.',
            icon: <Zap size={16} />
          },
          {
            badge: 'DATA SYNC',
            title: 'CRM & Sheets Sync',
            description: 'Transcripts, extracted variables, and sentiment are written to Salesforce, HubSpot, or Sheets.',
            icon: <Database size={16} />
          },
          {
            badge: 'AUTOMATION',
            title: 'Workflow Webhooks',
            description: 'Dispatches structured payloads to Zapier, Make, n8n, Slack, or Custom REST APIs.',
            icon: <Plug size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Integration Ecosystem Directory</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        The <strong>Integrations</strong> hub (<code style={{ color: 'var(--teal-fg)' }}>/integrations</code>) provides native connectors organized into operational categories:
      </p>

      {/* Categories Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        
        {/* Calendar */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4285F4', fontWeight: 600, marginBottom: '8px' }}>
            <Calendar size={18} />
            <span>Calendar & Scheduling</span>
          </div>
          <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li><strong>Google Calendar:</strong> Check availability & book calendar events mid-call.</li>
            <li><strong>Google Meet:</strong> Auto-generate video meeting links for appointments.</li>
            <li><strong>Google Sheets:</strong> Log caller data & outcomes to spreadsheets.</li>
            <li><strong>Cal.com:</strong> Real-time event booking and slot verification.</li>
            <li><strong>Calendly:</strong> Schedule Calendly slots via personal access tokens.</li>
          </ul>
        </div>

        {/* CRM */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00A1E0', fontWeight: 600, marginBottom: '8px' }}>
            <Database size={18} />
            <span>CRM & Sales Platforms</span>
          </div>
          <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li><strong>Salesforce:</strong> Push call logs, transcripts, leads, and opportunities.</li>
            <li><strong>HubSpot:</strong> Create contacts, update deals, and append call notes.</li>
            <li><strong>GoHighLevel (GHL):</strong> Trigger workflows and sync contacts post-call.</li>
          </ul>
        </div>

        {/* Automation */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#EA4B71', fontWeight: 600, marginBottom: '8px' }}>
            <Zap size={18} />
            <span>Automation & Webhooks</span>
          </div>
          <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li><strong>Zapier:</strong> Connect call events to 5,000+ cloud applications.</li>
            <li><strong>Make (Integromat):</strong> Execute complex multi-branch scenarios.</li>
            <li><strong>n8n:</strong> Connect self-hosted and cloud n8n webhook nodes.</li>
            <li><strong>Custom REST API:</strong> Connect any custom HTTP webhook with auth.</li>
          </ul>
        </div>

        {/* Telephony */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F22F46', fontWeight: 600, marginBottom: '8px' }}>
            <Phone size={18} />
            <span>Telephony & Contact Centers</span>
          </div>
          <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li><strong>Twilio:</strong> Connect custom Twilio Account SIDs and phone lines.</li>
            <li><strong>Genesys Cloud:</strong> Intelligent contact center routing and transfers.</li>
            <li><strong>SIP Trunking (Vonage):</strong> Direct SIP connectivity for PBX systems.</li>
            <li><strong>Slack:</strong> Dispatch call notifications and alert channels.</li>
          </ul>
        </div>
      </div>

      <DocsImage
        src="/screenshots/Integrations.png"
        alt="Integrations Ecosystem Marketplace"
        caption="Integrations hub: browse native connectors for calendars, CRMs, webhooks, and telephony"
      />

      <DocsScreenshotPlaceholder
        title="Integrations Marketplace Hub"
        description="Comprehensive grid of all available integrations with connection status badges, category filters, and configuration modals."
        routePath="/integrations"
        elements={[
          { label: 'Category Tabs', value: 'All | Calendar | CRM | Automation | Telephony', type: 'button' },
          { label: 'Status Indicator', value: 'Connected (Green) | Not Configured (Gray)', type: 'badge' },
          { label: 'Connect Modal', value: 'API keys, OAuth tokens, and endpoint URLs', type: 'text' }
        ]}
      />

      {/* Step-by-Step Connection Guide */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Step-by-Step: Connecting an Integration</h2>

      <DocsImage
        src="/screenshots/integration_creation_popup.png"
        alt="Integration Connection Modal"
        caption="Integration configuration modal: enter credentials, API keys, and endpoint settings"
      />

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 12 }}>Example: Connecting Cal.com for In-Call Appointments</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Navigate to <strong>Integrations</strong> (<code style={{ color: 'var(--teal-fg)' }}>/integrations</code>).</li>
        <li>Locate the <strong>Cal.com</strong> card and click <strong>Connect</strong>.</li>
        <li>In the modal, enter:
          <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
            <li><strong>Integration Name:</strong> (e.g., <em>"Sales Team Cal.com"</em>)</li>
            <li><strong>API Key:</strong> Your Cal.com API key (obtained from Cal.com → Settings → Developer → API Keys).</li>
          </ul>
        </li>
        <li>Click <strong>Connect with Cal.com</strong>. The status badge updates to <strong style={{ color: 'var(--lime)' }}>Connected</strong>.</li>
        <li>Open your agent in <strong>Voice AI Assistants</strong> → <strong>Tab 4: Integrations</strong> and enable Cal.com. Your agent can now query calendar availability and book appointments live during calls.</li>
      </ol>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Example: Connecting Custom REST API Webhooks</h3>
      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>In the <strong>Custom API</strong> card, click <strong>Connect</strong>.</li>
        <li>Configure the endpoint properties:
          <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
            <li><strong>Endpoint URL:</strong> (e.g. <code style={{ color: 'var(--teal-fg)' }}>https://api.yourdomain.com/webhooks/call-ended</code>)</li>
            <li><strong>HTTP Method:</strong> POST, GET, PUT, or PATCH</li>
            <li><strong>Auth Type:</strong> None, Bearer Token, or API Key</li>
            <li><strong>Token / Secret:</strong> Encrypted securely at rest in the database.</li>
          </ul>
        </li>
        <li>Click <strong>Save Custom API</strong>. Spandan will dispatch the full structured JSON payload whenever a call completes.</li>
      </ol>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/whatsapp" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← WhatsApp Omnichannel
        </Link>
        <Link to="/docs/user/team" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Workspace & Team Settings →
        </Link>
      </div>
    </div>
  );
}
