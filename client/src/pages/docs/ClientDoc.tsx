import { Link } from 'react-router-dom';

// Content sourced from https://docs.omnidim.io/docs/get-started/authentication
// and https://docs.omnidim.io/docs/dashboard-guides/voices-and-languages

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

const namespaces = [
  { name: 'client.agents', description: 'Create, list, update, and delete voice AI agents.' },
  { name: 'client.calls', description: 'Dispatch outbound calls, run bulk campaigns, fetch logs and transcripts.' },
  { name: 'client.numbers', description: 'List and manage provisioned phone numbers.' },
  { name: 'client.files', description: 'Upload and manage knowledge base documents.' },
  { name: 'client.integrations', description: 'List connected integrations and trigger syncs.' },
  { name: 'client.webhooks', description: 'Register and manage webhook endpoints for event delivery.' },
];

export default function ClientDoc() {
  return (
    <>
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="breadcrumb">
          <Link to="/">Home</Link><span>›</span>
          <Link to="/documentation">Documentation</Link><span>›</span>
          <span style={{ color: 'var(--text-primary)' }}>Client & Authentication</span>
        </div>
      </div>

      <div className="doc-hero" style={{ paddingBottom: 40 }}>
        <div className="badge" style={{ margin: '0 auto 16px' }}>🖥️ Client</div>
        <h1 style={{ fontSize: 36, marginBottom: 14 }}>Client & Authentication</h1>
        <p className="subtitle" style={{ maxWidth: 580, margin: '0 auto 24px' }}>
          How to obtain an OmniDimension API key, configure it for the SDK, and use the client across TypeScript and Python.
        </p>
        <div className="doc-actions">
          <Link to="/api_keys" className="btn btn-primary btn-lg">Get API Key →</Link>
          <Link to="/docs/agent" className="btn btn-secondary btn-lg">Configure Agent →</Link>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: 80 }}>

        {/* Get API Key */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Get your API key</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>
            To use the OmniDimension SDK, you need an API key. Generate and manage your keys from the{' '}
            <Link to="/api_keys" style={{ color: 'var(--teal)' }}>API Keys page</Link> in your dashboard.
          </p>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--teal)', borderLeft: '3px solid var(--teal)', borderRadius: 'var(--radius-sm)', padding: '14px 18px', marginBottom: 20 }}>
            <span style={{ fontWeight: 700, color: 'var(--teal)', fontSize: 13 }}>Security tip: </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Always store your API key as an environment variable. Never hardcode it in source files or commit it to version control.
            </span>
          </div>
        </section>

        {/* Environment variable setup */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Setting up your API key</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>Set the key as an environment variable on your system:</p>
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

        {/* SDK initialization */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>SDK initialization</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Once the variable is set, pass it to the SDK constructor. Create a single client instance and reuse it across your app.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <CodeBlock filename="client.ts" lang="TypeScript" code={`import OmniDimension from '@omnidim-ai/sdk';

const client = new OmniDimension({
  apiKey: process.env.OMNIDIM_API_KEY,
});

export default client;`} />
            <CodeBlock filename="client.py" lang="Python" code={`import os
from omnidim import OmniDimension

client = OmniDimension(
    api_key=os.environ.get("OMNIDIM_API_KEY"),
)`} />
          </div>
        </section>

        {/* First request */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Verify with your first request</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            List your agents to confirm the key works. A list response means you're authenticated. An error means the key is wrong or unset.
          </p>
          <CodeBlock filename="verify.ts" lang="TypeScript" code={`const agents = await client.agents.list();
console.log(agents);
// → [ { id: 'agt_xxx', name: 'Support Agent', ... }, ... ]`} />
        </section>

        {/* Client namespaces */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Client namespaces</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            The client exposes namespaced modules for each resource type.
          </p>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              {['Namespace', 'Description'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
              ))}
            </div>
            {namespaces.map((ns, i) => (
              <div key={ns.name} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', padding: '13px 20px', borderBottom: i < namespaces.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', gap: 12 }}>
                <code style={{ fontSize: 13, color: 'var(--teal)', fontFamily: 'monospace' }}>{ns.name}</code>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{ns.description}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Voices & Languages */}
        <section style={{ marginBottom: 60 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Voices & Languages</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>
            OmniDimension supports 1000+ voices across 90+ languages. You can select a voice when creating or updating an agent.
          </p>
          <CodeBlock filename="voice-agent.ts" lang="TypeScript" code={`const agent = await client.agents.create({
  name: 'Multilingual Support Agent',
  voice: 'en-US-female',  // or 'hi-IN-male', 'es-ES-female', etc.
  language: 'en-US',
  systemPrompt: 'You are a helpful support agent...',
});

// Clone your own voice
const clone = await client.voices.clone({
  name: 'My Brand Voice',
  audioFiles: [buffer1, buffer2], // 3–5 min of clean audio
});

const agentWithClone = await client.agents.update(agent.id, {
  voice: clone.id,
});`} />
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { num: '1000+', label: 'Voices' },
              { num: '90+', label: 'Languages' },
              { num: 'Real-time', label: 'TTS & STT' },
              { num: 'Custom', label: 'Voice Cloning' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)', marginBottom: 4 }}>{s.num}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="cta-box animate-me">
          <div className="badge" style={{ margin: '0 auto 20px' }}>Next Steps</div>
          <h2>Configure your first AI Agent</h2>
          <p>With your client set up, move on to building and customising voice AI agents.</p>
          <Link to="/docs/agent" className="btn btn-primary btn-lg">Agent Configuration →</Link>
        </div>
      </div>
    </>
  );
}
