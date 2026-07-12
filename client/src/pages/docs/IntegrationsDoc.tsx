import { Link } from 'react-router-dom';

// Content sourced from https://docs.omnidim.io/docs/integrations

const integrations = [
  {
    emoji: '⚙️',
    name: 'Custom API',
    badge: 'Universal',
    badgeColor: '#0eb39e',
    description: 'Wire your agent to anything that speaks HTTP. AI-generated parameters, auth headers, and dynamic payloads — the works.',
    to: '/integrations',
    highlight: true,
  },
  {
    emoji: '☁️',
    name: 'Salesforce',
    badge: 'CRM',
    badgeColor: '#60a5fa',
    description: 'Push extracted variables to Leads, Contacts, and Opportunities automatically after each call.',
    to: '/integrations',
  },
  {
    emoji: '🟠',
    name: 'HubSpot',
    badge: 'CRM',
    badgeColor: '#60a5fa',
    description: 'One-click OAuth. Sync post-call data into contacts, deals, and tickets.',
    to: '/integrations',
  },
  {
    emoji: '📅',
    name: 'Google Calendar',
    badge: 'Scheduling',
    badgeColor: '#a78bfa',
    description: 'OAuth scheduling with configurable business hours and meeting defaults.',
    to: '/integrations',
  },
  {
    emoji: '🗓️',
    name: 'Cal.com',
    badge: 'Scheduling',
    badgeColor: '#a78bfa',
    description: 'Automated meeting scheduling with calendar availability checks mid-conversation.',
    to: '/integrations',
  },
  {
    emoji: '💬',
    name: 'Slack',
    badge: 'Messaging',
    badgeColor: '#fbbf24',
    description: 'Real-time alerts, call summaries, and event-based notifications to your Slack channels.',
    to: '/integrations',
  },
  {
    emoji: '⚡',
    name: 'Make, Zapier, n8n, GHL',
    badge: 'Automation',
    badgeColor: '#f97316',
    description: 'Webhook + REST recipes for all major automation platforms — plug OmniDimension into existing flows.',
    to: '/integrations',
  },
];

const CodeBlock = ({ filename, code, lang = 'ts' }: { filename: string; code: string; lang?: string }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
    <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-elevated)' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f87171', display: 'inline-block' }} />
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} />
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{filename}</span>
      <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-light)', padding: '2px 8px', borderRadius: 'var(--radius-full)', textTransform: 'uppercase' }}>{lang}</span>
    </div>
    <pre style={{ margin: 0, padding: '18px 20px', background: 'var(--bg-secondary)', color: 'var(--teal)', fontSize: 13, overflowX: 'auto', fontFamily: '"Fira Code","Cascadia Code",monospace', lineHeight: 1.7 }}>
      <code>{code}</code>
    </pre>
  </div>
);

export default function IntegrationsDoc() {
  return (
    <>
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="breadcrumb">
          <Link to="/">Home</Link><span>›</span>
          <Link to="/documentation">Documentation</Link><span>›</span>
          <span style={{ color: 'var(--text-primary)' }}>Integrations</span>
        </div>
      </div>

      <div className="doc-hero" style={{ paddingBottom: 40 }}>
        <div className="badge" style={{ margin: '0 auto 16px' }}>⚡ Integrations</div>
        <h1 style={{ fontSize: 36, marginBottom: 14 }}>Integrations</h1>
        <p className="subtitle" style={{ maxWidth: 600, margin: '0 auto 24px' }}>
          Connect OmniDimension to anything. Custom API turns any REST endpoint into an agent action, plus prebuilt connectors for the platforms you already use.
        </p>
        <div className="doc-actions">
          <Link to="/integrations" className="btn btn-primary btn-lg">Manage Integrations →</Link>
          <Link to="/docs/knowledge-base" className="btn btn-secondary btn-lg">Knowledge Base →</Link>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: 80 }}>

        {/* Universal Connector highlight */}
        <section style={{ marginBottom: 40 }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(14,179,158,0.08), rgba(14,179,158,0.03))', border: '1px solid var(--teal)', borderRadius: 'var(--radius-lg)', padding: '28px 32px', display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 36 }}>🔌</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Universal connector — Custom API</h2>
                <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--teal-light)', color: 'var(--teal)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>ANY REST ENDPOINT</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 16px', lineHeight: 1.6 }}>
                If your tool has an API, your agent can use it. Custom API is the universal escape hatch — any REST endpoint becomes an action your agent can call mid-conversation.
              </p>
              <Link to="/integrations" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13 }}>
                Set up Custom API →
              </Link>
            </div>
          </div>
        </section>

        {/* All integrations grid */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Available connectors</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Prebuilt one-click OAuth connectors and automation platform recipes — use these when your tool is on the list.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {integrations.map(intg => (
              <Link key={intg.name} to={intg.to} style={{ textDecoration: 'none' }}>
                <div
                  className="doc-card animate-me"
                  style={{
                    cursor: 'pointer',
                    height: '100%',
                    border: intg.highlight ? '1px solid var(--teal)' : '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 22 }}>{intg.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{intg.name}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: intg.badgeColor, background: `${intg.badgeColor}18`, padding: '2px 7px', borderRadius: 'var(--radius-full)', border: `1px solid ${intg.badgeColor}30` }}>
                        {intg.badge}
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>{intg.description}</p>
                  <div className="learn-more">Set up →</div>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>Don't see your platform? </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Almost everything modern exposes a REST API. Use </span>
            <Link to="/integrations" style={{ color: 'var(--teal)', fontSize: 13 }}>Custom API</Link>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}> and you're connected — no waiting for a dedicated connector.</span>
          </div>
        </section>

        {/* Post-call actions */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Post-call actions</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Automatically trigger actions after every call — send summaries, update your CRM, or fire webhooks.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {['📧 Email', '🟠 HubSpot', '☁️ Salesforce', '💬 Slack', '🔗 Webhook', '📱 WhatsApp'].map(action => (
              <div key={action} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
                {action}
              </div>
            ))}
          </div>
        </section>

        {/* SDK example */}
        <section style={{ marginBottom: 60 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Connect via SDK</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            List and manage integrations, then attach them to agents programmatically.
          </p>
          <CodeBlock filename="integrations.ts" lang="TypeScript" code={`import OmniDimension from '@omnidim-ai/sdk';

const client = new OmniDimension({
  apiKey: process.env.OMNIDIM_API_KEY,
});

// List all connected integrations in the workspace
const integrations = await client.integrations.list();

// Attach integrations to an agent
await client.agents.update('your_agent_id', {
  integrationIds: [
    'int_google_cal_123',
    'int_hubspot_456',
  ],
});

// Trigger a manual sync
await client.integrations.sync('int_hubspot_456');`} />
        </section>

        <div className="cta-box animate-me">
          <div className="badge" style={{ margin: '0 auto 20px' }}>Connect Now</div>
          <h2>Supercharge your agents with integrations</h2>
          <p>Go to the Integrations dashboard to connect your CRM, calendar, and messaging tools with one click.</p>
          <Link to="/integrations" className="btn btn-primary btn-lg">Open Integrations →</Link>
        </div>
      </div>
    </>
  );
}
