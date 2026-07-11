import { Link } from 'react-router-dom';

// Content sourced from https://docs.omnidim.io/docs/bulk-calls
// and https://docs.omnidim.io/docs/dashboard-guides/recent-calls

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

const callStatuses = [
  { status: 'queued', color: '#fbbf24', description: 'Call is in the dispatch queue waiting to be placed.' },
  { status: 'ringing', color: '#60a5fa', description: 'Dial attempt is in progress.' },
  { status: 'in-progress', color: '#34d399', description: 'Call is actively connected.' },
  { status: 'completed', color: '#a78bfa', description: 'Call ended normally.' },
  { status: 'failed', color: '#f87171', description: 'Call failed to connect.' },
  { status: 'no-answer', color: '#f97316', description: 'Destination did not pick up.' },
];

export default function CallDoc() {
  return (
    <>
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="breadcrumb">
          <Link to="/">Home</Link><span>›</span>
          <Link to="/documentation">Documentation</Link><span>›</span>
          <span style={{ color: 'var(--text-primary)' }}>Calls & Campaigns</span>
        </div>
      </div>

      <div className="doc-hero" style={{ paddingBottom: 40 }}>
        <div className="badge" style={{ margin: '0 auto 16px' }}>📞 Calls & Campaigns</div>
        <h1 style={{ fontSize: 36, marginBottom: 14 }}>Bulk Calls</h1>
        <p className="subtitle" style={{ maxWidth: 580, margin: '0 auto 24px' }}>
          Run AI-powered outbound campaigns with retry logic, dynamic queues, and best practices for production deployment.
        </p>
        <div className="doc-actions">
          <Link to="/bulk_call/create" className="btn btn-primary btn-lg">Launch Campaign →</Link>
          <Link to="/call_logs" className="btn btn-secondary btn-lg">View Call Logs →</Link>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: 80 }}>

        {/* Campaign types */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Campaign types</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Choose between CSV-uploaded campaigns or webhook-driven Dynamic Campaigns for real-time contact delivery.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {[
              {
                icon: '📂',
                title: 'Bulk Call Campaign',
                badge: 'CSV upload',
                desc: 'Step-by-step walkthrough of creating a bulk campaign from CSV, scheduling, and managing it end to end.',
                to: '/bulk_call/create',
              },
              {
                icon: '🔄',
                title: 'Dynamic Campaign',
                badge: 'Webhook / API',
                desc: 'Long-running campaigns that accept contacts in real time via a webhook API. Ideal for CRM integrations.',
                to: '/bulk_call/create',
              },
              {
                icon: '📋',
                title: 'Best Practices',
                badge: 'Guide',
                desc: 'Optimization playbook: agent configuration, scheduling, retries, scaling, and analytics.',
                to: '/docs/call',
              },
            ].map(c => (
              <Link key={c.title} to={c.to} style={{ textDecoration: 'none' }}>
                <div className="doc-card animate-me" style={{ cursor: 'pointer', height: '100%' }}>
                  <div className="doc-card-icon">{c.icon}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <h3 style={{ margin: 0 }}>{c.title}</h3>
                    <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--teal-light)', color: 'var(--teal)', padding: '2px 7px', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap' }}>{c.badge}</span>
                  </div>
                  <p>{c.desc}</p>
                  <div className="learn-more">Learn more →</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Dispatch via SDK */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Dispatch calls via SDK</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Programmatically dispatch single outbound calls or bulk campaigns from your backend.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <CodeBlock filename="dispatch.ts" lang="TypeScript" code={`import OmniDimension from '@omnidim-ai/sdk';

const client = new OmniDimension({
  apiKey: process.env.OMNIDIM_API_KEY,
});

// Single outbound call
const call = await client.calls.dispatch({
  agentId: 'your_agent_id',
  to: '+14155552671',
  from: '+14155550001', // your provisioned number
  metadata: {
    customerId: 'cust_789',
    campaignId: 'spring_2026',
  },
});

console.log('Call ID:', call.id);
console.log('Status:', call.status); // "queued"`} />

            <CodeBlock filename="bulk-campaign.ts" lang="TypeScript" code={`// Bulk campaign from a contact list
const campaign = await client.calls.bulk({
  agentId: 'your_agent_id',
  contacts: [
    { to: '+14155552671', metadata: { name: 'Alice' } },
    { to: '+14155552672', metadata: { name: 'Bob'   } },
    // ... up to thousands of contacts
  ],
  scheduledAt: new Date('2026-08-01T09:00:00Z'),
  retries: 2,
});

console.log('Campaign:', campaign.id);
console.log('Total:', campaign.totalCount);`} />
          </div>
        </section>

        {/* Call statuses */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Call lifecycle</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>A call moves through these states during its lifecycle.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {callStatuses.map(s => (
              <div key={s.status} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                <span style={{ display: 'inline-block', padding: '3px 10px', background: `${s.color}18`, color: s.color, borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', marginBottom: 8, border: `1px solid ${s.color}30` }}>
                  {s.status}
                </span>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{s.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Calls & Analytics */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Recent calls & analytics</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Monitor all calls, listen to recordings, and review full transcripts from the Call Logs dashboard.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {[
              { icon: '📼', title: 'Recordings', desc: 'Listen to any call recording directly from the logs.' },
              { icon: '📝', title: 'Transcripts', desc: 'Full speaker-separated transcripts for every call.' },
              { icon: '📊', title: 'Analytics', desc: 'Call duration, outcomes, sentiment, and trends.' },
              { icon: '⚡', title: 'Post-call actions', desc: 'Auto-send summaries to Slack, HubSpot, Salesforce, or webhooks.' },
            ].map(f => (
              <div key={f.title} className="doc-card animate-me">
                <div className="doc-card-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Best Practices */}
        <section style={{ marginBottom: 60 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Bulk call best practices</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              'Configure your agent thoroughly before launching — test with a small batch first.',
              'Schedule calls during business hours for the recipient\'s timezone.',
              'Set retries to 1–2 to catch no-answers without spamming.',
              'Keep concurrency reasonable — start at 5–10 simultaneous calls and scale up.',
              'Review analytics after each campaign to refine your agent\'s conversational flow.',
              'Use metadata fields to carry CRM context into every call.',
            ].map(tip => (
              <div key={tip} style={{ display: 'flex', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '3px solid var(--teal)', borderRadius: 'var(--radius-sm)', padding: '12px 16px' }}>
                <span style={{ color: 'var(--teal)', fontWeight: 700 }}>✓</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{tip}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="cta-box animate-me">
          <div className="badge" style={{ margin: '0 auto 20px' }}>Launch Now</div>
          <h2>Ready to run your first campaign?</h2>
          <p>Use the Bulk Call dashboard to upload contacts and launch at scale in minutes.</p>
          <Link to="/bulk_call/create" className="btn btn-primary btn-lg">Start a Bulk Campaign →</Link>
        </div>
      </div>
    </>
  );
}
