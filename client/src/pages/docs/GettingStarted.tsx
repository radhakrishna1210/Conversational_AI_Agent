import { Link } from 'react-router-dom';

// Content sourced from https://docs.omnidim.io/docs/get-started/quickstart
// and https://docs.omnidim.io/docs/get-started/authentication

const CodeBlock = ({ filename, code, lang = 'ts' }: { filename: string; code: string; lang?: string }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
    <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-elevated)' }}>
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

const StepCard = ({ num, title, children }: { num: number; title: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
    <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'var(--teal-light)', border: '1px solid var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', fontWeight: 800, fontSize: 14 }}>{num}</div>
    <div style={{ flex: 1 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 10px' }}>{title}</h3>
      {children}
    </div>
  </div>
);

export default function GettingStarted() {
  return (
    <>
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="breadcrumb">
          <Link to="/">Home</Link><span>›</span>
          <Link to="/documentation">Documentation</Link><span>›</span>
          <span style={{ color: 'var(--text-primary)' }}>Quickstart</span>
        </div>
      </div>

      <div className="doc-hero" style={{ paddingBottom: 40 }}>
        <div className="badge" style={{ margin: '0 auto 16px' }}>📱 Get Started</div>
        <h1 style={{ fontSize: 36, marginBottom: 14 }}>Quickstart</h1>
        <p className="subtitle" style={{ maxWidth: 560, margin: '0 auto 24px' }}>
          Build with OmniDimension from your backend, or the dashboard. First request in five minutes.
        </p>
        <div className="doc-actions">
          <Link to="/dashboard" className="btn btn-primary btn-lg">Open Dashboard →</Link>
          <Link to="/api_keys" className="btn btn-secondary btn-lg">Get API Key →</Link>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: 80 }}>

        {/* Choose how to build */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Pick how you want to build</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
            OmniDimension works from your backend via SDK, or directly from the dashboard — no code required.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {[
              { icon: '🟦', title: 'TypeScript SDK', desc: 'Call the API from a Node.js backend.', badge: 'npm install @omnidim-ai/sdk' },
              { icon: '🐍', title: 'Python SDK', desc: 'Call the API from a Python backend.', badge: 'pip install omnidim' },
              { icon: '🌐', title: 'REST API', desc: 'Call the HTTP endpoints directly.', badge: 'curl / fetch' },
              { icon: '🖥️', title: 'Dashboard', desc: 'Create and manage agents with no code.', badge: 'omnidim.io/agents' },
            ].map(c => (
              <div key={c.title} className="doc-card animate-me">
                <div className="doc-card-icon">{c.icon}</div>
                <h3>{c.title}</h3>
                <p>{c.desc}</p>
                <code style={{ fontSize: 11, color: 'var(--teal)', background: 'var(--teal-light)', padding: '3px 8px', borderRadius: 4 }}>{c.badge}</code>
              </div>
            ))}
          </div>
        </section>

        {/* Your first request */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Your first request</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
            Get an API key from the <Link to="/api_keys" style={{ color: 'var(--teal)' }}>API Keys page</Link> in your dashboard, store it as <code style={{ color: 'var(--teal)', background: 'var(--teal-light)', padding: '1px 6px', borderRadius: 4 }}>OMNIDIM_API_KEY</code>, then list your agents:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <CodeBlock filename="index.ts" lang="TypeScript" code={`npm install @omnidim-ai/sdk`} />
            <CodeBlock filename="index.ts" lang="TypeScript" code={`import OmniDimension from '@omnidim-ai/sdk';

const client = new OmniDimension({
  apiKey: process.env.OMNIDIM_API_KEY,
});

const agents = await client.agents.list();
console.log(agents);`} />
          </div>
          <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--bg-card)', border: '1px solid var(--teal)', borderLeft: '3px solid var(--teal)', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 13 }}>✓ Success: </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>A list of agents means your key works. An authentication error means the key is wrong or unset — check your <Link to="/api_keys" style={{ color: 'var(--teal)' }}>API Keys</Link>.</span>
          </div>
        </section>

        {/* Authentication */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Authentication</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Store your API key as an environment variable — never hardcode it in source files.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Linux / macOS', code: 'export OMNIDIM_API_KEY="your_api_key_here"' },
              { label: 'Windows (cmd)', code: 'set OMNIDIM_API_KEY=your_api_key_here' },
              { label: 'Windows (PowerShell)', code: '$env:OMNIDIM_API_KEY = "your_api_key_here"' },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{item.label}</div>
                <pre style={{ margin: 0, padding: '14px 18px', background: 'var(--bg-secondary)', color: 'var(--teal)', fontSize: 13, fontFamily: '"Fira Code",monospace', overflowX: 'auto' }}>
                  <code>{item.code}</code>
                </pre>
              </div>
            ))}
          </div>
        </section>

        {/* Step-by-step from dashboard */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Create your first agent from the dashboard</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>No code needed — set up a fully working voice agent in under 5 minutes.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <StepCard num={1} title="Sign up and open the dashboard">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                Log in and navigate to <Link to="/dashboard" style={{ color: 'var(--teal)' }}>Voice AI Assistants</Link>. Click <strong style={{ color: 'var(--text-primary)' }}>Create Agent</strong>.
              </p>
            </StepCard>
            <StepCard num={2} title="Configure your conversational flow">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                Add sections, write instructions for each conversation stage, and set a welcome message. See <Link to="/docs/agent" style={{ color: 'var(--teal)' }}>Configure your agent</Link> for details.
              </p>
            </StepCard>
            <StepCard num={3} title="Choose a voice and language">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                Pick from 1000+ voices across 90+ languages. You can also clone your own voice. See <Link to="/docs/client" style={{ color: 'var(--teal)' }}>Voices & Languages</Link>.
              </p>
            </StepCard>
            <StepCard num={4} title="Get a phone number">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                Buy a number from the <Link to="/phone_numbers" style={{ color: 'var(--teal)' }}>Phone Numbers</Link> page, or bring your own via SIP trunking.
              </p>
            </StepCard>
            <StepCard num={5} title="Make a test call">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                Use the dashboard test call feature or dispatch via the API. Check <Link to="/call_logs" style={{ color: 'var(--teal)' }}>Call Logs</Link> for results.
              </p>
            </StepCard>
          </div>
        </section>

        {/* Next steps cards */}
        <section style={{ marginBottom: 60 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>Next steps</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {[
              { emoji: '💬', title: 'Configure your agent', desc: 'Sections, instructions, welcome message, and conversational flow patterns.', to: '/docs/agent' },
              { emoji: '📞', title: 'Calls & Campaigns', desc: 'Dispatch single calls or run bulk outbound campaigns at scale.', to: '/docs/call' },
              { emoji: '⚡', title: 'Integrations', desc: 'HubSpot, Salesforce, Slack, Cal.com, Google Calendar, and custom APIs.', to: '/docs/integrations' },
              { emoji: '🗄️', title: 'Knowledge Base', desc: 'Ground agent responses in your own documents and policies.', to: '/docs/knowledge-base' },
            ].map(card => (
              <Link key={card.title} to={card.to} style={{ textDecoration: 'none' }}>
                <div className="doc-card" style={{ cursor: 'pointer', height: '100%' }}>
                  <div className="doc-card-icon">{card.emoji}</div>
                  <h3>{card.title}</h3>
                  <p>{card.desc}</p>
                  <div className="learn-more">Read more →</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <div className="cta-box animate-me">
          <div className="badge" style={{ margin: '0 auto 20px' }}>Ready to build?</div>
          <h2>Start building your voice AI agent</h2>
          <p>Your dashboard has everything — create agents, get phone numbers, and launch campaigns.</p>
          <Link to="/dashboard" className="btn btn-primary btn-lg">Go to Dashboard →</Link>
        </div>
      </div>
    </>
  );
}
